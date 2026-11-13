import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { taskRewardsModule, validateTaskRewardsConfig, validateTaskRewardsParameters, surveyTaskRewards, viewTaskRewards, planTaskRewards, verifyTaskReward, taskRewardsDependencyVersions } from '../src/task-rewards.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createWorkflowRunner, validateWorkflow } from '../src/workflow.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

// Actual local codecs and config; all account state and transport are synthetic.
const protocol=loadProtocol(), actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v), wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
const enabled={enabled:true}, parameters={kind:'main',taskId:1}, player=()=>({playerId:'9007199254740993',worldId:'17'});
function cfg(){return {tables:{MainTaskCfg:clone(actual.tables.MainTaskCfg),BranchTaskCfg:clone(actual.tables.BranchTaskCfg),AchievementTaskCfg:clone(actual.tables.AchievementTaskCfg),ItemCfg:clone(actual.tables.ItemCfg)}};}
function fake({codec=true,apply=true,context={},overrides={},watchStatus='UNKNOWN'}={}){
 const state={achievements:{task:[{id:1001,progress:'9223372036854775807',targetProgress:'9223372036854775807',rewardClaimed:false},{id:1002,progress:'0',targetProgress:'1',rewardClaimed:false}]},tasks:{task:{taskId:1,progress:15,rewardClaimed:false},branch:[{taskId:8001,progress:1},{taskId:8002,progress:0}]},stock:new Map([['塑料',20],['unrelated',7]]),resources:[{res:1,amount:100},{res:3,amount:200},{res:4,amount:50}],reads:[],writes:[],onRead:null,onWrite:null,overrides,apply};
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-tasks',...context},pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
  markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
  async request(n,b,r,_timeout,options){assert.equal(options?.mutate,undefined);if(codec)wire(n,b);state.reads.push(n);await state.onRead?.(n);let value=n==='AchievementInfoRequest'?state.achievements:n==='MainTaskInfoRequest'?state.tasks:n==='AllItemRequest'?{items:[...state.stock].map(([itemId,num])=>({itemId,num}))}:n==='AllResourceRequest'?{list:state.resources}:null;if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected synthetic read '+n);return codec?wire(r,value):clone(value);},
  async sendWatch(n,b,options){options?.beforeDispatch?.();wire(n,b);state.writes.push({name:n,body:clone(b)});if(state.apply&&n==='GotAchievementRewardRequest'){state.achievements.task.find(row=>row.id===b.id).rewardClaimed=true;state.resources.find(row=>row.res===4).amount+=20;}else if(state.apply){const kind=n==='DrawMainTaskRewardRequest'?'main':'branch',row=actual.tables[kind==='main'?'MainTaskCfg':'BranchTaskCfg'].data.find(row=>row.taskId===b.taskId);if(kind==='main')state.tasks.task.rewardClaimed=true;else state.tasks.branch=state.tasks.branch.filter(row=>row.taskId!==b.taskId);for(const[id,num]of row.reward){if(id==='EXP')state.resources[0].amount+=num;else state.stock.set(id,(state.stock.get(id)??0)+num);}}await state.onWrite?.(n,b);return {status:watchStatus};},
 };return {client,state};
}
const opts=(config,extra={})=>({config,player:player(),parameters,moduleConfig:enabled,...extra});
async function ready(input={},extra={}){const config=cfg(),f=fake(input),options=opts(config,extra),facts=await surveyTaskRewards(f.client,protocol,options),row=viewTaskRewards(facts,options).candidates[0],operation=planTaskRewards(facts,{...options,selections:row?[row.actionId]:[]}).actions[0];return {...f,config,options,facts,operation};}
async function claimed(f,mutate){await f.client.sendWatch(f.operation.action.request,f.operation.action.body);mutate?.(f.state);return surveyTaskRewards(f.client,protocol,f.options);}

test('default disabled semantics adapter has strict fields, paired exact ID and no caller getters',()=>{
 assert.equal(taskRewardsModule.execute,undefined);assert.deepEqual(taskRewardsModule.defaultConfig,{enabled:false});assert.deepEqual(taskRewardsModule.capabilities,['C502','C503','C516']);assert.deepEqual(validateTaskRewardsParameters({}),{});assert.deepEqual(validateTaskRewardsParameters({kind:'branch',taskId:2147483647}),{kind:'branch',taskId:2147483647});
 for(const v of[null,[],{kind:'main'},{taskId:1},{kind:'unknown',taskId:1},{kind:'main',taskId:0},{kind:'main',taskId:'1'},{kind:'branch',taskId:2147483648},{kind:'main',taskId:1,request:'Buy'},Object.create(parameters)])assert.throws(()=>validateTaskRewardsParameters(v),{code:'INVALID_PARAMETERS'});
 const getter={};Object.defineProperty(getter,'kind',{enumerable:true,get(){throw Error('must not execute');}});assert.throws(()=>validateTaskRewardsParameters(getter),{code:'INVALID_PARAMETERS'});
 for(const v of[{enabled:1},{enabled:true,automatic:true},Object.create({enabled:true})])assert.throws(()=>validateTaskRewardsConfig(v),{code:'INVALID_PARAMETERS'});
});
test('actual codecs and configuration produce zero debit, one exact task ID and shared entity reservation',async()=>{
 const f=await ready();assert.ok(f.operation);assert.deepEqual(f.state.reads.sort(),['AllItemRequest','AllResourceRequest','MainTaskInfoRequest']);assert.equal(f.facts.context.playerId,'9007199254740993');assert.deepEqual(f.operation.rewards,[{id:'EXP',num:5},{id:'塑料',num:15}]);assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.action,{request:'DrawMainTaskRewardRequest',response:null,body:{taskId:1}});assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'task-reward',id:'main:1'}]});assert.equal(protocol.DrawMainTaskRewardResponse,undefined);assert.equal(protocol.GotBranchTaskRewardResponse,undefined);assert.equal(f.state.writes.length,0);
 for(const[key,name]of[['tasks','MainTaskInfoResponse'],['items','AllItemResponse'],['resources','AllResourceResponse']]){assert.equal(f.facts.sourceFacts[key].provenance.source,name);assert.deepEqual(f.facts.sourceFacts[key].value,f.facts.inputs[key]);}
});
test('explicit single selection, enabled switch and eligibility are required',async()=>{
 const f=await ready();for(const selections of[[],['forged']])assert.equal(planTaskRewards(f.facts,{...f.options,selections}).actions.length,0);assert.equal(planTaskRewards(f.facts,{...f.options,moduleConfig:undefined,selections:[f.operation.actionId]}).actions.length,0);
 for(const selections of[['a','b'],Array(1),'x',[1]])assert.throws(()=>planTaskRewards(f.facts,{...f.options,selections}),{code:'INVALID_PARAMETERS'});
 const all=viewTaskRewards(f.facts,{...f.options,parameters:{}}).candidates;assert.equal(all.length,3);assert.equal(all.find(row=>row.target.taskId===8002).blockedReason,'TASK_INCOMPLETE');assert.equal(f.state.writes.length,0);
});
for(const[label,raw]of[['missing branch',{task:{taskId:1,progress:15,rewardClaimed:false}}],['missing claimed',{task:{taskId:1,progress:15},branch:[]}],['missing progress',{task:{taskId:1,rewardClaimed:false},branch:[]}],['duplicate branch',{branch:[{taskId:8001,progress:1},{taskId:8001,progress:1}]}],['invalid count',{task:{taskId:1,progress:-1,rewardClaimed:false},branch:[]}],['sparse branch',{branch:Array(1)}]])test('unknown task authority: '+label,async()=>{const f=await ready({codec:false,overrides:{MainTaskInfoRequest:raw}});assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);});
test('missing role, inconsistent connection role, unknown resources and failed reads cannot grant eligibility',async()=>{
 for(const extra of[{player:{}},{player:{playerId:Number.MAX_SAFE_INTEGER+1,worldId:1}},{player:Object.create(player())}])assert.equal((await ready({},extra)).operation,undefined);
 assert.equal((await ready({context:{playerId:'2'}})).operation,undefined);
 for(const[name,value]of[['AllItemRequest',{}],['AllResourceRequest',{list:[]}],['MainTaskInfoRequest',new Error('token=hidden')],['AllItemRequest',{items:[{itemId:'EXP',num:1}]}]]){const f=await ready({codec:false,overrides:{[name]:value}});assert.equal(f.operation,undefined);assert.doesNotMatch(JSON.stringify(f.facts.notes),/hidden/);}
});
test('fresh facts bind exact source, stock, context and full relevant config revisions',async()=>{
 const f=await ready();for(const mutate of[x=>x.sourceFacts.items.provenance.sourceAt=Date.now()-30001,x=>x.sourceFacts.tasks.provenance.sourceAt=Date.now()+10000,x=>x.sourceFacts.tasks.provenance.accountId='B',x=>x.sourceFacts.tasks.provenance.generation++,x=>x.sourceFacts.tasks.provenance.source='Fake',x=>x.sourceFacts.tasks.provenance.scope={kind:'ENTITY',key:'wrong'},x=>x.inputs.tasks.task.progress++,x=>x.tasks.main.progress++,x=>x.stock.set('forged-zero',0),x=>x.state.inventory[0].num++,x=>x.configEvidence.tables.MainTaskCfg.revision=2]){const facts=clone(f.facts);mutate(facts);assert.equal(planTaskRewards(facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);}
 const before=taskRewardsDependencyVersions(f.options);for(const name of['MainTaskCfg','BranchTaskCfg','ItemCfg']){const config=clone(f.config);config.tables[name].revision=2;assert.notDeepEqual(taskRewardsDependencyVersions({...f.options,config}),before);}const config=clone(f.config);config.tables.UnrelatedCfg={data:[]};assert.deepEqual(taskRewardsDependencyVersions({...f.options,config}),before);
});
test('slow sibling never refreshes earlier task completion time',async t=>{
 let now=100000,release;t.mock.method(Date,'now',()=>now);const f=fake(),config=cfg(),options=opts(config);f.state.onRead=n=>n==='AllResourceRequest'?new Promise(resolve=>release=resolve):undefined;const pending=surveyTaskRewards(f.client,protocol,options);await new Promise(setImmediate);now+=40000;release();const facts=await pending;assert.equal(facts.sourceFacts.tasks.provenance.sourceAt,100000);assert.equal(viewTaskRewards(facts,options).candidates[0].executable,false);
});
test('cancellation and changing account/generation/role stop sampling with zero writes',async()=>{
 for(const mutate of[(c,p)=>c.factContext.generation++,(c,p)=>c.factContext.connectionId='new',(c,p)=>p.worldId='18']){const f=fake(),options=opts(cfg());f.state.onRead=n=>{if(n==='MainTaskInfoRequest')mutate(f.client,options.player);};await assert.rejects(surveyTaskRewards(f.client,protocol,options),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);}
 const f=fake(),abort=new AbortController();f.state.onRead=n=>{if(n==='MainTaskInfoRequest'){queueMicrotask(()=>abort.abort());return new Promise(()=>{});}};await assert.rejects(surveyTaskRewards(f.client,protocol,{...opts(cfg()),signal:abort.signal}),{code:'CANCELLED'});
});
for(const kind of['main','branch'])test(kind+' reward needs exact claim transition and full reward net income',async()=>{const f=await ready({}, {parameters:{kind,taskId:kind==='main'?1:8001}}),after=await claimed(f);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,true);assert.equal(verifyTaskReward(f.operation,f.facts,f.facts,null).confirmed,false);assert.equal(verifyTaskReward(f.operation,f.facts,after,{success:true}).confirmed,false);});
for(const[label,mutate]of[['main advances',s=>s.tasks.task={taskId:2,progress:1,rewardClaimed:false}],['claim flag missing',s=>delete s.tasks.task.rewardClaimed],['reward absent',s=>s.stock.set('塑料',20)],['extra income',s=>s.stock.set('塑料',36)],['unrelated item',s=>s.stock.set('unrelated',8)],['other branch changes',s=>s.tasks.branch[1].progress++],['resource consumption',s=>s.resources[1].amount--]])test('unconfirmed claim: '+label,async()=>{const f=await ready(),after=await claimed(f,mutate);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);});
test('forged expected income, identity, budget, request and config cannot confirm',async()=>{
 const f=await ready(),after=await claimed(f);for(const mutate of[o=>o.expectedState.inventory=[],o=>o.actionId='forged',o=>o.identity='forged',o=>o.budgetClaims.uids=[],o=>o.action.body.extra=true,o=>o.action.body.taskId=2,o=>o.costs=[{id:'GOLD',num:1}],o=>o.rewards=[],o=>o.parameters.kind='branch']){const op=clone(f.operation);mutate(op);assert.equal(verifyTaskReward(op,f.facts,after,null).confirmed,false);}
 const changed=clone(after);changed.configEvidence.tables.MainTaskCfg.revision=3;assert.equal(verifyTaskReward(f.operation,f.facts,changed,null).confirmed,false);const old=clone(after);old.sourceFacts.items.provenance.sourceAt=f.facts.sourceFacts.items.provenance.sourceAt-1;assert.equal(verifyTaskReward(f.operation,f.facts,old,null).confirmed,false);
});
test('D6 admits only exact task body and explicitly empty debit metadata',()=>{
 for(const request of['DrawMainTaskRewardRequest','GotBranchTaskRewardRequest']){assert.doesNotThrow(()=>assertPaymentAllowed({request,body:{taskId:1},costs:[]}));for(const action of[{request,body:{taskId:1}},{request,body:{taskId:0},costs:[]},{request,body:{taskId:1,buy:false},costs:[]},{request,body:{taskId:1},costs:[{id:'GOLD',num:1}]},{request,body:{taskId:1},costs:[{id:'RUBY',num:1}]}])assert.throws(()=>assertPaymentAllowed(action));}
});
function budgetFor(f){const scope={accountId:'synthetic-A',generation:3,connectionId:'offline-tasks',runId:'synthetic-run'},limits=f.operation.budgetClaims;return {ledger:null,runBudget:createRunBudgetContext({scope,limits}),scope,limits,batchId:'synthetic-batch'};}
test('shared executor performs fresh eligibility, confirms observed reward and keeps UNKNOWN without replay',async()=>{
 for(const apply of[true,false]){const f=await ready({apply}),result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budgetFor(f)});assert.equal(result.status,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,apply?0:1);}
 for(const mode of['no-permit','disabled','state-changed','forged']){const f=await ready();if(mode==='disabled')f.options.moduleConfig={enabled:false};if(mode==='state-changed')f.state.tasks.task.progress++;if(mode==='forged')f.operation.expectedState.inventory=[];const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:mode!=='no-permit'});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);}
});

function serviceFixture(t,{apply=true,watchStatus='UNKNOWN',enabled=true,file=null,selectedParameters=parameters}={}){
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-tasks-')):null;file??=path.join(dir,'history.json');const durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(clone(row));return durable.put(row);}},config=cfg(),f=fake({apply,watchStatus});
 const session={id:'synthetic-A',client:f.client,player:player(),generation:3,connectionId:'offline-tasks',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:{enabled}})},getConfig:()=>config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.sendWatch.bind(f.client);f.client.sendWatch=async(...args)=>{f.state.durableBeforeWrite=clone(journal.at(-1));return send(...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}});
 async function plan(){const read=await service.surveyModule(session,'task-rewards',selectedParameters),row=read.view.candidates[0];assert.ok(row.executable);return service.plan(session,{module:'task-rewards',mode:'Manual',parameters:selectedParameters,selections:[row.actionId]});}
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(row=>row.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function run(p){const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};}
 return {...f,session,service,config,durable,history,journal,file,plan,authorize,run};
}
test('registered Service persists intent and entity reservation before one exact send, and durable success after',async t=>{
 const f=serviceFixture(t),plan=await f.plan();assert.equal(plan.actions[0].action,undefined);assert.deepEqual(plan.resourceBudget,[]);assert.throws(()=>f.service.execute(f.session,{batchId:plan.batchId,permitId:'fake'}));const {permit,record}=await f.run(plan);assert.equal(record.finalStatus,'SUCCESS');assert.equal(record.actions[0].verification.status,'CONFIRMED');assert.equal(f.state.writes.length,1);const saved=f.state.durableBeforeWrite;assert.equal(saved.actions[0].requestStatus,'DISPATCHING');assert.equal(saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.equal(saved.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(saved.runBudget.reserved.uids,[{type:'task-reward',id:'main:1'}]);assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,'SUCCESS');assert.throws(()=>f.service.execute(f.session,permit));
});
test('durable UNKNOWN survives new Service and blocks another plan without a new send',async t=>{
 const f=serviceFixture(t,{apply:false}),{record}=await f.run(await f.plan());assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(f.service.executionMemory(f.session.id).events[0].status,'UNKNOWN');const restarted=serviceFixture(t,{file:f.file});assert.equal(restarted.service.status(f.session.id).blocked,true);await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);
});
test('deterministic rejection is stored in shared memory and blocks unchanged identity after restart',async t=>{
 const f=serviceFixture(t,{apply:false,watchStatus:'REJECTED'}),{record}=await f.run(await f.plan());assert.equal(record.finalStatus,'REJECTED');assert.equal(f.service.executionMemory(f.session.id).events[0].status,'REJECTED');const restarted=serviceFixture(t,{file:f.file});await assert.rejects(restarted.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(restarted.state.writes.length,0);
});
test('dispatch-intent persistence failure and cancellation prevent transport',async t=>{
 for(const mode of['disk','cancel']){const f=serviceFixture(t),plan=await f.plan(),permit=f.authorize(plan);if(mode==='cancel')f.session.abort.abort();else {const put=f.history.put;f.history.put=row=>{if(row.actions?.some(action=>action.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('synthetic disk failure');return put(row);};}try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0,mode);}
});
test('account, role, connection and config changes invalidate approval without sending',async t=>{
 for(const mutate of[f=>f.session.id='B',f=>f.session.player.worldId='18',f=>f.session.generation++,f=>f.session.connectionId='new',f=>f.config.tables.MainTaskCfg.revision=2]){const f=serviceFixture(t),plan=await f.plan();mutate(f);assert.throws(()=>f.authorize(plan));assert.equal(f.state.writes.length,0);}
 const f=serviceFixture(t,{enabled:false}),read=await f.service.surveyModule(f.session,'task-rewards',parameters);assert.equal(read.view.candidates[0].executable,false);
});

test('registered Tasks Workflow pauses for the exact existing Service batch and resumes only after verified history',async t=>{
 const f=serviceFixture(t),surveyed=await f.service.surveyModule(f.session,'task-rewards',parameters),actionId=surveyed.view.candidates[0].actionId;
 const graph={version:1,id:'synthetic-tasks-workflow',name:'Synthetic tasks',budget:{resources:[],quotas:[],uids:[{type:'task-reward',id:'main:1'}]},nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'task-rewards',parameters},{id:'a',type:'ACTION',module:'task-rewards',parameters,selection:actionId},{id:'v',type:'VERIFY',module:'task-rewards'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');const plan=result.plan;await f.run(plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.state.writes.length,1);const record=f.durable.list(f.session.id)[0];assert.equal(record.workflowId,result.runId);assert.equal(record.workflowNodeId,'a');assert.equal(record.workflowDefinitionId,graph.id);
});
test('invalid config rewards and ambiguous definitions block only their exact task operation',async()=>{
 for(const mutate of[c=>c.tables.MainTaskCfg.data.push(clone(c.tables.MainTaskCfg.data[0])),c=>c.tables.MainTaskCfg.data[0].reward=[['unknown',1]],c=>c.tables.MainTaskCfg.data[0].reward=[['EXP',1],['EXP',1]],c=>c.tables.MainTaskCfg.data[0].reward=[['EXP',Number.MAX_SAFE_INTEGER]],c=>delete c.tables.MainTaskCfg]){const f=await ready();mutate(f.config);const facts=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(viewTaskRewards(facts,f.options).candidates[0].executable,false);const branch=viewTaskRewards(facts,{...f.options,parameters:{kind:'branch',taskId:8001}}).candidates[0];assert.equal(branch.executable,true);}
});
test('missing protocol cannot create candidate and no read failure exposes diagnostic secrets',async()=>{
 const f=await ready(),missing={...protocol};delete missing.DrawMainTaskRewardRequest;const facts=await surveyTaskRewards(f.client,missing,f.options);assert.equal(viewTaskRewards(facts,f.options).candidates[0].blockedReason,'PROTOCOL_UNAVAILABLE');delete missing.MainTaskInfoResponse;const noRead=await surveyTaskRewards(f.client,missing,f.options);assert.equal(viewTaskRewards(noRead,f.options).candidates[0].executable,false);
});
test('branch removal cannot confirm changed main, another removal or wrong reward income',async()=>{
 for(const mutate of[s=>s.tasks.task.progress++,s=>s.tasks.branch=[],s=>s.stock.set('紫装材料自选包',19)]){const f=await ready({}, {parameters:{kind:'branch',taskId:8001}}),after=await claimed(f,mutate);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);}
});
test('cancellation after send retains durable UNKNOWN and never repeats the command',async t=>{
 const f=serviceFixture(t),plan=await f.plan();f.state.onWrite=()=>f.session.abort.abort();const {record}=await f.run(plan);assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),true);
});

const achievementParameters={kind:'achievement',taskId:1001};
const readyAchievement=(input={},extra={})=>ready(input,{parameters:achievementParameters,...extra});
test('achievement uses fixed v76 ID/config mapping, exact signed int64 and an empty debit',async()=>{
 const f=await readyAchievement();assert.ok(f.operation,JSON.stringify(viewTaskRewards(f.facts,f.options)));assert.deepEqual(validateTaskRewardsParameters(achievementParameters),achievementParameters);
 assert.deepEqual(f.state.reads,['AchievementInfoRequest','AllItemRequest','AllResourceRequest']);
 assert.equal(f.operation.progress,'9223372036854775807');assert.equal(f.operation.requiredProgress,'9223372036854775807');
 assert.deepEqual(f.operation.action,{request:'GotAchievementRewardRequest',response:null,body:{id:1001}});
 assert.deepEqual(f.operation.rewards,[{id:'RUBY',num:20}]);assert.deepEqual(f.operation.costs,[]);
 assert.deepEqual(f.operation.budgetClaims.uids,[{type:'task-reward',id:'achievement:1001'}]);
 const after=await claimed(f);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,true);
 assert.equal(planTaskRewards(after,{...f.options,selections:[f.operation.actionId]}).actions.length,0);
});
for(const [label,raw] of [
 ['missing task',{}],['sparse', {task:Array(1)}],
 ['duplicate',{task:[{id:1001,progress:'1',targetProgress:'1',rewardClaimed:false},{id:1001,progress:'1',targetProgress:'1',rewardClaimed:false}]}],
 ...['progress','targetProgress','rewardClaimed'].map(key=>{const row={id:1001,progress:'1',targetProgress:'1',rewardClaimed:false};delete row[key];return ['missing '+key,{task:[row]}];}),
 ...[-1,9007199254740992,'9223372036854775808','01',{low:1,high:0,unsigned:true}].map(progress=>['invalid int64 '+JSON.stringify(progress),{task:[{id:1001,progress,targetProgress:'1',rewardClaimed:false}]}]),
 ['zero target',{task:[{id:1001,progress:'1',targetProgress:'0',rewardClaimed:false}]}],
])test('achievement cannot infer authority: '+label,async()=>{
 const f=await readyAchievement({codec:false,overrides:{AchievementInfoRequest:raw}});
 assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);
});
test('achievement blocks incomplete, claimed, unknown IDs, ambiguous rewards, and absent resource balance',async()=>{
 for(const overrides of[{parameters:{kind:'achievement',taskId:1002}},{parameters:{kind:'achievement',taskId:999999}}])assert.equal((await readyAchievement({},overrides)).operation,undefined);
 for(const mutate of [
  f=>f.state.achievements.task[0].rewardClaimed=true,
  f=>f.state.resources=f.state.resources.filter(row=>row.res!==4),
  f=>f.config.tables.AchievementTaskCfg.data.push(clone(f.config.tables.AchievementTaskCfg.data[0])),
  f=>f.config.tables.AchievementTaskCfg.data[0].reward=['RUBY',0],
  f=>f.config.tables.AchievementTaskCfg.data[0].reward=['unknown-reward',1]
 ]){const f=await readyAchievement();mutate(f);const facts=await surveyTaskRewards(f.client,protocol,f.options);assert.equal(planTaskRewards(facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);}
});
test('achievement facts cannot be cloned, altered, renewed or reused on another connection',async()=>{
 for(const mutate of [
  f=>f.facts=clone(f.facts),f=>f.facts.inputs.tasks.task[0].targetProgress='1',
  f=>f.facts.configEvidence.tables.AchievementTaskCfg.data[0].reward=['RUBY',999],
  f=>f.facts.sourceFacts.tasks.provenance.sourceAt=Date.now()+1000,
  f=>f.client.factContext.connectionId='new',f=>f.client.factContext.generation++,
  f=>f.client.factContext.accountId='B',f=>f.options.player.worldId='18',f=>f.client.connected=false
 ]){const f=await readyAchievement();mutate(f);assert.equal(planTaskRewards(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);}
});
for(const [label,mutate] of [
 ['reward absent',s=>s.resources.find(row=>row.res===4).amount-=20],
 ['extra reward',s=>s.resources.find(row=>row.res===4).amount++],
 ['other task changes',s=>s.achievements.task[1].progress='1'],
 ['target changes',s=>s.achievements.task[0].targetProgress='1'],
 ['task removed',s=>s.achievements.task.shift()],
 ['wrong claim',s=>{s.achievements.task[0].rewardClaimed=false;s.achievements.task[1].rewardClaimed=true;}],
 ['unrelated debit',s=>s.resources.find(row=>row.res===3).amount--]
])test('achievement uncertain settlement: '+label,async()=>{
 const f=await readyAchievement(),after=await claimed(f,mutate);assert.equal(verifyTaskReward(f.operation,f.facts,after,null).confirmed,false);
});
test('achievement D6 permits only exact ID with explicit zero debit',()=>{
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'GotAchievementRewardRequest',body:{id:1001},costs:[]}));
 for(const action of [
 {body:{id:1001}},{body:{id:0},costs:[]},{body:{id:1001,buy:false},costs:[]},
 {body:{id:1001},costs:[{id:'RUBY',num:1}]},{body:{id:1001},costs:[{id:'GOLD',num:1}]}
 ])assert.throws(()=>assertPaymentAllowed({request:'GotAchievementRewardRequest',...action}));
});
for(const apply of[true,false])test('achievement shared executor independently settles or retains UNKNOWN '+apply,async()=>{
 const f=await readyAchievement({apply}),result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budgetFor(f)});
 assert.equal(result.status,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,apply?0:1);
});
for(const apply of[true,false])test('achievement Service persists UID intent and durable success/UNKNOWN across restart '+apply,async t=>{
 const f=serviceFixture(t,{apply,selectedParameters:achievementParameters}),p=await f.plan(),{record}=await f.run(p);
 assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);
 assert.equal(f.state.durableBeforeWrite.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');
 assert.deepEqual(f.state.durableBeforeWrite.runBudget.reserved.uids,[{type:'task-reward',id:'achievement:1001'}]);
 const restarted=serviceFixture(t,{file:f.file,selectedParameters:achievementParameters});
 if(!apply){await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);}
 assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,apply?'SUCCESS':'UNKNOWN');
});
test('achievement late result on replaced connection cannot confirm or continue',async()=>{
 const f=await readyAchievement();let release;f.state.onWrite=()=>new Promise(resolve=>release=resolve);
 const pending=executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:taskRewardsModule,allowMutate:true,budget:budgetFor(f)});
 for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);
 assert.ok(release);f.client.factContext.connectionId='replacement';release();
 const result=await pending;assert.notEqual(result.status,'SUCCESS');assert.equal(f.state.writes.length,1);
});

test('registered Achievement Workflow pauses for the exact existing Service batch and resumes only after verified history',async t=>{
 const parameters=achievementParameters,f=serviceFixture(t,{selectedParameters:parameters}),surveyed=await f.service.surveyModule(f.session,'task-rewards',parameters),actionId=surveyed.view.candidates[0].actionId;
 const graph={version:1,id:'synthetic-tasks-workflow',name:'Synthetic tasks',budget:{resources:[],quotas:[],uids:[{type:'task-reward',id:'achievement:1001'}]},nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'task-rewards',parameters},{id:'a',type:'ACTION',module:'task-rewards',parameters,selection:actionId},{id:'v',type:'VERIFY',module:'task-rewards'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');const plan=result.plan;await f.run(plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.state.writes.length,1);const record=f.durable.list(f.session.id)[0];assert.equal(record.workflowId,result.runId);assert.equal(record.workflowNodeId,'a');assert.equal(record.workflowDefinitionId,graph.id);
});
for(const selectedParameters of [parameters,{kind:'branch',taskId:8001},{kind:'achievement',taskId:1001}])test(selectedParameters.kind+' refusal survives a new connection and generation without rewriting v1 events',async t=>{
 const f=serviceFixture(t,{apply:false,watchStatus:'REJECTED',selectedParameters});await f.run(await f.plan());
 const memoryFile=f.file+'.memory.json',before=fs.readFileSync(memoryFile,'utf8'),historyBefore=fs.readFileSync(f.file,'utf8');
 const restarted=serviceFixture(t,{file:f.file,selectedParameters});restarted.session.connectionId=restarted.client.factContext.connectionId='new-offline-connection';restarted.session.generation=restarted.client.factContext.generation=4;
 await assert.rejects(restarted.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(restarted.state.writes.length,0);
 assert.equal(fs.readFileSync(memoryFile,'utf8'),before);assert.equal(fs.readFileSync(f.file,'utf8'),historyBefore);
});
for(const changed of ['progress','config','player','world'])test('fresh task '+changed+' changes permit a new plan while retaining the original refusal',async t=>{
 const f=serviceFixture(t,{apply:false,watchStatus:'REJECTED'});await f.run(await f.plan());
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='new-offline-connection';
 if(changed==='progress')next.state.tasks.task.progress++;
 if(changed==='config')next.config.tables.MainTaskCfg.data.find(row=>row.taskId===1).reward[0][1]++;
 if(changed==='player')next.session.player.playerId='9007199254740994';
 if(changed==='world')next.session.player.worldId='18';
 const planned=await next.plan();assert.equal(planned.actions.length,1);assert.equal(next.state.writes.length,0);assert.equal(next.service.executionMemory(next.session.id).events.length,1);
 if(changed==='player'||changed==='world'){next.session.player=player();await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});}
});

test('a reconnected task UNKNOWN stays blocked and the original history and budget remain intact',async t=>{
 const f=serviceFixture(t,{apply:false});await f.run(await f.plan());const original=fs.readFileSync(f.file,'utf8');
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='replacement';
 next.session.generation=next.client.factContext.generation=4;next.state.tasks.task.progress++;
 await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),original);
});

test('an orphan refusal cannot be cleared by a new task connection or business observation',async t=>{
 const f=serviceFixture(t,{apply:false,watchStatus:'REJECTED'});await f.run(await f.plan());
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='replacement';next.state.tasks.task.progress++;
 fs.writeFileSync(f.file,JSON.stringify({version:1,accounts:{}}));
 await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
});
test('a refusal recorded after a different connection authorized a task still stops before dispatch',async t=>{
 const f=serviceFixture(t,{apply:false,watchStatus:'REJECTED'});
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='replacement';
 const planned=await next.plan(),permit=next.authorize(planned);
 await f.run(await f.plan());
 next.service.execute(next.session,permit);await next.service.settle(next.session.id);
 assert.equal(next.state.writes.length,0);assert.equal(next.durable.list(next.session.id).find(row=>row.planSummary?.batchId===planned.batchId).finalStatus,'NOT_EXECUTED');
});
for(const missing of ['expectedState','parameters','budgetClaims'])test('legacy refusal lacking '+missing+' cannot be unlocked by reconnecting',async t=>{
 const f=serviceFixture(t,{apply:false,watchStatus:'REJECTED'});await f.run(await f.plan());
 const saved=f.durable.list(f.session.id)[0];delete saved.actions[0][missing];f.durable.put(saved);
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='replacement';next.state.tasks.task.progress++;
 await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
});

test('mismatched original identity cannot supply business facts to unlock refusal',async t=>{
 const f=serviceFixture(t,{apply:false,watchStatus:'REJECTED'});await f.run(await f.plan());
 const saved=f.durable.list(f.session.id)[0];saved.actions[0].identity='different-original';f.durable.put(saved);
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='replacement';next.state.tasks.task.progress++;
 await assert.rejects(next.plan(),{code:'MEMORY_EVENT_CONFLICT'});assert.equal(next.state.writes.length,0);
});