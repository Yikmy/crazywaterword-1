// Lifecycle guards for the existing executors; no scheduler or request builder.
export function assertExecutionActive(client, { signal, stop } = {}) {
  if (signal?.aborted || stop?.aborted || client?.connected === false) {
    const error = new Error('执行已取消或连接已断开');
    error.code = 'CANCELLED';
    throw error;
  }
}

export function executionOutcome(error) {
  if (error?.code === 'CANCELLED' || error?.name === 'AbortError') return 'CANCELLED';
  if (error?.code === 'RATE_LIMITED' || /限频|频繁|rate.?limit|too many/i.test(error?.message ?? '')) return 'RATE_LIMITED';
  if (error?.prompt || error?.code === 'REJECTED' || /^server prompt:/.test(error?.message ?? '')) return 'REJECTED';
  if (error?.code === 'NOT_EXECUTED') return 'NOT_EXECUTED';
  // A transport failure cannot prove that a sent write was rejected.
  return 'UNKNOWN';
}

export function operationResult(status, detail = {}) {
  return { ...detail, status, ok: status === 'SUCCESS' ? true : status === 'UNKNOWN' ? null : false };
}

export function stopsExecution(entry) {
  return ['UNKNOWN', 'CANCELLED', 'RATE_LIMITED'].includes(entry?.status);
}

// The old CLI also uses a plain stop flag. Clean listeners and timers on exit.
export async function awaitExecution(task, client, options = {}) {
  const observed = Promise.resolve(task);
  let timer;
  let cancel;
  const stopped = new Promise((_, reject) => {
    cancel = () => {
      try { assertExecutionActive(client, options); }
      catch (error) { reject(error); }
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    timer = setInterval(cancel, 20);
    cancel();
  });
  try {
    const result = await Promise.race([observed, stopped]);
    assertExecutionActive(client, options);
    return result;
  } finally {
    clearInterval(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export async function executionDelay(ms, options = {}) {
  assertExecutionActive(null, options);
  let timer;
  const delay = options.sleep
    ? options.sleep(ms)
    : new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  try { await awaitExecution(delay, null, options); }
  finally { clearTimeout(timer); }
}

// Compatibility delegation only; the existing Service owns dispatch, budgets and history.
function paymentFailure(error) {
  return ['D6_FORBIDDEN', 'PAID_NOT_ALLOWED', 'COST_UNKNOWN'].includes(error.code);
}
function failedAuthorizedOutcome(error) {
  return operationResult(paymentFailure(error) ? 'NOT_EXECUTED' : executionOutcome(error), {
    error: error.message, code: error.code, ...(paymentFailure(error) ? { skipped: true, reason: error.message } : {}),
  });
}

export async function delegateAuthorizedBatch(client, options, method) {
  const { operationService: service, session, authorization, onStep } = options;
  const report = outcome => { onStep?.(outcome); return [outcome]; };
  try { assertExecutionActive(client, options); } catch (error) { return report(failedAuthorizedOutcome(error)); }
  if (typeof service?.[method] !== 'function' || !session || session.client !== client || !authorization) return report(operationResult('NOT_EXECUTED', {
    skipped: true, code: 'AUTHORIZATION_REQUIRED', reason: '操作须使用原注册Function的当前批次授权；预览不会派发',
  }));
  try {
    assertExecutionActive(client, options);
    const accountId = session.id;
    const run = service[method](session, authorization);
    await service.settle(accountId);
    const records = service.history(accountId, run.runId).runs;
    if (session.id !== accountId || session.client !== client || records.length !== 1 || records[0].accountId !== accountId || records[0].runId !== run.runId || !Array.isArray(records[0].actions) || records[0].actions.length === 0) return report(operationResult('UNKNOWN', { runId: run.runId, reason: '持久执行结果缺失或不唯一，禁止重放' }));
    const record = records[0];
    const results = record.actions.map(row => ({
      ...operationResult(row.result ?? 'UNKNOWN'), actionId: row.actionId, runId: record.runId,
      requestStatus: row.requestStatus, verification: row.verification, reason: row.reason, label: row.label, target: row.target,
    }));
    if (record.finalStatus !== 'SUCCESS' && results.every(row => row.status === 'SUCCESS')) results.push(operationResult(record.finalStatus ?? 'UNKNOWN', { runId: record.runId, reason: record.stopReason }));
    results.forEach(row => onStep?.(row));
    return results;
  } catch (error) { return report(error.code === 'INVALID_INPUT' ? operationResult('NOT_EXECUTED', { code: error.code, reason: error.message }) : failedAuthorizedOutcome(error)); }
}
