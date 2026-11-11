// C229 single owned equipment LEVEL +1. Shared Service/executor owns transport,
// authorization, finite resource/UID budgets, cancellation and durable UNKNOWN.
import { createHash } from 'node:crypto';
import { parseEquipmentOwnership } from './equipment-forge.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const dense=v=>Array.isArray(v)&&v.length<=10000&&Array.from({length:v.length},(_,i)=>own(v,i)).every(Boolean);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647,positive=v=>uint(v)&&v>0;
const same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b),copy=v=>structuredClone(v);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const fields=(v,keys)=>object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable);
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const tableNames=['EquipCfg','EquipAttrCfg','EquipUpDecomposeCfg'];
const mainHash='a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54';
// EquipUtil.equipAttrBaseCfg at game.js:1087 explicitly maps an id beginning with 绿 to star 0 before the id_star lookup.
const source='v76 /subpackages/main/game.js SHA256 '+mainHash+' EquipLevelBtn.ts:1065 refreshLvBtn/_toUpRequest; EquipUtil.ts:1087 equipUpDecCfg/maxEquipLevel; GameConstants.FORGE_IRON';
export const EQUIPMENT_GROWTH_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const EQUIPMENT_GROWTH_EVIDENCE=Object.freeze({source,request:'EnhanceEquipRequest',response:'NO_DEDICATED_RESPONSE',heroDerived:'SERVER_ALL_HERO_POWER_ATTRIBUTES_ONLY',levelZero:'EXCLUDED',refine:'EXCLUDED',star:'EXCLUDED',replace:'EXCLUDED',universal:'EXCLUDED',realGame:'REAL_UNVERIFIED'});
function exactPositive(v){
  if(typeof v==='number'&&!Number.isSafeInteger(v))return null;const n=toSnapshotJson(v);
  if(!(typeof n==='number'&&Number.isSafeInteger(n))&&!(typeof n==='string'&&/^[1-9]\d*$/.test(n)))return null;
  try{const b=BigInt(n);return b>0n&&b<(1n<<63n)?b.toString():null;}catch{return null;}
}
export function validateEquipmentGrowthConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('装备升级配置仅允许 enabled 布尔值');return {enabled:v.enabled??false};}
export function validateEquipmentGrowthParameters(v={}){
  if(!fields(v,['heroId','uid']))throw invalid('装备升级参数仅允许 heroId、uid');const out={};
  if(own(v,'heroId')){if(!id(v.heroId))throw invalid('heroId 必须为明确英雄 ID');out.heroId=v.heroId;}
  if(own(v,'uid')){if(typeof v.uid!=='string'||exactPositive(v.uid)!==v.uid)throw invalid('uid 必须为精确正 int64 十进制字符串');out.uid=v.uid;}
  return out;
}
const configStar=v=>typeof v==='number'&&uint(v)?v:typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v)&&uint(Number(v))?Number(v):null;
function catalog(config){
  const tables=Object.fromEntries(tableNames.map(name=>[name,config?.tables?.[name]?.data])),eq=tables.EquipCfg,attrs=tables.EquipAttrCfg,levels=tables.EquipUpDecomposeCfg;
  const bad=()=>({reliable:false,equips:[],attributes:[],levels:[]});
  if(![eq,attrs,levels].every(rows=>dense(rows)&&rows.length>0))return bad();
  if(!eq.every(row=>own(row,'id')&&id(row.id)&&own(row,'type')&&['武器','防具','饰品'].includes(row.type))||new Set(eq.map(row=>row.id)).size!==eq.length)return bad();
  if(!attrs.every(row=>own(row,'id')&&id(row.id)&&eq.some(item=>item.id===row.id)&&own(row,'star')&&configStar(row.star)!==null&&own(row,'maxLv')&&positive(row.maxLv))||new Set(attrs.map(row=>row.id+':'+configStar(row.star))).size!==attrs.length)return bad();
  if(!levels.every(row=>own(row,'level')&&positive(row.level)&&own(row,'upgradeCost')&&safeResourceQuantity(row.upgradeCost)!==null)||new Set(levels.map(row=>row.level)).size!==levels.length)return bad();
  return {reliable:true,equips:eq.map(row=>({id:row.id,type:row.type})).sort((a,b)=>a.id.localeCompare(b.id)),attributes:attrs.map(row=>({id:row.id,star:configStar(row.star),maxLv:row.maxLv})).sort((a,b)=>a.id.localeCompare(b.id)||a.star-b.star),levels:levels.map(row=>({level:row.level,upgradeCost:row.upgradeCost})).sort((a,b)=>a.level-b.level)};
}
function contextOf(client,player){
  const playerIds=['id','playerId'].filter(key=>own(player,key)).map(key=>exactPositive(player[key]));
  return {accountId:id(client.factContext?.accountId)?client.factContext.accountId:null,generation:Number.isSafeInteger(client.factContext?.generation)&&client.factContext.generation>=0?client.factContext.generation:null,
    playerId:playerIds.length&&playerIds.every(value=>value!==null&&value===playerIds[0])?playerIds[0]:null,worldId:own(player,'worldId')?exactPositive(player.worldId):null};
}
function derivedReliable(hero){return own(hero,'power')&&own(hero,'attributes')&&dense(hero.attributes)&&hero.attributes.length>0&&hero.attributes.every(row=>fields(row,['attr','value'])&&own(row,'attr')&&uint(row.attr)&&own(row,'value')&&typeof row.value==='number'&&Number.isFinite(row.value)&&(!Number.isInteger(row.value)||Number.isSafeInteger(row.value)))&&new Set(hero.attributes.map(row=>row.attr)).size===hero.attributes.length;}
const queries=[['EquipsRequest','EquipsResponse'],['AllHeroRequest','AllHeroResponse'],['AllItemRequest','AllItemResponse'],['AllResourceRequest','AllResourceResponse']];
export async function surveyEquipmentGrowth(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validateEquipmentGrowthParameters(parameters);const active=()=>assertExecutionActive(client,{signal,stop}),context=contextOf(client,player),notes=[];active();
  const responses=await Promise.all(queries.map(async([request,response])=>{active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return {value:null,sourceAt:Date.now()};}try{const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,{signal,stop});return {value,sourceAt:Date.now()};}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return {value:null,sourceAt:Date.now()};}}));
  active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('装备升级采集期间账号或代次改变'),{code:'CANCELLED'});
  const observed=responses.map(response=>response.value),inputs={equips:toSnapshotJson(observed[0]),heroes:toSnapshotJson(observed[1]),items:toSnapshotJson(observed[2]),resources:toSnapshotJson(observed[3])};
  const rawOwnership=parseEquipmentOwnership(observed[0],observed[1]),ownership=rawOwnership===null?null:parseEquipmentOwnership(inputs.equips,inputs.heroes),rawInventory=parseOperationInventory(observed[2],observed[3]),inventory=rawInventory.stockReliable?parseOperationInventory(inputs.items,inputs.resources):rawInventory;
  // Each independent response retains its own completion time. A slow sibling
  // never refreshes an earlier observation; aggregate provenance uses the oldest.
  const provenance={accountId:context.accountId,generation:context.generation,scope:{kind:'ACCOUNT'}};
  const sourceFacts=Object.fromEntries(['equips','heroes','items','resources'].map((key,index)=>[key,createStateFact(inputs[key],{...provenance,source:queries[index][1],sourceAt:responses[index].sourceAt,reliable:index<2?ownership!==null:inventory.stockReliable})]));
  sourceFacts.ownership=createStateFact({equips:inputs.equips,heroes:inputs.heroes},{...provenance,source:'EquipsResponse+AllHeroResponse',sourceAt:Math.min(responses[0].sourceAt,responses[1].sourceAt),reliable:ownership!==null});
  sourceFacts.inventory=createStateFact({items:inputs.items,resources:inputs.resources},{...provenance,source:'AllItemResponse+AllResourceResponse',sourceAt:Math.min(responses[2].sourceAt,responses[3].sourceAt),reliable:inventory.stockReliable});
  return {module:'equipment-growth',parameters,identityContext:context,catalog:catalog(config),ownership,...inventory,inputs,sourceFacts,available:Object.keys(protocol??{}),notes,evidence:EQUIPMENT_GROWTH_EVIDENCE,state:{context,ownership}};
}
function authority(f,config){
  const c=f?.identityContext;if(!id(c?.accountId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||!f.catalog?.reliable||!same(f.catalog,catalog(config)))return false;
  const fresh=(key,source)=>f.sourceFacts?.[key]?.provenance?.source===source&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope:{kind:'ACCOUNT'}}).status==='FRESH';
  const inputs=f.inputs,ownership=parseEquipmentOwnership(inputs?.equips,inputs?.heroes),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
  return ['equips','heroes','items','resources'].every((key,index)=>fresh(key,queries[index][1])&&same(f.sourceFacts[key].value,inputs?.[key]))&&f.sourceFacts.ownership?.provenance?.sourceAt===Math.min(f.sourceFacts.equips?.provenance?.sourceAt,f.sourceFacts.heroes?.provenance?.sourceAt)&&f.sourceFacts.inventory?.provenance?.sourceAt===Math.min(f.sourceFacts.items?.provenance?.sourceAt,f.sourceFacts.resources?.provenance?.sourceAt)&&fresh('ownership','EquipsResponse+AllHeroResponse')&&fresh('inventory','AllItemResponse+AllResourceResponse')&&same(f.sourceFacts.ownership.value,{equips:inputs.equips,heroes:inputs.heroes})&&same(f.sourceFacts.inventory.value,{items:inputs.items,resources:inputs.resources})&&ownership!==null&&same(ownership,f.ownership)&&inventory.stockReliable===true&&f.stockReliable===true&&f.stock instanceof Map&&same([...inventory.stock],[...f.stock]);
}
function candidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  p=validateEquipmentGrowthParameters(p);moduleConfig=validateEquipmentGrowthConfig(moduleConfig);const hero=f?.ownership?.heroes?.find(row=>row.heroId===p.heroId),equipment=hero?.equips?.find(row=>row.uid===p.uid),attr=f?.catalog?.attributes?.find(row=>row.id===equipment?.equipId&&row.star===(equipment?.equipId?.startsWith('绿')?0:equipment?.star)),nextLevel=equipment?equipment.level+1:null,row=f?.catalog?.levels?.find(value=>value.level===nextLevel);
  const costs=row&&safeResourceQuantity(row.upgradeCost)!==null&&row.upgradeCost>0?[{id:'精铁',num:row.upgradeCost}]:[],action={request:'EnhanceEquipRequest',response:null,body:{uid:p.uid}};let reason=null;
  if(!p.heroId||!p.uid)reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';else if(!authority(f,config))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';else if(!hero||!equipment)reason='EXACT_WORN_EQUIPMENT_REQUIRED';else if(!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';else if(equipment.level<1)reason='LEVEL_ZERO_OUTSIDE_SINGLE_UPGRADE_SCOPE';else if(!attr||!row)reason='EQUIPMENT_LEVEL_OR_CAP_CONFIG_UNKNOWN';else if(nextLevel>attr.maxLv)reason='EQUIPMENT_MAX_LEVEL';else if(!positive(row.upgradeCost)||costs.length!==1)reason='POSITIVE_EXACT_IRON_COST_REQUIRED';else if(!f.available?.includes(action.request))reason='PROTOCOL_UNAVAILABLE';else if((f.stock.get('精铁')??0)<row.upgradeCost)reason='IRON_STOCK_INSUFFICIENT';else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={heroId:p.heroId??null,uid:p.uid??null},beforeState=hero&&equipment?{hero:copy(hero),equipment:copy(equipment)}:null,expectedState=equipment?{heroId:p.heroId,uid:equipment.uid,equipId:equipment.equipId,level:nextLevel,star:equipment.star,refineLv:equipment.refineLv}:null;
  return {module:'equipment-growth',actionId:'equipment-growth:LEVEL:'+hash(target),actionType:'LEVEL',parameters:p,target,identity:hero&&equipment?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig})}):null,configEvidence:Object.fromEntries(tableNames.map(name=>[name,copy(config?.tables?.[name]??null)])),beforeState,expectedState,costs,costSource:source,budgetClaims:{resources:copy(costs),quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},executable:reason===null,blockedReason:reason,label:'装备升级 '+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
export function viewEquipmentGrowth(f,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters=f?.parameters??{}}={}){
  parameters=validateEquipmentGrowthParameters(parameters);moduleConfig=validateEquipmentGrowthConfig(moduleConfig);const choices=[];
  for(const hero of f?.ownership?.heroes??[]){if(parameters.heroId&&hero.heroId!==parameters.heroId)continue;for(const equipment of hero.equips){if(parameters.uid&&equipment.uid!==parameters.uid)continue;choices.push({heroId:hero.heroId,uid:equipment.uid});}}
  if(!choices.length)choices.push(parameters);const candidates=choices.map(p=>candidate(f,p,{config,moduleConfig}));
  return {module:'equipment-growth',heroes:copy(f?.ownership?.heroes??[]),bag:copy(f?.ownership?.bag??[]),candidates,blocked:candidates.filter(row=>!row.executable),notes:[...(f?.notes??[])],evidence:EQUIPMENT_GROWTH_EVIDENCE};
}
export function planEquipmentGrowth(f,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null)}={}){
  if(selections!==undefined&&(!dense(selections)||selections.some(value=>!id(value))||new Set(selections).size!==selections.length))throw invalid('selections 必须为唯一 actionId 数组');
  const row=candidate(f,parameters,{config,moduleConfig});if(row.executable&&(selections===undefined||selections.includes(row.actionId))&&ledger.reserve(row.costs))return {module:'equipment-growth',actions:[row],notes:[]};return {module:'equipment-growth',actions:[],notes:[row.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
const without=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
function inventoriesMatch(b,a,costs){const debits=new Map(costs.map(row=>[row.id,row.num]));for(const key of new Set([...b.stock.keys(),...a.stock.keys()])){const before=b.stock.get(key)??0;if(before<(debits.get(key)??0)||(a.stock.get(key)??0)!==before-(debits.get(key)??0))return false;}return true;}
export function verifyEquipmentGrowth(op,b,a){
  const fail=reason=>({confirmed:false,reason});let p;try{p=validateEquipmentGrowthParameters(op?.parameters);resourceCosts(op?.costs);}catch{return fail('OPERATION_CONTRACT_INVALID');}
  const config={tables:Object.fromEntries(tableNames.map(name=>[name,op?.configEvidence?.[name]??null]))};if(!authority(b,config)||!authority(a,config)||!same(b.identityContext,a.identityContext))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  const contract=candidate(b,p,{config,moduleConfig:{enabled:true}});if(!contract.executable||op?.module!=='equipment-growth'||['target','identity','actionType','action','beforeState','expectedState','costs','costSource','budgetClaims'].some(key=>!same(op[key],contract[key])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  const before=b.ownership.heroes.find(hero=>hero.heroId===p.heroId),after=a.ownership.heroes.find(hero=>hero.heroId===p.heroId);if(!before||!after||!derivedReliable(before)||!derivedReliable(after))return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const equipment=b.ownership.pool.find(row=>row.uid===p.uid),expected={...copy(equipment),level:equipment.level+1},afterEquipment=a.ownership.pool.find(row=>row.uid===p.uid);
  if(!same(expected,afterEquipment)||!same(expected,after.equips.find(row=>row.uid===p.uid)))return fail('EXACT_SINGLE_EQUIPMENT_LEVEL_NOT_CONFIRMED');
  if(!same(without(before,['power','attributes','equips']),without(after,['power','attributes','equips']))||!same(before.equips.filter(row=>row.uid!==p.uid),after.equips.filter(row=>row.uid!==p.uid)))return fail('NON_TARGET_HERO_FIELDS_CHANGED');
  if(!same(b.ownership.heroes.filter(hero=>hero.heroId!==p.heroId),a.ownership.heroes.filter(hero=>hero.heroId!==p.heroId))||!same(b.ownership.pool.filter(row=>row.uid!==p.uid),a.ownership.pool.filter(row=>row.uid!==p.uid))||!same(b.ownership.bag,a.ownership.bag)||!same(b.ownership.uids,a.ownership.uids))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!inventoriesMatch(b,a,contract.costs))return fail('EXACT_IRON_DEBIT_OR_OTHER_INVENTORY_CHANGED');
  return {confirmed:true,reason:'新 Equips 与 AllHero 同UID同归属复读确认单次等级+1、精铁精确扣除；仅目标英雄权威power/attributes可变化',afterState:{hero:copy(after),equipment:copy(afterEquipment)},responseEvidence:null};
}
export function equipmentGrowthDependencyVersions({config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){return {moduleConfig:copy(moduleConfig),...Object.fromEntries(tableNames.map(name=>['config.'+name,copy(config?.tables?.[name]??null)]))};}
export const equipmentGrowthModule=Object.freeze({id:'equipment-growth',label:'装备单次升级',capabilities:Object.freeze(['C229']),defaultConfig:EQUIPMENT_GROWTH_DEFAULT_CONFIG,validateConfig:validateEquipmentGrowthConfig,validateParameters:validateEquipmentGrowthParameters,survey:surveyEquipmentGrowth,view:viewEquipmentGrowth,plan:planEquipmentGrowth,verify:verifyEquipmentGrowth,dependencyVersions:equipmentGrowthDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...tableNames.map(name=>'config.'+name)])});