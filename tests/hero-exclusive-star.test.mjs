import assert from 'node:assert/strict';
import test from 'node:test';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { loadConfig } from '../src/config.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import {
  heroModule, planHeroOperations, surveyHeroOperations, validateHeroParameters,
  verifyHeroOperation, viewHeroOperations,
} from '../src/hero-operations.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createRunBudgetContext, ResourceLedger } from '../src/resource-ledger.mjs';

const protocol = loadProtocol();
const request = 'HeroExclusiveStarUpRequest';
const parameters = (heroId = 'A') => ({ heroId, action: 'exclusive-star' });
const starStones = ['橙专武升星石', '红专武升星石'];
const wire = (name, body) => protocol[name].decode(protocol[name].encode(body).finish());
const inventory = entries => Object.fromEntries(entries.map(({ id, num }) => [id, num]));
const assertCosts = (actual, expected) => {
  assert.deepEqual(inventory(actual), inventory(expected));
  assert.equal(actual.length, expected.length);
};

function fixture({ config, heroId = 'A', quality = 'ORANGE', apply = true, afterWrite } = {}) {
  const fragment = heroId + '碎片', stone = starStones[quality === 'RED' ? 1 : 0];
  const expectedCosts = [{ id: fragment, num: 60 }, { id: stone, num: 5 }];
  const heroes = [
    {
      heroId, level: 20, star: 25, exclusive: { level: 50, star: 0 }, skillLevels: [1, 1],
      power: '9007199254740993', attributes: [{ attr: 1, value: 14.5 }],
      equips: [{ uid: '9007199254740997', equipId: '蓝武器1', level: 1, star: 0, refineLv: 0, attr: [{ attr: 1, value: 1.5, rating: 2 }] }],
    },
    { heroId: 'non-target', level: 10, star: 5, skillLevels: [1], power: '100', attributes: [{ attr: 1, value: 2 }] },
  ];
  const stock = new Map([[fragment, 60], [stone, 5], ['橙卡万能碎片', 1000], ['红卡万能碎片', 1000], ['非目标材料', 12]]);
  const writes = [];
  const client = {
    connected: true,
    factContext: { accountId: 'account-A', generation: 7, connectionId: 'C226-connection' },
    uncertainWrites: new Map(),
    async request(name, body, response) {
      wire(name, body);
      assert.equal(response, name.replace('Request', 'Response'));
      if (name === 'AllHeroRequest') return wire(response, { heroes });
      if (name === 'AllItemRequest') return wire(response, { items: [...stock].filter(([, num]) => num !== 0).map(([itemId, num]) => ({ itemId, num })) });
      assert.equal(name, 'AllResourceRequest');
      return wire(response, { list: [{ res: 3, amount: 100 }] });
    },
    async sendWatch(name, body) {
      assert.equal(name, request);
      assert.deepEqual(toSnapshotJson(wire(name, body)), { heroId, universal: false });
      writes.push(structuredClone(body));
      if (apply) {
        heroes[0].exclusive.star++;
        heroes[0].power = '9007199254741007';
        heroes[0].attributes[0].value += 1.25;
        for (const { id, num } of expectedCosts) stock.set(id, stock.get(id) - num);
      }
      afterWrite?.({ heroes, stock });
      const nextHero = { ...heroes[0], exclusive: { level: heroes[0].exclusive.level, star: 1 } };
      return { status: 'SUCCESS', nextHero: wire('HeroExclusiveNextUpResponse', { nextHero }).nextHero };
    },
  };
  const defaultConfig = () => ({ tables: {
    HeroCfg: { data: [{ id: heroId, type: '英雄', quality }] },
    ExclusiveUpgradeCfg: { data: [{ level: 1, heroStar: 15, cost: [['初级专武材料', 20], ['中级专武材料', 5]] }] },
    ExclusiveStarCfg: { data: [
      { star: 0, unlockLv: 50, heroStar: 0, piece: 0, cost: [] },
      { star: 1, unlockLv: 52, heroStar: 25, piece: 60, cost: [[starStones[0], 5], [starStones[1], 5]] },
    ] },
    ExclusiveShowCfg: { data: [{ heroId }] },
    ExclusiveWeaponCfg: { data: [{ heroId, skillLv: 1 }] },
    ItemCfg: { data: [
      ...starStones.map((id, i) => ({ id, type: '专武经验', quality: i === 0 ? 'ORANGE' : 'RED' })),
      { id: fragment, type: '英雄碎片', quality },
      { id: '橙卡万能碎片', type: '英雄万能碎片', quality: 'ORANGE' },
      { id: '红卡万能碎片', type: '英雄万能碎片', quality: 'RED' },
    ] },
  } });
  const options = { player: { id: '17', worldId: '9', level: 30 }, moduleConfig: { enabled: true }, parameters: parameters(heroId), config: config ?? defaultConfig() };
  const survey = () => surveyHeroOperations(client, protocol, options);
  const plan = async (extra = {}) => planHeroOperations(await survey(), { ...options, ...extra });
  const execute = async (operation, limits = operation.budgetClaims) => {
    const scope = { ...client.factContext, runId: 'C226-run' };
    const runBudget = createRunBudgetContext({ scope, limits });
    const result = await executeBusinessOperation(client, protocol, operation, {
      adapter: heroModule, ...options, allowMutate: true,
      budget: { scope, runBudget, batchId: 'C226-batch', limits: operation.budgetClaims, ledger: null },
    });
    return { result, runBudget };
  };
  return { heroes, stock, stone, fragment, expectedCosts, writes, client, options, survey, plan, execute };
}

test('C226 request codec requires the universal field even for an explicit false', () => {
  assert.equal(protocol.HeroExclusiveStarUpResponse, undefined);
  assert.equal(Object.hasOwn(wire(request, { heroId: 'A', universal: false }), 'universal'), true);
  assert.throws(() => protocol[request].decode(Buffer.from([10, 1, 65])), /universal/);
});

test('C226 selector is explicit and binds two owned costs and the same exclusive UID as LEVEL', async () => {
  assert.deepEqual(validateHeroParameters(parameters()), parameters());
  for (const extra of [{ allowUniversal: true }, { allowUniversal: false }, { universal: false }, { count: 1 }, { request }, { action: 'exclusive-activate' }]) {
    assert.throws(() => validateHeroParameters({ ...parameters(), ...extra }), { code: 'INVALID_PARAMETERS' });
  }
  assert.ok(heroModule.capabilities.includes('C226'));
  for (const quality of ['ORANGE', 'RED']) {
    const f = fixture({ quality });
    const [op] = (await f.plan()).actions;
    assert.ok(op);
    assert.equal(op.actionType, 'EXCLUSIVE-STAR');
    assert.deepEqual(op.action, { request, response: null, body: { heroId: 'A', universal: false } });
    assert.deepEqual(op.expectedState.exclusive, { level: 50, star: 1 });
    assertCosts(op.costs, f.expectedCosts);
    assertCosts(op.budgetClaims.resources, f.expectedCosts);
    assert.deepEqual(op.budgetClaims.uids, [{ type: 'hero-exclusive', id: 'A' }]);
    assert.equal(viewHeroOperations(await f.survey(), { ...f.options, parameters: {} }).candidates.some(row => row.actionType === 'EXCLUSIVE-STAR'), false);
    assert.equal((await f.plan({ parameters: { action: 'exclusive-star' } })).actions.length, 0);
    assert.equal((await f.plan({ moduleConfig: { enabled: false } })).actions.length, 0);
  }
});

test('C226 rejects ineligible or unknown state, both material shortages and malformed cost evidence', async () => {
  for (const change of [
    f => delete f.heroes[0].exclusive,
    f => delete f.heroes[0].exclusive.star,
    f => f.heroes[0].exclusive.level = 0,
    f => f.heroes[0].exclusive.level = 51,
    f => f.heroes[0].star = 24,
    f => { f.heroes[0].exclusive = { level: 52, star: 1 }; },
    f => f.stock.set(f.fragment, 59),
    f => f.stock.set(f.stone, 4),
    f => { f.stock.delete(f.stone); f.stock.set(starStones[1], 1000); },
    f => f.options.config.tables.ExclusiveStarCfg.data[1].piece = 0,
    f => f.options.config.tables.ExclusiveStarCfg.data[1].heroStar = '25',
    f => f.options.config.tables.ExclusiveStarCfg.data[1].cost.reverse(),
    f => f.options.config.tables.ExclusiveStarCfg.data[1].cost[0] = ['RUBY', 5],
    f => f.options.config.tables.ItemCfg.data[2].type = '英雄万能碎片',
    f => f.options.config.tables.ItemCfg.data[2].quality = 'RED',
    f => f.options.config.tables.ExclusiveStarCfg.data.push(f.options.config.tables.ExclusiveStarCfg.data[1]),
  ]) {
    const f = fixture();
    change(f);
    assert.equal((await f.plan()).actions.length, 0, String(change));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  assert.equal((await f.plan({ ledger: new ResourceLedger(new Map([[f.fragment, 59], [f.stone, 5]])) })).actions.length, 0);
  assert.equal((await f.plan({ ledger: new ResourceLedger(new Map([[f.fragment, 60], [f.stone, 4]])) })).actions.length, 0);
});

test('C226 versioned local ORANGE and RED configs confirm both exact debits through shared-budget codec execution', async () => {
  const config = loadConfig({ file: new URL('../work/cdn/config_cn_pack.json', import.meta.url) });
  for (const [heroId, quality] of [['波雅', 'ORANGE'], ['普京', 'RED']]) {
    const f = fixture({ heroId, quality, config });
    const [op] = (await f.plan()).actions;
    assert.ok(op);
    assertCosts(op.costs, f.expectedCosts);
    const { result, runBudget } = await f.execute(op);
    assert.equal(result.status, 'SUCCESS', JSON.stringify(result.verification));
    assert.equal(result.verification.status, 'CONFIRMED');
    assert.equal(result.responseEvidence, null);
    assert.deepEqual(f.writes, [{ heroId, universal: false }]);
    assert.deepEqual(result.afterState.exclusive, { level: 50, star: 1 });
    assert.equal(result.afterState.power, '9007199254741007');
    assert.equal(result.afterState.equips[0].uid, '9007199254740997');
    assertCosts(runBudget.snapshot().reserved.resources, f.expectedCosts);
    assert.deepEqual(runBudget.snapshot().reserved.uids, [{ type: 'hero-exclusive', id: heroId }]);
  }
});

test('C226 keeps preview alone, wrong exclusive effect and either missing debit UNKNOWN', async () => {
  for (const changes of [
    { apply: false },
    { afterWrite: ({ heroes }) => heroes[0].exclusive.level++ },
    { afterWrite: ({ heroes }) => heroes[0].exclusive.star++ },
    { afterWrite: ({ heroes }) => heroes[1].power = '200' },
    { afterWrite: ({ stock }) => stock.set('A碎片', 1) },
    { afterWrite: ({ stock }) => stock.set(starStones[0], 1) },
    { afterWrite: ({ stock }) => stock.set('橙卡万能碎片', 999) },
  ]) {
    const f = fixture(changes);
    const [op] = (await f.plan()).actions;
    assert.ok(op);
    const { result, runBudget } = await f.execute(op);
    assert.equal(result.status, 'UNKNOWN', JSON.stringify(result.verification));
    assert.equal(result.unresolvedWrite, true);
    assert.equal(f.writes.length, 1);
    assertCosts(runBudget.snapshot().reserved.resources, f.expectedCosts);
    assert.deepEqual(runBudget.snapshot().reserved.uids, [{ type: 'hero-exclusive', id: 'A' }]);
  }
});

test('C226 changed permit evidence and insufficient parent budget prevent dispatch', async () => {
  for (const mutate of [
    f => f.client.factContext.connectionId = 'new',
    f => f.options.config.tables.ExclusiveStarCfg.data[1].piece = 61,
    f => f.heroes[0].exclusive.star = 1,
  ]) {
    const f = fixture();
    const [op] = (await f.plan()).actions;
    assert.ok(op);
    mutate(f);
    const { result } = await f.execute(op);
    assert.equal(result.status, 'NOT_EXECUTED');
    assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  const [op] = (await f.plan()).actions;
  assert.ok(op);
  for (const id of [f.fragment, f.stone]) {
    const limits = { ...op.budgetClaims, resources: op.costs.map(cost => ({ ...cost, num: cost.num - Number(cost.id === id) })) };
    const { result, runBudget } = await f.execute(op, limits);
    assert.equal(result.status, 'NOT_EXECUTED');
    assert.deepEqual(runBudget.snapshot().reserved, { resources: [], quotas: [], uids: [] });
  }
  assert.equal(f.writes.length, 0);
});

test('C226 verification reconstructs the exact plan and rejects edited costs, request or expected effect', async () => {
  const f = fixture();
  const before = await f.survey();
  const [op] = planHeroOperations(before, f.options).actions;
  assert.ok(op);
  await f.client.sendWatch(op.action.request, op.action.body);
  const after = await f.survey();
  assert.equal(verifyHeroOperation(op, before, after).confirmed, true);
  for (const change of [
    o => o.action.body.universal = true,
    o => o.action.response = 'HeroExclusiveNextUpResponse',
    o => o.costs.pop(),
    o => o.expectedState.exclusive.level++,
    o => o.budgetClaims.uids = [],
    o => o.configEvidence.ExclusiveStarCfg.data[1].piece++,
  ]) {
    const edited = structuredClone(op);
    change(edited);
    assert.equal(verifyHeroOperation(edited, before, after).confirmed, false);
  }
});

test('C226 does not bind the level price table or require an exclusive already at its cap', async () => {
  const f = fixture();
  f.heroes[0].exclusive.level = 49;
  const [first] = (await f.plan()).actions;
  assert.ok(first);
  assert.deepEqual(first.expectedState.exclusive, { level: 49, star: 1 });
  assert.deepEqual(Object.keys(first.configEvidence), ['HeroCfg', 'ExclusiveStarCfg', 'ExclusiveShowCfg', 'ExclusiveWeaponCfg', 'ItemCfg']);
  delete f.options.config.tables.ExclusiveUpgradeCfg;
  const [second] = (await f.plan()).actions;
  assert.ok(second);
  assert.equal(second.identity, first.identity);
});

test('C226 and C225 cannot spend against the same hero exclusive in separate batches in one run', async () => {
  const f = fixture();
  const { tables } = f.options.config;
  tables.ExclusiveUpgradeCfg.data.push({ level: 51, heroStar: 25, cost: [['初级专武材料', 20], ['中级专武材料', 5]] });
  tables.ItemCfg.data.push({ id: '初级专武材料', type: '专武经验' });
  f.stock.set('初级专武材料', 20);
  const [star] = (await f.plan()).actions;
  assert.ok(star);
  const { result, runBudget } = await f.execute(star, { ...star.budgetClaims, resources: [...star.costs, { id: '初级专武材料', num: 20 }] });
  assert.equal(result.status, 'SUCCESS');
  const args = { ...f.options, parameters: { heroId: 'A', action: 'exclusive-level' } };
  const facts = await surveyHeroOperations(f.client, protocol, args);
  const [level] = planHeroOperations(facts, args).actions;
  assert.ok(level, 'LEVEL is independently eligible after STAR increases its cap');
  assert.deepEqual(level.budgetClaims.uids, star.budgetClaims.uids);
  const second = await executeBusinessOperation(f.client, protocol, level, {
    adapter: heroModule, ...args, allowMutate: true,
    budget: { scope: { ...f.client.factContext, runId: 'C226-run' }, runBudget, batchId: 'C225-next-batch', limits: level.budgetClaims, ledger: null },
  });
  assert.equal(second.status, 'NOT_EXECUTED');
  assert.equal(second.dispatched, false);
  assert.deepEqual(f.writes, [{ heroId: 'A', universal: false }]);
  assert.equal(f.stock.get('初级专武材料'), 20);
  assertCosts(runBudget.snapshot().reserved.resources, f.expectedCosts);
});
