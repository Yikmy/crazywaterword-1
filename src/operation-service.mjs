import { createHash, randomUUID } from 'node:crypto';
import { ResourceLedger, resourceCosts, createRunBudgetContext, normalizeBudgetClaims, operationBudgetClaims } from './resource-ledger.mjs';
import { assertExecutionActive, executionOutcome, stopsExecution } from './execution.mjs';
import { loadProductionPolicy, saveProductionPolicy, selectProductionCandidates, productionShortages } from './production-policy.mjs';
import { summarizeProductionHistory } from './production-report.mjs';
import { collectOperationRecovery, buildVerifiedReceipt, RECOVERY_DISPATCH_CONTRACT } from './operation-recovery.mjs';
import { toSnapshotJson } from './game.mjs';
import { createExecutionHistory, runHasUnresolvedWrites, actionNeedsReconciliation } from './execution-history.mjs';
import { surveyOrderExecution, planOrderExecution, executeOrderOperation } from './order-execution.mjs';
import { surveyCityOperations, cityView, planCityOperations, executeCityAction } from './city-operations.mjs';
import { GAMEPLAY_MODULES, listBusinessFunctions } from './function-registry.mjs';
import { createModuleSettings } from './gameplay-settings.mjs';
import { validateFunctionParameters } from './function-contracts.mjs';
import { BUSINESS_EXECUTION_STAGES, executeBusinessOperation } from './business-functions.mjs';

const clone = value => structuredClone(value);
const stable = value => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
export const operationDigest = value => createHash('sha256').update(stable(value)).digest('hex');
const error = (message, code = 'INVALID_OPERATION', statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw error('请求包含不支持的字段', 'INVALID_INPUT', 400);
}
function publicAction(operation) {
  const fields = ['module', 'actionId', 'actionType', 'target', 'costs', 'beforeState', 'identity', 'decision', 'ruleResult', 'reason', 'label', 'expectedState', 'costSource', 'parameters', 'restoreParameters', 'budgetClaims'];
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
  assertWriter = () => {}, recoveryCollect = collectOperationRecovery,
  modules = GAMEPLAY_MODULES, moduleSettings = createModuleSettings({ modules }), businessExecute = executeBusinessOperation,
} = {}) {
  const cache = new Map(), plans = new Map(), runs = new Map(), moduleCache = new Map(), formationProofs = new Map(), moduleFacts = new Map();
  const recoveryPreviews = new Map(), workflowBudgets = new Map(), connectionIds = new WeakMap();
  const coreModules = new Set(['orders','city','production']);
  function connectionIdOf(session) { if (typeof session.connectionId === 'string' && session.connectionId) return session.connectionId; if (!connectionIds.has(session.client)) connectionIds.set(session.client, randomUUID()); return connectionIds.get(session.client); }
  const parentScope = (session, runId) => ({ accountId: session.id, runId, generation: session.generation, connectionId: connectionIdOf(session) });
  const stockLimits = stock => normalizeBudgetClaims({ resources: [...stock].filter(([,num]) => Number.isSafeInteger(num) && num > 0).filter(([id]) => !['RUBY','钻石'].includes(id)).map(([id,num]) => ({id,num})), quotas: [], uids: [] });
  const executionContext = session => toSnapshotJson({ accountId: session.id, playerId: session.player?.playerId ?? null, worldId: session.player?.worldId ?? null, generation: session.generation, connectionId: connectionIdOf(session) });
  const lockOwners = new WeakMap(), workflowOwners = new WeakMap();
  const now = () => new Date(clock()).toISOString();
  function current(session, generation, client) {
    assertWriter();
    if (session.generation !== generation || session.client !== client || session.state !== 'READY') throw error('账号会话已切换或失效', 'CANCELLED');
    assertExecutionActive(client, { signal: session.abort.signal });
  }
  function acquire(session, label, workflowId = null, { recoveryRead = false } = {}) {
    assertWriter();
    if (!session?.client?.connected || session.state !== 'READY') throw error('账号未连接，请先显式连接', 'NOT_CONNECTED');
    const stage = session.stageRunner?.getStatus();
    if(stage?.uncertain)throw error('主线存在未决结果，禁止新的业务写批次', 'RESPONSE_UNCERTAIN');
    const ownsWorkflow = workflowId && session.workflowOwner === workflowId;
    if ((session.workflowOwner && !ownsWorkflow) || (session.busy && !(ownsWorkflow && session.busy === 'workflow:' + workflowId)) || session.collectionPromise || session.loop?.running || stage?.running || stage?.inFlight || runs.get(session.id)?.running) throw error('账号已有互斥任务', 'ACCOUNT_BUSY');
    const client = session.client;
    if (client.pending?.length || client.watchers?.length || client.promptUncertain || client.lateResponses?.size || !recoveryRead && client.uncertainWrites?.size) throw error('连接存在未决请求；禁止新批次', 'RESPONSE_UNCERTAIN');
    if (!recoveryRead && (runs.get(session.id) && runHasUnresolvedWrites(runs.get(session.id).record) || history.unresolved(session.id))) throw error('历史存在 UNKNOWN 或异常退出未决批次，等待权威复核', 'RECOVERY_UNCERTAIN');
    const owner={token:Symbol(label),generation:session.generation,client:session.client}; lockOwners.set(session,owner);
    session.busy = label;
    return () => { if(lockOwners.get(session)!==owner || session.generation!==owner.generation || session.client!==owner.client)return; lockOwners.delete(session); if (session.busy === label) session.busy = session.workflowOwner ? 'workflow:' + session.workflowOwner : null; };
  }
  function status(accountId) {
    const run = runs.get(accountId);
    let blocked, warning;
    try { blocked = Boolean(run && runHasUnresolvedWrites(run.record)) || history.unresolved(accountId); }
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
  function adapterFor(id) { if (!Object.hasOwn(modules, id)) throw error('未注册玩法', 'INVALID_INPUT', 400); return modules[id]; }
  function moduleView(accountId, id) { adapterFor(id); return { accountId, module: id, ...moduleSettings.get(accountId, id), status: status(accountId), view: clone(moduleCache.get(accountId)?.[id] ?? null), lastPlan: plans.get(accountId)?.public.module === id ? clone(plans.get(accountId).public) : null, functions: listBusinessFunctions(modules) }; }
  function cacheModule(accountId, id, facts, options) {
    moduleFacts.set(accountId,{...(moduleFacts.get(accountId)??{}),[id]:clone(Object.fromEntries(Object.entries(facts).filter(([,value])=>typeof value!=='function')))});
    const raw = adapterFor(id).view(facts, options);
    const safe = { ...raw, candidates: (raw.candidates ?? []).map(({ action, ...row }) => ({ ...row, executable: Boolean(action) && row.executable !== false && row.decision !== 'BLOCKED' })), surveyedAt: now(), source: '显式只读采集；缓存不代表实时状态' };
    moduleCache.set(accountId, { ...(moduleCache.get(accountId) ?? {}), [id]: safe });
  }
  async function surveyModule(session, id, parameters = {}, { workflowId = null } = {}) {
    const adapter = adapterFor(id); if(adapter.contractVersion===1) parameters=validateFunctionParameters(id,adapter,parameters)??{};
    const release = acquire(session, 'operations:SURVEY:' + id, workflowId), generation = session.generation, client = session.client;
    try { const options = { rules:loadRules(session.id).config,mode:'Manual',productionPolicy:loadProduction(session.id).config,config: getConfig(), player: session.player, signal: session.abort.signal, parameters, moduleConfig: moduleSettings.get(session.id,id).config };
      const facts = await adapter.survey(client, protocol, options); current(session,generation,client); if((session.workflowOwner??null)!==workflowId)throw error('工作流已停止或替换', 'CANCELLED'); cacheModule(session.id,id,facts,options); plans.delete(session.id); return moduleView(session.id,id);
    } finally { release(); }
  }
  function saveModuleConfig(accountId, payload) { assertWriter(); exact(payload,['module','config']); adapterFor(payload.module); const saved=moduleSettings.save(accountId,payload.module,payload.config); plans.delete(accountId); moduleCache.delete(accountId); return {accountId,module:payload.module,...saved}; }
  function claimWorkflow(session, runId, { limits = null } = {}) {
    const release = acquire(session, 'operations:WORKFLOW_CLAIM'); release(); const owner={generation:session.generation,client:session.client}; workflowOwners.set(session,owner); session.workflowOwner=runId; session.busy='workflow:'+runId;
    const scope = parentScope(session, runId);
    try { workflowBudgets.set(session.id, { runId, scope, limits: limits === null ? null : normalizeBudgetClaims(limits), context: limits === null ? null : createRunBudgetContext({ scope, limits }) }); } catch (cause) { session.workflowOwner=null; session.busy=null; throw cause; }
    const heldBudget=workflowBudgets.get(session.id);
    return () => { heldBudget.context?.close('STOPPED'); if(workflowOwners.get(session)!==owner || session.generation!==owner.generation || session.client!==owner.client || session.workflowOwner!==runId)return; workflowOwners.delete(session); if(plans.get(session.id)?.workflowId===runId)plans.delete(session.id); session.workflowOwner=null; if(session.busy==='workflow:'+runId)session.busy=null; };
  }
  async function plan(session, payload, { workflowId = null } = {}) {
    exact(payload, ['module', 'mode', 'selections', 'parameters']);
    const { module, mode, selections, parameters = {} } = payload;
    const adapter = Object.hasOwn(modules, module) && (!coreModules.has(module) || module === 'production' || Object.hasOwn(payload,'parameters') || workflowId !== null) ? modules[module] : null;
    const normalizedParameters = adapter?.contractVersion===1 ? validateFunctionParameters(module,adapter,parameters) ?? {} : parameters;
    if ((!adapter && !['orders', 'city', 'combined'].includes(module)) || (!adapter && Object.hasOwn(payload,'parameters')) || !['Manual', 'Hybrid', 'Automatic'].includes(mode)
      || !Array.isArray(selections) || !selections.length || selections.length > 100 || selections.some(id => typeof id !== 'string' || !id || id.length > 300)
      || new Set(selections).size !== selections.length || (mode === 'Manual' && selections.length !== 1)) throw error('模块、模式或操作选择无效；Manual 每次只允许一条', 'INVALID_INPUT', 400);
    const release = acquire(session, 'operations:PLAN', workflowId);
    const generation = session.generation, client = session.client, contextHash=operationDigest(executionContext(session));
    try {
      const config = getConfig(), rules = loadRules(session.id).config;
      const moduleConfig = adapter ? moduleSettings.get(session.id,module).config : null;
      const production = loadProduction(session.id).config;
      const options = { config, rules, mode, productionPolicy: production, player: session.player, signal: session.abort.signal, parameters: normalizedParameters, moduleConfig };
      const facts = await (adapter ? adapter.survey(client,protocol,options) : survey(client,protocol,options));
      current(session, generation, client);
      if((session.workflowOwner??null)!==workflowId || operationDigest(executionContext(session))!==contextHash)throw error('工作流或账号角色/世界身份已变化', 'CANCELLED');
      if (facts.stockReliable !== true || !(facts.stock instanceof Map)) throw error('库存来源不可靠，禁止计划');
      // Both modules share this exact planning ledger. Execution starts a separate conservative ledger.
      const ledger = new ResourceLedger(facts.stock), operations = [];
      if (adapter) {
        const result = adapter.plan(facts,{...options,selections,ledger});
        operations.push(...(result.actions ?? []).filter(op => op.action && selections.includes(op.actionId)).map(op => ({...op,module})));
      }
      if (!adapter && module !== 'city') {
        const orderPlan = orderPlanner(facts, { config, rules, mode, ledger, selections });
        // Planning adapters reserve in order; select the requested subset without charging other orders.
        const wanted = (orderPlan.actions ?? []).filter(action => selections.includes(action.actionId));
        operations.push(...wanted.map(operation => ({ ...operation, module: 'orders' })));
      }
      if (!adapter && module !== 'orders') {
        const candidates = cityViewer(facts, { config }).candidates ?? [];
        const cityIds = selections.filter(id => candidates.some(candidate => candidate.actionId === id));
        if (cityIds.length) {
          const cityPlan = cityPlanner(facts, { config, selections: cityIds, ledger });
          operations.push(...cityPlan.actions.map(operation => ({ ...operation, module: 'city' })));
        }
      }
      if (operations.length !== selections.length || operations.some(action => !selections.includes(action.actionId))) throw error('操作已变化、无法执行或预算不足；请重新采集和选择', 'STALE_PLAN');
      if (mode === 'Hybrid' && operations.some(op => op.actionType === 'SUBMIT') && operations.length !== 1) throw error('Hybrid 提交需逐单授权', 'INVALID_INPUT', 400);
      if (!adapter && mode === 'Automatic') {
        const allowed = selectProductionCandidates(facts, { policy: production, candidates: cityViewer(facts, { config }).candidates });
        if (operations.some(op => op.actionType === 'startProduce' && !allowed.includes(op.actionId))) throw error('自动生产未启用或超出当前账号策略范围', 'PRODUCTION_POLICY_REQUIRED');
      }
      // Keep the server's deterministic dependency order; no caller-supplied request/body is accepted.
      for(const operation of operations)operation.budgetClaims=operationBudgetClaims(operation);
      const budgetClaims=normalizeBudgetClaims({resources:operations.flatMap(action=>action.budgetClaims.resources),quotas:operations.flatMap(action=>action.budgetClaims.quotas),uids:operations.flatMap(action=>action.budgetClaims.uids)});
      const resourceBudget=budgetClaims.resources;
      const createdAt = now(), batchId = randomUUID(), expiresAt = new Date(clock() + 300000).toISOString();
      let parent = null;
      if (workflowId) { parent = workflowBudgets.get(session.id); if (!parent || parent.runId !== workflowId) throw error('工作流父预算不存在', 'RUN_BUDGET_SCOPE_MISMATCH'); if (!parent.context) { parent.limits = stockLimits(facts.stock); parent.context = createRunBudgetContext({scope:parent.scope,limits:parent.limits}); } parent.context.assertScope(parentScope(session,workflowId)); }
      const summary = { ...(parent ? { parentRunId: workflowId, runBudgetIdentity: { scope: clone(parent.scope), limits: clone(parent.limits) } } : {}), batchId, accountId: session.id, module, mode, actions: operations.map(publicAction), resourceBudget, budgetClaims, productionPolicy: production, ...(adapter ? { moduleConfig, parameters: normalizedParameters } : {}), createdAt, expiresAt,
        notes: ['授权仅覆盖本批次具体操作；新订单和新计划需要重新授权', 'UNKNOWN 停止批次并保留预算；不自动重试'] };
      summary.planHash = operationDigest(summary);
      const internal = { contextHash, adapter: Boolean(adapter), dependencyHash: adapter?.dependencyVersions ? operationDigest(adapter.dependencyVersions(options)) : null, public: clone(summary), operations: clone(operations), generation, client, config, workflowId, moduleConfig, moduleHash: adapter ? operationDigest(moduleConfig) : null, configHash: operationDigest(config), productionHash: operationDigest(production), rulesHash: operationDigest(rules), stock: new Map(facts.stock), permit: null };
      plans.set(session.id, internal);
      if(adapter) cacheModule(session.id,module,facts,options); else cache.set(session.id, { view: buildView(session.id, facts, config, rules) });
      return clone(summary);
    } finally { release(); }
  }
  function lookup(session, payload) {
    const entry = plans.get(session.id);
    if (!entry || entry.public.batchId !== payload.batchId || clock() >= Date.parse(entry.public.expiresAt)) throw error('批次不存在或已过期', 'STALE_PLAN');
    current(session, entry.generation, entry.client);
    if(operationDigest(executionContext(session))!==entry.contextHash)throw error('账号角色、世界或连接身份已变化，请重新规划','STALE_PLAN');
    if ((session.workflowOwner ?? null) !== entry.workflowId) throw error('工作流归属已变化，重新规划', 'STALE_PLAN');
    if (entry.workflowId) { const parent=workflowBudgets.get(session.id); if (!parent?.context || parent.runId!==entry.workflowId) throw error('工作流父预算已结束','RUN_BUDGET_CLOSED'); parent.context.assertScope(parentScope(session,entry.workflowId)); if(operationDigest({scope:parent.scope,limits:parent.limits})!==operationDigest(entry.public.runBudgetIdentity))throw error('父预算授权已变化','STALE_PLAN'); }
    if (entry.dependencyHash) { const adapter=modules[entry.public.module]; const versions=adapter.dependencyVersions({config:getConfig(),rules:loadRules(session.id).config,productionPolicy:loadProduction(session.id).config,moduleConfig:moduleSettings.get(session.id,entry.public.module).config,mode:entry.public.mode,parameters:entry.public.parameters??{},player:session.player}); if(operationDigest(versions)!==entry.dependencyHash)throw error('业务相关配置已变化，请重新规划','STALE_PLAN'); return entry; }
    if (entry.moduleHash && operationDigest(moduleSettings.get(session.id,entry.public.module).config) !== entry.moduleHash) throw error('玩法配置已变化，重新规划', 'STALE_PLAN');
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
    const release = acquire(session, 'operations:EXECUTING', entry.workflowId);
    const record = { parentRunId: entry.workflowId ?? null, workflowId: entry.workflowId ?? null, executionContext: executionContext(session), runId: randomUUID(), accountId: session.id, module: entry.public.module, mode: entry.public.mode, startedAt: now(), finishedAt: null,
      authorizationSummary: { batchId: entry.public.batchId, planHash: entry.public.planHash, approvedAt: entry.permit.approvedAt, actionIds: entry.public.actions.map(action => action.actionId), resourceBudget: entry.public.resourceBudget },
      planSummary: entry.public, resourceBudget: entry.public.resourceBudget,
      actions: entry.operations.map(action => ({ ...publicAction(action), ...(modules[action.module] && !modules[action.module].execute ? { dispatchEvidence: { version: 1, contract: RECOVERY_DISPATCH_CONTRACT, state: 'NOT_DISPATCHED' } } : {}), resourceReservation: action.costs, requestStatus: 'NOT_DISPATCHED', result: 'NOT_EXECUTED', afterState: null, timestamp: null })),
      finalStatus: 'EXECUTING', stopReason: null };
    try { history.put(record); } catch (cause) { release(); throw cause; }
    entry.consumed = true; entry.permit = null;
    const run = { record, running: true, stop: { aborted: false }, task: null };
    runs.set(session.id, run);
    const generation = session.generation, client = session.client, signal = session.abort.signal;
    let budget;
    try { const parent=entry.workflowId?workflowBudgets.get(session.id).context:createRunBudgetContext({scope:parentScope(session,record.runId),limits:entry.public.budgetClaims}); const limits=entry.public.budgetClaims; budget={runBudget:parent,scope:parentScope(session,entry.workflowId??record.runId),batchId:entry.public.batchId,limits,ledger:parent.child(entry.stock,{batchId:entry.public.batchId,scope:parentScope(session,entry.workflowId??record.runId),limits})}; record.runBudget=parent.snapshot(); history.put(record); } catch(cause) { record.finalStatus='NOT_EXECUTED';record.stopReason=cause.message;record.finishedAt=now();try{history.put(record);}finally{run.running=false;release();}throw cause; }
    const authorizedCurrent = () => {
      current(session, generation, client);
      if(operationDigest(executionContext(session))!==entry.contextHash)throw error('账号角色、世界或连接身份已变化','NOT_EXECUTED');
      budget.runBudget.assertScope(parentScope(session,entry.workflowId??record.runId));
      if(entry.dependencyHash){ lookup(session,{batchId:entry.public.batchId}); return; }
      if ((session.workflowOwner ?? null) !== entry.workflowId || entry.moduleHash && operationDigest(moduleSettings.get(session.id,entry.public.module).config) !== entry.moduleHash) throw error('玩法配置或工作流归属变化', 'NOT_EXECUTED');
      if (operationDigest(getConfig()) !== entry.configHash || operationDigest(loadRules(session.id).config) !== entry.rulesHash || operationDigest(loadProduction(session.id).config) !== entry.productionHash) throw error('配置或规则变化，当前授权已失效', 'NOT_EXECUTED');
    };
    budget.onReserved = () => { authorizedCurrent(); record.runBudget=budget.runBudget.snapshot(); history.put(record); };
    run.task = Promise.resolve().then(async () => {
      for (let index = 0; index < entry.operations.length; index++) {
        if (run.stop.aborted) { record.finalStatus = 'CANCELLED'; record.stopReason = '用户主动停止；后续操作未发送'; break; }
        current(session, generation, client);
        if (!entry.dependencyHash && operationDigest(loadRules(session.id).config) !== entry.rulesHash) throw error('执行期间规则变化，停止后续操作', 'NOT_EXECUTED');
        const operation = entry.operations[index], row = record.actions[index];
        row.requestStatus = 'DISPATCHING'; row.timestamp = now(); history.put(record);
        const adapter = entry.adapter ? modules[operation.module] : null;
        const executor = adapter ? adapter.execute ?? businessExecute : operation.module === 'orders' ? orderExecute : cityExecute;
        const result = await executor(client, protocol, operation, { config: entry.config, rules: loadRules(session.id).config, player: session.player,
          allowMutate: true, adapter, moduleConfig: entry.moduleConfig, parameters: entry.public.parameters, mode: entry.public.mode, productionPolicy: entry.public.productionPolicy, ...(operation.module === 'city' ? { survey } : {}), budget, signal, stop: run.stop, assertActive: authorizedCurrent, assertCurrent: authorizedCurrent,
          ...(executor === businessExecute ? { onStage(stage) {
            if (!BUSINESS_EXECUTION_STAGES.includes(stage)) throw error('执行证据阶段无效', 'HISTORY_UNAVAILABLE');
            if (stage === 'DISPATCH_INTENT') row.dispatchEvidence = { version: 1, contract: RECOVERY_DISPATCH_CONTRACT, state: 'MAY_HAVE_DISPATCHED' };
            // Store only the fixed stage token and a service-owned timestamp; no payloads.
            (row.stages ??= []).push({ stage, timestamp: now() });
            history.put(record);
          }, onVerifiedReceipt(candidate, before, after, response) {
            const receipt = buildVerifiedReceipt(candidate, before, after, response, record.executionContext);
            if (receipt) { row.verifiedReceipt = receipt; history.put(record); }
          } } : {}) });
        if (operation.module === 'formation') {
          formationProofs.delete(session.id);
          if (result.status === 'SUCCESS' && result.verification?.status === 'CONFIRMED') formationProofs.set(session.id, { generation, client, operation: clone(operation), batchId: entry.public.batchId, planHash: entry.public.planHash });
        }
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
      const success=record.finalStatus==='SUCCESS', standaloneSuccess=success&&!entry.workflowId;
      record.runBudget=success?{...budget.runBudget.snapshot(),...(standaloneSuccess?{state:'CLOSED',outcome:'SUCCESS'}:{})}:budget.runBudget.close(['UNKNOWN','CANCELLED','RATE_LIMITED','FAILED'].includes(record.finalStatus)?record.finalStatus:'STOPPED');
      try { history.put(record); if(standaloneSuccess)budget.runBudget.close('SUCCESS'); }
      catch (cause) { record.finalStatus = 'UNKNOWN'; record.stopReason = cause.message; record.runBudget=budget.runBudget.close('UNKNOWN'); }
      run.running = false; release();
    });
    return { runId: record.runId, status: 'EXECUTING' };
  }
  async function assertFormationReady(session, requested, { alreadyLocked = false } = {}) {
    if (requested?.enabled !== true) return null;
    const release = alreadyLocked ? () => {} : acquire(session, 'operations:FORMATION_PREFLIGHT'), generation = session.generation, client = session.client;
    try {
      const adapter=adapterFor('formation'), moduleConfig=moduleSettings.get(session.id,'formation').config;
      if(moduleConfig.enabled!==true || moduleConfig.mainlineEnabled!==true) throw error('请启用本账号阵容及主线组合', 'FORMATION_REQUIRED');
      const proof=formationProofs.get(session.id);
      if(!proof || proof.generation!==generation || proof.client!==client || proof.operation.target.presetId!==requested.presetId) throw error('先预览、授权保存目标阵容并完成复读，再启动主线', 'FORMATION_REQUIRED');
      const facts=await adapter.survey(client,protocol,{config:getConfig(),player:session.player,signal:session.abort.signal}); current(session,generation,client);
      const formationKey=value=>operationDigest({...value,heroPositions:[...value.heroPositions].sort((a,b)=>a.heroId.localeCompare(b.heroId))});
      if(facts.reliability?.formation!==true || formationKey(facts.formation)!==formationKey(proof.operation.action.body.formation)) throw error('当前阵容已变化，请重新保存授权', 'FORMATION_CHANGED');
      cacheModule(session.id,'formation',facts,{moduleConfig,config:getConfig()});
      return {confirmed:true,presetId:requested.presetId,formation:clone(facts.formation),client,playerId:session.player?.playerId,checkedAt:clock(),batchId:proof.batchId,planHash:proof.planHash};
    } finally { release(); }
  }

  function recoveryRow(accountId, runId, actionId) {
    const matches = history.list(accountId).filter(run => run.runId === runId);
    const run = matches[0], rows = run?.actions.filter(row => row.actionId === actionId) ?? [];
    if (matches.length !== 1 || rows.length !== 1 || !actionNeedsReconciliation(run, rows[0])) throw error('待复核历史不存在、不唯一或已解决', 'STALE_RECOVERY');
    return { run, row: rows[0], digest: operationDigest(run) };
  }
  async function previewRecovery(session, payload) {
    exact(payload, ['runId', 'actionId']);
    if (typeof payload.runId !== 'string' || typeof payload.actionId !== 'string') throw error('复核需要精确批次及动作', 'INVALID_INPUT', 400);
    const release = acquire(session, 'operations:RECOVERY_READ', null, { recoveryRead: true }), generation = session.generation, client = session.client;
    try {
      const selected = recoveryRow(session.id, payload.runId, payload.actionId), context = executionContext(session);
      const assertContext = () => { current(session, generation, client); if (operationDigest(executionContext(session)) !== operationDigest(context)) throw error('复核身份已变化', 'CANCELLED'); };
      const result = await recoveryCollect(client, protocol, selected.run, selected.row, { context, clock, signal: session.abort.signal, assertCurrent: assertContext });
      assertContext();
      if (recoveryRow(session.id, payload.runId, payload.actionId).digest !== selected.digest) throw error('历史在复读期间变化', 'STALE_RECOVERY');
      const preview = { previewId: randomUUID(), accountId: session.id, runId: payload.runId, actionId: payload.actionId, result, expiresAt: new Date(clock() + 60000).toISOString(), originalStatus: selected.run.finalStatus };
      preview.previewHash = operationDigest(preview);
      recoveryPreviews.set(session.id, { public: clone(preview), digest: selected.digest, generation, client, context });
      return clone(preview);
    } finally { release(); }
  }
  async function confirmRecovery(session, payload) {
    exact(payload, ['previewId', 'previewHash', 'confirm']);
    const entry = recoveryPreviews.get(session.id);
    if (!entry || payload.confirm !== true || entry.public.previewId !== payload.previewId || entry.public.previewHash !== payload.previewHash || clock() >= Date.parse(entry.public.expiresAt)) throw error('必须确认当前只读复核预览；已过期或不匹配', 'STALE_RECOVERY');
    const release = acquire(session, 'operations:RECOVERY_CONFIRM', null, { recoveryRead: true });
    try {
      const assertContext = () => { current(session, entry.generation, entry.client); if (operationDigest(executionContext(session)) !== operationDigest(entry.context)) throw error('复核身份已变化', 'STALE_RECOVERY'); };
      assertContext();
      const selected = recoveryRow(session.id, entry.public.runId, entry.public.actionId);
      if (selected.digest !== entry.digest) throw error('复核历史已变化', 'STALE_RECOVERY');
      const result = await recoveryCollect(entry.client, protocol, selected.run, selected.row, { context: entry.context, clock, signal: session.abort.signal, assertCurrent: assertContext });
      assertContext();
      const proof = value => ({ status: value.status, reasonCode: value.evidence.reasonCode, scope: value.evidence.scope, observation: value.evidence.observation });
      if (operationDigest(proof(result)) !== operationDigest(proof(entry.public.result)) || recoveryRow(session.id, entry.public.runId, entry.public.actionId).digest !== entry.digest) throw error('确认时权威证据或历史变化，请重新预览', 'STALE_RECOVERY');
      if (clock() >= Date.parse(entry.public.expiresAt)) throw error('只读复核已过期，请重新预览', 'STALE_RECOVERY');
      const event = history.appendReconciliation(session.id, selected.run.runId, selected.row.actionId, { status: result.status, timestamp: now(), evidence: { ...result.evidence, previewId: entry.public.previewId, previewHash: entry.public.previewHash } });
      recoveryPreviews.delete(session.id); plans.delete(session.id); formationProofs.delete(session.id);
      const live = runs.get(session.id);
      if (live?.record.runId === selected.run.runId) live.record = history.list(session.id).find(run => run.runId === selected.run.runId);
      return { accountId: session.id, runId: selected.run.runId, actionId: selected.row.actionId, event, status: status(session.id), note: '保留原始结果及预算；复核不会重发、重用授权或自动恢复任务。连接未决指纹仍需安全重连。' };
    } finally { release(); }
  }

  function formationContext(accountId) { return { facts: clone(moduleFacts.get(accountId)?.formation ?? null), moduleConfig: moduleSettings.get(accountId,'formation').config }; }
  function stop(accountId) { const run = runs.get(accountId); if (run?.running) run.stop.aborted = true; return status(accountId); }
  return { closeWorkflowBudget(accountId,runId,outcome='STOPPED') { const parent=workflowBudgets.get(accountId); if(parent?.runId===runId)return parent.context?.close(outcome)??null;return null; }, workflowBudget: accountId => workflowBudgets.get(accountId)?.context?.snapshot() ?? null, previewRecovery, confirmRecovery, view, survey: surveyAccount, moduleView, surveyModule, saveModuleConfig, claimWorkflow, assertFormationReady, formationContext, modules, plan, authorize, execute, stop, status,
    history: (accountId, runId) => { const all = history.list(accountId); return { accountId, runs: all.filter(run => !runId || run.runId === runId), dailyReport: summarizeProductionHistory(all, { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(clock())), timeZone: 'Asia/Shanghai' }) }; },
    productionPolicy: accountId => ({ accountId, ...loadProduction(accountId) }),
    saveProductionPolicy: (accountId, payload) => { assertWriter(); exact(payload, ['config']); const result = saveProduction(accountId, payload.config); plans.delete(accountId); cache.delete(accountId); return { accountId, ...result }; },
    blocked: accountId => Boolean(runs.get(accountId) && runHasUnresolvedWrites(runs.get(accountId).record)) || history.unresolved(accountId), running: accountId => Boolean(runs.get(accountId)?.running),
    settle: accountId => runs.get(accountId)?.task ?? Promise.resolve(),
  };
}
