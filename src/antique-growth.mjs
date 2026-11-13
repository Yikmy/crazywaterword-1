// PRO-007 controlled antique activation, growth, mastery and ordinary fragment exchange.
import { createHash } from 'node:crypto';
import { assertPaymentAllowed } from './actions.mjs';
import { stableBusinessValue, businessRejectionIdentityFromHistory } from './business-functions.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { toSnapshotJson } from './game.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity } from './resource-ledger.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';

const moduleId = 'antique-growth', scope = Object.freeze({ kind: 'ACCOUNT' }), maxAgeMs = 30000;
const qualityCosts = Object.freeze({ BLUE: 'consumeBlue', PURPLE: 'consumePur', ORANGE: 'consumeOra', RED: 'consumeRed' });
const kinds = Object.freeze(['activate', 'star', 'suit', 'master', 'exchange']);
const advancedKinds = Object.freeze(['suit', 'master', 'exchange']);
const colorIndexes = Object.freeze({ BLUE: 1, PURPLE: 2, ORANGE: 3, RED: 4 });
const suitMaterials = Object.freeze({ BLUE: '蓝藏品经验', PURPLE: '紫藏品经验', ORANGE: '橙藏品经验', RED: '红藏品经验' });
const universalMaterials = Object.freeze({ BLUE: '蓝藏万能碎片', PURPLE: '紫藏万能碎片', ORANGE: '橙藏万能碎片', RED: '红藏万能碎片' });
const advancedSource = 'v76 AntiqueSuitPop._toUpRequest; AntiqueMasterPop._onBtnLevelUp; FragExchangePop target fragItemId and 1:1 universal debit; AntiqueUtil.suitLvCfg/masterLvCfg';
const requests = Object.freeze({ activate: 'ActivateAntiqueRequest', star: 'AntiqueStarUpRequest', suit: 'AntiqueSuitLevelUpRequest', master: 'AntiqueMasterLevelUpRequest', exchange: 'AntiqueFragExchangeRequest' });
const source = 'v76 AntiqueItem._onItemClick; AntiqueDetailPop._onBtnStarUp; AntiqueUtil.fragItemId/starUpConsume; AntiqueModel.initData';
export const ANTIQUE_GROWTH_DEFAULT_CONFIG = Object.freeze({ enabled: false });
export const ANTIQUE_GROWTH_EVIDENCE = Object.freeze({
  source, advancedSource, packageSha256: '4fd1f03034b78b0ea0d80590ce1082aa805529b91b2ef99ced9ca2d9f00c2444',
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
  antiqueMasterPop: Object.freeze({ byteOffset: 257076, requestByteOffset: 261306, sha256: '64b192c66b3ad15a7f11cc6704b14cc965553a63fddef55ab5ccd41540ce9dd9' }),
  fragExchangePop: Object.freeze({ byteOffset: 2772381, requestByteOffset: 2778539, sha256: 'cb98aefaca24d75fd3a5c0f9ea34909eedd3f81b3299eb257f627027b8324911' }),
  suitRequestByteOffset: 300009,
  scope: 'EXPLICIT_ACTIVATION_STAR_SUIT_MASTER_ORDINARY_FRAGMENT_EXCHANGE',
  suitGrowthPolicy: 'Absent/zero suit explicitly activates to one; RED requires two owned members, other colors all members. Paid growth is exactly one level under own master/color caps; target counters are server observations only',
  masterGrowthPolicy: 'Next configured mastery level, total owned stars and exact ordinary cost; dedicated explicit masterLv response and independent full reread both required',
  exchangePolicy: 'Activated noncapped antique; exact positive selected quantity; universalItemId debit and same quantity specific-fragment credit; no income budget claims',
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
  const allowed = ['action', 'antiqueId', 'suitId', 'num'];
  if (!plainFields(value, allowed) || own(value, 'action') && !kinds.includes(value.action)
      || own(value, 'antiqueId') && !text(value.antiqueId)
      || own(value, 'suitId') && !positive(value.suitId) || own(value, 'num') && !positive(value.num)
      || own(value, 'suitId') && value.action !== 'suit' || own(value, 'num') && value.action !== 'exchange'
      || own(value, 'antiqueId') && ['suit', 'master'].includes(value.action))
    throw invalid('藏品参数要求 activate/star/exchange 的 antiqueId、suit 的 suitId，兑换 num 为正整数，master 不带目标字段');
  return Object.fromEntries(allowed.filter(key => own(value, key)).map(key => [key, value[key]]));
}
const modeTables = Object.freeze({
  activate: ['ModuleOpenCfg', 'AntiqueBaseCfg', 'AntiqueSuitCfg'],
  star: ['ModuleOpenCfg', 'AntiqueBaseCfg', 'AntiqueStarCfg'],
  suit: ['ModuleOpenCfg', 'AntiqueBaseCfg', 'AntiqueSuitCfg', 'AntiqueSuitLvCfg', 'AntiqueMasterLvCfg'],
  master: ['ModuleOpenCfg', 'AntiqueBaseCfg', 'AntiqueMasterLvCfg'],
  exchange: ['ModuleOpenCfg', 'AntiqueBaseCfg', 'AntiqueStarCfg', 'ItemCfg'],
});
const allTables = Object.freeze(['ModuleOpenCfg', 'AntiqueBaseCfg', 'AntiqueSuitCfg', 'AntiqueStarCfg', 'AntiqueSuitLvCfg', 'AntiqueMasterLvCfg', 'ItemCfg']);
const tablesFor = parameters => modeTables[parameters?.action] ?? allTables;
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
  if (advancedKinds.includes(parameters?.action)) return readAdvancedCatalog(config, parameters, catalog);
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
// Additional branches use their own config projection so existing activation/star identities stay stable.
function readAdvancedCatalog(config, parameters, catalog) {
  const table = name => config?.tables?.[name]?.data;
  const base = table('AntiqueBaseCfg');
  if (parameters.action === 'exchange') {
    const stars = table('AntiqueStarCfg'), items = table('ItemCfg');
    if (!dense(stars) || !stars.length || !stars.every((row, index) => own(row, 'star') && row.star === index + 1)
        || !dense(items) || !base.every(row => own(row, 'universalItemId') && row.universalItemId === universalMaterials[row.color])) return null;
    for (const [color, id] of Object.entries(universalMaterials)) {
      const rows = items.filter(row => own(row, 'id') && row.id === id);
      if (rows.length !== 1 || !own(rows[0], 'type') || rows[0].type !== '藏品万能碎片'
          || !own(rows[0], 'quality') || rows[0].quality !== color) return null;
    }
    return { ...catalog, base: catalog.base.map((row, index) => ({ ...row, universalItemId: base[index].universalItemId })), maxStar: stars.at(-1).star };
  }
  const masters = table('AntiqueMasterLvCfg');
  if (!dense(masters) || !masters.length || !masters.every((row, index) => !missing(row, ['level', 'totalStarNum', 'maxSuitLv', 'costArr', 'attrArr'])
      && row.level === index + 1 && uint(row.totalStarNum) && positive(row.maxSuitLv)
      && (index === 0 ? dense(row.costArr) && row.costArr.length === 0 && row.totalStarNum === 0
        : dense(row.costArr) && row.costArr.length === 2 && row.costArr[0] === '藏品大师经验' && positive(row.costArr[1]))
      && dense(row.attrArr) && row.attrArr.every(pair => dense(pair) && pair.length === 2 && text(pair[0]) && finite(pair[1]) && pair[1] >= 0)
      && (index === 0 || row.totalStarNum >= masters[index - 1].totalStarNum && row.maxSuitLv >= masters[index - 1].maxSuitLv))) return null;
  catalog.masters = masters.map(row => ({ level: row.level, totalStarNum: row.totalStarNum, maxSuitLv: row.maxSuitLv,
    costs: row.costArr.length ? [{ id: row.costArr[0], num: row.costArr[1] }] : [], attributes: copy(row.attrArr) }));
  if (parameters.action === 'master') return catalog;
  const suits = table('AntiqueSuitCfg'), levels = table('AntiqueSuitLvCfg');
  if (!dense(suits) || !suits.length || !suits.every(row => !missing(row, ['suitId', 'color', 'colorIndex'])
      && positive(row.suitId) && own(colorIndexes, row.color) && row.colorIndex === colorIndexes[row.color])
      || !unique(suits, row => row.suitId) || !base.every(row => own(row, 'suitId') && positive(row.suitId)
        && suits.some(suit => suit.suitId === row.suitId && suit.color === row.color))) return null;
  if (!dense(levels) || !levels.length || !levels.every(row => !missing(row, ['color', 'colorIndex', 'maxLevel', 'costArr'])
      && own(colorIndexes, row.color) && row.colorIndex === colorIndexes[row.color] && positive(row.maxLevel)
      && dense(row.costArr) && row.costArr.length === 2 && row.costArr.every(pair => dense(pair) && pair.length === 2 && positive(pair[1]))
      && row.costArr[0][0] === 'GOLD' && row.costArr[1][0] === suitMaterials[row.color])) return null;
  for (const color of new Set(levels.map(row => row.color))) {
    if (levels.filter(row => row.color === color).some((row, index) => row.maxLevel !== index + 2)) return null;
  }
  if (suits.some(row => !levels.some(level => level.color === row.color) || !base.some(member => member.suitId === row.suitId))) return null;
  return { ...catalog, base: catalog.base.map((row, index) => ({ ...row, suitId: base[index].suitId })),
    suits: suits.map(row => ({ suitId: row.suitId, color: row.color, colorIndex: row.colorIndex,
      name: own(row, 'suitName') && text(row.suitName) ? row.suitName : String(row.suitId) })),
    suitLevels: levels.map(row => ({ color: row.color, maxLevel: row.maxLevel, costs: row.costArr.map(([id, num]) => ({ id, num })) })) };
}
function advancedCandidate(facts, parameters, { config, moduleConfig, authoritative, includePlanEvidence = true }) {
  const actionType = parameters.action.toUpperCase(), ownership = authoritative ? facts.ownership : null, catalog = authoritative ? facts.catalog : null;
  const base = catalog?.base.find(row => row.antiqueId === parameters.antiqueId), current = ownership?.antiques.find(row => row.id === parameters.antiqueId);
  const suit = catalog?.suits?.find(row => row.suitId === parameters.suitId), currentSuit = ownership?.suits.find(row => row.id === parameters.suitId);
  const level = currentSuit?.level ?? 0, currentMaster = catalog?.masters?.find(row => row.level === ownership?.masterLv);
  const nextMaster = catalog?.masters?.find(row => row.level === ownership?.masterLv + 1);
  const nextSuit = catalog?.suitLevels?.find(row => row.color === suit?.color && row.maxLevel >= level + 1);
  const members = suit ? catalog.base.filter(row => row.suitId === suit.suitId) : [];
  const ownedMembers = members.filter(row => ownership?.antiques.some(antique => antique.id === row.antiqueId));
  const totalStars = ownership?.antiques.reduce((sum, row) => sum + row.star, 0);
  let costs = [], expectedState, target, action, uid;
  if (parameters.action === 'suit') {
    costs = level > 0 ? copy(nextSuit?.costs ?? []) : [];
    target = { suitId: parameters.suitId ?? null }; uid = parameters.suitId ? { type: 'antique-suit', id: String(parameters.suitId) } : null;
    expectedState = { suit: { id: parameters.suitId ?? null, level: level + 1 } };
    action = { request: requests.suit, response: null, body: { id: parameters.suitId } };
  } else if (parameters.action === 'master') {
    costs = copy(nextMaster?.costs ?? []); target = { kind: 'ANTIQUE_MASTERY' }; uid = { type: 'antique-master', id: 'GLOBAL' };
    expectedState = { masterLv: ownership ? ownership.masterLv + 1 : null };
    action = { request: requests.master, response: 'AntiqueMasterLevelUpResponse', body: {} };
  } else {
    costs = base && positive(parameters.num) ? [{ id: base.universalItemId, num: parameters.num }] : [];
    target = { antiqueId: parameters.antiqueId ?? null }; uid = parameters.antiqueId ? { type: 'antique', id: parameters.antiqueId } : null;
    const sourceBefore = facts.stock?.get(base?.universalItemId) ?? 0, targetBefore = facts.stock?.get(parameters.antiqueId + '碎片') ?? 0;
    expectedState = { antique: current ? copy(current) : null, exchange: {
      source: { id: base?.universalItemId ?? null, before: sourceBefore, after: sourceBefore - (parameters.num ?? 0) },
      target: { id: parameters.antiqueId ? parameters.antiqueId + '碎片' : null, before: targetBefore, after: targetBefore + (parameters.num ?? 0) },
    } };
    action = { request: requests.exchange, response: null, body: { antiqueId: parameters.antiqueId, fragItemId: parameters.antiqueId ? parameters.antiqueId + '碎片' : null, num: parameters.num } };
  }
  let blockedReason = null;
  if (parameters.action === 'suit' && !parameters.suitId) blockedReason = 'EXPLICIT_SUIT_REQUIRED';
  else if (parameters.action === 'exchange' && (!parameters.antiqueId || !parameters.num)) blockedReason = 'EXPLICIT_ANTIQUE_AND_EXCHANGE_QUANTITY_REQUIRED';
  else if (!moduleConfig.enabled) blockedReason = 'ANTIQUE_GROWTH_MODULE_DISABLED';
  else if (!authoritative) blockedReason = 'ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN';
  else if (facts.identityContext.playerLevel < catalog.playerLevel) blockedReason = 'ANTIQUE_MODULE_LEVEL_LOCKED';
  else if (parameters.action === 'suit') {
    if (!suit) blockedReason = 'ANTIQUE_SUIT_CONFIG_ID_UNKNOWN';
    else if (ownership.masterLv > 0 && !currentMaster) blockedReason = 'ANTIQUE_MASTER_CONFIG_LEVEL_UNKNOWN';
    else if (level === 0 && ownedMembers.length < (suit.colorIndex === 4 ? 2 : members.length)) blockedReason = 'ANTIQUE_SUIT_MEMBERS_NOT_OWNED';
    else if (level > 0 && level >= catalog.suitLevels.filter(row => row.color === suit.color).at(-1).maxLevel) blockedReason = 'ANTIQUE_SUIT_LEVEL_CAP_REACHED';
    else if (level > 0 && level >= (currentMaster?.maxSuitLv ?? 0)) blockedReason = 'ANTIQUE_SUIT_MASTER_LEVEL_LOCKED';
    else if (level > 0 && !nextSuit) blockedReason = 'ANTIQUE_EXACT_COST_UNKNOWN';
  } else if (parameters.action === 'master') {
    if (ownership.masterLv > 0 && !currentMaster) blockedReason = 'ANTIQUE_MASTER_CONFIG_LEVEL_UNKNOWN';
    else if (!nextMaster) blockedReason = 'ANTIQUE_MASTER_CAP_REACHED';
    else if (totalStars < nextMaster.totalStarNum) blockedReason = 'ANTIQUE_MASTER_TOTAL_STARS_INSUFFICIENT';
  } else {
    if (!base) blockedReason = 'ANTIQUE_CONFIG_ID_UNKNOWN';
    else if (!current) blockedReason = 'EXACT_OWNED_ANTIQUE_REQUIRED';
    else if (current.star >= catalog.maxStar) blockedReason = 'ANTIQUE_STAR_CAP_REACHED';
    else if (safeResourceQuantity(expectedState.exchange.target.after) === null) blockedReason = 'ANTIQUE_EXCHANGE_CREDIT_OVERFLOW';
  }
  if (!blockedReason && (!facts.available.includes(action.request) || action.response && !facts.available.includes(action.response)
      || !action.response && facts.available.includes(action.request.replace(/Request$/, 'Response')))) blockedReason = 'ANTIQUE_PROTOCOL_CONTRACT_UNKNOWN';
  if (!blockedReason && costs.some(row => (facts.stock.get(row.id) ?? 0) < row.num)) blockedReason = 'ANTIQUE_MATERIALS_INSUFFICIENT';
  if (!blockedReason) { try { assertPaymentAllowed({ ...action, costs }); } catch (error) { blockedReason = error.code ?? 'COST_NOT_ALLOWED'; } }
  const beforeState = ownership ? copy(ownership) : { antiques: [], suits: [], masterLv: null };
  const row = { module: moduleId, capabilityId: 'PRO-007', actionType, target, parameters: copy(parameters),
    label: ({ suit: '套装升一级 ', master: '藏品精通升一级 ', exchange: '万能碎片兑换 ' }[parameters.action]) + (suit?.name ?? base?.name ?? ''),
    costs, beforeState, expectedState, costSource: advancedSource, allowedDerivedSuitIds: [],
    budgetClaims: { resources: costs, quotas: [], uids: uid ? [uid] : [] },
    executable: blockedReason === null, blockedReason, decision: blockedReason ? 'BLOCKED' : 'READY' };
  const identity = { parameters, beforeState, expectedState, allowedDerivedSuitIds: [], costs,
    stock: facts.stock instanceof Map ? [...facts.stock].sort(([a], [b]) => a.localeCompare(b)) : [], identityContext: facts.identityContext, catalog: facts.catalog };
  row.actionId = moduleId + ':' + actionType + ':' + hash(identity);
  if (includePlanEvidence) { row.identity = hash(identity); row.configEvidence = configEvidence(config, parameters); }
  if (!blockedReason) row.action = action;
  return row;
}
function verifyAdvanced(contract, before, after, response) {
  const fail = reason => ({ confirmed: false, reason }), mode = contract.parameters.action;
  if (!same(before.ownership.antiques, after.ownership.antiques)) return fail('ANTIQUE_EXACT_OWNERSHIP_EFFECT_NOT_CONFIRMED');
  if (mode === 'suit') {
    if (before.ownership.masterLv !== after.ownership.masterLv) return fail('ANTIQUE_SUIT_OR_MASTER_UNEXPECTED_CHANGE');
    const target = after.ownership.suits.find(row => row.id === contract.target.suitId), expected = contract.expectedState.suit;
    if (!target || target.level !== expected.level || !same(
      before.ownership.suits.filter(row => row.id !== expected.id), after.ownership.suits.filter(row => row.id !== expected.id)))
      return fail('ANTIQUE_EXACT_SUIT_EFFECT_NOT_CONFIRMED');
  } else if (mode === 'master') {
    const raw = toSnapshotJson(response);
    if (missing(response, ['masterLv']) || !fields(response, ['masterLv']) || !uint(response.masterLv)
        || missing(raw, ['masterLv']) || !fields(raw, ['masterLv']) || raw.masterLv !== contract.expectedState.masterLv
        || after.ownership.masterLv !== contract.expectedState.masterLv) return fail('ANTIQUE_MASTER_RECEIPT_AND_REREAD_NOT_CONFIRMED');
    if (!same(before.ownership.suits, after.ownership.suits)) return fail('ANTIQUE_SUIT_OR_MASTER_UNEXPECTED_CHANGE');
  } else if (!same(before.ownership, after.ownership)) return fail('ANTIQUE_EXCHANGE_OWNERSHIP_UNEXPECTED_CHANGE');
  const stockExpected = new Map(before.stock);
  for (const { id, num } of contract.costs) stockExpected.set(id, (stockExpected.get(id) ?? 0) - num);
  if (mode === 'exchange') {
    const { target } = contract.expectedState.exchange; stockExpected.set(target.id, target.after);
  }
  if (![...new Set([...stockExpected.keys(), ...after.stock.keys()])].every(id => (stockExpected.get(id) ?? 0) === (after.stock.get(id) ?? 0)))
    return fail('ANTIQUE_EXACT_MATERIAL_EFFECT_NOT_CONFIRMED');
  if (!freshFacts(before) || !freshFacts(after)) return fail('ANTIQUE_AUTHORITY_EXPIRED_DURING_VERIFICATION');
  return { confirmed: true, reason: mode === 'suit' ? '完整复读确认指定套装恰好升一级及精确材料净扣；目标派生数值仅观察服务器原值'
    : mode === 'master' ? '明确精通响应和独立完整复读共同确认精通恰好升一级、星数前置和精确材料净扣'
      : '完整复读确认藏品状态不变，万能碎片精确净扣与专属碎片等量净增',
    afterState: copy(after.ownership), responseEvidence: { namedResponse: mode === 'master' ? 'AntiqueMasterLevelUpResponse' : 'NONE',
      derivedSuitValues: mode === 'suit' ? 'SERVER_OBSERVED_ONLY' : 'UNCHANGED' } };
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
  if (advancedKinds.includes(parameters.action)) return advancedCandidate(facts, parameters, { config, moduleConfig, authoritative, includePlanEvidence });
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
function advancedView(facts, parameters, config, moduleConfig, authoritative) {
  const catalog = authoritative ? facts.catalog : null, ownership = authoritative ? facts.ownership : null;
  const antiques = (catalog?.base ?? []).map(base => {
    const owned = ownership.antiques.find(row => row.id === base.antiqueId), fragmentId = base.antiqueId + '碎片';
    return { antiqueId: base.antiqueId, name: base.name, color: base.color, owned: Boolean(owned), star: owned?.star ?? null,
      fragmentId, fragments: facts.stock.get(fragmentId) ?? 0, ...(base.universalItemId ? { universalItemId: base.universalItemId, universalFragments: facts.stock.get(base.universalItemId) ?? 0 } : {}) };
  });
  const currentMaster = catalog?.masters?.find(row => row.level === ownership?.masterLv);
  const suits = (catalog?.suits ?? []).map(suit => {
    const owned = ownership.suits.find(row => row.id === suit.suitId), members = catalog.base.filter(row => row.suitId === suit.suitId);
    return { suitId: suit.suitId, name: suit.name, color: suit.color, level: owned?.level ?? 0,
      ownedMembers: members.filter(row => ownership.antiques.some(antique => antique.id === row.antiqueId)).length,
      requiredMembers: suit.colorIndex === 4 ? 2 : members.length, maximumLevel: catalog.suitLevels.filter(row => row.color === suit.color).at(-1).maxLevel,
      unlockedLevel: currentMaster?.maxSuitLv ?? 0, effectiveNum: owned?.effectiveNum ?? null, advEffectValue: owned?.advEffectValue ?? null };
  });
  const next = catalog?.masters?.find(row => row.level === ownership?.masterLv + 1);
  const master = catalog?.masters ? { level: ownership.masterLv, totalStars: ownership.antiques.reduce((sum, row) => sum + row.star, 0),
    maxLevel: catalog.masters.at(-1).level, unlockedSuitLevel: currentMaster?.maxSuitLv ?? 0,
    next: next ? { level: next.level, totalStarNum: next.totalStarNum, maxSuitLv: next.maxSuitLv, costs: copy(next.costs), attributes: copy(next.attributes) } : null } : null;
  const choices = parameters.action === 'master' || parameters.suitId || parameters.antiqueId ? [parameters]
    : parameters.action === 'suit' ? suits.map(row => ({ ...parameters, suitId: row.suitId }))
      : antiques.filter(row => row.owned).map(row => ({ ...parameters, antiqueId: row.antiqueId }));
  const candidates = choices.map(choice => candidate(facts, choice, { config, moduleConfig, authoritative, includePlanEvidence: false }));
  return { module: moduleId, antiques, suits, master, candidates, blocked: candidates.filter(row => !row.executable),
    notes: [...(facts?.notes ?? []), ...(!authoritative ? ['ANTIQUE_AUTHORITY_OR_CONTEXT_UNKNOWN'] : [])], evidence: ANTIQUE_GROWTH_EVIDENCE };
}

export function viewAntiqueGrowth(facts, { config, parameters = facts?.parameters ?? {}, moduleConfig = ANTIQUE_GROWTH_DEFAULT_CONFIG } = {}) {
  parameters = validateAntiqueGrowthParameters(parameters);
  moduleConfig = validateAntiqueGrowthConfig(moduleConfig);
  const authoritative = authority(facts, config, parameters), catalog = authoritative ? facts.catalog : null;
  if (advancedKinds.includes(parameters.action)) return advancedView(facts, parameters, config, moduleConfig, authoritative);
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
  if (operation?.parameters?.action !== 'master' && response !== undefined && response !== null) return fail('ANTIQUE_UNEXPECTED_RESPONSE');
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
  if (advancedKinds.includes(parameters.action)) return verifyAdvanced(contract, before, after, response);
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
  id: moduleId, label: '藏品激活、成长与兑换', capabilities: Object.freeze(['PRO-007']), defaultConfig: ANTIQUE_GROWTH_DEFAULT_CONFIG,
  validateConfig: validateAntiqueGrowthConfig, validateParameters: validateAntiqueGrowthParameters,
  survey: surveyAntiqueGrowth, view: viewAntiqueGrowth, plan: planAntiqueGrowth, verify: verifyAntiqueGrowth, rejectionIdentity: businessRejectionIdentityFromHistory,
  dependencyVersions: antiqueGrowthDependencyVersions,
  dependencyKeys: Object.freeze(['moduleConfig', ...allTables.map(name => 'config.' + name)]),
});
