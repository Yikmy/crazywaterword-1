import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  BADGE_GROWTH_DEFAULT_CONFIG, BADGE_GROWTH_EVIDENCE, BADGE_STAR_EVIDENCE, badgeGrowthModule, badgeGrowthDependencyVersions,
  parseBadgeOwnership, planBadgeGrowth, surveyBadgeGrowth, validateBadgeGrowthConfig,
  validateBadgeGrowthParameters, verifyBadgeGrowth, viewBadgeGrowth,
} from '../src/badge-growth.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { extractTables } from '../src/config.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';

const protocol = loadProtocol();
const wire = (type, body) => protocol[type].decode(protocol[type].encode(body).finish());
const uid = '9007199254740993', otherUid = '9007199254740994', idleUid = '9007199254740995';
const xpItem = '徽章经验', params = { heroId: 'A', uid };
const player = { id: '17', worldId: '9' };
const attr = () => ({ attr: 1, value: 1.5, rating: 2 });
const badge = (uid, extra = {}) => ({ uid, badgeId: '蓝法师徽章', level: 1, exp: 0, star: 0, attr: attr(), ...extra });
const mirror = ({ exp, ...rest }, pos = 1) => ({ ...structuredClone(rest), pos });
const hero = (heroId, worn) => ({ heroId, level: 20, star: 3, power: '9007199254741001', attributes: [{ attr: 1, value: 4 }], skillLevels: [1, 2], badges: [mirror(worn)] });
const cfg = () => ({ tables: {
  HeroCfg: { revision: 1, data: ['A', 'B'].map(id => ({ id, type: '英雄', career: '法师' })) },
  HeroBadgeCfg: { revision: 1, data: [{ id: '蓝法师徽章', career: '法师' }] },
  HeroBadgeAttrCfg: { revision: 1, data: [{ id: '蓝法师徽章', star: 0, maxLevel: 4 }] },
  HeroBadgeLevelCfg: { revision: 1, data: [
    { level: 1, exp: 0, goldExpRadio: 0 }, { level: 2, exp: 5, goldExpRadio: 20 },
    { level: 3, exp: 7, goldExpRadio: 25 }, { level: 4, exp: 10, goldExpRadio: 30 },
  ] },
  HeroBadgeUnlockCfg: { revision: 1, data: [1, 70, 90, 110].map((level, index) => ({ pos: index + 1, level })) },
} });
const expectedAction = { request: 'EnhanceBadgeRequest', response: 'EnhanceBadgeResponse', body: { uid, decomposeUid: [], expItemNum: 5 } };
const costs = [{ id: xpItem, num: 5 }, { id: 'GOLD', num: 100 }];
const options = (config = cfg(), extra = {}) => ({ config, parameters: params, player, moduleConfig: { enabled: true }, ...extra });

function fake({ wireMode = false, apply = true, response = {}, afterWrite, onWrite, star = false } = {}) {
  const pool = [badge(uid), badge(otherUid, { exp: 1 }), badge(idleUid, { attr: undefined })];
  delete pool[2].attr;
  if(star) for(const row of pool) row.badgeId='红法师徽章';
  const client = {
    connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Map(),
    factContext: { accountId: 'badge-account', generation: 3, connectionId: 'badge-connection' },
    pool, heroes: [hero('A', pool[0]), hero('B', pool[1])], stock: new Map([[xpItem, 25], ['GOLD', 500], ['其他', 1]]), reads: [], writes: [],
    ...(star ? {stock:new Map([['徽章升星石',32],['GOLD',10000000],[xpItem,25],['其他',1]])} : {}),
    markUnverifiedWrite(name, body) { this.uncertainWrites.set(JSON.stringify({ name, body }), true); },
    confirmWatchedWrite(name, body) { this.uncertainWrites.delete(JSON.stringify({ name, body })); },
    async request(name, body, reply, _timeout, options = {}) {
      if (options.mutate) {
        options.beforeDispatch?.();
        assert.equal(name, star ? 'BadgeStarRequest' : expectedAction.request);
        assert.equal(reply, star ? 'BadgeStarResponse' : expectedAction.response);
        if (wireMode) assert.deepEqual(toSnapshotJson(wire(name, body)), body);
        this.writes.push({ name, body: structuredClone(body) });
        if (apply) {
          const target = this.pool.find(row => row.uid === body.uid);
          const owner = this.heroes.find(row => row.badges.some(item => item.uid === body.uid));
          const nextGoldRatio = target.level === 1 ? 20 : 25;
          if(star){target.star++;const worn=owner.badges.find(row=>row.uid===body.uid);worn.star++;target.attr.value++;worn.attr.value++;}
          else {target.level++;owner.badges.find(row => row.uid === body.uid).level++;}
          owner.power = (BigInt(owner.power) + 6n).toString();
          owner.attributes[0].value++;
          if(star){this.stock.set('徽章升星石',this.stock.get('徽章升星石')-body.starItemNum);this.stock.set('GOLD',this.stock.get('GOLD')-500000*body.starItemNum);}
          else {this.stock.set(xpItem, this.stock.get(xpItem) - body.expItemNum);this.stock.set('GOLD', this.stock.get('GOLD') - body.expItemNum * nextGoldRatio);}
        }
        afterWrite?.(this);
        if (onWrite) return onWrite();
        return wireMode ? wire(reply, response) : structuredClone(response);
      }
      this.reads.push(name);
      const value = {
        BadgesRequest: () => ({ badge: this.pool }),
        AllHeroRequest: () => ({ heroes: this.heroes }),
        AllItemRequest: () => ({ items: [...this.stock].filter(([id]) => id !== 'GOLD').map(([itemId, num]) => ({ itemId, num })) }),
        AllResourceRequest: () => ({ list: [{ res: 3, amount: this.stock.get('GOLD') }] }),
      }[name]?.();
      assert.ok(value, 'unexpected read ' + name);
      return wireMode ? wire(reply, value) : structuredClone(value);
    },
  };
  return client;
}

const survey = (client, config, extra) => surveyBadgeGrowth(client, protocol, options(config, extra));
const plan = (facts, config, extra) => planBadgeGrowth(facts, options(config, extra));

async function prepared(input, config = cfg()) {
  const client = fake(input), before = await survey(client, config);
  const [operation] = plan(before, config).actions;
  assert.ok(operation, JSON.stringify(viewBadgeGrowth(before, options(config)).blocked));
  return { client, config, before, operation };
}

function makeBudget(operation, { limits = operation.budgetClaims } = {}) {
  const scope = { ...fake().factContext, runId: 'badge-run' };
  return { scope, runBudget: createRunBudgetContext({ scope, limits }), batchId: 'badge-batch', limits: operation.budgetClaims, ledger: null };
}

const run = ({ client, config, operation }, extra = {}) => executeBusinessOperation(client, protocol, operation, {
  ...options(config), adapter: badgeGrowthModule, allowMutate: true, budget: makeBudget(operation), ...extra,
});

test('C228 adapter defaults disabled and accepts only explicit draft hero and exact positive UID', () => {
  assert.deepEqual(BADGE_GROWTH_DEFAULT_CONFIG, { enabled: false });
  assert.equal(BADGE_GROWTH_EVIDENCE.realGame, 'REAL_UNVERIFIED');
  assert.deepEqual(badgeGrowthModule.capabilities, ['C228']);
  assert.equal(badgeGrowthModule.execute, undefined);
  assert.deepEqual(validateBadgeGrowthParameters(params), params);
  for (const bad of [
    { uid: '01' }, { uid: '0' }, { uid: '9223372036854775808' }, { uid: 42 },
    { heroId: ' A' }, { pos: 1 }, { action: 'replace' }, { request: 'EnhanceBadgeRequest' },
    { body: {} }, { decomposeUid: [idleUid] }, { expItemNum: 5 }, { goldNum: 100 }, { costs },
    Object.create({ uid }), Object.defineProperty({}, 'heroId', { enumerable: true, get() { throw Error('accessor'); } }),
  ]) assert.throws(() => validateBadgeGrowthParameters(bad), { code: 'INVALID_PARAMETERS' });
  for (const bad of [{ enabled: 'yes' }, { enabled: true, sacrifice: true }]) assert.throws(() => validateBadgeGrowthConfig(bad), { code: 'INVALID_PARAMETERS' });
});

test('worn badge mirror matches pool projection with no invented XP; codec preserves exact UID and empty sacrifice list', () => {
  const client = fake();
  const rawBadges = wire('BadgesResponse', { badge: client.pool }), rawHeroes = wire('AllHeroResponse', { heroes: client.heroes });
  const ownership = parseBadgeOwnership(rawBadges, rawHeroes);
  assert.ok(ownership);
  assert.equal(ownership.pool[0].exp, 0);
  assert.equal(ownership.heroes[0].badges[0].uid, uid);
  assert.equal(Object.hasOwn(ownership.heroes[0].badges[0], 'exp'), false);
  assert.deepEqual(toSnapshotJson(wire(expectedAction.request, expectedAction.body)), expectedAction.body);
  const Writer = createRequire(import.meta.url)('protobufjs/minimal').Writer;
  const missingExp = Writer.create().uint32(8).int64(uid).uint32(18).string(client.pool[0].badgeId)
    .uint32(24).int32(1).uint32(40).int32(0).finish();
  assert.throws(() => protocol.DispBadge.decode(missingExp), /missing required 'exp'/);
});

test('survey reads each independent authority only and plan binds one slot, exact two costs, and one badge claim', async () => {
  const { client, config, before, operation } = await prepared({ wireMode: true });
  assert.deepEqual(client.reads.sort(), ['AllHeroRequest', 'AllItemRequest', 'AllResourceRequest', 'BadgesRequest'].sort());
  assert.equal(client.writes.length, 0);
  assert.deepEqual(operation.action, expectedAction);
  assert.equal(operation.actionType, 'LEVEL');
  assert.deepEqual(operation.target, { ...params, pos: 1 });
  assert.deepEqual(operation.costs, costs);
  assert.deepEqual(operation.budgetClaims, { resources: costs, quotas: [], uids: [{ type: 'badge', id: uid }] });
  assert.deepEqual(operation.expectedState, { ...params, pos: 1, badgeId: '蓝法师徽章', level: 2, star: 0, exp: 0 });
  const noActions = extra => assert.equal(plan(before, config, extra).actions.length, 0);
  noActions({ parameters: {} });
  noActions({ parameters: { heroId: 'B', uid } });
  noActions({ parameters: { heroId: 'A', uid: idleUid } });
  noActions({ moduleConfig: BADGE_GROWTH_DEFAULT_CONFIG });
  noActions({ selections: ['other-action'] });
  assert.deepEqual(Object.keys(badgeGrowthDependencyVersions(options(config))).sort(), badgeGrowthModule.dependencyKeys.filter(key => !['config.ModuleOpenCfg','config.HeroBadgeStarCfg'].includes(key)).sort());
  const view = viewBadgeGrowth(before, options(config));
  assert.equal(view.candidates.length, 1);
  assert.equal(view.candidates[0].executable, true);
  for (const key of ['identity', 'configEvidence']) assert.equal(Object.hasOwn(view.candidates[0], key), false);
  assert.deepEqual(view.candidates[0].action, expectedAction);
  assert.equal(Object.hasOwn(viewBadgeGrowth(before, options(config, { moduleConfig: { enabled: false } })).candidates[0], 'action'), false);
  assert.deepEqual(view.candidates[0].beforeState, { badge: operation.beforeState.badge });
});

test('partial XP, cap landing, locked slot, wrong career and either missing resource block before writing', async () => {
  for (const change of [
    ({ client }) => client.pool[0].exp++,
    ({ client }) => { client.pool[0].level = 3; client.heroes[0].badges[0].level = 3; },
    ({ client }) => client.heroes[0].badges[0].pos++,
    ({ config }) => config.tables.HeroCfg.data[0].career = '射手',
    ({ config }) => config.tables.HeroCfg.data[0].type = '助战',
    ({ config }) => config.tables.HeroBadgeAttrCfg.data[0].maxLevel = 2,
    ({ config }) => config.tables.HeroBadgeLevelCfg.data[1].goldExpRadio = 0,
    ({ config }) => config.tables.HeroBadgeLevelCfg.data[1].exp = 2147483648,
    ({ config }) => config.tables.HeroBadgeLevelCfg.data[1].exp = 1.5,
    ({ config }) => config.tables.HeroBadgeLevelCfg.data[1].exp = config.tables.HeroBadgeLevelCfg.data[1].goldExpRadio = 2147483647,
    ({ config }) => config.tables.HeroBadgeLevelCfg.data.push(structuredClone(config.tables.HeroBadgeLevelCfg.data[1])),
    ({ config }) => config.tables.HeroBadgeUnlockCfg.data.pop(),
    ({ client }) => client.stock.set(xpItem, 4),
    ({ client }) => client.stock.set('GOLD', 99),
  ]) {
    const client = fake(), config = cfg();
    change({ client, config });
    assert.equal(plan(await survey(client, config), config).actions.length, 0);
    assert.equal(client.writes.length, 0);
  }
});

test('missing or conflicting pool/mirrors and malformed derived hero state fail closed', async () => {
  for (const change of [
    c => c.pool.shift(), c => c.pool[0].level++, c => c.pool.push(structuredClone(c.pool[0])),
    c => delete c.pool[0].exp, c => delete c.heroes[0].badges,
    c => c.heroes[0].badges.push(mirror(c.pool[2])),
    c => c.heroes[1].badges.push(mirror(c.pool[0], 2)),
    c => c.heroes[0].badges[0].pos = 5, c => c.heroes[0].badges[0].attr.value++,
    c => c.heroes[0].badges[0].uid = 9007199254740992,
    c => delete c.heroes[0].attributes, c => c.heroes[0].attributes.push({ attr: 1, value: 2 }),
    c => c.heroes[0].attributes[0].value = Infinity,
  ]) {
    const client = fake();
    change(client);
    assert.equal(plan(await survey(client)).actions.length, 0);
    assert.equal(client.writes.length, 0);
  }
});

test('account, generation, connection, full provenance and earlier read completion remain binding', async () => {
  const { before, config } = await prepared();
  for (const mutate of [
    f => f.sourceFacts.badges.provenance.sourceAt -= 31000,
    f => f.sourceFacts.items.provenance.sourceAt += 60000,
    f => f.sourceFacts.heroes.provenance.scope = { kind: 'CURRENT_RESPONSE_ONLY', key: 'hero' },
    f => f.sourceFacts.resources.provenance.accountId = 'other',
    f => f.sourceFacts.badges.provenance.generation++,
    f => f.sourceFacts.badges.provenance.source = 'SCUpdateBadge',
    f => f.ownership.pool[0].exp++,
    f => f.inputs.badges.badge[0].exp++,
    f => f.stock.set(xpItem, 999),
    f => delete f.identityContext.connectionId,
  ]) {
    const facts = structuredClone(before);
    mutate(facts);
    assert.equal(plan(facts, config).actions.length, 0);
  }
  const realNow = Date.now;
  let now = 1000000;
  Date.now = () => now;
  try {
    const client = fake(), read = client.request.bind(client);
    client.request = async (name, ...args) => {
      if (name === 'AllResourceRequest') { await new Promise(setImmediate); now += 31000; }
      return read(name, ...args);
    };
    const facts = await survey(client, config);
    assert.equal(facts.sourceFacts.badges.provenance.sourceAt, 1000000);
    assert.equal(facts.sourceFacts.resources.provenance.sourceAt, 1031000);
    assert.equal(plan(facts, config).actions.length, 0);
  } finally { Date.now = realNow; }
});

for (const wireMode of [false, true]) test('shared typed execution confirms exact effect and debit with codec ' + wireMode, async () => {
  const preparedOperation = await prepared({ wireMode, response: { material: { asset: [] } } });
  const stages = [];
  const result = await run(preparedOperation, { onStage(stage) { stages.push(stage); } });
  assert.equal(result.status, 'SUCCESS', JSON.stringify(result));
  assert.deepEqual(stages, ['SURVEY', 'RESOURCE_PREFLIGHT', 'DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'VERIFY', 'VERIFIED']);
  const { client } = preparedOperation;
  assert.deepEqual(client.writes, [{ name: expectedAction.request, body: expectedAction.body }]);
  assert.equal(client.pool[0].level, 2);
  assert.equal(client.pool[0].exp, 0);
  assert.equal(client.heroes[0].badges[0].level, 2);
  assert.equal(client.stock.get(xpItem), 20);
  assert.equal(client.stock.get('GOLD'), 400);
  assert.deepEqual(result.responseEvidence, { material: 'NONE' });
  assert.equal(client.uncertainWrites.size, 0);
});

test('typed response alone, material or wrong badge/slot/stock transitions remain UNKNOWN with no replay', async () => {
  for (const input of [
    { apply: false },
    { response: { material: { asset: [{ num: 1 }] } } },
    { response: { material: {} } },
    { afterWrite: c => c.pool[0].exp = 1 },
    { afterWrite: c => c.pool[0].level++ },
    { afterWrite: c => c.pool[0].attr.value++ },
    { afterWrite: c => { c.heroes[0].badges[0].pos = 2; } },
    { afterWrite: c => { c.heroes[1].badges.push(c.heroes[0].badges.pop()); } },
    { afterWrite: c => c.heroes[1].power = '9' },
    { afterWrite: c => c.pool.pop() },
    { afterWrite: c => c.stock.set(xpItem, 21) },
    { afterWrite: c => c.stock.set('GOLD', 401) },
    { afterWrite: c => c.stock.set('其他', 2) },
  ]) {
    const preparedOperation = await prepared(input);
    const budget = makeBudget(preparedOperation.operation);
    const result = await run(preparedOperation, { budget });
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.unresolvedWrite, true);
    assert.equal(preparedOperation.client.writes.length, 1);
    assert.equal(preparedOperation.client.uncertainWrites.size, 1);
    assert.deepEqual(budget.runBudget.snapshot().reserved.uids, [{ type: 'badge', id: uid }]);
  }
});

test('verification reconstructs action and configuration instead of trusting edited plans', async () => {
  const { client, config, before, operation } = await prepared();
  const response = await client.request(expectedAction.request, expectedAction.body, expectedAction.response, 100, { mutate: true });
  const after = await survey(client, config);
  assert.equal(verifyBadgeGrowth(operation, before, after, response).confirmed, true);
  for (const mutate of [
    o => o.actionId = 'elsewhere', o => o.target.pos++, o => o.action.body.expItemNum++, o => o.action.body.decomposeUid.push(idleUid),
    o => o.expectedState.exp++, o => o.beforeState.badge.exp++, o => o.costs[1].num--, o => o.budgetClaims.uids.pop(),
    o => o.configEvidence.HeroBadgeLevelCfg.data[1].exp++, o => delete o.configEvidence.HeroBadgeUnlockCfg,
  ]) {
    const changed = structuredClone(operation);
    mutate(changed);
    assert.equal(verifyBadgeGrowth(changed, before, after, response).confirmed, false);
  }
  assert.equal(verifyBadgeGrowth(operation, before, after, null).confirmed, false);
});

test('config, connection or inventory preflight drift and insufficient parent claims prevent dispatch', async () => {
  for (const mutate of [
    ({ client }) => client.factContext.connectionId = 'new-badge-connection',
    ({ client }) => client.factContext.generation++,
    ({ client }) => client.factContext.accountId = 'other',
    ({ client }) => client.stock.set('GOLD', 99),
    ({ client }) => client.pool[0].exp = 1,
    ({ config }) => config.tables.HeroBadgeLevelCfg.revision++,
    ({ config }) => config.tables.HeroBadgeUnlockCfg.revision++,
  ]) {
    const input = await prepared();
    mutate(input);
    assert.equal((await run(input)).status, 'NOT_EXECUTED');
    assert.equal(input.client.writes.length, 0);
  }
  for (const limits of [
    { resources: costs, quotas: [], uids: [] },
    { resources: [{ id: xpItem, num: 4 }, costs[1]], quotas: [], uids: [{ type: 'badge', id: uid }] },
    { resources: [costs[0], { id: 'GOLD', num: 99 }], quotas: [], uids: [{ type: 'badge', id: uid }] },
  ]) {
    const input = await prepared(), budget = makeBudget(input.operation, { limits });
    assert.equal((await run(input, { budget })).status, 'NOT_EXECUTED');
    assert.equal(input.client.writes.length, 0);
    assert.deepEqual(budget.runBudget.snapshot().reserved, { resources: [], quotas: [], uids: [] });
  }
});

test('cancellation before and after a typed request preserves dispatch boundary and late response is ignored', async () => {
  const early = await prepared(), a = new AbortController();
  a.abort();
  assert.equal((await run(early, { signal: a.signal })).status, 'CANCELLED');
  assert.equal(early.client.writes.length, 0);
  const b = new AbortController();
  let release;
  const late = await prepared({ onWrite() {
    queueMicrotask(() => b.abort());
    return new Promise(resolve => { release = resolve; });
  } });
  const result = await run(late, { signal: b.signal });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(late.client.writes.length, 1);
  const readCount = late.client.reads.length;
  release({});
  await new Promise(setImmediate);
  assert.equal(late.client.reads.length, readCount);
});

test('fresh post-read from each typed source must not predate its own dispatch baseline', async () => {
  const { client, config, before, operation } = await prepared();
  const response = await client.request(expectedAction.request, expectedAction.body, expectedAction.response, 100, { mutate: true });
  const after = await survey(client, config);
  assert.equal(verifyBadgeGrowth(operation, before, after, response).confirmed, true);
  for (const key of Object.keys(after.sourceFacts)) {
    const old = structuredClone(after);
    old.sourceFacts[key].provenance.sourceAt = before.sourceFacts[key].provenance.sourceAt - 1;
    assert.deepEqual(verifyBadgeGrowth(operation, before, old, response), {
      confirmed: false, reason: 'BADGE_POST_READ_PREDATES_DISPATCH_BASELINE',
    });
  }
});

test('last shared dispatch guard blocks expired intent without reclaiming reserved badge resources', async () => {
  const realNow = Date.now;
  let now = 1000000;
  Date.now = () => now;
  try {
    const input = await prepared(), budget = makeBudget(input.operation);
    const result = await run(input, { budget, onStage(stage) { if (stage === 'DISPATCH_INTENT') now += 31000; } });
    assert.equal(result.status, 'NOT_EXECUTED');
    assert.equal(input.client.writes.length, 0);
    assert.deepEqual(budget.runBudget.snapshot().reserved.uids, [{ type: 'badge', id: uid }]);
    assert.deepEqual(budget.runBudget.snapshot().reserved.resources, [...costs].sort((a, b) => a.id.localeCompare(b.id)));
  } finally { Date.now = realNow; }
});

test('same badge UID cannot be reauthorized inside a second batch of the same parent budget', async () => {
  const first = await prepared();
  const budget = makeBudget(first.operation, { limits: {
    resources: [{ id: xpItem, num: 20 }, { id: 'GOLD', num: 450 }], quotas: [], uids: [{ type: 'badge', id: uid }],
  } });
  assert.equal((await run(first, { budget })).status, 'SUCCESS');
  const operation = plan(await survey(first.client, first.config), first.config).actions[0];
  assert.ok(operation);
  assert.deepEqual(operation.costs, [{ id: xpItem, num: 7 }, { id: 'GOLD', num: 175 }]);
  const result = await run({ ...first, operation }, { budget: { ...budget, batchId: 'second', limits: operation.budgetClaims } });
  assert.equal(result.status, 'NOT_EXECUTED');
  assert.equal(first.client.writes.length, 1);
  assert.deepEqual(budget.runBudget.snapshot().reserved.uids, [{ type: 'badge', id: uid }]);
});

test('fixed local configuration charges exact current table values for the eligible worn badge', async () => {
  const config = { tables: extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json', import.meta.url), 'utf8'))) };
  const client = fake({ wireMode: true });
  client.heroes[0].heroId = config.tables.HeroCfg.data.find(row => row.type === '英雄' && row.career === '法师').id;
  const parameters = { heroId: client.heroes[0].heroId, uid };
  const facts = await survey(client, config, { parameters });
  const operation = plan(facts, config, { parameters }).actions[0];
  assert.ok(operation, JSON.stringify(viewBadgeGrowth(facts, options(config, { parameters })).blocked));
  assert.deepEqual(operation.costs, costs);
  assert.equal(operation.expectedState.level, 2);
  assert.equal(operation.expectedState.exp, 0);
});


const starParams = {...params,action:'star'};
function starConfig() {
 const config=cfg();config.tables.HeroBadgeCfg.data=[{id:'红法师徽章',career:'法师',quality:'RED'}];
 config.tables.HeroBadgeAttrCfg.data=[0,1,2,3,4,5].map(star=>({id:'红法师徽章',star,maxLevel:100}));
 config.tables.HeroBadgeStarCfg={data:[1,2,3,4,5].map(star=>({star,upBadgeNum:2**(star-1),consume:['GOLD',500000*2**(star-1)]}))};return config;
}
const starSurvey=(client,config,extra={})=>survey(client,config,{parameters:starParams,...extra});
const starPlan=(facts,config,extra={})=>plan(facts,config,{parameters:starParams,...extra});
async function starPrepared(input={},config=starConfig()){
 const client=fake({...input,star:true}),before=await starSurvey(client,config),operation=starPlan(before,config).actions[0];
 assert.ok(operation,JSON.stringify(viewBadgeGrowth(before,options(config,{parameters:starParams})).blocked));return {client,config,before,operation};
}
test('red badge STAR is an explicit BIZ-R09 branch with exact owned stones, gold, same UID and no sacrifice',async()=>{
 assert.equal(BADGE_STAR_EVIDENCE.requirement,'BIZ-R09');assert.equal(BADGE_STAR_EVIDENCE.realGame,'REAL_UNVERIFIED');
 assert.deepEqual(validateBadgeGrowthParameters(starParams),starParams);
 for(const extra of [{pos:1},{star:1},{decomposeUid:[]},{starItemNum:1},{count:2},{allowPaid:false},{action:'replace'}])assert.throws(()=>validateBadgeGrowthParameters({...starParams,...extra}),{code:'INVALID_PARAMETERS'});
 const {client,config,before,operation}=await starPrepared({wireMode:true});
 assert.equal(client.writes.length,0);assert.equal(operation.actionType,'STAR');
 assert.deepEqual(operation.action,{request:'BadgeStarRequest',response:'BadgeStarResponse',body:{uid,decomposeUid:[],starItemNum:1}});
 assert.deepEqual(operation.budgetClaims,{resources:[{id:'徽章升星石',num:1},{id:'GOLD',num:500000}],quotas:[],uids:[{type:'badge',id:uid}]});
 assert.deepEqual(operation.expectedState,{heroId:'A',uid,pos:1,badgeId:'红法师徽章',star:1,level:1,exp:0});
 assert.deepEqual(Object.keys(badgeGrowthDependencyVersions(options(config,{parameters:starParams}))),['moduleConfig','config.HeroCfg','config.HeroBadgeCfg','config.HeroBadgeUnlockCfg','config.HeroBadgeAttrCfg','config.HeroBadgeStarCfg']);
 const v=viewBadgeGrowth(before,options(config,{parameters:{action:'star'}}));assert.equal(v.mode,'star');assert.ok(v.candidates.every(row=>row.parameters.action==='star'));
 assert.equal(starPlan(before,config,{parameters:{action:'star'}}).actions.length,0);
 assert.equal(starPlan(before,config,{parameters:{heroId:'A',action:'star'}}).actions.length,0);
});
test('fixed badge STAR configuration charges each next star exact owned stones and GOLD',async()=>{
 const config={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))};
 for(let star=0;star<5;star++){
  const client=fake({star:true,wireMode:true}),hero=client.heroes[0];hero.heroId=config.tables.HeroCfg.data.find(row=>row.type==='英雄'&&row.career==='法师').id;
  client.pool[0].star=star;hero.badges[0].star=star;const p={heroId:hero.heroId,uid,action:'star'};
  const before=await starSurvey(client,config,{parameters:p}),op=starPlan(before,config,{parameters:p}).actions[0];assert.ok(op);
  assert.deepEqual(op.costs,[{id:'徽章升星石',num:2**star},{id:'GOLD',num:500000*2**star}]);
  assert.equal(op.action.body.starItemNum,2**star);assert.equal(op.expectedState.star,star+1);
 }
});
test('badge STAR rejects unknown or non-red states, material shortages, duplicate identities and untrusted facts',async()=>{
 for(const mutate of [
  (c,cfg)=>cfg.tables.HeroBadgeCfg.data[0].quality='BLUE',
  (c,cfg)=>delete cfg.tables.HeroBadgeCfg.data[0].quality,
  (c,cfg)=>delete cfg.tables.HeroBadgeStarCfg,
  (c,cfg)=>cfg.tables.HeroBadgeStarCfg.data[0].consume=['RUBY',1],
  (c,cfg)=>cfg.tables.HeroBadgeStarCfg.data[0].upBadgeNum=0,
  (c,cfg)=>cfg.tables.HeroBadgeStarCfg.data[0].consume[1]=-1,
  (c,cfg)=>cfg.tables.HeroBadgeStarCfg.data.push(cfg.tables.HeroBadgeStarCfg.data[0]),
  (c,cfg)=>cfg.tables.HeroBadgeAttrCfg.data.splice(1,1),
  c=>{c.pool[0].star=5;c.heroes[0].badges[0].star=5;},
  c=>c.stock.set('徽章升星石',0),c=>c.stock.set('GOLD',499999),
  c=>c.pool.push(structuredClone(c.pool[0])),
  c=>c.heroes[0].badges[0].star++,c=>delete c.pool[0].exp,
  c=>delete c.heroes[0].attributes,c=>c.heroes[0].badges[0].pos=2,
  c=>delete c.factContext.connectionId,
 ]){
  const c=fake({star:true}),cfg=starConfig();mutate(c,cfg);assert.equal(starPlan(await starSurvey(c,cfg),cfg).actions.length,0);
 }
 const {client,config,before}=await starPrepared();
 for(const change of [f=>f.stock.set('GOLD',999999999),f=>f.sourceFacts.badges.provenance.sourceAt-=31000,f=>f.ownership.pool[0].star++,
   f=>f.sourceFacts.badges.provenance.accountId='other',f=>f.sourceFacts.heroes.provenance.generation++,
   f=>f.sourceFacts.items.value.items.push({itemId:'fake',num:1})]){
  const tampered=structuredClone(before);change(tampered);assert.equal(starPlan(tampered,config).actions.length,0);
 }
 assert.equal(starPlan(before,config,{moduleConfig:{enabled:false}}).actions.length,0);assert.equal(client.writes.length,0);
});
test('STAR preserves partial XP and level, allows only server-observed target random attr and confirms typed full effect',async()=>{
 const f=await starPrepared({wireMode:true});f.client.pool[0].exp=3;
 const before=await starSurvey(f.client,f.config),operation=starPlan(before,f.config).actions[0];assert.ok(operation);
 const stages=[],result=await run({...f,before,operation},{onStage:s=>stages.push(s)});
 assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.afterState.badge.exp,3);assert.equal(result.afterState.badge.level,1);assert.equal(result.afterState.badge.star,1);
 assert.equal(f.client.pool[0].attr.value,2.5);assert.equal(f.client.stock.get('徽章升星石'),31);assert.equal(f.client.stock.get('GOLD'),9500000);
 assert.deepEqual(stages,['SURVEY','RESOURCE_PREFLIGHT','DISPATCH_INTENT','DISPATCHED','RESPONSE','VERIFY','VERIFIED']);
 assert.equal(f.client.uncertainWrites.size,0);
});
test('STAR response alone, unexpected refunds, wrong debit or any unrelated change stays UNKNOWN without replay',async()=>{
 for(const input of [
  {apply:false},{response:{material:{asset:[{id:'refund',num:1}]}}},{response:{material:{}}},
  {afterWrite:c=>c.pool[0].star++},{afterWrite:c=>c.pool[0].exp++},
  {afterWrite:c=>{c.pool[0].level++;c.heroes[0].badges[0].level++;}},
  {afterWrite:c=>c.heroes[0].badges[0].pos=2},
  {afterWrite:c=>{c.heroes[1].badges.push(c.heroes[0].badges.pop());}},
  {afterWrite:c=>c.heroes[1].power='123'},{afterWrite:c=>c.pool[1].star++},
  {afterWrite:c=>c.pool.pop()},{afterWrite:c=>c.stock.set('GOLD',9500001)},
  {afterWrite:c=>c.stock.set('徽章升星石',32)},{afterWrite:c=>c.stock.set(xpItem,24)},
  {afterWrite:c=>c.stock.set('unexpected',1)},{afterWrite:c=>c.factContext.generation++},
 ]){
  const f=await starPrepared(input),r=await run(f);assert.equal(r.status,'UNKNOWN',JSON.stringify({input,r}));assert.equal(f.client.writes.length,1);assert.equal(f.client.uncertainWrites.size,1);
 }
});
test('STAR plan tampering, stale costs or missing parent resource/UID never dispatches',async()=>{
 for(const change of [
  op=>op.action.body.decomposeUid.push(idleUid),op=>op.action.body.starItemNum++,
  op=>op.costs[0].num++,op=>op.expectedState.star++,op=>op.target.uid=otherUid,
  op=>op.budgetClaims.uids[0].id=otherUid,
 ]){
  const f=await starPrepared();change(f.operation);const result=await run(f);assert.notEqual(result.status,'SUCCESS');assert.equal(f.client.writes.length,0);
 }
 const stale=await starPrepared();stale.config.tables.HeroBadgeStarCfg.data[0].consume[1]++;assert.notEqual((await run(stale)).status,'SUCCESS');assert.equal(stale.client.writes.length,0);
 for(const omitted of ['徽章升星石','GOLD','uid']){
  const f=await starPrepared(),limits=structuredClone(f.operation.budgetClaims);
  if(omitted==='uid')limits.uids=[];else limits.resources=limits.resources.filter(row=>row.id!==omitted);
  const result=await run(f,{budget:makeBudget(f.operation,{limits})});assert.notEqual(result.status,'SUCCESS');assert.equal(f.client.writes.length,0);
 }
});
test('STAR D6 independently refuses sacrifice, extra fields, substituted currencies and unknown costs',async()=>{
 const {assertPaymentAllowed}=await import('../src/actions.mjs'),{operation}=await starPrepared();
 assert.doesNotThrow(()=>assertPaymentAllowed({...operation.action,costs:operation.costs}));
 for(const change of [
  a=>a.body.decomposeUid.push(idleUid),a=>delete a.body.decomposeUid,a=>a.body.starItemNum=0,a=>a.body.starItemNum++,
  a=>a.body.uid=Number(uid),a=>a.body.universal=false,a=>a.costs.pop(),a=>delete a.costs,
  a=>a.costs[0].id='RUBY',a=>a.costs[1].num=0,a=>a.costs.push({id:'其他',num:1}),
 ]){const a=structuredClone({...operation.action,costs:operation.costs});change(a);assert.throws(()=>assertPaymentAllowed(a));}
});
