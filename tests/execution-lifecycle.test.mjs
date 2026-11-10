import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventListeners } from 'node:events';
import { runTasks, surveyTasks } from '../src/tasks.mjs';
import { runLoop, formatLoopRound } from '../src/loop.mjs';
import { awaitExecution, executionDelay } from '../src/execution.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const task = (id) => ({ kind: 'main', id, request: 'DrawMainTaskRewardRequest', body: { taskId: id } });
const taskProtocol = { DrawMainTaskRewardRequest: {} };
const config = { tables: { MainTaskCfg: { data: [{ taskId: 1, type: 'fixture', params: [1] }] } } };
function loopFixture({ claimable = false } = {}) {
  const reads = [], writes = [];
  const protocol = { ...taskProtocol };
  for (const name of ['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets']) {
    protocol[name + 'Request'] = {}; protocol[name + 'Response'] = {};
  }
  const client = {
    connected: true,
    async request(name) {
      reads.push(name);
      if (name === 'MainTaskInfoRequest') return claimable ? { task: { taskId: 1, progress: 1, rewardClaimed: false } } : {};
      if (name === 'AchievementInfoRequest') return { task: [] };
      if (name === 'DailyTaskInfoRequest') return { dailyTask: [] };
      if (name === 'AllItemRequest') return { items: [] };
      if (name === 'AllResourceRequest') return { list: [] };
      return {};
    },
    async sendWatch(name, body) { writes.push({ name, body }); return { status: 'UNKNOWN' }; },
  };
  return { client, protocol, reads, writes };
}

test('task rejection memory survives repeated calls without resending the rejected reward', async () => {
  const rejected = new Set(); let sends = 0;
  const client = { async sendWatch() { sends++; throw Object.assign(new Error('server prompt: denied'), { prompt: {} }); } };
  const survey = { plan: [task(1)] };
  const first = await runTasks(client, taskProtocol, survey, { allowMutate: true, rejected });
  const second = await runTasks(client, taskProtocol, survey, { allowMutate: true, rejected });
  assert.equal(first[0].status, 'REJECTED');
  assert.equal(second[0].status, 'NOT_EXECUTED');
  assert.equal(sends, 1);
});

test('a silent or timed-out task is UNKNOWN and stops all following task writes', async () => {
  for (const timeout of [false, true]) {
    let sends = 0; const rejected = new Set();
    const client = { async sendWatch() { sends++; if (timeout) throw new Error('timeout'); } };
    const results = await runTasks(client, taskProtocol, { plan: [task(1), task(2)] }, { allowMutate: true, rejected });
    assert.equal(results.length, 1); assert.equal(sends, 1);
    assert.equal(results[0].status, 'UNKNOWN'); assert.equal(results[0].ok, null);
    assert.equal(rejected.size, 0, 'uncertainty is never stored as a definite rejection');
  }
});

test('UNKNOWN ends the loop before daily/world surveys or another round', async () => {
  const env = loopFixture({ claimable: true });
  const result = await runLoop(env.client, env.protocol, { config, allowMutate: true, rounds: 3, everyMs: 0 });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.history.length, 1);
  assert.equal(env.writes.length, 1);
  assert.deepEqual(env.reads, ['MainTaskInfoRequest', 'AchievementInfoRequest', 'OnWaterRequest']);
  assert.match(formatLoopRound(result.history[0]), /未知 1/);
});

test('plain stop cancels an in-flight survey promptly; late data cannot start the next query', async () => {
  const waiting = deferred(), entered = deferred();
  const stop = { aborted: false }; const reads = [];
  const client = { connected: true, request(name) { reads.push(name); entered.resolve(); return waiting.promise; } };
  const running = runLoop(client, {}, { allowMutate: true, rounds: 2, stop });
  await entered.promise; stop.aborted = true;
  const result = await running;
  assert.equal(result.status, 'CANCELLED');
  waiting.resolve({}); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reads, ['MainTaskInfoRequest']);
});

test('a stop from a step observer cannot dispatch another phase', async () => {
  const env = loopFixture({ claimable: true }); const stop = { aborted: false };
  env.client.sendWatch = async () => { throw Object.assign(new Error('server prompt: denied'), { prompt: {} }); };
  const result = await runLoop(env.client, env.protocol, {
    config, allowMutate: true, rounds: 2, stop, onStep: () => { stop.aborted = true; },
  });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(env.reads.includes('DailyTaskInfoRequest'), false);
});

test('plain stop interrupts the round delay and never starts the next round', async () => {
  const env = loopFixture(); const stop = { aborted: false }; const sleeping = deferred();
  const running = runLoop(env.client, env.protocol, {
    config, allowMutate: true, rounds: 2, everyMs: 60_000, stop,
    sleep: () => { sleeping.resolve(); return new Promise(() => {}); },
  });
  await sleeping.promise; const before = env.reads.length; stop.aborted = true;
  const result = await running;
  assert.equal(result.status, 'CANCELLED'); assert.equal(result.history.length, 1);
  assert.equal(env.reads.length, before); assert.equal(env.writes.length, 0);
});

test('disconnect during a query stops the loop without reconnecting or writing', async () => {
  const reads = [];
  const client = { connected: true, async request(name) { reads.push(name); client.connected = false; return {}; } };
  const result = await runLoop(client, {}, { allowMutate: true, rounds: 2 });
  assert.equal(result.status, 'CANCELLED'); assert.deepEqual(reads, ['MainTaskInfoRequest']);
});

test('completion and abort release execution listeners, including a cancelled delay', async () => {
  const controller = new AbortController();
  assert.equal(await awaitExecution(Promise.resolve(3), null, { signal: controller.signal }), 3);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  const pending = assert.rejects(executionDelay(60_000, { signal: controller.signal }), { code: 'CANCELLED' });
  controller.abort(); await pending;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('the fixed loop passes rejected reward memory into the following round', async () => {
  const env = loopFixture({ claimable: true }); let sends = 0;
  env.client.sendWatch = async () => { sends++; throw Object.assign(new Error('server prompt: denied'), { prompt: {} }); };
  const result = await runLoop(env.client, env.protocol, { config, allowMutate: true, rounds: 2, everyMs: 0 });
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.history.length, 2);
  assert.equal(result.history[0].tasks.results[0].status, 'REJECTED');
  assert.equal(result.history[1].tasks.results[0].status, 'NOT_EXECUTED');
  assert.equal(sends, 1);
});


test('invalid or missing task progress cannot authorize main, branch or achievement reward writes', async () => {
  for (const progress of [null, undefined, NaN, -1, '']) {
    const client = { async request(name) {
      if (name === 'MainTaskInfoRequest') return { task: { taskId: 1, progress, rewardClaimed: false }, branch: [{ taskId: 1, progress }] };
      if (name === 'AchievementInfoRequest') return { task: [{ id: 1, progress, targetProgress: null, rewardClaimed: false }] };
      return {};
    } };
    const survey = await surveyTasks(client, {}, { config: { tables: {
      MainTaskCfg: config.tables.MainTaskCfg, BranchTaskCfg: config.tables.MainTaskCfg,
    } } });
    assert.deepEqual(survey.plan, []);
    assert.equal(survey.plan.some((step) => step.kind === 'achievement'), false);
  }
});
