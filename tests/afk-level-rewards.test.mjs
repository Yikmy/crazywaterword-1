import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadProtocol} from '../src/proto.mjs';
import {loadConfig} from '../src/config.mjs';
import {afkLevelRewardsModule as adapter,validateAfkLevelRewardsConfig as validateConfig,validateAfkLevelRewardsParameters as validateParameters,surveyAfkLevelRewards as survey,viewAfkLevelRewards as view,planAfkLevelRewards as plan,verifyAfkLevelReward as verify,validateAfkUpgradePreparation,prepareAfkUpgradeWorkflow} from '../src/afk-level-rewards.mjs';
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
  let value=n==='AfkInfoRequest'?{afkInfo:state.afk,...(Object.hasOwn(state,'clickGoldInfo')?{clickGoldInfo:state.clickGoldInfo}:{})}:n==='AllItemRequest'?{items:[...state.stock].map(([itemId,num])=>({itemId,num}))}:n==='AllResourceRequest'?{list:state.resources}:null;
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
function serviceFixture(t,{apply=true,file=null,income=false,upgrade=false}={}) {
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-afk-')):null;file??=path.join(dir,'history.json');const durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(copy(row));return durable.put(row);}},config=income||upgrade?incomeCfg():cfg(),f=upgrade?upgradeFake({apply}):income?incomeFake({apply}):fake({apply}),activeParameters=income?incomeParameters(f.state):parameters;
 const session={id:'synthetic-A',client:f.client,player:{playerId:'9007199254740993',worldId:'17',...(upgrade?{mainlineStage:1000}:{})},generation:3,connectionId:'offline-afk',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:enabled})},getConfig:()=>config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.request.bind(f.client);f.client.request=async(n,...args)=>{if(n==='DrawAfkLevelRewardRequest'||n==='DrawAfkRewardRequest'||n==='UpgradeAfkLevelRequest')f.state.durableBeforeWrite=copy(journal.at(-1));return send(n,...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 async function makePlan(p=activeParameters){const read=await service.surveyModule(session,'afk-level-rewards',p),row=read.view.candidates[0];assert.ok(row.executable,row.blockedReason);return service.plan(session,{module:'afk-level-rewards',mode:'Manual',parameters:p,selections:[row.actionId]});}
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(row=>row.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function run(p){const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};}
 return {...f,session,service,config,durable,history,journal,file,makePlan,authorize,run,parameters:activeParameters};
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

// Ordinary period income reuses this file's shared Service/Workflow fixtures.
function incomeCfg(){return {tables:Object.fromEntries(['OfflineCfg','ItemCfg','HeroBadgeCfg'].map(n=>[n,copy(actual.tables[n])]))};}
const incomeParameters=state=>({action:'income',level:state.afk.level,afkStartTime:state.afk.afkStartTime,afkFinishTime:state.afk.afkFinishTime});
function incomeFake({apply=true,codec=true}={}) {
 const f=fake({codec,apply:false,afk:{level:2,rewardedLevel:0,afkStartTime:100,afkFinishTime:500}}),{client,state}=f,request=client.request.bind(client);
 Object.assign(state,{serverMs:200000,uncertaintyMs:0,clockStatus:'TRUSTED',badges:[],heroes:[{heroId:'A',level:1,star:0,power:1,skillLevels:[1],badges:[]}],replyChange:null});
 client.gameClock={read:()=>({status:state.clockStatus,reliable:state.clockStatus==='TRUSTED',source:'PingResponse.serverTimestamp',accountId:client.factContext.accountId,generation:client.factContext.generation,nowMs:state.serverMs,earliestMs:state.serverMs-state.uncertaintyMs,latestMs:state.serverMs+state.uncertaintyMs})};
 client.request=async(n,b,r,timeout,options)=>{
  if(n==='BadgesRequest'||n==='AllHeroRequest'){state.reads.push(n);await state.onRead?.(n);const value=n==='BadgesRequest'?{badge:copy(state.badges)}:{heroes:copy(state.heroes)};return codec?wire(r,value):value;}
  if(n!=='DrawAfkRewardRequest')return request(n,b,r,timeout,options);
  if(codec)wire(n,b);assert.equal(options?.mutate,true);options?.beforeDispatch?.();state.writes.push({name:n,body:copy(b)});
  const start=Math.floor(state.serverMs/1000),finish=start+state.afk.afkFinishTime-state.afk.afkStartTime;
  const badge={uid:'9007199254741011',badgeId:'绿法师徽章',star:0,attr:{attr:1,value:1.5,rating:2}};
  const result={afkStartTime:start,afkFinishTime:finish,reward:{assetPackage:{asset:[{type:0,id:'GOLD',num:25},{type:0,id:'英雄经验',num:12}]},badge:[badge]}};
  if(apply){state.afk.afkStartTime=start;state.afk.afkFinishTime=finish;state.resources.find(r=>r.res===3).amount+=25;state.stock.set('英雄经验',(state.stock.get('英雄经验')??0)+12);state.badges.push({...copy(badge),level:1,exp:0});}
  await state.onWrite?.();state.replyChange?.(result);return codec?wire(r,result):result;
 };
 return f;
}
async function incomeReady(input={}){const f=incomeFake(input),config=incomeCfg(),parameters=incomeParameters(f.state),options={config,player:{playerId:'9007199254740993',worldId:'17'},parameters,moduleConfig:enabled},facts=await survey(f.client,protocol,options),candidate=view(facts,options).candidates[0],operation=plan(facts,{...options,selections:[candidate.actionId]}).actions[0];return {...f,config,parameters,options,facts,candidate,operation};}

test('ordinary AFK income uses explicit period, real codec, trusted time and interval-fenced independent reads',async()=>{
 const f=await incomeReady();assert.ok(f.operation,JSON.stringify(f.candidate));assert.deepEqual(f.operation.action,{request:'DrawAfkRewardRequest',response:'DrawAfkRewardResponse',body:{}});assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'afk-income-interval',id:'2:100:500'}]});assert.equal(f.operation.rewards,null);assert.equal(view(f.facts,f.options).income.amount,null);assert.deepEqual(f.state.reads.sort(),['AfkInfoRequest','AfkInfoRequest','AllHeroRequest','AllItemRequest','AllResourceRequest','BadgesRequest']);assert.equal(f.state.writes.length,0);const a=await after(f),v=verify(f.operation,f.facts,a.facts,a.result);assert.equal(v.confirmed,true,JSON.stringify(v));assert.equal(v.responseEvidence.received.badges[0].uid,'9007199254741011');assert.equal(f.state.afk.level,2);assert.equal(f.state.afk.rewardedLevel,0);
});

for(const [ms,uncertainty,eligible]of [[160000,0,false],[160999,0,false],[161000,0,true],[161000,1,false],[499000,0,true],[700000,0,true]])test('ordinary AFK native 61-second threshold '+ms+'/'+uncertainty,async()=>{
 const f=await incomeReady();f.state.serverMs=ms;f.state.uncertaintyMs=uncertainty;const facts=await survey(f.client,protocol,f.options),row=view(facts,f.options).candidates[0];assert.equal(row.executable,eligible,row.blockedReason);assert.equal(f.state.writes.length,0);
});

for(const change of [s=>s.afk.afkStartTime++,s=>s.afk.afkFinishTime++,s=>s.afk.level++,s=>s.clockStatus='UNKNOWN'])test('ordinary AFK changed interval or untrusted clock never prepares a write '+change,async()=>{
 const f=await incomeReady();change(f.state);const facts=await survey(f.client,protocol,f.options);assert.equal(view(facts,f.options).candidates[0].executable,false);assert.equal(f.state.writes.length,0);
});

test('ordinary AFK rejects incomplete target, forged authority, missing ownership and changed config',async()=>{
 for(const p of[{action:'income'},{action:'income',level:2,afkStartTime:0,afkFinishTime:500},{action:'income',level:2,afkStartTime:100,afkFinishTime:100},{action:'income',level:2,afkStartTime:100,afkFinishTime:500,useAdvCard:false}])assert.throws(()=>validateParameters(p));
 const f=await incomeReady();assert.equal(view(copy(f.facts),f.options).candidates[0].executable,false);f.state.badges=[{uid:'7',badgeId:'绿法师徽章',star:0}];const facts=await survey(f.client,protocol,f.options);assert.equal(view(facts,f.options).candidates[0].executable,false);f.config.tables.OfflineCfg.revision=2;assert.equal(view(f.facts,f.options).candidates[0].blockedReason,'AFK_INCOME_CONFIG_UNKNOWN');
});

for(const [label,change]of [
 ['missing interval',r=>delete r.afkStartTime],['wrong start',r=>r.afkStartTime--],['wrong duration',r=>r.afkFinishTime++],['wrong credit',r=>r.reward.assetPackage.asset[0].num++],['missing badge',r=>r.reward.badge=[]],['wrong uid',r=>r.reward.badge[0].uid='9007199254741012'],['wrong attr',r=>r.reward.badge[0].attr.value=99],['unread instance',r=>r.reward.equips=['unknown']],['duplicate credit',r=>r.reward.assetPackage.asset.push({...r.reward.assetPackage.asset[0]})]
])test('ordinary AFK cannot confirm '+label,async()=>{
 const f=await incomeReady();f.state.replyChange=change;const a=await after(f);assert.equal(verify(f.operation,f.facts,a.facts,a.result).confirmed,false);assert.equal(f.state.writes.length,1);
});

for(const [label,change]of [['level',s=>s.afk.level++],['milestone marker',s=>s.afk.rewardedLevel=2],['unrelated stock',s=>s.stock.set('unrelated',99)],['hero',s=>s.heroes[0].level++],['extra badge',s=>s.badges.push({...copy(s.badges[0]),uid:'9007199254741012'})]])test('ordinary AFK full reread excludes unrelated changes '+label,async()=>{
 const f=await incomeReady(),a=await after(f,change);assert.equal(verify(f.operation,f.facts,a.facts,a.result).confirmed,false);
});

test('ordinary AFK D6 permits only explicit empty normal request and zero costs',()=>{
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'DrawAfkRewardRequest',body:{},costs:[]}));for(const a of [{body:{}},{body:{useAdvCard:false},costs:[]},{body:{useAdvCard:true},costs:[]},{body:{},costs:[{id:'GOLD',num:1}]},{body:{stageId:1},costs:[]}])assert.throws(()=>assertPaymentAllowed({request:'DrawAfkRewardRequest',...a}));
});

test('ordinary AFK shared Service records interval reservation and durable intent before exact normal write',async t=>{
 const f=serviceFixture(t,{income:true}),p=await f.makePlan(),{record}=await f.run(p);assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record));assert.equal(f.state.writes.length,1);assert.equal(f.state.durableBeforeWrite.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.durableBeforeWrite.runBudget.reserved.uids,[{type:'afk-income-interval',id:'2:100:500'}]);assert.equal(f.state.afk.level,2);
});

test('ordinary AFK missing effect stays UNKNOWN across disk restart and cannot replay',async t=>{
 const f=serviceFixture(t,{income:true,apply:false}),{record}=await f.run(await f.makePlan());assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);const restarted=serviceFixture(t,{income:true,file:f.file});assert.equal(restarted.service.status(restarted.session.id).blocked,true);await assert.rejects(restarted.makePlan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);
});

for(const mode of ['disk','cancel','after'])test('ordinary AFK '+mode+' cancellation or durability preserves original send boundary',async t=>{
 const f=serviceFixture(t,{income:true}),p=await f.makePlan(),permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else if(mode==='disk'){const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}else f.state.onWrite=()=>f.session.abort.abort();try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,mode==='after'?1:0);if(mode==='after')assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),true);
});

for(const [label,change]of [['account',f=>f.session.id='B'],['generation',f=>f.session.generation++],['connection',f=>f.session.connectionId='other'],['player',f=>f.session.player.playerId='2'],['world',f=>f.session.player.worldId='2'],['config',f=>f.config.tables.OfflineCfg.revision=2]])test('ordinary AFK plan/approval excludes changed '+label,async t=>{
 const f=serviceFixture(t,{income:true}),p=await f.makePlan();change(f);assert.throws(()=>f.authorize(p));assert.equal(f.state.writes.length,0);
});


test('ordinary AFK original Workflow awaits exact interval authorization then independently verifies one settlement',async t=>{
 const f=serviceFixture(t,{income:true}),read=await f.service.surveyModule(f.session,'afk-level-rewards',f.parameters),selection=read.view.candidates[0].actionId;
 const graph={version:1,id:'ordinary-afk-workflow',name:'Ordinary AFK',budget:{resources:[],quotas:[],uids:[{type:'afk-income-interval',id:'2:100:500'}]},nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'afk-level-rewards',parameters:f.parameters},{id:'a',type:'ACTION',module:'afk-level-rewards',parameters:f.parameters,selection},{id:'v',type:'VERIFY',module:'afk-level-rewards'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,o)=>f.service.claimWorkflow(f.session,runId,o),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.state.writes.length,1);assert.equal(f.durable.list(f.session.id)[0].workflowId,result.runId);
});

test('ordinary AFK refusal survives reconnect and disk restart and time does not clear it',async t=>{
 const f=serviceFixture(t,{income:true,apply:false});refuseAfk(f);assert.equal((await f.run(await f.makePlan())).record.finalStatus,'REJECTED');const bytes=fs.readFileSync(f.file,'utf8');reconnectAfk(f);f.state.serverMs+=100000;await assert.rejects(f.makePlan(),{code:'REJECTION_MEMORY_ACTIVE'});const next=serviceFixture(t,{income:true,file:f.file});reconnectAfk(next);await assert.rejects(next.makePlan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
});

test('ordinary AFK late survey cannot cross account generation connection player or world',async()=>{
 for(const change of [f=>f.client.factContext.accountId='B',f=>f.client.factContext.generation++,f=>f.client.factContext.connectionId='other',f=>f.options.player.playerId='2',f=>f.options.player.worldId='2']){const f=await incomeReady();f.state.onRead=async n=>{if(n==='AfkInfoRequest')change(f);};await assert.rejects(survey(f.client,protocol,f.options),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);}
});

for(const mode of ['reset','read-failure'])test('ordinary AFK interval fence rejects '+mode+' during inventory reads',async()=>{
 const f=await incomeReady();f.state.onRead=async n=>{if(n==='AllItemRequest'){await new Promise(setImmediate);if(mode==='reset'){f.state.afk.afkStartTime=150;f.state.afk.afkFinishTime=550;}else{const read=f.client.request.bind(f.client);f.client.request=(name,...args)=>{if(name==='AfkInfoRequest')throw Error('synthetic fence failure');return read(name,...args);};}}};
 const facts=await survey(f.client,protocol,f.options);assert.ok(facts.notes.includes(mode==='reset'?'AFK_INTERVAL_CHANGED_DURING_SURVEY':'AFK_INTERVAL_FENCE_UNKNOWN'));assert.equal(view(facts,f.options).candidates[0].executable,false);assert.equal(plan(facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);
});

for(const entry of ['tasks','dailies','loop'])for(const outcome of ['success','unknown','refused'])test('unified ordinary AFK '+entry+' shared execution preserves '+outcome+' and history',async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{income:true,apply:outcome==='success'});if(outcome==='refused')refuseAfk(f);
 const intent={entry,budget:{resources:[],quotas:[],uids:[{type:'afk-income-interval',id:'2:100:500'}]},...(entry==='dailies'?{dailies:[{taskId:1004,action:'perform',parameters:f.parameters}]}:{tasks:[{kind:'afk-income',level:2,afkStartTime:100,afkFinishTime:500}]} )},graph=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES}).graph,runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,o)=>f.service.claimWorkflow(f.session,runId,o),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());const pending=await runner.start(f.session.id,graph);assert.equal(pending.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const {record}=await f.run(pending.plan),done=await runner.resume();assert.equal(record.finalStatus,outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED');assert.equal(done.status,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED');assert.equal(f.state.writes.length,1);assert.equal(f.durable.list(f.session.id)[0].workflowId,done.runId);assert.equal(f.state.afk.level,2);assert.equal(f.state.afk.rewardedLevel,0);assert.deepEqual(f.durable.list('synthetic-B'),[]);
 if(outcome==='unknown'){const next=serviceFixture(t,{income:true,file:f.file});await assert.rejects(next.makePlan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});

// Upgrade remains in the existing AFK Function and requires its durable income predecessor.
function upgradeFake({apply=true,codec=true}={}) {
 const f=incomeFake({apply:true,codec}),{state,client}=f,base=client.request.bind(client);state.stock.set('挂机徽章',1000);state.upgradeApply=apply;state.upgradeReceipt=null;state.onUpgrade=null;
 client.request=async(n,b,r,timeout,options)=>{
  if(n!=='UpgradeAfkLevelRequest')return base(n,b,r,timeout,options);
  if(codec)wire(n,b);assert.equal(options?.mutate,true);options?.beforeDispatch?.();state.writes.push({name:n,body:copy(b)});
  let cost=0;for(let level=state.afk.level+1;level<=state.afk.level+b.level;level++)cost+=actual.tables.OfflineCfg.data.find(row=>row.level===level).consume[1];
  const result={level:state.afk.level+b.level,afkStartTime:Math.floor(state.serverMs/1000),afkFinishTime:Math.floor(state.serverMs/1000)+450};
  if(state.upgradeApply){state.stock.set('挂机徽章',state.stock.get('挂机徽章')-cost);Object.assign(state.afk,result);}
  await state.onUpgrade?.();return codec?wire(r,state.upgradeReceipt??result):copy(state.upgradeReceipt??result);
 };return f;
}
const upgradeParameters=(f,levels=1)=>({action:'upgrade',level:f.state.afk.level,levels});
async function upgradeService(t,input={}){const f=serviceFixture(t,{income:true,upgrade:true,...input});const settled=await f.run(await f.makePlan());assert.equal(settled.record.finalStatus,'SUCCESS');return {...f,incomeRecord:settled.record};}
async function upgradeReady(levels=1){const f=upgradeFake(),config=incomeCfg(),player={playerId:'9007199254740993',worldId:'17',mainlineStage:1000},context={...f.client.factContext,playerId:player.playerId,worldId:player.worldId};
 const income=incomeParameters(f.state),io={config,player,parameters:income,moduleConfig:enabled},before=await survey(f.client,protocol,io),op=plan(before,{...io,selections:[view(before,io).candidates[0].actionId]}).actions[0],result=await f.client.request(op.action.request,op.action.body,op.action.response,1,{mutate:true}),after=await survey(f.client,protocol,io),verified=verify(op,before,after,result);assert.equal(verified.confirmed,true);
 const record={accountId:context.accountId,runId:'offline-verified-income',executionContext:context,finalStatus:'SUCCESS',planSummary:{batchId:'offline-batch'},actions:[{...copy(op),result:'SUCCESS',requestStatus:'SUCCESS',verification:{status:'CONFIRMED'},dispatched:true,unresolvedWrite:false,beforeInventoryReliable:true,afterInventoryReliable:true,afterState:verified.afterState,responseEvidence:verified.responseEvidence}]},records=[record];
 const parameters=upgradeParameters(f,levels),options={config,player,parameters,moduleConfig:enabled,readIncomeHistory:()=>records},facts=await survey(f.client,protocol,options),candidate=view(facts,options).candidates[0],operation=plan(facts,{...options,selections:[candidate.actionId]}).actions[0];return {...f,config,records,parameters,options,facts,candidate,operation};
}
test('AFK upgrade strict parameters do not accept target-as-increment, implicit amounts or supplied income proof',()=>{
 for(const levels of [1,5,10])assert.deepEqual(validateParameters({action:'upgrade',level:2,levels}),{action:'upgrade',level:2,levels});
 for(const p of [{action:'upgrade',level:2},{action:'upgrade',level:2,levels:2},{action:'upgrade',level:2,levels:'5'},{action:'upgrade',level:2147483647,levels:1},{action:'upgrade',level:2,levels:1,incomeSettlement:{}},{action:'upgrade',level:2,levels:1,afkStartTime:200}])assert.throws(()=>validateParameters(p),{code:'INVALID_PARAMETERS'});
});
for(const levels of [1,5,10])test('AFK upgrade exact real codec increment '+levels+' sums target costs and verifies independent debit and server interval',async()=>{
 const f=await upgradeReady(levels);assert.ok(f.operation,JSON.stringify(f.candidate));assert.deepEqual(f.operation.action,{request:'UpgradeAfkLevelRequest',response:'UpgradeAfkLevelResponse',body:{level:levels}});
 const amount=actual.tables.OfflineCfg.data.filter(r=>r.level>2&&r.level<=2+levels).reduce((n,r)=>n+r.consume[1],0);assert.deepEqual(f.operation.costs,[{id:'挂机徽章',num:amount}]);assert.deepEqual(f.operation.budgetClaims.resources,f.operation.costs);assert.equal(f.operation.target.incomeSettlement.runId,'offline-verified-income');assert.equal(f.operation.expectedState.level,2+levels);
 const a=await after(f),v=verify(f.operation,f.facts,a.facts,a.result);assert.equal(v.confirmed,true,JSON.stringify(v));assert.equal(f.state.afk.level,2+levels);assert.equal(f.state.afk.afkFinishTime-f.state.afk.afkStartTime,450);assert.equal(f.state.writes.filter(r=>r.name==='UpgradeAfkLevelRequest').length,1);
});
for(const [name,change,reason]of[
 ['no history',f=>f.options.readIncomeHistory=undefined,'AFK_CONFIRMED_INCOME_REQUIRED'],
 ['history read failure',f=>f.options.readIncomeHistory=()=>{throw Error('private disk failure');},'AFK_CONFIRMED_INCOME_REQUIRED'],
 ['unconfirmed receipt',f=>f.records[0].actions[0].verification.status='UNCONFIRMED','AFK_CONFIRMED_INCOME_REQUIRED'],
 ['UNKNOWN income',f=>f.records[0].finalStatus='UNKNOWN','AFK_CONFIRMED_INCOME_REQUIRED'],
 ['missing dispatch evidence',f=>delete f.records[0].actions[0].dispatched,'AFK_CONFIRMED_INCOME_REQUIRED'],
 ['missing receipt interval',f=>delete f.records[0].actions[0].responseEvidence.interval,'AFK_CONFIRMED_INCOME_REQUIRED'],
 ['wrong reward beforeState',f=>f.records[0].actions[0].beforeState.afk.level++,'AFK_CONFIRMED_INCOME_REQUIRED'],
 ['old connection',f=>f.records[0].executionContext.connectionId='old','AFK_CONFIRMED_INCOME_REQUIRED'],
 ['other account',f=>f.records[0].accountId='B','AFK_CONFIRMED_INCOME_REQUIRED'],
 ['other world',f=>f.records[0].executionContext.worldId='18','AFK_CONFIRMED_INCOME_REQUIRED'],
 ['old generation',f=>f.records[0].executionContext.generation--,'AFK_CONFIRMED_INCOME_REQUIRED'],
 ['changed period',f=>f.state.afk.afkStartTime++,'AFK_CONFIRMED_INCOME_REQUIRED'],
 ['mainline gate',f=>f.options.player.mainlineStage=1,'AFK_MAINLINE_LOCKED'],
 ['missing mainline',f=>delete f.options.player.mainlineStage,'AFK_AUTHORITY_UNKNOWN'],
 ['no materials',f=>f.state.stock.set('挂机徽章',0),'AFK_UPGRADE_MATERIAL_SHORTAGE'],
 ['clock missing',f=>f.state.clockStatus='UNKNOWN','AFK_TRUSTED_CLOCK_UNKNOWN'],
 ['income is due again',f=>f.state.serverMs+=61000,'AFK_INCOME_REQUIRED_AGAIN'],
 ['uncertain clock reaches due boundary',f=>{f.state.serverMs+=60000;f.state.uncertaintyMs=1000;},'AFK_INCOME_REQUIRED_AGAIN'],
 ['cost missing',f=>delete f.config.tables.OfflineCfg.data.find(r=>r.level===3).consume,'AFK_UPGRADE_CONFIG_OR_MAINLINE_UNKNOWN'],
 ['cost guessed as currency',f=>f.config.tables.OfflineCfg.data.find(r=>r.level===3).consume=['GOLD',1],'AFK_UPGRADE_CONFIG_OR_MAINLINE_UNKNOWN'],
 ['skipped intermediate row',f=>f.config.tables.OfflineCfg.data=f.config.tables.OfflineCfg.data.filter(r=>r.level!==3),'AFK_UPGRADE_CONFIG_OR_MAINLINE_UNKNOWN'],
 ['duplicate level',f=>f.config.tables.OfflineCfg.data.push(copy(f.config.tables.OfflineCfg.data[2])),'AFK_UPGRADE_CONFIG_OR_MAINLINE_UNKNOWN']
])test('AFK upgrade blocks '+name,async()=>{const f=await upgradeReady();change(f);const facts=await survey(f.client,protocol,f.options),row=view(facts,f.options).candidates[0];assert.equal(row.blockedReason,reason);assert.equal(plan(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,1);assert.doesNotMatch(JSON.stringify(row),/private disk/);});
for(const [name,change]of[
 ['history lost',f=>f.records.length=0],['mainline changed',f=>f.options.player.mainlineStage++],['mutated proof',f=>f.facts.incomeHistory[0].runId='forged'],['new role',f=>f.options.player.playerId='9007199254740994'],['reconnected',f=>f.client.factContext.connectionId='new']
])test('AFK upgrade private authority invalidates '+name,async()=>{const f=await upgradeReady();change(f);assert.equal(view(f.facts,f.options).candidates[0].executable,false);assert.equal(plan(f.facts,{...f.options,selections:[f.candidate.actionId]}).actions.length,0);});
for(const [name,mutate]of[
 ['wrong cost',s=>s.stock.set('挂机徽章',1000)],['extra debit',s=>s.stock.set('挂机徽章',900)],['unrelated stock',s=>s.stock.set('unrelated',99)],['currency changed',s=>s.resources[0].amount++],['wrong level',s=>s.afk.level++],['reward marker changed',s=>s.afk.rewardedLevel++],['interval mismatch',s=>s.afk.afkFinishTime++],['click gold changed',s=>s.clickGoldInfo={}]
])test('AFK upgrade rejects independent '+name,async()=>{const f=await upgradeReady();const a=await after(f,mutate);assert.equal(verify(f.operation,f.facts,a.facts,a.result).confirmed,false);});
for(const body of [{},{level:3},{level:1,afkStartTime:200,afkFinishTime:650},{level:3,afkStartTime:0,afkFinishTime:650},{level:3,afkStartTime:200,afkFinishTime:199}])test('AFK upgrade rejects incomplete or contradictory typed receipt '+JSON.stringify(body),async()=>{const f=await upgradeReady(),a=await after(f);assert.equal(verify(f.operation,f.facts,a.facts,wire('UpgradeAfkLevelResponse',body)).confirmed,false);});
test('AFK upgrade D6 requires exact owned badge debit and bounded increment',()=>{
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'UpgradeAfkLevelRequest',body:{level:5},costs:[{id:'挂机徽章',num:10}]}));
 for(const row of [{body:{level:1}},{body:{level:1},costs:[]},{body:{level:2},costs:[{id:'挂机徽章',num:1}]},{body:{level:1,useAdvCard:false},costs:[{id:'挂机徽章',num:1}]},{body:{level:1},costs:[{id:'GOLD',num:1}]},{body:{level:1},costs:[{id:'挂机徽章',num:0}]},{body:{level:1},costs:[{id:'RUBY',num:1}]}])assert.throws(()=>assertPaymentAllowed({request:'UpgradeAfkLevelRequest',...row}));
});
test('AFK upgrade Service uses real durable predecessor and reserves exact cost and entity before write',async t=>{
 const f=await upgradeService(t),p=await f.makePlan(upgradeParameters(f,5));assert.equal(p.actions[0].actionType,'UPGRADE');assert.equal(p.actions[0].action,undefined);assert.equal(p.actions[0].target.incomeSettlement.runId,f.incomeRecord.runId);assert.deepEqual(p.resourceBudget,[{id:'挂机徽章',num:5}]);
 const {record}=await f.run(p);assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record));assert.equal(f.state.writes.length,2);assert.equal(f.state.durableBeforeWrite.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.durableBeforeWrite.runBudget.reserved.resources,[{id:'挂机徽章',num:5}]);assert.equal(f.state.durableBeforeWrite.runBudget.reserved.uids[0].type,'afk-upgrade');assert.equal(record.actions[0].responseEvidence.level,7);assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,'SUCCESS');assert.equal(Object.hasOwn(p,'readIncomeHistory'),false);
});
for(const mode of ['missing-effect','bad-receipt','late-cancel'])test('AFK upgrade '+mode+' remains UNKNOWN and restart forbids replay',async t=>{
 const f=await upgradeService(t);if(mode==='missing-effect')f.state.upgradeApply=false;if(mode==='bad-receipt')f.state.upgradeReceipt={level:99,afkStartTime:200,afkFinishTime:650};if(mode==='late-cancel')f.state.onUpgrade=()=>f.session.abort.abort();const {record}=await f.run(await f.makePlan(upgradeParameters(f)));assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(record.runBudget.reserved.uids[0].type,'afk-upgrade');const next=serviceFixture(t,{income:true,upgrade:true,file:f.file});await assert.rejects(next.makePlan(upgradeParameters(next)),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
});
for(const mode of ['disk','history','clock','mainline','account','generation','connection','role','world'])test('AFK upgrade zero dispatch after '+mode+' changes at authorization or durable intent',async t=>{
 const f=await upgradeService(t),p=await f.makePlan(upgradeParameters(f)),permit=f.authorize(p),put=f.history.put;
 f.history.put=row=>{const isUpgrade=row.actions?.some(a=>a.actionType==='UPGRADE'&&a.stages?.at(-1)?.stage==='DISPATCH_INTENT');if(isUpgrade){if(mode==='disk')throw Error('synthetic disk unavailable');if(mode==='history')f.history.list=()=>[];if(mode==='clock')f.state.serverMs+=61000;if(mode==='mainline')f.session.player.mainlineStage++;if(mode==='account')f.session.id='B';if(mode==='generation')f.session.generation++;if(mode==='connection')f.client.factContext.connectionId='new';if(mode==='role')f.session.player.playerId='9007199254740994';if(mode==='world')f.session.player.worldId='18';}return put(row);};
 try{f.service.execute(f.session,permit);await f.service.settle('synthetic-A');}catch{}assert.equal(f.state.writes.length,1);assert.notEqual(f.durable.list('synthetic-A')[0].finalStatus,'SUCCESS');
});
test('AFK upgrade rejection is shared persistent memory rather than permission to repeat',async t=>{
 const f=await upgradeService(t),base=f.client.request.bind(f.client);f.client.request=async(n,b,r,...args)=>{if(n!=='UpgradeAfkLevelRequest')return base(n,b,r,...args);args.at(-1)?.beforeDispatch?.();f.state.writes.push({name:n,body:copy(b)});throw Object.assign(Error('synthetic rejected'),{code:'REJECTED'});};const p=await f.makePlan(upgradeParameters(f));const {record}=await f.run(p);assert.equal(record.finalStatus,'REJECTED');await assert.rejects(f.makePlan(upgradeParameters(f)),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.state.writes.length,2);
});

for(const mode of ['success','short-budget','missing-entity'])test('AFK upgrade original finite Workflow respects '+mode+' without income expanding parent authorization',async t=>{
 const f=await upgradeService(t),parameters=upgradeParameters(f,5),read=await f.service.surveyModule(f.session,'afk-level-rewards',parameters),row=read.view.candidates[0];assert.equal(row.executable,true);
 const budget={resources:mode==='short-budget'?[]:[{id:'挂机徽章',num:5}],quotas:[],uids:mode==='missing-entity'?[]:[{type:'afk-upgrade',id:'2:200:600:5'}]},graph={version:1,id:'explicit-afk-upgrade',name:'Explicit upgrade',budget,nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'afk-level-rewards',parameters},{id:'a',type:'ACTION',module:'afk-level-rewards',parameters,selection:row.actionId},{id:'v',type:'VERIFY',module:'afk-level-rewards'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,o)=>f.service.claimWorkflow(f.session,runId,o),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());let r=await runner.start(f.session.id,graph);assert.equal(r.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,1);if(mode==='success'){await f.run(r.plan);r=await runner.resume();assert.equal(r.status,'COMPLETED');assert.equal(f.durable.list(f.session.id)[0].workflowId,r.runId);}else{await assert.rejects(f.run(r.plan),{code:'RUN_BUDGET_INVALID'});assert.equal(f.service.status(f.session.id).running,false);const denied=f.durable.list(f.session.id)[0];assert.equal(denied.finalStatus,'NOT_EXECUTED');assert.equal(denied.actions[0].requestStatus,'NOT_DISPATCHED');assert.equal(denied.actions[0].dispatchEvidence.state,'NOT_DISPATCHED');assert.equal(denied.workflowId,r.runId);}assert.equal(f.state.writes.length,mode==='success'?2:1);
});
test('AFK upgrade after-dispatch history failure preserves UNKNOWN and blocks future execution',async t=>{
 const f=await upgradeService(t),list=f.history.list;f.state.onUpgrade=()=>{f.history.list=()=>{throw Error('synthetic history unavailable');};};const p=await f.makePlan(upgradeParameters(f)),{record}=await f.run(p);assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].dispatched,true);assert.equal(record.actions[0].unresolvedWrite,true);f.history.list=list;assert.equal(f.service.status(f.session.id).blocked,true);assert.equal(f.state.writes.length,2);const next=serviceFixture(t,{income:true,upgrade:true,file:f.file});await assert.rejects(next.makePlan(upgradeParameters(next)),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
});
test('AFK upgrade authoritative receipt may preserve interval without assuming a reset duration formula',async()=>{
 const f=await upgradeReady(),old=copy(f.state.afk),r=await f.client.request(f.operation.action.request,f.operation.action.body,f.operation.action.response,1,{mutate:true});f.state.afk.afkStartTime=old.afkStartTime;f.state.afk.afkFinishTime=old.afkFinishTime;r.afkStartTime=old.afkStartTime;r.afkFinishTime=old.afkFinishTime;const a=await survey(f.client,protocol,f.options);assert.equal(verify(f.operation,f.facts,a,r).confirmed,true);
});
for(const field of ['costs','target','expectedState','action','budgetClaims'])test('AFK upgrade verification rejects forged '+field,async()=>{const f=await upgradeReady(),a=await after(f),forged=copy(f.operation);forged[field]=field==='costs'?[]:null;assert.equal(verify(forged,f.facts,a.facts,a.result).confirmed,false);});
test('AFK upgrade cannot use cloned authority or renew source age from durable income',async()=>{
 const f=await upgradeReady();assert.equal(view(copy(f.facts),f.options).candidates[0].executable,false);const old=Date.now;try{const time=old();Date.now=()=>time+31000;assert.equal(view(f.facts,f.options).candidates[0].executable,false);}finally{Date.now=old;}
});

test('AFK upgrade sums different intermediate costs rather than multiplying the first or last cost',async()=>{
 const f=await upgradeReady(5);for(let i=0;i<5;i++)f.config.tables.OfflineCfg.data.find(r=>r.level===3+i).consume=['挂机徽章',2+i];f.facts=await survey(f.client,protocol,f.options);f.candidate=view(f.facts,f.options).candidates[0];f.operation=plan(f.facts,{...f.options,selections:[f.candidate.actionId]}).actions[0];assert.ok(f.operation);assert.deepEqual(f.operation.costs,[{id:'挂机徽章',num:20}]);const result=await f.client.request(f.operation.action.request,f.operation.action.body,f.operation.action.response,1,{mutate:true});f.state.stock.set('挂机徽章',980);const a=await survey(f.client,protocol,f.options);assert.equal(verify(f.operation,f.facts,a,result).confirmed,true);
});
test('AFK upgrade mainline boundary uses completed stage mainlineStage minus one',async()=>{
 const f=await upgradeReady(),required=f.config.tables.OfflineCfg.data.find(r=>r.level===3).stage;assert.equal(required,10);f.options.player.mainlineStage=required;let facts=await survey(f.client,protocol,f.options);assert.equal(view(facts,f.options).candidates[0].blockedReason,'AFK_MAINLINE_LOCKED');f.options.player.mainlineStage=required+1;facts=await survey(f.client,protocol,f.options);assert.equal(view(facts,f.options).candidates[0].executable,true);
});

const afkPreparationInput=(f,levels=5)=>({level:f.state.afk.level,levels,afkStartTime:f.state.afk.afkStartTime,afkFinishTime:f.state.afk.afkFinishTime,maxDurationMs:60000});
async function afkPrepareReady(){const f=upgradeFake(),config=incomeCfg(),player={playerId:'9007199254740993',worldId:'17',mainlineStage:1000},options={config,player,parameters:incomeParameters(f.state),moduleConfig:enabled},facts=await survey(f.client,protocol,options);return {...f,config,options,facts};}
test('AFK chain preparation rejects implicit source, amounts, counts, extras and unbounded duration before reads',()=>{
 const good={level:2,levels:5,afkStartTime:100,afkFinishTime:500,maxDurationMs:60000};assert.deepEqual(validateAfkUpgradePreparation(good),good);
 for(const change of [{levels:2},{levels:'5'},{maxDurationMs:0},{maxDurationMs:86400001},{afkStartTime:0},{afkFinishTime:100},{allowPaid:false},{expectedUpgradeCost:5}])assert.throws(()=>validateAfkUpgradePreparation({...good,...change}),{code:'INVALID_PARAMETERS'});for(const key of Object.keys(good)){const bad={...good};delete bad[key];assert.throws(()=>validateAfkUpgradePreparation(bad),{code:'INVALID_PARAMETERS'});}
 for(const p of [{action:'income',level:2,afkStartTime:100,afkFinishTime:500,upgradePreparation:{levels:5}},{action:'income',level:2,afkStartTime:100,afkFinishTime:500,upgradePreparation:{levels:5,expectedCost:0}},{action:'upgrade',level:2,levels:5,incomeFrom:{afkStartTime:100,afkFinishTime:500}},{action:'upgrade',level:2,levels:5,expectedUpgradeCost:5},{action:'upgrade',level:2,levels:5,incomeFrom:{afkStartTime:100,afkFinishTime:500,futureStart:200},expectedUpgradeCost:5}])assert.throws(()=>validateParameters(p),{code:'INVALID_PARAMETERS'});
});
for(const levels of [1,5,10])test('AFK chain preparation fixes source, cost and two-step finite graph '+levels+' without predicting new interval or sending',async()=>{
 const f=await afkPrepareReady(),p=afkPreparationInput(f,levels),r=prepareAfkUpgradeWorkflow(f.facts,{config:f.config,moduleConfig:f.options.moduleConfig,...p});assert.equal(r.resumable,false);assert.equal(r.requiresFreshPlan,true);assert.equal(r.requiresAuthorization,true);assert.deepEqual(r.costs,[{id:'挂机徽章',num:levels}]);assert.deepEqual(r.graph.budget,{resources:r.costs,quotas:[],uids:[{type:'afk-income-interval',id:'2:100:500'},{type:'afk-upgrade',id:'2:income:100:500:'+levels}]});assert.deepEqual(r.graph.runPolicy,{maxDurationMs:60000,maxActions:2,modules:['afk-level-rewards']});assert.deepEqual(r.graph.nodes.map(n=>n.type),['START','ACTION','VERIFY','ACTION','VERIFY','STOP']);const income=r.graph.nodes[1].parameters,upgrade=r.graph.nodes[3].parameters;assert.deepEqual(income.upgradePreparation,{levels,expectedCost:levels});assert.deepEqual(upgrade,{action:'upgrade',level:2,levels,incomeFrom:{afkStartTime:100,afkFinishTime:500},expectedUpgradeCost:levels});assert.equal(Object.hasOwn(upgrade,'afkStartTime'),false);assert.equal(validateWorkflow(r.graph,{modules:GAMEPLAY_MODULES}).valid,true);assert.equal(f.state.writes.length,0);assert.equal(view(f.facts,f.options).upgradePreparation.reliable,true);
});
for(const change of ['stock','mainline','unknown-mainline','interval','too-early','configuration','disabled','clone'])test('AFK chain preparation blocks '+change+' without using future income as material',async()=>{
 const f=await afkPrepareReady(),payload=afkPreparationInput(f);if(change==='stock')f.state.stock.set('挂机徽章',0);if(change==='mainline')f.options.player.mainlineStage=1;if(change==='unknown-mainline')delete f.options.player.mainlineStage;if(change==='interval')payload.afkStartTime++;if(change==='too-early')f.state.serverMs=160000;if(change==='configuration')f.config.tables.OfflineCfg.data.find(r=>r.level===3).consume=['RUBY',1];if(change==='disabled')f.options.moduleConfig={enabled:false};const facts=change==='clone'?copy(f.facts):await survey(f.client,protocol,f.options);assert.throws(()=>prepareAfkUpgradeWorkflow(facts,{config:f.config,moduleConfig:f.options.moduleConfig,...payload}),{code:'INVALID_PARAMETERS'});assert.equal(f.state.writes.length,0);
});
async function afkPreparedService(t,{levels=5,...options}={}){const f=serviceFixture(t,{income:true,upgrade:true,...options}),payload=afkPreparationInput(f,levels),prepared=await f.service.prepareAfkUpgradeSource(f.session,payload);const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,o)=>f.service.claimWorkflow(f.session,runId,o),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());return {...f,payload,prepared,runner};}
for(const levels of [1,5,10])test('AFK chain Service executes only separately authorized confirmed income then fresh exact upgrade '+levels,async t=>{
 const f=await afkPreparedService(t,{levels});assert.equal(f.state.writes.length,0);assert.deepEqual(f.durable.list(f.session.id),[]);let r=await f.runner.start(f.session.id,f.prepared.graph);assert.equal(r.status,'AWAITING_AUTHORIZATION');assert.equal(r.plan.actions[0].actionType,'INCOME');const one=await f.run(r.plan);assert.equal(one.record.finalStatus,'SUCCESS');assert.equal(f.state.writes.length,1);r=await f.runner.resume();assert.equal(r.status,'AWAITING_AUTHORIZATION');assert.equal(r.plan.actions[0].actionType,'UPGRADE');assert.equal(r.plan.actions[0].target.incomeSettlement.runId,one.record.runId);assert.deepEqual(r.plan.actions[0].target.interval,{level:2,afkStartTime:200,afkFinishTime:600});assert.equal(r.plan.actions[0].parameters.incomeFrom.afkStartTime,100);assert.deepEqual(r.plan.resourceBudget,[{id:'挂机徽章',num:levels}]);const two=await f.run(r.plan);assert.equal(two.record.finalStatus,'SUCCESS',JSON.stringify(two.record));r=await f.runner.resume();assert.equal(r.status,'COMPLETED');assert.equal(f.state.writes.length,2);assert.equal(f.state.afk.level,2+levels);assert.equal(f.state.stock.get('挂机徽章'),1000-levels);assert.deepEqual(two.record.runBudget.reserved,f.prepared.graph.budget);assert.equal(two.record.workflowId,r.runId);const reopened=createExecutionHistory({file:f.file});assert.equal(reopened.list(f.session.id).filter(r=>r.finalStatus==='SUCCESS').length,2);assert.equal(reopened.unresolved(f.session.id),false);
});
for(const stage of ['income','upgrade'])for(const outcome of ['UNKNOWN','REJECTED','disk','cancel'])test('AFK chain '+stage+' '+outcome+' cannot dispatch or replay dependent writes',async t=>{
 const f=await afkPreparedService(t),request=f.client.request.bind(f.client);let r=await f.runner.start(f.session.id,f.prepared.graph);if(stage==='upgrade'){assert.equal((await f.run(r.plan)).record.finalStatus,'SUCCESS');r=await f.runner.resume();assert.equal(r.status,'AWAITING_AUTHORIZATION');}
 const name=stage==='income'?'DrawAfkRewardRequest':'UpgradeAfkLevelRequest',prior=f.state.writes.length;
 if(outcome==='UNKNOWN'){if(stage==='upgrade')f.state.upgradeApply=false;else f.state.replyChange=reply=>reply.afkStartTime++;}
 if(outcome==='REJECTED')f.client.request=async(n,b,response,...args)=>{if(n!==name)return request(n,b,response,...args);args.at(-1)?.beforeDispatch?.();f.state.writes.push({name:n,body:copy(b)});throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});};
 if(outcome==='disk'){const put=f.history.put;let failed=false;f.history.put=row=>{if(!failed&&row.actions.some(a=>a.actionType===(stage==='income'?'INCOME':'UPGRADE')&&a.stages?.at(-1)?.stage==='DISPATCH_INTENT')){failed=true;throw Error('synthetic disk failure');}return put(row);};}
 if(outcome==='cancel')f.session.abort.abort();try{await f.run(r.plan);}catch{}let done;if(outcome==='cancel'){done=await f.runner.settle();assert.equal(done.status,'CANCELLED');await assert.rejects(f.runner.resume(),{code:'WORKFLOW_INVALID'});}else done=await f.runner.resume();assert.notEqual(done.status,'COMPLETED');assert.notEqual(done.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,prior+(['UNKNOWN','REJECTED'].includes(outcome)?1:0));assert.equal(f.state.writes.filter(w=>w.name==='UpgradeAfkLevelRequest').length,stage==='income'?0:['UNKNOWN','REJECTED'].includes(outcome)?1:0);
 if(outcome==='UNKNOWN'){assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),true);const next=serviceFixture(t,{income:true,upgrade:true,file:f.file});assert.equal(next.service.blocked(next.session.id),true);await assert.rejects(next.makePlan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});
for(const change of ['source','cost','mainline','time','history','material'])test('AFK chain changed '+change+' after income cannot produce an upgrade authorization',async t=>{
 const f=await afkPreparedService(t),r=await f.runner.start(f.session.id,f.prepared.graph);await f.run(r.plan);if(change==='source')f.state.afk.afkStartTime++;if(change==='cost')f.config.tables.OfflineCfg.data.find(r=>r.level===3).consume[1]++;if(change==='mainline')f.session.player.mainlineStage=1;if(change==='time')f.state.serverMs+=61000;if(change==='history'){const list=f.history.list;f.history.list=id=>list(id).map(row=>({...row,actions:row.actions.map(a=>({...a,beforeState:null}))}));}if(change==='material')f.state.stock.set('挂机徽章',0);const done=await f.runner.resume();assert.notEqual(done.status,'AWAITING_AUTHORIZATION');assert.notEqual(done.status,'COMPLETED');assert.equal(f.state.writes.length,1);
});
for(const direction of ['guarded-to-plain','plain-to-guarded'])test('AFK chain income rejection memory cannot be bypassed '+direction,async t=>{
 const f=await afkPreparedService(t),guarded=f.prepared.graph.nodes[1].parameters,plain=incomeParameters(f.state),first=direction==='guarded-to-plain'?guarded:plain,second=direction==='guarded-to-plain'?plain:guarded;const request=f.client.request.bind(f.client);f.client.request=async(n,b,response,...args)=>{if(n!=='DrawAfkRewardRequest')return request(n,b,response,...args);args.at(-1)?.beforeDispatch?.();f.state.writes.push({name:n,body:copy(b)});throw Object.assign(Error('synthetic definite AFK refusal'),{code:'REJECTED'});};assert.equal((await f.run(await f.makePlan(first))).record.finalStatus,'REJECTED');await assert.rejects(f.makePlan(second),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.state.writes.length,1);
});
for(const direction of ['guarded-to-direct','direct-to-guarded'])test('AFK chain upgrade rejection memory cannot be bypassed '+direction,async t=>{
 const f=await afkPreparedService(t),income=await f.makePlan(f.prepared.graph.nodes[1].parameters);await f.run(income);const guarded=f.prepared.graph.nodes[3].parameters,direct=upgradeParameters(f,5),first=direction==='guarded-to-direct'?guarded:direct,second=direction==='guarded-to-direct'?direct:guarded,base=f.client.request.bind(f.client);f.client.request=async(n,b,r,...args)=>{if(n!=='UpgradeAfkLevelRequest')return base(n,b,r,...args);args.at(-1)?.beforeDispatch?.();f.state.writes.push({name:n,body:copy(b)});throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});};assert.equal((await f.run(await f.makePlan(first))).record.finalStatus,'REJECTED');await assert.rejects(f.makePlan(second),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.state.writes.length,2);
});
for(const change of ['account','player','world','connection','generation','mainline','config'])test('AFK chain preparation fences late '+change+' with zero writes and no history',async t=>{
 const f=serviceFixture(t,{income:true,upgrade:true}),payload=afkPreparationInput(f);let changed=false;f.state.onRead=()=>{if(changed)return;changed=true;if(change==='account')f.client.factContext.accountId='B';if(change==='player')f.session.player.playerId='9007199254740994';if(change==='world')f.session.player.worldId='18';if(change==='connection')f.session.connectionId='changed';if(change==='generation'){f.session.generation++;f.session.busy='new-owner';}if(change==='mainline')f.session.player.mainlineStage++;if(change==='config')f.config.tables.OfflineCfg.data[2].consume[1]++;};await assert.rejects(f.service.prepareAfkUpgradeSource(f.session,payload));assert.equal(f.state.writes.length,0);assert.deepEqual(f.durable.list('synthetic-A'),[]);assert.equal(f.session.busy,change==='generation'?'new-owner':null);
});

for(const change of ['material','cost','mainline'])test('AFK chain pre-income '+change+' change rejects original guarded plan before any write',async t=>{
 const f=await afkPreparedService(t),r=await f.runner.start(f.session.id,f.prepared.graph),permit=f.authorize(r.plan);assert.equal(r.plan.actions[0].actionType,'INCOME');
 if(change==='material')f.state.stock.set('挂机徽章',0);if(change==='cost')f.config.tables.OfflineCfg.data.find(row=>row.level===3).consume[1]++;if(change==='mainline')f.session.player.mainlineStage=1;
 try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}
 assert.equal(f.state.writes.length,0);assert.notEqual(f.service.status(f.session.id).finalStatus,'SUCCESS');await assert.rejects(f.makePlan(f.prepared.graph.nodes[1].parameters));assert.equal(f.state.writes.length,0);
});
test('AFK chain original source provenance cannot be substituted by a different confirmed income with identical current interval',async t=>{
 const f=await afkPreparedService(t),r=await f.runner.start(f.session.id,f.prepared.graph);await f.run(r.plan);const list=f.history.list;
 f.history.list=id=>list(id).map(row=>({...row,actions:row.actions.map(a=>({...a,parameters:{...a.parameters,afkStartTime:99},beforeState:{...a.beforeState,afk:{...a.beforeState.afk,afkStartTime:99}}}))}));
 const direct=await f.service.surveyModule(f.session,'afk-level-rewards',upgradeParameters(f,5),{workflowId:r.runId});assert.equal(direct.view.candidates[0].executable,true);
 const guarded=await f.service.surveyModule(f.session,'afk-level-rewards',f.prepared.graph.nodes[3].parameters,{workflowId:r.runId});assert.equal(guarded.view.candidates[0].blockedReason,'AFK_CONFIRMED_INCOME_REQUIRED');const done=await f.runner.resume();assert.notEqual(done.status,'AWAITING_AUTHORIZATION');assert.notEqual(done.status,'COMPLETED');assert.equal(f.state.writes.length,1);
});
for(const stage of ['income','upgrade'])test('AFK chain '+stage+' dispatched identity loss keeps durable UNKNOWN across restart without dependent writes',async t=>{
 const f=await afkPreparedService(t);let r=await f.runner.start(f.session.id,f.prepared.graph);if(stage==='upgrade'){await f.run(r.plan);r=await f.runner.resume();}
 const invalidate=()=>{f.session.player.playerId='9007199254740994';};if(stage==='income')f.state.onWrite=invalidate;else f.state.onUpgrade=invalidate;
 const record=(await f.run(r.plan)).record;assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].dispatched,true);assert.equal(record.actions[0].unresolvedWrite,true);assert.notEqual((await f.runner.resume()).status,'AWAITING_AUTHORIZATION');const count=stage==='income'?1:2;assert.equal(f.state.writes.length,count);
 const next=serviceFixture(t,{income:true,upgrade:true,file:f.file});assert.equal(next.service.blocked(next.session.id),true);await assert.rejects(next.makePlan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
});
