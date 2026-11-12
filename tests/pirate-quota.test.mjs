import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { extractTables } from '../src/config.mjs';
import { collectState, ENTRY_QUERIES, formatState, summarize } from '../src/game.mjs';
import {
  calculatePirateQuota, observePirateMonthCards, observePirateQuotaClock,
  observedPirateQuota, pirateGameDay, pirateCounterDay, PIRATE_QUOTA_EVIDENCE,
} from '../src/pirate-quota.mjs';
import { loadProtocol } from '../src/proto.mjs';

const scope={accountId:'offline-quota',generation:4,connectionId:'offline-connection'};
const role={...scope,playerId:'9007199254740993',worldId:'9'};
const at=(date,radius=0)=>{const nowMs=Date.parse(date);return{reliable:true,earliestMs:nowMs-radius,nowMs,latestMs:nowMs+radius};};
const noon=at('2026-11-12T05:00:00Z',100);
const expiry=Math.floor(noon.nowMs/1000);
const card=(type,endTime)=>({type,endTime});
const cards=(rows=[card(1,-1),card(2,0)])=>({status:'OBSERVED',reliable:true,source:'MonthCardResponse',cards:rows,sourceAt:20,observedAt:22,...role});
const vip=(vipLevel=1)=>({status:'OBSERVED',reliable:true,source:'LoginResponse.playerInfo.vip',vipLevel,observedAt:22,...role});
const clock=(reading=noon,observedAt=22)=>({...reading,...scope,observedAt});
const facts=(overrides={})=>({monthCards:cards(),vipLevel:vip(),pirateReadStartClock:clock(noon,20),pirateReadEndClock:clock(noon,21),pirateClock:clock(),...overrides});
const cfg=()=>({tables:{
 PirateParamCfg:{data:[{paramName:'每日野怪扫荡次数',paramValue:10}]},
 VipLevelCfg:{data:[{level:1,effects:[['野怪扫荡次数',2],['普通点金次数',4]]},{level:2,effects:[['普通点金次数',5]]}]},
 MonthCardCfg:{data:[
  {id:'普通月卡',effectList:[['野怪扫荡次数',3],['野怪扫荡次数',1],['挂机金币提高',0.25]]},
  {id:'高级月卡',effectList:[['野怪扫荡次数',7]]},
 ]},
}});

test('fixed-config formula binds exact base and VIP rows and sums only active card effects',()=>{
 const config=cfg(),f=calculatePirateQuota({config,vipLevel:1,cards:[card(1,-1),card(2,0)],clock:noon});
 assert.deepEqual(f,{total:16,reason:null,breakdown:{base:10,vip:2,monthCards:4,byCard:[{type:1,endTime:-1,active:true,bonus:4},{type:2,endTime:0,active:false,bonus:0}]}});
 assert.equal(calculatePirateQuota({config,vipLevel:2,cards:[],clock:null}).total,10,'missing effect on an existing VIP row is zero');
 assert.equal(calculatePirateQuota({config,vipLevel:0,cards:[],clock:noon}).reason,'PIRATE_VIP_EFFECT_UNKNOWN','missing VIP level row is not a zero effect');
 assert.equal(calculatePirateQuota({config,vipLevel:1,cards:[card(2,expiry+1)],clock:noon}).total,19);
 assert.equal(calculatePirateQuota({config,vipLevel:1,cards:[card(2,expiry-1)],clock:noon}).total,12);
 assert.equal(calculatePirateQuota({config,vipLevel:1,cards:[card(2,expiry)],clock:noon}).reason,'PIRATE_MONTH_CARD_EXPIRY_UNCERTAIN');
 assert.equal(calculatePirateQuota({config,vipLevel:1,cards:[card(2,expiry)],clock:null}).reason,'PIRATE_CLOCK_UNKNOWN');
 assert.equal(calculatePirateQuota({config,vipLevel:1,cards:[card(2,expiry)],clock:at('2026-11-12T05:00:00Z')}).total,12,'exact expiry second is inactive');
});

test('unknown rows, inherited scalar defaults, duplicate VIP effects and overflow cannot invent a total',()=>{
 for(const bad of [null,[card(1,-2)],[card(3,-1)],[card(1,-1),card(1,0)],[{type:1}],[Object.create(card(1,0))],Array(1)]){
  assert.equal(calculatePirateQuota({config:cfg(),vipLevel:1,cards:bad,clock:noon}).total,null);
 }
 for(const change of [
  c=>c.tables.PirateParamCfg.data.push(c.tables.PirateParamCfg.data[0]),
  c=>c.tables.PirateParamCfg.data[0].paramValue='10',
  c=>c.tables.PirateParamCfg.data[0].paramValue=2147483647,
  c=>c.tables.VipLevelCfg.data[0].effects.push(['野怪扫荡次数',2]),
  c=>c.tables.MonthCardCfg.data[0].effectList[0][1]=1.5,
  c=>delete c.tables.MonthCardCfg,
 ]){
  const config=cfg();change(config);
  assert.equal(calculatePirateQuota({config,vipLevel:1,cards:[card(1,-1)],clock:noon}).total,null);
 }
});

test('actual fixed configuration is used, including VIP0 missing row and empty versus permanent cards',()=>{
 const tables=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));
 for(const rows of [[],[card(1,-1),card(2,-1)]]){
  const result=calculatePirateQuota({config:{tables},vipLevel:1,cards:rows,clock:noon});
  assert.equal(result.total,12);assert.equal(result.breakdown.monthCards,0);
 }
 assert.equal(calculatePirateQuota({config:{tables},vipLevel:0,cards:[],clock:noon}).total,null);
 assert.deepEqual(PIRATE_QUOTA_EVIDENCE.clockOffsetsMinutes,[480,540]);
});

test('game day requires agreement for all evidenced policies and the entire trusted clock interval',()=>{
 const day=(s,r)=>pirateGameDay(at(s,r));
 assert.deepEqual(day('2026-11-12T14:59:59Z'),{dayKey:'2026-11-12',reason:null});
 assert.equal(day('2026-11-12T15:00:00Z').reason,'PIRATE_DAY_POLICIES_DISAGREE');
 assert.equal(day('2026-11-12T15:45:00Z').reason,'PIRATE_DAY_POLICIES_DISAGREE');
 assert.deepEqual(day('2026-11-12T16:00:00Z'),{dayKey:'2026-11-13',reason:null});
 assert.equal(day('2026-11-12T16:00:00Z',100).reason,'PIRATE_DAY_BOUNDARY_UNCERTAIN');
 assert.equal(day('2026-11-12T15:00:00Z',100).reason,'PIRATE_DAY_BOUNDARY_UNCERTAIN');
 assert.equal(pirateGameDay({...noon,reliable:false}).reason,'PIRATE_CLOCK_UNKNOWN');
 assert.equal(pirateGameDay(noon,'UNKNOWN_BUILD').reason,'PIRATE_DAY_PROFILE_UNSUPPORTED');
 assert.equal(pirateCounterDay(at('2026-11-12T16:00:10.001Z')).reason,'PIRATE_DAY_BOUNDARY_UNCERTAIN');
 assert.equal(pirateCounterDay(at('2026-11-12T16:00:10.002Z')).dayKey,'2026-11-13');
});

test('observed used counts subtract only inside the same established game day',()=>{
 const current=observedPirateQuota(facts(),cfg(),3);
 assert.equal(current.totalSweeps,16);assert.equal(current.remainingSweeps,13);assert.equal(current.quotaDay,'2026-11-12');
 for(const patch of [
  {pirateReadStartClock:null},
  {pirateReadEndClock:clock(at('2026-11-12T15:30:00Z'),21)},
  {pirateReadStartClock:clock(at('2026-11-11T14:30:00Z'),20)},
  {pirateReadStartClock:clock(noon,25)},
  {pirateClock:clock(noon,30021)},
  {pirateReadStartClock:{...clock(noon,20),connectionId:'other'}},
  {pirateReadStartClock:clock(noon,'20')},
  {pirateReadStartClock:clock(at('2026-11-12T16:00:04Z'),20),pirateReadEndClock:clock(at('2026-11-12T16:00:05Z'),21),pirateClock:clock(at('2026-11-12T16:00:12Z'),22)},
 ]){
  const result=observedPirateQuota(facts(patch),cfg(),3);
  assert.equal(result.totalSweeps,16);assert.equal(result.remainingSweeps,null);
 }
 assert.equal(observedPirateQuota(facts(),cfg(),17).quotaReason,'PIRATE_USED_COUNT_EXCEEDS_TOTAL');
 assert.equal(observedPirateQuota(facts(),cfg(),undefined).quotaReason,'PIRATE_USED_COUNT_UNKNOWN');
 for(const patch of [{monthCards:cards([])},{monthCards:{...cards(),worldId:'10'}},{vipLevel:{...vip(),status:'CURRENT'}},{vipLevel:{...vip(),source:'CACHED_CONFIG'}},{monthCards:{...cards(),sourceAt:23}}]){
  const result=observedPirateQuota(facts(patch),cfg(),0);
  if(patch.monthCards?.cards?.length===0) assert.equal(result.remainingSweeps,12);else assert.equal(result.totalSweeps,null);
 }
});

test('card and clock observations preserve real source time and reject changed connection or foreign trust',()=>{
 const current={...cards(),status:'CURRENT',sourceAt:20};
 const client={factContext:{...scope},readMonthCards:()=>current,gameClock:{read:()=>({...noon,status:'TRUSTED',source:'PingResponse.serverTimestamp',...scope})}};
 assert.equal(observePirateMonthCards(client,scope,50).sourceAt,20);
 assert.equal(observePirateMonthCards(client,scope,50).observedAt,50);
 assert.equal(observePirateMonthCards(client,scope,19).status,'UNKNOWN');
 assert.equal(observePirateQuotaClock(client,scope).connectionId,scope.connectionId);
 client.gameClock.read=()=>({...noon,status:'TRUSTED',source:'PingResponse.serverTimestamp',...scope,accountId:'other'});
 assert.equal(observePirateQuotaClock(client,scope),null);
 client.readMonthCards=()=>{client.factContext.connectionId='other';return current;};
 assert.equal(observePirateMonthCards(client,scope,50).status,'UNKNOWN');
});

test('the unchanged 48-query collector observes total and remaining and drops day-boundary ambiguity',async()=>{
 const protocol=loadProtocol();
 for(const crossing of [false,true]){
  const sent=[];let reading=noon;const receivedAt=Date.now()-10;
  const client={
   factContext:{...scope},
   readVipLevel:()=>({...vip(),status:'CURRENT'}),
   readMonthCards:()=>({...cards(),status:'CURRENT',sourceAt:receivedAt}),
   gameClock:{read:()=>({...reading,status:'TRUSTED',source:'PingResponse.serverTimestamp',...scope})},
   async request(name,_body,response){
    sent.push(name);
    if(name==='AllPirateRequest'&&crossing)reading=at('2026-11-12T15:30:00Z');
    return protocol[response].decode(protocol[response].encode(name==='AllPirateRequest'?{sweepTimes:2}:{}).finish());
   },
  };
  const snapshot=await collectState(client,protocol),view=summarize(snapshot,{config:cfg()});
  assert.deepEqual(sent,ENTRY_QUERIES.map(row=>row.name));assert.equal(sent.length,48);
  assert.equal(view.pirateSweep.totalSweeps,16);assert.equal(view.pirateSweep.remainingSweeps,crossing?null:14);
  assert.match(formatState(view),/扫荡额度来源：基础 10，VIP 2，有效月卡 4/);
  assert.equal(Object.hasOwn(view.pirateSweep,'executable'),false);
 }
});