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

// Actual registered adapter/Service/History/Workflow, fixed local real codecs,
// synthetic transport, isolated temporary persistence. No GameClient or Runtime.
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
    const state={buildings:['1装备厂','2装备厂'].map(buildingId=>({buildingId,level:1,buildStartTime:0,buildFinishTime:0,equipMaking:structuredClone(queue)})),bag:[equip()],heroes:[{heroId:'A',level:1,star:1,power:'9007199254740995',skillLevels:[1],equips:[equip('9007199254740994')]}],stock:new Map([['材料',30],['GOLD',100]]),writes:[],reads:[],apply,onRead:null,onWrite:null,nowMs:1000000};
    const client={connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{accountId,generation:1},
      gameClock:{read(){return {status:'TRUSTED',reliable:true,nowMs:state.nowMs,earliestMs:state.nowMs,latestMs:state.nowMs,accountId,generation:client.factContext.generation};}},
      markUnverifiedWrite(name,body){this.uncertainWrites.set(JSON.stringify({name,body}),true);},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));},
      mutate(name,body){state.writes.push({name,body:structuredClone(body),durableBeforeWrite:structuredClone(journal.at(-1))});const b=state.buildings.find(v=>v.buildingId===body.buildingId);let reply={equipId:b.equipMaking.equipId};
        if(state.apply){if(name==='MakeEquipRequest'){b.equipMaking=making({finishTime:2000});state.stock.set('材料',state.stock.get('材料')-4);state.stock.set('GOLD',state.stock.get('GOLD')-20);}if(name==='PickMadeEquipRequest'){state.bag.push(equip('9007199254740996',{equipId:b.equipMaking.equipId,star:b.equipMaking.star,level:3,refineLv:2}));b.equipMaking=idle();}}
        state.onWrite?.(name,body);return reply;},
      async request(name,body,response,_timeout,opts){wire(name,body);if(opts?.mutate)return wire(response,this.mutate(name,body));state.reads.push(name);await state.onRead?.(name);
        if(name==='OnWaterRequest')return wire(response,{building:state.buildings});if(name==='AllItemRequest')return wire(response,{items:[...state.stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return wire(response,{list:[{res:3,amount:state.stock.get('GOLD')}]});if(name==='EquipsRequest')return wire(response,{equip:state.bag});if(name==='AllHeroRequest')return wire(response,{heroes:state.heroes});throw Error('Unexpected synthetic forge read '+name);},
      async sendWatch(name,body){wire(name,body);this.mutate(name,body);return {status:'UNKNOWN'};},
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
  const f=fixture(),target=f.session('account-A',making());try{target.synthetic.onWrite=name=>{if(name==='PickMadeEquipRequest')delete target.synthetic.buildings[0].equipMaking;};const result=await f.execute(target,await f.displayed(target,parameters('pick')));assert.equal(result.status.finalStatus,'UNKNOWN');assert.equal(result.record.actions[0].unresolvedWrite,true);assert.equal(target.synthetic.bag.length,2);assert.equal(target.synthetic.writes.length,1);}finally{await f.cleanup();}
});