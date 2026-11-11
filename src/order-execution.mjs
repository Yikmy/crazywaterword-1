// Resident-order adapter over the existing rule, survey, action and execution layers.
// Account authorization, account locking and persisted history belong to the caller.
import { createHash } from 'node:crypto';
import { createStateFact } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { configuredBaseOrderReward, parseReceivedOrderReward, orderRewardEvidenceScope, inspectOrderRewardEvidence } from './order-rewards.mjs';
import { ACTIONS, buildBody } from './actions.mjs';
import { evaluateOrder, validateOrderRules } from './order-rules.mjs';
import { ResourceLedger, resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, executionOutcome, operationResult } from './execution.mjs';
import { runWorld, surveyWorld } from './world.mjs';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const own = (value, key) => value != null && Object.hasOwn(value, key);
const modes = new Set(['Manual', 'Hybrid', 'Automatic']);
const notExecuted = (message) => Object.assign(new Error(message), { code: 'NOT_EXECUTED' });
function indexOf(value) {
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) value = Number(value);
  return Number.isInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
}
function scalar(value) {
  return (typeof value === 'string' && value.trim()) || (Number.isSafeInteger(value) && value >= 0) ? value : null;
}
function costsOf(order) {
  if (!Array.isArray(order?.requirements) || !order.requirements.length
    || order.requirements.some((row) => safeResourceQuantity(row?.num) === null || safeResourceQuantity(row?.num) === 0)) return null;
  try { return resourceCosts(order.requirements).sort((a, b) => a.id.localeCompare(b.id)); } catch { return null; }
}
function snapshot(order) {
  const requirements = costsOf(order), index = indexOf(order?.index), workerId = scalar(order?.workerId);
  if (index === null || workerId === null || !requirements?.length
    || (order.textId != null && scalar(order.textId) === null)
    || (order.isSpecial != null && typeof order.isSpecial !== 'boolean')) return null;
  const refreshTime = order.refreshTime == null ? null : safeResourceQuantity(order.refreshTime);
  if (order.refreshTime != null && refreshTime === null) return null;
  return { index, workerId, textId: scalar(order.textId), isSpecial: order.isSpecial === true,
    refreshTime, requirements, rewardExp: safeResourceQuantity(order.rewardExp) };
}
function inventory(survey, costs = []) {
  return costs.map(({ id }) => ({ id, num: survey?.stockReliable === true && survey.stock instanceof Map
    ? safeResourceQuantity(survey.stock.has(id) ? survey.stock.get(id) : 0) : null }));
}
function rawIdentityMatches(order, raw) {
  const parsed = snapshot(order);
  if (!parsed || !raw || !own(raw, 'index')) return false;
  const original = snapshot({ ...raw, rewardExp: parsed.rewardExp });
  return original !== null && hash(original) === hash(parsed);
}
function trustedOrder(survey, index) {
  if (survey?.orderReliability?.orders !== true || !Array.isArray(survey.orders)) return null;
  const found = survey.orders.filter((order) => indexOf(order?.index) === index);
  const originals = survey.rawOrderMetadata?.orders?.filter((order) => indexOf(order?.index) === index) ?? [];
  return found.length === 1 && originals.length === 1 && rawIdentityMatches(found[0], originals[0]) ? found[0] : null;
}
function proofFor(order, survey, eligibility) {
  if (typeof eligibility !== 'function') return null;
  try {
    const proof = eligibility(order, survey);
    if (!proof || typeof proof.then === 'function' || proof.allowed !== true || proof.free !== true
      || typeof proof.source !== 'string' || !proof.source.trim()
      || safeResourceQuantity(proof.remaining) === null || safeResourceQuantity(proof.remaining) < 1) return null;
    return { allowed: true, free: true, source: proof.source, remaining: safeResourceQuantity(proof.remaining) };
  } catch { return null; }
}
function refreshAvailable(quotas, proof) {
  const available = quotas.has(proof.source) ? Math.min(quotas.get(proof.source), proof.remaining) : proof.remaining;
  quotas.set(proof.source, available);
  return available;
}
function actionFor(actionType, state, costs) {
  const definition = ACTIONS[actionType === 'SUBMIT' ? 'finishOrder' : 'rerollOrder'];
  return { kind: actionType === 'SUBMIT' ? 'finishOrder' : 'denyOrder', request: definition.request,
    response: definition.response, body: buildBody(definition, { index: state.index }), costs,
    label: `${actionType === 'SUBMIT' ? '提交' : '刷新'}居民订单 #${state.index}` };
}

// Capture facts from the same surveyWorld read. An omitted order list/counter must
// not become an authoritative empty list/zero via surveyWorld's display defaults.
export function decorateOrderSurvey(survey, responses, config = null) {
  const water = responses instanceof Map ? responses.get('OnWaterRequest') : responses;
  const orders = Array.isArray(water?.workerOrder) ? water.workerOrder.map((raw) => ({
    index: own(raw, 'index') ? raw.index : null, workerId: raw?.workerId, textId: raw?.textId,
    isSpecial: raw?.isSpecial ?? false, refreshTime: raw?.refreshTime == null ? null : safeResourceQuantity(raw.refreshTime),
    requirements: Array.isArray(raw?.requirements) ? raw.requirements.map((row) => ({ id: row?.id, num: safeResourceQuantity(row?.num) })) : null,
  })) : null;
  const orderNum = own(water?.orderOfTheDay, 'orderNum') ? safeResourceQuantity(water.orderOfTheDay.orderNum) : null;
  // Missing optional refreshTime means zero to the existing parser; retain the
  // same semantic value while preserving malformed explicit values as unknown.
  if (orders) for (let i = 0; i < orders.length; i++) {
    if (water.workerOrder[i]?.refreshTime == null) orders[i].refreshTime = 0;
  }
  return { ...survey, orderReliability: { orders: orders !== null, counter: orderNum !== null },
    rawOrderMetadata: { orders, orderNum },
    orderRewardSources: Array.isArray(water?.workerOrder) ? water.workerOrder.map(raw => ({index:indexOf(raw?.index),evidence:configuredBaseOrderReward(config,raw)})) : [] };
}
export async function surveyOrderExecution(client, protocol, { survey = surveyWorld, ...options } = {}) {
  const responses = new Map(), observedAt = new Map();
  const observed = new Proxy(client, { get(target, key) {
    if (key === 'request') return async (...args) => {
      const result = await target.request(...args); responses.set(args[0], result); observedAt.set(args[0],Date.now()); return result;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const facts=decorateOrderSurvey(await survey(observed, protocol, options), responses, options.config);
  return {...facts,orderRewardObservation:{resources:toSnapshotJson(responses.get('AllResourceRequest')??null),sourceAt:observedAt.get('AllResourceRequest')??null}};
}

export function planOrderExecution(survey, { rules, ledger = new ResourceLedger(survey?.stockReliable === true ? survey.stock : null),
  mode = 'Manual', refreshEligibility, selections } = {}) {
  if (!modes.has(mode)) throw notExecuted('不支持的订单执行模式');
  const policy = validateOrderRules(rules);
  if (selections !== undefined && (!Array.isArray(selections) || selections.some((id) => typeof id !== 'string'))) throw notExecuted('订单选择必须为 actionId 数组');
  const selectedIds = selections === undefined ? null : new Set(selections);
  const rows = [], actions = [], notes = [], refreshQuotas = new Map();
  for (const order of survey?.orders ?? []) {
    const state = snapshot(order), identity = state ? hash(state) : null;
    const costs = state?.requirements ?? [];
    const ruleResult = evaluateOrder(order, survey.stockReliable === true ? survey.stock : null, policy);
    const actionType = { RECOMMEND_SUBMIT: 'SUBMIT', RECOMMEND_REFRESH: 'REFRESH', RECOMMEND_KEEP: 'KEEP', NEEDS_REVIEW: 'REVIEW' }[ruleResult.decision];
    const actionId = `orders:${actionType}:${hash({ identity, policy })}`;
    const selected = selectedIds === null || selectedIds.has(actionId);
    const eligible = actionType === 'REFRESH' ? proofFor(order, survey, refreshEligibility) : null;
    let blockedReason = null;
    if (!state || !trustedOrder(survey, state.index)) blockedReason = '订单身份或原始订单数据不可靠';
    else if (actionType === 'KEEP' || actionType === 'REVIEW') blockedReason = '当前规则要求保留或人工检查，不执行写操作';
    else if (survey.stockReliable !== true) blockedReason = '库存来源不可靠';
    else if (actionType === 'REFRESH' && !eligible) blockedReason = '缺少可靠的免费刷新配额和允许刷新条件证据';
    else if (selected && actionType === 'REFRESH' && refreshAvailable(refreshQuotas, eligible) < 1) blockedReason = '本批次免费刷新配额已预留，不能重复使用';
    else if (actionType === 'SUBMIT' && survey.orderReliability?.counter !== true) blockedReason = '缺少可用于提交后确认的权威订单完成计数';
    else if (selected && actionType === 'SUBMIT' && !ledger.canReserve(costs)) blockedReason = '共享资源预算不足或成本未知';
    const executable = blockedReason === null;
    const operationCosts = actionType === 'SUBMIT' ? costs : [];
    const row = { module: 'orders', actionId, selected,
      actionType, target: { index: state?.index ?? order?.index ?? null }, identity,
      beforeState: state, resourceBefore: inventory(survey, costs), decision: ruleResult.decision,
      ruleResult, costs: operationCosts, executable, blockedReason, refreshEligibility: eligible,
      configuredRewardEvidence: survey.orderRewardSources?.find(row=>row.index===state?.index)?.evidence ?? configuredBaseOrderReward(null,null) };
    if (executable) {
      if (selected && actionType === 'SUBMIT') ledger.reserve(operationCosts);
      if (selected && actionType === 'REFRESH') refreshQuotas.set(eligible.source, refreshQuotas.get(eligible.source) - 1);
      row.action = actionFor(actionType, state, operationCosts);
      if (selected) actions.push(row);
    } else notes.push(`订单 #${row.target.index}：${blockedReason}`);
    rows.push(row);
  }
  if (survey?.orderReliability?.orders !== true) notes.push('权威订单列表缺失，禁止执行订单操作');
  return { module: 'orders', mode, rows, actions,
    resourceBudget: resourceCosts(actions.flatMap(({ costs }) => costs)), notes };
}

export async function executeOrderOperation(client, protocol, operation, { rules, config = null, player = null,
  budget = { ledger: null }, signal, stop, assertActive = () => {}, onStep,
  survey = surveyWorld, refreshEligibility, timeout = 15000, window = 400, rewardBinding = null, rewardContext = () => null } = {}) {
  const startedAt = new Date().toISOString();
  let beforeSurvey, afterSurvey, beforeState = null, afterState = null, requestResult = null, reservationBefore, dispatched = false, executingAction = null, refreshReservation = null;
  const costs = operation?.costs;
  let responseObservation=null,rewardEvidence=null;
  const active = () => { assertExecutionActive(client, { signal, stop }); assertActive(); };
  const finish = (status, details = {}) => {
    if (dispatched && !['SUCCESS', 'REJECTED', 'RATE_LIMITED', 'UNKNOWN'].includes(status)) status = 'UNKNOWN';
    const unresolvedWrite = dispatched && ['UNKNOWN', 'CANCELLED', 'RATE_LIMITED'].includes(status);
    if (unresolvedWrite && executingAction) client.markUnverifiedWrite?.(executingAction.request, executingAction.body);
    const reserved = budget.ledger?.reserved instanceof Map ? [...budget.ledger.reserved].map(([id, num]) => ({ id, num })) : [];
    const result = operationResult(status, { module: 'orders', actionId: operation?.actionId, actionType: operation?.actionType,
      target: operation?.target, identity: operation?.identity, dispatched, unresolvedWrite, startedAt, finishedAt: new Date().toISOString(),
      beforeState, resourceBefore: beforeSurvey ? inventory(beforeSurvey, beforeState?.requirements) : [],
      reservation: { costs: Array.isArray(costs) ? costs : null, before: reservationBefore ?? [], after: reserved,
        held: unresolvedWrite, refreshQuota: refreshReservation },
      requestStatus: requestResult?.status ?? 'NOT_EXECUTED', requestResult, afterState,
      ...(operation?.actionType==='SUBMIT'?{receivedReward:parseReceivedOrderReward(responseObservation?.value),rewardEvidence:rewardEvidence??{status:'EVIDENCE_ONLY',verification:{status:'UNKNOWN',reason:'REWARD_EVIDENCE_NOT_COLLECTED'},operationStatusUnchanged:true,minGoldEligible:false}}:{}),
      resourceAfter: afterSurvey ? inventory(afterSurvey, beforeState?.requirements) : [],
      verification: { status: dispatched ? 'UNCONFIRMED' : 'NOT_STARTED', reason: details.error ?? '动作尚未通过权威复读确认' }, ...details });
    onStep?.(result); return result;
  };
  try {
    active();
    const policy = validateOrderRules(rules);
    if (!operation || !['SUBMIT', 'REFRESH'].includes(operation.actionType) || operation.executable !== true
      || indexOf(operation.target?.index) === null || typeof operation.identity !== 'string') throw notExecuted('操作没有可执行的内部订单计划');
    beforeSurvey = await surveyOrderExecution(client, protocol, { survey, config, player, timeout, signal, stop });
    active();
    const current = trustedOrder(beforeSurvey, indexOf(operation.target.index));
    beforeState = snapshot(current);
    if (!beforeState || hash(beforeState) !== operation.identity) throw notExecuted('订单身份已变化，请重新规划');
    const ruleResult = evaluateOrder(current, beforeSurvey.stockReliable === true ? beforeSurvey.stock : null, policy);
    const expectedDecision = operation.actionType === 'SUBMIT' ? 'RECOMMEND_SUBMIT' : 'RECOMMEND_REFRESH';
    if (ruleResult.decision !== expectedDecision) throw notExecuted('当前订单不再符合已规划的规则动作');
    if (beforeSurvey.stockReliable !== true) throw notExecuted('当前库存来源不可靠');
    if (operation.actionType === 'SUBMIT' && beforeSurvey.orderReliability?.counter !== true) throw notExecuted('权威订单完成计数缺失');
    const refreshProof = operation.actionType === 'REFRESH' ? proofFor(current, beforeSurvey, refreshEligibility) : null;
    if (operation.actionType === 'REFRESH' && !refreshProof) throw notExecuted('缺少可靠的免费刷新配额和允许刷新条件证据');
    if (refreshProof) {
      if (!budget.orderRefreshQuotas) budget.orderRefreshQuotas = new Map();
      const available = refreshAvailable(budget.orderRefreshQuotas, refreshProof);
      if (available < 1) throw notExecuted('共享执行预算的免费刷新配额已预留，拒绝重复使用');
      refreshReservation = { source: refreshProof.source, before: available, after: available - 1 };
    }
    const expectedCosts = operation.actionType === 'SUBMIT' ? beforeState.requirements : [];
    if (!Array.isArray(costs) || hash(resourceCosts(costs).sort((a, b) => a.id.localeCompare(b.id))) !== hash(expectedCosts)) throw notExecuted('订单成本与当前需求不一致');
    // Reconstruct only from the existing catalog. Arbitrary client-supplied Action
    // objects are never executed even if a caller accidentally retained one.
    const action = actionFor(operation.actionType, beforeState, expectedCosts);
    executingAction = action;
    if (refreshReservation) budget.orderRefreshQuotas.set(refreshReservation.source, refreshReservation.after);
    reservationBefore = budget.ledger?.reserved instanceof Map ? [...budget.ledger.reserved].map(([id, num]) => ({ id, num })) : [];
    const guarded = new Proxy(client, { get(target, key) {
      if (key === 'request') return async (...args) => { if (args[4]?.mutate) { active(); dispatched = true; } const value=await target.request(...args); if(args[0]==='FinishWorkerOrderRequest'&&args[2]==='FinishWorkerOrderResponse'&&args[1]?.index===beforeState.index){responseObservation={value:toSnapshotJson(value),sourceAt:Date.now()};} return value; };
      if (key === 'sendWatch') return (...args) => { active(); dispatched = true; return target.sendWatch(...args); };
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const run = await runWorld(guarded, protocol, { actions: [action] }, { allowMutate: true, budget, signal, stop, timeout, window });
    requestResult = run.results[0] ?? operationResult('NOT_EXECUTED', { error: '执行器未返回动作结果' });
    const terminal = run.results.at(-1);
    if (dispatched && !['REJECTED', 'NOT_EXECUTED'].includes(requestResult.status)) client.markUnverifiedWrite?.(action.request, action.body);
    if (terminal && !['SUCCESS', 'UNKNOWN'].includes(terminal.status)) return finish(terminal.status, { error: terminal.error, ruleResult });
    // A transport/decoder/association failure stops this batch immediately.
    // Only a completed quiet watch may continue to authoritative verification.
    if (requestResult.status !== 'SUCCESS' && !(requestResult.status === 'UNKNOWN' && requestResult.sent && !requestResult.error)) {
      return finish(requestResult.status, { error: requestResult.error, ruleResult });
    }
    // Preserve the existing client's fingerprint until authority confirms the write.
    active();
    afterSurvey = await surveyOrderExecution(client, protocol, { survey, config, player, timeout, signal, stop });
    active();
    const next = trustedOrder(afterSurvey, beforeState.index);
    afterState = snapshot(next);
    const changed = afterSurvey.orderReliability?.orders === true
      && !afterSurvey.orders.some((order) => snapshot(order) && hash(snapshot(order)) === operation.identity);
    const afterIndexRows = afterSurvey.orders.filter((order) => indexOf(order?.index) === beforeState.index);
    const rawIndices = (afterSurvey.rawOrderMetadata.orders ?? []).map((order) => indexOf(order?.index));
    const listReliable = rawIndices.every((index) => index !== null) && new Set(rawIndices).size === rawIndices.length;
    const nextReliable = listReliable && (afterIndexRows.length === 0 || (afterIndexRows.length === 1 && afterState !== null));
    const counterBefore = beforeSurvey.rawOrderMetadata.orderNum, counterAfter = afterSurvey.rawOrderMetadata.orderNum;
    const confirmed = changed && nextReliable && (operation.actionType === 'SUBMIT'
      ? afterSurvey.orderReliability.counter === true && counterAfter === counterBefore + 1
      : afterState !== null);
    if(operation.actionType==='SUBMIT'){
      const scope=orderRewardEvidenceScope(rewardBinding),envelope=(value,source,sourceAt)=>({binding:rewardBinding,fact:createStateFact(value,{accountId:rewardBinding?.accountId,generation:rewardBinding?.generation,source,sourceAt,scope,reliable:value!==null&&value!==undefined})});
      rewardEvidence=inspectOrderRewardEvidence(operation,{binding:rewardBinding,currentContext:rewardContext(),response:envelope(responseObservation?.value,'FinishWorkerOrderResponse',responseObservation?.sourceAt),beforeResources:envelope(beforeSurvey.orderRewardObservation?.resources,'AllResourceResponse',beforeSurvey.orderRewardObservation?.sourceAt),afterResources:envelope(afterSurvey.orderRewardObservation?.resources,'AllResourceResponse',afterSurvey.orderRewardObservation?.sourceAt)});
    }
    const nextDecision = next ? evaluateOrder(next, afterSurvey.stockReliable === true ? afterSurvey.stock : null, policy) : null;
    const verification = { status: confirmed ? 'CONFIRMED' : 'UNCONFIRMED', changed, counterBefore, counterAfter,
      reason: confirmed ? '权威复读确认目标订单已变化且动作条件成立' : '权威复读未能确认目标订单动作，停止本批次' };
    if (confirmed) client.confirmWatchedWrite?.(action.request, action.body);
    return finish(confirmed ? 'SUCCESS' : 'UNKNOWN', { ruleResult, verification, nextDecision,
      ...(!confirmed ? { error: verification.reason } : {}) });
  } catch (error) {
    let status = executionOutcome(error);
    if (!dispatched && status === 'UNKNOWN') status = 'NOT_EXECUTED';
    else if (dispatched && !['REJECTED', 'RATE_LIMITED'].includes(status)) status = 'UNKNOWN';
    return finish(status, { error: error.message, verification: { status: 'UNCONFIRMED', reason: error.message } });
  }
}
