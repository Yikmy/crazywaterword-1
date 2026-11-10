import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cw-gameplay-api-'));
process.env.CW_DATA_DIR=root;process.env.CW_CONFIG_PACK=path.join(root,'unavailable-config.json');
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
const {createExecutionHistory}=await import('../src/execution-history.mjs');
const {createModuleSettings}=await import('../src/gameplay-settings.mjs');
const {formationModule}=await import('../src/formation.mjs');
const account=id=>({id,label:'synthetic-'+id,url:'wss://example.invalid/ws',login:{eworldParams:{openId:id,token:'synthetic-gameplay-token',sign:'synthetic-gameplay-sign',timestamp:1}}});
const initial=()=>({presetId:1,petUid:'9007199254740993',heroPositions:[{heroId:'tank',pos:{x:1,y:3}}]});
const cfg={tables:{HeroCfg:{data:[{id:'tank',career:'坦克'}]},FormationHeroNumCfg:{data:[{heroNum:1,mainlineStage:0}]},FormationTypePositionCfg:{data:[{id:1,position:[1,3]},{id:2,position:[5,5]}]}}};
const protocol=Object.fromEntries(['GetFormationRequest','GetFormationResponse','MyFormationPresetRequest','MyFormationPresetResponse','AllHeroRequest','AllHeroResponse','SaveFormationRequest','SaveFormationResponse','ChallengeStageRequest','ChallengeStageResponse'].map(name=>[name,{}]));
async function harness({unconfirmed=false,includeStage=false}={}){saveStore({version:1,activeId:'A',accounts:[account('A'),account('B')]});let clients=0,collections=0;const requests=[];const modules={formation:formationModule,...(includeStage?{stage:{id:'stage',defaultConfig:{enabled:false}}}:{})};const history=createExecutionHistory({file:path.join(root,'execution-'+Math.random()+'.json')});const moduleSettings=createModuleSettings({file:path.join(root,'settings-'+Math.random()+'.json'),modules});
 const app=createConsole({port:0,protocol,tracePath:path.join(root,'trace-'+Math.random()+'.log'),clientFactory(){clients++;throw Error('Real client forbidden');},collect(){collections++;throw Error('Full collector forbidden');},operationOptions:{history,...(includeStage?{}:{modules}),moduleSettings,getConfig:()=>cfg,loadRules:()=>({config:{version:1,enabled:true,rules:[]}})}});await app.listen();const origin='http://127.0.0.1:'+app.server.address().port;let csrf;
 const call=(route='/api/gameplay?module=formation',{id='A',body,method=body===undefined?'GET':'POST',headers={},authorized=true}={})=>new Promise((resolve,reject)=>{const url=new URL(route,origin);if(id!==null)url.searchParams.set('account',id);const req=http.request(url,{method,headers:{connection:'close','content-type':'application/json',...(authorized?{origin,...(csrf?{'x-cw-csrf':csrf}:{})}:{}),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>{const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:res.statusCode,data,text});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 const ready=id=>{let current=initial();const client=new EventEmitter();Object.assign(client,{id,connected:true,pending:[],watchers:[],uncertainWrites:new Set(),stop(){this.connected=false;},markUnverifiedWrite(name){this.uncertainWrites.add(name);},confirmWatchedWrite(name){this.uncertainWrites.delete(name);},async request(name,body,response,timeout,options){requests.push({id,name,body:structuredClone(body),response,options});if(name==='GetFormationRequest')return {formation:structuredClone(current)};if(name==='MyFormationPresetRequest')return {ids:[2]};if(name==='AllHeroRequest')return {heroes:[{heroId:'tank'}]};if(name==='SaveFormationRequest'){if(!unconfirmed)current=structuredClone(body.formation);return {formation:structuredClone(body.formation)};}if(name==='ChallengeStageRequest')return {initialData:{mainlineStage:body.stage,battleType:1},stats:{isLeftWin:true}};throw Error('Unexpected synthetic request '+name);}});const session={id,client,player:{playerId:'synthetic-player-'+id,mainlineStage:41},state:'READY',generation:1,abort:new AbortController(),busy:null,loop:{running:false,stop:{}},log:[],snapshot:{ok:{},failed:{}},snapshotStale:false};app.sessions.set(id,session);return session;};
 const enable=async()=>{await call();return call('/api/gameplay/config',{body:{module:'formation',config:{enabled:true,mainlineEnabled:true}}});};
 const survey=()=>call('/api/gameplay/survey',{body:{module:'formation',parameters:{presetId:2}}});
 const plan=async()=>{const read=await survey();assert.equal(read.status,200);const candidate=read.data.view.candidates[0];assert.equal(candidate.executable,true);return call('/api/operations/plan',{body:{module:'formation',mode:'Manual',selections:[candidate.actionId],parameters:{presetId:2}}});};
 const approve=p=>call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true}});
 return {...app,call,ready,enable,survey,plan,approve,requests,counts:()=>({clients,collections})};}
async function waitForWorkflow(app,expected){let data;for(let i=0;i<30;i++){data=(await app.call('/api/workflows')).data;if(data.status.status===expected)return data;if(['FAILED','UNKNOWN','CANCELLED'].includes(data.status.status))throw Error('Unexpected workflow '+JSON.stringify(data.status));}throw Error('Workflow did not reach '+expected+': '+JSON.stringify(data.status));}
const graph=(id,nodes,edges)=>({version:1,id,name:id,nodes,edges});
const stoppedGraph=id=>graph(id,[{id:'start',type:'START'},{id:'stop',type:'STOP'}],[{from:'start',to:'stop'}]);
test('gameplay and workflow cached routes require exact accounts and never create a Session or game connection',async()=>{const app=await harness();try{for(const route of ['/api/gameplay?module=formation','/api/workflows'])for(const id of [null,'synthetic-A','missing'])assert.equal((await app.call(route,{id})).status,id===null?400:404);const read=await app.call();assert.equal(read.status,200);assert.equal(read.data.config.enabled,false);assert.equal(read.data.view,null);assert.ok(read.data.csrfToken);assert.equal((await app.call('/api/workflows')).data.status.status,'IDLE');assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal((await app.survey()).data.code,'NOT_CONNECTED');}finally{await app.close();}});
test('local per-account config and workflow save/simulate work without connecting and cannot accept transport or credentials',async()=>{const app=await harness();try{await app.call();assert.equal((await app.enable()).status,200);assert.equal((await app.call(undefined,{id:'B'})).data.config.enabled,false);assert.equal((await app.call('/api/gameplay/config',{body:{module:'formation',config:{enabled:true,request:'Anything'}}})).status,400);const g=stoppedGraph('local-only');assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const read=await app.call('/api/workflows');assert.ok(read.data.graphs.some(v=>v.id===g.id));assert.equal((await app.call('/api/workflows',{id:'B'})).data.graphs.some(v=>v.id===g.id),false);const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.equal(sim.data.runtimeCreated,false);const bad=graph('bad',[{id:'s',type:'START'},{id:'x',type:'SURVEY',module:'formation',parameters:{request:'SaveFormationRequest'}},{id:'e',type:'STOP'}],[{from:'s',to:'x'},{from:'x',to:'e'}]);assert.equal((await app.call('/api/workflows/save',{body:{graph:bad}})).status,400);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);}finally{await app.close();}});
test('all gameplay writes require same-origin CSRF and strict JSON before reading or mutating',async()=>{const app=await harness();try{app.ready('A');await app.call();for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'forged'}},{headers:{origin:'https://example.invalid'}},{headers:{host:'evil.invalid'}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{'content-type':'text/plain'}}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'formation',parameters:{}},...extra})).status,403);for(const route of ['/api/gameplay/config','/api/workflows/save','/api/workflows/start','/api/workflows/stop'])assert.equal((await app.call(route,{body:{},authorized:false})).status,403);assert.equal(app.requests.length,0);for(const extra of [{request:'AnyRequest'},{body:{}},{allowPaid:true}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'formation',parameters:{},...extra}})).status,400);}finally{await app.close();}});
test('real Formation adapter runs only after exact plan authorization and confirms full fresh state',async()=>{const app=await harness();try{app.ready('A');await app.enable();const p=await app.plan();assert.equal(p.status,200);assert.equal(p.data.actions[0].action,undefined);assert.deepEqual(p.data.resourceBudget,[]);assert.equal((await app.call('/api/operations/execute',{body:{batchId:p.data.batchId,confirm:true}})).status,400);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);const permit=await app.approve(p.data);assert.equal(permit.status,200);const run=await app.call('/api/operations/execute',{body:permit.data});assert.equal(run.status,200);await app.operations.settle('A');const writes=app.requests.filter(r=>r.name==='SaveFormationRequest');assert.equal(writes.length,1);assert.equal(writes[0].body.formation.petUid,'9007199254740993');const history=await app.call('/api/operations/history');assert.equal(history.data.runs[0].finalStatus,'SUCCESS');assert.equal(history.data.runs[0].actions[0].verification.status,'CONFIRMED');assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.equal((await app.call('/api/gameplay?module=formation',{id:'B'})).data.view,null);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}});
test('a typed Formation reply without matching authoritative reread is UNKNOWN and blocks another batch',async()=>{const app=await harness({unconfirmed:true});try{const session=app.ready('A');await app.enable();const p=await app.plan(),permit=await app.approve(p.data);await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');const read=await app.call();assert.equal(read.data.status.finalStatus,'UNKNOWN');assert.equal(read.data.status.blocked,true);assert.equal(session.client.uncertainWrites.has('SaveFormationRequest'),true);assert.equal((await app.survey()).data.code,'RESPONSE_UNCERTAIN');assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);}finally{await app.close();}});
test('workflow ACTION claims the account, exposes only a plan, and advances solely after confirmed same-batch history',async()=>{const app=await harness();try{const session=app.ready('A');await app.enable();const surveyed=await app.survey(),actionId=surveyed.data.view.candidates[0].actionId;const g=graph('authorized-flow',[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:actionId},{id:'v',type:'VERIFY',module:'formation'},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]);const start=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(start.status,200);const waitingPlan=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);assert.match(session.busy,/workflow:/);assert.equal((await app.survey()).data.code,'ACCOUNT_BUSY');const waiting=await app.call('/api/workflows/resume',{body:{}});assert.equal(waiting.data.status.status,'AWAITING_AUTHORIZATION');const p=waitingPlan.status.plan,permit=await app.approve(p);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const complete=await app.call('/api/workflows/resume',{body:{}});assert.equal(complete.status,200);await waitForWorkflow(app,'COMPLETED');assert.equal(session.busy,null);assert.equal(session.workflowOwner,null);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);}finally{await app.close();}});
test('STOP at pending ACTION releases Workflow claim and invalidates any earlier authorization',async()=>{const app=await harness();try{const session=app.ready('A');await app.enable();const surveyed=await app.survey(),actionId=surveyed.data.view.candidates[0].actionId;const g=graph('stop-before-write',[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:actionId},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'e'}]);const start=await app.call('/api/workflows/start',{body:{graph:g}});const waitingPlan=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');const permit=await app.approve(waitingPlan.status.plan);const stop=await app.call('/api/workflows/stop',{body:{}});assert.equal(stop.data.status.status,'CANCELLED');assert.equal(session.busy,null);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).data.code,'STALE_PLAN');assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);}finally{await app.close();}});
test('Workflow WAIT holds the same-account claim and stop cancels it without a game write',async()=>{const app=await harness();let start;try{const session=app.ready('A');await app.call('/api/workflows');const g=graph('wait-stop',[{id:'s',type:'START'},{id:'w',type:'WAIT',durationMs:60000},{id:'e',type:'STOP'}],[{from:'s',to:'w'},{from:'w',to:'e'}]);start=app.call('/api/workflows/start',{body:{graph:g}});let status;for(let i=0;i<20;i++){status=(await app.call('/api/workflows')).data.status;if(status.status==='WAITING')break;}assert.equal(status.status,'WAITING');assert.match(session.busy,/workflow:/);assert.equal((await app.survey()).data.code,'ACCOUNT_BUSY');const stop=await app.call('/api/workflows/stop',{body:{}});assert.equal(stop.data.status.status,'CANCELLED');await start;assert.equal(session.busy,null);assert.equal(app.requests.length,0);}finally{if(start)await app.call('/api/workflows/stop',{body:{}});await app.close();}});




test('registered finite Stage Function uses the server original Runner through the existing exact batch authorization',async()=>{const app=await harness({includeStage:true});try{const session=app.ready('A');const read=await app.call('/api/gameplay?module=stage');assert.equal(read.status,200);assert.equal(read.data.config.enabled,false);assert.equal((await app.call('/api/gameplay/config',{body:{module:'stage',config:{enabled:true}}})).status,200);const parameters={config:{enabled:true,retryDelaySeconds:10,maxAttempts:2,maxStage:null}},surveyed=await app.call('/api/gameplay/survey',{body:{module:'stage',parameters}});assert.equal(surveyed.status,200);const action=surveyed.data.view.candidates[0];assert.equal(action.executable,true);const p=await app.call('/api/operations/plan',{body:{module:'stage',mode:'Manual',parameters,selections:[action.actionId]}});assert.equal(p.status,200);assert.deepEqual(p.data.resourceBudget,[]);assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,0);const permit=await app.approve(p.data);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const history=(await app.call('/api/operations/history')).data.runs[0];assert.equal(history.finalStatus,'SUCCESS');assert.equal(history.actions[0].verification.status,'CONFIRMED');assert.deepEqual(app.requests.filter(r=>r.name==='ChallengeStageRequest').map(r=>r.body.stage),[41,42]);const runner=session.stageRunner;assert.ok(runner);assert.equal(runner.getStatus().nextStage,43);assert.equal(session.stageClient,session.client);assert.equal(app.counts().clients,0);}finally{await app.close();}});


test('disconnect cancels a running Workflow and clears its owner before the same Session reconnects', async () => {
  const app = await harness();
  try {
    const session = app.ready('A'), oldClient = session.client, generation = session.generation;
    await app.call('/api/workflows');
    const waiting = graph('disconnect-wait', [{ id: 's', type: 'START' }, { id: 'w', type: 'WAIT', durationMs: 60000 }, { id: 'e', type: 'STOP' }], [{ from: 's', to: 'w' }, { from: 'w', to: 'e' }]);
    assert.equal((await app.call('/api/workflows/start', { body: { graph: waiting } })).status, 200);
    const previous = await waitForWorkflow(app, 'WAITING');
    assert.equal(session.workflowOwner, previous.status.runId);
    const disconnected = await app.call('/api/disconnect', { body: {} });
    assert.equal(disconnected.status, 200);
    await waitForWorkflow(app, 'CANCELLED');
    assert.equal(app.sessions.get('A'), session);
    assert.equal(session.generation, generation + 1);
    assert.equal(session.workflowOwner, null, 'generation changes must synchronously invalidate the previous Workflow owner');
    assert.equal(session.busy, null);
    assert.equal(oldClient.connected, false);

    // Restore a synthetic transport onto the same Session object; no game client is created.
    const replacement = app.ready('A');
    Object.assign(session, { client: replacement.client, player: replacement.player, abort: new AbortController(), state: 'READY' });
    app.sessions.set('A', session);
    const restarted = await app.call('/api/workflows/start', { body: { graph: stoppedGraph('after-disconnect') } });
    assert.equal(restarted.status, 200);
    const complete = await waitForWorkflow(app, 'COMPLETED');
    assert.notEqual(complete.status.runId, previous.status.runId);
    assert.equal(session.workflowOwner, null);
    assert.equal(session.busy, null);
    assert.equal(app.requests.length, 0);
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});



for (const change of [
  { name: 'account becomes busy', code: 'ACCOUNT_BUSY', apply: session => { session.busy = 'synthetic-other-task'; }, restore: session => { session.busy = null; } },
  { name: 'Session generation changes', code: 'CANCELLED', apply: session => { session.generation++; }, restore: () => {} },
]) test('legacy Stage start rechecks safety after formation await when ' + change.name, async () => {
  const app = await harness({ includeStage: true });
  let unblock, reached;
  const gate = new Promise(resolve => { unblock = resolve; }), entered = new Promise(resolve => { reached = resolve; });
  const original = app.operations.assertFormationReady;
  try {
    const session = app.ready('A');
    const body = { confirm: true, config: { enabled: true, retryDelaySeconds: 10, maxAttempts: 1, maxStage: null } };
    app.operations.assertFormationReady = () => { reached(); return gate; };
    const pending = app.call('/api/stages/start', { body });
    await Promise.race([entered, pending.then(result => { throw Error('Stage rejected before formation preflight: ' + JSON.stringify(result)); })]);
    change.apply(session);
    unblock(null);
    const rejected = await pending;
    assert.equal(rejected.status, 409);
    assert.equal(rejected.data.code, change.code);
    assert.equal(app.requests.filter(row => row.name === 'ChallengeStageRequest').length, 0);
    change.restore(session);
    app.operations.assertFormationReady = original;
    const started = await app.call('/api/stages/start', { body });
    assert.equal(started.status, 200);
    await session.stageRunner.completion;
    assert.deepEqual(app.requests.filter(row => row.name === 'ChallengeStageRequest').map(row => row.body.stage), [41]);
    assert.equal(session.stageRunner.getStatus().stopKind, 'COMPLETED');
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { unblock(null); app.operations.assertFormationReady = original; await app.close(); }
});

test('explicitly reapplying the complete current formation establishes proof for a bounded Stage Function', async () => {
  const app = await harness({ includeStage: true });
  try {
    const session = app.ready('A');
    assert.equal((await app.enable()).status, 200);
    const parameters = { presetId: 1, heroPositions: initial().heroPositions };
    const surveyed = await app.call('/api/gameplay/survey', { body: { module: 'formation', parameters } });
    assert.equal(surveyed.status, 200);
    const candidate = surveyed.data.view.candidates[0];
    assert.equal(candidate.executable, true);
    const planned = await app.call('/api/operations/plan', { body: { module: 'formation', mode: 'Manual', parameters, selections: [candidate.actionId] } });
    assert.equal(planned.status, 200);
    const approved = await app.approve(planned.data);
    assert.equal((await app.call('/api/operations/execute', { body: approved.data })).status, 200);
    await app.operations.settle('A');
    let history = (await app.call('/api/operations/history')).data.runs;
    const formationRun = history.find(row => row.planSummary.batchId === planned.data.batchId);
    assert.equal(formationRun.finalStatus, 'SUCCESS');
    assert.equal(formationRun.actions[0].verification.status, 'CONFIRMED');
    const saved = app.requests.filter(row => row.name === 'SaveFormationRequest');
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].body.formation, initial());

    assert.equal((await app.call('/api/gameplay/config', { body: { module: 'stage', config: { enabled: true } } })).status, 200);
    const stageParameters = { config: { enabled: true, retryDelaySeconds: 10, maxAttempts: 1, maxStage: null, formation: { enabled: true, presetId: 1 } } };
    const stageSurvey = await app.call('/api/gameplay/survey', { body: { module: 'stage', parameters: stageParameters } });
    assert.equal(stageSurvey.status, 200);
    const stageAction = stageSurvey.data.view.candidates[0];
    assert.equal(stageAction.executable, true);
    const stagePlan = await app.call('/api/operations/plan', { body: { module: 'stage', mode: 'Manual', parameters: stageParameters, selections: [stageAction.actionId] } });
    assert.equal(stagePlan.status, 200);
    const stagePermit = await app.approve(stagePlan.data);
    assert.equal((await app.call('/api/operations/execute', { body: stagePermit.data })).status, 200);
    await app.operations.settle('A');
    history = (await app.call('/api/operations/history')).data.runs;
    const stageRun = history.find(row => row.planSummary.batchId === stagePlan.data.batchId);
    assert.equal(stageRun.finalStatus, 'SUCCESS');
    assert.equal(stageRun.actions[0].verification.status, 'CONFIRMED');
    assert.deepEqual(app.requests.filter(row => row.name === 'ChallengeStageRequest').map(row => row.body.stage), [41]);
    assert.equal(session.stageRunner.getStatus().nextStage, 42);
    assert.equal(session.stageClient, session.client);
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});
