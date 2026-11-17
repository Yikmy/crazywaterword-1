// W16/BIZ-R10: exact next configured AFK milestone; the shared executor owns writes.
import { createHash } from 'node:crypto';
import { ACTIONS, buildBody } from './actions.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { parseBadgeOwnership } from './badge-growth.mjs';
import { ResourceLedger, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';

const moduleId = 'afk-level-rewards', scope = { kind: 'ACCOUNT' };
const copy = value => structuredClone(value), same = (a,b) => stableBusinessValue(a) === stableBusinessValue(b);
const hash = value => createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const own = (v,k) => v !== null && typeof v === 'object' && Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const positive = n => Number.isInteger(n) && n > 0 && n <= 2147483647;
const identifier = s => typeof s === 'string' && s.length > 0 && s.length <= 200 && s.trim() === s;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const fields = (v,keys) => plain(v) && Reflect.ownKeys(v).every(k => keys.includes(k) && Object.getOwnPropertyDescriptor(v,k)?.enumerable && own(Object.getOwnPropertyDescriptor(v,k),'value'));
const dense = v => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= 10000 && Reflect.ownKeys(v).length === v.length+1 && Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&own(d,'value'));
const invalid = message => Object.assign(new Error(message), {code:'INVALID_PARAMETERS',statusCode:400});
const sources = { afk:'AfkInfoResponse', items:'AllItemResponse', resources:'AllResourceResponse' };
const configNames = ['OfflineLvRewardCfg','ItemCfg'];
const isIncome=p=>p?.action==='income';
const isUpgrade=p=>p?.action==='upgrade', isPeriod=p=>isIncome(p)||isUpgrade(p);
const configNamesFor=p=>isIncome(p)?['OfflineCfg','ItemCfg','HeroBadgeCfg']:isUpgrade(p)?['OfflineCfg','ItemCfg']:configNames;
const sourcesFor=p=>isIncome(p)?{...sources,badges:'BadgesResponse',heroes:'AllHeroResponse'}:sources;
export const AFK_INCOME_EVIDENCE=Object.freeze({source:'Fixed v76 OfflineRewardView.ts/AfkModel.ts',ordinaryRequestByte:5033814,modelByte:137123,semantics:'Explicit normal claim without useAdvCard; floor(server seconds)-start-1 >=60. Receipt supplies new interval and DispRewardPackage; independently reread interval, full inventory and badge ownership. Never predict amount or auto-upgrade.',realGame:'REAL_UNVERIFIED'});
const request=ACTIONS.afkLevelDraw.request, response=ACTIONS.afkLevelDraw.response;
const liveFacts=new WeakMap();
const costSource='Existing ACTIONS.afkLevelDraw and OfflineLvRewardCfg.reward; exact next milestone, zero debit; unlockReward is not immediate income';
export const AFK_LEVEL_REWARDS_DEFAULT_CONFIG = Object.freeze({enabled:false});
export function validateAfkLevelRewardsConfig(v={}) {
  if (!fields(v,['enabled']) || own(v,'enabled') && typeof v.enabled !== 'boolean') throw invalid('挂机等级奖励配置只接受 enabled 布尔值');
  return {enabled:v.enabled??false};
}
export function validateAfkLevelRewardsParameters(v={}) {
  if(isIncome(v)){if(!fields(v,['action','level','afkStartTime','afkFinishTime','upgradePreparation'])||!['action','level','afkStartTime','afkFinishTime'].every(k=>own(v,k))||!positive(v.level)||!positive(v.afkStartTime)||!positive(v.afkFinishTime)||v.afkFinishTime<=v.afkStartTime)throw invalid('普通挂机收益必须明确 action=income、当前等级及完整起止秒数');if(own(v,'upgradePreparation')&&(!fields(v.upgradePreparation,['levels','expectedCost'])||!own(v.upgradePreparation,'levels')||!own(v.upgradePreparation,'expectedCost')||![1,5,10].includes(v.upgradePreparation.levels)||!Number.isSafeInteger(v.upgradePreparation.expectedCost)||v.upgradePreparation.expectedCost<=0||!positive(v.level+v.upgradePreparation.levels)))throw invalid('收益的升级前置须明确1/5/10级及已核定的自有徽章成本');return {action:'income',level:v.level,afkStartTime:v.afkStartTime,afkFinishTime:v.afkFinishTime,...(own(v,'upgradePreparation')?{upgradePreparation:copy(v.upgradePreparation)}:{})};}
  if(isUpgrade(v)){if(!fields(v,['action','level','levels','incomeFrom','expectedUpgradeCost'])||!['action','level','levels'].every(k=>own(v,k))||!positive(v.level)||![1,5,10].includes(v.levels)||!positive(v.level+v.levels))throw invalid('挂机升级必须明确当前 level 与增加的 levels（1、5或10）');if(own(v,'incomeFrom')||own(v,'expectedUpgradeCost')){const from=v.incomeFrom;if(!own(v,'incomeFrom')||!fields(from,['afkStartTime','afkFinishTime'])||!['afkStartTime','afkFinishTime'].every(k=>own(from,k)&&positive(from[k]))||from.afkFinishTime<=from.afkStartTime||!own(v,'expectedUpgradeCost')||!Number.isSafeInteger(v.expectedUpgradeCost)||v.expectedUpgradeCost<=0)throw invalid('依赖升级须明确原收益起止区间与固定徽章成本');}return {action:'upgrade',level:v.level,levels:v.levels,...(own(v,'incomeFrom')?{incomeFrom:copy(v.incomeFrom),expectedUpgradeCost:v.expectedUpgradeCost}:{})};}
  if(!fields(v,['level'])||own(v,'level')&&!positive(v.level))throw invalid('挂机等级奖励仅接受正 int32 level 或空参数');
  return own(v,'level')?{level:v.level}:{};
}
function roleId(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  const normalized = toSnapshotJson(value);
  if (!(typeof normalized === 'number' || typeof normalized === 'string' && /^[1-9][0-9]*$/.test(normalized))) return null;
  try { const n=BigInt(normalized); return n>0n&&n<(1n<<63n)?String(n):null; } catch { return null; }
}
function contextOf(client,player) {
  const c=client.factContext, role=key=>{const id=own(player,key)?roleId(player[key]):null;return own(c,key)&&roleId(c[key])!==id?null:id;};
  return {accountId:identifier(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,
    connectionId:identifier(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId')};
}
function parseAfk(raw) {
  const afk=own(raw,'afkInfo')?raw.afkInfo:null;
  if(!['level','rewardedLevel','afkStartTime','afkFinishTime'].every(k=>own(afk,k)&&Number.isInteger(afk[k])&&afk[k]>=0&&afk[k]<=2147483647)||!positive(afk.level)||afk.rewardedLevel>afk.level)return null;
  return Object.fromEntries(['level','rewardedLevel','afkStartTime','afkFinishTime'].map(k=>[k,afk[k]]));
}
const stockState = stock => [...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function snapshot(inputs,context,parameters={}) {
  const afk=parseAfk(inputs?.afk),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
  const ownership=isIncome(parameters)?parseBadgeOwnership(inputs?.badges,inputs?.heroes):null;
  return afk&&inventory.stockReliable&&(!isIncome(parameters)||ownership)?{context,afk,clickGoldInfo:own(inputs.afk,'clickGoldInfo')?copy(inputs.afk.clickGoldInfo):null,inventory:stockState(inventory.stock),...(isIncome(parameters)?{ownership}:{})}:null;
}
export async function surveyAfkLevelRewards(client,protocol,{config,player,parameters={},readIncomeHistory,signal,stop,timeout=15000}={}) {
  parameters=validateAfkLevelRewardsParameters(parameters);
  const options={signal,stop},context=contextOf(client,player),notes=[],startClock=isPeriod(parameters)?readIncomeClock(client,context):null;
  const active=()=>assertExecutionActive(client,options); active();
  const observations=await Promise.all(Object.entries(sourcesFor(parameters)).map(async([key,response])=>{
    const request=response.replace(/Response$/,'Request'); active();
    if (!protocol?.[request] || !protocol?.[response]) {notes.push(request+': PROTOCOL_UNAVAILABLE');return [key,null,null];}
    try { const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,options);return [key,value,Date.now()]; }
    catch(error) {if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}
  }));
  // Fence the interval around the independently read credits; do not renew the first fact's age.
  if(isPeriod(parameters)){
    const first=observations.find(([key])=>key==='afk');
    if(first?.[1])try{
      const last=await awaitExecution(client.request('AfkInfoRequest',{},'AfkInfoResponse',timeout,{signal}),client,options);
      if(!same(toSnapshotJson(first[1]),toSnapshotJson(last))){first[1]=null;notes.push('AFK_INTERVAL_CHANGED_DURING_SURVEY');}
    }catch(error){if(executionOutcome(error)==='CANCELLED')throw error;first[1]=null;notes.push('AFK_INTERVAL_FENCE_UNKNOWN');}
  }
  active(); if(!same(context,contextOf(client,player)))throw Object.assign(new Error('挂机采集期间账号或连接改变'),{code:'CANCELLED'});
  const raw=Object.fromEntries(observations.map(([key,value])=>[key,value])),inputs=toSnapshotJson(raw);
  const afk=parseAfk(raw.afk),inventory=parseOperationInventory(raw.items,raw.resources);
  const sourceFacts=Object.fromEntries(observations.map(([key,,sourceAt])=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,source:sourcesFor(parameters)[key],sourceAt,scope,reliable:key==='afk'?afk!==null:inventory.stockReliable})]));
  const upgradeFacts=isUpgrade(parameters)?{mainlineStage:own(player,'mainlineStage')&&positive(player.mainlineStage)?player.mainlineStage:null,incomeHistory:readIncomeSettlements(readIncomeHistory,context)}:{};
  const f={module:moduleId,parameters,context,...upgradeFacts,configEvidence:{tables:Object.fromEntries(configNamesFor(parameters).map(name=>[name,copy(config?.tables?.[name]??null)]))},inputs,sourceFacts,afk,...inventory,state:afk&&inventory.stockReliable?snapshot(inputs,context,parameters):null,available:Object.keys(protocol??{}),notes,...(isPeriod(parameters)?{startClock,endClock:readIncomeClock(client,context)}:{})};
  liveFacts.set(f,{digest:digest(f),client,player,mainlineStage:own(player,'mainlineStage')&&positive(player.mainlineStage)?player.mainlineStage:null,...(isUpgrade(parameters)?{readIncomeHistory}:{})});return f;
}
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,afk:f.afk,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available,...(isPeriod(f.parameters)?{startClock:f.startClock,endClock:f.endClock}:{}),...(isUpgrade(f.parameters)?{mainlineStage:f.mainlineStage,incomeHistory:f.incomeHistory}:{})});
function authority(f) {
  const bound=liveFacts.get(f);
  if(!bound||bound.digest!==digest(f)||!same(f.context,contextOf(bound.client,bound.player)))return false;
  if(isUpgrade(f.parameters)&&(!own(bound.player,'mainlineStage')||bound.player.mainlineStage!==f.mainlineStage||!same(f.incomeHistory,readIncomeSettlements(bound.readIncomeHistory,f.context))))return false;
  const c=f?.context;
  if(!identifier(c?.accountId)||!identifier(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
  const state=snapshot(f.inputs,c,f.parameters);
  const parsed=parseOperationInventory(f.inputs?.items,f.inputs?.resources);
  if(!same(state,f.state)||!same(f.afk,state?.afk)||!same([...f.stock].sort(),[...parsed.stock].sort()))return false;
  return Object.entries(sourcesFor(f.parameters)).every(([key,source])=>f.sourceFacts?.[key]?.provenance?.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function milestones(config) {
 const rows=config?.tables?.OfflineLvRewardCfg?.data,items=config?.tables?.ItemCfg?.data;
 if(!dense(rows)||!rows.length||!dense(items)||rows.some(r=>!own(r,'level')||!positive(r.level)||!own(r,'reward')||!dense(r.reward))||new Set(rows.map(r=>r.level)).size!==rows.length)return null;
 const known=new Set(items.filter(r=>own(r,'id')&&identifier(r.id)).map(r=>r.id)),out=[];
 for(const row of rows){if(!row.reward.length)continue;const [id,num]=row.reward;if(row.reward.length!==2||!known.has(id)||!Number.isSafeInteger(num)||num<=0)return null;out.push({level:row.level,rewards:[{id,num}]});}
 return out.sort((a,b)=>a.level-b.level);
}
function expected(f,def) {
 if(!f?.state||!def)return null;const state=copy(f.state),stock=new Map(f.stock);state.afk.rewardedLevel=def.level;
 for(const {id,num}of def.rewards){const next=(stock.get(id)??0)+num;if(!Number.isSafeInteger(next))return null;stock.set(id,next);}
 state.inventory=stockState(stock);return state;
}
function candidate(f,p,{config,moduleConfig=AFK_LEVEL_REWARDS_DEFAULT_CONFIG}={}) {
 const definitions=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null))?milestones(f.configEvidence):null;
 const next=definitions?.find(row=>row.level>f?.afk?.rewardedLevel),def=definitions?.find(row=>row.level===p.level),valid=authority(f),after=valid?expected(f,def):null;
 const blockedReason=!validateAfkLevelRewardsConfig(moduleConfig).enabled?'AFK_LEVEL_REWARDS_DISABLED':!valid?'AFK_AUTHORITY_UNKNOWN':!definitions?'AFK_REWARD_CONFIG_UNKNOWN':!def?'AFK_NOT_REWARD_MILESTONE':p.level!==next?.level?'AFK_NOT_NEXT_REWARD':p.level>f.afk.level?'AFK_LEVEL_TOO_LOW':!after?'REWARD_BALANCE_UNKNOWN':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const beforeState=copy(f?.state??null),identity=hash({p,beforeState,def}),budgetClaims={resources:[],quotas:[],uids:[{type:'afk-level-reward',id:String(p.level)}]};
 return {module:moduleId,actionId:moduleId+':'+p.level+':'+identity,actionType:'CLAIM',target:copy(p),parameters:copy(p),identity,beforeState,expectedState:after,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'挂机等级 '+p.level+' 奖励',rewards:copy(def?.rewards??null),...(blockedReason===null?{action:{request,response,body:buildBody(ACTIONS.afkLevelDraw,{level:p.level})}}:{})};
}
export function viewAfkLevelRewards(f,options={}) {
 const p=validateAfkLevelRewardsParameters(options.parameters??{});if(isIncome(p))return incomeView(f,p,options);if(isUpgrade(p))return {module:moduleId,afk:copy(f?.afk??null),candidates:[upgradeCandidate(f,p,options)],notes:[...(f?.notes??[]),'升级仅允许明确增加1、5或10级；须先在当前连接确认普通收益。逐档消耗挂机徽章，主线门槛或历史不明则停止。']};const next=milestones(f?.configEvidence)?.find(row=>row.level>f?.afk?.rewardedLevel),selected=own(p,'level')?p:next?{level:next.level}:null;
 return {module:moduleId,afk:copy(f?.afk??null),candidates:selected?[candidate(f,selected,options)]:[],notes:[...(f?.notes??[]),'仅领取下一档配置等级奖励；时段收益与升级保持独立。缺失已领奖等级不能按零处理。']};
}
export function planAfkLevelRewards(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
 parameters=validateAfkLevelRewardsParameters(parameters);if(!dense(selections)||selections.length>1||selections.some(id=>!identifier(id)))throw invalid('挂机等级奖励每批仅允许一个精确 actionId');
 const selected=viewAfkLevelRewards(f,{...options,parameters}).candidates.find(row=>row.executable&&selections.includes(row.actionId));
 return {module:moduleId,actions:selected&&ledger.reserve(selected.costs)?[selected]:[],notes:[]};
}
function receipt(raw,def) {
 if(!own(raw,'rewardedLevel')||raw.rewardedLevel!==def.level||!own(raw,'reward')||!own(raw.reward,'asset')||!dense(raw.reward.asset))return false;
 const rows=[];for(const a of raw.reward.asset){const num=own(a,'num')?safeResourceQuantity(a.num):null;if(!own(a,'type')||a.type!==0||!own(a,'id')||!identifier(a.id)||num===null||num<=0)return false;rows.push({id:a.id,num});}
 return same(rows,def.rewards);
}
export function verifyAfkLevelReward(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context))return no('挂机前后账号、状态或库存权威不可靠');
 const p=operation?.parameters;if(isIncome(p))return verifyIncome(operation,before,after,result);if(isUpgrade(p))return verifyUpgrade(operation,before,after,result);try{validateAfkLevelRewardsParameters(p);}catch{return no('领取目标不完整');}if(!p?.level)return no('缺少精确领奖等级');
 if(!same(before.configEvidence,after.configEvidence))return no('挂机奖励配置发生变化');
 const canonical=candidate(before,p,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(k=>!same(operation[k],canonical[k])))return no('挂机领取合同与写前事实或配置不一致');
 if(!receipt(result,{level:p.level,rewards:canonical.rewards}))return no('缺少精确已领奖等级及配置奖励回执');
 if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,canonical.expectedState))return no('独立复读未确认精确等级与奖励净入，或无关状态变化');
 return {confirmed:true,afterState:copy(after.state),reason:'专用回执与独立复读同时确认单档等级奖励及完整库存净入'};
}
export function afkLevelRewardsDependencyVersions({config,moduleConfig=AFK_LEVEL_REWARDS_DEFAULT_CONFIG,parameters={},player}={}) {return {moduleConfig:validateAfkLevelRewardsConfig(moduleConfig),tables:Object.fromEntries(configNamesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)])),...(isIncome(parameters)?{incomeEvidence:AFK_INCOME_EVIDENCE,...(parameters.upgradePreparation?{upgradeEvidence:AFK_UPGRADE_EVIDENCE,mainlineStage:own(player,'mainlineStage')&&positive(player.mainlineStage)?player.mainlineStage:null}:{})}:{}),...(isUpgrade(parameters)?{upgradeEvidence:AFK_UPGRADE_EVIDENCE,mainlineStage:own(player,'mainlineStage')&&positive(player.mainlineStage)?player.mainlineStage:null}:{})};}
function incomeClock(f) {const bound=liveFacts.get(f);return bound?readIncomeClock(bound.client,f.context):null;}
function readIncomeClock(client,context) {
 let c;try{c=client.gameClock?.read(context);}catch{return null;}
 if(c?.status!=='TRUSTED'||c.reliable!==true||c.source!=='PingResponse.serverTimestamp'||c.accountId!==context.accountId||c.generation!==context.generation||!['earliestMs','nowMs','latestMs'].every(k=>own(c,k)&&Number.isFinite(c[k])&&c[k]>=0&&c[k]<=Number.MAX_SAFE_INTEGER)||c.earliestMs>c.nowMs||c.nowMs>c.latestMs)return null;
 return {earliestMs:c.earliestMs,nowMs:c.nowMs,latestMs:c.latestMs};
}
function incomeDefinitions(f,config) {
 const names=configNamesFor(f?.parameters);if(!same(names.map(n=>config?.tables?.[n]??null),names.map(n=>f?.configEvidence?.tables?.[n]??null)))return null;
 const {OfflineCfg,ItemCfg,HeroBadgeCfg}=f?.configEvidence?.tables??{},rows=OfflineCfg?.data,items=ItemCfg?.data,badges=HeroBadgeCfg?.data;
 if(!dense(rows)||!rows.length||rows.some(r=>!own(r,'level')||!positive(r.level))||new Set(rows.map(r=>r.level)).size!==rows.length||!dense(items)||!items.length||items.some(r=>!own(r,'id')||!identifier(r.id))||new Set(items.map(r=>r.id)).size!==items.length||!dense(badges)||!badges.length||badges.some(r=>!own(r,'id')||!identifier(r.id))||new Set(badges.map(r=>r.id)).size!==badges.length)return null;
 const row=rows.find(r=>r.level===f?.afk?.level);if(!row||!own(row,'goldSpeed')||!Number.isFinite(row.goldSpeed)||row.goldSpeed<=0||!own(row,'reward')||!dense(row.reward)||row.reward.some(a=>!dense(a)||a.length!==2||!items.some(r=>r.id===a[0])||!Number.isFinite(a[1])||a[1]<=0))return null;
 return {row:copy(row),items:items.map(r=>r.id).sort(),badges:badges.map(r=>r.id).sort()};
}
// Read-only time eligibility shared with the legacy Daily driver. This alone
// never proves inventory, configuration, task completion or permission to write.
export function afkIncomeReadiness(raw,clock) {
 const afk=parseAfk(raw),parameters=afk&&positive(afk.afkStartTime)&&positive(afk.afkFinishTime)&&afk.afkFinishTime>afk.afkStartTime?{action:'income',level:afk.level,afkStartTime:afk.afkStartTime,afkFinishTime:afk.afkFinishTime}:null;
 const result={parameters,minimumElapsedSeconds:61,remainingSeconds:null};
 if(!parameters)return {...result,status:'UNKNOWN',reason:'AFK_INTERVAL_UNKNOWN'};
 if(!clock||!['earliestMs','nowMs','latestMs'].every(k=>own(clock,k)&&Number.isFinite(clock[k])&&clock[k]>=0&&clock[k]<=Number.MAX_SAFE_INTEGER)||clock.earliestMs>clock.nowMs||clock.nowMs>clock.latestMs)return {...result,status:'UNKNOWN',reason:'AFK_TRUSTED_CLOCK_UNKNOWN'};
 const remainingSeconds=Math.max(0,61-(Math.floor(clock.earliestMs/1000)-afk.afkStartTime));
 return {...result,remainingSeconds,status:remainingSeconds?'WAITING':'READY_BY_CLOCK',reason:remainingSeconds?'AFK_INCOME_TOO_EARLY':null};
}
export function observeAfkIncome(client,raw,player,sourceContext) {
 const context=contextOf(client,player),known=identifier(context.accountId)&&Number.isSafeInteger(context.generation)&&identifier(context.connectionId)&&context.playerId!==null&&context.worldId!==null;
 const result=afkIncomeReadiness(raw,known&&(sourceContext===undefined||same(sourceContext,context))?readIncomeClock(client,context):null);
 return {...result,context,...(!known||sourceContext!==undefined&&!same(sourceContext,context)?{status:'UNKNOWN',reason:'AFK_CONTEXT_CHANGED'}:{})};
}
function incomeCandidate(f,p,{config,moduleConfig=AFK_LEVEL_REWARDS_DEFAULT_CONFIG}={}) {
 const valid=authority(f),clock=valid?incomeClock(f):null,defs=incomeDefinitions(f,config),a=f?.afk,upgrade=p.upgradePreparation?upgradePreparationView(f,config,moduleConfig).options.find(r=>r.levels===p.upgradePreparation.levels):null;
 const readiness=afkIncomeReadiness({afkInfo:a},clock);
 const target={action:'income',level:p.level,afkStartTime:p.afkStartTime,afkFinishTime:p.afkFinishTime},beforeState=copy(f?.state??null),expectedState=beforeState?{context:copy(beforeState.context),rule:'NORMAL_AFK_INTERVAL_SETTLEMENT',interval:'EXPLICIT_NEW_START_AND_SAME_DURATION_MATCH_REREAD',reward:'TYPED_ITEM_RESOURCE_AND_BADGE_NET_CREDITS',otherState:'UNCHANGED',amount:'SERVER_RECEIPT_ONLY'}:null;
 const identity=hash({target,beforeState,defs}),budgetClaims={resources:[],quotas:[],uids:[{type:'afk-income-interval',id:p.level+':'+p.afkStartTime+':'+p.afkFinishTime}]};
 const blockedReason=!validateAfkLevelRewardsConfig(moduleConfig).enabled?'AFK_LEVEL_REWARDS_DISABLED':!valid?'AFK_AUTHORITY_UNKNOWN':!defs?'AFK_INCOME_CONFIG_UNKNOWN':p.upgradePreparation&&(!upgrade||upgrade.blockedReason||upgrade.costs?.[0]?.num!==p.upgradePreparation.expectedCost)?'AFK_UPGRADE_PRECONDITION_CHANGED':!same({level:a.level,afkStartTime:a.afkStartTime,afkFinishTime:a.afkFinishTime},{level:p.level,afkStartTime:p.afkStartTime,afkFinishTime:p.afkFinishTime})?'AFK_INTERVAL_CHANGED':readiness.reason?readiness.reason:![ACTIONS.afkDraw.request,ACTIONS.afkDraw.response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 return {module:moduleId,actionId:moduleId+':income:'+identity,actionType:'INCOME',target,parameters:copy(p),identity,beforeState,expectedState,costs:[],costSource:'Fixed v76 ordinary DrawAfkRewardRequest has no useAdvCard; zero debit, receipt-only income',budgetClaims,executable:blockedReason===null,blockedReason,label:'普通挂机本段收益',rewards:null,...(blockedReason===null?{action:{request:ACTIONS.afkDraw.request,response:ACTIONS.afkDraw.response,body:buildBody(ACTIONS.afkDraw)}}:{})};
}
function incomeView(f,p,options) {
 const clock=authority(f)?incomeClock(f):null;
 return {module:moduleId,afk:copy(f?.afk??null),upgradePreparation:upgradePreparationView(f,options.config,options.moduleConfig),income:{serverBounds:clock,minimumElapsedSeconds:61,amount:null},candidates:[incomeCandidate(f,p,options)],notes:[...(f?.notes??[]),'普通时段收益与等级奖励分开；资格依可信服务器时间，金额仅以专用回执及独立库存净入确认。无广告、无升级、无自动重放。']};
}
function incomeRewards(result,defs,before) {
 if(!own(result,'reward')||result.reward===null)return null;const packet=toSnapshotJson(result.reward);
 if(!fields(packet,['assetPackage','heroes','equips','badge','antiques','supplies']))return null;
 for(const k of ['heroes','equips','antiques','supplies'])if(own(packet,k)&&(!dense(packet[k])||packet[k].length))return null;
 const asset=own(packet,'assetPackage')?packet.assetPackage:null;if(asset!==null&&(!fields(asset,['asset'])||!own(asset,'asset')||!dense(asset.asset)))return null;
 const credits=[];for(const row of asset?.asset??[]){const num=own(row,'num')?safeResourceQuantity(row.num):null;if(!fields(row,['type','id','num'])||row.type!==0||!identifier(row.id)||!['GOLD',...defs.items].includes(row.id)||num===null||num<=0||credits.some(r=>r.id===row.id))return null;credits.push({id:row.id,num});}
 const badges=own(packet,'badge')?packet.badge:[];if(!dense(badges))return null;const receipts=[];
 for(const row of badges){const uid=own(row,'uid')?roleId(row.uid):null;if(!fields(row,['uid','badgeId','star','attr'])||!uid||!own(row,'badgeId')||!defs.badges.includes(row.badgeId)||!own(row,'star')||!Number.isInteger(row.star)||row.star<0||row.star>2147483647||receipts.some(r=>r.uid===uid)||before.state.ownership.pool.some(r=>r.uid===uid))return null;receipts.push({...row,uid});}
 return credits.length||receipts.length?{credits,badges:receipts}:null;
}
function verifyIncome(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});let p;try{p=validateAfkLevelRewardsParameters(operation?.parameters);}catch{return no('普通挂机目标不完整');}
 if(!isIncome(p)||!same(before.parameters,p)||!same(after.parameters,p)||!same(before.configEvidence,after.configEvidence))return no('普通挂机区间或配置已变化');
 const canonical=incomeCandidate(before,p,{config:before.configEvidence,moduleConfig:{enabled:true}}),defs=incomeDefinitions(before,before.configEvidence),clock=incomeClock(after);
 if(!canonical.executable||!clock||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(k=>!same(operation[k],canonical[k])))return no('普通挂机合同与写前事实不一致');
 if(!['afkStartTime','afkFinishTime'].every(k=>own(result,k)&&positive(result[k])))return no('缺少明确的新挂机区间回执');
 const a=before.afk,b=after.afk,start=result.afkStartTime,finish=result.afkFinishTime;
 if(start<=a.afkStartTime||finish-start!==a.afkFinishTime-a.afkStartTime||!before.endClock||!after.startClock||start<Math.floor(before.endClock.earliestMs/1000)-1||start>Math.floor(after.startClock.latestMs/1000)||finish<=Math.ceil(clock.latestMs/1000)||b.level!==a.level||b.rewardedLevel!==a.rewardedLevel||b.afkStartTime!==start||b.afkFinishTime!==finish)return no('专用区间重置未由独立AFK复读确认');
 const received=incomeRewards(result,defs,before);if(!received)return no('奖励包不完整或含未闭合实例类型');
 const expected=copy(before.state),stock=new Map(before.stock);expected.afk={...a,afkStartTime:start,afkFinishTime:finish};
 for(const r of received.credits){const num=(stock.get(r.id)??0)+r.num;if(!Number.isSafeInteger(num))return no('奖励净入超出精确范围');stock.set(r.id,num);}expected.inventory=stockState(stock);
 for(const r of received.badges){const found=after.state.ownership.pool.find(row=>row.uid===r.uid);if(!found||found.badgeId!==r.badgeId||found.star!==r.star||!same(found.attr??null,r.attr??null))return no('徽章回执未由独立完整池确认');expected.ownership.pool.push(copy(found));}expected.ownership.pool.sort((a,b)=>a.uid.localeCompare(b.uid));
 if(Object.keys(sourcesFor(p)).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,expected))return no('奖励净入、完整徽章/英雄或无关挂机状态未匹配');
 return {confirmed:true,afterState:copy(after.state),reason:'普通挂机专用新区间与独立AFK、完整库存及徽章所有权净入确认',responseEvidence:{interval:{afkStartTime:start,afkFinishTime:finish},received}};
}

// Fixed client evidence is shared with ordinary income; the request level is an increment.
export const AFK_UPGRADE_EVIDENCE=Object.freeze({source:'Fixed v76 OfflineRewardView.ts/AfkModel.ts',semantics:'UpgradeAfkLevelRequest.level is 1,5,10 added levels; sum each target OfflineCfg.consume; max level uses mainlineStage-1. New interval must come from typed response and independent reread, never an inferred reset formula.',realGame:'REAL_UNVERIFIED'});
function readIncomeSettlements(read,context) {
 try {
  if(typeof read!=='function')return null;const runs=read();if(!Array.isArray(runs))return null;const out=[];
  const ctx=c=>c&&{accountId:c.accountId,playerId:roleId(c.playerId),worldId:roleId(c.worldId),generation:c.generation,connectionId:c.connectionId};
  for(const run of runs){
   if(run?.finalStatus!=='SUCCESS'||run.accountId!==context.accountId||!identifier(run.runId)||!same(ctx(run.executionContext),context)||!identifier(run.planSummary?.batchId)||!Array.isArray(run.actions))continue;
   for(const row of run.actions){
    if(row?.module!==moduleId||row.actionType!=='INCOME'||!identifier(row.actionId)||row.result!=='SUCCESS'||row.requestStatus!=='SUCCESS'||row.verification?.status!=='CONFIRMED'||row.dispatched!==true||row.unresolvedWrite!==false||row.beforeInventoryReliable!==true||row.afterInventoryReliable!==true||!same(ctx(row.beforeState?.context),context)||!same(ctx(row.afterState?.context),context))continue;
    const a=parseAfk({afkInfo:row.beforeState.afk}),b=parseAfk({afkInfo:row.afterState.afk}),interval=row.responseEvidence?.interval,received=row.responseEvidence?.received,p=row.parameters;
    if(!a||!b||!isIncome(p)||p.level!==a.level||p.afkStartTime!==a.afkStartTime||p.afkFinishTime!==a.afkFinishTime||b.level!==a.level||b.rewardedLevel!==a.rewardedLevel||b.afkStartTime<=a.afkStartTime||b.afkFinishTime<=b.afkStartTime||!same(interval,{afkStartTime:b.afkStartTime,afkFinishTime:b.afkFinishTime})||!dense(received?.credits)||!dense(received?.badges)||received.credits.length+received.badges.length===0)continue;
    out.push({runId:run.runId,batchId:run.planSummary.batchId,actionId:row.actionId,sourceAfk:{level:a.level,afkStartTime:a.afkStartTime,afkFinishTime:a.afkFinishTime},afk:{level:b.level,afkStartTime:b.afkStartTime,afkFinishTime:b.afkFinishTime}});
   }
  }
  return out.sort((a,b)=>stableBusinessValue(a).localeCompare(stableBusinessValue(b)));
 }catch{return null;}
}
function upgradeDefinitions(f,config,p) {
 const names=configNamesFor(p);if(!same(names.map(n=>config?.tables?.[n]??null),names.map(n=>f?.configEvidence?.tables?.[n]??null)))return null;
 const rows=f?.configEvidence?.tables?.OfflineCfg?.data,items=f?.configEvidence?.tables?.ItemCfg?.data;
 if(!positive(f?.mainlineStage)||!dense(rows)||!rows.length||!dense(items)||!items.some(r=>own(r,'id')&&r.id==='挂机徽章')||rows.some(r=>!own(r,'level')||!positive(r.level)||!own(r,'stage')||!Number.isInteger(r.stage)||r.stage<0||r.stage>2147483647)||new Set(rows.map(r=>r.level)).size!==rows.length)return null;
 const targets=[];let cost=0;
 for(let level=p.level+1;level<=p.level+p.levels;level++){
  const row=rows.find(r=>r.level===level),c=row?.consume;
  if(!row||!own(row,'consume')||!dense(c)||c.length!==2||c[0]!=='挂机徽章'||!Number.isSafeInteger(c[1])||c[1]<=0||!Number.isSafeInteger(cost+c[1]))return null;
  cost+=c[1];targets.push({level,stage:row.stage,consume:copy(c)});
 }
 return {targets,cost,mainlineStage:f.mainlineStage};
}
function upgradeCandidate(f,p,{config,moduleConfig=AFK_LEVEL_REWARDS_DEFAULT_CONFIG}={}) {
 const valid=authority(f),clock=valid?incomeClock(f):null,a=f?.afk,defs=upgradeDefinitions(f,config,p),period=a?{level:a.level,afkStartTime:a.afkStartTime,afkFinishTime:a.afkFinishTime}:null;
 const proof=f?.incomeHistory?.find(r=>same(r.afk,period)&&(!p.incomeFrom||same(r.sourceAfk,{level:p.level,...p.incomeFrom})))??null;
 const target={action:'upgrade',level:p.level,levels:p.levels,interval:period,incomeSettlement:proof?{runId:proof.runId,batchId:proof.batchId,actionId:proof.actionId}:null},beforeState=copy(f?.state??null),costs=defs?[{id:'挂机徽章',num:defs.cost}]:[],identity=hash({target,beforeState,defs});
 const expectedState={level:p.level+p.levels,interval:'EXPLICIT_TYPED_RESPONSE_MATCHING_INDEPENDENT_REREAD',debits:copy(costs),otherState:'UNCHANGED'};
 const blockedReason=!validateAfkLevelRewardsConfig(moduleConfig).enabled?'AFK_LEVEL_REWARDS_DISABLED':!valid?'AFK_AUTHORITY_UNKNOWN':!defs?'AFK_UPGRADE_CONFIG_OR_MAINLINE_UNKNOWN':own(p,'expectedUpgradeCost')&&defs.cost!==p.expectedUpgradeCost?'AFK_UPGRADE_COST_CHANGED':a.level!==p.level?'AFK_LEVEL_CHANGED':!proof?'AFK_CONFIRMED_INCOME_REQUIRED':!clock?'AFK_TRUSTED_CLOCK_UNKNOWN':clock.earliestMs<a.afkStartTime*1000?'AFK_INTERVAL_CLOCK_UNKNOWN':Math.floor(clock.latestMs/1000)-a.afkStartTime-1>=60?'AFK_INCOME_REQUIRED_AGAIN':defs.targets.some(r=>r.stage>defs.mainlineStage-1)?'AFK_MAINLINE_LOCKED':(f.stock.get('挂机徽章')??0)<defs.cost?'AFK_UPGRADE_MATERIAL_SHORTAGE':![ACTIONS.afkUpgrade.request,ACTIONS.afkUpgrade.response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const budgetClaims={resources:copy(costs),quotas:[],uids:[{type:'afk-upgrade',id:upgradeUid(p,a)}]};
 return {module:moduleId,actionId:moduleId+':upgrade:'+identity,actionType:'UPGRADE',target,parameters:copy(p),identity,beforeState,expectedState,costs,costSource:'Fixed v76 UpgradeAfkLevelRequest increment; sum every target OfflineCfg.consume owned 挂机徽章',budgetClaims,executable:blockedReason===null,blockedReason,label:'挂机明确增加 '+p.levels+' 级',rewards:[],...(blockedReason===null?{action:{request:ACTIONS.afkUpgrade.request,response:ACTIONS.afkUpgrade.response,body:buildBody(ACTIONS.afkUpgrade,{level:p.levels})}}:{})};
}
function verifyUpgrade(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});let p;try{p=validateAfkLevelRewardsParameters(operation?.parameters);}catch{return no('升级目标不完整');}
 if(!isUpgrade(p)||!same(before.parameters,p)||!same(after.parameters,p)||!same(before.configEvidence,after.configEvidence)||before.mainlineStage!==after.mainlineStage)return no('升级参数、配置或主线门槛已变化');
 const canonical=upgradeCandidate(before,p,{config:before.configEvidence,moduleConfig:{enabled:true}}),clock=incomeClock(after);
 if(!canonical.executable||!clock||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(k=>!same(operation[k],canonical[k])))return no('升级成本、前置收益或授权合同已变化');
 if(!['level','afkStartTime','afkFinishTime'].every(k=>own(result,k)&&positive(result[k])))return no('升级缺少专用等级与新区间回执');
 const a=before.afk,b=after.afk,start=result.afkStartTime,finish=result.afkFinishTime;
 if(result.level!==p.level+p.levels||b.level!==result.level||b.rewardedLevel!==a.rewardedLevel||b.afkStartTime!==start||b.afkFinishTime!==finish||start<a.afkStartTime||finish<=start||!before.endClock||!after.startClock||start>Math.floor(after.startClock.latestMs/1000)||finish<=Math.ceil(clock.latestMs/1000))return no('升级等级或服务器新区间未由独立复读确认');
 const expected=copy(before.state),stock=new Map(before.stock);expected.afk={...a,level:result.level,afkStartTime:start,afkFinishTime:finish};
 for(const c of canonical.costs){const n=(stock.get(c.id)??0)-c.num;if(!Number.isSafeInteger(n)||n<0)return no('升级扣款无法精确确认');stock.set(c.id,n);}expected.inventory=stockState(stock);
 if(Object.keys(sourcesFor(p)).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,expected))return no('升级独立复读未匹配逐档精确净扣或无关状态变化');
 return {confirmed:true,afterState:copy(after.state),reason:'已确认前置收益、增量等级、逐档挂机徽章净扣及专用新区间独立复读',responseEvidence:{interval:{afkStartTime:start,afkFinishTime:finish},level:result.level,costs:copy(canonical.costs),incomeSettlement:copy(canonical.target.incomeSettlement)}};
}


function upgradeUid(p,a) {return p.incomeFrom?p.level+':income:'+p.incomeFrom.afkStartTime+':'+p.incomeFrom.afkFinishTime+':'+p.levels:p.level+':'+(a?.afkStartTime??'?')+':'+(a?.afkFinishTime??'?')+':'+p.levels;}
function upgradePreparationView(f,config,moduleConfig=AFK_LEVEL_REWARDS_DEFAULT_CONFIG) {
 const bound=liveFacts.get(f),valid=authority(f)&&isIncome(f.parameters)&&positive(bound?.mainlineStage)&&bound.player?.mainlineStage===bound.mainlineStage;
 const options=[1,5,10].map(levels=>{
  const p={action:'upgrade',level:f?.afk?.level,levels},defs=valid?upgradeDefinitions({...f,mainlineStage:bound.mainlineStage},config,p):null;
  const blockedReason=!validateAfkLevelRewardsConfig(moduleConfig).enabled?'AFK_LEVEL_REWARDS_DISABLED':!defs?'AFK_UPGRADE_CONFIG_OR_MAINLINE_UNKNOWN':defs.targets.some(r=>r.stage>defs.mainlineStage-1)?'AFK_MAINLINE_LOCKED':(f.stock.get('挂机徽章')??0)<defs.cost?'AFK_UPGRADE_MATERIAL_SHORTAGE':![ACTIONS.afkUpgrade.request,ACTIONS.afkUpgrade.response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
  return {levels,targetLevel:positive(p.level)?p.level+levels:null,costs:defs?[{id:'挂机徽章',num:defs.cost}]:null,blockedReason};
 });return {reliable:valid,mainlineStage:valid?bound.mainlineStage:null,options};
}
export function validateAfkUpgradePreparation(v) {
 if(!fields(v,['level','levels','afkStartTime','afkFinishTime','maxDurationMs'])||!['level','levels','afkStartTime','afkFinishTime','maxDurationMs'].every(k=>own(v,k))||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('准备须明确挂机等级、原收益区间、增加1/5/10级及1至86400000毫秒总时长');
 validateAfkLevelRewardsParameters({action:'income',level:v.level,afkStartTime:v.afkStartTime,afkFinishTime:v.afkFinishTime});validateAfkLevelRewardsParameters({action:'upgrade',level:v.level,levels:v.levels});return {level:v.level,levels:v.levels,afkStartTime:v.afkStartTime,afkFinishTime:v.afkFinishTime,maxDurationMs:v.maxDurationMs};
}
export function prepareAfkUpgradeWorkflow(f,{config,moduleConfig=AFK_LEVEL_REWARDS_DEFAULT_CONFIG,...input}={}) {
 const p=validateAfkUpgradePreparation(input),income={action:'income',level:p.level,afkStartTime:p.afkStartTime,afkFinishTime:p.afkFinishTime};
 if(!isIncome(f?.parameters)||!same(f.parameters,income)||!incomeCandidate(f,income,{config,moduleConfig}).executable)throw invalid('原收益区间、可信资格或普通收益完整合同不满足，不能准备后继升级');
 const quote=upgradePreparationView(f,config,moduleConfig).options.find(row=>row.levels===p.levels);if(!quote||quote.blockedReason||!quote.costs)throw invalid('当前主线门槛、逐档成本、自有徽章库存或升级协议不满足');
 const incomeFrom={afkStartTime:p.afkStartTime,afkFinishTime:p.afkFinishTime},upgrade={action:'upgrade',level:p.level,levels:p.levels,incomeFrom,expectedUpgradeCost:quote.costs[0].num};
 income.upgradePreparation={levels:p.levels,expectedCost:quote.costs[0].num};
 const nodes=[{id:'start',type:'START'},{id:'income',type:'ACTION',module:moduleId,parameters:income,selection:{unique:true}},{id:'verify-income',type:'VERIFY',module:moduleId},{id:'upgrade',type:'ACTION',module:moduleId,parameters:upgrade,selection:{unique:true}},{id:'verify-upgrade',type:'VERIFY',module:moduleId},{id:'stop',type:'STOP'}];
 const budget={resources:copy(quote.costs),quotas:[],uids:[{type:'afk-income-interval',id:p.level+':'+p.afkStartTime+':'+p.afkFinishTime},{type:'afk-upgrade',id:upgradeUid(upgrade)}]},suffix=hash({p,budget}).slice(0,20);
 return {source:{level:p.level,...incomeFrom},levels:p.levels,targetLevel:quote.targetLevel,costs:copy(quote.costs),mainlineStage:liveFacts.get(f).mainlineStage,graph:{version:1,id:'afk-income-upgrade-'+suffix,name:'普通收益确认后明确升级'+p.levels+'级',budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:2,modules:[moduleId]},nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'固定原收益区间及升级增量；当前自有徽章须足额，逐档成本及累计父预算不随收入扩大。收益SUCCESS/CONFIRMED落盘后独立调查新段，匹配原收益来源才允许升级。每步复用原授权及历史，状态变化、拒绝、UNKNOWN或到限停止；重启只读，不自动重放。'};
}

function afkRejectionIdentity(operation){
 if(isIncome(operation?.parameters)){const {upgradePreparation,...parameters}=operation.parameters;return businessRejectionIdentity({...operation,parameters});}
 if(isUpgrade(operation?.parameters)){const {incomeFrom,expectedUpgradeCost,...parameters}=operation.parameters,interval=operation.target?.interval;return businessRejectionIdentity({...operation,parameters,budgetClaims:interval?{...operation.budgetClaims,uids:[{type:'afk-upgrade',id:upgradeUid(parameters,interval)}]}:operation.budgetClaims});}
 return businessRejectionIdentity(operation);
}
export const afkLevelRewardsModule=Object.freeze({id:moduleId,label:'挂机等级奖励',capabilities:Object.freeze(['BIZ-R10']),defaultConfig:AFK_LEVEL_REWARDS_DEFAULT_CONFIG,validateConfig:validateAfkLevelRewardsConfig,validateParameters:validateAfkLevelRewardsParameters,survey:surveyAfkLevelRewards,view:viewAfkLevelRewards,plan:planAfkLevelRewards,verify:verifyAfkLevelReward,rejectionIdentity:afkRejectionIdentity,dependencyVersions:afkLevelRewardsDependencyVersions});
