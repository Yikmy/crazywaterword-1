import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createWorkflowRunner } from '../src/workflow.mjs';
import { CORE_OPERATION_MODULES, ordersModule } from '../src/core-operation-adapters.mjs';

const rules = { version: 1, enabled: true, rules: [] };
const config = { tables: { WorkerOrderCfg: { data: [{ itemId: 'wood', reward: [['EXP', 1]] }] }, WorkerSpecOrderCfg: { data: [] } } };
const production = { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 };
const protocol = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets', 'FinishWorkerOrder'].flatMap(name => [[name + 'Request', {}], [name + 'Response', {}]]));
const claims = amount => ({ resources: [{ id: 'wood', num: amount }], quotas: [], uids: [] });
const amount = (rows, id = 'wood') => rows.find(row => row.id === id)?.num ?? 0;
const order = index => ({ index, workerId: 'synthetic-resident-' + index, textId: 1, isSpecial: false, refreshTime: 0, requirements: [{ id: 'wood', num: 40 }] });
function fixture({ stock = 60, apply = true, connection = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-run-budget-service-'));
  const durable = createExecutionHistory({ file: path.join(dir, 'history.json') });
  let failPut = () => false, writerAllowed = true;
  const journal = [], reads = [], writes = [], clients = new Map(), releases = [];
  const history = { ...durable, put(record) { if (failPut(record)) throw Object.assign(Error('synthetic run-budget persistence failure'), { code: 'HISTORY_UNAVAILABLE' }); journal.push(structuredClone(record)); return durable.put(record); } };
  const moduleSettings = createModuleSettings({ file: path.join(dir, 'module-settings.json'), modules: CORE_OPERATION_MODULES });
  const service = createOperationService({ protocol, getConfig: () => config, loadRules: () => ({ config: rules }), loadProduction: () => ({ config: production, warning: null }), history, modules: CORE_OPERATION_MODULES, moduleSettings, assertWriter() { if (!writerAllowed) throw Object.assign(Error('synthetic writer owner lost'), { code: 'WRITER_LOST' }); } });
  function makeSession(id = 'A') {
    const state = { stock, raw: { building: [], workerOrder: [order(0), order(1), order(2)], orderOfTheDay: { orderNum: 7 } }, apply, beforeWrite: null, beforeRead: null };
    const uncertainWrites = new Set();
    const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites,
      async request(name, body, response, timeout, options) {
        if (options?.mutate) {
          state.beforeWrite?.(name, body); writes.push({ id, name, body: structuredClone(body), durableBeforeWrite: structuredClone(journal.at(-1) ?? null) });
          if (state.apply) { state.raw.workerOrder = state.raw.workerOrder.filter(row => row.index !== body.index); state.raw.orderOfTheDay.orderNum++; state.stock -= 40; }
          return {};
        }
        reads.push({ id, name }); await state.beforeRead?.(name);
        if (name === 'OnWaterRequest') return structuredClone(state.raw);
        if (name === 'AllItemRequest') return { items: [{ itemId: 'wood', num: state.stock }] };
        if (name === 'AllResourceRequest') return { list: [] };
        if (name === 'MyResFieldsRequest') return { info: { fields: [] } };
        if (name === 'MyFleetsRequest') return { fleets: [] };
        throw Error('Unexpected synthetic request ' + name);
      },
      markUnverifiedWrite(name, body) { uncertainWrites.add(JSON.stringify({ name, body })); },
      confirmWatchedWrite(name, body) { uncertainWrites.delete(JSON.stringify({ name, body })); },
    };
    clients.set(client, state);
    moduleSettings.save(id, 'orders', { enabled: true });
    return { id, client, player: { playerId: 'synthetic-player-' + id, worldId: 1, level: 5 }, state: 'READY', generation: 1, ...(connection ? { connectionId: 'synthetic-connection-' + id } : {}), abort: new AbortController(), busy: null, loop: { running: false } };
  }
  const session = makeSession();
  function claim(target = session, runId = 'synthetic-parent-' + target.id, limits = claims(60)) {
    const release = service.claimWorkflow(target, runId, { limits }); releases.push(release); return { runId, release };
  }
  async function plan(target = session, index = 0, workflowId = target.workflowOwner ?? null, { legacy = false } = {}) {
    const facts = await ordersModule.survey(target.client, protocol, { config, player: target.player });
    const candidate = ordersModule.view(facts, { config, rules, moduleConfig: { enabled: true }, parameters: {} }).candidates.find(row => row.target.index === index);
    assert.ok(candidate, 'expected synthetic order candidate #' + index);
    return service.plan(target, { module: 'orders', mode: 'Manual', selections: [candidate.actionId], ...(!legacy ? { parameters: {} } : {}) }, { workflowId });
  }
  function authorize(target, planned, extra = {}) { return service.authorize(target, { batchId: planned.batchId, planHash: planned.planHash, approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: planned.resourceBudget, confirm: true, ...extra }); }
  async function execute(target, planned) { const permit = authorize(target, planned); const started = service.execute(target, permit); await service.settle(target.id); return { started, status: service.status(target.id), record: durable.list(target.id).find(row => row.planSummary?.batchId === planned.batchId) }; }
  async function attemptAnother(target = session, index = 1) {
    let planned;
    try { planned = await plan(target, index); } catch (error) { assert.match(error.message, /预算|budget|声明/i); return { rejected: true, error }; }
    const result = await execute(target, planned); assert.notEqual(result.status.finalStatus, 'SUCCESS'); return result;
  }
  async function cleanup() {
    writerAllowed = true; failPut = () => false; for (const release of releases.reverse()) release();
    await Promise.all([...new Set(['A', 'B'])].map(id => service.settle(id)));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true });
  }
  return { service, session, history: durable, journal, reads, writes, clients, makeSession, claim, plan, authorize, execute, attemptAnother, cleanup, state(target = session) { return clients.get(target.client); }, setFailPut(predicate) { failPut = predicate; }, setWriterAllowed(value) { writerAllowed = value; } };
}

test('Workflow previews and authorization bind a finite scope/limits identity without debiting the parent', async () => {
  const f = fixture();
  try {
    const parent = f.claim(), initial = f.service.workflowBudget('A'); assert.equal(initial.scope.accountId, 'A'); assert.equal(initial.scope.runId, parent.runId); assert.equal(initial.scope.generation, 1); assert.equal(initial.scope.connectionId, 'synthetic-connection-A'); assert.deepEqual(initial.limits, claims(60));
    for (let i = 0; i < 2; i++) {
      const planned = await f.plan(); assert.deepEqual(planned.resourceBudget, [{ id: 'wood', num: 40 }]);
      assert.deepEqual(planned.runBudgetIdentity, { scope: initial.scope, limits: initial.limits });
      f.authorize(f.session, planned); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 0);
    }
    assert.equal(f.writes.length, 0); assert.equal(f.service.workflowBudget('A').batches.length, 0);
  } finally { await f.cleanup(); }
});

test('a 60-unit parent cannot execute two 40-unit batches even when fresh inventory becomes 1000', async () => {
  const f = fixture();
  try {
    const parent = f.claim(), first = await f.execute(f.session, await f.plan());
    assert.equal(first.status.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
    assert.equal(first.record.parentRunId, parent.runId); assert.equal(first.record.workflowId, parent.runId); assert.equal(first.record.runBudget.scope.runId, parent.runId); assert.equal(amount(first.record.runBudget.reserved.resources), 40);
    f.state().stock = 1000; await f.attemptAnother();
    const budget = f.service.workflowBudget('A'); assert.deepEqual(budget.limits, claims(60)); assert.equal(amount(budget.reserved.resources), 40); assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].durableBeforeWrite.runBudget.scope.runId, parent.runId); assert.equal(amount(f.writes[0].durableBeforeWrite.runBudget.reserved.resources), 40, 'parent debit must be durable before transport');
  } finally { await f.cleanup(); }
});

test('an omitted parent limit freezes the first reliable stock once and later fresh income cannot replenish it', async () => {
  const f = fixture();
  try {
    f.claim(f.session, 'stock-frozen-parent', null);
    const planned = await f.plan(); assert.deepEqual(f.service.workflowBudget('A').limits, claims(60));
    assert.equal((await f.execute(f.session, planned)).status.finalStatus, 'SUCCESS'); f.state().stock = 1000;
    await f.attemptAnother(); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('a standalone exact batch also persists its finite parent/child budget before the original executor writes', async () => {
  const f = fixture({ stock: 1000 });
  try {
    const planned = await f.plan(), result = await f.execute(f.session, planned); assert.equal(result.status.finalStatus, 'SUCCESS');
    assert.deepEqual(result.record.runBudget.limits, claims(40)); assert.equal(amount(result.record.runBudget.reserved.resources), 40); assert.equal(result.record.runBudget.batches.length, 1);
    assert.equal(result.record.runBudget.scope.accountId, 'A'); assert.equal(result.record.runBudget.scope.generation, 1); assert.equal(result.record.runBudget.scope.connectionId, 'synthetic-connection-A'); assert.equal(result.record.runBudget.resumable, false);
    assert.equal(amount(f.writes[0].durableBeforeWrite.runBudget.reserved.resources), 40); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('different accounts may reuse a human run label while keeping parent scopes and material debits isolated', async () => {
  const f = fixture();
  try {
    const b = f.makeSession('B'); f.claim(f.session, 'same-display-run'); f.claim(b, 'same-display-run');
    assert.equal((await f.execute(f.session, await f.plan())).status.finalStatus, 'SUCCESS');
    assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40); assert.equal(amount(f.service.workflowBudget('B').reserved.resources), 0);
    assert.equal((await f.execute(b, await f.plan(b))).status.finalStatus, 'SUCCESS');
    assert.equal(amount(f.service.workflowBudget('B').reserved.resources), 40); assert.notDeepEqual(f.service.workflowBudget('A').scope, f.service.workflowBudget('B').scope); assert.equal(f.writes.length, 2);
  } finally { await f.cleanup(); }
});

for (const change of ['generation', 'client', 'connectionId']) test('a changed ' + change + ' cannot reuse an authorized Workflow parent or transmit its order', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), permit = f.authorize(f.session, planned);
    if (change === 'generation') f.session.generation++;
    else if (change === 'connectionId') f.session.connectionId = 'forged-current-connection';
    else f.session.client = f.makeSession('B').client;
    assert.throws(() => f.service.execute(f.session, permit), /预算|会话|连接|范围|代次|失效|切换/); assert.equal(f.writes.length, 0); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 0);
  } finally { await f.cleanup(); }
});

test('synthetic Sessions without connectionId receive a stable per-client identity that cannot survive replacement', async () => {
  const f = fixture({ connection: false });
  try {
    f.claim(); const planned = await f.plan(), scope = f.service.workflowBudget('A').scope; assert.ok(scope.connectionId);
    assert.equal((await f.execute(f.session, planned)).status.finalStatus, 'SUCCESS');
    const replacement = f.makeSession('A'); f.session.client = replacement.client;
    await assert.rejects(f.plan(f.session, 1), /预算|会话|连接|范围|代次|失效|切换/); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('UNKNOWN holds cumulative material claims, records an unresumable budget and blocks automatic replanning', async () => {
  const f = fixture({ apply: false });
  try {
    const parent = f.claim(), result = await f.execute(f.session, await f.plan());
    assert.equal(result.status.finalStatus, 'UNKNOWN'); assert.equal(result.status.blocked, true); assert.equal(result.record.actions[0].unresolvedWrite, true);
    assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40); assert.equal(result.record.runBudget.resumable, false);
    await assert.rejects(f.plan(f.session, 1), /未决|UNKNOWN|不确定/); assert.equal(f.writes.length, 1);
    parent.release(); const closed = f.service.workflowBudget('A'); assert.equal(closed.state, 'CLOSED'); assert.equal(amount(closed.reserved.resources), 40);
  } finally { await f.cleanup(); }
});

test('stopping a claimed parent invalidates old authorization without refunding a successful earlier child', async () => {
  const f = fixture({ stock: 80 });
  try {
    const parent = f.claim(f.session, 'stopped-parent', claims(80)); assert.equal((await f.execute(f.session, await f.plan())).status.finalStatus, 'SUCCESS');
    const planned = await f.plan(f.session, 1), permit = f.authorize(f.session, planned); parent.release();
    assert.throws(() => f.service.execute(f.session, permit), /批次|归属|预算|关闭|失效/);
    const closed = f.service.workflowBudget('A'); assert.equal(closed.state, 'CLOSED'); assert.equal(closed.outcome, 'STOPPED'); assert.equal(amount(closed.reserved.resources), 40); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('a caller-mutated displayed runBudgetIdentity cannot change the actual parent or authorize a forged hash', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), original = structuredClone(planned); planned.runBudgetIdentity.limits.resources[0].num = 1000; planned.runBudgetIdentity.scope.accountId = 'B';
    assert.throws(() => f.authorize(f.session, planned, { planHash: 'forged-parent-budget-hash' }), /授权|计划|预算/);
    assert.deepEqual(f.service.workflowBudget('A').limits, claims(60)); assert.equal((await f.execute(f.session, original)).status.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('failure persisting the reserved parent budget stops transport and conservatively keeps the debit', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(); f.setFailPut(record => amount(record.runBudget?.reserved?.resources ?? []) > 0);
    const permit = f.authorize(f.session, planned); f.service.execute(f.session, permit); await f.service.settle('A');
    assert.equal(f.writes.length, 0); assert.notEqual(f.service.status('A').finalStatus, 'SUCCESS'); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40);
  } finally { await f.cleanup(); }
});

test('loss of the writer owner before execution never starts resource reads, reservations or transport', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), permit = f.authorize(f.session, planned), readCount = f.reads.length; f.setWriterAllowed(false);
    assert.throws(() => f.service.execute(f.session, permit), /writer owner lost/); assert.equal(f.writes.length, 0); assert.equal(f.reads.length, readCount); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 0);
  } finally { await f.cleanup(); }
});

test('writer ownership lost during original resource preflight prevents dispatch and cannot become SUCCESS', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), permit = f.authorize(f.session, planned);
    f.state().beforeRead = name => { if (name === 'AllResourceRequest') f.setWriterAllowed(false); };
    f.service.execute(f.session, permit); await f.service.settle('A');
    assert.equal(f.writes.length, 0); assert.notEqual(f.service.status('A').finalStatus, 'SUCCESS');
  } finally { await f.cleanup(); }
});

for (const limit of [60, 80]) test('real two-ACTION Workflow obeys the same ' + limit + '-unit parent across independently authorized child batches', async () => {
  const f = fixture({ stock: 1000 }); let runner;
  try {
    const facts = await ordersModule.survey(f.session.client, protocol, { config, player: f.session.player });
    const rows = ordersModule.view(facts, { config, rules, moduleConfig: { enabled: true }, parameters: {} }).candidates;
    const graph = { version: 1, id: 'two-real-orders-' + limit, name: 'Synthetic two-order budget ' + limit, budget: claims(limit), nodes: [
      { id: 's', type: 'START' }, { id: 'a1', type: 'ACTION', module: 'orders', parameters: {}, selection: rows[0].actionId }, { id: 'v1', type: 'VERIFY', module: 'orders' },
      { id: 'a2', type: 'ACTION', module: 'orders', parameters: {}, selection: rows[1].actionId }, { id: 'v2', type: 'VERIFY', module: 'orders' }, { id: 'z', type: 'STOP' },
    ], edges: [{ from: 's', to: 'a1' }, { from: 'a1', to: 'v1' }, { from: 'v1', to: 'a2' }, { from: 'a2', to: 'v2' }, { from: 'v2', to: 'z' }] };
    const updates = [];
    runner = createWorkflowRunner({ operations: f.service, modules: CORE_OPERATION_MODULES, getSession: id => id === 'A' ? f.session : null,
      isCurrent: (session, generation, client) => session === f.session && session.generation === generation && session.client === client,
      claim: (id, runId, options) => f.claim(f.session, runId, options.limits).release, onUpdate: status => { updates.push(structuredClone(status)); } });
    const first = await runner.start('A', graph); assert.equal(first.status, 'AWAITING_AUTHORIZATION'); assert.equal(f.writes.length, 0);
    assert.equal(first.plan.parentRunId, first.runId); assert.equal(amount(first.runBudget.reserved.resources), 0);
    const executedFirst = await f.execute(f.session, first.plan); assert.equal(executedFirst.status.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
    const second = await runner.resume(); assert.equal(second.status, 'AWAITING_AUTHORIZATION'); assert.notEqual(second.plan.batchId, first.plan.batchId); assert.equal(second.plan.parentRunId, first.runId);
    assert.equal(second.plan.runBudgetIdentity.scope.runId, first.runId); assert.equal(amount(second.runBudget.reserved.resources), 40); assert.equal(f.writes.length, 1, 'planning the next node never auto-dispatches');
    const executedSecond = await f.execute(f.session, second.plan), finished = await runner.resume();
    if (limit === 80) {
      assert.equal(executedSecond.status.finalStatus, 'SUCCESS'); assert.equal(finished.status, 'COMPLETED'); assert.equal(f.writes.length, 2); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 80);
      assert.equal(finished.trace.filter(row => row.type === 'VERIFY' && row.result === 'CONFIRMED').length, 2);
    } else {
      assert.notEqual(executedSecond.status.finalStatus, 'SUCCESS'); assert.equal(finished.status, 'UNKNOWN'); assert.equal(f.writes.length, 1); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40);
      assert.equal(finished.trace.filter(row => row.type === 'VERIFY' && row.result === 'CONFIRMED').length, 1);
    }
    for (const write of f.writes) { assert.equal(write.durableBeforeWrite.runBudget.scope.runId, first.runId); assert.ok(amount(write.durableBeforeWrite.runBudget.reserved.resources) >= 40); }
    assert.equal(f.service.workflowBudget('A').state, 'CLOSED'); assert.equal(f.service.workflowBudget('A').resumable, false); assert.ok(updates.some(row => row.status === 'AWAITING_AUTHORIZATION'));
  } finally { runner?.stop(); await runner?.settle(); await f.cleanup(); }
});
