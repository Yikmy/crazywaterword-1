// C228: add one level to an already worn badge using owned EXP items and GOLD.
import { createHash } from 'node:crypto';
import { assertPaymentAllowed } from './actions.mjs';
import { stableBusinessValue } from './business-functions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { parseOperationHero, parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity } from './resource-ledger.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';

const moduleId = 'badge-growth';
const request = 'EnhanceBadgeRequest', response = 'EnhanceBadgeResponse';
const xpItem = '徽章经验', gold = 'GOLD';
const tables = ['HeroCfg', 'HeroBadgeCfg', 'HeroBadgeAttrCfg', 'HeroBadgeLevelCfg', 'HeroBadgeUnlockCfg'];
const maxAgeMs = 30000, scope = Object.freeze({ kind: 'ACCOUNT' });
const source = 'v76 /subpackages/main/game.js: BadgeLvUpPop._onBtnUse; BadgeUtil.calBadgeEnhanceNextLevelExp/calBadgeEnhanceGold/getBadgeMaxLevel; AllItemsModel.WellKnownItems.BADGE_EXP_ITEM';
export const BADGE_GROWTH_DEFAULT_CONFIG = Object.freeze({ enabled: false });
export const BADGE_GROWTH_EVIDENCE = Object.freeze({
  source, request, response, scope: 'EXPLICIT_WORN_ZERO_XP_ONE_LEVEL_NO_SACRIFICE',
  packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  entrySha256: 'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',
  protocolSha256: 'ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc',
  configSha256: '0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762',
  levelPop: Object.freeze({ byteOffset: 444143, requestByteOffset: 462596, sha256: '1549644e41b1f5f4eacc9b4ec885a69812fdd9c909f16c5da40a4e38bdc7fa78' }),
  badgeUtil: Object.freeze({ byteOffset: 491453, calculationsByteOffset: 492507, sha256: '32514180e48237a817e08a2b47b7dd192583e7899fa1cde0379a8005eb9f2b7e' }),
  badgeSlots: Object.freeze({ byteOffset: 3475775, sha256: '9ba10c29b278ea8606c4142f7de61f6f5da2f148e79e004a3733baf70ecf1e6a' }),
  realGame: 'REAL_UNVERIFIED',
});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => object(value) && Object.hasOwn(value, key);
const dense = value => Array.isArray(value) && value.length <= 10000
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, index))
    .every(d => d?.enumerable && Object.hasOwn(d, 'value'));
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const uint = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const positive = value => uint(value) && value > 0;
const slot = value => positive(value) && value <= 4;
const unique = (rows, key) => new Set(rows.map(key)).size === rows.length;
const finite = value => typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
const same = (a, b) => stableBusinessValue(a) === stableBusinessValue(b);
const hash = value => createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const copy = value => structuredClone(value);
const missing = (value, keys) => keys.some(key => !own(value, key));
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const fields = (value, keys) => object(value) && Reflect.ownKeys(value).every(key => {
  const d = Object.getOwnPropertyDescriptor(value, key);
  return keys.includes(key) && d?.enumerable && Object.hasOwn(d, 'value');
});
const plainFields = (value, keys) => fields(value, keys) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_PARAMETERS', statusCode: 400 });

function exactPositive(value) {
  const normalized = toSnapshotJson(value);
  const decimal = Number.isSafeInteger(normalized) && normalized > 0 ? String(normalized) : normalized;
  return typeof decimal === 'string' && /^[1-9][0-9]{0,18}$/.test(decimal) && BigInt(decimal) < (1n << 63n) ? decimal : null;
}

export function validateBadgeGrowthConfig(config = {}) {
  if (!plainFields(config, ['enabled']) || own(config, 'enabled') && typeof config.enabled !== 'boolean') {
    throw invalid('纹章升级配置仅允许 enabled 布尔值');
  }
  return { enabled: config.enabled ?? false };
}

export function validateBadgeGrowthParameters(parameters = {}) {
  if (!plainFields(parameters, ['heroId', 'uid'])) throw invalid('纹章升级参数仅允许 heroId 和 uid');
  const out = {};
  if (own(parameters, 'heroId')) {
    if (!id(parameters.heroId)) throw invalid('heroId 必须为明确英雄 ID');
    out.heroId = parameters.heroId;
  }
  if (own(parameters, 'uid')) {
    if (typeof parameters.uid !== 'string' || exactPositive(parameters.uid) !== parameters.uid) throw invalid('uid 必须为精确正 int64 十进制字符串');
    out.uid = parameters.uid;
  }
  return out;
}

function readCatalog(config) {
  const [heroes, badges, attrs, levels, unlocks] = tables.map(name => config?.tables?.[name]?.data);
  if (![heroes, badges, attrs, levels, unlocks].every(rows => dense(rows) && rows.length > 0)) return null;
  if (!heroes.every(r => !missing(r, ['id', 'type', 'career']) && id(r.id) && id(r.type) && id(r.career))
      || !unique(heroes, r => r.id)
      || !badges.every(r => !missing(r, ['id', 'career']) && id(r.id) && id(r.career))
      || !unique(badges, r => r.id)
      || !attrs.every(r => !missing(r, ['id', 'star', 'maxLevel']) && badges.some(b => b.id === r.id) && uint(r.star) && positive(r.maxLevel))
      || !unique(attrs, r => JSON.stringify([r.id, r.star]))
      || !levels.every(r => !missing(r, ['level', 'exp', 'goldExpRadio']) && positive(r.level)
        && (r.level === 1 ? r.exp === 0 && r.goldExpRadio === 0 : positive(r.exp) && positive(r.goldExpRadio)))
      || !unique(levels, r => r.level)
      || unlocks.length !== 4 || !unlocks.every(r => !missing(r, ['pos', 'level']) && slot(r.pos) && positive(r.level))
      || !unique(unlocks, r => r.pos)) return null;
  return {
    heroes: heroes.map(({ id, type, career }) => ({ id, type, career })),
    badges: badges.map(({ id, career }) => ({ id, career })),
    attrs: attrs.map(({ id, star, maxLevel }) => ({ id, star, maxLevel })),
    levels: levels.map(({ level, exp, goldExpRadio }) => ({ level, exp, goldExpRadio })),
    unlocks: unlocks.map(({ pos, level }) => ({ pos, level })),
  };
}

function parseBadge(raw, worn) {
  const keys = ['uid', 'badgeId', 'level', 'star', worn ? 'pos' : 'exp'];
  if (missing(raw, keys) || !fields(raw, [...keys, 'attr']) || !id(raw.badgeId) || !positive(raw.level)
      || !uint(raw.star) || !(worn ? slot(raw.pos) : uint(raw.exp))) return null;
  const uid = exactPositive(raw.uid);
  if (!uid) return null;
  if (own(raw, 'attr')) {
    const attr = raw.attr;
    if (missing(attr, ['attr', 'value']) || !fields(attr, ['attr', 'value', 'rating'])
        || !uint(attr.attr) || !finite(attr.value) || own(attr, 'rating') && !uint(attr.rating)) return null;
  }
  return { ...toSnapshotJson(raw), uid };
}

// BadgeModel.setData uses the whole Badges pool. Its fixupBadge derives owners
// from AllHero; the hero mirror has a position and omits the pool's XP field.
export function parseBadgeOwnership(badges, heroes) {
  if (!own(badges, 'badge') || !dense(badges.badge) || !own(heroes, 'heroes') || !dense(heroes.heroes) || !heroes.heroes.length) return null;
  const pool = badges.badge.map(raw => parseBadge(raw, false));
  if (pool.some(row => !row) || !unique(pool, row => row.uid)) return null;
  const byUid = new Map(pool.map(row => [row.uid, row]));
  const wornUids = new Set(), roster = [];
  for (const raw of heroes.heroes) {
    const parsed = parseOperationHero(raw);
    if (!parsed || !own(raw, 'badges') || !dense(raw.badges) || raw.badges.length > 4) return null;
    const slots = raw.badges.map(row => parseBadge(row, true));
    if (slots.some(row => !row) || !unique(slots, row => row.pos)) return null;
    for (const worn of slots) {
      const bag = byUid.get(worn.uid);
      if (!bag || wornUids.has(worn.uid) || !same(without(worn, ['pos']), without(bag, ['exp']))) return null;
      wornUids.add(worn.uid);
    }
    roster.push({ ...parsed.raw, badges: slots.sort((a, b) => a.pos - b.pos) });
  }
  if (!unique(roster, hero => hero.heroId)) return null;
  return { heroes: roster.sort((a, b) => a.heroId.localeCompare(b.heroId)), pool: pool.sort((a, b) => a.uid.localeCompare(b.uid)) };
}

function contextOf(client, player) {
  const ids = ['id', 'playerId'].filter(key => own(player, key)).map(key => exactPositive(player[key]));
  const { accountId, generation, connectionId } = client.factContext ?? {};
  return {
    accountId: id(accountId) ? accountId : null,
    generation: Number.isSafeInteger(generation) && generation >= 0 ? generation : null,
    connectionId: id(connectionId) ? connectionId : null,
    playerId: ids.length && ids.every(value => value !== null && value === ids[0]) ? ids[0] : null,
    worldId: own(player, 'worldId') ? exactPositive(player.worldId) : null,
  };
}

function derivedReliable(hero) {
  return own(hero, 'attributes') && dense(hero.attributes) && hero.attributes.length > 0
    && hero.attributes.every(row => !missing(row, ['attr', 'value']) && fields(row, ['attr', 'value']) && uint(row.attr) && finite(row.value))
    && unique(hero.attributes, row => row.attr);
}

const queries = Object.freeze([
  ['badges', 'BadgesRequest', 'BadgesResponse'],
  ['heroes', 'AllHeroRequest', 'AllHeroResponse'],
  ['items', 'AllItemRequest', 'AllItemResponse'],
  ['resources', 'AllResourceRequest', 'AllResourceResponse'],
]);

export async function surveyBadgeGrowth(client, protocol, { config, player, parameters = {}, signal, stop, timeout = 15000 } = {}) {
  parameters = validateBadgeGrowthParameters(parameters);
  const active = () => assertExecutionActive(client, { signal, stop });
  const identityContext = contextOf(client, player), notes = [];
  active();
  const observations = await Promise.all(queries.map(async ([key, query, type]) => {
    active();
    if (protocol?.[query] && protocol?.[type]) {
      try {
        const value = await awaitExecution(client.request(query, {}, type, timeout, { signal }), client, { signal, stop });
        return { key, type, value, sourceAt: Date.now() };
      } catch (error) {
        if (executionOutcome(error) === 'CANCELLED') throw error;
        notes.push(query + ': STATE_UNKNOWN');
      }
    } else notes.push(query + ': PROTOCOL_UNAVAILABLE');
    return { key, type, value: null, sourceAt: Date.now() };
  }));
  active();
  if (!same(identityContext, contextOf(client, player))) throw Object.assign(new Error('纹章调查期间账号或连接已改变'), { code: 'CANCELLED' });
  const raw = Object.fromEntries(observations.map(({ key, value }) => [key, value]));
  const inputs = toSnapshotJson(raw);
  const ownership = parseBadgeOwnership(raw.badges, raw.heroes) && parseBadgeOwnership(inputs.badges, inputs.heroes);
  const inventory = parseOperationInventory(raw.items, raw.resources).stockReliable
    ? parseOperationInventory(inputs.items, inputs.resources) : { stock: new Map(), stockReliable: false };
  const sourceFacts = Object.fromEntries(observations.map(({ key, type, sourceAt }, index) => [key, createStateFact(inputs[key], {
    accountId: identityContext.accountId, generation: identityContext.generation, source: type, sourceAt, scope,
    reliable: index < 2 ? ownership !== null : inventory.stockReliable,
  })]));
  return {
    module: moduleId, parameters, identityContext, catalog: readCatalog(config), ownership, ...inventory, inputs, sourceFacts,
    available: Object.keys(protocol ?? {}), notes, state: { identityContext, ownership },
  };
}

function freshFacts(facts) {
  const context = facts?.identityContext, now = Date.now();
  return queries.every(([key, , type]) => {
    const fact = facts?.sourceFacts?.[key];
    return fact?.provenance?.source === type && factsFreshnessPolicy(fact, {
      accountId: context?.accountId, generation: context?.generation, now, maxAgeMs, scope,
    }).status === 'FRESH';
  });
}

function authority(facts, config) {
  const ctx = facts?.identityContext, inputs = facts?.inputs;
  if (!id(ctx?.accountId) || !id(ctx.connectionId) || !Number.isSafeInteger(ctx.generation) || ctx.generation < 0
      || !ctx.playerId || exactPositive(ctx.playerId) !== ctx.playerId || !ctx.worldId || exactPositive(ctx.worldId) !== ctx.worldId
      || !facts.catalog || !same(facts.catalog, readCatalog(config))) return false;
  if (!freshFacts(facts) || !queries.every(([key]) => same(facts.sourceFacts[key].value, inputs?.[key]))) return false;
  const ownership = parseBadgeOwnership(inputs?.badges, inputs?.heroes), inventory = parseOperationInventory(inputs?.items, inputs?.resources);
  return ownership !== null && same(ownership, facts.ownership) && inventory.stockReliable && facts.stockReliable === true
    && facts.stock instanceof Map && same([...inventory.stock], [...facts.stock]) && freshFacts(facts);
}

function configEvidence(config) {
  return Object.fromEntries(tables.map(name => [name, copy(config?.tables?.[name] ?? null)]));
}

export function badgeGrowthDependencyVersions({ config, moduleConfig = BADGE_GROWTH_DEFAULT_CONFIG } = {}) {
  return { moduleConfig: validateBadgeGrowthConfig(moduleConfig), ...Object.fromEntries(
    Object.entries(configEvidence(config)).map(([name, value]) => ['config.' + name, value]),
  ) };
}

function candidate(facts, params, { config, moduleConfig, authoritative, includePlanEvidence = true } = {}) {
  const ownership = authoritative ? facts.ownership : null;
  const hero = ownership?.heroes.find(row => row.heroId === params.heroId);
  const worn = hero?.badges.find(row => row.uid === params.uid);
  const badge = worn && ownership.pool.find(row => row.uid === worn.uid);
  const catalog = authoritative ? facts.catalog : null;
  const heroCfg = catalog?.heroes.find(row => row.id === hero?.heroId);
  const badgeCfg = catalog?.badges.find(row => row.id === badge?.badgeId);
  const unlock = catalog?.unlocks.find(row => row.pos === worn?.pos);
  const cap = catalog?.attrs.find(row => row.id === badge?.badgeId && row.star === badge.star)?.maxLevel;
  const next = badge && catalog?.levels.find(row => row.level === badge.level + 1);
  // The documented branch uses exactly one level's EXP from an explicit zero.
  // The last level has a separate client display path that hides residual XP;
  // leave cap landing and partial starting XP for evidence-backed follow-up.
  const expItemNum = next?.exp ?? 0, goldNum = expItemNum * (next?.goldExpRadio ?? 0);
  const costs = positive(expItemNum) && safeResourceQuantity(goldNum) !== null && goldNum > 0
    ? [{ id: xpItem, num: expItemNum }, { id: gold, num: goldNum }] : [];
  const action = { request, response, body: { uid: params.uid, decomposeUid: [], expItemNum } };
  let blockedReason = null;
  if (!params.heroId || !params.uid) blockedReason = 'EXPLICIT_HERO_AND_BADGE_UID_REQUIRED';
  else if (!moduleConfig.enabled) blockedReason = 'BADGE_GROWTH_MODULE_DISABLED';
  else if (!authoritative) blockedReason = 'BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if (!hero || !worn || !badge) blockedReason = 'EXACT_WORN_BADGE_REQUIRED';
  else if (!derivedReliable(hero)) blockedReason = 'TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if (!heroCfg || heroCfg.type !== '英雄' || !badgeCfg || heroCfg.career !== badgeCfg.career || !unlock || hero.level < unlock.level) blockedReason = 'BADGE_SLOT_OR_CAREER_NOT_ELIGIBLE';
  else if (!positive(cap) || !next || costs.length !== 2) blockedReason = 'BADGE_EXACT_NEXT_COST_OR_CAP_UNKNOWN';
  else if (next.level >= cap) blockedReason = 'BADGE_CAP_BOUNDARY_OUTSIDE_SCOPE';
  else if (badge.exp !== 0) blockedReason = 'BADGE_PARTIAL_XP_OUTSIDE_SCOPE';
  else if (!facts.available?.includes(request) || !facts.available?.includes(response)) blockedReason = 'PROTOCOL_UNAVAILABLE';
  else if (costs.some(cost => (facts.stock.get(cost.id) ?? 0) < cost.num)) blockedReason = 'BADGE_OWNED_STOCK_INSUFFICIENT';
  else {
    try { assertPaymentAllowed({ ...action, costs }); } catch (error) { blockedReason = error.code ?? 'COST_NOT_ALLOWED'; }
  }

  const target = { heroId: params.heroId ?? null, uid: params.uid ?? null, pos: worn?.pos ?? null };
  const executable = blockedReason === null;
  return {
    module: moduleId, actionId: moduleId + ':LEVEL:' + hash(target), actionType: 'LEVEL', parameters: params, target,
    ...(includePlanEvidence ? {
      identity: executable ? hash({ context: facts.identityContext, ownership, dependencies: badgeGrowthDependencyVersions({ config, moduleConfig }) }) : null,
      configEvidence: executable ? configEvidence(config) : null,
    } : {}),
    beforeState: hero && badge ? { ...(includePlanEvidence ? { hero: copy(hero) } : {}), badge: copy(badge) } : null,
    expectedState: badge && next ? { ...target, badgeId: badge.badgeId, star: badge.star, level: next.level, exp: 0 } : null,
    costs, costSource: source, budgetClaims: { resources: copy(costs), quotas: [], uids: params.uid ? [{ type: 'badge', id: params.uid }] : [] },
    executable, blockedReason, label: '纹章升级 ' + (params.heroId ?? '') + ' ' + (params.uid ?? ''), ...(executable ? { action } : {}),
  };
}

export function viewBadgeGrowth(facts, { config, moduleConfig, parameters = facts?.parameters ?? {} } = {}) {
  const params = validateBadgeGrowthParameters(parameters);
  const options = { config, moduleConfig: validateBadgeGrowthConfig(moduleConfig), authoritative: authority(facts, config), includePlanEvidence: false };
  const choices = [];
  for (const hero of options.authoritative ? facts.ownership.heroes : []) {
    if (params.heroId && hero.heroId !== params.heroId) continue;
    for (const badge of hero.badges) {
      if (!params.uid || badge.uid === params.uid) choices.push({ heroId: hero.heroId, uid: badge.uid });
    }
  }
  const candidates = (choices.length ? choices : [params]).map(choice => candidate(facts, choice, options));
  return { module: moduleId, candidates, blocked: candidates.filter(row => !row.executable), notes: [...(facts?.notes ?? [])], evidence: BADGE_GROWTH_EVIDENCE };
}

export function planBadgeGrowth(facts, { config, moduleConfig, parameters = {}, selections, ledger = new ResourceLedger(facts?.stockReliable ? facts.stock : null) } = {}) {
  const selected = candidate(facts, validateBadgeGrowthParameters(parameters), {
    config, moduleConfig: validateBadgeGrowthConfig(moduleConfig), authoritative: authority(facts, config),
  });
  return selected.executable && (selections === undefined || selections.includes(selected.actionId)) && freshFacts(facts) && ledger.reserve(selected.costs)
    ? { module: moduleId, actions: [selected], notes: [] }
    : { module: moduleId, actions: [], notes: [selected.blockedReason ?? 'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT'] };
}

function exactDebits(before, after, costs) {
  const debits = new Map(costs.map(({ id, num }) => [id, num]));
  return [...new Set([...before.keys(), ...after.keys(), ...debits.keys()])].every(key =>
    (after.get(key) ?? 0) === (before.get(key) ?? 0) - (debits.get(key) ?? 0));
}

function noMaterial(responseBody) {
  if (!fields(responseBody, ['material'])) return false;
  if (!own(responseBody, 'material')) return true;
  const material = responseBody.material;
  return fields(material, ['asset']) && own(material, 'asset') && dense(material.asset) && material.asset.length === 0;
}

export function verifyBadgeGrowth(operation, before, after, responseBody) {
  const fail = reason => ({ confirmed: false, reason });
  if (!noMaterial(responseBody)) return fail('BADGE_TYPED_RESPONSE_OR_MATERIAL_UNKNOWN');
  let params;
  try { params = validateBadgeGrowthParameters(operation?.parameters); } catch { return fail('BADGE_OPERATION_CONTRACT_INVALID'); }
  const config = { tables: Object.fromEntries(tables.map(name => [name, operation?.configEvidence?.[name] ?? null])) };
  if (!authority(before, config) || !authority(after, config) || !same(before.identityContext, after.identityContext)) return fail('BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if (queries.some(([key]) => after.sourceFacts[key].provenance.sourceAt < before.sourceFacts[key].provenance.sourceAt)) return fail('BADGE_POST_READ_PREDATES_DISPATCH_BASELINE');
  const contract = candidate(before, params, { config, moduleConfig: { enabled: true }, authoritative: true });
  if (!contract.executable || ['module', 'actionId', 'actionType', 'target', 'identity', 'beforeState', 'expectedState', 'costSource', 'costs', 'budgetClaims', 'action', 'configEvidence']
    .some(key => !same(operation[key], contract[key]))) return fail('BADGE_OPERATION_CONTRACT_MISMATCH');

  const { hero: beforeHero, badge: beforeBadge } = contract.beforeState;
  const nextBadge = { ...beforeBadge, level: beforeBadge.level + 1 };
  const expectedPool = before.ownership.pool.map(row => row.uid === params.uid ? nextBadge : row);
  if (!same(expectedPool, after.ownership.pool)) return fail('BADGE_EXACT_LEVEL_AND_POOL_NOT_CONFIRMED');
  const afterHero = after.ownership.heroes.find(hero => hero.heroId === params.heroId);
  if (!afterHero || !derivedReliable(afterHero)) return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const expectedHero = { ...beforeHero, badges: beforeHero.badges.map(badge => badge.uid === params.uid ? { ...badge, level: nextBadge.level } : badge) };
  if (!same(without(expectedHero, ['power', 'attributes']), without(afterHero, ['power', 'attributes']))
      || !same(before.ownership.heroes.filter(hero => hero.heroId !== params.heroId), after.ownership.heroes.filter(hero => hero.heroId !== params.heroId))) {
    return fail('BADGE_SLOT_OR_NON_TARGET_HERO_CHANGED');
  }
  if (!exactDebits(before.stock, after.stock, contract.costs)) return fail('BADGE_EXACT_EXP_AND_GOLD_DEBIT_NOT_CONFIRMED');
  if (!freshFacts(before) || !freshFacts(after)) return fail('BADGE_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {
    confirmed: true, reason: '完整 Badges 和 AllHero 复读确认同槽纹章单次等级+1、经验余量为零及自有经验和金币精确扣除',
    afterState: { hero: copy(afterHero), badge: copy(nextBadge) }, responseEvidence: { material: 'NONE' },
  };
}

export const badgeGrowthModule = Object.freeze({
  id: moduleId, label: '纹章单次升级', capabilities: Object.freeze(['C228']), defaultConfig: BADGE_GROWTH_DEFAULT_CONFIG,
  validateConfig: validateBadgeGrowthConfig, validateParameters: validateBadgeGrowthParameters,
  survey: surveyBadgeGrowth, view: viewBadgeGrowth, plan: planBadgeGrowth, verify: verifyBadgeGrowth,
  dependencyVersions: badgeGrowthDependencyVersions,
  dependencyKeys: Object.freeze(['moduleConfig', ...tables.map(name => 'config.' + name)]),
});
