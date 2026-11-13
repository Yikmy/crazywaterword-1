// C228/BIZ-R09: single badge level, explicit RED star, or idle wear to an empty slot.
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
const putOnRequest = 'PutOnBadgeRequest';
const isStar = params => params?.action === 'star';
const starItem = '徽章升星石';
const starTables = ['HeroCfg', 'HeroBadgeCfg', 'HeroBadgeUnlockCfg', 'HeroBadgeAttrCfg', 'HeroBadgeStarCfg'];
const starSource = 'v76 BadgeUtil.canUpOneStar; BadgeLvUpPop._refreshUpStar/_onBtnUse2; HeroBadgeStarCfg[nextStar].upBadgeNum and consume; owned stones only, decomposeUid=[]';
export const BADGE_STAR_EVIDENCE = Object.freeze({source:starSource,requirement:'BIZ-R09',request:'BadgeStarRequest',response:'BadgeStarResponse',scope:'EXPLICIT_WORN_RED_SINGLE_STAR_NO_SACRIFICE',realGame:'REAL_UNVERIFIED'});
const isPutOn = params => params != null && Object.hasOwn(params, 'action') && params.action === 'put-on';
const xpItem = '徽章经验', gold = 'GOLD';
const tables = ['HeroCfg', 'HeroBadgeCfg', 'HeroBadgeAttrCfg', 'HeroBadgeLevelCfg', 'HeroBadgeUnlockCfg'];
const putOnTables = ['HeroCfg', 'HeroBadgeCfg', 'HeroBadgeUnlockCfg', 'ModuleOpenCfg'];
const tablesFor = params => isStar(params) ? starTables : isPutOn(params) ? putOnTables : tables;
const putOnSource = 'v76 /subpackages/main/game.js: BadgeSelectItem._onBtnOn; BadgeSelectPop; BadgeModel.idleBadgesByType/fixupBadge; HeroDetailBadge; ModuleOpenUtil.isOpen';
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

export const BADGE_PUT_ON_EVIDENCE = Object.freeze({
  source: putOnSource, request: putOnRequest, response: null, scope: 'EXPLICIT_IDLE_OWNED_BADGE_TO_EMPTY_HERO_SLOT',
  packageSha256: BADGE_GROWTH_EVIDENCE.packageSha256,
  entrySha256: BADGE_GROWTH_EVIDENCE.entrySha256,
  protocolSha256: BADGE_GROWTH_EVIDENCE.protocolSha256,
  configSha256: BADGE_GROWTH_EVIDENCE.configSha256,
  badgeSelectItem: Object.freeze({ byteOffset: 478991, requestByteOffset: 485010, sha256: 'df296fe90259b984c20f48425da075c3ff0fb855147b553f21f0a5c2dd09c45e' }),
  badgeSelectPop: Object.freeze({ byteOffset: 487685, idleLookupByteOffset: 490332, sha256: '9e54d948de15bdb100844305232be7fedec3ce862f99cb34a169b97247a37c89' }),
  badgeModel: Object.freeze({ byteOffset: 470372, idleByteOffset: 472717, fixupByteOffset: 473228, sha256: 'f6db4e5cfc90e5da13e0147aa982f4b1b38b0a5c24605b4b4d942702e78f0177' }),
  badgeSlots: BADGE_GROWTH_EVIDENCE.badgeSlots,
  heroDetail: Object.freeze({ byteOffset: 3448294, sha256: 'c69e39b5f6086fcd82a50b8f4293aaba7f1b7787fb818dd55c1ba5871cfe3c59' }),
  moduleOpenUtil: Object.freeze({ byteOffset: 4674760, sha256: '98544b76338dde2e7da17c1d636507a056a9b078e1a3bc394b1cb1f89d46428b' }),
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
  if (!plainFields(parameters, ['heroId', 'uid', 'action', 'pos'])
      || own(parameters, 'action') && !isPutOn(parameters) && !isStar(parameters)
      || own(parameters, 'pos') && (!isPutOn(parameters) || !slot(parameters.pos))) {
    throw invalid('纹章参数仅允许 heroId、uid；单次升星用 action=star；穿戴用 action=put-on 和 1 至 4 的整数槽位 pos');
  }
  const out = {};
  if (isPutOn(parameters) || isStar(parameters)) out.action = parameters.action;
  if (own(parameters, 'pos')) out.pos = parameters.pos;
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

function readCatalog(config, params) {
  const table = name => config?.tables?.[name]?.data;
  const [heroes, badges, unlocks] = ['HeroCfg', 'HeroBadgeCfg', 'HeroBadgeUnlockCfg'].map(table);
  if (![heroes, badges, unlocks].every(rows => dense(rows) && rows.length > 0)
      || !heroes.every(r => !missing(r, ['id', 'type', 'career']) && id(r.id) && id(r.type) && id(r.career))
      || !unique(heroes, r => r.id)
      || !badges.every(r => !missing(r, ['id', 'career']) && id(r.id) && id(r.career))
      || !unique(badges, r => r.id)
      || unlocks.length !== 4 || !unlocks.every(r => !missing(r, ['pos', 'level']) && slot(r.pos) && positive(r.level))
      || !unique(unlocks, r => r.pos)) return null;
  const common = {
    heroes: heroes.map(({ id, type, career }) => ({ id, type, career })),
    badges: badges.map(({ id, career }) => ({ id, career })),
    unlocks: unlocks.map(({ pos, level }) => ({ pos, level })),
  };
  if (isPutOn(params)) {
    const modules = table('ModuleOpenCfg');
    if (!dense(modules)) return null;
    const badgeModule = modules.filter(row => own(row, 'moduleId') && row.moduleId === '英雄徽章');
    return badgeModule.length === 1 && own(badgeModule[0], 'playerLevel') && positive(badgeModule[0].playerLevel)
      ? { ...common, playerLevel: badgeModule[0].playerLevel } : null;
  }
  if (isStar(params)) {
    const attrs = table('HeroBadgeAttrCfg'), stars = table('HeroBadgeStarCfg');
    if (!badges.every(row => own(row,'quality') && ['GREEN','BLUE','PURPLE','ORANGE','RED'].includes(row.quality))
        || ![attrs,stars].every(rows => dense(rows) && rows.length > 0)
        || !attrs.every(row => !missing(row,['id','star','maxLevel']) && badges.some(b => b.id === row.id) && uint(row.star) && positive(row.maxLevel))
        || !unique(attrs,row => JSON.stringify([row.id,row.star]))
        || !stars.every(row => !missing(row,['star','upBadgeNum','consume']) && positive(row.star) && row.star <= 5 && positive(row.upBadgeNum)
          && dense(row.consume) && row.consume.length === 2 && row.consume[0] === gold && positive(row.consume[1]))
        || !unique(stars,row => row.star)) return null;
    return {...common, badges:badges.map(({id,career,quality}) => ({id,career,quality})),
      attrs:attrs.map(({id,star,maxLevel}) => ({id,star,maxLevel})),
      stars:stars.map(({star,upBadgeNum,consume}) => ({star,upBadgeNum,consume:copy(consume)}))};
  }
  const [attrs, levels] = ['HeroBadgeAttrCfg', 'HeroBadgeLevelCfg'].map(table);
  if (![attrs, levels].every(rows => dense(rows) && rows.length > 0)
      || !attrs.every(r => !missing(r, ['id', 'star', 'maxLevel']) && badges.some(b => b.id === r.id) && uint(r.star) && positive(r.maxLevel))
      || !unique(attrs, r => JSON.stringify([r.id, r.star]))
      || !levels.every(r => !missing(r, ['level', 'exp', 'goldExpRadio']) && positive(r.level)
        && (r.level === 1 ? r.exp === 0 && r.goldExpRadio === 0 : positive(r.exp) && positive(r.goldExpRadio)))
      || !unique(levels, r => r.level)) return null;
  return {
    heroes: common.heroes, badges: common.badges,
    attrs: attrs.map(({ id, star, maxLevel }) => ({ id, star, maxLevel })),
    levels: levels.map(({ level, exp, goldExpRadio }) => ({ level, exp, goldExpRadio })),
    unlocks: common.unlocks,
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

function contextOf(client, player, params) {
  const ids = ['id', 'playerId'].filter(key => own(player, key)).map(key => exactPositive(player[key]));
  const { accountId, generation, connectionId } = client.factContext ?? {};
  return {
    accountId: id(accountId) ? accountId : null,
    generation: Number.isSafeInteger(generation) && generation >= 0 ? generation : null,
    connectionId: id(connectionId) ? connectionId : null,
    playerId: ids.length && ids.every(value => value !== null && value === ids[0]) ? ids[0] : null,
    worldId: own(player, 'worldId') ? exactPositive(player.worldId) : null,
    ...(isPutOn(params) ? { playerLevel: own(player, 'level') && positive(player.level) ? player.level : null } : {}),
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
  const identityContext = contextOf(client, player, parameters), notes = [];
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
  if (!same(identityContext, contextOf(client, player, parameters))) throw Object.assign(new Error('纹章调查期间账号或连接已改变'), { code: 'CANCELLED' });
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
    module: moduleId, parameters, identityContext, catalog: readCatalog(config, parameters), ownership, ...inventory, inputs, sourceFacts,
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

function authority(facts, config, params) {
  const ctx = facts?.identityContext, inputs = facts?.inputs;
  if (!id(ctx?.accountId) || !id(ctx.connectionId) || !Number.isSafeInteger(ctx.generation) || ctx.generation < 0
      || !ctx.playerId || exactPositive(ctx.playerId) !== ctx.playerId || !ctx.worldId || exactPositive(ctx.worldId) !== ctx.worldId
      || isPutOn(params) && !positive(ctx.playerLevel)
      || !facts.catalog || !same(facts.catalog, readCatalog(config, params))) return false;
  if (!freshFacts(facts) || !queries.every(([key]) => same(facts.sourceFacts[key].value, inputs?.[key]))) return false;
  const ownership = parseBadgeOwnership(inputs?.badges, inputs?.heroes), inventory = parseOperationInventory(inputs?.items, inputs?.resources);
  return ownership !== null && same(ownership, facts.ownership) && inventory.stockReliable && facts.stockReliable === true
    && facts.stock instanceof Map && same([...inventory.stock], [...facts.stock]) && freshFacts(facts);
}

function configEvidence(config, params) {
  return Object.fromEntries(tablesFor(params).map(name => [name, copy(config?.tables?.[name] ?? null)]));
}

export function badgeGrowthDependencyVersions({ config, moduleConfig = BADGE_GROWTH_DEFAULT_CONFIG, parameters } = {}) {
  return { moduleConfig: validateBadgeGrowthConfig(moduleConfig), ...Object.fromEntries(
    Object.entries(configEvidence(config, parameters)).map(([name, value]) => ['config.' + name, value]),
  ) };
}

function candidate(facts, params, { config, moduleConfig, authoritative, includePlanEvidence = true } = {}) {
  if (isStar(params)) return starCandidate(facts, params, {config,moduleConfig,authoritative,includePlanEvidence});
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

function putOnState(facts, authoritative) {
  if (!authoritative) return null;
  return {
    heroes: new Map(facts.ownership.heroes.map(hero => [hero.heroId, hero])),
    pool: new Map(facts.ownership.pool.map(badge => [badge.uid, badge])),
    heroTypes: new Map(facts.catalog.heroes.map(hero => [hero.id, hero])),
    badgeCareers: new Map(facts.catalog.badges.map(badge => [badge.id, badge.career])),
    slotLevels: new Map(facts.catalog.unlocks.map(({ pos, level }) => [pos, level])),
    worn: new Set(facts.ownership.heroes.flatMap(hero => hero.badges.map(badge => badge.uid))),
    moduleOpen: facts.identityContext.playerLevel >= facts.catalog.playerLevel,
  };
}

function emptyBadgeSlots(hero, state) {
  if (!state.moduleOpen || state.heroTypes.get(hero.heroId)?.type !== '英雄' || !derivedReliable(hero)) return [];
  return [...state.slotLevels].filter(([pos, level]) => hero.level >= level && !hero.badges.some(badge => badge.pos === pos))
    .map(([pos]) => pos).sort((a, b) => a - b);
}

function putOnCandidate(facts, params, { config, moduleConfig, state, includePlanEvidence = true }) {
  const hero = state?.heroes.get(params.heroId), badge = state?.pool.get(params.uid);
  const heroCfg = state?.heroTypes.get(params.heroId), badgeCareer = badge && state.badgeCareers.get(badge.badgeId);
  const target = { heroId: params.heroId ?? null, uid: params.uid ?? null, pos: params.pos ?? null };
  const action = { request: putOnRequest, response: null, body: { uid: params.uid, heroId: params.heroId, pos: params.pos } };
  const costs = [];
  let blockedReason = null;
  if (!params.heroId || !params.uid || !params.pos) blockedReason = 'EXPLICIT_HERO_BADGE_UID_AND_SLOT_REQUIRED';
  else if (!moduleConfig.enabled) blockedReason = 'BADGE_GROWTH_MODULE_DISABLED';
  else if (!state) blockedReason = 'BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if (!state.moduleOpen) blockedReason = 'BADGE_MODULE_LEVEL_LOCKED';
  else if (!hero || !badge || state.worn.has(params.uid)) blockedReason = 'EXACT_IDLE_OWNED_BADGE_REQUIRED';
  else if (!derivedReliable(hero)) blockedReason = 'TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if (heroCfg?.type !== '英雄' || !badgeCareer || heroCfg.career !== badgeCareer
      || !state.slotLevels.has(params.pos) || hero.level < state.slotLevels.get(params.pos)) blockedReason = 'BADGE_SLOT_OR_CAREER_NOT_ELIGIBLE';
  else if (hero.badges.some(row => row.pos === params.pos)) blockedReason = 'BADGE_SLOT_NOT_EMPTY';
  else if (!facts.available?.includes(putOnRequest) || facts.available.includes('PutOnBadgeResponse')) blockedReason = 'PROTOCOL_UNAVAILABLE';
  else {
    try { assertPaymentAllowed({ ...action, costs }); } catch (error) { blockedReason = error.code ?? 'COST_NOT_ALLOWED'; }
  }
  const executable = blockedReason === null;
  return {
    module: moduleId, actionId: moduleId + ':PUT-ON:' + hash(target), actionType: 'PUT-ON', parameters: params, target,
    ...(includePlanEvidence ? {
      identity: executable ? hash({ context: facts.identityContext, ownership: facts.ownership, dependencies: badgeGrowthDependencyVersions({ config, moduleConfig, parameters: params }) }) : null,
      configEvidence: executable ? configEvidence(config, params) : null,
    } : {}),
    beforeState: hero && badge ? { ...(includePlanEvidence ? { hero: copy(hero) } : {}), badge: copy(badge) } : null,
    expectedState: badge ? { ...target, badgeId: badge.badgeId, level: badge.level, star: badge.star, exp: badge.exp } : null,
    costs, costSource: putOnSource, budgetClaims: { resources: [], quotas: [], uids: params.uid ? [{ type: 'badge', id: params.uid }] : [] },
    executable, blockedReason, label: '纹章穿戴 ' + (params.heroId ?? '') + ' ' + (params.pos ?? '') + ' ' + (params.uid ?? ''), ...(executable ? { action } : {}),
  };
}

function heroChoices(roster, state) {
  return roster.map(hero => ({
    heroId: hero.heroId, level: hero.level,
    badges: hero.badges.map(({ uid, pos, badgeId, level }) => ({ uid, pos, badgeId, level })),
    ...(state ? { emptySlots: emptyBadgeSlots(hero, state) } : {}),
  }));
}

export function viewBadgeGrowth(facts, { config, moduleConfig, parameters = facts?.parameters ?? {} } = {}) {
  const params = validateBadgeGrowthParameters(parameters);
  const options = { config, moduleConfig: validateBadgeGrowthConfig(moduleConfig), authoritative: authority(facts, config, params), includePlanEvidence: false };
  const roster = options.authoritative ? facts.ownership.heroes : [];
  const notes = [...(facts?.notes ?? [])];
  if (isPutOn(params)) {
    const state = putOnState(facts, options.authoritative), hero = state?.heroes.get(params.heroId);
    // An explicit hero and empty slot narrow the choices without pairing the entire roster and pool.
    const choices = !params.uid && hero && emptyBadgeSlots(hero, state).includes(params.pos)
      ? [...state.pool.values()].filter(badge => !state.worn.has(badge.uid)
        && state.badgeCareers.get(badge.badgeId) === state.heroTypes.get(params.heroId).career).map(({ uid }) => ({ ...params, uid }))
      : [];
    const candidates = (choices.length ? choices : [params]).map(choice => putOnCandidate(facts, choice, { ...options, state }));
    return { module: moduleId, mode: 'put-on', heroes: heroChoices(roster, state), candidates, blocked: candidates.filter(row => !row.executable), notes, evidence: BADGE_PUT_ON_EVIDENCE };
  }
  const choices = [];
  for (const hero of roster) {
    if (params.heroId && hero.heroId !== params.heroId) continue;
    for (const badge of hero.badges) {
      if (!params.uid || badge.uid === params.uid) choices.push({ heroId: hero.heroId, uid: badge.uid, ...(isStar(params) ? {action:'star'} : {}) });
    }
  }
  const candidates = (choices.length ? choices : [params]).map(choice => candidate(facts, choice, options));
  return { module: moduleId, mode: isStar(params) ? 'star' : 'level', heroes: heroChoices(roster), candidates, blocked: candidates.filter(row => !row.executable), notes, evidence: isStar(params) ? BADGE_STAR_EVIDENCE : BADGE_GROWTH_EVIDENCE };
}

export function planBadgeGrowth(facts, { config, moduleConfig, parameters = {}, selections, ledger = new ResourceLedger(facts?.stockReliable ? facts.stock : null) } = {}) {
  const params = validateBadgeGrowthParameters(parameters);
  const options = { config, moduleConfig: validateBadgeGrowthConfig(moduleConfig), authoritative: authority(facts, config, params) };
  const selected = isPutOn(params)
    ? putOnCandidate(facts, params, { ...options, state: putOnState(facts, options.authoritative) })
    : candidate(facts, params, options);
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

function verifyPutOn(params, contract, before, after) {
  const fail = reason => ({ confirmed: false, reason });
  const { hero: beforeHero, badge } = contract.beforeState;
  const afterHero = after.ownership.heroes.find(hero => hero.heroId === params.heroId);
  if (!afterHero || !derivedReliable(afterHero)) return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const expectedSlots = [...beforeHero.badges, { ...without(badge, ['exp']), pos: params.pos }].sort((a, b) => a.pos - b.pos);
  if (!same(expectedSlots, afterHero.badges)) return fail('BADGE_EXACT_EMPTY_SLOT_ADDITION_NOT_CONFIRMED');
  if (!same(before.ownership.pool, after.ownership.pool)) return fail('BADGE_POOL_UNCHANGED_NOT_CONFIRMED');
  if (!same(without(beforeHero, ['power', 'attributes', 'badges']), without(afterHero, ['power', 'attributes', 'badges']))
      || !same(before.ownership.heroes.filter(hero => hero.heroId !== params.heroId), after.ownership.heroes.filter(hero => hero.heroId !== params.heroId))) {
    return fail('BADGE_NON_TARGET_HERO_STATE_CHANGED');
  }
  if (before.stock.size !== after.stock.size || [...before.stock].some(([key, value]) => after.stock.get(key) !== value)) {
    return fail('BADGE_ZERO_COST_INVENTORY_UNCHANGED_NOT_CONFIRMED');
  }
  if (!freshFacts(before) || !freshFacts(after)) return fail('BADGE_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {
    confirmed: true, reason: '完整 Badges 和 AllHero 复读确认闲置纹章穿戴至指定空槽，纹章池和库存不变',
    afterState: { hero: copy(afterHero), badge: copy(badge) }, responseEvidence: null,
  };
}

export function verifyBadgeGrowth(operation, before, after, responseBody) {
  const fail = reason => ({ confirmed: false, reason });
  let params;
  try { params = validateBadgeGrowthParameters(operation?.parameters); } catch { return fail('BADGE_OPERATION_CONTRACT_INVALID'); }
  if (!isPutOn(params) && !noMaterial(responseBody)) return fail('BADGE_TYPED_RESPONSE_OR_MATERIAL_UNKNOWN');
  const config = { tables: Object.fromEntries(tablesFor(params).map(name => [name, operation?.configEvidence?.[name] ?? null])) };
  if (!authority(before, config, params) || !authority(after, config, params) || !same(before.identityContext, after.identityContext)) return fail('BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if (queries.some(([key]) => after.sourceFacts[key].provenance.sourceAt < before.sourceFacts[key].provenance.sourceAt)) return fail('BADGE_POST_READ_PREDATES_DISPATCH_BASELINE');
  const options = { config, moduleConfig: { enabled: true }, authoritative: true };
  const contract = isPutOn(params)
    ? putOnCandidate(before, params, { ...options, state: putOnState(before, true) })
    : candidate(before, params, options);
  if (!contract.executable || ['module', 'actionId', 'actionType', 'target', 'identity', 'beforeState', 'expectedState', 'costSource', 'costs', 'budgetClaims', 'action', 'configEvidence']
    .some(key => !same(operation[key], contract[key]))) return fail('BADGE_OPERATION_CONTRACT_MISMATCH');
  if (isPutOn(params)) return verifyPutOn(params, contract, before, after);
  if (isStar(params)) return verifyStar(params, contract, before, after);

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
  id: moduleId, label: '纹章成长与穿戴', capabilities: Object.freeze(['C228']), defaultConfig: BADGE_GROWTH_DEFAULT_CONFIG,
  validateConfig: validateBadgeGrowthConfig, validateParameters: validateBadgeGrowthParameters,
  survey: surveyBadgeGrowth, view: viewBadgeGrowth, plan: planBadgeGrowth, verify: verifyBadgeGrowth,
  dependencyVersions: badgeGrowthDependencyVersions,
  dependencyKeys: Object.freeze(['moduleConfig', ...new Set([...tables, ...putOnTables, ...starTables].map(name => 'config.' + name))]),
});


function starCandidate(facts, params, {config,moduleConfig,authoritative,includePlanEvidence=true}) {
  const ownership = authoritative ? facts.ownership : null, catalog = authoritative ? facts.catalog : null;
  const hero = ownership?.heroes.find(row => row.heroId === params.heroId), worn = hero?.badges.find(row => row.uid === params.uid);
  const badge = worn && ownership.pool.find(row => row.uid === params.uid);
  const heroCfg = catalog?.heroes.find(row => row.id === hero?.heroId), badgeCfg = catalog?.badges.find(row => row.id === badge?.badgeId);
  const unlock = catalog?.unlocks.find(row => row.pos === worn?.pos);
  const current = catalog?.attrs.find(row => row.id === badge?.badgeId && row.star === badge.star);
  const next = badge && catalog?.attrs.find(row => row.id === badge.badgeId && row.star === badge.star + 1);
  const cost = badge && catalog?.stars.find(row => row.star === badge.star + 1);
  const costs = cost ? [{id:starItem,num:cost.upBadgeNum},{id:gold,num:cost.consume[1]}] : [];
  const action = {request:'BadgeStarRequest',response:'BadgeStarResponse',body:{uid:params.uid,decomposeUid:[],starItemNum:cost?.upBadgeNum}};
  let blockedReason = null;
  if (!params.heroId || !params.uid) blockedReason = 'EXPLICIT_HERO_AND_BADGE_UID_REQUIRED';
  else if (!moduleConfig.enabled) blockedReason = 'BADGE_GROWTH_MODULE_DISABLED';
  else if (!authoritative) blockedReason = 'BADGE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if (!hero || !worn || !badge) blockedReason = 'EXACT_WORN_BADGE_REQUIRED';
  else if (!derivedReliable(hero)) blockedReason = 'TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else if (!heroCfg || heroCfg.type !== '英雄' || !badgeCfg || heroCfg.career !== badgeCfg.career || !unlock || hero.level < unlock.level) blockedReason = 'BADGE_SLOT_OR_CAREER_NOT_ELIGIBLE';
  else if (badgeCfg.quality !== 'RED') blockedReason = 'RED_BADGE_REQUIRED';
  else if (badge.star >= 5) blockedReason = 'BADGE_MAX_STAR';
  else if (!current || !next || badge.level > current.maxLevel || badge.level > next.maxLevel) blockedReason = 'BADGE_STAR_CAP_CONFIG_UNKNOWN';
  else if (!cost || costs.length !== 2) blockedReason = 'BADGE_STAR_COST_UNKNOWN';
  else if (!facts.available.includes(action.request) || !facts.available.includes(action.response)) blockedReason = 'PROTOCOL_UNAVAILABLE';
  else if (costs.some(row => (facts.stock.get(row.id) ?? 0) < row.num)) blockedReason = 'BADGE_STAR_STOCK_INSUFFICIENT';
  else { try { assertPaymentAllowed({...action,costs}); } catch (error) { blockedReason = error.code ?? 'COST_NOT_ALLOWED'; } }
  const target = {heroId:params.heroId ?? null,uid:params.uid ?? null,pos:worn?.pos ?? null}, executable = blockedReason === null;
  return {module:moduleId,actionId:moduleId+':STAR:'+hash(target),actionType:'STAR',parameters:params,target,
    ...(includePlanEvidence ? {
      identity:executable ? hash({context:facts.identityContext,ownership,dependencies:badgeGrowthDependencyVersions({config,moduleConfig,parameters:params})}) : null,
      configEvidence:executable ? configEvidence(config,params) : null,
    } : {}),
    beforeState:hero && badge ? {...(includePlanEvidence ? {hero:copy(hero)} : {}),badge:copy(badge)} : null,
    expectedState:badge ? {...target,badgeId:badge.badgeId,level:badge.level,star:badge.star+1,exp:badge.exp} : null,
    costs,costSource:starSource,budgetClaims:{resources:copy(costs),quotas:[],uids:params.uid ? [{type:'badge',id:params.uid}] : []},
    executable,blockedReason,label:'红徽章单次升星 '+(params.heroId ?? '')+' '+(params.uid ?? ''),...(executable ? {action} : {})};
}

function verifyStar(params, contract, before, after) {
  const fail = reason => ({confirmed:false,reason});
  const {hero:beforeHero,badge:beforeBadge} = contract.beforeState;
  const afterBadge = after.ownership.pool.find(row => row.uid === params.uid), afterHero = after.ownership.heroes.find(row => row.heroId === params.heroId);
  if (!afterBadge || !afterHero || !derivedReliable(afterHero)) return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  // The preview is advisory only. Accept a target random attribute solely when
  // fresh complete pool and hero mirrors agree; all other fields stay exact.
  if (own(beforeBadge,'attr') !== own(afterBadge,'attr')) return fail('BADGE_TARGET_RANDOM_ATTRIBUTE_PRESENCE_CHANGED');
  const expectedBadge = {...beforeBadge,star:beforeBadge.star+1};
  if (own(afterBadge,'attr')) expectedBadge.attr = copy(afterBadge.attr); else delete expectedBadge.attr;
  if (!same(expectedBadge,afterBadge) || !same(before.ownership.pool.filter(row => row.uid !== params.uid),after.ownership.pool.filter(row => row.uid !== params.uid))) return fail('BADGE_EXACT_STAR_AND_POOL_NOT_CONFIRMED');
  const expectedSlots = beforeHero.badges.map(row => row.uid === params.uid ? {...without(expectedBadge,['exp']),pos:row.pos} : row);
  if (!same(expectedSlots,afterHero.badges) || !same(without(beforeHero,['power','attributes','badges']),without(afterHero,['power','attributes','badges']))
      || !same(before.ownership.heroes.filter(hero => hero.heroId !== params.heroId),after.ownership.heroes.filter(hero => hero.heroId !== params.heroId))) return fail('BADGE_SLOT_OR_NON_TARGET_HERO_CHANGED');
  if (!exactDebits(before.stock,after.stock,contract.costs)) return fail('BADGE_EXACT_STAR_STONE_AND_GOLD_DEBIT_NOT_CONFIRMED');
  if (!freshFacts(before) || !freshFacts(after)) return fail('BADGE_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return {confirmed:true,reason:'完整 Badges 与 AllHero 确认原UID同槽红徽章单星增长，等级与经验不变，升星石及金币精确净扣；仅目标随机属性和英雄派生数值采纳服务器新观察',
    afterState:{hero:copy(afterHero),badge:copy(afterBadge)},responseEvidence:{material:'NONE'}};
}
