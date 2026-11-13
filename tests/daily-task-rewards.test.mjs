import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { taskRewardsModule,validateTaskRewardsParameters,surveyTaskRewards,viewTaskRewards,planTaskRewards,verifyTaskReward,taskRewardsDependencyVersions } from '../src/task-rewards.mjs';
import { DAILY_TASK_REWARD_EVIDENCE } from '../src/daily-task-rewards.mjs';
import { trustedGameClock } from '../src/state-facts.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { assertPaymentAllowed,ACTIONS } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner,validateWorkflow } from '../src/workflow.mjs';

// Fixed local config/codecs, synthetic account, trusted matching-Ping clock and transport only.
const protocol=loadProtocol(),actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v),wire=(n,b)=>protocol[n].decode(protocol[n].encode(b).finish());
const parameters={kind:'daily',taskId:1001};
function fixture({codec=true,apply=true,receipt={activity:5},tierId=null,worldId=null,gift=false}={}){
 const state={wall:1000000,mono:100,daily:{dailyTask:[{id:1001,progress:1,targetProgress:1,rewardClaimed:false},{id:1002,progress:0,targetProgress:2,rewardClaimed:false}],dailyActivity:40,weeklyActivity:85,dailyRewardClaimed:[1],weeklyRewardClaimed:[],dailyResetTime:2000},stock:[{itemId:'unrelated',num:9}],resources:[{res:1,amount:100},{res:3,amount:200},{res:4,amount:50}],reads:[],writes:[],overrides:{},onRead:null,onWrite:null,onDispatch:null};
 state.gift={heroId:'马斯克',resetTime:1,boughtPack:[],drawnPack:[]};
 const clock=trustedGameClock({accountId:'synthetic-A',generation:3,wallNow:()=>state.wall,monotonicNow:()=>state.mono});
 clock.markPing(state.wall);clock.observePong(wire('PingResponse',{clientTimestamp:state.wall,serverTimestamp:state.wall}));
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-daily'},gameClock:clock,pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
 async request(n,b,r,timeout,opts){
  if(codec)wire(n,b);
  if(opts?.mutate){
   state.onDispatch?.();opts.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});
   if(apply){state.daily.dailyTask.find(row=>row.id===b.id).rewardClaimed=true;state.daily.dailyActivity+=5;state.daily.weeklyActivity+=5;state.resources.find(row=>row.res===1).amount+=100;}
   await state.onWrite?.();return codec?wire(r,receipt):clone(receipt);
  }
  state.reads.push(n);await state.onRead?.(n);
  let value=n==='DailyGiftPackRequest'?state.gift:n==='DailyTaskInfoRequest'?state.daily:n==='AllItemRequest'?{items:state.stock}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected '+n);return codec?wire(r,value):clone(value);
 },
 async sendWatch(n,b,opts){
  if(gift){assert.equal(n,'GotFreeDailyPackRequest');wire(n,b);state.onDispatch?.();opts?.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.gift.drawnPack.push('赠礼');state.resources.find(r=>r.res===4).amount+=10;}await state.onWrite?.();return {status:'UNKNOWN'};}
  assert.equal(n,'DrawDailyRewardRequest');wire(n,b);state.onDispatch?.();opts?.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});
  if(apply){const season=Number(BigInt(options.player.worldId)/1000000n%1000n),rows=actual.tables.DailyActivityRewardCfg.data,selected=Math.max(...rows.filter(r=>r.season<=season).map(r=>r.season)),row=rows.find(r=>r.season===selected&&r.id===b.index[0]);state.daily.dailyRewardClaimed.push(row.id);const [id,num]=row.reward,old=state.stock.find(i=>i.itemId===id);if(old)old.num+=num;else state.stock.push({itemId:id,num});}
  await state.onWrite?.();return {status:'UNKNOWN'};
 }};
 const options={config:{tables:gift?{DailyChargeGiftPackCfg:clone(actual.tables.DailyChargeGiftPackCfg)}:tierId===null?{DailyTaskCfg:clone(actual.tables.DailyTaskCfg)}:{DailyActivityRewardCfg:clone(actual.tables.DailyActivityRewardCfg),ItemCfg:clone(actual.tables.ItemCfg)}},moduleConfig:{enabled:true},parameters:gift?{kind:'daily-gift',packId:'赠礼'}:tierId===null?clone(parameters):{kind:'daily-activity',tierId},player:{playerId:'9007199254740993',worldId:worldId??(tierId===null&&!gift?'17':'1000001')}};
 return {state,client,options};
}
async function ready(input={},mutate){const f=fixture(input);mutate?.(f);const facts=await surveyTaskRewards(f.client,protocol,f.options),row=viewTaskRewards(facts,f.options).candidates[0],operation=planTaskRewards(facts,{...f.options,selections:[row.actionId]}).actions[0];return {...f,facts,row,operation};}
const budget=f=>{const scope={accountId:'synthetic-A',generation:3,connectionId:'offline-daily',runId:'run'},limits=f.operation.budgetClaims;return {ledger:null,runBudget:createRunBudgetContext({scope,limits}),scope,limits,batchId:'batch'};};
async function settled(f,mutate){const reply=await f.client.request('DrawDailyTaskRewardRequest',{id:1001},'DrawDailyTaskRewardResponse',1000,{mutate:true});mutate?.(f);return {reply,after:await surveyTaskRewards(f.client,protocol,f.options)};}

test('existing task-rewards Function admits exact daily kind, no new executor, fixed EXP and period UID',async()=>{
 const f=await ready();assert.ok(f.operation,JSON.stringify(f.row));assert.equal(taskRewardsModule.execute,undefined);assert.deepEqual(taskRewardsModule.defaultConfig,{enabled:false});assert.deepEqual(validateTaskRewardsParameters(parameters),parameters);
 assert.equal(DAILY_TASK_REWARD_EVIDENCE.realGame,'REAL_UNVERIFIED');assert.deepEqual(f.state.reads,['DailyTaskInfoRequest','AllItemRequest','AllResourceRequest']);assert.equal(f.state.writes.length,0);
 assert.deepEqual(f.operation.action,{request:'DrawDailyTaskRewardRequest',response:'DrawDailyTaskRewardResponse',body:{id:1001}});
 assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.rewards,[{id:'EXP',num:100}]);assert.equal(f.operation.activityGain,5);
 assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'task-reward',id:'daily:2000:1001'}]});
 const {after,reply}=await settled(f);assert.equal(verifyTaskReward(f.operation,f.facts,after,reply).confirmed,true);
 assert.equal(planTaskRewards(after,{...f.options,selections:[f.operation.actionId]}).actions.length,0);
});

test('strict paired parameters, single selection and D6 require exact ID and explicitly empty debit',async()=>{
 for(const p of[{kind:'daily'},{taskId:1001},{kind:'daily',taskId:0},{kind:'daily',taskId:'1001'},{kind:'daily',taskId:1001,buy:false}])assert.throws(()=>validateTaskRewardsParameters(p),{code:'INVALID_PARAMETERS'});
 const f=await ready();for(const selections of[[],['forged']])assert.equal(planTaskRewards(f.facts,{...f.options,selections}).actions.length,0);
 for(const selections of[['a','b'],Array(1),'x',[1]])assert.throws(()=>planTaskRewards(f.facts,{...f.options,selections}),{code:'INVALID_PARAMETERS'});
 assert.equal(planTaskRewards(f.facts,{...f.options,moduleConfig:undefined,selections:[f.operation.actionId]}).actions.length,0);
 assert.deepEqual(ACTIONS.dailyTaskDraw.costs,[]);
 const a={request:'DrawDailyTaskRewardRequest',body:{id:1001},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));
 for(const b of[{}, {id:0},{id:2147483648},{id:'1001'},{id:1001,buy:false},{taskId:1001}])assert.throws(()=>assertPaymentAllowed({...a,body:b}));
 for(const costs of[undefined,[{id:'GOLD',num:1}],[{id:'RUBY',num:1}],Array(1)])assert.throws(()=>assertPaymentAllowed({...a,costs}));
});

for(const key of['dailyActivity','weeklyActivity','dailyResetTime','dailyTask'])test('missing daily field is never a protobuf default: '+key,async()=>{const f=await ready({},f=>delete f.state.daily[key]);assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);});
for(const key of['id','progress','targetProgress','rewardClaimed'])test('missing task field cannot claim: '+key,async()=>{const f=await ready({},f=>delete f.state.daily.dailyTask[0][key]);assert.equal(f.operation,undefined);});

for(const [label,mutate]of[
 ['incomplete',f=>f.state.daily.dailyTask[0].progress=0],
 ['already claimed',f=>f.state.daily.dailyTask[0].rewardClaimed=true],
 ['zero target',f=>f.state.daily.dailyTask[0].targetProgress=0],
 ['duplicate task',f=>f.state.daily.dailyTask.push(clone(f.state.daily.dailyTask[0]))],
 ['duplicate claimed tier',f=>f.state.daily.dailyRewardClaimed=[1,1]],
 ['unknown resource inventory',f=>f.state.resources=[]],
 ['missing EXP',f=>f.state.resources=f.state.resources.filter(row=>row.res!==1)],
 ['missing role',f=>f.options.player={}],
 ['unsafe role',f=>f.options.player.playerId=Number.MAX_SAFE_INTEGER+1],
 ['conflicting world',f=>f.client.factContext.worldId='18'],
 ['missing configuration',f=>delete f.options.config.tables.DailyTaskCfg],
 ['duplicate selected definition',f=>f.options.config.tables.DailyTaskCfg.data.push(clone(f.options.config.tables.DailyTaskCfg.data[0]))],
 ['unknown special module',f=>f.options.config.tables.DailyTaskCfg.data[0].moduleId='跨服积分赛'],
 ['missing module',f=>delete f.options.config.tables.DailyTaskCfg.data[0].moduleId],
 ['zero EXP',f=>f.options.config.tables.DailyTaskCfg.data[0].exp=0],
 ['missing activity',f=>delete f.options.config.tables.DailyTaskCfg.data[0].point],
 ['overflow activity',f=>f.state.daily.dailyActivity=2147483647],
 ['read failure',f=>f.state.overrides.DailyTaskInfoRequest=Error('token=secret')],
 ['no clock',f=>f.client.gameClock=null],
 ['expired period',f=>f.state.daily.dailyResetTime=1000],
 ['invalid period',f=>f.state.daily.dailyResetTime=0],
])test('daily eligibility fails closed: '+label,async()=>{const f=await ready({},mutate);assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);assert.doesNotMatch(JSON.stringify(f.facts.notes),/token=secret/);});

test('config dependency uses only selected daily table; non-daily dependency contract is retained',async()=>{
 const f=await ready(),before=taskRewardsDependencyVersions(f.options);assert.deepEqual(Object.keys(before.tables),['DailyTaskCfg']);
 const config=clone(f.options.config);config.tables.MainTaskCfg={revision:3};assert.deepEqual(taskRewardsDependencyVersions({...f.options,config}),before);
 config.tables.DailyTaskCfg.revision=2;assert.notDeepEqual(taskRewardsDependencyVersions({...f.options,config}),before);
 assert.deepEqual(Object.keys(taskRewardsDependencyVersions({...f.options,parameters:{kind:'main',taskId:1}}).tables),['MainTaskCfg','BranchTaskCfg','AchievementTaskCfg','ItemCfg']);
});

test('facts require live seal, same client role/connection, fresh sources and unchanged configuration',async()=>{
 for(const mutate of[
 f=>f.facts.sourceFacts.daily.provenance.sourceAt=Date.now()-30001,
 f=>f.facts.sourceFacts.daily.provenance.source='FakeResponse',
 f=>f.facts.daily.dailyActivity++,
 f=>f.facts.stock.set('forged-zero',0),
 f=>f.facts.inputs.daily.dailyTask[0].progress++,
 f=>f.facts.configEvidence.tables.DailyTaskCfg.revision=2,
 f=>f.client.connected=false,
 f=>f.client.factContext.generation++,
 f=>f.client.factContext.connectionId='replacement',
 f=>f.options.player.worldId='18',
 f=>f.options.config.tables.DailyTaskCfg.revision=2,
 ]){const f=await ready();mutate(f);assert.equal(planTaskRewards(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);}
 const f=await ready();assert.equal(planTaskRewards(clone(f.facts),{...f.options,selections:[f.operation.actionId]}).actions.length,0);
});

test('sampling cancellation, cross-period reads and slow sibling do not refresh authority',async t=>{
 let now=100000,release;t.mock.method(Date,'now',()=>now);
 const f=fixture();f.state.onRead=n=>n==='AllResourceRequest'?new Promise(r=>release=r):undefined;
 const pending=surveyTaskRewards(f.client,protocol,f.options);await new Promise(setImmediate);now+=40000;release();const facts=await pending;
 assert.equal(facts.sourceFacts.daily.provenance.sourceAt,100000);assert.equal(viewTaskRewards(facts,f.options).candidates[0].executable,false);
 const x=fixture(),abort=new AbortController();x.state.onRead=n=>{if(n==='DailyTaskInfoRequest'){queueMicrotask(()=>abort.abort());return new Promise(()=>{});}};
 await assert.rejects(surveyTaskRewards(x.client,protocol,{...x.options,signal:abort.signal}),{code:'CANCELLED'});assert.equal(x.state.writes.length,0);
 const y=await ready({},f=>{f.state.onRead=n=>{if(n==='AllResourceRequest')f.state.mono+=1000000;};});assert.equal(y.operation,undefined);
});

for(const [label,mutate]of[
 ['not claimed',f=>f.state.daily.dailyTask[0].rewardClaimed=false],
 ['task removed',f=>f.state.daily.dailyTask.shift()],
 ['period changed',f=>f.state.daily.dailyResetTime++],
 ['daily total absent',f=>delete f.state.daily.dailyActivity],
 ['daily gain absent',f=>f.state.daily.dailyActivity-=5],
 ['weekly reset',f=>f.state.daily.weeklyActivity=0],
 ['weekly extra',f=>f.state.daily.weeklyActivity++],
 ['other task changed',f=>f.state.daily.dailyTask[1].progress++],
 ['box claimed',f=>f.state.daily.dailyRewardClaimed.push(2)],
 ['EXP absent',f=>f.state.resources[0].amount-=100],
 ['extra inventory',f=>f.state.stock[0].num++],
 ['config changed',f=>f.options.config.tables.DailyTaskCfg.revision=2],
 ['connection changed',f=>f.client.factContext.connectionId='new'],
 ['period expired',f=>f.state.mono+=1000000],
])test('result remains unconfirmed without exact independent settlement: '+label,async()=>{const f=await ready(),{after,reply}=await settled(f,mutate);assert.equal(verifyTaskReward(f.operation,f.facts,after,reply).confirmed,false);});

test('typed activity alone and forged expected state/request/budget never confirm',async()=>{
 const f=await ready(),{after,reply}=await settled(f);
 for(const result of[null,{}, {activity:0},{activity:10},{activity:45},Object.create({activity:5})])assert.equal(verifyTaskReward(f.operation,f.facts,after,result).confirmed,false);
 assert.equal(verifyTaskReward(f.operation,f.facts,f.facts,reply).confirmed,false);
 for(const mutate of[o=>o.expectedState.inventory=[],o=>o.actionId='forged',o=>o.identity='forged',o=>o.budgetClaims.uids=[],o=>o.action.body.extra=true,o=>o.action.body.id=1002,o=>o.costs=[{id:'GOLD',num:1}],o=>o.rewards=[],o=>o.activityGain=10]){
  const op=clone(f.operation);mutate(op);assert.equal(verifyTaskReward(op,f.facts,after,reply).confirmed,false);
 }
});

test('shared executor freshly samples and holds UNKNOWN on absent settlement or mismatched typed delta',async()=>{
 for(const input of[{apply:true},{apply:false},{apply:true,receipt:{activity:10}}]){
  const f=await ready(input),result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)});
  assert.equal(result.status,input.apply&&input.receipt===undefined?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);
 }
 for(const mode of['no-permit','state','config','period']){
  const f=await ready();if(mode==='state')f.state.daily.dailyTask[0].progress++;if(mode==='config')f.options.config.tables.DailyTaskCfg.revision=2;if(mode==='period')f.state.daily.dailyResetTime++;
  const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:mode!=='no-permit',budget:budget(f)});assert.equal(result.dispatched,false,mode);assert.equal(f.state.writes.length,0,mode);
 }
});

function serviceFixture(t,{file=null,...input}={}){
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-daily-reward-')):null;file??=path.join(dir,'history.json');
 const durable=createExecutionHistory({file}),history={...durable,put(row){return durable.put(row);}},f=fixture(input);
 const session={id:'synthetic-A',client:f.client,player:f.options.player,generation:3,connectionId:'offline-daily',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:f.options.moduleConfig})},getConfig:()=>f.options.config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 f.state.onDispatch=()=>{f.state.saved=clone(durable.list(session.id)[0]);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}});
 async function plan(){const read=await service.surveyModule(session,'task-rewards',f.options.parameters),row=read.view.candidates[0];assert.equal(row.executable,true,JSON.stringify(row));return service.plan(session,{module:'task-rewards',mode:'Manual',parameters:f.options.parameters,selections:[row.actionId]});}
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(row=>row.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function run(p){const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};}
 return {...f,file,durable,history,session,service,plan,authorize,run};
}

for(const apply of[true,false])test('Service persists dispatch intent, period UID and '+(apply?'verified success':'UNKNOWN across restart'),async t=>{
 const f=serviceFixture(t,{apply}),plan=await f.plan(),{permit,record}=await f.run(plan);
 assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.equal(f.state.saved.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');
 assert.deepEqual(f.state.saved.runBudget.reserved.uids,[{type:'task-reward',id:'daily:2000:1001'}]);assert.throws(()=>f.service.execute(f.session,permit));
 const next=serviceFixture(t,{file:f.file});assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,apply?'SUCCESS':'UNKNOWN');
 if(!apply){await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});

test('Service persistence failure or cancellation before dispatch sends zero',async t=>{
 for(const mode of['disk','cancel']){
  const f=serviceFixture(t),plan=await f.plan(),permit=f.authorize(plan);
  if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}
  try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0,mode);
 }
});

test('Service approval is invalidated by account, role, world, generation, connection or daily config',async t=>{
 for(const mutate of[f=>f.session.id='B',f=>f.session.player.playerId='2',f=>f.session.player.worldId='18',f=>f.session.generation++,f=>f.session.connectionId='new',f=>f.options.config.tables.DailyTaskCfg.revision=2]){
  const f=serviceFixture(t),plan=await f.plan();mutate(f);assert.throws(()=>f.authorize(plan));assert.equal(f.state.writes.length,0);
 }
});

test('late typed response after cancellation remains durable UNKNOWN and cannot replay',async t=>{
 const f=serviceFixture(t),plan=await f.plan();let release;f.state.onWrite=()=>new Promise(r=>release=r);
 const permit=f.authorize(plan);f.service.execute(f.session,permit);for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.session.abort.abort();release();await f.service.settle(f.session.id);
 assert.equal(f.durable.list(f.session.id)[0].finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);
 const next=serviceFixture(t,{file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
});

test('deterministic rejection memory survives connection replacement; explicit new period is a new identity',async t=>{
 const f=serviceFixture(t,{apply:false});f.state.onWrite=()=>{throw Object.assign(Error('synthetic definite rejection'),{code:'REJECTED'});};
 assert.equal((await f.run(await f.plan())).record.finalStatus,'REJECTED');
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='new';
 await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
 next.state.daily.dailyResetTime=3000;assert.ok((await next.plan()).batchId);assert.equal(next.state.writes.length,0);
});

test('Workflow uses shared parent UID budget, exact Service permit and durable verification',async t=>{
 const f=serviceFixture(t),read=await f.service.surveyModule(f.session,'task-rewards',parameters),row=read.view.candidates[0];
 const graph={version:1,id:'daily-reward-flow',name:'Synthetic daily reward',budget:row.budgetClaims,nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'task-rewards',parameters},{id:'a',type:'ACTION',module:'task-rewards',parameters,selection:row.actionId},{id:'v',type:'VERIFY',module:'task-rewards'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');
 await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.state.writes.length,1);
 const record=f.durable.list(f.session.id)[0];assert.equal(record.workflowId,result.runId);assert.equal(record.workflowNodeId,'a');
});

for(const key of ['dailyRewardClaimed','weeklyRewardClaimed'])test('raw missing repeated list stays unknown: '+key,async()=>{const f=await ready({codec:false},f=>delete f.state.daily[key]);assert.equal(f.operation,undefined);});
test('typed protobuf empty repeated lists are complete empty observations',async()=>{const f=await ready({},f=>{delete f.state.daily.dailyRewardClaimed;delete f.state.daily.weeklyRewardClaimed;});assert.ok(f.operation);assert.deepEqual(f.facts.daily.dailyRewardClaimed,[]);assert.deepEqual(f.facts.daily.weeklyRewardClaimed,[]);});
test('parent UID ceiling denies unapproved task period with zero dispatch',async()=>{
 const f=await ready(),b=budget(f);b.runBudget=createRunBudgetContext({scope:b.scope,limits:{resources:[],quotas:[],uids:[]}});b.limits={resources:[],quotas:[],uids:[]};
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:b});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);
});

test('UNKNOWN cannot expire or replay even after an independently observed new daily marker',async t=>{
 const f=serviceFixture(t,{apply:false});assert.equal((await f.run(await f.plan())).record.finalStatus,'UNKNOWN');
 const next=serviceFixture(t,{file:f.file});next.state.daily.dailyResetTime=3000;await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
});

test('missing write/read protocol blocks only daily operation, exposing no arbitrary fallback',async()=>{
 for(const key of['DailyTaskInfoRequest','DailyTaskInfoResponse','DrawDailyTaskRewardRequest','DrawDailyTaskRewardResponse']){
  const f=fixture(),p={...protocol};delete p[key];const facts=await surveyTaskRewards(f.client,p,f.options);assert.equal(viewTaskRewards(facts,f.options).candidates[0].executable,false);assert.equal(f.state.writes.length,0);
 }
});

test('identity replacement during read and after dispatch never confirms another connection',async()=>{
 const f=fixture();f.state.onRead=n=>{if(n==='DailyTaskInfoRequest')f.client.factContext.connectionId='new';};await assert.rejects(surveyTaskRewards(f.client,protocol,f.options),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);
 const x=await ready();let release;x.state.onWrite=()=>new Promise(r=>release=r);
 const pending=executeBusinessOperation(x.client,protocol,x.operation,{...x.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(x)});
 for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);x.client.factContext.connectionId='new';release();assert.equal((await pending).status,'UNKNOWN');assert.equal(x.state.writes.length,1);
});

test('compiled Dailies claim uses actual shared Service authorization and durable history',async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t),read=await f.service.surveyModule(f.session,'task-rewards',parameters),row=read.view.candidates[0];
 const compiled=compileUnifiedExecution({entry:'dailies',dailies:[{taskId:1001,action:'claim'}],budget:row.budgetClaims},{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.blocked,[]);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);
 await f.run(run.plan);run=await runner.resume();assert.equal(run.status,'COMPLETED');assert.equal(f.state.writes.length,1);
 const record=f.durable.list(f.session.id)[0];assert.equal(record.workflowNodeId,'dailies-0-1');assert.equal(record.workflowDefinitionId,compiled.graph.id);assert.deepEqual(record.runBudget.reserved.uids,row.budgetClaims.uids);
});

for(const apply of[true,false])test('compiled Loop claim never repeats '+(apply?'a claimed daily task':'an UNKNOWN daily write'),async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{apply}),read=await f.service.surveyModule(f.session,'task-rewards',parameters);
 const compiled=compileUnifiedExecution({entry:'loop',rounds:2,dailies:[{taskId:1001,action:'claim'}],budget:read.view.candidates[0].budgetClaims},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');await f.run(run.plan);run=await runner.resume();assert.equal(run.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.durable.list(f.session.id).length,1);
 if(apply)assert.ok(run.trace.some(r=>r.result==='BLOCKED_NO_EXECUTABLE_CANDIDATE'));else assert.equal(f.durable.list(f.session.id)[0].actions[0].unresolvedWrite,true);
});

const readyActivity=(input={},mutate)=>ready({tierId:1,...input},f=>{f.state.daily.dailyRewardClaimed=[];mutate?.(f);});
async function settledActivity(f,mutate){await f.client.sendWatch('DrawDailyRewardRequest',{index:[f.options.parameters.tierId]});mutate?.(f);return surveyTaskRewards(f.client,protocol,f.options);}

test('C516 one exact daily activity tier has zero debit, period UID, selected season and full inventory rule',async()=>{
 const f=await readyActivity();assert.ok(f.operation,JSON.stringify(f.row));assert.equal(f.operation.capabilityId,'C516');assert.deepEqual(f.operation.parameters,{kind:'daily-activity',tierId:1});
 assert.deepEqual(f.operation.action,{request:'DrawDailyRewardRequest',response:null,body:{index:[1]}});assert.deepEqual(f.operation.rewards,[{id:'加速器',num:120}]);assert.deepEqual(f.operation.costs,[]);
 assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'daily-activity-reward',id:'2000:1'}]});assert.equal(f.operation.target.season,1);assert.equal(f.operation.target.configuredSeason,1);
 const after=await settledActivity(f);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,true);assert.deepEqual(after.daily.dailyRewardClaimed,[1]);assert.equal(after.stock.get('加速器'),120);assert.equal(after.daily.dailyActivity,40);assert.equal(after.daily.weeklyActivity,85);
 assert.equal(verifyTaskReward(f.operation,f.facts,after,{reward:{}}).confirmed,false);
});

test('daily activity parameter schema keeps task IDs, tier IDs and unknown weekly periods distinct',()=>{
 assert.deepEqual(validateTaskRewardsParameters({kind:'daily-activity',tierId:2147483647}),{kind:'daily-activity',tierId:2147483647});
 for(const p of[{kind:'daily-activity',taskId:1},{kind:'daily-activity',tierId:1,taskId:1},{kind:'daily',tierId:1},{kind:'main',taskId:1,tierId:1},{tierId:1},{kind:'daily-activity',tierId:0},{kind:'weekly-activity',tierId:1},{kind:'daily-activity',tierId:'1'},{kind:'daily-activity',tierId:1,all:true}])assert.throws(()=>validateTaskRewardsParameters(p),{code:'INVALID_PARAMETERS'});
});

for(const [worldId,season,rewardId]of[
 ['1000001',1,'普橙随机碎片II'],['2000001',2,'橙卡随机碎片S1'],['3000001',3,'橙卡随机碎片S2'],['4000001',4,'橙卡随机碎片'],['5000001',4,'橙卡随机碎片'],['9007199254740993',4,'橙卡随机碎片']
])test('tier five reward uses exact world and configured floor season '+worldId,async()=>{
 const f=await readyActivity({tierId:5,worldId},f=>f.state.daily.dailyActivity=100);assert.ok(f.operation,JSON.stringify(f.row));assert.equal(f.operation.target.configuredSeason,season);assert.deepEqual(f.operation.rewards,[{id:rewardId,num:20}]);
 const after=await settledActivity(f);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,true);assert.equal(after.stock.get(rewardId),20);assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0].name,'DrawDailyRewardRequest');
});

for(const [label,mutate]of[
 ['incomplete activity',f=>f.state.daily.dailyActivity=19],
 ['already claimed',f=>f.state.daily.dailyRewardClaimed=[1]],
 ['unrecognized prior tier',f=>f.state.daily.dailyRewardClaimed=[999]],
 ['world has no proven season',f=>f.options.player.worldId='17'],
 ['unsafe world Number',f=>f.options.player.worldId=Number.MAX_SAFE_INTEGER+1],
 ['missing world',f=>delete f.options.player.worldId],
 ['missing table',f=>delete f.options.config.tables.DailyActivityRewardCfg],
 ['duplicate tier',f=>f.options.config.tables.DailyActivityRewardCfg.data.push(clone(f.options.config.tables.DailyActivityRewardCfg.data[0]))],
 ['unsorted season groups',f=>f.options.config.tables.DailyActivityRewardCfg.data.reverse()],
 ['zero threshold',f=>f.options.config.tables.DailyActivityRewardCfg.data[0].activity=0],
 ['zero reward',f=>f.options.config.tables.DailyActivityRewardCfg.data[0].reward[1]=0],
 ['unknown reward item',f=>f.options.config.tables.DailyActivityRewardCfg.data[0].reward[0]='未知奖励'],
 ['unknown reward type',f=>f.options.config.tables.ItemCfg.data.find(r=>r.id==='加速器').type='Meta'],
 ['instance reward',f=>f.options.config.tables.ItemCfg.data.find(r=>r.id==='加速器').type='英雄'],
 ['ambiguous item',f=>f.options.config.tables.ItemCfg.data.push(clone(f.options.config.tables.ItemCfg.data.find(r=>r.id==='加速器')))],
 ['missing item table',f=>delete f.options.config.tables.ItemCfg],
 ['overflow income',f=>f.state.stock.push({itemId:'加速器',num:Number.MAX_SAFE_INTEGER})],
 ['expired clock',f=>f.state.daily.dailyResetTime=1000],
])test('daily activity fails closed: '+label,async()=>{const f=await readyActivity({},mutate);assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);});

for(const [label,mutate]of[
 ['wrong tier claimed',f=>f.state.daily.dailyRewardClaimed=[2]],
 ['two tiers claimed',f=>f.state.daily.dailyRewardClaimed=[1,2]],
 ['reward absent',f=>f.state.stock=f.state.stock.filter(r=>r.itemId!=='加速器')],
 ['extra inventory',f=>f.state.stock[0].num++],
 ['other task changed',f=>f.state.daily.dailyTask[0].progress++],
 ['daily activity changed',f=>f.state.daily.dailyActivity++],
 ['weekly activity changed',f=>f.state.daily.weeklyActivity++],
 ['weekly claims changed',f=>f.state.daily.weeklyRewardClaimed=[1]],
 ['daily marker changed',f=>f.state.daily.dailyResetTime++],
 ['period expired',f=>f.state.mono+=1000000],
 ['world changed',f=>f.options.player.worldId='2000001'],
 ['config changed',f=>f.options.config.tables.DailyActivityRewardCfg.revision=2],
])test('daily activity settlement remains UNKNOWN: '+label,async()=>{const f=await readyActivity(),after=await settledActivity(f,mutate);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);});

test('daily activity D6 retains explicit legacy tier lists while denying sparse/duplicate/paid metadata',()=>{
 const base={request:'DrawDailyRewardRequest',body:{index:[1]},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(base));assert.doesNotThrow(()=>assertPaymentAllowed({...base,body:{index:[1,2]}}));assert.deepEqual(ACTIONS.dailyRewardDraw.costs,[]);
 for(const index of[1,'1',[],Array(1),[1,1],[0],['1'],[2147483648]])assert.throws(()=>assertPaymentAllowed({...base,body:{index}}));
 for(const body of[{index:[1],buy:false},{index:[1],all:true}])assert.throws(()=>assertPaymentAllowed({...base,body}));
 for(const costs of[undefined,[{id:'GOLD',num:1}],[{id:'RUBY',num:1}]])assert.throws(()=>assertPaymentAllowed({...base,costs}));
});

test('daily activity dependency versions bind only tier and item tables without changing daily task dependencies',async()=>{
 const f=await readyActivity(),before=taskRewardsDependencyVersions(f.options);assert.deepEqual(Object.keys(before.tables),['DailyActivityRewardCfg','ItemCfg']);const config=clone(f.options.config);config.tables.DailyTaskCfg={revision:3};assert.deepEqual(taskRewardsDependencyVersions({...f.options,config}),before);for(const key of['DailyActivityRewardCfg','ItemCfg']){const next=clone(config);next.tables[key].revision=2;assert.notDeepEqual(taskRewardsDependencyVersions({...f.options,config:next}),before);}
});

for(const apply of[true,false])test('daily activity Service persists exact intent, parent UID and '+(apply?'verified income':'durable UNKNOWN with no replay'),async t=>{
 const f=serviceFixture(t,{tierId:2,apply}),p=await f.plan(),{record}=await f.run(p);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0],{name:'DrawDailyRewardRequest',body:{index:[2]}});assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.saved.runBudget.reserved.uids,[{type:'daily-activity-reward',id:'2000:2'}]);
 const next=serviceFixture(t,{tierId:2,file:f.file});if(!apply){next.state.daily.dailyResetTime=3000;await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});

test('daily activity persistence failure, identity changes and cancellation never dispatch',async t=>{
 for(const mode of['disk','world','config','cancel']){
  const f=serviceFixture(t,{tierId:2}),p=await f.plan();if(mode==='world'){f.session.player.worldId='2000001';assert.throws(()=>f.authorize(p));continue;}if(mode==='config'){f.options.config.tables.ItemCfg.revision=2;assert.throws(()=>f.authorize(p));continue;}const permit=f.authorize(p);
  if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0,mode);
 }
});

test('daily activity late watch after replacement retains UNKNOWN and rejection memory survives reconnection',async t=>{
 const f=serviceFixture(t,{tierId:2}),p=await f.plan();let release;f.state.onWrite=()=>new Promise(r=>release=r);const permit=f.authorize(p);f.service.execute(f.session,permit);for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.session.abort.abort();release();await f.service.settle(f.session.id);assert.equal(f.durable.list(f.session.id)[0].finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);
 const r=serviceFixture(t,{tierId:2,apply:false});r.state.onWrite=()=>{throw Object.assign(Error('definite synthetic refusal'),{code:'REJECTED'});};assert.equal((await r.run(await r.plan())).record.finalStatus,'REJECTED');const next=serviceFixture(t,{tierId:2,file:r.file});next.session.connectionId=next.client.factContext.connectionId='new';await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
});

test('daily activity uses original Workflow and parent UID budget without automatic authorization',async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{tierId:2}),read=await f.service.surveyModule(f.session,'task-rewards',f.options.parameters),row=read.view.candidates[0],compiled=compileUnifiedExecution({entry:'loop',world:[{module:'task-rewards',parameters:f.options.parameters}],budget:row.budgetClaims},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(run.plan);run=await runner.resume();assert.equal(run.status,'COMPLETED');assert.equal(f.durable.list(f.session.id)[0].workflowNodeId,'world-0-1');assert.equal(f.state.writes.length,1);
});


for(const entry of['tasks','dailies','loop'])for(const apply of[true,false])test('compiled '+entry+' activity shares authorization, UID history and '+(apply?'verified single claim':'UNKNOWN stop'),async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{tierId:2,apply}),read=await f.service.surveyModule(f.session,'task-rewards',f.options.parameters),row=read.view.candidates[0];
 const phase=entry==='tasks'?'tasks':'dailies',intent=entry==='tasks'?{kind:'daily-activity',tierId:2}:{kind:'daily-activity',tierId:2,action:'claim'};
 const compiled=compileUnifiedExecution({entry,[phase]:[intent],...(entry==='loop'?{rounds:2,tasks:[{kind:'daily-activity',tierId:2}]}:{}),budget:row.budgetClaims},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(run.plan);run=await runner.resume();assert.equal(run.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.state.writes.length,1);
 const records=f.durable.list(f.session.id);assert.equal(records.length,1);assert.equal(records[0].workflowNodeId,(entry==='dailies'?'dailies':'tasks')+'-0-1');assert.equal(records[0].workflowDefinitionId,compiled.graph.id);assert.deepEqual(records[0].runBudget.reserved.uids,row.budgetClaims.uids);
 if(apply&&entry==='loop')assert.ok(run.trace.some(r=>r.result==='BLOCKED_NO_EXECUTABLE_CANDIDATE'));
 if(!apply){
  const next=serviceFixture(t,{tierId:2,file:f.file});next.state.daily.dailyResetTime=3000;
  const restarted=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:next.service,claim:(_id,runId,options)=>next.service.claimWorkflow(next.session,runId,options),getSession:()=>next.session});t.after(()=>restarted.stop());
  await assert.rejects(restarted.start(next.session.id,compiled.graph),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);assert.equal(next.durable.list(next.session.id).length,1);
 }
});

test('manual activity refusal remains shared across Dailies and Tasks reconnection aliases',async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{tierId:2,apply:false});
 f.state.onWrite=()=>{throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});};const plan=await f.plan();assert.equal((await f.run(plan)).record.finalStatus,'REJECTED');
 for(const entry of['tasks','dailies','loop']){
  const next=serviceFixture(t,{tierId:2,file:f.file});next.session.connectionId=next.client.factContext.connectionId='replacement-'+entry;
  const phase=entry==='tasks'?'tasks':'dailies',intent=phase==='tasks'?{kind:'daily-activity',tierId:2}:{kind:'daily-activity',tierId:2,action:'claim'};
  const compiled=compileUnifiedExecution({entry,[phase]:[intent],budget:plan.budgetClaims},{modules:GAMEPLAY_MODULES}),runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:next.service,claim:(_id,runId,options)=>next.service.claimWorkflow(next.session,runId,options),getSession:()=>next.session});t.after(()=>runner.stop());
  const run=await runner.start(next.session.id,compiled.graph);assert.equal(run.status,'COMPLETED');assert.ok(run.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));assert.equal(next.state.writes.length,0);assert.equal(next.durable.list(next.session.id).length,1);
 }
});


test('C513 explicit free gift binds full server state and exact RUBY income without inferring resetTime',async()=>{
 const f=await ready({gift:true},f=>f.client.gameClock=null);assert.ok(f.operation,JSON.stringify(f.row));assert.deepEqual(f.operation.parameters,{kind:'daily-gift',packId:'赠礼'});assert.equal(f.operation.target.resetMarker,1);
 assert.deepEqual(f.state.reads,['DailyGiftPackRequest','AllItemRequest','AllResourceRequest']);assert.deepEqual(f.operation.action,{request:'GotFreeDailyPackRequest',response:null,body:{packId:'赠礼'}});assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.rewards,[{id:'RUBY',num:10}]);assert.equal(f.operation.budgetClaims.uids[0].type,'free-daily-gift');
 await f.client.sendWatch('GotFreeDailyPackRequest',{packId:'赠礼'});const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,true);assert.equal(after.stock.get('RUBY'),60);assert.deepEqual(after.daily.drawnPack,['赠礼']);assert.equal(after.daily.heroId,'马斯克');assert.equal(after.daily.resetMarker,1);
 assert.equal(verifyTaskReward(f.operation,f.facts,after,{reward:[{id:'RUBY',num:10}]}).confirmed,false);assert.equal(viewTaskRewards(after,f.options).candidates[0].executable,false);
});
test('free gift strict parameters and D6 preserve paid/combine exclusion',()=>{
 assert.deepEqual(validateTaskRewardsParameters({kind:'daily-gift',packId:'赠礼'}),{kind:'daily-gift',packId:'赠礼'});
 for(const p of[{kind:'daily-gift'},{kind:'daily-gift',packId:'礼包1'},{kind:'daily-gift',packId:'合并礼包'},{kind:'daily-gift',packId:'赠礼',tierId:1},{kind:'daily-gift',packId:'赠礼',taskId:1},{kind:'daily',taskId:1,packId:'赠礼'},{kind:'main',taskId:1,packId:'赠礼'}])assert.throws(()=>validateTaskRewardsParameters(p),{code:'INVALID_PARAMETERS'});
 const base={request:'GotFreeDailyPackRequest',body:{packId:'赠礼'},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(base));assert.deepEqual(ACTIONS.freeDailyPackDraw.costs,[]);
 for(const body of[{}, {packId:'礼包1'},{packId:'合并礼包'},{packId:'赠礼',buy:false}])assert.throws(()=>assertPaymentAllowed({...base,body}));
 for(const costs of[undefined,[{id:'RUBY',num:1}],[{id:'GOLD',num:1}],Array(1)])assert.throws(()=>assertPaymentAllowed({...base,costs}));
});
for(const [worldId,selected]of[['1000001',1],['2000001',1],['3000001',3],['4000001',4],['5000001',4],['9007199254740993',4]])test('free gift exact world season '+worldId,async()=>{
 const f=await ready({gift:true,worldId});assert.ok(f.operation,JSON.stringify(f.row));assert.equal(f.operation.target.configuredSeason,selected);assert.equal(f.operation.capabilityId,'C513');
});
for(const [label,mutate]of[
 ['already claimed',f=>f.state.gift.drawnPack=['赠礼']],
 ['missing hero',f=>delete f.state.gift.heroId],
 ['missing marker',f=>delete f.state.gift.resetTime],
 ['missing drawn list',f=>delete f.state.gift.drawnPack],
 ['missing bought list',f=>delete f.state.gift.boughtPack],
 ['duplicate drawn',f=>f.state.gift.drawnPack=['礼包1','礼包1']],
 ['duplicate bought',f=>f.state.gift.boughtPack=['礼包1','礼包1']],
 ['missing RUBY',f=>f.state.resources=f.state.resources.filter(r=>r.res!==4)],
 ['overflow RUBY',f=>f.state.resources.find(r=>r.res===4).amount=Number.MAX_SAFE_INTEGER],
 ['unknown season',f=>f.options.player.worldId='17'],
 ['missing config',f=>delete f.options.config.tables.DailyChargeGiftPackCfg],
 ['duplicate config',f=>f.options.config.tables.DailyChargeGiftPackCfg.data.push(clone(f.options.config.tables.DailyChargeGiftPackCfg.data[0]))],
 ['unsorted config',f=>f.options.config.tables.DailyChargeGiftPackCfg.data.reverse()],
 ['paid price',f=>f.options.config.tables.DailyChargeGiftPackCfg.data.find(r=>r.packId==='赠礼').price=1],
 ['hero fragment income',f=>f.options.config.tables.DailyChargeGiftPackCfg.data.find(r=>r.packId==='赠礼').fragNum=1],
 ['guild reward',f=>f.options.config.tables.DailyChargeGiftPackCfg.data.find(r=>r.packId==='赠礼').guildPack=['礼包',1]],
 ['unknown reward',f=>f.options.config.tables.DailyChargeGiftPackCfg.data.find(r=>r.packId==='赠礼').reward=[['GOLD',10]]],
 ['missing price',f=>delete f.options.config.tables.DailyChargeGiftPackCfg.data.find(r=>r.packId==='赠礼').price],
 ['read failed',f=>f.state.overrides.DailyGiftPackRequest=Error('synthetic unavailable')],
])test('free gift blocks uncertain qualification or costs: '+label,async()=>{const f=await ready({gift:true,codec:false},mutate);assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);});

for(const [label,mutate]of[
 ['no claimed state',f=>f.state.gift.drawnPack=[]],
 ['extra claimed peer',f=>f.state.gift.drawnPack.push('合并礼包')],
 ['paid state changed',f=>f.state.gift.boughtPack.push('礼包1')],
 ['marker changed',f=>f.state.gift.resetTime=2],
 ['hero changed',f=>f.state.gift.heroId='牛顿'],
 ['reward absent',f=>f.state.resources.find(r=>r.res===4).amount=50],
 ['wrong reward',f=>f.state.resources.find(r=>r.res===4).amount=61],
 ['other resource changed',f=>f.state.resources[0].amount++],
 ['other item changed',f=>f.state.stock[0].num++],
 ['config changed',f=>f.options.config.tables.DailyChargeGiftPackCfg.revision=2],
 ['connection changed',f=>f.client.factContext.connectionId='replaced'],
])test('free gift ambiguous settlement stays UNKNOWN: '+label,async()=>{
 const f=await ready({gift:true});await f.client.sendWatch('GotFreeDailyPackRequest',{packId:'赠礼'});mutate(f);const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);
});

test('free gift dependency binds only its selected config and canonical intent cannot be forged',async()=>{
 const f=await ready({gift:true}),v=taskRewardsDependencyVersions(f.options);assert.deepEqual(Object.keys(v.tables),['DailyChargeGiftPackCfg']);const config=clone(f.options.config);config.tables.DailyTaskCfg={revision:3};assert.deepEqual(taskRewardsDependencyVersions({...f.options,config}),v);
 config.tables.DailyChargeGiftPackCfg.revision=2;assert.notDeepEqual(taskRewardsDependencyVersions({...f.options,config}),v);
 await f.client.sendWatch('GotFreeDailyPackRequest',{packId:'赠礼'});const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,clone(f.facts),after,null).confirmed,false);
 for(const mutate of[op=>op.action.body.packId='合并礼包',op=>op.budgetClaims.uids=[],op=>op.expectedState.inventory=[],op=>op.rewards[0].num=11]){const op=clone(f.operation);mutate(op);assert.equal(verifyTaskReward(op,f.facts,after,null).confirmed,false);}
});

for(const apply of[true,false])test('free gift shared Service persists exact write '+(apply?'success':'UNKNOWN across marker change/restart'),async t=>{
 const f=serviceFixture(t,{gift:true,apply}),p=await f.plan(),{record}=await f.run(p);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0],{name:'GotFreeDailyPackRequest',body:{packId:'赠礼'}});
 assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(record.runBudget.reserved.uids,p.budgetClaims.uids);
 if(!apply){const next=serviceFixture(t,{gift:true,file:f.file});next.state.gift.resetTime=2;next.state.gift.heroId='牛顿';await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});
test('free gift zero sends on persist failure, stale config, cancellation or exhausted parent UID',async t=>{
 for(const mode of['disk','config','cancel','budget']){
  const f=serviceFixture(t,{gift:true});
  if(mode==='budget'){f.service.claimWorkflow(f.session,'gift-parent',{limits:{resources:[],quotas:[],uids:[]}});await assert.rejects(f.plan());assert.equal(f.state.writes.length,0);continue;}
  const p=await f.plan();if(mode==='config'){f.options.config.tables.DailyChargeGiftPackCfg.revision=2;assert.throws(()=>f.authorize(p));continue;}
  const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}
  try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0,mode);
 }
});
for(const apply of[true,false])test('free gift unified Loop uses original Service and '+(apply?'blocks duplicate aliases':'stops UNKNOWN before another alias'),async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{gift:true,apply}),read=await f.service.surveyModule(f.session,'task-rewards',f.options.parameters),compiled=compileUnifiedExecution({entry:'loop',tasks:[{kind:'daily-gift',packId:'赠礼'}],dailies:[{kind:'daily-gift',packId:'赠礼',action:'claim'}],rounds:2,budget:read.view.candidates[0].budgetClaims},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:()=>f.session});t.after(()=>runner.stop());
 let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(run.plan);run=await runner.resume();assert.equal(run.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.durable.list(f.session.id)[0].workflowNodeId,'tasks-0-1');
});


test('free gift protocol, fresh facts and exact account authority fail closed before any write',async()=>{
 const f=fixture({gift:true}),limited={...protocol};delete limited.GotFreeDailyPackRequest;const facts=await surveyTaskRewards(f.client,limited,f.options);assert.equal(viewTaskRewards(facts,f.options).candidates[0].blockedReason,'PROTOCOL_UNAVAILABLE');assert.equal(f.state.writes.length,0);
 for(const mutate of[
  f=>f.facts.sourceFacts.daily.provenance.sourceAt=Date.now()-30001,
  f=>f.facts.inputs.daily.drawnPack.push('礼包1'),
  f=>f.client.factContext.accountId='synthetic-B',
  f=>f.client.factContext.generation++,
  f=>f.client.factContext.connectionId='replacement',
  f=>f.options.player.worldId='2000001',
 ]){
  const x=await ready({gift:true});mutate(x);assert.equal(planTaskRewards(x.facts,{...x.options,selections:[x.operation.actionId]}).actions.length,0);assert.equal(x.state.writes.length,0);
 }
 const no=await ready({gift:true}),result=await executeBusinessOperation(no.client,protocol,no.operation,{...no.options,adapter:taskRewardsModule,allowMutate:false,budget:budget(no)});assert.equal(result.dispatched,false);assert.equal(no.state.writes.length,0);
});

test('free gift late watch after cancellation remains UNKNOWN and cannot be replayed from another entry',async t=>{
 const f=serviceFixture(t,{gift:true}),plan=await f.plan();let release;f.state.onWrite=()=>new Promise(r=>release=r);f.service.execute(f.session,f.authorize(plan));for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.session.abort.abort();release();await f.service.settle(f.session.id);
 assert.equal(f.durable.list(f.session.id)[0].finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);const next=serviceFixture(t,{gift:true,file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
});

test('free gift refusal is shared across reconnecting Tasks and Dailies aliases',async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{gift:true,apply:false});f.state.onWrite=()=>{throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});};const plan=await f.plan();assert.equal((await f.run(plan)).record.finalStatus,'REJECTED');
 for(const phase of['tasks','dailies']){
  const next=serviceFixture(t,{gift:true,file:f.file});next.session.connectionId=next.client.factContext.connectionId='replacement-'+phase;
  const row={kind:'daily-gift',packId:'赠礼',...(phase==='dailies'?{action:'claim'}:{})},compiled=compileUnifiedExecution({entry:phase,[phase]:[row],budget:plan.budgetClaims},{modules:GAMEPLAY_MODULES});
  const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:next.service,claim:(_id,runId,options)=>next.service.claimWorkflow(next.session,runId,options),getSession:()=>next.session});t.after(()=>runner.stop());
  const run=await runner.start(next.session.id,compiled.graph);assert.equal(run.status,'COMPLETED');assert.ok(run.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));assert.equal(next.state.writes.length,0);
 }
});
