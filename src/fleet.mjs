import { businessRejectionIdentityFromHistory } from './business-functions.mjs';
// Fleet/cargo adapters. Existing GameClient, Session and shared executor own execution.
import { ResourceLedger, RESOURCE_NAMES } from './resource-ledger.mjs';
import { loadMapAsset } from './world.mjs';
import { parseFormation, validateFormationParameters, planFormation, catalogFrom } from './formation.mjs';
import { strictParameters, invalid, readNavalFact, stockFacts, fleetFacts, rowsOf, quantity, nonempty, stable, selectedActions, moduleConfiguration } from './naval-facts.mjs';
import { readGameTime } from './state-facts.mjs';

export const FLEET_DEFAULT_CONFIG = Object.freeze({ enabled: false, repair: false, repairBelowDurabilityRatio: 0.8, repairMode: 'IMMEDIATE', maximumRepairPetrolPerPlan: 0, repairPriorityBuildingIds: [], stopRepair: false, move: false, cargoFill: false, cargoClaim: false, formation: false, autoFight: false, speedUp: false, minimumDurabilityRatio: 0.8, petrolReserve: 0, scenarioId: 1 });
function parametersOf(parameters = {}) {
  strictParameters(parameters, ['buildingId', 'cityId', 'shipIndex', 'cargoIndex', 'presetId', 'heroIds', 'heroPositions']);
  if (parameters.buildingId !== undefined && !nonempty(parameters.buildingId)) throw invalid('舰队 ID 无效');
  for (const key of ['cityId', 'shipIndex', 'cargoIndex']) if (parameters[key] !== undefined && (!Number.isSafeInteger(parameters[key]) || parameters[key] <= 0 || parameters[key] > 2147483647)) throw invalid('目标编号必须是明确的正 int32');
  const formation = Object.fromEntries(['presetId', 'heroIds', 'heroPositions'].filter(key => Object.hasOwn(parameters, key)).map(key => [key, parameters[key]]));
  if (Object.keys(formation).length) { if (!nonempty(parameters.buildingId)) throw invalid('舰队阵容必须绑定明确 buildingId'); validateFormationParameters(formation); }
  return parameters;
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
function cargoInventory(facts) {
  if(facts?.stockReliable!==true)return null;
  const sources=facts?.sources;
  if(!sources) {
    if(facts?.stockReliable!==true || !(facts.stock instanceof Map) || [...facts.stock].some(([id,num])=>!nonempty(id)||quantity(num)===null))return null;
    return new Map([...facts.stock].map(([id,num])=>[id,quantity(num)]));
  }
  const items=sources.AllItemRequest,resources=sources.AllResourceRequest;
  if(items?.available!==true || resources?.available!==true || !ownCargo(items.body,'items') || !ownCargo(resources.body,'list') || !denseCargoArray(items.body.items) || !denseCargoArray(resources.body.list))return null;
  const stock=new Map();
  for(const row of items.body.items) {
    const id=ownCargo(row,'itemId')?row.itemId:ownCargo(row,'id')?row.id:null;
    const num=ownCargo(row,'num')?quantity(row.num):ownCargo(row,'count')?quantity(row.count):null;
    if(!nonempty(id)||id!==id.trim()||num===null||stock.has(id)||(ownCargo(row,'itemId')&&ownCargo(row,'id')&&row.itemId!==row.id))return null;
    stock.set(id,num);
  }
  const seen=new Set();
  for(const row of resources.body.list) {
    if(!ownCargo(row,'res')||!ownCargo(row,'amount')||!Number.isSafeInteger(row.res)||row.res<=0||seen.has(row.res))return null;
    const id=RESOURCE_NAMES[row.res]??String(row.res),num=quantity(row.amount);
    if(num===null||stock.has(id))return null;
    seen.add(row.res);stock.set(id,num);
  }
  return stock;
}
function cargoStockAmount(stock,id) {return stock instanceof Map?quantity(stock.has(id)?stock.get(id):0):null;}
function cargoInventoryMatches(beforeFacts,afterFacts,costs,rewards) {
  const before=cargoInventory(beforeFacts),after=cargoInventory(afterFacts);if(!before||!after)return false;
  const delta=new Map();
  for(const {id,num} of costs)delta.set(id,(delta.get(id)??0)-num);
  for(const {id,num} of rewards)delta.set(id,(delta.get(id)??0)+num);
  return [...new Set([...before.keys(),...after.keys(),...delta.keys()])].every(id=>{
    const old=cargoStockAmount(before,id),current=cargoStockAmount(after,id),expected=old+(delta.get(id)??0);
    return old!==null&&current!==null&&Number.isSafeInteger(expected)&&expected>=0&&current===expected;
  });
}
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
    ships.push({shipIndex:raw.index,status:ownCargo(raw,'status')&&[0,1,2].includes(raw.status)?raw.status:null,statusText:ownCargo(raw,'status')?cargoStatusText[raw.status]??'未知':'未知',arriveTime:ownCargo(raw,'arriveTime')&&quantity(raw.arriveTime)!==null?quantity(raw.arriveTime):null,voyageIdentity:parsed?stable(parsed):null,reliable:Boolean(parsed),reason:parsed?null:'CARGO_SHIP_UNRELIABLE',claimActionId:claim?.actionId??null,claimReason:claim?.reason??null,reward:parsed?.reward??null,slots});
  }
  const shortages=[...totals.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(row=>{const have=cargoStockAmount(stock,row.id),reliable=row.required!==null&&have!==null;return {...row,have,missing:reliable?Math.max(0,row.required-have):null,reliable};});
  if(!stock)notes.push('CARGO_INVENTORY_UNRELIABLE');
  return {reliable:header&&ships.every(ship=>ship.reliable),inventoryReliable:Boolean(stock),source:'CargoShipsResponse',ships,shortages,notes};
}

function parseFleetFormation(value) { const formation = parseFormation(value); if (formation && String(formation.petUid) === '0') delete formation.petUid; return formation; }
export function validateFleetConfig(value = {}) { const result = moduleConfiguration(value, FLEET_DEFAULT_CONFIG); if (!Number.isFinite(result.minimumDurabilityRatio) || result.minimumDurabilityRatio <= 0 || result.minimumDurabilityRatio > 1 || quantity(result.petrolReserve) === null || !Number.isSafeInteger(result.scenarioId) || result.scenarioId < 1) throw invalid('舰队规则无效'); if (!Number.isFinite(result.repairBelowDurabilityRatio) || result.repairBelowDurabilityRatio <= 0 || result.repairBelowDurabilityRatio > 1 || !['IMMEDIATE','WAIT_NATURAL'].includes(result.repairMode) || !Number.isSafeInteger(result.maximumRepairPetrolPerPlan) || result.maximumRepairPetrolPerPlan < 0 || result.maximumRepairPetrolPerPlan > 1e9 || result.repairPriorityBuildingIds.some(id => !nonempty(id) || id.trim() !== id || id.length > 300) || new Set(result.repairPriorityBuildingIds).size !== result.repairPriorityBuildingIds.length) throw invalid('维修阈值、模式、计划预算或优先级无效'); return result; }
export async function surveyFleet(client, protocol, { config = null, player = null, signal, parameters = {}, moduleConfig = {} } = {}) {
  parametersOf(parameters); const opts = validateFleetConfig(moduleConfig);
  const names = ['MyFleetsRequest', 'AllItemRequest', 'AllResourceRequest', 'CargoShipsRequest', 'WorldInfoRequest', 'GuildInfoRequest'];
  const values = await Promise.all(names.map(request => readNavalFact(client, protocol, request, request === 'WorldInfoRequest' ? { screenCenter: { x: 0, y: 0 } } : {}, { signal })));
  const sources = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  let formationFacts = null;
  if (opts.formation === true) {
    const names = ['OnWaterRequest', 'AllHeroRequest', 'MyFormationPresetRequest'];
    const values = await Promise.all(names.map(request => readNavalFact(client, protocol, request, {}, { signal })));
    names.forEach((name, index) => { sources[name] = values[index]; });
    const rawBuildings = sources.OnWaterRequest.body?.building;
    const buildingsReliable = sources.OnWaterRequest.available && Array.isArray(rawBuildings) && rawBuildings.every(row => nonempty(row.buildingId)) && new Set(rawBuildings.map(row => row.buildingId)).size === rawBuildings.length;
    const buildings = buildingsReliable ? rawBuildings.filter(row => row.fleet).map(row => ({ buildingId: row.buildingId, level: quantity(row.level), formation: parseFleetFormation(row.fleet.formation) })) : [];
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
  return { ...readGameTime(client), config, player: structuredClone(player), parameters: structuredClone(parameters), sources, ...fleets, formationFacts, ...stockFacts(sources.AllItemRequest, sources.AllResourceRequest), repairParams,
    cargoReliable, ships: cargoReliable ? structuredClone(ships) : [], citiesReliable, cities: citiesReliable ? cities.map(city => ({ id: city.id, state: quantity(city.state), guildIdx: quantity(city.guildIdx) })) : [], guildIdx,
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
function candidate(kind, target, costs, costSource, beforeState, expectedState, request, response, body, parameters, reason) {
  return { actionId: 'fleet:' + kind + ':' + Object.values(target).map(value => encodeURIComponent(String(value))).join(':'), actionType: kind, target, costs, costSource, beforeState, identity: stable(beforeState), expectedState, parameters, decision: reason ? 'BLOCKED' : 'READY', reason, label: kind === 'fleetMove' ? '移动舰队到城市 ' + target.cityId : kind, action: reason ? null : { request, response, body } };
}
function buildCandidates(facts, { config = facts.config, parameters = facts.parameters ?? {}, moduleConfig = {} } = {}) {
  parametersOf(parameters); const opts = validateFleetConfig(moduleConfig), candidates = [];
  const disabled = feature => opts.enabled !== true || opts[feature] !== true ? 'MODULE_DISABLED' : null;
  for (const fleet of facts.fleets ?? []) {
    if (parameters.buildingId !== undefined && parameters.buildingId !== fleet.buildingId) continue;
    const param = facts.repairParams?.get(fleet.buildingId), gap = fleet.maxDura !== null && fleet.durability !== null ? fleet.maxDura - fleet.durability : null;
    const paramReliable = Number.isFinite(param?.unitRepairCost) && param.unitRepairCost > 0 && Number.isFinite(param?.unitRepairTime) && param.unitRepairTime > 0;
    const cost = gap > 0 && paramReliable ? Math.ceil(gap * param.unitRepairCost) : null;
    let reason = disabled('repair');
    if (!reason && (!facts.fleetReliable || !facts.stockReliable)) reason = 'FACTS_UNRELIABLE';
    if (!reason && (fleet.state !== 1 || fleet.autoFight?.isOn !== false || fleet.repairing || fleet.treasureLootUid !== 0 || gap === null || gap <= 0)) reason = 'FLEET_UNAVAILABLE';
    if (!reason && (fleet.maxDura <= 0 || fleet.durability / fleet.maxDura >= opts.repairBelowDurabilityRatio)) reason = 'REPAIR_THRESHOLD_NOT_MET';
    if (!reason && opts.repairMode === 'WAIT_NATURAL') reason = 'WAIT_NATURAL_OBSERVATION_ONLY';
    if (!reason && (!Number.isSafeInteger(cost) || cost < 0)) reason = 'REPAIR_COST_UNKNOWN';
    if (!reason && cost > opts.maximumRepairPetrolPerPlan) reason = 'REPAIR_PLAN_BUDGET';
    if (!reason && (quantity(facts.stock?.get('汽油')) === null || facts.stock.get('汽油') < cost + opts.petrolReserve)) reason = 'INSUFFICIENT_PETROL';
    candidates.push(candidate('fleetRepair', { buildingId: fleet.buildingId }, cost === null ? [] : [{ id: '汽油', num: cost }], paramReliable ? 'FleetRepairParamResponse.unitRepairCost × 缺失耐久，向上取整' : null, { fleet, param: param ?? null }, { maxDura: fleet.maxDura, repairingOrCompleted: true }, 'RepairFleetRequest', null, { buildingId: fleet.buildingId }, { buildingId: fleet.buildingId }, reason || (!facts.protocolReady?.RepairFleetRequest ? 'PROTOCOL_UNAVAILABLE' : null)));
    const stopRepairReason = disabled('stopRepair') || (!facts.fleetReliable || fleet.state !== 4 || !fleet.repairing ? 'FLEET_NOT_REPAIRING' : null) || (!fleet.autoFight || fleet.autoFight.isOn !== false ? 'AUTO_FIGHT_STATE_UNVERIFIED' : null) || (!facts.protocolReady?.StopRepairingRequest ? 'PROTOCOL_UNAVAILABLE' : null);
    candidates.push(candidate('fleetStopRepair', { buildingId: fleet.buildingId }, [], 'ArmyPop._onBtnCancel: StopRepairingRequest，无购买/加速支付参数', { fleet }, { state: 1, repairing: null }, 'StopRepairingRequest', null, { buildingId: fleet.buildingId }, { buildingId: fleet.buildingId }, stopRepairReason));
    const stopAutoReason = disabled('autoFight') || (!facts.fleetReliable || fleet.autoFight?.isOn !== true ? 'AUTO_FIGHT_NOT_ON' : null) || (!facts.protocolReady?.SetFleetAutoFightRequest ? 'PROTOCOL_UNAVAILABLE' : null);
    candidates.push(candidate('fleetStopAutoFight', { buildingId: fleet.buildingId }, [], 'TroopAppointPop._autoFightRequest(false): 仅关闭委任，无支付', { fleet }, { autoFight: { isOn: false } }, 'SetFleetAutoFightRequest', null, { buildingIds: [fleet.buildingId], isOn: false }, { buildingId: fleet.buildingId }, stopAutoReason));
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
      candidates.push(candidate('fleetFormation', { buildingId: fleet.buildingId }, [], 'WorldFleetFormationView.saveFormation/onSwitchFormationType：已解锁阵型，无资源支付路径', before, { formation: targetFormation }, 'FleetSaveFormationRequest', null, { buildingId: fleet.buildingId, formation: targetFormation }, { buildingId: fleet.buildingId, ...params }, formationReason));
    }
    if (parameters.cityId !== undefined) {
      const matches = (facts.cities ?? []).filter(city => city.id === parameters.cityId), city = matches.length === 1 ? matches[0] : null, petrol = city ? movementCost(facts, config, city) : null;
      let moveReason = disabled('move');
      if (!moveReason && (!facts.fleetReliable || !facts.citiesReliable || !facts.stockReliable || !city)) moveReason = 'FACTS_UNRELIABLE';
      if (!moveReason && (fleet.state !== 1 || fleet.autoFight?.isOn !== false || fleet.repairing || fleet.treasureLootUid !== 0 || fleet.durability === null || !fleet.maxDura || fleet.durability / fleet.maxDura < opts.minimumDurabilityRatio || fleet.cityId === city.id)) moveReason = 'FLEET_UNAVAILABLE';
      if (!moveReason && petrol === null) moveReason = 'MOVE_COST_UNKNOWN';
      if (!moveReason && petrol > 0 && (quantity(facts.stock?.get('汽油')) === null || facts.stock.get('汽油') < petrol + opts.petrolReserve)) moveReason = 'INSUFFICIENT_PETROL';
      candidates.push(candidate('fleetMove', { buildingId: fleet.buildingId, cityId: parameters.cityId }, petrol === null || petrol === 0 ? [] : [{ id: '汽油', num: petrol }], petrol === 0 ? 'WorldInfoResponse城市当前归属；客户端同盟城市移动无汽油费' : petrol === null ? null : '出生城→目标城地图距离 × AttackCityConsumeCfg单价，向上取整', { fleet, city, guildIdx: facts.guildIdx, petrol }, { cityId: parameters.cityId, scope: 'MOVEMENT_ONLY' }, 'MoveFleetsToCityRequest', null, { buildingId: [fleet.buildingId], cityId: parameters.cityId }, { buildingId: fleet.buildingId, cityId: parameters.cityId }, moveReason || (!facts.protocolReady?.MoveFleetsToCityRequest ? 'PROTOCOL_UNAVAILABLE' : null)));
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
      if(!reason&&(parsed.status!==0||parsed.orderItem[index].filled!==false))reason='CARGO_UNAVAILABLE';
      if(!reason&&(!asset||asset.type!==0))reason='COST_UNKNOWN';
      if(!reason&&cargoStockAmount(stock,asset.id)<asset.num)reason='INSUFFICIENT_CARGO_MATERIALS';
      candidates.push(candidate('cargoFill',{shipIndex:ship.index,cargoIndex:index+1},costs,'CargoShipsResponse.orderItem.asset；不购买缺失物品',{ship:parsed},parsed?cargoFillExpected(parsed,index):null,'FillCargoShipRequest','FillCargoShipResponse',{shipIndex:ship.index,cargoIndex:[index+1]},{shipIndex:ship.index,cargoIndex:index+1},reason||(!facts.protocolReady?.FillCargoShipRequest?'PROTOCOL_UNAVAILABLE':null)));
    }
    const reason=disabled('cargoClaim')||(!header||!parsed||!stock?'CARGO_FACTS_UNRELIABLE':null)||(parsed.status!==2?'CARGO_UNAVAILABLE':null)||(!facts.protocolReady?.DrawShipRewardRequest?'PROTOCOL_UNAVAILABLE':null);
    candidates.push(candidate('cargoClaim',{shipIndex:ship.index},[],'客户端 ARRIVED 分支领取现有奖励，无购买/加速',{ship:parsed},parsed?cargoClaimExpected(parsed):null,'DrawShipRewardRequest','DrawShipRewardResponse',{index:ship.index},{shipIndex:ship.index},reason));
  }
  return candidates;
}
export function fleetView(facts, options = {}) { const candidates=buildCandidates(facts,options); return { candidates, cargo:cargoShortageView(facts,{...options,candidates}), fleets: facts.fleets ?? [], ships: facts.ships ?? [], formations: facts.formationFacts?.buildings ?? [], formationReliability: { fleets: facts.fleetReliable === true, buildings: facts.formationFacts?.buildingsReliable === true, heroes: facts.formationFacts?.heroesReliable === true, presets: facts.formationFacts?.presetsReliable === true, config: facts.formationFacts?.catalog?.reliable === true }, formationCatalog: facts.formationFacts?.catalog ?? null, ownedHeroIds: facts.formationFacts?.ownedHeroIds ?? [], unlockedPresetIds: facts.formationFacts?.unlockedPresetIds ?? [], blocked: [
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
    const confirmed = type === 'fleetStopRepair' ? before.state === 4 && Boolean(before.repairing) && before.autoFight?.isOn === false && after.state === 1 && !after.repairing && after.autoFight?.isOn === false && after.durability !== null && after.durability >= before.durability : before.autoFight?.isOn === true && after.autoFight?.isOn === false;
    return { confirmed, reason: confirmed ? 'MyFleets精确舰队已确认停止状态' : 'MyFleets未确认停止，保留UNKNOWN' };
  }
  if (['fleetRepair', 'fleetMove'].includes(type)) {
    if (!beforeFacts?.fleetReliable || !afterFacts?.fleetReliable) return { confirmed: false, reason: 'MyFleets权威复读缺失' };
    const before = beforeFacts.fleets.find(fleet => fleet.buildingId === target?.buildingId), after = afterFacts.fleets.find(fleet => fleet.buildingId === target?.buildingId);
    if (!before || !after || before.state !== 1) return { confirmed: false, reason: '精确舰队身份或前置状态不一致' };
    if (type === 'fleetRepair') {
      const completed = before.durability !== null && before.maxDura > before.durability && after.durability === before.maxDura;
      const repairing = after.state === 4 && after.repairing?.endDura === before.maxDura && after.repairing.startTs !== null && after.repairing.endTs > after.repairing.startTs && !before.repairing;
      return { confirmed: completed || repairing, reason: completed || repairing ? '精确舰队维修已开始或已完成' : '未证实维修效果；保留UNKNOWN' };
    }
    const moving = after.state === 2 && after.targetCityId === target.cityId && after.moveStartTs !== null && after.moveEndTs > after.moveStartTs;
    const arrived = [1, 3, 5].includes(after.state) && after.cityId === target.cityId && before.cityId !== target.cityId;
    return { confirmed: moving || arrived, reason: moving || arrived ? '仅证实精确舰队移动或到达；不代表攻城胜利' : '未证实精确目标移动；保留UNKNOWN' };
  }
  if (!['cargoFill','cargoClaim'].includes(type) || !beforeFacts?.cargoReliable || !afterFacts?.cargoReliable || !cargoHeaderReliable(beforeFacts.ships) || !cargoHeaderReliable(afterFacts.ships)) return {confirmed:false,reason:'CargoShips权威复读缺失'};
  const before=cargoShip(beforeFacts.ships.find(ship=>ship.index===target?.shipIndex)),after=cargoShip(afterFacts.ships.find(ship=>ship.index===target?.shipIndex));
  const unconfirmed=reason=>({confirmed:false,reason});
  if(!before||!after||stable(operation.beforeState)!==stable({ship:before})||operation.identity!==stable({ship:before}))return unconfirmed('精确货船航次或授权前置状态不一致');
  const reward=ownCargo(response,'reward')&&ownCargo(response.reward,'asset')?cargoAssets(response.reward.asset):null;
  if(type==='cargoFill') {
    const index=target.cargoIndex-1,old=before.orderItem[index],current=after.orderItem[index];
    const action={request:'FillCargoShipRequest',response:'FillCargoShipResponse',body:{shipIndex:target.shipIndex,cargoIndex:[target.cargoIndex]}};
    if(!Number.isSafeInteger(index)||index<0||!old||!current||before.status!==0||old.filled!==false||current.filled!==true||stable(operation.target)!==stable({shipIndex:before.index,cargoIndex:index+1})||stable(operation.action)!==stable(action)||stable(operation.costs)!==stable([{id:old.asset.id,num:old.asset.num}])||stable(operation.expectedState)!==stable(cargoFillExpected(before,index)))return unconfirmed('装货请求、精确货格或原始成本/奖励不一致');
    const topology=before.orderItem.length===after.orderItem.length&&stable(before.reward)===stable(after.reward)&&before.orderItem.every((row,i)=>stable(row.asset)===stable(after.orderItem[i].asset)&&stable(row.reward)===stable(after.orderItem[i].reward)&&(i===index?after.orderItem[i].filled===true:row.filled===after.orderItem[i].filled));
    const completed=after.orderItem.every(row=>row.filled),phase=completed?after.status===1&&after.arriveTime>0:after.status===0&&after.arriveTime===0;
    const confirmed=topology&&phase&&reward!==null&&stable(reward)===stable(old.reward)&&cargoInventoryMatches(beforeFacts,afterFacts,operation.costs,old.reward);
    return {confirmed,reason:confirmed?'原航次精确货格、预定奖励及权威库存净变化一致':'货格/航次、预定奖励或库存净变化未确认；保留UNKNOWN',responseEvidence:{rewardMatched:reward!==null&&stable(reward)===stable(old.reward)}};
  }
  const action={request:'DrawShipRewardRequest',response:'DrawShipRewardResponse',body:{index:target.shipIndex}},returned=ownCargo(response,'ship')?cargoShip(response.ship):null;
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
