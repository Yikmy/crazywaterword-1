import { CORE_OPERATION_MODULES } from '../src/core-operation-adapters.mjs';
import { fleetModule, FLEET_DEFAULT_CONFIG } from '../src/fleet.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner, createWorkflowStore } from '../src/workflow.mjs';

const empty = () => ({ resources: [], quotas: [], uids: [] });
const quota = n => ({ resources: [], quotas: [{ id: 'synthetic-free-action', num: n }], uids: [] });
const uid = () => ({ resources: [], quotas: [], uids: [{ type: 'synthetic-artifact', id: 'artifact-1' }] });
const sum = (rows, id) => rows.find(row => row.id === id)?.num ?? 0;

function fixture({ declaration = empty(), limits = declaration, apply = true, failFinalPersist = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-run-budget-safety-'));
  const file = path.join(dir, 'history.json'), durable = createExecutionHistory({ file });
  const journal = [], writes = [], releases = [];
  let currentDeclaration = structuredClone(declaration), progress = 0, executionBudget = null;
  const candidate = actionId => ({
    module: 'fixture', actionId, actionType: 'SYNTHETIC_WRITE', target: { id: actionId }, costs: structuredClone(currentDeclaration.resources),
    budgetClaims: structuredClone(currentDeclaration), identity: actionId, beforeState: { progress },
    expectedState: { progress: progress + 1 }, costSource: 'independent-synthetic-evidence',
    action: { request: 'RepairFleetRequest', response: 'RepairFleetResponse', body: { id: actionId } },
  });
  const adapter = {
    id: 'fixture', defaultConfig: { enabled: true },
    async survey() { return { stockReliable: true, stock: new Map([['wood', 1000]]), state: { progress } }; },
    view() { return { candidates: ['first', 'second'].map(candidate) }; },
    plan(_facts, { selections }) { return { actions: selections.map(candidate) }; },
    verify(operation, _before, after) { return { confirmed: after.state.progress === operation.expectedState.progress, afterState: after.state }; },
  };
  const modules = { fixture: adapter };
  const protocol = { RepairFleetRequest: {}, RepairFleetResponse: {}, AllItemRequest: {}, AllItemResponse: {}, AllResourceRequest: {}, AllResourceResponse: {} };
  const client = {
    connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Set(),
    async request(name, body, _response, _timeout, options) {
      if (options?.mutate) {
        writes.push({ name, body: structuredClone(body), durableBeforeWrite: structuredClone(journal.at(-1)) });
        if (apply) progress++;
        return {};
      }
      if (name === 'AllItemRequest') return { items: [{ itemId: 'wood', num: 1000 }] };
      if (name === 'AllResourceRequest') return { list: [] };
      throw Error('Unexpected synthetic read ' + name);
    },
    markUnverifiedWrite(name, body) { this.uncertainWrites.add(JSON.stringify({ name, body })); },
    confirmWatchedWrite(name, body) { this.uncertainWrites.delete(JSON.stringify({ name, body })); },
  };
  const session = { id: 'synthetic-A', client, player: { playerId: 'synthetic-player', worldId: 1 }, state: 'READY', generation: 1, connectionId: 'synthetic-connection', abort: new AbortController(), busy: null };
  const history = { ...durable, put(record) { if (failFinalPersist && record.finishedAt) throw Object.assign(Error('synthetic final persistence failure'), { code: 'HISTORY_UNAVAILABLE' }); const saved = durable.put(record); journal.push(structuredClone(saved)); return saved; } };
  const serviceOptions = { protocol, modules, history, businessExecute(client, protocol, operation, options) { executionBudget = options.budget; return executeBusinessOperation(client, protocol, operation, options); }, getConfig: () => ({}), loadRules: () => ({ config: {} }), loadProduction: () => ({ config: {} }), moduleSettings: { get: () => ({ config: { enabled: true } }) } };
  const service = createOperationService(serviceOptions);
  function claim(runId = 'synthetic-parent', parentLimits = limits) { const release = service.claimWorkflow(session, runId, { limits: parentLimits }); releases.push(release); return release; }
  const plan = (selections = ['first'], mode = 'Manual') => service.plan(session, { module: 'fixture', mode, selections, parameters: {} }, { workflowId: session.workflowOwner ?? null });
  async function execute(planned) {
    const permit = service.authorize(session, { batchId: planned.batchId, planHash: planned.planHash, approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: planned.resourceBudget, confirm: true });
    service.execute(session, permit); await service.settle(session.id); return durable.list(session.id)[0];
  }
  async function second() { try { return await execute(await plan(['second'])); } catch (error) { assert.match(error.message, /预算|budget|声明|UID|配额/i); return null; } }
  async function cleanup() { for (const release of releases.reverse()) await release(); await service.settle(session.id); assert.equal(path.dirname(dir), os.tmpdir()); fs.rmSync(dir, { recursive: true, force: true }); }
  return { dir, file, service, serviceOptions, session, modules, journal, writes, durable, claim, plan, execute, second, cleanup, executionAudit: () => executionBudget?.runBudget.snapshot(),
    changeDeclaration(value) { currentDeclaration = structuredClone(value); } };
}

test('zero-material quota is bound to the displayed action and durably reserved before generic transport', async () => {
  const f = fixture({ declaration: quota(1) });
  try {
    f.claim(); const plan = await f.plan();
    assert.deepEqual(plan.actions[0].budgetClaims, quota(1)); assert.deepEqual(plan.budgetClaims, quota(1));
    const run = await f.execute(plan); assert.equal(run.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
    const durable = f.writes[0].durableBeforeWrite.runBudget;
    assert.equal(sum(durable.reserved.quotas, 'synthetic-free-action'), 1);
    assert.equal(sum(durable.batches[0].reserved.quotas, 'synthetic-free-action'), 1);
  } finally { await f.cleanup(); }
});

for (const [label, declaration] of [['quota', quota(1)], ['typed UID', uid()]]) test('fresh stock and a new independently authorized batch cannot reuse parent ' + label, async () => {
  const f = fixture({ declaration });
  try {
    f.claim(); const first = await f.execute(await f.plan()); assert.equal(first.finalStatus, 'SUCCESS');
    const second = await f.second(); assert.notEqual(second?.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
    assert.deepEqual(f.service.workflowBudget(f.session.id).reserved, declaration);
  } finally { await f.cleanup(); }
});

test('a fresh replan changing only quota/UID declarations invalidates the authorized candidate without a debit', async () => {
  const f = fixture({ declaration: quota(1), limits: quota(2) });
  try {
    f.claim(); const plan = await f.plan(); f.changeDeclaration(quota(2));
    const run = await f.execute(plan); assert.notEqual(run.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 0);
    assert.deepEqual(f.service.workflowBudget(f.session.id).reserved, empty());
  } finally { await f.cleanup(); }
});

test('a batch cannot silently merge two actions claiming the same typed UID', async () => {
  const f = fixture({ declaration: uid() });
  try { f.claim(); await assert.rejects(f.plan(['first', 'second'], 'Hybrid'), /UID|实例|重复|声明/); assert.equal(f.writes.length, 0); }
  finally { await f.cleanup(); }
});

test('declared resource amount cannot differ from executable costs', async () => {
  const f = fixture({ declaration: { resources: [{ id: 'wood', num: 1 }], quotas: [], uids: [] } });
  try {
    f.claim();
    const original = f.modules.fixture.plan; f.modules.fixture.plan = (...args) => { const result = original(...args); result.actions[0].costs = [{ id: 'wood', num: 2 }]; return result; };
    await assert.rejects(f.plan(), /资源|成本|声明|预算/); assert.equal(f.writes.length, 0);
  } finally { await f.cleanup(); }
});

test('UNKNOWN closes the parent immediately without releasing its zero-material quota', async () => {
  const f = fixture({ declaration: quota(1), apply: false });
  try {
    f.claim(); const run = await f.execute(await f.plan()); assert.equal(run.finalStatus, 'UNKNOWN');
    const audit = f.service.workflowBudget(f.session.id); assert.equal(audit.state, 'CLOSED'); assert.equal(audit.outcome, 'UNKNOWN'); assert.deepEqual(audit.reserved, quota(1));
    assert.equal(f.service.status(f.session.id).blocked, true); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('Workflow final durable snapshot closes its parent before reporting COMPLETED', async () => {
  const f = fixture(), updates = []; let runner;
  try {
    const graph = { version: 1, id: 'synthetic-final-budget', name: 'Synthetic final audit', budget: empty(), nodes: [{ id: 's', type: 'START' }, { id: 'a', type: 'ACTION', module: 'fixture', selection: 'first' }, { id: 'v', type: 'VERIFY', module: 'fixture' }, { id: 'z', type: 'STOP' }], edges: [{ from: 's', to: 'a' }, { from: 'a', to: 'v' }, { from: 'v', to: 'z' }] };
    runner = createWorkflowRunner({ operations: f.service, modules: f.modules, getSession: () => f.session, claim: (_account, runId, options) => f.claim(runId, options.limits), onUpdate: state => updates.push(structuredClone(state)) });
    const first = await runner.start(f.session.id, graph); assert.equal(first.status, 'AWAITING_AUTHORIZATION');
    await f.execute(first.plan); const final = await runner.resume(); assert.equal(final.status, 'COMPLETED');
    assert.equal(final.runBudget.state, 'CLOSED'); assert.equal(updates.at(-1).status, 'COMPLETED'); assert.equal(updates.at(-1).runBudget.state, 'CLOSED'); assert.equal(updates.at(-1).runBudget.resumable, false);
  } finally { runner?.stop(); await runner?.settle(); await f.cleanup(); }
});

test('restart keeps UNKNOWN evidence but cannot reconstruct a live budget or reuse old authorization', async () => {
  const f = fixture({ declaration: quota(1), apply: false });
  try {
    f.claim(); const old = await f.plan(); await f.execute(old);
    const restartedHistory = createExecutionHistory({ file: f.file }), restarted = createOperationService({ ...f.serviceOptions, history: restartedHistory });
    assert.equal(restarted.workflowBudget(f.session.id), null); assert.equal(restartedHistory.list(f.session.id)[0].runBudget.resumable, false);
    assert.equal(restarted.status(f.session.id).blocked, true);
    assert.throws(() => restarted.authorize(f.session, { batchId: old.batchId, planHash: old.planHash, approvedActionIds: ['first'], resourceBudget: [], confirm: true }), /批次|过期/);
    assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('Workflow restart converts active history to stopped audit and exposes no resume capability', async () => {
  const f = fixture();
  try {
    f.claim(); const store = createWorkflowStore({ file: path.join(f.dir, 'workflows.json'), modules: f.modules });
    store.record(f.session.id, { runId: 'synthetic-parent', workflowId: 'synthetic-workflow', status: 'AWAITING_AUTHORIZATION', runBudget: f.service.workflowBudget(f.session.id) });
    const reopened = createWorkflowStore({ file: path.join(f.dir, 'workflows.json'), modules: f.modules }).history(f.session.id)[0];
    assert.equal(reopened.status, 'RECOVERED_STOPPED'); assert.equal(reopened.resumable, false); assert.equal(reopened.runBudget.resumable, false);
    assert.equal(typeof reopened.runBudget.child, 'undefined');
  } finally { await f.cleanup(); }
});
function crossModuleFixture(limit) {
  const failFinalPersist = false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-cross-module-budget-')), file = path.join(dir, 'history.json');
  const durable = createExecutionHistory({ file }), journal = [], writes = [];
  const modules = { ...CORE_OPERATION_MODULES, fleet: fleetModule };
  const config = { tables: {
    BuildingCfg: { data: [{ buildingType: '材料厂' }] },
    BuildingUpgradeCfg: { data: [{ buildingType: '材料厂', level: 1, playerLevel: 1, curPeople: 0, consume: [], condition: [], effect: [], costTime: 0 }] },
    BuildingProduceCfg: { data: [{ buildType: '材料厂', itemId: 'synthetic-cloth', produceTime: 30, unlockLevel: 1, costItem: [['汽油', 40]] }] },
    BuildingProduceParamCfg: { data: [{ paramName: '制造位上限', paramValue: 6 }] },
    GameParamCfg: { data: [{ paramName: '初始人口上限', paramValue: 100 }, { paramName: '产品存量初始上限', paramValue: 50 }] },
    WorkerOrderCfg: { data: [{ itemId: '汽油', reward: [['EXP', 1]] }] }, WorkerSpecOrderCfg: { data: [] },
  } };
  const raw = {
    building: [{ buildingId: '1材料厂', level: 1, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] }, factory: { autoProductId: '', factoryQ: [], finishedProducts: [] } }],
    workerOrder: [{ index: 0, workerId: 'synthetic-resident', textId: 1, isSpecial: false, refreshTime: 0, requirements: [{ id: '汽油', num: 40 }] }], orderOfTheDay: { orderNum: 3 },
  };
  const fleet = { buildingId: 'synthetic-fleet', state: 1, durability: 60, maxDura: 100, cityId: 1, targetCityId: 0, treasureLootUid: 0, autoFight: { isOn: false, todayTimes: 0 } };
  let stock = 1000;
  const protocol = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets', 'FinishWorkerOrder', 'StartFactoryProduce', 'FleetRepairParam', 'RepairFleet', 'CargoShips', 'WorldInfo', 'GuildInfo'].flatMap(name => [[name + 'Request', {}], [name + 'Response', {}]]));
  const mutate = (name, body) => {
    writes.push({ name, body: structuredClone(body), durableBeforeWrite: structuredClone(journal.at(-1)) }); stock -= 40;
    if (name === 'FinishWorkerOrderRequest') { raw.workerOrder = []; raw.orderOfTheDay.orderNum++; }
    else if (name === 'StartFactoryProduceRequest') raw.building[0].factory.factoryQ.push({ idx: 0, productId: body.productId, finishTime: Math.floor(Date.now() / 1000) + 30 });
    else if (name === 'RepairFleetRequest') fleet.durability = 100;
    else throw Error('Unexpected original executor write ' + name);
  };
  const client = {
    connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Set(),
    async request(name, body, _response, _timeout, options) {
      if (options?.mutate) { mutate(name, body); return {}; }
      if (name === 'OnWaterRequest') return structuredClone(raw);
      if (name === 'AllItemRequest') return { items: [{ itemId: '汽油', num: stock }] };
      if (name === 'AllResourceRequest') return { list: [] };
      if (name === 'MyResFieldsRequest') return { info: { fields: [] } };
      if (name === 'MyFleetsRequest') return { fleets: [structuredClone(fleet)] };
      if (name === 'FleetRepairParamRequest') return { unitRepairCost: 1, unitRepairTime: 1 };
      if (name === 'CargoShipsRequest') return { ship: [] };
      if (name === 'WorldInfoRequest') return { cities: [] };
      if (name === 'GuildInfoRequest') return { guild: { guildId: 3003 } };
      throw Error('Unexpected original executor read ' + name);
    },
    async sendWatch(name, body) { mutate(name, body); return { status: 'UNKNOWN', sent: true }; },
    markUnverifiedWrite(name, body) { this.uncertainWrites.add(JSON.stringify({ name, body })); },
    confirmWatchedWrite(name, body) { this.uncertainWrites.delete(JSON.stringify({ name, body })); },
  };
  const session = { id: 'synthetic-cross-module', client, state: 'READY', generation: 1, connectionId: 'synthetic-shared-connection', player: { playerId: 'synthetic-player', level: 5, worldId: 1 }, abort: new AbortController(), busy: null };
  const fleetConfig = { ...FLEET_DEFAULT_CONFIG, enabled: true, repair: true, maximumRepairPetrolPerPlan: 40 };
  const history = { ...durable, put(record) { if (failFinalPersist && record.finishedAt) throw Object.assign(Error('synthetic final persistence failure'), { code: 'HISTORY_UNAVAILABLE' }); const saved = durable.put(record); journal.push(structuredClone(saved)); return saved; } };
  const service = createOperationService({ protocol, modules, history, getConfig: () => config,
    loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }), loadProduction: () => ({ config: { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 } }),
    moduleSettings: { get: (_account, module) => ({ config: module === 'fleet' ? fleetConfig : { enabled: true } }) } });
  const release = service.claimWorkflow(session, 'synthetic-cross-run', { limits: { resources: [{ id: '汽油', num: limit }], quotas: [], uids: [] } });
  async function execute(module, kind) {
    const view = await service.surveyModule(session, module, {}, { workflowId: session.workflowOwner });
    const candidate = view.view.candidates.find(row => row.actionType === kind);
    assert.ok(candidate, 'expected real ' + module + ' candidate'); assert.deepEqual(candidate.costs, [{ id: '汽油', num: 40 }]);
    const planned = await service.plan(session, { module, mode: 'Manual', selections: [candidate.actionId], parameters: {} }, { workflowId: session.workflowOwner });
    const permit = service.authorize(session, { batchId: planned.batchId, planHash: planned.planHash, approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: planned.resourceBudget, confirm: true });
    service.execute(session, permit); await service.settle(session.id); return durable.list(session.id)[0];
  }
  return { service, session, writes, execute, replenish() { stock = 1000; }, async cleanup() { await release(); await service.settle(session.id); assert.equal(path.dirname(dir), os.tmpdir()); fs.rmSync(dir, { recursive: true, force: true }); } };
}

for (const limit of [100, 120]) test('original orders, production and fleet repair functions share the same ' + limit + '-petrol parent despite intervening stock gains', async () => {
  const f = crossModuleFixture(limit);
  try {
    for (const [module, kind] of [['orders', 'SUBMIT'], ['production', 'startProduce']]) {
      const run = await f.execute(module, kind); assert.equal(run.finalStatus, 'SUCCESS', JSON.stringify(run.actions)); assert.equal(run.actions[0].verification.status, 'CONFIRMED'); f.replenish();
    }
    assert.equal(f.writes.length, 2); assert.equal(sum(f.service.workflowBudget(f.session.id).reserved.resources, '汽油'), 80);
    const repair = await f.execute('fleet', 'fleetRepair');
    assert.equal(repair.finalStatus, limit === 120 ? 'SUCCESS' : 'NOT_EXECUTED', JSON.stringify(repair.actions));
    assert.equal(f.writes.length, limit === 120 ? 3 : 2);
    assert.deepEqual(f.writes.map(row => row.name), ['FinishWorkerOrderRequest', 'StartFactoryProduceRequest', ...(limit === 120 ? ['RepairFleetRequest'] : [])]);
    assert.deepEqual(f.writes.map(row => sum(row.durableBeforeWrite.runBudget.reserved.resources, '汽油')), limit === 120 ? [40, 80, 120] : [40, 80]);
    assert.equal(sum(f.service.workflowBudget(f.session.id).reserved.resources, '汽油'), limit === 120 ? 120 : 80);
  } finally { await f.cleanup(); }
});
for (const workflow of [true, false]) test('post-dispatch final persistence failure closes the ' + (workflow ? 'Workflow' : 'standalone') + ' parent UNKNOWN before releasing account execution', async () => {
  const f = fixture({ declaration: quota(1), failFinalPersist: true });
  try {
    if (workflow) f.claim();
    await f.execute(await f.plan());
    assert.equal(f.writes.length, 1); assert.equal(f.service.status(f.session.id).finalStatus, 'UNKNOWN');
    assert.equal(f.service.status(f.session.id).running, false); assert.equal(f.service.status(f.session.id).blocked, true);
    const audit = f.executionAudit(); assert.equal(audit.state, 'CLOSED'); assert.equal(audit.outcome, 'UNKNOWN');
    assert.deepEqual(audit.reserved, quota(1)); assert.equal(audit.resumable, false);
    if (workflow) assert.deepEqual(f.service.workflowBudget(f.session.id), audit);
    else assert.equal(f.service.workflowBudget(f.session.id), null);
  } finally { await f.cleanup(); }
});