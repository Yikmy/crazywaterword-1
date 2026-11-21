import { readTradeActivitySnapshot } from './client.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, RESOURCE_NAMES } from './resource-ledger.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { parseReceivedOrderReward } from './order-rewards.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { PIRATE_QUOTA_EVIDENCE } from './pirate-quota.mjs';
// W18 / C521-C524: current-port observation, exact buy/non-loss sale and single Radar leg and owned-item speed.
import { createHash } from 'node:crypto';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { businessRejectionIdentity, stableBusinessValue } from './business-functions.mjs';

const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable;
const get=(v,k)=>own(v,k)?v[k]:undefined;
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647,positive=v=>uint(v)&&v>0;
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const plain=(v,keys)=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&own(v,k));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const live=new WeakMap(),tables=['TradeGoodsCfg','TradeShipCfg','ModuleOpenCfg','ActivityTradeCfg','ItemCfg'];
export const TRADE_EVIDENCE=Object.freeze({source:'Fixed v76 TradeUtil.ts / TradeModel.ts / TradeSellPop.ts / TradeBuyPop.ts / TradeCityShop.ts / TradeUtil.canTrade / TradeMessageView.ts / TradeSpeedPop.ts',scope:'CURRENT_PORT_RESPONSE_ONLY',semantics:'TradeShipCfg supplies capacity and profitMargin. Non-loss sale preview = buyPrice*num + ceil((price-buyPrice)*num*(10000+profitMargin)/10000). Buy quantity is bounded by maxCount-stock, remaining capacity and coins/price; exact price*num debit. Preview is not income or eligibility.',realGame:'REAL_UNVERIFIED'});
const isPass=p=>p?.action==='claim-pass';
const tablesFor=p=>isPass(p)?[...tables,'TradePassCfg']:tables;
export function validateTradeParameters(v={}){
 if(plain(v,['action'])&&isPass(v))return {action:'claim-pass'};
 if(plain(v,[])&&Reflect.ownKeys(v).length===0)return {};
 if(plain(v,['action','cityId','mvToCityId','num'])&&v.action==='speed'&&['cityId','mvToCityId','num'].every(k=>positive(get(v,k))))return {action:'speed',cityId:v.cityId,mvToCityId:v.mvToCityId,num:v.num};
 if(plain(v,['action','cityId','mvToCityId'])&&v.action==='move'&&positive(get(v,'cityId'))&&positive(get(v,'mvToCityId'))&&v.cityId!==v.mvToCityId)return {action:'move',cityId:v.cityId,mvToCityId:v.mvToCityId};
 if(plain(v,['action','goodsId','cityId','num','expectedPeriod','expectedBuyHash'])&&v.action==='buy'&&['goodsId','cityId','num'].every(k=>own(v,k)&&positive(v[k]))){const guarded=own(v,'expectedPeriod')||own(v,'expectedBuyHash');if(guarded&&(!positive(get(v,'expectedPeriod'))||typeof get(v,'expectedBuyHash')!=='string'||! /^[a-f0-9]{64}$/.test(v.expectedBuyHash)))throw invalid('买入守卫须同时明确原活动期数和原报价摘要');return {action:'buy',goodsId:v.goodsId,cityId:v.cityId,num:v.num,...(guarded?{expectedPeriod:v.expectedPeriod,expectedBuyHash:v.expectedBuyHash}:{})};}
 if(!plain(v,['action','pid','cityId','num','expectedPeriod','expectedSaleHash'])||v.action!=='sell'||!['pid','cityId','num'].every(k=>own(v,k)&&positive(v[k])))throw invalid('海商王只接受空观察参数，或 sell 与明确正int32 pid/cityId/num；buy须明确goodsId/cityId/num；move须明确不同的cityId/mvToCityId；speed须明确当前cityId/mvToCityId/num；禁止自动数量或原始请求');
 const guarded=own(v,'expectedPeriod')||own(v,'expectedSaleHash');if(guarded&&(!positive(get(v,'expectedPeriod'))||typeof get(v,'expectedSaleHash')!=='string'||! /^[a-f0-9]{64}$/.test(v.expectedSaleHash)))throw invalid('出售守卫须同时明确原活动期数与64位原报价身份摘要');
 return {action:'sell',pid:v.pid,cityId:v.cityId,num:v.num,...(guarded?{expectedPeriod:v.expectedPeriod,expectedSaleHash:v.expectedSaleHash}:{})};
}
export function validateTradeConfig(v={}){if(!plain(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('海商王配置只接受 enabled 布尔值');return {enabled:get(v,'enabled')??false};}
function id(v){
 if(typeof v==='number')return Number.isSafeInteger(v)&&v>0?String(v):null;
 if(typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)){try{return BigInt(v)<(1n<<63n)?v:null;}catch{}}
 return null;
}
function contextOf(client,player){
 const c=client.factContext,p=toSnapshotJson(player??{}),role=k=>{const n=id(get(p,k));return own(c,k)&&id(get(c,k))!==n?null:n;};
 return {accountId:typeof get(c,'accountId')==='string'&&c.accountId.length>0?c.accountId:null,connectionId:typeof get(c,'connectionId')==='string'&&c.connectionId.length>0?c.connectionId:null,generation:Number.isSafeInteger(get(c,'generation'))&&c.generation>=0?c.generation:null,playerId:role('playerId'),worldId:role('worldId')};
}
function clockOf(client,context){
 let c;try{c=client.gameClock?.read(context);}catch{return null;}
 if(c?.status!=='TRUSTED'||c.reliable!==true||c.source!=='PingResponse.serverTimestamp'||c.accountId!==context.accountId||c.generation!==context.generation||!['earliestMs','nowMs','latestMs'].every(k=>own(c,k)&&Number.isFinite(c[k])&&c[k]>=0&&c[k]<=Number.MAX_SAFE_INTEGER)||c.earliestMs>c.nowMs||c.nowMs>c.latestMs)return null;
 return {earliestMs:c.earliestMs,nowMs:c.nowMs,latestMs:c.latestMs};
}
function rowsOf(raw,key,fields,positiveKeys,identity){
 const rows=get(raw,key);if(!dense(rows))return null;const seen=new Set(),out=[];
 for(const row of rows){if(!fields.every(k=>own(row,k)&&(positiveKeys.includes(k)?positive(row[k]):uint(row[k])))||seen.has(row[identity]))return null;seen.add(row[identity]);out.push(Object.fromEntries(fields.map(k=>[k,row[k]])));}
 return out.sort((a,b)=>a[identity]-b[identity]);
}
function infoOf(raw){
 const player=get(raw,'player'),cargo=get(raw,'cargo');
 const goods=rowsOf(player,'goods',['pid','goodsId','num','buyPrice','cityId'],['pid','goodsId','num','buyPrice','cityId'],'pid');
 const playerKeys=['coins','maxCoins','profit','buySpeedTimes'],cargoKeys=['cargoLv','cityId','moveStartTime','moveEndTime','moveToCityId'];
 const balances=playerKeys.every(k=>k==='profit'?Number.isInteger(get(player,k))&&player[k]>=-2147483648&&player[k]<=2147483647:uint(get(player,k)))?Object.fromEntries(playerKeys.map(k=>[k,player[k]])):null;
 const ship=cargoKeys.every(k=>(['cargoLv','cityId'].includes(k)?positive:uint)(get(cargo,k)))?Object.fromEntries(cargoKeys.map(k=>[k,cargo[k]])):null;
 return {period:positive(get(raw,'period'))?raw.period:null,balances,goods,cargo:ship};
}
function configRow(config,name,key,value){const rows=get(get(get(config,'tables'),name),'data');if(!dense(rows))return null;const found=rows.filter(r=>get(r,key)===value);return found.length===1?found[0]:null;}
const tradeCurrency=period=>'TRADE_COINS:'+period;
const stockState=(stock,exclude)=>[...stock].filter(([id])=>id!==exclude).filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function ownState(f){const info=infoOf(f.first),claims=Object.fromEntries(['gotAchieveRwdId','gotReportRwdId','guildReportNum'].map(k=>[k,get(f.first,k)]));return info.period&&info.balances&&info.goods&&info.cargo&&Object.values(claims).every(uint)&&f.stockReliable?{context:copy(f.context),period:info.period,cargo:info.cargo,player:{...info.balances,goods:info.goods},claims,inventory:stockState(f.stock,f.currencyId)}:null;}
function digest(f){return hash({context:f.context,parameters:f.parameters,first:f.first,last:f.last,city:f.city,radar:f.radar,...(isPass(f.parameters)?{passFirst:f.passFirst,passLast:f.passLast,pass:f.pass}:{}),clock:f.clock,notes:f.notes,configEvidence:f.configEvidence,activity:f.activity,activityStable:f.activityStable,sourceAt:f.sourceAt,playerLevel:f.playerLevel,available:f.available,inventory:f.inventory,state:f.state,stock:[...f.stock],stockReliable:f.stockReliable,currencyId:f.currencyId});}
export async function surveyTrade(client,protocol,{player,config,parameters={},signal,stop,timeout=15000}={}){
 parameters=validateTradeParameters(parameters);if(isPass(parameters))return surveyTradePass(client,protocol,{player,config,parameters,signal,stop,timeout});const opts={signal,stop},context=contextOf(client,player),notes=[],sourceAt=[],activity=readTradeActivitySnapshot(client,context),playerLevel=get(player,'level');
 const active=()=>{assertExecutionActive(client,opts);if(!same(context,contextOf(client,player)))throw Object.assign(new Error('海商王观察期间账号、角色、世界或连接变化'),{code:'CANCELLED'});};
 const read=async(name,body={})=>{active();const response=name.replace(/Request$/,'Response');if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return null;}try{const value=await awaitExecution(client.request(name,body,response,timeout,{signal}),client,opts);active();sourceAt.push({name,at:Date.now()});return toSnapshotJson(value);}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return null;}};
 active();const first=await read('TradeInfoRequest'),info=infoOf(first),start=clockOf(client,context);
 // A trusted lower bound must already be past the explicit travel endpoint.
 // Time passing alone never changes the port: use only TradeInfo.cargo.cityId.
 const docked=info.period!==null&&info.cargo&&start&&start.earliestMs>=info.cargo.moveEndTime*1000;
 const speeding=parameters.action==='speed',moving=parameters.action==='move',radar=moving&&info.period&&info.cargo&&start?await read('TradeGuildRadarRequest'):null;
 const city=!moving&&!speeding&&docked?await read('TradeCityRequest',{cityId:info.cargo.cityId}):null;
 const last=(moving?radar!==null:speeding?info.period&&info.cargo&&start:docked)?await read('TradeInfoRequest'):null;
 const items=parameters.action?await read('AllItemRequest'):null,resources=parameters.action?await read('AllResourceRequest'):null;
 const end=clockOf(client,context),inventory={items,resources},stock=parseOperationInventory(items,resources);active();
 const f={module:'trade',parameters,context,first,last,city,radar,clock:{start,end},notes,activity,activityStable:same(activity,readTradeActivitySnapshot(client,context)),sourceAt,playerLevel:positive(playerLevel)?playerLevel:null,available:Object.keys(protocol??{}),inventory,...stock,configEvidence:{tables:Object.fromEntries(tables.map(n=>[n,copy(config?.tables?.[n]??null)]))}};
 // Domain currency is distinct from normal inventory; a colliding item is not authority.
 if(parameters.action==='buy'&&positive(info.period)&&info.balances&&stock.stockReliable){f.currencyId=tradeCurrency(info.period);if(f.stock.has(f.currencyId))f.stockReliable=false;else f.stock.set(f.currencyId,info.balances.coins);}
 f.state=ownState(f);live.set(f,{client,player,digest:digest(f)});return f;
}
function current(f){const state=live.get(f),c=f?.context;return Boolean(state&&state.digest===digest(f)&&state.client.connected===true&&same(c,contextOf(state.client,state.player))&&c.accountId&&c.connectionId&&c.playerId&&c.worldId&&c.generation!==null);}
function preview(holding,price,ship,currentCity){
 const result={pid:holding.pid,goodsId:holding.goodsId,num:holding.num,buyPrice:holding.buyPrice,originCityId:holding.cityId,price,profit:null,total:null,status:'UNKNOWN',reason:'TRADE_QUOTE_UNKNOWN'};
 if(price===null)return result;
 if(holding.cityId===currentCity)return {...result,reason:'TRADE_SAME_ORIGIN_CITY'};
 if(price<holding.buyPrice)return {...result,reason:'TRADE_LOSS_FORMULA_UNVERIFIED'};
 if(!uint(get(ship,'profitMargin')))return {...result,reason:'TRADE_MARGIN_UNKNOWN'};
 const profit=((BigInt(price)-BigInt(holding.buyPrice))*BigInt(holding.num)*(10000n+BigInt(ship.profitMargin))+9999n)/10000n,total=BigInt(holding.buyPrice)*BigInt(holding.num)+profit;
 // No rounding via Number before the exact integer result has been checked.
 if(total>BigInt(Number.MAX_SAFE_INTEGER)||profit>BigInt(Number.MAX_SAFE_INTEGER))return {...result,reason:'TRADE_PREVIEW_OVERFLOW'};
 return {...result,profit:Number(profit),total:Number(total),status:'PREVIEW',reason:null};
}
// Reuse the fixed client's already evidenced originLang timezone set. This does
// not identify an account's timezone or supply a game-day/reset policy.
function tradingHours(f,config){
 const common={source:'Fixed v76 TradeCityShop._onClickItem / TradeUtil.canTrade / ActivityTradeCfg',profile:PIRATE_QUOTA_EVIDENCE.profile,offsetsMinutes:[...PIRATE_QUOTA_EVIDENCE.clockOffsetsMinutes],actualTimezone:null,range:null};
 const unknown=reason=>({...common,status:'UNKNOWN',reason});
 const row=configRow(config,'ActivityTradeCfg','key','海商王贸易时间'),raw=get(row,'value'),match=typeof raw==='string'?/^([0-9]{1,2})-([0-9]{1,2})$/.exec(raw):null;
 if(!match||Number(match[1])>=Number(match[2])||Number(match[2])>24)return unknown('TRADE_HOURS_CONFIG_UNKNOWN');
 common.range={startHour:Number(match[1]),endHour:Number(match[2])};
 const owner=live.get(f),time=current(f)&&owner?clockOf(owner.client,f.context):null;
 if(!time||!f.clock.start||!f.clock.end)return unknown('TRADE_CLOCK_UNKNOWN');
 const decisions=[];for(const bounds of [f.clock.start,f.clock.end,time])for(const offset of common.offsetsMinutes){
  const low=bounds.earliestMs+offset*60000,high=bounds.latestMs+offset*60000,day=Math.floor(low/86400000),sameDay=day===Math.floor(high/86400000),open=day*86400000+common.range.startHour*3600000,close=day*86400000+common.range.endHour*3600000;
  decisions.push(!sameDay?null:low>=open&&high<close?true:high<open||low>=close?false:null);
 }
 if(decisions.some(value=>value===null))return unknown('TRADE_HOURS_BOUNDARY_UNCERTAIN');
 if(decisions.every(value=>value===true))return {...common,status:'OPEN',reason:null};
 if(decisions.every(value=>value===false))return {...common,status:'CLOSED',reason:'TRADE_HOURS_CLOSED'};
 return unknown('TRADE_HOURS_POLICIES_OR_OBSERVATIONS_DISAGREE');
}
function observationTrade(f,{config=f?.configEvidence}={}){
 const valid=current(f),info=infoOf(valid?f.first:null),after=infoOf(valid?f.last:null),start=valid?f.clock.start:null,end=valid?f.clock.end:null;
 const complete=info.period!==null&&info.balances&&info.goods&&info.cargo;
 const stable=Boolean(complete&&same(info,after)&&start&&end&&start.earliestMs<=end.earliestMs&&start.latestMs<=end.latestMs&&start.earliestMs>=info.cargo.moveEndTime*1000&&end.earliestMs>=info.cargo.moveEndTime*1000);
 const rows=stable?rowsOf(f.city,'goods',['goodsId','stock','price'],['goodsId','price'],'goodsId'):null;
 const matching=valid&&same(tables.map(n=>config?.tables?.[n]??null),tables.map(n=>f.configEvidence.tables[n]));
 const cfg=matching?f.configEvidence:null,ship=info.cargo?configRow(cfg,'TradeShipCfg','lv',info.cargo.cargoLv):null;
 const holdings=(info.goods??[]).map(row=>{const good=configRow(cfg,'TradeGoodsCfg','goodsId',row.goodsId);return {...row,name:typeof get(good,'itemName')==='string'?good.itemName:null,unitCapacity:positive(get(good,'capacity'))?good.capacity:null};});
 let usedCapacity=info.goods?0:null;
 for(const row of holdings){if(usedCapacity===null||row.unitCapacity===null||!Number.isSafeInteger(usedCapacity+row.unitCapacity*row.num))usedCapacity=null;else usedCapacity+=row.unitCapacity*row.num;}
 const capacity=positive(get(ship,'capacity'))?ship.capacity:null,remainingCapacity=usedCapacity!==null&&capacity!==null&&usedCapacity<=capacity?capacity-usedCapacity:null;
 const prices=(rows??[]).map(row=>({...row,name:typeof get(configRow(cfg,'TradeGoodsCfg','goodsId',row.goodsId),'itemName')==='string'?configRow(cfg,'TradeGoodsCfg','goodsId',row.goodsId).itemName:null}));
 const quotes=holdings.map(row=>preview(row,rows?.find(p=>p.goodsId===row.goodsId)?.price??null,ship,info.cargo?.cityId));
 const reason=!valid?'TRADE_CONTEXT_UNKNOWN':!complete?'TRADE_INFO_INCOMPLETE':!start||!end?'TRADE_CLOCK_UNKNOWN':start.earliestMs<info.cargo.moveEndTime*1000?'TRADE_TRAVELLING':!stable?'TRADE_STATE_CHANGED':!rows?'TRADE_PRICES_UNKNOWN':null;
 return {module:'trade',tradingHours:tradingHours(f,matching?cfg:null),readOnly:true,scope:'CURRENT_PORT_RESPONSE_ONLY',status:reason?'UNKNOWN':'OBSERVED',reason,period:info.period,balances:info.balances,cargo:info.cargo,holdings,prices,quotes,capacity:{used:usedCapacity,total:capacity,remaining:remainingCapacity},candidates:[],blocked:[{actionType:'BUY',code:'EXPLICIT_TARGET_REQUIRED',reason:'须明确港口、货物和数量后重新探测精确成本'},{actionType:'SELL',code:'EXPLICIT_TARGET_REQUIRED',reason:'须明确港口、持货批次和数量后重新探测；全批预览不是授权'},{actionType:'MOVE',code:'EXPLICIT_TARGET_REQUIRED',reason:'须明确当前起点和Radar目的地；多段路线和加速仍需独立合同'}],notes:[...(f?.notes??[]),'仅当前港口响应；前后货舱相同不证明原子快照。stock 仅显示服务端原值，不解释为可买数量。maxCoins/profit 保留原字段含义，不推导余额上限。预计售得不计入库存、预算或历史到账。']};
}
const saleRequest='TradeSellRequest',saleResponse='TradeSellResponse';
const saleCostSource='Fixed v76 TradeSellPop._onSellProp: exact cityId/pid/sellNum; no resource debit. Non-loss preview formula verified against TradeShipCfg. No purchase, route, reward claim or RUBY.';
function tradeAuthority(f,{settlement=false}={}){
 const state=live.get(f);if(!current(f)||!state||!f.state||f.stockReliable!==true||!same(ownState(f),f.state)||!f.activityStable||state.player.level!==f.playerLevel||!positive(f.playerLevel)||f.sourceAt.length!==(isPass(f.parameters)?6:f.parameters.action==='speed'?4:5)||f.sourceAt.some(r=>!Number.isFinite(r.at)||r.at>Date.now()||Date.now()-r.at>30000))return false;
 const time=clockOf(state.client,f.context);if(!time||!f.clock.end||time.earliestMs<f.clock.end.earliestMs||time.latestMs<f.clock.end.latestMs)return false;
 const activity=readTradeActivitySnapshot(state.client,f.context),project=a=>settlement?{source:a.source,status:a.status,reliable:a.reliable,period:a.period,accountId:a.accountId,playerId:a.playerId,worldId:a.worldId,generation:a.generation,connectionId:a.connectionId}:a;
 return activity.status==='OBSERVED'&&activity.reliable===true&&same(project(f.activity),project(activity));
}
function saleCandidate(f,{config=f?.configEvidence,moduleConfig={enabled:false}}={},view,settlement=false){
 const p=f?.parameters??{},beforeState=copy(f?.state??null),holding=beforeState?.player.goods.find(r=>r.pid===p.pid),period=beforeState?.period??null;
 const row=holding?view.holdings.find(r=>r.pid===holding.pid):null,ship=beforeState?configRow(f.configEvidence,'TradeShipCfg','lv',beforeState.cargo.cargoLv):null;
 const quote=row&&p.num<=row.num?preview({...row,num:p.num},view.prices.find(r=>r.goodsId===row.goodsId)?.price??null,ship,p.cityId):null;
 const required=configRow(config,'ModuleOpenCfg','moduleId','海商王'),minimum=positive(get(required,'playerLevel'))?required.playerLevel:null;
 const liveState=live.get(f),time=liveState?clockOf(liveState.client,f.context):null,window=f?.activity?.period;
 const configMatches=same(tables.map(n=>config?.tables?.[n]??null),tables.map(n=>f?.configEvidence?.tables?.[n]??null));
 let reason=!validateTradeConfig(moduleConfig).enabled?'TRADE_DISABLED':!tradeAuthority(f,{settlement})?'TRADE_AUTHORITY_UNKNOWN':!configMatches?'TRADE_CONFIG_CHANGED':view.status!=='OBSERVED'?'TRADE_PORT_OBSERVATION_UNKNOWN':minimum===null?'TRADE_MODULE_LEVEL_UNKNOWN':f.playerLevel<minimum?'TRADE_MODULE_LOCKED':!time||!f.clock.start||!f.clock.end||!positive(window?.period)||window.period!==period||[f.clock.start,f.clock.end,time].some(c=>c.earliestMs<window.startTime*1000||c.latestMs>=window.endTime*1000)?'TRADE_PERIOD_OR_CLOCK_UNKNOWN':view.tradingHours.status!=='OPEN'?view.tradingHours.reason:!holding||holding.cityId===p.cityId||beforeState.cargo.cityId!==p.cityId||p.num>holding.num?'TRADE_EXACT_HOLDING_OR_PORT_UNKNOWN':!quote||quote.status!=='PREVIEW'?'TRADE_NON_LOSS_QUOTE_UNKNOWN':quote.total+beforeState.player.coins>2147483647?'TRADE_COINS_OVERFLOW':!['gotAchieveRwdId','gotReportRwdId','guildReportNum'].every(k=>get(f.first,k)===get(f.last,k))?'TRADE_CLAIM_STATE_CHANGED':![saleRequest,saleResponse].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 if(!reason&&own(p,'expectedPeriod')&&(p.expectedPeriod!==period||salePreparationHash(f,view,p.pid)!==p.expectedSaleHash))reason='TRADE_SALE_PREPARATION_CHANGED';
 const goods=holding?beforeState.player.goods.flatMap(r=>r.pid!==p.pid?[copy(r)]:r.num===p.num?[]:[{...r,num:r.num-p.num}]):[];
 const expectedState=holding&&quote?.status==='PREVIEW'?{context:copy(beforeState.context),period,cargo:copy(beforeState.cargo),claims:copy(beforeState.claims),inventory:copy(beforeState.inventory),player:{coins:beforeState.player.coins+quote.total,buySpeedTimes:beforeState.player.buySpeedTimes,goods},receiptRule:{source:'TradeSellResponse.player',fields:['maxCoins','profit'],constraint:'EXACT_TYPED_AND_INDEPENDENT_TRADE_INFO',predicted:false}}:null;
 const target={period,cityId:p.cityId,pid:p.pid,num:p.num},budgetClaims={resources:[],quotas:[{id:'trade:'+period+':holding:'+p.pid,num:p.num}],uids:[{type:'trade-holding',id:period+':'+p.pid}]};
 const identity=hash({beforeState,expectedState,target}),actionId='trade:sell:'+period+':'+p.pid+':'+identity;
 return {module:'trade',actionId,actionType:'SELL',target,parameters:copy(p),identity,beforeState,expectedState,costs:[],costSource:saleCostSource,budgetClaims,executable:reason===null,blockedReason:reason,label:'单次卖出 '+p.num+' × 批次 '+p.pid,quote,requiredLevel:minimum,...(reason===null?{action:{request:saleRequest,response:saleResponse,body:{cityId:p.cityId,pid:p.pid,sellNum:p.num}}}:{})};
}
function buyCandidate(f,{config=f?.configEvidence,moduleConfig={enabled:false}}={},view,settlement=false){
 const p=f?.parameters??{},base=copy(f?.state??null),period=base?.period??null,market=view.prices.find(r=>r.goodsId===p.goodsId),good=configRow(config,'TradeGoodsCfg','goodsId',p.goodsId),required=configRow(config,'ModuleOpenCfg','moduleId','海商王');
 const unit=positive(get(good,'capacity'))?good.capacity:null,maxCount=uint(get(good,'maxCount'))?good.maxCount:null,price=market?.price??null;
 const maxBuy=unit&&price&&maxCount!==null&&uint(market?.stock)&&market.stock<=maxCount&&view.capacity.remaining!==null&&base?Math.min(maxCount-market.stock,Math.floor(view.capacity.remaining/unit),Math.floor(base.player.coins/price)):null;
 const total=price&&positive(p.num)?BigInt(price)*BigInt(p.num):null,currency=tradeCurrency(period),minimum=positive(get(required,'playerLevel'))?required.playerLevel:null;
 const source=live.get(f),time=source?clockOf(source.client,f.context):null,window=f?.activity?.period;
 const configMatches=same(tables.map(n=>config?.tables?.[n]??null),tables.map(n=>f?.configEvidence?.tables?.[n]??null));
 let reason=!validateTradeConfig(moduleConfig).enabled?'TRADE_DISABLED':!tradeAuthority(f,{settlement})?'TRADE_AUTHORITY_UNKNOWN':!configMatches?'TRADE_CONFIG_CHANGED':view.status!=='OBSERVED'?'TRADE_PORT_OBSERVATION_UNKNOWN':minimum===null?'TRADE_MODULE_LEVEL_UNKNOWN':f.playerLevel<minimum?'TRADE_MODULE_LOCKED':!time||!positive(window?.period)||window.period!==period||[f.clock.start,f.clock.end,time].some(c=>!c||c.earliestMs<window.startTime*1000||c.latestMs>=window.endTime*1000)?'TRADE_PERIOD_OR_CLOCK_UNKNOWN':view.tradingHours.status!=='OPEN'?view.tradingHours.reason:base?.cargo.cityId!==p.cityId||!market?'TRADE_EXACT_GOODS_OR_PORT_UNKNOWN':maxBuy===null?'TRADE_BUY_LIMIT_UNKNOWN':p.num>maxBuy?'TRADE_BUY_LIMIT_EXCEEDED':total===null||total<=0n||total>2147483647n?'TRADE_BUY_COST_OVERFLOW':f.currencyId!==currency||f.stock.get(currency)!==base.player.coins?'TRADE_COINS_SOURCE_UNKNOWN':!['gotAchieveRwdId','gotReportRwdId','guildReportNum'].every(k=>get(f.first,k)===get(f.last,k))?'TRADE_CLAIM_STATE_CHANGED':!['TradeBuyRequest','TradeBuyResponse'].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 if(!reason&&own(p,'expectedPeriod')&&(p.expectedPeriod!==period||buyPreparationHash(f,view,p.goodsId)!==p.expectedBuyHash))reason='TRADE_BUY_PREPARATION_CHANGED';
 const beforeState=base?{...base,market:copy(view.prices)}:null,costs=total!==null&&total>0n&&total<=2147483647n?[{id:currency,num:Number(total)}]:[];
 const target={period,cityId:p.cityId,goodsId:p.goodsId,num:p.num},budgetClaims={resources:copy(costs),quotas:[{id:'trade:'+period+':market:'+p.cityId+':'+p.goodsId,num:p.num}],uids:[{type:'trade-market',id:period+':'+p.cityId+':'+p.goodsId}]};
 const expectedState=base&&costs.length?{context:copy(base.context),period,cargo:copy(base.cargo),claims:copy(base.claims),inventory:copy(base.inventory),player:{coins:base.player.coins-costs[0].num,buySpeedTimes:base.player.buySpeedTimes},receiptRule:{source:'TradeBuyResponse.player',fields:['maxCoins','profit','goods'],constraint:'EXACT_TYPED_AND_INDEPENDENT_TRADE_INFO_SINGLE_HOLDING_INCREASE',predicted:false}}:null;
 const identity=hash({beforeState,expectedState,target,costs}),actionId='trade:buy:'+period+':'+p.cityId+':'+p.goodsId+':'+identity;
 return {module:'trade',actionId,actionType:'BUY',target,parameters:copy(p),identity,beforeState,expectedState,costs,costSource:'Fixed v76 TradeBuyPop: exact cityId/goodsId/buyNum; price*num trade coins; maxCount-stock, remaining capacity and coins/price bound explicit quantity. No normal GOLD or RUBY.',budgetClaims,executable:reason===null,blockedReason:reason,label:'单次买入 '+p.num+' × 货物 '+p.goodsId,quote:{price,total:costs[0]?.num??null,maxBuy},requiredLevel:minimum,...(reason===null?{action:{request:'TradeBuyRequest',response:'TradeBuyResponse',body:{cityId:p.cityId,goodsId:p.goodsId,buyNum:p.num}}}:{})};
}
// Receipt supplies the server-assigned PID. Exactly one matching new holding or
// one matching existing holding may increase; all other complete rows stay equal.
function boughtGoods(before,received,p,price){
 if(!dense(received))return false;let changes=0;const old=new Map(before.map(row=>[row.pid,row]));
 for(const row of received){const prior=old.get(row.pid);old.delete(row.pid);if(prior&&same(prior,row))continue;
  if(++changes!==1||row.goodsId!==p.goodsId||row.cityId!==p.cityId||row.buyPrice!==price||row.num!==(prior?prior.num:0)+p.num||prior&&!same({...row,num:prior.num},prior))return false;
 }
 return old.size===0&&changes===1;
}
function routeObservation(f){
 const rows=current(f)?rowsOf(f.radar,'radar',['cityId'],['cityId'],'cityId'):null;
 const stable=Boolean(f?.state&&same(infoOf(f.first),infoOf(f.last))&&same(ownState(f),f.state)&&f.clock.start&&f.clock.end&&f.clock.start.earliestMs<=f.clock.end.earliestMs&&f.clock.start.latestMs<=f.clock.end.latestMs);
 return {scope:'CURRENT_GUILD_RADAR_RESPONSE_ONLY',source:'TradeInfoResponse/TradeGuildRadarResponse/TradeInfoResponse',status:rows&&stable?'OBSERVED':'UNKNOWN',destinations:rows&&stable?rows:[],arrivalConfirmed:false};
}
function moveCandidate(f,{config=f?.configEvidence,moduleConfig={enabled:false}}={},settlement=false){
 const p=f?.parameters??{},base=copy(f?.state??null),period=base?.period??null,route=routeObservation(f),source=live.get(f),time=source?clockOf(source.client,f.context):null,window=f?.activity?.period;
 const required=configRow(config,'ModuleOpenCfg','moduleId','海商王'),minimum=positive(get(required,'playerLevel'))?required.playerLevel:null;
 const configMatches=same(tables.map(n=>config?.tables?.[n]??null),tables.map(n=>f?.configEvidence?.tables?.[n]??null));
 const reason=!validateTradeConfig(moduleConfig).enabled?'TRADE_DISABLED':!tradeAuthority(f,{settlement})?'TRADE_AUTHORITY_UNKNOWN':!configMatches?'TRADE_CONFIG_CHANGED':minimum===null?'TRADE_MODULE_LEVEL_UNKNOWN':f.playerLevel<minimum?'TRADE_MODULE_LOCKED':!time||!positive(window?.period)||window.period!==period||[f.clock.start,f.clock.end,time].some(c=>!c||c.earliestMs<window.startTime*1000||c.latestMs>=window.endTime*1000)?'TRADE_PERIOD_OR_CLOCK_UNKNOWN':route.status!=='OBSERVED'?'TRADE_RADAR_UNKNOWN':base.cargo.cityId!==p.cityId||p.cityId===p.mvToCityId||!route.destinations.some(r=>r.cityId===p.mvToCityId)?'TRADE_ROUTE_TARGET_UNKNOWN':base.cargo.moveStartTime>base.cargo.moveEndTime||[f.clock.start,f.clock.end,time].some(c=>c.earliestMs<base.cargo.moveEndTime*1000)?'TRADE_TRAVELLING_OR_ENDPOINT_UNCERTAIN':!['gotAchieveRwdId','gotReportRwdId','guildReportNum'].every(k=>get(f.first,k)===get(f.last,k))?'TRADE_CLAIM_STATE_CHANGED':!['TradeGuildRadarRequest','TradeGuildRadarResponse','TradeMoveRequest','TradeMoveResponse'].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const beforeState=base?{...base,radarCityIds:route.destinations.map(r=>r.cityId)}:null,target={period,cityId:p.cityId,mvToCityId:p.mvToCityId},costs=[],budgetClaims={resources:[],quotas:[{id:'trade:'+period+':cargo-move',num:1}],uids:[{type:'trade-cargo',id:String(period)}]};
 const expectedState=base?{context:copy(base.context),period,player:copy(base.player),claims:copy(base.claims),inventory:copy(base.inventory),receiptRule:{source:'TradeMoveResponse.cargo',constraint:'EXACT_TYPED_AND_INDEPENDENT_CARGO_WITH_TARGET_AND_FUTURE_ENDPOINT',arrivalConfirmed:false}}:null;
 const identity=hash({beforeState,expectedState,target}),actionId='trade:move:'+period+':'+p.cityId+':'+p.mvToCityId+':'+identity;
 return {module:'trade',actionId,actionType:'MOVE',target,parameters:copy(p),identity,beforeState,expectedState,costs,costSource:'Fixed v76 TradeMessageView._onMoveToCity/_onSendMoveToCity: exact current cityId and explicit Radar mvToCityId, zero resource fields or debit; dedicated cargo plus independent full Info verifies the established leg, never arrival or revenue.',budgetClaims,executable:reason===null,blockedReason:reason,label:'单航段 '+p.cityId+' → '+p.mvToCityId,requiredLevel:minimum,...(reason===null?{action:{request:'TradeMoveRequest',response:'TradeMoveResponse',body:{cityId:p.cityId,mvToCityId:p.mvToCityId}}}:{})};
}
function verifyMove(operation,before,after,result){
 const no=reason=>({confirmed:false,reason}),canonical=moveCandidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}},true);
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('单航段合同与写前事实不一致');
 const cargo=own(result,'cargo')?infoOf({cargo:result.cargo}).cargo:null,time=live.get(after)?clockOf(live.get(after).client,after.context):null,window=after.activity?.period;
 if(!cargo||!time||cargo.cargoLv!==before.state.cargo.cargoLv||![canonical.target.cityId,canonical.target.mvToCityId].includes(cargo.cityId)||cargo.moveToCityId!==canonical.target.mvToCityId||cargo.moveStartTime<Math.floor(before.clock.end.earliestMs/1000)||cargo.moveStartTime>Math.floor(after.clock.start.latestMs/1000)||cargo.moveStartTime>=cargo.moveEndTime||cargo.moveEndTime*1000<=time.latestMs||cargo.moveStartTime*1000>time.latestMs)return no('缺少当前精确目标航段、完整回执或可信未来终点；不能推测到达');
 const expected=copy(canonical.expectedState);delete expected.receiptRule;expected.cargo=cargo;
 if(!same(after.state,expected)||!same(infoOf(after.first),infoOf(after.last))||after.activity.period.period!==before.activity.period.period||time.earliestMs<window.startTime*1000||time.latestMs>=window.endTime*1000)return no('独立完整Info未确认相同航段及普通库存/贸易币/持货不变');
 return {confirmed:true,afterState:copy(after.state),reason:'专用cargo回执与独立完整Info确认精确单航段已建立；不证明到达、价格或收益',responseEvidence:{period:canonical.target.period,originCityId:canonical.target.cityId,mvToCityId:canonical.target.mvToCityId,moveStartTime:cargo.moveStartTime,moveEndTime:cargo.moveEndTime,arrivalConfirmed:false}};
}
const tradeSpeedItem='海商王加速';
function speedPolicy(config){
 const read=key=>{const raw=get(configRow(config,'ActivityTradeCfg','key',key),'value');return typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)&&positive(Number(raw))?Number(raw):null;},minutes=read('海商王加速时长'),travelMinutes=read('海商王行驶时间'),item=configRow(config,'ItemCfg','id',tradeSpeedItem);
 if(!minutes||!travelMinutes||!positive(minutes*60)||!positive(travelMinutes*60)||get(item,'desc')!=='用于海商王活动中加速商船航行'+minutes+'分钟'||Math.floor(travelMinutes/minutes)<1)return null;
 return {itemId:tradeSpeedItem,secondsEach:minutes*60,maxTimes:Math.floor(travelMinutes/minutes)};
}
function speedCandidate(f,{config=f?.configEvidence,moduleConfig={enabled:false}}={},settlement=false){
 const p=f?.parameters??{},base=copy(f?.state??null),period=base?.period??null,policy=speedPolicy(config),source=live.get(f),time=source?clockOf(source.client,f.context):null,window=f?.activity?.period,cargo=base?.cargo;
 const required=configRow(config,'ModuleOpenCfg','moduleId','海商王'),minimum=positive(get(required,'playerLevel'))?required.playerLevel:null,configMatches=same(tables.map(n=>config?.tables?.[n]??null),tables.map(n=>f?.configEvidence?.tables?.[n]??null));
 const endpoint=policy&&cargo?cargo.moveEndTime-policy.secondsEach*p.num:null;
 const reason=!validateTradeConfig(moduleConfig).enabled?'TRADE_DISABLED':!tradeAuthority(f,{settlement})?'TRADE_AUTHORITY_UNKNOWN':!configMatches?'TRADE_CONFIG_CHANGED':minimum===null?'TRADE_MODULE_LEVEL_UNKNOWN':f.playerLevel<minimum?'TRADE_MODULE_LOCKED':!time||!positive(window?.period)||window.period!==period||[f.clock.start,f.clock.end,time].some(c=>!c||c.earliestMs<window.startTime*1000||c.latestMs>=window.endTime*1000)?'TRADE_PERIOD_OR_CLOCK_UNKNOWN':!policy?'TRADE_SPEED_POLICY_UNKNOWN':cargo.cityId!==p.cityId||cargo.moveToCityId!==p.mvToCityId||cargo.moveStartTime>=cargo.moveEndTime||!same(infoOf(f.first),infoOf(f.last))||[f.clock.start,f.clock.end,time].some(c=>c.earliestMs<cargo.moveStartTime*1000||c.latestMs>=cargo.moveEndTime*1000)?'TRADE_SPEED_LEG_UNKNOWN':p.num>policy.maxTimes?'TRADE_SPEED_QUANTITY_LIMIT':(f.stock.get(tradeSpeedItem)??0)<p.num?'TRADE_SPEED_STOCK_INSUFFICIENT':!positive(endpoint)||endpoint*1000<=time.latestMs?'TRADE_SPEED_COMPLETION_UNVERIFIED':!['TradeSpeedRequest','TradeSpeedResponse'].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const costs=[{id:tradeSpeedItem,num:p.num}],budgetClaims={resources:copy(costs),quotas:[{id:'trade:'+period+':cargo-speed',num:p.num}],uids:[{type:'trade-cargo',id:String(period)}]},target={period,cityId:p.cityId,mvToCityId:p.mvToCityId,num:p.num,moveStartTime:cargo?.moveStartTime??null,moveEndTime:cargo?.moveEndTime??null};
 const expectedState=base&&policy?{...copy(base),cargo:{...cargo,moveEndTime:endpoint},inventory:base.inventory.map(row=>row.id===tradeSpeedItem?{...row,num:row.num-p.num}:row).filter(row=>row.num>0)}:null;
 const identity=hash({beforeState:base,expectedState,target}),actionId='trade:speed:'+period+':'+p.cityId+':'+p.mvToCityId+':'+identity;
 return {module:'trade',actionId,actionType:'SPEED',target,parameters:copy(p),identity,beforeState:base,expectedState,costs,costSource:'Fixed v76 TradeSpeedPop._onUse owned TRADE_SPPED_ITEM branch and ItemCfg/ActivityTradeCfg: explicit useNum, exact owned item debit and configured seconds; only a still-future shortened endpoint. Purchase and completion are separate blocked contracts.',budgetClaims,executable:reason===null,blockedReason:reason,label:'自有商会指针 '+p.num+' 枚 · '+p.cityId+' → '+p.mvToCityId,requiredLevel:minimum,...(reason===null?{action:{request:'TradeSpeedRequest',response:'TradeSpeedResponse',body:{useNum:p.num}}}:{})};
}
function verifySpeed(operation,before,after,result){
 const no=reason=>({confirmed:false,reason}),canonical=speedCandidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}},true),time=live.get(after)?clockOf(live.get(after).client,after.context):null,window=after.activity?.period;
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('自有道具加速合同与写前事实不一致');
 if(!positive(get(result,'moveEndTime'))||result.moveEndTime!==canonical.expectedState.cargo.moveEndTime||!time||result.moveEndTime*1000<=time.latestMs||!same(after.state,canonical.expectedState)||!same(infoOf(after.first),infoOf(after.last))||after.activity.period.period!==before.activity.period.period||time.earliestMs<window.startTime*1000||time.latestMs>=window.endTime*1000)return no('未独立确认相同航段的精确未来终点、道具净扣及其他状态不变；不得推测到达');
 return {confirmed:true,afterState:copy(after.state),reason:'专用终点回执与独立完整Info/库存确认精确自有道具净扣和未来终点缩短；不证明到达或收益',responseEvidence:{period:canonical.target.period,useNum:canonical.target.num,moveEndTime:result.moveEndTime,arrivalConfirmed:false}};
}
const legClockSource='TradeInfoResponse.cargo/TradeInfoResponse.cargo/PingResponse.serverTimestamp';
const legClockReadiness=(leg,bounds)=>!bounds?'UNKNOWN':bounds.earliestMs>=leg.moveEndTime*1000?'READY_BY_CLOCK':bounds.latestMs<leg.moveEndTime*1000?'WAITING_BY_CLOCK':'BOUNDARY_UNCERTAIN';
export function validateTradeLegClockObservation(v){
 const keys=['status','source','leg','sourceAt','serverBounds','readiness','arrivalConfirmed','eligibility','executable','autoResume'],bounds=v?.serverBounds,leg=v?.leg,finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
 if(!plain(v,keys)||Reflect.ownKeys(v).length!==keys.length||!['OBSERVED','UNKNOWN'].includes(v.status)||v.source!==legClockSource||v.arrivalConfirmed!==false||v.eligibility!==null||v.executable!==false||v.autoResume!==false||
 (v.status==='UNKNOWN'?(leg!==null||v.sourceAt!==null||bounds!==null||v.readiness!=='UNKNOWN'):
 !plain(leg,['period','cargoLv','cityId','moveToCityId','moveStartTime','moveEndTime'])||Reflect.ownKeys(leg).length!==6||!['period','cargoLv','cityId','moveToCityId','moveStartTime','moveEndTime'].every(k=>positive(leg[k]))||leg.cityId===leg.moveToCityId||leg.moveStartTime>=leg.moveEndTime||!Number.isSafeInteger(v.sourceAt)||v.sourceAt<0||
 !plain(bounds,['earliestMs','latestMs'])||Reflect.ownKeys(bounds).length!==2||!finite(bounds.earliestMs)||!finite(bounds.latestMs)||bounds.earliestMs>bounds.latestMs||bounds.earliestMs<leg.moveStartTime*1000||v.readiness!==legClockReadiness(leg,bounds)))throw invalid('贸易航段等待历史须有精确同航段、两次独立Info及原可信时钟；不确认到达');
 return copy(v);
}
function tradeLegClockObservation(f){
 const p=f?.parameters,valid=p?.action==='move'&&tradeAuthority(f)&&same(infoOf(f.first),infoOf(f.last)),cargo=valid?f.state.cargo:null,owner=live.get(f),clock=valid&&owner?clockOf(owner.client,f.context):null;
 const known=Boolean(cargo&&positive(cargo.moveStartTime)&&cargo.moveStartTime<cargo.moveEndTime&&cargo.cityId===p.cityId&&cargo.moveToCityId===p.mvToCityId&&clock&&clock.earliestMs>=cargo.moveStartTime*1000),leg=known?{period:f.state.period,...cargo}:null,bounds=known?{earliestMs:clock.earliestMs,latestMs:clock.latestMs}:null;
 return validateTradeLegClockObservation({status:known?'OBSERVED':'UNKNOWN',source:legClockSource,leg,sourceAt:known?f.sourceAt.findLast(row=>row.name==='TradeInfoRequest').at:null,serverBounds:bounds,readiness:known?legClockReadiness(leg,bounds):'UNKNOWN',arrivalConfirmed:false,eligibility:null,executable:false,autoResume:false});
}

function buyPreparationHash(f,view,goodsId){
 const market=view.prices?.find(row=>row.goodsId===goodsId),good=configRow(f?.configEvidence,'TradeGoodsCfg','goodsId',goodsId);
 return current(f)&&view.status==='OBSERVED'&&f.activityStable&&market&&positive(market.price)&&uint(market.stock)&&positive(get(good,'capacity'))&&uint(get(good,'maxCount'))&&market.stock<=good.maxCount?hash({context:f.context,period:view.period,window:f.activity?.period??null,cargo:view.cargo,market:{goodsId,stock:market.stock,price:market.price},config:f.configEvidence}):null;
}
function tradeBuyTargets(f,view){
 if(!['buy',undefined].includes(f?.parameters?.action)||view.status!=='OBSERVED')return [];
 return view.prices.flatMap(row=>{const guard=buyPreparationHash(f,view,row.goodsId),good=configRow(f.configEvidence,'TradeGoodsCfg','goodsId',row.goodsId);return guard?[{goodsId:row.goodsId,cityId:view.cargo.cityId,expectedPeriod:view.period,expectedBuyHash:guard,price:row.price,stock:row.stock,unitCapacity:good.capacity,maxCount:good.maxCount,readOnly:true,preparationRequired:true}]:[];});
}
export function validateTradeBuyPreparation(v){
 if(!plain(v,['cityId','expectedPeriod','buys','maxDurationMs'])||Reflect.ownKeys(v).length!==4||!positive(v.cityId)||!positive(v.expectedPeriod)||!dense(v.buys)||!v.buys.length||v.buys.length>24||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('买入组合须明确当前港口/活动期数、1至24种不同货物和有限时长');
 const buys=v.buys.map(row=>{if(!plain(row,['goodsId','num','expectedBuyHash'])||Reflect.ownKeys(row).length!==3)throw invalid('买入目标须明确goodsId/数量/原报价摘要');const p=validateTradeParameters({action:'buy',cityId:v.cityId,expectedPeriod:v.expectedPeriod,...row});return {goodsId:p.goodsId,num:p.num,expectedBuyHash:p.expectedBuyHash};});
 if(new Set(buys.map(row=>row.goodsId)).size!==buys.length)throw invalid('买入组合每种货物只允许一次');return {cityId:v.cityId,expectedPeriod:v.expectedPeriod,buys,maxDurationMs:v.maxDurationMs};
}
export function prepareTradeBuyWorkflow(f,{config=f?.configEvidence,moduleConfig={enabled:false},...input}={}){
 const p=validateTradeBuyPreparation(input),view=observationTrade(f,{config}),owner=live.get(f);
 if(!owner||f?.parameters?.action!=='buy'||!tradeAuthority(f)||view.status!=='OBSERVED'||view.period!==p.expectedPeriod||view.cargo?.cityId!==p.cityId||!Number.isSafeInteger(view.capacity.remaining))throw invalid('买入组合的当前活动、港口、完整库存或仓位未知；须重新调查');
 const ledger=new ResourceLedger(f.stock),nodes=[{id:'start',type:'START'}];let capacity=0;
 const steps=p.buys.map((buy,i)=>{const parameters={action:'buy',cityId:p.cityId,expectedPeriod:p.expectedPeriod,...buy},target={...f,parameters};live.set(target,{client:owner.client,player:owner.player,digest:digest(target)});
  const candidate=buyCandidate(target,{config,moduleConfig},view),plan=planTrade(target,{config,moduleConfig,parameters,selections:[candidate.actionId],ledger});if(plan.actions.length!==1)throw invalid('所选货物当前无原买入资格或累计自有贸易币不足：'+(candidate.blockedReason??'TRADE_RUN_BUDGET_INSUFFICIENT'));const row=plan.actions[0],good=configRow(config,'TradeGoodsCfg','goodsId',buy.goodsId),used=good.capacity*buy.num;
  if(!Number.isSafeInteger(used)||!Number.isSafeInteger(capacity+used)||(capacity+=used)>view.capacity.remaining)throw invalid('所选货物累计占用超过当前剩余仓位');
  const selection={unique:true};nodes.push({id:'buy-'+i,type:'ACTION',module:'trade',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'trade'});return {parameters,selection,costs:copy(row.costs),quote:copy(row.quote),capacityUsed:used,budgetClaims:copy(row.budgetClaims)};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:steps.flatMap(row=>row.budgetClaims.quotas),uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...p,steps,budget,capacityUsed:capacity,graph:{version:1,id:'trade-buys-'+hash({p,steps,budget}).slice(0,20),name:'当前港口明确多货物买入',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['trade']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'当前港口每种明确货物只买一次，数量由用户指定。原buyCandidate/planTrade累计核初始自有贸易币及总仓位，固定原市场quota/UID父预算；每步原Function重新调查并单次授权，原typed回执和独立完整TradeInfo/库存确认精确扣币与唯一持货增加。原周期/航次/所选市场报价或配置变化、资格不足、拒绝或UNKNOWN停止；不以预计卖出补资金、不移动/卖出/补购或重放，不推断目的港收益。'};
}
function salePreparationHash(f,view,pid){
 const info=infoOf(f?.first),holding=info.goods?.find(row=>row.pid===pid),ship=info.cargo?configRow(f?.configEvidence,'TradeShipCfg','lv',info.cargo.cargoLv):null,price=holding?view.prices?.find(row=>row.goodsId===holding.goodsId)?.price:null;
 return current(f)&&view.status==='OBSERVED'&&holding&&ship&&uint(price)&&f.activityStable?hash({context:f.context,period:info.period,window:f.activity?.period??null,cargo:info.cargo,holding,price,config:f.configEvidence}):null;
}
function tradeSaleTargets(f,view){
 if(!['sell',undefined].includes(f?.parameters?.action)||view.status!=='OBSERVED')return [];
 return (view.quotes??[]).filter(quote=>quote.status==='PREVIEW').flatMap(quote=>{const holding=view.holdings.find(row=>row.pid===quote.pid),guard=salePreparationHash(f,view,quote.pid);return holding&&guard?[{parameters:{action:'sell',cityId:view.cargo.cityId,pid:holding.pid,num:holding.num,expectedPeriod:view.period,expectedSaleHash:guard},quote:copy(quote),readOnly:true,preparationRequired:true}]:[];});
}
export function validateTradeSalePreparation(v){
 if(!plain(v,['cityId','expectedPeriod','sales','maxDurationMs'])||Reflect.ownKeys(v).length!==4||!positive(v.cityId)||!positive(v.expectedPeriod)||!dense(v.sales)||!v.sales.length||v.sales.length>24||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('出售组合须明确当前港口/活动期数、1至24个不同持货批次和有限总时长');
 const sales=v.sales.map(row=>{if(!plain(row,['pid','num','expectedSaleHash'])||Reflect.ownKeys(row).length!==3)throw invalid('出售目标须明确pid/全批数量/原报价身份摘要');const p=validateTradeParameters({action:'sell',cityId:v.cityId,expectedPeriod:v.expectedPeriod,...row});return {pid:p.pid,num:p.num,expectedSaleHash:p.expectedSaleHash};});
 if(new Set(sales.map(row=>row.pid)).size!==sales.length)throw invalid('出售组合不得重复持货PID');return {cityId:v.cityId,expectedPeriod:v.expectedPeriod,sales,maxDurationMs:v.maxDurationMs};
}
export function prepareTradeSaleWorkflow(f,{config=f?.configEvidence,moduleConfig={enabled:false},...input}={}){
 const p=validateTradeSalePreparation(input),view=observationTrade(f,{config}),owner=live.get(f);
 if(!owner||f?.parameters?.action!=='sell'||!tradeAuthority(f)||view.status!=='OBSERVED'||view.period!==p.expectedPeriod||view.cargo?.cityId!==p.cityId)throw invalid('出售组合的当前活动、港口或完整原始来源已改变；须重新调查');
 const nodes=[{id:'start',type:'START'}];let coins=f.state.player.coins;
 const steps=p.sales.map((sale,i)=>{const parameters={action:'sell',cityId:p.cityId,expectedPeriod:p.expectedPeriod,...sale},holding=f.state.player.goods.find(row=>row.pid===sale.pid);
  if(!holding||holding.num!==sale.num)throw invalid('仅支持明确所选持货全批数量；持货变化须重新调查，部分出售保留原单次入口');
  const target={...f,parameters};live.set(target,{client:owner.client,player:owner.player,digest:digest(target)});
  const row=saleCandidate(target,{config,moduleConfig},view);if(!row.executable)throw Object.assign(new Error('明确持货尚无当前出售资格：'+row.blockedReason),{code:row.blockedReason,statusCode:409});
  coins+=row.quote.total;if(!uint(coins))throw invalid('所选全批出售超过原贸易币int32余额边界');
  const selection={unique:true};nodes.push({id:'sale-'+i,type:'ACTION',module:'trade',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'trade'});return {parameters,selection,costs:[],quote:copy(row.quote),budgetClaims:copy(row.budgetClaims)};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:steps.flatMap(row=>row.budgetClaims.quotas),uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...p,steps,budget,graph:{version:1,id:'trade-sales-'+hash({p,steps}).slice(0,20),name:'当前港口明确持货逐批出售',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['trade']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'仅当前港口明确勾选的持货全批非亏损出售；原Function每批重新调查活动窗口、港口、持货、价格与配置身份，单次授权、专用TradeSell回执及独立TradeInfo完整结算验证。活动/航次/持货/报价变化、拒绝或UNKNOWN停止，不重发、不移动或购买。固定原持货quota/UID父预算，预计售得不补额度，maxCoins/profit沿原专用回执独立确认，不猜公式或目的港行情。'};
}

function selectedTradeCandidate(f,options,view,parameters){
 return parameters.action==='speed'?speedCandidate(f,options):parameters.action==='move'?moveCandidate(f,options):
  (parameters.action==='buy'?buyCandidate:saleCandidate)(f,options,view);
}
export function viewTrade(f,options={}){
 const parameters=validateTradeParameters(options.parameters??f?.parameters??{});if(isPass(parameters))return viewTradePass(f,{...options,parameters});const view=observationTrade(f,options);
 view.salePreparation=tradeSaleTargets(f,view);view.buyPreparation=tradeBuyTargets(f,view);
 view.cooldownObservation=tradeLegClockObservation(f);view.route=routeObservation(f);view.speed={policy:speedPolicy(options.config??f?.configEvidence),owned:f?.stockReliable?f.stock.get(tradeSpeedItem)??0:null,arrivalConfirmed:false};
 if(parameters.action){const speeding=parameters.action==='speed',moving=parameters.action==='move',buy=parameters.action==='buy';view.candidates=[selectedTradeCandidate(f,options,view,parameters)];view.blocked=view.blocked.filter(row=>row.actionType!==(speeding?'SPEED':moving?'MOVE':buy?'BUY':'SELL'));}
 view.notes.push('卖出须明确港口、持货批次和数量，单次非亏损；预计售得不进入预算。maxCoins/profit仅采纳专用回执并独立复读，不猜测更新公式。');return view;
}
export function planTrade(f,{parameters=f?.parameters??{},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}){
 parameters=validateTradeParameters(parameters);if(!dense(selections)||selections.length>1||selections.some(v=>typeof v!=='string'||!v.length||v.length>300))throw invalid('贸易每批只能选择一个精确actionId');
 if(!same(parameters,f?.parameters??{}))return {module:'trade',actions:[],notes:[]};
 // A plan needs only the selected candidate, not all preparable market/holding
 // hashes. Both paths still use the same observation and candidate checks.
 const candidate=isPass(parameters)?passCandidate(f,options):parameters.action?selectedTradeCandidate(f,{...options,parameters},observationTrade(f,options),parameters):null;
 const row=candidate?.executable&&selections.includes(candidate.actionId)?candidate:null;
 return {module:'trade',actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[isPass(parameters)?'仅原活动当前全部已达标未领免费档位；typed回执与独立双复读/库存共同确认，零支出，父档位UID固定，不购买、激活付费或补级。':'行情预览不是到账；仅明确单次买入、非亏损卖出、Radar 单航段或自有道具保持未来终点的加速可生成候选，其他交易分支保持独立。']};
}
export function verifyTrade(operation,before,after,result){
 const no=reason=>({confirmed:false,reason});
 if(isPass(before?.parameters))return verifyTradePass(operation,before,after,result);
 if(!tradeAuthority(before,{settlement:true})||!tradeAuthority(after)||!same(before.context,after.context)||!same(before.configEvidence,after.configEvidence))return no('贸易写前/写后事实、当前连接或活动来源不可靠');
 if(before.parameters.action==='speed')return verifySpeed(operation,before,after,result);
 if(before.parameters.action==='move')return verifyMove(operation,before,after,result);
 const canonical=(before.parameters.action==='buy'?buyCandidate:saleCandidate)(before,{config:before.configEvidence,moduleConfig:{enabled:true}},observationTrade(before),true);
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('贸易合同与写前事实不一致');
 const receipt=own(result,'player')?infoOf({player:result.player}):null;
 if(!receipt?.balances||!receipt.goods)return no('缺少完整专用贸易回执player');
 if(canonical.actionType==='BUY'&&!boughtGoods(before.state.player.goods,receipt.goods,canonical.parameters,canonical.quote.price))return no('未确认唯一精确持货新增或增加；PID仅采纳回执与独立读');
 const expected=copy(canonical.expectedState);delete expected.receiptRule;expected.player={...expected.player,maxCoins:receipt.balances.maxCoins,profit:receipt.balances.profit,...(canonical.actionType==='BUY'?{goods:receipt.goods}:{})};
 if(!same({...receipt.balances,goods:receipt.goods},expected.player)||!same(after.state,expected)||observationTrade(after).status!=='OBSERVED'||after.activity.period.period!==before.activity.period.period)return no('独立复读未确认同周期、同港口、精确持货/贸易币变化，或无关状态变化');
 const time=live.get(after)?clockOf(live.get(after).client,after.context):null,period=after.activity.period;
 if(!time||time.earliestMs<period.startTime*1000||time.latestMs>=period.endTime*1000)return no('贸易窗口已过期或可信时钟未知');
 if(canonical.actionType==='BUY')return {confirmed:true,afterState:copy(after.state),reason:'单次买入专用回执与独立完整持货/精确贸易币净扣一致，普通库存不变',responseEvidence:{cityId:operation.target.cityId,goodsId:operation.target.goodsId,buyNum:operation.target.num,coinsSpent:canonical.quote.total}};
 return {confirmed:true,afterState:copy(after.state),reason:'单次卖出专用回执与独立TradeInfo完整玩家、精确贸易币净入/持货扣减及普通库存不变一致',responseEvidence:{cityId:operation.target.cityId,pid:operation.target.pid,sellNum:operation.target.num,coinsReceived:canonical.quote.total,profitPreview:canonical.quote.profit,maxCoins:receipt.balances.maxCoins,cumulativeProfit:receipt.balances.profit}};
}
export const tradeModule=Object.freeze({id:'trade',resourcePreflight:'SURVEY',label:'海商王',capabilities:Object.freeze(['C521','C522','C523','C524']),evidence:TRADE_EVIDENCE,defaultConfig:Object.freeze({enabled:false}),validateConfig:validateTradeConfig,validateParameters:validateTradeParameters,survey:surveyTrade,view:viewTrade,plan:planTrade,verify:verifyTrade,rejectionIdentity:businessRejectionIdentity});


// Existing Workflow trace owns persistence. Retain bounded observation counts,
// never price payloads, player identity, a simulated receipt or a write permit.
const observationFields=['scope','source','status','period','cityId','cargoLv','priceCount','holdingCount','nonLossPreviewCount','unknownQuoteCount'];
const observationValues=observationFields.slice(3),countFields=observationFields.slice(6);
const observationSource='TradeInfoResponse/TradeCityResponse/TradeInfoResponse';
export function validateTradeObservationSummary(value){
 if(!plain(value,observationFields)||observationFields.some(k=>!own(value,k))||value.scope!=='CURRENT_PORT_RESPONSE_ONLY'||value.source!==observationSource||!['OBSERVED','UNKNOWN'].includes(value.status))throw invalid('海商王观察摘要缺少明确来源或范围');
 if(value.status==='UNKNOWN'){
  if(observationValues.some(k=>value[k]!==null))throw invalid('未知海商王观察不能推断港口、周期或计数');
 }else if(['period','cityId','cargoLv'].some(k=>!positive(value[k]))||countFields.some(k=>!uint(value[k])||value[k]>10000)||value.nonLossPreviewCount+value.unknownQuoteCount!==value.holdingCount)throw invalid('海商王观察摘要周期或计数无效');
 return copy(value);
}
export function summarizeTradeObservation(view){
 const summary={scope:'CURRENT_PORT_RESPONSE_ONLY',source:observationSource,status:'UNKNOWN',...Object.fromEntries(observationValues.map(k=>[k,null]))};
 if(get(view,'readOnly')!==true||get(view,'scope')!==summary.scope||get(view,'status')!=='OBSERVED'||get(view,'reason')!==null||!positive(get(view,'period'))||!positive(get(get(view,'cargo'),'cityId'))||!positive(get(get(view,'cargo'),'cargoLv')))return summary;
 const prices=rowsOf(view,'prices',['goodsId','stock','price'],['goodsId','price'],'goodsId'),holdings=rowsOf(view,'holdings',['pid','goodsId','num','buyPrice','cityId'],['pid','goodsId','num','buyPrice','cityId'],'pid'),quotes=get(view,'quotes');
 if(!prices||!holdings||!dense(quotes)||quotes.length!==holdings.length)return summary;
 const seen=new Set();let previews=0;
 for(const q of quotes){const pid=get(q,'pid'),row=holdings.find(r=>r.pid===pid);if(!row||seen.has(pid)||get(q,'num')!==row.num||get(q,'goodsId')!==row.goodsId)return summary;seen.add(pid);
  if(get(q,'status')==='PREVIEW'){
   if(get(q,'reason')!==null||!Number.isSafeInteger(get(q,'profit'))||q.profit<0||!Number.isSafeInteger(get(q,'total'))||q.total<=0||!positive(get(q,'price'))||q.price<row.buyPrice||row.cityId===view.cargo.cityId||prices.find(p=>p.goodsId===row.goodsId)?.price!==q.price)return summary;
   previews++;
  }else if(get(q,'status')!=='UNKNOWN'||get(q,'profit')!==null||get(q,'total')!==null)return summary;
 }
 return validateTradeObservationSummary({...summary,status:'OBSERVED',period:view.period,cityId:view.cargo.cityId,cargoLv:view.cargo.cargoLv,priceCount:prices.length,holdingCount:holdings.length,nonLossPreviewCount:previews,unknownQuoteCount:holdings.length-previews});
}

export const TRADE_FREE_PASS_EVIDENCE=Object.freeze({requirement:'BIZ-R13',source:'v76 TradeView._onBtnPass -> BattlePassUtil.openPop BP_TRADE=3; BattlePassPop._hasPassReward/_onBtnGot; BattlePassItem freeGot/score and TradePassCfg.freeReward; no active paid branch',popSha256:'41bec259966e1469898bb3921a9e6e122ccdcfe233a387db3e1b9221efe80dc7',itemSha256:'4f667d17cd25120b819dc5dd7a18a6b719ad36965b548b8c84a565548b2d9fae',request:'BattlePassGotRewardRequest',response:'BattlePassGotRewardResponse',type:3,scope:'ALL_CURRENT_REACHED_UNCLAIMED_FREE_TIERS_WITH_ACTIVE_PAY_FALSE',realGame:'REAL_UNVERIFIED'});
function passOf(raw){
 if(!['got','activePay','score','endTime'].every(k=>own(raw,k))||!dense(raw.got)||typeof raw.activePay!=='boolean'||!uint(raw.score)||!positive(raw.endTime))return null;
 const got=[];for(const r of raw.got){if(!positive(get(r,'id'))||typeof get(r,'freeGot')!=='boolean'||typeof get(r,'payGot')!=='boolean'||got.some(a=>a.id===r.id))return null;got.push({id:r.id,freeGot:r.freeGot,payGot:r.payGot});}
 return {got:got.sort((a,b)=>a.id-b.id),activePay:raw.activePay,score:raw.score,endTime:raw.endTime};
}
async function surveyTradePass(client,protocol,{player,config,parameters,signal,stop,timeout}){
 const context=contextOf(client,player),opts={signal,stop},sourceAt=[],notes=[],activity=readTradeActivitySnapshot(client,context),start=clockOf(client,context);
 const active=()=>{assertExecutionActive(client,opts);if(!same(context,contextOf(client,player)))throw Object.assign(new Error('海商王战令调查期间身份变化'),{code:'CANCELLED'});};
 const read=async(name,body={})=>{active();const response=name.replace(/Request$/,'Response');if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return null;}try{const value=await awaitExecution(client.request(name,body,response,timeout,{signal}),client,opts);active();sourceAt.push({name,at:Date.now()});return toSnapshotJson(value);}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(name+': STATE_UNKNOWN');return null;}};
 const first=await read('TradeInfoRequest'),passFirst=await read('BattlePassRequest',{type:3}),items=await read('AllItemRequest'),resources=await read('AllResourceRequest'),passLast=await read('BattlePassRequest',{type:3}),last=await read('TradeInfoRequest');active();const end=clockOf(client,context),inventory={items,resources},stock=parseOperationInventory(items,resources);
 const f={module:'trade',parameters,context,first,last,passFirst,passLast,pass:passOf(passFirst),city:null,radar:null,clock:{start,end},notes,activity,activityStable:same(activity,readTradeActivitySnapshot(client,context)),sourceAt,playerLevel:positive(player?.level)?player.level:null,available:Object.keys(protocol??{}),inventory,...stock,configEvidence:{tables:Object.fromEntries(tablesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)]))}};
 f.state=ownState(f);live.set(f,{client,player,digest:digest(f)});return f;
}
function passDefinition(f,config){
 const raw=config?.tables?.TradePassCfg?.data,items=config?.tables?.ItemCfg?.data,known=new Set(Object.values(RESOURCE_NAMES));if(!dense(raw)||!dense(items))return null;for(const r of items)if(typeof r?.id==='string')known.add(r.id);
 const rows=raw.filter(r=>r.period===f?.state?.period),defs=[];let lastId=0,lastScore=0;
 for(const r of rows){if(!positive(r.rwdId)||r.rwdId<=lastId||!positive(r.reqScore)||r.reqScore<=lastScore||!dense(r.freeReward)||!r.freeReward.length)return null;const rewards=[];for(const pair of r.freeReward){if(!dense(pair)||pair.length!==2||!known.has(pair[0])||!positive(pair[1])||rewards.some(a=>a.id===pair[0]))return null;rewards.push({id:pair[0],num:pair[1]});}defs.push({id:r.rwdId,reqScore:r.reqScore,rewards});lastId=r.rwdId;lastScore=r.reqScore;}
 return defs.length?defs:null;
}
function passPolicy(f,config){
 const pass=f?.pass,defs=passDefinition(f,config);if(!pass||!defs||pass.activePay!==false||pass.got.some(r=>r.payGot!==false||!defs.some(d=>d.id===r.id)))return null;
 const eligible=defs.filter(d=>d.reqScore<=pass.score&&!pass.got.some(r=>r.id===d.id&&r.freeGot)),totals=new Map();
 for(const d of eligible)for(const r of d.rewards){const n=(totals.get(r.id)??0)+r.num;if(!Number.isSafeInteger(n))return null;totals.set(r.id,n);}
 const got=new Map(pass.got.map(r=>[r.id,copy(r)]));for(const d of eligible)got.set(d.id,{id:d.id,freeGot:true,payGot:false});
 return {tiers:eligible,rewards:[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num})),pass:{...copy(pass),got:[...got.values()].sort((a,b)=>a.id-b.id)}};
}
function passCandidate(f,{config=f?.configEvidence,moduleConfig={enabled:false}}={},settlement=false){
 const policy=passPolicy(f,config),window=f?.activity?.period,owner=live.get(f),time=owner?clockOf(owner.client,f.context):null,minimum=configRow(config,'ModuleOpenCfg','moduleId','海商王')?.playerLevel;
 const target={period:f?.state?.period??null,type:3,startTime:window?.startTime??null,endTime:window?.endTime??null,passEndTime:f?.pass?.endTime??null,tiers:policy?.tiers.map(r=>r.id)??[]},action={request:'BattlePassGotRewardRequest',response:'BattlePassGotRewardResponse',body:{type:3}},costs=[];
 let reason=!validateTradeConfig(moduleConfig).enabled?'TRADE_DISABLED':!tradeAuthority(f,{settlement})?'TRADE_AUTHORITY_UNKNOWN':!same(tablesFor(f.parameters).map(n=>config?.tables?.[n]??null),tablesFor(f.parameters).map(n=>f.configEvidence.tables[n]))?'TRADE_CONFIG_CHANGED':!same(f.first,f.last)||!f.pass||!same(f.pass,passOf(f.passLast))?'TRADE_PASS_OR_PERIOD_CHANGED_DURING_READ':!positive(minimum)||f.playerLevel<minimum?'TRADE_MODULE_LOCKED':!policy?'TRADE_FREE_PASS_CONFIG_OR_UNPAID_ENTITLEMENT_UNKNOWN':!policy.tiers.length?'TRADE_FREE_PASS_NO_CURRENT_REWARDS':!positive(window?.period)||window.period!==f.state.period||![f.clock.start,f.clock.end,time].every(c=>c&&c.earliestMs>=window.startTime*1000&&c.latestMs<Math.min(window.endTime,f.pass.endTime)*1000)?'TRADE_FREE_PASS_WINDOW_OR_CLOCK_UNKNOWN':!['BattlePassRequest','BattlePassResponse',action.request,action.response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 if(!reason)try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}
 return {module:'trade',actionId:'trade:FREE-PASS:'+hash(target),actionType:'CLAIM-FREE-PASS',parameters:copy(f?.parameters??{}),target,identity:hash({context:f?.context,state:f?.state,pass:f?.pass,config:f?.configEvidence}),beforeState:{context:copy(f?.context??null),trade:copy(f?.state??null),pass:copy(f?.pass??null)},expectedState:{pass:copy(policy?.pass??null),rewards:copy(policy?.rewards??null)},costs,costSource:TRADE_FREE_PASS_EVIDENCE.source,budgetClaims:{resources:[],quotas:[],uids:policy?.tiers.map(r=>({type:'trade-free-pass',id:[target.period,target.startTime,target.endTime,r.id].join(':')}))??[]},rewards:copy(policy?.rewards??null),executable:reason===null,blockedReason:reason,label:'海商王当前免费战令 '+(target.tiers.join('、')||'无可领档位'),...(reason===null?{action}:{})};
}
function viewTradePass(f,options){const row=passCandidate(f,options);return {module:'trade',mode:'claim-pass',period:f?.state?.period??null,pass:copy(f?.pass??null),passTiers:passDefinition(f,options.config??f?.configEvidence),candidates:[row],blocked:row.executable?[]:[row],notes:[...(f?.notes??[]),'只领取当前未激活付费战令的全部已达标未领免费档位；不购买、补级、付费领取或跨期推定。'],evidence:TRADE_FREE_PASS_EVIDENCE};}
function verifyTradePass(op,b,a,result){
 const no=reason=>({confirmed:false,reason});if(!tradeAuthority(b,{settlement:true})||!tradeAuthority(a)||!same(b.context,a.context)||!same(b.configEvidence,a.configEvidence)||!same(a.first,a.last)||!same(a.pass,passOf(a.passLast))||a.sourceAt.some((r,i)=>r.at<b.sourceAt[i].at))return no('TRADE_FREE_PASS_AUTHORITY_OR_POST_READ_UNKNOWN');
 const row=passCandidate(b,{config:b.configEvidence,moduleConfig:{enabled:true}},true);if(!row.executable||['module','actionId','actionType','parameters','target','identity','beforeState','expectedState','costs','costSource','budgetClaims','rewards','action'].some(k=>!same(op[k],row[k])))return no('TRADE_FREE_PASS_PLAN_MISMATCH');
 const got=own(result,'got')?passOf({...b.pass,got:toSnapshotJson(result.got)}):null,received=parseReceivedOrderReward({reward:result?.reward});
 if(!got||!same(got,row.expectedState.pass)||!same(a.pass,row.expectedState.pass)||received.status!=='PARSED'||!same(received.assets.map(r=>({id:r.id,num:r.num})).sort((x,y)=>x.id.localeCompare(y.id)),row.rewards)||received.assets.some(r=>r.type!==(Object.values(RESOURCE_NAMES).includes(r.id)?1:0)))return no('TRADE_FREE_PASS_TYPED_TIERS_OR_REWARDS_NOT_CONFIRMED');
 const before=copy(b.state),after=copy(a.state);delete before.inventory;delete after.inventory;if(!same(before,after)||!same(b.first,a.first)||!stockMatchesDelta(b.stock,a.stock,[],row.rewards))return no('TRADE_FREE_PASS_TRADE_OR_EXACT_REWARD_NET_IN_CHANGED');
 return {confirmed:true,reason:'原typed免费战令完整已领表及奖励与独立双重战令复读一致，全部当前免费档位精确转已领、付费仍未激活；贸易/船舱/其他状态保持且完整库存精确净入',afterState:{context:copy(a.context),trade:copy(a.state),pass:copy(a.pass)},responseEvidence:{type:3,tiers:copy(row.target.tiers),rewards:copy(row.rewards)}};
}
