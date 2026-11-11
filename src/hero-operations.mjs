// Hero growth semantics only. Authorization, transport, budgets, cancellation and
// durable execution history belong to the existing shared operation executor.
import { createHash } from 'node:crypto';
import { planHeroes, buildHeroAction } from './heroes.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity, stockFromResponses, RESOURCE_NAMES } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f]/.test(value);
const uint = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const positive = value => uint(value) && value > 0;
const dense = value => Array.isArray(value) && value.length <= 10000 && Array.from({ length: value.length }, (_, index) => own(value, index)).every(Boolean);
const equal = (a, b) => stableBusinessValue(a) === stableBusinessValue(b);
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_PARAMETERS', statusCode: 400 });
const qualityCost = Object.freeze({ BLUE: 'consumeBlue', PURPLE: 'consumePur', ORANGE: 'consumeOra', RED: 'consumeRed' });
const kinds = Object.freeze(['level', 'star', 'skill']);
const sources = Object.freeze({
  level: 'src/heroes.mjs#planHeroes; HeroUpgradeCfg[targetLevel].exp and reqPlayerLv',
  star: 'src/heroes.mjs#planHeroes; HeroStarCfg[nextStar] quality consume field; owned hero fragments only; universal=false',
  skill: 'src/heroes.mjs#planHeroes; HeroSkillUpCfg[quality_targetLevel].costArr[slot]; HeroStarCfg.maxSkillLevel and skillLevelMinStar',
});
const queryTypes = Object.freeze([
  ['AllHeroRequest', 'AllHeroResponse'], ['AllItemRequest', 'AllItemResponse'], ['AllResourceRequest', 'AllResourceResponse'],
]);
export const HERO_DEFAULT_CONFIG = Object.freeze({ enabled: false });

function plainFields(value, allowed) {
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key)
    && own(Object.getOwnPropertyDescriptor(value, key), 'value') && Object.getOwnPropertyDescriptor(value, key).enumerable);
}
export function validateHeroConfig(value = {}) {
  if (!plainFields(value, ['enabled']) || own(value, 'enabled') && typeof value.enabled !== 'boolean') throw invalid('英雄模块配置只允许 enabled 布尔值');
  return { enabled: value.enabled ?? false };
}
export function validateHeroParameters(value = {}) {
  if (!plainFields(value, ['heroId', 'action', 'skillIdx', 'allowUniversal'])) throw invalid('英雄参数只允许 heroId、action、skillIdx、allowUniversal');
  const out = {};
  if (own(value, 'heroId')) { if (!id(value.heroId)) throw invalid('heroId 必须为明确英雄 ID'); out.heroId = value.heroId; }
  if (own(value, 'action')) { if (!kinds.includes(value.action)) throw invalid('action 只允许 level、star、skill'); out.action = value.action; }
  if (own(value, 'skillIdx')) {
    if (value.action !== 'skill' || !positive(value.skillIdx) || value.skillIdx > 4) throw invalid('skillIdx 必须为 skill 动作的 1 至 4 槽位');
    out.skillIdx = value.skillIdx;
  }
  if (own(value, 'allowUniversal') && (value.action !== 'star' || typeof value.allowUniversal !== 'boolean')) throw invalid('allowUniversal 只允许用于 star 动作且必须为布尔值');
  if (value.action === 'star') out.allowUniversal = value.allowUniversal ?? false;
  return out;
}
function exactNonnegative(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const normalized = toSnapshotJson(value);
  if (!(typeof normalized === 'number' && Number.isSafeInteger(normalized)) && !(typeof normalized === 'string' && /^(0|[1-9]\d*)$/.test(normalized))) return null;
  try { const number = BigInt(normalized); return number >= 0n && number < (1n << 63n) ? number.toString() : null; } catch { return null; }
}
function validSnapshot(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));
  if (!object(value) && !Array.isArray(value)) return false;
  return (Array.isArray(value) ? dense(value) : true) && Object.values(value).every(validSnapshot);
}
// Protobuf scalar defaults are not observations. Empty constructor-created
// repeated arrays cannot establish a hero's skill state, so require actual slots.
export function parseOperationHero(value) {
  if (!own(value, 'heroId') || !id(value.heroId) || !own(value, 'level') || !positive(value.level)
    || !own(value, 'star') || !uint(value.star) || !own(value, 'power') || exactNonnegative(value.power) === null
    || !own(value, 'skillLevels') || !dense(value.skillLevels) || !value.skillLevels.length || value.skillLevels.length > 4 || !value.skillLevels.every(uint)) return null;
  const raw = toSnapshotJson(value);
  if (!validSnapshot(raw)) return null;
  raw.power = exactNonnegative(value.power);
  return { heroId: value.heroId, level: value.level, star: value.star, power: raw.power, skillLevels: [...value.skillLevels], raw };
}
function heroList(response) {
  if (!own(response, 'heroes') || !dense(response.heroes) || !response.heroes.length) return null;
  const parsed = response.heroes.map(parseOperationHero);
  if (parsed.some(value => value === null) || new Set(parsed.map(value => value.heroId)).size !== parsed.length) return null;
  return parsed.sort((a, b) => a.heroId.localeCompare(b.heroId));
}
export function parseOperationInventory(items, resources) {
  const itemValid = own(items, 'items') && dense(items.items) && items.items.every(row => own(row, 'itemId') && id(row.itemId)
    && own(row, 'num') && safeResourceQuantity(row.num) !== null
    && (!own(row, 'id') || row.id === row.itemId) && (!own(row, 'count') || equal(row.count, row.num)))
    && new Set(items.items.map(row => row.itemId)).size === items.items.length;
  const resourcesValid = own(resources, 'list') && dense(resources.list) && resources.list.every(row => own(row, 'res') && positive(row.res)
    && own(row, 'amount') && safeResourceQuantity(row.amount) !== null)
    && new Set(resources.list.map(row => row.res)).size === resources.list.length;
  if (!itemValid || !resourcesValid) return { stock: new Map(), stockReliable: false };
  const names = new Set(items.items.map(row => row.itemId));
  if (resources.list.some(row => names.has(RESOURCE_NAMES[row.res] ?? String(row.res)))) return { stock: new Map(), stockReliable: false };
  const stock = stockFromResponses(items, resources);
  return { stock, stockReliable: [...stock.values()].every(value => value !== null) };
}
function playerIdentity(player) {
  const values = ['id', 'playerId'].filter(key => own(player, key)).map(key => exactNonnegative(player[key]));
  return values.length && values.every(value => value !== null && value !== '0' && value === values[0]) ? values[0] : null;
}
export async function surveyHeroOperations(client, protocol, { player, parameters = {}, signal, stop, timeout = 15000 } = {}) {
  parameters = validateHeroParameters(parameters);
  const notes = [], active = () => assertExecutionActive(client, { signal, stop });
  active();
  const responses = await Promise.all(queryTypes.map(async ([request, response]) => {
    active();
    if (!protocol?.[request] || !protocol?.[response]) { notes.push(request + ': PROTOCOL_UNAVAILABLE'); return null; }
    try { return await awaitExecution(client.request(request, {}, response, timeout, { signal }), client, { signal, stop }); }
    catch (error) { if (executionOutcome(error) === 'CANCELLED') throw error; notes.push(request + ': STATE_UNKNOWN'); return null; }
  }));
  active();
  const heroes = heroList(responses[0]), playerId = playerIdentity(player), playerLevel = own(player, 'level') && positive(player.level) ? player.level : null;
  return { module: 'heroes', heroes, heroesReliable: heroes !== null, playerId, playerLevel,
    ...parseOperationInventory(responses[1], responses[2]), parameters, available: Object.keys(protocol ?? {}), notes,
    state: { playerId, playerLevel, heroes: heroes?.map(hero => hero.raw) ?? null } };
}
function rows(config, name) { const value = config?.tables?.[name]?.data; return dense(value) && value.length ? value : null; }
function ordered(rows, key, first = 0) { return rows.every((row, index) => own(row, key) && uint(row[key]) && row[key] >= first && (!index || rows[index - 1][key] < row[key])); }
function configProblem(config, hero, action, slot) {
  const heroRows = rows(config, 'HeroCfg');
  if (!heroRows || heroRows.some(row => !own(row, 'id') || !id(row.id)) || new Set(heroRows.map(row => row.id)).size !== heroRows.length) return 'HERO_CONFIG_UNKNOWN';
  const cfg = heroRows.find(row => row.id === hero.heroId);
  if (!cfg || !own(cfg, 'quality') || !own(qualityCost, cfg.quality)) return 'HERO_QUALITY_UNKNOWN';
  if (action === 'level') {
    const levels = rows(config, 'HeroUpgradeCfg');
    if (!levels || !ordered(levels, 'level', 1) || levels.some((row, index) => !own(row, 'reqPlayerLv') || !positive(row.reqPlayerLv)
      || !own(row, 'exp') || safeResourceQuantity(row.exp) === null || index > 0 && row.reqPlayerLv < levels[index - 1].reqPlayerLv)) return 'HERO_LEVEL_CONFIG_UNKNOWN';
  } else {
    const stars = rows(config, 'HeroStarCfg');
    if (!stars || !ordered(stars, 'star')) return 'HERO_STAR_CONFIG_UNKNOWN';
    if (action === 'star' && stars.some(row => !own(row, qualityCost[cfg.quality]) || safeResourceQuantity(row[qualityCost[cfg.quality]]) === null)) return 'HERO_STAR_COST_UNKNOWN';
    if (action === 'skill') {
      if (slot >= hero.skillLevels.length || !own(hero.skillLevels, slot) || hero.skillLevels[slot] === 0) return 'SKILL_NOT_UNLOCKED';
      if (stars.some(row => !own(row, 'maxSkillLevel') || !dense(row.maxSkillLevel) || !own(row.maxSkillLevel, slot) || !row.maxSkillLevel.every(uint))) return 'HERO_SKILL_CAP_UNKNOWN';
      if (stars.some((row, index) => index > 0 && row.maxSkillLevel[slot] < stars[index - 1].maxSkillLevel[slot])) return 'HERO_SKILL_CAP_UNKNOWN';
      const skillRows = rows(config, 'HeroSkillUpCfg');
      if (!skillRows || skillRows.some(row => !own(row, 'quality') || !own(qualityCost, row.quality) || !own(row, 'level') || !positive(row.level))
        || new Set(skillRows.map(row => row.quality + ':' + row.level)).size !== skillRows.length) return 'HERO_SKILL_CONFIG_UNKNOWN';
      const target = skillRows.find(row => row.quality === cfg.quality && row.level === hero.skillLevels[slot] + 1), cost = target?.costArr?.[slot];
      if (!own(target, 'costArr') || !dense(target.costArr) || !own(target.costArr, slot) || !dense(cost) || cost.length !== 2 || !id(cost[0]) || safeResourceQuantity(cost[1]) === null) return 'HERO_SKILL_COST_UNKNOWN';
    }
  }
  return null;
}
function reliableInventory(facts) {
  return facts?.stockReliable === true && facts.stock instanceof Map
    && [...facts.stock].every(([key, value]) => id(key) && typeof value === 'number' && safeResourceQuantity(value) === value);
}
function reliableHeroes(facts) {
  return facts?.heroesReliable === true && dense(facts.heroes) && facts.heroes.length > 0
    && new Set(facts.heroes.map(hero => hero?.heroId)).size === facts.heroes.length
    && facts.heroes.every(hero => { const parsed = parseOperationHero(hero?.raw); return parsed !== null && equal(parsed, hero); });
}
const growth = hero => ({ heroId: hero.heroId, level: hero.level, star: hero.star, skillLevels: [...hero.skillLevels] });
function nextGrowth(hero, action, slot) {
  const expected = growth(hero);
  if (action === 'skill') expected.skillLevels[slot] += 1; else expected[action === 'level' ? 'level' : 'star'] += 1;
  return expected;
}
function candidate(facts, parameters, { config, moduleConfig = HERO_DEFAULT_CONFIG } = {}) {
  parameters = validateHeroParameters(parameters); moduleConfig = validateHeroConfig(moduleConfig);
  const hero = facts?.heroes?.find(row => row.heroId === parameters.heroId), action = parameters.action, slot = parameters.skillIdx - 1;
  let reason = null, step = null, request = null, costs = [], plannerNotes = [];
  if (!parameters.heroId || !action || action === 'skill' && !own(parameters, 'skillIdx')) reason = 'EXPLICIT_HERO_AND_ATOMIC_ACTION_REQUIRED';
  else if (moduleConfig.enabled !== true) reason = 'HERO_MODULE_DISABLED';
  else if (!reliableHeroes(facts) || !hero || !facts.playerId || !positive(facts.playerLevel)) reason = 'HERO_OR_PLAYER_STATE_UNKNOWN';
  else if (!reliableInventory(facts)) reason = 'INVENTORY_UNKNOWN';
  else if (parameters.allowUniversal === true) reason = 'UNIVERSAL_EXCHANGE_BLOCKED_EVIDENCE';
  else if ((reason = configProblem(config, hero, action, slot)) === null) {
    // Isolate one observed hero/kind/slot in the original planner. Never reserve
    // future steps or authorize a skill against a hypothetical star upgrade.
    const preview = planHeroes({ config, heroes: [hero], playerLevel: facts.playerLevel, allowUniversal: false, heroIds: [hero.heroId],
      itemNum: item => facts.stock.get(item) ?? 0, ledger: new ResourceLedger(facts.stock), kinds: [action], atomic: true, slots: action === 'skill' ? [slot] : null });
    plannerNotes = preview.notes;
    if (preview.steps.length !== 1) reason = 'NO_AFFORDABLE_NEXT_STEP';
    else {
      step = preview.steps[0]; costs = resourceCosts(step.costs); request = buildHeroAction(step);
      if (step.kind !== action || step.heroId !== hero.heroId || step.to !== step.from + 1 || action === 'level' && step.count !== 1
        || action === 'star' && (step.universal !== false || request.body.universal !== false) || action === 'skill' && step.slot !== slot) reason = 'ATOMIC_PLANNER_CONTRACT_MISMATCH';
      else if (!facts.available?.includes(request.request) || request.response && !facts.available?.includes(request.response)) reason = 'PROTOCOL_UNAVAILABLE';
      else { try { assertPaymentAllowed({ ...request, costs }); } catch (error) { reason = error.code ?? 'COST_NOT_ALLOWED'; } }
    }
  }
  const beforeState = hero ? clone(hero.raw) : null, expectedState = hero && action && (action !== 'skill' || uint(slot) && slot < hero.skillLevels.length) ? nextGrowth(hero, action, slot) : null;
  const identity = hero ? hash({ playerId: facts.playerId, playerLevel: facts.playerLevel, heroes: facts.heroes?.map(row => row.raw), dependencies: heroDependencyVersions({ config, moduleConfig, parameters }) }) : null;
  const target = { heroId: parameters.heroId ?? null, ...(action === 'skill' ? { skillIdx: parameters.skillIdx ?? null } : {}) };
  // Stable semantic selector for Workflow nodes. Fresh identity, complete before
  // state, expected state and costs are still bound to each single-batch permit.
  return { module: 'heroes', actionId: 'heroes:' + String(action).toUpperCase() + ':' + hash({ target, parameters }),
    actionType: action?.toUpperCase() ?? 'GROW', target, parameters, identity, beforeState, expectedState, costs, costSource: sources[action] ?? 'src/heroes.mjs#planHeroes',
    executable: reason === null, blockedReason: reason, notes: plannerNotes, label: '英雄 ' + (parameters.heroId ?? '') + ' ' + (action ?? ''),
    ...(reason === null ? { action: request } : {}) };
}
export function viewHeroOperations(facts, { config, moduleConfig = HERO_DEFAULT_CONFIG, parameters = facts?.parameters ?? {} } = {}) {
  parameters = validateHeroParameters(parameters); moduleConfig = validateHeroConfig(moduleConfig);
  const choices = [];
  for (const hero of facts?.heroes ?? []) {
    if (parameters.heroId && parameters.heroId !== hero.heroId) continue;
    for (const action of kinds) {
      if (parameters.action && parameters.action !== action) continue;
      if (action === 'skill') {
        for (let slot = 0; slot < hero.skillLevels.length; slot += 1) {
          if (parameters.skillIdx && parameters.skillIdx !== slot + 1) continue;
          choices.push({ heroId: hero.heroId, action, skillIdx: slot + 1 });
        }
      } else choices.push({ heroId: hero.heroId, action, ...(action === 'star' ? { allowUniversal: parameters.allowUniversal ?? false } : {}) });
    }
  }
  if (!choices.length) choices.push(parameters);
  const candidates = choices.map(choice => candidate(facts, choice, { config, moduleConfig }));
  return { module: 'heroes', heroes: facts?.heroes?.map(hero => ({ ...growth(hero), power: hero.power })) ?? [], playerLevel: facts?.playerLevel ?? null,
    reliability: { heroes: facts?.heroesReliable === true, stock: facts?.stockReliable === true, player: Boolean(facts?.playerId) && positive(facts?.playerLevel) },
    candidates, blocked: candidates.filter(row => !row.executable), notes: [...(facts?.notes ?? [])], universalExchange: 'BLOCKED_EVIDENCE' };
}
export function planHeroOperations(facts, { config, moduleConfig = HERO_DEFAULT_CONFIG, parameters = {}, selections, ledger = new ResourceLedger(facts?.stockReliable === true ? facts.stock : null) } = {}) {
  parameters = validateHeroParameters(parameters);
  if (selections !== undefined && (!dense(selections) || selections.some(value => typeof value !== 'string') || new Set(selections).size !== selections.length)) throw invalid('selections 必须为唯一 actionId 数组');
  const row = candidate(facts, parameters, { config, moduleConfig });
  if (row.executable && (selections === undefined || selections.includes(row.actionId)) && ledger.reserve(row.costs)) return { module: 'heroes', actions: [row], notes: [] };
  return { module: 'heroes', actions: [], notes: [row.blockedReason ?? 'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_INSUFFICIENT', ...row.notes] };
}
function unchangedTarget(before, after, action) {
  const projected = value => Object.fromEntries(Object.entries(value.raw).filter(([key]) => !['power', 'attributes', action === 'skill' ? 'skillLevels' : action === 'level' ? 'level' : 'star'].includes(key)));
  return equal(projected(before), projected(after));
}
export function verifyHeroOperation(operation, beforeFacts, afterFacts, response) {
  const fail = reason => ({ confirmed: false, reason });
  let parameters, costs;
  try { parameters = validateHeroParameters(operation?.parameters); costs = resourceCosts(operation?.costs); } catch { return fail('OPERATION_CONTRACT_INVALID'); }
  const before = beforeFacts?.heroes?.find(hero => hero.heroId === parameters.heroId), after = afterFacts?.heroes?.find(hero => hero.heroId === parameters.heroId), action = parameters.action, slot = parameters.skillIdx - 1;
  if (operation?.module !== 'heroes' || !before || !after || !kinds.includes(action) || action === 'skill' && (!own(parameters, 'skillIdx') || slot >= before.skillLevels.length)
    || !reliableHeroes(beforeFacts) || !reliableHeroes(afterFacts) || beforeFacts.playerId !== afterFacts.playerId || !beforeFacts.playerId
    || !positive(beforeFacts.playerLevel) || beforeFacts.playerLevel !== afterFacts.playerLevel) return fail('HERO_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if (parameters.allowUniversal === true || !equal(operation.target, { heroId: parameters.heroId, ...(action === 'skill' ? { skillIdx: parameters.skillIdx } : {}) })
    || operation.actionType !== action.toUpperCase() || operation.costSource !== sources[action] || !equal(operation.beforeState, before.raw)) return fail('OPERATION_TARGET_OR_BEFORE_STATE_MISMATCH');
  const expected = nextGrowth(before, action, slot), expectedAction = buildHeroAction({ kind: action, heroId: before.heroId, slot, universal: false });
  if (!equal(operation.action, expectedAction) || !equal(operation.expectedState, expected) || !equal(growth(after), expected) || !unchangedTarget(before, after, action)) return fail('EXACT_HERO_INCREMENT_NOT_CONFIRMED');
  const otherHeroes = facts => facts.heroes.filter(hero => hero.heroId !== parameters.heroId).map(hero => hero.raw).sort((a, b) => a.heroId.localeCompare(b.heroId));
  if (!equal(otherHeroes(beforeFacts), otherHeroes(afterFacts))) return fail('NON_TARGET_HERO_CHANGED');
  if (!reliableInventory(beforeFacts) || !reliableInventory(afterFacts)) return fail('INVENTORY_AUTHORITY_UNKNOWN');
  if (costs.some(({ id, num }) => safeResourceQuantity(beforeFacts.stock.get(id) ?? 0) === null || safeResourceQuantity(afterFacts.stock.get(id) ?? 0) === null
    || (beforeFacts.stock.get(id) ?? 0) < num || (afterFacts.stock.get(id) ?? 0) !== (beforeFacts.stock.get(id) ?? 0) - num)) return fail('EXACT_MATERIAL_DEBIT_NOT_CONFIRMED');
  // A growth request has no reward. Any other inventory movement makes this
  // observation ambiguous rather than allowing an unrelated spend to prove it.
  const debits = new Map(costs.map(row => [row.id, row.num])), stockIds = new Set([...beforeFacts.stock.keys(), ...afterFacts.stock.keys()]);
  for (const key of stockIds) if (!debits.has(key) && (beforeFacts.stock.get(key) ?? 0) !== (afterFacts.stock.get(key) ?? 0)) return fail('NON_TARGET_INVENTORY_CHANGED');
  if (action === 'star') {
    const acknowledged = own(response, 'nextStar') ? parseOperationHero(response.nextStar) : null;
    if (!acknowledged || !equal(growth(acknowledged), expected) || !equal(acknowledged.raw, after.raw)) return fail('STAR_RESPONSE_AND_AUTHORITY_MISMATCH');
  }
  return { confirmed: true, reason: '新 AllHero 复读确认单次英雄成长、精确材料扣除及非目标状态不变', afterState: clone(after.raw),
    responseEvidence: action === 'star' ? { nextStar: clone(after.raw) } : null };
}
export function heroDependencyVersions({ config, moduleConfig = HERO_DEFAULT_CONFIG, parameters = {} } = {}) {
  const action = parameters?.action, tables = ['HeroCfg', ...(action === 'level' ? ['HeroUpgradeCfg'] : action === 'star' ? ['HeroStarCfg'] : action === 'skill' ? ['HeroStarCfg', 'HeroSkillUpCfg'] : ['HeroUpgradeCfg', 'HeroStarCfg', 'HeroSkillUpCfg'])];
  return { moduleConfig: clone(moduleConfig), ...Object.fromEntries(tables.map(name => ['config.' + name, clone(config?.tables?.[name] ?? null)])) };
}
export const heroModule = Object.freeze({ id: 'heroes', label: '英雄成长', capabilities: Object.freeze(['C221', 'C222', 'C223', 'C224']),
  defaultConfig: HERO_DEFAULT_CONFIG, validateConfig: validateHeroConfig, validateParameters: validateHeroParameters,
  survey: surveyHeroOperations, view: viewHeroOperations, plan: planHeroOperations, verify: verifyHeroOperation,
  dependencyVersions: heroDependencyVersions, dependencyKeys: Object.freeze(['moduleConfig', 'config.HeroCfg', 'config.HeroUpgradeCfg', 'config.HeroStarCfg', 'config.HeroSkillUpCfg']) });
