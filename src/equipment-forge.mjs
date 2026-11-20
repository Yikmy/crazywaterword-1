// Equipment forge semantics only. Shared execution owns permits, transport,
// cancellation, finite budgets and durable UNKNOWN. Preparation freezes a reviewed recipe.
import { createHash } from 'node:crypto';
import { GameClient } from './client.mjs';
import { observePirateMonthCards } from './pirate-quota.mjs';
import { surveyCityOperations } from './city-operations.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { makeTypeResolver } from './world.mjs';
import { seasonFromWorldId } from './alliance.mjs';
import { parseOperationHero, parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime, gameTimeBounds } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';

const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const dense=v=>Array.isArray(v)&&v.length<=10000&&Array.from({length:v.length},(_,i)=>own(v,i)).every(Boolean);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647;
const positive=v=>uint(v)&&v>0;
const same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b),copy=v=>structuredClone(v);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const source='local reference C:/Users/zyk-o/Documents/crazywaterword/src/equip.mjs#planEquip MakeEquip/PickMadeEquip; BuildingEquipMakeCfg.costItem; EquipMakeLibCfg legal result set; universal=false';
const tableNames=['BuildingCfg','BuildingEquipMakeCfg','EquipMakeLibCfg','EquipCfg'];
const dependencyTables=p=>[...tableNames,...(p?.action==='stop-auto'?['MonthCardCfg']:[])];
const liveAutoFacts=new WeakMap();
const factDigest=f=>hash({...f,stock:[...(f.stock??[])]});
export const FORGE_STOP_AUTO_EVIDENCE=Object.freeze({source:'v76 EquipFactoryPop._onBtnAuto + MonthCardModel.effect + WelfareUtil.monthCardId + FactoryUtil.setBuildingAutoWork',equipFactoryPopSha256:'77e418e20255c3d72c41b7cc064d63ec7e61beafc8bda232fa3247326128a63f',monthCardModelSha256:'5fcf22ef42392b52ac22f4fb249a9dbe03d662415ff8a603973eb74b333e4b63',welfareUtilSha256:'cf5be6b8c251281c22de85375e2bdd02fd78512e1c53f69f5e70877ad1624092',factoryUtilSha256:'16876641162829bbb4f3f7037b578e21b77483096720df1a2758c20f18cc3a60',scope:'EXPLICIT_ENTITLED_CURRENT_TRUE_TO_FALSE_ONLY',realGame:'REAL_UNVERIFIED'});
export const FORGE_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const FORGE_EVIDENCE=Object.freeze({missingQueueMeansIdle:'BLOCKED_EVIDENCE',qualityFallback:'EXPLICIT_PREPARATION_ONLY',universalExchange:'BLOCKED_EVIDENCE',exactDuration:'BLOCKED_EVIDENCE_APPOINTMENT_ADJUSTMENT',outputStar:'SERVER_QUEUE_AUTHORITY_ONLY',realGame:'REAL_UNVERIFIED'});
function fields(v,keys){return object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable);}
export function validateForgeConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('装备制造配置仅允许 enabled 布尔值');return {enabled:v.enabled??false};}
export function validateForgeParameters(v={}){
  if(!fields(v,['buildingId','action','makeId','allowUniversal','expectedEquipmentCounts','expectedQueue','expectedStopHash']))throw invalid('装备制造参数包含不支持的字段');
  const out={};
  if(own(v,'buildingId')){if(!id(v.buildingId))throw invalid('buildingId 必须为明确建筑 ID');out.buildingId=v.buildingId;}
  if(own(v,'action')){if(!['make','pick','stop-auto'].includes(v.action))throw invalid('action 仅允许 make、pick 或 stop-auto');out.action=v.action;}
  if(own(v,'makeId')){if(v.action!=='make'||!positive(v.makeId))throw invalid('makeId 仅用于 make，且必须为正 int32');out.makeId=v.makeId;}
  if(own(v,'allowUniversal')&&(v.action!=='make'||typeof v.allowUniversal!=='boolean'))throw invalid('allowUniversal 仅用于 make 且必须为布尔值');
  if(own(v,'expectedEquipmentCounts')){if(!validCounts(v.expectedEquipmentCounts)||!['make','pick'].includes(v.action))throw invalid('预期部位数量须完整且明确');out.expectedEquipmentCounts=copy(v.expectedEquipmentCounts);}
  if(own(v,'expectedQueue')){const q=fields(v.expectedQueue,['makeId','finishTime','equipId','star'])?parseForgeQueue(v.expectedQueue):null;if(!q||q.state!==(v.action==='pick'?'MAKING':v.action==='make'?'IDLE':null))throw invalid('预期队列须匹配明确单次动作');out.expectedQueue={makeId:q.makeId,finishTime:q.finishTime,equipId:q.equipId,star:q.star};}
  if(own(v,'expectedStopHash')){if(v.action!=='stop-auto'||typeof v.expectedStopHash!=='string'||!/^[a-f0-9]{64}$/.test(v.expectedStopHash))throw invalid('停止自动工作须为原当前状态摘要');out.expectedStopHash=v.expectedStopHash;}
  if(v.action==='make')out.allowUniversal=v.allowUniversal??false;
  return out;
}
function exactPositive(v){
  if(typeof v==='number'&&!Number.isSafeInteger(v))return null;
  const n=toSnapshotJson(v);if(!(typeof n==='number'&&Number.isSafeInteger(n))&&!(typeof n==='string'&&/^[1-9]\d*$/.test(n)))return null;
  try{const b=BigInt(n);return b>0n&&b<(1n<<63n)?b.toString():null;}catch{return null;}
}
function validSnapshot(v){
  if(v===null||typeof v==='string'||typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isFinite(v)&&(!Number.isInteger(v)||Number.isSafeInteger(v));
  return (object(v)||dense(v))&&Object.values(v).every(validSnapshot);
}
function catalog(config){
  const t=Object.fromEntries(tableNames.map(n=>[n,config?.tables?.[n]?.data]));
  const b=t.BuildingCfg,m=t.BuildingEquipMakeCfg,l=t.EquipMakeLibCfg,e=t.EquipCfg;
  const bad=()=>({reliable:false,recipes:[],types:[]});
  if(![b,m,l,e].every(v=>dense(v)&&v.length>0)||!b.every(r=>own(r,'buildingType')&&id(r.buildingType))||new Set(b.map(r=>r.buildingType)).size!==b.length||!b.some(r=>r.buildingType==='装备厂'))return bad();
  if(!e.every(r=>own(r,'id')&&id(r.id)&&own(r,'type')&&['武器','防具','饰品'].includes(r.type))||new Set(e.map(r=>r.id)).size!==e.length)return bad();
  if(!l.every(r=>own(r,'libId')&&positive(r.libId)&&own(r,'equipId')&&id(r.equipId)&&own(r,'rate')&&positive(r.rate))||new Set(l.map(r=>r.libId+':'+r.equipId)).size!==l.length)return bad();
  if(!m.every(r=>own(r,'makeId')&&positive(r.makeId)&&own(r,'libId')&&positive(r.libId)&&own(r,'type')&&['武器','防具','饰品'].includes(r.type)&&own(r,'season')&&positive(r.season)&&own(r,'seconds')&&positive(r.seconds))||new Set(m.map(r=>r.makeId)).size!==m.length)return bad();
  const recipes=[];
  for(const r of m){
    if(!own(r,'costItem')||!dense(r.costItem)||!r.costItem.length||!r.costItem.every(pair=>dense(pair)&&pair.length===2&&id(pair[0])&&safeResourceQuantity(pair[1])!==null))return bad();
    const entries=l.filter(v=>v.libId===r.libId),equipIds=entries.map(v=>v.equipId).sort();
    if(!entries.length||entries.some(v=>e.find(x=>x.id===v.equipId)?.type!==r.type))return bad();
    let costs;try{costs=resourceCosts(r.costItem);}catch{return bad();}
    recipes.push({makeId:r.makeId,type:r.type,season:r.season,seconds:r.seconds,equipIds,costs});
  }
  return {reliable:true,recipes:recipes.sort((a,b)=>a.makeId-b.makeId),types:b.map(r=>r.buildingType).sort((a,b)=>b.length-a.length)};
}
export function parseForgeQueue(raw){
  if(!object(raw)||!['makeId','finishTime','equipId','star'].every(k=>own(raw,k))||!uint(raw.makeId)||!uint(raw.finishTime)||typeof raw.equipId!=='string'||!uint(raw.star))return null;
  if(raw.makeId===0&&raw.finishTime===0&&raw.equipId===''&&raw.star===0)return {state:'IDLE',makeId:0,finishTime:0,equipId:'',star:0};
  return positive(raw.makeId)&&positive(raw.finishTime)&&id(raw.equipId)?{state:'MAKING',makeId:raw.makeId,finishTime:raw.finishTime,equipId:raw.equipId,star:raw.star}:null;
}
export function parseForgeEquipment(raw){
  if(!object(raw)||!['uid','equipId','level','star','refineLv','attr','rerollAttrs'].every(k=>own(raw,k))||exactPositive(raw.uid)===null||!id(raw.equipId)||!uint(raw.level)||!uint(raw.star)||!uint(raw.refineLv)||!dense(raw.attr)||!dense(raw.rerollAttrs))return null;
  const attributes=[...raw.attr,...raw.rerollAttrs];if(!attributes.every(v=>own(v,'attr')&&uint(v.attr)&&own(v,'value')&&typeof v.value==='number'&&Number.isFinite(v.value)&&(!Number.isInteger(v.value)||Number.isSafeInteger(v.value))&&(!own(v,'rating')||uint(v.rating))))return null;
  const result=toSnapshotJson(raw);result.uid=exactPositive(raw.uid);return validSnapshot(result)?result:null;
}
export function parseEquipmentOwnership(equips,heroResponse){
  if(!own(equips,'equip')||!dense(equips.equip)||!own(heroResponse,'heroes')||!dense(heroResponse.heroes))return null;
  // v76 /subpackages/main/game.js (SHA256 a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54),
  // EquipModel.ts:1077 setData/fixupEquip/allIdleEquip: Equips is the whole pool;
  // AllHero equips are owned mirrors. Every mirror must match its complete pool instance.
  const pool=equips.equip.map(parseForgeEquipment),heroes=[],byUid=new Map(),owners=new Set();
  for(const row of pool){if(!row||byUid.has(row.uid))return null;byUid.set(row.uid,row);}
  for(const raw of heroResponse.heroes){
    const hero=parseOperationHero(raw);if(!hero||!own(raw,'equips')||!dense(raw.equips))return null;
    const worn=raw.equips.map(parseForgeEquipment);
    for(const row of worn){if(!row||owners.has(row.uid)||!byUid.has(row.uid)||!same(row,byUid.get(row.uid)))return null;owners.add(row.uid);}
    hero.raw.equips=worn.sort((a,b)=>a.uid.localeCompare(b.uid));heroes.push(hero.raw);
  }
  if(new Set(heroes.map(v=>v.heroId)).size!==heroes.length)return null;
  pool.sort((a,b)=>a.uid.localeCompare(b.uid));
  return {pool,bag:pool.filter(row=>!owners.has(row.uid)),heroes:heroes.sort((a,b)=>a.heroId.localeCompare(b.heroId)),uids:[...byUid.keys()].sort()};
}
function parseBuildings(water,config){
  if(!own(water,'building')||!dense(water.building)||!water.building.every(r=>own(r,'buildingId')&&id(r.buildingId)&&own(r,'level')&&uint(r.level))||new Set(water.building.map(r=>r.buildingId)).size!==water.building.length)return null;
  const raw=toSnapshotJson(water.building);if(!validSnapshot(raw))return null;
  const resolve=makeTypeResolver(config);
  return raw.map(r=>({buildingId:r.buildingId,type:resolve(r.buildingId),raw:r,queue:own(r,'equipMaking')?parseForgeQueue(r.equipMaking):null})).sort((a,b)=>a.buildingId.localeCompare(b.buildingId));
}
function contextOf(client,player,parameters={}){
  const ids=['id','playerId'].filter(k=>own(player,k)).map(k=>exactPositive(player[k])),worldId=own(player,'worldId')?exactPositive(player.worldId):null;
  return {accountId:id(client.factContext?.accountId)?client.factContext.accountId:null,generation:Number.isSafeInteger(client.factContext?.generation)&&client.factContext.generation>=0?client.factContext.generation:null,
    playerId:ids.length&&ids.every(v=>v!==null&&v===ids[0])?ids[0]:null,worldId,...(parameters.action==='stop-auto'?{connectionId:id(client.factContext?.connectionId)?client.factContext.connectionId:null}:{})};
}
const seasonOf=worldId=>{const season=seasonFromWorldId(worldId);return positive(season)?season:null;};
export async function surveyEquipmentForge(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validateForgeParameters(parameters);const options={config,player,signal,stop,timeout},active=()=>assertExecutionActive(client,options),context=contextOf(client,player,parameters),sourceAt=Date.now(),notes=[];
  active();
  const read=async(request,response)=>{active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return null;}try{return await awaitExecution(client.request(request,{},response,timeout,{signal}),client,options);}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return null;}};
  // Query the existing private connection tracker before collecting the business snapshot.
  // Public reader overrides and unattested DTOs never establish write eligibility.
  if(parameters.action==='stop-auto')await read('MonthCardRequest','MonthCardResponse');
  const autoWorkSourceBefore=parameters.action==='stop-auto'?autoWorkSourceOf(client,context):null;
  const captured=new Map();
  const observedClient=new Proxy(client,{get(target,key){if(key!=='request'){const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}return async(...args)=>{const v=await target.request(...args);captured.set(args[0],v);return v;};}});
  const [core,equips,heroes]=await Promise.all([
    surveyCityOperations(observedClient,protocol,options).catch(error=>{if(executionOutcome(error)==='CANCELLED')throw error;notes.push('CITY_SOURCE_UNKNOWN');return null;}),
    read('EquipsRequest','EquipsResponse'),read('AllHeroRequest','AllHeroResponse'),
  ]);active();if(!same(context,contextOf(client,player,parameters)))throw Object.assign(new Error('装备制造采集期间账号或代次改变'),{code:'CANCELLED'});
  const inputs={water:core?.rawOnWater??null,items:core?.rawAllItem??null,resources:core?.rawAllResource??null,equips:toSnapshotJson(equips??null),heroes:toSnapshotJson(heroes??null)};
  const cat=catalog(config),rawBuildings=cat.reliable?parseBuildings(captured.get('OnWaterRequest'),config):null,rawOwnership=parseEquipmentOwnership(equips,heroes),rawInventory=parseOperationInventory(captured.get('AllItemRequest'),captured.get('AllResourceRequest'));
  const buildings=rawBuildings===null?null:parseBuildings(inputs.water,config),ownership=rawOwnership===null?null:parseEquipmentOwnership(inputs.equips,inputs.heroes),inventory=rawInventory.stockReliable?parseOperationInventory(inputs.items,inputs.resources):rawInventory,time=readGameTime(client);
  const observed={accountId:context.accountId,generation:context.generation,sourceAt,scope:{kind:'ACCOUNT'}};
  const sourceFacts=Object.fromEntries([['water','OnWaterResponse',buildings!==null],['inventory','AllItemResponse+AllResourceResponse',inventory.stockReliable],['ownership','EquipsResponse+AllHeroResponse',ownership!==null]].map(([key,src,reliable])=>[key,createStateFact(key==='water'?inputs.water:key==='inventory'?{items:inputs.items,resources:inputs.resources}:{equips:inputs.equips,heroes:inputs.heroes},{...observed,source:src,reliable})]));
  const autoWorkSourceAfter=parameters.action==='stop-auto'?autoWorkSourceOf(client,context):null;
  const facts={module:'equipment-forge',parameters,identityContext:context,season:seasonOf(context.worldId),catalog:cat,buildings,ownership,...inventory,inputs,sourceFacts,...time,
    available:Object.keys(protocol??{}),notes,evidence:FORGE_EVIDENCE,state:{context,buildings,ownership},...(parameters.action==='stop-auto'?{autoWorkSource:same(autoWorkSourceBefore,autoWorkSourceAfter)?autoWorkSourceAfter:null}:{})};
  if(parameters.action==='stop-auto')liveAutoFacts.set(facts,{client,player,digest:factDigest(facts)});
  return facts;
}
function authority(f,config){
  if(f?.parameters?.action==='stop-auto'){
    const live=liveAutoFacts.get(f);
    if(!live||live.client.connected!==true||live.digest!==factDigest(f)||!same(contextOf(live.client,live.player,f.parameters),f.identityContext)||!f.autoWorkSource||!same(cardIdentity(f.autoWorkSource),cardIdentity(autoWorkSourceOf(live.client,f.identityContext))))return false;
  }
  const c=f?.identityContext;if(!id(c?.accountId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||f.season!==seasonOf(c.worldId)||!f.catalog?.reliable||!same(f.catalog,catalog(config)))return false;
  const fresh=(key,source)=>f.sourceFacts?.[key]?.provenance?.source===source&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope:{kind:'ACCOUNT'}}).status==='FRESH';
  const inputs=f.inputs,stock=parseOperationInventory(inputs?.items,inputs?.resources),ownership=parseEquipmentOwnership(inputs?.equips,inputs?.heroes),buildings=parseBuildings(inputs?.water,config);
  return fresh('water','OnWaterResponse')&&fresh('inventory','AllItemResponse+AllResourceResponse')&&fresh('ownership','EquipsResponse+AllHeroResponse')
    &&same(f.sourceFacts.water.value,inputs.water)&&same(f.sourceFacts.inventory.value,{items:inputs.items,resources:inputs.resources})&&same(f.sourceFacts.ownership.value,{equips:inputs.equips,heroes:inputs.heroes})
    &&stock.stockReliable===true&&f.stockReliable===true&&f.stock instanceof Map&&same([...stock.stock],[...f.stock])&&ownership!==null&&same(ownership,f.ownership)&&buildings!==null&&same(buildings,f.buildings);
}
function clock(f){const t=gameTimeBounds(f),c=f?.identityContext,g=f?.gameTime;return own(f,'gameTime')&&g?.accountId===c?.accountId&&g?.generation===c?.generation?t:{now:null,earliest:null,latest:null};}
function baseBuilding(b){return b&&own(b.raw,'buildStartTime')&&own(b.raw,'buildFinishTime')&&uint(b.raw.buildStartTime)&&b.raw.buildFinishTime===0&&positive(b.raw.level);}
// Reuse the original month-card row/context validator, fed only by GameClient's
// private live tracker. Source timestamps remain evidence, never a changing target ID.
function autoWorkSourceOf(client,context){
  try{
    const value=observePirateMonthCards({factContext:client.factContext,readMonthCards:()=>GameClient.prototype.readMonthCards.call(client)},context);
    if(value.status!=='OBSERVED'||value.playerId!==context.playerId||value.worldId!==context.worldId)return null;
    const {observedAt,...source}=value;return source;
  }catch{return null;}
}
function cardIdentity(value){if(!value)return null;const {sourceAt,observedAt,...identity}=value;return identity;}
function currentAutoClock(f){
  const live=liveAutoFacts.get(f);if(!live)return null;
  const current=readGameTime(live.client),bounds=clock({...current,identityContext:f.identityContext});
  return current.gameTime?.source==='PingResponse.serverTimestamp'&&bounds.latest!==null?bounds:null;
}
function stopAutoPreparation(f,config,buildingId){
  if(f?.parameters?.action!=='stop-auto'||!authority(f,config))return null;
  const b=f.buildings.find(row=>row.buildingId===buildingId),t=currentAutoClock(f),rows=config?.tables?.MonthCardCfg?.data,cards=f.autoWorkSource?.cards;
  if(!t||!dense(rows)||rows.length!==2||!['普通月卡','高级月卡'].every(name=>rows.filter(row=>row.id===name).length===1)||!dense(cards))return null;
  let total=0;
  for(const card of cards){
    const row=rows.find(row=>row.id===(card.type===1?'普通月卡':'高级月卡')),pairs=row?.effectList;
    if(!dense(pairs)||!pairs.every(pair=>dense(pair)&&pair.length===2&&id(pair[0])&&typeof pair[1]==='number'&&Number.isFinite(pair[1])))return null;
    const effects=pairs.filter(pair=>pair[0]==='装备工厂自动锻造');
    if(!effects.every(pair=>uint(pair[1])))return null;
    // MonthCardModel sums matching effects only while endTime > serverTime,
    // except -1 (permanent). Uncertainty crossing expiry cannot grant a permit.
    if(card.endTime!==-1&&card.endTime<=t.latest)continue;
    total+=effects.reduce((sum,pair)=>sum+pair[1],0);
  }
  if(!uint(total)||total<=0||b?.type!=='装备厂'||!baseBuilding(b)||!own(b.raw,'auto')||b.raw.auto!==true||!b.queue||b.queue.state==='MAKING'&&b.queue.finishTime<=t.latest)return null;
  return {action:'stop-auto',buildingId:b.buildingId,expectedStopHash:hash({context:f.identityContext,buildings:f.buildings,ownership:f.ownership,cards:cardIdentity(f.autoWorkSource),dependencies:forgeDependencyVersions({config,parameters:{action:'stop-auto'}})})};
}
function stopAutoCandidate(f,p,{config,moduleConfig=FORGE_DEFAULT_CONFIG}={}){
  const preparation=stopAutoPreparation(f,config,p.buildingId),b=f?.buildings?.find(row=>row.buildingId===p.buildingId),action={request:'SetBuildingAutoWorkRequest',response:null,body:{buildingId:p.buildingId,isOn:false}},costs=[];
  let reason=null;
  if(!p.buildingId||!p.expectedStopHash)reason='EXPLICIT_CURRENT_FORGE_AUTO_WORK_REQUIRED';
  else if(!moduleConfig.enabled)reason='FORGE_MODULE_DISABLED';
  else if(!preparation||!same(preparation,p))reason='FORGE_AUTO_WORK_ENTITLEMENT_OR_STATE_UNKNOWN';
  else if(!f.available.includes(action.request)||f.available.includes('SetBuildingAutoWorkResponse'))reason='PROTOCOL_UNAVAILABLE';
  else try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}
  const target={buildingId:p.buildingId??null,expectedStopHash:p.expectedStopHash??null};
  return {module:'equipment-forge',actionId:'equipment-forge:STOP-AUTO:'+hash(target),actionType:'STOP-AUTO',parameters:p,target,identity:preparation?hash(preparation):null,
    configEvidence:Object.fromEntries(dependencyTables(p).map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState:b?copy(b.raw):null,expectedState:b?{...copy(b.raw),auto:false}:null,costs,costSource:FORGE_STOP_AUTO_EVIDENCE.source,
    budgetClaims:{resources:[],quotas:[],uids:p.buildingId?[{type:'forge-auto-work',id:p.buildingId}]:[]},executable:reason===null,blockedReason:reason,label:'停止装备厂自动锻造 '+(p.buildingId??''),...(reason===null?{action}:{})};
}
const allowedQueue=(q,r)=>q?.state==='MAKING'&&r?.makeId===q.makeId&&r.equipIds.includes(q.equipId);
const requestFor=(action,buildingId,makeId)=>action==='make'?{request:'MakeEquipRequest',response:null,body:{buildingId,makeId,universal:false}}:{request:'PickMadeEquipRequest',response:'PickMadeEquipResponse',body:{buildingId}};
function candidate(f,p,{config,moduleConfig=FORGE_DEFAULT_CONFIG}={}){
  p=validateForgeParameters(p);moduleConfig=validateForgeConfig(moduleConfig);if(p.action==='stop-auto')return stopAutoCandidate(f,p,{config,moduleConfig});const b=f?.buildings?.find(v=>v.buildingId===p.buildingId),r=f?.catalog?.recipes?.find(v=>v.makeId===(p.action==='make'?p.makeId:b?.queue?.makeId)),t=clock(f);
  let reason=null;const costs=p.action==='make'&&r?copy(r.costs):[],request=requestFor(p.action,p.buildingId,p.makeId);
  if(!p.buildingId||!p.action||p.action==='make'&&!p.makeId)reason='EXPLICIT_BUILDING_AND_SINGLE_ACTION_REQUIRED';
  else if(!moduleConfig.enabled)reason='FORGE_MODULE_DISABLED';
  else if(!authority(f,config))reason='FORGE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(b?.type!=='装备厂'||!baseBuilding(b))reason='FORGE_BUILDING_UNAVAILABLE';
  else if(!b.queue)reason='QUEUE_IDLE_BLOCKED_EVIDENCE';
  else if(own(p,'expectedQueue')&&!same(p.expectedQueue,{makeId:b.queue.makeId,finishTime:b.queue.finishTime,equipId:b.queue.equipId,star:b.queue.star}))reason='PREPARED_QUEUE_CHANGED';
  else if(own(p,'expectedEquipmentCounts')&&!same(equipmentCounts(f,config).counts,p.expectedEquipmentCounts))reason='PREPARED_EQUIPMENT_COUNTS_CHANGED';
  else if(t.earliest===null)reason='TRUSTED_GAME_CLOCK_UNKNOWN';
  else if(p.allowUniversal===true)reason='UNIVERSAL_EXCHANGE_BLOCKED_EVIDENCE';
  else if(!r)reason='RECIPE_OR_RESULT_LIBRARY_UNKNOWN';
  else if(f.season===null||f.season<r.season)reason='RECIPE_SEASON_UNAVAILABLE';
  else if(p.action==='make'&&b.queue.state!=='IDLE')reason='FORGE_QUEUE_NOT_IDLE';
  else if(p.action==='pick'&&!allowedQueue(b.queue,r))reason='FORGE_BATCH_IDENTITY_UNKNOWN';
  else if(p.action==='pick'&&b.queue.finishTime>t.earliest)reason='FORGE_NOT_RELIABLY_COMPLETE';
  else if(!f.available?.includes(request.request)||request.response&&!f.available?.includes(request.response))reason='PROTOCOL_UNAVAILABLE';
  else if(costs.some(v=>(f.stock.get(v.id)??0)<v.num))reason='MATERIAL_STOCK_INSUFFICIENT';
  else {try{assertPaymentAllowed({...request,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={buildingId:p.buildingId??null,...(p.action==='make'?{makeId:p.makeId??null}:{})},beforeState=b?copy(b.raw):null;
  const expectedState=p.action==='make'&&r?{queueCreated:true,makeId:r.makeId,equipIds:copy(r.equipIds),costs:copy(costs)}:p.action==='pick'&&b?.queue?{queueCleared:true,newEquipId:b.queue.equipId,newEquipStar:b.queue.star,oneNewUid:true}:null;
  return {module:'equipment-forge',actionId:'equipment-forge:'+String(p.action).toUpperCase()+':'+hash({target,parameters:p}),actionType:p.action?.toUpperCase()??'FORGE',parameters:p,target,
    identity:b?hash({context:f.identityContext,season:f.season,buildings:f.buildings,ownership:f.ownership,dependencies:forgeDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence:Object.fromEntries(tableNames.map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState,expectedState,costs,costSource:source,executable:reason===null,blockedReason:reason,label:'装备厂 '+(p.buildingId??'')+' '+(p.action??''),...(reason===null?{action:request}:{})};
}
export function viewEquipmentForge(f,{config,moduleConfig=FORGE_DEFAULT_CONFIG,parameters=f?.parameters??{}}={}){
  parameters=validateForgeParameters(parameters);moduleConfig=validateForgeConfig(moduleConfig);const choices=[];
  for(const b of f?.buildings??[]){if(b.type!=='装备厂'||parameters.buildingId&&parameters.buildingId!==b.buildingId)continue;
    if(!parameters.action||parameters.action==='pick')choices.push({buildingId:b.buildingId,action:'pick',...(own(parameters,'expectedQueue')?{expectedQueue:parameters.expectedQueue}:{}),...(own(parameters,'expectedEquipmentCounts')?{expectedEquipmentCounts:parameters.expectedEquipmentCounts}:{})});
    if(!parameters.action||parameters.action==='make')for(const r of f?.catalog?.recipes??[])if(!parameters.makeId||parameters.makeId===r.makeId)choices.push({buildingId:b.buildingId,action:'make',makeId:r.makeId,allowUniversal:parameters.allowUniversal??false,...(own(parameters,'expectedQueue')?{expectedQueue:parameters.expectedQueue}:{}),...(own(parameters,'expectedEquipmentCounts')?{expectedEquipmentCounts:parameters.expectedEquipmentCounts}:{})});
  }
  if(parameters.action==='stop-auto')choices.push(parameters);
  if(!choices.length)choices.push(parameters);const candidates=choices.map(p=>candidate(f,p,{config,moduleConfig}));
  return {module:'equipment-forge',forges:(f?.buildings??[]).filter(b=>b.type==='装备厂').map(b=>({buildingId:b.buildingId,queue:copy(b.queue),level:b.raw.level})),recipes:copy(f?.catalog?.recipes??[]),bag:copy(f?.ownership?.bag??[]),season:f?.season??null,...(parameters.action==='stop-auto'?{mode:'stop-auto',stopAutoPreparation:(f?.buildings??[]).filter(b=>b.type==='装备厂'&&(!parameters.buildingId||parameters.buildingId===b.buildingId)).map(b=>stopAutoPreparation(f,config,b.buildingId)).filter(Boolean)}:{}),preparation:{...equipmentCounts(f,config),recipes:preparationRecipes(f,config)},candidates,blocked:candidates.filter(v=>!v.executable),notes:[...(f?.notes??[])],evidence:FORGE_EVIDENCE};
}
export function planEquipmentForge(f,{config,moduleConfig=FORGE_DEFAULT_CONFIG,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null)}={}){
  if(selections!==undefined&&(!dense(selections)||selections.some(v=>!id(v))||new Set(selections).size!==selections.length))throw invalid('selections 必须为唯一 actionId 数组');
  const row=candidate(f,parameters,{config,moduleConfig});if(row.executable&&(selections===undefined||selections.includes(row.actionId))&&ledger.reserve(row.costs))return {module:'equipment-forge',actions:[row],notes:[]};
  return {module:'equipment-forge',actions:[],notes:[row.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
const withoutQueue=b=>Object.fromEntries(Object.entries(b.raw).filter(([k])=>k!=='equipMaking'));
export function verifyEquipmentForge(op,b,a,response){
  const fail=reason=>({confirmed:false,reason});let p,costs;try{p=validateForgeParameters(op?.parameters);costs=resourceCosts(op?.costs);}catch{return fail('OPERATION_CONTRACT_INVALID');}
  // Exact immutable config evidence is bound by identity; the shared executor
  // separately reconstructs this operation with current dependency versions.
  const cfg={tables:Object.fromEntries(dependencyTables(p).map(n=>[n,op?.configEvidence?.[n]??null]))};
  if(!authority(b,cfg)||!authority(a,cfg)||!same(b.identityContext,a.identityContext)||b.season!==a.season)return fail('FORGE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  const before=b.buildings.find(v=>v.buildingId===p.buildingId),after=a.buildings.find(v=>v.buildingId===p.buildingId),recipe=b.catalog.recipes.find(v=>v.makeId===(p.action==='make'?p.makeId:before?.queue?.makeId));
  const contract=candidate(b,p,{config:cfg,moduleConfig:{enabled:true}});
  if(op?.module!=='equipment-forge'||!contract.executable||!before||!after||!same(op.target,contract.target)||op.actionType!==contract.actionType||op.costSource!==contract.costSource||!same(op.action,contract.action)||!same(op.beforeState,contract.beforeState)||!same(op.expectedState,contract.expectedState)||!same(costs,contract.costs)||op.identity!==contract.identity)return fail('FORGE_PLAN_OR_BATCH_MISMATCH');
  if(p.action==='stop-auto'){
    if(clock(a).earliest===null||clock(a).now<clock(b).now)return fail('TRUSTED_GAME_CLOCK_UNKNOWN');
    if(before.raw.auto!==true||!own(after.raw,'auto')||after.raw.auto!==false||!same({...before.raw,auto:false},after.raw)||!same(b.buildings.filter(v=>v!==before),a.buildings.filter(v=>v!==after))||!same(b.ownership,a.ownership)||!stockMatchesDelta(b.stock,a.stock,[],[]))return fail('FORGE_AUTO_WORK_EXACT_STOP_NOT_CONFIRMED');
    return {confirmed:true,reason:'原月卡资格、完整权威复读确认仅停止当前装备厂自动锻造；队列、全部装备和库存保持',afterState:copy(after.raw)};
  }
  if(!same(withoutQueue(before),withoutQueue(after))||!same(b.buildings.filter(v=>v!==before),a.buildings.filter(v=>v!==after)))return fail('NON_TARGET_BUILDING_CHANGED');
  if(!same(b.ownership.heroes,a.ownership.heroes)||!stockMatchesDelta(b.stock,a.stock,costs,[]))return fail('OWNERSHIP_OR_EXACT_INVENTORY_CHANGED');
  if(clock(a).earliest===null||clock(a).now<clock(b).now)return fail('TRUSTED_GAME_CLOCK_UNKNOWN');
  if(p.action==='make'){
    if(before.queue?.state!=='IDLE'||!allowedQueue(after.queue,recipe)||after.queue.finishTime<clock(b).earliest||!same(b.ownership,a.ownership))return fail('EXACT_NEW_FORGE_QUEUE_NOT_CONFIRMED');
    return {confirmed:true,reason:'新 OnWater 完整队列确认单次制造及精确成本；等待新授权收取',afterState:copy(after.raw)};
  }
  if(!allowedQueue(before.queue,recipe)||before.queue.finishTime>clock(b).earliest||!own(response,'equipId')||response.equipId!==before.queue.equipId)return fail('PICK_RESPONSE_OR_ORIGINAL_BATCH_MISMATCH');
  if(!own(after.raw,'equipMaking')||after.queue?.state!=='IDLE')return fail('FORGE_QUEUE_CLEAR_NOT_CONFIRMED');
  const previous=new Set(b.ownership.uids),fresh=a.ownership.pool.filter(v=>!previous.has(v.uid));
  if(fresh.length!==1||fresh[0].equipId!==before.queue.equipId||fresh[0].star!==before.queue.star||!a.ownership.bag.some(v=>v.uid===fresh[0].uid)
    ||!same(b.ownership.pool,a.ownership.pool.filter(v=>v.uid!==fresh[0].uid))||!same(b.ownership.bag,a.ownership.bag.filter(v=>v.uid!==fresh[0].uid)))return fail('EXACT_ONE_NEW_EQUIPMENT_UID_NOT_CONFIRMED');
  return {confirmed:true,reason:'原精确批次、typed equipId、新唯一UID及完整权威复读共同确认收取',afterState:copy(after.raw),responseEvidence:{equipId:response.equipId,uid:fresh[0].uid,star:fresh[0].star}};
}

const equipmentTypes=Object.freeze(['武器','防具','饰品']);
const validCounts=value=>fields(value,equipmentTypes)&&equipmentTypes.every(type=>own(value,type)&&uint(value[type]));
function equipmentCounts(f,config){
  const bad=reason=>({reliable:false,counts:null,order:[],reason});
  if(!authority(f,config))return bad('FORGE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  const counts=Object.fromEntries(equipmentTypes.map(type=>[type,0])),equips=config.tables.EquipCfg.data;
  for(const row of f.ownership.bag){const type=equips.find(e=>e.id===row.equipId)?.type;if(!equipmentTypes.includes(type))return bad('OWNED_EQUIPMENT_TYPE_UNKNOWN');counts[type]++;}
  for(const b of f.buildings.filter(row=>row.type==='装备厂')){
    if(!b.queue)return bad('QUEUE_IDLE_BLOCKED_EVIDENCE');
    if(b.queue.state==='IDLE')continue;
    const recipe=f.catalog.recipes.find(row=>row.makeId===b.queue.makeId);
    if(!allowedQueue(b.queue,recipe))return bad('FORGE_BATCH_IDENTITY_UNKNOWN');counts[recipe.type]++;
  }
  return {reliable:true,counts,order:[...equipmentTypes].sort((a,b)=>counts[a]-counts[b]||equipmentTypes.indexOf(a)-equipmentTypes.indexOf(b)),reason:null};
}
function preparationRecipes(f,config){
  return (f?.catalog?.recipes??[]).map(recipe=>{
    const outputs=recipe.equipIds.map(equipId=>config?.tables?.EquipCfg?.data?.find(row=>row.id===equipId)),first=outputs[0];
    const reliable=outputs.length>0&&outputs.every(row=>own(row,'qualityIndex')&&uint(row.qualityIndex)&&own(row,'qualityName')&&id(row.qualityName)&&row.qualityIndex===first.qualityIndex&&row.qualityName===first.qualityName);
    return {...copy(recipe),qualityIndex:reliable?first.qualityIndex:null,qualityName:reliable?first.qualityName:null,qualityReliable:reliable};
  });
}
function validateForgeBatchPreparation(v){
  if(!fields(v,['action','targets','expectedEquipmentCounts','maxDurationMs'])||Reflect.ownKeys(v).length!==4||!['make','pick'].includes(v.action)||!dense(v.targets)||Object.getPrototypeOf(v.targets)!==Array.prototype||v.targets.length<1||v.targets.length>24||Reflect.ownKeys(v.targets).length!==v.targets.length+1||!Array.from({length:v.targets.length},(_,i)=>own(Object.getOwnPropertyDescriptor(v.targets,String(i)),'value')).every(Boolean)||!validCounts(v.expectedEquipmentCounts)||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('制造/收取组合须明确1至24个不同装备厂、完整部位数量及有限时长');
  const targets=v.targets.map(row=>{
    const keys=['buildingId','expectedQueue',...(v.action==='make'?['makeId']:[])];
    if(!fields(row,keys)||Reflect.ownKeys(row).length!==keys.length)throw invalid('每厂须明确原建筑、队列及制造配方（仅制造模式）');
    const p=validateForgeParameters({...row,action:v.action});if(!p.buildingId||!p.expectedQueue)throw invalid('目标缺少明确建筑或原批次');return {buildingId:p.buildingId,expectedQueue:p.expectedQueue,...(v.action==='make'?{makeId:p.makeId}:{})};
  });if(new Set(targets.map(row=>row.buildingId)).size!==targets.length)throw invalid('同一装备厂每组合仅操作一次');
  return {action:v.action,targets,expectedEquipmentCounts:copy(v.expectedEquipmentCounts),maxDurationMs:v.maxDurationMs};
}
function prepareEquipmentForgeBatch(f,{config,moduleConfig,...input}){
  const payload=validateForgeBatchPreparation(input),counted=equipmentCounts(f,config),ledger=new ResourceLedger(f?.stockReliable?f.stock:null),nodes=[{id:'start',type:'START'}];
  if(!counted.reliable||!same(counted.counts,payload.expectedEquipmentCounts))throw invalid('装备完整部位数量或原来源变化，须重新调查');
  const counts=copy(payload.expectedEquipmentCounts),making=payload.action==='make';
  const steps=payload.targets.map((target,i)=>{
    const current={buildingId:target.buildingId,action:payload.action,expectedQueue:copy(target.expectedQueue),expectedEquipmentCounts:copy(payload.expectedEquipmentCounts),...(making?{makeId:target.makeId,allowUniversal:false}:{})},selection={unique:true},plan=planEquipmentForge(f,{config,moduleConfig,parameters:current,ledger});
    if(plan.actions.length!==1)throw invalid('所选厂当前队列/资格或累计初始材料不满足原合同：'+(plan.notes[0]??'UNKNOWN'));
    const row=plan.actions[0],parameters={...current,expectedEquipmentCounts:copy(counts)};
    if(!making&&row.costs.length!==0)throw invalid('原装备收取不得增加成本');
    nodes.push({id:payload.action+'-'+i,type:'ACTION',module:'equipment-forge',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'equipment-forge'});
    // The original verified MAKE creates exactly one queue of the recipe's proven type.
    // No hypothetical future queue, result UID or finish time is added to the facts.
    if(making){const type=f.catalog.recipes.find(recipe=>recipe.makeId===target.makeId)?.type;if(!equipmentTypes.includes(type)||!uint(counts[type]+1))throw invalid('制造部位数量来源无效或溢出');counts[type]++;}
    return {parameters,selection,target:copy(row.target),costs:copy(row.costs)};
  });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:[]};
  return {...payload,steps,budget,graph:{version:1,id:'forge-'+payload.action+'-'+hash(payload).slice(0,20),name:making?'明确多个空闲装备厂逐厂单份制造':'明确多个成熟装备厂逐厂收取',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:payload.maxDurationMs,maxActions:steps.length,modules:['equipment-forge']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'明确不同厂的同一种原制造/收取动作，每厂一次；制造仅原空闲队列、自有普通材料和明确配方，不使用通用材料，固定初始材料父预算。部位数量沿原闲置背包＋在产队列：制造在原验证确认一个指定部位队列后才递增后项守卫，收取只转入背包。逐厂重新调查、单次授权及原队列/typed收取产物/新唯一UID/完整库存及其他建筑英雄不变验证；变化、拒绝或UNKNOWN停止。不等待未来成熟、不推测随机产物或时长、不预支收入、不重放，重启只读。'};
}

export function validateForgePreparation(value){
  if(['make','pick'].includes(Object.getOwnPropertyDescriptor(value??{},'action')?.value))return validateForgeBatchPreparation(value);
  if(!fields(value,['buildingId','makeIds','maxDurationMs'])||!own(value,'buildingId')||!id(value.buildingId)||!own(value,'makeIds')||!dense(value.makeIds)||Object.getPrototypeOf(value.makeIds)!==Array.prototype||value.makeIds.length<1||value.makeIds.length>50||Reflect.ownKeys(value.makeIds).length!==value.makeIds.length+1||!Array.from({length:value.makeIds.length},(_,i)=>own(Object.getOwnPropertyDescriptor(value.makeIds,String(i)),'value')).every(Boolean)||!value.makeIds.every(positive)||new Set(value.makeIds).size!==value.makeIds.length||!own(value,'maxDurationMs')||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('准备须明确装备厂、1至50个不同允许配方和1至86400000毫秒总时长');
  return {buildingId:value.buildingId,makeIds:[...value.makeIds],maxDurationMs:value.maxDurationMs};
}
export function prepareEquipmentForgeWorkflow(f,{config,moduleConfig=FORGE_DEFAULT_CONFIG,...input}={}){
  if(['make','pick'].includes(Object.getOwnPropertyDescriptor(input,'action')?.value))return prepareEquipmentForgeBatch(f,{config,moduleConfig,...input});
  const payload=validateForgePreparation(input),counted=equipmentCounts(f,config),b=f?.buildings?.find(row=>row.buildingId===payload.buildingId);
  if(!validateForgeConfig(moduleConfig).enabled||!counted.reliable||b?.type!=='装备厂'||!baseBuilding(b)||!b.queue||clock(f).earliest===null||f.season===null)throw invalid('准备缺少完整部位数量、装备厂、开启配置、赛季或可信时钟');
  const recipes=preparationRecipes(f,config),allowed=payload.makeIds.map(makeId=>recipes.find(row=>row.makeId===makeId));
  if(allowed.some(row=>!row?.qualityReliable))throw invalid('允许配方缺少明确产物或同一品质依据');
  const candidates=allowed.sort((a,b)=>counted.order.indexOf(a.type)-counted.order.indexOf(b.type)||b.qualityIndex-a.qualityIndex||a.makeId-b.makeId).map(row=>{
    let reason=null;if(row.season>f.season)reason='RECIPE_SEASON_UNAVAILABLE';
    else if(!new ResourceLedger(f.stock).reserve(row.costs))reason='MATERIAL_STOCK_INSUFFICIENT';
    else try{assertPaymentAllowed({...requestFor('make',b.buildingId,row.makeId),costs:row.costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}
    return {...row,blockedReason:reason};
  }),selected=candidates.find(row=>row.blockedReason===null);
  if(!selected||!f.available?.includes('MakeEquipRequest'))throw invalid('允许配方均不能按自有材料与D6成本制造，或制造协议不可用');
  const {state,...expectedQueue}=b.queue,guards={expectedEquipmentCounts:counted.counts},nodes=[{id:'start',type:'START'}];
  if(state==='MAKING'){
    const parameters={buildingId:b.buildingId,action:'pick',...guards,expectedQueue};
    if(!planEquipmentForge(f,{config,moduleConfig,parameters}).actions.length)throw invalid('原精确批次尚不能完整确认收取；不准备后续制造');
    nodes.push({id:'pick',type:'ACTION',module:'equipment-forge',parameters,selection:{unique:true}},{id:'verify-pick',type:'VERIFY',module:'equipment-forge'});
  }
  const parameters={buildingId:b.buildingId,action:'make',makeId:selected.makeId,allowUniversal:false,...guards,expectedQueue:{makeId:0,finishTime:0,equipId:'',star:0}};
  if(state==='IDLE'&&!planEquipmentForge(f,{config,moduleConfig,parameters}).actions.length)throw invalid('当前单次制造不能通过原装备厂合同');
  nodes.push({id:'make',type:'ACTION',module:'equipment-forge',parameters,selection:{unique:true}},{id:'verify-make',type:'VERIFY',module:'equipment-forge'},{id:'stop',type:'STOP'});
  const budget={resources:copy(selected.costs),quotas:[],uids:[]},suffix=hash({payload,counts:counted.counts,queue:expectedQueue,makeId:selected.makeId,budget}).slice(0,20);
  return {buildingId:b.buildingId,makeIds:payload.makeIds,counts:counted.counts,order:counted.order,queue:expectedQueue,selected:copy(selected),candidates,
    graph:{version:1,id:'equipment-forge-'+suffix,name:b.buildingId+' 按部位数量准备单次制造',budget,runPolicy:{maxDurationMs:payload.maxDurationMs,maxActions:state==='MAKING'?2:1,modules:['equipment-forge']},nodes,edges:nodes.slice(1).map((node,index)=>({from:nodes[index].id,to:node.id}))},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,
    limitation:'仅统计完整闲置背包与在产队列，不计佩戴镜像；数量少的部位优先，同量按武器、防具、饰品顺序，在明确允许配方内按品质从高到低选择当前付得起的一份。结果冻结供审核，每步重新探测；原批次或数量变化、拒绝、UNKNOWN即停止且不重放。准备不执行、不授权、不随未来收入扩大预算；通用材料缺证仍冻结。'};
}

export function forgeDependencyVersions({config,moduleConfig=FORGE_DEFAULT_CONFIG,parameters={}}={}){return {moduleConfig:copy(moduleConfig),...Object.fromEntries(dependencyTables(parameters).map(n=>['config.'+n,copy(config?.tables?.[n]??null)]))};}
export const equipmentForgeModule=Object.freeze({id:'equipment-forge',label:'装备制造',capabilities:Object.freeze(['BIZ-R07','BIZ-A07']),defaultConfig:FORGE_DEFAULT_CONFIG,validateConfig:validateForgeConfig,validateParameters:validateForgeParameters,survey:surveyEquipmentForge,view:viewEquipmentForge,plan:planEquipmentForge,verify:verifyEquipmentForge,rejectionIdentity:businessRejectionIdentityFromHistory,dependencyVersions:forgeDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...tableNames.map(n=>'config.'+n),'config.MonthCardCfg'])});