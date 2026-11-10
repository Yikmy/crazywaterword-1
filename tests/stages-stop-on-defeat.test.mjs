import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createStageRunner, defaultStageConfig, validateStageConfig, resolveMainlineChallengeSide } from '../src/stages.mjs';

const result = (stage, win) => ({ initialData: { mainlineStage: stage, battleType: 1 }, stats: { isLeftWin: win } });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function setup(handler, extra = {}) {
  let scheduled = 0, current = true;
  const timers = new Map(), states = [];
  class Client extends EventEmitter {
    constructor() { super(); this.connected = true; this.calls = []; }
    request(name, body, responseName, timeout) {
      this.calls.push({ name, body, responseName, timeout });
      return handler(body.stage, this.calls.length);
    }
  }
  const client = new Client();
  const runner = createStageRunner({ client, player: { mainlineStage: 401 }, protocol: { ChallengeStageRequest: {}, ChallengeStageResponse: {} },
    resolvePlayerSide: resolveMainlineChallengeSide, isCurrent: () => current,
    onUpdate: view => states.push(view), clock: { now: () => 0, setTimeout: (fn, delay) => { const id = ++scheduled; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) }, ...extra });
  const start = config => runner.start({ ...defaultStageConfig(), enabled: true, stopOnDefeat: true, ...config }, { allowMutate: true });
  return { client, runner, start, timers, states, invalidate: () => { current = false; }, get scheduled() { return scheduled; } };
}

test('stopOnDefeat advances through wins and stops at the first defeat without any retry scheduling', async () => {
  const env = setup((stage, count) => result(stage, count < 3));
  env.start(); await env.runner.completion;
  const status = env.runner.getStatus();
  assert.deepEqual(env.client.calls.map(x => x.body.stage), [401, 402, 403]);
  assert.equal(status.state, 'STOPPED'); assert.equal(status.stopKind, 'DEFEAT_STOPPED');
  assert.equal(status.currentStage, 403); assert.equal(status.nextStage, 403);
  assert.equal(status.attempts, 3); assert.equal(status.consecutiveFailures, 1);
  assert.deepEqual(status.history.map(x => x.outcome), ['SUCCESS', 'SUCCESS', 'FAILED']);
  assert.equal(status.retryAt, null); assert.equal(status.running, false); assert.equal(status.inFlight, false);
  assert.equal(status.uncertain, false); assert.equal(status.error, null);
  assert.equal(env.scheduled, 0); assert.equal(env.timers.size, 0);
  assert.equal(env.states.some(x => x.state === 'WAIT_RETRY'), false);
  assert.equal(status.config.maxAttempts, null); assert.equal(status.config.maxStage, null);
  assert.equal(env.client.listenerCount('state'), 0); assert.equal(env.client.listenerCount('error'), 0);
});

test('stopOnDefeat has no implicit attempt or stage limit before an eventual defeat', async () => {
  const env = setup((stage, count) => result(stage, count < 250));
  env.start(); await env.runner.completion;
  assert.equal(env.client.calls.length, 250);
  assert.equal(env.runner.getStatus().currentStage, 650);
  assert.equal(env.runner.getStatus().stopKind, 'DEFEAT_STOPPED'); assert.equal(env.scheduled, 0);
});

test('legacy omitted stopOnDefeat and explicit false retain the existing ten-second retry policy', async () => {
  for (const explicit of [false, true]) {
    const env = setup(stage => result(stage, false));
    const config = { ...defaultStageConfig(), enabled: true };
    if (explicit) config.stopOnDefeat = false;
    env.runner.start(config, { allowMutate: true }); await flush();
    const status = env.runner.getStatus();
    assert.equal(status.state, 'WAIT_RETRY'); assert.equal(status.retryAt, 10000); assert.equal(env.timers.size, 1);
    assert.equal(env.client.calls.length, 1); env.runner.stop(); await env.runner.completion;
    assert.equal(env.timers.size, 0);
  }
});

test('stopOnDefeat accepts only an explicitly Boolean strategy and preserves old config shape', () => {
  const old = defaultStageConfig();
  assert.equal(old.stopOnDefeat ?? false, false);
  assert.deepEqual(validateStageConfig(old), old);
  for (const value of [true, false]) assert.equal(validateStageConfig({ ...old, stopOnDefeat: value }).stopOnDefeat, value);
  for (const value of [null, undefined, 0, 1, '', 'true', {}, []]) assert.throws(() => validateStageConfig({ ...old, stopOnDefeat: value }), { code: 'INVALID_CONFIG' });
});

test('unknown results, wrong stage and other battle modes remain ERROR rather than defeat stops', async () => {
  for (const response of [
    { initialData: { mainlineStage: 401, battleType: 1 }, stats: {} },
    { initialData: { mainlineStage: 401, battleType: 1 }, stats: { isLeftWin: 'false' } },
    { initialData: { mainlineStage: 402, battleType: 1 }, stats: { isLeftWin: false } },
    { initialData: { mainlineStage: 401, battleType: 2 }, stats: { isLeftWin: false } },
  ]) {
    const env = setup(() => response); env.start(); await env.runner.completion;
    const status = env.runner.getStatus();
    assert.equal(status.stopKind, 'ERROR'); assert.equal(status.lastResult, null); assert.equal(status.consecutiveFailures, 0);
    assert.equal(env.client.calls.length, 1); assert.equal(env.scheduled, 0);
  }
});

test('stopOnDefeat preserves pending request lock, runId and late-response protection after user stop', async () => {
  const gate = deferred(), env = setup(() => gate.promise);
  const started = env.start(); await flush();
  assert.throws(() => env.start(), { code: 'STAGE_BUSY' });
  env.runner.stop(); await env.runner.completion;
  const stopped = env.runner.getStatus();
  assert.equal(stopped.inFlight, true); assert.equal(stopped.runId, started.runId);
  assert.throws(() => env.start(), { code: 'STAGE_BUSY' });
  gate.resolve(result(401, false)); await flush();
  assert.equal(env.runner.getStatus().stopKind, 'USER'); assert.equal(env.runner.getStatus().lastResult, null);
  assert.equal(env.runner.getStatus().runId, started.runId); assert.equal(env.client.calls.length, 1);
  assert.equal(env.runner.getStatus().inFlight, false); assert.equal(env.scheduled, 0);
});

test('changed account generation cannot consume a defeat as an ordinary result or advance', async () => {
  const gate = deferred(), env = setup(() => gate.promise);
  env.start(); await flush(); env.invalidate(); gate.resolve(result(401, false)); await env.runner.completion;
  assert.equal(env.runner.getStatus().stopKind, 'ERROR'); assert.equal(env.runner.getStatus().error.code, 'STALE_RUN');
  assert.equal(env.runner.getStatus().lastResult, null); assert.equal(env.client.calls.length, 1); assert.equal(env.scheduled, 0);
});

test('stopOnDefeat takes precedence over attempt-limit completion on a known defeat', async () => {
  const env = setup(stage => result(stage, false)); env.start({ maxAttempts: 1 }); await env.runner.completion;
  assert.equal(env.runner.getStatus().stopKind, 'DEFEAT_STOPPED'); assert.equal(env.scheduled, 0); assert.equal(env.client.calls.length, 1);
});
