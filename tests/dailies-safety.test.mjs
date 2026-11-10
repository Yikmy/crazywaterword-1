import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol } from '../src/proto.mjs';
import { DAILY_DRIVERS, runDailies, claimDailies, surveyDailies } from '../src/dailies.mjs';

const protocol = loadProtocol();
const noSleep = async () => {};
const clickConfig = { tables: { OfflineParamCfg: { data: [
  { paramName: '免费点金次数', paramValue: 3 }, { paramName: '点金价格', paramValue: 50 },
] } } };
const daily = (id, count = 1) => ({ id, progress: 0, targetProgress: count, title: String(id) });
const queryNames = new Set(['DailyTaskInfoRequest', 'AllItemRequest', 'AllResourceRequest', 'DailyGiftPackRequest', ...Object.values(DAILY_DRIVERS).flatMap((driver) => (driver.probes ?? []).map(([name]) => name))]);
function fixture({ tasks = [], replies = {}, write, watch } = {}) {
  const calls = [];
  const mutations = [];
  const client = {
    connected: true,
    async request(name, body) {
      calls.push(name);
      if (!queryNames.has(name)) { mutations.push(name); return write ? write(name, body) : {}; }
      if (typeof replies[name] === 'function') return replies[name](body);
      if (Object.hasOwn(replies, name)) return replies[name];
      if (name === 'DailyTaskInfoRequest') return { dailyTask: tasks, dailyRewardClaimed: [], weeklyRewardClaimed: [] };
      if (name === 'AllItemRequest') return { items: [] };
      if (name === 'AllResourceRequest') return { list: [{ res: 4, amount: 1000 }] };
      if (name === 'DailyGiftPackRequest') return { heroId: 'synthetic-hero', drawnPack: ['赠礼'] };
      return {};
    },
    async sendWatch(name, body) { calls.push(name); mutations.push(name); return watch?.(name, body); },
  };
  return { client, calls, mutations };
}
const surveyOf = (task, actions, extra = {}) => ({ tasks: [{ task, status: 'ready', actions }], ...extra });

test('DiscountShop marks known dynamic price paid and uses its actual response type', () => {
  const evaluate = (shop) => DAILY_DRIVERS[1007].evaluate({ task: daily(1007), ruby: 1000, probe: () => shop });
  const result = evaluate({ shopItem: [{ id: 1, price: 200, discount: 0.5, isBuy: false }] });
  assert.equal(result.status, 'paid');
  assert.equal(result.actions[0].paid, true);
  assert.equal(result.actions[0].needsPaid, true);
  assert.equal(result.actions[0].cost, '钻石 x100');
  assert.equal(result.actions[0].response, 'DiscountShopBuyResponse');
  const response = protocol.DiscountShopBuyResponse.decode(protocol.DiscountShopBuyResponse.encode({ shopItem: { id: 1, isBuy: true } }).finish());
  assert.equal(response.shopItem.id, 1);
  assert.equal(response.shopItem.isBuy, true);
  for (const item of [
    { id: 1, isBuy: false }, { id: 1, isBuy: false, price: NaN, discount: 1 },
    { id: 1, isBuy: false, price: 10, discount: -1 }, { id: 1, isBuy: false, price: 10, discount: 2 },
  ]) {
    const invalid = evaluate({ shopItem: [item] });
    assert.equal(invalid.status, 'unknown');
    assert.equal(invalid.actions, undefined);
  }
});

test('D6 blocks forged ready discount, paid gold and paid gifts even with allowPaid', async () => {
  for (const allowPaid of [false, true]) {
    for (const action of [
      { request: 'DiscountShopBuyRequest', body: { id: 1 }, cost: '无', paid: false },
      { request: 'ClickGoldRequest', body: { free: false, times: 1 }, cost: '无' },
      { request: 'GotFreeDailyPackRequest', body: { packId: '礼包1' }, cost: '无' },
      { request: 'UnknownRequest', body: {}, cost: '无' },
    ]) {
      const f = fixture();
      const result = await runDailies(f.client, protocol, surveyOf(daily(1007), [action]), { allowMutate: true, allowPaid, claimRewards: false, sleep: noSleep });
      assert.equal(result[0].status, 'NOT_EXECUTED');
      assert.equal(f.calls.length, 0);
      assert.equal(f.mutations.length, 0);
    }
  }
});

test('execution rechecks free allowance against config and fresh server state', async () => {
  const task = daily(1006);
  const action = { request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数' };
  for (const [config, freeTimes, expected] of [[clickConfig, 3, 0], [{ tables: {} }, 0, 0], [clickConfig, 0, 1]]) {
    const f = fixture({ tasks: [task], replies: { ClickGoldInfoRequest: { info: { freeTimes, paidTimes: 0, maxPaidTimes: 7 } } } });
    const result = await runDailies(f.client, protocol, surveyOf(task, [action]), { allowMutate: true, claimRewards: false, config, sleep: noSleep });
    assert.equal(f.mutations.length, expected);
    assert.equal(result[0].status, expected ? 'SUCCESS' : 'NOT_EXECUTED');
  }
});

test('silent daily action is UNKNOWN and stops later drivers and reward collection', async () => {
  const task = daily(1010, 2);
  const pirates = [{ uid: 'p1', cityId: 1 }, { uid: 'p2', cityId: 1 }];
  const actions = DAILY_DRIVERS[1010].evaluate({ task, probe: () => ({ pirates }) }).actions;
  const f = fixture({ tasks: [task], replies: { AllPirateRequest: { pirates } } });
  const result = await runDailies(f.client, protocol, surveyOf(task, actions), { allowMutate: true, sleep: noSleep });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'UNKNOWN');
  assert.equal(result[0].ok, null);
  assert.deepEqual(f.mutations, ['PirateSweepRequest']);
});

test('daily cancellation during survey or delay cannot dispatch the next request', async () => {
  const ac = new AbortController();
  const f = fixture({ replies: { DailyTaskInfoRequest: () => { ac.abort(); return { dailyTask: [] }; } } });
  await assert.rejects(surveyDailies(f.client, protocol, { signal: ac.signal }), { code: 'CANCELLED' });
  assert.deepEqual(f.calls, ['DailyTaskInfoRequest']);
  const other = fixture();
  const delayAbort = new AbortController();
  const result = await runDailies(other.client, protocol, { tasks: [] }, {
    allowMutate: true, signal: delayAbort.signal,
    sleep: async () => { delayAbort.abort(); },
  });
  assert.equal(result[0].status, 'CANCELLED');
  assert.deepEqual(other.calls, []);
});

test('transport timeout is UNKNOWN and definite rejection is remembered across runs', async () => {
  const task = daily(1006, 2);
  const action = { request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数' };
  for (const code of ['TIMEOUT', 'REJECTED']) {
    const f = fixture({ tasks: [task], replies: { ClickGoldInfoRequest: { info: { freeTimes: 0 } } }, write: () => { const error = new Error(code); error.code = code; throw error; } });
    const rejected = new Set();
    const result = await runDailies(f.client, protocol, surveyOf(task, [action, action]), { allowMutate: true, claimRewards: false, config: clickConfig, sleep: noSleep, rejected });
    assert.equal(result[0].status, code === 'REJECTED' ? 'REJECTED' : 'UNKNOWN');
    assert.equal(f.mutations.length, 1);
    if (code === 'REJECTED') {
      await runDailies(f.client, protocol, surveyOf(task, [action]), { allowMutate: true, claimRewards: false, config: clickConfig, sleep: noSleep, rejected });
      assert.equal(f.mutations.length, 1);
    }
  }
});

test('missing declared response refuses daily mutation rather than using sendWatch', async () => {
  const task = daily(1006);
  const action = { request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数' };
  const f = fixture({ tasks: [task], replies: { ClickGoldInfoRequest: { info: { freeTimes: 0 } } } });
  const stripped = { ...protocol }; delete stripped.ClickGoldResponse;
  const result = await runDailies(f.client, stripped, surveyOf(task, [action]), { allowMutate: true, claimRewards: false, config: clickConfig, sleep: noSleep });
  assert.equal(result[0].status, 'NOT_EXECUTED');
  assert.deepEqual(f.mutations, []);
});

test('free gift is reported once and only a fresh drawnPack confirms success', async () => {
  for (const confirmed of [false, true]) {
    let queries = 0;
    const f = fixture({ replies: { DailyGiftPackRequest: () => ({ heroId: 'synthetic-hero', drawnPack: ++queries === 1 || !confirmed ? [] : ['赠礼'] }) } });
    const confirmations = [];
    f.client.confirmWatchedWrite = (name, body) => confirmations.push({ name, body });
    const result = await claimDailies(f.client, protocol, { allowMutate: true, sleep: noSleep });
    assert.equal(confirmations.length, confirmed ? 1 : 0);
    assert.equal(result.length, 1);
    assert.equal(result[0].status, confirmed ? 'SUCCESS' : 'UNKNOWN');
    assert.equal(result[0].ok, confirmed ? true : null);
    assert.deepEqual(f.mutations, ['GotFreeDailyPackRequest']);
  }
});

test('unconfirmed first activity chest prevents the next chest and gift', async () => {
  const config = { tables: {
    DailyActivityRewardCfg: { data: [{ id: 1, activity: 20 }] },
    WeeklyActivityRewardCfg: { data: [{ id: 1, activity: 120 }] },
  } };
  const f = fixture({ replies: { DailyTaskInfoRequest: { dailyTask: [], dailyActivity: 20, weeklyActivity: 120, dailyRewardClaimed: [], weeklyRewardClaimed: [] } } });
  const result = await claimDailies(f.client, protocol, { allowMutate: true, config, sleep: noSleep });
  assert.equal(result[0].status, 'UNKNOWN');
  assert.deepEqual(f.mutations, ['DrawDailyRewardRequest']);
  assert.equal(f.calls.includes('DailyGiftPackRequest'), false);
});

test('a failed required probe stays unknown instead of advertising a writable plan', async () => {
  const f = fixture({ tasks: [daily(1006)], replies: { ClickGoldInfoRequest: () => { throw new Error('offline probe failure'); } } });
  const report = await surveyDailies(f.client, protocol, { config: clickConfig });
  assert.equal(report.tasks[0].status, 'unknown');
  assert.match(report.tasks[0].reason, /offline probe failure/);
  assert.deepEqual(report.tasks[0].actions, []);
});
