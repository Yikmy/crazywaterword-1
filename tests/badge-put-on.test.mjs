import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  BADGE_PUT_ON_EVIDENCE, badgeGrowthDependencyVersions, badgeGrowthModule,
  planBadgeGrowth, surveyBadgeGrowth, validateBadgeGrowthParameters, verifyBadgeGrowth, viewBadgeGrowth,
} from '../src/badge-growth.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { extractTables } from '../src/config.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';

const protocol = loadProtocol();
const wire = (type, body) => protocol[type].decode(protocol[type].encode(body).finish());
const uid = '9007199254740993', worn = '9007199254740994', wrongCareer = '9007199254740995', other = '9007199254740996';
const params = { action: 'put-on', heroId: 'A', pos: 2, uid };
const player = { id: '17', worldId: '9', level: 12 };
const badge = (uid, badgeId = '蓝法师徽章', exp = 3) => ({ uid, badgeId, level: 1, exp, star: 0, attr: { attr: 1, value: 1.5, rating: 2 } });
const mirror = ({ exp, ...rest }, pos) => ({ ...structuredClone(rest), pos });
const hero = (heroId, badges = []) => ({
  heroId, level: 70, star: 3, power: '9007199254741011', attributes: [{ attr: 1, value: 4 }], skillLevels: [1, 2], badges,
});
const cfg = () => ({ tables: {
  HeroCfg: { revision: 1, data: [{ id: 'A', type: '英雄', career: '法师' }, { id: 'B', type: '英雄', career: '战士' }] },
  HeroBadgeCfg: { revision: 1, data: [{ id: '蓝法师徽章', career: '法师' }, { id: '蓝战士徽章', career: '战士' }] },
  HeroBadgeUnlockCfg: { revision: 1, data: [1, 70, 90, 110].map((level, index) => ({ pos: index + 1, level })) },
  ModuleOpenCfg: { revision: 1, data: [{ moduleId: '英雄徽章', playerLevel: 12 }] },
} });
const expectedAction = { request: 'PutOnBadgeRequest', response: null, body: { uid, heroId: 'A', pos: 2 } };
const claims = { resources: [], quotas: [], uids: [{ type: 'badge', id: uid }] };
const options = (config, extra = {}) => ({ config, parameters: params, player, moduleConfig: { enabled: true }, ...extra });

function fake({ apply = true, afterWrite, rejectRead, watchStatus = 'UNKNOWN' } = {}) {
  const pool = [badge(uid), badge(worn), badge(wrongCareer, '蓝战士徽章'), badge(other)];
  return {
    connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Set(),
    factContext: { accountId: 'badge-account', generation: 3, connectionId: 'badge-connection' },
    pool, heroes: [hero('A', [mirror(pool[1], 1)]), hero('B')], items: [{ itemId: '徽章经验', num: 25 }, { itemId: '普通道具', num: 2 }],
    resources: [{ res: 3, amount: 500 }], writes: [], reads: [], confirmedWrites: [],
    markUnverifiedWrite(name, body) { this.uncertainWrites.add(JSON.stringify({ name, body })); },
    confirmWatchedWrite(name, body) {
      this.confirmedWrites.push({ name, body: structuredClone(body) });
      this.uncertainWrites.delete(JSON.stringify({ name, body }));
    },
    async sendWatch(name, body, { beforeDispatch }) {
      beforeDispatch();
      assert.equal(name, 'PutOnBadgeRequest');
      assert.deepEqual(toSnapshotJson(wire(name, body)), body);
      this.writes.push({ name, body: structuredClone(body) });
      if (apply) {
        const target = this.heroes.find(row => row.heroId === body.heroId);
        target.badges.push(mirror(this.pool.find(row => row.uid === body.uid), body.pos));
        target.power = (BigInt(target.power) + 5n).toString();
        target.attributes[0].value++;
      }
      afterWrite?.(this);
      if (watchStatus === 'UNKNOWN') this.markUnverifiedWrite(name, body);
      return { status: watchStatus };
    },
    async request(name, body, reply, _timeout, options = {}) {
      assert.equal(options.mutate, undefined);
      assert.deepEqual(body, {});
      this.reads.push(name);
      if (rejectRead?.(name, this)) throw new Error('missing authority');
      const value = {
        BadgesRequest: { badge: this.pool }, AllHeroRequest: { heroes: this.heroes },
        AllItemRequest: { items: this.items }, AllResourceRequest: { list: this.resources },
      }[name];
      assert.ok(value, 'unexpected read ' + name);
      return wire(reply, value);
    },
  };
}

const survey = (client, config, extra) => surveyBadgeGrowth(client, protocol, options(config, extra));
const plan = (facts, config, extra) => planBadgeGrowth(facts, options(config, extra));

async function prepared(input) {
  const config = cfg(), client = fake(input), before = await survey(client, config);
  const [operation] = plan(before, config).actions;
  assert.ok(operation, JSON.stringify(viewBadgeGrowth(before, options(config)).blocked));
  return { client, config, before, operation };
}

function budgetFor(client, limits = claims) {
  const scope = { ...client.factContext, runId: 'badge-put-on-run' };
  return { scope, runBudget: createRunBudgetContext({ scope, limits }), batchId: 'badge-batch', limits: claims, ledger: null };
}

const run = ({ client, config, operation }, extra = {}) => executeBusinessOperation(client, protocol, operation, {
  ...options(config), adapter: badgeGrowthModule, allowMutate: true, budget: budgetFor(client), ...extra,
});

test('put-on binds one owned exact int64 UID, one empty position and zero costs to the archived codec and branch dependencies', async () => {
  const { client, config, before, operation } = await prepared();
  assert.equal(BADGE_PUT_ON_EVIDENCE.badgeSelectItem.requestByteOffset, 485010);
  assert.equal(BADGE_PUT_ON_EVIDENCE.realGame, 'REAL_UNVERIFIED');
  assert.equal(protocol.PutOnBadgeResponse, undefined);
  assert.deepEqual(toSnapshotJson(wire(expectedAction.request, expectedAction.body)), expectedAction.body);
  assert.deepEqual(operation.action, expectedAction);
  assert.equal(operation.actionType, 'PUT-ON');
  assert.deepEqual(operation.target, { heroId: 'A', uid, pos: 2 });
  assert.deepEqual(operation.costs, []);
  assert.deepEqual(operation.budgetClaims, claims);
  assert.deepEqual(operation.expectedState, { ...operation.target, badgeId: '蓝法师徽章', level: 1, star: 0, exp: 3 });
  assert.deepEqual(Object.keys(badgeGrowthDependencyVersions(options(config))), [
    'moduleConfig', 'config.HeroCfg', 'config.HeroBadgeCfg', 'config.HeroBadgeUnlockCfg', 'config.ModuleOpenCfg',
  ]);
  assert.equal(client.writes.length, 0);
  assert.deepEqual(client.reads.sort(), ['AllHeroRequest', 'AllItemRequest', 'AllResourceRequest', 'BadgesRequest'].sort());
  assert.equal(plan(before, config, { selections: ['wrong-action'] }).actions.length, 0);
});

test('put-on view offers compatible idle UIDs after one explicit hero and empty slot; plan still requires an explicit UID', async () => {
  const config = cfg(), client = fake();
  const draft = { action: 'put-on', heroId: 'A', pos: 2 };
  const facts = await survey(client, config, { parameters: draft });
  const view = viewBadgeGrowth(facts, options(config, { parameters: draft }));
  assert.equal(view.mode, 'put-on');
  assert.deepEqual(view.heroes, [
    { heroId: 'A', level: 70, badges: [{ uid: worn, pos: 1, badgeId: '蓝法师徽章', level: 1 }], emptySlots: [2] },
    { heroId: 'B', level: 70, badges: [], emptySlots: [1, 2] },
  ]);
  assert.deepEqual(view.candidates.map(row => row.target), [{ heroId: 'A', uid, pos: 2 }, { heroId: 'A', uid: other, pos: 2 }]);
  for (const row of view.candidates) {
    assert.equal(row.executable, true);
    assert.equal(Object.hasOwn(row, 'identity'), false);
    assert.equal(Object.hasOwn(row, 'configEvidence'), false);
    assert.equal(Object.hasOwn(row.beforeState, 'hero'), false);
  }
  for (const parameters of [draft, { action: 'put-on', uid, pos: 2 }, { action: 'put-on', heroId: 'A', uid }, { action: 'put-on' }]) {
    assert.deepEqual(validateBadgeGrowthParameters(parameters), parameters);
    assert.equal(plan(facts, config, { parameters }).actions.length, 0);
  }
  for (const parameters of [{ action: 'replace' }, { pos: 2 }, ...[0, 5, '2', 2.5, NaN].map(pos => ({ ...params, pos })), { ...params, uid: 9007199254740992 }, { ...params, replaceUid: worn }]) {
    assert.throws(() => validateBadgeGrowthParameters(parameters), { code: 'INVALID_PARAMETERS' });
  }
});

test('put-on fails closed on module level, wrong career, locked or occupied slot, worn ownership, config, provenance and unexpected protocol', async () => {
  const runCase = async (reason, change = () => {}, overrides = {}, editFacts = () => {}) => {
    const config = cfg(), client = fake();
    change(client, config);
    const facts = await survey(client, config, overrides);
    editFacts(facts);
    assert.deepEqual(plan(facts, config, overrides).notes, [reason]);
    assert.equal(client.writes.length, 0);
  };
  await runCase('BADGE_GROWTH_MODULE_DISABLED', undefined, { moduleConfig: { enabled: false } });
  await runCase('BADGE_MODULE_LEVEL_LOCKED', undefined, { player: { ...player, level: 11 } });
  await runCase('BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN', undefined, { player: { id: player.id, worldId: player.worldId } });
  await runCase('BADGE_SLOT_OR_CAREER_NOT_ELIGIBLE', undefined, { parameters: { ...params, uid: wrongCareer } });
  await runCase('BADGE_SLOT_OR_CAREER_NOT_ELIGIBLE', undefined, { parameters: { ...params, pos: 3 } });
  await runCase('BADGE_SLOT_NOT_EMPTY', undefined, { parameters: { ...params, pos: 1 } });
  await runCase('EXACT_IDLE_OWNED_BADGE_REQUIRED', client => client.heroes[1].badges.push(mirror(client.pool[0], 1)));
  await runCase('EXACT_IDLE_OWNED_BADGE_REQUIRED', client => client.pool.shift());
  await runCase('BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN', client => client.heroes[1].badges.push(mirror(client.pool[1], 1)));
  await runCase('BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN', (_client, config) => config.tables.ModuleOpenCfg.data.push({ moduleId: '英雄徽章', playerLevel: 1 }));
  await runCase('BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN', (_client, config) => { delete config.tables.HeroBadgeUnlockCfg; });
  await runCase('BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN', undefined, {}, facts => { facts.sourceFacts.heroes.provenance.sourceAt -= 31000; });
  await runCase('PROTOCOL_UNAVAILABLE', undefined, {}, facts => { facts.available.push('PutOnBadgeResponse'); });
});

test('shared watched execution requires exact post-read slot addition, confirms zero stock changes and reserves the typed UID', async () => {
  const input = await prepared({ afterWrite(client) { client.pool.reverse(); client.heroes.reverse(); client.items.reverse(); } });
  const budget = budgetFor(input.client), stages = [];
  const result = await run(input, { budget, onStage: stage => stages.push(stage) });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.requestStatus, 'UNKNOWN');
  assert.equal(result.verification.status, 'CONFIRMED');
  assert.deepEqual(result.afterState.hero.badges.map(({ uid, pos }) => ({ uid, pos })), [{ uid: worn, pos: 1 }, { uid, pos: 2 }]);
  assert.equal(result.afterState.badge.exp, 3);
  assert.equal(result.responseEvidence, null);
  assert.equal(input.client.uncertainWrites.size, 0);
  assert.equal(input.client.writes.length, 1);
  assert.deepEqual(input.client.confirmedWrites, input.client.writes);
  assert.deepEqual(budget.runBudget.snapshot().reserved, claims);
  assert.deepEqual(stages, ['SURVEY', 'RESOURCE_PREFLIGHT', 'DISPATCH_INTENT', 'DISPATCHED', 'OBSERVATION_ENDED', 'VERIFY', 'VERIFIED']);
  for (const uids of [[], [{ type: 'equipment', id: uid }]]) {
    const next = await prepared();
    const blocked = await run(next, { budget: budgetFor(next.client, { ...claims, uids }) });
    assert.equal(blocked.status, 'NOT_EXECUTED');
    assert.equal(next.client.writes.length, 0);
  }
});

test('typed watcher status cannot confirm unchanged or altered state, and unresolved writes are never replayed', async () => {
  for (const [behavior, reason] of [
    [{ apply: false, watchStatus: 'SUCCESS' }, 'BADGE_EXACT_EMPTY_SLOT_ADDITION_NOT_CONFIRMED'],
    [{ afterWrite: client => { client.heroes[0].badges[1].pos = 3; } }, 'BADGE_EXACT_EMPTY_SLOT_ADDITION_NOT_CONFIRMED'],
    [{ afterWrite: client => { client.heroes[0].badges[0].pos = 3; } }, 'BADGE_EXACT_EMPTY_SLOT_ADDITION_NOT_CONFIRMED'],
    [{ afterWrite: client => { client.pool.find(row => row.uid === other).exp++; } }, 'BADGE_POOL_UNCHANGED_NOT_CONFIRMED'],
    [{ afterWrite: client => { client.heroes[1].power = '9'; } }, 'BADGE_NON_TARGET_HERO_STATE_CHANGED'],
    [{ afterWrite: client => { client.heroes[0].level++; } }, 'BADGE_NON_TARGET_HERO_STATE_CHANGED'],
    [{ afterWrite: client => { client.items[0].num--; } }, 'BADGE_ZERO_COST_INVENTORY_UNCHANGED_NOT_CONFIRMED'],
    [{ afterWrite: client => { client.resources[0].amount--; } }, 'BADGE_ZERO_COST_INVENTORY_UNCHANGED_NOT_CONFIRMED'],
    [{ rejectRead: (request, client) => request === 'AllResourceRequest' && client.writes.length }, 'BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN'],
  ]) {
    const input = await prepared(behavior);
    const result = await run(input);
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.verification.reason, reason);
    assert.equal(result.unresolvedWrite, true);
    assert.equal(input.client.uncertainWrites.size, 1);
    assert.equal((await run(input)).status, 'NOT_EXECUTED');
    assert.equal(input.client.writes.length, 1);
    assert.equal(input.client.confirmedWrites.length, 0);
  }
});

test('put-on verification rejects forged operations and stale or cross-connection re-reads', async () => {
  const { client, before, config, operation } = await prepared();
  await client.sendWatch(operation.action.request, operation.action.body, { beforeDispatch() {} });
  const after = await survey(client, config);
  assert.equal(verifyBadgeGrowth(operation, before, after, null).confirmed, true);
  for (const mutate of [
    op => { op.action.body.pos = 3; }, op => { op.target.uid = other; }, op => { op.costs.push({ id: 'GOLD', num: 1 }); },
    op => { op.budgetClaims.uids[0].type = 'equipment'; }, op => { op.configEvidence.ModuleOpenCfg.data[0].playerLevel = 1; },
  ]) {
    const forged = structuredClone(operation);
    mutate(forged);
    assert.equal(verifyBadgeGrowth(forged, before, after, null).confirmed, false);
  }
  const older = structuredClone(after);
  older.sourceFacts.items.provenance.sourceAt = before.sourceFacts.items.provenance.sourceAt - 1;
  assert.equal(verifyBadgeGrowth(operation, before, older, null).reason, 'BADGE_POST_READ_PREDATES_DISPATCH_BASELINE');
  const disconnected = structuredClone(after);
  disconnected.identityContext.connectionId = 'different';
  assert.equal(verifyBadgeGrowth(operation, before, disconnected, null).reason, 'BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN');
});

test('fixed local v76 configuration enforces the exact hero level and badge module thresholds', async () => {
  const config = { tables: extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json', import.meta.url), 'utf8'))) };
  const client = fake();
  const heroId = config.tables.HeroCfg.data.find(row => row.type === '英雄' && row.career === '法师').id;
  client.heroes[0].heroId = heroId;
  const parameters = { ...params, heroId };
  const facts = await survey(client, config, { parameters });
  assert.equal(plan(facts, config, { parameters }).actions.length, 1);
  assert.equal(facts.catalog.playerLevel, 12);
  assert.deepEqual(facts.catalog.unlocks, [1, 70, 90, 110].map((level, index) => ({ pos: index + 1, level })));
  client.heroes[0].level = 69;
  assert.deepEqual(plan(await survey(client, config, { parameters }), config, { parameters }).notes, ['BADGE_SLOT_OR_CAREER_NOT_ELIGIBLE']);
});
