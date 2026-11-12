// W12 / C151: one explicit, ordinary PirateSweep with independent readback.
import { createHash } from 'node:crypto';
import { stableBusinessValue } from './business-functions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import {
  PIRATE_QUOTA_EVIDENCE, calculatePirateQuota, capturePirateQuotaContext, hasPirateQuotaContext,
  observePirateMonthCards, observePirateQuotaClock, ownQuotaValue as own, pirateCounterDay,
  pirateQuotaUint as uint, samePirateQuotaContext,
} from './pirate-quota.mjs';
import { PIRATE_SWEEP_READ_EVIDENCE, observePirateVipLevel } from './pirate-sweep.mjs';
import { ResourceLedger } from './resource-ledger.mjs';

const moduleId = 'pirate-sweep', capabilityId = 'C151', request = 'PirateSweepRequest';
const maxAgeMs = 30000;
const costSource = 'v76 WeChat PiratePop; one ordinary daily PirateSweep, no item/resource debit';
const parameterKeys = ['uid', 'cityId', 'allowLowerLevel'];
const tables = ['PirateParamCfg', 'VipLevelCfg', 'MonthCardCfg'];
const responseNames = ['MonthCardResponse', 'PirateKillRecordResponse', 'AllItemResponse', 'AllResourceResponse', 'AllPirateResponse'];
const piratePushes = new Set([
  'SCPirateSweepTimes', 'SCPirateUpdate', 'SCPirateKillRecordUpdate', 'SCRemovePirates',
  'SCPirateCampaignBegin', 'SCPirateCampaignEnd', 'SCDailyTaskReset', 'SCDailyWeeklyReset', 'SCServerTimeChanged',
]);
const positive = n => uint(n) && n > 0;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => stableBusinessValue(a) === stableBusinessValue(b);
const hash = value => createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const copy = value => structuredClone(value);
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_PARAMETERS', statusCode: 400 });
const plainFields = (value, keys) => object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return keys.includes(key) && descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
  });
const dense = value => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= 10000
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, i))
    .every(descriptor => descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));

export const PIRATE_SWEEP_DEFAULT_CONFIG = Object.freeze({ enabled: false });
export const PIRATE_SWEEP_OPERATION_EVIDENCE = Object.freeze({
  quota: PIRATE_QUOTA_EVIDENCE, readModel: PIRATE_SWEEP_READ_EVIDENCE,
  firstKillCheckByteOffset: 5278013, lowerLevelConfirmByteOffset: 5279958, requestByteOffset: 5280432,
  scope: 'EXPLICIT_SINGLE_TARGET_ORDINARY_SWEEP', realGame: 'REAL_UNVERIFIED',
});

export function validatePirateSweepConfig(value = {}) {
  if (!plainFields(value, ['enabled']) || Object.hasOwn(value, 'enabled') && typeof value.enabled !== 'boolean')
    throw invalid('海盗扫荡配置只允许 enabled 布尔值');
  return { enabled: value.enabled ?? false };
}

export function validatePirateSweepParameters(value = {}) {
  if (!plainFields(value, parameterKeys) || ['uid', 'cityId'].some(key => Object.hasOwn(value, key) && !positive(value[key]))
      || Object.hasOwn(value, 'uid') !== Object.hasOwn(value, 'cityId')
      || Object.hasOwn(value, 'allowLowerLevel') && (!Object.hasOwn(value, 'uid') || typeof value.allowLowerLevel !== 'boolean'))
    throw invalid('海盗扫荡参数要求同时指定正 int32 uid、cityId，可选 allowLowerLevel 布尔值');
  return Object.fromEntries(parameterKeys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}

function exactRoleId(value) {
  const raw = toSnapshotJson(value), id = Number.isSafeInteger(raw) && raw > 0 ? String(raw) : raw;
  return typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id) && BigInt(id) < (1n << 63n) ? id : null;
}
function identityOf(client, player) {
  const ids = ['id', 'playerId'].filter(key => own(player, key) !== undefined).map(key => exactRoleId(own(player, key)));
  return { ...capturePirateQuotaContext(client),
    playerId: ids.length && ids.every(id => id === ids[0]) ? ids[0] : null, worldId: exactRoleId(own(player, 'worldId')) };
}
const sameRole = (a, b) => Boolean(a?.playerId && a?.worldId) && a.playerId === b?.playerId && a.worldId === b?.worldId;

function parseRows(raw, key, identity, fields, valid) {
  const rows = own(raw, key);
  if (!dense(rows)) return null;
  const seen = new Set(), result = [];
  for (const row of rows) {
    if (!object(row) || Reflect.ownKeys(row).length !== fields.length) return null;
    const value = Object.fromEntries(fields.map(field => [field, own(row, field)]));
    if (!valid(value) || seen.has(value[identity])) return null;
    seen.add(value[identity]); result.push(value);
  }
  return result.sort((a, b) => a[identity] - b[identity]);
}
const supportedType = n => [1, 2, 3].includes(n);
const parsePirates = raw => parseRows(raw, 'pirates', 'uid', ['uid', 'cityId', 'type', 'level', 'gridIdx'],
  row => positive(row.uid) && positive(row.cityId) && supportedType(row.type) && positive(row.level) && uint(row.gridIdx));
const parseKillRecords = raw => parseRows(raw, 'records', 'type', ['type', 'maxKilledLevel'],
  row => supportedType(row.type) && uint(row.maxKilledLevel));
function parseCards(raw) {
  const rows = own(raw, 'cardItem');
  // gotDailyReward is independent from the type/expiry effect on this quota.
  if (!dense(rows) || rows.length > 2 || !rows.every(row => object(row)
      && Reflect.ownKeys(row).every(key => ['type', 'endTime', 'gotDailyReward'].includes(key) && own(row, key) !== undefined)
      && (!Object.hasOwn(row, 'gotDailyReward') || typeof own(row, 'gotDailyReward') === 'boolean'))) return null;
  const projected = rows.map(row => ({ type: own(row, 'type'), endTime: own(row, 'endTime') }));
  return parseRows({ cardItem: projected }, 'cardItem', 'type', ['type', 'endTime'],
    row => [1, 2].includes(row.type) && (row.endTime === -1 || uint(row.endTime)));
}

// One passive listener per live client. Inventory and unrelated push frames
// may continue during shared preflight without replacing pirate authority.
const streams = new WeakMap(), seals = new WeakMap();
function observationStream(client) {
  if (streams.has(client)) return streams.get(client);
  if (typeof client?.on !== 'function') return null;
  const state = { order: 0, changes: 0, counterChanges: 0, lastCounter: null, otherChanges: 0,
    lastClockChangeAt: null, responses: new Map(), receipts: new WeakMap() };
  client.on('message', ({ name, seq, body } = {}) => {
    state.order++;
    if (piratePushes.has(name) || name === 'SCVipUpdate' || name === 'SCEWorldOrderDelivery' && own(body, 'monthCard') !== undefined) {
      state.changes++;
      if (name === 'SCPirateSweepTimes') {
        state.counterChanges++;
        const value = own(body, 'sweepTimes');
        state.lastCounter = { value: positive(seq) && uint(value) ? value : null, order: state.order };
      } else state.otherChanges++;
    }
    if (name === 'SCServerTimeChanged') state.lastClockChangeAt = Date.now();
    if (!responseNames.includes(name)) return;
    state.responses.set(name, (state.responses.get(name) ?? 0) + 1);
    if (object(body) && positive(seq)) state.receipts.set(body, { name, order: state.order, receivedAt: Date.now() });
  });
  streams.set(client, state);
  return state;
}
const domainRevision = stream => ({
  changes: stream?.changes,
  pirates: stream?.responses.get('AllPirateResponse') ?? 0,
  records: stream?.responses.get('PirateKillRecordResponse') ?? 0,
  cards: stream?.responses.get('MonthCardResponse') ?? 0,
});
const nowBetween = (now, start, end) => Number.isSafeInteger(now) && now >= start && now <= end;
const configEvidence = config => Object.fromEntries(tables.map(name => [name, copy(own(own(config, 'tables'), name) ?? null)]));
export function pirateSweepDependencyVersions({ config, moduleConfig = PIRATE_SWEEP_DEFAULT_CONFIG } = {}) {
  return { moduleConfig: validatePirateSweepConfig(moduleConfig),
    ...Object.fromEntries(Object.entries(configEvidence(config)).map(([name, value]) => ['config.' + name, value])) };
}

function clockFor(client, context, stream) {
  const clock = observePirateQuotaClock(client, context);
  if (!clock || stream?.lastClockChangeAt == null) return clock;
  // The existing clock's sourceAt is the matched Ping receipt time. A time
  // change must be followed by a strictly later trusted Ping sample.
  try {
    const sourceAt = own(client.gameClock.read(context), 'sourceAt');
    return Number.isSafeInteger(sourceAt) && sourceAt > stream.lastClockChangeAt && sourceAt <= clock.observedAt ? clock : null;
  } catch { return null; }
}
function entitlements(client, context, config, clock) {
  const day = pirateCounterDay(clock), vip = observePirateVipLevel(client, context), cards = observePirateMonthCards(client, context);
  const reason = day.reason ?? (!sameRole(context, vip) || !sameRole(context, cards) ? 'PIRATE_VIP_OR_MONTH_CARDS_UNKNOWN' : null);
  const quota = reason ? { total: null, reason } : calculatePirateQuota({ config, vipLevel: vip.vipLevel, cards: cards.cards, clock });
  return { ...day, ...quota, clock, vip, cards };
}

const evidenceDigest = facts => hash({
  parameters: facts.parameters, context: facts.context, pirates: facts.pirates, records: facts.records,
  quota: facts.quota, quotaBreakdown: facts.quotaBreakdown, stock: [...facts.stock], stockReliable: facts.stockReliable,
});
const unknownQuota = (reason, { dayKey = null, used = null, total = null } = {}) => ({ dayKey, used, total, remaining: null, reason });

export async function surveyPirateSweep(client, protocol, { config, player, parameters = {}, signal, stop, timeout = 15000 } = {}) {
  parameters = validatePirateSweepParameters(parameters);
  const active = () => assertExecutionActive(client, { signal, stop }), startedAt = Date.now();
  active();
  const context = identityOf(client, player), stream = observationStream(client), revisionBefore = domainRevision(stream);
  async function read(requestName, responseName) {
    active();
    if (!stream || !protocol?.[requestName] || !protocol?.[responseName]) return null;
    let dispatched;
    try {
      const body = await awaitExecution(client.request(requestName, {}, responseName, timeout, { signal,
        beforeDispatch: () => { active(); dispatched = { order: stream.order, at: Date.now() }; },
      }), client, { signal, stop });
      const receipt = object(body) ? stream.receipts.get(body) : null;
      if (!dispatched || receipt?.name !== responseName || receipt.order <= dispatched.order || receipt.receivedAt < dispatched.at) return null;
      return { body, receipt, dispatched };
    } catch (error) {
      if (executionOutcome(error) === 'CANCELLED') throw error;
      return null;
    }
  }
  const [monthCards, killRecords, items, resources] = await Promise.all([
    read('MonthCardRequest', 'MonthCardResponse'), read('PirateKillRecordRequest', 'PirateKillRecordResponse'),
    read('AllItemRequest', 'AllItemResponse'), read('AllResourceRequest', 'AllResourceResponse'),
  ]);
  const beforeClock = clockFor(client, context, stream);
  const piratesResponse = await read('AllPirateRequest', 'AllPirateResponse');
  const afterClock = clockFor(client, context, stream), completedAt = Date.now();
  active();
  if (!same(context, identityOf(client, player))) throw Object.assign(new Error('海盗调查期间账号、角色或连接已改变'), { code: 'CANCELLED' });
  const authority = entitlements(client, context, config, afterClock), revision = domainRevision(stream);
  const pirates = parsePirates(piratesResponse?.body), records = parseKillRecords(killRecords?.body);
  const rawUsed = own(piratesResponse?.body, 'sweepTimes'), used = uint(rawUsed) ? rawUsed : null;
  const rawInventory = parseOperationInventory(items?.body, resources?.body);
  const inventory = rawInventory.stockReliable
    ? parseOperationInventory(toSnapshotJson(items.body), toSnapshotJson(resources.body)) : rawInventory;
  const beforeDay = pirateCounterDay(beforeClock), cardRows = parseCards(monthCards?.body);
  let reason = null;
  if (!hasPirateQuotaContext(context) || !context.playerId || !context.worldId) reason = 'PIRATE_ROLE_OR_CONNECTION_UNKNOWN';
  else if (!stream || revision.changes !== revisionBefore.changes || revision.pirates !== revisionBefore.pirates + 1
      || revision.records !== revisionBefore.records + 1
      || pirates === null || records === null || used === null) reason = 'PIRATE_POOL_COUNTER_OR_KILL_RECORDS_UNKNOWN';
  else if (beforeDay.reason || authority.reason || beforeDay.dayKey !== authority.dayKey)
    reason = beforeDay.reason ?? authority.reason ?? 'PIRATE_GAME_DAY_CHANGED';
  else if (!monthCards || revision.cards !== revisionBefore.cards + 1 || cardRows === null || !same(cardRows, authority.cards.cards)
      || !nowBetween(authority.cards.sourceAt, monthCards.dispatched.at, monthCards.receipt.receivedAt))
    reason = 'PIRATE_MONTH_CARD_QUERY_NOT_CURRENT';
  else if (used > authority.total) reason = 'PIRATE_USED_EXCEEDS_TOTAL';
  const quota = reason ? unknownQuota(reason, { dayKey: authority.dayKey, used, total: authority.total })
    : { dayKey: authority.dayKey, used, total: authority.total, remaining: authority.total - used, reason: null };
  const facts = { module: moduleId, parameters, context, pirates, records, quota, quotaBreakdown: authority.breakdown ?? null, ...inventory,
    state: { quota, quotaBreakdown: authority.breakdown ?? null } };
  const protocolKnown = Boolean(protocol?.[request] && !protocol?.PirateSweepResponse);
  seals.set(facts, { client, player, stream, revision, startedAt, completedAt, lastOrder: piratesResponse?.receipt.order,
    counterChanges: stream?.counterChanges, lastCounter: stream?.lastCounter, otherChanges: stream?.otherChanges,
    vipLevel: authority.vip.vipLevel, cards: authority.cards.cards, cardSourceAt: authority.cards.sourceAt, protocolKnown,
    config: configEvidence(config), digest: evidenceDigest(facts) });
  return facts;
}

function intact(facts) {
  const seal = seals.get(facts);
  if (!seal || seal.client.connected !== true || !nowBetween(Date.now(), seal.completedAt, seal.startedAt + maxAgeMs)) return null;
  try {
    return facts.quota?.reason === null && facts.stockReliable === true && facts.stock instanceof Map
      && seal.digest === evidenceDigest(facts) && same(facts.context, identityOf(seal.client, seal.player)) ? seal : null;
  } catch { return null; }
}

function liveAuthority(facts, config) {
  const seal = intact(facts);
  if (!seal || !same(seal.revision, domainRevision(seal.stream)) || !same(seal.config, configEvidence(config))) return null;
  const current = entitlements(seal.client, facts.context, config, clockFor(seal.client, facts.context, seal.stream));
  return !current.reason && current.dayKey === facts.quota.dayKey && current.total === facts.quota.total
    && same(current.breakdown, facts.quotaBreakdown) && current.vip.vipLevel === seal.vipLevel
    && current.cards.sourceAt === seal.cardSourceAt && same(current.cards.cards, seal.cards) ? seal : null;
}

function targetsOf(facts) {
  if (!Array.isArray(facts?.pirates) || !Array.isArray(facts?.records)) return [];
  return facts.pirates.map(row => {
    const maxKilledLevel = facts.records.find(record => record.type === row.type)?.maxKilledLevel ?? 0;
    return { ...row, maxKilledLevel, levelRelation: row.level > maxKilledLevel ? 'FIRST_KILL_REQUIRED'
      : row.level < maxKilledLevel ? 'LOWER' : 'HIGHEST' };
  });
}

function candidate(facts, parameters, moduleConfig, seal) {
  const target = targetsOf(facts).find(row => row.uid === parameters.uid && row.cityId === parameters.cityId)
    ?? { uid: parameters.uid ?? null, cityId: parameters.cityId ?? null };
  let blockedReason = null;
  if (!parameters.uid || !parameters.cityId) blockedReason = 'EXPLICIT_PIRATE_AND_CITY_REQUIRED';
  else if (!moduleConfig.enabled) blockedReason = 'PIRATE_SWEEP_MODULE_DISABLED';
  else if (!seal) blockedReason = facts?.quota?.reason ?? 'PIRATE_FRESH_AUTHORITY_NOT_CONFIRMED';
  else if (!seal.protocolKnown) blockedReason = 'PIRATE_SWEEP_PROTOCOL_CONTRACT_UNKNOWN';
  else if (!target.levelRelation) blockedReason = 'PIRATE_TARGET_UID_AND_CITY_NOT_CURRENT';
  else if (target.levelRelation === 'FIRST_KILL_REQUIRED') blockedReason = 'PIRATE_FIRST_KILL_REQUIRED';
  else if (target.levelRelation === 'LOWER' && parameters.allowLowerLevel !== true) blockedReason = 'PIRATE_LOWER_LEVEL_CONFIRMATION_REQUIRED';
  else if (facts.quota.remaining <= 0) blockedReason = 'PIRATE_SWEEP_QUOTA_EXHAUSTED';
  const beforeState = { target, quota: facts?.quota ?? unknownQuota('PIRATE_FRESH_AUTHORITY_NOT_CONFIRMED'), quotaBreakdown: facts?.quotaBreakdown ?? null };
  const expectedState = blockedReason ? null : { target, quota: { ...facts.quota, used: facts.quota.used + 1, remaining: facts.quota.remaining - 1 },
    quotaBreakdown: facts.quotaBreakdown };
  const budgetClaims = { resources: [], quotas: blockedReason ? [] : [{ id: moduleId + ':' + facts.quota.dayKey, num: 1 }],
    uids: blockedReason ? [] : [{ type: 'pirate', id: String(target.uid) }] };
  const identity = hash({ parameters, beforeState, expectedState, budgetClaims, context: facts?.context, pirates: facts?.pirates,
    records: facts?.records, entitlements: seal ? { vipLevel: seal.vipLevel, cards: seal.cards } : null, config: seal?.config });
  return {
    module: moduleId, capabilityId, actionType: 'SWEEP', actionId: moduleId + ':' + identity, identity,
    target: copy(target), parameters: copy(parameters), label: '扫荡海盗 ' + (target.uid ?? '未选择'),
    costs: [], costSource, budgetClaims, beforeState: copy(beforeState), expectedState: copy(expectedState),
    executable: blockedReason === null, blockedReason, decision: blockedReason ? 'BLOCKED' : 'READY',
    ...(!blockedReason ? { action: { request, response: null, body: { uid: target.uid, cityId: target.cityId } } } : {}),
  };
}

export function viewPirateSweep(facts, { config, parameters = facts?.parameters ?? {}, moduleConfig = PIRATE_SWEEP_DEFAULT_CONFIG } = {}) {
  parameters = validatePirateSweepParameters(parameters);
  moduleConfig = validatePirateSweepConfig(moduleConfig);
  const seal = liveAuthority(facts, config);
  const row = candidate(facts, parameters, moduleConfig, seal);
  const candidates = parameters.uid ? [row] : [];
  const quota = seal || facts?.quota?.reason ? facts.quota : unknownQuota('PIRATE_FRESH_AUTHORITY_NOT_CONFIRMED', facts?.quota);
  return { module: moduleId, quota: copy(quota), quotaBreakdown: copy(facts?.quotaBreakdown ?? null),
    targets: targetsOf(facts), candidates, blocked: candidates.filter(row => !row.executable),
    notes: [...new Set([quota.reason, row.blockedReason].filter(Boolean))], evidence: PIRATE_SWEEP_OPERATION_EVIDENCE };
}

export function planPirateSweep(facts, { config, parameters = facts?.parameters ?? {}, moduleConfig = PIRATE_SWEEP_DEFAULT_CONFIG,
  selections, ledger = new ResourceLedger(facts?.stockReliable === true ? facts.stock : null) } = {}) {
  parameters = validatePirateSweepParameters(parameters);
  moduleConfig = validatePirateSweepConfig(moduleConfig);
  const seal = same(parameters, facts?.parameters) ? liveAuthority(facts, config) : null;
  const row = candidate(facts, parameters, moduleConfig, seal);
  if (!row.executable) return { module: moduleId, actions: [], notes: [row.blockedReason] };
  if (selections && !selections.includes(row.actionId)) return { module: moduleId, actions: [], notes: [] };
  if (!ledger.canReserve(row.costs)) return { module: moduleId, actions: [], notes: ['PIRATE_RESOURCE_AUTHORITY_UNKNOWN'] };
  ledger.reserve(row.costs);
  return { module: moduleId, actions: [row], notes: [] };
}

export function verifyPirateSweep(operation, before, after, response) {
  const fail = reason => ({ confirmed: false, reason });
  if (response !== null && response !== undefined) return fail('PIRATE_UNEXPECTED_NAMED_RESPONSE');
  let parameters;
  try { parameters = validatePirateSweepParameters(operation?.parameters); }
  catch { return fail('PIRATE_OPERATION_PARAMETERS_INVALID'); }
  const first = intact(before), next = intact(after);
  if (!first || !next || before === after || first.client !== next.client || first.stream !== next.stream
      || next.startedAt < first.completedAt || next.lastOrder <= first.lastOrder
      || !same(before.context, after.context) || !samePirateQuotaContext(before.context, after.context)
      || !same(first.config, next.config) || !same(parameters, before.parameters) || !same(parameters, after.parameters)
      || !liveAuthority(after, { tables: next.config })) return fail('PIRATE_INDEPENDENT_FRESH_REREAD_REQUIRED');
  const contract = candidate(before, parameters, { enabled: true }, first);
  if (!contract.executable || ['module', 'capabilityId', 'actionId', 'actionType', 'target', 'parameters', 'identity', 'costs',
    'costSource', 'budgetClaims', 'beforeState', 'expectedState', 'action'].some(key => !same(operation[key], contract[key])))
    return fail('PIRATE_OPERATION_CONTRACT_MISMATCH');
  if (after.quota.dayKey !== before.quota.dayKey || after.quota.total !== before.quota.total
      || next.vipLevel !== first.vipLevel || !same(next.cards, first.cards) || !same(before.quotaBreakdown, after.quotaBreakdown))
    return fail('PIRATE_QUOTA_DAY_OR_ENTITLEMENTS_CHANGED');
  if (!same(before.pirates, after.pirates) || !same(before.records, after.records)) return fail('PIRATE_POOL_OR_KILL_RECORDS_CHANGED');
  const counterPushes = next.counterChanges - first.counterChanges;
  if (first.otherChanges !== next.otherChanges || counterPushes > 1 || counterPushes === 1
      && (next.lastCounter?.order <= first.lastOrder || next.lastCounter?.order >= next.lastOrder || next.lastCounter?.value !== after.quota.used))
    return fail('PIRATE_CONCURRENT_STREAM_CHANGE');
  if (after.quota.used !== before.quota.used + 1) return fail('PIRATE_EXACT_DAILY_COUNTER_INCREMENT_NOT_CONFIRMED');
  return { confirmed: true, reason: '同一游戏日完整复读确认扫荡次数恰好加一，海盗池及首杀记录保持一致；奖励归属未确认',
    afterState: copy(contract.expectedState), responseEvidence: { namedResponse: 'NONE', reward: 'UNATTRIBUTED' } };
}

export const pirateSweepModule = Object.freeze({
  id: moduleId, label: '海盗单次扫荡', capabilities: Object.freeze([capabilityId]), defaultConfig: PIRATE_SWEEP_DEFAULT_CONFIG,
  validateConfig: validatePirateSweepConfig, validateParameters: validatePirateSweepParameters,
  survey: surveyPirateSweep, view: viewPirateSweep, plan: planPirateSweep, verify: verifyPirateSweep,
  dependencyVersions: pirateSweepDependencyVersions,
});
