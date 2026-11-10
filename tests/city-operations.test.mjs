import test from 'node:test';
import assert from 'node:assert/strict';
import { cityView, planCityOperations, executeCityAction, surveyCityOperations } from '../src/city-operations.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';
import { evaluateOrders } from '../src/order-rules.mjs';

const config = { tables: {
  BuildingCfg: { data: [{ buildingType: '民居' }, { buildingType: '材料厂' }] },
  BuildingUpgradeCfg: { data: ['民居', '材料厂'].flatMap((buildingType) => [
    { buildingType, level: 1, playerLevel: 1, curPeople: 0, consume: [], condition: [], effect: [['人口增加', 10]], costTime: 0 },
    { buildingType, level: 2, playerLevel: 1, curPeople: 0, consume: [['木材', 2]], condition: [], costTime: 30 },
  ]) },
  BuildingProduceCfg: { data: [
    { buildType: '材料厂', itemId: '布匹', produceTime: 20, unlockLevel: 1, costItem: [['木材', 2]] },
    { buildType: '材料厂', itemId: '燃料', produceTime: 40, unlockLevel: 1, costItem: [['木材', 1]] },
  ] },
  GameParamCfg: { data: [{ paramName: '初始人口上限', paramValue: 100 }, { paramName: '产品存量初始上限', paramValue: 50 }] },
  BuildingProduceParamCfg: { data: [{ paramName: '制造位上限', paramValue: 6 }] },
} };
const protocol = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets',
  'BuildBuilding', 'UpgradeBuilding', 'FinishUpgradeBuilding', 'CollectBuildingProduct', 'GainFactoryProduce',
  'StartFactoryProduce', 'SpeedUpUpgradeBuilding', 'SpeedUpFactoryProduce']
  .flatMap((name) => [[name + 'Request', {}], [name + 'Response', {}]]));
const rawBuilding = (buildingId = '1民居', extra = {}) => ({ buildingId, level: 1, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] }, ...extra });
const rawFactory = (extra = {}) => rawBuilding('1材料厂', { factory: { autoProductId: '', factoryQ: [], finishedProducts: [] }, ...extra });
function fake(buildings = [rawBuilding()], stock = new Map([['木材', 4], ['加速器', 3]]), hooks = {}) {
  const client = { connected: true, buildings: structuredClone(buildings), stock: new Map(stock), reads: [], writes: [], confirmations: [], pending: [],
    async request(name, body, response, timeout, options) {
      if (options?.mutate) { this.writes.push({ name, body }); await hooks.write?.(name, body, this); return {}; }
      this.reads.push(name);
      if (hooks.read) { const result = await hooks.read(name, this); if (result !== undefined) return result; }
      if (name === 'OnWaterRequest') return { building: structuredClone(this.buildings), workerOrder: [], orderOfTheDay: { orderNum: 0 } };
      if (name === 'AllItemRequest') return { items: [...this.stock].map(([itemId, num]) => ({ itemId, num })) };
      if (name === 'AllResourceRequest') return { list: [] };
      return {};
    },
    async sendWatch(name, body) { this.writes.push({ name, body }); await hooks.write?.(name, body, this); return { status: 'UNKNOWN' }; },
    confirmWatchedWrite(name, body) { this.confirmations.push({ name, body }); },
    markUnverifiedWrite(name, body) { this.pending.push({ name, body }); },
  };
  return client;
}
const read = (client, options = {}) => surveyCityOperations(client, protocol, { config, player: { level: 5 }, ...options });
const select = async (client, actionType, options = {}) => cityView(await read(client), { config }).candidates.find((c) => c.actionType === actionType && (!options.productId || c.target.productId === options.productId));
const execute = (client, planned, options = {}) => executeCityAction(client, protocol, planned, { config, player: { level: 5 }, allowMutate: true, ...options });


test('city view reuses one existing survey and exposes building, recipe, queue and resource facts', async () => {
  const now = Math.floor(Date.now() / 1000);
  const client = fake([rawBuilding(), rawFactory({ factory: { autoProductId: '', factoryQ: [{ idx: 0, productId: '布匹', finishTime: now + 120 }], finishedProducts: [{ id: '燃料', num: 1 }] } })]);
  const state = await read(client), view = cityView(state, { config });
  assert.deepEqual(client.reads, ['OnWaterRequest', 'AllItemRequest', 'AllResourceRequest', 'MyResFieldsRequest', 'MyFleetsRequest']);
  assert.equal(view.buildings[0].level, 1); assert.equal(view.buildings[0].status, 'READY');
  assert.deepEqual(view.buildings[0].materialCosts, [{ id: '木材', num: 2 }]);
  assert.equal(view.factories[0].queue[0].remainingSeconds > 0, true);
  assert.equal(view.factories[0].recipes.length, 2);
  assert.equal(view.factories[0].slotCapacity, 6); assert.equal(view.factories[0].freeSlots, 5);
  assert.equal(view.candidates.some((c) => c.actionType === 'gainFactory'), true);
  assert.equal(view.candidates.some((c) => c.actionType === 'speedUpProduce'), true);
  const missingConfig = structuredClone(config); missingConfig.tables.BuildingProduceParamCfg.data = [];
  const unknownView = cityView({ ...state, factorySlots: 0 }, { config: missingConfig });
  assert.equal(unknownView.factories[0].slotCapacity, null); assert.equal(unknownView.factories[0].freeSlots, null);
  assert.equal(client.writes.length, 0);
});

test('candidate selections compose multiple buildings over one atomic material ledger', async () => {
  const state = await read(fake([rawBuilding(), rawBuilding('2民居')], new Map([['木材', 2]])));
  const selected = cityView(state, { config }).candidates.filter((c) => c.actionType === 'upgrade').map((c) => c.actionId);
  assert.equal(selected.length, 2);
  const ledger = new ResourceLedger(state.stock), result = planCityOperations(state, { config, selections: selected, ledger });
  assert.equal(result.actions.length, 1); assert.deepEqual(result.reserved, [['木材', 2]]);
  assert.equal(ledger.available('木材'), 0); assert.equal(state.stock.get('木材'), 2);
});

test('orders, buildings and recipes share the same reservation instance', async () => {
  const state = await read(fake([rawBuilding(), rawFactory()], new Map([['木材', 3]])));
  const ledger = new ResourceLedger(state.stock);
  const orders = [{ index: 0, requirements: [{ id: '木材', num: 2 }], rewardExp: 10 }];
  assert.equal(evaluateOrders(orders, state.stock, { version: 1, enabled: true, rules: [] }, { ledger })[0].decision, 'RECOMMEND_SUBMIT');
  const candidates = cityView(state, { config }).candidates;
  const city = planCityOperations(state, { config, ledger, selections: [candidates.find((c) => c.actionType === 'upgrade' && c.target.buildingId === '1民居').actionId,
    candidates.find((c) => c.actionType === 'startProduce' && c.target.productId === '燃料').actionId] });
  assert.deepEqual(city.actions.map((c) => c.actionType), ['startProduce']);
  assert.equal(ledger.available('木材'), 0);
});

test('selection accepts only unique server candidate IDs and one action per building', async () => {
  const state = await read(fake([rawFactory()])), candidates = cityView(state, { config }).candidates;
  assert.throws(() => planCityOperations(state, { config, selections: [{ request: 'anything' }] }), /actionId/);
  assert.throws(() => planCityOperations(state, { config, selections: ['unknown'] }), /候选/);
  assert.throws(() => planCityOperations(state, { config, selections: [candidates[0].actionId, candidates[0].actionId] }), /重复/);
  assert.throws(() => planCityOperations(state, { config, selections: candidates.slice(0, 2).map((c) => c.actionId) }), /同一建筑/);
});

test('raw missing state, ambiguous identities, queue fields or unknown costs never authorize writes', async () => {
  for (const buildings of [[{ buildingId: '1民居' }], [rawBuilding(), rawBuilding()],
    [rawFactory({ factory: { autoProductId: '', finishedProducts: [] } })]]) {
    const view = cityView(await read(fake(buildings)), { config });
    if (buildings[0].factory) assert.equal(view.candidates.some((c) => ['startProduce', 'gainFactory', 'speedUpProduce'].includes(c.actionType)), false);
    else assert.equal(view.candidates.length, 0);
  }
  const unknown = structuredClone(config); unknown.tables.BuildingUpgradeCfg.data.forEach((r) => { delete r.consume; });
  assert.equal(cityView(await read(fake()), { config: unknown }).candidates.some((c) => c.actionType === 'upgrade'), false);
});

for (const actionType of ['build', 'upgrade']) test(`${actionType} quiet write succeeds only after authoritative construction change`, async () => {
  const client = fake([rawBuilding('1民居', { level: actionType === 'build' ? 0 : 1 })], undefined, {
    write(name, body, c) { c.buildings[0].level++; },
  });
  const planned = await select(client, actionType), stages = [];
  const result = await execute(client, planned, { onStage: (stage) => stages.push(stage) });
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.requestStatus, 'UNKNOWN');
  assert.equal(client.writes.length, 1); assert.equal(client.confirmations.length, 1);
  assert.equal(result.afterState.level, result.beforeState.level + 1);
  assert.deepEqual(stages, ['SURVEY', 'RESOURCE_PREFLIGHT', 'EXECUTING', 'VERIFY']);
});

test('construction that remains in progress verifies using new authoritative timestamps', async () => {
  const client = fake(undefined, undefined, { write(name, body, c) {
    c.buildings[0].buildStartTime = Math.floor(Date.now() / 1000); c.buildings[0].buildFinishTime = c.buildings[0].buildStartTime + 120;
  } });
  assert.equal((await execute(client, await select(client, 'upgrade'))).status, 'SUCCESS');
});

for (const immediate of [false, true]) test(`production start verifies ${immediate ? 'immediate output' : 'the new queue job'}`, async () => {
  const client = fake([rawFactory()], undefined, { write(name, body, c) {
    if (immediate) c.buildings[0].factory.finishedProducts.push({ id: body.productId, num: 1 });
    else c.buildings[0].factory.factoryQ.push({ idx: 0, productId: body.productId, finishTime: Math.floor(Date.now() / 1000) + 30 });
  } });
  const result = await execute(client, await select(client, 'startProduce', { productId: '布匹' }));
  assert.equal(result.status, 'SUCCESS'); assert.equal(client.writes[0].name, 'StartFactoryProduceRequest');
  assert.deepEqual(result.resourceReservation, [{ id: '木材', num: 2 }]);
});

for (const kind of ['gainFactory', 'collectProduct']) test(`${kind} typed response requires both removed output and reliable inventory increase`, async () => {
  for (const increased of [false, true]) {
    const building = kind === 'gainFactory' ? rawFactory({ factory: { autoProductId: '', factoryQ: [], finishedProducts: [{ id: '布匹', num: 1 }] } })
      : rawBuilding('1民居', { product: { asset: [{ id: '布匹', num: 1 }] } });
    const client = fake([building], undefined, { write(name, body, c) {
      if (kind === 'gainFactory') c.buildings[0].factory.finishedProducts = [];
      else c.buildings[0].product.asset = [];
      if (increased) c.stock.set('布匹', 1);
    } });
    const result = await execute(client, await select(client, kind));
    assert.equal(result.status, increased ? 'SUCCESS' : 'UNKNOWN');
    assert.equal(result.requestStatus, 'SUCCESS'); assert.equal(client.confirmations.length, increased ? 1 : 0);
    assert.equal(client.pending.length, increased ? 0 : 1);
    assert.equal(result.verification.status, increased ? 'CONFIRMED' : 'UNCONFIRMED');
    if (increased) { assert.deepEqual(result.collectedProducts, [{ id: '布匹', num: 1 }]); assert.equal(result.afterInventoryReliable, true); }
  }
});

test('finish construction verifies the level transition rather than elapsed wall clock', async () => {
  const client = fake([rawBuilding('1民居', { buildStartTime: 1, buildFinishTime: 2 })], undefined, { write(name, body, c) {
    c.buildings[0].level++; c.buildings[0].buildFinishTime = 0;
  } });
  assert.equal((await execute(client, await select(client, 'finishUpgrade'))).status, 'SUCCESS');
});

for (const kind of ['speedUpUpgrade', 'speedUpProduce']) test(`${kind} uses only exact accelerator cost and reduced authoritative completion time`, async () => {
  const future = Math.floor(Date.now() / 1000) + 121;
  const building = kind === 'speedUpUpgrade' ? rawBuilding('1民居', { buildStartTime: future - 200, buildFinishTime: future })
    : rawFactory({ factory: { autoProductId: '', factoryQ: [{ idx: 2, productId: '布匹', finishTime: future }], finishedProducts: [] } });
  const client = fake([building], undefined, { write(name, body, c) {
    if (kind === 'speedUpUpgrade') c.buildings[0].buildFinishTime -= 60;
    else c.buildings[0].factory.factoryQ[0].finishTime -= 60;
  } });
  const planned = await select(client, kind);
  assert.deepEqual(planned.costs, [{ id: '加速器', num: 3 }]);
  assert.deepEqual(planned.action.body.speedUp, { type: 2, useNum: 3 });
  assert.equal((await execute(client, planned)).status, 'SUCCESS');
});

test('resource drop, stale target state and tampered requests are rejected before dispatch', async () => {
  for (const change of [(c) => c.stock.set('木材', 1), (c) => { c.buildings[0].level = 2; },
    (c, planned) => { planned.action.request = 'AnythingRequest'; }, (c, planned) => { planned.costs = []; }]) {
    const client = fake(), planned = await select(client, 'upgrade'); change(client, planned);
    const result = await execute(client, planned);
    assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
  }
});

test('production rejects a queue identity change even when the recipe still fits', async () => {
  const client = fake([rawFactory()]), planned = await select(client, 'startProduce');
  client.buildings[0].factory.factoryQ.push({ idx: 3, productId: '燃料', finishTime: Math.floor(Date.now() / 1000) + 100 });
  assert.equal((await execute(client, planned)).status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
});

test('unchanged authoritative state is UNKNOWN and its budget cannot be reused from stale replies', async () => {
  const client = fake([rawBuilding(), rawBuilding('2民居')], new Map([['木材', 2]]));
  const view = cityView(await read(client), { config }), upgrades = view.candidates.filter((c) => c.actionType === 'upgrade');
  const budget = { ledger: null };
  assert.equal((await execute(client, upgrades[0], { budget })).status, 'UNKNOWN');
  assert.equal(budget.ledger.available('木材'), 0); assert.equal(client.confirmations.length, 0);
  assert.equal((await execute(client, upgrades[1], { budget })).status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 1);
});

test('postwrite unreadable state is UNKNOWN and never clears the pending fingerprint', async () => {
  const client = fake(undefined, undefined, { write(name, body, c) { c.buildings[0].level++; delete c.buildings[0].buildFinishTime; } });
  const result = await execute(client, await select(client, 'upgrade'));
  assert.equal(result.status, 'UNKNOWN'); assert.equal(client.confirmations.length, 0);
});

for (const code of ['UNKNOWN', 'RATE_LIMITED', 'REJECTED']) test(`write ${code} stops immediately without a postwrite read or retry`, async () => {
  const client = fake(undefined, undefined, { write() { throw Object.assign(new Error(code === 'UNKNOWN' ? 'request timed out' : code), { code }); } });
  const planned = await select(client, 'upgrade'); client.reads = [];
  const result = await execute(client, planned);
  assert.equal(result.status, code); assert.equal(client.writes.length, 1);
  assert.equal(client.reads.filter((name) => name === 'OnWaterRequest').length, 1);
});

test('explicit mutation permission and active generation are required before any write', async () => {
  const client = fake(), planned = await select(client, 'upgrade'); client.reads = [];
  assert.equal((await execute(client, planned, { allowMutate: false })).status, 'NOT_EXECUTED');
  assert.equal(client.reads.length, 0);
  assert.equal((await execute(client, planned, { assertCurrent() { throw Object.assign(new Error('generation changed'), { code: 'CANCELLED' }); } })).status, 'CANCELLED');
  assert.equal(client.writes.length, 0);
});

test('cancellation while re-surveying sends no write and cancels promptly', async () => {
  const abort = new AbortController(), client = fake(), planned = await select(client, 'upgrade');
  client.request = () => { abort.abort(); return new Promise(() => {}); };
  assert.equal((await execute(client, planned, { signal: abort.signal })).status, 'CANCELLED'); assert.equal(client.writes.length, 0);
});

test('stop after dispatched write retains uncertainty and sends no verification query', async () => {
  const abort = new AbortController(), client = fake(undefined, undefined, { write() { abort.abort(); } });
  const planned = await select(client, 'upgrade'); client.reads = [];
  assert.equal((await execute(client, planned, { signal: abort.signal })).status, 'UNKNOWN');
  assert.equal(client.pending.length, 1);
  assert.equal(client.writes.length, 1); assert.equal(client.reads.filter((name) => name === 'OnWaterRequest').length, 1);
});

test('diamonds, unknown production costs and missing inventory never gain a paid or free candidate', async () => {
  const paid = structuredClone(config); paid.tables.BuildingUpgradeCfg.data.forEach((r) => { r.consume = [['RUBY', 1]]; });
  const state = await read(fake([rawBuilding()], new Map([['RUBY', 100]])));
  assert.equal(cityView(state, { config: paid }).candidates.length, 0);
  const unknown = structuredClone(config); unknown.tables.BuildingProduceCfg.data.forEach((r) => { delete r.costItem; });
  assert.equal(cityView(await read(fake([rawFactory()])), { config: unknown }).candidates.some((c) => c.actionType === 'startProduce'), false);
  const broken = fake(undefined, undefined, { read(name) { if (name === 'AllItemRequest') return {}; } });
  assert.equal(cityView(await read(broken), { config }).candidates.some((c) => c.actionType === 'upgrade'), false);
});

test('generation replacement during the first survey reply blocks further survey requests', async () => {
  let changed = false;
  const client = fake(), planned = await select(client, 'upgrade'), request = client.request.bind(client);
  client.reads = [];
  client.request = async (...args) => { const result = await request(...args); if (args[0] === 'OnWaterRequest') changed = true; return result; };
  const result = await execute(client, planned, { assertCurrent() { if (changed) throw Object.assign(new Error('generation changed'), { code: 'CANCELLED' }); } });
  assert.equal(result.status, 'CANCELLED'); assert.deepEqual(client.reads, ['OnWaterRequest']); assert.equal(client.writes.length, 0);
});


for (const changed of ['orders', 'other-factory']) test(`Automatic production rechecks fresh ${changed} before dispatch`, async () => {
  const second = { ...rawFactory(), buildingId: '2材料厂' }, client = fake([rawFactory(), second]);
  const planned = await select(client, 'startProduce', { productId: '布匹' });
  if (changed === 'other-factory') client.buildings[1].factory.factoryQ.push({ idx: 0, productId: '布匹', finishTime: Math.floor(Date.now() / 1000) + 60 });
  const survey = async (current, wire, options) => ({ ...await surveyCityOperations(current, wire, options),
    orderReliability: { orders: true }, orders: changed === 'orders' ? [] : [{ requirements: [{ id: '布匹', num: 1 }] }] });
  const result = await execute(client, planned, { mode: 'Automatic', productionPolicy: { version: 1, enabled: true, onlyShortages: true, productIds: ['布匹'], maxOperations: 10 }, survey });
  assert.equal(result.status, 'NOT_EXECUTED'); assert.match(result.error, /策略范围/); assert.equal(client.writes.length, 0);
});


test('authorization revoked after dispatch remains UNKNOWN with retained fingerprint and budget', async () => {
  let revoked = false;
  const client = fake(undefined, undefined, { write() { revoked = true; } }), planned = await select(client, 'upgrade');
  const budget = { ledger: null };
  const result = await execute(client, planned, { budget, assertCurrent() {
    if (revoked) throw Object.assign(new Error('production policy changed'), { code: 'NOT_EXECUTED' });
  } });
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.unresolvedWrite, true); assert.equal(result.dispatched, true);
  assert.equal(result.verification.status, 'UNCONFIRMED'); assert.equal(client.pending.length, 1); assert.equal(client.confirmations.length, 0);
  assert.deepEqual(result.resourceReservation, [{ id: '木材', num: 2 }]); assert.equal(budget.ledger.available('木材'), 2);
});
