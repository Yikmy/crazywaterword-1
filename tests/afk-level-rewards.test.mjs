import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadProtocol} from '../src/proto.mjs';
import {loadConfig} from '../src/config.mjs';
import {afkLevelRewardsModule as adapter,validateAfkLevelRewardsConfig as validateConfig,validateAfkLevelRewardsParameters as validateParameters,surveyAfkLevelRewards as survey,viewAfkLevelRewards as view,planAfkLevelRewards as plan,verifyAfkLevelReward as verify} from '../src/afk-level-rewards.mjs';
import {assertPaymentAllowed} from '../src/actions.mjs';
import {createOperationService} from '../src/operation-service.mjs';
import {GAMEPLAY_MODULES} from '../src/function-registry.mjs';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {createWorkflowRunner,validateWorkflow} from '../src/workflow.mjs';
const protocol=loadProtocol(),actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const copy=v=>structuredClone(v),wire=(n,b)=>protocol[n].decode(protocol[n].encode(b).finish());
const enabled={enabled:true},parameters={level:2};
const cfg=()=>({tables:{OfflineLvRewardCfg:copy(actual.tables.OfflineLvRewardCfg),ItemCfg:copy(actual.tables.ItemCfg)}});
function fake({codec=true,apply=true,afk={},overrides={}}={}) {
 const state={afk:{level:10,rewardedLevel:0,afkStartTime:100,afkFinishTime:200,...afk},stock:new Map([['抽卡券',7],['unrelated',4]]),resources:[{res:1,amount:100},{res:3,amount:200}],reads:[],writes:[],onRead:null,onWrite:null,receipt:null};
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-afk'},pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
 async request(n,b,r,_timeout,options){
  if(codec)wire(n,b);
  if(n==='DrawAfkLevelRewardRequest'){
   assert.equal(options?.mutate,true);options?.beforeDispatch?.();state.writes.push({name:n,body:copy(b)});
   const row=actual.tables.OfflineLvRewardCfg.data.find(row=>row.level===b.level),[id,num]=row.reward;
   if(apply){state.afk.rewardedLevel=b.level;state.stock.set(id,(state.stock.get(id)??0)+num);}
   await state.onWrite?.();const result=state.receipt??{rewardedLevel:b.level,reward:{asset:[{type:0,id,num}]}};return codec?wire(r,result):copy(result);
  }
  assert.equal(options?.mutate,undefined);state.reads.push(n);await state.onRead?.(n);
  let value=n==='AfkInfoRequest'?{afkInfo:state.afk}:n==='AllItemRequest'?{items:[...state.stock].map(([itemId,num])=>({itemId,num}))}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(overrides,n))value=overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected read '+n);return codec?wire(r,value):copy(value);
 },async sendWatch(){throw Error('no untyped AFK write');}};
 return {client,state};
}
async function ready(input={},extra={}) {const f=fake(input),config=cfg(),options={config,player:{playerId:'9007199254740993',worldId:'17'},parameters,moduleConfig:enabled,...extra},facts=await survey(f.client,protocol,options),candidate=view(facts,options).candidates[0],operation=plan(facts,{...options,selections:candidate?[candidate.actionId]:[]}).actions[0];return {...f,config,options,facts,candidate,operation};}
async function after(f,mutate){const r=await f.client.request(f.operation.action.request,f.operation.action.body,f.operation.action.response,1,{mutate:true});mutate?.(f.state);return {facts:await survey(f.client,protocol,f.options),result:r};}

test('default disabled adapter, strict level parameters, no new runner or execution authority',()=>{
 assert.deepEqual(adapter.defaultConfig,{enabled:false});assert.equal(adapter.execute,undefined);assert.deepEqual(validateParameters({}),{});assert.deepEqual(validateParameters({level:2147483647}),{level:2147483647});
 for(const v of[null,[],{level:0},{level:-1},{level:'2'},{level:2147483648},{level:2,all:true},Object.create({level:2})])assert.throws(()=>validateParameters(v),{code:'INVALID_PARAMETERS'});
 const getter={};Object.defineProperty(getter,'level',{enumerable:true,get(){throw Error('not called');}});assert.throws(()=>validateParameters(getter),{code:'INVALID_PARAMETERS'});
 for(const v of[{enabled:1},{enabled:true,allowPaid:true},Object.create({enabled:true})])assert.throws(()=>validateConfig(v),{code:'INVALID_PARAMETERS'});
});

test('actual local codecs/config bind exact sparse milestone and only its configured reward',async()=>{
 const f=await ready();assert.ok(f.operation,JSON.stringify(f.candidate));assert.deepEqual(f.operation.action,{request:'DrawAfkLevelRewardRequest',response:'DrawAfkLevelRewardResponse',body:{level:2}});assert.deepEqual(f.operation.rewards,[{id:'抽卡券',num:2}]);assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'afk-level-reward',id:'2'}]});assert.deepEqual(f.state.reads.sort(),['AfkInfoRequest','AllItemRequest','AllResourceRequest']);assert.equal(f.state.writes.length,0);
 const next=await ready({afk:{rewardedLevel:2}},{parameters:{}});assert.equal(next.operation.target.level,5);assert.equal(next.config.tables.OfflineLvRewardCfg.data.find(r=>r.level===2).unlockReward.includes('英雄经验'),true);assert.equal(next.operation.rewards.some(r=>r.id==='英雄经验'),false);
 const done=await ready({afk:{level:1000,rewardedLevel:1000}},{parameters:{}});assert.equal(view(done.facts,done.options).candidates.length,0);
});
for(const [name,input,p,reason]of[
 ['level too low',{afk:{level:1}},{level:2},'AFK_LEVEL_TOO_LOW'],['skip prior milestone',{}, {level:5},'AFK_NOT_NEXT_REWARD'],['continuous level is not a reward',{}, {level:3},'AFK_NOT_REWARD_MILESTONE'],['already claimed',{afk:{rewardedLevel:2}},{level:2},'AFK_NOT_NEXT_REWARD']
])test(name,async()=>{const f=await ready(input,{parameters:p});assert.equal(f.candidate.blockedReason,reason);assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);});
for(const key of['level','rewardedLevel','afkStartTime','afkFinishTime'])test('own AFK field required: '+key,async()=>{const body={afkInfo:{level:10,rewardedLevel:0,afkStartTime:100,afkFinishTime:200}};delete body.afkInfo[key];const f=await ready({overrides:{AfkInfoRequest:body}});assert.equal(f.candidate.executable,false);assert.equal(f.operation,undefined);});
for(const query of['AfkInfoRequest','AllItemRequest','AllResourceRequest'])test('read failure remains unknown: '+query,async()=>{const f=await ready({overrides:{[query]:Error('synthetic private failure')}});assert.equal(f.candidate.executable,false);assert.doesNotMatch(JSON.stringify(view(f.facts,f.options)),/private failure/);});

test('receipt and independent net inventory plus exact rewardedLevel confirm together',async()=>{const f=await ready(),a=await after(f);assert.equal(verify(f.operation,f.facts,a.facts,a.result).confirmed,true);});
for(const [name,mutate]of[
 ['wrong milestone',s=>s.afk.rewardedLevel=5],['no marker',s=>s.afk.rewardedLevel=0],['upgrade',s=>s.afk.level++],['interval changed',s=>s.afk.afkStartTime++],['wrong income',s=>s.stock.set('抽卡券',8)],['unrelated item changed',s=>s.stock.set('unrelated',5)],['unrelated resource changed',s=>s.resources[1].amount++]
])test('independent reread rejects '+name,async()=>{const f=await ready(),a=await after(f,mutate);assert.equal(verify(f.operation,f.facts,a.facts,a.result).confirmed,false);});
for(const body of[{}, {rewardedLevel:5,reward:{asset:[{type:0,id:'抽卡券',num:2}]}},{rewardedLevel:2},{rewardedLevel:2,reward:{asset:[]}},{rewardedLevel:2,reward:{asset:[{type:1,id:'抽卡券',num:2}]}},{rewardedLevel:2,reward:{asset:[{type:0,id:'抽卡券',num:1}]}},{rewardedLevel:2,reward:{asset:[{type:0,id:'抽卡券',num:2},{type:0,id:'抽卡券',num:2}]}}])test('bad typed receipt cannot prove success '+JSON.stringify(body),async()=>{const f=await ready(),a=await after(f);assert.equal(verify(f.operation,f.facts,a.facts,wire('DrawAfkLevelRewardResponse',body)).confirmed,false);});

test('private fact authority rejects clones, mutations and later connection or role changes',async()=>{
 for(const change of[f=>f.facts.afk.level++,f=>f.facts.stock.set('抽卡券',99),f=>f.facts.available.push('fake'),f=>f.facts.sourceFacts.afk.provenance.sourceAt++,f=>f.client.factContext.connectionId='new',f=>f.options.player.worldId='18']){const f=await ready();change(f);assert.equal(view(f.facts,f.options).candidates[0].executable,false);}
 const f=await ready();assert.equal(view(copy(f.facts),f.options).candidates[0].executable,false);
 const original=Date.now;try{const time=original();Date.now=()=>time+31000;assert.equal(view(f.facts,f.options).candidates[0].executable,false);}finally{Date.now=original;}
});
test('configuration drift, duplicate levels and unsupported rewards block exact operation',async()=>{
 for(const change of[c=>c.tables.OfflineLvRewardCfg.data.push(copy(c.tables.OfflineLvRewardCfg.data[0])),c=>c.tables.OfflineLvRewardCfg.data[1].reward=['unknown',1],c=>c.tables.OfflineLvRewardCfg.data[1].reward=['抽卡券',0],c=>delete c.tables.ItemCfg]){const f=await ready();change(f.config);const facts=await survey(f.client,protocol,f.options);assert.equal(view(facts,f.options).candidates[0].executable,false);}
 const f=await ready();f.config.tables.OfflineLvRewardCfg.revision=2;assert.equal(view(f.facts,f.options).candidates[0].executable,false);
});
test('D6 permits exact zero cost and rejects extra fields, implicit costs, invalid level or debit',()=>{
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'DrawAfkLevelRewardRequest',body:{level:2},costs:[]}));
 for(const v of[{body:{level:2}},{body:{level:2,buy:false},costs:[]},{body:{level:0},costs:[]},{body:{level:'2'},costs:[]},{body:{level:2},costs:[{id:'GOLD',num:1}]},{body:{level:2},costs:[{id:'RUBY',num:1}]}])assert.throws(()=>assertPaymentAllowed({request:'DrawAfkLevelRewardRequest',...v}));
});
function serviceFixture(t,{apply=true,file=null}={}) {
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-afk-')):null;file??=path.join(dir,'history.json');const durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(copy(row));return durable.put(row);}},config=cfg(),f=fake({apply});
 const session={id:'synthetic-A',client:f.client,player:{playerId:'9007199254740993',worldId:'17'},generation:3,connectionId:'offline-afk',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:enabled})},getConfig:()=>config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.request.bind(f.client);f.client.request=async(n,...args)=>{if(n==='DrawAfkLevelRewardRequest')f.state.durableBeforeWrite=copy(journal.at(-1));return send(n,...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 async function makePlan(){const read=await service.surveyModule(session,'afk-level-rewards',parameters),row=read.view.candidates[0];assert.ok(row.executable,row.blockedReason);return service.plan(session,{module:'afk-level-rewards',mode:'Manual',parameters,selections:[row.actionId]});}
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(row=>row.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function run(p){const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};}
 return {...f,session,service,config,durable,history,journal,file,makePlan,authorize,run};
}
test('shared Service persists exact entity and intent before typed send and verifies durable success',async t=>{
 const f=serviceFixture(t),p=await f.makePlan();assert.equal(p.actions[0].action,undefined);assert.deepEqual(p.resourceBudget,[]);const {record,permit}=await f.run(p);assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record));assert.equal(f.state.writes.length,1);assert.equal(f.state.durableBeforeWrite.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.durableBeforeWrite.runBudget.reserved.uids,[{type:'afk-level-reward',id:'2'}]);assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,'SUCCESS');assert.throws(()=>f.service.execute(f.session,permit));
});
test('typed receipt without state effect remains durable UNKNOWN and blocks restart replay',async t=>{
 const f=serviceFixture(t,{apply:false}),{record}=await f.run(await f.makePlan());assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);const restarted=serviceFixture(t,{file:f.file});assert.equal(restarted.service.status(f.session.id).blocked,true);await assert.rejects(restarted.makePlan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);
});
test('disk failure and cancellation before dispatch send zero; cancellation after dispatch stays UNKNOWN',async t=>{
 for(const mode of['disk','cancel','after']){const f=serviceFixture(t),p=await f.makePlan(),permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else if(mode==='disk'){const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}else f.state.onWrite=()=>f.session.abort.abort();try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,mode==='after'?1:0);if(mode==='after')assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),true);}
});
test('approval invalidated by account, generation, connection, role and configuration changes',async t=>{
 for(const change of[f=>f.session.id='B',f=>f.session.generation++,f=>f.session.connectionId='new',f=>f.session.player.worldId='18',f=>f.config.tables.OfflineLvRewardCfg.revision=2]){const f=serviceFixture(t),p=await f.makePlan();change(f);assert.throws(()=>f.authorize(p));assert.equal(f.state.writes.length,0);}
});
test('registered Workflow uses exact existing batch and pauses until explicit approval and verification',async t=>{
 const f=serviceFixture(t),read=await f.service.surveyModule(f.session,'afk-level-rewards',parameters),selection=read.view.candidates[0].actionId;
 const graph={version:1,id:'synthetic-afk-workflow',name:'Synthetic AFK',budget:{resources:[],quotas:[],uids:[{type:'afk-level-reward',id:'2'}]},nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'afk-level-rewards',parameters},{id:'a',type:'ACTION',module:'afk-level-rewards',parameters,selection},{id:'v',type:'VERIFY',module:'afk-level-rewards'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,o)=>f.service.claimWorkflow(f.session,runId,o),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.state.writes.length,1);assert.equal(f.durable.list(f.session.id)[0].workflowId,result.runId);
});


test('missing typed protocol, disabled config, and nonselected or multiple actions cannot plan',async()=>{
 const f=await ready();for(const name of['DrawAfkLevelRewardRequest','DrawAfkLevelRewardResponse']){const missing={...protocol};delete missing[name];const facts=await survey(f.client,missing,f.options);assert.equal(view(facts,f.options).candidates[0].blockedReason,'PROTOCOL_UNAVAILABLE');}
 assert.equal(view(f.facts,{...f.options,moduleConfig:{enabled:false}}).candidates[0].blockedReason,'AFK_LEVEL_REWARDS_DISABLED');assert.deepEqual(plan(f.facts,f.options).actions,[]);assert.deepEqual(plan(f.facts,{...f.options,selections:['wrong']}).actions,[]);assert.throws(()=>plan(f.facts,{...f.options,selections:[f.candidate.actionId,f.candidate.actionId]}),{code:'INVALID_PARAMETERS'});
});
test('cancelled or replaced survey cannot mint authority, nor can a slow sibling renew old AFK observations',async()=>{
 for(const mode of['abort','replace']){const f=fake(),stop=new AbortController();f.state.onRead=async n=>{if(n!=='AfkInfoRequest')return;if(mode==='abort')stop.abort();else f.client.factContext.generation++;};await assert.rejects(survey(f.client,protocol,{config:cfg(),player:{playerId:'1',worldId:'1'},parameters,signal:stop.signal}),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);}
 const original=Date.now;let now=original();try{Date.now=()=>now;const f=fake(),request=f.client.request.bind(f.client);f.client.request=async(n,...args)=>{if(n==='AllResourceRequest'){await new Promise(resolve=>setImmediate(resolve));now+=31000;}return request(n,...args);};const options={config:cfg(),player:{playerId:'1',worldId:'1'},parameters,moduleConfig:enabled},facts=await survey(f.client,protocol,options);assert.equal(view(facts,options).candidates[0].executable,false);}finally{Date.now=original;}
});
test('canonical verification rejects tampered request, expected income and reservation claims',async()=>{
 const f=await ready(),a=await after(f);for(const change of[o=>o.action.body.level=5,o=>o.expectedState.inventory=[],o=>o.budgetClaims.uids=[],o=>o.costs=[{id:'GOLD',num:1}],o=>o.rewards=[{id:'抽卡券',num:100}]]){const operation=copy(f.operation);change(operation);assert.equal(verify(operation,f.facts,a.facts,a.result).confirmed,false);}
});
test('wrong receipt after actual effect remains UNKNOWN with reserved entity in durable history',async t=>{
 const f=serviceFixture(t);f.state.receipt={rewardedLevel:5,reward:{asset:[{type:0,id:'抽卡券',num:2}]}};const {record}=await f.run(await f.makePlan());assert.equal(f.state.afk.rewardedLevel,2);assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.deepEqual(record.runBudget.reserved.uids,[{type:'afk-level-reward',id:'2'}]);assert.equal(f.state.writes.length,1);
});

function refuseAfk(f){f.state.onWrite=()=>{throw Object.assign(Error('synthetic definite AFK refusal'),{code:'REJECTED'});};}
function reconnectAfk(f){f.session.generation=f.client.factContext.generation=4;f.session.connectionId=f.client.factContext.connectionId='replacement-afk';}
test('W19 AFK refusal survives reconnect and restart without rewriting original evidence',async t=>{
 const f=serviceFixture(t,{apply:false});refuseAfk(f);const {record}=await f.run(await f.makePlan());assert.equal(record.finalStatus,'REJECTED');
 const memoryFile=f.file+'.memory.json',historyBytes=fs.readFileSync(f.file,'utf8'),memoryBytes=fs.readFileSync(memoryFile,'utf8');
 reconnectAfk(f);await assert.rejects(f.makePlan(),{code:'REJECTION_MEMORY_ACTIVE'});
 const next=serviceFixture(t,{file:f.file});reconnectAfk(next);await assert.rejects(next.makePlan(),{code:'REJECTION_MEMORY_ACTIVE'});
 assert.equal(f.state.writes.length,1);assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),historyBytes);assert.equal(fs.readFileSync(memoryFile,'utf8'),memoryBytes);
});
for(const changed of ['inventory','player','world'])test('W19 AFK new '+changed+' permits fresh planning while original role refusal remains',async t=>{
 const f=serviceFixture(t,{apply:false});refuseAfk(f);await f.run(await f.makePlan());const next=serviceFixture(t,{file:f.file});reconnectAfk(next);
 if(changed==='inventory')next.state.stock.set('抽卡券',8);if(changed==='player')next.session.player.playerId='9007199254740994';if(changed==='world')next.session.player.worldId='18';
 assert.equal((await next.makePlan()).actions.length,1);assert.equal(next.state.writes.length,0);
 if(changed==='player'||changed==='world'){next.session.player={playerId:'9007199254740993',worldId:'17'};await assert.rejects(next.makePlan(),{code:'REJECTION_MEMORY_ACTIVE'});}
 assert.equal(next.service.executionMemory(next.session.id).events.length,1);
});
for(const missing of ['expectedState','budgetClaims'])test('W19 AFK legacy refusal missing '+missing+' stays blocked',async t=>{
 const f=serviceFixture(t,{apply:false});refuseAfk(f);await f.run(await f.makePlan());const saved=f.durable.list(f.session.id)[0];delete saved.actions[0][missing];f.durable.put(saved);
 const next=serviceFixture(t,{file:f.file});reconnectAfk(next);next.state.stock.set('抽卡券',8);await assert.rejects(next.makePlan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
});
test('W19 AFK UNKNOWN cannot expire on reconnect or changed business facts',async t=>{
 const f=serviceFixture(t,{apply:false});await f.run(await f.makePlan());const bytes=fs.readFileSync(f.file,'utf8');const next=serviceFixture(t,{file:f.file});reconnectAfk(next);next.state.stock.set('抽卡券',8);await assert.rejects(next.makePlan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
});

test('W19 AFK rejection learned after authorization stops before any second dispatch',async t=>{
 const f=serviceFixture(t,{apply:false});refuseAfk(f);const next=serviceFixture(t,{file:f.file});reconnectAfk(next);const p=await next.makePlan(),permit=next.authorize(p);await f.run(await f.makePlan());
 next.service.execute(next.session,permit);await next.service.settle(next.session.id);assert.equal(next.state.writes.length,0);const r=next.durable.list(next.session.id).find(r=>r.planSummary?.batchId===p.batchId);assert.equal(r.finalStatus,'NOT_EXECUTED');assert.equal(r.actions[0].dispatched,false);
});
test('W19 AFK unified Loop skips remembered refusal without authorization or retry',async t=>{
 const f=serviceFixture(t,{apply:false});refuseAfk(f);await f.run(await f.makePlan());const next=serviceFixture(t,{file:f.file});reconnectAfk(next);
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),g=compileUnifiedExecution({entry:'loop',world:[{module:'afk-level-rewards',parameters}],rounds:2,budget:{resources:[],quotas:[],uids:[{type:'afk-level-reward',id:'2'}]}},{modules:GAMEPLAY_MODULES}).graph;
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:next.service,claim:(_id,runId,o)=>next.service.claimWorkflow(next.session,runId,o),getSession:()=>next.session});t.after(()=>runner.stop());const r=await runner.start(next.session.id,g);assert.equal(r.status,'COMPLETED');assert.equal(r.trace.filter(row=>row.result==='BLOCKED_REJECTION_MEMORY').length,2);assert.equal(r.plan,null);assert.equal(next.state.writes.length,0);assert.equal(next.service.executionMemory(next.session.id).events.length,1);
});

const {compileUnifiedExecution}=await import('../src/loop.mjs');
const afkBudget=levels=>({resources:[],quotas:[],uids:levels.map(level=>({type:'afk-level-reward',id:String(level)}))});
const afkTasksGraph=(levels=[2],entry='tasks',budget=afkBudget(levels))=>compileUnifiedExecution({entry,tasks:levels.map(level=>({kind:'afk-level-reward',level})),budget},{modules:GAMEPLAY_MODULES}).graph;
function afkRunner(t,f){const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,o)=>f.service.claimWorkflow(f.session,runId,o),getSession:id=>id===f.session.id?f.session:null});t.after(async()=>{runner.stop();await runner.settle();});return runner;}
for(const entry of ['tasks','loop'])test('unified '+entry+' AFK milestones each require a new native plan and independent typed settlement',async t=>{
 const f=serviceFixture(t),runner=afkRunner(t,f),stock=new Map(f.state.stock),interval={level:f.state.afk.level,afkStartTime:f.state.afk.afkStartTime,afkFinishTime:f.state.afk.afkFinishTime};let paused=await runner.start(f.session.id,afkTasksGraph([2,5],entry));assert.equal(paused.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);
 const firstBatch=paused.plan.batchId;await f.run(paused.plan);paused=await runner.resume();assert.equal(paused.status,'AWAITING_AUTHORIZATION');assert.notEqual(paused.plan.batchId,firstBatch);assert.equal(f.state.writes.length,1);assert.equal(paused.plan.actions[0].target.level,5);await f.run(paused.plan);const final=await runner.resume();assert.equal(final.status,'COMPLETED');assert.deepEqual(f.state.writes.map(w=>w.body),[{level:2},{level:5}]);
 const records=f.durable.list(f.session.id);assert.equal(records.length,2);for(const record of records){assert.equal(record.finalStatus,'SUCCESS');assert.equal(record.actions[0].verification.status,'CONFIRMED');assert.equal(record.workflowId,final.runId);}assert.deepEqual(new Set(records.map(r=>r.workflowNodeId)),new Set(['tasks-0-1','tasks-1-1']));assert.deepEqual(records.find(r=>r.planSummary.batchId!==firstBatch).runBudget.reserved,afkBudget([2,5]));assert.equal(f.state.afk.rewardedLevel,5);assert.deepEqual({level:f.state.afk.level,afkStartTime:f.state.afk.afkStartTime,afkFinishTime:f.state.afk.afkFinishTime},interval);
 const earned=[2,5].reduce((n,level)=>n+actual.tables.OfflineLvRewardCfg.data.find(row=>row.level===level).reward[1],0);assert.equal(f.state.stock.get('抽卡券'),stock.get('抽卡券')+earned);assert.equal(f.state.stock.get('unrelated'),stock.get('unrelated'));
});
for(const badReceipt of [false,true])test('unified AFK '+(badReceipt?'contradictory receipt':'missing state effect')+' stays UNKNOWN and stops later milestones across restart',async t=>{
 const f=serviceFixture(t,{apply:badReceipt}),runner=afkRunner(t,f);if(badReceipt)f.state.receipt={rewardedLevel:5,reward:{asset:[{type:0,id:'抽卡券',num:2}]}};const paused=await runner.start(f.session.id,afkTasksGraph([2,5]));await f.run(paused.plan);assert.equal((await runner.resume()).status,'UNKNOWN');assert.equal(f.state.writes.length,1);const record=f.durable.list(f.session.id)[0];assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.workflowNodeId,'tasks-0-1');assert.deepEqual(record.runBudget.reserved,afkBudget([2]));const next=serviceFixture(t,{file:f.file});reconnectAfk(next);await assert.rejects(next.makePlan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
});
test('unified AFK skips only the exact unsupported milestone and retains the next independent eligible declaration',async t=>{
 const f=serviceFixture(t),runner=afkRunner(t,f),paused=await runner.start(f.session.id,afkTasksGraph([3,2]));assert.equal(paused.status,'AWAITING_AUTHORIZATION');assert.equal(paused.plan.actions[0].target.level,2);assert.ok(paused.trace.some(r=>r.nodeId==='tasks-0-1'&&r.result==='BLOCKED_NO_EXECUTABLE_CANDIDATE'));assert.equal(f.state.writes.length,0);await f.run(paused.plan);assert.equal((await runner.resume()).status,'COMPLETED');assert.equal(f.state.writes.length,1);
});
test('unified AFK missing parent UID and persistence failure both send zero requests',async t=>{
 for(const mode of ['parent','disk']){const f=serviceFixture(t),runner=afkRunner(t,f),paused=await runner.start(f.session.id,afkTasksGraph([2],'tasks',mode==='parent'?afkBudget([]):afkBudget([2])));assert.equal(paused.status,'AWAITING_AUTHORIZATION');if(mode==='disk'){const put=f.history.put;f.history.put=record=>{if(record.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic unavailable disk');return put(record);};}try{await f.run(paused.plan);}catch{}assert.equal(f.state.writes.length,0);assert.notEqual(f.service.status(f.session.id).finalStatus,'SUCCESS');}
});
test('unified Tasks AFK refusal survives native reconnect and restart without reauthorization',async t=>{
 const f=serviceFixture(t,{apply:false}),runner=afkRunner(t,f);refuseAfk(f);const paused=await runner.start(f.session.id,afkTasksGraph());await f.run(paused.plan);assert.equal(f.durable.list(f.session.id)[0].finalStatus,'REJECTED');assert.notEqual((await runner.resume()).status,'AWAITING_AUTHORIZATION');const next=serviceFixture(t,{file:f.file});reconnectAfk(next);await assert.rejects(next.makePlan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
});
test('unified Tasks AFK cancellation ignores a late receipt and keeps the following milestone unexecuted',async t=>{
 const f=serviceFixture(t),runner=afkRunner(t,f),paused=await runner.start(f.session.id,afkTasksGraph([2,5]));let release;f.state.onWrite=()=>new Promise(resolve=>release=resolve);f.service.execute(f.session,f.authorize(paused.plan));for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.service.stop(f.session.id);release();await f.service.settle(f.session.id);assert.equal((await runner.resume()).status,'UNKNOWN');assert.equal(f.state.writes.length,1);assert.deepEqual(f.durable.list(f.session.id)[0].runBudget.reserved,afkBudget([2]));
});
