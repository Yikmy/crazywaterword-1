// C229 single owned equipment LEVEL +1; BIZ-R09 RED REFINE +1 and empty-slot PUT-ON.
// Shared Service/executor owns transport, authorization, finite resource/UID
// budgets, cancellation and durable UNKNOWN.
import { createHash } from 'node:crypto';
import { parseEquipmentOwnership } from './equipment-forge.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';

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
const starTableNames=['EquipCfg','EquipAttrCfg','EquipUpStarCfg'];
const resultTableNames=['EquipCfg','ModuleOpenCfg','EquipRerollCfg'];
const rerollTableNames=[...resultTableNames,'EquipAttrCfg','EquipRandomAttrLibCfg','AdditionAttrOverviewCfg'];
const liveEquipmentFacts=new WeakMap();
const isIdle=p=>p?.ownership==='idle';
const hasTarget=p=>Boolean(p.uid&&(isIdle(p)||p.heroId));
const costSourceFor=(p,base)=>isIdle(p)?base+'; '+EQUIPMENT_IDLE_GROWTH_EVIDENCE.source:base;
const targetFields=p=>({heroId:p.heroId??null,uid:p.uid??null,...(isIdle(p)?{ownership:'idle'}:{})});
function equipmentTarget(f,p){const hero=isIdle(p)?null:f?.ownership?.heroes?.find(row=>row.heroId===p.heroId);return {hero,equipment:isIdle(p)?f?.ownership?.bag?.find(row=>row.uid===p.uid):hero?.equips?.find(row=>row.uid===p.uid)};}
const isReroll=p=>p?.action==='reroll';
const isRerollResult=p=>['save-reroll','discard-reroll'].includes(p?.action);
const isInitial=parameters=>parameters?.action==='initial-level';
const isStar=parameters=>parameters?.action==='star';
const isRefine=parameters=>parameters?.action==='refine';
const isPutOn=parameters=>parameters?.action==='put-on';
const isTakeOff=parameters=>parameters?.action==='take-off';
const isWearing=parameters=>isPutOn(parameters)||isTakeOff(parameters);
const tablesFor=parameters=>isReroll(parameters)?rerollTableNames:isRerollResult(parameters)?resultTableNames:isStar(parameters)?starTableNames:isWearing(parameters)?putOnTableNames:isRefine(parameters)?refineTableNames:tableNames;
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
const takeOffRequest='TakeOffEquipRequest',takeOffSource='v76 EquipSelectItem._onBtnTakeOff; EquipModel.fixupEquip/idleEquipsByType; exact selected hero and owned UID, zero cost';
export const EQUIPMENT_TAKE_OFF_EVIDENCE=Object.freeze({source:takeOffSource,requirement:'BIZ-H05/BIZ-R09',request:takeOffRequest,response:null,entrySha256:mainHash,itemSha256:'fe8af7f50756e0589fe161095f3de73a23745b5473c09722db1223299a2b5075',modelSha256:'b11a06b0209cf966d0c6634d3a74608971b0d574d035b36c8dd496aa8489c27b',scope:'EXPLICIT_WORN_UID_BACK_TO_IDLE_ONLY',realGame:'REAL_UNVERIFIED'});
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
export const EQUIPMENT_GROWTH_EVIDENCE=Object.freeze({source,request:'EnhanceEquipRequest',response:'NO_DEDICATED_RESPONSE',heroDerived:'SERVER_ALL_HERO_POWER_ATTRIBUTES_ONLY',levelZero:'EXPLICIT_WORN_ZERO_TO_ONE_CONFIGURED_FREE_ONLY',initialLevel:Object.freeze({parameter:'initial-level',fromLevel:0,toLevel:1,costTable:'EquipUpDecomposeCfg',costKey:1,upgradeCost:0,inventory:'UNCHANGED'}),refine:EQUIPMENT_REFINE_EVIDENCE,star:'EXPLICIT_RED_SINGLE_STAR',replace:'BLOCKED_EVIDENCE',universal:'EXCLUDED',realGame:'REAL_UNVERIFIED'});
function exactPositive(v){
  if(typeof v==='number'&&!Number.isSafeInteger(v))return null;const n=toSnapshotJson(v);
  if(!(typeof n==='number'&&Number.isSafeInteger(n))&&!(typeof n==='string'&&/^[1-9]\d*$/.test(n)))return null;
  try{const b=BigInt(n);return b>0n&&b<(1n<<63n)?b.toString():null;}catch{return null;}
}
export function validateEquipmentGrowthConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('装备升级配置仅允许 enabled 布尔值');return {enabled:v.enabled??false};}
export function validateEquipmentGrowthParameters(v={}){
  if(!fields(v,['heroId','uid','action','lockedSlots','ownership']))throw invalid('装备操作参数仅允许 heroId或显式ownership=idle、uid、reroll专用lockedSlots及可选 action=initial-level、refine、put-on、take-off、star、save-reroll、discard-reroll 或 reroll');const out={};
  if(own(v,'heroId')){if(!id(v.heroId))throw invalid('heroId 必须为明确英雄 ID');out.heroId=v.heroId;}
  if(own(v,'uid')){if(typeof v.uid!=='string'||exactPositive(v.uid)!==v.uid)throw invalid('uid 必须为精确正 int64 十进制字符串');out.uid=v.uid;}
  if(own(v,'action')){if(!['refine','put-on','star','initial-level','take-off','save-reroll','discard-reroll','reroll'].includes(v.action))throw invalid('action 仅允许 initial-level、refine、put-on、take-off、star、save-reroll、discard-reroll 或 reroll；省略保持单次等级升级');out.action=v.action;}
  if(own(v,'ownership')){if(v.ownership!=='idle'||own(v,'heroId')||isWearing(v))throw invalid('ownership仅允许明确idle且不传heroId，不用于穿戴/卸下');out.ownership='idle';}
  if(own(v,'lockedSlots')){
    const slots=v.lockedSlots;
    if(!isReroll(v)||!dense(slots)||Object.getPrototypeOf(slots)!==Array.prototype||slots.length>2||Reflect.ownKeys(slots).length!==slots.length+1||!Array.from({length:slots.length},(_,i)=>Object.getOwnPropertyDescriptor(slots,String(i))).every(d=>d?.enumerable&&own(d,'value')&&positive(d.value))||new Set(slots).size!==slots.length)throw invalid('装备单次洗炼只接受明确0至2个唯一原1基锁槽，不指定属性或补购');
    out.lockedSlots=[...slots].sort((a,b)=>a-b);
  }
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
const catalog=(config,parameters)=>isReroll(parameters)?rerollCatalog(config):isRerollResult(parameters)?resultCatalog(config):isStar(parameters)?starCatalog(config):isWearing(parameters)?putOnCatalog(config):isRefine(parameters)?refineCatalog(config):levelCatalog(config);
function contextOf(client,player){
  const playerIds=['id','playerId'].filter(key=>own(player,key)).map(key=>exactPositive(player[key]));
  return {accountId:id(client.factContext?.accountId)?client.factContext.accountId:null,generation:Number.isSafeInteger(client.factContext?.generation)&&client.factContext.generation>=0?client.factContext.generation:null,
    playerId:playerIds.length&&playerIds.every(value=>value!==null&&value===playerIds[0])?playerIds[0]:null,worldId:own(player,'worldId')?exactPositive(player.worldId):null};
}
function equipmentContext(client,player,parameters){
  const context=contextOf(client,player);
  if(isInitial(parameters)&&!isIdle(parameters))return {...context,connectionId:id(client.factContext?.connectionId)?client.factContext.connectionId:null};
  return (isIdle(parameters)||isReroll(parameters)||isRerollResult(parameters)||isWearing(parameters)||isStar(parameters))?{...context,
    connectionId:id(client.factContext?.connectionId)?client.factContext.connectionId:null,
    playerLevel:own(player,'level')&&positive(player.level)?player.level:null,
  }:context;
}
function derivedReliable(hero){return own(hero,'power')&&own(hero,'attributes')&&dense(hero.attributes)&&hero.attributes.length>0&&hero.attributes.every(row=>fields(row,['attr','value'])&&own(row,'attr')&&uint(row.attr)&&own(row,'value')&&typeof row.value==='number'&&Number.isFinite(row.value)&&(!Number.isInteger(row.value)||Number.isSafeInteger(row.value)))&&new Set(hero.attributes.map(row=>row.attr)).size===hero.attributes.length;}
const queries=[['EquipsRequest','EquipsResponse'],['AllHeroRequest','AllHeroResponse'],['AllItemRequest','AllItemResponse'],['AllResourceRequest','AllResourceResponse']];
export async function surveyEquipmentGrowth(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validateEquipmentGrowthParameters(parameters);const active=()=>assertExecutionActive(client,{signal,stop}),context=equipmentContext(client,player,parameters),notes=[];active();
  const responses=await Promise.all(queries.map(async([request,response])=>{active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return {value:null,sourceAt:Date.now()};}try{const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,{signal,stop});return {value,sourceAt:Date.now()};}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return {value:null,sourceAt:Date.now()};}}));
  let idleReply=null;
  if(isIdle(parameters)){
    active();idleReply={value:null,sourceAt:Date.now()};
    if(protocol?.EquipsRequest&&protocol?.EquipsResponse)try{idleReply={value:await awaitExecution(client.request('EquipsRequest',{},'EquipsResponse',timeout,{signal}),client,{signal,stop}),sourceAt:Date.now()};}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push('Idle EquipsResponse: STATE_UNKNOWN');}
  }
  active();if(!same(context,equipmentContext(client,player,parameters)))throw Object.assign(new Error('装备升级采集期间账号或代次改变'),{code:'CANCELLED'});
  const observed=responses.map(response=>response.value),inputs={equips:toSnapshotJson(observed[0]),heroes:toSnapshotJson(observed[1]),items:toSnapshotJson(observed[2]),resources:toSnapshotJson(observed[3])};
  if(isIdle(parameters))inputs.idleEquips=toSnapshotJson(idleReply.value);
  const rawOwnership=parseEquipmentOwnership(observed[0],observed[1]),ownership=rawOwnership===null?null:parseEquipmentOwnership(inputs.equips,inputs.heroes),rawInventory=parseOperationInventory(observed[2],observed[3]),inventory=rawInventory.stockReliable?parseOperationInventory(inputs.items,inputs.resources):rawInventory;
  // Each independent response retains its own completion time. A slow sibling
  // never refreshes an earlier observation; aggregate provenance uses the oldest.
  const provenance={accountId:context.accountId,generation:context.generation,scope:{kind:'ACCOUNT'}};
  const sourceFacts=Object.fromEntries(['equips','heroes','items','resources'].map((key,index)=>[key,createStateFact(inputs[key],{...provenance,source:queries[index][1],sourceAt:responses[index].sourceAt,reliable:index<2?ownership!==null:inventory.stockReliable})]));
  sourceFacts.ownership=createStateFact({equips:inputs.equips,heroes:inputs.heroes},{...provenance,source:'EquipsResponse+AllHeroResponse',sourceAt:Math.min(responses[0].sourceAt,responses[1].sourceAt),reliable:ownership!==null});
  sourceFacts.inventory=createStateFact({items:inputs.items,resources:inputs.resources},{...provenance,source:'AllItemResponse+AllResourceResponse',sourceAt:Math.min(responses[2].sourceAt,responses[3].sourceAt),reliable:inventory.stockReliable});
  if(isIdle(parameters))sourceFacts.idleEquips=createStateFact(inputs.idleEquips,{...provenance,source:'EquipsResponse',sourceAt:idleReply.sourceAt,reliable:ownership!==null&&same(parseEquipmentOwnership(idleReply.value,observed[1]),ownership)});
  const facts={module:'equipment-growth',parameters,identityContext:context,catalog:catalog(config,parameters),ownership,...inventory,inputs,sourceFacts,available:Object.keys(protocol??{}),notes,evidence:isIdle(parameters)?EQUIPMENT_IDLE_GROWTH_EVIDENCE:isReroll(parameters)?EQUIPMENT_REROLL_EVIDENCE:isRerollResult(parameters)?EQUIPMENT_REROLL_RESULT_EVIDENCE:isTakeOff(parameters)?EQUIPMENT_TAKE_OFF_EVIDENCE:isPutOn(parameters)?EQUIPMENT_PUT_ON_EVIDENCE:EQUIPMENT_GROWTH_EVIDENCE,state:{context,ownership}};
  if(isReroll(parameters)||isIdle(parameters))liveEquipmentFacts.set(facts,{enums:Object.fromEntries(Object.entries(protocol?.EnhanceAttr??{}).filter(([k,v])=>id(k)&&positive(v))),digest:hash({context,inputs})});
  return facts;
}
function authority(f,config,parameters){
  const c=f?.identityContext;if((isReroll(parameters)||isIdle(parameters))&&(!liveEquipmentFacts.has(f)||liveEquipmentFacts.get(f).digest!==hash({context:c,inputs:f.inputs})))return false;if(isInitial(parameters)&&!id(c?.connectionId))return false;if(!id(c?.accountId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||!f.catalog?.reliable||!same(f.catalog,catalog(config,parameters)))return false;
  const fresh=(key,source)=>f.sourceFacts?.[key]?.provenance?.source===source&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope:{kind:'ACCOUNT'}}).status==='FRESH';
  const inputs=f.inputs,ownership=parseEquipmentOwnership(inputs?.equips,inputs?.heroes),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
  if(isIdle(parameters)&&(!id(c.connectionId)||!positive(c.playerLevel)||!fresh('idleEquips','EquipsResponse')||!same(f.sourceFacts.idleEquips.value,inputs?.idleEquips)||!same(parseEquipmentOwnership(inputs?.idleEquips,inputs?.heroes),ownership)))return false;
  return ['equips','heroes','items','resources'].every((key,index)=>fresh(key,queries[index][1])&&same(f.sourceFacts[key].value,inputs?.[key]))&&f.sourceFacts.ownership?.provenance?.sourceAt===Math.min(f.sourceFacts.equips?.provenance?.sourceAt,f.sourceFacts.heroes?.provenance?.sourceAt)&&f.sourceFacts.inventory?.provenance?.sourceAt===Math.min(f.sourceFacts.items?.provenance?.sourceAt,f.sourceFacts.resources?.provenance?.sourceAt)&&fresh('ownership','EquipsResponse+AllHeroResponse')&&fresh('inventory','AllItemResponse+AllResourceResponse')&&same(f.sourceFacts.ownership.value,{equips:inputs.equips,heroes:inputs.heroes})&&same(f.sourceFacts.inventory.value,{items:inputs.items,resources:inputs.resources})&&ownership!==null&&same(ownership,f.ownership)&&inventory.stockReliable===true&&f.stockReliable===true&&f.stock instanceof Map&&same([...inventory.stock],[...f.stock]);
}
function candidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  p=validateEquipmentGrowthParameters(p);if(isReroll(p))return rerollCandidate(f,p,{config,moduleConfig});if(isRerollResult(p))return resultCandidate(f,p,{config,moduleConfig});if(isStar(p))return starCandidate(f,p,{config,moduleConfig});if(isWearing(p))return putOnCandidate(f,p,{config,moduleConfig});if(isRefine(p))return refineCandidate(f,p,{config,moduleConfig});moduleConfig=validateEquipmentGrowthConfig(moduleConfig);const {hero,equipment}=equipmentTarget(f,p),attr=f?.catalog?.attributes?.find(row=>row.id===equipment?.equipId&&row.star===(equipment?.equipId?.startsWith('绿')?0:equipment?.star)),nextLevel=equipment?equipment.level+1:null,row=f?.catalog?.levels?.find(value=>value.level===nextLevel);
  const initial=isInitial(p),costs=row&&safeResourceQuantity(row.upgradeCost)!==null&&row.upgradeCost>0?[{id:'精铁',num:row.upgradeCost}]:[],action={request:'EnhanceEquipRequest',response:null,body:{uid:p.uid},...(initial?{initialLevel:{source:'EquipUpDecomposeCfg.level1.free.v76',uid:p.uid,fromLevel:0,toLevel:1,upgradeCost:0}}:{})};let reason=null;
  if(!hasTarget(p))reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';else if(!authority(f,config,p))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';else if(!equipment||!isIdle(p)&&!hero)reason=isIdle(p)?'EXACT_IDLE_OWNED_EQUIPMENT_REQUIRED':'EXACT_WORN_EQUIPMENT_REQUIRED';else if(!isIdle(p)&&!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';else if(initial?equipment.level!==0:equipment.level<1)reason=initial?'EXACT_ZERO_LEVEL_REQUIRED':'LEVEL_ZERO_OUTSIDE_SINGLE_UPGRADE_SCOPE';else if(!attr||!row)reason='EQUIPMENT_LEVEL_OR_CAP_CONFIG_UNKNOWN';else if(nextLevel>attr.maxLv)reason='EQUIPMENT_MAX_LEVEL';else if(initial?(row.level!==1||row.upgradeCost!==0||costs.length!==0):(!positive(row.upgradeCost)||costs.length!==1))reason=initial?'EXACT_CONFIGURED_FREE_FIRST_LEVEL_REQUIRED':'POSITIVE_EXACT_IRON_COST_REQUIRED';else if(!f.available?.includes(action.request))reason='PROTOCOL_UNAVAILABLE';else if((f.stock.get('精铁')??0)<row.upgradeCost)reason='IRON_STOCK_INSUFFICIENT';else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target=targetFields(p),beforeState=equipment&&(isIdle(p)||hero)?{hero:copy(hero),equipment:copy(equipment)}:null,expectedState=equipment?{heroId:p.heroId,uid:equipment.uid,equipId:equipment.equipId,level:nextLevel,star:equipment.star,refineLv:equipment.refineLv}:null;
  return {module:'equipment-growth',actionId:'equipment-growth:'+(initial?'INITIAL_LEVEL':'LEVEL')+':'+hash(target),actionType:initial?'INITIAL_LEVEL':'LEVEL',parameters:p,target,identity:equipment&&(isIdle(p)||hero)?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,configEvidence:Object.fromEntries(tablesFor(p).map(name=>[name,copy(config?.tables?.[name]??null)])),beforeState,expectedState,costs,costSource:costSourceFor(p,source),budgetClaims:{resources:copy(costs),quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},executable:reason===null,blockedReason:reason,label:(initial?'装备首次升级 ':'装备升级 ')+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
function refineCandidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  moduleConfig=validateEquipmentGrowthConfig(moduleConfig);
  const {hero,equipment}=equipmentTarget(f,p),eq=f?.catalog?.equips?.find(row=>row.id===equipment?.equipId),attr=f?.catalog?.attributes?.find(row=>row.id===equipment?.equipId&&row.star===equipment?.star),nextRefine=equipment?equipment.refineLv+1:null,row=f?.catalog?.refines?.find(value=>value.level===nextRefine);
  const costs=row&&positive(row.costItem1)&&positive(row.costItem2)?[{id:'精铁',num:row.costItem1},{id:'精炼石',num:row.costItem2}]:[],action={request:'EquipRefineRequest',response:null,body:{uid:p.uid}};let reason=null;
  if(!hasTarget(p))reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';else if(!authority(f,config,p))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';else if(!equipment||!isIdle(p)&&!hero)reason=isIdle(p)?'EXACT_IDLE_OWNED_EQUIPMENT_REQUIRED':'EXACT_WORN_EQUIPMENT_REQUIRED';else if(!isIdle(p)&&!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';else if(equipment.level<1)reason='LEVEL_ZERO_OUTSIDE_SINGLE_UPGRADE_SCOPE';else if(!eq||eq.quality!=='RED')reason='RED_EQUIPMENT_REQUIRED';else if(!attr)reason='EQUIPMENT_REFINE_OR_CAP_CONFIG_UNKNOWN';else if(nextRefine>attr.maxRefineLv)reason='EQUIPMENT_MAX_REFINE';else if(!row||costs.length!==2)reason='POSITIVE_EXACT_REFINE_COSTS_REQUIRED';else if(!f.available?.includes(action.request))reason='PROTOCOL_UNAVAILABLE';else if(costs.some(cost=>(f.stock.get(cost.id)??0)<cost.num))reason='REFINE_MATERIAL_STOCK_INSUFFICIENT';else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target=targetFields(p),beforeState=equipment&&(isIdle(p)||hero)?{hero:copy(hero),equipment:copy(equipment)}:null,expectedState=equipment?{heroId:p.heroId,uid:equipment.uid,equipId:equipment.equipId,level:equipment.level,star:equipment.star,refineLv:nextRefine}:null;
  return {module:'equipment-growth',actionId:'equipment-growth:REFINE:'+hash(target),actionType:'REFINE',parameters:p,target,identity:equipment&&(isIdle(p)||hero)?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,configEvidence:Object.fromEntries(tablesFor(p).map(name=>[name,copy(config?.tables?.[name]??null)])),beforeState,expectedState,costs,costSource:costSourceFor(p,refineSource),budgetClaims:{resources:copy(costs),quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},executable:reason===null,blockedReason:reason,label:'装备精炼 '+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
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
  const taking=isTakeOff(p),request=taking?takeOffRequest:putOnRequest;
  const slotOwner=state?.byHero.get(p.heroId),hero=slotOwner?.hero,equipment=state?.pool.get(p.uid),type=equipment?state.types.get(equipment.equipId):null;
  const target={heroId:p.heroId??null,uid:p.uid??null,type},costs=[];
  const action={request,response:null,body:{uid:p.uid,heroId:p.heroId}};
  let blockedReason=null;
  if(!p.heroId||!p.uid)blockedReason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';
  else if(!moduleConfig.enabled)blockedReason='EQUIPMENT_GROWTH_MODULE_DISABLED';
  else if(!state)blockedReason='EQUIPMENT_AUTHORITY_OR_SLOT_CONFIG_UNKNOWN';
  else if(f.identityContext.playerLevel<f.catalog.playerLevel)blockedReason='EQUIPMENT_MODULE_LEVEL_LOCKED';
  else if(taking&&(!hero||!equipment||state.idle.has(p.uid)||!hero.equips.some(row=>row.uid===p.uid)))blockedReason='EXACT_WORN_EQUIPMENT_OWNER_REQUIRED';
  else if(!taking&&(!hero||!equipment||!state.idle.has(p.uid)))blockedReason='EXACT_IDLE_OWNED_EQUIPMENT_REQUIRED';
  else if(!taking&&slotOwner.occupied.has(type))blockedReason='EQUIPMENT_SLOT_NOT_EMPTY';
  else if(!derivedReliable(hero))blockedReason='TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if(!f.available?.includes(request)||f.available.includes(taking?'TakeOffEquipResponse':'PutOnEquipResponse'))blockedReason='PROTOCOL_UNAVAILABLE';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){blockedReason=error.code??'COST_NOT_ALLOWED';}}
  const executable=blockedReason===null;
  return {
    module:'equipment-growth',actionId:'equipment-growth:'+(taking?'TAKE-OFF':'PUT-ON')+':'+hash(target),actionType:taking?'TAKE-OFF':'PUT-ON',parameters:p,target,
    ...(includePlanEvidence?{
      identity:executable?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,
      configEvidence:executable?Object.fromEntries(putOnTableNames.map(name=>[name,copy(config?.tables?.[name]??null)])):null,
    }:{}),
    beforeState:hero&&equipment?{...(includePlanEvidence?{hero:copy(hero)}:{}),equipment:copy(equipment)}:null,
    expectedState:equipment?{...target,equipId:equipment.equipId,level:equipment.level,star:equipment.star,refineLv:equipment.refineLv}:null,
    costs,costSource:taking?takeOffSource:putOnSource,budgetClaims:{resources:[],quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},
    executable,blockedReason,label:(taking?'装备卸下 ':'装备穿戴 ')+(p.heroId??'')+' '+(type??'')+' '+(p.uid??''),...(executable?{action}:{}),
  };
}
function viewPutOn(f,parameters,{config,moduleConfig}){
  const state=putOnState(f,config,parameters),options={config,moduleConfig,state,includePlanEvidence:false};
  // Do not cross-product the entire roster and idle equipment pool. Select one
  // explicit hero first; each candidate remains a single explicit UID.
  const choices=state?.byHero.has(parameters.heroId)&&!parameters.uid
    ?(isTakeOff(parameters)?state.byHero.get(parameters.heroId).hero.equips.map(row=>row.uid):[...state.idle]).map(uid=>({...parameters,uid})):[parameters];
  const candidates=(choices.length?choices:[parameters]).map(p=>putOnCandidate(f,p,options));
  return {module:'equipment-growth',heroes:copy(f?.ownership?.heroes??[]),bag:copy(f?.ownership?.bag??[]),candidates,
    blocked:candidates.filter(row=>!row.executable),notes:[...(f?.notes??[])],evidence:isTakeOff(parameters)?EQUIPMENT_TAKE_OFF_EVIDENCE:EQUIPMENT_PUT_ON_EVIDENCE};
}
export function viewEquipmentGrowth(f,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters=f?.parameters??{}}={}){
  parameters=validateEquipmentGrowthParameters(parameters);moduleConfig=validateEquipmentGrowthConfig(moduleConfig);if(isWearing(parameters))return viewPutOn(f,parameters,{config,moduleConfig});const choices=[];
  if(isIdle(parameters)){for(const equipment of f?.ownership?.bag??[]){if(parameters.uid&&equipment.uid!==parameters.uid)continue;choices.push({...parameters,uid:equipment.uid});}}else
  for(const hero of f?.ownership?.heroes??[]){if(parameters.heroId&&hero.heroId!==parameters.heroId)continue;for(const equipment of hero.equips){if(parameters.uid&&equipment.uid!==parameters.uid)continue;choices.push({heroId:hero.heroId,uid:equipment.uid,...((isInitial(parameters)||isRefine(parameters)||isStar(parameters)||isRerollResult(parameters)||isReroll(parameters))?{action:parameters.action,...(own(parameters,'lockedSlots')?{lockedSlots:copy(parameters.lockedSlots)}:{})}:{})});}}
  if(!choices.length)choices.push(parameters);const candidates=choices.map(p=>candidate(f,p,{config,moduleConfig}));
  const rerollLocks=isReroll(parameters)&&authority(f,config,parameters)?choices.filter(p=>hasTarget(p)).map(p=>{const {hero,equipment}=equipmentTarget(f,p),eq=f.catalog.equips.find(r=>r.id===equipment?.equipId);return {...targetFields(p),maxLocks:f.catalog.results.some(r=>r.quality===eq?.qualityIndex&&r.star===equipment?.star&&r.lockCount===1)?2:0,slots:copy(equipment?.attr??[])};}):null;
  return {module:'equipment-growth',heroes:copy(f?.ownership?.heroes??[]),bag:copy(f?.ownership?.bag??[]),...(rerollLocks?{rerollLocks}:{}),candidates,blocked:candidates.filter(row=>!row.executable),notes:[...(f?.notes??[])],evidence:isIdle(parameters)?EQUIPMENT_IDLE_GROWTH_EVIDENCE:isReroll(parameters)?EQUIPMENT_REROLL_EVIDENCE:isRerollResult(parameters)?EQUIPMENT_REROLL_RESULT_EVIDENCE:EQUIPMENT_GROWTH_EVIDENCE};
}
export function validateEquipmentGrowthPreparation(value){
 if(!fields(value,['targets','maxDurationMs'])||Reflect.ownKeys(value).length!==2||!dense(value.targets)||Object.getPrototypeOf(value.targets)!==Array.prototype||Reflect.ownKeys(value.targets).length!==value.targets.length+1||!Array.from({length:value.targets.length},(_,i)=>Object.getOwnPropertyDescriptor(value.targets,i)).every(d=>d?.enumerable&&own(d,'value'))||value.targets.length<1||value.targets.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('装备组合须明确1至24个UID及有限总时长');
 const targets=value.targets.map(row=>{const p=validateEquipmentGrowthParameters(row);if(!hasTarget(p))throw invalid('组合须明确原英雄或ownership=idle及装备UID；仅支持原单次成长、空槽穿戴或明确卸下');return p;});
 if(new Set(targets.map(p=>p.uid)).size!==targets.length||targets.some(p=>(p.action??'level')!==(targets[0].action??'level')))throw invalid('装备UID不得重复，同批须为同一种成长动作');return {targets,maxDurationMs:value.maxDurationMs};
}
export function prepareEquipmentGrowthWorkflow(f,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,...input}={}){
 const p=validateEquipmentGrowthPreparation(input),nodes=[{id:'start',type:'START'}],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null);
 if((f?.parameters?.action??'level')!==(p.targets[0].action??'level')||isIdle(f?.parameters)!==isIdle(p.targets[0])||p.targets.some(v=>isIdle(v)!==isIdle(p.targets[0])))throw invalid('装备组合原采集模式不一致，不跨配置或业务来源');
 const steps=p.targets.map((parameters,i)=>{const row=candidate(f,parameters,{config,moduleConfig}),plan=planEquipmentGrowth(f,{config,moduleConfig,parameters,selections:[row.actionId],ledger});
  if(!row.executable||plan.actions.length!==1)throw invalid('所选装备无当前成长资格或共享自有材料不足；须重新调查并明确选择');
  const selection={unique:true};nodes.push({id:'grow-'+i,type:'ACTION',module:'equipment-growth',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'equipment-growth'});return {parameters,selection,target:copy(row.target),costs:copy(row.costs),budgetClaims:copy(row.budgetClaims)};
 });if(isPutOn(p.targets[0])&&new Set(steps.map(row=>row.target.heroId+':'+row.target.type)).size!==steps.length)throw invalid('同一英雄的同一装备部位每批仅穿戴一次，不替换已有装备');nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...p,steps,budget,graph:{version:1,id:'equipment-growths-'+hash({p,steps,budget}).slice(0,20),name:isIdle(p.targets[0])?'明确自有闲置装备逐件单次养成':isReroll(p.targets[0])?'明确已佩戴装备逐件单次材料洗炼':isRerollResult(p.targets[0])?'明确已佩戴装备逐件选择当前洗炼结果':isTakeOff(p.targets[0])?'明确已佩戴装备逐件卸下':isPutOn(p.targets[0])?'明确闲置装备逐空槽穿戴':'明确已佩戴装备逐件单次成长',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['equipment-growth']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:isIdle(p.targets[0])?'仅明确ownership=idle和UID的当前自有闲置装备，每UID一种原动作一次；双独立完整装备池及全英雄归属确认，所有英雄保持，原材料/配置及父资源/UID预算、逐项授权、History/取消/UNKNOWN复用，不穿戴/转移/继承/分解/补购/自动续跑。':isReroll(p.targets[0])?'每个已佩戴UID仅洗炼一次，原0至2锁槽和精确自有材料累计核算。结果仅待选，每件重新调查及单次授权，沿用父资源/UID预算与History/取消/UNKNOWN；不自动保存、循环或补购，不重放。':isRerollResult(p.targets[0])?'每个已佩戴UID仅保存或放弃当前完整待选结果一次，显式零支出；每项重新调查、原预览和单次授权，沿用父UID预算及History/取消/UNKNOWN，不发起新洗炼、不自动保存或重放。':isTakeOff(p.targets[0])?'仅明确已佩戴UID从原英雄卸下回闲置池，每UID一次，零资源支出。完整装备池/非目标和库存保持；各项重新调查及单次授权，原父UID预算、History/取消及UNKNOWN不重放。不替换、转移、分解或返还材料。':isPutOn(p.targets[0])?'仅明确闲置自有UID穿入当前已证空部位，每UID及英雄/部位一次。复用原PutOnEquip单项计划、模块等级/归属/部位资格及完整装备池、英雄镜像和库存不变验证；父UID固定，零资源支出，每项重新调查及单次授权，拒绝或UNKNOWN停止。不替换、转移、分解或补购，重启不续跑。':'同批仅一种原成长动作，每个已佩戴UID只执行一次；原candidate/planEquipmentGrowth及共享ResourceLedger累计核自有材料，原等级/精炼/升星成本与完整英雄装备/库存验证保持。每件重新调查、预览和单次授权，父资源和UID固定，不以预计成长扩额度；资格变化、拒绝或UNKNOWN停止，不替换/转移/分解/补购，不重发或恢复执行。'};
}

export function planEquipmentGrowth(f,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null)}={}){
  if(selections!==undefined&&(!dense(selections)||selections.some(value=>!id(value))||new Set(selections).size!==selections.length))throw invalid('selections 必须为唯一 actionId 数组');
  const row=candidate(f,parameters,{config,moduleConfig});if(row.executable&&(selections===undefined||selections.includes(row.actionId))&&(!isWearing(row.parameters)||putOnFresh(f))&&ledger.reserve(row.costs))return {module:'equipment-growth',actions:[row],notes:[]};return {module:'equipment-growth',actions:[],notes:[row.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
const without=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
function verifyPutOn(op,b,a,p,config){
  const fail=reason=>({confirmed:false,reason}),before=putOnState(b,config,p),after=putOnState(a,config,p);
  if(!before||!after||!same(b.identityContext,a.identityContext))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(putOnFactKeys.some(key=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('EQUIPMENT_POST_READ_PREDATES_DISPATCH_BASELINE');
  const contract=putOnCandidate(b,p,{config,moduleConfig:{enabled:true},state:before});
  if(!contract.executable||['module','actionId','actionType','target','identity','action','beforeState','expectedState','costs','costSource','budgetClaims','configEvidence'].some(key=>!same(op[key],contract[key])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  const heroBefore=before.byHero.get(p.heroId).hero,heroAfter=after.byHero.get(p.heroId)?.hero,equipment=before.pool.get(p.uid);
  if(!heroAfter||!derivedReliable(heroAfter))return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const taking=isTakeOff(p),expected=(taking?heroBefore.equips.filter(row=>row.uid!==p.uid):[...heroBefore.equips,equipment]).sort((x,y)=>x.uid.localeCompare(y.uid));
  if(!same(expected,heroAfter.equips)||after.idle.has(p.uid)!==taking)return fail(taking?'EXACT_REMOVED_SLOT_AND_IDLE_UID_NOT_CONFIRMED':'EXACT_NEW_SLOT_OWNER_NOT_CONFIRMED');
  if(!same(without(heroBefore,['power','attributes','equips']),without(heroAfter,['power','attributes','equips']))||
     !same(b.ownership.heroes.filter(hero=>hero.heroId!==p.heroId),a.ownership.heroes.filter(hero=>hero.heroId!==p.heroId))||
     !same(b.ownership.pool,a.ownership.pool)||!same(taking?[...b.ownership.bag,equipment].sort((x,y)=>x.uid.localeCompare(y.uid)):b.ownership.bag.filter(row=>row.uid!==p.uid),a.ownership.bag))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!stockMatchesDelta(b.stock,a.stock,[],[]))return fail('ZERO_COST_INVENTORY_UNCHANGED_NOT_CONFIRMED');
  if(!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:taking?'完整Equips和AllHero复读确认指定英雄仅移除选定装备UID，该装备完整状态回闲置池，池及库存保持；仅目标power/attributes可派生变化':'完整 Equips 和 AllHero 复读确认原闲置 UID 穿到指定英雄的空槽，装备池及库存不变',afterState:{hero:copy(heroAfter),equipment:copy(equipment)},responseEvidence:null};
}
export function verifyEquipmentGrowth(op,b,a){
  const fail=reason=>({confirmed:false,reason});let p;try{p=validateEquipmentGrowthParameters(op?.parameters);resourceCosts(op?.costs);}catch{return fail('OPERATION_CONTRACT_INVALID');}
  const config={tables:Object.fromEntries(tablesFor(p).map(name=>[name,op?.configEvidence?.[name]??null]))};if(isReroll(p))return verifyReroll(op,b,a,p,config);if(isRerollResult(p))return verifyResult(op,b,a,p,config);if(isStar(p))return verifyStar(op,b,a,p,config);if(isWearing(p))return verifyPutOn(op,b,a,p,config);if(!authority(b,config,p)||!authority(a,config,p)||!same(b.identityContext,a.identityContext))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(isInitial(p)&&putOnFactKeys.some(key=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('EQUIPMENT_POST_READ_PREDATES_DISPATCH_BASELINE');
  const contract=candidate(b,p,{config,moduleConfig:{enabled:true}});if(!contract.executable||op?.module!=='equipment-growth'||['target','identity','actionType','action','beforeState','expectedState','costs','costSource','budgetClaims'].some(key=>!same(op[key],contract[key])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  if(isIdle(p))return verifyIdleSettlement(b,a,p,contract);
  const before=b.ownership.heroes.find(hero=>hero.heroId===p.heroId),after=a.ownership.heroes.find(hero=>hero.heroId===p.heroId);if(!before||!after||!derivedReliable(before)||!derivedReliable(after))return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const equipment=b.ownership.pool.find(row=>row.uid===p.uid),refine=isRefine(p),expected={...copy(equipment),[refine?'refineLv':'level']:equipment[refine?'refineLv':'level']+1},afterEquipment=a.ownership.pool.find(row=>row.uid===p.uid);
  if(!same(expected,afterEquipment)||!same(expected,after.equips.find(row=>row.uid===p.uid)))return fail(refine?'EXACT_SINGLE_EQUIPMENT_REFINE_NOT_CONFIRMED':'EXACT_SINGLE_EQUIPMENT_LEVEL_NOT_CONFIRMED');
  if(!same(without(before,['power','attributes','equips']),without(after,['power','attributes','equips']))||!same(before.equips.filter(row=>row.uid!==p.uid),after.equips.filter(row=>row.uid!==p.uid)))return fail('NON_TARGET_HERO_FIELDS_CHANGED');
  if(!same(b.ownership.heroes.filter(hero=>hero.heroId!==p.heroId),a.ownership.heroes.filter(hero=>hero.heroId!==p.heroId))||!same(b.ownership.pool.filter(row=>row.uid!==p.uid),a.ownership.pool.filter(row=>row.uid!==p.uid))||!same(b.ownership.bag,a.ownership.bag)||!same(b.ownership.uids,a.ownership.uids))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail(refine?'EXACT_REFINE_DEBITS_OR_OTHER_INVENTORY_CHANGED':'EXACT_IRON_DEBIT_OR_OTHER_INVENTORY_CHANGED');
  return {confirmed:true,reason:refine?'新 Equips 与 AllHero 同UID同归属复读确认单次精炼+1、精铁及精炼石精确扣除；仅目标英雄权威power/attributes可变化':isInitial(p)?'新 Equips 与 AllHero 同UID同归属复读确认首次0→1，完整库存不变；仅目标英雄权威power/attributes可变化':'新 Equips 与 AllHero 同UID同归属复读确认单次等级+1、精铁精确扣除；仅目标英雄权威power/attributes可变化',afterState:{hero:copy(after),equipment:copy(afterEquipment)},responseEvidence:null};
}
export function equipmentGrowthDependencyVersions({config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG,parameters={}}={}){parameters=validateEquipmentGrowthParameters(parameters);return {moduleConfig:copy(moduleConfig),...Object.fromEntries(tablesFor(parameters).map(name=>['config.'+name,copy(config?.tables?.[name]??null)]))};}
export const equipmentGrowthModule=Object.freeze({id:'equipment-growth',label:'装备单次升级',capabilities:Object.freeze(['C229']),defaultConfig:EQUIPMENT_GROWTH_DEFAULT_CONFIG,validateConfig:validateEquipmentGrowthConfig,validateParameters:validateEquipmentGrowthParameters,survey:surveyEquipmentGrowth,view:viewEquipmentGrowth,plan:planEquipmentGrowth,verify:verifyEquipmentGrowth,rejectionIdentity:businessRejectionIdentityFromHistory,dependencyVersions:equipmentGrowthDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...tableNames.map(name=>'config.'+name),'config.EquipRefineCfg','config.ModuleOpenCfg','config.EquipUpStarCfg','config.EquipRerollCfg','config.EquipRandomAttrLibCfg','config.AdditionAttrOverviewCfg'])});

// The fixed EquipDetailPop/EquipUtil modules already referenced above use
// EquipUpStarCfg[nextStar].upCosts; EquipPreviewStarUp is display-only.
const starSource='v76 EquipDetailPop._refreshUpStarInfo/_requestUpStar; EquipUtil.isEquipStarUp/getEquipStarUpCostCfg; EquipUpStarCfg[nextStar].upCosts; RED only, maxStar=5; target attr observed from matching full pool/hero mirrors only';
function starCatalog(config){
  const equips=config?.tables?.EquipCfg?.data,attributes=config?.tables?.EquipAttrCfg?.data,stars=config?.tables?.EquipUpStarCfg?.data;
  const bad=()=>({reliable:false,equips:[],attributes:[],stars:[]});
  if(![equips,attributes,stars].every(value=>dense(value)&&value.length>0))return bad();
  if(!equips.every(row=>own(row,'id')&&id(row.id)&&own(row,'type')&&equipTypes.includes(row.type)&&own(row,'quality')&&['GREEN','BLUE','PURPLE','ORANGE','RED'].includes(row.quality))||new Set(equips.map(row=>row.id)).size!==equips.length)return bad();
  if(!attributes.every(row=>own(row,'id')&&equips.some(item=>item.id===row.id)&&own(row,'star')&&configStar(row.star)!==null&&own(row,'maxLv')&&positive(row.maxLv)&&own(row,'maxRefineLv')&&uint(row.maxRefineLv))||new Set(attributes.map(row=>row.id+':'+configStar(row.star))).size!==attributes.length)return bad();
  const ids=['装备升星石','精铁'];
  if(!stars.every(row=>own(row,'star')&&positive(row.star)&&row.star<=5&&own(row,'upCosts')&&dense(row.upCosts)&&row.upCosts.length===2&&row.upCosts.every((pair,index)=>dense(pair)&&pair.length===2&&pair[0]===ids[index]&&positive(pair[1])))||new Set(stars.map(row=>row.star)).size!==stars.length)return bad();
  return {reliable:true,equips:equips.map(({id,type,quality})=>({id,type,quality})).sort((a,b)=>a.id.localeCompare(b.id)),attributes:attributes.map(row=>({id:row.id,star:configStar(row.star),maxLv:row.maxLv,maxRefineLv:row.maxRefineLv})).sort((a,b)=>a.id.localeCompare(b.id)||a.star-b.star),stars:stars.map(row=>({star:row.star,upCosts:copy(row.upCosts)})).sort((a,b)=>a.star-b.star)};
}
function starCandidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  moduleConfig=validateEquipmentGrowthConfig(moduleConfig);
  const {hero,equipment}=equipmentTarget(f,p);
  const cfg=f?.catalog?.equips?.find(row=>row.id===equipment?.equipId),nextStar=equipment?equipment.star+1:null,row=f?.catalog?.stars?.find(row=>row.star===nextStar);
  const current=f?.catalog?.attributes?.find(row=>row.id===equipment?.equipId&&row.star===equipment?.star),next=f?.catalog?.attributes?.find(row=>row.id===equipment?.equipId&&row.star===nextStar);
  const costs=row&&dense(row.upCosts)&&row.upCosts.length===2&&row.upCosts.every((pair,index)=>dense(pair)&&pair.length===2&&pair[0]===['装备升星石','精铁'][index]&&positive(pair[1]))?resourceCosts(row.upCosts):[],action={request:'EquipStarUpRequest',response:null,body:{uid:p.uid}},target=targetFields(p);
  let reason=null;
  if(!hasTarget(p))reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';
  else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';
  else if(!id(f?.identityContext?.connectionId)||!positive(f.identityContext.playerLevel)||!authority(f,config,p)||!putOnFresh(f))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(!equipment||!isIdle(p)&&!hero)reason=isIdle(p)?'EXACT_IDLE_OWNED_EQUIPMENT_REQUIRED':'EXACT_WORN_EQUIPMENT_REQUIRED';
  else if(!isIdle(p)&&!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if(!cfg||cfg.quality!=='RED')reason='RED_EQUIPMENT_REQUIRED';
  else if(equipment.star>=5)reason='EQUIPMENT_MAX_STAR';
  else if(!positive(equipment.level)||!current||!next||equipment.level>current.maxLv||equipment.refineLv>current.maxRefineLv||equipment.level>next.maxLv||equipment.refineLv>next.maxRefineLv)reason='EQUIPMENT_STAR_OR_CAP_CONFIG_UNKNOWN';
  else if(!row||costs.length!==2)reason='POSITIVE_EXACT_STAR_COSTS_REQUIRED';
  else if(!f.available?.includes(action.request))reason='PROTOCOL_UNAVAILABLE';
  else if(costs.some(cost=>(f.stock.get(cost.id)??0)<cost.num))reason='STAR_MATERIAL_STOCK_INSUFFICIENT';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  return {module:'equipment-growth',actionId:'equipment-growth:STAR:'+hash(target),actionType:'STAR',parameters:p,target,
    identity:equipment&&(isIdle(p)||hero)?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence:Object.fromEntries(tablesFor(p).map(name=>[name,copy(config?.tables?.[name]??null)])),
    beforeState:equipment&&(isIdle(p)||hero)?{hero:copy(hero),equipment:copy(equipment)}:null,
    expectedState:reason===null?{heroId:p.heroId,uid:p.uid,equipId:equipment.equipId,level:equipment.level,star:nextStar,refineLv:equipment.refineLv}:null,
    costs,costSource:costSourceFor(p,starSource),budgetClaims:{resources:copy(costs),quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},
    executable:reason===null,blockedReason:reason,label:'红装单次升星 '+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
function verifyStar(op,b,a,p,config){
  const fail=reason=>({confirmed:false,reason});
  if(!authority(b,config,p)||!authority(a,config,p)||!same(b.identityContext,a.identityContext)||!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(putOnFactKeys.some(key=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('EQUIPMENT_POST_READ_PREDATES_DISPATCH_BASELINE');
  const contract=starCandidate(b,p,{config,moduleConfig:{enabled:true}});
  if(!contract.executable||['module','actionId','actionType','target','identity','action','beforeState','expectedState','costs','costSource','budgetClaims','configEvidence'].some(key=>!same(op[key],contract[key])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  if(isIdle(p))return verifyIdleSettlement(b,a,p,contract);
  const before=b.ownership.heroes.find(hero=>hero.heroId===p.heroId),after=a.ownership.heroes.find(hero=>hero.heroId===p.heroId),equipment=b.ownership.pool.find(row=>row.uid===p.uid),afterEquipment=a.ownership.pool.find(row=>row.uid===p.uid);
  if(!after||!afterEquipment||!derivedReliable(after))return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  // Star growth may alter the target's random attributes. Values come solely
  // from two agreeing complete authority mirrors, never the preview message.
  const expected={...copy(equipment),star:equipment.star+1,attr:copy(afterEquipment.attr)};
  if(!same(expected,afterEquipment)||!same(expected,after.equips.find(row=>row.uid===p.uid)))return fail('EXACT_SINGLE_EQUIPMENT_STAR_NOT_CONFIRMED');
  if(!same(without(before,['power','attributes','equips']),without(after,['power','attributes','equips']))||!same(before.equips.filter(row=>row.uid!==p.uid),after.equips.filter(row=>row.uid!==p.uid)))return fail('NON_TARGET_HERO_FIELDS_CHANGED');
  if(!same(b.ownership.heroes.filter(hero=>hero.heroId!==p.heroId),a.ownership.heroes.filter(hero=>hero.heroId!==p.heroId))||!same(b.ownership.pool.filter(row=>row.uid!==p.uid),a.ownership.pool.filter(row=>row.uid!==p.uid))||!same(b.ownership.bag,a.ownership.bag)||!same(b.ownership.uids,a.ownership.uids))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('EXACT_STAR_DEBITS_OR_OTHER_INVENTORY_CHANGED');
  if(!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:'新 Equips 与 AllHero 双重完整复读确认同UID单次升星、原归属和等级/精炼/洗练不变，升星石及精铁精确净扣；目标随机属性及英雄派生数值仅保留服务器观察',afterState:{hero:copy(after),equipment:copy(afterEquipment)},responseEvidence:null};
}

// Reuse the same strict server-derived hero field shape in other growth domains.
export { derivedReliable as heroDerivedStateReliable };

// Original EquipRerollPanel.refreshItem displays attr (left) and rerollAttrs
// (right); _requestEquipRerollAttr sends only uid/saveOrNot. No result is
// invented here: the full current pending array is bound into the original plan.
const resultSource='v76 EquipRerollPanel.refreshItem/_onClickSave/_onClickCancel/_requestEquipRerollAttr; EquipUtil.equipReroll quality_star_lockCount; explicit owned worn UID and current pending result; zero cost';
export const EQUIPMENT_REROLL_RESULT_EVIDENCE=Object.freeze({source:resultSource,requirement:'BIZ-H05/BIZ-R09',entrySha256:mainHash,panelSha256:'76041b930d57fe6a70f74c2b12be9f61321e975ca47aa652311d82497fe7e4fc',utilSha256:'eee5b62dd7bd3295b60c062ed12986073b55fca1fad85018af07716c41e9ea9b',request:'SaveEquipRerollRequest',response:null,scope:'EXPLICIT_WORN_UID_CURRENT_PENDING_SAVE_OR_DISCARD_ONLY',realGame:'REAL_UNVERIFIED'});
function resultCatalog(config){
  const base=putOnCatalog(config),equips=config?.tables?.EquipCfg?.data,rows=config?.tables?.EquipRerollCfg?.data;
  const bad=()=>({reliable:false,equips:[],results:[],playerLevel:null});
  if(!base.reliable||!equips.every(r=>['GREEN','BLUE','PURPLE','ORANGE','RED'].includes(r.quality)&&r.qualityIndex===['GREEN','BLUE','PURPLE','ORANGE','RED'].indexOf(r.quality)+1)||!dense(rows)||!rows.length)return bad();
  if(!rows.every(r=>[4,5].includes(r.quality)&&uint(r.star)&&r.star<=5&&uint(r.lockCount)&&r.lockCount<=2)||new Set(rows.map(r=>[r.quality,r.star,r.lockCount].join(':'))).size!==rows.length)return bad();
  return {reliable:true,equips:equips.map(({id,type,quality,qualityIndex})=>({id,type,quality,qualityIndex})),results:rows.map(({quality,star,lockCount})=>({quality,star,lockCount})),playerLevel:base.playerLevel};
}
function resultCandidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  moduleConfig=validateEquipmentGrowthConfig(moduleConfig);
  const {hero,equipment}=equipmentTarget(f,p),eq=f?.catalog?.equips?.find(r=>r.id===equipment?.equipId),save=p.action==='save-reroll';
  const target=targetFields(p),costs=[],action={request:'SaveEquipRerollRequest',response:null,body:{uid:p.uid,saveOrNot:save}};
  let reason=null;
  if(!hasTarget(p))reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';
  else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';
  else if(!id(f?.identityContext?.connectionId)||!positive(f.identityContext.playerLevel)||!authority(f,config,p)||!putOnFresh(f))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(f.identityContext.playerLevel<f.catalog.playerLevel)reason='EQUIPMENT_MODULE_LEVEL_LOCKED';
  else if(!equipment||!isIdle(p)&&!hero)reason=isIdle(p)?'EXACT_IDLE_OWNED_EQUIPMENT_REQUIRED':'EXACT_WORN_EQUIPMENT_REQUIRED';
  else if(!isIdle(p)&&!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if(!eq||!f.catalog.results.some(r=>r.quality===eq.qualityIndex&&r.star===equipment.star&&r.lockCount===0))reason='EQUIPMENT_REROLL_PROFILE_UNKNOWN';
  else if(!dense(equipment.attr)||equipment.attr.length<1||!dense(equipment.rerollAttrs)||equipment.rerollAttrs.length!==equipment.attr.length)reason='COMPLETE_CURRENT_EQUIPMENT_PENDING_RESULT_REQUIRED';
  else if(!f.available?.includes(action.request)||f.available.includes('SaveEquipRerollResponse'))reason='PROTOCOL_UNAVAILABLE';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const expected=equipment?{...copy(equipment),...(save?{attr:copy(equipment.rerollAttrs)}:{}),rerollAttrs:[]}:null;
  return {module:'equipment-growth',actionId:'equipment-growth:'+(save?'SAVE-REROLL':'DISCARD-REROLL')+':'+hash(target),actionType:save?'SAVE-REROLL':'DISCARD-REROLL',parameters:p,target,
    identity:equipment&&(isIdle(p)||hero)?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence:Object.fromEntries(tablesFor(p).map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState:equipment&&(isIdle(p)||hero)?{hero:copy(hero),equipment:copy(equipment)}:null,expectedState:expected,
    costs,costSource:costSourceFor(p,resultSource),budgetClaims:{resources:[],quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},executable:reason===null,blockedReason:reason,label:(save?'保存':'放弃')+'装备当前洗炼结果 '+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
function verifyResult(op,b,a,p,config){
  const fail=reason=>({confirmed:false,reason});
  if(!authority(b,config,p)||!authority(a,config,p)||!same(b.identityContext,a.identityContext)||!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(putOnFactKeys.some(k=>a.sourceFacts[k].provenance.sourceAt<b.sourceFacts[k].provenance.sourceAt))return fail('EQUIPMENT_POST_READ_PREDATES_DISPATCH_BASELINE');
  const contract=resultCandidate(b,p,{config,moduleConfig:{enabled:true}});
  if(!contract.executable||['module','actionId','actionType','target','identity','action','beforeState','expectedState','costs','costSource','budgetClaims','configEvidence'].some(k=>!same(op[k],contract[k])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  if(isIdle(p))return verifyIdleSettlement(b,a,p,contract);
  const before=b.ownership.heroes.find(h=>h.heroId===p.heroId),after=a.ownership.heroes.find(h=>h.heroId===p.heroId),equipment=a.ownership.pool.find(r=>r.uid===p.uid),save=p.action==='save-reroll';
  if(!after||!derivedReliable(after)||!same(contract.expectedState,equipment)||!same(equipment,after.equips.find(r=>r.uid===p.uid)))return fail('EXACT_CURRENT_EQUIPMENT_RESULT_NOT_CONFIRMED');
  const allowed=save?['power','attributes','equips']:['equips'];
  if(!same(without(before,allowed),without(after,allowed))||!same(before.equips.filter(r=>r.uid!==p.uid),after.equips.filter(r=>r.uid!==p.uid))||!same(b.ownership.heroes.filter(h=>h.heroId!==p.heroId),a.ownership.heroes.filter(h=>h.heroId!==p.heroId))||!same(b.ownership.pool.filter(r=>r.uid!==p.uid),a.ownership.pool.filter(r=>r.uid!==p.uid))||!same(b.ownership.bag,a.ownership.bag)||!same(b.ownership.uids,a.ownership.uids))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!stockMatchesDelta(b.stock,a.stock,[],[]))return fail('ZERO_COST_INVENTORY_UNCHANGED_NOT_CONFIRMED');
  if(!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:save?'完整Equips与AllHero复读确认选定UID精确采用原待选属性并清空待选，归属、其他装备及库存保持；仅目标英雄派生值可变化':'完整Equips与AllHero复读确认选定UID仅清空待选结果，原生效属性、英雄、其他装备及库存保持',afterState:{hero:copy(after),equipment:copy(equipment)},responseEvidence:null};
}

const rerollSource='v76 EquipRerollPanel._onClickReroll/_onLockToggle/_refreshLockVisible; EquipUtil.equipReroll/equipAttrBaseCfg; EquipRerollCfg exact owned materials and EquipAttrCfg.extraAtts original per-slot pools; manual single pending result only';
export const EQUIPMENT_REROLL_EVIDENCE=Object.freeze({...EQUIPMENT_REROLL_RESULT_EVIDENCE,source:rerollSource,request:'EquipRerollAttrRequest',scope:'EXPLICIT_WORN_UID_ONE_OWNED_MATERIAL_REROLL_WITH_ZERO_TO_TWO_ONE_BASED_LOCKS',probabilityTipsSha256:'460286e5d44ecf955ba90926e33bb9f05653128e348d6e13176065c6f8d22e44',automatic:'NOT_IMPLEMENTED'});
function rerollCatalog(config){
  const base=resultCatalog(config),attrs=config?.tables?.EquipAttrCfg?.data,libs=config?.tables?.EquipRandomAttrLibCfg?.data,overview=config?.tables?.AdditionAttrOverviewCfg?.data,rows=config?.tables?.EquipRerollCfg?.data;
  const bad=()=>({reliable:false,equips:[],results:[],attributes:[],libs:[],overview:[],playerLevel:null});
  if(!base.reliable||![attrs,libs,overview].every(r=>dense(r)&&r.length>0))return bad();
  if(!attrs.every(r=>id(r.id)&&configStar(r.star)!==null&&dense(r.extraAtts)&&r.extraAtts.length<=3&&r.extraAtts.every(positive))||new Set(attrs.map(r=>r.id+':'+configStar(r.star))).size!==attrs.length)return bad();
  if(!libs.every(r=>positive(r.libId)&&positive(r.weight)&&dense(r.baseAttr)&&r.baseAttr.length===2&&id(r.baseAttr[0])&&typeof r.baseAttr[1]==='number'&&Number.isFinite(r.baseAttr[1])&&r.baseAttr[1]>0)||!overview.every(r=>id(r.id)&&id(r.enhanceAttr))||new Set(overview.map(r=>r.id)).size!==overview.length)return bad();
  const pair=(v,item)=>dense(v)&&v.length===2&&v[0]===item&&positive(v[1]);
  if(!rows.every(r=>pair(r.cost,r.quality===4?'装备洗炼石':'红装备洗炼石')&&dense(r.lockCost)&&(r.lockCount===0?r.lockCost.length===0:r.quality===5&&pair(r.lockCost,'锁定石'))))return bad();
  return {...base,results:rows.map(({quality,star,lockCount,cost,lockCost})=>({quality,star,lockCount,cost:copy(cost),lockCost:copy(lockCost)})),attributes:attrs.map(r=>({id:r.id,star:configStar(r.star),extraAtts:copy(r.extraAtts)})),libs:copy(libs),overview:overview.map(({id,enhanceAttr})=>({id,enhanceAttr}))};
}
function rerollPolicy(f,p,equipment){
  const c=f?.catalog,binding=liveEquipmentFacts.get(f),eq=c?.equips?.find(r=>r.id===equipment?.equipId),base=c?.attributes?.find(r=>r.id===equipment?.equipId&&r.star===equipment?.star);
  if(!c?.reliable||!binding||!equipment||!base||!base.extraAtts.length||equipment.attr.length!==base.extraAtts.length||equipment.rerollAttrs.length!==0||!own(p,'lockedSlots')||p.lockedSlots.some(n=>n>equipment.attr.length)||p.lockedSlots.length>0&&!c.results.some(r=>r.quality===eq?.qualityIndex&&r.star===equipment.star&&r.lockCount===1))return null;
  const row=c.results.find(r=>r.quality===eq?.qualityIndex&&r.star===equipment.star&&r.lockCount===p.lockedSlots.length);if(!row)return null;
  const pools=[];
  for(const libId of base.extraAtts){const rows=c.libs.filter(r=>r.libId===libId),codes=rows.map(r=>binding.enums[c.overview.find(a=>a.id===r.baseAttr[0])?.enhanceAttr]);if(!rows.length||!codes.every(positive))return null;pools.push([...new Set(codes)].sort((a,b)=>a-b));}
  if(!equipment.attr.every(r=>positive(r.attr)&&typeof r.value==='number'&&r.value>=0&&r.value<=Number.MAX_SAFE_INTEGER&&own(r,'rating')&&uint(r.rating)))return null;
  return {costs:resourceCosts([row.cost,...(p.lockedSlots.length?[row.lockCost]:[])]),slotCount:base.extraAtts.length,pools,lockedSlots:copy(p.lockedSlots),originalAttrs:copy(equipment.attr),pendingOnly:true};
}
function rerollCandidate(f,p,{config,moduleConfig=EQUIPMENT_GROWTH_DEFAULT_CONFIG}={}){
  moduleConfig=validateEquipmentGrowthConfig(moduleConfig);
  const {hero,equipment}=equipmentTarget(f,p),policy=rerollPolicy(f,p,equipment),costs=policy?.costs??[],target=targetFields(p),action={request:'EquipRerollAttrRequest',response:null,body:{uid:p.uid,lockedSlots:copy(p.lockedSlots??[])}};
  let reason=null;
  if(!hasTarget(p))reason='EXPLICIT_HERO_AND_EQUIPMENT_UID_REQUIRED';else if(!moduleConfig.enabled)reason='EQUIPMENT_GROWTH_MODULE_DISABLED';
  else if(!id(f?.identityContext?.connectionId)||!positive(f.identityContext.playerLevel)||!authority(f,config,p)||!putOnFresh(f))reason='EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(f.identityContext.playerLevel<f.catalog.playerLevel)reason='EQUIPMENT_MODULE_LEVEL_LOCKED';else if(!equipment||!isIdle(p)&&!hero)reason=isIdle(p)?'EXACT_IDLE_OWNED_EQUIPMENT_REQUIRED':'EXACT_WORN_EQUIPMENT_REQUIRED';else if(!isIdle(p)&&!derivedReliable(hero))reason='TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if(!policy)reason='EXACT_EMPTY_PENDING_LOCKS_PROFILE_AND_ORIGINAL_POOL_REQUIRED';else if(!f.available?.includes(action.request)||f.available.includes('EquipRerollAttrResponse'))reason='PROTOCOL_UNAVAILABLE';else if(costs.some(r=>(f.stock.get(r.id)??0)<r.num))reason='EQUIPMENT_REROLL_OWNED_MATERIAL_INSUFFICIENT';else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  return {module:'equipment-growth',actionId:'equipment-growth:REROLL:'+hash(target),actionType:'REROLL',parameters:p,target,identity:equipment&&(isIdle(p)||hero)?hash({context:f.identityContext,ownership:f.ownership,dependencies:equipmentGrowthDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence:Object.fromEntries(tablesFor(p).map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState:equipment&&(isIdle(p)||hero)?{hero:copy(hero),equipment:copy(equipment)}:null,expectedState:policy,costs,costSource:costSourceFor(p,rerollSource),budgetClaims:{resources:copy(costs),quotas:[],uids:p.uid?[{type:'equipment',id:p.uid}]:[]},executable:reason===null,blockedReason:reason,label:'装备单次材料洗炼 '+(p.heroId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
function verifyReroll(op,b,a,p,config){
  const fail=reason=>({confirmed:false,reason});
  if(!authority(b,config,p)||!authority(a,config,p)||!same(b.identityContext,a.identityContext)||!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(putOnFactKeys.some(k=>a.sourceFacts[k].provenance.sourceAt<b.sourceFacts[k].provenance.sourceAt))return fail('EQUIPMENT_POST_READ_PREDATES_DISPATCH_BASELINE');
  const contract=rerollCandidate(b,p,{config,moduleConfig:{enabled:true}});
  if(!contract.executable||['module','actionId','actionType','target','identity','action','beforeState','expectedState','costs','costSource','budgetClaims','configEvidence'].some(k=>!same(op[k],contract[k])))return fail('EQUIPMENT_PLAN_OR_IDENTITY_MISMATCH');
  if(isIdle(p))return verifyIdleSettlement(b,a,p,contract);
  const before=b.ownership.heroes.find(h=>h.heroId===p.heroId),after=a.ownership.heroes.find(h=>h.heroId===p.heroId),old=b.ownership.pool.find(r=>r.uid===p.uid),equipment=a.ownership.pool.find(r=>r.uid===p.uid),expected=contract.expectedState;
  if(!after||!same(equipment,after.equips.find(r=>r.uid===p.uid)))return fail('EQUIPMENT_SINGLE_REROLL_PENDING_RESULT_NOT_CONFIRMED');
  const pendingFailure=rerollPendingReason(old,equipment,expected);if(pendingFailure)return fail(pendingFailure);
  if(!same(without(before,['equips']),without(after,['equips']))||!same(before.equips.filter(r=>r.uid!==p.uid),after.equips.filter(r=>r.uid!==p.uid))||!same(b.ownership.heroes.filter(h=>h.heroId!==p.heroId),a.ownership.heroes.filter(h=>h.heroId!==p.heroId))||!same(b.ownership.pool.filter(r=>r.uid!==p.uid),a.ownership.pool.filter(r=>r.uid!==p.uid))||!same(b.ownership.bag,a.ownership.bag)||!same(b.ownership.uids,a.ownership.uids))return fail('NON_TARGET_EQUIPMENT_OR_OWNER_CHANGED');
  if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('EQUIPMENT_REROLL_EXACT_DEBITS_NOT_CONFIRMED');
  if(!putOnFresh(b)||!putOnFresh(a))return fail('EQUIPMENT_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:'原洗炼石及锁定石精确净扣，完整Equips/AllHero双镜像确认仅新增合法完整待选结果、原锁槽精确保持；原生效属性、英雄派生值、归属及其他状态保持，保存/放弃另需新许可',afterState:{hero:copy(after),equipment:copy(equipment),pendingOnly:true},responseEvidence:null};
}

export const EQUIPMENT_IDLE_GROWTH_EVIDENCE=Object.freeze({source:'v76 EquipListItem.refreshItem/_onClickHead opens exact owned UID detail with nullable hero binding; EquipDetailPop.open/_refresh hides only replacement for unbound UID; same UID-only growth/refine/star/reroll/result requests',entrySha256:mainHash,listItemSha256:'c12996ee81cda0dc008b57ac3603e768069aa7601ffd952c9b33d6fb6be0fc88',detailSha256:'a72390a57247af8a52e500a34c726043f5e58d2d5d7fee8edcaa7b9d28c27e50',scope:'EXPLICIT_OWNED_IDLE_UID_ORIGINAL_SINGLE_GROWTH_AND_RESULT_CHOICE',ownership:'COMPLETE_EQUIPS_TWICE_AND_ALL_HERO_NO_WORN_OWNER',realGame:'REAL_UNVERIFIED'});
function rerollPendingReason(old,equipment,expected){
  if(!equipment||!same(without(old,['rerollAttrs']),without(equipment,['rerollAttrs']))||equipment.rerollAttrs.length!==expected.slotCount)return 'EQUIPMENT_SINGLE_REROLL_PENDING_RESULT_NOT_CONFIRMED';
  for(const [i,row]of equipment.rerollAttrs.entries()){
    if(expected.lockedSlots.includes(i+1)){if(!same(row,expected.originalAttrs[i]))return 'EQUIPMENT_REROLL_LOCKED_SLOT_CHANGED';}
    else if(!expected.pools[i].includes(row.attr)||!own(row,'rating')||!uint(row.rating)||row.value<0||row.value>Number.MAX_SAFE_INTEGER)return 'EQUIPMENT_REROLL_RESULT_OUTSIDE_ORIGINAL_POOL';
  }
  return null;
}
function verifyIdleSettlement(b,a,p,contract){
  const fail=reason=>({confirmed:false,reason});
  if(!putOnFresh(b)||!putOnFresh(a)||['idleEquips',...putOnFactKeys].some(k=>a.sourceFacts[k].provenance.sourceAt<b.sourceFacts[k].provenance.sourceAt))return fail('EQUIPMENT_IDLE_POST_READ_FRESHNESS_UNKNOWN');
  const before=b.ownership.bag.find(r=>r.uid===p.uid),after=a.ownership.bag.find(r=>r.uid===p.uid);if(!before||!after)return fail('EXACT_IDLE_OWNERSHIP_NOT_CONFIRMED');
  let expected;
  if(isReroll(p)){const reason=rerollPendingReason(before,after,contract.expectedState);if(reason)return fail(reason);expected={...copy(before),rerollAttrs:copy(after.rerollAttrs)};}
  else if(isRerollResult(p))expected=contract.expectedState;
  else if(isStar(p))expected={...copy(before),star:before.star+1,attr:copy(after.attr)};
  else{const field=isRefine(p)?'refineLv':'level';expected={...copy(before),[field]:before[field]+1};}
  if(!same(expected,after)||!same(after,a.ownership.pool.find(r=>r.uid===p.uid)))return fail('EXACT_IDLE_EQUIPMENT_GROWTH_NOT_CONFIRMED');
  if(!same(b.ownership.heroes,a.ownership.heroes)||!same(b.ownership.pool.filter(r=>r.uid!==p.uid),a.ownership.pool.filter(r=>r.uid!==p.uid))||!same(b.ownership.bag.filter(r=>r.uid!==p.uid),a.ownership.bag.filter(r=>r.uid!==p.uid))||!same(b.ownership.uids,a.ownership.uids))return fail('IDLE_GROWTH_HERO_OWNER_OR_PEER_CHANGED');
  if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('IDLE_GROWTH_EXACT_COSTS_NOT_CONFIRMED');
  return {confirmed:true,reason:'两次独立完整Equips复读一致，AllHero确认选定UID仍闲置且全部英雄保持；原Function单次成长/待选结果精确确认，非目标装备与原材料净扣保持',afterState:{ownership:'idle',equipment:copy(after),...(isReroll(p)?{pendingOnly:true}:{})},responseEvidence:null};
}
