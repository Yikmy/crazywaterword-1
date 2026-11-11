import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameClient } from '../src/client.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { fleetModule } from '../src/fleet.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createWorkflowRunner } from '../src/workflow.mjs';
import { RESOURCE_NAMES } from '../src/resource-ledger.mjs';

// Synthetic wire frames, facts and a private temporary history/settings directory.
// Never call connect(), open an account/credential file, create a Runtime, load
// protocol assets, or substitute an adapter/executor for the registered Fleet.
const codec = { encode: (name, seq, body = {}) => Buffer.from(JSON.stringify({ name, seq, body })), decode: bytes => JSON.parse(Buffer.from(bytes).toString()) };
const protocol = Object.fromEntries(['MyFleets','AllItem','AllResource','CargoShips','WorldInfo','GuildInfo','FillCargoShip','DrawShipReward'].flatMap(name => [[name+'Request',{}],[name+'Response',{}]]));
const fillId = index => 'fleet:cargoFill:'+index+':1';
const claimId = index => 'fleet:cargoClaim:'+index;
const claims = num => ({ resources: [{ id:'木材',num }],quotas:[],uids:[] });
const amount = (rows,id='木材') => rows.find(row=>row.id===id)?.num??0;
function ship(index=1) { return { index,status:0,arriveTime:0,orderItem:[{asset:{type:0,id:'木材',num:4},filled:false,reward:{asset:[{type:1,id:'EXP',num:2},{type:1,id:'GOLD',num:3}]}},{asset:{type:0,id:'石头',num:2},filled:false,reward:{asset:[{type:1,id:'EXP',num:1}]}}],reward:[{type:0,id:'藏品大师徽章',num:3}] }; }
function arrived(index=1) { const value=ship(index);value.status=2;value.arriveTime=100;value.orderItem.forEach(row=>row.filled=true);return value; }
function fixture({ ships=[ship()],enabled=true,apply=true,historyFile=null }={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-cargo-service-'));
 const file=historyFile??path.join(dir,'history.json'),history=createExecutionHistory({file});
 const settings=createModuleSettings({file:path.join(dir,'settings.json'),modules:GAMEPLAY_MODULES});
 const service=createOperationService({protocol,history,moduleSettings:settings,getConfig:()=>({tables:{}}),loadRules:()=>({config:{version:1,enabled:false,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false,onlyShortages:true,productIds:[],maxOperations:10}})});
 const clients=[],sessions=[],writes=[],reads=[],releases=[];
 function session(id='A') {
  const state={ships:structuredClone(ships),stock:new Map([['木材',10],['石头',5],['EXP',10],['GOLD',100]]),apply,onWrite:null,onRead:null};
  const client=new GameClient({protocol:{},WebSocketImpl:class { constructor(){throw Error('Offline cargo fixture must never open a socket');} }});
  client.codec=codec;client.state='READY';
  const receive=(name,body)=>client.onMessage(codec.encode(name,0,body));
  client.socket={readyState:1,close(){this.readyState=3;},send(bytes){
   const frame=codec.decode(bytes),name=frame.name;
   if(name==='FillCargoShipRequest'||name==='DrawShipRewardRequest') {
    const durable=history.list(id)[0];writes.push({id,...structuredClone(frame),durableBeforeWrite:structuredClone(durable)});
    const original=state.ships.find(row=>row.index===(name==='FillCargoShipRequest'?frame.body.shipIndex:frame.body.index));
    assert.ok(original,'exact synthetic ship must exist');let response;
    if(name==='FillCargoShipRequest') {
     assert.deepEqual(Object.keys(frame.body).sort(),['cargoIndex','shipIndex']);assert.equal(frame.body.cargoIndex.length,1);
     const row=original.orderItem[frame.body.cargoIndex[0]-1];response={reward:structuredClone(row.reward)};
     if(state.apply) { row.filled=true;state.stock.set(row.asset.id,state.stock.get(row.asset.id)-row.asset.num);for(const asset of row.reward.asset)state.stock.set(asset.id,(state.stock.get(asset.id)??0)+asset.num);if(original.orderItem.every(item=>item.filled)){original.status=1;original.arriveTime=200;} }
    } else {
     assert.deepEqual(Object.keys(frame.body),['index']);const next=ship(original.index);next.orderItem[0].asset.num=5;
     response={reward:{asset:structuredClone(original.reward)},ship:structuredClone(next)};
     if(state.apply) { for(const asset of original.reward)state.stock.set(asset.id,(state.stock.get(asset.id)??0)+asset.num);state.ships[state.ships.indexOf(original)]=next; }
    }
    state.onWrite?.(frame,response);receive(name.replace('Request','Response'),response);return;
   }
   reads.push({id,name,body:structuredClone(frame.body)});state.onRead?.(name);
   const resources=new Map(Object.entries(RESOURCE_NAMES).map(([res,key])=>[key,Number(res)]));
   const body=name==='AllItemRequest'?{items:[...state.stock].filter(([key])=>!resources.has(key)).map(([itemId,num])=>({itemId,num}))}:
    name==='AllResourceRequest'?{list:[...state.stock].filter(([key])=>resources.has(key)).map(([key,amount])=>({res:resources.get(key),amount}))}:
    name==='CargoShipsRequest'?{ship:structuredClone(state.ships)}:name==='MyFleetsRequest'?{fleets:[]}:name==='WorldInfoRequest'?{cities:[]}:name==='GuildInfoRequest'?{}:null;
   assert.notEqual(body,null,'unexpected synthetic request '+name);receive(name.replace('Request','Response'),body);
  }};
  const value={id,client,state:'READY',generation:1,connectionId:'synthetic-cargo-'+id,player:{playerId:'synthetic-player-'+id,worldId:1},abort:new AbortController(),busy:null,loop:{running:false},synthetic:state};
  clients.push(client);sessions.push(value);if(enabled)service.saveModuleConfig(id,{module:'fleet',config:{enabled:true,cargoFill:true,cargoClaim:true}});return value;
 }
 const target=session();
 function plan(ids=[fillId(1)],account=target,{workflowId=account.workflowOwner??null,parameters={}}={}) { return service.plan(account,{module:'fleet',mode:ids.length===1?'Manual':'Automatic',selections:ids,parameters},{workflowId}); }
 function authorize(planned,account=target,extra={}) { return service.authorize(account,{batchId:planned.batchId,planHash:planned.planHash,approvedActionIds:planned.actions.map(row=>row.actionId),resourceBudget:planned.resourceBudget,confirm:true,...extra}); }
 async function execute(planned,account=target,permit=authorize(planned,account)) { const started=service.execute(account,permit);await service.settle(account.id);return {started,status:service.status(account.id),record:history.list(account.id).find(row=>row.planSummary.batchId===planned.batchId)}; }
 function claim(limit,account=target) { const runId='cargo-parent-'+account.id,release=service.claimWorkflow(account,runId,{limits:claims(limit)});releases.push(release);return runId; }
 async function cleanup() { for(const release of releases.reverse())release();for(const account of sessions)account.abort.abort();await Promise.all(sessions.map(account=>service.settle(account.id)));for(const client of clients)client.stop();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true}); }
 return {dir,file,history,settings,service,target,session,reads,writes,plan,authorize,execute,claim,cleanup};
}

const stages=['SURVEY','RESOURCE_PREFLIGHT','DISPATCH_INTENT','DISPATCHED','RESPONSE','VERIFY','VERIFIED'];

test('registered Fleet defaults Cargo off and explicit account configuration causes no game dispatch',async()=>{
 const f=fixture({enabled:false});try {
  assert.equal(f.service.modules.fleet,GAMEPLAY_MODULES.fleet);assert.equal(GAMEPLAY_MODULES.fleet.survey,fleetModule.survey);assert.equal(GAMEPLAY_MODULES.fleet.execute,undefined);
  const view=await f.service.surveyModule(f.target,'fleet');assert.equal(view.config.enabled,false);assert.equal(view.config.cargoFill,false);assert.equal(view.config.cargoClaim,false);
  assert.equal(view.view.candidates.find(row=>row.actionId===fillId(1)).reason,'MODULE_DISABLED');await assert.rejects(f.plan(),{code:'STALE_PLAN'});assert.equal(f.writes.length,0);
  const before=f.reads.length;f.service.saveModuleConfig('A',{module:'fleet',config:{enabled:true,cargoFill:true,cargoClaim:true}});assert.equal(f.reads.length,before);
  const b=f.session('B');assert.equal(f.settings.get(b.id,'fleet').config.enabled,false);assert.equal((await f.plan()).actions.length,1);assert.equal(f.writes.length,0);assert.equal(f.history.list('A').length,0);
 }finally{await f.cleanup();}
});

test('Cargo fill uses actual survey plan authorization executor and durable exact resources/results',async()=>{
 const f=fixture();try {
  const view=await f.service.surveyModule(f.target,'fleet',{shipIndex:1,cargoIndex:1});assert.equal(view.view.cargo.source,'CargoShipsResponse');assert.equal(view.view.candidates.find(row=>row.actionId===fillId(1)).executable,true);
  const planned=await f.plan();assert.deepEqual(planned.resourceBudget,[{id:'木材',num:4}]);assert.equal(planned.actions[0].action,undefined);assert.equal(f.writes.length,0);
  const permit=f.authorize(planned);assert.equal(f.writes.length,0);const result=await f.execute(planned,f.target,permit),row=result.record.actions[0];
  assert.equal(result.status.finalStatus,'SUCCESS');assert.equal(row.requestStatus,'SUCCESS');assert.equal(row.result,'SUCCESS');assert.equal(row.verification.status,'CONFIRMED');assert.equal(row.beforeInventoryReliable,true);assert.equal(row.afterInventoryReliable,true);
  assert.equal(amount(row.beforeInventory),10);assert.equal(amount(row.afterInventory),6);assert.equal(amount(row.afterInventory,'EXP'),12);assert.equal(amount(row.afterInventory,'GOLD'),103);assert.deepEqual(row.resourceReservation,[{id:'木材',num:4}]);
  assert.deepEqual(row.stages.map(item=>item.stage),stages);assert.deepEqual(f.writes.map(item=>({name:item.name,body:item.body})),[{name:'FillCargoShipRequest',body:{shipIndex:1,cargoIndex:[1]}}]);
  const intent=f.writes[0].durableBeforeWrite;assert.equal(intent.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.equal(amount(intent.runBudget.reserved.resources),4);assert.deepEqual(intent.authorizationSummary.resourceBudget,planned.resourceBudget);
  assert.equal(f.target.client.uncertainWrites.size,0);assert.equal(f.history.unresolved('A'),false);assert.deepEqual(createExecutionHistory({file:f.file}).list('A')[0],result.record);assert.throws(()=>f.service.execute(f.target,permit),{code:'AUTHORIZATION_REQUIRED'});assert.equal(f.writes.length,1);
 }finally{await f.cleanup();}
});

test('Cargo arrival claim persists original reward and authoritative complete replacement voyage',async()=>{
 const f=fixture({ships:[arrived()]});try {
  await f.service.surveyModule(f.target,'fleet',{shipIndex:1});const planned=await f.plan([claimId(1)]);assert.deepEqual(planned.resourceBudget,[]);
  const result=await f.execute(planned),row=result.record.actions[0];assert.equal(result.status.finalStatus,'SUCCESS');assert.equal(row.verification.status,'CONFIRMED');assert.equal(amount(row.beforeInventory,'藏品大师徽章'),0);assert.equal(amount(row.afterInventory,'藏品大师徽章'),3);
  assert.equal(row.afterState.cargo.ships[0].status,0);assert.equal(row.afterState.cargo.ships[0].slots[0].required,5);assert.deepEqual(f.writes.map(item=>({name:item.name,body:item.body})),[{name:'DrawShipRewardRequest',body:{index:1}}]);
  const durable=createExecutionHistory({file:f.file}).list('A')[0];assert.equal(durable.actions[0].result,'SUCCESS');assert.deepEqual(durable.actions[0].stages.map(item=>item.stage),stages);assert.equal(durable.runBudget.state,'CLOSED');assert.equal(f.history.unresolved('A'),false);
 }finally{await f.cleanup();}
});

for(const [label,change] of [
 ['authorized slot cost',state=>state.ships[0].orderItem[0].asset.num++],
 ['other slot identity',state=>state.ships[0].orderItem[1].asset.num++],
 ['original reward',state=>state.ships[0].reward[0].num++],
 ['fresh inventory',state=>state.stock.set('木材',3)]
])test('Cargo revalidates '+label+' after authorization before dispatch',async()=>{
 const f=fixture();try {const planned=await f.plan(),permit=f.authorize(planned);change(f.target.synthetic);const result=await f.execute(planned,f.target,permit);assert.equal(result.status.finalStatus,'NOT_EXECUTED');assert.equal(result.record.actions[0].dispatched,false);assert.equal(f.writes.length,0);assert.equal(f.history.unresolved('A'),false);}finally{await f.cleanup();}
});

test('a claim permit for an old arrival cannot consume a later voyage with the same ship index',async()=>{
 const f=fixture({ships:[arrived()]});try {const planned=await f.plan([claimId(1)]),permit=f.authorize(planned);f.target.synthetic.ships[0].arriveTime++;const result=await f.execute(planned,f.target,permit);assert.equal(result.status.finalStatus,'NOT_EXECUTED');assert.equal(f.writes.length,0);assert.equal(f.target.synthetic.stock.get('藏品大师徽章')??0,0);}finally{await f.cleanup();}
});

test('Cargo authorization binds exact action IDs and total material cost rather than any fill permission',async()=>{
 const f=fixture();try {const planned=await f.plan();for(const extra of [{resourceBudget:[{id:'木材',num:3}]},{approvedActionIds:[fillId(2)]},{planHash:'forged-cargo-hash'},{confirm:false}])assert.throws(()=>f.authorize(planned,f.target,extra),{code:'AUTHORIZATION_REQUIRED'});assert.equal(f.writes.length,0);assert.equal(f.history.list('A').length,0);}finally{await f.cleanup();}
});

test('typed Cargo acknowledgement without authority stays UNKNOWN and cannot resend even after restart',async()=>{
 const f=fixture({apply:false});let restarted;try {
  const planned=await f.plan(),permit=f.authorize(planned),result=await f.execute(planned,f.target,permit),row=result.record.actions[0];
  assert.equal(row.requestStatus,'SUCCESS');assert.equal(row.result,'UNKNOWN');assert.equal(row.verification.status,'UNCONFIRMED');assert.equal(row.unresolvedWrite,true);assert.equal(result.status.blocked,true);assert.equal(f.target.client.uncertainWrites.size,1);assert.equal(f.history.unresolved('A'),true);assert.equal(amount(result.record.runBudget.reserved.resources),4);
  assert.throws(()=>f.service.execute(f.target,permit));await assert.rejects(f.plan(),{code:'RESPONSE_UNCERTAIN'});
  await assert.rejects(f.target.client.request('FillCargoShipRequest',{shipIndex:1,cargoIndex:[1]},'FillCargoShipResponse',5,{mutate:true}),{code:'WRITE_UNCERTAIN'});
  f.target.client.onMessage(codec.encode('FillCargoShipResponse',0,{reward:{asset:[{type:1,id:'EXP',num:2},{type:1,id:'GOLD',num:3}]}}));assert.equal(f.history.list('A')[0].actions[0].result,'UNKNOWN');assert.equal(f.target.client.uncertainWrites.size,1);assert.equal(f.writes.length,1);
  restarted=fixture({historyFile:f.file});await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.writes.length,0);assert.equal(restarted.history.list('A')[0].actions[0].result,'UNKNOWN');assert.equal(restarted.history.list('A')[0].runBudget.resumable,false);
 }finally{await restarted?.cleanup();await f.cleanup();}
});

test('different Cargo ships share one displayed batch ledger and persist each cumulative debit before transport',async()=>{
 const f=fixture({ships:[ship(1),ship(2)]});try {
  const planned=await f.plan([fillId(1),fillId(2)]);assert.deepEqual(planned.resourceBudget,[{id:'木材',num:8}]);const result=await f.execute(planned);assert.equal(result.status.finalStatus,'SUCCESS');assert.equal(f.writes.length,2);assert.deepEqual(f.writes.map(item=>amount(item.durableBeforeWrite.runBudget.reserved.resources)),[4,8]);
  assert.deepEqual(result.record.actions.map(row=>amount(row.resourceReservation)),[4,8]);assert.equal(amount(result.record.actions[1].afterInventory),2);assert.equal(result.record.actions.every(row=>row.verification.status==='CONFIRMED'),true);
 }finally{await f.cleanup();}
});

for(const limit of [6,8])test('Cargo Workflow ACTION reuses registered Fleet and enforces cumulative '+limit+'-unit parent across ships',async()=>{
 const f=fixture({ships:[ship(1),ship(2)]});let runner;try {
  const graph={version:1,id:'cargo-workflow-'+limit,name:'Synthetic cargo workflow',budget:claims(limit),nodes:[{id:'s',type:'START'},{id:'a1',type:'ACTION',module:'fleet',parameters:{shipIndex:1,cargoIndex:1},selection:fillId(1)},{id:'v1',type:'VERIFY',module:'fleet'},{id:'a2',type:'ACTION',module:'fleet',parameters:{shipIndex:2,cargoIndex:1},selection:fillId(2)},{id:'v2',type:'VERIFY',module:'fleet'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a1'},{from:'a1',to:'v1'},{from:'v1',to:'a2'},{from:'a2',to:'v2'},{from:'v2',to:'z'}]};
  runner=createWorkflowRunner({operations:f.service,modules:GAMEPLAY_MODULES,getSession:id=>id==='A'?f.target:null,isCurrent:(account,generation,client)=>account===f.target&&account.generation===generation&&account.client===client,claim:(id,runId,options)=>f.service.claimWorkflow(f.target,runId,options)});
  const first=await runner.start('A',graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(first.plan.module,'fleet');assert.equal(first.plan.actions[0].actionId,fillId(1));assert.equal(f.writes.length,0);assert.equal(amount(first.runBudget.reserved.resources),0);
  assert.equal((await f.execute(first.plan)).status.finalStatus,'SUCCESS');assert.equal(f.writes.length,1);f.target.synthetic.stock.set('木材',1000);
  const second=await runner.resume();assert.equal(second.status,'AWAITING_AUTHORIZATION');assert.equal(second.plan.parentRunId,first.runId);assert.equal(second.plan.actions[0].actionId,fillId(2));assert.notEqual(second.plan.batchId,first.plan.batchId);assert.equal(amount(second.runBudget.reserved.resources),4);assert.equal(f.writes.length,1);
  let result;try{result=await f.execute(second.plan);}catch(error){assert.match(error.message,/预算|budget|限额|声明/i);}
  const finished=await runner.resume();if(limit===8){assert.equal(result.status.finalStatus,'SUCCESS');assert.equal(finished.status,'COMPLETED');assert.equal(f.writes.length,2);assert.equal(finished.trace.filter(row=>row.type==='VERIFY'&&row.result==='CONFIRMED').length,2);}else{assert.notEqual(result?.status.finalStatus,'SUCCESS');assert.equal(finished.status,'UNKNOWN');assert.equal(f.writes.length,1);}
  const budget=f.service.workflowBudget('A');assert.deepEqual(budget.limits,claims(limit));assert.equal(amount(budget.reserved.resources),limit===8?8:4);assert.equal(budget.state,'CLOSED');assert.equal(budget.resumable,false);
  for(const write of f.writes){assert.equal(write.durableBeforeWrite.runBudget.scope.runId,first.runId);assert.equal(write.durableBeforeWrite.module,'fleet');}
 }finally{runner?.stop();await runner?.settle();await f.cleanup();}
});
