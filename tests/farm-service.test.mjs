import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOperationService} from '../src/operation-service.mjs';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {createModuleSettings} from '../src/gameplay-settings.mjs';
import {GAMEPLAY_MODULES} from '../src/function-registry.mjs';
import {createWorkflowRunner} from '../src/workflow.mjs';
import {loadProtocol} from '../src/proto.mjs';
import {toSnapshotJson} from '../src/game.mjs';

// Genuine registered Farm/Service/History/Workflow and bundled codecs.
// Only synthetic account state, fake in-process transport and private TEMP files.
// No socket, login, credential, real Runtime or real game request is created.
const protocol=loadProtocol(),seed='小麦种子';
const empty=buildingId=>({buildingId,level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},farm:{productId:'',plantTime:0,ripeTime:0}});
const params=buildingId=>({buildingId,action:'plant',productId:'小麦'});
const claims=num=>({resources:[{id:seed,num}],quotas:[],uids:[]});
const reserved=b=>b.reserved.resources.find(r=>r.id===seed)?.num??0;
function fixture({seeds=3,plots=1,enabled=true,apply=true}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-farm-service-')),file=path.join(dir,'history.json'),durable=createExecutionHistory({file});
 const settings=createModuleSettings({file:path.join(dir,'settings.json'),modules:GAMEPLAY_MODULES});
 const accountId='synthetic-farm-account',generation=3;
 if(enabled)settings.save(accountId,'farm',{enabled:true});
 const config={tables:{BuildingCfg:{data:[{buildingType:'农田'}]},FarmlandPlantCfg:{data:[{id:'小麦',material:[seed,1],time:1800,produceNum:5}]},BuildingUpgradeCfg:{data:[]},WorkerOrderCfg:{data:[]},WorkerSpecOrderCfg:{data:[]}}};
 const raw={building:Array.from({length:plots},(_,i)=>empty((i+1)+'农田')),autoFarming:false,workerOrder:[],orderOfTheDay:{orderNum:0}};
 const stock=new Map([[seed,seeds],['小麦',5]]),reads=[],writes=[],journal=[],sessions=[];
 const round=(name,value)=>toSnapshotJson(protocol[name].decode(protocol[name].encode(value).finish()));
 function session(connectionId='synthetic-farm-connection'){
  const client={connected:true,factContext:{accountId,generation},pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Set(),
   async request(name,_body,response,_timeout,options){
    assert.notEqual(options?.mutate,true,'Farm must use its no-response watch contract');reads.push(name);
    const body=name==='OnWaterRequest'?structuredClone(raw):name==='AllItemRequest'?{items:[...stock].map(([itemId,num])=>({itemId,num}))}:name==='AllResourceRequest'?{list:[]}:name==='MyResFieldsRequest'?{info:{fields:[]}}:name==='MyFleetsRequest'?{fleets:[]}:null;
    assert.ok(body,'unexpected synthetic read '+name);return round(response,body);
   },
   async sendWatch(name,body){
    assert.equal(name,'FarmPlantRequest');const decoded=round(name,body);assert.deepEqual(decoded,body);assert.equal(decoded.args.length,1);
    assert.ok(journal.at(-1),'dispatch requires durable History');writes.push({name,body:decoded,durableBeforeWrite:structuredClone(journal.at(-1))});this.markUnverifiedWrite(name,body);
    if(apply){const plot=raw.building.find(r=>r.buildingId===decoded.args[0].buildingId);assert.ok(plot);plot.farm={productId:decoded.args[0].productId,plantTime:1700000000,ripeTime:1700001800};stock.set(seed,stock.get(seed)-1);}
    return {status:'UNKNOWN',sent:true};
   },markUnverifiedWrite(name,body){this.uncertainWrites.add(JSON.stringify({name,body}));},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));}};
  const value={id:accountId,generation,connectionId,client,state:'READY',player:{playerId:'9007199254740993',worldId:12,level:20},abort:new AbortController(),busy:null};sessions.push(value);return value;
 }
 function service(history=durable){return createOperationService({protocol,history:{...history,put(record){const saved=history.put(record);journal.push(structuredClone(saved));return saved;}},getConfig:()=>config,moduleSettings:settings,loadRules:()=>({config:{version:1,enabled:false,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false,onlyShortages:true,productIds:[],maxOperations:10}})});}
 const operations=service(),account=session();
 async function candidates(parameters={}){const view=await operations.surveyModule(account,'farm',parameters,{workflowId:account.workflowOwner??null});return view.view.candidates.filter(r=>r.actionType==='PLANT');}
 async function plan(parameters=params('1农田'),ids=null,mode='Manual'){ids??=(await candidates(parameters)).map(r=>r.actionId);return operations.plan(account,{module:'farm',mode,selections:ids,parameters},{workflowId:account.workflowOwner??null});}
 const authorize=p=>operations.authorize(account,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function execute(p,permit=authorize(p)){const start=operations.execute(account,permit);await operations.settle(accountId);return durable.list(accountId).find(r=>r.runId===start.runId);}
 async function cleanup(){await operations.settle(accountId);for(const s of sessions)s.client.connected=false;assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
 return {dir,file,durable,settings,raw,stock,reads,writes,journal,operations,account,candidates,plan,authorize,execute,cleanup,restart(){return {operations:service(createExecutionHistory({file})),account:session('synthetic-reopened-connection')};}};
}

test('registered Farm uses original five reads, exact codec watch, durable budget and authoritative seed debit',async()=>{
 const f=fixture();try{
  assert.equal(GAMEPLAY_MODULES.farm.contractVersion,1);assert.equal(Object.hasOwn(GAMEPLAY_MODULES.farm,'execute'),false);assert.equal(protocol.FarmPlantResponse,undefined);
  const rows=await f.candidates(params('1农田'));assert.equal(rows.length,1);assert.equal(rows[0].executable,true);
  assert.deepEqual(f.reads,['OnWaterRequest','AllItemRequest','AllResourceRequest','MyResFieldsRequest','MyFleetsRequest']);
  const p=await f.plan();assert.deepEqual(p.budgetClaims,claims(1));const run=await f.execute(p);
  assert.equal(run.finalStatus,'SUCCESS',JSON.stringify(run.actions));assert.equal(run.actions[0].verification.status,'CONFIRMED');assert.equal(run.actions[0].requestStatus,'UNKNOWN','watch result alone is inconclusive; reread confirms success');
  assert.equal(f.stock.get(seed),2);assert.equal(f.stock.get('小麦'),5);assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].body,{args:[{buildingId:'1农田',productId:'小麦'}]});
  const prior=f.writes[0].durableBeforeWrite;assert.equal(prior.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.equal(reserved(prior.runBudget),1);
  assert.equal(run.runBudget.state,'CLOSED');assert.equal(run.runBudget.outcome,'SUCCESS');assert.equal(f.account.client.uncertainWrites.size,0);assert.equal(f.operations.status(f.account.id).blocked,false);assert.equal(createExecutionHistory({file:f.file}).list(f.account.id)[0].finalStatus,'SUCCESS');
 }finally{await f.cleanup();}
});

test('unconfirmed plant stays UNKNOWN and retains reservation across Service and connection restart',async()=>{
 const f=fixture({apply:false});try{
  const p=await f.plan(),permit=f.authorize(p),run=await f.execute(p,permit);assert.equal(run.finalStatus,'UNKNOWN');assert.equal(run.actions[0].unresolvedWrite,true);assert.equal(run.actions[0].verification.status,'UNCONFIRMED');assert.equal(reserved(run.runBudget),1);assert.equal(run.runBudget.outcome,'UNKNOWN');assert.equal(f.stock.get(seed),3);
  const restarted=f.restart();assert.equal(restarted.operations.status(f.account.id).blocked,true);assert.equal(restarted.operations.workflowBudget(f.account.id),null);assert.equal(restarted.operations.executionMemory(f.account.id).events[0].status,'UNKNOWN');
  await assert.rejects(restarted.operations.plan(restarted.account,{module:'farm',mode:'Manual',selections:p.actions.map(r=>r.actionId),parameters:params('1农田')}),e=>e.code==='RECOVERY_UNCERTAIN');assert.throws(()=>restarted.operations.execute(restarted.account,permit),e=>e.code==='STALE_PLAN');assert.equal(f.writes.length,1);
 }finally{await f.cleanup();}
});

test('occupied plot after authorization stops genuine executor with zero dispatch and zero seed reservation',async()=>{
 const f=fixture();try{const p=await f.plan(),permit=f.authorize(p);f.raw.building[0].farm={productId:'小麦',plantTime:1700000000,ripeTime:1700001800};const run=await f.execute(p,permit);assert.equal(run.finalStatus,'NOT_EXECUTED');assert.equal(run.actions[0].dispatched,false);assert.equal(f.writes.length,0);assert.equal(f.stock.get(seed),3);assert.equal(reserved(run.runBudget),0);assert.equal(run.actions[0].dispatchEvidence.state,'NOT_DISPATCHED');}finally{await f.cleanup();}
});

test('real ModuleSettings defaults Farm off and cannot create executable authorization',async()=>{
 const f=fixture({enabled:false});try{assert.deepEqual(f.settings.get(f.account.id,'farm'),{config:{enabled:false},source:'default'});const rows=await f.candidates(params('1农田'));assert.equal(rows[0].executable,false);assert.equal(rows[0].blockedReason,'FARM_MODULE_DISABLED');await assert.rejects(f.plan(),e=>e.code==='STALE_PLAN');assert.equal(f.writes.length,0);assert.equal(fs.existsSync(f.file),false);}finally{await f.cleanup();}
});

test('two plots cannot both authorize a single available seed through genuine Service',async()=>{
 const f=fixture({seeds:1,plots:2});try{const rows=await f.candidates();assert.equal(rows.length,2);await assert.rejects(f.plan({},rows.map(r=>r.actionId),'Hybrid'),e=>e.code==='STALE_PLAN');assert.equal(f.writes.length,0);assert.equal(f.stock.get(seed),1);assert.equal(fs.existsSync(f.file),false);}finally{await f.cleanup();}
});

test('two plots share cumulative seed budget while preserving independent target identities',async()=>{
 const f=fixture({seeds:2,plots:2});try{const rows=await f.candidates(),p=await f.plan({},rows.map(r=>r.actionId),'Hybrid');assert.deepEqual(p.budgetClaims,claims(2));const run=await f.execute(p);assert.equal(run.finalStatus,'SUCCESS',JSON.stringify(run.actions));assert.equal(run.actions.length,2);assert.ok(run.actions.every(r=>r.verification.status==='CONFIRMED'));assert.equal(f.writes.length,2);assert.deepEqual(f.writes.map(r=>r.body.args[0].buildingId),['1农田','2农田']);assert.deepEqual(f.writes.map(r=>reserved(r.durableBeforeWrite.runBudget)),[1,2]);assert.equal(reserved(run.runBudget),2);assert.equal(f.stock.get(seed),0);}finally{await f.cleanup();}
});

for(const limit of [1,2])test('genuine Workflow nodes retain '+limit+'-seed parent ceiling despite fresh inventory gains',async()=>{
 const f=fixture({seeds:2,plots:2});let runner;try{
  const rows=await f.candidates(),graph={version:1,id:'synthetic-farm-workflow-'+limit,name:'Synthetic Farm cumulative budget',budget:claims(limit),nodes:[{id:'start',type:'START'},{id:'first',type:'ACTION',module:'farm',selection:rows[0].actionId,parameters:params('1农田')},{id:'verify-first',type:'VERIFY',module:'farm'},{id:'second',type:'ACTION',module:'farm',selection:rows[1].actionId,parameters:params('2农田')},{id:'verify-second',type:'VERIFY',module:'farm'},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'first'},{from:'first',to:'verify-first'},{from:'verify-first',to:'second'},{from:'second',to:'verify-second'},{from:'verify-second',to:'stop'}]};
  runner=createWorkflowRunner({operations:f.operations,modules:GAMEPLAY_MODULES,getSession:()=>f.account,claim:(_id,runId,options)=>f.operations.claimWorkflow(f.account,runId,options)});
  const first=await runner.start(f.account.id,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');const one=await f.execute(first.plan);assert.equal(one.finalStatus,'SUCCESS');assert.equal(one.workflowDefinitionId,graph.id);assert.equal(one.workflowNodeId,'first');f.stock.set(seed,10);
  const second=await runner.resume();assert.equal(second.status,'AWAITING_AUTHORIZATION');assert.equal(second.plan.workflowNodeId,'second');const two=await f.execute(second.plan);assert.equal(two.finalStatus,limit===2?'SUCCESS':'NOT_EXECUTED',JSON.stringify(two.actions));assert.equal(f.writes.length,limit===2?2:1);assert.equal(reserved(f.operations.workflowBudget(f.account.id)),limit);
  if(limit===2){const final=await runner.resume();assert.equal(final.status,'COMPLETED');assert.equal(final.runBudget.state,'CLOSED');assert.equal(final.runBudget.outcome,'SUCCESS');}else{assert.equal(two.actions[0].dispatched,false);assert.equal(f.stock.get(seed),10);}
 }finally{runner?.stop();await runner?.settle();await f.cleanup();}
});
