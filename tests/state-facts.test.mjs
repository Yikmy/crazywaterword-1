import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol } from '../src/proto.mjs';
import { createCodec } from '../src/codec.mjs';
import { createStateFact, factsFreshnessPolicy, trustedGameClock, trustedGameDay } from '../src/state-facts.mjs';

const account = { accountId: 'synthetic-account-a', generation: 7 };
const provenance = { ...account, source: 'WorldInfoResponse.fleets', sourceAt: 1000, reliable: true, scope: { kind: 'CURRENT_RESPONSE_ONLY', key: 'screen:0,0' } };
const check = (fact, options = {}) => factsFreshnessPolicy(fact, { ...account, now: 1100, maxAgeMs: 1000, ...options });
function fakeClock(options = {}) {
  let wall = 1700000000000, mono = 10;
  const clock = trustedGameClock({ ...account, wallNow: () => wall, monotonicNow: () => mono, ...options });
  return { clock, wall: () => wall, advance(ms) { wall += ms; mono += ms; }, jump(ms) { wall += ms; }, rewindMono(ms) { mono -= ms; },
    ping() { const timestamp = wall; clock.markPing(timestamp); return timestamp; } };
}
const pong = (f, { rtt = 100, server = 1800000000000 } = {}) => { const clientTimestamp = f.ping(); f.advance(rtt); return f.clock.observePong({ clientTimestamp, serverTimestamp: server }); };

test('facts preserve exact int64, explicit false/zero and copy their value without claiming global scope', () => {
  const value = { owner: { low: 1, high: 2097152, unsigned: false }, enabled: false, remaining: 0 };
  const fact = createStateFact(value, provenance);
  value.remaining = 99;
  assert.deepEqual(fact.value, { owner: '9007199254740993', enabled: false, remaining: 0 });
  assert.equal(check(fact).status, 'FRESH');
  assert.equal(check(fact, { scope: { kind: 'ACCOUNT' } }).reason, 'SCOPE_MISMATCH');
  assert.equal(check(fact, { scope: { kind: 'CURRENT_RESPONSE_ONLY', key: 'screen:1,1' } }).reason, 'SCOPE_MISMATCH');
});

test('facts reject cross-account, retired generation, missing reliability and absent provenance', () => {
  const fact = createStateFact([], provenance);
  assert.equal(check(fact, { accountId: 'synthetic-account-b' }).reason, 'ACCOUNT_MISMATCH');
  assert.equal(check(fact, { generation: 8 }).reason, 'GENERATION_MISMATCH');
  assert.equal(check(createStateFact([], { ...provenance, reliable: false })).reason, 'FACT_UNRELIABLE');
  assert.equal(check({ value: [] }).reason, 'PROVENANCE_UNKNOWN');
  assert.equal(check(createStateFact([], { ...provenance, source: '' })).reason, 'SOURCE_UNKNOWN');
});

test('freshness does not renew a cached source or accept future/invalid timestamps', () => {
  const fact = createStateFact([], provenance);
  assert.equal(check(structuredClone(fact), { now: 2001 }).reason, 'STALE');
  assert.equal(check(fact, { now: 999 }).reason, 'SOURCE_IN_FUTURE');
  assert.equal(check(fact, { maxAgeMs: undefined }).reason, 'FRESHNESS_UNKNOWN');
  assert.equal(check(fact, { now: NaN }).reason, 'FRESHNESS_UNKNOWN');
  assert.equal(check(createStateFact([], { ...provenance, sourceAt: '1000' })).reason, 'FRESHNESS_UNKNOWN');
  assert.equal(check(fact, { now: 2000 }).status, 'FRESH');
});

test('clock is UNKNOWN before a correlated server sample and never uses an initial zero offset', () => {
  const f = fakeClock();
  assert.equal(f.clock.read().reason, 'NO_SERVER_SAMPLE');
  assert.equal(f.clock.read().nowMs, null);
  assert.equal(f.clock.observePong({ clientTimestamp: f.wall(), serverTimestamp: f.wall() }).reason, 'PONG_UNCORRELATED');
  assert.equal(f.clock.read().reliable, false);
});

test('actual local PingResponse codec correlates exact wire timestamps without any client or socket', () => {
  const codec = createCodec(loadProtocol()), f = fakeClock(), sent = f.ping();
  f.advance(100);
  const body = codec.decode(codec.encode('PingResponse', 0, { clientTimestamp: sent, serverTimestamp: 1800000000000 })).body;
  const first = f.clock.observePong(body);
  assert.equal(first.status, 'TRUSTED');
  assert.equal(first.nowMs, 1800000000050);
  assert.equal(first.earliestMs, 1799999999999);
  assert.equal(first.latestMs, 1800000000101);
  f.advance(1000);
  assert.equal(f.clock.read().nowMs, 1800000001050);
  assert.equal(f.clock.read({ accountId: 'other' }).reason, 'CLOCK_CONTEXT_MISMATCH');
  assert.equal(f.clock.read({ generation: 8 }).reason, 'CLOCK_CONTEXT_MISMATCH');
});

test('wrong or late Pong cannot consume the pending match or replace a trusted sample', () => {
  const f = fakeClock();
  const old = f.ping(); f.advance(10); const current = f.ping(); f.advance(20);
  assert.equal(f.clock.observePong({ clientTimestamp: old, serverTimestamp: 1 }).reason, 'PONG_UNCORRELATED');
  assert.equal(f.clock.observePong({ clientTimestamp: current, serverTimestamp: 1800000000000 }).status, 'TRUSTED');
  const now = f.clock.read().nowMs;
  assert.equal(f.clock.observePong({ clientTimestamp: old, serverTimestamp: 1 }).reason, 'PONG_UNCORRELATED');
  assert.equal(f.clock.read().nowMs, now);
});

test('clock rejects event-loop delayed first Pong, unsafe int64 time and missing server timestamps', () => {
  for (const [body, expected] of [[{ serverTimestamp: '9007199254740993' }, 'PONG_TIMESTAMP_INVALID'], [{}, 'PONG_TIMESTAMP_INVALID']]) {
    const f = fakeClock(), sent = f.ping(); f.advance(10);
    assert.equal(f.clock.observePong({ clientTimestamp: sent, ...body }).reason, expected);
    assert.equal(f.clock.read().nowMs, null);
  }
  const delayed = fakeClock();
  assert.equal(pong(delayed, { rtt: 4000 }).reason, 'ROUND_TRIP_TOO_LONG');
  assert.equal(delayed.clock.read().reliable, false);
});

test('clock detects wall-clock jumps during round trip and after a sample; reset requires a new sample', () => {
  const first = fakeClock(), sent = first.ping(); first.advance(100); first.jump(1000);
  assert.equal(first.clock.observePong({ clientTimestamp: sent, serverTimestamp: 1800000000000 }).reason, 'WALL_CLOCK_CHANGED');
  const f = fakeClock(); pong(f); f.jump(-1000);
  assert.equal(f.clock.read().reason, 'WALL_CLOCK_CHANGED');
  assert.equal(f.clock.read().nowMs, null);
  pong(f); assert.equal(f.clock.read().status, 'TRUSTED');
  f.clock.reset(); assert.equal(f.clock.read().reason, 'CLOCK_RESET');
});

test('sample expiration, monotonic rollback and uncertainty stop time-sensitive decisions', () => {
  const stale = fakeClock({ maxSampleAgeMs: 50 }); pong(stale); stale.advance(51);
  assert.equal(stale.clock.read().reason, 'CLOCK_STALE');
  const rollback = fakeClock(); pong(rollback); rollback.rewindMono(1);
  assert.equal(rollback.clock.read().reason, 'MONOTONIC_CLOCK_CHANGED');
  const noisy = fakeClock({ maxUncertaintyMs: 30 });
  assert.equal(pong(noisy).reason, 'CLOCK_UNCERTAINTY');
  assert.throws(() => trustedGameClock({ ...account, driftPpm: -1 }), TypeError);
});

test('trusted game day uses explicit timezone and reset hour; uncertainty spanning reset stays UNKNOWN', () => {
  const midnight = Date.parse('2026-11-11T16:00:00Z');
  const instant = value => ({ reliable: true, earliestMs: value - 10, latestMs: value + 10 });
  assert.equal(trustedGameDay(instant(midnight - 1000), { utcOffsetMinutes: 480 }).dayKey, '2026-11-11');
  assert.equal(trustedGameDay(instant(midnight + 1000), { utcOffsetMinutes: 480 }).dayKey, '2026-11-12');
  assert.equal(trustedGameDay(instant(midnight), { utcOffsetMinutes: 480 }).reason, 'DAY_BOUNDARY_UNCERTAIN');
  assert.equal(trustedGameDay(instant(midnight + 1000), { utcOffsetMinutes: 480, boundaryHour: 5 }).dayKey, '2026-11-11');
  assert.equal(trustedGameDay(instant(midnight), {}).reason, 'DAY_BOUNDARY_UNKNOWN');
  assert.equal(trustedGameDay({ reliable: false }, { utcOffsetMinutes: 480 }).reason, 'CLOCK_UNKNOWN');
});

test('ping dispatch permits encoding delay but rejects reused or stale correlation timestamps', () => {
  const f = fakeClock(), timestamp = f.wall(); f.advance(2);
  assert.equal(f.clock.markPing(timestamp).status, 'PENDING');
  f.advance(10);
  assert.equal(f.clock.observePong({ clientTimestamp: timestamp, serverTimestamp: 1800000000000 }).status, 'TRUSTED');
  assert.equal(f.clock.markPing(timestamp).reason, 'PING_TIMESTAMP_REUSED');
  assert.equal(f.clock.read().reliable, false);
  assert.equal(f.clock.markPing(f.wall() - 1000).reason, 'PING_TIMESTAMP_INVALID');
});

test('prototype protobuf defaults cannot supply missing server timestamp evidence', () => {
  const f = fakeClock(), sent = f.ping(); f.advance(10);
  const body = Object.assign(Object.create({ serverTimestamp: 0 }), { clientTimestamp: sent });
  assert.equal(f.clock.observePong(body).reason, 'PONG_TIMESTAMP_INVALID');
});


test('domain readGameTime never trusts legacy offset, stale status or malformed uncertainty bounds', async () => {
 const {readGameTime,gameTimeBounds}=await import('../src/state-facts.mjs');
 for(const client of [{},{serverClockOffsetMs:0},{serverClockOffsetMs:5000},{gameClock:{read:()=>({status:'UNKNOWN',reliable:false,nowMs:1000})}},{gameClock:{read(){throw Error('clock failure')}}},{gameClock:{read:()=>({status:'TRUSTED',reliable:true,nowMs:1000,earliestMs:1001,latestMs:1002})}}]){const f=readGameTime(client);assert.equal(f.now,null);assert.equal(f.gameTime.reliable,false);assert.deepEqual(gameTimeBounds({...f,now:100}),{now:null,earliest:null,latest:null});}
 const projected=readGameTime({gameClock:{read:()=>({status:'TRUSTED',reliable:true,accountId:'synthetic',generation:4,nowMs:100050,earliestMs:99950,latestMs:100150})}});
 assert.deepEqual({now:projected.now,earliest:projected.nowEarliest,latest:projected.nowLatest},{now:100,earliest:99,latest:101});assert.deepEqual(gameTimeBounds(projected),{now:100,earliest:99,latest:101});assert.deepEqual(gameTimeBounds({now:100}),{now:100,earliest:100,latest:100});
 const c=fakeClock();pong(c);assert.equal(readGameTime({gameClock:c.clock}).gameTime.reliable,true);c.clock.reset();assert.equal(readGameTime({gameClock:c.clock}).now,null);
});
