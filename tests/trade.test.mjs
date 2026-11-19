import { createWorkflowRunner, validateWorkflow } from '../src/workflow.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import os from 'node:os';
import path from 'node:path';
import { GameClient } from '../src/client.mjs';
import { createCodec } from '../src/codec.mjs';
import { trustedGameClock } from '../src/state-facts.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadProtocol } from '../src/proto.mjs';
import { extractTables } from '../src/config.mjs';
import { tradeModule, surveyTrade, viewTrade, planTrade, validateTradeParameters, validateTradeConfig, validateTradeLegClockObservation, prepareTradeBuyWorkflow, validateTradeBuyPreparation, prepareTradeSaleWorkflow, validateTradeSalePreparation } from '../src/trade.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { validateFunctionContract } from '../src/function-contracts.mjs';
const protocol=loadProtocol(),copy=v=>structuredClone(v);
const config={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))};
const wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
function fixture(){
 const info={period:1,player:{coins:100,maxCoins:100,profit:0,buySpeedTimes:0,goods:[{pid:1,goodsId:1001,num:3,buyPrice:50,cityId:2}]},cargo:{cargoLv:1,cityId:1,moveStartTime:0,moveEndTime:0,moveToCityId:0}};
 const city={goods:[{goodsId:1001,stock:0,price:51}],specGoodsId:0,rareGoodsId:0,isReport:false};
 const state={info,city,reads:[],onRead:null,clock:{earliestMs:1000000,nowMs:1000000,latestMs:1000000}};
 const player={playerId:'9007199254740993',worldId:'1000001'};
 const client={connected:true,factContext:{accountId:'A',connectionId:'c1',generation:1},gameClock:{read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:client.factContext.accountId,generation:client.factContext.generation,...state.clock})},async request(name,body,response,timeout,options){assert.ok(!options?.mutate);state.reads.push({name,body:copy(body)});await state.onRead?.(name,body);if(name==='TradeInfoRequest')return wire(response,state.info);if(name==='TradeCityRequest')return wire(response,state.city);throw Error('unexpected write '+name);}};
 const options={config,player,parameters:{}};return {state,player,client,options,survey:()=>surveyTrade(client,protocol,options)};
}
test('fixed v76 Codec/current port Info-City-Info retains zero stock and computes integer-only non-loss preview',async()=>{
 const f=fixture(),facts=await f.survey(),view=viewTrade(facts,{config});
 assert.equal(view.status,'OBSERVED');assert.equal(view.reason,null);assert.equal(view.period,1);assert.equal(view.readOnly,true);assert.equal(view.scope,'CURRENT_PORT_RESPONSE_ONLY');
 assert.deepEqual(f.state.reads,[{name:'TradeInfoRequest',body:{}},{name:'TradeCityRequest',body:{cityId:1}},{name:'TradeInfoRequest',body:{}}]);
 assert.deepEqual(view.balances,{coins:100,maxCoins:100,profit:0,buySpeedTimes:0});assert.deepEqual(view.capacity,{used:3,total:1000,remaining:997});
 assert.deepEqual(view.prices,[{goodsId:1001,stock:0,price:51,name:'生鱼片'}]);
 assert.deepEqual(view.quotes,[{pid:1,goodsId:1001,num:3,buyPrice:50,originCityId:2,price:51,profit:4,total:154,status:'PREVIEW',reason:null}]);
 assert.deepEqual(planTrade(facts,{parameters:{},selections:['pretend-sale']}),{module:'trade',actions:[],notes:['行情预览不是到账；仅明确单次买入、非亏损卖出、Radar 单航段或自有道具保持未来终点的加速可生成候选，其他交易分支保持独立。']});assert.equal(tradeModule.verify().confirmed,false);
 assert.deepEqual(view.candidates,[]);assert.deepEqual(view.blocked.map(row=>[row.actionType,row.code]),[['BUY','EXPLICIT_TARGET_REQUIRED'],['SELL','EXPLICIT_TARGET_REQUIRED'],['MOVE','EXPLICIT_TARGET_REQUIRED']]);
});
test('explicit empty holding and price lists are known empty, without defaulting omitted scalar balances or cargo',async()=>{
 const f=fixture();f.state.info.player.goods=[];f.state.city.goods=[];let view=viewTrade(await f.survey());assert.equal(view.status,'OBSERVED');assert.deepEqual(view.holdings,[]);assert.deepEqual(view.quotes,[]);assert.equal(view.capacity.used,0);
 for(const [section,key]of [['player','coins'],['player','maxCoins'],['player','profit'],['player','buySpeedTimes'],['cargo','cityId'],['cargo','cargoLv'],['cargo','moveEndTime'],['cargo','moveStartTime'],['cargo','moveToCityId']]){
  const g=fixture();delete g.state.info[section][key];view=viewTrade(await g.survey());assert.equal(view.status,'UNKNOWN',section+'.'+key);assert.equal(view.reason,'TRADE_INFO_INCOMPLETE');assert.equal(view.prices.length,0);assert.ok(view.quotes.every(row=>row.total===null));
 }
});
for(const mode of ['travelling','clock-untrusted','clock-overlap','clock-regression','missing-protocol','price-failure','reread-failure','period-changed','balance-changed','cargo-changed','holding-changed'])test(mode+' never presents a coherent current-port quote or retries',async()=>{
 const f=fixture();let infoReads=0;
 if(mode==='travelling')f.state.info.cargo.moveEndTime=1001;
 if(mode==='clock-untrusted')f.client.gameClock.read=()=>({status:'UNKNOWN'});
 if(mode==='clock-overlap'){f.state.info.cargo.moveEndTime=1000;f.state.clock.earliestMs=999999;}
 f.state.onRead=(name)=>{if(name==='TradeInfoRequest')infoReads++;if(mode==='price-failure'&&name==='TradeCityRequest')throw Error('timeout');if(mode==='reread-failure'&&infoReads===2)throw Error('timeout');if(name==='TradeCityRequest'){
  if(mode==='period-changed')f.state.info.period++;
  if(mode==='balance-changed')f.state.info.player.coins++;
  if(mode==='cargo-changed')f.state.info.cargo.cityId++;
  if(mode==='holding-changed')f.state.info.player.goods[0].num++;
  if(mode==='clock-regression')f.state.clock={earliestMs:999999,nowMs:999999,latestMs:999999};
 }};
 const p=mode==='missing-protocol'?{...protocol,TradeCityResponse:null}:protocol;
 const view=viewTrade(await surveyTrade(f.client,p,f.options));assert.equal(view.status,'UNKNOWN');assert.deepEqual(view.prices,[]);assert.ok(view.quotes.every(row=>row.total===null));assert.ok(f.state.reads.length<=3);
 if(['travelling','clock-untrusted','clock-overlap'].includes(mode))assert.deepEqual(f.state.reads.map(r=>r.name),['TradeInfoRequest']);
});
for(const key of ['accountId','connectionId','generation','playerId','worldId'])test(key+' change during asynchronous read cancels before subsequent requests',async()=>{
 const f=fixture();f.state.onRead=()=>{if(key==='playerId'||key==='worldId')f.player[key]='12';else f.client.factContext[key]=key==='generation'?2:'different';};
 await assert.rejects(f.survey(),{code:'CANCELLED'});assert.equal(f.state.reads.length,1);
});
test('abort/late response, disconnected context, detached restart facts and tampered data cannot revive observations',async()=>{
 const f=fixture(),abort=new AbortController();let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);f.state.onRead=async()=>{entered();await wait;};
 const pending=surveyTrade(f.client,protocol,{...f.options,signal:abort.signal});await started;abort.abort();release();await assert.rejects(pending,{code:'CANCELLED'});assert.equal(f.state.reads.length,1);
 const g=fixture(),facts=await g.survey();for(const stale of [copy(facts),JSON.parse(JSON.stringify(facts))]){const view=viewTrade(stale);assert.equal(view.reason,'TRADE_CONTEXT_UNKNOWN');assert.equal(view.balances,null);assert.deepEqual(view.holdings,[]);}
 g.client.connected=false;assert.equal(viewTrade(facts).reason,'TRADE_CONTEXT_UNKNOWN');g.client.connected=true;g.client.factContext.connectionId='c2';assert.equal(viewTrade(facts).reason,'TRADE_CONTEXT_UNKNOWN');
 const h=fixture(),modified=await h.survey();modified.city.goods[0].price=100000;assert.equal(viewTrade(modified).reason,'TRADE_CONTEXT_UNKNOWN');
});
test('missing, duplicate and invalid quote/holding identities remain unknown; same-origin and loss totals are never invented',async()=>{
 for(const change of [f=>{f.state.city.goods.push(copy(f.state.city.goods[0]));},f=>{delete f.state.city.goods[0].price;},f=>{f.state.city.goods[0].price=-1;}]){const f=fixture();change(f);const view=viewTrade(await f.survey());assert.equal(view.status,'UNKNOWN');assert.deepEqual(view.prices,[]);}
 for(const change of [f=>{f.state.info.player.goods.push(copy(f.state.info.player.goods[0]));},f=>{delete f.state.info.player.goods[0].pid;},f=>{f.state.info.player.goods[0].num=0;}]){const f=fixture();change(f);const view=viewTrade(await f.survey());assert.equal(view.reason,'TRADE_INFO_INCOMPLETE');assert.deepEqual(view.holdings,[]);}
 for(const [price,origin,reason]of [[49,2,'TRADE_LOSS_FORMULA_UNVERIFIED'],[51,1,'TRADE_SAME_ORIGIN_CITY']]){const f=fixture();f.state.city.goods[0].price=price;f.state.info.player.goods[0].cityId=origin;const quote=viewTrade(await f.survey()).quotes[0];assert.equal(quote.total,null);assert.equal(quote.reason,reason);}
});
test('config omissions, mutations, duplicate ship rows, unknown goods and integer overflow cannot create a profit',async()=>{
 for(const mode of ['missing','changed','duplicate','overflow']){const f=fixture(),cfg=copy(config);if(mode==='missing')delete cfg.tables.TradeShipCfg;if(mode==='duplicate')cfg.tables.TradeShipCfg.data.push(copy(cfg.tables.TradeShipCfg.data[0]));if(mode==='overflow'){f.state.info.player.goods[0].num=2147483647;f.state.city.goods[0].price=2147483647;}const options={...f.options,config:cfg};const facts=await surveyTrade(f.client,protocol,options);if(mode==='changed')cfg.tables.TradeShipCfg.data[0].profitMargin++;const view=viewTrade(facts,{config:cfg});assert.equal(view.quotes[0].total,null);if(mode==='overflow')assert.equal(view.quotes[0].reason,'TRADE_PREVIEW_OVERFLOW');}
 const f=fixture();f.state.info.player.goods[0].goodsId=999999;const view=viewTrade(await f.survey());assert.equal(view.capacity.used,null);assert.equal(view.holdings[0].name,null);assert.equal(view.quotes[0].total,null);
});
test('static Registry rejects forged controls and requires explicit trade batch authorization',()=>{
 const m=GAMEPLAY_MODULES.trade;assert.equal(m.survey,surveyTrade);assert.equal(m.defaultConfig.enabled,false);assert.equal(validateFunctionContract('trade',m).permissions.write,'ACCOUNT_MODULE_ENABLED_AND_EXACT_BATCH_PERMIT');assert.equal(validateFunctionContract('trade',m,{requireExecutable:true}).implementation.mode,'CONTROLLED_WRITE');
 for(const p of [{cityId:1},{pid:1},{request:'TradeSellRequest'},[],null,{get cityId(){throw Error('getter ran');}}])assert.throws(()=>validateTradeParameters(p),{code:'INVALID_PARAMETERS'});
 for(const c of [{enabled:'true'},{buy:true},[],null])assert.throws(()=>validateTradeConfig(c),{code:'INVALID_PARAMETERS'});
 assert.deepEqual(validateTradeParameters(),{});assert.deepEqual(validateTradeConfig(),{enabled:false});
});


test('zero spread and signed cumulative profit stay explicit; wrong clock owner or source never uses local time',async()=>{
 const f=fixture();f.state.city.goods[0].price=50;f.state.info.player.profit=-7;const view=viewTrade(await f.survey());assert.equal(view.balances.profit,-7);assert.equal(view.quotes[0].profit,0);assert.equal(view.quotes[0].total,150);
 for(const change of [c=>c.accountId='B',c=>c.generation=2,c=>c.source='local clock',c=>c.latestMs=c.nowMs-1]){const g=fixture(),read=g.client.gameClock.read;g.client.gameClock.read=()=>{const c=read();change(c);return c;};const v=viewTrade(await g.survey());assert.equal(v.reason,'TRADE_CLOCK_UNKNOWN');assert.equal(g.state.reads.length,1);assert.equal(v.quotes[0].total,null);}
});


test('bounded trade observation summary validates source, explicit zero counts and no invented context when unknown',async()=>{
 const {summarizeTradeObservation,validateTradeObservationSummary}=await import('../src/trade.mjs'),f=fixture(),view=viewTrade(await f.survey());
 const summary=summarizeTradeObservation(view);assert.deepEqual(summary,{scope:'CURRENT_PORT_RESPONSE_ONLY',source:'TradeInfoResponse/TradeCityResponse/TradeInfoResponse',status:'OBSERVED',period:1,cityId:1,cargoLv:1,priceCount:1,holdingCount:1,nonLossPreviewCount:1,unknownQuoteCount:0});
 assert.deepEqual(validateTradeObservationSummary(summary),summary);assert.notEqual(validateTradeObservationSummary(summary),summary);
 f.state.info.player.goods=[];f.state.city.goods=[];const empty=summarizeTradeObservation(viewTrade(await f.survey()));assert.equal(empty.holdingCount,0);assert.equal(empty.priceCount,0);
 for(const patch of [{status:'UNKNOWN'},{readOnly:false},{scope:'GLOBAL'},{reason:'changed'},{period:0},{quotes:[]},{quotes:[...view.quotes,...view.quotes]},{prices:[...view.prices,...view.prices]},{holdings:[...view.holdings,...view.holdings]}]){const unknown=summarizeTradeObservation({...view,...patch});assert.equal(unknown.status,'UNKNOWN');for(const k of ['period','cityId','cargoLv','priceCount','holdingCount','nonLossPreviewCount','unknownQuoteCount'])assert.equal(unknown[k],null);}
 for(const patch of [{scope:'GLOBAL'},{source:'invented'},{status:'SUCCESS'},{period:0},{holdingCount:2},{priceCount:-1},{priceCount:10001},{unknownQuoteCount:null},{extra:'raw price payload'},{status:'UNKNOWN'}])assert.throws(()=>validateTradeObservationSummary({...summary,...patch}));
 const malformed=copy(view);malformed.quotes[0].total=null;assert.equal(summarizeTradeObservation(malformed).status,'UNKNOWN');
 const unknown=summarizeTradeObservation(null);assert.deepEqual(validateTradeObservationSummary(unknown),unknown);assert.throws(()=>validateTradeObservationSummary({...unknown,period:1}));
});


async function saleFixture(t,{apply=true,file=null,connectionId='trade-connection',buy=false,move=false,speed=false}={}){
 const codec=createCodec(protocol),state={wall:10800000,mono:100,seq:1,reads:[],writes:[],sourceReads:[],overrides:{},onRead:null,onWrite:null,onDispatch:null,receiptOverride:null,apply,
  info:{period:7,player:{coins:100,maxCoins:100,profit:0,buySpeedTimes:0,goods:[{pid:1,goodsId:1001,num:3,buyPrice:50,cityId:2}]},cargo:{cargoLv:1,cityId:1,moveStartTime:0,moveEndTime:0,moveToCityId:0},gotAchieveRwdId:0,gotReportRwdId:0,guildReportNum:0},
  city:{goods:[{goodsId:1001,stock:0,price:51}]},stock:[{itemId:'无关',num:9}],resources:[{res:3,amount:100},{res:4,amount:50}]};
 const clock=trustedGameClock({accountId:'trade-A',generation:3,wallNow:()=>state.wall,monotonicNow:()=>state.mono});
 let socket;class Socket{constructor(){this.readyState=0;socket=this;}send(bytes){const frame=codec.decode(bytes);if(frame.name==='PingRequest')queueMicrotask(()=>this.receive('PingResponse',{clientTimestamp:frame.body.clientTimestamp,serverTimestamp:state.wall}));}close(){this.readyState=3;}receive(name,body,seq=0){this.onmessage?.({data:codec.encode(name,seq,body)});}}
 const client=new GameClient({protocol,accountId:'trade-A',generation:3,WebSocketImpl:Socket,gameClock:clock});client.factContext={accountId:'trade-A',generation:3,connectionId};client.on('error',()=>{});
 const player={playerId:'9007199254740993',worldId:'1000001',level:30};const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:player});await pending;
 const push=(name,body)=>socket.receive(name,body,state.seq++);push('SCAllActivity',{trade:{period:7,startTime:100,endTime:100000}});
 clock.markPing(state.wall);clock.observePong(wire('PingResponse',{clientTimestamp:state.wall,serverTimestamp:state.wall}));
 state.radar=[{cityId:1},{cityId:2}];
 const cfg={tables:Object.fromEntries(['TradeGoodsCfg','TradeShipCfg','ModuleOpenCfg','ActivityTradeCfg','ItemCfg'].map(name=>[name,copy(config.tables[name])]))},options={config:cfg,player,moduleConfig:{enabled:true},parameters:{action:'sell',cityId:1,pid:1,num:2}};
 if(speed){options.parameters={action:'speed',cityId:1,mvToCityId:2,num:1};state.stock.push({itemId:'海商王加速',num:4});Object.assign(state.info.cargo,{moveStartTime:10000,moveEndTime:17200,moveToCityId:2});}
 if(move)options.parameters={action:'move',cityId:1,mvToCityId:2};
 if(buy){options.parameters={action:'buy',cityId:1,goodsId:1001,num:2};state.city.goods[0].price=40;}
 client.request=async(name,body,response,_timeout,opts={})=>{
  wire(name,body);
  if(opts.mutate){await state.onDispatch?.(name,body);opts.beforeDispatch?.();assert.equal(name,speed?'TradeSpeedRequest':move?'TradeMoveRequest':buy?'TradeBuyRequest':'TradeSellRequest');state.writes.push({name,body:copy(body)});if(state.apply&&speed){state.info.cargo.moveEndTime-=1800*body.useNum;state.stock.find(row=>row.itemId==='海商王加速').num-=body.useNum;}else if(state.apply&&move){state.info.cargo={cargoLv:1,cityId:body.cityId,moveStartTime:Math.floor(state.wall/1000),moveEndTime:Math.floor(state.wall/1000)+7200,moveToCityId:body.mvToCityId};}else if(state.apply&&buy){const price=state.city.goods.find(r=>r.goodsId===body.goodsId).price;state.info.player.coins-=price*body.buyNum;const same=state.info.player.goods.find(r=>r.goodsId===body.goodsId&&r.cityId===body.cityId&&r.buyPrice===price);if(same)same.num+=body.buyNum;else state.info.player.goods.push({pid:98+state.writes.length,goodsId:body.goodsId,num:body.buyNum,buyPrice:price,cityId:body.cityId});}else if(state.apply){const row=state.info.player.goods.find(r=>r.pid===body.pid),price=state.city.goods.find(r=>r.goodsId===row.goodsId).price,profit=Math.ceil((price-row.buyPrice)*body.sellNum*1.03);state.info.player.coins+=row.buyPrice*body.sellNum+profit;state.info.player.profit+=profit;state.info.player.maxCoins=Math.max(state.info.player.maxCoins,state.info.player.coins);row.num-=body.sellNum;if(row.num===0)state.info.player.goods=state.info.player.goods.filter(r=>r!==row);}await state.onWrite?.(name,body);return wire(response,state.receiptOverride??(speed?{moveEndTime:state.info.cargo.moveEndTime}:move?{cargo:state.info.cargo}:{player:state.info.player}));}
  state.reads.push(name);await state.onRead?.(name);let value=name==='TradeInfoRequest'?state.info:name==='TradeCityRequest'?state.city:name==='TradeGuildRadarRequest'?{radar:state.radar}:name==='AllItemRequest'?{items:state.stock}:name==='AllResourceRequest'?{list:state.resources}:null;
  if(Object.hasOwn(state.overrides,name))value=state.overrides[name];if(value instanceof Error)throw value;assert.ok(value,'unexpected read '+name);return wire(response,value);
 };
 t.after(()=>client.stop());
 const dir=file===null?fs.mkdtempSync(path.join(os.tmpdir(),'cw-trade-')):null;file??=path.join(dir,'history.json');const durable=createExecutionHistory({file}),journal=[],history={...durable,put(row){journal.push(copy(row));return durable.put(row);}};
 const session={id:'trade-A',client,player,generation:3,connectionId,state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
 const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history,moduleSettings:{get:()=>({config:options.moduleConfig})},getConfig:()=>cfg,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
 const send=client.request;client.request=async(...args)=>{if(args[4]?.mutate)state.saved=copy(journal.at(-1));return send(...args);};
 t.after(async()=>{session.abort.abort();await service.settle(session.id);if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 const survey=()=>surveyTrade(client,protocol,options);
 const plan=async()=>{const read=await service.surveyModule(session,'trade',options.parameters),row=read.view.candidates[0];assert.ok(row.executable,JSON.stringify(row));return service.plan(session,{module:'trade',mode:'Manual',parameters:options.parameters,selections:[row.actionId]});};
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true});
 const run=async p=>{const permit=authorize(p);service.execute(session,permit);await service.settle(session.id);return {permit,record:durable.list(session.id)[0]};};
 return {state,client,player,options,push,clock,survey,service,session,history,durable,journal,file,plan,authorize,run};
}
test('single non-loss sale uses exact batch, known window, quota and inventory, with typed and independent Info verification',async t=>{
 const f=await saleFixture(t),facts=await f.survey(),view=viewTrade(facts,f.options),row=view.candidates[0];assert.ok(row.executable,JSON.stringify(row));
 assert.deepEqual(row.action,{request:'TradeSellRequest',response:'TradeSellResponse',body:{cityId:1,pid:1,sellNum:2}});assert.deepEqual(row.costs,[]);assert.equal(row.quote.total,103);assert.equal(row.quote.profit,3);assert.equal(row.expectedState.player.coins,203);assert.equal(row.expectedState.receiptRule.predicted,false);
 assert.deepEqual(row.budgetClaims,{resources:[],quotas:[{id:'trade:7:holding:1',num:2}],uids:[{type:'trade-holding',id:'7:1'}]});
 assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,1);assert.equal(f.state.writes.length,0);
 const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:GAMEPLAY_MODULES.trade,allowMutate:true,budget:saleBudget(f,row)});assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(f.state.writes.length,1);assert.equal(f.state.info.player.coins,203);assert.equal(f.state.info.player.goods[0].num,1);assert.deepEqual(f.state.resources,[{res:3,amount:100},{res:4,amount:50}]);
});

function saleBudget(f,row){const scope={accountId:f.session.id,generation:f.session.generation,connectionId:f.session.connectionId,runId:'trade-run'},limits=row.budgetClaims;return {ledger:null,runBudget:createRunBudgetContext({scope,limits}),scope,limits,batchId:'trade-batch'};}


test('trade parameters and D6 accept only explicit one-batch sell, never inferred quantity, raw transport, premiums or other trade requests',()=>{
 const good={request:'TradeSellRequest',body:{cityId:1,pid:2,sellNum:3},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(good));
 assert.deepEqual(validateTradeParameters({action:'sell',cityId:1,pid:2,num:3}),{action:'sell',pid:2,cityId:1,num:3});
 for(const value of [{action:'sell'},{action:'sell',cityId:1,pid:2,num:0},{action:'sell',cityId:1,pid:'2',num:3},{action:'sell',cityId:1,pid:2,num:2147483648},{action:'buy',cityId:1,pid:2,num:3},{action:'sell',cityId:1,pid:2,num:3,price:51}])assert.throws(()=>validateTradeParameters(value));
 for(const body of [{cityId:1,pid:2},{cityId:1,pid:2,sellNum:0},{cityId:1,pid:2,sellNum:3,buy:false},{cityId:1,pid:2,sellNum:'3'},{cityId:2147483648,pid:2,sellNum:3}])assert.throws(()=>assertPaymentAllowed({...good,body}));
 assert.throws(()=>assertPaymentAllowed({request:good.request,body:good.body}));for(const costs of [[{id:'RUBY',num:1}],[{id:'GOLD',num:1}]])assert.throws(()=>assertPaymentAllowed({...good,costs}));
 for(const request of ['TradeBuyRequest','TradeSpeedRequest','TradeMoveRequest','TradeUpgradeCargoRequest'])assert.throws(()=>assertPaymentAllowed({...good,request}));
});
const saleBlockers=[
 ['disabled',f=>f.options.moduleConfig.enabled=false],['module level',f=>f.options.player.level=16],['level missing',f=>delete f.options.player.level],['module config missing',f=>delete f.options.config.tables.ModuleOpenCfg],
 ['period source missing',f=>f.push('SCAllActivity',{})],['period closed',f=>f.push('SCAllActivity',{trade:{period:0,startTime:0,endTime:0}})],['period mismatch',f=>f.state.info.period=8],['expired',f=>f.push('SCAllActivity',{trade:{period:7,startTime:100,endTime:999}})],['future start',f=>f.push('SCAllActivity',{trade:{period:7,startTime:10801,endTime:100000}})],
 ['travelling',f=>f.state.info.cargo.moveEndTime=10801],['wrong port',f=>f.options.parameters.cityId=2],['wrong holding',f=>f.options.parameters.pid=2],['excess num',f=>f.options.parameters.num=4],['loss',f=>f.state.city.goods[0].price=49],['origin city',f=>f.state.info.player.goods[0].cityId=1],['coin overflow',f=>f.state.info.player.coins=2147483647],
 ['missing claims',f=>delete f.state.info.gotReportRwdId],['missing inventory',f=>f.state.overrides.AllItemRequest=new Error('unknown')],['missing resources',f=>f.state.overrides.AllResourceRequest=new Error('unknown')],['duplicate holding',f=>f.state.info.player.goods.push(copy(f.state.info.player.goods[0]))]
];
for(const [label,mutate]of saleBlockers)test('single sale blocks '+label+' without any dispatch',async t=>{
 const f=await saleFixture(t);mutate(f);const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,false,label);assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);
});
test('sale fact cannot be renewed by tampering, a public price event, an accepted revision or a late source mutation',async t=>{
 const f=await saleFixture(t),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];
 f.client.emit('message',{name:'SCTradeCityGoods',seq:2,body:{cityId:1,goods:[]}});assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,1);
 f.push('SCTradeCityGoods',{cityId:1,goods:[]});assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);
 for(const mode of ['detached','stock','state','price','configuration','level']){const g=await saleFixture(t);let fact=await g.survey();const op=viewTrade(fact,g.options).candidates[0];if(mode==='detached')fact=copy(fact);if(mode==='stock')fact.stock.set('RUBY',51);if(mode==='state')fact.state.player.coins++;if(mode==='price')fact.city.goods[0].price++;if(mode==='configuration')g.options.config.tables.TradeShipCfg.data[0].profitMargin++;if(mode==='level')g.options.player.level++;assert.equal(planTrade(fact,{...g.options,selections:[op.actionId]}).actions.length,0,mode);}
 const race=await saleFixture(t);race.state.onRead=name=>{if(name==='AllItemRequest')race.push('SCTradeCityGoods',{cityId:1,goods:[]});};const changed=await race.survey();assert.equal(viewTrade(changed,race.options).candidates[0].executable,false);
});
for(const key of ['accountId','connectionId','generation','playerId','worldId'])test('sale five-dimensional isolation invalidates '+key+' before dispatch',async t=>{
 const f=await saleFixture(t),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];if(['playerId','worldId'].includes(key))f.player[key]='12';else f.client.factContext[key]=key==='generation'?4:'different';assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);
});
for(const mode of ['revision','window','clock','budget'])test('final dispatch fence blocks '+mode+' after planning/persistence',async t=>{
 const f=await saleFixture(t),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0],budget=saleBudget(f,row);
 if(mode==='budget')budget.limits.quotas[0].num=1;
 const onStage=stage=>{if(stage!=='DISPATCH_INTENT')return;if(mode==='revision')f.push('SCTradeCityGoods',{cityId:1,goods:[]});if(mode==='window')f.push('SCAllActivity',{trade:{period:8,startTime:100,endTime:100000}});if(mode==='clock'){f.state.wall=200000000;f.state.mono+=189200000;}};
 const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:GAMEPLAY_MODULES.trade,allowMutate:true,budget,onStage});assert.equal(result.dispatched,false,JSON.stringify(result));assert.equal(f.state.writes.length,0);
});
const settlementFailures=[
 ['no server mutation',f=>{f.state.apply=false;}],['missing typed player',f=>f.state.receiptOverride={}],['typed receipt only',f=>{f.state.apply=false;f.state.receiptOverride={player:{...copy(f.state.info.player),coins:203,maxCoins:203,profit:3,goods:[{...copy(f.state.info.player.goods[0]),num:1}]}};}],
 ['wrong coin income',f=>f.state.onWrite=()=>f.state.info.player.coins++],['wrong remaining goods',f=>f.state.onWrite=()=>f.state.info.player.goods[0].num++],['other holding',f=>f.state.onWrite=()=>f.state.info.player.goods.push({pid:2,goodsId:1001,num:1,buyPrice:50,cityId:2})],
 ['paid speed count',f=>f.state.onWrite=()=>f.state.info.player.buySpeedTimes++],['new period',f=>f.state.onWrite=()=>f.state.info.period++],['port change',f=>f.state.onWrite=()=>f.state.info.cargo.cityId=2],['claim changes',f=>f.state.onWrite=()=>f.state.info.gotAchieveRwdId++],
 ['normal inventory',f=>f.state.onWrite=()=>f.state.stock[0].num++],['ruby debit',f=>f.state.onWrite=()=>f.state.resources[1].amount--],['reread failure',f=>f.state.onWrite=()=>f.state.overrides.TradeInfoRequest=new Error('timeout')],['activity source lost',f=>f.state.onWrite=()=>f.push('SCAllActivity',{})]
];
for(const [label,mutate]of settlementFailures)test('single sale keeps UNKNOWN for '+label+' and never resends',async t=>{
 const f=await saleFixture(t);mutate(f);const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,true);const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:GAMEPLAY_MODULES.trade,allowMutate:true,budget:saleBudget(f,row)});assert.equal(result.status,'UNKNOWN',JSON.stringify(result));assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.ok(f.client.uncertainWrites.size>0);
});
test('full-batch removal and reported non-predicted ancillary fields require exact independent receipt equality',async t=>{
 const f=await saleFixture(t);f.options.parameters.num=3;f.state.onWrite=()=>{f.state.info.player.maxCoins=999;f.state.info.player.profit=123;f.push('SCTradeCityGoods',{cityId:1,goods:[]});};const result=await f.run(await f.plan());assert.equal(result.record.finalStatus,'SUCCESS');assert.deepEqual(f.state.info.player.goods,[]);assert.equal(f.state.info.player.coins,254);assert.equal(f.state.writes.length,1);
 const g=await saleFixture(t);g.state.onWrite=()=>g.state.receiptOverride={player:{...copy(g.state.info.player),maxCoins:999}};const record=(await g.run(await g.plan())).record;assert.equal(record.finalStatus,'UNKNOWN');
});
for(const apply of [true,false])test('original Service preserves dispatch intent, quota/UID, durable result and restart '+apply,async t=>{
 const f=await saleFixture(t,{apply}),{permit,record}=await f.run(await f.plan());assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.state.saved.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');assert.deepEqual(f.state.saved.runBudget.reserved.quotas,[{id:'trade:7:holding:1',num:2}]);assert.deepEqual(f.state.saved.runBudget.reserved.uids,[{type:'trade-holding',id:'7:1'}]);assert.throws(()=>f.service.execute(f.session,permit));
 const restart=await saleFixture(t,{file:f.file,connectionId:'trade-new'});assert.equal(restart.durable.list('trade-A')[0].finalStatus,apply?'SUCCESS':'UNKNOWN');if(!apply){await assert.rejects(restart.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restart.state.writes.length,0);}
});
test('persistence failure, foreign authorization, cancellation and config changes prevent sends',async t=>{
 for(const mode of ['disk','account','cancel','config']){const f=await saleFixture(t),p=await f.plan();if(mode==='account'){f.session.id='B';assert.throws(()=>f.authorize(p));continue;}if(mode==='config'){f.options.config.tables.TradeShipCfg.revision=2;assert.throws(()=>f.authorize(p));continue;}const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();else{const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0,mode);}
});
test('refusal memory survives a new connection without automatically clearing or retrying the same holding',async t=>{
 const f=await saleFixture(t,{apply:false});f.state.onWrite=()=>{throw Object.assign(Error('definite refusal'),{code:'REJECTED'});};const record=(await f.run(await f.plan())).record;assert.equal(record.finalStatus,'REJECTED');assert.equal(f.state.writes.length,1);
 const next=await saleFixture(t,{file:f.file,connectionId:'trade-reconnected'});await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);
});
test('late post-send reply after identity replacement remains UNKNOWN, and cancellation never replays the sell',async t=>{
 const f=await saleFixture(t);let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);f.state.onWrite=async()=>{entered();await wait;};const p=await f.plan(),permit=f.authorize(p);f.service.execute(f.session,permit);await started;f.client.factContext.connectionId='changed';f.session.connectionId='changed';release();await f.service.settle(f.session.id);assert.equal(f.durable.list('trade-A')[0].finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);assert.throws(()=>f.service.execute(f.session,permit));
});
test('registered trade Workflow retains original per-batch authorization and shared history',async t=>{
 const f=await saleFixture(t),p=await f.plan(),g={version:1,id:'trade-sale',name:'Explicit sale',nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'trade',parameters:f.options.parameters,selection:p.actions[0].actionId},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'z'}]};assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);
 const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());g.budget=p.budgetClaims;let status=await runner.start('trade-A',g);assert.equal(status.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);await f.run(status.plan);status=await runner.resume();assert.equal(status.status,'COMPLETED');assert.equal(f.durable.list('trade-A')[0].workflowId,status.runId);assert.equal(f.durable.list('trade-A')[0].workflowNodeId,'a');
});


for(const notification of ['SCTradeCityGoods','SCTradeGuildTask','SCTradeCityReport'])test('sale post-read source revision cannot confirm a stale settlement '+notification,async t=>{
 const f=await saleFixture(t),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];const adapter={...GAMEPLAY_MODULES.trade,async survey(...args){const after=await surveyTrade(...args);if(f.state.writes.length)f.push(notification,notification==='SCTradeCityGoods'?{cityId:1,goods:[]}:{});return after;}};
 const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter,allowMutate:true,budget:saleBudget(f,row)});assert.equal(result.status,'UNKNOWN');assert.equal(result.verification.status,'UNCONFIRMED');assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.deepEqual([...f.client.uncertainWrites],[Array.from(f.client.codec.encode('TradeSellRequest',0,{cityId:1,pid:1,sellNum:2})).join(',')]);
});

for(const merge of [false,true])test('C523 exact buy reserves distinct trade currency and verifies server PID '+merge,async t=>{
 const f=await saleFixture(t,{buy:true});if(merge)Object.assign(f.state.info.player.goods[0],{buyPrice:40,cityId:1});const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,true,JSON.stringify(row));assert.deepEqual(row.action,{request:'TradeBuyRequest',response:'TradeBuyResponse',body:{cityId:1,goodsId:1001,buyNum:2}});assert.deepEqual(row.costs,[{id:'TRADE_COINS:7',num:80}]);assert.deepEqual(row.budgetClaims.resources,row.costs);assert.equal(facts.stock.get('TRADE_COINS:7'),100);assert.equal(facts.stock.get('GOLD'),100);const budget=saleBudget(f,row),result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:tradeModule,allowMutate:true,budget});assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(f.state.info.player.coins,20);assert.equal(f.state.info.player.goods.find(r=>r.pid===(merge?1:99)).num,merge?5:2);assert.deepEqual(budget.runBudget.snapshot().reserved,row.budgetClaims);assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.resources,[{res:3,amount:100},{res:4,amount:50}]);
});
const buyBlocks=[['zero balance',f=>f.state.info.player.coins=0],['insufficient coins',f=>f.state.info.player.coins=79],['consumed market',f=>f.state.city.goods[0].stock=60000],['stock missing',f=>delete f.state.city.goods[0].stock],['limit missing',f=>delete f.options.config.tables.TradeGoodsCfg.data.find(r=>r.goodsId===1001).maxCount],['full cargo',f=>f.options.config.tables.TradeShipCfg.data[0].capacity=3],['wrong port',f=>f.options.parameters.cityId=2],['missing good',f=>f.options.parameters.goodsId=99999],['currency collision',f=>f.state.stock.push({itemId:'TRADE_COINS:7',num:99999})]];
for(const [label,change]of buyBlocks)test('C523 buy refuses '+label,async t=>{const f=await saleFixture(t,{buy:true});change(f);const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,false,JSON.stringify(row));assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);});
for(const mode of ['price','stock','coins','budget','revision'])test('C523 buy preflight rejects changed '+mode+' without debit',async t=>{const f=await saleFixture(t,{buy:true}),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0],budget=saleBudget(f,row);let reads=0;f.state.onRead=name=>{if(name==='TradeInfoRequest'&&++reads===3){if(mode==='price')f.state.city.goods[0].price++;if(mode==='stock')f.state.city.goods[0].stock++;if(mode==='coins')f.state.info.player.coins--;if(mode==='revision')f.push('SCTradeCityGoods',{cityId:1,goods:[]});}};if(mode==='budget')budget.limits.resources[0].num=79;const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:tradeModule,allowMutate:true,budget});assert.equal(result.dispatched,false,JSON.stringify(result));assert.equal(f.state.writes.length,0);assert.deepEqual(budget.runBudget.snapshot().reserved,{resources:[],quotas:[],uids:[]});});
const buyFailures=[['missing receipt',f=>f.state.receiptOverride={}],['no effect',f=>f.state.apply=false],['wrong debit',f=>f.state.onWrite=()=>f.state.info.player.coins++],['wrong goods',f=>f.state.onWrite=()=>f.state.info.player.goods.at(-1).goodsId++],['wrong price',f=>f.state.onWrite=()=>f.state.info.player.goods.at(-1).buyPrice++],['wrong quantity',f=>f.state.onWrite=()=>f.state.info.player.goods.at(-1).num++],['old row changed',f=>f.state.onWrite=()=>f.state.info.player.goods[0].num++],['normal gold debit',f=>f.state.onWrite=()=>f.state.resources[0].amount--],['ruby debit',f=>f.state.onWrite=()=>f.state.resources[1].amount--],['cargo changed',f=>f.state.onWrite=()=>f.state.info.cargo.cargoLv++],['claim changed',f=>f.state.onWrite=()=>f.state.info.gotReportRwdId++],['typed mismatch',f=>f.state.onWrite=()=>f.state.receiptOverride={player:{...copy(f.state.info.player),profit:999}}],['late revision',f=>f.state.onRead=name=>{if(f.state.writes.length&&name==='AllResourceRequest')queueMicrotask(()=>f.push('SCTradeCityGoods',{cityId:1,goods:[]}));}]];
for(const [label,change]of buyFailures)test('C523 buy UNKNOWN retains fingerprint for '+label,async t=>{const f=await saleFixture(t,{buy:true});change(f);const record=(await f.run(await f.plan())).record;assert.equal(record.finalStatus,'UNKNOWN',record.stopReason);assert.equal(f.state.writes.length,1);assert.ok(f.client.uncertainWrites.size);});
for(const apply of [true,false])test('C523 buy shared history restart and finite budget '+apply,async t=>{const f=await saleFixture(t,{buy:true,apply}),{record,permit}=await f.run(await f.plan());assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');assert.deepEqual(record.runBudget.reserved.resources,[{id:'TRADE_COINS:7',num:80}]);assert.equal(f.state.saved.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.throws(()=>f.service.execute(f.session,permit));const next=await saleFixture(t,{buy:true,file:f.file,connectionId:'buy-restart'});if(!apply)await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);});
test('C523 buy D6 accepts exact currency debit only',()=>{const action={request:'TradeBuyRequest',body:{cityId:1,goodsId:1001,buyNum:2},costs:[{id:'TRADE_COINS:7',num:80}]};assert.doesNotThrow(()=>assertPaymentAllowed(action));for(const costs of [[],[{id:'GOLD',num:80}],[{id:'RUBY',num:1}],[{id:'TRADE_COINS:0',num:80}],[{id:'TRADE_COINS:7',num:0}],[{id:'TRADE_COINS:2147483648',num:80}]])assert.throws(()=>assertPaymentAllowed({...action,costs}));for(const body of [{cityId:1,goodsId:1001,buyNum:0},{cityId:1,goodsId:1001,buyNum:2,free:true},{cityId:1,goodsId:'1001',buyNum:2}])assert.throws(()=>assertPaymentAllowed({...action,body}));});

test('C523 buy late reply after role/connection replacement remains durable UNKNOWN',async t=>{const f=await saleFixture(t,{buy:true});let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);f.state.onWrite=async()=>{entered();await wait;};const p=await f.plan(),permit=f.authorize(p);f.service.execute(f.session,permit);await started;f.client.factContext.connectionId='replaced';f.session.connectionId='replaced';release();await f.service.settle('trade-A');assert.equal(f.durable.list('trade-A')[0].finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);assert.throws(()=>f.service.execute(f.session,permit));});
for(const mode of ['account','cancel','config','disk','revision'])test('C523 buy prevents dispatch across '+mode,async t=>{const f=await saleFixture(t,{buy:true}),p=await f.plan();if(mode==='account'){f.session.id='B';assert.throws(()=>f.authorize(p));return;}if(mode==='config'){f.options.config.tables.TradeGoodsCfg.revision=1;assert.throws(()=>f.authorize(p));return;}const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();if(mode==='disk'){const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}if(mode==='revision')f.state.onDispatch=()=>f.push('SCTradeCityGoods',{cityId:1,goods:[]});try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0);});

for(const buy of [false,true])test('trade writes outside the fixed daily trading hours are blocked despite an active period '+buy,async t=>{const f=await saleFixture(t,{buy});setTradeClock(f,1000000);const facts=await f.survey(),view=viewTrade(facts,f.options);assert.equal(view.status,'OBSERVED');assert.equal(view.candidates[0].executable,false);assert.equal(view.tradingHours.status,'CLOSED');assert.equal(f.state.writes.length,0);});

function setTradeClock(f,ms){f.state.mono+=Math.abs(f.state.wall-ms)+1;f.state.wall=ms;f.clock.markPing(ms);f.clock.observePong(wire('PingResponse',{clientTimestamp:ms,serverTimestamp:ms}));}

for(const buy of [false,true])for(const [ms,status]of [[3601000,'UNKNOWN'],[7200000,'UNKNOWN'],[7201000,'OPEN'],[46799000,'OPEN'],[46800000,'UNKNOWN'],[46801000,'UNKNOWN'],[50401000,'CLOSED']])test('trade hours cover all supported offsets and complete clock bounds '+buy+' '+ms,async t=>{const f=await saleFixture(t,{buy});setTradeClock(f,ms);const facts=await f.survey(),view=viewTrade(facts,f.options);assert.equal(view.status,'OBSERVED');assert.equal(view.tradingHours.status,status,JSON.stringify(view.tradingHours));assert.equal(view.tradingHours.actualTimezone,null);assert.deepEqual(view.tradingHours.offsetsMinutes,[480,540]);assert.equal(view.candidates[0].executable,status==='OPEN');assert.equal(planTrade(facts,{...f.options,selections:[view.candidates[0].actionId]}).actions.length,status==='OPEN'?1:0);assert.equal(f.state.writes.length,0);});
for(const kind of ['missing','duplicate','bad-format','reversed','overflow','caller-change'])test('trade hours require the current exact authoritative config '+kind,async t=>{const f=await saleFixture(t);const table=f.options.config.tables.ActivityTradeCfg,entry=table.data.find(r=>r.key==='海商王贸易时间');if(kind==='missing')delete f.options.config.tables.ActivityTradeCfg;if(kind==='duplicate')table.data.push(copy(entry));if(kind==='bad-format')entry.value='10-22 extra';if(kind==='reversed')entry.value='22-10';if(kind==='overflow')entry.value='10-25';const facts=await f.survey();if(kind==='caller-change')entry.value='11-23';const view=viewTrade(facts,f.options);assert.equal(view.candidates[0].executable,false);assert.equal(f.state.writes.length,0);});
for(const buy of [false,true])test('trade hour closes after durable intent: final fence sends nothing '+buy,async t=>{const f=await saleFixture(t,{buy});setTradeClock(f,46798000);const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,true);const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:tradeModule,allowMutate:true,budget:saleBudget(f,row),onStage(stage){if(stage==='DISPATCH_INTENT')setTradeClock(f,46801000);}});assert.equal(result.status,'NOT_EXECUTED',JSON.stringify(result));assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);});
for(const buy of [false,true])test('trade hour boundary after a dispatch remains UNKNOWN in shared history '+buy,async t=>{const f=await saleFixture(t,{buy});setTradeClock(f,46798000);f.state.onWrite=()=>setTradeClock(f,46801000);const {record}=await f.run(await f.plan());assert.equal(record.finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);assert.ok(f.client.uncertainWrites.size);});

for(const currentField of [1,2])test('C524 single Radar leg confirms future cargo without inventing arrival '+currentField,async t=>{const f=await saleFixture(t,{move:true});f.state.onWrite=()=>f.state.info.cargo.cityId=currentField;const facts=await f.survey(),view=viewTrade(facts,f.options),row=view.candidates[0];assert.equal(view.route.status,'OBSERVED');assert.deepEqual(view.route.destinations,[{cityId:1},{cityId:2}]);assert.equal(row.executable,true,JSON.stringify(row));assert.deepEqual(row.action,{request:'TradeMoveRequest',response:'TradeMoveResponse',body:{cityId:1,mvToCityId:2}});assert.deepEqual(row.costs,[]);assert.deepEqual(row.budgetClaims,{resources:[],quotas:[{id:'trade:7:cargo-move',num:1}],uids:[{type:'trade-cargo',id:'7'}]});const {record}=await f.run(await f.plan());assert.equal(record.finalStatus,'SUCCESS',record.stopReason);assert.equal(record.actions[0].result,'SUCCESS');assert.equal(record.actions[0].afterState.cargo.moveToCityId,2);assert.equal(record.actions[0].afterState.cargo.moveEndTime,18000);assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0].body,{cityId:1,mvToCityId:2});assert.equal(f.state.info.player.coins,100);assert.equal(view.route.arrivalConfirmed,false);assert.equal(planTrade(await f.survey(),{...f.options,selections:[row.actionId]}).actions.length,0);});
const moveBlocks=[['absent Radar target',f=>f.state.radar=[{cityId:1}]],['duplicate Radar',f=>f.state.radar.push({cityId:2})],['Radar missing scalar',f=>f.state.radar=[{}]],['wrong origin',f=>f.options.parameters.cityId=3],['already moving',f=>Object.assign(f.state.info.cargo,{moveStartTime:10800,moveEndTime:18000,moveToCityId:2})],['clock boundary',f=>f.state.info.cargo.moveEndTime=10800],['malformed old leg',f=>f.state.info.cargo.moveStartTime=1],['Radar fails',f=>f.state.overrides.TradeGuildRadarRequest=Error('timeout')],['module locked',f=>f.player.level=16],['source missing',f=>f.push('SCAllActivity',{})]];
for(const [label,change]of moveBlocks)test('C524 move refuses '+label,async t=>{const f=await saleFixture(t,{move:true});change(f);const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,false,JSON.stringify(row));assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);});
const moveFailures=[['no effect',f=>f.state.apply=false],['missing receipt',f=>f.state.receiptOverride={}],['target changed',f=>f.state.onWrite=()=>f.state.info.cargo.moveToCityId=3],['other city',f=>f.state.onWrite=()=>f.state.info.cargo.cityId=3],['ship changed',f=>f.state.onWrite=()=>f.state.info.cargo.cargoLv++],['old start',f=>f.state.onWrite=()=>f.state.info.cargo.moveStartTime-=2],['future start',f=>f.state.onWrite=()=>f.state.info.cargo.moveStartTime++],['past endpoint',f=>f.state.onWrite=()=>f.state.info.cargo.moveEndTime=10800],['coins changed',f=>f.state.onWrite=()=>f.state.info.player.coins--],['holding changed',f=>f.state.onWrite=()=>f.state.info.player.goods[0].num--],['ruby changed',f=>f.state.onWrite=()=>f.state.resources[1].amount--],['claim changed',f=>f.state.onWrite=()=>f.state.info.gotReportRwdId++],['typed mismatch',f=>f.state.onWrite=()=>f.state.receiptOverride={cargo:{...copy(f.state.info.cargo),moveEndTime:18001}}],['read failed',f=>f.state.onWrite=()=>f.state.overrides.TradeInfoRequest=Error('timeout')],['source lost',f=>f.state.onWrite=()=>f.push('SCAllActivity',{})]];
for(const [label,change]of moveFailures)test('C524 move remains UNKNOWN for '+label,async t=>{const f=await saleFixture(t,{move:true});change(f);const {record}=await f.run(await f.plan());assert.equal(record.finalStatus,'UNKNOWN',record.stopReason);assert.equal(f.state.writes.length,1);assert.ok(f.client.uncertainWrites.size);});
for(const apply of [true,false])test('C524 move restart keeps original dispatch and no replay '+apply,async t=>{const f=await saleFixture(t,{move:true,apply}),{record,permit}=await f.run(await f.plan());assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN',record.stopReason);assert.equal(f.state.saved.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(record.runBudget.reserved,{resources:[],quotas:[{id:'trade:7:cargo-move',num:1}],uids:[{type:'trade-cargo',id:'7'}]});assert.throws(()=>f.service.execute(f.session,permit));const next=await saleFixture(t,{move:true,file:f.file,connectionId:'move-restart'});if(!apply)await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);});
for(const key of ['accountId','generation','connectionId','playerId','worldId'])test('C524 move facts cannot cross '+key,async t=>{const f=await saleFixture(t,{move:true}),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];if(['playerId','worldId'].includes(key))f.player[key]='12';else f.client.factContext[key]=key==='generation'?4:'other';assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);});
test('C524 D6 accepts only an exact zero-debit distinct-city leg',()=>{const a={request:'TradeMoveRequest',body:{cityId:1,mvToCityId:2},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(a));for(const costs of [undefined,[{id:'GOLD',num:1}],[{id:'RUBY',num:1}]])assert.throws(()=>assertPaymentAllowed({...a,costs}));for(const body of [{cityId:1,mvToCityId:1},{cityId:1,mvToCityId:2,speed:true},{cityId:1,mvToCityId:'2'},{cityId:1,mvToCityId:2147483648}])assert.throws(()=>assertPaymentAllowed({...a,body}));for(const v of [{action:'move',cityId:1,mvToCityId:1},{action:'move',cityId:1,mvToCityId:2,num:1},{action:'move',cityId:1,mvToCityId:'2'}])assert.throws(()=>validateTradeParameters(v));});

for(const mode of ['account','cancel','config','disk','revision'])test('C524 move prevents dispatch across '+mode,async t=>{const f=await saleFixture(t,{move:true}),p=await f.plan();if(mode==='account'){f.session.id='B';assert.throws(()=>f.authorize(p));return;}if(mode==='config'){f.options.config.tables.TradeShipCfg.revision=1;assert.throws(()=>f.authorize(p));return;}const permit=f.authorize(p);if(mode==='cancel')f.session.abort.abort();if(mode==='disk'){const put=f.history.put;f.history.put=row=>{if(row.actions?.some(a=>a.stages?.at(-1)?.stage==='DISPATCH_INTENT'))throw Error('disk');return put(row);};}if(mode==='revision')f.state.onDispatch=()=>f.push('SCTradeCityReport',{});try{f.service.execute(f.session,permit);await f.service.settle(f.session.id);}catch{}assert.equal(f.state.writes.length,0);});
for(const notification of ['SCTradeCityGoods','SCTradeGuildTask','SCTradeCityReport'])test('C524 move post-read source revision stays UNKNOWN '+notification,async t=>{const f=await saleFixture(t,{move:true}),row=viewTrade(await f.survey(),f.options).candidates[0],adapter={...tradeModule,async survey(...args){const after=await surveyTrade(...args);if(f.state.writes.length)f.push(notification,notification==='SCTradeCityGoods'?{cityId:1,goods:[]}:{});return after;}};const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter,allowMutate:true,budget:saleBudget(f,row)});assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.ok(f.client.uncertainWrites.size);});
test('C524 move late reply after connection replacement stays durable UNKNOWN',async t=>{const f=await saleFixture(t,{move:true});let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);f.state.onWrite=async()=>{entered();await wait;};const permit=f.authorize(await f.plan());f.service.execute(f.session,permit);await started;f.client.factContext.connectionId='new';f.session.connectionId='new';release();await f.service.settle('trade-A');assert.equal(f.durable.list('trade-A')[0].finalStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);assert.throws(()=>f.service.execute(f.session,permit));});
test('C524 move refusal memory survives reconnect without replay',async t=>{const f=await saleFixture(t,{move:true,apply:false});f.state.onWrite=()=>{throw Object.assign(Error('definite refusal'),{code:'REJECTED'});};assert.equal((await f.run(await f.plan())).record.finalStatus,'REJECTED');const next=await saleFixture(t,{move:true,file:f.file,connectionId:'move-reconnect'});await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);});

for(const num of [1,3])test('C524 owned speed confirms only exact item debit and a still-future endpoint '+num,async t=>{const f=await saleFixture(t,{speed:true});f.options.parameters.num=num;const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,true,row.blockedReason);assert.deepEqual(f.state.reads,['TradeInfoRequest','TradeInfoRequest','AllItemRequest','AllResourceRequest']);assert.deepEqual(row.action,{request:'TradeSpeedRequest',response:'TradeSpeedResponse',body:{useNum:num}});assert.deepEqual(row.costs,[{id:'海商王加速',num}]);assert.equal(row.expectedState.cargo.moveEndTime,17200-1800*num);const {record,permit}=await f.run(await f.plan());assert.equal(record.finalStatus,'SUCCESS',record.stopReason);assert.deepEqual(record.runBudget.reserved,row.budgetClaims);assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0],{name:'TradeSpeedRequest',body:{useNum:num}});assert.equal(f.state.info.cargo.moveEndTime,17200-1800*num);assert.equal(f.state.stock.find(r=>r.itemId==='海商王加速').num,4-num);assert.equal(f.state.info.player.coins,100);assert.equal(f.state.saved.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.throws(()=>f.service.execute(f.session,permit));});
test('C524 owned speed may exhaust owned stock and does not inherit buy/sell hours',async t=>{const f=await saleFixture(t,{speed:true});f.state.stock.find(r=>r.itemId==='海商王加速').num=1;Object.assign(f.state.info.cargo,{moveStartTime:200,moveEndTime:7400});setTradeClock(f,1000000);const view=viewTrade(await f.survey(),f.options);assert.equal(view.tradingHours.status,'CLOSED');assert.equal(view.candidates[0].executable,true);assert.equal((await f.run(await f.plan())).record.finalStatus,'SUCCESS');assert.equal(f.state.stock.find(r=>r.itemId==='海商王加速').num,0);assert.equal(f.state.writes.length,1);});
const speedBlocks=[['missing owned stock',f=>f.state.stock=[]],['insufficient owned stock',f=>{f.options.parameters.num=3;f.state.stock.find(r=>r.itemId==='海商王加速').num=2;}],['completion',f=>f.options.parameters.num=4],['completion clock overlap',f=>f.state.info.cargo.moveEndTime=12600],['wrong origin',f=>f.options.parameters.cityId=3],['wrong destination',f=>f.options.parameters.mvToCityId=3],['old endpoint',f=>f.state.info.cargo.moveEndTime=10000],['future start',f=>f.state.info.cargo.moveStartTime=10801],['missing ItemCfg',f=>delete f.options.config.tables.ItemCfg],['wrong item description',f=>f.options.config.tables.ItemCfg.data.find(r=>r.id==='海商王加速').desc='unknown'],['duration mismatch',f=>f.options.config.tables.ActivityTradeCfg.data.find(r=>r.key==='海商王加速时长').value='20'],['duplicate duration',f=>f.options.config.tables.ActivityTradeCfg.data.push({key:'海商王加速时长',value:'30'})],['configured use cap',f=>{f.options.config.tables.ActivityTradeCfg.data.find(r=>r.key==='海商王行驶时间').value='30';f.options.parameters.num=2;}],['lost source',f=>f.push('SCAllActivity',{})],['module locked',f=>f.player.level=16],['read unknown',f=>f.state.overrides.AllItemRequest=Error('timeout')]];
for(const [label,change]of speedBlocks)test('C524 owned speed refuses '+label,async t=>{const f=await saleFixture(t,{speed:true});change(f);const facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];assert.equal(row.executable,false,row.blockedReason);assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);});
const speedFailures=[['no effect',f=>f.state.apply=false],['missing receipt',f=>f.state.receiptOverride={}],['wrong receipt',f=>f.state.receiptOverride={moveEndTime:15401}],['zero receipt',f=>f.state.receiptOverride={moveEndTime:0}],['wrong debit',f=>f.state.onWrite=()=>f.state.stock.find(r=>r.itemId==='海商王加速').num++],['other item',f=>f.state.onWrite=()=>f.state.stock[0].num++],['wrong endpoint',f=>f.state.onWrite=()=>f.state.info.cargo.moveEndTime++],['different leg',f=>f.state.onWrite=()=>f.state.info.cargo.moveStartTime--],['different destination',f=>f.state.onWrite=()=>f.state.info.cargo.moveToCityId=3],['trade coin debit',f=>f.state.onWrite=()=>f.state.info.player.coins--],['ruby debit',f=>f.state.onWrite=()=>f.state.resources[1].amount--],['claim changed',f=>f.state.onWrite=()=>f.state.info.gotReportRwdId++],['source lost',f=>f.state.onWrite=()=>f.push('SCAllActivity',{})],['independent read fails',f=>f.state.onWrite=()=>f.state.overrides.TradeInfoRequest=Error('timeout')],['endpoint elapsed',f=>f.state.onWrite=()=>setTradeClock(f,15401000)]];
for(const [label,change]of speedFailures)test('C524 owned speed UNKNOWN preserves no replay for '+label,async t=>{const f=await saleFixture(t,{speed:true});change(f);const {record,permit}=await f.run(await f.plan());assert.equal(record.finalStatus,'UNKNOWN',record.stopReason);assert.equal(f.state.writes.length,1);assert.ok(f.client.uncertainWrites.size);assert.throws(()=>f.service.execute(f.session,permit));});
for(const apply of [true,false])test('C524 owned speed restart retains shared history and finite stock budget '+apply,async t=>{const f=await saleFixture(t,{speed:true,apply}),{record}=await f.run(await f.plan());assert.equal(record.finalStatus,apply?'SUCCESS':'UNKNOWN');const next=await saleFixture(t,{speed:true,file:f.file,connectionId:'speed-restart'});assert.equal(next.durable.list('trade-A')[0].finalStatus,record.finalStatus);if(!apply)await assert.rejects(next.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.state.writes.length,0);});
for(const key of ['accountId','generation','connectionId','playerId','worldId'])test('C524 owned speed rejects cross '+key,async t=>{const f=await saleFixture(t,{speed:true}),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0];if(['playerId','worldId'].includes(key))f.player[key]='12';else f.client.factContext[key]=key==='generation'?4:'other';assert.equal(planTrade(facts,{...f.options,selections:[row.actionId]}).actions.length,0);assert.equal(f.state.writes.length,0);});
for(const mode of ['disk','revision','cancel','budget'])test('C524 owned speed final dispatch fence holds '+mode,async t=>{const f=await saleFixture(t,{speed:true}),facts=await f.survey(),row=viewTrade(facts,f.options).candidates[0],budget=saleBudget(f,row);if(mode==='budget')budget.limits.resources[0].num=0;const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:tradeModule,allowMutate:true,budget,onStage(stage){if(stage!=='DISPATCH_INTENT')return;if(mode==='disk')throw Error('disk');if(mode==='cancel')f.session.abort.abort();if(mode==='revision')f.push('SCTradeCityReport',{});},signal:f.session.abort.signal});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);});
test('C524 owned speed rejects stale post-read source and late identity response',async t=>{const f=await saleFixture(t,{speed:true}),row=viewTrade(await f.survey(),f.options).candidates[0],adapter={...tradeModule,async survey(...args){const after=await surveyTrade(...args);if(f.state.writes.length)f.push('SCTradeCityReport',{});return after;}};const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter,allowMutate:true,budget:saleBudget(f,row)});assert.equal(result.status,'UNKNOWN');const g=await saleFixture(t,{speed:true});let release,entered;const wait=new Promise(r=>release=r),started=new Promise(r=>entered=r);g.state.onWrite=async()=>{entered();await wait;};const permit=g.authorize(await g.plan());g.service.execute(g.session,permit);await started;g.client.factContext.connectionId='new';g.session.connectionId='new';release();await g.service.settle('trade-A');assert.equal(g.durable.list('trade-A')[0].finalStatus,'UNKNOWN');assert.equal(g.state.writes.length,1);assert.throws(()=>g.service.execute(g.session,permit));});
test('C524 owned speed exact D6 never permits purchase, free or premium fallback',()=>{const good={request:'TradeSpeedRequest',body:{useNum:2},costs:[{id:'海商王加速',num:2}]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const costs of [undefined,[],[{id:'海商王加速',num:1}],[{id:'RUBY',num:2}],[{id:'GOLD',num:2}]])assert.throws(()=>assertPaymentAllowed({...good,costs}));for(const body of [{useNum:0},{useNum:'2'},{useNum:2,buy:true}])assert.throws(()=>assertPaymentAllowed({...good,body}));assert.throws(()=>assertPaymentAllowed({...good,request:'TradeBuySpeedItemRequest',body:{buyNum:2}}));for(const value of [{action:'speed',num:1},{action:'speed',cityId:1,mvToCityId:2,num:0},{action:'speed',cityId:1,mvToCityId:2,num:1,buy:true}])assert.throws(()=>validateTradeParameters(value));});

for(const field of ['stock','endpoint','target','policy'])test('C524 owned speed preflight refuses changed '+field,async t=>{const f=await saleFixture(t,{speed:true}),row=viewTrade(await f.survey(),f.options).candidates[0];if(field==='stock')f.state.stock.find(r=>r.itemId==='海商王加速').num--;if(field==='endpoint')f.state.info.cargo.moveEndTime++;if(field==='target')f.state.info.cargo.moveToCityId=3;if(field==='policy')f.options.config.tables.ItemCfg.data.find(r=>r.id==='海商王加速').desc='unknown';const result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:tradeModule,allowMutate:true,budget:saleBudget(f,row)});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);});
test('C524 owned speed refuses a config change after durable dispatch intent',async t=>{const f=await saleFixture(t,{speed:true}),row=viewTrade(await f.survey(),f.options).candidates[0],result=await executeBusinessOperation(f.client,protocol,row,{...f.options,adapter:tradeModule,allowMutate:true,budget:saleBudget(f,row),onStage(stage){if(stage==='DISPATCH_INTENT')f.options.config.tables.ActivityTradeCfg.data.find(r=>r.key==='海商王加速时长').value='20';}});assert.equal(result.dispatched,false);assert.equal(f.state.writes.length,0);});
test('C524 owned speed definite refusal survives reconnect without clearing memory',async t=>{const f=await saleFixture(t,{speed:true,apply:false});f.state.onWrite=()=>{throw Object.assign(Error('definite refusal'),{code:'REJECTED'});};assert.equal((await f.run(await f.plan())).record.finalStatus,'REJECTED');const next=await saleFixture(t,{speed:true,file:f.file,connectionId:'speed-reconnect'});await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(next.state.writes.length,0);});

for(const [ms,readiness]of [[10800001,'WAITING_BY_CLOCK'],[10800999,'BOUNDARY_UNCERTAIN'],[10801002,'READY_BY_CLOCK']])test('trade leg clock observation preserves exact endpoint and no arrival claim '+readiness,async t=>{const f=await saleFixture(t,{move:true});Object.assign(f.state.info.cargo,{moveStartTime:10000,moveEndTime:10801,moveToCityId:2});setTradeClock(f,ms);const view=viewTrade(await f.survey(),f.options),o=view.cooldownObservation;assert.equal(o.status,'OBSERVED');assert.equal(o.readiness,readiness);assert.deepEqual(o.leg,{period:7,cargoLv:1,cityId:1,moveStartTime:10000,moveEndTime:10801,moveToCityId:2});assert.equal(o.arrivalConfirmed,false);assert.equal(o.executable,false);assert.equal(o.eligibility,null);assert.equal(o.autoResume,false);assert.deepEqual(validateTradeLegClockObservation(o),o);assert.equal(f.state.writes.length,0);for(const patch of [{arrivalConfirmed:true},{executable:true},{eligibility:true},{autoResume:true},{readiness:'ARRIVED'},{leg:{...o.leg,moveStartTime:10802}},{leg:{...o.leg,moveToCityId:o.leg.cityId}},{source:'local-clock'},{serverBounds:{earliestMs:1,latestMs:0}},{permitId:'no'}])assert.throws(()=>validateTradeLegClockObservation({...o,...patch}));});
for(const reason of ['not-moving','wrong-origin','wrong-target','lost-source','identity','read-fail','changed-info'])test('trade leg clock remains UNKNOWN for '+reason,async t=>{const f=await saleFixture(t,{move:true});Object.assign(f.state.info.cargo,{moveStartTime:10000,moveEndTime:10801,moveToCityId:2});if(reason==='not-moving')f.state.info.cargo.moveStartTime=0;if(reason==='wrong-origin')f.options.parameters.cityId=3;if(reason==='wrong-target')f.options.parameters.mvToCityId=3;if(reason==='lost-source')f.push('SCAllActivity',{});if(reason==='read-fail')f.state.overrides.TradeInfoRequest=Error('timeout');if(reason==='changed-info'){let n=0;f.state.onRead=name=>{if(name==='TradeInfoRequest'&&++n===2)f.state.info.cargo.moveEndTime++;};}const facts=await f.survey();if(reason==='identity')f.client.factContext.connectionId='other';const o=viewTrade(facts,f.options).cooldownObservation;assert.equal(o.status,'UNKNOWN');assert.equal(o.leg,null);assert.equal(o.serverBounds,null);assert.equal(o.sourceAt,null);assert.equal(f.state.writes.length,0);});


async function multiBuyFixture(t,count=2){
 const f=await saleFixture(t,{buy:true}),template=f.options.config.tables.TradeGoodsCfg.data.find(row=>row.goodsId===1001);
 assert.ok(template);
 f.options.config.tables.TradeGoodsCfg.data=Array.from({length:count},(_,i)=>({...copy(template),goodsId:1001+i,capacity:1,maxCount:100}));
 f.state.info.player.goods=[];f.state.info.player.coins=100;f.state.info.player.maxCoins=100;
 f.state.city.goods=Array.from({length:count},(_,i)=>({goodsId:1001+i,stock:0,price:2}));
 f.options.parameters={action:'buy',cityId:1,goodsId:1001,num:1};
 const facts=await f.survey(),view=viewTrade(facts,f.options);
 assert.equal(view.status,'OBSERVED');assert.equal(view.buyPreparation.length,count);
 const buys=view.buyPreparation.map(row=>({goodsId:row.goodsId,num:1,expectedBuyHash:row.expectedBuyHash}));
 return {...f,facts,view,input:{cityId:1,expectedPeriod:7,buys,maxDurationMs:60000}};
}

for(const count of [1,24])test('trade buy preparation composes '+count+' distinct original market quotes with fixed initial budget',async t=>{
 const f=await multiBuyFixture(t,count),prepared=prepareTradeBuyWorkflow(f.facts,{config:f.options.config,moduleConfig:f.options.moduleConfig,...f.input});
 assert.equal(prepared.steps.length,count);assert.equal(prepared.capacityUsed,count);
 assert.deepEqual(prepared.graph.nodes.filter(row=>row.type==='ACTION').map(row=>row.parameters.goodsId),f.input.buys.map(row=>row.goodsId));
 assert.equal(prepared.graph.nodes.filter(row=>row.type==='VERIFY').length,count);
 assert.deepEqual(prepared.budget.resources,[{id:'TRADE_COINS:7',num:count*2}]);
 assert.equal(prepared.budget.quotas.length,count);assert.equal(prepared.budget.uids.length,count);
 assert.deepEqual(prepared.graph.budget,prepared.budget);assert.equal(prepared.resumable,false);assert.equal(f.state.writes.length,0);
});

test('trade buy preparation rejects bad targets, combined cost and combined capacity without dispatch',async t=>{
 const f=await multiBuyFixture(t,2),input=f.input;
 for(const bad of [{...input,buys:[]},{...input,buys:[input.buys[0],input.buys[0]]},{...input,buys:Array(1)},
  {...input,buys:Array(25).fill(input.buys[0])},{...input,buys:[{...input.buys[0],price:0}]},
  {...input,maxDurationMs:0},{...input,maxDurationMs:86400001}])assert.throws(()=>validateTradeBuyPreparation(bad));
 let calls=0;assert.throws(()=>validateTradeBuyPreparation({...input,buys:[{goodsId:1001,num:1,get expectedBuyHash(){calls++;throw Error('getter');}}]}));assert.equal(calls,0);
 f.state.info.player.coins=3;let facts=await f.survey();
 let buys=viewTrade(facts,f.options).buyPreparation.map(row=>({goodsId:row.goodsId,num:1,expectedBuyHash:row.expectedBuyHash}));
 assert.throws(()=>prepareTradeBuyWorkflow(facts,{config:f.options.config,moduleConfig:f.options.moduleConfig,...input,buys}),/不足|资格/);
 f.state.info.player.coins=100;const ship=f.options.config.tables.TradeShipCfg.data.find(row=>row.lv===1);ship.capacity=1;
 facts=await f.survey();buys=viewTrade(facts,f.options).buyPreparation.map(row=>({goodsId:row.goodsId,num:1,expectedBuyHash:row.expectedBuyHash}));
 assert.throws(()=>prepareTradeBuyWorkflow(facts,{config:f.options.config,moduleConfig:f.options.moduleConfig,...input,buys}),/仓位|资格/);
 assert.equal(f.state.writes.length,0);
});


for(const outcome of ['success','unknown-first','unknown-second','refused-second'])test('trade buy Service and Workflow preserve per-good authorization and stop '+outcome,async t=>{
 const f=await multiBuyFixture(t,2);
 const prepared=await f.service.prepareTradeBuySource(f.session,f.input);
 assert.equal(prepared.accountId,'trade-A');assert.equal(f.state.writes.length,0);
 assert.deepEqual(prepared.budget.resources,[{id:'TRADE_COINS:7',num:4}]);
 const runner=createWorkflowRunner({operations:f.service,modules:GAMEPLAY_MODULES,getSession:id=>id===f.session.id?f.session:null,
  isCurrent:(session,generation,client)=>session===f.session&&session.generation===generation&&session.client===client,
  claim:(id,runId,options)=>f.service.claimWorkflow(f.session,runId,options)});
 t.after(async()=>{runner.stop();await runner.settle();});
 let status=await runner.start(f.session.id,prepared.graph);const runId=status.runId;
 const count=outcome==='unknown-first'?1:2;
 for(let i=0;i<count;i++){
  assert.equal(status.status,'AWAITING_AUTHORIZATION');assert.equal(status.runId,runId);
  assert.equal(status.plan.parameters.goodsId,1001+i);assert.equal(f.state.writes.length,i);
  const faulty=outcome==='unknown-first'&&i===0||['unknown-second','refused-second'].includes(outcome)&&i===1;
  f.state.apply=!faulty;f.state.onWrite=outcome==='refused-second'&&i===1?()=>{throw Object.assign(Error('synthetic refusal'),{code:'REJECTED'});}:null;
  const permit=f.authorize(status.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);
  const record=f.durable.list(f.session.id)[0],result=faulty?(outcome==='refused-second'?'REJECTED':'UNKNOWN'):'SUCCESS';
  assert.equal(record.finalStatus,result,record.stopReason);assert.equal(record.workflowId,runId);
  assert.equal(record.workflowNodeId,'buy-'+i);assert.throws(()=>f.service.execute(f.session,permit));
  status=await runner.resume();
 }
 assert.equal(status.status,outcome==='success'?'COMPLETED':outcome==='refused-second'?'FAILED':'UNKNOWN');
 assert.deepEqual(f.state.writes.map(row=>row.body.goodsId),Array.from({length:count},(_,i)=>1001+i));
 assert.equal(f.state.info.player.coins,outcome==='success'?96:outcome==='unknown-first'?100:98);
 const budget=f.service.workflowBudget(f.session.id);assert.equal(budget.state,'CLOSED');assert.equal(budget.resumable,false);
 assert.deepEqual(budget.limits,prepared.budget);assert.equal(budget.batches.length,count);
 assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),outcome.startsWith('unknown'));
});


for(const outcome of ['success','unknown-last','refused-last'])test('trade multi-buy 24-target Service and Workflow '+outcome,{timeout:600000},async t=>{
 const f=await multiBuyFixture(t,24),input={...f.input,maxDurationMs:480000};
 const prepared=await f.service.prepareTradeBuySource(f.session,input);
 assert.deepEqual(prepared.budget.resources,[{id:'TRADE_COINS:7',num:48}]);
 assert.equal(prepared.budget.quotas.length,24);assert.equal(prepared.budget.uids.length,24);
 const runner=createWorkflowRunner({operations:f.service,modules:GAMEPLAY_MODULES,getSession:id=>id===f.session.id?f.session:null,
  isCurrent:(session,generation,client)=>session===f.session&&session.generation===generation&&session.client===client,
  claim:(id,runId,options)=>f.service.claimWorkflow(f.session,runId,options)});
 t.after(async()=>{runner.stop();await runner.settle();});
 let status=await runner.start(f.session.id,prepared.graph);const runId=status.runId;
 for(let i=0;i<24;i++){
  assert.equal(status.status,'AWAITING_AUTHORIZATION',JSON.stringify(status));assert.equal(status.runId,runId);
  assert.equal(status.plan.parameters.goodsId,1001+i);assert.equal(status.plan.actions.length,1);assert.equal(f.state.writes.length,i);
  const faulty=i===23&&outcome!=='success';f.state.apply=!faulty;
  f.state.onWrite=faulty&&outcome==='refused-last'?()=>{throw Object.assign(Error('synthetic refusal'),{code:'REJECTED'});}:null;
  const permit=f.authorize(status.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);
  const record=f.durable.list(f.session.id)[0],result=faulty?(outcome==='refused-last'?'REJECTED':'UNKNOWN'):'SUCCESS';
  assert.equal(record.finalStatus,result,record.stopReason);assert.equal(record.workflowId,runId);assert.equal(record.workflowNodeId,'buy-'+i);
  assert.equal(f.state.saved.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');
  assert.throws(()=>f.service.execute(f.session,permit));status=await runner.resume();
 }
 assert.equal(status.status,outcome==='success'?'COMPLETED':outcome==='refused-last'?'FAILED':'UNKNOWN');
 assert.deepEqual(f.state.writes.map(row=>row.body.goodsId),Array.from({length:24},(_,i)=>1001+i));
 assert.equal(f.state.info.player.coins,outcome==='success'?52:54);assert.equal(f.state.info.player.goods.length,outcome==='success'?24:23);
 const budget=f.service.workflowBudget(f.session.id);assert.equal(budget.state,'CLOSED');assert.equal(budget.resumable,false);
 assert.deepEqual(budget.limits,prepared.budget);assert.equal(budget.batches.length,24);
 assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),outcome==='unknown-last');
});


for(const action of ['sell','buy','move','speed'])test('trade plan uses identical original '+action+' candidate without list projection',async t=>{
 const f=await saleFixture(t,action==='sell'?{}:{[action]:true}),facts=await f.survey();
 const candidate=viewTrade(facts,f.options).candidates[0];assert.equal(candidate.executable,true,JSON.stringify(candidate));
 const planned=planTrade(facts,{...f.options,selections:[candidate.actionId]});
 assert.deepEqual(planned.actions,[candidate]);
 assert.deepEqual(planTrade(facts,{...f.options,selections:['unrelated']}).actions,[]);
 assert.equal(f.state.writes.length,0);
});


async function multiSaleFixture(t,count=2){
 const f=await saleFixture(t),template=f.options.config.tables.TradeGoodsCfg.data.find(row=>row.goodsId===1001);
 assert.ok(template);
 f.options.config.tables.TradeGoodsCfg.data=Array.from({length:count},(_,i)=>({...copy(template),goodsId:1001+i,capacity:1,maxCount:100}));
 f.state.info.player.goods=Array.from({length:count},(_,i)=>({pid:i+1,goodsId:1001+i,num:1,buyPrice:50,cityId:2}));
 f.state.city.goods=Array.from({length:count},(_,i)=>({goodsId:1001+i,stock:0,price:51}));
 f.options.parameters={action:'sell',cityId:1,pid:1,num:1};
 const facts=await f.survey(),view=viewTrade(facts,f.options);
 assert.equal(view.status,'OBSERVED');assert.equal(view.salePreparation.length,count);
 const sales=view.salePreparation.map(({parameters})=>({pid:parameters.pid,num:parameters.num,expectedSaleHash:parameters.expectedSaleHash}));
 return {...f,facts,view,input:{cityId:1,expectedPeriod:7,sales,maxDurationMs:60000}};
}

for(const count of [1,24])test('trade sale preparation composes '+count+' original non-loss full holdings with fixed quotas',async t=>{
 const f=await multiSaleFixture(t,count),prepared=prepareTradeSaleWorkflow(f.facts,{config:f.options.config,moduleConfig:f.options.moduleConfig,...f.input});
 assert.equal(prepared.steps.length,count);
 assert.deepEqual(prepared.graph.nodes.filter(row=>row.type==='ACTION').map(row=>row.parameters.pid),f.input.sales.map(row=>row.pid));
 assert.equal(prepared.graph.nodes.filter(row=>row.type==='VERIFY').length,count);
 assert.deepEqual(prepared.budget.resources,[]);assert.equal(prepared.budget.quotas.length,count);assert.equal(prepared.budget.uids.length,count);
 assert.deepEqual(prepared.graph.budget,prepared.budget);assert.equal(prepared.resumable,false);assert.equal(f.state.writes.length,0);
});

test('trade sale preparation rejects malformed, partial, stale, loss and cumulative overflow without dispatch',async t=>{
 const f=await multiSaleFixture(t,2),input=f.input;
 for(const bad of [{...input,sales:[]},{...input,sales:[input.sales[0],input.sales[0]]},{...input,sales:Array(1)},
  {...input,sales:Array(25).fill(input.sales[0])},{...input,sales:[{...input.sales[0],price:51}]},
  {...input,maxDurationMs:0},{...input,maxDurationMs:86400001}])assert.throws(()=>validateTradeSalePreparation(bad));
 let calls=0;assert.throws(()=>validateTradeSalePreparation({...input,sales:[{pid:1,num:1,get expectedSaleHash(){calls++;throw Error('getter');}}]}));assert.equal(calls,0);
 assert.throws(()=>prepareTradeSaleWorkflow(f.facts,{config:f.options.config,moduleConfig:f.options.moduleConfig,...input,sales:[{...input.sales[0],num:2}]}),/全批|数量/);
 f.state.city.goods[1].price=49;let facts=await f.survey();
 assert.throws(()=>prepareTradeSaleWorkflow(facts,{config:f.options.config,moduleConfig:f.options.moduleConfig,...input}));
 f.state.city.goods[1].price=51;f.state.info.player.coins=2147483600;f.state.info.player.maxCoins=2147483600;facts=await f.survey();
 const sales=viewTrade(facts,f.options).salePreparation.map(({parameters})=>({pid:parameters.pid,num:parameters.num,expectedSaleHash:parameters.expectedSaleHash}));
 assert.throws(()=>prepareTradeSaleWorkflow(facts,{config:f.options.config,moduleConfig:f.options.moduleConfig,...input,sales}),/余额|资格/);
 assert.equal(f.state.writes.length,0);
});

for(const outcome of ['success','unknown-first','unknown-second','refused-second'])test('trade sale Service and Workflow preserve per-holding authorization and stop '+outcome,async t=>{
 const f=await multiSaleFixture(t,2),prepared=await f.service.prepareTradeSaleSource(f.session,f.input);
 assert.equal(prepared.accountId,'trade-A');assert.equal(f.state.writes.length,0);assert.deepEqual(prepared.budget.resources,[]);
 const runner=createWorkflowRunner({operations:f.service,modules:GAMEPLAY_MODULES,getSession:id=>id===f.session.id?f.session:null,
  isCurrent:(session,generation,client)=>session===f.session&&session.generation===generation&&session.client===client,
  claim:(id,runId,options)=>f.service.claimWorkflow(f.session,runId,options)});
 t.after(async()=>{runner.stop();await runner.settle();});
 let status=await runner.start(f.session.id,prepared.graph);const runId=status.runId,count=outcome==='unknown-first'?1:2;
 for(let i=0;i<count;i++){
  assert.equal(status.status,'AWAITING_AUTHORIZATION');assert.equal(status.runId,runId);assert.equal(status.plan.parameters.pid,i+1);assert.equal(f.state.writes.length,i);
  const faulty=outcome==='unknown-first'&&i===0||['unknown-second','refused-second'].includes(outcome)&&i===1;
  f.state.apply=!faulty;f.state.onWrite=outcome==='refused-second'&&i===1?()=>{throw Object.assign(Error('synthetic refusal'),{code:'REJECTED'});}:null;
  const permit=f.authorize(status.plan);f.service.execute(f.session,permit);await f.service.settle(f.session.id);
  const record=f.durable.list(f.session.id)[0],result=faulty?(outcome==='refused-second'?'REJECTED':'UNKNOWN'):'SUCCESS';
  assert.equal(record.finalStatus,result,record.stopReason);assert.equal(record.workflowId,runId);assert.equal(record.workflowNodeId,'sale-'+i);
  assert.throws(()=>f.service.execute(f.session,permit));status=await runner.resume();
 }
 assert.equal(status.status,outcome==='success'?'COMPLETED':outcome==='refused-second'?'FAILED':'UNKNOWN');
 assert.deepEqual(f.state.writes.map(row=>row.body.pid),Array.from({length:count},(_,i)=>i+1));
 assert.equal(f.state.info.player.coins,outcome==='success'?204:outcome==='unknown-first'?100:152);
 const budget=f.service.workflowBudget(f.session.id);assert.equal(budget.state,'CLOSED');assert.equal(budget.resumable,false);
 assert.deepEqual(budget.limits,prepared.budget);assert.equal(budget.batches.length,count);
 assert.equal(createExecutionHistory({file:f.file}).unresolved(f.session.id),outcome.startsWith('unknown'));
});
