// Farm semantics only. Shared BusinessExecutor owns transport, permits, history,
// cancellation and UNKNOWN. This module never dispatches or changes autoFarming.
import { createHash } from 'node:crypto';
import { surveyCoreOperations } from './core-operation-adapters.mjs';
import { ResourceLedger, safeResourceQuantity, operationBudgetClaims } from './resource-ledger.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime } from './state-facts.mjs';
import { assertExecutionActive } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';

const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const dense=v=>Array.isArray(v)&&v.length<=10000&&Array.from({length:v.length},(_,i)=>own(v,i)).every(Boolean);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647;
const positive=v=>uint(v)&&v>0;
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const premium=v=>['RUBY','钻石','4'].includes(String(v));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const source='FarmlandPlantCfg.material single [seedId,num] pair; FarmPlantRequest.args PlantArg(buildingId,productId); no replacement purchase';
const harvestSource='Fixed v76 BuildingModel.isRiped strict server seconds; FarmView single buildingId; CriticalAsset.reward.num is final quantity, critical is presentation only';
const liveFarmFacts=new WeakMap();
export const FARM_DEFAULT_CONFIG=Object.freeze({enabled:false});
export const FARM_EVIDENCE=Object.freeze({
  maturityTimeUnit:'SERVER_SECONDS_STRICTLY_BEFORE',missingFarmMeansEmpty:'BLOCKED_EVIDENCE',criticalRewardSemantics:'REWARD_NUM_FINAL_NO_CRITICAL_MULTIPLICATION',
  fixedClient:Object.freeze({buildingModelByteOffset:905030,isRipedByteOffset:908580,farmViewByteOffset:2597847,itemVOByteOffset:3828116,sourcePackageSha256:'4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',entrySha256:'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',source:'Existing v76 package/entry manifest and in-memory module excerpts'}),
  sources:Object.freeze(['local reference src/world.mjs#farmOf and farmHarvest/farmPlant (index only)',
    'fixed cached protocol: FarmBuildingInfo/PlantArg/FarmHarvestRequest/FarmHarvestResponse/CriticalAsset',
    'fixed FarmlandPlantCfg.material/time/produceNum']),
});
function fields(v,keys) {return object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable);}
export function validateFarmConfig(v={}) {
  if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('农田配置仅允许 enabled 布尔值；服务端自动种植不在此修改');
  return {enabled:v.enabled??false};
}
export function validateFarmParameters(v={}) {
  if(!fields(v,['buildingId','action','productId','pendingHarvests','pendingPlants','replant']))throw invalid('农田参数仅允许 buildingId、action、productId、pendingHarvests、pendingPlants、replant');
  const out={};
  if(own(v,'buildingId')){if(!id(v.buildingId))throw invalid('地块ID无效');out.buildingId=v.buildingId;}
  if(own(v,'action')){if(!['harvest','plant'].includes(v.action))throw invalid('农田动作仅允许 harvest 或 plant');out.action=v.action;}
  if(own(v,'productId')){if(v.action!=='plant'||!id(v.productId))throw invalid('productId仅用于明确plant作物');out.productId=v.productId;}
  if(own(v,'pendingHarvests')){const sources=validateHarvestSources(v.pendingHarvests);if(v.action!=='harvest'||!id(v.buildingId)||sources[0].buildingId!==v.buildingId)throw invalid('收取来源守卫只用于明确首块地的harvest');out.pendingHarvests=sources;}
  if(own(v,'pendingPlants')){const sources=validatePlantSources(v.pendingPlants);if(v.action!=='plant'||!id(v.buildingId)||!id(v.productId)||sources[0].buildingId!==v.buildingId||sources[0].productId!==v.productId)throw invalid('播种来源守卫只用于明确首块空田和自选作物的plant');out.pendingPlants=sources;}
  if(own(v,'replant')){const rows=validateReplantSources(v.replant);if(!['harvest','plant'].includes(v.action)||v.buildingId!==rows[0].buildingId||own(v,'pendingPlants')||v.action==='plant'&&(v.productId!==rows[0].nextProductId||own(v,'pendingHarvests'))||v.action==='harvest'&&own(v,'pendingHarvests')&&!same(v.pendingHarvests,rows.map(originalHarvestSource)))throw invalid('再播种须绑定当前原田块、作物、种子成本及明确先收后种顺序');out.replant=rows;}
  return out;
}
function validateHarvestSources(v){
  if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length<1||v.length>12||Reflect.ownKeys(v).length!==v.length+1||!Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&own(d,'value')))throw invalid('收取来源须为1至12块不同农田的明确有序数组');
  const out=[];for(const row of v){if(!fields(row,['buildingId','productId','plantTime','ripeTime','identity'])||!['buildingId','productId','plantTime','ripeTime','identity'].every(k=>own(row,k))||!id(row.buildingId)||!id(row.productId)||!positive(row.plantTime)||!uint(row.ripeTime)||row.ripeTime<row.plantTime||typeof row.identity!=='string'||! /^[a-f0-9]{64}$/.test(row.identity)||out.some(r=>r.buildingId===row.buildingId))throw invalid('收取来源须保留地块、作物、种植成熟秒数及原身份');out.push(copy(row));}return out;
}
export function validateFarmHarvestPreparation(v){
  if(!fields(v,['targets','maxDurationMs','replant'])||!own(v,'targets')||!own(v,'maxDurationMs')||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('有限收取须明确原目标及1至86400000毫秒总时长');const targets=validateHarvestSources(v.targets),out={targets,maxDurationMs:v.maxDurationMs};
  if(own(v,'replant')){if(!Array.isArray(v.replant)||Object.getPrototypeOf(v.replant)!==Array.prototype||Reflect.ownKeys(v.replant).length!==targets.length+1||v.replant.length!==targets.length||!targets.every((t,i)=>Object.getOwnPropertyDescriptor(v.replant,i)?.enumerable&&own(Object.getOwnPropertyDescriptor(v.replant,i),'value')&&fields(v.replant[i],['buildingId','productId'])&&['buildingId','productId'].every(k=>own(v.replant[i],k))&&v.replant[i].buildingId===t.buildingId&&id(v.replant[i].productId)))throw invalid('再播种必须明确每块原田的下一作物，顺序和数量须与收取一致');out.replant=copy(v.replant);}return out;
}
function originalHarvestSource(row){return {buildingId:row.buildingId,productId:row.productId,plantTime:row.plantTime,ripeTime:row.ripeTime,identity:row.identity};}
function validateReplantSources(v){
  if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length<1||v.length>12||Reflect.ownKeys(v).length!==v.length+1||!Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&own(d,'value')))throw invalid('再播种来源必须为明确1至12田有序数组');
  for(const row of v)if(!fields(row,['buildingId','productId','plantTime','ripeTime','identity','nextProductId','seedId','seedNum'])||!['buildingId','productId','plantTime','ripeTime','identity','nextProductId','seedId','seedNum'].every(k=>own(row,k))||!id(row.nextProductId)||!id(row.seedId)||premium(row.seedId)||safeResourceQuantity(row.seedNum)===null||row.seedNum<=0)throw invalid('再播种来源、下一作物和初始种子成本不完整');validateHarvestSources(v.map(originalHarvestSource));return copy(v);
}
function validatePlantSources(v){
  if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length<1||v.length>12||Reflect.ownKeys(v).length!==v.length+1||!Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&own(d,'value')))throw invalid('播种来源须为1至12块不同空田及自选作物的明确有序数组');
  const out=[];for(const row of v){if(!fields(row,['buildingId','productId','identity'])||!['buildingId','productId','identity'].every(k=>own(row,k))||!id(row.buildingId)||!id(row.productId)||typeof row.identity!=='string'||! /^[a-f0-9]{64}$/.test(row.identity)||out.some(r=>r.buildingId===row.buildingId))throw invalid('播种来源须保留精确空田、自选作物和原身份');out.push(copy(row));}return out;
}
export function validateFarmPlantPreparation(v){
  if(!fields(v,['targets','maxDurationMs'])||!own(v,'targets')||!own(v,'maxDurationMs')||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('有限播种须明确原目标及1至86400000毫秒总时长');return {targets:validatePlantSources(v.targets),maxDurationMs:v.maxDurationMs};
}
const rows=(config,name)=>config?.tables?.[name]?.data;
function catalogFrom(config) {
  const buildings=rows(config,'BuildingCfg'),raw=rows(config,'FarmlandPlantCfg');
  const types=dense(buildings)&&buildings.length&&buildings.every(r=>own(r,'buildingType')&&id(r.buildingType))&&new Set(buildings.map(r=>r.buildingType)).size===buildings.length?buildings.map(r=>r.buildingType).sort((a,b)=>b.length-a.length):null;
  const counts=new Map();for(const r of dense(raw)?raw:[])if(id(r?.id))counts.set(r.id,(counts.get(r.id)??0)+1);
  const crops=(dense(raw)?raw:[]).map(r=>{
    const cost=dense(r?.material)&&r.material.length===2&&id(r.material[0])&&safeResourceQuantity(r.material[1])!==null&&safeResourceQuantity(r.material[1])>0?{id:r.material[0],num:safeResourceQuantity(r.material[1])}:null;
    const reliable=id(r?.id)&&counts.get(r.id)===1&&cost!==null&&!premium(r.id)&&!premium(cost.id);
    return {productId:id(r?.id)?r.id:null,costs:cost?[cost]:null,reliable,
      configuredTime:positive(r?.time)?r.time:null,configuredYield:safeResourceQuantity(r?.produceNum)>0?safeResourceQuantity(r.produceNum):null,
      timingUnit:'BLOCKED_EVIDENCE',yieldScope:'CONFIGURED_BASE_ONLY_CRITICAL_SEMANTICS_UNVERIFIED'};
  });
  return {types,crops,reliable:types!==null&&types.includes('农田')&&dense(raw)&&raw.length>0};
}
function inventory(items,resources) {
  const parsed=parseOperationInventory(items,resources);
  // Farm IDs additionally exclude DEL. Keep that domain restriction and the
  // original canonical-only inputs while sharing completeness/conflict checks.
  return parsed.stockReliable&&items.items.some(row=>!id(row.itemId))?{stock:new Map(),stockReliable:false}:parsed;
}

function exactIdentity(v) {
  if(typeof v==='number'&&!Number.isSafeInteger(v))return null;
  const n=toSnapshotJson(v);if(!(typeof n==='number'&&Number.isSafeInteger(n))&&!(typeof n==='string'&&/^[1-9]\d*$/.test(n)))return null;
  try{const b=BigInt(n);return b>0n&&b<(1n<<63n)?b.toString():null;}catch{return null;}
}
function contextOf(context,player) {
  const ids=['playerId','id'].filter(k=>own(player,k)).map(k=>exactIdentity(player[k]));
  const playerId=ids.length&&ids.every(v=>v!==null&&v===ids[0])?ids[0]:null;
  return {accountId:id(context?.accountId)?context.accountId:null,generation:Number.isSafeInteger(context?.generation)&&context.generation>=0?context.generation:null,
    playerId,worldId:exactIdentity(player?.worldId)};
}
function parsePlot(raw,types) {
  const type=types?.find(t=>raw.buildingId.endsWith(t))??null;
  if(type!=='农田')return null;
  const base={buildingId:raw.buildingId,level:own(raw,'level')&&uint(raw.level)?raw.level:null,
    buildStartTime:own(raw,'buildStartTime')&&uint(raw.buildStartTime)?raw.buildStartTime:null,
    buildFinishTime:own(raw,'buildFinishTime')&&uint(raw.buildFinishTime)?raw.buildFinishTime:null,raw:copy(raw)};
  const unknown=reason=>({...base,state:'UNKNOWN',productId:null,plantTime:null,ripeTime:null,reliable:false,reason});
  if(base.level===null||base.buildStartTime===null||base.buildFinishTime===null)return unknown('FARM_BUILDING_FIELDS_UNKNOWN');
  if(base.level===0||base.buildFinishTime!==0)return {...unknown('FARM_NOT_BUILT_OR_CONSTRUCTION_ACTIVE'),state:'UNAVAILABLE'};
  if(!own(raw,'farm'))return unknown('MISSING_FARM_EMPTY_SEMANTICS_UNVERIFIED');
  const f=raw.farm;
  if(!own(f,'productId')||typeof f.productId!=='string'||!own(f,'plantTime')||!uint(f.plantTime)||!own(f,'ripeTime')||!uint(f.ripeTime))return unknown('FARM_FIELDS_UNKNOWN');
  if(f.productId==='')return f.plantTime===0&&f.ripeTime===0?{...base,state:'EMPTY',productId:'',plantTime:0,ripeTime:0,reliable:true,reason:null}:unknown('EMPTY_FARM_TIMES_CONFLICT');
  if(!id(f.productId)||f.plantTime<=0||f.ripeTime<f.plantTime)return unknown('CROP_ID_OR_TIMES_UNRELIABLE');
  return {...base,state:'GROWING_OR_RIPE_UNVERIFIED',productId:f.productId,plantTime:f.plantTime,ripeTime:f.ripeTime,reliable:true,reason:'MATURITY_REQUIRES_LIVE_SERVER_CLOCK'};
}
/** Decorates the original core read set. Raw inputs must come from the trusted
 * core survey hook, never from HTTP parameters or a previously defaulted view. */
export function decorateFarmSurvey(core,{config,protocol={},context,player=core?.player,sourceAt=Date.now(),time}={}) {
  const rawOnWater=core?.rawOnWater??null,rawAllItem=core?.rawAllItem??null,rawAllResource=core?.rawAllResource??null;
  const catalog=catalogFrom(config),identity=contextOf(context,player),stock=inventory(rawAllItem,rawAllResource);
  const complete=own(rawOnWater,'building')&&dense(rawOnWater.building)&&rawOnWater.building.every(r=>own(r,'buildingId')&&id(r.buildingId))&&new Set(rawOnWater.building.map(r=>r.buildingId)).size===rawOnWater.building.length;
  const rawBuildings=complete?copy(rawOnWater.building):null;
  const plots=complete&&catalog.types?rawBuildings.map(r=>parsePlot(r,catalog.types)).filter(Boolean):[];
  const autoFarming=own(rawOnWater,'autoFarming')&&typeof rawOnWater.autoFarming==='boolean'?rawOnWater.autoFarming:null;
  const observed={accountId:identity.accountId,generation:identity.generation,sourceAt,scope:{kind:'ACCOUNT'}};
  return {module:'farm',...stock,identityContext:identity,rawOnWater:copy(rawOnWater),rawAllItem:copy(rawAllItem),rawAllResource:copy(rawAllResource),rawBuildings,plots,catalog,autoFarming,
    farmReliability:{buildings:complete,catalog:catalog.reliable,autoFarming:autoFarming!==null},
    sourceFacts:{water:createStateFact(rawOnWater,{...observed,source:'OnWaterResponse',reliable:complete}),
      inventory:createStateFact({items:rawAllItem,resources:rawAllResource},{...observed,source:'AllItemResponse+AllResourceResponse',reliable:stock.stockReliable})},
    available:['FarmHarvestRequest','FarmHarvestResponse','FarmPlantRequest'].filter(k=>protocol[k]),
    gameTime:time?.gameTime??{status:'UNKNOWN',reliable:false,reason:'TRUSTED_GAME_CLOCK_UNAVAILABLE'},
    evidence:FARM_EVIDENCE,notes:complete?[]:['ON_WATER_BUILDING_SOURCE_UNKNOWN']};
}
export async function surveyFarmOperations(client,protocol,options={}) {
  validateFarmParameters(options.parameters);assertExecutionActive(client,options);
  const sourceAt=Date.now(),context=copy(client.factContext??{});
  const core=await surveyCoreOperations(client,protocol,{...options,parameters:{}});assertExecutionActive(client,options);
  if(!same(context,client.factContext??{}))throw Object.assign(new Error('农田采集期间账号或代次已变化'),{code:'CANCELLED'});
  const facts=decorateFarmSurvey(core,{config:options.config,protocol,context,player:options.player,sourceAt,time:readGameTime(client)});
  const history=options.parameters?.action==='plant'&&options.parameters?.replant?{readHarvestHistory:options.readHarvestHistory,harvestSettlements:readHarvestSettlements(options.readHarvestHistory,context,options.player)}:{};
  liveFarmFacts.set(facts,{client,player:options.player,context:copy(context),digest:farmDigest(facts),...history});return facts;
}
const farmDigest=f=>hash({...f,stock:[...f.stock]});
function currentFarmSurvey(facts) {
  const live=liveFarmFacts.get(facts),context=live?.context;
  if(!live||live.client.connected!==true||!id(context.connectionId)||!same(context,live.client.factContext)||!same(contextOf(context,live.player),facts.identityContext)||live.digest!==farmDigest(facts))return null;
  if(own(live,'harvestSettlements')&&!same(live.harvestSettlements,readHarvestSettlements(live.readHarvestHistory,context,live.player)))return null;
  return live;
}
function harvestClock(facts) {
  const live=currentFarmSurvey(facts),context=live?.context;if(!live)return null;
  let clock;try{clock=live.client.gameClock?.read(context);}catch{return null;}
  if(clock?.status!=='TRUSTED'||clock.reliable!==true||clock.source!=='PingResponse.serverTimestamp'||clock.accountId!==context.accountId||clock.generation!==context.generation||!['earliestMs','nowMs','latestMs'].every(k=>own(clock,k)&&Number.isFinite(clock[k])&&clock[k]>=0&&clock[k]<=Number.MAX_SAFE_INTEGER)||clock.earliestMs>clock.nowMs||clock.nowMs>clock.latestMs)return null;
  return clock;
}
function authority(facts) {
  const c=facts?.identityContext;
  if(!id(c?.accountId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId)return false;
  const fresh=(fact,source)=>fact?.provenance?.source===source&&factsFreshnessPolicy(fact,{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope:{kind:'ACCOUNT'}}).status==='FRESH';
  return facts.farmReliability?.buildings===true&&facts.farmReliability?.catalog===true&&facts.stockReliable===true&&facts.stock instanceof Map
    &&fresh(facts.sourceFacts?.water,'OnWaterResponse')&&fresh(facts.sourceFacts?.inventory,'AllItemResponse+AllResourceResponse')
    &&same(facts.sourceFacts.water.value,facts.rawOnWater)&&same(facts.sourceFacts.inventory.value,{items:facts.rawAllItem,resources:facts.rawAllResource})
    &&same([...inventory(facts.rawAllItem,facts.rawAllResource).stock],[...facts.stock])
    &&same(facts.rawBuildings,facts.rawOnWater.building)&&same(facts.plots,facts.rawBuildings.map(r=>parsePlot(r,facts.catalog.types)).filter(Boolean))
    &&facts.autoFarming===(own(facts.rawOnWater,'autoFarming')&&typeof facts.rawOnWater.autoFarming==='boolean'?facts.rawOnWater.autoFarming:null);
}
function farmTargetIdentity(facts,plot){return plot?hash({context:facts.identityContext,targetPlot:plot.raw,autoFarming:facts.autoFarming,crop:facts.catalog?.crops?.find(r=>r.productId===plot.productId),buildingTypes:facts.catalog.types}):null;}
function harvestPlotSource(facts,plot){return plot?.reliable&&plot.productId?{buildingId:plot.buildingId,productId:plot.productId,plantTime:plot.plantTime,ripeTime:plot.ripeTime,identity:farmTargetIdentity(facts,plot)}:null;}
function plantPlotIdentity(facts,plot,productId){return plot?hash({context:facts.identityContext,targetPlot:plot.raw,autoFarming:facts.autoFarming,crop:facts.catalog?.crops?.find(r=>r.productId===productId),buildingTypes:facts.catalog.types}):null;}
function plantPlotSource(facts,plot,productId){return plot?.reliable&&plot.state==='EMPTY'?{buildingId:plot.buildingId,productId,identity:plantPlotIdentity(facts,plot,productId)}:null;}
function readHarvestSettlements(read,context,player){
 try{if(typeof read!=='function')return null;const runs=read();if(!Array.isArray(runs))return null;const current={...contextOf(context,player),connectionId:context.connectionId},scope=c=>c&&{accountId:c.accountId,generation:c.generation,playerId:exactIdentity(c.playerId),worldId:exactIdentity(c.worldId),connectionId:c.connectionId},out=[];
  const relevant=runs.filter(r=>r?.accountId===current.accountId&&same(scope(r.executionContext),current)&&r.module==='farm'&&id(r.runId)&&Array.isArray(r.actions));
  for(const run of relevant){if(run.finalStatus!=='SUCCESS'||!id(run.planSummary?.batchId)||run.authorizationSummary?.batchId!==run.planSummary.batchId||run.authorizationSummary?.planHash!==run.planSummary.planHash||!id(run.planSummary.planHash)||run.actions.length!==1||!Number.isFinite(Date.parse(run.startedAt))||!Number.isFinite(Date.parse(run.finishedAt))||Date.parse(run.finishedAt)<Date.parse(run.startedAt))continue;const row=run.actions[0],before=row.beforeState,after=row.afterState,received=row.responseEvidence,planned=run.planSummary.actions; if(run.planSummary.module!=='farm'||!dense(planned)||planned.length!==1||['module','actionId','actionType','target','parameters','beforeState','expectedState','identity','costs','costSource','budgetClaims'].some(k=>!same(planned[0][k],row[k]))||!same(row.costs,[])||!same(run.authorizationSummary.resourceBudget,[])||!same(run.planSummary.resourceBudget,[]))continue;
   if(row.module!=='farm'||row.actionType!=='HARVEST'||row.result!=='SUCCESS'||row.requestStatus!=='SUCCESS'||row.dispatched!==true||row.unresolvedWrite!==false||row.verification?.status!=='CONFIRMED'||row.beforeInventoryReliable!==true||row.afterInventoryReliable!==true||!id(row.actionId)||!same(run.authorizationSummary.actionIds,[row.actionId])||row.parameters?.action!=='harvest'||row.parameters.buildingId!==before?.buildingId||!before?.farm||!after?.farm||!same(parsePlot(after,['农田'])?.state,'EMPTY')||!same(Object.fromEntries(Object.entries(before).filter(([k])=>k!=='farm')),Object.fromEntries(Object.entries(after).filter(([k])=>k!=='farm'))))continue;
   const source={buildingId:before.buildingId,productId:before.farm.productId,plantTime:before.farm.plantTime,ripeTime:before.farm.ripeTime,identity:row.identity};try{validateHarvestSources([source]);}catch{continue;}if(!same(row.target,{buildingId:source.buildingId,productId:source.productId})||row.actionId!=='farm:HARVEST:'+hash(row.target)||received?.buildingId!==source.buildingId||received.productId!==source.productId||safeResourceQuantity(received.num)===null||received.num<=0||!dense(received.critical)||!received.critical.length||received.critical.some(n=>!uint(n)))continue;
   const stock=v=>{if(!dense(v)||v.some(r=>!fields(r,['id','num'])||!id(r.id)||safeResourceQuantity(r.num)===null)||new Set(v.map(r=>r.id)).size!==v.length)return null;return new Map(v.map(r=>[r.id,r.num]));},a=stock(row.beforeInventory),b=stock(row.afterInventory);if(!a||!b||[...new Set([...a.keys(),...b.keys(),source.productId])].some(k=>!Number.isSafeInteger((a.get(k)??0)+(k===source.productId?received.num:0))||(b.get(k)??0)!==(a.get(k)??0)+(k===source.productId?received.num:0)))continue;
   if(relevant.some(r=>r.finalStatus==='SUCCESS'&&Number.isFinite(Date.parse(r.finishedAt))&&Date.parse(r.finishedAt)>=Date.parse(run.startedAt)&&r.actions.some(p=>p.actionType==='PLANT'&&p.result==='SUCCESS'&&p.verification?.status==='CONFIRMED'&&p.target?.buildingId===source.buildingId)))continue;
   out.push({runId:run.runId,batchId:run.planSummary.batchId,actionId:row.actionId,source,beforeState:copy(before),afterState:copy(after)});
  }return out.sort((a,b)=>stableBusinessValue(a).localeCompare(stableBusinessValue(b)));
 }catch{return null;}
}
function replantGuard(facts,parameters){
 const rows=parameters.replant;if(!rows)return null;if(!currentFarmSurvey(facts))return 'FARM_REPLANT_CONNECTION_OR_HISTORY_UNKNOWN';const ledger=new ResourceLedger(facts.stock);
 for(let i=0;i<rows.length;i++){const row=rows[i],plot=facts.plots.find(p=>p.buildingId===row.buildingId),crop=facts.catalog.crops.find(c=>c.productId===row.nextProductId);if(!crop?.reliable||!same(crop.costs,[{id:row.seedId,num:row.seedNum}]))return 'FARM_REPLANT_COST_CHANGED';if(!ledger.reserve(crop.costs))return 'FARM_REPLANT_TOTAL_SEED_SHORTAGE';
  if(parameters.action==='plant'&&i===0){const proofs=liveFarmFacts.get(facts)?.harvestSettlements?.filter(p=>same(p.source,originalHarvestSource(row))&&p.source.identity===farmTargetIdentity(facts,parsePlot(p.beforeState,facts.catalog.types))&&same(p.afterState,plot?.raw));if(proofs?.length!==1)return 'FARM_REPLANT_CONFIRMED_HARVEST_REQUIRED';}
  else if(!same(originalHarvestSource(row),harvestPlotSource(facts,plot)))return 'FARM_REPLANT_SOURCE_CHANGED';
 }return null;
}
function candidate(facts,parameters,{moduleConfig=FARM_DEFAULT_CONFIG}={}) {
  const plot=facts?.plots?.find(r=>r.buildingId===parameters.buildingId),actionType=parameters.action==='plant'?'PLANT':'HARVEST';
  const crop=facts?.catalog?.crops?.find(r=>r.productId===(parameters.productId??plot?.productId));
  let reason=null;const costs=actionType==='PLANT'&&crop?.costs?copy(crop.costs):[];
  if(moduleConfig.enabled!==true)reason='FARM_MODULE_DISABLED';
  else if(!authority(facts))reason='FARM_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(!plot||!plot.reliable)reason=plot?.reason??'FARM_TARGET_UNKNOWN';
  else if(actionType==='HARVEST'){
    const clock=harvestClock(facts);
    if(facts.autoFarming!==false)reason=facts.autoFarming===true?'SERVER_AUTO_FARMING_ENABLED':'AUTO_FARMING_UNKNOWN';
    else if(!plot.productId||plot.state==='EMPTY')reason='FARM_NOT_PLANTED';
    else if(!clock)reason='FARM_TRUSTED_CLOCK_OR_CONNECTION_UNKNOWN';
    else if(Math.floor(clock.earliestMs/1000)<=plot.ripeTime)reason='FARM_MATURITY_NOT_PROVEN';
    else if(!crop?.reliable)reason='CROP_OR_SEED_COST_UNVERIFIED';
    else if(!['FarmHarvestRequest','FarmHarvestResponse'].every(k=>facts.available?.includes(k)))reason='FARM_HARVEST_PROTOCOL_UNAVAILABLE';
    else if(parameters.pendingHarvests?.some(row=>!same(row,harvestPlotSource(facts,facts.plots.find(p=>p.buildingId===row.buildingId)))))reason='FARM_HARVEST_SOURCE_CHANGED';
  }
  else if(plot.state!=='EMPTY')reason='FARM_NOT_EXPLICITLY_EMPTY';
  else if(facts.autoFarming!==false)reason=facts.autoFarming===true?'SERVER_AUTO_FARMING_ENABLED':'AUTO_FARMING_UNKNOWN';
  else if(!crop?.reliable)reason='CROP_OR_SEED_COST_UNVERIFIED';
  else if(!facts.available?.includes('FarmPlantRequest'))reason='FARM_PLANT_PROTOCOL_UNAVAILABLE';
  else if(costs.some(r=>premium(r.id)||safeResourceQuantity(facts.stock.get(r.id)??0)<r.num))reason='SEED_STOCK_INSUFFICIENT_OR_D6_FORBIDDEN';
  else if(parameters.pendingPlants&&(!currentFarmSurvey(facts)||parameters.pendingPlants.some(row=>!same(row,plantPlotSource(facts,facts.plots.find(p=>p.buildingId===row.buildingId),row.productId)))))reason='FARM_PLANT_SOURCE_CHANGED';
  if(reason===null)reason=replantGuard(facts,parameters);
  const target={buildingId:parameters.buildingId??null,...(actionType==='PLANT'?{productId:parameters.productId??null}:{productId:plot?.productId??null})};
  const beforeState=plot?copy(plot.raw):null;
  const expectedState=actionType==='PLANT'?{buildingId:target.buildingId,productId:target.productId,seedCosts:costs,autoFarming:false,requiresCompleteCropState:true}:
    {buildingId:target.buildingId,previousProductId:target.productId,requiresTypedRewardAndNetInventory:true,maturityTimeUnit:'SERVER_SECONDS_STRICTLY_BEFORE',rewardRule:'EXACT_TYPED_CROP_NUM_NO_CRITICAL_MULTIPLICATION',autoFarming:false};
  const identity=actionType==='HARVEST'?farmTargetIdentity(facts,plot):plantPlotIdentity(facts,plot,parameters.productId);
  return {module:'farm',actionId:'farm:'+actionType+':'+hash(target),actionType,target,parameters:copy(parameters),beforeState,expectedState,identity,costs,
    budgetClaims:{resources:costs,quotas:[],uids:actionType==='HARVEST'&&plot?[{type:'farm-harvest',id:hash({context:facts.identityContext,buildingId:plot.buildingId,farm:plot.raw.farm})}]:[]},costSource:actionType==='HARVEST'?harvestSource:source,executable:reason===null,blockedReason:reason,
    ...(reason===null?{action:actionType==='HARVEST'?{request:'FarmHarvestRequest',response:'FarmHarvestResponse',body:{buildingId:[target.buildingId]}}:{request:'FarmPlantRequest',response:null,body:{args:[{buildingId:target.buildingId,productId:target.productId}]}}}:{})};
}
function choices(facts,parameters) {
  const out=[];
  for(const plot of facts?.plots??[]) {
    if(parameters.buildingId&&parameters.buildingId!==plot.buildingId)continue;
    if(parameters.action!=='plant')out.push({buildingId:plot.buildingId,action:'harvest',...(parameters.pendingHarvests?{pendingHarvests:copy(parameters.pendingHarvests)}:{}),...(parameters.replant?{replant:copy(parameters.replant)}:{})});
    if(parameters.action!=='harvest')for(const crop of facts?.catalog?.crops??[]){if(!id(crop.productId)||parameters.productId&&parameters.productId!==crop.productId||out.some(row=>row.buildingId===plot.buildingId&&row.action==='plant'&&row.productId===crop.productId))continue;out.push({buildingId:plot.buildingId,action:'plant',productId:crop.productId,...(parameters.pendingPlants?{pendingPlants:copy(parameters.pendingPlants)}:{}),...(parameters.replant?{replant:copy(parameters.replant)}:{})});}
  }
  return out.length?out:[parameters];
}
export function viewFarmOperations(facts,{parameters={},moduleConfig=FARM_DEFAULT_CONFIG}={}) {
  parameters=validateFarmParameters(parameters);moduleConfig=validateFarmConfig(moduleConfig);
  const candidates=choices(facts,parameters).map(p=>candidate(facts,p,{moduleConfig}));
  const clock=authority(facts)?harvestClock(facts):null,plots=copy(facts?.plots??[]).map(plot=>plot.state==='GROWING_OR_RIPE_UNVERIFIED'?{...plot,state:clock?(Math.floor(clock.earliestMs/1000)>plot.ripeTime?'RIPE':'GROWING'):'MATURITY_UNKNOWN',reason:clock?null:'FARM_TRUSTED_CLOCK_OR_CONNECTION_UNKNOWN'}:plot);
  return {module:'farm',plots,autoFarming:facts?.autoFarming??null,crops:copy(facts?.catalog?.crops??[]),candidates,
    reliability:copy(facts?.farmReliability??{}),evidence:FARM_EVIDENCE,notes:[...(facts?.notes??[])],realGame:'REAL_UNVERIFIED'};
}
export function planFarmOperations(facts,{parameters={},moduleConfig=FARM_DEFAULT_CONFIG,selections,ledger=new ResourceLedger(facts?.stockReliable===true?facts.stock:null)}={}) {
  parameters=validateFarmParameters(parameters);moduleConfig=validateFarmConfig(moduleConfig);
  if(selections!==undefined&&(!dense(selections)||selections.length>100||selections.some(v=>!id(v))||new Set(selections).size!==selections.length))throw invalid('selections必须为唯一候选actionId数组');
  const candidates=choices(facts,parameters).map(p=>candidate(facts,p,{moduleConfig}));
  if(selections===undefined&&(!parameters.buildingId||!parameters.action||parameters.action==='plant'&&!parameters.productId))return {module:'farm',actions:[],notes:['需要精确地块、动作和播种作物，或显式选择当前候选']};
  if(selections?.some(v=>!candidates.some(r=>r.actionId===v)))throw invalid('农田选择不属于当前候选');
  const selected=candidates.filter(r=>selections===undefined||selections.includes(r.actionId));
  if(new Set(selected.map(r=>r.target.buildingId)).size!==selected.length)throw invalid('每块农田每批仅允许一个动作，收获后必须重新采集规划播种');
  const actions=[],notes=[];
  for(const row of selected){if(!row.executable){notes.push(row.blockedReason);continue;}if(ledger.reserve(row.costs))actions.push(row);else notes.push('SHARED_SEED_BUDGET_INSUFFICIENT');}
  return {module:'farm',actions,notes};
}
export function verifyFarmOperation(operation,beforeFacts,afterFacts,response) {
  const fail=reason=>({confirmed:false,reason});let parameters;
  try{parameters=validateFarmParameters(operation?.parameters);}catch{return fail('FARM_OPERATION_CONTRACT_INVALID');}
  if(!authority(beforeFacts)||!authority(afterFacts)||!same(beforeFacts.identityContext,afterFacts.identityContext))return fail('FARM_AUTHORITY_OR_CONTEXT_UNKNOWN');
  const original=candidate(beforeFacts,parameters,{moduleConfig:{enabled:true}}),after=afterFacts.plots.find(p=>p.buildingId===parameters.buildingId);
  try{if(!original.executable||operation.module!=='farm'||['actionId','actionType','target','costs','costSource','identity','beforeState','expectedState','action'].some(k=>!same(operation[k],original[k]))||!same(operationBudgetClaims(operation),operationBudgetClaims(original)))return fail('FARM_OPERATION_TARGET_OR_BEFORE_MISMATCH');}catch{return fail('FARM_OPERATION_CONTRACT_INVALID');}
  if(!same(beforeFacts.catalog,afterFacts.catalog)||beforeFacts.autoFarming!==false||afterFacts.autoFarming!==false)return fail('FARM_CONFIG_OR_AUTO_FARMING_CHANGED');
  if(parameters.action==='harvest'){if(!harvestClock(afterFacts)||liveFarmFacts.get(beforeFacts)?.client!==liveFarmFacts.get(afterFacts)?.client||!same(liveFarmFacts.get(beforeFacts)?.context,liveFarmFacts.get(afterFacts)?.context)||!after?.reliable||after.state!=='EMPTY')return fail('EXACT_EMPTY_FARM_OR_LIVE_CONTEXT_NOT_CONFIRMED');}
  else if(!after?.reliable||after.productId!==parameters.productId||after.state!=='GROWING_OR_RIPE_UNVERIFIED'||after.plantTime<=0||after.ripeTime<after.plantTime)return fail('EXACT_CROP_STATE_NOT_CONFIRMED');
  const withoutFarm=raw=>Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='farm'));
  if(!same(withoutFarm(original.beforeState),withoutFarm(after.raw)))return fail('TARGET_BUILDING_CHANGED_OUTSIDE_FARM');
  const other=f=>f.rawBuildings.filter(r=>r.buildingId!==parameters.buildingId).sort((a,b)=>a.buildingId<b.buildingId?-1:1);
  if(!same(other(beforeFacts),other(afterFacts)))return fail('NON_TARGET_PLOT_CHANGED');
  if(parameters.action==='harvest'){
    if(!own(response,'reward')||!dense(response.reward)||!response.reward.length)return fail('FARM_TYPED_CROP_REWARD_REQUIRED');
    let amount=0;const critical=[];
    for(const row of response.reward){const reward=own(row,'reward')?row.reward:null,num=own(reward,'num')?safeResourceQuantity(reward.num):null;
      if(!own(row,'critical')||!uint(row.critical)||!own(reward,'type')||reward.type!==0||!own(reward,'id')||reward.id!==original.target.productId||num===null||num<=0||!Number.isSafeInteger(amount+num))return fail('FARM_TYPED_CROP_REWARD_INVALID');amount+=num;critical.push(row.critical);}
    if(!stockMatchesDelta(beforeFacts.stock,afterFacts.stock,[],[{id:original.target.productId,num:amount}]))return fail('EXACT_HARVEST_NET_INVENTORY_NOT_CONFIRMED');
    return {confirmed:true,reason:'同批次单田清空与typed作物数量、完整库存净入共同确认',afterState:copy(after.raw),responseEvidence:{buildingId:parameters.buildingId,productId:original.target.productId,num:amount,critical}};
  }
  if(!stockMatchesDelta(beforeFacts.stock,afterFacts.stock,original.costs,[]))return fail('EXACT_SEED_DEBIT_AND_NET_INVENTORY_NOT_CONFIRMED');
  return {confirmed:true,reason:'新OnWater精确地块/作物与AllItem+AllResource精确种子净扣确认；静默窗口本身不是成功',afterState:copy(after.raw)};
}
export function prepareFarmHarvestWorkflow(facts,{config,moduleConfig=FARM_DEFAULT_CONFIG,...payload}={}){
 const p=validateFarmHarvestPreparation(payload);if(!authority(facts)||!harvestClock(facts)||!same(facts.catalog,catalogFrom(config)))throw invalid('收取准备需要当前连接可信事实、完整配置和服务器时钟');
 const ledger=new ResourceLedger(facts.stock),replant=p.replant?.map((next,i)=>{const crop=facts.catalog.crops.find(c=>c.productId===next.productId);if(!crop?.reliable||!facts.available.includes('FarmPlantRequest')||!ledger.reserve(crop.costs))throw invalid('初始自有种子或明确下一作物配置不足，不能预支未来收取收入');return {...copy(p.targets[i]),nextProductId:next.productId,seedId:crop.costs[0].id,seedNum:crop.costs[0].num};});
 const budget=ledger.reservationSummary(),nodes=[{id:'start',type:'START'}];
 for(let i=0;i<p.targets.length;i++){
  const source=p.targets[i],parameters={buildingId:source.buildingId,action:'harvest',pendingHarvests:copy(p.targets.slice(i)),...(replant?{replant:copy(replant.slice(i))}:{})},row=candidate(facts,parameters,{moduleConfig:validateFarmConfig(moduleConfig)});
  if(!row.executable||!same(source,harvestPlotSource(facts,facts.plots.find(plot=>plot.buildingId===source.buildingId))))throw invalid('原地块来源、成熟资格或独立单田合同不满足：'+(row.blockedReason??source.buildingId));
  budget.uids.push(...copy(row.budgetClaims.uids));nodes.push({id:'harvest-'+i,type:'ACTION',module:'farm',parameters,selection:{unique:true}},{id:(replant?'verify-harvest-':'verify-')+i,type:'VERIFY',module:'farm'});
  if(replant)nodes.push({id:'plant-'+i,type:'ACTION',module:'farm',parameters:{buildingId:source.buildingId,action:'plant',productId:replant[i].nextProductId,replant:copy(replant.slice(i))},selection:{unique:true}},{id:'verify-plant-'+i,type:'VERIFY',module:'farm'});
 }
 nodes.push({id:'stop',type:'STOP'});const graph={version:1,id:(replant?'farm-replant-':'farm-harvest-')+hash(p).slice(0,20),name:replant?'明确农田收取确认后再播种':'明确农田有限顺序收取',budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:p.targets.length*(replant?2:1),modules:['farm']},nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))};
 return {targets:copy(p.targets),...(replant?{replant:copy(replant)}:{}),graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:replant?'每田原作物收取确认落盘后，须由同账号/角色/世界/连接/代次历史及新调查实际空田证明前置，再播种明确下一作物。初始自有种子覆盖全部目标，累计资源和原收取UID预算固定；剩余来源或成本变化、拒绝、UNKNOWN及到限停止后继。准备不授权不派发，重启只读零重放，不开放批量请求。':'按明确顺序逐田收取，每步复用原单田合同及独立库存净入确认。固定所有尚未收取目标的作物、种植成熟时间及身份；发生变化、拒绝、UNKNOWN或到限停止后继。仅预留原地块UID，不预估奖励或扩大预算。准备不授权、不派发，重启只读不重放；不开放批量请求结算。'};
}
export function prepareFarmPlantWorkflow(facts,{config,moduleConfig=FARM_DEFAULT_CONFIG,...payload}={}){
  const p=validateFarmPlantPreparation(payload);if(!authority(facts)||!currentFarmSurvey(facts)||!same(facts.catalog,catalogFrom(config)))throw invalid('播种准备需要当前连接完整空田/库存事实及明确种子配置');
  const ledger=new ResourceLedger(facts.stock),nodes=[{id:'start',type:'START'}];
  for(let i=0;i<p.targets.length;i++){const source=p.targets[i],parameters={buildingId:source.buildingId,action:'plant',productId:source.productId,pendingPlants:copy(p.targets.slice(i))},row=candidate(facts,parameters,{moduleConfig:validateFarmConfig(moduleConfig)});if(!row.executable||!same(source,plantPlotSource(facts,facts.plots.find(plot=>plot.buildingId===source.buildingId),source.productId)))throw invalid('原空田、自选作物、种子成本或独立单田合同不满足：'+(row.blockedReason??source.buildingId));if(!ledger.reserve(row.costs))throw invalid('初始自有种子不足以覆盖全部明确播种，不能预支未来收入');nodes.push({id:'plant-'+i,type:'ACTION',module:'farm',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'farm'});}
  nodes.push({id:'stop',type:'STOP'});const graph={version:1,id:'farm-plant-'+hash(p).slice(0,20),name:'明确空田有限顺序播种',budget:ledger.reservationSummary(),runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:p.targets.length,modules:['farm']},nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))};
  return {targets:copy(p.targets),graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'按明确顺序逐田播种自选作物，每步复用原单田合同及精确种子净扣/目标作物独立确认；固定所有剩余空田和作物配置身份。初始持有种子须足额，累计父预算不随未来收入增加。来源或成本变化、拒绝、UNKNOWN及到限停止后继；准备不授权不派发，重启只读不重放，不开放批量播种请求。'};
}
function farmRejectionIdentity(operation,options){const parameters=operation?.parameters;if(parameters&&(own(parameters,'pendingHarvests')||own(parameters,'pendingPlants')||own(parameters,'replant'))){const {pendingHarvests,pendingPlants,replant,...plain}=parameters;return businessRejectionIdentityFromHistory({...operation,parameters:plain},options);}return businessRejectionIdentityFromHistory(operation,options);}
export function farmDependencyVersions({config,moduleConfig=FARM_DEFAULT_CONFIG}={}) {return {moduleConfig:validateFarmConfig(moduleConfig),...Object.fromEntries(['BuildingCfg','FarmlandPlantCfg'].map(name=>['config.'+name,copy(config?.tables?.[name]??null)])),evidence:FARM_EVIDENCE};}
export const farmModule=Object.freeze({id:'farm',label:'农田',capabilities:Object.freeze(['BIZ-R16a','BIZ-R16b','BIZ-R16c']),defaultConfig:FARM_DEFAULT_CONFIG,
  validateConfig:validateFarmConfig,validateParameters:validateFarmParameters,survey:surveyFarmOperations,view:viewFarmOperations,plan:planFarmOperations,verify:verifyFarmOperation,rejectionIdentity:farmRejectionIdentity,
  dependencyVersions:farmDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig','config.BuildingCfg','config.FarmlandPlantCfg','evidence']),
  evidence:FARM_EVIDENCE});