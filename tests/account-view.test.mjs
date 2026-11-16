import { dailyChecklist } from '../src/daily-checklist.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { PAGE, createAccountViewGuard } from '../src/page.mjs';

const inline = PAGE.slice(PAGE.indexOf('<script>') + 8, PAGE.lastIndexOf('</script>'));
const tick = () => new Promise((resolve) => setImmediate(resolve));
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
    this.disabled = false; this.value = ''; this._text = ''; this.attrs = {};
    const classes = new Set();
    this.classList = { add: (v) => classes.add(v), contains: (v) => classes.has(v), toggle(v, on) { if (on) classes.add(v); else classes.delete(v); } };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((entry) => entry.textContent).join(''); }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
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
 h.run('renderDailies('+JSON.stringify(data)+')');const text=h.node('dailies-table').textContent;assert.match(text,/成就.*1001.*9007199254740993\/9007199254740993.*达到门槛.*已接入任务奖励；选择成就并重新探测、预览与授权/);assert.match(text,/普通免费点金.*1.*3.*2.*1780000000.*3000/);assert.match(text,/gold\/ratio 实际净入待核实/);assert.doesNotMatch(text,/可领取|免费领取|直接执行|已到账/);assert.equal(h.requests.length,before);
 data.checklist.achievements={rows:[],counts:{total:null}};data.checklist.freeGold={used:null,total:null,remaining:null,eligible:null,resetMarker:null,minimumGold:null,note:'未知'};h.run('renderDailies('+JSON.stringify(data)+')');assert.match(h.node('dailies-table').textContent,/成就列表未知/);assert.match(h.node('dailies-table').textContent,/普通免费点金.*未知/);assert.equal(h.requests.length,before);
});


const importCredential = { url: 'wss://example.invalid/ws', login: { eworldParams: { openId: 'C', token: 'synthetic-import-secret', sign: 'synthetic-import-sign', timestamp: 1 } } };
async function importBoot(empty = false) {
  const h = harness();
  h.respond('/api/accounts', undefined, { activeId: empty ? null : 'A', accounts: empty ? [] : [{ id: 'A', title: 'A' }], csrfToken: 'synthetic-csrf' });
  await tick(); if (!empty) { h.respond('/api/overview', 'A', overview('A')); await tick(); }
  h.node('account-import-json').value = JSON.stringify(importCredential); return h;
}
test('empty account UI explicitly imports and clears secrets; only local account GET follows save', async () => {
  const h = await importBoot(true); assert.equal(h.node('account-import').disabled, false);
  const work = h.node('account-import').onclick(); const request = h.pending('/api/accounts/import');
  assert.ok(request); assert.equal(request.url, '/api/accounts/import'); assert.equal(request.options.headers['x-cw-csrf'], 'synthetic-csrf');
  assert.equal(JSON.parse(request.options.body).confirm, true); assert.equal(h.node('account-import-json').value, '');
  await h.node('account-import').onclick(); assert.equal(h.requests.filter(r => r.url === '/api/accounts/import').length, 1);
  h.respond('/api/accounts/import', undefined, { ok: true }); await tick();
  h.respond('/api/accounts', undefined, { activeId: 'C', accounts: [{ id: 'C', title: 'Imported' }], csrfToken: 'synthetic-csrf' }); await work;
  assert.match(h.node('account-import-hint').textContent, /已新增/);
  assert.equal(h.requests.some(r => /api\/(connect|refresh)/.test(r.url)), false);
  assert.equal(h.node('account-import-json').value, ''); assert.equal(h.streams.length, 0);
});
test('import needs explicit confirmation and current page token; invalid JSON never reaches fetch', async () => {
  const h = await importBoot(); const count = h.requests.length;
  h.run('window.confirm = () => false'); await h.node('account-import').onclick(); assert.equal(h.requests.length, count);
  h.run('window.confirm = () => true'); h.node('account-import-json').value = '{secret-invalid';
  await h.node('account-import').onclick(); assert.equal(h.requests.length, count); assert.doesNotMatch(h.node('account-import-hint').textContent, /secret-invalid/);
  h.node('account-import-json').value = JSON.stringify(importCredential); h.run('accountImportCsrf = null');
  await h.node('account-import').onclick(); assert.equal(h.requests.length, count);
});
test('uncertain import never retries and requires local list read before another explicit submit', async () => {
  const h = await importBoot(); const work = h.node('account-import').onclick(); const request = h.pending('/api/accounts/import');
  request.settled = true; request.reject(Error('synthetic-import-secret')); await work;
  assert.match(h.node('account-import-hint').textContent, /未确认/); assert.doesNotMatch(h.node('account-import-hint').textContent, /synthetic-import-secret/);
  assert.equal(h.node('account-import').disabled, true); await h.node('account-import').onclick();
  assert.equal(h.requests.filter(r => r.url === '/api/accounts/import').length, 1);
  const read = h.node('account-import-read').onclick(); h.respond('/api/accounts', 'A', { activeId: 'A', accounts: [{ id: 'A', title: 'A' }, { id: 'C', title: 'C' }], csrfToken: 'synthetic-csrf' }); await read;
  assert.equal(h.node('account-import').disabled, false);
});
test('account switch clears import drafts and ignores late success without changing account', async () => {
  const h = await importBoot(); const work = h.node('account-import').onclick();
  h.node('account-import-json').value = 'synthetic-import-secret'; h.node('account-import-label').value = 'old';
  h.run("selectAccount('B')"); assert.equal(h.node('account-import-json').value, ''); assert.equal(h.node('account-import-label').value, '');
  h.respond('/api/accounts/import', undefined, { ok: true }); await work;
  assert.equal(h.run('current'), 'B'); assert.equal(h.node('account-import-hint').textContent, '');
  assert.equal(h.pending('/api/accounts'), undefined); assert.equal(h.node('account-import').disabled, true);
});
test('server import rejection cannot reflect credential text into the page', async () => {
  const h = await importBoot(); const work = h.node('account-import').onclick();
  const request = h.pending('/api/accounts/import'); request.settled = true;
  request.resolve({ ok: false, status: 409, json: async () => ({ error: 'synthetic-import-secret' }) }); await work;
  assert.match(h.node('account-import-hint').textContent, /已存在/); assert.doesNotMatch(h.node('account-import-hint').textContent, /synthetic-import-secret/);
  assert.equal(h.node('account-import-json').value, '');
});


test('HTTP success alone does not confirm import when independent local list lacks the account', async () => {
  const h = await importBoot(); const work = h.node('account-import').onclick();
  h.respond('/api/accounts/import', undefined, { ok: true }); await tick();
  h.respond('/api/accounts', 'A', { activeId: 'A', accounts: [{ id: 'A', title: 'A' }], csrfToken: 'synthetic-csrf' }); await work;
  assert.match(h.node('account-import-hint').textContent, /未确认/); assert.equal(h.node('account-import').disabled, true);
  assert.equal(h.requests.filter(r => r.url === '/api/accounts/import').length, 1);
});
test('server error leaves import uncertain without reading or resubmitting automatically', async () => {
  const h = await importBoot(); const work = h.node('account-import').onclick(); const request = h.pending('/api/accounts/import');
  request.settled = true; request.resolve({ ok: false, status: 500 }); await work;
  assert.match(h.node('account-import-hint').textContent, /未确认/); assert.equal(h.node('account-import').disabled, true);
  assert.equal(h.pending('/api/accounts'), undefined); assert.equal(h.node('account-import-json').value, '');
});

test('worlds PAGE displays exact recorded identities as readonly facts and clears pending old rows',async()=>{
 const h=await boot(),data={accountId:'A',recentWorlds:[{worldId:'9007199254740995',role:{id:'9007199254740993',bornWorldId:'9007199254740995',worldId:'9007199254740997',nickname:'<synthetic role>',level:1}}]};
 let work=h.node('load-worlds').onclick();h.respond('/api/worlds','A',data);await work;assert.match(h.node('worlds').textContent,/列表区服键 9007199254740995.*角色 9007199254740993.*出生服 9007199254740995.*当前世界 9007199254740997/);assert.match(h.node('worlds').textContent,/不授予切服或创建角色权限/);assert.equal(h.node('enter-world').disabled,true);assert.equal(h.node('world-input').disabled,true);
 work=h.node('load-worlds').onclick();assert.equal(h.node('worlds').textContent,'');h.respond('/api/worlds','A',{accountId:'B',recentWorlds:data.recentWorlds});await work;assert.match(h.node('worlds-hint').textContent,/账号不匹配/);assert.doesNotMatch(h.node('worlds').textContent,/9007199254740993/);assert.equal(h.requests.filter(row=>(row.options.method||'GET')==='POST').length,0);
});

function activityOverviewReply(account='A'){
 const stamp='2026-11-15T08:00:00.000Z',context={accountId:account,generation:2,connectionId:'synthetic',playerId:'17',worldId:'9'};
 return {...overview(account),dataContext:{...context},activityAlliance:{accountId:account,context,observedContext:{...context},readOnly:true,executable:false,complete:false,coverage:'CURRENT_CACHE_ONLY',status:'OBSERVED',updatedAt:stamp,stale:false,sources:[{request:'AllGuildAbstractionRequest',name:'公会摘要',status:'AVAILABLE',updatedAt:stamp,precision:'DECODED_EXACT'},{request:'WeekInfoRequest',name:'周活动',status:'FAILED',updatedAt:null,precision:'DECODED_EXACT'}],checklist:{tasks:{counts:{total:0,completed:0,claimed:0,eligible:0}},activity:{daily:{activity:0},weekly:{activity:null}},sources:{daily:{status:'AVAILABLE',observedAt:stamp}},festival:{rows:[],source:{status:'UNKNOWN'}}},weekly:{rows:[],listObserved:false},alliance:{rows:[{id:'9007199254740995',level:0}],listObserved:true,membershipKnown:false},note:'只读合成；没有完整目录或写授权'}};
}
async function loadActivityOverview(h,reply=activityOverviewReply()){
 const task=h.run('refreshOverview()');h.respond('/api/overview','A',reply);await task;return h.node('overview-activity-alliance');
}
function activityButtons(box){return box.children.filter(child=>child.dataset.overviewDomain);}
test('activity alliance overview PAGE renders observed zero, unknown fields, precise IDs and separate source failures without writes',async()=>{
 const h=await boot(),count=h.requests.length,box=await loadActivityOverview(h);assert.match(box.textContent,/9007199254740995/);const taskTable=box.children.find(row=>row.tagName==='table');assert.equal(taskTable.children[0].children[0].textContent,'每日任务完成');assert.equal(taskTable.children[1].children[0].textContent,'0/0');assert.equal(taskTable.children[1].children[1].textContent,'0');assert.match(box.textContent,/未知/);assert.match(box.textContent,/读取失败/);assert.match(box.textContent,/摘要列表不代表本人联盟/);assert.match(box.textContent,/不等于可领取/);assert.equal(activityButtons(box).length,5);assert.equal(h.requests.length,count+1);assert.ok(h.requests.every(row=>(row.options.method||'GET')==='GET'));
});
test('activity alliance overview PAGE navigation only opens original professional surfaces and never prepares or authorizes actions',async()=>{
 const h=await boot(),box=await loadActivityOverview(h);h.run("globalThis.overviewLinks=[];document.querySelector=selector=>({click(){overviewLinks.push(selector);}})");const count=h.requests.length;for(const button of activityButtons(box))button.onclick();assert.equal(h.requests.length,count);assert.deepEqual(Array.from(h.run('overviewLinks')),['#tabs button[data-tab="dailies"]','#tabs button[data-tab="idle"]','#tabs button[data-tab="alliance"]','#tabs button[data-tab="fleet"]','#tabs button[data-tab="explorer"]']);
});
test('activity alliance overview PAGE account switch clears old cards and old buttons cannot navigate',async()=>{
 const h=await boot(),box=await loadActivityOverview(h),old=activityButtons(box)[0];h.run("globalThis.overviewLinks=[];document.querySelector=selector=>({click(){overviewLinks.push(selector);}});selectAccount('B')");assert.equal(box.textContent,'');old.onclick();assert.equal(h.run('overviewLinks.length'),0);
});
test('activity alliance overview PAGE late A response cannot replace current B observations',async()=>{
 const h=await boot(),old=h.run('refreshOverview()');h.run("selectAccount('B')");const next=h.run('refreshOverview()');h.respond('/api/overview','B',activityOverviewReply('B'));await next;const box=h.node('overview-activity-alliance'),before=box.textContent;h.respond('/api/overview','A',activityOverviewReply());await old;assert.equal(box.textContent,before);assert.ok(before.includes('9007199254740995'));
});
test('activity alliance overview PAGE failed current read clears old card and superseded buttons cannot navigate',async()=>{
 const h=await boot(),box=await loadActivityOverview(h),old=activityButtons(box)[0];h.run("globalThis.overviewLinks=[];document.querySelector=selector=>({click(){overviewLinks.push(selector);}})");const next=h.run('refreshOverview()');h.respond('/api/overview','A',{error:'synthetic failed'},false);await next;assert.doesNotMatch(box.textContent,/9007199254740995/);assert.match(box.textContent,/来源未知/);old.onclick();assert.equal(h.run('overviewLinks.length'),0);
});
for(const fault of ['account','context','generation','connection','player','world','readOnly','executable','complete','coverage'])test('activity alliance overview PAGE '+fault+' mismatch refuses borrowed summary',async()=>{
 const h=await boot(),reply=activityOverviewReply(),value=reply.activityAlliance;if(fault==='account')value.accountId='B';if(fault==='context')value.context.accountId='B';if(fault==='generation')value.context.generation=3;if(fault==='connection')value.context.connectionId='other';if(fault==='player')value.context.playerId='18';if(fault==='world')value.context.worldId='10';if(fault==='readOnly')value.readOnly=false;if(fault==='executable')value.executable=true;if(fault==='complete')value.complete=true;if(fault==='coverage')value.coverage='ALL_ACTIVITIES';const box=await loadActivityOverview(h,reply);assert.match(box.textContent,/来源未知/);assert.doesNotMatch(box.textContent,/9007199254740995/);assert.equal(activityButtons(box).length,0);
});
test('activity alliance overview PAGE marks stale observations and does not treat empty guild or activity lists as complete',async()=>{
 const h=await boot(),reply=activityOverviewReply();reply.activityAlliance.status='STALE';reply.activityAlliance.stale=true;reply.activityAlliance.alliance.rows=[];reply.activityAlliance.weekly.listObserved=true;const box=await loadActivityOverview(h,reply);assert.match(box.textContent,/缓存过期/);assert.match(box.textContent,/不能认定未加入联盟/);assert.match(box.textContent,/不代表完整活动目录/);
});
test('activity alliance overview PAGE observed strings are text rather than injected HTML',async()=>{
 const h=await boot(),reply=activityOverviewReply(),value='<img src=x onerror=alert(1)>';reply.activityAlliance.alliance.rows[0].id=value;reply.activityAlliance.sources[0].name=value;const box=await loadActivityOverview(h,reply);assert.ok(box.textContent.includes(value));const all=el=>el.children.flatMap(child=>[child,...all(child)]);assert.equal(all(box).some(child=>String(child.tagName).toLowerCase()==='img'),false);assert.equal(h.requests.some(row=>row.options.method==='POST'),false);
});

test('activity alliance overview PAGE shows observed festival window and check-in records with unknown claim eligibility',async()=>{
 const h=await boot(),reply=activityOverviewReply();reply.activityAlliance.checklist.festival={rows:[{activityId:'9007199254740995',status:'OBSERVED',startTime:100,openTime:110,closeTime:190,endTime:200,checkInRecord:{status:'OBSERVED',checkInId:[0,2]},eligible:null,executable:false}],source:{status:'OBSERVED',observedAt:'2026-11-15T08:00:00.000Z'}};const box=await loadActivityOverview(h,reply);assert.ok(box.textContent.includes('0、2'));assert.match(box.textContent,/窗口不证明当前开放或签到资格/);assert.equal(h.requests.some(row=>row.options.method==='POST'),false);
});


function ownAllianceReply(){
 const reply=activityOverviewReply(),context=reply.dataContext;reply.ownAlliance={accountId:'A',context:{...context},readOnly:true,executable:false,complete:false,coverage:'LATEST_EXPLICIT_SURVEY_ONLY',status:'OBSERVED',guildId:'9007199254740995',membershipObserved:true,surveyedAt:'2026-11-15T08:00:00Z',members:{request:'GuildMemberRequest',status:'OBSERVED',observedAt:'2026-11-15T07:59:59Z',rows:[{playerId:'9007199254740997',nickname:'<synthetic-member>',online:false,title:0}]},technology:{request:'GuildTechInfoRequest',status:'OBSERVED',rows:[{techId:1,name:'synthetic-technology',level:0}]},order:{request:'GuildOrderRequest',status:'UNKNOWN',requirements:null,nextRefreshTime:null},ship:{request:'GuildShipRequest',status:'UNKNOWN',rows:[]},note:'普通调查与商船调查各有范围；未知不补空。'};return reply;
}
test('own alliance PAGE shows read-only Service observations even while Collector sources remain unknown',async()=>{
 const h=await boot(),reply=ownAllianceReply();reply.activityAlliance.status='UNKNOWN';reply.ownAlliance.ship={request:'GuildShipRequest',status:'OBSERVED',rows:[{shipId:1,type:0,state:0,leaderId:'9007199254740999',preparedEndTime:0,mvEndTime:null}]};
 const before=h.requests.length,box=await loadActivityOverview(h,reply);assert.match(box.textContent,/本人联盟调查摘要/);assert.match(box.textContent,/9007199254740997/);assert.match(box.textContent,/<synthetic-member>/);assert.match(box.textContent,/synthetic-technology/);assert.match(box.textContent,/9007199254740999/);assert.match(box.textContent,/订单刷新时间原值：未知/);assert.match(box.textContent,/本人归属仅为调查时观察/);assert.equal(h.requests.length,before+1);assert.equal(h.requests.some(row=>row.options.method==='POST'),false);
 const all=e=>e.children.flatMap(child=>[child,...all(child)]);assert.equal(all(box).some(e=>e.tagName==='img'),false);
});
for(const key of ['accountId','generation','connectionId','playerId','worldId'])test('own alliance PAGE rejects mismatched '+key+' without losing independent collector view',async()=>{
 const h=await boot(),reply=ownAllianceReply();reply.ownAlliance.context[key]=key==='generation'?3:'other';const box=await loadActivityOverview(h,reply);assert.doesNotMatch(box.textContent,/synthetic-member/);assert.match(box.textContent,/本人联盟来源未知/);assert.match(box.textContent,/公会摘要观察/);
});
test('own alliance PAGE failed reread and account switch remove former own member observations',async()=>{
 const h=await boot();let box=await loadActivityOverview(h,ownAllianceReply());assert.match(box.textContent,/synthetic-member/);
 let work=h.run('refreshOverview()');const pending=h.pending('/api/overview','A');pending.settled=true;pending.reject(Error('synthetic failed'));await work;assert.doesNotMatch(box.textContent,/synthetic-member/);
 box=await loadActivityOverview(h,ownAllianceReply());h.run("selectAccount('B')");assert.equal(box.textContent,'');assert.equal(h.requests.some(row=>row.options.method==='POST'),false);
});

function fleetOverviewReply(){const reply=activityOverviewReply();reply.fleetWorld={accountId:'A',context:{...reply.dataContext},readOnly:true,executable:false,complete:false,coverage:'LATEST_EXPLICIT_SURVEY_ONLY',fleets:{request:'MyFleetsRequest',status:'OBSERVED',rows:[{buildingId:'<synthetic-fleet-overview>',state:0,cityId:1,targetCityId:null,durability:0,maxDura:100,moveEndTs:0}]},world:{request:'WorldInfoRequest',status:'OBSERVED',coverage:'CURRENT_RESPONSE_ONLY',mapComplete:false,query:{screenCenter:{x:0,y:0}},rows:[{id:1,state:0,guildIdx:0}]}};return reply;}
test('Fleet PAGE renders bounded historical cache with safe text and no implicit POST',async()=>{const h=await boot(),reply=fleetOverviewReply(),before=h.requests.length,box=await loadActivityOverview(h,reply);assert.match(box.textContent,/舰队与海面调查摘要/);assert.match(box.textContent,/打开舰队专业页/);assert.match(box.textContent,/<synthetic-fleet-overview>/);assert.match(box.textContent,/查询中心原值：0 \/ 0/);assert.match(box.textContent,/本次响应不代表完整地图/);assert.equal(h.requests.length,before+1);assert.equal(h.requests.some(row=>row.options.method==='POST'),false);const all=e=>e.children.flatMap(c=>[c,...all(c)]);assert.equal(all(box).some(e=>String(e.tagName).toLowerCase()==='img'),false);});
for(const key of ['accountId','generation','connectionId','playerId','worldId'])test('Fleet PAGE rejects stale '+key,async()=>{const h=await boot(),reply=fleetOverviewReply();reply.fleetWorld.context[key]=key==='generation'?3:'other';const box=await loadActivityOverview(h,reply);assert.doesNotMatch(box.textContent,/synthetic-fleet-overview/);assert.match(box.textContent,/舰队与海面来源未知/);});
test('Fleet PAGE failed overview and account switch clear old observations',async()=>{const h=await boot();let box=await loadActivityOverview(h,fleetOverviewReply());assert.match(box.textContent,/synthetic-fleet-overview/);const pending=h.run('refreshOverview()'),request=h.pending('/api/overview','A');request.settled=true;request.reject(Error('synthetic failed'));await pending;assert.doesNotMatch(box.textContent,/synthetic-fleet-overview/);box=await loadActivityOverview(h,fleetOverviewReply());h.run("selectAccount('B')");assert.equal(box.textContent,'');});

test('activity alliance overview PAGE reuses original seasonal child observations with text safety and account clearing',async()=>{
 const h=await boot(),reply=activityOverviewReply(),context=reply.dataContext,observation={...context,status:'OBSERVED',reliable:true,source:'SCAllActivity.festivalActivities',scope:'ACCEPTED_STREAM_OBSERVATION_ONLY',seq:1,observedAt:'2026-11-16T01:00:00.000Z',activities:[{activityId:'9007199254740993',season:3,subActivity:[{subActivityType:28,compassWheel:{score:50,claimedId:1}},{subActivityType:29},{subActivityType:30,evilExpel:{killTotal:10,claimed:5,alive:0}}]}]};reply.activityAlliance.checklist.festival=dailyChecklist({sessionFacts:{festivalActivities:observation}},{context}).festival;const box=await loadActivityOverview(h,reply);assert.match(box.textContent,/活动子项原值/);assert.match(box.textContent,/积分 50；已报奖励 ID 1/);assert.match(box.textContent,/累计击杀 10；已报累计档位 5；存活 0/);assert.ok(box.textContent.includes('会话/成本/答案/结算未知'));assert.equal(h.requests.some(row=>row.options.method==='POST'),false);
 h.run("selectAccount('B')");assert.equal(box.textContent,'');
});
