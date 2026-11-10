import { assertExecutionActive, awaitExecution, executionOutcome, operationResult } from './execution.mjs';
import { ResourceLedger, resourceCosts, validateResources } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';

export const stableBusinessValue = value => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
const equal = (a, b) => stableBusinessValue(a) === stableBusinessValue(b);
const publicState = facts => facts?.state ?? facts?.current ?? null;

// The sole adapter executor: transport, budgets, cancellation and fingerprints stay
// in the existing shared implementations. Adapters only supply facts and semantics.
export async function executeBusinessOperation(client, protocol, operation, { adapter, config, moduleConfig, parameters = {}, player, allowMutate = false, budget = { ledger: null }, signal, stop, assertCurrent = () => {}, timeout = 15000, window = 400 } = {}) {
  let dispatched = false, requestStatus = 'NOT_EXECUTED', afterState = null, beforeState = operation?.beforeState, response = null;
  const action = operation?.action;
  const active = () => { assertExecutionActive(client, { signal, stop }); assertCurrent(); };
  const finish = (status, extra = {}) => {
    if (dispatched && !['SUCCESS', 'REJECTED', 'RATE_LIMITED', 'UNKNOWN'].includes(status)) status = 'UNKNOWN';
    const unresolvedWrite = dispatched && !['SUCCESS', 'REJECTED'].includes(status);
    if (unresolvedWrite) client.markUnverifiedWrite?.(action.request, action.body);
    return operationResult(status, { beforeState, afterState, requestStatus, dispatched, unresolvedWrite, resourceReservation: [...(budget.ledger?.reserved ?? [])].map(([id, num]) => ({ id, num })),
      verification: { status: status === 'SUCCESS' ? 'CONFIRMED' : dispatched ? 'UNCONFIRMED' : 'NOT_STARTED' }, ...extra });
  };
  try {
    active();
    if (!allowMutate || !adapter || !action) return finish('NOT_EXECUTED', { error: '业务动作需要当前单批授权' });
    const args = { config, player, moduleConfig, parameters: operation.parameters ?? parameters, signal, stop, timeout };
    const facts = await adapter.survey(client, protocol, args); active();
    const fresh = adapter.plan(facts, { ...args, selections: [operation.actionId], ledger: new ResourceLedger(facts.stockReliable === true ? facts.stock : null) });
    const candidate = fresh.actions?.find(row => row.actionId === operation.actionId);
    if (!candidate || !equal(candidate.target, operation.target) || !equal(candidate.costs, operation.costs) || !equal(candidate.identity, operation.identity) || !equal(candidate.action, operation.action) || !equal(candidate.beforeState, operation.beforeState) || !equal(candidate.expectedState, operation.expectedState)
      || candidate.actionType !== operation.actionType || candidate.costSource !== operation.costSource || typeof candidate.costSource !== 'string' || !candidate.costSource) return finish('NOT_EXECUTED', { error: '目标、状态、参数或成本来源已变化，请重新规划授权' });
    const costs = resourceCosts(candidate.costs);
    assertPaymentAllowed({ ...candidate.action, costs });
    if (!protocol[action.request] || action.response && !protocol[action.response]) return finish('NOT_EXECUTED', { error: '缺少已注册业务协议' });
    await validateResources(client, protocol, costs, { timeout, budget, signal, stop, assertActive: active }); active();
    if (client.pending?.length || client.watchers?.length || client.promptUncertain || client.lateResponses?.size || client.uncertainWrites?.size) return finish('NOT_EXECUTED', {error:'写前连接存在未决请求或不确定响应，停止派发'});
    beforeState = candidate.beforeState;
    // Conservatively retain a pending write even if the transport throws while sending.
    dispatched = true; requestStatus = 'DISPATCHING';
    if (action.response) {
      response = await awaitExecution(client.request(action.request, action.body, action.response, timeout, { mutate: true, signal }), client, { signal, stop });
      requestStatus = 'SUCCESS';
    } else {
      const watch = await awaitExecution(client.sendWatch(action.request, action.body, { window, signal }), client, { signal, stop });
      requestStatus = watch?.status ?? 'UNKNOWN';
      if (watch?.status && !['SUCCESS', 'UNKNOWN'].includes(watch.status)) return finish(watch.status, { error: '观察窗口未允许权威复读' });
    }
    active();
    const after = await adapter.survey(client, protocol, args); active();
    const verification = adapter.verify(candidate, facts, after, response);
    const confirmed = verification === true || verification?.confirmed === true || verification?.status === 'CONFIRMED';
    afterState = verification?.afterState ?? publicState(after) ?? adapter.view(after, args);
    if (!confirmed) return finish('UNKNOWN', { error: verification?.reason ?? '权威复读未确认预期变化', verification: { status: 'UNCONFIRMED', reason: verification?.reason ?? '权威复读未确认' } });
    active(); client.confirmWatchedWrite?.(action.request, action.body);
    return finish('SUCCESS', { verification: { status: 'CONFIRMED', reason: verification?.reason ?? '权威复读确认业务状态变化' }, responseEvidence: verification?.responseEvidence ?? null, beforeInventory: facts.stock instanceof Map ? [...facts.stock].map(([id, num]) => ({ id, num })) : [], afterInventory: after.stock instanceof Map ? [...after.stock].map(([id, num]) => ({ id, num })) : [], beforeInventoryReliable: facts.stockReliable === true, afterInventoryReliable: after.stockReliable === true });
  } catch (error) {
    const status = executionOutcome(error); requestStatus = dispatched ? status : 'NOT_EXECUTED';
    return finish(!dispatched && status === 'UNKNOWN' ? 'NOT_EXECUTED' : status, { error: error.message });
  }
}
