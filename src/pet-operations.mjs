// BIZ-R08 domain adapter. The shared executor owns permits, budgets and recovery.
import { createHash } from 'node:crypto';
import { assertPaymentAllowed } from './actions.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { ResourceLedger, safeResourceQuantity, RESOURCE_NAMES } from './resource-ledger.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime, gameTimeBounds } from './state-facts.mjs';
import { readPetRevision, readPlayerLevelEvent } from './client.mjs';
import { makeTypeResolver } from './world.mjs';

const moduleId='pet',type='宠物培育室';
const tables=['BuildingCfg','PetParamCfg','PetBaseCfg','ItemCfg'];
const levelTables=['PetLevelCfg','PetAdvancedCfg'];
const levelSource='v76 PetLevelUpPanel._initPet/_refreshUI/_toUpRequest; PetUtil.curMaxLevel/petBaseAttr/buildExtraAttrArr; PetModel.SCPetsUpdate; PetLevelCfg and PetAdvancedCfg';
const queries=[['water','OnWaterRequest','OnWaterResponse'],['pets','AllPetRequest','AllPetResponse'],['items','AllItemRequest','AllItemResponse'],['resources','AllResourceRequest','AllResourceResponse']];
const source='v76 PetFeedView._onBtnFood; PetUtil.breedSpeedSeconds; local reference pet.mjs#planPet; DispPetBreedJob and PetParamCfg[投喂减少培育时间]';
export const PET_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const PET_EVIDENCE=Object.freeze({source,requirement:'BIZ-R08',request:'PetFeedRequest',response:'NO_DEDICATED_RESPONSE',
  level:Object.freeze({request:'PetLevelUpRequest',response:'NO_DEDICATED_RESPONSE',source:levelSource}),ordinaryBreed:Object.freeze({source:'v76 PetFeedView._onBtnBreed/_refreshBreedCost/_refreshBreedSelect; PetUtil.speciesCfgBySeason; PetBreedCfg/PetSpeciesCfg',readOnly:true,executable:false,universal:false}),breed:'BLOCKED_EVIDENCE',claim:'BLOCKED_EVIDENCE_TARGETLESS_RECOVERY_IDENTITY',universal:'EXCLUDED',automaticClaim:'EXCLUDED',realGame:'REAL_UNVERIFIED'});
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const dense=v=>Array.isArray(v)&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647;
const positive=v=>uint(v)&&v>0;
const unique=(rows,key)=>new Set(rows.map(key)).size===rows.length;
const same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const copy=v=>structuredClone(v);
const without=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)));
const fields=(v,keys)=>object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const liveFacts=new WeakMap();
function exactUid(v){
  const n=toSnapshotJson(v);return (typeof n==='string'&&/^[1-9]\d{0,18}$/.test(n)||typeof n==='number'&&Number.isSafeInteger(n)&&n>0)&&BigInt(n)<(1n<<63n)?String(n):null;
}
function validSnapshot(v){
  if(v===null||typeof v==='string'||typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isFinite(v)&&(!Number.isInteger(v)||Number.isSafeInteger(v));
  return (object(v)||dense(v))&&Object.values(v).every(validSnapshot);
}
export function validatePetConfig(v={}){
  if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('海兽配置仅允许 enabled 布尔值');
  return {enabled:v.enabled??false};
}
export function validatePetParameters(v={}){
  if(!fields(v,['action','buildingId','jobIdx','uid']))throw invalid('海兽仅允许 action、buildingId、jobIdx、uid');
  if(own(v,'action')&&!['feed','level'].includes(v.action))throw invalid('当前仅支持单次 action=feed 或 level');
  if(own(v,'buildingId')&&!id(v.buildingId))throw invalid('buildingId 必须为明确培育室 ID');
  if(own(v,'jobIdx')&&!uint(v.jobIdx))throw invalid('jobIdx 必须为明确的非负 int32，不能使用显示槽位代替');
  if(own(v,'uid')&&(typeof v.uid!=='string'||exactUid(v.uid)!==v.uid))throw invalid('uid 必须为明确十进制海兽 UID');
  if(v.action==='level'&&own(v,'jobIdx')||v.action!=='level'&&own(v,'uid'))throw invalid('升级 UID 与投喂 jobIdx 不得混用');
  return {...v};
}
function catalog(config,action='feed'){
  const t=Object.fromEntries(tables.map(n=>[n,config?.tables?.[n]?.data])),b=t.BuildingCfg,p=t.PetParamCfg,base=t.PetBaseCfg,items=t.ItemCfg;
  if(![b,p,base,items].every(dense)||!b.length||!base.length||!items.length
    ||!b.every(r=>own(r,'buildingType')&&id(r.buildingType))||!unique(b,r=>r.buildingType)||!b.some(r=>r.buildingType===type)
    ||!base.every(r=>own(r,'petId')&&id(r.petId)&&own(r,'star')&&uint(r.star))||!unique(base,r=>r.petId+':'+r.star)
    ||!items.every(r=>own(r,'id')&&id(r.id))||!unique(items,r=>r.id))return null;
  const speed=p.filter(r=>own(r,'paramName')&&r.paramName==='投喂减少培育时间');
  if(action!=='level'&&(speed.length!==1||!own(speed[0],'paramValue')||!positive(speed[0].paramValue)))return null;
  return {seconds:action==='level'?null:speed[0].paramValue,types:b.map(r=>r.buildingType),pets:base.map(({petId,star})=>({petId,star})),itemIds:items.map(r=>r.id)};
}
// The fixed client proves ordinary gene/GOLD prerequisites, but PetBreedRequest
// carries neither a building nor a queue identity. This observation never emits
// an action or substitutes for a recoverable result contract.
function breedDefinitions(config,cat){
  const rows=config?.tables?.PetBreedCfg?.data,species=config?.tables?.PetSpeciesCfg?.data;
  const data=(v,k)=>Object.getOwnPropertyDescriptor(v??{},k)?.enumerable===true&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value');
  if(!cat||!dense(rows)||!rows.length||!dense(species)||!species.length||!species.every(r=>['spId','season'].every(k=>data(r,k)&&positive(r[k])))||!unique(species,r=>r.spId))return null;
  const result=[];
  for(const row of rows){
    if(!['petId','spId','season','breedTime','cost'].every(k=>data(row,k))||!id(row.petId)||!positive(row.spId)||!positive(row.season)||!positive(row.breedTime)||!cat.pets.some(p=>p.petId===row.petId)||!species.some(r=>r.spId===row.spId)||!dense(row.cost)||row.cost.length!==2)return null;
    const [gene,gold]=row.cost;
    if(![gene,gold].every(p=>dense(p)&&p.length===2&&Number.isSafeInteger(p[1])&&p[1]>0)||!id(gene[0])||!cat.itemIds.includes(gene[0])||Object.values(RESOURCE_NAMES).includes(gene[0])||gold[0]!=='GOLD')return null;
    result.push({petId:row.petId,spId:row.spId,season:row.season,speciesSeason:species.find(r=>r.spId===row.spId).season,breedTime:row.breedTime,costs:[{id:gene[0],num:gene[1]},{id:'GOLD',num:gold[1]}]});
  }
  return unique(result,r=>r.petId)?result:null;
}
export function petBreedQualification(f,{config}={}){
  const base={readOnly:true,executable:false,universal:false,blockedReason:'PET_BREED_QUEUE_RESULT_IDENTITY_UNPROVEN'};
  const unknown=reason=>({...base,status:'UNKNOWN',reason,season:null,rooms:[],candidates:[]});
  if(!authority(f,config)||liveFacts.get(f)?.client.connected!==true)return unknown('PET_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(!f.breedDefinitions||!same(f.breedDefinitions,breedDefinitions(config,f.catalog)))return unknown('PET_BREED_CONFIG_UNKNOWN_OR_CHANGED');
  const season=Number(BigInt(f.context.worldId)/1000000n%1000n);
  if(!positive(season))return unknown('PET_BREED_SEASON_UNKNOWN');
  const rooms=f.buildings.filter(b=>makeTypeResolver(config)(b.buildingId)===type).map(b=>{
    const available=own(b,'auto')&&b.auto===false&&b.level>0&&own(b,'buildFinishTime')&&b.buildFinishTime===0;
    return {buildingId:b.buildingId,queueAvailable:available?b.petBreed.breedQ.length<Math.min(b.level,b.petBreed.maxQLength):null};
  });
  const candidates=f.breedDefinitions.map(row=>{
    const seasonAvailable=row.season<=season&&row.speciesSeason<=season;
    const stockAvailable=row.costs.every(c=>(f.stock.get(c.id)??0)>=c.num);
    const queueAvailable=rooms.some(r=>r.queueAvailable===true)?true:rooms.length&&rooms.every(r=>r.queueAvailable===false)?false:null;
    const conditions=!seasonAvailable||!stockAvailable||queueAvailable===false?'NOT_MET':queueAvailable===null?'UNKNOWN':'MET';
    return {...copy(row),...base,seasonAvailable,stockAvailable,queueAvailable,conditions};
  });
  return {...base,status:'OBSERVED',reason:null,season,rooms,candidates};
}
function costsOf(raw,cat){
  if(!dense(raw)||!raw.length||!cat)return null;
  const costs=[];
  for(const row of raw){
    if(!['id','num','type'].every(k=>own(row,k))||!id(row.id))return null;
    const num=safeResourceQuantity(row.num);
    if(num===null||num<=0||!((row.type===0&&cat.itemIds.includes(row.id)&&!Object.values(RESOURCE_NAMES).includes(row.id))||(row.type===1&&Object.values(RESOURCE_NAMES).includes(row.id)&&row.id!=='RUBY')))return null;
    costs.push({id:row.id,num});
  }
  return unique(costs,r=>r.id)?costs.sort((a,b)=>a.id.localeCompare(b.id)):null;
}
function parseWater(raw,config,cat){
  if(!cat||!own(raw,'building')||!dense(raw.building)||!raw.building.every(r=>own(r,'buildingId')&&id(r.buildingId)&&own(r,'level')&&uint(r.level))||!unique(raw.building,r=>r.buildingId))return null;
  const resolve=makeTypeResolver(config),buildings=[];
  for(const row of raw.building){
    const normalized=toSnapshotJson(row);if(!validSnapshot(normalized))return null;
    if(resolve(row.buildingId)===type){
      const q=row.petBreed;
      if(!own(row,'petBreed')||!q||!['breedQ','maturePets','maxQLength'].every(k=>own(q,k))||!dense(q.breedQ)||!dense(q.maturePets)||!uint(q.maxQLength)||q.breedQ.length>q.maxQLength)return null;
      if(!q.breedQ.every(job=>['idx','petId','finishTime','startTime','star','feedRequirements'].every(k=>own(job,k))&&uint(job.idx)&&id(job.petId)&&positive(job.startTime)&&positive(job.finishTime)&&job.finishTime>job.startTime&&uint(job.star)&&cat.pets.some(p=>p.petId===job.petId&&p.star===job.star)&&costsOf(job.feedRequirements,cat)!==null)||!unique(q.breedQ,job=>job.idx))return null;
      if(!q.maturePets.every(p=>own(p,'petId')&&id(p.petId)&&own(p,'star')&&uint(p.star)&&cat.pets.some(row=>row.petId===p.petId&&row.star===p.star)))return null;
    }
    buildings.push(normalized);
  }
  return buildings.sort((a,b)=>a.buildingId.localeCompare(b.buildingId));
}
function parsePets(raw,cat){
  if(!cat||!own(raw,'pets')||!dense(raw.pets))return null;
  const rows=[];
  for(const pet of raw.pets){
    if(!['uid','petId','level','star'].every(k=>own(pet,k))||exactUid(pet.uid)===null||!id(pet.petId)||!positive(pet.level)||!uint(pet.star)||!cat.pets.some(r=>r.petId===pet.petId&&r.star===pet.star))return null;
    const row=toSnapshotJson(pet);row.uid=exactUid(pet.uid);if(!validSnapshot(row))return null;rows.push(row);
  }
  return unique(rows,r=>r.uid)?rows.sort((a,b)=>a.uid.localeCompare(b.uid)):null;
}
function contextOf(client,player){
  const ids=['id','playerId'].filter(k=>own(player,k)).map(k=>exactUid(player[k]));
  return {accountId:id(client.factContext?.accountId)?client.factContext.accountId:null,generation:uint(client.factContext?.generation)?client.factContext.generation:null,
    connectionId:id(client.factContext?.connectionId)?client.factContext.connectionId:null,
    playerId:ids.length&&ids.every(v=>v!==null&&v===ids[0])?ids[0]:null,worldId:own(player,'worldId')?exactUid(player.worldId):null};
}
function clockOf(client,context){
  const time=readGameTime(client),bounds=gameTimeBounds(time);
  return time.gameTime.accountId===context.accountId&&time.gameTime.generation===context.generation&&bounds.earliest!==null?bounds:null;
}
const digest=f=>hash({...f,stock:[...(f.stock??[])]});
function levelSourceOf(client,context){
  const revision=readPetRevision(client,context),level=readPlayerLevelEvent(client);
  return revision&&level.reliable&&positive(level.playerLevel)&&Object.keys(context).every(k=>level[k]===context[k])?{revision,playerLevel:level.playerLevel}:null;
}
export async function surveyPet(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validatePetParameters(parameters);const active=()=>assertExecutionActive(client,{signal,stop}),context=contextOf(client,player),notes=[],startClock=clockOf(client,context),levelSourceBefore=parameters.action==='level'?levelSourceOf(client,context):null;active();
  const results=await Promise.all(queries.map(async([key,request,response])=>{
    active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return [key,null,null];}
    try{const raw=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,{signal,stop});return [key,raw,Date.now()];}
    catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}
  }));active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('海兽调查期间账号或连接改变'),{code:'CANCELLED'});
  const raw=Object.fromEntries(results.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),cat=catalog(config,parameters.action);
  const buildings=parseWater(raw.water,config,cat)&&parseWater(inputs.water,config,cat),pets=parsePets(raw.pets,cat)&&parsePets(inputs.pets,cat);
  const inventory=parseOperationInventory(raw.items,raw.resources).stockReliable?parseOperationInventory(inputs.items,inputs.resources):{stock:new Map(),stockReliable:false};
  const sourceFacts=Object.fromEntries(results.map(([key,,sourceAt],i)=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,scope:{kind:'ACCOUNT'},source:queries[i][2],sourceAt,reliable:i===0?buildings!==null:i===1?pets!==null:inventory.stockReliable})]));
  const levelSourceAfter=parameters.action==='level'?levelSourceOf(client,context):null;
  const facts={breedDefinitions:breedDefinitions(config,cat),levelSource:levelSourceBefore&&same(levelSourceBefore,levelSourceAfter)?levelSourceAfter:null,module:moduleId,parameters,context,catalog:cat,inputs,buildings,pets,...inventory,sourceFacts,startClock,endClock:clockOf(client,context),available:Object.keys(protocol??{}).filter(name=>protocol[name]?.encode&&protocol[name]?.decode),notes,state:{context,buildings,pets}};
  liveFacts.set(facts,{client,player,digest:digest(facts)});return facts;
}
function authority(f,config,{settlement=false}={}){
  const live=liveFacts.get(f),c=f?.context;
  if(!live||live.digest!==digest(f)||!same(c,contextOf(live.client,live.player))||!id(c.accountId)||!id(c.connectionId)||!uint(c.generation)||!c.playerId||!c.worldId||!same(f.catalog,catalog(config,f.parameters?.action))||!f.catalog||!f.buildings||!f.pets||!f.stockReliable||!(f.stock instanceof Map))return false;
  if(f.parameters?.action==='level'){const current=levelSourceOf(live.client,c);if(!f.levelSource||!current||current.playerLevel!==f.levelSource.playerLevel||current.revision.revision<f.levelSource.revision.revision||!settlement&&!same(current,f.levelSource))return false;}
  return queries.every(([key,,source])=>f.sourceFacts?.[key]?.provenance?.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,scope:{kind:'ACCOUNT'},maxAgeMs:30000}).status==='FRESH');
}
function currentClock(f){
  const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null;
  return clock&&f.startClock&&f.endClock&&f.startClock.earliest<=f.endClock.earliest&&f.endClock.earliest<=clock.earliest?clock:null;
}
export function petDependencyVersions({config,moduleConfig=PET_DEFAULT_CONFIG,parameters={}}={}){
  return {moduleConfig:validatePetConfig(moduleConfig),...Object.fromEntries([...tables,...(parameters.action==='level'?levelTables:[])].map(n=>['config.'+n,copy(config?.tables?.[n]??null)]))};
}
// Level effects are the fixed client's preview formula, never inferred from rewards.
function levelPolicy(config,pet,playerLevel){
  const levels=config?.tables?.PetLevelCfg?.data,grades=config?.tables?.PetAdvancedCfg?.data,base=config?.tables?.PetBaseCfg?.data?.find(r=>r.petId===pet?.petId&&r.star===pet?.star);
  if(!pet||!positive(playerLevel)||!dense(levels)||!levels.length||!levels.every((r,i)=>['level','playerLevel','extraAttrNum','baseAttrAdd','cost'].every(k=>own(r,k))&&r.level===i+1&&positive(r.playerLevel)&&uint(r.extraAttrNum)&&typeof r.baseAttrAdd==='number'&&Number.isFinite(r.baseAttrAdd)&&r.baseAttrAdd>=0&&(i===0||r.playerLevel>=levels[i-1].playerLevel)&&dense(r.cost))||!dense(grades)||!unique(grades,r=>r.grade)||!grades.every(r=>own(r,'grade')&&uint(r.grade)&&own(r,'attrs')&&dense(r.attrs)&&r.attrs.length<=3&&r.attrs.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0))||!base||!own(pet,'grade')||!uint(pet.grade))return null;
  const grade=grades.find(r=>r.grade===pet.grade),current=levels.find(r=>r.level===pet.level),next=levels.find(r=>r.level===pet.level+1),maxLevel=levels.filter(r=>r.playerLevel<=playerLevel).at(-1)?.level;
  const attrs=(row)=>{
    if(!row||!grade||!own(pet,'baseAttrs')||!dense(pet.baseAttrs)||pet.baseAttrs.length!==3||!unique(pet.baseAttrs,r=>r.attr))return null;
    const result=[];
    for(const a of pet.baseAttrs){const names={1:['hp','hpGrowth',0],2:['ad','adGrowth',1],3:['ap','apGrowth',2]}[a.attr];if(!names||!own(a,'attr')||!own(a,'value')||!Number.isSafeInteger(a.value)||a.value<0)return null;const [start,growth,index]=names;
      if(![start,growth].every(k=>own(base,k)&&typeof base[k]==='number'&&Number.isFinite(base[k])&&base[k]>=0))return null;
      const value=Math.floor((base[start]+row.baseAttrAdd*base[growth])*(1+(grade.attrs[index]??0)));if(!Number.isSafeInteger(value))return null;result.push({...a,value});}
    return result;
  };
  const before=attrs(current),after=attrs(next),selected=pet.extAttrIdx===1?pet.extAttrs:pet.extAttrs2;
  if(!before||!same(before,pet.baseAttrs)||!after||!own(pet,'extAttrIdx')||![1,2].includes(pet.extAttrIdx)||!dense(selected)||selected.length<next.extraAttrNum||!dense(pet.extAttrs)||!dense(pet.extAttrs2))return null;
  return {next,maxLevel,pet:{...copy(pet),level:next.level,baseAttrs:after}};
}
function levelCandidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG,settlement=false}={}){
  const valid=authority(f,config,{settlement}),resolve=makeTypeResolver(config),building=valid?f.buildings.find(b=>b.buildingId===p.buildingId):null;
  const serves=valid?f.buildings.filter(b=>['宠物','宠物B','宠物C'].includes(resolve(b.buildingId))):[],servesKnown=serves.every(b=>own(b,'petServe')&&own(b.petServe,'petUid')&&(b.petServe.petUid===0||b.petServe.petUid==='0'||exactUid(b.petServe.petUid)!==null));
  const pet=valid?f.pets.find(r=>r.uid===p.uid):null,policy=valid?levelPolicy(config,pet,f.levelSource?.playerLevel):null;
  const raw=policy?.next.cost,costs=dense(raw)&&raw.length===2&&raw[0]==='宠物经验'&&positive(raw[1])&&f.catalog?.itemIds.includes(raw[0])?[{id:raw[0],num:raw[1]}]:[];
  let reason=null;const action={request:'PetLevelUpRequest',response:null,body:{buildingId:p.buildingId}};
  if(!p.buildingId||!p.uid)reason='EXPLICIT_SERVING_BUILDING_AND_PET_UID_REQUIRED';
  else if(!moduleConfig.enabled)reason='PET_MODULE_DISABLED';
  else if(!valid)reason='PET_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(!servesKnown||!building||!serves.includes(building)||!own(building,'petServe')||exactUid(building.petServe.petUid)!==p.uid||serves.filter(b=>exactUid(b.petServe.petUid)===p.uid).length!==1||!pet)reason='EXACT_UNIQUE_SERVING_PET_REQUIRED';
  else if(building.level<1||!own(building,'buildFinishTime')||building.buildFinishTime!==0)reason='AVAILABLE_SERVING_BUILDING_REQUIRED';
  else if(!policy||!costs.length)reason='PET_LEVEL_CONFIG_OR_EFFECT_UNKNOWN';
  else if(policy.next.level>policy.maxLevel)reason='PET_PLAYER_LEVEL_LIMIT';
  else if(!f.available.includes(action.request)||f.available.includes('PetLevelUpResponse'))reason='PROTOCOL_UNAVAILABLE';
  else if(costs.some(r=>(f.stock.get(r.id)??0)<r.num))reason='PET_LEVEL_STOCK_INSUFFICIENT';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={buildingId:p.buildingId??null,uid:p.uid??null,petId:pet?.petId??null,fromLevel:pet?.level??null,toLevel:policy?.next.level??null};
  const configEvidence=Object.fromEntries([...tables,...levelTables].map(n=>[n,copy(config?.tables?.[n]??null)]));
  return {module:moduleId,actionId:'pet:LEVEL:'+hash(target),actionType:'LEVEL',parameters:p,target,executable:reason===null,blockedReason:reason,
    identity:valid&&pet?hash({context:f.context,buildings:f.buildings,pets:f.pets,levelSource:f.levelSource,dependencies:petDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence,beforeState:pet&&building?{building:copy(building),pet:copy(pet)}:null,expectedState:policy?{pet:policy.pet}:null,costs,costSource:levelSource,
    budgetClaims:{resources:copy(costs),quotas:[],uids:pet?[{type:'pet',id:pet.uid},{type:'pet-serving-building',id:p.buildingId}]:[]},label:'海兽单级升级 '+(p.buildingId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
function candidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG,settlement=false}={}){
  p=validatePetParameters(p);moduleConfig=validatePetConfig(moduleConfig);
  if(p.action==='level')return levelCandidate(f,p,{config,moduleConfig,settlement});
  const valid=authority(f,config),building=valid?f.buildings.find(b=>b.buildingId===p.buildingId&&makeTypeResolver(config)(b.buildingId)===type):null,job=building?.petBreed?.breedQ.find(j=>j.idx===p.jobIdx);
  const clock=valid?currentClock(f):null,costs=job?costsOf(job.feedRequirements,f.catalog):[],duplicates=valid?f.buildings.flatMap(b=>b.petBreed?.breedQ??[]).filter(j=>j.idx===p.jobIdx).length:0;
  const action={request:'PetFeedRequest',response:null,body:{jobIdx:p.jobIdx}};let reason=null;
  if(p.action!=='feed'||!p.buildingId||!own(p,'jobIdx'))reason='EXPLICIT_BUILDING_JOB_AND_FEED_REQUIRED';
  else if(!moduleConfig.enabled)reason='PET_MODULE_DISABLED';
  else if(!valid)reason='PET_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(!building||!job||!building.petBreed||building.level<1||!own(building,'buildFinishTime')||building.buildFinishTime!==0)reason='EXACT_AVAILABLE_PET_JOB_REQUIRED';
  else if(!own(building,'auto')||building.auto!==false)reason='PET_SERVER_AUTO_WORK_NOT_EXPLICITLY_DISABLED';
  else if(duplicates!==1)reason='PET_JOB_IDX_AMBIGUOUS';
  else if(!clock)reason='TRUSTED_GAME_CLOCK_UNKNOWN';
  else if(job.finishTime<=clock.latest)reason='PET_JOB_ALREADY_DUE_OR_UNCERTAIN';
  else if(!costs?.length)reason='PET_FEED_COST_UNKNOWN';
  else if(!f.available.includes(action.request)||f.available.includes('PetFeedResponse'))reason='PROTOCOL_UNAVAILABLE';
  else if(costs.some(r=>(f.stock.get(r.id)??0)<r.num))reason='PET_FEED_STOCK_INSUFFICIENT';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={buildingId:p.buildingId??null,jobIdx:p.jobIdx??null,petId:job?.petId??null,startTime:job?.startTime??null,star:job?.star??null,finishTime:job?.finishTime??null};
  return {module:moduleId,actionId:'pet:FEED:'+hash(target),actionType:'FEED',parameters:p,target,executable:reason===null,blockedReason:reason,
    identity:valid&&job?hash({context:f.context,buildings:f.buildings,pets:f.pets,dependencies:petDependencyVersions({config,moduleConfig})}):null,
    configEvidence:Object.fromEntries(tables.map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState:job?{building:copy(building),job:copy(job)}:null,
    expectedState:job?{...target,finishTime:job.finishTime-f.catalog.seconds,secondsReduced:f.catalog.seconds}:null,costs:costs??[],costSource:source,
    budgetClaims:{resources:copy(costs??[]),quotas:[],uids:job?[{type:'pet-job',id:p.buildingId+':'+job.idx+':'+job.startTime}]:[]},
    label:'海兽单次投喂 '+(p.buildingId??'')+' '+(p.jobIdx??''),...(reason===null?{action}:{})};
}
export function viewPet(f,{config,moduleConfig,parameters=f?.parameters??{}}={}){
  const p=validatePetParameters(parameters),valid=authority(f,config),rooms=valid?f.buildings.filter(b=>makeTypeResolver(config)(b.buildingId)===type&&own(b,'petBreed')):[],choices=[];
  if(p.action==='level'){for(const b of valid?f.buildings:[]){const uid=b.petServe&&exactUid(b.petServe.petUid);if(uid&&(!p.buildingId||p.buildingId===b.buildingId)&&(!p.uid||p.uid===uid))choices.push({action:'level',buildingId:b.buildingId,uid});}}
  else for(const b of rooms)if(!p.buildingId||p.buildingId===b.buildingId)for(const job of b.petBreed.breedQ)if(!own(p,'jobIdx')||p.jobIdx===job.idx)choices.push({action:'feed',buildingId:b.buildingId,jobIdx:job.idx});
  const candidates=(choices.length?choices:[p]).map(choice=>{
    const c=candidate(f,choice,{config,moduleConfig});return without(c,['identity','configEvidence']);
  });
  return {module:moduleId,mode:p.action??'feed',serving:valid?f.buildings.filter(b=>['宠物','宠物B','宠物C'].includes(makeTypeResolver(config)(b.buildingId))).map(b=>({buildingId:b.buildingId,uid:b.petServe?.petUid??null})):[],playerLevel:f?.levelSource?.playerLevel??null,rooms:rooms.map(b=>({buildingId:b.buildingId,level:b.level,queue:copy(b.petBreed)})),pets:valid?copy(f.pets):[],secondsReduced:valid?f.catalog.seconds:null,
    breeding:petBreedQualification(f,{config}),candidates,blocked:candidates.filter(c=>!c.executable),notes:[...(f?.notes??[])],evidence:PET_EVIDENCE};
}
export function validatePetGrowthPreparation(value){
 if(!fields(value,['targets','maxDurationMs'])||Reflect.ownKeys(value).length!==2||!dense(value.targets)||Object.getPrototypeOf(value.targets)!==Array.prototype||value.targets.length<1||value.targets.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('海兽组合须明确1至24个不同目标及有限总时长');
 const targets=value.targets.map(row=>{const p=validatePetParameters(row),keys=p.action==='level'?['action','buildingId','uid']:['action','buildingId','jobIdx'];if(!['level','feed'].includes(p.action)||Reflect.ownKeys(p).length!==3||keys.some(key=>!own(p,key)))throw invalid('海兽组合只允许完整明确的原在岗UID升级或建筑/队列投喂参数');return p;});
 if(targets.some(p=>p.action!==targets[0].action)||targets[0].action==='level'&&(!unique(targets,p=>p.uid)||!unique(targets,p=>p.buildingId))||targets[0].action==='feed'&&(!unique(targets,p=>p.jobIdx)||!unique(targets,p=>p.buildingId+':'+p.jobIdx)))throw invalid('同批只允许一种原动作，每在岗海兽/建筑或明确队列仅一次');
 return {targets,maxDurationMs:value.maxDurationMs};
}
export function preparePetGrowthWorkflow(facts,{config,moduleConfig=PET_DEFAULT_CONFIG,...input}={}){
 const p=validatePetGrowthPreparation(input);if(facts?.parameters?.action!==p.targets[0].action||!authority(facts,config)||liveFacts.get(facts)?.client.connected!==true)throw invalid('海兽组合不得跨原调查模式或失效来源');
 const ledger=new ResourceLedger(facts.stock),nodes=[{id:'start',type:'START'}];
 const steps=p.targets.map((parameters,i)=>{const plan=planPet(facts,{config,moduleConfig,parameters,ledger});if(plan.actions.length!==1)throw invalid('海兽目标当前无原合同资格或累计自有材料不足');const row=plan.actions[0],selection={actionId:row.actionId};nodes.push({id:'grow-'+i,type:'ACTION',module:moduleId,parameters,selection},{id:'verify-'+i,type:'VERIFY',module:moduleId});return {parameters,selection,target:copy(row.target),costs:copy(row.costs),budgetClaims:copy(row.budgetClaims)};});
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...p,steps,budget,graph:{version:1,id:'pet-growths-'+hash({p,steps,budget}).slice(0,20),name:'明确海兽逐目标单次成长',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:[moduleId]}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'同批一种原动作，每个明确在岗海兽UID升一级，或每个明确建筑/队列只投喂一次（原idx含0）。原私有来源、planPet和共享Ledger累计核初始自有材料，原海兽/建筑或队列UID父预算固定；固定原actionId中的在岗等级或队列开始/完成/海兽身份，逐项重新调查、单次授权和完整目标/非目标状态及库存精确净扣验证。资格变化、拒绝或UNKNOWN停止，不替换在岗海兽、不培育、领取成熟奖励、补购或重放，不新增恢复权限。'};
}
export function planPet(f,{config,moduleConfig,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable?f.stock:null)}={}){
  const c=candidate(f,parameters,{config,moduleConfig});
  return c.executable&&(selections===undefined||selections.includes(c.actionId))&&ledger.reserve(c.costs)?{module:moduleId,actions:[c],notes:[]}:{module:moduleId,actions:[],notes:[c.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
export function verifyPet(op,b,a){
  const fail=reason=>({confirmed:false,reason});let p;try{p=validatePetParameters(op?.parameters);}catch{return fail('PET_OPERATION_CONTRACT_INVALID');}
  const config={tables:op?.configEvidence??{}};
  if(!authority(b,config,{settlement:p.action==='level'})||!authority(a,config)||!same(b.context,a.context))return fail('PET_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(queries.some(([key])=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('PET_POST_READ_PREDATES_BASELINE');
  // Reconstruct with the original queue and costs. A late read must still prove
  // the original job could not have matured naturally without this feed.
  const contract=candidate(b,p,{config,moduleConfig:{enabled:true},settlement:p.action==='level'});
  if(!contract.executable||['module','actionId','actionType','target','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','configEvidence'].some(k=>!same(op[k],contract[k])))return fail('PET_OPERATION_CONTRACT_MISMATCH');
  if(p.action==='level'){
    const after=a.pets.find(row=>row.uid===p.uid),expected=contract.expectedState.pet;
    if(!same(b.buildings,a.buildings)||!same(after,expected)||!same(b.pets.filter(row=>row.uid!==p.uid),a.pets.filter(row=>row.uid!==p.uid)))return fail('PET_EXACT_LEVEL_OR_NON_TARGET_STATE_NOT_CONFIRMED');
    if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('PET_EXACT_MATERIAL_DEBITS_NOT_CONFIRMED');
    if(!authority(b,config,{settlement:true})||!authority(a,config))return fail('PET_AUTHORITY_EXPIRED_DURING_VERIFICATION');
    return {confirmed:true,reason:'完整OnWater确认同一服役建筑与UID，独立AllPet及库存确认单级、配置属性和精确海兽经验净扣',afterState:{pet:copy(after),buildingId:p.buildingId}};
  }
  const before=contract.beforeState.building,after=a.buildings.find(v=>v.buildingId===p.buildingId),job=contract.beforeState.job,clock=currentClock(a);
  if(!after||!clock||!b.endClock||clock.earliest<b.endClock.earliest||clock.latest>=job.finishTime)return fail('PET_SETTLEMENT_CLOCK_OR_NATURAL_COMPLETION_AMBIGUOUS');
  if(!same(b.buildings.filter(v=>v.buildingId!==p.buildingId),a.buildings.filter(v=>v.buildingId!==p.buildingId))||!same(without(before,['petBreed']),without(after,['petBreed']))||!same(b.pets,a.pets))return fail('PET_NON_TARGET_STATE_CHANGED');
  const beforeQ=before.petBreed,afterQ=after.petBreed;
  if(!same(without(beforeQ,['breedQ','maturePets']),without(afterQ,['breedQ','maturePets']))||!same(beforeQ.breedQ.filter(j=>j.idx!==p.jobIdx),afterQ.breedQ.filter(j=>j.idx!==p.jobIdx)))return fail('PET_OTHER_QUEUE_OR_CAPACITY_CHANGED');
  const reduced=job.finishTime-b.catalog.seconds,next=afterQ.breedQ.find(j=>j.idx===p.jobIdx);
  let effect;
  if(next){
    if(!same(without(job,['finishTime','feedRequirements']),without(next,['finishTime','feedRequirements']))||next.finishTime!==reduced||next.finishTime<=clock.latest||!same(beforeQ.maturePets,afterQ.maturePets))return fail('PET_EXACT_SINGLE_REDUCTION_NOT_CONFIRMED');
    effect='RUNNING';
  }else{
    const sorted=rows=>copy(rows).sort((x,y)=>stableBusinessValue(x).localeCompare(stableBusinessValue(y)));
    if(reduced>clock.earliest||!same(sorted([...beforeQ.maturePets,{petId:job.petId,star:job.star}]),sorted(afterQ.maturePets)))return fail('PET_EXACT_MATURITY_NOT_CONFIRMED');
    effect='MATURE';
  }
  if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('PET_EXACT_MATERIAL_DEBITS_NOT_CONFIRMED');
  if(!authority(b,config)||!authority(a,config))return fail('PET_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:'完整OnWater与AllPet及库存确认同批队列单次投喂、精确材料净扣和减时/成熟转移；未自动领取',afterState:{building:copy(after),effect}};
}
export const petModule=Object.freeze({id:moduleId,label:'海兽培育与投喂',capabilities:Object.freeze(['BIZ-R08']),defaultConfig:PET_DEFAULT_CONFIG,validateConfig:validatePetConfig,validateParameters:validatePetParameters,
  survey:surveyPet,view:viewPet,plan:planPet,verify:verifyPet,rejectionIdentity:businessRejectionIdentityFromHistory,dependencyVersions:petDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...[...tables,...levelTables].map(n=>'config.'+n)])});
