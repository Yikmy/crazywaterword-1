// Account-local selection policy over existing city candidates. No protocol or scheduler.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';
import { cropSupplyPlan, validateCropSupplyPolicy } from './production-planning.mjs';

export const PRODUCTION_POLICY_PATH = path.join(DATA_DIR, 'production-policy.json');
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value) => typeof value === 'string' && value.trim() === value && value.length > 0
  && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const defaultProductionPolicy = () => ({ version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 });
export function validateProductionPolicy(policy) {
  if (!record(policy) || Object.keys(policy).some((key) => !['version', 'enabled', 'onlyShortages', 'productIds', 'maxOperations', 'cropSupply'].includes(key))
    || policy.version !== 1 || typeof policy.enabled !== 'boolean' || typeof policy.onlyShortages !== 'boolean'
    || !Array.isArray(policy.productIds) || policy.productIds.length > 1000 || policy.productIds.some((id) => !validId(id))
    || new Set(policy.productIds).size !== policy.productIds.length || !Number.isSafeInteger(policy.maxOperations)
    || policy.maxOperations < 1 || policy.maxOperations > 100) throw invalid('生产策略格式无效');
  let cropSupply;
  if (Object.hasOwn(policy, 'cropSupply')) {
    const value = policy.cropSupply;
    if (!record(value) || typeof value.enabled !== 'boolean') throw invalid('作物供给策略需明确 enabled 和有限水位/种子/份数');
    const {enabled, ...limits} = value;
    try { cropSupply = {enabled, ...validateCropSupplyPolicy(limits)}; } catch { throw invalid('作物水位、种子储备或过剩份数无效'); }
    if (enabled && !policy.onlyShortages) throw invalid('作物供给策略需要启用仅生产需求模式');
  }
  return { version: 1, enabled: policy.enabled, onlyShortages: policy.onlyShortages, productIds: [...policy.productIds], maxOperations: policy.maxOperations, ...(cropSupply ? {cropSupply} : {}) };
}
function requireAccountId(accountId) {
  if (!validId(accountId)) throw invalid('生产策略必须使用有效的精确账号 ID');
}
function readStore() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { store: { version: 1, accounts: Object.create(null) }, warning: null };
    return { store: null, warning: '生产策略文件损坏或无法读取，已使用禁用默认配置；原文件未修改' };
  }
  if (!record(raw) || raw.version !== 1 || !record(raw.accounts)
    || Object.keys(raw).some((key) => key !== 'version' && key !== 'accounts')) return { store: null, warning: '生产策略存储版本或格式无效，已使用禁用默认配置；原文件未修改' };
  return { store: { version: 1, accounts: Object.assign(Object.create(null), raw.accounts) }, warning: null };
}
export function loadProductionPolicy(accountId) {
  requireAccountId(accountId);
  const { store, warning } = readStore();
  if (!store || !Object.hasOwn(store.accounts, accountId)) return { config: defaultProductionPolicy(), source: 'default', warning };
  try { return { config: validateProductionPolicy(store.accounts[accountId]), source: 'account', warning: null }; }
  catch { return { config: defaultProductionPolicy(), source: 'default', warning: '本账号生产策略无效，已使用禁用默认配置；其他账号不受影响' }; }
}
export function saveProductionPolicy(accountId, policy) {
  requireAccountId(accountId);
  const config = validateProductionPolicy(policy), { store, warning } = readStore();
  if (!store) throw invalid('原生产策略文件不可安全更新，未覆盖任何配置', 409);
  store.accounts[accountId] = config;
  const temporary = `${PRODUCTION_POLICY_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, PRODUCTION_POLICY_PATH);
  } catch { throw invalid('生产策略保存失败，原配置未替换', 500); }
  finally { try { fs.unlinkSync(temporary); } catch {} }
  return { config, source: 'account', warning };
}

// Existing OnWater queue entries represent one production unit (gameplay.md §12).
// Count outstanding queues and finished stock so repeated planning does not keep
// recommending already-covered demand. Unknown global facts never become zero.
export function productionShortages(survey) {
  const unknown = () => ({ reliable: false, items: [], notes: ['需求、库存或生产队列不完整，缺口数量未知。'] });
  if (survey?.stockReliable !== true || !(survey.stock instanceof Map) || survey.orderReliability?.orders !== true
    || !Array.isArray(survey.orders) || survey.cityReliability?.buildings !== true || !Array.isArray(survey.factories)) return unknown();
  const requirements = [];
  for (const order of survey.orders) {
    if (!Array.isArray(order?.requirements) || !order.requirements.length || order.requirements.some((r) => !validId(r?.id)
      || safeResourceQuantity(r.num) === null || safeResourceQuantity(r.num) === 0)) return unknown();
    requirements.push(...order.requirements);
  }
  let demand;
  try { demand = resourceCosts(requirements); } catch { return unknown(); }
  const supply = productionSupply(survey); if (!supply) return unknown();
  const {projected, inProgress, finished} = supply;
  const items = [];
  for (const { id, num } of demand) {
    const amount = safeResourceQuantity(projected.has(id) ? projected.get(id) : 0);
    if (amount === null) return unknown();
    items.push({ id, required: num, inventory: safeResourceQuantity(survey.stock.has(id) ? survey.stock.get(id) : 0),
      inProgress: inProgress.get(id) ?? 0, finished: finished.get(id) ?? 0, missing: Math.max(0, num - amount) });
  }
  return { reliable: true, items, notes: [] };
}
// Queue/finished stock is a coverage projection only, never spendable inventory.
function productionSupply(survey) {
  if (survey?.stockReliable !== true || !(survey.stock instanceof Map) || survey.cityReliability?.buildings !== true || !Array.isArray(survey.factories)) return null;
  const projected = new Map(survey.stock), inProgress = new Map(), finished = new Map();
  const add = (id, amount) => {
    const previous = safeResourceQuantity(projected.has(id) ? projected.get(id) : 0), num = safeResourceQuantity(amount);
    if (previous === null || num === null || !Number.isSafeInteger(previous + num)) return false;
    projected.set(id, previous + num); return true;
  };
  for (const factory of survey.factories) {
    const reliability = survey.cityReliability.byBuilding?.[factory.buildingId];
    if (!reliability?.factory || !reliability.queue || !reliability.finishedProducts
      || !Array.isArray(factory.factory?.factoryQ) || !Array.isArray(factory.factory?.finishedProducts)) return null;
    for (const job of factory.factory.factoryQ) {
      if (!validId(job?.productId) || !add(job.productId, 1)) return null;
      inProgress.set(job.productId, (inProgress.get(job.productId) ?? 0) + 1);
    }
    for (const product of factory.factory.finishedProducts) {
      if (!validId(product?.id) || !add(product.id, product.num)) return null;
      finished.set(product.id, (finished.get(product.id) ?? 0) + safeResourceQuantity(product.num));
    }
  }
  return {projected, inProgress, finished};
}
export function productionDemand(survey, {policy, config} = {}) {
  const settings = validateProductionPolicy(policy ?? defaultProductionPolicy()), orders = productionShortages(survey);
  if (!settings.cropSupply?.enabled || !orders.reliable) return orders;
  const supply = productionSupply(survey), requirements = resourceCosts(survey.orders.flatMap(row => row.requirements));
  const available = new Map(survey.stock);
  for (const {id, num} of requirements) {
    const current = safeResourceQuantity(available.get(id) ?? 0);
    if (current === null) return {...orders, cropSupply:{reliable:false,reason:'ORDER_RESERVATION_UNKNOWN'}};
    available.set(id, Math.max(0, current - num));
  }
  const buildings = survey.buildings, farmsReliable = Array.isArray(buildings) && survey.cityReliability.buildings === true
    && buildings.every(row => survey.cityReliability.byBuilding?.[row.buildingId]?.base === true);
  const {enabled, ...limits} = settings.cropSupply;
  const crop = cropSupplyPlan(config, {stock:available, buildings, farmsReliable, policy:limits});
  if (!crop.reliable || !supply) return {...orders, cropSupply:crop};
  const items = new Map(orders.items.map(row => [row.id, {...row, orderMissing:row.missing, seedTargetMissing:0, surplusTargetMissing:0, sources:['ORDERS']} ]));
  const required = new Map(requirements.map(row => [row.id,row.num]));
  const rowFor = id => {
    if (!items.has(id)) items.set(id, {id,required:0,inventory:safeResourceQuantity(survey.stock.get(id) ?? 0),inProgress:supply.inProgress.get(id) ?? 0,finished:supply.finished.get(id) ?? 0,
      missing:0,orderMissing:0,seedTargetMissing:0,surplusTargetMissing:0,sources:[]});
    return items.get(id);
  };
  for (const seed of crop.seedDemand) {
    const total = (required.get(seed.itemId) ?? 0) + seed.required, projected = safeResourceQuantity(supply.projected.get(seed.itemId) ?? 0);
    if (!Number.isSafeInteger(total) || projected === null) continue;
    const row = rowFor(seed.itemId); row.seedTargetMissing = Math.max(row.seedTargetMissing, total - projected, 0);row.required = Math.max(row.required,total);
    if (!row.sources.includes('SEED_RESERVE')) row.sources.push('SEED_RESERVE');
  }
  for (const surplus of crop.surplusDemand) {
    const row = rowFor(surplus.itemId), pending = row.inProgress + row.finished;
    if (!Number.isSafeInteger(pending)) continue;
    const additional = Math.min(surplus.maximumUnits, Math.max(0, limits.maxSurplusPerRecipe - pending));
    row.surplusTargetMissing = Math.max(row.surplusTargetMissing, additional);
    const target = row.inventory + pending + additional;
    if (!Number.isSafeInteger(target)) {row.surplusTargetMissing = 0;continue;}
    row.required = Math.max(row.required,target);
    if (!row.sources.includes('SURPLUS_CROP')) row.sources.push('SURPLUS_CROP');
  }
  for (const row of items.values()) row.missing = Math.max(row.missing,row.seedTargetMissing,row.surplusTargetMissing);
  return {...orders,items:[...items.values()],cropSupply:crop};
}
export function selectProductionCandidates(survey, { policy, candidates = [], config: gameConfig } = {}) {
  const config = validateProductionPolicy(policy ?? defaultProductionPolicy());
  if (!config.enabled) return [];
  if (!Array.isArray(candidates)) throw invalid('生产候选必须为数组');
  const shortageView = config.onlyShortages ? productionDemand(survey,{policy:config,config:gameConfig}) : null;
  if (config.onlyShortages && shortageView.reliable !== true) return [];
  const missing = shortageView ? new Map(shortageView.items.filter((r) => r.missing > 0).map((r) => [r.id, r.missing])) : null;
  const demands = new Map(shortageView?.items.map(row=>[row.id,row]) ?? []), crop = shortageView?.cropSupply;
  const remaining = crop?.reliable ? new Map(survey.stock) : null;
  let strategyAvailable = Boolean(remaining);
  if (remaining) for (const {id,num} of resourceCosts(survey.orders.flatMap(row=>row.requirements))) remaining.set(id,Math.max(0,safeResourceQuantity(remaining.get(id) ?? 0)-num));
  const allowed = new Set(config.productIds), selected = [], factories = new Set(), covered = new Map();
  const rank = candidate => { const row=demands.get(candidate.target.productId);return !config.cropSupply?.enabled||(row?.orderMissing ?? row?.missing ?? 0)>0?0:row?.seedTargetMissing>0?1:2; };
  const available = candidates.filter((candidate) => candidate?.actionType === 'startProduce'
    && validId(candidate.actionId) && validId(candidate.target?.buildingId) && validId(candidate.target?.productId)
    && (!allowed.size || allowed.has(candidate.target.productId))
    && (!config.onlyShortages || missing.has(candidate.target.productId)))
    .sort((a, b) => rank(a)-rank(b) || (missing?.get(b.target.productId) ?? 0) - (missing?.get(a.target.productId) ?? 0)
      || a.actionId.localeCompare(b.actionId));
  for (const candidate of available) {
    const { buildingId, productId } = candidate.target, count = covered.get(productId) ?? 0;
    if (selected.length >= config.maxOperations) break;
    if (factories.has(buildingId) || config.onlyShortages && count >= missing.get(productId)) continue;
    let costs;try{costs=resourceCosts(candidate.costs);}catch{costs=null;}
    const demand=demands.get(productId), strategyOnly=config.cropSupply?.enabled && count >= (demand?.orderMissing ?? demand?.missing ?? 0);
    if (strategyOnly) {
      if (!strategyAvailable || !costs) continue;
      const type=survey.buildings.find(row=>row.buildingId===buildingId)?.type;
      const seed=type==='种子厂'&&count<demand.seedTargetMissing;
      const surplus=crop.surplusDemand.find(row=>row.itemId===productId&&row.buildType===type);
      if (!seed && (!surplus || count>=demand.surplusTargetMissing)) continue;
      const recipes=gameConfig?.tables?.BuildingProduceCfg?.data?.filter(row=>row.itemId===productId&&row.buildType===type) ?? [];
      let expected;try{expected=recipes.length===1?resourceCosts(recipes[0].costItem):null;}catch{expected=null;}
      const costKey=rows=>JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)));
      if (!expected || costKey(costs)!==costKey(expected) || costs.some(row=>['RUBY','钻石','4'].includes(row.id))) continue;
      if (costs.some(row=>safeResourceQuantity(remaining.get(row.id) ?? 0)===null || (remaining.get(row.id) ?? 0)<row.num)) continue;
      if (!seed && costs.some(cost=>{const line=crop.waterlines.find(row=>row.cropId===cost.id);return line && (line.target===null || remaining.get(cost.id)-cost.num<line.target);} )) continue;
    }
    selected.push(candidate.actionId); factories.add(buildingId); covered.set(productId, count + 1);
    if (remaining) {
      if (!costs) strategyAvailable = false;
      else for (const {id,num} of costs) {const current=safeResourceQuantity(remaining.get(id) ?? 0);remaining.set(id,current===null?null:Math.max(0,current-num));}
    }
  }
  return selected;
}
