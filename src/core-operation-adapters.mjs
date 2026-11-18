// Static wrappers over the existing core functions. Transport, resource algorithms,
// authoritative verification, account locking and durable history stay with their owners.
import { createHash } from 'node:crypto';
import { stableBusinessValue } from './business-functions.mjs';
import { materialPackModule, validateMaterialPackParameters, confirmedMaterialPackSettlement, projectMaterialPackPreparations, confirmedMaterialPackSequence, qualifiedMaterialPackCoverage } from './material-packs.mjs';
import { resourceCosts } from './resource-ledger.mjs';
import { assertPaymentAllowed } from './actions.mjs';
import { surveyOrderExecution, planOrderExecution, executeOrderOperation, observeOrderProgress, observeOrderRefreshTiming, ordersProductionView } from './order-execution.mjs';
import { surveyCityOperations, cityView, planCityOperations, executeCityAction } from './city-operations.mjs';
import { defaultOrderRules } from './order-rules.mjs';
import { defaultProductionPolicy, selectProductionCandidates, productionDemand } from './production-policy.mjs';
import { ResourceLedger } from './resource-ledger.mjs';
import { operationResult, assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { productionRecipeCosts, appointProduceReduce, produceFinalTime, cropSupplyPlan, packCoverPlan, observeProductionQueueClocks } from './production-planning.mjs';

import { readGameTime } from './state-facts.mjs';
import { makeTypeResolver } from './world.mjs';
import { safeResourceQuantity } from './resource-ledger.mjs';
import { toSnapshotJson } from './game.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_INPUT', statusCode: 400 });
const defaultConfig = Object.freeze({ enabled: false });
const modes = new Set(['Manual', 'Hybrid', 'Automatic']);
const cityKinds = new Set(['build', 'upgrade', 'finishUpgrade', 'collectProduct', 'speedUpUpgrade']);
const productionKinds = new Set(['startProduce', 'gainFactory', 'speedUpProduce']);
const completed = new WeakMap();
const productionQueueClocks = new WeakMap();

export function validateCoreOperationParameters(value = {}) {
  if (!plain(value) || Reflect.ownKeys(value).length) throw invalid('核心业务参数必须为空对象；目标仅接受服务端候选 actionId，不允许 request、body 或未知字段');
  return {};
}
function settings(value = defaultConfig) {
  if (!plain(value) || Reflect.ownKeys(value).some(key => key !== 'enabled') || typeof value.enabled !== 'boolean') throw invalid('核心业务配置仅允许 enabled 布尔值');
  return { enabled: value.enabled };
}
function context(options = {}, id = null) {
  if(id==='production')validateProductionParameters(options.parameters);else if(id==='city')validateCityParameters(options.parameters);else validateCoreOperationParameters(options.parameters);
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
  const rows=cityView(facts, options).candidates.filter(row => kinds(id).has(row.actionType));
  return id==='production'?boundProductionCandidates(facts,options,rows):boundCityCandidates(facts,options,rows);
}
function blockNotes(id) { return { module: id, actions: [], notes: ['模块未启用；请使用账号 ModuleSettings 显式启用'] }; }

// One existing collection supplies both raw-order and raw-city completeness proofs.
export async function surveyCoreOperations(client, protocol, options = {}) {
  validateCoreOperationParameters(options.parameters);
  return surveyOrderExecution(client, protocol, { ...options, survey: surveyCityOperations });
}
// Orders alone adds the catalogued total-effects read. This observation never
// grants stock, resource reservations, permits or refresh eligibility. Explicit
// user wait rules may filter candidates using this same captured projection.
export async function surveyOrdersOperations(client, protocol, options = {}) {
  const identity = () => JSON.stringify(['accountId','generation','playerId','worldId','connectionId'].map(key => client.factContext?.[key] ?? null).concat(client.connectionId ?? null));
  const capturedIdentity = identity();
  const current = () => {
    assertExecutionActive(client, options);
    if (identity() !== capturedIdentity) throw Object.assign(new Error('订单调查期间账号或连接身份已变化'), { code: 'CANCELLED' });
  };
  let serverTimeMs = null;
  const observed = new Proxy(client, { get(target, key) {
    if (key !== 'request') { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; }
    return async (...args) => {
      current();
      const value = await target.request(...args);
      current();
      if (args[0] === 'OnWaterRequest') {
        const time = readGameTime(target).gameTime, context = target.factContext;
        if (time.reliable === true && typeof context?.accountId === 'string' && context.accountId
          && Number.isSafeInteger(context.generation) && context.generation >= 0
          && time.accountId === context.accountId && time.generation === context.generation
          && Number.isSafeInteger(Math.round(time.nowMs))) serverTimeMs = Math.round(time.nowMs);
      }
      return value;
    };
  } });
  const facts = await surveyCoreOperations(observed, protocol, options);
  let effects = null;
  current();
  if (protocol?.GameEffectRequest && protocol?.GameEffectResponse) {
    try { effects = toSnapshotJson(await awaitExecution(observed.request('GameEffectRequest', {}, 'GameEffectResponse', options.timeout ?? 8000), client, options)); }
    catch (error) { if (executionOutcome(error) === 'CANCELLED') throw error; }
  }
  current();
  return { ...facts, orderProductionObservation: { effects, serverTimeMs } };
}
// Explicit production survey reuses the existing city/order read set; only the
// two already-catalogued appointment facts are added, never a second Snapshot.
export async function surveyProductionOperations(client,protocol,options={}) {
 const identity=()=>JSON.stringify(['accountId','generation','playerId','worldId','connectionId'].map(k=>client.factContext?.[k]??null).concat(client.connectionId??null,['playerId','worldId'].map(k=>toSnapshotJson(options.player?.[k]??null)))),captured=identity();
 const current=()=>{assertExecutionActive(client,options);if(identity()!==captured)throw Object.assign(new Error('生产调查期间账号或连接变化'),{code:'CANCELLED'});};
 const clock=()=>{const c=client.factContext;let t;try{t=client.gameClock?.read?.(c);}catch{}const role=k=>{const v=toSnapshotJson(options.player?.[k]??null);return (typeof v==='string'&&/^[1-9][0-9]*$/.test(v)||typeof v==='number'&&Number.isSafeInteger(v)&&v>0)&&BigInt(v)<(1n<<63n)&&(!Object.hasOwn(c,k)||String(toSnapshotJson(c[k]))===String(v));};return c&&['accountId','connectionId'].every(k=>typeof c[k]==='string'&&c[k])&&['playerId','worldId'].every(role)&&Number.isSafeInteger(c.generation)&&c.generation>=0&&t?.status==='TRUSTED'&&t.reliable===true&&t.source==='PingResponse.serverTimestamp'&&t.accountId===c.accountId&&t.generation===c.generation&&['earliestMs','nowMs','latestMs'].every(k=>Object.hasOwn(t,k)&&Number.isFinite(t[k])&&t[k]>=0&&t[k]<=Number.MAX_SAFE_INTEGER)&&t.earliestMs<=t.nowMs&&t.nowMs<=t.latestMs?{earliestMs:t.earliestMs,latestMs:t.latestMs}:null;};
 let sourceAt=null,sourceClock=null;
 const observed=new Proxy(client,{get(target,key){if(key!=='request'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}return async(...args)=>{current();const value=await target.request(...args);current();if(args[0]==='OnWaterRequest'){sourceAt=Date.now();sourceClock=clock();}return value;};}});
 validateProductionParameters(options.parameters);
 const facts=await surveyCoreOperations(observed,protocol,{...options,parameters:{}});
 const read=async name=>{current();const response=name.replace(/Request$/,"Response");if(!protocol?.[name]||!protocol?.[response])return null;try{const body=await awaitExecution(client.request(name,{},response,options.timeout??8000),client,options);current();return body;}catch(error){current();if(executionOutcome(error)==="CANCELLED")throw error;return null;}};
 const appointed=await read("AppointInfoRequest"),heroes=await read("AllHeroRequest");current();
 const result={...facts,productionContext:{appointment:appointProduceReduce(options.config,{appointed:appointed?.heroes,heroes:heroes?.heroes,reliable:Array.isArray(appointed?.heroes)&&Array.isArray(heroes?.heroes)})}},end=clock();
 productionQueueClocks.set(result,{raw:JSON.stringify(result.rawOnWater),identity:captured,current:identity,sourceAt,bounds:sourceClock&&end&&end.earliestMs>=sourceClock.earliestMs&&end.latestMs>=sourceClock.latestMs?end:null});
 productionSources.set(result,{client,player:options.player,available:Object.keys(protocol??{}),have:result.have,at:sourceAt,context:productionScope(client,options.player),digest:productionFactsDigest(result),dependencies:productionConfigDigest(options),read:options.readExchangeHistory});return result;
}
function productionPlanningView(facts,view,config) {
 const appointment=facts.productionContext?.appointment??{reliable:false,seconds:null,reason:'APPOINT_SOURCE_UNKNOWN'};
 const factories=view.factories.map(factory=>({...factory,recipes:factory.recipes.map(recipe=>({...recipe,appointmentAdjustedSeconds:produceFinalTime(recipe.produceTime,appointment.seconds),timingScope:'APPOINTMENT_ONLY_SPEED_BONUS_NOT_ESTABLISHED',packCoverage:packCoverPlan(config,{costs:recipe.costs,stock:facts.stockReliable===true?facts.stock:null})}))}));
 const cropSupply=cropSupplyPlan(config,{stock:facts.stockReliable===true?facts.stock:null,buildings:facts.buildings,farmsReliable:facts.cityReliability?.buildings===true});
 const proof=productionQueueClocks.get(facts),queueClocks=proof&&proof.identity===proof.current()&&proof.raw===JSON.stringify(facts.rawOnWater)?observeProductionQueueClocks({buildings:facts.rawOnWater?.building,sourceAt:proof.sourceAt,serverBounds:proof.bounds}):[];
 return {factories,appointment,cropSupply,queueClocks};
}
export function viewCoreOrders(facts, options = {}) {
  const args = context(options), result = planOrderExecution(facts, { ...args, ledger: new ResourceLedger(facts.stockReliable === true ? facts.stock : null), selections: [] });
  const refreshTiming = row => {
    const matches = Array.isArray(facts.rawOnWater?.workerOrder) ? facts.rawOnWater.workerOrder.filter(order => order?.index === row.target.index) : [];
    return observeOrderRefreshTiming(matches.length === 1 ? matches[0] : null, facts.orderProductionObservation);
  };
  return { module: 'orders', mode: args.mode, progress: observeOrderProgress(args.config, { orderOfTheDay: facts.rawOnWater?.orderOfTheDay, effects: facts.orderProductionObservation?.effects }), orders: result.rows.map(({ action, ...row }) => gated({ ...row, productionWait: ordersProductionView(facts, args.config, row.beforeState?.requirements), refreshTiming: refreshTiming(row) }, args)), candidates: result.rows.map(row => gated({ ...row, parameters: {} }, args)), notes: result.notes };
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
  const args = context(options,id), view = cityView(facts, args), planning=id==='production'?productionPlanningView(facts,view,args.config):null;
  const candidates = domainCandidates(id,facts,args).map(row => gated({ ...row, module: id, ...(id==='production'?{executable:true}:{}), parameters: id==='city'?validateCityParameters(args.parameters):id==='production'?validateProductionParameters(row.actionType==='startProduce'&&!args.parameters?.materialSource?{buildingId:row.target.buildingId,productId:row.target.productId}:args.parameters):{} }, args));
  return id === 'city' ? { module: id, buildings: view.buildings, stock: view.stock, candidates, preparation:cityPreparationTargets(facts,args), notes: view.notes }
    : { module: id, ...planning, startPreparation:productionStartTargets(facts,args), collectionPreparation:productionCollectionTargets(facts,args), accelerationPreparation:productionAccelerationTargets(facts,args), stock: view.stock, stockReliable: facts.stockReliable===true&&facts.productionInventoryReliable===true, candidates, productionShortages: productionDemand(facts, { policy: args.productionPolicy, config: args.config }), productionPolicy: args.productionPolicy,
      productionRecommendations: selectProductionCandidates(facts, { policy: args.productionPolicy, config: args.config, candidates }), notes: view.notes };
}
function planCityDomain(id, facts, options = {}) {
  const args = context(options,id), ids = selections(options.selections, args.mode);
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
  return { ...result, module: id, actions: result.actions.map(row => ({ ...row, module: id, ...(args.parameters?.buildingId?{parameters:id==='city'?validateCityParameters(args.parameters):validateProductionParameters(args.parameters)}:{}) })) };
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
    args = context(options,id);
    if (args.moduleConfig.enabled !== true || args.allowMutate !== true) return operationResult('NOT_EXECUTED', { dispatched: false, unresolvedWrite: false, error: '核心业务需要启用模块及当前单批授权' });
    if (operation?.module !== id || !(id === 'orders' ? ['SUBMIT', 'REFRESH'].includes(operation.actionType) : kinds(id).has(operation.actionType))) {
      throw invalid('操作不属于该核心业务');
    }
    if(id==='city'&&(args.parameters?.buildingId||operation.parameters?.buildingId)&&(!productionSame(operation.parameters,args.parameters)||operation.target?.buildingId!==args.parameters?.buildingId||operation.actionType!==args.parameters?.action))throw invalid('城市操作与明确建筑及动作范围不一致');
    if(id==='production'&&(args.parameters?.buildingId||operation.parameters?.buildingId)){const collecting=args.parameters?.action==='collect',accelerating=args.parameters?.action==='speedUpProduce';if(!productionSame(operation.parameters,args.parameters)||operation.actionType!==(collecting?'gainFactory':accelerating?'speedUpProduce':'startProduce')||operation.target?.buildingId!==args.parameters?.buildingId||accelerating&&operation.target?.index!==args.parameters.index||!collecting&&!accelerating&&operation.target?.productId!==args.parameters?.productId)throw invalid('生产操作参数、工厂或产品与授权范围不一致');}
  } catch (error) {
    return operationResult('NOT_EXECUTED', { dispatched: false, unresolvedWrite: false, error: error.message });
  }
  // Keep exceptions after entering an executor visible to its coordinator. A
  // post-dispatch persistence/callback failure must never become NOT_EXECUTED.
  // OrderExecution owns rule/identity/quota verification; CityAction owns
  // Automatic policy rechecks and authoritative state verification.
  let sourceFacts=null;const guardedSource=id==='production'&&(args.parameters?.materialSource||['collect','speedUpProduce'].includes(args.parameters?.action));
  let sourceSurvey=guardedSource?async(c,p,o)=>{if(sourceFacts)return surveyCoreOperations(c,p,o);const f=await surveyProductionOperations(c,p,{...args,...o,parameters:args.parameters});if(!boundProductionCandidates(f,args,cityView(f,args).candidates).some(row=>row.actionId===operation.actionId))throw invalid('材料包前置、目标工厂或配方来源已变化');sourceFacts=f;return f;}:surveyCoreOperations;
  let sourceClient=guardedSource?new Proxy(client,{get(target,key){if(key!=='sendWatch'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}return (...values)=>{if(!sourceFacts||!boundProductionCandidates(sourceFacts,args,[operation]).length)throw invalid('材料包已消费、历史变化或连接来源失效');const beforeDispatch=values[2]?.beforeDispatch;values[2]={...values[2],beforeDispatch(){beforeDispatch?.();if(!boundProductionCandidates(sourceFacts,args,[operation]).length)throw invalid('派发前材料包来源失效');}};return target.sendWatch(...values);};}}):client;
  if(id==='city'&&args.parameters?.buildingId){
    const matches=()=>sourceFacts&&boundCityCandidates(sourceFacts,args,[operation]).length===1;
    sourceSurvey=async(c,p,o)=>{if(sourceFacts)return surveyCoreOperations(c,p,o);const facts=await surveyCoreCityOperations(c,p,{...args,...o,parameters:args.parameters});if(!boundCityCandidates(facts,args,cityView(facts,args).candidates).some(row=>row.actionId===operation.actionId))throw invalid('明确城市建筑状态或配置已变化');sourceFacts=facts;return facts;};
    sourceClient=new Proxy(client,{get(target,key){if(!['request','sendWatch'].includes(key)){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}return (...values)=>{const writing=key==='sendWatch'||values[4]?.mutate;if(writing){if(!matches())throw invalid('城市派发来源已失效');const index=key==='sendWatch'?2:4,prior=values[index]?.beforeDispatch;values[index]={...values[index],beforeDispatch(){prior?.();if(!matches())throw invalid('派发前城市来源已失效');}};}return target[key](...values);};}});
  }
  const result = id === 'orders'
    ? await executeOrderOperation(client, protocol, operation, { ...args, survey: args.rules.rules.some(rule => rule.enabled && rule.type === 'MAX_PRODUCTION_WAIT') ? surveyOrdersOperations : surveyCityOperations })
    : await executeCityAction(sourceClient, protocol, operation, { ...args, parameters:{}, survey: sourceSurvey });
  return retainProof(operation, result);
}

function tableVersions(config, names) {
  return Object.fromEntries(names.map(name => [name, structuredClone(config?.tables?.[name] ?? null)]));
}
function dependencies(id, options = {}) {
  const args = context(options,id);
  const tableNames = id === 'orders' ? ['WorkerOrderCfg', 'WorkerSpecOrderCfg', 'BuildingCfg', 'BuildingProduceCfg']
    : id === 'city' ? ['BuildingCfg', 'BuildingUpgradeCfg']
      : ['BuildingCfg', 'BuildingProduceCfg', 'BuildingProduceParamCfg', 'GameParamCfg', ...["AppointEffectCfg","AppointPosCfg","HeroCfg","FarmlandPlantCfg","SelectPackLibCfg"], ...(args.parameters?.materialSource?["ItemCfg"]:[])];
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
    // A changing global observation never expires a refusal for the same order.
    // Keep the declared threshold, source and decision; omit only the read count.
    for(const row of result.ruleResult.ruleResults??[])if(row.type==='OBSERVED_ORDER_COUNT'&&row.countObservation)delete row.countObservation.value;
    for(const row of result.ruleResult.ruleResults??[])if(row.type==='MAX_PRODUCTION_WAIT'&&row.waitObservation)delete row.waitObservation.leadSeconds;
  }else{
    if(!operation.expectedState)return null;
    result.expectedState=structuredClone(operation.expectedState);
  }
  if(['city','production'].includes(operation.module)&&productionKinds.has(operation.actionType))result.module='production';
  result.context={accountId:context.accountId,playerId:context.playerId,worldId:context.worldId};
  return result;
}
const shared = { rejectionIdentity: coreRejectionIdentity, defaultConfig, validateConfig: settings, validateParameters: validateCoreOperationParameters, survey: surveyCoreOperations, verify: verifyCoreOperation };
export const ordersModule = Object.freeze({ ...shared, survey: surveyOrdersOperations, id: 'orders', label: '居民订单',
  capabilities: Object.freeze(['C121', 'C122', 'C123', 'C125', 'C126', 'C128']),
  view: viewCoreOrders, plan: planCoreOrders, execute: (client, protocol, operation, options) => executeCore('orders', client, protocol, operation, options),
  dependencyVersions: options => dependencies('orders', options),
  dependencyKeys: Object.freeze(['moduleConfig', 'rules', 'config.WorkerOrderCfg', 'config.WorkerSpecOrderCfg', 'config.BuildingCfg', 'config.BuildingProduceCfg']),
  evidence: evidence(['src/order-execution.mjs:surveyOrderExecution', 'src/order-execution.mjs:planOrderExecution', 'src/order-execution.mjs:executeOrderOperation']) });
export const cityModule = Object.freeze({ ...shared, validateParameters:validateCityParameters, survey:surveyCoreCityOperations, id: 'city', label: '城市建设', capabilities: Object.freeze(['C101', 'C102', 'C103', 'C104', 'C116']),
  view: (facts, options) => viewCityDomain('city', facts, options), plan: (facts, options) => planCityDomain('city', facts, options),
  execute: (client, protocol, operation, options) => executeCore('city', client, protocol, operation, options),
  dependencyVersions: options => dependencies('city', options), dependencyKeys: Object.freeze(['moduleConfig', 'config.BuildingCfg', 'config.BuildingUpgradeCfg']),
  evidence: evidence(['src/city-operations.mjs:surveyCityOperations', 'src/city-operations.mjs:cityView', 'src/city-operations.mjs:planCityOperations', 'src/city-operations.mjs:executeCityAction']) });
export const productionModule = Object.freeze({ ...shared, validateParameters:validateProductionParameters, survey:surveyProductionOperations, id: 'production', label: '工厂生产', capabilities: Object.freeze(['C111', 'C113', 'C114', 'C115', 'C116']),
  view: (facts, options) => viewCityDomain('production', facts, options), plan: (facts, options) => planCityDomain('production', facts, options),
  execute: (client, protocol, operation, options) => executeCore('production', client, protocol, operation, options),
  dependencyVersions: options => dependencies('production', options),
  dependencyKeys: Object.freeze(['moduleConfig', 'config.BuildingCfg', 'config.BuildingProduceCfg', 'config.BuildingProduceParamCfg', 'config.AppointEffectCfg', 'config.AppointPosCfg', 'config.HeroCfg', 'config.FarmlandPlantCfg', 'config.SelectPackLibCfg', 'materialSource:config.ItemCfg', 'config.GameParamCfg', 'Automatic:productionPolicy']),
  evidence: evidence(['src/city-operations.mjs:planCityOperations', 'src/city-operations.mjs:executeCityAction', 'src/production-policy.mjs:selectProductionCandidates', 'src/production-policy.mjs:productionDemand']) });
export const CORE_OPERATION_MODULES = Object.freeze({ orders: ordersModule, city: cityModule, production: productionModule });

// BIZ-R14 uses the original production executor after an exact owned-pack receipt.
const productionSources=new WeakMap(),productionHash=value=>createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const productionSame=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const productionOwn=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const productionFields=(v,keys)=>plain(v)&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&productionOwn(v,k));
const productionArray=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const productionText=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
function productionRole(v){const x=toSnapshotJson(v);try{return (typeof v!=='number'||Number.isSafeInteger(v))&&(typeof x==='string'&&/^[1-9][0-9]*$/.test(x)||typeof x==='number'&&Number.isSafeInteger(x)&&x>0)&&BigInt(x)<(1n<<63n)?String(x):null;}catch{return null;}}
function productionScope(client,player){const c=client.factContext,role=k=>productionOwn(player,k)&&(!productionOwn(c,k)||productionRole(c[k])===productionRole(player[k]))?productionRole(player[k]):null;return {accountId:productionText(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:productionText(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId')};}
function productionConfigDigest({config,moduleConfig}){return productionHash({moduleConfig:settings(moduleConfig),tables:tableVersions(config,['BuildingCfg','BuildingProduceCfg','BuildingProduceParamCfg','GameParamCfg','AppointEffectCfg','AppointPosCfg','HeroCfg','FarmlandPlantCfg','SelectPackLibCfg','ItemCfg'])});}
function productionFactsDigest(f){return productionHash({water:f.rawOnWater,items:f.rawAllItem,resources:f.rawAllResource,stock:[...f.stock],reliability:f.cityReliability,buildings:f.buildings,factories:f.factories,stockCap:f.stockCap,factorySlots:f.factorySlots,strict:f.productionInventoryReliable,stockReliable:f.stockReliable});}
function productionAuthority(f,options){const live=productionSources.get(f),c=live?.context;return live&&live.client.connected===true&&f.have===live.have&&c&&Object.values(c).every(v=>v!==null)&&Date.now()>=live.at&&Date.now()-live.at<=30000&&productionSame(c,productionScope(live.client,live.player))&&f.stockReliable===true&&f.productionInventoryReliable===true&&f.stock instanceof Map&&live.digest===productionFactsDigest(f)&&live.dependencies===productionConfigDigest(options)?live:null;}
export function validateProductionParameters(value={}){
 if(!productionFields(value,['buildingId','productId','materialSource','action','expectedCollectionHash','index','expectedAccelerationHash']))throw invalid('生产参数仅允许空对象、原生产目标、固定材料来源或明确成品领取');
 if(value.action==='speedUpProduce'||productionOwn(value,'expectedAccelerationHash')||productionOwn(value,'index')){
  if(!productionFields(value,['buildingId','action','index','expectedAccelerationHash'])||Reflect.ownKeys(value).length!==4||value.action!=='speedUpProduce'||!productionText(value.buildingId)||!Number.isSafeInteger(value.index)||value.index<0||value.index>2147483647||typeof value.expectedAccelerationHash!=='string'||!/^[a-f0-9]{64}$/.test(value.expectedAccelerationHash))throw invalid('生产道具加速须明确工厂、原队列index及状态成本摘要');
  return {buildingId:value.buildingId,action:'speedUpProduce',index:value.index,expectedAccelerationHash:value.expectedAccelerationHash};
 }
 if(productionOwn(value,'action')||productionOwn(value,'expectedCollectionHash')){
  if(!productionFields(value,['buildingId','action','expectedCollectionHash'])||Reflect.ownKeys(value).length!==3||value.action!=='collect'||!productionText(value.buildingId)||typeof value.expectedCollectionHash!=='string'||!/^[a-f0-9]{64}$/.test(value.expectedCollectionHash))throw invalid('成品领取须明确工厂、collect及原批次摘要，不混生产配方或材料来源');
  return {buildingId:value.buildingId,action:'collect',expectedCollectionHash:value.expectedCollectionHash};
 }
 if(Reflect.ownKeys(value).length===0)return {};
 if(!productionOwn(value,'materialSource')){if(!['buildingId','productId'].every(k=>productionOwn(value,k)&&productionText(value[k])))throw invalid('定点生产须同时指定明确工厂和产品');return {buildingId:value.buildingId,productId:value.productId};}
 if(!['buildingId','productId','materialSource'].every(k=>productionOwn(value,k))||!productionText(value.buildingId)||!productionText(value.productId)||!productionFields(value.materialSource,['exchangeIdentity','productionIdentity','exchangeIdentities'])||!['exchangeIdentity','productionIdentity'].every(k=>productionOwn(value.materialSource,k)&&typeof value.materialSource[k]==='string'&&/^[a-f0-9]{64}$/.test(value.materialSource[k])))throw invalid('组合生产须明确工厂、产品和完整固定来源摘要');
 if(productionOwn(value.materialSource,'exchangeIdentities')){const ids=value.materialSource.exchangeIdentities;if(!productionArray(ids)||ids.length<2||ids.length>23||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))||new Set(ids).size!==ids.length||ids.at(-1)!==value.materialSource.exchangeIdentity)throw invalid('多项兑换须保留完整有序来源及最终摘要');}
 return structuredClone(value);
}
function productionQuote(f,options,buildingId,productId){
 const live=productionAuthority(f,options);if(!live||!live.available.includes('StartFactoryProduceRequest'))return null;
 const view=cityView(f,options),factory=view.factories.find(row=>row.buildingId===buildingId),raw=f.rawOnWater?.building?.filter(row=>row.buildingId===buildingId),recipes=options.config?.tables?.BuildingProduceCfg?.data?.filter(row=>row.buildType===factory?.type&&row.itemId===productId);
 if(!factory?.reliable||factory.status==='AUTO'||!Number.isSafeInteger(factory.freeSlots)||factory.freeSlots<1||raw?.length!==1||recipes?.length!==1||factory.queue.some(row=>row.productId===productId)||!Number.isSafeInteger(f.stockCap)||f.stockCap<=0||(f.stock.get(productId)??0)>=f.stockCap)return null;
 const recipe=recipes[0];if(!['buildType','itemId','unlockLevel','produceTime','costItem'].every(k=>productionOwn(recipe,k))||!Number.isSafeInteger(recipe.unlockLevel)||recipe.unlockLevel<0||factory.level<recipe.unlockLevel||!Number.isSafeInteger(recipe.produceTime)||recipe.produceTime<0)return null;
 let costs;try{costs=productionRecipeCosts(recipe);assertPaymentAllowed({request:'StartFactoryProduceRequest',body:{buildingId,productId},costs});}catch{return null;}
 const identity=productionHash({context:live.context,factory:raw[0],recipe,dependencies:live.dependencies});return {identity,costs,factory,recipe};
}
function boundProductionCandidates(f,options,rows){
 const parameters=validateProductionParameters(options.parameters);if(parameters.action==='speedUpProduce')return rows.filter(row=>row.actionType==='speedUpProduce'&&row.target.buildingId===parameters.buildingId&&row.target.index===parameters.index&&productionAccelerationHash(f,options,row)===parameters.expectedAccelerationHash);if(parameters.action==='collect')return rows.filter(row=>row.actionType==='gainFactory'&&row.target?.buildingId===parameters.buildingId&&productionCollectionHash(f,options,row)===parameters.expectedCollectionHash);if(!parameters.materialSource)return parameters.buildingId?rows.filter(row=>row.actionType==='startProduce'&&row.target?.buildingId===parameters.buildingId&&row.target?.productId===parameters.productId):rows;
 const live=productionAuthority(f,options),quote=productionQuote(f,options,parameters.buildingId,parameters.productId);if(!live||!quote||quote.identity!==parameters.materialSource.productionIdentity||typeof live.read!=='function')return [];
 let runs;try{runs=live.read();}catch{return [];}
 const identities=parameters.materialSource.exchangeIdentities,settlement=identities?confirmedMaterialPackSequence(runs,live.context,identities,options.config):confirmedMaterialPackSettlement(runs,live.context,parameters.materialSource.exchangeIdentity,options.config);
 const inventory=[...f.stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
 if(!settlement||!productionSame(settlement.state.inventory,inventory))return [];
 const consumed=runs.some(run=>run?.accountId===live.context.accountId&&!(settlement.runIds??[settlement.runId]).includes(run.runId)&&productionSame(run.executionContext&&{...run.executionContext,playerId:productionRole(run.executionContext.playerId),worldId:productionRole(run.executionContext.worldId)},live.context)&&run.actions?.some(row=>row.dispatched===true&&(Date.parse(run.finishedAt??run.startedAt)>=Date.parse(settlement.finishedAt)||row.parameters?.materialSource?.exchangeIdentity===settlement.identity)));
 if(consumed)return [];
 return rows.filter(row=>row.actionType==='startProduce'&&row.target?.buildingId===parameters.buildingId&&row.target?.productId===parameters.productId&&productionSame(row.costs,quote.costs));
}

// Explicit finite starts reuse the original production quote, city planner and shared ledger.
function productionStartTargets(f,options){
 if(options.parameters?.materialSource||!settings(options.moduleConfig).enabled||!productionAuthority(f,options))return [];
 return cityView(f,options).candidates.filter(row=>row.actionType==='startProduce').flatMap(row=>{const parameters={buildingId:row.target.buildingId,productId:row.target.productId},quote=productionQuote(f,options,parameters.buildingId,parameters.productId);return quote&&productionSame(quote.costs,row.costs)?[{parameters,costs:structuredClone(row.costs),executable:true}]:[];});
}
export function validateProductionStartPreparation(value){
 if(productionOwn(value,'action')&&value.action==='speedUpProduce')return validateProductionAccelerationPreparation(value);
 if(productionOwn(value,'action'))return validateProductionCollectionPreparation(value);
 if(!productionFields(value,['targets','maxDurationMs'])||Reflect.ownKeys(value).length!==2||!productionArray(value.targets)||value.targets.length<1||value.targets.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('生产组合须明确1至24个工厂配方及有限总时长');
 const targets=value.targets.map(row=>{const p=validateProductionParameters(row);if(!p.buildingId||!p.productId||p.materialSource||p.action)throw invalid('本组合仅使用当前自有材料，各厂须明确一个普通单份配方');return p;});
 if(new Set(targets.map(row=>row.buildingId)).size!==targets.length)throw invalid('每个明确工厂只允许一份生产，不重复占用队列位');return {targets,maxDurationMs:value.maxDurationMs};
}
export function prepareProductionStartWorkflow(f,{config,moduleConfig=defaultConfig,...input}={}){
 if(input?.action==='speedUpProduce')return prepareProductionAccelerationWorkflow(f,{config,moduleConfig,...input});
 if(productionOwn(input,'action'))return prepareProductionCollectionWorkflow(f,{config,moduleConfig,...input});
 const p=validateProductionStartPreparation(input),options={config,moduleConfig},targets=productionStartTargets(f,options),ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),nodes=[{id:'start',type:'START'}];
 if(!productionAuthority(f,options)||!settings(moduleConfig).enabled)throw invalid('须使用当前账号完整生产来源并启用原生产模块');
 const steps=p.targets.map((parameters,i)=>{const source=targets.find(row=>productionSame(row.parameters,parameters));if(!source)throw invalid('所选工厂或配方当前不能按原合同启动一份生产');
  const candidates=domainCandidates('production',f,{...options,parameters}),matches=candidates.filter(row=>row.actionType==='startProduce'&&row.target.buildingId===parameters.buildingId&&row.target.productId===parameters.productId);
  if(matches.length!==1)throw invalid('生产目标须对应唯一原候选');
  const planned=planCityDomain('production',f,{...options,mode:'Manual',parameters,selections:[matches[0].actionId],ledger});
  if(planned.actions.length!==1||!productionSame(planned.actions[0].costs,source.costs))throw invalid('当前自有材料不足以覆盖所选工厂累计单份生产成本');
  const selection={unique:true};nodes.push({id:'produce-'+i,type:'ACTION',module:'production',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'production'});return {parameters,selection,costs:structuredClone(source.costs)};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:[]};
 return {...p,steps,budget,graph:{version:1,id:'production-starts-'+productionHash({p,steps,budget}).slice(0,20),name:'明确多工厂各单份生产',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['production']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'每个明确工厂只启动指定配方一份，原planCityOperations与共享ResourceLedger按初始自有材料累计预留；每步原Function重新调查队列、配方、完整库存，重新预览及单次授权，由原生产执行器独立验证精确扣料与队列新增。预算不足、资格变化、拒绝或UNKNOWN停止，不重复生产、不领取/加速/补购/兑换，不预测产出或全天收益，收入不扩父预算，重启只读。'};
}


// Collection composes only the existing gainFactory candidate and original verifier.
// Bind each selected factory, leaving other selected factories and incoming stock out
// of its guard so a confirmed earlier collection does not invalidate a later step.
function productionCollectionHash(f,options,row){
 const live=productionAuthority(f,options);if(!live||row.actionType!=='gainFactory')return null;
 return productionHash({context:live.context,beforeState:row.beforeState,action:row.action,dependencies:live.dependencies});
}
function productionCollectionTargets(f,options){
 if(options.parameters?.materialSource||!settings(options.moduleConfig).enabled||!productionAuthority(f,options))return [];
 return cityView(f,options).candidates.filter(row=>row.actionType==='gainFactory'&&row.costs.length===0).flatMap(row=>{
  const expectedCollectionHash=productionCollectionHash(f,options,row);return expectedCollectionHash?[{parameters:{buildingId:row.target.buildingId,action:'collect',expectedCollectionHash},actionId:row.actionId,products:structuredClone(row.beforeState.factory.finishedProducts),costs:[],executable:true}]:[];
 });
}
function validateProductionCollectionPreparation(value){
 if(!productionFields(value,['action','targets','maxDurationMs'])||Reflect.ownKeys(value).length!==3||value.action!=='collect'||!productionArray(value.targets)||value.targets.length<1||value.targets.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('成品组合须明确collect、1至24个不同工厂及有限时长');
 const targets=value.targets.map(row=>{const p=validateProductionParameters(row);if(p.action!=='collect')throw invalid('成品组合只接受明确原批次摘要的领取');return p;});
 if(new Set(targets.map(row=>row.buildingId)).size!==targets.length)throw invalid('每个工厂成品仅领取一次');return {action:'collect',targets,maxDurationMs:value.maxDurationMs};
}
function prepareProductionCollectionWorkflow(f,{config,moduleConfig=defaultConfig,...input}={}){
 const p=validateProductionCollectionPreparation(input),options={config,moduleConfig},sources=productionCollectionTargets(f,options),nodes=[{id:'start',type:'START'}],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null);
 if(!productionAuthority(f,options)||!settings(moduleConfig).enabled)throw invalid('须重新调查当前账号完整生产来源并启用原模块');
 const steps=p.targets.map((parameters,i)=>{
  const source=sources.find(row=>productionSame(row.parameters,parameters));if(!source)throw invalid('所选工厂成品、队列或来源已变化');
  const planned=planCityDomain('production',f,{...options,mode:'Manual',parameters,selections:[source.actionId],ledger});
  if(planned.actions.length!==1||planned.actions[0].actionType!=='gainFactory'||planned.actions[0].costs.length)throw invalid('原计划器未确认零成本单厂成品领取');
  const selection={unique:true};nodes.push({id:'collect-'+i,type:'ACTION',module:'production',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'production'});return {parameters,selection,costs:[],products:structuredClone(source.products)};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:[]};
 return {...p,steps,budget,graph:{version:1,id:'production-collections-'+productionHash({p,steps}).slice(0,20),name:'明确多工厂成品逐厂领取',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['production']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'仅领取当前明确工厂成品，原队列及成品摘要逐厂绑定，每项新调查、单次授权及原库存精确净入验证；原仓储上限和部分领取合同保持。零父资源支出，领取收入不扩父预算；成品或队列变化、拒绝或UNKNOWN停止，不排产、加速、补购或重放，重启只读。'};
}

export function validateMaterialProductionPreparation(value){
 const multi=productionOwn(value,'exchanges'),keys=multi?['exchanges','buildingId','productId','maxDurationMs']:['packId','itemId','num','buildingId','productId','maxDurationMs'];
 if(!productionFields(value,keys)||!keys.every(k=>productionOwn(value,k))||!productionText(value.buildingId)||!productionText(value.productId)||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('准备须明确有序兑换、工厂、产品及1至86400000毫秒总时长');
 if(multi){
  if(!productionArray(value.exchanges)||value.exchanges.length<2||value.exchanges.length>23)throw invalid('多项准备须明确2至23项兑换，受原50节点边界限制');
  const exchanges=value.exchanges.map(validateMaterialPackParameters);if(exchanges.some(row=>Object.keys(row).length!==3))throw invalid('每项须明确包、材料及数量');
  return {exchanges,buildingId:value.buildingId,productId:value.productId,maxDurationMs:value.maxDurationMs};
 }
 const parameters=validateMaterialPackParameters({packId:value.packId,itemId:value.itemId,num:value.num});return {...parameters,buildingId:value.buildingId,productId:value.productId,maxDurationMs:value.maxDurationMs};
}
export function prepareMaterialProductionWorkflow(f,packFacts,{config,moduleConfig=defaultConfig,materialPackConfig={enabled:false},...input}={}){
 const p=validateMaterialProductionPreparation(input);if(p.exchanges)return prepareMultipleMaterialProductionWorkflow(f,packFacts,{config,moduleConfig,materialPackConfig,...p});const options={config,moduleConfig},quote=productionQuote(f,options,p.buildingId,p.productId),exchangeParameters={packId:p.packId,itemId:p.itemId,num:p.num},exchange=materialPackModule.view(packFacts,{config,moduleConfig:materialPackConfig,parameters:exchangeParameters}).candidates[0];
 if(!productionAuthority(f,options))throw invalid('生产准备必须使用当前连接的完整私有来源');
 const stock=[...f.stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
 if(!settings(moduleConfig).enabled||!quote||!exchange?.executable||!productionSame(exchange.beforeState?.context,productionSources.get(f)?.context)||!productionSame(exchange.beforeState.inventory,stock))throw invalid('须有同五维真实库存、明确持有包和完整工厂/配方来源；准备不制造可执行库存');
 if((f.stock.get(p.productId)??0)+(p.productId===p.itemId?exchange.gain:0)>=f.stockCap||!quote.costs.some(row=>row.id===p.itemId)||quote.costs.some(row=>{const owned=f.stock.get(row.id)??0,gain=row.id===p.itemId?exchange.gain:0;return !Number.isSafeInteger(owned+gain)||owned+gain<row.num;}))throw invalid('明确兑换不能覆盖本配方；其他实际自有材料必须足额');
 const limits=new Map();for(const cost of [...exchange.costs,...quote.costs]){const num=(limits.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(num))throw invalid('累计成本溢出');limits.set(cost.id,num);}
 const budget={resources:[...limits].map(([id,num])=>({id,num})),quotas:[],uids:[]},parameters={buildingId:p.buildingId,productId:p.productId,materialSource:{exchangeIdentity:exchange.identity,productionIdentity:quote.identity}},nodes=[{id:'start',type:'START'},{id:'exchange',type:'ACTION',module:'material-packs',parameters:exchangeParameters,selection:exchange.actionId},{id:'verify-exchange',type:'VERIFY',module:'material-packs'},{id:'produce',type:'ACTION',module:'production',parameters,selection:{unique:true}},{id:'verify-produce',type:'VERIFY',module:'production'},{id:'stop',type:'STOP'}];
 const graph={version:1,id:'material-production-'+productionHash({p,parameters,budget}).slice(0,20),name:'明确材料包确认后指定单份生产',budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:2,modules:['material-packs','production']},nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))};
 return {source:p,costs:structuredClone(quote.costs),exchange:{actionId:exchange.actionId,gain:exchange.gain,costs:structuredClone(exchange.costs)},graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'固定持有包、材料/包数、工厂/配方及累计支出上限。兑换SUCCESS/CONFIRMED落盘后，以同账号/角色/世界/连接/代次的完整库存和未消费来源重新调查及单独授权生产；投影不当库存，收入不扩大父预算。拒绝、UNKNOWN、来源/成本变化或到限停止；重启只读零重放。'};
}

function prepareMultipleMaterialProductionWorkflow(f,packFacts,{config,moduleConfig,materialPackConfig,...p}){
 const options={config,moduleConfig},live=productionAuthority(f,options),quote=productionQuote(f,options,p.buildingId,p.productId);
 if(!live||!settings(moduleConfig).enabled||!quote)throw invalid('须有当前完整生产来源和固定可用工厂/配方');
 const exchanges=projectMaterialPackPreparations(packFacts,p.exchanges,{config,moduleConfig:materialPackConfig}),stock=[...f.stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num})),last=exchanges.at(-1);
 if(!productionSame(exchanges[0].beforeState,{context:live.context,inventory:stock})||p.exchanges.some(p=>!quote.costs.some(cost=>cost.id===p.itemId)))throw invalid('所有明确材料须属本配方，且生产和材料来源完整一致');
 const final=new Map(last.expectedState.inventory.map(row=>[row.id,row.num]));
 if((final.get(p.productId)??0)>=f.stockCap||quote.costs.some(row=>(final.get(row.id)??0)<row.num))throw invalid('明确多项兑换不能覆盖完整单份配方或已达存量上限');
 const limits=new Map();for(const cost of [...exchanges.flatMap(row=>row.costs),...quote.costs]){const num=(limits.get(cost.id)??0)+cost.num;if(!Number.isSafeInteger(num))throw invalid('累计成本溢出');limits.set(cost.id,num);}
 const budget={resources:[...limits].map(([id,num])=>({id,num})),quotas:[],uids:[]},parameters={buildingId:p.buildingId,productId:p.productId,materialSource:{exchangeIdentity:last.identity,productionIdentity:quote.identity,exchangeIdentities:exchanges.map(row=>row.identity)}},nodes=[{id:'start',type:'START'}];
 exchanges.forEach((row,i)=>nodes.push({id:'exchange-'+i,type:'ACTION',module:'material-packs',parameters:row.parameters,selection:row.actionId},{id:'verify-exchange-'+i,type:'VERIFY',module:'material-packs'}));
 nodes.push({id:'produce',type:'ACTION',module:'production',parameters,selection:{unique:true}},{id:'verify-produce',type:'VERIFY',module:'production'},{id:'stop',type:'STOP'});
 const graph={version:1,id:'material-production-'+productionHash({p,parameters,budget}).slice(0,20),name:'明确多项材料确认后指定单份生产',budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:exchanges.length+1,modules:['material-packs','production']},nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))};
 return {source:p,costs:structuredClone(quote.costs),exchanges:exchanges.map(({actionId,gain,costs})=>({actionId,gain,costs})),graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'固定每项包、材料、数量和顺序，以及同一工厂/配方、累计支出与总期限。每步从实际完整库存重新调查和授权；全部同五维、同Workflow的SUCCESS/CONFIRMED连续结算落盘才允许生产。投影不作库存，收入不扩大父预算；来源变化、拒绝、UNKNOWN或到限即停，重启只读零重放。'};
}

export function validateMaterialExchangeProductionSource(f,state,parameters,identity,runs,options){
 try{
  parameters=validateProductionParameters(parameters);const ids=parameters.materialSource?.exchangeIdentities,index=ids?.indexOf(identity),live=productionAuthority(f,options),quote=productionQuote(f,options,parameters.buildingId,parameters.productId);
  if(!settings(options.moduleConfig).enabled||!live||!quote||quote.identity!==parameters.materialSource.productionIdentity||index===undefined||index<0||!productionSame(state.context,live.context))return false;
  const stock=[...f.stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
  if(!productionSame(stock,state.inventory))return false;
  if(index===0)return true;
  const settled=confirmedMaterialPackSequence(runs.filter(run=>!(run.finalStatus==='EXECUTING'&&run.module==='material-packs'&&run.actions?.length===1&&run.actions[0].identity===identity)),live.context,ids.slice(0,index),options.config);
  return Boolean(settled&&productionSame(settled.state,state));
 }catch{return false;}
}

export function validateMaterialProductionCoverage(value){
 if(!productionFields(value,['buildingId','productId'])||!['buildingId','productId'].every(k=>productionOwn(value,k)&&productionText(value[k])))throw invalid('覆盖建议只接受明确工厂与配方产品');
 return {buildingId:value.buildingId,productId:value.productId};
}
export function materialProductionCoverage(f,packFacts,{config,moduleConfig,materialPackConfig,...input}){
 const target=validateMaterialProductionCoverage(input),options={config,moduleConfig},live=productionAuthority(f,options),quote=productionQuote(f,options,target.buildingId,target.productId);
 if(!live||!settings(moduleConfig).enabled||!quote)throw invalid('覆盖建议须有当前完整私有生产来源、可用工厂和精确配方');
 const material=materialPackModule.view(packFacts,{config,moduleConfig:materialPackConfig,parameters:{}}),stock=[...f.stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
 if(!productionSame(packFacts?.state,{context:live.context,inventory:stock}))throw invalid('生产与材料包必须为同五维完整实际库存');
 const coverage=qualifiedMaterialPackCoverage(packFacts,quote.costs,{config,moduleConfig:materialPackConfig});
 return {target,costs:structuredClone(quote.costs),productionIdentity:quote.identity,coverage,packs:material.packs,season:material.season,executable:false,projectionOnly:true,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'当前持有普通材料包覆盖建议，复用packCoverPlan及原材料包资格；只是缺口与合计包数投影。明确选择并填写期限后，原prepare重新调查完整实际来源并生成有限图；本读取不授权、不派发、不记收入或扩大预算，UNKNOWN不重放。'};
}


// Explicit city compositions retain the original per-building candidate and executor.
const citySources=new WeakMap();
const composedCityKinds=new Set(['build','upgrade','finishUpgrade','collectProduct','speedUpUpgrade']);
export function validateCityParameters(value={}){
 if(!productionFields(value,['buildingId','action','expectedCityHash']))throw invalid('城市参数仅允许空对象或明确建筑、原动作及状态摘要');
 if(!Reflect.ownKeys(value).length)return {};
 if(Reflect.ownKeys(value).length!==3||!productionText(value.buildingId)||!composedCityKinds.has(value.action)||typeof value.expectedCityHash!=='string'||!/^[a-f0-9]{64}$/.test(value.expectedCityHash))throw invalid('明确城市操作须完整建筑、原动作及64位状态摘要');
 return {buildingId:value.buildingId,action:value.action,expectedCityHash:value.expectedCityHash};
}
function cityDependencies(options){return productionHash({moduleConfig:settings(options.moduleConfig),config:tableVersions(options.config,['BuildingCfg','BuildingUpgradeCfg','BuildingProduceParamCfg','GameParamCfg'])});}
export async function surveyCoreCityOperations(client,protocol,options={}){
 validateCityParameters(options.parameters);const scope=productionScope(client,options.player);
 const facts=await surveyCoreOperations(client,protocol,{...options,parameters:{}});assertExecutionActive(client,options);
 if(!productionSame(scope,productionScope(client,options.player)))throw Object.assign(Error('城市调查期间身份变化'),{code:'CANCELLED'});
 citySources.set(facts,{client,player:options.player,scope,at:Date.now(),digest:productionFactsDigest(facts),dependencies:cityDependencies(options)});return facts;
}
function cityAuthority(f,options){const source=citySources.get(f);return source&&source.client.connected===true&&Object.values(source.scope).every(value=>value!==null)&&productionSame(source.scope,productionScope(source.client,source.player))&&Date.now()>=source.at&&Date.now()-source.at<=30000&&source.digest===productionFactsDigest(f)&&source.dependencies===cityDependencies(options)?source:null;}
function cityTargetHash(f,options,row){const source=cityAuthority(f,options);return source&&composedCityKinds.has(row.actionType)?productionHash({context:source.scope,beforeState:row.beforeState,action:row.action,dependencies:source.dependencies}):null;}
function boundCityCandidates(f,options,rows){const p=validateCityParameters(options.parameters);return !p.buildingId?rows:rows.filter(row=>row.actionType===p.action&&row.target.buildingId===p.buildingId&&cityTargetHash(f,options,row)===p.expectedCityHash);}
function cityPreparationTargets(f,options){
 if(!settings(options.moduleConfig).enabled||!cityAuthority(f,options))return [];
 return cityView(f,options).candidates.flatMap(row=>{const expectedCityHash=cityTargetHash(f,options,row);return expectedCityHash?[{parameters:{buildingId:row.target.buildingId,action:row.actionType,expectedCityHash},actionId:row.actionId,label:row.label,costs:structuredClone(row.costs),beforeState:structuredClone(row.beforeState),expectedState:structuredClone(row.expectedState),executable:true}]:[];});
}
export function validateCityPreparation(value){
 if(!productionFields(value,['targets','maxDurationMs'])||Reflect.ownKeys(value).length!==2||!productionArray(value.targets)||value.targets.length<1||value.targets.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('城市组合须明确1至24个不同建筑的当前动作及有限时长');
 const targets=value.targets.map(row=>{const p=validateCityParameters(row);if(!p.buildingId)throw invalid('城市组合须明确完整建筑目标');return p;});
 if(new Set(targets.map(p=>p.buildingId)).size!==targets.length)throw invalid('每个建筑只允许一个当前操作');return {targets,maxDurationMs:value.maxDurationMs};
}
export function prepareCityWorkflow(f,{config,moduleConfig=defaultConfig,...input}={}){
 const p=validateCityPreparation(input),options={config,moduleConfig},sources=cityPreparationTargets(f,options),ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),nodes=[{id:'start',type:'START'}];
 if(!cityAuthority(f,options)||!settings(moduleConfig).enabled)throw invalid('城市组合须重新调查当前完整账号来源并启用原模块');
 const steps=p.targets.map((parameters,i)=>{const source=sources.find(row=>productionSame(row.parameters,parameters));if(!source)throw invalid('城市目标、原状态或配置已变化');const plan=planCityDomain('city',f,{...options,parameters,mode:'Manual',selections:[source.actionId],ledger});if(plan.actions.length!==1||!productionSame(plan.actions[0].costs,source.costs))throw invalid('城市组合初始材料累计不足');
  const selection={unique:true};nodes.push({id:'city-'+i,type:'ACTION',module:'city',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'city'});return {parameters,selection,costs:structuredClone(source.costs),beforeState:source.beforeState,expectedState:source.expectedState};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:[]};
 return {...p,steps,budget,graph:{version:1,id:'city-actions-'+productionHash({p,steps,budget}).slice(0,20),name:'明确城市建筑逐项操作',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['city']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'只组合原计划器当前允许的建造、单级升级、完工、普通建筑产物收取或自有道具加速；每建筑一项、绑定原状态和配置，每步重新调查及单次授权，由原执行器验证成本与结果。原人口、等级、建造位及库存上限仍需逐步满足；加速仅消费原计划器精确数量的自有加速器，不接受RUBY或广告；不预测解锁或未来产物，不补购、自动追加加速或再次领取，收入不扩固定父预算，拒绝或UNKNOWN停止，重启只读。'};
}


function productionAccelerationHash(f,options,row){const live=productionAuthority(f,options);return live&&row.actionType==='speedUpProduce'?productionHash({context:live.context,beforeState:row.beforeState,action:row.action,dependencies:live.dependencies}):null;}
function productionAccelerationTargets(f,options){
 if(!settings(options.moduleConfig).enabled||options.parameters?.materialSource||!productionAuthority(f,options))return [];
 return cityView(f,options).candidates.filter(row=>row.actionType==='speedUpProduce').flatMap(row=>{const expectedAccelerationHash=productionAccelerationHash(f,options,row);return expectedAccelerationHash?[{parameters:{buildingId:row.target.buildingId,action:'speedUpProduce',index:row.target.index,expectedAccelerationHash},actionId:row.actionId,costs:structuredClone(row.costs),beforeState:structuredClone(row.beforeState),expectedState:structuredClone(row.expectedState),executable:true}]:[];});
}
function validateProductionAccelerationPreparation(value){
 if(!productionFields(value,['action','targets','maxDurationMs'])||Reflect.ownKeys(value).length!==3||value.action!=='speedUpProduce'||!productionArray(value.targets)||value.targets.length<1||value.targets.length>24||!Number.isSafeInteger(value.maxDurationMs)||value.maxDurationMs<1||value.maxDurationMs>86400000)throw invalid('生产道具加速组合须明确1至24个不同工厂当前队列及有限总时长');
 const targets=value.targets.map(row=>{const p=validateProductionParameters(row);if(p.action!=='speedUpProduce')throw invalid('仅允许明确原生产队列道具加速');return p;});if(new Set(targets.map(row=>row.buildingId)).size!==targets.length)throw invalid('每工厂仅允许一个当前队列的一次道具加速');return {action:'speedUpProduce',targets,maxDurationMs:value.maxDurationMs};
}
function prepareProductionAccelerationWorkflow(f,{config,moduleConfig=defaultConfig,...input}={}){
 const p=validateProductionAccelerationPreparation(input),options={config,moduleConfig},sources=productionAccelerationTargets(f,options),ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),nodes=[{id:'start',type:'START'}];if(!productionAuthority(f,options)||!settings(moduleConfig).enabled)throw invalid('生产道具加速须使用当前完整私有来源');
 const steps=p.targets.map((parameters,i)=>{const source=sources.find(row=>productionSame(row.parameters,parameters));if(!source)throw invalid('生产队列、原道具数量或配置已变化');const planned=planCityDomain('production',f,{...options,mode:'Manual',parameters,selections:[source.actionId],ledger});if(planned.actions.length!==1||!productionSame(planned.actions[0].costs,source.costs))throw invalid('初始自有加速器不足以覆盖明确累计成本');const selection={unique:true};nodes.push({id:'accelerate-'+i,type:'ACTION',module:'production',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'production'});return {parameters,selection,costs:structuredClone(source.costs),beforeState:source.beforeState,expectedState:source.expectedState};});nodes.push({id:'stop',type:'STOP'});const budget={resources:[...ledger.reserved].filter(([,num])=>num>0).map(([id,num])=>({id,num})),quotas:[],uids:[]};
 return {...p,steps,budget,graph:{version:1,id:'production-acceleration-'+productionHash({p,steps,budget}).slice(0,20),name:'明确多工厂当前队列道具加速',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:['production']}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'每工厂仅一次指定当前队列加速，原planWorld计算精确自有加速器数量及type=2，原计划器/Ledger累计核初始持有量。每项重新调查、单次授权、完整库存精确道具净扣及原队列变化验证；剩余时间使原数量变化即停止，不推断全部完成或领取，不接受RUBY/广告/补购或自动追加，收入不扩预算，拒绝或UNKNOWN停止，重启只读。'};
}
