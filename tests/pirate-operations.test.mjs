import test from 'node:test';
import assert from 'node:assert/strict';
import { GameClient } from '../src/client.mjs';
import { createCodec } from '../src/codec.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import {
  pirateSweepModule, planPirateSweep, surveyPirateSweep, validatePirateSweepParameters, viewPirateSweep,
} from '../src/pirate-operations.mjs';

const protocol = loadProtocol(), codec = createCodec(protocol);
const context = { accountId: 'offline-pirates', generation: 3, connectionId: 'offline-connection' };
const player = { playerId: '9007199254740993', worldId: '9', vip: { vipLevel: 1 } };
const noon = Date.parse('2026-11-12T05:00:00Z'), used = 2;
const parameters = { uid: 7, cityId: 9 };
const config = () => ({ tables: {
  PirateParamCfg: { data: [{ paramName: '每日野怪扫荡次数', paramValue: 3 }] },
  VipLevelCfg: { data: [{ level: 1, effects: [['野怪扫荡次数', 1]] }, { level: 2, effects: [] }] },
  MonthCardCfg: { data: [{ id: '普通月卡', effectList: [['野怪扫荡次数', 1]] }] },
} });
const testClaims = { resources: [], quotas: [{ id: 'pirate-sweep:2026-11-12', num: 1 }], uids: [{ type: 'pirate', id: '7' }] };
const quota = (used, total = 5) => ({ dayKey: '2026-11-12', used, total, remaining: total - used, reason: null });
const fixture = async t => {
  const data = {
    used, pirates: [{ uid: 7, cityId: 9, type: 1, level: 5, gridIdx: 0 }, { uid: 8, cityId: 10, type: 1, level: 4, gridIdx: 1 },
      { uid: 9, cityId: 11, type: 2, level: 1, gridIdx: 2 }],
    records: [{ type: 1, maxKilledLevel: 5 }], cardItem: [{ type: 1, endTime: -1, gotDailyReward: true }],
    clockMs: noon, clockRadiusMs: 50, clockReliable: true, clockSourceAt: Date.now() - 2000,
    iron: 10, effect: null, unsequenced: null, beforeRead: null,
  };
  const writes = [], reads = [], errors = [];
  let socket, seq = 0;
  class OfflineSocket {
    constructor() { socket = this; this.readyState = 0; }
    open() { this.readyState = 1; this.onopen?.(); }
    close() { this.readyState = 3; }
    receive(name, body, ordered = true) {
      this.onmessage?.({ data: codec.encode(name, ordered ? ++seq : 0, body) });
    }
    send(bytes) {
      const { name, body } = codec.decode(bytes);
      if (['LoginRequest', 'PingRequest', 'Ack', 'Nack'].includes(name)) return;
      if (name === 'PirateSweepRequest') {
        writes.push({ name, body: { ...body } });
        data.effect?.();
        return;
      }
      reads.push(name);
      data.beforeRead?.(name);
      const response = {
        MonthCardRequest: { cardItem: data.cardItem },
        PirateKillRecordRequest: { records: data.records },
        AllItemRequest: { items: [{ itemId: '精铁', num: data.iron }] },
        AllResourceRequest: { list: [] },
        AllPirateRequest: { pirates: data.pirates, ...(data.used === undefined ? {} : { sweepTimes: data.used }) },
      }[name];
      assert.ok(response, 'unexpected offline request: ' + name);
      this.receive(name.replace(/Request$/, 'Response'), response, name !== data.unsequenced);
    }
  }
  const gameClock = {
    reset() {}, markPing() {},
    read() {
      return { status: data.clockReliable ? 'TRUSTED' : 'UNKNOWN', reliable: data.clockReliable, ...context,
        source: 'PingResponse.serverTimestamp', sourceAt: data.clockSourceAt,
        nowMs: data.clockMs, earliestMs: data.clockMs - data.clockRadiusMs, latestMs: data.clockMs + data.clockRadiusMs };
    },
  };
  const client = new GameClient({ protocol, ...context, WebSocketImpl: OfflineSocket, gameClock });
  client.factContext = { ...context };
  client.on('error', error => errors.push(error));
  t.after(() => client.stop());
  const login = client.connect({}); socket.open();
  socket.receive('LoginResponse', { result: 0, initSeqNo: 12, playerInfo: player }, false);
  await login;
  const args = { config: config(), moduleConfig: { enabled: true }, player, parameters, timeout: 100 };
  const survey = (options = {}) => surveyPirateSweep(client, protocol, { ...args, ...options });
  const propose = async (options = {}) => {
    const facts = await survey(options);
    return { facts, plan: planPirateSweep(facts, { ...args, ...options }) };
  };
  const run = (operation, budget) => executeBusinessOperation(client, protocol, operation, {
    ...args, adapter: pirateSweepModule, budget, allowMutate: true, window: 0,
  });
  function runBudget(limits = testClaims) {
    const scope = { ...context, runId: 'offline-pirate-run' };
    const runBudget = createRunBudgetContext({ scope, limits });
    // Lazy child: shared preflight's additional ordered inventory replies must
    // not invalidate the live pirate evidence.
    return { ledger: null, scope, runBudget, limits, batchId: 'offline-pirate-batch' };
  }
  return { data, writes, reads, errors, client, socket, args, survey, propose, run, runBudget };
};

test('actual v76 Codec/client plans exactly one ordinary action with matching UID, city, and day/UID budget', async t => {
  const f = await fixture(t);
  const noTarget = await f.propose({ parameters: {} });
  const view = viewPirateSweep(noTarget.facts, { ...f.args, parameters: {} });
  assert.deepEqual(view.quota, quota(used));
  assert.deepEqual(view.targets.map(({ uid, levelRelation, maxKilledLevel }) => [uid, levelRelation, maxKilledLevel]),
    [[7, 'HIGHEST', 5], [8, 'LOWER', 5], [9, 'FIRST_KILL_REQUIRED', 0]]);
  assert.deepEqual(view.candidates, []);
  assert.deepEqual(noTarget.plan.actions, []);
  const { plan, facts } = await f.propose();
  assert.equal(plan.actions.length, 1);
  const [operation] = plan.actions;
  assert.equal(operation.capabilityId, 'C151');
  assert.equal(operation.actionType, 'SWEEP');
  assert.deepEqual(operation.action, { request: 'PirateSweepRequest', response: null, body: parameters });
  assert.deepEqual(operation.costs, []);
  assert.deepEqual(operation.budgetClaims, testClaims);
  assert.deepEqual(operation.beforeState.quota, quota(2));
  assert.deepEqual(operation.expectedState.quota, quota(3));
  assert.equal(viewPirateSweep(facts, f.args).candidates[0]?.actionId, operation.actionId);
  assert.deepEqual(planPirateSweep({ ...facts }, f.args).actions, [], 'serialized/copied facts do not authorize writes');
  assert.deepEqual(planPirateSweep(facts, { ...f.args, moduleConfig: {} }).actions, []);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.errors, []);
});

test('strict explicit selection: malformed shapes, other city, lower level and first kill are not silently approved', async t => {
  for (const bad of [{ uid: 7 }, { cityId: 9 }, { ...parameters, allowLowerLevel: 1 }, { ...parameters, paid: true },
    { uid: -7, cityId: 9 }, { uid: 2147483648, cityId: 9 }, { uid: '7', cityId: 9 }, { allowLowerLevel: true },
    Object.create(parameters), { get uid() { throw Error('getter must not run'); }, cityId: 9 }]) {
    assert.throws(() => validatePirateSweepParameters(bad), { code: 'INVALID_PARAMETERS' });
  }
  const f = await fixture(t);
  for (const [parameters, reason] of [
    [{ uid: 7, cityId: 10 }, 'PIRATE_TARGET_UID_AND_CITY_NOT_CURRENT'],
    [{ uid: 8, cityId: 10 }, 'PIRATE_LOWER_LEVEL_CONFIRMATION_REQUIRED'],
    [{ uid: 8, cityId: 10, allowLowerLevel: false }, 'PIRATE_LOWER_LEVEL_CONFIRMATION_REQUIRED'],
    [{ uid: 9, cityId: 11, allowLowerLevel: true }, 'PIRATE_FIRST_KILL_REQUIRED'],
  ]) {
    const { plan } = await f.propose({ parameters });
    assert.deepEqual(plan.actions, []);
    assert.deepEqual(plan.notes, [reason]);
  }
  const { plan } = await f.propose({ parameters: { uid: 8, cityId: 10, allowLowerLevel: true } });
  assert.deepEqual(plan.actions.map(row => row.action.body), [{ uid: 8, cityId: 10 }]);
});

test('missing wire counter, duplicate targets, unsequenced reads, quota cap and uncertain clock cannot arm a sweep', async t => {
  for (const [reason, alter] of [
    ['PIRATE_POOL_COUNTER_OR_KILL_RECORDS_UNKNOWN', d => { d.used = undefined; }],
    ['PIRATE_POOL_COUNTER_OR_KILL_RECORDS_UNKNOWN', d => { d.pirates.push(d.pirates[0]); }],
    ['PIRATE_POOL_COUNTER_OR_KILL_RECORDS_UNKNOWN', d => { d.unsequenced = 'AllPirateRequest'; }],
    ['PIRATE_SWEEP_QUOTA_EXHAUSTED', d => { d.used = 5; }],
    ['PIRATE_USED_EXCEEDS_TOTAL', d => { d.used = 6; }],
    ['PIRATE_CLOCK_UNKNOWN', d => { d.clockReliable = false; }],
    ['PIRATE_DAY_POLICIES_DISAGREE', d => { d.clockMs = Date.parse('2026-11-12T15:30:00Z'); }],
    ['PIRATE_DAY_BOUNDARY_UNCERTAIN', d => { d.clockMs = Date.parse('2026-11-12T16:00:05Z'); }],
    ['PIRATE_MONTH_CARD_EXPIRY_UNCERTAIN', d => { d.cardItem[0].endTime = noon / 1000; }],
    ['PIRATE_GAME_DAY_CHANGED', d => { d.beforeRead = name => { if (name === 'AllPirateRequest') d.clockMs = noon + 86400000; }; }],
  ]) {
    await t.test(reason, async t => {
      const f = await fixture(t); alter(f.data);
      const { plan } = await f.propose();
      assert.deepEqual(plan.actions, []);
      assert.deepEqual(plan.notes, [reason]);
      assert.deepEqual(f.writes, []);
    });
  }
});

test('clock change and pirate stream changes invalidate prior authority, even on unrelated sequence traffic', async t => {
  const f = await fixture(t), { facts, plan } = await f.propose();
  f.socket.receive('AllResourceResponse', { list: [] });
  assert.equal(planPirateSweep(facts, f.args).actions[0]?.actionId, plan.actions[0]?.actionId);
  f.socket.receive('SCPirateSweepTimes', {}, false);
  assert.deepEqual(planPirateSweep(facts, f.args).actions, []);
  const next = await f.propose();
  assert.equal(next.plan.actions.length, 1);
  f.socket.receive('SCServerTimeChanged', { serverTimestamp: String(noon) });
  assert.deepEqual(planPirateSweep(next.facts, f.args).actions, []);
  assert.deepEqual((await f.propose()).plan.notes, ['PIRATE_CLOCK_UNKNOWN'], 'clock sample preceding explicit jump is stale');
});

test('scoped declared quota and UID survive shared inventory preflight; independent same-day +1 confirms no reward attribution', async t => {
  const f = await fixture(t);
  const { plan } = await f.propose();
  const [operation] = plan.actions, budget = f.runBudget();
  f.data.effect = () => {
    f.data.used++;
    f.data.iron += 3;
    f.socket.receive('SCPirateSweepTimes', { sweepTimes: f.data.used });
  };
  const result = await f.run(operation, budget);
  assert.equal(result.status, 'SUCCESS', result.error);
  assert.equal(result.dispatched, true);
  assert.equal(result.requestStatus, 'UNKNOWN');
  assert.deepEqual(result.responseEvidence, { namedResponse: 'NONE', reward: 'UNATTRIBUTED' });
  assert.deepEqual(result.afterState.quota, quota(3));
  assert.deepEqual(f.writes, [{ name: 'PirateSweepRequest', body: parameters }]);
  assert.equal(f.reads.filter(name => name === 'AllPirateRequest').length, 3, 'plan, execution baseline and independent readback');
  assert.equal(f.reads.filter(name => name === 'AllItemRequest').length, 4, 'plus shared inventory preflight');
  assert.deepEqual(budget.runBudget.snapshot().reserved, testClaims);
  assert.equal(f.client.uncertainWrites.size, 0);
});

test('the final allowed sweep verifies at exactly zero remaining, without requiring a counter push', async t => {
  const f = await fixture(t);
  f.data.used = 4;
  const { plan } = await f.propose();
  f.data.effect = () => { f.data.used++; };
  const result = await f.run(plan.actions[0], f.runBudget());
  assert.equal(result.status, 'SUCCESS', result.error);
  assert.deepEqual(result.afterState.quota, quota(5));
  assert.equal(f.writes.length, 1);
});

test('stock-only workflow, spent authorization, or a fresh exhausted server quota each stop before dispatch', async t => {
  for (const mode of ['stock-only', 'already-reserved', 'new-server-cap']) {
    await t.test(mode, async t => {
      const f = await fixture(t), { plan, facts } = await f.propose();
      const budget = f.runBudget(mode === 'stock-only' ? { resources: [], quotas: [], uids: [] } : testClaims);
      if (mode === 'new-server-cap') f.data.used = 5;
      if (mode === 'already-reserved') {
        const other = budget.runBudget.child(facts.stock, { batchId: 'earlier-batch', limits: testClaims, scope: budget.scope });
        assert.equal(other.reserveClaims(testClaims), true);
      }
      const result = await f.run(plan.actions[0], budget);
      assert.equal(result.status, 'NOT_EXECUTED', result.error);
      assert.equal(result.dispatched, false);
      assert.deepEqual(f.writes, []);
    });
  }
});

test('an accepted pirate push at the actual outgoing transport boundary stops before socket dispatch', async t => {
  const f = await fixture(t), { plan } = await f.propose(), budget = f.runBudget();
  f.client.on('frame', event => {
    if (event.dir === 'out' && event.name === 'PirateSweepRequest') f.socket.receive('SCPirateSweepTimes', {});
  });
  const result = await f.run(plan.actions[0], budget);
  assert.equal(result.status, 'NOT_EXECUTED', result.error);
  assert.equal(result.dispatched, false);
  assert.equal(result.unresolvedWrite, false);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(budget.runBudget.snapshot().reserved, testClaims);
});

test('a real dispatch stays UNKNOWN without exact isolated same-day readback', async t => {
  for (const [scenario, effect] of [
    ['no increment', () => {}],
    ['two increments', d => { d.used += 2; }],
    ['target disappeared', d => { d.used++; d.pirates.shift(); }],
    ['different pirate changed', d => { d.used++; d.pirates[1].gridIdx++; }],
    ['kill record changed', d => { d.used++; d.records[0].maxKilledLevel++; }],
    ['game day changed', d => { d.used++; d.clockMs += 86400000; }],
    ['conflicting counter push', (d, socket) => { d.used++; socket.receive('SCPirateSweepTimes', { sweepTimes: d.used + 1 }); }],
    ['multiple counter pushes', (d, socket) => {
      d.used++; socket.receive('SCPirateSweepTimes', { sweepTimes: d.used }); socket.receive('SCPirateSweepTimes', { sweepTimes: d.used });
    }],
    ['counter push during independent reread', (d, socket) => {
      d.used++;
      d.beforeRead = name => { if (name === 'AllPirateRequest') socket.receive('SCPirateSweepTimes', { sweepTimes: d.used }); };
    }],
    ['target pool update before independent reread', (d, socket) => { d.used++; socket.receive('SCPirateUpdate', {}); }],
  ]) {
    await t.test(scenario, async t => {
      const f = await fixture(t), { plan } = await f.propose(), budget = f.runBudget();
      f.data.effect = () => effect(f.data, f.socket);
      const result = await f.run(plan.actions[0], budget);
      assert.equal(result.status, 'UNKNOWN', result.error);
      assert.equal(result.dispatched, true);
      assert.equal(result.unresolvedWrite, true);
      assert.equal(result.verification.status, 'UNCONFIRMED');
      assert.equal(f.writes.length, 1);
      assert.equal(f.client.uncertainWrites.size, 1);
      assert.deepEqual(budget.runBudget.snapshot().reserved, testClaims);
    });
  }
});
