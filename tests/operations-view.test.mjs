import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { PAGE } from '../src/page.mjs';

const inline = PAGE.slice(PAGE.indexOf('<script>') + 8, PAGE.lastIndexOf('</script>'));
const tick = () => new Promise((resolve) => setImmediate(resolve));
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
    this.disabled = false; this.checked = false; this.value = ''; this._text = '';
    const classes = new Set();
    this.classList = { add: (v) => classes.add(v), contains: (v) => classes.has(v), toggle(v, on) { if (on) classes.add(v); else classes.delete(v); } };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((entry) => entry.textContent).join(''); }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  setAttribute(key, value) { this[key] = value; }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
}
function harness() {
  const nodes = new Map(), requests = [], timers = [], confirmations = [], streams = [];
  let confirmed = true;
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const tabs = ['overview', 'order-rules', 'orders-execution', 'city', 'production', 'operations-history', 'stages'].map((tab) => { const button = new Element('button'); button.dataset.tab = tab; return button; });
  const context = vm.createContext({
    URL, location: { href: 'http://127.0.0.1:17321/' },
    document: { getElementById: node, createElement: (tag) => new Element(tag), createTextNode: (text) => { const entry = new Element(); entry.textContent = text; return entry; }, querySelectorAll: (selector) => selector === '#tabs button' ? tabs : [] },
    Option: class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } },
    EventSource: class { constructor(url) { this.url = url; streams.push(this); } close() { this.closed = true; } },
    fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject, settled: false })),
    setInterval: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearInterval() {},
    window: { confirm: (message) => { confirmations.push(message); return confirmed; } }, prompt: () => null,
  });
  new vm.Script(inline, { filename: 'page-inline.js' }).runInContext(context);
  const run = (source) => vm.runInContext(source, context);
  const pending = (path, account) => requests.find((entry) => !entry.settled && new URL(entry.url, 'http://localhost').pathname === path && (account === undefined || new URL(entry.url, 'http://localhost').searchParams.get('account') === account));
  const respond = (path, account, body, ok = true) => {
    const entry = pending(path, account); assert.ok(entry, 'expected pending request ' + path + ' ' + account);
    entry.settled = true; entry.resolve({ ok, statusText: 'fixture failure', json: async () => body }); return entry;
  };
  return { node, requests, timers, confirmations, streams, tabs, run, pending, respond, setConfirmed(value) { confirmed = value; } };
}
const overview = (account) => ({ account: { id: account, title: account }, status: { connected: true, state: 'READY', busy: null }, player: {}, resources: [], items: { top: [] }, heroes: { list: [] }, failed: {} });
async function boot() {
  const h = harness(); h.respond('/api/accounts', undefined, { activeId: 'A', accounts: [{ id: 'A', title: 'A' }, { id: 'B', title: 'B' }] });
  await tick(); h.respond('/api/overview', 'A', overview('A')); await tick(); return h;
}
const submit = (index = 0) => ({
  actionId: 'orders:SUBMIT:' + index, actionType: 'SUBMIT', target: { index }, executable: true, decision: 'RECOMMEND_SUBMIT',
  beforeState: { index, requirements: [{ id: '木材', num: 2 }], rewardExp: 820 }, costs: [{ id: '木材', num: 2 }],
  resourceBefore: [{ id: '木材', num: 5 }], ruleResult: { ruleResults: [{ id: 'minimum-exp', priority: 1, status: 'PASS', explanation: '经验符合阈值' }], inventory: { status: 'PASS', missing: [], explanation: '当前库存足够' }, explanation: ['建议提交'] },
});
const refresh = (index = 1, executable = false) => ({ ...submit(index), actionId: 'orders:REFRESH:' + index, actionType: 'REFRESH', decision: 'RECOMMEND_REFRESH', costs: [], executable, blockedReason: executable ? null : '缺少可靠免费刷新配额证据' });
const upgrade = () => ({ actionId: 'city:upgrade:b', actionType: 'upgrade', target: { buildingId: '民居' }, label: '升级民居', costs: [{ id: '木材', num: 3 }], beforeState: { level: 1 }, expectedState: { level: 2 } });
const produce = () => ({ actionId: 'city:startProduce:f', actionType: 'startProduce', target: { buildingId: '食品厂', productId: '面包' }, label: '食品厂制造面包', costs: [{ id: '石材', num: 1 }], beforeState: { queue: [] } });
function fixture(accountId = 'A', status = {}, orders = [submit(), refresh()]) {
  return { accountId, csrfToken: 'synthetic-csrf-' + accountId, status: { running: false, runId: null, finalStatus: 'IDLE', stopReason: null, blocked: false, ...status }, lastPlan: null, view: { orders, productionPolicy: { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 }, productionRecommendations: [], city: {
    buildings: [{ buildingId: '民居', type: '民居', level: 1, status: '空闲', upgradeConditions: '人口充足', materialCosts: [{ id: '木材', num: 3 }], expectedState: { level: 2 }, reliable: true }],
    factories: [{ buildingId: '食品厂', type: '食品厂', level: 1, status: '空闲', slotCapacity: 2, freeSlots: 2, queue: [], finishedProducts: [], recipes: [{ productId: '面包', unlockLevel: 1, produceTime: 60, costs: [{ id: '石材', num: 1 }] }] }],
    stock: [{ id: '木材', num: 5 }, { id: '石材', num: 2 }], candidates: [upgrade(), produce()], notes: ['仅加速器道具允许加速'] },
  } };
}
function plan(actions = [submit()], mode = 'Manual', accountId = 'A') {
  const totals = new Map(); for (const row of actions) for (const cost of row.costs) totals.set(cost.id, (totals.get(cost.id) || 0) + cost.num);
  return { batchId: 'batch-synthetic', planHash: 'hash-synthetic', accountId, module: 'orders', mode, actions,
    resourceBudget: [...totals].map(([id, num]) => ({ id, num })), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), notes: ['仅本批次，未知结果立即停止'] };
}
async function load(h, data = fixture()) { const pending = h.node('ops-load').onclick(); h.respond('/api/operations', data.accountId, data); await pending; }
const descendants = (node) => [node, ...node.children.flatMap(descendants)];
function choose(h, actionId, value = true) {
  const input = ['ops-orders', 'ops-city', 'ops-production'].flatMap((id) => descendants(h.node(id))).find((entry) => entry.dataset.actionId === actionId);
  assert.ok(input, 'expected choice ' + actionId); input.checked = value; input.onchange(); return input;
}
function setMode(h, mode) { h.node('ops-mode').value = mode; h.node('ops-mode').onchange(); }
async function preview(h, data = plan()) { const pending = h.node('ops-plan').onclick(); h.respond('/api/operations/plan', data.accountId, data); await pending; }
const body = (request) => JSON.parse(request.options.body);

test('operations use cached reads and explicit survey without broadening ordinary read-only paths', async () => {
  const h = await boot(); assert.equal(h.pending('/api/operations', 'A'), undefined); await load(h);
  assert.match(h.node('ops-orders').textContent, /minimum-exp.*PASS/);
  assert.match(h.node('ops-city').textContent, /人口充足/); assert.match(h.node('ops-production').textContent, /面包.*石材/); assert.match(h.node('ops-production').textContent, /生产槽位：2.*空闲槽位：2/);
  assert.equal(h.requests.filter((request) => request.options.method === 'POST').length, 0);
  await assert.rejects(h.run("call('/api/operations/execute', {method:'POST',body:'{}'})"), /只读/);
  await assert.rejects(h.run("call('/api/world/run', {method:'POST',body:'{}'})"), /只读/);
  const pending = h.node('ops-survey').onclick(); const request = h.pending('/api/operations/survey', 'A');
  assert.deepEqual(body(request), {}); assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf-A');
  h.respond('/api/operations/survey', 'A', fixture()); await pending;
  assert.equal(h.pending('/api/connect', 'A'), undefined); assert.equal(h.pending('/api/refresh', 'A'), undefined);
});

test('blocked refresh, KEEP and REVIEW remain visible without executable selection', async () => {
  const h = await boot(); const data = fixture(); data.view.orders.push({ ...submit(2), actionType: 'KEEP', decision: 'RECOMMEND_KEEP' }, { ...submit(3), actionType: 'REVIEW', decision: 'NEEDS_REVIEW' }); await load(h, data);
  const input = choose(h, 'orders:REFRESH:1'); assert.equal(input.disabled, true);
  assert.match(h.node('ops-orders').textContent, /免费刷新配额证据/); assert.match(h.node('ops-orders').textContent, /RECOMMEND_KEEP/); assert.match(h.node('ops-orders').textContent, /NEEDS_REVIEW/);
  assert.equal(h.node('ops-plan').disabled, true); assert.equal(h.node('ops-authorize-execute').disabled, true);
});

test('Manual requires one concrete operation and preview before authorization', async () => {
  const h = await boot(); await load(h); choose(h, submit().actionId); assert.equal(h.node('ops-plan').disabled, false);
  assert.equal(h.node('ops-authorize-execute').disabled, true); await h.node('ops-authorize-execute').onclick(); assert.equal(h.pending('/api/operations/authorize', 'A'), undefined);
  choose(h, upgrade().actionId); assert.equal(h.node('ops-plan').disabled, true); assert.match(h.node('ops-selected').textContent, /每次只授权一个/);
  choose(h, upgrade().actionId, false); const pending = h.node('ops-plan').onclick(); const request = h.pending('/api/operations/plan', 'A');
  assert.deepEqual(body(request), { module: 'orders', mode: 'Manual', selections: [submit().actionId] });
  h.respond('/api/operations/plan', 'A', plan()); await pending;
  assert.match(h.node('ops-plan-meta').textContent, /待授权/); assert.match(h.node('ops-budget').textContent, /木材2/); assert.equal(h.node('ops-authorize-execute').disabled, false);
});

test('Automatic composes order, building and production selections under one displayed batch budget', async () => {
  const h = await boot(); const state = fixture(); state.view.productionPolicy.enabled = true; state.view.productionRecommendations = [produce().actionId]; await load(h, state); setMode(h, 'Automatic'); for (const row of [submit(), upgrade(), produce()]) choose(h, row.actionId);
  const pending = h.node('ops-plan').onclick(); const request = h.pending('/api/operations/plan', 'A');
  assert.deepEqual(body(request), { module: 'combined', mode: 'Automatic', selections: [submit().actionId, upgrade().actionId, produce().actionId] });
  h.respond('/api/operations/plan', 'A', plan([submit(), upgrade(), produce()], 'Automatic')); await pending;
  assert.match(h.node('ops-budget').textContent, /木材5/); assert.match(h.node('ops-budget').textContent, /石材1/);
  assert.match(h.node('ops-mode-note').textContent, /仅执行本次.*新订单.*重新授权.*不自动循环/);
  assert.match(h.node('ops-plan-actions').textContent, /升级民居/); assert.match(h.node('ops-plan-actions').textContent, /食品厂制造面包/);
});

test('Hybrid permits selected refresh batches and requires individual submit authorization', async () => {
  const h = await boot(); await load(h, fixture('A', {}, [submit(), refresh(1, true), refresh(2, true)])); setMode(h, 'Hybrid');
  choose(h, 'orders:REFRESH:1'); choose(h, 'orders:REFRESH:2'); assert.equal(h.node('ops-plan').disabled, false);
  choose(h, submit().actionId); assert.equal(h.node('ops-plan').disabled, true); assert.match(h.node('ops-selected').textContent, /逐单预览授权/);
  choose(h, 'orders:REFRESH:1', false); choose(h, 'orders:REFRESH:2', false); assert.equal(h.node('ops-plan').disabled, false);
});

test('confirmation binds exact actions, hash, total budget and CSRF before single-use execute', async () => {
  const h = await boot(); await load(h); choose(h, submit().actionId); await preview(h);
  h.setConfirmed(false); await h.node('ops-authorize-execute').onclick(); assert.equal(h.pending('/api/operations/authorize', 'A'), undefined);
  h.setConfirmed(true); const pending = h.node('ops-authorize-execute').onclick(); const request = h.pending('/api/operations/authorize', 'A');
  assert.deepEqual(body(request), { batchId: 'batch-synthetic', planHash: 'hash-synthetic', approvedActionIds: [submit().actionId], resourceBudget: [{ id: '木材', num: 2 }], confirm: true });
  assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf-A'); assert.match(h.confirmations.at(-1), /总资源消耗：木材 × 2/);
  h.respond('/api/operations/authorize', 'A', { batchId: 'batch-synthetic', permitId: 'permit-synthetic' }); await tick();
  assert.deepEqual(body(h.pending('/api/operations/execute', 'A')), { batchId: 'batch-synthetic', permitId: 'permit-synthetic' });
  h.respond('/api/operations/execute', 'A', { runId: 'run-synthetic', status: { running: true, runId: 'run-synthetic', finalStatus: 'EXECUTING', blocked: false } }); await pending;
  assert.match(h.node('ops-status').textContent, /执行中/); assert.equal(h.node('ops-authorize-execute').disabled, true); assert.equal(h.node('ops-stop').disabled, false);
  assert.equal(h.node('refresh-data').disabled, true); assert.equal(h.pending('/api/world/run', 'A'), undefined);
});

test('expired plans or unknown action and total costs cannot be authorized', async () => {
  for (const change of [(data) => { data.expiresAt = new Date(Date.now() - 1000).toISOString(); }, (data) => { data.resourceBudget[0].num = null; }, (data) => { data.actions[0].costs = null; }]) {
    const h = await boot(); await load(h); choose(h, submit().actionId); const data = plan(); change(data); await preview(h, data);
    assert.equal(h.node('ops-authorize-execute').disabled, true); await h.node('ops-authorize-execute').onclick(); assert.equal(h.pending('/api/operations/authorize', 'A'), undefined);
  }
});

test('selection, mode or fresh view changes invalidate old previews and in-flight plan responses', async () => {
  const h = await boot(); await load(h); choose(h, submit().actionId); await preview(h); setMode(h, 'Automatic'); assert.equal(h.node('ops-authorize-execute').disabled, true);
  const pending = h.node('ops-plan').onclick(); choose(h, upgrade().actionId); h.respond('/api/operations/plan', 'A', plan()); await pending;
  assert.equal(h.node('ops-authorize-execute').disabled, true);
  await preview(h, plan([submit(), upgrade()], 'Automatic'));
  const changed = fixture(); changed.view.orders[0].beforeState.rewardExp = 999; await load(h, changed);
  assert.equal(h.node('ops-authorize-execute').disabled, true); assert.match(h.node('ops-selected').textContent, /尚未选择/);
});

test('A to B to A generation changes ignore old plans and never execute an old authorization', async () => {
  const h = await boot(); await load(h); choose(h, submit().actionId); const old = h.node('ops-plan').onclick();
  h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}"); await load(h, fixture('B'));
  h.run("selectAccount('A'); snapshot={connected:true,state:'READY'}"); await load(h);
  h.respond('/api/operations/plan', 'A', plan()); await old; assert.equal(h.node('ops-authorize-execute').disabled, true);
  choose(h, submit().actionId); await preview(h); const authorize = h.node('ops-authorize-execute').onclick();
  h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}"); await load(h, fixture('B'));
  h.respond('/api/operations/authorize', 'A', { batchId: 'batch-synthetic', permitId: 'permit-old-account' }); await authorize;
  assert.equal(h.pending('/api/operations/execute', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'B'), undefined);
  assert.match(h.node('ops-plan-meta').textContent, /先选择/);
});

test('wrong account reads, missing CSRF and failed status requests fail closed for new operations', async () => {
  const h = await boot(); const data = fixture(); delete data.csrfToken; await load(h, data); assert.equal(h.node('ops-survey').disabled, true);
  const count = h.requests.length; await assert.rejects(h.run("operationMutation('/api/operations/execute',{},viewGuard.capture())"), /先读取/); assert.equal(h.requests.length, count);
  await load(h); const pending = h.node('ops-load').onclick(); h.respond('/api/operations', 'A', fixture('B')); await pending; assert.match(h.node('ops-hint').textContent, /账号不匹配/); assert.equal(h.node('ops-survey').disabled, true);
  const fail = h.node('ops-load').onclick(); h.respond('/api/operations', 'A', { error: 'fixture offline' }, false); await fail; assert.match(h.node('ops-hint').textContent, /fixture offline/); assert.equal(h.node('ops-plan').disabled, true);
});

test('UNKNOWN and cancelled pending writes remain blocked and stop uses the scoped local route', async () => {
  const h = await boot(); await load(h, fixture('A', { running: true, runId: 'old-run', finalStatus: 'EXECUTING' }));
  const pending = h.node('ops-stop').onclick(); const request = h.pending('/api/operations/stop', 'A'); assert.deepEqual(body(request), {}); assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf-A');
  h.respond('/api/operations/stop', 'A', { accountId: 'A', status: { running: false, runId: 'old-run', finalStatus: 'CANCELLED', blocked: true, stopReason: '用户停止' } }); await pending;
  assert.match(h.node('ops-status').textContent, /已取消.*用户停止.*未决/); assert.match(h.node('ops-hint').textContent, /已发出的请求无法撤销/); assert.equal(h.node('ops-survey').disabled, true);
  await load(h, fixture('A', { finalStatus: 'UNKNOWN', blocked: true, stopReason: '响应超时' })); assert.match(h.node('ops-status').textContent, /UNKNOWN.*禁止自动重试/); assert.equal(h.node('ops-plan').disabled, true);
});

test('known running operations keep polling cached status across tabs without repeating writes', async () => {
  const h = await boot(); await load(h, fixture('A', { running: true, runId: 'run', finalStatus: 'EXECUTING' }));
  h.run("activeTab='overview'"); const pending = h.timers[0].callback(); h.respond('/api/overview', 'A', overview('A')); await tick();
  h.respond('/api/operations', 'A', fixture('A', { finalStatus: 'SUCCESS', runId: 'run' })); await pending;
  assert.equal(h.node('refresh-data').disabled, false); assert.match(h.node('ops-status').textContent, /成功/); assert.ok(h.requests.every((request) => (request.options.method || 'GET') === 'GET'));
  const count = h.requests.length; const next = h.timers[0].callback(); h.respond('/api/overview', 'A', overview('A')); await next; assert.equal(h.requests.length, count + 1);
});

test('history shows per-action evidence as literal text and never presents it as live state', async () => {
  const h = await boot(); const now = new Date().toISOString();
  const pending = h.node('ops-history-load').onclick(); h.respond('/api/operations/history', 'A', { accountId: 'A', runs: [{ runId: 'history-run', accountId: 'A', module: 'city', mode: 'Manual', startedAt: now, finishedAt: now, recovered: true, finalStatus: 'SUCCESS', authorizationSummary: { actions: ['one'] }, resourceBudget: [{ id: '木材', num: 2 }], actions: [{ actionId: 'one', actionType: 'startProduce', target: { buildingId: '<img onerror=alert(1)>', productId: '面包' }, beforeState: { queue: [] }, resourceReservation: [{ id: '木材', num: 2 }], requestStatus: 'SENT', afterState: { queue: ['面包'] }, result: 'SUCCESS', verification: { status: 'CONFIRMED' }, timestamp: now, reason: '已复读' }] }], dailyReport: { date: now.slice(0, 10), timeZone: 'Asia/Shanghai', coverage: 'tool-verified-only', totalGameProduction: null, startedOperations: 1, collectedOperations: 0, collected: [], notes: ['仅含本工具持久记录'] } }); await pending;
  assert.match(h.node('ops-history').textContent, /进程恢复记录/); assert.match(h.node('ops-history').textContent, /beforeState.*resourceReservation.*requestStatus.*afterState.*verification/s);
  assert.match(h.node('ops-history').textContent, /<img onerror=alert\(1\)>/); assert.match(h.node('ops-production-report').textContent, /本工具验证收取记录/); assert.match(PAGE, /不代表当前实时游戏状态/);
  assert.ok(descendants(h.node('ops-history')).every((node) => node.tagName !== 'img'));
});

test('late history results cannot cross accounts and current history errors clear old records', async () => {
  const h = await boot(); const old = h.node('ops-history-load').onclick(); h.run("selectAccount('B')");
  const fresh = h.node('ops-history-load').onclick(); h.respond('/api/operations/history', 'B', { accountId: 'B', runs: [] }); await fresh;
  h.respond('/api/operations/history', 'A', { accountId: 'A', runs: [{ runId: 'old-A', finalStatus: 'SUCCESS' }] }); await old; assert.doesNotMatch(h.node('ops-history').textContent, /old-A/);
  const fail = h.node('ops-history-load').onclick(); h.respond('/api/operations/history', 'B', { error: 'history file corrupt' }, false); await fail; assert.equal(h.node('ops-history').textContent, ''); assert.match(h.node('ops-history-hint').textContent, /history file corrupt/);
});


test('production policy saves only local account config with CSRF and invalidates old batch previews', async () => {
  const h = await boot(); await load(h); choose(h, submit().actionId); await preview(h);
  assert.equal(h.node('production-policy-enabled').checked, false); assert.equal(h.node('production-select-recommended').disabled, true);
  const reading = h.node('production-policy-load').onclick();
  h.respond('/api/operations/production-policy', 'A', { accountId: 'A', config: fixture().view.productionPolicy, source: 'DEFAULT', warning: null }); await reading;
  assert.match(h.node('production-policy-source').textContent, /DEFAULT/);
  h.node('production-policy-enabled').checked = true; h.node('production-policy-products').value = '面包, 木板'; h.node('production-policy-limit').value = '2'; h.node('production-policy-enabled').onchange();
  assert.equal(h.node('ops-authorize-execute').disabled, true);
  const saving = h.node('production-policy-save').onclick(); const request = h.pending('/api/operations/production-policy', 'A');
  assert.deepEqual(body(request), { config: { version: 1, enabled: true, onlyShortages: true, productIds: ['面包', '木板'], maxOperations: 2 } });
  assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf-A');
  h.respond('/api/operations/production-policy', 'A', { accountId: 'A', config: body(request).config, source: 'ACCOUNT', warning: null }); await saving;
  assert.match(h.node('production-policy-hint').textContent, /已保存.*重新探测.*未启动生产/);
  assert.equal(h.node('production-select-recommended').disabled, true); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
  await assert.rejects(h.run("call('/api/operations/production-policy', {method:'POST',body:'{}'})"), /只读/);
});

test('Automatic production is policy bounded while Manual permits a concrete separately authorized operation', async () => {
  const h = await boot(); await load(h); choose(h, produce().actionId); setMode(h, 'Automatic');
  assert.equal(h.node('ops-plan').disabled, true); assert.match(h.node('ops-selected').textContent, /需要先保存启用/);
  setMode(h, 'Manual'); assert.equal(h.node('ops-plan').disabled, false);
  const state = fixture(); state.view.productionPolicy.enabled = true; state.view.productionRecommendations = [produce().actionId, 'untrusted:missing']; await load(h, state);
  h.node('production-select-recommended').onclick(); assert.match(h.node('ops-selected').textContent, /食品厂制造面包/); assert.doesNotMatch(h.node('ops-selected').textContent, /untrusted/);
  assert.equal(h.pending('/api/operations/plan', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
  setMode(h, 'Automatic'); assert.equal(h.node('ops-plan').disabled, false);
  const noRecommendation = fixture(); noRecommendation.view.productionPolicy.enabled = true; await load(h, noRecommendation); choose(h, produce().actionId);
  assert.equal(h.node('ops-plan').disabled, true); assert.match(h.node('ops-selected').textContent, /只允许.*推荐/);
});

test('production policy rejects invalid local edits and ignores A to B to A stale config responses', async () => {
  const h = await boot(); await load(h); h.node('production-policy-limit').value = '0'; h.node('production-policy-limit').onchange();
  await h.node('production-policy-save').onclick(); assert.equal(h.pending('/api/operations/production-policy', 'A'), undefined); assert.match(h.node('production-policy-hint').textContent, /1–100/);
  const old = h.node('production-policy-load').onclick(); h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}"); await load(h, fixture('B'));
  h.run("selectAccount('A'); snapshot={connected:true,state:'READY'}"); await load(h);
  const stale = { ...fixture().view.productionPolicy, enabled: true, productIds: ['旧账号结果'] };
  h.respond('/api/operations/production-policy', 'A', { accountId: 'A', config: stale }); await old;
  assert.equal(h.node('production-policy-enabled').checked, false); assert.equal(h.node('production-policy-products').value, '');
  const failed = h.node('production-policy-load').onclick(); h.respond('/api/operations/production-policy', 'A', { error: 'config corrupt' }, false); await failed;
  assert.equal(h.node('production-policy-save').disabled, true); assert.match(h.node('production-policy-hint').textContent, /config corrupt/);
});

test('production report uses verified server quantities and distinguishes starts from collected materials', async () => {
  const h = await boot(); const pending = h.node('ops-history-load').onclick();
  h.respond('/api/operations/history', 'A', { accountId: 'A', runs: [], dailyReport: { date: '2026-11-11', timeZone: 'Asia/Shanghai', coverage: 'tool-verified-only', totalGameProduction: null, startedOperations: 3, collectedOperations: 2, collected: [{ id: '面包', num: 7 }], notes: ['一次收取未提供可靠数量，仅计操作次数'] } }); await pending;
  const report = h.node('ops-production-report').textContent;
  assert.match(report, /本工具验证收取记录.*2026-11-11.*Asia\/Shanghai/); assert.match(report, /开始生产操作：3 次.*收取操作：2 次/); assert.match(report, /面包7/); assert.match(report, /未提供可靠数量/); assert.match(report, /游戏完整产量未知/);
  const failure = h.node('ops-history-load').onclick(); h.respond('/api/operations/history', 'A', { error: 'unreadable' }, false); await failure; assert.doesNotMatch(h.node('ops-production-report').textContent, /面包7/);
});


test('production drafts survive cache polling and tab changes, and policy reads lock batch authorization', async () => {
  const h = await boot(); await load(h); h.node('production-policy-products').value = '未保存产品'; h.node('production-policy-products').oninput();
  await load(h); assert.equal(h.node('production-policy-products').value, '未保存产品');
  h.tabs.find((button) => button.dataset.tab === 'overview').onclick(); h.tabs.find((button) => button.dataset.tab === 'production').onclick();
  assert.equal(h.pending('/api/operations/production-policy', 'A'), undefined); assert.equal(h.node('production-policy-products').value, '未保存产品');
  h.respond('/api/operations', 'A', fixture()); h.respond('/api/operations/history', 'A', { accountId: 'A', runs: [] }); await tick();
  choose(h, submit().actionId); await preview(h); assert.equal(h.node('ops-authorize-execute').disabled, false);
  const reading = h.node('production-policy-load').onclick(); assert.equal(h.node('ops-plan').disabled, true); assert.equal(h.node('ops-authorize-execute').disabled, true);
  const changed = { ...fixture().view.productionPolicy, enabled: true };
  h.respond('/api/operations/production-policy', 'A', { accountId: 'A', config: changed, source: 'account', warning: null }); await reading;
  assert.equal(h.node('ops-authorize-execute').disabled, true); assert.equal(h.node('production-policy-products').value, '');
});


test('actual survey retains CSRF and matching fresh plan cache polls preserve exact authorization preview', async () => {
  const h = await boot(); await load(h);
  const surveying = h.node('ops-survey').onclick(); const surveyed = fixture(); delete surveyed.csrfToken;
  surveyed.view.surveyedAt = '2026-11-11T00:00:00.000Z'; surveyed.view.source = '显式只读采集；缓存不代表实时状态';
  h.respond('/api/operations/survey', 'A', surveyed); await surveying;
  assert.equal(h.node('ops-survey').disabled, false); assert.match(h.node('ops-notes').textContent, /缓存不代表实时状态/);
  choose(h, submit().actionId); const planned = plan(); await preview(h, planned);
  const refreshed = fixture(); refreshed.lastPlan = planned; refreshed.view.surveyedAt = '2026-11-11T00:00:01.000Z'; refreshed.view.city.stock[0].num = 6;
  await load(h, refreshed);
  assert.equal(h.node('ops-authorize-execute').disabled, false); assert.match(h.node('ops-plan-meta').textContent, /待授权/); assert.match(h.node('ops-selected').textContent, /SUBMIT/);
  const authorizing = h.node('ops-authorize-execute').onclick();
  assert.equal(h.pending('/api/operations/authorize', 'A').options.headers['x-cw-csrf'], 'synthetic-csrf-A');
  h.respond('/api/operations/authorize', 'A', { batchId: planned.batchId, permitId: 'single-use-synthetic' }); await tick();
  h.respond('/api/operations/execute', 'A', { runId: 'actual-service-shape', status: 'EXECUTING' }); await authorizing;
  assert.match(h.node('ops-status').textContent, /执行中.*actual-service-shape/); assert.equal(h.node('ops-authorize-execute').disabled, true);
});


test('production shortages render reliable server totals and incomplete facts remain UNKNOWN', async () => {
  const h = await boot(); const data = fixture(); data.view.orders[0].ruleResult.inventory.missing = { materials: 'not-an-array' };
  data.view.productionShortages = { reliable: true, items: [{ id: '面包', required: 12, inventory: 3, inProgress: 2, finished: 1, missing: 6 }], notes: ['已扣除在产与待收成品'] }; await load(h, data);
  assert.match(h.node('ops-stock').textContent, /可靠生产缺口汇总/); assert.match(h.node('ops-stock').textContent, /订单需求.*现有库存.*在产数量.*待收成品.*剩余缺口/);
  assert.match(h.node('ops-stock').textContent, /面包123216/); assert.match(h.node('ops-stock').textContent, /已扣除在产与待收成品/);
  const unknown = fixture(); unknown.view.productionShortages = { reliable: false, items: [], notes: ['订单来源不可靠'] }; await load(h, unknown);
  assert.match(h.node('ops-stock').textContent, /UNKNOWN.*生产缺口未知.*不按 0 处理/); assert.match(h.node('ops-stock').textContent, /订单来源不可靠/); assert.doesNotMatch(h.node('ops-stock').textContent, /面包123216/);
});

test('history shows dispatch, response and authoritative verification stages independently of final result',async()=>{const h=await boot();h.run('renderOperationHistory('+JSON.stringify({runs:[{runId:'staged',module:'alliance',mode:'Manual',finalStatus:'UNKNOWN',actions:[{actionId:'tech',actionType:'upgradeTech',target:{techId:10101},requestStatus:'UNKNOWN',result:'UNKNOWN',stages:[{stage:'DISPATCH_INTENT',timestamp:'2026-11-11T00:00:00Z'},{stage:'DISPATCHED',timestamp:'2026-11-11T00:00:01Z'},{stage:'RESPONSE',timestamp:'2026-11-11T00:00:02Z'},{stage:'VERIFY',timestamp:'2026-11-11T00:00:03Z'}],verification:{status:'UNCONFIRMED'}}]}]})+')');const text=h.node('ops-history').textContent;for(const word of ['DISPATCH_INTENT','DISPATCHED','RESPONSE','VERIFY','UNKNOWN','UNCONFIRMED'])assert.ok(text.includes(word));assert.ok(!text.includes('VERIFIED'));assert.equal(h.requests.filter(r=>r.options.method==='POST').length,0);});

function recoveryHistory(accountId = 'A', reconciliations = []) {
  return { accountId, runs: [{ accountId, runId: 'unknown-run-' + accountId, module: 'formation', mode: 'Manual', finalStatus: 'UNKNOWN', startedAt: '2026-11-11T00:00:00.000Z',
    authorizationSummary: { actionIds: ['save-one'], planHash: 'original-business-hash' }, resourceBudget: [], actions: [{ actionId: 'save-one', actionType: 'SAVE', target: { module: 1, presetId: 2 }, requestStatus: 'UNKNOWN', result: 'UNKNOWN', unresolvedWrite: true, costs: [], resourceReservation: [], beforeState: { presetId: 1 }, expectedState: { presetId: 2 }, reconciliations }] }] };
}
const recoveryPreview = (status = 'APPLIED', accountId = 'A') => ({ accountId, runId: 'unknown-run-' + accountId, actionId: 'save-one', previewId: 'readonly-preview-' + accountId, previewHash: 'readonly-preview-hash-' + accountId, originalStatus: 'UNKNOWN', expiresAt: new Date(Date.now() + 60000).toISOString(), result: { status, evidence: { reasonCode: 'SYNTHETIC_' + status, observation: status === 'NOT_APPLIED' ? null : { desiredStateMatches: true } } } });
async function loadRecoveryHistory(h, data = recoveryHistory()) {
  const pending = h.node('ops-history-load').onclick(); h.respond('/api/operations/history', data.accountId, data); await pending;
}
function recoveryButtons(h) {
  const buttons = descendants(h.node('ops-history')).filter(node => node.tagName === 'button');
  return { preview: buttons.find(node => node.textContent === '只读复核预览'), confirm: buttons.find(node => /确认追加复核证据|保留未决并记录复核证据/.test(node.textContent)) };
}
async function showRecovery(h, status = 'APPLIED', accountId = 'A') {
  const buttons = recoveryButtons(h), pending = buttons.preview.onclick();
  h.respond('/api/operations/recovery/preview', accountId, recoveryPreview(status, accountId)); await pending; return buttons;
}

for (const status of ['APPLIED', 'NOT_APPLIED', 'STILL_UNKNOWN']) test('history recovery preview shows ' + status + ' alongside original UNKNOWN and sends only the exact readonly identity with CSRF', async () => {
  const h = await boot(); await load(h, fixture('A', { finalStatus: 'UNKNOWN', blocked: true })); await loadRecoveryHistory(h);
  const buttons = recoveryButtons(h); assert.ok(buttons.preview); assert.equal(buttons.confirm.hidden, true);
  const pending = buttons.preview.onclick(), request = h.pending('/api/operations/recovery/preview', 'A');
  assert.deepEqual(body(request), { runId: 'unknown-run-A', actionId: 'save-one' }); assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf-A');
  assert.equal(request.options.method, 'POST'); assert.equal(h.pending('/api/operations/recovery/confirm', 'A'), undefined);
  h.respond('/api/operations/recovery/preview', 'A', recoveryPreview(status)); await pending;
  assert.match(h.node('ops-history').textContent, /UNKNOWN/); assert.ok(h.node('ops-history').textContent.includes(status));
  assert.equal(buttons.confirm.hidden, false); assert.equal(buttons.confirm.disabled, false);
  assert.equal(buttons.confirm.textContent, status === 'STILL_UNKNOWN' ? '保留未决并记录复核证据' : '确认追加复核证据');
  assert.equal(h.pending('/api/operations/authorize', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
});

test('history recovery confirmation sends the exact preview id/hash, invalidates the old business plan and refreshes only local history', async () => {
  const h = await boot(); await load(h); choose(h, submit().actionId); await preview(h); assert.equal(h.node('ops-authorize-execute').disabled, false);
  await loadRecoveryHistory(h); const buttons = await showRecovery(h), pending = buttons.confirm.onclick(), request = h.pending('/api/operations/recovery/confirm', 'A');
  assert.deepEqual(body(request), { previewId: 'readonly-preview-A', previewHash: 'readonly-preview-hash-A', confirm: true }); assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf-A');
  const event = { eventId: 'append-only-event', status: 'APPLIED', timestamp: '2026-11-11T00:00:01.000Z', evidence: { previewId: 'readonly-preview-A' } };
  h.respond('/api/operations/recovery/confirm', 'A', { accountId: 'A', runId: 'unknown-run-A', actionId: 'save-one', event, status: { running: false, finalStatus: 'UNKNOWN', blocked: false } });
  await tick(); assert.ok(h.pending('/api/operations/history', 'A')); h.respond('/api/operations/history', 'A', recoveryHistory('A', [event])); await pending;
  assert.equal(h.node('ops-authorize-execute').disabled, true); assert.match(h.node('ops-plan-meta').textContent, /重新生成/);
  assert.match(h.node('ops-history').textContent, /UNKNOWN/); assert.match(h.node('ops-history').textContent, /APPLIED/); assert.match(h.node('ops-history').textContent, /append-only-event/);
  assert.equal(recoveryButtons(h).preview, undefined); assert.equal(h.pending('/api/operations/authorize', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
  const posted = h.requests.filter(request => request.options.method === 'POST').map(request => new URL(request.url, 'http://localhost').pathname);
  assert.deepEqual(posted, ['/api/operations/plan', '/api/operations/recovery/preview', '/api/operations/recovery/confirm']);
});

test('a late recovery preview for old account A cannot show a confirm action or alter current B history', async () => {
  const h = await boot(); await load(h); await loadRecoveryHistory(h); const buttons = recoveryButtons(h), old = buttons.preview.onclick();
  h.run("selectAccount('B');snapshot={connected:true,state:'READY'}"); await load(h, fixture('B')); await loadRecoveryHistory(h, recoveryHistory('B'));
  const current = h.node('ops-history').textContent, count = h.requests.length;
  h.respond('/api/operations/recovery/preview', 'A', recoveryPreview('APPLIED')); await old;
  assert.equal(h.node('ops-history').textContent, current); assert.equal(h.requests.length, count); assert.equal(recoveryButtons(h).confirm.hidden, true);
  assert.equal(h.pending('/api/operations/recovery/confirm', 'A'), undefined); assert.equal(h.pending('/api/operations/recovery/confirm', 'B'), undefined);
});

test('a late recovery confirmation for old account cannot invalidate a new B plan or launch B history/game requests', async () => {
  const h = await boot(); await load(h); await loadRecoveryHistory(h); const buttons = await showRecovery(h), old = buttons.confirm.onclick();
  h.run("selectAccount('B');snapshot={connected:true,state:'READY'}"); await load(h, fixture('B')); choose(h, submit().actionId); await preview(h, plan([submit()], 'Manual', 'B')); await loadRecoveryHistory(h, recoveryHistory('B'));
  const current = h.node('ops-history').textContent, count = h.requests.length; assert.equal(h.node('ops-authorize-execute').disabled, false);
  h.respond('/api/operations/recovery/confirm', 'A', { accountId: 'A', event: { status: 'APPLIED' }, status: { blocked: false, finalStatus: 'UNKNOWN' } }); await old;
  assert.equal(h.node('ops-history').textContent, current); assert.equal(h.node('ops-authorize-execute').disabled, false); assert.equal(h.requests.length, count);
  assert.equal(h.pending('/api/operations/history', 'B'), undefined); assert.equal(h.pending('/api/operations/execute', 'B'), undefined);
});

test('expired recovery API failure clears its confirmation and never retries or mutates original UNKNOWN', async () => {
  const h = await boot(); await load(h, fixture('A', { finalStatus: 'UNKNOWN', blocked: true })); await loadRecoveryHistory(h); const buttons = await showRecovery(h), pending = buttons.confirm.onclick();
  h.respond('/api/operations/recovery/confirm', 'A', { error: 'STALE_RECOVERY: 复核预览已过期', code: 'STALE_RECOVERY' }, false); await pending;
  assert.match(h.node('ops-history').textContent, /UNKNOWN/); assert.match(h.node('ops-history').textContent, /STALE_RECOVERY.*过期/); assert.equal(buttons.confirm.hidden, true);
  const count = h.requests.length; await buttons.confirm.onclick(); assert.equal(h.requests.length, count);
  assert.equal(h.pending('/api/operations/history', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined); assert.equal(h.node('ops-authorize-execute').disabled, true);
});

test('recovery preview without current CSRF fails locally and API preview failure does not create confirmation or writes', async () => {
  const h = await boot(), missing = fixture(); delete missing.csrfToken; await load(h, missing); await loadRecoveryHistory(h);
  let buttons = recoveryButtons(h), count = h.requests.length; await buttons.preview.onclick(); assert.equal(h.requests.length, count); assert.equal(buttons.confirm.hidden, true); assert.match(h.node('ops-history').textContent, /先读取/);
  await load(h); await loadRecoveryHistory(h); buttons = recoveryButtons(h); const pending = buttons.preview.onclick();
  h.respond('/api/operations/recovery/preview', 'A', { error: '当前连接存在迟到响应，保留未决', code: 'RESPONSE_UNCERTAIN' }, false); await pending;
  assert.match(h.node('ops-history').textContent, /迟到响应.*未决/); assert.equal(buttons.confirm.hidden, true); count = h.requests.length; await buttons.confirm.onclick(); assert.equal(h.requests.length, count);
  assert.equal(h.pending('/api/operations/recovery/confirm', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
});

test('append-only history events and recovery observations render as literal text while keeping original UNKNOWN visible', async () => {
  const h = await boot(); await load(h); const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const event = { eventId: 'unsafe-looking-event', status: 'STILL_UNKNOWN', timestamp: '2026-11-11T00:00:00.000Z', evidence: { reason: payload } };
  await loadRecoveryHistory(h, recoveryHistory('A', [event])); assert.match(h.node('ops-history').textContent, /UNKNOWN/); assert.ok(h.node('ops-history').textContent.includes(payload));
  const buttons = recoveryButtons(h), pending = buttons.preview.onclick(), shown = recoveryPreview('STILL_UNKNOWN'); shown.result.evidence.reason = payload;
  h.respond('/api/operations/recovery/preview', 'A', shown); await pending;
  assert.ok(h.node('ops-history').textContent.includes(payload)); assert.ok(descendants(h.node('ops-history')).every(node => !['img', 'script'].includes(node.tagName)));
  assert.equal(buttons.confirm.textContent, '保留未决并记录复核证据');
});

test('A to B to A generation changes reject the original recovery preview even after returning to the same account', async () => {
  const h = await boot(); await load(h); await loadRecoveryHistory(h); const oldButtons = recoveryButtons(h), old = oldButtons.preview.onclick();
  h.run("selectAccount('B');snapshot={connected:true,state:'READY'}"); await load(h, fixture('B')); await loadRecoveryHistory(h, recoveryHistory('B'));
  h.run("selectAccount('A');snapshot={connected:true,state:'READY'}"); await load(h); await loadRecoveryHistory(h);
  const current = h.node('ops-history').textContent, currentButtons = recoveryButtons(h), count = h.requests.length;
  h.respond('/api/operations/recovery/preview', 'A', recoveryPreview('APPLIED')); await old;
  assert.equal(h.node('ops-history').textContent, current); assert.equal(currentButtons.confirm.hidden, true); assert.equal(oldButtons.confirm.hidden, true); assert.equal(h.requests.length, count);
  assert.equal(h.pending('/api/operations/recovery/confirm', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
  const pending = currentButtons.preview.onclick(), request = h.pending('/api/operations/recovery/preview', 'A');
  assert.deepEqual(body(request), { runId: 'unknown-run-A', actionId: 'save-one' }); assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf-A');
  const fresh = recoveryPreview('STILL_UNKNOWN'); fresh.previewId = 'current-generation-preview';
  h.respond('/api/operations/recovery/preview', 'A', fresh); await pending;
  assert.equal(currentButtons.confirm.hidden, false); assert.equal(currentButtons.confirm.textContent, '保留未决并记录复核证据');
});

test('A to B to A generation changes prevent an old recovery confirmation from invalidating the current A plan', async () => {
  const h = await boot(); await load(h); await loadRecoveryHistory(h); const oldButtons = await showRecovery(h), old = oldButtons.confirm.onclick();
  h.run("selectAccount('B');snapshot={connected:true,state:'READY'}"); await load(h, fixture('B')); await loadRecoveryHistory(h, recoveryHistory('B'));
  h.run("selectAccount('A');snapshot={connected:true,state:'READY'}"); await load(h); choose(h, submit().actionId); await preview(h); await loadRecoveryHistory(h);
  const current = h.node('ops-history').textContent, count = h.requests.length; assert.equal(h.node('ops-authorize-execute').disabled, false);
  h.respond('/api/operations/recovery/confirm', 'A', { accountId: 'A', event: { eventId: 'stale-generation-event', status: 'APPLIED' }, status: { blocked: false, finalStatus: 'UNKNOWN' } }); await old;
  assert.equal(h.node('ops-history').textContent, current); assert.equal(h.node('ops-authorize-execute').disabled, false); assert.equal(h.requests.length, count);
  assert.doesNotMatch(h.node('ops-history').textContent, /stale-generation-event/); assert.equal(recoveryButtons(h).confirm.hidden, true);
  assert.equal(h.pending('/api/operations/history', 'A'), undefined); assert.equal(h.pending('/api/operations/authorize', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
});

test('explicitly appending STILL_UNKNOWN keeps the original UNKNOWN, blocks new business writes and offers only another readonly preview', async () => {
  const h = await boot(); await load(h, fixture('A', { finalStatus: 'UNKNOWN', blocked: true, stopReason: '原请求结果未决' })); await loadRecoveryHistory(h);
  const buttons = await showRecovery(h, 'STILL_UNKNOWN'); assert.equal(buttons.confirm.textContent, '保留未决并记录复核证据');
  const pending = buttons.confirm.onclick(), event = { eventId: 'still-unknown-event', status: 'STILL_UNKNOWN', timestamp: '2026-11-11T00:00:02.000Z', evidence: { reason: '权威状态不足以归因于原请求' } };
  assert.deepEqual(body(h.pending('/api/operations/recovery/confirm', 'A')), { previewId: 'readonly-preview-A', previewHash: 'readonly-preview-hash-A', confirm: true });
  h.respond('/api/operations/recovery/confirm', 'A', { accountId: 'A', event, status: { running: false, finalStatus: 'UNKNOWN', blocked: true, stopReason: '原请求结果未决' } });
  await tick(); h.respond('/api/operations/history', 'A', recoveryHistory('A', [event])); await pending;
  assert.match(h.node('ops-history').textContent, /UNKNOWN/); assert.match(h.node('ops-history').textContent, /still-unknown-event.*STILL_UNKNOWN/s); assert.match(h.node('ops-history').textContent, /权威状态不足以归因/);
  assert.match(h.node('ops-status').textContent, /UNKNOWN.*禁止自动重试/); assert.equal(h.node('ops-plan').disabled, true); assert.equal(h.node('ops-authorize-execute').disabled, true); assert.equal(h.node('ops-survey').disabled, true);
  const next = recoveryButtons(h); assert.ok(next.preview); assert.equal(next.confirm.hidden, true);
  assert.equal(h.pending('/api/operations/authorize', 'A'), undefined); assert.equal(h.pending('/api/operations/execute', 'A'), undefined);
  const posted = h.requests.filter(request => request.options.method === 'POST').map(request => new URL(request.url, 'http://localhost').pathname);
  assert.deepEqual(posted, ['/api/operations/recovery/preview', '/api/operations/recovery/confirm']);
});
