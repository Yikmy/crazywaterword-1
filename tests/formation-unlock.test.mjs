import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FORMATION_UNLOCK_DEFAULT_CONFIG, formationUnlockModule, validateFormationUnlockConfig, validateFormationUnlockParameters, surveyFormationUnlock, viewFormationUnlock, planFormationUnlock, verifyFormationUnlock, formationUnlockDependencyVersions } from '../src/formation-unlock.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { ResourceLedger, createRunBudgetContext } from '../src/resource-ledger.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

// Actual local codecs/config, synthetic state/transport only. No GameClient or Runtime.
const protocol=loadProtocol(path.resolve(import.meta.dirname,'../work/extracted/_src_chunks_/src/chunks/game.js'));
const actualConfig=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish()),clone=v=>structuredClone(v);
const enabled={enabled:true},parameters={presetId:2};
const player=()=>({playerId:'9007199254740993',worldId:'17',mainlineStage:101});
const formation=()=>({presetId:1,petUid:'9007199254740995',heroPositions:[{heroId:'A',pos:{x:1,y:3}},{heroId:'B',pos:{x:4,y:4}}]});
function cfg(){return{tables:{FormationTypeUnlockCfg:clone(actualConfig.tables.FormationTypeUnlockCfg),FormationTypePositionCfg:clone(actualConfig.tables.FormationTypePositionCfg),ItemCfg:{data:clone(actualConfig.tables.ItemCfg.data.filter(r=>r.type==='阵型图纸'))},HeroCfg:{data:[{id:'A',career:'坦克'},{id:'B',career:'射手'}]},FormationHeroNumCfg:{data:[{heroNum:5,mainlineStage:0}]}}};}
function fake({codec=true,stock={阵型2图纸:2,阵型3图纸:1,技能书:10},ids=[],context={},overrides={},apply=true}={}){
 const state={formation:formation(),ids:clone(ids),stock:new Map(Object.entries(stock)),resources:[{res:3,amount:500}],reads:[],writes:[],onRead:null,onWrite:null,apply,overrides};
 const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-only',...context},pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},
 async request(n,b,r,_timeout,o){if(codec)wire(n,b);assert.equal(o?.mutate,undefined);state.reads.push({name:n,body:clone(b)});await state.onRead?.(n);
 let value=n==='GetFormationRequest'?{formation:state.formation}:n==='MyFormationPresetRequest'?{ids:state.ids}:n==='AllHeroRequest'?{heroes:[{heroId:'A'},{heroId:'B'}]}:n==='AllItemRequest'?{items:[...state.stock].map(([itemId,num])=>({itemId,num}))}:n==='AllResourceRequest'?{list:state.resources}:null;
 if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;if(value===null)throw Error('unexpected synthetic read');return codec?wire(r,value):value;},
 async sendWatch(n,b){wire(n,b);state.writes.push({name:n,body:clone(b)});if(state.apply){state.ids.push(b.id);const item='阵型'+b.id+'图纸';state.stock.set(item,state.stock.get(item)-1);}await state.onWrite?.(n,b);return{status:'UNKNOWN'};}};return{client,state};
}
const opts=(config,extra={})=>({config,player:player(),parameters,moduleConfig:enabled,...extra});
async function ready(input={},extra={}){const config=cfg(),f=fake(input),options=opts(config,extra),facts=await surveyFormationUnlock(f.client,protocol,options);return{...f,config,options,facts,operation:planFormationUnlock(facts,options).actions[0]};}
async function after(f,mutate){f.state.ids.push(2);f.state.stock.set('阵型2图纸',f.state.stock.get('阵型2图纸')-1);mutate?.(f.state);return surveyFormationUnlock(f.client,protocol,f.options);}

test('default off, semantics-only module and strict single target/config without caller getters',()=>{
 assert.deepEqual(FORMATION_UNLOCK_DEFAULT_CONFIG,{enabled:false});assert.equal(formationUnlockModule.execute,undefined);assert.deepEqual(formationUnlockModule.capabilities,['FRM-005']);assert.equal(formationUnlockModule.label,'普通阵型图纸解锁');
 assert.deepEqual(validateFormationUnlockParameters({}),{});assert.deepEqual(validateFormationUnlockParameters({presetId:24}),{presetId:24});
 for(const v of[null,[],{presetId:1},{presetId:25},{presetId:'2'},{presetId:2.5},{presetId:NaN},{presetId:2,request:'Buy'},{presetIds:[2,3]},{presetId:2,costs:[]},Object.create({presetId:2})])assert.throws(()=>validateFormationUnlockParameters(v),{code:'INVALID_PARAMETERS'});
 const getter={};Object.defineProperty(getter,'presetId',{enumerable:true,get(){throw Error('must not execute');}});assert.throws(()=>validateFormationUnlockParameters(getter),{code:'INVALID_PARAMETERS'});
 for(const v of[{enabled:1},{enabled:true,automaticApply:true},Object.create({enabled:true})])assert.throws(()=>validateFormationUnlockConfig(v),{code:'INVALID_PARAMETERS'});
});
test('actual codec has only required id, no invented unlock response and all23 actual costs are usable',async()=>{
 assert.deepEqual(Object.keys(protocol.UnlockFormationPresetRequest.prototype),['id']);assert.deepEqual([...protocol.UnlockFormationPresetRequest.encode({id:24}).finish()],[8,24]);assert.equal(protocol.UnlockFormationPresetResponse,undefined);assert.throws(()=>protocol.UnlockFormationPresetRequest.decode(new Uint8Array()),/id/);
 const stock=Object.fromEntries(Array.from({length:23},(_,i)=>['阵型'+(i+2)+'图纸',1])),f=await ready({stock}),facts=await surveyFormationUnlock(f.client,protocol,{...f.options,config:actualConfig});assert.equal(facts.catalog.reliable,true);assert.equal(facts.catalog.templates.length,23);
 for(let presetId=2;presetId<=24;presetId++){const op=planFormationUnlock(facts,{...f.options,config:actualConfig,parameters:{presetId}}).actions[0];assert.ok(op);assert.deepEqual(op.costs,[{id:'阵型'+presetId+'图纸',num:1}]);assert.deepEqual(op.action,{request:'UnlockFormationPresetRequest',response:null,body:{id:presetId}});assert.equal(op.expectedState.formation.petUid,'9007199254740995');}assert.equal(f.state.writes.length,0);
});
test('reuses Formation reads and item/resource queries, preserving source/context and exact int64 IDs',async()=>{
 const f=await ready();assert.ok(f.operation);assert.deepEqual(f.state.reads.map(r=>r.name).sort(),['AllHeroRequest','AllItemRequest','AllResourceRequest','GetFormationRequest','MyFormationPresetRequest']);assert.deepEqual(f.state.reads.find(r=>r.name==='GetFormationRequest').body,{module:1});assert.deepEqual(f.facts.unlockedPresetIds,[1]);assert.equal(f.facts.identityContext.playerId,'9007199254740993');assert.equal(f.facts.identityContext.worldId,'17');
 for(const[key,name]of[['formation','GetFormationResponse'],['presets','MyFormationPresetResponse'],['items','AllItemResponse'],['resources','AllResourceResponse']]){const fact=f.facts.sourceFacts[key];assert.equal(fact.provenance.source,name);assert.equal(fact.provenance.reliability,'RELIABLE');assert.ok(Number.isSafeInteger(fact.provenance.sourceAt));assert.deepEqual(fact.value,f.facts.inputs[key]);}
});
test('slow sibling cannot renew earlier source completion timestamp',async t=>{
 let now=100000,release;t.mock.method(Date,'now',()=>now);const config=cfg(),f=fake();f.state.onRead=n=>n==='AllResourceRequest'?new Promise(resolve=>release=resolve):undefined;const pending=surveyFormationUnlock(f.client,protocol,opts(config));await new Promise(setImmediate);now+=40000;release();const facts=await pending;assert.equal(facts.sourceFacts.formation.provenance.sourceAt,100000);assert.equal(facts.sourceFacts.items.provenance.sourceAt,100000);assert.equal(facts.sourceFacts.resources.provenance.sourceAt,140000);assert.equal(planFormationUnlock(facts,opts(config)).actions.length,0);
});
test('default off, explicit selections and shared finite Ledger cannot be bypassed',async()=>{
 const f=await ready();assert.equal(planFormationUnlock(f.facts,{...f.options,moduleConfig:undefined}).actions.length,0);assert.equal(planFormationUnlock(f.facts,{...f.options,parameters:{}}).actions.length,0);for(const selections of[[],['forged']])assert.equal(planFormationUnlock(f.facts,{...f.options,selections}).actions.length,0);for(const selections of[['x','x'],Array(1),'bad',[2]])assert.throws(()=>planFormationUnlock(f.facts,{...f.options,selections}),{code:'INVALID_PARAMETERS'});
 const ledger=new ResourceLedger(new Map([['阵型2图纸',1]]));assert.equal(planFormationUnlock(f.facts,{...f.options,selections:[f.operation.actionId],ledger}).actions.length,1);assert.equal(planFormationUnlock(f.facts,{...f.options,ledger}).actions.length,0);assert.equal(ledger.reserved.get('阵型2图纸'),1);assert.equal(f.state.writes.length,0);
});
test('absent blueprint, other blueprint or existing unlock has no acquisition fallback',async()=>{
 for(const stock of[{}, {阵型2图纸:0,阵型3图纸:99},{万能碎片:500}]){const f=await ready({stock});assert.equal(f.operation,undefined);assert.equal(viewFormationUnlock(f.facts,f.options).candidates[0].blockedReason,'OWNED_BLUEPRINT_REQUIRED');assert.equal(f.state.writes.length,0);}const f=await ready({ids:[2]});assert.equal(viewFormationUnlock(f.facts,f.options).candidates[0].blockedReason,'PRESET_ALREADY_UNLOCKED');
});
test('malformed/inherited/duplicate/missing complete states safely block view and plan',async()=>{
 const noPet=formation();delete noPet.petUid;const cases=[['GetFormationRequest',{}],['GetFormationRequest',{formation:noPet}],['GetFormationRequest',{formation:{...formation(),heroPositions:[]}}],['GetFormationRequest',{formation:{...formation(),petUid:Number.MAX_SAFE_INTEGER+1}}],['GetFormationRequest',{formation:Object.create(formation())}],['MyFormationPresetRequest',{}],['MyFormationPresetRequest',{ids:[2,2]}],['MyFormationPresetRequest',{ids:Array(1)}],['MyFormationPresetRequest',{ids:[0]}],['MyFormationPresetRequest',Object.create({ids:[]})],['AllItemRequest',{}],['AllItemRequest',{items:[{itemId:'阵型2图纸',num:2},{itemId:'阵型2图纸',num:2}]}],['AllItemRequest',{items:[{itemId:'阵型2图纸',num:Number.MAX_SAFE_INTEGER+1}]}],['AllItemRequest',{items:[{itemId:'阵型2图纸',id:'other',num:2}]}],['AllItemRequest',{items:[Object.assign(Object.create({num:2}),{itemId:'阵型2图纸'})]}],['AllResourceRequest',{}],['AllResourceRequest',{list:[{res:3,amount:1},{res:3,amount:2}]}],['AllResourceRequest',{list:[{res:3,amount:-1}]}]];
 for(const[name,value]of cases){const f=await ready({codec:false,overrides:{[name]:value}});assert.equal(f.operation,undefined,name);assert.equal(viewFormationUnlock(f.facts,f.options).reliability.authority,false,name);assert.equal(f.state.writes.length,0);}
});
test('protocol/read failures remain sanitized unknown facts',async()=>{
 for(const n of['GetFormationRequest','MyFormationPresetRequest','AllItemRequest','AllResourceRequest']){const f=await ready({overrides:{[n]:new Error('token=must-not-retain')}});assert.equal(f.operation,undefined);assert.doesNotMatch(JSON.stringify(f.facts.notes),/must-not-retain/);}const f=await ready(),missing={...protocol};delete missing.AllItemResponse;const facts=await surveyFormationUnlock(f.client,missing,f.options);assert.equal(planFormationUnlock(facts,f.options).actions.length,0);
});
test('new cost/acquisition fields, wrong item type and malformed layout stop at config authority',async()=>{
 for(const mutate of[c=>c.tables.FormationTypeUnlockCfg.data[0].unlockCost[1]=2,c=>c.tables.FormationTypeUnlockCfg.data[0].unlockCost[0]='阵型3图纸',c=>c.tables.FormationTypeUnlockCfg.data[0].purchaseRuby=0,c=>c.tables.FormationTypeUnlockCfg.data.push(clone(c.tables.FormationTypeUnlockCfg.data[0])),c=>c.tables.ItemCfg.data.find(r=>r.id==='阵型2图纸').type='付费图纸',c=>c.tables.FormationTypePositionCfg.data.push(clone(c.tables.FormationTypePositionCfg.data.find(r=>r.id===2))),c=>delete c.tables.FormationTypeUnlockCfg]){const config=cfg();mutate(config);const f=fake(),facts=await surveyFormationUnlock(f.client,protocol,opts(config));assert.equal(facts.catalog.reliable,false);assert.equal(planFormationUnlock(facts,opts(config)).actions.length,0);}
});
test('facts require freshness, account/generation/scope, original inputs and exact stock',async()=>{
 const f=await ready();for(const mutate of[a=>a.sourceFacts.items.provenance.sourceAt=Date.now()-30001,a=>a.sourceFacts.items.provenance.sourceAt=Date.now()+10000,a=>a.sourceFacts.items.provenance.accountId='B',a=>a.sourceFacts.items.provenance.generation++,a=>a.sourceFacts.items.provenance.scope={kind:'CURRENT_RESPONSE_ONLY',key:'items'},a=>a.sourceFacts.items.provenance.source='Fake',a=>a.sourceFacts.items.provenance.reliability='UNKNOWN',a=>a.sourceFacts.items.value.items[0].num++,a=>a.inputs.items.items[0].num++,a=>a.formation.petUid=0,a=>a.unlockedPresetIds.push(3),a=>a.state.inventory[0].num++,a=>a.stock.set('阵型2图纸',99),a=>a.stock.set('forged-zero',0),a=>a.stock.set('bad',-1),a=>a.stock.set('bad',null)]){const altered=clone(f.facts);mutate(altered);assert.equal(planFormationUnlock(altered,f.options).actions.length,0);assert.equal(viewFormationUnlock(altered,f.options).candidates[0].executable,false);}
});
test('exact role/world IDs are required and context changes cancel sampling',async()=>{
 for(const p of[{}, {playerId:1},{playerId:0,worldId:1},{playerId:Number.MAX_SAFE_INTEGER+1,worldId:1},{playerId:'2',worldId:0},Object.create(player())])assert.equal((await ready({},{player:p})).operation,undefined);assert.equal((await ready({context:{playerId:'different'}})).operation,undefined);
 for(const mutate of[(c)=>c.factContext.generation++,(c)=>c.factContext.accountId='B',(c)=>c.factContext.connectionId='new',(_c,p)=>p.playerId='2',(_c,p)=>p.worldId='2']){const config=cfg(),f=fake(),options=opts(config);f.state.onRead=n=>{if(n==='AllItemRequest')mutate(f.client,options.player);};await assert.rejects(surveyFormationUnlock(f.client,protocol,options),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);}
});
test('abort, stop or disconnect releases pending reads and dispatches zero writes',async()=>{
 for(const mode of['signal','stop','disconnect']){const f=fake(),controller=new AbortController(),stop={aborted:false};f.state.onRead=n=>{if(n!=='GetFormationRequest')return;queueMicrotask(()=>{if(mode==='signal')controller.abort();if(mode==='stop')stop.aborted=true;if(mode==='disconnect')f.client.connected=false;});return new Promise(()=>{});};await assert.rejects(surveyFormationUnlock(f.client,protocol,{...opts(cfg()),signal:controller.signal,stop}),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);}
});
test('verification needs exact full-set addition/debit/unchanged formation, never a success ack shortcut',async()=>{
 const f=await ready(),a=await after(f),result=verifyFormationUnlock(f.operation,f.facts,a,null);assert.equal(result.confirmed,true);assert.equal(result.responseEvidence.typedResponse,'NOT_DEFINED');for(const r of[{}, {success:true},{id:2},{code:0}])assert.equal(verifyFormationUnlock(f.operation,f.facts,a,r).confirmed,false);assert.equal(verifyFormationUnlock(f.operation,f.facts,f.facts,null).confirmed,false);
 const last=await ready({stock:{阵型2图纸:1,技能书:10}}),gone=await after(last,s=>s.stock.delete('阵型2图纸'));assert.equal(verifyFormationUnlock(last.operation,last.facts,gone,undefined).confirmed,true);
});
for(const[label,mutate]of[['missing id',s=>s.ids=[]],['wrong id',s=>s.ids=[3]],['extra id',s=>s.ids.push(3)],['missing debit',s=>s.stock.set('阵型2图纸',2)],['double debit',s=>s.stock.set('阵型2图纸',0)],['other item debit',s=>s.stock.set('技能书',9)],['resource change',s=>s.resources[0].amount++],['Formation switch',s=>s.formation.presetId=2],['hero move',s=>s.formation.heroPositions[0].pos.x++],['pet change',s=>s.formation.petUid='9007199254740996']])test('unconfirmed verification: '+label,async()=>{const f=await ready(),a=await after(f,mutate);assert.equal(verifyFormationUnlock(f.operation,f.facts,a,null).confirmed,false);});
test('forged action, backwards source, role or config mismatches cannot confirm',async()=>{
 const f=await ready(),a=await after(f);for(const mutate of[o=>o.action.body.id=3,o=>o.action.body.buy=false,o=>o.action.response='MadeUp',o=>o.parameters.presetId=3,o=>o.target.presetId=3,o=>o.costs[0].num=0,o=>o.costSource='free',o=>o.identity='forged',o=>o.beforeState.formation.petUid=0,o=>o.expectedState.inventory=[]]){const op=clone(f.operation);mutate(op);assert.equal(verifyFormationUnlock(op,f.facts,a,null).confirmed,false);}const old=clone(a);old.sourceFacts.items.provenance.sourceAt=f.facts.sourceFacts.items.provenance.sourceAt-1;assert.equal(verifyFormationUnlock(f.operation,f.facts,old,null).confirmed,false);for(const mutate of[x=>{x.identityContext.worldId='18';x.state.context.worldId='18';},x=>x.catalog.templates[0].name+='changed']){const changed=clone(a);mutate(changed);assert.equal(verifyFormationUnlock(f.operation,f.facts,changed,null).confirmed,false);}
});
test('dependency fingerprints include full relevant table revisions and enabled policy only',()=>{
 const config=cfg(),before=formationUnlockDependencyVersions({config,player:player(),moduleConfig:enabled});for(const name of['FormationTypeUnlockCfg','ItemCfg','FormationTypePositionCfg']){const changed=clone(config);changed.tables[name].revision=2;assert.notDeepEqual(formationUnlockDependencyVersions({config:changed,player:player(),moduleConfig:enabled}),before);}const changed=clone(config);changed.tables.FarmCfg={revision:99,data:[]};assert.deepEqual(formationUnlockDependencyVersions({config:changed,player:player(),moduleConfig:enabled}),before);assert.notDeepEqual(formationUnlockDependencyVersions({config,player:player(),moduleConfig:{enabled:false}}),before);
});

test('D6 admits only exact owned-one-blueprint branch and blocks acquisition/payment',async()=>{
 const f=await ready();assert.doesNotThrow(()=>assertPaymentAllowed({...f.operation.action,costs:f.operation.costs}));for(const action of[{...f.operation.action,costs:[]},{...f.operation.action,costs:[{id:'阵型3图纸',num:1}]},{...f.operation.action,costs:[{id:'阵型2图纸',num:2}]},{...f.operation.action,body:{id:1},costs:f.operation.costs},{...f.operation.action,body:{id:2,buy:false},costs:f.operation.costs},{...f.operation.action,costs:[{id:'RUBY',num:1}]},{...f.operation.action,costs:f.operation.costs,paid:true}])assert.throws(()=>assertPaymentAllowed(action,{allowPaid:true}));
});
test('sole generic executor confirms one watched write through authority without a fabricated ack',async()=>{
 const f=await ready(),budget={ledger:null},r=await executeBusinessOperation(f.client,protocol,f.operation,{adapter:formationUnlockModule,...f.options,allowMutate:true,budget});assert.equal(r.status,'SUCCESS');assert.equal(r.requestStatus,'UNKNOWN');assert.equal(r.verification.status,'CONFIRMED');assert.equal(r.dispatched,true);assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0].body,{id:2});assert.equal(f.client.uncertainWrites.size,0);assert.equal(budget.ledger.reserved.get('阵型2图纸'),1);
});
test('unconfirmed watched write retains UNKNOWN, uncertainty marker and resource reservation',async()=>{
 const f=await ready({apply:false}),budget={ledger:null},r=await executeBusinessOperation(f.client,protocol,f.operation,{adapter:formationUnlockModule,...f.options,allowMutate:true,budget});assert.equal(r.status,'UNKNOWN');assert.equal(r.unresolvedWrite,true);assert.equal(r.ok,null);assert.equal(f.client.uncertainWrites.size,1);assert.equal(budget.ledger.reserved.get('阵型2图纸'),1);assert.equal(f.state.writes.length,1);
});
test('generic preflight rejects role/stock/policy drift or absent mutation permit before dispatch',async()=>{
 for(const kind of['role','stock','disabled','no-permit']){const f=await ready();if(kind==='role')f.options.player.worldId='18';if(kind==='stock')f.state.stock.set('阵型2图纸',1);if(kind==='disabled')f.options.moduleConfig={enabled:false};const r=await executeBusinessOperation(f.client,protocol,f.operation,{adapter:formationUnlockModule,...f.options,allowMutate:kind!=='no-permit'});assert.equal(r.dispatched,false);assert.equal(r.status,'NOT_EXECUTED');assert.equal(f.state.writes.length,0);}
});
test('fresh plans cannot refill a consumed finite parent-run blueprint budget',async()=>{
 const f=await ready(),scope={accountId:'synthetic-A',runId:'synthetic-run',generation:3,connectionId:'offline-only'},limits={resources:[{id:'阵型2图纸',num:1}],quotas:[],uids:[]},runBudget=createRunBudgetContext({scope,limits});const r=await executeBusinessOperation(f.client,protocol,f.operation,{adapter:formationUnlockModule,...f.options,allowMutate:true,budget:{runBudget,batchId:'first',scope,limits,ledger:null}});assert.equal(r.status,'SUCCESS');f.state.ids=[];const facts=await surveyFormationUnlock(f.client,protocol,f.options),operation=planFormationUnlock(facts,f.options).actions[0];const again=await executeBusinessOperation(f.client,protocol,operation,{adapter:formationUnlockModule,...f.options,allowMutate:true,budget:{runBudget,batchId:'second',scope,limits,ledger:null}});assert.equal(again.dispatched,false);assert.equal(again.status,'NOT_EXECUTED');assert.equal(f.state.writes.length,1);
});

function serviceFixture({apply=true,enabled=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-formation-unlock-')),file=path.join(dir,'history.json'),journal=[],config=cfg(),durable=createExecutionHistory({file}),sessions=[];
 const moduleSettings=createModuleSettings({file:path.join(dir,'modules.json'),modules:GAMEPLAY_MODULES}),history={...durable,put(record){journal.push(clone(record));return durable.put(record);}};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,moduleSettings,history,getConfig:()=>clone(config),loadRules:()=>({config:{version:1,enabled:true,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})});
 function session(accountId='synthetic-A'){const f=fake({context:{accountId},apply}),target={id:accountId,client:f.client,state:'READY',player:player(),generation:3,connectionId:'offline-only-'+accountId,abort:new AbortController(),loop:{running:false},busy:null,synthetic:f.state};if(enabled)moduleSettings.save(accountId,'formation-unlock',{enabled:true});const send=f.client.sendWatch.bind(f.client);f.client.sendWatch=async(n,b)=>{f.state.durableBeforeWrite=clone(journal.at(-1));return send(n,b);};sessions.push(target);return target;}
 async function displayed(target){const surveyed=await service.surveyModule(target,'formation-unlock',parameters),candidate=surveyed.view.candidates.find(r=>r.executable);assert.ok(candidate,'expected real registered formation-unlock candidate');return service.plan(target,{module:'formation-unlock',mode:'Manual',parameters,selections:[candidate.actionId]});}
 const authorize=(target,p)=>service.authorize(target,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function execute(target,p){const permit=authorize(target,p);service.execute(target,permit);await service.settle(target.id);return{permit,status:service.status(target.id),record:durable.list(target.id)[0]};}
 async function cleanup(){for(const t of sessions)t.abort.abort();await Promise.all(sessions.map(t=>service.settle(t.id)));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
 return{file,config,service,durable,journal,session,displayed,authorize,execute,cleanup};
}
test('registered Service single authorization, watched unlock and durable confirmed restart history',async()=>{
 const f=serviceFixture(),t=f.session();try{const p=await f.displayed(t);assert.equal(p.actions.length,1);assert.equal(p.actions[0].action,undefined);assert.deepEqual(p.resourceBudget,[{id:'阵型2图纸',num:1}]);const r=await f.execute(t,p),row=r.record.actions[0];assert.equal(r.status.finalStatus,'SUCCESS');assert.equal(row.result,'SUCCESS');assert.equal(row.dispatched,true);assert.equal(row.verification.status,'CONFIRMED');assert.equal(t.synthetic.writes.length,1);assert.equal(t.synthetic.durableBeforeWrite.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.equal(r.record.runBudget.outcome,'SUCCESS');assert.equal(r.record.runBudget.resumable,false);const restarted=createExecutionHistory({file:f.file});assert.equal(restarted.list(t.id)[0].actions[0].verification.status,'CONFIRMED');assert.equal(restarted.unresolved(t.id),false);assert.throws(()=>f.service.execute(t,r.permit));}finally{await f.cleanup();}
});
test('registered Service UNKNOWN survives restart and prevents automatic retry',async()=>{
 const f=serviceFixture({apply:false}),t=f.session();try{const r=await f.execute(t,await f.displayed(t));assert.equal(r.status.finalStatus,'UNKNOWN');assert.equal(r.record.actions[0].result,'UNKNOWN');assert.equal(r.record.actions[0].unresolvedWrite,true);assert.equal(t.synthetic.writes.length,1);assert.equal(createExecutionHistory({file:f.file}).unresolved(t.id),true);await assert.rejects(f.displayed(t));assert.equal(t.synthetic.writes.length,1);}finally{await f.cleanup();}
});
test('registered Service stays default disabled and rejects raw request injection',async()=>{
 const f=serviceFixture({enabled:false}),t=f.session();try{const s=await f.service.surveyModule(t,'formation-unlock',parameters);assert.equal(s.config.enabled,false);assert.equal(s.view.candidates.some(r=>r.executable),false);await assert.rejects(f.service.plan(t,{module:'formation-unlock',mode:'Manual',parameters:{...parameters,request:'UnlockFormationPresetRequest'},selections:['forged']}));assert.equal(t.synthetic.writes.length,0);assert.equal(f.durable.list(t.id).length,0);}finally{await f.cleanup();}
});
for(const[label,mutate]of[['player',t=>t.player.playerId='2'],['world',t=>t.player.worldId='2'],['generation',t=>t.generation++],['connection',t=>t.connectionId+='-new']])test('registered Service refuses '+label+' switch before authorization with zero dispatch',async()=>{
 const f=serviceFixture(),t=f.session();try{const p=await f.displayed(t);mutate(t);assert.throws(()=>f.authorize(t,p));assert.equal(t.synthetic.writes.length,0);}finally{await f.cleanup();}
});
test('registered Service isolates accounts and invalidates changed relevant table revision',async()=>{
 const f=serviceFixture(),a=f.session(),b=f.session('synthetic-B');try{let p=await f.displayed(a);f.config.tables.FormationTypeUnlockCfg.revision=2;assert.throws(()=>f.authorize(a,p),{code:'STALE_PLAN'});p=await f.displayed(a);const permit=f.authorize(a,p);assert.throws(()=>f.service.execute(b,permit));assert.equal(b.synthetic.writes.length,0);assert.equal(f.durable.list(b.id).length,0);f.service.execute(a,permit);await f.service.settle(a.id);assert.equal(f.durable.list(a.id)[0].finalStatus,'SUCCESS');}finally{await f.cleanup();}
});
