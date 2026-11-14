// Static wrappers over the existing core functions. Transport, resource algorithms,
// authoritative verification, account locking and durable history stay with their owners.
import { surveyOrderExecution, planOrderExecution, executeOrderOperation } from './order-execution.mjs';
import { surveyCityOperations, cityView, planCityOperations, executeCityAction } from './city-operations.mjs';
import { defaultOrderRules } from './order-rules.mjs';
import { defaultProductionPolicy, selectProductionCandidates, productionDemand } from './production-policy.mjs';
import { ResourceLedger } from './resource-ledger.mjs';
import { operationResult, assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { appointProduceReduce, produceFinalTime, cropSupplyPlan, packCoverPlan } from './production-planning.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_INPUT', statusCode: 400 });
const defaultConfig = Object.freeze({ enabled: false });
const modes = new Set(['Manual', 'Hybrid', 'Automatic']);
const cityKinds = new Set(['build', 'upgrade', 'finishUpgrade', 'collectProduct', 'speedUpUpgrade']);
const productionKinds = new Set(['startProduce', 'gainFactory', 'speedUpProduce']);
const completed = new WeakMap();

export function validateCoreOperationParameters(value = {}) {
  if (!plain(value) || Reflect.ownKeys(value).length) throw invalid('核心业务参数必须为空对象；目标仅接受服务端候选 actionId，不允许 request、body 或未知字段');
  return {};
}
function settings(value = defaultConfig) {
  if (!plain(value) || Reflect.ownKeys(value).some(key => key !== 'enabled') || typeof value.enabled !== 'boolean') throw invalid('核心业务配置仅允许 enabled 布尔值');
  return { enabled: value.enabled };
}
function context(options = {}) {
  validateCoreOperationParameters(options.parameters);
  const mode = options.mode ?? 'Manual';
  if (!modes.has(mode)) throw invalid('不支持的核心业务执行模式');
  return { ...options, mode, moduleConfig: settings(options.moduleConfig), rules: options.rules ?? defaultOrderRules(), productionPolicy: options.productionPolicy ?? defaultProductionPolicy() };
}
function selections(value = [], mode) {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string' || !id || id.length > 300)
    || new Set(value).size !== value.length || mode === 'Manual' && value.length > 1) throw invalid('选择必须为不重复的候选 actionId；Manual 每次只允许一条');
  return [...value];
}
function gated(row, options) {
  return options.moduleConfig.enabled ? row : { ...row, executable: false, blockedReason: '模块未启用' };
}
function kinds(id) { return id === 'city' ? cityKinds : productionKinds; }
function domainCandidates(id, facts, options) {
  return cityView(facts, options).candidates.filter(row => kinds(id).has(row.actionType));
}
function blockNotes(id) { return { module: id, actions: [], notes: ['模块未启用；请使用账号 ModuleSettings 显式启用'] }; }

// One existing collection supplies both raw-order and raw-city completeness proofs.
export async function surveyCoreOperations(client, protocol, options = {}) {
  validateCoreOperationParameters(options.parameters);
  return surveyOrderExecution(client, protocol, { ...options, survey: surveyCityOperations });
}
// Explicit production survey reuses the existing city/order read set; only the
// two already-catalogued appointment facts are added, never a second Snapshot.
export async function surveyProductionOperations(client,protocol,options={}) {
 const facts=await surveyCoreOperations(client,protocol,options);
 const read=async name=>{const response=name.replace(/Request$/,"Response");if(!protocol?.[name]||!protocol?.[response])return null;assertExecutionActive(client,options);try{const body=await awaitExecution(client.request(name,{},response,options.timeout??8000),client,options);assertExecutionActive(client,options);return body;}catch(error){if(executionOutcome(error)==="CANCELLED")throw error;return null;}};
 const appointed=await read("AppointInfoRequest"),heroes=await read("AllHeroRequest");
 return {...facts,productionContext:{appointment:appointProduceReduce(options.config,{appointed:appointed?.heroes,heroes:heroes?.heroes,reliable:Array.isArray(appointed?.heroes)&&Array.isArray(heroes?.heroes)})}};
}
function productionPlanningView(facts,view,config) {
 const appointment=facts.productionContext?.appointment??{reliable:false,seconds:null,reason:'APPOINT_SOURCE_UNKNOWN'};
 const factories=view.factories.map(factory=>({...factory,recipes:factory.recipes.map(recipe=>({...recipe,appointmentAdjustedSeconds:produceFinalTime(recipe.produceTime,appointment.seconds),timingScope:'APPOINTMENT_ONLY_SPEED_BONUS_NOT_ESTABLISHED',packCoverage:packCoverPlan(config,{costs:recipe.costs,stock:facts.stockReliable===true?facts.stock:null})}))}));
 const cropSupply=cropSupplyPlan(config,{stock:facts.stockReliable===true?facts.stock:null,buildings:facts.buildings,farmsReliable:facts.cityReliability?.buildings===true});
 return {factories,appointment,cropSupply};
}
export function viewCoreOrders(facts, options = {}) {
  const args = context(options), result = planOrderExecution(facts, { ...args, ledger: new ResourceLedger(facts.stockReliable === true ? facts.stock : null), selections: [] });
  return { module: 'orders', mode: args.mode, orders: result.rows.map(({ action, ...row }) => gated(row, args)), candidates: result.rows.map(row => gated(row, args)), notes: result.notes };
}
export function planCoreOrders(facts, options = {}) {
  const args = context(options), ids = selections(options.selections, args.mode);
  if (!args.moduleConfig.enabled) return blockNotes('orders');
  const rows = planOrderExecution(facts, { ...args, ledger: new ResourceLedger(facts.stockReliable === true ? facts.stock : null), selections: [] }).rows;
  const selected = rows.filter(row => ids.includes(row.actionId));
  if (selected.length !== ids.length) throw invalid('订单选择不属于当前服务端候选');
  if (args.mode === 'Hybrid' && selected.some(row => row.actionType === 'SUBMIT') && ids.length !== 1) throw invalid('Hybrid 提交需逐单授权');
  return planOrderExecution(facts, { ...args, selections: ids });
}
function viewCityDomain(id, facts, options = {}) {
  const args = context(options), view = cityView(facts, args), planning=id==='production'?productionPlanningView(facts,view,args.config):null;
  const candidates = view.candidates.filter(row => kinds(id).has(row.actionType)).map(row => gated({ ...row, module: id }, args));
  return id === 'city' ? { module: id, buildings: view.buildings, stock: view.stock, candidates, notes: view.notes }
    : { module: id, ...planning, stock: view.stock, candidates, productionShortages: productionDemand(facts, { policy: args.productionPolicy, config: args.config }), productionPolicy: args.productionPolicy,
      productionRecommendations: selectProductionCandidates(facts, { policy: args.productionPolicy, config: args.config, candidates }), notes: view.notes };
}
function planCityDomain(id, facts, options = {}) {
  const args = context(options), ids = selections(options.selections, args.mode);
  if (!args.moduleConfig.enabled) return blockNotes(id);
  const candidates = domainCandidates(id, facts, args);
  if (ids.some(actionId => !candidates.some(row => row.actionId === actionId))) throw invalid('选择不属于该核心业务的当前候选');
  if (args.mode === 'Automatic') {
    const allowed = selectProductionCandidates(facts, { policy: args.productionPolicy, config: args.config, candidates });
    if (candidates.some(row => ids.includes(row.actionId) && row.actionType === 'startProduce' && !allowed.includes(row.actionId))) {
      throw Object.assign(new Error('自动生产未启用或超出当前账号策略范围'), { code: 'PRODUCTION_POLICY_REQUIRED', statusCode: 409 });
    }
  }
  const result = planCityOperations(facts, { ...args, selections: ids });
  return { ...result, module: id, actions: result.actions.map(row => ({ ...row, module: id })) };
}

// Verify is a receipt projection, not a second state-verification algorithm.
// Only this wrapper's original executor can produce a receipt; a typed response
// or a caller-constructed {status:'SUCCESS'} cannot establish authoritative proof.
export function verifyCoreOperation(operation, result) {
  const proof = result && completed.get(result);
  if (!proof || proof.operation !== operation) return { confirmed: false, reason: '需要原核心执行器的同操作权威复核结果' };
  return { confirmed: proof.confirmed, reason: proof.reason, afterState: proof.afterState };
}
function retainProof(operation, result) {
  completed.set(result, { operation, confirmed: result.status === 'SUCCESS' && result.verification?.status === 'CONFIRMED',
    reason: result.verification?.reason ?? result.error ?? '原核心执行器未确认效果', afterState: structuredClone(result.afterState ?? null) });
  return result;
}
async function executeCore(id, client, protocol, operation, options = {}) {
  let args;
  try {
    args = context(options);
    if (args.moduleConfig.enabled !== true || args.allowMutate !== true) return operationResult('NOT_EXECUTED', { dispatched: false, unresolvedWrite: false, error: '核心业务需要启用模块及当前单批授权' });
    if (operation?.module !== id || !(id === 'orders' ? ['SUBMIT', 'REFRESH'].includes(operation.actionType) : kinds(id).has(operation.actionType))) {
      throw invalid('操作不属于该核心业务');
    }
  } catch (error) {
    return operationResult('NOT_EXECUTED', { dispatched: false, unresolvedWrite: false, error: error.message });
  }
  // Keep exceptions after entering an executor visible to its coordinator. A
  // post-dispatch persistence/callback failure must never become NOT_EXECUTED.
  // OrderExecution owns rule/identity/quota verification; CityAction owns
  // Automatic policy rechecks and authoritative state verification.
  const result = id === 'orders'
    ? await executeOrderOperation(client, protocol, operation, { ...args, survey: surveyCityOperations })
    : await executeCityAction(client, protocol, operation, { ...args, survey: surveyCoreOperations });
  return retainProof(operation, result);
}

function tableVersions(config, names) {
  return Object.fromEntries(names.map(name => [name, structuredClone(config?.tables?.[name] ?? null)]));
}
function dependencies(id, options = {}) {
  const args = context(options);
  const tableNames = id === 'orders' ? ['WorkerOrderCfg', 'WorkerSpecOrderCfg']
    : id === 'city' ? ['BuildingCfg', 'BuildingUpgradeCfg']
      : ['BuildingCfg', 'BuildingProduceCfg', 'BuildingProduceParamCfg', 'GameParamCfg', ...["AppointEffectCfg","AppointPosCfg","HeroCfg","FarmlandPlantCfg","SelectPackLibCfg"]];
  return { moduleConfig: args.moduleConfig, config: tableVersions(args.config, tableNames),
    ...(id === 'orders' ? { rules: structuredClone(args.rules) } : {}),
    ...(id === 'production' && args.mode === 'Automatic' ? { productionPolicy: structuredClone(args.productionPolicy) } : {}) };
}
const evidence = sources => Object.freeze({ sources: Object.freeze(sources), offline: 'REAL_FUNCTION_SYNTHETIC_CLIENT', realGame: 'REAL_UNVERIFIED',
  limitations: Object.freeze(['协议存在不代表业务效果；成功仅继承原执行器权威复核', '免费刷新仍要求可信配额证据；不从调用参数授权', 'C112完整游戏产量和C124金币奖励不在此包装器声明完成']) });
// The legacy core executors persist a different, already enforced contract.
// Compare those original fields directly; never synthesize missing generic
// parameters, cost sources or expected states for historical orders.
function coreRejectionIdentity(operation,{context}={}) {
  const fields=['module','actionType','target','identity','beforeState','costs','budgetClaims'];
  if(!operation||fields.some(key=>!Object.hasOwn(operation,key)||operation[key]===null||operation[key]===undefined)
    ||!context||['accountId','playerId','worldId','generation','connectionId'].some(key=>!Object.hasOwn(context,key)||context[key]===null||context[key]===undefined))return null;
  const result=Object.fromEntries(fields.map(key=>[key,structuredClone(operation[key])]));
  if(operation.module==='orders'){
    if(!operation.ruleResult)return null;
    result.ruleResult=structuredClone(operation.ruleResult);
  }else{
    if(!operation.expectedState)return null;
    result.expectedState=structuredClone(operation.expectedState);
  }
  if(['city','production'].includes(operation.module)&&productionKinds.has(operation.actionType))result.module='production';
  result.context={accountId:context.accountId,playerId:context.playerId,worldId:context.worldId};
  return result;
}
const shared = { rejectionIdentity: coreRejectionIdentity, defaultConfig, validateConfig: settings, validateParameters: validateCoreOperationParameters, survey: surveyCoreOperations, verify: verifyCoreOperation };
export const ordersModule = Object.freeze({ ...shared, id: 'orders', label: '居民订单',
  capabilities: Object.freeze(['C121', 'C122', 'C123', 'C125', 'C126', 'C128']),
  view: viewCoreOrders, plan: planCoreOrders, execute: (client, protocol, operation, options) => executeCore('orders', client, protocol, operation, options),
  dependencyVersions: options => dependencies('orders', options),
  dependencyKeys: Object.freeze(['moduleConfig', 'rules', 'config.WorkerOrderCfg', 'config.WorkerSpecOrderCfg']),
  evidence: evidence(['src/order-execution.mjs:surveyOrderExecution', 'src/order-execution.mjs:planOrderExecution', 'src/order-execution.mjs:executeOrderOperation']) });
export const cityModule = Object.freeze({ ...shared, id: 'city', label: '城市建设', capabilities: Object.freeze(['C101', 'C102', 'C103', 'C104', 'C116']),
  view: (facts, options) => viewCityDomain('city', facts, options), plan: (facts, options) => planCityDomain('city', facts, options),
  execute: (client, protocol, operation, options) => executeCore('city', client, protocol, operation, options),
  dependencyVersions: options => dependencies('city', options), dependencyKeys: Object.freeze(['moduleConfig', 'config.BuildingCfg', 'config.BuildingUpgradeCfg']),
  evidence: evidence(['src/city-operations.mjs:surveyCityOperations', 'src/city-operations.mjs:cityView', 'src/city-operations.mjs:planCityOperations', 'src/city-operations.mjs:executeCityAction']) });
export const productionModule = Object.freeze({ ...shared, survey:surveyProductionOperations, id: 'production', label: '工厂生产', capabilities: Object.freeze(['C111', 'C113', 'C114', 'C115', 'C116']),
  view: (facts, options) => viewCityDomain('production', facts, options), plan: (facts, options) => planCityDomain('production', facts, options),
  execute: (client, protocol, operation, options) => executeCore('production', client, protocol, operation, options),
  dependencyVersions: options => dependencies('production', options),
  dependencyKeys: Object.freeze(['moduleConfig', 'config.BuildingCfg', 'config.BuildingProduceCfg', 'config.BuildingProduceParamCfg', 'config.AppointEffectCfg', 'config.AppointPosCfg', 'config.HeroCfg', 'config.FarmlandPlantCfg', 'config.SelectPackLibCfg', 'config.GameParamCfg', 'Automatic:productionPolicy']),
  evidence: evidence(['src/city-operations.mjs:planCityOperations', 'src/city-operations.mjs:executeCityAction', 'src/production-policy.mjs:selectProductionCandidates', 'src/production-policy.mjs:productionShortages']) });
export const CORE_OPERATION_MODULES = Object.freeze({ orders: ordersModule, city: cityModule, production: productionModule });
