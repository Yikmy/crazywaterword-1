import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner } from '../src/workflow.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { GameClient } from '../src/client.mjs';
import { createCodec } from '../src/codec.mjs';
import { surveyEquipmentForge, viewEquipmentForge, planEquipmentForge } from '../src/equipment-forge.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { compileUnifiedExecution } from '../src/loop.mjs';

// Actual registered adapter/Service/History/Workflow, fixed local real codecs,
// synthetic transport, isolated temporary persistence. Stop-auto uses GameClient
// with a closed synthetic socket solely to attest private month-card facts. No Runtime.
const moduleId='equipment-forge',protocol=loadProtocol();
const wire=(name,value)=>protocol[name].decode(protocol[name].encode(value).finish());
const config=()=>({tables:{BuildingCfg:{data:[{buildingType:'装备厂'}]},BuildingEquipMakeCfg:{data:[{makeId:1001,type:'武器',libId:1,seconds:1800,season:1,costItem:[['材料',4],['GOLD',20]]}]},EquipMakeLibCfg:{data:[{libId:1,equipId:'蓝武器1',rate:100},{libId:1,equipId:'蓝武器2',rate:100}]},EquipCfg:{data:[{id:'蓝武器1',type:'武器'},{id:'蓝武器2',type:'武器'}]}}});
const idle=()=>({makeId:0,finishTime:0,equipId:'',star:0});
const making=(extra={})=>({makeId:1001,finishTime:900,equipId:'蓝武器2',star:2,...extra});
const equip=(uid='9007199254740993',extra={})=>({uid,equipId:'蓝武器1',level:0,star:0,refineLv:0,attr:[{attr:1,value:1.5}],rerollAttrs:[],...extra});
const parameters=(action='make',buildingId='1装备厂')=>({buildingId,action,...(action==='make'?{makeId:1001}:{})});
const claims=num=>({resources:[{id:'材料',num},{id:'GOLD',num:100}],quotas:[],uids:[]});
const material=rows=>rows.find(v=>v.id==='材料')?.num??0;
function fixture({enabled=true,apply=true,historyFile}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-forge-service-')),file=historyFile??path.join(dir,'history.json'),journal=[],sessions=new Map(),runners=[];
  const durable=createExecutionHistory({file}),moduleSettings=createModuleSettings({file:path.join(dir,'modules.json'),modules:GAMEPLAY_MODULES});let gameConfig=config(),failPersist=()=>false;
  const history={...durable,put(record){if(failPersist(record))throw Error('synthetic forge persistence unavailable');journal.push(structuredClone(record));return durable.put(record);}};
  const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,moduleSettings,history,getConfig:()=>structuredClone(gameConfig),loadRules:()=>({config:{version:1,enabled:true,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})});
  function session(accountId='account-A',queue=idle()){
    const state={buildings:['1装备厂','2装备厂'].map(buildingId=>({buildingId,level:1,buildStartTime:0,buildFinishTime:0,equipMaking:structuredClone(queue)})),bag:[equip(),equip('9007199254740994')],heroes:[{heroId:'A',level:1,star:1,power:'9007199254740995',skillLevels:[1],equips:[equip('9007199254740994')]}],stock:new Map([['材料',30],['GOLD',100]]),writes:[],reads:[],apply,onRead:null,onWrite:null,nowMs:1000000};
    const client={connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{accountId,generation:1},
      gameClock:{read(){return {status:'TRUSTED',reliable:true,nowMs:state.nowMs,earliestMs:state.nowMs,latestMs:state.nowMs,accountId,generation:client.factContext.generation};}},
      markUnverifiedWrite(name,body){this.uncertainWrites.set(JSON.stringify({name,body}),true);},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));},
      mutate(name,body){state.writes.push({name,body:structuredClone(body),durableBeforeWrite:structuredClone(journal.at(-1))});const b=state.buildings.find(v=>v.buildingId===body.buildingId);let reply={equipId:b.equipMaking.equipId};
        if(state.apply){if(name==='SetBuildingAutoWorkRequest')b.auto=body.isOn;if(name==='MakeEquipRequest'){b.equipMaking=making({finishTime:2000});state.stock.set('材料',state.stock.get('材料')-4);state.stock.set('GOLD',state.stock.get('GOLD')-20);}if(name==='PickMadeEquipRequest'){state.bag.push(equip((9007199254740995n+BigInt(state.writes.length)).toString(),{equipId:b.equipMaking.equipId,star:b.equipMaking.star,level:3,refineLv:2}));b.equipMaking=idle();}}
        state.onWrite?.(name,body);return reply;},
      async request(name,body,response,_timeout,opts){wire(name,body);if(opts?.mutate)return wire(response,this.mutate(name,body));state.reads.push(name);await state.onRead?.(name);
        if(name==='OnWaterRequest')return wire(response,{building:state.buildings});if(name==='AllItemRequest')return wire(response,{items:[...state.stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return wire(response,{list:[{res:3,amount:state.stock.get('GOLD')}]});if(name==='EquipsRequest')return wire(response,{equip:state.bag});if(name==='AllHeroRequest')return wire(response,{heroes:state.heroes});throw Error('Unexpected synthetic forge read '+name);},
      async sendWatch(name,body,opts){opts?.beforeDispatch?.();wire(name,body);this.mutate(name,body);return {status:'UNKNOWN'};},
    };
    const result={id:accountId,client,state:'READY',player:{playerId:accountId==='account-A'?'1001':'1002',worldId:1000001,level:2},generation:1,connectionId:'offline-forge-'+accountId,abort:new AbortController(),busy:null,loop:{running:false},synthetic:state};
    if(enabled)moduleSettings.save(accountId,moduleId,{enabled:true});sessions.set(accountId,result);return result;
  }
  async function displayed(target,p=parameters(),workflowId=null){const surveyed=await service.surveyModule(target,moduleId,p,{workflowId}),candidate=surveyed.view.candidates.find(v=>v.executable);assert.ok(candidate,'expected executable synthetic forge candidate');return service.plan(target,{module:moduleId,mode:'Manual',parameters:p,selections:[candidate.actionId]},{workflowId});}
  const authorize=(target,planned)=>service.authorize(target,{batchId:planned.batchId,planHash:planned.planHash,approvedActionIds:planned.actions.map(v=>v.actionId),resourceBudget:planned.resourceBudget,confirm:true});
  async function execute(target,planned){const permit=authorize(target,planned),started=service.execute(target,permit);await service.settle(target.id);return {permit,started,record:durable.list(target.id).find(v=>v.planSummary.batchId===planned.batchId),status:service.status(target.id)};}
  function runner(target){const r=createWorkflowRunner({operations:service,modules:GAMEPLAY_MODULES,getSession:id=>sessions.get(id),claim:(id,runId,opts)=>service.claimWorkflow(sessions.get(id),runId,opts),isCurrent:(s,g,c)=>s===target&&s.generation===g&&s.client===c});runners.push(r);return r;}
  async function cleanup(){for(const r of runners)r.stop();await Promise.all(runners.map(r=>r.settle()));for(const t of sessions.values())t.abort.abort();await Promise.all([...sessions.keys()].map(id=>service.settle(id)));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
  return {dir,file,service,durable,journal,moduleSettings,session,displayed,authorize,execute,runner,cleanup,config:mutate=>mutate(gameConfig),failPersist:p=>{failPersist=p;}};
}

for(const action of ['make','pick'])test('registered forge '+action+' completes exact Service permit and durable confirmed history',async()=>{
  const f=fixture(),target=f.session('account-A',action==='make'?idle():making());try{
    const planned=await f.displayed(target,parameters(action));assert.equal(planned.actions.length,1);assert.equal(planned.actions[0].action,undefined);assert.equal(planned.accountId,target.id);
    const result=await f.execute(target,planned),row=result.record.actions[0];assert.equal(result.status.finalStatus,'SUCCESS');assert.equal(row.result,'SUCCESS');assert.equal(row.verification.status,'CONFIRMED');assert.equal(row.dispatched,true);assert.equal(row.beforeInventoryReliable,true);assert.equal(row.afterInventoryReliable,true);assert.equal(target.synthetic.writes.length,1);assert.equal(row.stages.some(v=>v.stage==='VERIFIED'),true);
    assert.equal(target.synthetic.writes[0].durableBeforeWrite.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.equal(result.record.runBudget.state,'CLOSED');assert.equal(result.record.runBudget.outcome,'SUCCESS');assert.equal(result.record.runBudget.resumable,false);
    const restarted=createExecutionHistory({file:f.file});assert.equal(restarted.list(target.id)[0].actions[0].verification.status,'CONFIRMED');assert.equal(restarted.unresolved(target.id),false);assert.throws(()=>f.service.execute(target,result.permit));
    if(action==='make')assert.equal(target.synthetic.writes[0].body.universal,false);else assert.deepEqual(planned.resourceBudget,[]);
  }finally{await f.cleanup();}
});

test('registered forge remains default off and refuses raw request/automatic exchange injection',async()=>{
  const f=fixture({enabled:false}),target=f.session();try{const surveyed=await f.service.surveyModule(target,moduleId,parameters());assert.equal(surveyed.config.enabled,false);assert.equal(surveyed.view.candidates.some(v=>v.executable),false);await assert.rejects(f.service.plan(target,{module:moduleId,mode:'Manual',parameters:{...parameters(),request:'MakeEquipRequest'},selections:['fake']}));assert.equal(target.synthetic.writes.length,0);assert.equal(f.durable.list(target.id).length,0);}finally{await f.cleanup();}
});

test('forge authorization binds recipe/library/module settings and rejects forged finite budget',async()=>{
  const f=fixture(),target=f.session();try{
    let planned=await f.displayed(target);f.config(c=>c.tables.EquipMakeLibCfg.data[0].equipId='different');assert.throws(()=>f.authorize(target,planned),{code:'STALE_PLAN'});f.config(c=>c.tables.EquipMakeLibCfg.data[0].equipId='蓝武器1');
    planned=await f.displayed(target);f.service.saveModuleConfig(target.id,{module:moduleId,config:{enabled:false}});assert.throws(()=>f.authorize(target,planned));f.service.saveModuleConfig(target.id,{module:moduleId,config:{enabled:true}});
    planned=await f.displayed(target);assert.throws(()=>f.service.authorize(target,{batchId:planned.batchId,planHash:planned.planHash,approvedActionIds:planned.actions.map(v=>v.actionId),resourceBudget:[],confirm:true}));assert.equal(target.synthetic.writes.length,0);
  }finally{await f.cleanup();}
});

test('forge permit cannot cross accounts and histories/resources stay account isolated',async()=>{
  const f=fixture(),a=f.session(),b=f.session('account-B');try{const planned=await f.displayed(a),permit=f.authorize(a,planned);assert.throws(()=>f.service.execute(b,permit));assert.equal(b.synthetic.writes.length,0);f.service.execute(a,permit);await f.service.settle(a.id);assert.equal(f.durable.list(a.id)[0].finalStatus,'SUCCESS');assert.equal(f.durable.list(b.id).length,0);assert.equal((await f.execute(b,await f.displayed(b))).status.finalStatus,'SUCCESS');assert.equal(a.synthetic.stock.get('材料'),26);assert.equal(b.synthetic.stock.get('材料'),26);}finally{await f.cleanup();}
});

for(const action of ['make','pick'])test('forge '+action+' typed or quiet no-effect UNKNOWN persists and blocks retry after restart',async()=>{
  const f=fixture({apply:false}),target=f.session('account-A',action==='make'?idle():making());let restarted;try{
    const result=await f.execute(target,await f.displayed(target,parameters(action))),row=result.record.actions[0];assert.equal(result.status.finalStatus,'UNKNOWN');assert.equal(row.unresolvedWrite,true);assert.equal(row.verification.status,'UNCONFIRMED');assert.equal(material(result.record.runBudget.reserved.resources),action==='make'?4:0);assert.equal(result.record.runBudget.state,'CLOSED');
    await assert.rejects(f.displayed(target,parameters(action)),{code:'RESPONSE_UNCERTAIN'});assert.equal(target.synthetic.writes.length,1);
    restarted=fixture({historyFile:f.file});const fresh=restarted.session('account-A',action==='make'?idle():making());await assert.rejects(restarted.displayed(fresh,parameters(action)),{code:'RECOVERY_UNCERTAIN'});assert.equal(fresh.synthetic.writes.length,0);assert.equal(restarted.durable.list(fresh.id)[0].finalStatus,'UNKNOWN');
  }finally{await restarted?.cleanup();await f.cleanup();}
});

for(const change of ['queue','uid','world','generation'])test('forge authorized '+change+' change invalidates exact batch with zero writes',async()=>{
  const f=fixture(),target=f.session();try{const planned=await f.displayed(target),permit=f.authorize(target,planned);if(change==='queue')target.synthetic.buildings[0].equipMaking=making();if(change==='uid')target.synthetic.bag.push(equip('99'));if(change==='world')target.player.worldId=2000001;if(change==='generation'){target.generation++;target.client.factContext.generation++;}
    try{f.service.execute(target,permit);await f.service.settle(target.id);}catch{}assert.equal(target.synthetic.writes.length,0);assert.notEqual(f.service.status(target.id).finalStatus,'SUCCESS');assert.throws(()=>f.service.execute(target,permit));
  }finally{await f.cleanup();}
});

test('forge stop before transport sends nothing and stop after write conservatively preserves UNKNOWN',async()=>{
  const f=fixture(),first=f.session();try{const planned=await f.displayed(first);f.service.execute(first,f.authorize(first,planned));f.service.stop(first.id);await f.service.settle(first.id);assert.equal(first.synthetic.writes.length,0);assert.equal(f.service.status(first.id).finalStatus,'CANCELLED');}finally{await f.cleanup();}
  const g=fixture(),second=g.session();try{second.synthetic.onWrite=()=>second.abort.abort();const result=await g.execute(second,await g.displayed(second));assert.equal(result.status.finalStatus,'UNKNOWN');assert.equal(result.record.actions[0].unresolvedWrite,true);assert.equal(second.synthetic.writes.length,1);}finally{await g.cleanup();}
});

test('forge budget persistence failure must stop before transport',async()=>{
  const f=fixture(),target=f.session();try{const planned=await f.displayed(target);f.failPersist(record=>material(record.runBudget?.reserved.resources??[])>0);f.service.execute(target,f.authorize(target,planned));await f.service.settle(target.id);assert.equal(target.synthetic.writes.length,0);assert.notEqual(f.service.status(target.id).finalStatus,'SUCCESS');}finally{f.failPersist(()=>false);await f.cleanup();}
});

for(const limit of [6,8])test('registered two-forge Workflow shares '+limit+' material parent across ACTION nodes',async()=>{
  const f=fixture(),target=f.session();try{
    const a=await f.service.surveyModule(target,moduleId,parameters()),b=await f.service.surveyModule(target,moduleId,parameters('make','2装备厂')),aId=a.view.candidates.find(v=>v.executable).actionId,bId=b.view.candidates.find(v=>v.executable).actionId;
    const graph={version:1,id:'forge-budget-'+limit,name:'Offline forge budget '+limit,budget:claims(limit),nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:moduleId,parameters:parameters(),selection:aId},{id:'v1',type:'VERIFY',module:moduleId},{id:'b',type:'ACTION',module:moduleId,parameters:parameters('make','2装备厂'),selection:bId},{id:'v2',type:'VERIFY',module:moduleId},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'v1'},{from:'v1',to:'b'},{from:'b',to:'v2'},{from:'v2',to:'z'}]};
    const runner=f.runner(target),first=await runner.start(target.id,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(target.synthetic.writes.length,0);assert.equal((await f.execute(target,first.plan)).status.finalStatus,'SUCCESS');target.synthetic.stock.set('材料',1000);
    const second=await runner.resume();assert.equal(second.status,'AWAITING_AUTHORIZATION');assert.equal(second.plan.actions[0].actionId,bId);assert.equal(material(second.runBudget.reserved.resources),4);const executed=await f.execute(target,second.plan),final=await runner.resume();
    if(limit===8){assert.equal(executed.status.finalStatus,'SUCCESS');assert.equal(final.status,'COMPLETED');assert.equal(target.synthetic.writes.length,2);assert.equal(material(final.runBudget.reserved.resources),8);}else{assert.notEqual(executed.status.finalStatus,'SUCCESS');assert.notEqual(final.status,'COMPLETED');assert.equal(target.synthetic.writes.length,1);assert.equal(material(final.runBudget.reserved.resources),4);}
    assert.equal(target.workflowOwner,null);assert.equal(final.runBudget.state,'CLOSED');
  }finally{await f.cleanup();}
});

test('forge pick missing post queue stays durable UNKNOWN even when typed result and new UID agree',async()=>{
  const f=fixture(),target=f.session('account-A',making());try{target.synthetic.onWrite=name=>{if(name==='PickMadeEquipRequest')delete target.synthetic.buildings[0].equipMaking;};const result=await f.execute(target,await f.displayed(target,parameters('pick')));assert.equal(result.status.finalStatus,'UNKNOWN');assert.equal(result.record.actions[0].unresolvedWrite,true);assert.equal(target.synthetic.bag.length,3);assert.equal(target.synthetic.writes.length,1);}finally{await f.cleanup();}
});
for(const action of ['make','pick'])test('registered '+action+' uses the full pool while UI bag excludes worn codec mirrors',async()=>{
  const f=fixture(),target=f.session('account-A',action==='make'?idle():making());try{
    const surveyed=await f.service.surveyModule(target,moduleId,parameters(action));assert.deepEqual(surveyed.view.bag.map(row=>row.uid),['9007199254740993']);assert.equal(target.synthetic.bag.length,2);
    const result=await f.execute(target,await f.displayed(target,parameters(action)));assert.equal(result.record.finalStatus,'SUCCESS');assert.equal(result.record.actions[0].verification.status,'CONFIRMED');assert.equal(target.synthetic.writes.length,1);
    assert.equal(target.synthetic.bag.find(row=>row.uid==='9007199254740994').level,target.synthetic.heroes[0].equips[0].level);
  }finally{await f.cleanup();}
});

test('registered forge blocks a missing or conflicting full-pool mirror before any history or write',async()=>{
  for(const mutate of [s=>s.bag.pop(),s=>s.bag[1].level++,s=>s.heroes.push({...structuredClone(s.heroes[0]),heroId:'B'})]){
    const f=fixture(),target=f.session();try{mutate(target.synthetic);const surveyed=await f.service.surveyModule(target,moduleId,parameters());assert.equal(surveyed.view.candidates.some(row=>row.executable),false);assert.equal(target.synthetic.writes.length,0);assert.equal(f.durable.list(target.id).length,0);}finally{await f.cleanup();}
  }
});

test('registered forge invalidates exact authorized identity after both pool and worn state change',async()=>{
  const f=fixture(),target=f.session();try{const planned=await f.displayed(target),permit=f.authorize(target,planned);target.synthetic.bag[1].level++;target.synthetic.heroes[0].equips[0].level++;
    f.service.execute(target,permit);await f.service.settle(target.id);const record=f.durable.list(target.id)[0];assert.equal(record.finalStatus,'NOT_EXECUTED');assert.equal(record.actions[0].dispatched,false);assert.equal(target.synthetic.writes.length,0);assert.equal(record.runBudget.reserved.resources.length,0);
  }finally{await f.cleanup();}
});

for(const action of ['make','pick'])test('registered '+action+' persists UNKNOWN when an existing full-pool mirror changes after write',async()=>{
  const f=fixture(),target=f.session('account-A',action==='make'?idle():making());try{target.synthetic.onWrite=()=>{target.synthetic.bag[1].level++;target.synthetic.heroes[0].equips[0].level++;};const result=await f.execute(target,await f.displayed(target,parameters(action)));
    assert.equal(result.record.finalStatus,'UNKNOWN');assert.equal(result.record.actions[0].unresolvedWrite,true);assert.equal(target.synthetic.writes.length,1);assert.equal(f.durable.unresolved(target.id),true);await assert.rejects(f.displayed(target,parameters(action)));assert.equal(target.synthetic.writes.length,1);
  }finally{await f.cleanup();}
});

for(const action of ['make','pick'])test('W19 forge '+action+' refusal survives reconnect and role return',async()=>{
 const f=fixture({apply:false}),a=f.session('account-A',action==='make'?idle():making());let next;try{a.synthetic.onWrite=()=>{throw Object.assign(Error('synthetic definite forge refusal'),{code:'REJECTED'});};assert.equal((await f.execute(a,await f.displayed(a,parameters(action)))).record.finalStatus,'REJECTED');next=fixture({apply:false,historyFile:f.file});const b=next.session('account-A',action==='make'?idle():making());b.generation=b.client.factContext.generation=2;b.connectionId='replacement-forge';
 await assert.rejects(next.displayed(b,parameters(action)),{code:'REJECTION_MEMORY_ACTIVE'});b.player.worldId=1000002;assert.equal((await next.displayed(b,parameters(action))).actions.length,1);b.player.worldId=1000001;await assert.rejects(next.displayed(b,parameters(action)),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.synthetic.writes.length,0);
 }finally{await next?.cleanup();await f.cleanup();}
});


for(const apply of [true,false])test('prepared multi-forge Service Workflow uses exact initial budget and stops on UNKNOWN '+apply,async()=>{
 const f=fixture({apply}),target=f.session();try{
 const source=await f.service.prepareEquipmentForgeSource(target,{action:'make',targets:['1装备厂','2装备厂'].map(buildingId=>({buildingId,expectedQueue:idle(),makeId:1001})),expectedEquipmentCounts:{武器:1,防具:0,饰品:0},maxDurationMs:60000});
 assert.equal(target.synthetic.writes.length,0);assert.equal(source.graph.runPolicy.maxActions,2);assert.equal(material(source.graph.budget.resources),8);
 const runner=f.runner(target),first=await runner.start(target.id,source.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');
 assert.equal((await f.execute(target,first.plan)).status.finalStatus,apply?'SUCCESS':'UNKNOWN');
 const next=await runner.resume();
 if(apply){assert.equal(next.status,'AWAITING_AUTHORIZATION');assert.deepEqual(next.plan.actions[0].target.buildingId,'2装备厂');assert.equal((await f.execute(target,next.plan)).status.finalStatus,'SUCCESS');assert.equal((await runner.resume()).status,'COMPLETED');assert.equal(target.synthetic.writes.length,2);}
 else{assert.notEqual(next.status,'AWAITING_AUTHORIZATION');assert.equal(target.synthetic.writes.length,1);assert.equal(f.durable.unresolved(target.id),true);}
 }finally{await f.cleanup();}
});

for(const action of ['make','pick'])for(const unconfirmed of [false,true])test('24-factory '+action+' Workflow '+(unconfirmed?'stops on final UNKNOWN':'confirms every factory'),{timeout:240000},async()=>{
 const f=fixture(),target=f.session();try{
  const state=target.synthetic,queue=action==='make'?idle():making();
  state.buildings=Array.from({length:24},(_,i)=>({buildingId:(i+1)+'装备厂',level:1,buildStartTime:0,buildFinishTime:0,equipMaking:structuredClone(queue)}));
  state.stock=new Map([['材料',96],['GOLD',480]]);
  const source=await f.service.prepareEquipmentForgeSource(target,{action,targets:state.buildings.map(({buildingId})=>({buildingId,expectedQueue:structuredClone(queue),...(action==='make'?{makeId:1001}:{})})),expectedEquipmentCounts:{武器:action==='make'?1:25,防具:0,饰品:0},maxDurationMs:600000});
  assert.equal(source.graph.runPolicy.maxActions,24);assert.equal(material(source.graph.budget.resources),action==='make'?96:0);assert.equal(state.writes.length,0);
  const runner=f.runner(target);let status=await runner.start(target.id,source.graph);
  for(let i=0;i<24;i++){
   assert.equal(status.status,'AWAITING_AUTHORIZATION');assert.equal(status.plan.actions[0].target.buildingId,(i+1)+'装备厂');
   if(unconfirmed&&i===23)state.apply=false;
   const result=await f.execute(target,status.plan);assert.equal(result.record.finalStatus,unconfirmed&&i===23?'UNKNOWN':'SUCCESS');
   assert.equal(state.writes.length,i+1);assert.equal(state.writes[i].durableBeforeWrite.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');
   status=await runner.resume();
  }
  assert.equal(status.status,unconfirmed?'UNKNOWN':'COMPLETED');assert.equal(status.runBudget.state,'CLOSED');assert.equal(target.workflowOwner,null);
  assert.equal(f.durable.unresolved(target.id),unconfirmed);assert.equal(f.durable.list(target.id).length,24);
  assert.equal(state.stock.get('材料'),action==='make'?(unconfirmed?4:0):96);
  assert.equal(state.bag.length,action==='pick'?(unconfirmed?25:26):2);
 }finally{await f.cleanup();}
});


async function stopAutoFixture(t,{apply=true,cards=[{type:2,endTime:-1}],queue=idle()}={}){
 const f=fixture({apply}),target=f.session('account-A',queue),state=target.synthetic,old=target.client,codec=createCodec(protocol);let socket,seq=1;
 class Socket{constructor(){socket=this;this.readyState=1;}send(){}close(){this.readyState=3;}receive(name,body){this.onmessage?.({data:codec.encode(name,seq++,body)});}}
 const client=new GameClient({protocol,accountId:target.id,generation:1,WebSocketImpl:Socket});client.factContext=old.factContext={...old.factContext,connectionId:target.connectionId};client.on('error',()=>{});
 const originalClock=client.gameClock;const ready=client.connect({});socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:target.player.playerId,worldId:String(target.player.worldId)}});await ready;t.after(()=>{client.gameClock=originalClock;client.stop();});
 state.cards=structuredClone(cards);for(const b of state.buildings)b.auto=true;
 for(const key of ['mutate','sendWatch','gameClock'])client[key]=old[key];
 client.request=async function(name,body,response,timeout,opts){if(name==='MonthCardRequest'){const result=GameClient.prototype.request.call(this,name,body,response,timeout,opts);socket.receive('MonthCardResponse',{cardItem:state.cards});return result;}return old.request.call(this,name,body,response,timeout,opts);};target.client=client;
 f.config(c=>{c.tables.MonthCardCfg={data:[{id:'普通月卡',effectList:[['第二生产位',1]]},{id:'高级月卡',effectList:[['装备工厂自动锻造',1]]}]};});
 let gameConfig;f.config(c=>gameConfig=c);
 const options=p=>({config:gameConfig,player:target.player,moduleConfig:{enabled:true},parameters:p});
 const draft={action:'stop-auto'},initial=await surveyEquipmentForge(client,protocol,options(draft)),parameters=viewEquipmentForge(initial,options(draft)).stopAutoPreparation[0]??draft;
 const facts=await surveyEquipmentForge(client,protocol,options(parameters)),operation=planEquipmentForge(facts,options(parameters)).actions[0];
 return {...f,target,state,client,socket,initial,parameters,facts,operation,options,run:(op=operation,extra={})=>{const scope={...client.factContext,runId:'forge-auto-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'forge-auto-batch',limits,ledger:null};return executeBusinessOperation(client,protocol,op,{adapter:GAMEPLAY_MODULES[moduleId],...options(parameters),allowMutate:true,budget,...extra});}};
}

test('forge stop auto attests advanced month card and changes only current auto flag with original exact parent UID',async t=>{
 const f=await stopAutoFixture(t);try{assert.ok(f.operation);assert.deepEqual(f.operation.action,{request:'SetBuildingAutoWorkRequest',response:null,body:{buildingId:'1装备厂',isOn:false}});assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'forge-auto-work',id:'1装备厂'}]});const before=structuredClone(f.state.buildings),bag=structuredClone(f.state.bag),stock=[...f.state.stock];const result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));before[0].auto=false;assert.deepEqual(f.state.buildings,before);assert.deepEqual(f.state.bag,bag);assert.deepEqual([...f.state.stock],stock);assert.equal(f.state.writes.length,1);assert.equal(protocol.SetBuildingAutoWorkResponse,undefined);}finally{await f.cleanup();}
 for(const cards of [[],[{type:1,endTime:-1}],[{type:2,endTime:0}],[{type:2,endTime:1000}]]){const b=await stopAutoFixture(t,{cards});try{assert.equal(b.operation,undefined);}finally{await b.cleanup();}}
 const future=await stopAutoFixture(t,{cards:[{type:2,endTime:1001}]});try{assert.ok(future.operation);future.state.nowMs=1001000;assert.equal((await future.run()).dispatched,false);}finally{await future.cleanup();}
 const active=await stopAutoFixture(t,{queue:making({finishTime:2000})});try{assert.ok(active.operation);assert.equal((await active.run()).status,'SUCCESS');}finally{await active.cleanup();}
});

test('forge stop auto refuses forged facts, public cards, drift, expiry, mixed parameters and missing finite parent',async t=>{
 for(const mode of ['card','disconnect','connection','world','off','queue','config','clock','parent','forged','late-card']){const f=await stopAutoFixture(t);try{if(mode==='card')f.state.cards=[{type:2,endTime:0}];if(mode==='disconnect')f.socket.readyState=3;if(mode==='connection')f.client.factContext.connectionId='different';if(mode==='world')f.target.player.worldId=1000002;if(mode==='off')f.state.buildings[0].auto=false;if(mode==='queue')f.state.buildings[0].equipMaking=making({finishTime:1000});if(mode==='config')f.config(c=>c.tables.MonthCardCfg.data[1].effectList[0][1]=0);if(mode==='clock')f.client.gameClock={read:()=>({status:'UNKNOWN'})};if(mode==='forged'){assert.equal(planEquipmentForge(structuredClone(f.facts),f.options(f.parameters)).actions.length,0);f.socket.receive('SCEWorldOrderDelivery',{monthCard:{endTime:0}});f.client.readMonthCards=()=>({...f.facts.autoWorkSource,status:'CURRENT'});assert.equal(planEquipmentForge(f.facts,f.options(f.parameters)).actions.length,0);continue;}let extra=mode==='late-card'?{onStage:stage=>{if(stage==='DISPATCH_INTENT')f.socket.receive('SCEWorldOrderDelivery',{monthCard:{endTime:0}});}}:{};if(mode==='parent'){const scope={...f.client.factContext,runId:'missing-forge-auto'},limits={resources:[],quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'bad',limits,ledger:null}};}const result=await f.run(f.operation,extra);assert.equal(result.dispatched,false,mode+JSON.stringify(result));assert.equal(f.state.writes.length,0);}finally{await f.cleanup();}}
 for(const parameters of [{action:'stop-auto',makeId:1},{action:'stop-auto',allowUniversal:false},{action:'stop-auto',expectedQueue:idle()},{action:'stop-auto',expectedStopHash:'bad'}])assert.throws(()=>GAMEPLAY_MODULES[moduleId].validateParameters(parameters));
 const good={request:'SetBuildingAutoWorkRequest',body:{buildingId:'24装备厂',isOn:false},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const extra of [{body:{buildingId:'1食品厂',isOn:false}},{body:{...good.body,isOn:true}},{body:{...good.body,makeId:1}},{costs:undefined},{costs:[{id:'GOLD',num:1}]}])assert.throws(()=>assertPaymentAllowed({...good,...extra}));
});

test('forge stop auto never confirms no effect or collateral queue, equipment, peer or stock changes',async t=>{
 for(const mode of ['no-effect','queue','equipment','peer','stock']){const f=await stopAutoFixture(t,{apply:mode!=='no-effect'});try{f.state.onWrite=()=>{if(mode==='queue')f.state.buildings[0].equipMaking=making({finishTime:2000});if(mode==='equipment')f.state.bag[0].level++;if(mode==='peer')f.state.buildings[1].auto=false;if(mode==='stock')f.state.stock.set('材料',29);};const result=await f.run();assert.equal(result.status,'UNKNOWN',mode+JSON.stringify(result));assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);}finally{await f.cleanup();}}
});

for(const outcome of ['success','unknown','rejected'])test('forge stop auto original Tasks Service Workflow '+outcome+' retains durable dispatch, authorization and parent',async t=>{
 const f=await stopAutoFixture(t,{apply:outcome!=='unknown'});try{if(outcome==='rejected')f.state.onWrite=()=>{throw Object.assign(Error('explicit synthetic refusal'),{code:'REJECTED'});};const tasks={entry:'tasks',tasks:[{kind:moduleId,parameters:f.parameters,actionId:f.operation.actionId}],budget:f.operation.budgetClaims},graph=compileUnifiedExecution(tasks,{modules:GAMEPLAY_MODULES}).graph,runner=f.runner(f.target),first=await runner.start(f.target.id,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);assert.deepEqual(first.plan.resourceBudget,[]);const result=await f.execute(f.target,first.plan),expected=outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED';assert.equal(result.record.finalStatus,expected,JSON.stringify(result.record));assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0].durableBeforeWrite.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(result.record.runBudget.reserved.uids,[{type:'forge-auto-work',id:f.parameters.buildingId}]);assert.equal((await runner.resume()).status,outcome==='success'?'COMPLETED':outcome==='rejected'?'FAILED':expected);if(outcome==='unknown')await assert.rejects(f.displayed(f.target,f.parameters));assert.equal(f.state.writes.length,1);}finally{await f.cleanup();}
});
