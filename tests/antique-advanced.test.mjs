import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  ANTIQUE_GROWTH_EVIDENCE, antiqueGrowthDependencyVersions, antiqueGrowthModule,
  planAntiqueGrowth, surveyAntiqueGrowth, validateAntiqueGrowthParameters, verifyAntiqueGrowth, viewAntiqueGrowth,
} from '../src/antique-growth.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { extractTables } from '../src/config.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { toSnapshotJson } from '../src/game.mjs';

const protocol = loadProtocol(), player = { playerId: '17', worldId: '9', level: 10 };
const wire = (type, body) => protocol[type].decode(protocol[type].encode(body).finish());
const colors = ['BLUE', 'PURPLE', 'ORANGE', 'RED'];
const universal = ['蓝藏万能碎片', '紫藏万能碎片', '橙藏万能碎片', '红藏万能碎片'];
const experience = ['蓝藏品经验', '紫藏品经验', '橙藏品经验', '红藏品经验'];
const id = (color, member = 1) => color + '藏品' + member;
function config() {
  return { tables: {
    ModuleOpenCfg: { data: [{ moduleId: '藏品', playerLevel: 10 }] },
    AntiqueBaseCfg: { data: colors.flatMap((color, i) => Array.from({ length: i === 3 ? 3 : 2 }, (_, n) => ({
      antiqueId: id(color, n + 1), color, activeFrag: 10, suitId: 1001 + i, universalItemId: universal[i],
    }))) },
    AntiqueSuitCfg: { data: colors.map((color, i) => ({ suitId: 1001 + i, color, colorIndex: i + 1,
      suitName: color + '套装', taskType: i === 0 ? '拥有藏品' : '', taskParam1: i === 0 ? '紫' : '' })) },
    AntiqueStarCfg: { data: Array.from({ length: 25 }, (_, i) => ({ star: i + 1, consumeBlue: 2, consumePur: 3, consumeOra: 4, consumeRed: 5 })) },
    AntiqueSuitLvCfg: { data: colors.flatMap((color, i) => [2, 3].map(maxLevel => ({
      color, colorIndex: i + 1, maxLevel, costArr: [['GOLD', 50], [experience[i], maxLevel === 2 ? 370 : 780]],
    }))) },
    AntiqueMasterLvCfg: { data: [
      { level: 1, totalStarNum: 0, maxSuitLv: 2, costArr: [], attrArr: [] },
      { level: 2, totalStarNum: 5, maxSuitLv: 3, costArr: ['藏品大师经验', 5], attrArr: [['基础生命', 107]] },
      { level: 3, totalStarNum: 10, maxSuitLv: 3, costArr: ['藏品大师经验', 10], attrArr: [['基础生命', 213]] },
    ] },
    ItemCfg: { data: colors.map((quality, i) => ({ id: universal[i], quality, type: '藏品万能碎片' })) },
  } };
}
function fake({ state, apply = true, afterWrite, receipt, onRead } = {}) {
  const cfg = config();
  const stock = new Map([...cfg.tables.AntiqueBaseCfg.data.map(row => [row.antiqueId + '碎片', 100]),
    ...universal.map(item => [item, 100]), ...experience.map(item => [item, 2000]), ['藏品大师经验', 100], ['普通材料', 5]]);
  const client = {
    connected: true, pending: [], watchers: [], uncertainWrites: new Set(), lateResponses: new Map(), reads: [], writes: [], stock,
    state: state ?? { antiques: cfg.tables.AntiqueBaseCfg.data.map(row => ({ id: row.antiqueId, star: 1 })), suits: [], masterLv: 1 },
    gold: 50000, factContext: { accountId: 'antique-advanced', generation: 2, connectionId: 'advanced-connection' },
    markUnverifiedWrite(name, body) { this.uncertainWrites.add(JSON.stringify([name, body])); },
    confirmWatchedWrite(name, body) { this.uncertainWrites.delete(JSON.stringify([name, body])); },
    change(name, body) {
      this.writes.push({ name, body: structuredClone(body) });
      assert.deepEqual(toSnapshotJson(wire(name, body)), body);
      if (apply && name === 'AntiqueSuitLevelUpRequest') {
        let row = this.state.suits.find(row => row.id === body.id);
        const colorIndex = body.id - 1001;
        if (row?.level > 0) {
          this.gold -= 50; const key = experience[colorIndex];
          this.stock.set(key, this.stock.get(key) - (row.level === 1 ? 370 : 780));
        }
        if (!row) { row = { id: body.id, level: 0, effectiveNum: 0, advEffectValue: 0 }; this.state.suits.push(row); }
        row.level++; row.effectiveNum = 8; row.advEffectValue = 1.25;
      } else if (apply && name === 'AntiqueMasterLevelUpRequest') {
        this.state.masterLv++;
        if (this.state.masterLv > 1) this.stock.set('藏品大师经验', this.stock.get('藏品大师经验') - (this.state.masterLv === 2 ? 5 : 10));
      } else if (apply && name === 'AntiqueFragExchangeRequest') {
        const source = cfg.tables.AntiqueBaseCfg.data.find(row => row.antiqueId === body.antiqueId).universalItemId;
        assert.equal(body.fragItemId,body.antiqueId+'碎片');
        this.stock.set(source, this.stock.get(source) - body.num);
        const item = body.antiqueId + '碎片'; this.stock.set(item, this.stock.get(item) + body.num);
      }
      afterWrite?.(this, name, body);
    },
    async request(name, body, response, _timeout, options = {}) {
      if (options.mutate) {
        options.beforeDispatch?.(); this.change(name, body); this.markUnverifiedWrite(name, body);
        return typeof receipt === 'function' ? receipt(this) : receipt ?? wire(response, { masterLv: this.state.masterLv });
      }
      assert.deepEqual(body, {}); this.reads.push(name); onRead?.(this, name);
      return wire(response, { AllAntiqueRequest: this.state,
        AllItemRequest: { items: [...this.stock].map(([itemId, num]) => ({ itemId, num })) },
        AllResourceRequest: { list: [{ res: 3, amount: this.gold }] } }[name]);
    },
    async sendWatch(name, body, { beforeDispatch }) {
      beforeDispatch?.(); this.change(name, body); this.markUnverifiedWrite(name, body); return { status: 'UNKNOWN' };
    },
  };
  return client;
}
const args = (cfg, parameters) => ({ config: cfg, player, parameters, moduleConfig: { enabled: true } });
async function fixture(parameters, options = {}, modifyConfig) {
  const cfg = config(), client = fake(options); modifyConfig?.(cfg);
  const before = await surveyAntiqueGrowth(client, protocol, args(cfg, parameters));
  const draft = planAntiqueGrowth(before, args(cfg, parameters));
  return { cfg, client, parameters, before, operation: draft.actions[0], draft };
}
async function run(f, extra = {}) {
  assert.ok(f.operation, JSON.stringify(f.draft.notes));
  const scope = { ...f.client.factContext, runId: 'advanced-run' }, limits = f.operation.budgetClaims;
  return executeBusinessOperation(f.client, protocol, f.operation, {
    ...args(f.cfg, f.parameters), adapter: antiqueGrowthModule, allowMutate: true,
    budget: { scope, batchId: 'advanced-batch', limits, runBudget: createRunBudgetContext({ scope, limits }) }, ...extra,
  });
}
const suitRow = (suitId = 1001, level = 1) => ({ id: suitId, level, effectiveNum: 2, advEffectValue: 0.5 });

test('new modes accept only their explicit semantic parameters and bind ordered branch config dependencies', async () => {
  for (const p of [{ action: 'suit', suitId: 1001 }, { action: 'master' }, { action: 'exchange', antiqueId: id('BLUE'), num: 2 }])
    assert.deepEqual(validateAntiqueGrowthParameters(p), p);
  for (const p of [{ action: 'suit', suitId: '1001' }, { action: 'suit', antiqueId: id('BLUE') }, { action: 'master', suitId: 1001 },
    { action: 'master', antiqueId: id('BLUE') }, { action: 'master', num: 1 }, { action: 'star', num: 1 },
    { action: 'exchange', num: 0 }, { action: 'exchange', num: 2147483648 }, { action: 'exchange', fragItemId: universal[0] },
    { action: 'suit', suitId: 0 }, { action: 'master', cap: 5 }]) assert.throws(() => validateAntiqueGrowthParameters(p));
  const expected = { suit: ['AntiqueSuitCfg', 'AntiqueSuitLvCfg', 'AntiqueMasterLvCfg'], master: ['AntiqueMasterLvCfg'], exchange: ['AntiqueStarCfg', 'ItemCfg'] };
  for (const action of Object.keys(expected)) assert.deepEqual(Object.keys(antiqueGrowthDependencyVersions(args(config(), { action }))),
    ['moduleConfig', 'config.ModuleOpenCfg', 'config.AntiqueBaseCfg', ...expected[action].map(name => 'config.' + name)]);
  const f = await fixture({ action: 'suit' });
  assert.equal(f.operation, undefined); assert.equal(f.draft.notes[0], 'EXPLICIT_SUIT_REQUIRED');
  assert.equal(viewAntiqueGrowth(f.before, args(f.cfg, f.parameters)).suits.length, 4);
});

test('suit absent and explicit own zero are separate free activation states, including master zero', async () => {
  for (const existing of [false, true]) {
    const client = fake(); client.state.masterLv = 0; if (existing) client.state.suits.push(suitRow(1001, 0));
    const f = await fixture({ action: 'suit', suitId: 1001 }, { state: client.state });
    assert.deepEqual(f.operation.costs, []);
    assert.deepEqual(f.operation.action, { request: 'AntiqueSuitLevelUpRequest', response: null, body: { id: 1001 } });
    assert.deepEqual(f.operation.expectedState, { suit: { id: 1001, level: 1 } });
    assert.deepEqual(f.operation.budgetClaims.uids, [{ type: 'antique-suit', id: '1001' }]);
    assert.equal((await run(f)).status, 'SUCCESS'); assert.equal(f.client.state.masterLv, 0);
  }
});

test('suit activation requires all ordinary-color members but precisely two owned red members', async () => {
  for (const [color, count, expected] of [['BLUE', 1, false], ['BLUE', 2, true], ['RED', 1, false], ['RED', 2, true]]) {
    const i = colors.indexOf(color);
    const state = { antiques: Array.from({ length: count }, (_, n) => ({ id: id(color, n + 1), star: 0 })), suits: [], masterLv: 0 };
    const f = await fixture({ action: 'suit', suitId: 1001 + i }, { state });
    assert.equal(Boolean(f.operation), expected);
    if (!expected) assert.equal(f.draft.notes[0], 'ANTIQUE_SUIT_MEMBERS_NOT_OWNED');
  }
});

test('paid suit growth uses next color cost row and independently enforces mastery and absolute caps', async () => {
  for (const [i, color] of colors.entries()) {
    const client = fake(); client.state.suits = [suitRow(1001 + i)];
    const f = await fixture({ action: 'suit', suitId: 1001 + i }, { state: client.state });
    assert.deepEqual(f.operation.costs, [{ id: 'GOLD', num: 50 }, { id: experience[i], num: 370 }]);
    assert.equal((await run(f)).status, 'SUCCESS');
    const view = viewAntiqueGrowth(f.before, args(f.cfg, f.parameters));
    assert.equal(view.suits.find(row => row.color === color).advEffectValue, 0.5);
  }
  for (const [level, masterLv, reason] of [[1, 0, 'ANTIQUE_SUIT_MASTER_LEVEL_LOCKED'], [2, 1, 'ANTIQUE_SUIT_MASTER_LEVEL_LOCKED'], [3, 3, 'ANTIQUE_SUIT_LEVEL_CAP_REACHED']]) {
    const client = fake(); client.state.suits = [suitRow(1001, level)]; client.state.masterLv = masterLv;
    const f = await fixture({ action: 'suit', suitId: 1001 }, { state: client.state });
    assert.equal(f.draft.notes[0], reason);
  }
});

test('master free first level and paid next level bind total owned stars, configured attributes and exact response', async () => {
  for (const masterLv of [0, 1]) {
    const client = fake(); client.state.masterLv = masterLv;
    const f = await fixture({ action: 'master' }, { state: client.state });
    assert.deepEqual(f.operation.action, { request: 'AntiqueMasterLevelUpRequest', response: 'AntiqueMasterLevelUpResponse', body: {} });
    assert.deepEqual(f.operation.costs, masterLv ? [{ id: '藏品大师经验', num: 5 }] : []);
    assert.deepEqual(f.operation.budgetClaims.uids, [{ type: 'antique-master', id: 'GLOBAL' }]);
    const view = viewAntiqueGrowth(f.before, args(f.cfg, f.parameters));
    assert.equal(view.master.totalStars, 9); assert.deepEqual(view.master.next.attributes, masterLv ? [['基础生命', 107]] : []);
    assert.equal((await run(f)).status, 'SUCCESS');
  }
  const low = fake(); low.state.antiques = [{ id: id('BLUE'), star: 4 }];
  assert.equal((await fixture({ action: 'master' }, { state: low.state })).draft.notes[0], 'ANTIQUE_MASTER_TOTAL_STARS_INSUFFICIENT');
  low.state.masterLv = 3;
  assert.equal((await fixture({ action: 'master' }, { state: low.state })).draft.notes[0], 'ANTIQUE_MASTER_CAP_REACHED');
});

test('exchange constructs each quality universal source and exact 1:1 specific credit without target deficit clamping', async () => {
  for (const [i, color] of colors.entries()) {
    const f = await fixture({ action: 'exchange', antiqueId: id(color), num: 70 });
    assert.deepEqual(f.operation.costs, [{ id: universal[i], num: 70 }]);
    assert.deepEqual(f.operation.action, { request: 'AntiqueFragExchangeRequest', response: null,
      body: { antiqueId: id(color), fragItemId: id(color)+'碎片', num: 70 } });
    assert.equal(f.operation.expectedState.exchange.target.after, 170);
    assert.deepEqual(f.operation.budgetClaims, { resources: f.operation.costs, quotas: [], uids: [{ type: 'antique', id: id(color) }] });
    const result = await run(f); assert.equal(result.status, 'SUCCESS'); assert.equal(f.client.writes.length, 1);
  }
});

test('exchange refuses missing or capped ownership, insufficient source and unsafe target credit', async () => {
  const p = { action: 'exchange', antiqueId: id('BLUE'), num: 2 };
  const absent = fake(); absent.state.antiques = [];
  assert.equal((await fixture(p, { state: absent.state })).draft.notes[0], 'EXACT_OWNED_ANTIQUE_REQUIRED');
  const cap = fake(); cap.state.antiques[0].star = 25;
  assert.equal((await fixture(p, { state: cap.state })).draft.notes[0], 'ANTIQUE_STAR_CAP_REACHED');
  const f = await fixture({ ...p, num: 101 }); assert.equal(f.draft.notes[0], 'ANTIQUE_MATERIALS_INSUFFICIENT');
  const cfg = config(), client = fake(); client.stock.set(id('BLUE') + '碎片', Number.MAX_SAFE_INTEGER);
  const facts = await surveyAntiqueGrowth(client, protocol, args(cfg, p));
  assert.equal(planAntiqueGrowth(facts, args(cfg, p)).notes[0], 'ANTIQUE_EXCHANGE_CREDIT_OVERFLOW');
});

test('suit wrong level, unrelated suit/master/antique changes and extra debit remain UNKNOWN after one dispatch', async () => {
  const effects = [
    c => c.state.suits[0].level++, c => c.state.suits.push(suitRow(9999)), c => c.state.masterLv++,
    c => c.state.antiques[0].star++, c => c.stock.set('普通材料', 4),
    c => c.state.suits.push({ ...suitRow(1002), effectiveNum: 7 }),
  ];
  for (const afterWrite of effects) {
    const f = await fixture({ action: 'suit', suitId: 1001 }, { afterWrite });
    assert.equal((await run(f)).status, 'UNKNOWN'); assert.equal(f.client.writes.length, 1);
  }
  const c = fake(); c.state.suits = [suitRow(1002)];
  const f = await fixture({ action: 'suit', suitId: 1001 }, { state: c.state, afterWrite: c => c.state.suits[0].effectiveNum++ });
  assert.equal((await run(f)).status, 'UNKNOWN');
});

test('master receipt alone, mismatched or default receipt, unexpected effects and missing debit cannot confirm', async () => {
  for (const options of [
    { apply: false, receipt: wire('AntiqueMasterLevelUpResponse', { masterLv: 2 }) },
    { receipt: wire('AntiqueMasterLevelUpResponse', { masterLv: 3 }) }, { receipt: wire('AntiqueMasterLevelUpResponse', {}) },
    { receipt: { masterLv: 2, reward: [] } }, { afterWrite: c => c.state.suits.push(suitRow()) },
    { afterWrite: c => c.stock.set('藏品大师经验', 100) }, { afterWrite: c => c.state.antiques[0].star++ },
  ]) {
    const f = await fixture({ action: 'master' }, options);
    assert.equal((await run(f)).status, 'UNKNOWN'); assert.equal(f.client.writes.length, 1);
  }
});

test('exchange under/over credit, wrong target/source debit, ownership drift and extra gains remain UNKNOWN', async () => {
  for (const afterWrite of [
    c => c.stock.set(id('BLUE') + '碎片', 101), c => c.stock.set(id('BLUE') + '碎片', 103),
    c => { c.stock.set(id('BLUE') + '碎片', 100); c.stock.set(id('PURPLE') + '碎片', 102); },
    c => c.stock.set(universal[0], 99), c => c.state.antiques[0].star++, c => c.state.masterLv++,
    c => c.stock.set('普通材料', 6),
  ]) {
    const f = await fixture({ action: 'exchange', antiqueId: id('BLUE'), num: 2 }, { afterWrite });
    assert.equal((await run(f)).status, 'UNKNOWN'); assert.equal(f.client.writes.length, 1);
  }
});

test('all advanced modes reject cloned, forged, expired, reconnected facts and changed config before write', async () => {
  for (const parameters of [{ action: 'suit', suitId: 1001 }, { action: 'master' }, { action: 'exchange', antiqueId: id('BLUE'), num: 2 }]) {
    const f = await fixture(parameters); assert.ok(f.operation);
    assert.equal(planAntiqueGrowth(structuredClone(f.before), args(f.cfg, parameters)).actions.length, 0);
    const now = Date.now; Date.now = () => now() + 30001;
    try { assert.equal(planAntiqueGrowth(f.before, args(f.cfg, parameters)).actions.length, 0); } finally { Date.now = now; }
    const copy = structuredClone(f.operation); copy.expectedState = {};
    const after = await surveyAntiqueGrowth(f.client, protocol, args(f.cfg, parameters));
    assert.equal(verifyAntiqueGrowth(copy, f.before, after, null).confirmed, false);
    f.client.factContext.connectionId = 'other';
    assert.equal(planAntiqueGrowth(f.before, args(f.cfg, parameters)).actions.length, 0);
    assert.equal((await run(f)).status, 'NOT_EXECUTED'); assert.equal(f.client.writes.length, 0);
  }
});

test('mode catalogs fail closed for contradictory joins, cost identities, missing cap rows and universal quality', async () => {
  const cases = [
    [{ action: 'suit', suitId: 1001 }, c => c.tables.AntiqueBaseCfg.data[0].suitId = 9999],
    [{ action: 'suit', suitId: 1001 }, c => c.tables.AntiqueSuitLvCfg.data[0].costArr[1][0] = '普通材料'],
    [{ action: 'suit', suitId: 1001 }, c => c.tables.AntiqueSuitLvCfg.data[0].maxLevel = 5],
    [{ action: 'master' }, c => c.tables.AntiqueMasterLvCfg.data[1].costArr = ['RUBY', 1]],
    [{ action: 'master' }, c => c.tables.AntiqueMasterLvCfg.data[0].costArr = ['藏品大师经验', 1]],
    [{ action: 'exchange', antiqueId: id('BLUE'), num: 2 }, c => c.tables.ItemCfg.data[0].quality = 'RED'],
    [{ action: 'exchange', antiqueId: id('BLUE'), num: 2 }, c => c.tables.AntiqueBaseCfg.data[0].universalItemId = universal[1]],
  ];
  for (const [p, mutate] of cases) assert.equal((await fixture(p, {}, mutate)).draft.notes[0], 'ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN');
});

test('fixed configuration supports every advanced branch and preserves recorded static source fingerprints', async () => {
  const tables = extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json', import.meta.url), 'utf8'))), cfg = { tables };
  const client = fake(); client.state.antiques = tables.AntiqueBaseCfg.data.map(row => ({ id: row.antiqueId, star: 1 }));
  for (const row of tables.AntiqueBaseCfg.data) client.stock.set(row.antiqueId + '碎片', 100);
  for (const p of [{ action: 'suit', suitId: 1001 }, { action: 'master' }, { action: 'exchange', antiqueId: '藏品蓝1', num: 1 }]) {
    const facts = await surveyAntiqueGrowth(client, protocol, args(cfg, p));
    assert.equal(planAntiqueGrowth(facts, args(cfg, p)).actions.length, 1);
  }
  assert.equal(ANTIQUE_GROWTH_EVIDENCE.antiqueMasterPop.byteOffset, 257076);
  assert.equal(ANTIQUE_GROWTH_EVIDENCE.fragExchangePop.sha256, 'cb98aefaca24d75fd3a5c0f9ea34909eedd3f81b3299eb257f627027b8324911');
});

test('confirmed exchange income cannot increase the original parent resource ceiling or reuse its antique claim', async () => {
  const p = { action: 'exchange', antiqueId: id('BLUE'), num: 2 }, f = await fixture(p);
  const fragmentId = id('BLUE') + '碎片', scope = { ...f.client.factContext, runId: 'exchange-parent-ceiling' };
  assert.equal(f.before.stock.get(fragmentId), 100);
  assert.deepEqual(f.operation.budgetClaims.resources, [{ id: universal[0], num: 2 }]);
  const limits = { resources: [{ id: universal[0], num: 4 }, { id: fragmentId, num: 100 }],
    quotas: [], uids: [{ type: 'antique', id: id('BLUE') }] };
  const parent = createRunBudgetContext({ scope, limits });
  const result = await executeBusinessOperation(f.client, protocol, f.operation, {
    ...args(f.cfg, p), adapter: antiqueGrowthModule, allowMutate: true,
    budget: { scope, batchId: 'exchange-income', limits: f.operation.budgetClaims, runBudget: parent },
  });
  assert.equal(result.status, 'SUCCESS'); assert.equal(f.client.stock.get(fragmentId), 102);
  assert.deepEqual(parent.snapshot().reserved.resources, [{ id: universal[0], num: 2 }]);
  assert.deepEqual(parent.snapshot().reserved.uids, [{ type: 'antique', id: id('BLUE') }]);
  const fresh = await surveyAntiqueGrowth(f.client, protocol, args(f.cfg, p));
  const spending = parent.child(fresh.stock, { scope, batchId: 'fresh-fragment-observation',
    limits: { resources: [{ id: fragmentId, num: 100 }], quotas: [], uids: [] } });
  assert.equal(spending.available(fragmentId), 100);
  assert.equal(spending.canReserve([{ id: fragmentId, num: 101 }]), false);
  assert.equal(spending.reserve([{ id: fragmentId, num: 101 }]), false);
  assert.throws(() => parent.child(fresh.stock, { scope, batchId: 'attempt-income-refill',
    limits: { resources: [{ id: fragmentId, num: 102 }], quotas: [], uids: [] } }), /超出父运行声明/);
  const duplicate = parent.child(fresh.stock, { scope, batchId: 'attempt-repeat-antique', limits: f.operation.budgetClaims });
  assert.equal(duplicate.canReserveClaims(f.operation.budgetClaims), false);
  assert.equal(f.client.writes.length, 1); parent.close('SUCCESS');
});
