import { assertExecutionActive, awaitExecution, executionOutcome, operationResult } from './execution.mjs';
import { ResourceLedger, resourceCosts, validateResources, operationBudgetClaims } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { isUndispatchedTransportError } from './client.mjs';

export const stableBusinessValue = value => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
// Opt-in domain projection for refusal comparison only. Execution identities,
// authorization, UNKNOWN reconciliation and immutable v1 events stay untouched.
export function businessRejectionIdentity(operation) {
  if (!operation || ['beforeState','expectedState','parameters','costs','costSource','budgetClaims'].some(key => !Object.hasOwn(operation,key) || operation[key] === null || operation[key] === undefined)) return null;
  const state = operation.beforeState, context = state?.context;
  if (!context || ['accountId','playerId','worldId','generation','connectionId'].some(key => !Object.hasOwn(context,key) || context[key] === null || context[key] === undefined)) return null;
  const project = value => {
    const result = structuredClone(value);
    if (result?.context) { delete result.context.generation; delete result.context.connectionId; }
    return result;
  };
  return { beforeState: project(state), expectedState: project(operation.expectedState), parameters: operation.parameters,
    costs: operation.costs, costSource: operation.costSource, budgetClaims: operation.budgetClaims };
}
const equal = (a, b) => stableBusinessValue(a) === stableBusinessValue(b);
const publicState = facts => facts?.state ?? facts?.current ?? null;
export const BUSINESS_EXECUTION_STAGES = Object.freeze(['SURVEY', 'RESOURCE_PREFLIGHT', 'DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'OBSERVATION_ENDED', 'VERIFY', 'VERIFIED']);

// The sole adapter executor: transport, budgets, cancellation and fingerprints stay
// in the existing shared implementations. Adapters only supply facts and semantics.
export async function executeBusinessOperation(client, protocol, operation, { adapter, config, moduleConfig, parameters = {}, player, allowMutate = false, budget = { ledger: null }, signal, stop, assertCurrent = () => {}, onStage = () => {}, onVerifiedReceipt = () => {}, timeout = 15000, window = 400 } = {}) {
  let beforeDispatch, dispatchGuardRejected = false, dispatched = false, requestStatus = 'NOT_EXECUTED', afterState = null, beforeState = operation?.beforeState, response = null;
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
    onStage('SURVEY');
    const facts = await adapter.survey(client, protocol, args); active();
    const currentCandidate = () => {
      const fresh = adapter.plan(facts, { ...args, selections: [operation.actionId], ledger: new ResourceLedger(facts.stockReliable === true ? facts.stock : null) });
      const candidate = fresh.actions?.find(row => row.actionId === operation.actionId);
      if (!candidate || !equal(candidate.target, operation.target) || !equal(candidate.costs, operation.costs) || !equal(candidate.identity, operation.identity) || !equal(candidate.action, operation.action) || !equal(candidate.beforeState, operation.beforeState) || !equal(candidate.expectedState, operation.expectedState)
        || !equal(operationBudgetClaims(candidate), operationBudgetClaims(operation)) || candidate.actionType !== operation.actionType || candidate.costSource !== operation.costSource || typeof candidate.costSource !== 'string' || !candidate.costSource) return null;
      return candidate;
    };
    const candidate = currentCandidate();
    if (!candidate) return finish('NOT_EXECUTED', { error: '目标、状态、参数或成本来源已变化，请重新规划授权' });
    // Reuse the domain planner's current eligibility and fact-age rules after
    // each resource await, before reserving, and after synchronous persistence.
    const assertCandidateCurrent = () => {
      active();
      if (!currentCandidate()) throw Object.assign(new Error('写前业务事实已过期或授权目标已变化，请重新规划授权'), { code: 'NOT_EXECUTED' });
      active();
      // All potentially blocking authority/memory checks precede this last
      // pure domain replan. No I/O callback may renew an expired fact afterward.
      if (!currentCandidate()) throw Object.assign(new Error('最终派发前业务事实已过期，请重新规划授权'), { code: 'NOT_EXECUTED' });
      assertExecutionActive(client, { signal, stop });
    };
    const costs = resourceCosts(candidate.costs);
    assertPaymentAllowed({ ...candidate.action, costs });
    if (!protocol[action.request] || action.response && !protocol[action.response]) return finish('NOT_EXECUTED', { error: '缺少已注册业务协议' });
    onStage('RESOURCE_PREFLIGHT');
    await validateResources(client, protocol, costs, { timeout, budget, claims: operationBudgetClaims(candidate), signal, stop, assertActive: assertCandidateCurrent }); assertCandidateCurrent();
    if (client.pending?.length || client.watchers?.length || client.promptUncertain || client.lateResponses?.size || client.uncertainWrites?.size) return finish('NOT_EXECUTED', {error:'写前连接存在未决请求或不确定响应，停止派发'});
    beforeState = candidate.beforeState;
    // The callback is synchronous: durable evidence failure must prevent transport.
    onStage('DISPATCH_INTENT'); assertCandidateCurrent();
    // Conservatively retain a pending write even if the transport throws while sending.
    beforeDispatch = () => {try {assertCandidateCurrent();} catch(error) {dispatchGuardRejected = true;throw error;}};
    dispatched = true; requestStatus = 'DISPATCHING';
    if (action.response) {
      const pending = Promise.resolve(client.request(action.request, action.body, action.response, timeout, { mutate: true, signal, beforeDispatch }));
      // Observe rejection before persistence: onStage can throw after a write was sent.
      pending.catch(() => {});
      onStage('DISPATCHED');
      response = await awaitExecution(pending, client, { signal, stop });
      requestStatus = 'SUCCESS';
      onStage('RESPONSE');
    } else {
      const pending = Promise.resolve(client.sendWatch(action.request, action.body, { window, signal, beforeDispatch }));
      pending.catch(() => {});
      onStage('DISPATCHED');
      const watch = await awaitExecution(pending, client, { signal, stop });
      requestStatus = watch?.status ?? 'UNKNOWN';
      onStage('OBSERVATION_ENDED');
      if (watch?.status && !['SUCCESS', 'UNKNOWN'].includes(watch.status)) return finish(watch.status, { error: '观察窗口未允许权威复读' });
    }
    active();
    onStage('VERIFY');
    const after = await adapter.survey(client, protocol, args); active();
    const verification = adapter.verify(candidate, facts, after, response);
    const confirmed = verification === true || verification?.confirmed === true || verification?.status === 'CONFIRMED';
    afterState = verification?.afterState ?? publicState(after) ?? adapter.view(after, args);
    if (!confirmed) return finish('UNKNOWN', { error: verification?.reason ?? '权威复读未确认预期变化', verification: { status: 'UNCONFIRMED', reason: verification?.reason ?? '权威复读未确认' } });
    active(); onVerifiedReceipt(candidate, facts, after, response); active(); onStage('VERIFIED'); active(); client.confirmWatchedWrite?.(action.request, action.body);
    return finish('SUCCESS', { verification: { status: 'CONFIRMED', reason: verification?.reason ?? '权威复读确认业务状态变化' }, responseEvidence: verification?.responseEvidence ?? null, beforeInventory: facts.stock instanceof Map ? [...facts.stock].map(([id, num]) => ({ id, num })) : [], afterInventory: after.stock instanceof Map ? [...after.stock].map(([id, num]) => ({ id, num })) : [], beforeInventoryReliable: facts.stockReliable === true, afterInventoryReliable: after.stockReliable === true });
  } catch (error) {
    // A locally failed final transport guard ran before onDispatch/socket.send.
    // This is proof of no dispatch, not a server outcome or retry permission.
    if(dispatchGuardRejected || isUndispatchedTransportError(error,beforeDispatch))dispatched=false;
    const status = executionOutcome(error); requestStatus = dispatched ? status : 'NOT_EXECUTED';
    return finish(!dispatched && status === 'UNKNOWN' ? 'NOT_EXECUTED' : status, { error: error.message });
  }
}
