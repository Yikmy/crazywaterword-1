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
  return { module: spec.module, actionId: spec.actionId, actionType: spec.actionType, label: 'Synthetic ' + spec.actionType, executable: true, parameters: spec.parameters, target: spec.module==='heroes'?{heroId:spec.parameters.heroId}:['equipment-growth','badge-growth'].includes(spec.module)?{heroId:spec.parameters.heroId,uid:spec.parameters.uid,...(spec.module==='badge-growth'?{pos:spec.parameters.pos??1}:spec.actionType==='PUT-ON'?{type:'武器'}:{})}:spec.module==='formation-unlock'?{presetId:spec.parameters.presetId}:{buildingId:spec.parameters.buildingId}, costs: spec.costs, costSource: 'synthetic offline proof', beforeState: spec.beforeState??{ state: 'IDLE' }, expectedState: { state: 'CHANGED' } };
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
  const testLabel=spec.module+':'+spec.actionType;
  test(testLabel + ': assembled PAGE reaches exact Manual preview, authorize and execute once through actual account/CSRF caller', async () => {
    const h = await loaded(spec); await preview(h, spec);
    assert.equal(Object.hasOwn(data(spec).view.candidates[0], 'action'), false, 'fixture matches cropped public candidates');
    const ids = [...PAGE.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    for (const id of ['gp-' + spec.module + '-section', 'gp-' + spec.module + '-plan']) assert.equal(ids.filter((value) => value === id).length, 1);
    h.setConfirm(false); await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
    h.setConfirm(true); const running = h.node('gp-' + spec.module + '-authorize').onclick(), expected = plan(spec);
    assertMutation(h.pending('/api/operations/authorize'), '/api/operations/authorize', { batchId: expected.batchId, planHash: expected.planHash, approvedActionIds: [spec.actionId], resourceBudget: spec.costs, confirm: true });
    assert.ok(h.confirmations.at(-1).includes('账号 A')); assert.ok(h.confirmations.at(-1).includes(expected.batchId)); assert.ok(h.confirmations.at(-1).includes(expected.planHash)); assert.ok(h.confirmations.at(-1).includes(spec.costs[0]?.id??'无资源消耗'));
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
