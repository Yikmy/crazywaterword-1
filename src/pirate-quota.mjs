// W12: read the fixed WeChat client quota model without treating it as a permit.
import { trustedGameDay } from './state-facts.mjs';

export const PIRATE_QUOTA_EVIDENCE = Object.freeze({
  profile: 'V76_WECHAT_NON_NATIVE',
  packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  entrySha256: 'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',
  configSha256: '0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762',
  clockOffsetsMinutes: Object.freeze([480, 540]),
  localResetUncertaintyMs: 10002,
  langUtil: Object.freeze({ byteOffset: 3969202, sha256: 'add1d8bb68e014e7c99c40930ae6979669e47133dec14ec7a6f89cd9ebbeeb17' }),
  bsMain: Object.freeze({ byteOffset: 848023, sha256: '8600aa02b8d55f7f8845ccdead9c3551d99a5912ed481309ffd8091defd1aade' }),
  gameStart: Object.freeze({ byteOffset: 2983436, sha256: 'ad2a0a776c45d1e710f68b764dfab7a39134a746e4d75ea071204ad745b4633f' }),
  timerManager: Object.freeze({ byteOffset: 6475238, sha256: '78e62f0b6acc754fe2939cb25577b15ff2e156d1cfbecb25bcfcffcdbe019664' }),
  dailyReset: Object.freeze({ byteOffset: 1639990, resetPiratesByteOffset: 1641075, sha256: '9bc03722c1ce8f44ac7b51e7f4c48f78313ec25c850df9d5478eca18f9357e32' }),
  quotaFormulaByteOffset: 5283471,
  vipEffectByteOffset: 7240251,
  monthCardEffectByteOffset: 4683091,
  realGame: 'REAL_UNVERIFIED',
});

export const ownQuotaValue = (value, key) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
const own = ownQuotaValue;
export const pirateQuotaUint = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const uint = pirateQuotaUint;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const exactId = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) < (1n << 63n);
const safeTime = value => Number.isSafeInteger(value) && value >= 0;
const bound = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const identityKeys = ['accountId', 'generation', 'connectionId'];
export const hasPirateQuotaContext = value => text(own(value, 'accountId')) && text(own(value, 'connectionId'))
  && safeTime(own(value, 'generation'));
export const samePirateQuotaContext = (a, b) => hasPirateQuotaContext(a) && hasPirateQuotaContext(b)
  && identityKeys.every(key => own(a, key) === own(b, key));
export const capturePirateQuotaContext = client => Object.fromEntries(identityKeys.map(key => [key, own(client?.factContext, key)]));
const role = value => exactId(own(value, 'playerId')) && exactId(own(value, 'worldId'));
const sameRole = (a, b) => role(a) && role(b) && own(a, 'playerId') === own(b, 'playerId') && own(a, 'worldId') === own(b, 'worldId');
const dense = (value, max = 10000) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
  && value.length <= max && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, i))
    .every(descriptor => descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));
const cardId = Object.freeze({ 1: '普通月卡', 2: '高级月卡' });
const effect = '野怪扫荡次数';
const configValue = (config, table) => own(own(own(config, 'tables'), table), 'data');
const unknownCards = reason => ({ status: 'UNKNOWN', reliable: false, cards: null, source: null, sourceAt: null, reason });

function readCardRows(rows) {
  if (!dense(rows, 2)) return null;
  const result = [], seen = new Set();
  for (const row of rows) {
    const type = own(row, 'type'), endTime = own(row, 'endTime');
    if (![1, 2].includes(type) || seen.has(type) || endTime !== -1 && !uint(endTime)) return null;
    seen.add(type); result.push({ type, endTime });
  }
  return result.sort((a, b) => a.type - b.type);
}

export function observePirateMonthCards(client, context, now = Date.now()) {
  if (!samePirateQuotaContext(client?.factContext, context)) return unknownCards('MONTH_CARD_COLLECTION_CONTEXT_CHANGED_OR_UNKNOWN');
  let value;
  try {
    if (typeof client?.readMonthCards !== 'function') return unknownCards('MONTH_CARD_TRACKER_UNAVAILABLE');
    value = client.readMonthCards();
  } catch { return unknownCards('MONTH_CARD_TRACKER_READ_FAILED'); }
  if (own(value, 'status') !== 'CURRENT' || own(value, 'reliable') !== true)
    return unknownCards(text(own(value, 'reason')) ? value.reason : 'MONTH_CARD_UNKNOWN');
  const cards = readCardRows(own(value, 'cards')), sourceAt = own(value, 'sourceAt');
  if (cards === null || own(value, 'source') !== 'MonthCardResponse' || !safeTime(now) || !safeTime(sourceAt) || sourceAt > now
      || !role(value) || !samePirateQuotaContext(value, context) || !samePirateQuotaContext(client.factContext, context))
    return unknownCards('MONTH_CARD_TRACKER_CONTEXT_OR_VALUE_INVALID');
  return { status: 'OBSERVED', reliable: true, cards, source: 'MonthCardResponse', sourceAt, reason: null,
    ...context, playerId: value.playerId, worldId: value.worldId, observedAt: now };
}
function clockBounds(clock) {
  if (own(clock, 'reliable') !== true || ![own(clock, 'earliestMs'), own(clock, 'nowMs'), own(clock, 'latestMs')].every(bound)
      || clock.earliestMs > clock.nowMs || clock.nowMs > clock.latestMs) return null;
  return { reliable: true, earliestMs: clock.earliestMs, nowMs: clock.nowMs, latestMs: clock.latestMs };
}
export function observePirateQuotaClock(client, context) {
  if (!samePirateQuotaContext(client?.factContext, context)) return null;
  let raw;
  try { raw = client.gameClock?.read(context); } catch { return null; }
  const clock = clockBounds(raw);
  if (!clock || own(raw, 'status') !== 'TRUSTED' || own(raw, 'source') !== 'PingResponse.serverTimestamp'
      || own(raw, 'accountId') !== context.accountId || own(raw, 'generation') !== context.generation
      || !samePirateQuotaContext(client.factContext, context)) return null;
  return { ...clock, ...context, observedAt: Date.now() };
}

export function pirateGameDay(clock, profile = PIRATE_QUOTA_EVIDENCE.profile) {
  if (profile !== PIRATE_QUOTA_EVIDENCE.profile) return { dayKey: null, reason: 'PIRATE_DAY_PROFILE_UNSUPPORTED' };
  const bounded = clockBounds(clock);
  if (!bounded) return { dayKey: null, reason: 'PIRATE_CLOCK_UNKNOWN' };
  const days = PIRATE_QUOTA_EVIDENCE.clockOffsetsMinutes.map(utcOffsetMinutes => trustedGameDay(bounded, { utcOffsetMinutes }));
  if (!days.every(day => day.reliable === true)) return { dayKey: null, reason: 'PIRATE_DAY_BOUNDARY_UNCERTAIN' };
  if (!days.every(day => day.dayKey === days[0].dayKey)) return { dayKey: null, reason: 'PIRATE_DAY_POLICIES_DISAGREE' };
  return { dayKey: days[0].dayKey, reason: null };
}

// DailyReset schedules end-of-day +2ms and applies up to 10s of client jitter.
// A count observed immediately after either candidate midnight is inconclusive.
export function pirateCounterDay(clock) {
  const bounded = clockBounds(clock);
  return pirateGameDay(bounded ? { ...bounded, earliestMs: bounded.earliestMs - PIRATE_QUOTA_EVIDENCE.localResetUncertaintyMs } : null);
}

function matching(rows, key, value) {
  if (!dense(rows)) return null;
  const found = rows.filter(row => own(row, key) === value);
  return found.length === 1 ? found[0] : null;
}
function countEffect(rows, mode) {
  if (!dense(rows) || !rows.every(pair => dense(pair, 2) && pair.length === 2 && text(pair[0])
      && typeof pair[1] === 'number' && Number.isFinite(pair[1]))) return null;
  const matches = rows.filter(row => row[0] === effect);
  if (mode === 'first' && matches.length > 1 || !matches.every(row => uint(row[1]))) return null;
  const total = matches.reduce((sum, row) => sum + row[1], 0);
  return uint(total) ? total : null;
}
export function calculatePirateQuota({ config, vipLevel, cards, clock } = {}) {
  const baseRow = matching(configValue(config, 'PirateParamCfg'), 'paramName', '每日野怪扫荡次数');
  const base = own(baseRow, 'paramValue');
  if (!uint(base)) return { total: null, reason: 'PIRATE_BASE_QUOTA_UNKNOWN' };
  const vipRow = uint(vipLevel) ? matching(configValue(config, 'VipLevelCfg'), 'level', vipLevel) : null;
  const vip = countEffect(own(vipRow, 'effects'), 'first');
  if (vip === null) return { total: null, reason: 'PIRATE_VIP_EFFECT_UNKNOWN' };
  const parsed = readCardRows(cards), bounded = clockBounds(clock);
  if (parsed === null) return { total: null, reason: 'PIRATE_MONTH_CARD_AUTHORITY_UNKNOWN' };
  const byCard = [];
  let monthCards = 0;
  for (const { type, endTime } of parsed) {
    if (endTime > 0 && !bounded) return { total: null, reason: 'PIRATE_CLOCK_UNKNOWN' };
    const expiryMs = endTime * 1000;
    if (endTime > 0 && bounded.earliestMs < expiryMs && bounded.latestMs >= expiryMs)
      return { total: null, reason: 'PIRATE_MONTH_CARD_EXPIRY_UNCERTAIN' };
    const active = endTime === -1 || endTime > 0 && bounded.latestMs < expiryMs;
    const row = matching(configValue(config, 'MonthCardCfg'), 'id', cardId[type]);
    const bonus = active ? countEffect(own(row, 'effectList'), 'sum') : 0;
    if (bonus === null) return { total: null, reason: 'PIRATE_MONTH_CARD_EFFECT_UNKNOWN' };
    monthCards += bonus; byCard.push({ type, endTime, active, bonus });
  }
  const total = base + vip + monthCards;
  return uint(total) ? { total, reason: null, breakdown: { base, vip, monthCards, byCard } }
    : { total: null, reason: 'PIRATE_QUOTA_OVERFLOW' };
}

// A persisted snapshot can render this historical calculation. Its facts are
// not a substitute for a future write plan's live authority and fresh reread.
export function observedPirateQuota(facts, config, used) {
  const unavailable = reason => ({ totalSweeps: null, remainingSweeps: null, quotaStatus: 'UNKNOWN', quotaReason: reason, quotaDay: null, quotaBreakdown: null });
  const vip = own(facts, 'vipLevel'), cards = own(facts, 'monthCards'), clock = own(facts, 'pirateClock');
  if (!config || own(vip, 'status') !== 'OBSERVED' || own(vip, 'reliable') !== true
      || own(cards, 'status') !== 'OBSERVED' || own(cards, 'reliable') !== true
      || !['LoginResponse.playerInfo.vip', 'SCVipUpdate'].includes(own(vip, 'source'))
      || own(cards, 'source') !== 'MonthCardResponse'
      || ![own(vip, 'observedAt'), own(cards, 'observedAt'), own(cards, 'sourceAt')].every(safeTime)
      || cards.sourceAt > cards.observedAt
      || !samePirateQuotaContext(vip, cards) || !sameRole(vip, cards)) return unavailable('TOTAL_QUOTA_AUTHORITY_UNAVAILABLE');
  const sameClock = samePirateQuotaContext(vip, clock);
  const total = calculatePirateQuota({ config, vipLevel: own(vip, 'vipLevel'), cards: own(cards, 'cards'), clock: sameClock ? clock : null });
  if (total.total === null) return unavailable(total.reason);
  const day = sameClock ? pirateCounterDay(clock) : { dayKey: null, reason: 'PIRATE_CLOCK_UNKNOWN' };
  const start = own(facts, 'pirateReadStartClock'), end = own(facts, 'pirateReadEndClock');
  const confirmedDay = day.dayKey && samePirateQuotaContext(clock, start) && samePirateQuotaContext(clock, end)
    && pirateCounterDay(start).dayKey === day.dayKey && pirateCounterDay(end).dayKey === day.dayKey
    && [own(start, 'observedAt'), own(end, 'observedAt'), own(clock, 'observedAt')].every(safeTime)
    && start.observedAt <= end.observedAt && end.observedAt <= clock.observedAt
    && clock.observedAt - start.observedAt <= 30000;
  const knownRemaining = confirmedDay && uint(used) && used <= total.total;
  return { totalSweeps: total.total, remainingSweeps: knownRemaining ? total.total - used : null,
    quotaStatus: knownRemaining ? 'OBSERVED' : 'TOTAL_OBSERVED',
    quotaReason: knownRemaining ? null : !confirmedDay ? day.reason ?? 'PIRATE_USED_COUNT_DAY_NOT_CONFIRMED'
      : !uint(used) ? 'PIRATE_USED_COUNT_UNKNOWN' : 'PIRATE_USED_COUNT_EXCEEDS_TOTAL',
    quotaDay: confirmedDay ? day.dayKey : null, quotaBreakdown: total.breakdown };
}