import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceLedger, createRunBudgetContext, normalizeBudgetClaims, validateResources } from '../src/resource-ledger.mjs';
const scope = () => ({ accountId: 'account-a', runId: 'run-a', generation: 2, connectionId: 'connection-a' });
const claims = (resources = [], quotas = [], uids = []) => ({ resources, quotas, uids });
const resource = (id, num) => ({ id, num });
const uid = (type, id) => ({ type, id });
const make = (limits = claims([resource('wood', 10)])) => createRunBudgetContext({ scope: scope(), limits });
const child = (context, batchId, limits, stock = new Map([['wood', 100], ['GOLD', 100]])) => context.child(stock, { batchId, scope: scope(), limits });
const protocol = Object.fromEntries(['AllItemRequest', 'AllItemResponse', 'AllResourceRequest', 'AllResourceResponse'].map(name => [name, {}]));
function runtime(stock = new Map([['wood', 100], ['GOLD', 100]]), onRead = () => {}) {
  const reads = [];
  return { connected: true, reads, async request(name) {
    reads.push(name); await onRead(name);
    if (name === 'AllItemRequest') return { items: [...stock].filter(([id]) => id !== 'GOLD').map(([itemId, num]) => ({ itemId, num })) };
    if (name === 'AllResourceRequest') return { list: [{ res: 3, amount: stock.get('GOLD') ?? 0 }] };
    assert.fail('budget preflight attempted game write: ' + name);
  } };
}
function batch(context, batchId, limits, { prebuild = true, stock = new Map([['wood', 100], ['GOLD', 100]]) } = {}) {
  return { runBudget: context, scope: scope(), batchId, limits, ledger: prebuild ? child(context, batchId, limits, stock) : null };
}
const reserved = context => context.snapshot().reserved;
const empty = () => claims();

test('unified declarations aggregate amounts but reject unknown, null, unsafe and duplicate UID fields', () => {
  assert.deepEqual(normalizeBudgetClaims({ resources: [resource('wood', 1), resource('wood', '2')], quotas: [resource('daily:repair', 1)], uids: [uid('hero', '1')] }), claims([resource('wood', 3)], [resource('daily:repair', 1)], [uid('hero', '1')]));
  for (const bad of [null, [], { amount: 1 }, { resources: null }, { quotas: null }, { uids: null }, { resources: [['wood', 1]] }, { resources: [{ id: 'wood', num: 1, cost: 0 }] }, { resources: [resource(' wood ', 1)] }, { quotas: [resource('daily', null)] }, { resources: [resource('wood', Number.MAX_SAFE_INTEGER + 1)] }, { resources: [resource('wood', -1)] }, { uids: [uid('hero', '1'), uid('hero', '1')] }, { uids: [{ id: '1', type: 'hero', available: true }] }]) assert.throws(() => normalizeBudgetClaims(bad), { code: 'RUN_BUDGET_INVALID' });
});

test('new batches and fresh reward inventory never refill the original parent resource cap', () => {
  const limits = claims([resource('wood', 2)]), context = make(limits);
  const first = child(context, 'batch-1', limits, new Map([['wood', 2]]));
  assert.equal(first.reserve([['wood', 2]]), true);
  const second = child(context, 'batch-2', limits, new Map([['wood', 1000]]));
  assert.equal(second.available('wood'), 0); assert.equal(second.reserve([['wood', 1]]), false);
  assert.deepEqual(reserved(context), limits); assert.deepEqual(second.reservationSummary(), empty());
});

test('all parent/child resource, quota and UID checks occur before any partial debit', () => {
  const limits = claims([resource('wood', 10), resource('GOLD', 2)], [resource('daily:help', 2)], [uid('hero', 'one'), uid('hero', 'two')]);
  const context = make(limits), first = child(context, 'first', limits), second = child(context, 'second', limits);
  assert.equal(first.reserveClaims(claims([resource('wood', 5)], [resource('daily:help', 1)], [uid('hero', 'one')])), true);
  const before = context.snapshot();
  assert.equal(second.reserveClaims(claims([resource('wood', 4)], [resource('daily:help', 1)], [uid('hero', 'one')])), false);
  assert.deepEqual(context.snapshot(), before); assert.deepEqual(second.reservationSummary(), empty());
  assert.equal(second.reserveClaims(claims([resource('wood', 4)], [resource('daily:help', 1)], [uid('hero', 'two')])), true);
  const after = context.snapshot();
  assert.equal(first.reserveClaims(claims([resource('wood', 1)], [resource('daily:help', 1)])), false); assert.deepEqual(context.snapshot(), after);
  assert.equal(second.reserveClaims(claims([resource('wood', 2), resource('GOLD', 1)])), false); assert.deepEqual(context.snapshot(), after);
});

test('child authorization caps and stock are independent bounds below parent allowance', () => {
  const context = make(), a = child(context, 'small', claims([resource('wood', 2)]));
  assert.equal(a.reserve([['wood', 3]]), false); assert.equal(a.reserve([['wood', 2]]), true);
  const b = child(context, 'poor', claims([resource('wood', 8)]), new Map([['wood', 1]]));
  assert.equal(b.reserve([['wood', 2]]), false); assert.equal(b.available('wood'), 1); assert.equal(b.reserve([['wood', 1]]), true);
  assert.deepEqual(reserved(context).resources, [resource('wood', 3)]);
});

test('UID identity is typed and exclusive across the run with no implicitly unlimited quota', () => {
  const limits = claims([], [resource('daily:sweep', 1)], [uid('hero', 'same'), uid('equipment', 'same')]);
  const context = make(limits), a = child(context, 'a', limits), b = child(context, 'b', limits);
  assert.equal(a.reserveClaims(claims([], [resource('daily:sweep', 1)], [uid('hero', 'same')])), true);
  assert.equal(b.reserveClaims(claims([], [], [uid('equipment', 'same')])), true);
  assert.equal(b.reserveClaims(claims([], [], [uid('hero', 'same')])), false);
  assert.equal(b.reserveClaims(claims([], [resource('unknown:quota', 1)])), false);
  assert.equal(b.reserveClaims(claims([], [], [uid('unknown', 'same')])), false);
  assert.equal(b.reserveClaims(claims([], [resource('daily:sweep', 1)])), false);
});

test('scope binds exact account, run, generation and connection before child creation', () => {
  const context = make(), limits = claims([resource('wood', 1)]);
  for (const wrong of [{ accountId: 'other' }, { runId: 'other' }, { generation: 3 }, { connectionId: 'other' }]) assert.throws(() => context.child(new Map([['wood', 1]]), { batchId: 'a', scope: { ...scope(), ...wrong }, limits }), { code: 'RUN_BUDGET_SCOPE_MISMATCH' });
  for (const bad of [{ ...scope(), extra: true }, { ...scope(), generation: null }, { ...scope(), connectionId: '' }]) assert.throws(() => context.assertScope(bad), { code: 'RUN_BUDGET_INVALID' });
  assert.equal(context.snapshot().batches.length, 0);
});

test('constructor and child unknown fields or overbroad budgets fail closed without reservations', () => {
  const limits = claims([resource('wood', 2)]), context = make(limits);
  assert.throws(() => createRunBudgetContext({ scope: scope(), limits, restored: true }), { code: 'RUN_BUDGET_INVALID' });
  for (const bad of [claims([resource('wood', 3)]), claims([], [resource('daily', 1)]), claims([], [], [uid('hero', '1')])]) assert.throws(() => child(context, 'bad', bad), { code: 'RUN_BUDGET_INVALID' });
  assert.throws(() => context.child(new Map(), { scope: scope(), batchId: 'bad', limits, force: true }), { code: 'RUN_BUDGET_INVALID' });
  assert.throws(() => context.child(() => 10, { scope: scope(), batchId: 'bad', limits }), { code: 'RUN_BUDGET_INVALID' });
  assert.deepEqual(reserved(context), empty());
});

test('same batch cannot be recreated and compatibility views cannot refund or replenish it', () => {
  const limits = claims([resource('wood', 2)]), context = make(limits), ledger = child(context, 'a', limits, new Map([['wood', 2]]));
  assert.equal(ledger.reserve([['wood', 1]]), true); ledger.reserved.clear(); ledger.stock.set('wood', 1000);
  assert.equal(ledger.available('wood'), 1); assert.throws(() => child(context, 'a', limits), { code: 'RUN_BUDGET_BATCH_EXISTS' });
  assert.equal(ledger.reserve([['wood', 2]]), false); assert.deepEqual(reserved(context).resources, [resource('wood', 1)]);
});

test('UNKNOWN and cancellation close without returning resource, quota or UID reservations', () => {
  for (const outcome of ['UNKNOWN', 'CANCELLED', 'RATE_LIMITED', 'FAILED', 'STOPPED', 'SUCCESS']) {
    const limits = claims([resource('wood', 1)], [resource('quota', 1)], [uid('hero', '1')]), context = make(limits), ledger = child(context, 'a', limits);
    assert.equal(ledger.reserveClaims(limits), true); const summary = context.close(outcome);
    assert.equal(summary.state, 'CLOSED'); assert.equal(summary.outcome, outcome); assert.equal(summary.resumable, false); assert.deepEqual(summary.reserved, limits);
    assert.equal(ledger.reserve([]), false); assert.throws(() => context.assertScope(scope()), { code: 'RUN_BUDGET_CLOSED' });
    assert.throws(() => child(context, 'new', limits), { code: 'RUN_BUDGET_CLOSED' }); assert.equal(context.close('SUCCESS').outcome, outcome);
  }
});

test('persistable summaries are independent audit copies and cannot serve as live restored budgets', async () => {
  const limits = claims([resource('wood', 2)]), context = make(limits), ledger = child(context, 'a', limits);
  assert.equal(ledger.reserve([['wood', 1]]), true);
  const raw = JSON.parse(JSON.stringify(context.snapshot())); raw.reserved.resources[0].num = 0; raw.limits.resources[0].num = 1000;
  assert.equal(ledger.available('wood'), 1); assert.throws(() => createRunBudgetContext(raw), { code: 'RUN_BUDGET_INVALID' });
  const client = runtime(); await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget: { runBudget: raw, scope: scope(), batchId: 'a', limits, ledger } }), { code: 'NOT_EXECUTED' }); assert.deepEqual(client.reads, []);
});

test('D6 resource limits cannot enter at parent, child or reservation level', () => {
  for (const id of ['RUBY', '钻石']) {
    assert.throws(() => make(claims([resource(id, 1)])), { code: 'D6_FORBIDDEN' });
    const context = make(), ledger = child(context, 'a', claims([resource('wood', 1)]));
    assert.throws(() => child(context, 'b', claims([resource(id, 1)])), { code: 'RUN_BUDGET_INVALID' });
    assert.equal(ledger.reserveClaims(claims([resource(id, 1)])), false); assert.deepEqual(reserved(context), empty());
  }
});

test('preflight binds child metadata and matching resource claims before querying', async () => {
  const limits = claims([resource('wood', 2)]), context = make(limits), valid = batch(context, 'a', limits), client = runtime();
  const wrongs = [{ ...valid, scope: { ...scope(), accountId: 'b' } }, { ...valid, batchId: 'b' }, { ...valid, limits: claims([resource('wood', 1)]) }, { ...valid, ledger: new ResourceLedger(new Map([['wood', 100]])) }, { ...valid, runBudget: make(limits) }, { ledger: valid.ledger }];
  for (const budget of wrongs) await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget }), { code: 'NOT_EXECUTED' });
  await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget: valid, claims: claims([resource('wood', 2)]) }), { code: 'NOT_EXECUTED' });
  await assert.rejects(validateResources(client, protocol, [], { claims: claims([], [resource('quota', 1)]) }), { code: 'NOT_EXECUTED' });
  assert.deepEqual(client.reads, []); assert.deepEqual(reserved(context), empty());
});

test('fresh resource failure never partially reserves quota or UID', async () => {
  const limits = claims([resource('wood', 2)], [resource('quota', 1)], [uid('hero', '1')]), context = make(limits), budget = batch(context, 'a', limits), client = runtime(new Map([['wood', 1]]));
  await assert.rejects(validateResources(client, protocol, [['wood', 2]], { budget, claims: limits }), { code: 'NOT_EXECUTED' });
  assert.deepEqual(reserved(context), empty()); assert.deepEqual(budget.ledger.reservationSummary(), empty());
});

test('fresh/stale replies and new child batches cannot replace a consumed parent', async () => {
  const limits = claims([resource('wood', 2)]), context = make(limits), a = batch(context, 'a', limits), client = runtime(new Map([['wood', 1000]]));
  await validateResources(client, protocol, [['wood', 2]], { budget: a }); const b = batch(context, 'b', limits);
  await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget: b }), { code: 'NOT_EXECUTED' });
  assert.deepEqual(reserved(context), limits); assert.deepEqual(b.ledger.reservationSummary(), empty());
});

test('zero-resource quota/UID actions reserve atomically with a prebuilt child and no inventory query', async () => {
  const limits = claims([], [resource('quota', 1)], [uid('hero', '1')]), context = make(limits), budget = batch(context, 'a', limits), client = runtime();
  await validateResources(client, {}, [], { budget, claims: limits }); assert.deepEqual(client.reads, []); assert.deepEqual(reserved(context), limits);
  await assert.rejects(validateResources(client, {}, [], { budget, claims: limits }), { code: 'NOT_EXECUTED' }); assert.deepEqual(reserved(context), limits);
});

test('lazy child initialization requires fresh inventory even for zero-resource claims', async () => {
  const limits = claims([], [resource('quota', 1)]), context = make(limits), budget = batch(context, 'a', limits, { prebuild: false }), client = runtime();
  await validateResources(client, protocol, [], { budget, claims: limits }); assert.deepEqual(client.reads, ['AllItemRequest', 'AllResourceRequest']); assert.ok(budget.ledger instanceof ResourceLedger); assert.deepEqual(reserved(context), limits);
});

test('cancellation and scope changes during fresh inventory cannot consume parent claims', async () => {
  for (const kind of ['abort', 'scope', 'close']) {
    const limits = claims([resource('wood', 1)]), context = make(limits), budget = batch(context, 'a', limits), controller = new AbortController();
    const client = runtime(undefined, name => { if (name !== 'AllItemRequest') return; if (kind === 'abort') controller.abort(); else if (kind === 'scope') budget.scope = { ...scope(), generation: 3 }; else context.close('UNKNOWN'); });
    await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget, signal: controller.signal }), { code: kind === 'abort' ? 'CANCELLED' : 'NOT_EXECUTED' });
    assert.deepEqual(reserved(context), empty()); assert.deepEqual(budget.ledger.reservationSummary(), empty());
  }
});

test('later cancelled preflight retains old claims and legacy ledger cannot invent quotas', async () => {
  const limits = claims([resource('wood', 2)]), context = make(limits), budget = batch(context, 'a', limits), client = runtime();
  await validateResources(client, protocol, [['wood', 1]], { budget }); const controller = new AbortController(); controller.abort();
  await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget, signal: controller.signal }), { code: 'CANCELLED' }); assert.deepEqual(reserved(context).resources, [resource('wood', 1)]);
  const legacy = new ResourceLedger(new Map([['wood', 2]])); assert.equal(legacy.reserveClaims(claims([resource('wood', 1)])), true);
  assert.throws(() => legacy.reserveClaims(claims([], [resource('quota', 1)])), { code: 'RUN_BUDGET_INVALID' }); assert.equal(legacy.canReserveClaims(claims([], [], [uid('hero', '1')])), false);
});

test('pending inventory cannot swap parent, child ledger or exact child authorization', async () => {
  for (const kind of ['parent', 'legacy-ledger', 'sibling-ledger', 'limits', 'batchId']) {
    const limits = claims([resource('wood', 2)]), context = make(limits), budget = batch(context, 'a', claims([resource('wood', 1)]));
    const sibling = child(context, 'b', limits);
    const client = runtime(undefined, name => {
      if (name !== 'AllItemRequest') return;
      if (kind === 'parent') budget.runBudget = make(limits);
      else if (kind === 'legacy-ledger') budget.ledger = new ResourceLedger(new Map([['wood', 100]]));
      else if (kind === 'sibling-ledger') budget.ledger = sibling;
      else if (kind === 'limits') budget.limits = limits;
      else budget.batchId = 'changed';
    });
    await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget }), { code: 'NOT_EXECUTED' });
    assert.deepEqual(reserved(context), empty());
  }
});

test('closing or mutating a lazy child while inventory is pending fails as not executed', async () => {
  for (const kind of ['close', 'ledger']) {
    const limits = claims([resource('wood', 1)]), context = make(limits), budget = batch(context, 'lazy', limits, { prebuild: false });
    const client = runtime(undefined, name => { if (name !== 'AllItemRequest') return; if (kind === 'close') context.close('UNKNOWN'); else budget.ledger = new ResourceLedger(new Map([['wood', 100]])); });
    await assert.rejects(validateResources(client, protocol, [['wood', 1]], { budget }), { code: 'NOT_EXECUTED' });
    assert.deepEqual(reserved(context), empty()); assert.equal(context.snapshot().batches.length, 0);
  }
});
test('bound child freezes original mutable Long quantities and copies all authorization declarations', () => {
  const value = { low: 1, high: 0, unsigned: true }, limits = claims([resource('wood', 5)]), context = make(limits);
  const initialScope = scope(), childLimits = claims([resource('wood', 5)]);
  const ledger = context.child(new Map([['wood', value]]), { batchId: 'long', scope: initialScope, limits: childLimits });
  value.low = 100; limits.resources[0].num = 100; childLimits.resources[0].num = 100; initialScope.accountId = 'other';
  assert.equal(ledger.available('wood'), 1); assert.equal(ledger.reserve([['wood', 2]]), false);
  assert.equal(ledger.reserve([['wood', 1]]), true); assert.equal(context.snapshot().limits.resources[0].num, 5);
  assert.equal(context.snapshot().scope.accountId, 'account-a');
});