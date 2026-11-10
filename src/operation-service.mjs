import { createHash, randomUUID } from 'node:crypto';
import { ResourceLedger, resourceCosts } from './resource-ledger.mjs';
import { assertExecutionActive, executionOutcome, stopsExecution } from './execution.mjs';
import { loadProductionPolicy, saveProductionPolicy, selectProductionCandidates, productionShortages } from './production-policy.mjs';
import { summarizeProductionHistory } from './production-report.mjs';
import { createExecutionHistory } from './execution-history.mjs';
import { surveyOrderExecution, planOrderExecution, executeOrderOperation } from './order-execution.mjs';
import { surveyCityOperations, cityView, planCityOperations, executeCityAction } from './city-operations.mjs';

const clone = value => structuredClone(value);
const stable = value => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
export const operationDigest = value => createHash('sha256').update(stable(value)).digest('hex');
const error = (message, code = 'INVALID_OPERATION', statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw error('请求包含不支持的字段', 'INVALID_INPUT', 400);
}
function publicAction(operation) {
  const fields = ['actionId', 'actionType', 'target', 'costs', 'beforeState', 'identity', 'decision', 'ruleResult', 'reason', 'label', 'expectedState'];
  return Object.fromEntries(fields.filter(key => operation[key] !== undefined).map(key => [key, clone(operation[key])]));
}
function evidence(result) {
  const fields = ['requestStatus', 'beforeState', 'resourceBefore', 'resourceAfter', 'reservation', 'resourceReservation', 'afterState', 'verification', 'nextDecision', 'reason', 'error', 'decision', 'ruleResult', 'dispatched', 'unresolvedWrite', 'beforeInventory', 'afterInventory', 'beforeInventoryReliable', 'afterInventoryReliable', 'collectedProducts'];
  return Object.fromEntries(fields.filter(key => result[key] !== undefined).map(key => [key, clone(result[key])]));
}

// Session, GameClient, ledger and executors remain the owners of transport and execution safety.
// This small coordinator binds their existing functions to one displayed, single-use batch.
export function createOperationService({ protocol, getConfig = () => null, loadRules, history = createExecutionHistory(), clock = Date.now, loadProduction = loadProductionPolicy, saveProduction = saveProductionPolicy,
  survey = (client, wire, opts) => surveyOrderExecution(client, wire, { ...opts, survey: surveyCityOperations }),
  orderPlanner = planOrderExecution, cityPlanner = planCityOperations, cityViewer = cityView,
  orderExecute = executeOrderOperation, cityExecute = executeCityAction,
} = {}) {
  const cache = new Map(), plans = new Map(), runs = new Map();
  const now = () => new Date(clock()).toISOString();
  function current(session, generation, client) {
    if (session.generation !== generation || session.client !== client || session.state !== 'READY') throw error('账号会话已切换或失效', 'CANCELLED');
    assertExecutionActive(client, { signal: session.abort.signal });
  }
  function acquire(session, label) {
    if (!session?.client?.connected || session.state !== 'READY') throw error('账号未连接，请先显式连接', 'NOT_CONNECTED');
    const stage = session.stageRunner?.getStatus();
    if (session.busy || session.collectionPromise || session.loop?.running || stage?.running || stage?.inFlight || runs.get(session.id)?.running) throw error('账号已有互斥任务', 'ACCOUNT_BUSY');
    const client = session.client;
    if (client.pending?.length || client.watchers?.length || client.promptUncertain || client.lateResponses?.size || client.uncertainWrites?.size) throw error('连接存在未决请求；禁止新批次', 'RESPONSE_UNCERTAIN');
    if (runs.get(session.id)?.record.finalStatus === 'UNKNOWN' || history.unresolved(session.id)) throw error('历史存在 UNKNOWN 或异常退出未决批次，等待权威复核', 'RECOVERY_UNCERTAIN');
    session.busy = label;
    return () => { if (session.busy === label) session.busy = null; };
  }
  function status(accountId) {
    const run = runs.get(accountId);
    let blocked, warning;
    try { blocked = run?.record.finalStatus === 'UNKNOWN' || history.unresolved(accountId); }
    catch (cause) { blocked = true; warning = cause.message; }
    return { running: Boolean(run?.running), runId: run?.record.runId ?? null, finalStatus: run?.record.finalStatus ?? (blocked ? 'UNKNOWN' : 'IDLE'), stopReason: run?.record.stopReason ?? warning ?? null, blocked };
  }
  function view(accountId) { return { accountId, status: status(accountId), view: clone(cache.get(accountId)?.view ?? null), lastPlan: clone(plans.get(accountId)?.public ?? null) }; }
  function buildView(accountId, facts, config, rules) {
    const orders = orderPlanner(facts, { config, rules, mode: 'Manual', ledger: new ResourceLedger(facts.stock), selections: [] });
    const city = cityViewer(facts, { config });
    const production = loadProduction(accountId);
    return { orders: (orders.rows ?? []).map(({ action, ...row }) => row), city: { ...city, candidates: city.candidates.map(({ action, ...row }) => row) }, productionShortages: productionShortages(facts), productionPolicy: production.config, productionPolicyWarning: production.warning, productionRecommendations: selectProductionCandidates(facts, { policy: production.config, candidates: city.candidates }), surveyedAt: now(), source: '显式只读采集；缓存不代表实时状态' };
  }
  async function surveyAccount(session) {
    const release = acquire(session, 'operations:SURVEY');
    const generation = session.generation, client = session.client;
    try {
      const config = getConfig(), rules = loadRules(session.id).config;
      const facts = await survey(client, protocol, { config, player: session.player, signal: session.abort.signal });
      current(session, generation, client);
      cache.set(session.id, { view: buildView(session.id, facts, config, rules) });
      plans.delete(session.id);
      return view(session.id);
    } finally { release(); }
  }
  async function plan(session, payload) {
    exact(payload, ['module', 'mode', 'selections']);
    const { module, mode, selections } = payload;
    if (!['orders', 'city', 'combined'].includes(module) || !['Manual', 'Hybrid', 'Automatic'].includes(mode)
      || !Array.isArray(selections) || !selections.length || selections.length > 100 || selections.some(id => typeof id !== 'string' || !id || id.length > 300)
      || new Set(selections).size !== selections.length || (mode === 'Manual' && selections.length !== 1)) throw error('模块、模式或操作选择无效；Manual 每次只允许一条', 'INVALID_INPUT', 400);
    const release = acquire(session, 'operations:PLAN');
    const generation = session.generation, client = session.client;
    try {
      const config = getConfig(), rules = loadRules(session.id).config;
      const facts = await survey(client, protocol, { config, player: session.player, signal: session.abort.signal });
      current(session, generation, client);
      if (facts.stockReliable !== true || !(facts.stock instanceof Map)) throw error('库存来源不可靠，禁止计划');
      // Both modules share this exact planning ledger. Execution starts a separate conservative ledger.
      const ledger = new ResourceLedger(facts.stock), operations = [];
      if (module !== 'city') {
        const orderPlan = orderPlanner(facts, { config, rules, mode, ledger, selections });
        // Planning adapters reserve in order; select the requested subset without charging other orders.
        const wanted = (orderPlan.actions ?? []).filter(action => selections.includes(action.actionId));
        operations.push(...wanted.map(operation => ({ ...operation, module: 'orders' })));
      }
      if (module !== 'orders') {
        const candidates = cityViewer(facts, { config }).candidates ?? [];
        const cityIds = selections.filter(id => candidates.some(candidate => candidate.actionId === id));
        if (cityIds.length) {
          const cityPlan = cityPlanner(facts, { config, selections: cityIds, ledger });
          operations.push(...cityPlan.actions.map(operation => ({ ...operation, module: 'city' })));
        }
      }
      if (operations.length !== selections.length || operations.some(action => !selections.includes(action.actionId))) throw error('操作已变化、无法执行或预算不足；请重新采集和选择', 'STALE_PLAN');
      const production = loadProduction(session.id).config;
      if (mode === 'Hybrid' && operations.some(op => op.actionType === 'SUBMIT') && operations.length !== 1) throw error('Hybrid 提交需逐单授权', 'INVALID_INPUT', 400);
      if (mode === 'Automatic') {
        const allowed = selectProductionCandidates(facts, { policy: production, candidates: cityViewer(facts, { config }).candidates });
        if (operations.some(op => op.actionType === 'startProduce' && !allowed.includes(op.actionId))) throw error('自动生产未启用或超出当前账号策略范围', 'PRODUCTION_POLICY_REQUIRED');
      }
      // Keep the server's deterministic dependency order; no caller-supplied request/body is accepted.
      const resourceBudget = resourceCosts(operations.flatMap(action => action.costs));
      const createdAt = now(), batchId = randomUUID(), expiresAt = new Date(clock() + 300000).toISOString();
      const summary = { batchId, accountId: session.id, module, mode, actions: operations.map(publicAction), resourceBudget, productionPolicy: production, createdAt, expiresAt,
        notes: ['授权仅覆盖本批次具体操作；新订单和新计划需要重新授权', 'UNKNOWN 停止批次并保留预算；不自动重试'] };
      summary.planHash = operationDigest(summary);
      const internal = { public: clone(summary), operations: clone(operations), generation, client, config, configHash: operationDigest(config), productionHash: operationDigest(production), rulesHash: operationDigest(rules), stock: new Map(facts.stock), permit: null };
      plans.set(session.id, internal);
      cache.set(session.id, { view: buildView(session.id, facts, config, rules) });
      return clone(summary);
    } finally { release(); }
  }
  function lookup(session, payload) {
    const entry = plans.get(session.id);
    if (!entry || entry.public.batchId !== payload.batchId || clock() >= Date.parse(entry.public.expiresAt)) throw error('批次不存在或已过期', 'STALE_PLAN');
    current(session, entry.generation, entry.client);
    if (operationDigest(loadProduction(session.id).config) !== entry.productionHash) throw error('生产策略已变化，必须重新规划授权', 'STALE_PLAN');
    if (operationDigest(getConfig()) !== entry.configHash) throw error('配置成本表已变化，必须重新规划', 'STALE_PLAN');
    if (operationDigest(loadRules(session.id).config) !== entry.rulesHash) throw error('账号规则已经变化，必须重新规划授权', 'STALE_RULES');
    return entry;
  }
  function authorize(session, payload) {
    exact(payload, ['batchId', 'planHash', 'approvedActionIds', 'resourceBudget', 'confirm']);
    const entry = lookup(session, payload), plan = entry.public;
    if (payload.confirm !== true || payload.planHash !== plan.planHash || stable(payload.approvedActionIds) !== stable(plan.actions.map(action => action.actionId))
      || stable(payload.resourceBudget) !== stable(plan.resourceBudget)) throw error('授权必须精确确认账号批次、计划、操作与预算', 'AUTHORIZATION_REQUIRED', 403);
    if (entry.consumed) throw error('本计划已执行，不能复用授权', 'PERMIT_USED');
    entry.permit = { id: randomUUID(), approvedAt: now() };
    return { batchId: plan.batchId, permitId: entry.permit.id };
  }
  function execute(session, payload) {
    exact(payload, ['batchId', 'permitId']);
    const entry = lookup(session, payload);
    if (entry.consumed || !entry.permit || entry.permit.id !== payload.permitId) throw error('缺少当前批次单次授权', 'AUTHORIZATION_REQUIRED', 403);
    const release = acquire(session, 'operations:EXECUTING');
    const record = { runId: randomUUID(), accountId: session.id, module: entry.public.module, mode: entry.public.mode, startedAt: now(), finishedAt: null,
      authorizationSummary: { batchId: entry.public.batchId, planHash: entry.public.planHash, approvedAt: entry.permit.approvedAt, actionIds: entry.public.actions.map(action => action.actionId), resourceBudget: entry.public.resourceBudget },
      planSummary: entry.public, resourceBudget: entry.public.resourceBudget,
      actions: entry.operations.map(action => ({ ...publicAction(action), resourceReservation: action.costs, requestStatus: 'NOT_DISPATCHED', result: 'NOT_EXECUTED', afterState: null, timestamp: null })),
      finalStatus: 'EXECUTING', stopReason: null };
    try { history.put(record); } catch (cause) { release(); throw cause; }
    entry.consumed = true; entry.permit = null;
    const run = { record, running: true, stop: { aborted: false }, task: null };
    runs.set(session.id, run);
    const generation = session.generation, client = session.client, signal = session.abort.signal;
    const budget = { ledger: new ResourceLedger(entry.stock) };
    const authorizedCurrent = () => {
      current(session, generation, client);
      if (operationDigest(getConfig()) !== entry.configHash || operationDigest(loadRules(session.id).config) !== entry.rulesHash || operationDigest(loadProduction(session.id).config) !== entry.productionHash) throw error('配置或规则变化，当前授权已失效', 'NOT_EXECUTED');
    };
    run.task = Promise.resolve().then(async () => {
      for (let index = 0; index < entry.operations.length; index++) {
        if (run.stop.aborted) { record.finalStatus = 'CANCELLED'; record.stopReason = '用户主动停止；后续操作未发送'; break; }
        current(session, generation, client);
        if (operationDigest(loadRules(session.id).config) !== entry.rulesHash) throw error('执行期间规则变化，停止后续操作', 'NOT_EXECUTED');
        const operation = entry.operations[index], row = record.actions[index];
        row.requestStatus = 'DISPATCHING'; row.timestamp = now(); history.put(record);
        const executor = operation.module === 'orders' ? orderExecute : cityExecute;
        const result = await executor(client, protocol, operation, { config: entry.config, rules: loadRules(session.id).config, player: session.player,
          allowMutate: true, mode: entry.public.mode, productionPolicy: entry.public.productionPolicy, ...(operation.module === 'city' ? { survey } : {}), budget, signal, stop: run.stop, assertActive: authorizedCurrent, assertCurrent: authorizedCurrent });
        Object.assign(row, evidence(result), { result: result.status ?? 'UNKNOWN', timestamp: now() });
        row.requestStatus = result.requestStatus ?? result.status ?? 'UNKNOWN';
        // Persist each result before considering the next request.
        history.put(record);
        session.snapshotStale = Boolean(session.snapshot);
        if (stopsExecution(result) || result.status !== 'SUCCESS') {
          record.finalStatus = result.status ?? 'UNKNOWN'; record.stopReason = result.reason ?? result.error ?? '操作未确认成功，已停止批次'; break;
        }
      }
      if (record.finalStatus === 'EXECUTING') record.finalStatus = 'SUCCESS';
    }).catch(cause => {
      const pending = record.actions.find(row => row.requestStatus === 'DISPATCHING');
      record.finalStatus = pending ? 'UNKNOWN' : executionOutcome(cause);
      record.stopReason = cause.message;
      if (pending) { pending.result = 'UNKNOWN'; pending.requestStatus = 'UNKNOWN'; pending.reason = cause.message; }
    }).finally(() => {
      record.finishedAt = now();
      try { history.put(record); }
      catch (cause) { record.finalStatus = 'UNKNOWN'; record.stopReason = cause.message; }
      run.running = false; release();
    });
    return { runId: record.runId, status: 'EXECUTING' };
  }
  function stop(accountId) { const run = runs.get(accountId); if (run?.running) run.stop.aborted = true; return status(accountId); }
  return { view, survey: surveyAccount, plan, authorize, execute, stop, status,
    history: (accountId, runId) => { const all = history.list(accountId); return { accountId, runs: all.filter(run => !runId || run.runId === runId), dailyReport: summarizeProductionHistory(all, { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(clock())), timeZone: 'Asia/Shanghai' }) }; },
    productionPolicy: accountId => ({ accountId, ...loadProduction(accountId) }),
    saveProductionPolicy: (accountId, payload) => { exact(payload, ['config']); const result = saveProduction(accountId, payload.config); plans.delete(accountId); cache.delete(accountId); return { accountId, ...result }; },
    blocked: accountId => runs.get(accountId)?.record.finalStatus === 'UNKNOWN' || history.unresolved(accountId), running: accountId => Boolean(runs.get(accountId)?.running),
    settle: accountId => runs.get(accountId)?.task ?? Promise.resolve(),
  };
}
