import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { PAGE } from '../src/page.mjs';
import { DATA_CATALOG, DATA_DOMAINS } from '../src/data-catalog.mjs';
const inline = PAGE.slice(PAGE.indexOf('<script>') + 8, PAGE.lastIndexOf('</script>'));
const tick = () => new Promise((resolve) => setImmediate(resolve));
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
    this.disabled = false; this.value = ''; this._text = '';
    const classes = new Set();
    this.classList = { add: (v) => classes.add(v), contains: (v) => classes.has(v), toggle(v, on) { if (on) classes.add(v); else classes.delete(v); } };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((entry) => entry.textContent).join(''); }
  appendChild(node) { this.children.push(node); node.parent = this; return node; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  click() { this.clicked = true; }
  remove() { this.parent?.removeChild(this); }
  select() { this.selected = true; }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
}
function harness() {
  const nodes = new Map(); const requests = []; const timers = []; const streams = []; const copies = [], downloads = [], blobs = [], revoked = [];
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = vm.createContext({
    URL: class extends URL { static createObjectURL(blob) { blobs.push(blob); return 'blob:fixture'; } static revokeObjectURL(url) { revoked.push(url); } }, Blob,
    navigator: { clipboard: { async writeText(value) { copies.push(value); } } }, location: { href: 'http://127.0.0.1:17321/' },
    document: { body: new Element('body'), getElementById: node, createElement: (tag) => new Element(tag), createTextNode: (text) => { const el = new Element(); el.textContent = text; return el; }, querySelectorAll: () => [] },
    Option: class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } },
    EventSource: class { constructor(url) { this.url = url; streams.push(this); } close() { this.closed = true; } },
    fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject, settled: false })),
    setInterval: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearInterval() {},
    window: { confirm: () => true }, prompt: () => '备注',
  });
  new vm.Script(inline, { filename: 'page-inline.js' }).runInContext(context);
  const run = (source) => vm.runInContext(source, context);
  const pending = (path, account) => requests.find((entry) => !entry.settled && new URL(entry.url, 'http://localhost').pathname === path && (account === undefined || new URL(entry.url, 'http://localhost').searchParams.get('account') === account));
  const respond = (path, account, body, ok = true) => {
    const entry = pending(path, account); assert.ok(entry, 'expected pending request ' + path + ' ' + account);
    entry.settled = true; entry.resolve({ ok, statusText: 'failure', json: async () => body }); return entry;
  };
  return { nodes, node, requests, timers, streams, run, pending, respond, copies, downloads, blobs, revoked };
}
const overview = (account) => ({ account: { id: account, title: account }, status: { connected: false, state: 'IDLE' }, player: {}, resources: [], items: { top: [] }, heroes: { list: [] }, failed: {} });
async function boot() {
  const h = harness();
  h.respond('/api/accounts', undefined, { activeId: 'A', accounts: [{ id: 'A', title: 'A' }, { id: 'B', title: 'B' }] });
  await tick(); h.respond('/api/overview', 'A', overview('A')); await tick(); return h;
}
function fixture(accountId = 'A') {
  const entries = DATA_CATALOG.map((entry) => ({ ...entry, status: 'SUCCESS', startedAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:01Z', error: null,
    raw: { fixture: accountId + ' ' + entry.request, token: '[REDACTED]', exactId: '9223372036854775807' }, parsed: entry.hasParsedView ? { existing: entry.request } : null }));
  return { accountId, updatedAt: '2026-11-10T00:00:02Z', stale: false, total: 48, domains: DATA_DOMAINS.map((domain) => ({ ...domain, count: entries.filter((entry) => entry.domains.includes(domain.id)).length })), entries };
}
async function load(h, data = fixture()) {
  const task = h.node('explorer-load').onclick(); h.respond('/api/data-explorer', data.accountId, data); await task;
}

test('Explorer renders all 48 queries and 12 domains with original and existing parsed data together', async () => {
  const h = await boot(); await load(h);
  assert.equal(h.node('explorer-list').childElementCount, 48);
  assert.equal(h.node('explorer-domain').childElementCount, 13);
  assert.match(h.node('explorer-summary').textContent, /显示 48 \/ 48 项查询/);
  assert.match(h.node('explorer-raw').textContent, /AllItemRequest/);
  assert.match(h.node('explorer-parsed').textContent, /AllItemRequest/);
  assert.match(h.node('explorer-meta').textContent, /AllItemRequest → AllItemResponse.*SUCCESS.*2026/);
  assert.match(PAGE, /<details id="explorer-raw-panel" open>/);
  assert.match(PAGE, /<details id="explorer-parsed-panel" open>/);
  for (const [index, entry] of DATA_CATALOG.entries()) {
    h.node('explorer-list').children[index].onclick();
    assert.match(h.node('explorer-raw').textContent, new RegExp(entry.request));
    if (entry.hasParsedView) assert.match(h.node('explorer-parsed').textContent, new RegExp(entry.request));
    else assert.match(h.node('explorer-parsed').textContent, /尚无专门解析/);
  }
  assert.equal(DATA_CATALOG.filter((entry) => entry.hasParsedView).length, 27);
  assert.equal(DATA_CATALOG.filter((entry) => !entry.hasParsedView).length, 21);
});

test('domain and case-insensitive business/request/response search filter cached entries without more fetches', async () => {
  const h = await boot(); await load(h); const count = h.requests.length;
  for (const domain of DATA_DOMAINS) {
    h.node('explorer-domain').value = domain.id; h.node('explorer-domain').onchange();
    assert.equal(h.node('explorer-list').childElementCount, DATA_CATALOG.filter((entry) => entry.domains.includes(domain.id)).length);
  }
  h.node('explorer-domain').value = '';
  for (const search of ['库存道具', 'allitemrequest', 'ALLITEMRESPONSE']) {
    h.node('explorer-search').value = search; h.node('explorer-search').oninput();
    assert.equal(h.node('explorer-list').childElementCount, 1); assert.match(h.node('explorer-title').textContent, /库存道具/);
  }
  h.node('explorer-search').value = 'not-found'; h.node('explorer-search').oninput();
  assert.match(h.node('explorer-list').textContent, /没有匹配/); assert.equal(h.node('explorer-raw').textContent, '');
  assert.equal(h.requests.length, count);
  assert.ok(h.requests.every((request) => (request.options.method || 'GET') === 'GET'));
});

test('failed and not-executed queries show errors rather than successful empty or zero data', async () => {
  const h = await boot(), data = fixture();
  data.entries[0] = { ...data.entries[0], status: 'FAILED', error: 'inventory timeout', raw: null, parsed: null };
  data.entries[1] = { ...data.entries[1], status: 'NOT_EXECUTED', error: 'not collected', raw: null, parsed: null };
  data.entries[2].raw = {}; data.entries[2].parsed = {};
  await load(h, data);
  assert.match(h.node('explorer-raw').textContent, /查询失败/); assert.match(h.node('explorer-error').textContent, /inventory timeout/);
  assert.doesNotMatch(h.node('explorer-parsed').textContent, /\[\]|\b0\b/);
  h.node('explorer-list').children[1].onclick(); assert.match(h.node('explorer-meta').textContent, /NOT_EXECUTED/); assert.match(h.node('explorer-raw').textContent, /未执行/);
  h.node('explorer-list').children[2].onclick(); assert.equal(h.node('explorer-raw').textContent, '{}'); assert.equal(h.node('explorer-parsed').textContent, '{}');
});

test('late A and superseded Explorer responses cannot restore previous account contents or exports', async () => {
  const h = await boot(); const old = h.node('explorer-load').onclick(); h.run("selectAccount('B')");
  assert.equal(h.node('explorer-copy').disabled, true); assert.equal(h.node('explorer-export').disabled, true);
  await load(h, fixture('B')); const rendered = h.node('explorer-raw').textContent;
  h.respond('/api/data-explorer', 'A', fixture('A')); await old;
  assert.equal(h.node('explorer-raw').textContent, rendered); assert.doesNotMatch(h.run('explorerExportText()'), /A AllItemRequest/);
  const first = h.node('explorer-load').onclick(), firstRequest = h.pending('/api/data-explorer', 'B'); firstRequest.settled = true;
  await load(h, fixture('B')); firstRequest.resolve({ ok: false, json: async () => ({ error: 'old failure' }) }); await first;
  assert.equal(h.node('explorer-hint').textContent, '');
  h.run("selectAccount('A')"); assert.throws(() => h.run('explorerExportText()'), /切换|先读取/);
});

test('mismatched accounts and read failures clear both panels and disable copy/export', async () => {
  const h = await boot(); await load(h);
  const task = h.node('explorer-load').onclick(); h.respond('/api/data-explorer', 'A', fixture('B')); await task;
  assert.match(h.node('explorer-hint').textContent, /账号不匹配/); assert.equal(h.node('explorer-copy').disabled, true);
  await load(h); const retry = h.node('explorer-load').onclick(); h.respond('/api/data-explorer', 'A', { error: 'unavailable' }, false); await retry;
  assert.match(h.node('explorer-hint').textContent, /unavailable/); assert.equal(h.node('explorer-export').disabled, true);
  assert.equal(h.node('explorer-list').textContent, ''); assert.equal(h.node('explorer-raw').textContent, '尚未读取');
});

test('copy and export use the same server-redacted filtered JSON and preserve exact int64 text', async () => {
  const h = await boot(); await load(h); const count = h.requests.length;
  h.node('explorer-search').value = 'AllItemRequest'; h.node('explorer-search').oninput();
  await h.node('explorer-copy').onclick(); assert.equal(h.copies.length, 1);
  const copied = JSON.parse(h.copies[0]); assert.equal(copied.entries.length, 1); assert.equal(copied.entries[0].raw.token, '[REDACTED]');
  assert.equal(copied.entries[0].raw.exactId, '9223372036854775807');
  h.node('explorer-export').onclick(); assert.equal(h.blobs.length, 1); assert.equal(await h.blobs[0].text(), h.copies[0]); assert.deepEqual(h.revoked, ['blob:fixture']);
  assert.equal(h.requests.length, count);
});

test('JSON content renders as literal text and precision notes and parser errors remain visible', async () => {
  const h = await boot(), data = fixture();
  data.entries[0].raw = { html: '<img src=x onerror=alert(1)>' }; data.entries[0].rawSource = 'legacy-normalized'; data.entries[0].precisionNote = '旧快照可能已转换为Number';
  await load(h, data); assert.match(h.node('explorer-raw').textContent, /<img src=x/); assert.equal(h.node('explorer-raw').childElementCount, 0);
  assert.match(h.node('explorer-source').textContent, /legacy-normalized.*旧快照/);
  data.entries[0].parseError = 'existing parser rejected response'; data.entries[0].parsed = null;
  await load(h, data);
  assert.match(h.node('explorer-error').textContent, /解析错误：existing parser rejected response/);
  assert.match(h.node('explorer-parsed').textContent, /业务解析失败/);
  assert.match(h.node('explorer-raw').textContent, /<img src=x/);
});
