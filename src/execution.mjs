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
