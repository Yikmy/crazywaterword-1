import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createStageRunner, defaultStageConfig, validateStageConfig, resolveMainlineChallengeSide } from '../src/stages.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (stage, win = true) => ({ initialData: { mainlineStage: stage, battleType: 1 }, stats: { isLeftWin: win } });
const protocol = { ChallengeStageRequest: {}, ChallengeStageResponse: {} };
function setup(handler = stage => response(stage), options = {}) {
  let time = 1000, nextId = 0, generation = 1;
  const timers = new Map(), fired = [], randomCalls = [], updates = [];
  const clock = {
    now: () => time,
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, delay, due: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async tick(ms) { time += ms; for (const [id, timer] of [...timers]) if (timer.due <= time && timers.delete(id)) { fired.push(timer); timer.fn(); } await flush(); },
  };
  class Client extends EventEmitter {
    constructor() { super(); this.connected = true; this.calls = []; }
    request(name, body, expected, timeout) { this.calls.push({ name, body, expected, timeout, at: time }); return handler(body.stage, this.calls.length); }
  }
  const client = new Client(), abort = new AbortController();
  const runner = createStageRunner({ client, player: { mainlineStage: 156 }, protocol, clock, signal: abort.signal,
    resolvePlayerSide: resolveMainlineChallengeSide, isCurrent: () => generation === 1,
    randomInt: (min, max) => { randomCalls.push([min, max]); return options.sample ?? 10501; },
    onUpdate: status => updates.push(status), ...options.runner });
  const start = extra => runner.start({ ...defaultStageConfig(), enabled: true,
    interStageDelay: { minSeconds: 10, maxSeconds: 11 }, ...extra }, { allowMutate: true });
  return { client, runner, clock, timers, fired, randomCalls, updates, abort, start, invalidate() { generation++; } };
}

test('inter-stage delay validates finite ordered millisecond bounds and copies nested config', () => {
  const input = { ...defaultStageConfig(), interStageDelay: { minSeconds: 10, maxSeconds: 11 } };
  const parsed = validateStageConfig(input); input.interStageDelay.minSeconds = 0;
  assert.equal(parsed.interStageDelay.minSeconds, 10);
  for (const delay of [null, undefined, [], {}, { minSeconds: 10 }, { minSeconds: 11, maxSeconds: 10 },
    { minSeconds: -1, maxSeconds: 11 }, { minSeconds: 10, maxSeconds: Infinity },
    { minSeconds: '10', maxSeconds: 11 }, { minSeconds: 10, maxSeconds: 86401 },
    { minSeconds: 10.0001, maxSeconds: 11 }, { minSeconds: 10, maxSeconds: 11, extra: true }]) {
    assert.throws(() => validateStageConfig({ ...defaultStageConfig(), interStageDelay: delay }), { code: 'INVALID_CONFIG' });
  }
  assert.deepEqual(validateStageConfig(defaultStageConfig()), defaultStageConfig());
});

test('first challenge is immediate; every nonterminal win samples inclusive 10–11 seconds exactly once', async () => {
  for (const sample of [10000, 10501, 11000]) {
    const h = setup(undefined, { sample }); h.start({ maxAttempts: 2 }); await flush();
    assert.equal(h.client.calls.length, 1); assert.equal(h.client.calls[0].at, 1000);
    const status = h.runner.getStatus();
    assert.equal(status.state, 'WAIT_NEXT_STAGE'); assert.equal(status.running, true);
    assert.equal(status.nextStage, 157); assert.equal(status.nextStageAt, 1000 + sample);
    assert.equal(status.retryAt, null); assert.equal(status.inFlight, false);
    assert.deepEqual(h.randomCalls, [[10000, 11001]]);
    assert.equal(status.history[0].interStageDelayMs, sample); assert.equal(status.history[0].nextStageAt, 1000 + sample);
    await h.clock.tick(sample - 1); assert.equal(h.client.calls.length, 1);
    await h.clock.tick(1); await h.runner.completion;
    assert.deepEqual(h.client.calls.map(call => call.body.stage), [156, 157]);
    assert.equal(h.client.calls[1].at - h.client.calls[0].at, sample);
    assert.equal(h.runner.getStatus().stopKind, 'COMPLETED'); assert.equal(h.runner.getStatus().nextStageAt, null);
    assert.equal(h.timers.size, 0); assert.equal(h.randomCalls.length, 1);
  }
});

test('each successive win receives its own delay and caller/status config mutations cannot change it', async () => {
  const samples = [10000, 11000];
  const h = setup(undefined, { runner: { randomInt: () => samples.shift() } });
  const config = { ...defaultStageConfig(), enabled: true, maxAttempts: 3, interStageDelay: { minSeconds: 10, maxSeconds: 11 } };
  h.runner.start(config, { allowMutate: true }); config.interStageDelay.minSeconds = 200; await flush();
  h.runner.getStatus().config.interStageDelay.maxSeconds = 1;
  await h.clock.tick(10000); assert.equal(h.client.calls.length, 2);
  assert.equal(h.runner.getStatus().history[1].interStageDelayMs, 11000);
  await h.clock.tick(10999); assert.equal(h.client.calls.length, 2);
  await h.clock.tick(1); await h.runner.completion;
  assert.deepEqual(h.runner.getStatus().history.map(x => x.interStageDelayMs), [10000, 11000, undefined]);
  assert.equal(h.client.calls.length, 3);
});

test('same-account running lock remains held throughout the interval despite no pending battle', async () => {
  const h = setup(); h.start(); await flush(); const id = h.runner.getStatus().runId;
  assert.equal(h.runner.pending, false); assert.equal(h.runner.getStatus().running, true);
  assert.throws(() => h.start(), { code: 'STAGE_BUSY' });
  await h.clock.tick(10000); assert.throws(() => h.start(), { code: 'STAGE_BUSY' });
  assert.equal(h.runner.getStatus().runId, id); assert.equal(h.client.calls.length, 1);
  h.runner.stop(); await h.runner.completion; assert.equal(h.timers.size, 0);
});

test('manual stop cancels the interval immediately, with no next-stage request or listeners remaining', async () => {
  const h = setup(); h.start(); await flush(); h.runner.stop(); await h.runner.completion;
  assert.equal(h.runner.getStatus().stopKind, 'USER'); assert.equal(h.runner.getStatus().nextStageAt, null);
  assert.equal(h.runner.getStatus().uncertain, false); assert.equal(h.timers.size, 0);
  assert.equal(h.client.eventNames().length, 0);
  await h.clock.tick(100000); assert.equal(h.client.calls.length, 1);
});

test('account terminal states, fatal, disconnect and Session abort immediately cancel the interval', async () => {
  for (const event of ['FAILED', 'EXPIRED', 'CLOSED', 'REJECTED', 'fatal', 'abort']) {
    const h = setup(); h.start(); await flush(); assert.equal(h.timers.size, 1);
    if (event === 'abort') h.abort.abort();
    else if (event === 'fatal') h.client.emit('fatal');
    else { h.client.connected = false; h.client.emit('state', { state: event }); }
    await h.runner.completion;
    assert.equal(h.runner.getStatus().stopKind, 'ERROR'); assert.equal(h.runner.getStatus().nextStageAt, null);
    assert.equal(h.timers.size, 0); assert.equal(h.client.eventNames().length, 0);
    await h.clock.tick(100000); assert.equal(h.client.calls.length, 1);
  }
});

test('changed generation is checked after the interval before any next-stage send', async () => {
  const h = setup(); h.start(); await flush(); h.invalidate(); await h.clock.tick(10501); await h.runner.completion;
  assert.equal(h.runner.getStatus().error.code, 'STALE_RUN'); assert.equal(h.client.calls.length, 1);
});

test('stale timer callback after stop and restart cannot advance or mutate the new run', async () => {
  const h = setup(); const first = h.start(); await flush(); const oldTimer = [...h.timers.values()][0];
  h.runner.stop(); await h.runner.completion;
  const second = h.start({ maxAttempts: 1 }); await h.runner.completion;
  assert.notEqual(first.runId, second.runId);
  const before = h.runner.getStatus(); oldTimer.fn(); await flush();
  assert.deepEqual(h.runner.getStatus(), before);
  assert.deepEqual(h.client.calls.map(call => call.body.stage), [156, 157]);
});

test('stopping synchronously from WAIT_NEXT_STAGE cannot schedule a timer or contaminate a restarted run', async () => {
  let h, restarted = false;
  h = setup(undefined, { runner: { onUpdate(status) {
    if (status.state === 'WAIT_NEXT_STAGE' && !restarted) { restarted = true; h.runner.stop(); h.start({ maxAttempts: 1 }); }
  } } });
  h.start(); await flush(); await h.runner.completion;
  assert.equal(h.timers.size, 0); assert.equal(h.client.calls.length, 2);
  assert.equal(h.runner.getStatus().attempts, 1); assert.equal(h.runner.getStatus().stopKind, 'COMPLETED');
});

test('RATE_LIMITED retains sanitized original prompt and time, stops without any defeat/retry/next stage', async () => {
  const secret = 'synthetic-b4-secret';
  const error = Object.assign(new Error('server prompt: too frequent, retry later token=' + secret), {
    request: 'ChallengeStageRequest', prompt: { args: ['too frequent, retry later', 'token=' + secret], token: secret, nested: { Sign: 'synthetic-sign' } },
  });
  const h = setup((stage, count) => count === 1 ? response(stage) : Promise.reject(error));
  h.start(); await flush(); await h.clock.tick(10501); await h.runner.completion;
  const status = h.runner.getStatus();
  assert.equal(status.stopKind, 'ERROR'); assert.equal(status.error.code, 'RATE_LIMITED');
  assert.equal(status.error.at, new Date(11501).toISOString()); assert.equal(status.history.at(-1).at, status.error.at);
  assert.equal(status.history.at(-1).code, 'RATE_LIMITED'); assert.equal(status.history.at(-1).outcome, 'ERROR');
  assert.match(status.error.message, /too frequent, retry later/); assert.match(status.error.prompt.args[0], /too frequent/);
  assert.equal(status.consecutiveFailures, 0); assert.equal(status.lastResult.outcome, 'SUCCESS');
  assert.equal(status.retryAt, null); assert.equal(status.nextStageAt, null); assert.equal(h.timers.size, 0);
  assert.equal(status.uncertain, true); assert.throws(() => h.start(), { code: 'RESULT_UNCERTAIN' });
  const serialized = JSON.stringify(status); assert.equal(serialized.includes(secret), false); assert.equal(serialized.includes('synthetic-sign'), false);
  status.error.prompt.args[0] = 'mutated'; assert.match(h.runner.getStatus().error.prompt.args[0], /too frequent/);
  h.runner.fail(new Error('later error')); assert.equal(h.runner.getStatus().error.code, 'RATE_LIMITED');
  await h.clock.tick(100000); assert.deepEqual(h.client.calls.map(call => call.body.stage), [156, 157]);
});

test('other prompts, timeouts and unknown battle results remain ERROR, never RATE_LIMITED or defeat', async () => {
  for (const handler of [() => Promise.reject(new Error('server prompt: unavailable')), () => Promise.reject(new Error('timeout')),
    stage => ({ initialData: { mainlineStage: stage, battleType: 1 }, stats: {} })]) {
    const h = setup(handler); h.start(); await h.runner.completion;
    assert.equal(h.runner.getStatus().stopKind, 'ERROR'); assert.notEqual(h.runner.getStatus().error.code, 'RATE_LIMITED');
    assert.equal(h.runner.getStatus().consecutiveFailures, 0); assert.equal(h.timers.size, 0); assert.equal(h.randomCalls.length, 0);
  }
});

test('defeat retry delay remains independent; stopOnDefeat and reached limits never schedule victory waits', async () => {
  const h = setup((stage, count) => response(stage, count > 1));
  h.start({ retryDelaySeconds: 3, maxAttempts: 2 }); await flush();
  assert.equal(h.runner.getStatus().state, 'WAIT_RETRY'); assert.equal(h.runner.getStatus().retryAt, 4000);
  assert.equal(h.runner.getStatus().nextStageAt, null); assert.equal(h.randomCalls.length, 0);
  await h.clock.tick(2999); assert.equal(h.client.calls.length, 1);
  await h.clock.tick(1); await h.runner.completion;
  assert.deepEqual(h.client.calls.map(call => call.body.stage), [156, 156]); assert.equal(h.timers.size, 0);
  const defeated = setup(stage => response(stage, false)); defeated.start({ stopOnDefeat: true }); await defeated.runner.completion;
  assert.equal(defeated.runner.getStatus().stopKind, 'DEFEAT_STOPPED'); assert.equal(defeated.timers.size, 0);
  for (const limit of [{ maxAttempts: 1 }, { maxStage: 156 }]) {
    const won = setup(); won.start(limit); await won.runner.completion;
    assert.equal(won.runner.getStatus().stopKind, 'COMPLETED'); assert.equal(won.timers.size, 0); assert.equal(won.randomCalls.length, 0);
  }
});

test('production random source stays in the configured bounds without a game network', async () => {
  const h = setup(undefined, { runner: { randomInt: undefined } }); h.start(); await flush();
  const delay = h.runner.getStatus().history[0].interStageDelayMs;
  assert.ok(delay >= 10000 && delay <= 11000); assert.equal(h.timers.size, 1);
  h.runner.stop(); await h.runner.completion;
});

test('RATE_LIMITED diagnostics also remove unlabelled known credential values without retaining login data', async () => {
  const token = 'synthetic-unlabelled-token', sign = 'synthetic-unlabelled-sign';
  const h = setup(() => Promise.reject(new Error('PromptResponse: too frequent, retry later ' + token + ' ' + sign)));
  h.client.login = { eworldParams: { token, sign } };
  h.start(); await h.runner.completion;
  const status = h.runner.getStatus(), output = JSON.stringify(status);
  assert.equal(status.error.code, 'RATE_LIMITED'); assert.match(status.error.message, /too frequent, retry later/);
  assert.equal(output.includes(token), false); assert.equal(output.includes(sign), false);
  assert.equal(Object.hasOwn(status.error, 'login'), false); assert.equal(Object.hasOwn(status, 'login'), false);
  assert.equal(h.client.calls.length, 1); assert.equal(h.timers.size, 0);
});
