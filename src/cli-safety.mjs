import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadStore, pickAccount } from './accounts.mjs';
import { redact, validateCredentials } from './security.mjs';

// Redact structured values before serialization/truncation, then remember secrets
// so subsequent free-form warnings cannot echo the loaded credentials.
export function createCliOutput({ write = (...args) => console.log(...args), writeError = (...args) => console.error(...args) } = {}) {
  const secrets = new Set();
  const remember = (value) => {
    const seen = new WeakSet();
    const visit = (raw, safe) => {
      if (safe === '[REDACTED]' && (typeof raw === 'string' || typeof raw === 'number')) {
        if (String(raw)) secrets.add(String(raw));
        return;
      }
      if (typeof raw === 'string') {
        try {
          const params = Object.fromEntries(new URL(raw).searchParams);
          for (const [key, item] of Object.entries(params)) {
            if (redact({ [key]: item })[key] === '[REDACTED]' && item) secrets.add(item);
          }
        } catch { /* Ordinary text is not a URL. */ }
      }
      if (!raw || typeof raw !== 'object' || seen.has(raw)) return;
      seen.add(raw);
      for (const [key, item] of Object.entries(raw)) visit(item, safe?.[key]);
    };
    visit(value, redact(value));
  };
  const safe = (value) => { remember(value); return redact(value, [...secrets]); };
  return {
    remember,
    safe,
    json: (value, replacer = null, space) => JSON.stringify(safe(value), replacer, space),
    log: (...args) => write(...safe(args)),
    error: (...args) => writeError(...safe(args)),
  };
}

export function loadCliStore({ output, accountStore = { loadStore } } = {}) {
  let store;
  try { store = accountStore.loadStore(); }
  catch { throw new Error('无法读取账号库，请检查格式或重新导入凭证'); }
  output?.remember(store);
  return store;
}

export function loadCliCredential({ selector = process.env.CW_ACCOUNT ?? null, output, accountStore = { loadStore, pickAccount } } = {}) {
  const store = loadCliStore({ output, accountStore });
  if (!store.accounts.length) throw new Error('还没有任何账号，请先通过凭证导入或捕获工具添加账号');
  const account = accountStore.pickAccount(store, selector);
  if (!account) throw new Error('选不出账号，用 --account <id|昵称|序号> 指定一个');
  validateCredentials(account);
  return { url: account.url, login: account.login, account, accountCount: store.accounts.length };
}

export function cliAccountSelector(argv = process.argv.slice(2), env = process.env) {
  const at = argv.indexOf('--account');
  if (at >= 0 && !argv[at + 1]) throw new Error('--account 需要账号选择器');
  return at >= 0 ? argv[at + 1] : env.CW_ACCOUNT ?? null;
}

export function isCliEntry(metaUrl) {
  return Boolean(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === metaUrl);
}
