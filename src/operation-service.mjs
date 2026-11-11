import { surveyExtremeFormationList, surveyExtremeFormations, prepareExtremeFormation, viewExtremeFormations, validateExtremeFormationParameters } from './extreme-formations.mjs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { createExecutionMemory, executionMemoryKey } from './execution-memory.mjs';
import { createStateFact } from './state-facts.mjs';
import { createNamedFormationStore, NAMED_FORMATION_SCOPE } from './named-formations.mjs';
import { ResourceLedger, resourceCosts, createRunBudgetContext, normalizeBudgetClaims, operationBudgetClaims } from './resource-ledger.mjs';
import { assertExecutionActive, executionOutcome, stopsExecution } from './execution.mjs';
import { loadProductionPolicy, saveProductionPolicy, selectProductionCandidates, productionShortages } from './production-policy.mjs';
import { summarizeProductionHistory } from './production-report.mjs';
import { collectOperationRecovery, buildVerifiedReceipt, RECOVERY_DISPATCH_CONTRACT } from './operation-recovery.mjs';
import { toSnapshotJson } from './game.mjs';
import { createExecutionHistory, runHasUnresolvedWrites, actionNeedsReconciliation, actionWasUncertain } from './execution-history.mjs';
import { surveyOrderExecution, planOrderExecution, executeOrderOperation } from './order-execution.mjs';
import { surveyCityOperations, cityView, planCityOperations, executeCityAction } from './city-operations.mjs';
import { GAMEPLAY_MODULES, listBusinessFunctions } from './function-registry.mjs';
import { createModuleSettings } from './gameplay-settings.mjs';
import { FUNCTION_CONTRACTS, validateFunctionParameters } from './function-contracts.mjs';
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
  const fields = ['module', 'capabilityId', 'actionId', 'actionType', 'target', 'costs', 'beforeState', 'identity', 'decision', 'ruleResult', 'reason', 'label', 'expectedState', 'costSource', 'parameters', 'restoreParameters', 'budgetClaims'];
  return Object.fromEntries(fields.filter(key => operation[key] !== undefined).map(key => [key, clone(operation[key])]));
}
function evidence(result) {
  const fields = ['requestStatus', 'beforeState', 'resourceBefore', 'resourceAfter', 'reservation', 'resourceReservation', 'afterState', 'verification', 'nextDecision', 'reason', 'error', 'decision', 'ruleResult', 'dispatched', 'unresolvedWrite', 'beforeInventory', 'afterInventory', 'beforeInventoryReliable', 'afterInventoryReliable', 'collectedProducts', 'receivedReward', 'rewardEvidence'];
  return Object.fromEntries(fields.filter(key => result[key] !== undefined).map(key => [key, clone(result[key])]));
}

// Session, GameClient, ledger and executors remain the owners of transport and execution safety.
// This small coordinator binds their existing functions to one displayed, single-use batch.
export function createOperationService({ protocol, getConfig = () => null, loadRules, history = createExecutionHistory(), clock = Date.now, loadProduction = loadProductionPolicy, saveProduction = saveProductionPolicy,
  survey = (client, wire, opts) => surveyOrderExecution(client, wire, { ...opts, survey: surveyCityOperations }),
  orderPlanner = planOrderExecution, cityPlanner = planCityOperations, cityViewer = cityView,
  orderExecute = executeOrderOperation, cityExecute = executeCityAction,
  assertWriter = () => {}, recoveryCollect = collectOperationRecovery,
  modules = GAMEPLAY_MODULES, moduleSettings = createModuleSettings({ modules }), businessExecute = executeBusinessOperation, memory = null, namedFormationsStore = null,
} = {}) {
  // Console supplies its owned/redacted store; file-backed embeddings inherit
  // an isolated sibling. Custom non-file test histories retain compatibility.
  const decisionMemory=memory??(typeof history.storagePath==='string'?createExecutionMemory({file:path.join(path.dirname(history.storagePath),path.basename(history.storagePath)==='execution-history.json'?'execution-memory.json':path.basename(history.storagePath)+'.memory.json'),assertWriter,wallNow:clock}):null);
  if(decisionMemory&&['record','list','evaluate'].some(method=>typeof decisionMemory[method]!=='function'))throw error('执行记忆接口无效','MEMORY_INVALID_INPUT');
  const namedStore=namedFormationsStore??(typeof history.storagePath==='string'?createNamedFormationStore({file:path.join(path.dirname(history.storagePath),path.basename(history.storagePath)==='execution-history.json'?'named-formations.json':path.basename(history.storagePath)+'.named-formations.json'),assertWriter,wallNow:clock}):null);
  if(namedStore&&['list','save','rename','overwrite','delete','prepareApply'].some(method=>typeof namedStore[method]!=='function'))throw error('具名阵容存储接口无效','NAMED_FORMATION_INVALID');
  const cache = new Map(), plans = new Map(), runs = new Map(), moduleCache = new Map(), formationProofs = new Map(), moduleFacts = new Map();
  const extremePreparations = new Map(), recoveryPreviews = new Map(), workflowBudgets = new Map(), connectionIds = new WeakMap(), workflowNodes = new WeakMap();
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

  function memoryInput(run,row) {
    const module=row.module??run.module,identity=row.identity??row.beforeState,batchId=run.planSummary?.batchId??run.authorizationSummary?.batchId;
    // Live dispatch intent is not a completed outcome. After restart History
    // projects it to UNKNOWN; only then can supplemental audit be appended.
    if(['DISPATCHING','EXECUTING','VERIFY'].includes(row.requestStatus))return null;
    const status=actionWasUncertain(row)?'UNKNOWN':row.result;
    if(!['REJECTED','UNKNOWN'].includes(status)||!module||!row.actionType||!row.target||identity===undefined||identity===null||!batchId||!row.actionId)return null;
    if(status==='REJECTED'&&(typeof row.dispatched!=='boolean'||row.unresolvedWrite!==false))return null;
    return {module,actionType:row.actionType,target:row.target,identity,source:'ExecutionHistory.action.result.v1',generation:run.executionContext?.generation??0,
      runId:run.runId,workflowId:run.workflowId??null,nodeId:run.workflowNodeId??null,batchId,actionId:row.actionId,capabilityId:row.capabilityId??null,
      status,dispatched:row.dispatched===true||row.dispatchEvidence?.state==='MAY_HAVE_DISPATCHED',unresolvedWrite:status==='UNKNOWN',reason:String(row.reason??row.error??'原始执行历史结果；不推断冷却或日界').slice(0,4000),policy:{kind:'UNTIL_IDENTITY_CHANGE'}};
  }
  function memoryOrigin(event,entries) {
    const matches=entries.filter(run=>run.runId===event.runId&&(run.planSummary?.batchId??run.authorizationSummary?.batchId)===event.batchId)
      .flatMap(run=>run.actions.filter(row=>row.actionId===event.actionId&&(row.module??run.module)===event.module&&row.actionType===event.actionType).map(row=>({run,row})));
    if(matches.length!==1)return {status:'ORIGIN_UNAVAILABLE',resolved:false,workflowDefinitionId:null};
    const {run,row}=matches[0],input=memoryInput(run,row);
    if(!input||input.status!==event.status||executionMemoryKey({module:input.module,actionType:input.actionType,target:input.target})!==event.key||operationDigest(toSnapshotJson(input.identity))!==event.identityDigest)return {status:'ORIGIN_MISMATCH',resolved:false,workflowDefinitionId:null};
    const last=row.reconciliations?.at(-1),resolved=['APPLIED','NOT_APPLIED'].includes(last?.status)&&!actionNeedsReconciliation(run,row);
    return {status:resolved?last.status:actionNeedsReconciliation(run,row)?'STILL_UNKNOWN':row.result,resolved,workflowDefinitionId:run.workflowDefinitionId??null,operationRunId:run.runId,workflowRunId:run.workflowId??null,nodeId:run.workflowNodeId??null};
  }
  function memorySnapshot(accountId,{synchronize=false}={}) {
    const entries=history.list(accountId);
    if(!decisionMemory)return {available:false,events:[],entries,pending:[],unknown:[],coverage:'CUSTOM_NON_FILE_HISTORY_WITHOUT_MEMORY'};
    if(synchronize)for(const run of entries)for(const row of run.actions){const input=memoryInput(run,row);if(input)decisionMemory.record(accountId,input);}
    const events=decisionMemory.list(accountId),pending=[];
    for(const run of entries)for(const row of run.actions){const input=memoryInput(run,row);if(input&&!events.some(event=>event.runId===input.runId&&event.batchId===input.batchId&&event.actionId===input.actionId&&event.status===input.status))pending.push({runId:run.runId,batchId:input.batchId,actionId:row.actionId,status:input.status});}
    const projected=events.map(event=>({...event,historyOrigin:memoryOrigin(event,entries)}));
    return {available:true,entries,events:projected,pending,unknown:projected.filter(event=>event.status==='UNKNOWN'&&!event.historyOrigin.resolved),coverage:'UNTIL_IDENTITY_CHANGE_AND_UNKNOWN_AUDIT'};
  }
  function assertMemoryAccount(accountId,{synchronize=true}={}) {
    const before=memorySnapshot(accountId);
    if(before.unknown.some(event=>['ORIGIN_UNAVAILABLE','ORIGIN_MISMATCH'].includes(event.historyOrigin.status)))throw error('UNKNOWN记忆缺少匹配原始历史关联，禁止新派发','MEMORY_ORIGIN_UNRESOLVED');
    const snapshot=synchronize?memorySnapshot(accountId,{synchronize:true}):before;
    if(snapshot.unknown.some(event=>['ORIGIN_UNAVAILABLE','ORIGIN_MISMATCH'].includes(event.historyOrigin.status)))throw error('UNKNOWN记忆缺少原始历史关联，禁止新派发','MEMORY_ORIGIN_UNRESOLVED');
    return snapshot;
  }
  function memoryFact(session,operation,sourceAt=clock()) {
    if(!decisionMemory)return null;
    const query={module:operation.module,actionType:operation.actionType,target:operation.target,identity:operation.identity??operation.beforeState};
    return createStateFact(query.identity,{accountId:session.id,generation:session.generation,source:'OperationService.authoritative-plan.'+operation.module,sourceAt,scope:{kind:'ENTITY',key:executionMemoryKey(query)},reliable:true});
  }
  function assertMemoryAction(session,operation,identityFact) {
    if(!decisionMemory)return;
    const snapshot=assertMemoryAccount(session.id);
    if(snapshot.unknown.length)throw error('原始UNKNOWN尚未由执行历史复核','RECOVERY_UNCERTAIN');
    if(!snapshot.events.some(event=>event.status==='REJECTED'&&event.module===operation.module&&event.actionType===operation.actionType))return;
    const query={module:operation.module,actionType:operation.actionType,target:operation.target,identity:operation.identity??operation.beforeState};
    const evaluated=decisionMemory.evaluate(session.id,query,{generation:session.generation,identityFact,maxFactAgeMs:300000}),rejection=evaluated.rejection??evaluated;
    if(rejection.blocked)throw error('该目标的确定拒绝仍有效，须权威新身份后重新规划','REJECTION_MEMORY_ACTIVE');
  }
  function executionMemory(accountId,filters={}) {
    exact(filters,['module','runId','workflowId','nodeId','batchId','actionId','status']);
    if(Object.values(filters).some(value=>typeof value!=='string'||!value||value!==value.trim()||value.length>512))throw error('记忆筛选无效','INVALID_INPUT',400);
    const snapshot=memorySnapshot(accountId);
    return {accountId,available:snapshot.available,coverage:snapshot.coverage,events:snapshot.events.filter(event=>Object.entries(filters).every(([key,value])=>event[key]===value)),pendingHistoryProjection:snapshot.pending,resumable:false,retryAllowed:false,policyCoverage:{identityChange:Boolean(decisionMemory),cooldown:false,gameDay:false},note:'只读审计；UNKNOWN仅由原ExecutionHistory追加复核解除，重启不恢复执行或授权'};
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
    if (!recoveryRead) assertMemoryAccount(session.id);
    if (!recoveryRead && (runs.get(session.id) && runHasUnresolvedWrites(runs.get(session.id).record) || history.unresolved(session.id))) throw error('历史存在 UNKNOWN 或异常退出未决批次，等待权威复核', 'RECOVERY_UNCERTAIN');
    const owner={token:Symbol(label),generation:session.generation,client:session.client}; lockOwners.set(session,owner);
    session.busy = label;
    return () => { if(lockOwners.get(session)!==owner || session.generation!==owner.generation || session.client!==owner.client)return; lockOwners.delete(session); if (session.busy === label) session.busy = session.workflowOwner ? 'workflow:' + session.workflowOwner : null; };
  }
  function status(accountId) {
    const run = runs.get(accountId);
    let blocked, warning;
    try { const snapshot=memorySnapshot(accountId); blocked = Boolean(run && runHasUnresolvedWrites(run.record)) || history.unresolved(accountId) || snapshot.unknown.length>0 || snapshot.pending.length>0; }
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
    const safe = { ...raw, ...(raw.fort?{fort:{...raw.fort,candidates:(raw.fort.candidates??[]).map(({action,...row})=>({...row,executable:Boolean(action)&&row.executable!==false}))}}:{}), candidates: (raw.candidates ?? []).map(({ action, ...row }) => ({ ...row, executable: Boolean(action) && row.executable !== false && row.decision !== 'BLOCKED' })), surveyedAt: now(), source: '显式只读采集；缓存不代表实时状态' };
    moduleCache.set(accountId, { ...(moduleCache.get(accountId) ?? {}), [id]: safe });
  }
  async function surveyModule(session, id, parameters = {}, { workflowId = null } = {}) {
    const adapter = adapterFor(id); if(adapter.contractVersion===1) parameters=validateFunctionParameters(id,adapter,parameters)??{};
    const release = acquire(session, 'operations:SURVEY:' + id, workflowId), generation = session.generation, client = session.client;
    try { const options = { rules:loadRules(session.id).config,mode:'Manual',productionPolicy:loadProduction(session.id).config,config: getConfig(), player: session.player, signal: session.abort.signal, parameters, moduleConfig: moduleSettings.get(session.id,id).config };
      const facts = await adapter.survey(client, protocol, options); current(session,generation,client); if((session.workflowOwner??null)!==workflowId)throw error('工作流已停止或替换', 'CANCELLED'); cacheModule(session.id,id,facts,options); plans.delete(session.id); return moduleView(session.id,id);
    } finally { release(); }
  }
  function namedStorage() { if(!namedStore)throw error('当前存储未配置具名阵容','NAMED_FORMATION_UNAVAILABLE');return namedStore; }
  function namedInput(payload,keys) {
    exact(payload,keys);
    if(keys.includes('id')&&(typeof payload.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(payload.id)))throw error('需要精确具名阵容ID','INVALID_INPUT',400);
    if(keys.includes('expectedRevision')&&(!Number.isSafeInteger(payload.expectedRevision)||payload.expectedRevision<1))throw error('需要预期存档版本','INVALID_INPUT',400);
    if(keys.includes('name')&&(typeof payload.name!=='string'||!payload.name||payload.name.length>80||payload.name.trim()!==payload.name||/[\u0000-\u001f\u007f]/.test(payload.name)))throw error('队伍名称无效','INVALID_INPUT',400);
  }
  function namedFormations(accountId) { return {accountId,entries:namedStorage().list(accountId),resumable:false,requiresFreshPlan:true,requiresAuthorization:true}; }
  function renameNamedFormation(accountId,payload) { namedInput(payload,['id','name','expectedRevision']);return namedStorage().rename(accountId,payload.id,{name:payload.name,expectedRevision:payload.expectedRevision}); }
  function deleteNamedFormation(accountId,payload) { namedInput(payload,['id','expectedRevision']);return namedStorage().delete(accountId,payload.id,{expectedRevision:payload.expectedRevision}); }
  async function withNamedFormationSurvey(session,label,apply) {
    const store=namedStorage(),adapter=adapterFor('formation'),release=acquire(session,'operations:NAMED_FORMATION:'+label),generation=session.generation,client=session.client;
    const contextHash=operationDigest(executionContext(session));
    try {
      const options={config:getConfig(),player:session.player,signal:session.abort.signal,parameters:{},moduleConfig:moduleSettings.get(session.id,'formation').config};
      const facts=await adapter.survey(client,protocol,options);
      current(session,generation,client);
      if(operationDigest(executionContext(session))!==contextHash)throw error('阵容读取期间账号角色或世界已变化','CANCELLED');
      const formationFact=createStateFact(facts.formation,{accountId:session.id,generation,source:'GetFormationResponse',sourceAt:facts.formationSource?.sourceAt,scope:NAMED_FORMATION_SCOPE,reliable:facts.reliability?.formation===true});
      // Never wrap surveyModule: this helper owns the sole account lock across
      // authoritative read, source validation and the local storage decision.
      plans.delete(session.id);
      return apply(store,formationFact,facts,{generation,signal:session.abort.signal,moduleConfig:options.moduleConfig});
    } finally { release(); }
  }
  async function saveNamedFormation(session,payload) { namedInput(payload,['name']);return withNamedFormationSurvey(session,'SAVE',(store,formationFact,_facts,options)=>store.save(session.id,{name:payload.name,formationFact},{generation:options.generation,signal:options.signal})); }
  async function overwriteNamedFormation(session,payload) { namedInput(payload,['id','expectedRevision']);return withNamedFormationSurvey(session,'OVERWRITE',(store,formationFact,_facts,options)=>store.overwrite(session.id,payload.id,{expectedRevision:payload.expectedRevision,formationFact},{generation:options.generation,signal:options.signal})); }
  async function prepareNamedFormation(session,payload) { namedInput(payload,['id','expectedRevision']);return withNamedFormationSurvey(session,'PREPARE',(store,currentFormationFact,facts,options)=>store.prepareApply(session.id,payload.id,{expectedRevision:payload.expectedRevision,currentFormationFact,facts,...options})); }
  async function withExtremeFormationRead(session,label,parameters) {
    const release=acquire(session,'operations:EXTREME_FORMATION:'+label),generation=session.generation,client=session.client;
    const viewerContext=clone(executionContext(session)),contextHash=operationDigest(viewerContext),stage=session.player?.mainlineStage;
    try {
      // Discovery and preparation are read-only, invalidate prior permits, and
      // never create history, parent budgets, execution state or automatic saves.
      plans.delete(session.id);extremePreparations.delete(session.id);
      const options={config:getConfig(),player:session.player,viewerContext,signal:session.abort.signal};
      const facts=parameters===null?await surveyExtremeFormationList(client,protocol,options):await surveyExtremeFormations(client,protocol,{...options,parameters});
      current(session,generation,client);
      if(operationDigest(executionContext(session))!==contextHash||session.player?.mainlineStage!==stage)throw error('极限来源读取期间账号、角色、世界、连接或当前关卡已变化','CANCELLED');
      const result=parameters===null?viewExtremeFormations(facts):prepareExtremeFormation(facts,{parameters,config:getConfig(),player:session.player,viewerContext:clone(executionContext(session)),moduleConfig:moduleSettings.get(session.id,'formation').config});
      current(session,generation,client);
      if(parameters!==null)extremePreparations.set(session.id,{contextHash,stage,dependencyHash:operationDigest(adapterFor('formation').dependencyVersions({config:getConfig(),moduleConfig:moduleSettings.get(session.id,'formation').config,player:session.player})),parametersHash:operationDigest(result.parameters),source:clone(result.source),preparedAt:clock()});
      else extremePreparations.delete(session.id);
      return {accountId:session.id,...result,resumable:false,requiresFreshSurvey:true,requiresFreshPlan:true,requiresAuthorization:true};
    } finally {release();}
  }
  async function extremeFormations(session,payload={}) {exact(payload,[]);return withExtremeFormationRead(session,'SURVEY',null);}
  async function prepareExtremeFormationSource(session,payload) {const parameters=validateExtremeFormationParameters(payload);return withExtremeFormationRead(session,'PREPARE',parameters);}
  function saveModuleConfig(accountId, payload) { assertWriter(); exact(payload,['module','config']); adapterFor(payload.module); const saved=moduleSettings.save(accountId,payload.module,payload.config); plans.delete(accountId); moduleCache.delete(accountId); return {accountId,module:payload.module,...saved}; }
  function claimWorkflow(session, runId, { limits = null } = {}) {
    const release = acquire(session, 'operations:WORKFLOW_CLAIM'); release(); const owner={generation:session.generation,client:session.client}; workflowOwners.set(session,owner); session.workflowOwner=runId; session.busy='workflow:'+runId;
    const scope = parentScope(session, runId);
    try { workflowBudgets.set(session.id, { runId, scope, limits: limits === null ? null : normalizeBudgetClaims(limits), context: limits === null ? null : createRunBudgetContext({ scope, limits }) }); } catch (cause) { session.workflowOwner=null; session.busy=null; throw cause; }
    const heldBudget=workflowBudgets.get(session.id);
    return () => { heldBudget.context?.close('STOPPED'); if(workflowOwners.get(session)!==owner || session.generation!==owner.generation || session.client!==owner.client || session.workflowOwner!==runId)return; workflowOwners.delete(session); if(plans.get(session.id)?.workflowId===runId)plans.delete(session.id); session.workflowOwner=null; if(session.busy==='workflow:'+runId)session.busy=null; };
  }
  function bindWorkflowNode(session,runId,context) {
    exact(context,['workflowId','nodeId']);
    if(session.workflowOwner!==runId||['workflowId','nodeId'].some(key=>typeof context[key]!=='string'||!context[key]||context[key].length>100))throw error('工作流节点上下文无效','INVALID_INPUT',400);
    current(session,session.generation,session.client);workflowNodes.set(session,{runId,...context});
  }
  async function plan(session, payload, { workflowId = null } = {}) {
    const bound=workflowNodes.get(session),workflowContext=workflowId&&bound?.runId===workflowId?{workflowId:bound.workflowId,nodeId:bound.nodeId}:null;
    if(workflowContext!==null){exact(workflowContext,['workflowId','nodeId']);if(!workflowId||['workflowId','nodeId'].some(key=>typeof workflowContext[key]!=='string'||!workflowContext[key]||workflowContext[key].length>100))throw error('工作流关联上下文无效','INVALID_INPUT',400);}
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
      const memorySourceAt=clock();
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
      const memoryFacts=new Map();
      for(const operation of operations){if(FUNCTION_CONTRACTS[operation.module])operation.capabilityId=FUNCTION_CONTRACTS[operation.module].capabilityId;operation.budgetClaims=operationBudgetClaims(operation);const fact=memoryFact(session,operation,memorySourceAt);assertMemoryAction(session,operation,fact);memoryFacts.set(operation.actionId,fact);}
      const budgetClaims=normalizeBudgetClaims({resources:operations.flatMap(action=>action.budgetClaims.resources),quotas:operations.flatMap(action=>action.budgetClaims.quotas),uids:operations.flatMap(action=>action.budgetClaims.uids)});
      const resourceBudget=budgetClaims.resources;
      const createdAt = now(), batchId = randomUUID(), expiresAt = new Date(clock() + 300000).toISOString();
      let parent = null;
      if (workflowId) { parent = workflowBudgets.get(session.id); if (!parent || parent.runId !== workflowId) throw error('工作流父预算不存在', 'RUN_BUDGET_SCOPE_MISMATCH'); if (!parent.context) { parent.limits = stockLimits(facts.stock); parent.context = createRunBudgetContext({scope:parent.scope,limits:parent.limits}); } parent.context.assertScope(parentScope(session,workflowId)); }
      const summary = { ...(workflowContext?{workflowDefinitionId:workflowContext.workflowId,workflowNodeId:workflowContext.nodeId}:{}), ...(parent ? { parentRunId: workflowId, runBudgetIdentity: { scope: clone(parent.scope), limits: clone(parent.limits) } } : {}), batchId, accountId: session.id, module, mode, actions: operations.map(publicAction), resourceBudget, budgetClaims, productionPolicy: production, ...(adapter ? { moduleConfig, parameters: normalizedParameters } : {}), createdAt, expiresAt,
        notes: ['授权仅覆盖本批次具体操作；新订单和新计划需要重新授权', 'UNKNOWN 停止批次并保留预算；不自动重试'] };
      const preparation=module==='formation'?extremePreparations.get(session.id):null;
      if(preparation&&preparation.contextHash===contextHash&&preparation.stage===session.player?.mainlineStage&&preparation.dependencyHash===operationDigest(adapter.dependencyVersions(options))&&preparation.parametersHash===operationDigest(normalizedParameters)&&clock()>=preparation.preparedAt&&clock()-preparation.preparedAt<=30000)summary.preparationEvidence={capabilityId:'C215',source:clone(preparation.source),preparedAt:preparation.preparedAt,scope:'SOURCE_TEMPLATE_ONLY_CURRENT_TARGET_REVALIDATED'};
      summary.planHash = operationDigest(summary);
      const internal = { memoryFacts, contextHash, adapter: Boolean(adapter), dependencyHash: adapter?.dependencyVersions ? operationDigest(adapter.dependencyVersions(options)) : null, public: clone(summary), operations: clone(operations), generation, client, config, workflowId, moduleConfig, moduleHash: adapter ? operationDigest(moduleConfig) : null, configHash: operationDigest(config), productionHash: operationDigest(production), rulesHash: operationDigest(rules), stock: new Map(facts.stock), permit: null };
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
    const record = { ...(entry.public.workflowDefinitionId?{workflowDefinitionId:entry.public.workflowDefinitionId,workflowNodeId:entry.public.workflowNodeId}:{}), parentRunId: entry.workflowId ?? null, workflowId: entry.workflowId ?? null, executionContext: executionContext(session), runId: randomUUID(), accountId: session.id, module: entry.public.module, mode: entry.public.mode, startedAt: now(), finishedAt: null,
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
    let activeMemoryOperation=null;
    const authorizedCurrent = () => {
      current(session, generation, client);
      if(operationDigest(executionContext(session))!==entry.contextHash)throw error('账号角色、世界或连接身份已变化','NOT_EXECUTED');
      budget.runBudget.assertScope(parentScope(session,entry.workflowId??record.runId));
      if(activeMemoryOperation)assertMemoryAction(session,activeMemoryOperation,entry.memoryFacts.get(activeMemoryOperation.actionId));
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
        const operation = entry.operations[index], row = record.actions[index]; activeMemoryOperation=operation;
        row.requestStatus = 'DISPATCHING'; row.timestamp = now(); history.put(record);
        const originalAdapter = entry.adapter ? modules[operation.module] : null;
        // Observe the original fresh planner; transport and verification stay shared.
        let freshMemorySourceAt=clock();
        let freshMemoryObserved=false;
        const adapter = decisionMemory&&originalAdapter&&!originalAdapter.execute ? {...originalAdapter,async survey(...args){freshMemorySourceAt=clock();return originalAdapter.survey(...args);},plan(facts,options){const planned=originalAdapter.plan(facts,options);if(!freshMemoryObserved){for(const fresh of planned.actions??[]){const candidate={...fresh,module:operation.module},fact=memoryFact(session,candidate,freshMemorySourceAt);assertMemoryAction(session,candidate,fact);entry.memoryFacts.set(fresh.actionId,fact);}freshMemoryObserved=true;}return planned;}} : originalAdapter;
        const executor = adapter ? adapter.execute ?? businessExecute : operation.module === 'orders' ? orderExecute : cityExecute;
        const result = await executor(client, protocol, operation, { config: entry.config, rules: loadRules(session.id).config, player: session.player,
          rewardBinding: operation.module==='orders'?{...record.executionContext,runId:record.runId,batchId:entry.public.batchId,actionId:operation.actionId,identity:operation.identity,orderIndex:operation.target.index}:null, rewardContext:()=>executionContext(session),
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
        try { const snapshot=assertMemoryAccount(session.id);const event=snapshot.events.find(event=>event.runId===record.runId&&event.batchId===entry.public.batchId&&event.actionId===row.actionId&&event.status===memoryInput(record,row)?.status);if(event)row.memoryEventId=event.eventId; }
        catch(cause){record.memoryPersistence={status:'FAILED',reason:cause.message};record.finalStatus=['SUCCESS','NOT_EXECUTED'].includes(row.result)?'FAILED':row.result;record.stopReason='执行记忆未保存；停止所有后续派发：'+cause.message;break;}
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
  return { extremeFormations, prepareExtremeFormationSource, namedFormations, saveNamedFormation, renameNamedFormation, overwriteNamedFormation, deleteNamedFormation, prepareNamedFormation, bindWorkflowNode, executionMemory, closeWorkflowBudget(accountId,runId,outcome='STOPPED') { const parent=workflowBudgets.get(accountId); if(parent?.runId===runId)return parent.context?.close(outcome)??null;return null; }, workflowBudget: accountId => workflowBudgets.get(accountId)?.context?.snapshot() ?? null, previewRecovery, confirmRecovery, view, survey: surveyAccount, moduleView, surveyModule, saveModuleConfig, claimWorkflow, assertFormationReady, formationContext, modules, plan, authorize, execute, stop, status,
    history: (accountId, runId) => { const all = history.list(accountId); return { accountId, runs: all.filter(run => !runId || run.runId === runId), dailyReport: summarizeProductionHistory(all, { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(clock())), timeZone: 'Asia/Shanghai' }) }; },
    productionPolicy: accountId => ({ accountId, ...loadProduction(accountId) }),
    saveProductionPolicy: (accountId, payload) => { assertWriter(); exact(payload, ['config']); const result = saveProduction(accountId, payload.config); plans.delete(accountId); cache.delete(accountId); return { accountId, ...result }; },
    blocked: accountId => status(accountId).blocked, running: accountId => Boolean(runs.get(accountId)?.running),
    settle: accountId => runs.get(accountId)?.task ?? Promise.resolve(),
  };
}
