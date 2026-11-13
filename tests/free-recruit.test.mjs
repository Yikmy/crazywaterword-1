import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { freeRecruitModule,validateFreeRecruitConfig,validateFreeRecruitParameters,surveyFreeRecruit,viewFreeRecruit,planFreeRecruit,verifyFreeRecruit,freeRecruitDependencyVersions } from '../src/free-recruit.mjs';
import { trustedGameClock } from '../src/state-facts.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner,validateWorkflow } from '../src/workflow.mjs';

// Fixed codecs/config and synthetic transport; no live account or game connection.
const protocol=loadProtocol(),actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v),wire=(n,b)=>protocol[n].decode(protocol[n].encode(b).finish());
const heroId=actual.tables.HeroCfg.data[0].id,newId=actual.tables.HeroCfg.data[1].id,itemId=actual.tables.ItemCfg.data.find(r=>r.type==='英雄碎片').id;
const hero=id=>({heroId:id,level:1,star:0,power:'9007199254740993',skillLevels:[1],equips:[],attributes:[]});
const config=()=>({tables:Object.fromEntries(['ModuleOpenCfg','HeroCfg','ItemCfg'].map(k=>[k,clone(actual.tables[k])]))});
function fixture({codec=true,apply=true,fragment=false,receipt=null}={}) {
 const recruit={freeEndTimeSeconds:0,nextLuck:10,recruitTimes:1,task:{times:1,gotId:0}};
 const next={freeEndTimeSeconds:2000,nextLuck:9,recruitTimes:2,task:{times:2,gotId:0}};
 receipt??={recruitData:next,reward:fragment?[{heroId,trans:true,frag:{asset:[{type:0,id:itemId,num:10}]}}]:[{heroId:newId,trans:false}]};
 const state={wall:1000000,mono:100,recruit:{hero:clone(recruit),antique:clone(recruit)},heroes:[hero(heroId)],city:{building:[{buildingId:'1广播站',level:1}]},stock:[{itemId,num:9}],resources:[{res:3,amount:100},{res:4,amount:50}],reads:[],writes:[],overrides:{},onRead:null,onWrite:null,onDispatch:null};
 const clock=trustedGameClock({accountId:'synthetic-A',generation:3,wallNow:()=>state.wall,monotonicNow:()=>state.mono});
 clock.markPing(state.wall);clock.observePong(wire('PingResponse',{clientTimestamp:state.wall,serverTimestamp:state.wall}));
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-recruit'},gameClock:clock,pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
 async request(n,b,r,timeout,opts) {
  if(codec)wire(n,b);
  if(opts?.mutate){state.onDispatch?.();opts.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.recruit.hero=clone(next);if(fragment)state.stock[0].num+=10;else state.heroes.push(hero(newId));}await state.onWrite?.();return codec?wire(r,receipt):clone(receipt);}
  state.reads.push(n);await state.onRead?.(n);
  let value=n==='RecruitInfoRequest'?state.recruit:n==='AllHeroRequest'?{heroes:state.heroes}:n==='OnWaterRequest'?state.city:n==='AllItemRequest'?{items:state.stock}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected '+n);return codec?wire(r,value):clone(value);
 }};
 const options={config:config(),moduleConfig:{enabled:true},parameters:{},player:{playerId:'9007199254740993',worldId:'17',level:10}};
 return {state,client,options};
}
async function ready(extra={}){const f=fixture(extra),facts=await surveyFreeRecruit(f.client,protocol,f.options),row=viewFreeRecruit(facts,f.options).candidates[0],operation=planFreeRecruit(facts,{...f.options,selections:[row.actionId]}).actions[0];return {...f,facts,operation};}
const budget=f=>{const scope={accountId:'synthetic-A',generation:3,connectionId:'offline-recruit',runId:'run'},limits=f.operation.budgetClaims;return {ledger:null,runBudget:createRunBudgetContext({scope,limits}),scope,limits,batchId:'batch'};};
async function settle(f,mutate){const reply=await f.client.request('RecruitStartRequest',{way:1},'RecruitStartResponse',1000,{mutate:true});mutate?.(f.state);const after=await surveyFreeRecruit(f.client,protocol,f.options);return {after,reply};}

for(const fragment of[false,true])test('exact free recruit contract independently confirms '+(fragment?'fragment net':'new hero'),async()=>{
 const f=await ready({fragment});assert.ok(f.operation,JSON.stringify(viewFreeRecruit(f.facts,f.options)));
 assert.deepEqual(freeRecruitModule.defaultConfig,{enabled:false});assert.equal(freeRecruitModule.execute,undefined);
 assert.deepEqual(f.state.reads,['RecruitInfoRequest','AllHeroRequest','OnWaterRequest','AllItemRequest','AllResourceRequest']);assert.equal(f.state.writes.length,0);
 assert.deepEqual(f.operation.action,{request:'RecruitStartRequest',response:'RecruitStartResponse',body:{way:1}});
 assert.deepEqual(f.operation.costs,[]);assert.equal(f.operation.requiredLevel,6);
 assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[{id:'free-recruit:cooldown:0',num:1}],uids:[{type:'free-recruit',id:'0'}]});
 const {after,reply}=await settle(f);const result=verifyFreeRecruit(f.operation,f.facts,after,reply);assert.equal(result.confirmed,true,result.reason);
 assert.equal(result.responseEvidence.received.kind,fragment?'ITEM':'HERO');
});

test('strict empty parameters/default off/D6 reject ticket, bulk and missing debit metadata',()=>{
 assert.deepEqual(validateFreeRecruitParameters({}),{});assert.deepEqual(validateFreeRecruitConfig({}),{enabled:false});
 for(const p of[null,[],{way:1},{times:1},Object.create({})])assert.throws(()=>validateFreeRecruitParameters(p),{code:'INVALID_PARAMETERS'});
 for(const c of[null,{enabled:1},{paid:false}])assert.throws(()=>validateFreeRecruitConfig(c),{code:'INVALID_PARAMETERS'});
 const a={request:'RecruitStartRequest',body:{way:1},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));
 for(const body of[{way:1,times:1},{way:3},{way:4},{way:5},{}])assert.throws(()=>assertPaymentAllowed({...a,body}));
 assert.throws(()=>assertPaymentAllowed({request:a.request,body:a.body}));
 for(const id of['GOLD','RUBY','抽卡券'])assert.throws(()=>assertPaymentAllowed({...a,costs:[{id,num:1}]}));
});
for(const key of['freeEndTimeSeconds','nextLuck','recruitTimes','task'])test('missing own recruit field is never protobuf default: '+key,async()=>{
 const f=fixture();delete f.state.recruit.hero[key];const facts=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(viewFreeRecruit(facts,f.options).candidates[0].executable,false);
});
for(const key of['times','gotId'])test('missing task field blocks: '+key,async()=>{const f=fixture();delete f.state.recruit.hero.task[key];const facts=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(viewFreeRecruit(facts,f.options).candidates[0].executable,false);});

test('missing authority/config, locked level or future cooldown send zero',async()=>{
 for(const mutate of[
 f=>f.state.recruit.hero.freeEndTimeSeconds=1001,
 f=>f.state.recruit.hero.freeEndTimeSeconds=-1,
 f=>f.state.city.building=[],
 f=>f.state.city.building.push(clone(f.state.city.building[0])),
 f=>delete f.state.city.building[0].level,
 f=>delete f.state.heroes[0].skillLevels,
 f=>f.state.heroes.push(clone(f.state.heroes[0])),
 f=>delete f.state.resources[0].amount,
 f=>delete f.options.player.level,
 f=>f.options.player.level=5,
 f=>f.options.player={},
 f=>f.client.factContext.playerId='2',
 f=>f.state.overrides.RecruitInfoRequest=new Error('token=secret'),
 f=>delete f.options.config.tables.ModuleOpenCfg,
 f=>f.options.config.tables.ModuleOpenCfg.data.push({moduleId:'英雄入口',playerLevel:6}),
 f=>f.options.config.tables.HeroCfg.data.push(clone(f.options.config.tables.HeroCfg.data[0])),
 f=>delete f.options.config.tables.ItemCfg
 ]){const f=fixture();mutate(f);const facts=await surveyFreeRecruit(f.client,protocol,f.options),view=viewFreeRecruit(facts,f.options);assert.equal(view.candidates[0].executable,false,String(mutate));assert.doesNotMatch(JSON.stringify(view),/token=secret/);assert.equal(f.state.writes.length,0);}
 const f=fixture();f.state.recruit.hero.freeEndTimeSeconds=999;const facts=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(viewFreeRecruit(facts,f.options).candidates[0].executable,true);
});

test('clock, context, facts and explicit level cannot be replaced or renewed',async()=>{
 for(const mutate of[
 f=>f.client.gameClock.reset(),f=>{f.state.wall+=40000;f.state.mono+=40000;},f=>f.state.wall+=10000,
 f=>f.client.factContext.accountId='B',f=>f.client.factContext.connectionId='new',f=>f.client.factContext.generation++,
 f=>f.options.player.worldId='18',f=>f.options.player.level=5,f=>f.client.connected=false,f=>f.facts=clone(f.facts),
 f=>f.facts.sourceFacts.recruit.provenance.sourceAt++,f=>f.facts.state.recruit.hero.recruitTimes++
 ]){const f=await ready();mutate(f);assert.equal(planFreeRecruit(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);}
});

test('clock invalidation at final socket boundary prevents transport',async()=>{
 const f=await ready();f.state.onDispatch=()=>f.client.gameClock.reset();
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f)});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);
});

for(const [label,mutate] of[
 ['no new hero',s=>s.heroes.pop()],['extra hero',s=>s.heroes.push(hero(actual.tables.HeroCfg.data[2].id))],
 ['old hero changes',s=>s.heroes[0].level++],['missing future cooldown',s=>s.recruit.hero.freeEndTimeSeconds=0],
 ['receipt/reread mismatch',s=>s.recruit.hero.recruitTimes++],['antique changes',s=>s.recruit.antique.nextLuck++],
 ['broadcast changes',s=>s.city.building[0].level++],['unrelated item',s=>s.stock[0].num++],
 ['GOLD debit',s=>s.resources[0].amount--],['RUBY debit',s=>s.resources[1].amount--]
])test('settlement remains UNKNOWN on '+label,async()=>{const f=await ready(),{after,reply}=await settle(f,mutate);assert.equal(verifyFreeRecruit(f.operation,f.facts,after,reply).confirmed,false);});
for(const mutate of[s=>s.stock[0].num--,s=>s.heroes.push(hero(newId))])test('fragment receipt requires exact net and unchanged hero roster',async()=>{const f=await ready({fragment:true}),{after,reply}=await settle(f,mutate);assert.equal(verifyFreeRecruit(f.operation,f.facts,after,reply).confirmed,false);});

test('absent/ambiguous typed reward, forged operation and delayed cooldown cannot confirm',async()=>{
 const f=await ready(),{after,reply}=await settle(f);
 for(const r of[null,{}, {...reply,reward:[]},{...reply,reward:[...reply.reward,...reply.reward]},{...reply,reward:[{}]},{...reply,reward:[{heroId,trans:false}]},{...reply,reward:[{heroId:newId,trans:true}]},{...reply,recruitData:{...reply.recruitData,freeEndTimeSeconds:1000}}])assert.equal(verifyFreeRecruit(f.operation,f.facts,after,r).confirmed,false);
 for(const mutate of[o=>o.expectedState.reward='anything',o=>o.costs=[{id:'RUBY',num:1}],o=>o.budgetClaims.quotas=[],o=>o.action.body.way=2,o=>o.target.freeEndTimeSeconds++,o=>o.identity='fake']){const op=clone(f.operation);mutate(op);assert.equal(verifyFreeRecruit(op,f.facts,after,reply).confirmed,false);}
 const x=await ready({fragment:true}),s=await settle(x);
 for(const reward of[{frag:{}},{frag:{asset:[]}},{frag:{asset:[{type:0,id:itemId,num:0}]}},{frag:{asset:[{type:1,id:itemId,num:10}]}},{frag:{asset:[{type:0,id:'unknown',num:10}]}}])assert.equal(verifyFreeRecruit(x.operation,x.facts,s.after,{...s.reply,reward:[reward]}).confirmed,false);
});
for(const apply of[true,false])test('shared executor confirms or persists UNKNOWN '+apply,async()=>{
 const f=await ready({apply}),result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,apply?0:1);
});
function serviceFixture(t,{apply=true,file=null}={}) {
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-free-recruit-')):null;file??=path.join(dir,'history.json');
 const f=fixture({apply}),durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(clone(row));return durable.put(row);}};
 const session={id:'synthetic-A',client:f.client,player:f.options.player,generation:3,connectionId:'offline-recruit',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:{enabled:true}})},getConfig:()=>f.options.config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.request.bind(f.client);f.client.request=async(...args)=>{if(args[4]?.mutate)f.state.saved=clone(journal.at(-1));return send(...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 const plan=async()=>{const read=await service.surveyModule(session,'free-recruit',{}),row=read.view.candidates[0];assert.ok(row.executable,JSON.stringify(row));return service.plan(session,{module:'free-recruit',mode:'Manual',parameters:{},selections:[row.actionId]});};
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true});
 const run=async p=>{const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};};
 return {...f,session,service,history,durable,file,plan,authorize,run};
}
for(const apply of[true,false])test('Service persists quota/UID before transport and success/UNKNOWN across restart '+apply,async t=>{
 const f=serviceFixture(t,{apply}),p=await f.plan(),{record,permit}=await f.run(p);
 assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);
 assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.saved.runBudget.reserved.quotas,[{id:'free-recruit:cooldown:0',num:1}]);assert.deepEqual(f.state.saved.runBudget.reserved.uids,[{type:'free-recruit',id:'0'}]);
 assert.throws(()=>f.service.execute(f.session,permit));
 const restarted=serviceFixture(t,{file:f.file});assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,apply?'SUCCESS':'UNKNOWN');
 if(!apply){await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);}
});
test('Service persistence failure, cancellation and foreign-account approval send zero',async t=>{
 for(const mode of['disk','cancel','account','config']){const f=serviceFixture(t),p=await f.plan();if(mode==='account'){f.session.id='B';assert.throws(()=>f.authorize(p));continue;}if(mode==='config'){f.options.config.tables.HeroCfg.revision=2;assert.throws(()=>f.authorize(p));continue;}const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0);}
});
test('late response after connection replacement cannot confirm or start another send',async()=>{
 const f=await ready();let release;f.state.onWrite=()=>new Promise(r=>release=r);const pending=executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f)});
 for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.client.factContext.connectionId='new';release();const result=await pending;assert.equal(result.status,'UNKNOWN');assert.equal(f.state.writes.length,1);
});
test('registered free recruit Workflow pauses for existing permit and verifies shared durable history',async t=>{
 const f=serviceFixture(t),read=await f.service.surveyModule(f.session,'free-recruit',{}),row=read.view.candidates[0];
 const graph={version:1,id:'free-recruit-flow',name:'Synthetic free gold',budget:row.budgetClaims,nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'free-recruit',parameters:{}},{id:'a',type:'ACTION',module:'free-recruit',parameters:{},selection:row.actionId},{id:'v',type:'VERIFY',module:'free-recruit'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');const record=f.durable.list(f.session.id)[0];assert.equal(record.workflowId,result.runId);assert.equal(record.workflowNodeId,'a');
});


test('selection and enabled config are required, stale state prevents dispatch',async()=>{
 const f=await ready();
 for(const selections of[[],['forged']])assert.equal(planFreeRecruit(f.facts,{...f.options,selections}).actions.length,0);
 assert.equal(planFreeRecruit(f.facts,{...f.options,moduleConfig:{enabled:false},selections:[f.operation.actionId]}).actions.length,0);
 for(const selections of[['a','b'],Array(1),'x',[1]])assert.throws(()=>planFreeRecruit(f.facts,{...f.options,selections}),{code:'INVALID_PARAMETERS'});
 for(const changed of[false,true]){const x=await ready();if(changed)x.state.recruit.hero.freeEndTimeSeconds=1;const result=await executeBusinessOperation(x.client,protocol,x.operation,{...x.options,adapter:freeRecruitModule,allowMutate:changed,budget:budget(x)});assert.equal(result.dispatched,false);assert.equal(x.state.writes.length,0);}
});
test('slow sibling cannot renew early facts; sampling cancellation sends nothing',async t=>{
 let now=100000,release;t.mock.method(Date,'now',()=>now);
 const f=fixture();f.state.onRead=n=>n==='AllResourceRequest'?new Promise(r=>release=r):undefined;
 const pending=surveyFreeRecruit(f.client,protocol,f.options);await new Promise(setImmediate);now+=40000;release();const facts=await pending;
 assert.equal(facts.sourceFacts.recruit.provenance.sourceAt,100000);assert.equal(viewFreeRecruit(facts,f.options).candidates[0].executable,false);
 const x=fixture(),abort=new AbortController();x.state.onRead=n=>{if(n==='RecruitInfoRequest'){queueMicrotask(()=>abort.abort());return new Promise(()=>{});}};
 await assert.rejects(surveyFreeRecruit(x.client,protocol,{...x.options,signal:abort.signal}),{code:'CANCELLED'});assert.equal(x.state.writes.length,0);
});
test('dependencies bind only actual recruitment tables',()=>{
 const f=fixture(),before=freeRecruitDependencyVersions(f.options),unrelated=clone(f.options.config);unrelated.tables.Unrelated={data:[]};assert.deepEqual(freeRecruitDependencyVersions({...f.options,config:unrelated}),before);
 for(const name of['ModuleOpenCfg','HeroCfg','ItemCfg']){const changed=clone(f.options.config);changed.tables[name].revision=2;assert.notDeepEqual(freeRecruitDependencyVersions({...f.options,config:changed}),before);}
});

for(const change of ['connection','generation'])test('definite refusal remains active after '+change+' replacement with the same business facts',async t=>{
 const f=serviceFixture(t,{apply:false});f.state.onWrite=()=>{throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});};
 const {record}=await f.run(await f.plan());assert.equal(record.finalStatus,'REJECTED');assert.equal(f.state.writes.length,1);
 const memoryBefore=fs.readFileSync(f.file+'.memory.json','utf8'),historyBefore=fs.readFileSync(f.file,'utf8');
 const next=serviceFixture(t,{file:f.file});next.session.connectionId=next.client.factContext.connectionId='new-offline-connection';
 if(change==='generation') {
  next.session.generation=next.client.factContext.generation=4;
  const clock=trustedGameClock({accountId:next.session.id,generation:4,wallNow:()=>next.state.wall,monotonicNow:()=>next.state.mono});
  clock.markPing(next.state.wall);clock.observePong(wire('PingResponse',{clientTimestamp:next.state.wall,serverTimestamp:next.state.wall}));next.client.gameClock=clock;
 }
 await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
 assert.equal(fs.readFileSync(next.file+'.memory.json','utf8'),memoryBefore);assert.equal(fs.readFileSync(next.file,'utf8'),historyBefore);
});