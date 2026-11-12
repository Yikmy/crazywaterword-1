// PRO-007 controlled activation and one-star growth of a unique owned antique.
import { createHash } from 'node:crypto';
import { assertPaymentAllowed } from './actions.mjs';
import { stableBusinessValue } from './business-functions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger } from './resource-ledger.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';

const moduleId = 'antique-growth', scope = Object.freeze({ kind: 'ACCOUNT' }), maxAgeMs = 30000;
const qualityCosts = Object.freeze({ BLUE: 'consumeBlue', PURPLE: 'consumePur', ORANGE: 'consumeOra', RED: 'consumeRed' });
const kinds = Object.freeze(['activate', 'star']);
const requests = Object.freeze({ activate: 'ActivateAntiqueRequest', star: 'AntiqueStarUpRequest' });
const source = 'v76 AntiqueItem._onItemClick; AntiqueDetailPop._onBtnStarUp; AntiqueUtil.fragItemId/starUpConsume; AntiqueModel.initData';
export const ANTIQUE_GROWTH_DEFAULT_CONFIG = Object.freeze({ enabled: false });
export const ANTIQUE_GROWTH_EVIDENCE = Object.freeze({
  source, packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
  entrySha256: 'a6046fcc2ad7a3424282e9f8b51073656f5ae8d48742129743560bf958266c54',
  protocolSha256: 'ef6137ef923f0b8b44b10379effe0ac2b3555ffab18b278e03e97b19bf4a4dcc',
  configSha256: '0809253d78b00a81ebb78ab9fc8b94668372f6b8a08430144710325a165da762',
  moduleDigestScope: 'System.register start through next System.register start, including trailing whitespace',
  antiqueItem: Object.freeze({ byteOffset: 252313, requestByteOffset: 256578, sha256: '63e596ddda4fb64ab80668da807f7a4cddb404e331680313b6baf96acded4b34' }),
  antiqueDetail: Object.freeze({ byteOffset: 241854, requestByteOffset: 251108, sha256: '0e05754511fdf6f0a06a40463acc54a2b6650857e74218a7676bd2b7c9302135' }),
  antiqueUtil: Object.freeze({ byteOffset: 300276, fragmentByteOffset: 303526, costByteOffset: 302496, sha256: '360c6897236e7ceb972ea10dd225bfa139edafe4b6f304ba956743201fc1a1a3' }),
  antiqueModel: Object.freeze({ byteOffset: 261581, sha256: '86c3e1c45ef8d1c9ae6aa9a619f779c119b0fea9a9e2ff76deb71fb8609bc2c4' }),
  antiqueSuitPop: Object.freeze({ byteOffset: 287377, sha256: '18ed83eaf78e6af246c1db70bf63fa518e42869d4b43b9ec76a1fee69a330cdf' }),
  topOperateView: Object.freeze({ byteOffset: 6510146, moduleGateByteOffset: 6520318, sha256: '93e8457e8e77aa5acd53d22f731bbb561e0db3c6e40f1d474aa245f9a07ee1c3' }),
  moduleOpenUtil: Object.freeze({ byteOffset: 4674760, sha256: '98544b76338dde2e7da17c1d636507a056a9b078e1a3bc394b1cb1f89d46428b' }),
  scope: 'EXPLICIT_ACTIVATION_STAR_ZERO_OR_ONE_STAR_OWN_SPECIFIC_FRAGMENTS',
  derivedSuitPolicy: 'ACTIVATE only: existing owning-purple suit rows may change server-observed effectiveNum/advEffectValue; no calculated bonus, new suit identity or level change',
  activationInitialStarPolicy: 'Only a new explicit own zero-star row confirms activation; omitted/default star or another initial value is UNKNOWN',
  realGame: 'REAL_UNVERIFIED',
});
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (v, key) => object(v) && Object.hasOwn(v, key);
const fields = (v, keys) => object(v) && Reflect.ownKeys(v).every(key => {
  const descriptor = Object.getOwnPropertyDescriptor(v, key);
  return keys.includes(key) && descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
});
const plainFields = (v, keys) => fields(v, keys) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const missing = (v, keys) => keys.some(key => !own(v, key));
const dense = v => Array.isArray(v) && v.length <= 10000 && Reflect.ownKeys(v).length === v.length + 1
  && Array.from({ length: v.length }, (_, index) => Object.getOwnPropertyDescriptor(v, index))
    .every(d => d?.enumerable && Object.hasOwn(d, 'value'));
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 200 && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v);
const uint = v => Number.isInteger(v) && v >= 0 && v <= 2147483647;
const positive = v => uint(v) && v > 0;
const finite = v => typeof v === 'number' && Number.isFinite(v) && (!Number.isInteger(v) || Number.isSafeInteger(v));
const unique = (rows, key) => new Set(rows.map(key)).size === rows.length;
const same = (a, b) => stableBusinessValue(a) === stableBusinessValue(b);
const copy = value => structuredClone(value);
const hash = value => createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_PARAMETERS', statusCode: 400 });
const liveFacts = new WeakMap();
const factDigest = facts => hash({ parameters: facts.parameters, identityContext: facts.identityContext, catalog: facts.catalog, ownership: facts.ownership, inputs: facts.inputs, sourceFacts: facts.sourceFacts, stock: [...facts.stock], stockReliable: facts.stockReliable, available: facts.available });

function exactPositive(value) {
  const raw = toSnapshotJson(value);
  const decimal = Number.isSafeInteger(raw) && raw > 0 ? String(raw) : raw;
  return typeof decimal === 'string' && /^[1-9][0-9]{0,18}$/.test(decimal) && BigInt(decimal) < (1n << 63n) ? decimal : null;
}
export function validateAntiqueGrowthConfig(value = {}) {
  if (!plainFields(value, ['enabled']) || own(value, 'enabled') && typeof value.enabled !== 'boolean') throw invalid('藏品成长配置只允许 enabled 布尔值');
  return { enabled: value.enabled ?? false };
}
export function validateAntiqueGrowthParameters(value = {}) {
  if (!plainFields(value, ['action', 'antiqueId']) || own(value, 'action') && !kinds.includes(value.action)
      || own(value, 'antiqueId') && !text(value.antiqueId)) throw invalid('藏品成长参数仅允许 action=activate/star 和明确 antiqueId');
  return Object.fromEntries(['action', 'antiqueId'].filter(key => own(value, key)).map(key => [key, value[key]]));
}
const tablesFor = parameters => [
  'ModuleOpenCfg', 'AntiqueBaseCfg',
  ...(parameters?.action !== 'star' ? ['AntiqueSuitCfg'] : []),
  ...(parameters?.action !== 'activate' ? ['AntiqueStarCfg'] : []),
];
function readCatalog(config, parameters) {
  const table = name => config?.tables?.[name]?.data;
  const modules = table('ModuleOpenCfg'), base = table('AntiqueBaseCfg');
  if (!dense(modules) || !dense(base) || !base.length || !base.every(row => !missing(row, ['antiqueId', 'color', 'activeFrag'])
      && text(row.antiqueId) && own(qualityCosts, row.color) && positive(row.activeFrag)) || !unique(base, row => row.antiqueId)) return null;
  const module = modules.filter(row => own(row, 'moduleId') && row.moduleId === '藏品');
  if (module.length !== 1 || !own(module[0], 'playerLevel') || !positive(module[0].playerLevel)) return null;
  const catalog = { playerLevel: module[0].playerLevel, base: base.map(row => ({
    antiqueId: row.antiqueId, color: row.color, activeFrag: row.activeFrag,
    name: own(row, 'showName') && text(row.showName) ? row.showName : row.antiqueId,
  })) };
  if (parameters?.action !== 'star') {
    const suits = table('AntiqueSuitCfg');
    if (!dense(suits) || !suits.every(row => !missing(row, ['suitId', 'taskType', 'taskParam1'])
        && positive(row.suitId) && typeof row.taskType === 'string' && typeof row.taskParam1 === 'string')
        || !unique(suits, row => row.suitId)) return null;
    // The fixed client task is "每拥有{0}个{1}品质藏品" with taskParam1 紫.
    // This binds only the affected identity set; bonus amounts stay server observations.
    const owning = suits.filter(row => row.taskType === '拥有藏品');
    if (owning.some(row => row.taskParam1 !== '紫')) return null;
    catalog.derivedSuitTasks = owning.map(row => ({ suitId: row.suitId, color: 'PURPLE' }));
  }
  if (parameters?.action !== 'activate') {
    const stars = table('AntiqueStarCfg');
    if (!dense(stars) || !stars.length || !stars.every(row => !missing(row, ['star', ...Object.values(qualityCosts)])
        && positive(row.star) && Object.values(qualityCosts).every(key => positive(row[key]))) || !unique(stars, row => row.star)) return null;
    catalog.stars = stars.map(row => Object.fromEntries(['star', ...Object.values(qualityCosts)].map(key => [key, row[key]]))).sort((a, b) => a.star - b.star);
    if (catalog.stars.some((row, index) => row.star !== index + 1)) return null;
  }
  return catalog;
}
export function parseAntiqueOwnership(response) {
  if (missing(response, ['antiques', 'suits', 'masterLv']) || !fields(response, ['antiques', 'suits', 'masterLv'])
      || !dense(response.antiques) || !dense(response.suits) || !uint(response.masterLv)) return null;
  const antiques = [];
  for (const row of response.antiques) {
    if (missing(row, ['id', 'star']) || !fields(row, ['id', 'star']) || !text(row.id) || !uint(row.star)) return null;
    antiques.push({ id: row.id, star: row.star });
  }
  if (!unique(antiques, row => row.id)) return null;
  const suits = [];
  for (const row of response.suits) {
    if (missing(row, ['id', 'level', 'effectiveNum', 'advEffectValue']) || !fields(row, ['id', 'level', 'effectiveNum', 'advEffectValue'])
        || !positive(row.id) || !uint(row.level) || !uint(row.effectiveNum) || !finite(row.advEffectValue) || row.advEffectValue < 0) return null;
    suits.push({ id: row.id, level: row.level, effectiveNum: row.effectiveNum, advEffectValue: row.advEffectValue });
  }
  if (!unique(suits, row => row.id)) return null;
  return { antiques: antiques.sort((a, b) => a.id.localeCompare(b.id)), suits: suits.sort((a, b) => a.id - b.id), masterLv: response.masterLv };
}
function contextOf(client, player) {
  const ids = ['id', 'playerId'].filter(key => own(player, key)).map(key => exactPositive(player[key]));
  const context = client.factContext ?? {};
  return {
    accountId: text(context.accountId) ? context.accountId : null,
    generation: Number.isSafeInteger(context.generation) && context.generation >= 0 ? context.generation : null,
    connectionId: text(context.connectionId) ? context.connectionId : null,
    playerId: ids.length && ids.every(value => value !== null && value === ids[0]) ? ids[0] : null,
    worldId: own(player, 'worldId') ? exactPositive(player.worldId) : null,
    playerLevel: own(player, 'level') && positive(player.level) ? player.level : null,
  };
}
const queries = Object.freeze([
  ['antiques', 'AllAntiqueRequest', 'AllAntiqueResponse'],
  ['items', 'AllItemRequest', 'AllItemResponse'],
  ['resources', 'AllResourceRequest', 'AllResourceResponse'],
]);
export async function surveyAntiqueGrowth(client, protocol, { config, player, parameters = {}, signal, stop, timeout = 15000 } = {}) {
  parameters = validateAntiqueGrowthParameters(parameters);
  const active = () => assertExecutionActive(client, { signal, stop });
  active();
  const identityContext = contextOf(client, player), notes = [];
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
  if (!same(identityContext, contextOf(client, player))) throw Object.assign(new Error('藏品调查期间账号、角色或连接已改变'), { code: 'CANCELLED' });
  const raw = Object.fromEntries(observations.map(({ key, value }) => [key, value])), inputs = toSnapshotJson(raw);
  const ownership = parseAntiqueOwnership(raw.antiques) && parseAntiqueOwnership(inputs.antiques);
  const inventory = parseOperationInventory(raw.items, raw.resources).stockReliable
    ? parseOperationInventory(inputs.items, inputs.resources) : { stock: new Map(), stockReliable: false };
  const sourceFacts = Object.fromEntries(observations.map(({ key, type, sourceAt }) => [key, createStateFact(inputs[key], {
    accountId: identityContext.accountId, generation: identityContext.generation, source: type, sourceAt, scope,
    reliable: key === 'antiques' ? ownership !== null : inventory.stockReliable,
  })]));
  const facts = {
    module: moduleId, parameters, identityContext, catalog: readCatalog(config, parameters), ownership,
    ...inventory, inputs, sourceFacts, available: Object.keys(protocol ?? {}), notes,
    state: { identityContext, ownership },
  };
  liveFacts.set(facts, { client, player, digest: factDigest(facts) });
  return facts;
}
function freshFacts(facts) {
  const live = liveFacts.get(facts), context = facts?.identityContext;
  if (!live || !live.client.connected || !(facts.stock instanceof Map)) return false;
  try { if (live.digest !== factDigest(facts) || !same(context, contextOf(live.client, live.player))) return false; }
  catch { return false; }
  return queries.every(([key, , type]) => {
    const fact = facts?.sourceFacts?.[key];
    return fact?.provenance?.source === type && same(fact.value, facts?.inputs?.[key])
      && factsFreshnessPolicy(fact, { accountId: context?.accountId, generation: context?.generation, maxAgeMs, scope }).status === 'FRESH';
  });
}
function authority(facts, config, parameters) {
  const ctx = facts?.identityContext;
  if (!text(ctx?.accountId) || !text(ctx.connectionId) || !Number.isSafeInteger(ctx.generation) || ctx.generation < 0
      || !ctx.playerId || !ctx.worldId || !positive(ctx.playerLevel)
      || !facts.catalog || !same(facts.catalog, readCatalog(config, parameters)) || !freshFacts(facts)) return false;
  const ownership = parseAntiqueOwnership(facts.inputs?.antiques);
  const inventory = parseOperationInventory(facts.inputs?.items, facts.inputs?.resources);
  return ownership !== null && same(ownership, facts.ownership) && inventory.stockReliable && facts.stockReliable === true
    && facts.stock instanceof Map && same([...inventory.stock], [...facts.stock]) && freshFacts(facts);
}
function configEvidence(config, parameters) {
  return Object.fromEntries(tablesFor(parameters).map(name => [name, copy(config?.tables?.[name] ?? null)]));
}
export function antiqueGrowthDependencyVersions({ config, moduleConfig = ANTIQUE_GROWTH_DEFAULT_CONFIG, parameters } = {}) {
  return { moduleConfig: validateAntiqueGrowthConfig(moduleConfig),
    ...Object.fromEntries(Object.entries(configEvidence(config, parameters)).map(([name, value]) => ['config.' + name, value])) };
}
function candidate(facts, parameters, { config, moduleConfig, authoritative, includePlanEvidence = true } = {}) {
  const actionType = parameters.action?.toUpperCase() ?? 'UNKNOWN', target = { antiqueId: parameters.antiqueId ?? null };
  const current = authoritative ? facts.ownership.antiques.find(row => row.id === parameters.antiqueId) : null;
  const base = authoritative ? facts.catalog.base.find(row => row.antiqueId === parameters.antiqueId) : null;
  const next = current && facts.catalog?.stars?.find(row => row.star === current.star + 1);
  const required = parameters.action === 'activate' ? base?.activeFrag : next?.[qualityCosts[base?.color]];
  const costs = base && positive(required) ? [{ id: base.antiqueId + '碎片', num: required }] : [];
  const request = requests[parameters.action], responseName = request?.replace(/Request$/, 'Response');
  const action = { request, response: null, body: { id: parameters.antiqueId, ...(parameters.action === 'star' ? { universal: false } : {}) } };
  const allowedDerivedSuitIds = parameters.action === 'activate' && base
    ? facts.catalog?.derivedSuitTasks.filter(row => row.color === base.color).map(row => row.suitId) ?? [] : [];
  let blockedReason = null;
  if (!parameters.action || !parameters.antiqueId) blockedReason = 'EXPLICIT_ANTIQUE_AND_ACTION_REQUIRED';
  else if (!moduleConfig.enabled) blockedReason = 'ANTIQUE_GROWTH_MODULE_DISABLED';
  else if (!authoritative) blockedReason = 'ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if (facts.identityContext.playerLevel < facts.catalog.playerLevel) blockedReason = 'ANTIQUE_MODULE_LEVEL_LOCKED';
  else if (!base) blockedReason = 'ANTIQUE_CONFIG_ID_UNKNOWN';
  else if (parameters.action === 'activate' && current) blockedReason = 'ANTIQUE_ALREADY_ACTIVE';
  else if (parameters.action === 'star' && !current) blockedReason = 'EXACT_OWNED_ANTIQUE_REQUIRED';
  else if (parameters.action === 'star' && current.star >= facts.catalog.stars.at(-1).star) blockedReason = 'ANTIQUE_STAR_CAP_REACHED';
  else if (costs.length !== 1) blockedReason = 'ANTIQUE_EXACT_COST_UNKNOWN';
  else if (!facts.available?.includes(request) || facts.available?.includes(responseName)) blockedReason = 'ANTIQUE_PROTOCOL_CONTRACT_UNKNOWN';
  else if ((facts.stock.get(costs[0].id) ?? 0) < required) blockedReason = 'ANTIQUE_OWNED_FRAGMENTS_INSUFFICIENT';
  else {
    try { assertPaymentAllowed({ ...action, costs }); } catch (error) { blockedReason = error.code ?? 'COST_NOT_ALLOWED'; }
  }
  const beforeState = { antique: current ? copy(current) : null, suits: copy(facts.ownership?.suits ?? []), masterLv: facts.ownership?.masterLv ?? null };
  const expectedState = { antique: { id: parameters.antiqueId ?? null, star: parameters.action === 'activate' ? 0 : current ? current.star + 1 : null } };
  const row = {
    module: moduleId, capabilityId: 'PRO-007', actionType, target, parameters: copy(parameters),
    label: (parameters.action === 'activate' ? '激活藏品 ' : '藏品升一星 ') + (base?.name ?? parameters.antiqueId ?? '未选择'),
    costs, beforeState, expectedState, costSource: source, allowedDerivedSuitIds,
    budgetClaims: { resources: costs, quotas: [], uids: parameters.antiqueId ? [{ type: 'antique', id: parameters.antiqueId }] : [] },
    executable: blockedReason === null, blockedReason, decision: blockedReason ? 'BLOCKED' : 'READY',
  };
  const identity = { parameters, beforeState, expectedState, allowedDerivedSuitIds, costs, stock: facts.stock instanceof Map ? [...facts.stock].sort(([a], [b]) => a.localeCompare(b)) : [], identityContext: facts.identityContext, catalog: facts.catalog };
  row.actionId = moduleId + ':' + actionType + ':' + hash(identity);
  if (includePlanEvidence) { row.identity = hash(identity); row.configEvidence = configEvidence(config, parameters); }
  if (!blockedReason) row.action = action;
  return row;
}
export function viewAntiqueGrowth(facts, { config, parameters = facts?.parameters ?? {}, moduleConfig = ANTIQUE_GROWTH_DEFAULT_CONFIG } = {}) {
  parameters = validateAntiqueGrowthParameters(parameters);
  moduleConfig = validateAntiqueGrowthConfig(moduleConfig);
  const authoritative = authority(facts, config, parameters), catalog = authoritative ? facts.catalog : null;
  const antiques = (catalog?.base ?? []).map(base => {
    const owned = facts.ownership.antiques.find(row => row.id === base.antiqueId), fragmentId = base.antiqueId + '碎片';
    return { antiqueId: base.antiqueId, name: base.name, color: base.color, owned: Boolean(owned), star: owned?.star ?? null, fragmentId, fragments: facts.stock.get(fragmentId) ?? 0 };
  });
  const choices = parameters.antiqueId ? [parameters] : kinds.includes(parameters.action) ? antiques
    .filter(row => parameters.action === 'activate' ? !row.owned : row.owned)
    .map(row => ({ ...parameters, antiqueId: row.antiqueId })) : [];
  const candidates = choices.map(choice => candidate(facts, choice, { config, moduleConfig, authoritative, includePlanEvidence: false }));
  return { module: moduleId, antiques, candidates, blocked: candidates.filter(row => !row.executable),
    notes: [...(facts?.notes ?? []), ...(!authoritative ? ['ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN'] : [])], evidence: ANTIQUE_GROWTH_EVIDENCE };
}
export function planAntiqueGrowth(facts, { config, parameters = facts?.parameters ?? {}, moduleConfig = ANTIQUE_GROWTH_DEFAULT_CONFIG, selections, ledger = new ResourceLedger(facts?.stock) } = {}) {
  parameters = validateAntiqueGrowthParameters(parameters);
  moduleConfig = validateAntiqueGrowthConfig(moduleConfig);
  const row = candidate(facts, parameters, { config, moduleConfig, authoritative: authority(facts, config, parameters) });
  const notes = [];
  if (row.blockedReason) notes.push(row.blockedReason);
  const selected = !selections || selections.includes(row.actionId);
  const actions = [];
  if (row.executable && selected) {
    if (ledger.canReserve(row.costs)) { ledger.reserve(row.costs); actions.push(row); }
    else notes.push('ANTIQUE_RESOURCE_BUDGET_INSUFFICIENT');
  }
  return { module: moduleId, actions, notes };
}
function exactDebits(before, after, costs) {
  const debits = new Map(costs.map(row => [row.id, row.num]));
  return [...new Set([...before.keys(), ...after.keys(), ...debits.keys()])]
    .every(id => (after.get(id) ?? 0) === (before.get(id) ?? 0) - (debits.get(id) ?? 0));
}
function suitsConfirmed(before, after, allowed) {
  if (before.length !== after.length) return false;
  return before.every((row, index) => {
    const current = after[index];
    if (!current || current.id !== row.id || current.level !== row.level) return false;
    return allowed.includes(row.id) || same(row, current);
  });
}
export function verifyAntiqueGrowth(operation, before, after, response) {
  const fail = reason => ({ confirmed: false, reason });
  if (response !== undefined && response !== null) return fail('ANTIQUE_UNEXPECTED_RESPONSE');
  let parameters;
  try { parameters = validateAntiqueGrowthParameters(operation?.parameters ?? {}); }
  catch { return fail('ANTIQUE_OPERATION_PARAMETERS_INVALID'); }
  const config = { tables: operation?.configEvidence ?? {} }, moduleConfig = { enabled: true };
  if (!authority(before, config, parameters) || !authority(after, config, parameters)
      || !same(before.identityContext, after.identityContext)
      || queries.some(([key]) => after.sourceFacts[key].provenance.sourceAt < before.sourceFacts[key].provenance.sourceAt)) return fail('ANTIQUE_FRESH_AUTHORITY_NOT_CONFIRMED');
  const contract = candidate(before, parameters, { config, moduleConfig, authoritative: true });
  if (!contract.executable || ['module', 'capabilityId', 'actionId', 'actionType', 'target', 'parameters', 'identity', 'beforeState', 'expectedState', 'costSource', 'costs', 'budgetClaims', 'action', 'configEvidence', 'allowedDerivedSuitIds']
    .some(key => !same(operation[key], contract[key]))) return fail('ANTIQUE_OPERATION_CONTRACT_MISMATCH');
  const target = contract.expectedState.antique;
  const expected = parameters.action === 'activate' ? [...before.ownership.antiques, target].sort((a, b) => a.id.localeCompare(b.id))
    : before.ownership.antiques.map(row => row.id === parameters.antiqueId ? target : row);
  if (!same(expected, after.ownership.antiques)) return fail('ANTIQUE_EXACT_OWNERSHIP_EFFECT_NOT_CONFIRMED');
  if (before.ownership.masterLv !== after.ownership.masterLv
      || !suitsConfirmed(before.ownership.suits, after.ownership.suits, contract.allowedDerivedSuitIds)) return fail('ANTIQUE_SUIT_OR_MASTER_UNEXPECTED_CHANGE');
  if (!exactDebits(before.stock, after.stock, contract.costs)) return fail('ANTIQUE_EXACT_FRAGMENT_DEBIT_NOT_CONFIRMED');
  if (!freshFacts(before) || !freshFacts(after)) return fail('ANTIQUE_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return { confirmed: true, reason: parameters.action === 'activate'
    ? '完整藏品复读确认明确零星激活与自有专属碎片精确扣除；允许的既有套装派生值仅展示服务器原值'
    : '完整藏品复读确认同一藏品星数恰好 +1 与自有专属碎片精确扣除',
  afterState: { antique: copy(target), suits: copy(after.ownership.suits), masterLv: after.ownership.masterLv },
  responseEvidence: { namedResponse: 'NONE', derivedSuitValues: contract.allowedDerivedSuitIds.length ? 'SERVER_OBSERVED_ONLY' : 'UNCHANGED' } };
}
export const antiqueGrowthModule = Object.freeze({
  id: moduleId, label: '藏品激活与单次升星', capabilities: Object.freeze(['PRO-007']), defaultConfig: ANTIQUE_GROWTH_DEFAULT_CONFIG,
  validateConfig: validateAntiqueGrowthConfig, validateParameters: validateAntiqueGrowthParameters,
  survey: surveyAntiqueGrowth, view: viewAntiqueGrowth, plan: planAntiqueGrowth, verify: verifyAntiqueGrowth,
  dependencyVersions: antiqueGrowthDependencyVersions,
  dependencyKeys: Object.freeze(['moduleConfig', 'config.ModuleOpenCfg', 'config.AntiqueBaseCfg', 'config.AntiqueSuitCfg', 'config.AntiqueStarCfg']),
});
