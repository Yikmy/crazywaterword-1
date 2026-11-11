// Ordered naval observations and rules; no unverified combat dispatch.
import { ResourceLedger } from './resource-ledger.mjs';
import { toSnapshotJson } from './game.mjs';
import { quantity, factQuantity, rowsOf, nonempty, stable, invalid, strictParameters, moduleConfiguration, stringIds, configuredCost, readNavalFact, stockFacts, fleetFacts, selectedActions } from './naval-facts.mjs';
export { quantity, factQuantity, rowsOf, nonempty, stable, invalid, strictParameters, moduleConfiguration, stringIds, configuredCost, readNavalFact, stockFacts, fleetFacts, selectedActions } from './naval-facts.mjs';
import { readGameTime, gameTimeBounds } from './state-facts.mjs';

export const NAVAL_DEFAULT_CONFIG = Object.freeze({ enabled: false, observe: false, worldBoss: false, limitedBoss: false, follow: false, rules: [] });
export function validateNavalConfig(value = {}) { return moduleConfiguration(value, NAVAL_DEFAULT_CONFIG); }
// Rule order is preserved for audit. Unsupported fields/types and missing values are UNKNOWN.
export function evaluateNavalRules(rules, context = {}) {
  if (!Array.isArray(rules) || !rules.length) return { status: 'UNKNOWN', allowed: false, trace: [{ id: 'rules', type: 'rules', status: 'UNKNOWN', reason: '未配置可验证的规则' }] };
  const seen = new Set();
  const trace = rules.map((rule, index) => {
    const id = nonempty(rule?.id) ? rule.id : 'rule-' + index;
    let status = 'UNKNOWN', reason = '规则类型或事实不可验证';
    if (seen.has(id) || !rule || typeof rule !== 'object' || Array.isArray(rule) || Object.keys(rule).some(key => !['id', 'type', 'value'].includes(key))) return { id, type: rule?.type ?? 'unknown', status, reason: '规则结构或 ID 无效' };
    seen.add(id);
    let actual, expected = rule.value;
    switch (rule.type) {
      case 'targetId': actual = context.target?.id; if (nonempty(actual) && nonempty(expected)) status = actual === expected ? 'PASS' : 'FAIL'; break;
      case 'targetState': actual = context.target?.state; if (quantity(actual) !== null && quantity(expected) !== null) status = actual === expected ? 'PASS' : 'FAIL'; break;
      case 'fleetState': actual = context.fleet?.state; if (quantity(actual) !== null && quantity(expected) !== null) status = actual === expected ? 'PASS' : 'FAIL'; break;
      case 'minDurability': actual = context.fleet?.durability; if (quantity(actual) !== null && quantity(expected) !== null) status = actual >= expected ? 'PASS' : 'FAIL'; break;
      case 'minPetrol': actual = context.petrol; if (quantity(actual) !== null && quantity(expected) !== null) status = actual >= expected ? 'PASS' : 'FAIL'; break;
      case 'sameGuild': actual = context.target?.guildIdx; if (quantity(actual) !== null && quantity(context.guildIdx) !== null && typeof expected === 'boolean') status = (actual === context.guildIdx) === expected ? 'PASS' : 'FAIL'; break;
      case 'freshTarget': { actual = context.target?.observedAt; const observedClock = context.target?.observedGameTime; const current = gameTimeBounds(context), observed = gameTimeBounds({ now: actual, ...(observedClock ? { gameTime: observedClock } : {}) }); const sameClockScope = !context.gameTime || !observedClock || ['accountId','generation'].every(key => context.gameTime[key] === observedClock[key]); if (sameClockScope && observed.earliest !== null && current.latest !== null && quantity(expected) !== null && current.now >= actual) status = current.latest - observed.earliest <= expected ? 'PASS' : 'FAIL'; break; }
      case 'playerSide': reason = '其他海战模式不继承 BT_MAINLINE LEFT 授权'; break;
    }
    if (status !== 'UNKNOWN') reason = status === 'PASS' ? '权威事实符合规则' : '权威事实不符合规则';
    return { id, type: rule.type ?? 'unknown', status, reason };
  });
  const status = trace.some(row => row.status === 'FAIL') ? 'FAIL' : trace.some(row => row.status === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';
  return { status, allowed: status === 'PASS', trace };
}

function exactInt64(value, { positive = false } = {}) {
  const copied = toSnapshotJson(value);
  if (typeof copied !== 'string' && !(typeof copied === 'number' && Number.isSafeInteger(copied))) return null;
  const text = String(copied); if (!/^(0|[1-9][0-9]*)$/.test(text)) return null;
  try { const value = BigInt(text); return value <= 9223372036854775807n && (!positive || value > 0n) ? text : null; } catch { return null; }
}
function navalParameters(parameters = {}) {
  strictParameters(parameters, ['targetId','playerId','excludeGuildIds','cityIds','minimumPower','maximumPower','screenCenter']);
  if (parameters.targetId !== undefined && !nonempty(parameters.targetId)) throw invalid('目标必须使用精确 ID');
  for (const key of ['playerId','minimumPower','maximumPower']) if (parameters[key] !== undefined && exactInt64(parameters[key], { positive: key === 'playerId' }) === null) throw invalid(key + ' 必须为可靠十进制int64');
  if (parameters.minimumPower !== undefined && parameters.maximumPower !== undefined && BigInt(parameters.minimumPower) > BigInt(parameters.maximumPower)) throw invalid('战力范围无效');
  if (parameters.excludeGuildIds !== undefined && (!Array.isArray(parameters.excludeGuildIds) || parameters.excludeGuildIds.length > 100 || parameters.excludeGuildIds.some(value => exactInt64(value) === null) || new Set(parameters.excludeGuildIds.map(String)).size !== parameters.excludeGuildIds.length)) throw invalid('排除联盟ID列表无效');
  if (parameters.cityIds !== undefined && (!Array.isArray(parameters.cityIds) || parameters.cityIds.length > 100 || parameters.cityIds.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647) || new Set(parameters.cityIds).size !== parameters.cityIds.length)) throw invalid('城市筛选必须为明确int32列表');
  if (parameters.screenCenter !== undefined) { strictParameters(parameters.screenCenter, ['x','y']); if (['x','y'].some(key => !Number.isSafeInteger(parameters.screenCenter[key]) || Math.abs(parameters.screenCenter[key]) > 2147483647)) throw invalid('观察中心必须为明确int32坐标'); }
  return parameters;
}
export async function surveyNaval(client, protocol, { signal, parameters = {}, moduleConfig = {}, player = null } = {}) {
  navalParameters(parameters); moduleConfig = validateNavalConfig(moduleConfig);
  const names = ['WorldInfoRequest', 'MyFleetsRequest', 'WorldBossInfoRequest', 'LimitedBossOpenRequest', 'AllItemRequest', 'AllResourceRequest'];
  let worldObservedTime = null;
  const values = await Promise.all(names.map(async request => { const value = await readNavalFact(client, protocol, request, request === 'WorldInfoRequest' ? { screenCenter: parameters.screenCenter ?? { x: 0, y: 0 } } : {}, { signal }); if (request === 'WorldInfoRequest') worldObservedTime = readGameTime(client); return value; }));
  const sources = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  const world = sources.WorldInfoRequest, rows = world.body?.fleets;
  const worldReliable = world.available && Array.isArray(rows);
  const worldFleets = worldReliable ? rows.map(fleet => ({
    playerId: Object.hasOwn(fleet.owner ?? {}, 'playerId') ? exactInt64(fleet.owner.playerId, { positive: true }) : null,
    guildId: Object.hasOwn(fleet.owner ?? {}, 'guildId') ? exactInt64(fleet.owner.guildId) : null,
    nickname: typeof fleet.owner?.nickname === 'string' ? fleet.owner.nickname : null,
    buildingId: nonempty(fleet.buildingId) ? fleet.buildingId : null,
    state: factQuantity(fleet, 'state'), cityId: factQuantity(fleet, 'cityId'), targetCityId: factQuantity(fleet, 'targetCityId'), curGridIdx: factQuantity(fleet, 'curGridIdx'),
    durability: factQuantity(fleet, 'durability'), maxDura: factQuantity(fleet, 'maxDura'), power: Object.hasOwn(fleet, 'power') ? exactInt64(fleet.power) : null,
  })) : [];
  return { ...readGameTime(client), player: toSnapshotJson(player), parameters: structuredClone(parameters), sources, ...fleetFacts(sources.MyFleetsRequest), ...stockFacts(sources.AllItemRequest, sources.AllResourceRequest), moduleConfig, worldReliable, worldFleets, worldObservedTime, scope: { screenCenter: parameters.screenCenter ?? { x: 0, y: 0 }, source: 'WorldInfoResponse.fleets', completeness: 'CURRENT_RESPONSE_ONLY' } };
}
export function navalView(facts, { parameters = facts.parameters ?? {}, moduleConfig = {} } = {}) {
  navalParameters(parameters);
  const rules = moduleConfig.rules ?? [], observedAt = facts.worldObservedTime ? facts.worldObservedTime.now : facts.now, observedGameTime = facts.worldObservedTime?.gameTime;
  const targets = (facts.worldFleets ?? []).map(fleet => {
    const key = fleet.playerId && fleet.buildingId ? fleet.playerId + ':' + fleet.buildingId : null;
    const trace = [];
    function filter(id, actual, wanted, compare = (a,b) => a === b) { if (wanted === undefined) return; const status = actual === null || actual === undefined ? 'UNKNOWN' : compare(actual,wanted) ? 'PASS' : 'FAIL'; trace.push({ id, type: id, status, reason: status === 'UNKNOWN' ? '筛选事实未权威提供' : status === 'PASS' ? '筛选匹配' : '筛选不匹配' }); }
    filter('targetId', key, parameters.targetId); filter('playerId', fleet.playerId, parameters.playerId === undefined ? undefined : String(parameters.playerId));
    filter('excludeGuildIds', fleet.guildId, parameters.excludeGuildIds?.map(String), (actual,wanted) => !wanted.includes(actual));
    filter('cityIds', fleet.cityId, parameters.cityIds, (actual,wanted) => wanted.includes(actual));
    filter('minimumPower', fleet.power, parameters.minimumPower, (actual,wanted) => BigInt(actual) >= BigInt(wanted));
    filter('maximumPower', fleet.power, parameters.maximumPower, (actual,wanted) => BigInt(actual) <= BigInt(wanted));
    const evaluated = evaluateNavalRules(rules, { target: { id:key, state:fleet.state, observedAt, observedGameTime }, fleet, now:facts.now, ...(Object.hasOwn(facts,'gameTime') ? { gameTime:facts.gameTime } : {}), petrol:facts.stockReliable ? facts.stock.get('汽油') : null });
    const configuredTrace = rules.length ? evaluated.trace : [];
    const all = [...trace,...configuredTrace];
    const status = facts.worldReliable !== true || !key ? 'UNKNOWN' : all.some(row => row.status === 'FAIL') ? 'FAIL' : all.some(row => row.status === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';
    return { ...fleet, targetKey:key, observedAt, source:'WorldInfoResponse.fleets', status, ruleTrace:all, scope:'OBSERVATION_ONLY' };
  });
  return { candidates: [], targets, observations: targets.filter(row => row.status === 'PASS'), worldReliable:facts.worldReliable === true, scope:facts.scope ?? { completeness:'CURRENT_RESPONSE_ONLY' }, rules: evaluateNavalRules(rules, { now: facts.now, petrol: facts.stockReliable ? facts.stock.get('汽油') : null }),
    blocked: [
      { actionType: 'worldBoss', code: 'SIDE_UNVERIFIED', reason: '缺少本模式最终战报关联与阵营授权' },
      { actionType: 'limitedBoss', code: 'SIDE_UNVERIFIED', reason: '缺少本模式单次出战结果的权威关联' },
      { actionType: 'follow', code: 'TARGET_ID_UNVERIFIED', reason: 'WorldInfo的playerId+buildingId仅作本次观察关联；未确认持续全局ID/派遣语义，不能自动攻击或跟随' },
    ], enabled: moduleConfig.enabled === true };
}
export function planNaval(facts, options = {}) {
  const view = navalView(facts, options);
  const selected = selectedActions(view.candidates, options.selections ?? [], options.ledger ?? new ResourceLedger(facts.stockReliable ? facts.stock : null));
  return { ...selected, notes: [...selected.notes, ...view.blocked.map(row => row.reason)] };
}
export const navalModule = Object.freeze({ id: 'naval', defaultConfig: NAVAL_DEFAULT_CONFIG, validateConfig: validateNavalConfig, survey: surveyNaval, view: navalView, plan: planNaval, verify: () => ({ confirmed: false, reason: '海战写入结果尚无已验证的权威关联' }) });
