import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/proto.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { stockMatchesDelta } from '../src/naval-facts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { treasureModule, treasureView, planTreasure, verifyTreasure, surveyTreasure } from '../src/treasure.mjs';
const config={tables:{WorldParamCfg:{data:[{paramName:'进攻宝藏消耗汽油',paramValue:500}]},GameplayOpenCfg:{data:[{gameplay:'世界宝藏',openDays:[3,1,1]}]}}};
const enabled={enabled:true,dispatch:true};
const gameClock={read:()=>({status:'TRUSTED',reliable:true,nowMs:300000000,earliestMs:300000000,latestMs:300000000})};
function facts(){return {now:300000,config,player:{worldId:2001000000},parameters:{},stockReliable:true,stock:new Map([['汽油',2000]]),fleetReliable:true,treasureReliable:true,statsReliable:true,protocolReady:true,todayRewardTimes:0,totalRewardTimes:3,season:{reliable:true,startTime:100000,endTime:1000000},fleets:[{buildingId:'fleet-a',state:1,durability:1900,maxDura:2000,treasureLootUid:0,repairing:null,autoFight:{isOn:false,todayTimes:0}}],treasures:[{uid:7,color:5,ownerGuildIdx:0,ownerFleetNum:0,progress:0,gridIdx:1}]};}
function candidate(f=facts(),extra={}){return treasureView(f,{moduleConfig:enabled,...extra}).candidates[0];}
test('treasure defaults disabled and explicit selection required',()=>{
 const f=facts();assert.equal(treasureModule.defaultConfig.enabled,false);assert.equal(treasureView(f).candidates[0].decision,'BLOCKED');assert.deepEqual(planTreasure(f,{moduleConfig:enabled}).actions,[]);
 const op=candidate(f);assert.equal(op.decision,'READY');assert.deepEqual(op.costs,[{id:'汽油',num:500}]);const plan=planTreasure(f,{moduleConfig:enabled,selections:[op.actionId]});assert.equal(plan.actions.length,1);assert.equal(op.action.response,null);assert.equal(op.parameters.uid,7);
});
test('treasure blocks every unreliable prerequisite',()=>{
 for(const key of ['stockReliable','fleetReliable','treasureReliable','statsReliable','protocolReady']){const f=facts();f[key]=false;assert.equal(candidate(f).decision,'BLOCKED',key)}
 for(const mutate of [f=>f.statsReliable=false,f=>f.season.reliable=false,f=>f.season.endTime=301000,f=>f.todayRewardTimes=3,f=>f.config={tables:{}},f=>f.stock.set('汽油',499)]){const f=facts();mutate(f);assert.equal(candidate(f).decision,'BLOCKED')}
});
test('contested target is blocked without opponent authority',()=>{const f=facts();f.treasures[0].ownerGuildIdx=9;assert.equal(candidate(f).reason,'CONTESTED_TARGET_UNVERIFIED')});
test('treasure never guesses unavailable fleets or ignores durability',()=>{
 for(const mutate of [f=>f.fleets[0].durability=1,f=>f.fleets[0].maxDura=null,f=>f.fleets[0].state=2,f=>f.fleets[0].treasureLootUid=99]){const f=facts();mutate(f);assert.equal(candidate(f).decision,'BLOCKED')}
 assert.equal(candidate(facts(),{parameters:{uid:7,fleetBuildingIds:['unknown']}}).decision,'BLOCKED');
});
test('treasure parameters and rules cannot inject transport or exceed limits',()=>{
 for(const parameters of [{request:'x'},{costs:[]},{uid:0},{fleetBuildingIds:['a','a']}])assert.throws(()=>candidate(facts(),{parameters}),{code:'INVALID_INPUT'});
 assert.throws(()=>candidate(facts(),{moduleConfig:{...enabled,maxFleets:11}}),{code:'INVALID_INPUT'});
});
test('treasure verify requires exact post-read fleet uid; dispatch is not victory',()=>{
 const before=facts(),op=candidate(before),after=facts();after.fleets[0].state=2;after.fleets[0].treasureLootUid=7;after.stock.set('汽油',1500);
 assert.equal(verifyTreasure(op,before,after).confirmed,true);after.fleets[0].treasureLootUid=8;assert.equal(verifyTreasure(op,before,after).confirmed,false);after.fleetReliable=false;assert.equal(verifyTreasure(op,before,after).confirmed,false);
});
test('treasure identity binds target state, fleets and daily facts',()=>{const before=facts(),a=candidate(before);before.todayRewardTimes=1;assert.notEqual(a.identity,candidate(before).identity);before.treasures[0].progress=10;assert.notEqual(a.identity,candidate(before).identity)});
test('treasure survey issues only authoritative read requests and preserves missing sources',async()=>{
 const responses={TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:facts().treasures},MyFleetsRequest:{fleets:facts().fleets},SeasonRankInfoRequest:{startTime:100000,endTime:1000000},AllItemRequest:{items:[{itemId:'汽油',num:2000}]},AllResourceRequest:{list:[]}};
 const protocol=Object.fromEntries(Object.keys(responses).flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}],['TreasureLootSendFleetsRequest',{}]]));let reads=[];
 const f=await surveyTreasure({connected:true,gameClock,request:async(name)=>{reads.push(name);return responses[name]}},protocol,{config,player:{worldId:2001000000}});assert.equal(f.stockReliable,true);assert.equal(f.fleetReliable,true);assert.equal(reads.length,6);assert.ok(reads.every(name=>name!=='TreasureLootSendFleetsRequest'));
});

test('selected treasure UID queries authoritative rank and defence without any write',async()=>{
 const f=facts(),responses={TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:f.treasures},MyFleetsRequest:{fleets:f.fleets},SeasonRankInfoRequest:{startTime:100000,endTime:1000000},AllItemRequest:{items:[{itemId:'汽油',num:2000}]},AllResourceRequest:{list:[]},TreasureLootRankRequest:{items:[{playerId:'9007199254740993',nickname:'fixture',rank:1}]},TreasureLootDefenceRequest:{fleets:[]}};
 const protocol=Object.fromEntries(Object.keys(responses).flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}]])),calls=[];protocol.TreasureLootSendFleetsRequest={};
 const surveyed=await surveyTreasure({connected:true,gameClock,request:async(name,body)=>{calls.push([name,body]);return responses[name]}},protocol,{config,player:f.player,parameters:{uid:7}});
 assert.deepEqual(calls.filter(([name])=>/RankRequest|DefenceRequest/.test(name)).map(([name,body])=>[name,body]),[['TreasureLootRankRequest',{uid:7}],['TreasureLootDefenceRequest',{uid:7}]]);
 assert.equal(surveyed.targetDetails.uid,7);assert.equal(surveyed.targetDetails.rankReliable,true);assert.equal(surveyed.targetDetails.defenceReliable,true);assert.equal(surveyed.targetDetails.rank[0].playerId,'9007199254740993');assert.equal(candidate(surveyed,{parameters:{uid:7}}).decision,'READY');
 surveyed.targetDetails.defence.push({name:'synthetic defender'});assert.equal(candidate(surveyed,{parameters:{uid:7}}).reason,'DEFENCE_PRESENT');surveyed.targetDetails.defenceReliable=false;assert.equal(candidate(surveyed,{parameters:{uid:7}}).reason,'TARGET_DETAILS_UNRELIABLE');
});

test('treasure dispatch refuses enabled or unknown automatic fighting even during idle',()=>{for(const autoFight of [{isOn:true},null,undefined,{}]){const f=facts();f.fleets[0].autoFight=autoFight;assert.equal(candidate(f).decision,'BLOCKED');assert.deepEqual(planTreasure(f,{moduleConfig:enabled,selections:[candidate(f).actionId]}).actions,[])}});
test('treasure execution fresh plan refuses newly enabled or missing auto fight before any request',async()=>{for(const autoFight of [{isOn:true},null]){const f=facts();f.parameters={uid:7,fleetBuildingIds:['fleet-a']};f.targetDetails={uid:7,rankReliable:true,defenceReliable:true,rank:[],defence:[]};const operation=candidate(f,{parameters:f.parameters});assert.equal(operation.decision,'READY');f.fleets[0].autoFight=autoFight;let requests=0;const client={connected:true,request(){requests++;throw Error('must not query')},sendWatch(){requests++;throw Error('must not dispatch')}};const result=await executeBusinessOperation(client,{},operation,{adapter:{...treasureModule,survey:async()=>f},moduleConfig:enabled,allowMutate:true});assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(requests,0)}});


test('treasure season dispatch never trusts absent clock or legacy default offset and cannot be repaired by editing now',async()=>{
 const f=facts(),responses={TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:f.treasures},MyFleetsRequest:{fleets:f.fleets},SeasonRankInfoRequest:{startTime:100000,endTime:1000000},AllItemRequest:{items:[{itemId:'汽油',num:2000}]},AllResourceRequest:{list:[]}};
 const protocol=Object.fromEntries(Object.keys(responses).flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}]]));protocol.TreasureLootSendFleetsRequest={};
 const client={connected:true,serverClockOffsetMs:0,request:async name=>responses[name]},surveyed=await surveyTreasure(client,protocol,{config,player:f.player});
 assert.equal(surveyed.now,null);assert.equal(surveyed.gameTime.reliable,false);assert.equal(candidate({...surveyed,now:f.now}).reason,'SEASON_UNKNOWN');
 client.gameClock=gameClock;assert.equal(candidate(await surveyTreasure(client,protocol,{config,player:f.player})).decision,'READY');
});

test('treasure opening and closing boundaries require entire trusted uncertainty interval to remain open',()=>{
 const f=facts(),opens=f.season.startTime+2*86400,closes=f.season.endTime-3600;
 function set(now,earliest,latest){f.now=now;f.gameTime={status:'TRUSTED',reliable:true,nowMs:now*1000,earliestMs:earliest*1000,latestMs:latest*1000};}
 set(opens,opens-1,opens+1);assert.equal(candidate(f).reason,'SEASON_UNKNOWN');
 set(opens+1,opens,opens+2);assert.equal(candidate(f).decision,'READY');
 set(closes-1,closes-2,closes);assert.equal(candidate(f).reason,'SEASON_UNKNOWN');
 set(closes+1,closes,closes+2);assert.equal(candidate(f).reason,'SEASON_CLOSED');
});

test('treasure view exposes original source reliability independently and never upgrades missing flags',()=>{
 const f=facts();assert.deepEqual(treasureView(f).reliability,{treasures:true,fleets:true,stock:true,stats:true});
 for(const [flag,key]of [['treasureReliable','treasures'],['fleetReliable','fleets'],['stockReliable','stock'],['statsReliable','stats']]){const f=facts();delete f[flag];assert.equal(treasureView(f).reliability[key],false);}
});

for(const [name,mutate]of [
 ['fuel unchanged',f=>f.stock.set('汽油',2000)],['too little debit',f=>f.stock.set('汽油',1501)],['excess debit',f=>f.stock.set('汽油',1499)],
 ['unrelated income',f=>f.stock.set('木材',1)],['missing fuel',f=>f.stock.delete('汽油')],['invalid fuel',f=>f.stock.set('汽油',null)],['unknown inventory',f=>f.stockReliable=false],
])test('treasure association without exact declared inventory remains unconfirmed '+name,()=>{
 const before=facts(),op=candidate(before),after=facts();after.fleets[0].state=2;after.fleets[0].treasureLootUid=7;after.stock.set('汽油',1500);mutate(after);
 assert.equal(verifyTreasure(op,before,after).confirmed,false);
});
test('treasure full inventory permits exact depletion and rejects unrelated losses or incomplete cost metadata',()=>{
 const before=facts();before.stock.set('汽油',500);before.stock.set('木材',9);const op=candidate(before),after=structuredClone(before);after.stock.delete('汽油');after.fleets[0].treasureLootUid=7;after.fleets[0].state=2;
 assert.equal(verifyTreasure(op,before,after).confirmed,true);after.stock.set('木材',8);assert.equal(verifyTreasure(op,before,after).confirmed,false);after.stock.set('木材',9);
 for(const costs of [undefined,[],[{id:'汽油',num:null}],[{id:'木材',num:500}],[{id:'汽油',num:500},{id:'木材',num:0}]])assert.equal(verifyTreasure({...op,costs},before,after).confirmed,false);
});


test('shared original fleet delta supports exact costs, rewards and zeros without accepting missing facts',()=>{
 const before=new Map([['汽油',2000],['木材',5]]),after=new Map([['汽油',1500],['木材',7]]),costs=[{id:'汽油',num:500}],rewards=[{id:'木材',num:2}];
 assert.equal(stockMatchesDelta(before,after,costs,rewards),true);assert.equal(stockMatchesDelta(before,after,[],rewards),false);
 for(const invalid of [null,new Map([['汽油',null]]),new Map([['汽油',Number.MAX_SAFE_INTEGER+1]]),new Map([['',1]])])assert.equal(stockMatchesDelta(invalid,after,costs,rewards),false);
 for(const invalid of [undefined,null,[{id:'汽油',num:-1}],[{id:'汽油',num:'500'}],[{id:'汽油',num:500.5}]])assert.equal(stockMatchesDelta(before,after,invalid,rewards),false);
 const shared={id:'汽油',num:500};assert.equal(stockMatchesDelta(before,before,[shared],[shared]),true);assert.equal(stockMatchesDelta(new Map(),new Map([['汽油',Number.MAX_SAFE_INTEGER]]),[],[{id:'汽油',num:Number.MAX_SAFE_INTEGER},{id:'汽油',num:1}]),false);
});
const offlineProtocol=loadProtocol(),copy=value=>structuredClone(value);
function treasureServiceFixture(t,{outcome='SUCCESS',file=null,mutateWrite=null,batch=null}={}) {
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-treasure-net-')):null;file??=path.join(dir,'history.json');
 const history=createExecutionHistory({file}),journal=[],durable={...history,put(record){journal.push(copy(record));return history.put(record);}},before=facts();
 const state={fuel:2000,items:[{itemId:'木材',num:9}],fleets:copy(before.fleets),writes:[],reads:[],afterWrite:false,onRead:null};
 const moduleConfig={...enabled,...(batch?{maxFleets:batch.per??1}:{})},currentConfig=copy(config);state.defences=new Map();state.ranks=new Map();
 if(batch){currentConfig.tables.WorldParamCfg.data[0].paramValue=batch.unit??500;state.fuel=batch.count*(batch.per??1)*(batch.unit??500);before.treasures=Array.from({length:batch.count},(_,i)=>({...copy(before.treasures[0]),uid:7+i,gridIdx:i+1}));state.fleets=Array.from({length:batch.count*(batch.per??1)},(_,i)=>({...copy(before.fleets[0]),buildingId:'batch-fleet-'+i}));}
 const client={connected:true,gameClock,pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),factContext:{accountId:'treasure-A',generation:3,connectionId:'treasure-offline'},
  markUnverifiedWrite(name,body){this.uncertainWrites.set(JSON.stringify([name,body]),true);},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify([name,body]));},
  async request(name,body,response,_timeout,options){assert.equal(options?.mutate,undefined);state.reads.push(name);await state.onRead?.(name,body);let value;
   if(name==='TreasureLootStatsRequest')value={stats:[],nextRefreshTime:400000,todayRewardTimes:0,totalRewardTimes:3};
   else if(name==='TreasureLootListRequest')value={treasure:before.treasures.map(row=>({...row,reward:{asset:[]}}))};
   else if(name==='MyFleetsRequest')value={fleets:state.fleets};
   else if(name==='SeasonRankInfoRequest')value={startTime:100000,endTime:1000000};
   else if(name==='AllItemRequest')value={items:[{itemId:'汽油',num:state.fuel},...state.items]};
   else if(name==='AllResourceRequest')value={list:[]};
   else if(name==='TreasureLootRankRequest')value={items:state.ranks.get(body.uid)??[]};else if(name==='TreasureLootDefenceRequest')value={fleets:state.defences.get(body.uid)??[]};else throw Error('unexpected read '+name);
   return offlineProtocol[response].decode(offlineProtocol[response].encode(value).finish());
  },
  async sendWatch(name,body,options){options.beforeDispatch?.();offlineProtocol[name].decode(offlineProtocol[name].encode(body).finish());assert.equal(name,'TreasureLootSendFleetsRequest');state.writes.push({name,body:copy(body),durable:copy(journal.at(-1))});state.afterWrite=true;
    if(batch){if(batch.stop&&state.writes.length===2)return {status:batch.stop==='refusal'?'REJECTED':'UNKNOWN'};for(const id of body.fleetBuildingIds){const fleet=state.fleets.find(f=>f.buildingId===id);assert.ok(fleet,id);fleet.state=2;fleet.treasureLootUid=body.uid;}state.fuel-=body.fleetBuildingIds.length*(batch.unit??500);await mutateWrite?.({state,client,session});return {status:'UNKNOWN'};}

   if(outcome!=='REJECTED'){state.fleets[0].state=2;state.fleets[0].treasureLootUid=7;if(outcome==='SUCCESS')state.fuel-=500;}
   await mutateWrite?.({state,client,session});return {status:outcome==='REJECTED'?'REJECTED':'UNKNOWN'};
  }
 };
 const session={id:'treasure-A',client,player:{playerId:'9007199254740993',worldId:2001000000},generation:3,connectionId:'treasure-offline',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol:offlineProtocol,history:durable,modules:GAMEPLAY_MODULES,getConfig:()=>currentConfig,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}}),moduleSettings:{get:()=>({config:moduleConfig})}});
 const parameters={uid:7,fleetBuildingIds:batch?state.fleets.slice(0,batch.per??1).map(f=>f.buildingId):['fleet-a']};
 async function plan(){const view=await service.surveyModule(session,'treasure',parameters),row=view.view.candidates.find(row=>row.executable);assert.ok(row,JSON.stringify(view.view));return service.plan(session,{module:'treasure',mode:'Manual',parameters,selections:[row.actionId]});}
 function authorize(plan){return service.authorize(session,{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});}
 async function run(){const permit=authorize(await plan());service.execute(session,permit);await service.settle(session.id);return history.originalRecords(session.id)[0];}
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}});
 return {session,service,history,client,state,journal,plan,authorize,run,file,before,moduleConfig,currentConfig};
}
test('treasure Service caches observed facts with live runtime config methods without retaining the config API',async t=>{
 const f=treasureServiceFixture(t);f.currentConfig.resourceName=id=>String(id);f.currentConfig.itemName=id=>String(id);
 const observed=await f.service.surveyModule(f.session,'treasure',{});assert.equal(observed.view.reliability.treasures,true);assert.equal(observed.view.treasures[0].uid,7);assert.equal(Object.hasOwn(observed.view,'config'),false);assert.doesNotThrow(()=>structuredClone(observed));
 const plan=await f.plan();assert.equal(plan.actions.length,1);assert.deepEqual(plan.actions[0].costs,[{id:'汽油',num:500}]);assert.equal(typeof f.currentConfig.resourceName,'function');assert.equal(typeof f.currentConfig.itemName,'function');assert.equal(f.state.writes.length,0);
});
for(const outcome of ['SUCCESS','UNKNOWN','REJECTED'])test('original Service persists declared treasure debit and authoritative result '+outcome,async t=>{
 const f=treasureServiceFixture(t,{outcome}),record=await f.run();assert.equal(record.finalStatus,outcome);assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0].body,{uid:7,fleetBuildingIds:['fleet-a']});
 const intent=f.journal.find(row=>row.actions[0].stages?.some(stage=>stage.stage==='DISPATCH_INTENT'));assert.ok(intent);assert.equal(intent.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(intent.runBudget.reserved.resources,[{id:'汽油',num:500}]);assert.deepEqual(record.resourceBudget,[{id:'汽油',num:500}]);
 const restarted=treasureServiceFixture(t,{file:f.file});assert.equal(restarted.state.writes.length,0);
 if(outcome==='SUCCESS'){assert.equal(record.actions[0].verification.status,'CONFIRMED');assert.equal(f.client.uncertainWrites.size,0);assert.equal(record.actions[0].beforeInventory.find(row=>row.id==='汽油').num,2000);assert.equal(record.actions[0].afterInventory.find(row=>row.id==='汽油').num,1500);assert.equal(createExecutionHistory({file:f.file}).list('treasure-A')[0].finalStatus,'SUCCESS');}
 else{await assert.rejects(restarted.plan(),error=>['RECOVERY_UNCERTAIN','REJECTION_MEMORY_ACTIVE'].includes(error.code));assert.equal(restarted.state.writes.length,0);}
});
for(const [label,mutate]of [['partial debit',({state})=>state.fuel=1750],['excess debit',({state})=>state.fuel=1499],['extra income',({state})=>state.items.push({itemId:'loot',num:1})],['missing fuel count',({state})=>state.fuel=null]])test('treasure Service leaves unconfirmed inventory UNKNOWN and never replays '+label,async t=>{
 const f=treasureServiceFixture(t,{mutateWrite:mutate}),record=await f.run();assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].verification.status,'UNCONFIRMED');assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,1);await assert.rejects(f.plan());assert.equal(f.state.writes.length,1);
});
for(const field of ['generation','connectionId','playerId','worldId'])test('late treasure observation cannot confirm a different execution identity '+field,async t=>{
 const f=treasureServiceFixture(t,{mutateWrite:({session})=>{if(field==='generation')session.generation++;else if(field==='connectionId')session.connectionId='changed';else session.player[field]='changed';}}),record=await f.run();assert.equal(record.finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(record.executionContext.accountId,'treasure-A');
 const other={...f.session,id:'treasure-B',connectionId:'other-offline'};assert.equal(f.service.history(other.id).runs.length,0);
});
test('treasure shared preflight rejects changed fuel and costs before dispatch',async t=>{
 const f=treasureServiceFixture(t),plan=await f.plan(),permit=f.authorize(plan);f.state.fuel=499;f.service.execute(f.session,permit);await f.service.settle(f.session.id);assert.equal(f.state.writes.length,0);assert.equal(f.history.originalRecords(f.session.id)[0].finalStatus,'NOT_EXECUTED');
});


test('treasure survey reuses complete original inventory parser and cannot sum duplicate or default balances',async()=>{
 const before=facts(),responses={TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:before.treasures},MyFleetsRequest:{fleets:before.fleets},SeasonRankInfoRequest:{startTime:100000,endTime:1000000},AllItemRequest:{items:[{itemId:'汽油',num:2000}]},AllResourceRequest:{list:[]}};
 const protocol=Object.fromEntries(Object.keys(responses).flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}]]));protocol.TreasureLootSendFleetsRequest={};
 for(const mutate of [r=>r.AllItemRequest.items.push({itemId:'汽油',num:500}),r=>delete r.AllItemRequest.items[0].num,r=>r.AllItemRequest.items.push({itemId:'GOLD',num:1}),r=>r.AllResourceRequest.list.push({res:3,amount:1},{res:3,amount:1}),r=>r.AllItemRequest.items=Array(1)]){
  const raw=copy(responses);mutate(raw);if(raw.AllItemRequest.items.some(row=>row?.itemId==='GOLD'))raw.AllResourceRequest.list=[{res:3,amount:1}];
  const surveyed=await surveyTreasure({connected:true,gameClock,request:async name=>raw[name]},protocol,{config,player:before.player});assert.equal(surveyed.stockReliable,false);assert.equal(candidate(surveyed).reason,'FACTS_UNRELIABLE');
 }
});
test('treasure verification retains original zero-cost and multi-fleet cost semantics',()=>{
 for(const unit of [0,500]){
  const before=facts();before.config=copy(config);before.config.tables.WorldParamCfg.data[0].paramValue=unit;before.fleets.push({...copy(before.fleets[0]),buildingId:'fleet-b'});
  const op=candidate(before,{moduleConfig:{...enabled,maxFleets:2}});assert.deepEqual(op.costs,[{id:'汽油',num:unit*2}]);const after=copy(before);after.stock.set('汽油',2000-unit*2);for(const fleet of after.fleets){fleet.state=2;fleet.treasureLootUid=7;}
  assert.equal(verifyTreasure(op,before,after).confirmed,true);after.stock.set('汽油',1999-unit*2);assert.equal(verifyTreasure(op,before,after).confirmed,false);
 }
});

async function treasureBatchInput(f,count,per=1){
 const read=await f.service.surveyModule(f.session,'treasure',{}),p=read.view.preparation;
 return {targets:Array.from({length:count},(_,i)=>{const uid=7+i,ids=f.state.fleets.slice(i*per,(i+1)*per).map(f=>f.buildingId);return {uid,fleetBuildingIds:ids,expectedDispatch:{targetHash:p.targets.find(t=>t.uid===uid).targetHash,fleetHashes:ids.map(id=>p.fleets.find(f=>f.buildingId===id).fleetHash)}};}),maxDurationMs:60000};
}
async function treasureBatchRunner(t,f){const {createWorkflowRunner}=await import('../src/workflow.mjs'),runner=createWorkflowRunner({operations:f.service,modules:GAMEPLAY_MODULES,getSession:()=>f.session,isCurrent:(s,g,c)=>s===f.session&&s.generation===g&&s.client===c,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options)});t.after(async()=>{runner.stop();await runner.settle();});return runner;}
for(const count of [1,10])for(const per of [1,2,10])test('prepared treasure Service dispatches '+count+' targets with '+per+' distinct fleets each',async t=>{
 const f=treasureServiceFixture(t,{batch:{count,per}}),input=await treasureBatchInput(f,count,per),p=await f.service.prepareTreasureSource(f.session,input),runner=await treasureBatchRunner(t,f);
 assert.deepEqual(p.budget,{resources:[{id:'汽油',num:count*per*500}],quotas:[],uids:input.targets.flatMap(t=>[{type:'treasure',id:String(t.uid)},...t.fleetBuildingIds.map(id=>({type:'fleet',id}))])});assert.equal(f.state.writes.length,0);assert.equal(f.history.list(f.session.id).length,0);let run=await runner.start(f.session.id,p.graph);const batchIds=new Set();
 for(let i=0;i<count;i++){assert.equal(run.status,'AWAITING_AUTHORIZATION',JSON.stringify(run));assert.equal(f.state.writes.length,i);assert.deepEqual(run.plan.actions[0].parameters,input.targets[i]);batchIds.add(run.plan.batchId);const permit=f.authorize(run.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);const record=f.history.list(f.session.id)[0];assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record));assert.equal(record.actions[0].verification.status,'CONFIRMED');assert.equal(f.state.writes[i].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.throws(()=>f.service.execute(f.session,permit));run=await runner.resume();}
 assert.equal(run.status,'COMPLETED');assert.equal(run.runBudget.state,'CLOSED');assert.equal(batchIds.size,count);assert.equal(f.state.fuel,0);assert.equal(f.history.list(f.session.id).length,count);assert.deepEqual(f.state.items,[{itemId:'木材',num:9}]);assert.deepEqual(f.state.writes.map(w=>w.body),input.targets.map(({uid,fleetBuildingIds})=>({uid,fleetBuildingIds})));assert.equal(f.before.treasures.every(t=>t.ownerGuildIdx===0&&t.ownerFleetNum===0),true);
 const reads=f.state.reads.length,bytes=fs.readFileSync(f.file,'utf8');await assert.rejects(runner.resume(),{code:'WORKFLOW_INVALID'});assert.equal(f.state.reads.length,reads);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
});
for(const count of [1,10])test('prepared treasure zero-cost contract keeps fixed target and fleet UID '+count,async t=>{
 const f=treasureServiceFixture(t,{batch:{count,per:2,unit:0}}),input=await treasureBatchInput(f,count,2),p=await f.service.prepareTreasureSource(f.session,input),runner=await treasureBatchRunner(t,f);assert.deepEqual(p.budget.resources,[]);assert.equal(p.budget.uids.length,count*3);let run=await runner.start(f.session.id,p.graph);
 for(let i=0;i<count;i++){assert.equal(run.status,'AWAITING_AUTHORIZATION',JSON.stringify(run));const permit=f.authorize(run.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);assert.equal(f.history.list(f.session.id)[0].finalStatus,'SUCCESS');run=await runner.resume();}assert.equal(run.status,'COMPLETED');assert.equal(f.state.fuel,0);assert.equal(f.state.writes.length,count);
});
for(const stop of ['unknown','refusal'])test('prepared treasure second '+stop+' stops third and restart cannot replay',async t=>{
 const f=treasureServiceFixture(t,{batch:{count:3,per:2,stop}}),input=await treasureBatchInput(f,3,2),p=await f.service.prepareTreasureSource(f.session,input),runner=await treasureBatchRunner(t,f);let run=await runner.start(f.session.id,p.graph);
 for(let i=0;i<2;i++){assert.equal(run.status,'AWAITING_AUTHORIZATION');const permit=f.authorize(run.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);run=await runner.resume();}assert.equal(run.status,stop==='unknown'?'UNKNOWN':'FAILED',JSON.stringify(run));assert.equal(f.state.writes.length,2);assert.equal(f.history.unresolved(f.session.id),stop==='unknown');assert.ok(f.state.fleets.slice(4).every(f=>f.state===1&&f.treasureLootUid===0));const bytes=fs.readFileSync(f.file,'utf8'),reads=f.state.reads.length;await assert.rejects(runner.resume(),{code:'WORKFLOW_INVALID'});assert.equal(f.state.reads.length,reads);
 const restarted=treasureServiceFixture(t,{file:f.file,batch:{count:3,per:2}}),target=input.targets[1];await assert.rejects(restarted.service.plan(restarted.session,{module:'treasure',mode:'Manual',parameters:target,selections:['treasure:dispatch:'+target.uid+':'+target.fleetBuildingIds.map(encodeURIComponent).join(',')]}),e=>['RECOVERY_UNCERTAIN','REJECTION_MEMORY_ACTIVE'].includes(e.code));assert.equal(restarted.state.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
});
for(const fault of ['fuel','reserve','target-hash','fleet-hash','occupied','defence','rank','season','target-finished','cost'])test('prepared treasure rejects incomplete batch before dispatch '+fault,async t=>{
 const f=treasureServiceFixture(t,{batch:{count:3,per:2}});if(fault==='reserve')f.moduleConfig.petrolReserve=1;const input=await treasureBatchInput(f,3,2);
 if(fault==='fuel')f.state.fuel--;if(fault==='target-hash')input.targets[1].expectedDispatch.targetHash='0'.repeat(64);if(fault==='fleet-hash')input.targets[1].expectedDispatch.fleetHashes[0]='0'.repeat(64);if(fault==='occupied')f.before.treasures[1].ownerGuildIdx=9;if(fault==='defence')f.state.defences.set(8,[{name:'synthetic defender',guildIdx:9,power:'1',multiple:1,isNpc:true}]);if(fault==='rank')f.client.request=new Proxy(f.client.request,{apply(fn,self,args){if(args[0]==='TreasureLootRankRequest')throw Error('synthetic unavailable rank');return Reflect.apply(fn,self,args);}});if(fault==='season')f.client.gameClock={read:()=>({status:'UNKNOWN',reliable:false})};if(fault==='target-finished')f.before.treasures[1].progress=100;if(fault==='cost')f.currentConfig.tables.WorldParamCfg.data=[];
 if(fault==='defence'){const read=await f.service.surveyModule(f.session,'treasure',input.targets[1]);assert.equal(read.view.targetDetails.defence[0].name,'synthetic defender');assert.equal(read.view.candidates[0].reason,'DEFENCE_PRESENT');}
 await assert.rejects(f.service.prepareTreasureSource(f.session,input),{code:'INVALID_INPUT'});assert.equal(f.state.writes.length,0);assert.equal(f.history.list(f.session.id).length,0);
});
test('prepared treasure schemas reject sparse accessors duplicated targets and shared fleets before reads',async t=>{
 const f=treasureServiceFixture(t,{batch:{count:2}}),input=await treasureBatchInput(f,2),readCount=f.state.reads.length;let called=0;const getter={};Object.defineProperty(getter,'uid',{enumerable:true,get(){called++;return 7;}});const shared={...input.targets[1],fleetBuildingIds:input.targets[0].fleetBuildingIds};
 for(const targets of [[],Array(1),[getter],[null],[undefined],[input.targets[0],input.targets[0]],[input.targets[0],shared],[{...input.targets[0],request:'TreasureLootSendFleetsRequest'}],Array(11).fill(input.targets[0])])await assert.rejects(f.service.prepareTreasureSource(f.session,{targets,maxDurationMs:60000}),{code:'INVALID_INPUT'});assert.equal(called,0);assert.equal(f.state.reads.length,readCount);assert.equal(f.state.writes.length,0);assert.equal(f.history.list(f.session.id).length,0);
});

for(const fault of ['partial-group','wrong-target','extra-income','wrong-fuel'])test('prepared treasure group stays UNKNOWN and stops later targets after '+fault,async t=>{
 const f=treasureServiceFixture(t,{batch:{count:3,per:2},mutateWrite:({state})=>{if(fault==='partial-group'){state.fleets[1].state=1;state.fleets[1].treasureLootUid=0;}if(fault==='wrong-target')state.fleets[1].treasureLootUid=8;if(fault==='extra-income')state.items.push({itemId:'synthetic-loot',num:1});if(fault==='wrong-fuel')state.fuel++;}}),input=await treasureBatchInput(f,3,2),p=await f.service.prepareTreasureSource(f.session,input),runner=await treasureBatchRunner(t,f);let run=await runner.start(f.session.id,p.graph);const permit=f.authorize(run.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);run=await runner.resume();assert.equal(run.status,'UNKNOWN',JSON.stringify(run));const record=f.history.list(f.session.id)[0];assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].verification.status,'UNCONFIRMED');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.ok(f.state.fleets.slice(2).every(f=>f.state===1&&f.treasureLootUid===0));assert.deepEqual(record.runBudget.reserved.uids,p.steps[0].budgetClaims.uids);assert.throws(()=>f.service.execute(f.session,permit));
});
for(const fault of ['generation','world','configuration','abort'])test('prepared treasure shared read source rejects '+fault+' change before preparation can publish',async t=>{
 const f=treasureServiceFixture(t,{batch:{count:2}}),input=await treasureBatchInput(f,2);let changed=false;f.state.onRead=n=>{if(n==='TreasureLootDefenceRequest'&&!changed){changed=true;if(fault==='generation')f.session.generation++;if(fault==='world')f.session.player.worldId++;if(fault==='configuration')f.currentConfig.tables.WorldParamCfg.data[0].paramValue++;if(fault==='abort')f.session.abort.abort();}};await assert.rejects(f.service.prepareTreasureSource(f.session,input),e=>['CANCELLED','ABORT_ERR','STOPPED'].includes(e.code));assert.equal(f.state.writes.length,0);assert.equal(f.history.list(f.session.id).length,0);
});
for(const fault of ['target','fleet','config','fuel','defence'])test('prepared treasure fresh second plan blocks changed '+fault+' without dispatch',async t=>{
 const f=treasureServiceFixture(t,{batch:{count:3,per:2}}),input=await treasureBatchInput(f,3,2),p=await f.service.prepareTreasureSource(f.session,input),runner=await treasureBatchRunner(t,f);let run=await runner.start(f.session.id,p.graph);const permit=f.authorize(run.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);assert.equal(f.history.list(f.session.id)[0].finalStatus,'SUCCESS');
 if(fault==='target')f.before.treasures[1].progress=1;if(fault==='fleet')f.state.fleets[2].durability--;if(fault==='config')f.currentConfig.tables.WorldParamCfg.data[0].paramValue++;if(fault==='fuel')f.state.fuel=0;if(fault==='defence')f.state.defences.set(8,[{name:'synthetic defender',guildIdx:9,power:'1',multiple:1,isNpc:true}]);run=await runner.resume();assert.equal(run.status,'FAILED',JSON.stringify(run));assert.equal(run.currentNode,'dispatch-1');assert.equal(run.plan,null);assert.equal(run.runBudget.state,'CLOSED');assert.deepEqual(run.runBudget.reserved.uids,p.steps[0].budgetClaims.uids);assert.equal(f.state.writes.length,1);assert.equal(f.history.list(f.session.id).length,1);assert.ok(f.state.fleets.slice(2).every(f=>f.state===1&&f.treasureLootUid===0));
});
