// Account-local selection policy over existing city candidates. No protocol or scheduler.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { resourceCosts, safeResourceQuantity } from './resource-ledger.mjs';

export const PRODUCTION_POLICY_PATH = path.join(DATA_DIR, 'production-policy.json');
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value) => typeof value === 'string' && value.trim() === value && value.length > 0
  && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const defaultProductionPolicy = () => ({ version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 });
export function validateProductionPolicy(policy) {
  if (!record(policy) || Object.keys(policy).some((key) => !['version', 'enabled', 'onlyShortages', 'productIds', 'maxOperations'].includes(key))
    || policy.version !== 1 || typeof policy.enabled !== 'boolean' || typeof policy.onlyShortages !== 'boolean'
    || !Array.isArray(policy.productIds) || policy.productIds.length > 1000 || policy.productIds.some((id) => !validId(id))
    || new Set(policy.productIds).size !== policy.productIds.length || !Number.isSafeInteger(policy.maxOperations)
    || policy.maxOperations < 1 || policy.maxOperations > 100) throw invalid('生产策略格式无效');
  return { version: 1, enabled: policy.enabled, onlyShortages: policy.onlyShortages, productIds: [...policy.productIds], maxOperations: policy.maxOperations };
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
  const projected = new Map(survey.stock), inProgress = new Map(), finished = new Map();
  const add = (id, amount) => {
    const previous = safeResourceQuantity(projected.has(id) ? projected.get(id) : 0), num = safeResourceQuantity(amount);
    if (previous === null || num === null || !Number.isSafeInteger(previous + num)) return false;
    projected.set(id, previous + num); return true;
  };
  for (const factory of survey.factories) {
    const reliability = survey.cityReliability.byBuilding?.[factory.buildingId];
    if (!reliability?.factory || !reliability.queue || !reliability.finishedProducts
      || !Array.isArray(factory.factory?.factoryQ) || !Array.isArray(factory.factory?.finishedProducts)) return unknown();
    for (const job of factory.factory.factoryQ) {
      if (!validId(job?.productId) || !add(job.productId, 1)) return unknown();
      inProgress.set(job.productId, (inProgress.get(job.productId) ?? 0) + 1);
    }
    for (const product of factory.factory.finishedProducts) {
      if (!validId(product?.id) || !add(product.id, product.num)) return unknown();
      finished.set(product.id, (finished.get(product.id) ?? 0) + safeResourceQuantity(product.num));
    }
  }
  const items = [];
  for (const { id, num } of demand) {
    const amount = safeResourceQuantity(projected.has(id) ? projected.get(id) : 0);
    if (amount === null) return unknown();
    items.push({ id, required: num, inventory: safeResourceQuantity(survey.stock.has(id) ? survey.stock.get(id) : 0),
      inProgress: inProgress.get(id) ?? 0, finished: finished.get(id) ?? 0, missing: Math.max(0, num - amount) });
  }
  return { reliable: true, items, notes: [] };
}
export function selectProductionCandidates(survey, { policy, candidates = [] } = {}) {
  const config = validateProductionPolicy(policy ?? defaultProductionPolicy());
  if (!config.enabled) return [];
  if (!Array.isArray(candidates)) throw invalid('生产候选必须为数组');
  const shortageView = config.onlyShortages ? productionShortages(survey) : null;
  if (config.onlyShortages && shortageView.reliable !== true) return [];
  const missing = shortageView ? new Map(shortageView.items.filter((r) => r.missing > 0).map((r) => [r.id, r.missing])) : null;
  const allowed = new Set(config.productIds), selected = [], factories = new Set(), covered = new Map();
  const available = candidates.filter((candidate) => candidate?.actionType === 'startProduce'
    && validId(candidate.actionId) && validId(candidate.target?.buildingId) && validId(candidate.target?.productId)
    && (!allowed.size || allowed.has(candidate.target.productId))
    && (!config.onlyShortages || missing.has(candidate.target.productId)))
    .sort((a, b) => (missing?.get(b.target.productId) ?? 0) - (missing?.get(a.target.productId) ?? 0)
      || a.actionId.localeCompare(b.actionId));
  for (const candidate of available) {
    const { buildingId, productId } = candidate.target;
    if (selected.length >= config.maxOperations) break;
    if (factories.has(buildingId) || config.onlyShortages && (covered.get(productId) ?? 0) >= missing.get(productId)) continue;
    selected.push(candidate.actionId); factories.add(buildingId); covered.set(productId, (covered.get(productId) ?? 0) + 1);
  }
  return selected;
}