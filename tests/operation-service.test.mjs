import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

const operation = (id, module, num = 40) => ({ actionId: id, actionType: module === 'orders' ? 'SUBMIT' : 'UPGRADE', target: { id }, costs: [{ id: 'wood', num }], beforeState: { level: 1 }, identity: id, executable: true, action: { request: 'InternalOnly', body: { id } } });
function fixture({ execute, stock = 100, clock, survey: surveyOverride, history: providedHistory } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-service-')), file = path.join(dir, 'history.json');
  const history = providedHistory ?? createExecutionHistory({ file });
  let rules = { version: 1, enabled: true, rules: [] }, config = { version: 1 }, surveys = 0;
  const calls = [], a = operation('order-a', 'orders'), b = operation('order-b', 'orders'), city = operation('city-a', 'city');
  const survey = async (...args) => { surveys++; return surveyOverride ? surveyOverride(...args) : { stockReliable: true, stock: new Map([['wood', stock]]) }; };
  const orderPlanner = (_facts, { ledger, selections }) => {
    const actions = [];
    for (const op of [a, b]) if ((!selections || selections.includes(op.actionId)) && ledger.reserve(op.costs)) actions.push(op);
    return { rows: [a, b], actions };
  };
  const cityPlanner = (_facts, { ledger, selections }) => ({ actions: selections.includes(city.actionId) && ledger.reserve(city.costs) ? [city] : [] });
  const perform = async (client, protocol, op, opts) => {
    calls.push({ account: client.id, id: op.actionId, budget: opts.budget });
    if (execute) return execute(client, op, opts);
    assert.equal(opts.budget.ledger.reserve(op.costs), true);
    return { status: 'SUCCESS', requestStatus: 'SUCCESS', afterState: { level: 2 }, verification: { status: 'CONFIRMED' } };
  };
  const service = createOperationService({ protocol: {}, loadProduction: () => ({ config: { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 } }), getConfig: () => config, loadRules: () => ({ config: rules }), history, clock,
    survey, orderPlanner, cityPlanner, cityViewer: () => ({ buildings: [], factories: [], candidates: [city] }), orderExecute: perform, cityExecute: perform });
  const session = id => ({ id, generation: 1, abort: new AbortController(), state: 'READY', client: { id, connected: true, pending: [], watchers: [], uncertainWrites: new Set() }, loop: { running: false }, busy: null });
  return { dir, file, history, service, session, calls, surveys: () => surveys,
    rules: value => { rules = value; }, config: value => { config = value; }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const createPlan = (f, session, selections = ['order-a'], mode = 'Manual', module = 'orders') => f.service.plan(session, { module, mode, selections });
function approve(f, session, plan, overrides = {}) { return f.service.authorize(session, { batchId: plan.batchId, planHash: plan.planHash,
  approvedActionIds: plan.actions.map(action => action.actionId), resourceBudget: plan.resourceBudget, confirm: true, ...overrides }); }
function start(f, session, plan) { const permit = approve(f, session, plan); return f.service.execute(session, permit); }

test('only exact displayed plan, account, ordered action set and budget can receive one-use authorization', async () => {
  const f = fixture(), a = f.session('A'), b = f.session('B');
  try {
    const plan = await createPlan(f, a);
    assert.throws(() => f.service.execute(a, { batchId: plan.batchId, confirm: true }), /不支持/);
    for (const fields of [{ confirm: false }, { planHash: 'forged' }, { approvedActionIds: ['order-b'] }, { resourceBudget: [] }]) assert.throws(() => approve(f, a, plan, fields), /授权/);
    assert.throws(() => approve(f, b, plan), /批次/);
    assert.equal(plan.actions[0].action, undefined, 'transport action is not returned to caller');
    const permit = approve(f, a, plan); f.service.execute(a, permit); await f.service.settle('A');
    assert.equal(f.calls.length, 1); assert.throws(() => f.service.execute(a, permit), /授权/);
    assert.throws(() => approve(f, a, plan), /复用/); assert.equal(f.service.status('A').finalStatus, 'SUCCESS');
  } finally { f.cleanup(); }
});
test('planning composes order and city reservations through the same ledger and refuses aggregate overspend', async () => {
  const f = fixture(), a = f.session('A');
  try {
    const plan = await createPlan(f, a, ['order-a', 'city-a'], 'Automatic', 'combined'); assert.deepEqual(plan.resourceBudget, [{ id: 'wood', num: 80 }]);
    await assert.rejects(createPlan(f, a, ['order-a', 'order-b', 'city-a'], 'Automatic', 'combined'), /预算|变化/);
    const chosen = await createPlan(f, a, ['order-b']); assert.equal(chosen.actions[0].actionId, 'order-b');
    const run = start(f, a, await createPlan(f, a, ['order-a', 'city-a'], 'Automatic', 'combined')); await f.service.settle('A');
    assert.equal(f.calls.length, 2); assert.equal(f.calls[0].budget, f.calls[1].budget);
    assert.equal(f.calls[0].budget.ledger.reserved.get('wood'), 80);
    assert.equal(f.service.history('A', run.runId).runs[0].actions.every(action => action.verification.status === 'CONFIRMED'), true);
  } finally { f.cleanup(); }
});
test('Manual only accepts one action and unknown or arbitrary request fields never enter plans', async () => {
  const f = fixture(), a = f.session('A');
  try {
    for (const payload of [ { module: 'orders', mode: 'Manual', selections: ['order-a', 'order-b'] }, { module: 'orders', mode: 'Automatic', selections: ['unknown'] }, { module: 'orders', mode: 'Automatic', selections: ['order-a'], request: 'BuyRubyRequest' }, { module: 'orders', mode: 'Automatic', selections: ['order-a'], allowPaid: true } ]) await assert.rejects(f.service.plan(a, payload));
    assert.equal(f.calls.length, 0);
  } finally { f.cleanup(); }
});
test('account generation, latest rules, config changes, expiration and replacement invalidate authorization', async () => {
  let timestamp = Date.parse('2026-11-10T00:00:00Z'); const f = fixture({ clock: () => timestamp }), a = f.session('A');
  try {
    let plan = await createPlan(f, a); a.generation++; assert.throws(() => approve(f, a, plan), /会话/);
    plan = await createPlan(f, a); f.rules({ version: 1, enabled: false, rules: [] }); assert.throws(() => approve(f, a, plan), /规则/);
    plan = await createPlan(f, a); f.config({ version: 2 }); assert.throws(() => approve(f, a, plan), /配置/);
    plan = await createPlan(f, a); timestamp += 300001; assert.throws(() => approve(f, a, plan), /过期/);
    plan = await createPlan(f, a); await createPlan(f, a, ['order-b']); assert.throws(() => approve(f, a, plan), /批次/);
    assert.equal(f.calls.length, 0);
  } finally { f.cleanup(); }
});
test('server-owned plan is independent of mutations to its returned preview', async () => {
  const f = fixture(), a = f.session('A');
  try {
    const plan = await createPlan(f, a), original = structuredClone(plan); plan.actions[0].costs[0].num = 0; plan.resourceBudget[0].num = 0;
    assert.throws(() => approve(f, a, plan), /授权/); start(f, a, original); await f.service.settle('A');
    assert.equal(f.calls[0].budget.ledger.reserved.get('wood'), 40);
  } finally { f.cleanup(); }
});
test('same account writes exclude Stage and collection, while separate accounts execute in parallel', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ execute: async () => { await gate; return { status: 'SUCCESS', requestStatus: 'SUCCESS' }; } }), a = f.session('A'), b = f.session('B');
  try {
    a.stageRunner = { getStatus: () => ({ running: true }) }; await assert.rejects(createPlan(f, a), /互斥/); delete a.stageRunner;
    a.collectionPromise = Promise.resolve(); await assert.rejects(createPlan(f, a), /互斥/); delete a.collectionPromise;
    const pa = await createPlan(f, a), pb = await createPlan(f, b); start(f, a, pa); start(f, b, pb);
    await Promise.resolve(); assert.equal(f.calls.length, 2); assert.equal(a.busy, 'operations:EXECUTING');
    await assert.rejects(createPlan(f, a), /互斥/); assert.equal(f.service.view('A').status.running, true);
    release(); await Promise.all([f.service.settle('A'), f.service.settle('B')]); assert.equal(a.busy, null); assert.equal(b.busy, null);
  } finally { release(); await Promise.all([f.service.settle('A'), f.service.settle('B')]); f.cleanup(); }
});
test('UNKNOWN halts immediately, retains budget/evidence and prevents a fresh run after restart', async () => {
  const f = fixture({ execute: async (_client, op, opts) => { opts.budget.ledger.reserve(op.costs); return { status: 'UNKNOWN', requestStatus: 'UNKNOWN', verification: { status: 'UNCONFIRMED' } }; } }), a = f.session('A');
  try {
    start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].budget.ledger.reserved.get('wood'), 40); assert.equal(f.service.status('A').blocked, true);
    assert.equal(f.history.list('A')[0].actions[1].requestStatus, 'NOT_DISPATCHED');
    await assert.rejects(createPlan(f, a), /未决/);
    const restarted = fixture({ history: createExecutionHistory({ file: f.file }) });
    try { await assert.rejects(createPlan(restarted, a), /未决/); assert.equal(restarted.calls.length, 0); } finally { restarted.cleanup(); }
  } finally { f.cleanup(); }
});
test('stop before dispatch cancels without sending, and stop during a result prevents the next operation', async () => {
  let unblock; const gate = new Promise(resolve => { unblock = resolve; });
  const f = fixture({ execute: async () => { await gate; return { status: 'SUCCESS', requestStatus: 'SUCCESS' }; } }), a = f.session('A');
  try {
    start(f, a, await createPlan(f, a)); f.service.stop('A'); await f.service.settle('A'); assert.equal(f.calls.length, 0); assert.equal(f.service.status('A').finalStatus, 'CANCELLED');
    start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await Promise.resolve(); f.service.stop('A'); unblock(); await f.service.settle('A');
    assert.equal(f.calls.length, 1); assert.equal(f.service.status('A').finalStatus, 'CANCELLED');
  } finally { unblock(); await f.service.settle('A'); f.cleanup(); }
});
test('rate limit, rejection and stale execution failures stop without retrying later actions', async () => {
  for (const outcome of ['RATE_LIMITED', 'REJECTED', 'NOT_EXECUTED']) {
    const f = fixture({ execute: async () => ({ status: outcome, requestStatus: outcome, error: 'synthetic ' + outcome }) }), a = f.session('A');
    try { start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A'); assert.equal(f.calls.length, 1); assert.equal(f.service.status('A').finalStatus, outcome); }
    finally { f.cleanup(); }
  }
});
test('history is durably present before dispatch and every result is persisted before the next dispatch', async () => {
  let f; f = fixture({ execute: async (_client, op) => {
    const persisted = JSON.parse(fs.readFileSync(f.file, 'utf8')).accounts.A[0];
    const index = persisted.actions.findIndex(action => action.actionId === op.actionId);
    assert.equal(persisted.actions[index].requestStatus, 'DISPATCHING');
    if (index) assert.equal(persisted.actions[index - 1].result, 'SUCCESS');
    return { status: 'SUCCESS', requestStatus: 'SUCCESS' };
  } }); const a = f.session('A');
  try { start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A'); assert.equal(f.calls.length, 2); }
  finally { f.cleanup(); }
});
test('history failure before dispatch sends nothing; failure after dispatch blocks further writes', async () => {
  const fail = () => { throw Error('history unavailable'); };
  let f = fixture({ history: { unresolved: () => false, list: () => [], put: fail } }), a = f.session('A');
  try { const plan = await createPlan(f, a); assert.throws(() => start(f, a, plan), /history/); assert.equal(f.calls.length, 0); assert.equal(a.busy, null); } finally { f.cleanup(); }
  let writes = 0;
  f = fixture({ history: { unresolved: () => false, list: () => [], put: () => { if (++writes >= 3) fail(); } } }); a = f.session('A');
  try { start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A'); assert.equal(f.calls.length, 1); assert.equal(f.service.status('A').blocked, true); await assert.rejects(createPlan(f, a), /未决/); } finally { f.cleanup(); }
});
