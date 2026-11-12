import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { freeGoldModule,validateFreeGoldConfig,validateFreeGoldParameters,surveyFreeGold,viewFreeGold,planFreeGold,verifyFreeGold,freeGoldDependencyVersions } from '../src/free-gold.mjs';
import { trustedGameClock } from '../src/state-facts.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner,validateWorkflow } from '../src/workflow.mjs';
// Fixed local codecs/config, matching-Ping clock, synthetic account and transport only.
const protocol=loadProtocol(),actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v),wire=(n,b)=>protocol[n].decode(protocol[n].encode(b).finish());
const config=()=>({tables:{OfflineParamCfg:clone(actual.tables.OfflineParamCfg)}});
function fixture({codec=true,apply=true,receipt={result:[{gold:7500,ratio:2}]}}={}) {
 const state={wall:1000000,mono:100,info:{freeTimes:0,paidTimes:0,minGold:7500,resetTime:2000,maxPaidTimes:10},stock:[{itemId:'unrelated',num:9}],resources:[{res:3,amount:100},{res:4,amount:50}],reads:[],writes:[],overrides:{},onRead:null,onWrite:null,onDispatch:null};
 const clock=trustedGameClock({accountId:'synthetic-A',generation:3,wallNow:()=>state.wall,monotonicNow:()=>state.mono});
 clock.markPing(state.wall);clock.observePong(wire('PingResponse',{clientTimestamp:state.wall,serverTimestamp:state.wall}));
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-gold'},gameClock:clock,pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
 async request(n,b,r,timeout,opts) {
  if(codec)wire(n,b);
  if(opts?.mutate){state.onDispatch?.();opts.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.info.freeTimes++;state.resources[0].amount+=7500;}await state.onWrite?.();return codec?wire(r,receipt):clone(receipt);}
  state.reads.push(n);await state.onRead?.(n);
  let value=n==='ClickGoldInfoRequest'?{info:state.info}:n==='AllItemRequest'?{items:state.stock}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected '+n);return codec?wire(r,value):clone(value);
 }};
 const options={config:config(),moduleConfig:{enabled:true},parameters:{},player:{playerId:'9007199254740993',worldId:'17'}};
 return {state,client,options};
}
async function ready(extra={}){const f=fixture(extra),facts=await surveyFreeGold(f.client,protocol,f.options),row=viewFreeGold(facts,f.options).candidates[0],operation=planFreeGold(facts,{...f.options,selections:[row.actionId]}).actions[0];return {...f,facts,operation};}
const budget=f=>{const scope={accountId:'synthetic-A',generation:3,connectionId:'offline-gold',runId:'run'},limits=f.operation.budgetClaims;return {ledger:null,runBudget:createRunBudgetContext({scope,limits}),scope,limits,batchId:'batch'};};
async function settle(f,mutate){const reply=await f.client.request('ClickGoldRequest',{times:1,free:true},'ClickGoldResponse',1000,{mutate:true});mutate?.(f.state);const after=await surveyFreeGold(f.client,protocol,f.options);return {after,reply};}

test('free gold exact contract uses server reset marker, not a guessed day or reward',async()=>{
 const f=await ready();assert.ok(f.operation,JSON.stringify(viewFreeGold(f.facts,f.options)));
 assert.deepEqual(freeGoldModule.defaultConfig,{enabled:false});assert.equal(freeGoldModule.execute,undefined);
 assert.deepEqual(f.state.reads,['ClickGoldInfoRequest','AllItemRequest','AllResourceRequest']);assert.equal(f.state.writes.length,0);
 assert.deepEqual(f.operation.action,{request:'ClickGoldRequest',response:'ClickGoldResponse',body:{times:1,free:true}});
 assert.deepEqual(f.operation.costs,[]);assert.equal(f.operation.remaining,3);
 assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[{id:'free-gold:reset:2000',num:1}],uids:[{type:'free-gold',id:'2000:1'}]});
 assert.equal(f.operation.expectedState.inventoryRule.source,'ClickGoldResponse.result[0].gold');
 const {after,reply}=await settle(f);assert.equal(verifyFreeGold(f.operation,f.facts,after,reply).confirmed,true);
 assert.equal(verifyFreeGold(f.operation,f.facts,after,{result:[{gold:15000,ratio:2}]}).confirmed,false);
});
test('strict parameters/config/D6 forbid paid, bulk, hidden fields and missing debit metadata',()=>{
 assert.deepEqual(validateFreeGoldParameters({}),{});assert.deepEqual(validateFreeGoldConfig({}),{enabled:false});
 for(const p of[null,[],{times:1},{free:true},{allowPaid:false},Object.create({})])assert.throws(()=>validateFreeGoldParameters(p),{code:'INVALID_PARAMETERS'});
 for(const c of[null,{enabled:1},{paid:false}])assert.throws(()=>validateFreeGoldConfig(c),{code:'INVALID_PARAMETERS'});
 const a={request:'ClickGoldRequest',body:{times:1,free:true},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));
 for(const b of[{times:2,free:true},{times:1,free:false},{times:1},{times:1,free:true,buy:false}])assert.throws(()=>assertPaymentAllowed({...a,body:b}));
 assert.throws(()=>assertPaymentAllowed({request:a.request,body:a.body}));
 for(const id of['GOLD','RUBY'])assert.throws(()=>assertPaymentAllowed({...a,costs:[{id,num:1}]}));
});
for(const key of['freeTimes','paidTimes','minGold','resetTime','maxPaidTimes'])test('missing server field is not a protobuf default: '+key,async()=>{
 const f=fixture();delete f.state.info[key];const facts=await surveyFreeGold(f.client,protocol,f.options);assert.equal(viewFreeGold(facts,f.options).candidates[0].executable,false);
});
test('quota, source, config and balance failures block only the free action',async()=>{
 for(const mutate of[f=>f.state.info.freeTimes=3,f=>f.state.info.freeTimes=4,f=>f.state.info.freeTimes=-1,f=>f.state.info.resetTime=0,f=>f.state.info.minGold=0,f=>f.state.resources=[],f=>f.options.player={},f=>f.client.factContext.playerId='2',f=>f.state.overrides.ClickGoldInfoRequest=new Error('token=secret'),f=>f.options.config.tables.OfflineParamCfg.data.push({paramName:'免费点金次数',paramValue:3}),f=>delete f.options.config.tables.OfflineParamCfg]){const f=fixture();mutate(f);const facts=await surveyFreeGold(f.client,protocol,f.options),view=viewFreeGold(facts,f.options);assert.equal(view.candidates[0].executable,false);assert.doesNotMatch(JSON.stringify(view),/token=secret/);assert.equal(f.state.writes.length,0);}
});
test('trusted clock, uncertainty, reset crossing and context changes cannot renew a fact',async()=>{
 for(const mutate of[f=>f.client.gameClock.reset(),f=>{f.state.wall+=40000;f.state.mono+=40000;},f=>f.state.wall+=10000,f=>{f.state.wall=2000000;f.state.mono+=1000000;},f=>f.client.factContext.accountId='B',f=>f.client.factContext.connectionId='new',f=>f.client.factContext.generation++,f=>f.options.player.worldId='18',f=>f.client.connected=false,f=>f.facts=clone(f.facts),f=>f.facts.sourceFacts.gold.provenance.sourceAt++,f=>f.facts.state.gold.freeTimes++]){const f=await ready();mutate(f);assert.equal(planFreeGold(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);}
 const f=fixture();f.state.wall=1999999;f.state.mono=1000100;f.client.gameClock.markPing(f.state.wall);f.client.gameClock.observePong(wire('PingResponse',{clientTimestamp:f.state.wall,serverTimestamp:f.state.wall}));const facts=await surveyFreeGold(f.client,protocol,f.options);assert.equal(viewFreeGold(facts,f.options).candidates[0].blockedReason,'FREE_GOLD_PERIOD_UNKNOWN');
});
test('expired reset at final socket boundary stop before a write',async()=>{
 const f=await ready();f.state.onDispatch=()=>{f.state.wall=2000000;f.state.mono+=1000000;};
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeGoldModule,allowMutate:true,budget:budget(f)});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);
});
for(const [label,mutate] of [
 ['missing gold',s=>s.resources[0].amount-=7500],['extra gold',s=>s.resources[0].amount++],['wrong counter',s=>s.info.freeTimes++],['unchanged counter',s=>s.info.freeTimes--],['paid counter',s=>s.info.paidTimes++],['new period',s=>s.info.resetTime++],['minGold changes',s=>s.info.minGold++],['unrelated item',s=>s.stock[0].num++],['RUBY debit',s=>s.resources[1].amount--]
])test('settlement remains unconfirmed: '+label,async()=>{const f=await ready(),{after,reply}=await settle(f,mutate);assert.equal(verifyFreeGold(f.operation,f.facts,after,reply).confirmed,false);});
test('typed response alone, ratio math, absent/multiple receipts or forged authorized rules cannot confirm',async()=>{
 const f=await ready(),{after}=await settle(f);
 for(const reply of[null,{}, {result:[]},{result:[{ratio:2}]},{result:[{gold:0}]},{result:[{gold:7500},{gold:7500}]},{result:[{gold:15000,ratio:2}]}])assert.equal(verifyFreeGold(f.operation,f.facts,after,reply).confirmed,false);
 for(const mutate of[o=>o.expectedState.inventoryRule.source='ratio',o=>o.costs=[{id:'GOLD',num:1}],o=>o.budgetClaims.quotas=[],o=>o.action.body.times=2,o=>o.target.resetTime++,o=>o.identity='fake']){const op=clone(f.operation);mutate(op);assert.equal(verifyFreeGold(op,f.facts,after,{result:[{gold:7500}]}).confirmed,false);}
});
for(const apply of[true,false])test('shared executor confirms exact observed effects or retains UNKNOWN '+apply,async()=>{
 const f=await ready({apply}),result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeGoldModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,apply?0:1);
});

function serviceFixture(t,{apply=true,file=null}={}) {
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-free-gold-')):null;file??=path.join(dir,'history.json');
 const f=fixture({apply}),durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(clone(row));return durable.put(row);}};
 const session={id:'synthetic-A',client:f.client,player:f.options.player,generation:3,connectionId:'offline-gold',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:{enabled:true}})},getConfig:()=>f.options.config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.request.bind(f.client);f.client.request=async(...args)=>{if(args[4]?.mutate)f.state.saved=clone(journal.at(-1));return send(...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 const plan=async()=>{const read=await service.surveyModule(session,'free-gold',{}),row=read.view.candidates[0];assert.ok(row.executable,JSON.stringify(row));return service.plan(session,{module:'free-gold',mode:'Manual',parameters:{},selections:[row.actionId]});};
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true});
 const run=async p=>{const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};};
 return {...f,session,service,history,durable,file,plan,authorize,run};
}
for(const apply of[true,false])test('Service persists quota/UID before transport and success/UNKNOWN across restart '+apply,async t=>{
 const f=serviceFixture(t,{apply}),p=await f.plan(),{record,permit}=await f.run(p);
 assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);
 assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.saved.runBudget.reserved.quotas,[{id:'free-gold:reset:2000',num:1}]);assert.deepEqual(f.state.saved.runBudget.reserved.uids,[{type:'free-gold',id:'2000:1'}]);
 assert.throws(()=>f.service.execute(f.session,permit));
 const restarted=serviceFixture(t,{file:f.file});assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,apply?'SUCCESS':'UNKNOWN');
 if(!apply){await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);}
});
test('Service persistence failure, cancellation and foreign-account approval send zero',async t=>{
 for(const mode of['disk','cancel','account','config']){const f=serviceFixture(t),p=await f.plan();if(mode==='account'){f.session.id='B';assert.throws(()=>f.authorize(p));continue;}if(mode==='config'){f.options.config.tables.OfflineParamCfg.revision=2;assert.throws(()=>f.authorize(p));continue;}const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0);}
});
test('late response after connection replacement cannot confirm or start another send',async()=>{
 const f=await ready();let release;f.state.onWrite=()=>new Promise(r=>release=r);const pending=executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeGoldModule,allowMutate:true,budget:budget(f)});
 for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.client.factContext.connectionId='new';release();const result=await pending;assert.equal(result.status,'UNKNOWN');assert.equal(f.state.writes.length,1);
});
test('registered free gold Workflow pauses for existing permit and verifies shared durable history',async t=>{
 const f=serviceFixture(t),read=await f.service.surveyModule(f.session,'free-gold',{}),row=read.view.candidates[0];
 const graph={version:1,id:'free-gold-flow',name:'Synthetic free gold',budget:row.budgetClaims,nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'free-gold',parameters:{}},{id:'a',type:'ACTION',module:'free-gold',parameters:{},selection:row.actionId},{id:'v',type:'VERIFY',module:'free-gold'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');const record=f.durable.list(f.session.id)[0];assert.equal(record.workflowId,result.runId);assert.equal(record.workflowNodeId,'a');
});

test('manual selection, enabled config and exact one action are mandatory',async()=>{
 const f=await ready();
 for(const selections of[[],['forged']])assert.equal(planFreeGold(f.facts,{...f.options,selections}).actions.length,0);
 assert.equal(planFreeGold(f.facts,{...f.options,moduleConfig:{enabled:false},selections:[f.operation.actionId]}).actions.length,0);
 for(const selections of[['a','b'],Array(1),'x',[1]])assert.throws(()=>planFreeGold(f.facts,{...f.options,selections}),{code:'INVALID_PARAMETERS'});
 for(const mutate of[f=>{},f=>f.state.info.freeTimes++]){const x=await ready();mutate(x);const result=await executeBusinessOperation(x.client,protocol,x.operation,{...x.options,adapter:freeGoldModule,allowMutate:x.state.info.freeTimes!==0,budget:budget(x)});assert.equal(result.dispatched,false);assert.equal(x.state.writes.length,0);}
});
test('slow sibling never renews gold fact age, and sampling cancellation sends nothing',async t=>{
 let now=100000,release;t.mock.method(Date,'now',()=>now);
 const f=fixture();f.state.onRead=n=>n==='AllResourceRequest'?new Promise(r=>release=r):undefined;
 const pending=surveyFreeGold(f.client,protocol,f.options);await new Promise(setImmediate);now+=40000;release();const facts=await pending;
 assert.equal(facts.sourceFacts.gold.provenance.sourceAt,100000);assert.equal(viewFreeGold(facts,f.options).candidates[0].executable,false);
 const x=fixture(),abort=new AbortController();x.state.onRead=n=>{if(n==='ClickGoldInfoRequest'){queueMicrotask(()=>abort.abort());return new Promise(()=>{});}};
 await assert.rejects(surveyFreeGold(x.client,protocol,{...x.options,signal:abort.signal}),{code:'CANCELLED'});assert.equal(x.state.writes.length,0);
});
test('free gold dependencies bind only the config used for its actual free cap',()=>{
 const f=fixture(),before=freeGoldDependencyVersions(f.options),unrelated=clone(f.options.config);unrelated.tables.Unrelated={data:[]};assert.deepEqual(freeGoldDependencyVersions({...f.options,config:unrelated}),before);
 const changed=clone(f.options.config);changed.tables.OfflineParamCfg.revision=2;assert.notDeepEqual(freeGoldDependencyVersions({...f.options,config:changed}),before);
});
