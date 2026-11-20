// BIZ-R08 domain adapter. The shared executor owns permits, budgets and recovery.
import { createHash } from 'node:crypto';
import { assertPaymentAllowed } from './actions.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity, RESOURCE_NAMES } from './resource-ledger.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime, gameTimeBounds } from './state-facts.mjs';
import { readPetRevision, readPlayerLevelEvent, readVipLevelEvent } from './client.mjs';
import { makeTypeResolver } from './world.mjs';

const moduleId='pet',type='宠物培育室';
const tables=['BuildingCfg','PetParamCfg','PetBaseCfg','ItemCfg'];
const levelTables=['PetLevelCfg','PetAdvancedCfg'];
const starTables=['PetStarCfg','PetBreedCfg'];
const attributeActions=['switch-attrs','save-reroll','discard-reroll','reroll','init-attrs'];
const randomAttributeActions=['reroll','init-attrs'];
export const PET_INIT_ATTRIBUTE_EVIDENCE=Object.freeze({source:'v76 PetRerollPanel._isOpenPlan2/_onClickTab; PetInitExtAttrRequest extIdx=2, no material-cost branch; separate _onClickChangePlan owns activation',panelSha256:'44b7c728a4575b2416e143453f89ea8ea133b64c6cc2f3a5e1bbc3bb82615b30',request:'PetInitExtAttrRequest',response:null,scope:'INITIALIZE_EMPTY_SECOND_RED_TWO_STAR_GROUP_WITHOUT_SWITCHING_OR_OVERWRITING_PENDING_RESULT',realGame:'REAL_UNVERIFIED'});
const servingActions=['level','star','serve-feed',...attributeActions];
const revisionActions=['star','serve-feed',...attributeActions];
const attributeTables=['PetBreedCfg','PetRerollCfg'];
const rerollTables=[...attributeTables,'PetRandomAttrLibCfg','AdditionAttrOverviewCfg','HeroCareerCfg','HeroFactionCfg'];
export const PET_REROLL_EVIDENCE=Object.freeze({source:'v76 PetRerollPanel._onClickReroll/_onLockToggle/_applyLockChange/_refreshMainUI; PetUtil.petRerollCfg/attrList; PetRerollCfg exact cost and lockCost; PetRandomAttrLibCfg and AdditionAttrOverviewCfg',panelSha256:'44b7c728a4575b2416e143453f89ea8ea133b64c6cc2f3a5e1bbc3bb82615b30',request:'PetRerollAttrRequest',response:null,scope:'ONE_OWNED_MATERIAL_REROLL_ZERO_TO_TWO_EXPLICIT_ONE_BASED_LOCKS',randomResult:'INDEPENDENT_PENDING_RESULT_ONLY_NO_GUARANTEED_ATTRIBUTE_VALUE_OR_QUALITY',saveOrDiscard:'SEPARATE_ORIGINAL_ACTION',automatic:'NOT_IMPLEMENTED',realGame:'REAL_UNVERIFIED'});
const attributeSource='v76 PetRerollPanel.refreshItem/_refreshMainUI/_isOpenPlan2/_onClickTab/_onClickChangePlan/_petRerollRequest; PetUtil.petRerollCfg; current complete AllPet groups/result';
export const PET_ATTRIBUTE_EVIDENCE=Object.freeze({source:attributeSource,panelSha256:'44b7c728a4575b2416e143453f89ea8ea133b64c6cc2f3a5e1bbc3bb82615b30',requests:['PetSwitchExtAttrRequest','SavePetRerollRequest'],response:null,scope:'EXPLICIT_EXISTING_GROUP_SWITCH_OR_SAVE_DISCARD_CURRENT_PENDING_RESULT_ONLY',initialization:'EXPLICIT_SECOND_GROUP_ZERO_COST_MANUAL_ONLY',paidOrAutomaticReroll:'EXPLICIT_SINGLE_OWNED_MATERIAL_REROLL_ONLY_AUTOMATION_NOT_IMPLEMENTED',realGame:'REAL_UNVERIFIED'});
const servingFeedTables=['PetFeedAttrCfg','PetAdvancedCfg'];
const servingFeedSource='v76 PetUpgradePanel._refreshCacheData/_refreshUI/_requestFeed/_renderAttrItem; PetUtil.getBaseAttr/getPetFeedMaxCount; current PetServe.upgradeRequirements and PetFeedAttrCfg caps';
export const PET_SERVING_FEED_EVIDENCE=Object.freeze({source:servingFeedSource,panelSha256:'62fa1fc028fefa9c29a9d1454be706af70d8c30c037d0dec4200187f058a0872',petUtilSha256:'1c732f7fb14e03989390bfc9fc0369702c0d7020db46fb6d5f766f9c590f2191',request:'PetUpgradeFeedRequest',response:null,scope:'ONE_EXPLICIT_SERVING_PET_FEED_WITH_OWNED_CURRENT_MATERIALS_AND_OBSERVED_BOUNDED_PROGRESS',randomResult:'OBSERVE_SERVER_VALUES_WITHOUT_PREDICTING_ATTRIBUTE_OR_INCREMENT_COUNT',advancedGradeReset:'BLOCKED_EVIDENCE',realGame:'REAL_UNVERIFIED'});
const starSource='v76 PetStarUp._onBtnUpgradeStar/_requestUpgradeStarInfo/_refreshCost; PetUtil.getPetStarUpState/starCfg; PetStarCfg exact two owned materials and typed PetPreviewStarUpResponse';
export const PET_STAR_EVIDENCE=Object.freeze({source:starSource,petStarUpSha256:'356d35d753e295636d8df97fa758c93e0eb6f15e44f71c6717d7b8393146acae',petUtilSha256:'1c732f7fb14e03989390bfc9fc0369702c0d7020db46fb6d5f766f9c590f2191',scope:'EXPLICIT_UNIQUE_SERVING_RED_PET_ONE_STAR_WITH_TYPED_PREVIEW',request:'PetStarUpRequest',response:null,preview:'PetPreviewStarUpRequest/PetPreviewStarUpResponse',realGame:'REAL_UNVERIFIED'});
const breedTables=['PetBreedCfg','PetSpeciesCfg'];
const geneTables=[...breedTables,'SelectPackLibCfg'];
const autoWorkTables=['VipLevelCfg','VipEffectCfg'];
const levelSource='v76 PetLevelUpPanel._initPet/_refreshUI/_toUpRequest; PetUtil.curMaxLevel/petBaseAttr/buildExtraAttrArr; PetModel.SCPetsUpdate; PetLevelCfg and PetAdvancedCfg';
const queries=[['water','OnWaterRequest','OnWaterResponse'],['pets','AllPetRequest','AllPetResponse'],['items','AllItemRequest','AllItemResponse'],['resources','AllResourceRequest','AllResourceResponse']];
const source='v76 PetFeedView._onBtnFood; PetUtil.breedSpeedSeconds; local reference pet.mjs#planPet; DispPetBreedJob and PetParamCfg[投喂减少培育时间]';
export const PET_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const PET_EVIDENCE=Object.freeze({source,requirement:'BIZ-R08',request:'PetFeedRequest',response:'NO_DEDICATED_RESPONSE',
  initializeAttributes:PET_INIT_ATTRIBUTE_EVIDENCE,reroll:PET_REROLL_EVIDENCE,attributes:PET_ATTRIBUTE_EVIDENCE,servingFeed:PET_SERVING_FEED_EVIDENCE,star:PET_STAR_EVIDENCE,level:Object.freeze({request:'PetLevelUpRequest',response:'NO_DEDICATED_RESPONSE',source:levelSource}),ordinaryBreed:Object.freeze({source:'v76 PetFeedView._onBtnBreed/_refreshBreedCost/_refreshBreedSelect; PetUtil.speciesCfgBySeason; PetBreedCfg/PetSpeciesCfg',readOnly:true,executable:false,universal:false}),breed:Object.freeze({source:'v76 PetFeedView._onClickQueueItem/_onBtnBreed/_refreshBreedCost/_refreshFoodTime; WellKnownBuilding.BUILDING_PET_BREED_ID; PetBreedCfg/PetSpeciesCfg',request:'PetBreedRequest',response:null,scope:'EXPLICIT_OWNED_ORDINARY_GENES_ONE_NEW_QUEUE_JOB',viewSha256:'568bc1d29f04046d22922c18e526a8ced0afdfc00d0604c31215c5c5e230b6a6',petUtilSha256:'1c732f7fb14e03989390bfc9fc0369702c0d7020db46fb6d5f766f9c590f2191',buildingSha256:'3019b1a2782a28f791313db76f3c186712eca5a1e0e3c6a5b1aefc35cd26bcc2',universal:false}),claim:Object.freeze({source:'v76 PetFeedView._onBtnReward + WellKnownBuilding.BUILDING_PET_BREED_ID + PetModel._onSCPetsUpdate',request:'GetMaturePetRequest',response:null,scope:'EXPLICIT_CURRENT_MATURE_LIST',viewSha256:'568bc1d29f04046d22922c18e526a8ced0afdfc00d0604c31215c5c5e230b6a6',buildingSha256:'3019b1a2782a28f791313db76f3c186712eca5a1e0e3c6a5b1aefc35cd26bcc2',modelSha256:'efb4bb9f5d1235fdd2da33fe10ccbd391a628aeb047c5710875c7bc607dd8008'}),geneExchange:Object.freeze({source:'v76 PetFeedView._onBtnShowExchange/_refreshBreedCost; PetUtil.getUniversalItemId; FragExchangePop._refreshInfo/_onBtnExchange; AllItemsModel.WellKnownItems; SelectPackLibCfg',request:'PetFragExchangeRequest',response:null,ratio:'1:1',popupSha256:'cb98aefaca24d75fd3a5c0f9ea34909eedd3f81b3299eb257f627027b8324911',itemsSha256:'314e146f90c722d918114fbc42f5be4e16c72300652ef0f1e3f8ac2c579b35db'}),universal:'EXPLICIT_OWNED_PACK_EXCHANGE_ONLY',inlineUniversal:'EXCLUDED',automaticClaim:'EXCLUDED',realGame:'REAL_UNVERIFIED'});
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
  if(!fields(v,['action','buildingId','jobIdx','uid','expectedMatureHash','petId','expectedBreedHash','num','expectedStopHash','extIdx','lockedSlots']))throw invalid('海兽仅允许明确action、建筑、任务/海兽及原成熟或培育批次标识');
  if(own(v,'action')&&!['feed',...servingActions,'claim','breed','gene-exchange','stop-auto'].includes(v.action))throw invalid('仅支持原培育/服役成长、已有属性组切换或当前洗炼结果保存/放弃、基因兑换和停止自动工作');
  if(own(v,'buildingId')&&!id(v.buildingId))throw invalid('buildingId 必须为明确培育室 ID');
  if(own(v,'jobIdx')&&!uint(v.jobIdx))throw invalid('jobIdx 必须为明确的非负 int32，不能使用显示槽位代替');
  if(own(v,'uid')&&(typeof v.uid!=='string'||exactUid(v.uid)!==v.uid))throw invalid('uid 必须为明确十进制海兽 UID');
  if(servingActions.includes(v.action)&&own(v,'jobIdx')||!servingActions.includes(v.action)&&own(v,'uid'))throw invalid('升级 UID 与投喂 jobIdx 不得混用');
  if(v.action==='claim'&&(own(v,'jobIdx')||own(v,'uid'))||own(v,'expectedMatureHash')&&(v.action!=='claim'||typeof v.expectedMatureHash!=='string'||! /^[a-f0-9]{64}$/.test(v.expectedMatureHash)))throw invalid('成熟领取只绑定明确培育室及当前完整成熟列表摘要，不使用队列或已有海兽UID');
  if(v.action==='breed'&&['jobIdx','uid','expectedMatureHash'].some(k=>own(v,k))||own(v,'petId')&&(!['breed','gene-exchange'].includes(v.action)||!id(v.petId))||own(v,'expectedBreedHash')&&(v.action!=='breed'||typeof v.expectedBreedHash!=='string'||! /^[a-f0-9]{64}$/.test(v.expectedBreedHash)))throw invalid('普通培育仅绑定明确海兽与当前队列标识，不混入投喂、成长或成熟领取');
  if(v.action==='gene-exchange'&&['buildingId','jobIdx','uid','expectedMatureHash','expectedBreedHash'].some(k=>own(v,k))||own(v,'num')&&(v.action!=='gene-exchange'||!positive(v.num)))throw invalid('基因兑换只使用明确petId和正整数num，不混入培育、成长或领取目标');
  if(v.action==='stop-auto'&&['jobIdx','uid','expectedMatureHash','petId','expectedBreedHash','num'].some(k=>own(v,k))||own(v,'expectedStopHash')&&(v.action!=='stop-auto'||typeof v.expectedStopHash!=='string'||! /^[a-f0-9]{64}$/.test(v.expectedStopHash)))throw invalid('停止自动工作仅允许明确原培育室、stop-auto及当前状态摘要，不设置isOn或混入培育/成本');
  if(own(v,'extIdx')&&(v.action!=='switch-attrs'||![1,2].includes(v.extIdx)))throw invalid('extIdx只用于switch-attrs，且必须明确1或2，不初始化新组');
  if(own(v,'lockedSlots')&&(v.action!=='reroll'||!dense(v.lockedSlots)||Object.getPrototypeOf(v.lockedSlots)!==Array.prototype||v.lockedSlots.length>2||Reflect.ownKeys(v.lockedSlots).length!==v.lockedSlots.length+1||!Array.from({length:v.lockedSlots.length},(_,i)=>Object.getOwnPropertyDescriptor(v.lockedSlots,String(i))).every(d=>d?.enumerable&&own(d,'value')&&positive(d.value))||!unique(v.lockedSlots,n=>n)))throw invalid('单次材料洗炼须明确0至2个唯一的原1基锁槽，不能指定随机属性、购买或自动循环');
  return {...v,...(v.action==='reroll'&&own(v,'lockedSlots')?{lockedSlots:[...v.lockedSlots].sort((a,b)=>a-b)}:{})};
}
function catalog(config,action='feed'){
  const t=Object.fromEntries(tables.map(n=>[n,config?.tables?.[n]?.data])),b=t.BuildingCfg,p=t.PetParamCfg,base=t.PetBaseCfg,items=t.ItemCfg;
  if(![b,p,base,items].every(dense)||!b.length||!base.length||!items.length
    ||!b.every(r=>own(r,'buildingType')&&id(r.buildingType))||!unique(b,r=>r.buildingType)||!b.some(r=>r.buildingType===type)
    ||!base.every(r=>own(r,'petId')&&id(r.petId)&&own(r,'star')&&uint(r.star))||!unique(base,r=>r.petId+':'+r.star)
    ||!items.every(r=>own(r,'id')&&id(r.id))||!unique(items,r=>r.id))return null;
  const speed=p.filter(r=>own(r,'paramName')&&r.paramName==='投喂减少培育时间');
  if(![...servingActions,'claim','breed','gene-exchange','stop-auto'].includes(action)&&(speed.length!==1||!own(speed[0],'paramValue')||!positive(speed[0].paramValue)))return null;
  return {seconds:[...servingActions,'claim','breed','gene-exchange','stop-auto'].includes(action)?null:speed[0].paramValue,types:b.map(r=>r.buildingType),pets:base.map(({petId,star})=>({petId,star})),itemIds:items.map(r=>r.id)};
}
// Original ordinary gene/GOLD observations remain read-only. Explicit breed
// actions below additionally freeze the full room/pool and verify one new job;
// these conditions alone never emit a write or authorize universal exchange.
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
  const base={readOnly:true,executable:false,universal:false,blockedReason:'PET_BREED_EXPLICIT_QUEUE_SELECTION_REQUIRED'};
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
function autoWorkSourceOf(client,context){
 const value=readVipLevelEvent(client);
 return value.reliable===true&&uint(value.vipLevel)&&id(value.streamId)&&uint(value.cursor)&&['LoginResponse.playerInfo.vip','SCVipUpdate'].includes(value.source)&&Object.keys(context).every(k=>value[k]===context[k])?{vipLevel:value.vipLevel,streamId:value.streamId,cursor:value.cursor,source:value.source,context:copy(context)}:null;
}
function levelSourceOf(client,context){
  const revision=readPetRevision(client,context),level=readPlayerLevelEvent(client);
  return revision&&level.reliable&&positive(level.playerLevel)&&Object.keys(context).every(k=>level[k]===context[k])?{revision,playerLevel:level.playerLevel}:null;
}
export async function surveyPet(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
  parameters=validatePetParameters(parameters);const active=()=>assertExecutionActive(client,{signal,stop}),context=contextOf(client,player),notes=[],startClock=clockOf(client,context),levelSourceBefore=parameters.action==='level'?levelSourceOf(client,context):null;active();
  const autoWorkSourceBefore=parameters.action==='stop-auto'?autoWorkSourceOf(client,context):null;
  const starSourceBefore=revisionActions.includes(parameters.action)?readPetRevision(client,context):null;
  const results=await Promise.all(queries.map(async([key,request,response])=>{
    active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return [key,null,null];}
    try{const raw=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,{signal,stop});return [key,raw,Date.now()];}
    catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}
  }));active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('海兽调查期间账号或连接改变'),{code:'CANCELLED'});
  const raw=Object.fromEntries(results.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),cat=catalog(config,parameters.action);
  const buildings=parseWater(raw.water,config,cat)&&parseWater(inputs.water,config,cat),pets=parsePets(raw.pets,cat)&&parsePets(inputs.pets,cat);
  const inventory=parseOperationInventory(raw.items,raw.resources).stockReliable?parseOperationInventory(inputs.items,inputs.resources):{stock:new Map(),stockReliable:false};
  const sourceFacts=Object.fromEntries(results.map(([key,,sourceAt],i)=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,scope:{kind:'ACCOUNT'},source:queries[i][2],sourceAt,reliable:i===0?buildings!==null:i===1?pets!==null:inventory.stockReliable})]));
  const starPreviews=[];
  if(parameters.action==='star'&&starSourceBefore&&buildings&&pets){
    const resolve=makeTypeResolver(config),selected=buildings.filter(b=>['宠物','宠物B','宠物C'].includes(resolve(b.buildingId))&&(!parameters.buildingId||b.buildingId===parameters.buildingId));
    if(selected.length>24)notes.push('PET_STAR_EXPLICIT_SERVING_TARGET_REQUIRED');
    else for(const b of selected){
      const uid=exactUid(b.petServe?.petUid),pet=pets.find(row=>row.uid===uid);
      if(!uid||parameters.uid&&parameters.uid!==uid||!starCost(config,pet,cat))continue;
      active();if(!protocol?.PetPreviewStarUpRequest||!protocol?.PetPreviewStarUpResponse){notes.push('PetPreviewStarUpRequest: PROTOCOL_UNAVAILABLE');break;}
      try{const raw=await awaitExecution(client.request('PetPreviewStarUpRequest',{buildingId:b.buildingId},'PetPreviewStarUpResponse',timeout,{signal}),client,{signal,stop});active();
        const parsed=own(raw,'pet')?parsePets({pets:[raw.pet]},cat):null,value=parsed?.[0]??null;
        starPreviews.push({buildingId:b.buildingId,uid,pet:value,fact:createStateFact(value,{accountId:context.accountId,generation:context.generation,scope:{kind:'ACCOUNT'},source:'PetPreviewStarUpResponse.pet',sourceAt:Date.now(),reliable:value!==null})});
      }catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push('PetPreviewStarUpRequest: STATE_UNKNOWN');}
    }
  }
  active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('海兽星级预览期间账号或连接改变'),{code:'CANCELLED'});
  const starSourceAfter=revisionActions.includes(parameters.action)?readPetRevision(client,context):null;
  const levelSourceAfter=parameters.action==='level'?levelSourceOf(client,context):null;
  const autoWorkSourceAfter=parameters.action==='stop-auto'?autoWorkSourceOf(client,context):null;
  const facts={...(randomAttributeActions.includes(parameters.action)?{rerollEnums:copy(protocol?.EnhanceAttr??null)}:{}),...(attributeActions.includes(parameters.action)?{attributeSource:starSourceBefore&&same(starSourceBefore,starSourceAfter)?starSourceAfter:null}:{}),...(parameters.action==='serve-feed'?{servingFeedSource:starSourceBefore&&same(starSourceBefore,starSourceAfter)?starSourceAfter:null}:{}),...(parameters.action==='star'?{starSource:starSourceBefore&&same(starSourceBefore,starSourceAfter)?starSourceAfter:null,starPreviews}:{}),autoWorkSource:autoWorkSourceBefore&&same(autoWorkSourceBefore,autoWorkSourceAfter)?autoWorkSourceAfter:null,breedDefinitions:breedDefinitions(config,cat),levelSource:levelSourceBefore&&same(levelSourceBefore,levelSourceAfter)?levelSourceAfter:null,module:moduleId,parameters,context,catalog:cat,inputs,buildings,pets,...inventory,sourceFacts,startClock,endClock:clockOf(client,context),available:Object.keys(protocol??{}).filter(name=>protocol[name]?.encode&&protocol[name]?.decode),notes,state:{context,buildings,pets}};
  liveFacts.set(facts,{client,player,digest:digest(facts)});return facts;
}
function authority(f,config,{settlement=false}={}){
  const live=liveFacts.get(f),c=f?.context;
  if(!live||live.digest!==digest(f)||!same(c,contextOf(live.client,live.player))||!id(c.accountId)||!id(c.connectionId)||!uint(c.generation)||!c.playerId||!c.worldId||!same(f.catalog,catalog(config,f.parameters?.action))||!f.catalog||!f.buildings||!f.pets||!f.stockReliable||!(f.stock instanceof Map))return false;
  if(f.parameters?.action==='stop-auto'&&(!f.autoWorkSource||!same(f.autoWorkSource,autoWorkSourceOf(live.client,c))))return false;
  if(revisionActions.includes(f.parameters?.action)){const current=readPetRevision(live.client,c),source=attributeActions.includes(f.parameters.action)?f.attributeSource:f.parameters.action==='star'?f.starSource:f.servingFeedSource;if(!source||!current||current.revision<source.revision||!settlement&&!same(current,source))return false;}
  if(f.parameters?.action==='level'){const current=levelSourceOf(live.client,c);if(!f.levelSource||!current||current.playerLevel!==f.levelSource.playerLevel||current.revision.revision<f.levelSource.revision.revision||!settlement&&!same(current,f.levelSource))return false;}
  return queries.every(([key,,source])=>f.sourceFacts?.[key]?.provenance?.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,scope:{kind:'ACCOUNT'},maxAgeMs:30000}).status==='FRESH');
}
function currentClock(f){
  const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null;
  return clock&&f.startClock&&f.endClock&&f.startClock.earliest<=f.endClock.earliest&&f.endClock.earliest<=clock.earliest?clock:null;
}
export function petDependencyVersions({config,moduleConfig=PET_DEFAULT_CONFIG,parameters={}}={}){
  return {moduleConfig:validatePetConfig(moduleConfig),...Object.fromEntries([...tables,...(parameters.action==='level'?levelTables:randomAttributeActions.includes(parameters.action)?rerollTables:attributeActions.includes(parameters.action)?attributeTables:parameters.action==='star'?starTables:parameters.action==='serve-feed'?servingFeedTables:parameters.action==='breed'?breedTables:parameters.action==='gene-exchange'?geneTables:parameters.action==='stop-auto'?autoWorkTables:[])].map(n=>['config.'+n,copy(config?.tables?.[n]??null)]))};
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
function starCost(config,pet,cat){
  const breeds=config?.tables?.PetBreedCfg?.data,rows=config?.tables?.PetStarCfg?.data;
  if(!pet||!uint(pet.star)||pet.star>=5||!dense(breeds)||!unique(breeds,r=>r.petId)||!dense(rows)||!unique(rows,r=>r.spId+':'+r.star))return null;
  const breed=breeds.find(row=>row.petId===pet.petId),next=rows.find(row=>row.spId===breed?.spId&&row.star===pet.star+1);
  if(breed?.quality!=='RED'||!positive(breed.spId)||breed.spId>6||!cat?.pets.some(row=>row.petId===pet.petId&&row.star===pet.star+1)||!next||!dense(next.cost)||next.cost.length!==2)return null;
  const [stone,experience]=next.cost;
  if(![stone,experience].every(pair=>dense(pair)&&pair.length===2&&id(pair[0])&&positive(pair[1])&&cat.itemIds.includes(pair[0]))||stone[0]!=='宠物'+breed.spId+'升星石'||experience[0]!=='宠物经验')return null;
  return [{id:stone[0],num:stone[1]},{id:experience[0],num:experience[1]}].sort((a,b)=>a.id.localeCompare(b.id));
}
function starPolicy(f,p,config,pet){
  const costs=starCost(config,pet,f.catalog),row=f.starPreviews?.find(row=>row.buildingId===p.buildingId&&row.uid===p.uid),preview=row?.pet;
  const complete=value=>value&&dense(value.baseAttrs)&&value.baseAttrs.length===3&&unique(value.baseAttrs,a=>a.attr)&&value.baseAttrs.every(a=>own(a,'attr')&&[1,2,3].includes(a.attr)&&own(a,'value')&&Number.isSafeInteger(a.value)&&a.value>=0)&&['baseAttrs','extAttrs','extAttrs2','profFeed','rerollAttrs'].every(key=>own(value,key)&&dense(value[key]))&&own(value,'grade')&&uint(value.grade)&&own(value,'extAttrIdx')&&[1,2].includes(value.extAttrIdx);
  if(!costs||!complete(pet)||!complete(preview)||preview.uid!==pet.uid||preview.petId!==pet.petId||preview.star!==pet.star+1||!same(without(pet,['star','baseAttrs','extAttrs','extAttrs2']),without(preview,['star','baseAttrs','extAttrs','extAttrs2']))||!same(row.fact?.value,preview)||row.fact?.provenance?.source!=='PetPreviewStarUpResponse.pet'||factsFreshnessPolicy(row.fact,{accountId:f.context.accountId,generation:f.context.generation,scope:{kind:'ACCOUNT'},maxAgeMs:30000}).status!=='FRESH')return null;
  return {pet:copy(preview),costs};
}
// PetUtil fills a missing profession with three zero counters. A material feed
// chooses its result on the server; caps and monotonic progress are observed,
// without inventing the selected attribute, increment count or numeric amount.
function servingFeedProgress(pet,config){
 const rows=config?.tables?.PetFeedAttrCfg?.data,grades=config?.tables?.PetAdvancedCfg?.data;
 if(!pet||!own(pet,'grade')||!uint(pet.grade)||!own(pet,'profFeed')||!dense(pet.profFeed)||!dense(rows)||!dense(grades)||grades.filter(r=>r?.grade===pet.grade).length!==1)return null;
 const limits=rows.filter(r=>r?.level===pet.grade);
 if(limits.length!==4||!unique(limits,r=>r.job)||!['法师','射手','战士','坦克'].every(job=>limits.some(r=>r.job===job))||!limits.every(r=>own(r,'level')&&own(r,'job')&&dense(r.attrCounts)&&r.attrCounts.length===3&&r.attrCounts.every(positive)))return null;
 if(!unique(pet.profFeed,r=>r?.heroProf)||!pet.profFeed.every(row=>fields(row,['heroProf','attrFeed'])&&limits.some(r=>r.job===row.heroProf)&&own(row,'attrFeed')&&dense(row.attrFeed)&&row.attrFeed.length===3&&row.attrFeed.every((a,i)=>fields(a,['attr','times','value'])&&own(a,'attr')&&a.attr===i+1&&own(a,'times')&&uint(a.times)&&own(a,'value')&&typeof a.value==='number'&&Number.isFinite(a.value)&&a.value>=0&&a.value<=Number.MAX_SAFE_INTEGER)))return null;
 const normalized=limits.map(r=>{const found=pet.profFeed.find(p=>p.heroProf===r.job);return {heroProf:r.job,attrFeed:found?copy(found.attrFeed):[1,2,3].map(attr=>({attr,times:0,value:0}))};}).sort((a,b)=>a.heroProf.localeCompare(b.heroProf));
 const caps=limits.map(r=>({heroProf:r.job,counts:copy(r.attrCounts)})).sort((a,b)=>a.heroProf.localeCompare(b.heroProf));
 if(normalized.some((r,i)=>r.attrFeed.some((a,j)=>a.times>caps[i].counts[j])))return null;
 const count=normalized.reduce((n,r)=>n+r.attrFeed.reduce((n,a)=>n+a.times,0),0),capacity=caps.reduce((n,r)=>n+r.counts.reduce((a,b)=>a+b,0),0);
 return Number.isSafeInteger(count)&&Number.isSafeInteger(capacity)?{grade:pet.grade,normalized,caps,count,capacity}:null;
}
function servingFeedPolicy(f,p,config,pet,building){
 const progress=servingFeedProgress(pet,config),requirements=building?.petServe?.upgradeRequirements,costs=costsOf(requirements,f.catalog);
 return progress&&progress.count<progress.capacity&&own(building?.petServe,'upgradeRequirements')&&costs?{progress,costs}:null;
}
const completePetAttributeList=value=>dense(value)&&value.every(row=>fields(row,['attrValue','heroProf','heroCamp'])&&own(row,'attrValue')&&fields(row.attrValue,['attr','value','rating'])&&own(row.attrValue,'attr')&&positive(row.attrValue.attr)&&own(row.attrValue,'value')&&typeof row.attrValue.value==='number'&&Number.isFinite(row.attrValue.value)&&row.attrValue.value>=0&&row.attrValue.value<=Number.MAX_SAFE_INTEGER&&(!own(row.attrValue,'rating')||uint(row.attrValue.rating))&&['heroProf','heroCamp'].every(k=>!own(row,k)||typeof row[k]==='string'));
function originalAttributePools(f,config,breed,slotCount){
 const libs=config?.tables?.PetRandomAttrLibCfg?.data,overview=config?.tables?.AdditionAttrOverviewCfg?.data,careers=config?.tables?.HeroCareerCfg?.data,factions=config?.tables?.HeroFactionCfg?.data;
  if(!dense(breed.extraAtts)||breed.extraAtts.length!==slotCount||!breed.extraAtts.every(positive)||!dense(libs)||!dense(overview)||!unique(overview,r=>r.id)||!dense(careers)||!dense(factions)||!careers.every(r=>id(r.career))||!factions.every(r=>id(r.faction))||!f?.rerollEnums)return null;
  const pools=[];
  for(const libId of breed.extraAtts){const rows=libs.filter(r=>r.libId===libId),codes=[];if(!rows.length)return null;for(const row of rows){if(!positive(row.weight)||!dense(row.baseAttr)||row.baseAttr.length!==2||!id(row.baseAttr[0])||typeof row.baseAttr[1]!=='number'||!Number.isFinite(row.baseAttr[1])||row.baseAttr[1]<=0)return null;const attr=overview.find(r=>r.id===row.baseAttr[0]),code=f.rerollEnums[attr?.enhanceAttr];if(!positive(code))return null;codes.push(code);}pools.push([...new Set(codes)].sort((a,b)=>a-b));}
 return {slotCount,pools,careers:careers.map(r=>r.career),factions:factions.map(r=>r.faction)};
}
function attributePolicy(p,config,pet,f=null){
 const breeds=config?.tables?.PetBreedCfg?.data,rows=config?.tables?.PetRerollCfg?.data;

 if(!pet||!own(pet,'extAttrIdx')||![1,2].includes(pet.extAttrIdx)||!['extAttrs','extAttrs2','rerollAttrs'].every(k=>own(pet,k)&&completePetAttributeList(pet[k]))||!dense(breeds)||!unique(breeds,r=>r.petId)||!dense(rows)||!unique(rows,r=>r.quality+':'+r.star+':'+r.lockCount))return null;
 const breed=breeds.find(r=>r.petId===pet.petId),rule=rows.find(r=>r.quality===breed?.qualityIndex+1&&r.star===pet.star&&r.lockCount===0),openSecond=breed?.qualityIndex>=4&&pet.star>=2;
 if(!breed||!uint(breed.qualityIndex)||!rule||pet.extAttrIdx===2&&!openSecond)return null;
 const selected=pet.extAttrIdx===1?'extAttrs':'extAttrs2';if(!pet[selected].length)return null;
 const result=copy(pet);
 if(p.action==='init-attrs'){
  if(!openSecond||pet.extAttrIdx!==1||pet.extAttrs2.length!==0)return null;
  const random=originalAttributePools(f,config,breed,pet.extAttrs.length);
  return random?{pet:null,costs:[],fromExtIdx:1,toExtIdx:1,resultHash:hash({first:pet.extAttrs,pending:pet.rerollAttrs,initializeExtIdx:2}),originalAttrs:copy(pet.extAttrs),lockedSlots:[],...random}:null;
 }
 if(p.action==='reroll'){
  if(!own(p,'lockedSlots')||pet.rerollAttrs.length!==0||p.lockedSlots.some(n=>n>pet[selected].length)||p.lockedSlots.length>0&&!rows.some(r=>r.quality===breed.qualityIndex+1&&r.star===pet.star&&r.lockCount===1))return null;
  const quote=rows.find(r=>r.quality===breed.qualityIndex+1&&r.star===pet.star&&r.lockCount===p.lockedSlots.length),material=breed.qualityIndex===3?'宠物洗炼石':breed.qualityIndex===4?'红宠物洗炼石':null;
  const pair=(v,item)=>dense(v)&&v.length===2&&v[0]===item&&positive(v[1])&&f?.catalog?.itemIds.includes(item);
  if(!quote||!material||!pair(quote.cost,material)||!dense(quote.lockCost)||p.lockedSlots.length===0&&quote.lockCost.length!==0||p.lockedSlots.length>0&&!pair(quote.lockCost,'锁定石'))return null;
  const random=originalAttributePools(f,config,breed,pet[selected].length);if(!random)return null;
  return {pet:null,costs:resourceCosts([quote.cost,...(p.lockedSlots.length?[quote.lockCost]:[])]),fromExtIdx:pet.extAttrIdx,toExtIdx:pet.extAttrIdx,resultHash:hash({attrs:pet[selected],locks:p.lockedSlots}),pending:true,slotCount:pet[selected].length,originalAttrs:copy(pet[selected]),lockedSlots:copy(p.lockedSlots),...random};
 }
 if(p.action==='switch-attrs'){
  const group=p.extIdx===1?'extAttrs':p.extIdx===2?'extAttrs2':null;
  if(!group||p.extIdx===pet.extAttrIdx||p.extIdx===2&&!openSecond||!pet[group].length||pet.rerollAttrs.length!==0)return null;
  result.extAttrIdx=p.extIdx;
 }else{
  if(!pet.rerollAttrs.length)return null;
  if(p.action==='save-reroll')result[selected]=copy(pet.rerollAttrs);
  result.rerollAttrs=[];
 }
 return {pet:result,fromExtIdx:pet.extAttrIdx,toExtIdx:result.extAttrIdx,resultHash:hash(p.action==='switch-attrs'?pet[p.extIdx===1?'extAttrs':'extAttrs2']:pet.rerollAttrs)};
}
function levelCandidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG,settlement=false}={}){
  const isAttributes=attributeActions.includes(p.action),isStar=p.action==='star',isServingFeed=p.action==='serve-feed',valid=authority(f,config,{settlement}),resolve=makeTypeResolver(config),building=valid?f.buildings.find(b=>b.buildingId===p.buildingId):null;
  const serves=valid?f.buildings.filter(b=>['宠物','宠物B','宠物C'].includes(resolve(b.buildingId))):[],servesKnown=serves.every(b=>own(b,'petServe')&&own(b.petServe,'petUid')&&(b.petServe.petUid===0||b.petServe.petUid==='0'||exactUid(b.petServe.petUid)!==null));
  const pet=valid?f.pets.find(r=>r.uid===p.uid):null,policy=valid?(isAttributes?attributePolicy(p,config,pet,f):isServingFeed?servingFeedPolicy(f,p,config,pet,building):isStar?starPolicy(f,p,config,pet):levelPolicy(config,pet,f.levelSource?.playerLevel)):null;
  const raw=policy?.next?.cost,costs=isAttributes?(policy?.costs??[]):isStar||isServingFeed?(policy?.costs??[]):dense(raw)&&raw.length===2&&raw[0]==='宠物经验'&&positive(raw[1])&&f.catalog?.itemIds.includes(raw[0])?[{id:raw[0],num:raw[1]}]:[];
  let reason=null;const action=isAttributes?{request:p.action==='init-attrs'?'PetInitExtAttrRequest':p.action==='reroll'?'PetRerollAttrRequest':p.action==='switch-attrs'?'PetSwitchExtAttrRequest':'SavePetRerollRequest',response:null,body:{buildingId:p.buildingId,...(p.action==='init-attrs'?{extIdx:2}:p.action==='reroll'?{lockedSlots:p.lockedSlots}:p.action==='switch-attrs'?{extIdx:p.extIdx}:{saveOrNot:p.action==='save-reroll'})}}:{request:isServingFeed?'PetUpgradeFeedRequest':isStar?'PetStarUpRequest':'PetLevelUpRequest',response:null,body:{buildingId:p.buildingId}};
  if(!p.buildingId||!p.uid)reason='EXPLICIT_SERVING_BUILDING_AND_PET_UID_REQUIRED';
  else if(!moduleConfig.enabled)reason='PET_MODULE_DISABLED';
  else if(!valid)reason='PET_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(!servesKnown||!building||!serves.includes(building)||!own(building,'petServe')||exactUid(building.petServe.petUid)!==p.uid||serves.filter(b=>exactUid(b.petServe.petUid)===p.uid).length!==1||!pet)reason='EXACT_UNIQUE_SERVING_PET_REQUIRED';
  else if(building.level<1||!own(building,'buildFinishTime')||building.buildFinishTime!==0)reason='AVAILABLE_SERVING_BUILDING_REQUIRED';
  else if(!policy||!isAttributes&&!costs.length)reason=isAttributes?'PET_ATTRIBUTE_GROUP_OR_PENDING_RESULT_UNAVAILABLE':isServingFeed?'PET_SERVING_FEED_CAP_OR_CURRENT_COST_UNKNOWN':isStar?'PET_STAR_CONFIG_OR_TYPED_PREVIEW_UNKNOWN':'PET_LEVEL_CONFIG_OR_EFFECT_UNKNOWN';
  else if(!isAttributes&&!isStar&&!isServingFeed&&policy.next.level>policy.maxLevel)reason='PET_PLAYER_LEVEL_LIMIT';
  else if(!f.available.includes(action.request)||f.available.includes(isAttributes?(p.action==='init-attrs'?'PetInitExtAttrResponse':p.action==='reroll'?'PetRerollAttrResponse':p.action==='switch-attrs'?'PetSwitchExtAttrResponse':'SavePetRerollResponse'):isServingFeed?'PetUpgradeFeedResponse':isStar?'PetStarUpResponse':'PetLevelUpResponse'))reason='PROTOCOL_UNAVAILABLE';
  else if(costs.some(r=>(f.stock.get(r.id)??0)<r.num))reason='PET_LEVEL_STOCK_INSUFFICIENT';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={buildingId:p.buildingId??null,uid:p.uid??null,petId:pet?.petId??null,...(isAttributes?{...(p.action==='init-attrs'?{initializeExtIdx:2}:{}),fromExtIdx:pet?.extAttrIdx??null,toExtIdx:policy?.toExtIdx??null,resultHash:policy?.resultHash??null}:isServingFeed?{grade:pet?.grade??null,fromFeedCount:policy?.progress.count??null,capacity:policy?.progress.capacity??null}:isStar?{fromStar:pet?.star??null,toStar:pet?pet.star+1:null}:{fromLevel:pet?.level??null,toLevel:policy?.next.level??null})};
  const configEvidence=Object.fromEntries([...tables,...(randomAttributeActions.includes(p.action)?rerollTables:isAttributes?attributeTables:isServingFeed?servingFeedTables:isStar?starTables:levelTables)].map(n=>[n,copy(config?.tables?.[n]??null)]));
  return {module:moduleId,actionId:'pet:'+(isAttributes?p.action.toUpperCase():isServingFeed?'SERVE-FEED':isStar?'STAR':'LEVEL')+':'+hash(target),actionType:isAttributes?p.action.toUpperCase():isServingFeed?'SERVE-FEED':isStar?'STAR':'LEVEL',parameters:p,target,executable:reason===null,blockedReason:reason,
    identity:valid&&pet?hash({context:f.context,buildings:f.buildings,pets:f.pets,...(isAttributes?{attributeSource:f.attributeSource,expectedPet:policy?.pet??null}:isServingFeed?{servingFeedSource:f.servingFeedSource,progress:policy?.progress??null}:isStar?{starSource:f.starSource,preview:policy?.pet??null}:{levelSource:f.levelSource}),dependencies:petDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence,beforeState:pet&&building?{building:copy(building),pet:copy(pet)}:null,expectedState:policy?(randomAttributeActions.includes(p.action)?{...(p.action==='init-attrs'?{initializeExtIdx:2}:{pending:true}),activeExtIdx:policy.fromExtIdx,slotCount:policy.slotCount,originalAttrs:copy(policy.originalAttrs),lockedSlots:copy(policy.lockedSlots),pools:copy(policy.pools),careers:copy(policy.careers),factions:copy(policy.factions)}:isServingFeed?{progress:copy(policy.progress),requiresBoundedIncrease:true}:{pet:policy.pet}):null,costs,costSource:isAttributes?attributeSource:isServingFeed?servingFeedSource:isStar?starSource:levelSource,
    budgetClaims:{resources:copy(costs),quotas:[],uids:pet?[{type:'pet',id:pet.uid},{type:'pet-serving-building',id:p.buildingId}]:[]},label:(isAttributes?({'switch-attrs':'切换原海兽属性组 ','save-reroll':'保存当前海兽洗炼结果 ','discard-reroll':'放弃当前海兽洗炼结果 ','reroll':'明确材料洗炼一次 ','init-attrs':'初始化原海兽第二属性组 '})[p.action]:isServingFeed?'服役海兽材料投喂一次 ':isStar?'红海兽单次升星 ':'海兽单级升级 ')+(p.buildingId??'')+' '+(p.uid??''),...(reason===null?{action}:{})};
}
// The fixed client has one breeding room and a targetless claim-all request.
// Freeze its complete observed cohort and old pool in the original local plan;
// generated UIDs/attributes are read independently, never predicted or replayed.
function breedingRoom(f,config){
  if(!authority(f,config))return null;
  const rooms=f.buildings.filter(b=>makeTypeResolver(config)(b.buildingId)===type),b=rooms[0];
  return rooms.length===1&&b.buildingId==='1宠物培育室'&&positive(b.level)&&own(b,'auto')&&b.auto===false&&own(b,'buildFinishTime')&&b.buildFinishTime===0?b:null;
}
function matureSnapshot(f,config){
  const b=breedingRoom(f,config);return b?.petBreed.maturePets.length?{building:b,parameters:{action:'claim',buildingId:b.buildingId,expectedMatureHash:hash({context:f.context,buildings:f.buildings,pets:f.pets})}}:null;
}
function breedPreparation(f,config){
  const building=breedingRoom(f,config),clock=building?currentClock(f):null,definitions=building?breedDefinitions(config,f.catalog):null,season=building?Number(BigInt(f.context.worldId)/1000000n%1000n):null;
  if(!building||!clock||!definitions||!same(f.breedDefinitions,definitions)||!positive(season)||building.petBreed.breedQ.length>=Math.min(building.level,building.petBreed.maxQLength)||building.petBreed.breedQ.some(job=>job.finishTime<=clock.latest))return [];
  const expectedBreedHash=hash({context:f.context,buildings:f.buildings,pets:f.pets});
  return definitions.filter(row=>row.season<=season&&row.speciesSeason<=season).map(row=>({parameters:{action:'breed',buildingId:building.buildingId,petId:row.petId,expectedBreedHash},costs:copy(row.costs),breedTime:row.breedTime,stockAvailable:row.costs.every(c=>(f.stock.get(c.id)??0)>=c.num)}));
}
function breedCandidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG}={}){
  const building=breedingRoom(f,config),preparation=breedPreparation(f,config).find(row=>same(row.parameters,p)),action={request:'PetBreedRequest',response:null,body:{petId:p.petId,universal:false}},costs=preparation?.costs??[];
  let reason=null;
  if(!p.buildingId||!p.petId||!p.expectedBreedHash)reason='EXPLICIT_PET_AND_CURRENT_BREED_QUEUE_REQUIRED';
  else if(!moduleConfig.enabled)reason='PET_MODULE_DISABLED';
  else if(!preparation)reason='PET_BREED_QUEUE_SEASON_OR_SOURCE_CHANGED';
  else if(!preparation.stockAvailable)reason='PET_OWNED_GENE_OR_GOLD_INSUFFICIENT';
  else if(!f.available.includes(action.request)||f.available.includes('PetBreedResponse'))reason='PROTOCOL_UNAVAILABLE';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={buildingId:p.buildingId??null,petId:p.petId??null,expectedBreedHash:p.expectedBreedHash??null};
  return {module:moduleId,actionId:'pet:BREED:'+hash(target),actionType:'BREED',parameters:p,target,executable:reason===null,blockedReason:reason,
    identity:preparation?hash({context:f.context,buildings:f.buildings,pets:f.pets,dependencies:petDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence:Object.fromEntries([...tables,...breedTables].map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState:building?{building:copy(building)}:null,
    expectedState:preparation?{petId:p.petId,breedTime:preparation.breedTime,newJobCount:1}:null,costs,costSource:PET_EVIDENCE.breed.source,
    budgetClaims:{resources:copy(costs),quotas:[],uids:p.expectedBreedHash?[{type:'pet-breed-batch',id:p.buildingId+':'+p.expectedBreedHash}]:[]},label:'普通基因单次培育 '+(p.petId??''),...(reason===null?{action}:{})};
}
// The fixed Pet popup converts one owned gene selection pack into one chosen
// ordinary gene. Pack pools are separated at spId 4; BLUE/PURPLE have no pool 2.
function genePreparation(f,config){
  if(!breedingRoom(f,config))return [];
  const definitions=breedDefinitions(config,f.catalog),lib=config?.tables?.SelectPackLibCfg?.data,raw=config?.tables?.PetBreedCfg?.data,items=config?.tables?.ItemCfg?.data,season=Number(BigInt(f.context.worldId)/1000000n%1000n),colors={BLUE:'蓝',PURPLE:'紫',ORANGE:'橙',RED:'红'};
  if(!definitions||!same(f.breedDefinitions,definitions)||!dense(lib)||!positive(season))return [];
  return definitions.flatMap(row=>{
    const cfg=raw.find(r=>r.petId===row.petId),quality=own(cfg,'quality')?cfg.quality:null,color=colors[quality],first=row.spId<=3,sourceId=quality==='BLUE'?(first?'蓝宠基因自选包':null):quality==='PURPLE'?(first?'紫宠基因自选包':null):quality==='ORANGE'?'橙宠基因自选包'+(first?'':'2'):quality==='RED'?'红宠基因自选包'+(first?'':'2'):null,targetId=row.costs[0].id;
    const from=items.find(r=>r.id===sourceId),to=items.find(r=>r.id===targetId),selected=lib.filter(r=>own(r,'itemId')&&r.itemId===sourceId&&own(r,'selectItemId')&&r.selectItemId===targetId);
    if(!sourceId||!color||targetId!=='宠物'+row.spId+color+'基因'||!from||!own(from,'type')||from.type!=='自选包'||!own(from,'quality')||from.quality!==quality||!to||!own(to,'type')||to.type!=='宠物基因'||!own(to,'quality')||to.quality!==quality||selected.length!==1||!['type','num','season'].every(k=>own(selected[0],k))||selected[0].type!=='道具'||selected[0].num!==1||!positive(selected[0].season)||Math.max(row.season,row.speciesSeason,selected[0].season)>season)return [];
    return [{petId:row.petId,sourceId,targetId,sourceNum:f.stock.get(sourceId)??0,targetNum:f.stock.get(targetId)??0}];
  });
}
function geneCandidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG}={}){
  const route=genePreparation(f,config).find(row=>row.petId===p.petId),costs=route&&positive(p.num)?[{id:route.sourceId,num:p.num}]:[],target={petId:p.petId??null},action={request:'PetFragExchangeRequest',response:null,body:{fragItemId:route?.targetId,num:p.num}};
  let reason=null;
  if(!p.petId||!positive(p.num))reason='EXPLICIT_PET_GENE_AND_QUANTITY_REQUIRED';
  else if(!moduleConfig.enabled)reason='PET_MODULE_DISABLED';
  else if(!route)reason='PET_GENE_ROUTE_SEASON_OR_SOURCE_UNKNOWN';
  else if(!f.available.includes(action.request)||f.available.includes('PetFragExchangeResponse'))reason='PROTOCOL_UNAVAILABLE';
  else if(route.sourceNum<p.num)reason='PET_GENE_PACK_STOCK_INSUFFICIENT';
  else if(safeResourceQuantity(route.targetNum+p.num)===null)reason='PET_GENE_TARGET_OVERFLOW';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const beforeState=route?copy(route):null;
  return {module:moduleId,actionId:'pet:GENE-EXCHANGE:'+hash({target,parameters:p}),actionType:'GENE-EXCHANGE',parameters:p,target,executable:reason===null,blockedReason:reason,
    identity:route?hash({context:f.context,buildings:f.buildings,pets:f.pets,beforeState,dependencies:petDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence:Object.fromEntries([...tables,...geneTables].map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState,expectedState:reason===null?{...copy(route),sourceNum:route.sourceNum-p.num,targetNum:route.targetNum+p.num}:null,costs,costSource:PET_EVIDENCE.geneExchange.source,
    budgetClaims:{resources:copy(costs),quotas:[],uids:route?[{type:'pet-gene-exchange',id:route.targetId}]:[]},label:'基因自选包明确兑换 '+(p.petId??'')+' '+(p.num??''),...(reason===null?{action}:{})};
}
function claimCandidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG}={}){
  const valid=authority(f,config),snapshot=valid?matureSnapshot(f,config):null,clock=valid?currentClock(f):null,building=snapshot?.building;
  let reason=null;const action={request:'GetMaturePetRequest',response:null,body:{}},costs=[];
  if(!p.buildingId||!p.expectedMatureHash)reason='EXPLICIT_CURRENT_MATURE_LIST_REQUIRED';
  else if(!moduleConfig.enabled)reason='PET_MODULE_DISABLED';
  else if(!snapshot||!same(p,snapshot.parameters))reason='PET_MATURE_LIST_OR_POOL_CHANGED';
  else if(!clock||building.petBreed.breedQ.some(job=>job.finishTime<=clock.latest))reason='PET_MATURITY_CLOCK_OR_RUNNING_QUEUE_AMBIGUOUS';
  else if(!f.available.includes(action.request)||f.available.includes('GetMaturePetResponse'))reason='PROTOCOL_UNAVAILABLE';
  else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
  const target={buildingId:p.buildingId??null,expectedMatureHash:p.expectedMatureHash??null};
  return {module:moduleId,actionId:'pet:CLAIM:'+hash(target),actionType:'CLAIM',parameters:p,target,executable:reason===null,blockedReason:reason,
    identity:snapshot?hash({context:f.context,buildings:f.buildings,pets:f.pets,dependencies:petDependencyVersions({config,moduleConfig,parameters:p})}):null,
    configEvidence:Object.fromEntries(tables.map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState:building?{building:copy(building),pets:copy(f.pets)}:null,
    expectedState:building?{maturePets:[],newPets:building.petBreed.maturePets.map(({petId,star})=>({petId,star,level:1}))}:null,costs,costSource:PET_EVIDENCE.claim.source,
    budgetClaims:{resources:[],quotas:[],uids:p.expectedMatureHash?[{type:'pet-mature-batch',id:p.buildingId+':'+p.expectedMatureHash}]:[]},label:'领取当前完整成熟海兽列表 '+(building?.petBreed.maturePets.length??0)+'只',...(reason===null?{action}:{})};
}
function stopAutoPreparation(f,config){
 if(!authority(f,config))return null;
 const effects=config?.tables?.VipEffectCfg?.data,levels=config?.tables?.VipLevelCfg?.data,source=f.autoWorkSource,clock=currentClock(f),rooms=f.buildings.filter(b=>makeTypeResolver(config)(b.buildingId)===type),b=rooms[0];
 if(!source||!dense(effects)||effects.filter(row=>row.effectId==='宠物自动培育'&&row.type==='数值').length!==1||!dense(levels)||!levels.every(row=>own(row,'level')&&uint(row.level))||!unique(levels,row=>row.level))return null;
 const level=levels.find(row=>row.level===source.vipLevel),pairs=level?.effects;
 if(!dense(pairs)||!pairs.every(row=>dense(row)&&row.length===2&&id(row[0])&&typeof row[1]==='number'&&Number.isFinite(row[1]))||pairs.filter(row=>row[0]==='宠物自动培育').length!==1||!(pairs.find(row=>row[0]==='宠物自动培育')[1]>0))return null;
 if(rooms.length!==1||b.buildingId!=='1宠物培育室'||!positive(b.level)||!own(b,'buildFinishTime')||b.buildFinishTime!==0||!own(b,'auto')||b.auto!==true||!clock||b.petBreed.breedQ.some(job=>job.finishTime<=clock.latest))return null;
 return {action:'stop-auto',buildingId:b.buildingId,expectedStopHash:hash({context:f.context,building:b,pets:f.pets,autoWorkSource:source,dependencies:petDependencyVersions({config,parameters:{action:'stop-auto'}})})};
}
export const PET_STOP_AUTO_EVIDENCE=Object.freeze({source:'v76 PetFeedView._onBtnAuto + VipUtil.effect/isOpen + FactoryUtil.setBuildingAutoWork',request:'SetBuildingAutoWorkRequest',response:null,factoryUtilSha256:'16876641162829bbb4f3f7037b578e21b77483096720df1a2758c20f18cc3a60',vipUtilSha256:'2156ffd1e6ceb6ca0b557b1feaa4e4ef08bbedb4ba4364e0eea5a20a9cc8b573',scope:'EXPLICIT_ENTITLED_CURRENT_TRUE_TO_FALSE_ONLY',realGame:'REAL_UNVERIFIED'});
function stopAutoCandidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG}={}){
 const preparation=stopAutoPreparation(f,config),building=f?.buildings?.find(row=>row.buildingId===p.buildingId),action={request:'SetBuildingAutoWorkRequest',response:null,body:{buildingId:p.buildingId,isOn:false}},costs=[];
 let reason=null;
 if(!p.buildingId||!p.expectedStopHash)reason='EXPLICIT_CURRENT_PET_AUTO_WORK_REQUIRED';
 else if(!moduleConfig.enabled)reason='PET_MODULE_DISABLED';
 else if(!preparation||!same(preparation,p))reason='PET_AUTO_WORK_ENTITLEMENT_OR_STATE_UNKNOWN';
 else if(!f.available.includes(action.request)||f.available.includes('SetBuildingAutoWorkResponse'))reason='PROTOCOL_UNAVAILABLE';
 else{try{assertPaymentAllowed({...action,costs});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
 const target={buildingId:p.buildingId??null,expectedStopHash:p.expectedStopHash??null};
 return {module:moduleId,actionId:'pet:STOP-AUTO:'+hash(target),actionType:'STOP-AUTO',parameters:p,target,executable:reason===null,blockedReason:reason,identity:preparation?hash({preparation,buildings:f.buildings,pets:f.pets}):null,
 configEvidence:Object.fromEntries([...tables,...autoWorkTables].map(n=>[n,copy(config?.tables?.[n]??null)])),beforeState:building?copy(building):null,expectedState:building?{...copy(building),auto:false}:null,costs,costSource:PET_STOP_AUTO_EVIDENCE.source,budgetClaims:{resources:[],quotas:[],uids:p.buildingId?[{type:'pet-auto-work',id:p.buildingId}]:[]},label:'停止原培育室自动工作 '+(p.buildingId??''),...(reason===null?{action}:{})};
}
function candidate(f,p,{config,moduleConfig=PET_DEFAULT_CONFIG,settlement=false}={}){
  p=validatePetParameters(p);moduleConfig=validatePetConfig(moduleConfig);
  if(p.action==='stop-auto')return stopAutoCandidate(f,p,{config,moduleConfig});
  if(servingActions.includes(p.action))return levelCandidate(f,p,{config,moduleConfig,settlement});
  if(p.action==='claim')return claimCandidate(f,p,{config,moduleConfig});
  if(p.action==='breed')return breedCandidate(f,p,{config,moduleConfig});
  if(p.action==='gene-exchange')return geneCandidate(f,p,{config,moduleConfig});
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
  if(['claim','breed','gene-exchange','stop-auto'].includes(p.action))choices.push(p);
  else if(servingActions.includes(p.action)){for(const b of valid?f.buildings:[]){const uid=b.petServe&&exactUid(b.petServe.petUid);if(uid&&(!p.buildingId||p.buildingId===b.buildingId)&&(!p.uid||p.uid===uid)){if(p.action==='switch-attrs'){for(const extIdx of [1,2])if(!own(p,'extIdx')||p.extIdx===extIdx)choices.push({action:p.action,buildingId:b.buildingId,uid,extIdx});}else choices.push({action:p.action,buildingId:b.buildingId,uid,...(p.action==='reroll'?{lockedSlots:p.lockedSlots??[]}:{})});}}}
  else for(const b of rooms)if(!p.buildingId||p.buildingId===b.buildingId)for(const job of b.petBreed.breedQ)if(!own(p,'jobIdx')||p.jobIdx===job.idx)choices.push({action:'feed',buildingId:b.buildingId,jobIdx:job.idx});
  const candidates=(choices.length?choices:[p]).map(choice=>{
    const c=candidate(f,choice,{config,moduleConfig});return without(c,['identity','configEvidence']);
  });
  return {module:moduleId,mode:p.action??'feed',serving:valid?f.buildings.filter(b=>['宠物','宠物B','宠物C'].includes(makeTypeResolver(config)(b.buildingId))).map(b=>({buildingId:b.buildingId,uid:b.petServe?.petUid??null})):[],playerLevel:f?.levelSource?.playerLevel??null,rooms:rooms.map(b=>({buildingId:b.buildingId,level:b.level,queue:copy(b.petBreed)})),pets:valid?copy(f.pets):[],secondsReduced:valid?f.catalog.seconds:null,
    stopAutoPreparation:p.action==='stop-auto'?stopAutoPreparation(f,config):null,genePreparation:p.action==='gene-exchange'?genePreparation(f,config):[],breedPreparation:p.action==='breed'?breedPreparation(f,config):[],claimPreparation:p.action==='claim'?matureSnapshot(f,config)?.parameters??null:null,breeding:petBreedQualification(f,{config}),candidates,blocked:candidates.filter(c=>!c.executable),notes:[...(f?.notes??[])],evidence:PET_EVIDENCE};
}
export function validatePetGrowthPreparation(value){
 if(!fields(value,['targets','maxDurationMs'])||Reflect.ownKeys(value).length!==2||!dense(value.targets)||Object.getPrototypeOf(value.targets)!==Array.prototype||value.targets.length<1||value.targets.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('海兽组合须明确1至24个不同目标及有限总时长');
 const targets=value.targets.map(row=>{const p=validatePetParameters(row),keys=servingActions.includes(p.action)?['action','buildingId','uid',...(p.action==='switch-attrs'?['extIdx']:p.action==='reroll'?['lockedSlots']:[])]:['action','buildingId','jobIdx'];if(![...servingActions,'feed'].includes(p.action)||Reflect.ownKeys(p).length!==keys.length||keys.some(key=>!own(p,key)))throw invalid('海兽组合只允许完整明确的原在岗UID成长/属性组/当前洗炼选择或建筑/队列投喂参数');return p;});
 if(targets.some(p=>p.action!==targets[0].action)||servingActions.includes(targets[0].action)&&(!unique(targets,p=>p.uid)||!unique(targets,p=>p.buildingId))||targets[0].action==='feed'&&(!unique(targets,p=>p.jobIdx)||!unique(targets,p=>p.buildingId+':'+p.jobIdx)))throw invalid('同批只允许一种原动作，每在岗海兽/建筑或明确队列仅一次');
 return {targets,maxDurationMs:value.maxDurationMs};
}
export function preparePetGrowthWorkflow(facts,{config,moduleConfig=PET_DEFAULT_CONFIG,...input}={}){
 const p=validatePetGrowthPreparation(input);if(facts?.parameters?.action!==p.targets[0].action||!authority(facts,config)||liveFacts.get(facts)?.client.connected!==true)throw invalid('海兽组合不得跨原调查模式或失效来源');
 const ledger=new ResourceLedger(facts.stock),nodes=[{id:'start',type:'START'}];
 const steps=p.targets.map((parameters,i)=>{const plan=planPet(facts,{config,moduleConfig,parameters,ledger});if(plan.actions.length!==1)throw invalid('海兽目标当前无原合同资格或累计自有材料不足');const row=plan.actions[0],selection={actionId:row.actionId};nodes.push({id:'grow-'+i,type:'ACTION',module:moduleId,parameters,selection},{id:'verify-'+i,type:'VERIFY',module:moduleId});return {parameters,selection,target:copy(row.target),costs:copy(row.costs),budgetClaims:copy(row.budgetClaims)};});
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...p,steps,budget,graph:{version:1,id:'pet-growths-'+hash({p,steps,budget}).slice(0,20),name:'明确海兽逐目标单次成长',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:[moduleId]}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'同批一种原动作，每个明确在岗海兽UID升一级、红海兽升一星、服役材料投喂一次、切换一个已有属性组或保存/放弃本次洗炼结果或按原0至2锁槽材料洗炼一次或初始化空第二组，或每个明确建筑/队列只投喂一次（原idx含0）。原私有来源、planPet和共享Ledger累计核初始自有材料，原海兽/建筑或队列UID父预算固定；固定原actionId中的在岗等级或队列开始/完成/海兽身份，逐项重新调查、单次授权和完整目标/非目标状态及库存精确净扣验证。资格变化、拒绝或UNKNOWN停止，不替换在岗海兽、不培育、领取成熟奖励、补购或重放，不新增恢复权限。'};
}
export function planPet(f,{config,moduleConfig,parameters={},selections,ledger=new ResourceLedger(f?.stockReliable?f.stock:null)}={}){
  const c=candidate(f,parameters,{config,moduleConfig});
  return c.executable&&(selections===undefined||selections.includes(c.actionId))&&ledger.reserve(c.costs)?{module:moduleId,actions:[c],notes:[]}:{module:moduleId,actions:[],notes:[c.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT']};
}
export function verifyPet(op,b,a){
  const fail=reason=>({confirmed:false,reason});let p;try{p=validatePetParameters(op?.parameters);}catch{return fail('PET_OPERATION_CONTRACT_INVALID');}
  const config={tables:op?.configEvidence??{}};
  if(!authority(b,config,{settlement:servingActions.includes(p.action)})||!authority(a,config)||!same(b.context,a.context))return fail('PET_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if(queries.some(([key])=>a.sourceFacts[key].provenance.sourceAt<b.sourceFacts[key].provenance.sourceAt))return fail('PET_POST_READ_PREDATES_BASELINE');
  // Reconstruct with the original queue and costs. A late read must still prove
  // the original job could not have matured naturally without this feed.
  const contract=candidate(b,p,{config,moduleConfig:{enabled:true},settlement:servingActions.includes(p.action)});
  if(!contract.executable||['module','actionId','actionType','target','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','configEvidence'].some(k=>!same(op[k],contract[k])))return fail('PET_OPERATION_CONTRACT_MISMATCH');
  if(p.action==='stop-auto'){
    const after=a.buildings.find(row=>row.buildingId===p.buildingId);
    if(!same(after,contract.expectedState)||!same(b.buildings.filter(row=>row.buildingId!==p.buildingId),a.buildings.filter(row=>row.buildingId!==p.buildingId))||!same(b.pets,a.pets))return fail('PET_EXACT_AUTO_OFF_OR_QUEUE_PEERS_NOT_CONFIRMED');
    if(!stockMatchesDelta(b.stock,a.stock,[],[]))return fail('PET_AUTO_STOP_INVENTORY_CHANGED');
    return {confirmed:true,reason:'原VIP权益与当前自动状态共同绑定；完整OnWater仅auto由true变false，原队列/成熟列表/其他建筑/海兽池及库存保持；未取消在途任务或开启自动工作',afterState:copy(after)};
  }
  if(p.action==='gene-exchange'){
    if(!same(b.buildings,a.buildings)||!same(b.pets,a.pets))return fail('PET_STATE_CHANGED_DURING_GENE_EXCHANGE');
    if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[{id:contract.beforeState.targetId,num:p.num}]))return fail('PET_EXACT_GENE_EXCHANGE_OR_OTHER_INVENTORY_CHANGED');
    if(!authority(b,config)||!authority(a,config))return fail('PET_AUTHORITY_EXPIRED_DURING_VERIFICATION');
    return {confirmed:true,reason:'独立完整库存确认对应自有基因自选包精确扣除、所选普通专属基因1:1净入，完整海兽/建筑/队列与其他库存不变；未自动培育',afterState:copy(contract.expectedState)};
  }
  if(p.action==='breed'){
    const before=contract.beforeState.building,after=a.buildings.find(row=>row.buildingId===p.buildingId),clock=currentClock(a);
    if(!after||!clock||!b.endClock||clock.earliest<b.endClock.earliest||before.petBreed.breedQ.some(job=>job.finishTime<=clock.latest))return fail('PET_BREED_SETTLEMENT_CLOCK_OR_NATURAL_MATURITY_AMBIGUOUS');
    if(!same(b.buildings.filter(row=>row.buildingId!==p.buildingId),a.buildings.filter(row=>row.buildingId!==p.buildingId))||!same(without(before,['petBreed']),without(after,['petBreed']))||!same(without(before.petBreed,['breedQ']),without(after.petBreed,['breedQ']))||!same(b.pets,a.pets))return fail('PET_BREED_NON_TARGET_STATE_CHANGED');
    const oldIds=new Set(before.petBreed.breedQ.map(row=>row.idx)),added=after.petBreed.breedQ.filter(row=>!oldIds.has(row.idx)),kept=after.petBreed.breedQ.filter(row=>oldIds.has(row.idx)),job=added[0];
    if(added.length!==1||!same(kept,before.petBreed.breedQ)||job.petId!==p.petId||job.startTime<b.endClock.earliest||job.startTime>clock.latest||job.finishTime-job.startTime!==contract.expectedState.breedTime||job.finishTime<=clock.latest)return fail('PET_EXACT_SINGLE_NEW_BREED_JOB_NOT_CONFIRMED');
    if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('PET_EXACT_GENE_GOLD_DEBIT_NOT_CONFIRMED');
    if(!authority(b,config)||!authority(a,config))return fail('PET_AUTHORITY_EXPIRED_DURING_VERIFICATION');
    return {confirmed:true,reason:'独立完整OnWater确认所选海兽仅新增一个可信时间窗内的原配置时长任务；原队列/成熟列表/海兽池保持，普通基因与金币精确净扣，未预测任务idx、星级或后续投喂材料',afterState:{building:copy(after),job:copy(job)}};
  }
  if(p.action==='claim'){
    const before=contract.beforeState.building,after=a.buildings.find(row=>row.buildingId===p.buildingId),clock=currentClock(a);
    if(!after||!clock||before.petBreed.breedQ.some(job=>job.finishTime<=clock.latest))return fail('PET_CLAIM_NATURAL_MATURITY_AMBIGUOUS');
    const expected={...copy(before),petBreed:{...copy(before.petBreed),maturePets:[]}};
    if(!same(expected,after)||!same(b.buildings.filter(row=>row.buildingId!==p.buildingId),a.buildings.filter(row=>row.buildingId!==p.buildingId)))return fail('PET_EXACT_MATURE_LIST_CLEAR_OR_PEERS_NOT_CONFIRMED');
    const oldIds=new Set(b.pets.map(row=>row.uid)),existing=a.pets.filter(row=>oldIds.has(row.uid)),added=a.pets.filter(row=>!oldIds.has(row.uid));
    const sorted=rows=>copy(rows).sort((x,y)=>stableBusinessValue(x).localeCompare(stableBusinessValue(y)));
    if(!same(existing,b.pets)||!same(sorted(added.map(({petId,star,level})=>({petId,star,level}))),sorted(contract.expectedState.newPets)))return fail('PET_EXACT_NEW_UID_COHORT_OR_OLD_POOL_NOT_CONFIRMED');
    if(!stockMatchesDelta(b.stock,a.stock,[],[]))return fail('PET_CLAIM_INVENTORY_CHANGED');
    if(!authority(b,config)||!authority(a,config))return fail('PET_AUTHORITY_EXPIRED_DURING_VERIFICATION');
    return {confirmed:true,reason:'完整OnWater确认原成熟列表清空且队列/其他建筑不变；独立AllPet确认相同种类星级数量的全新UID一级海兽、原海兽与库存不变；不预测生成属性',afterState:{building:copy(after),pets:copy(added)}};
  }
  if(p.action==='serve-feed'){
    const before=contract.beforeState.pet,after=a.pets.find(row=>row.uid===p.uid),old=contract.beforeState.building,current=a.buildings.find(row=>row.buildingId===p.buildingId),left=servingFeedProgress(before,config),right=servingFeedProgress(after,config);
    if(!left||!right||!same(left.caps,right.caps)||right.grade!==left.grade||right.count<=left.count||!same(without(before,['profFeed']),without(after,['profFeed'])))return fail('PET_SERVING_FEED_PROGRESS_NOT_CONFIRMED');
    if(right.normalized.some((r,i)=>r.attrFeed.some((v,j)=>{const was=left.normalized[i].attrFeed[j];return v.times<was.times||v.times===was.times&&v.value!==was.value||v.times>was.times&&v.value<=was.value;})))return fail('PET_SERVING_FEED_COUNTER_OR_VALUE_CONFLICT');
    if(!current||!same(without(old,['petServe']),without(current,['petServe']))||!same(without(old.petServe,['upgradeRequirements']),without(current.petServe??{},['upgradeRequirements']))||!own(current.petServe,'upgradeRequirements')||!dense(current.petServe.upgradeRequirements)||current.petServe.upgradeRequirements.length>0&&!costsOf(current.petServe.upgradeRequirements,a.catalog)||!same(b.buildings.filter(row=>row.buildingId!==p.buildingId),a.buildings.filter(row=>row.buildingId!==p.buildingId))||!same(b.pets.filter(row=>row.uid!==p.uid),a.pets.filter(row=>row.uid!==p.uid)))return fail('PET_SERVING_FEED_NON_TARGET_STATE_CHANGED');
    if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('PET_EXACT_MATERIAL_DEBITS_NOT_CONFIRMED');
    return {confirmed:true,reason:'同一服役海兽当前阶段投喂进度独立复读增加且不超过配置上限，实际属性由服务器返回；原费用精确净扣、其他状态保持',afterState:{pet:copy(after),buildingId:p.buildingId,progress:right}};
  }
  if(randomAttributeActions.includes(p.action)){
    const initializing=p.action==='init-attrs',before=contract.beforeState.pet,after=a.pets.find(row=>row.uid===p.uid),expected=contract.expectedState,observed=initializing?after?.extAttrs2:after?.rerollAttrs;
    if(!after||!(initializing?completePetAttributeList(observed):attributePolicy({action:'save-reroll'},config,after))||!same(without(before,[initializing?'extAttrs2':'rerollAttrs']),without(after,[initializing?'extAttrs2':'rerollAttrs']))||observed.length!==expected.slotCount)return fail(initializing?'PET_SECOND_ATTRIBUTE_GROUP_NOT_CONFIRMED':'PET_SINGLE_REROLL_PENDING_RESULT_NOT_CONFIRMED');
    for(let i=0;i<observed.length;i++){const row=observed[i];if(expected.lockedSlots.includes(i+1)){if(!same(row,expected.originalAttrs[i]))return fail('PET_REROLL_LOCKED_SLOT_CHANGED');}else if(!expected.pools[i].includes(row.attrValue.attr)||own(row,'heroProf')&&row.heroProf!==''&&!expected.careers.includes(row.heroProf)||own(row,'heroCamp')&&row.heroCamp!==''&&!expected.factions.includes(row.heroCamp))return fail(initializing?'PET_ATTRIBUTE_INIT_OUTSIDE_ORIGINAL_POOL':'PET_REROLL_RESULT_OUTSIDE_ORIGINAL_POOL');}
    if(!same(b.buildings,a.buildings)||!same(b.pets.filter(row=>row.uid!==p.uid),a.pets.filter(row=>row.uid!==p.uid))||!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('PET_REROLL_PEER_OR_EXACT_MATERIAL_DEBITS_NOT_CONFIRMED');
    return {confirmed:true,reason:initializing?'独立AllPet确认空第二组初始化为完整合法属性，原使用组、第一组、当前待选及其他状态/库存均保持；切换另需新许可':'原配置洗炼/锁槽材料精确净扣，独立AllPet确认新完整待选结果及原锁槽不变；原使用组/其他状态保持，保存或放弃另需新许可',afterState:{pet:copy(after),buildingId:p.buildingId,...(initializing?{initializedOnly:true}:{pendingOnly:true})}};
  }
  if(['level','star',...attributeActions].includes(p.action)){
    const after=a.pets.find(row=>row.uid===p.uid),expected=contract.expectedState.pet;
    if(!same(b.buildings,a.buildings)||!same(after,expected)||!same(b.pets.filter(row=>row.uid!==p.uid),a.pets.filter(row=>row.uid!==p.uid)))return fail('PET_EXACT_LEVEL_OR_NON_TARGET_STATE_NOT_CONFIRMED');
    if(!stockMatchesDelta(b.stock,a.stock,contract.costs,[]))return fail('PET_EXACT_MATERIAL_DEBITS_NOT_CONFIRMED');
    if(!authority(b,config,{settlement:true})||!authority(a,config))return fail('PET_AUTHORITY_EXPIRED_DURING_VERIFICATION');
    return {confirmed:true,reason:attributeActions.includes(p.action)?'同一服役建筑与UID、独立AllPet确认精确属性组切换或当前待选结果保存/放弃，其他字段、建筑、海兽及库存保持':p.action==='star'?'完整OnWater确认同一服役建筑与UID，独立AllPet精确匹配原单星typed预览，完整库存确认原升星石及经验净扣':'完整OnWater确认同一服役建筑与UID，独立AllPet及库存确认单级、配置属性和精确海兽经验净扣',afterState:{pet:copy(after),buildingId:p.buildingId}};
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
  survey:surveyPet,view:viewPet,plan:planPet,verify:verifyPet,rejectionIdentity:businessRejectionIdentityFromHistory,dependencyVersions:petDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig',...[...tables,...levelTables,...starTables,...servingFeedTables,...attributeTables,...rerollTables,...geneTables,...autoWorkTables].map(n=>'config.'+n)])});
