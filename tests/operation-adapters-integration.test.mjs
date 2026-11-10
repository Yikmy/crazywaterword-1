import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

const policy = { version: 1, enabled: true, rules: [] };
const config = { tables: {
  BuildingCfg: { data: [{ buildingType: '民居' }, { buildingType: '材料厂' }] },
  BuildingUpgradeCfg: { data: [{ buildingType: '民居', level: 1, playerLevel: 1, curPeople: 0,
    consume: [['wood', 1]], condition: [], effect: [], costTime: 0 }] },
  WorkerOrderCfg: { data: [{ itemId: 'wood', reward: [['EXP', 100]] }] },
  BuildingProduceCfg: { data: [{ buildType: '材料厂', itemId: 'bread', unlockLevel: 1, produceTime: 60, costItem: [['wood', 1]] }] },
  GameParamCfg: { data: [{ paramName: '产品存量初始上限', paramValue: 50 }] },
  BuildingProduceParamCfg: { data: [{ paramName: '制造位上限', paramValue: 6 }] },
} };
const wire = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets', 'FinishWorkerOrder']
  .flatMap(name => [[name + 'Request', {}], [name + 'Response', {}]]));
wire.BuildBuildingRequest = {}; wire.StartFactoryProduceRequest = {};
function fixture(stock = 4) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-adapters-integration-'));
  const history = createExecutionHistory({ file: path.join(dir, 'history.json') });
  let productionPolicy = { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 };
  const raw = { workerOrder: [{ index: 0, workerId: 'synthetic-resident', textId: 1, isSpecial: false,
    refreshTime: 0, requirements: [{ id: 'wood', num: 2 }] }], orderOfTheDay: { orderNum: 3 }, building: [
    { buildingId: '1民居', level: 0, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] } },
    { buildingId: '1材料厂', level: 1, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] },
      factory: { autoProductId: '', factoryQ: [], finishedProducts: [] } },
  ] };
  const writes = [], reads = [], uncertain = new Set();
  const mutate = (name, body) => {
    writes.push({ name, body });
    if (name === 'FinishWorkerOrderRequest') { raw.workerOrder = raw.workerOrder.filter(order => order.index !== body.index); raw.orderOfTheDay.orderNum++; stock -= 2; }
    else if (name === 'BuildBuildingRequest') { raw.building.find(row => row.buildingId === body.buildingId).level = 1; stock--; }
    else if (name === 'StartFactoryProduceRequest') { raw.building.find(row => row.buildingId === body.buildingId).factory.factoryQ.push({ idx: 1, productId: body.productId, finishTime: Math.floor(Date.now() / 1000) + 60 }); stock--; }
    else throw Error('unexpected mutation ' + name);
  };
  const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: uncertain,
    async request(name, body, response, timeout, options) {
      if (options?.mutate) { mutate(name, body); return {}; }
      reads.push(name);
      if (name === 'OnWaterRequest') return structuredClone(raw);
      if (name === 'AllItemRequest') return { items: [{ itemId: 'wood', num: stock }, { itemId: 'bread', num: 0 }] };
      if (name === 'AllResourceRequest') return { list: [] };
      if (name === 'MyResFieldsRequest') return { info: { fields: [] } };
      if (name === 'MyFleetsRequest') return { fleets: [] };
      throw Error('unexpected read ' + name);
    },
    async sendWatch(name, body) { mutate(name, body); uncertain.add(JSON.stringify({ name, body })); return { status: 'UNKNOWN', sent: true }; },
    markUnverifiedWrite(name, body) { uncertain.add(JSON.stringify({ name, body })); },
    confirmWatchedWrite(name, body) { uncertain.delete(JSON.stringify({ name, body })); },
  };
  const service = createOperationService({ protocol: wire, getConfig: () => config, loadRules: () => ({ config: policy }), loadProduction: () => ({ config: structuredClone(productionPolicy), warning: null }), history });
  const session = { id: 'synthetic-account', client, state: 'READY', generation: 1, abort: new AbortController(),
    player: { level: 3 }, loop: { running: false }, busy: null };
  const start = async (module, mode, selections) => {
    const plan = await service.plan(session, { module, mode, selections });
    const approval = service.authorize(session, { batchId: plan.batchId, planHash: plan.planHash,
      approvedActionIds: plan.actions.map(action => action.actionId), resourceBudget: plan.resourceBudget, confirm: true });
    service.execute(session, approval); await service.settle(session.id); return plan;
  };
  return { service, session, client, raw, history, writes, reads, start,
    setProductionPolicy(value) { productionPolicy = structuredClone(value); },
    cleanup() { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('real combined survey, order and city adapters complete authorized order/build and manual production with durable evidence', async () => {
  const f = fixture();
  try {
    const collected = await f.service.survey(f.session), view = collected.view;
    assert.equal(f.reads.length, 5, 'combined metadata comes from one existing survey collection');
    assert.equal(view.orders[0].executable, true);
    assert.equal(view.orders[0].action, undefined, 'internal request construction stays on the server');
    const build = view.city.candidates.find(action => action.actionType === 'build');
    assert.ok(build);
    const plan = await f.start('combined', 'Automatic', [view.orders[0].actionId, build.actionId]);
    assert.deepEqual(plan.resourceBudget, [{ id: 'wood', num: 3 }]);
    assert.equal(f.service.status(f.session.id).finalStatus, 'SUCCESS');
    assert.deepEqual(f.writes.map(row => row.name), ['FinishWorkerOrderRequest', 'BuildBuildingRequest']);
    const run = f.history.list(f.session.id)[0];
    assert.equal(run.actions.length, 2);
    for (const action of run.actions) {
      assert.equal(action.result, 'SUCCESS'); assert.equal(action.verification.status, 'CONFIRMED');
      assert.ok(action.beforeState); assert.notEqual(action.afterState, undefined);
      assert.ok(action.resourceBefore || action.beforeInventory, 'each action retains its before-inventory evidence');
    }
    const refreshed = (await f.service.survey(f.session)).view;
    const production = refreshed.city.candidates.find(action => action.actionType === 'startProduce');
    assert.ok(production);
    await f.start('city', 'Manual', [production.actionId]);
    assert.equal(f.service.status(f.session.id).finalStatus, 'SUCCESS');
    assert.deepEqual(f.writes.map(row => row.name), ['FinishWorkerOrderRequest', 'BuildBuildingRequest', 'StartFactoryProduceRequest']);
    assert.equal(f.raw.building[1].factory.factoryQ[0].productId, 'bread');
    assert.equal(f.client.uncertainWrites.size, 0); assert.equal(f.session.busy, null);
    assert.equal(f.history.list(f.session.id).length, 2);
  } finally { await f.service.settle(f.session.id); f.cleanup(); }
});

test('real combined planning rejects individually affordable order/build operations that share insufficient materials', async () => {
  const f = fixture(2);
  try {
    const view = (await f.service.survey(f.session)).view;
    const build = view.city.candidates.find(action => action.actionType === 'build');
    assert.ok(build); assert.equal(view.orders[0].executable, true);
    await assert.rejects(f.service.plan(f.session, { module: 'combined', mode: 'Automatic', selections: [view.orders[0].actionId, build.actionId] }), /预算不足|无法执行/);
    assert.equal(f.writes.length, 0); assert.equal(f.history.list(f.session.id).length, 0);
  } finally { f.cleanup(); }
});

test('real Automatic production is restricted by account policy and a policy change invalidates its exact authorization', async () => {
  const f = fixture();
  try {
    const view = (await f.service.survey(f.session)).view;
    const production = view.city.candidates.find(action => action.actionType === 'startProduce');
    const request = { module: 'city', mode: 'Automatic', selections: [production.actionId] };
    await assert.rejects(f.service.plan(f.session, request), /自动生产未启用|策略范围/);
    f.setProductionPolicy({ version: 1, enabled: true, onlyShortages: false, productIds: ['other-product'], maxOperations: 1 });
    await assert.rejects(f.service.plan(f.session, request), /策略范围/);
    f.setProductionPolicy({ version: 1, enabled: true, onlyShortages: false, productIds: ['bread'], maxOperations: 1 });
    const plan = await f.service.plan(f.session, request);
    const approval = f.service.authorize(f.session, { batchId: plan.batchId, planHash: plan.planHash,
      approvedActionIds: plan.actions.map(action => action.actionId), resourceBudget: plan.resourceBudget, confirm: true });
    f.setProductionPolicy({ version: 1, enabled: true, onlyShortages: false, productIds: ['bread'], maxOperations: 2 });
    assert.throws(() => f.service.execute(f.session, approval), /生产策略已变化/);
    assert.equal(f.writes.length, 0);
    await f.start('city', 'Automatic', [production.actionId]);
    assert.equal(f.service.status(f.session.id).finalStatus, 'SUCCESS');
    assert.deepEqual(f.writes.map(row => row.name), ['StartFactoryProduceRequest']);
    assert.deepEqual(f.history.list(f.session.id)[0].planSummary.productionPolicy.productIds, ['bread']);
  } finally { await f.service.settle(f.session.id); f.cleanup(); }
});
