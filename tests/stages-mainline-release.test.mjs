import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  MAINLINE_CHALLENGE, MAINLINE_SIDE_AUTHORIZATION, resolveMainlineChallengeSide,
  createStageRunner, defaultStageConfig, parseStageResult,
} from '../src/stages.mjs';

// Synthetic in-process battles only. No account store, real GameClient or network.
const protocol = { ChallengeStageRequest: {}, ChallengeStageResponse: {} };
const context = () => ({ battleMode: MAINLINE_CHALLENGE,
  requestName: 'ChallengeStageRequest', responseName: 'ChallengeStageResponse' });
const response = (stage = 41, isLeftWin = true) => ({
  initialData: { mainlineStage: stage, battleType: 1 }, stats: { isLeftWin },
});
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fakeClock() {
  let now = 0, nextId = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async tick(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.due <= now && timers.delete(id)) timer.fn();
      await flush();
    },
    get timerCount() { return timers.size; },
  };
}
class FakeClient extends EventEmitter {
  constructor(handler) { super(); this.connected = true; this.calls = []; this.handler = handler; }
  request(name, body, responseName, timeout) {
    this.calls.push({ name, body: structuredClone(body), responseName, timeout });
    return this.handler(body.stage, this.calls.length);
  }
}
function harness(handler, options = {}) {
  const client = new FakeClient(handler), clock = fakeClock();
  const runner = createStageRunner({ client, clock, protocol,
    player: { playerId: 'synthetic-mainline-player', mainlineStage: 41 },
    resolvePlayerSide: resolveMainlineChallengeSide, ...options });
  return { client, clock, runner,
    start(extra = {}) { return runner.start({ ...defaultStageConfig(), enabled: true, ...extra }, { allowMutate: true }); } };
}
async function expectStoppedError(body, code) {
  const h = harness(() => body);
  h.start(); await h.runner.completion; await h.clock.tick(60000);
  const state = h.runner.getStatus();
  assert.equal(state.stopKind, 'ERROR'); assert.equal(state.error.code, code);
  assert.equal(state.lastResult, null); assert.equal(state.consecutiveFailures, 0);
  assert.equal(state.uncertain, true); assert.equal(h.clock.timerCount, 0);
  assert.equal(h.client.calls.length, 1);
  assert.throws(() => h.start(), { code: 'RESULT_UNCERTAIN' });
}

test('B1 accepted mainline mapping is explicit and scoped to the paired challenge protocol', () => {
  assert.equal(MAINLINE_CHALLENGE, 'MAINLINE_CHALLENGE');
  assert.equal(Object.isFrozen(MAINLINE_SIDE_AUTHORIZATION), true);
  assert.equal(MAINLINE_SIDE_AUTHORIZATION.battleMode, MAINLINE_CHALLENGE);
  assert.equal(MAINLINE_SIDE_AUTHORIZATION.requestName, 'ChallengeStageRequest');
  assert.equal(MAINLINE_SIDE_AUTHORIZATION.responseName, 'ChallengeStageResponse');
  assert.equal(MAINLINE_SIDE_AUTHORIZATION.battleType, 1);
  assert.equal(MAINLINE_SIDE_AUTHORIZATION.playerSide, 'LEFT');
  assert.equal(typeof MAINLINE_SIDE_AUTHORIZATION.evidencePath, 'string');
  assert.match(MAINLINE_SIDE_AUTHORIZATION.evidenceSha256, /^[a-f0-9]{64}$/i);
  assert.equal(resolveMainlineChallengeSide(response(), {}, context()), 'LEFT');
  assert.throws(() => resolveMainlineChallengeSide(response(), {}), { code: 'SIDE_UNVERIFIED' });
  assert.throws(() => resolveMainlineChallengeSide(response(), {}, null), { code: 'SIDE_UNVERIFIED' });
  for (const extra of [{ battleMode: 'ARENA' }, { battleMode: 'UNKNOWN' },
    { requestName: 'ArenaChallengeRequest' }, { responseName: 'ArenaChallengeResponse' }]) {
    assert.throws(() => resolveMainlineChallengeSide(response(), {}, { ...context(), ...extra }), { code: 'SIDE_UNVERIFIED' });
  }
});

test('B1 mainline left victory advances without a skip or additional read request', async () => {
  const h = harness(stage => response(stage));
  h.start({ maxAttempts: 2 }); await h.runner.completion;
  assert.deepEqual(h.client.calls.map(call => call.body.stage), [41, 42]);
  assert.ok(h.client.calls.every(call => call.name === 'ChallengeStageRequest' && call.responseName === 'ChallengeStageResponse'));
  assert.deepEqual(h.runner.getStatus().history.map(item => item.outcome), ['SUCCESS', 'SUCCESS']);
  assert.equal(h.runner.getStatus().lastResult.playerSide, 'LEFT');
  assert.equal(h.runner.getStatus().nextStage, 43); assert.equal(h.clock.timerCount, 0);
});

test('B1 mainline left defeat waits exactly ten seconds before retrying the same stage', async () => {
  const h = harness((stage, attempt) => response(stage, attempt > 1));
  h.start({ maxAttempts: 2 }); await flush();
  assert.equal(h.runner.getStatus().state, 'WAIT_RETRY');
  assert.equal(h.runner.getStatus().retryAt, 10000);
  assert.equal(h.runner.getStatus().lastResult.outcome, 'FAILED');
  assert.equal(h.runner.getStatus().consecutiveFailures, 1);
  await h.clock.tick(9999); assert.equal(h.client.calls.length, 1);
  await h.clock.tick(1); await h.runner.completion;
  assert.deepEqual(h.client.calls.map(call => call.body.stage), [41, 41]);
  assert.equal(h.runner.getStatus().consecutiveFailures, 0);
  assert.equal(h.runner.getStatus().attempts, 2); assert.equal(h.runner.getStatus().nextStage, 42);
});

test('B1 absent or inherited isLeftWin is an unknown result and never triggers defeat retry', async () => {
  for (const stats of [{}, Object.create({ isLeftWin: false })]) {
    const body = response(); body.stats = stats;
    await expectStoppedError(body, 'UNKNOWN_RESULT');
  }
});

test('B1 malformed isLeftWin types stop instead of coercing a winner', async () => {
  for (const isLeftWin of ['true', 'false', 0, 1, null, {}, []]) {
    await expectStoppedError(response(41, isLeftWin), 'UNKNOWN_RESULT');
  }
});

test('B1 missing, inherited or mismatched response stages remain fatal', async () => {
  for (const initialData of [{ battleType: 1 }, { mainlineStage: 42, battleType: 1 },
    { mainlineStage: '41', battleType: 1 }, Object.assign(Object.create({ mainlineStage: 41 }), { battleType: 1 })]) {
    const body = response(); body.initialData = initialData;
    await expectStoppedError(body, 'STAGE_MISMATCH');
  }
});

test('B1 unknown battle contexts stay blocked even when a trusted callback returns LEFT', () => {
  let resolved = 0;
  const options = { stage: 41, resolvePlayerSide: () => { resolved++; return 'LEFT'; } };
  for (const extra of [{ battleMode: 'UNKNOWN' }, { battleMode: 'BT_ARENA' },
    { requestName: 'ArenaChallengeRequest' }, { responseName: 'ArenaChallengeResponse' }]) {
    assert.throws(() => parseStageResult(response(), { ...options, ...extra }), { code: 'SIDE_UNVERIFIED' });
  }
  assert.equal(resolved, 0);
});

test('B1 arena, city war and unknown battleType cannot inherit the mainline left mapping', async () => {
  for (const battleType of [0, 2, 13, 999, '1', null]) {
    const body = response(); body.initialData.battleType = battleType;
    await expectStoppedError(body, 'SIDE_UNVERIFIED');
    assert.throws(() => parseStageResult(body, { stage: 41, resolvePlayerSide: () => 'LEFT' }), { code: 'SIDE_UNVERIFIED' });
  }
  for (const initialData of [{ mainlineStage: 41 }, Object.assign(Object.create({ battleType: 1 }), { mainlineStage: 41 })]) {
    const body = response(); body.initialData = initialData;
    await expectStoppedError(body, 'SIDE_UNVERIFIED');
  }
});

test('B1 a late victory after stop cannot start the next challenge or overwrite history', async () => {
  const gate = deferred(), h = harness(() => gate.promise);
  h.start(); await flush(); const runId = h.runner.getStatus().runId;
  h.runner.stop(); await h.runner.completion;
  assert.throws(() => h.start(), { code: 'STAGE_BUSY' });
  const history = h.runner.getStatus().history;
  gate.resolve(response()); await flush(); await h.clock.tick(60000);
  const state = h.runner.getStatus();
  assert.equal(h.client.calls.length, 1); assert.equal(state.runId, runId);
  assert.equal(state.lastResult, null); assert.deepEqual(state.history, history);
  assert.equal(state.running, false); assert.equal(state.uncertain, true);
  assert.throws(() => h.start(), { code: 'RESULT_UNCERTAIN' });
});

test('B1 same-account duplicate start cannot dispatch a concurrent battle', async () => {
  const gate = deferred(), h = harness(() => gate.promise);
  h.start(); assert.throws(() => h.start(), { code: 'STAGE_BUSY' }); await flush();
  assert.equal(h.client.calls.length, 1); assert.equal(h.runner.pending, true);
  h.runner.stop(); gate.resolve(response()); await h.runner.completion;
});

test('B1 maxAttempts and maxStage independently cap progression with the released mapping', async () => {
  for (const [config, expected, reason] of [
    [{ maxAttempts: 1 }, [41], /尝试次数/],
    [{ maxStage: 42 }, [41, 42], /目标关卡/],
    [{ maxAttempts: 1, maxStage: 45 }, [41], /尝试次数/],
    [{ maxAttempts: 5, maxStage: 41 }, [41], /目标关卡/],
  ]) {
    const h = harness(stage => response(stage)); h.start(config); await h.runner.completion;
    const state = h.runner.getStatus();
    assert.deepEqual(h.client.calls.map(call => call.body.stage), expected);
    assert.equal(state.stopKind, 'COMPLETED'); assert.match(state.stopReason, reason);
    assert.equal(state.attempts, expected.length);
  }
});


test('B1 an unknown runner battle mode is refused before dispatch even with a LEFT adapter', () => {
  for (const battleMode of ['UNKNOWN', 'ARENA', 'BT_CITY_WAR', null]) {
    const h = harness(stage => response(stage), { battleMode, resolvePlayerSide: () => 'LEFT' });
    assert.throws(() => h.start(), { code: 'SIDE_UNVERIFIED' });
    assert.equal(h.client.calls.length, 0); assert.equal(h.runner.getStatus().running, false);
  }
});
