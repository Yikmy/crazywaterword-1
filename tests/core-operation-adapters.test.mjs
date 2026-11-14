import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CORE_OPERATION_MODULES, ordersModule, cityModule, productionModule, validateCoreOperationParameters } from '../src/core-operation-adapters.mjs';
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

test('core adapter candidates carry explicit empty parameters into the registered Loop contract without inferring a target',async()=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),{GAMEPLAY_MODULES}=await import('../src/function-registry.mjs');
 const f=fixture(),facts=await read(ordersModule,f);
 for(const [adapter,kind]of [[ordersModule,'SUBMIT'],[cityModule,'build'],[productionModule,'startProduce']]){
  const row=pick(adapter,facts,kind),target=structuredClone(row.target);assert.deepEqual(row.parameters,{});
  const graph=compileUnifiedExecution({entry:'loop',world:[{module:adapter.id,parameters:row.parameters,selection:{actionId:row.actionId}}],budget:{resources:[{id:'wood',num:4}],quotas:[],uids:[]}},{modules:GAMEPLAY_MODULES}).graph;
  const action=graph.nodes.find(node=>node.type==='ACTION');assert.deepEqual(action.parameters,{});assert.deepEqual(action.selection,{actionId:row.actionId});
  row.parameters.injected='not-shared';assert.deepEqual(pick(adapter,facts,kind).parameters,{});
  assert.deepEqual(row.target,target);
  const disabled=adapter.view(facts,options({moduleConfig:{enabled:false}})).candidates;
  assert.ok(disabled.length);assert.ok(disabled.every(candidate=>candidate.executable===false));
 }
 assert.equal(f.writes.length,0);
});
