import test from 'node:test';
import assert from 'node:assert/strict';
import { treasureModule, treasureView, planTreasure, verifyTreasure, surveyTreasure } from '../src/treasure.mjs';
const config={tables:{WorldParamCfg:{data:[{paramName:'进攻宝藏消耗汽油',paramValue:500}]},GameplayOpenCfg:{data:[{gameplay:'世界宝藏',openDays:[3,1,1]}]}}};
const enabled={enabled:true,dispatch:true};
function facts(){return {now:300000,config,player:{worldId:2001000000},parameters:{},stockReliable:true,stock:new Map([['汽油',2000]]),fleetReliable:true,treasureReliable:true,statsReliable:true,protocolReady:true,todayRewardTimes:0,totalRewardTimes:3,season:{reliable:true,startTime:100000,endTime:1000000},fleets:[{buildingId:'fleet-a',state:1,durability:1900,maxDura:2000,treasureLootUid:0,repairing:null}],treasures:[{uid:7,color:5,ownerGuildIdx:0,ownerFleetNum:0,progress:0,gridIdx:1}]};}
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
 const before=facts(),op=candidate(before),after=facts();after.fleets[0].state=2;after.fleets[0].treasureLootUid=7;
 assert.equal(verifyTreasure(op,before,after).confirmed,true);after.fleets[0].treasureLootUid=8;assert.equal(verifyTreasure(op,before,after).confirmed,false);after.fleetReliable=false;assert.equal(verifyTreasure(op,before,after).confirmed,false);
});
test('treasure identity binds target state, fleets and daily facts',()=>{const before=facts(),a=candidate(before);before.todayRewardTimes=1;assert.notEqual(a.identity,candidate(before).identity);before.treasures[0].progress=10;assert.notEqual(a.identity,candidate(before).identity)});
test('treasure survey issues only authoritative read requests and preserves missing sources',async()=>{
 const responses={TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:facts().treasures},MyFleetsRequest:{fleets:facts().fleets},SeasonRankInfoRequest:{startTime:100000,endTime:1000000},AllItemRequest:{items:[{itemId:'汽油',num:2000}]},AllResourceRequest:{list:[]}};
 const protocol=Object.fromEntries(Object.keys(responses).flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}],['TreasureLootSendFleetsRequest',{}]]));let reads=[];
 const f=await surveyTreasure({connected:true,request:async(name)=>{reads.push(name);return responses[name]}},protocol,{config,player:{worldId:2001000000}});assert.equal(f.stockReliable,true);assert.equal(f.fleetReliable,true);assert.equal(reads.length,6);assert.ok(reads.every(name=>name!=='TreasureLootSendFleetsRequest'));
});

test('selected treasure UID queries authoritative rank and defence without any write',async()=>{
 const f=facts(),responses={TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:f.treasures},MyFleetsRequest:{fleets:f.fleets},SeasonRankInfoRequest:{startTime:100000,endTime:1000000},AllItemRequest:{items:[{itemId:'汽油',num:2000}]},AllResourceRequest:{list:[]},TreasureLootRankRequest:{items:[{playerId:'9007199254740993',nickname:'fixture',rank:1}]},TreasureLootDefenceRequest:{fleets:[]}};
 const protocol=Object.fromEntries(Object.keys(responses).flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}]])),calls=[];protocol.TreasureLootSendFleetsRequest={};
 const surveyed=await surveyTreasure({connected:true,request:async(name,body)=>{calls.push([name,body]);return responses[name]}},protocol,{config,player:f.player,parameters:{uid:7}});surveyed.now=f.now;
 assert.deepEqual(calls.filter(([name])=>/RankRequest|DefenceRequest/.test(name)).map(([name,body])=>[name,body]),[['TreasureLootRankRequest',{uid:7}],['TreasureLootDefenceRequest',{uid:7}]]);
 assert.equal(surveyed.targetDetails.uid,7);assert.equal(surveyed.targetDetails.rankReliable,true);assert.equal(surveyed.targetDetails.defenceReliable,true);assert.equal(surveyed.targetDetails.rank[0].playerId,'9007199254740993');assert.equal(candidate(surveyed,{parameters:{uid:7}}).decision,'READY');
 surveyed.targetDetails.defence.push({name:'synthetic defender'});assert.equal(candidate(surveyed,{parameters:{uid:7}}).reason,'DEFENCE_PRESENT');surveyed.targetDetails.defenceReliable=false;assert.equal(candidate(surveyed,{parameters:{uid:7}}).reason,'TARGET_DETAILS_UNRELIABLE');
});
