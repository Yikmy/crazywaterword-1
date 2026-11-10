import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './accounts.mjs';
import { defaultOrderRules, validateOrderRules } from './order-rules.mjs';

// Global defaults live in the rule contract; this file stores account overrides only.
// Account identifiers are JSON keys, never file names or fragments of a path.
export const ORDER_RULES_PATH = path.join(DATA_DIR, 'order-rules.json');

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireAccountId(accountId) {
  if (typeof accountId !== 'string' || !accountId || accountId.length > 512 ||
      accountId.trim() !== accountId || /[\u0000-\u001f\u007f]/.test(accountId)) {
    const error = new Error('订单规则必须使用有效的精确账号 ID');
    error.statusCode = 400;
    throw error;
  }
  return accountId;
}
function emptyStore() {
  return { version: 1, accounts: Object.create(null) };
}
function readStore() {
  let text;
  try {
    text = fs.readFileSync(ORDER_RULES_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { store: emptyStore(), warning: null };
    return { store: null, warning: '订单规则文件无法读取，已使用禁用的默认配置；原文件未修改' };
  }
  try {
    const raw = JSON.parse(text);
    if (!record(raw) || raw.version !== 1 || !record(raw.accounts) ||
        Object.keys(raw).some((key) => key !== 'version' && key !== 'accounts')) {
      return { store: null, warning: '订单规则文件格式或版本不受支持，已使用禁用的默认配置；原文件未修改' };
    }
    const accounts = Object.create(null);
    for (const [id, value] of Object.entries(raw.accounts)) accounts[id] = value;
    return { store: { version: 1, accounts }, warning: null };
  } catch {
    return { store: null, warning: '订单规则文件损坏，已使用禁用的默认配置；原文件未修改' };
  }
}

export function loadOrderRules(accountId) {
  requireAccountId(accountId);
  const { store, warning } = readStore();
  if (!store || !Object.hasOwn(store.accounts, accountId)) {
    return { config: defaultOrderRules(), source: 'default', warning };
  }
  try {
    return { config: validateOrderRules(store.accounts[accountId]), source: 'account', warning: null };
  } catch {
    return { config: defaultOrderRules(), source: 'default', warning: '该账号订单规则无效，已使用禁用的默认配置；其他账号不受影响' };
  }
}

export function saveOrderRules(accountId, config) {
  requireAccountId(accountId);
  const validated = validateOrderRules(config);
  const { store, warning } = readStore();
  if (!store) {
    const error = new Error('原订单规则文件不可安全更新，请先处理文件问题；未覆盖任何配置');
    error.statusCode = 409;
    throw error;
  }
  // The null-prototype dictionary preserves even keys such as "__proto__" exactly.
  store.accounts[accountId] = validated;
  const temporary = ORDER_RULES_PATH + '.' + process.pid + '.' + randomUUID() + '.tmp';
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, ORDER_RULES_PATH);
  } catch {
    const error = new Error('订单规则保存失败，原配置未替换');
    error.statusCode = 500;
    throw error;
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
  return { config: validated, source: 'account', warning };
}
