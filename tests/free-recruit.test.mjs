import { runDailies, DAILY_DRIVERS } from '../src/dailies.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { freeRecruitModule,heroRecruitCosts,validateFreeRecruitCooldownObservation,validateFreeRecruitConfig,validateFreeRecruitParameters,surveyFreeRecruit,viewFreeRecruit,planFreeRecruit,verifyFreeRecruit,freeRecruitDependencyVersions } from '../src/free-recruit.mjs';
import { trustedGameClock } from '../src/state-facts.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner,validateWorkflow,createWorkflowStore,projectWorkflowExecutionHistory } from '../src/workflow.mjs';
import {compileUnifiedExecution} from '../src/loop.mjs';

// Fixed codecs/config and synthetic transport; no live account or game connection.
const protocol=loadProtocol(),actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v),wire=(n,b)=>protocol[n].decode(protocol[n].encode(b).finish());
const heroId=actual.tables.HeroCfg.data[0].id,newId=actual.tables.HeroCfg.data[1].id,itemId=actual.tables.ItemCfg.data.find(r=>r.type==='英雄碎片').id;
const hero=id=>({heroId:id,level:1,star:0,power:'9007199254740993',skillLevels:[1],equips:[],attributes:[]});
const config=()=>({tables:Object.fromEntries(['ModuleOpenCfg','HeroCfg','ItemCfg'].map(k=>[k,clone(actual.tables[k])]))});
const antiqueId=actual.tables.AntiqueBaseCfg.data[0].antiqueId,newAntiqueId=actual.tables.AntiqueBaseCfg.data[1].antiqueId,antiqueItemId=antiqueId+'碎片',conversionCount=actual.tables.AntiqueFragReturnCfg.data.find(r=>r.color===actual.tables.AntiqueBaseCfg.data[0].color).count;
function fixture({antique=false,codec=true,apply=true,fragment=false,receipt=null,ticket=false,count=1,ticketCount=Math.max(count,2),freeMarker}={}) {
 const recruit={freeEndTimeSeconds:freeMarker??(ticket?2000:0),nextLuck:10,recruitTimes:1,task:{times:1,gotId:0}};
 const next={freeEndTimeSeconds:ticket?recruit.freeEndTimeSeconds:2000,nextLuck:9,recruitTimes:1+count,task:{times:1+count,gotId:0}};
 const targetItem=antique?antiqueItemId:itemId;
 if(antique)receipt??={recruitData:next,reward:Array.from({length:count},(_,i)=>fragment?{antiqueId,trans:true,reward:{asset:[{type:0,id:antiqueItemId,num:10}]}}:i===0?{antiqueId:newAntiqueId,trans:false}:{antiqueId,trans:true})};
 receipt??={recruitData:next,reward:Array.from({length:count},(_,i)=>!fragment&&i===0?{heroId:newId,trans:false}:{heroId,trans:true,frag:{asset:[{type:0,id:itemId,num:10}]}})};
 const state={wall:1000000,mono:100,recruit:{hero:clone(recruit),antique:clone(recruit)},heroes:[hero(heroId)],antiques:{antiques:[{id:antiqueId,star:0}],suits:[],masterLv:0},city:{building:[{buildingId:'1广播站',level:1}]},stock:[{itemId:targetItem,num:9},...(ticket?[{itemId:antique?'藏品券':'抽卡券',num:ticketCount}]:[])],resources:[{res:3,amount:100},{res:4,amount:50}],reads:[],writes:[],overrides:{},onRead:null,onWrite:null,onDispatch:null};
 const clock=trustedGameClock({accountId:'synthetic-A',generation:3,wallNow:()=>state.wall,monotonicNow:()=>state.mono});
 clock.markPing(state.wall);clock.observePong(wire('PingResponse',{clientTimestamp:state.wall,serverTimestamp:state.wall}));
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-recruit'},gameClock:clock,pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
 async request(n,b,r,timeout,opts) {
  if(codec)wire(n,b);
  if(opts?.mutate){state.onDispatch?.();opts.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){if(ticket)state.stock.find(r=>r.itemId===(antique?'藏品券':'抽卡券')).num-=count;state.recruit[antique?'antique':'hero']=clone(next);state.stock[0].num+=(antique&&!fragment?conversionCount:10)*(count-(fragment?0:1));if(!fragment){if(antique)state.antiques.antiques.push({id:newAntiqueId,star:0});else state.heroes.push(hero(newId));}}await state.onWrite?.();return codec?wire(r,receipt):clone(receipt);}
  state.reads.push(n);await state.onRead?.(n);
  let value=n==='RecruitInfoRequest'?state.recruit:n==='AllHeroRequest'?{heroes:state.heroes}:n==='AllAntiqueRequest'?state.antiques:n==='OnWaterRequest'?state.city:n==='AllItemRequest'?{items:state.stock}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected '+n);return codec?wire(r,value):clone(value);
 }};
 const cfg=config();if(antique)for(const name of ['AntiqueBaseCfg','AntiqueFragReturnCfg','AntiqueSuitCfg'])cfg.tables[name]=clone(actual.tables[name]);
 const options={config:cfg,moduleConfig:{enabled:true},parameters:{...(antique?{recruit:'antique'}:{}),...(ticket?{payment:'ticket',...(count>1?{count}:{})}:{})},player:{playerId:'9007199254740995',worldId:'17',level:10}};
 return {state,client,options};
}
async function ready(extra={}){const f=fixture(extra),facts=await surveyFreeRecruit(f.client,protocol,f.options),row=viewFreeRecruit(facts,f.options).candidates[0],operation=planFreeRecruit(facts,{...f.options,selections:[row.actionId]}).actions[0];return {...f,facts,operation};}
const budget=f=>{const scope={accountId:'synthetic-A',generation:3,connectionId:'offline-recruit',runId:'run'},limits=f.operation.budgetClaims;return {ledger:null,runBudget:createRunBudgetContext({scope,limits}),scope,limits,batchId:'batch'};};
async function settle(f,mutate){const reply=await f.client.request(f.operation.action.request,f.operation.action.body,f.operation.action.response,1000,{mutate:true});mutate?.(f.state);const after=await surveyFreeRecruit(f.client,protocol,f.options);return {after,reply};}

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

test('strict default-free parameters/default off/D6 reject implicit ticket, bulk and missing debit metadata',()=>{
 assert.deepEqual(validateFreeRecruitParameters({}),{});assert.deepEqual(validateFreeRecruitParameters({payment:'free'}),{});assert.deepEqual(validateFreeRecruitParameters({payment:'ticket'}),{payment:'ticket'});assert.deepEqual(validateFreeRecruitConfig({}),{enabled:false});
 for(const p of[null,[],{way:1},{times:1},{payment:2},{payment:'auto'},{payment:'ticket',times:1},Object.create({})])assert.throws(()=>validateFreeRecruitParameters(p),{code:'INVALID_PARAMETERS'});
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
function serviceFixture(t,{apply=true,file=null,ticket=false,...fixtureOptions}={}) {
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-free-recruit-')):null;file??=path.join(dir,'history.json');
 const f=fixture({apply,ticket,...fixtureOptions}),durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(clone(row));return durable.put(row);}};
 const session={id:'synthetic-A',client:f.client,player:f.options.player,generation:3,connectionId:'offline-recruit',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:{enabled:true}})},getConfig:()=>f.options.config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.request.bind(f.client);f.client.request=async(...args)=>{if(args[4]?.mutate)f.state.saved=clone(journal.at(-1));return send(...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 const plan=async()=>{const read=await service.surveyModule(session,'free-recruit',f.options.parameters),row=read.view.candidates[0];assert.ok(row.executable,JSON.stringify(row));return service.plan(session,{module:'free-recruit',mode:'Manual',parameters:f.options.parameters,selections:[row.actionId]});};
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
for(const [marker,readiness]of [[0,'READY_BY_CLOCK'],[1001,'COOLDOWN'],[1000,'UNKNOWN']])test('cooldown observation retains exact marker and original trusted bounds '+marker,async()=>{
 const f=fixture();f.state.recruit.hero.freeEndTimeSeconds=marker;const facts=await surveyFreeRecruit(f.client,protocol,f.options),v=viewFreeRecruit(facts,f.options),c=v.cooldownObservation;
 assert.equal(c.status,'OBSERVED');assert.equal(c.freeEndTimeSeconds,marker);assert.equal(c.readiness,readiness);assert.equal(c.source,'RecruitInfoResponse.hero.freeEndTimeSeconds');assert.equal(c.sourceAt,facts.sourceFacts.recruit.provenance.sourceAt);assert.equal(c.eligibility,null);assert.equal(c.executable,false);assert.equal(c.autoResume,false);assert.equal(f.state.writes.length,0);
 c.serverBounds.earliestMs=999;assert.notEqual(viewFreeRecruit(facts,f.options).cooldownObservation.serverBounds.earliestMs,999);
});
for(const mode of ['missing','clock','context','cloned','stale'])test('cooldown observation never fills unknown fields or renews evidence '+mode,async t=>{
 const f=fixture();if(mode==='missing')delete f.state.recruit.hero.freeEndTimeSeconds;let facts=await surveyFreeRecruit(f.client,protocol,f.options);
 if(mode==='clock')f.client.gameClock.reset();if(mode==='context')f.client.factContext.connectionId='new';if(mode==='cloned')facts=clone(facts);
 if(mode==='stale'){const now=Date.now();t.mock.method(Date,'now',()=>now+31000);}
 const c=viewFreeRecruit(facts,f.options).cooldownObservation;
 assert.equal(c.readiness,'UNKNOWN');if(mode==='clock'){assert.equal(c.status,'OBSERVED');assert.equal(c.freeEndTimeSeconds,0);assert.equal(c.serverBounds,null);}else{assert.equal(c.status,'UNKNOWN');assert.equal(c.freeEndTimeSeconds,null);assert.equal(c.sourceAt,null);assert.equal(c.serverBounds,null);}
 assert.equal(c.autoResume,false);assert.equal(f.state.writes.length,0);
});
test('cooldown history validator rejects eligibility, automatic replay and fabricated clock claims',async()=>{
 const f=fixture();f.state.recruit.hero.freeEndTimeSeconds=1001;const facts=await surveyFreeRecruit(f.client,protocol,f.options),c=viewFreeRecruit(facts,f.options).cooldownObservation;
 for(const mutate of[v=>v.source='fake',v=>v.freeEndTimeSeconds=-1,v=>v.sourceAt=null,v=>v.readiness='READY_BY_CLOCK',v=>v.serverBounds.earliestMs=v.serverBounds.latestMs+1,v=>v.serverBounds.token='injected',v=>v.eligibility=true,v=>v.executable=true,v=>v.autoResume=true,v=>delete v.freeEndTimeSeconds,v=>v.status='UNKNOWN',v=>v.request='RecruitStartRequest']){
 const value=clone(c);mutate(value);assert.throws(()=>validateFreeRecruitCooldownObservation(value),{code:'INVALID_PARAMETERS'});}
});
test('original finite Loop persists cooldown observation, reloads read only and never recruits when time passes',async t=>{
 const f=serviceFixture(t);f.state.recruit.hero.freeEndTimeSeconds=1001;
 const file=f.file+'.workflow.json',store=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),compiled=compileUnifiedExecution({entry:'loop',world:[{type:'SURVEY',module:'free-recruit',parameters:{}}],rounds:1,budget:{resources:[],quotas:[],uids:[]}},{modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null,onUpdate:s=>store.record(f.session.id,s)});t.after(()=>runner.stop());
 const result=await runner.start(f.session.id,compiled.graph);assert.equal(result.status,'COMPLETED');const trace=result.trace.find(row=>row.type==='SURVEY'),c=trace.recruitCooldown;assert.equal(c.readiness,'COOLDOWN');assert.equal(c.freeEndTimeSeconds,1001);assert.equal(f.state.writes.length,0);
 const original=fs.readFileSync(file,'utf8');assert.equal(original.includes('9007199254740995'),true);assert.equal(original.includes('9007199254740993'),false);assert.equal(original.includes('skillLevels'),false);
 f.state.wall+=100000;f.state.mono+=100000;f.client.connected=false;
 const restored=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),[row]=restored.history(f.session.id,{runId:result.runId}),projection=projectWorkflowExecutionHistory(f.session.id,row,[]);
 assert.deepEqual(projection.surveys[0].recruitCooldown,c);assert.equal(projection.readOnly,true);assert.equal(projection.resumable,false);assert.equal(f.state.writes.length,0);assert.equal(fs.readFileSync(file,'utf8'),original);assert.deepEqual(restored.history('other'),[]);
 for(const module of ['mail','free-gold']){const changed=clone(row);changed.trace.find(v=>v.type==='SURVEY').module=module;assert.throws(()=>restored.record(f.session.id,changed));}
 const legacy=clone(row);legacy.runId='legacy-cooldown';delete legacy.trace.find(v=>v.type==='SURVEY').recruitCooldown;restored.record(f.session.id,legacy);assert.equal(projectWorkflowExecutionHistory(f.session.id,restored.history(f.session.id,{runId:legacy.runId})[0],[]).surveys[0].recruitCooldown,undefined);
});

function cooldownWaitGraph({maxWaitMs=1000,claim=false,budget={resources:[],quotas:[],uids:[]}}={}){const nodes=[{id:'s',type:'START'},{id:'w',type:'WAIT',cooldown:{kind:'FREE_RECRUIT',maxWaitMs}},...(claim?[{id:'a',type:'ACTION',module:'free-recruit',parameters:{},selection:{unique:true}},{id:'v',type:'VERIFY',module:'free-recruit'}]:[]),{id:'z',type:'STOP'}];return {version:1,id:'native-recruit-cooldown',name:'Native bounded cooldown',budget,nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id}))};}
function cooldownWaitRunner(f,options={}){return createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.session,runId,opts),getSession:id=>id===f.session.id?f.session:null,...options});}
for(const approval of ['manual','run'])for(const apply of [true,false])test('named cooldown waits for native clock and independently rereads before exact recruit '+approval+' '+apply,async t=>{
 const f=serviceFixture(t,{apply});f.state.recruit.hero.freeEndTimeSeconds=1001;f.state.wall+=990;f.state.mono+=990;let reads=0;f.state.onRead=n=>{if(n==='RecruitInfoRequest'&&++reads===2){f.state.wall+=20;f.state.mono+=20;}};
 const file=f.file+'.workflow.json',store=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),runner=cooldownWaitRunner(f,{onUpdate:s=>store.record(f.session.id,s)});t.after(()=>runner.stop());const g=cooldownWaitGraph({claim:true,budget:{resources:[],quotas:[{id:'free-recruit:cooldown:1001',num:1}],uids:[{type:'free-recruit',id:'1001'}]}});if(approval==='run')g.runPolicy={maxDurationMs:60000,maxActions:1,modules:['free-recruit']};const pending=await runner.start(f.session.id,g);assert.equal(pending.status,'AWAITING_AUTHORIZATION',JSON.stringify(pending));assert.equal(f.state.writes.length,0);assert.equal(pending.runAuthorization,undefined);assert.ok(reads>=3);const waits=pending.trace.filter(r=>r.type==='WAIT');assert.equal(waits.length,2);assert.equal(waits[0].durationMs,Math.ceil(1001000-waits[0].cooldownWait.observation.serverBounds.earliestMs));assert.equal(waits[0].cooldownWait.observation.readiness,'COOLDOWN');assert.equal(waits[1].cooldownWait.observation.readiness,'READY_BY_CLOCK');assert.equal(waits[0].cooldownWait.observation.freeEndTimeSeconds,1001);
 let done;if(approval==='run'){await runner.authorizeRun({offer:pending.authorizationOffer,batchId:pending.plan.batchId,planHash:pending.plan.planHash,confirm:true});done=await runner.settle();}else{await f.run(pending.plan);done=await runner.resume();}assert.equal(done.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0].body,{way:1});const bytes=fs.readFileSync(file,'utf8'),reopened=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),saved=reopened.history(f.session.id)[0],detail=projectWorkflowExecutionHistory(f.session.id,saved,f.durable.list(f.session.id));assert.equal(detail.resumable,false);assert.equal(detail.readOnly,true);assert.equal(detail.waits.length,2);assert.deepEqual(detail.waits[1].cooldownWait,waits[1].cooldownWait);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(reopened.history('other'),[]);assert.equal(f.state.writes.length,1);
 for(const change of [r=>r.durationMs=2,r=>r.cooldownWait.maxWaitMs=0,r=>r.cooldownWait.observation.freeEndTimeSeconds=1002,r=>r.cooldownWait.observation.autoResume=true,r=>r.cooldownWait.eligible=true]){const bad=clone(saved);change(bad.trace.find(r=>r.result==='WAITED'));assert.throws(()=>reopened.record(f.session.id,bad));assert.equal(fs.readFileSync(file,'utf8'),bytes);}
});
for(const fault of ['over-limit','missing','clock','still-cooling','new-marker','world','connection','generation','cancel','persistence'])test('named recruit cooldown fails closed without writes on '+fault,async t=>{
 const f=serviceFixture(t);f.state.recruit.hero.freeEndTimeSeconds=1001;f.state.wall+=999;f.state.mono+=999;let reads=0;
 if(fault==='over-limit')f.state.recruit.hero.freeEndTimeSeconds=2000;if(fault==='missing')delete f.state.recruit.hero.freeEndTimeSeconds;if(fault==='clock')f.client.gameClock=null;
 f.state.onRead=n=>{if(n==='RecruitInfoRequest'&&++reads===2){if(fault!=='still-cooling'){f.state.wall++;f.state.mono++;}if(fault==='new-marker')f.state.recruit.hero.freeEndTimeSeconds=1002;}};
 let runner;runner=cooldownWaitRunner(f,{onUpdate:s=>{if(s.trace.at(-1)?.result==='WAIT_STARTED'){if(fault==='world')f.session.player.worldId=2;if(fault==='connection')f.session.connectionId='other';if(fault==='generation')f.session.generation++;if(fault==='cancel')runner.stop();if(fault==='persistence')throw Error('synthetic cooldown disk failure');}}});t.after(()=>runner.stop());const done=await runner.start(f.session.id,cooldownWaitGraph());assert.equal(done.status,fault==='over-limit'?'STOPPED':['world','connection','generation','cancel'].includes(fault)?'CANCELLED':fault==='persistence'?'FAILED':'UNKNOWN',JSON.stringify(done));assert.equal(done.trace.some(r=>r.result==='WAITED'),false);assert.equal(done.plan,null);assert.equal(f.state.writes.length,0);assert.equal(f.service.workflowBudget(f.session.id).state,'CLOSED');if(['over-limit','missing','clock'].includes(fault))assert.equal(reads,1);
});

test('named cooldown cannot clear definite refusal or UNKNOWN original history',async t=>{
 for(const unknown of [false,true]){const f=serviceFixture(t,{apply:false});if(!unknown)f.state.onWrite=()=>{throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});};const {record}=await f.run(await f.plan());assert.equal(record.finalStatus,unknown?'UNKNOWN':'REJECTED');const historyBytes=fs.readFileSync(f.file,'utf8'),memoryBytes=fs.readFileSync(f.file+'.memory.json','utf8'),reads=f.state.reads.length;const next=serviceFixture(t,{file:f.file});next.state.wall+=1000;next.state.mono+=1000;const runner=cooldownWaitRunner(next);t.after(()=>runner.stop());
 if(unknown){await assert.rejects(runner.start(f.session.id,cooldownWaitGraph({claim:true})),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.state.reads.length,reads);assert.equal(next.state.reads.length,0);assert.equal(next.state.writes.length,0);}else{const done=await runner.start(f.session.id,cooldownWaitGraph({claim:true,budget:{resources:[],quotas:[{id:'free-recruit:cooldown:0',num:1}],uids:[{type:'free-recruit',id:'0'}]}}));assert.equal(done.status,'UNKNOWN',JSON.stringify(done));assert.match(done.reason,/VERIFY/);assert.equal(done.trace.some(r=>r.result==='WAITED'),true);assert.equal(next.state.writes.length,0);assert.equal(done.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'),true);assert.equal(done.plan,null);}
 assert.equal(f.state.writes.length,1);assert.equal(fs.readFileSync(f.file,'utf8'),historyBytes);assert.equal(fs.readFileSync(f.file+'.memory.json','utf8'),memoryBytes);
 }
});
test('named cooldown restart preserves waiting source read-only without restoring timers or permits',async t=>{
 const f=serviceFixture(t);f.state.recruit.hero.freeEndTimeSeconds=1001;f.state.wall+=990;f.state.mono+=990;const file=f.file+'.workflow.json',store=createWorkflowStore({file,modules:GAMEPLAY_MODULES});let runner,seen=false;
 runner=cooldownWaitRunner(f,{onUpdate:s=>{store.record(f.session.id,s);if(!seen&&s.trace.at(-1)?.result==='WAIT_STARTED'){seen=true;const bytes=fs.readFileSync(file,'utf8'),reopened=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),saved=reopened.history(f.session.id)[0];assert.equal(saved.status,'RECOVERED_STOPPED');assert.equal(saved.resumable,false);assert.equal(saved.runAuthorization,undefined);assert.deepEqual(saved.trace.at(-1).cooldownWait,s.trace.at(-1).cooldownWait);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(reopened.history('other'),[]);runner.stop();}}});t.after(()=>runner.stop());const done=await runner.start(f.session.id,cooldownWaitGraph());assert.equal(seen,true);assert.equal(done.status,'CANCELLED');assert.equal(f.state.reads.filter(n=>n==='RecruitInfoRequest').length,1);assert.equal(f.state.writes.length,0);assert.equal(done.trace.some(r=>r.result==='WAITED'),false);
});

for(const phase of [1,2])for(const fault of ['cancel','world','connection','generation'])test('named cooldown rejects late native read '+phase+' after '+fault,async t=>{
 const f=serviceFixture(t);f.state.recruit.hero.freeEndTimeSeconds=0;let reads=0,entered,release;const reached=new Promise(r=>entered=r),late=new Promise(r=>release=r);
 f.state.onRead=async name=>{if(name==='RecruitInfoRequest'&&++reads===phase){entered();await late;}};
 const runner=cooldownWaitRunner(f);t.after(()=>runner.stop());const running=runner.start(f.session.id,cooldownWaitGraph({claim:true}));await reached;
 if(fault==='cancel')runner.stop();else if(fault==='world')f.session.player.worldId=2;else if(fault==='connection')f.session.connectionId='late-replacement';else f.session.generation++;
 release();const done=await running;assert.notEqual(done.status,'COMPLETED');assert.equal(done.plan,null);assert.equal(done.trace.some(r=>r.result==='WAITED'),false);assert.equal(f.state.writes.length,0);assert.equal(f.service.workflowBudget(f.session.id).state,'CLOSED');
});

test('named cooldown paired history rejects missing duplicate or mismatched independent evidence',async t=>{
 const f=serviceFixture(t),file=f.file+'.workflow.json',store=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),runner=cooldownWaitRunner(f,{onUpdate:s=>store.record(f.session.id,s)});t.after(()=>runner.stop());const done=await runner.start(f.session.id,cooldownWaitGraph());assert.equal(done.status,'COMPLETED');const bytes=fs.readFileSync(file,'utf8'),saved=store.history(f.session.id)[0];
 for(const mutate of [r=>r.trace.splice(r.trace.findIndex(v=>v.result==='WAIT_STARTED'),1),r=>r.trace.splice(1,0,clone(r.trace.find(v=>v.result==='WAIT_STARTED'))),r=>r.trace.splice(-1,0,clone(r.trace.find(v=>v.result==='WAITED'))),r=>r.trace.find(v=>v.result==='WAITED').nodeId='other',r=>r.trace.find(v=>v.result==='WAITED').cooldownWait.observation.sourceAt=0]){const changed=clone(saved);mutate(changed);assert.throws(()=>store.record(f.session.id,changed));assert.equal(fs.readFileSync(file,'utf8'),bytes);fs.writeFileSync(file,JSON.stringify({version:1,accounts:{[f.session.id]:{workflows:[],history:[changed]}}}));const tampered=fs.readFileSync(file,'utf8');assert.throws(()=>createWorkflowStore({file,modules:GAMEPLAY_MODULES}).history(f.session.id),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),tampered);fs.writeFileSync(file,bytes);}
 assert.equal(f.state.writes.length,0);
});

for(const entry of ['tasks','dailies','loop'])test('unified named cooldown reaches original native Service and persists read-only '+entry,async t=>{
 const f=serviceFixture(t);f.state.recruit.hero.freeEndTimeSeconds=1001;f.state.wall+=990;f.state.mono+=990;let reads=0;f.state.onRead=n=>{if(n==='RecruitInfoRequest'&&++reads===2){f.state.wall+=20;f.state.mono+=20;}};
 const phase=entry==='loop'?'world':entry,input={entry,[phase]:[{type:'WAIT',cooldown:{kind:'FREE_RECRUIT',maxWaitMs:1000}}],budget:{resources:[],quotas:[],uids:[]}},compiled=compileUnifiedExecution(input,{modules:GAMEPLAY_MODULES}),file=f.file+'.workflow.json',store=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),runner=cooldownWaitRunner(f,{onUpdate:s=>store.record(f.session.id,s)});t.after(()=>runner.stop());const done=await runner.start(f.session.id,compiled.graph);assert.equal(done.status,'COMPLETED',JSON.stringify(done));assert.equal(done.plan,null);assert.equal(reads,2);assert.equal(f.state.writes.length,0);assert.equal(done.trace.filter(r=>r.cooldownWait).length,2);assert.equal(done.trace.find(r=>r.result==='WAITED').cooldownWait.observation.readiness,'READY_BY_CLOCK');const bytes=fs.readFileSync(file,'utf8'),reopened=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),detail=projectWorkflowExecutionHistory(f.session.id,reopened.history(f.session.id)[0],[]);assert.equal(detail.readOnly,true);assert.equal(detail.resumable,false);assert.equal(detail.waits.length,2);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(reopened.history('other'),[]);assert.equal(f.service.workflowBudget(f.session.id).state,'CLOSED');
});

for(const apply of [true,false])test('legacy Daily Driver delegates one authorized native operation '+apply,async t=>{
 const f=serviceFixture(t,{apply}),permit=f.authorize(await f.plan());
 const invoke=()=>runDailies(f.client,protocol,{tasks:[]},{allowMutate:true,operationService:f.service,session:f.session,authorization:permit});
 const result=await invoke();assert.equal(result.length,1);assert.equal(result[0].status,apply?'SUCCESS':'UNKNOWN');assert.equal(result[0].ok,apply?true:null);assert.equal(f.state.writes.length,1);
 assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.equal(f.durable.list(f.session.id)[0].finalStatus,apply?'SUCCESS':'UNKNOWN');
 assert.notEqual((await invoke())[0].status,'SUCCESS');assert.equal(f.state.writes.length,1);
 if(!apply){const restarted=serviceFixture(t,{file:f.file});await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);}
});
for(const code of ['TIMEOUT','REJECTED'])test('legacy Daily Driver uses native persistent stop for '+code,async t=>{
 const f=serviceFixture(t,{apply:false}),permit=f.authorize(await f.plan());f.state.onWrite=()=>{throw Object.assign(Error('synthetic '+code),{code});};
 const invoke=()=>runDailies(f.client,protocol,{tasks:[]},{allowMutate:true,operationService:f.service,session:f.session,authorization:permit});
 const result=await invoke();assert.equal(result[0].status,code==='REJECTED'?'REJECTED':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.durable.list(f.session.id)[0].finalStatus,result[0].status);await invoke();assert.equal(f.state.writes.length,1);
});
test('legacy Daily Driver cannot dispatch after cancellation or identity change',async t=>{
 for(const cancel of [true,false]){const f=serviceFixture(t),permit=f.authorize(await f.plan());if(cancel)f.session.abort.abort();else f.session.player.worldId='18';
 const result=await runDailies(f.client,protocol,{tasks:[]},{allowMutate:true,operationService:f.service,session:f.session,authorization:permit});assert.notEqual(result[0].status,'SUCCESS');assert.equal(f.state.writes.length,0);}
});

for(const fragment of [false,true])for(const ticketCount of [1,2])test('single owned-ticket mode shares exact reward verification '+fragment+' '+ticketCount,async()=>{
 const f=await ready({ticket:true,fragment,ticketCount});assert.ok(f.operation);assert.deepEqual(f.operation.parameters,{payment:'ticket'});assert.equal(f.operation.actionType,'RECRUIT');assert.deepEqual(f.operation.action.body,{way:2});assert.deepEqual(f.operation.costs,[{id:'抽卡券',num:1}]);assert.deepEqual(f.operation.budgetClaims.resources,f.operation.costs);assert.deepEqual(f.operation.budgetClaims.quotas,[]);assert.equal(f.operation.budgetClaims.uids.length,1);
 assert.equal(f.state.writes.length,0);assert.equal(viewFreeRecruit(f.facts,f.options).cooldownObservation.readiness,'COOLDOWN');
 const {after,reply}=await settle(f,s=>{if(ticketCount===1)s.stock=s.stock.filter(r=>r.itemId!=='抽卡券');});const result=verifyFreeRecruit(f.operation,f.facts,after,reply);assert.equal(result.confirmed,true,result.reason);assert.equal(result.responseEvidence.received.kind,fragment?'ITEM':'HERO');assert.equal(after.stock.get('抽卡券')??0,ticketCount-1);
});
test('ticket D6 accepts only explicit own way2 with exactly one owned ticket',()=>{
 const action={request:'RecruitStartRequest',body:{way:2},costs:[{id:'抽卡券',num:1}]};assert.doesNotThrow(()=>assertPaymentAllowed(action));
 for(const patch of [{costs:undefined},{costs:[]},{costs:[{id:'GOLD',num:1}]},{costs:[{id:'RUBY',num:1}]},{costs:[{id:'抽卡券',num:0}]},{costs:[{id:'抽卡券',num:2}]},{costs:[{id:'抽卡券',num:'1'}]},{costs:[{id:'抽卡券',num:1},{id:'GOLD',num:1}]},{body:{way:2,free:true}},{body:{way:3}},{body:{way:4}},{body:{way:5}}])for(const allowPaid of [false,true])assert.throws(()=>assertPaymentAllowed({...action,...patch},{allowPaid}));
 const inherited=Object.assign(Object.create({costs:action.costs}),{request:action.request,body:action.body});assert.throws(()=>assertPaymentAllowed(inherited));
});
for(const [label,mutate] of [
 ['no ticket',f=>f.state.stock=f.state.stock.filter(r=>r.itemId!=='抽卡券')],['free ready',f=>f.state.recruit.hero.freeEndTimeSeconds=0],['boundary unknown',f=>f.state.recruit.hero.freeEndTimeSeconds=1000],['missing marker',f=>delete f.state.recruit.hero.freeEndTimeSeconds],['missing clock',f=>f.client.gameClock.reset()],['missing ticket config',f=>f.options.config.tables.ItemCfg.data=f.options.config.tables.ItemCfg.data.filter(r=>r.id!=='抽卡券')]
])test('ticket qualification blocks without explicit prerequisites: '+label,async()=>{const f=fixture({ticket:true});mutate(f);const facts=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(viewFreeRecruit(facts,f.options).candidates[0].executable,false);assert.equal(f.state.writes.length,0);});
test('free mode never falls back to tickets and mode parameters cannot reuse facts',async()=>{
 const f=await ready({ticket:true});assert.equal(viewFreeRecruit(f.facts,{...f.options,parameters:{}}).candidates[0].executable,false);assert.equal(planFreeRecruit(f.facts,{...f.options,parameters:{},selections:[f.operation.actionId]}).actions.length,0);
 const options={...f.options,parameters:{}},facts=await surveyFreeRecruit(f.client,protocol,options);assert.equal(viewFreeRecruit(facts,options).candidates[0].executable,false);assert.equal(f.state.writes.length,0);
 const free=await ready();assert.equal(planFreeRecruit(free.facts,{...free.options,parameters:{payment:'ticket'},selections:[free.operation.actionId]}).actions.length,0);
});
for(const [label,mutate] of [
 ['no debit',s=>s.stock.find(r=>r.itemId==='抽卡券').num++],['two tickets',s=>s.stock.find(r=>r.itemId==='抽卡券').num--],['unrelated income',s=>s.stock[0].num++],['GOLD debit',s=>s.resources[0].amount--],['extra hero',s=>s.heroes.push(hero(actual.tables.HeroCfg.data[2].id))],['marker extended',s=>s.recruit.hero.freeEndTimeSeconds++],['expired marker',s=>s.recruit.hero.freeEndTimeSeconds=0],['antique mutation',s=>s.recruit.antique.recruitTimes++],['wrong result',s=>s.recruit.hero.nextLuck++],['free boundary reached',s=>{s.wall+=1000000;s.mono+=1000000;}]
])test('ticket settlement stays unconfirmed on '+label,async()=>{const f=await ready({ticket:true}),{after,reply}=await settle(f,mutate);assert.equal(verifyFreeRecruit(f.operation,f.facts,after,reply).confirmed,false);});
for(const mutate of [f=>f.client.factContext.accountId='B',f=>f.options.player.playerId='9007199254740997',f=>f.options.player.worldId='18',f=>f.client.factContext.connectionId='new',f=>f.client.factContext.generation++,f=>f.client.connected=false])test('ticket facts remain isolated from identity changes '+String(mutate),async()=>{const f=await ready({ticket:true});mutate(f);assert.equal(planFreeRecruit(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);});
for(const apply of [true,false])test('ticket Service reserves resource and durable intent, preserves UNKNOWN on restart '+apply,async t=>{
 const f=serviceFixture(t,{ticket:true,apply}),p=await f.plan(),{record}=await f.run(p);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.deepEqual(f.state.writes,[{name:'RecruitStartRequest',body:{way:2}}]);assert.deepEqual(f.state.saved.runBudget.reserved.resources,[{id:'抽卡券',num:1}]);assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');
 if(!apply){const bytes=fs.readFileSync(f.file,'utf8'),next=serviceFixture(t,{file:f.file,ticket:true});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.deepEqual(next.durable.list('B'),[]);}
});
for(const mode of ['quota','ticket','state','clock'])test('ticket executor stops before dispatch when parent budget or facts change '+mode,async()=>{
 const f=await ready({ticket:true}),b=budget(f);if(mode==='quota')b.runBudget=createRunBudgetContext({scope:b.scope,limits:{resources:[],quotas:[],uids:[]}});if(mode==='ticket')b.runBudget=createRunBudgetContext({scope:b.scope,limits:{...b.limits,resources:[]}});if(mode==='state')f.state.stock.find(r=>r.itemId==='抽卡券').num++;if(mode==='clock')f.state.onDispatch=()=>f.client.gameClock.reset();
 const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:b});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);
});
test('ticket late response cannot confirm after connection replacement',async()=>{
 const f=await ready({ticket:true});let release;f.state.onWrite=()=>new Promise(r=>release=r);const pending=executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f)});for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.client.factContext.connectionId='new';release();assert.equal((await pending).status,'UNKNOWN');assert.equal(f.state.writes.length,1);
});
for(const change of ['connection','generation'])test('ticket refusal survives '+change+' without a new writer',async t=>{
 const f=serviceFixture(t,{ticket:true,apply:false});f.state.onWrite=()=>{throw Object.assign(Error('synthetic refusal'),{code:'REJECTED'});};assert.equal((await f.run(await f.plan())).record.finalStatus,'REJECTED');const bytes=fs.readFileSync(f.file+'.memory.json','utf8'),next=serviceFixture(t,{ticket:true,file:f.file});next.session.connectionId=next.client.factContext.connectionId='next';if(change==='generation'){next.session.generation=next.client.factContext.generation=4;const c=trustedGameClock({accountId:'synthetic-A',generation:4,wallNow:()=>next.state.wall,monotonicNow:()=>next.state.mono});c.markPing(next.state.wall);c.observePong(wire('PingResponse',{clientTimestamp:next.state.wall,serverTimestamp:next.state.wall}));next.client.gameClock=c;}await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file+'.memory.json','utf8'),bytes);
});
test('ticket Workflow uses the same registered Function, permit and durable history',async t=>{
 const f=serviceFixture(t,{ticket:true}),read=await f.service.surveyModule(f.session,'free-recruit',f.options.parameters),row=read.view.candidates[0];const graph={version:1,id:'ticket-flow',name:'Single owned ticket',budget:row.budgetClaims,nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'free-recruit',parameters:f.options.parameters},{id:'a',type:'ACTION',module:'free-recruit',parameters:f.options.parameters,selection:row.actionId},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'z'}]};assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:()=>f.session});t.after(()=>runner.stop());let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.durable.list(f.session.id)[0].workflowNodeId,'a');assert.deepEqual(f.state.writes,[{name:'RecruitStartRequest',body:{way:2}}]);
});

test('legacy recruit preview and Function share the single exact cost source',async()=>{
 for(const ticket of [false,true]){const f=await ready({ticket}),preview=DAILY_DRIVERS[1002].evaluate({task:{progress:0,targetProgress:1},probe:()=>({hero:f.state.recruit.hero}),items:new Map([['抽卡券',2]]),now:1000});assert.deepEqual(preview.actions[0].costs,heroRecruitCosts(ticket?2:1));assert.deepEqual(preview.actions[0].body,f.operation.action.body);assert.deepEqual(preview.actions[0].costs,f.operation.costs);assert.equal(f.state.writes.length,0);}for(const way of [0,5,'2',undefined])assert.throws(()=>heroRecruitCosts(way),{code:'INVALID_PARAMETERS'});
});
test('ticket forged mode cost or receipt cannot confirm',async()=>{const f=await ready({ticket:true}),{after,reply}=await settle(f);for(const mutate of [o=>o.parameters={},o=>o.action.body.way=1,o=>o.costs=[],o=>o.budgetClaims.resources=[]]){const op=clone(f.operation);mutate(op);assert.equal(verifyFreeRecruit(op,f.facts,after,reply).confirmed,false);}for(const receipt of [null,{}, {...reply,reward:[]},{...reply,recruitData:{...reply.recruitData,freeEndTimeSeconds:2001}}])assert.equal(verifyFreeRecruit(f.operation,f.facts,after,receipt).confirmed,false);});


test('explicit batch parameters and exact owned-ticket payment contract preserve defaults',()=>{
 assert.deepEqual(validateFreeRecruitParameters({payment:'ticket',count:1}),{payment:'ticket'});for(const count of [10,50]){assert.deepEqual(validateFreeRecruitParameters({payment:'ticket',count}),{payment:'ticket',count});const way=count===10?3:4,costs=heroRecruitCosts(way);assert.deepEqual(costs,[{id:'抽卡券',num:count}]);assert.doesNotThrow(()=>assertPaymentAllowed({request:'RecruitStartRequest',body:{way},costs}));for(const bad of [[],[{id:'抽卡券',num:count-1}],[{id:'抽卡券',num:count+1}],[{id:'GOLD',num:count}],[{id:'RUBY',num:count}], [...costs,{id:'其他',num:1}]])assert.throws(()=>assertPaymentAllowed({request:'RecruitStartRequest',body:{way},costs:bad}));assert.throws(()=>assertPaymentAllowed({request:'RecruitStartRequest',body:{way,times:count},costs}));}
 for(const count of [0,2,9,11,49,51,'10',undefined,NaN])assert.throws(()=>validateFreeRecruitParameters({payment:'ticket',count}),{code:'INVALID_PARAMETERS'});for(const p of [{count:10},{payment:'free',count:1},{payment:'free',count:10},{payment:'ticket',count:10,way:3},{payment:'ticket',count:10,request:'RecruitStartRequest'}])assert.throws(()=>validateFreeRecruitParameters(p),{code:'INVALID_PARAMETERS'});assert.deepEqual(validateFreeRecruitParameters({}),{});
});
for(const count of [10,50])for(const freeMarker of [0,500,1000,2000])test('explicit batch '+count+' has fixed owned cost independent of free marker '+freeMarker,async()=>{
 const f=await ready({ticket:true,count,freeMarker});assert.ok(f.operation,JSON.stringify(viewFreeRecruit(f.facts,f.options)));assert.deepEqual(f.operation.action.body,{way:count===10?3:4});assert.deepEqual(f.operation.costs,[{id:'抽卡券',num:count}]);assert.equal(f.operation.label,'自有抽卡券招募 ×'+count);assert.deepEqual(f.operation.budgetClaims.resources,f.operation.costs);assert.deepEqual(f.operation.budgetClaims.quotas,[]);assert.equal(f.operation.budgetClaims.uids.length,1);assert.equal(f.state.writes.length,0);const {after,reply}=await settle(f);const v=verifyFreeRecruit(f.operation,f.facts,after,reply);assert.equal(v.confirmed,true,v.reason);assert.equal(v.responseEvidence.received.length,count);assert.equal(after.state.recruit.hero.freeEndTimeSeconds,freeMarker);
});
for(const count of [10,50])for(const codec of [false,true])for(const fragment of [false,true])test('batch exact aggregate reward settlement '+count+' codec '+codec+' fragments only '+fragment,async()=>{
 const f=await ready({ticket:true,count,codec,fragment});assert.ok(f.operation);f.state.onWrite=()=>{f.state.stock=f.state.stock.filter(r=>r.num!==0).reverse();f.state.heroes.reverse();};const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.responseEvidence.received.length,count);assert.equal(f.state.writes.length,1);assert.equal(f.state.stock.some(r=>r.itemId==='抽卡券'),false);assert.equal(f.state.stock.find(r=>r.itemId===itemId).num,9+10*(count-(fragment?0:1)));assert.equal(f.client.uncertainWrites.size,0);
});
for(const count of [10,50])test('batch shortages, unknown clock and absent metadata cannot select or dispatch '+count,async()=>{
 for(const extra of [{ticketCount:count-1},{ticketCount:0}]){const f=await ready({ticket:true,count,...extra});assert.equal(f.operation,undefined);assert.equal(f.state.writes.length,0);assert.equal(viewFreeRecruit(f.facts,f.options).candidates[0].blockedReason,'RECRUIT_TICKET_INSUFFICIENT');}const f=await ready({ticket:true,count});f.client.gameClock.reset();assert.equal(planFreeRecruit(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);for(const entry of ['dailies','loop']){const compiled=compileUnifiedExecution({entry,dailies:[{taskId:1002,action:'perform',parameters:{payment:'ticket',count}}],budget:f.operation.budgetClaims},{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.blocked,[]);assert.deepEqual(compiled.graph.nodes.find(n=>n.type==='ACTION').parameters,{payment:'ticket',count});assert.deepEqual(compiled.graph.budget,f.operation.budgetClaims);}
});
for(const count of [10,50])for(const [label,change]of [
 ['short receipt',r=>r.reward.pop()],['extra receipt',r=>r.reward.push(clone(r.reward[0]))],['duplicate new hero',r=>r.reward[1]={heroId:newId,trans:false}],['unresolved conversion',r=>r.reward[0].trans=true],['unknown hero',r=>r.reward[0].heroId='unknown'],['wrong amount',r=>r.reward[1].frag.asset[0].num++],['ambiguous material',r=>r.reward[1].frag.asset.push(clone(r.reward[1].frag.asset[0]))],['changed marker',r=>r.recruitData.freeEndTimeSeconds++],['wrong counter',r=>r.recruitData.recruitTimes++]
])test('batch '+count+' mismatched '+label+' stays unconfirmed',async()=>{const f=await ready({ticket:true,count}),{after,reply}=await settle(f),bad=clone(reply);change(bad);assert.equal(verifyFreeRecruit(f.operation,f.facts,after,bad).confirmed,false);});
for(const count of [10,50])for(const [label,change]of [
 ['short debit',s=>s.stock.find(r=>r.itemId==='抽卡券').num++],['excess debit',s=>s.stock.find(r=>r.itemId==='抽卡券').num--],['extra stock',s=>s.stock[0].num++],['other resource',s=>s.resources[0].amount--],['other hero',s=>s.heroes[0].level++],['other recruit',s=>s.recruit.antique.recruitTimes++]
])test('batch '+count+' '+label+' remains UNKNOWN in original executor',async()=>{const f=await ready({ticket:true,count,ticketCount:count+2});f.state.onWrite=()=>change(f.state);const result=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f)});assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,1);});
for(const count of [10,50])for(const apply of [true,false])test('batch Service exact durable budget and UNKNOWN restart '+count+' '+apply,async t=>{
 const f=serviceFixture(t,{ticket:true,count,apply}),p=await f.plan(),{record}=await f.run(p);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.deepEqual(f.state.writes,[{name:'RecruitStartRequest',body:{way:count===10?3:4}}]);assert.deepEqual(f.state.saved.runBudget.reserved.resources,[{id:'抽卡券',num:count}]);assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.durable.list('B'),[]);if(!apply){const bytes=fs.readFileSync(f.file,'utf8'),next=serviceFixture(t,{ticket:true,count,file:f.file});await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);}
});
for(const count of [10,50])test('batch refusal survives reconnect without another writer '+count,async t=>{
 const f=serviceFixture(t,{ticket:true,count,apply:false});f.state.onWrite=()=>{throw Object.assign(Error('synthetic batch refusal'),{code:'REJECTED'});};assert.equal((await f.run(await f.plan())).record.finalStatus,'REJECTED');const bytes=fs.readFileSync(f.file+'.memory.json','utf8'),next=serviceFixture(t,{ticket:true,count,file:f.file});next.session.connectionId=next.client.factContext.connectionId='next';await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);assert.equal(fs.readFileSync(f.file+'.memory.json','utf8'),bytes);
});
for(const count of [10,50])for(const fault of ['account','player','world','connection','generation','cancel'])test('batch late response cannot cross '+fault+' '+count,async()=>{
 const f=await ready({ticket:true,count}),abort=new AbortController();let release;f.state.onWrite=()=>new Promise(r=>release=r);const pending=executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f),signal:abort.signal});for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);if(fault==='cancel')abort.abort();else if(fault==='account')f.client.factContext.accountId='B';else if(fault==='player')f.options.player.playerId='9007199254740997';else if(fault==='world')f.options.player.worldId='18';else if(fault==='generation')f.client.factContext.generation++;else f.client.factContext.connectionId='new';release();const result=await pending;assert.equal(result.status,'UNKNOWN');assert.equal(f.state.writes.length,1);
});
for(const count of [10,50])test('batch Workflow reuses registered Function and existing permit '+count,async t=>{
 const f=serviceFixture(t,{ticket:true,count}),read=await f.service.surveyModule(f.session,'free-recruit',f.options.parameters),row=read.view.candidates[0],graph=compileUnifiedExecution({entry:'dailies',dailies:[{taskId:1002,action:'perform',parameters:f.options.parameters}],budget:row.budgetClaims},{modules:GAMEPLAY_MODULES}).graph;
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:()=>f.session});t.after(()=>runner.stop());let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.durable.list(f.session.id)[0].workflowId,result.runId);assert.equal(f.state.writes.length,1);
});

for(const count of [10,50])for(const kind of ['resource','uid'])test('batch exact parent '+kind+' budget stops before dispatch '+count,async()=>{const f=await ready({ticket:true,count}),b=budget(f),limits=clone(b.limits);if(kind==='resource')limits.resources[0].num=count-1;else limits.uids=[];b.runBudget=createRunBudgetContext({scope:b.scope,limits});const r=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:b});assert.equal(r.status,'NOT_EXECUTED');assert.equal(f.state.writes.length,0);assert.equal(f.client.uncertainWrites.size,0);assert.deepEqual(b.runBudget.snapshot().reserved,{resources:[],quotas:[],uids:[]});});

// Same read set, separate antique identity and requirements; no settlement permit.
for(const codec of [false,true])for(const [marker,tickets,expected]of [[0,0,[true,false,false,false]],[0,50,[true,false,true,true]],[2000,50,[false,true,true,true]],[2000,9,[false,true,false,false]]])test('antique recruitment read-only conditions use shared marker/cost parsing '+codec+' '+marker+' '+tickets,async()=>{
 const f=fixture({codec});f.state.recruit.antique.freeEndTimeSeconds=marker;f.state.stock.push({itemId:'藏品券',num:tickets});
 const facts=await surveyFreeRecruit(f.client,protocol,f.options),view=viewFreeRecruit(facts,f.options),a=view.antiqueObservation;
 assert.equal(a.status,'OBSERVED');assert.equal(a.kind,'antique');assert.equal(a.source,'RecruitInfoResponse.antique');assert.equal(a.requiredLevel,10);assert.equal(a.ownedTickets,tickets);assert.equal(a.recruit.freeEndTimeSeconds,marker);
 assert.deepEqual(a.modes.map(r=>r.observedRequirementsMet),expected);assert.deepEqual(a.modes.map(r=>r.costs),[[],[{id:'藏品券',num:1}],[{id:'藏品券',num:10}],[{id:'藏品券',num:50}]]);
 assert.equal(a.eligibility,null);assert.equal(a.executable,false);assert.equal(a.autoResume,false);assert.equal(Object.hasOwn(a,'completion'),false);assert.equal(Object.hasOwn(a,'rewardClaimed'),false);
 for(const row of a.modes){assert.equal(row.executable,false);assert.equal(Object.hasOwn(row,'action'),false);assert.equal(Object.hasOwn(row,'actionId'),false);assert.equal(Object.hasOwn(row,'parameters'),false);}
 assert.equal(view.candidates.length,1);assert.equal(view.candidates[0].action.request,'RecruitStartRequest');assert.equal(view.candidates[0].target.way,1);
 assert.deepEqual(f.state.reads,['RecruitInfoRequest','AllHeroRequest','OnWaterRequest','AllItemRequest','AllResourceRequest']);assert.equal(f.state.writes.length,0);
});
for(const [label,mutate]of [
 ['missing antique',f=>delete f.state.recruit.antique],
 ['missing marker',f=>delete f.state.recruit.antique.freeEndTimeSeconds],
 ['invalid marker',f=>f.state.recruit.antique.freeEndTimeSeconds=-1],
 ['missing task',f=>delete f.state.recruit.antique.task],
 ['missing gotId',f=>delete f.state.recruit.antique.task.gotId],
 ['unknown level',f=>delete f.options.config.tables.ModuleOpenCfg.data.find(r=>r.moduleId==='藏品').playerLevel],
 ['duplicate gate',f=>f.options.config.tables.ModuleOpenCfg.data.push(clone(f.options.config.tables.ModuleOpenCfg.data.find(r=>r.moduleId==='藏品')))],
 ['missing ticket config',f=>f.options.config.tables.ItemCfg.data=f.options.config.tables.ItemCfg.data.filter(r=>r.id!=='藏品券')],
])test('antique read-only unknown is local and preserves hero qualification: '+label,async()=>{
 const f=fixture();mutate(f);const facts=await surveyFreeRecruit(f.client,protocol,f.options),view=viewFreeRecruit(facts,f.options);
 assert.equal(view.antiqueObservation.status,'UNKNOWN');assert.equal(view.antiqueObservation.recruit,null);assert.equal(view.antiqueObservation.ownedTickets,null);assert.ok(view.antiqueObservation.modes.every(r=>r.observedRequirementsMet===null&&r.executable===false));
 assert.equal(view.candidates[0].executable,true,JSON.stringify(view.candidates[0]));assert.equal(f.state.writes.length,0);
});
for(const [label,change]of [
 ['account',f=>f.client.factContext.accountId='synthetic-B'],['generation',f=>f.client.factContext.generation++],['connection',f=>f.client.factContext.connectionId='other'],['role',f=>f.options.player.playerId='7'],['world',f=>f.options.player.worldId='8'],['disconnect',f=>f.client.connected=false],
])test('antique read-only conditions cannot survive changed '+label,async()=>{
 const f=fixture();const facts=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(viewFreeRecruit(facts,f.options).antiqueObservation.status,'OBSERVED');change(f);
 const a=viewFreeRecruit(facts,f.options).antiqueObservation;assert.equal(a.status,'UNKNOWN');assert.equal(a.eligibility,null);assert.ok(a.modes.every(r=>r.observedRequirementsMet===null));assert.equal(f.state.writes.length,0);
});
test('antique read-only clock, level, config and persisted copies cannot grant eligibility',async()=>{
 const f=fixture();f.state.stock.push({itemId:'藏品券',num:50});f.options.player.level=9;let facts=await surveyFreeRecruit(f.client,protocol,f.options);
 assert.ok(viewFreeRecruit(facts,f.options).antiqueObservation.modes.every(r=>r.observedRequirementsMet===false));f.options.player.level=10;facts=await surveyFreeRecruit(f.client,protocol,f.options);
 f.client.gameClock={read:()=>({status:'UNKNOWN'})};let a=viewFreeRecruit(facts,f.options).antiqueObservation;assert.equal(a.readiness,'UNKNOWN');assert.ok(a.modes.every(r=>r.observedRequirementsMet===null));
 const changed=clone(f.options);changed.config.tables.ModuleOpenCfg.data.find(r=>r.moduleId==='藏品').playerLevel=1;assert.equal(viewFreeRecruit(facts,changed).antiqueObservation.status,'UNKNOWN');
 a=viewFreeRecruit(clone(facts),f.options).antiqueObservation;assert.equal(a.status,'UNKNOWN');assert.ok(a.modes.every(r=>r.observedRequirementsMet===null));assert.equal(a.eligibility,null);assert.equal(f.state.writes.length,0);
});

for(const [ticket,count,freeMarker]of [[false,1,0],[true,1,2000],[true,10,0],[true,50,2000]])for(const fragment of [false,true])test('explicit antique recruit independently settles '+ticket+' '+count+' '+fragment,async()=>{
 const f=await ready({antique:true,ticket,count,freeMarker,fragment});assert.ok(f.operation,JSON.stringify(viewFreeRecruit(f.facts,f.options)));
 assert.deepEqual(f.operation.action,{request:'AntiqueRecruitRequest',response:'AntiqueRecruitResponse',body:{type:1,way:ticket?({1:2,10:3,50:4})[count]:1}});assert.deepEqual(f.operation.costs,ticket?[{id:'藏品券',num:count}]:[]);assert.ok(f.operation.budgetClaims.uids[0].id.startsWith('antique:'));assert.equal(f.state.reads.filter(r=>r==='AllAntiqueRequest').length,1);assert.equal(f.state.writes.length,0);
 const {after,reply}=await settle(f),verified=verifyFreeRecruit(f.operation,f.facts,after,reply);assert.equal(verified.confirmed,true,verified.reason);assert.deepEqual(after.state.heroes,f.facts.state.heroes);assert.deepEqual(after.state.recruit.hero,f.facts.state.recruit.hero);
 const received=count===1?[verified.responseEvidence.received]:verified.responseEvidence.received;assert.equal(received.length,count);assert.equal(received[0].kind,fragment?'ITEM':'ANTIQUE');
});

test('antique strict parameters and D6 reject advertising, dive, wrong currency and ambiguous costs',()=>{
 assert.deepEqual(validateFreeRecruitParameters({recruit:'hero'}),{});assert.deepEqual(validateFreeRecruitParameters({recruit:'antique',payment:'free'}),{recruit:'antique'});assert.deepEqual(validateFreeRecruitParameters({recruit:'antique',payment:'ticket',count:1}),{recruit:'antique',payment:'ticket'});
 for(const p of [{recruit:'auto'},{recruit:1},{recruit:'antique',way:1},{recruit:'antique',payment:'free',count:1}])assert.throws(()=>validateFreeRecruitParameters(p));
 for(const [way,num]of [[1,0],[2,1],[3,10],[4,50]]){const a={request:'AntiqueRecruitRequest',body:{type:1,way},costs:num?[{id:'藏品券',num}]:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));for(const body of [{type:2,way},{type:1,way:5},{type:1,way,universal:false},{way},{}])assert.throws(()=>assertPaymentAllowed({...a,body}));for(const id of ['RUBY','GOLD','抽卡券'])assert.throws(()=>assertPaymentAllowed({...a,costs:[{id,num:num||1}]}));assert.throws(()=>assertPaymentAllowed({request:a.request,body:a.body}));if(num)for(const n of [0,num-1,num+1])assert.throws(()=>assertPaymentAllowed({...a,costs:[{id:'藏品券',num:n}]}));}
});
for(const [label,mutate]of [
 ['no AllAntique',f=>f.state.overrides.AllAntiqueRequest={}],['missing master',f=>delete f.state.antiques.masterLv],['duplicate owned ID',f=>f.state.antiques.antiques.push(clone(f.state.antiques.antiques[0]))],['unknown star',f=>delete f.state.antiques.antiques[0].star],
 ['missing conversion config',f=>delete f.options.config.tables.AntiqueFragReturnCfg],['missing quality conversion',f=>f.options.config.tables.AntiqueFragReturnCfg.data=[]],['duplicate conversion',f=>f.options.config.tables.AntiqueFragReturnCfg.data.push(clone(f.options.config.tables.AntiqueFragReturnCfg.data[0]))],['missing fragment config',f=>f.options.config.tables.ItemCfg.data=f.options.config.tables.ItemCfg.data.filter(r=>r.id!==antiqueItemId)],['missing suits config',f=>delete f.options.config.tables.AntiqueSuitCfg],['insufficient tickets',f=>f.state.stock.find(r=>r.itemId==='藏品券').num=9],['missing antique marker',f=>delete f.state.recruit.antique.freeEndTimeSeconds]
])test('antique write eligibility rejects '+label+' before transport',async()=>{
 const f=fixture({antique:true,ticket:true,count:10,codec:false});mutate(f);const facts=await surveyFreeRecruit(f.client,protocol,f.options),row=viewFreeRecruit(facts,f.options).candidates[0];assert.equal(row.executable,false,JSON.stringify(row));assert.deepEqual(planFreeRecruit(facts,{...f.options,selections:[row.actionId]}).actions,[]);assert.equal(f.state.writes.length,0);
});
for(const [label,mutate]of [
 ['missing new antique',s=>s.antiques.antiques.pop()],['old star changed',s=>s.antiques.antiques[0].star++],['extra antique',s=>s.antiques.antiques.push({id:actual.tables.AntiqueBaseCfg.data[2].antiqueId,star:0})],['master changed',s=>s.antiques.masterLv++],['suit added',s=>s.antiques.suits.push({id:1,level:1,effectiveNum:1,advEffectValue:1})],['hero added',s=>s.heroes.push(hero(newId))],['old hero changed',s=>s.heroes[0].level++],['hero recruit changed',s=>s.recruit.hero.nextLuck--],['no exact fragment net',s=>s.stock[0].num++],['ticket underdebit',s=>s.stock.find(r=>r.itemId==='藏品券').num++],['ticket overdebit',s=>s.stock.find(r=>r.itemId==='藏品券').num--],['GOLD changed',s=>s.resources[0].amount--],['RUBY changed',s=>s.resources[1].amount--],['broadcast changed',s=>s.city.building[0].level++]
])test('antique independent settlement stays UNKNOWN on '+label,async()=>{
 const f=await ready({antique:true,ticket:true,count:10,ticketCount:51}),{after,reply}=await settle(f,mutate);assert.equal(verifyFreeRecruit(f.operation,f.facts,after,reply).confirmed,false);
});
test('antique typed rewards distinguish new ID, exact configured conversion and explicit asset package',async()=>{
 const f=await ready({antique:true,ticket:true,count:10}),{after,reply}=await settle(f);for(const reward of [[],reply.reward.slice(1),[...reply.reward,reply.reward[0]],[...reply.reward.slice(0,9),{antiqueId:'unknown',trans:true}],[...reply.reward.slice(0,9),{antiqueId,trans:false}],[...reply.reward.slice(0,9),{antiqueId:newAntiqueId,trans:false}],[...reply.reward.slice(0,9),{antiqueId,trans:'true'}],[...reply.reward.slice(0,9),{reward:{asset:[{type:1,id:antiqueItemId,num:conversionCount}]}}],[...reply.reward.slice(0,9),{reward:{asset:[{type:0,id:antiqueItemId,num:conversionCount+1}]}}]])assert.equal(verifyFreeRecruit(f.operation,f.facts,after,{...reply,reward}).confirmed,false);
 for(const change of [o=>o.action.body.type=2,o=>o.action.body.way=5,o=>o.parameters.recruit='hero',o=>o.budgetClaims.uids=[],o=>o.costs[0].id='抽卡券']){const op=clone(f.operation);change(op);assert.equal(verifyFreeRecruit(op,f.facts,after,reply).confirmed,false);}
 const x=await ready({antique:true,ticket:true,count:10}),settled=await settle(x,s=>s.stock=s.stock.filter(r=>r.num!==0));assert.equal(verifyFreeRecruit(x.operation,x.facts,settled.after,settled.reply).confirmed,true);
});
test('antique new ownership uses the existing quality-bound derived-suit validator',async()=>{
 const purple=actual.tables.AntiqueBaseCfg.data.find(r=>r.color==='PURPLE'),derived=actual.tables.AntiqueSuitCfg.data.find(r=>r.taskType==='拥有藏品'&&r.taskParam1==='紫');
 const f=fixture({antique:true,receipt:{recruitData:{freeEndTimeSeconds:2000,nextLuck:9,recruitTimes:2,task:{times:2,gotId:0}},reward:[{antiqueId:purple.antiqueId,trans:false}]}});f.state.antiques.suits=[{id:derived.suitId,level:1,effectiveNum:0,advEffectValue:0},{id:99999,level:1,effectiveNum:0,advEffectValue:0}];
 const before=await surveyFreeRecruit(f.client,protocol,f.options),row=viewFreeRecruit(before,f.options).candidates[0],op=planFreeRecruit(before,{...f.options,selections:[row.actionId]}).actions[0];
 const reply=await f.client.request('AntiqueRecruitRequest',{type:1,way:1},'AntiqueRecruitResponse',1000,{mutate:true});f.state.antiques.antiques.at(-1).id=purple.antiqueId;f.state.antiques.suits[0].effectiveNum=1;f.state.antiques.suits[0].advEffectValue=0.1;let after=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(verifyFreeRecruit(op,before,after,reply).confirmed,true);
 f.state.antiques.suits[1].effectiveNum=1;after=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(verifyFreeRecruit(op,before,after,reply).confirmed,false);f.state.antiques.suits[1].effectiveNum=0;f.state.antiques.suits[0].level++;after=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(verifyFreeRecruit(op,before,after,reply).confirmed,false);
});
for(const count of [1,10])for(const apply of [true,false])test('antique Service persists exact owned-ticket intent, UNKNOWN and restart '+count+' '+apply,async t=>{
 const f=serviceFixture(t,{antique:true,ticket:true,count,apply}),p=await f.plan(),{record,permit}=await f.run(p);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN',JSON.stringify(record));assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.saved.runBudget.reserved.resources,[{id:'藏品券',num:count}]);assert.ok(f.state.saved.runBudget.reserved.uids[0].id.startsWith('antique:ticket:'));assert.equal(f.state.writes.length,1);assert.throws(()=>f.service.execute(f.session,permit));
 const restarted=serviceFixture(t,{file:f.file,antique:true,ticket:true,count});assert.equal(restarted.durable.list(f.session.id)[0].finalStatus,apply?'SUCCESS':'UNKNOWN');if(!apply){await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);}
});
test('antique parent budget, durable refusal and changed configuration block before dispatch',async t=>{
 for(const mode of ['budget','refusal','config']){const f=serviceFixture(t,{antique:true,ticket:true,count:10,apply:mode!=='refusal'}),p=await f.plan();if(mode==='config'){f.options.config.tables.AntiqueFragReturnCfg.data[0].count++;assert.throws(()=>f.authorize(p),{code:'STALE_PLAN'});}else if(mode==='refusal'){f.state.onWrite=()=>{throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});};const {record}=await f.run(p);assert.equal(record.finalStatus,'REJECTED');const restarted=serviceFixture(t,{file:f.file,antique:true,ticket:true,count:10});await assert.rejects(restarted.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(restarted.state.writes.length,0);}else assert.throws(()=>f.service.authorize(f.session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:[{id:'抽卡券',num:10}],confirm:true}));assert.equal(f.state.writes.length,mode==='refusal'?1:0);}
});
for(const [label,change]of [['account',f=>f.client.factContext.accountId='B'],['generation',f=>f.client.factContext.generation++],['connection',f=>f.client.factContext.connectionId='other'],['role',f=>f.options.player.playerId='9'],['world',f=>f.options.player.worldId='8'],['disconnect',f=>f.client.connected=false]])test('antique late transport response cannot confirm changed '+label,async()=>{
 const f=await ready({antique:true,ticket:true,count:10});let release;f.state.onWrite=()=>new Promise(r=>release=r);const pending=executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:freeRecruitModule,allowMutate:true,budget:budget(f)});for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);change(f);release();const result=await pending;assert.equal(result.status,'UNKNOWN');assert.equal(f.state.writes.length,1);
});
test('antique native Workflow uses original authorization; daily hero identity stays separate',async t=>{
 for(const entry of ['dailies','loop'])assert.throws(()=>compileUnifiedExecution({entry,tasks:[],world:[],dailies:[{taskId:1002,action:'perform',parameters:{recruit:'antique'}}],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID',message:/日常1002/});
 const f=serviceFixture(t,{antique:true}),read=await f.service.surveyModule(f.session,'free-recruit',f.options.parameters),row=read.view.candidates[0];assert.equal(read.view.cooldownObservation.status,'UNKNOWN');
 const graph={version:1,id:'antique-recruit-flow',name:'Synthetic antique',budget:row.budgetClaims,nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'free-recruit',parameters:f.options.parameters},{id:'a',type:'ACTION',module:'free-recruit',parameters:f.options.parameters,selection:row.actionId},{id:'v',type:'VERIFY',module:'free-recruit'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.durable.list(f.session.id)[0].workflowId,result.runId);
});

test('antique real Codec rejects absent required master instead of granting an empty zero state',async()=>{
 const f=fixture({antique:true});f.state.overrides.AllAntiqueRequest=(()=>{try{protocol.AllAntiqueResponse.decode(new Uint8Array());throw Error('expected Codec rejection');}catch(e){assert.match(e.message,/missing required 'masterLv'/);return e;}})();const facts=await surveyFreeRecruit(f.client,protocol,f.options);assert.equal(viewFreeRecruit(facts,f.options).candidates[0].executable,false);assert.equal(f.state.writes.length,0);
});

test('antique new ownership permits only reliable server-derived hero refresh, never additional growth or conversion-only changes',async()=>{
 const f=await ready({antique:true}),{after,reply}=await settle(f,s=>{s.heroes[0].power='11';s.heroes[0].attributes=[{attr:1,value:123}];});assert.equal(verifyFreeRecruit(f.operation,f.facts,after,reply).confirmed,true);
 for(const change of [s=>s.heroes[0].level++,s=>s.heroes[0].attributes.push({attr:1,value:9}),s=>s.heroes[0].attributes[0].value=Infinity]){const x=await ready({antique:true}),done=await settle(x,s=>{s.heroes[0].power='11';s.heroes[0].attributes=[{attr:1,value:123}];change(s);});assert.equal(verifyFreeRecruit(x.operation,x.facts,done.after,done.reply).confirmed,false);}
 const converted=await ready({antique:true,fragment:true}),r=await settle(converted,s=>{s.heroes[0].power='11';s.heroes[0].attributes=[{attr:1,value:123}];});assert.equal(verifyFreeRecruit(converted.operation,converted.facts,r.after,r.reply).confirmed,false);
});
