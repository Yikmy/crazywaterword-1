// Resident-order policy only: deterministic decisions over an existing parsed order.
// No account, network, persistence or game Action dependencies.
export const ORDER_RULE_TYPES = Object.freeze([
  { type: 'ITEM_FORBIDDEN', label: '禁止使用物品' },
  { type: 'ITEM_REQUIRED', label: '必须包含物品' },
  { type: 'MIN_EXPERIENCE', label: '经验要求' },
  { type: 'MAX_ITEM_COUNT', label: '指定物品数量上限' },
  { type: 'INVENTORY_AVAILABLE', label: '库存充足' },
].map(Object.freeze));

const types = new Set(ORDER_RULE_TYPES.map(({ type }) => type));
const failActions = new Set(['KEEP', 'REFRESH', 'REVIEW']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const text = (value) => typeof value === 'string' && value.length <= 128 && value.trim().length > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const keysOnly = (value, keys) => Object.keys(value).every((key) => keys.includes(key));

export function defaultOrderRules() { return { version: 1, enabled: false, rules: [] }; }

function invalid(message) {
  const error = new Error('居民订单规则配置无效：' + message);
  error.statusCode = 400;
  throw error;
}

// Return a fresh canonical configuration. Unknown versions/types fail closed.
export function validateOrderRules(config) {
  if (!object(config) || !keysOnly(config, ['version', 'enabled', 'rules'])
      || config.version !== 1 || typeof config.enabled !== 'boolean' || !Array.isArray(config.rules)
      || config.rules.length > 100) invalid('需要 version=1、enabled 和最多 100 条 rules');
  const ids = new Set(), priorities = new Set();
  const rules = config.rules.map((rule) => {
    if (!object(rule) || !keysOnly(rule, ['id', 'priority', 'type', 'enabled', 'params', 'onFail'])
        || !text(rule.id) || !Number.isSafeInteger(rule.priority) || rule.priority < 1
        || rule.priority > 10000 || !types.has(rule.type) || typeof rule.enabled !== 'boolean'
        || !failActions.has(rule.onFail) || !object(rule.params)) invalid('规则字段或类型不受支持');
    if (ids.has(rule.id) || priorities.has(rule.priority)) invalid('规则 ID 和优先级必须唯一');
    ids.add(rule.id); priorities.add(rule.priority);
    const params = rule.params;
    let clean;
    if (rule.type === 'ITEM_FORBIDDEN' || rule.type === 'ITEM_REQUIRED') {
      if (!keysOnly(params, ['itemIds']) || !Array.isArray(params.itemIds) || !params.itemIds.length
          || params.itemIds.length > 100 || params.itemIds.some((id) => !text(id))) invalid('物品规则需要明确的原始物品 ID');
      clean = { itemIds: [...new Set(params.itemIds)] };
    } else if (rule.type === 'MIN_EXPERIENCE') {
      if (!keysOnly(params, ['value', 'operator']) || !count(params.value) || !['GT', 'GTE'].includes(params.operator)) invalid('经验规则需要非负安全整数及 GT/GTE');
      clean = { value: params.value, operator: params.operator };
    } else if (rule.type === 'MAX_ITEM_COUNT') {
      if (!keysOnly(params, ['itemId', 'value']) || !text(params.itemId) || !count(params.value)) invalid('数量上限需要原始物品 ID 和非负安全整数');
      clean = { itemId: params.itemId, value: params.value };
    } else {
      if (!keysOnly(params, [])) invalid('库存规则不接受额外参数');
      clean = {};
    }
    return { id: rule.id, priority: rule.priority, type: rule.type, enabled: rule.enabled, params: clean, onFail: rule.onFail };
  }).sort((a, b) => a.priority - b.priority);
  return { version: 1, enabled: config.enabled, rules };
}

function orderInput(order) {
  if (!object(order) || !(text(order.index) || count(order.index))) return { error: '订单 ID 缺失或不合法' };
  if (!Array.isArray(order.requirements) || !order.requirements.length) return { error: '订单需求缺失，无法将其视为零需求订单' };
  const requirements = new Map();
  for (const entry of order.requirements) {
    if (!object(entry) || !text(entry.id) || !count(entry.num) || entry.num === 0) return { error: '订单需求的物品 ID 或数量缺失／不合法' };
    const total = (requirements.get(entry.id) ?? 0) + entry.num;
    if (!Number.isSafeInteger(total)) return { error: '订单需求总量超出安全整数范围' };
    requirements.set(entry.id, total);
  }
  return { requirements };
}

function inventoryResult(requirements, inventory) {
  if (!(inventory instanceof Map)) return { status: 'UNKNOWN', missing: [], explanation: '库存数据不可用，不能推定库存为零或充足' };
  const missing = [];
  let unknown = false;
  for (const [id, required] of requirements) {
    const available = inventory.has(id) ? inventory.get(id) : 0;
    if (!count(available)) { unknown = true; missing.push({ id, required, available: null, missing: null }); }
    else if (available < required) missing.push({ id, required, available, missing: required - available });
  }
  if (unknown) return { status: 'UNKNOWN', missing, explanation: '部分需求物品的库存缺失、无法解析或超出安全整数范围' };
  if (missing.length) return { status: 'FAIL', missing, explanation: '库存不足：' + missing.map((row) => row.id + ' 需要 ' + row.required + '，现有 ' + row.available + '，缺 ' + row.missing).join('；') };
  return { status: 'PASS', missing: [], explanation: '本订单所需物品库存充足' };
}

function checkRule(rule, order, requirements, inventory) {
  const params = rule.params;
  if (rule.type === 'ITEM_FORBIDDEN') {
    const found = params.itemIds.filter((id) => requirements.has(id));
    return found.length ? { status: 'FAIL', explanation: '包含禁止物品 ID：' + found.join('、') } : { status: 'PASS', explanation: '需求中不含指定的禁止物品 ID' };
  }
  if (rule.type === 'ITEM_REQUIRED') {
    const absent = params.itemIds.filter((id) => !requirements.has(id));
    return absent.length ? { status: 'FAIL', explanation: '未包含必须物品 ID：' + absent.join('、') } : { status: 'PASS', explanation: '需求包含全部指定物品 ID' };
  }
  if (rule.type === 'MIN_EXPERIENCE') {
    if (!count(order.rewardExp)) return { status: 'UNKNOWN', explanation: '订单经验缺失、无法解析或超出安全整数范围' };
    const operator = params.operator === 'GT' ? '>' : '>=';
    const pass = params.operator === 'GT' ? order.rewardExp > params.value : order.rewardExp >= params.value;
    return { status: pass ? 'PASS' : 'FAIL', explanation: '订单经验 ' + order.rewardExp + ' ' + operator + ' ' + params.value + (pass ? '，满足要求' : '，不满足要求') };
  }
  if (rule.type === 'MAX_ITEM_COUNT') {
    const total = requirements.get(params.itemId) ?? 0;
    return { status: total <= params.value ? 'PASS' : 'FAIL', explanation: '物品 ID ' + params.itemId + ' 需求合计 ' + total + '，上限 ' + params.value };
  }
  return inventoryResult(requirements, inventory);
}

const notChecked = () => ({ status: 'SKIPPED', missing: [], explanation: '尚未执行最终库存判断' });

export function evaluateOrder(order, inventory, rulesConfig = defaultOrderRules()) {
  const result = {
    orderId: object(order) && (text(order.index) || count(order.index)) ? order.index : null,
    decision: 'NEEDS_REVIEW', ruleResults: [], explanation: [], firstFailedRuleId: null, inventory: notChecked(),
  };
  let config;
  try { config = validateOrderRules(rulesConfig); }
  catch { result.explanation.push('规则配置无效，停止评估并建议人工检查'); return result; }
  let stopped = !config.enabled;
  let stoppedReason = config.enabled ? null : '策略已禁用';
  if (!config.enabled) result.explanation.push('策略已禁用；未生成提交或刷新建议');
  const input = orderInput(order);
  for (const rule of config.rules) {
    const base = { id: rule.id, priority: rule.priority, type: rule.type, onFail: rule.onFail };
    if (!rule.enabled || stopped) {
      result.ruleResults.push({ ...base, status: 'SKIPPED', explanation: !rule.enabled ? '规则已禁用' : '未评估：' + stoppedReason });
      continue;
    }
    const checked = input.error ? { status: 'UNKNOWN', explanation: input.error } : checkRule(rule, order, input.requirements, inventory);
    result.ruleResults.push({ ...base, status: checked.status, explanation: checked.explanation });
    result.explanation.push('优先级 ' + rule.priority + '：' + checked.explanation);
    if (checked.status === 'FAIL') {
      result.firstFailedRuleId = rule.id;
      result.decision = { KEEP: 'RECOMMEND_KEEP', REFRESH: 'RECOMMEND_REFRESH', REVIEW: 'NEEDS_REVIEW' }[rule.onFail];
      stopped = true; stoppedReason = '前序规则 ' + rule.id + ' 失败';
    } else if (checked.status === 'UNKNOWN') {
      stopped = true; stoppedReason = '前序规则 ' + rule.id + ' 数据未知';
      result.explanation.push('数据未知，忽略失败处理建议并转人工检查');
    }
  }
  if (stopped) return result;
  result.inventory = input.error ? { status: 'UNKNOWN', missing: [], explanation: input.error } : inventoryResult(input.requirements, inventory);
  result.explanation.push('最终库存检查：' + result.inventory.explanation);
  result.decision = { PASS: 'RECOMMEND_SUBMIT', FAIL: 'RECOMMEND_KEEP', UNKNOWN: 'NEEDS_REVIEW' }[result.inventory.status];
  return result;
}

// The default remains the existing independent, read-only preview. A composed plan
// injects its shared resource ledger; no network, clock or Action dependency is added.
export function evaluateOrders(orders, inventory, rulesConfig = defaultOrderRules(), { ledger = null } = {}) {
  if (!Array.isArray(orders)) return [evaluateOrder(null, inventory, rulesConfig)];
  return orders.map((order) => {
    const ids = Array.isArray(order?.requirements) ? order.requirements.map((row) => row?.id) : [];
    const result = evaluateOrder(order, ledger ? ledger.inventory(ids) : inventory, rulesConfig);
    if (ledger && result.decision === 'RECOMMEND_SUBMIT' && !ledger.reserve(order.requirements)) {
      result.decision = 'NEEDS_REVIEW';
      result.inventory = { status: 'UNKNOWN', missing: [], explanation: '共享资源预算无法预留，停止提交建议' };
      result.explanation.push(result.inventory.explanation);
    }
    return result;
  });
}
