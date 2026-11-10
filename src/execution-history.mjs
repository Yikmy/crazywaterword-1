import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { redact } from './security.mjs';

export const EXECUTION_HISTORY_PATH = path.join(DATA_DIR, 'execution-history.json');
const statuses = new Set(['EXECUTING', 'VERIFY', 'RESOURCE_PREFLIGHT', 'SUCCESS', 'FAILED', 'UNKNOWN', 'CANCELLED', 'RATE_LIMITED', 'REJECTED', 'NOT_EXECUTED']);
const requests = new Set([...statuses, 'NOT_DISPATCHED', 'DISPATCHING']);
const unfinished = new Set(['EXECUTING', 'VERIFY', 'RESOURCE_PREFLIGHT']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = message => Object.assign(new Error(message), { code: 'HISTORY_UNAVAILABLE', statusCode: 409 });

// One dictionary, keyed by exact account ID, follows order-rules-store's atomic JSON convention.
// No account identifier is ever interpolated into a filename. Never overwrite corrupt evidence.
export function createExecutionHistory({ file = EXECUTION_HISTORY_PATH, secrets = () => [] } = {}) {
  const live = new Set();
  function read() {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, accounts: Object.create(null) }; throw fail('执行历史无法读取或损坏；已禁止新执行，原证据未修改'); }
    if (!object(raw) || raw.version !== 1 || !object(raw.accounts)) throw fail('执行历史版本或格式无效；原证据未修改');
    for (const [id, runs] of Object.entries(raw.accounts)) {
      if (!id || !Array.isArray(runs) || runs.some(run => !object(run) || run.accountId !== id || typeof run.runId !== 'string' || !Array.isArray(run.actions) || !statuses.has(run.finalStatus) || run.actions.some(action => !object(action) || !requests.has(action.requestStatus) || !statuses.has(action.result)))) throw fail('执行历史账号或批次结构无效');
    }
    return raw;
  }
  function recover(run) {
    const copy = structuredClone(run);
    if (unfinished.has(copy.finalStatus) || copy.actions.some(action => action.unresolvedWrite === true || ['DISPATCHING', 'EXECUTING', 'VERIFY'].includes(action.requestStatus))) {
      copy.finalStatus = 'UNKNOWN'; copy.recovered = true;
      copy.stopReason = '进程退出时存在未完成操作；仅恢复历史，禁止自动重发，等待权威复核';
      for (const action of copy.actions) if (['DISPATCHING', 'EXECUTING', 'VERIFY'].includes(action.requestStatus)) {
        action.result = 'UNKNOWN'; action.requestStatus = 'UNKNOWN';
      }
    }
    return copy;
  }
  function list(accountId) {
    const raw = read();
    return (Object.hasOwn(raw.accounts, accountId) ? raw.accounts[accountId] : []).map(run => live.has(run.runId) ? structuredClone(run) : recover(run));
  }
  function put(run) {
    if (!object(run) || typeof run.accountId !== 'string' || !run.accountId || typeof run.runId !== 'string' || !Array.isArray(run.actions)) throw fail('执行历史记录缺少账号或批次');
    const raw = read();
    const safe = redact(run, secrets());
    // This is a public approval summary only, never a bearer permit or HTTP Authorization value.
    safe.authorization = safe.authorizationSummary;
    const entries = Object.hasOwn(raw.accounts, run.accountId) ? raw.accounts[run.accountId] : [];
    const next = entries.filter(entry => entry.runId !== run.runId);
    next.unshift(safe);
    Object.defineProperty(raw.accounts, run.accountId, { value: next, enumerable: true, configurable: true, writable: true });
    const temporary = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(raw, null, 2) + '\n', 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, file);
    } catch { throw fail('执行历史原子保存失败；停止批次，不继续发送'); }
    finally { try { fs.unlinkSync(temporary); } catch {} }
    live.add(run.runId);
    return structuredClone(safe);
  }
  return { list, put, unresolved: accountId => list(accountId).some(run => run.finalStatus === 'UNKNOWN' || run.actions.some(action => action.unresolvedWrite === true)) };
}
