import { assertPaymentAllowed } from '../src/actions.mjs';
import { factoryAutoProduceEntitled } from '../src/city-operations.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cityView, planCityOperations, executeCityAction, surveyCityOperations } from '../src/city-operations.mjs';
import { planWorld } from '../src/world.mjs';
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
  'StartFactoryProduce', 'SpeedUpUpgradeBuilding', 'SpeedUpFactoryProduce', 'CancelFactoryAutoProduce']
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
    write(name, body, c) { c.buildings[0].level++; if (actionType === 'upgrade') c.stock.set('木材', c.stock.get('木材') - 2); },
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
    c.stock.set('木材', c.stock.get('木材') - 2);
    c.buildings[0].buildStartTime = Math.floor(Date.now() / 1000); c.buildings[0].buildFinishTime = c.buildings[0].buildStartTime + 120;
  } });
  assert.equal((await execute(client, await select(client, 'upgrade'))).status, 'SUCCESS');
});

for (const immediate of [false, true]) test(`production start verifies ${immediate ? 'immediate output' : 'the new queue job'}`, async () => {
  const client = fake([rawFactory()], undefined, { write(name, body, c) {
    c.stock.set('木材', c.stock.get('木材') - 2);
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
    c.stock.set('加速器', c.stock.get('加速器') - body.speedUp.useNum);
    if (kind === 'speedUpUpgrade') c.buildings[0].buildFinishTime -= 60;
    else c.buildings[0].factory.factoryQ[0].finishTime -= 60;
  } });
  const planned = await select(client, kind);
  assert.deepEqual(planned.costs, [{ id: '加速器', num: 3 }]);
  assert.deepEqual(planned.action.body.speedUp, { type: 2, useNum: 3 });
  const result = await execute(client, planned);
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(result.resourceReservation, planned.costs);
  assert.equal(result.beforeInventory.find(row => row.id === '加速器').num - result.afterInventory.find(row => row.id === '加速器').num, 3);
  assert.equal(result.beforeInventoryReliable, true); assert.equal(result.afterInventoryReliable, true);
});

test('world collection plan preserves the exact response ID list and does not write', async () => {
  const ids = [' one,民居 ', 'two民居', ' 三民居 '];
  const client = fake(ids.map(id => rawBuilding(id, { product: { asset: [{ id: '布匹', num: 1 }] } })));
  const state = await read(client);
  const plan = planWorld(state, { config, maxBuilds: 0, maxUpgrades: 0 });
  const collect = plan.actions.find(action => action.kind === 'collectProduct');
  assert.equal(collect.request, 'CollectBuildingProductRequest');
  assert.equal(collect.response, 'CollectBuildingProductResponse');
  assert.deepEqual(collect.body, { buildingId: ids });
  assert.deepEqual(plan.reserved, []); assert.deepEqual(client.writes, []);
});

for (const kind of ['speedUpUpgrade', 'speedUpProduce']) test(
  kind + ' overflow is skipped before reservation and preserves independent accelerator plans', async () => {
    const now = 1000, overflow = now + 2147483648 * 60;
    const invalid = kind === 'speedUpUpgrade'
      ? rawBuilding('1民居', { buildStartTime: 1, buildFinishTime: overflow })
      : rawFactory({ factory: { autoProductId: '', factoryQ: [
        { idx: 0, productId: '布匹', finishTime: overflow },
        { idx: 1, productId: '布匹', finishTime: now + 120 },
      ], finishedProducts: [] } });
    const buildings = kind === 'speedUpUpgrade' ? [invalid, rawFactory({ factory: {
      autoProductId: '', factoryQ: [{ idx: 1, productId: '布匹', finishTime: now + 120 }], finishedProducts: [],
    } })] : [invalid];
    const client = fake(buildings, new Map([['加速器', 2147483648]]));
    const state = { ...await read(client), now }, ledger = new ResourceLedger(state.stock);
    const plan = planWorld(state, { config, ledger, allowSpeedUp: true, maxBuilds: 0, maxUpgrades: 0 });
    assert.deepEqual(plan.actions.map(action => action.kind), ['speedUpProduce']);
    const action = plan.actions[0];
    assert.equal(action.request, 'SpeedUpFactoryProduceRequest'); assert.equal(action.response, null);
    assert.deepEqual(action.body, { buildingId: '1材料厂', index: 1, speedUp: { type: 2, useNum: 2 } });
    assert.deepEqual(action.costs, [{ id: '加速器', num: 2 }]);
    assert.deepEqual(plan.reserved, [['加速器', 2]]); assert.equal(ledger.available('加速器'), 2147483646);
    assert.equal(plan.notes.some(note => note.includes('参数超出协议范围')), true);
    assert.deepEqual(client.writes, []);
    const onlyInvalid = { ...state, buildings: [state.buildings[0]], factories: kind === 'speedUpProduce'
      ? [{ ...state.factories[0], factory: { ...state.factories[0].factory, factoryQ: state.factories[0].factory.factoryQ.slice(0, 1) } }] : [] };
    const rejected = planWorld(onlyInvalid, { config, allowSpeedUp: true, maxBuilds: 0, maxUpgrades: 0 });
    assert.deepEqual(rejected.actions, []); assert.deepEqual(rejected.reserved, []);
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

for (const immediate of [false,true]) for (const fault of ['no-debit','under-debit','over-debit','wrong-material','incoming','new-item','ruby','missing-items','missing-num','duplicate-item','missing-resources','wrong-product','two-results','old-queue','old-finished','level','auto']) test('production exact settlement '+(immediate?'immediate':'queue')+' rejects '+fault,async()=>{
 const oldJob={idx:7,productId:'燃料',finishTime:Math.floor(Date.now()/1000)+10000};
 const client=fake([rawFactory({factory:{autoProductId:'',factoryQ:[oldJob],finishedProducts:[{id:'燃料',num:3}]}})],undefined,{
  write(_name,body,c){
   c.stock.set('木材',c.stock.get('木材')-2);const factory=c.buildings[0].factory;
   if(immediate)factory.finishedProducts.push({id:body.productId,num:1});else factory.factoryQ.push({idx:8,productId:body.productId,finishTime:Math.floor(Date.now()/1000)+30});
   if(fault==='no-debit')c.stock.set('木材',4);if(fault==='under-debit')c.stock.set('木材',3);if(fault==='over-debit')c.stock.set('木材',1);
   if(fault==='wrong-material'){c.stock.set('木材',4);c.stock.set('加速器',1);}if(fault==='incoming')c.stock.set('加速器',4);if(fault==='new-item')c.stock.set('unexpected',1);
   const result=immediate?factory.finishedProducts.at(-1):factory.factoryQ.at(-1);
   if(fault==='wrong-product'){if(immediate)result.id='错误产品';else result.productId='错误产品';}
   if(fault==='two-results'){if(immediate)result.num=2;else factory.factoryQ.push({idx:9,productId:body.productId,finishTime:Math.floor(Date.now()/1000)+60});}
   if(fault==='old-queue')factory.factoryQ[0].finishTime++;if(fault==='old-finished')factory.finishedProducts[0].num++;
   if(fault==='level')c.buildings[0].level++;if(fault==='auto')factory.autoProductId='燃料';
  },
  read(name,c){if(name==='AllResourceRequest'&&fault==='ruby')return {list:[{res:4,amount:c.writes.length?49:50}]};if(!c.writes.length)return;
   if(name==='AllItemRequest'&&['missing-items','missing-num','duplicate-item'].includes(fault)){if(fault==='missing-items')return {};const items=[...c.stock].map(([itemId,num])=>({itemId,num}));if(fault==='missing-num')delete items[0].num;else items.push({...items[0]});return {items};}
   if(name==='AllResourceRequest'&&fault==='missing-resources')return {};
  }
 });
 const planned=await select(client,'startProduce',{productId:'布匹'}),budget={ledger:null},result=await execute(client,planned,{budget});
 assert.equal(result.status,'UNKNOWN',JSON.stringify(result));assert.equal(result.dispatched,true);assert.equal(result.unresolvedWrite,true);assert.equal(result.verification.status,'UNCONFIRMED');assert.equal(client.writes.length,1);assert.equal(client.confirmations.length,0);assert.equal(client.pending.length,1);assert.equal(budget.ledger.available('木材'),2);
 if(fault==='new-item'){assert.deepEqual(result.beforeInventory.find(r=>r.id==='unexpected'),{id:'unexpected',num:0});assert.deepEqual(result.afterInventory.find(r=>r.id==='unexpected'),{id:'unexpected',num:1});}
});
for(const immediate of [false,true])test('production exact settlement preserves existing queue and finished balances '+immediate,async()=>{
 const original={autoProductId:'',factoryQ:[{idx:7,productId:'燃料',finishTime:Math.floor(Date.now()/1000)+10000}],finishedProducts:[{id:'燃料',num:3}]};
 const client=fake([rawFactory({factory:original})],undefined,{write(_name,body,c){c.stock.set('木材',c.stock.get('木材')-2);if(immediate)c.buildings[0].factory.finishedProducts.push({id:body.productId,num:1});else c.buildings[0].factory.factoryQ.push({idx:8,productId:body.productId,finishTime:Math.floor(Date.now()/1000)+30});}});
 const result=await execute(client,await select(client,'startProduce',{productId:'布匹'}));assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(client.confirmations.length,1);assert.equal(result.beforeInventory.find(r=>r.id==='木材').num-result.afterInventory.find(r=>r.id==='木材').num,2);assert.deepEqual(result.afterState.factory.factoryQ[0],original.factoryQ[0]);assert.deepEqual(result.afterState.factory.finishedProducts[0],original.finishedProducts[0]);
});
for(const fault of ['duplicate-item','missing-item-id','missing-num','resource-collision','duplicate-resource','missing-amount'])test('production exact inventory '+fault+' cannot create a start candidate',async()=>{
 const client=fake([rawFactory()],undefined,{read(name){if(name==='AllItemRequest'){if(fault==='duplicate-item')return {items:[{itemId:'木材',num:2},{itemId:'木材',num:2}]};if(fault==='missing-item-id')return {items:[{num:4}]};if(fault==='missing-num')return {items:[{itemId:'木材'}]};if(fault==='resource-collision')return {items:[{itemId:'木材',num:4},{itemId:'GOLD',num:2}]};}if(name==='AllResourceRequest'){if(fault==='resource-collision')return {list:[{res:3,amount:2}]};if(fault==='duplicate-resource')return {list:[{res:3,amount:2},{res:3,amount:2}]};if(fault==='missing-amount')return {list:[{res:3}]};}}});
 assert.equal(cityView(await read(client),{config}).candidates.some(row=>row.actionType==='startProduce'),false);assert.equal(client.writes.length,0);
});
for(const debit of [0,2,3,4])test('production exact mixed recipe confirms only full ordinary item and GOLD debits '+debit,async()=>{
 const cfg=structuredClone(config);cfg.tables.BuildingProduceCfg.data[0].costItem=[['木材',2],['GOLD',3]];let gold=50;
 const client=fake([rawFactory()],undefined,{read(name){if(name==='AllResourceRequest')return {list:[{res:3,amount:gold}]};},write(_name,body,c){c.stock.set('木材',c.stock.get('木材')-2);gold-=debit;c.buildings[0].factory.factoryQ.push({idx:0,productId:body.productId,finishTime:Math.floor(Date.now()/1000)+30});}});
 const facts=await read(client,{config:cfg}),candidate=cityView(facts,{config:cfg}).candidates.find(row=>row.actionType==='startProduce'&&row.target.productId==='布匹');assert.deepEqual(candidate.costs,[{id:'木材',num:2},{id:'GOLD',num:3}]);
 const result=await execute(client,candidate,{config:cfg});assert.equal(result.status,debit===3?'SUCCESS':'UNKNOWN');assert.equal(result.unresolvedWrite,debit!==3);assert.equal(client.confirmations.length,debit===3?1:0);assert.equal(client.writes.length,1);
});
for (const kind of ['speedUpUpgrade', 'speedUpProduce']) for (const fault of [
  'no-debit', 'under-debit', 'over-debit', 'incoming', 'new-item', 'ruby',
  'missing-items', 'missing-num', 'duplicate-item', 'missing-resources',
]) test('accelerator settlement ' + kind + ' rejects ' + fault, async () => {
  const future = Math.floor(Date.now() / 1000) + 175;
  const building = kind === 'speedUpUpgrade' ? rawBuilding('1民居', { buildStartTime: future - 200, buildFinishTime: future })
    : rawFactory({ factory: { autoProductId: '', factoryQ: [{ idx: 2, productId: '布匹', finishTime: future }], finishedProducts: [] } });
  const client = fake([building], new Map([['木材', 4], ['加速器', 6]]), {
    write(_name, body, c) {
      c.stock.set('加速器', 6 - body.speedUp.useNum);
      if (kind === 'speedUpUpgrade') c.buildings[0].buildFinishTime -= 60;
      else c.buildings[0].factory.factoryQ[0].finishTime -= 60;
      if (fault === 'no-debit') c.stock.set('加速器', 6);
      if (fault === 'under-debit') c.stock.set('加速器', 7 - body.speedUp.useNum);
      if (fault === 'over-debit') c.stock.set('加速器', 5 - body.speedUp.useNum);
      if (fault === 'incoming') c.stock.set('木材', 5);
      if (fault === 'new-item') c.stock.set('unexpected', 1);
    },
    read(name, c) {
      if (name === 'AllResourceRequest' && fault === 'ruby') return { list: [{ res: 4, amount: c.writes.length ? 49 : 50 }] };
      if (!c.writes.length) return;
      if (name === 'AllItemRequest' && ['missing-items', 'missing-num', 'duplicate-item'].includes(fault)) {
        if (fault === 'missing-items') return {};
        const items = [...c.stock].map(([itemId, num]) => ({ itemId, num }));
        if (fault === 'missing-num') delete items[0].num; else items.push({ ...items[0] });
        return { items };
      }
      if (name === 'AllResourceRequest' && fault === 'missing-resources') return {};
    },
  });
  const planned = await select(client, kind), budget = { ledger: null }, result = await execute(client, planned, { budget });
  assert.equal(result.status, 'UNKNOWN', JSON.stringify(result)); assert.equal(result.unresolvedWrite, true);
  assert.equal(result.verification.status, 'UNCONFIRMED'); assert.equal(client.writes.length, 1);
  assert.equal(client.confirmations.length, 0); assert.equal(client.pending.length, 1);
  assert.deepEqual(result.resourceReservation, planned.costs); assert.equal(budget.ledger.available('加速器'), 6 - planned.costs[0].num);
});

for (const kind of ['speedUpUpgrade', 'speedUpProduce']) for (const fault of ['duplicate-item', 'missing-num', 'resource-collision'])
  test('accelerator qualification ' + kind + ' rejects incomplete inventory ' + fault, async () => {
    const future = Math.floor(Date.now() / 1000) + 175;
    const building = kind === 'speedUpUpgrade' ? rawBuilding('1民居', { buildStartTime: 1, buildFinishTime: future })
      : rawFactory({ factory: { autoProductId: '', factoryQ: [{ idx: 0, productId: '布匹', finishTime: future }], finishedProducts: [] } });
    const client = fake([building], undefined, { read(name) {
      if (name === 'AllItemRequest') {
        if (fault === 'duplicate-item') return { items: [{ itemId: '加速器', num: 3 }, { itemId: '加速器', num: 3 }] };
        if (fault === 'missing-num') return { items: [{ itemId: '加速器', num: 3 }, { itemId: '木材' }] };
        return { items: [{ itemId: '加速器', num: 3 }, { itemId: 'GOLD', num: 1 }] };
      }
      if (name === 'AllResourceRequest' && fault === 'resource-collision') return { list: [{ res: 3, amount: 1 }] };
    } });
    const view = cityView(await read(client), { config });
    assert.equal(view.candidates.some(row => row.actionType === kind), false); assert.deepEqual(client.writes, []);
  });

for (const kind of ['gainFactory', 'collectProduct']) for (const fault of [
  'under-credit', 'over-credit', 'unrelated-debit', 'unexpected-item', 'missing-num', 'duplicate-item', 'ruby', 'missing-resources',
]) test('collection exact settlement ' + kind + ' rejects ' + fault, async () => {
  const assets = [{ id: '布匹', num: 3 }];
  const building = kind === 'gainFactory' ? rawFactory({ factory: { autoProductId: '', factoryQ: [], finishedProducts: assets } })
    : rawBuilding('1民居', { product: { asset: assets } });
  const client = fake([building], undefined, {
    write(_name, _body, c) {
      if (kind === 'gainFactory') c.buildings[0].factory.finishedProducts = []; else c.buildings[0].product.asset = [];
      c.stock.set('布匹', fault === 'under-credit' ? 1 : fault === 'over-credit' ? 4 : 3);
      if (fault === 'unrelated-debit') c.stock.set('木材', 3);
      if (fault === 'unexpected-item') c.stock.set('unexpected', 1);
    },
    read(name, c) {
      if (name === 'AllResourceRequest' && fault === 'ruby') return { list: [{ res: 4, amount: c.writes.length ? 49 : 50 }] };
      if (!c.writes.length) return;
      if (name === 'AllItemRequest' && ['missing-num', 'duplicate-item'].includes(fault)) {
        const items = [...c.stock].map(([itemId, num]) => ({ itemId, num }));
        if (fault === 'missing-num') delete items[0].num; else items.push({ ...items[0] });
        return { items };
      }
      if (name === 'AllResourceRequest' && fault === 'missing-resources') return {};
    },
  });
  const result = await execute(client, await select(client, kind));
  assert.equal(result.status, 'UNKNOWN', JSON.stringify(result)); assert.equal(result.unresolvedWrite, true);
  assert.equal(result.verification.status, 'UNCONFIRMED'); assert.equal(client.writes.length, 1);
  assert.equal(client.confirmations.length, 0); assert.equal(client.pending.length, 1);
});

for (const kind of ['gainFactory', 'collectProduct']) for (const partial of [false, true])
  test('collection exact settlement preserves ' + kind + ' partial=' + partial, async () => {
    const assets = [{ id: '布匹', num: 2 }, { id: '布匹', num: 3 }, { id: 'GOLD', num: 3 }];
    const building = kind === 'gainFactory' ? rawFactory({ factory: { autoProductId: '', factoryQ: [], finishedProducts: assets } })
      : rawBuilding('1民居', { product: { asset: assets } });
    let gold = 10;
    const client = fake([building], new Map([['布匹', 4], ['加速器', 3]]), {
      write(_name, _body, c) {
        const rest = partial ? [{ id: '布匹', num: 2 }, { id: 'GOLD', num: 1 }] : [];
        if (kind === 'gainFactory') c.buildings[0].factory.finishedProducts = rest; else c.buildings[0].product.asset = rest;
        c.stock.set('布匹', 4 + (partial ? 3 : 5)); gold += partial ? 2 : 3;
      },
      read(name) { if (name === 'AllResourceRequest') return { list: [{ res: 3, amount: gold }] }; },
    });
    const result = await execute(client, await select(client, kind));
    assert.equal(result.status, 'SUCCESS'); assert.equal(client.writes.length, 1);
    assert.deepEqual(result.collectedProducts, [{ id: '布匹', num: partial ? 3 : 5 }, { id: 'GOLD', num: partial ? 2 : 3 }]);
    assert.equal(result.beforeInventoryReliable, true); assert.equal(result.afterInventoryReliable, true);
    assert.equal(client.confirmations.length, 1); assert.equal(client.pending.length, 0);
  });

for (const kind of ['gainFactory', 'collectProduct']) test('collection incomplete inventory blocks ' + kind + ' before dispatch', async () => {
  const assets = [{ id: '布匹', num: 1 }];
  const building = kind === 'gainFactory' ? rawFactory({ factory: { autoProductId: '', factoryQ: [], finishedProducts: assets } })
    : rawBuilding('1民居', { product: { asset: assets } });
  const client = fake([building], undefined, { read(name) { if (name === 'AllItemRequest') return { items: [{ itemId: '木材', num: 1 }, { itemId: '木材', num: 1 }] }; } });
  assert.equal(cityView(await read(client), { config }).candidates.some(row => row.actionType === kind), false);
  assert.deepEqual(client.writes, []);
});

for (const kind of ['gainFactory', 'collectProduct']) for (const fault of ['missing-num', 'overflow'])
  test('collection unknown output ' + kind + ' blocks ' + fault, async () => {
    const assets = fault === 'overflow' ? [{ id: '布匹', num: Number.MAX_SAFE_INTEGER }, { id: '布匹', num: 1 }] : [{ id: '布匹' }];
    const building = kind === 'gainFactory' ? rawFactory({ factory: { autoProductId: '', factoryQ: [], finishedProducts: assets } })
      : rawBuilding('1民居', { product: { asset: assets } });
    const client = fake([building]);
    assert.equal(cityView(await read(client), { config }).candidates.some(row => row.actionType === kind), false);
    assert.deepEqual(client.writes, []);
  });

for (const kind of ['build', 'upgrade']) for (const fault of [
  'no-debit', 'under-debit', 'over-debit', 'incoming', 'new-item', 'duplicate-item', 'missing-num', 'ruby',
]) test('construction exact settlement ' + kind + ' rejects ' + fault, async () => {
  const cfg = structuredClone(config);
  cfg.tables.BuildingUpgradeCfg.data.forEach(row => { row.consume = [['木材', 2]]; });
  const client = fake([rawBuilding('1民居', { level: kind === 'build' ? 0 : 1 })], undefined, {
    write(_name, _body, c) {
      c.buildings[0].level++; c.stock.set('木材', 2);
      if (fault === 'no-debit') c.stock.set('木材', 4);
      if (fault === 'under-debit') c.stock.set('木材', 3);
      if (fault === 'over-debit') c.stock.set('木材', 1);
      if (fault === 'incoming') c.stock.set('加速器', 4);
      if (fault === 'new-item') c.stock.set('unexpected', 1);
    },
    read(name, c) {
      if (name === 'AllResourceRequest' && fault === 'ruby') return { list: [{ res: 4, amount: c.writes.length ? 49 : 50 }] };
      if (name === 'AllItemRequest' && c.writes.length && ['duplicate-item', 'missing-num'].includes(fault)) {
        const items = [...c.stock].map(([itemId, num]) => ({ itemId, num }));
        if (fault === 'duplicate-item') items.push({ ...items[0] }); else delete items[0].num;
        return { items };
      }
    },
  });
  const candidate = cityView(await read(client, { config: cfg }), { config: cfg }).candidates.find(row => row.actionType === kind);
  const budget = { ledger: null }, result = await execute(client, candidate, { config: cfg, budget });
  assert.equal(result.status, 'UNKNOWN', JSON.stringify(result)); assert.equal(result.unresolvedWrite, true);
  assert.equal(client.confirmations.length, 0); assert.equal(client.pending.length, 1); assert.equal(client.writes.length, 1);
  assert.deepEqual(result.resourceReservation, [{ id: '木材', num: 2 }]); assert.equal(budget.ledger.available('木材'), 2);
});

for (const kind of ['build', 'upgrade']) for (const completed of [false, true])
  test('construction exact mixed debit ' + kind + ' completed=' + completed, async () => {
    const cfg = structuredClone(config); cfg.tables.BuildingUpgradeCfg.data.forEach(row => { row.consume = [['木材', 2], ['GOLD', 3]]; });
    let gold = 10;
    const client = fake([rawBuilding('1民居', { level: kind === 'build' ? 0 : 1 })], undefined, {
      write(_name, _body, c) {
        c.stock.set('木材', 2); gold -= 3;
        if (completed) c.buildings[0].level++;
        else Object.assign(c.buildings[0], { buildStartTime: Math.floor(Date.now() / 1000), buildFinishTime: Math.floor(Date.now() / 1000) + 120 });
      },
      read(name) { if (name === 'AllResourceRequest') return { list: [{ res: 3, amount: gold }] }; },
    });
    const candidate = cityView(await read(client, { config: cfg }), { config: cfg }).candidates.find(row => row.actionType === kind);
    const result = await execute(client, candidate, { config: cfg });
    assert.equal(result.status, 'SUCCESS'); assert.equal(result.verification.status, 'CONFIRMED');
    assert.deepEqual(result.resourceReservation, [{ id: '木材', num: 2 }, { id: 'GOLD', num: 3 }]);
    assert.equal(client.confirmations.length, 1); assert.equal(client.pending.length, 0); assert.equal(client.writes.length, 1);
  });

for (const kind of ['build', 'upgrade']) test('construction incomplete inventory blocks ' + kind, async () => {
  const client = fake([rawBuilding('1民居', { level: kind === 'build' ? 0 : 1 })], undefined,
    { read(name) { if (name === 'AllItemRequest') return { items: [{ itemId: '木材', num: 2 }, { itemId: '木材', num: 2 }] }; } });
  assert.equal(cityView(await read(client), { config }).candidates.some(row => row.actionType === kind), false);
  assert.deepEqual(client.writes, []);
});

test('factory auto stop uses original planner and confirms only explicit mode removal with unchanged full state and stock',async()=>{
 const factory=rawFactory({factory:{autoProductId:'布匹',factoryQ:[{idx:0,productId:'燃料',finishTime:2000000000}],finishedProducts:[{id:'布匹',num:1}]}}),client=fake([rawBuilding(),factory],undefined,{read(n,c){if(n==='OnWaterRequest')return {building:structuredClone(c.buildings),workerOrder:[],autoProduceForever:true};},write(n,b,c){assert.equal(n,'CancelFactoryAutoProduceRequest');assert.deepEqual(b,{buildingId:'1材料厂'});c.buildings[1].factory.autoProductId='';}});
 const before=await read(client),row=cityView(before,{config}).candidates.find(r=>r.actionType==='stopAutoProduce');assert.ok(row);assert.deepEqual(row.costs,[]);assert.equal(planWorld(before,{config}).actions.some(a=>a.kind==='stopAutoProduce'),false);
 const original=structuredClone(client.buildings),result=await execute(client,row);assert.equal(result.status,'SUCCESS');original[1].factory.autoProductId='';assert.deepEqual(client.buildings,original);assert.equal(client.stock.get('木材'),4);assert.equal(client.writes.length,1);
});
test('factory auto stop keeps missing rights and uncertain expiry unknown instead of using local time',()=>{
 const clock={status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:1,earliestMs:999999,nowMs:1000000,latestMs:1000001};
 assert.equal(factoryAutoProduceEntitled({rawOnWater:{autoProduceEndTime:2000},autoProductionClock:clock}),true);
 for(const f of [{rawOnWater:{}},{rawOnWater:{autoProduceForever:false,autoProduceEndTime:2000}},{rawOnWater:{autoProduceEndTime:1000},autoProductionClock:clock},{rawOnWater:{autoProduceEndTime:2000},autoProductionClock:{...clock,latestMs:2000000}},{rawOnWater:{autoProduceForever:'true'}}])assert.equal(factoryAutoProduceEntitled(f),false);
});
test('factory auto stop no effect, omitted flag, queue changes or inventory changes remain UNKNOWN',async()=>{
 for(const fault of ['no-effect','missing','queue','stock']){const client=fake([rawFactory({factory:{autoProductId:'布匹',factoryQ:[{idx:0,productId:'燃料',finishTime:2000000000}],finishedProducts:[]}})],undefined,{read(n,c){if(n==='OnWaterRequest')return {building:structuredClone(c.buildings),workerOrder:[],autoProduceForever:true};},write(n,b,c){if(fault!=='no-effect')c.buildings[0].factory.autoProductId='';if(fault==='missing')delete c.buildings[0].factory.autoProductId;if(fault==='queue')c.buildings[0].factory.factoryQ=[];if(fault==='stock')c.stock.set('木材',3);}}),row=cityView(await read(client),{config}).candidates.find(r=>r.actionType==='stopAutoProduce');assert.ok(row);assert.equal((await execute(client,row)).status,'UNKNOWN',fault);assert.equal(client.confirmations.length,0);assert.equal(client.writes.length,1);}
});
test('factory auto stop payment contract admits only exact cancellation and zero expenditure',()=>{
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'CancelFactoryAutoProduceRequest',body:{buildingId:'1材料厂'},costs:[]}));
 for(const action of [{request:'CancelFactoryAutoProduceRequest',body:{buildingId:'1材料厂'}},{request:'CancelFactoryAutoProduceRequest',body:{buildingId:'1材料厂',productId:'布匹'},costs:[]},{request:'CancelFactoryAutoProduceRequest',body:{buildingId:'1材料厂'},costs:[{id:'木材',num:1}]},{request:'SetFactoryAutoProduceRequest',body:{buildingId:'1材料厂',productId:'布匹'},costs:[]},{request:'SetBuildingAutoWorkRequest',body:{buildingId:'1装备厂',isOn:true},costs:[]}])assert.throws(()=>assertPaymentAllowed(action,{allowPaid:true}),{code:'COST_UNKNOWN'});
});
