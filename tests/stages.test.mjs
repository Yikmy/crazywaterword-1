import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createStageRunner, defaultStageConfig, validateStageConfig, parseStageResult } from '../src/stages.mjs';

const protocol = { ChallengeStageRequest: {}, ChallengeStageResponse: {} };
const player = () => ({ playerId: 'synthetic-player-only', mainlineStage: 41 });
const config = (extra = {}) => ({ ...defaultStageConfig(), enabled: true, ...extra });
const response = (stage = 41, isLeftWin = true) => ({ initialData: { mainlineStage: stage }, stats: { isLeftWin } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const authorized = { allowMutate: true };
class FakeClient extends EventEmitter {
  constructor(handler = () => deferred().promise) {
    super(); this.connected = true; this.calls = []; this.handler = handler;
    this.on('error', () => {});
  }
  request(name, body, responseName, timeout) {
    this.calls.push({ name, body: structuredClone(body), responseName, timeout });
    return this.handler(body.stage, this.calls.length, this);
  }
}
function fakeClock() {
  let time = 0, next = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, due: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async tick(ms) {
      time += ms;
      for (const [id, item] of [...timers]) if (item.due <= time && timers.delete(id)) item.fn();
      await flush();
    },
    get size() { return timers.size; },
  };
}
function harness(handler, options = {}) {
  const client = new FakeClient(handler), clock = fakeClock();
  const runner = createStageRunner({ client, player: player(), protocol, clock,
    resolvePlayerSide: () => 'LEFT', ...options });
  return { client, clock, runner, start: (extra) => runner.start(config(extra), authorized) };
}

test('01 victory advances directly to the next stage using only the paired challenge response', async () => {
  const h = harness((stage) => response(stage));
  h.start({ maxAttempts: 2 }); await h.runner.completion;
  assert.deepEqual(h.client.calls.map(c => c.body.stage), [41, 42]);
  assert.ok(h.client.calls.every(c => c.name === 'ChallengeStageRequest' && c.responseName === 'ChallengeStageResponse'));
  assert.deepEqual(h.runner.getStatus().history.map(x => x.outcome), ['SUCCESS', 'SUCCESS']);
  assert.equal(h.runner.getStatus().nextStage, 43);
});
test('02 defeat waits the configured default ten seconds and 03 retries the same stage', async () => {
  const h = harness((stage, n) => response(stage, n > 1));
  h.start({ maxAttempts: 2 }); await flush();
  assert.equal(h.runner.getStatus().state, 'WAIT_RETRY'); assert.equal(h.runner.getStatus().retryAt, 10000);
  await h.clock.tick(9999); assert.equal(h.client.calls.length, 1);
  await h.clock.tick(1); await h.runner.completion;
  assert.deepEqual(h.client.calls.map(c => c.body.stage), [41, 41]);
});
test('04 maximum attempts counts both wins and defeats and stops before another request', async () => {
  const h = harness((stage, n) => response(stage, n !== 2));
  h.start({ maxAttempts: 3 }); await flush(); await h.clock.tick(10000); await h.runner.completion;
  assert.equal(h.client.calls.length, 3); assert.equal(h.runner.getStatus().attempts, 3);
  assert.equal(h.runner.getStatus().stopKind, 'COMPLETED'); assert.match(h.runner.getStatus().stopReason, /尝试次数/);
});
test('05 highest target finishes normally after that exact stage succeeds', async () => {
  const h = harness((stage) => response(stage));
  h.start({ maxStage: 42 }); await h.runner.completion;
  assert.deepEqual(h.client.calls.map(c => c.body.stage), [41, 42]);
  assert.equal(h.runner.getStatus().stopKind, 'COMPLETED'); assert.match(h.runner.getStatus().stopReason, /目标关卡/);
});
test('06 omitted maximum attempts keeps advancing until explicitly stopped', async () => {
  const gate = deferred();
  const h = harness((stage, n) => n < 4 ? response(stage) : gate.promise);
  h.start(); await flush();
  assert.equal(h.client.calls.length, 4); assert.equal(h.runner.getStatus().running, true);
  h.runner.stop(); await h.runner.completion;
  gate.resolve(response(44)); await flush();
  assert.equal(h.client.calls.length, 4);
});
test('07 consecutive defeat count increases and 08 a victory resets it to zero', async () => {
  const h = harness((stage, n) => response(stage, n === 3));
  h.start({ maxAttempts: 3 }); await flush();
  assert.equal(h.runner.getStatus().consecutiveFailures, 1);
  await h.clock.tick(10000); assert.equal(h.runner.getStatus().consecutiveFailures, 2);
  await h.clock.tick(10000); await h.runner.completion;
  assert.equal(h.runner.getStatus().consecutiveFailures, 0);
});
test('09 network disconnect immediately stops and cancels the retry timer', async () => {
  const h = harness((stage) => response(stage, false));
  h.start(); await flush(); assert.equal(h.clock.size, 1);
  h.client.connected = false; h.client.emit('state', { state: 'CLOSED' }); await h.runner.completion;
  assert.equal(h.clock.size, 0); assert.equal(h.runner.getStatus().stopKind, 'ERROR');
  await h.clock.tick(100000); assert.equal(h.client.calls.length, 1);
});
test('10 timeout never resends a battle and forbids restarting uncertain progress', async () => {
  const h = harness(() => Promise.reject(new Error('timeout waiting for ChallengeStageResponse')));
  h.start(); await h.runner.completion; await h.clock.tick(100000);
  assert.equal(h.client.calls.length, 1); assert.equal(h.runner.getStatus().uncertain, true);
  assert.throws(() => h.start(), { code: 'RESULT_UNCERTAIN' });
});
test('11 missing or malformed battle result is unknown rather than a defeat or retry', async () => {
  for (const body of [{}, { initialData: { mainlineStage: 41 } },
    { initialData: { mainlineStage: 41 }, stats: {} },
    { initialData: { mainlineStage: 41 }, stats: { isLeftWin: 0 } },
    { initialData: { mainlineStage: 41 }, stats: Object.create({ isLeftWin: false }) }]) {
    const h = harness(() => body);
    h.start(); await h.runner.completion; await h.clock.tick(100000);
    assert.equal(h.client.calls.length, 1); assert.equal(h.runner.getStatus().consecutiveFailures, 0);
    assert.equal(h.runner.getStatus().stopKind, 'ERROR');
  }
});
test('12 account expiry immediately stops an unresolved battle', async () => {
  const gate = deferred(), h = harness(() => gate.promise);
  h.start(); await flush(); h.client.emit('state', { state: 'EXPIRED' }); await h.runner.completion;
  assert.equal(h.runner.getStatus().stopKind, 'ERROR'); assert.equal(h.runner.pending, true);
  gate.resolve(response()); await flush(); assert.equal(h.runner.getStatus().lastResult, null);
});
test('13 user stop cancels retry delay without sending another battle', async () => {
  const h = harness((stage) => response(stage, false));
  h.start(); await flush(); h.runner.stop(); await h.runner.completion;
  assert.equal(h.runner.getStatus().stopKind, 'USER'); assert.equal(h.clock.size, 0);
  await h.clock.tick(100000); assert.equal(h.client.calls.length, 1);
});
test('14 two account runners operate independently in parallel', async () => {
  const ga = deferred(), gb = deferred(), a = harness(() => ga.promise), b = harness(() => gb.promise);
  a.start({ maxAttempts: 1 }); b.start({ maxAttempts: 1 }); await flush();
  assert.equal(a.client.calls.length, 1); assert.equal(b.client.calls.length, 1);
  ga.resolve(response()); await a.runner.completion; assert.equal(b.runner.getStatus().running, true);
  gb.resolve(response(41, false)); await b.runner.completion;
  assert.equal(a.runner.getStatus().lastResult.outcome, 'SUCCESS'); assert.equal(b.runner.getStatus().lastResult.outcome, 'FAILED');
});
test('15 duplicate same-account start is refused', async () => {
  const gate = deferred(), h = harness(() => gate.promise);
  h.start(); assert.throws(() => h.start(), { code: 'STAGE_BUSY' }); await flush();
  assert.equal(h.client.calls.length, 1); h.runner.stop(); gate.resolve(response()); await h.runner.completion;
});
test('16 stopped in-flight request stays locked and a late result cannot rewrite history or outcome', async () => {
  const gate = deferred(), h = harness(() => gate.promise);
  h.start(); await flush(); const runId = h.runner.getStatus().runId;
  h.runner.stop(); await h.runner.completion;
  assert.throws(() => h.start(), { code: 'STAGE_BUSY' });
  const before = h.runner.getStatus(); gate.resolve(response()); await flush();
  const after = h.runner.getStatus(); assert.equal(after.runId, runId);
  assert.deepEqual(after.history, before.history); assert.equal(after.lastResult, null);
  assert.equal(after.inFlight, false); assert.equal(after.uncertain, true);
  assert.throws(() => h.start(), { code: 'RESULT_UNCERTAIN' });
});
test('17 no skip request or animation wait is part of a successful run', async () => {
  const h = harness((stage) => response(stage)); h.start({ maxAttempts: 1 }); await h.runner.completion;
  assert.equal(h.client.calls.length, 1); assert.equal(h.clock.size, 0);
  assert.equal(h.client.calls[0].name, 'ChallengeStageRequest');
});
test('18 runner has no resident-order, daily, login, socket or protocol rewrite dependencies', () => {
  const source = fs.readFileSync(new URL('../src/stages.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\/(?:order-rules|dailies|client|proto|actions)/);
  assert.doesNotMatch(source, /\.connect\s*\(|sendWatch|SkipBattle|fetch\s*\(/);
  assert.deepEqual([...source.matchAll(/client\.request\('([^']+)'/g)].map(m => m[1]), ['ChallengeStageRequest']);
});
test('unverified player-side semantics block start before any game request', () => {
  const h = harness(undefined, { resolvePlayerSide: undefined });
  assert.throws(() => h.start(), { code: 'SIDE_UNVERIFIED' }); assert.equal(h.client.calls.length, 0);
});
test('independent function requires explicit mutation authorization before any game request', () => {
  const h = harness();
  assert.throws(() => h.runner.start(config()), { code: 'MUTATION_NOT_AUTHORIZED' });
  assert.equal(h.client.calls.length, 0);
});
test('trusted side resolver handles right-side players instead of always treating left as self', async () => {
  const h = harness((stage) => response(stage, false), { resolvePlayerSide: () => 'RIGHT' });
  h.start({ maxAttempts: 1 }); await h.runner.completion;
  assert.equal(h.runner.getStatus().lastResult.outcome, 'SUCCESS');
  assert.equal(h.runner.getStatus().lastResult.playerSide, 'RIGHT');
});
test('ambiguous or invalid player side is an exception, never a normal loss', async () => {
  for (const side of [null, 'UNKNOWN', true, 'left']) {
    const h = harness((stage) => response(stage, false), { resolvePlayerSide: () => side });
    h.start(); await h.runner.completion;
    assert.equal(h.runner.getStatus().error.code, 'SIDE_UNVERIFIED');
    assert.equal(h.runner.getStatus().consecutiveFailures, 0); assert.equal(h.clock.size, 0);
  }
});
test('every response must contain its own exact challenged stage number', async () => {
  for (const initialData of [{}, { mainlineStage: 40 }, { mainlineStage: '41' }, Object.create({ mainlineStage: 41 })]) {
    const h = harness(() => ({ initialData, stats: { isLeftWin: true } }));
    h.start(); await h.runner.completion;
    assert.equal(h.runner.getStatus().error.code, 'STAGE_MISMATCH'); assert.equal(h.client.calls.length, 1);
  }
});
test('decode errors, unknown prompt ownership, server rejection and fatal errors stop without retry', async () => {
  for (const event of ['error', 'promptAmbiguous', 'fatal']) {
    const gate = deferred(), h = harness(() => gate.promise);
    h.start(); await flush(); h.client.emit(event, event === 'error' ? new Error('decode failed') : {});
    await h.runner.completion; assert.equal(h.runner.getStatus().stopKind, 'ERROR');
    gate.reject(new Error('old request rejected')); await flush(); await h.clock.tick(100000);
    assert.equal(h.client.calls.length, 1);
  }
  const h = harness(() => Promise.reject(Object.assign(new Error('server prompt'), { prompt: { args: ['rejected'] } })));
  h.start(); await h.runner.completion; assert.equal(h.runner.getStatus().stopKind, 'ERROR'); assert.equal(h.clock.size, 0);
});
test('generation change rejects a response and never advances stale progress', async () => {
  let generation = 1; const gate = deferred();
  const h = harness(() => gate.promise, { isCurrent: () => generation === 1 });
  h.start(); await flush(); generation = 2; gate.resolve(response()); await h.runner.completion;
  assert.equal(h.runner.getStatus().stopKind, 'ERROR');
  assert.equal(h.runner.getStatus().lastResult, null); assert.equal(h.client.calls.length, 1);
});
test('abort cancels waiting promptly and cleans listeners', async () => {
  const abort = new AbortController(), gate = deferred(), h = harness(() => gate.promise, { signal: abort.signal });
  h.start(); await flush(); abort.abort(); await h.runner.completion;
  assert.equal(h.runner.getStatus().stopKind, 'ERROR'); assert.equal(h.client.listenerCount('state'), 0);
  assert.equal(h.client.listenerCount('promptAmbiguous'), 0); assert.equal(h.client.listenerCount('error'), 1);
  gate.resolve(response()); await flush();
});
test('configuration rejects unsafe counts, unknown fields and negative delays', () => {
  assert.deepEqual(defaultStageConfig(), { enabled: false, retryDelaySeconds: 10, maxAttempts: null, maxStage: null });
  for (const extra of [{ maxAttempts: 0 }, { maxAttempts: 1.2 }, { maxAttempts: Number.MAX_SAFE_INTEGER + 1 },
    { maxStage: 2147483648 }, { retryDelaySeconds: -1 }, { retryDelaySeconds: Infinity }, { playerSide: 'LEFT' }]) {
    assert.throws(() => validateStageConfig(config(extra)), { code: 'INVALID_CONFIG' });
  }
});
test('already reached target finishes without a battle and snapshots stay unchanged', async () => {
  const p = player(), before = structuredClone(p), h = harness(undefined, { player: p });
  h.start({ maxStage: 40 }); await h.runner.completion;
  assert.equal(h.client.calls.length, 0); assert.equal(h.runner.getStatus().stopKind, 'COMPLETED'); assert.deepEqual(p, before);
});
test('state callback stopping and restarting at SUCCESS cannot let the old run mutate the new run', async () => {
  let h, restarted = false, secondRun;
  const gate = deferred();
  h = harness((stage, n) => n === 1 ? response(stage) : gate.promise, {
    onUpdate(status) {
      if (status.state === 'SUCCESS' && !restarted) {
        restarted = true; h.runner.stop(); secondRun = h.start({ maxAttempts: 1 }).runId;
      }
    },
  });
  const first = h.start({ maxAttempts: 1 }).runId; await flush();
  assert.notEqual(first, secondRun); assert.deepEqual(h.client.calls.map(x => x.body.stage), [41, 42]);
  assert.equal(h.runner.getStatus().runId, secondRun); assert.equal(h.runner.getStatus().attempts, 1);
  gate.resolve(response(42)); await h.runner.completion;
  assert.equal(h.runner.getStatus().history.length, 1); assert.equal(h.runner.getStatus().history[0].stage, 42);
});
test('synchronous stop from request dispatch preserves the old request lock and uncertain outcome', async () => {
  let h; const gate = deferred();
  h = harness(() => { h.runner.stop(); return gate.promise; });
  h.start(); await h.runner.completion;
  assert.equal(h.runner.getStatus().state, 'STOPPED'); assert.equal(h.runner.getStatus().stopKind, 'USER');
  assert.equal(h.runner.getStatus().uncertain, true); assert.equal(h.runner.pending, true);
  assert.throws(() => h.start(), { code: 'STAGE_BUSY' }); gate.resolve(response()); await flush();
  assert.equal(h.runner.getStatus().lastResult, null);
});
test('synchronous terminal event during dispatch does not overwrite STOPPED with WAITING_RESULT', async () => {
  const gate = deferred(), h = harness((stage, n, client) => { client.emit('state', { state: 'EXPIRED' }); return gate.promise; });
  h.start(); await h.runner.completion;
  assert.equal(h.runner.getStatus().state, 'STOPPED'); assert.equal(h.runner.getStatus().stopKind, 'ERROR');
  assert.equal(h.runner.pending, true); gate.resolve(response()); await flush();
});
test('results and status copies cannot mutate caller input or future runner state', () => {
  const body = response(), before = structuredClone(body);
  assert.equal(parseStageResult(body, { stage: 41, player: player(), resolvePlayerSide: () => 'LEFT' }).outcome, 'SUCCESS');
  assert.deepEqual(body, before);
  const h = harness(), status = h.runner.getStatus(); status.config.enabled = true; status.history.push({});
  assert.equal(h.runner.getStatus().config.enabled, false); assert.equal(h.runner.getStatus().history.length, 0);
});
test('STARTING callback cancellation cannot dispatch an obsolete run after immediate restart', async () => {
  let h, restarted = false; const gate = deferred();
  h = harness(() => gate.promise, { onUpdate(status) {
    if (status.state === 'STARTING' && !restarted) {
      restarted = true; h.runner.stop(); h.start({ maxAttempts: 1 });
    }
  } });
  h.start(); await flush(); assert.equal(h.client.calls.length, 1);
  gate.resolve(response()); await h.runner.completion;
  assert.equal(h.runner.getStatus().attempts, 1); assert.equal(h.runner.getStatus().history.length, 1);
});
test('a synchronous lifecycle failure inside side validation cannot publish a battle result', async () => {
  let h;
  h = harness((stage) => response(stage), { resolvePlayerSide() {
    h.client.emit('error', new Error('decode failed while validating response')); return 'LEFT';
  } });
  h.start(); await h.runner.completion;
  assert.equal(h.runner.getStatus().stopKind, 'ERROR'); assert.equal(h.runner.getStatus().lastResult, null);
  assert.deepEqual(h.runner.getStatus().history.map(x => x.outcome), ['ERROR']);
});