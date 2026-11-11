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
