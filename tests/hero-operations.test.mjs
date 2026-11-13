import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_DEFAULT_CONFIG, heroModule, validateHeroConfig, validateHeroParameters, parseOperationHero, surveyHeroOperations, viewHeroOperations, planHeroOperations, verifyHeroOperation, heroDependencyVersions } from '../src/hero-operations.mjs';
import { planHeroes, buildHeroBody, buildHeroAction } from '../src/heroes.mjs';
import { ResourceLedger, createRunBudgetContext } from '../src/resource-ledger.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { loadProtocol } from '../src/proto.mjs';

const config = () => ({ tables: {
  HeroCfg: { data: [{ id: 'A', quality: 'BLUE', universalItemId: '万能碎片' }, { id: 'B', quality: 'BLUE', universalItemId: '万能碎片' }] },
  HeroUpgradeCfg: { data: [{ level: 1, exp: 0, reqPlayerLv: 1 }, { level: 2, exp: 5, reqPlayerLv: 1 }, { level: 3, exp: 8, reqPlayerLv: 2 }] },
  HeroStarCfg: { data: [{ star: 0, consumeBlue: 0, maxSkillLevel: [1, 1] }, { star: 1, consumeBlue: 3, maxSkillLevel: [1, 1] }, { star: 2, consumeBlue: 5, maxSkillLevel: [2, 2] }] },
  HeroSkillUpCfg: { data: [{ quality: 'BLUE', level: 2, costArr: [['技能书', 4], ['技能书', 4]] }] },
} });
const hero = (heroId = 'A', extra = {}) => ({ heroId, level: 1, star: 1, power: 20, skillLevels: [1, 1], equips: [{ uid: '9007199254740993' }], attributes: [{ type: 1, value: 20 }], ...extra });
const protocol = Object.fromEntries(['AllHeroRequest', 'AllHeroResponse', 'AllItemRequest', 'AllItemResponse', 'AllResourceRequest', 'AllResourceResponse', 'HeroLevelUpRequest', 'HeroStarUpRequest', 'HeroStarUpResponse', 'HeroSkillLevelUpRequest'].map(name => [name, {}]));
const enabled = { enabled: true };
const params = (action = 'level', extra = {}) => ({ heroId: 'A', action, ...(action === 'skill' ? { skillIdx: 1 } : {}), ...extra });
function fake({ heroes = [hero(), hero('B')], stock = { 英雄经验: 30, A碎片: 10, B碎片: 10, 技能书: 10, 万能碎片: 20 }, afterWrite, response, watchStatus = 'UNKNOWN' } = {}) {
  const client = { connected: true, writes: [], reads: [], uncertainWrites: new Map(), heroes: structuredClone(heroes), stock: new Map(Object.entries(stock)),
    markUnverifiedWrite(request) { this.uncertainWrites.set(request, true); }, confirmWatchedWrite(request) { this.uncertainWrites.delete(request); },
    mutate(request, body) {
      this.writes.push({ request, body: structuredClone(body) });
      const target = this.heroes.find(row => row.heroId === body.heroId);
      if (request === 'HeroLevelUpRequest') { target.level++; this.stock.set('英雄经验', this.stock.get('英雄经验') - 5); }
      if (request === 'HeroStarUpRequest') { target.star++; this.stock.set(target.heroId + '碎片', this.stock.get(target.heroId + '碎片') - 5); }
      if (request === 'HeroSkillLevelUpRequest') { target.skillLevels[body.skillIdx - 1]++; this.stock.set('技能书', this.stock.get('技能书') - 4); }
      afterWrite?.(this, request, body);
      return target;
    },
    async request(name, body) {
      if (name === 'AllHeroRequest') { this.reads.push(name); return { heroes: structuredClone(this.heroes) }; }
      if (name === 'AllItemRequest') { this.reads.push(name); return { items: [...this.stock].map(([itemId, num]) => ({ itemId, num })) }; }
      if (name === 'AllResourceRequest') { this.reads.push(name); return { list: [] }; }
      const target = this.mutate(name, body); return response === undefined ? { nextStar: structuredClone(target) } : structuredClone(response);
    },
    async sendWatch(name, body) { this.mutate(name, body); return { status: watchStatus }; },
  };
  return client;
}
const options = (parameters = params(), cfg = config()) => ({ config: cfg, moduleConfig: enabled, parameters, player: { id: '17', level: 2 } });
const survey = (client, parameters = params()) => surveyHeroOperations(client, protocol, options(parameters));
const plan = (facts, parameters = params(), cfg = config(), extra = {}) => planHeroOperations(facts, { ...options(parameters, cfg), ...extra });
async function prepared(parameters = params(), input = {}) { const client = fake(input), facts = await survey(client, parameters), operation = plan(facts, parameters).actions[0]; return { client, facts, operation }; }
async function run(client, operation, parameters = params(), extra = {}) { return executeBusinessOperation(client, protocol, operation, { adapter: heroModule, ...options(parameters), allowMutate: true, ...extra }); }
function updated(facts, parameters, { missingDebit = false } = {}) {
  const after = structuredClone(facts), row = after.heroes.find(value => value.heroId === parameters.heroId);
  if (parameters.action === 'level') { row.level++; row.raw.level++; if (!missingDebit) after.stock.set('英雄经验', after.stock.get('英雄经验') - 5); }
  if (parameters.action === 'star') { row.star++; row.raw.star++; if (!missingDebit) after.stock.set(row.heroId + '碎片', after.stock.get(row.heroId + '碎片') - 5); }
  if (parameters.action === 'skill') { row.skillLevels[parameters.skillIdx - 1]++; row.raw.skillLevels[parameters.skillIdx - 1]++; if (!missingDebit) after.stock.set('技能书', after.stock.get('技能书') - 4); }
  return after;
}

test('hero adapter is default off, semantics-only, strictly bounded parameters', () => {
  assert.deepEqual(HERO_DEFAULT_CONFIG, { enabled: false }); assert.equal(heroModule.execute, undefined);
  assert.deepEqual(validateHeroParameters(params('star')), { heroId: 'A', action: 'star', allowUniversal: false });
  for (const value of [{ count: 2 }, { request: 'HeroLevelUpRequest' }, { action: 'unknown' }, { heroId: ' A' }, { action: 'level', skillIdx: 1 }, { action: 'skill', skillIdx: 0 }, { action: 'skill', skillIdx: 5 }, { action: 'level', allowUniversal: true }, { action: 'star', allowUniversal: 1 }, Object.create({ heroId: 'A' })]) assert.throws(() => validateHeroParameters(value), { code: 'INVALID_PARAMETERS' });
  assert.throws(() => validateHeroConfig({ enabled: true, paid: true }));
  const getter = {}; Object.defineProperty(getter, 'heroId', { enumerable: true, get() { throw Error('must not evaluate'); } }); assert.throws(() => validateHeroParameters(getter), { code: 'INVALID_PARAMETERS' });
});

test('original planner supports atomic kind and slot scopes without changing legacy defaults', () => {
  const stock = new Map([['英雄经验', 30], ['A碎片', 10], ['技能书', 10]]), input = { config: config(), heroes: [hero('A', { star: 2 })], itemNum: id => stock.get(id) ?? 0, playerLevel: 2 };
  const legacy = planHeroes(input); assert.equal(legacy.steps.find(row => row.kind === 'level').count, 2);
  const ledger = new ResourceLedger(stock), atomic = planHeroes({ ...input, ledger, kinds: ['level'], atomic: true });
  assert.equal(atomic.steps.length, 1); assert.equal(atomic.steps[0].count, 1); assert.equal(ledger.reserved.get('英雄经验'), 5); assert.equal(ledger.reserved.has('技能书'), false);
  const skill = planHeroes({ ...input, kinds: ['skill'], atomic: true, slots: [1] }); assert.equal(skill.steps.length, 1); assert.equal(skill.steps[0].slot, 1);
  assert.throws(() => planHeroes({ ...input, kinds: ['invalid'] }));
  assert.deepEqual(buildHeroAction({ kind: 'star', heroId: 'A', universal: false }), { request: 'HeroStarUpRequest', response: 'HeroStarUpResponse', body: { heroId: 'A', universal: false } });
  assert.deepEqual(buildHeroBody({ kind: 'skill', heroId: 'A', slot: 1 }), { heroId: 'A', skillIdx: 2 });
});

test('hero survey requires complete unique own hero scalars and real skill slots', async () => {
  const original = hero();
  for (const key of ['heroId', 'level', 'star', 'power', 'skillLevels']) { const row = structuredClone(original), value = row[key]; delete row[key]; Object.setPrototypeOf(row, { [key]: value }); assert.equal(parseOperationHero(row), null); }
  for (const row of [hero('A', { skillLevels: [] }), hero('A', { skillLevels: Array(2) }), hero('A', { power: Number.MAX_SAFE_INTEGER + 1 }), hero('A', { level: 0 }), hero('A', { star: -1 })]) assert.equal(parseOperationHero(row), null);
  assert.equal((await survey(fake({ heroes: [hero(), hero()] }))).heroesReliable, false);
  assert.equal((await survey(fake({ heroes: [] }))).heroesReliable, false);
});

test('hero survey preserves large exact power and instance IDs rather than coercing Number', async () => {
  const client = fake({ heroes: [hero('A', { power: '9007199254740993' })] }), facts = await survey(client);
  assert.equal(facts.heroesReliable, true); assert.equal(facts.heroes[0].power, '9007199254740993'); assert.equal(facts.heroes[0].raw.equips[0].uid, '9007199254740993'); assert.equal(plan(facts).actions.length, 1);
});

test('hero inventory rejects prototype defaults, duplicate IDs, alias conflicts and unsafe quantities', async () => {
  const cases = [
    { items: [{ itemId: '英雄经验', num: 30 }, { itemId: '英雄经验', num: 30 }] },
    { items: [Object.assign(Object.create({ num: 30 }), { itemId: '英雄经验' })] },
    { items: [{ itemId: '英雄经验', id: 'other', num: 30 }] },
    { items: [{ itemId: '英雄经验', num: Number.MAX_SAFE_INTEGER + 1 }] },
    { items: Array(1) },
  ];
  for (const answer of cases) { const client = fake(), original = client.request.bind(client); client.request = async(name, body) => name === 'AllItemRequest' ? answer : original(name, body); const facts = await survey(client); assert.equal(facts.stockReliable, false); assert.equal(plan(facts).actions.length, 0); }
  const client = fake(), original = client.request.bind(client); client.request = async(name, body) => name === 'AllResourceRequest' ? { list: [{ res: 3, amount: 2 }, { res: 3, amount: 2 }] } : original(name, body); assert.equal((await survey(client)).stockReliable, false);
  client.stock.set('GOLD', 3); client.request = async(name, body) => name === 'AllResourceRequest' ? { list: [{ res: 3, amount: 2 }] } : original(name, body); assert.equal((await survey(client)).stockReliable, false);
});

test('view exposes observed next steps but plan requires one explicit hero/action', async () => {
  const facts = await survey(fake()), view = viewHeroOperations(facts, { ...options({}) });
  assert.equal(view.candidates.filter(row => row.executable).length, 4);
  assert.deepEqual(plan(facts, {}).actions, []); assert.equal(plan(facts, { heroId: 'A', action: 'skill' }).actions.length, 0);
  assert.equal(planHeroOperations(facts, { config: config(), parameters: params() }).actions.length, 0);
  const operation = plan(facts).actions[0]; assert.equal(operation.expectedState.level, 2); assert.deepEqual(operation.costs, [{ id: '英雄经验', num: 5 }]);
  assert.equal(plan(facts, params(), config(), { selections: ['wrong'] }).actions.length, 0);
});

test('universal fragments remain blocked even with explicit opt-in and ample inventory', async () => {
  const client = fake({ stock: { 英雄经验: 30, A碎片: 0, 技能书: 20, 万能碎片: 500 } }), facts = await survey(client, params('star', { allowUniversal: true }));
  const view = viewHeroOperations(facts, options(params('star', { allowUniversal: true })));
  assert.equal(view.candidates[0].blockedReason, 'UNIVERSAL_EXCHANGE_BLOCKED_EVIDENCE'); assert.equal(plan(facts, params('star', { allowUniversal: true })).actions.length, 0);
  assert.equal(plan(facts, params('star')).actions.length, 0); assert.equal(client.writes.length, 0);
});

test('skill planning uses current observed star and selected slot, never future planned star', async () => {
  const facts = await survey(fake()); assert.equal(plan(facts, params('skill')).actions.length, 0);
  facts.heroes[0].star = 2; facts.heroes[0].raw.star = 2;
  const operation = plan(facts, params('skill', { skillIdx: 2 })).actions[0]; assert.equal(operation.action.body.skillIdx, 2); assert.deepEqual(operation.expectedState.skillLevels, [1, 2]); assert.deepEqual(operation.costs, [{ id: '技能书', num: 4 }]);
});

test('hero plan shares ResourceLedger across heroes and reserves only the authorized atomic action', async () => {
  const facts = await survey(fake()), ledger = new ResourceLedger(new Map([['英雄经验', 8]]));
  assert.equal(plan(facts, params(), config(), { ledger }).actions.length, 1); assert.equal(plan(facts, params('level', { heroId: 'B' }), config(), { ledger }).actions.length, 0); assert.equal(ledger.reserved.get('英雄经验'), 5);
});

test('malformed, duplicate and unsorted domain configs fail closed without invented targets', async () => {
  const facts = await survey(fake());
  for (const mutate of [cfg => cfg.tables.HeroCfg.data.push(cfg.tables.HeroCfg.data[0]), cfg => cfg.tables.HeroUpgradeCfg.data.reverse(), cfg => cfg.tables.HeroUpgradeCfg.data[1].exp = null, cfg => cfg.tables.HeroUpgradeCfg.data[1].reqPlayerLv = -1, cfg => cfg.tables.HeroUpgradeCfg.data.push(cfg.tables.HeroUpgradeCfg.data[1]), cfg => cfg.tables.HeroUpgradeCfg.data = Array(1)]) { const cfg = config(); mutate(cfg); assert.equal(plan(facts, params(), cfg).actions.length, 0); }
  const cfg = config(); cfg.tables.HeroStarCfg.data.reverse(); assert.equal(plan(facts, params('star'), cfg).actions.length, 0);
  const skillFacts = await survey(fake({ heroes: [hero('A', { star: 2 })] }));
  for (const mutate of [c => c.tables.HeroSkillUpCfg.data.push(c.tables.HeroSkillUpCfg.data[0]), c => c.tables.HeroSkillUpCfg.data[0].costArr[0][1] = '', c => c.tables.HeroStarCfg.data[2].maxSkillLevel = Array(2)]) { const c = config(); mutate(c); assert.equal(plan(skillFacts, params('skill'), c).actions.length, 0); }
});

test('hero plan D6 remains hard forbidden when malicious config names a premium resource', async () => {
  const facts = await survey(fake({ heroes: [hero('A', { star: 2 })] })), cfg = config(); cfg.tables.HeroSkillUpCfg.data[0].costArr[0] = ['RUBY', 1]; facts.stock.set('RUBY', 100);
  assert.equal(plan(facts, params('skill'), cfg).actions.length, 0);
});

for (const action of ['level', 'star', 'skill']) test('generic hero ' + action + ' confirms only fresh exact state and material delta', async () => {
  const p = params(action), input = action === 'skill' ? { heroes: [hero('A', { star: 2 }), hero('B')] } : {};
  const { client, operation } = await prepared(p, input), stages = [], result = await run(client, operation, p, { onStage: stage => stages.push(stage) });
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.verification.status, 'CONFIRMED'); assert.equal(client.writes.length, 1); assert.ok(stages.includes('DISPATCH_INTENT')); assert.ok(stages.includes('VERIFY')); assert.ok(stages.includes('VERIFIED')); assert.equal(result.beforeInventoryReliable, true); assert.equal(result.afterInventoryReliable, true);
  if (action === 'star') assert.equal(client.writes[0].body.universal, false);
  else assert.equal(result.requestStatus, 'UNKNOWN');
});

test('verify rejects wrong or excessive target changes, untouched material, other hero or inventory drift', async () => {
  const { facts, operation } = await prepared();
  const good = updated(facts, params()); assert.equal(verifyHeroOperation(operation, facts, good).confirmed, true);
  for (const mutate of [after => after.heroes[0].raw.level++, after => { after.heroes[0].level++; after.heroes[0].raw.level++; }, after => { after.heroes[0].star++; after.heroes[0].raw.star++; }, after => after.heroes[1].raw.power = '21', after => after.heroes.pop(), after => after.stock.set('英雄经验', 30), after => after.stock.set('英雄经验', 24), after => after.stock.set('技能书', 9), after => after.heroes[0].raw.equips[0].uid = '9007199254740994']) { const after = updated(facts, params()); mutate(after); assert.equal(verifyHeroOperation(operation, facts, after).confirmed, false); }
  const reordered = updated(facts, params()); reordered.heroes.reverse(); assert.equal(verifyHeroOperation(operation, facts, reordered).confirmed, true);
});

test('verify does not accept forged body, target, before or expected state', async () => {
  const { facts, operation } = await prepared(), after = updated(facts, params());
  for (const mutate of [op => op.action.body.heroId = 'B', op => op.action.body.count = 2, op => op.action.response = 'InventedResponse', op => op.target.heroId = 'B', op => op.expectedState.level = 3, op => op.beforeState.level = 2, op => op.actionType = 'STAR', op => op.costSource = 'forged']) { const op = structuredClone(operation); mutate(op); assert.equal(verifyHeroOperation(op, facts, after).confirmed, false); }
});

test('star requires matching complete nextStar and authority; typed reply alone remains unknown', async () => {
  const p = params('star'), { facts, operation } = await prepared(p), after = updated(facts, p), ack = { nextStar: structuredClone(after.heroes[0].raw) };
  assert.equal(verifyHeroOperation(operation, facts, after, ack).confirmed, true);
  for (const response of [null, {}, { nextStar: { heroId: 'A', star: 2 } }, { nextStar: { ...ack.nextStar, heroId: 'B' } }, { nextStar: { ...ack.nextStar, star: 3 } }, { nextStar: { ...ack.nextStar, level: 2 } }]) assert.equal(verifyHeroOperation(operation, facts, after, response).confirmed, false);
  const input = { afterWrite(client) { client.heroes[0].star--; client.stock.set('A碎片', 10); } }, preparedInput = await prepared(p, input);
  assert.equal((await run(preparedInput.client, preparedInput.operation, p)).status, 'UNKNOWN');
});

test('quiet hero write without exact debit is UNKNOWN and retains conservative reservation', async () => {
  const { client, operation } = await prepared(params(), { afterWrite(client) { client.stock.set('英雄经验', 30); } }), ledger = new ResourceLedger(new Map([['英雄经验', 30]]));
  const result = await run(client, operation, params(), { budget: { ledger } }); assert.equal(result.status, 'UNKNOWN'); assert.equal(result.unresolvedWrite, true); assert.equal(ledger.reserved.get('英雄经验'), 5); assert.equal(client.uncertainWrites.size, 1);
});

test('fresh growth or config cost change invalidates prior action before transport', async () => {
  const { client, operation } = await prepared(); client.heroes[0].level = 2; assert.equal((await run(client, operation)).status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
  const second = await prepared(), cfg = config(); cfg.tables.HeroUpgradeCfg.data[1].exp = 6; const result = await run(second.client, second.operation, params(), { config: cfg }); assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(second.client.writes.length, 0);
});

test('hero material preflight shortage stops all writes', async () => {
  const { client, operation } = await prepared(); const original = client.request.bind(client); let itemReads = 0; client.request = async(name, body) => { if (name === 'AllItemRequest' && ++itemReads >= 2) return { items: [{ itemId: '英雄经验', num: 0 }] }; return original(name, body); };
  const result = await run(client, operation); assert.equal(result.status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 0);
});

test('cancel before dispatch has zero writes; cancel after dispatch and late state stays UNKNOWN', async () => {
  const first = await prepared(), aborted = new AbortController(); aborted.abort(); assert.equal((await run(first.client, first.operation, params(), { signal: aborted.signal })).dispatched, false); assert.equal(first.client.writes.length, 0);
  const second = await prepared(), controller = new AbortController(); let resolveWatch; second.client.sendWatch = async(name, body) => { second.client.mutate(name, body); controller.abort(); return new Promise(resolve => { resolveWatch = resolve; }); };
  const result = await run(second.client, second.operation, params(), { signal: controller.signal }); assert.equal(result.status, 'UNKNOWN'); assert.equal(result.verification.status, 'UNCONFIRMED'); assert.equal(second.client.writes.length, 1); resolveWatch({ status: 'SUCCESS' }); await Promise.resolve(); assert.equal(result.status, 'UNKNOWN');
});

test('domain dependencies include only relevant hero tables and account config', () => {
  const cfg = config(); cfg.tables.BuildingCfg = { data: [{ id: 1 }] }; const level = heroDependencyVersions(options(params(), cfg)), skill = heroDependencyVersions(options(params('skill'), cfg));
  assert.deepEqual(Object.keys(level).sort(), ['moduleConfig', 'config.HeroCfg', 'config.HeroUpgradeCfg'].sort()); assert.equal(Object.hasOwn(skill, 'config.HeroStarCfg'), true); assert.equal(Object.hasOwn(skill, 'config.HeroSkillUpCfg'), true); assert.equal(Object.hasOwn(skill, 'config.HeroUpgradeCfg'), false);
  level['config.HeroCfg'].data[0].quality = 'RED'; assert.equal(cfg.tables.HeroCfg.data[0].quality, 'BLUE');
});

const wireProtocol = loadProtocol();
const wire = (name, body) => wireProtocol[name].decode(wireProtocol[name].encode(body).finish());
test('local real protocol codecs preserve hero requests, own scalars and large values', () => {
  for (const step of [{ kind: 'level', heroId: 'A' }, { kind: 'star', heroId: 'A', universal: false }, { kind: 'skill', heroId: 'A', slot: 1 }]) { const action = buildHeroAction(step), decoded = wire(action.request, action.body); for (const [key, value] of Object.entries(action.body)) { assert.equal(Object.hasOwn(decoded, key), true); assert.equal(decoded[key], value); } }
  assert.equal(wireProtocol.HeroLevelUpResponse, undefined); assert.equal(wireProtocol.HeroSkillLevelUpResponse, undefined);
  const complete = wire('DisplayHero', { heroId: 'A', level: 1, star: 0, power: '9007199254740993', skillLevels: [1, 1] }); assert.equal(parseOperationHero(complete).power, '9007199254740993');
  const missing = wire('DisplayHero', { heroId: 'A', level: 1, power: 5, skillLevels: [1, 1] }); assert.equal(missing.star, 0); assert.equal(Object.hasOwn(missing, 'star'), false); assert.equal(parseOperationHero(missing), null);
  assert.equal(parseOperationHero(wire('DisplayHero', { heroId: 'A', level: 1, star: 0, power: 5 })), null);
});

test('hero generic execution consumes one finite parent budget across fresh batches and heroes', async () => {
  const client = fake(), scope = { accountId: '17', runId: 'hero-run', generation: 1, connectionId: 'hero-connection' };
  const parent = createRunBudgetContext({ scope, limits: { resources: [{ id: '英雄经验', num: 8 }], quotas: [], uids: [] } });
  const facts = await survey(client), first = plan(facts).actions[0];
  const budget = { runBudget: parent, scope, batchId: 'hero-batch-1', limits: { resources: first.costs, quotas: [], uids: [] }, ledger: null };
  assert.equal((await run(client, first, params(), { budget })).status, 'SUCCESS');
  client.stock.set('英雄经验', 1000);
  const secondParams = params('level', { heroId: 'B' }), secondFacts = await survey(client, secondParams), second = plan(secondFacts, secondParams).actions[0];
  const secondBudget = { runBudget: parent, scope, batchId: 'hero-batch-2', limits: { resources: second.costs, quotas: [], uids: [] }, ledger: null };
  assert.equal((await run(client, second, secondParams, { budget: secondBudget })).status, 'NOT_EXECUTED'); assert.equal(client.writes.length, 1);
  assert.deepEqual(parent.snapshot().reserved.resources, [{ id: '英雄经验', num: 5 }]);
});

test('hero zero-cost config remains finite and requires no inventory movement', async () => {
  const cfg = config(); cfg.tables.HeroUpgradeCfg.data[1].exp = 0;
  const client = fake({ afterWrite(client) { client.stock.set('英雄经验', client.stock.get('英雄经验') + 5); } }), facts = await survey(client), operation = plan(facts, params(), cfg).actions[0];
  assert.deepEqual(operation.costs, []); const result = await run(client, operation, params(), { config: cfg }); assert.equal(result.status, 'SUCCESS'); assert.equal(client.writes.length, 1);
});

test('hero rejected and rate limited writes never reach a confirming reread', async () => {
  for (const status of ['REJECTED', 'RATE_LIMITED']) {
    const { client, operation } = await prepared(params(), { watchStatus: status }); const result = await run(client, operation);
    assert.equal(result.status, status); assert.equal(result.verification.status, 'UNCONFIRMED'); assert.equal(client.writes.length, 1); assert.equal(client.reads.filter(name => name === 'AllHeroRequest').length, 2);
  }
});

test('hero authority reread failure after dispatch remains UNKNOWN', async () => {
  const { client, operation } = await prepared(), original = client.request.bind(client);
  client.request = async(name, body) => { if (name === 'AllHeroRequest' && client.writes.length) throw Error('read unavailable'); return original(name, body); };
  const result = await run(client, operation); assert.equal(result.status, 'UNKNOWN'); assert.equal(result.unresolvedWrite, true); assert.equal(client.writes.length, 1);
});

test('hero verify rejects missing target, duplicate after identity, malformed stock or player mismatch', async () => {
  const { facts, operation } = await prepared();
  for (const mutate of [after => after.heroes.shift(), after => after.heroes.push(after.heroes[0]), after => after.stock.set('技能书', null), after => after.playerId = '18', after => after.playerLevel = 3, after => after.heroes[0].skillLevels = Array(2)]) {
    const after = updated(facts, params()); mutate(after); assert.equal(verifyHeroOperation(operation, facts, after).confirmed, false);
  }
});

test('hero star own fragments remain the sole cost even when universal item is the same ID', async () => {
  const facts = await survey(fake()), cfg = config(); cfg.tables.HeroCfg.data[0].universalItemId = 'A碎片'; const operation = plan(facts, params('star'), cfg).actions[0];
  assert.equal(operation.action.body.universal, false); assert.deepEqual(operation.costs, [{ id: 'A碎片', num: 5 }]);
});

for (const action of ['level', 'star', 'skill']) test('real local codecs support complete hero ' + action + ' execution with synthetic transport', async () => {
  const p = params(action), client = fake({ heroes: [{ heroId: 'A', level: 1, star: action === 'skill' ? 2 : 1, power: '9007199254740993', skillLevels: [1, 1], attributes: [{ attr: 1, value: 1.5 }] }] });
  const original = client.request.bind(client); client.request = async(name, body, response) => { wire(name, body); return wire(response, await original(name, body)); };
  const opts = options(p), facts = await surveyHeroOperations(client, wireProtocol, opts), operation = planHeroOperations(facts, opts).actions[0];
  const result = await executeBusinessOperation(client, wireProtocol, operation, { adapter: heroModule, ...opts, allowMutate: true });
  assert.equal(result.status, 'SUCCESS'); assert.equal(result.verification.status, 'CONFIRMED'); assert.equal(client.writes.length, 1); assert.equal(result.afterState.power, '9007199254740993');
});

// C225: explicit existing-exclusive single LEVEL, reusing the original adapter.
import fs from 'node:fs';
import { extractTables } from '../src/config.mjs';
import { HERO_EXCLUSIVE_LEVEL_EVIDENCE } from '../src/hero-operations.mjs';
const exclusiveParams = (heroId='A') => ({heroId,action:'exclusive-level'});
const exclusiveProtocol = {...protocol,HeroExclusiveLevelUpRequest:{},HeroExclusiveNextUpResponse:{}};
function exclusiveCfg(quality='ORANGE') { return {tables:{
 HeroCfg:{data:[{id:'A',type:'英雄',quality},{id:'B',type:'英雄',quality}]},
 ExclusiveUpgradeCfg:{data:[{level:1,heroStar:15,cost:[['初级专武材料',15],['中级专武材料',5]]},{level:2,heroStar:15,cost:[['初级专武材料',4],['中级专武材料',2]]},{level:3,heroStar:16,cost:[['高级专武材料',6],['特级专武材料',3]]}]},
 ExclusiveStarCfg:{data:[{star:0,unlockLv:2,heroStar:0},{star:1,unlockLv:3,heroStar:25}]},
 ExclusiveShowCfg:{data:[{heroId:'A'},{heroId:'B'}]},ExclusiveWeaponCfg:{data:[{heroId:'A',skillLv:1},{heroId:'B',skillLv:1}]},
 ItemCfg:{data:['初级专武材料','中级专武材料','高级专武材料','特级专武材料'].map(id=>({id,type:'专武经验'}))},
}}; }
function exclusiveFake({quality='ORANGE',wireMode=false,apply=true,derived=true,watchStatus='UNKNOWN',afterWrite,config:cfg=exclusiveCfg(quality)}={}) {
 const heroes=['A','B'].map((heroId,index)=>hero(heroId,{star:15,power:'9007199254740993',equips:[{uid:String(9007199254740993n+BigInt(index)),equipId:'蓝武器1',level:1,star:0,refineLv:0,attr:[{attr:1,value:1.5,rating:2}],rerollAttrs:[]}],attributes:[{attr:1,value:20}],exclusive:{level:1,star:0}}));
 const client=fake({heroes,stock:{初级专武材料:30,中级专武材料:20,高级专武材料:10,特级专武材料:10,其他:1},watchStatus});
 client.factContext={accountId:'account-A',generation:1,connectionId:'exclusive-connection'};client.config=cfg;
 client.mutate=function(request,body){
  assert.equal(request,'HeroExclusiveLevelUpRequest');assert.deepEqual(Object.keys(body),['heroId']);this.writes.push({request,body:structuredClone(body)});
  const h=this.heroes.find(value=>value.heroId===body.heroId);
  if(apply){const next=cfg.tables.ExclusiveUpgradeCfg.data.find(row=>row.level===h.exclusive.level+1),hc=cfg.tables.HeroCfg.data.find(row=>row.id===h.heroId),cost=next.cost[hc.quality==='RED'?1:0];h.exclusive.level++;this.stock.set(cost[0],this.stock.get(cost[0])-cost[1]);if(derived){h.power=(BigInt(h.power)+8n).toString();h.attributes[0].value+=1.5;}}
  afterWrite?.(this);return h;
 };
 const original=client.request.bind(client);client.request=async(name,body,response,...args)=>{if(wireMode)wire(name,body);const value=await original(name,body,response,...args);return wireMode?wire(response,value):value;};
 return client;
}
const exclusiveOptions=(p=exclusiveParams(),cfg=exclusiveCfg(),extra={})=>({...options(p,cfg),player:{id:'17',worldId:'9',level:20},...extra});
const exclusiveSurvey=(client,cfg=client.config,p=exclusiveParams(),extra={})=>surveyHeroOperations(client,exclusiveProtocol,exclusiveOptions(p,cfg,extra));
const exclusivePlan=(facts,cfg=exclusiveCfg(),p=exclusiveParams(),extra={})=>planHeroOperations(facts,exclusiveOptions(p,cfg,extra));
async function exclusivePrepared(input={},cfg=exclusiveCfg(input.quality)){const client=exclusiveFake({...input,config:cfg}),facts=await exclusiveSurvey(client,cfg),operation=exclusivePlan(facts,cfg).actions[0];assert.ok(operation,'expected executable exclusive: '+JSON.stringify(viewHeroOperations(facts,exclusiveOptions(exclusiveParams(),cfg)).blocked));return {client,facts,operation,cfg};}
function exclusiveBudget(operation,{amount=operation.costs[0].num,uids=operation.budgetClaims.uids}={}){
 const scope={accountId:'account-A',runId:'exclusive-run',generation:1,connectionId:'exclusive-connection'},limits={resources:[{id:operation.costs[0].id,num:amount}],quotas:[],uids};
 return {scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'exclusive-batch',limits:operation.budgetClaims,ledger:null};
}
const exclusiveRun=(client,operation,cfg=client.config,extra={})=>executeBusinessOperation(client,exclusiveProtocol,operation,{adapter:heroModule,...exclusiveOptions(operation.parameters,cfg),allowMutate:true,budget:exclusiveBudget(operation),...extra});

test('exclusive selector is explicit atomic and rejects activation star universal and transport injection',async()=>{
 assert.deepEqual(validateHeroParameters(exclusiveParams()),exclusiveParams());assert.deepEqual(HERO_DEFAULT_CONFIG,{enabled:false});assert.equal(heroModule.execute,undefined);assert.ok(heroModule.capabilities.includes('C225'));
 for(const extra of [{action:'exclusive-bulk'},{action:'exclusive-activate'},{level:2},{count:2},{skillIdx:1},{universal:false},{allowUniversal:false},{request:'HeroExclusiveLevelUpRequest'},{costs:[]},{response:'HeroExclusiveNextUpResponse'}])assert.throws(()=>validateHeroParameters({...exclusiveParams(),...extra}),{code:'INVALID_PARAMETERS'});
 assert.deepEqual(buildHeroAction({kind:'exclusive-level',heroId:'A'}),{request:'HeroExclusiveLevelUpRequest',response:null,body:{heroId:'A'}});assert.equal(wireProtocol.HeroExclusiveLevelUpResponse,undefined);
 const {operation}=await exclusivePrepared();assert.equal(operation.actionType,'EXCLUSIVE-LEVEL');assert.match(operation.actionId,/^heroes:EXCLUSIVE-LEVEL:/);assert.deepEqual(operation.parameters,exclusiveParams());assert.deepEqual(operation.action,{request:'HeroExclusiveLevelUpRequest',response:null,body:{heroId:'A'}});
 assert.deepEqual(operation.costs,[{id:'初级专武材料',num:4}]);assert.deepEqual(operation.budgetClaims,{resources:operation.costs,quotas:[],uids:[{type:'hero-exclusive',id:'A'}]});assert.deepEqual(operation.expectedState.exclusive,{level:2,star:0});assert.deepEqual(Object.keys(operation.configEvidence),['HeroCfg','ExclusiveUpgradeCfg','ExclusiveStarCfg','ExclusiveShowCfg','ExclusiveWeaponCfg','ItemCfg']);
 assert.equal(HERO_EXCLUSIVE_LEVEL_EVIDENCE.realGame,'REAL_UNVERIFIED');assert.equal(HERO_EXCLUSIVE_LEVEL_EVIDENCE.activation,'EXCLUDED');
});

test('exclusive view stays opt-in and preserves exact explicit mode and observed fields',async()=>{
 const client=exclusiveFake(),facts=await exclusiveSurvey(client),defaultView=viewHeroOperations(facts,exclusiveOptions({}));assert.ok(defaultView.candidates.every(row=>row.actionType!=='EXCLUSIVE-LEVEL'));
 const view=viewHeroOperations(facts,exclusiveOptions({action:'exclusive-level'}));assert.equal(view.candidates.length,2);assert.ok(view.candidates.every(row=>row.parameters.action==='exclusive-level'&&row.actionType==='EXCLUSIVE-LEVEL'));
 assert.deepEqual(view.heroes[0].exclusive,{level:1,star:0});assert.equal(exclusivePlan(facts,client.config,{action:'exclusive-level'}).actions.length,0);assert.equal(exclusivePlan(facts,client.config,exclusiveParams(),{moduleConfig:{enabled:false}}).actions.length,0);
});

test('exclusive dependencies bind all six tables without changing legacy identity or omitted dependencies',async()=>{
 const cfg=config(),facts=await survey(fake()),before=plan(facts,params(),cfg).actions[0],augmented=structuredClone(cfg);Object.assign(augmented.tables,exclusiveCfg().tables);augmented.tables.HeroCfg=cfg.tables.HeroCfg;
 const after=plan(facts,params(),augmented).actions[0];for(const key of ['identity','actionId','parameters','action','beforeState','expectedState','costs','costSource'])assert.deepEqual(after[key],before[key],key);
 assert.deepEqual(heroDependencyVersions(options({},augmented)),heroDependencyVersions(options({},cfg)));
 const base=heroDependencyVersions(exclusiveOptions());assert.deepEqual(Object.keys(base),['moduleConfig','config.HeroCfg','config.ExclusiveUpgradeCfg','config.ExclusiveStarCfg','config.ExclusiveShowCfg','config.ExclusiveWeaponCfg','config.ItemCfg']);
 for(const table of Object.keys(exclusiveCfg().tables)){const changed=exclusiveCfg();changed.tables[table].revision=2;assert.notDeepEqual(heroDependencyVersions(exclusiveOptions(exclusiveParams(),changed)),base);}
 const unrelated=exclusiveCfg();unrelated.tables.HeroUpgradeCfg={data:[]};unrelated.tables.HeroStarCfg={data:[]};unrelated.tables.HeroSkillUpCfg={data:[]};assert.deepEqual(heroDependencyVersions(exclusiveOptions(exclusiveParams(),unrelated)),base);
});

test('exclusive own decoded fields and active positive level cannot be supplied by protobuf defaults',async()=>{
 for(const change of [h=>delete h.exclusive,h=>delete h.exclusive.level,h=>delete h.exclusive.star,h=>h.exclusive.level=0,h=>h.exclusive.level=-1,h=>h.exclusive.star=-1]){
  const client=exclusiveFake({wireMode:true});change(client.heroes[0]);const facts=await exclusiveSurvey(client);assert.equal(exclusivePlan(facts).actions.length,0);assert.equal(client.writes.length,0);
 }
 const client=exclusiveFake(),original=client.request.bind(client);client.request=async(name,...args)=>{const value=await original(name,...args);if(name==='AllHeroRequest')value.heroes[0].exclusive=Object.assign(Object.create({star:0}),{level:1});return value;};assert.equal(exclusivePlan(await exclusiveSurvey(client)).actions.length,0);
 for(const mutate of [c=>c.heroes.push(structuredClone(c.heroes[0])),c=>delete c.heroes[0].attributes,c=>c.heroes[0].attributes=[],c=>c.heroes[0].attributes=[{type:1,value:20}],c=>c.heroes[0].attributes=[{attr:1,value:20},{attr:1,value:21}]]){const client=exclusiveFake();mutate(client);assert.equal(exclusivePlan(await exclusiveSurvey(client)).actions.length,0);}
});

test('exclusive config gates exact supported hero show weapon and one quality-selected normal cost',async()=>{
 for(const mutate of [
 c=>c.tables.HeroCfg.data[0].quality='BLUE',c=>c.tables.HeroCfg.data[0].quality='PURPLE',c=>c.tables.HeroCfg.data[0].quality='UNKNOWN',c=>delete c.tables.HeroCfg.data[0].type,c=>c.tables.HeroCfg.data[0].type='宠物',c=>c.tables.HeroCfg.data.push(c.tables.HeroCfg.data[0]),
 c=>delete c.tables.ExclusiveShowCfg,c=>c.tables.ExclusiveShowCfg.data.shift(),c=>c.tables.ExclusiveShowCfg.data.push(c.tables.ExclusiveShowCfg.data[0]),
 c=>delete c.tables.ExclusiveWeaponCfg,c=>c.tables.ExclusiveWeaponCfg.data[0].skillLv=2,c=>c.tables.ExclusiveWeaponCfg.data.push(c.tables.ExclusiveWeaponCfg.data[0]),
 c=>delete c.tables.ExclusiveUpgradeCfg,c=>c.tables.ExclusiveUpgradeCfg.data.reverse(),c=>c.tables.ExclusiveUpgradeCfg.data.splice(1,1),c=>c.tables.ExclusiveUpgradeCfg.data[1].heroStar=16,c=>delete c.tables.ExclusiveUpgradeCfg.data[1].heroStar,
 c=>c.tables.ExclusiveUpgradeCfg.data[1].cost=[['初级专武材料',4]],c=>c.tables.ExclusiveUpgradeCfg.data[1].cost[0][1]=0,c=>c.tables.ExclusiveUpgradeCfg.data[1].cost[1][1]='2',c=>c.tables.ExclusiveUpgradeCfg.data[1].cost[0][1]=2147483648,c=>c.tables.ExclusiveUpgradeCfg.data[1].cost[0][0]='RUBY',
 c=>delete c.tables.ExclusiveStarCfg,c=>c.tables.ExclusiveStarCfg.data[0].unlockLv=1,c=>c.tables.ExclusiveStarCfg.data[0].star=2,c=>c.tables.ExclusiveStarCfg.data.push(c.tables.ExclusiveStarCfg.data[0]),
 c=>delete c.tables.ItemCfg,c=>c.tables.ItemCfg.data[0].type='付费材料',c=>c.tables.ItemCfg.data.push(c.tables.ItemCfg.data[0]),
 ]){const cfg=exclusiveCfg();mutate(cfg);const client=exclusiveFake({config:cfg});assert.equal(exclusivePlan(await exclusiveSurvey(client,cfg),cfg).actions.length,0);assert.equal(client.writes.length,0);}
 for(const quality of ['ORANGE','RED']){const cfg=exclusiveCfg(quality),client=exclusiveFake({quality,config:cfg});client.stock.set(quality==='ORANGE'?'中级专武材料':'初级专武材料',0);const op=exclusivePlan(await exclusiveSurvey(client,cfg),cfg).actions[0];assert.ok(op);assert.deepEqual(op.costs,[quality==='ORANGE'?{id:'初级专武材料',num:4}:{id:'中级专武材料',num:2}]);}
});

test('exclusive uses next upgrade heroStar and current exclusive star cap without star-up prerequisites',async()=>{
 const cfg=exclusiveCfg(),client=exclusiveFake({config:cfg});cfg.tables.ExclusiveStarCfg.data[0].heroStar=99;assert.equal(exclusivePlan(await exclusiveSurvey(client,cfg),cfg).actions.length,1,'StarCfg.heroStar is for STAR, not LEVEL');
 client.heroes[0].exclusive.level=2;client.heroes[0].star=16;assert.equal(exclusivePlan(await exclusiveSurvey(client,cfg),cfg).actions.length,0);client.heroes[0].exclusive.star=1;
 const op=exclusivePlan(await exclusiveSurvey(client,cfg),cfg).actions[0];assert.ok(op);assert.deepEqual(op.expectedState.exclusive,{level:3,star:1});assert.deepEqual(op.costs,[{id:'高级专武材料',num:6}]);client.heroes[0].exclusive.level=3;assert.equal(exclusivePlan(await exclusiveSurvey(client,cfg),cfg).actions.length,0);
});

test('exclusive freshness binds original sources raw hero and inventory projections without cached substitutions',async()=>{
 const original=await exclusiveSurvey(exclusiveFake());for(const mutate of [f=>f.sourceFacts.heroes.provenance.sourceAt-=31000,f=>f.sourceFacts.inventory.provenance.sourceAt=Date.now()+60000,f=>f.sourceFacts.items.provenance.generation++,f=>f.sourceFacts.resources.provenance.accountId='other',f=>f.sourceFacts.heroes.provenance.scope={kind:'CURRENT_RESPONSE_ONLY',key:'hero'},f=>f.sourceFacts.heroes.provenance.source='HeroExclusiveNextUpResponse',f=>f.heroes[0].raw.exclusive.level++,f=>f.inputs.heroes.heroes[0].exclusive.level++,f=>f.stock.set('初级专武材料',999),f=>f.sourceFacts.inventory.value.items.items[0].num=999,f=>f.exclusiveObservations[0].exclusive.star=1]){const facts=structuredClone(original);mutate(facts);assert.equal(exclusivePlan(facts).actions.length,0);}
 for(const mutate of [c=>delete c.factContext.accountId,c=>delete c.factContext.generation,c=>delete c.factContext.connectionId]){const client=exclusiveFake();mutate(client);assert.equal(exclusivePlan(await exclusiveSurvey(client)).actions.length,0);}
 for(const player of [{id:'17',level:20},{id:'0',worldId:'9',level:20},{id:'17',playerId:'18',worldId:'9',level:20}])assert.equal(exclusivePlan(await exclusiveSurvey(exclusiveFake(),undefined,exclusiveParams(),{player})).actions.length,0);
 const client=exclusiveFake(),available={...exclusiveProtocol};delete available.HeroExclusiveLevelUpRequest;assert.equal(exclusivePlan(await surveyHeroOperations(client,available,exclusiveOptions())).actions.length,0);
});

for(const slow of ['AllHeroRequest','AllResourceRequest'])test('exclusive slow '+slow+' never refreshes early response completion times',async()=>{
 const realNow=Date.now;let now=1000000;Date.now=()=>now;
 try{const client=exclusiveFake(),request=client.request.bind(client);client.request=async(name,...args)=>{if(name===slow){await new Promise(resolve=>setImmediate(resolve));now+=31000;}return request(name,...args);};const facts=await exclusiveSurvey(client);assert.equal(exclusivePlan(facts).actions.length,0);assert.equal(facts.sourceFacts.inventory.provenance.sourceAt,1000000);assert.equal(facts.sourceFacts[slow==='AllHeroRequest'?'heroes':'resources'].provenance.sourceAt,1031000);}finally{Date.now=realNow;}
});

for(const quality of ['ORANGE','RED'])for(const wireMode of [false,true])for(const derived of [false,true])test('exclusive exact full authority confirms '+quality+' codec '+wireMode+' derived '+derived,async()=>{
 const {client,operation,cfg}=await exclusivePrepared({quality,wireMode,derived});const result=await exclusiveRun(client,operation,cfg);assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(result.responseEvidence,null);assert.equal(client.writes.length,1);assert.equal(client.heroes[0].exclusive.level,2);assert.equal(client.heroes[0].exclusive.star,0);assert.equal(client.uncertainWrites.size,0);assert.equal(client.stock.get(quality==='RED'?'中级专武材料':'初级专武材料'),quality==='RED'?18:26);
});

for(const watchStatus of ['UNKNOWN','SUCCESS'])test('exclusive '+watchStatus+' watch or nextHero PREVIEW without actual effect remains UNKNOWN',async()=>{
 const {client,operation,cfg}=await exclusivePrepared({apply:false}),budget=exclusiveBudget(operation);client.sendWatch=async(name,body)=>{client.mutate(name,body);return {status:watchStatus,nextHero:{...structuredClone(client.heroes[0]),exclusive:{level:2,star:0}}};};const result=await exclusiveRun(client,operation,cfg,{budget});assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,1);assert.deepEqual(budget.runBudget.snapshot().reserved.resources,operation.costs);assert.deepEqual(budget.runBudget.snapshot().reserved.uids,operation.budgetClaims.uids);
});

test('exclusive success requires exactly level plus one and rejects all unrelated target owner or stock drift',async()=>{
 const changes=[c=>c.heroes[0].exclusive.level++,c=>c.heroes[0].exclusive.star++,c=>c.heroes[0].exclusive.other=true,c=>c.heroes[0].level++,c=>c.heroes[0].star++,c=>c.heroes[0].skillLevels[0]++,c=>c.heroes[0].equips[0].uid='123',c=>c.heroes[0].heroId='C',c=>c.heroes[1].power='44',c=>c.heroes[1].exclusive.level++,c=>c.heroes.pop(),c=>c.stock.set('初级专武材料',27),c=>c.stock.set('中级专武材料',19),c=>c.stock.set('其他',2),c=>c.stock.set('reward',1),c=>delete c.heroes[0].attributes,c=>c.heroes[0].attributes=[{attr:1,value:Infinity}],c=>c.heroes[0].power=-1];
 for(const afterWrite of changes){const {client,operation,cfg}=await exclusivePrepared({afterWrite}),result=await exclusiveRun(client,operation,cfg);assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(client.writes.length,1);}
});

test('exclusive verify reconstructs complete config action claims costs and identity contract',async()=>{
 const {client,facts,operation,cfg}=await exclusivePrepared();client.mutate('HeroExclusiveLevelUpRequest',{heroId:'A'});const after=await exclusiveSurvey(client,cfg);assert.equal(verifyHeroOperation(operation,facts,after,{nextHero:client.heroes[1]}).confirmed,true);
 for(const mutate of [o=>o.actionId='fake',o=>o.parameters.action='level',o=>o.actionType='LEVEL',o=>o.action.response='HeroExclusiveNextUpResponse',o=>o.action.body.heroId='B',o=>o.action.body.universal=false,o=>o.target.heroId='B',o=>o.costs[0].num=1,o=>o.costs=[],o=>o.budgetClaims.uids=[],o=>o.budgetClaims.resources=[],o=>o.identity='fake',o=>o.costSource='fake',o=>o.expectedState.exclusive.star++,o=>o.beforeState.exclusive.level++,o=>o.configEvidence.ExclusiveUpgradeCfg.data[1].cost[0][1]=1,o=>delete o.configEvidence.ExclusiveWeaponCfg]){const op=structuredClone(operation);mutate(op);assert.equal(verifyHeroOperation(op,facts,after).confirmed,false);}
});

test('exclusive changed state relevant config or account player world generation connection stops before dispatch',async()=>{
 for(const mutate of [c=>c.heroes[0].exclusive.level++,c=>c.heroes[1].star++,c=>c.stock.set('初级专武材料',0),c=>c.factContext.accountId='other',c=>c.factContext.generation++,c=>c.factContext.connectionId='new']){const {client,operation,cfg}=await exclusivePrepared();mutate(client);assert.equal((await exclusiveRun(client,operation,cfg)).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);}
 for(const player of [{id:'18',worldId:'9',level:20},{id:'17',worldId:'10',level:20}]){const {client,operation,cfg}=await exclusivePrepared();assert.equal((await exclusiveRun(client,operation,cfg,{player})).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);}
 for(const table of Object.keys(exclusiveCfg().tables)){const {client,operation,cfg}=await exclusivePrepared();cfg.tables[table].revision=2;assert.equal((await exclusiveRun(client,operation,cfg)).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);}
});

test('exclusive resource and hero-exclusive UID parent claims are atomic and retained across batches',async()=>{
 for(const bounds of [{amount:3},{uids:[]}]){const {client,operation,cfg}=await exclusivePrepared(),budget=exclusiveBudget(operation,bounds),result=await exclusiveRun(client,operation,cfg,{budget});assert.equal(result.status,'NOT_EXECUTED');assert.equal(client.writes.length,0);assert.deepEqual(budget.runBudget.snapshot().reserved,{resources:[],quotas:[],uids:[]});}
 const {client,operation,cfg}=await exclusivePrepared();cfg.tables.ExclusiveStarCfg.data[0].unlockLv=3;cfg.tables.ExclusiveUpgradeCfg.data[2].heroStar=15;const facts=await exclusiveSurvey(client,cfg),first=exclusivePlan(facts,cfg).actions[0],scope={accountId:'account-A',runId:'exclusive-run',generation:1,connectionId:'exclusive-connection'},runBudget=createRunBudgetContext({scope,limits:{resources:[{id:'初级专武材料',num:30},{id:'高级专武材料',num:10}],quotas:[],uids:[{type:'hero-exclusive',id:'A'}]}}),budget={scope,runBudget,batchId:'one',limits:first.budgetClaims,ledger:null};
 assert.equal((await exclusiveRun(client,first,cfg,{budget})).status,'SUCCESS');const second=exclusivePlan(await exclusiveSurvey(client,cfg),cfg).actions[0];assert.ok(second);assert.equal((await exclusiveRun(client,second,cfg,{budget:{...budget,batchId:'two',limits:second.budgetClaims}})).status,'NOT_EXECUTED');assert.equal(client.writes.length,1);
});

test('exclusive cancellation late results and post-write read or history failure never replay',async()=>{
 const first=await exclusivePrepared(),before=new AbortController();before.abort();assert.equal((await exclusiveRun(first.client,first.operation,first.cfg,{signal:before.signal})).status,'CANCELLED');assert.equal(first.client.writes.length,0);
 const second=await exclusivePrepared(),after=new AbortController();let release;second.client.sendWatch=async(name,body)=>{second.client.mutate(name,body);after.abort();return new Promise(resolve=>{release=()=>resolve({status:'SUCCESS'});});};const result=await exclusiveRun(second.client,second.operation,second.cfg,{signal:after.signal});assert.equal(result.status,'UNKNOWN');release();await Promise.resolve();assert.equal(result.status,'UNKNOWN');assert.equal(second.client.writes.length,1);
 for(const mode of ['read','history']){const {client,operation,cfg}=await exclusivePrepared(),request=client.request.bind(client);if(mode==='read')client.request=async(name,...args)=>client.writes.length&&name==='AllHeroRequest'?Promise.reject(Error('unavailable')):request(name,...args);const result=await exclusiveRun(client,operation,cfg,mode==='history'?{onStage(stage){if(stage==='DISPATCHED')throw Error('durable failure');}}:{});assert.equal(result.status,'UNKNOWN');assert.equal(client.writes.length,1);}
});

test('exclusive fact expiry after resource wait intent persistence or last authority callback prevents dispatch',async()=>{
 const realNow=Date.now;let now=1000000;Date.now=()=>now;
 try{for(const mode of ['resource','intent','last']){now=1000000;const {client,operation,cfg}=await exclusivePrepared(),budget=exclusiveBudget(operation);let observedIntent=false,lastCallbacks=0;
  const result=await exclusiveRun(client,operation,cfg,{budget,onStage(stage){if(mode==='resource'&&stage==='RESOURCE_PREFLIGHT')now+=31000;if(stage==='DISPATCH_INTENT'){observedIntent=true;if(mode==='intent')now+=31000;}},assertCurrent(){if(mode==='last'&&observedIntent&&++lastCallbacks===2)now+=31000;}});
  assert.equal(result.status,'NOT_EXECUTED');assert.equal(client.writes.length,0);assert.equal(client.stock.get('初级专武材料'),30);if(mode==='resource')assert.deepEqual(budget.runBudget.snapshot().reserved,{resources:[],quotas:[],uids:[]});else assert.deepEqual(budget.runBudget.snapshot().reserved.uids,operation.budgetClaims.uids);
 }}finally{Date.now=realNow;}
});

test('fixed actual exclusive config selects ORANGE or RED cost and current star cap without invented fallback',async()=>{
 const cfg={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))};
 for(const quality of ['ORANGE','RED']){const hc=cfg.tables.HeroCfg.data.find(row=>row.type==='英雄'&&row.quality===quality&&cfg.tables.ExclusiveShowCfg.data.some(show=>show.heroId===row.id));assert.ok(hc);const client=exclusiveFake({config:cfg});client.heroes=[hero(hc.id,{star:15,power:'9007199254740993',attributes:[{attr:1,value:20}],exclusive:{level:1,star:0}})];for(const item of ['初级专武材料','中级专武材料','高级专武材料','特级专武材料'])client.stock.set(item,1000);const p=exclusiveParams(hc.id),op=exclusivePlan(await exclusiveSurvey(client,cfg,p),cfg,p).actions[0];assert.ok(op);assert.deepEqual(op.costs,[quality==='ORANGE'?{id:'初级专武材料',num:20}:{id:'中级专武材料',num:5}]);client.heroes[0].exclusive.level=50;assert.equal(exclusivePlan(await exclusiveSurvey(client,cfg,p),cfg,p).actions.length,0);client.heroes[0].exclusive.star=1;assert.equal(exclusivePlan(await exclusiveSurvey(client,cfg,p),cfg,p).actions.length,1);}
});
test('exclusive codec fixture preserves complete equipment and rejects incomplete encoded authority',async()=>{
 const client=exclusiveFake({wireMode:true}),facts=await exclusiveSurvey(client);assert.equal(facts.heroesReliable,true);assert.equal(facts.heroes.length,2);
 for(const row of facts.heroes){const expected=client.heroes.find(hero=>hero.heroId===row.heroId).equips[0],actual=row.raw.equips[0];assert.deepEqual(actual,expected);assert.equal(typeof actual.uid,'string');assert.ok(BigInt(actual.uid)>BigInt(Number.MAX_SAFE_INTEGER));}
 assert.equal(exclusivePlan(facts).actions.length,1);
 const incomplete=exclusiveFake({wireMode:true});delete incomplete.heroes[0].equips[0].equipId;
 assert.throws(()=>wire('AllHeroResponse',{heroes:incomplete.heroes}));
 const missing=await exclusiveSurvey(incomplete);assert.equal(missing.heroesReliable,false);assert.equal(exclusivePlan(missing).actions.length,0);assert.equal(incomplete.writes.length,0);
});
test('exclusive malformed numeric authority blocks before protobuf int32 normalization',async()=>{
 for(const field of ['level','star']){const client=exclusiveFake();client.heroes[0].exclusive[field]=1.5;assert.equal(exclusivePlan(await exclusiveSurvey(client)).actions.length,0);assert.equal(client.writes.length,0);}
 // int32 encoding truncates fractional fixture values. Test invalid source state
 // directly; a decoded integer must not masquerade as coverage of fractions.
 const decoded=wire('HeroExclusive',{level:1.5,star:1.5});assert.equal(decoded.level,1);assert.equal(decoded.star,1);
});

test('exclusive exact effect cannot be confirmed by a fresh but older source',async()=>{
 const {client,facts,operation,cfg}=await exclusivePrepared();client.mutate('HeroExclusiveLevelUpRequest',{heroId:'A'});const after=await exclusiveSurvey(client,cfg);
 assert.equal(verifyHeroOperation(operation,facts,after).confirmed,true);
 for(const key of ['heroes','items','resources']){
  const stale=structuredClone(after);stale.sourceFacts[key].provenance.sourceAt=facts.sourceFacts[key].provenance.sourceAt-1;
  stale.sourceFacts.inventory.provenance.sourceAt=Math.min(stale.sourceFacts.items.provenance.sourceAt,stale.sourceFacts.resources.provenance.sourceAt);
  assert.deepEqual(verifyHeroOperation(operation,facts,stale),{confirmed:false,reason:'EXCLUSIVE_POST_WRITE_SOURCE_PREDATES_PRE_WRITE'});
 }
});

const exchangeParams = (heroId='A',num=7) => ({action:'fragment-exchange',heroId,num});
function exchangeCfg(quality='BLUE') {
 const source={BLUE:'蓝卡万能碎片',PURPLE:'紫卡万能碎片',ORANGE:'橙卡万能碎片',RED:'红卡万能碎片'}[quality];
 return {tables:{HeroCfg:{data:['A','B'].map(id=>({id,type:'英雄',quality,universalItemId:source}))},ItemCfg:{data:[{id:source,type:'英雄万能碎片',quality},...['A','B'].map(id=>({id:id+'碎片',type:'英雄碎片',quality}))]}}};
}
function exchangeFake({quality='BLUE',apply=true,afterWrite,stock=20}={}) {
 const cfg=exchangeCfg(quality),source=cfg.tables.HeroCfg.data[0].universalItemId;
 const client=fake({stock:{[source]:stock,A碎片:10,B碎片:3,其他:2}});
 client.factContext={accountId:'account-A',generation:1,connectionId:'exchange-connection'};client.config=cfg;
 client.mutate=function(request,body){assert.equal(request,'HeroFragExchangeRequest');wire(request,body);this.writes.push({request,body:structuredClone(body)});if(apply){this.stock.set(source,this.stock.get(source)-body.num);this.stock.set(body.fragItemId,(this.stock.get(body.fragItemId)??0)+body.num);}afterWrite?.(this);};
 return client;
}
const exchangeOptions=(p=exchangeParams(),cfg=exchangeCfg())=>({...options(p,cfg),player:{id:'17',worldId:'9',level:20}});
const exchangeSurvey=(client,p=exchangeParams())=>surveyHeroOperations(client,wireProtocol,exchangeOptions(p,client.config));
const exchangePlan=(facts,client,p=exchangeParams())=>planHeroOperations(facts,exchangeOptions(p,client.config));
async function exchangePrepared(input={}){const client=exchangeFake(input),facts=await exchangeSurvey(client),operation=exchangePlan(facts,client).actions[0];assert.ok(operation);return {client,facts,operation};}
test('explicit fragment exchange uses target fragment, owned quality source and exact quantity across all four qualities',async()=>{
 assert.equal(wireProtocol.HeroFragExchangeResponse,undefined);
 for(const quality of ['BLUE','PURPLE','ORANGE','RED']){
  const {client,facts,operation}=await exchangePrepared({quality});
  assert.deepEqual(operation.action,{request:'HeroFragExchangeRequest',response:null,body:{heroId:'A',fragItemId:'A碎片',num:7}});
  assert.deepEqual(operation.costs,[{id:client.config.tables.HeroCfg.data[0].universalItemId,num:7}]);
  assert.deepEqual(operation.budgetClaims,{resources:operation.costs,quotas:[],uids:[{type:'hero-fragment-exchange',id:'A'}]});
  assert.equal(operation.expectedState.targetNum,17);client.mutate(operation.action.request,operation.action.body);
  const verified=verifyHeroOperation(operation,facts,await exchangeSurvey(client));assert.equal(verified.confirmed,true);assert.equal(verified.responseEvidence,null);
  const view=viewHeroOperations(facts,exchangeOptions(exchangeParams(),client.config));assert.equal(view.candidates[0].actionType,'FRAGMENT-EXCHANGE');assert.equal(view.fragments[0].sourceNum,20);
 }
 const {client,facts}=await exchangePrepared();assert.equal(exchangePlan(facts,client,exchangeParams('A',20)).actions.length,1,'explicit quantity may exceed next star deficit');
 assert.equal(viewHeroOperations(facts,exchangeOptions({},client.config)).candidates.some(row=>row.actionType==='FRAGMENT-EXCHANGE'),false);
 assert.equal(exchangePlan(facts,client,{...params('star'),allowUniversal:true}).actions.length,0);
});
test('fragment parameters reject injection, invalid quantity and wrong action scopes',()=>{
 for(const p of [exchangeParams('A',0),exchangeParams('A',-1),exchangeParams('A',1.2),exchangeParams('A',2147483648),exchangeParams('A','7'),{...exchangeParams(),allowUniversal:false},{...exchangeParams(),fragItemId:'A碎片'},{...exchangeParams(),sourceId:'蓝卡万能碎片'},{...exchangeParams(),skillIdx:1},{action:'level',num:1}])assert.throws(()=>validateHeroParameters(p),{code:'INVALID_PARAMETERS'});
});
test('fragment exchange requires exact complete fresh state, context, configuration and affordability',async()=>{
 const mutations=[
  c=>delete c.factContext,c=>c.factContext.accountId='',c=>c.heroes.push(structuredClone(c.heroes[0])),
  c=>c.config.tables.HeroCfg.data[0].universalItemId='紫卡万能碎片',
  c=>c.config.tables.HeroCfg.data[0].type='宠物',c=>c.config.tables.HeroCfg.data.push(c.config.tables.HeroCfg.data[0]),
  c=>c.config.tables.ItemCfg.data[0].type='英雄碎片',c=>c.config.tables.ItemCfg.data[1].quality='PURPLE',
  c=>c.config.tables.ItemCfg.data.push(c.config.tables.ItemCfg.data[0]),c=>c.stock.set('蓝卡万能碎片',6),
  c=>c.stock.set('A碎片',Number.MAX_SAFE_INTEGER)
 ];
 for(const mutate of mutations){const client=exchangeFake();mutate(client);assert.equal(exchangePlan(await exchangeSurvey(client),client).actions.length,0);assert.equal(client.writes.length,0);}
 const {client,facts}=await exchangePrepared();facts.sourceFacts.heroes.provenance.sourceAt-=31000;assert.equal(exchangePlan(facts,client).actions.length,0);
 const fresh=await exchangeSurvey(client);assert.equal(exchangePlan(fresh,client,{action:'fragment-exchange'}).actions.length,0);
 for(const table of ['HeroCfg','ItemCfg']){const before=heroDependencyVersions(exchangeOptions());const cfg=exchangeCfg();cfg.tables[table].revision=2;assert.notDeepEqual(heroDependencyVersions(exchangeOptions(exchangeParams(),cfg)),before);}
});
test('fragment verification rejects fabricated replies, collateral changes, context and contract tampering',async()=>{
 for(const change of [c=>c.stock.set('A碎片',16),c=>c.stock.set('蓝卡万能碎片',14),c=>c.stock.set('其他',3),c=>c.heroes[0].star++,c=>c.heroes[1].power++,c=>c.factContext.generation++]){const {client,facts,operation}=await exchangePrepared({afterWrite:change});client.mutate(operation.action.request,operation.action.body);assert.equal(verifyHeroOperation(operation,facts,await exchangeSurvey(client),{success:true}).confirmed,false);}
 const {client,facts,operation}=await exchangePrepared();client.mutate(operation.action.request,operation.action.body);const after=await exchangeSurvey(client);assert.equal(verifyHeroOperation(operation,facts,after).confirmed,true);
 for(const change of [o=>o.action.body.fragItemId='蓝卡万能碎片',o=>o.action.body.num++,o=>o.costs[0].num--,o=>o.expectedState.targetNum++,o=>o.budgetClaims.resources=[],o=>o.budgetClaims.uids=[],o=>o.identity='forged',o=>o.configEvidence.ItemCfg.data[0].type='英雄碎片']){const altered=structuredClone(operation);change(altered);assert.equal(verifyHeroOperation(altered,facts,after).confirmed,false);}
 const old=structuredClone(after);old.sourceFacts.items.provenance.sourceAt=facts.sourceFacts.items.provenance.sourceAt-1;assert.equal(verifyHeroOperation(operation,facts,old).confirmed,false);
});
test('fragment shared executor preserves UNKNOWN and reserved source without authoritative effect',async()=>{
 const {client,operation}=await exchangePrepared({apply:false}),scope={accountId:'account-A',runId:'fragment-run',generation:1,connectionId:'exchange-connection'};
 const budget={scope,runBudget:createRunBudgetContext({scope,limits:operation.budgetClaims}),batchId:'fragment-batch',limits:operation.budgetClaims,ledger:null};
 const result=await executeBusinessOperation(client,wireProtocol,operation,{adapter:heroModule,...exchangeOptions(operation.parameters,client.config),allowMutate:true,budget});
 assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,1);assert.deepEqual(budget.runBudget.snapshot().reserved.resources,operation.costs);
});

test('fragment independent verifier requires credit even when target was absent from complete inventory',async()=>{
 const client=exchangeFake();client.stock.delete('A碎片');const before=await exchangeSurvey(client),op=exchangePlan(before,client).actions[0];assert.ok(op);client.stock.set('蓝卡万能碎片',13);assert.equal(verifyHeroOperation(op,before,await exchangeSurvey(client)).confirmed,false);client.stock.set('A碎片',7);assert.equal(verifyHeroOperation(op,before,await exchangeSurvey(client)).confirmed,true);
});
test('fragment fixed config maps actual hero qualities and target IDs without invented source defaults',async()=>{
 const cfg={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))};
 for(const quality of ['BLUE','PURPLE','ORANGE','RED']){
  const hc=cfg.tables.HeroCfg.data.find(row=>row.type==='英雄'&&row.quality===quality);assert.ok(hc);const client=exchangeFake({quality});client.config=cfg;client.heroes=[hero(hc.id)];client.stock=new Map([[hc.universalItemId,20]]);const p=exchangeParams(hc.id),op=exchangePlan(await exchangeSurvey(client,p),client,p).actions[0];assert.ok(op);assert.deepEqual(op.action.body,{heroId:hc.id,fragItemId:hc.id+'碎片',num:7});assert.deepEqual(op.costs,[{id:hc.universalItemId,num:7}]);
 }
});
