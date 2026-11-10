import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationService } from '../src/operation-service.mjs';
import { createWorkflowRunner } from '../src/workflow.mjs';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const facts = () => ({ stockReliable: true, stock: new Map(), state: { version: 1 } });
const payload = { module: 'demo', mode: 'Manual', selections: ['demo:action'] };
function fixture() {
  const pendingSurveys = [], records = new Map(), calls = [];
  const operation = { actionId: 'demo:action', actionType: 'DEMO', target: {}, costs: [], beforeState: { version: 1 }, identity: 'demo', costSource: 'synthetic no-cost action', expectedState: { version: 2 }, action: { request: 'SyntheticOnlyRequest', body: {} } };
  const adapter = { id: 'demo', defaultConfig: { enabled: true },
    survey: async () => { calls.push('survey'); return pendingSurveys.length ? pendingSurveys.shift().promise : facts(); },
    view: () => ({ candidates: [operation] }), plan: () => ({ actions: [operation] }), verify: () => ({ confirmed: true }),
    execute: async () => { calls.push('execute'); return { status: 'SUCCESS', verification: { status: 'CONFIRMED' } }; } };
  const client = () => ({ connected: true, pending: [], watchers: [], lateResponses: new Set(), uncertainWrites: new Set() });
  const session = { id: 'synthetic-lock-account', generation: 1, state: 'READY', client: client(), abort: new AbortController(), loop: { running: false }, busy: null };
  const modules = { demo: adapter };
  const service = createOperationService({ modules, protocol: {}, getConfig: () => ({}), loadRules: () => ({ config: {} }), loadProduction: () => ({ config: {} }),
    moduleSettings: { get: () => ({ config: { enabled: true } }) },
    history: { put: record => records.set(record.runId, structuredClone(record)), list: () => [...records.values()], unresolved: () => false } });
  return { session, service, modules, calls,
    delaySurvey() { const gate = deferred(); pendingSurveys.push(gate); return gate; },
    reconnect() { session.generation++; session.abort.abort(); session.abort = new AbortController(); session.client = client(); session.busy = null; session.workflowOwner = null; },
    approve(plan) { return service.authorize(session, { batchId: plan.batchId, planHash: plan.planHash, approvedActionIds: plan.actions.map(row => row.actionId), resourceBudget: plan.resourceBudget, confirm: true }); } };
}

test('old generation PLAN finally cannot release the current generation same-label PLAN lock', async () => {
  const f = fixture(), oldGate = f.delaySurvey();
  const oldTask = f.service.plan(f.session, payload).catch(cause => cause);
  f.reconnect();
  const approved = await f.service.plan(f.session, payload), permit = f.approve(approved);
  const newGate = f.delaySurvey(), newTask = f.service.plan(f.session, payload);
  try {
    assert.equal(f.session.busy, 'operations:PLAN');
    oldGate.resolve(facts());
    assert.equal((await oldTask).code, 'CANCELLED');
    assert.equal(f.session.busy, 'operations:PLAN', 'the pending current survey must retain its account lock');
    assert.throws(() => f.service.execute(f.session, permit), { code: 'ACCOUNT_BUSY' });
    assert.equal(f.calls.includes('execute'), false);
    newGate.resolve(facts());
    await newTask;
    assert.equal(f.session.busy, null);
  } finally { oldGate.resolve(facts()); newGate.resolve(facts()); await Promise.allSettled([oldTask, newTask]); }
});

test('old workflow release cannot delete a current generation plan even when the run label is reused', async () => {
  const f = fixture(), runId = 'synthetic-reused-label';
  const releaseOld = f.service.claimWorkflow(f.session, runId);
  f.reconnect();
  const releaseCurrent = f.service.claimWorkflow(f.session, runId);
  try {
    const plan = await f.service.plan(f.session, payload, { workflowId: runId });
    releaseOld();
    assert.equal(f.session.workflowOwner, runId);
    assert.equal(f.session.busy, 'workflow:' + runId);
    assert.equal(f.service.view(f.session.id).lastPlan?.batchId, plan.batchId);
    assert.equal(f.approve(plan).batchId, plan.batchId, 'old release must not invalidate a current plan or permit');
    releaseOld();
    assert.equal(f.service.view(f.session.id).lastPlan?.batchId, plan.batchId, 'old release remains harmless if observed twice');
  } finally { releaseCurrent(); }
  assert.equal(f.session.workflowOwner, null);
  assert.equal(f.session.busy, null);
  assert.equal(f.service.view(f.session.id).lastPlan, null);
});

for (const nodeType of ['SURVEY', 'ACTION']) test('Workflow STOP prevents late ' + nodeType + ' survey from restoring cache or plan', async () => {
  const f = fixture(), gate = f.delaySurvey();
  const node = { id: 'business', type: nodeType, module: 'demo', ...(nodeType === 'ACTION' ? { selection: 'demo:action' } : {}) };
  const graph = { version: 1, id: 'late-survey', name: 'Synthetic late survey', nodes: [{ id: 'start', type: 'START' }, node, { id: 'stop', type: 'STOP' }], edges: [{ from: 'start', to: 'business' }, { from: 'business', to: 'stop' }] };
  const runner = createWorkflowRunner({ operations: f.service, modules: f.modules, getSession: () => f.session,
    isCurrent: (session, generation, client) => session === f.session && session.generation === generation && session.client === client,
    claim: (_accountId, runId) => f.service.claimWorkflow(f.session, runId) });
  const task = runner.start(f.session.id, graph);
  try {
    await tick();
    assert.equal(f.calls.filter(value => value === 'survey').length, 1);
    assert.match(f.session.busy, /^operations:/);
    runner.stop();
    assert.equal((await task).status, 'CANCELLED');
    await runner.settle();
    assert.equal(f.session.workflowOwner, null);
    assert.equal(f.service.view(f.session.id).lastPlan, null);
    gate.resolve(facts());
    await tick(); await tick();
    assert.equal(runner.getStatus().status, 'CANCELLED');
    assert.equal(f.service.moduleView(f.session.id, 'demo').view, null);
    assert.equal(f.service.view(f.session.id).lastPlan, null);
    assert.equal(f.session.busy, null);
    assert.equal(f.calls.includes('execute'), false);
  } finally { runner.stop(); gate.resolve(facts()); await task; await runner.settle(); }
});
