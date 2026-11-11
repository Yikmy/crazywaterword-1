import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { PAGE } from '../src/page.mjs';

// Execute the assembled page without replacing call() or operationMutation().
// fetch is a closed synthetic boundary: no listener, browser, Runtime or client.
const inline = PAGE.slice(PAGE.indexOf('<script>') + 8, PAGE.lastIndexOf('</script>'));
const tick = () => new Promise((resolve) => setImmediate(resolve));
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.style = {};
    this.value = ''; this.checked = false; this.disabled = false; this._text = ''; this.attrs = {};
    const classes = new Set();
    this.classList = { add: (v) => classes.add(v), contains: (v) => classes.has(v), toggle(v, on) { if (on) classes.add(v); else classes.delete(v); } };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { throw Error('unsafe HTML insertion'); }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
  click() { return this.onclick?.(); }
}
function harness() {
  const nodes = new Map(), requests = [], confirmations = []; let confirm = true;
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = vm.createContext({
    URL, location: { href: 'http://127.0.0.1:17321/' },
    document: { getElementById: node, createElement: (tag) => new Element(tag), createElementNS: (_ns, tag) => new Element(tag), createTextNode: (text) => { const child = new Element(); child.textContent = text; return child; }, querySelectorAll: () => [], querySelector: () => null },
    Option: class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } },
    EventSource: class { close() {} },
    fetch: (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject, settled: false })),
    setInterval: () => 1, clearInterval() {}, window: { confirm(text) { confirmations.push(text); return confirm; } }, prompt: () => null,
  });
  new vm.Script(inline, { filename: 'assembled-page-inline.js' }).runInContext(context);
  const matches = (entry, path, module) => {
    const url = new URL(entry.url, 'http://localhost');
    return url.pathname === path && (module === undefined || url.searchParams.get('module') === module);
  };
  const pending = (path, module) => requests.find((entry) => !entry.settled && matches(entry, path, module));
  const respond = (path, body, { module, ok = true } = {}) => {
    const entry = pending(path, module); assert.ok(entry, 'expected pending request ' + path + ' ' + (module || ''));
    entry.settled = true; entry.resolve({ ok, statusText: 'synthetic failure', json: async () => body }); return entry;
  };
  return { node, requests, confirmations, run: (source) => vm.runInContext(source, context), pending, respond, setConfirm: (value) => { confirm = value; } };
}
const overview = { account: { id: 'A', title: 'Synthetic A' }, status: { connected: true, state: 'READY', busy: null }, player: { nickname: 'Synthetic A' }, resources: [], items: { top: [] }, heroes: { list: [] }, snapshotStatus: 'ready', updatedAt: '2026-01-01T00:00:00.000Z', failed: {} };
async function boot() {
  const h = harness();
  h.respond('/api/accounts', { activeId: 'A', accounts: [{ id: 'A', title: 'Synthetic A' }, { id: 'B', title: 'Synthetic B' }] });
  await tick(); h.respond('/api/overview', overview); await tick();
  assert.deepEqual(h.requests.map((request) => new URL(request.url, 'http://localhost').pathname), ['/api/accounts', '/api/overview']);
  return h;
}
const cases = [
  { module: 'formation-unlock', actionId: 'formation-unlock:UNLOCK:2:synthetic-exact', actionType: 'UNLOCK', parameters: {presetId:2}, costs:[{id:'阵型2图纸',num:1}], facts:{templates:[{presetId:2,name:'普通图纸模板',costs:[{id:'阵型2图纸',num:1}]}],unlockedPresetIds:[1]}, blockedReason:'OWNED_BLUEPRINT_REQUIRED' },
  { module: 'farm', actionId: 'farm:PLANT:synthetic-exact', actionType: 'PLANT', parameters: { buildingId: '1农田', action: 'plant', productId: '小麦' }, costs: [{ id: '小麦种子', num: 1 }], facts: { plots: [{ buildingId: '1农田', state: 'EMPTY', productId: '', plantTime: 0, ripeTime: 0 }], autoFarming: false, crops: [{ productId: '小麦', costs: [{ id: '小麦种子', num: 1 }], reliable: true }] }, blockedReason: 'FARM_MATURITY_TIME_UNIT_UNVERIFIED' },
  { module: 'equipment-forge', actionId: 'equipment-forge:MAKE:synthetic-exact', actionType: 'MAKE', parameters: { buildingId: '1装备厂', action: 'make', makeId: 1001, allowUniversal: false }, costs: [{ id: '材料', num: 4 }], facts: { forges: [{ buildingId: '1装备厂', level: 1, queue: { state: 'IDLE' } }], recipes: [{ makeId: 1001, type: '武器', season: 1, costs: [{ id: '材料', num: 4 }], equipIds: ['蓝武器1'] }], bag: [{ uid: '9007199254740993', equipId: '蓝武器1', level: 0, star: 2, refineLv: 0 }] }, blockedReason: 'QUEUE_IDLE_BLOCKED_EVIDENCE' },
];
function candidate(spec) {
  return { module: spec.module, actionId: spec.actionId, actionType: spec.actionType, label: 'Synthetic ' + spec.actionType, executable: true, parameters: spec.parameters, target: spec.module==='formation-unlock'?{presetId:spec.parameters.presetId}:{buildingId:spec.parameters.buildingId}, costs: spec.costs, costSource: 'synthetic offline proof', beforeState: { state: 'IDLE' }, expectedState: { state: 'CHANGED' } };
}
function data(spec, { disabled = false } = {}) {
  return { accountId: 'A', module: spec.module, csrfToken: 'synthetic-csrf-A', config: { enabled: !disabled }, status: { running: false, blocked: false }, functions: ['survey', 'plan'], view: { ...spec.facts, candidates: disabled ? [] : [candidate(spec), { ...candidate(spec), actionId: spec.actionId + ':blocked', executable: false, blockedReason: spec.blockedReason }] } };
}
function plan(spec) {
  return { accountId: 'A', module: spec.module, batchId: 'batch-' + spec.module, planHash: 'hash-' + spec.module, mode: 'Manual', actions: [candidate(spec)], resourceBudget: spec.costs, expiresAt: Date.now() + 60000 };
}
function descendants(element) { return element.children.flatMap((child) => [child, ...descendants(child)]); }
function domainButtons(h, spec) { return descendants(h.node('gp-' + spec.module + '-facts')).filter((child) => child.dataset.domainAction); }
function writes(h, path) { return h.requests.filter((entry) => entry.options.method === 'POST' && (path === undefined || new URL(entry.url, 'http://localhost').pathname === path)); }
function assertMutation(request, path, body) {
  assert.ok(request, path + ' must reach actual fetch');
  const url = new URL(request.url, 'http://localhost');
  assert.equal(url.pathname, path); assert.deepEqual([...url.searchParams], [['account', 'A']]);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual({ ...request.options.headers }, { 'content-type': 'application/json', 'x-cw-csrf': 'synthetic-csrf-A' });
  assert.deepEqual(JSON.parse(request.options.body), body);
}
async function loaded(spec, options) {
  const h = await boot(), task = h.node('gp-' + spec.module + '-load').onclick();
  const request = h.pending('/api/gameplay', spec.module);
  assert.equal(new URL(request.url, 'http://localhost').searchParams.get('account'), 'A');
  assert.equal(request.options.method || 'GET', 'GET');
  h.respond('/api/gameplay', data(spec, options), { module: spec.module }); await task;
  return h;
}
async function preview(h, spec) {
  const controls = domainButtons(h, spec); assert.equal(controls.length, 2);
  assert.equal(controls[0].disabled, false); assert.equal(controls[1].disabled, true);
  const before = h.requests.length; controls[0].click();
  assert.equal(h.requests.length, before); assert.deepEqual(JSON.parse(h.node('gp-' + spec.module + '-parameters').value), spec.parameters);
  const task = h.node('gp-' + spec.module + '-plan').onclick();
  assertMutation(h.pending('/api/operations/plan'), '/api/operations/plan', { module: spec.module, mode: 'Manual', selections: [spec.actionId], parameters: spec.parameters });
  assert.equal(controls[0].disabled, true, 'professional selector is locked during preview');
  h.respond('/api/operations/plan', plan(spec)); await task;
  assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, false);
  assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
}
for (const spec of cases) {
  test(spec.module + ': assembled PAGE reaches exact Manual preview, authorize and execute once through actual account/CSRF caller', async () => {
    const h = await loaded(spec); await preview(h, spec);
    assert.equal(Object.hasOwn(data(spec).view.candidates[0], 'action'), false, 'fixture matches cropped public candidates');
    const ids = [...PAGE.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    for (const id of ['gp-' + spec.module + '-section', 'gp-' + spec.module + '-plan']) assert.equal(ids.filter((value) => value === id).length, 1);
    h.setConfirm(false); await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
    h.setConfirm(true); const running = h.node('gp-' + spec.module + '-authorize').onclick(), expected = plan(spec);
    assertMutation(h.pending('/api/operations/authorize'), '/api/operations/authorize', { batchId: expected.batchId, planHash: expected.planHash, approvedActionIds: [spec.actionId], resourceBudget: spec.costs, confirm: true });
    assert.ok(h.confirmations.at(-1).includes('账号 A')); assert.ok(h.confirmations.at(-1).includes(expected.batchId)); assert.ok(h.confirmations.at(-1).includes(expected.planHash)); assert.ok(h.confirmations.at(-1).includes(spec.costs[0].id));
    h.respond('/api/operations/authorize', { accountId: 'A', batchId: expected.batchId, permitId: 'synthetic-permit' }); await tick();
    assertMutation(h.pending('/api/operations/execute'), '/api/operations/execute', { batchId: expected.batchId, permitId: 'synthetic-permit' });
    h.respond('/api/operations/execute', { runId: 'synthetic-run-' + spec.module, status: 'EXECUTING' }); await running;
    assert.match(h.node('gp-' + spec.module + '-hint').textContent, /结果以复读和执行历史为准/);
    assert.doesNotMatch(h.node('gp-' + spec.module + '-hint').textContent, /执行成功|验证成功/);
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.deepEqual(writes(h).map((request) => new URL(request.url, 'http://localhost').pathname), ['/api/operations/plan', '/api/operations/authorize', '/api/operations/execute']);
  });

  test(spec.module + ': A→B→A late permit cannot reach execute or restore an old account token', async () => {
    const h = await loaded(spec); await preview(h, spec);
    const running = h.node('gp-' + spec.module + '-authorize').onclick();
    assert.equal(writes(h, '/api/operations/authorize').length, 1);
    h.run("selectAccount('B'); selectAccount('A');");
    h.respond('/api/operations/authorize', { accountId: 'A', batchId: plan(spec).batchId, permitId: 'late-permit' }); await running;
    assert.equal(writes(h, '/api/operations/execute').length, 0);
    assert.equal(h.run('gameplayCsrfToken()'), null);
    assert.equal(h.node('gp-' + spec.module + '-hint').textContent, '');
    assert.equal(h.node('gp-' + spec.module + '-plan-view').textContent, '');
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
  });

  test(spec.module + ': an edited draft discards a late full-page preview and detached domain controls', async () => {
    const h = await loaded(spec), control = domainButtons(h, spec)[0]; control.click();
    const task = h.node('gp-' + spec.module + '-plan').onclick();
    h.node('gp-' + spec.module + '-parameters').value = JSON.stringify({ buildingId: 'edited-local-draft' });
    h.node('gp-' + spec.module + '-parameters').oninput(); control.click();
    h.respond('/api/operations/plan', plan(spec)); await task;
    assert.deepEqual(JSON.parse(h.node('gp-' + spec.module + '-parameters').value), { buildingId: 'edited-local-draft' });
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    assert.ok(!h.node('gp-' + spec.module + '-plan-view').textContent.includes('hash-' + spec.module));
    assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
  });

  test(spec.module + ': a response with a different action cannot promote a preview into authorization', async () => {
    const h = await loaded(spec); domainButtons(h, spec)[0].click();
    const task = h.node('gp-' + spec.module + '-plan').onclick(), wrong = plan(spec); wrong.actions[0].actionId = 'formation:not-the-selected-action';
    h.respond('/api/operations/plan', wrong); await task;
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    assert.match(h.node('gp-' + spec.module + '-hint').textContent, /具体计划与选择不匹配/);
    assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
  });

  test(spec.module + ': a permit for another account is consumed locally and never dispatched', async () => {
    const h = await loaded(spec); await preview(h, spec);
    const task = h.node('gp-' + spec.module + '-authorize').onclick();
    h.respond('/api/operations/authorize', { accountId: 'B', batchId: plan(spec).batchId, permitId: 'wrong-account' }); await task;
    assert.equal(writes(h, '/api/operations/execute').length, 0);
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    assert.match(h.node('gp-' + spec.module + '-hint').textContent, /操作账号不匹配/);
    await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.equal(writes(h, '/api/operations/authorize').length, 1);
  });

  test(spec.module + ': default-off cached state has no executable selection or implicit writes', async () => {
    const h = await loaded(spec, { disabled: true });
    assert.equal(domainButtons(h, spec).length, 0);
    assert.equal(h.node('gp-' + spec.module + '-plan').disabled, true);
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    assert.equal(JSON.parse(h.node('gp-' + spec.module + '-config').value).enabled, false);
    assert.equal(writes(h).length, 0);
    assert.ok(h.requests.every((request) => ['/api/accounts', '/api/overview', '/api/gameplay'].includes(new URL(request.url, 'http://localhost').pathname)));
  });
}