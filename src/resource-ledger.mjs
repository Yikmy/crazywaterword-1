// Shared, conservative resource accounting over the existing item/resource facts.
// Legacy ledgers compose locally; bound children additionally debit one finite parent run.
import { assertExecutionActive, awaitExecution } from './execution.mjs';

export const RESOURCE_NAMES = Object.freeze({ 1: 'EXP', 3: 'GOLD', 4: 'RUBY', 5: 'ARENA_POINT', 6: 'LEAGUE_POINT' });

export function safeResourceQuantity(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) return null;
    value = BigInt(value);
  } else if (value && Number.isInteger(value.low) && Number.isInteger(value.high)
    && value.low >= -2147483648 && value.low <= 2147483647
    && value.high >= -2147483648 && value.high <= 2147483647) {
    const unsigned = value.unsigned;
    value = (BigInt(value.high) << 32n) + BigInt(value.low >>> 0);
    if (unsigned) value = BigInt.asUintN(64, value);
  }
  return typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

// Reuse the same mapping for surveyWorld, order previews and execution preflight.
// Invalid quantities remain unknown; callers separately retain source availability.
export function stockFromResponses(items, resources) {
  const stock = new Map();
  const add = (id, value) => {
    if (typeof id !== 'string' || !id.trim()) return;
    const amount = safeResourceQuantity(value);
    const previous = stock.has(id) ? stock.get(id) : 0;
    const sum = amount === null || previous === null ? null : previous + amount;
    stock.set(id, Number.isSafeInteger(sum) ? sum : null);
  };
  for (const row of items?.items ?? []) add(row.itemId ?? row.id, row.num ?? row.count);
  for (const row of resources?.list ?? []) add(RESOURCE_NAMES[row.res] ?? String(row.res), row.amount);
  return stock;
}

export function resourceCosts(entries) {
  if (!Array.isArray(entries)) throw new Error('资源成本缺失，无法安全执行');
  const sums = new Map();
  for (const entry of entries) {
    const [id, value] = Array.isArray(entry) ? entry : [entry?.id, entry?.num];
    const num = safeResourceQuantity(value);
    if (typeof id !== 'string' || !id.trim() || num === null) throw new Error('资源成本缺失或数量不可靠');
    const total = (sums.get(id) ?? 0) + num;
    if (!Number.isSafeInteger(total)) throw new Error('资源成本超出安全整数范围');
    if (total > 0) sums.set(id, total);
  }
  return [...sums].map(([id, num]) => ({ id, num }));
}

const budgetError = (message, code = 'RUN_BUDGET_INVALID') => Object.assign(new Error(message), { code });
const plainBudgetObject = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const budgetId = value => typeof value === 'string' && value.length > 0 && value.length <= 300 && value === value.trim();
const childBudgets = new WeakMap(), runBudgets = new WeakMap();
const uidKey = value => JSON.stringify([value.type, value.id]);
const amountMap = entries => new Map(entries.map(({ id, num }) => [id, num]));
const remaining = (limit, used, id) => Math.max(0, (limit.get(id) ?? 0) - (used.get(id) ?? 0));
const usage = () => ({ resources: new Map(), quotas: new Map(), uids: new Map() });
const usageSummary = value => ({
  resources: [...value.resources].map(([id, num]) => ({ id, num })),
  quotas: [...value.quotas].map(([id, num]) => ({ id, num })),
  uids: [...value.uids.values()].map(value => ({ ...value })),
});

// These are finite declarations supplied by verified adapters/authorization, not
// evidence that a quota exists, an instance is owned, or a particular write is free.
export function normalizeBudgetClaims(input) {
  if (!plainBudgetObject(input) || Object.keys(input).some(key => !['resources', 'quotas', 'uids'].includes(key))) throw budgetError('预算声明只能包含 resources/quotas/uids');
  const amounts = name => {
    const rows = Object.hasOwn(input, name) ? input[name] : [];
    if (!Array.isArray(rows) || rows.some(row => !plainBudgetObject(row) || Object.keys(row).some(key => !['id', 'num'].includes(key)) || !budgetId(row.id))) throw budgetError('预算物资/配额必须使用精确 id/num');
    try { return resourceCosts(rows); } catch { throw budgetError('预算物资/配额数量未知或不可靠'); }
  };
  const uids = Object.hasOwn(input, 'uids') ? input.uids : [];
  if (!Array.isArray(uids) || uids.some(row => !plainBudgetObject(row) || Object.keys(row).length !== 2 || !budgetId(row.type) || !budgetId(row.id) || Object.keys(row).some(key => !['type', 'id'].includes(key)))) throw budgetError('实例预留必须包含精确 type/id');
  if (new Set(uids.map(uidKey)).size !== uids.length) throw budgetError('同一声明重复使用实例 UID');
  return { resources: amounts('resources'), quotas: amounts('quotas'), uids: uids.map(({ type, id }) => ({ type, id })) };
}
// Claims are trusted planner declarations, never evidence of business eligibility.
export function operationBudgetClaims(operation) {
  const costs=resourceCosts(operation?.costs), claims=normalizeBudgetClaims(operation?.budgetClaims??{resources:costs,quotas:[],uids:[]});
  const ordered=rows=>JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)));
  if(ordered(costs)!==ordered(claims.resources))throw budgetError('操作成本与统一预算声明不一致');
  return claims;
}
function normalizeRunScope(scope) {
  if (!plainBudgetObject(scope) || Object.keys(scope).length !== 4 || Object.keys(scope).some(key => !['accountId', 'runId', 'generation', 'connectionId'].includes(key))
    || !budgetId(scope.accountId) || !budgetId(scope.runId) || !budgetId(scope.connectionId) || !Number.isSafeInteger(scope.generation) || scope.generation < 0) throw budgetError('父预算必须绑定精确账号、run、代次及连接');
  return { accountId: scope.accountId, runId: scope.runId, generation: scope.generation, connectionId: scope.connectionId };
}
const scopeMatches = (a, b) => ['accountId', 'runId', 'generation', 'connectionId'].every(key => a[key] === b[key]);
function localResourceAvailable(ledger, id) {
  if (ledger.source && !ledger.stock.has(id)) ledger.stock.set(id, ledger.source(id));
  const raw = ledger.stock instanceof Map ? (ledger.stock.has(id) ? ledger.stock.get(id) : 0) : null;
  const amount = safeResourceQuantity(raw);
  return amount === null ? null : Math.max(0, amount - (ledger.reserved.get(id) ?? 0));
}

export class ResourceLedger {
  constructor(stock) {
    this.source = typeof stock === 'function' ? stock : null;
    this.stock = stock instanceof Map ? new Map(stock) : this.source ? new Map() : null;
    this.reserved = new Map();
  }
  available(id) {
    const child = childBudgets.get(this);
    return child ? child.available(id) : localResourceAvailable(this, id);
  }
  canReserve(entries) {
    let costs;
    try { costs = resourceCosts(entries); } catch { return false; }
    const child = childBudgets.get(this);
    if (child) return child.canReserve({ resources: costs, quotas: [], uids: [] });
    return costs.every(({ id, num }) => !['RUBY', '钻石'].includes(id)
      && this.available(id) !== null && this.available(id) >= num);
  }
  reserve(entries) {
    const costs = resourceCosts(entries), child = childBudgets.get(this);
    if (child) return child.reserve({ resources: costs, quotas: [], uids: [] });
    if (!this.canReserve(costs)) return false;
    for (const { id, num } of costs) this.reserved.set(id, (this.reserved.get(id) ?? 0) + num);
    return true;
  }
  canReserveClaims(input) {
    let claims;
    try { claims = normalizeBudgetClaims(input); } catch { return false; }
    const child = childBudgets.get(this);
    return child ? child.canReserve(claims) : !claims.quotas.length && !claims.uids.length && this.canReserve(claims.resources);
  }
  reserveClaims(input) {
    const claims = normalizeBudgetClaims(input), child = childBudgets.get(this);
    if (child) return child.reserve(claims);
    if (claims.quotas.length || claims.uids.length) throw budgetError('配额与 UID 必须绑定父运行预算');
    return this.reserve(claims.resources);
  }
  reservationSummary() {
    const child = childBudgets.get(this);
    return child ? child.summary() : { resources: [...this.reserved].map(([id, num]) => ({ id, num })), quotas: [], uids: [] };
  }
  inventory(ids = []) {
    const keys = new Set([...(this.stock instanceof Map ? this.stock.keys() : []), ...ids]);
    return new Map([...keys].map((id) => [id, this.available(id)]));
  }
}

// A context is created once for one explicitly authorized finite run. New child
// batches receive fresh facts, but never add to these frozen cumulative limits.
// There is deliberately no refund/reset/restore API: UNKNOWN/cancellation retain
// all reservations. Restarted orchestration must consult history and authorize a
// new run; a JSON summary cannot recreate this live context.
export function createRunBudgetContext(input) {
  if (!plainBudgetObject(input) || Object.keys(input).length !== 2 || Object.keys(input).some(key => !['scope', 'limits'].includes(key))) throw budgetError('运行预算仅接受 scope/limits；审计摘要不可恢复执行');
  const scope = normalizeRunScope(input.scope), limits = normalizeBudgetClaims(input.limits);
  if (limits.resources.some(({ id }) => ['RUBY', '钻石'].includes(id))) throw budgetError('禁止钻石运行预算', 'D6_FORBIDDEN');
  const resourceLimits = amountMap(limits.resources), quotaLimits = amountMap(limits.quotas), uidLimits = new Set(limits.uids.map(uidKey));
  const used = usage(), batches = new Map();
  let outcome = null, context;
  const assertScope = actual => {
    const fresh = normalizeRunScope(actual);
    if (!scopeMatches(scope, fresh)) throw budgetError('父预算账号、run、会话代次或连接不匹配', 'RUN_BUDGET_SCOPE_MISMATCH');
    if (outcome !== null) throw budgetError('父运行预算已经关闭；不能恢复或续用', 'RUN_BUDGET_CLOSED');
    return { ...scope };
  };
  const validateChild = ({ batchId, scope: actual, limits: requested } = {}) => {
    assertScope(actual);
    if (!budgetId(batchId)) throw budgetError('子预算必须绑定精确 batchId');
    const declaration = normalizeBudgetClaims(requested);
    if (declaration.resources.some(({ id, num }) => ['RUBY', '钻石'].includes(id) || num > (resourceLimits.get(id) ?? 0))
      || declaration.quotas.some(({ id, num }) => num > (quotaLimits.get(id) ?? 0))
      || declaration.uids.some(uid => !uidLimits.has(uidKey(uid)))) throw budgetError('子批授权超出父运行声明');
    return declaration;
  };
  function child(stock, options) {
    if (!plainBudgetObject(options) || Object.keys(options).some(key => !['batchId', 'scope', 'limits'].includes(key))) throw budgetError('子预算仅接受 batchId/scope/limits');
    const declaration = validateChild(options), batchId = options.batchId;
    if (!(stock instanceof Map)) throw budgetError('子预算需要可靠库存 Map，不接受惰性或未知库存');
    if (batches.has(batchId)) throw budgetError('同一 batchId 不能新建或重置预算', 'RUN_BUDGET_BATCH_EXISTS');
    const observedStock = new Map([...stock].map(([id, value]) => [id, safeResourceQuantity(value)])), localLimits = amountMap(declaration.resources), localQuotas = amountMap(declaration.quotas), localUids = new Set(declaration.uids.map(uidKey)), localUsed = usage();
    const available = id => {
      const raw = safeResourceQuantity(observedStock.has(id) ? observedStock.get(id) : 0);
      return raw === null ? null : Math.min(Math.max(0, raw - (localUsed.resources.get(id) ?? 0)), remaining(localLimits, localUsed.resources, id), remaining(resourceLimits, used.resources, id));
    };
    const canReserve = claims => outcome === null
      && claims.resources.every(({ id, num }) => !['RUBY', '钻石'].includes(id) && available(id) !== null && available(id) >= num)
      && claims.quotas.every(({ id, num }) => remaining(localQuotas, localUsed.quotas, id) >= num && remaining(quotaLimits, used.quotas, id) >= num)
      && claims.uids.every(uid => localUids.has(uidKey(uid)) && uidLimits.has(uidKey(uid)) && !used.uids.has(uidKey(uid)));
    const reserve = claims => {
      if (!canReserve(claims)) return false;
      // Every domain at both levels is checked before any synchronous mutation.
      for (const name of ['resources', 'quotas']) for (const { id, num } of claims[name]) {
        localUsed[name].set(id, (localUsed[name].get(id) ?? 0) + num);
        used[name].set(id, (used[name].get(id) ?? 0) + num);
      }
      for (const uid of claims.uids) { localUsed.uids.set(uidKey(uid), { ...uid }); used.uids.set(uidKey(uid), { ...uid }); }
      return true;
    };
    const ledger = new ResourceLedger(stock);
    // Existing executors read .reserved. Expose a copy for bound children so
    // clearing that compatibility view cannot release the private reservation.
    Object.defineProperty(ledger, 'reserved', { get: () => new Map(localUsed.resources), configurable: false });
    const binding = { context, batchId, declaration, available, canReserve, reserve, summary: () => usageSummary(localUsed) };
    childBudgets.set(ledger, binding); batches.set(batchId, binding);
    return ledger;
  }
  const snapshot = () => ({
    version: 1, kind: 'RUN_BUDGET_AUDIT', scope: { ...scope }, state: outcome === null ? 'ACTIVE' : 'CLOSED', outcome, resumable: false,
    limits: structuredClone(limits), reserved: usageSummary(used),
    batches: [...batches.values()].map(batch => ({ batchId: batch.batchId, limits: structuredClone(batch.declaration), reserved: batch.summary() })),
  });
  const close = (status = 'STOPPED') => {
    if (!['SUCCESS', 'UNKNOWN', 'CANCELLED', 'RATE_LIMITED', 'FAILED', 'STOPPED'].includes(status)) throw budgetError('运行结束状态无效');
    if (outcome === null) outcome = status;
    return snapshot();
  };
  context = Object.freeze({ scope: Object.freeze({ ...scope }), assertScope, child, snapshot, close });
  runBudgets.set(context, { validateChild });
  return context;
}

// Keep the existing two preflight queries. Parent budgets add finite quota/UID
// declarations; their business eligibility must still come from adapter survey.
export async function validateResources(client, protocol, entries, {
  timeout = 15000, budget = { ledger: null }, claims, assertActive = () => {}, signal, stop,
} = {}) {
  assertExecutionActive(client, { signal, stop });
  const notExecuted = message => Object.assign(new Error(message), { code: 'NOT_EXECUTED' });
  let costs, declaration, parent, expectedLimits, expectedBatchId, executionLedger;
  try {
    costs = resourceCosts(entries);
    declaration = claims === undefined ? { resources: costs, quotas: [], uids: [] } : normalizeBudgetClaims(claims);
    const ordered = rows => JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)));
    if (ordered(costs) !== ordered(declaration.resources)) throw budgetError('资源成本与统一预留声明不一致');
    if (costs.some(({ id }) => ['RUBY', '钻石'].includes(id))) throw budgetError('禁止钻石消费');
    parent = budget.runBudget;
    const binding = childBudgets.get(budget.ledger);
    if (parent) {
      if (!runBudgets.has(parent)) throw budgetError('必须使用当前活跃父预算，不能使用审计摘要');
      expectedLimits = runBudgets.get(parent).validateChild(budget);
      expectedBatchId = budget.batchId; executionLedger = budget.ledger;
      if (budget.ledger && (!binding || binding.context !== parent || binding.batchId !== expectedBatchId || JSON.stringify(binding.declaration) !== JSON.stringify(expectedLimits))) throw budgetError('执行子预算与当前父范围/批次授权不匹配');
    } else if (binding || declaration.quotas.length || declaration.uids.length) throw budgetError('配额/UID/子预算缺少当前父运行范围');
  } catch (error) { throw notExecuted(error.message); }
  const assertParentBinding = () => {
    if (!parent) return;
    try {
      const currentLimits = runBudgets.get(parent).validateChild(budget);
      if (budget.runBudget !== parent || budget.batchId !== expectedBatchId || budget.ledger !== executionLedger || JSON.stringify(currentLimits) !== JSON.stringify(expectedLimits)) throw budgetError('等待期间父预算、子授权或 ledger 已变化');
      if (executionLedger && childBudgets.get(executionLedger)?.context !== parent) throw budgetError('子预算不属于当前父运行');
    } catch (error) { throw notExecuted(error.message); }
  };
  if (!costs.length && !parent) return;
  if (costs.length || !budget.ledger) {
    const get = async (request, response) => {
      if (!protocol[request] || !protocol[response]) throw notExecuted('执行前无法验证资源余额：缺少库存协议');
      assertActive(); assertExecutionActive(client, { signal, stop });
      let body;
      try { body = await awaitExecution(client.request(request, {}, response, timeout), client, { signal, stop }); }
      catch (error) { if (error.code === 'CANCELLED') throw error; throw notExecuted('执行前资源余额查询失败'); }
      assertActive();
      if (!body || typeof body !== 'object') throw notExecuted('执行前资源余额响应无效');
      return body;
    };
    const items = await get('AllItemRequest', 'AllItemResponse'), resources = await get('AllResourceRequest', 'AllResourceResponse');
    if (!Array.isArray(items.items) || !Array.isArray(resources.list)) throw notExecuted('执行前资源余额数据缺失');
    const stock = stockFromResponses(items, resources);
    if (!new ResourceLedger(stock).canReserve(costs)) throw notExecuted('执行前资源余额不足或不可靠');
    assertParentBinding();
    if (!budget.ledger) {
      try {
        executionLedger = parent ? parent.child(stock, { batchId: expectedBatchId, scope: budget.scope, limits: expectedLimits }) : new ResourceLedger(stock);
        budget.ledger = executionLedger;
      } catch (error) { throw notExecuted(error.message); }
    }
  }
  assertActive(); assertExecutionActive(client, { signal, stop });
  if (parent) {
    // The session may have changed while fresh queries were pending.
    assertParentBinding();
    if (!executionLedger.reserveClaims(declaration)) throw notExecuted('父运行或子批物资/配额/UID预算不足；未部分预留');
  } else if (!budget.ledger.reserve(costs)) throw notExecuted('本轮资源预算不足，拒绝重复使用材料');
  budget.onReserved?.();
}
