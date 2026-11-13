import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { toSnapshotJson } from './game.mjs';
import { redact } from './security.mjs';
import { normalizeBudgetClaims } from './resource-ledger.mjs';
import { validateFunctionParameters } from './function-contracts.mjs';
import { actionNeedsReconciliation } from './execution-history.mjs';

export const WORKFLOW_LIMITS = Object.freeze({ nodes: 50, edges: 100, steps: 200, waitMs: 60000, bytes: 131072 });
const TYPES = new Set(['START','SURVEY','CONDITION','RULE','ACTION','WAIT','VERIFY','BRANCH','STOP']);
const ACTIVE = new Set(['STARTING','RUNNING','WAITING','AWAITING_AUTHORIZATION']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.trim().length > 0;
const copy = value => structuredClone(value);
const fail = (message, code = 'WORKFLOW_INVALID') => Object.assign(new Error(message), { code, statusCode: 400 });
const forbidden = new Set(['__proto__','prototype','constructor','request','body','costs','permit','permitid','authorization','authorizationheader','credentials','credential','password','token','sign','login','loginframehex','wsurl','url','javascript','script','code','eval']);
function exact(value, keys, label) { if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) throw fail(label + ' 包含未知字段'); }
function json(value, depth = 0) {
  if (depth > 8) throw fail('业务参数嵌套过深');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw fail('非有限数值'); return; }
  if (typeof value === 'string') { if (value.length > 2000) throw fail('文本过长'); return; }
  if (Array.isArray(value)) { if (value.length > 100) throw fail('数组过长'); value.forEach(item => json(item, depth + 1)); return; }
  if (!plain(value) || Object.keys(value).length > 50) throw fail('业务参数必须是有限 JSON');
  for (const [key, item] of Object.entries(value)) { if (forbidden.has(key.toLowerCase())) throw fail('工作流禁止传输、凭证、脚本及授权参数'); json(item, depth + 1); }
}
function registryOf(options) { const candidate = options?.modules ?? options?.registry ?? options; return candidate instanceof Map ? candidate : new Map(Object.entries(candidate ?? {})); }
function registered(registry, id, type) {
  const module = registry.get(id);
  if (!text(id) || !module || module.id !== id || typeof module.survey !== 'function' || typeof module.view !== 'function' || typeof module.plan !== 'function' || typeof module.verify !== 'function') throw fail('节点引用未注册的业务模块');
  return module;
}
function condition(value) {
  exact(value, ['source','path','operator','value'], '条件');
  if (!['survey','run'].includes(value.source) || !Array.isArray(value.path) || !value.path.length || value.path.length > 8 || value.path.some(key => !text(key) || forbidden.has(key.toLowerCase())) || !['EQ','NE','GT','GTE','LT','LTE','EXISTS'].includes(value.operator)) throw fail('条件必须使用受支持的事实路径和比较器');
  if (value.operator !== 'EXISTS' && !Object.hasOwn(value, 'value')) throw fail('条件比较值缺失');
  if (Object.hasOwn(value, 'value')) { if (value.value !== null && !['string','number','boolean'].includes(typeof value.value)) throw fail('条件比较值必须是标量'); json(value.value); }
}
export function validateWorkflow(input, options = {}) {
  exact(input, ['version','id','name','nodes','edges','budget'], '工作流');
  if (input.version !== 1 || !text(input.id) || input.id.length > 100 || !text(input.name) || input.name.length > 160 || !Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > WORKFLOW_LIMITS.nodes || !Array.isArray(input.edges) || input.edges.length > WORKFLOW_LIMITS.edges) throw fail('工作流版本、身份或图大小无效');
  const registry = registryOf(options); let graph; try { graph = copy(input); } catch { throw fail('工作流必须为可复制的 JSON'); } const nodes = new Map();
  if (graph.budget !== undefined) { try { graph.budget=normalizeBudgetClaims(graph.budget); } catch { throw fail('工作流预算必须为有限资源/配额/UID上限'); } }
  const fields = {
    START: [], STOP: [], BRANCH: [], WAIT: ['durationMs'], SURVEY: ['module','parameters'], ACTION: ['module','parameters','selection'],
    CONDITION: ['condition'], RULE: ['condition'], VERIFY: ['module','condition'],
  };
  for (const node of graph.nodes) {
    if (!plain(node) || !TYPES.has(node.type) || !text(node.id) || node.id.length > 100 || nodes.has(node.id)) throw fail('节点类型或唯一 ID 无效');
    exact(node, ['id','type','label',...fields[node.type]], '节点');
    if (node.label !== undefined && (!text(node.label) || node.label.length > 160)) throw fail('节点标签无效');
    if (['SURVEY','ACTION'].includes(node.type) || node.module !== undefined) registered(registry, node.module, node.type);
    if (node.parameters !== undefined) { if (!plain(node.parameters)) throw fail('业务参数必须为对象'); json(node.parameters); }
    if (['SURVEY','ACTION'].includes(node.type)) { const adapter=registry.get(node.module); if(adapter?.contractVersion===1) validateFunctionParameters(node.module,adapter,node.parameters??{}); }
    if (node.type === 'ACTION') {
      if (typeof node.selection === 'string') { if (!text(node.selection) || node.selection.length > 1000) throw fail('操作选择无效'); }
      else if (plain(node.selection) && node.selection.unique === true) { exact(node.selection, ['unique'], '唯一候选选择'); }
      else { exact(node.selection, ['actionId'], '操作选择'); if (!text(node.selection.actionId) || node.selection.actionId.length > 1000) throw fail('缺少明确操作 ID'); }
    }
    if (['CONDITION','RULE'].includes(node.type) || node.condition !== undefined) condition(node.condition);
    if (node.type === 'WAIT' && (!Number.isSafeInteger(node.durationMs) || node.durationMs < 0 || node.durationMs > WORKFLOW_LIMITS.waitMs)) throw fail('WAIT 必须为 0–60000 毫秒');
    nodes.set(node.id, node);
  }
  const starts = graph.nodes.filter(node => node.type === 'START');
  if (starts.length !== 1 || !graph.nodes.some(node => node.type === 'STOP')) throw fail('必须恰好一个 START 且至少一个 STOP');
  const outgoing = new Map(graph.nodes.map(node => [node.id, []])), incoming = new Map(graph.nodes.map(node => [node.id, 0])), seen = new Set();
  for (const edge of graph.edges) {
    exact(edge, ['from','to','when'], '边');
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || !['ALWAYS','PASS','FAIL'].includes(edge.when ?? 'ALWAYS')) throw fail('边引用无效节点或条件');
    const key = edge.from + ':' + (edge.when ?? 'ALWAYS'); if (seen.has(key)) throw fail('同一节点的出口条件不得重复'); seen.add(key);
    outgoing.get(edge.from).push(edge); incoming.set(edge.to, incoming.get(edge.to) + 1);
  }
  if (incoming.get(starts[0].id) !== 0) throw fail('START 不得有入边');
  for (const node of graph.nodes) {
    const edges = outgoing.get(node.id);
    if (node.type === 'STOP') { if (edges.length) throw fail('STOP 不得有出边'); }
    else if (node.type === 'BRANCH' || ['CONDITION','RULE'].includes(node.type) && edges.length === 2) {
      if (edges.length !== 2 || !edges.some(edge => edge.when === 'PASS') || !edges.some(edge => edge.when === 'FAIL')) throw fail('分支必须恰好有 PASS/FAIL 出口');
    } else {
      if (edges.length !== 1 || (edges[0].when ?? 'ALWAYS') !== 'ALWAYS') throw fail('普通节点必须有一个无条件出口');
      if (['CONDITION','RULE'].includes(node.type) && nodes.get(edges[0].to).type !== 'BRANCH') throw fail('条件结果必须通过显式分支消费');
    }
  }
  const visited = new Set(), visiting = new Set(), order = [];
  function visit(id) { if (visiting.has(id)) throw fail('工作流禁止循环'); if (visited.has(id)) return; visiting.add(id); for (const edge of outgoing.get(id)) visit(edge.to); visiting.delete(id); visited.add(id); order.unshift(id); }
  visit(starts[0].id);
  if (visited.size !== nodes.size) throw fail('工作流不得包含不可达节点');
  let bytes; try { bytes = Buffer.byteLength(JSON.stringify(graph)); } catch { throw fail('工作流必须可序列化'); }
  if (bytes > WORKFLOW_LIMITS.bytes) throw fail('工作流过大');
  return { valid: true, workflow: graph, order };
}
export function evaluateWorkflowCondition(rule, context = {}) {
  condition(rule);
  let value = context[rule.source];
  for (const key of rule.path) { if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return { status: 'UNKNOWN', reason: '条件事实路径缺失' }; value = value[key]; }
  if (value === undefined || typeof value === 'number' && !Number.isFinite(value)) return { status: 'UNKNOWN', reason: '条件事实不可靠' };
  if (rule.operator === 'EXISTS') return value === null ? { status: 'UNKNOWN', reason: '条件事实为null，无法确认' } : { status: 'PASS', reason: '权威事实存在' };
  if (value !== null && !['string','number','boolean'].includes(typeof value) || typeof value !== typeof rule.value) return { status: 'UNKNOWN', reason: '条件类型不一致' };
  let result;
  switch (rule.operator) { case 'EQ': result = value === rule.value; break; case 'NE': result = value !== rule.value; break; default: if (typeof value !== 'number' || !Number.isFinite(rule.value)) return { status: 'UNKNOWN', reason: '排序比较只接受可靠数值' }; result = rule.operator === 'GT' ? value > rule.value : rule.operator === 'GTE' ? value >= rule.value : rule.operator === 'LT' ? value < rule.value : value <= rule.value; }
  return { status: result ? 'PASS' : 'FAIL', reason: result ? '条件满足' : '条件不满足' };
}
export function simulateWorkflow(graph, options = {}) {
  const validated = validateWorkflow(graph, options), byId = new Map(validated.workflow.nodes.map(node => [node.id, node]));
  return { status: 'SIMULATED', workflowId: graph.id, runtimeCreated: false, requestsSent: 0,
    trace: validated.order.map(id => { const node = byId.get(id); return { nodeId: id, type: node.type, module: node.module ?? null, requiresAuthorization: node.type === 'ACTION', result: node.condition ? evaluateWorkflowCondition(node.condition, options.facts ?? {}).status : node.type === 'ACTION' ? 'AWAITING_AUTHORIZATION' : 'STATIC', durationMs: node.durationMs ?? 0 }; }) };
}
function confirmedRun(run, plan, accountId) {
  if (!run || run.accountId !== accountId || run.finalStatus !== 'SUCCESS' || !text(run.finishedAt) || !Array.isArray(run.actions) || !Array.isArray(plan.actions) || !run.actions.length || run.actions.length !== plan.actions.length) return false;
  const ids = plan.actions.map(action => action.actionId);
  if (new Set(ids).size !== ids.length || new Set(run.actions.map(action => action.actionId)).size !== run.actions.length) return false;
  if (run.planSummary?.batchId !== plan.batchId && run.authorizationSummary?.batchId !== plan.batchId) return false;
  if (run.planSummary?.batchId && run.planSummary.batchId !== plan.batchId || run.authorizationSummary?.batchId && run.authorizationSummary.batchId !== plan.batchId || run.planSummary?.planHash && run.planSummary.planHash !== plan.planHash) return false;
  return run.actions.every(action => ids.includes(action.actionId) && action.result === 'SUCCESS' && (action.verification === 'CONFIRMED' || action.verification?.confirmed === true || action.verification?.status === 'CONFIRMED'));
}
export function createWorkflowRunner({ operations, getSession, modules, isCurrent, signal, clock = Date.now, claim = () => true, release = () => {}, onUpdate = () => {} } = {}) {
  if (!operations || typeof operations.surveyModule !== 'function' || typeof operations.plan !== 'function' || typeof operations.history !== 'function' || typeof getSession !== 'function') throw fail('工作流缺少已注册的操作服务');
  let context = null, task = null, starting = false, resuming = false, finishing = false;
  const now = () => new Date(clock()).toISOString();
  function getStatus() { if (!context) return { status: 'IDLE', running: false }; const parent=operations.workflowBudget?.(context.accountId); if(parent?.scope.runId===context.runId)context.runBudget=parent; return copy({ runId: context.runId, accountId: context.accountId, workflowId: context.graph.id, status: context.status, running: ACTIVE.has(context.status), currentNode: context.nodeId, steps: context.steps, startedAt: context.startedAt, finishedAt: context.finishedAt, reason: context.reason, plan: context.waitingPlan, lastRun: context.lastRun ? { runId: context.lastRun.runId, finalStatus: context.lastRun.finalStatus, finishedAt: context.lastRun.finishedAt } : null, trace: context.trace, ...(operations.workflowBudget ? {runBudget:context.runBudget??null} : {}) }); }
  // Capture both owners: the Console session and the existing client's live
  // connection facts. Reusing a client must never inherit an old workflow.
  const connectionScope = session => [session.id, session.connectionId, session.client?.factContext?.accountId, session.client?.factContext?.generation, session.client?.factContext?.connectionId];
  const roleScope = session => [session.player?.playerId, session.player?.worldId].map(value => { const normalized=toSnapshotJson(value); return typeof normalized==='number'||typeof normalized==='string'?String(normalized):JSON.stringify(normalized); });
  function current(ctx) {
    if (ctx.cancel.signal.aborted || signal?.aborted || context !== ctx || ![...ACTIVE].includes(ctx.status) || ctx.session.abort?.signal?.aborted) throw fail('工作流已取消或账号会话失效', 'CANCELLED');
    if (ctx.session.generation !== ctx.generation || ctx.session.client !== ctx.client || ctx.client?.connected === false || ctx.session.abort?.signal !== ctx.sessionSignal || connectionScope(ctx.session).some((value,index) => value !== ctx.connectionScope[index]) || roleScope(ctx.session).some((value,index) => value !== ctx.roleScope[index]) || isCurrent && isCurrent(ctx.session, ctx.generation, ctx.client) === false) throw fail('账号会话或连接已切换', 'CANCELLED');
  }
  async function relinquish(ctx) { if (!ctx.claimed) return; ctx.claimed = false; if (ctx.releaseClaim) await ctx.releaseClaim(); else await release(ctx.accountId, ctx.runId); }
  async function finish(ctx, status, reason) {
    finishing=true;
    ctx.status=status; ctx.reason=reason; ctx.finishedAt=now(); ctx.waitingPlan=null;
    signal?.removeEventListener('abort',ctx.externalAbort); ctx.sessionSignal?.removeEventListener('abort',ctx.externalAbort);
    // Close the parent immediately but retain the owner until its operation settles.
    const outcome={COMPLETED:'SUCCESS',UNKNOWN:'UNKNOWN',CANCELLED:'CANCELLED',FAILED:'FAILED'}[status]??'STOPPED';
    const parent=operations.closeWorkflowBudget?.(ctx.accountId,ctx.runId,outcome); if(parent)ctx.runBudget=parent;
    if(operations.running?.(ctx.accountId)){operations.stop?.(ctx.accountId);await operations.settle(ctx.accountId);}
    try{await onUpdate(getStatus());}catch{ctx.status='FAILED';ctx.reason='工作流持久化失败；已停止所有后续节点';}
    try{await relinquish(ctx);}catch{ctx.status='FAILED';ctx.reason='账号工作流锁释放失败';}finally{finishing=false;}
  }
  function cancelled(ctx, promise) {
    const observed = Promise.resolve(promise); let listener;
    const aborted = new Promise((_, reject) => { listener = () => reject(fail('工作流已取消', 'CANCELLED')); ctx.cancel.signal.addEventListener('abort', listener, { once: true }); if (ctx.cancel.signal.aborted || signal?.aborted) listener(); });
    return Promise.race([observed, aborted]).finally(() => ctx.cancel.signal.removeEventListener('abort', listener));
  }
  function next(ctx, result = 'ALWAYS') { const edges = ctx.graph.edges.filter(edge => edge.from === ctx.nodeId), edge = edges.find(entry => entry.when === result) ?? edges.find(entry => (entry.when ?? 'ALWAYS') === 'ALWAYS'); if (!edge) throw fail('工作流出口未匹配', 'WORKFLOW_UNKNOWN'); return edge.to; }
  async function trace(ctx, node, result, evidence = {}) { ctx.trace.push({ nodeId: node.id, type: node.type, result, timestamp: now(), ...(node.module ? {module:node.module} : {}), ...evidence }); await onUpdate(getStatus()); }
  async function advance(ctx) {
    try {
      ctx.status = 'RUNNING';
      while (true) {
        current(ctx); if (++ctx.steps > WORKFLOW_LIMITS.steps) throw fail('工作流步骤上限已达到', 'WORKFLOW_UNKNOWN');
        const node = ctx.graph.nodes.find(entry => entry.id === ctx.nodeId);
        if (node.type === 'STOP') { await trace(ctx, node, 'STOP'); await finish(ctx, 'COMPLETED', ctx.trace.some(row => row.result.startsWith('BLOCKED_')) ? '工作流到达 STOP；含未执行的阻塞节点，详情见 trace' : '工作流到达 STOP'); break; }
        if (node.type === 'START') { await trace(ctx, node, 'START'); ctx.nodeId = next(ctx); continue; }
        if (node.type === 'SURVEY') { ctx.survey = await cancelled(ctx, operations.surveyModule(ctx.session, node.module, copy(node.parameters ?? {}), { workflowId: ctx.runId })); current(ctx); ctx.surveyModule = node.module; await trace(ctx, node, 'SURVEYED'); ctx.nodeId = next(ctx); continue; }
        if (node.type === 'ACTION') {
          ctx.lastPlan = null; ctx.lastRun = null; ctx.lastActionModule = null;
          operations.bindWorkflowNode?.(ctx.session,ctx.runId,{workflowId:ctx.graph.id,nodeId:node.id});
          let selectedId = typeof node.selection === 'string' ? node.selection : node.selection.actionId;
          if (node.selection?.unique === true) {
            const surveyed = await cancelled(ctx, operations.surveyModule(ctx.session, node.module, copy(node.parameters ?? {}), { workflowId: ctx.runId })); current(ctx);
            if (surveyed?.accountId !== ctx.accountId || surveyed.module !== node.module || !Array.isArray(surveyed.view?.candidates)) throw fail('唯一候选缺少同账号同模块调查', 'WORKFLOW_UNKNOWN');
            ctx.survey = surveyed; ctx.surveyModule = node.module;
            const candidates = surveyed.view.candidates.filter(row => row.executable === true);
            if (!candidates.length) {
              const blockedReasons = [...new Set(surveyed.view.candidates.map(row => row.blockedReason).filter(reason => text(reason) && reason.length <= 512))].slice(0,50);
              await trace(ctx, node, 'BLOCKED_NO_EXECUTABLE_CANDIDATE', {blockedReasons:blockedReasons.length?blockedReasons:['NO_EXECUTABLE_CANDIDATE']}); ctx.nodeId = next(ctx); continue;
            }
            if (candidates.length !== 1 || !text(candidates[0].actionId)) throw fail('存在多个候选或候选身份不明；须选择明确操作', 'WORKFLOW_UNKNOWN');
            selectedId = candidates[0].actionId;
          }
          let plan;
          try { plan = await cancelled(ctx, operations.plan(ctx.session, { module: node.module, mode: 'Manual', selections: [selectedId], parameters: copy(node.parameters ?? {}) }, { workflowId: ctx.runId })); current(ctx); }
          catch (error) {
            current(ctx);
            if (node.selection?.unique === true && error.code === 'REJECTION_MEMORY_ACTIVE') { await trace(ctx, node, 'BLOCKED_REJECTION_MEMORY', {actionId:selectedId,blockedReasons:['REJECTION_MEMORY_ACTIVE']}); ctx.nodeId = next(ctx); continue; }
            throw error;
          }
          if (!plain(plan) || !text(plan.batchId) || plan.accountId !== ctx.accountId || !Array.isArray(plan.actions) || plan.actions.length !== 1 || !text(plan.actions[0].actionId)) throw fail('操作服务未返回可单次确认的账号计划', 'WORKFLOW_UNKNOWN');
          if (plan.actions[0].actionId !== selectedId || plan.module && plan.module !== node.module) throw fail('计划与工作流精确操作选择不一致', 'WORKFLOW_UNKNOWN');
          ctx.waitingPlan = copy(plan); ctx.lastPlan = copy(plan); ctx.lastActionModule = node.module; ctx.status = 'AWAITING_AUTHORIZATION'; ctx.reason = '须由用户单次授权并执行当前具体计划'; await trace(ctx, node, 'AWAITING_AUTHORIZATION', {actionId:selectedId,batchId:plan.batchId,...(plan.planHash?{planHash:plan.planHash}:{})}); break;
        }
        if (node.type === 'WAIT') { ctx.status = 'WAITING'; let timer; try { await cancelled(ctx, new Promise(resolve => { timer = setTimeout(resolve, node.durationMs); })); } finally { clearTimeout(timer); } ctx.status = 'RUNNING'; current(ctx); await trace(ctx, node, 'WAITED'); ctx.nodeId = next(ctx); continue; }
        if (node.type === 'BRANCH') { if (!['PASS','FAIL'].includes(ctx.lastResult)) throw fail('分支缺少已验证的条件结果', 'WORKFLOW_UNKNOWN'); await trace(ctx, node, ctx.lastResult); ctx.nodeId = next(ctx, ctx.lastResult); continue; }
        if (node.type === 'VERIFY' && !node.condition) {
          if (!ctx.lastPlan || !confirmedRun(ctx.lastRun, ctx.lastPlan, ctx.accountId) || node.module && node.module !== ctx.lastActionModule) throw fail('VERIFY 缺少当前批次成功且确认的执行历史', 'WORKFLOW_UNKNOWN');
          ctx.lastResult = 'PASS'; await trace(ctx, node, 'CONFIRMED'); ctx.nodeId = next(ctx); continue;
        }
        if (node.condition) {
          const result = evaluateWorkflowCondition(node.condition, { survey: ctx.survey, run: ctx.lastRun });
          if (result.status === 'UNKNOWN') throw fail(result.reason, 'WORKFLOW_UNKNOWN');
          if (node.type === 'VERIFY' && result.status !== 'PASS') throw fail('VERIFY 条件未确认成功', 'WORKFLOW_UNKNOWN');
          ctx.lastResult = result.status; await trace(ctx, node, result.status); ctx.nodeId = next(ctx, result.status); continue;
        }
        throw fail('节点未通过静态注册验证', 'WORKFLOW_UNKNOWN');
      }
    } catch (error) { await finish(ctx, error.code === 'CANCELLED' ? 'CANCELLED' : error.code === 'WORKFLOW_UNKNOWN' ? 'UNKNOWN' : 'FAILED', error.code === 'CANCELLED' ? '工作流已停止或账号会话失效' : error.message); }
    return getStatus();
  }
  async function start(accountId, graph) {
    if (starting || finishing || context && ACTIVE.has(context.status)) throw fail('账号工作流尚未结束', 'WORKFLOW_BUSY');
    if (!text(accountId)) throw fail('工作流必须绑定精确账号 ID');
    const validated = validateWorkflow(graph, { modules }); starting = true;
    try {
      const session = await getSession(accountId); if (!session || session.id !== accountId) throw fail('工作流账号会话不存在');
      const ctx = { accountId, session, generation: session.generation, client: session.client, connectionScope: connectionScope(session), roleScope: roleScope(session), sessionSignal: session.abort?.signal, runId: randomUUID(), graph: validated.workflow, nodeId: validated.workflow.nodes.find(node => node.type === 'START').id, status: 'STARTING', steps: 0, startedAt: now(), finishedAt: null, reason: null, trace: [], waitingPlan: null, lastRun: null, lastPlan: null, cancel: new AbortController(), claimed: false };
      context = ctx; ctx.externalAbort = () => { ctx.cancel.abort(); if (ctx.status === 'AWAITING_AUTHORIZATION') task = finish(ctx, 'CANCELLED', '外部信号或账号会话已取消工作流').then(getStatus); }; signal?.addEventListener('abort', ctx.externalAbort, { once: true }); ctx.sessionSignal?.addEventListener('abort', ctx.externalAbort, { once: true });
      try { current(ctx); const lock = await claim(accountId, ctx.runId, {limits:ctx.graph.budget??null}); if (lock === false) throw fail('账号已有互斥任务', 'WORKFLOW_BUSY'); ctx.claimed = true; ctx.releaseClaim = typeof lock === 'function' ? lock : null; current(ctx); await onUpdate(getStatus()); current(ctx); }
      catch (error) { await finish(ctx, error.code === 'CANCELLED' ? 'CANCELLED' : 'FAILED', error.message); throw error; }
      task = advance(ctx); return await task;
    } finally { starting = false; }
  }
  function stop() { if (!context || !ACTIVE.has(context.status)) return getStatus(); const ctx = context; ctx.cancel.abort(); if (ctx.status === 'AWAITING_AUTHORIZATION') task = finish(ctx, 'CANCELLED', '用户已停止工作流；不会消费或继承计划授权').then(getStatus); return getStatus(); }
  async function resume(...args) {
    if (args.length) throw fail('resume 不接受外部运行结果或授权');
    if (resuming) throw fail('工作流正在核对当前批次结果', 'WORKFLOW_BUSY');
    const ctx = context;
    if (!ctx || ctx.status !== 'AWAITING_AUTHORIZATION' || !ctx.waitingPlan) throw fail('工作流当前没有等待用户执行的计划');
    resuming = true;
    try {
      current(ctx);
      const result = await cancelled(ctx, Promise.resolve().then(() => operations.history(ctx.accountId)));
      current(ctx);
      const runs = Array.isArray(result?.runs) ? result.runs : [];
      const matches = runs.filter(run => run.accountId === ctx.accountId && (run.planSummary?.batchId === ctx.waitingPlan.batchId || run.authorizationSummary?.batchId === ctx.waitingPlan.batchId));
      if (!matches.length || matches.length === 1 && !matches[0].finishedAt && ['EXECUTING','VERIFY','RESOURCE_PREFLIGHT'].includes(matches[0].finalStatus)) {
        ctx.reason = '当前批次尚无已完成执行历史；继续等待用户授权与执行';
        await onUpdate(getStatus());
        return getStatus();
      }
      const refused = matches.length === 1 ? matches[0] : null;
      if (refused?.finalStatus === 'REJECTED' && text(refused.finishedAt) &&
          refused.planSummary?.batchId === ctx.waitingPlan.batchId && refused.planSummary?.planHash === ctx.waitingPlan.planHash &&
          Array.isArray(refused.actions) && refused.actions.length === 1 &&
          refused.actions[0].actionId === ctx.waitingPlan.actions[0].actionId && refused.actions[0].result === 'REJECTED' &&
          refused.actions[0].requestStatus === 'REJECTED' && refused.actions[0].unresolvedWrite === false) {
        ctx.lastRun = copy(refused);
        await finish(ctx, 'FAILED', '当前批次确定拒绝；共享拒绝记忆保留，停止后续执行');
        return getStatus();
      }
      if (matches.length !== 1 || !confirmedRun(matches[0], ctx.waitingPlan, ctx.accountId)) {
        await finish(ctx, 'UNKNOWN', '当前同批次执行未同时满足 SUCCESS 与 CONFIRMED，停止工作流');
        return getStatus();
      }
      ctx.lastRun = copy(matches[0]); ctx.waitingPlan = null; ctx.status = 'RUNNING'; ctx.reason = null;
      ctx.nodeId = next(ctx); await onUpdate(getStatus()); current(ctx); task = advance(ctx); return await task;
    } catch (error) {
      await finish(ctx, error.code === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN', '无法确认或持久化当前批次执行历史，工作流已停止');
      return getStatus();
    } finally { resuming = false; }
  }
  function getLiveRunId() {
    if (!context?.claimed) return null;
    try { current(context); return context.runId; } catch { return null; }
  }
  return { start, getStatus, getLiveRunId, stop, resume, settle: async () => { if (task) await task; return getStatus(); } };
}

const historyId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value;
const ids = (rows, pick) => {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100) return null;
  const values = rows.map(pick);
  return values.every(historyId) && new Set(values).size === values.length ? values : null;
};
const TRACE_EVIDENCE_FIELDS = ['module','actionId','batchId','planHash'];
function traceEvidence(row) {
  const evidence={};
  for(const key of TRACE_EVIDENCE_FIELDS)if(row[key]!==undefined){
    if(!(key==='actionId' ? typeof row[key]==='string'&&row[key].length>0&&row[key].length<=1000&&row[key].trim()===row[key] : historyId(row[key])))throw fail('工作流trace身份无效');
    evidence[key]=row[key];
  }
  if(row.blockedReasons!==undefined){
    if(!Array.isArray(row.blockedReasons)||row.blockedReasons.length>50||row.blockedReasons.some(reason=>!historyId(reason)))throw fail('工作流阻塞原因无效');
    evidence.blockedReasons=[...row.blockedReasons];
  }
  return evidence;
}
const sameIds = (left, right) => left && right && left.length === right.length && left.every((id, index) => id === right[index]);

// Audit the records already present in the two stores. The current graph can
// have been edited since the run, so only its persisted ACTION trace is used.
export function projectWorkflowExecutionHistory(accountId, workflowRun, operationRuns) {
  if (workflowRun?.accountId !== accountId || !historyId(workflowRun?.runId) || !text(workflowRun?.workflowId) ||
      !Array.isArray(operationRuns)) throw fail('缺少精确的账号与工作流历史');
  const workflowRunId = workflowRun.runId, workflowDefinitionId = workflowRun.workflowId;
  const nodes = new Map(), duplicateNodes = new Set();
  const trace = Array.isArray(workflowRun.trace) && workflowRun.trace.length <= WORKFLOW_LIMITS.steps ? workflowRun.trace : [];
  for (const row of trace) {
    if (row?.type !== 'ACTION' || !text(row.nodeId)) continue;
    if (nodes.has(row.nodeId)) duplicateNodes.add(row.nodeId);
    else nodes.set(row.nodeId, { nodeId: row.nodeId, traceResult: row.result, timestamp: row.timestamp ?? null, ...traceEvidence(row), batches: [] });
  }
  for (const nodeId of duplicateNodes) nodes.delete(nodeId);

  const accountRuns = operationRuns.filter(run => run?.accountId === accountId);
  const runCounts = new Map(), batchCounts = new Map();
  const count = (counts, id) => { if (historyId(id)) counts.set(id, (counts.get(id) ?? 0) + 1); };
  for (const run of accountRuns) {
    count(runCounts, run.runId);
    for (const batchId of new Set([run.planSummary?.batchId, run.authorizationSummary?.batchId])) count(batchCounts, batchId);
  }
  let unlinkedOperationCount = 0;
  for (const run of accountRuns) {
    const plan = run.planSummary, authorization = run.authorizationSummary;
    if (![run.workflowId, run.parentRunId, plan?.parentRunId].includes(workflowRunId)) continue;
    const node = nodes.get(run.workflowNodeId), batchId = plan?.batchId;
    const actionIds = ids(run.actions, row => row?.actionId);
    if (!node || node.traceResult?.startsWith('BLOCKED_') ||
        node.module !== undefined && node.module !== run.module ||
        node.batchId !== undefined && node.batchId !== batchId ||
        node.planHash !== undefined && node.planHash !== plan?.planHash ||
        node.actionId !== undefined && (actionIds?.length !== 1 || actionIds[0] !== node.actionId) ||
        run.workflowId !== workflowRunId || run.parentRunId !== workflowRunId || plan?.parentRunId !== workflowRunId ||
        run.workflowDefinitionId !== workflowDefinitionId || plan?.workflowDefinitionId !== workflowDefinitionId ||
        plan?.workflowNodeId !== node.nodeId || plan?.accountId !== accountId ||
        runCounts.get(run.runId) !== 1 || batchCounts.get(batchId) !== 1 || authorization?.batchId !== batchId ||
        !sameIds(actionIds, ids(plan?.actions, row => row?.actionId)) || !sameIds(actionIds, ids(authorization?.actionIds, id => id))) {
      unlinkedOperationCount++;
      continue;
    }
    node.batches.push({ batchId, operationRunId: run.runId, module: run.module ?? null, finalStatus: run.finalStatus,
      startedAt: run.startedAt ?? null, finishedAt: run.finishedAt ?? null, recovered: run.recovered === true,
      actions: run.actions.map(row => ({ actionId: row.actionId, capabilityId: row.capabilityId ?? null,
        actionType: row.actionType ?? null, result: row.result, requestStatus: row.requestStatus,
        verificationStatus: row.verification?.status ?? null, needsReconciliation: actionNeedsReconciliation(run, row),
        reconciliationStatus: Array.isArray(row.reconciliations) ? row.reconciliations.at(-1)?.status ?? null : null })) });
  }
  return { accountId, workflowRunId, workflowDefinitionId, status: workflowRun.status,
    startedAt: workflowRun.startedAt ?? null, finishedAt: workflowRun.finishedAt ?? null, recovered: workflowRun.recovered === true,
    readOnly: true, resumable: false, coverage: 'PERSISTED_WORKFLOW_OPERATION_LINKS_ONLY', unlinkedOperationCount,
    nodes: [...nodes.values()] };
}

export function createWorkflowStore({ file, modules, secrets = () => [], assertWriter = () => {}, fileSystem = fs } = {}) {
  if (!text(file) || !path.isAbsolute(file)) throw fail('工作流存储必须使用显式绝对路径');
  const unavailable = () => fail('工作流存储损坏或不可读；原证据已保留', 'WORKFLOW_STORE_UNAVAILABLE');
  const maxBytes = 8 * 1024 * 1024;
  let knownStore = false;
  const statuses = new Set(['IDLE','STARTING','RUNNING','WAITING','AWAITING_AUTHORIZATION','COMPLETED','STOPPED','UNKNOWN','FAILED','CANCELLED','RECOVERED_STOPPED']);
  function validRun(run, accountId) {
    if (!plain(run) || run.accountId !== accountId || !text(run.runId) || !text(run.workflowId) || !statuses.has(run.status)
        || run.steps !== undefined && (!Number.isSafeInteger(run.steps) || run.steps < 0 || run.steps > WORKFLOW_LIMITS.steps)) return false;
    if (run.trace === undefined) return true;
    if (!Array.isArray(run.trace) || run.trace.length > WORKFLOW_LIMITS.steps) return false;
    try { return run.trace.every(row => plain(row) && text(row.nodeId) && TYPES.has(row.type) && text(row.result)
      && (row.timestamp === undefined || text(row.timestamp)) && Boolean(traceEvidence(row))); } catch { return false; }
  }
  function read() {
    try {
      let stat;
      try { stat = fileSystem.lstatSync(file); } catch (error) {
        if (error.code === 'ENOENT' && !knownStore) return { version: 1, accounts: Object.create(null) };
        throw unavailable();
      }
      knownStore = true;
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw unavailable();
      const source = fileSystem.readFileSync(file, 'utf8');
      if (Buffer.byteLength(source, 'utf8') > maxBytes) throw unavailable();
      const raw = JSON.parse(source);
      if (!plain(raw) || raw.version !== 1 || !plain(raw.accounts)) throw unavailable();
      for (const [accountId, entry] of Object.entries(raw.accounts)) {
        if (!text(accountId) || !plain(entry) || !Array.isArray(entry.workflows) || !Array.isArray(entry.history) || entry.history.some(run => !validRun(run, accountId))) throw unavailable();
        entry.workflows.forEach(graph => validateWorkflow(graph, { modules }));
        if (new Set(entry.workflows.map(graph => graph.id)).size !== entry.workflows.length || new Set(entry.history.map(run => run.runId)).size !== entry.history.length) throw unavailable();
      }
      return raw;
    } catch { throw unavailable(); }
  }
  function write(raw) {
    assertWriter();
    const temporary = file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      const serialized = JSON.stringify(raw, null, 2) + '\n';
      if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw unavailable();
      fileSystem.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fileSystem.openSync(temporary, 'wx', 0o600);
      try { fileSystem.writeFileSync(fd, serialized, 'utf8'); fileSystem.fsyncSync(fd); } finally { fileSystem.closeSync(fd); }
      assertWriter();
      // Recheck the original path after flushing: a lost store must never be
      // silently replaced with a new history while its owner is still running.
      read();
      fileSystem.renameSync(temporary, file);
      knownStore = true;
    } catch (error) {
      if (error?.code?.startsWith('WRITER_')) throw error;
      throw fail('工作流原子保存失败，原历史未覆盖', 'WORKFLOW_STORE_UNAVAILABLE');
    } finally { try { fileSystem.unlinkSync(temporary); } catch {} }
  }
  function entry(raw, accountId) { if (!text(accountId)) throw fail('缺少精确账号 ID'); if (!Object.hasOwn(raw.accounts, accountId)) Object.defineProperty(raw.accounts, accountId, { value: { workflows: [], history: [] }, enumerable: true, configurable: true, writable: true }); return raw.accounts[accountId]; }
  function list(accountId) { const raw = read(); return copy(Object.hasOwn(raw.accounts, accountId) ? raw.accounts[accountId].workflows : []); }
  function save(accountId, graph) { const validated = validateWorkflow(graph, { modules }).workflow, raw = read(), account = entry(raw, accountId); account.workflows = [validated, ...account.workflows.filter(existing => existing.id !== validated.id)]; write(raw); return copy(validated); }
  function record(accountId, run) {
    const allowed = ['runId','workflowId','status','currentNode','steps','startedAt','finishedAt','reason','trace','runBudget'];
    if (!plain(run) || !text(run.runId) || !text(run.workflowId) || !['IDLE','STARTING','RUNNING','WAITING','AWAITING_AUTHORIZATION','COMPLETED','STOPPED','UNKNOWN','FAILED','CANCELLED','RECOVERED_STOPPED'].includes(run.status) || run.accountId !== undefined && run.accountId !== accountId || run.steps !== undefined && (!Number.isSafeInteger(run.steps) || run.steps < 0 || run.steps > WORKFLOW_LIMITS.steps)) throw fail('工作流历史身份无效');
    const safe = redact(Object.fromEntries(allowed.filter(key => run[key] !== undefined).map(key => [key, copy(run[key])])), secrets());
    safe.accountId = accountId;
    if (safe.trace !== undefined) { if (!Array.isArray(safe.trace) || safe.trace.length > WORKFLOW_LIMITS.steps) throw fail('工作流历史过大'); if (safe.trace.some(row => !plain(row) || !text(row.nodeId) || !TYPES.has(row.type) || !text(row.result) || row.timestamp !== undefined && !text(row.timestamp))) throw fail('工作流trace必须是有限状态记录'); safe.trace = safe.trace.map(row => ({...Object.fromEntries(['nodeId','type','result','timestamp'].filter(key => row?.[key] !== undefined).map(key => [key, row[key]])),...traceEvidence(row)})); }
    const raw = read(), account = entry(raw, accountId); account.history = [safe, ...account.history.filter(existing => existing.runId !== safe.runId)]; write(raw); return copy(safe);
  }
  function history(accountId, { liveRunId = null, runId = null } = {}) {
    const raw = read();
    // An active snapshot is only live if the current server-owned runner still
    // holds that exact run. Neither the saved snapshot nor the caller can resume it.
    const entries = Object.hasOwn(raw.accounts, accountId) ? raw.accounts[accountId].history : [];
    return copy(runId === null ? entries : entries.filter(run => run.runId === runId)).map(run =>
      ACTIVE.has(run.status) && run.runId !== liveRunId
        ? { ...run, status: 'RECOVERED_STOPPED', recovered: true, resumable: false, reason: '恢复历史仅供查看；必须重新显式启动与逐批授权' }
        : { ...run, resumable: false });
  }
  function remove(accountId, workflowId) { const raw = read(), account = entry(raw, accountId); account.workflows = account.workflows.filter(graph => graph.id !== workflowId); write(raw); return list(accountId); }
  return { list, load: list, save, remove, record, history };
}
export function exampleWorkflows(registry) {
  const modules = registryOf(registry), examples = [];
  for (const [id, module] of modules) {
    if (!module || module.id !== id || !['survey','view','plan','verify'].every(key => typeof module[key] === 'function')) continue;
    examples.push({ id: 'example-' + id, name: id + '：只读采集后停止', workflow: { version: 1, id: 'example-' + id, name: id + '：只读采集后停止', nodes: [{ id: 'start', type: 'START' }, { id: 'survey', type: 'SURVEY', module: id }, { id: 'stop', type: 'STOP' }], edges: [{ from: 'start', to: 'survey' }, { from: 'survey', to: 'stop' }] }, scope: '仅使用已注册 survey；写节点必须填入真实候选选择并单次授权' });
  }
  if (['formation','stage'].every(id => modules.get(id)?.id === id && ['survey','view','plan','verify'].every(key => typeof modules.get(id)[key] === 'function'))) examples.push({ id: 'formation-stage-template', name: '主线阵容→验证→已注册主线启动', requiresSelection: true, workflow: { version: 1, id: 'formation-stage-template', name: '主线阵容→验证→已注册主线启动', nodes: [{ id: 'start', type: 'START' }, { id: 'formation', type: 'ACTION', module: 'formation', selection: 'REPLACE_WITH_EXACT_FORMATION_CANDIDATE' }, { id: 'verify', type: 'VERIFY', module: 'formation' }, { id: 'stage', type: 'ACTION', module: 'stage', selection: 'REPLACE_WITH_EXACT_REGISTERED_STAGE_CANDIDATE' }, { id: 'stop', type: 'STOP' }], edges: [{ from: 'start', to: 'formation' }, { from: 'formation', to: 'verify' }, { from: 'verify', to: 'stage' }, { from: 'stage', to: 'stop' }] }, scope: '仅在 formation/stage 都注册时提供；不推断其他模式阵营，每个 ACTION 独立单次授权' });
  for (const template of [
    { module: 'fleet', id: 'fleet-repair-dispatch-template', name: '舰队维修→验证→移动→验证', selections: ['REPLACE_WITH_EXACT_FLEET_REPAIR_CANDIDATE','REPLACE_WITH_EXACT_FLEET_MOVE_CANDIDATE'] },
    { module: 'alliance', id: 'alliance-help-template', name: '联盟帮助→验证', selections: ['REPLACE_WITH_EXACT_ALLIANCE_HELP_CANDIDATE'] },
  ]) {
    const module = modules.get(template.module);
    if (!module || module.id !== template.module || !['survey','view','plan','verify'].every(key => typeof module[key] === 'function')) continue;
    const nodes = [{ id: 'start', type: 'START' }, { id: 'survey', type: 'SURVEY', module: template.module }];
    const edges = [{ from: 'start', to: 'survey' }]; let previous = 'survey';
    template.selections.forEach((selection, index) => {
      const action = 'action-' + index, verify = 'verify-' + index;
      nodes.push({ id: action, type: 'ACTION', module: template.module, selection }, { id: verify, type: 'VERIFY', module: template.module });
      edges.push({ from: previous, to: action }, { from: action, to: verify }); previous = verify;
    });
    nodes.push({ id: 'stop', type: 'STOP' }); edges.push({ from: previous, to: 'stop' });
    examples.push({ id: template.id, name: template.name, requiresSelection: true, workflow: { version: 1, id: template.id, name: template.name, nodes, edges }, scope: '真实候选与精确业务参数必须先编辑；每个ACTION分别授权，缺失能力保持阻断' });
  }
  return examples;
}
