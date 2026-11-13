import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractTables } from '../src/config.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { loadProtocol } from '../src/proto.mjs';

const protocol=loadProtocol(), wire=(name,data)=>protocol[name].decode(protocol[name].encode(data).finish());
const moduleId='antique-growth',account='offline-antique-advanced',antiqueId='藏品蓝1',fragment=antiqueId+'碎片',suitId=1001;
const fixedTables=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));
const config={tables:Object.fromEntries(['ModuleOpenCfg','AntiqueBaseCfg','AntiqueSuitCfg','AntiqueStarCfg','AntiqueSuitLvCfg','AntiqueMasterLvCfg','ItemCfg'].map(name=>[name,fixedTables[name]]))};
const readsExpected=['AllAntiqueRequest','AllItemRequest','AllResourceRequest'];
const specs=[
 {id:'suit-free',action:'suit',costs:[],masterLv:0,suitLevel:0},
 {id:'suit-paid',action:'suit',costs:[{id:'GOLD',num:50},{id:'蓝藏品经验',num:370}],masterLv:1,suitLevel:1},
 {id:'master-free',action:'master',costs:[],masterLv:0,suitLevel:1},
 {id:'master-paid',action:'master',costs:[{id:'藏品大师经验',num:5}],masterLv:1,suitLevel:1},
 {id:'exchange',action:'exchange',costs:[{id:'蓝藏万能碎片',num:7}],masterLv:1,suitLevel:1},
];
const resources=rows=>Object.fromEntries(rows.map(({id,num})=>[id,num]));
function fixture(t,spec,effect='apply'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-antique-advanced-')),file=path.join(dir,'history.json');
 const newHistory=()=>createExecutionHistory({file}),history=newHistory(),services=[],sessions=[];
 const settings=createModuleSettings({file:path.join(dir,'settings.json'),modules:GAMEPLAY_MODULES});
 settings.save(account,moduleId,{enabled:true});
 const parameters=spec.action==='suit'?{action:'suit',suitId}:spec.action==='master'?{action:'master'}:{action:'exchange',antiqueId,num:7};
 const request={suit:'AntiqueSuitLevelUpRequest',master:'AntiqueMasterLevelUpRequest',exchange:'AntiqueFragExchangeRequest'}[spec.action];
 const body=spec.action==='suit'?{id:suitId}:spec.action==='master'?{}:{antiqueId,fragItemId:fragment,num:7};
 const claims=[spec.action==='suit'?{type:'antique-suit',id:String(suitId)}:spec.action==='master'?{type:'antique-master',id:'GLOBAL'}:{type:'antique',id:antiqueId}];
 t.after(async()=>{
  for(const session of sessions)session.abort.abort();
  await Promise.all(services.map(service=>service.settle(account)));
  assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 function newService(store=newHistory()){
  const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history:store,moduleSettings:settings,getConfig:()=>structuredClone(config),loadRules:()=>({config:{version:1,enabled:true,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})});
  services.push(service);return service;
 }
 function newSession(generation=1){
  const connectionId='offline-antique-advanced-'+generation;
  const state={
   antiques:config.tables.AntiqueBaseCfg.data.filter(row=>row.suitId===suitId).map((row,index)=>({id:row.antiqueId,star:index===0?5:0})),
   suits:spec.suitLevel?[{id:suitId,level:spec.suitLevel,effectiveNum:3,advEffectValue:0}]:[],
   masterLv:spec.masterLv,
  };
  const stock=new Map([[fragment,20],['蓝藏万能碎片',30],['蓝藏品经验',5000],['藏品大师经验',5000],['其他材料',5],['GOLD',50000]]);
  const initial=structuredClone(state),initialStock=new Map(stock),writes=[],reads=[],uncertainWrites=new Map();
  const client={
   connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites,factContext:{accountId:account,generation,connectionId},
   markUnverifiedWrite(name,body){uncertainWrites.set(JSON.stringify([name,body]),true);},
   confirmWatchedWrite(name,body){uncertainWrites.delete(JSON.stringify([name,body]));},
   dispatch(name,value,options){
    options.beforeDispatch?.();
    assert.equal(name,request);assert.deepEqual(toSnapshotJson(wire(name,value)),body);
    const durable=JSON.parse(fs.readFileSync(file,'utf8')).accounts[account][0];
    writes.push({name,body:structuredClone(body),durable});
    if(effect!=='none'){
     for(const cost of spec.costs)stock.set(cost.id,stock.get(cost.id)-cost.num);
     if(spec.action==='suit'){
      let row=state.suits.find(row=>row.id===suitId);
      if(!row){row={id:suitId,level:0,effectiveNum:0,advEffectValue:0};state.suits.push(row);}
      row.level++;row.effectiveNum=7;row.advEffectValue=1.5;
      if(effect==='wrong-level')row.level++;
      if(effect==='missing-derived')delete row.effectiveNum;
     }else if(spec.action==='master')state.masterLv++;
     else{
      stock.set(fragment,stock.get(fragment)+7);
      if(effect==='wrong-gain')stock.set(fragment,stock.get(fragment)-1);
      if(effect==='free-source')stock.set('蓝藏万能碎片',30);
      if(effect==='wrong-target'){stock.set(fragment,20);stock.set('藏品蓝2碎片',7);}
     }
     if(effect==='unrelated-state')state.antiques[1].star++;
     if(effect==='unrelated-stock')stock.set('其他材料',6);
     if(effect==='unrelated-suit')state.suits.push({id:1002,level:1,effectiveNum:0,advEffectValue:0});
    }
    this.markUnverifiedWrite(name,value);
   },
   async sendWatch(name,value,options){
    assert.notEqual(spec.action,'master');this.dispatch(name,value,options);return{status:'UNKNOWN'};
   },
   async request(name,value,reply,_timeout,options={}){
    if(options.mutate){
     assert.equal(spec.action,'master');assert.equal(reply,'AntiqueMasterLevelUpResponse');
     this.dispatch(name,value,options);
     return wire(reply,effect==='missing-receipt'?{}:{masterLv:effect==='wrong-receipt'?state.masterLv+1:state.masterLv});
    }
    assert.deepEqual(toSnapshotJson(wire(name,value)),{});reads.push({name,afterDispatch:writes.length>0});
    const result={
     AllAntiqueRequest:()=>structuredClone(state),
     AllItemRequest:()=>({items:[...stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))}),
     AllResourceRequest:()=>({list:[{res:3,amount:stock.get('GOLD')}]}),
    }[name]?.();
    assert.ok(result,'unexpected offline read '+name);return wire(reply,result);
   },
  };
  const session={id:account,client,state:'READY',player:{playerId:'17',worldId:'9',level:30},generation,connectionId,abort:new AbortController(),busy:null,loop:{running:false},snapshot:{ok:{},failed:{}},writes,reads,stock,initialStock,synthetic:state,initial};
  sessions.push(session);return session;
 }
 async function displayed(service,session){
  const result=await service.surveyModule(session,moduleId,parameters),candidate=result.view.candidates.find(row=>row.executable);
  assert.ok(candidate,JSON.stringify(result.view));
  for(const key of ['action','configEvidence'])assert.equal(candidate[key],undefined);
  return service.plan(session,{module:moduleId,mode:'Manual',parameters,selections:[candidate.actionId]});
 }
 const payload=plan=>({batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});
 return{newHistory,history,newService,newSession,displayed,payload,parameters,request,body,claims};
}
for(const spec of specs){
 test(spec.id+': real Service persists exact resource/entity claims before wire transport and independently confirms',async t=>{
  const f=fixture(t,spec),service=f.newService(f.history),session=f.newSession(),plan=await f.displayed(service,session);
  assert.deepEqual(resources(plan.resourceBudget),resources(spec.costs));assert.deepEqual(plan.budgetClaims.uids,f.claims);
  assert.deepEqual(plan.actions[0].parameters,f.parameters);assert.match(plan.actions[0].identity,/^[0-9a-f]{64}$/);
  for(const key of ['action','configEvidence'])assert.equal(plan.actions[0][key],undefined);
  assert.throws(()=>service.execute(session,{batchId:plan.batchId}),{code:'AUTHORIZATION_REQUIRED'});
  if(spec.costs.length)assert.throws(()=>service.authorize(session,{...f.payload(plan),resourceBudget:[]}),{code:'AUTHORIZATION_REQUIRED'});
  assert.equal(session.writes.length,0);
  const permit=service.authorize(session,f.payload(plan));service.execute(session,permit);await service.settle(account);
  assert.equal(session.writes.length,1);
  const [{durable}]=session.writes;
  assert.equal(durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');
  assert.equal(durable.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');
  assert.deepEqual(resources(durable.runBudget.reserved.resources),resources(spec.costs));assert.deepEqual(durable.runBudget.reserved.uids,f.claims);
  assert.deepEqual(session.reads.filter(row=>row.afterDispatch).map(row=>row.name).sort(),readsExpected);
  const reopened=f.newHistory(),[run]=reopened.list(account),[action]=run.actions;
  assert.equal(run.finalStatus,'SUCCESS',JSON.stringify(action));
  assert.equal(action.requestStatus,spec.action==='master'?'SUCCESS':'UNKNOWN');assert.equal(action.verification.status,'CONFIRMED');
  assert.equal(session.client.uncertainWrites.size,0);assert.equal(reopened.unresolved(account),false);
  for(const [id,num]of session.initialStock){
   const cost=spec.costs.find(row=>row.id===id)?.num??0,gain=spec.action==='exchange'&&id===fragment?7:0;
   assert.equal(session.stock.get(id),num-cost+gain,id);
  }
  if(spec.action==='suit'){assert.equal(action.afterState.suits.find(row=>row.id===suitId).level,spec.suitLevel+1);assert.equal(action.afterState.masterLv,spec.masterLv);}
  if(spec.action==='master')assert.equal(action.afterState.masterLv,spec.masterLv+1);
  if(spec.action==='exchange')assert.deepEqual(session.synthetic,session.initial,'exchange never automatically activates or raises stars');
  assert.throws(()=>service.execute(session,permit),{code:'AUTHORIZATION_REQUIRED'});
 });
 const effects=spec.action==='suit'?['none','wrong-level','missing-derived','unrelated-state','unrelated-stock']:spec.action==='master'?['none','missing-receipt','wrong-receipt','unrelated-state','unrelated-suit']:['none','wrong-gain','free-source','wrong-target','unrelated-state','unrelated-stock'];
 for(const effect of effects)test(spec.id+': '+effect+' retains UNKNOWN and reservations through restart without replay',async t=>{
  const f=fixture(t,spec,effect),service=f.newService(f.history),session=f.newSession(),plan=await f.displayed(service,session),permit=service.authorize(session,f.payload(plan));
  service.execute(session,permit);await service.settle(account);
  const reopened=f.newHistory(),[run]=reopened.list(account),[action]=run.actions;
  assert.equal(run.finalStatus,'UNKNOWN',JSON.stringify(action));assert.equal(action.unresolvedWrite,true);assert.equal(action.verification.status,'UNCONFIRMED');
  assert.deepEqual(resources(run.runBudget.reserved.resources),resources(spec.costs));assert.deepEqual(run.runBudget.reserved.uids,f.claims);
  assert.equal(session.writes.length,1);assert.equal(session.client.uncertainWrites.size,1);
  assert.throws(()=>service.execute(session,permit));
  const restarted=f.newService(),fresh=f.newSession(2);assert.equal(restarted.status(account).blocked,true);
  await assert.rejects(f.displayed(restarted,fresh),{code:'RECOVERY_UNCERTAIN'});
  assert.equal(fresh.writes.length,0);assert.equal(reopened.unresolved(account),true);
 });
}
for(const spec of specs)test(spec.id+': failed durable entity reservation prevents transport even with an authorized plan',async t=>{
 const f=fixture(t,spec);let failed=false;
 const journal={...f.history,put(record){
  if(!failed&&record.runBudget?.reserved.uids.length){failed=true;throw Error('synthetic advanced reservation persistence failure');}
  return f.history.put(record);
 }};
 const service=f.newService(journal),session=f.newSession(),plan=await f.displayed(service,session),permit=service.authorize(session,f.payload(plan));
 service.execute(session,permit);await service.settle(account);
 assert.equal(failed,true);assert.equal(session.writes.length,0);assert.notEqual(service.status(account).finalStatus,'SUCCESS');
 assert.deepEqual(session.synthetic,session.initial);assert.deepEqual([...session.stock],[...session.initialStock]);
});

for(const spec of specs)test('W19 antique '+spec.id+' refusal survives Service restart and connection change',async t=>{
 const f=fixture(t,spec,'none'),service=f.newService(f.history),a=f.newSession();
 const refused=(name,body,options)=>{options?.beforeDispatch?.();assert.equal(name,f.request);assert.deepEqual(toSnapshotJson(wire(name,body)),f.body);a.writes.push({name,body});};
 a.client.sendWatch=async(name,body,options)=>{refused(name,body,options);return {status:'REJECTED'};};const read=a.client.request.bind(a.client);a.client.request=async(name,body,reply,timeout,options)=>{if(options?.mutate){refused(name,body,options);throw Object.assign(Error('synthetic definite antique refusal'),{code:'REJECTED'});}return read(name,body,reply,timeout,options);};
 const p=await f.displayed(service,a),permit=service.authorize(a,f.payload(p));service.execute(a,permit);await service.settle(account);assert.equal(f.newHistory().list(account)[0].finalStatus,'REJECTED');const bytes=fs.readFileSync(f.history.storagePath,'utf8');
 const next=f.newService(),b=f.newSession(2);await assert.rejects(f.displayed(next,b),{code:'REJECTION_MEMORY_ACTIVE'});b.player.worldId='10';assert.equal((await f.displayed(next,b)).actions.length,1);b.player.worldId='9';await assert.rejects(f.displayed(next,b),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.writes.length,0);assert.equal(fs.readFileSync(f.history.storagePath,'utf8'),bytes);
});
