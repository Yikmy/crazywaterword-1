// Local summaries over confirmed history only. Inventory changes are never treated
// as the game's complete daily production; actions retain their original evidence.
import { resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { actionWasUncertain } from './execution-history.mjs';
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
const productionTypes = new Set(['startProduce', 'gainFactory', 'collectProduct']);
// Compare only the original report evidence. Reconciliation is kept separate and
// never promotes an original UNKNOWN into a counted production event.
function recordKey(action) {
  const fields = ['actionType', 'module', 'target', 'identity', 'timestamp', 'result', 'requestStatus', 'unresolvedWrite',
    'verification', 'beforeState', 'afterState', 'beforeInventory', 'afterInventory', 'beforeInventoryReliable', 'afterInventoryReliable'];
  return JSON.stringify(Object.fromEntries(fields.map(key => [key, action[key]])), (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}
export function validateProductionReportDate(date) {
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw Object.assign(new Error('统计日期必须为有效的 YYYY-MM-DD'), { code: 'INVALID_INPUT', statusCode: 400 });
  return date;
}
function analyzeProductionHistory(runs, { date, timeZone = 'Asia/Shanghai' } = {}) {
  if (!Array.isArray(runs)) throw new Error('生产统计需要执行历史数组');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  date ??= dayOf(new Date(), formatter);
  validateProductionReportDate(date);
  const details = { date, timeZone, source: 'EXECUTION_HISTORY', dateBasis: 'LOCAL_CALENDAR', gameDayKnown: false,
    fullDayCoverage: false, totalGameProduction: null, quantifiedCollections: 0, unquantifiedCollections: 0,
    unresolvedOperations: 0, otherOperations: 0, undatedOperations: 0, unidentifiedOperations: 0,
    duplicateRecords: 0, conflictingRecords: 0, unsafeResourceTotals: [] };
  const result = { date, timeZone, coverage: 'tool-verified-only', totalGameProduction: null,
    startedOperations: 0, collectedOperations: 0, collected: [], coverageDetails: details,
    notes: ['仅覆盖本工具已复核的操作；游戏完整当日产量未知。', '日期按所选本地日历分组，不代表权威游戏日界；无完整全天事件覆盖。'] };
  const totals = new Map(), groups = new Map(), unidentified = [];
  const actionDay = action => typeof action.timestamp === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(action.timestamp) ? dayOf(action.timestamp, formatter) : null;
  for (const run of runs) for (const action of Array.isArray(run?.actions) ? run.actions : []) {
    if (!action || typeof action !== 'object') continue;
    if (!validId(run.runId) || !validId(action.actionId)) {
      if (productionTypes.has(action.actionType)) unidentified.push(action);
      continue;
    }
    const identity = JSON.stringify([run.accountId ?? null, run.runId, action.actionId]);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(action);
  }
  for (const action of unidentified) if (actionDay(action) === date || actionDay(action) === null) details.unidentifiedOperations++;
  for (const group of groups.values()) {
    if (!group.some(action => productionTypes.has(action.actionType))) continue;
    // Resolve duplicate identities before date filtering: an inconsistent date or
    // outcome must not select whichever version happens to be read first.
    const versions = new Set(group.map(recordKey));
    if (versions.size > 1) {
      if (group.some(action => actionDay(action) === date || actionDay(action) === null)) details.conflictingRecords++;
      continue;
    }
    const action = group[0], day = actionDay(action);
    if (day !== date && day !== null) continue;
    details.duplicateRecords += group.length - 1;
    if (day === null) { details.undatedOperations++; continue; }
    if (actionWasUncertain(action)) { details.unresolvedOperations++; continue; }
    if (action.result !== 'SUCCESS' || action.verification?.status !== 'CONFIRMED') { details.otherOperations++; continue; }
    if (action.actionType === 'startProduce') { result.startedOperations++; continue; }
    result.collectedOperations++;
    const proven = provenCollection(action);
    if (!proven) { details.unquantifiedCollections++; continue; }
    details.quantifiedCollections++;
    for (const { id, num } of proven) {
      if (totals.get(id) === null) continue;
      const next = (totals.get(id) ?? 0) + num;
      if (!Number.isSafeInteger(next)) totals.set(id, null);
      else totals.set(id, next);
    }
  }
  result.collected = [...totals].filter(([, num]) => num !== null).sort(([a], [b]) => a.localeCompare(b)).map(([id, num]) => ({ id, num }));
  details.unsafeResourceTotals = [...totals].filter(([, num]) => num === null).map(([id]) => id).sort();
  if (details.undatedOperations) result.notes.push('部分生产操作缺少可靠时间戳，未纳入当日统计。');
  if (details.unidentifiedOperations) result.notes.push('部分生产操作缺少精确批次或动作身份，未纳入统计。');
  if (details.conflictingRecords) result.notes.push('同一生产动作存在冲突历史，所有版本均未计入。');
  if (details.duplicateRecords) result.notes.push('重复历史操作已去重。');
  if (details.unquantifiedCollections) result.notes.push('部分收取操作缺少一致的产出与库存数量证据，仅计操作次数。');
  if (details.unresolvedOperations) result.notes.push('未决生产操作不计产量；保持原 UNKNOWN，不恢复或重发。');
  if (details.unsafeResourceTotals.length) result.notes.push('收取数量超出安全整数范围，该产品统计保持未知。');
  return result;
}
export function summarizeProductionHistory(runs, options) { return analyzeProductionHistory(runs, options); }
export function productionCoverageReport(runs, options) { return analyzeProductionHistory(runs, options).coverageDetails; }
