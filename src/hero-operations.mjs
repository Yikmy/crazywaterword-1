// Hero growth semantics only. Authorization, transport, budgets, cancellation and
// durable execution history belong to the existing shared operation executor.
import { createHash } from 'node:crypto';
import { planHeroes, buildHeroAction } from './heroes.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { ResourceLedger, operationBudgetClaims, resourceCosts, safeResourceQuantity, stockFromResponses, RESOURCE_NAMES } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { PIRATE_QUOTA_EVIDENCE } from './pirate-quota.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime } from './state-facts.mjs';

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
const exclusiveKinds = Object.freeze(['exclusive-level', 'exclusive-star', 'exclusive-activate']);
const activationSources=new WeakMap();
const isExclusiveAction = action => exclusiveKinds.includes(action);
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
  if (!plainFields(value, ['heroId', 'action', 'skillIdx', 'allowUniversal', 'num', 'expectedStar', 'expectedFragmentBalance', 'expectedStarCost'])) throw invalid('英雄参数只允许 heroId、action、skillIdx、allowUniversal、num 及明确升星前置');
  const out = {};
  if (own(value, 'heroId')) { if (!id(value.heroId)) throw invalid('heroId 必须为明确英雄 ID'); out.heroId = value.heroId; }
  if (own(value, 'action')) { if (![...kinds, ...exclusiveKinds, 'fragment-exchange'].includes(value.action)) throw invalid('action 只允许 level、star、skill、exclusive-level、exclusive-star、exclusive-activate、fragment-exchange'); out.action = value.action; }
  if (own(value, 'skillIdx')) {
    if (value.action !== 'skill' || !positive(value.skillIdx) || value.skillIdx > 4) throw invalid('skillIdx 必须为 skill 动作的 1 至 4 槽位');
    out.skillIdx = value.skillIdx;
  }
  if (own(value, 'allowUniversal') && (value.action !== 'star' || typeof value.allowUniversal !== 'boolean')) throw invalid('allowUniversal 只允许用于 star 动作且必须为布尔值');
  if (value.action === 'star') out.allowUniversal = value.allowUniversal ?? false;
  if (own(value, 'num')) {
    if (value.action !== 'fragment-exchange' || !positive(value.num)) throw invalid('num 只允许用于 fragment-exchange 且必须为正 int32');
    out.num = value.num;
  }
  const guards = ['expectedStar', 'expectedFragmentBalance', 'expectedStarCost'];
  if (guards.some(key => own(value, key))) {
    if (!['star', 'fragment-exchange'].includes(value.action) || !guards.every(key => own(value, key) && uint(value[key])) || value.expectedStarCost === 0) throw invalid('升星组合须同时明确原星级、当前专属碎片余额及正整数单星成本');
    for (const key of guards) out[key] = value[key];
  }
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
export function parseOperationInventory(items, resources, { allowLegacyAliases = false } = {}) {
  // Existing world/order item inputs also accept id/count. Canonical fields and
  // explicit conflicts still pass through the same strict completeness checks.
  if (allowLegacyAliases && own(items, 'items') && dense(items.items)) {
    items = { items: items.items.map(row => ({ ...row,
      itemId: own(row, 'itemId') ? row.itemId : own(row, 'id') ? row.id : undefined,
      num: own(row, 'num') ? row.num : own(row, 'count') ? row.count : undefined,
    })) };
  }
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
  const notes = [], active = () => assertExecutionActive(client, { signal, stop }), context = exclusiveContext(client, player);
  active();
  const responses = await Promise.all(queryTypes.map(async ([request, response]) => {
    active();
    if (!protocol?.[request] || !protocol?.[response]) { notes.push(request + ': PROTOCOL_UNAVAILABLE'); return { value: null, sourceAt: Date.now() }; }
    try { const value = await awaitExecution(client.request(request, {}, response, timeout, { signal }), client, { signal, stop }); return { value, sourceAt: Date.now() }; }
    catch (error) { if (executionOutcome(error) === 'CANCELLED') throw error; notes.push(request + ': STATE_UNKNOWN'); return { value: null, sourceAt: Date.now() }; }
  }));
  active();
  if ((isExclusiveAction(parameters.action) || parameters.action === 'fragment-exchange' || own(parameters, 'expectedStar')) && !equal(context, exclusiveContext(client, player))) throw Object.assign(new Error('英雄采集期间账号、角色或连接代次改变'), { code: 'CANCELLED' });
  const observed = responses.map(row => row.value), inputs = { heroes: toSnapshotJson(observed[0]), items: toSnapshotJson(observed[1]), resources: toSnapshotJson(observed[2]) };
  const rawHeroes = heroList(observed[0]), heroes = rawHeroes === null ? null : heroList(inputs.heroes), playerId = playerIdentity(player), playerLevel = own(player, 'level') && positive(player.level) ? player.level : null;
  // Inspect decoded optional fields before normalization. Prototype scalar
  // defaults cannot establish ownership, activation or an observed zero star.
  const exclusiveObservations = rawHeroes === null ? [] : observed[0].heroes.filter(row => observedExclusive(row) !== null).map(row => ({ heroId: row.heroId, exclusive: observedExclusive(row) })).sort((a, b) => a.heroId.localeCompare(b.heroId));
  const rawInventory = parseOperationInventory(observed[1], observed[2]), inventory = rawInventory.stockReliable ? parseOperationInventory(inputs.items, inputs.resources) : rawInventory;
  const provenance = { accountId: context.accountId, generation: context.generation, scope: { kind: 'ACCOUNT' } };
  const sourceFacts = Object.fromEntries(['heroes', 'items', 'resources'].map((key, index) => [key, createStateFact(inputs[key], { ...provenance, source: queryTypes[index][1], sourceAt: responses[index].sourceAt, reliable: index === 0 ? heroes !== null : inventory.stockReliable })]));
  sourceFacts.inventory = createStateFact({ items: inputs.items, resources: inputs.resources }, { ...provenance, source: 'AllItemResponse+AllResourceResponse', sourceAt: Math.min(responses[1].sourceAt, responses[2].sourceAt), reliable: inventory.stockReliable });
  const facts = { module: 'heroes', heroes, heroesReliable: heroes !== null, playerId, playerLevel, ...inventory, parameters, available: Object.keys(protocol ?? {}), notes,
    identityContext: context, inputs, sourceFacts, exclusiveObservations,
    state: { playerId, playerLevel, heroes: heroes?.map(hero => hero.raw) ?? null, ...((isExclusiveAction(parameters.action) || parameters.action === 'fragment-exchange' || own(parameters, 'expectedStar')) ? { context } : {}) } };
  if(parameters.action==='exclusive-activate')activationSources.set(facts,{client,player,context,worldOpenTime:own(player,'worldOpenTime')&&positive(player.worldOpenTime)?player.worldOpenTime:null,inactiveIds:rawHeroes===null?[]:observed[0].heroes.filter(inactiveExclusive).map(row=>row.heroId),digest:hash({inputs:facts.inputs,sourceFacts:facts.sourceFacts,heroes:facts.heroes})});
  return facts;
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
  if (parameters.action === 'fragment-exchange') return fragmentExchangeCandidate(facts, parameters, { config, moduleConfig });
  if (isExclusiveAction(parameters.action)) return exclusiveCandidate(facts, parameters, { config, moduleConfig });
  const hero = facts?.heroes?.find(row => row.heroId === parameters.heroId), action = parameters.action, slot = parameters.skillIdx - 1;
  let reason = null, step = null, request = null, costs = [], plannerNotes = [];
  if (!parameters.heroId || !action || action === 'skill' && !own(parameters, 'skillIdx')) reason = 'EXPLICIT_HERO_AND_ATOMIC_ACTION_REQUIRED';
  else if (moduleConfig.enabled !== true) reason = 'HERO_MODULE_DISABLED';
  else if (!reliableHeroes(facts) || !hero || !facts.playerId || !positive(facts.playerLevel)) reason = 'HERO_OR_PLAYER_STATE_UNKNOWN';
  else if (!reliableInventory(facts)) reason = 'INVENTORY_UNKNOWN';
  else if (parameters.allowUniversal === true) reason = 'UNIVERSAL_EXCHANGE_BLOCKED_EVIDENCE';
  else if (own(parameters, 'expectedStar') && (reason = starStepProblem(facts, parameters, config)) !== null) {}
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
    for (const action of (isExclusiveAction(parameters.action) || parameters.action === 'fragment-exchange') ? [parameters.action] : kinds) {
      if (parameters.action && parameters.action !== action) continue;
      if (action === 'skill') {
        for (let slot = 0; slot < hero.skillLevels.length; slot += 1) {
          if (parameters.skillIdx && parameters.skillIdx !== slot + 1) continue;
          choices.push({ heroId: hero.heroId, action, skillIdx: slot + 1 });
        }
      } else choices.push({ heroId: hero.heroId, action, ...(action === 'fragment-exchange' && own(parameters, 'num') ? { num: parameters.num } : {}), ...(action === 'star' ? { allowUniversal: parameters.allowUniversal ?? false } : {}), ...Object.fromEntries(['expectedStar','expectedFragmentBalance','expectedStarCost'].filter(key => own(parameters, key)).map(key => [key, parameters[key]])) });
    }
  }
  if (!choices.length) choices.push(parameters);
  const exclusive = isExclusiveAction(parameters.action);
  const authority = (exclusive || parameters.action === 'fragment-exchange') && moduleConfig.enabled && exclusiveAuthority(facts);
  const candidates = choices.map(choice => parameters.action === 'fragment-exchange'
    ? fragmentExchangeCandidate(facts, choice, { config, moduleConfig, authority, includePlanEvidence: false }) : exclusive
    ? exclusiveCandidate(facts, choice, { config, moduleConfig, authority, includePlanEvidence: false })
    : candidate(facts, choice, { config, moduleConfig }));
  return { module: 'heroes', heroes: facts?.heroes?.map(hero => ({ ...growth(hero), power: hero.power, ...(observedExclusive(hero.raw) ? { exclusive: clone(observedExclusive(hero.raw)) } : {}) })) ?? [], playerLevel: facts?.playerLevel ?? null,
    reliability: { heroes: facts?.heroesReliable === true, stock: facts?.stockReliable === true, player: Boolean(facts?.playerId) && positive(facts?.playerLevel) },
    candidates, blocked: candidates.filter(row => !row.executable), notes: [...(facts?.notes ?? [])], universalExchange: 'BLOCKED_EVIDENCE', fragmentExchange: 'EXPLICIT_1_TO_1',
    fragments: (facts?.heroes ?? []).map(hero => { const cfg = rows(config, 'HeroCfg')?.find(row => row.id === hero.heroId), sourceId = cfg?.universalItemId, targetId = hero.heroId + '碎片'; return { heroId: hero.heroId, sourceId: sourceId ?? null, sourceNum: facts?.stockReliable && id(sourceId) ? facts.stock.get(sourceId) ?? 0 : null, targetId, targetNum: facts?.stockReliable ? facts.stock.get(targetId) ?? 0 : null }; }) };
}
export function validateHeroGrowthPreparation(value) {
  if (!plainFields(value,['targets','maxDurationMs']) || Reflect.ownKeys(value).length!==2 || !dense(value.targets) || Object.getPrototypeOf(value.targets)!==Array.prototype || value.targets.length<1 || value.targets.length>24 || Reflect.ownKeys(value.targets).length!==value.targets.length+1 || !Array.from({length:value.targets.length},(_,i)=>Object.getOwnPropertyDescriptor(value.targets,i)).every(d=>d?.enumerable&&own(d,'value')) || !Number.isSafeInteger(value.maxDurationMs) || value.maxDurationMs<1 || value.maxDurationMs>86400000) throw invalid('英雄成长组合须明确1至24个不同英雄目标及有限总时长');
  const targets=value.targets.map(row=>{if(!plainFields(row,['heroId','action','skillIdx']))throw invalid('成长组合只使用原heroId/action/skillIdx，不混入碎片兑换或升星前置');const p=validateHeroParameters(row);if(!p.heroId||!['level','skill',...exclusiveKinds].includes(p.action)||p.action==='skill'&&!p.skillIdx)throw invalid('须明确英雄及等级、技能槽或明确专武激活/成长动作');return p;});
  if(new Set(targets.map(p=>p.heroId)).size!==targets.length||targets.some(p=>p.action!==targets[0].action))throw invalid('每英雄仅一次，同批须为同一种成长动作');
  return {targets,maxDurationMs:value.maxDurationMs};
}
export function prepareHeroGrowthWorkflow(facts,{config,moduleConfig=HERO_DEFAULT_CONFIG,...input}={}) {
  const p=validateHeroGrowthPreparation(input);if(!exclusiveAuthority(facts)||facts?.parameters?.action!==p.targets[0].action)throw invalid('英雄组合缺少当前完整英雄/库存/身份或原动作来源不一致');
  const ledger=new ResourceLedger(facts.stock),nodes=[{id:'start',type:'START'}];
  const steps=p.targets.map((parameters,i)=>{const plan=planHeroOperations(facts,{config,moduleConfig,parameters,ledger});if(plan.actions.length!==1)throw invalid('所选英雄无当前成长资格或共享自有材料不足；须重新调查并明确选择');const row=plan.actions[0],selection={unique:true};nodes.push({id:'grow-'+i,type:'ACTION',module:'heroes',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'heroes'});return {parameters,selection,target:clone(row.target),costs:clone(row.costs),budgetClaims:operationBudgetClaims(row)};});
  nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:steps.flatMap(row=>row.budgetClaims.uids)};
  return {...p,steps,budget,graph:{version:1,id:'hero-growths-'+hash({p,steps,budget}).slice(0,20),name:'明确英雄逐名单次成长',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['heroes']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'同批一种原成长动作，每英雄只一次等级、明确技能槽或明确专武首次激活/成长；复用原planHeroes/planHeroOperations、成本和完整英雄池/库存验证，共享Ledger仅预留准备时自有材料。每步重新调查、预览、单次授权并独立复读；资格变化、拒绝或UNKNOWN停止。不跨升星推导技能资格，不兑换/补购/重放或恢复执行，首次激活与后续成长分批且各自重新调查授权；原单次及兑换升星入口保留。'};
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
  if (parameters.action === 'fragment-exchange') return verifyFragmentExchange(operation, beforeFacts, afterFacts, parameters);
  if (isExclusiveAction(parameters.action)) return verifyExclusiveGrowth(operation, beforeFacts, afterFacts, parameters);
  const before = beforeFacts?.heroes?.find(hero => hero.heroId === parameters.heroId), after = afterFacts?.heroes?.find(hero => hero.heroId === parameters.heroId), action = parameters.action, slot = parameters.skillIdx - 1;
  if (operation?.module !== 'heroes' || !before || !after || !kinds.includes(action) || action === 'skill' && (!own(parameters, 'skillIdx') || slot >= before.skillLevels.length)
    || !reliableHeroes(beforeFacts) || !reliableHeroes(afterFacts) || beforeFacts.playerId !== afterFacts.playerId || !beforeFacts.playerId
    || !positive(beforeFacts.playerLevel) || beforeFacts.playerLevel !== afterFacts.playerLevel) return fail('HERO_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if (own(parameters, 'expectedStar') && (!exclusiveAuthority(beforeFacts) || !exclusiveAuthority(afterFacts) || !equal(beforeFacts.identityContext, afterFacts.identityContext) || ['heroes','items','resources'].some(key=>afterFacts.sourceFacts[key].provenance.sourceAt < beforeFacts.sourceFacts[key].provenance.sourceAt))) return fail('HERO_STAR_STEP_AUTHORITY_UNKNOWN');
  if (own(parameters, 'expectedStar') && (before.star !== parameters.expectedStar || (beforeFacts.stock?.get(parameters.heroId + '碎片') ?? 0) !== parameters.expectedFragmentBalance || !equal(costs, [{id: parameters.heroId + '碎片', num: parameters.expectedStarCost}]))) return fail('HERO_STAR_STEP_CHANGED');
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
  const action = parameters?.action;
  if (action === 'fragment-exchange') return { moduleConfig: clone(moduleConfig), ...Object.fromEntries([...fragmentExchangeTables, ...(own(parameters, 'expectedStar') ? ['HeroStarCfg'] : [])].map(name => ['config.' + name, clone(config?.tables?.[name] ?? null)])) };
  if (isExclusiveAction(action)) return { moduleConfig: clone(moduleConfig), ...Object.fromEntries(exclusiveTablesFor(action).map(name => ['config.' + name, clone(config?.tables?.[name] ?? null)])) };
  const tables = ['HeroCfg', ...(action === 'level' ? ['HeroUpgradeCfg'] : action === 'star' ? ['HeroStarCfg'] : action === 'skill' ? ['HeroStarCfg', 'HeroSkillUpCfg'] : ['HeroUpgradeCfg', 'HeroStarCfg', 'HeroSkillUpCfg'])];
  return { moduleConfig: clone(moduleConfig), ...Object.fromEntries(tables.map(name => ['config.' + name, clone(config?.tables?.[name] ?? null)])) };
}
export const heroModule = Object.freeze({ id: 'heroes', label: '英雄成长', capabilities: Object.freeze(['C221', 'C222', 'C223', 'C224', 'C225', 'C226']),
  defaultConfig: HERO_DEFAULT_CONFIG, validateConfig: validateHeroConfig, validateParameters: validateHeroParameters,
  survey: surveyHeroOperations, view: viewHeroOperations, plan: planHeroOperations, verify: verifyHeroOperation, rejectionIdentity: businessRejectionIdentityFromHistory,
  dependencyVersions: heroDependencyVersions, dependencyKeys: Object.freeze(['moduleConfig', 'config.HeroCfg', 'config.HeroUpgradeCfg', 'config.HeroStarCfg', 'config.HeroSkillUpCfg', 'config.ExclusiveUpgradeCfg', 'config.ExclusiveStarCfg', 'config.ExclusiveShowCfg', 'config.ExclusiveWeaponCfg', 'config.ItemCfg','config.ModuleOpenCfg','config.GameplayOpenCfg']) });

// Exclusive growth extends the existing hero adapter without changing the legacy planner.
const exclusiveTables = Object.freeze(['HeroCfg', 'ExclusiveUpgradeCfg', 'ExclusiveStarCfg', 'ExclusiveShowCfg', 'ExclusiveWeaponCfg', 'ItemCfg']);
const exclusiveStarTables = Object.freeze(exclusiveTables.filter(name => name !== 'ExclusiveUpgradeCfg'));
const exclusiveActivationTables=Object.freeze([...exclusiveTables,'ModuleOpenCfg','GameplayOpenCfg']);
const exclusiveTablesFor = action => action === 'exclusive-activate' ? exclusiveActivationTables : action === 'exclusive-star' ? exclusiveStarTables : exclusiveTables;
const exclusiveStarStones = Object.freeze(['橙专武升星石', '红专武升星石']);
const exclusiveMaterials = Object.freeze(['初级专武材料', '中级专武材料', '高级专武材料', '特级专武材料']);
const exclusiveSource = 'v76 /subpackages/main/game.js SHA256 a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54 HeroDetailExclusiveLevel.ts:1579 _refreshUI/_refreshBtn/_toUpRequest; current ExclusiveStarCfg.unlockLv; next ExclusiveUpgradeCfg.heroStar/cost[ORANGE:0,RED:1]';
// Static evidence only. nextHero is PREVIEW; each AllHero row is authoritative.
// The module hash covers System.register through the next module (two final LFs).
export const HERO_EXCLUSIVE_LEVEL_EVIDENCE = Object.freeze({
  requirement: 'C225', source: exclusiveSource, request: 'HeroExclusiveLevelUpRequest', response: 'NO_DEDICATED_RESPONSE', preview: 'HeroExclusiveNextUpResponse.nextHero:PREVIEW_ONLY',
  packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  protocolSha256: 'ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc', configSha256: '0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762',
  detail: Object.freeze({ line: 1579, byteOffset: 3490281, size: 11380, sha256: 'b0432b543ca2e5ec359a352eb76dc122a118ba5f266b72bd54d21909ce4a9913', noFinalLFSha256: '96a7be179a456c6c58f13f5471e806800c365f71844585d4080bd9ef4381472d' }),
  tableDataSha256: Object.freeze({ ExclusiveUpgradeCfg: '7d99216fbd4a775f8e35c7ec26fcc47e379c46d4ed383cc6b0c98cfd08084329', ExclusiveStarCfg: '0d7a2881bb870a7e9b0e0d1fc8f02e26d83bcce5f1557b42234e7557d1e308b0', ExclusiveShowCfg: '2f635e736d53a9233fd67381bf36c1b2c793948cfd72b5b2f457f2b6d2129230', ExclusiveWeaponCfg: '107c9b33437116617fd0e974bcefe7066fc10027a0b4633a3e39a7fa75e24c49', HeroCfg: 'e2a075d30d87e05255daa1bbf15429acda8ebf25da8f41d17af65db6bac38a85', ItemCfg: '7d92bf981eeca522dd7f249d5b5fcc16f9f00742803a1eb96c1ba8bc0c0cd6d6' }),
  scope: 'OWNED_ACTIVE_SINGLE_LEVEL_ONLY', activation: 'EXCLUDED', star: 'EXCLUDED', realGame: 'REAL_UNVERIFIED',
});
const exclusiveStarSource = 'v76 /subpackages/main/game.js SHA256 a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54 ExclusiveStarPanel.ts:1111 _refreshUI/_refreshCostInfo/_onUpStar; next ExclusiveStarCfg.heroStar/piece/cost[ORANGE:0,RED:1]; HeroUtil.heroFragItemId; universal=false';
export const HERO_EXCLUSIVE_STAR_EVIDENCE = Object.freeze({
  requirement: 'C226', source: exclusiveStarSource, request: 'HeroExclusiveStarUpRequest', response: 'NO_DEDICATED_RESPONSE', preview: 'HeroExclusiveNextUpResponse.nextHero:PREVIEW_ONLY',
  packageSha256: HERO_EXCLUSIVE_LEVEL_EVIDENCE.packageSha256,
  protocolSha256: HERO_EXCLUSIVE_LEVEL_EVIDENCE.protocolSha256, configSha256: HERO_EXCLUSIVE_LEVEL_EVIDENCE.configSha256,
  panel: Object.freeze({ line: 1111, noFinalLFSha256: '8295bef34f6f46a85c882339e563baac99c54079e3c0a7e33134e49505638b68' }),
  heroUtil: Object.freeze({ line: 1673, noFinalLFSha256: 'f840936aaa78b553aa348a2afd065ea67c861154a8b54c641df409363f6b802a' }),
  tableDataSha256: Object.freeze(Object.fromEntries(exclusiveStarTables.map(name => [name, HERO_EXCLUSIVE_LEVEL_EVIDENCE.tableDataSha256[name]]))),
  scope: 'OWNED_ACTIVE_SINGLE_STAR_ONLY', activation: 'EXCLUDED', universalExchange: 'BLOCKED_EVIDENCE', realGame: 'REAL_UNVERIFIED',
});
// The full AllHero response uses null/absent optional HeroExclusive for the
// client's forging path. A malformed present object is not an inactive weapon.
function inactiveExclusive(hero){
 const descriptor=Object.getOwnPropertyDescriptor(hero??{},'exclusive')??Object.getOwnPropertyDescriptor(Object.getPrototypeOf(hero??{})??{},'exclusive');
 return !descriptor||own(descriptor,'value')&&descriptor.value==null;
}
function activationOpening(f,config){
 const source=activationSources.get(f),player=source?.player,context=f?.identityContext,clock=source&&readGameTime(source.client).gameTime;
 if(!source||!context?.worldId||!context.playerId||source.client.connected!==true||!equal(source.context,context)||!equal(context,exclusiveContext(source.client,player))||source.digest!==hash({inputs:f.inputs,sourceFacts:f.sourceFacts,heroes:f.heroes})||!positive(source.worldOpenTime)||source.worldOpenTime!==player?.worldOpenTime||f.playerLevel!==player?.level||clock?.status!=='TRUSTED'||clock.source!=='PingResponse.serverTimestamp'||clock.accountId!==context.accountId||clock.generation!==context.generation)return null;
 const gates=rows(config,'ModuleOpenCfg')?.filter(row=>row.moduleId==='英雄专武'),opens=rows(config,'GameplayOpenCfg')?.filter(row=>row.gameplay==='英雄专武'),season=Number(BigInt(context.worldId)/1000000n%1000n);
 if(gates?.length!==1||!positive(gates[0].playerLevel)||f.playerLevel<gates[0].playerLevel||opens?.length!==1||!dense(opens[0].openDays)||!opens[0].openDays.length||!opens[0].openDays.every(positive)||!positive(season))return null;
 const requiredDays=opens[0].openDays[Math.min(season-1,opens[0].openDays.length-1)],openMs=source.worldOpenTime*1000,opensAtMs=Math.max(openMs,...PIRATE_QUOTA_EVIDENCE.clockOffsetsMinutes.map(offset=>Math.floor((openMs+offset*60000)/86400000)*86400000-offset*60000+(requiredDays-1)*86400000));
 return clock.earliestMs>=opensAtMs?{worldOpenTime:source.worldOpenTime,requiredDays,opensAtMs,profile:PIRATE_QUOTA_EVIDENCE.profile,playerLevel:f.playerLevel}:null;
}
export const HERO_EXCLUSIVE_ACTIVATION_EVIDENCE=Object.freeze({source:'Fixed v76 HeroDetailExclusiveLevel._refreshUI/_refreshBtn/_toUpRequest (absent exclusive -> level 0 -> 1); HeroDetailUtil.exclusiveOpenDayState; GameUtils.getWorldOpenDays; original supported clock profile',detailSha256:'b0432b543ca2e5ec359a352eb76dc122a118ba5f266b72bd54d21909ce4a9913',heroDetailUtilSha256:'87fef8db837364ce93132a97e8a865d84cdebc9cbd604fbe3a424e9f73759dda',gameUtilsSha256:'d8b834b571eaec46a74d8a8d1ebc8e1745b1b0561eee6b5ef670fb1476787551',scope:'EXPLICIT_OWNED_INACTIVE_FIRST_LEVEL',request:'HeroExclusiveLevelUpRequest',response:null,realGame:'REAL_UNVERIFIED'});
function observedExclusive(value) {
  if (!own(value, 'exclusive') || !object(value.exclusive) || !own(value.exclusive, 'level') || !positive(value.exclusive.level)
    || !own(value.exclusive, 'star') || !uint(value.exclusive.star)) return null;
  return { level: value.exclusive.level, star: value.exclusive.star };
}
function exclusiveContext(client, player) {
  const world = own(player, 'worldId') ? exactNonnegative(player.worldId) : null;
  return { accountId: id(client.factContext?.accountId) ? client.factContext.accountId : null,
    generation: Number.isSafeInteger(client.factContext?.generation) && client.factContext.generation >= 0 ? client.factContext.generation : null,
    connectionId: id(client.factContext?.connectionId) ? client.factContext.connectionId : null,
    playerId: playerIdentity(player), worldId: world && world !== '0' ? world : null };
}
function exclusiveAuthority(facts) {
  const context = facts?.identityContext;
  if (!id(context?.accountId) || !Number.isSafeInteger(context.generation) || context.generation < 0 || !id(context.connectionId)
    || !context.playerId || !context.worldId || facts.playerId !== context.playerId || !positive(facts.playerLevel) || !reliableHeroes(facts) || !reliableInventory(facts)) return false;
  const fresh = (key, source) => facts.sourceFacts?.[key]?.provenance?.source === source && factsFreshnessPolicy(facts.sourceFacts[key], { accountId: context.accountId, generation: context.generation, maxAgeMs: 30000, scope: { kind: 'ACCOUNT' } }).status === 'FRESH';
  const inputs = facts.inputs, heroes = heroList(inputs?.heroes), inventory = parseOperationInventory(inputs?.items, inputs?.resources);
  if (!heroes || !equal(heroes, facts.heroes) || !inventory.stockReliable || !equal([...inventory.stock], [...facts.stock])) return false;
  const observations = inputs.heroes.heroes.filter(row => observedExclusive(row) !== null).map(row => ({ heroId: row.heroId, exclusive: observedExclusive(row) })).sort((a, b) => a.heroId.localeCompare(b.heroId));
  return equal(observations, facts.exclusiveObservations) && ['heroes', 'items', 'resources'].every((key, index) => fresh(key, queryTypes[index][1]) && equal(facts.sourceFacts[key].value, inputs[key]))
    && fresh('inventory', 'AllItemResponse+AllResourceResponse') && facts.sourceFacts.inventory.provenance.sourceAt === Math.min(facts.sourceFacts.items.provenance.sourceAt, facts.sourceFacts.resources.provenance.sourceAt)
    && equal(facts.sourceFacts.inventory.value, { items: inputs.items, resources: inputs.resources });
}
function exclusiveDerivedReliable(hero) {
  return own(hero?.raw, 'attributes') && dense(hero.raw.attributes) && hero.raw.attributes.length > 0
    && hero.raw.attributes.every(row => plainFields(row, ['attr', 'value']) && own(row, 'attr') && uint(row.attr) && own(row, 'value') && typeof row.value === 'number' && Number.isFinite(row.value) && (!Number.isInteger(row.value) || Number.isSafeInteger(row.value)))
    && new Set(hero.raw.attributes.map(row => row.attr)).size === hero.raw.attributes.length;
}
function exclusiveConfig(config, hero, action) {
  const fail = reason => ({ reason, costs: [] }), heroes = rows(config, 'HeroCfg'), shows = rows(config, 'ExclusiveShowCfg'), weapons = rows(config, 'ExclusiveWeaponCfg'), stars = rows(config, 'ExclusiveStarCfg'), items = rows(config, 'ItemCfg');
  const upgradingLevel = action !== 'exclusive-star', upgrades = upgradingLevel ? rows(config, 'ExclusiveUpgradeCfg') : null;
  if (!heroes || !heroes.every(row => own(row, 'id') && id(row.id)) || new Set(heroes.map(row => row.id)).size !== heroes.length) return fail('HERO_CONFIG_UNKNOWN');
  const cfg = heroes.find(row => row.id === hero.heroId);
  if (!cfg || !own(cfg, 'type') || cfg.type !== '英雄' || !own(cfg, 'quality') || !['ORANGE', 'RED'].includes(cfg.quality)) return fail('EXCLUSIVE_SUPPORTED_HERO_REQUIRED');
  if (!shows || !shows.every(row => own(row, 'heroId') && id(row.heroId)) || new Set(shows.map(row => row.heroId)).size !== shows.length || !shows.some(row => row.heroId === hero.heroId)) return fail('EXCLUSIVE_SHOW_CONFIG_UNKNOWN');
  if (!weapons || !weapons.every(row => own(row, 'heroId') && id(row.heroId) && own(row, 'skillLv') && positive(row.skillLv)) || new Set(weapons.map(row => row.heroId + ':' + row.skillLv)).size !== weapons.length || !weapons.some(row => row.heroId === hero.heroId && row.skillLv === 1)) return fail('EXCLUSIVE_WEAPON_CONFIG_UNKNOWN');
  const pair = value => dense(value) && value.length === 2 && exclusiveMaterials.includes(value[0]) && positive(value[1]);
  if (upgradingLevel && (!upgrades || !ordered(upgrades, 'level', 1) || !upgrades.every(row => own(row, 'heroStar') && positive(row.heroStar) && own(row, 'cost') && dense(row.cost) && row.cost.length === 2 && row.cost.every(pair)))) return fail('EXCLUSIVE_LEVEL_CONFIG_UNKNOWN');
  if (!stars || !ordered(stars, 'star') || !stars.every(row => own(row, 'unlockLv') && positive(row.unlockLv))) return fail('EXCLUSIVE_CAP_CONFIG_UNKNOWN');
  if (!items || !items.every(row => own(row, 'id') && id(row.id)) || new Set(items.map(row => row.id)).size !== items.length) return fail('EXCLUSIVE_MATERIAL_CONFIG_UNKNOWN');
  const exclusive = action==='exclusive-activate'?{level:0,star:0}:observedExclusive(hero.raw), current = stars.find(row => row.star === exclusive.star);
  if (!current) return fail('EXCLUSIVE_CURRENT_STAR_CONFIG_UNKNOWN');
  if (!upgradingLevel) {
    // Current cap checks the observed level's consistency; the panel does not
    // require the exclusive to have reached that cap before spending on a star.
    if (exclusive.level > current.unlockLv) return fail('EXCLUSIVE_LEVEL_EXCEEDS_CURRENT_STAR_CAP');
    return exclusiveStarCosts(hero, cfg.quality, current, stars, items);
  }
  const next = upgrades.find(row => row.level === exclusive.level + 1);
  if (exclusive.level >= current.unlockLv) return fail('EXCLUSIVE_LEVEL_CAP');
  if (!next) return fail('EXCLUSIVE_NEXT_LEVEL_CONFIG_UNKNOWN');
  if (hero.star < next.heroStar) return fail('EXCLUSIVE_HERO_STAR_REQUIRED');
  const selected = next.cost[cfg.quality === 'RED' ? 1 : 0], item = items.find(row => row.id === selected[0]);
  if (!item || !own(item, 'type') || item.type !== '专武经验') return fail('EXCLUSIVE_MATERIAL_CONFIG_UNKNOWN');
  return { reason: null, costs: [{ id: selected[0], num: selected[1] }] };
}
function exclusiveStarCosts(hero, quality, current, stars, items) {
  const fail = reason => ({ reason, costs: [] });
  const next = stars.find(row => row.star === current.star + 1);
  if (!next) return fail(current.star === stars.at(-1).star ? 'EXCLUSIVE_STAR_CAP' : 'EXCLUSIVE_NEXT_STAR_CONFIG_UNKNOWN');
  if (!own(next, 'heroStar') || !positive(next.heroStar) || !own(next, 'piece') || !positive(next.piece) || next.unlockLv <= current.unlockLv
    || !own(next, 'cost') || !dense(next.cost) || next.cost.length !== exclusiveStarStones.length
    || !next.cost.every((pair, index) => dense(pair) && pair.length === 2 && pair[0] === exclusiveStarStones[index] && positive(pair[1]))) return fail('EXCLUSIVE_NEXT_STAR_CONFIG_UNKNOWN');
  if (hero.star < next.heroStar) return fail('EXCLUSIVE_HERO_STAR_REQUIRED');
  const [stoneId, stones] = next.cost[quality === 'RED' ? 1 : 0], fragmentId = hero.heroId + '碎片';
  const typedItem = (id, type) => items.some(row => row.id === id && own(row, 'type') && row.type === type && own(row, 'quality') && row.quality === quality);
  if (!typedItem(stoneId, '专武经验') || !typedItem(fragmentId, '英雄碎片')) return fail('EXCLUSIVE_MATERIAL_CONFIG_UNKNOWN');
  return { reason: null, costs: [{ id: fragmentId, num: next.piece }, { id: stoneId, num: stones }] };
}
function exclusiveCandidate(facts, parameters, { config, moduleConfig, authority, includePlanEvidence = true }) {
  const kind = parameters.action, star = kind === 'exclusive-star', activating=kind==='exclusive-activate',opening=activating?activationOpening(facts,config):null, actionType = kind.toUpperCase();
  const hero = facts?.heroes?.find(row => row.heroId === parameters.heroId), exclusive = observedExclusive(hero?.raw), action = buildHeroAction({ kind, heroId: parameters.heroId });
  let reason = null, costs = [];
  if (!parameters.heroId) reason = 'EXPLICIT_HERO_AND_ATOMIC_ACTION_REQUIRED';
  else if (!moduleConfig.enabled) reason = 'HERO_MODULE_DISABLED';
  else if (!(authority ?? exclusiveAuthority(facts)) || !hero) reason = 'EXCLUSIVE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if(activating&&(!opening||!activationSources.get(facts)?.inactiveIds.includes(hero.heroId)||!inactiveExclusive(hero.raw)))reason='EXCLUSIVE_ACTIVATION_OPENING_OR_INACTIVE_STATE_UNKNOWN';
  else if (!activating&&(!exclusive || !facts.exclusiveObservations.some(row => row.heroId === hero.heroId && equal(row.exclusive, exclusive)))) reason = 'OWNED_ACTIVE_EXCLUSIVE_REQUIRED';
  else if (!exclusiveDerivedReliable(hero)) reason = 'TARGET_HERO_DERIVED_STATE_UNKNOWN';
  else { const eligibility = exclusiveConfig(config, activating?{...hero,raw:{...hero.raw,exclusive:{level:0,star:0}}}:hero, kind); reason = eligibility.reason; costs = eligibility.costs;
    if (!reason && !facts.available?.includes(action.request)) reason = 'PROTOCOL_UNAVAILABLE';
    else if (!reason && costs.some(cost => (facts.stock.get(cost.id) ?? 0) < cost.num)) reason = 'EXCLUSIVE_MATERIAL_STOCK_INSUFFICIENT';
    else if (!reason) { try { assertPaymentAllowed({ ...action, costs }); } catch (error) { reason = error.code ?? 'COST_NOT_ALLOWED'; } }
  }
  const target = { heroId: parameters.heroId ?? null };
  return { module: 'heroes', actionId: 'heroes:' + actionType + ':' + hash({ target, parameters }), actionType, target, parameters,
    ...(includePlanEvidence ? {
      identity: hero ? hash({ context: facts.identityContext, playerLevel: facts.playerLevel, heroes: facts.heroes.map(row => row.raw), ...(activating?{activationOpening:opening}:{}), dependencies: heroDependencyVersions({ config, moduleConfig, parameters }) }) : null,
      configEvidence: Object.fromEntries(exclusiveTablesFor(kind).map(name => [name, clone(config?.tables?.[name] ?? null)])),
    } : {}),
    beforeState: hero ? clone(hero.raw) : null, expectedState: hero && (exclusive||activating) ? { ...growth(hero), exclusive: activating?{level:1,star:0}:{ level: exclusive.level + (star ? 0 : 1), star: exclusive.star + (star ? 1 : 0) } } : null,
    costs, costSource: activating?HERO_EXCLUSIVE_ACTIVATION_EVIDENCE.source:star ? exclusiveStarSource : exclusiveSource,
    budgetClaims: { resources: clone(costs), quotas: [], uids: parameters.heroId ? [{ type: 'hero-exclusive', id: parameters.heroId }] : [] },
    executable: reason === null, blockedReason: reason, notes: [], label: (activating?'英雄专武首次激活 ':star ? '英雄专武单次升星 ' : '英雄专武单次升级 ') + (parameters.heroId ?? ''), ...(reason === null ? { action } : {}) };
}
function verifyExclusiveGrowth(operation, beforeFacts, afterFacts, parameters) {
  const fail = reason => ({ confirmed: false, reason });
  if (!exclusiveAuthority(beforeFacts) || !exclusiveAuthority(afterFacts) || !equal(beforeFacts.identityContext, afterFacts.identityContext) || beforeFacts.playerLevel !== afterFacts.playerLevel) return fail('EXCLUSIVE_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if (['heroes', 'items', 'resources'].some(key => afterFacts.sourceFacts[key].provenance.sourceAt < beforeFacts.sourceFacts[key].provenance.sourceAt)) return fail('EXCLUSIVE_POST_WRITE_SOURCE_PREDATES_PRE_WRITE');
  const config = { tables: Object.fromEntries(exclusiveTablesFor(parameters.action).map(name => [name, operation?.configEvidence?.[name] ?? null])) }, contract = exclusiveCandidate(beforeFacts, parameters, { config, moduleConfig: { enabled: true }, authority: true });
  if (!contract.executable || operation.module !== 'heroes' || ['actionId', 'target', 'identity', 'actionType', 'action', 'beforeState', 'expectedState', 'costs', 'costSource', 'budgetClaims', 'configEvidence'].some(key => !equal(operation[key], contract[key]))) return fail('EXCLUSIVE_PLAN_OR_IDENTITY_MISMATCH');
  const before = beforeFacts.heroes.find(row => row.heroId === parameters.heroId), after = afterFacts.heroes.find(row => row.heroId === parameters.heroId);
  if (!before || !after || !observedExclusive(after.raw) || !exclusiveDerivedReliable(before) || !exclusiveDerivedReliable(after)) return fail('TARGET_HERO_DERIVED_STATE_UNKNOWN');
  const dimension = parameters.action === 'exclusive-star' ? 'star' : 'level';
  const expected = { ...clone(before.raw), exclusive: parameters.action==='exclusive-activate'?{level:1,star:0}:{ ...clone(before.raw.exclusive), [dimension]: before.raw.exclusive[dimension] + 1 }, power: after.raw.power, attributes: clone(after.raw.attributes) };
  if (!equal(expected, after.raw)) return fail(dimension === 'star' ? 'EXACT_SINGLE_EXCLUSIVE_STAR_NOT_CONFIRMED' : 'EXACT_SINGLE_EXCLUSIVE_LEVEL_NOT_CONFIRMED');
  const others = facts => facts.heroes.filter(row => row.heroId !== parameters.heroId).map(row => row.raw);
  if (!equal(others(beforeFacts), others(afterFacts))) return fail('NON_TARGET_HERO_CHANGED');
  if (!stockMatchesDelta(beforeFacts.stock, afterFacts.stock, contract.costs, [])) return fail('EXACT_EXCLUSIVE_MATERIAL_DEBIT_OR_OTHER_INVENTORY_CHANGED');
  return { confirmed: true, reason: (parameters.action==='exclusive-activate'?'新 AllHero 完整复读确认原未激活专武首次1级0星、配置材料精确扣除及非目标状态不变':dimension === 'star' ? '新 AllHero 完整复读确认已有专武单次星级+1、等级不变、对应碎片和升星石精确扣除及非目标状态不变' : '新 AllHero 完整复读确认已有专武单次等级+1、所选材料精确扣除及非目标状态不变') + '；仅目标power/attributes允许权威派生变化', afterState: clone(after.raw), responseEvidence: null };
}

// Same fixed v76 FragExchangePop evidence used by antique exchange. The request
// names the target fragment; HeroCfg determines the owned universal source.
const fragmentExchangeTables = Object.freeze(['HeroCfg', 'ItemCfg']);
const heroUniversalFragments = Object.freeze({ BLUE: '蓝卡万能碎片', PURPLE: '紫卡万能碎片', ORANGE: '橙卡万能碎片', RED: '红卡万能碎片' });
const fragmentExchangeSource = 'v76 HeroDetailStar._onBtnShowExchange + FragExchangePop._refreshInfo/_onBtnExchange; HeroCfg.universalItemId; HeroUtil.heroFragItemId; explicit owned source 1:1 target; no star change';
function fragmentExchangeCandidate(facts, parameters, { config, moduleConfig, authority, includePlanEvidence = true }) {
  const target = { heroId: parameters.heroId ?? null }, hero = facts?.heroes?.find(row => row.heroId === parameters.heroId);
  const heroRows = rows(config, 'HeroCfg'), items = rows(config, 'ItemCfg'), cfg = heroRows?.find(row => row.id === parameters.heroId);
  const sourceId = cfg?.universalItemId, targetId = parameters.heroId ? parameters.heroId + '碎片' : null, num = parameters.num;
  let reason = null, costs = [];
  const unique = value => value && value.every(row => own(row, 'id') && id(row.id)) && new Set(value.map(row => row.id)).size === value.length;
  if (!parameters.heroId || !positive(num)) reason = 'EXPLICIT_HERO_AND_EXCHANGE_QUANTITY_REQUIRED';
  else if (!moduleConfig.enabled) reason = 'HERO_MODULE_DISABLED';
  else if (!(authority ?? exclusiveAuthority(facts)) || !hero) reason = 'HERO_FRAGMENT_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if (!unique(heroRows) || !cfg || !own(cfg, 'type') || cfg.type !== '英雄' || !own(cfg, 'quality') || !own(cfg, 'universalItemId') || !own(heroUniversalFragments, cfg.quality) || sourceId !== heroUniversalFragments[cfg.quality]) reason = 'HERO_FRAGMENT_SOURCE_CONFIG_UNKNOWN';
  else if (!unique(items) || !items.some(row => row.id === sourceId && own(row, 'type') && row.type === '英雄万能碎片' && own(row, 'quality') && row.quality === cfg.quality)
    || !items.some(row => row.id === targetId && own(row, 'type') && row.type === '英雄碎片' && own(row, 'quality') && row.quality === cfg.quality)) reason = 'HERO_FRAGMENT_ITEM_CONFIG_UNKNOWN';
  else if (own(parameters, 'expectedStar') && (reason = starStepProblem(facts, parameters, config)) !== null) {}
  else if (!facts.available?.includes('HeroFragExchangeRequest')) reason = 'PROTOCOL_UNAVAILABLE';
  else if ((facts.stock.get(sourceId) ?? 0) < num) reason = 'HERO_FRAGMENT_STOCK_INSUFFICIENT';
  else if (safeResourceQuantity((facts.stock.get(targetId) ?? 0) + num) === null) reason = 'HERO_FRAGMENT_TARGET_OVERFLOW';
  else costs = [{ id: sourceId, num }];
  const action = { request: 'HeroFragExchangeRequest', response: null, body: { heroId: parameters.heroId, fragItemId: targetId, num } };
  if (!reason) { try { assertPaymentAllowed({ ...action, costs }); } catch (error) { reason = error.code ?? 'COST_NOT_ALLOWED'; } }
  const beforeState = hero ? { hero: clone(hero.raw), sourceId, sourceNum: facts.stock?.get(sourceId) ?? 0, targetId, targetNum: facts.stock?.get(targetId) ?? 0 } : null;
  return { module: 'heroes', actionId: 'heroes:FRAGMENT-EXCHANGE:' + hash({ target, parameters }), actionType: 'FRAGMENT-EXCHANGE', target, parameters,
    ...(includePlanEvidence ? { identity: hero ? hash({ context: facts.identityContext, playerLevel: facts.playerLevel, heroes: facts.heroes.map(row => row.raw), beforeState, dependencies: heroDependencyVersions({ config, moduleConfig, parameters }) }) : null,
    configEvidence: Object.fromEntries([...fragmentExchangeTables, ...(own(parameters, 'expectedStar') ? ['HeroStarCfg'] : [])].map(name => [name, clone(config?.tables?.[name] ?? null)])) } : {}),
    beforeState, expectedState: reason === null && beforeState ? { ...clone(beforeState), sourceNum: beforeState.sourceNum - num, targetNum: beforeState.targetNum + num } : null,
    costs, costSource: fragmentExchangeSource,
    budgetClaims: { resources: clone(costs), quotas: [], uids: parameters.heroId ? [{ type: 'hero-fragment-exchange', id: parameters.heroId }] : [] },
    executable: reason === null, blockedReason: reason, notes: [], label: '英雄专属碎片兑换 ' + (parameters.heroId ?? ''), ...(reason === null ? { action } : {}) };
}
function verifyFragmentExchange(operation, before, after, parameters) {
  const fail = reason => ({ confirmed: false, reason });
  if (!exclusiveAuthority(before) || !exclusiveAuthority(after) || !equal(before.identityContext, after.identityContext) || before.playerLevel !== after.playerLevel) return fail('HERO_FRAGMENT_AUTHORITY_OR_CONTEXT_UNKNOWN');
  if (['heroes', 'items', 'resources'].some(key => after.sourceFacts[key].provenance.sourceAt < before.sourceFacts[key].provenance.sourceAt)) return fail('HERO_FRAGMENT_POST_WRITE_SOURCE_PREDATES_PRE_WRITE');
  const config = { tables: Object.fromEntries([...fragmentExchangeTables, ...(own(parameters, 'expectedStar') ? ['HeroStarCfg'] : [])].map(name => [name, operation?.configEvidence?.[name] ?? null])) };
  const contract = fragmentExchangeCandidate(before, parameters, { config, moduleConfig: { enabled: true } });
  if (!contract.executable || operation.module !== 'heroes' || ['actionId','actionType','target','identity','action','beforeState','expectedState','costs','costSource','budgetClaims','configEvidence'].some(key => !equal(operation[key], contract[key]))) return fail('HERO_FRAGMENT_PLAN_OR_IDENTITY_MISMATCH');
  if (!equal(before.heroes, after.heroes)) return fail('HERO_CHANGED_DURING_FRAGMENT_EXCHANGE');
  const { targetId } = contract.beforeState;
  if (!stockMatchesDelta(before.stock, after.stock, contract.costs, [{ id: targetId, num: parameters.num }])) return fail('EXACT_FRAGMENT_EXCHANGE_OR_OTHER_INVENTORY_CHANGED');
  return { confirmed: true, reason: '新完整库存确认对应万能碎片精确扣除及专属碎片1:1净入，全部英雄和其他库存不变', afterState: clone(contract.expectedState), responseEvidence: null };
}

// Compose the existing actions; projected income is never a write fact.
function starStepProblem(facts, parameters, config) {
  const hero = facts?.heroes?.find(row => row.heroId === parameters.heroId);
  if (!reliableHeroes(facts) || !reliableInventory(facts) || !hero) return 'HERO_STAR_STEP_AUTHORITY_UNKNOWN';
  const problem = configProblem(config, hero, 'star');
  if (problem) return problem;
  const cfg = rows(config, 'HeroCfg').find(row => row.id === hero.heroId), next = rows(config, 'HeroStarCfg').find(row => row.star === hero.star + 1);
  if (hero.star !== parameters.expectedStar || (facts.stock.get(hero.heroId + '碎片') ?? 0) !== parameters.expectedFragmentBalance || !next || next[qualityCost[cfg.quality]] !== parameters.expectedStarCost) return 'HERO_STAR_STEP_CHANGED';
  return null;
}
function prepareSingleHeroStarWorkflow(facts, {config, moduleConfig, heroId, num, maxDurationMs, allowOwned = false} = {}) {
  if (!id(heroId) || !(allowOwned ? uint(num) : positive(num)) || !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 86400000) throw invalid('须明确英雄、正int32兑换数量及1至86400000毫秒总时长');
  const hero = facts?.heroes?.find(row => row.heroId === heroId), owned = facts?.stock?.get(heroId + '碎片') ?? 0;
  if (!exclusiveAuthority(facts) || !hero || configProblem(config, hero, 'star')) throw invalid('升星组合缺少完整英雄、库存、身份或星级成本');
  const cfg = rows(config, 'HeroCfg').find(row => row.id === heroId), next = rows(config, 'HeroStarCfg').find(row => row.star === hero.star + 1), need = next?.[qualityCost[cfg.quality]];
  if (!positive(need) || !allowOwned && owned >= need || num !== Math.max(0, need - owned)) throw invalid('本次兑换数量必须恰好补足下一颗星的专属碎片缺口，不推测或多兑换');
  const guards = {expectedStar: hero.star, expectedFragmentBalance: owned, expectedStarCost: need};
  const exchange = {heroId, action:'fragment-exchange', num, ...guards}, star = {heroId, action:'star', allowUniversal:false, ...guards, expectedFragmentBalance:owned + num};
  const operation = planHeroOperations(facts, {config, moduleConfig, parameters:num > 0 ? exchange : star}).actions[0];
  if (!operation) throw invalid('当前兑换不能通过原英雄合同');
  if (!facts.available?.includes('HeroStarUpRequest') || !facts.available?.includes('HeroStarUpResponse')) throw invalid('单星请求或回执协议不可用');
  const budget = {resources:resourceCosts([...operation.costs, ...(num > 0 ? [{id:heroId + '碎片', num:need}] : [])]), quotas:[], uids:clone(operation.budgetClaims?.uids ?? [])};
  const suffix = hash({exchange, star, budget, maxDurationMs}).slice(0,20), nodes = [
    {id:'start',type:'START'}, ...(num > 0 ? [{id:'exchange',type:'ACTION',module:'heroes',parameters:exchange,selection:{unique:true}},
    {id:'verify-exchange',type:'VERIFY',module:'heroes'}] : []), {id:'star',type:'ACTION',module:'heroes',parameters:star,selection:{unique:true}},
    {id:'verify-star',type:'VERIFY',module:'heroes'}, {id:'stop',type:'STOP'}];
  return {heroId, fromStar:hero.star, toStar:hero.star+1, exchangeNum:num, ownedFragments:owned, starCost:need,
    graph:{version:1,id:'hero-star-'+suffix,name:heroId+' 明确兑换后单次升星',budget,runPolicy:{maxDurationMs,maxActions:num > 0 ? 2 : 1,modules:['heroes']},nodes,edges:nodes.slice(1).map((node,index)=>({from:nodes[index].id,to:node.id}))},
    resumable:false, requiresFreshPlan:true, requiresAuthorization:true,
    limitation:'先按明确数量1:1兑换，完整库存确认后重新调查单次升星；各步复用原授权、父预算与历史，UNKNOWN立即停止且不重放。准备不执行，不授予权限，重启只读。专属碎片预算包含兑换所得，但收入不增加累计额度。'};
}

export function validateHeroStarPreparation(value) {
  if (!plainFields(value, ['heroId','num','targets','maxDurationMs']) || !own(value,'maxDurationMs') || !Number.isSafeInteger(value.maxDurationMs) || value.maxDurationMs < 1 || value.maxDurationMs > 86400000) throw invalid('升星准备须明确1至86400000毫秒总时长及受支持的英雄声明');
  if (!own(value, 'targets')) {
    if (!own(value,'heroId') || !own(value,'num') || !id(value.heroId) || !positive(value.num)) throw invalid('单英雄准备须明确英雄和正int32兑换量');
    return {heroId:value.heroId,num:value.num,maxDurationMs:value.maxDurationMs};
  }
  if (own(value,'heroId') || own(value,'num') || !dense(value.targets) || Object.getPrototypeOf(value.targets) !== Array.prototype || value.targets.length < 1 || value.targets.length > 12 || Reflect.ownKeys(value.targets).length !== value.targets.length + 1 || !Array.from({length:value.targets.length},(_,index)=>own(Object.getOwnPropertyDescriptor(value.targets,String(index)),'value')).every(Boolean)
    || value.targets.some(row => !plainFields(row,['heroId','num']) || !own(row,'heroId') || !own(row,'num') || !id(row.heroId) || !uint(row.num)) || new Set(value.targets.map(row=>row.heroId)).size !== value.targets.length) throw invalid('多英雄准备须明确1至12个不同英雄的顺序及非负int32兑换量，不混用单英雄字段');
  return {targets:value.targets.map(({heroId,num})=>({heroId,num})),maxDurationMs:value.maxDurationMs};
}
export function prepareHeroStarWorkflow(facts, {config, moduleConfig, ...input} = {}) {
  const parameters=validateHeroStarPreparation(input);
  if (!own(parameters,'targets')) return prepareSingleHeroStarWorkflow(facts,{config,moduleConfig,...parameters});
  const parts=parameters.targets.map(target=>prepareSingleHeroStarWorkflow(facts,{config,moduleConfig,...target,maxDurationMs:parameters.maxDurationMs,allowOwned:true}));
  const targets=parts.map(({heroId,fromStar,toStar,exchangeNum,ownedFragments,starCost})=>({heroId,fromStar,toStar,exchangeNum,ownedFragments,starCost}));
  const exchanges=parts.filter(part=>part.exchangeNum>0).flatMap(part=>part.graph.budget.resources.filter(row=>row.id!==part.heroId+'碎片')),sourceIds=new Set(exchanges.map(row=>row.id));
  if (targets.some(row=>sourceIds.has(row.heroId+'碎片')) || !new ResourceLedger(facts.stock).reserve(exchanges)) throw invalid('共享万能碎片总量不足或来源与目标重叠；未来收入不补足本次准备');
  const nodes=[{id:'start',type:'START'}];
  for (const [index,part] of parts.entries()) for (const node of part.graph.nodes.slice(1,-1)) nodes.push({...clone(node),id:node.id+'-'+index});
  nodes.push({id:'stop',type:'STOP'});
  const budget={resources:resourceCosts(parts.flatMap(part=>part.graph.budget.resources)),quotas:[],uids:parts.flatMap(part=>part.graph.budget.uids)},maxActions=parts.reduce((sum,part)=>sum+part.graph.runPolicy.maxActions,0),suffix=hash({targets,budget,maxDurationMs:parameters.maxDurationMs}).slice(0,20);
  return {targets,graph:{version:1,id:'hero-stars-'+suffix,name:'明确英雄单星顺序（'+targets.length+'名）',budget,runPolicy:{maxDurationMs:parameters.maxDurationMs,maxActions,modules:['heroes']},nodes,edges:nodes.slice(1).map((node,index)=>({from:nodes[index].id,to:node.id}))},
    resumable:false,requiresFreshPlan:true,requiresAuthorization:true,
    limitation:'按明确英雄顺序各升一星；兑换量必须恰好补缺，已有足够专属碎片则明确填0。共享万能碎片在准备时核总量；每步重新调查、使用原授权/累计预算/独立复读及历史。未来收入不增加额度，前置变化、拒绝、UNKNOWN或期限到限停止；重启只读。'};
}
