import test from 'node:test';
import assert from 'node:assert/strict';
import { allianceId, allianceModule, surveyAlliance, allianceView, planAlliance, verifyAlliance, ALLIANCE_DEFAULT_CONFIG, validateAllianceConfig, allianceHelpRules, allianceBudgetDay } from '../src/alliance.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';
const names=['GuildInfo','GuildMember','GuildAidList','MyGuildAid','GuildOrder','GuildCityInfo','CounterInfo','AllItem','AllResource','FinishGuildOrder','GotGuildWelfarePack'];
const protocol=Object.fromEntries([...names.flatMap(n=>[[n+'Request',{}],[n+'Response',{}]]),...['GuildAidHelpRequest','CancelMyGuildAidRequest','GotMyGuildAidRequest','GuildAidAskRequest'].map(n=>[n,{}])]);
const config={tables:{GuildParamCfg:{data:[{paramName:'每日求助次数上限',paramValue:20}]},GuildOrderNumCfg:{data:[{season:1,playerLevel:1,maxNum:-1},{season:2,playerLevel:1,maxNum:10},{season:2,playerLevel:25,maxNum:-1}]}}};
const moduleConfig={enabled:true,help:true,cancel:true,claimAid:true,ask:true,orders:true,welfare:true,fort:true,maxDailyHelps:10,maxActionsPerPlan:10,dailyBudgetItemIds:['小麦'],dailyBudgetQuantities:[10]};
const now=1800000000;
const gameClock={read:()=>({status:'TRUSTED',reliable:true,nowMs:now*1000,earliestMs:now*1000,latestMs:now*1000})};
function fake(overrides={}){const answers={GuildInfoRequest:{guild:{guildId:'10',welfarePack:[],gotWelfareTime:0}},GuildMemberRequest:{titleList:[{guildTitle:1,members:[{playerId:'2',nickname:'同名'},{playerId:'3',nickname:'同名'}]}]},GuildAidListRequest:{askItems:[{reqId:'9007199254740993',reqItemId:'小麦',asker:{playerId:'2'},askTime:now-2,endTime:now+1000}]},MyGuildAidRequest:{aids:[]},GuildOrderRequest:{order:{requirements:[{id:'小麦',num:2}],nextRefreshTime:now+1000}},GuildCityInfoRequest:{cities:[{cityId:1},{cityId:2}]},CounterInfoRequest:{counters:[{type:'DAILY_GUILD_AID',num:0},{type:'DAILY_FINISH_GUILD_ORDER',num:0}]},AllItemRequest:{items:[{itemId:'小麦',num:3}]},AllResourceRequest:{list:[]},...overrides};return {connected:true,serverClockOffsetMs:0,gameClock,reads:[],answers,async request(name,body,response){this.reads.push({name,body,response});if(this.answers[name] instanceof Error)throw this.answers[name];return structuredClone(this.answers[name]);}};}
const read=async(c,p={})=>{const f=await surveyAlliance(c,protocol,{player:{id:'1',level:20},parameters:p});return {...f,helpAllowance:{reliable:true,remaining:10,cooldownUntil:0,source:'SYNTHETIC_TEST_ONLY'},helpUsage:{reliable:true,dayKey:allianceBudgetDay(f.now),total:0,spentByItem:new Map(),source:'SYNTHETIC_TEST_HISTORY'}};};
const view=(f,o={})=>allianceView(f,{config,moduleConfig,...o});
const candidate=(f,type)=>view(f).candidates.find(c=>c.actionType===type);
test('adapter exports shared contract and read-only survey preserves exact int64 request/member identities',async()=>{assert.equal(allianceModule.id,'alliance');const c=fake(),f=await read(c);assert.equal(f.asks[0].reqId,'9007199254740993');assert.equal(f.stockReliable,true);assert.equal(f.stock.get('小麦'),3);assert.equal(c.reads.length,9);assert.ok(c.reads.every(r=>r.name.endsWith('Request')&&!['GuildAidHelpRequest','FinishGuildOrderRequest'].includes(r.name)));assert.equal(allianceId(9007199254740992),null);assert.equal(allianceId({low:1,high:2097152,unsigned:false}),'9007199254740993');});
test('advanced modules and every subdomain default disabled',async()=>{const f=await read(fake());assert.equal(allianceView(f).candidates.length,0);assert.equal(allianceView(f,{moduleConfig:{enabled:true}}).candidates.length,0);});
test('help binds existing reqId and exact playerId, consumes one item, never invents member gift',async()=>{const f=await read(fake(),{memberIds:['2']});const a=candidate(f,'help');assert.deepEqual(a.target,{reqId:'9007199254740993',playerId:'2',itemId:'小麦'});assert.deepEqual(a.action,{request:'GuildAidHelpRequest',response:null,body:{reqId:['9007199254740993'],type:0}});assert.deepEqual(a.costs,[{id:'小麦',num:1}]);assert.equal(view(f,{parameters:{memberIds:['3']}}).candidates.some(c=>c.actionType==='help'),false);assert.equal(view(f).dailyLimits.help,10);});
test('help rejects missing member, self request, expired request, duplicates and unknown clock',async()=>{const base=await read(fake());for(const bad of [{...base,members:[],membersReliable:true},{...base,playerId:'2'},{...base,now:now+2000},{...base,asksReliable:false},{...base,now:null}])assert.equal(view(bad).candidates.some(c=>c.actionType==='help'),false);const f=await read(fake({GuildAidListRequest:{askItems:[fake().answers.GuildAidListRequest.askItems[0],fake().answers.GuildAidListRequest.askItems[0]]}}));assert.equal(f.asksReliable,false);});
test('unknown/malformed stock produces no cost-bearing write and failed read does not become zero',async()=>{for(const data of [{AllItemRequest:new Error('timeout')},{AllItemRequest:{items:{bad:true}}},{AllResourceRequest:{list:null}}]){const f=await read(fake(data));assert.equal(f.stockReliable,false);assert.equal(candidate(f,'help'),undefined);}});
test('strict business whitelist blocks request/body/cost override and invalid identities before reading',async()=>{for(const p of [{request:'Anything'},{body:{}},{costs:[]},{memberIds:[9007199254740992]},{reqIds:['2','02']},{itemIds:['']}]){const c=fake();await assert.rejects(read(c,p));assert.equal(c.reads.length,0);}});
test('ask cooldown and missing counters stay UNKNOWN; user-provided season never proves real season',async()=>{const f=await read(fake(),{season:1,itemIds:['小麦']});assert.equal(candidate(f,'finishOrder'),undefined);assert.equal(view(f).blocked.find(b=>b.actionType==='ask').blockedReason,'ASK_COOLDOWN_UNKNOWN');const g={...f,counters:[]};assert.equal(view(g).dailyLimits.ask,null);assert.equal(view(g).blocked.find(b=>b.actionType==='ask').blockedReason,'ASK_DAILY_LIMIT_UNKNOWN');});
test('trusted season and exact level select conservative quota; order body only cityId',async()=>{const f={...await read(fake()),season:2};const orders=view(f).candidates.filter(c=>c.actionType==='finishOrder');assert.equal(orders.length,2);assert.deepEqual(orders[0].action.body,{cityId:1});assert.deepEqual(orders[0].costs,[{id:'小麦',num:2}]);assert.equal(view({...f,counters:[{type:'DAILY_FINISH_GUILD_ORDER',num:10}]}).candidates.some(c=>c.actionType==='finishOrder'),false);assert.throws(()=>planAlliance(f,{config,moduleConfig,selections:orders.map(a=>a.actionId)}),/一个联盟订单/);});
test('selection is strict and shared ledger prevents resource reuse across plans',async()=>{const f=await read(fake()),a=candidate(f,'help'),ledger=new ResourceLedger(new Map([['小麦',1]]));assert.equal(planAlliance(f,{config,moduleConfig,selections:[a.actionId],ledger}).actions.length,1);assert.equal(planAlliance(f,{config,moduleConfig,selections:[a.actionId],ledger}).actions.length,0);assert.throws(()=>planAlliance(f,{config,moduleConfig,selections:['bad']}));assert.throws(()=>planAlliance(f,{config,moduleConfig,selections:[a.actionId,a.actionId]}));assert.equal(planAlliance(f,{config,moduleConfig}).actions.length,0);});
test('help verification needs authoritative removal, exact bound identity, unexpired request and item consumption',async()=>{const b=await read(fake()),a=candidate(b,'help'),after={...b,asks:[],stock:new Map([['小麦',2]])};assert.equal(verifyAlliance(a,b,after),true);assert.equal(verifyAlliance(a,b,{...after,stock:b.stock}),false);assert.equal(verifyAlliance(a,b,{...after,now:now+2000}),false);assert.equal(verifyAlliance(a,b,{...after,guildId:'11'}),false);assert.equal(verifyAlliance({...a,target:{...a.target,playerId:'3'}},b,after),false);assert.equal(verifyAlliance(a,b,{...after,asksReliable:false}),false);});
test('cancel only targets own unhelped request and expiration alone never verifies success',async()=>{const b=await read(fake({MyGuildAidRequest:{aids:[{reqId:'7',reqItemId:'小麦',endTime:now+1000}]}})),a=candidate(b,'cancel');assert.deepEqual(a.action.body,{reqId:'7'});assert.equal(verifyAlliance(a,b,{...b,ownAids:[]}),true);assert.equal(verifyAlliance(a,b,{...b,ownAids:[],now:now+2000}),false);});
test('claim-all aid verifies removed fulfilled IDs and per-item inventory gain',async()=>{const b=await read(fake({MyGuildAidRequest:{aids:[{reqId:'7',reqItemId:'小麦',endTime:now+1000,helper:{playerId:'2'}},{reqId:'8',reqItemId:'小麦',endTime:now+1000,helper:{playerId:'3'}}]}})),a=candidate(b,'claimAid');assert.deepEqual(a.action.body,{});assert.equal(verifyAlliance(a,b,{...b,ownAids:[],stock:new Map([['小麦',5]])}),true);assert.equal(verifyAlliance(a,b,{...b,ownAids:[],stock:new Map([['小麦',4]])}),false);});
test('order verification needs same day counter increment and actual inventory deduction',async()=>{const b={...await read(fake()),season:2},a=candidate(b,'finishOrder'),after={...b,counters:[{type:'DAILY_FINISH_GUILD_ORDER',num:1}],stock:new Map([['小麦',1]])};assert.equal(verifyAlliance(a,b,after),true);assert.equal(verifyAlliance(a,b,{...after,stock:b.stock}),false);assert.equal(verifyAlliance(a,b,{...after,order:{...b.order,nextRefreshTime:now+2000}}),false);});
test('welfare claim all needs fresh watermark plus matching reward stock increase',async()=>{const b=await read(fake({GuildInfoRequest:{guild:{guildId:'10',gotWelfareTime:now-10,welfarePack:[{id:'9',createTime:now-1}]}}})),a=candidate(b,'claimWelfare'),after={...b,guild:{...b.guild,gotWelfareTime:now},stock:new Map([['小麦',4]])};assert.deepEqual(a.action.body,{});assert.equal(verifyAlliance(a,b,after,{reward:{asset:[{id:'小麦',num:1}]}}),true);assert.equal(verifyAlliance(a,b,{...after,stock:b.stock},{reward:{asset:[{id:'小麦',num:1}]}}),false);assert.equal(verifyAlliance(a,b,after,{}),false);});
test('fort construction remains distinct and cannot become arbitrary member donation',async()=>{const f=await read(fake());assert.equal(view(f).blocked.find(b=>b.actionType==='donateFort').blockedReason,'FORT_IS_INDEPENDENT_CONSTRUCTION_REQUIRES_CITY_FORT_SURVEY');assert.equal(view(f).candidates.some(c=>c.action.request==='DonateFortRequest'),false);});
test('abort propagates and prevents new reads',async()=>{const controller=new AbortController();controller.abort();const c=fake();await assert.rejects(surveyAlliance(c,protocol,{signal:controller.signal}),e=>e.code==='CANCELLED');assert.equal(c.reads.length,0);});

test('strict default config is published and rejects unknown fields, wrong types, fractional budgets and mismatched lists',()=>{assert.equal(allianceModule.defaultConfig,ALLIANCE_DEFAULT_CONFIG);assert.equal(allianceModule.validateConfig,validateAllianceConfig);assert.equal(validateAllianceConfig().maxDailyHelps,0);for(const bad of [{request:'x'},{help:{enabled:true}},{maxDailyHelps:1.5},{stockItemIds:['小麦'],stockReserveQuantities:[]},{memberIds:['02']},{dailyBudgetItemIds:['小麦'],dailyBudgetQuantities:[-1]}])assert.throws(()=>validateAllianceConfig(bad));});
test('real survey cannot prove help daily quota/cooldown or local daily spend and therefore blocks help',async()=>{const f=await surveyAlliance(fake(),protocol,{player:{id:'1',level:20}});assert.equal(f.helpAllowance,null);assert.equal(f.helpUsage,null);const v=view(f);assert.equal(v.candidates.some(a=>a.actionType==='help'),false);assert.equal(v.blocked.some(b=>b.blockedReason==='HELP_DAILY_LIMIT_OR_COOLDOWN_UNKNOWN'),true);});
test('trusted limits, cooldown, daily total, per-item budget and safety stock are each mandatory',async()=>{const f=await read(fake());const reason=(facts,cfg=moduleConfig)=>allianceHelpRules(facts,{moduleConfig:cfg}).decisions[0].blockedReason;assert.equal(reason({...f,helpUsage:null}),'HELP_DAILY_BUDGET_USAGE_UNKNOWN');assert.equal(reason({...f,helpAllowance:{...f.helpAllowance,cooldownUntil:now+100}}),'HELP_COOLDOWN_ACTIVE');assert.equal(reason({...f,helpAllowance:{...f.helpAllowance,remaining:0}}),'HELP_DAILY_LIMIT_EXHAUSTED');assert.equal(reason({...f,helpUsage:{...f.helpUsage,total:10}}),'HELP_DAILY_LIMIT_EXHAUSTED');assert.equal(reason(f,{...moduleConfig,dailyBudgetItemIds:[],dailyBudgetQuantities:[]}),'HELP_ITEM_DAILY_BUDGET_NOT_CONFIGURED');assert.equal(reason({...f,helpUsage:{...f.helpUsage,spentByItem:new Map([['小麦',10]])}}),'HELP_ITEM_DAILY_BUDGET_EXHAUSTED');assert.equal(reason(f,{...moduleConfig,stockItemIds:['小麦'],stockReserveQuantities:[3]}),'HELP_SAFETY_STOCK');assert.equal(reason({...f,helpUsage:{...f.helpUsage,dayKey:'yesterday'}}),'HELP_DAILY_BUDGET_USAGE_UNKNOWN');});
test('member and item priorities compose with safety stock and shared budgets in deterministic order',async()=>{const f=await read(fake());f.stock=new Map([['小麦',3],['玉米',3]]);f.asks=[{...f.asks[0],reqId:'11',askerId:'2',itemId:'小麦'},{...f.asks[0],reqId:'12',askerId:'3',itemId:'玉米'},{...f.asks[0],reqId:'13',askerId:'3',itemId:'小麦'}];const cfg={...moduleConfig,priorityMemberIds:['3'],priorityItemIds:['小麦'],stockItemIds:['小麦','玉米'],stockReserveQuantities:[2,2],dailyBudgetItemIds:['小麦','玉米'],dailyBudgetQuantities:[1,1],maxDailyHelps:2,maxActionsPerPlan:3};const v=view(f,{moduleConfig:cfg}),helps=v.candidates.filter(a=>a.actionType==='help');assert.deepEqual(helps.map(a=>a.target.reqId),['13','12','11']);const ledger=new ResourceLedger(f.stock),p=planAlliance(f,{config,moduleConfig:cfg,selections:helps.slice().reverse().map(a=>a.actionId),ledger});assert.deepEqual(p.actions.map(a=>a.target.reqId),['13','12']);assert.equal(ledger.available('小麦'),2);assert.equal(ledger.available('玉米'),2);assert.equal(allianceHelpRules(f,{moduleConfig:{...cfg,memberIds:['2']}}).decisions.filter(d=>!d.blockedReason).length,1);});

import { loadProtocol } from '../src/proto.mjs';
const wireProtocol=loadProtocol();
const wire=(name,body)=>wireProtocol[name].decode(wireProtocol[name].encode(body).finish());
test('real protocol roundtrips every implemented alliance write and proves missing optional fields stay UNKNOWN',async()=>{
  for(const [name,body] of [['GuildAidHelpRequest',{reqId:['9007199254740993'],type:0}],['CancelMyGuildAidRequest',{reqId:'7'}],['GotMyGuildAidRequest',{}],['FinishGuildOrderRequest',{cityId:1}],['GotGuildWelfarePackRequest',{}]]){
    const decoded=wire(name,body);for(const [key,value]of Object.entries(body)){assert.equal(Object.hasOwn(decoded,key),true);if(key==='reqId'&&Array.isArray(value))assert.deepEqual(decoded.reqId.map(allianceId),value);else if(key==='reqId')assert.equal(allianceId(decoded.reqId),value);else assert.deepEqual(decoded[key],value);}
  }
  const c=fake(),original=c.request.bind(c);c.answers.GuildAidListRequest.askItems[0].asker={playerId:'2',nickname:'合成成员',avatar:{}};c.request=async(name,body,response)=>{wire(name,body);return wire(response,await original(name,body,response));};
  const f=await surveyAlliance(c,wireProtocol,{player:{id:'1',level:20}});assert.equal(f.asks[0].reqId,'9007199254740993');assert.equal(f.stockReliable,true);assert.equal(f.order.nextRefreshTime,now+1000);
  const missing=wire('GuildInfoResponse',{guild:{guildId:'10',welfarePack:[]}});assert.equal(missing.guild.gotWelfareTime,0);assert.equal(Object.hasOwn(missing.guild,'gotWelfareTime'),false);
  const fresh=fake();fresh.answers.GuildInfoRequest=missing;const unknown=await surveyAlliance(fresh,wireProtocol,{player:{id:'1',level:20}});assert.equal(unknown.guild.gotWelfareTime,null);assert.equal(view(unknown).candidates.some(a=>a.actionType==='claimWelfare'),false);
  const response=wire('GotGuildWelfarePackResponse',{lastGotTime:now,reward:{asset:[{id:'小麦',num:1}]}});assert.equal(response.lastGotTime,now);assert.equal(response.reward.asset[0].id,'小麦');
});


test('alliance survey rejects absent, legacy-zero and untrusted clock for all time-sensitive candidates',async()=>{
 for(const clock of [undefined,{read:()=>({status:'UNKNOWN',reliable:false,nowMs:now*1000})}]){
  const c=fake({MyGuildAidRequest:{aids:[{reqId:'8',reqItemId:'小麦',endTime:now+1000}]},GuildInfoRequest:{guild:{guildId:'10',welfarePack:[{id:'9',createTime:now-1}],gotWelfareTime:0}}});c.gameClock=clock;
  const f=await surveyAlliance(c,protocol,{player:{id:'1',level:20,worldId:1000001}});assert.equal(c.serverClockOffsetMs,0);assert.equal(f.now,null);assert.equal(f.gameTime.reliable,false);
  const forged={...f,now,helpAllowance:{reliable:true,remaining:10,cooldownUntil:0,source:'SYNTHETIC'},helpUsage:{reliable:true,dayKey:allianceBudgetDay(now),total:0,spentByItem:new Map(),source:'SYNTHETIC'}};
  assert.equal(view(forged).candidates.some(a=>['help','cancel','finishOrder','claimWelfare'].includes(a.actionType)),false);
 }
});

test('alliance expiration uses latest clock bound and help cooldown uses earliest bound',async()=>{
 const c=fake({MyGuildAidRequest:{aids:[{reqId:'8',reqItemId:'小麦',endTime:now+1}]},GuildInfoRequest:{guild:{guildId:'10',welfarePack:[{id:'9',createTime:now+1-86400}],gotWelfareTime:0}}});
 c.answers.GuildAidListRequest.askItems[0].endTime=now+1;c.answers.GuildOrderRequest.order.nextRefreshTime=now+1;
 c.gameClock={read:()=>({status:'TRUSTED',reliable:true,nowMs:now*1000,earliestMs:now*1000-100,latestMs:now*1000+1100})};
 const f=await read(c);f.worldId=1000001;f.season=1;
 assert.equal(view(f).candidates.some(a=>['help','cancel','finishOrder','claimWelfare'].includes(a.actionType)),false);
 const removed={...f,asks:[],stock:new Map(f.stock)};removed.stock.set('小麦',2);
 assert.equal(verifyAlliance({actionType:'help',target:{reqId:f.asks[0].reqId,playerId:'2',itemId:'小麦'},costs:[{id:'小麦',num:1}]},f,removed),false);
 const cooldown=await read(fake());cooldown.gameTime={status:'TRUSTED',reliable:true,nowMs:now*1000,earliestMs:now*1000-100,latestMs:now*1000+100};cooldown.helpAllowance.cooldownUntil=now;
 assert.equal(allianceHelpRules(cooldown,{moduleConfig}).decisions[0].blockedReason,'HELP_COOLDOWN_ACTIVE');
});

test('alliance daily help budget and order counter cannot cross an uncertain game-day boundary',async()=>{
 const midnight=1800028800,c=fake();c.gameClock={read:()=>({status:'TRUSTED',reliable:true,nowMs:midnight*1000,earliestMs:midnight*1000-100,latestMs:midnight*1000+100})};
 c.answers.GuildAidListRequest.askItems[0].endTime=midnight+1000;c.answers.GuildOrderRequest.order.nextRefreshTime=midnight+1000;
 const f=await read(c);f.season=1;
 assert.notEqual(allianceBudgetDay(f.nowEarliest),allianceBudgetDay(f.nowLatest));assert.equal(allianceHelpRules(f,{moduleConfig}).remaining,null);assert.equal(view(f).candidates.some(a=>a.actionType==='finishOrder'),false);
});

test('alliance day rejects dates outside representable range rather than throwing or inventing quota',()=>{assert.equal(allianceBudgetDay(Number.MAX_SAFE_INTEGER),null);assert.equal(allianceBudgetDay(null),null);});
test('daily alliance order selects only the original exact city candidate among unrelated alliance actions',async()=>{
 const {allianceOrderSelection}=await import('../src/alliance.mjs'),facts={...await read(fake()),season:2};
 const candidate=view(facts).candidates.find(a=>a.actionType==='finishOrder'&&a.target.cityId===2);assert.ok(view(facts).candidates.some(a=>a.actionType!=='finishOrder'));
 const selection=allianceOrderSelection({cityId:2});assert.equal(selection.actionId,candidate.actionId);
 const planned=planAlliance(facts,{config,moduleConfig,parameters:{cityId:2},selections:[selection.actionId]});
 assert.equal(planned.actions.length,1);assert.equal(planned.actions[0].actionType,'finishOrder');assert.deepEqual(planned.actions[0].action.body,{cityId:2});assert.deepEqual(planned.actions[0].costs,[{id:'小麦',num:2}]);
 assert.throws(()=>planAlliance({...facts,cities:[{cityId:1}]},{config,moduleConfig,parameters:{cityId:2},selections:[selection.actionId]}));
 assert.notEqual(allianceOrderSelection({cityId:1}).actionId,selection.actionId);
});
test('daily alliance order rejects absent invalid and unrelated business declarations',async()=>{
 const {allianceOrderSelection}=await import('../src/alliance.mjs');
 for(const p of [undefined,{},null,[],{cityId:0},{cityId:-1},{cityId:1.5},{cityId:'1'},{cityId:2147483648},{cityId:1,season:1},{cityId:1,itemIds:['小麦']},{cityId:1,reqIds:['1']},{cityId:1,techId:1,targetLevel:2},{cityId:1,itemId:'小麦',num:1},{cityId:1,request:'FinishGuildOrderRequest'}])assert.throws(()=>allianceOrderSelection(p));
 assert.deepEqual(allianceOrderSelection({cityId:2147483647}),{actionId:'alliance:finishOrder:'+encodeURIComponent(JSON.stringify({cityId:2147483647}))});
});

import {GameClient} from '../src/client.mjs';
import {createCodec} from '../src/codec.mjs';
import {loadConfig} from '../src/config.mjs';
import {executeBusinessOperation} from '../src/business-functions.mjs';
import {operationBudgetClaims,createRunBudgetContext} from '../src/resource-ledger.mjs';
import {assertPaymentAllowed} from '../src/actions.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {createOperationService} from '../src/operation-service.mjs';
import {GAMEPLAY_MODULES} from '../src/function-registry.mjs';
import {createWorkflowRunner,validateWorkflow} from '../src/workflow.mjs';
const shipCodec=createCodec(wireProtocol),shipActual=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const shipParams={action:'ship-order',shipId:41,crewId:1};
async function shipFixture(t,{apply=true,accountId='synthetic-ship',connectionId='offline-ship',generation=3}={}){
 const state={stock:new Map([['木材',10],['鱼',8],['unrelated',9]]),resources:[{res:3,amount:100}],reads:[],writes:[],overrides:{},now:1800000000,period:7,onRead:null,onWrite:null};
 const cabin=crewId=>({crewId,order:[{type:0,id:'木材',num:2},{type:0,id:'鱼',num:3}]});
 state.ship={shipId:41,type:1,state:1,leader:{playerId:'19'},preparedEndTime:state.now+100,cabin:[cabin(1),cabin(2)]};state.ownRun=[];
 const sockets=[];class Socket{
  constructor(){this.readyState=0;sockets.push(this);}
  send(bytes){assert.equal(this.readyState,1);shipCodec.decode(bytes);}
  close(){this.readyState=3;}
  open(){this.readyState=1;this.onopen?.();}
  receive(name,body,seq=0){this.onmessage?.({data:shipCodec.encode(name,seq,body)});}
 }
 const client=new GameClient({protocol:wireProtocol,accountId,generation,WebSocketImpl:Socket});client.on('error',()=>{});
 client.factContext={accountId,generation,connectionId};const pending=client.connect({}),socket=sockets.at(-1);socket.open();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:'9007199254740993',worldId:'1000001',level:20,guildId:'10'}});await pending;
 client.gameClock={reset(){},read:()=>({status:'TRUSTED',reliable:true,nowMs:state.now*1000,earliestMs:state.now*1000,latestMs:state.now*1000})};
 state.seq=0;state.publish=(period={period:state.period,startTime:state.now-100,endTime:state.now+1000})=>socket.receive('SCGuildShipActivity',{period},++state.seq);state.publish();
 const options={config:{tables:Object.fromEntries(['GuildShipParamCfg','GuildShipCfg','ModuleOpenCfg','ItemCfg'].map(k=>[k,structuredClone(shipActual.tables[k])]))},player:{playerId:'9007199254740993',worldId:'1000001',guildId:'10',level:20},parameters:{...shipParams},moduleConfig:{enabled:true,ship:true}};
 client.request=async(n,b,r)=>{wire(n,b);state.reads.push(n);await state.onRead?.(n);
  let value=n==='GuildInfoRequest'?{guild:{guildId:'10'}}:n==='GuildShipRequest'?{period:state.period,ship:[state.ship],ownRun:state.ownRun}:n==='AllItemRequest'?{items:[...state.stock].map(([itemId,num])=>({itemId,num}))}:n==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,n))value=state.overrides[n];if(value instanceof Error)throw value;assert.ok(value,'unexpected ship read '+n);const decoded=wire(r,value);state.onDecoded?.(n,decoded);return decoded;
 };
 client.sendWatch=async(n,b,opts={})=>{wire(n,b);opts.beforeDispatch?.();state.writes.push({name:n,body:structuredClone(b)});if(apply){const slot=state.ship.cabin.find(c=>c.crewId===b.crewId);slot.player={playerId:options.player.playerId};for(const cost of slot.order)state.stock.set(cost.id,state.stock.get(cost.id)-cost.num);}await state.onWrite?.();return {status:'UNKNOWN'};};
 t.after(()=>client.stop());return {state,client,options,socket};
}
async function shipReady(t,extra){const f=await shipFixture(t,extra),facts=await surveyAlliance(f.client,wireProtocol,f.options),view=allianceView(facts,f.options);assert.equal(view.candidates.length,1,JSON.stringify(view.blocked));const operation=planAlliance(facts,{...f.options,selections:[view.candidates[0].actionId]}).actions[0];assert.ok(operation);return {...f,facts,operation};}
const shipBudget=f=>{const {accountId,generation,connectionId}=f.facts.context,scope={accountId,generation,connectionId,runId:'ship-run'},limits=operationBudgetClaims(f.operation);return {scope,limits,batchId:'ship-batch',runBudget:createRunBudgetContext({scope,limits})};};
const shipExecute=f=>executeBusinessOperation(f.client,wireProtocol,f.operation,{...f.options,adapter:allianceModule,allowMutate:true,budget:shipBudget(f)});
test('merchant owned cargo uses original adapter and independent ship plus complete inventory verification',async t=>{
 const f=await shipReady(t);assert.deepEqual(f.state.reads,['GuildInfoRequest','GuildShipRequest','AllItemRequest','AllResourceRequest']);assert.deepEqual(f.operation.action,{request:'GuildShipOrderRequest',response:null,body:{shipId:41,crewId:1}});assert.deepEqual(f.operation.costs,[{id:'木材',num:2},{id:'鱼',num:3}]);assert.equal(f.operation.capabilityId,'BIZ-R05');const result=await shipExecute(f);assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(f.state.writes.length,1);assert.equal(f.state.stock.get('木材'),8);assert.equal(f.state.stock.get('鱼'),5);assert.match(result.verification.reason,/未领取或预测/);
});

test('merchant strict input and D6 exclude purchase, premium, empty costs and transport overrides',async t=>{
 for(const p of [{action:'ship-order'}, {...shipParams,crewId:0},{...shipParams,shipId:2147483648},{...shipParams,crewId:'1'},{...shipParams,buy:false},{...shipParams,costs:[]},{...shipParams,request:'GuildShipOrderRequest'}]){
  const f=await shipFixture(t);f.options.parameters=p;await assert.rejects(surveyAlliance(f.client,wireProtocol,f.options));assert.equal(f.state.reads.length,0);
 }
 const a={request:'GuildShipOrderRequest',body:{shipId:41,crewId:1},costs:[{id:'木材',num:2}]};assert.doesNotThrow(()=>assertPaymentAllowed(a));
 for(const body of [{shipId:41},{...a.body,crewId:0},{...a.body,shipId:'41'},{...a.body,buy:false},{...a.body,universal:false}])assert.throws(()=>assertPaymentAllowed({...a,body}));
 for(const costs of [undefined,[],[{id:'RUBY',num:1}],[{id:'4',num:1}],[{id:'GOLD',num:1}],[{id:'原料自选包',num:1}],[{id:'木材',num:0}],a.costs.concat(a.costs)])assert.throws(()=>assertPaymentAllowed({...a,costs}));
});
const shipNegativeCases=[
 ['disabled',f=>f.options.moduleConfig.ship=false],
 ['level',f=>f.options.player.level=17],
 ['clock',f=>f.client.gameClock.read=()=>({status:'UNKNOWN',reliable:false})],
 ['period',f=>f.state.period=8],
 ['future',f=>f.state.publish({period:7,startTime:f.state.now+1,endTime:f.state.now+1000})],
 ['ended',f=>f.state.publish({period:7,startTime:f.state.now-100,endTime:f.state.now})],
 ['closed',f=>f.state.publish({period:0,startTime:0,endTime:0})],
 ['missing-window',f=>f.socket.receive('SCGuildShipActivity',{period:{period:7}},++f.state.seq)],
 ['no-leader',f=>delete f.state.ship.leader],
 ['late-preparation',f=>f.state.ship.preparedEndTime=f.state.now],
 ['moving',f=>{f.state.ship.state=2;f.state.ship.mvEndTime=f.state.now+100;}],
 ['occupied',f=>f.state.ship.cabin[0].player={playerId:'21'}],
 ['own-captain',f=>f.state.ship.leader={playerId:f.options.player.playerId}],
 ['own-other-cabin',f=>f.state.ship.cabin[1].player={playerId:f.options.player.playerId}],
 ['limit',f=>{f.state.ownRun=[42,43].map(shipId=>({...structuredClone(f.state.ship),shipId,leader:{playerId:f.options.player.playerId}}));}],
 ['uncertain-expired-count',f=>{f.state.ownRun=[42,43].map(shipId=>({...structuredClone(f.state.ship),shipId,state:2,mvEndTime:f.state.now,leader:{playerId:f.options.player.playerId}}));f.client.gameClock.read=()=>({status:'TRUSTED',reliable:true,nowMs:f.state.now*1000,earliestMs:f.state.now*1000-100,latestMs:f.state.now*1000+100});}],
 ['stock',f=>f.state.stock.set('木材',1)],
 ['item-missing',f=>f.state.stock.delete('木材')],
 ['missing-inventory',f=>f.state.overrides.AllItemRequest={}],
 ['missing-resources',f=>f.state.overrides.AllResourceRequest=Error('missing')],
 ['guild',f=>f.state.overrides.GuildInfoRequest={guild:{guildId:'11'}}],
 ['world',f=>f.options.player.worldId='2000001'],
 ['missing-config',f=>delete f.options.config.tables.GuildShipCfg],
 ['duplicate-config',f=>f.options.config.tables.GuildShipCfg.data.push(structuredClone(f.options.config.tables.GuildShipCfg.data[0]))],
 ['wrong-item-type',f=>f.options.config.tables.ItemCfg.data.find(r=>r.id==='木材').type='通用'],
 ['missing-state',f=>delete f.state.ship.state],
 ['missing-deadline',f=>delete f.state.ship.preparedEndTime],
 ['missing-type',f=>delete f.state.ship.type],
 ['missing-material-type',f=>f.state.onDecoded=(n,d)=>{if(n==='GuildShipRequest')delete d.ship[0].cabin[0].order[0].type;}],
 ['duplicate-material',f=>f.state.ship.cabin[0].order.push(structuredClone(f.state.ship.cabin[0].order[0]))],
 ['zero-cost',f=>f.state.ship.cabin[0].order[0].num=0],
 ['partial-cabins',f=>f.state.ship.cabin.pop()],
 ['duplicate-cabin',f=>f.state.ship.cabin[1].crewId=1],
 ['ownRun-conflict',f=>f.state.ownRun=[{...structuredClone(f.state.ship),leader:{playerId:'22'}}]],
 ['missing-ownRun',f=>f.state.onDecoded=(n,d)=>{if(n==='GuildShipRequest')delete d.ownRun;}],
];
for(const [label,mutate] of shipNegativeCases)test('merchant eligibility blocks '+label,async t=>{
 const f=await shipFixture(t);mutate(f);const facts=await surveyAlliance(f.client,wireProtocol,f.options),v=allianceView(facts,f.options);assert.equal(v.candidates.length,0,JSON.stringify(v));assert.equal(v.blocked.length,1);assert.equal(f.state.writes.length,0);
});
test('merchant exactly completed own moving ships no longer occupy participation capacity',async t=>{
 const f=await shipFixture(t);f.state.ownRun=[42,43].map(shipId=>({...structuredClone(f.state.ship),shipId,state:2,mvEndTime:f.state.now,leader:{playerId:f.options.player.playerId}}));const facts=await surveyAlliance(f.client,wireProtocol,f.options);assert.equal(allianceView(facts,f.options).candidates.length,1);
});
for(const field of ['account','role','world','guild','connection','generation','config','level','fact-level','fact-activity','fact-stock','fact-state','cloned-facts','stale','period'])test('merchant current authority rejects drift '+field,async t=>{
 const f=await shipReady(t);let facts=f.facts;
 if(field==='account')f.client.factContext.accountId='B';
 if(field==='role')f.options.player.playerId='22';
 if(field==='world')f.options.player.worldId='2000001';
 if(field==='guild')f.options.player.guildId='11';
 if(field==='connection')f.client.factContext.connectionId='next';
 if(field==='generation')f.client.factContext.generation++;
 if(field==='config')f.options.config.tables.GuildShipParamCfg.revision=2;
 if(field==='level')f.options.player.level=30;
 if(field==='fact-level')facts.playerLevel=99;
 if(field==='fact-activity')facts.activityStable=false;
 if(field==='fact-stock')facts.stock.set('木材',100);
 if(field==='fact-state')facts.state.allShips[0].leaderId='22';
 if(field==='cloned-facts')facts=structuredClone(facts);
 if(field==='stale')facts.sourceAt.guild-=31000;
 if(field==='period')f.state.publish({period:8,startTime:f.state.now-100,endTime:f.state.now+1000});
 assert.equal(allianceView(facts,f.options).candidates.length,0);assert.equal(f.state.writes.length,0);
});
for(const mode of ['no-effect','wrong-owner','wrong-debit','extra-stock','missing-after','period-change','late-window'])test('merchant independent settlement stays UNKNOWN '+mode,async t=>{
 const f=await shipReady(t,{apply:mode!=='no-effect'});f.state.onWrite=()=>{
 if(mode==='wrong-owner')f.state.ship.cabin[0].player.playerId='21';
 if(mode==='wrong-debit')f.state.stock.set('木材',9);
 if(mode==='extra-stock')f.state.resources[0].amount++;
 if(mode==='missing-after')f.state.overrides.GuildShipRequest=Error('timeout');
 if(mode==='period-change'){f.state.period=8;f.state.publish({period:8,startTime:f.state.now-100,endTime:f.state.now+1000});}
 if(mode==='late-window')f.state.now+=100;
 };
 const result=await shipExecute(f);assert.equal(result.status,'UNKNOWN',JSON.stringify(result));assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,1);
});
test('merchant target, cost, expected outcome and request tampering never dispatch',async t=>{
 for(const mutate of [o=>o.target.crewId=2,o=>o.costs[0].num=1,o=>o.action.body.crewId=2,o=>o.expectedState.inventory[0].num=99,o=>o.identity='changed']){
 const f=await shipReady(t);mutate(f.operation);const result=await shipExecute(f);assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);
 }
});
test('merchant shared ledger and parent resource limits cannot fund two uses',async t=>{
 const f=await shipReady(t),ledger=new ResourceLedger(new Map([['木材',2],['鱼',3]]));assert.equal(planAlliance(f.facts,{...f.options,selections:[f.operation.actionId],ledger}).actions.length,1);assert.equal(planAlliance(f.facts,{...f.options,selections:[f.operation.actionId],ledger}).actions.length,0);
 const budget=shipBudget(f);budget.limits={resources:[{id:'木材',num:1},{id:'鱼',num:3}],quotas:[],uids:[]};budget.runBudget=createRunBudgetContext({scope:budget.scope,limits:budget.limits});const result=await executeBusinessOperation(f.client,wireProtocol,f.operation,{...f.options,adapter:allianceModule,allowMutate:true,budget});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);
});
test('merchant cancellation stops reads and late applied response stays UNKNOWN',async t=>{
 const f=await shipReady(t),abort=new AbortController();let release;f.state.onWrite=()=>new Promise(r=>release=r);const pending=executeBusinessOperation(f.client,wireProtocol,f.operation,{...f.options,adapter:allianceModule,allowMutate:true,budget:shipBudget(f),signal:abort.signal});for(let i=0;i<100&&!release;i++)await new Promise(setImmediate);assert.ok(release);abort.abort();release();assert.equal((await pending).status,'UNKNOWN');assert.equal(f.state.writes.length,1);
 const g=await shipFixture(t),stopped=new AbortController();stopped.abort();await assert.rejects(surveyAlliance(g.client,wireProtocol,{...g.options,signal:stopped.signal}));assert.equal(g.state.reads.length,0);
});
async function shipService(t,{file=null,apply=true,connectionId='offline-ship'}={}){
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-ship-')):null;file??=path.join(dir,'history.json');const f=await shipFixture(t,{apply,connectionId}),durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(structuredClone(row));return durable.put(row);}};
 const session={id:'synthetic-ship',client:f.client,player:f.options.player,generation:3,connectionId,state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol:wireProtocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:f.options.moduleConfig})},getConfig:()=>f.options.config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=f.client.sendWatch.bind(f.client);f.client.sendWatch=async(...args)=>{f.state.saved=structuredClone(journal.at(-1));return send(...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 const plan=async()=>{const read=await service.surveyModule(session,'alliance',shipParams),row=read.view.candidates[0];assert.ok(row,JSON.stringify(read.view.blocked));return service.plan(session,{module:'alliance',mode:'Manual',parameters:shipParams,selections:[row.actionId]});};
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true});
 const run=async p=>{const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};};
 return {...f,file,session,service,durable,history,plan,authorize,run};
}
for(const apply of [true,false])test('merchant Service persists intent and restart never replays UNKNOWN '+apply,async t=>{
 const f=await shipService(t,{apply}),p=await f.plan(),{permit,record}=await f.run(p);assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN',JSON.stringify(record.actions));assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.saved.runBudget.reserved.resources,p.resourceBudget);assert.throws(()=>f.service.execute(f.session,permit));
 const restored=await shipService(t,{file:f.file});assert.equal(restored.durable.list(f.session.id)[0].finalStatus,record.finalStatus);if(!apply){await assert.rejects(restored.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restored.state.writes.length,0);}
});
for(const mode of ['disk','cancel','account','config','period'])test('merchant Service rejects before dispatch '+mode,async t=>{
 const f=await shipService(t),p=await f.plan();if(mode==='account'){f.session.id='B';assert.throws(()=>f.authorize(p));return;}if(mode==='config'){f.options.config.tables.GuildShipCfg.revision=2;assert.throws(()=>f.authorize(p));return;}
 const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();
 else {const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT')){if(mode==='disk')throw Error('disk');f.state.period=8;f.state.publish({period:8,startTime:f.state.now-100,endTime:f.state.now+1000});}return put(row);};}
 try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0);
});
test('merchant refusal uses shared durable memory across reconnect until business facts change',async t=>{
 const f=await shipService(t,{apply:false});f.state.onWrite=()=>{throw Object.assign(Error('definite refusal'),{code:'REJECTED'});};assert.equal((await f.run(await f.plan())).record.finalStatus,'REJECTED');const next=await shipService(t,{file:f.file,connectionId:'next'});await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});next.state.stock.set('木材',11);assert.equal((await next.plan()).actions.length,1);assert.equal(next.state.writes.length,0);
});
test('merchant Registry Workflow shares authorization, parent budget and execution history',async t=>{
 const f=await shipService(t),read=await f.service.surveyModule(f.session,'alliance',shipParams),row=read.view.candidates[0],claims=operationBudgetClaims(row);
 const graph={version:1,id:'merchant-flow',name:'Merchant',budget:claims,nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'alliance',parameters:shipParams,selection:row.actionId},{id:'v',type:'VERIFY',module:'alliance'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());let result=await runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(result.plan);result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.durable.list(f.session.id)[0].workflowNodeId,'a');assert.equal(f.state.writes.length,1);
});

for(const mode of ['account','role','world','guild','connection','generation','config','level','expired','lost-source'])test('merchant final dispatch guard sends zero after intent drift '+mode,async t=>{
 const f=await shipReady(t),result=await executeBusinessOperation(f.client,wireProtocol,f.operation,{...f.options,adapter:allianceModule,allowMutate:true,budget:shipBudget(f),onStage(stage){if(stage!=='DISPATCH_INTENT')return;
 if(mode==='account')f.client.factContext.accountId='B';
 if(mode==='role')f.options.player.playerId='21';
 if(mode==='world')f.options.player.worldId='2000001';
 if(mode==='guild')f.options.player.guildId='11';
 if(mode==='connection')f.client.factContext.connectionId='new';
 if(mode==='generation')f.client.factContext.generation++;
 if(mode==='config')f.options.config.tables.GuildShipCfg.revision=2;
 if(mode==='level')f.options.player.level=30;
 if(mode==='expired')f.state.now+=100;
 if(mode==='lost-source')f.socket.receive('SCGuildShipActivity',{period:{period:7}},++f.state.seq);
 }});assert.equal(result.dispatched,false,JSON.stringify(result));assert.equal(f.state.writes.length,0);
});
for(const mode of ['account','role','world','guild','connection','generation'])test('merchant late applied effect stays UNKNOWN after identity drift '+mode,async t=>{
 const f=await shipReady(t);f.state.onWrite=()=>{
 if(mode==='account')f.client.factContext.accountId='B';
 if(mode==='role')f.options.player.playerId='21';
 if(mode==='world')f.options.player.worldId='2000001';
 if(mode==='guild')f.options.player.guildId='11';
 if(mode==='connection')f.client.factContext.connectionId='new';
 if(mode==='generation')f.client.factContext.generation++;
 };const result=await shipExecute(f);assert.equal(result.status,'UNKNOWN',JSON.stringify(result));assert.equal(f.state.writes.length,1);
});
