// C229 single owned equipment LEVEL +1; BIZ-R09 RED REFINE +1 and empty-slot PUT-ON.
// Shared Service/executor owns transport, authorization, finite resource/UID
// budgets, cancellation and durable UNKNOWN.
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
const refineTableNames=['EquipCfg','EquipAttrCfg','EquipRefineCfg'];
const putOnTableNames=['EquipCfg','ModuleOpenCfg'];
const isRefine=parameters=>parameters?.action==='refine';
const isPutOn=parameters=>parameters?.action==='put-on';
const tablesFor=parameters=>isPutOn(parameters)?putOnTableNames:isRefine(parameters)?refineTableNames:tableNames;
const mainHash='a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54';
// EquipUtil.equipAttrBaseCfg at game.js:1087 explicitly maps an id beginning with 绿 to star 0 before the id_star lookup.
const source='v76 /subpackages/main/game.js SHA256 '+mainHash+' EquipLevelBtn.ts:1065 refreshLvBtn/_toUpRequest; EquipUtil.ts:1087 equipUpDecCfg/maxEquipLevel; GameConstants.FORGE_IRON';
// Static evidence only. Offsets are zero-based UTF-8 bytes inside the fixed main
// game.js. Module SHA256 covers System.register through the next module start,
// including the final two LFs. No bundle is executed by this adapter.
const refineSource='v76 /subpackages/main/game.js SHA256 '+mainHash+' EquipDetailPop.ts:1057 _refreshEquipRefine/_requestEquipRefine; EquipUtil.ts:1087 isEquipRefineAvail/equipRefineCostItem';
export const EQUIPMENT_REFINE_EVIDENCE=Object.freeze({
  source:refineSource,requirement:'BIZ-R09',request:'EquipRefineRequest',response:'NO_DEDICATED_RESPONSE',
  packageSha256:'4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  protocolSha256:'ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc',
  configSha256:'0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762',
  detail:Object.freeze({line:1057,byteOffset:1981657,sha256:'a72390a57247af8a52e500a34c726043f5e58d2d5d7fee8edcaa7b9d28c27e50',refreshByteOffset:1991603,requestByteOffset:1994952}),
  util:Object.freeze({line:1087,byteOffset:2075468,sha256:'eee5b62dd7bd3295b60c062ed12986073b55fca1fad85018af07716c41e9ea9b',eligibilityByteOffset:2079901,costIdsByteOffset:2088678}),
  ownership:Object.freeze({line:1077,byteOffset:2047059,sha256:'b11a06b0209cf966d0c6634d3a74608971b0d574d035b36c8dd496aa8489c27b'}),
  requestSchema:Object.freeze({line:3,byteOffset:799193,sha256:'cda8e9f618f04517b684c34b1d81e2fd3ae7a0dabe9248da80338afd7bf66bf7'}),
  refineCfgDataSha256:'d1be893a9f81091c9ccb8c6e2f06d48d2b5d807adbde207aa70710f6d3b97c0b',
  scope:'EXPLICIT_EQUIPPED_RED_SINGLE_REFINE_ONLY',realGame:'REAL_UNVERIFIED',
});
const putOnRequest='PutOnEquipRequest';
const putOnSource='v76 /subpackages/main/game.js: HeroDetail/HeroDetailEquip; EquipSelectPop.idleEquipsByType; EquipSelectItem._onBtnPutOn; ModuleOpenUtil.isOpen';
const equipTypes=Object.freeze(['武器','防具','饰品']);
export const EQUIPMENT_PUT_ON_EVIDENCE=Object.freeze({
  source:putOnSource,requirement:'BIZ-R09',request:putOnRequest,response:'NO_DEDICATED_RESPONSE',entrySha256:mainHash,
  packageSha256:EQUIPMENT_REFINE_EVIDENCE.packageSha256,protocolSha256:EQUIPMENT_REFINE_EVIDENCE.protocolSha256,configSha256:EQUIPMENT_REFINE_EVIDENCE.configSha256,
  detail:Object.freeze({byteOffset:3483023,slotByteOffset:3484854,sha256:'560c3e01da21efeccaa519fe7ddcf53948c3ea72b9becbf7a4205bc8580f2b98'}),
  selection:Object.freeze({byteOffset:2070161,idleLookupByteOffset:2072184,sha256:'ddc48aafef9729700d1180b68daa08cf2c6f645738658783fdc498415d461456'}),
  item:Object.freeze({byteOffset:2064789,requestByteOffset:2069400,sha256:'fe8af7f50756e0589fe161095f3de73a23745b5473c09722db1223299a2b5075'}),
  ownership:EQUIPMENT_REFINE_EVIDENCE.ownership,
  moduleOpen:Object.freeze({byteOffset:4674760,isOpenByteOffset:4675743,heroDetailCheckByteOffset:3457638,sha256:'98544b76338dde2e7da17c1d636507a056a9b078e1a3bc394b1cb1f89d46428b'}),
  scope:'EXPLICIT_OWNED_IDLE_SINGLE_EMPTY_SLOT_ONLY',replace:'BLOCKED_EVIDENCE',realGame:'REAL_UNVERIFIED',
});
export const EQUIPMENT_GROWTH_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const EQUIPMENT_GROWTH_EVIDENCE=Object.freeze({source,request:'EnhanceEquipRequest',response:'NO_DEDICATED_RESPONSE',heroDerived:'SERVER_ALL_HERO_POWER_ATTRIBUTES_ONLY',levelZero:'EXCLUDED',refine:EQUIPMENT_REFINE_EVIDENCE,star:'EXCLUDED',replace:'EXCLUDED',universal:'EXCLUDED',realGame:'REAL_UNVERIFIED'});
function exactPositive(v){
  if(typeof v==='number'&&!Number.isSafeInteger(v))return null;const n=toSnapshotJson(v);
  if(!(typeof n==='number'&&Number.isSafeInteger(n))&&!(typeof n==='string'&&/^[1-9]\d*$/.test(n)))return null;
  try{const b=BigInt(n);return b>0n&&b<(1n<<63n)?b.toString():null;}catch{return null;}
}
export function validateEquipmentGrowthConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('装备升级配置仅允许 enabled 布尔值');return {enabled:v.enabled??false};}
export function validateEquipmentGrowthParameters(v={}){
  if(!fields(v,['heroId','uid','action']))throw invalid('装备操作参数仅允许 heroId、uid 及可选 action=refine 或 put-on');const out={};
  if(own(v,'heroId')){if(!id(v.heroId))throw invalid('heroId 必须为明确英雄 ID');out.heroId=v.heroId;}
  if(own(v,'uid')){if(typeof v.uid!=='string'||exactPositive(v.uid)!==v.uid)throw invalid('uid 必须为精确正 int64 十进制字符串');out.uid=v.uid;}
  if(own(v,'action')){if(!['refine','put-on'].includes(v.action))throw invalid('action 仅允许 refine 或 put-on；省略保持单次等级升级');out.action=v.action;}
  return out;
}
const configStar=v=>typeof v==='number'&&uint(v)?v:typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v)&&uint(Number(v))?Number(v):null;
function levelCatalog(config){
  const tables=Object.fromEntries(tableNames.map(name=>[name,config?.tables?.[name]?.data])),eq=tables.EquipCfg,attrs=tables.EquipAttrCfg,levels=tables.EquipUpDecomposeCfg;
  const bad=()=>({reliable:false,equips:[],attributes:[],levels:[]});
  if(![eq,attrs,levels].every(rows=>dense(rows)&&rows.length>0))return bad();
  if(!eq.every(row=>own(row,'id')&&id(row.id)&&own(row,'type')&&['武器','防具','饰品'].includes(row.type))||new Set(eq.map(row=>row.id)).size!==eq.length)return bad();
  if(!attrs.every(row=>own(row,'id')&&id(row.id)&&eq.some(item=>item.id===row.id)&&own(row,'star')&&configStar(row.star)!==null&&own(row,'maxLv')&&positive(row.maxLv))||new Set(attrs.map(row=>row.id+':'+configStar(row.star))).size!==attrs.length)return bad();
  if(!levels.every(row=>own(row,'level')&&positive(row.level)&&own(row,'upgradeCost')&&safeResourceQuantity(row.upgradeCost)!==null)||new Set(levels.map(row=>row.level)).size!==levels.length)return bad();
  return {reliable:true,equips:eq.map(row=>({id:row.id,type:row.type})).sort((a,b)=>a.id.localeCompare(b.id)),attributes:attrs.map(row=>({id:row.id,star:configStar(row.star),maxLv:row.maxLv})).sort((a,b)=>a.id.localeCompare(b.id)||a.star-b.star),levels:levels.map(row=>({level:row.level,upgradeCost:row.upgradeCost})).sort((a,b)=>a.level-b.level)};
}
function refineCatalog(config){
  const tables=Object.fromEntries(refineTableNames.map(name=>[name,config?.tables?.[name]?.data])),eq=tables.EquipCfg,attrs=tables.EquipAttrCfg,refines=tables.EquipRefineCfg;
  const bad=()=>({reliable:false,equips:[],attributes:[],refines:[]});
  if(![eq,attrs,refines].every(rows=>dense(rows)&&rows.length>0))return bad();
  if(!eq.every(row=>own(row,'id')&&id(row.id)&&own(row,'type')&&['武器','防具','饰品'].includes(row.type)&&own(row,'quality')&&['GREEN','BLUE','PURPLE','ORANGE','RED'].includes(row.quality))||new Set(eq.map(row=>row.id)).size!==eq.length)return bad();
  if(!attrs.every(row=>own(row,'id')&&id(row.id)&&eq.some(item=>item.id===row.id)&&own(row,'star')&&configStar(row.star)!==null&&own(row,'maxLv')&&positive(row.maxLv)&&own(row,'maxRefineLv')&&uint(row.maxRefineLv))||new Set(attrs.map(row=>row.id+':'+configStar(row.star))).size!==attrs.length)return bad();
  if(!refines.every(row=>own(row,'level')&&positive(row.level)&&own(row,'costItem1')&&positive(row.costItem1)&&own(row,'costItem2')&&positive(row.costItem2))||new Set(refines.map(row=>row.level)).size!==refines.length)return bad();
  return {reliable:true,equips:eq.map(row=>({id:row.id,type:row.type,quality:row.quality})).sort((a,b)=>a.id.localeCompare(b.id)),attributes:attrs.map(row=>({id:row.id,star:configStar(row.star),maxLv:row.maxLv,maxRefineLv:row.maxRefineLv})).sort((a,b)=>a.id.localeCompare(b.id)||a.star-b.star),refines:refines.map(row=>({level:row.level,costItem1:row.costItem1,costItem2:row.costItem2})).sort((a,b)=>a.level-b.level)};
}
function putOnCatalog(config){
  const equips=config?.tables?.EquipCfg?.data,open=config?.tables?.ModuleOpenCfg?.data;
  const bad=()=>({reliable:false,equips:[],playerLevel:null});
  if(!dense(equips)||!equips.length||!dense(open))return bad();
  if(!equips.every(row=>own(row,'id')&&id(row.id)&&own(row,'type')&&equipTypes.includes(row.type))||new Set(equips.map(row=>row.id)).size!==equips.length)return bad();
  const gates=open.filter(row=>own(row,'moduleId')&&row.moduleId==='英雄装备');
  if(gates.length!==1||!own(gates[0],'playerLevel')||!positive(gates[0].playerLevel))return bad();
  return {reliable:true,equips:equips.map(({id,type})=>({id,type})).sort((a,b)=>a.id.localeCompare(b.id)),playerLevel:gates[0].playerLevel};
}
const catalog=(config,parameters)=>isPutOn(parameters)?putOnCatalog(config):isRefine(parameters)?refineCatalog(config):levelCatalog(config);
function contextOf(client,player){
  const playerIds=['id','playerId'].filter(key=>own(player,key)).map(key=>exactPositive(player[key]));
  return {accountId:id(client.factContext?.accountId)?client.factContext.accountId:null,generation:Number.isSafeInteger(client.factContext?.generation)&&client.factContext.generation>=0?client.factContext.generation:null,
    playerId:playerIds.length&&playerIds.every(value=>value!==null&&value===playerIds[0])?playerIds[0]:null,worldId:own(player,'worldId')?exactPositive(player.worldId):null};
}
function equipmentContext(client,player,parameters){
  const context=contextOf(client,player);
  return isPutOn(parameters)?{...context,
    connectionId:id(client.factContext?.connectionId)?client.factContext.connectionId:null,
    playerLevel:own(player,'level')&&positive(player.level)?player.level:null,
  }:context;
}
function derivedReliable(hero){return own(hero,'power')&&own(hero,'attributes')&&dense(hero.attributes)&&hero.attributes.length>0&&hero.attributes.every(row=>fields(row,['attr','value'])&&own(row,'attr')&&uint(row.attr)&&own(row,'value')&&typeof row.value==='number'&&Number.isFinite(row.value)&&(!Number.isInteger(row.value)||Number.isSafeInteger(row.value)))&&new Set(hero.attributes.map(row=>row.attr)).size===hero.attributes.length;}
const queries=[['EquipsRequest','EquipsResponse'],['AllHeroRequest','AllHeroResponse'],['AllItemRequest','AllItemResponse'],['AllResourceRequest','AllResourceResponse']];
export async function surveyEquipmentGrowth(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validateEquipmentGrowthParameters(parameters);const active=()=>assertExecutionActive(client,{signal,stop}),context=equipmentContext(client,player,parameters),notes=[];active();
  const responses=await Promise.all(queries.map(async([request,response])=>{active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return {value:null,sourceAt:Date.now()};}try{const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,{signal,stop});return {value,sourceAt:Date.now()};}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return {value:null,sourceAt:Date.now()};}}));
  active();if(!same(context,equipmentContext(client,player,parameters)))throw Object.assign(new Error('装备升级采集期间账号或代次改变'),{code:'CANCELLED'});
  const observed=responses.map(response=>response.value),inputs={equips:toSnapshotJson(observed[0]),heroes:toSnapshotJson(observed[1]),items:toSnapshotJson(observed[2]),resources:toSnapshotJson(observed[3])};
  const rawOwnership=parseEquipmentOwnership(observed[0],observed[1]),ownership=rawOwnership===null?null:parseEquipmentOwnership(inputs.equips,inputs.heroes),rawInventory=parseOperationInventory(observed[2],observed[3]),inventory=rawInventory.stockReliable?parseOperationInventory(inputs.items,inputs.resources):rawInventory;
  // Each independent response retains its own completion time. A slow sibling
  // never refreshes an earlier observation; aggregate provenance uses the oldest.
  const provenance={accountId:context.accountId,generation:context.generation,scope:{kind:'ACCOUNT'}};
  const sourceFacts=Object.fromEntries(['equips','heroes','items','resources'].map((key,index)=>[key,createStateFact(inputs[key],{...provenance,source:queries[index][1],sourceAt:responses[index].sourceAt,reliable:index<2?ownership!==null:inventory.stockReliable})]));
  sourceFacts.ownership=createStateFact({equips:inputs.equips,heroes:inputs.heroes},{...provenance,source:'EquipsResponse+AllHeroResponse',sourceAt:Math.min(responses[0].sourceAt,responses[1].sourceAt),reliable:ownership!==null});
  sourceFacts.inventory=createStateFact({items:inputs.items,resources:inputs.resources},{...provenance,source:'AllItemResponse+AllResourceResponse',sourceAt:Math.min(responses[2].sourceAt,responses[3].sourceAt),reliable:inventory.stockReliable});
  return {module:'equipment-growth',parameters,identityContext:context,catalog:catalog(config,parameters),ownership,...inventory,inputs,sourceFacts,available:Object.keys(protocol??{}),notes,evidence:isPutOn(parameters)?EQUIPMENT_PUT_ON_EVIDENCE:EQUIPMENT_GROWTH_EVIDENCE,state:{context,ownership}};
}
function authority(f,config,parameters){
  const c=f?.identityContext;if(!id(c?.accountId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||!f.catalog?.reliable||!same(f.catalog,catalog(config,parameters)))return false;
  const fresh=(key,source)=>f.sourceFacts?.[key]?.provenance?.source===source&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope:{kind:'ACCOUNT'}}).status==='FRESH';
  const inputs=f.inputs,ownership=parseEquipmentOwnership(inputs?.equips,inputs?.heroes),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
  return ['equips','heroes','items','resources'].every((key,index)=>fresh(key,queries[index][1])&&same(f.sourceFacts[key].value,inputs?.[key]))&&f.sourceFacts.ownership?.provenance?.sourceAt===Math.min(f.sourceFacts.equips?.provenance?.sourceAt,f.sourceFacts.heroes?.provenance?.sourceAt)&&f.sourceFacts.inventory?.provenance?.sourceAt===Math.min(f.sourceFacts.items?.provenance?.sourceAt,f.sourceFacts.resources?.provenance?.sourceAt)&&fresh('ownership','EquipsResponse+AllHeroResponse')&&fresh('inventory','AllItemResponse+AllResourceResponse')&&same(f.sourceFacts.ownership.value,{equips:inputs.equips,heroes:inputs.heroes})&&same(f.sourceFacts.inventory.value,{items:inputs.items,resources:inputs.resources})&&ownership!==null&&same(ownership,f.ownership)&&inventory.stockReliable===true&&f.stockReliable===true&&f.stock instanceof Map&&same([...inventory.stock],[...f.stock]);
}
function candidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  p=validateEquipmentGrowthParameters(p);if(isPutOn(p))return putOnCandidate(f,p,{config,moduleConfig});if(isRefine(p))return refineCandidate(f,p,{config,moduleConfig});moduleConfig=validateEquipmentGrowthConfig(moduleConfig);const hero=f?.ownership?.heroes?.find(row=>row.heroId===p.heroId),equipment=hero?.equips?.find(row=>row.uid===p.uid),attr=f?.catalog?.attributes?.find(row=>row.id===equipment?.equipId&&row.star===(equipment?.equipId?.startsWith('绿')?0:equipment?.star)),nextLevel=equipment?equipment.level+1:null,row=f?.catalog?.levels?.find(value=>value.level===nextLevel);
  const costs=row&&safeResourceQuantity(row.upgradeCost)!==null&&row.upgradeCost>0?[{id:'精铁',num:row.upgradeCost}]:[],action={request:'EnhanceEquipRequest',response:null,body:{uid:p.uid}};let reason=null;
  if(!p.heroId||!p.uid)reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';else if(!authority(f,config))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';else if(!hero||!equipment)reason='EXACT_WORN_EQUIPMENT_REQUIRED';else if(!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';else if(equipment.level<1)reason='LEVEL_ZERO_OUTSIDE_SINGLE_UPGRADE_SCOPE';else if(!attr||!row)reason='EQUIPMENT_LEVEL_OR_CAP_CONFIG_UNKNOWN';else if(nextLevel>attr.maxLv)reason='EQUIPMENT_MAX_LEVEL';else if(!positive(row.upgradeCost)||costs.length!==1)reason='POSITIVE_EXACT_IRON_COST_REQUIRED';else if(!f.available?.includes(action.request))reason='PROTOCOL_UNAVAILABLE';else if((f.stock.get('精铁')??0)<row.upgradeCost)reason='IRON_STOCK_INSUFFICIENT';else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={heroId:p.heroId??null,uid:p.uid??null},beforeState=hero&&equipment?{hero:copy(hero),equipment:copy(equipment)}:null,expectedState=equipment?{heroId:p.heroId,uid:equipment.uid,equipId:equipment.equipId,level:nextLevel,star:equipment.star,refineLv:equipment.refineLv}:null;
  return {module:'equipment-growth',actionId:'equipment-growth:LEVEL:'+hash(target),actionType:'LEVEL',parameters:p,target,identity:hero&&equipment?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig})}):null,configEvidence:Object.fromEntries(tableNames.map(name=>[name,copy(config?.tables?.[name]??null)])),beforeState,expectedState,costs,costSource:source,budgetClaims:{resources:copy(costs),quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},executable:reason===null,blockedReason:reason,label:'装备升级 '+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
function refineCandidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  moduleConfig=validateEquipmentGrowthConfig(moduleConfig);
  const hero=f?.ownership?.heroes?.find(row=>row.heroId===p.heroId),equipment=hero?.equips?.find(row=>row.uid===p.uid),eq=f?.catalog?.equips?.find(row=>row.id===equipment?.equipId),attr=f?.catalog?.attributes?.find(row=>row.id===equipment?.equipId&&row.star===equipment?.star),nextRefine=equipment?equipment.refineLv+1:null,row=f?.catalog?.refines?.find(value=>value.level===nextRefine);
  const costs=row&&positive(row.costItem1)&&positive(row.costItem2)?[{id:'精铁',num:row.costItem1},{id:'精炼石',num:row.costItem2}]:[],action={request:'EquipRefineRequest',response:null,body:{uid:p.uid}};let reason=null;
  if(!p.heroId||!p.uid)reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';else if(!authority(f,config,p))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';else if(!hero||!equipment)reason='EXACT_WORN_EQUIPMENT_REQUIRED';else if(!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';else if(equipment.level<1)reason='LEVEL_ZERO_OUTSIDE_SINGLE_UPGRADE_SCOPE';else if(!eq||eq.quality!=='RED')reason='RED_EQUIPMENT_REQUIRED';else if(!attr)reason='EQUIPMENT_REFINE_OR_CAP_CONFIG_UNKNOWN';else if(nextRefine>attr.maxRefineLv)reason='EQUIPMENT_MAX_REFINE';else if(!row||costs.length!==2)reason='POSITIVE_EXACT_REFINE_COSTS_REQUIRED';else if(!f.available?.includes(action.request))reason='PROTOCOL_UNAVAILABLE';else if(costs.some(cost=>(f.stock.get(cost.id)??0)<cost.num))reason='REFINE_MATERIAL_STOCK_INSUFFICIENT';else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={heroId:p.heroId??null,uid:p.uid??null},beforeState=hero&&equipment?{hero:copy(hero),equipment:copy(equipment)}:null,expectedState=equipment?{heroId:p.heroId,uid:equipment.uid,equipId:equipment.equipId,level:equipment.level,star:equipment.star,refineLv:nextRefine}:null;
  return {module:'equipment-growth',actionId:'equipment-growth:REFINE:'+hash(target),actionType:'REFINE',parameters:p,target,identity:hero&&equipment?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,configEvidence:Object.fromEntries(refineTableNames.map(name=>[name,copy(config?.tables?.[name]??null)])),beforeState,expectedState,costs,costSource:refineSource,budgetClaims:{resources:copy(costs),quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},executable:reason===null,blockedReason:reason,label:'装备精炼 '+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
const putOnFactKeys=['equips','heroes','items','resources'];
function putOnFresh(f){
  const c=f?.identityContext,now=Date.now();
  return putOnFactKeys.every((key,index)=>f?.sourceFacts?.[key]?.provenance?.source===queries[index][1]&&
    factsFreshnessPolicy(f.sourceFacts[key],{accountId:c?.accountId,generation:c?.generation,now,maxAgeMs:30000,scope:{kind:'ACCOUNT'}}).status==='FRESH');
}
function putOnState(f,config,p){
  const context=f?.identityContext;
  if(!id(context?.connectionId)||!positive(context.playerLevel)||!authority(f,config,p)||!putOnFresh(f))return null;
  const types=new Map(f.catalog.equips.map(row=>[row.id,row.type]));
  if(f.ownership.pool.some(row=>!types.has(row.equipId)))return null;
  const byHero=new Map();
  for(const hero of f.ownership.heroes){
    const occupied=new Set(hero.equips.map(row=>types.get(row.equipId)));
    if(occupied.size!==hero.equips.length)return null;
    byHero.set(hero.heroId,{hero,occupied});
  }
  return {types,byHero,pool:new Map(f.ownership.pool.map(row=>[row.uid,row])),idle:new Set(f.ownership.bag.map(row=>row.uid))};
}
function putOnCandidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,state=putOnState(f,config,p),includePlanEvidence=true}={}){
  moduleConfig=validateEquipmentGrowthConfig(moduleConfig);
  const slotOwner=state?.byHero.get(p.heroId),hero=slotOwner?.hero,equipment=state?.pool.get(p.uid),type=equipment?state.types.get(equipment.equipId):null;
  const target={heroId:p.heroId??null,uid:p.uid??null,type},costs=[];
  const action={request:putOnRequest,response:null,body:{uid:p.uid,heroId:p.heroId}};
  let blockedReason=null;
  if(!p.heroId||!p.uid)blockedReason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';
  else if(!moduleConfig.enabled)blockedReason='EQUIPMENT_GROWTH_MODULE_DISABLED';
  else if(!state)blockedReason='EQUIPMENT_AUTHORITY_OR_SLOT_CONFIG_UNKNOWN';
  else if(f.identityContext.playerLevel<f.catalog.playerLevel)blockedReason='EQUIPMENT_MODULE_LEVEL_LOCKED';
  else if(!hero||!equipment||!state.idle.has(p.uid))blockedReason='EXACT_IDLE_OWNED_EQUIPMENT_REQUIRED';
  else if(slotOwner.occupied.has(type))blockedReason='EQUIPMENT_SLOT_NOT_EMPTY';
  else if(!derivedReliable(hero))blockedReason='TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if(!f.available?.includes(putOnRequest)||f.available.includes('PutOnEquipResponse'))blockedReason='PROTOCOL_UNAVAILABLE';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){blockedReason=error.code??'COST_NOT_ALLOWED';}}
  const executable=blockedReason===null;
  return {
    module:'equipment-growth',actionId:'equipment-growth:PUT-ON:'+hash(target),actionType:'PUT-ON',parameters:p,target,
    ...(includePlanEvidence?{
      identity:executable?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,
      configEvidence:executable?Object.fromEntries(putOnTableNames.map(name=>[name,copy(config?.tables?.[name]??null)])):null,
    }:{}),
    beforeState:hero&&equipment?{...(includePlanEvidence?{hero:copy(hero)}:{}),equipment:copy(equipment)}:null,
    expectedState:equipment?{...target,equipId:equipment.equipId,level:equipment.level,star:equipment.star,refineLv:equipment.refineLv}:null,
    costs,costSource:putOnSource,budgetClaims:{resources:[],quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},
    executable,blockedReason,label:'装备穿戴 '+(p.heroId??'')+' '+(type??'')+' '+(p.uid??''),...(executable?{action}:{}),
  };
}
function viewPutOn(f,parameters,{config,moduleConfig}){
  const state=putOnState(f,config,parameters),options={config,moduleConfig,state,includePlanEvidence:false};
  // Do not cross-product the entire roster and idle equipment pool. Select one
  // explicit hero first; each candidate remains a single explicit UID.
  const choices=state?.byHero.has(parameters.heroId)&&!parameters.uid
    ?[...state.idle].map(uid=>({...parameters,uid})):[parameters];
  const candidates=(choices.length?choices:[parameters]).map(p=>putOnCandidate(f,p,options));
  return {module:'equipment-growth',heroes:copy(f?.ownership?.heroes??[]),bag:copy(f?.ownership?.bag??[]),candidates,
    blocked:candidates.filter(row=>!row.executable),notes:[...(f?.notes??[])],evidence:EQUIPMENT_PUT_ON_EVIDENCE};
}
export function viewEquipmentGrowth(f,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters=f?.parameters??{}}={}){
  parameters=validateEquipmentGrowthParameters(parameters);moduleConfig=validateEquipmentGrowthConfig(moduleConfig);if(isPutOn(parameters))return viewPutOn(f,parameters,{config,moduleConfig});const choices=[];
  for(const hero of f?.ownership?.heroes??[]){if(parameters.heroId&&hero.heroId!==parameters.heroId)continue;for(const equipment of hero.equips){if(parameters.uid&&equipment.uid!==parameters.uid)continue;choices.push({heroId:hero.heroId,uid:equipment.uid,...(isRefine(parameters)?{action:'refine'}:{})});}}
  if(!choices.length)choices.push(parameters);const candidates=choices.map(p=>candidate(f,p,{config,moduleConfig}));
  return {module:'equipment-growth',heroes:copy(f?.ownership?.heroes??[]),bag:copy(f?.ownership?.bag??[]),candidates,blocked:candidates.filter(row=>!row.executable),notes:[...(f?.notes??[])],evidence:EQUIPMENT_GROWTH_EVIDENCE};
}
export function planEquipmentGrowth(f,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null)}={}){
  if(selections!==undefined&&(!dense(selections)||selections.some(value=>!id(value))||new Set(selections).size!==selections.length))throw invalid('selections 必须为唯一 actionId 数组');
  const row=candidate(f,parameters,{config,moduleConfig});if(row.executable&&(selections===undefined||selections.includes(row.actionId))&&(!isPutOn(row.parameters)||putOnFresh(f))&&ledger.reserve(row.costs))return {module:'equipment-growth',actions:[row],notes:[]};return {module:'equipment-growth',actions:[],notes:[row.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
const without=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
function inventoriesMatch(b,a,costs){const debits=new Map(costs.map(row=>[row.id,row.num]));for(const key of new Set([...b.stock.keys(),...a.stock.keys()])){const before=b.stock.get(key)??0;if(before<(debits.get(key)??0)||(a.stock.get(key)??0)!==before-(debits.get(key)??0))return false;}return true;}
function verifyPutOn(op,b,a,p,config){
  const fail=reason=>({confirmed:false,reason}),before=putOnState(b,config,p),after=putOnState(a,config,p);
  if(!before||!after||!same(b.identityContext,a.identityContext))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(putOnFactKeys.some(key=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('EQUIPMENT_POST_READ_PREDATES_DISPATCH_BASELINE');
  const contract=putOnCandidate(b,p,{config,moduleConfig:{enabled:true},state:before});
  if(!contract.executable||['module','actionId','actionType','target','identity','action','beforeState','expectedState','costs','costSource','budgetClaims','configEvidence'].some(key=>!same(op[key],contract[key])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  const heroBefore=before.byHero.get(p.heroId).hero,heroAfter=after.byHero.get(p.heroId)?.hero,equipment=before.pool.get(p.uid);
  if(!heroAfter||!derivedReliable(heroAfter))return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const expected=[...heroBefore.equips,equipment].sort((x,y)=>x.uid.localeCompare(y.uid));
  if(!same(expected,heroAfter.equips)||after.idle.has(p.uid))return fail('EXACT_NEW_SLOT_OWNER_NOT_CONFIRMED');
  if(!same(without(heroBefore,['power','attributes','equips']),without(heroAfter,['power','attributes','equips']))||
     !same(b.ownership.heroes.filter(hero=>hero.heroId!==p.heroId),a.ownership.heroes.filter(hero=>hero.heroId!==p.heroId))||
     !same(b.ownership.pool,a.ownership.pool)||!same(b.ownership.bag.filter(row=>row.uid!==p.uid),a.ownership.bag))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!inventoriesMatch(b,a,[]))return fail('ZERO_COST_INVENTORY_UNCHANGED_NOT_CONFIRMED');
  if(!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:'完整 Equips 和 AllHero 复读确认原闲置 UID 穿到指定英雄的空槽，装备池及库存不变',afterState:{hero:copy(heroAfter),equipment:copy(equipment)},responseEvidence:null};
}
export function verifyEquipmentGrowth(op,b,a){
  const fail=reason=>({confirmed:false,reason});let p;try{p=validateEquipmentGrowthParameters(op?.parameters);resourceCosts(op?.costs);}catch{return fail('OPERATION_CONTRACT_INVALID');}
  const config={tables:Object.fromEntries(tablesFor(p).map(name=>[name,op?.configEvidence?.[name]??null]))};if(isPutOn(p))return verifyPutOn(op,b,a,p,config);if(!authority(b,config,p)||!authority(a,config,p)||!same(b.identityContext,a.identityContext))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  const contract=candidate(b,p,{config,moduleConfig:{enabled:true}});if(!contract.executable||op?.module!=='equipment-growth'||['target','identity','actionType','action','beforeState','expectedState','costs','costSource','budgetClaims'].some(key=>!same(op[key],contract[key])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  const before=b.ownership.heroes.find(hero=>hero.heroId===p.heroId),after=a.ownership.heroes.find(hero=>hero.heroId===p.heroId);if(!before||!after||!derivedReliable(before)||!derivedReliable(after))return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const equipment=b.ownership.pool.find(row=>row.uid===p.uid),refine=isRefine(p),expected={...copy(equipment),[refine?'refineLv':'level']:equipment[refine?'refineLv':'level']+1},afterEquipment=a.ownership.pool.find(row=>row.uid===p.uid);
  if(!same(expected,afterEquipment)||!same(expected,after.equips.find(row=>row.uid===p.uid)))return fail(refine?'EXACT_SINGLE_EQUIPMENT_REFINE_NOT_CONFIRMED':'EXACT_SINGLE_EQUIPMENT_LEVEL_NOT_CONFIRMED');
  if(!same(without(before,['power','attributes','equips']),without(after,['power','attributes','equips']))||!same(before.equips.filter(row=>row.uid!==p.uid),after.equips.filter(row=>row.uid!==p.uid)))return fail('NON_TARGET_HERO_FIELDS_CHANGED');
  if(!same(b.ownership.heroes.filter(hero=>hero.heroId!==p.heroId),a.ownership.heroes.filter(hero=>hero.heroId!==p.heroId))||!same(b.ownership.pool.filter(row=>row.uid!==p.uid),a.ownership.pool.filter(row=>row.uid!==p.uid))||!same(b.ownership.bag,a.ownership.bag)||!same(b.ownership.uids,a.ownership.uids))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!inventoriesMatch(b,a,contract.costs))return fail(refine?'EXACT_REFINE_DEBITS_OR_OTHER_INVENTORY_CHANGED':'EXACT_IRON_DEBIT_OR_OTHER_INVENTORY_CHANGED');
  return {confirmed:true,reason:refine?'新 Equips 与 AllHero 同UID同归属复读确认单次精炼+1、精铁及精炼石精确扣除；仅目标英雄权威power/attributes可变化':'新 Equips 与 AllHero 同UID同归属复读确认单次等级+1、精铁精确扣除；仅目标英雄权威power/attributes可变化',afterState:{hero:copy(after),equipment:copy(afterEquipment)},responseEvidence:null};
}
export function equipmentGrowthDependencyVersions({config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters={}}={}){parameters=validateEquipmentGrowthParameters(parameters);return {moduleConfig:copy(moduleConfig),...Object.fromEntries(tablesFor(parameters).map(name=>['config.'+name,copy(config?.tables?.[name]??null)]))};}
export const equipmentGrowthModule=Object.freeze({id:'equipment-growth',label:'装备单次升级',capabilities:Object.freeze(['C229']),defaultConfig:EQUIPMENT_GROWTH_DEFAULT_CONFIG,validateConfig:validateEquipmentGrowthConfig,validateParameters:validateEquipmentGrowthParameters,survey:surveyEquipmentGrowth,view:viewEquipmentGrowth,plan:planEquipmentGrowth,verify:verifyEquipmentGrowth,dependencyVersions:equipmentGrowthDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...tableNames.map(name=>'config.'+name),'config.EquipRefineCfg','config.ModuleOpenCfg'])});