import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol } from '../src/proto.mjs';
import { DAILY_DRIVERS, surveyDailies, runDailies, claimDailies, chestTiers, planChests, planDailyGift } from '../src/dailies.mjs';

const protocol = loadProtocol();
const task = { id: 1006, progress: 0, targetProgress: 2 };
const config = { tables: { OfflineParamCfg: { data: [
  { paramName: '免费点金次数', paramValue: 3 }, { paramName: '点金价格', paramValue: 50 },
] } } };
const evaluate = (info, suppliedConfig = config) => DAILY_DRIVERS[1006].evaluate({ task, probe: () => ({ info }), config: suppliedConfig, ruby: 1000 });
const roundtrip = (name, body) => protocol[name].decode(protocol[name].encode(body).finish());

test('missing protobuf freeTimes inherits zero but cannot authorize a free click', () => {
  const response = roundtrip('ClickGoldInfoResponse', { info: {} });
  assert.equal(response.info.freeTimes, 0);
  assert.equal(Object.hasOwn(response.info, 'freeTimes'), false);
  assert.equal(evaluate(response.info).status, 'unknown');
  assert.equal(evaluate(response.info).actions, undefined);
  assert.equal(evaluate(roundtrip('ClickGoldInfoResponse', { info: { freeTimes: 0 } }).info).actions.length, 2);
});

test('free click requires explicit valid usage and a unique numeric configured allowance', () => {
  for (const freeTimes of [undefined, null, NaN, Infinity, -1, 1.5, '0', 4]) {
    const result = evaluate({ freeTimes });
    assert.equal(result.status, 'unknown');
    assert.equal(result.actions, undefined);
  }
  for (const rows of [[], [{ paramName: '免费点金次数' }],
    ...[null, NaN, Infinity, -1, 1.5, '3'].map((paramValue) => [{ paramName: '免费点金次数', paramValue }]),
    [{ paramName: '免费点金次数', paramValue: 3 }, { paramName: '免费点金次数', paramValue: 4 }],
  ]) {
    const result = evaluate({ freeTimes: 0 }, { tables: { OfflineParamCfg: { data: rows } } });
    assert.equal(result.status, 'unknown');
    assert.equal(result.actions, undefined);
  }
});

test('a depleted free allowance does not invent paid price or paid usage metadata', () => {
  for (const info of [{ freeTimes: 3 }, { freeTimes: 3, paidTimes: null, maxPaidTimes: 7 }, { freeTimes: 3, paidTimes: 0 }]) {
    assert.equal(evaluate(info).status, 'unknown');
    assert.equal(evaluate(info).actions, undefined);
  }
});

function clientWith({ id = 1006, info = {}, items = [], recruit = {}, writes = [] } = {}) {
  return {
    async request(name) {
      if (name === 'DailyTaskInfoRequest') return { dailyTask: [{ id, progress: 0, targetProgress: 2 }] };
      if (name === 'ClickGoldInfoRequest') return { info };
      if (name === 'RecruitInfoRequest') return { hero: recruit };
      if (name === 'AllItemRequest') return { items };
      if (name === 'AllResourceRequest') return { list: [] };
      if (name === 'DailyGiftPackRequest') return { heroId: 'synthetic-hero', drawnPack: ['赠礼'] };
      if (name === 'ClickGoldRequest' || name === 'RecruitStartRequest') writes.push(name);
      return {};
    },
  };
}

test('fresh missing freeTimes invalidates a previously valid free-click plan without dispatch', async () => {
  const writes = [];
  const oldActions = evaluate({ freeTimes: 0 }).actions;
  const result = await runDailies(clientWith({ writes }), protocol, {
    tasks: [{ task, status: 'ready', actions: oldActions }], config,
  }, { allowMutate: true, claimRewards: false, sleep: async () => {} });
  assert.equal(result[0].status, 'NOT_EXECUTED');
  assert.deepEqual(writes, []);
});

test('free recruit requires an explicit timestamp; missing, invalid or absent tickets never produce way2', () => {
  const recruitTask = { id: 1002, progress: 0, targetProgress: 2 };
  for (const hero of [{}, { freeEndTimeSeconds: null }, { freeEndTimeSeconds: NaN }, { freeEndTimeSeconds: '0' }]) {
    const result = DAILY_DRIVERS[1002].evaluate({ task: recruitTask, probe: () => ({ hero }), items: new Map(), now: 100 });
    assert.equal(result.status, 'unknown');
    assert.equal(result.actions, undefined);
  }
  for (const items of [undefined, null, new Map(), new Map([['抽卡券', null]]), new Map([['抽卡券', NaN]])]) {
    const result = DAILY_DRIVERS[1002].evaluate({ task: recruitTask, probe: () => ({ hero: { freeEndTimeSeconds: 200 } }), items, now: 100 });
    assert.equal(result.actions, undefined);
  }
});

test('recruit ticket quantities reuse safe int64 facts and malformed duplicate quantities stay unknown', async () => {
  const encoded = roundtrip('AllItemResponse', { items: [{ itemId: '抽卡券', num: 2 }] });
  const good = await surveyDailies(clientWith({ id: 1002, recruit: { freeEndTimeSeconds: 2147483647 }, items: encoded.items }), protocol, { config });
  assert.deepEqual(good.tasks[0].actions.map((action) => action.body.way), [2, 2]);
  for (const bad of [{ itemId: '抽卡券' }, { itemId: '抽卡券', num: null }, { itemId: '抽卡券', num: NaN }, { itemId: '抽卡券', num: -1 }]) {
    const report = await surveyDailies(clientWith({ id: 1002, recruit: { freeEndTimeSeconds: 2147483647 }, items: [{ itemId: '抽卡券', num: 2 }, bad] }), protocol, { config });
    assert.equal(report.tasks[0].status, 'unknown');
    assert.equal(report.tasks[0].actions, undefined);
  }
});

test('real gift codec preserves an omitted empty repeated list while malformed plain status stays unknown', () => {
  assert.throws(() => protocol.DailyGiftPackResponse.decode(new Uint8Array()), /missing required 'heroId'/);
  const decoded = roundtrip('DailyGiftPackResponse', { heroId: 'synthetic-hero' });
  assert.deepEqual(decoded.drawnPack, []);
  assert.equal(planDailyGift(decoded).freeAvailable, true);
  assert.equal(planDailyGift(decoded).actions.length, 1);
  for (const response of [{}, { heroId: 'h' }, { drawnPack: [] }, { heroId: 'h', drawnPack: '赠礼' }, { heroId: 'h', drawnPack: [null] }]) {
    assert.equal(planDailyGift(response).status, 'unknown');
    assert.equal(planDailyGift(response).freeAvailable, null);
    assert.deepEqual(planDailyGift(response).actions, []);
  }
});

const chestConfig = { tables: {
  DailyActivityRewardCfg: { data: [{ id: 1, activity: 20 }] },
  WeeklyActivityRewardCfg: { data: [{ id: 1, activity: 120 }] },
} };

test('activity eligibility rejects NaN/null/coercible values and uses genuine decoded empty claimed lists', () => {
  for (const activity of [NaN, null, undefined, Infinity, -1, '20', false]) {
    assert.deepEqual(chestTiers(chestConfig, { activity }), []);
    const plan = planChests({ dailyActivity: activity, dailyRewardClaimed: [], weeklyActivity: 0, weeklyRewardClaimed: [] }, chestConfig);
    assert.deepEqual(plan.actions, []);
    assert.equal(plan.daily.status, 'unknown');
  }
  for (const claimed of [null, '1', [null], ['1'], [NaN]]) {
    assert.deepEqual(chestTiers(chestConfig, { activity: 20, claimed }), []);
    assert.deepEqual(planChests({ dailyActivity: 20, dailyRewardClaimed: claimed }, chestConfig).actions, []);
  }
  const empty = roundtrip('DailyTaskInfoResponse', {});
  assert.equal(Object.hasOwn(empty, 'dailyActivity'), false);
  assert.deepEqual(planChests(empty, chestConfig).actions, []);
  const good = roundtrip('DailyTaskInfoResponse', { dailyActivity: 20, weeklyActivity: 0 });
  assert.deepEqual(good.dailyRewardClaimed, []);
  assert.deepEqual(planChests(good, chestConfig).actions[0].body.index, [1]);
});

function rewardsFixture({ tasks = [], activity = 0, gift = { heroId: 'synthetic-hero', drawnPack: ['赠礼'] }, claimed = [] } = {}) {
  const writes = [], confirmations = [], reads = [];
  const client = {
    async request(name) {
      reads.push(name);
      if (name === 'DailyTaskInfoRequest') return { dailyTask: tasks, dailyActivity: activity, dailyRewardClaimed: claimed, weeklyActivity: 0, weeklyRewardClaimed: [] };
      if (name === 'DailyGiftPackRequest') return typeof gift === 'function' ? gift() : gift;
      writes.push(name); return {};
    },
    async sendWatch(name) { writes.push(name); },
    confirmWatchedWrite(name) { confirmations.push(name); },
  };
  return { client, writes, confirmations, reads };
}

test('malformed gift state and NaN activity cannot dispatch reward writes', async () => {
  for (const overrides of [{ gift: {} }, { gift: { heroId: 'h' } }, { activity: NaN }, { activity: null }]) {
    const env = rewardsFixture(overrides);
    await claimDailies(env.client, protocol, { allowMutate: true, config: chestConfig, sleep: async () => {} });
    assert.deepEqual(env.writes, []);
  }
});

test('null/invalid progress, target, identity or missing claimed flag cannot claim a task', async () => {
  const valid = { id: 1006, progress: 2, targetProgress: 2, rewardClaimed: false };
  const omittedFlag = roundtrip('DispDailyTask', { id: 1006, progress: 2, targetProgress: 2 });
  assert.equal(omittedFlag.rewardClaimed, false);
  assert.equal(Object.hasOwn(omittedFlag, 'rewardClaimed'), false);
  const invalidTasks = [
    { ...valid, progress: null, targetProgress: null }, { ...valid, progress: NaN }, { ...valid, progress: Infinity },
    { ...valid, progress: '2' }, { ...valid, targetProgress: -1 }, { ...valid, targetProgress: 0 },
    { ...valid, id: null }, { ...valid, rewardClaimed: null }, omittedFlag,
  ];
  for (const task of invalidTasks) {
    const env = rewardsFixture({ tasks: [task] });
    await claimDailies(env.client, protocol, { allowMutate: true, sleep: async () => {} });
    assert.deepEqual(env.writes, []);
  }
  const env = rewardsFixture({ tasks: [roundtrip('DispDailyTask', valid)] });
  const result = await claimDailies(env.client, protocol, { allowMutate: true, sleep: async () => {} });
  assert.deepEqual(env.writes, ['DrawDailyTaskRewardRequest']);
  assert.equal(result[0].status, 'SUCCESS');
});

test('malformed verification data cannot confirm or release an unresolved reward write', async () => {
  let giftReads = 0;
  const gift = rewardsFixture({ gift: () => ({ heroId: 'h', drawnPack: ++giftReads === 1 ? [] : '赠礼' }) });
  const giftResult = await claimDailies(gift.client, protocol, { allowMutate: true, sleep: async () => {} });
  assert.equal(giftResult[0].status, 'UNKNOWN');
  assert.deepEqual(gift.confirmations, []);
  let dailyReads = 0;
  const chest = rewardsFixture({ activity: 20 });
  const originalRequest = chest.client.request;
  chest.client.request = async (name, ...args) => {
    const response = await originalRequest(name, ...args);
    if (name === 'DailyTaskInfoRequest' && ++dailyReads > 2) response.dailyRewardClaimed = '1';
    return response;
  };
  const chestResult = await claimDailies(chest.client, protocol, { allowMutate: true, config: chestConfig, sleep: async () => {} });
  assert.equal(chestResult[0].status, 'UNKNOWN');
  assert.deepEqual(chest.confirmations, []);
  assert.deepEqual(chest.writes, ['DrawDailyRewardRequest']);
  assert.equal(chest.reads.includes('DailyGiftPackRequest'), false);
});
