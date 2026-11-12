import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  ANTIQUE_GROWTH_EVIDENCE, antiqueGrowthDependencyVersions, antiqueGrowthModule, parseAntiqueOwnership,
  planAntiqueGrowth, surveyAntiqueGrowth, validateAntiqueGrowthConfig, validateAntiqueGrowthParameters,
  verifyAntiqueGrowth, viewAntiqueGrowth,
} from '../src/antique-growth.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { extractTables } from '../src/config.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';

const protocol = loadProtocol();
const wire = (type, value) => protocol[type].decode(protocol[type].encode(value).finish());
const target = '测试蓝藏品', purple = '测试紫藏品', other = '测试橙古董';
const player = { playerId: '17', worldId: '9', level: 10 };
const params = { action: 'activate', antiqueId: target };
const config = () => ({ tables: {
  ModuleOpenCfg: { revision: 1, data: [{ moduleId: '藏品', playerLevel: 10 }] },
  AntiqueBaseCfg: { revision: 1, data: [
    { antiqueId: target, color: 'BLUE', activeFrag: 10, showName: '蓝藏品' },
    { antiqueId: purple, color: 'PURPLE', activeFrag: 20, showName: '紫藏品' },
    { antiqueId: other, color: 'ORANGE', activeFrag: 50, showName: '古董' },
  ] },
  AntiqueStarCfg: { revision: 1, data: Array.from({ length: 25 }, (_, index) => ({
    star: index + 1, consumeBlue: index + 2, consumePur: index + 3, consumeOra: index + 4, consumeRed: index + 10,
  })) },
  AntiqueSuitCfg: { revision: 1, data: [
    { suitId: 1001, taskType: '拥有藏品', taskParam1: '紫' },
    { suitId: 1002, taskType: '拾荒获取', taskParam1: '' },
  ] },
} });
function fake({ action = 'activate', targetId = target, effect = 'apply', afterWrite, onRead } = {}) {
  const state = {
    antiques: [...(action === 'star' ? [{ id: targetId, star: 0 }] : []), { id: other, star: 2 }],
    suits: [{ id: 1001, level: 1, effectiveNum: 2, advEffectValue: 0 }, { id: 1002, level: 1, effectiveNum: 3, advEffectValue: 1.5 }],
    masterLv: 0,
  };
  const stock = new Map([[target + '碎片', 40], [purple + '碎片', 40], [other + '碎片', 80], ['蓝藏万能碎片', 100], ['普通材料', 5]]);
  const client = {
    connected: true, pending: [], watchers: [], uncertainWrites: new Set(), lateResponses: new Map(),
    factContext: { accountId: 'antique-account', generation: 3, connectionId: 'antique-connection' },
    state, stock, resources: [{ res: 3, amount: 500 }], reads: [], writes: [], confirmed: [],
    markUnverifiedWrite(name, body) { this.uncertainWrites.add(JSON.stringify([name, body])); },
    confirmWatchedWrite(name, body) { this.confirmed.push(name); this.uncertainWrites.delete(JSON.stringify([name, body])); },
    async request(name, body, response, _timeout, options = {}) {
      assert.deepEqual(body, {});
      assert.equal(options.mutate, undefined);
      this.reads.push(name);
      onRead?.(name, this);
      return wire(response, {
        AllAntiqueRequest: this.state,
        AllItemRequest: { items: [...this.stock].map(([itemId, num]) => ({ itemId, num })) },
        AllResourceRequest: { list: this.resources },
      }[name]);
    },
    async sendWatch(name, body, { beforeDispatch }) {
      beforeDispatch?.();
      assert.deepEqual(toSnapshotJson(wire(name, body)), body);
      assert.equal(name, action === 'activate' ? 'ActivateAntiqueRequest' : 'AntiqueStarUpRequest');
      this.writes.push({ name, body: structuredClone(body) });
      if (effect === 'apply') {
        const row = this.state.antiques.find(row => row.id === body.id);
        if (action === 'activate') this.state.antiques.push({ id: body.id, star: 0 });
        else row.star++;
        const num = action === 'activate' ? (body.id === purple ? 20 : 10) : (body.id === purple ? 3 : 2);
        this.stock.set(body.id + '碎片', this.stock.get(body.id + '碎片') - num);
      }
      afterWrite?.(this);
      this.markUnverifiedWrite(name, body);
      return { status: 'UNKNOWN' };
    },
  };
  return client;
}
const options = (cfg, parameters = params, extra = {}) => ({ config: cfg, parameters, player, moduleConfig: { enabled: true }, ...extra });
const survey = (client, cfg, parameters = params, extra) => surveyAntiqueGrowth(client, protocol, options(cfg, parameters, extra));
const plan = (facts, cfg, parameters = params, extra) => planAntiqueGrowth(facts, options(cfg, parameters, extra));
async function prepare(input = {}) {
  const cfg = config(), client = fake(input), parameters = { action: input.action ?? 'activate', antiqueId: input.targetId ?? target };
  const before = await survey(client, cfg, parameters), [operation] = plan(before, cfg, parameters).actions;
  assert.ok(operation, JSON.stringify(plan(before, cfg, parameters).notes));
  return { cfg, client, parameters, before, operation };
}
function budget(fixture) {
  const scope = { ...fixture.client.factContext, runId: 'antique-run' };
  return { scope, batchId: 'antique-batch', limits: fixture.operation.budgetClaims,
    runBudget: createRunBudgetContext({ scope, limits: fixture.operation.budgetClaims }) };
}
const run = (fixture, extra = {}) => executeBusinessOperation(fixture.client, protocol, fixture.operation, {
  ...options(fixture.cfg, fixture.parameters), adapter: antiqueGrowthModule,
  allowMutate: true, budget: budget(fixture), ...extra,
});

test('activation and one-star branches bind exact material/entity/wire contracts and mode-specific dependencies', async () => {
  for (const action of ['activate', 'star']) {
    const f = await prepare({ action }), { operation } = f;
    assert.deepEqual(operation.action, { request: action === 'activate' ? 'ActivateAntiqueRequest' : 'AntiqueStarUpRequest', response: null, body: { id: target, ...(action === 'star' ? { universal: false } : {}) } });
    assert.deepEqual(operation.costs, [{ id: target + '碎片', num: action === 'activate' ? 10 : 2 }]);
    assert.deepEqual(operation.budgetClaims, { resources: operation.costs, quotas: [], uids: [{ type: 'antique', id: target }] });
    assert.deepEqual(operation.expectedState, { antique: { id: target, star: action === 'activate' ? 0 : 1 } });
    assert.equal(operation.capabilityId, 'PRO-007');
    assert.deepEqual(Object.keys(antiqueGrowthDependencyVersions(options(f.cfg, f.parameters))), [
      'moduleConfig', 'config.ModuleOpenCfg', 'config.AntiqueBaseCfg', action === 'activate' ? 'config.AntiqueSuitCfg' : 'config.AntiqueStarCfg',
    ]);
    assert.equal(protocol[operation.action.request.replace('Request', 'Response')], undefined);
    assert.equal(f.client.writes.length, 0);
    assert.equal(plan(f.before, f.cfg, f.parameters, { selections: ['wrong'] }).actions.length, 0);
  }
});

test('fresh complete response row order cannot change the exact authorized action identity', async () => {
  const cfg = config(), client = fake();
  client.state.antiques.push({ id: purple, star: 1 });
  client.resources.push({ res: 1, amount: 20 });
  const before = await survey(client, cfg), [operation] = plan(before, cfg).actions;
  client.state.antiques.reverse();
  client.state.suits.reverse();
  client.stock = new Map([...client.stock].reverse());
  client.resources.reverse();
  const after = await survey(client, cfg), [replanned] = plan(after, cfg).actions;
  assert.deepEqual(replanned.identity, operation.identity);
  assert.equal(replanned.actionId, operation.actionId);
  assert.equal(client.writes.length, 0);
});

test('parameter/config validation accepts explicit semantic selectors only and omitted action cannot plan', async () => {
  assert.deepEqual(validateAntiqueGrowthConfig({}), { enabled: false });
  for (const bad of [null, [], new Date(), { enabled: 1 }, { enabled: true, auto: true }, Object.create({ enabled: true })]) assert.throws(() => validateAntiqueGrowthConfig(bad));
  for (const bad of [null, [], new Date(), { action: 'exchange' }, { antiqueId: 1 }, { antiqueId: ' x' }, { action: 'star', universal: true }, { request: 'ActivateAntiqueRequest' }, Object.create({ antiqueId: target })]) assert.throws(() => validateAntiqueGrowthParameters(bad), { code: 'INVALID_PARAMETERS' });
  const f = await prepare();
  const draft = await survey(f.client, f.cfg, {});
  assert.equal(plan(draft, f.cfg, {}).actions.length, 0);
  assert.equal(plan(draft, f.cfg, {}).notes[0], 'EXPLICIT_ANTIQUE_AND_ACTION_REQUIRED');
  const view = viewAntiqueGrowth(draft, options(f.cfg, {}));
  assert.equal(view.antiques.length, 3);
  assert.equal(view.candidates.length, 0);
});

test('public domain view enumerates current exact candidates and omits private plan evidence', async () => {
  const cfg = config(), client = fake(), parameters = { action: 'activate' };
  const facts = await survey(client, cfg, parameters), view = viewAntiqueGrowth(facts, options(cfg, parameters));
  assert.deepEqual(view.candidates.map(row => row.target.antiqueId), [target, purple]);
  for (const row of view.candidates) {
    assert.ok(row.action);
    assert.equal(row.executable, true);
    assert.equal(row.identity, undefined);
    assert.equal(row.configEvidence, undefined);
    assert.equal(row.parameters.antiqueId, row.target.antiqueId);
  }
  assert.deepEqual(view.antiques.find(row => row.antiqueId === other), { antiqueId: other, name: '古董', color: 'ORANGE', owned: true, star: 2, fragmentId: other + '碎片', fragments: 80 });
});

test('ownership parser distinguishes wire zero from missing scalar defaults and rejects ambiguous complete pools', () => {
  const body = { antiques: [{ id: target, star: 0 }], suits: [], masterLv: 0 };
  assert.deepEqual(parseAntiqueOwnership(wire('AllAntiqueResponse', body)), body);
  const missingStar = wire('AllAntiqueResponse', { ...body, antiques: [{ id: target }] });
  assert.equal(missingStar.antiques[0].star, 0);
  assert.equal(parseAntiqueOwnership(missingStar), null);
  for (const value of [
    { ...body, antiques: [body.antiques[0], body.antiques[0]] },
    { ...body, antiques: [{ id: target, star: -1 }] },
    { ...body, antiques: Array(1) },
    { ...body, suits: [{ id: 1001, level: 1 }] },
    { ...body, suits: [{ id: 1001, level: 1, effectiveNum: 1, advEffectValue: NaN }] },
    { ...body, suits: Array(1) }, { ...body, masterLv: undefined },
    Object.create(body),
  ]) assert.equal(parseAntiqueOwnership(value), null);
});

test('preflight refuses disabled, locked, inactive star, duplicate configuration, malformed scope and insufficient stock', async () => {
  async function blocked(change, expected, parameters = params, overrides = {}) {
    const cfg = config(), client = fake();
    change?.(client, cfg);
    const facts = await survey(client, cfg, parameters, overrides);
    assert.deepEqual(plan(facts, cfg, parameters, overrides).notes, [expected]);
    assert.equal(client.writes.length, 0);
  }
  await blocked(null, 'ANTIQUE_GROWTH_MODULE_DISABLED', params, { moduleConfig: { enabled: false } });
  await blocked(null, 'ANTIQUE_MODULE_LEVEL_LOCKED', params, { player: { ...player, level: 9 } });
  await blocked(null, 'ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN', params, { player: { ...player, level: undefined } });
  await blocked(null, 'EXACT_OWNED_ANTIQUE_REQUIRED', { ...params, action: 'star' });
  await blocked((client) => client.state.antiques.push({ id: target, star: 0 }), 'ANTIQUE_ALREADY_ACTIVE');
  await blocked((client) => client.stock.set(target + '碎片', 9), 'ANTIQUE_OWNED_FRAGMENTS_INSUFFICIENT');
  await blocked((_, cfg) => cfg.tables.ModuleOpenCfg.data.push({ moduleId: '藏品', playerLevel: 10 }), 'ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  await blocked((_, cfg) => cfg.tables.AntiqueBaseCfg.data[0].color = 'UNKNOWN', 'ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  await blocked((_, cfg) => cfg.tables.AntiqueSuitCfg.data[0].taskParam1 = '未知', 'ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN');
});

test('catalog caps and every quality branch use the exact next table row', async () => {
  for (const [color, field] of [['BLUE', 'consumeBlue'], ['PURPLE', 'consumePur'], ['ORANGE', 'consumeOra'], ['RED', 'consumeRed']]) {
    const cfg = config(), client = fake({ action: 'star' }), parameters = { action: 'star', antiqueId: target };
    cfg.tables.AntiqueBaseCfg.data[0].color = color;
    const facts = await survey(client, cfg, parameters), [operation] = plan(facts, cfg, parameters).actions;
    assert.equal(operation.costs[0].num, cfg.tables.AntiqueStarCfg.data[0][field]);
    client.state.antiques.find(row => row.id === target).star = 25;
    assert.deepEqual(plan(await survey(client, cfg, parameters), cfg, parameters).notes, ['ANTIQUE_STAR_CAP_REACHED']);
  }
  const cfg = config(), client = fake({ action: 'star' });
  cfg.tables.AntiqueStarCfg.data.splice(1, 1);
  const parameters = { action: 'star', antiqueId: target };
  assert.equal(plan(await survey(client, cfg, parameters), cfg, parameters).actions.length, 0);
});

test('private live provenance rejects serialized, mutated, cross-account and stale source facts', async () => {
  const f = await prepare();
  assert.equal(plan(structuredClone(f.before), f.cfg).actions.length, 0);
  const old = f.before.sourceFacts.antiques.provenance.sourceAt;
  f.before.sourceFacts.antiques.provenance.sourceAt = old + 1;
  assert.equal(plan(f.before, f.cfg).actions.length, 0);
  f.before.sourceFacts.antiques.provenance.sourceAt = old;
  assert.equal(plan(f.before, f.cfg).actions.length, 1);
  for (const [key, value] of [['accountId', 'other'], ['connectionId', 'new'], ['generation', 4]]) {
    const previous = f.client.factContext[key];
    f.client.factContext[key] = value;
    assert.equal(plan(f.before, f.cfg).actions.length, 0);
    f.client.factContext[key] = previous;
  }
  const expired = await prepare();
  expired.before.sourceFacts.items.provenance.sourceAt -= 30001;
  assert.equal(plan(expired.before, expired.cfg).actions.length, 0);
});

test('slow sibling responses cannot renew the completed antique source', async t => {
  let wall = 100000;
  t.mock.method(Date, 'now', () => wall);
  let finishItems, finishResources;
  const cfg = config(), client = fake();
  client.request = async name => {
    if (name === 'AllAntiqueRequest') return wire('AllAntiqueResponse', client.state);
    if (name === 'AllItemRequest') return new Promise(resolve => { finishItems = () => resolve(wire('AllItemResponse', { items: [...client.stock].map(([itemId, num]) => ({ itemId, num })) })); });
    return new Promise(resolve => { finishResources = () => resolve(wire('AllResourceResponse', { list: client.resources })); });
  };
  const pending = survey(client, cfg);
  await new Promise(resolve => setImmediate(resolve));
  wall += 30001;
  finishItems(); finishResources();
  const facts = await pending;
  assert.equal(facts.sourceFacts.antiques.provenance.sourceAt, 100000);
  assert.equal(facts.sourceFacts.items.provenance.sourceAt, 130001);
  assert.equal(plan(facts, cfg).actions.length, 0);
});

test('real shared executor confirms activation/star from complete reread after an unknown watch', async () => {
  for (const action of ['activate', 'star']) {
    const f = await prepare({ action }), result = await run(f);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.requestStatus, 'UNKNOWN');
    assert.equal(result.verification.status, 'CONFIRMED');
    assert.deepEqual(result.afterState.antique, { id: target, star: action === 'activate' ? 0 : 1 });
    assert.equal(f.client.writes.length, 1);
    assert.equal(f.client.confirmed.length, 1);
    assert.equal(f.client.uncertainWrites.size, 0);
  }
});

test('only existing owning-purple suite derived values may change on purple activation', async () => {
  const f = await prepare({ targetId: purple, afterWrite(client) {
    const suit = client.state.suits.find(row => row.id === 1001);
    suit.effectiveNum = 3; suit.advEffectValue = 1;
  } });
  assert.deepEqual(f.operation.allowedDerivedSuitIds, [1001]);
  const result = await run(f);
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(result.afterState.suits[0], { id: 1001, level: 1, effectiveNum: 3, advEffectValue: 1 });
  assert.equal(result.responseEvidence.derivedSuitValues, 'SERVER_OBSERVED_ONLY');
});

test('wrong effect, unrelated pool/suite/master changes, new suit and wrong debit remain UNKNOWN without retry', async () => {
  const changes = [
    client => client.state.antiques.find(row => row.id === target).star = 2,
    client => client.state.antiques.find(row => row.id === other).star++,
    client => client.state.suits[0].level++,
    client => client.state.suits[1].effectiveNum++,
    client => client.state.suits.push({ id: 9999, level: 0, effectiveNum: 0, advEffectValue: 0 }),
    client => client.state.masterLv++,
    client => client.stock.set('蓝藏万能碎片', 99),
    client => client.stock.set(target + '碎片', 31),
    client => client.resources[0].amount--,
  ];
  for (const afterWrite of changes) {
    const f = await prepare({ afterWrite }), result = await run(f);
    assert.equal(result.status, 'UNKNOWN', afterWrite.toString());
    assert.equal(result.verification.status, 'UNCONFIRMED');
    assert.equal(f.client.uncertainWrites.size, 1);
    assert.equal((await run(f)).status, 'NOT_EXECUTED');
    assert.equal(f.client.writes.length, 1);
  }
  const none = await prepare({ effect: 'none' });
  assert.equal((await run(none)).status, 'UNKNOWN');
});

test('purple activation does not allow new suit identities or suit level changes, and STAR permits no derived suit drift', async () => {
  for (const input of [
    { targetId: purple, afterWrite(client) { client.state.suits[0].level++; } },
    { targetId: purple, afterWrite(client) { client.state.suits.push({ id: 9999, level: 1, effectiveNum: 0, advEffectValue: 0 }); } },
    { targetId: purple, afterWrite(client) { client.state.suits[1].advEffectValue++; } },
    { action: 'star', targetId: purple, afterWrite(client) { client.state.suits[0].effectiveNum++; } },
  ]) {
    const f = await prepare(input);
    assert.equal((await run(f)).status, 'UNKNOWN');
  }
});

test('candidate tampering and a named response cannot bypass complete contract verification', async () => {
  const f = await prepare();
  await f.client.sendWatch(f.operation.action.request, f.operation.action.body, {});
  const after = await survey(f.client, f.cfg);
  assert.equal(verifyAntiqueGrowth(f.operation, f.before, after, {}).confirmed, false);
  for (const parameters of [null, [], { action: 'unknown' }, { antiqueId: 1 }, { ...params, universal: true }]) {
    assert.equal(verifyAntiqueGrowth({ ...f.operation, parameters }, f.before, after).confirmed, false);
  }
  for (const change of [
    row => row.costs[0].num++,
    row => row.action.body.universal = true,
    row => row.expectedState.antique.star++,
    row => row.budgetClaims.uids[0].id = 'other',
    row => row.allowedDerivedSuitIds.push(1002),
  ]) {
    const op = structuredClone(f.operation); change(op);
    assert.equal(verifyAntiqueGrowth(op, f.before, after).confirmed, false);
  }
});

test('fixed local configuration provides the exact level10 gate, 25-star cap and first owned costs', async () => {
  const cfg = { tables: extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json', import.meta.url), 'utf8'))) };
  const antiqueId = '藏品蓝1', parameters = { action: 'activate', antiqueId }, client = fake();
  client.stock.set(antiqueId + '碎片', 20);
  const before = await survey(client, cfg, parameters), [activation] = plan(before, cfg, parameters).actions;
  assert.equal(activation.costs[0].num, 10);
  assert.equal(before.catalog.playerLevel, 10);
  client.state.antiques.push({ id: antiqueId, star: 0 });
  const stars = { action: 'star', antiqueId }, grown = await survey(client, cfg, stars);
  assert.equal(plan(grown, cfg, stars).actions[0].costs[0].num, 2);
  assert.equal(grown.catalog.stars.at(-1).star, 25);
  assert.equal(ANTIQUE_GROWTH_EVIDENCE.realGame, 'REAL_UNVERIFIED');
  assert.equal(ANTIQUE_GROWTH_EVIDENCE.antiqueItem.requestByteOffset, 256578);
});
