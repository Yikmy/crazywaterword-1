// W18 / C521 and C522: bounded current-port observation, never a write permit.
import { createHash } from 'node:crypto';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable;
const get=(v,k)=>own(v,k)?v[k]:undefined;
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647,positive=v=>uint(v)&&v>0;
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const plain=(v,keys)=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&own(v,k));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const live=new WeakMap(),tables=['TradeGoodsCfg','TradeShipCfg'];
export const TRADE_EVIDENCE=Object.freeze({source:'Fixed v76 TradeUtil.ts / TradeModel.ts / TradeSellPop.ts',scope:'CURRENT_PORT_RESPONSE_ONLY',semantics:'TradeShipCfg supplies capacity and profitMargin. Non-loss sale preview = buyPrice*num + ceil((price-buyPrice)*num*(10000+profitMargin)/10000). Preview is not income or eligibility.',realGame:'REAL_UNVERIFIED'});
export function validateTradeParameters(v={}){if(!plain(v,[]))throw invalid('海商王当前港口观察只接受空参数');return {};}
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
function digest(f){return hash({context:f.context,parameters:f.parameters,first:f.first,last:f.last,city:f.city,clock:f.clock,notes:f.notes,configEvidence:f.configEvidence});}
export async function surveyTrade(client,protocol,{player,config,parameters={},signal,stop,timeout=15000}={}){
 parameters=validateTradeParameters(parameters);const opts={signal,stop},context=contextOf(client,player),notes=[];
 const active=()=>{assertExecutionActive(client,opts);if(!same(context,contextOf(client,player)))throw Object.assign(new Error('海商王观察期间账号、角色、世界或连接变化'),{code:'CANCELLED'});};
 const read=async(name,body={})=>{active();const response=name.replace(/Request$/,'Response');if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return null;}try{const value=await awaitExecution(client.request(name,body,response,timeout,{signal}),client,opts);active();return toSnapshotJson(value);}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return null;}};
 active();const first=await read('TradeInfoRequest'),info=infoOf(first),start=clockOf(client,context);
 // A trusted lower bound must already be past the explicit travel endpoint.
 // Time passing alone never changes the port: use only TradeInfo.cargo.cityId.
 const docked=info.period!==null&&info.cargo&&start&&start.earliestMs>=info.cargo.moveEndTime*1000;
 const city=docked?await read('TradeCityRequest',{cityId:info.cargo.cityId}):null;
 const last=docked?await read('TradeInfoRequest'):null,end=clockOf(client,context);active();
 const f={module:'trade',parameters,context,first,last,city,clock:{start,end},notes,configEvidence:{tables:Object.fromEntries(tables.map(n=>[n,copy(config?.tables?.[n]??null)]))}};
 live.set(f,{client,player,digest:digest(f)});return f;
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
export function viewTrade(f,{config=f?.configEvidence}={}){
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
 return {module:'trade',readOnly:true,scope:'CURRENT_PORT_RESPONSE_ONLY',status:reason?'UNKNOWN':'OBSERVED',reason,period:info.period,balances:info.balances,cargo:info.cargo,holdings,prices,quotes,capacity:{used:usedCapacity,total:capacity,remaining:remainingCapacity},candidates:[],blocked:[{actionType:'BUY',code:'NOT_IMPLEMENTED',reason:'购买资格、精确成本及独立结算合同尚未接入'},{actionType:'SELL',code:'NOT_IMPLEMENTED',reason:'预览不证明当前售价、可售资格或到账；精确单次写入与恢复合同尚未接入'},{actionType:'MOVE',code:'NOT_IMPLEMENTED',reason:'路线、移动及加速需独立合同'}],notes:[...(f?.notes??[]),'仅当前港口响应；前后货舱相同不证明原子快照。stock 仅显示服务端原值，不解释为可买数量。maxCoins/profit 保留原字段含义，不推导余额上限。预计售得不计入库存、预算或历史到账。']};
}
export function planTrade(f,options={}){validateTradeParameters(options.parameters??{});return {module:'trade',actions:[],notes:['海商王当前只读；行情和利润预览不产生执行动作。']};}
export const tradeModule=Object.freeze({id:'trade',label:'海商王',capabilities:Object.freeze(['C521','C522']),evidence:TRADE_EVIDENCE,defaultConfig:Object.freeze({enabled:false}),validateConfig:validateTradeConfig,validateParameters:validateTradeParameters,survey:surveyTrade,view:viewTrade,plan:planTrade,verify:()=>({confirmed:false,reason:'海商王当前只读，不能确认任何买卖或移动结果'})});


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
