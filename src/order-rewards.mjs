// Pure order-reward evidence only. The existing order executor owns identity,
// dispatch, order replacement/counters, SUCCESS/UNKNOWN and all resource budgets.
// Config rows are not proof of the final preview formula or eligibility for MIN_GOLD.
import { createHash } from 'node:crypto';
import { safeResourceQuantity, resourceCosts } from './resource-ledger.mjs';
import { factsFreshnessPolicy } from './state-facts.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const field = (value, key) => {
  const descriptor = value !== null && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : null;
  return descriptor && own(descriptor, 'value') && descriptor.enumerable ? descriptor.value : undefined;
};
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 300
  && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const int32 = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
function record(value, allowed, required = []) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key)
      && own(Object.getOwnPropertyDescriptor(value, key), 'value') && Object.getOwnPropertyDescriptor(value, key).enumerable)
    && required.every(key => own(value, key));
}
function dense(value) {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= 10000
    && Reflect.ownKeys(value).length === value.length + 1
    && Array.from({ length: value.length }, (_, index) => own(value, index)
      && own(Object.getOwnPropertyDescriptor(value, String(index)), 'value')
      && Object.getOwnPropertyDescriptor(value, String(index)).enumerable).every(Boolean);
}
function quantity(value) {
  if (value !== null && typeof value === 'object' && (!record(value, ['low', 'high', 'unsigned'], ['low', 'high'])
    || own(value, 'unsigned') && typeof field(value, 'unsigned') !== 'boolean')) return null;
  return safeResourceQuantity(value);
}
function gameId(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  return ['number', 'string'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) ? String(value) : null;
}
const preview = () => ({ status: 'BLOCKED_EVIDENCE', reason: 'ORDER_FINAL_REWARD_FORMULA_UNVERIFIED', rewardExp: null, rewardGold: null });
const unknownConfig = reason => ({ status: 'UNKNOWN', reliable: false, reason, configuredBaseReward: null, finalPreview: preview(), minGoldEligible: false });

function configuredAssets(value) {
  if (!dense(value) || !value.length) return null;
  const result = [], seen = new Set();
  for (const pair of value) {
    if (!dense(pair) || pair.length !== 2 || !text(pair[0]) || seen.has(pair[0])) return null;
    const num = quantity(pair[1]); if (num === null) return null;
    seen.add(pair[0]); result.push({ id: pair[0], num });
  }
  return result;
}
function requirements(value) {
  if (!dense(value) || !value.length) return null;
  const result = [];
  for (const row of value) {
    if (!record(row, ['id', 'num', 'type'], ['id', 'num']) || !text(field(row, 'id'))
      || own(row, 'type') && ![0, 1].includes(field(row, 'type'))) return null;
    const num = quantity(field(row, 'num')); if (num === null || num === 0) return null;
    result.push({ id: field(row, 'id'), num });
  }
  try { return resourceCosts(result); } catch { return null; }
}

/** Static source rows only. No quantity multiplier, special-order formula, bonus
 * or final reward is inferred; the known EXP implementation remains untouched.
 * Normal requirements may repeat an item: reuse the original resource aggregator.
 */
export function configuredBaseOrderReward(config, rawOrder) {
  if (!record(rawOrder, ['index', 'workerId', 'textId', 'isSpecial', 'refreshTime', 'requirements'], ['isSpecial', 'requirements'])
    || typeof field(rawOrder, 'isSpecial') !== 'boolean') return unknownConfig('ORDER_INPUT_INVALID');
  const required = requirements(field(rawOrder, 'requirements'));
  if (!required) return unknownConfig('ORDER_REQUIREMENTS_INVALID');
  const special = field(rawOrder, 'isSpecial'), tableName = special ? 'WorkerSpecOrderCfg' : 'WorkerOrderCfg';
  const table = field(field(config, 'tables'), tableName), data = field(table, 'data');
  if (!dense(data) || !data.length) return unknownConfig('CONFIG_TABLE_UNAVAILABLE');
  const keyName = special ? 'times' : 'itemId', catalog = new Map();
  for (let index = 0; index < data.length; index++) {
    const row = data[index], allowed = special ? ['times', 'desc', 'reward'] : ['itemId', 'reward'];
    if (!record(row, allowed, [keyName, 'reward'])) return unknownConfig('CONFIG_ROW_INVALID');
    const key = special ? gameId(field(row, keyName)) : field(row, keyName), reward = configuredAssets(field(row, 'reward'));
    if (!text(key) || !reward || catalog.has(key)) return unknownConfig('CONFIG_ROW_INVALID_OR_DUPLICATE');
    catalog.set(key, { key, rowIndex: index, reward });
  }
  const requestedKeys = special ? [gameId(field(rawOrder, 'textId'))] : required.map(row => row.id);
  if (requestedKeys.some(key => !key || !catalog.has(key))) return unknownConfig('CONFIG_ROW_MISSING');
  const rows = requestedKeys.map(key => {
    const row = catalog.get(key);
    return { source: { table: tableName, keyName, key: row.key, rowIndex: row.rowIndex },
      ...(special ? {} : { itemId: key, requiredQuantity: required.find(entry => entry.id === key).num }),
      configuredReward: row.reward.map(asset => ({ ...asset })) };
  });
  return { status: 'CONFIGURED_BASE_ONLY', reliable: true,
    configuredBaseReward: { basis: special ? 'SPECIAL_CONFIG_ROW' : 'PER_CONFIGURED_ITEM_UNIT', rows },
    finalPreview: preview(), minGoldEligible: false };
}

const unknownReceived = reason => ({ status: 'UNKNOWN', reliable: false, reason, source: 'FinishWorkerOrderResponse.reward.asset', assets: null, receivedGold: null, goldEvidence: false });
/** Parse the exact typed response, never a guessed reward/quantity or an inventory
 * difference. ITEM named GOLD and RESOURCE named GOLD remain different assets.
 */
export function parseReceivedOrderReward(response) {
  if (!record(response, ['reward'], ['reward']) || !record(field(response, 'reward'), ['asset'], ['asset'])) return unknownReceived('REWARD_PACKAGE_MISSING_OR_INVALID');
  const raw = field(field(response, 'reward'), 'asset');
  if (!dense(raw) || !raw.length) return unknownReceived('REWARD_ASSETS_MISSING_OR_EMPTY');
  const assets = [], seen = new Set();
  for (const entry of raw) {
    if (!record(entry, ['type', 'id', 'num'], ['type', 'id', 'num']) || ![0, 1].includes(field(entry, 'type')) || !text(field(entry, 'id'))) return unknownReceived('REWARD_ASSET_INVALID');
    const type = field(entry, 'type'), id = field(entry, 'id'), num = quantity(field(entry, 'num')), key = JSON.stringify([type, id]);
    if (num === null || seen.has(key)) return unknownReceived('REWARD_QUANTITY_INVALID_OR_DUPLICATE');
    seen.add(key); assets.push({ type, id, num });
  }
  const gold = assets.find(asset => asset.type === 1 && asset.id === 'GOLD');
  return { status: 'PARSED', reliable: true, source: 'FinishWorkerOrderResponse.reward.asset', assets,
    receivedGold: gold?.num ?? null, goldEvidence: Boolean(gold) };
}

const contextKeys = ['accountId', 'playerId', 'worldId', 'generation', 'connectionId'];
const bindingKeys = [...contextKeys, 'runId', 'batchId', 'actionId', 'identity', 'orderIndex'];
function context(value) {
  if (!record(value, contextKeys, contextKeys) || !text(field(value, 'accountId')) || !text(field(value, 'connectionId'))
    || field(value, 'accountId').length > 256 || field(value, 'connectionId').length > 256
    || !Number.isSafeInteger(field(value, 'generation')) || field(value, 'generation') < 0) return null;
  const playerId = gameId(field(value, 'playerId')), worldId = gameId(field(value, 'worldId'));
  return playerId && worldId ? { accountId: field(value, 'accountId'), playerId, worldId, generation: field(value, 'generation'), connectionId: field(value, 'connectionId') } : null;
}
function binding(value) {
  if (!record(value, bindingKeys, bindingKeys) || !['runId', 'batchId', 'actionId', 'identity'].every(key => text(field(value, key))) || !int32(field(value, 'orderIndex'))) return null;
  const current = context(Object.fromEntries(contextKeys.map(key => [key, field(value, key)])));
  return current ? { ...current, ...Object.fromEntries(['runId', 'batchId', 'actionId', 'identity', 'orderIndex'].map(key => [key, field(value, key)])) } : null;
}
const same = (left, right) => stableBusinessValue(left) === stableBusinessValue(right);
/** Service-owned correlation over the existing opaque order identity. It never
 * computes, changes or validates the order executor's snapshot/hash algorithm.
 */
export function orderRewardEvidenceScope(value) {
  const normalized = binding(value);
  return normalized ? { kind: 'ENTITY', key: 'orders:reward:' + createHash('sha256').update(stableBusinessValue(normalized)).digest('hex') } : null;
}
function goldBalance(value) {
  if (!record(value, ['list'], ['list']) || !dense(field(value, 'list'))) return null;
  const seen = new Set(); let gold = null;
  for (const row of field(value, 'list')) {
    if (!record(row, ['res', 'amount'], ['res', 'amount']) || !int32(field(row, 'res')) || field(row, 'res') === 0 || seen.has(field(row, 'res'))) return null;
    const amount = quantity(field(row, 'amount')); if (amount === null) return null;
    seen.add(field(row, 'res')); if (field(row, 'res') === 3) gold = amount;
  }
  return gold;
}
function goldCost(operation) {
  const costs = field(operation, 'costs');
  if (!dense(costs)) return null;
  const parsed = [];
  for (const cost of costs) {
    if (!record(cost, ['id', 'num'], ['id', 'num']) || !text(field(cost, 'id')) || ['3', '金币'].includes(field(cost, 'id'))) return null;
    const num = quantity(field(cost, 'num')); if (num === null) return null;
    parsed.push({ id: field(cost, 'id'), num });
  }
  try { return resourceCosts(parsed).find(cost => cost.id === 'GOLD')?.num ?? 0; } catch { return null; }
}

/** A diagnostic of this response and the observed GOLD net change, not execution
 * verification. Original executor checks (order replacement/counter), result,
 * UNKNOWN locks, authorization and reservations must be retained by the caller.
 * All envelopes/bindings/facts are created by the locked Service, never HTTP input.
 */
export function inspectOrderRewardEvidence(operation, { binding: original, currentContext, response, beforeResources, afterResources, now = Date.now(), maxAgeMs = 30000 } = {}) {
  const fail = (reason, extra = {}) => ({ status: 'EVIDENCE_ONLY', receivedReward: null,
    verification: { status: 'UNKNOWN', reason, receivedGold: null, goldDebit: null, beforeGold: null, afterGold: null, observedDelta: null, expectedDelta: null, ...extra },
    operationStatusUnchanged: true, finalPreview: preview(), minGoldEligible: false });
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || maxAgeMs > 30000) return fail('EVIDENCE_SOURCE_OR_FRESHNESS_UNKNOWN');
  const origin = binding(original), current = context(currentContext), scope = orderRewardEvidenceScope(original);
  if (!origin || !current || !same(current, Object.fromEntries(contextKeys.map(key => [key, origin[key]])))) return fail('EXECUTION_CONTEXT_MISMATCH');
  if (field(operation, 'module') !== 'orders' || field(operation, 'actionType') !== 'SUBMIT'
    || field(operation, 'actionId') !== origin.actionId || field(operation, 'identity') !== origin.identity
    || field(field(operation, 'target'), 'index') !== origin.orderIndex) return fail('ORIGINAL_OPERATION_MISMATCH');
  for (const [envelope, source] of [[response, 'FinishWorkerOrderResponse'], [beforeResources, 'AllResourceResponse'], [afterResources, 'AllResourceResponse']]) {
    if (!record(envelope, ['binding', 'fact'], ['binding', 'fact']) || !same(binding(field(envelope, 'binding')), origin)) return fail('EVIDENCE_BINDING_MISMATCH');
    const fact = field(envelope, 'fact'), provenance = field(fact, 'provenance');
    if (!record(fact, ['value', 'provenance'], ['value', 'provenance'])
      || !record(provenance, ['accountId', 'generation', 'source', 'sourceAt', 'serverTime', 'scope', 'reliability'], ['accountId', 'generation', 'source', 'sourceAt', 'scope', 'reliability'])
      || !record(field(provenance, 'scope'), ['kind', 'key'], ['kind', 'key'])
      || field(provenance, 'source') !== source
      || factsFreshnessPolicy(fact, { accountId: origin.accountId, generation: origin.generation, scope, now, maxAgeMs }).status !== 'FRESH') return fail('EVIDENCE_SOURCE_OR_FRESHNESS_UNKNOWN');
  }
  const beforeAt = beforeResources.fact.provenance.sourceAt, responseAt = response.fact.provenance.sourceAt, afterAt = afterResources.fact.provenance.sourceAt;
  if (beforeAt > responseAt || responseAt > afterAt) return fail('EVIDENCE_TIME_ORDER_INVALID');
  const receivedReward = parseReceivedOrderReward(response.fact.value);
  if (!receivedReward.reliable || !receivedReward.goldEvidence) return { ...fail(receivedReward.reason ?? 'TYPED_GOLD_REWARD_MISSING'), receivedReward };
  const beforeGold = goldBalance(beforeResources.fact.value), afterGold = goldBalance(afterResources.fact.value), goldDebit = goldCost(operation);
  if (beforeGold === null || afterGold === null || goldDebit === null) return { ...fail('GOLD_BALANCE_OR_COST_UNKNOWN', { receivedGold: receivedReward.receivedGold }), receivedReward };
  if (goldDebit > beforeGold) return { ...fail('GOLD_DEBIT_EXCEEDS_BEFORE_BALANCE', { receivedGold: receivedReward.receivedGold, goldDebit, beforeGold, afterGold }), receivedReward };
  const observedDelta = afterGold - beforeGold, expectedDelta = receivedReward.receivedGold - goldDebit;
  const matched = observedDelta === expectedDelta;
  return { status: 'EVIDENCE_ONLY', receivedReward,
    verification: { status: matched ? 'MATCHED' : 'UNCONFIRMED', reason: matched ? 'TYPED_REWARD_AND_GOLD_NET_CHANGE_MATCH' : 'GOLD_NET_CHANGE_MISMATCH',
      receivedGold: receivedReward.receivedGold, goldDebit, beforeGold, afterGold, observedDelta, expectedDelta },
    operationStatusUnchanged: true, finalPreview: preview(), minGoldEligible: false };
}
