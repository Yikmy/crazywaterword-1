import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOperationService} from '../src/operation-service.mjs';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {createModuleSettings} from '../src/gameplay-settings.mjs';
import {GAMEPLAY_MODULES} from '../src/function-registry.mjs';
import {assertPaymentAllowed} from '../src/actions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProtocol} from '../src/proto.mjs';
import {surveyExpeditionFormation,viewExpeditionFormation,planExpeditionFormation,verifyExpeditionFormation,validateExpeditionFormationParameters} from '../src/expedition-formations.mjs';
const protocol=loadProtocol(),clone=v=>structuredClone(v);
const wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
const parameters={mode:'expedition',raidId:1001,presetId:2};
function fixture(){
 const config={tables:{HeroCfg:{data:[{id:'A',career:'坦克'},{id:'B',career:'射手'}]},FormationHeroNumCfg:{data:[{heroNum:2,mainlineStage:0}]},FormationTypePositionCfg:{data:[{id:1,position:[1,1]},{id:1,position:[1,2]},{id:2,position:[2,1]},{id:2,position:[2,2]}]},ExpeditionRaidCfg:{data:[{raidId:1001,unlockLv:30,heroCount:10}]}}};
 const player={playerId:'9007199254740993',worldId:'17',level:40,mainlineStage:101};
 const state={nowMs:1000000,reads:[],writes:[],apply:true,onWrite:null,onRead:null,info:{raidId:1001,stageFormId:0,endTime:2000,passedStage:0,hero:[{heroId:'A',hp:'9007199254740993'},{heroId:'B',hp:'100'}],buff:[],gotFinal:false,isFirst:true,formation:{presetId:1,petUid:'9007199254740995',heroPositions:[{heroId:'A',pos:{x:1,y:1}},{heroId:'B',pos:{x:1,y:2}}]},stageBuff:[],stagePower:'9007199254740997',passedRaid:[]},items:{items:[{itemId:'wood',num:10}]},resources:{list:[{res:3,amount:500}]}};
 const client={connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(n,b){this.uncertainWrites.delete(JSON.stringify([n,b]));},factContext:{accountId:'synthetic-expedition',generation:3,connectionId:'offline-only'},gameClock:{read(c){return{status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:c.accountId,generation:c.generation,earliestMs:state.nowMs,nowMs:state.nowMs,latestMs:state.nowMs};}},async request(name,body,response,_timeout,options){wire(name,body);if(options?.mutate){options.beforeDispatch?.();state.writes.push({name,body:clone(body)});await state.onWrite?.(name,body);if(state.apply)state.info.formation=clone(body.formation);return wire(response,{formation:body.formation});}state.reads.push(name);await state.onRead?.(name);const value=name==='ExpeditionInfoRequest'?state.info:name==='MyFormationPresetRequest'?{ids:[2]}:name==='AllHeroRequest'?{heroes:[{heroId:'A'},{heroId:'B'}]}:name==='AllItemRequest'?state.items:name==='AllResourceRequest'?state.resources:null;assert.notEqual(value,null,'unexpected synthetic read');return wire(response,value);}};
 const options={config,player,parameters,moduleConfig:{enabled:true}};
 const survey=()=>surveyExpeditionFormation(client,protocol,options);
 const view=f=>viewExpeditionFormation(f,options);
 return{state,client,options,survey,view};
}
test('expedition codec and real survey bind the exact existing raid with full state and no writes',async()=>{const f=fixture(),facts=await f.survey(),row=f.view(facts).candidates.find(r=>r.executable);assert.ok(row);assert.deepEqual(f.state.reads.sort(),['AllHeroRequest','AllItemRequest','AllResourceRequest','ExpeditionInfoRequest','MyFormationPresetRequest']);assert.equal(row.action.request,'ExpeditionSaveFormationRequest');assert.equal(row.action.response,'ExpeditionSaveFormationResponse');assert.equal(row.action.body.raidId,1001);assert.equal(row.action.body.formation.petUid,'9007199254740995');assert.deepEqual(row.costs,[]);assert.deepEqual(row.budgetClaims.uids,[{type:'expedition-formation',id:'1001'}]);assert.equal(facts.state.info.hero[0].hp,'9007199254740993');assert.deepEqual(planExpeditionFormation(facts,{...f.options,selections:[row.actionId]}).actions.map(r=>r.actionId),[row.actionId]);assert.deepEqual(planExpeditionFormation(facts,f.options).actions,[]);});
test('expedition save needs exact typed acknowledgement and an independent unchanged full-state reread',async()=>{const f=fixture(),before=await f.survey(),row=f.view(before).candidates.find(r=>r.executable);f.state.info.formation=clone(row.expectedState.info.formation);const after=await f.survey(),response=wire('ExpeditionSaveFormationResponse',{formation:f.state.info.formation});assert.equal(verifyExpeditionFormation(row,before,after,response).confirmed,true);assert.equal(verifyExpeditionFormation(row,before,after,{}).confirmed,false);assert.equal(verifyExpeditionFormation(row,before,before,response).confirmed,false);});
for(const [label,mutate]of [['hero hp',s=>s.info.hero[0].hp='1'],['inventory',s=>s.items.items[0].num--],['buff',s=>s.info.buff=[1]],['progress',s=>s.info.passedStage=1],['pet',s=>s.info.formation.petUid='9007199254740996']])test('expedition verification rejects unrelated '+label+' changes',async()=>{const f=fixture(),before=await f.survey(),row=f.view(before).candidates.find(r=>r.executable);f.state.info.formation=clone(row.expectedState.info.formation);const response=wire('ExpeditionSaveFormationResponse',{formation:f.state.info.formation});mutate(f.state);const after=await f.survey();assert.equal(verifyExpeditionFormation(row,before,after,response).confirmed,false);});
test('expedition refuses dead heroes, a different raid and expired server time',async()=>{for(const change of [f=>f.state.info.hero[0].hp='0',f=>f.state.info.raidId=2001,f=>f.state.nowMs=2000001,f=>delete f.client.gameClock]){const f=fixture();change(f);assert.equal(f.view(await f.survey()).candidates.some(r=>r.executable),false);}});
test('expedition parameters forbid implicit raid, transport injection and pet edits',()=>{for(const value of [{mode:'expedition',presetId:2},{mode:'expedition',raidId:0},{...parameters,request:'ExpeditionChallengeRequest'},{...parameters,petUid:0},{...parameters,heroIds:['A','A']}])assert.throws(()=>validateExpeditionFormationParameters(value),{code:'INVALID_PARAMETERS'});assert.deepEqual(validateExpeditionFormationParameters(parameters),parameters);});

function serviceFixture({historyTransform=v=>v}={}){
 const f=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-expedition-service-')),file=path.join(dir,'history.json'),history=historyTransform(createExecutionHistory({file})),settings=createModuleSettings({file:path.join(dir,'modules.json'),modules:GAMEPLAY_MODULES});
 const service=createOperationService({protocol,history,moduleSettings:settings,getConfig:()=>f.options.config,loadRules:()=>({config:{version:1,enabled:false,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})});
 const session={id:'synthetic-expedition',state:'READY',generation:3,connectionId:'offline-only',player:f.options.player,client:f.client,abort:new AbortController(),loop:{running:false},busy:null};
 settings.save(session.id,'formation',{enabled:true,mainlineEnabled:false});
 const plan=async()=>{const d=await service.surveyModule(session,'formation',parameters),row=d.view.candidates.find(r=>r.executable);assert.ok(row);return service.plan(session,{module:'formation',mode:'Manual',parameters,selections:[row.actionId]});};
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});
 const execute=async(p,permit=authorize(p))=>{service.execute(session,permit);await service.settle(session.id);return history.list(session.id)[0];};
 const cleanup=async()=>{session.abort.abort();await service.settle(session.id);assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});};
 return{...f,dir,file,history,settings,service,session,plan,authorize,execute,cleanup};
}
test('registered expedition uses single authorization, durable intent, UID budget and no mainline proof',async()=>{
 const f=serviceFixture();try{const p=await f.plan();assert.equal(p.actions[0].action,undefined);f.state.onWrite=()=>assert.equal(f.history.list(f.session.id)[0].actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');const r=await f.execute(p);assert.equal(r.finalStatus,'SUCCESS',JSON.stringify(r.actions));assert.equal(r.actions[0].verification.status,'CONFIRMED');assert.equal(f.state.writes.length,1);assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),false);assert.equal(r.runBudget.reserved.uids[0].type,'expedition-formation');await assert.rejects(f.service.assertFormationReady(f.session,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});}finally{await f.cleanup();}
});
test('registered expedition UNKNOWN persists across restart without replay or budget release',async()=>{
 const f=serviceFixture();try{f.state.apply=false;const r=await f.execute(await f.plan());assert.equal(r.finalStatus,'UNKNOWN');assert.equal(r.actions[0].unresolvedWrite,true);assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),true);await assert.rejects(f.plan());assert.equal(f.state.writes.length,1);assert.equal(r.runBudget.reserved.uids.length,1);}finally{await f.cleanup();}
});
test('registered expedition definite refusal survives reconnect and original-history read restart',async()=>{
 const f=serviceFixture();try{f.state.onWrite=()=>{throw Object.assign(Error('synthetic definite expedition refusal'),{code:'REJECTED'});};assert.equal((await f.execute(await f.plan())).finalStatus,'REJECTED');const bytes=fs.readFileSync(f.file,'utf8');f.session.generation=f.client.factContext.generation=4;f.session.connectionId=f.client.factContext.connectionId='replacement';await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(createExecutionHistory({file:f.file}).list(f.session.id)[0].finalStatus,'REJECTED');assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(f.state.writes.length,1);}finally{await f.cleanup();}
});
for(const [label,change]of [['role',f=>f.session.player.playerId='2'],['world',f=>f.session.player.worldId='18'],['connection',f=>f.session.connectionId='new'],['raid config',f=>f.options.config.tables.ExpeditionRaidCfg.revision=2]])test('registered expedition invalidates '+label+' before authorization',async()=>{const f=serviceFixture();try{const p=await f.plan();change(f);assert.throws(()=>f.authorize(p));assert.equal(f.state.writes.length,0);}finally{await f.cleanup();}});
test('registered expedition cancelled late response cannot confirm or dispatch again',async()=>{
 const f=serviceFixture();let release;try{const p=await f.plan();f.state.onWrite=()=>new Promise(resolve=>release=resolve);const pending=f.execute(p);for(let tries=0;tries<100&&!release;tries++)await new Promise(setImmediate);assert.ok(release);f.service.stop(f.session.id);release();const r=await pending;assert.equal(r.finalStatus,'UNKNOWN');assert.equal(r.actions[0].unresolvedWrite,true);assert.equal(f.state.writes.length,1);await assert.rejects(f.plan());}finally{release?.();await f.cleanup();}
});
test('D6 expedition exact free contract refuses missing costs, paid fields and malformed identities',async()=>{
 const f=fixture(),row=f.view(await f.survey()).candidates.find(r=>r.executable),action={...row.action,costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(action));
 for(const change of [a=>delete a.costs,a=>a.costs=[{id:'RUBY',num:1}],a=>a.body.raidId=0,a=>a.body.buy=false,a=>a.body.formation.heroPositions=[],a=>a.body.formation.petUid=-1,a=>a.body.formation.heroPositions[0].heroId='',a=>a.body.formation.heroPositions.push(clone(a.body.formation.heroPositions[0]))]){const v=clone(action);change(v);assert.throws(()=>assertPaymentAllowed(v));}
});

test('expedition fact age accepts exactly 30 seconds and blocks expired or future source facts',async()=>{
 const realNow=Date.now;try{let now=1800000000000;Date.now=()=>now;const f=fixture(),facts=await f.survey();now+=30000;assert.equal(f.view(facts).candidates.some(r=>r.executable),true);now++;assert.equal(f.view(facts).candidates.some(r=>r.executable),false);now-=30002;assert.equal(f.view(facts).candidates.some(r=>r.executable),false);}finally{Date.now=realNow;}
});
test('expedition clock uncertainty must fit entirely in the active period',async()=>{
 for(const [latest,eligible]of [[2000000,true],[2000001,false]]){const f=fixture();f.client.gameClock.read=c=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:c.accountId,generation:c.generation,earliestMs:1000000,nowMs:1000000,latestMs:latest});assert.equal(f.view(await f.survey()).candidates.some(r=>r.executable),eligible);}
 for(const change of [v=>v.status='UNKNOWN',v=>v.reliable=false,v=>v.source='persisted offset',v=>v.accountId='other',v=>v.generation++,v=>v.earliestMs=1000001]){const f=fixture(),read=f.client.gameClock.read;f.client.gameClock.read=c=>{const v=read(c);change(v);return v;};assert.equal(f.view(await f.survey()).candidates.some(r=>r.executable),false);}
});
test('expedition survey cancels when role changes during authoritative reads',async()=>{
 const f=fixture();f.state.onRead=()=>{f.options.player.playerId='2';};await assert.rejects(f.survey(),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);
});
test('expedition UNKNOWN remains blocked in a new Service and never uses mainline recovery reads',async()=>{
 const f=serviceFixture();try{f.state.apply=false;const run=await f.execute(await f.plan()),bytes=fs.readFileSync(f.file,'utf8');const restarted=createOperationService({protocol,history:createExecutionHistory({file:f.file}),moduleSettings:f.settings,getConfig:()=>f.options.config,loadRules:()=>({config:{version:1,enabled:false,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})});await assert.rejects(restarted.plan(f.session,{module:'formation',mode:'Manual',parameters,selections:[run.actions[0].actionId]}));const {collectOperationRecovery}=await import('../src/operation-recovery.mjs');const count=f.state.reads.length,result=await collectOperationRecovery(f.client,protocol,run,run.actions[0],{context:run.executionContext});assert.equal(result.status,'STILL_UNKNOWN');assert.equal(result.evidence.reasonCode,'UNSUPPORTED_OPERATION');assert.equal(f.state.reads.length,count);assert.equal(f.state.writes.length,1);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);}finally{await f.cleanup();}
});
test('expedition history failure before dispatch sends no game write',async()=>{
 let fail=false;const f=serviceFixture({historyTransform:h=>({...h,put(record){if(fail)throw Error('synthetic disk failure');return h.put(record);}})});try{const p=await f.plan(),permit=f.authorize(p);fail=true;assert.throws(()=>f.service.execute(f.session,permit),/synthetic disk failure/);await f.service.settle(f.session.id);assert.equal(f.state.writes.length,0);assert.equal(f.session.busy,null);}finally{fail=false;await f.cleanup();}
});
test('D6 expedition refuses sparse arrays concealed by extra properties and accessor slots',async()=>{
 const f=fixture(),row=f.view(await f.survey()).candidates.find(r=>r.executable);for(const accessor of [false,true]){const action={...clone(row.action),costs:[]},positions=action.body.formation.heroPositions;if(accessor){const value=positions[0];Object.defineProperty(positions,'0',{get:()=>value,enumerable:true,configurable:true});}else{delete positions[0];positions.extra='concealed hole';}assert.throws(()=>assertPaymentAllowed(action));}
});

test('expedition preserves absent pet zero and exact safe integer pet UIDs through D6',async()=>{
 for(const petUid of [0,42]){const f=fixture();f.state.info.formation.petUid=petUid;const before=await f.survey(),row=f.view(before).candidates.find(r=>r.executable);assert.ok(row);assert.equal(row.action.body.formation.petUid,petUid);assert.doesNotThrow(()=>assertPaymentAllowed({...row.action,costs:[]}));f.state.info.formation=clone(row.expectedState.info.formation);assert.equal(verifyExpeditionFormation(row,before,await f.survey(),wire('ExpeditionSaveFormationResponse',{formation:f.state.info.formation})).confirmed,true);}
});

test('registered formation contract validates expedition identity and pins raid configuration only for that mode',async()=>{
 const {validateFunctionParameters}=await import('../src/function-contracts.mjs'),adapter=GAMEPLAY_MODULES.formation;assert.deepEqual(validateFunctionParameters('formation',adapter,parameters),parameters);
 for(const value of [{...parameters,mode:'mainline'},{...parameters,raidId:0},{...parameters,raidId:undefined},{mode:'expedition',raidId:1001,allowPaid:true},{raidId:1001}])assert.throws(()=>validateFunctionParameters('formation',adapter,value),{code:'INVALID_PARAMETERS'});
 const f=fixture(),main=adapter.dependencyVersions({...f.options,parameters:{presetId:2}}),expedition=adapter.dependencyVersions(f.options);assert.equal(Object.hasOwn(main,'config.ExpeditionRaidCfg'),false);assert.deepEqual(expedition['config.ExpeditionRaidCfg'],f.options.config.tables.ExpeditionRaidCfg);f.options.config.tables.ExpeditionRaidCfg.revision=1;assert.notDeepEqual(adapter.dependencyVersions(f.options),expedition);assert.deepEqual(adapter.dependencyVersions({...f.options,parameters:{presetId:2}}),main);
});
