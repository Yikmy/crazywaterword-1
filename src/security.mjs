const REDACTED = '[REDACTED]';
const sensitiveKey = (key) => /^(?:token|sign|supertoken|testaccount|loginframehex|rawframehex|rawloginframehex|authorization|cookie|setcookie|password|secret|accesstoken|refreshtoken|apikey|openid)$/i.test(String(key).replace(/[-_\s]/g, ''));
const forbiddenKey = (key) => /^(?:testaccount|supertoken)$/i.test(String(key).replace(/[-_\s]/g, ''));

export function redactText(text, knownSecrets = []) {
  let result = String(text ?? '');
  const secrets = [...new Set(knownSecrets.filter((value) => value !== null && value !== undefined && String(value) !== '').flatMap((value) => {
    const raw = String(value);
    try { return [raw, encodeURIComponent(raw)]; }
    catch { return [raw]; } // Lone surrogates have no URI encoding; still redact the raw value.
  }))].sort((a, b) => b.length - a.length);
  for (const secret of secrets) result = result.split(secret).join(REDACTED);
  result = result.replace(/((?:["']?\b(?:access[_-]?token|refresh[_-]?token|api[_-]?key|super[_-]?token|test[_-]?account|(?:raw[_-]?)?(?:login[_-]?)?frame[_-]?hex|open[_-]?id|authorization|set[_-]?cookie|cookie|password|secret|token|sign)\b["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/gi, '$1[REDACTED]');
  return result.replace(/(\b(?:authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*/gi, '$1[REDACTED]');
}

// Build a JSON-safe copy; repeated credentials inside error text are removed too.
export function redact(value, knownSecrets = []) {
  const secrets = [...knownSecrets];
  const scanned = new WeakSet();
  const scan = (item) => {
    if (!item || typeof item !== 'object' || scanned.has(item)) return;
    scanned.add(item);
    for (const [key, entry] of Object.entries(item)) {
      if (sensitiveKey(key) && (typeof entry === 'string' || typeof entry === 'number')) {
        if (String(entry)) secrets.push(String(entry));
      } else scan(entry);
    }
  };
  scan(value);
  const seen = new WeakSet();
  const copy = (item) => {
    if (typeof item === 'string') return redactText(item, secrets);
    if (typeof item === 'bigint') return item.toString();
    if (item === null || typeof item !== 'object') return item;
    if (item instanceof Date) return Number.isNaN(item.getTime()) ? null : item.toISOString();
    if (seen.has(item)) return '[Circular]';
    seen.add(item);
    const entries = item instanceof Error ? { ...item, name: item.name, message: item.message } : item;
    const out = Array.isArray(item) ? [] : {};
    for (const [key, entry] of Object.entries(entries)) {
      Object.defineProperty(out, key, { value: sensitiveKey(key) ? REDACTED : copy(entry), enumerable: true, configurable: true, writable: true });
    }
    seen.delete(item);
    return out;
  };
  return copy(value);
}

function validTimestamp(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value === 'string') return /^\d+$/.test(value) && BigInt(value) > 0n && BigInt(value) <= 9223372036854775807n;
  if (value && Number.isInteger(value.low) && Number.isInteger(value.high) && value.high >= 0 && value.high <= 2147483647) {
    return (BigInt(value.high) << 32n) + BigInt(value.low >>> 0) > 0n;
  }
  return false;
}

// Accept account records and both credential envelope shapes. Never echo values.
export function validateCredentials(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('凭证必须是对象');
  const visited = new WeakSet();
  const inspect = (item) => {
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);
    for (const [key, entry] of Object.entries(item)) {
      if (forbiddenKey(key)) throw new Error('凭证包含禁止使用的开发者鉴权字段');
      inspect(entry);
    }
  };
  inspect(value);
  const login = value.login || value.body;
  const params = login?.eworldParams;
  for (const field of ['openId', 'token', 'sign']) {
    if (typeof params?.[field] !== 'string' || !params[field].trim()) throw new Error('凭证缺少可用的正常账号鉴权字段');
  }
  if (!validTimestamp(params.timestamp)) throw new Error('凭证缺少有效的鉴权时间戳');
  if (value.id !== undefined && value.id !== params.openId) throw new Error('账号标识与凭证身份不一致');
  let url;
  try { url = new URL(value.url || value.wsUrl); } catch { throw new Error('游戏网关地址无效'); }
  const hostname = url.hostname.toLowerCase();
  const loopback = hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  if ((url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) || url.username || url.password || url.hash) {
    throw new Error('游戏网关必须使用 wss，只有本机回环地址可使用 ws');
  }
  return value;
}
