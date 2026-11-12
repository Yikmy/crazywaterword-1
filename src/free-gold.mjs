// W16/BIZ-D06: one ordinary free click, bound to the observed server reset marker.
// The shared executor owns authorization, persistence, budgets and transport.
import { createHash } from 'node:crypto';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const moduleId='free-gold',scope={kind:'ACCOUNT'},request='ClickGoldRequest',response='ClickGoldResponse';
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const uint=n=>Number.isInteger(n)&&n>=0&&n<=2147483647,positive=n=>uint(n)&&n>0;
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const fields=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const configNames=['OfflineParamCfg','ModuleOpenCfg'];
const sources={gold:'ClickGoldInfoResponse',items:'AllItemResponse',resources:'AllResourceResponse'};
const liveFacts=new WeakMap(),costSource='Fixed v76 DianJinPop._checkNormalClickGold; OfflineParamCfg.免费点金次数; exactly times=1/free=true, zero resource debit';
export const FREE_GOLD_EVIDENCE=Object.freeze({
 source:'Fixed v76 main/game.js DianJinPop.ts; JumpProxy/ModuleOpenUtil',byteOffset:1706469,openCheckByteOffset:3851566,
 semantics:'freeTimes is used count; resetTime minus timer.getServerTime is seconds remaining; result[i].gold is displayed as GOLD without multiplying ratio',
 realGame:'REAL_UNVERIFIED'
});
export const FREE_GOLD_DEFAULT_CONFIG=Object.freeze({enabled:false});
export function validateFreeGoldConfig(v={}) {
 if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('免费点金配置只接受 enabled 布尔值');
 return {enabled:v.enabled??false};
}
export function validateFreeGoldParameters(v={}) {
 if(!fields(v,[]))throw invalid('普通免费点金只接受空参数，固定单次且禁止付费');
 return {};
}
function roleId(v) {
 if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<=0))return null;
 const n=toSnapshotJson(v);
 if(!(typeof n==='number'||typeof n==='string'&&/^[1-9][0-9]*$/.test(n)))return null;
 try{return BigInt(n)>0n&&BigInt(n)<(1n<<63n)?String(n):null;}catch{return null;}
}
function contextOf(client,player) {
 const c=client.factContext,role=k=>{const id=own(player,k)?roleId(player[k]):null;return own(c,k)&&roleId(c[k])!==id?null:id;};
 return {accountId:text(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId'),playerLevel:own(player,'level')&&positive(player.level)?player.level:null};
}
function clockOf(client,context) {
 let c;try{c=client.gameClock?.read(context);}catch{return null;}
 if(c?.status!=='TRUSTED'||c.reliable!==true||c.source!=='PingResponse.serverTimestamp'||c.accountId!==context.accountId||c.generation!==context.generation||!['earliestMs','nowMs','latestMs'].every(k=>own(c,k)&&Number.isFinite(c[k])&&c[k]>=0&&c[k]<=Number.MAX_SAFE_INTEGER)||c.earliestMs>c.nowMs||c.nowMs>c.latestMs)return null;
 return {earliestMs:c.earliestMs,nowMs:c.nowMs,latestMs:c.latestMs};
}
function parseGold(raw) {
 const info=own(raw,'info')?raw.info:null,keys=['freeTimes','paidTimes','minGold','resetTime','maxPaidTimes'];
 if(!keys.every(k=>own(info,k)&&uint(info[k]))||!positive(info.resetTime)||!positive(info.minGold)||info.paidTimes>info.maxPaidTimes)return null;
 return Object.fromEntries(keys.map(k=>[k,info[k]]));
}
const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function snapshot(inputs,context) {
 const gold=parseGold(inputs?.gold),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
 return gold&&inventory.stockReliable?{context,gold,inventory:stockState(inventory.stock)}:null;
}
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,gold:f.gold,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available,startClock:f.startClock,endClock:f.endClock});
export async function surveyFreeGold(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}) {
 parameters=validateFreeGoldParameters(parameters);
 const opts={signal,stop},context=contextOf(client,player),notes=[],startClock=clockOf(client,context);
 const active=()=>assertExecutionActive(client,opts);active();
 const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{
  const name=response.replace(/Response$/,'Request');active();
  if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return[key,null,null];}
  try{const value=await awaitExecution(client.request(name,{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}
  catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}
 }));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('点金采集期间账号或连接变化'),{code:'CANCELLED'});
 const endClock=clockOf(client,context),raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),gold=parseGold(raw.gold),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sources[k],sourceAt,scope,reliable:k==='gold'?gold!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,gold,...inventory,state:gold&&inventory.stockReliable?snapshot(inputs,context):null,available:Object.keys(protocol??{}),notes,startClock,endClock};
 liveFacts.set(f,{client,player,digest:digest(f)});return f;
}
function authority(f) {
 const live=liveFacts.get(f),c=f?.context;
 if(!live||live.digest!==digest(f)||live.client.connected!==true||!same(c,contextOf(live.client,live.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
 if(!same(snapshot(f.inputs,c),f.state)||!same(f.gold,f.state.gold))return false;
 return Object.entries(sources).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function currentPeriod(f) {
 const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null,expiry=f?.gold?.resetTime*1000;
 return clock&&f.startClock&&f.endClock&&f.startClock.earliestMs<=f.endClock.earliestMs&&f.endClock.earliestMs<=clock.earliestMs&&[f.startClock,f.endClock,clock].every(c=>c.latestMs<expiry)?clock:null;
}
function limit(config) {
 const rows=config?.tables?.OfflineParamCfg?.data;
 if(!dense(rows))return null;
 const matched=rows.filter(r=>own(r,'paramName')&&r.paramName==='免费点金次数');
 return matched.length===1&&own(matched[0],'paramValue')&&positive(matched[0].paramValue)?matched[0].paramValue:null;
}
function gate(config) {
 const rows=config?.tables?.ModuleOpenCfg?.data;if(!dense(rows))return null;
 const matched=rows.filter(r=>own(r,'moduleId')&&r.moduleId==='点金');
 return matched.length===1&&own(matched[0],'playerLevel')&&positive(matched[0].playerLevel)?matched[0].playerLevel:null;
}
function candidate(f,{config,moduleConfig=FREE_GOLD_DEFAULT_CONFIG}={}) {
 const configMatches=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null));
 const cap=configMatches?limit(f?.configEvidence):null,requiredLevel=configMatches?gate(f?.configEvidence):null;
 const valid=authority(f),period=valid?currentPeriod(f):null,beforeState=copy(f?.state??null);
 const blockedReason=!validateFreeGoldConfig(moduleConfig).enabled?'FREE_GOLD_DISABLED':!valid?'FREE_GOLD_AUTHORITY_UNKNOWN':cap===null?'FREE_GOLD_LIMIT_UNKNOWN':requiredLevel===null||!positive(f.context.playerLevel)?'FREE_GOLD_OPEN_AUTHORITY_UNKNOWN':f.context.playerLevel<requiredLevel?'FREE_GOLD_LEVEL_LOCKED':!period?'FREE_GOLD_PERIOD_UNKNOWN':f.gold.freeTimes>=cap?'FREE_GOLD_EXHAUSTED':!f.stock.has('GOLD')?'GOLD_BALANCE_UNKNOWN':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const reset=f?.gold?.resetTime??null,slot=f?.gold?f.gold.freeTimes+1:null,identity=hash({beforeState,cap,requiredLevel});
 const budgetClaims={resources:[],quotas:[{id:moduleId+':reset:'+reset,num:1}],uids:[{type:moduleId,id:reset+':'+slot}]};
 // The random amount is authorized as an exact typed-receipt rule, never guessed.
 const expectedState=beforeState?{context:copy(beforeState.context),gold:{...beforeState.gold,freeTimes:slot},inventoryRule:{kind:'EXACT_GOLD_RECEIPT',before:copy(beforeState.inventory),source:'ClickGoldResponse.result[0].gold',otherBalances:'UNCHANGED'}}:null;
 return {module:moduleId,actionId:moduleId+':'+reset+':'+slot+':'+identity,actionType:'CLAIM',target:{resetTime:reset,usedBefore:f?.gold?.freeTimes??null},parameters:{},identity,beforeState,expectedState,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'普通免费点金 ×1',requiredLevel,limit:cap,remaining:cap!==null&&f?.gold&&f.gold.freeTimes<=cap?cap-f.gold.freeTimes:null,
  ...(blockedReason===null?{action:{request,response,body:{times:1,free:true}}}:{})};
}
export function viewFreeGold(f,options={}) {
 validateFreeGoldParameters(options.parameters??{});
 return {module:moduleId,gold:copy(f?.gold??null),candidates:[candidate(f,options)],notes:[...(f?.notes??[]),'仅普通免费单次，按服务器 resetTime 标记绑定本次额度，不推定游戏日；奖励金额仅由本次 typed gold 回执与完整库存净入共同确认。']};
}
export function planFreeGold(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
 validateFreeGoldParameters(parameters);
 if(!dense(selections)||selections.length>1||selections.some(v=>!text(v)))throw invalid('免费点金每批只允许一个精确 actionId');
 const row=viewFreeGold(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));
 return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};
}
export function verifyFreeGold(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!currentPeriod(before)||!currentPeriod(after)||!same(before.configEvidence,after.configEvidence))return no('点金前后账号、可信时段、配置或库存不可靠');
 const canonical=candidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('点金合同与写前事实或配置不一致');
 if(!own(result,'result')||!dense(result.result)||result.result.length!==1)return no('缺少单次点金专用回执');
 const receipt=result.result[0];
 if(!own(receipt,'gold')||!positive(receipt.gold))return no('点金回执缺少明确正 GOLD；不从 ratio 倒推');
 const stock=new Map(before.stock),amount=stock.get('GOLD')+receipt.gold;if(!Number.isSafeInteger(amount))return no('金币结算溢出');
 stock.set('GOLD',amount);
 const expected={context:copy(before.context),gold:copy(canonical.expectedState.gold),inventory:stockState(stock)};
 if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,expected))return no('独立复读未同时确认同重置标记免费次数加一和精确 GOLD 净入，或无关状态变化');
 return {confirmed:true,afterState:copy(after.state),reason:'单次免费 typed GOLD 回执与同周期计次、完整库存净入共同确认',responseEvidence:{gold:receipt.gold,resetTime:before.gold.resetTime,usedBefore:before.gold.freeTimes,usedAfter:after.gold.freeTimes}};
}
export function freeGoldDependencyVersions({config,moduleConfig=FREE_GOLD_DEFAULT_CONFIG}={}) {return {moduleConfig:validateFreeGoldConfig(moduleConfig),tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const freeGoldModule=Object.freeze({id:moduleId,label:'普通免费点金',capabilities:Object.freeze(['BIZ-D06']),defaultConfig:FREE_GOLD_DEFAULT_CONFIG,validateConfig:validateFreeGoldConfig,validateParameters:validateFreeGoldParameters,survey:surveyFreeGold,view:viewFreeGold,plan:planFreeGold,verify:verifyFreeGold,dependencyVersions:freeGoldDependencyVersions});
