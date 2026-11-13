// W16: one free hero recruit, bound to its observed cooldown marker.
// The shared executor owns authorization, persistence, budgets and transport.
import { createHash } from 'node:crypto';
import { parseOperationInventory, parseOperationHero } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';

const moduleId='free-recruit',scope={kind:'ACCOUNT'},request='RecruitStartRequest',response='RecruitStartResponse';
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const uint=n=>Number.isInteger(n)&&n>=0&&n<=2147483647,positive=n=>uint(n)&&n>0;
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const fields=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const configNames=['ModuleOpenCfg','HeroCfg','ItemCfg'];
const sources={recruit:'RecruitInfoResponse',heroes:'AllHeroResponse',city:'OnWaterResponse',items:'AllItemResponse',resources:'AllResourceResponse'};
const liveFacts=new WeakMap(),costSource='Fixed v76 HeroRecruitItem and RecruitUtil; exactly way=RECRUIT_FREE(1), zero ticket or resource debit';
export const FREE_RECRUIT_EVIDENCE=Object.freeze({
 source:'Fixed v76 main/game.js HeroRecruitItem/RecruitModel/RecruitUtil',
 freeDispatchByteOffset:3614740,cooldownByteOffset:3613603,rewardVoByteOffset:5533993,openCheckByteOffset:5534744,
 semantics:'Explicit freeEndTimeSeconds=0 or <= trusted server seconds; way1 costs zero; frag.asset gives item reward, otherwise heroId names the new hero; future cooldown from typed receipt must match independent RecruitInfo',
 realGame:'REAL_UNVERIFIED'
});
export const FREE_RECRUIT_DEFAULT_CONFIG=Object.freeze({enabled:false});
export function validateFreeRecruitConfig(v={}) {
 if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('免费英雄招募配置只接受 enabled 布尔值');
 return {enabled:v.enabled??false};
}
export function validateFreeRecruitParameters(v={}) {
 if(!fields(v,[]))throw invalid('普通免费英雄招募只接受空参数，固定单次且禁止付费');
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
function parseRecruitData(data) {
 const keys=['freeEndTimeSeconds','nextLuck','recruitTimes'];
 if(!keys.every(k=>own(data,k)&&uint(data[k]))||!own(data,'task')||!['times','gotId'].every(k=>own(data.task,k)&&uint(data.task[k])))return null;
 return {freeEndTimeSeconds:data.freeEndTimeSeconds,nextLuck:data.nextLuck,recruitTimes:data.recruitTimes,task:{times:data.task.times,gotId:data.task.gotId}};
}
function parseRecruit(raw) {
 if(!own(raw,'hero'))return null;
 const hero=parseRecruitData(raw.hero);return hero?{hero,antique:own(raw,'antique')?copy(raw.antique):null}:null;
}
function parseHeroes(raw) {
 if(!own(raw,'heroes')||!dense(raw.heroes))return null;
 const rows=raw.heroes.map(parseOperationHero);
 return rows.some(row=>row===null)||new Set(rows.map(row=>row.heroId)).size!==rows.length?null:rows.sort((a,b)=>a.heroId.localeCompare(b.heroId)).map(row=>row.raw);
}
function parseBroadcast(raw) {
 if(!own(raw,'building')||!dense(raw.building))return null;
 const rows=raw.building.filter(r=>own(r,'buildingId')&&r.buildingId==='1广播站');
 if(rows.length!==1||!own(rows[0],'level')||!positive(rows[0].level))return null;
 return {buildingId:'1广播站',level:rows[0].level};
}
const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function snapshot(inputs,context) {
 const recruit=parseRecruit(inputs?.recruit),heroes=parseHeroes(inputs?.heroes),broadcast=parseBroadcast(inputs?.city),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
 return recruit&&heroes&&broadcast&&inventory.stockReliable?{context,recruit,heroes,broadcast,inventory:stockState(inventory.stock)}:null;
}
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available,startClock:f.startClock,endClock:f.endClock});
export async function surveyFreeRecruit(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}) {
 parameters=validateFreeRecruitParameters(parameters);
 const opts={signal,stop},context=contextOf(client,player),notes=[],startClock=clockOf(client,context);
 const active=()=>assertExecutionActive(client,opts);active();
 const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{
  const name=response.replace(/Response$/,'Request');active();
  if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return[key,null,null];}
  try{const value=await awaitExecution(client.request(name,{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}
  catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}
 }));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('招募采集期间账号或连接变化'),{code:'CANCELLED'});
 const endClock=clockOf(client,context),raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),recruit=parseRecruit(raw.recruit),heroes=parseHeroes(raw.heroes),broadcast=parseBroadcast(raw.city),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sources[k],sourceAt,scope,reliable:k==='recruit'?recruit!==null:k==='heroes'?heroes!==null:k==='city'?broadcast!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,...inventory,state:snapshot(inputs,context),available:Object.keys(protocol??{}),notes,startClock,endClock};
 liveFacts.set(f,{client,player,digest:digest(f)});return f;
}

function authority(f) {
 const live=liveFacts.get(f),c=f?.context;
 if(!live||live.digest!==digest(f)||live.client.connected!==true||!same(c,contextOf(live.client,live.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
 if(!same(snapshot(f.inputs,c),f.state))return false;
 return Object.entries(sources).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function currentClock(f) {
 const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null;
 return clock&&f.startClock&&f.endClock&&f.startClock.earliestMs<=f.endClock.earliestMs&&f.endClock.earliestMs<=clock.earliestMs?clock:null;
}
function catalog(config) {
 const modules=config?.tables?.ModuleOpenCfg?.data,heroes=config?.tables?.HeroCfg?.data,items=config?.tables?.ItemCfg?.data;
 if(!dense(modules)||!dense(heroes)||!heroes.length||!dense(items))return null;
 const gates=modules.filter(r=>own(r,'moduleId')&&r.moduleId==='英雄入口');
 if(gates.length!==1||!own(gates[0],'playerLevel')||!positive(gates[0].playerLevel)||heroes.some(r=>!own(r,'id')||!text(r.id))||new Set(heroes.map(r=>r.id)).size!==heroes.length||items.some(r=>!own(r,'id')||!text(r.id))||new Set(items.map(r=>r.id)).size!==items.length)return null;
 return {requiredLevel:gates[0].playerLevel,heroIds:heroes.map(r=>r.id),itemIds:items.map(r=>r.id)};
}
function candidate(f,{config,moduleConfig=FREE_RECRUIT_DEFAULT_CONFIG}={}) {
 const matches=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null)),defs=matches?catalog(f?.configEvidence):null;
 const valid=authority(f),clock=valid?currentClock(f):null,beforeState=copy(f?.state??null),marker=f?.state?.recruit?.hero?.freeEndTimeSeconds??null;
 const blockedReason=!validateFreeRecruitConfig(moduleConfig).enabled?'FREE_RECRUIT_DISABLED':!valid?'FREE_RECRUIT_AUTHORITY_UNKNOWN':!defs?'FREE_RECRUIT_CONFIG_UNKNOWN':!positive(f.context.playerLevel)?'FREE_RECRUIT_LEVEL_UNKNOWN':f.context.playerLevel<defs.requiredLevel?'FREE_RECRUIT_LEVEL_LOCKED':!clock?'FREE_RECRUIT_CLOCK_UNKNOWN':marker!==0&&clock.earliestMs<marker*1000?'FREE_RECRUIT_COOLDOWN':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const identity=hash({beforeState,defs}),budgetClaims={resources:[],quotas:[{id:moduleId+':cooldown:'+marker,num:1}],uids:[{type:moduleId,id:String(marker)}]};
 const expectedState=beforeState?{context:copy(beforeState.context),broadcast:copy(beforeState.broadcast),rule:'EXACT_SINGLE_TYPED_RECRUIT',cooldown:'FUTURE_EXPLICIT_AND_MATCHES_REREAD',reward:'EXACT_TYPED_FRAGMENT_NET_OR_ONE_NEW_HERO_ID',otherBalances:'UNCHANGED'}:null;
 return {module:moduleId,actionId:moduleId+':'+marker+':'+identity,actionType:'CLAIM',target:{freeEndTimeSeconds:marker,way:1},parameters:{},identity,beforeState,expectedState,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'免费英雄招募 ×1',requiredLevel:defs?.requiredLevel??null,
 ...(blockedReason===null?{action:{request,response,body:{way:1}}}:{})};
}
export function viewFreeRecruit(f,options={}) {
 validateFreeRecruitParameters(options.parameters??{});
 return {module:moduleId,recruit:copy(f?.state?.recruit??null),broadcast:copy(f?.state?.broadcast??null),candidates:[candidate(f,options)],notes:[...(f?.notes??[]),'仅免费英雄单次 way=1；不使用票券或高级招募。回执必须同时获得独立冷却与完整英雄/库存复读确认，未知结果不重放。']};
}
export function planFreeRecruit(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
 validateFreeRecruitParameters(parameters);
 if(!dense(selections)||selections.length>1||selections.some(v=>!text(v)))throw invalid('免费英雄招募每批只允许一个精确 actionId');
 const row=viewFreeRecruit(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));
 return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};
}
export function verifyFreeRecruit(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!currentClock(before)||!currentClock(after)||!same(before.configEvidence,after.configEvidence))return no('招募前后账号、可信时钟、配置或库存不可靠');
 const canonical=candidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('招募合同与写前事实不一致');
 const data=own(result,'recruitData')?parseRecruitData(result.recruitData):null;
 if(!data||!own(result,'reward')||!dense(result.reward)||result.reward.length!==1||data.freeEndTimeSeconds*1000<=currentClock(after).latestMs||data.freeEndTimeSeconds<=before.state.recruit.hero.freeEndTimeSeconds||!same(data,after.state.recruit.hero)||!same(before.state.recruit.antique,after.state.recruit.antique)||!same(before.state.broadcast,after.state.broadcast))return no('缺少同一次明确回执与独立新冷却，或无关招募/广播站状态变化');
 const reward=result.reward[0],defs=catalog(before.configEvidence),stock=new Map(before.stock),heroes=copy(before.state.heroes);
 let received;
 if(own(reward,'frag')&&reward.frag!==null) {
  if(!own(reward.frag,'asset')||!dense(reward.frag.asset)||reward.frag.asset.length!==1)return no('碎片奖励包不完整或多义');
  const item=reward.frag.asset[0],num=own(item,'num')?safeResourceQuantity(item.num):null;
  if(!own(item,'type')||item.type!==0||!own(item,'id')||!defs.itemIds.includes(item.id)||num===null||num<=0)return no('碎片奖励身份/数量不明确');
  const n=(stock.get(item.id)??0)+num;if(!Number.isSafeInteger(n))return no('碎片库存溢出');stock.set(item.id,n);received={kind:'ITEM',id:item.id,num};
 } else {
  if(!own(reward,'heroId')||!defs.heroIds.includes(reward.heroId)||before.state.heroes.some(h=>h.heroId===reward.heroId)||own(reward,'trans')&&reward.trans!==false)return no('未确认明确且此前未拥有的新英雄');
  const added=after.state.heroes.find(h=>h.heroId===reward.heroId);if(!added)return no('新英雄未复读确认');heroes.push(copy(added));heroes.sort((a,b)=>a.heroId.localeCompare(b.heroId));received={kind:'HERO',heroId:reward.heroId};
 }
 if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state.heroes,heroes)||!same(after.state.inventory,stockState(stock)))return no('英雄/完整库存未确认本次精确奖励，或存在无关变化');
 return {confirmed:true,afterState:copy(after.state),reason:'单次免费回执与独立新冷却、英雄/完整库存净入共同确认',responseEvidence:{freeEndTimeSeconds:data.freeEndTimeSeconds,received}};
}
export function freeRecruitDependencyVersions({config,moduleConfig=FREE_RECRUIT_DEFAULT_CONFIG}={}) {return {moduleConfig:validateFreeRecruitConfig(moduleConfig),tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const freeRecruitModule=Object.freeze({id:moduleId,label:'普通免费英雄招募',capabilities:Object.freeze(['BIZ-D02']),defaultConfig:FREE_RECRUIT_DEFAULT_CONFIG,validateConfig:validateFreeRecruitConfig,validateParameters:validateFreeRecruitParameters,survey:surveyFreeRecruit,view:viewFreeRecruit,plan:planFreeRecruit,verify:verifyFreeRecruit,rejectionIdentity:businessRejectionIdentity,dependencyVersions:freeRecruitDependencyVersions});
