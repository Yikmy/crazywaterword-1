import { performance } from 'node:perf_hooks';
import { toSnapshotJson } from './game.mjs';

const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const time = value => Number.isSafeInteger(value) && value >= 0;
const generationOf = value => Number.isSafeInteger(value) && value >= 0;
const duration = value => Number.isFinite(value) && value >= 0;
const exactTime = value => {
  const normalized = toSnapshotJson(value);
  return time(normalized) ? normalized : null;
};
const validScope = scope => scope && typeof scope === 'object' && !Array.isArray(scope)
  && Object.keys(scope).every(key => ['kind', 'key'].includes(key))
  && ['ACCOUNT', 'ENTITY', 'CURRENT_RESPONSE_ONLY'].includes(scope.kind)
  && (scope.kind === 'ACCOUNT' ? scope.key === undefined : text(scope.key));
const sameScope = (a, b) => validScope(a) && validScope(b) && a.kind === b.kind && a.key === b.key;
const unknown = reason => ({ status: 'UNKNOWN', reliable: false, reason });

/** Account/generation are session identity, not credentials. sourceAt/serverTime use epoch milliseconds.
 * The adapter must establish reliable from its domain parser; a typed response alone is insufficient.
 * Copying a cached fact must retain its original sourceAt, source, generation and scope.
 */
export function createStateFact(value, { accountId, generation, source, sourceAt, serverTime = null, scope, reliable = false } = {}) {
  return {
    value: toSnapshotJson(value),
    provenance: {
      accountId, generation, source, sourceAt, serverTime: time(serverTime) ? serverTime : null,
      scope: validScope(scope) ? { ...scope } : null,
      reliability: reliable === true ? 'RELIABLE' : 'UNKNOWN',
    },
  };
}

/** This policy never promotes a current-response observation to complete account/world authority. */
export function factsFreshnessPolicy(fact, { accountId, generation, now = Date.now(), maxAgeMs, scope } = {}) {
  const p = fact?.provenance;
  if (!text(accountId) || !generationOf(generation)) return unknown('CONTEXT_UNKNOWN');
  if (!p || !text(p.accountId) || !generationOf(p.generation)) return unknown('PROVENANCE_UNKNOWN');
  if (p.accountId !== accountId) return unknown('ACCOUNT_MISMATCH');
  if (p.generation !== generation) return unknown('GENERATION_MISMATCH');
  if (!text(p.source) || !validScope(p.scope)) return unknown('SOURCE_UNKNOWN');
  if (scope !== undefined && !sameScope(p.scope, scope)) return unknown('SCOPE_MISMATCH');
  if (p.reliability !== 'RELIABLE') return unknown('FACT_UNRELIABLE');
  if (!time(now) || !time(p.sourceAt) || !duration(maxAgeMs)) return unknown('FRESHNESS_UNKNOWN');
  const ageMs = now - p.sourceAt;
  if (ageMs < 0) return unknown('SOURCE_IN_FUTURE');
  if (ageMs > maxAgeMs) return { ...unknown('STALE'), ageMs };
  return { status: 'FRESH', reliable: true, ageMs, source: p.source, sourceAt: p.sourceAt, serverTime: p.serverTime, scope: { ...p.scope } };
}

/** A per-session, monotonic clock estimator. It does not change transport heartbeat thresholds.
 * Call markPing at dispatch; observePong only for the matching decoded PingResponse.
 * A persisted offset or GameClient's initial zero offset is deliberately not an input.
 */
export function trustedGameClock({ accountId, generation, wallNow = Date.now, monotonicNow = () => performance.now(),
  maxRoundTripMs = 3000, maxSampleAgeMs = 30000, maxUncertaintyMs = 2000, maxWallDriftMs = 250,
  serverResolutionMs = 1, driftPpm = 50 } = {}) {
  if (!text(accountId) || !generationOf(generation)) throw new TypeError('Trusted clock requires account and session generation');
  if (![maxRoundTripMs, maxSampleAgeMs, maxUncertaintyMs, maxWallDriftMs, serverResolutionMs, driftPpm].every(duration)
      || typeof wallNow !== 'function' || typeof monotonicNow !== 'function') throw new TypeError('Invalid trusted clock policy');
  let pending = null, sample = null, lastMarked = null, lastReason = 'NO_SERVER_SAMPLE';
  const invalidate = reason => { sample = null; lastReason = reason; return unknown(reason); };
  function markPing(clientTimestamp) {
    const wall = wallNow(), mono = monotonicNow();
    if (!time(clientTimestamp) || !time(wall) || !duration(mono) || Math.abs(clientTimestamp - wall) > maxWallDriftMs) {
      pending = null;
      return invalidate('PING_TIMESTAMP_INVALID');
    }
    if (clientTimestamp === lastMarked) { pending = null; return invalidate('PING_TIMESTAMP_REUSED'); }
    lastMarked = clientTimestamp;
    pending = { clientTimestamp, wall, mono };
    return { status: 'PENDING', reliable: false };
  }
  function observePong(body) {
    const echoed = Object.hasOwn(body ?? {}, 'clientTimestamp') ? exactTime(body.clientTimestamp) : null;
    const server = Object.hasOwn(body ?? {}, 'serverTimestamp') ? exactTime(body.serverTimestamp) : null;
    // Unmatched/late pongs cannot poison or replace a current matching sample.
    if (!pending || echoed !== pending.clientTimestamp) return unknown('PONG_UNCORRELATED');
    const sent = pending;
    pending = null;
    const wall = wallNow(), mono = monotonicNow(), rttMs = mono - sent.mono, wallElapsed = wall - sent.wall;
    if (server === null || !time(wall) || !duration(mono) || !duration(rttMs)) return invalidate('PONG_TIMESTAMP_INVALID');
    if (Math.abs(wallElapsed - rttMs) > maxWallDriftMs) return invalidate('WALL_CLOCK_CHANGED');
    if (rttMs > maxRoundTripMs) return invalidate('ROUND_TRIP_TOO_LONG');
    const uncertaintyMs = rttMs / 2 + serverResolutionMs;
    if (uncertaintyMs > maxUncertaintyMs) return invalidate('CLOCK_UNCERTAINTY');
    sample = { serverAtReceipt: server + rttMs / 2, wall, mono, uncertaintyMs, rttMs };
    lastReason = null;
    return read();
  }
  function read(context = {}) {
    if ((context.accountId !== undefined && context.accountId !== accountId)
        || (context.generation !== undefined && context.generation !== generation)) return { ...unknown('CLOCK_CONTEXT_MISMATCH'), nowMs: null };
    if (!sample) return { ...unknown(lastReason), nowMs: null };
    const wall = wallNow(), mono = monotonicNow(), ageMs = mono - sample.mono;
    if (!time(wall) || !duration(mono) || !duration(ageMs)) return { ...invalidate('MONOTONIC_CLOCK_CHANGED'), nowMs: null };
    if (Math.abs(wall - sample.wall - ageMs) > maxWallDriftMs) return { ...invalidate('WALL_CLOCK_CHANGED'), nowMs: null };
    if (ageMs > maxSampleAgeMs) return { ...unknown('CLOCK_STALE'), nowMs: null, ageMs };
    const uncertaintyMs = sample.uncertaintyMs + ageMs * driftPpm / 1000000;
    if (uncertaintyMs > maxUncertaintyMs) return { ...unknown('CLOCK_UNCERTAINTY'), nowMs: null, ageMs };
    const nowMs = sample.serverAtReceipt + ageMs;
    if (!Number.isFinite(nowMs) || nowMs + uncertaintyMs > Number.MAX_SAFE_INTEGER) return { ...invalidate('SERVER_TIME_UNSAFE'), nowMs: null };
    return { status: 'TRUSTED', reliable: true, accountId, generation, nowMs, earliestMs: nowMs - uncertaintyMs,
      latestMs: nowMs + uncertaintyMs, uncertaintyMs, roundTripMs: sample.rttMs, sourceAt: sample.wall,
      ageMs, source: 'PingResponse.serverTimestamp' };
  }
  return { markPing, observePong, read, reset() { pending = null; lastMarked = null; return invalidate('CLOCK_RESET'); } };
}

/** Explicit game timezone/day boundary; uncertain midnight never creates an invented daily quota. */
export function trustedGameDay(clock, { utcOffsetMinutes, boundaryHour = 0 } = {}) {
  if (clock?.reliable !== true || !Number.isFinite(clock.earliestMs) || !Number.isFinite(clock.latestMs)
      || clock.earliestMs > clock.latestMs) return unknown('CLOCK_UNKNOWN');
  if (!Number.isInteger(utcOffsetMinutes) || Math.abs(utcOffsetMinutes) > 14 * 60
      || !Number.isInteger(boundaryHour) || boundaryHour < 0 || boundaryHour > 23) return unknown('DAY_BOUNDARY_UNKNOWN');
  const shift = utcOffsetMinutes * 60000 - boundaryHour * 3600000;
  const first = Math.floor((clock.earliestMs + shift) / 86400000), last = Math.floor((clock.latestMs + shift) / 86400000);
  if (first !== last) return unknown('DAY_BOUNDARY_UNCERTAIN');
  const date = new Date(first * 86400000);
  if (Number.isNaN(date.getTime())) return unknown('DAY_BOUNDARY_UNKNOWN');
  return { status: 'TRUSTED', reliable: true, dayKey: date.toISOString().slice(0, 10), utcOffsetMinutes, boundaryHour };
}

// Domain surveys consume only this per-session trusted clock, never the legacy
// serverClockOffsetMs (whose initial zero is not evidence of server time).
export function readGameTime(client) {
  let clock;
  try { clock = client?.gameClock?.read?.(); } catch {}
  const valid = clock?.status === 'TRUSTED' && clock.reliable === true
    && [clock.earliestMs, clock.nowMs, clock.latestMs].every(value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER)
    && clock.earliestMs <= clock.nowMs && clock.nowMs <= clock.latestMs;
  if (!valid) return { now: null, nowEarliest: null, nowLatest: null,
    gameTime: { status: 'UNKNOWN', reliable: false, reason: 'TRUSTED_GAME_CLOCK_UNAVAILABLE', nowMs: null, earliestMs: null, latestMs: null } };
  const gameTime = { status: 'TRUSTED', reliable: true, nowMs: clock.nowMs, earliestMs: clock.earliestMs, latestMs: clock.latestMs,
    accountId: clock.accountId ?? null, generation: clock.generation ?? null, source: clock.source ?? 'PingResponse.serverTimestamp' };
  return { now: Math.floor(clock.nowMs / 1000), nowEarliest: Math.floor(clock.earliestMs / 1000),
    nowLatest: Math.ceil(clock.latestMs / 1000), gameTime };
}

// Pure domain tests may supply explicit seconds without survey provenance.
// Once a survey carries gameTime, unknown or inconsistent clock evidence cannot
// be replaced by an edited now or an old offset.
export function gameTimeBounds(facts) {
  if (!time(facts?.now)) return { now: null, earliest: null, latest: null };
  if (!Object.hasOwn(facts, 'gameTime')) return { now: facts.now, earliest: facts.now, latest: facts.now };
  const gameTime = facts.gameTime;
  if (gameTime?.status !== 'TRUSTED' || gameTime.reliable !== true ||
      ![gameTime.earliestMs, gameTime.nowMs, gameTime.latestMs].every(value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) ||
      gameTime.earliestMs > gameTime.nowMs || gameTime.nowMs > gameTime.latestMs || Math.floor(gameTime.nowMs / 1000) !== facts.now)
    return { now: null, earliest: null, latest: null };
  return { now: facts.now, earliest: Math.floor(gameTime.earliestMs / 1000), latest: Math.ceil(gameTime.latestMs / 1000) };
}
