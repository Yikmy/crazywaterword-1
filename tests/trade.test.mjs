import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadProtocol } from '../src/proto.mjs';
import { extractTables } from '../src/config.mjs';
import { tradeModule, surveyTrade, viewTrade, planTrade, validateTradeParameters, validateTradeConfig } from '../src/trade.mjs';
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
 assert.deepEqual(planTrade(facts,{parameters:{},selections:['pretend-sale']}),{module:'trade',actions:[],notes:['海商王当前只读；行情和利润预览不产生执行动作。']});assert.equal(tradeModule.verify().confirmed,false);
 assert.deepEqual(view.candidates,[]);assert.ok(view.blocked.every(row=>row.code==='NOT_IMPLEMENTED'));
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
test('static Registry rejects forged write controls and confirms observation-only metadata',()=>{
 const m=GAMEPLAY_MODULES.trade;assert.equal(m.survey,surveyTrade);assert.equal(m.defaultConfig.enabled,false);assert.equal(validateFunctionContract('trade',m).permissions.write,'FORBIDDEN_OBSERVATION_ONLY');assert.throws(()=>validateFunctionContract('trade',m,{requireExecutable:true}),{code:'INVALID_FUNCTION_CONTRACT'});
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
