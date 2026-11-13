// Farm semantics only. Shared BusinessExecutor owns transport, permits, history,
// cancellation and UNKNOWN. This module never dispatches or changes autoFarming.
import { createHash } from 'node:crypto';
import { surveyCoreOperations } from './core-operation-adapters.mjs';
import { ResourceLedger, safeResourceQuantity, stockFromResponses, RESOURCE_NAMES, operationBudgetClaims } from './resource-ledger.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime } from './state-facts.mjs';
import { assertExecutionActive } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

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
  if(!fields(v,['buildingId','action','productId']))throw invalid('农田参数仅允许 buildingId、action、productId');
  const out={};
  if(own(v,'buildingId')){if(!id(v.buildingId))throw invalid('地块ID无效');out.buildingId=v.buildingId;}
  if(own(v,'action')){if(!['harvest','plant'].includes(v.action))throw invalid('农田动作仅允许 harvest 或 plant');out.action=v.action;}
  if(own(v,'productId')){if(v.action!=='plant'||!id(v.productId))throw invalid('productId仅用于明确plant作物');out.productId=v.productId;}
  return out;
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
  if(!own(items,'items')||!dense(items.items)||!own(resources,'list')||!dense(resources.list))return {stock:new Map(),stockReliable:false};
  const names=new Set();
  for(const row of items.items){if(!own(row,'itemId')||!id(row.itemId)||!own(row,'num')||safeResourceQuantity(row.num)===null||names.has(row.itemId))return {stock:new Map(),stockReliable:false};names.add(row.itemId);}
  const res=new Set();
  for(const row of resources.list){if(!own(row,'res')||!positive(row.res)||!own(row,'amount')||safeResourceQuantity(row.amount)===null||res.has(row.res)||names.has(RESOURCE_NAMES[row.res]??String(row.res)))return {stock:new Map(),stockReliable:false};res.add(row.res);}
  return {stock:stockFromResponses(items,resources),stockReliable:true};
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
  liveFarmFacts.set(facts,{client,player:options.player,context:copy(context),digest:farmDigest(facts)});return facts;
}
const farmDigest=f=>hash({...f,stock:[...f.stock]});
function harvestClock(facts) {
  const live=liveFarmFacts.get(facts),context=live?.context;
  if(!live||live.client.connected!==true||!id(context.connectionId)||!same(context,live.client.factContext)||!same(contextOf(context,live.player),facts.identityContext)||live.digest!==farmDigest(facts))return null;
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
  }
  else if(plot.state!=='EMPTY')reason='FARM_NOT_EXPLICITLY_EMPTY';
  else if(facts.autoFarming!==false)reason=facts.autoFarming===true?'SERVER_AUTO_FARMING_ENABLED':'AUTO_FARMING_UNKNOWN';
  else if(!crop?.reliable)reason='CROP_OR_SEED_COST_UNVERIFIED';
  else if(!facts.available?.includes('FarmPlantRequest'))reason='FARM_PLANT_PROTOCOL_UNAVAILABLE';
  else if(costs.some(r=>premium(r.id)||safeResourceQuantity(facts.stock.get(r.id)??0)<r.num))reason='SEED_STOCK_INSUFFICIENT_OR_D6_FORBIDDEN';
  const target={buildingId:parameters.buildingId??null,...(actionType==='PLANT'?{productId:parameters.productId??null}:{productId:plot?.productId??null})};
  const beforeState=plot?copy(plot.raw):null;
  const expectedState=actionType==='PLANT'?{buildingId:target.buildingId,productId:target.productId,seedCosts:costs,autoFarming:false,requiresCompleteCropState:true}:
    {buildingId:target.buildingId,previousProductId:target.productId,requiresTypedRewardAndNetInventory:true,maturityTimeUnit:'SERVER_SECONDS_STRICTLY_BEFORE',rewardRule:'EXACT_TYPED_CROP_NUM_NO_CRITICAL_MULTIPLICATION',autoFarming:false};
  const identity=plot?hash({context:facts.identityContext,targetPlot:plot.raw,autoFarming:facts.autoFarming,crop,buildingTypes:facts.catalog.types}):null;
  return {module:'farm',actionId:'farm:'+actionType+':'+hash(target),actionType,target,parameters:copy(parameters),beforeState,expectedState,identity,costs,
    budgetClaims:{resources:costs,quotas:[],uids:actionType==='HARVEST'&&plot?[{type:'farm-harvest',id:hash({context:facts.identityContext,buildingId:plot.buildingId,farm:plot.raw.farm})}]:[]},costSource:actionType==='HARVEST'?harvestSource:source,executable:reason===null,blockedReason:reason,
    ...(reason===null?{action:actionType==='HARVEST'?{request:'FarmHarvestRequest',response:'FarmHarvestResponse',body:{buildingId:[target.buildingId]}}:{request:'FarmPlantRequest',response:null,body:{args:[{buildingId:target.buildingId,productId:target.productId}]}}}:{})};
}
function choices(facts,parameters) {
  const out=[];
  for(const plot of facts?.plots??[]) {
    if(parameters.buildingId&&parameters.buildingId!==plot.buildingId)continue;
    if(parameters.action!=='plant')out.push({buildingId:plot.buildingId,action:'harvest'});
    if(parameters.action!=='harvest')for(const crop of facts?.catalog?.crops??[]){if(!id(crop.productId)||parameters.productId&&parameters.productId!==crop.productId||out.some(row=>row.buildingId===plot.buildingId&&row.action==='plant'&&row.productId===crop.productId))continue;out.push({buildingId:plot.buildingId,action:'plant',productId:crop.productId});}
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
    const keys=new Set([...beforeFacts.stock.keys(),...afterFacts.stock.keys(),original.target.productId]);
    for(const key of keys){const before=safeResourceQuantity(beforeFacts.stock.get(key)??0),next=safeResourceQuantity(afterFacts.stock.get(key)??0);if(before===null||next===null||!Number.isSafeInteger(before+(key===original.target.productId?amount:0))||next!==before+(key===original.target.productId?amount:0))return fail('EXACT_HARVEST_NET_INVENTORY_NOT_CONFIRMED');}
    return {confirmed:true,reason:'同批次单田清空与typed作物数量、完整库存净入共同确认',afterState:copy(after.raw),responseEvidence:{buildingId:parameters.buildingId,productId:original.target.productId,num:amount,critical}};
  }
  const costs=new Map(original.costs.map(r=>[r.id,r.num])),keys=new Set([...beforeFacts.stock.keys(),...afterFacts.stock.keys()]);
  for(const key of keys){const before=safeResourceQuantity(beforeFacts.stock.get(key)??0),next=safeResourceQuantity(afterFacts.stock.get(key)??0);if(before===null||next===null||before<(costs.get(key)??0)||next!==before-(costs.get(key)??0))return fail('EXACT_SEED_DEBIT_AND_NET_INVENTORY_NOT_CONFIRMED');}
  return {confirmed:true,reason:'新OnWater精确地块/作物与AllItem+AllResource精确种子净扣确认；静默窗口本身不是成功',afterState:copy(after.raw)};
}
export function farmDependencyVersions({config,moduleConfig=FARM_DEFAULT_CONFIG}={}) {return {moduleConfig:validateFarmConfig(moduleConfig),...Object.fromEntries(['BuildingCfg','FarmlandPlantCfg'].map(name=>['config.'+name,copy(config?.tables?.[name]??null)])),evidence:FARM_EVIDENCE};}
export const farmModule=Object.freeze({id:'farm',label:'农田',capabilities:Object.freeze(['BIZ-R16a','BIZ-R16b','BIZ-R16c']),defaultConfig:FARM_DEFAULT_CONFIG,
  validateConfig:validateFarmConfig,validateParameters:validateFarmParameters,survey:surveyFarmOperations,view:viewFarmOperations,plan:planFarmOperations,verify:verifyFarmOperation,
  dependencyVersions:farmDependencyVersions,dependencyKeys:Object.freeze(['moduleConfig','config.BuildingCfg','config.FarmlandPlantCfg','evidence']),
  evidence:FARM_EVIDENCE});