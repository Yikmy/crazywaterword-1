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
import { RESOURCE_NAMES,createRunBudgetContext } from '../src/resource-ledger.mjs';
import { assertPaymentAllowed,ACTIONS } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner,validateWorkflow } from '../src/workflow.mjs';

// Fixed local config/codecs, synthetic account, trusted matching-Ping clock and transport only.
const protocol=loadProtocol(),actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v),wire=(n,b)=>protocol[n].decode(protocol[n].encode(b).finish());
const parameters={kind:'daily',taskId:1001};
function fixture({codec=true,apply=true,receipt={activity:5},tierId=null,worldId=null,gift=false,weekly=false,unique=false,chip=false}={}){
 const state={wall:1000000,mono:100,daily:{dailyTask:[{id:1001,progress:1,targetProgress:1,rewardClaimed:false},{id:1002,progress:0,targetProgress:2,rewardClaimed:false}],dailyActivity:40,weeklyActivity:85,dailyRewardClaimed:[1],weeklyRewardClaimed:[],dailyResetTime:2000},stock:[{itemId:'unrelated',num:9}],resources:[{res:1,amount:100},{res:3,amount:200},{res:4,amount:50}],reads:[],writes:[],overrides:{},onRead:null,onWrite:null,onDispatch:null};
 state.week={activityTime:[{type:4,period:12,startTime:900,endTime:2000},{type:5,period:13,startTime:800,endTime:2100}]};
 if(unique)state.week.activityTime[0]={type:7,period:20001,startTime:900,endTime:2000};
 if(chip)state.week.activityTime[0]={type:6,period:1001,startTime:900,endTime:2000};
 state.chip={round:1,score:100,gotTaskId:[1],gifts:[{giftId:1000,paidTimes:0},{giftId:1001,paidTimes:1}]};
 state.unique={gift:[{giftId:1001,gotTimes:1,charge:30}],floor:2,prizePos:[{prizeId:2,pos:1},{prizeId:0,pos:2}],selectId:1001,gotFree:false,gotFloor:1,buyTimes:0};
 state.weekly={gift:[{giftId:1000,gotTimes:0,charge:0},{giftId:1001,gotTimes:1,charge:30}],gotInfo:{times:7,gotStage:1}};
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
  let value=n==='WeekChipInfoRequest'?state.chip:n==='WeekUniqueLotteryRequest'?state.unique:n==='WeekInfoRequest'?state.week:n==='WeekLotteryInfoRequest'?state.weekly:n==='DailyGiftPackRequest'?state.gift:n==='DailyTaskInfoRequest'?state.daily:n==='AllItemRequest'?{items:state.stock}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected '+n);return codec?wire(r,value):clone(value);
 },
 async sendWatch(n,b,opts){
  if(chip){assert.equal(n,'WeekChipGotFreeRequest');wire(n,b);state.onDispatch?.();opts?.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.chip.gifts[0].paidTimes=1;const box=state.stock.find(r=>r.itemId==='白芯片宝箱');if(box)box.num+=10;else state.stock.push({itemId:'白芯片宝箱',num:10});}await state.onWrite?.();return {status:'UNKNOWN'};}
  if(unique){assert.equal(n,'GotUniqueLotteryFreeRequest');wire(n,b);state.onDispatch?.();opts?.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.unique.gotFree=true;state.resources.find(r=>r.res===4).amount+=10;const coin=state.stock.find(r=>r.itemId==='周翻牌币');if(coin)coin.num++;else state.stock.push({itemId:'周翻牌币',num:1});}await state.onWrite?.();return {status:'UNKNOWN'};}
  if(weekly){assert.equal(n,'WeekLotteryFreePackRequest');wire(n,b);state.onDispatch?.();opts?.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.weekly.gift[0].gotTimes=1;state.resources.find(r=>r.res===4).amount+=10;const coin=state.stock.find(r=>r.itemId==='周转盘币');if(coin)coin.num++;else state.stock.push({itemId:'周转盘币',num:1});}await state.onWrite?.();return {status:'UNKNOWN'};}
  if(gift){assert.equal(n,'GotFreeDailyPackRequest');wire(n,b);state.onDispatch?.();opts?.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.gift.drawnPack.push('赠礼');state.resources.find(r=>r.res===4).amount+=10;}await state.onWrite?.();return {status:'UNKNOWN'};}
  assert.equal(n,'DrawDailyRewardRequest');wire(n,b);state.onDispatch?.();opts?.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});
  if(apply){const season=Number(BigInt(options.player.worldId)/1000000n%1000n),rows=actual.tables.DailyActivityRewardCfg.data,selected=Math.max(...rows.filter(r=>r.season<=season).map(r=>r.season)),row=rows.find(r=>r.season===selected&&r.id===b.index[0]);state.daily.dailyRewardClaimed.push(row.id);const [id,num]=row.reward,old=state.stock.find(i=>i.itemId===id);if(old)old.num+=num;else state.stock.push({itemId:id,num});}
  await state.onWrite?.();return {status:'UNKNOWN'};
 }};
 const options={config:{tables:chip?{WeekChipPackCfg:clone(actual.tables.WeekChipPackCfg)}:unique?{WeekUniquePackCfg:clone(actual.tables.WeekUniquePackCfg)}:weekly?{WeekLotteryPackCfg:clone(actual.tables.WeekLotteryPackCfg)}:gift?{DailyChargeGiftPackCfg:clone(actual.tables.DailyChargeGiftPackCfg)}:tierId===null?{DailyTaskCfg:clone(actual.tables.DailyTaskCfg)}:{DailyActivityRewardCfg:clone(actual.tables.DailyActivityRewardCfg),ItemCfg:clone(actual.tables.ItemCfg)}},moduleConfig:{enabled:true},parameters:chip?{kind:'weekly-chip-gift',packId:'1000'}:unique?{kind:'weekly-unique-lottery-gift',packId:'1000'}:weekly?{kind:'weekly-lottery-gift',packId:'1000'}:gift?{kind:'daily-gift',packId:'赠礼'}:tierId===null?clone(parameters):{kind:'daily-activity',tierId},player:{playerId:'9007199254740993',worldId:worldId??(tierId===null&&!gift?'17':'1000001')}};
 return {state,client,options};
}
async function ready(input={},mutate){const f=input.chipTask?chipTaskFixture(input):fixture(input);mutate?.(f);const facts=await surveyTaskRewards(f.client,protocol,f.options),row=viewTaskRewards(facts,f.options).candidates[0],operation=planTaskRewards(facts,{...f.options,selections:[row.actionId]}).actions[0];return {...f,facts,row,operation};}
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
 const durable=createExecutionHistory({file}),history={...durable,put(row){return durable.put(row);}},f=input.chipTask?chipTaskFixture(input):fixture(input);
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

test('weekly free lottery pack uses explicit entitlement, exact active event and original executor',async()=>{
 const f=await ready({weekly:true});assert.ok(f.operation,JSON.stringify(f.row));
 assert.deepEqual(f.operation.parameters,{kind:'weekly-lottery-gift',packId:'1000'});assert.deepEqual(f.operation.target,{...f.operation.parameters,type:4,period:12,startTime:900,endTime:2000});
 assert.deepEqual(f.state.reads,['WeekLotteryInfoRequest','WeekInfoRequest','AllItemRequest','AllResourceRequest']);assert.equal(f.state.writes.length,0);
 assert.deepEqual(f.operation.action,{request:'WeekLotteryFreePackRequest',response:null,body:{}});assert.deepEqual(f.operation.rewards,[{id:'周转盘币',num:1},{id:'RUBY',num:10}]);assert.deepEqual(f.operation.costs,[]);
 assert.equal(f.operation.budgetClaims.uids[0].type,'free-weekly-lottery-gift');
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,'SUCCESS',JSON.stringify(result));
 assert.deepEqual(f.state.writes,[{name:'WeekLotteryFreePackRequest',body:{}}]);assert.equal(f.state.weekly.gift[0].gotTimes,1);assert.equal(f.state.resources.find(r=>r.res===4).amount,60);
});

test('weekly fixed pack validates paired public schema, config dependencies and explicit empty D6',async()=>{
 const p={kind:'weekly-lottery-gift',packId:'1000'};assert.deepEqual(validateTaskRewardsParameters(p),p);
 const {validateFunctionParameters}=await import('../src/function-contracts.mjs');assert.deepEqual(validateFunctionParameters('task-rewards',taskRewardsModule,p),p);
 for(const bad of[{kind:p.kind},{...p,packId:1000},{...p,packId:'1001'},{...p,packId:'赠礼'},{...p,taskId:1001},{...p,tierId:1},{...p,request:'WeekLotteryFreePackRequest'}])assert.throws(()=>validateTaskRewardsParameters(bad),{code:'INVALID_PARAMETERS'});
 const a={request:'WeekLotteryFreePackRequest',body:{},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));
 for(const body of[undefined,null,[],{packId:1000},{buy:false},Object.create({packId:1000})])assert.throws(()=>assertPaymentAllowed({...a,body}));
 const inheritedBody=Object.create({body:{}});Object.assign(inheritedBody,{request:a.request,costs:[]});assert.throws(()=>assertPaymentAllowed(inheritedBody));
 for(const costs of[undefined,null,Array(1),[{id:'GOLD',num:1}],[{id:'RUBY',num:1}]])assert.throws(()=>assertPaymentAllowed({...a,costs}));
 const f=await ready({weekly:true}),versions=taskRewardsDependencyVersions(f.options);assert.deepEqual(Object.keys(versions.tables),['WeekLotteryPackCfg']);const config=clone(f.options.config);config.tables.DailyTaskCfg={revision:1};assert.deepEqual(taskRewardsDependencyVersions({...f.options,config}),versions);config.tables.WeekLotteryPackCfg.revision=1;assert.notDeepEqual(taskRewardsDependencyVersions({...f.options,config}),versions);
});

for(const [label,mutate]of[
 ['absent free gift record',f=>f.state.weekly.gift.shift()],
 ['missing explicit gotTimes',f=>delete f.state.weekly.gift[0].gotTimes],
 ['missing explicit charge',f=>delete f.state.weekly.gift[0].charge],
 ['already claimed',f=>f.state.weekly.gift[0].gotTimes=1],
 ['charged',f=>f.state.weekly.gift[0].charge=1],
 ['duplicate gift',f=>f.state.weekly.gift.push(clone(f.state.weekly.gift[0]))],
 ['missing lottery state',f=>delete f.state.weekly.gotInfo],
 ['missing gotStage',f=>delete f.state.weekly.gotInfo.gotStage],
 ['missing event',f=>f.state.week.activityTime.shift()],
 ['duplicate event',f=>f.state.week.activityTime.push(clone(f.state.week.activityTime[0]))],
 ['missing period',f=>delete f.state.week.activityTime[0].period],
 ['invalid period',f=>f.state.week.activityTime[0].period=0],
 ['missing startTime',f=>delete f.state.week.activityTime[0].startTime],
 ['missing endTime',f=>delete f.state.week.activityTime[0].endTime],
 ['future event',f=>f.state.week.activityTime[0].startTime=1001],
 ['event end inclusive forbidden',f=>f.state.week.activityTime[0].endTime=1000],
 ['no clock',f=>f.client.gameClock=null],
 ['clock crosses event start',f=>f.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'synthetic-A',generation:3,earliestMs:899999,nowMs:1000000,latestMs:1000000})}],
 ['clock crosses event end',f=>f.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'synthetic-A',generation:3,earliestMs:1000000,nowMs:1000000,latestMs:2000000})}],
 ['wrong clock account',f=>f.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'B',generation:3,earliestMs:1000000,nowMs:1000000,latestMs:1000000})}],
 ['wrong clock generation',f=>f.client.factContext.generation++],
 ['missing RUBY',f=>f.state.resources=f.state.resources.filter(r=>r.res!==4)],
 ['RUBY overflow',f=>f.state.resources.find(r=>r.res===4).amount=Number.MAX_SAFE_INTEGER],
 ['coin overflow',f=>f.state.stock.push({itemId:'周转盘币',num:Number.MAX_SAFE_INTEGER})],
 ['missing config',f=>delete f.options.config.tables.WeekLotteryPackCfg],
 ['paid config',f=>f.options.config.tables.WeekLotteryPackCfg.data[0].price=1],
 ['missing price',f=>delete f.options.config.tables.WeekLotteryPackCfg.data[0].price],
 ['duplicate config',f=>f.options.config.tables.WeekLotteryPackCfg.data.push(clone(f.options.config.tables.WeekLotteryPackCfg.data[0]))],
 ['another free config',f=>f.options.config.tables.WeekLotteryPackCfg.data[1].price=0],
 ['multiple claims config',f=>f.options.config.tables.WeekLotteryPackCfg.data[0].limitedTimes=2],
 ['guild reward',f=>f.options.config.tables.WeekLotteryPackCfg.data[0].guildPack=['公会礼包',1]],
 ['unknown reward',f=>f.options.config.tables.WeekLotteryPackCfg.data[0].reward[0][0]='GOLD'],
 ['duplicate reward',f=>f.options.config.tables.WeekLotteryPackCfg.data[0].reward[0][0]='RUBY'],
 ['week read failed',f=>f.state.overrides.WeekInfoRequest=Error('synthetic unavailable')],
 ['lottery read failed',f=>f.state.overrides.WeekLotteryInfoRequest=Error('synthetic unavailable')],
])test('weekly lottery entitlement fails closed: '+label,async()=>{const f=await ready({weekly:true},mutate);assert.equal(f.operation,undefined,label);assert.equal(f.state.writes.length,0);});

test('weekly activity start is inclusive, reordered snapshots and positive existing coins settle exactly',async()=>{
 const f=await ready({weekly:true},f=>{f.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'synthetic-A',generation:3,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};f.state.week.activityTime[0].startTime=1000;f.state.week.activityTime.reverse();f.state.weekly.gift.reverse();f.state.stock.push({itemId:'周转盘币',num:8});});
 assert.ok(f.operation,JSON.stringify(f.row));f.state.weekly.gift.reverse();await f.client.sendWatch('WeekLotteryFreePackRequest',{});
 const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,true);assert.equal(after.stock.get('周转盘币'),9);
});
for(const [label,mutate]of[
 ['no claim',f=>f.state.weekly.gift[0].gotTimes=0],
 ['double claim',f=>f.state.weekly.gift[0].gotTimes=2],
 ['charge changed',f=>f.state.weekly.gift[0].charge=1],
 ['other gift changed',f=>f.state.weekly.gift[1].gotTimes++],
 ['new gift',f=>f.state.weekly.gift.push({giftId:1002,gotTimes:0,charge:0})],
 ['lottery count changed',f=>f.state.weekly.gotInfo.times++],
 ['lottery stage changed',f=>f.state.weekly.gotInfo.gotStage++],
 ['period changed',f=>f.state.week.activityTime[0].period++],
 ['event start changed',f=>f.state.week.activityTime[0].startTime--],
 ['event end changed',f=>f.state.week.activityTime[0].endTime++],
 ['other activity changed',f=>f.state.week.activityTime[1].period++],
 ['coin absent',f=>f.state.stock=f.state.stock.filter(r=>r.itemId!=='周转盘币')],
 ['wrong coin',f=>f.state.stock.find(r=>r.itemId==='周转盘币').num=2],
 ['wrong RUBY',f=>f.state.resources.find(r=>r.res===4).amount=61],
 ['other resource',f=>f.state.resources[0].amount++],
 ['other item',f=>f.state.stock[0].num++],
 ['expired after write',f=>f.state.mono+=1000000],
 ['configuration changed',f=>f.options.config.tables.WeekLotteryPackCfg.revision=1],
 ['connection changed',f=>f.client.factContext.connectionId='new'],
])test('weekly settlement remains unconfirmed: '+label,async()=>{
 const f=await ready({weekly:true});await f.client.sendWatch('WeekLotteryFreePackRequest',{});mutate(f);
 const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);
});

test('weekly canonical contract, live facts, role and freshness cannot be forged',async()=>{
 const f=await ready({weekly:true});await f.client.sendWatch('WeekLotteryFreePackRequest',{});const after=await surveyTaskRewards(f.client,protocol,f.options);
 assert.equal(verifyTaskReward(f.operation,f.facts,after,{}).confirmed,false);assert.equal(verifyTaskReward(f.operation,clone(f.facts),after,null).confirmed,false);
 for(const mutate of[op=>op.target.period++,op=>op.action.body.packId=1000,op=>op.budgetClaims.uids=[],op=>op.expectedState.inventory=[],op=>op.rewards[0].num=2,op=>op.costs=[{id:'RUBY',num:1}]]){const op=clone(f.operation);mutate(op);assert.equal(verifyTaskReward(op,f.facts,after,null).confirmed,false);}
 for(const mutate of[
 f=>f.facts.sourceFacts.week.provenance.sourceAt=Date.now()-30001,
 f=>f.facts.inputs.week.activityTime[0].period++,
 f=>f.facts.stock.set('forged',0),
 f=>f.client.factContext.accountId='B',
 f=>f.client.factContext.generation++,
 f=>f.client.factContext.connectionId='replacement',
 f=>f.options.player.playerId='2',
 f=>f.options.player.worldId='18',
 ]){const x=await ready({weekly:true});mutate(x);assert.equal(planTaskRewards(x.facts,{...x.options,selections:[x.operation.actionId]}).actions.length,0);assert.equal(x.state.writes.length,0);}
 const x=fixture({weekly:true}),limited={...protocol};delete limited.WeekLotteryFreePackRequest;const facts=await surveyTaskRewards(x.client,limited,x.options);assert.equal(viewTaskRewards(facts,x.options).candidates[0].blockedReason,'PROTOCOL_UNAVAILABLE');
});

test('weekly sampling across event boundary and dispatch guard expiry send zero',async t=>{
 const sampled=await ready({weekly:true},f=>{f.state.onRead=n=>{if(n==='AllResourceRequest')f.state.mono+=1000000;};});assert.equal(sampled.operation,undefined);assert.equal(sampled.state.writes.length,0);
 for(const mode of['dispatch','period','config','no-permit']){
  const f=await ready({weekly:true});if(mode==='dispatch')f.state.onDispatch=()=>{f.state.mono+=1000000;};if(mode==='period')f.state.week.activityTime[0].period++;if(mode==='config')f.options.config.tables.WeekLotteryPackCfg.revision=1;
  const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:mode!=='no-permit',budget:budget(f)});assert.equal(result.dispatched,false,mode);assert.equal(f.state.writes.length,0,mode);
 }
});

for(const apply of[true,false])test('weekly Service persists intent and '+(apply?'exact success':'UNKNOWN across restart and new week'),async t=>{
 const f=serviceFixture(t,{weekly:true,apply}),p=await f.plan(),{record}=await f.run(p);
 assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN',record.stopReason);assert.deepEqual(f.state.writes,[{name:'WeekLotteryFreePackRequest',body:{}}]);assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(record.runBudget.reserved.uids,p.budgetClaims.uids);
 if(!apply){const next=serviceFixture(t,{weekly:true,file:f.file});next.state.week.activityTime[0].period++;await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});

test('weekly Service persists before send and keeps approval scoped to account/role/world/connection/config',async t=>{
 for(const mode of['disk','cancel','budget','config','account','role','world','generation','connection']){
  const f=serviceFixture(t,{weekly:true});
  if(mode==='budget'){f.service.claimWorkflow(f.session,'weekly-parent',{limits:{resources:[],quotas:[],uids:[]}});await assert.rejects(f.plan());assert.equal(f.state.writes.length,0);continue;}
  const p=await f.plan();
  if(['config','account','role','world','generation','connection'].includes(mode)){
   if(mode==='config')f.options.config.tables.WeekLotteryPackCfg.revision=1;
   if(mode==='account')f.session.id='B';if(mode==='role')f.session.player.playerId='2';if(mode==='world')f.session.player.worldId='18';if(mode==='generation')f.session.generation++;if(mode==='connection')f.session.connectionId='new';assert.throws(()=>f.authorize(p));assert.equal(f.state.writes.length,0);continue;
  }
  const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}
  try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0,mode);
 }
});
for(const apply of[true,false])test('weekly Tasks/Dailies/Loop aliases share original history and '+(apply?'block duplicate UID':'stop UNKNOWN'),async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{weekly:true,apply}),read=await f.service.surveyModule(f.session,'task-rewards',f.options.parameters),compiled=compileUnifiedExecution({entry:'loop',tasks:[f.options.parameters],dailies:[{...f.options.parameters,action:'claim'}],rounds:2,budget:read.view.candidates[0].budgetClaims},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:()=>f.session});t.after(()=>runner.stop());
 let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(run.plan);run=await runner.resume();assert.equal(run.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.durable.list(f.session.id)[0].workflowNodeId,'tasks-0-1');
 for(const phase of['tasks','dailies'])for(const packId of['1001','赠礼',1000])assert.throws(()=>compileUnifiedExecution({entry:phase,[phase]:[{kind:'weekly-lottery-gift',packId,...(phase==='dailies'?{action:'claim'}:{})}],budget:read.view.candidates[0].budgetClaims},{modules:GAMEPLAY_MODULES}));
});

test('weekly late observation after cancellation is durable UNKNOWN; refusal memory survives reconnect aliases',async t=>{
 const f=serviceFixture(t,{weekly:true}),p=await f.plan();let release;f.state.onWrite=()=>new Promise(r=>release=r);f.service.execute(f.session,f.authorize(p));for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.session.abort.abort();release();await f.service.settle(f.session.id);assert.equal(f.durable.list(f.session.id)[0].finalStatus,'UNKNOWN');
 const next=serviceFixture(t,{weekly:true,file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),no=serviceFixture(t,{weekly:true,apply:false});no.state.onWrite=()=>{throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});};const plan=await no.plan();assert.equal((await no.run(plan)).record.finalStatus,'REJECTED');
 for(const phase of['tasks','dailies']){
  const x=serviceFixture(t,{weekly:true,file:no.file});x.session.connectionId=x.client.factContext.connectionId='replacement-'+phase;const compiled=compileUnifiedExecution({entry:phase,[phase]:[{...x.options.parameters,...(phase==='dailies'?{action:'claim'}:{})}],budget:plan.budgetClaims},{modules:GAMEPLAY_MODULES});
  const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:x.service,claim:(_id,runId,options)=>x.service.claimWorkflow(x.session,runId,options),getSession:()=>x.session});t.after(()=>runner.stop());const run=await runner.start(x.session.id,compiled.graph);assert.equal(run.status,'COMPLETED');assert.ok(run.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));assert.equal(x.state.writes.length,0);
 }
});

test('unique weekly free pack requires explicit gotFree and preserves every unrelated activity field',async()=>{
 const f=await ready({unique:true});assert.ok(f.operation,JSON.stringify(f.row));assert.deepEqual(f.operation.target,{kind:'weekly-unique-lottery-gift',packId:'1000',type:7,period:20001,startTime:900,endTime:2000});
 assert.deepEqual(f.state.reads,['WeekUniqueLotteryRequest','WeekInfoRequest','AllItemRequest','AllResourceRequest']);assert.deepEqual(f.operation.action,{request:'GotUniqueLotteryFreeRequest',response:null,body:{}});assert.deepEqual(f.operation.rewards,[{id:'周翻牌币',num:1},{id:'RUBY',num:10}]);
 assert.equal(f.operation.budgetClaims.uids[0].type,'free-weekly-unique-lottery-gift');
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,'SUCCESS',result.error);assert.deepEqual(f.state.writes,[{name:'GotUniqueLotteryFreeRequest',body:{}}]);assert.equal(f.state.unique.gotFree,true);
 const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(after.stock.get('周翻牌币'),1);assert.equal(after.stock.get('RUBY'),60);assert.equal(viewTaskRewards(after,f.options).candidates[0].blockedReason,'WEEKLY_GIFT_ALREADY_CLAIMED');
});
test('unique weekly public contract and D6 bind fixed free pack and exact config',async()=>{
 const p={kind:'weekly-unique-lottery-gift',packId:'1000'},{validateFunctionParameters}=await import('../src/function-contracts.mjs');assert.deepEqual(validateFunctionParameters('task-rewards',taskRewardsModule,p),p);
 for(const bad of[{kind:p.kind},{...p,packId:1000},{...p,packId:'1001'},{...p,packId:'赠礼'},{...p,taskId:1},{...p,tierId:1}])assert.throws(()=>validateTaskRewardsParameters(bad),{code:'INVALID_PARAMETERS'});
 const a={request:'GotUniqueLotteryFreeRequest',body:{},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));
 for(const body of[null,undefined,[],{packId:1000},{buy:false}])assert.throws(()=>assertPaymentAllowed({...a,body}));
 for(const costs of[null,undefined,Array(1),[{id:'RUBY',num:1}],[{id:'GOLD',num:1}]])assert.throws(()=>assertPaymentAllowed({...a,costs}));
 const f=await ready({unique:true}),v=taskRewardsDependencyVersions(f.options);assert.deepEqual(Object.keys(v.tables),['WeekUniquePackCfg']);const cfg=clone(f.options.config);cfg.tables.WeekLotteryPackCfg={revision:1};assert.deepEqual(taskRewardsDependencyVersions({...f.options,config:cfg}),v);cfg.tables.WeekUniquePackCfg.revision=1;assert.notDeepEqual(taskRewardsDependencyVersions({...f.options,config:cfg}),v);
});
for(const [label,mutate]of[
 ['missing gotFree',f=>delete f.state.unique.gotFree],
 ['non-boolean gotFree',f=>f.state.unique.gotFree=0],
 ['already claimed',f=>f.state.unique.gotFree=true],
 ['ambiguous free gift record',f=>f.state.unique.gift.push({giftId:1000,gotTimes:0,charge:0})],
 ['missing floor',f=>delete f.state.unique.floor],
 ['missing selection',f=>delete f.state.unique.selectId],
 ['missing floor claims',f=>delete f.state.unique.gotFloor],
 ['missing buyTimes',f=>delete f.state.unique.buyTimes],
 ['missing positions',f=>delete f.state.unique.prizePos],
 ['missing position prize',f=>delete f.state.unique.prizePos[0].prizeId],
 ['duplicate positions',f=>f.state.unique.prizePos.push(clone(f.state.unique.prizePos[0]))],
 ['missing gift charge',f=>delete f.state.unique.gift[0].charge],
 ['duplicate gift',f=>f.state.unique.gift.push(clone(f.state.unique.gift[0]))],
 ['normal event does not substitute',f=>f.state.week.activityTime[0].type=4],
 ['duplicate unique event',f=>f.state.week.activityTime.push(clone(f.state.week.activityTime[0]))],
 ['future event',f=>f.state.week.activityTime[0].startTime=1001],
 ['expired event',f=>f.state.week.activityTime[0].endTime=1000],
 ['missing clock',f=>f.client.gameClock=null],
 ['missing RUBY',f=>f.state.resources=f.state.resources.filter(r=>r.res!==4)],
 ['coin overflow',f=>f.state.stock.push({itemId:'周翻牌币',num:Number.MAX_SAFE_INTEGER})],
 ['missing config',f=>delete f.options.config.tables.WeekUniquePackCfg],
 ['paid config',f=>f.options.config.tables.WeekUniquePackCfg.data[0].price=1],
 ['wrong coin',f=>f.options.config.tables.WeekUniquePackCfg.data[0].reward[0][0]='周转盘币'],
 ['guild reward',f=>f.options.config.tables.WeekUniquePackCfg.data[0].guildPack=['礼包',1]],
 ['read failure',f=>f.state.overrides.WeekUniqueLotteryRequest=Error('synthetic unavailable')],
])test('unique weekly qualification fails closed: '+label,async()=>{const f=await ready({unique:true,codec:false},mutate);assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);});
for(const [label,mutate]of[
 ['gotFree absent',f=>delete f.state.unique.gotFree],
 ['not claimed',f=>f.state.unique.gotFree=false],
 ['gift changed',f=>f.state.unique.gift[0].gotTimes++],
 ['floor changed',f=>f.state.unique.floor++],
 ['selection changed',f=>f.state.unique.selectId++],
 ['claimed floor changed',f=>f.state.unique.gotFloor++],
 ['purchase count changed',f=>f.state.unique.buyTimes++],
 ['prize changed',f=>f.state.unique.prizePos[0].prizeId++],
 ['new prize',f=>f.state.unique.prizePos.push({prizeId:3,pos:3})],
 ['period changed',f=>f.state.week.activityTime[0].period++],
 ['unrelated event changed',f=>f.state.week.activityTime[1].period++],
 ['coin missing',f=>f.state.stock.pop()],
 ['RUBY missing',f=>f.state.resources.find(r=>r.res===4).amount=50],
 ['other inventory changed',f=>f.state.stock[0].num++],
 ['event expired',f=>f.state.mono+=1000000],
 ['config changed',f=>f.options.config.tables.WeekUniquePackCfg.revision=1],
])test('unique weekly uncertain settlement stays UNKNOWN: '+label,async()=>{
 const f=await ready({unique:true});await f.client.sendWatch('GotUniqueLotteryFreeRequest',{});mutate(f);const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);
});
test('unique weekly fresh authority, protocol and exact canonical contract cannot be forged',async()=>{
 const f=await ready({unique:true});await f.client.sendWatch('GotUniqueLotteryFreeRequest',{});const after=await surveyTaskRewards(f.client,protocol,f.options);
 assert.equal(verifyTaskReward(f.operation,f.facts,after,{}).confirmed,false);assert.equal(verifyTaskReward(f.operation,clone(f.facts),after,null).confirmed,false);
 for(const change of[o=>o.target.type=4,o=>o.action.request='WeekLotteryFreePackRequest',o=>o.action.body.packId=1000,o=>o.expectedState.daily.gift=[],o=>o.budgetClaims.uids=[],o=>o.rewards[0].id='周转盘币']){const o=clone(f.operation);change(o);assert.equal(verifyTaskReward(o,f.facts,after,null).confirmed,false);}
 for(const change of[f=>f.facts.sourceFacts.week.provenance.sourceAt=Date.now()-30001,f=>f.client.factContext.accountId='B',f=>f.client.factContext.generation++,f=>f.client.factContext.connectionId='replacement',f=>f.options.player.playerId='2',f=>f.options.player.worldId='18']){
  const x=await ready({unique:true});change(x);assert.equal(planTaskRewards(x.facts,{...x.options,selections:[x.operation.actionId]}).actions.length,0);assert.equal(x.state.writes.length,0);
 }
 const x=fixture({unique:true}),p={...protocol};delete p.GotUniqueLotteryFreeRequest;assert.equal(viewTaskRewards(await surveyTaskRewards(x.client,p,x.options),x.options).candidates[0].blockedReason,'PROTOCOL_UNAVAILABLE');
});
for(const apply of[true,false])test('unique weekly original Service and three-entry history '+(apply?'settle and block duplicate':'stop UNKNOWN across restart'),async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{unique:true,apply}),read=await f.service.surveyModule(f.session,'task-rewards',f.options.parameters),compiled=compileUnifiedExecution({entry:'loop',tasks:[f.options.parameters],dailies:[{...f.options.parameters,action:'claim'}],rounds:2,budget:read.view.candidates[0].budgetClaims},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:()=>f.session});t.after(()=>runner.stop());let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const {record}=await f.run(run.plan);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN',record.stopReason);run=await runner.resume();assert.equal(run.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(record.runBudget.reserved.uids,read.view.candidates[0].budgetClaims.uids);
 if(!apply){const next=serviceFixture(t,{unique:true,file:f.file});next.state.week.activityTime[0].period++;await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});
test('unique weekly original Service blocks persist failure, stale authority and parent UID before dispatch',async t=>{
 for(const mode of['disk','cancel','parent','config','expired']){
  const f=serviceFixture(t,{unique:true});if(mode==='parent'){f.service.claimWorkflow(f.session,'unique-parent',{limits:{resources:[],quotas:[],uids:[]}});await assert.rejects(f.plan());continue;}
  const p=await f.plan();if(mode==='config'){f.options.config.tables.WeekUniquePackCfg.revision=1;assert.throws(()=>f.authorize(p));continue;}const permit=f.authorize(p);
  if(mode==='cancel')f.session.abort.abort();else if(mode==='expired')f.state.onDispatch=()=>{f.state.mono+=1000000;};else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}
  try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0,mode);
 }
});
test('unique weekly cancellation late observation and shared refusal use the original durable memory',async t=>{
 const f=serviceFixture(t,{unique:true}),p=await f.plan();let release;f.state.onWrite=()=>new Promise(r=>release=r);f.service.execute(f.session,f.authorize(p));for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.session.abort.abort();release();await f.service.settle(f.session.id);assert.equal(f.durable.list(f.session.id)[0].finalStatus,'UNKNOWN');
 const next=serviceFixture(t,{unique:true,file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),no=serviceFixture(t,{unique:true,apply:false});no.state.onWrite=()=>{throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});};const plan=await no.plan();assert.equal((await no.run(plan)).record.finalStatus,'REJECTED');
 for(const phase of['tasks','dailies']){const x=serviceFixture(t,{unique:true,file:no.file});x.session.connectionId=x.client.factContext.connectionId='replacement-'+phase;const compiled=compileUnifiedExecution({entry:phase,[phase]:[{...x.options.parameters,...(phase==='dailies'?{action:'claim'}:{})}],budget:plan.budgetClaims},{modules:GAMEPLAY_MODULES}),runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:x.service,claim:(_id,runId,options)=>x.service.claimWorkflow(x.session,runId,options),getSession:()=>x.session});t.after(()=>runner.stop());const run=await runner.start(x.session.id,compiled.graph);assert.equal(run.status,'COMPLETED');assert.ok(run.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));assert.equal(x.state.writes.length,0);}
});

test('weekly variants never reuse another variant facts or manufacture authority from empty data',async()=>{
 for(const unique of[true,false]){
  const f=await ready(unique?{unique:true}:{weekly:true}),parameters={kind:unique?'weekly-lottery-gift':'weekly-unique-lottery-gift',packId:'1000'};
  assert.equal(planTaskRewards(f.facts,{...f.options,parameters,selections:[f.operation.actionId]}).actions.length,0);
  assert.equal(viewTaskRewards({}, {...f.options,parameters}).candidates[0].executable,false);assert.equal(f.state.writes.length,0);
 }
});
test('normal weekly refusal identity retains the committed 93bd81f contract across unique-pack extension',async()=>{
 const f=await ready({weekly:true}),prior=clone(f.operation);prior.costSource='Fixed v76 WeekLotteryPackItem free normal pack request; unique WeekLotteryPackCfg1000 zero price, limitedTimes1 and empty guildPack; explicit WeekLotteryGift and trusted WeekInfo activity4 window';
 assert.deepEqual(taskRewardsModule.rejectionIdentity(f.operation),taskRewardsModule.rejectionIdentity(prior));
});

test('chip weekly free pack grants exact held boxes with no resource debit or opening',async()=>{
 const f=await ready({chip:true},f=>f.state.resources=f.state.resources.filter(r=>r.res!==4));assert.ok(f.operation,JSON.stringify(f.row));assert.deepEqual(f.operation.target,{kind:'weekly-chip-gift',packId:'1000',type:6,period:1001,startTime:900,endTime:2000});assert.deepEqual(f.operation.action,{request:'WeekChipGotFreeRequest',response:null,body:{}});assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.rewards,[{id:'白芯片宝箱',num:10}]);
 assert.deepEqual(f.state.reads,['WeekChipInfoRequest','WeekInfoRequest','AllItemRequest','AllResourceRequest']);assert.equal(f.operation.budgetClaims.uids[0].type,'free-weekly-chip-gift');
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,'SUCCESS',result.error);assert.deepEqual(f.state.writes,[{name:'WeekChipGotFreeRequest',body:{}}]);assert.equal(f.state.chip.gifts[0].paidTimes,1);
 const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(after.stock.get('白芯片宝箱'),10);assert.deepEqual(after.daily.gotTaskId,[1]);assert.equal(after.daily.round,1);assert.equal(after.daily.score,100);
});
test('chip weekly public parameters, dependency and empty D6 retain exact free-only semantics',async()=>{
 const p={kind:'weekly-chip-gift',packId:'1000'},{validateFunctionParameters}=await import('../src/function-contracts.mjs');assert.deepEqual(validateFunctionParameters('task-rewards',taskRewardsModule,p),p);
 for(const bad of[{kind:p.kind},{...p,packId:'1001'},{...p,packId:1000},{...p,taskId:1},{...p,tierId:1}])assert.throws(()=>validateTaskRewardsParameters(bad),{code:'INVALID_PARAMETERS'});
 const a={request:'WeekChipGotFreeRequest',body:{},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));for(const body of[null,undefined,[],{giftId:1000},{packId:1000}])assert.throws(()=>assertPaymentAllowed({...a,body}));for(const costs of[undefined,null,Array(1),[{id:'RUBY',num:1}],[{id:'GOLD',num:1}]])assert.throws(()=>assertPaymentAllowed({...a,costs}));
 const f=await ready({chip:true}),v=taskRewardsDependencyVersions(f.options);assert.deepEqual(Object.keys(v.tables),['WeekChipPackCfg']);const cfg=clone(f.options.config);cfg.tables.WeekLotteryPackCfg={revision:1};assert.deepEqual(taskRewardsDependencyVersions({...f.options,config:cfg}),v);cfg.tables.WeekChipPackCfg.revision=1;assert.notDeepEqual(taskRewardsDependencyVersions({...f.options,config:cfg}),v);
});
for(const [label,mutate]of[
 ['absent explicit free record',f=>f.state.chip.gifts.shift()],
 ['missing paidTimes',f=>delete f.state.chip.gifts[0].paidTimes],
 ['already claimed',f=>f.state.chip.gifts[0].paidTimes=1],
 ['negative claim count',f=>f.state.chip.gifts[0].paidTimes=-1],
 ['duplicate gifts',f=>f.state.chip.gifts.push(clone(f.state.chip.gifts[0]))],
 ['missing round',f=>delete f.state.chip.round],
 ['missing score',f=>delete f.state.chip.score],
 ['missing claimed task IDs',f=>delete f.state.chip.gotTaskId],
 ['duplicate claimed task',f=>f.state.chip.gotTaskId=[1,1]],
 ['wrong event',f=>f.state.week.activityTime[0].type=4],
 ['missing period',f=>delete f.state.week.activityTime[0].period],
 ['expired event',f=>f.state.week.activityTime[0].endTime=1000],
 ['future event',f=>f.state.week.activityTime[0].startTime=1001],
 ['unknown clock',f=>f.client.gameClock=null],
 ['box overflow',f=>f.state.stock.push({itemId:'白芯片宝箱',num:Number.MAX_SAFE_INTEGER})],
 ['missing config',f=>delete f.options.config.tables.WeekChipPackCfg],
 ['paid config',f=>f.options.config.tables.WeekChipPackCfg.data[0].price=1],
 ['missing buyLimit',f=>delete f.options.config.tables.WeekChipPackCfg.data[0].buyLimit],
 ['wrong buyLimit',f=>f.options.config.tables.WeekChipPackCfg.data[0].buyLimit=2],
 ['wrong reward',f=>f.options.config.tables.WeekChipPackCfg.data[0].reward=[['紫芯片宝箱',10]]],
 ['guild rewards',f=>f.options.config.tables.WeekChipPackCfg.data[0].guildPack=['礼包',1]],
 ['read failure',f=>f.state.overrides.WeekChipInfoRequest=Error('synthetic unavailable')],
])test('chip weekly explicit qualification fails closed: '+label,async()=>{const f=await ready({chip:true,codec:false},mutate);assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);});
for(const [label,mutate]of[
 ['not claimed',f=>f.state.chip.gifts[0].paidTimes=0],
 ['double count',f=>f.state.chip.gifts[0].paidTimes=2],
 ['other gift changed',f=>f.state.chip.gifts[1].paidTimes++],
 ['new paid gift',f=>f.state.chip.gifts.push({giftId:1002,paidTimes:1})],
 ['round changed',f=>f.state.chip.round++],
 ['score changed',f=>f.state.chip.score++],
 ['extra task claim',f=>f.state.chip.gotTaskId.push(2)],
 ['period changed',f=>f.state.week.activityTime[0].period++],
 ['wrong box amount',f=>f.state.stock.find(r=>r.itemId==='白芯片宝箱').num=9],
 ['box opened or absent',f=>f.state.stock.pop()],
 ['other inventory changed',f=>f.state.stock[0].num++],
 ['other resource changed',f=>f.state.resources[0].amount++],
 ['event expired',f=>f.state.mono+=1000000],
])test('chip weekly incomplete settlement remains unconfirmed: '+label,async()=>{
 const f=await ready({chip:true});await f.client.sendWatch('WeekChipGotFreeRequest',{});mutate(f);const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);
});
for(const apply of[true,false])test('chip weekly unified original Service '+(apply?'persists exact boxes and blocks aliases':'stops UNKNOWN through new week and restart'),async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{chip:true,apply}),read=await f.service.surveyModule(f.session,'task-rewards',f.options.parameters),compiled=compileUnifiedExecution({entry:'loop',tasks:[f.options.parameters],dailies:[{...f.options.parameters,action:'claim'}],rounds:2,budget:read.view.candidates[0].budgetClaims},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:()=>f.session});t.after(()=>runner.stop());let run=await runner.start(f.session.id,compiled.graph);assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const {record}=await f.run(run.plan);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN',record.stopReason);run=await runner.resume();assert.equal(run.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(record.runBudget.reserved.uids,read.view.candidates[0].budgetClaims.uids);
 if(!apply){const next=serviceFixture(t,{chip:true,file:f.file});next.state.week.activityTime[0].period++;await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
});
test('chip weekly fresh seal, exact identity, protocol and before-dispatch expiry prevent any write',async()=>{
 for(const mutate of[f=>f.facts.sourceFacts.week.provenance.sourceAt=Date.now()-30001,f=>f.client.factContext.accountId='B',f=>f.client.factContext.generation++,f=>f.client.factContext.connectionId='new',f=>f.options.player.playerId='2',f=>f.options.player.worldId='18',f=>f.options.config.tables.WeekChipPackCfg.revision=1]){
  const f=await ready({chip:true});mutate(f);assert.equal(planTaskRewards(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);
 }
 const f=await ready({chip:true});f.state.onDispatch=()=>{f.state.mono+=1000000;};assert.equal((await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)})).dispatched,false);assert.equal(f.state.writes.length,0);
 const x=fixture({chip:true}),p={...protocol};delete p.WeekChipGotFreeRequest;assert.equal(viewTaskRewards(await surveyTaskRewards(x.client,p,x.options),x.options).candidates[0].blockedReason,'PROTOCOL_UNAVAILABLE');
});
test('chip weekly Service refuses persist failure, exhausted parent UID, cancellation and late replay',async t=>{
 for(const mode of['disk','parent','cancel','late']){
  const f=serviceFixture(t,{chip:true});if(mode==='parent'){f.service.claimWorkflow(f.session,'chip-parent',{limits:{resources:[],quotas:[],uids:[]}});await assert.rejects(f.plan());assert.equal(f.state.writes.length,0);continue;}
  const p=await f.plan(),permit=f.authorize(p);let release;
  if(mode==='disk'){const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}else if(mode==='cancel')f.session.abort.abort();else f.state.onWrite=()=>new Promise(r=>release=r);
  try{f.service.execute(f.session,permit);if(mode==='late'){for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.session.abort.abort();release();}await f.service.settle(f.session.id);}catch{}
  assert.equal(f.state.writes.length,mode==='late'?1:0);if(mode==='late'){assert.equal(f.durable.list(f.session.id)[0].finalStatus,'UNKNOWN');const next=serviceFixture(t,{chip:true,file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
 }
});
test('chip weekly refusal persists across Tasks and Dailies reconnection aliases',async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{chip:true,apply:false});f.state.onWrite=()=>{throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});};const p=await f.plan();assert.equal((await f.run(p)).record.finalStatus,'REJECTED');
 for(const phase of['tasks','dailies']){const x=serviceFixture(t,{chip:true,file:f.file});x.session.connectionId=x.client.factContext.connectionId='replacement-'+phase;const compiled=compileUnifiedExecution({entry:phase,[phase]:[{...x.options.parameters,...(phase==='dailies'?{action:'claim'}:{})}],budget:p.budgetClaims},{modules:GAMEPLAY_MODULES}),runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:x.service,claim:(_id,runId,options)=>x.service.claimWorkflow(x.session,runId,options),getSession:()=>x.session});t.after(()=>runner.stop());const run=await runner.start(x.session.id,compiled.graph);assert.equal(run.status,'COMPLETED');assert.ok(run.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));assert.equal(x.state.writes.length,0);}
});
test('three weekly free contracts preserve previous source identities and never mix authoritative facts',async()=>{
 const variants=[{weekly:true},{unique:true},{chip:true}],rows=await Promise.all(variants.map(input=>ready(input)));
 for(const f of rows)for(const other of rows)if(f!==other){assert.equal(planTaskRewards(f.facts,{...f.options,parameters:other.options.parameters,selections:[f.operation.actionId]}).actions.length,0);assert.equal(viewTaskRewards({},other.options).candidates[0].executable,false);}
 const oldUnique=clone(rows[1].operation);oldUnique.costSource='Fixed v76 WeekLotteryPackItem GotUniqueLotteryFreeRequest and WeekUniquePackCfg1000: zero price, limitedTimes1, empty guildPack; trusted WeekInfo activity7 window and explicit gotFree=false with no conflicting gift1000 record';assert.deepEqual(taskRewardsModule.rejectionIdentity(oldUnique),taskRewardsModule.rejectionIdentity(rows[1].operation));
 const f=rows[2];await f.client.sendWatch('WeekChipGotFreeRequest',{});const after=await surveyTaskRewards(f.client,protocol,f.options);for(const change of[o=>o.target.type=4,o=>o.action.body.giftId=1000,o=>o.expectedState.daily.score++,o=>o.budgetClaims.uids=[],o=>o.rewards[0].num=11]){const o=clone(f.operation);change(o);assert.equal(verifyTaskReward(o,f.facts,after,null).confirmed,false);}assert.equal(verifyTaskReward(f.operation,f.facts,after,{}).confirmed,false);
});

function chipTaskFixture(input={}){
 const f=fixture({...input,chip:true}),{state,client,options}=f;state.week.activityTime[0].period=3001;state.chip.score=2000;state.chip.gotTaskId=[];
 options.parameters={kind:'weekly-chip-task',round:1,taskId:1};options.config={tables:Object.fromEntries(['WeekChipPointsCfg','WeekChipPeriodCfg','ItemCfg'].map(n=>[n,clone(actual.tables[n])]))};
 const request=client.request.bind(client);
 client.request=async(n,b,r,timeout,opts)=>{
  if(n!=='WeekChipGotTaskRequest')return request(n,b,r,timeout,opts);
  if(input.codec!==false)wire(n,b);assert.equal(opts?.mutate,true);state.onDispatch?.();opts.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});
  const rewards=actual.tables.WeekChipPointsCfg.data.find(row=>row.rwdId===b.taskId).reward,claimed=[...state.chip.gotTaskId,b.taskId].sort((a,b)=>a-b);
  const receipt={round:b.round,gotTaskId:claimed,reward:{asset:rewards.map(([id,num])=>({type:0,id,num}))}};
  if(input.apply!==false){state.chip.gotTaskId=claimed;for(const [id,num]of rewards){const resource=Object.entries(RESOURCE_NAMES).find(([,name])=>name===id)?.[0];if(resource)state.resources.find(row=>String(row.res)===resource).amount+=num;else{const item=state.stock.find(row=>row.itemId===id);if(item)item.num+=num;else state.stock.push({itemId:id,num});}}}
  await state.onWrite?.();const reply=Object.hasOwn(state,'chipReceipt')?state.chipReceipt:receipt;
  return input.codec===false||reply===null?clone(reply):wire(r,reply);
 };
 return f;
}

test('exact weekly chip task request settles configured held rewards through existing Function and executor',async()=>{
 const f=await ready({chipTask:true});assert.ok(f.operation,JSON.stringify(f.row));assert.deepEqual(f.operation.action,{request:'WeekChipGotTaskRequest',response:'WeekChipGotTaskResponse',body:{round:1,taskId:1}});assert.equal(f.operation.target.type,6);assert.equal(f.operation.target.period,3001);assert.equal(f.operation.budgetClaims.uids[0].type,'weekly-chip-task-reward');assert.equal(f.operation.progress,2000);
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,'SUCCESS',result.error);assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.chip.gotTaskId,[1]);assert.equal(f.state.stock.find(row=>row.itemId==='绿芯片宝箱').num,10);assert.equal(f.state.stock.find(row=>row.itemId==='高级专武材料').num,10);
});
for(const round of [1,2,5])test('chip task uses cumulative score after '+round+' explicitly numbered rounds without consuming score',async()=>{
 const f=await ready({chipTask:true},f=>{f.options.parameters.round=round;f.state.chip.round=round;f.state.chip.score=8000*(round-1)+1000;});assert.ok(f.operation,JSON.stringify(f.row));assert.equal(f.operation.progress,1000);
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,'SUCCESS',result.error);assert.equal(f.state.chip.score,8000*(round-1)+1000);
});

test('chip task paired parameters, schema, dependency versions and D6 remain exact and explicit',async()=>{
 const f=await ready({chipTask:true}),{validateFunctionParameters}=await import('../src/function-contracts.mjs');assert.deepEqual(validateFunctionParameters('task-rewards',taskRewardsModule,f.options.parameters),f.options.parameters);
 for(const p of [{kind:'weekly-chip-task',taskId:1},{kind:'weekly-chip-task',round:1},{kind:'weekly-chip-task',round:0,taskId:1},{kind:'weekly-chip-task',round:'1',taskId:1},{kind:'weekly-chip-task',round:1,taskId:1,packId:'1000'},{kind:'daily',round:1,taskId:1001},{kind:'weekly-chip-gift',packId:'1000',round:1}])assert.throws(()=>validateTaskRewardsParameters(p),{code:'INVALID_PARAMETERS'});
 const a={request:'WeekChipGotTaskRequest',body:{round:1,taskId:1},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));for(const body of [{},{round:1},{round:1,taskId:0},{round:'1',taskId:1},{round:1,taskId:1,buy:true}])assert.throws(()=>assertPaymentAllowed({...a,body}));for(const costs of [undefined,null,[{id:'RUBY',num:1}],[{id:'GOLD',num:1}],Array(1)])assert.throws(()=>assertPaymentAllowed({...a,costs}));
 assert.deepEqual(Object.keys(taskRewardsDependencyVersions(f.options).tables),['WeekChipPointsCfg','WeekChipPeriodCfg','ItemCfg']);
});
for(const [label,mutate]of [
 ['missing round',f=>delete f.state.chip.round],['round zero',f=>f.state.chip.round=0],['round mismatch',f=>f.options.parameters.round=2],['round beyond limit',f=>{f.options.parameters.round=6;f.state.chip.round=6;}],
 ['missing score',f=>delete f.state.chip.score],['insufficient score',f=>f.state.chip.score=999],['second round insufficient cumulative score',f=>{f.options.parameters.round=2;f.state.chip.round=2;}],
 ['missing claimed list',f=>delete f.state.chip.gotTaskId],['unknown prior task',f=>f.state.chip.gotTaskId=[99]],['duplicate prior task',f=>f.state.chip.gotTaskId=[2,2]],['already claimed',f=>f.state.chip.gotTaskId=[1]],
 ['unknown period',f=>f.state.week.activityTime[0].period=999],['missing period config',f=>delete f.options.config.tables.WeekChipPeriodCfg],['duplicate period',f=>f.options.config.tables.WeekChipPeriodCfg.data.push(clone(f.options.config.tables.WeekChipPeriodCfg.data[0]))],
 ['missing reward config',f=>delete f.options.config.tables.WeekChipPointsCfg],['duplicate reward task',f=>f.options.config.tables.WeekChipPointsCfg.data.push(clone(f.options.config.tables.WeekChipPointsCfg.data[0]))],['invalid amount',f=>f.options.config.tables.WeekChipPointsCfg.data[0].amount=0],
 ['unknown reward',f=>f.options.config.tables.WeekChipPointsCfg.data[0].reward=[['unknown-reward',1]]],['missing item config',f=>delete f.options.config.tables.ItemCfg],['missing GOLD balance',f=>f.state.resources=f.state.resources.filter(r=>r.res!==3)],
 ['expired activity',f=>f.state.week.activityTime[0].endTime=1000],['activity not started',f=>f.state.week.activityTime[0].startTime=1001],['untrusted clock',f=>f.client.gameClock={read:()=>({status:'UNKNOWN'})}],['read failure',f=>f.state.overrides.WeekChipInfoRequest=Error('synthetic unavailable')],
 ['final unclaimed task transition',f=>{f.state.chip.gotTaskId=[2,3,4,5,6];f.state.chip.score=8000;}],
])test('chip task blocks without exact authority: '+label,async()=>{const f=await ready({chipTask:true,codec:label!=='missing claimed list'},mutate);assert.equal(f.operation,undefined,JSON.stringify(f.row));assert.equal(f.state.writes.length,0);if(label==='final unclaimed task transition')assert.equal(f.row.blockedReason,'WEEKLY_CHIP_ROUND_TRANSITION_UNVERIFIED');});

for(const [label,mutate]of [
 ['no net income',f=>{f.state.stock=f.state.stock.filter(r=>!['绿芯片宝箱','高级专武材料'].includes(r.itemId));f.state.resources.find(r=>r.res===3).amount-=15000;}],
 ['extra stock',f=>f.state.stock[0].num++],['extra score',f=>f.state.chip.score++],['gift changed',f=>f.state.chip.gifts[0].paidTimes=1],['wrong task',f=>f.state.chip.gotTaskId=[2]],['extra task',f=>f.state.chip.gotTaskId=[1,2]],['round changed',f=>f.state.chip.round++],['period changed',f=>f.state.week.activityTime[0].period++],['config changed',f=>f.options.config.tables.WeekChipPointsCfg.revision=1],
])test('chip task independent settlement rejects '+label,async()=>{const f=await ready({chipTask:true});const reply=await f.client.request('WeekChipGotTaskRequest',{round:1,taskId:1},'WeekChipGotTaskResponse',1000,{mutate:true});mutate(f);const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,reply).confirmed,false);});

for(const reply of [null,{}, {round:1,gotTaskId:[1]}, {round:2,gotTaskId:[1],reward:{asset:[]}}, {round:1,gotTaskId:[],reward:{asset:[]}}])test('chip task typed receipt is required: '+JSON.stringify(reply),async()=>{const f=await ready({chipTask:true,codec:false});await f.client.request('WeekChipGotTaskRequest',{round:1,taskId:1},'WeekChipGotTaskResponse',1000,{mutate:true});const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,reply).confirmed,false);});

for(const apply of [true,false])test('chip task shared Service persists exact intent, budget and '+(apply?'confirmed income':'restart UNKNOWN without replay'),async t=>{
 const f=serviceFixture(t,{chipTask:true,apply}),p=await f.plan(),{record}=await f.run(p);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.state.saved.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(f.state.saved.actions[0].parameters,{kind:'weekly-chip-task',round:1,taskId:1});assert.equal(f.state.saved.runBudget.reserved.uids[0].type,'weekly-chip-task-reward');
 if(!apply){const next=serviceFixture(t,{chipTask:true,file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);assert.equal(next.durable.unresolved(next.session.id),true);}
});

test('chip task unified compiler refuses missing identity, cross-kind fields and implicit Dailies actions',async()=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs');
 for(const phase of['tasks','dailies'])for(const row of[{kind:'weekly-chip-task',taskId:1},{kind:'weekly-chip-task',round:1},{kind:'weekly-chip-task',round:1,taskId:0},{kind:'weekly-chip-task',round:2147483648,taskId:1},{kind:'weekly-chip-task',round:1,taskId:1,packId:'1000'},{kind:'weekly-chip-task',round:1,taskId:1,parameters:{}}])assert.throws(()=>compileUnifiedExecution({entry:phase,[phase]:[{...row,...(phase==='dailies'?{action:'claim'}:{})}],budget:{resources:[],quotas:[],uids:[]}},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID'});
 for(const action of[undefined,'perform'])assert.throws(()=>compileUnifiedExecution({entry:'dailies',dailies:[{kind:'weekly-chip-task',round:1,taskId:1,...(action?{action}:{})}],budget:{resources:[],quotas:[],uids:[]}},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID'});
});
test('chip task Service preserves parent budget, durable intent failure and cancellation/late UNKNOWN safety',async t=>{
 for(const mode of['parent','disk','cancel','late']){
  const f=serviceFixture(t,{chipTask:true});if(mode==='parent'){f.service.claimWorkflow(f.session,'chip-task-parent',{limits:{resources:[],quotas:[],uids:[]}});await assert.rejects(f.plan());assert.equal(f.state.writes.length,0);continue;}
  const p=await f.plan(),permit=f.authorize(p);let release;
  if(mode==='disk'){const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}else if(mode==='cancel')f.session.abort.abort();else f.state.onWrite=()=>new Promise(r=>release=r);
  try{f.service.execute(f.session,permit);if(mode==='late'){for(let i=0;i<200&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.session.abort.abort();release();}await f.service.settle(f.session.id);}catch{}
  assert.equal(f.state.writes.length,mode==='late'?1:0);if(mode==='late'){assert.equal(f.durable.list(f.session.id)[0].finalStatus,'UNKNOWN');const next=serviceFixture(t,{chipTask:true,file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);}
 }
});
test('chip task rejection memory is shared by Tasks/Dailies after reconnect and Service restart',async t=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=serviceFixture(t,{chipTask:true,apply:false});f.state.onWrite=()=>{throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});};const p=await f.plan();assert.equal((await f.run(p)).record.finalStatus,'REJECTED');
 for(const phase of['tasks','dailies']){const x=serviceFixture(t,{chipTask:true,file:f.file});x.session.connectionId=x.client.factContext.connectionId='replacement-'+phase;const compiled=compileUnifiedExecution({entry:phase,[phase]:[{...x.options.parameters,...(phase==='dailies'?{action:'claim'}:{})}],budget:p.budgetClaims},{modules:GAMEPLAY_MODULES}),runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:x.service,claim:(_id,runId,options)=>x.service.claimWorkflow(x.session,runId,options),getSession:()=>x.session});t.after(()=>runner.stop());const run=await runner.start(x.session.id,compiled.graph);assert.equal(run.status,'COMPLETED');assert.ok(run.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));assert.equal(x.state.writes.length,0);}
});
test('chip task facts cannot authorize another role/world/connection/generation or unavailable protocol',async()=>{
 for(const mutate of[f=>f.client.factContext.accountId='B',f=>f.client.factContext.generation++,f=>f.client.factContext.connectionId='new',f=>f.options.player.playerId='2',f=>f.options.player.worldId='18',f=>f.options.config.tables.WeekChipPointsCfg.revision=1]){const f=await ready({chipTask:true});mutate(f);assert.equal(planTaskRewards(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);}
 const f=await ready({chipTask:true});f.state.onDispatch=()=>{f.state.mono+=1000000;};assert.equal((await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budget(f)})).dispatched,false);assert.equal(f.state.writes.length,0);
 for(const name of['WeekChipGotTaskRequest','WeekChipGotTaskResponse']){const x=chipTaskFixture(),p={...protocol};delete p[name];assert.equal(viewTaskRewards(await surveyTaskRewards(x.client,p,x.options),x.options).candidates[0].blockedReason,'PROTOCOL_UNAVAILABLE');}
});
for(const [label,mutate]of [
 ['wrong reward id',r=>r.reward.asset[0].id='白芯片宝箱'],['wrong reward amount',r=>r.reward.asset[0].num=11],['wrong reward type',r=>r.reward.asset[0].type=1],['duplicate reward',r=>r.reward.asset.push(clone(r.reward.asset[0]))],['missing reward',r=>r.reward.asset.pop()],['duplicate claimed task',r=>r.gotTaskId.push(1)],['unknown claimed task',r=>r.gotTaskId.push(99)],
])test('chip task exact postread cannot hide a conflicting typed receipt: '+label,async()=>{
 const f=await ready({chipTask:true,codec:false}),reply=await f.client.request('WeekChipGotTaskRequest',{round:1,taskId:1},'WeekChipGotTaskResponse',1000,{mutate:true});mutate(reply);const after=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(verifyTaskReward(f.operation,f.facts,after,reply).confirmed,false);
});
test('chip task exact receipt and reread never confirm a tampered original operation',async()=>{
 const f=await ready({chipTask:true}),reply=await f.client.request('WeekChipGotTaskRequest',{round:1,taskId:1},'WeekChipGotTaskResponse',1000,{mutate:true}),after=await surveyTaskRewards(f.client,protocol,f.options);
 for(const mutate of[o=>o.target.round=2,o=>o.action.body.taskId=2,o=>o.rewards[0].num++,o=>o.expectedState.daily.score++,o=>o.budgetClaims.uids=[]]){const o=clone(f.operation);mutate(o);assert.equal(verifyTaskReward(o,f.facts,after,reply).confirmed,false);}
});