import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateOrderSurvey, executeOrderOperation, planOrderExecution, surveyOrderExecution } from '../src/order-execution.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';
import { surveyWorld } from '../src/world.mjs';

const rules = { version: 1, enabled: true, rules: [] };
const config = { tables: { WorkerOrderCfg: { data: [{ itemId: 'wood', reward: [['EXP', 100]] }] } } };
const rawOrder = (overrides = {}) => ({ index: 0, workerId: 'resident-0', textId: 1, isSpecial: false,
  refreshTime: 0, requirements: [{ id: 'wood', num: 2 }], ...overrides });
const water = (orders = [rawOrder()], orderNum = 3) => ({ building: [], workerOrder: orders, orderOfTheDay: { orderNum } });
const protocol = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets', 'FinishWorkerOrder']
  .flatMap((name) => [[name + 'Request', {}], [name + 'Response', {}]]));
protocol.DenyOrderRequest = {};
const refreshRules = { version: 1, enabled: true, rules: [{ id: 'exp', priority: 1, type: 'MIN_EXPERIENCE',
  enabled: true, params: { value: 500, operator: 'GTE' }, onFail: 'REFRESH' }] };
const eligibility = () => ({ source: 'offline-authoritative-fixture', allowed: true, free: true, remaining: 1 });
function makeClient({ waters = [water(), water([], 4)], stock = 2, items, resources = { list: [] }, writeError, onRead } = {}) {
  let stage = 0;
  const writes = [], reads = [], uncertain = new Set(), confirmed = [];
  const client = { connected: true, writes, reads, uncertain, confirmed,
    async request(name, body, response, timeout, options) {
      if (options?.mutate) {
        writes.push({ name, body }); stage++;
        if (writeError) throw writeError;
        return {};
      }
      reads.push(name); onRead?.(name, client);
      if (name === 'OnWaterRequest') return structuredClone(waters[Math.min(stage, waters.length - 1)]);
      if (name === 'AllItemRequest') return structuredClone(items ?? { items: [{ itemId: 'wood', num: stock }] });
      if (name === 'AllResourceRequest') return structuredClone(resources);
      if (name === 'MyResFieldsRequest') return { info: { fields: [] } };
      if (name === 'MyFleetsRequest') return { fleets: [] };
      throw new Error('unexpected request ' + name);
    },
    async sendWatch(name, body) { writes.push({ name, body }); stage++; uncertain.add(JSON.stringify({ name, body })); return { status: 'UNKNOWN' }; },
    markUnverifiedWrite(name, body) { uncertain.add(JSON.stringify({ name, body })); },
    confirmWatchedWrite(name, body) { confirmed.push({ name, body }); uncertain.delete(JSON.stringify({ name, body })); },
  };
  return client;
}
async function makePlan(client, extra = {}) {
  const survey = await surveyOrderExecution(client, protocol, { config });
  return planOrderExecution(survey, { rules, ...extra });
}
const execute = (client, op, extra = {}) => executeOrderOperation(client, protocol, op, { rules, config, ...extra });

test('order survey decorates the existing collection once and composes an existing survey wrapper', async () => {
  const client = makeClient();
  const survey = await surveyOrderExecution(client, protocol, { config, survey: async (...args) => ({ ...(await surveyWorld(...args)), cityReliability: { buildings: true } }) });
  assert.equal(client.reads.length, 5);
  assert.deepEqual(survey.orderReliability, { orders: true, counter: true });
  assert.equal(survey.rawOrderMetadata.orderNum, 3);
  assert.equal(survey.cityReliability.buildings, true);
  assert.equal(planOrderExecution(survey, { rules }).actions.length, 1);
});

test('display defaults cannot turn missing raw orders or progress into authority', () => {
  const view = { orders: [], stock: new Map(), stockReliable: true, orderOfTheDay: { orderNum: 0 } };
  const decorated = decorateOrderSurvey(view, { building: [] });
  assert.deepEqual(decorated.orderReliability, { orders: false, counter: false });
  assert.equal(decorated.rawOrderMetadata.orderNum, null);
  assert.equal(planOrderExecution(decorated, { rules }).actions.length, 0);
});

for (const mode of ['Manual', 'Hybrid', 'Automatic']) {
  test(`${mode} planning uses the same rules and defers authorization to the service`, async () => {
    const client = makeClient(), plan = await makePlan(client, { mode });
    assert.equal(plan.mode, mode); assert.equal(plan.actions.length, 1); assert.equal(client.writes.length, 0);
    assert.equal(plan.rows[0].actionType, 'SUBMIT');
    assert.deepEqual(plan.resourceBudget, [{ id: 'wood', num: 2 }]);
  });
}

test('planning shares a single ledger with city/production and aggregates duplicate requirements', async () => {
  const client = makeClient({ waters: [water([rawOrder({ requirements: [{ id: 'wood', num: 1 }, { id: 'wood', num: 1 }] }), rawOrder({ index: 1 })])], stock: 2 });
  const survey = await surveyOrderExecution(client, protocol, { config }), ledger = new ResourceLedger(survey.stock);
  const plan = planOrderExecution(survey, { rules, ledger });
  assert.equal(plan.actions.length, 1);
  assert.deepEqual(plan.actions[0].costs, [{ id: 'wood', num: 2 }]);
  assert.equal(ledger.reserve([{ id: 'wood', num: 1 }]), false);
  assert.match(plan.rows[1].blockedReason, /共享资源预算/);
});

test('unselected earlier orders do not consume budget needed by a later selection', async () => {
  const client = makeClient({ waters: [water([rawOrder(), rawOrder({ index: 1 })])] });
  const survey = await surveyOrderExecution(client, protocol, { config });
  const preview = planOrderExecution(survey, { rules, selections: [] });
  assert.equal(preview.actions.length, 0);
  assert.equal(preview.rows.every((row) => row.executable), true);
  const plan = planOrderExecution(survey, { rules, selections: [preview.rows[1].actionId] });
  assert.equal(plan.rows.length, 2); assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].target.index, 1);
});

for (const onFail of ['KEEP', 'REVIEW']) {
  test(`${onFail} remains a read-only decision`, async () => {
    const policy = structuredClone(refreshRules); policy.rules[0].onFail = onFail;
    const client = makeClient(), plan = await makePlan(client, { rules: policy });
    assert.equal(plan.actions.length, 0); assert.equal(plan.rows[0].executable, false);
    assert.equal((await execute(client, plan.rows[0], { rules: policy })).status, 'NOT_EXECUTED');
    assert.equal(client.writes.length, 0);
  });
}

test('refresh without verified free allowance is blocked even when a plan is tampered executable', async () => {
  const client = makeClient(), plan = await makePlan(client, { rules: refreshRules });
  assert.equal(plan.rows[0].actionType, 'REFRESH'); assert.equal(plan.rows[0].executable, false);
  assert.match(plan.rows[0].blockedReason, /免费刷新/);
  const result = await execute(client, { ...plan.rows[0], executable: true }, { rules: refreshRules });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
});

for (const bad of [null, {}, { allowed: true, free: true, remaining: 1 }, { source: 'fixture', allowed: true, free: false, remaining: 1 }, { source: 'fixture', allowed: true, free: true, remaining: 0 }]) {
  test('unproven refresh allowance never grants execution: ' + JSON.stringify(bad), async () => {
    const plan = await makePlan(makeClient(), { rules: refreshRules, refreshEligibility: () => bad });
    assert.equal(plan.actions.length, 0);
  });
}

test('authoritatively verified refresh re-evaluates the replacement without submitting it', async () => {
  const replacement = rawOrder({ textId: 2, refreshTime: 50, requirements: [{ id: 'wood', num: 1 }] });
  const client = makeClient({ waters: [water(), water([replacement], 3)] });
  const plan = await makePlan(client, { rules: refreshRules, refreshEligibility: eligibility });
  const result = await execute(client, plan.actions[0], { rules: refreshRules, refreshEligibility: eligibility });
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.requestStatus, 'UNKNOWN');
  assert.equal(result.afterState.textId, 2); assert.equal(result.nextDecision.decision, 'RECOMMEND_REFRESH');
  assert.deepEqual(client.writes.map(({ name }) => name), ['DenyOrderRequest']);
  assert.equal(client.uncertain.size, 0);
});

test('submission succeeds only after order change plus exactly one authoritative completion', async () => {
  const client = makeClient(), plan = await makePlan(client), budget = { ledger: new ResourceLedger(new Map([['wood', 2]])) };
  const callbacks = [];
  const result = await execute(client, plan.actions[0], { budget, onStep: (entry) => callbacks.push(entry) });
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.requestStatus, 'SUCCESS');
  assert.equal(result.verification.counterBefore, 3); assert.equal(result.verification.counterAfter, 4);
  assert.equal(budget.ledger.available('wood'), 0); assert.equal(client.uncertain.size, 0);
  assert.deepEqual(client.writes, [{ name: 'FinishWorkerOrderRequest', body: { index: 0 } }]);
  assert.equal(callbacks.length, 1); assert.equal(callbacks[0].verification.status, 'CONFIRMED');
});

for (const [label, after] of [
  ['same order despite typed success', water([rawOrder()], 4)],
  ['order change without completion', water([], 3)],
  ['ambiguous multiple completions', water([], 5)],
  ['missing raw counter', { building: [], workerOrder: [] }],
  ['missing raw order list', { building: [], orderOfTheDay: { orderNum: 4 } }],
  ['malformed remaining index', water([rawOrder({ index: null })], 4)],
]) {
  test(label + ' remains UNKNOWN and holds reservation/fingerprint', async () => {
    const client = makeClient({ waters: [water(), after] }), plan = await makePlan(client), budget = { ledger: null };
    const result = await execute(client, plan.actions[0], { budget });
    assert.equal(result.status, 'UNKNOWN'); assert.equal(result.ok, null);
    assert.equal(result.reservation.held, true); assert.equal(budget.ledger.available('wood'), 0);
    assert.equal(client.uncertain.size, 1); assert.equal(client.confirmed.length, 0);
    assert.equal(client.writes.length, 1);
  });
}

for (const change of [
  { workerId: 'another-resident' }, { textId: 2 }, { isSpecial: true }, { refreshTime: 20 },
  { requirements: [{ id: 'wood', num: 1 }] },
]) {
  test('same index with changed identity is not submitted: ' + JSON.stringify(change), async () => {
    const client = makeClient(), plan = await makePlan(client);
    const changed = makeClient({ waters: [water([rawOrder(change)])] });
    assert.equal((await execute(changed, plan.actions[0])).status, 'NOT_EXECUTED');
    assert.equal(changed.writes.length, 0);
  });
}

test('execution re-evaluates current policy rather than trusting the planned recommendation', async () => {
  const client = makeClient(), plan = await makePlan(client);
  const result = await execute(client, plan.actions[0], { rules: refreshRules });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
});

test('tampered zero costs and arbitrary action bodies never reach a write', async () => {
  const client = makeClient(), plan = await makePlan(client);
  const result = await execute(client, { ...plan.actions[0], costs: [] });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
  const safe = await execute(client, { ...plan.actions[0], action: { request: 'BuyRubyRequest', body: { index: 99 } } });
  assert.equal(safe.status, 'SUCCESS');
  assert.deepEqual(client.writes.map(({ name }) => name), ['FinishWorkerOrderRequest']);
});

test('two submissions cannot reuse a stale material snapshot through their shared execution budget', async () => {
  const first = rawOrder(), second = rawOrder({ index: 1 });
  const client = makeClient({ waters: [water([first, second], 3), water([second], 4), water([], 5)], stock: 2 });
  const plan = await makePlan(client, { ledger: new ResourceLedger(new Map([['wood', 4]])) });
  const budget = { ledger: null };
  assert.equal((await execute(client, plan.actions[0], { budget })).status, 'SUCCESS');
  assert.equal((await execute(client, plan.actions[1], { budget })).status, 'NOT_EXECUTED');
  assert.equal(client.writes.length, 1); assert.equal(budget.ledger.available('wood'), 0);
});

for (const [label, details] of [
  ['unknown quantity', { requirements: [{ id: 'wood', num: null }] }],
  ['unsafe quantity', { requirements: [{ id: 'wood', num: Number.MAX_SAFE_INTEGER + 1 }] }],
  ['empty requirements', { requirements: [] }], ['missing worker', { workerId: null }], ['ambiguous wire index', { index: '01' }],
]) {
  test(label + ' never becomes a zero-cost executable order', async () => {
    const client = makeClient({ waters: [water([rawOrder(details)])] });
    assert.equal((await makePlan(client)).actions.length, 0); assert.equal(client.writes.length, 0);
  });
}

test('unknown stock and missing completion count fail closed before execution', async () => {
  assert.equal((await makePlan(makeClient({ items: {} }))).actions.length, 0);
  const client = makeClient({ waters: [{ building: [], workerOrder: [rawOrder()] }] });
  assert.equal((await makePlan(client)).actions.length, 0);
});

test('raw malformed Long costs cannot be repaired by the existing display normalizer', async () => {
  const client = makeClient({ waters: [water([rawOrder({ requirements: [{ id: 'wood', num: { low: 4294967298, high: 0 } }] })])] });
  assert.equal((await makePlan(client)).actions.length, 0);
});

for (const [status, error] of [['REJECTED', { code: 'REJECTED' }], ['RATE_LIMITED', { code: 'RATE_LIMITED' }], ['CANCELLED', { code: 'CANCELLED' }]]) {
  test(status + ' follows the existing execution outcome without retries', async () => {
    const client = makeClient({ writeError: Object.assign(new Error(status), error) }), plan = await makePlan(client);
    const result = await execute(client, plan.actions[0]);
    assert.equal(result.status, status === 'CANCELLED' ? 'UNKNOWN' : status); assert.equal(client.writes.length, 1);
    if (status !== 'REJECTED') { assert.equal(result.unresolvedWrite, true); assert.equal(client.uncertain.size, 1); }
    assert.equal(client.confirmed.length, 0);
  });
}

test('aborted execution and a revoked server guard do not dispatch a write', async () => {
  const client = makeClient(), plan = await makePlan(client), controller = new AbortController(); controller.abort();
  assert.equal((await execute(client, plan.actions[0], { signal: controller.signal })).status, 'CANCELLED');
  const result = await execute(client, plan.actions[0], { assertActive: () => { throw Object.assign(new Error('authorization revoked'), { code: 'NOT_EXECUTED' }); } });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
});

test('cancellation during post-dispatch reread persists UNKNOWN rather than a safe pre-dispatch cancellation', async () => {
  const controller = new AbortController();
  const client = makeClient({ onRead: (name, current) => { if (name === 'OnWaterRequest' && current.writes.length) controller.abort(); } });
  const plan = await makePlan(client), budget = { ledger: null };
  const result = await execute(client, plan.actions[0], { signal: controller.signal, budget });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.requestStatus, 'SUCCESS');
  assert.equal(result.unresolvedWrite, true); assert.equal(client.uncertain.size, 1);
  assert.equal(budget.ledger.available('wood'), 0); assert.equal(client.writes.length, 1);
});

test('multiple refresh plans cannot reuse a stale free-refresh allowance in their shared execution budget', async () => {
  const second = rawOrder({ index: 1, workerId: 'resident-1' });
  const replacement = rawOrder({ textId: 2, refreshTime: 50, requirements: [{ id: 'wood', num: 1 }] });
  const client = makeClient({ waters: [water([rawOrder(), second]), water([replacement, second])] });
  const preview = await makePlan(client, { rules: refreshRules, refreshEligibility: eligibility, selections: [] });
  const all = await makePlan(client, { rules: refreshRules, refreshEligibility: eligibility });
  assert.equal(all.actions.length, 1); assert.match(all.rows[1].blockedReason, /刷新配额已预留/);
  const first = await makePlan(client, { rules: refreshRules, refreshEligibility: eligibility, selections: [preview.rows[0].actionId] });
  const other = await makePlan(client, { rules: refreshRules, refreshEligibility: eligibility, selections: [preview.rows[1].actionId] });
  const budget = { ledger: null };
  assert.equal((await execute(client, first.actions[0], { rules: refreshRules, refreshEligibility: eligibility, budget })).status, 'SUCCESS');
  const blocked = await execute(client, other.actions[0], { rules: refreshRules, refreshEligibility: eligibility, budget });
  assert.equal(blocked.status, 'NOT_EXECUTED'); assert.match(blocked.error, /刷新配额已预留/);
  assert.equal(client.writes.length, 1); assert.equal(budget.orderRefreshQuotas.get('offline-authoritative-fixture'), 0);
});

test('a transport timeout stops immediately even if server state already changed, keeping budget and fingerprint', async () => {
  const client = makeClient({ writeError: new Error('synthetic transport timeout'), waters: [water(), water([], 4)] });
  const plan = await makePlan(client), readsBefore = client.reads.length, budget = { ledger: null };
  const result = await execute(client, plan.actions[0], { budget });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.requestStatus, 'UNKNOWN');
  assert.equal(result.unresolvedWrite, true); assert.equal(result.verification.status, 'UNCONFIRMED');
  assert.equal(client.reads.length - readsBefore, 7, 'only preflight survey and fresh material reads, no post-timeout recovery reads');
  assert.equal(client.writes.length, 1); assert.equal(client.uncertain.size, 1); assert.equal(client.confirmed.length, 0);
  assert.equal(budget.ledger.available('wood'), 0);
});

test('revoked authorization after a dispatched write remains unresolved UNKNOWN with reservation and fingerprint', async () => {
  const client = makeClient(), plan = await makePlan(client), budget = { ledger: null };
  const request = client.request.bind(client);
  let revoked = false;
  client.request = async (...args) => {
    const response = await request(...args);
    if (args[4]?.mutate) revoked = true;
    return response;
  };
  const result = await execute(client, plan.actions[0], { budget, assertActive: () => {
    if (revoked) throw Object.assign(new Error('synthetic policy changed after dispatch'), { code: 'NOT_EXECUTED' });
  } });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.requestStatus, 'SUCCESS');
  assert.equal(result.dispatched, true); assert.equal(result.unresolvedWrite, true);
  assert.equal(result.reservation.held, true); assert.equal(budget.ledger.available('wood'), 0);
  assert.equal(client.uncertain.size, 1); assert.equal(client.confirmed.length, 0); assert.equal(client.writes.length, 1);
});

test('a lower executor NOT_EXECUTED outcome after entering dispatch cannot release unresolved evidence', async () => {
  const client = makeClient({ writeError: Object.assign(new Error('synthetic late authorization failure'), { code: 'NOT_EXECUTED' }) });
  const plan = await makePlan(client), budget = { ledger: null };
  const result = await execute(client, plan.actions[0], { budget });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.requestStatus, 'NOT_EXECUTED');
  assert.equal(result.unresolvedWrite, true); assert.equal(result.reservation.held, true);
  assert.equal(client.uncertain.size, 1); assert.equal(budget.ledger.available('wood'), 0); assert.equal(client.writes.length, 1);
});
