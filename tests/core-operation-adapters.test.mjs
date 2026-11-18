import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CORE_OPERATION_MODULES, ordersModule, cityModule, productionModule, validateCoreOperationParameters, prepareProductionStartWorkflow, validateProductionStartPreparation, prepareCityWorkflow, validateCityPreparation } from '../src/core-operation-adapters.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';

const config = { tables: {
  BuildingCfg: { data: [{ buildingType: '民居' }, { buildingType: '材料厂' }] },
  BuildingUpgradeCfg: { data: ['民居', '材料厂'].flatMap(buildingType => [
    { buildingType, level: 1, playerLevel: 1, curPeople: 0, consume: [['wood', 1]], condition: [], effect: [['人口增加', 10]], costTime: 0 },
    { buildingType, level: 2, playerLevel: 1, curPeople: 0, consume: [['wood', 2]], condition: [], effect: [], costTime: 30 },
  ]) },
  WorkerOrderCfg: { data: [{ itemId: 'wood', reward: [['EXP', 100]] }, { itemId: 'cloth', reward: [['EXP', 50]] }] },
  WorkerSpecOrderCfg: { data: [] },
  BuildingProduceCfg: { data: [{ buildType: '材料厂', itemId: 'cloth', produceTime: 30, unlockLevel: 1, costItem: [['wood', 1]] },
    { buildType: '材料厂', itemId: 'fuel', produceTime: 60, unlockLevel: 1, costItem: [['wood', 2]] }] },
  GameParamCfg: { data: [{ paramName: '初始人口上限', paramValue: 100 }, { paramName: '产品存量初始上限', paramValue: 50 }] },
  BuildingProduceParamCfg: { data: [{ paramName: '制造位上限', paramValue: 6 }] },
} };
const rules = { version: 1, enabled: true, rules: [] };
const refreshRules = { version: 1, enabled: true, rules: [{ id: 'exp', priority: 1, type: 'MIN_EXPERIENCE', enabled: true, params: { value: 500, operator: 'GTE' }, onFail: 'REFRESH' }] };
const productionPolicy = { version: 1, enabled: true, onlyShortages: false, productIds: ['cloth'], maxOperations: 1 };
const options = (extra = {}) => ({ config, rules, moduleConfig: { enabled: true }, parameters: {}, player: { level: 5 }, mode: 'Manual', ...extra });
const rawOrder = (index = 0, requirements = [{ id: 'wood', num: 2 }]) => ({ index, workerId: 'synthetic-resident-' + index, textId: 1, isSpecial: false, refreshTime: 0, requirements });
const rawBuilding = (buildingId, level = 1, extra = {}) => ({ buildingId, level, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] }, ...extra });
const protocol = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets', 'FinishWorkerOrder', 'CollectBuildingProduct', 'GainFactoryProduce']
  .flatMap(name => [[name + 'Request', {}], [name + 'Response', {}]]));
for (const name of ['BuildBuilding', 'UpgradeBuilding', 'FinishUpgradeBuilding', 'StartFactoryProduce', 'SpeedUpUpgradeBuilding', 'SpeedUpFactoryProduce', 'DenyOrder']) protocol[name + 'Request'] = {};
function fixture({ stock = 4, orders = [rawOrder()], apply = true, afterWrite, omitWater = [] } = {}) {
  const raw = { building: [rawBuilding('1民居', 0), rawBuilding('1材料厂', 1, { factory: { autoProductId: '', factoryQ: [], finishedProducts: [] } })], workerOrder: structuredClone(orders), orderOfTheDay: { orderNum: 3 } };
  const inventory = new Map([['wood', stock], ['cloth', 0], ['fuel', 0], ['加速器', 3]]), reads = [], writes = [], uncertain = new Set(), confirmations = [];
  const mutate = (name, body) => {
    writes.push({ name, body: structuredClone(body) });
    if (!apply) return;
    const building = raw.building.find(row => row.buildingId === body.buildingId);
    if (name === 'FinishWorkerOrderRequest') { raw.workerOrder = raw.workerOrder.filter(row => row.index !== body.index); raw.orderOfTheDay.orderNum++; inventory.set('wood', inventory.get('wood') - 2); }
    else if (name === 'DenyOrderRequest') raw.workerOrder.find(row => row.index === body.index).workerId = 'replacement';
    else if (name === 'BuildBuildingRequest' || name === 'UpgradeBuildingRequest') { inventory.set('wood', inventory.get('wood') - (building.level === 0 ? 1 : 2)); building.level++; }
    else if (name === 'StartFactoryProduceRequest') { inventory.set('wood', inventory.get('wood') - 1); building.factory.factoryQ.push({ idx: 1, productId: body.productId, finishTime: Math.floor(Date.now() / 1000) + 30 }); }
    else if (name === 'GainFactoryProduceRequest') { for (const row of building.factory.finishedProducts) inventory.set(row.id, (inventory.get(row.id) ?? 0) + row.num); building.factory.finishedProducts = []; }
    else throw Error('Unexpected synthetic mutation ' + name);
    afterWrite?.(name, body, { raw, inventory });
  };
  const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: uncertain,
    async request(name, body, response, timeout, requestOptions) {
      if (requestOptions?.mutate) { mutate(name, body); return {}; }
      reads.push(name);
      if (name === 'OnWaterRequest') { const value = structuredClone(raw); for (const key of omitWater) delete value[key]; return value; }
      if (name === 'AllItemRequest') return { items: [...inventory].map(([itemId, num]) => ({ itemId, num })) };
      if (name === 'AllResourceRequest') return { list: [] };
      if (name === 'MyResFieldsRequest') return { info: { fields: [] } };
      if (name === 'MyFleetsRequest') return { fleets: [] };
      throw Error('Unexpected synthetic read ' + name);
    },
    async sendWatch(name, body) { mutate(name, body); uncertain.add(JSON.stringify({ name, body })); return { status: 'UNKNOWN', sent: true }; },
    markUnverifiedWrite(name, body) { uncertain.add(JSON.stringify({ name, body })); },
    confirmWatchedWrite(name, body) { confirmations.push({ name, body }); uncertain.delete(JSON.stringify({ name, body })); },
  };
  return { client, raw, inventory, reads, writes, uncertain, confirmations };
}
const read = (adapter, f, extra) => adapter.survey(f.client, protocol, options(extra));
function pick(adapter, facts, kind, extra = {}) {
  const row = adapter.view(facts, options(extra)).candidates.find(candidate => candidate.actionType === kind);
  assert.ok(row, 'expected candidate ' + adapter.id + ':' + kind); return row;
}
function plan(adapter, facts, row, extra = {}) { return adapter.plan(facts, options({ selections: [row.actionId], ...extra })).actions[0]; }
const execute = (adapter, f, operation, extra) => adapter.execute(f.client, protocol, operation, options({ allowMutate: true, ...extra }));

test('static core adapters expose original sources, disabled defaults and strict empty parameter schemas', () => {
  assert.deepEqual(Object.keys(CORE_OPERATION_MODULES), ['orders', 'city', 'production']);
  for (const adapter of Object.values(CORE_OPERATION_MODULES)) {
    assert.equal(Object.isFrozen(adapter), true); assert.equal(adapter.defaultConfig.enabled, false); assert.ok(adapter.capabilities.length); assert.ok(adapter.evidence.sources.length); assert.equal(adapter.evidence.realGame, 'REAL_UNVERIFIED');
    for (const value of [null, [], { request: 'AnyRequest' }, { body: {} }, { mode: 'Automatic' }, { parameters: {} }, { unknown: 1 }, Object.assign(Object.create({ request: 'AnyRequest' }), {})]) assert.throws(() => adapter.validateParameters(value), /空对象/);
    assert.deepEqual(adapter.validateParameters({}), {}); assert.deepEqual(adapter.validateParameters(Object.create(null)), {});
  }
  assert.deepEqual(validateCoreOperationParameters(), {});
});

test('ModuleSettings owns disabled per-account defaults and preserves independent explicit enables', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-core-adapters-'));
  try {
    const settings = createModuleSettings({ file: path.join(dir, 'settings.json'), modules: CORE_OPERATION_MODULES }), f = fixture(), facts = await read(ordersModule, f);
    for (const adapter of Object.values(CORE_OPERATION_MODULES)) {
      const moduleConfig = settings.get('synthetic-A', adapter.id).config; assert.equal(moduleConfig.enabled, false);
      assert.equal(adapter.view(facts, options({ moduleConfig })).candidates.every(row => row.executable === false), true);
      assert.deepEqual(adapter.plan(facts, options({ moduleConfig, selections: [] })).actions, []);
      settings.save('synthetic-A', adapter.id, { enabled: true }); assert.equal(settings.get('synthetic-B', adapter.id).config.enabled, false);
      assert.throws(() => settings.save('synthetic-A', adapter.id, { enabled: true, request: 'Anything' }), /未知/);
    }
    assert.equal(f.writes.length, 0);
  } finally { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('one existing survey captures both raw provenance sources and separates city and production candidate domains', async () => {
  const f = fixture(), facts = await read(ordersModule, f);
  assert.deepEqual(f.reads, ['OnWaterRequest', 'AllItemRequest', 'AllResourceRequest', 'MyResFieldsRequest', 'MyFleetsRequest']);
  assert.equal(facts.orderReliability.orders, true); assert.equal(facts.cityReliability.buildings, true);
  assert.ok(pick(ordersModule, facts, 'SUBMIT')); assert.ok(pick(cityModule, facts, 'build')); assert.ok(pick(productionModule, facts, 'startProduce'));
  assert.equal(cityModule.view(facts, options()).candidates.some(row => row.actionType === 'startProduce'), false);
  assert.equal(productionModule.view(facts, options()).candidates.some(row => row.actionType === 'build'), false);
  const construction = pick(cityModule, facts, 'build'), production = pick(productionModule, facts, 'startProduce');
  assert.throws(() => productionModule.plan(facts, options({ selections: [construction.actionId] })), /该核心业务/);
  assert.throws(() => cityModule.plan(facts, options({ selections: [production.actionId] })), /该核心业务/);
  assert.equal(f.writes.length, 0);
});

test('real orders, construction and production functions share one planning ledger and one execution budget', async () => {
  const f = fixture(), facts = await read(ordersModule, f), ledger = new ResourceLedger(facts.stock), budget = { ledger: null };
  const jobs = [[ordersModule, 'SUBMIT'], [cityModule, 'build'], [productionModule, 'startProduce']].map(([adapter, kind]) => [adapter, plan(adapter, facts, pick(adapter, facts, kind), { ledger })]);
  assert.deepEqual([...ledger.reserved], [['wood', 4]]); assert.equal(ledger.available('wood'), 0); assert.equal(facts.stock.get('wood'), 4);
  for (const [adapter, operation] of jobs) {
    assert.ok(operation); const result = await execute(adapter, f, operation, { budget });
    assert.equal(result.status, 'SUCCESS'); assert.equal(result.verification.status, 'CONFIRMED'); assert.equal(adapter.verify(operation, result).confirmed, true);
    assert.equal(adapter.verify(operation, { status: 'SUCCESS', verification: { status: 'CONFIRMED' } }).confirmed, false);
  }
  assert.deepEqual(f.writes.map(row => row.name), ['FinishWorkerOrderRequest', 'BuildBuildingRequest', 'StartFactoryProduceRequest']);
  assert.equal(f.raw.workerOrder.length, 0); assert.equal(f.raw.orderOfTheDay.orderNum, 4); assert.equal(f.raw.building[0].level, 1); assert.equal(f.raw.building[1].factory.factoryQ[0].productId, 'cloth');
  assert.equal(f.inventory.get('wood'), 0); assert.equal(budget.ledger.available('wood'), 0); assert.equal(f.uncertain.size, 0); assert.equal(f.confirmations.length, 3);
});

test('individually affordable core candidates cannot collectively exceed the same material ledger', async () => {
  const f = fixture({ stock: 2 }), facts = await read(ordersModule, f), ledger = new ResourceLedger(facts.stock);
  assert.ok(plan(ordersModule, facts, pick(ordersModule, facts, 'SUBMIT'), { ledger }));
  assert.equal(plan(cityModule, facts, pick(cityModule, facts, 'build'), { ledger }), undefined);
  assert.equal(plan(productionModule, facts, pick(productionModule, facts, 'startProduce'), { ledger }), undefined);
  assert.equal(ledger.available('wood'), 0); assert.equal(f.writes.length, 0);
});

for (const mode of ['Manual', 'Hybrid', 'Automatic']) test(mode + ' preserves the original order rules and concrete selection', async () => {
  const f = fixture(), facts = await read(ordersModule, f), row = pick(ordersModule, facts, 'SUBMIT', { mode });
  const operation = plan(ordersModule, facts, row, { mode }); assert.equal(operation.actionType, 'SUBMIT');
  assert.equal((await execute(ordersModule, f, operation, { mode })).status, 'SUCCESS'); assert.equal(f.writes.length, 1);
});

test('Manual rejects multi-actions, Hybrid rejects batched submits, Automatic retains one finite explicitly selected batch', async () => {
  const f = fixture({ stock: 8, orders: [rawOrder(), rawOrder(1)] }), facts = await read(ordersModule, f), ids = ordersModule.view(facts, options()).candidates.map(row => row.actionId);
  assert.throws(() => ordersModule.plan(facts, options({ selections: ids })), /Manual/);
  assert.throws(() => ordersModule.plan(facts, options({ mode: 'Hybrid', selections: ids })), /逐单/);
  assert.equal(ordersModule.plan(facts, options({ mode: 'Automatic', selections: ids })).actions.length, 2);
  for (const selections of [[ids[0], ids[0]], ['not-a-candidate'], [{ request: 'Anything' }]]) assert.throws(() => ordersModule.plan(facts, options({ mode: 'Automatic', selections })));
  assert.equal(f.writes.length, 0);
});

test('KEEP and REVIEW never become executable, and missing free-refresh evidence remains blocked', async () => {
  const f = fixture(), facts = await read(ordersModule, f);
  for (const onFail of ['KEEP', 'REVIEW', 'REFRESH']) {
    const policy = structuredClone(refreshRules); policy.rules[0].onFail = onFail;
    const row = ordersModule.view(facts, options({ rules: policy })).candidates[0];
    assert.equal(row.executable, false); assert.equal(plan(ordersModule, facts, row, { rules: policy }), undefined);
  }
  assert.equal(f.writes.length, 0);
});

test('Hybrid free refresh only uses trusted injected proof and preserves the original quota executor', async () => {
  const f = fixture(), refreshEligibility = () => ({ source: 'synthetic-authoritative-quota', free: true, allowed: true, remaining: 1 }), args = { rules: refreshRules, mode: 'Hybrid', refreshEligibility };
  const facts = await read(ordersModule, f), row = pick(ordersModule, facts, 'REFRESH', args), operation = plan(ordersModule, facts, row, args);
  assert.ok(operation); const result = await execute(ordersModule, f, operation, args);
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.verification.status, 'CONFIRMED'); assert.equal(f.writes[0].name, 'DenyOrderRequest'); assert.equal(f.raw.workerOrder[0].workerId, 'replacement');
});

test('Automatic production requires the original policy while Manual and Hybrid keep explicit bounded production', async () => {
  const f = fixture(), facts = await read(productionModule, f), row = pick(productionModule, facts, 'startProduce');
  assert.ok(plan(productionModule, facts, row)); assert.ok(plan(productionModule, facts, row, { mode: 'Hybrid' }));
  assert.throws(() => productionModule.plan(facts, options({ mode: 'Automatic', selections: [row.actionId] })), error => error.code === 'PRODUCTION_POLICY_REQUIRED');
  for (const policy of [{ ...productionPolicy, productIds: ['fuel'] }, { ...productionPolicy, onlyShortages: true }]) assert.throws(() => productionModule.plan(facts, options({ mode: 'Automatic', productionPolicy: policy, selections: [row.actionId] })), /策略/);
  const operation = plan(productionModule, facts, row, { mode: 'Automatic', productionPolicy });
  const result = await execute(productionModule, f, operation, { mode: 'Automatic', productionPolicy });
  assert.equal(result.status, 'SUCCESS'); assert.equal(f.raw.building[1].factory.factoryQ[0].productId, 'cloth');
});

test('Automatic production rechecks current shortages and stops before dispatch when a planned deficit is already covered', async () => {
  const f = fixture({ orders: [rawOrder(0, [{ id: 'cloth', num: 1 }])] }), facts = await read(productionModule, f), policy = { ...productionPolicy, onlyShortages: true };
  const operation = plan(productionModule, facts, pick(productionModule, facts, 'startProduce'), { mode: 'Automatic', productionPolicy: policy }); assert.ok(operation);
  f.inventory.set('cloth', 1);
  const result = await execute(productionModule, f, operation, { mode: 'Automatic', productionPolicy: policy });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.match(result.error, /策略/); assert.equal(f.writes.length, 0);
});

for (const [adapter, kind] of [[ordersModule, 'SUBMIT'], [cityModule, 'build'], [productionModule, 'startProduce']]) test(adapter.id + ' typed/quiet reply without a real state change stays UNKNOWN and keeps uncertainty', async () => {
  const f = fixture({ apply: false }), facts = await read(adapter, f), operation = plan(adapter, facts, pick(adapter, facts, kind));
  const result = await execute(adapter, f, operation);
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.dispatched, true); assert.equal(result.unresolvedWrite, true); assert.equal(result.verification.status, 'UNCONFIRMED');
  assert.equal(adapter.verify(operation, result).confirmed, false); result.status = 'SUCCESS'; result.verification.status = 'CONFIRMED'; assert.equal(adapter.verify(operation, result).confirmed, false);
  assert.equal(f.writes.length, 1); assert.ok(f.uncertain.size); assert.equal(f.confirmations.length, 0);
});

test('factory collection requires output removal and actual authoritative inventory growth', async () => {
  for (const increased of [false, true]) {
    const f = fixture({ afterWrite(name, body, state) { if (!increased && name === 'GainFactoryProduceRequest') state.inventory.set('cloth', 0); } });
    f.raw.building[1].factory.finishedProducts = [{ id: 'cloth', num: 1 }];
    const facts = await read(productionModule, f), operation = plan(productionModule, facts, pick(productionModule, facts, 'gainFactory'));
    const result = await execute(productionModule, f, operation);
    assert.equal(result.status, increased ? 'SUCCESS' : 'UNKNOWN'); assert.equal(productionModule.verify(operation, result).confirmed, increased);
    if (increased) assert.deepEqual(result.collectedProducts, [{ id: 'cloth', num: 1 }]);
  }
});

test('disabled modules, missing authorization and unknown parameters cannot trigger even a survey or dispatch', async () => {
  const f = fixture(), facts = await read(ordersModule, f);
  for (const [adapter, kind] of [[ordersModule, 'SUBMIT'], [cityModule, 'build'], [productionModule, 'startProduce']]) {
    const operation = plan(adapter, facts, pick(adapter, facts, kind)), before = f.reads.length;
    for (const args of [{ allowMutate: false }, { moduleConfig: { enabled: false } }, { parameters: { request: 'Anything' } }, { mode: 'infinite' }]) {
      assert.equal((await execute(adapter, f, operation, args)).status, 'NOT_EXECUTED'); assert.equal(f.reads.length, before); assert.equal(f.writes.length, 0);
    }
  }
});

test('raw missing order proof and incomplete city/production state never gain authority through defaults', async () => {
  const f = fixture({ omitWater: ['workerOrder'] }), facts = await read(productionModule, f);
  assert.equal(ordersModule.view(facts, options()).candidates.length, 0); assert.equal(productionModule.view(facts, options()).productionShortages.reliable, false);
  const row = pick(productionModule, facts, 'startProduce'); assert.throws(() => productionModule.plan(facts, options({ mode: 'Automatic', productionPolicy: { ...productionPolicy, onlyShortages: true }, selections: [row.actionId] })), /策略/);
  delete f.raw.building[1].factory.factoryQ;
  const incomplete = await read(productionModule, f); assert.equal(productionModule.view(incomplete, options()).candidates.length, 0); assert.equal(f.writes.length, 0);
});

test('dependency versions include only real module dependencies and condition Automatic production policy', () => {
  const base = options(), altered = structuredClone(base); altered.config.tables.UnrelatedHeroCfg = { data: [{ id: 1 }] }; altered.rules = { ...rules, enabled: false }; altered.productionPolicy = { ...productionPolicy, enabled: false };
  assert.deepEqual(cityModule.dependencyVersions(base), cityModule.dependencyVersions(altered));
  assert.deepEqual(productionModule.dependencyVersions(base), productionModule.dependencyVersions(altered));
  assert.notDeepEqual(ordersModule.dependencyVersions(base), ordersModule.dependencyVersions(altered));
  const rulesOnly = { ...base, rules: altered.rules }; assert.deepEqual(productionModule.dependencyVersions({ ...base, mode: 'Automatic', productionPolicy }), productionModule.dependencyVersions({ ...rulesOnly, mode: 'Automatic', productionPolicy }));
  assert.notDeepEqual(productionModule.dependencyVersions({ ...base, mode: 'Automatic', productionPolicy }), productionModule.dependencyVersions({ ...base, mode: 'Automatic', productionPolicy: altered.productionPolicy }));
  const changedCost = structuredClone(base); changedCost.config.tables.BuildingUpgradeCfg.data[0].consume = [['wood', 99]];
  assert.notDeepEqual(cityModule.dependencyVersions(base), cityModule.dependencyVersions(changedCost)); assert.deepEqual(ordersModule.dependencyVersions(base), ordersModule.dependencyVersions(changedCost));
  const changedRecipe = structuredClone(base); changedRecipe.config.tables.BuildingProduceCfg.data[0].costItem = [['wood', 99]];
  assert.notDeepEqual(productionModule.dependencyVersions(base), productionModule.dependencyVersions(changedRecipe));
  const copy = cityModule.dependencyVersions(base); copy.config.BuildingCfg.data.length = 0; assert.equal(config.tables.BuildingCfg.data.length, 2);
});

for (const [adapter, kind] of [[ordersModule, 'SUBMIT'], [cityModule, 'build'], [productionModule, 'startProduce']]) test(adapter.id + ' cancellation before reads stops cleanly and cancellation after dispatch preserves UNKNOWN and its held budget', async () => {
  const before = fixture(), facts = await read(adapter, before), operation = plan(adapter, facts, pick(adapter, facts, kind));
  const cancelled = new AbortController(); cancelled.abort(); const count = before.reads.length;
  const pre = await execute(adapter, before, operation, { signal: cancelled.signal });
  assert.equal(pre.status, 'CANCELLED'); assert.equal(pre.dispatched, false); assert.equal(before.reads.length, count); assert.equal(before.writes.length, 0);
  const controller = new AbortController(), f = fixture({ afterWrite() { controller.abort(); } }), fresh = await read(adapter, f);
  const job = plan(adapter, fresh, pick(adapter, fresh, kind)), budget = { ledger: null };
  const result = await execute(adapter, f, job, { signal: controller.signal, budget });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.dispatched, true); assert.equal(result.unresolvedWrite, true); assert.equal(f.writes.length, 1); assert.ok(f.uncertain.size);
  assert.equal(budget.ledger.available('wood'), 4 - job.costs[0].num); assert.equal(adapter.verify(job, result).confirmed, false);
});

test('a callback failure after a real order write propagates instead of being downgraded to NOT_EXECUTED', async () => {
  const f = fixture(), facts = await read(ordersModule, f), operation = plan(ordersModule, facts, pick(ordersModule, facts, 'SUBMIT'));
  await assert.rejects(execute(ordersModule, f, operation, { onStep() { throw Error('synthetic durable-evidence failure'); } }), /durable-evidence failure/);
  assert.equal(f.writes.length, 1); assert.equal(f.raw.orderOfTheDay.orderNum, 4);
});

for (const [adapter, kind] of [[ordersModule, 'SUBMIT'], [cityModule, 'build'], [productionModule, 'startProduce']]) test(adapter.id + ' transport timeout cannot be cleared by a late state mutation or a forged success receipt', async () => {
  const f = fixture(), facts = await read(adapter, f), operation = plan(adapter, facts, pick(adapter, facts, kind)), budget = { ledger: null };
  if (adapter.id === 'orders') {
    const request = f.client.request.bind(f.client);
    f.client.request = async (...args) => { if (args[4]?.mutate) { f.writes.push({ name: args[0], body: args[1] }); throw Object.assign(Error('synthetic timeout after dispatch'), { code: 'ETIMEDOUT' }); } return request(...args); };
  } else f.client.sendWatch = async (name, body) => { f.writes.push({ name, body }); throw Object.assign(Error('synthetic timeout after dispatch'), { code: 'ETIMEDOUT' }); };
  const result = await execute(adapter, f, operation, { budget });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.dispatched, true); assert.equal(result.unresolvedWrite, true); assert.ok(f.uncertain.size); assert.equal(f.writes.length, 1);
  const held = [...budget.ledger.reserved]; f.raw.orderOfTheDay.orderNum++; f.raw.workerOrder = []; f.raw.building[0].level++; f.raw.building[1].factory.factoryQ.push({ idx: 9, productId: 'cloth', finishTime: 9999999999 });
  assert.equal(adapter.verify(operation, result).confirmed, false); assert.deepEqual([...budget.ledger.reserved], held); assert.equal(f.confirmations.length, 0);
});

test('orders view publishes display rows without the internal transport Action', async () => {
  const f = fixture(), facts = await read(ordersModule, f), view = ordersModule.view(facts, options());
  assert.equal(view.orders[0].action, undefined); assert.ok(view.candidates[0].action, 'trusted planner candidates retain the internal catalog action until service projection');
});

test('production survey reuses core reads and adds only authoritative appointment reads with explainable projections', async () => {
  const f=fixture(), base=f.client.request.bind(f.client);
  const productionConfig=structuredClone(config);
  Object.assign(productionConfig.tables,{
    AppointEffectCfg:{data:[{effectId:'生产时间',viewType:'数值',heroAdd:[10,20,150,200],starAdd:[1,2,12,20]}]},
    AppointPosCfg:{data:[{posId:1,effectId:'生产时间'}]},HeroCfg:{data:[{id:'appointed',qualityIndex:3}]},
    FarmlandPlantCfg:{data:[{id:'小麦',material:['小麦种子',1]}]},SelectPackLibCfg:{data:[{selectItemId:'wood',itemId:'原料自选包',num:1,type:'道具'}]},
  });
  f.client.request=async(name,...args)=>{
    if(name==='AppointInfoRequest'){f.reads.push(name);return {heroes:[{posId:1,heroId:'appointed'}]};}
    if(name==='AllHeroRequest'){f.reads.push(name);return {heroes:[{heroId:'appointed',star:9}]};}
    return base(name,...args);
  };
  const wire={...protocol,AppointInfoRequest:{},AppointInfoResponse:{},AllHeroRequest:{},AllHeroResponse:{}};
  const args=options({config:productionConfig}), facts=await productionModule.survey(f.client,wire,args), view=productionModule.view(facts,args);
  assert.equal(view.appointment.reliable,true);assert.equal(view.appointment.seconds,258);
  assert.ok(view.factories.length);assert.equal(view.factories[0].recipes[0].appointmentAdjustedSeconds,0);
  assert.equal(view.factories[0].recipes[0].timingScope,'APPOINTMENT_ONLY_SPEED_BONUS_NOT_ESTABLISHED');
  assert.equal(view.factories[0].recipes[0].packCoverage.executable,false);
  assert.equal(view.cropSupply.projectionOnly,true);
  assert.equal(f.reads.filter(name=>name==='OnWaterRequest').length,1);
  assert.equal(f.reads.filter(name=>name==='AppointInfoRequest').length,1);
  assert.equal(f.reads.filter(name=>name==='AllHeroRequest').length,1);assert.equal(f.writes.length,0);
});

test('production missing appointment protocol or explicit star remains unknown and cannot imply instant production', async () => {
  for(const includeProtocol of [false,true]){
    const f=fixture(), base=f.client.request.bind(f.client);
    f.client.request=async(name,...args)=>name==='AppointInfoRequest'?{heroes:[{posId:1,heroId:'appointed'}]}:name==='AllHeroRequest'?{heroes:[{heroId:'appointed'}]}:base(name,...args);
    const args=options({config:{...config,tables:{...config.tables,AppointEffectCfg:{data:[{effectId:'生产时间',viewType:'数值',heroAdd:[1],starAdd:[1]}]},AppointPosCfg:{data:[{posId:1,effectId:'生产时间'}]},HeroCfg:{data:[{id:'appointed',qualityIndex:1}]}}}});
    const wire=includeProtocol?{...protocol,AppointInfoRequest:{},AppointInfoResponse:{},AllHeroRequest:{},AllHeroResponse:{}}:protocol;
    const view=productionModule.view(await productionModule.survey(f.client,wire,args),args);
    assert.equal(view.appointment.reliable,false);assert.equal(view.appointment.seconds,null);
    assert.equal(view.factories[0].recipes[0].appointmentAdjustedSeconds,null);assert.equal(f.writes.length,0);
  }
});

test('core survey retains original farm and equipment fields without another query or mutable aliases', async () => {
 const f=fixture(),base=f.client.request.bind(f.client);
 f.raw.autoFarming=false;f.raw.building.push({buildingId:'1农田',level:1,buildStartTime:0,buildFinishTime:0,farm:{productId:'小麦',plantTime:100,ripeTime:200},equipMaking:{makeId:1,equipId:'装备',star:0,finishTime:300}});
 f.client.request=async(name,...args)=>{const value=await base(name,...args);if(name==='AllItemRequest')value.items.push({itemId:'large-exact',num:'9007199254740993'});return value;};
 const facts=await read(productionModule,f);
 assert.equal(facts.rawOnWater.autoFarming,false);assert.deepEqual(facts.rawOnWater.building.at(-1).farm,{productId:'小麦',plantTime:100,ripeTime:200});
 assert.deepEqual(facts.rawOnWater.building.at(-1).equipMaking,{makeId:1,equipId:'装备',star:0,finishTime:300});
 assert.equal(facts.rawAllItem.items.at(-1).num,'9007199254740993');assert.deepEqual(facts.rawAllResource,{list:[]});
 facts.rawOnWater.building.at(-1).farm.productId='changed';assert.equal(f.raw.building.at(-1).farm.productId,'小麦');
 for(const request of ['OnWaterRequest','AllItemRequest','AllResourceRequest'])assert.equal(f.reads.filter(name=>name===request).length,1);
 assert.equal(f.writes.length,0);
});

test('core adapter candidates preserve their explicit parameters through the registered Loop contract without inferring a target',async()=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),{GAMEPLAY_MODULES}=await import('../src/function-registry.mjs');
 const f=fixture(),facts=await read(ordersModule,f);
 for(const [adapter,kind]of [[ordersModule,'SUBMIT'],[cityModule,'build'],[productionModule,'startProduce']]){
  const row=pick(adapter,facts,kind),target=structuredClone(row.target),parameters=adapter.id==='production'?{buildingId:'1材料厂',productId:'cloth'}:{};assert.deepEqual(row.parameters,parameters);
  const graph=compileUnifiedExecution({entry:'loop',world:[{module:adapter.id,parameters:row.parameters,selection:{actionId:row.actionId}}],budget:{resources:[{id:'wood',num:4}],quotas:[],uids:[]}},{modules:GAMEPLAY_MODULES}).graph;
  const action=graph.nodes.find(node=>node.type==='ACTION');assert.deepEqual(action.parameters,parameters);assert.deepEqual(action.selection,{actionId:row.actionId});
  row.parameters.injected='not-shared';assert.deepEqual(pick(adapter,facts,kind).parameters,parameters);assert.deepEqual(action.parameters,parameters);
  assert.deepEqual(row.target,target);
  const disabled=adapter.view(facts,options({moduleConfig:{enabled:false}})).candidates;
  assert.ok(disabled.length);assert.ok(disabled.every(candidate=>candidate.executable===false));
 }
 assert.equal(f.writes.length,0);
});

const waitProtocol = { ...protocol, GameEffectRequest: {}, GameEffectResponse: {} };
function waitFixture() {
  const f = fixture({ orders: [rawOrder(0, [{ id: 'cloth', num: 2 }])] });
  const original = f.client.request.bind(f.client);
  f.effects = { effects: [{ id: 1, value: 0 }, { id: 2, value: 0 }] };
  f.client.factContext = { accountId: 'A', generation: 1, connectionId: 'connection-A' };
  f.client.gameClock = { read: () => ({ status: 'TRUSTED', reliable: true, accountId: 'A', generation: 1, nowMs: 100000, earliestMs: 99999, latestMs: 100001 }) };
  f.client.request = async (...args) => { if (args[0] === 'GameEffectRequest') { f.reads.push(args[0]); return f.effectRead ? f.effectRead() : structuredClone(f.effects); } return original(...args); };
  return f;
}
const waitView = facts => ordersModule.view(facts, options()).orders[0].productionWait;
test('registered Orders survey reuses the full original read set plus one effects read and the original pure projection', async () => {
  const f = waitFixture(), facts = await ordersModule.survey(f.client, waitProtocol, options());
  const wait = waitView(facts), { orderProductionWait } = await import('../src/production-planning.mjs');
  assert.equal(wait.status, 'PROJECTED'); assert.equal(wait.leadSeconds, 60); assert.equal(wait.executable, false);
  assert.deepEqual(wait, orderProductionWait(config, { requirements: rawOrder(0,[{id:'cloth',num:2}]).requirements, stock: f.inventory, buildings: facts.rawOnWater.building.map(row=>({...row,type:row.buildingId==='1民居'?'民居':'材料厂'})), effects:f.effects,serverTimeMs:100000 }));
  assert.deepEqual(f.reads.sort(), ['OnWaterRequest','AllItemRequest','AllResourceRequest','MyResFieldsRequest','MyFleetsRequest','GameEffectRequest'].sort());
  const originalFacts = await cityModule.survey(f.client, protocol, options());
  assert.deepEqual(ordersModule.view(facts,options()).candidates,ordersModule.view(originalFacts,options()).candidates);
  assert.deepEqual(ordersModule.plan(facts,options({selections:[]})),ordersModule.plan(originalFacts,options({selections:[]})));
  assert.equal(f.writes.length,0); assert.equal(facts.orderProductionObservation.serverTimeMs,100000);
});
test('Orders captures trusted server time at the water response and does not substitute a later clock',async()=>{
  const f=waitFixture();f.raw.building[1].factory.factoryQ=[{idx:1,productId:'cloth',finishTime:120}];
  f.effectRead=()=>{f.client.gameClock.read=()=>({status:'UNKNOWN'});return f.effects;};
  const facts=await ordersModule.survey(f.client,waitProtocol,options());
  assert.equal(waitView(facts).leadSeconds,50);assert.equal(waitView(facts).serverTimeMs,100000);
});
for(const missing of ['protocol','failure','scalar','wrong-account-clock','wrong-generation-clock','no-clock','duplicate-stock','missing-stock-count','missing-building-level'])test('Orders wait projection keeps '+missing+' unknown without changing original write logic',async()=>{
  const f=waitFixture();let proto=waitProtocol;
  if(missing==='protocol')proto=protocol;
  if(missing==='failure')f.effectRead=()=>{throw Error('synthetic effect read failed');};
  if(missing==='scalar')delete f.effects.effects[0].value;
  if(missing==='missing-building-level')delete f.raw.building[1].level;
  if(['wrong-account-clock','wrong-generation-clock','no-clock'].includes(missing)){
    f.raw.building[1].factory.factoryQ=[{idx:1,productId:'cloth',finishTime:120}];
    const value=f.client.gameClock.read();if(missing==='wrong-account-clock')value.accountId='B';if(missing==='wrong-generation-clock')value.generation=2;if(missing==='no-clock')value.reliable=false;f.client.gameClock.read=()=>value;
  }
  if(missing==='duplicate-stock'||missing==='missing-stock-count'){
    const original=f.client.request;f.client.request=async(...args)=>{const result=await original(...args);if(args[0]==='AllItemRequest'){if(missing==='duplicate-stock')result.items.push({...result.items[0]});else delete result.items[0].num;}return result;};
  }
  const facts=await ordersModule.survey(f.client,proto,options()),wait=waitView(facts);
  assert.equal(wait.status,'UNKNOWN');assert.deepEqual(wait.allocations,[]);assert.equal(wait.executable,false);assert.equal(f.writes.length,0);
});
test('Orders effect read failure preserves an already stocked submit candidate and its original cost contract',async()=>{
  const f=waitFixture();f.inventory.set('cloth',2);f.effectRead=()=>{throw Error('synthetic');};
  const facts=await ordersModule.survey(f.client,waitProtocol,options()),view=ordersModule.view(facts,options());
  assert.equal(view.orders[0].productionWait.status,'IN_STOCK');assert.equal(view.candidates[0].executable,true);assert.equal(view.candidates[0].productionWait,undefined);
  assert.deepEqual(ordersModule.plan(facts,options({selections:[view.candidates[0].actionId]})).actions[0].costs,[{id:'cloth',num:2}]);assert.equal(f.writes.length,0);
});
for(const key of ['accountId','generation','connectionId'])test('Orders survey cancels '+key+' changes during the added read',async()=>{
  const f=waitFixture();f.effectRead=()=>{f.client.factContext[key]=key==='generation'?2:'changed';return f.effects;};
  await assert.rejects(ordersModule.survey(f.client,waitProtocol,options()),{code:'CANCELLED'});assert.equal(f.writes.length,0);
});
test('Orders cancellation does not accept a late effects response or carry it into a fresh survey',async()=>{
  const f=waitFixture(),abort=new AbortController();let release,entered;
  const start=new Promise(r=>entered=r);f.effectRead=()=>{entered();return new Promise(r=>release=r);};
  const pending=ordersModule.survey(f.client,waitProtocol,options({signal:abort.signal}));await start;abort.abort();await assert.rejects(pending,{code:'CANCELLED'});
  release(f.effects);await new Promise(r=>setImmediate(r));f.effectRead=null;
  const fresh=await ordersModule.survey(f.client,protocol,options());assert.equal(waitView(fresh).status,'UNKNOWN');assert.equal(f.writes.length,0);
});
test('City and Production do not acquire the new Orders effects read',async()=>{
  for(const adapter of [cityModule,productionModule]){const f=waitFixture();await adapter.survey(f.client,waitProtocol,options());assert.equal(f.reads.includes('GameEffectRequest'),false);assert.equal(f.writes.length,0);}
});

test('Orders Function observes raw progress and wait markers without adding either to write candidates or fixing missing fields',async()=>{
 const f=waitFixture(),cfg={tables:{...config.tables,OrderParamCfg:{data:[{paramName:'订单每日上限',paramValue:40}]}}};
 f.raw.orderOfTheDay={orderNum:12,rewardedNum:6};f.raw.workerOrder[0].refreshTime=120;f.effects.effects.push({id:18,value:5});
 const facts=await ordersModule.survey(f.client,waitProtocol,options({config:cfg})),view=ordersModule.view(facts,options({config:cfg}));
 assert.equal(view.progress.completed.value,12);assert.equal(view.progress.rewardedThrough.value,6);assert.equal(view.progress.clientLimit.value,45);assert.equal(view.progress.remainingProjection.value,33);assert.equal(view.progress.period.status,'UNKNOWN');
 assert.equal(view.orders[0].refreshTiming.remainingSeconds,20);assert.equal(view.orders[0].refreshTiming.executable,false);assert.equal(view.candidates[0].refreshTiming,undefined);assert.equal(f.reads.length,6);assert.equal(f.writes.length,0);
 delete f.raw.workerOrder[0].refreshTime;delete f.raw.orderOfTheDay.orderNum;
 const next=await ordersModule.survey(f.client,waitProtocol,options({config:cfg})),missing=ordersModule.view(next,options({config:cfg}));
 assert.equal(next.rawOrderMetadata.orders[0].refreshTime,0);assert.equal(missing.orders[0].refreshTiming.status,'UNKNOWN');assert.equal(missing.progress.completed.status,'UNKNOWN');assert.equal(missing.progress.remainingProjection.value,null);
});
test('duplicate raw order indexes cannot lend a waiting marker to another observation',async()=>{
 const f=waitFixture();f.raw.workerOrder[0].refreshTime=120;f.raw.workerOrder.push({...f.raw.workerOrder[0],refreshTime:130});
 const facts=await ordersModule.survey(f.client,waitProtocol,options()),view=ordersModule.view(facts,options());assert.ok(view.orders.every(row=>row.refreshTiming.status==='UNKNOWN'));assert.equal(f.writes.length,0);
});

function productionClockFixture(){const f=fixture();f.player={playerId:'17',worldId:9,level:5};f.raw.building[1].factory.factoryQ=[{idx:0,productId:'cloth',finishTime:101}];f.client.factContext={accountId:'A',generation:1,connectionId:'connection-A'};f.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:1,nowMs:100000,earliestMs:99999,latestMs:100001})};return f;}
test('registered production survey exposes only captured exact queue clocks without extra reads or altered write candidates',async()=>{
 const f=productionClockFixture(),facts=await read(productionModule,f,{player:f.player}),view=productionModule.view(facts,options());assert.equal(view.queueClocks.length,1);assert.equal(view.queueClocks[0].target.index,0);assert.equal(view.queueClocks[0].readiness,'WAITING_BY_CLOCK');assert.equal(view.queueClocks[0].executable,false);assert.equal(view.queueClocks[0].collectionConfirmed,false);assert.equal(f.reads.length,5);assert.equal(f.writes.length,0);assert.deepEqual(productionModule.view({...facts},options()).queueClocks,[]);facts.rawOnWater.building[1].factory.factoryQ[0].finishTime++;assert.deepEqual(productionModule.view(facts,options()).queueClocks,[]);
});
for(const fault of ['missing-clock','wrong-source','wrong-account','wrong-generation','bad-bounds','missing-role'])test('production queue clock stays unknown while original production view remains for '+fault,async()=>{
 const f=productionClockFixture(),clock=f.client.gameClock.read();if(fault==='missing-clock')clock.reliable=false;if(fault==='wrong-source')delete clock.source;if(fault==='wrong-account')clock.accountId='B';if(fault==='wrong-generation')clock.generation=2;if(fault==='bad-bounds')clock.earliestMs=100002;if(fault==='missing-role')delete f.player.playerId;f.client.gameClock.read=()=>clock;const facts=await read(productionModule,f,{player:f.player}),view=productionModule.view(facts,options());assert.equal(view.factories.length,1);assert.equal(view.queueClocks[0].readiness,'UNKNOWN');assert.equal(view.queueClocks[0].serverBounds,null);assert.equal(f.writes.length,0);
});
for(const key of ['accountId','generation','connectionId','playerId','worldId'])test('production survey discards late queue clock after '+key+' changes during existing appointment read',async()=>{
 const f=productionClockFixture(),original=f.client.request;f.client.request=async(name,...args)=>{if(name==='AppointInfoRequest'){f.client.factContext[key]=key==='generation'?2:'other';return {heroes:[]};}return original(name,...args);};await assert.rejects(productionModule.survey(f.client,{...protocol,AppointInfoRequest:{},AppointInfoResponse:{},AllHeroRequest:{},AllHeroResponse:{}},options({player:f.player})),{code:'CANCELLED'});assert.equal(f.reads.includes('AllHeroRequest'),false);assert.equal(f.writes.length,0);
});

test('production clock binds Session role/world when real client context only supplies account generation and connection',async()=>{const f=productionClockFixture(),original=f.client.request;f.client.request=async(name,...args)=>{if(name==='AppointInfoRequest'){f.player.worldId=10;return {heroes:[]};}return original(name,...args);};await assert.rejects(productionModule.survey(f.client,{...protocol,AppointInfoRequest:{},AppointInfoResponse:{},AllHeroRequest:{},AllHeroResponse:{}},options({player:f.player})),{code:'CANCELLED'});assert.equal(f.reads.includes('AllHeroRequest'),false);assert.equal(f.writes.length,0);});

test('production survey stops after a failed appointment read changes Session identity',async()=>{const f=productionClockFixture(),original=f.client.request;f.client.request=async(name,...args)=>{if(name==='AppointInfoRequest'){f.player.worldId=10;throw Error('synthetic appointment failure');}return original(name,...args);};await assert.rejects(productionModule.survey(f.client,{...protocol,AppointInfoRequest:{},AppointInfoResponse:{},AllHeroRequest:{},AllHeroResponse:{}},options({player:f.player})),{code:'CANCELLED'});assert.equal(f.reads.includes('AllHeroRequest'),false);assert.equal(f.writes.length,0);});

test('production view exposes complete inventory reliability without promoting absent or partial sources',async()=>{
 const f=fixture(),facts=await read(productionModule,f);assert.equal(productionModule.view(facts,options()).stockReliable,true);
 for(const change of [value=>{delete value.stockReliable;},value=>{value.stockReliable=false;},value=>{delete value.productionInventoryReliable;},value=>{value.productionInventoryReliable=false;}]){
  const partial={...facts};change(partial);assert.equal(productionModule.view(partial,options()).stockReliable,false);
 }
 assert.equal(f.writes.length,0);
});

function productionCollectionFixture(extra={}){
 const f=fixture(extra);f.player={playerId:'17',worldId:9,level:5};f.client.factContext={accountId:'A',generation:1,connectionId:'connection-A'};
 f.raw.building[1].factory.finishedProducts=[{id:'cloth',num:2}];
 f.raw.building.push(rawBuilding('2材料厂',1,{factory:{autoProductId:'',factoryQ:[],finishedProducts:[{id:'fuel',num:3}]}}));return f;
}
for(const apply of [true,false])test('prepared production collections reuse original independent inventory verification '+(apply?'success':'unknown'),async()=>{
 const f=productionCollectionFixture({apply}),args=options({player:f.player}),facts=await read(productionModule,f,{player:f.player}),view=productionModule.view(facts,args),targets=view.collectionPreparation.map(row=>row.parameters);
 assert.equal(targets.length,2);const prepared=prepareProductionStartWorkflow(facts,{config,moduleConfig:args.moduleConfig,action:'collect',targets,maxDurationMs:60000});assert.equal(f.writes.length,0);assert.deepEqual(prepared.budget,{resources:[],quotas:[],uids:[]});assert.equal(prepared.graph.nodes.filter(n=>n.type==='ACTION').length,2);
 for(const [i,parameters] of targets.entries()){
  const current=await read(productionModule,f,{player:f.player}),fresh=productionModule.view(current,{...args,parameters}),row=fresh.candidates[0];assert.equal(fresh.candidates.length,1);assert.equal(row.actionType,'gainFactory');
  const operation=productionModule.plan(current,{...args,parameters,selections:[row.actionId]}).actions[0];assert.deepEqual(operation.parameters,parameters);
  const result=await execute(productionModule,f,operation,{player:f.player,parameters});assert.equal(result.status,apply?'SUCCESS':'UNKNOWN');
  assert.equal(productionModule.verify(operation,result).confirmed,apply);if(!apply)break;
 }
 assert.equal(f.writes.length,apply?2:1);assert.ok(f.writes.every(row=>row.name==='GainFactoryProduceRequest'));
 if(apply){assert.equal(f.inventory.get('cloth'),2);assert.equal(f.inventory.get('fuel'),3);assert.equal(f.uncertain.size,0);}else assert.equal(f.uncertain.size,1);
});
test('prepared production collections bind selected factory queue and reject stale or mixed targets without writes',async()=>{
 const f=productionCollectionFixture(),args=options({player:f.player}),facts=await read(productionModule,f,{player:f.player}),targets=productionModule.view(facts,args).collectionPreparation.map(row=>row.parameters),payload={action:'collect',targets,maxDurationMs:60000};
 for(const bad of [{...payload,targets:[targets[0],targets[0]]},{...payload,action:'make'},{...payload,targets:[{...targets[0],productId:'cloth'}]},{...payload,targets:[{...targets[0],expectedCollectionHash:'unknown'}]},{targets,maxDurationMs:60000}])assert.throws(()=>validateProductionStartPreparation(bad));
 f.raw.building[1].factory.factoryQ.push({idx:0,productId:'cloth',finishTime:Math.floor(Date.now()/1000)+600});
 const current=await read(productionModule,f,{player:f.player});assert.throws(()=>prepareProductionStartWorkflow(current,{config,moduleConfig:args.moduleConfig,...payload}));
 assert.deepEqual(productionModule.view(current,{...args,parameters:targets[0]}).candidates,[]);assert.equal(f.writes.length,0);
});


function cityPreparationFixture(extra={}){const f=fixture(extra);f.player={playerId:'17',worldId:9,level:5};f.client.factContext={accountId:'A',generation:1,connectionId:'connection-A'};return f;}
for(const apply of [true,false])test('explicit city preparation reuses original sequential build upgrade and verification '+apply,async()=>{
 const f=cityPreparationFixture({apply}),args=options({player:f.player}),facts=await read(cityModule,f,{player:f.player}),view=cityModule.view(facts,args),targets=view.preparation.filter(row=>['build','upgrade'].includes(row.parameters.action)).map(row=>row.parameters);
 assert.equal(targets.length,2);const prepared=prepareCityWorkflow(facts,{config,moduleConfig:args.moduleConfig,targets,maxDurationMs:60000});assert.deepEqual(prepared.budget,{resources:[{id:'wood',num:3}],quotas:[],uids:[]});assert.equal(f.writes.length,0);
 for(const parameters of targets){const fresh=await read(cityModule,f,{player:f.player}),selected=cityModule.view(fresh,{...args,parameters}).candidates;assert.equal(selected.length,1);const op=cityModule.plan(fresh,{...args,parameters,selections:[selected[0].actionId]}).actions[0];const result=await execute(cityModule,f,op,{player:f.player,parameters});assert.equal(result.status,apply?'SUCCESS':'UNKNOWN');assert.equal(cityModule.verify(op,result).confirmed,apply);if(!apply)break;}
 assert.equal(f.writes.length,apply?2:1);if(apply){assert.equal(f.inventory.get('wood'),1);assert.deepEqual(f.raw.building.map(b=>b.level),[1,2]);}
});
test('explicit city preparation rejects duplicate stale and cumulatively unaffordable targets',async()=>{
 const f=cityPreparationFixture({stock:2}),args=options({player:f.player}),facts=await read(cityModule,f,{player:f.player}),targets=cityModule.view(facts,args).preparation.filter(row=>['build','upgrade'].includes(row.parameters.action)).map(row=>row.parameters),payload={targets,maxDurationMs:60000};assert.equal(targets.length,2);
 assert.throws(()=>prepareCityWorkflow(facts,{config,moduleConfig:args.moduleConfig,...payload}),/累计/);assert.throws(()=>validateCityPreparation({...payload,targets:[targets[0],targets[0]]}));assert.throws(()=>validateCityPreparation({...payload,targets:[{...targets[0],request:'AnyRequest'}]}));
 f.raw.building[0].level=1;const fresh=await read(cityModule,f,{player:f.player});assert.deepEqual(cityModule.view(fresh,{...args,parameters:targets[0]}).candidates,[]);assert.throws(()=>prepareCityWorkflow(fresh,{config,moduleConfig:args.moduleConfig,...payload}));assert.equal(f.writes.length,0);
});


test('explicit city preparation retains zero-cost finish and ordinary product settlement',async()=>{
 const f=cityPreparationFixture(),args=options({player:f.player});Object.assign(f.raw.building[0],{level:1,buildStartTime:1,buildFinishTime:2});f.raw.building.push(rawBuilding('2民居',1,{product:{asset:[{id:'cloth',num:2}]}}));
 const request=f.client.request.bind(f.client),send=f.client.sendWatch.bind(f.client);f.client.sendWatch=async(n,b,o)=>{if(n!=='FinishUpgradeBuildingRequest')return send(n,b,o);o?.beforeDispatch?.();f.writes.push({name:n,body:b});const row=f.raw.building.find(row=>row.buildingId===b.buildingId);row.level++;row.buildFinishTime=0;return {status:'UNKNOWN',sent:true};};
 f.client.request=async(n,b,r,t,o)=>{if(n!=='CollectBuildingProductRequest')return request(n,b,r,t,o);o?.beforeDispatch?.();f.writes.push({name:n,body:b});assert.deepEqual(b.buildingId,['2民居']);f.raw.building[2].product.asset=[];f.inventory.set('cloth',2);return {};};
 const facts=await read(cityModule,f,{player:f.player}),targets=cityModule.view(facts,args).preparation.filter(row=>['finishUpgrade','collectProduct'].includes(row.parameters.action)).map(row=>row.parameters);assert.equal(targets.length,2);const graph=prepareCityWorkflow(facts,{config,moduleConfig:args.moduleConfig,targets,maxDurationMs:60000});assert.deepEqual(graph.budget,{resources:[],quotas:[],uids:[]});
 for(const parameters of targets){const fresh=await read(cityModule,f,{player:f.player}),row=cityModule.view(fresh,{...args,parameters}).candidates;assert.equal(row.length,1);const op=cityModule.plan(fresh,{...args,parameters,selections:[row[0].actionId]}).actions[0],result=await execute(cityModule,f,op,{player:f.player,parameters});assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(cityModule.verify(op,result).confirmed,true);}assert.equal(f.writes.length,2);assert.equal(f.inventory.get('cloth'),2);
});


function explicitAccelerationFixture(module,apply=true){
 const f=module==='city'?cityPreparationFixture():productionCollectionFixture(),future=Math.floor(Date.now()/1000)+90;f.inventory.set('加速器',4);
 if(module==='city')for(const b of f.raw.building)Object.assign(b,{level:1,buildStartTime:future-200,buildFinishTime:future});else for(const b of f.raw.building.filter(b=>b.factory)){b.factory.finishedProducts=[];b.factory.factoryQ=[{idx:2,productId:'cloth',finishTime:future}];}
 f.client.sendWatch=async(n,b,o)=>{o?.beforeDispatch?.();f.writes.push({name:n,body:structuredClone(b)});assert.deepEqual(b.speedUp,{type:2,useNum:2});if(apply){f.inventory.set('加速器',f.inventory.get('加速器')-b.speedUp.useNum);const target=f.raw.building.find(row=>row.buildingId===b.buildingId);if(module==='city')target.buildFinishTime-=60;else target.factory.factoryQ.find(q=>q.idx===b.index).finishTime-=60;}return {status:'UNKNOWN',sent:true};};return f;
}
for(const module of ['city','production'])for(const apply of [true,false])test('explicit item acceleration composition '+module+' '+apply+' reuses original cost executor and verifier',async()=>{
 const adapter=module==='city'?cityModule:productionModule,f=explicitAccelerationFixture(module,apply),args=options({player:f.player}),facts=await read(adapter,f,{player:f.player}),view=adapter.view(facts,args),targets=(module==='city'?view.preparation.filter(row=>row.parameters.action==='speedUpUpgrade'):view.accelerationPreparation).map(row=>row.parameters);assert.equal(targets.length,2);
 const payload={...(module==='production'?{action:'speedUpProduce'}:{}),targets,maxDurationMs:60000},prepared=(module==='city'?prepareCityWorkflow:prepareProductionStartWorkflow)(facts,{config,moduleConfig:args.moduleConfig,...payload});assert.deepEqual(prepared.budget,{resources:[{id:'加速器',num:4}],quotas:[],uids:[]});assert.equal(f.writes.length,0);
 for(const parameters of targets){const fresh=await read(adapter,f,{player:f.player}),rows=adapter.view(fresh,{...args,parameters}).candidates;assert.equal(rows.length,1);const op=adapter.plan(fresh,{...args,parameters,selections:[rows[0].actionId]}).actions[0],result=await execute(adapter,f,op,{player:f.player,parameters});assert.equal(result.status,apply?'SUCCESS':'UNKNOWN',JSON.stringify(result));assert.equal(adapter.verify(op,result).confirmed,apply);if(!apply)break;}
 assert.equal(f.writes.length,apply?2:1);assert.equal(f.inventory.get('加速器'),apply?0:4);assert.ok(f.writes.every(row=>row.name===(module==='city'?'SpeedUpUpgradeBuildingRequest':'SpeedUpFactoryProduceRequest')));
});
for(const module of ['city','production'])test('explicit item acceleration '+module+' rejects stale exact cost duplicated target and cumulative shortfall',async()=>{
 const adapter=module==='city'?cityModule:productionModule,f=explicitAccelerationFixture(module),args=options({player:f.player});f.inventory.set('加速器',3);const facts=await read(adapter,f,{player:f.player}),view=adapter.view(facts,args),targets=(module==='city'?view.preparation.filter(row=>row.parameters.action==='speedUpUpgrade'):view.accelerationPreparation).map(row=>row.parameters),payload={...(module==='production'?{action:'speedUpProduce'}:{}),targets,maxDurationMs:60000},prepare=module==='city'?prepareCityWorkflow:prepareProductionStartWorkflow;assert.equal(targets.length,2);assert.throws(()=>prepare(facts,{config,moduleConfig:args.moduleConfig,...payload}),/累计/);
 assert.throws(()=>(module==='city'?validateCityPreparation:validateProductionStartPreparation)({...payload,targets:[targets[0],targets[0]]}));assert.throws(()=>adapter.validateParameters({...targets[0],speedUp:{type:1,useNum:1}}));
 if(module==='city')f.raw.building[0].buildFinishTime-=60;else f.raw.building[1].factory.factoryQ[0].finishTime-=60;const fresh=await read(adapter,f,{player:f.player});assert.deepEqual(adapter.view(fresh,{...args,parameters:targets[0]}).candidates,[]);assert.equal(f.writes.length,0);
});
