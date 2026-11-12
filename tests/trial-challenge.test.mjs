import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { trialChallengeModule,validateTrialChallengeConfig,validateTrialChallengeParameters,surveyTrialChallenge,viewTrialChallenge,planTrialChallenge,verifyTrialChallenge,trialChallengeDependencyVersions } from '../src/trial-challenge.mjs';
import { trustedGameClock } from '../src/state-facts.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner,validateWorkflow } from '../src/workflow.mjs';


// Actual local codecs/config and synthetic account state; no live transport.
const protocol=loadProtocol(),actual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v),wire=(n,b)=>protocol[n].decode(protocol[n].encode(b).finish());
const stage=actual.tables.TrialRaidStageCfg.data.find(r=>r.raidId===1&&r.stageLevel===1);
const config=()=>({tables:Object.fromEntries(['ModuleOpenCfg','TrialRaidCfg','TrialRaidStageCfg','ItemCfg'].map(k=>[k,clone(actual.tables[k])]))});
function fixture({codec=true,apply=true,receipt=null}={}) {
 receipt??={raidId:1,stageId:stage.stageId,reward:{asset:stage.reward.map(([id,num])=>({type:0,id,num}))}};
 const state={raid:{raid:{raidId:1,passedStage:0,sweepTimes:0,buySweepTimes:0}},heroes:[{heroId:'synthetic-hero',level:1,star:0,power:'9007199254740993',skillLevels:[1]}],stock:stage.reward.map(([itemId])=>({itemId,num:9})),resources:[{res:3,amount:100},{res:4,amount:50}],reads:[],writes:[],overrides:{},onRead:null,onWrite:null,onDispatch:null};
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-trial'},pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
 async request(n,b,r,timeout,opts) {
  if(codec)wire(n,b);
  if(opts?.mutate){state.onDispatch?.();opts.beforeDispatch?.();state.writes.push({name:n,body:clone(b)});if(apply){state.raid.raid.passedStage=stage.stageId;for(const [id,num] of stage.reward)state.stock.find(x=>x.itemId===id).num+=num;}await state.onWrite?.();return codec?wire(r,receipt):clone(receipt);}
  state.reads.push({name:n,body:clone(b)});await state.onRead?.(n);
  let value=n==='TrialRaidInfoRequest'?state.raid:n==='AllHeroRequest'?{heroes:state.heroes}:n==='AllItemRequest'?{items:state.stock}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected '+n);return codec?wire(r,value):clone(value);
 }};
 const options={config:config(),moduleConfig:{enabled:true},parameters:{},player:{playerId:'9007199254740993',worldId:'17',level:30}};
 return {state,client,options};
}
async function ready(extra={}){const f=fixture(extra),facts=await surveyTrialChallenge(f.client,protocol,f.options),row=viewTrialChallenge(facts,f.options).candidates[0],operation=planTrialChallenge(facts,{...f.options,selections:[row.actionId]}).actions[0];return {...f,facts,operation};}
const budget=f=>{const scope={accountId:'synthetic-A',generation:3,connectionId:'offline-trial',runId:'run'},limits=f.operation.budgetClaims;return {ledger:null,runBudget:createRunBudgetContext({scope,limits}),scope,limits,batchId:'batch'};};
async function settle(f,mutate){const reply=await f.client.request('TrialRaidChallengeRequest',{raidId:1,stageId:stage.stageId},'TrialRaidChallengeResponse',1000,{mutate:true});mutate?.(f.state);const after=await surveyTrialChallenge(f.client,protocol,f.options);return {after,reply};}

test('next first-clear trial uses exact configured target/rewards, never sweep costs',async()=>{
 const f=await ready();assert.ok(f.operation,JSON.stringify(viewTrialChallenge(f.facts,f.options)));
 assert.deepEqual(trialChallengeModule.defaultConfig,{enabled:false});assert.equal(trialChallengeModule.execute,undefined);
 assert.deepEqual(f.state.reads[0],{name:'TrialRaidInfoRequest',body:{raidId:1}});
 assert.deepEqual(f.operation.action,{request:'TrialRaidChallengeRequest',response:'TrialRaidChallengeResponse',body:{raidId:1,stageId:1001}});
 assert.deepEqual(f.operation.costs,[]);assert.equal(f.operation.requiredLevel,14);
 assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[{id:'trial-challenge:first-clear:1:1001',num:1}],uids:[{type:'trial-challenge',id:'1:1001'}]});
 const {after,reply}=await settle(f),r=verifyTrialChallenge(f.operation,f.facts,after,reply);assert.equal(r.confirmed,true,r.reason);
 const row=viewTrialChallenge(after,f.options).candidates[0];assert.equal(row.target.stageId,1002);assert.equal(row.target.passedStage,1001);
});
test('parameters/default off and exact selection are mandatory',async()=>{
 assert.deepEqual(validateTrialChallengeParameters({}),{});assert.deepEqual(validateTrialChallengeConfig({}),{enabled:false});
 for(const p of[null,[],{raidId:1},{stageId:1001},{sweep:false},Object.create({})])assert.throws(()=>validateTrialChallengeParameters(p),{code:'INVALID_PARAMETERS'});
 for(const c of[null,{enabled:1},{paid:false}])assert.throws(()=>validateTrialChallengeConfig(c),{code:'INVALID_PARAMETERS'});
 const f=await ready();for(const selections of[[],['forged']])assert.equal(planTrialChallenge(f.facts,{...f.options,selections}).actions.length,0);
 assert.equal(planTrialChallenge(f.facts,{...f.options,moduleConfig:{enabled:false},selections:[f.operation.actionId]}).actions.length,0);
 for(const selections of[['a','b'],Array(1),'x',[1]])assert.throws(()=>planTrialChallenge(f.facts,{...f.options,selections}),{code:'INVALID_PARAMETERS'});
});
for(const key of['passedStage','sweepTimes','buySweepTimes'])test('missing own raid field never implies zero: '+key,async()=>{
 const f=fixture();delete f.state.raid.raid[key];const facts=await surveyTrialChallenge(f.client,protocol,f.options);assert.equal(viewTrialChallenge(facts,f.options).candidates[0].executable,false);
});
test('authority/config/level/unknown predecessor block without dispatch',async()=>{
 for(const mutate of[
 f=>f.state.raid.raid.raidId=2,f=>f.state.raid.raid.passedStage=1,f=>f.state.raid.raid.sweepTimes=-1,
 f=>f.state.heroes=[],f=>f.state.stock[0].num=Number.MAX_SAFE_INTEGER,f=>delete f.state.resources[0].amount,f=>delete f.state.heroes[0].skillLevels,f=>f.state.heroes.push(clone(f.state.heroes[0])),
 f=>delete f.options.player.level,f=>f.options.player.level=13,f=>f.client.factContext.playerId='2',
 f=>f.state.overrides.TrialRaidInfoRequest=new Error('token=secret'),
 f=>delete f.options.config.tables.ModuleOpenCfg,f=>f.options.config.tables.ModuleOpenCfg.data.push({moduleId:'试炼副本',playerLevel:14}),
 f=>f.options.config.tables.TrialRaidStageCfg.data.push(clone(stage)),
 f=>f.options.config.tables.TrialRaidStageCfg.data.find(r=>r.stageId===1001).reward=[['invented',1]],
 f=>f.options.config.tables.TrialRaidStageCfg.data.find(r=>r.stageId===1001).stageLevel=0,
 f=>delete f.options.config.tables.ItemCfg
 ]){const f=fixture();mutate(f);const facts=await surveyTrialChallenge(f.client,protocol,f.options),view=viewTrialChallenge(facts,f.options);assert.equal(view.candidates[0].executable,false,String(mutate));assert.doesNotMatch(JSON.stringify(view),/token=secret/);assert.equal(f.state.writes.length,0);}
 const f=fixture();f.state.raid.raid.passedStage=Math.max(...f.options.config.tables.TrialRaidStageCfg.data.filter(r=>r.raidId===1).map(r=>r.stageId));const facts=await surveyTrialChallenge(f.client,protocol,f.options);assert.equal(viewTrialChallenge(facts,f.options).candidates[0].blockedReason,'TRIAL_CHALLENGE_COMPLETE');
});
test('account/world/generation/connection/level/clones and forged facts invalidate plans',async()=>{
 for(const mutate of[
 f=>f.client.factContext.accountId='B',f=>f.client.factContext.connectionId='new',f=>f.client.factContext.generation++,
 f=>f.options.player.worldId='18',f=>f.options.player.level=13,f=>f.client.connected=false,f=>f.facts=clone(f.facts),
 f=>f.facts.sourceFacts.raid.provenance.sourceAt++,f=>f.facts.state.raid.passedStage=1001
 ]){const f=await ready();mutate(f);assert.equal(planTrialChallenge(f.facts,{...f.options,selections:[f.operation.actionId]}).actions.length,0);}
});
test('progress change at final socket boundary prevents transport',async()=>{
 const f=await ready();f.state.onDispatch=()=>f.options.player.level=13;
 const r=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:trialChallengeModule,allowMutate:true,budget:budget(f)});assert.equal(r.dispatched,false);assert.equal(f.state.writes.length,0);
});
for(const [label,mutate] of[
 ['no progress',s=>s.raid.raid.passedStage=0],['wrong stage',s=>s.raid.raid.passedStage=1002],
 ['sweep counter',s=>s.raid.raid.sweepTimes++],['buy counter',s=>s.raid.raid.buySweepTimes++],
 ['hero changes',s=>s.heroes[0].level++],['extra hero',s=>s.heroes.push({...clone(s.heroes[0]),heroId:'extra'})],
 ['missing reward',s=>s.stock[0].num--],['extra reward',s=>s.stock[0].num++],
 ['RUBY debit',s=>s.resources[1].amount--],['unrelated gold',s=>s.resources[0].amount++]
])test('UNKNOWN on '+label,async()=>{const f=await ready(),{after,reply}=await settle(f,mutate);assert.equal(verifyTrialChallenge(f.operation,f.facts,after,reply).confirmed,false);});
test('typed reply alone, wrong IDs/rewards or forged plans cannot confirm',async()=>{
 const f=await ready(),{after,reply}=await settle(f);
 for(const r of[null,{}, {...reply,raidId:2},{...reply,stageId:1002},{...reply,reward:{}},{...reply,reward:{asset:[]}},{...reply,reward:{asset:[{type:0,id:'invented',num:1}]}},{...reply,reward:{asset:[{type:1,id:'抽卡券',num:5}]}}])assert.equal(verifyTrialChallenge(f.operation,f.facts,after,r).confirmed,false);
 for(const mutate of[o=>o.rewards[0].num++,o=>o.expectedState.raid.passedStage=1002,o=>o.costs=[{id:'RUBY',num:1}],o=>o.budgetClaims.quotas=[],o=>o.action.body.stageId=1002,o=>o.identity='fake']){const op=clone(f.operation);mutate(op);assert.equal(verifyTrialChallenge(op,f.facts,after,reply).confirmed,false);}
});
for(const apply of[true,false])test('shared executor confirms or keeps UNKNOWN '+apply,async()=>{
 const f=await ready({apply}),r=await executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:trialChallengeModule,allowMutate:true,budget:budget(f)});assert.equal(r.status,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,apply?0:1);
});
function serviceFixture(t,{apply=true,file=null}={}) {
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-trial-challenge-')):null;file??=path.join(dir,'history.json');
 const f=fixture({apply}),durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(clone(row));return durable.put(row);}};
 const session={id:'synthetic-A',client:f.client,player:f.options.player,generation:3,connectionId:'offline-trial',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:{enabled:true}})},getConfig:()=>f.options.config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.request.bind(f.client);f.client.request=async(...args)=>{if(args[4]?.mutate)f.state.saved=clone(journal.at(-1));return send(...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 const plan=async()=>{const read=await service.surveyModule(session,'trial-challenge',{}),row=read.view.candidates[0];assert.ok(row.executable,JSON.stringify(row));return service.plan(session,{module:'trial-challenge',mode:'Manual',parameters:{},selections:[row.actionId]});};
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true});
 const run=async p=>{const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};};
 return {...f,session,service,history,durable,file,plan,authorize,run};
}
for(const apply of[true,false])test('Service persists quota/UID before transport and success/UNKNOWN across restart '+apply,async t=>{
 const f=serviceFixture(t,{apply}),p=await f.plan(),{record,permit}=await f.run(p);
 assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);
 assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.saved.runBudget.reserved.quotas,[{id:'trial-challenge:first-clear:1:1001',num:1}]);assert.deepEqual(f.state.saved.runBudget.reserved.uids,[{type:'trial-challenge',id:'1:1001'}]);
 assert.throws(()=>f.service.execute(f.session,permit));
 const restarted=serviceFixture(t,{file:f.file});assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,apply?'SUCCESS':'UNKNOWN');
 if(!apply){await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.state.writes.length,0);}
});
test('Service persistence failure, cancellation and foreign-account approval send zero',async t=>{
 for(const mode of['disk','cancel','account','config']){const f=serviceFixture(t),p=await f.plan();if(mode==='account'){f.session.id='B';assert.throws(()=>f.authorize(p));continue;}if(mode==='config'){f.options.config.tables.TrialRaidStageCfg.revision=2;assert.throws(()=>f.authorize(p));continue;}const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0);}
});
test('late response after connection replacement cannot confirm or start another send',async()=>{
 const f=await ready();let release;f.state.onWrite=()=>new Promise(r=>release=r);const pending=executeBusinessOperation(f.client,protocol,f.operation,{...f.options,adapter:trialChallengeModule,allowMutate:true,budget:budget(f)});
 for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);f.client.factContext.connectionId='new';release();const result=await pending;assert.equal(result.status,'UNKNOWN');assert.equal(f.state.writes.length,1);
});
test('registered trial challenge Workflow pauses for existing permit and verifies shared durable history',async t=>{
 const f=serviceFixture(t),read=await f.service.surveyModule(f.session,'trial-challenge',{}),row=read.view.candidates[0];
 const graph={version:1,id:'trial-challenge-flow',name:'Synthetic free gold',budget:row.budgetClaims,nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'trial-challenge',parameters:{}},{id:'a',type:'ACTION',module:'trial-challenge',parameters:{},selection:row.actionId},{id:'v',type:'VERIFY',module:'trial-challenge'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
 let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');const record=f.durable.list(f.session.id)[0];assert.equal(record.workflowId,result.runId);assert.equal(record.workflowNodeId,'a');
});



test('slow sibling does not renew raid fact and cancellation sends zero',async t=>{
 let now=100000,release;t.mock.method(Date,'now',()=>now);const f=fixture();f.state.onRead=n=>n==='AllResourceRequest'?new Promise(r=>release=r):undefined;
 const pending=surveyTrialChallenge(f.client,protocol,f.options);await new Promise(setImmediate);now+=40000;release();const facts=await pending;assert.equal(facts.sourceFacts.raid.provenance.sourceAt,100000);assert.equal(viewTrialChallenge(facts,f.options).candidates[0].executable,false);
 const x=fixture(),abort=new AbortController();x.state.onRead=n=>{if(n==='TrialRaidInfoRequest'){queueMicrotask(()=>abort.abort());return new Promise(()=>{});}};
 await assert.rejects(surveyTrialChallenge(x.client,protocol,{...x.options,signal:abort.signal}),{code:'CANCELLED'});assert.equal(x.state.writes.length,0);
});
test('dependencies bind exact trial and item configuration only',()=>{
 const f=fixture(),before=trialChallengeDependencyVersions(f.options),unrelated=clone(f.options.config);unrelated.tables.Unrelated={data:[]};assert.deepEqual(trialChallengeDependencyVersions({...f.options,config:unrelated}),before);
 for(const k of['ModuleOpenCfg','TrialRaidCfg','TrialRaidStageCfg','ItemCfg']){const changed=clone(f.options.config);changed.tables[k].revision=2;assert.notDeepEqual(trialChallengeDependencyVersions({...f.options,config:changed}),before);}
});

test('trial D6 exact free challenge forbids wrong raid, hidden fields or unknown debit metadata',()=>{
 const a={request:'TrialRaidChallengeRequest',body:{raidId:1,stageId:1001},costs:[]};
 assert.doesNotThrow(()=>assertPaymentAllowed(a));
 for(const body of[{raidId:2,stageId:1001},{raidId:1,stageId:0},{raidId:1,stageId:1001,sweep:true},{raidId:1},{stageId:1001}])assert.throws(()=>assertPaymentAllowed({...a,body}));
 assert.throws(()=>assertPaymentAllowed({request:a.request,body:a.body}));
 for(const id of['GOLD','RUBY'])assert.throws(()=>assertPaymentAllowed({...a,costs:[{id,num:1}]}));
});
