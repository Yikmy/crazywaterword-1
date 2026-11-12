import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { PAGE, createAccountViewGuard } from '../src/page.mjs';

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
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
}
function harness() {
  const nodes = new Map(); const requests = []; const timers = []; const streams = [];
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = vm.createContext({
    URL, location: { href: 'http://127.0.0.1:17321/' },
    document: { getElementById: node, createElement: (tag) => new Element(tag), createTextNode: (text) => { const el = new Element(); el.textContent = text; return el; }, querySelectorAll: () => [] },
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
  return { nodes, node, requests, timers, streams, run, pending, respond };
}
const overview = (account, nickname = account) => ({ account: { id: account, title: account }, status: { connected: true, state: 'READY', busy: null }, player: { nickname }, resources: [], items: { top: [] }, heroes: { list: [] }, snapshotStatus: 'ready', updatedAt: '2026-01-01T00:00:00.000Z', failed: {} });
async function boot() {
  const h = harness();
  h.respond('/api/accounts', undefined, { activeId: 'A', accounts: [{ id: 'A', title: 'A' }, { id: 'B', title: 'B' }] });
  await tick(); h.respond('/api/overview', 'A', overview('A')); await tick(); return h;
}

test('guard rejects old account generations and superseded requests, including A → B → A', () => {
  const guard = createAccountViewGuard(); guard.select('A');
  const a = guard.begin('overview'); guard.select('B'); guard.select('A');
  assert.equal(guard.current(a), false);
  assert.throws(() => guard.assert(a), { name: 'StaleAccountView' });
  const first = guard.begin('heroes'); const second = guard.begin('heroes');
  assert.equal(guard.current(first), false); assert.equal(guard.current(second), true);
  const otherView = guard.begin('world'); assert.equal(guard.current(second), true); assert.equal(guard.current(otherView), true);
});

test('boot and the three-second timer only fetch cached overview; no implicit connection or collection', async () => {
  const h = await boot(); assert.equal(h.timers.length, 1); assert.equal(h.timers[0].delay, 3000);
  const polling = h.timers[0].callback();
  h.respond('/api/overview', 'A', { ...overview('A'), updatedAt: null, snapshotStatus: 'unknown' }); await polling;
  assert.match(h.node('res').textContent, /数据未知/);
  assert.ok(h.requests.every((entry) => (entry.options.method || 'GET') === 'GET'));
  assert.deepEqual(h.requests.map((entry) => new URL(entry.url, 'http://localhost').pathname), ['/api/accounts', '/api/overview', '/api/overview']);
});

const views = [
  ['overview', 'refreshOverview()', '/api/overview', 'who', overview('B', 'B overview')],
  ['world', "$('world-plan').onclick()", '/api/world', 'world-view', { text: 'B world', buildings: [], factories: [], orders: [], stock: [], resFields: { text: 'B fields' } }],
  ['heroes', "$('hero-plan').onclick()", '/api/heroes', 'hero-view', { text: 'B heroes', heroes: [] }],
  ['dailies', "$('dailies-plan').onclick()", '/api/dailies', 'dailies-view', { text: 'B dailies', tasks: [], ruby: 1 }],
  ['tasks', "$('tasks-plan').onclick()", '/api/tasks', 'tasks-view', { text: 'B tasks' }],
  ['credential', "$('cred-show').onclick()", '/api/accounts/credential', 'cred', { title: 'B credential', masked: { openId: '****', token: '****', sign: '****' }, raw: { token: 'secret-must-not-render' }, loginFrameHex: 'secret-frame' }],
  ['loop', 'refreshLoop()', '/api/loop', 'loop-view', { running: false }],
  ['worlds', "$('load-worlds').onclick()", '/api/worlds', 'worlds', { recentWorlds: [{ worldId: 2, role: { nickname: 'B worlds' } }] }],
];
for (const [name, invoke, path, output, body] of views) {
  test(name + ': a late A response cannot replace the B view', async () => {
    const h = await boot(); const old = h.run(invoke); h.run("selectAccount('B')");
    assert.equal(h.node(output).textContent, '');
    const fresh = h.run(invoke); h.respond(path, 'B', body); await fresh;
    const expected = h.node(output).textContent; assert.ok(expected);
    h.respond(path, 'A', { text: 'A late response' }); await old;
    assert.equal(h.node(output).textContent, expected);
    assert.doesNotMatch(h.node(output).textContent, /secret-must-not-render|secret-frame/);
  });
}

test('an older result or error for the same view cannot replace the latest request', async () => {
  const h = await boot();
  const old = h.run('refreshOverview()'); const newer = h.run('refreshOverview()');
  const oldRequest = h.pending('/api/overview', 'A'); oldRequest.settled = true;
  h.respond('/api/overview', 'A', overview('A', 'latest')); await newer;
  oldRequest.resolve({ ok: false, statusText: 'old error', json: async () => ({ error: 'old error' }) }); await old;
  assert.match(h.node('who').textContent, /latest/); assert.equal(h.node('hint').textContent, '');
});

test('connect binds its entire connect → refresh → cached overview chain to the starting account', async () => {
  const h = await boot(); const old = h.node('connect').onclick(); h.run("selectAccount('B')");
  h.respond('/api/connect', 'A', {}); await old;
  assert.equal(h.pending('/api/refresh', 'B'), undefined); assert.equal(h.pending('/api/refresh', 'A'), undefined);
  const connect = h.node('connect').onclick(); h.respond('/api/connect', 'B', {}); await tick();
  h.respond('/api/refresh', 'B', {}); await tick(); h.respond('/api/overview', 'B', overview('B')); await connect;
  assert.match(h.node('who').textContent, /B/);
});

test('manual refresh is explicit and does not connect; disconnect invalidates pending views', async () => {
  const h = await boot(); const refresh = h.node('refresh-data').onclick();
  h.respond('/api/refresh', 'A', {}); await tick(); h.respond('/api/overview', 'A', overview('A')); await refresh;
  assert.equal(h.requests.some((entry) => entry.url.startsWith('/api/connect')), false);
  const old = h.node('tasks-plan').onclick(); const disconnect = h.node('disconnect').onclick();
  h.respond('/api/disconnect', 'A', {}); await tick();
  h.respond('/api/overview', 'A', { ...overview('A'), status: { connected: false, state: 'CLOSED' } }); await disconnect;
  h.respond('/api/tasks', 'A', { text: 'old task' }); await old;
  assert.equal(h.node('tasks-view').textContent, '');
  const poll = h.timers[0].callback(); h.respond('/api/overview', 'A', { ...overview('A'), status: { connected: false, state: 'CLOSED' } }); await poll;
  assert.equal(h.requests.some((entry) => entry.url.startsWith('/api/connect')), false);
});

test('hidden credentials and old SSE callbacks cannot restore data after account changes', async () => {
  const h = await boot(); const showing = h.node('cred-show').onclick(); h.node('cred-hide').onclick();
  h.respond('/api/accounts/credential', 'A', { title: 'late credential', masked: {} }); await showing;
  assert.equal(h.node('cred').textContent, '已收起脱敏信息');
  const stream = h.streams[0]; h.run("selectAccount('B')");
  stream.onmessage({ data: JSON.stringify({ account: 'A', t: 1, level: 'info', message: 'late A log' }) });
  assert.equal(h.node('log').textContent, ''); assert.equal(stream.closed, true);
  assert.ok(h.requests.every((entry) => !entry.url.includes('reveal=')));
});

test('MVP disables write/capture/world-entry controls and rejects writes before fetch', async () => {
  const h = await boot();
  for (const id of ['loot-run', 'loop-start', 'loop-stop', 'tasks-run', 'world-run', 'hero-run', 'dailies-run', 'enter-world', 'cap-start', 'cap-stop']) {
    assert.equal(h.node(id).disabled, true, id); assert.equal(h.node(id).onclick, null, id);
  }
  const count = h.requests.length;
  await assert.rejects(h.run("call('/api/world/run', { method: 'POST' })"), /只读/);
  assert.equal(h.requests.length, count);
});


test('overview distinguishes each domain success-empty, failed and not-executed without borrowing other failures', async () => {
  const h = await boot();
  const data = { ...overview('A'), failed: { AllItemRequest: 'inventory timeout' }, outcomes: {
    AllResourceRequest: { status: 'SUCCESS' }, AllItemRequest: { status: 'FAILED', error: 'inventory timeout' }, AllHeroRequest: { status: 'NOT_EXECUTED', error: 'not unlocked' },
  }, resources: [], items: { top: [{ itemId: 'invalid fallback item', num: 0 }] }, heroes: { list: [{ heroId: 'invalid fallback hero', level: 0, star: 0 }] } };
  h.run('renderOverview(' + JSON.stringify(data) + ')');
  assert.equal(h.node('res').textContent, '本次查询为空');
  assert.equal(h.node('items').textContent, '查询失败：inventory timeout');
  assert.equal(h.node('hero-strip').textContent, '查询未执行，数据未知：not unlocked');
  assert.doesNotMatch(h.node('items').textContent + h.node('hero-strip').textContent, /invalid fallback/);
  h.run('renderOverview(' + JSON.stringify({ ...overview('A'), failed: { AllHeroRequest: 'hero error' } }) + ')');
  assert.equal(h.node('res').textContent, '本次查询为空');
  assert.equal(h.node('hero-strip').textContent, '查询失败：hero error');
});

test('failed detail reads remove previous successful tables and display the error', async () => {
  const h = await boot();
  for (const [view, invoke, path, output, body] of views.filter(([view]) => ['world', 'heroes', 'dailies', 'tasks', 'loop', 'worlds'].includes(view))) {
    const success = h.run(invoke); h.respond(path, 'A', body); await success;
    const retry = h.run(invoke); h.respond(path, 'A', { error: view + ' unavailable' }, false); await retry;
    assert.equal(h.node(output).textContent, '查询失败：' + view + ' unavailable');
  }
  for (const id of ['world-factories', 'world-orders', 'world-stock', 'world-fields', 'hero-table', 'dailies-table']) assert.equal(h.node(id).textContent, '', id);
});

test('missing queue remains unknown, successful empty orders are explicit, unavailable chest configuration is not shown as claimed', async () => {
  const h = await boot();
  const world = { text: 'cached world', buildings: [], factories: [{ buildingId: 'factory', type: 'factory', level: 1, queue: null }], orders: [], stock: [], resFields: { text: '' } };
  h.run('renderWorld(' + JSON.stringify(world) + ')');
  assert.match(h.node('world-factories').textContent, /未知/);
  assert.equal(h.node('world-orders').textContent, '本次查询没有居民订单');
  const daily = { text: 'cached daily', tasks: [], ruby: null, chestsUnavailable: '配置表缺失', chests: { daily: { tiers: [], activity: 0, nextAt: null }, weekly: { tiers: [], activity: 0, nextAt: null } } };
  h.run('renderDailies(' + JSON.stringify(daily) + ')');
  assert.match(h.node('dailies-table').textContent, /无法判断奖励档位：配置表缺失/);
  assert.doesNotMatch(h.node('dailies-table').textContent, /档位都领完|不欠/);
  assert.match(h.node('dailies-view').textContent, /钻石 -/);
});


test('daily checklist renders unknowns and threshold eligibility without claiming execution or all rewards claimed',async()=>{
  const h=await boot(),initial=h.requests.length;
  const data={stale:true,checklist:{tasks:{rows:[{taskId:1001,title:'合成日常',progress:1,targetProgress:1,status:'ELIGIBLE',configuredReward:{activity:5,experience:100}}],counts:{total:1}},
    activity:{daily:{activity:40,tiers:[{id:2,requiredActivity:40,status:'ELIGIBLE',configuredRewards:[{id:'建筑蓝图',num:15}]}]},weekly:{activity:null,tiers:[{id:5,requiredActivity:600,status:'UNKNOWN',configuredRewards:null,rewardReason:'SEASON_REWARD_AMBIGUOUS'}]}},
    gift:{status:'UNKNOWN'},sources:{daily:{status:'AVAILABLE',observedAt:'2026-11-12T01:00:00Z'},gift:{status:'UNKNOWN',observedAt:null}},note:'读取缓存；领取合同待核实'}};
  h.run('renderDailies('+JSON.stringify(data)+')');
  const text=h.node('dailies-table').textContent;
  assert.match(text,/合成日常.*1\/1.*达到门槛/);assert.match(text,/每周宝箱 · 活跃 未知/);assert.match(text,/季节奖励未确定/);assert.match(text,/每日精选赠礼.*未知/);
  assert.doesNotMatch(text,/这一季的档位都领完|不欠|直接完成|可领取/);assert.match(h.node('dailies-view').textContent,/缓存已过期/);assert.equal(h.requests.length,initial);
  const task=h.node('dailies-plan').onclick();h.respond('/api/dailies','A',data);await task;assert.match(h.node('dailies-table').textContent,/合成日常/);
  assert.ok(h.requests.every(r=>(r.options.method||'GET')==='GET'));
});


test('daily VIP configuration never displays static level eligibility as a claimable reward',async()=>{
  const h=await boot();
  const data={checklist:{tasks:{rows:[],counts:{total:0}},activity:{daily:{activity:null,tiers:[]},weekly:{activity:null,tiers:[]}},gift:{status:'UNKNOWN'},
    vip:{vipLevel:2,configuredPackages:[{level:1,levelConditionMet:true,configuredRewards:[{id:'RUBY',num:10}]}],note:'等级与配置未证明每日礼包资格；月卡不代替 VIP。'},
    sources:{daily:{status:'UNKNOWN'},gift:{status:'UNKNOWN'}},note:'缓存观察'}};
  h.run('renderDailies('+JSON.stringify(data)+')');const text=h.node('dailies-table').textContent;
  assert.match(text,/VIP · 采集等级 2/);assert.match(text,/RUBY × 10.*未知/);assert.match(text,/月卡不代替 VIP/);assert.doesNotMatch(text,/可领|直接领取|已领/);
});


test('cached achievement int64 and free gold facts render through assembled page without reward or write claims',async()=>{
 const h=await boot(),before=h.requests.length,data={stale:true,checklist:{tasks:{rows:[],counts:{total:0}},activity:{daily:{activity:null,tiers:[]},weekly:{activity:null,tiers:[]}},gift:{status:'UNKNOWN'},
  achievements:{rows:[{id:1001,progress:'9007199254740993',targetProgress:'9007199254740993',status:'ELIGIBLE'}],counts:{total:1}},freeGold:{used:1,total:3,remaining:2,eligible:true,resetMarker:1780000000,minimumGold:3000,note:'gold/ratio 实际净入待核实；免费观察，付费点金受 D6 禁止'},
  sources:{daily:{status:'UNKNOWN'},gift:{status:'UNKNOWN'},achievements:{status:'AVAILABLE'},freeGold:{status:'AVAILABLE'}},note:'缓存观察不授权执行'}};
 h.run('renderDailies('+JSON.stringify(data)+')');const text=h.node('dailies-table').textContent;assert.match(text,/成就.*1001.*9007199254740993\/9007199254740993.*达到门槛.*奖励映射与领取结算待核实/);assert.match(text,/普通免费点金.*1.*3.*2.*1780000000.*3000/);assert.match(text,/gold\/ratio 实际净入待核实/);assert.doesNotMatch(text,/可领取|免费领取|直接执行|已到账/);assert.equal(h.requests.length,before);
 data.checklist.achievements={rows:[],counts:{total:null}};data.checklist.freeGold={used:null,total:null,remaining:null,eligible:null,resetMarker:null,minimumGold:null,note:'未知'};h.run('renderDailies('+JSON.stringify(data)+')');assert.match(h.node('dailies-table').textContent,/成就列表未知/);assert.match(h.node('dailies-table').textContent,/普通免费点金.*未知/);assert.equal(h.requests.length,before);
});
