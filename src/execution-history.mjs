import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { redact } from './security.mjs';

export const EXECUTION_HISTORY_PATH = path.join(DATA_DIR, 'execution-history.json');
const statuses = new Set(['EXECUTING', 'VERIFY', 'RESOURCE_PREFLIGHT', 'SUCCESS', 'FAILED', 'UNKNOWN', 'CANCELLED', 'RATE_LIMITED', 'REJECTED', 'NOT_EXECUTED']);
const requests = new Set([...statuses, 'NOT_DISPATCHED', 'DISPATCHING']);
const unfinished = new Set(['EXECUTING', 'VERIFY', 'RESOURCE_PREFLIGHT']);
const recoveryStatuses = new Set(['APPLIED', 'NOT_APPLIED', 'STILL_UNKNOWN']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = message => Object.assign(new Error(message), { code: 'HISTORY_UNAVAILABLE', statusCode: 409 });
const originallyUncertain = action => action?.unresolvedWrite === true || action?.result === 'UNKNOWN' || (!(action?.result === 'SUCCESS' && action?.verification?.status === 'CONFIRMED') && ['DISPATCHING', 'EXECUTING', 'VERIFY', 'UNKNOWN'].includes(action?.requestStatus));
export function actionWasUncertain(action) { return originallyUncertain(action); }
export function actionNeedsReconciliation(run, action) {
  const pending = originallyUncertain(action);
  if (!pending) return false;
  const latest = action.reconciliations?.at(-1);
  return !latest || latest.status === 'STILL_UNKNOWN';
}
export function runHasUnresolvedWrites(run) {
  const originallyPending = run.actions.filter(originallyUncertain);
  return originallyPending.some(action => actionNeedsReconciliation(run, action)) || (run.finalStatus === 'UNKNOWN' && originallyPending.length === 0);
}

// Account keys never become filenames. Original outcomes stay immutable during reconciliation.
export function createExecutionHistory({ file = EXECUTION_HISTORY_PATH, secrets = () => [], assertWriter = () => {} } = {}) {
  const live = new Set(), anchor=file+'.anchor';
  let observed=false,anchorObserved=false;
  const anchorValue={version:1,kind:'EXECUTION_HISTORY_EXISTENCE',basename:path.basename(file)};
  function anchored(){
    try { const value=JSON.parse(fs.readFileSync(anchor,'utf8'));if(JSON.stringify(value)!==JSON.stringify(anchorValue))throw Error('invalid anchor');anchorObserved=true;return true; }
    catch(cause){if(cause.code==='ENOENT'&&!anchorObserved)return false;throw fail('执行历史存在锚无法读取或损坏；禁止覆盖');}
  }
  function ensureAnchor(){
    if(anchored())return;
    assertWriter();let fd;
    try{fd=fs.openSync(anchor,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(anchorValue)+'\n','utf8');fs.fsyncSync(fd);anchorObserved=true;}
    catch(cause){if(cause.code==='EEXIST'&&anchored())return;throw fail('执行历史存在锚保存失败；禁止新派发');}
    finally{if(fd!==undefined)fs.closeSync(fd);}
  }
  function read() {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); observed=true; }
    catch (error) { if (error.code === 'ENOENT'&&!observed&&!anchored()) return { version: 1, accounts: Object.create(null) }; throw fail('执行历史无法读取或损坏；已禁止新执行，原证据未修改'); }
    anchored(); // A damaged existing anchor cannot be ignored even when History is readable.
    if (!object(raw) || raw.version !== 1 || !object(raw.accounts)) throw fail('执行历史版本或格式无效；原证据未修改');
    const validEvent = event => object(event) && recoveryStatuses.has(event.status) && typeof event.eventId === 'string' && Number.isFinite(Date.parse(event.timestamp)) && object(event.evidence);
    const validAction = action => object(action) && requests.has(action.requestStatus) && statuses.has(action.result) && (action.reconciliations === undefined || Array.isArray(action.reconciliations) && action.reconciliations.every(validEvent));
    const validRun = (run, id) => object(run) && run.accountId === id && typeof run.runId === 'string' && Array.isArray(run.actions) && statuses.has(run.finalStatus) && run.actions.every(validAction);
    for (const [id, runs] of Object.entries(raw.accounts)) {
      if (!id || !Array.isArray(runs) || !runs.every(run => validRun(run, id))) throw fail('执行历史账号或批次结构无效');
    }
    return raw;
  }
  function recover(run) {
    const copy = structuredClone(run);
    // Actions are confirmed, but the run-level final write was interrupted.
    // Preserve all action proof and original disk bytes; never resume or invent batch SUCCESS.
    if(unfinished.has(copy.finalStatus)&&copy.actions.length>0&&copy.actions.every(action=>action.result==='SUCCESS'&&action.verification?.status==='CONFIRMED'&&!originallyUncertain(action))){
      copy.interruptedFinalStatus=copy.finalStatus;copy.finalStatus='CANCELLED';copy.recovered=true;copy.resumable=false;copy.recoveryDisposition='RECOVERED_STOPPED_AFTER_CONFIRMED_ACTIONS';
      copy.stopReason='所有动作已有权威确认，仅批次终态未落盘；保留原证据，停止且不恢复执行';return copy;
    }
    if (unfinished.has(copy.finalStatus) || copy.actions.some(action => action.unresolvedWrite === true || ['DISPATCHING', 'EXECUTING', 'VERIFY'].includes(action.requestStatus))) {
      copy.finalStatus = 'UNKNOWN'; copy.recovered = true;
      copy.stopReason = '进程退出时存在未完成操作；仅恢复历史，禁止自动重发，等待权威复核';
      for (const action of copy.actions) if (['DISPATCHING', 'EXECUTING', 'VERIFY'].includes(action.requestStatus)) { action.result = 'UNKNOWN'; action.requestStatus = 'UNKNOWN'; }
    }
    return copy;
  }
  function list(accountId) {
    const raw = read();
    return (Object.hasOwn(raw.accounts, accountId) ? raw.accounts[accountId] : []).map(run => live.has(run.runId) ? structuredClone(run) : recover(run));
  }
  function write(raw) {
    assertWriter();
    const temporary = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      ensureAnchor();
      const fd = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(raw, null, 2) + String.fromCharCode(10), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temporary, file); observed=true;
    } catch { throw fail('执行历史原子保存失败；停止批次，不继续发送'); }
    finally { try { fs.unlinkSync(temporary); } catch {} }
  }
  function put(run) {
    assertWriter();
    if (!object(run) || typeof run.accountId !== 'string' || !run.accountId || typeof run.runId !== 'string' || !Array.isArray(run.actions)) throw fail('执行历史记录缺少账号或批次');
    const raw = read();
    const safe = redact(run, secrets());
    safe.authorization = safe.authorizationSummary;
    const entries = Object.hasOwn(raw.accounts, run.accountId) ? raw.accounts[run.accountId] : [];
    const previous = entries.find(entry => entry.runId === run.runId);
    if (previous?.actions.some(action => action.reconciliations?.length)) throw fail('已有复核事件的历史不可覆盖；必须追加证据');
    const next = entries.filter(entry => entry.runId !== run.runId); next.unshift(safe);
    Object.defineProperty(raw.accounts, run.accountId, { value: next, enumerable: true, configurable: true, writable: true });
    write(raw); live.add(run.runId); return structuredClone(safe);
  }
  function appendReconciliation(accountId, runId, actionId, event) {
    assertWriter();
    if (!object(event) || !recoveryStatuses.has(event.status) || !object(event.evidence) || !Number.isFinite(Date.parse(event.timestamp))) throw fail('复核事件格式无效');
    const raw = read(), entries = Object.hasOwn(raw.accounts, accountId) ? raw.accounts[accountId] : [];
    const matches = entries.filter(run => run.runId === runId);
    if (matches.length !== 1) throw fail('复核批次不存在或不唯一');
    const run = matches[0], actions = run.actions.filter(action => action.actionId === actionId);
    if (actions.length !== 1 || !actionNeedsReconciliation(recover(run), actions[0])) throw fail('动作不存在、不唯一或已完成复核');
    const safe = redact({ eventId: randomUUID(), timestamp: event.timestamp, status: event.status, evidence: event.evidence }, secrets());
    (actions[0].reconciliations ??= []).push(safe);
    write(raw); return structuredClone(safe);
  }
  return Object.defineProperty({ list, put, appendReconciliation, unresolved: accountId => list(accountId).some(runHasUnresolvedWrites) },'storagePath',{value:path.resolve(file),enumerable:true});
}