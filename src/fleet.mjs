import { createHash } from 'node:crypto';
import { ACTIONS, buildBody } from './actions.mjs';
import { businessRejectionIdentityFromHistory } from './business-functions.mjs';
// Fleet/cargo adapters. Existing GameClient, Session and shared executor own execution.
import { ResourceLedger, RESOURCE_NAMES } from './resource-ledger.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { loadMapAsset } from './world.mjs';
import { parseFormation, validateFormationParameters, planFormation, catalogFrom } from './formation.mjs';
import { worldObservationQuery, strictParameters, invalid, readNavalFact, fleetFacts, rowsOf, quantity, nonempty, stable, selectedActions, stockMatchesDelta, moduleConfiguration } from './naval-facts.mjs';
import { readGameTime } from './state-facts.mjs';
import { readResourceFieldRevision } from './client.mjs';
import { toSnapshotJson } from './game.mjs';

export const FLEET_DEFAULT_CONFIG = Object.freeze({ enabled: false, repair: false, repairBelowDurabilityRatio: 0.8, repairMode: 'IMMEDIATE', maximumRepairPetrolPerPlan: 0, repairPriorityBuildingIds: [], stopRepair: false, move: false, cargoFill: false, cargoClaim: false, giveUpResourceField: false, formation: false, autoFight: false, speedUp: false, minimumDurabilityRatio: 0.8, petrolReserve: 0, scenarioId: 1 });
function parametersOf(parameters = {}) {
  strictParameters(parameters, ['buildingId', 'cityId', 'shipIndex', 'cargoIndex', 'presetId', 'heroIds', 'heroPositions', 'resourceFieldGridIdx', 'screenCenter', 'expectedCargoHash', 'expectedRepairHash']);
  if(Object.hasOwn(parameters,'resourceFieldGridIdx')){
    const keys=Reflect.ownKeys(parameters),d=Object.getOwnPropertyDescriptor(parameters,'resourceFieldGridIdx');
    if(keys.length!==1||!d?.enumerable||!Object.hasOwn(d,'value')||!Number.isInteger(d.value)||d.value<0||d.value>2147483647)throw invalid('放弃资源田须仅声明明确的非负int32 resourceFieldGridIdx');
    return {resourceFieldGridIdx:d.value};
  }
  if(Object.hasOwn(parameters,'expectedCargoHash')){
    const d=Object.getOwnPropertyDescriptor(parameters,'expectedCargoHash');
    if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!/^[a-f0-9]{64}$/.test(d.value)||![2,3].includes(Reflect.ownKeys(parameters).length)||!Object.hasOwn(parameters,'shipIndex')||Reflect.ownKeys(parameters).length===3&&!Object.hasOwn(parameters,'cargoIndex')||!['shipIndex',...(Object.hasOwn(parameters,'cargoIndex')?['cargoIndex']:[])].every(k=>{const v=Object.getOwnPropertyDescriptor(parameters,k);return v?.enumerable&&Object.hasOwn(v,'value')&&Number.isInteger(v.value)&&v.value>0&&v.value<=2147483647;}))throw invalid('货船准备摘要只能绑定精确领取船号或装货船号与货格');
  }
  if(Object.hasOwn(parameters,'expectedRepairHash')){
    const d=Object.getOwnPropertyDescriptor(parameters,'expectedRepairHash'),id=Object.getOwnPropertyDescriptor(parameters,'buildingId');
    if(Reflect.ownKeys(parameters).length!==2||!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!/^[a-f0-9]{64}$/.test(d.value)||!id?.enumerable||!Object.hasOwn(id,'value')||!nonempty(id.value)||id.value.trim()!==id.value||id.value.length>300)throw invalid('维修准备摘要须绑定唯一明确舰队');
  }
  if (parameters.screenCenter !== undefined) worldObservationQuery(parameters.screenCenter);
  if (parameters.buildingId !== undefined && !nonempty(parameters.buildingId)) throw invalid('舰队 ID 无效');
  for (const key of ['cityId', 'shipIndex', 'cargoIndex']) if (parameters[key] !== undefined && (!Number.isSafeInteger(parameters[key]) || parameters[key] <= 0 || parameters[key] > 2147483647)) throw invalid('目标编号必须是明确的正 int32');
  const formation = Object.fromEntries(['presetId', 'heroIds', 'heroPositions'].filter(key => Object.hasOwn(parameters, key)).map(key => [key, parameters[key]]));
  if (Object.keys(formation).length) { if (!nonempty(parameters.buildingId)) throw invalid('舰队阵容必须绑定明确 buildingId'); validateFormationParameters(formation); }
  return parameters;
}

// A daily/Loop intent selects exactly one existing cargo operation. Eligibility,
// material costs and settlement remain owned by the original Fleet contract.
export function fleetCargoFillSelection(input) {
  strictParameters(input, ['shipIndex', 'cargoIndex']);
  if (!input || Reflect.ownKeys(input).length !== 2 || !['shipIndex','cargoIndex'].every(key => {
    const descriptor=Object.getOwnPropertyDescriptor(input,key);
    return descriptor?.enumerable && Object.hasOwn(descriptor,'value') && Number.isSafeInteger(descriptor.value) && descriptor.value>=1 && descriptor.value<=2147483647;
  })) throw invalid('装货需要明确的正int32 shipIndex和cargoIndex，不能包含其他舰队动作参数');
  return {actionId:'fleet:cargoFill:'+input.shipIndex+':'+input.cargoIndex};
}

// Cargo uses protocol DisplayAssetType ITEM=0 / RESOURCE=1. The expected
// rewards come from the original order/arrival, never from the write response.
const cargoStatusText = Object.freeze({0:'采购中',1:'航行中',2:'已返回'});
const cargoResourceIds = new Set(Object.values(RESOURCE_NAMES));
const denseCargoArray = value => Array.isArray(value) && Array.from({length:value.length},(_,index)=>Object.hasOwn(value,index)).every(Boolean);
const ownCargo = (value,key) => value && typeof value==='object' && Object.hasOwn(value,key);
function cargoAsset(value) {
  if (!['type','id','num'].every(key=>ownCargo(value,key)) || ![0,1].includes(value.type) || !nonempty(value.id) || value.id!==value.id.trim()) return null;
  const num=quantity(value.num);
  if (num===null || num<=0 || (value.type===1 && !cargoResourceIds.has(value.id)) || (value.type===0 && cargoResourceIds.has(value.id))) return null;
  return {type:value.type,id:value.id,num};
}
function cargoAssets(value) {
  if (!denseCargoArray(value) || !value.length) return null;
  const sums=new Map();
  for (const raw of value) {
    const asset=cargoAsset(raw); if(!asset)return null;
    const key=asset.type+':'+asset.id, num=(sums.get(key)?.num??0)+asset.num;
    if(!Number.isSafeInteger(num))return null;
    sums.set(key,{...asset,num});
  }
  return [...sums.values()].sort((a,b)=>a.type-b.type||a.id.localeCompare(b.id));
}
function cargoShip(raw) {
  if (!['index','status','arriveTime','orderItem','reward'].every(key=>ownCargo(raw,key)) || !Number.isSafeInteger(raw.index) || raw.index<=0 || raw.index>2147483647 || ![0,1,2].includes(raw.status) || !Number.isSafeInteger(raw.arriveTime) || raw.arriveTime<0 || raw.arriveTime>2147483647 || !denseCargoArray(raw.orderItem) || !raw.orderItem.length) return null;
  const orderItem=[];
  for (const row of raw.orderItem) {
    const asset=ownCargo(row,'asset')?cargoAsset(row.asset):null;
    const reward=ownCargo(row,'reward') && ownCargo(row.reward,'asset')?cargoAssets(row.reward.asset):null;
    if(!asset || asset.type!==0 || !ownCargo(row,'filled') || typeof row.filled!=='boolean' || !reward)return null;
    orderItem.push({asset,filled:row.filled,reward});
  }
  const reward=cargoAssets(raw.reward); if(!reward)return null;
  if(raw.status===0 ? raw.arriveTime!==0 || orderItem.every(row=>row.filled) : raw.arriveTime===0 || orderItem.some(row=>!row.filled))return null;
  return {index:raw.index,status:raw.status,arriveTime:raw.arriveTime,orderItem,reward};
}
function cargoHeaderReliable(ships) {
  return denseCargoArray(ships) && ships.every(ship=>ownCargo(ship,'index') && Number.isSafeInteger(ship.index) && ship.index>0 && ship.index<=2147483647) && new Set(ships.map(ship=>ship.index)).size===ships.length;
}
export { cargoShip as fleetCargoShip, cargoHeaderReliable as fleetCargoHeader, cargoAssets as fleetCargoAssets };
export function fleetInventory(items, resources) {
  return parseOperationInventory(items?.available === true ? items.body : null,
    resources?.available === true ? resources.body : null, { allowLegacyAliases: true });
}
function cargoInventory(facts) {
  if(facts?.stockReliable!==true)return null;
  if(!facts.sources) {
    // Keep existing in-memory/legacy callers; production reads always carry sources.
    if (!(facts.stock instanceof Map) || [...facts.stock].some(([id,num])=>!nonempty(id)||quantity(num)===null)) return null;
    return new Map([...facts.stock].map(([id,num])=>[id,quantity(num)]));
  }
  const inventory=fleetInventory(facts.sources.AllItemRequest,facts.sources.AllResourceRequest);
  return inventory.stockReliable ? inventory.stock : null;
}
export { cargoInventory as fleetInventorySnapshot };
function cargoStockAmount(stock,id) {return stock instanceof Map?quantity(stock.has(id)?stock.get(id):0):null;}
function cargoInventoryMatches(beforeFacts,afterFacts,costs,rewards) {
  return stockMatchesDelta(cargoInventory(beforeFacts),cargoInventory(afterFacts),costs,rewards);
}
const cargoSnapshotHash=ship=>createHash('sha256').update(stable(ship)).digest('hex');
function cargoFillExpected(ship,index) {return {cargoIndex:index+1,filled:true,reward:ship.orderItem[index].reward};}
function cargoClaimExpected(ship) {return {oldArrivalConsumed:true,reward:ship.reward};}
export function cargoShortageView(facts, options = {}) {
  const candidates=options.candidates??buildCandidates(facts,options),stock=cargoInventory(facts),totals=new Map(),notes=[];
  const header=facts?.cargoReliable===true&&cargoHeaderReliable(facts.ships),ships=[];
  if(!header)notes.push('CARGO_SOURCE_UNRELIABLE');
  for(const raw of header?facts.ships:[]) {
    const parsed=cargoShip(raw),slots=[];
    if(!parsed)notes.push('CARGO_SHIP_UNRELIABLE:'+raw.index);
    const orders=denseCargoArray(raw.orderItem)?raw.orderItem:[];
    for(let index=0;index<orders.length;index++) {
      const row=orders[index],asset=ownCargo(row,'asset')?cargoAsset(row.asset):null;
      const filled=ownCargo(row,'filled')&&typeof row.filled==='boolean'?row.filled:null;
      const have=asset?cargoStockAmount(stock,asset.id):null,required=asset?.num??null;
      const reliable=Boolean(parsed&&asset&&have!==null);
      const selected=candidates.find(row=>row.actionType==='cargoFill'&&row.target.shipIndex===raw.index&&row.target.cargoIndex===index+1);
      slots.push({cargoIndex:index+1,id:asset?.id??null,type:asset?.type??null,required,have,missing:reliable?Math.max(0,required-have):null,filled,reliable,reason:selected?.reason??(!reliable?'CARGO_FACTS_UNRELIABLE':null),actionId:selected?.actionId??null,reward:parsed?.orderItem[index]?.reward??null});
      if(parsed?.status===0&&!filled&&asset) {
        const key=asset.type+':'+asset.id,old=totals.get(key),sum=(old?.required??0)+asset.num;
        totals.set(key,{id:asset.id,type:asset.type,required:old?.required===null?null:Number.isSafeInteger(sum)?sum:null});
      }
    }
    const claim=candidates.find(row=>row.actionType==='cargoClaim'&&row.target.shipIndex===raw.index);
    ships.push({shipIndex:raw.index,status:ownCargo(raw,'status')&&[0,1,2].includes(raw.status)?raw.status:null,statusText:ownCargo(raw,'status')?cargoStatusText[raw.status]??'未知':'未知',arriveTime:ownCargo(raw,'arriveTime')&&quantity(raw.arriveTime)!==null?quantity(raw.arriveTime):null,voyageIdentity:parsed?stable(parsed):null,preparationHash:parsed?cargoSnapshotHash(parsed):null,reliable:Boolean(parsed),reason:parsed?null:'CARGO_SHIP_UNRELIABLE',claimActionId:claim?.actionId??null,claimReason:claim?.reason??null,reward:parsed?.reward??null,slots});
  }
  const shortages=[...totals.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(row=>{const have=cargoStockAmount(stock,row.id),reliable=row.required!==null&&have!==null;return {...row,have,missing:reliable?Math.max(0,row.required-have):null,reliable};});
  if(!stock)notes.push('CARGO_INVENTORY_UNRELIABLE');
  return {reliable:header&&ships.every(ship=>ship.reliable),inventoryReliable:Boolean(stock),source:'CargoShipsResponse',ships,shortages,notes};
}

// This is a finite composition of original single-slot plans, not a new executor.
// The preparation hash guards planning only; the original action retains its exact
// beforeState/identity and unchanged parameters for execution and receipt recovery.
export function validateCargoFillPreparation(value){
  strictParameters(value,['shipIndex','cargoIndices','expectedCargoHash','maxDurationMs']);
  if(Reflect.ownKeys(value).length!==4||!['shipIndex','cargoIndices','expectedCargoHash','maxDurationMs'].every(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return d?.enumerable&&Object.hasOwn(d,'value');})||!Number.isInteger(value.shipIndex)||value.shipIndex<1||value.shipIndex>2147483647||!fieldDense(value.cargoIndices)||!value.cargoIndices.length||value.cargoIndices.length>24||value.cargoIndices.some(v=>!Number.isInteger(v)||v<1||v>2147483647)||new Set(value.cargoIndices).size!==value.cargoIndices.length||typeof value.expectedCargoHash!=='string'||!/^[a-f0-9]{64}$/.test(value.expectedCargoHash)||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('装货组合须明确一艘货船、1至24个不同货格、当前状态摘要和有限总时长');
  return {shipIndex:value.shipIndex,cargoIndices:[...value.cargoIndices].sort((a,b)=>a-b),expectedCargoHash:value.expectedCargoHash,maxDurationMs:value.maxDurationMs};
}
export function prepareCargoFillWorkflow(facts,{config=facts?.config,moduleConfig=FLEET_DEFAULT_CONFIG,...input}={}){
  const p=validateCargoFillPreparation(input),opts=validateFleetConfig(moduleConfig),stock=cargoInventory(facts);
  const raw=facts?.cargoReliable===true&&cargoHeaderReliable(facts.ships)?facts.ships.find(s=>s.index===p.shipIndex):null,ship=cargoShip(raw);
  if(!opts.enabled||!opts.cargoFill||!stock||!ship||ship.status!==0||cargoSnapshotHash(ship)!==p.expectedCargoHash)throw invalid('装货组合缺少开启配置、完整库存或与所选摘要一致的采购状态');
  const simulated=structuredClone(raw),ledger=new ResourceLedger(stock),nodes=[{id:'start',type:'START'}],steps=[];
  for(const cargoIndex of p.cargoIndices){
    const state=cargoShip(simulated);if(!state||!state.orderItem[cargoIndex-1]||state.orderItem[cargoIndex-1].filled!==false)throw invalid('所选货格不是当前采购状态中明确未装的一格');
    const parameters={shipIndex:p.shipIndex,cargoIndex,expectedCargoHash:cargoSnapshotHash(state)},selection=fleetCargoFillSelection({shipIndex:p.shipIndex,cargoIndex});
    const planned=planFleet({...facts,ships:facts.ships.map(s=>s.index===p.shipIndex?simulated:s)}, {config,moduleConfig:opts,parameters,selections:[selection],ledger});
    const action=planned.actions?.[0];if(planned.actions?.length!==1||action.actionType!=='cargoFill')throw invalid('装货组合不能按当前自有材料与原单格合同完成全部选择；不使用预期奖励扩充预算');
    steps.push({cargoIndex,parameters:structuredClone(parameters),costs:structuredClone(action.costs)});
    nodes.push({id:'fill-'+cargoIndex,type:'ACTION',module:'fleet',parameters,selection},{id:'verify-'+cargoIndex,type:'VERIFY',module:'fleet'});
    simulated.orderItem[cargoIndex-1].filled=true;
  }
  nodes.push({id:'stop',type:'STOP'});
  const budget={resources:[...ledger.reserved].sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num})),quotas:[],uids:[]},fingerprint=cargoSnapshotHash({payload:p,budget,steps});
  return {...p,steps,budget,graph:{version:1,id:'cargo-fill-'+fingerprint.slice(0,20),name:'货船 '+p.shipIndex+' 明确货格有限装货',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['fleet']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,
    limitation:'仅处理本次明确采购状态中的所选货格，每格重新调查、核对预期状态、独立计划授权并验证原typed奖励和完整库存；预算只用准备时已持有材料。货船状态/需求变化、拒绝或UNKNOWN停止后续执行，不补购、不加速、不领取到港奖励、不循环到新采购状态。摘要只比较本次完整状态，不是服务端唯一航次ID；准备不执行、不授权，重启只读。'};
}

// Compose the original repair plan once, preserving its priority and cumulative
// petrol limit. Hashes constrain planning; actions and recovery retain their
// original parameters, identity, costs, beforeState and verifier.
function repairPreparationHash(row,opts){
  return cargoSnapshotHash({beforeState:row.beforeState,costs:row.costs,costSource:row.costSource,expectedState:row.expectedState,config:opts});
}
export function validateCargoClaimPreparation(value){
 strictParameters(value,['action','claims','maxDurationMs']);
 if(Reflect.ownKeys(value).length!==3||!['action','claims','maxDurationMs'].every(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return d?.enumerable&&Object.hasOwn(d,'value');})||value.action!=='claim'||!fieldDense(value.claims)||value.claims.length<1||value.claims.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('到港领取组合须明确claim、1至24艘不同货船和有限总时长');
 const claims=value.claims.map(row=>{parametersOf(row);if(Reflect.ownKeys(row).length!==2||!Object.hasOwn(row,'shipIndex')||!Object.hasOwn(row,'expectedCargoHash'))throw invalid('到港目标须明确船号和原航次摘要');return {shipIndex:row.shipIndex,expectedCargoHash:row.expectedCargoHash};});
 if(new Set(claims.map(row=>row.shipIndex)).size!==claims.length)throw invalid('到港领取组合不得重复货船');return {action:'claim',claims,maxDurationMs:value.maxDurationMs};
}
export function prepareCargoClaimWorkflow(facts,{config=facts?.config,moduleConfig=FLEET_DEFAULT_CONFIG,...input}={}){
 const p=validateCargoClaimPreparation(input),opts=validateFleetConfig(moduleConfig),stock=cargoInventory(facts);
 if(!opts.enabled||!opts.cargoClaim||!stock)throw invalid('到港领取组合缺少开启配置或完整库存');
 const rows=buildCandidates(facts,{config,moduleConfig:opts,parameters:{}}),selected=p.claims.map(target=>{
  const row=rows.find(row=>row.actionType==='cargoClaim'&&row.target.shipIndex===target.shipIndex);
  if(!row||row.decision!=='READY'||cargoSnapshotHash(row.beforeState.ship)!==target.expectedCargoHash)throw invalid('所选货船航次、到港状态、奖励或资格已改变；须重新调查');return {actionId:row.actionId};
 }),planned=planFleet(facts,{config,moduleConfig:opts,parameters:{},selections:selected,ledger:new ResourceLedger(stock)});
 if(planned.actions.length!==p.claims.length||planned.actions.some(row=>row.actionType!=='cargoClaim'||row.costs.length))throw invalid('原单船领取合同不能确认全部所选到港货船');
 const nodes=[{id:'start',type:'START'}],steps=planned.actions.map((row,i)=>{
  const parameters={shipIndex:row.target.shipIndex,expectedCargoHash:cargoSnapshotHash(row.beforeState.ship)},selection={actionId:row.actionId};
  nodes.push({id:'claim-'+i,type:'ACTION',module:'fleet',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'fleet'});return {parameters,selection,costs:[],rewards:structuredClone(row.beforeState.ship.reward)};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:[]};
 return {...p,steps,budget,graph:{version:1,id:'cargo-claim-'+cargoSnapshotHash({p,steps}).slice(0,20),name:'明确到港货船逐船领取',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['fleet']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'仅领取本次明确选择的已到港航次，每船原Function重新调查、单次授权及typed奖励与完整库存精确净入验证；状态、航次或奖励变化、拒绝及UNKNOWN停止。准备只读，不预测或追加所得预算，不含装货、出航、加速、等待或下一航次，不恢复执行。'};
}

export function validateFleetRepairPreparation(value){
  strictParameters(value,['repairs','maxDurationMs']);
  if(Reflect.ownKeys(value).length!==2||!['repairs','maxDurationMs'].every(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return d?.enumerable&&Object.hasOwn(d,'value');})||!fieldDense(value.repairs)||!value.repairs.length||value.repairs.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('维修组合须明确1至24艘不同舰队及有限总时长');
  const repairs=value.repairs.map(row=>{parametersOf(row);if(!Object.hasOwn(row,'expectedRepairHash'))throw invalid('维修组合缺少原状态摘要');return {buildingId:row.buildingId,expectedRepairHash:row.expectedRepairHash};});
  if(new Set(repairs.map(row=>row.buildingId)).size!==repairs.length)throw invalid('维修组合不得重复舰队');
  return {repairs,maxDurationMs:value.maxDurationMs};
}
export function prepareFleetRepairWorkflow(facts,{config=facts?.config,moduleConfig=FLEET_DEFAULT_CONFIG,...input}={}){
  const p=validateFleetRepairPreparation(input),opts=validateFleetConfig(moduleConfig),stock=cargoInventory(facts);
  if(!stock)throw invalid('维修组合缺少完整库存');
  const rows=buildCandidates(facts,{config,moduleConfig:opts,parameters:{}}),selected=p.repairs.map(target=>{
    const row=rows.find(row=>row.actionType==='fleetRepair'&&row.target.buildingId===target.buildingId);
    if(!row||row.decision!=='READY'||repairPreparationHash(row,opts)!==target.expectedRepairHash)throw invalid('所选舰队的维修资格、状态、成本或配置已改变；须重新调查');
    return {actionId:row.actionId};
  }),ledger=new ResourceLedger(stock),planned=planFleet(facts,{config,moduleConfig:opts,parameters:{},selections:selected,ledger});
  if(planned.actions.length!==p.repairs.length||planned.actions.some(row=>row.actionType!=='fleetRepair'))throw invalid('原累计维修上限、汽油保留线或资格不允许完成全部所选舰队');
  const nodes=[{id:'start',type:'START'}],steps=planned.actions.map((row,i)=>{
    const parameters={buildingId:row.target.buildingId,expectedRepairHash:repairPreparationHash(row,opts)},selection={actionId:row.actionId};
    nodes.push({id:'repair-'+i,type:'ACTION',module:'fleet',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'fleet'});
    return {parameters,selection,costs:structuredClone(row.costs)};
  });
  nodes.push({id:'stop',type:'STOP'});
  const budget={resources:[...ledger.reserved].sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num})),quotas:[],uids:[]};
  return {...p,steps,budget,graph:{version:1,id:'fleet-repair-'+cargoSnapshotHash({payload:p,steps,budget}).slice(0,20),name:'明确舰队有限维修',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['fleet']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,
    limitation:'仅维修本次明确选择且符合原阈值的舰队，顺序、累计汽油上限及保留线均使用原计划器。每舰重新调查、核对原状态及成本、独立计划授权并验证完整库存净扣和维修开始或完成；不推断全部维修到期、不派遣、不加速、不补油。状态或配置变化、拒绝及UNKNOWN停止，准备不执行、不授权，重启只读。'};
}

function parseFleetFormation(value) { const formation = parseFormation(value); if (formation && String(formation.petUid) === '0') delete formation.petUid; return formation; }
// The live survey and read-only recovery consume the same OnWater projection.
export function fleetFormationBuildings(source) {
  const rows=source?.body?.building;
  const buildingsReliable=source?.available===true&&fieldDense(rows)&&rows.every(row=>nonempty(row?.buildingId))&&new Set(rows.map(row=>row.buildingId)).size===rows.length;
  return {buildingsReliable,buildings:buildingsReliable?rows.filter(row=>row.fleet).map(row=>({buildingId:row.buildingId,level:quantity(row.level),formation:parseFleetFormation(row.fleet.formation)})):[]};
}
export function validateFleetConfig(value = {}) { const result = moduleConfiguration(value, FLEET_DEFAULT_CONFIG); if (!Number.isFinite(result.minimumDurabilityRatio) || result.minimumDurabilityRatio <= 0 || result.minimumDurabilityRatio > 1 || quantity(result.petrolReserve) === null || !Number.isSafeInteger(result.scenarioId) || result.scenarioId < 1) throw invalid('舰队规则无效'); if (!Number.isFinite(result.repairBelowDurabilityRatio) || result.repairBelowDurabilityRatio <= 0 || result.repairBelowDurabilityRatio > 1 || !['IMMEDIATE','WAIT_NATURAL'].includes(result.repairMode) || !Number.isSafeInteger(result.maximumRepairPetrolPerPlan) || result.maximumRepairPetrolPerPlan < 0 || result.maximumRepairPetrolPerPlan > 1e9 || result.repairPriorityBuildingIds.some(id => !nonempty(id) || id.trim() !== id || id.length > 300) || new Set(result.repairPriorityBuildingIds).size !== result.repairPriorityBuildingIds.length) throw invalid('维修阈值、模式、计划预算或优先级无效'); return result; }
const fieldOwners=new WeakMap();
const fieldDense=value=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=10000&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const fieldUint=value=>Number.isInteger(value)&&value>=0&&value<=2147483647;
function resourceFields(raw){
 if(!ownCargo(raw,'info')||!ownCargo(raw.info,'maxNum')||!fieldUint(raw.info.maxNum)||!ownCargo(raw.info,'fields')||!fieldDense(raw.info.fields)||raw.info.fields.length>raw.info.maxNum)return null;
 const fields=[];
 for(const row of raw.info.fields){if(!['gridIdx','cityId','type'].every(k=>ownCargo(row,k)&&fieldUint(row[k]))||row.cityId<1||fields.some(r=>r.gridIdx===row.gridIdx))return null;fields.push({gridIdx:row.gridIdx,cityId:row.cityId,type:row.type});}
 return {maxNum:raw.info.maxNum,fields:fields.sort((a,b)=>a.gridIdx-b.gridIdx)};
}
function fieldContext(client,player){
 const role=toSnapshotJson(player??{}),identity=Object.fromEntries(['playerId','worldId'].map(k=>[k,typeof role[k]==='string'&&/^[1-9][0-9]{0,18}$/.test(role[k])&&BigInt(role[k])<(1n<<63n)?role[k]:Number.isSafeInteger(role[k])&&role[k]>0?String(role[k]):null]));
 const context=client.factContext;return context&&{accountId:context.accountId,connectionId:context.connectionId,generation:context.generation,...identity};
}
function fieldDigest(f){return stable({parameters:f.parameters,resourceFields:f.resourceFields,sourceRevision:f.sourceRevision,sourceAt:f.sourceAt,stock:[...f.stock],stockReliable:f.stockReliable,protocolReady:f.protocolReady,config:f.config});}
function fieldCurrent(f){
 const owner=fieldOwners.get(f);return Boolean(owner&&owner.client.connected===true&&owner.digest===fieldDigest(f)&&Date.now()>=f.sourceAt&&Date.now()-f.sourceAt<=30000&&stable(owner.context)===stable(fieldContext(owner.client,owner.player))&&stable(f.sourceRevision)===stable(readResourceFieldRevision(owner.client,owner.context)));
}
async function surveyResourceFields(client,protocol,{config=null,player=null,signal,parameters={},assertCurrent=()=>{}}={}){
 const context=fieldContext(client,player),revision=readResourceFieldRevision(client,context),sourceAt=Date.now();
 const read=async request=>{assertCurrent();const result=await readNavalFact(client,protocol,request,{}, {signal});assertCurrent();return result;};
 const first=await read('MyResFieldsRequest'),items=await read('AllItemRequest'),resources=await read('AllResourceRequest'),last=await read('MyResFieldsRequest');
 const before=resourceFields(first.body),after=resourceFields(last.body),inventory={AllItemRequest:items,AllResourceRequest:resources};
 const stock=fleetInventory(items,resources),f={config,player:structuredClone(player),parameters:structuredClone(parameters),sources:inventory,...stock,sourceRevision:revision,sourceAt,resourceFields:before&&after&&stable(before)===stable(after)?before:null,protocolReady:{GiveUpResFieldRequest:Boolean(protocol?.GiveUpResFieldRequest)}};
 // Reuse the complete inventory parser; duplicate or missing quantities stay unknown.
 f.stockReliable=f.stockReliable&&cargoInventory(f)!==null;
 if(revision&&context&&stable(context)===stable(fieldContext(client,player))&&stable(revision)===stable(readResourceFieldRevision(client,context)))fieldOwners.set(f,{client,player,context,digest:fieldDigest(f)});
 return f;
}
export { surveyResourceFields as surveyFleetResourceFields };
// Durable recovery shares only the original settlement comparison; live writes
// still require the private source seals and the original canonical candidate.
export function fleetResourceFieldAction(gridIdx) {
 return {request:ACTIONS.giveUpField.request,response:ACTIONS.giveUpField.response,body:buildBody(ACTIONS.giveUpField,{gridIdx})};
}
function resourceFieldState(f) {
 const owner=fieldOwners.get(f);
 return {context:owner?.context??null,resourceFields:f.resourceFields??null,inventory:[...(cargoInventory(f)??[])].sort(([a],[b])=>a.localeCompare(b))};
}
export function fleetResourceFieldObservation(f) {
 return fieldCurrent(f)&&f.resourceFields&&f.stockReliable?structuredClone(resourceFieldState(f)):null;
}
export function parseFleetResourceFieldState(value) {
 if(!value||!value.context||!fieldDense(value.inventory))return null;
 const fields=resourceFields({info:value.resourceFields});
 if(!fields||value.inventory.some(row=>!fieldDense(row)||row.length!==2)||new Set(value.inventory.map(row=>row[0])).size!==value.inventory.length)return null;
 const stock=cargoInventory({stockReliable:true,stock:new Map(value.inventory)});
 if(!stock)return null;
 const parsed={context:structuredClone(value.context),resourceFields:fields,inventory:[...stock].sort(([a],[b])=>a.localeCompare(b))};
 return stable(parsed)===stable(value)?parsed:null;
}
export function verifyFleetResourceFieldOutcome(operation,beforeState,afterState) {
 const before=parseFleetResourceFieldState(beforeState),after=parseFleetResourceFieldState(afterState),gridIdx=operation.target?.gridIdx;
 if(!before||!after||!fieldUint(gridIdx)||!before.resourceFields.fields.some(row=>row.gridIdx===gridIdx))return {confirmed:false,reason:'资源田完整原状态或目标身份缺失'};
 const expected={...before,resourceFields:{maxNum:before.resourceFields.maxNum,fields:before.resourceFields.fields.filter(row=>row.gridIdx!==gridIdx)}};
 const confirmed=stable(operation.beforeState)===stable(before)&&operation.identity===stable(before)&&stable(operation.expectedState)===stable(expected)&&stable(after)===stable(expected);
 return {confirmed,reason:confirmed?'独立完整MyResFields确认仅指定资源田移除、上限及其他田不变，完整库存不变；不领取收益':'目标移除、非目标田、上限或库存未精确确认，保持UNKNOWN'};
}
function resourceFieldCandidate(f,parameters,opts,settlement=false){
 const field=f.resourceFields?.fields.find(row=>row.gridIdx===parameters.resourceFieldGridIdx),owner=fieldOwners.get(f),context=owner?.context;
 const valid=settlement?owner&&owner.digest===fieldDigest(f)&&stable(owner.context)===stable(fieldContext(owner.client,owner.player)):fieldCurrent(f);
 const reason=!opts.enabled||!opts.giveUpResourceField?'MODULE_DISABLED':!valid||!f.resourceFields||!f.stockReliable?'RESOURCE_FIELD_FACTS_UNKNOWN':!field?'RESOURCE_FIELD_NOT_OWNED':!f.protocolReady?.GiveUpResFieldRequest?'PROTOCOL_UNAVAILABLE':null;
 const beforeState=resourceFieldState(f),expectedState=f.resourceFields?{...beforeState,resourceFields:{maxNum:f.resourceFields.maxNum,fields:f.resourceFields.fields.filter(row=>row.gridIdx!==parameters.resourceFieldGridIdx)}}:null;
 const action=fleetResourceFieldAction(parameters.resourceFieldGridIdx);
 const row=candidate('giveUpField',{gridIdx:parameters.resourceFieldGridIdx},[],'Fixed v76 LandUtil.toGiveUpResField: exact grid only, no payment or reward claim',beforeState,expectedState,action.request,action.response,action.body,parameters,reason);
 row.executable=reason===null;row.budgetClaims={resources:[],quotas:[],uids:context?[{type:'resource-field',id:context.worldId+':'+parameters.resourceFieldGridIdx}]:[]};return row;
}
function verifyResourceField(operation,before,after){
 const no=reason=>({confirmed:false,reason}),owner=fieldOwners.get(before),other=fieldOwners.get(after);
 // Pre-write revision may change because of the write itself; identity and the
 // independently bracketed post-read must remain current.
 if(!owner||owner.client!==other?.client||owner.digest!==fieldDigest(before)||!fieldCurrent(after)||stable(owner.context)!==stable(other.context)||!before.resourceFields||!after.resourceFields)return no('资源田归属、完整前后读或连接身份未确认');
 const canonical=resourceFieldCandidate(before,before.parameters,{enabled:true,giveUpResourceField:true},true);
 if(!before.resourceFields.fields.some(row=>row.gridIdx===operation.target?.gridIdx)||!before.stockReliable||!after.stockReliable||['target','beforeState','expectedState','action','parameters','costs','budgetClaims'].some(k=>stable(operation[k])!==stable(canonical[k])))return no('资源田请求、原目标或预算不一致');
 return verifyFleetResourceFieldOutcome(operation,resourceFieldState(before),resourceFieldState(after));
}
export async function surveyFleet(client, protocol, { config = null, player = null, signal, parameters = {}, moduleConfig = {} } = {}) {
  parameters=parametersOf(parameters); const opts = validateFleetConfig(moduleConfig);
  if(Object.hasOwn(parameters,'resourceFieldGridIdx'))return surveyResourceFields(client,protocol,{config,player,signal,parameters});
  const fieldObservation=opts.giveUpResourceField?await surveyResourceFields(client,protocol,{config,player,signal}):null;
  const names = ['MyFleetsRequest', 'AllItemRequest', 'AllResourceRequest', 'CargoShipsRequest', 'WorldInfoRequest', 'GuildInfoRequest'],sourceAt={},worldQuery=worldObservationQuery(parameters.screenCenter);
  const values = await Promise.all(names.map(async request => { const value=await readNavalFact(client,protocol,request,request==='WorldInfoRequest'?worldQuery:{},{signal});if(value.available)sourceAt[request]=Date.now();return value; }));
  const sources = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  let formationFacts = null;
  if (opts.formation === true) {
    const names = ['OnWaterRequest', 'AllHeroRequest', 'MyFormationPresetRequest'];
    const values = await Promise.all(names.map(request => readNavalFact(client, protocol, request, {}, { signal })));
    names.forEach((name, index) => { sources[name] = values[index]; });
    const {buildingsReliable,buildings}=fleetFormationBuildings(sources.OnWaterRequest);
    const rawHeroes = sources.AllHeroRequest.body?.heroes, rawPresets = sources.MyFormationPresetRequest.body?.ids;
    const heroesReliable = sources.AllHeroRequest.available && Array.isArray(rawHeroes) && rawHeroes.every(row => nonempty(row.heroId)) && new Set(rawHeroes.map(row => row.heroId)).size === rawHeroes.length;
    const presetsReliable = sources.MyFormationPresetRequest.available && Array.isArray(rawPresets) && rawPresets.every(id => Number.isSafeInteger(id) && id > 0);
    const catalog = catalogFrom(config, player);
    formationFacts = { buildingsReliable, buildings, ownedHeroIds: heroesReliable ? rawHeroes.map(row => row.heroId) : null, unlockedPresetIds: [...new Set([1, ...(presetsReliable ? rawPresets : [])])], catalog, heroesReliable, presetsReliable };
  }
  const fleets = fleetFacts(sources.MyFleetsRequest), repairParams = new Map();
  // Same response type: query sequentially, preserving GameClient correlation constraints.
  if (opts.repair === true && opts.repairMode === 'IMMEDIATE') for (const fleet of fleets.fleets) if (fleet.state === 1 && fleet.autoFight?.isOn === false && !fleet.repairing && fleet.maxDura > fleet.durability && fleet.durability !== null) {
    const result = await readNavalFact(client, protocol, 'FleetRepairParamRequest', { buildingId: fleet.buildingId }, { signal });
    const body = result.body;
    if (result.available && Object.hasOwn(body, 'unitRepairCost') && Object.hasOwn(body, 'unitRepairTime') && Number.isFinite(body.unitRepairCost) && body.unitRepairCost > 0 && Number.isFinite(body.unitRepairTime) && body.unitRepairTime > 0) repairParams.set(fleet.buildingId, { unitRepairCost: body.unitRepairCost, unitRepairTime: body.unitRepairTime });
  }
  const ships = sources.CargoShipsRequest.body?.ship;
  const cargoReliable = sources.CargoShipsRequest.available && cargoHeaderReliable(ships);
  const cities = sources.WorldInfoRequest.body?.cities;
  const citiesReliable = sources.WorldInfoRequest.available && Array.isArray(cities) && cities.every(city => Number.isSafeInteger(city.id) && city.id > 0) && new Set(cities.map(city => city.id)).size === cities.length;
  const guildId = quantity(sources.GuildInfoRequest.body?.guild?.guildId), playerGuild = quantity(player?.guildId);
  const guildIdx = sources.GuildInfoRequest.available && guildId > 0 && (playerGuild === null || playerGuild === guildId) ? guildId % 1000 : null;
  return { ...readGameTime(client), config, player: structuredClone(player), parameters: structuredClone(parameters), sources, sourceAt, worldQuery, ...fleets, formationFacts, ...fleetInventory(sources.AllItemRequest, sources.AllResourceRequest), repairParams,
    resourceFields:fieldObservation&&fieldCurrent(fieldObservation)?fieldObservation.resourceFields:null, cargoReliable, ships: cargoReliable ? structuredClone(ships) : [], citiesReliable, cities: citiesReliable ? cities.map(city => ({ id: city.id, state: quantity(city.state), guildIdx: quantity(city.guildIdx) })) : [], guildIdx,
    map: opts.move === true ? loadMapAsset(opts.scenarioId) : null,
    protocolReady: Object.fromEntries(['RepairFleetRequest', 'StopRepairingRequest', 'SetFleetAutoFightRequest', 'FleetSaveFormationRequest', 'MoveFleetsToCityRequest', 'FillCargoShipRequest', 'DrawShipRewardRequest'].map(name => [name, Boolean(protocol?.[name] && (!['FillCargoShipRequest', 'DrawShipRewardRequest'].includes(name) || protocol?.[name.replace('Request', 'Response')]))])),
  };
}
function movementCost(facts, config, city) {
  if (!facts.citiesReliable || quantity(facts.guildIdx) === null || facts.guildIdx <= 0 || quantity(city.guildIdx) === null) return null;
  if (city.guildIdx === facts.guildIdx) return 0;
  const births = rowsOf(config, 'CityCfg').filter(row => row.guildIndex === facts.guildIdx);
  if (births.length !== 1) return null;
  const map = facts.map, from = map?.cityInfo?.[String(births[0].id)], to = map?.cityInfo?.[String(city.id)];
  if (!from || !to || !Number.isSafeInteger(from.gridIdx) || !Number.isSafeInteger(to.gridIdx) || !Number.isSafeInteger(map.width) || map.width <= 0 || !Number.isFinite(map.tileWidth) || map.tileWidth <= 0 || !Number.isFinite(map.tileHeight) || map.tileHeight <= 0) return null;
  const position = index => { const col = index % map.width, row = Math.floor(index / map.width); return { x: row % 2 === 0 ? col * map.tileWidth + map.tileWidth / 2 : (col + 1) * map.tileWidth, y: -(row + 1) * map.tileHeight / 2 - map.tileHeight / 2 }; };
  const a = position(from.gridIdx), b = position(to.gridIdx), distance = Math.hypot(a.x - b.x, a.y - b.y), costs = rowsOf(config, 'AttackCityConsumeCfg');
  if (!costs.length || costs.some(row => !Number.isFinite(row.dist) || row.dist <= 0 || !Number.isFinite(row.cost) || row.cost < 0) || costs.some((row, index) => index > 0 && row.dist < costs[index - 1].dist)) return null;
  let unit = costs[0].cost; for (const row of costs) { if (distance < row.dist) break; unit = row.cost; }
  const cost = Math.ceil(distance * unit); return Number.isSafeInteger(cost) ? cost : null;
}
// One request description for planning and durable receipt validation; no dispatch here.
export function fleetStopAction(kind, buildingId) {
  if (!nonempty(buildingId)) return null;
  if (kind === 'fleetStopRepair') return { request: 'StopRepairingRequest', response: null, body: { buildingId } };
  if (kind === 'fleetStopAutoFight') return { request: 'SetFleetAutoFightRequest', response: null, body: { buildingIds: [buildingId], isOn: false } };
  return null;
}
// Existing lifecycle plans and durable receipt validation share this descriptor.
export function fleetLifecycleAction(kind, target) {
  if(!nonempty(target?.buildingId))return null;
  if(kind==='fleetRepair')return {request:'RepairFleetRequest',response:null,body:{buildingId:target.buildingId}};
  if(kind==='fleetMove')return {request:'MoveFleetsToCityRequest',response:null,body:{buildingId:[target.buildingId],cityId:target.cityId}};
  return null;
}
export function fleetCargoAction(kind, target) {
  if(kind==='cargoFill')return {request:'FillCargoShipRequest',response:'FillCargoShipResponse',body:{shipIndex:target.shipIndex,cargoIndex:[target.cargoIndex]}};
  if(kind==='cargoClaim')return {request:'DrawShipRewardRequest',response:'DrawShipRewardResponse',body:{index:target.shipIndex}};
  return null;
}
export function fleetFormationAction(buildingId, formation) {
  return nonempty(buildingId)?{request:'FleetSaveFormationRequest',response:null,body:{buildingId,formation}}:null;
}
function candidate(kind, target, costs, costSource, beforeState, expectedState, request, response, body, parameters, reason) {
  return { actionId: 'fleet:' + kind + ':' + Object.values(target).map(value => encodeURIComponent(String(value))).join(':'), actionType: kind, target, costs, costSource, beforeState, identity: stable(beforeState), expectedState, parameters, decision: reason ? 'BLOCKED' : 'READY', reason, label: kind === 'fleetMove' ? '移动舰队到城市 ' + target.cityId : kind, action: reason ? null : { request, response, body } };
}
function buildCandidates(facts, { config = facts.config, parameters = facts.parameters ?? {}, moduleConfig = {} } = {}) {
  parametersOf(parameters); const opts = validateFleetConfig(moduleConfig), candidates = [];
  if(Object.hasOwn(parameters,'resourceFieldGridIdx'))return [resourceFieldCandidate(facts,parameters,opts)];
  const inventory = cargoInventory(facts);
  const disabled = feature => opts.enabled !== true || opts[feature] !== true ? 'MODULE_DISABLED' : null;
  for (const fleet of facts.fleets ?? []) {
    if (parameters.buildingId !== undefined && parameters.buildingId !== fleet.buildingId) continue;
    const param = facts.repairParams?.get(fleet.buildingId), gap = fleet.maxDura !== null && fleet.durability !== null ? fleet.maxDura - fleet.durability : null;
    const paramReliable = Number.isFinite(param?.unitRepairCost) && param.unitRepairCost > 0 && Number.isFinite(param?.unitRepairTime) && param.unitRepairTime > 0;
    const cost = gap > 0 && paramReliable ? Math.ceil(gap * param.unitRepairCost) : null;
    let reason = disabled('repair');
    if (!reason && (!facts.fleetReliable || !inventory)) reason = 'FACTS_UNRELIABLE';
    if (!reason && (fleet.state !== 1 || fleet.autoFight?.isOn !== false || fleet.repairing || fleet.treasureLootUid !== 0 || gap === null || gap <= 0)) reason = 'FLEET_UNAVAILABLE';
    if (!reason && (fleet.maxDura <= 0 || fleet.durability / fleet.maxDura >= opts.repairBelowDurabilityRatio)) reason = 'REPAIR_THRESHOLD_NOT_MET';
    if (!reason && opts.repairMode === 'WAIT_NATURAL') reason = 'WAIT_NATURAL_OBSERVATION_ONLY';
    if (!reason && (!Number.isSafeInteger(cost) || cost < 0)) reason = 'REPAIR_COST_UNKNOWN';
    if (!reason && cost > opts.maximumRepairPetrolPerPlan) reason = 'REPAIR_PLAN_BUDGET';
    if (!reason && (quantity(inventory?.get('汽油')) === null || inventory.get('汽油') < cost + opts.petrolReserve)) reason = 'INSUFFICIENT_PETROL';
    const repairAction=fleetLifecycleAction('fleetRepair',{buildingId:fleet.buildingId});
    candidates.push(candidate('fleetRepair', { buildingId: fleet.buildingId }, cost === null ? [] : [{ id: '汽油', num: cost }], paramReliable ? 'FleetRepairParamResponse.unitRepairCost × 缺失耐久，向上取整' : null, { fleet, param: param ?? null }, { maxDura: fleet.maxDura, repairingOrCompleted: true }, repairAction.request, repairAction.response, repairAction.body, { buildingId: fleet.buildingId }, reason || (!facts.protocolReady?.RepairFleetRequest ? 'PROTOCOL_UNAVAILABLE' : null)));
    const stopRepairReason = disabled('stopRepair') || (!facts.fleetReliable || fleet.state !== 4 || !fleet.repairing ? 'FLEET_NOT_REPAIRING' : null) || (quantity(fleet.durability) === null ? 'FLEET_DURABILITY_UNKNOWN' : null) || (!fleet.autoFight || fleet.autoFight.isOn !== false ? 'AUTO_FIGHT_STATE_UNVERIFIED' : null) || (!facts.protocolReady?.StopRepairingRequest ? 'PROTOCOL_UNAVAILABLE' : null);
    const stopRepairAction = fleetStopAction('fleetStopRepair', fleet.buildingId), stopAutoAction = fleetStopAction('fleetStopAutoFight', fleet.buildingId);
    candidates.push(candidate('fleetStopRepair', { buildingId: fleet.buildingId }, [], 'ArmyPop._onBtnCancel: StopRepairingRequest，无购买/加速支付参数', { fleet }, { state: 1, repairing: null }, stopRepairAction.request, stopRepairAction.response, stopRepairAction.body, { buildingId: fleet.buildingId }, stopRepairReason));
    const stopAutoReason = disabled('autoFight') || (!facts.fleetReliable || fleet.autoFight?.isOn !== true ? 'AUTO_FIGHT_NOT_ON' : null) || (!facts.protocolReady?.SetFleetAutoFightRequest ? 'PROTOCOL_UNAVAILABLE' : null);
    candidates.push(candidate('fleetStopAutoFight', { buildingId: fleet.buildingId }, [], 'TroopAppointPop._autoFightRequest(false): 仅关闭委任，无支付', { fleet }, { autoFight: { isOn: false } }, stopAutoAction.request, stopAutoAction.response, stopAutoAction.body, { buildingId: fleet.buildingId }, stopAutoReason));
    if (parameters.buildingId && ['presetId', 'heroIds', 'heroPositions'].some(key => Object.hasOwn(parameters, key))) {
      const params = Object.fromEntries(['presetId', 'heroIds', 'heroPositions'].filter(key => Object.hasOwn(parameters, key)).map(key => [key, parameters[key]]));
      const formation = facts.formationFacts, building = formation?.buildings?.find(row => row.buildingId === fleet.buildingId);
      const occupied = new Set((formation?.buildings ?? []).filter(row => row.buildingId !== fleet.buildingId).flatMap(row => row.formation?.heroPositions.map(position => position.heroId) ?? []));
      let formationReason = disabled('formation') || (!facts.fleetReliable || fleet.state !== 1 || fleet.repairing || fleet.autoFight?.isOn !== false ? 'FLEET_UNAVAILABLE' : null) || (!formation?.buildingsReliable || !building?.formation || !building.level || formation.buildings.some(row => !row.formation) ? 'FLEET_FORMATION_UNRELIABLE' : null) || (!facts.protocolReady?.FleetSaveFormationRequest ? 'PROTOCOL_UNAVAILABLE' : null);
      const mainlineFacts = { formation: building?.formation, ownedHeroIds: formation?.ownedHeroIds?.filter(id => !occupied.has(id)), unlockedPresetIds: formation?.unlockedPresetIds, catalog: formation?.catalog, reliability: { formation: Boolean(building?.formation), presets: formation?.presetsReliable === true, heroes: formation?.heroesReliable === true, config: formation?.catalog?.reliable === true }, writeProtocolAvailable: true, stock: facts.stock, stockReliable: facts.stockReliable };
      const planned = !formationReason ? planFormation(mainlineFacts, { parameters: params, moduleConfig: { enabled: true }, ledger: new ResourceLedger(facts.stock) }) : null;
      const desired = planned?.actions?.[0]?.expectedState;
      if (!formationReason && !desired) formationReason = planned?.notes?.[0] ?? 'FORMATION_INVALID';
      if (!formationReason && desired.petUid !== undefined && String(desired.petUid) !== '0') formationReason = 'FLEET_PET_BINDING_UNVERIFIED';
      const targetFormation = desired ? { heroPositions: desired.heroPositions, presetId: desired.presetId } : null;
      const before = { fleet, building: building ?? null, otherFleets: formation?.buildings?.filter(row => row.buildingId !== fleet.buildingId) ?? [], ownedHeroIds: formation?.ownedHeroIds ?? null, unlockedPresetIds: formation?.unlockedPresetIds ?? null };
      const action=fleetFormationAction(fleet.buildingId,targetFormation);
      candidates.push(candidate('fleetFormation', { buildingId: fleet.buildingId }, [], 'WorldFleetFormationView.saveFormation/onSwitchFormationType：已解锁阵型，无资源支付路径', before, { formation: targetFormation }, action.request, action.response, action.body, { buildingId: fleet.buildingId, ...params }, formationReason));
    }
    if (parameters.cityId !== undefined) {
      const matches = (facts.cities ?? []).filter(city => city.id === parameters.cityId), city = matches.length === 1 ? matches[0] : null, petrol = city ? movementCost(facts, config, city) : null;
      let moveReason = disabled('move');
      if (!moveReason && (!facts.fleetReliable || !facts.citiesReliable || !inventory || !city)) moveReason = 'FACTS_UNRELIABLE';
      if (!moveReason && (fleet.state !== 1 || fleet.autoFight?.isOn !== false || fleet.repairing || fleet.treasureLootUid !== 0 || fleet.durability === null || !fleet.maxDura || fleet.durability / fleet.maxDura < opts.minimumDurabilityRatio || fleet.cityId === city.id)) moveReason = 'FLEET_UNAVAILABLE';
      if (!moveReason && petrol === null) moveReason = 'MOVE_COST_UNKNOWN';
      if (!moveReason && petrol > 0 && (quantity(inventory?.get('汽油')) === null || inventory.get('汽油') < petrol + opts.petrolReserve)) moveReason = 'INSUFFICIENT_PETROL';
      const moveAction=fleetLifecycleAction('fleetMove',{buildingId:fleet.buildingId,cityId:parameters.cityId});
      candidates.push(candidate('fleetMove', { buildingId: fleet.buildingId, cityId: parameters.cityId }, petrol === null || petrol === 0 ? [] : [{ id: '汽油', num: petrol }], petrol === 0 ? 'WorldInfoResponse城市当前归属；客户端同盟城市移动无汽油费' : petrol === null ? null : '出生城→目标城地图距离 × AttackCityConsumeCfg单价，向上取整', { fleet, city, guildIdx: facts.guildIdx, petrol }, { cityId: parameters.cityId, scope: 'MOVEMENT_ONLY' }, moveAction.request, moveAction.response, moveAction.body, { buildingId: fleet.buildingId, cityId: parameters.cityId, ...(parameters.screenCenter===undefined?{}:worldObservationQuery(parameters.screenCenter)) }, moveReason || (!facts.protocolReady?.MoveFleetsToCityRequest ? 'PROTOCOL_UNAVAILABLE' : null)));
    }
  }
  for (const ship of Array.isArray(facts.ships)?facts.ships:[]) {
    if(!ship || typeof ship!=='object')continue;
    if (parameters.shipIndex !== undefined && parameters.shipIndex !== ship.index) continue;
    const parsed=cargoShip(ship),stock=cargoInventory(facts),header=facts.cargoReliable===true&&cargoHeaderReliable(facts.ships);
    const orders=Array.isArray(ship.orderItem)?ship.orderItem:[];
    for(let index=0;index<orders.length;index++) {
      if(parameters.cargoIndex!==undefined&&parameters.cargoIndex!==index+1)continue;
      const asset=ownCargo(orders[index],'asset')?cargoAsset(orders[index].asset):null;
      const costs=asset?[{id:asset.id,num:asset.num}]:[];
      let reason=disabled('cargoFill');
      if(!reason&&['RUBY','钻石'].includes(orders[index]?.asset?.id))reason='PREMIUM_BLOCKED';
      if(!reason&&(!header||!parsed||!stock))reason='CARGO_FACTS_UNRELIABLE';
      if(!reason&&parameters.expectedCargoHash!==undefined&&cargoSnapshotHash(parsed)!==parameters.expectedCargoHash)reason='CARGO_PREPARATION_STATE_CHANGED';
      if(!reason&&(parsed.status!==0||parsed.orderItem[index].filled!==false))reason='CARGO_UNAVAILABLE';
      if(!reason&&(!asset||asset.type!==0))reason='COST_UNKNOWN';
      if(!reason&&cargoStockAmount(stock,asset.id)<asset.num)reason='INSUFFICIENT_CARGO_MATERIALS';
      const action=fleetCargoAction('cargoFill',{shipIndex:ship.index,cargoIndex:index+1});
      candidates.push(candidate('cargoFill',{shipIndex:ship.index,cargoIndex:index+1},costs,'CargoShipsResponse.orderItem.asset；不购买缺失物品',{ship:parsed},parsed?cargoFillExpected(parsed,index):null,action.request,action.response,action.body,{shipIndex:ship.index,cargoIndex:index+1},reason||(!facts.protocolReady?.FillCargoShipRequest?'PROTOCOL_UNAVAILABLE':null)));
    }
    const reason=disabled('cargoClaim')||(!header||!parsed||!stock?'CARGO_FACTS_UNRELIABLE':null)||(parameters.expectedCargoHash!==undefined&&parameters.cargoIndex===undefined&&cargoSnapshotHash(parsed)!==parameters.expectedCargoHash?'CARGO_PREPARATION_STATE_CHANGED':null)||(parsed.status!==2?'CARGO_UNAVAILABLE':null)||(!facts.protocolReady?.DrawShipRewardRequest?'PROTOCOL_UNAVAILABLE':null);
    const action=fleetCargoAction('cargoClaim',{shipIndex:ship.index});
    candidates.push(candidate('cargoClaim',{shipIndex:ship.index},[],'客户端 ARRIVED 分支领取现有奖励，无购买/加速',{ship:parsed},parsed?cargoClaimExpected(parsed):null,action.request,action.response,action.body,{shipIndex:ship.index},reason));
  }
  if(parameters.expectedCargoHash!==undefined&&parameters.cargoIndex===undefined)return candidates.filter(row=>row.actionType==='cargoClaim');
  if(parameters.expectedRepairHash!==undefined)return candidates.filter(row=>row.actionType==='fleetRepair').map(row=>{
    if(repairPreparationHash(row,opts)===parameters.expectedRepairHash)return row;
    return {...row,decision:'BLOCKED',reason:'REPAIR_PREPARATION_STATE_CHANGED',action:null};
  });
  return candidates;
}
export function fleetView(facts, options = {}) { const candidates=buildCandidates(facts,options); return { candidates, repairPreparation:candidates.filter(row=>row.actionType==='fleetRepair').map(row=>({buildingId:row.target.buildingId,expectedRepairHash:repairPreparationHash(row,validateFleetConfig(options.moduleConfig)),costs:structuredClone(row.costs),reason:row.reason,decision:row.decision})), worldScope:{source:'WorldInfoResponse.cities',completeness:'CURRENT_RESPONSE_ONLY',query:facts.worldQuery?structuredClone(facts.worldQuery):null,sourceAt:facts.sourceAt?.WorldInfoRequest??null,status:facts.citiesReliable===true?'OBSERVED':'UNKNOWN'}, resourceFields:facts.resourceFields??null, cargo:cargoShortageView(facts,{...options,candidates}), fleets: facts.fleets ?? [], cities: facts.cities ?? [], citiesReliable: facts.citiesReliable === true, ships: facts.ships ?? [], formations: facts.formationFacts?.buildings ?? [], formationReliability: { fleets: facts.fleetReliable === true, buildings: facts.formationFacts?.buildingsReliable === true, heroes: facts.formationFacts?.heroesReliable === true, presets: facts.formationFacts?.presetsReliable === true, config: facts.formationFacts?.catalog?.reliable === true }, formationCatalog: facts.formationFacts?.catalog ?? null, ownedHeroIds: facts.formationFacts?.ownedHeroIds ?? [], unlockedPresetIds: facts.formationFacts?.unlockedPresetIds ?? [], blocked: [
  { actionType: 'speedUpFleet', code: 'PREMIUM_BLOCKED', reason: '行军加速消耗 RUBY；配置为30/次，不属于免费操作' },
  { actionType: 'speedUpRepair', code: 'PREMIUM_BLOCKED', reason: '维修加速可能消耗RUBY或道具；未授权' },
  { actionType: 'speedUpCargo', code: 'PREMIUM_BLOCKED', reason: '货船加速有独立支付参数，未授权' },
  { actionType: 'fleetFormation', code: 'EXACT_SELECTION_REQUIRED', reason: '需buildingId及明确站位/阵型；复用阵型校验，OnWater复读，不继承主线阵营授权' },
  { actionType: 'autoFight', code: 'AUTOMATION_UNVERIFIED', reason: 'VIP舰队委任会持续派遣，不属于本次单次移动授权' },
] }; }
export function planFleet(facts, options = {}) {
  const opts = validateFleetConfig(options.moduleConfig), candidates = buildCandidates(facts, options);
  const selections = options.selections ?? [];
  if (!Array.isArray(selections)) throw invalid('必须提供明确操作选择');
  const ids = selections.map(selection => { if (typeof selection === 'string') return selection; strictParameters(selection, ['actionId']); if (!nonempty(selection.actionId)) throw invalid('缺少操作ID'); return selection.actionId; });
  if (new Set(ids).size !== ids.length) throw invalid('操作ID不得重复');
  const byId = new Map(candidates.map(row => [row.actionId,row]));
  if (ids.some(id => !byId.has(id))) throw invalid('操作不在当前权威事实中');
  const priority = new Map(opts.repairPriorityBuildingIds.map((id,index) => [id,index]));
  const repairs = ids.filter(id => byId.get(id).actionType === 'fleetRepair').sort((a,b) => (priority.get(byId.get(a).target.buildingId) ?? Number.MAX_SAFE_INTEGER) - (priority.get(byId.get(b).target.buildingId) ?? Number.MAX_SAFE_INTEGER));
  let repairIndex = 0; const ordered = ids.map(id => byId.get(id).actionType === 'fleetRepair' ? repairs[repairIndex++] : id);
  const ledger = options.ledger ?? new ResourceLedger(facts.stockReliable ? facts.stock : null);
  const actions = [], notes = [], used = new Set(), usedCargoShips = new Set(); let repairPetrol = 0;
  for (const id of ordered) {
    const row = byId.get(id), fleetId = row.target?.buildingId, cargoShipIndex = row.target?.shipIndex;
    if (fleetId && used.has(fleetId)) { notes.push('同一批次的舰队已被其他动作预占'); continue; }
    if(cargoShipIndex!==undefined&&usedCargoShips.has(cargoShipIndex)){notes.push('同一货船每批仅一个精确航次动作；后续货格须重新读取并规划授权');continue;}
    const cost = row.actionType === 'fleetRepair' ? row.costs.find(item => item.id === '汽油')?.num ?? 0 : 0;
    if (row.actionType === 'fleetRepair' && cost > opts.maximumRepairPetrolPerPlan - repairPetrol) { notes.push('REPAIR_PLAN_BUDGET'); continue; }
    const chosen = selectedActions(candidates, [id], ledger, opts.petrolReserve); notes.push(...chosen.notes);
    if (!chosen.actions.length) continue;
    actions.push(...chosen.actions); if (fleetId) used.add(fleetId); if(cargoShipIndex!==undefined)usedCargoShips.add(cargoShipIndex); repairPetrol += cost;
  }
  return { actions, notes };
}
export function verifyFleet(operation, beforeFacts, afterFacts, response) {
  const type = operation?.actionType, target = operation?.target;
  if(type==='giveUpField')return verifyResourceField(operation,beforeFacts,afterFacts);
  if (type === 'fleetFormation') {
    const id = target?.buildingId, before = beforeFacts?.formationFacts, after = afterFacts?.formationFacts;
    const old = before?.buildings?.find(row => row.buildingId === id), current = after?.buildings?.find(row => row.buildingId === id);
    const canonical = value => { const parsed = parseFleetFormation(value); if (parsed) parsed.heroPositions.sort((a,b) => a.heroId.localeCompare(b.heroId)); return parsed; };
    const wanted = canonical(operation.expectedState?.formation), observed = canonical(current?.formation);
    const otherFleetsUnchanged = before?.buildings?.filter(row => row.buildingId !== id).every(row => stable(canonical(row.formation)) === stable(canonical(after?.buildings?.find(item => item.buildingId === row.buildingId)?.formation)));
    return { confirmed: before?.buildingsReliable === true && after?.buildingsReliable === true && Boolean(old && current && wanted && observed) && stable(wanted) === stable(observed) && otherFleetsUnchanged, reason: '须OnWater精确buildingId完整阵型/站位匹配，且其他舰队阵容不变；MyFleets权重不等于保存成功' };
  }
  if (['fleetStopRepair', 'fleetStopAutoFight'].includes(type)) {
    const before = beforeFacts?.fleets?.find(fleet => fleet.buildingId === target?.buildingId), after = afterFacts?.fleets?.find(fleet => fleet.buildingId === target?.buildingId);
    if (!beforeFacts?.fleetReliable || !afterFacts?.fleetReliable || !before || !after) return { confirmed: false, reason: 'MyFleets精确舰队复读缺失' };
    const confirmed = type === 'fleetStopRepair' ? before.state === 4 && Boolean(before.repairing) && before.autoFight?.isOn === false && quantity(before.durability) !== null && after.state === 1 && !after.repairing && after.autoFight?.isOn === false && quantity(after.durability) !== null && after.durability >= before.durability : before.autoFight?.isOn === true && after.autoFight?.isOn === false;
    return { confirmed, reason: confirmed ? 'MyFleets精确舰队已确认停止状态' : 'MyFleets未确认停止，保留UNKNOWN' };
  }
  if (['fleetRepair', 'fleetMove'].includes(type)) {
    if (!beforeFacts?.fleetReliable || !afterFacts?.fleetReliable) return { confirmed: false, reason: 'MyFleets权威复读缺失' };
    const before = beforeFacts.fleets.find(fleet => fleet.buildingId === target?.buildingId), after = afterFacts.fleets.find(fleet => fleet.buildingId === target?.buildingId);
    if (!before || !after || before.state !== 1) return { confirmed: false, reason: '精确舰队身份或前置状态不一致' };
    const costs=operation.costs;
    const declaredPetrol=Array.isArray(costs) && (type==='fleetMove' && costs.length===0 || costs.length===1 && costs[0]?.id==='汽油' && Number.isSafeInteger(costs[0].num) && costs[0].num>0);
    if(!declaredPetrol || !cargoInventoryMatches(beforeFacts,afterFacts,costs,[]))return {confirmed:false,reason:'完整库存未确认声明汽油净扣；保留UNKNOWN'};
    if (type === 'fleetRepair') {
      const completed = before.durability !== null && before.maxDura > before.durability && after.durability === before.maxDura;
      const repairing = after.state === 4 && after.repairing?.endDura === before.maxDura && after.repairing.startTs !== null && after.repairing.endTs > after.repairing.startTs && !before.repairing;
      return { confirmed: completed || repairing, reason: completed || repairing ? '精确舰队维修已开始或已完成且声明汽油净扣已确认' : '未证实维修效果；保留UNKNOWN' };
    }
    const moving = after.state === 2 && after.targetCityId === target.cityId && after.moveStartTs !== null && after.moveEndTs > after.moveStartTs;
    const arrived = [1, 3, 5].includes(after.state) && after.cityId === target.cityId && before.cityId !== target.cityId;
    return { confirmed: moving || arrived, reason: moving || arrived ? '精确舰队移动或到达且声明汽油净扣已确认；不代表攻城胜利' : '未证实精确目标移动；保留UNKNOWN' };
  }
  if (!['cargoFill','cargoClaim'].includes(type) || !beforeFacts?.cargoReliable || !afterFacts?.cargoReliable || !cargoHeaderReliable(beforeFacts.ships) || !cargoHeaderReliable(afterFacts.ships)) return {confirmed:false,reason:'CargoShips权威复读缺失'};
  const before=cargoShip(beforeFacts.ships.find(ship=>ship.index===target?.shipIndex)),after=cargoShip(afterFacts.ships.find(ship=>ship.index===target?.shipIndex));
  const unconfirmed=reason=>({confirmed:false,reason});
  if(!before||!after||stable(operation.beforeState)!==stable({ship:before})||operation.identity!==stable({ship:before}))return unconfirmed('精确货船航次或授权前置状态不一致');
  const reward=ownCargo(response,'reward')&&ownCargo(response.reward,'asset')?cargoAssets(response.reward.asset):null;
  if(type==='cargoFill') {
    const index=target.cargoIndex-1,old=before.orderItem[index],current=after.orderItem[index];
    const action=fleetCargoAction('cargoFill',target);
    if(!Number.isSafeInteger(index)||index<0||!old||!current||before.status!==0||old.filled!==false||current.filled!==true||stable(operation.target)!==stable({shipIndex:before.index,cargoIndex:index+1})||stable(operation.action)!==stable(action)||stable(operation.costs)!==stable([{id:old.asset.id,num:old.asset.num}])||stable(operation.expectedState)!==stable(cargoFillExpected(before,index)))return unconfirmed('装货请求、精确货格或原始成本/奖励不一致');
    const topology=before.orderItem.length===after.orderItem.length&&stable(before.reward)===stable(after.reward)&&before.orderItem.every((row,i)=>stable(row.asset)===stable(after.orderItem[i].asset)&&stable(row.reward)===stable(after.orderItem[i].reward)&&(i===index?after.orderItem[i].filled===true:row.filled===after.orderItem[i].filled));
    const completed=after.orderItem.every(row=>row.filled),phase=completed?after.status===1&&after.arriveTime>0:after.status===0&&after.arriveTime===0;
    const confirmed=topology&&phase&&reward!==null&&stable(reward)===stable(old.reward)&&cargoInventoryMatches(beforeFacts,afterFacts,operation.costs,old.reward);
    return {confirmed,reason:confirmed?'原航次精确货格、预定奖励及权威库存净变化一致':'货格/航次、预定奖励或库存净变化未确认；保留UNKNOWN',responseEvidence:{rewardMatched:reward!==null&&stable(reward)===stable(old.reward)}};
  }
  const action=fleetCargoAction('cargoClaim',target),returned=ownCargo(response,'ship')?cargoShip(response.ship):null;
  if(before.status!==2||after.status!==0||after.orderItem.some(row=>row.filled)||stable(operation.target)!==stable({shipIndex:before.index})||stable(operation.action)!==stable(action)||stable(operation.costs)!==stable([])||stable(operation.expectedState)!==stable(cargoClaimExpected(before)))return unconfirmed('到港航次、领奖请求或新采购状态不一致');
  const confirmed=returned!==null&&stable(returned)===stable(after)&&reward!==null&&stable(reward)===stable(before.reward)&&cargoInventoryMatches(beforeFacts,afterFacts,[],before.reward);
  return {confirmed,reason:confirmed?'到港原定奖励、精确新航次及权威库存增量一致':'奖励、返回货船或权威库存未确认；保留UNKNOWN',responseEvidence:{rewardMatched:reward!==null&&stable(reward)===stable(before.reward),shipMatched:returned!==null&&stable(returned)===stable(after)}};

}
// Re-read only the fixed scenario map used by movement cost calculations.
// No map functions or filesystem paths are exported as dependency metadata.
function fleetDependencyVersions({config,moduleConfig={}}={}) {
  const opts=validateFleetConfig(moduleConfig), map=opts.move?loadMapAsset(opts.scenarioId):null;
  const names=['CityCfg','AttackCityConsumeCfg','FormationTypePositionCfg','FormationHeroNumCfg','HeroCfg'];
  return {moduleConfig:opts,config:Object.fromEntries(names.map(name=>[name,structuredClone(config?.tables?.[name]??null)])),mapAsset:map?{scenarioId:map.scenarioId,width:map.width,height:map.height,tileWidth:map.tileWidth??null,tileHeight:map.tileHeight??null,cityInfo:structuredClone(map.cityInfo??null)}:null};
}
export const fleetModule = Object.freeze({ dependencyVersions:fleetDependencyVersions, id: 'fleet', rejectionIdentity: businessRejectionIdentityFromHistory, validateParameters: parametersOf, defaultConfig: FLEET_DEFAULT_CONFIG, validateConfig: validateFleetConfig, survey: surveyFleet, view: fleetView, plan: planFleet, verify: verifyFleet });

/** Bounded historical observations from the original explicit Fleet survey. */
export function fleetCacheOverview(facts,view,{context=null,observedContext=null}={}) {
 const keys=['accountId','generation','connectionId','playerId','worldId'];
 const identity=c=>c&&nonempty(c.accountId)&&Number.isSafeInteger(c.generation)&&c.generation>=0&&nonempty(c.connectionId)&&['playerId','worldId'].every(k=>typeof c[k]==='string'&&/^[1-9][0-9]{0,18}$/.test(c[k])&&BigInt(c[k])<(1n<<63n));
 const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:Number.isSafeInteger(value)&&value>0&&value<=8640000000000000?new Date(value).toISOString():null;
 const section=request=>({request,status:'UNKNOWN',listObserved:false,observedAt:null,rows:[]});
 const result={accountId:context?.accountId??null,context:context?Object.fromEntries(keys.map(k=>[k,context[k]??null])):null,readOnly:true,executable:false,complete:false,coverage:'LATEST_EXPLICIT_SURVEY_ONLY',status:'UNKNOWN',surveyedAt:null,fleets:section('MyFleetsRequest'),world:{...section('WorldInfoRequest'),coverage:'CURRENT_RESPONSE_ONLY',query:null,mapComplete:false},note:'仅最近显式舰队调查的历史观察；海面仅本次响应范围，不表示完整地图、实时位置或移动/攻击资格。请在原舰队页重新调查并单独授权。'};
 if(!identity(context)||!identity(observedContext)||!keys.every(k=>context[k]===observedContext[k])||!facts||!view)return result;
 result.surveyedAt=stamp(view.surveyedAt);
 if(facts.fleetReliable===true&&facts.sources?.MyFleetsRequest?.available===true&&Array.isArray(facts.fleets)&&stamp(facts.sourceAt?.MyFleetsRequest)){
  result.fleets={...result.fleets,status:'OBSERVED',listObserved:true,observedAt:stamp(facts.sourceAt.MyFleetsRequest),rows:facts.fleets.map(row=>({buildingId:nonempty(row.buildingId)?row.buildingId:null,state:quantity(row.state),cityId:quantity(row.cityId),targetCityId:quantity(row.targetCityId),durability:quantity(row.durability),maxDura:quantity(row.maxDura),moveEndTs:quantity(row.moveEndTs)}))};
 }
 const center=facts.worldQuery?.screenCenter;
 if(facts.citiesReliable===true&&facts.sources?.WorldInfoRequest?.available===true&&Array.isArray(facts.cities)&&stamp(facts.sourceAt?.WorldInfoRequest)&&Number.isFinite(center?.x)&&Number.isFinite(center?.y)){
  result.world={...result.world,status:'OBSERVED',listObserved:true,observedAt:stamp(facts.sourceAt.WorldInfoRequest),query:{screenCenter:{x:center.x,y:center.y}},rows:facts.cities.map(row=>({id:quantity(row.id),state:quantity(row.state),guildIdx:quantity(row.guildIdx)}))};
 }
 const observed=[result.fleets,result.world].filter(row=>row.listObserved).length;result.status=observed===2?'OBSERVED':observed===1?'PARTIAL':'UNKNOWN';return result;
}
