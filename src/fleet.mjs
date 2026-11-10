// Fleet/cargo adapters. Existing GameClient, Session and shared executor own execution.
import { ResourceLedger, resourceCosts } from './resource-ledger.mjs';
import { loadMapAsset } from './world.mjs';
import { parseFormation, validateFormationParameters, planFormation, catalogFrom } from './formation.mjs';
import { strictParameters, invalid, readNavalFact, stockFacts, fleetFacts, rowsOf, quantity, nonempty, stable, selectedActions, moduleConfiguration } from './naval-facts.mjs';

export const FLEET_DEFAULT_CONFIG = Object.freeze({ enabled: false, repair: false, stopRepair: false, move: false, cargoFill: false, cargoClaim: false, formation: false, autoFight: false, speedUp: false, minimumDurabilityRatio: 0.8, petrolReserve: 0, scenarioId: 1 });
function parametersOf(parameters = {}) {
  strictParameters(parameters, ['buildingId', 'cityId', 'shipIndex', 'cargoIndex', 'presetId', 'heroIds', 'heroPositions']);
  if (parameters.buildingId !== undefined && !nonempty(parameters.buildingId)) throw invalid('舰队 ID 无效');
  for (const key of ['cityId', 'shipIndex', 'cargoIndex']) if (parameters[key] !== undefined && (!Number.isSafeInteger(parameters[key]) || parameters[key] <= 0 || parameters[key] > 2147483647)) throw invalid('目标编号必须是明确的正 int32');
  const formation = Object.fromEntries(['presetId', 'heroIds', 'heroPositions'].filter(key => Object.hasOwn(parameters, key)).map(key => [key, parameters[key]]));
  if (Object.keys(formation).length) { if (!nonempty(parameters.buildingId)) throw invalid('舰队阵容必须绑定明确 buildingId'); validateFormationParameters(formation); }
  return parameters;
}
function parseFleetFormation(value) { const formation = parseFormation(value); if (formation && String(formation.petUid) === '0') delete formation.petUid; return formation; }
export function validateFleetConfig(value = {}) { const result = moduleConfiguration(value, FLEET_DEFAULT_CONFIG); if (!Number.isFinite(result.minimumDurabilityRatio) || result.minimumDurabilityRatio <= 0 || result.minimumDurabilityRatio > 1 || quantity(result.petrolReserve) === null || !Number.isSafeInteger(result.scenarioId) || result.scenarioId < 1) throw invalid('舰队规则无效'); return result; }
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
  if (opts.repair === true) for (const fleet of fleets.fleets) if (fleet.state === 1 && !fleet.repairing && fleet.maxDura > fleet.durability && fleet.durability !== null) {
    const result = await readNavalFact(client, protocol, 'FleetRepairParamRequest', { buildingId: fleet.buildingId }, { signal });
    const body = result.body;
    if (result.available && Object.hasOwn(body, 'unitRepairCost') && Object.hasOwn(body, 'unitRepairTime') && Number.isFinite(body.unitRepairCost) && body.unitRepairCost > 0 && Number.isFinite(body.unitRepairTime) && body.unitRepairTime > 0) repairParams.set(fleet.buildingId, { unitRepairCost: body.unitRepairCost, unitRepairTime: body.unitRepairTime });
  }
  const ships = sources.CargoShipsRequest.body?.ship;
  const cargoReliable = sources.CargoShipsRequest.available && Array.isArray(ships) && ships.every(ship => Number.isSafeInteger(ship.index) && ship.index > 0) && new Set(ships.map(ship => ship.index)).size === ships.length;
  const cities = sources.WorldInfoRequest.body?.cities;
  const citiesReliable = sources.WorldInfoRequest.available && Array.isArray(cities) && cities.every(city => Number.isSafeInteger(city.id) && city.id > 0) && new Set(cities.map(city => city.id)).size === cities.length;
  const guildId = quantity(sources.GuildInfoRequest.body?.guild?.guildId), playerGuild = quantity(player?.guildId);
  const guildIdx = sources.GuildInfoRequest.available && guildId > 0 && (playerGuild === null || playerGuild === guildId) ? guildId % 1000 : null;
  return { now: Math.floor(Date.now() / 1000), config, player: structuredClone(player), parameters: structuredClone(parameters), sources, ...fleets, formationFacts, ...stockFacts(sources.AllItemRequest, sources.AllResourceRequest), repairParams,
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
    if (!reason && (fleet.state !== 1 || fleet.repairing || fleet.treasureLootUid !== 0 || gap === null || gap <= 0)) reason = 'FLEET_UNAVAILABLE';
    if (!reason && (!Number.isSafeInteger(cost) || cost < 0)) reason = 'REPAIR_COST_UNKNOWN';
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
      if (!moveReason && (fleet.state !== 1 || fleet.repairing || fleet.treasureLootUid !== 0 || fleet.durability === null || !fleet.maxDura || fleet.durability / fleet.maxDura < opts.minimumDurabilityRatio || fleet.cityId === city.id)) moveReason = 'FLEET_UNAVAILABLE';
      if (!moveReason && petrol === null) moveReason = 'MOVE_COST_UNKNOWN';
      if (!moveReason && petrol > 0 && (quantity(facts.stock?.get('汽油')) === null || facts.stock.get('汽油') < petrol + opts.petrolReserve)) moveReason = 'INSUFFICIENT_PETROL';
      candidates.push(candidate('fleetMove', { buildingId: fleet.buildingId, cityId: parameters.cityId }, petrol === null || petrol === 0 ? [] : [{ id: '汽油', num: petrol }], petrol === 0 ? 'WorldInfoResponse城市当前归属；客户端同盟城市移动无汽油费' : petrol === null ? null : '出生城→目标城地图距离 × AttackCityConsumeCfg单价，向上取整', { fleet, city, guildIdx: facts.guildIdx, petrol }, { cityId: parameters.cityId, scope: 'MOVEMENT_ONLY' }, 'MoveFleetsToCityRequest', null, { buildingId: [fleet.buildingId], cityId: parameters.cityId }, { buildingId: fleet.buildingId, cityId: parameters.cityId }, moveReason || (!facts.protocolReady?.MoveFleetsToCityRequest ? 'PROTOCOL_UNAVAILABLE' : null)));
    }
  }
  for (const ship of facts.ships ?? []) {
    if (parameters.shipIndex !== undefined && parameters.shipIndex !== ship.index) continue;
    const orders = Array.isArray(ship.orderItem) ? ship.orderItem : [];
    for (let index = 0; index < orders.length; index++) {
      if (parameters.cargoIndex !== undefined && parameters.cargoIndex !== index + 1) continue;
      const order = orders[index]; let costs = null; try { costs = resourceCosts([{ id: order.asset?.id, num: order.asset?.num }]); } catch {}
      let reason = disabled('cargoFill');
      if (!reason && (!facts.cargoReliable || !facts.stockReliable || ship.status !== 0 || order.filled !== false)) reason = 'CARGO_UNAVAILABLE';
      if (!reason && (!costs || !costs.length)) reason = 'COST_UNKNOWN';
      if (!reason && costs.some(cost => ['RUBY', '钻石'].includes(cost.id))) reason = 'PREMIUM_BLOCKED';
      candidates.push(candidate('cargoFill', { shipIndex: ship.index, cargoIndex: index + 1 }, costs ?? [], 'CargoShipsResponse.orderItem.asset；不购买缺失物品', { shipIndex: ship.index, status: ship.status, order }, { filled: true }, 'FillCargoShipRequest', 'FillCargoShipResponse', { shipIndex: ship.index, cargoIndex: [index + 1] }, { shipIndex: ship.index, cargoIndex: index + 1 }, reason || (!facts.protocolReady?.FillCargoShipRequest ? 'PROTOCOL_UNAVAILABLE' : null)));
    }
    const reason = disabled('cargoClaim') || (!facts.cargoReliable || ship.status !== 2 ? 'CARGO_UNAVAILABLE' : null) || (!facts.protocolReady?.DrawShipRewardRequest ? 'PROTOCOL_UNAVAILABLE' : null);
    candidates.push(candidate('cargoClaim', { shipIndex: ship.index }, [], '客户端 ARRIVED 分支领取现有奖励，无购买/加速', { shipIndex: ship.index, status: ship.status, orderItem: orders }, { oldArrivalConsumed: true }, 'DrawShipRewardRequest', 'DrawShipRewardResponse', { index: ship.index }, { shipIndex: ship.index }, reason));
  }
  return candidates;
}
export function fleetView(facts, options = {}) { return { candidates: buildCandidates(facts, options), fleets: facts.fleets ?? [], ships: facts.ships ?? [], formations: facts.formationFacts?.buildings ?? [], formationCatalog: facts.formationFacts?.catalog ?? null, ownedHeroIds: facts.formationFacts?.ownedHeroIds ?? [], unlockedPresetIds: facts.formationFacts?.unlockedPresetIds ?? [], blocked: [
  { actionType: 'speedUpFleet', code: 'PREMIUM_BLOCKED', reason: '行军加速消耗 RUBY；配置为30/次，不属于免费操作' },
  { actionType: 'speedUpRepair', code: 'PREMIUM_BLOCKED', reason: '维修加速可能消耗RUBY或道具；未授权' },
  { actionType: 'speedUpCargo', code: 'PREMIUM_BLOCKED', reason: '货船加速有独立支付参数，未授权' },
  { actionType: 'fleetFormation', code: 'EXACT_SELECTION_REQUIRED', reason: '需buildingId及明确站位/阵型；复用阵型校验，OnWater复读，不继承主线阵营授权' },
  { actionType: 'autoFight', code: 'AUTOMATION_UNVERIFIED', reason: 'VIP舰队委任会持续派遣，不属于本次单次移动授权' },
] }; }
export function planFleet(facts, options = {}) { return selectedActions(buildCandidates(facts, options), options.selections ?? [], options.ledger ?? new ResourceLedger(facts.stockReliable ? facts.stock : null), validateFleetConfig(options.moduleConfig).petrolReserve); }
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
  if (!beforeFacts?.cargoReliable || !afterFacts?.cargoReliable) return { confirmed: false, reason: 'CargoShips权威复读缺失' };
  const before = beforeFacts.ships.find(ship => ship.index === target?.shipIndex), after = afterFacts.ships.find(ship => ship.index === target?.shipIndex);
  if (!before || !after) return { confirmed: false, reason: '精确货船缺失' };
  if (type === 'cargoFill') { const old = before.orderItem?.[target.cargoIndex - 1], current = after.orderItem?.[target.cargoIndex - 1]; return { confirmed: before.status === 0 && old?.filled === false && current?.filled === true && stable(old.asset) === stable(current.asset), reason: '以精确货格filled及原资产身份复读为准；响应奖励不足以证明装货' }; }
  if (type === 'cargoClaim') return { confirmed: before.status === 2 && [0, 1].includes(after.status) && response?.ship?.index === target.shipIndex && Array.isArray(response?.reward?.asset) && response.reward.asset.length > 0, reason: '须同时确认奖励回包、精确货船及旧到港状态已消耗' };
  return { confirmed: false, reason: '该操作未通过业务验证' };
}
export const fleetModule = Object.freeze({ id: 'fleet', defaultConfig: FLEET_DEFAULT_CONFIG, validateConfig: validateFleetConfig, survey: surveyFleet, view: fleetView, plan: planFleet, verify: verifyFleet });
