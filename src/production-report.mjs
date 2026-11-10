// Local summaries over confirmed history only. Inventory changes are never treated
// as the game's complete daily production; actions retain their original evidence.
import { resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
const validId = (id) => typeof id === 'string' && id.trim().length > 0;
function dayOf(value, formatter) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = Object.fromEntries(formatter.formatToParts(parsed).filter((p) => ['year', 'month', 'day'].includes(p.type)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function assets(value) {
  if (!Array.isArray(value) || value.some((a) => !validId(a?.id) || safeResourceQuantity(a.num) === null)) return null;
  try { return new Map(resourceCosts(value).map(({ id, num }) => [id, num])); } catch { return null; }
}
function inventory(value) {
  if (!Array.isArray(value) || new Set(value.map((a) => a?.id)).size !== value.length) return null;
  return assets(value);
}
function provenCollection(action) {
  const factory = action.actionType === 'gainFactory';
  const before = assets(factory ? action.beforeState?.factory?.finishedProducts : action.beforeState?.product);
  const after = assets(factory ? action.afterState?.factory?.finishedProducts : action.afterState?.product);
  const stockBefore = inventory(action.beforeInventory), stockAfter = inventory(action.afterInventory);
  if (!before || !after || !stockBefore || !stockAfter || action.beforeInventoryReliable !== true || action.afterInventoryReliable !== true) return null;
  const result = [];
  for (const [id, num] of before) {
    const removed = num - (after.get(id) ?? 0);
    // Explicit zero inventory entries are evidence too; missing entries are unknown.
    const oldStock = action.beforeInventory.find((r) => r.id === id), newStock = action.afterInventory.find((r) => r.id === id);
    if (removed > 0 && Number.isSafeInteger(removed) && oldStock && newStock
      && safeResourceQuantity(newStock.num) - safeResourceQuantity(oldStock.num) === removed) result.push({ id, num: removed });
    else return null;
  }
  return result.length ? result : null;
}
export function summarizeProductionHistory(runs, { date, timeZone = 'Asia/Shanghai' } = {}) {
  if (!Array.isArray(runs)) throw new Error('生产统计需要执行历史数组');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  date ??= dayOf(new Date(), formatter);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || dayOf(date + 'T12:00:00Z', new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })) !== date) throw new Error('统计日期必须为有效的 YYYY-MM-DD');
  const result = { date, timeZone, coverage: 'tool-verified-only', totalGameProduction: null,
    startedOperations: 0, collectedOperations: 0, collected: [], notes: ['仅覆盖本工具已复核的操作；游戏完整当日产量未知。'] };
  const totals = new Map(), seen = new Set();
  for (const run of runs) for (const action of run?.actions ?? []) {
    if (action?.result !== 'SUCCESS' || action.verification?.status !== 'CONFIRMED'
      || !['startProduce', 'gainFactory', 'collectProduct'].includes(action.actionType)) continue;
    if (typeof action.timestamp !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(action.timestamp) || dayOf(action.timestamp, formatter) === null) {
      result.notes.push('部分已确认操作缺少可靠时间戳，未纳入当日统计。'); continue;
    }
    if (dayOf(action.timestamp, formatter) !== date) continue;
    const identity = run.runId && action.actionId ? `${run.runId}:${action.actionId}` : null;
    if (identity && seen.has(identity)) { result.notes.push('重复历史操作已去重。'); continue; }
    if (identity) seen.add(identity);
    if (action.actionType === 'startProduce') { result.startedOperations++; continue; }
    result.collectedOperations++;
    const proven = provenCollection(action);
    if (!proven) { result.notes.push('部分收取操作缺少一致的产出与库存数量证据，仅计操作次数。'); continue; }
    for (const { id, num } of proven) {
      const next = (totals.get(id) ?? 0) + num;
      if (!Number.isSafeInteger(next)) { totals.set(id, null); result.notes.push('收取数量超出安全整数范围，该产品统计保持未知。'); }
      else if (totals.get(id) !== null) totals.set(id, next);
    }
  }
  result.collected = [...totals].filter(([, num]) => num !== null).sort(([a], [b]) => a.localeCompare(b)).map(([id, num]) => ({ id, num }));
  result.notes = [...new Set(result.notes)];
  return result;
}