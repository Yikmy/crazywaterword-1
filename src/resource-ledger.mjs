// Shared, conservative resource accounting over the existing item/resource facts.
// A ledger is local to a plan/run; callers may pass the same instance to compose plans.
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

export class ResourceLedger {
  constructor(stock) {
    this.source = typeof stock === 'function' ? stock : null;
    this.stock = stock instanceof Map ? new Map(stock) : this.source ? new Map() : null;
    this.reserved = new Map();
  }
  available(id) {
    if (this.source && !this.stock.has(id)) this.stock.set(id, this.source(id));
    const raw = this.stock instanceof Map ? (this.stock.has(id) ? this.stock.get(id) : 0) : null;
    const amount = safeResourceQuantity(raw);
    return amount === null ? null : Math.max(0, amount - (this.reserved.get(id) ?? 0));
  }
  canReserve(entries) {
    let costs;
    try { costs = resourceCosts(entries); } catch { return false; }
    return costs.every(({ id, num }) => !['RUBY', '钻石'].includes(id)
      && this.available(id) !== null && this.available(id) >= num);
  }
  reserve(entries) {
    const costs = resourceCosts(entries);
    if (!this.canReserve(costs)) return false;
    for (const { id, num } of costs) this.reserved.set(id, (this.reserved.get(id) ?? 0) + num);
    return true;
  }
  inventory(ids = []) {
    const keys = new Set([...(this.stock instanceof Map ? this.stock.keys() : []), ...ids]);
    return new Map([...keys].map((id) => [id, this.available(id)]));
  }
}

// No replacement Snapshot collector: these are the existing two queries, used only
// immediately before a cost-bearing write. The run budget also bounds stale replies.
export async function validateResources(client, protocol, entries, {
  timeout = 15000, budget = { ledger: null }, assertActive = () => {}, signal, stop,
} = {}) {
  assertExecutionActive(client, { signal, stop });
  const notExecuted = (message) => Object.assign(new Error(message), { code: 'NOT_EXECUTED' });
  let costs;
  try { costs = resourceCosts(entries); } catch (error) { throw notExecuted(error.message); }
  if (!costs.length) return;
  if (costs.some(({ id }) => ['RUBY', '钻石'].includes(id))) throw notExecuted('禁止钻石消费');
  const get = async (request, response) => {
    if (!protocol[request] || !protocol[response]) throw notExecuted('执行前无法验证资源余额：缺少库存协议');
    assertActive();
    assertExecutionActive(client, { signal, stop });
    let body;
    try { body = await awaitExecution(client.request(request, {}, response, timeout), client, { signal, stop }); }
    catch (error) { if (error.code === 'CANCELLED') throw error; throw notExecuted('执行前资源余额查询失败'); }
    assertActive();
    if (!body || typeof body !== 'object') throw notExecuted('执行前资源余额响应无效');
    return body;
  };
  // Both facts seed the run-wide budget so later plans may spend a different resource.
  const items = await get('AllItemRequest', 'AllItemResponse');
  const resources = await get('AllResourceRequest', 'AllResourceResponse');
  if (!Array.isArray(items.items) || !Array.isArray(resources.list)) {
    throw notExecuted('执行前资源余额数据缺失');
  }
  const stock = stockFromResponses(items, resources);
  const current = new ResourceLedger(stock);
  if (!current.canReserve(costs)) throw notExecuted('执行前资源余额不足或不可靠');
  // Initialize from the first fresh facts; later reads can never replenish a spent budget.
  if (!budget.ledger) budget.ledger = new ResourceLedger(stock);
  if (!budget.ledger.reserve(costs)) throw notExecuted('本轮资源预算不足，拒绝重复使用材料');
}
