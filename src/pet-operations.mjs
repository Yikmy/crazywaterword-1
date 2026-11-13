// BIZ-R08 domain adapter. The shared executor owns permits, budgets and recovery.
import { createHash } from 'node:crypto';
import { assertPaymentAllowed } from './actions.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity, RESOURCE_NAMES } from './resource-ledger.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime, gameTimeBounds } from './state-facts.mjs';
import { makeTypeResolver } from './world.mjs';

const moduleId='pet',type='宠物培育室';
const tables=['BuildingCfg','PetParamCfg','PetBaseCfg','ItemCfg'];
const queries=[['water','OnWaterRequest','OnWaterResponse'],['pets','AllPetRequest','AllPetResponse'],['items','AllItemRequest','AllItemResponse'],['resources','AllResourceRequest','AllResourceResponse']];
const source='v76 PetFeedView._onBtnFood; PetUtil.breedSpeedSeconds; local reference pet.mjs#planPet; DispPetBreedJob and PetParamCfg[投喂减少培育时间]';
export const PET_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const PET_EVIDENCE=Object.freeze({source,requirement:'BIZ-R08',request:'PetFeedRequest',response:'NO_DEDICATED_RESPONSE',
  breed:'BLOCKED_EVIDENCE',claim:'BLOCKED_EVIDENCE_TARGETLESS_RECOVERY_IDENTITY',universal:'EXCLUDED',automaticClaim:'EXCLUDED',realGame:'REAL_UNVERIFIED'});
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
  if(!fields(v,['action','buildingId','jobIdx']))throw invalid('海兽投喂仅允许 action、buildingId、jobIdx');
  if(own(v,'action')&&v.action!=='feed')throw invalid('当前仅支持明确的单次 action=feed');
  if(own(v,'buildingId')&&!id(v.buildingId))throw invalid('buildingId 必须为明确培育室 ID');
  if(own(v,'jobIdx')&&!uint(v.jobIdx))throw invalid('jobIdx 必须为明确的非负 int32，不能使用显示槽位代替');
  return {...v};
}
function catalog(config){
  const t=Object.fromEntries(tables.map(n=>[n,config?.tables?.[n]?.data])),b=t.BuildingCfg,p=t.PetParamCfg,base=t.PetBaseCfg,items=t.ItemCfg;
  if(![b,p,base,items].every(dense)||!b.length||!base.length||!items.length
    ||!b.every(r=>own(r,'buildingType')&&id(r.buildingType))||!unique(b,r=>r.buildingType)||!b.some(r=>r.buildingType===type)
    ||!base.every(r=>own(r,'petId')&&id(r.petId)&&own(r,'star')&&uint(r.star))||!unique(base,r=>r.petId+':'+r.star)
    ||!items.every(r=>own(r,'id')&&id(r.id))||!unique(items,r=>r.id))return null;
  const speed=p.filter(r=>own(r,'paramName')&&r.paramName==='投喂减少培育时间');
  if(speed.length!==1||!own(speed[0],'paramValue')||!positive(speed[0].paramValue))return null;
  return {seconds:speed[0].paramValue,types:b.map(r=>r.buildingType),pets:base.map(({petId,star})=>({petId,star})),itemIds:items.map(r=>r.id)};
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
export async function surveyPet(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validatePetParameters(parameters);const active=()=>assertExecutionActive(client,{signal,stop}),context=contextOf(client,player),notes=[],startClock=clockOf(client,context);active();
  const results=await Promise.all(queries.map(async([key,request,response])=>{
    active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return [key,null,null];}
    try{const raw=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,{signal,stop});return [key,raw,Date.now()];}
    catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}
  }));active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('海兽调查期间账号或连接改变'),{code:'CANCELLED'});
  const raw=Object.fromEntries(results.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),cat=catalog(config);
  const buildings=parseWater(raw.water,config,cat)&&parseWater(inputs.water,config,cat),pets=parsePets(raw.pets,cat)&&parsePets(inputs.pets,cat);
  const inventory=parseOperationInventory(raw.items,raw.resources).stockReliable?parseOperationInventory(inputs.items,inputs.resources):{stock:new Map(),stockReliable:false};
  const sourceFacts=Object.fromEntries(results.map(([key,,sourceAt],i)=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,scope:{kind:'ACCOUNT'},source:queries[i][2],sourceAt,reliable:i===0?buildings!==null:i===1?pets!==null:inventory.stockReliable})]));
  const facts={module:moduleId,parameters,context,catalog:cat,inputs,buildings,pets,...inventory,sourceFacts,startClock,endClock:clockOf(client,context),available:Object.keys(protocol??{}),notes,state:{context,buildings,pets}};
  liveFacts.set(facts,{client,player,digest:digest(facts)});return facts;
}
function authority(f,config){
  const live=liveFacts.get(f),c=f?.context;
  if(!live||live.digest!==digest(f)||!same(c,contextOf(live.client,live.player))||!id(c.accountId)||!id(c.connectionId)||!uint(c.generation)||!c.playerId||!c.worldId||!same(f.catalog,catalog(config))||!f.catalog||!f.buildings||!f.pets||!f.stockReliable||!(f.stock instanceof Map))return false;
  return queries.every(([key,,source])=>f.sourceFacts?.[key]?.provenance?.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,scope:{kind:'ACCOUNT'},maxAgeMs:30000}).status==='FRESH');
}
function currentClock(f){
  const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null;
  return clock&&f.startClock&&f.endClock&&f.startClock.earliest<=f.endClock.earliest&&f.endClock.earliest<=clock.earliest?clock:null;
}
export function petDependencyVersions({config,moduleConfig=PET_DEFAULT_CONFIG}={}){
  return {moduleConfig:validatePetConfig(moduleConfig),...Object.fromEntries(tables.map(n=>['config.'+n,copy(config?.tables?.[n]??null)]))};
}
function candidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG}={}){
  p=validatePetParameters(p);moduleConfig=validatePetConfig(moduleConfig);
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
  for(const b of rooms)if(!p.buildingId||p.buildingId===b.buildingId)for(const job of b.petBreed.breedQ)if(!own(p,'jobIdx')||p.jobIdx===job.idx)choices.push({action:'feed',buildingId:b.buildingId,jobIdx:job.idx});
  const candidates=(choices.length?choices:[p]).map(choice=>{
    const c=candidate(f,choice,{config,moduleConfig});return without(c,['identity','configEvidence']);
  });
  return {module:moduleId,rooms:rooms.map(b=>({buildingId:b.buildingId,level:b.level,queue:copy(b.petBreed)})),pets:valid?copy(f.pets):[],secondsReduced:valid?f.catalog.seconds:null,
    candidates,blocked:candidates.filter(c=>!c.executable),notes:[...(f?.notes??[])],evidence:PET_EVIDENCE};
}
export function planPet(f,{config,moduleConfig,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable?f.stock:null)}={}){
  const c=candidate(f,parameters,{config,moduleConfig});
  return c.executable&&(selections===undefined||selections.includes(c.actionId))&&ledger.reserve(c.costs)?{module:moduleId,actions:[c],notes:[]}:{module:moduleId,actions:[],notes:[c.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
export function verifyPet(op,b,a){
  const fail=reason=>({confirmed:false,reason});let p;try{p=validatePetParameters(op?.parameters);}catch{return fail('PET_OPERATION_CONTRACT_INVALID');}
  const config={tables:op?.configEvidence??{}};
  if(!authority(b,config)||!authority(a,config)||!same(b.context,a.context))return fail('PET_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(queries.some(([key])=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('PET_POST_READ_PREDATES_BASELINE');
  // Reconstruct with the original queue and costs. A late read must still prove
  // the original job could not have matured naturally without this feed.
  const contract=candidate(b,p,{config,moduleConfig:{enabled:true}});
  if(!contract.executable||['module','actionId','actionType','target','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','configEvidence'].some(k=>!same(op[k],contract[k])))return fail('PET_OPERATION_CONTRACT_MISMATCH');
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
  const debits=new Map(contract.costs.map(r=>[r.id,r.num]));
  if([...new Set([...b.stock.keys(),...a.stock.keys(),...debits.keys()])].some(k=>(a.stock.get(k)??0)!==(b.stock.get(k)??0)-(debits.get(k)??0)))return fail('PET_EXACT_MATERIAL_DEBITS_NOT_CONFIRMED');
  if(!authority(b,config)||!authority(a,config))return fail('PET_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:'完整OnWater与AllPet及库存确认同批队列单次投喂、精确材料净扣和减时/成熟转移；未自动领取',afterState:{building:copy(after),effect}};
}
export const petModule=Object.freeze({id:moduleId,label:'海兽培育与投喂',capabilities:Object.freeze(['BIZ-R08']),defaultConfig:PET_DEFAULT_CONFIG,validateConfig:validatePetConfig,validateParameters:validatePetParameters,
  survey:surveyPet,view:viewPet,plan:planPet,verify:verifyPet,rejectionIdentity:businessRejectionIdentityFromHistory,dependencyVersions:petDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...tables.map(n=>'config.'+n)])});
