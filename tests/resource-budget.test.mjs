import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceLedger, resourceCosts, safeResourceQuantity, stockFromResponses, validateResources } from '../src/resource-ledger.mjs';
import { planWorld, runWorld, surveyWorld } from '../src/world.mjs';
import { planHeroes, runHeroPlan } from '../src/heroes.mjs';
import { evaluateOrders } from '../src/order-rules.mjs';

const policy = { version: 1, enabled: true, rules: [] };
const order = (index, id = '木材', num = 2) => ({ index, requirements: [{ id, num }], missing: [], rewardExp: 100 });
const building = (buildingId, level = 1) => ({ buildingId, type: '民居', level, product: [], buildFinishTime: 0, factory: null });
const config = { tables: {
  BuildingCfg: { data: [{ buildingType: '民居' }] },
  BuildingUpgradeCfg: { data: [
    { buildingType: '民居', level: 1, playerLevel: 1, curPeople: 0, consume: [['木材', 2]], condition: [] },
    { buildingType: '民居', level: 2, playerLevel: 1, curPeople: 0, consume: [['木材', 2]], condition: [] },
  ] },
} };
function survey(stock = new Map([['木材', 2]]), extra = {}) {
  return { now: 100, player: { level: 2 }, population: 10, maxPopulation: 20, stockCap: 50, factorySlots: 6,
    buildings: [], factories: [], orders: [], stock, have: (id) => stock.get(id) ?? 0, notes: [], ...extra };
}
const types = (...names) => Object.fromEntries(names.flatMap((name) => [[name + 'Request', {}], [name + 'Response', {}]]));
const protocol = types('AllItem', 'AllResource', 'FinishWorkerOrder', 'UpgradeBuilding', 'HeroLevelUp', 'HeroStarUp');
function clientWith(stock, extra = {}) {
  const writes = [], reads = [];
  return { writes, reads, connected: true,
    async request(name, body) {
      if (name === 'AllItemRequest') { reads.push(name); return { items: [...stock].filter(([id]) => id !== 'GOLD').map(([itemId, num]) => ({ itemId, num })) }; }
      if (name === 'AllResourceRequest') { reads.push(name); return { list: [{ res: 3, amount: stock.get('GOLD') ?? 0 }] }; }
      writes.push({ name, body }); return {};
    },
    async sendWatch(name, body) { writes.push({ name, body }); return { status: 'UNKNOWN' }; }, ...extra };
}

test('resource costs aggregate duplicate IDs atomically and reject unknown, unsafe or diamond balances', () => {
  const stock = new Map([['木材', 2], ['bad', null], ['RUBY', 50]]), ledger = new ResourceLedger(stock);
  assert.deepEqual(resourceCosts([['木材', 1], { id: '木材', num: 1 }]), [{ id: '木材', num: 2 }]);
  assert.equal(ledger.reserve([['木材', 1], ['木材', 2]]), false);
  assert.deepEqual([...ledger.reserved], []);
  assert.equal(ledger.reserve([['bad', 1]]), false);
  assert.equal(ledger.reserve([['RUBY', 1]]), false);
  assert.equal(ledger.reserve([['木材', 2]]), true);
  assert.equal(ledger.available('木材'), 0);
  assert.equal(stock.get('木材'), 2);
  assert.equal(ledger.reserve([['木材', 1]]), false);
});

test('shared quantity conversion never rounds an unsafe int64 into a usable balance', () => {
  assert.equal(safeResourceQuantity({ low: -1, high: 0 }), 4294967295);
  assert.equal(safeResourceQuantity({ low: -1, high: -1 }), null);
  assert.equal(safeResourceQuantity({ low: -1, high: -1, unsigned: true }), null);
  assert.equal(safeResourceQuantity('9007199254740993'), null);
  assert.equal(safeResourceQuantity(Number.MAX_SAFE_INTEGER + 1), null);
  const stock = stockFromResponses({ items: [{ itemId: 'x', num: 2 }, { itemId: 'x', num: 3 }] }, { list: [{ res: 3, amount: 10 }] });
  assert.deepEqual([...stock], [['x', 5], ['GOLD', 10]]);
});

test('two orders needing two materials each can only reserve one from a stock of two', () => {
  const plan = planWorld(survey(undefined, { orders: [order(0), order(1)] }), { config });
  assert.deepEqual(plan.actions.filter(({ kind }) => kind === 'finishOrder').map(({ body }) => body.index), [0]);
  assert.deepEqual(plan.reserved, [['木材', 2]]);
});

test('duplicate requirements are checked as one total, not independently affordable entries', () => {
  const input = order(0); input.requirements.push({ id: '木材', num: 1 });
  const plan = planWorld(survey(undefined, { orders: [input] }), { config });
  assert.equal(plan.actions.length, 0);
});

for (const [name, level] of [['upgrade', 1], ['build', 0]]) {
  test(`two ${name} candidates recheck their shared material budget when selected`, () => {
    const plan = planWorld(survey(undefined, { buildings: [building('1民居', level), building('2民居', level)] }), { config });
    assert.equal(plan.actions.filter(({ kind }) => kind === name).length, 1);
    assert.deepEqual(plan.reserved, [['木材', 2]]);
  });
}

test('production sees shortages after an order reservation and shares its recipe materials with upgrades', () => {
  const factory = { ...building('1材料厂'), type: '材料厂', factory: { factoryQ: [], finishedProducts: [] } };
  const withRecipe = structuredClone(config);
  withRecipe.tables.BuildingProduceCfg = { data: [{ buildType: '材料厂', itemId: '布匹', produceTime: 1, unlockLevel: 1, costItem: [['木材', 2]] }] };
  const plan = planWorld(survey(new Map([['木材', 2], ['布匹', 2]]), {
    buildings: [factory, building('1民居')], factories: [factory], orders: [order(0, '布匹'), order(1, '布匹')],
  }), { config: withRecipe });
  assert.equal(plan.actions.filter(({ kind }) => kind === 'finishOrder').length, 1);
  assert.equal(plan.actions.filter(({ kind }) => kind === 'startProduce').length, 1);
  assert.equal(plan.actions.some(({ kind }) => kind === 'upgrade'), false);
  assert.deepEqual(plan.reserved, [['布匹', 2], ['木材', 2]]);
  assert.match(plan.actions.find(({ kind }) => kind === 'startProduce').label, /订单缺 2/);
});

const heroConfig = { tables: {
  HeroCfg: { data: [{ id: 'A', quality: 'BLUE', universalItemId: '共享材料' }] },
  HeroUpgradeCfg: { data: [{ level: 1, exp: 0, reqPlayerLv: 1 }, { level: 2, exp: 2, reqPlayerLv: 1 }] },
  HeroStarCfg: { data: [{ star: 1, consumeBlue: 2, maxSkillLevel: [2] }] },
  HeroSkillUpCfg: { data: [{ quality: 'BLUE', level: 2, costArr: [['共享材料', 2]] }] },
} };

test('world, order-rule allocation and heroes compose over the same ledger without overspending', () => {
  const stock = new Map([['木材', 2], ['英雄经验', 2], ['共享材料', 2]]), ledger = new ResourceLedger(stock);
  assert.equal(evaluateOrders([order(0)], stock, policy, { ledger })[0].decision, 'RECOMMEND_SUBMIT');
  assert.equal(planWorld(survey(stock, { buildings: [building('1民居')] }), { config, ledger }).actions.length, 0);
  const heroes = planHeroes({ config: heroConfig, heroes: [{ heroId: 'A', level: 1, star: 0, skillLevels: [1] }],
    itemNum: (id) => stock.get(id) ?? 0, playerLevel: 1, ledger });
  assert.deepEqual(heroes.steps.map(({ kind }) => kind), ['level', 'star']);
  assert.equal(ledger.available('共享材料'), 0);
  assert.equal(heroes.steps.some(({ kind }) => kind === 'skill'), false);
  assert.deepEqual([...stock], [['木材', 2], ['英雄经验', 2], ['共享材料', 2]]);
});

test('explicit rule allocation reserves across orders while the existing preview stays independent', () => {
  const stock = new Map([['木材', 2]]), orders = [order(0), order(1)];
  assert.deepEqual(evaluateOrders(orders, stock, policy).map(({ decision }) => decision), ['RECOMMEND_SUBMIT', 'RECOMMEND_SUBMIT']);
  assert.deepEqual(evaluateOrders(orders, stock, policy, { ledger: new ResourceLedger(stock) }).map(({ decision }) => decision), ['RECOMMEND_SUBMIT', 'RECOMMEND_KEEP']);
});

test('world refuses a previously valid plan if current material balance has dropped', async () => {
  const plan = planWorld(survey(undefined, { orders: [order(0)] }), { config });
  const client = clientWith(new Map([['木材', 1]]));
  const result = await runWorld(client, protocol, plan, { allowMutate: true });
  assert.equal(result.results[0].status, 'NOT_EXECUTED');
  assert.equal(client.writes.length, 0);
});

test('execution budget cannot reuse stale item replies across separately composed runs', async () => {
  const plan = planWorld(survey(undefined, { orders: [order(0)] }), { config });
  const client = clientWith(new Map([['木材', 2]])), budget = { ledger: null };
  const first = await runWorld(client, protocol, plan, { allowMutate: true, budget });
  const second = await runWorld(client, protocol, plan, { allowMutate: true, budget });
  assert.equal(first.results[0].status, 'SUCCESS');
  assert.equal(second.results[0].status, 'NOT_EXECUTED');
  assert.equal(client.writes.length, 1);
  assert.deepEqual(client.reads, ['AllItemRequest', 'AllResourceRequest', 'AllItemRequest', 'AllResourceRequest']);
});

test('missing cost metadata or missing inventory response never authorizes a consuming write', async () => {
  const client = clientWith(new Map([['木材', 2]]));
  const plan = { actions: [{ kind: 'upgrade', request: 'UpgradeBuildingRequest', body: { buildingId: '1民居' } }] };
  assert.equal((await runWorld(client, protocol, plan, { allowMutate: true })).results[0].status, 'NOT_EXECUTED');
  assert.equal(client.writes.length, 0);
  const invalid = clientWith(new Map(), { async request() { return {}; } });
  await assert.rejects(validateResources(invalid, protocol, [['木材', 1]]), { code: 'NOT_EXECUTED' });
});

test('quiet world writes are UNKNOWN and stop before the next step', async () => {
  const client = clientWith(new Map([['木材', 4]]));
  const plan = planWorld(survey(new Map([['木材', 4]]), { buildings: [building('1民居'), building('2民居')] }), { config });
  const outcome = await runWorld(client, protocol, plan, { allowMutate: true });
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].status, 'UNKNOWN');
  assert.equal(outcome.results[0].ok, null);
  assert.equal(client.writes.length, 1);
});

test('hero writes revalidate experience and stop an unconfirmed multi-level step', async () => {
  const stock = new Map([['英雄经验', 2]]);
  const plan = planHeroes({ config: heroConfig, heroes: [{ heroId: 'A', level: 1, star: 0, skillLevels: [] }],
    itemNum: (id) => stock.get(id) ?? 0, playerLevel: 1 });
  const low = clientWith(new Map([['英雄经验', 1]]));
  assert.equal((await runHeroPlan(low, protocol, plan, { allowMutate: true }))[0].status, 'NOT_EXECUTED');
  assert.equal(low.writes.length, 0);
  const client = clientWith(stock);
  assert.equal((await runHeroPlan(client, protocol, plan, { allowMutate: true }))[0].status, 'UNKNOWN');
  assert.equal(client.writes.length, 1);
});

test('stop during balance verification sends no write and releases the waiting executor promptly', async () => {
  const abort = new AbortController(); let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const client = clientWith(new Map(), { request() { entered(); return new Promise(() => {}); } });
  const plan = planWorld(survey(undefined, { orders: [order(0)] }), { config });
  const running = runWorld(client, protocol, plan, { allowMutate: true, signal: abort.signal });
  await started; abort.abort();
  const result = await running;
  assert.equal(result.results[0].status, 'CANCELLED');
  assert.equal(client.writes.length, 0);
});

test('missing declared response never falls back to an unconfirmed send', async () => {
  const client = clientWith(new Map([['木材', 2]]));
  const plan = planWorld(survey(undefined, { orders: [order(0)] }), { config });
  const incomplete = { ...protocol }; delete incomplete.FinishWorkerOrderResponse;
  const result = await runWorld(client, incomplete, plan, { allowMutate: true });
  assert.equal(result.results[0].status, 'NOT_EXECUTED');
  assert.equal(client.writes.length, 0);
});

test('a run may spend fresh item and resource balances without a missing budget domain', async () => {
  const stock = new Map([['木材', 2], ['GOLD', 3]]), budget = { ledger: null }, client = clientWith(stock);
  await validateResources(client, protocol, [['木材', 2]], { budget });
  await assert.doesNotReject(validateResources(client, protocol, [['GOLD', 3]], { budget }));
  assert.equal(budget.ledger.available('木材'), 0);
  assert.equal(budget.ledger.available('GOLD'), 0);
});

test('survey cancellation is not swallowed into a missing-data fallback or followed by more queries', async () => {
  const abort = new AbortController(); const calls = [];
  const client = { connected: true, request(name) { calls.push(name); abort.abort(); return Promise.resolve({ building: [] }); } };
  await assert.rejects(surveyWorld(client, types('OnWater', 'AllItem', 'AllResource'), { config, signal: abort.signal }), { code: 'CANCELLED' });
  assert.deepEqual(calls, ['OnWaterRequest']);
});

test('a callback-backed ledger freezes each observed balance for a composed plan', () => {
  let amount = 2;
  const ledger = new ResourceLedger(() => amount);
  assert.equal(ledger.reserve([['木材', 1]]), true);
  amount = 100;
  assert.equal(ledger.available('木材'), 1);
  assert.equal(ledger.reserve([['木材', 2]]), false);
});

test('an already-cancelled direct budget validation never starts a query', async () => {
  const abort = new AbortController(); abort.abort(); let calls = 0;
  const client = { connected: true, request() { calls++; return {}; } };
  await assert.rejects(validateResources(client, protocol, [['木材', 1]], { signal: abort.signal }), { code: 'CANCELLED' });
  assert.equal(calls, 0);
});

test('unknown material quantities never become free construction, upgrades or production', async () => {
  const invalid = [null, undefined, NaN, '', -1, 'bad'];
  const factory = { ...building('1材料厂'), type: '材料厂', factory: { factoryQ: [], finishedProducts: [] } };
  for (const value of invalid) {
    for (const level of [0, 1]) {
      const bad = structuredClone(config);
      bad.tables.BuildingUpgradeCfg.data.find((row) => row.level === level + 1).consume = [['木材', value]];
      const plan = planWorld(survey(undefined, { buildings: [building('1民居', level)] }), { config: bad });
      assert.deepEqual(plan.actions, [], `construction level ${level}, invalid amount ${String(value)}`);
      const client = clientWith(new Map([['木材', 2]]));
      await runWorld(client, protocol, plan, { allowMutate: true });
      assert.deepEqual(client.writes, []);
    }
    const bad = structuredClone(config);
    bad.tables.BuildingProduceCfg = { data: [{ buildType: '材料厂', itemId: '布匹', produceTime: 1, unlockLevel: 1, costItem: [['木材', value]] }] };
    assert.deepEqual(planWorld(survey(undefined, { buildings: [factory], factories: [factory] }), { config: bad }).actions, []);
  }
});

test('only explicit empty material arrays establish a zero-cost building or recipe', () => {
  for (const consume of [undefined, null, '']) {
    const bad = structuredClone(config);
    for (const row of bad.tables.BuildingUpgradeCfg.data) row.consume = consume;
    for (const level of [0, 1]) assert.deepEqual(planWorld(survey(undefined, { buildings: [building('1民居', level)] }), { config: bad }).actions, []);
  }
  const free = structuredClone(config);
  for (const row of free.tables.BuildingUpgradeCfg.data) row.consume = [];
  assert.equal(planWorld(survey(undefined, { buildings: [building('1民居', 0)] }), { config: free }).actions[0].kind, 'build');
  const factory = { ...building('1材料厂'), type: '材料厂', factory: { factoryQ: [], finishedProducts: [] } };
  for (const costItem of [undefined, null, '', []]) {
    const current = structuredClone(config);
    current.tables.BuildingProduceCfg = { data: [{ buildType: '材料厂', itemId: '布匹', produceTime: 1, unlockLevel: 1, costItem }] };
    assert.equal(planWorld(survey(undefined, { buildings: [factory], factories: [factory] }), { config: current }).actions.length, Array.isArray(costItem) ? 1 : 0);
  }
});

test('raw unknown and zero order quantities stay invalid through survey, planner and rule preview', async () => {
  const worldProtocol = { ...protocol, ...types('OnWater', 'MyResFields', 'MyFleets') };
  for (const num of [null, undefined, NaN, '', -1, 0]) {
    const client = clientWith(new Map([['木材', 2]]));
    const request = client.request;
    client.request = async (name, body) => name === 'OnWaterRequest'
      ? { building: [], workerOrder: [{ index: 0, requirements: [{ id: '木材', num }] }] }
      : ['MyResFieldsRequest', 'MyFleetsRequest'].includes(name) ? {} : request.call(client, name, body);
    const state = await surveyWorld(client, worldProtocol, { config });
    assert.equal(state.orders[0].requirements[0].num, num === 0 ? 0 : null);
    assert.deepEqual(planWorld(state, { config }).actions, [], `invalid order quantity ${String(num)}`);
    assert.equal(evaluateOrders(state.orders, state.stock, policy)[0].decision, 'NEEDS_REVIEW');
    assert.deepEqual(client.writes, []);
  }
});

test('hero experience, fragment and skill unknown costs never produce a free upgrade', async () => {
  const stock = new Map([['英雄经验', 2], ['共享材料', 2], ['A碎片', 2]]);
  for (const value of [null, undefined, NaN, '', -1]) {
    const badLevel = structuredClone(heroConfig);
    badLevel.tables.HeroUpgradeCfg.data[1].exp = value;
    const level = planHeroes({ config: badLevel, heroes: [{ heroId: 'A', level: 1, star: 1, skillLevels: [] }],
      itemNum: (id) => stock.get(id) ?? 0, playerLevel: 1 });
    assert.deepEqual(level.steps, []);
    const client = clientWith(stock);
    await runHeroPlan(client, protocol, level, { allowMutate: true });
    assert.deepEqual(client.writes, []);
    const badStar = structuredClone(heroConfig);
    badStar.tables.HeroStarCfg.data[0].consumeBlue = value;
    assert.deepEqual(planHeroes({ config: badStar, heroes: [{ heroId: 'A', level: 2, star: 0, skillLevels: [] }],
      itemNum: (id) => stock.get(id) ?? 0, playerLevel: 1 }).steps, []);
    const badSkill = structuredClone(heroConfig);
    badSkill.tables.HeroSkillUpCfg.data[0].costArr = [['共享材料', value]];
    assert.deepEqual(planHeroes({ config: badSkill, heroes: [{ heroId: 'A', level: 2, star: 1, skillLevels: [1] }],
      itemNum: (id) => stock.get(id) ?? 0, playerLevel: 1 }).steps, []);
  }
});

test('duplicate materials in building and recipe configuration are charged as one summed cost', () => {
  const duplicate = structuredClone(config);
  for (const row of duplicate.tables.BuildingUpgradeCfg.data) row.consume = [['木材', 1], ['木材', 2]];
  for (const level of [0, 1]) assert.deepEqual(planWorld(survey(undefined, { buildings: [building('1民居', level)] }), { config: duplicate }).actions, []);
  const factory = { ...building('1材料厂'), type: '材料厂', factory: { factoryQ: [], finishedProducts: [] } };
  duplicate.tables.BuildingProduceCfg = { data: [{ buildType: '材料厂', itemId: '布匹', produceTime: 1, unlockLevel: 1, costItem: [['木材', 1], ['木材', 2]] }] };
  assert.deepEqual(planWorld(survey(undefined, { buildings: [factory], factories: [factory] }), { config: duplicate }).actions, []);
});

test('request identity determines spending guards even when display kind claims a free operation', async () => {
  const client = clientWith(new Map([['木材', 2]]));
  const result = await runWorld(client, protocol, { actions: [{ kind: 'collectProduct', request: 'UpgradeBuildingRequest', body: { buildingId: '1民居' } }] }, { allowMutate: true });
  assert.equal(result.results[0].status, 'NOT_EXECUTED');
  assert.deepEqual(client.writes, []);
});

test('an unknown hero operation never builds or dispatches a request', async () => {
  const client = clientWith(new Map());
  const result = await runHeroPlan(client, protocol, { steps: [{ kind: 'unknown', heroId: 'A', costs: [] }] }, { allowMutate: true });
  assert.equal(result[0].status, 'NOT_EXECUTED');
  assert.deepEqual(client.writes, []);
  assert.deepEqual(client.reads, []);
});

test('out-of-range Long words cannot wrap into a small spendable balance', () => {
  for (const value of [
    { low: -4294967295, high: 0 }, { low: 4294967297, high: 0 },
    { low: 0, high: 4294967296 }, { low: -1, high: 2147483648, unsigned: true },
    { low: 2147483648, high: 0 }, { low: 0, high: -2147483649 },
  ]) {
    assert.equal(safeResourceQuantity(value), null);
    assert.equal(new ResourceLedger(new Map([['木材', value]])).reserve([['木材', 1]]), false);
  }
});
