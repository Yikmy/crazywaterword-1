import { businessRejectionIdentityFromHistory } from './business-functions.mjs';
// World treasure integration, adapted from the reference survey/view/plan functions.
// No transport executor, no inferred victory and no short-window success assumption.
import { ResourceLedger } from './resource-ledger.mjs';
import { toSnapshotJson } from './game.mjs';
import { strictParameters, stringIds, invalid, readNavalFact, stockFacts, fleetFacts, configuredCost, rowsOf, quantity, factQuantity, stable, selectedActions, moduleConfiguration } from './naval-facts.mjs';
import { readGameTime, gameTimeBounds } from './state-facts.mjs';

export const TREASURE_DEFAULT_CONFIG = Object.freeze({ enabled: false, dispatch: false, colors: [5], maxFleets: 1, minimumDurabilityRatio: 0.8, petrolReserve: 0 });
function parametersOf(parameters = {}) {
  strictParameters(parameters, ['uid', 'fleetBuildingIds']);
  if (parameters.uid !== undefined && (!Number.isSafeInteger(parameters.uid) || parameters.uid <= 0 || parameters.uid > 2147483647)) throw invalid('宝藏 UID 必须是明确的正 int32');
  stringIds(parameters.fleetBuildingIds);
  return parameters;
}
export function validateTreasureConfig(value = {}) {
  const result = moduleConfiguration(value, TREASURE_DEFAULT_CONFIG);
  if (!Array.isArray(result.colors) || !result.colors.length || result.colors.some(color => ![3, 4, 5].includes(color)) || new Set(result.colors).size !== result.colors.length
    || !Number.isSafeInteger(result.maxFleets) || result.maxFleets < 1 || result.maxFleets > 10 || !Number.isFinite(result.minimumDurabilityRatio) || result.minimumDurabilityRatio <= 0 || result.minimumDurabilityRatio > 1 || quantity(result.petrolReserve) === null) throw invalid('寻宝规则无效');
  return result;
}
export async function surveyTreasure(client, protocol, { config = null, player = null, signal, parameters = {}, moduleConfig = {} } = {}) {
  parametersOf(parameters); validateTreasureConfig(moduleConfig);
  const names = ['TreasureLootStatsRequest', 'TreasureLootListRequest', 'MyFleetsRequest', 'SeasonRankInfoRequest', 'AllItemRequest', 'AllResourceRequest'];
  const values = await Promise.all(names.map(request => readNavalFact(client, protocol, request, {}, { signal })));
  const sources = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  const list = sources.TreasureLootListRequest.body?.treasure;
  const treasureReliable = sources.TreasureLootListRequest.available && Array.isArray(list) && list.every(row => factQuantity(row, 'uid') !== null && row.uid > 0) && new Set(list.map(row => row.uid)).size === list.length;
  const treasures = treasureReliable ? list.map(row => ({ uid: factQuantity(row, 'uid'), color: factQuantity(row, 'color'), ownerGuildIdx: factQuantity(row, 'ownerGuildIdx'), ownerFleetNum: factQuantity(row, 'ownerFleetNum'), progress: Object.hasOwn(row, 'progress') && Number.isFinite(row.progress) && row.progress >= 0 && row.progress <= 100 ? row.progress : null, gridIdx: factQuantity(row, 'gridIdx') })) : [];
  let targetDetails = null;
  if (parameters.uid !== undefined) {
    const [rank, defence] = await Promise.all(['TreasureLootRankRequest', 'TreasureLootDefenceRequest'].map(request => readNavalFact(client, protocol, request, { uid: parameters.uid }, { signal })));
    sources.TreasureLootRankRequest = rank; sources.TreasureLootDefenceRequest = defence;
    const rankReliable = rank.available && Array.isArray(rank.body?.items);
    const defenceReliable = defence.available && Array.isArray(defence.body?.fleets);
    targetDetails = { uid: parameters.uid, rankReliable, defenceReliable, rank: rankReliable ? toSnapshotJson(rank.body.items) : [], defence: defenceReliable ? toSnapshotJson(defence.body.fleets) : [] };
  }
  const stats = sources.TreasureLootStatsRequest;
  const season = sources.SeasonRankInfoRequest;
  return { ...readGameTime(client), config, player: structuredClone(player), parameters: structuredClone(parameters), sources,
    targetDetails, ...stockFacts(sources.AllItemRequest, sources.AllResourceRequest), ...fleetFacts(sources.MyFleetsRequest), treasureReliable, treasures,
    statsReliable: stats.available && factQuantity(stats.body, 'todayRewardTimes') !== null && factQuantity(stats.body, 'totalRewardTimes') !== null && stats.body.totalRewardTimes > 0,
    todayRewardTimes: quantity(stats.body?.todayRewardTimes), totalRewardTimes: factQuantity(stats.body, 'totalRewardTimes'),
    season: { startTime: factQuantity(season.body, 'startTime'), endTime: factQuantity(season.body, 'endTime'), reliable: season.available },
    protocolReady: Boolean(protocol?.TreasureLootSendFleetsRequest),
  };
}
function opening(facts, config) {
  const time = gameTimeBounds(facts);
  if (time.now === null) return null;
  const worldId = quantity(facts.player?.worldId);
  const season = worldId === null ? 0 : Math.floor(worldId / 1000000) % 1000;
  const matches = rowsOf(config, 'GameplayOpenCfg').filter(row => row.gameplay === '世界宝藏');
  const days = matches.length === 1 ? matches[0].openDays?.[Math.min(season - 1, matches[0].openDays.length - 1)] : null;
  if (!facts.season?.reliable || quantity(facts.season.startTime) === null || facts.season.startTime <= 0 || quantity(facts.season.endTime) === null || facts.season.endTime <= facts.season.startTime || !Number.isSafeInteger(days) || days < 1 || season < 1) return null;
  const opens = facts.season.startTime + (days - 1) * 86400, closes = facts.season.endTime - 3600;
  if (time.earliest >= opens && time.latest < closes) return true;
  if (time.latest < opens || time.earliest >= closes) return false;
  return null;
}
function buildCandidates(facts, { config = facts.config, parameters = facts.parameters ?? {}, moduleConfig = {} } = {}) {
  parametersOf(parameters); const opts = validateTreasureConfig(moduleConfig), unit = configuredCost(config, '进攻宝藏消耗汽油');
  const selected = stringIds(parameters.fleetBuildingIds);
  const idle = (facts.fleets ?? []).filter(fleet => fleet.state === 1 && fleet.autoFight?.isOn === false && fleet.treasureLootUid === 0 && !fleet.repairing && fleet.durability !== null && fleet.maxDura > 0 && fleet.durability / fleet.maxDura >= opts.minimumDurabilityRatio);
  const picks = selected ? selected.map(id => (facts.fleets ?? []).find(fleet => fleet.buildingId === id)) : idle.slice().sort((a, b) => a.buildingId.localeCompare(b.buildingId)).slice(0, opts.maxFleets);
  const ids = picks.filter(Boolean).map(fleet => fleet.buildingId);
  return (facts.treasures ?? []).filter(target => parameters.uid === undefined || parameters.uid === target.uid).map(target => {
    let reason = null;
    const cost = unit === null ? null : unit * picks.length;
    if (opts.enabled !== true || opts.dispatch !== true) reason = 'MODULE_DISABLED';
    else if (!facts.protocolReady || !facts.treasureReliable || !facts.fleetReliable || !facts.stockReliable || !facts.statsReliable) reason = 'FACTS_UNRELIABLE';
    else if (opening(facts, config) === null) reason = 'SEASON_UNKNOWN';
    else if (!opening(facts, config)) reason = 'SEASON_CLOSED';
    else if (facts.todayRewardTimes >= facts.totalRewardTimes) reason = 'DAILY_LIMIT';
    else if (!opts.colors.includes(target.color) || target.progress === null || target.progress >= 100) reason = 'TARGET_UNAVAILABLE';
    else if (target.ownerGuildIdx === null || target.ownerFleetNum === null) reason = 'OWNER_UNKNOWN';
    else if (target.ownerGuildIdx !== 0 || target.ownerFleetNum !== 0) reason = 'CONTESTED_TARGET_UNVERIFIED';
    else if (parameters.uid !== undefined && (!facts.targetDetails || facts.targetDetails.uid !== target.uid || !facts.targetDetails.rankReliable || !facts.targetDetails.defenceReliable)) reason = 'TARGET_DETAILS_UNRELIABLE';
    else if (facts.targetDetails?.uid === target.uid && facts.targetDetails.defence?.length) reason = 'DEFENCE_PRESENT';
    else if (!picks.length || picks.length > opts.maxFleets || picks.length > 10 || picks.some(fleet => !fleet || !idle.includes(fleet))) reason = 'FLEET_UNAVAILABLE';
    else if (unit === null || !Number.isSafeInteger(cost)) reason = 'COST_UNKNOWN';
    else if (quantity(facts.stock?.get('汽油')) === null || facts.stock.get('汽油') < cost + opts.petrolReserve) reason = 'INSUFFICIENT_PETROL';
    const costs = cost === null || !Number.isSafeInteger(cost) ? [] : [{ id: '汽油', num: cost }];
    const beforeState = { treasure: target, fleets: picks.map(fleet => fleet ?? null), todayRewardTimes: facts.todayRewardTimes, totalRewardTimes: facts.totalRewardTimes, season: facts.season };
    const targetIdentity = { uid: target.uid, fleetBuildingIds: ids };
    return { actionId: 'treasure:dispatch:' + target.uid + ':' + ids.map(encodeURIComponent).join(','), actionType: 'treasureDispatch', target: targetIdentity, costs,
      costSource: unit === null ? null : 'WorldParamCfg.进攻宝藏消耗汽油 × 舰队数量', beforeState, identity: stable(beforeState), expectedState: { treasureLootUid: target.uid, scope: 'DISPATCH_CONFIRMED_ONLY' },
      parameters: targetIdentity, decision: reason ? 'BLOCKED' : 'READY', reason, label: '派舰至世界宝藏 ' + target.uid,
      action: reason ? null : { request: 'TreasureLootSendFleetsRequest', response: null, body: { uid: target.uid, fleetBuildingIds: ids } } };
  });
}
export function treasureView(facts, options = {}) { return { candidates: buildCandidates(facts, options), targetDetails: facts.targetDetails ?? null, reliability: { treasures: facts.treasureReliable === true, fleets: facts.fleetReliable === true, stock: facts.stockReliable === true, stats: facts.statsReliable === true }, treasures: facts.treasures ?? [], fleets: facts.fleets ?? [], todayRewardTimes: facts.todayRewardTimes, totalRewardTimes: facts.totalRewardTimes }; }
export function planTreasure(facts, options = {}) { return selectedActions(buildCandidates(facts, options), options.selections ?? [], options.ledger ?? new ResourceLedger(facts.stockReliable ? facts.stock : null), validateTreasureConfig(options.moduleConfig).petrolReserve); }
export function verifyTreasure(operation, beforeFacts, afterFacts) {
  if (operation?.actionType !== 'treasureDispatch' || !beforeFacts?.fleetReliable || !afterFacts?.fleetReliable || !afterFacts?.treasureReliable) return { confirmed: false, reason: '寻宝权威复读不完整' };
  const target = operation.target, ids = target?.fleetBuildingIds;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return { confirmed: false, reason: '舰队选择无效' };
  const targetExists = afterFacts.treasures.some(treasure => treasure.uid === target.uid);
  const confirmed = targetExists && ids.every(id => { const before = beforeFacts.fleets.find(fleet => fleet.buildingId === id), after = afterFacts.fleets.find(fleet => fleet.buildingId === id); return before?.state === 1 && before.treasureLootUid === 0 && after?.treasureLootUid === target.uid && [1, 2, 3, 5].includes(after.state); });
  return { confirmed, reason: confirmed ? 'MyFleets 精确舰队已关联目标宝藏；仅确认派遣，不代表获胜或奖励到账' : 'MyFleets 未证实精确舰队派遣到目标；保留 UNKNOWN' };
}
export const treasureModule = Object.freeze({ id: 'treasure', rejectionIdentity: businessRejectionIdentityFromHistory, validateParameters: parametersOf, defaultConfig: TREASURE_DEFAULT_CONFIG, validateConfig: validateTreasureConfig, survey: surveyTreasure, view: treasureView, plan: planTreasure, verify: verifyTreasure });
