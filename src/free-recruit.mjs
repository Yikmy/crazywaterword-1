// W16: explicit hero/antique free, single-ticket or fixed owned-ticket batches.
// The shared executor owns authorization, persistence, budgets and transport.
import { createHash } from 'node:crypto';
import { configuredRewardSeason } from './dailies.mjs';
import { heroDerivedStateReliable } from './equipment-growth.mjs';
import { parseAntiqueOwnership, readAntiqueGrowthCatalog, antiqueSuitsConfirmed } from './antique-growth.mjs';
import { buildDailyDriverBody } from './actions.mjs';
import { parseOperationInventory, parseOperationHero } from './hero-operations.mjs';
import { ResourceLedger, RESOURCE_NAMES, safeResourceQuantity } from './resource-ledger.mjs';
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
const taskConfigNames=['HeroRecruitTaskCfg','AntiqueRecruitTaskCfg'];
const configNamesFor=p=>p?.recruit==='antique'?[...configNames,'AntiqueBaseCfg','AntiqueFragReturnCfg','AntiqueSuitCfg']:configNames;
const sourcesFor=p=>p?.recruit==='antique'?{...sources,antiques:'AllAntiqueResponse'}:sources;
const sources={recruit:'RecruitInfoResponse',heroes:'AllHeroResponse',city:'OnWaterResponse',items:'AllItemResponse',resources:'AllResourceResponse'};
const liveFacts=new WeakMap(),costSource='Fixed v76 HeroRecruitItem and RecruitUtil; exactly way=RECRUIT_FREE(1), zero ticket or resource debit';
const ticketCostSource='Fixed v76 HeroRecruitItem._recruit and RecruitUtil.needRecruitItemNum; ways 2/3/4 consume exactly 1/10/50 owned 抽卡券';
export const FREE_RECRUIT_EVIDENCE=Object.freeze({
 source:'Fixed v76 main/game.js HeroRecruitItem/RecruitModel/RecruitUtil',
 freeDispatchByteOffset:3614740,cooldownByteOffset:3613603,rewardVoByteOffset:5533993,openCheckByteOffset:5534744,
 semantics:'Explicit freeEndTimeSeconds=0 or <= trusted server seconds; way1 costs zero; frag.asset gives item reward, otherwise heroId names the new hero; future cooldown from typed receipt must match independent RecruitInfo',
 ticketSemantics:'Explicit RECRUIT_SINGLE(2): one owned ticket, only while free marker remains future; independent receipt/state and exact net inventory required',
 batchSemantics:'Explicit RECRUIT_BATCH_10(3)/RECRUIT_BATCH_50(4), exactly 10/50 owned tickets; independent batch branch, no free substitution; exact typed reward count and net state required',
 batchDispatchModuleByteOffset:3609201,batchCostModuleByteOffset:5533184,
 antiqueObservationModuleByteOffset:265838,
 antiqueObservationSemantics:'AntiqueRecruitItem uses RecruitInfo.antique, the same free marker comparison, and owned 藏品券 costs 1/10/50; explicit AntiqueRecruitRequest type=1/way uses its own typed new-antique/configured conversion branch and independent AllAntique ownership; original growth catalog and derived-suit validation are reused',
 taskSemantics:'RecruitTaskItem displays times >= configured times and gotId >= id independently; RecruitUtil.seasonTasks uses ordered season groups. GotHeroRecruitTaskRequest/GotAntiqueRecruitTaskRequest are empty and share GotRecruitTaskResponse(gotId,reward); exact target/season and recovery attribution remain unproven, observation only',
 advertisingSemantics:'RecruitView._onBtnAdRecruit calls recruitAdv only after AdvUtils.playAdv success; RECRUIT_ADV(5) is advertising, never ordinary free authorization',
 realGame:'REAL_UNVERIFIED'
});
export const FREE_RECRUIT_DEFAULT_CONFIG=Object.freeze({enabled:false});
export function validateFreeRecruitConfig(v={}) {
 if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('免费英雄招募配置只接受 enabled 布尔值');
 return {enabled:v.enabled??false};
}
// Shared with the legacy read-only driver; never grants execution authority.
const ownedRecruitCosts=(way,id)=>way===1?[]:[{id,num:({2:1,3:10,4:50})[way]}];
export function heroRecruitCosts(way) {
 if(![1,2,3,4].includes(way))throw invalid('仅明确免费、单券、十连或五十连招募有成本合同');
 return ownedRecruitCosts(way,'抽卡券');
}
export function validateFreeRecruitParameters(v={}) {
 if(!fields(v,['payment','count','recruit'])||own(v,'recruit')&&!['hero','antique'].includes(v.recruit)||own(v,'payment')&&!['free','ticket'].includes(v.payment)||own(v,'count')&&(v.payment!=='ticket'||![1,10,50].includes(v.count)))throw invalid('默认英雄免费单次；古董须明确recruit=antique，自有券须明确payment=ticket与count=1、10或50');
 return {...(v.recruit==='antique'?{recruit:'antique'}:{}),...(v.payment==='ticket'?{payment:'ticket',...(v.count>1?{count:v.count}:{})}:{})};
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
function parseRecruitTask(task) {
 return ['times','gotId'].every(k=>own(task,k)&&uint(task[k]))?{times:task.times,gotId:task.gotId}:null;
}
function parseRecruitData(data) {
 const keys=['freeEndTimeSeconds','nextLuck','recruitTimes'],task=own(data,'task')?parseRecruitTask(data.task):null;
 if(!keys.every(k=>own(data,k)&&uint(data[k]))||!task)return null;
 return {freeEndTimeSeconds:data.freeEndTimeSeconds,nextLuck:data.nextLuck,recruitTimes:data.recruitTimes,task};
}
function parseRecruit(raw,parameters={}) {
 if(!own(raw,'hero'))return null;
 const hero=parseRecruitData(raw.hero),antique=parameters.recruit==='antique'?parseRecruitData(raw.antique):own(raw,'antique')?copy(raw.antique):null;return hero&&(parameters.recruit!=='antique'||antique)?{hero,antique}:null;
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
function snapshot(inputs,context,parameters={}) {
 const recruit=parseRecruit(inputs?.recruit,parameters),antiques=parameters.recruit==='antique'?parseAntiqueOwnership(inputs?.antiques):null,heroes=parseHeroes(inputs?.heroes),broadcast=parseBroadcast(inputs?.city),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
 return recruit&&heroes&&broadcast&&inventory.stockReliable&&(parameters.recruit!=='antique'||antiques)?{context,recruit,heroes,broadcast,inventory:stockState(inventory.stock),...(parameters.recruit==='antique'?{antiques}:{})}:null;
}
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,taskConfigEvidence:f.taskConfigEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available,startClock:f.startClock,endClock:f.endClock});
export async function surveyFreeRecruit(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}) {
 parameters=validateFreeRecruitParameters(parameters);
 const readSources=sourcesFor(parameters),tables=configNamesFor(parameters);
 const opts={signal,stop},context=contextOf(client,player),notes=[],startClock=clockOf(client,context);
 const active=()=>assertExecutionActive(client,opts);active();
 const observations=await Promise.all(Object.entries(readSources).map(async([key,response])=>{
  const name=response.replace(/Response$/,'Request');active();
  if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return[key,null,null];}
  try{const value=await awaitExecution(client.request(name,{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}
  catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}
 }));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('招募采集期间账号或连接变化'),{code:'CANCELLED'});
 const endClock=clockOf(client,context),raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),recruit=parseRecruit(raw.recruit,parameters),heroes=parseHeroes(raw.heroes),broadcast=parseBroadcast(raw.city),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:readSources[k],sourceAt,scope,reliable:k==='recruit'?recruit!==null:k==='heroes'?heroes!==null:k==='city'?broadcast!==null:k==='antiques'?parseAntiqueOwnership(raw.antiques)!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,taskConfigEvidence:{tables:Object.fromEntries(taskConfigNames.map(n=>[n,copy(config?.tables?.[n]??null)]))},configEvidence:{tables:Object.fromEntries(tables.map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,...inventory,state:snapshot(inputs,context,parameters),available:Object.keys(protocol??{}),notes,startClock,endClock};
 liveFacts.set(f,{client,player,digest:digest(f)});return f;
}

function liveAuthority(f) {
 const live=liveFacts.get(f),c=f?.context;
 return Boolean(live&&live.digest===digest(f)&&live.client.connected===true&&same(c,contextOf(live.client,live.player))&&text(c?.accountId)&&text(c?.connectionId)&&Number.isSafeInteger(c?.generation)&&c.generation>=0&&c.playerId&&c.worldId);
}
function authority(f) {
 const c=f?.context;
 if(!liveAuthority(f)||!f.state||f.stockReliable!==true||!(f.stock instanceof Map)||!same(snapshot(f.inputs,c,f.parameters),f.state))return false;
 return Object.entries(sourcesFor(f.parameters)).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
// A task observation needs its own explicit fields, not the unrelated hero,
// broadcast or inventory prerequisites of recruitment. Retain the original
// response provenance; this projection never makes the full source writable.
function recruitTaskFact(f,kind) {
 if(!liveAuthority(f))return null;
 const source=f.sourceFacts?.recruit,input=f.inputs?.recruit;
 if(source?.provenance?.source!==sources.recruit||!same(source.value,input)||!own(input,kind)||!own(input[kind],'task'))return null;
 const task=parseRecruitTask(input[kind].task);if(!task)return null;
 const fact=createStateFact(task,{...source.provenance,reliable:true});
 return factsFreshnessPolicy(fact,{accountId:f.context.accountId,generation:f.context.generation,maxAgeMs:30000,scope}).status==='FRESH'?fact:null;
}
function currentClock(f) {
 const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null;
 return clock&&f.startClock&&f.endClock&&f.startClock.earliestMs<=f.endClock.earliestMs&&f.endClock.earliestMs<=clock.earliestMs?clock:null;
}
function catalog(config,parameters={}) {
 const modules=config?.tables?.ModuleOpenCfg?.data,heroes=config?.tables?.HeroCfg?.data,items=config?.tables?.ItemCfg?.data;
 if(!dense(modules)||!dense(heroes)||!heroes.length||!dense(items))return null;
 const gates=modules.filter(r=>own(r,'moduleId')&&r.moduleId==='英雄入口');
 if(gates.length!==1||!own(gates[0],'playerLevel')||!positive(gates[0].playerLevel)||heroes.some(r=>!own(r,'id')||!text(r.id))||new Set(heroes.map(r=>r.id)).size!==heroes.length||items.some(r=>!own(r,'id')||!text(r.id))||new Set(items.map(r=>r.id)).size!==items.length)return null;
 const common={requiredLevel:gates[0].playerLevel,heroIds:heroes.map(r=>r.id),itemIds:items.map(r=>r.id)};
 if(parameters.recruit!=='antique')return common;
 const antique=readAntiqueGrowthCatalog(config,{action:'activate'}),returns=config?.tables?.AntiqueFragReturnCfg?.data;
 if(!antique||!dense(returns)||returns.some(r=>!own(r,'color')||!text(r.color)||!own(r,'count')||!positive(r.count))||new Set(returns.map(r=>r.color)).size!==returns.length||antique.base.some(r=>!returns.some(x=>x.color===r.color)||!common.itemIds.includes(r.antiqueId+'碎片'))||!common.itemIds.includes('藏品券'))return null;
 return {...common,requiredLevel:Math.max(common.requiredLevel,antique.playerLevel),antique,fragReturns:returns.map(r=>({color:r.color,count:r.count}))};
}
function candidate(f,{config,moduleConfig=FREE_RECRUIT_DEFAULT_CONFIG,parameters=f?.parameters??{}}={}) {
 parameters=validateFreeRecruitParameters(parameters);
 const antique=parameters.recruit==='antique',key=antique?'antique':'hero',ticketId=antique?'藏品券':'抽卡券',prefix=antique?'antique:':'';
 const ticket=parameters.payment==='ticket',count=ticket?(parameters.count??1):1,way=ticket?({1:2,10:3,50:4})[count]:1,costs=ownedRecruitCosts(way,ticketId),tables=configNamesFor(parameters);
 const matches=same(tables.map(n=>config?.tables?.[n]??null),tables.map(n=>f?.configEvidence?.tables?.[n]??null)),defs=matches?catalog(f?.configEvidence,parameters):null;
 const valid=authority(f)&&same(parameters,f.parameters),clock=valid?currentClock(f):null,beforeState=copy(f?.state??null),marker=f?.state?.recruit?.[key]?.freeEndTimeSeconds??null;
 const readiness=freeRecruitReadiness(marker,clock),writeRequest=antique?'AntiqueRecruitRequest':request,writeResponse=antique?'AntiqueRecruitResponse':response;
 const blockedReason=!validateFreeRecruitConfig(moduleConfig).enabled?'FREE_RECRUIT_DISABLED':!valid?'FREE_RECRUIT_AUTHORITY_UNKNOWN':!defs||ticket&&!defs.itemIds.includes(ticketId)?'FREE_RECRUIT_CONFIG_UNKNOWN':!positive(f.context.playerLevel)?'FREE_RECRUIT_LEVEL_UNKNOWN':f.context.playerLevel<defs.requiredLevel?'FREE_RECRUIT_LEVEL_LOCKED':!clock?'FREE_RECRUIT_CLOCK_UNKNOWN':ticket&&count===1&&readiness!=='COOLDOWN'?'RECRUIT_TICKET_REQUIRES_KNOWN_COOLDOWN':!ticket&&readiness!=='READY_BY_CLOCK'?'FREE_RECRUIT_COOLDOWN':ticket&&(f.stock.get(ticketId)??0)<count?'RECRUIT_TICKET_INSUFFICIENT':![writeRequest,writeResponse].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const ticketUid=hash({recruit:beforeState?.recruit,heroes:beforeState?.heroes,broadcast:beforeState?.broadcast,inventory:beforeState?.inventory,defs,...(antique?{antiques:beforeState?.antiques}:{})});
 const identity=hash({beforeState,defs,...(ticket||antique?{parameters}:{})}),budgetClaims=ticket?{resources:copy(costs),quotas:[],uids:[{type:moduleId,id:prefix+'ticket:'+ticketUid}]}:{resources:[],quotas:[{id:moduleId+':'+prefix+'cooldown:'+marker,num:1}],uids:[{type:moduleId,id:prefix+marker}]};
 const expectedState=beforeState?{context:copy(beforeState.context),broadcast:copy(beforeState.broadcast),rule:count===1?'EXACT_SINGLE_TYPED_RECRUIT':'EXACT_BATCH_TYPED_RECRUIT',cooldown:ticket?(count===1?'UNCHANGED_FUTURE_AND_MATCHES_REREAD':'UNCHANGED_AND_MATCHES_REREAD'):'FUTURE_EXPLICIT_AND_MATCHES_REREAD',reward:antique?'EXACT_TYPED_ANTIQUE_OR_CONFIGURED_CONVERSION_AND_FULL_NET':count===1?'EXACT_TYPED_FRAGMENT_NET_OR_ONE_NEW_HERO_ID':'EXACT_TYPED_REWARD_COUNT_AND_AGGREGATE_NET',otherBalances:'UNCHANGED',...(antique?{heroDerivedValues:'SERVER_OBSERVED_ONLY_FOR_NEW_ANTIQUE_OTHER_HERO_FIELDS_EXACT'}:{})}:null;
 return {module:moduleId,actionId:moduleId+':'+prefix+(ticket?'ticket:':'')+marker+':'+identity,actionType:ticket?'RECRUIT':'CLAIM',target:{freeEndTimeSeconds:marker,way,...(antique?{recruit:'antique',type:1}:{})},parameters,identity,beforeState,expectedState,costs,costSource:antique?'Fixed v76 AntiqueRecruitItem/RecruitUtil: type=RECRUIT_ANTIQUE(1), ways 1/2/3/4 cost zero/1/10/50 owned 藏品券':ticket?ticketCostSource:costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:ticket?'自有'+ticketId+'招募 ×'+count:'免费'+(antique?'古董':'英雄')+'招募 ×1',requiredLevel:defs?.requiredLevel??null,
 ...(blockedReason===null?{action:{request:writeRequest,response:writeResponse,body:buildDailyDriverBody(writeRequest,{way,...(antique?{type:1}:{})})}}:{})};
}
export const freeRecruitCooldownSource=(parameters={})=>'RecruitInfoResponse.'+(parameters.recruit==='antique'?'antique':'hero')+'.freeEndTimeSeconds';
export function freeRecruitReadiness(marker,bounds) {
 return !uint(marker)||!bounds||!['earliestMs','latestMs'].every(k=>typeof bounds[k]==='number'&&Number.isFinite(bounds[k])&&bounds[k]>=0)||bounds.earliestMs>bounds.latestMs?'UNKNOWN':marker===0||bounds.earliestMs>=marker*1000?'READY_BY_CLOCK':bounds.latestMs<marker*1000?'COOLDOWN':'UNKNOWN';
}
// Historical observation only: never recompute readiness against local time on
// restart, clear refusal/UNKNOWN memory, or recover a runnable permit.
export function validateFreeRecruitCooldownObservation(v) {
 const keys=['status','source','freeEndTimeSeconds','sourceAt','serverBounds','readiness','eligibility','executable','autoResume'];
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
 const bounds=v?.serverBounds;
 if(!fields(v,keys)||Reflect.ownKeys(v).length!==keys.length||!['OBSERVED','UNKNOWN'].includes(v.status)||!['hero','antique'].some(recruit=>v.source===freeRecruitCooldownSource({recruit}))||
    v.eligibility!==null||v.executable!==false||v.autoResume!==false||
    (v.status==='UNKNOWN'?(v.freeEndTimeSeconds!==null||v.sourceAt!==null||bounds!==null||v.readiness!=='UNKNOWN'):
     !uint(v.freeEndTimeSeconds)||!Number.isSafeInteger(v.sourceAt)||v.sourceAt<0||
     bounds!==null&&(!fields(bounds,['earliestMs','latestMs'])||Reflect.ownKeys(bounds).length!==2||!finite(bounds.earliestMs)||!finite(bounds.latestMs)||bounds.earliestMs>bounds.latestMs)||
     v.readiness!==freeRecruitReadiness(v.freeEndTimeSeconds,bounds)))throw invalid('免费招募冷却历史必须为精确的只读来源与原观察时钟区间');
 return copy(v);
}
function recruitCooldownObservation(f) {
 const recruit=f?.parameters?.recruit==='antique'?'antique':'hero',valid=authority(f),clock=valid?currentClock(f):null,marker=valid?f.state.recruit[recruit].freeEndTimeSeconds:null;
 const bounds=clock?{earliestMs:clock.earliestMs,latestMs:clock.latestMs}:null;
 return validateFreeRecruitCooldownObservation({status:valid?'OBSERVED':'UNKNOWN',source:freeRecruitCooldownSource({recruit}),freeEndTimeSeconds:marker,sourceAt:valid?f.sourceFacts.recruit.provenance.sourceAt:null,
  serverBounds:bounds,readiness:valid?freeRecruitReadiness(marker,bounds):'UNKNOWN',eligibility:null,executable:false,autoResume:false});
}

// Read-only sibling observation from the same existing RecruitInfo survey.
// It never creates action IDs, requests, task progress, permits or recovery facts.
function antiqueRecruitObservation(f,{config}={}) {
 const rows=f?.configEvidence?.tables?.ModuleOpenCfg?.data;
 const gates=dense(rows)?rows.filter(r=>own(r,'moduleId')&&r.moduleId==='藏品'):[];
 const level=gates.length===1&&own(gates[0],'playerLevel')&&positive(gates[0].playerLevel)?gates[0].playerLevel:null;
 const defs=catalog(f?.configEvidence),data=parseRecruitData(f?.state?.recruit?.antique);
 const valid=authority(f)&&same(configNamesFor(f?.parameters).map(n=>config?.tables?.[n]??null),configNamesFor(f?.parameters).map(n=>f?.configEvidence?.tables?.[n]??null))&&defs?.itemIds.includes('藏品券')&&level!==null&&positive(f.context.playerLevel)&&data!==null;
 const clock=valid?currentClock(f):null,readiness=valid?freeRecruitReadiness(data.freeEndTimeSeconds,clock):'UNKNOWN';
 const ownedTickets=valid?(f.stock.get('藏品券')??0):null;
 return {kind:'antique',status:valid?'OBSERVED':'UNKNOWN',source:'RecruitInfoResponse.antique',recruit:valid?copy(data):null,
  requiredLevel:valid?level:null,ticketId:'藏品券',ownedTickets,readiness,eligibility:null,executable:false,autoResume:false,
  blockedReason:'CONDITIONS_ARE_NOT_EXECUTION_AUTHORITY',
  modes:[1,2,3,4].map(way=>{
   const costs=ownedRecruitCosts(way,'藏品券'),count=way===1?1:costs[0].num;
   const observedRequirementsMet=!valid?null:f.context.playerLevel<level?false:!clock||readiness==='UNKNOWN'?null:way===1?readiness==='READY_BY_CLOCK':way===2?readiness==='COOLDOWN'&&ownedTickets>=count:ownedTickets>=count;
   return {way,payment:way===1?'free':'ticket',count,costs,observedRequirementsMet,executable:false};
  })};
}

// Same read and task parser as recruitment. These rows describe the client
// display conditions; empty claim requests cannot bind a tier or season.
function recruitTaskObservations(f,{config}={}) {
 const valid=liveAuthority(f),world=valid?roleId(f.context.worldId):null;
 const season=world?Number(BigInt(world)/1000000n%1000n):null;
 const items=f?.configEvidence?.tables?.ItemCfg?.data;
 return ['hero','antique'].map(kind=>{
  const table=kind==='hero'?'HeroRecruitTaskCfg':'AntiqueRecruitTaskCfg';
  const base={kind,status:'UNKNOWN',source:'RecruitInfoResponse.'+kind+'.task',sourceAt:null,season:null,configuredSeason:null,progress:null,claimedThroughId:null,nextRewardId:null,tasks:[],readOnly:true,eligibility:null,executable:false,autoResume:false,settlement:'UNKNOWN',blockedReason:'BLOCKED_EVIDENCE'};
  const fact=valid?recruitTaskFact(f,kind):null,task=fact?.value;
  const matches=same(config?.tables?.[table]??null,f?.taskConfigEvidence?.tables?.[table]??null)&&same(config?.tables?.ItemCfg??null,f?.configEvidence?.tables?.ItemCfg??null);
  const selected=matches?configuredRewardSeason(f?.taskConfigEvidence?.tables?.[table]?.data,season,'id'):null;
  if(!task||!selected||!dense(items))return base;
  const known=new Set(Object.values(RESOURCE_NAMES));
  for(const item of items)if(own(item,'id')&&text(item.id))known.add(item.id);
  const tasks=[];let lastId=0,lastTimes=0;
  for(const row of selected.rows){
   if(!own(row,'times')||!positive(row.times)||row.id<=lastId||row.times<=lastTimes||!own(row,'reward')||!dense(row.reward)||!row.reward.length)return base;
   const rewards=[];
   for(const pair of row.reward){
    if(!dense(pair)||pair.length!==2||!known.has(pair[0])||!Number.isSafeInteger(pair[1])||pair[1]<=0||rewards.some(r=>r.id===pair[0]))return base;
    rewards.push({id:pair[0],num:pair[1]});
   }
   const complete=task.times>=row.times,claimed=task.gotId>=row.id;
   tasks.push({id:row.id,requiredProgress:row.times,completion:complete?'COMPLETE':'INCOMPLETE',rewardState:claimed?'CLAIMED':'UNCLAIMED',observedRequirementsMet:complete&&!claimed,rewards,executable:false,settlement:'UNKNOWN'});
   lastId=row.id;lastTimes=row.times;
  }
  if(task.gotId!==0&&!tasks.some(row=>row.id===task.gotId)||tasks.some(row=>row.rewardState==='CLAIMED'&&row.completion!=='COMPLETE'))return base;
  return {...base,status:'OBSERVED',sourceAt:fact.provenance.sourceAt,season,configuredSeason:selected.configuredSeason,progress:task.times,claimedThroughId:task.gotId,nextRewardId:tasks.find(row=>row.rewardState==='UNCLAIMED')?.id??null,tasks};
 });
}

export function viewFreeRecruit(f,options={}) {
 validateFreeRecruitParameters(options.parameters??f?.parameters??{});
 return {module:moduleId,cooldownObservation:recruitCooldownObservation(f),antiqueObservation:antiqueRecruitObservation(f,options),taskObservations:recruitTaskObservations(f,options),recruit:copy(f?.state?.recruit??null),broadcast:copy(f?.state?.broadcast??null),candidates:[candidate(f,options)],notes:[...(f?.notes??[]),'默认免费单次 way=1；显式 ticket 仅在免费冷却明确未到时扣自有抽卡券1张，绝不自动切换。显式 count=10或50分别固定扣券10或50张，不按余额自动选批量。各模式复用同一回执及独立完整英雄/库存验证，古董写入须显式recruit=antique并重新调查完整藏品/配置，再独立授权；只读条件不构成许可。广告、潜水和购买仍关闭，未知结果不重放。']};
}
export function planFreeRecruit(f,{parameters=f?.parameters??{},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
 validateFreeRecruitParameters(parameters);
 if(!dense(selections)||selections.length>1||selections.some(v=>!text(v)))throw invalid('免费英雄招募每批只允许一个精确 actionId');
 const row=viewFreeRecruit(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));
 return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};
}
export function verifyFreeRecruit(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!same(before.parameters,after.parameters)||!currentClock(before)||!currentClock(after)||!same(before.configEvidence,after.configEvidence))return no('招募前后账号、可信时钟、配置或库存不可靠');
 const canonical=candidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('招募合同与写前事实不一致');
 const antique=canonical.parameters.recruit==='antique',key=antique?'antique':'hero',other=antique?'hero':'antique';
 const ticket=canonical.parameters.payment==='ticket',count=canonical.parameters.count??1;
 const data=own(result,'recruitData')?parseRecruitData(result.recruitData):null;
 const markerMatches=data&&(ticket?data.freeEndTimeSeconds===before.state.recruit[key].freeEndTimeSeconds:data.freeEndTimeSeconds>before.state.recruit[key].freeEndTimeSeconds);
 if(!data||!own(result,'reward')||!dense(result.reward)||result.reward.length!==count||count===1&&data.freeEndTimeSeconds*1000<=currentClock(after).latestMs||!markerMatches||!same(data,after.state.recruit[key])||!same(before.state.recruit[other],after.state.recruit[other])||!same(before.state.broadcast,after.state.broadcast))return no('缺少同一次明确回执与独立新冷却，或无关招募/广播站状态变化');
 const defs=catalog(before.configEvidence,before.parameters),stock=new Map(before.stock),heroes=copy(before.state.heroes),antiques=antique?copy(before.state.antiques.antiques):null,received=[],newColors=new Set();
 if(ticket){const id=antique?'藏品券':'抽卡券';stock.set(id,stock.get(id)-count);}
 const addItem=(id,num)=>{const n=(stock.get(id)??0)+num;if(!defs.itemIds.includes(id)||!Number.isSafeInteger(num)||num<=0||!Number.isSafeInteger(n))return false;stock.set(id,n);received.push({kind:'ITEM',id,num});return true;};
 for(const reward of result.reward){
  const packKey=antique?'reward':'frag';
  if(own(reward,packKey)&&reward[packKey]!==null){
   const pack=reward[packKey];if(!own(pack,'asset')||!dense(pack.asset)||pack.asset.length!==1)return no('碎片奖励包不完整或多义');
   const item=pack.asset[0],num=own(item,'num')?safeResourceQuantity(item.num):null;
   if(!own(item,'type')||item.type!==0||!own(item,'id')||!addItem(item.id,num))return no('碎片奖励身份/数量不明确或库存溢出');
  }else if(antique){
   const base=own(reward,'antiqueId')?defs.antique.base.find(r=>r.antiqueId===reward.antiqueId):null;
   if(!base)return no('藏品奖励身份未知');
   if(own(reward,'trans')&&reward.trans===true){
    const conversion=defs.fragReturns.find(r=>r.color===base.color);if(!conversion||!addItem(base.antiqueId+'碎片',conversion.count))return no('藏品转换品质、碎片或数量未知');
   }else{
    if(own(reward,'trans')&&reward.trans!==false||antiques.some(r=>r.id===base.antiqueId))return no('新藏品与重复转换状态混淆');
    const added=after.state.antiques.antiques.find(r=>r.id===base.antiqueId);if(!added)return no('新藏品未独立复读确认');
    antiques.push(copy(added));antiques.sort((a,b)=>a.id.localeCompare(b.id));newColors.add(base.color);received.push({kind:'ANTIQUE',antiqueId:base.antiqueId,star:added.star});
   }
  }else{
   if(!own(reward,'heroId')||!defs.heroIds.includes(reward.heroId)||heroes.some(h=>h.heroId===reward.heroId)||own(reward,'trans')&&reward.trans!==false)return no('未确认明确且此前未拥有的新英雄');
   const added=after.state.heroes.find(h=>h.heroId===reward.heroId);if(!added)return no('新英雄未复读确认');heroes.push(copy(added));heroes.sort((a,b)=>a.heroId.localeCompare(b.heroId));received.push({kind:'HERO',heroId:reward.heroId});
  }
 }
 if(antique&&(!same(antiques,after.state.antiques.antiques)||before.state.antiques.masterLv!==after.state.antiques.masterLv||!antiqueSuitsConfirmed(before.state.antiques.suits,after.state.antiques.suits,defs.antique.derivedSuitTasks.filter(r=>newColors.has(r.color)).map(r=>r.suitId))))return no('藏品、套装或精通存在未授权变化');
 // Newly owned antiques can refresh server-derived hero power/attributes, as
 // original growth already permits. Every other hero field and ID stays exact;
 // conversion-only results cannot authorize even derived changes.
 const omitDerived=h=>Object.fromEntries(Object.entries(h).filter(([k])=>!['power','attributes'].includes(k)));
 const heroesConfirmed=same(after.state.heroes,heroes)||antique&&newColors.size>0&&heroes.length===after.state.heroes.length&&heroes.every((h,i)=>heroDerivedStateReliable(after.state.heroes[i])&&same(omitDerived(h),omitDerived(after.state.heroes[i])));
 if(Object.keys(sourcesFor(before.parameters)).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!heroesConfirmed||!same(after.state.inventory,stockState(stock)))return no('英雄/藏品/完整库存未确认本次精确奖励，或存在无关变化');
 return {confirmed:true,afterState:copy(after.state),reason:'明确'+count+'次'+(antique?'古董':'英雄')+'回执、独立招募状态及完整库存精确净入共同确认',responseEvidence:{freeEndTimeSeconds:data.freeEndTimeSeconds,received:count===1?received[0]:received}};
}
export function freeRecruitDependencyVersions({config,moduleConfig=FREE_RECRUIT_DEFAULT_CONFIG,parameters={}}={}) {return {moduleConfig:validateFreeRecruitConfig(moduleConfig),tables:Object.fromEntries(configNamesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const freeRecruitModule=Object.freeze({id:moduleId,label:'英雄/古董免费或自有券招募',capabilities:Object.freeze(['BIZ-D02']),defaultConfig:FREE_RECRUIT_DEFAULT_CONFIG,validateConfig:validateFreeRecruitConfig,validateParameters:validateFreeRecruitParameters,survey:surveyFreeRecruit,view:viewFreeRecruit,plan:planFreeRecruit,verify:verifyFreeRecruit,rejectionIdentity:businessRejectionIdentity,dependencyVersions:freeRecruitDependencyVersions});
