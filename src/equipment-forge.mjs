// Equipment forge semantics only. Shared execution owns permits, transport,
// cancellation, finite budgets and durable UNKNOWN. No automatic quality fallback.
import { createHash } from 'node:crypto';
import { surveyCityOperations } from './city-operations.mjs';
import { makeTypeResolver } from './world.mjs';
import { seasonFromWorldId } from './alliance.mjs';
import { parseOperationHero, parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime, gameTimeBounds } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

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
export const FORGE_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const FORGE_EVIDENCE=Object.freeze({missingQueueMeansIdle:'BLOCKED_EVIDENCE',qualityFallback:'EXCLUDED',universalExchange:'BLOCKED_EVIDENCE',exactDuration:'BLOCKED_EVIDENCE_APPOINTMENT_ADJUSTMENT',outputStar:'SERVER_QUEUE_AUTHORITY_ONLY',realGame:'REAL_UNVERIFIED'});
function fields(v,keys){return object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable);}
export function validateForgeConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('装备制造配置仅允许 enabled 布尔值');return {enabled:v.enabled??false};}
export function validateForgeParameters(v={}){
  if(!fields(v,['buildingId','action','makeId','allowUniversal']))throw invalid('装备制造参数仅允许 buildingId、action、makeId、allowUniversal');
  const out={};
  if(own(v,'buildingId')){if(!id(v.buildingId))throw invalid('buildingId 必须为明确建筑 ID');out.buildingId=v.buildingId;}
  if(own(v,'action')){if(!['make','pick'].includes(v.action))throw invalid('action 仅允许 make 或 pick');out.action=v.action;}
  if(own(v,'makeId')){if(v.action!=='make'||!positive(v.makeId))throw invalid('makeId 仅用于 make，且必须为正 int32');out.makeId=v.makeId;}
  if(own(v,'allowUniversal')&&(v.action!=='make'||typeof v.allowUniversal!=='boolean'))throw invalid('allowUniversal 仅用于 make 且必须为布尔值');
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
function parseOwnership(equips,heroResponse){
  if(!own(equips,'equip')||!dense(equips.equip)||!own(heroResponse,'heroes')||!dense(heroResponse.heroes))return null;
  const bag=equips.equip.map(parseForgeEquipment),heroes=[],seen=new Set();
  for(const row of bag){if(!row||seen.has(row.uid))return null;seen.add(row.uid);}
  for(const raw of heroResponse.heroes){
    const hero=parseOperationHero(raw);if(!hero||!own(raw,'equips')||!dense(raw.equips))return null;
    const worn=raw.equips.map(parseForgeEquipment);for(const row of worn){if(!row||seen.has(row.uid))return null;seen.add(row.uid);}
    hero.raw.equips=worn.sort((a,b)=>a.uid.localeCompare(b.uid));heroes.push(hero.raw);
  }
  if(new Set(heroes.map(v=>v.heroId)).size!==heroes.length)return null;
  return {bag:bag.sort((a,b)=>a.uid.localeCompare(b.uid)),heroes:heroes.sort((a,b)=>a.heroId.localeCompare(b.heroId)),uids:[...seen].sort()};
}
function parseBuildings(water,config){
  if(!own(water,'building')||!dense(water.building)||!water.building.every(r=>own(r,'buildingId')&&id(r.buildingId)&&own(r,'level')&&uint(r.level))||new Set(water.building.map(r=>r.buildingId)).size!==water.building.length)return null;
  const raw=toSnapshotJson(water.building);if(!validSnapshot(raw))return null;
  const resolve=makeTypeResolver(config);
  return raw.map(r=>({buildingId:r.buildingId,type:resolve(r.buildingId),raw:r,queue:own(r,'equipMaking')?parseForgeQueue(r.equipMaking):null})).sort((a,b)=>a.buildingId.localeCompare(b.buildingId));
}
function contextOf(client,player){
  const ids=['id','playerId'].filter(k=>own(player,k)).map(k=>exactPositive(player[k])),worldId=own(player,'worldId')?exactPositive(player.worldId):null;
  return {accountId:id(client.factContext?.accountId)?client.factContext.accountId:null,generation:Number.isSafeInteger(client.factContext?.generation)&&client.factContext.generation>=0?client.factContext.generation:null,
    playerId:ids.length&&ids.every(v=>v!==null&&v===ids[0])?ids[0]:null,worldId};
}
const seasonOf=worldId=>{const season=seasonFromWorldId(worldId);return positive(season)?season:null;};
export async function surveyEquipmentForge(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validateForgeParameters(parameters);const options={config,player,signal,stop,timeout},active=()=>assertExecutionActive(client,options),context=contextOf(client,player),sourceAt=Date.now(),notes=[];
  active();
  const read=async(request,response)=>{active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return null;}try{return await awaitExecution(client.request(request,{},response,timeout,{signal}),client,options);}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return null;}};
  const captured=new Map();
  const observedClient=new Proxy(client,{get(target,key){if(key!=='request'){const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}return async(...args)=>{const v=await target.request(...args);captured.set(args[0],v);return v;};}});
  const [core,equips,heroes]=await Promise.all([
    surveyCityOperations(observedClient,protocol,options).catch(error=>{if(executionOutcome(error)==='CANCELLED')throw error;notes.push('CITY_SOURCE_UNKNOWN');return null;}),
    read('EquipsRequest','EquipsResponse'),read('AllHeroRequest','AllHeroResponse'),
  ]);active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('装备制造采集期间账号或代次改变'),{code:'CANCELLED'});
  const inputs={water:core?.rawOnWater??null,items:core?.rawAllItem??null,resources:core?.rawAllResource??null,equips:toSnapshotJson(equips??null),heroes:toSnapshotJson(heroes??null)};
  const cat=catalog(config),rawBuildings=cat.reliable?parseBuildings(captured.get('OnWaterRequest'),config):null,rawOwnership=parseOwnership(equips,heroes),rawInventory=parseOperationInventory(captured.get('AllItemRequest'),captured.get('AllResourceRequest'));
  const buildings=rawBuildings===null?null:parseBuildings(inputs.water,config),ownership=rawOwnership===null?null:parseOwnership(inputs.equips,inputs.heroes),inventory=rawInventory.stockReliable?parseOperationInventory(inputs.items,inputs.resources):rawInventory,time=readGameTime(client);
  const observed={accountId:context.accountId,generation:context.generation,sourceAt,scope:{kind:'ACCOUNT'}};
  const sourceFacts=Object.fromEntries([['water','OnWaterResponse',buildings!==null],['inventory','AllItemResponse+AllResourceResponse',inventory.stockReliable],['ownership','EquipsResponse+AllHeroResponse',ownership!==null]].map(([key,src,reliable])=>[key,createStateFact(key==='water'?inputs.water:key==='inventory'?{items:inputs.items,resources:inputs.resources}:{equips:inputs.equips,heroes:inputs.heroes},{...observed,source:src,reliable})]));
  return {module:'equipment-forge',parameters,identityContext:context,season:seasonOf(context.worldId),catalog:cat,buildings,ownership,...inventory,inputs,sourceFacts,...time,
    available:Object.keys(protocol??{}),notes,evidence:FORGE_EVIDENCE,state:{context,buildings,ownership}};
}
function authority(f,config){
  const c=f?.identityContext;if(!id(c?.accountId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||f.season!==seasonOf(c.worldId)||!f.catalog?.reliable||!same(f.catalog,catalog(config)))return false;
  const fresh=(key,source)=>f.sourceFacts?.[key]?.provenance?.source===source&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope:{kind:'ACCOUNT'}}).status==='FRESH';
  const inputs=f.inputs,stock=parseOperationInventory(inputs?.items,inputs?.resources),ownership=parseOwnership(inputs?.equips,inputs?.heroes),buildings=parseBuildings(inputs?.water,config);
  return fresh('water','OnWaterResponse')&&fresh('inventory','AllItemResponse+AllResourceResponse')&&fresh('ownership','EquipsResponse+AllHeroResponse')
    &&same(f.sourceFacts.water.value,inputs.water)&&same(f.sourceFacts.inventory.value,{items:inputs.items,resources:inputs.resources})&&same(f.sourceFacts.ownership.value,{equips:inputs.equips,heroes:inputs.heroes})
    &&stock.stockReliable===true&&f.stockReliable===true&&f.stock instanceof Map&&same([...stock.stock],[...f.stock])&&ownership!==null&&same(ownership,f.ownership)&&buildings!==null&&same(buildings,f.buildings);
}
function clock(f){const t=gameTimeBounds(f),c=f?.identityContext,g=f?.gameTime;return own(f,'gameTime')&&g?.accountId===c?.accountId&&g?.generation===c?.generation?t:{now:null,earliest:null,latest:null};}
function baseBuilding(b){return b&&own(b.raw,'buildStartTime')&&own(b.raw,'buildFinishTime')&&uint(b.raw.buildStartTime)&&b.raw.buildFinishTime===0&&positive(b.raw.level);}
const allowedQueue=(q,r)=>q?.state==='MAKING'&&r?.makeId===q.makeId&&r.equipIds.includes(q.equipId);
const requestFor=(action,buildingId,makeId)=>action==='make'?{request:'MakeEquipRequest',response:null,body:{buildingId,makeId,universal:false}}:{request:'PickMadeEquipRequest',response:'PickMadeEquipResponse',body:{buildingId}};
function candidate(f,p,{config,moduleConfig=FORGE_DEFAULT_CONFIG}={}){
  p=validateForgeParameters(p);moduleConfig=validateForgeConfig(moduleConfig);const b=f?.buildings?.find(v=>v.buildingId===p.buildingId),r=f?.catalog?.recipes?.find(v=>v.makeId===(p.action==='make'?p.makeId:b?.queue?.makeId)),t=clock(f);
  let reason=null;const costs=p.action==='make'&&r?copy(r.costs):[],request=requestFor(p.action,p.buildingId,p.makeId);
  if(!p.buildingId||!p.action||p.action==='make'&&!p.makeId)reason='EXPLICIT_BUILDING_AND_SINGLE_ACTION_REQUIRED';
  else if(!moduleConfig.enabled)reason='FORGE_MODULE_DISABLED';
  else if(!authority(f,config))reason='FORGE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(b?.type!=='装备厂'||!baseBuilding(b))reason='FORGE_BUILDING_UNAVAILABLE';
  else if(!b.queue)reason='QUEUE_IDLE_BLOCKED_EVIDENCE';
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
    if(!parameters.action||parameters.action==='pick')choices.push({buildingId:b.buildingId,action:'pick'});
    if(!parameters.action||parameters.action==='make')for(const r of f?.catalog?.recipes??[])if(!parameters.makeId||parameters.makeId===r.makeId)choices.push({buildingId:b.buildingId,action:'make',makeId:r.makeId,allowUniversal:parameters.allowUniversal??false});
  }
  if(!choices.length)choices.push(parameters);const candidates=choices.map(p=>candidate(f,p,{config,moduleConfig}));
  return {module:'equipment-forge',forges:(f?.buildings??[]).filter(b=>b.type==='装备厂').map(b=>({buildingId:b.buildingId,queue:copy(b.queue),level:b.raw.level})),recipes:copy(f?.catalog?.recipes??[]),bag:copy(f?.ownership?.bag??[]),season:f?.season??null,candidates,blocked:candidates.filter(v=>!v.executable),notes:[...(f?.notes??[])],evidence:FORGE_EVIDENCE};
}
export function planEquipmentForge(f,{config,moduleConfig=FORGE_DEFAULT_CONFIG,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null)}={}){
  if(selections!==undefined&&(!dense(selections)||selections.some(v=>!id(v))||new Set(selections).size!==selections.length))throw invalid('selections 必须为唯一 actionId 数组');
  const row=candidate(f,parameters,{config,moduleConfig});if(row.executable&&(selections===undefined||selections.includes(row.actionId))&&ledger.reserve(row.costs))return {module:'equipment-forge',actions:[row],notes:[]};
  return {module:'equipment-forge',actions:[],notes:[row.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
function inventoriesMatch(b,a,costs){const debits=new Map(costs.map(v=>[v.id,v.num]));for(const k of new Set([...b.stock.keys(),...a.stock.keys()])){const before=b.stock.get(k)??0,after=a.stock.get(k)??0;if(before<(debits.get(k)??0)||after!==before-(debits.get(k)??0))return false;}return true;}
const withoutQueue=b=>Object.fromEntries(Object.entries(b.raw).filter(([k])=>k!=='equipMaking'));
export function verifyEquipmentForge(op,b,a,response){
  const fail=reason=>({confirmed:false,reason});let p,costs;try{p=validateForgeParameters(op?.parameters);costs=resourceCosts(op?.costs);}catch{return fail('OPERATION_CONTRACT_INVALID');}
  // Exact immutable config evidence is bound by identity; the shared executor
  // separately reconstructs this operation with current dependency versions.
  const cfg={tables:Object.fromEntries(tableNames.map(n=>[n,op?.configEvidence?.[n]??null]))};
  if(!authority(b,cfg)||!authority(a,cfg)||!same(b.identityContext,a.identityContext)||b.season!==a.season)return fail('FORGE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  const before=b.buildings.find(v=>v.buildingId===p.buildingId),after=a.buildings.find(v=>v.buildingId===p.buildingId),recipe=b.catalog.recipes.find(v=>v.makeId===(p.action==='make'?p.makeId:before?.queue?.makeId));
  const contract=candidate(b,p,{config:cfg,moduleConfig:{enabled:true}});
  if(op?.module!=='equipment-forge'||!contract.executable||!before||!after||!same(op.target,contract.target)||op.actionType!==contract.actionType||op.costSource!==source||!same(op.action,contract.action)||!same(op.beforeState,contract.beforeState)||!same(op.expectedState,contract.expectedState)||!same(costs,contract.costs)||op.identity!==contract.identity)return fail('FORGE_PLAN_OR_BATCH_MISMATCH');
  if(!same(withoutQueue(before),withoutQueue(after))||!same(b.buildings.filter(v=>v!==before),a.buildings.filter(v=>v!==after)))return fail('NON_TARGET_BUILDING_CHANGED');
  if(!same(b.ownership.heroes,a.ownership.heroes)||!inventoriesMatch(b,a,costs))return fail('OWNERSHIP_OR_EXACT_INVENTORY_CHANGED');
  if(clock(a).earliest===null||clock(a).now<clock(b).now)return fail('TRUSTED_GAME_CLOCK_UNKNOWN');
  if(p.action==='make'){
    if(before.queue?.state!=='IDLE'||!allowedQueue(after.queue,recipe)||after.queue.finishTime<clock(b).earliest||!same(b.ownership,a.ownership))return fail('EXACT_NEW_FORGE_QUEUE_NOT_CONFIRMED');
    return {confirmed:true,reason:'新 OnWater 完整队列确认单次制造及精确成本；等待新授权收取',afterState:copy(after.raw)};
  }
  if(!allowedQueue(before.queue,recipe)||before.queue.finishTime>clock(b).earliest||!own(response,'equipId')||response.equipId!==before.queue.equipId)return fail('PICK_RESPONSE_OR_ORIGINAL_BATCH_MISMATCH');
  if(!own(after.raw,'equipMaking')||after.queue?.state!=='IDLE')return fail('FORGE_QUEUE_CLEAR_NOT_CONFIRMED');
  const previous=new Set(b.ownership.uids),fresh=a.ownership.bag.filter(v=>!previous.has(v.uid));
  if(fresh.length!==1||fresh[0].equipId!==before.queue.equipId||fresh[0].star!==before.queue.star||!same(b.ownership.bag,a.ownership.bag.filter(v=>v.uid!==fresh[0].uid)))return fail('EXACT_ONE_NEW_EQUIPMENT_UID_NOT_CONFIRMED');
  return {confirmed:true,reason:'原精确批次、typed equipId、新唯一UID及完整权威复读共同确认收取',afterState:copy(after.raw),responseEvidence:{equipId:response.equipId,uid:fresh[0].uid,star:fresh[0].star}};
}
export function forgeDependencyVersions({config,moduleConfig=FORGE_DEFAULT_CONFIG}={}){return {moduleConfig:copy(moduleConfig),...Object.fromEntries(tableNames.map(n=>['config.'+n,copy(config?.tables?.[n]??null)]))};}
export const equipmentForgeModule=Object.freeze({id:'equipment-forge',label:'装备制造',capabilities:Object.freeze(['BIZ-R07']),defaultConfig:FORGE_DEFAULT_CONFIG,validateConfig:validateForgeConfig,validateParameters:validateForgeParameters,survey:surveyEquipmentForge,view:viewEquipmentForge,plan:planEquipmentForge,verify:verifyEquipmentForge,dependencyVersions:forgeDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...tableNames.map(n=>'config.'+n)])});