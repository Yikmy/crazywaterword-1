// W16/BIZ-R10: exact next configured AFK milestone; the shared executor owns writes.
import { createHash } from 'node:crypto';
import { parseOperationInventory } from './hero-operations.mjs';
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
const request='DrawAfkLevelRewardRequest', response='DrawAfkLevelRewardResponse';
const liveFacts=new WeakMap();
const costSource='Existing ACTIONS.afkLevelDraw and OfflineLvRewardCfg.reward; exact next milestone, zero debit; unlockReward is not immediate income';
export const AFK_LEVEL_REWARDS_DEFAULT_CONFIG = Object.freeze({enabled:false});
export function validateAfkLevelRewardsConfig(v={}) {
  if (!fields(v,['enabled']) || own(v,'enabled') && typeof v.enabled !== 'boolean') throw invalid('挂机等级奖励配置只接受 enabled 布尔值');
  return {enabled:v.enabled??false};
}
export function validateAfkLevelRewardsParameters(v={}) {
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
function snapshot(inputs,context) {
  const afk=parseAfk(inputs?.afk),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
  return afk&&inventory.stockReliable?{context,afk,clickGoldInfo:own(inputs.afk,'clickGoldInfo')?copy(inputs.afk.clickGoldInfo):null,inventory:stockState(inventory.stock)}:null;
}
export async function surveyAfkLevelRewards(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}) {
  parameters=validateAfkLevelRewardsParameters(parameters);
  const options={signal,stop},context=contextOf(client,player),notes=[];
  const active=()=>assertExecutionActive(client,options); active();
  const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{
    const request=response.replace(/Response$/,'Request'); active();
    if (!protocol?.[request] || !protocol?.[response]) {notes.push(request+': PROTOCOL_UNAVAILABLE');return [key,null,null];}
    try { const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,options);return [key,value,Date.now()]; }
    catch(error) {if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}
  }));
  active(); if(!same(context,contextOf(client,player)))throw Object.assign(new Error('挂机采集期间账号或连接改变'),{code:'CANCELLED'});
  const raw=Object.fromEntries(observations.map(([key,value])=>[key,value])),inputs=toSnapshotJson(raw);
  const afk=parseAfk(raw.afk),inventory=parseOperationInventory(raw.items,raw.resources);
  const sourceFacts=Object.fromEntries(observations.map(([key,,sourceAt])=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,source:sources[key],sourceAt,scope,reliable:key==='afk'?afk!==null:inventory.stockReliable})]));
  const f={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(name=>[name,copy(config?.tables?.[name]??null)]))},inputs,sourceFacts,afk,...inventory,state:afk&&inventory.stockReliable?snapshot(inputs,context):null,available:Object.keys(protocol??{}),notes};
  liveFacts.set(f,{digest:digest(f),client,player});return f;
}
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,afk:f.afk,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available});
function authority(f) {
  const bound=liveFacts.get(f);
  if(!bound||bound.digest!==digest(f)||!same(f.context,contextOf(bound.client,bound.player)))return false;
  const c=f?.context;
  if(!identifier(c?.accountId)||!identifier(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
  const state=snapshot(f.inputs,c);
  const parsed=parseOperationInventory(f.inputs?.items,f.inputs?.resources);
  if(!same(state,f.state)||!same(f.afk,state?.afk)||!same([...f.stock].sort(),[...parsed.stock].sort()))return false;
  return Object.entries(sources).every(([key,source])=>f.sourceFacts?.[key]?.provenance?.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
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
 return {module:moduleId,actionId:moduleId+':'+p.level+':'+identity,actionType:'CLAIM',target:copy(p),parameters:copy(p),identity,beforeState,expectedState:after,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'挂机等级 '+p.level+' 奖励',rewards:copy(def?.rewards??null),...(blockedReason===null?{action:{request,response,body:{level:p.level}}}:{})};
}
export function viewAfkLevelRewards(f,options={}) {
 const p=validateAfkLevelRewardsParameters(options.parameters??{}),next=milestones(f?.configEvidence)?.find(row=>row.level>f?.afk?.rewardedLevel),selected=own(p,'level')?p:next?{level:next.level}:null;
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
 const p=operation?.parameters;try{validateAfkLevelRewardsParameters(p);}catch{return no('领取目标不完整');}if(!p?.level)return no('缺少精确领奖等级');
 if(!same(before.configEvidence,after.configEvidence))return no('挂机奖励配置发生变化');
 const canonical=candidate(before,p,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(k=>!same(operation[k],canonical[k])))return no('挂机领取合同与写前事实或配置不一致');
 if(!receipt(result,{level:p.level,rewards:canonical.rewards}))return no('缺少精确已领奖等级及配置奖励回执');
 if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,canonical.expectedState))return no('独立复读未确认精确等级与奖励净入，或无关状态变化');
 return {confirmed:true,afterState:copy(after.state),reason:'专用回执与独立复读同时确认单档等级奖励及完整库存净入'};
}
export function afkLevelRewardsDependencyVersions({config,moduleConfig=AFK_LEVEL_REWARDS_DEFAULT_CONFIG}={}) {return {moduleConfig:validateAfkLevelRewardsConfig(moduleConfig),tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const afkLevelRewardsModule=Object.freeze({id:moduleId,label:'挂机等级奖励',capabilities:Object.freeze(['BIZ-R10']),defaultConfig:AFK_LEVEL_REWARDS_DEFAULT_CONFIG,validateConfig:validateAfkLevelRewardsConfig,validateParameters:validateAfkLevelRewardsParameters,survey:surveyAfkLevelRewards,view:viewAfkLevelRewards,plan:planAfkLevelRewards,verify:verifyAfkLevelReward,rejectionIdentity:businessRejectionIdentity,dependencyVersions:afkLevelRewardsDependencyVersions});
