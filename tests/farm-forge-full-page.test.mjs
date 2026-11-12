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
const pirateDay='2026-11-12';
const pirateTarget={uid:17,cityId:9,type:1,level:2,gridIdx:0,maxKilledLevel:3,levelRelation:'LOWER'};
const pirateCase={module:'pirate-sweep',actionId:'pirate-sweep:synthetic-exact',actionType:'SWEEP',parameters:{uid:17,cityId:9,allowLowerLevel:true},costs:[],blockedReason:'PIRATE_FIRST_KILL_REQUIRED',facts:{
 quota:{dayKey:pirateDay,used:2,total:13,remaining:11,reason:null},quotaBreakdown:{base:10,vip:1,monthCards:2},targets:[pirateTarget,{...pirateTarget,uid:18,level:4,levelRelation:'FIRST_KILL_REQUIRED'}],
}};
const cases = [
  {module:'free-recruit',actionId:'free-recruit:0:synthetic',actionType:'CLAIM',parameters:{},costs:[],facts:{recruit:{hero:{freeEndTimeSeconds:0,recruitTimes:1}},broadcast:{level:1}},blockedReason:'FREE_RECRUIT_COOLDOWN'},
  {module:'free-gold',actionId:'free-gold:2000:1:synthetic',actionType:'CLAIM',parameters:{},costs:[],facts:{gold:{freeTimes:0,paidTimes:0,resetTime:2000,minGold:7500,maxPaidTimes:10}},blockedReason:'FREE_GOLD_EXHAUSTED'},
  {module:'afk-level-rewards',actionId:'afk-level-rewards:2:synthetic-exact',actionType:'CLAIM',parameters:{level:2},costs:[],facts:{afk:{level:5,rewardedLevel:0}},blockedReason:'AFK_LEVEL_TOO_LOW'},
  ...['main','branch','achievement'].map(kind=>({module:'task-rewards',actionId:'task-rewards:'+kind+':synthetic-exact',actionType:'CLAIM',parameters:{kind,taskId:kind==='achievement'?1001:kind==='main'?1:8001},costs:[],facts:{},blockedReason:'TASK_INCOMPLETE'})),
  pirateCase,
  ...[
   {actionType:'SUIT',parameters:{action:'suit',suitId:1001},costs:[],facts:{antiques:[],suits:[{suitId:1001,name:'测试套装',color:'BLUE',level:0,ownedMembers:3,requiredMembers:3,maximumLevel:200,unlockedLevel:0,effectiveNum:0,advEffectValue:0}]}},
   {actionType:'SUIT',parameters:{action:'suit',suitId:1001},costs:[{id:'GOLD',num:50},{id:'蓝藏品经验',num:370}],facts:{antiques:[],suits:[{suitId:1001,name:'测试套装',color:'BLUE',level:1,ownedMembers:3,requiredMembers:3,maximumLevel:200,unlockedLevel:10,effectiveNum:3,advEffectValue:0}]}},
   {actionType:'MASTER',parameters:{action:'master'},costs:[],facts:{antiques:[],master:{level:0,totalStars:0,maxLevel:100,unlockedSuitLevel:0,next:{level:1,totalStarNum:0,maxSuitLv:10,costs:[],attributes:[]}}}},
   {actionType:'MASTER',parameters:{action:'master'},costs:[{id:'藏品大师经验',num:5}],facts:{antiques:[],master:{level:1,totalStars:5,maxLevel:100,unlockedSuitLevel:10,next:{level:2,totalStarNum:5,maxSuitLv:10,costs:[{id:'藏品大师经验',num:5}]}}}},
   {actionType:'EXCHANGE',parameters:{action:'exchange',antiqueId:'测试藏品',num:7},costs:[{id:'蓝藏万能碎片',num:7}],facts:{antiques:[{antiqueId:'测试藏品',name:'测试藏品',color:'BLUE',owned:true,star:1,fragmentId:'测试藏品碎片',fragments:20,universalItemId:'蓝藏万能碎片',universalFragments:30}]}},
  ].map((row,index)=>({module:'antique-growth',actionId:'antique-growth:'+row.actionType+':advanced-'+index,blockedReason:'ANTIQUE_ADVANCED_GUARD',...row})),
  {module:'antique-growth',actionId:'antique-growth:ACTIVATE:synthetic-exact',actionType:'ACTIVATE',parameters:{antiqueId:'测试藏品',action:'activate'},costs:[{id:'测试藏品碎片',num:10}],beforeState:{antique:null},facts:{antiques:[{antiqueId:'测试藏品',name:'测试藏品',color:'BLUE',owned:false,star:null,fragmentId:'测试藏品碎片',fragments:20}]},blockedReason:'ANTIQUE_ALREADY_ACTIVE'},
  {module:'antique-growth',actionId:'antique-growth:STAR:synthetic-exact',actionType:'STAR',parameters:{antiqueId:'测试藏品',action:'star'},costs:[{id:'测试藏品碎片',num:2}],beforeState:{antique:{id:'测试藏品',star:0}},facts:{antiques:[{antiqueId:'测试藏品',name:'测试藏品',color:'BLUE',owned:true,star:0,fragmentId:'测试藏品碎片',fragments:20}]},blockedReason:'ANTIQUE_MAX_STAR'},
  { module:'heroes',actionId:'heroes:EXCLUSIVE-LEVEL:synthetic-exact',actionType:'EXCLUSIVE-LEVEL',parameters:{heroId:'A',action:'exclusive-level'},costs:[{id:'初级专武材料',num:20}],facts:{heroes:[{heroId:'A',level:1,star:15,power:'9007199254740993',skillLevels:[1,1],exclusive:{level:1,star:0}}]},blockedReason:'EXCLUSIVE_ACTIVE_OWN_STATE_REQUIRED' },
  { module:'heroes',actionId:'heroes:EXCLUSIVE-STAR:synthetic-exact',actionType:'EXCLUSIVE-STAR',parameters:{heroId:'A',action:'exclusive-star'},costs:[{id:'A碎片',num:60},{id:'橙专武升星石',num:5}],facts:{heroes:[{heroId:'A',level:1,star:25,power:'9007199254740993',skillLevels:[1,1],exclusive:{level:1,star:0}}]},blockedReason:'EXCLUSIVE_ACTIVE_OWN_STATE_REQUIRED' },

  { module:'equipment-growth',actionId:'equipment-growth:REFINE:synthetic-exact',actionType:'REFINE',parameters:{heroId:'A',uid:'9007199254740994',action:'refine'},costs:[{id:'精铁',num:90500},{id:'精炼石',num:100}],facts:{heroes:[{heroId:'A',equips:[{uid:'9007199254740994',equipId:'红武器1',level:1,star:0,refineLv:0}]}]},blockedReason:'EXACT_RED_WORN_EQUIPMENT_REQUIRED' },
  { module:'equipment-growth',actionId:'equipment-growth:LEVEL:synthetic-exact',actionType:'LEVEL',parameters:{heroId:'A',uid:'9007199254740994'},costs:[{id:'精铁',num:4}],facts:{heroes:[{heroId:'A',equips:[{uid:'9007199254740994',equipId:'蓝武器1',level:1,star:0,refineLv:0}]}]},blockedReason:'TARGET_HERO_DERIVED_STATE_UNKNOWN' },
  { module:'equipment-growth',actionId:'equipment-growth:PUT-ON:synthetic-exact',actionType:'PUT-ON',parameters:{heroId:'A',uid:'9007199254740994',action:'put-on'},costs:[],beforeState:{equipment:{equipId:'蓝武器1',level:1,star:0,refineLv:0}},facts:{heroes:[{heroId:'A',equips:[]}]},blockedReason:'EQUIPMENT_TARGET_SLOT_NOT_EMPTY' },
  { module:'badge-growth',actionId:'badge-growth:PUT-ON:synthetic-exact',actionType:'PUT-ON',parameters:{action:'put-on',heroId:'A',pos:2,uid:'9007199254740997'},costs:[],beforeState:{badge:{badgeId:'闲置纹章',level:1,exp:0}},facts:{mode:'put-on',heroes:[{heroId:'A',level:70,badges:[],emptySlots:[1,2]}]},blockedReason:'BADGE_TARGET_SLOT_NOT_EMPTY' },
  { module:'badge-growth',actionId:'badge-growth:LEVEL:synthetic-exact',actionType:'LEVEL',parameters:{heroId:'A',uid:'9007199254740995'},costs:[{id:'徽章经验',num:5},{id:'GOLD',num:100}],beforeState:{badge:{badgeId:'测试纹章',level:1,exp:0}},facts:{},blockedReason:'BADGE_PARTIAL_XP_OUTSIDE_SCOPE' },
  { module: 'formation-unlock', actionId: 'formation-unlock:UNLOCK:2:synthetic-exact', actionType: 'UNLOCK', parameters: {presetId:2}, costs:[{id:'阵型2图纸',num:1}], facts:{templates:[{presetId:2,name:'普通图纸模板',costs:[{id:'阵型2图纸',num:1}]}],unlockedPresetIds:[1]}, blockedReason:'OWNED_BLUEPRINT_REQUIRED' },
  { module: 'farm', actionId: 'farm:PLANT:synthetic-exact', actionType: 'PLANT', parameters: { buildingId: '1农田', action: 'plant', productId: '小麦' }, costs: [{ id: '小麦种子', num: 1 }], facts: { plots: [{ buildingId: '1农田', state: 'EMPTY', productId: '', plantTime: 0, ripeTime: 0 }], autoFarming: false, crops: [{ productId: '小麦', costs: [{ id: '小麦种子', num: 1 }], reliable: true }] }, blockedReason: 'FARM_MATURITY_TIME_UNIT_UNVERIFIED' },
  { module: 'equipment-forge', actionId: 'equipment-forge:MAKE:synthetic-exact', actionType: 'MAKE', parameters: { buildingId: '1装备厂', action: 'make', makeId: 1001, allowUniversal: false }, costs: [{ id: '材料', num: 4 }], facts: { forges: [{ buildingId: '1装备厂', level: 1, queue: { state: 'IDLE' } }], recipes: [{ makeId: 1001, type: '武器', season: 1, costs: [{ id: '材料', num: 4 }], equipIds: ['蓝武器1'] }], bag: [{ uid: '9007199254740993', equipId: '蓝武器1', level: 0, star: 2, refineLv: 0 }] }, blockedReason: 'QUEUE_IDLE_BLOCKED_EVIDENCE' },
];
function candidate(spec) {
  return { module: spec.module, actionId: spec.actionId, actionType: spec.actionType, label: 'Synthetic ' + spec.actionType, executable: true, parameters: spec.parameters, rewards:spec.module==='task-rewards'?[{id:'EXP',num:5}]:spec.module==='afk-level-rewards'?[{id:'抽卡券',num:2}]:undefined,progress:15,requiredProgress:15,target: spec.module==='free-recruit'?{freeEndTimeSeconds:0,way:1}:spec.module==='free-gold'?{resetTime:2000,usedBefore:0}:['task-rewards','afk-level-rewards'].includes(spec.module)?spec.parameters:spec.module==='pirate-sweep'?pirateTarget:spec.module==='antique-growth'?(spec.actionType==='SUIT'?{suitId:spec.parameters.suitId}:spec.actionType==='MASTER'?{kind:'ANTIQUE_MASTERY'}:{antiqueId:spec.parameters.antiqueId}):spec.module==='heroes'?{heroId:spec.parameters.heroId}:['equipment-growth','badge-growth'].includes(spec.module)?{heroId:spec.parameters.heroId,uid:spec.parameters.uid,...(spec.module==='badge-growth'?{pos:spec.parameters.pos??1}:spec.actionType==='PUT-ON'?{type:'武器'}:{})}:spec.module==='formation-unlock'?{presetId:spec.parameters.presetId}:{buildingId:spec.parameters.buildingId}, costs: spec.costs, costSource: 'synthetic offline proof', beforeState: spec.beforeState??{ state: 'IDLE' }, expectedState: { state: 'CHANGED' } };
}
function data(spec, { disabled = false } = {}) {
  return { accountId: 'A', module: spec.module, csrfToken: 'synthetic-csrf-A', config: { enabled: !disabled }, status: { running: false, blocked: false }, functions: ['survey', 'plan'], view: { ...spec.facts, candidates: disabled ? [] : [candidate(spec), { ...candidate(spec), actionId: spec.actionId + ':blocked', executable: false, blockedReason: spec.blockedReason }] } };
}
function plan(spec) {
  return { accountId: 'A', module: spec.module, batchId: 'batch-' + spec.module, planHash: 'hash-' + spec.module, mode: 'Manual', actions: [candidate(spec)], resourceBudget: spec.costs, ...(spec.module==='free-recruit'?{budgetClaims:{resources:[],quotas:[{id:'free-recruit:cooldown:0',num:1}],uids:[{type:'free-recruit',id:'0'}]}}:{}), ...(spec.module==='free-gold'?{budgetClaims:{resources:[],quotas:[{id:'free-gold:reset:2000',num:1}],uids:[{type:'free-gold',id:'2000:1'}]}}:{}), ...(spec.module==='pirate-sweep'?{budgetClaims:{resources:[],quotas:[{id:'pirate-sweep:'+pirateDay,num:1}],uids:[{type:'pirate',id:'17'}]}}:{}), expiresAt: Date.now() + 60000 };
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
  const testLabel=spec.module+':'+spec.actionType;
  test(testLabel + ': assembled PAGE reaches exact Manual preview, authorize and execute once through actual account/CSRF caller', async () => {
    const h = await loaded(spec); await preview(h, spec);
    assert.equal(Object.hasOwn(data(spec).view.candidates[0], 'action'), false, 'fixture matches cropped public candidates');
    const ids = [...PAGE.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    for (const id of [spec.module==='pirate-sweep'?'tab-pirate-sweep':'gp-' + spec.module + '-section', 'gp-' + spec.module + '-plan']) assert.equal(ids.filter((value) => value === id).length, 1);
    if(spec.module==='pirate-sweep')assert.match(h.node('gp-pirate-sweep-plan-view').textContent,/额度占用：海面扫荡 2026-11-12 ×1/);
    h.setConfirm(false); await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
    h.setConfirm(true); const running = h.node('gp-' + spec.module + '-authorize').onclick(), expected = plan(spec);
    assertMutation(h.pending('/api/operations/authorize'), '/api/operations/authorize', { batchId: expected.batchId, planHash: expected.planHash, approvedActionIds: [spec.actionId], resourceBudget: spec.costs, confirm: true });
    assert.ok(h.confirmations.at(-1).includes('账号 A')); assert.ok(h.confirmations.at(-1).includes(expected.batchId)); assert.ok(h.confirmations.at(-1).includes(expected.planHash)); assert.ok(h.confirmations.at(-1).includes(spec.costs[0]?.id??'无资源消耗'));
    if(spec.module==='free-recruit'){assert.match(h.confirmations.at(-1),/free-recruit:cooldown:0/);assert.match(h.confirmations.at(-1),/"way": 1/);}
    if(spec.module==='free-gold'){assert.match(h.confirmations.at(-1),/free-gold:reset:2000/);assert.match(h.confirmations.at(-1),/"usedBefore": 0/);}
    if(spec.module==='pirate-sweep')assert.match(h.confirmations.at(-1),/额度占用：海面扫荡 2026-11-12 ×1/);
    h.respond('/api/operations/authorize', { accountId: 'A', batchId: expected.batchId, permitId: 'synthetic-permit' }); await tick();
    assertMutation(h.pending('/api/operations/execute'), '/api/operations/execute', { batchId: expected.batchId, permitId: 'synthetic-permit' });
    h.respond('/api/operations/execute', { runId: 'synthetic-run-' + spec.module, status: 'EXECUTING' }); await running;
    assert.match(h.node('gp-' + spec.module + '-hint').textContent, /结果以复读和执行历史为准/);
    assert.doesNotMatch(h.node('gp-' + spec.module + '-hint').textContent, /执行成功|验证成功/);
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.deepEqual(writes(h).map((request) => new URL(request.url, 'http://localhost').pathname), ['/api/operations/plan', '/api/operations/authorize', '/api/operations/execute']);
  });

  test(testLabel + ': A→B→A late permit cannot reach execute or restore an old account token', async () => {
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

  test(testLabel + ': an edited draft discards a late full-page preview and detached domain controls', async () => {
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

  test(testLabel + ': a response with a different action cannot promote a preview into authorization', async () => {
    const h = await loaded(spec); domainButtons(h, spec)[0].click();
    const task = h.node('gp-' + spec.module + '-plan').onclick(), wrong = plan(spec); wrong.actions[0].actionId = 'formation:not-the-selected-action';
    h.respond('/api/operations/plan', wrong); await task;
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    assert.match(h.node('gp-' + spec.module + '-hint').textContent, /具体计划与选择不匹配/);
    assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
  });

  test(testLabel + ': a permit for another account is consumed locally and never dispatched', async () => {
    const h = await loaded(spec); await preview(h, spec);
    const task = h.node('gp-' + spec.module + '-authorize').onclick();
    h.respond('/api/operations/authorize', { accountId: 'B', batchId: plan(spec).batchId, permitId: 'wrong-account' }); await task;
    assert.equal(writes(h, '/api/operations/execute').length, 0);
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    assert.match(h.node('gp-' + spec.module + '-hint').textContent, /操作账号不匹配/);
    await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.equal(writes(h, '/api/operations/authorize').length, 1);
  });

  test(testLabel + ': default-off cached state has no executable selection or implicit writes', async () => {
    const h = await loaded(spec, { disabled: true });
    assert.equal(domainButtons(h, spec).length, 0);
    assert.equal(h.node('gp-' + spec.module + '-plan').disabled, true);
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    assert.equal(JSON.parse(h.node('gp-' + spec.module + '-config').value).enabled, false);
    assert.equal(writes(h).length, 0);
    assert.ok(h.requests.every((request) => ['/api/accounts', '/api/overview', '/api/gameplay'].includes(new URL(request.url, 'http://localhost').pathname)));
  });
}
const extremeSource={playerId:'9007199254740993',worldId:'2000001',replayId:'9007199254740995',nickname:'<img src=x onerror=evil()>',power:'9007199254740999',heroPositions:[{heroId:'A',pos:{x:1,y:1}}]};
const extremeParameters={presetId:2,heroPositions:[{heroId:'A',pos:{x:1,y:1}}]};
async function extremeLoaded(){
 const h=await boot(),task=h.node('gp-formation-load').onclick();
 h.respond('/api/gameplay',{accountId:'A',module:'formation',csrfToken:'synthetic-csrf-A',config:{enabled:true,mainlineEnabled:false},status:{running:false,blocked:false},view:{formation:{presetId:1,heroPositions:[{heroId:'A',pos:{x:1,y:1}}],petUid:'9007199254740997'},layouts:[{id:1,reliable:true,positions:[{x:1,y:1}]},{id:2,reliable:true,positions:[{x:1,y:1}]}],heroes:[{heroId:'A',career:'坦克'}],unlockedPresetIds:[1,2],candidates:[]}}, {module:'formation'});await task;return h;
}
async function extremeList(h){const task=h.node('ex-survey').onclick();assertMutation(h.pending('/api/formations/extreme/survey'),'/api/formations/extreme/survey',{});h.respond('/api/formations/extreme/survey',{accountId:'A',stage:101,rows:[extremeSource],csrfToken:'synthetic-csrf-A'});await task;}
const extremePrepared=()=>({accountId:'A',mode:'MAINLINE',parameters:extremeParameters,preservedPetUid:'9007199254740997',source:{...extremeSource,stage:101},requiresFreshSurvey:true,requiresFreshPlan:true,requiresAuthorization:true,resumable:false});

test('C215 assembled PAGE discovers source and loads verified parameters without auto-plan or authorization',async()=>{
 const h=await extremeLoaded();assert.equal(h.node('ex-survey').disabled,false);await extremeList(h);assert.equal(h.node('ex-prepare').disabled,false);assert.ok(h.node('ex-selected').textContent.includes(extremeSource.nickname));
 const task=h.node('ex-prepare').onclick();assertMutation(h.pending('/api/formations/extreme/prepare'),'/api/formations/extreme/prepare',{stage:101,playerId:extremeSource.playerId,worldId:extremeSource.worldId,replayId:extremeSource.replayId});h.respond('/api/formations/extreme/prepare',extremePrepared());await task;
 assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),extremeParameters);assert.equal(h.node('gp-formation-plan').disabled,true);assert.equal(h.node('gp-formation-authorize').disabled,true);assert.match(h.node('ex-hint').textContent,/重新探测.*授权/);assert.deepEqual(writes(h).map(r=>new URL(r.url,'http://localhost').pathname),['/api/formations/extreme/survey','/api/formations/extreme/prepare']);
});

test('C215 assembled PAGE discards late prepared parameters after an edited Formation draft',async()=>{const h=await extremeLoaded();await extremeList(h);const task=h.node('ex-prepare').onclick();h.node('gp-formation-parameters').value=JSON.stringify({presetId:3});h.node('gp-formation-parameters').oninput();h.respond('/api/formations/extreme/prepare',extremePrepared());await task;assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),{presetId:3});assert.equal(h.node('gp-formation-authorize').disabled,true);assert.equal(writes(h,'/api/operations/plan').length,0);});

test('C215 assembled PAGE ignores A to B to A late source discovery and old account token',async()=>{const h=await extremeLoaded();const task=h.node('ex-survey').onclick();h.run("selectAccount('B'); selectAccount('A');");h.respond('/api/formations/extreme/survey',{accountId:'A',stage:101,rows:[extremeSource],csrfToken:'late-old-A'});await task;assert.equal(h.node('ex-selected').textContent,'');assert.equal(h.node('ex-hint').textContent,'');assert.equal(h.node('ex-prepare').disabled,true);assert.equal(h.run('gameplayCsrfToken()'),null);assert.equal(writes(h,'/api/formations/extreme/prepare').length,0);});

test('C215 assembled PAGE refuses wrong account or incomplete preparation contracts',async()=>{for(const mutate of [v=>v.accountId='B',v=>v.requiresAuthorization=false,v=>v.mode='OTHER',v=>delete v.parameters]){const h=await extremeLoaded();await extremeList(h);const task=h.node('ex-prepare').onclick(),result=extremePrepared();mutate(result);h.respond('/api/formations/extreme/prepare',result);await task;assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),{});assert.equal(h.node('gp-formation-authorize').disabled,true);assert.equal(writes(h,'/api/operations/authorize').length,0);}});
const fortUiParameters={cityId:7,itemId:'耐火砖',num:2};
const fortUiSpec={module:'alliance',actionId:'alliance:donateFort:7:synthetic',actionType:'donateFort',parameters:fortUiParameters,costs:[{id:'耐火砖',num:2}]};
function fortUiData({candidateReady=false}={}){return {accountId:'A',module:'alliance',csrfToken:'synthetic-csrf-A',config:{enabled:true,fort:true},status:{running:false,blocked:false},view:{guildId:'10',playerId:'1',cities:[{cityId:7}],fort:{fort:{cityId:7,type:'挖沙船',state:0,process:[]},dailyDonateNum:499,dayKey:'2026-11-11',materials:[{itemId:'耐火砖',required:100,donated:0,owned:20}],candidates:[]},candidates:candidateReady?[candidate(fortUiSpec)]:[],blocked:[],members:[],technologies:[],dailyLimits:{help:null,ask:null,order:null}}};}
async function fortUiBoot(){const h=await boot(),task=h.node('gp-alliance-load').onclick();h.respond('/api/gameplay',fortUiData(),{module:'alliance'});await task;return h;}
const fortSelectors=h=>descendants(h.node('gp-alliance-facts')).filter(e=>e.dataset.allianceSelect);
test('Fort assembled PAGE displays authority and prepares exact material quantity without implicit writes, then uses original authorization',async()=>{
 const h=await fortUiBoot();assert.match(h.node('gp-alliance-facts').textContent,/499/);assert.match(h.node('gp-alliance-facts').textContent,/功勋衰减/);const count=h.requests.length;const input=descendants(h.node('gp-alliance-facts')).find(e=>e.dataset.fortMaterial==='耐火砖');input.value='2';fortSelectors(h).find(e=>JSON.parse(e.dataset.allianceSelect).itemId).click();assert.equal(h.requests.length,count);assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),fortUiParameters);assert.equal(h.node('gp-alliance-plan').disabled,true);
 const survey=h.node('gp-alliance-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'alliance',parameters:fortUiParameters});h.respond('/api/gameplay/survey',fortUiData({candidateReady:true}));await survey;const check=descendants(h.node('gp-alliance-candidates')).find(e=>e.type==='checkbox');check.checked=true;check.onchange();
 const preview=h.node('gp-alliance-plan').onclick();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'alliance',mode:'Manual',selections:[fortUiSpec.actionId],parameters:fortUiParameters});h.respond('/api/operations/plan',plan(fortUiSpec));await preview;assert.equal(h.node('gp-alliance-authorize').disabled,false);h.setConfirm(false);await h.node('gp-alliance-authorize').onclick();assert.equal(writes(h,'/api/operations/authorize').length,0);h.setConfirm(true);const execution=h.node('gp-alliance-authorize').onclick();assertMutation(h.pending('/api/operations/authorize'),'/api/operations/authorize',{batchId:plan(fortUiSpec).batchId,planHash:plan(fortUiSpec).planHash,approvedActionIds:[fortUiSpec.actionId],resourceBudget:fortUiSpec.costs,confirm:true});h.respond('/api/operations/authorize',{accountId:'A',batchId:plan(fortUiSpec).batchId,permitId:'fort-permit'});await tick();assertMutation(h.pending('/api/operations/execute'),'/api/operations/execute',{batchId:plan(fortUiSpec).batchId,permitId:'fort-permit'});h.respond('/api/operations/execute',{status:'EXECUTING'});await execution;assert.match(h.node('gp-alliance-hint').textContent,/结果以复读和执行历史为准/);assert.equal(writes(h,'/api/operations/execute').length,1);
});
test('Fort assembled PAGE rejects invalid quantity and ignores detached controls during pending reads or account changes',async()=>{
 for(const bad of ['0','-1','1.5','2147483648']){const h=await fortUiBoot(),input=descendants(h.node('gp-alliance-facts')).find(e=>e.dataset.fortMaterial);input.value=bad;fortSelectors(h).find(e=>JSON.parse(e.dataset.allianceSelect).itemId).click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});assert.equal(writes(h).length,0);assert.match(h.node('gp-alliance-hint').textContent,/正整数/);}
 const h=await fortUiBoot(),button=fortSelectors(h).find(e=>JSON.parse(e.dataset.allianceSelect).itemId),task=h.node('gp-alliance-survey').onclick();assert.equal(button.disabled,true);button.click();h.run("selectAccount('B');selectAccount('A');");h.respond('/api/gameplay/survey',fortUiData({candidateReady:true}));await task;button.click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});assert.equal(h.node('gp-alliance-facts').textContent,'');assert.equal(h.run('gameplayCsrfToken()'),null);assert.equal(writes(h,'/api/operations/plan').length,0);
});

test('equipment growth assembled PAGE selects explicit refinement mode without a plan and requires a fresh survey',async()=>{
 const spec=cases.find(s=>s.actionType==='REFINE'),h=await loaded(spec);const modes=descendants(h.node('gp-equipment-growth-facts')).filter(e=>e.dataset.equipmentGrowthMode);assert.equal(modes.length,3);const before=h.requests.length;modes.find(e=>e.dataset.equipmentGrowthMode==='refine').click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{action:'refine'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-equipment-growth-plan').disabled,true);assert.equal(h.node('gp-equipment-growth-authorize').disabled,true);const task=h.node('gp-equipment-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'equipment-growth',parameters:{action:'refine'}});assert.equal(modes[0].disabled,true);h.respond('/api/gameplay/survey',data(spec));await task;assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('equipment growth mode selectors cannot reuse stale view after account change or dirty drafts',async()=>{
 const spec=cases.find(s=>s.actionType==='REFINE'),h=await loaded(spec),mode=descendants(h.node('gp-equipment-growth-facts')).find(e=>e.dataset.equipmentGrowthMode==='refine');h.node('gp-equipment-growth-parameters').value=JSON.stringify({heroId:'edited'});h.node('gp-equipment-growth-parameters').oninput();mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{heroId:'edited'});h.run("selectAccount('B');selectAccount('A');");mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});assert.equal(writes(h).length,0);
});

test('hero exclusive assembled PAGE chooses explicit kind and needs a new survey without planning',async()=>{
 const spec=cases.find(s=>s.actionType==='EXCLUSIVE-LEVEL'),h=await loaded(spec),modes=descendants(h.node('gp-heroes-facts')).filter(e=>e.dataset.heroGrowthMode);assert.equal(modes.length,3);const before=h.requests.length;modes.find(e=>e.dataset.heroGrowthMode==='exclusive-level').click();assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{action:'exclusive-level'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-heroes-plan').disabled,true);assert.equal(h.node('gp-heroes-authorize').disabled,true);const task=h.node('gp-heroes-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'heroes',parameters:{action:'exclusive-level'}});assert.equal(modes[0].disabled,true);h.respond('/api/gameplay/survey',data(spec));await task;assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('hero exclusive selector preserves edited draft and cannot survive account replacement',async()=>{
 const spec=cases.find(s=>s.actionType==='EXCLUSIVE-LEVEL'),h=await loaded(spec),mode=descendants(h.node('gp-heroes-facts')).find(e=>e.dataset.heroGrowthMode==='exclusive-level');h.node('gp-heroes-parameters').value=JSON.stringify({heroId:'edited'});h.node('gp-heroes-parameters').oninput();mode.click();assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{heroId:'edited'});h.run("selectAccount('B');selectAccount('A');");mode.click();assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{});assert.equal(writes(h).length,0);
});

test('exclusive STAR selector changes only the draft and invalidates prior approval',async()=>{
 const spec=cases.find(s=>s.actionType==='EXCLUSIVE-STAR'),h=await loaded(spec),modes=descendants(h.node('gp-heroes-facts')).filter(e=>e.dataset.heroGrowthMode);const before=h.requests.length;
 modes.find(e=>e.dataset.heroGrowthMode==='exclusive-star').click();
 assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{action:'exclusive-star'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-heroes-plan').disabled,true);assert.equal(h.node('gp-heroes-authorize').disabled,true);
 const task=h.node('gp-heroes-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'heroes',parameters:{action:'exclusive-star'}});h.respond('/api/gameplay/survey',data(spec));await task;
 for(const route of ['/api/operations/plan','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
});

test('badge growth assembled hero page shows a worn slot, UID and both costs',async()=>{
 const spec=cases.find(row=>row.module==='badge-growth'&&row.actionType==='LEVEL'),h=await loaded(spec),facts=h.node('gp-badge-growth-facts').textContent;
 for(const word of ['已佩戴徽章','测试纹章','9007199254740995','徽章经验','GOLD'])assert.ok(facts.includes(word),word);
 assert.equal(writes(h).length,0);
});

test('empty-slot wear mode only edits the draft and shows the exact free candidate after surveying',async()=>{
 const spec=cases.find(s=>s.module==='equipment-growth'&&s.actionType==='PUT-ON'),h=await loaded(spec),before=h.requests.length;
 assert.match(h.node('gp-equipment-growth-facts').textContent,/空槽穿戴候选.*蓝武器1/);
 h.node('gp-equipment-growth-parameters').value=JSON.stringify({heroId:'A'});
 descendants(h.node('gp-equipment-growth-facts')).find(e=>e.dataset.equipmentGrowthMode==='put-on').click();
 assert.equal(h.requests.length,before);assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{heroId:'A',action:'put-on'});
 assert.equal(h.node('gp-equipment-growth-plan').disabled,true);assert.equal(h.node('gp-equipment-growth-authorize').disabled,true);
 const task=h.node('gp-equipment-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'equipment-growth',parameters:{heroId:'A',action:'put-on'}});
 h.respond('/api/gameplay/survey',data(spec));await task;assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('badge empty-slot picker changes only the draft and requires a fresh exact-slot survey',async()=>{
 const level=cases.find(row=>row.module==='badge-growth'&&row.actionType==='LEVEL');
 const wear=cases.find(row=>row.module==='badge-growth'&&row.actionType==='PUT-ON');
 const h=await loaded(level),box=h.node('gp-badge-growth-facts'),before=h.requests.length;
 const params=h.node('gp-badge-growth-parameters');
 params.value=JSON.stringify(level.parameters);
 descendants(box).find(node=>node.dataset.badgeGrowthMode==='put-on').click();
 assert.deepEqual(JSON.parse(params.value),{action:'put-on'});
 assert.equal(h.requests.length,before);
 const survey=h.node('gp-badge-growth-survey');
 const overview=survey.onclick();
 assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'badge-growth',parameters:{action:'put-on'}});
 h.respond('/api/gameplay/survey',{...data(wear),view:{...wear.facts,candidates:[]}});
 await overview;
 assert.equal(h.node('gp-badge-growth-plan').disabled,true);
 const button=descendants(box).find(node=>node.dataset.badgeEmptySlot==='2');
 assert.match(button.textContent,/A.*2 号空槽/);button.click();
 assert.deepEqual(JSON.parse(params.value),{action:'put-on',heroId:'A',pos:2});
 assert.equal(writes(h).length,1);
 assert.equal(h.node('gp-badge-growth-authorize').disabled,true);
 const exact=survey.onclick();
 assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'badge-growth',parameters:{action:'put-on',heroId:'A',pos:2}});
 h.respond('/api/gameplay/survey',data(wear));await exact;
 for(const word of ['空槽徽章候选','闲置纹章','9007199254740997','无资源消耗'])assert.ok(box.textContent.includes(word),word);
 assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('Museum shows physical material shortages and unknown inventory with writes disabled',async()=>{
 const h=await boot(),response={accountId:'A',module:'museum',csrfToken:'synthetic-csrf-A',config:{enabled:false},status:{running:false,blocked:false},
  view:{candidates:[],blocked:[],explorationMaterials:{factor:2,reason:null,stages:[
   {stageId:7,status:'SHORTAGE',reason:null,materials:[{id:'测试材料',required:20,have:3,missing:17,reserve:2,missingWithReserve:19}]},
   {stageId:8,status:'UNKNOWN',reason:'INVENTORY_UNKNOWN',materials:[{id:'未知材料',required:8,have:null,missing:null,reserve:2,missingWithReserve:null}]},
   {stageId:9,status:'NOT_APPLICABLE',reason:'EXPEDITION_ALREADY_STARTED',materials:[]},
  ]}}};
 const task=h.node('gp-museum-load').onclick();h.respond('/api/gameplay',response,{module:'museum'});await task;
 const box=h.node('gp-museum-facts'),rows=descendants(box).filter(node=>node.tagName.toLowerCase()==='tr').map(row=>row.children.map(cell=>cell.textContent));
 assert.ok(rows.some(row=>JSON.stringify(row)===JSON.stringify(['7','测试材料','20','3','17','2','19','材料不足'])));
 assert.ok(rows.some(row=>JSON.stringify(row)===JSON.stringify(['8','未知材料','8','未知','未知','2','未知','持有量未知'])));
 assert.ok(rows.some(row=>row[0]==='9'&&row[7]==='本次远征已开始'));assert.match(box.textContent,/材料倍率：2/);
 assert.equal(h.node('gp-museum-plan').disabled,true);assert.equal(h.node('gp-museum-authorize').disabled,true);assert.equal(writes(h).length,0);
});

const antiqueResult = (accountId='A',view={status:'AVAILABLE',reason:null,global:[{attr:1,name:'生命',value:0,viewType:'数值'}],camps:[{id:'阵营A',name:'兄弟会',attributes:[{attr:1,name:'生命',value:3.5,viewType:'数值'}]}],professions:[{id:'射手',name:'射手',attributes:[{attr:1,name:'生命',value:4.75,viewType:'数值'}]}],effects:[{effectId:'测试效果',description:'生产速度',value:0.125,viewType:'百分比'}]}) => ({accountId,view,readOnly:true,source:'AntiqueAttrSummaryResponse',surveyedAt:new Date().toISOString()});
async function antiquePage(){
 const h=await boot(),task=h.node('gp-museum-load').onclick();
 h.respond('/api/gameplay',{accountId:'A',module:'museum',csrfToken:'synthetic-csrf-A',config:{enabled:false},status:{running:false,blocked:false},view:{candidates:[]}},{module:'museum'});
 await task;return h;
}
test('Antique attribute summary is an explicit account-scoped read with separate scope/value/unit columns',async()=>{
 const h=await antiquePage(),button=h.node('antique-summary-read'),before=h.requests.length;
 assert.equal(button.disabled,false);assert.equal(writes(h).length,0);
 const task=button.onclick();
 assert.equal(button.disabled,true);
 assertMutation(h.pending('/api/antiques/summary'),'/api/antiques/summary',{});
 assert.equal(h.requests.length,before+1);
 h.respond('/api/antiques/summary',antiqueResult());await task;
 const box=h.node('antique-summary-view'),rows=descendants(box).filter(node=>node.tagName.toLowerCase()==='tr').map(node=>node.children.map(cell=>cell.textContent));
 for(const row of [['全局','生命','0','数值'],['阵营 · 兄弟会','生命','3.5','数值'],['职业 · 射手','生命','4.75','数值'],['生产速度','0.125','百分比']])assert.ok(rows.some(actual=>JSON.stringify(actual)===JSON.stringify(row)),JSON.stringify(row));
 assert.equal(h.node('gp-museum-plan').disabled,true);assert.equal(h.node('gp-museum-authorize').disabled,true);
 assert.equal(writes(h,'/api/operations/execute').length,0);
 assert.equal(button.disabled,false);
});
test('Antique page distinguishes an empty known summary from unknown and erases stale values during a new read',async()=>{
 const h=await antiquePage(),button=h.node('antique-summary-read'),view=h.node('antique-summary-view');
 for(const [data,expected] of [[antiqueResult(),/生产速度/],[antiqueResult('A',{status:'UNKNOWN',reason:'READ_FAILED'}),/无法确认/],[antiqueResult('A',{status:'AVAILABLE',global:[],camps:[],professions:[],effects:[]}),/没有属性或特殊效果/]]){
  const task=button.onclick();assert.equal(view.textContent,'');h.respond('/api/antiques/summary',data);await task;assert.match(view.textContent,expected);
 }
 assert.equal(writes(h,'/api/operations/authorize').length,0);
});
test('Antique summary ignores a detached result after account selection and rejects a foreign account response',async()=>{
 const h=await antiquePage(),button=h.node('antique-summary-read'),task=button.onclick();
 h.run("current='B';viewGuard.select('B');resetGameplay();");h.respond('/api/antiques/summary',antiqueResult());await task;
 assert.equal(h.node('antique-summary-view').textContent,'');
 assert.equal(button.disabled,true);
 h.run("current='A';viewGuard.select('A');resetGameplay();");
 const loading=h.node('gp-museum-load').onclick();h.respond('/api/gameplay',{accountId:'A',module:'museum',csrfToken:'synthetic-csrf-A',config:{enabled:false},status:{},view:{candidates:[]}},{module:'museum'});await loading;
 const foreign=button.onclick();h.respond('/api/antiques/summary',antiqueResult('B'));await foreign;
 assert.equal(h.node('antique-summary-view').textContent,'');assert.match(h.node('antique-summary-hint').textContent,/响应.*不匹配|账号/);
});

test('antique modes and collection selector edit only the draft and demand fresh evidence',async()=>{
 const spec=cases.find(row=>row.module==='antique-growth'&&row.actionType==='ACTIVATE'),h=await loaded(spec),box=h.node('gp-antique-growth-facts'),before=h.requests.length;
 assert.match(box.textContent,/藏品与自有碎片.*测试藏品.*未激活/);
 h.node('gp-antique-growth-parameters').value=JSON.stringify({antiqueId:'测试藏品',action:'activate'});
 const button=descendants(box).find(row=>row.dataset.antiqueMode==='star');button.click();
 assert.deepEqual(JSON.parse(h.node('gp-antique-growth-parameters').value),{antiqueId:'测试藏品',action:'star'});
 assert.equal(h.requests.length,before);assert.equal(h.node('gp-antique-growth-plan').disabled,true);assert.equal(h.node('gp-antique-growth-authorize').disabled,true);
 const task=h.node('gp-antique-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'antique-growth',parameters:{antiqueId:'测试藏品',action:'star'}});
 const star=cases.find(row=>row.module==='antique-growth'&&row.actionType==='STAR');h.respond('/api/gameplay/survey',data(star));await task;
 const select=descendants(box).find(row=>row.dataset.antiqueChoice);select.value='测试藏品';select.onchange();
 assert.deepEqual(JSON.parse(h.node('gp-antique-growth-parameters').value),{antiqueId:'测试藏品',action:'star'});
 assert.equal(writes(h,'/api/operations/execute').length,0);
 assert.equal(h.node('gp-antique-growth-plan').disabled,true);
});

test('Antique advanced selectors keep exact mode fields, require a fresh survey and never dispatch from a draft',async()=>{
 for(const mode of ['suit','master','exchange']){
  const spec=cases.find(row=>row.module==='antique-growth'&&row.actionType==='EXCHANGE'),h=await loaded(spec),box=h.node('gp-antique-growth-facts');
  const before=h.requests.length;
  h.node('gp-antique-growth-parameters').value=JSON.stringify({action:'exchange',antiqueId:'测试藏品',num:9,suitId:1001});
  descendants(box).find(row=>row.dataset.antiqueMode===mode).click();
  assert.deepEqual(JSON.parse(h.node('gp-antique-growth-parameters').value),mode==='suit'?{action:'suit',suitId:1001}:mode==='master'?{action:'master'}:{action:'exchange',antiqueId:'测试藏品'});
  assert.equal(h.requests.length,before);assert.equal(h.node('gp-antique-growth-plan').disabled,true);assert.equal(h.node('gp-antique-growth-authorize').disabled,true);
 }
 const suit=cases.find(row=>row.module==='antique-growth'&&row.actionType==='SUIT'),h=await loaded(suit),box=h.node('gp-antique-growth-facts');
 const select=descendants(box).find(row=>row.dataset.antiqueSuitChoice);select.value='1001';select.onchange();
 assert.deepEqual(JSON.parse(h.node('gp-antique-growth-parameters').value),{action:'suit',suitId:1001});
 assert.equal(writes(h,'/api/operations/execute').length,0);
 const exchange=cases.find(row=>row.module==='antique-growth'&&row.actionType==='EXCHANGE'),e=await loaded(exchange),eBox=e.node('gp-antique-growth-facts');
 e.node('gp-antique-growth-parameters').value=JSON.stringify({action:'exchange',antiqueId:'测试藏品'});
 const num=descendants(eBox).find(row=>row.dataset.antiqueExchangeQuantity),apply=descendants(eBox).find(row=>row.dataset.antiqueExchangePrepare);
 num.value='0';apply.click();assert.match(e.node('gp-antique-growth-hint').textContent,/正整数/);
 num.value='7';apply.click();assert.deepEqual(JSON.parse(e.node('gp-antique-growth-parameters').value),exchange.parameters);
 assert.equal(writes(e,'/api/operations/execute').length,0);assert.equal(e.node('gp-antique-growth-plan').disabled,true);
 // A detached input and button from a previous account cannot replace a new draft.
 e.run("selectAccount('B');");num.value='8';apply.click();
 assert.notDeepEqual(JSON.parse(e.node('gp-antique-growth-parameters').value||'{}'),{action:'exchange',antiqueId:'测试藏品',num:8});
});

test('sweep target draft requires explicit lower-level confirmation and fresh survey',async()=>{
 const h=await loaded(pirateCase),facts=h.node('gp-pirate-sweep-facts');
 assert.match(facts.textContent,/海面扫荡额度.*2026-11-12.*基础 10 · VIP 1 · 月卡 2/);
 assert.match(facts.textContent,/需要首杀/);
 const rows=descendants(facts),lower=rows.find(node=>node.tagName==='input'&&node.type==='checkbox'),pick=rows.find(node=>node.textContent==='选择 UID 17（城市 9）');
 assert.ok(lower&&pick);assert.ok(!rows.some(node=>node.textContent==='选择 UID 18（城市 9）'));
 const before=h.requests.length,initial=h.node('gp-pirate-sweep-parameters').value;
 pick.click();assert.match(h.node('gp-pirate-sweep-hint').textContent,/明确扫荡此低等级/);
 assert.equal(h.node('gp-pirate-sweep-parameters').value,initial);
 lower.checked=true;pick.click();assert.equal(lower.checked,false);
 assert.deepEqual(JSON.parse(h.node('gp-pirate-sweep-parameters').value),pirateCase.parameters);
 assert.equal(h.requests.length,before);
 assert.equal(h.node('gp-pirate-sweep-plan').disabled,true);assert.equal(h.node('gp-pirate-sweep-authorize').disabled,true);
 const scan=h.node('gp-pirate-sweep-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'pirate-sweep',parameters:pirateCase.parameters});
 h.respond('/api/gameplay/survey',data(pirateCase));await scan;
 h.run("selectAccount('B');");lower.checked=true;pick.click();
 assert.notDeepEqual(JSON.parse(h.node('gp-pirate-sweep-parameters').value||'{}'),pirateCase.parameters);
 assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('daily pirate objective links to the same controlled sweep tab without planning or writing',async()=>{
 const h=await boot(),before=h.requests.length;
 h.run("renderDailies({tasks:[{task:{id:1010,title:'累计击败野怪',progress:0,targetProgress:1},status:'blocked',functionId:'pirate-sweep'}],text:'只读',ruby:0})");
 const link=descendants(h.node('dailies-table')).find(node=>node.textContent==='打开海面扫荡');
 assert.ok(link);
 h.run("document.querySelector=selector=>({click:()=>{if(selector!=='#tabs button[data-tab=\"pirate-sweep\"]')throw Error('wrong tab');globalThis.openedSweep=true;}});");
 link.click();assert.equal(h.run('globalThis.openedSweep'),true);assert.equal(h.requests.length,before);
 h.run("globalThis.openedSweep=false;selectAccount('B');");link.click();assert.equal(h.run('globalThis.openedSweep'),false);
 assert.equal(writes(h,'/api/operations/execute').length,0);
});


test('registered mail page controls survey exact pages, never authorize and ignore late account responses',async()=>{
  const h=await boot();
  const data=(pageNo,subject='合成邮件')=>({accountId:'A',module:'mail',csrfToken:'synthetic-mail-csrf',config:{enabled:false},status:{running:false,blocked:false},functions:[],view:{page:{pageNo,pageCount:1,totalReported:37,emails:[{emailId:'9007199254740995',subject,read:false,got:null,eligibility:null}],scope:'CURRENT_PAGE_ONLY',allPagesComplete:false},candidates:[]}});
  const load=h.node('gp-mail-load').onclick();h.respond('/api/gameplay',data(0),{module:'mail'});await load;
  assert.match(h.node('gp-mail-facts').textContent,/9007199254740995.*合成邮件.*未读.*未知/);assert.match(h.node('gp-mail-facts').textContent,/只代表本页观察/);
  const pageButton=offset=>descendants(h.node('gp-mail-facts')).find(n=>n.dataset.mailPage===offset);
  assert.equal(pageButton('-1').disabled,true);assert.equal(h.node('gp-mail-plan').disabled,true);assert.equal(h.node('gp-mail-authorize').disabled,true);
  const next=pageButton('1').click();const request=h.pending('/api/gameplay/survey');assert.deepEqual(JSON.parse(request.options.body),{module:'mail',parameters:{pageNo:1}});
  h.respond('/api/gameplay/survey',data(1));await next;assert.equal(pageButton('-1').disabled,false);
  const prev=pageButton('-1').click();assert.deepEqual(JSON.parse(h.pending('/api/gameplay/survey').options.body).parameters,{pageNo:0});h.respond('/api/gameplay/survey',data(0));await prev;
  const input=descendants(h.node('gp-mail-facts')).find(n=>n.id==='gp-mail-pageNo');input.value='7';const selected=pageButton('selected').click();assert.deepEqual(JSON.parse(h.pending('/api/gameplay/survey').options.body).parameters,{pageNo:7});h.respond('/api/gameplay/survey',data(7));await selected;
  const oldButton=pageButton('1'),late=oldButton.click();h.run("selectAccount('B')");h.respond('/api/gameplay/survey',data(8,'late-A'));await late;assert.doesNotMatch(h.node('gp-mail-facts').textContent,/late-A/);
  const count=h.requests.length;await oldButton.click();assert.equal(h.requests.length,count);
  assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);
});


test('AFK reward page shows exact sparse target and requires a fresh explicit survey after parameters change',async()=>{
 const spec=cases.find(row=>row.module==='afk-level-rewards'),h=await loaded(spec);
 assert.match(h.node('gp-afk-level-rewards-facts').textContent,/挂机等级与奖励.*5.*0.*2.*抽卡券 × 2/);
 const input=h.node('gp-afk-level-rewards-parameters');input.value=JSON.stringify({level:5});input.oninput();assert.equal(h.node('gp-afk-level-rewards-plan').disabled,true);assert.equal(h.node('gp-afk-level-rewards-authorize').disabled,true);
 const before=h.requests.length,task=h.node('gp-afk-level-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'afk-level-rewards',parameters:{level:5}});h.run("selectAccount('B');");h.respond('/api/gameplay/survey',data({...spec,facts:{afk:{level:999,rewardedLevel:0}}}));await task;assert.doesNotMatch(h.node('gp-afk-level-rewards-facts').textContent,/999/);assert.equal(h.requests.length,before+1);assert.equal(writes(h,'/api/operations/execute').length,0);
});
