import { fleetView } from '../src/fleet.mjs';
import { RUN_BUDGET_LIMITS, normalizeBudgetClaims } from '../src/resource-ledger.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { WORKFLOW_CONDITION_FIELDS, validateWorkflow, evaluateWorkflowCondition } from '../src/workflow.mjs';
import { compileUnifiedExecution } from '../src/loop.mjs';
import { dailyChecklist } from '../src/daily-checklist.mjs';
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
  {module:'task-rewards',actionId:'task-rewards:daily-gift:synthetic',actionType:'CLAIM',parameters:{kind:'daily-gift',packId:'赠礼'},costs:[],facts:{daily:{heroId:'马斯克',resetMarker:1,boughtPack:[],drawnPack:[]}},blockedReason:'DAILY_GIFT_ALREADY_CLAIMED'},
  {module:'material-packs',actionId:'material-packs:synthetic-exact',actionType:'EXCHANGE',parameters:{packId:'原料自选包',itemId:'木材',num:2},target:{packId:'原料自选包',itemId:'木材'},costs:[{id:'原料自选包',num:2}],facts:{season:1,packs:[{packId:'原料自选包',have:5,targets:[{itemId:'木材',perPack:1,requiredSeason:1,have:0}]}]},blockedReason:'MATERIAL_PACK_SHORTAGE'},
  { module:'mail',actionId:'mail:READ:synthetic-exact',actionType:'READ',parameters:{pageNo:2,action:'read',emailId:'9007199254740995'},target:{pageNo:2,emailId:'9007199254740995',attachmentFingerprint:'synthetic-empty'},costs:[],facts:{page:{pageNo:2,pageCount:1,totalReported:37,emails:[{emailId:'9007199254740995',subject:'synthetic empty',read:false,got:false,attachment:{hasAttachment:false},eligibility:false}],allPagesComplete:false}},blockedReason:'MAIL_ATTACHMENT_OR_AUTHORITY_UNKNOWN' },
  { module:'mail',actionId:'mail:CLAIM:synthetic-exact',actionType:'CLAIM',parameters:{pageNo:2,action:'claim',emailId:'9007199254740995'},target:{pageNo:2,emailId:'9007199254740995',attachmentFingerprint:'synthetic-fingerprint'},costs:[],facts:{page:{pageNo:2,pageCount:1,totalReported:37,emails:[{emailId:'9007199254740995',subject:'synthetic',read:false,got:false,attachment:{hasAttachment:true},eligibility:false}],allPagesComplete:false}},blockedReason:'MAIL_ATTACHMENT_OR_AUTHORITY_UNKNOWN' },
  { module:'pet',actionId:'pet:FEED:synthetic-exact',actionType:'FEED',parameters:{action:'feed',buildingId:'1宠物培育室',jobIdx:0},costs:[{id:'鱼肠线',num:12},{id:'粗铁',num:4}],facts:{secondsReduced:14400,rooms:[{buildingId:'1宠物培育室',level:1,queue:{breedQ:[{idx:0,petId:'蓝宠物1',startTime:900,finishTime:20000,star:0,feedRequirements:[{type:0,id:'鱼肠线',num:12},{type:0,id:'粗铁',num:4}]}],maturePets:[],maxQLength:2}}]},blockedReason:'PET_JOB_IDX_AMBIGUOUS' },
  {module:'trial-challenge',actionId:'trial-challenge:1:1001:synthetic',actionType:'CHALLENGE',parameters:{},costs:[],facts:{raid:{raidId:1,passedStage:0,sweepTimes:0,buySweepTimes:0}},blockedReason:'TRIAL_CHALLENGE_LEVEL_LOCKED'},
  {module:'free-recruit',actionId:'free-recruit:0:synthetic',actionType:'CLAIM',parameters:{},costs:[],facts:{recruit:{hero:{freeEndTimeSeconds:0,recruitTimes:1}},broadcast:{level:1}},blockedReason:'FREE_RECRUIT_COOLDOWN'},
  {module:'free-gold',actionId:'free-gold:2000:1:synthetic',actionType:'CLAIM',parameters:{},costs:[],facts:{gold:{freeTimes:0,paidTimes:0,resetTime:2000,minGold:7500,maxPaidTimes:10}},blockedReason:'FREE_GOLD_EXHAUSTED'},
  {module:'afk-level-rewards',actionId:'afk-level-rewards:2:synthetic-exact',actionType:'CLAIM',parameters:{level:2},costs:[],facts:{afk:{level:5,rewardedLevel:0}},blockedReason:'AFK_LEVEL_TOO_LOW'},
  {module:'task-rewards',actionId:'task-rewards:daily-activity:2000:2:synthetic',actionType:'CLAIM',parameters:{kind:'daily-activity',tierId:2},costs:[],facts:{daily:{resetTime:2000,dailyActivity:40,weeklyActivity:85}},blockedReason:'ACTIVITY_INCOMPLETE'},
  ...['main','branch','achievement','daily'].map(kind=>({module:'task-rewards',actionId:'task-rewards:'+kind+':synthetic-exact',actionType:'CLAIM',parameters:{kind,taskId:kind==='achievement'?1001:kind==='main'?1:8001},costs:[],facts:{},blockedReason:'TASK_INCOMPLETE'})),
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
  { module:'heroes',actionId:'heroes:FRAGMENT-EXCHANGE:synthetic-exact',actionType:'FRAGMENT-EXCHANGE',parameters:{heroId:'A',action:'fragment-exchange',num:7},costs:[{id:'蓝卡万能碎片',num:7}],facts:{heroes:[{heroId:'A',level:1,star:1,power:'9007199254740993',skillLevels:[1,1]}],fragments:[{heroId:'A',sourceId:'蓝卡万能碎片',sourceNum:20,targetId:'A碎片',targetNum:10}]},blockedReason:'HERO_FRAGMENT_STOCK_INSUFFICIENT' },
  { module:'heroes',actionId:'heroes:EXCLUSIVE-LEVEL:synthetic-exact',actionType:'EXCLUSIVE-LEVEL',parameters:{heroId:'A',action:'exclusive-level'},costs:[{id:'初级专武材料',num:20}],facts:{heroes:[{heroId:'A',level:1,star:15,power:'9007199254740993',skillLevels:[1,1],exclusive:{level:1,star:0}}]},blockedReason:'EXCLUSIVE_ACTIVE_OWN_STATE_REQUIRED' },
  { module:'heroes',actionId:'heroes:EXCLUSIVE-STAR:synthetic-exact',actionType:'EXCLUSIVE-STAR',parameters:{heroId:'A',action:'exclusive-star'},costs:[{id:'A碎片',num:60},{id:'橙专武升星石',num:5}],facts:{heroes:[{heroId:'A',level:1,star:25,power:'9007199254740993',skillLevels:[1,1],exclusive:{level:1,star:0}}]},blockedReason:'EXCLUSIVE_ACTIVE_OWN_STATE_REQUIRED' },

  { module:'equipment-growth',actionId:'equipment-growth:STAR:synthetic-exact',actionType:'STAR',parameters:{heroId:'A',uid:'9007199254740994',action:'star'},costs:[{id:'装备升星石',num:1},{id:'精铁',num:100000}],facts:{heroes:[{heroId:'A',equips:[{uid:'9007199254740994',equipId:'红武器1',level:5,star:0,refineLv:0}]}]},blockedReason:'STAR_MATERIAL_STOCK_INSUFFICIENT' },
  { module:'equipment-growth',actionId:'equipment-growth:REFINE:synthetic-exact',actionType:'REFINE',parameters:{heroId:'A',uid:'9007199254740994',action:'refine'},costs:[{id:'精铁',num:90500},{id:'精炼石',num:100}],facts:{heroes:[{heroId:'A',equips:[{uid:'9007199254740994',equipId:'红武器1',level:1,star:0,refineLv:0}]}]},blockedReason:'EXACT_RED_WORN_EQUIPMENT_REQUIRED' },
  { module:'equipment-growth',actionId:'equipment-growth:LEVEL:synthetic-exact',actionType:'LEVEL',parameters:{heroId:'A',uid:'9007199254740994'},costs:[{id:'精铁',num:4}],facts:{heroes:[{heroId:'A',equips:[{uid:'9007199254740994',equipId:'蓝武器1',level:1,star:0,refineLv:0}]}]},blockedReason:'TARGET_HERO_DERIVED_STATE_UNKNOWN' },
  { module:'equipment-growth',actionId:'equipment-growth:PUT-ON:synthetic-exact',actionType:'PUT-ON',parameters:{heroId:'A',uid:'9007199254740994',action:'put-on'},costs:[],beforeState:{equipment:{equipId:'蓝武器1',level:1,star:0,refineLv:0}},facts:{heroes:[{heroId:'A',equips:[]}]},blockedReason:'EQUIPMENT_TARGET_SLOT_NOT_EMPTY' },
  { module:'badge-growth',actionId:'badge-growth:PUT-ON:synthetic-exact',actionType:'PUT-ON',parameters:{action:'put-on',heroId:'A',pos:2,uid:'9007199254740997'},costs:[],beforeState:{badge:{badgeId:'闲置纹章',level:1,exp:0}},facts:{mode:'put-on',heroes:[{heroId:'A',level:70,badges:[],emptySlots:[1,2]}]},blockedReason:'BADGE_TARGET_SLOT_NOT_EMPTY' },
  { module:'badge-growth',actionId:'badge-growth:STAR:synthetic-exact',actionType:'STAR',parameters:{heroId:'A',uid:'9007199254740995',action:'star'},costs:[{id:'徽章升星石',num:1},{id:'GOLD',num:500000}],beforeState:{badge:{badgeId:'红法师徽章',level:1,star:0,exp:2}},facts:{mode:'star'},blockedReason:'BADGE_STAR_STOCK_INSUFFICIENT' },
  { module:'badge-growth',actionId:'badge-growth:LEVEL:synthetic-exact',actionType:'LEVEL',parameters:{heroId:'A',uid:'9007199254740995'},costs:[{id:'徽章经验',num:5},{id:'GOLD',num:100}],beforeState:{badge:{badgeId:'测试纹章',level:1,exp:0}},facts:{},blockedReason:'BADGE_PARTIAL_XP_OUTSIDE_SCOPE' },
  { module: 'formation-unlock', actionId: 'formation-unlock:UNLOCK:2:synthetic-exact', actionType: 'UNLOCK', parameters: {presetId:2}, costs:[{id:'阵型2图纸',num:1}], facts:{templates:[{presetId:2,name:'普通图纸模板',costs:[{id:'阵型2图纸',num:1}]}],unlockedPresetIds:[1]}, blockedReason:'OWNED_BLUEPRINT_REQUIRED' },
  { module: 'farm', actionId: 'farm:HARVEST:synthetic-exact', actionType: 'HARVEST', parameters: {buildingId:'1农田',action:'harvest'}, target:{buildingId:'1农田',productId:'小麦'}, beforeState:{buildingId:'1农田',farm:{productId:'小麦',plantTime:1700000000,ripeTime:1700001800}}, costs:[], facts:{plots:[{buildingId:'1农田',state:'GROWING_OR_RIPE_UNVERIFIED',productId:'小麦',plantTime:1700000000,ripeTime:1700001800}],autoFarming:false,crops:[{productId:'小麦',costs:[{id:'小麦种子',num:1}],reliable:true}]}, blockedReason:'FARM_TRUSTED_CLOCK_OR_CONNECTION_UNKNOWN' },
  { module: 'farm', actionId: 'farm:PLANT:synthetic-exact', actionType: 'PLANT', parameters: { buildingId: '1农田', action: 'plant', productId: '小麦' }, costs: [{ id: '小麦种子', num: 1 }], facts: { plots: [{ buildingId: '1农田', state: 'EMPTY', productId: '', plantTime: 0, ripeTime: 0 }], autoFarming: false, crops: [{ productId: '小麦', costs: [{ id: '小麦种子', num: 1 }], reliable: true }] }, blockedReason: 'FARM_TRUSTED_CLOCK_OR_CONNECTION_UNKNOWN' },
  { module: 'equipment-forge', actionId: 'equipment-forge:MAKE:synthetic-exact', actionType: 'MAKE', parameters: { buildingId: '1装备厂', action: 'make', makeId: 1001, allowUniversal: false }, costs: [{ id: '材料', num: 4 }], facts: { forges: [{ buildingId: '1装备厂', level: 1, queue: { state: 'IDLE' } }], recipes: [{ makeId: 1001, type: '武器', season: 1, costs: [{ id: '材料', num: 4 }], equipIds: ['蓝武器1'] }], bag: [{ uid: '9007199254740993', equipId: '蓝武器1', level: 0, star: 2, refineLv: 0 }] }, blockedReason: 'QUEUE_IDLE_BLOCKED_EVIDENCE' },
];
function candidate(spec) {
  return { module: spec.module, actionId: spec.actionId, actionType: spec.actionType, label: 'Synthetic ' + spec.actionType, executable: true, parameters: spec.parameters, rewards:spec.module==='task-rewards'?[{id:'EXP',num:5}]:spec.module==='afk-level-rewards'?[{id:'抽卡券',num:2}]:undefined,progress:15,requiredProgress:15,target: spec.target??(spec.module==='pet'?{buildingId:spec.parameters.buildingId,jobIdx:0,petId:'蓝宠物1',startTime:900,finishTime:20000,star:0}:spec.module==='trial-challenge'?{raidId:1,stageId:1001,passedStage:0}:spec.module==='free-recruit'?{freeEndTimeSeconds:0,way:1}:spec.module==='free-gold'?{resetTime:2000,usedBefore:0}:['task-rewards','afk-level-rewards'].includes(spec.module)?spec.parameters:spec.module==='pirate-sweep'?pirateTarget:spec.module==='antique-growth'?(spec.actionType==='SUIT'?{suitId:spec.parameters.suitId}:spec.actionType==='MASTER'?{kind:'ANTIQUE_MASTERY'}:{antiqueId:spec.parameters.antiqueId}):spec.module==='heroes'?{heroId:spec.parameters.heroId}:['equipment-growth','badge-growth'].includes(spec.module)?{heroId:spec.parameters.heroId,uid:spec.parameters.uid,...(spec.module==='badge-growth'?{pos:spec.parameters.pos??1}:spec.actionType==='PUT-ON'?{type:'武器'}:{})}:spec.module==='formation-unlock'?{presetId:spec.parameters.presetId}:{buildingId:spec.parameters.buildingId}), costs: spec.costs, costSource: 'synthetic offline proof', beforeState: spec.beforeState??{ state: 'IDLE' }, expectedState: { state: 'CHANGED' } };
}
function data(spec, { disabled = false } = {}) {
  return { accountId: 'A', module: spec.module, csrfToken: 'synthetic-csrf-A', config: { enabled: !disabled }, status: { running: false, blocked: false }, functions: ['survey', 'plan'], view: { ...spec.facts, candidates: disabled ? [] : [candidate(spec), { ...candidate(spec), actionId: spec.actionId + ':blocked', executable: false, blockedReason: spec.blockedReason }] } };
}
function plan(spec) {
  return { accountId: 'A', module: spec.module, batchId: 'batch-' + spec.module, planHash: 'hash-' + spec.module, mode: 'Manual', actions: [candidate(spec)], resourceBudget: spec.costs, ...(spec.module==='farm'&&spec.actionType==='HARVEST'?{budgetClaims:{resources:[],quotas:[],uids:[{type:'farm-harvest',id:'synthetic-crop-batch'}]}}:{}), ...(spec.module==='mail'?{budgetClaims:{resources:[],quotas:[],uids:[{type:'mail',id:spec.parameters.emailId}]}}:{}), ...(spec.module==='pet'?{budgetClaims:{resources:spec.costs,quotas:[],uids:[{type:'pet-job',id:'1宠物培育室:0:900'}]}}:{}), ...(spec.module==='trial-challenge'?{budgetClaims:{resources:[],quotas:[{id:'trial-challenge:first-clear:1:1001',num:1}],uids:[{type:'trial-challenge',id:'1:1001'}]}}:{}), ...(spec.module==='free-recruit'?{budgetClaims:{resources:[],quotas:[{id:'free-recruit:cooldown:0',num:1}],uids:[{type:'free-recruit',id:'0'}]}}:{}), ...(spec.module==='free-gold'?{budgetClaims:{resources:[],quotas:[{id:'free-gold:reset:2000',num:1}],uids:[{type:'free-gold',id:'2000:1'}]}}:{}), ...(spec.module==='pirate-sweep'?{budgetClaims:{resources:[],quotas:[{id:'pirate-sweep:'+pirateDay,num:1}],uids:[{type:'pirate',id:'17'}]}}:{}), expiresAt: Date.now() + 60000 };
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
    for (const id of [['pirate-sweep','mail'].includes(spec.module)?'tab-'+spec.module:'gp-' + spec.module + '-section', 'gp-' + spec.module + '-plan']) assert.equal(ids.filter((value) => value === id).length, 1);
    if(spec.module==='pirate-sweep')assert.match(h.node('gp-pirate-sweep-plan-view').textContent,/额度占用：海面扫荡 2026-11-12 ×1/);
    h.setConfirm(false); await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.equal(writes(h, '/api/operations/authorize').length, 0); assert.equal(writes(h, '/api/operations/execute').length, 0);
    h.setConfirm(true); const running = h.node('gp-' + spec.module + '-authorize').onclick(), expected = plan(spec);
    assertMutation(h.pending('/api/operations/authorize'), '/api/operations/authorize', { batchId: expected.batchId, planHash: expected.planHash, approvedActionIds: [spec.actionId], resourceBudget: spec.costs, confirm: true });
    assert.ok(h.confirmations.at(-1).includes('账号 A')); assert.ok(h.confirmations.at(-1).includes(expected.batchId)); assert.ok(h.confirmations.at(-1).includes(expected.planHash)); assert.ok(h.confirmations.at(-1).includes(spec.costs[0]?.id??'无资源消耗'));
    if(spec.module==='mail'){assert.match(h.confirmations.at(-1),/9007199254740995/);assert.match(h.confirmations.at(-1),/"pageNo": 2/);assert.match(h.node('gp-mail-facts').textContent,/实例附件继续冻结/);}
    if(spec.module==='farm'&&spec.actionType==='HARVEST'){assert.match(h.node('gp-farm-facts').textContent,/成熟时间（服务器秒）/);assert.match(h.confirmations.at(-1),/farm-harvest/);assert.match(h.confirmations.at(-1),/1700001800/);}
    if(spec.module==='pet'){assert.match(h.node('gp-pet-facts').textContent,/14400/);assert.match(h.node('gp-pet-facts').textContent,/不自动领取/);for(const cost of spec.costs)assert.ok(h.confirmations.at(-1).includes(cost.id));assert.match(h.confirmations.at(-1),/"finishTime": 20000/);assert.match(h.confirmations.at(-1),/"jobIdx": 0/);assert.match(h.confirmations.at(-1),/"startTime": 900/);}
    if(spec.module==='trial-challenge'){assert.match(h.confirmations.at(-1),/trial-challenge:first-clear:1:1001/);assert.match(h.confirmations.at(-1),/"stageId": 1001/);}
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
 const spec=cases.find(s=>s.actionType==='REFINE'),h=await loaded(spec);const modes=descendants(h.node('gp-equipment-growth-facts')).filter(e=>e.dataset.equipmentGrowthMode);assert.equal(modes.length,4);const before=h.requests.length;modes.find(e=>e.dataset.equipmentGrowthMode==='refine').click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{action:'refine'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-equipment-growth-plan').disabled,true);assert.equal(h.node('gp-equipment-growth-authorize').disabled,true);const task=h.node('gp-equipment-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'equipment-growth',parameters:{action:'refine'}});assert.equal(modes[0].disabled,true);h.respond('/api/gameplay/survey',data(spec));await task;assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('equipment growth mode selectors cannot reuse stale view after account change or dirty drafts',async()=>{
 const spec=cases.find(s=>s.actionType==='REFINE'),h=await loaded(spec),mode=descendants(h.node('gp-equipment-growth-facts')).find(e=>e.dataset.equipmentGrowthMode==='refine');h.node('gp-equipment-growth-parameters').value=JSON.stringify({heroId:'edited'});h.node('gp-equipment-growth-parameters').oninput();mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{heroId:'edited'});h.run("selectAccount('B');selectAccount('A');");mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});assert.equal(writes(h).length,0);
});

test('hero exclusive assembled PAGE chooses explicit kind and needs a new survey without planning',async()=>{
 const spec=cases.find(s=>s.actionType==='EXCLUSIVE-LEVEL'),h=await loaded(spec),modes=descendants(h.node('gp-heroes-facts')).filter(e=>e.dataset.heroGrowthMode);assert.equal(modes.length,4);const before=h.requests.length;modes.find(e=>e.dataset.heroGrowthMode==='exclusive-level').click();assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{action:'exclusive-level'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-heroes-plan').disabled,true);assert.equal(h.node('gp-heroes-authorize').disabled,true);const task=h.node('gp-heroes-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'heroes',parameters:{action:'exclusive-level'}});assert.equal(modes[0].disabled,true);h.respond('/api/gameplay/survey',data(spec));await task;assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
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

test('cached daily recruit/trial navigation reuses controlled sections without reads or writes and rejects stale account callbacks',async()=>{
 const h=await boot(),before=h.requests.length;
 const checklist=dailyChecklist({ok:{DailyTaskInfoRequest:{dailyTask:[{id:1002,progress:0,targetProgress:1,rewardClaimed:false},{id:1009,progress:0,targetProgress:1,rewardClaimed:false}]}},failed:{}},{config:{tables:{}}});
 h.run('renderDailies('+JSON.stringify({checklist,tasks:[]})+')');
 h.run('document.querySelector=selector=>({click:()=>{globalThis.openedTab=selector;}})');
 const links=[];
 for(const [id,title] of[['free-recruit','免费英雄招募'],['trial-challenge','英雄经验试炼首通']]){
  const link=descendants(h.node('dailies-table')).find(node=>node.textContent==='打开'+title);assert.ok(link);
  let scrolled=0;h.node('gp-'+id+'-section').scrollIntoView=()=>scrolled++;
  link.click();assert.equal(h.run('globalThis.openedTab'),'#tabs button[data-tab="idle"]');assert.equal(scrolled,1);links.push({link,scrolled:()=>scrolled});
 }
 assert.equal(h.requests.length,before);h.run("selectAccount('B');globalThis.openedTab=null");
 for(const row of links){row.link.click();assert.equal(row.scrolled(),1);}
 assert.equal(h.run('globalThis.openedTab'),null);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('all legacy entry buttons prepare the shared Workflow without game reads or execution',async()=>{
 const h=await boot();
 for(const entry of ['tasks','dailies','loop']){
  const opening=h.node(entry+'-unified').click();await tick();
  h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
  const intent=JSON.parse(h.node('wf-unified-intent').value);assert.equal(intent.entry,entry);assert.equal(intent.rounds,1);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});
  assert.equal(h.requests.some(row=>/connect|authorize|execute|survey/.test(row.url)),false);
 }
 const pending=h.node('wf-unified-prepare').click();await tick();
 const request=h.pending('/api/workflows/prepare');assert.ok(request);assert.equal(JSON.parse(request.options.body).entry,'loop');
 h.respond('/api/workflows/prepare',{accountId:'A',blocked:[{phase:'dailies',index:0,taskId:1010,reason:'EXACT_PIRATE_TARGET_REQUIRED'}],graph:{version:1,id:'unified-loop',name:'Unified loop',preparation:{entry:'loop',blocked:[{phase:'dailies',index:0,taskId:1010,reason:'EXACT_PIRATE_TARGET_REQUIRED'}]},nodes:[{id:'start',type:'START'},{id:'daily',type:'ACTION',module:'free-gold',selection:{unique:true}},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'daily'},{from:'daily',to:'stop'}]}});await pending;
 assert.equal(h.node('wf-id').value,'unified-loop');assert.match(h.node('wf-unified-blocked').textContent,/EXACT_PIRATE_TARGET_REQUIRED/);assert.equal(h.confirmations.length,0);assert.equal(h.node('wf-authorize').disabled,true);
});
test('late unified preparation cannot import another account graph',async()=>{
 const h=await boot();const reading=h.node('wf-load').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[]});await reading;
 h.node('wf-unified-intent').value=JSON.stringify({entry:'tasks',tasks:[],budget:{resources:[],quotas:[],uids:[]}});
 const pending=h.node('wf-unified-prepare').click();await tick();assert.ok(h.pending('/api/workflows/prepare'));
 h.run("current='B';resetGameplay()");
 h.respond('/api/workflows/prepare',{accountId:'A',graph:{version:1,id:'foreign',name:'foreign',nodes:[],edges:[]},blocked:[]});await pending;
 assert.equal(h.node('wf-id').value,'workflow-1');assert.equal(h.node('wf-unified-intent').value,'');assert.equal(h.node('wf-unified-blocked').textContent,'');
});

test('hero fragment form supports target then quantity editing, invalidates old preview and sends only explicit survey',async()=>{
 const spec=cases.find(s=>s.actionType==='FRAGMENT-EXCHANGE'),h=await loaded(spec);await preview(h,spec);
 const controls=descendants(h.node('gp-heroes-facts')),target=controls.find(e=>e.dataset.heroExchangeTarget),num=controls.find(e=>e.dataset.heroExchangeQuantity),prepare=controls.find(e=>e.dataset.heroExchangePrepare);
 assert.ok(h.node('gp-heroes-facts').textContent.includes('蓝卡万能碎片'));target.value='A';target.onchange();assert.equal(h.node('gp-heroes-authorize').disabled,true);assert.equal(num.disabled,false);assert.equal(prepare.disabled,false);
 num.value='1';num.oninput();assert.equal(num.disabled,false);num.value='17';num.oninput();prepare.click();assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{action:'fragment-exchange',heroId:'A',num:17});
 assert.equal(h.node('gp-heroes-plan').disabled,true);const request=h.node('gp-heroes-survey').onclick();assert.equal(prepare.disabled,true);assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'heroes',parameters:{action:'fragment-exchange',heroId:'A',num:17}});h.respond('/api/gameplay/survey',data(spec));await request;
 for(const route of ['/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
 const before=h.requests.length;h.run("selectAccount('B');selectAccount('A');");prepare.click();assert.equal(h.requests.length,before);assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{});
});
test('hero fragment form rejects empty target and nonpositive, fractional or overflowing quantity locally',async()=>{
 const spec=cases.find(s=>s.actionType==='FRAGMENT-EXCHANGE'),h=await loaded(spec),controls=descendants(h.node('gp-heroes-facts')),target=controls.find(e=>e.dataset.heroExchangeTarget),num=controls.find(e=>e.dataset.heroExchangeQuantity),prepare=controls.find(e=>e.dataset.heroExchangePrepare);
 num.value='7';prepare.click();assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{});target.value='A';target.onchange();
 for(const v of ['','0','-1','1.5','2147483648']){num.value=v;num.oninput();prepare.click();assert.equal(JSON.parse(h.node('gp-heroes-parameters').value).num,undefined);}
 assert.equal(writes(h).length,0);
});

test('equipment STAR mode changes only explicit draft, needs new survey and cannot reuse account callbacks',async()=>{
 const spec=cases.find(s=>s.module==='equipment-growth'&&s.actionType==='STAR'),h=await loaded(spec),mode=descendants(h.node('gp-equipment-growth-facts')).find(e=>e.dataset.equipmentGrowthMode==='star');const before=h.requests.length;mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{action:'star'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-equipment-growth-plan').disabled,true);assert.equal(h.node('gp-equipment-growth-authorize').disabled,true);
 const task=h.node('gp-equipment-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'equipment-growth',parameters:{action:'star'}});h.respond('/api/gameplay/survey',data(spec));await task;for(const route of ['/api/operations/plan','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);h.run("selectAccount('B');selectAccount('A');");mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});
});

test('badge STAR mode preserves exact hero/UID, drops old slot, and invalidates authorization until a fresh survey',async()=>{
 const spec=cases.find(row=>row.module==='badge-growth'&&row.actionType==='STAR'),h=await loaded(spec);
 const box=h.node('gp-badge-growth-facts'),before=h.requests.length,params=h.node('gp-badge-growth-parameters');
 params.value=JSON.stringify({heroId:'A',uid:spec.parameters.uid,action:'put-on',pos:2});
 descendants(box).find(n=>n.dataset.badgeGrowthMode==='star').click();
 assert.deepEqual(JSON.parse(params.value),spec.parameters);assert.equal(h.requests.length,before);
 assert.equal(h.node('gp-badge-growth-plan').disabled,true);assert.equal(h.node('gp-badge-growth-authorize').disabled,true);
 const pending=h.node('gp-badge-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'badge-growth',parameters:spec.parameters});h.respond('/api/gameplay/survey',data(spec));await pending;
 for(const word of ['红徽章单次升星','徽章升星石','500000','9007199254740995','不分解其他徽章'])assert.ok(box.textContent.includes(word),word);
 assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('mail claim prepare keeps exact int64 target and requires a fresh survey before any plan or authorization',async()=>{
 const spec=cases.find(r=>r.module==='mail'&&r.actionType==='CLAIM'),h=await loaded(spec),button=descendants(h.node('gp-mail-facts')).find(n=>n.dataset.mailClaimPrepare===spec.parameters.emailId);assert.ok(button);
 const before=h.requests.length;button.click();assert.equal(h.requests.length,before);assert.deepEqual(JSON.parse(h.node('gp-mail-parameters').value),spec.parameters);assert.equal(h.node('gp-mail-plan').disabled,true);assert.equal(h.node('gp-mail-authorize').disabled,true);
 const task=h.node('gp-mail-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'mail',parameters:spec.parameters});h.respond('/api/gameplay/survey',data(spec));await task;
 await preview(h,spec);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 const detached=descendants(h.node('gp-mail-facts')).find(n=>n.dataset.mailClaimPrepare===spec.parameters.emailId);h.run("selectAccount('B'); selectAccount('A');");detached.click();assert.deepEqual(JSON.parse(h.node('gp-mail-parameters').value),{});assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('empty mail READ prepare requires fresh survey, exact preview and account-scoped authorization',async()=>{
 const spec=cases.find(r=>r.module==='mail'&&r.actionType==='READ'),h=await loaded(spec),button=descendants(h.node('gp-mail-facts')).find(n=>n.dataset.mailReadPrepare===spec.parameters.emailId);assert.ok(button);
 const before=h.requests.length;button.click();assert.equal(h.requests.length,before);assert.deepEqual(JSON.parse(h.node('gp-mail-parameters').value),spec.parameters);assert.equal(h.node('gp-mail-plan').disabled,true);assert.equal(h.node('gp-mail-authorize').disabled,true);
 const task=h.node('gp-mail-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'mail',parameters:spec.parameters});h.respond('/api/gameplay/survey',data(spec));await task;await preview(h,spec);assert.equal(writes(h,'/api/operations/execute').length,0);
 const detached=descendants(h.node('gp-mail-facts')).find(n=>n.dataset.mailReadPrepare===spec.parameters.emailId);h.run("selectAccount('B'); selectAccount('A');");detached.click();assert.deepEqual(JSON.parse(h.node('gp-mail-parameters').value),{});assert.equal(writes(h,'/api/operations/execute').length,0);
});
function expeditionUiData(){return {accountId:'A',module:'formation',csrfToken:'synthetic-csrf-A',config:{enabled:true},status:{running:false,blocked:false},view:{mode:'expedition',raidId:1001,formation:{presetId:1,petUid:'9007199254740995',heroPositions:[{heroId:'A',pos:{x:1,y:1}}]},layouts:[{id:1,reliable:true,positions:[{x:1,y:1}]},{id:2,reliable:true,positions:[{x:1,y:1}]}],heroes:[{heroId:'A',career:'坦克'}],unlockedPresetIds:[1,2],candidates:[]}};}
async function expeditionUiLoaded(){const h=await extremeLoaded();h.node('gp-formation-mode').value='expedition';h.node('gp-formation-mode').onchange();h.node('gp-formation-raid').value='1001';h.node('gp-formation-mode-prepare').click();const task=h.node('gp-formation-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'formation',parameters:{mode:'expedition',raidId:1001}});h.respond('/api/gameplay/survey',expeditionUiData());await task;return h;}
for(const manual of [false,true])test('expedition assembled PAGE retains exact mode and raid in '+(manual?'manual':'career')+' parameters without implicit write',async()=>{
 const h=await expeditionUiLoaded(),count=h.requests.length;h.node('gp-formation-template').value='2';h.node('gp-formation-'+(manual?'manual':'career')).click();
 assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),{mode:'expedition',raidId:1001,presetId:2,...(manual?{heroPositions:[{heroId:'A',pos:{x:1,y:1}}]}:{heroIds:['A']})});assert.equal(h.requests.length,count);assert.equal(h.node('gp-formation-authorize').disabled,true);assert.equal(h.node('gp-formation-plan').disabled,true);
});
test('expedition assembled PAGE mode changes invalidate selection and late survey; switched accounts clear draft',async()=>{
 const h=await expeditionUiLoaded();const task=h.node('gp-formation-survey').onclick();h.node('gp-formation-mode').value='mainline';h.node('gp-formation-mode').onchange();h.respond('/api/gameplay/survey',expeditionUiData());await task;assert.equal(h.node('gp-formation-roster').children.length,0);assert.equal(h.node('gp-formation-plan').disabled,true);h.node('gp-formation-mode-prepare').click();assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),{});h.run("selectAccount('B');selectAccount('A');");assert.equal(h.node('gp-formation-mode').value,'mainline');assert.equal(h.node('gp-formation-raid').value,'');assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(h.run('gameplayCsrfToken()'),null);
});
test('expedition assembled PAGE refuses invalid raid without requests or reuse of the former roster',async()=>{
 for(const value of ['','0','-1','1.5','2147483648']){const h=await extremeLoaded(),count=h.requests.length;h.node('gp-formation-mode').value='expedition';h.node('gp-formation-mode').onchange();h.node('gp-formation-raid').value=value;h.node('gp-formation-mode-prepare').click();assert.equal(h.requests.length,count);assert.equal(h.node('gp-formation-roster').children.length,0);assert.equal(h.node('gp-formation-plan').disabled,true);assert.match(h.node('gp-formation-hint').textContent,/raidId/);}
});

const assetUiReport={status:'BLOCKED',ready:false,assets:[{id:'synthetic-map',role:'map',path:'work/cdn/world_map.world_map1.json',required:true,status:'BLOCKED',reason:'ASSET_SOURCE_UNKNOWN',expectedSha256:null,actualSha256:'a'.repeat(64)}],provenanceNote:'Original source version unknown',recovery:[{id:'synthetic-map',source:null,expectedSha256:null,steps:['Keep this capability blocked until the retained source is available.']}]};
test('runtime assets assembled PAGE uses one read-only request and displays exact missing provenance without action buttons',async()=>{
 const h=await boot();assert.equal(h.requests.some(r=>r.url.includes('/api/assets/readiness')),false);const task=h.node('assets-read').onclick();assert.equal(h.pending('/api/assets/readiness').options.method,undefined);h.respond('/api/assets/readiness',assetUiReport);await task;assert.match(h.node('assets-readiness').textContent,/ASSET_SOURCE_UNKNOWN/);assert.match(h.node('assets-readiness').textContent,/保留来源：未知/);assert.match(h.node('assets-readiness').textContent,/保留哈希：未知/);assert.match(h.node('assets-readiness').textContent,/不代表玩法验收通过/);assert.equal(writes(h).length,0);
});
test('runtime assets assembled PAGE clears previous readiness on failed refresh and ignores old-account late results',async()=>{
 const h=await boot();let task=h.node('assets-read').onclick();h.respond('/api/assets/readiness',{...assetUiReport,status:'READY',ready:true});await task;assert.match(h.node('assets-readiness').textContent,/清单一致/);
 task=h.node('assets-read').onclick();assert.equal(h.node('assets-readiness').textContent,'');h.respond('/api/assets/readiness',{error:'synthetic read unavailable'},{ok:false});await task;assert.match(h.node('assets-readiness').textContent,/查询失败/);assert.doesNotMatch(h.node('assets-readiness').textContent,/清单一致/);
 task=h.node('assets-read').onclick();h.run("selectAccount('B');selectAccount('A');");h.respond('/api/assets/readiness',assetUiReport);await task;assert.equal(h.node('assets-readiness').textContent,'');assert.equal(h.node('assets-hint').textContent,'');assert.equal(writes(h).length,0);
});
test('runtime assets assembled PAGE does not render late older reads over a newer missing-manifest report',async()=>{
 const h=await boot(),older=h.node('assets-read').onclick(),newer=h.node('assets-read').onclick();const first=h.pending('/api/assets/readiness');first.settled=true;h.respond('/api/assets/readiness',{status:'BLOCKED',ready:false,reason:'MANIFEST_MISSING',assets:[],recovery:[]});await newer;first.resolve({ok:true,json:async()=>({...assetUiReport,ready:true})});await older;assert.match(h.node('assets-readiness').textContent,/MANIFEST_MISSING/);assert.doesNotMatch(h.node('assets-readiness').textContent,/清单一致/);
});

test('material packs professional form requires exact quantity and fresh survey, then ignores old-account controls',async()=>{
 const spec=cases.find(row=>row.module==='material-packs'),h=await loaded(spec),box=h.node('gp-material-packs-facts');
 const find=key=>descendants(box).find(node=>node.dataset[key]);const select=find('materialPackTarget'),num=find('materialPackQuantity'),button=find('materialPackPrepare');
 assert.ok(select&&num&&button);assert.equal(num.value,'');select.value=JSON.stringify({packId:'原料自选包',itemId:'木材'});button.click();assert.match(h.node('gp-material-packs-hint').textContent,/正整数/);assert.equal(writes(h).length,0);
 num.value='3';button.click();assert.deepEqual(JSON.parse(h.node('gp-material-packs-parameters').value),{packId:'原料自选包',itemId:'木材',num:3});assert.equal(h.node('gp-material-packs-plan').disabled,true);assert.equal(h.node('gp-material-packs-authorize').disabled,true);assert.equal(writes(h).length,0);
 const survey=h.node('gp-material-packs-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'material-packs',parameters:{packId:'原料自选包',itemId:'木材',num:3}});h.respond('/api/gameplay/survey',data(spec));await survey;
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");button.click();assert.equal(h.node('gp-material-packs-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);assert.match(PAGE,/id=\"gp-material-packs-section\"/);
});

test('daily reward professional prepare validates exact ID and invalidates old preview before a new survey',async()=>{
 const spec=cases.find(s=>s.module==='task-rewards'&&s.parameters.kind==='daily'),h=await loaded(spec),box=h.node('gp-task-rewards-facts');
 const controls=descendants(box),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare);assert.ok(input&&prepare);
 const before=h.requests.length;
 for(const value of['','0','-1','1.5','2147483648']){input.value=value;prepare.click();assert.equal(h.requests.length,before);assert.equal(h.node('gp-task-rewards-parameters').value,'{}');}
 input.value='1001';prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),{kind:'daily',taskId:1001});assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:{kind:'daily',taskId:1001}});h.respond('/api/gameplay/survey',data(spec));await survey;
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");input.value='1002';prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('assembled Dailies page prepares explicit reward claim through account CSRF without authorizing',async()=>{
 const h=await boot(),opening=h.node('dailies-unified').click();await tick();
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 const intent={entry:'dailies',dailies:[{taskId:1001,action:'claim'}],budget:{resources:[],quotas:[],uids:[{type:'task-reward',id:'daily:2000:1001'}]}};
 h.node('wf-unified-intent').value=JSON.stringify(intent);const pending=h.node('wf-unified-prepare').click();await tick();assertMutation(h.pending('/api/workflows/prepare'),'/api/workflows/prepare',intent);
 const graph={version:1,id:'unified-dailies-claim',name:'Dailies claim',budget:intent.budget,nodes:[{id:'start',type:'START'},{id:'dailies-0-1',type:'ACTION',module:'task-rewards',parameters:{kind:'daily',taskId:1001},selection:{unique:true}},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'dailies-0-1'},{from:'dailies-0-1',to:'stop'}]};
 h.respond('/api/workflows/prepare',{accountId:'A',blocked:[],graph});await pending;assert.equal(h.node('wf-id').value,graph.id);assert.equal(h.node('wf-authorize').disabled,true);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.match(PAGE,/action:"claim"/);
});

test('daily activity prepare uses exact tier field, clears preview and ignores old account controls',async()=>{
 const spec=cases.find(s=>s.parameters.kind==='daily-activity'),h=await loaded(spec),controls=descendants(h.node('gp-task-rewards-facts')),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare);assert.ok(kind&&input&&prepare);
 kind.value='daily-activity';input.value='2';const before=h.requests.length;prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),{kind:'daily-activity',tierId:2});assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:{kind:'daily-activity',tierId:2}});h.respond('/api/gameplay/survey',data(spec));await survey;assert.match(h.node('gp-task-rewards-facts').textContent,/日活跃宝箱/);assert.match(h.node('gp-task-rewards-facts').textContent,/2000/);
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");input.value='3';prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);
});


test('assembled Dailies activity intent preserves tier identity and only prepares an account-bound graph',async()=>{
 const h=await boot(),opening=h.node('dailies-unified').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 const intent={entry:'dailies',dailies:[{kind:'daily-activity',tierId:2,action:'claim'}],budget:{resources:[],quotas:[],uids:[{type:'daily-activity-reward',id:'2000:2'}]}};
 h.node('wf-unified-intent').value=JSON.stringify(intent);const pending=h.node('wf-unified-prepare').click();await tick();assertMutation(h.pending('/api/workflows/prepare'),'/api/workflows/prepare',intent);
 const graph={version:1,id:'unified-dailies-activity',name:'Activity claim',budget:intent.budget,nodes:[{id:'start',type:'START'},{id:'dailies-0-1',type:'ACTION',module:'task-rewards',parameters:{kind:'daily-activity',tierId:2},selection:{unique:true}},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'dailies-0-1'},{from:'dailies-0-1',to:'stop'}]};
 h.respond('/api/workflows/prepare',{accountId:'A',blocked:[],graph});await pending;assert.equal(h.node('wf-id').value,graph.id);assert.equal(h.node('wf-authorize').disabled,true);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.ok(PAGE.includes('kind:"daily-activity",tierId:精确档位ID,action:"claim"'));
});


test('free gift form prepares only constant free pack with fresh survey and no automatic authorization',async()=>{
 const spec=cases.find(s=>s.parameters.kind==='daily-gift'),h=await loaded(spec),controls=descendants(h.node('gp-task-rewards-facts')),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare);
 kind.value='daily-gift';input.value='';const before=h.requests.length;prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),{kind:'daily-gift',packId:'赠礼'});assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:{kind:'daily-gift',packId:'赠礼'}});h.respond('/api/gameplay/survey',data(spec));await survey;assert.match(h.node('gp-task-rewards-facts').textContent,/服务器原样标记 1/);
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);
});



test('unified saved graph and history retain original excluded declarations without dispatch or stale-account display',async()=>{
 const h=await boot(),preparation={entry:'loop',blocked:[{phase:'tasks',index:0,taskId:6,reason:'DAILY_ORDER_CONTRACT_UNVERIFIED'}]};
 const graph={version:1,id:'saved-unified',name:'Saved mixed declaration',preparation,nodes:[{id:'start',type:'START'},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'stop'}]};
 const loading=h.node('wf-load').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[graph],history:[{accountId:'A',runId:'persisted',workflowId:graph.id,status:'RECOVERED_STOPPED'}]});await loading;
 h.node('wf-saved').value=graph.id;await h.node('wf-open').click();assert.match(h.node('wf-unified-blocked').textContent,/DAILY_ORDER_CONTRACT_UNVERIFIED/);
 assert.deepEqual(JSON.parse(h.node('wf-json').value).preparation,preparation);
 const history={accountId:'A',workflowRunId:'persisted',workflowDefinitionId:graph.id,status:'RECOVERED_STOPPED',recovered:true,readOnly:true,resumable:false,unlinkedOperationCount:0,preparation,nodes:[]};
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',history);await reading;
 assert.match(h.node('wf-history-detail').textContent,/原声明入口：loop.*未纳入 1 项/);assert.match(h.node('wf-history-detail').textContent,/任务 6.*未执行.*DAILY_ORDER/);
 const late=h.node('wf-history-read').click();await tick();h.run("selectAccount('B')");h.respond('/api/workflows/history',history);await late;
 assert.equal(h.node('wf-unified-blocked').textContent,'');assert.equal(h.node('wf-history-detail').textContent,'');
 assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/plan').length,0);
});

test('wait history shows exact local interval and preserves missing legacy duration without inferring eligibility',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();await tick();
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'waiting-run',workflowId:'wait-flow',status:'RECOVERED_STOPPED'}]});await loading;
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:'waiting-run',workflowDefinitionId:'wait-flow',status:'RECOVERED_STOPPED',recovered:true,readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[{nodeId:'interval',result:'WAIT_STARTED',durationMs:60000,timestamp:'2026-11-13T00:00:00.000Z'},{nodeId:'legacy',result:'WAITED',timestamp:null}]});await reading;
 const text=h.node('wf-history-detail').textContent;assert.match(text,/interval.*等待已开始.*60000 毫秒/);assert.match(text,/legacy.*等待已结束.*时长 未知.*时间未知/);assert.match(text,/不代表游戏冷却或可重放资格/);
 assert.equal(writes(h,'/api/workflows/resume').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);
});


async function unifiedForm(entry='tasks') {
 const h=await boot(),opening=h.node(entry+'-unified').click();await tick();
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 return h;
}
const unifiedDraft=h=>JSON.parse(h.node('wf-unified-intent').value);
function unifiedAdd(h,phase,kind,target='') {
 h.node('wf-unified-phase').value=phase;h.node('wf-unified-phase').onchange();
 h.node('wf-unified-kind').value=kind;h.node('wf-unified-kind').onchange();
 h.node('wf-unified-target').value=target;h.node('wf-unified-add').click();
}
function unifiedLoad(h,draft) {
 h.node('wf-unified-intent').value=JSON.stringify(draft);h.node('wf-unified-form-load').click();
}
const unifiedStep=(h,key,move)=>descendants(h.node('wf-unified-steps')).find(n=>n.dataset.unifiedStep===key&&n.dataset.unifiedMove===move);
function unifiedBudget(h,kind,id,num='',type='') {
 for(const [key,value] of Object.entries({'budget-kind':kind,'budget-id':id,'budget-num':num,'budget-type':type}))h.node('wf-unified-'+key).value=value;
 h.node('wf-unified-budget-kind').onchange();h.node('wf-unified-budget-add').click();
}

test('unified business form maps explicit task rewards and daily drivers without dispatch',async()=>{
 const h=await unifiedForm('loop'),before=h.requests.length;
 unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],rounds:2,everyMs:3000,budget:{resources:[],quotas:[],uids:[]}});
 for(const [kind,id] of [['main','1'],['branch','2'],['achievement','1001'],['daily','8001'],['daily-activity','3'],['daily-gift','']])unifiedAdd(h,'tasks',kind,id);
 for(const [kind,id] of [['daily','8002'],['daily-activity','4'],['daily-gift',''],['free-recruit',''],['free-gold',''],['trial-challenge',''],['pirate-sweep','9007199254740991']])unifiedAdd(h,'dailies',kind,id);
 assert.deepEqual(unifiedDraft(h).tasks,[{kind:'main',taskId:1},{kind:'branch',taskId:2},{kind:'achievement',taskId:1001},{kind:'daily',taskId:8001},{kind:'daily-activity',tierId:3},{kind:'daily-gift',packId:'赠礼'}]);
 assert.deepEqual(unifiedDraft(h).dailies,[{taskId:8002,action:'claim'},{kind:'daily-activity',tierId:4,action:'claim'},{kind:'daily-gift',packId:'赠礼',action:'claim'},{taskId:1002,action:'perform'},{taskId:1006,action:'perform'},{taskId:1009,action:'perform'},{taskId:1010,action:'perform',parameters:{uid:9007199254740991}}]);
 assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
});

test('unified form refuses invalid targets and unsupported entry combinations without changing draft',async()=>{
 const h=await unifiedForm(),before=h.requests.length;
 for(const target of ['','0','-1','1.5','1e3','2147483648','9007199254740992']){
  const source=h.node('wf-unified-intent').value;unifiedAdd(h,'tasks','main',target);
  assert.equal(h.node('wf-unified-intent').value,source,target);assert.match(h.node('wf-unified-form-hint').textContent,/明确整数/);
 }
 for(const [phase,kind] of [['dailies','free-gold'],['tasks','free-recruit']]){
  const source=h.node('wf-unified-intent').value;unifiedAdd(h,phase,kind);assert.equal(h.node('wf-unified-intent').value,source);
 }
 h.node('wf-unified-entry').value='loop';h.node('wf-unified-rounds').value='2';h.node('wf-unified-every').value='500';h.node('wf-unified-limits').click();
 unifiedAdd(h,'dailies','pirate-sweep','9007199254740992');assert.equal(unifiedDraft(h).dailies.length,0);
 unifiedAdd(h,'tasks','main','1');const source=h.node('wf-unified-intent').value;
 h.node('wf-unified-entry').value='dailies';h.node('wf-unified-rounds').value='1';h.node('wf-unified-every').value='0';h.node('wf-unified-limits').click();
 assert.equal(h.node('wf-unified-intent').value,source);assert.match(h.node('wf-unified-form-hint').textContent,/其他分组/);
 assert.equal(h.requests.length,before);
});

test('unified form enforces finite rounds and delay and keeps Tasks and Dailies single round',async()=>{
 const h=await unifiedForm();
 for(const [entry,rounds,every] of [['loop','49','0'],['loop','0','0'],['loop','1e1','0'],['loop','2','60001'],['loop','2','-1'],['tasks','2','0'],['dailies','1','1']]){
  const source=h.node('wf-unified-intent').value;
  for(const [id,value] of Object.entries({entry,rounds,every}))h.node('wf-unified-'+id).value=value;
  h.node('wf-unified-limits').click();assert.equal(h.node('wf-unified-intent').value,source,[entry,rounds,every].join('/'));
 }
 for(const [entry,rounds,every] of [['dailies','1','0'],['tasks','1','0'],['loop','48','60000']]){
  for(const [id,value] of Object.entries({entry,rounds,every}))h.node('wf-unified-'+id).value=value;
  h.node('wf-unified-limits').click();assert.equal(unifiedDraft(h).entry,entry);assert.equal(unifiedDraft(h).rounds,Number(rounds));assert.equal(unifiedDraft(h).everyMs,Number(every));
 }
 assert.equal(writes(h).length,0);
});

test('unified budgets preserve UID strings and reject duplicate, ambiguous or unsafe amounts',async()=>{
 const h=await unifiedForm(),before=h.requests.length;
 unifiedBudget(h,'resources','GOLD','37');unifiedBudget(h,'quotas','free-gold:reset:2000','1');unifiedBudget(h,'uids','9007199254740995','','mail');
 assert.deepEqual(unifiedDraft(h).budget,{resources:[{id:'GOLD',num:37}],quotas:[{id:'free-gold:reset:2000',num:1}],uids:[{type:'mail',id:'9007199254740995'}]});
 assert.equal(h.node('wf-unified-budget-num').disabled,true);assert.equal(h.node('wf-unified-budget-type').disabled,false);
 for(const [kind,id,num,type] of [['resources','GOLD','1',''],['uids','9007199254740995','','mail'],['resources',' RUBY','1',''],['uids','1','',''],['resources','WOOD','0',''],['resources','WOOD','1.5',''],['resources','WOOD','1e3',''],['resources','WOOD','9007199254740992','']]){
  const source=h.node('wf-unified-intent').value;unifiedBudget(h,kind,id,num,type);assert.equal(h.node('wf-unified-intent').value,source,[kind,id,num,type].join('/'));
 }
 unifiedBudget(h,'uids','9007199254740995','','equipment');assert.equal(unifiedDraft(h).budget.uids.length,2);
 const remove=descendants(h.node('wf-unified-budget-rows')).find(n=>n.dataset.unifiedBudget==='resources:0');remove.click();assert.deepEqual(unifiedDraft(h).budget.resources,[]);
 const source=h.node('wf-unified-intent').value;remove.click();assert.equal(h.node('wf-unified-intent').value,source);
 assert.equal(h.requests.length,before);
});

test('unified step edits retain advanced world selections and metadata and discard stale callbacks',async()=>{
 const h=await unifiedForm('loop'),world={module:'production',parameters:{cityId:1},selection:{actionId:'exact'}};
 unifiedLoad(h,{entry:'loop',id:'custom-id',name:'自定义',tasks:[{kind:'main',taskId:1},{kind:'branch',taskId:2}],dailies:[],world:[world],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]},custom:{keep:true}});
 const stale=unifiedStep(h,'tasks:0','0');unifiedStep(h,'tasks:1','-1').click();
 assert.deepEqual(unifiedDraft(h).tasks,[{kind:'branch',taskId:2},{kind:'main',taskId:1}]);
 const source=h.node('wf-unified-intent').value;stale.click();assert.equal(h.node('wf-unified-intent').value,source);
 unifiedStep(h,'tasks:0','1').click();unifiedStep(h,'tasks:0','0').click();
 const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'branch',taskId:2}]);assert.deepEqual(draft.world,[world]);assert.equal(draft.id,'custom-id');assert.equal(draft.name,'自定义');assert.deepEqual(draft.custom,{keep:true});
 const old=unifiedStep(h,'tasks:0','0');draft.name='高级编辑后';h.node('wf-unified-intent').value=JSON.stringify(draft);old.click();assert.equal(unifiedDraft(h).name,'高级编辑后');assert.equal(unifiedDraft(h).tasks.length,1);
 assert.equal(writes(h).length,0);
});

test('unified form rejects malformed advanced input and caps each group without destructive repair',async()=>{
 const h=await unifiedForm();
 for(const value of ['{','null','[]',JSON.stringify({entry:'tasks',tasks:{},budget:{}}),JSON.stringify({entry:'tasks',tasks:[],budget:null})]){
  h.node('wf-unified-intent').value=value;h.node('wf-unified-form-load').click();unifiedAdd(h,'tasks','main','1');assert.equal(h.node('wf-unified-intent').value,value);assert.ok(h.node('wf-unified-form-hint').textContent);
 }
 unifiedLoad(h,{entry:'tasks',tasks:Array.from({length:48},(_,i)=>({kind:'main',taskId:i+1})),budget:{resources:[],quotas:[],uids:[]}});
 const source=h.node('wf-unified-intent').value;unifiedAdd(h,'tasks','main','49');assert.equal(h.node('wf-unified-intent').value,source);assert.match(h.node('wf-unified-form-hint').textContent,/48/);assert.equal(writes(h).length,0);
});

test('unified form prepares through the existing endpoint and locks edits until response',async()=>{
 const h=await unifiedForm();unifiedAdd(h,'tasks','main','1');const source=h.node('wf-unified-intent').value;
 const stale=unifiedStep(h,'tasks:0','0'),pending=h.node('wf-unified-prepare').click();await tick();
 const request=h.pending('/api/workflows/prepare');assert.ok(request);assert.equal(request.options.method,'POST');assert.equal(JSON.parse(request.options.body).tasks[0].taskId,1);
 for(const id of ['add','limits','budget-add','form-load'])assert.equal(h.node('wf-unified-'+id).disabled,true,id);
 assert.equal(stale.disabled,true);stale.click();unifiedAdd(h,'tasks','main','2');assert.equal(h.node('wf-unified-intent').value,source);
 h.respond('/api/workflows/prepare',{accountId:'A',blocked:[],graph:null});await pending;
 assert.equal(h.node('wf-unified-add').disabled,false);assert.equal(writes(h).length,1);assert.equal(h.confirmations.length,0);
 for(const word of ['connect','authorize','execute','survey'])assert.equal(h.requests.some(r=>r.url.includes(word)),false,word);
});

test('unified form clears on account changes and old handlers cannot change new account draft',async()=>{
 const h=await unifiedForm();unifiedAdd(h,'tasks','main','1');unifiedBudget(h,'resources','GOLD','3');
 const oldStep=unifiedStep(h,'tasks:0','0'),oldBudget=descendants(h.node('wf-unified-budget-rows')).find(n=>n.dataset.unifiedBudget==='resources:0');
 h.run("selectAccount('B')");assert.equal(h.node('wf-unified-intent').value,'');assert.equal(h.node('wf-unified-steps').textContent,'');assert.equal(h.node('wf-unified-budget-rows').textContent,'');assert.equal(h.node('wf-unified-target').value,'');
 unifiedAdd(h,'tasks','branch','7');const source=h.node('wf-unified-intent').value;oldStep.click();oldBudget.click();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);
});

test('unified form respects the existing running Workflow lock',async()=>{
 const h=await unifiedForm();unifiedAdd(h,'tasks','main','1');const source=h.node('wf-unified-intent').value,old=unifiedStep(h,'tasks:0','0');
 const loading=h.node('wf-load').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'AWAITING_AUTHORIZATION',running:true},graphs:[],history:[]});await loading;
 for(const id of ['add','limits','budget-add','form-load','prepare'])assert.equal(h.node('wf-unified-'+id).disabled,true,id);
 assert.equal(old.disabled,true);old.click();unifiedBudget(h,'resources','GOLD','4');assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);
});

test('unified generated declaration compiles with the original Registry and keeps exact preview budget',async()=>{
 const h=await unifiedForm('loop');
 unifiedLoad(h,{entry:'loop',id:'business-form',name:'专业表单',tasks:[],dailies:[],world:[],rounds:2,everyMs:100,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'tasks','main','7');unifiedAdd(h,'dailies','daily-activity','2');unifiedAdd(h,'dailies','free-gold');
 unifiedBudget(h,'resources','GOLD','15');unifiedBudget(h,'quotas','free-gold:reset:2000','2');unifiedBudget(h,'uids','2000:1','','free-gold');
 const pending=h.node('wf-unified-prepare').click();await tick();const req=h.pending('/api/workflows/prepare'),body=JSON.parse(req.options.body);
 // Only transport metadata is removed by the real handler before the pure compiler.
 delete body.accountId;delete body.csrfToken;
 const modules=Object.fromEntries(['task-rewards','free-gold'].map(id=>[id,{id,survey(){throw Error('offline preview cannot survey')},view(){},plan(){},verify(){}}]));
 const result=compileUnifiedExecution(body,{modules});assert.deepEqual(result.blocked,[]);
 assert.deepEqual(result.graph.nodes.filter(n=>n.type==='ACTION').map(n=>[n.module,n.parameters]),Array.from({length:2},()=>[['task-rewards',{kind:'main',taskId:7}],['task-rewards',{kind:'daily-activity',tierId:2}],['free-gold',{}]]).flat());
 assert.deepEqual(result.graph.budget,unifiedDraft(h).budget);assert.equal(result.graph.nodes.filter(n=>n.type==='WAIT').length,1);
 h.respond('/api/workflows/prepare',{accountId:'A',...result});await pending;
 assert.equal(h.node('wf-id').value,'business-form');assert.equal(h.node('wf-authorize').disabled,true);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,1);
});


function unifiedCandidateButton(h,spec,actionId=spec.actionId) {
 return descendants(h.node('gp-'+spec.module+'-candidates')).find(n=>n.dataset.unifiedCandidate===actionId);
}
test('professional candidates populate Loop world steps with exact parameters and no reads, authorization or budget expansion',async()=>{
 for(const spec of [cases.find(s=>s.module==='mail'&&s.actionType==='CLAIM'),cases.find(s=>s.module==='pet'),cases.find(s=>s.actionType==='FRAGMENT-EXCHANGE'),pirateCase,cases.find(s=>s.module==='free-gold'),cases.find(s=>s.module==='farm'&&s.actionType==='PLANT')]){
  const h=await loaded(spec),before=h.requests.length,button=unifiedCandidateButton(h,spec);assert.ok(button);assert.equal(button.disabled,false);button.click();
  const draft=unifiedDraft(h);assert.equal(draft.entry,'loop');assert.deepEqual(draft.world,[{module:spec.module,parameters:spec.parameters,selection:{actionId:spec.actionId}}]);assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});
  assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.ok(h.node('wf-unified-steps').textContent.includes(spec.actionId));assert.match(h.node('gp-'+spec.module+'-hint').textContent,/已加入 Loop/);
  const modules={[spec.module]:{id:spec.module,survey(){throw Error('local import cannot survey')},view(){},plan(){},verify(){}}},compiled=compileUnifiedExecution(draft,{modules});
  const action=compiled.graph.nodes.find(n=>n.type==='ACTION');assert.deepEqual(action.parameters,spec.parameters);assert.deepEqual(action.selection,{actionId:spec.actionId});
 }
});
test('candidate imports preserve existing phases, metadata, exact world selections and cumulative budget',async()=>{
 const spec=cases.find(s=>s.module==='pet'),h=await loaded(spec);
 const draft={entry:'loop',id:'preserved',name:'原工作流',rounds:2,everyMs:700,tasks:[{kind:'main',taskId:7}],dailies:[{taskId:1006}],world:[{module:'formation',parameters:{presetId:2},selection:'formation-exact'}],budget:{resources:[{id:'鱼肠线',num:24}],quotas:[{id:'quota-one',num:1}],uids:[{type:'pet-job',id:'9007199254740995'}]}};
 unifiedLoad(h,draft);unifiedCandidateButton(h,spec).click();const next=unifiedDraft(h);
 assert.deepEqual({...next,world:draft.world},draft);assert.deepEqual(next.world,[...draft.world,{module:'pet',parameters:spec.parameters,selection:{actionId:spec.actionId}}]);assert.equal(writes(h).length,0);
 unifiedStep(h,'world:1','-1').click();assert.equal(unifiedDraft(h).world[0].module,'pet');unifiedStep(h,'world:0','0').click();assert.deepEqual(unifiedDraft(h).world,draft.world);
});
test('import refuses malformed or non-Loop declarations and preserves existing contents',async()=>{
 const spec=cases.find(s=>s.module==='free-gold'),h=await loaded(spec);
 for(const source of ['{',JSON.stringify({entry:'tasks',tasks:[{kind:'main',taskId:1}],budget:{resources:[],quotas:[],uids:[]}}),JSON.stringify({entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}})]){
  h.node('wf-unified-intent').value=source;unifiedCandidateButton(h,spec).click();assert.equal(h.node('wf-unified-intent').value,source);assert.match(h.node('gp-'+spec.module+'-hint').textContent,/加入声明失败/);
 }
 assert.equal(writes(h).length,0);
});
test('blocked candidates and candidates without explicit parameters cannot be imported by guessing the current textarea',async()=>{
 const spec=cases.find(s=>s.module==='mail'&&s.actionType==='CLAIM'),h=await loaded(spec),blocked=unifiedCandidateButton(h,spec,spec.actionId+':blocked'),before=h.requests.length;
 assert.equal(blocked.disabled,true);blocked.click();assert.equal(h.node('wf-unified-intent').value,'');
 const loading=h.node('gp-mail-load').click();const response=data(spec);delete response.view.candidates[0].parameters;h.respond('/api/gameplay',response,{module:'mail'});await loading;
 h.node('gp-mail-parameters').value=JSON.stringify(spec.parameters);const missing=unifiedCandidateButton(h,spec);assert.equal(missing.disabled,true);missing.click();assert.equal(h.node('wf-unified-intent').value,'');assert.match(h.node('gp-mail-candidates').textContent,/缺少明确业务参数/);assert.equal(h.requests.length,before+1);
});
test('stale professional import callbacks reject new cache versions, parameter edits and A-B-A changes',async()=>{
 const spec=cases.find(s=>s.module==='pet'),h=await loaded(spec),old=unifiedCandidateButton(h,spec);
 const reading=h.node('gp-pet-load').click();h.respond('/api/gameplay',data(spec),{module:'pet'});await reading;old.click();assert.equal(h.node('wf-unified-intent').value,'');
 let button=unifiedCandidateButton(h,spec);h.node('gp-pet-parameters').value='{}';h.node('gp-pet-parameters').oninput();const before=h.requests.length;button.click();assert.equal(h.node('wf-unified-intent').value,'');
 h.run("selectAccount('B');selectAccount('A')");old.click();button.click();assert.equal(h.node('wf-unified-intent').value,'');assert.equal(h.requests.length,before);
});
test('Workflow pending and running state lock existing candidate import controls until the original read completes',async()=>{
 const spec=cases.find(s=>s.module==='free-gold'),h=await loaded(spec),button=unifiedCandidateButton(h,spec);
 const reading=h.node('wf-load').click();assert.equal(button.disabled,true);button.click();assert.equal(h.node('wf-unified-intent').value,'');
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;assert.equal(button.disabled,true);button.click();assert.equal(h.node('wf-unified-intent').value,'');
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;assert.equal(button.disabled,false);button.click();assert.equal(unifiedDraft(h).world[0].module,'free-gold');assert.equal(writes(h).length,0);
});
test('candidate import respects world step limit and renders exact identities as text',async()=>{
 const spec={...cases.find(s=>s.module==='free-gold'),actionId:'<img onerror=alert(1)>'},h=await loaded(spec);
 unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:Array.from({length:48},(_,i)=>({module:'free-gold',parameters:{},selection:'known-'+i})),budget:{resources:[],quotas:[],uids:[]}});
 const source=h.node('wf-unified-intent').value;unifiedCandidateButton(h,spec).click();assert.equal(h.node('wf-unified-intent').value,source);assert.match(h.node('gp-free-gold-hint').textContent,/最多48/);
 unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],budget:{resources:[],quotas:[],uids:[]}});unifiedCandidateButton(h,spec).click();assert.ok(h.node('wf-unified-steps').textContent.includes(spec.actionId));assert.ok(descendants(h.node('wf-unified-steps')).every(n=>n.tagName!=='img'));assert.equal(writes(h).length,0);
});


async function conditionPage(type='CONDITION',condition={source:'survey',path:['view','count'],operator:'GTE',value:2}) {
 const h=await unifiedForm(),node={id:'check',type,condition};
 if(type==='VERIFY')node.module='free-gold';
 const graph={version:1,id:'condition-form',name:'条件表单',nodes:[{id:'start',type:'START'},node,{id:'pass',type:'STOP'},...(type==='VERIFY'?[]:[{id:'fail',type:'STOP'}])],edges:[{from:'start',to:'check'},...(type==='VERIFY'?[{from:'check',to:'pass'}]:[{from:'check',to:'pass',when:'PASS'},{from:'check',to:'fail',when:'FAIL'}])]};
 h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();return h;
}
const conditionFields=(h,key)=>descendants(h.node('wf-nodes')).filter(n=>n.dataset.workflowCondition==='check'&&n.dataset.conditionField===key);
const conditionField=(h,key)=>conditionFields(h,key)[0];
const conditionButton=(h,key)=>descendants(h.node('wf-nodes')).find(n=>n.dataset[key]==='check');
const conditionGraph=h=>JSON.parse(h.node('wf-json').value);
const storedCondition=h=>conditionGraph(h).nodes.find(n=>n.id==='check').condition;

test('condition forms for CONDITION, RULE and VERIFY roundtrip through the existing validator without requests',async()=>{
 for(const type of ['CONDITION','RULE','VERIFY']){
  const original={source:'survey',path:['view','count'],operator:'GTE',value:2},h=await conditionPage(type,original),before=h.requests.length;
  assert.equal(conditionField(h,'source').value,'survey');assert.deepEqual(conditionFields(h,'path').map(n=>n.value),original.path);assert.equal(conditionField(h,'valueType').value,'number');conditionButton(h,'workflowConditionApply').click();
  assert.deepEqual(storedCondition(h),original);assert.equal(validateWorkflow(conditionGraph(h),{modules:{'free-gold':{id:'free-gold',survey(){},view(){},plan(){},verify(){}}}}).valid,true);
  assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 }
});

test('condition form applies every existing comparator and original evaluator retains UNKNOWN for missing facts',async()=>{
 const h=await conditionPage();
 for(const operator of WORKFLOW_CONDITION_FIELDS.operators){
  const before=h.node('wf-json').value;conditionField(h,'operator').value=operator;conditionField(h,'operator').onchange();
  assert.equal(h.node('wf-json').value,before,'draft changes require explicit apply');assert.equal(conditionField(h,'value').disabled,operator==='EXISTS');
  conditionButton(h,'workflowConditionApply').click();const rule=storedCondition(h);assert.equal(rule.operator,operator);
  if(operator==='EXISTS')assert.equal(Object.hasOwn(rule,'value'),false);
  assert.equal(evaluateWorkflowCondition(rule,{survey:{}}).status,'UNKNOWN');
  assert.equal(evaluateWorkflowCondition(rule,{survey:{view:{count:null}}}).status,'UNKNOWN');
  assert.equal(evaluateWorkflowCondition(rule,{survey:{view:{count:3}}}).status,({EQ:'FAIL',NE:'PASS',GT:'PASS',GTE:'PASS',LT:'FAIL',LTE:'FAIL',EXISTS:'PASS'})[operator]);
 }
 assert.equal(writes(h).length,0);
});

test('typed condition values preserve strings, negative decimals, booleans and null without coercing facts',async()=>{
 const h=await conditionPage();
 for(const [type,value,expected]of [['string','9007199254740995','9007199254740995'],['number','-1.25',-1.25],['number','1e3',1000],['boolean','false',false],['boolean','true',true],['null','',null],['string','','']]){
  conditionField(h,'operator').value='EQ';conditionField(h,'operator').onchange();conditionField(h,'valueType').value=type;conditionField(h,'valueType').onchange();
  conditionField(h,'value').value=value;conditionField(h,'boolean').value=value;conditionButton(h,'workflowConditionApply').click();
  const rule=storedCondition(h);assert.deepEqual(rule.value,expected);assert.equal(evaluateWorkflowCondition(rule,{survey:{view:{count:expected}}}).status,'PASS');
  if(type==='string'&&value)assert.equal(evaluateWorkflowCondition(rule,{survey:{view:{count:Number(value)}}}).status,'UNKNOWN');
 }
 assert.equal(writes(h).length,0);
});

test('condition path fields preserve literal keys, enforce original depth and reject forbidden or missing paths atomically',async()=>{
 const h=await conditionPage('RULE',{source:'run',path:['literal.key'],operator:'EXISTS'});
 conditionField(h,'path').value='literal.key';conditionButton(h,'workflowConditionApply').click();assert.deepEqual(storedCondition(h).path,['literal.key']);assert.equal(evaluateWorkflowCondition(storedCondition(h),{run:{'literal.key':0}}).status,'PASS');
 for(let i=1;i<WORKFLOW_CONDITION_FIELDS.maxDepth;i++)conditionButton(h,'workflowConditionPathAdd').click();
 let fields=conditionFields(h,'path');assert.equal(fields.length,8);assert.equal(conditionButton(h,'workflowConditionPathAdd').disabled,true);conditionButton(h,'workflowConditionPathAdd').click();assert.equal(conditionFields(h,'path').length,8);
 fields.forEach((field,i)=>field.value='key'+i);conditionButton(h,'workflowConditionApply').click();assert.equal(storedCondition(h).path.length,8);
 for(const key of ['', ' ', '__proto__','constructor','request','TOKEN']){
  conditionField(h,'path').value=key;const source=h.node('wf-json').value;conditionButton(h,'workflowConditionApply').click();assert.equal(h.node('wf-json').value,source,key);
 }
 assert.equal(writes(h).length,0);
});

test('invalid scalar comparisons leave the original condition and graph intact',async()=>{
 const h=await conditionPage();
 for(const input of ['', 'Infinity','NaN','1e309','9007199254740993','"3"','true','null','[]','{}','0x10']){
  conditionField(h,'valueType').value='number';conditionField(h,'valueType').onchange();conditionField(h,'value').value=input;const source=h.node('wf-json').value;conditionButton(h,'workflowConditionApply').click();assert.equal(h.node('wf-json').value,source,input);
 }
 conditionField(h,'valueType').value='string';conditionField(h,'value').value='a'.repeat(2001);const source=h.node('wf-json').value;conditionButton(h,'workflowConditionApply').click();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('condition path removal and advanced JSON edits stay compatible with the original node editor',async()=>{
 const h=await conditionPage();
 const remove=descendants(h.node('wf-nodes')).find(n=>n.dataset.conditionPathRemove==='1');remove.click();assert.equal(conditionFields(h,'path').length,1);conditionButton(h,'workflowConditionApply').click();assert.deepEqual(storedCondition(h).path,['view']);
 const advanced=descendants(h.node('wf-nodes')).find(n=>n.tagName==='textarea'),rule={source:'run',path:['actions','0','result'],operator:'EQ',value:'SUCCESS'};advanced.value=JSON.stringify(rule);advanced.onchange();assert.deepEqual(storedCondition(h),rule);assert.deepEqual(conditionFields(h,'path').map(n=>n.value),rule.path);assert.equal(conditionField(h,'source').value,'run');
 assert.equal(writes(h).length,0);
});

test('condition VERIFY can explicitly return to original successful-history verification without removing its module',async()=>{
 const h=await conditionPage('VERIFY');conditionButton(h,'workflowConditionClear').click();const node=conditionGraph(h).nodes.find(n=>n.id==='check');assert.equal(Object.hasOwn(node,'condition'),false);assert.equal(node.module,'free-gold');assert.equal(conditionButton(h,'workflowConditionClear').disabled,true);assert.equal(writes(h).length,0);
});

test('condition drafts reject detached graph and account callbacks and lock while existing Workflow is pending or running',async()=>{
 const h=await conditionPage(),old=conditionButton(h,'workflowConditionApply'),before=h.node('wf-json').value;
 const reading=h.node('wf-load').click();assert.equal(old.disabled,true);old.click();assert.equal(h.node('wf-json').value,before);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;assert.equal(old.disabled,true);old.click();assert.equal(h.node('wf-json').value,before);
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;
 const replacement=conditionGraph(h);replacement.nodes.find(n=>n.id==='check').condition.value=5;h.node('wf-json').value=JSON.stringify(replacement);h.node('wf-json-apply').click();old.click();assert.equal(storedCondition(h).value,5);
 const detached=conditionButton(h,'workflowConditionApply');h.run("selectAccount('B');selectAccount('A')");const current=h.node('wf-json').value;old.click();detached.click();assert.equal(h.node('wf-json').value,current);assert.equal(writes(h).length,0);
});


test('condition source and boolean inputs reject unsupported selections and path callbacks expire when detached',async()=>{
 const h=await conditionPage(),source=h.node('wf-json').value;
 conditionField(h,'source').value='forged';conditionButton(h,'workflowConditionApply').click();assert.equal(h.node('wf-json').value,source);
 conditionField(h,'source').value='run';conditionField(h,'valueType').value='boolean';conditionField(h,'valueType').onchange();conditionField(h,'boolean').value='1';conditionButton(h,'workflowConditionApply').click();assert.equal(h.node('wf-json').value,source);
 const old=descendants(h.node('wf-nodes')).find(n=>n.dataset.conditionPathRemove==='1');old.click();conditionButton(h,'workflowConditionPathAdd').click();assert.equal(conditionFields(h,'path').length,2);old.click();assert.equal(conditionFields(h,'path').length,2);assert.equal(writes(h).length,0);
});

test('EXISTS preserves the original empty-string and zero semantics and condition paths remain literal DOM values',async()=>{
 const literal='<img onerror=alert(1)>',h=await conditionPage('CONDITION',{source:'survey',path:[literal],operator:'EXISTS'});
 conditionButton(h,'workflowConditionApply').click();const rule=storedCondition(h);assert.deepEqual(rule.path,[literal]);
 for(const value of ['',0,false,{}])assert.equal(evaluateWorkflowCondition(rule,{survey:{[literal]:value}}).status,'PASS');
 assert.equal(evaluateWorkflowCondition(rule,{survey:{[literal]:null}}).status,'UNKNOWN');assert.ok(descendants(h.node('wf-nodes')).every(n=>n.tagName!=='img'));assert.equal(writes(h).length,0);
});


async function parameterPage(module='pet',parameters={},type='ACTION') {
 const h=await unifiedForm(),graph={version:1,id:'parameter-form',name:'业务参数表单',nodes:[{id:'start',type:'START'},{id:'business',type,module,parameters,...(type==='ACTION'?{selection:{actionId:'exact-action'}}:{})},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'business'},{from:'business',to:'stop'}]};
 h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();return h;
}
const parameterControl=(h,key,control='value')=>descendants(h.node('wf-nodes')).find(n=>n.dataset.workflowParameter==='business'&&n.dataset.parameterField===key&&n.dataset.parameterControl===control);
const parameterApply=h=>descendants(h.node('wf-nodes')).find(n=>n.dataset.workflowParameterApply==='business');
const businessNode=h=>conditionGraph(h).nodes.find(n=>n.id==='business');
function parameterSet(h,key,value,{type,enabled=true}={}) {
 const include=parameterControl(h,key,'enabled');assert.ok(include,key);include.checked=enabled;include.onchange();
 if(type){const select=parameterControl(h,key,'type');select.value=type;select.onchange();}
 if(value!==undefined)parameterControl(h,key).value=value;
}

test('Workflow parameter form creates explicit Pet feed including queue zero and preserves precise mail UID strings',async()=>{
 const pet=await parameterPage();const before=pet.node('wf-json').value;parameterSet(pet,'action',JSON.stringify('feed'));parameterSet(pet,'buildingId','1宠物培育室');parameterSet(pet,'jobIdx','0');
 assert.equal(pet.node('wf-json').value,before);parameterApply(pet).click();assert.deepEqual(businessNode(pet).parameters,{action:'feed',buildingId:'1宠物培育室',jobIdx:0});assert.equal(businessNode(pet).selection.actionId,'exact-action');assert.equal(writes(pet).length,0);
 const mail=await parameterPage('mail',{},'SURVEY');parameterSet(mail,'action',JSON.stringify('claim'));parameterSet(mail,'pageNo','0');parameterSet(mail,'emailId','9007199254740995');parameterApply(mail).click();assert.deepEqual(businessNode(mail).parameters,{action:'claim',pageNo:0,emailId:'9007199254740995'});assert.equal(writes(mail).length,0);
});

test('parameter fields preserve omitted values separately from zero, false and empty text',async()=>{
 const h=await parameterPage('equipment-forge');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{});
 parameterSet(h,'allowUniversal','false');parameterSet(h,'buildingId','');parameterSet(h,'makeId','0');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{allowUniversal:false,buildingId:'',makeId:0});
 parameterSet(h,'allowUniversal',undefined,{enabled:false});parameterSet(h,'buildingId',undefined,{enabled:false});parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{makeId:0});assert.equal(writes(h).length,0);
});

test('primitive forms retain existing formation arrays and nested fields exactly while changing only explicit scalars',async()=>{
 const parameters={presetId:1,heroIds:['A','B'],heroPositions:[{heroId:'A',pos:{x:1,y:2}}],extra:{keep:['exact',0,false]}},h=await parameterPage('formation',parameters);
 parameterSet(h,'presetId','2');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{...parameters,presetId:2});assert.equal(nestedControl(h,'heroPositions',['pos','x'],'nested-value',0).value,'1');assert.equal(writes(h).length,0);
});

test('union types keep large decimal identities as text and reject overflowing integer input atomically',async()=>{
 const h=await parameterPage('naval',{playerId:'9007199254740995',minimumPower:'18446744073709551615',screenCenter:{x:0,y:0}});
 assert.equal(parameterControl(h,'playerId','type').value,'string');parameterSet(h,'maximumPower','9007199254740993',{type:'string'});parameterApply(h).click();assert.equal(businessNode(h).parameters.maximumPower,'9007199254740993');assert.equal(businessNode(h).parameters.playerId,'9007199254740995');
 parameterSet(h,'playerId','9007199254740993',{type:'integer'});const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source);
 parameterSet(h,'playerId','7',{type:'integer'});parameterApply(h).click();assert.equal(businessNode(h).parameters.playerId,7);assert.deepEqual(businessNode(h).parameters.screenCenter,{x:0,y:0});assert.equal(writes(h).length,0);
});

test('invalid primitive values never partially apply earlier valid fields or fake domain eligibility',async()=>{
 const h=await parameterPage('pet',{action:'feed',buildingId:'original',jobIdx:0});
 for(const value of ['','1.5','1e309','NaN','Infinity','9007199254740993','true','"1"','[]','{}']){
  parameterSet(h,'buildingId','changed');parameterSet(h,'jobIdx',value);const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source,value);
 }
 parameterSet(h,'action',JSON.stringify('breed'));parameterSet(h,'jobIdx','1');const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('primitive choices never offer a D6 premium operation as an enabled option and cannot apply it',async()=>{
 const h=await parameterPage('museum',{payment:'ITEM'}),input=parameterControl(h,'payment'),premium=input.children.find(n=>n.value===JSON.stringify('PREMIUM'));assert.equal(premium.disabled,true);
 parameterSet(h,'payment',JSON.stringify('PREMIUM'));const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source);assert.match(h.node('wf-nodes').textContent,/该业务值未开放/);assert.equal(writes(h).length,0);
});

test('parameter changes discard only the node candidate cache and preserve explicit action identity until a fresh plan',async()=>{
 const h=await parameterPage('free-gold'),load=descendants(h.node('wf-nodes')).find(n=>n.dataset.workflowCandidate==='business');
 const reading=load.click();await tick();h.respond('/api/gameplay/survey',data(cases.find(s=>s.module==='free-gold')));await reading;
 assert.ok(descendants(h.node('wf-nodes')).some(n=>n.dataset.workflowSelection==='business'));parameterApply(h).click();assert.equal(descendants(h.node('wf-nodes')).some(n=>n.dataset.workflowSelection==='business'),false);assert.equal(businessNode(h).selection.actionId,'exact-action');assert.equal(writes(h).length,1);assert.equal(writes(h,'/api/operations/plan').length,0);
});

test('advanced parameter editor remains usable and refreshes the primitive form without overriding typed values',async()=>{
 const h=await parameterPage('mail',{action:'read',pageNo:0,emailId:'9007199254740995'}),old=parameterApply(h);
 const advanced=descendants(h.node('wf-nodes')).find(n=>n.tagName==='textarea'),next={action:'claim',pageNo:3,emailId:'9007199254740997'};advanced.value=JSON.stringify(next);advanced.onchange();old.click();
 assert.deepEqual(businessNode(h).parameters,next);assert.equal(parameterControl(h,'pageNo').value,'3');assert.equal(parameterControl(h,'emailId').value,'9007199254740997');assert.equal(writes(h).length,0);
});

test('parameter form locks during existing Workflow requests and running status and invalidates old account and graph callbacks',async()=>{
 const h=await parameterPage(),old=parameterApply(h),source=h.node('wf-json').value,reading=h.node('wf-load').click();assert.equal(old.disabled,true);old.click();assert.equal(h.node('wf-json').value,source);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;assert.equal(old.disabled,true);
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;assert.equal(old.disabled,false);
 const graph=conditionGraph(h);graph.nodes.find(n=>n.id==='business').parameters={action:'feed',jobIdx:1,buildingId:'new'};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();old.click();assert.equal(businessNode(h).parameters.buildingId,'new');
 const current=parameterApply(h);h.run("selectAccount('B');selectAccount('A')");const reset=h.node('wf-json').value;old.click();current.click();assert.equal(h.node('wf-json').value,reset);assert.equal(writes(h).length,0);
});

test('switching a node module rerenders parameter choices and rejects retained callbacks from its former contract',async()=>{
 const h=await parameterPage('mail',{action:'read',pageNo:0,emailId:'exact'}),old=parameterApply(h),module=descendants(h.node('wf-nodes')).find(n=>n.tagName==='select'&&n.children.some(c=>c.value==='mail')&&n.children.some(c=>c.value==='pet'));
 module.value='pet';module.onchange();assert.ok(parameterControl(h,'jobIdx'));assert.equal(parameterControl(h,'emailId'),undefined);const source=h.node('wf-json').value;old.click();assert.equal(h.node('wf-json').value,source);assert.equal(businessNode(h).module,'pet');assert.equal(writes(h).length,0);
});


test('parameter forms feed real Pet and mail adapters while domain cross-field rules remain authoritative',async()=>{
 const pet=await parameterPage();parameterSet(pet,'action',JSON.stringify('feed'));parameterSet(pet,'buildingId','1宠物培育室');parameterSet(pet,'jobIdx','0');parameterApply(pet).click();
 assert.equal(validateWorkflow(conditionGraph(pet),{modules:{pet:GAMEPLAY_MODULES.pet}}).valid,true);
 parameterSet(pet,'jobIdx','-1');parameterApply(pet).click();assert.throws(()=>validateWorkflow(conditionGraph(pet),{modules:{pet:GAMEPLAY_MODULES.pet}}),/jobIdx/);assert.equal(writes(pet).length,0);
 const mail=await parameterPage('mail');parameterSet(mail,'pageNo','0');parameterSet(mail,'action',JSON.stringify('claim'));parameterSet(mail,'emailId','9007199254740995');parameterApply(mail).click();
 assert.equal(validateWorkflow(conditionGraph(mail),{modules:{mail:GAMEPLAY_MODULES.mail}}).valid,true);
 parameterSet(mail,'emailId',undefined,{enabled:false});parameterApply(mail).click();assert.throws(()=>validateWorkflow(conditionGraph(mail),{modules:{mail:GAMEPLAY_MODULES.mail}}),/同时指定/);assert.equal(writes(mail).length,0);
});


test('integer parameter input refuses rounding decimals, exponent and whitespace spellings',async()=>{
 const h=await parameterPage('pet',{action:'feed',buildingId:'1宠物培育室',jobIdx:0});
 for(const value of ['1.0000000000000001','1e3',' 1','1 ','01','+1']){
  parameterSet(h,'jobIdx',value);const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source,value);
 }
 assert.equal(writes(h).length,0);
});
test('legacy node modules without a static parameter schema keep their existing JSON editor',async()=>{
 const h=await parameterPage('fixture',{targetId:'exact'}),editor=descendants(h.node('wf-nodes')).find(n=>n.tagName==='textarea');assert.ok(editor);editor.value=JSON.stringify({targetId:'edited'});editor.onchange();assert.deepEqual(businessNode(h).parameters,{targetId:'edited'});assert.equal(writes(h).length,0);
});

const parameterListControls=(h,key,control)=>descendants(h.node('wf-nodes')).filter(n=>n.dataset.workflowParameter==='business'&&n.dataset.parameterField===key&&n.dataset.parameterControl===control);
const parameterListButton=(h,key,control,index)=>parameterListControls(h,key,control).find(n=>index===undefined||n.dataset.parameterIndex===String(index));
function parameterListAdd(h,key,value,type) {
 const include=parameterControl(h,key,'enabled');include.checked=true;include.onchange();parameterListButton(h,key,'add').click();
 const inputs=parameterListControls(h,key,'item'),input=inputs.at(-1);if(type){const kind=parameterListControls(h,key,'item-type').at(-1);kind.value=type;kind.onchange();}input.value=value;
}

test('Workflow list form preserves precise mixed alliance identities and applies drafts only on explicit apply',async()=>{
 const original={memberIds:['9007199254740995',7,{low:-1,high:1,unsigned:true}],reqIds:[],itemIds:['<img onerror=alert(1)>']},h=await parameterPage('alliance',original),before=h.node('wf-json').value;
 parameterListAdd(h,'memberIds','9007199254740997','string');parameterListAdd(h,'reqIds','0','integer');
 assert.equal(h.node('wf-json').value,before);parameterApply(h).click();
 assert.deepEqual(businessNode(h).parameters,{...original,memberIds:[...original.memberIds,'9007199254740997'],reqIds:[0]});
 assert.ok(descendants(h.node('wf-nodes')).every(n=>n.tagName!=='img'));assert.equal(writes(h).length,0);
});

test('list fields keep omitted, enabled empty and explicitly removed declarations distinct',async()=>{
 const h=await parameterPage('formation',{presetId:1});assert.equal(parameterControl(h,'heroIds','enabled').checked,false);
 parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{presetId:1});
 parameterControl(h,'heroIds','enabled').checked=true;parameterControl(h,'heroIds','enabled').onchange();parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{presetId:1,heroIds:[]});
 parameterListAdd(h,'heroIds','A');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.heroIds,['A']);
 parameterControl(h,'heroIds','enabled').checked=false;parameterControl(h,'heroIds','enabled').onchange();assert.equal(parameterListButton(h,'heroIds','add').disabled,true);parameterApply(h).click();assert.equal(Object.hasOwn(businessNode(h).parameters,'heroIds'),false);assert.equal(writes(h).length,0);
});

test('list reorder and removal preserve current text and type while detached row callbacks cannot edit replacements',async()=>{
 const h=await parameterPage('naval',{excludeGuildIds:['old',2,'last']});
 parameterListControls(h,'excludeGuildIds','item')[0].value='9007199254740995';const stale=parameterListButton(h,'excludeGuildIds','remove',0);
 parameterListButton(h,'excludeGuildIds','down',0).click();stale.click();assert.equal(parameterListControls(h,'excludeGuildIds','item').length,3);
 assert.deepEqual(parameterListControls(h,'excludeGuildIds','item').map(n=>n.value),['2','9007199254740995','last']);
 assert.deepEqual(parameterListControls(h,'excludeGuildIds','item-type').map(n=>n.value),['integer','string','string']);
 parameterListButton(h,'excludeGuildIds','up',2).click();parameterListButton(h,'excludeGuildIds','remove',0).click();parameterApply(h).click();
 assert.deepEqual(businessNode(h).parameters.excludeGuildIds,['last','9007199254740995']);assert.equal(writes(h).length,0);
});

test('invalid list integers or forged types abort all parameter changes without rounding or partial apply',async()=>{
 const h=await parameterPage('naval',{cityIds:[1],playerId:'exact'});
 for(const value of ['', '1.0000000000000001','1e3',' 1','01','+1','9007199254740993','NaN','true']){
  parameterSet(h,'playerId','changed',{type:'string'});parameterListControls(h,'cityIds','item')[0].value=value;const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source,value);
 }
 parameterListControls(h,'cityIds','item')[0].value='2';parameterListAdd(h,'excludeGuildIds','7','string');parameterListControls(h,'excludeGuildIds','item-type')[0].value='object';const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('list controls retain opaque Long objects through reorder and only remove them explicitly',async()=>{
 const exact={low:-1,high:2147483647,unsigned:false},h=await parameterPage('alliance',{reqIds:[exact,'7']});
 assert.equal(parameterListControls(h,'reqIds','item').length,1);parameterListButton(h,'reqIds','down',0).click();parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.reqIds,['7',exact]);
 parameterListButton(h,'reqIds','remove',1).click();parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.reqIds,['7']);assert.equal(writes(h).length,0);
});

test('existing malformed arrays and unsupported entries remain visible and unchanged for original validation',async()=>{
 const h=await parameterPage('naval',{cityIds:'wrong-shape',excludeGuildIds:[{unexpected:'keep'},null]});
 assert.equal(parameterListButton(h,'cityIds','add'),undefined);parameterSet(h,'playerId','7',{type:'string'});parameterApply(h).click();
 assert.deepEqual(businessNode(h).parameters,{cityIds:'wrong-shape',excludeGuildIds:[{unexpected:'keep'},null],playerId:'7'});
 assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:{naval:GAMEPLAY_MODULES.naval}}));assert.equal(writes(h).length,0);
});

test('list editor respects the existing hundred-item Function limit without dropping original oversized values',async()=>{
 const ids=Array.from({length:100},(_,i)=>'hero-'+i),h=await parameterPage('formation',{presetId:1,heroIds:ids});
 assert.equal(parameterListButton(h,'heroIds','add').disabled,true);parameterListButton(h,'heroIds','add').click();assert.equal(parameterListControls(h,'heroIds','item').length,100);
 parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.heroIds,ids);
 const oversized=await parameterPage('formation',{heroIds:[...ids,'overflow']});parameterSet(oversized,'presetId','2');const source=oversized.node('wf-json').value;parameterApply(oversized).click();assert.equal(oversized.node('wf-json').value,source);
 assert.equal(writes(h).length,0);assert.equal(writes(oversized).length,0);
});

test('list form uses production alliance identity normalization and rejects duplicate aliases without weakening domain validation',async()=>{
 const h=await parameterPage('alliance');parameterListAdd(h,'memberIds','9007199254740995','string');parameterListAdd(h,'reqIds','7','integer');parameterListAdd(h,'itemIds','wood');
 parameterApply(h).click();assert.equal(validateWorkflow(conditionGraph(h),{modules:{alliance:GAMEPLAY_MODULES.alliance}}).valid,true);
 parameterListAdd(h,'reqIds','7','string');parameterApply(h).click();assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:{alliance:GAMEPLAY_MODULES.alliance}}),/联盟身份无效或重复/);assert.equal(writes(h).length,0);
});

test('list edits invalidate original candidates but preserve nested formation objects and exact action selection',async()=>{
 const positions=[{heroId:'A',pos:{x:0,y:2}}],h=await parameterPage('formation',{presetId:1,heroIds:['A'],heroPositions:positions});
 const reading=descendants(h.node('wf-nodes')).find(n=>n.dataset.workflowCandidate==='business').click();await tick();h.respond('/api/gameplay/survey',{accountId:'A',module:'formation',view:{candidates:[{actionId:'exact-action',actionType:'SAVE',parameters:{presetId:1,heroIds:['A'],heroPositions:positions},costs:[],executable:true}]}});await reading;
 assert.ok(descendants(h.node('wf-nodes')).some(n=>n.dataset.workflowSelection==='business'));parameterListAdd(h,'heroIds','B');parameterApply(h).click();
 assert.deepEqual(businessNode(h).parameters.heroPositions,positions);assert.deepEqual(businessNode(h).parameters.heroIds,['A','B']);assert.equal(businessNode(h).selection.actionId,'exact-action');assert.equal(descendants(h.node('wf-nodes')).some(n=>n.dataset.workflowSelection==='business'),false);assert.equal(writes(h,'/api/operations/plan').length,0);
});

test('list add and row callbacks lock during Workflow requests and running status then expire across graph or account replacement',async()=>{
 const h=await parameterPage('alliance',{reqIds:['7']}),add=parameterListButton(h,'reqIds','add'),remove=parameterListButton(h,'reqIds','remove',0),apply=parameterApply(h);
 const reading=h.node('wf-load').click();assert.equal(add.disabled,true);assert.equal(remove.disabled,true);add.click();remove.click();assert.equal(parameterListControls(h,'reqIds','item').length,1);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;assert.equal(add.disabled,true);
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;
 const advanced=descendants(h.node('wf-nodes')).find(n=>n.tagName==='textarea');advanced.value=JSON.stringify({reqIds:['new']});advanced.onchange();add.click();remove.click();apply.click();assert.deepEqual(businessNode(h).parameters.reqIds,['new']);assert.equal(parameterListControls(h,'reqIds','item').length,1);
 const currentAdd=parameterListButton(h,'reqIds','add');h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-json').value;currentAdd.click();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

const nestedControls=(h,key,path,control='nested-value',index)=>parameterListControls(h,key,control).filter(n=>n.dataset.parameterPath===JSON.stringify(path)&&(index===undefined||n.dataset.parameterIndex===String(index)));
const nestedControl=(h,key,path,control='nested-value',index)=>nestedControls(h,key,path,control,index)[0];
function nestedSet(h,key,path,value,{type,enabled=true,index}={}) {
 const include=nestedControl(h,key,path,'nested-enabled',index);assert.ok(include,key+':'+path);include.checked=enabled;include.onchange();
 if(type){const select=nestedControl(h,key,path,'nested-type',index);assert.ok(select);select.value=type;select.onchange();}
 if(value!==undefined)nestedControl(h,key,path,'nested-value',index).value=value;
}
function parameterEnable(h,key) {const input=parameterControl(h,key,'enabled');input.checked=true;input.onchange();}

test('structured Workflow parameters author explicit formation positions and reuse production domain validation',async()=>{
 const h=await parameterPage('formation',{presetId:1});parameterEnable(h,'heroPositions');parameterListButton(h,'heroPositions','add').click();
 nestedSet(h,'heroPositions',['heroId'],'A',{index:0});nestedSet(h,'heroPositions',['pos'],undefined,{index:0});nestedSet(h,'heroPositions',['pos','x'],'0',{index:0});nestedSet(h,'heroPositions',['pos','y'],'-1',{index:0});
 const before=h.node('wf-json').value;assert.deepEqual(businessNode(h).parameters,{presetId:1});parameterApply(h).click();assert.notEqual(h.node('wf-json').value,before);
 assert.deepEqual(businessNode(h).parameters,{presetId:1,heroPositions:[{heroId:'A',pos:{x:0,y:-1}}]});assert.equal(validateWorkflow(conditionGraph(h),{modules:{formation:GAMEPLAY_MODULES.formation}}).valid,true);assert.equal(writes(h).length,0);
});

test('nested coordinate fields preserve missing separately from zero and never infer required fields',async()=>{
 const h=await parameterPage('naval');parameterEnable(h,'screenCenter');nestedSet(h,'screenCenter',['x'],'0');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.screenCenter,{x:0});
 assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:{naval:GAMEPLAY_MODULES.naval}}));
 nestedSet(h,'screenCenter',['y'],'0');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.screenCenter,{x:0,y:0});
 nestedSet(h,'screenCenter',['x'],undefined,{enabled:false});parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.screenCenter,{y:0});assert.equal(writes(h).length,0);
});

test('nested stage settings retain false, explicit null and optional absence with original typed semantics',async()=>{
 const h=await parameterPage('stage');parameterEnable(h,'config');
 nestedSet(h,'config',['enabled'],'false');nestedSet(h,'config',['retryDelaySeconds'],'0');nestedSet(h,'config',['maxAttempts'],undefined,{type:'null'});nestedSet(h,'config',['maxStage'],'0',{type:'integer'});nestedSet(h,'config',['stopOnDefeat'],'true');
 nestedSet(h,'config',['interStageDelay'],undefined);nestedSet(h,'config',['interStageDelay','minSeconds'],'0');nestedSet(h,'config',['interStageDelay','maxSeconds'],'1.5');
 nestedSet(h,'config',['formation'],undefined);nestedSet(h,'config',['formation','enabled'],'false');nestedSet(h,'config',['formation','presetId'],undefined,{type:'null'});
 parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{config:{enabled:false,retryDelaySeconds:0,maxAttempts:null,maxStage:0,stopOnDefeat:true,interStageDelay:{minSeconds:0,maxSeconds:1.5},formation:{enabled:false,presetId:null}}});
 nestedSet(h,'config',['maxAttempts'],undefined,{enabled:false});nestedSet(h,'config',['formation'],undefined,{enabled:false});parameterApply(h).click();assert.equal(Object.hasOwn(businessNode(h).parameters.config,'maxAttempts'),false);assert.equal(Object.hasOwn(businessNode(h).parameters.config,'formation'),false);assert.equal(writes(h).length,0);
});

test('nested value errors abort all scalar, list and object parameter mutations atomically',async()=>{
 const parameters={presetId:1,heroPositions:[{heroId:'A',pos:{x:0,y:1}}]},h=await parameterPage('formation',parameters);
 for(const value of ['','1e3','1.0000000000000001','9007199254740993',' 1','true','null']){
  parameterSet(h,'presetId','2');nestedSet(h,'heroPositions',['heroId'],'changed',{index:0});nestedSet(h,'heroPositions',['pos','x'],value,{index:0});
  const source=h.node('wf-json').value;parameterApply(h).click();assert.equal(h.node('wf-json').value,source,value);assert.deepEqual(businessNode(h).parameters,parameters);
 }assert.equal(writes(h).length,0);
});

test('object list ordering preserves raw incomplete drafts without forcing parse and removed row callbacks expire',async()=>{
 const h=await parameterPage('formation',{heroPositions:[{heroId:'A',pos:{x:0,y:1}},{heroId:'B',pos:{x:1,y:2}}]});
 nestedSet(h,'heroPositions',['pos','x'],'invalid',{index:0});parameterListButton(h,'heroPositions','down',0).click();assert.equal(nestedControl(h,'heroPositions',['pos','x'],'nested-value',1).value,'invalid');
 parameterListButton(h,'heroPositions','add').click();assert.equal(parameterListControls(h,'heroPositions','remove').length,3);assert.equal(nestedControl(h,'heroPositions',['pos','x'],'nested-value',1).value,'invalid');
 const removed=parameterListButton(h,'heroPositions','remove',1);removed.click();removed.click();assert.equal(parameterListControls(h,'heroPositions','remove').length,2);
 parameterListButton(h,'heroPositions','remove',1).click();parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.heroPositions,[{heroId:'B',pos:{x:1,y:2}}]);assert.equal(writes(h).length,0);
});

test('nested object edits preserve unknown original fields and malformed original leaves for existing validator',async()=>{
 const original={screenCenter:{x:0,y:1,extra:{keep:[false,'9007199254740995']}},cityIds:[1]},h=await parameterPage('naval',original);
 nestedSet(h,'screenCenter',['x'],'2');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{...original,screenCenter:{...original.screenCenter,x:2}});
 const malformed=await parameterPage('formation',{heroPositions:[{heroId:42,pos:{x:'wrong',y:0},opaque:[7]},'legacy-null']});parameterApply(malformed).click();assert.deepEqual(businessNode(malformed).parameters,{heroPositions:[{heroId:42,pos:{x:'wrong',y:0},opaque:[7]},'legacy-null']});
 assert.throws(()=>validateWorkflow(conditionGraph(malformed),{modules:{formation:GAMEPLAY_MODULES.formation}}));assert.equal(writes(h).length,0);assert.equal(writes(malformed).length,0);
});

test('structured inputs never resolve conflicting hero lists or duplicate formation positions automatically',async()=>{
 const h=await parameterPage('formation',{presetId:1,heroPositions:[{heroId:'A',pos:{x:0,y:0}}]});parameterListAdd(h,'heroIds','A');parameterApply(h).click();
 assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:{formation:GAMEPLAY_MODULES.formation}}),/不能同时提供/);
 parameterControl(h,'heroIds','enabled').checked=false;parameterControl(h,'heroIds','enabled').onchange();parameterListButton(h,'heroPositions','add').click();nestedSet(h,'heroPositions',['heroId'],'B',{index:1});nestedSet(h,'heroPositions',['pos'],undefined,{index:1});nestedSet(h,'heroPositions',['pos','x'],'0',{index:1});nestedSet(h,'heroPositions',['pos','y'],'0',{index:1});parameterApply(h).click();
 assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:{formation:GAMEPLAY_MODULES.formation}}),/不能重复/);
 nestedSet(h,'heroPositions',['pos','y'],'1',{index:1});parameterApply(h).click();assert.equal(validateWorkflow(conditionGraph(h),{modules:{formation:GAMEPLAY_MODULES.formation}}).valid,true);assert.equal(writes(h).length,0);
});

test('nested controls and object list buttons lock during running requests and stale graph or account handlers cannot apply',async()=>{
 const h=await parameterPage('formation',{heroPositions:[{heroId:'A',pos:{x:0,y:1}}]}),add=parameterListButton(h,'heroPositions','add'),remove=parameterListButton(h,'heroPositions','remove',0),apply=parameterApply(h),input=nestedControl(h,'heroPositions',['pos','x'],'nested-value',0);
 const reading=h.node('wf-load').click();assert.equal(add.disabled,true);assert.equal(input.disabled,true);add.click();remove.click();assert.equal(parameterListControls(h,'heroPositions','remove').length,1);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;assert.equal(input.disabled,true);
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;
 const advanced=descendants(h.node('wf-nodes')).find(n=>n.tagName==='textarea');advanced.value=JSON.stringify({heroPositions:[{heroId:'B',pos:{x:2,y:3}}]});advanced.onchange();add.click();remove.click();input.value='4';apply.click();assert.equal(businessNode(h).parameters.heroPositions[0].heroId,'B');
 const latest=parameterListButton(h,'heroPositions','add');h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-json').value;latest.click();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('object list uses the existing hundred-entry bound and renders identities as literal text',async()=>{
 const original=Array.from({length:100},(_,i)=>({heroId:'<img-'+i+'>',pos:{x:i,y:0}})),h=await parameterPage('formation',{heroPositions:original});
 assert.equal(parameterListButton(h,'heroPositions','add').disabled,true);parameterListButton(h,'heroPositions','add').click();assert.equal(parameterListControls(h,'heroPositions','remove').length,100);parameterApply(h).click();assert.deepEqual(businessNode(h).parameters.heroPositions,original);
 assert.ok(descendants(h.node('wf-nodes')).every(n=>!n.tagName.startsWith('img')));assert.equal(writes(h).length,0);
});

const workflowCard=(h,id)=>h.node('wf-nodes').children.find(card=>card.children.some(n=>n.tagName==='label'&&n.children.some(c=>c.tagName==='input'&&c.value===id)));
const workflowCardField=(h,id,label)=>workflowCard(h,id).children.find(n=>n.tagName==='label'&&n.textContent.startsWith(label+' ')).children.find(n=>['select','input'].includes(n.tagName));
const workflowCardButton=(h,id,label)=>workflowCard(h,id).children.find(n=>n.tagName==='button'&&n.textContent===label);
const workflowEdgeField=(h,index,label)=>h.node('wf-edges').children[index].children.find(n=>n.tagName==='label'&&n.textContent.startsWith(label+' ')).children.find(n=>n.tagName==='select');

test('detached node graph controls cannot rename, replace, move or remove nodes in a replacement graph',async()=>{
 const h=await parameterPage('mail',{action:'read',pageNo:0,emailId:'old'}),id=workflowCardField(h,'business','ID'),type=workflowCardField(h,'business','类型'),module=workflowCardField(h,'business','玩法'),remove=workflowCardButton(h,'business','删除节点及相关连线'),move=workflowCardButton(h,'business','上移'),json=descendants(workflowCard(h,'business')).find(n=>n.tagName==='textarea');
 const graph=conditionGraph(h);graph.nodes.find(n=>n.id==='business').parameters.emailId='replacement';h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();const source=h.node('wf-json').value;
 id.value='forged';id.onchange();type.value='STOP';type.onchange();module.value='pet';module.onchange();json.value='{}';json.onchange();remove.click();move.click();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('detached edge callbacks cannot change replacement branches or remove an edge by its former index',async()=>{
 const h=await parameterPage(),from=workflowEdgeField(h,0,'从'),to=workflowEdgeField(h,0,'到'),when=workflowEdgeField(h,0,'分支'),remove=h.node('wf-edges').children[0].children.find(n=>n.tagName==='button');
 const graph=conditionGraph(h);graph.edges=[{from:'start',to:'stop'},{from:'business',to:'stop'}];h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();const source=h.node('wf-json').value;
 from.value='business';from.onchange();to.value='start';to.onchange();when.value='FAIL';when.onchange();remove.click();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('node and edge controls from the previous account stay inert after selecting that account again',async()=>{
 const h=await parameterPage('mail',{pageNo:0}),id=workflowCardField(h,'business','ID'),remove=workflowCardButton(h,'business','删除节点及相关连线'),edge=h.node('wf-edges').children[0].children.find(n=>n.tagName==='button'),load=descendants(workflowCard(h,'business')).find(n=>n.dataset.workflowCandidate==='business');
 h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-json').value,requests=h.requests.length;id.value='forged';id.onchange();remove.click();edge.click();load.click();assert.equal(h.node('wf-json').value,source);assert.equal(h.requests.length,requests);
});

test('running and pending Workflows lock all graph mutation and candidate controls even when callbacks are invoked directly',async()=>{
 const h=await parameterPage('mail',{pageNo:0}),id=workflowCardField(h,'business','ID'),remove=workflowCardButton(h,'business','删除节点及相关连线'),json=descendants(workflowCard(h,'business')).find(n=>n.tagName==='textarea'),load=descendants(workflowCard(h,'business')).find(n=>n.dataset.workflowCandidate==='business'),edge=workflowEdgeField(h,0,'到');
 const reading=h.node('wf-load').click();for(const input of [id,remove,json,load,edge,h.node('wf-add'),h.node('wf-id'),h.node('wf-json')])assert.equal(input.disabled,true);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;
 const source=h.node('wf-json').value,requests=h.requests.length;id.value='forged';id.onchange();remove.click();json.value='{}';json.onchange();edge.value='start';edge.onchange();load.click();h.node('wf-add').click();h.node('wf-add-edge').click();h.node('wf-json-apply').click();h.node('wf-id').value='forged';h.node('wf-id').oninput();h.node('wf-name').value='forged';h.node('wf-name').oninput();assert.equal(h.node('wf-json').value,source);assert.equal(h.requests.length,requests);
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;assert.equal(id.disabled,false);id.value='renamed';id.onchange();assert.ok(conditionGraph(h).nodes.some(n=>n.id==='renamed'));assert.ok(conditionGraph(h).edges.some(e=>e.to==='renamed'));assert.equal(writes(h).length,0);
});

test('current graph move and delete controls operate on exact node identity and expire as soon as rerendered',async()=>{
 const h=await parameterPage(),move=workflowCardButton(h,'business','上移'),staleRemove=workflowCardButton(h,'business','删除节点及相关连线');move.click();assert.deepEqual(conditionGraph(h).nodes.map(n=>n.id),['business','start','stop']);const source=h.node('wf-json').value;move.click();staleRemove.click();assert.equal(h.node('wf-json').value,source);
 workflowCardButton(h,'business','删除节点及相关连线').click();assert.deepEqual(conditionGraph(h).nodes.map(n=>n.id),['start','stop']);assert.deepEqual(conditionGraph(h).edges,[]);assert.equal(writes(h).length,0);
});

test('current graph select fields reject forged choices without modifying the declaration',async()=>{
 const h=await parameterPage(),source=h.node('wf-json').value;
 for(const [label,value]of [['类型','FORGED'],['玩法','unregistered']]){const field=workflowCardField(h,'business',label);field.value=value;field.onchange();assert.equal(h.node('wf-json').value,source);}
 const branch=workflowEdgeField(h,0,'分支');branch.value='UNKNOWN';branch.onchange();assert.equal(h.node('wf-json').value,source);const target=workflowEdgeField(h,0,'到');target.value='missing';target.onchange();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('retained candidate load and selection callbacks cannot probe or select in a replaced graph',async()=>{
 const h=await parameterPage('free-gold'),load=descendants(workflowCard(h,'business')).find(n=>n.dataset.workflowCandidate==='business'),reading=load.click();await tick();h.respond('/api/gameplay/survey',data(cases.find(s=>s.module==='free-gold')));await reading;
 const select=descendants(workflowCard(h,'business')).find(n=>n.dataset.workflowSelection==='business'),newLoad=descendants(workflowCard(h,'business')).find(n=>n.dataset.workflowCandidate==='business'),graph=conditionGraph(h);graph.nodes.find(n=>n.id==='business').parameters={replacement:true};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();
 const source=h.node('wf-json').value,requests=h.requests.length;load.click();newLoad.click();select.value=cases.find(s=>s.module==='free-gold').actionId;select.onchange();assert.equal(h.node('wf-json').value,source);assert.equal(h.requests.length,requests);assert.equal(writes(h,'/api/operations/plan').length,0);
});

test('unified budget form uses the exact existing shared identity bound for resources, quotas and UID pairs',async()=>{
 const h=await unifiedForm(),id='A'.repeat(RUN_BUDGET_LIMITS.idLength),type='T'.repeat(RUN_BUDGET_LIMITS.idLength),requests=h.requests.length;
 unifiedBudget(h,'resources',id,'3');unifiedBudget(h,'quotas',id,'1');unifiedBudget(h,'uids',id,'',type);
 const draft=unifiedDraft(h).budget;assert.deepEqual(normalizeBudgetClaims(draft),draft);
 for(const [kind,value,num,uidType]of [['resources',id+'x','1',''],['quotas',id+'x','1',''],['uids',id+'x','','mail'],['uids','7','',type+'x']]){
  const source=h.node('wf-unified-intent').value;unifiedBudget(h,kind,value,num,uidType);assert.equal(h.node('wf-unified-intent').value,source,kind);
 }
 assert.equal(h.requests.length,requests);
});

test('unified budget text identities retain exact characters and original backend trimming restrictions',async()=>{
 const h=await unifiedForm(),id='界'.repeat(RUN_BUDGET_LIMITS.idLength),requests=h.requests.length;unifiedBudget(h,'resources',id,'1');assert.equal(unifiedDraft(h).budget.resources[0].id,id);assert.equal(normalizeBudgetClaims(unifiedDraft(h).budget).resources[0].id,id);
 for(const value of [' '+id,id+' ',id+'界']){const source=h.node('wf-unified-intent').value;unifiedBudget(h,'quotas',value,'1');assert.equal(h.node('wf-unified-intent').value,source);}assert.equal(h.requests.length,requests);
});

function graphBudgetEnable(h,enabled=true) {h.node('wf-budget-enabled').checked=enabled;h.node('wf-budget-enabled').onchange();}
function graphBudgetAdd(h,kind,id,num='',type='') {for(const [key,value]of Object.entries({kind,id,num,type}))h.node('wf-budget-'+key).value=value;h.node('wf-budget-kind').onchange();h.node('wf-budget-add').click();}
const graphBudgetRemove=(h,key)=>descendants(h.node('wf-budget-rows')).find(n=>n.dataset.workflowBudget===key);

test('current graph budget explicitly applies finite resources, quotas and exact UID limits without changing the unified declaration',async()=>{
 const h=await parameterPage('free-gold'),intent=h.node('wf-unified-intent').value,source=h.node('wf-json').value,requests=h.requests.length;
 assert.equal(h.node('wf-budget-enabled').checked,false);graphBudgetEnable(h);graphBudgetAdd(h,'resources','GOLD','7');graphBudgetAdd(h,'quotas','free-gold:reset:2000','1');graphBudgetAdd(h,'uids','9007199254740995','','mail');
 assert.equal(h.node('wf-json').value,source);assert.equal(h.node('wf-unified-intent').value,intent);h.node('wf-budget-apply').click();
 assert.deepEqual(conditionGraph(h).budget,{resources:[{id:'GOLD',num:7}],quotas:[{id:'free-gold:reset:2000',num:1}],uids:[{type:'mail',id:'9007199254740995'}]});assert.equal(h.node('wf-unified-intent').value,intent);assert.equal(h.requests.length,requests);
});

test('graph budget keeps old missing declaration distinct from an explicitly empty limit and removes only after apply',async()=>{
 const h=await parameterPage('free-gold');assert.equal(Object.hasOwn(conditionGraph(h),'budget'),false);assert.equal(h.node('wf-budget-add').disabled,true);
 h.node('wf-budget-apply').click();assert.equal(Object.hasOwn(conditionGraph(h),'budget'),false);
 graphBudgetEnable(h);h.node('wf-budget-apply').click();assert.deepEqual(conditionGraph(h).budget,{resources:[],quotas:[],uids:[]});
 graphBudgetEnable(h,false);assert.equal(Object.hasOwn(conditionGraph(h),'budget'),true);h.node('wf-budget-apply').click();assert.equal(Object.hasOwn(conditionGraph(h),'budget'),false);assert.equal(writes(h).length,0);
});

test('graph budget row controls reject detached removal and preserve drafts through ordinary node rerenders',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);graphBudgetAdd(h,'resources','GOLD','7');const old=graphBudgetRemove(h,'resources:0');graphBudgetAdd(h,'quotas','once','1');old.click();assert.ok(graphBudgetRemove(h,'resources:0'));
 const remove=graphBudgetRemove(h,'quotas:0');const id=workflowCardField(h,'business','ID');id.value='renamed';id.onchange();remove.click();assert.ok(graphBudgetRemove(h,'quotas:0'));
 h.node('wf-budget-apply').click();assert.deepEqual(conditionGraph(h).budget,{resources:[{id:'GOLD',num:7}],quotas:[{id:'once',num:1}],uids:[]});assert.equal(writes(h).length,0);
});

test('graph budget input failures never change the draft or existing graph and use shared identity bounds',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);graphBudgetAdd(h,'resources','GOLD','2');const source=h.node('wf-json').value,text=h.node('wf-budget-rows').textContent;
 for(const [kind,id,num,type]of [['resources','GOLD','1',''],['resources','wood','1e3',''],['resources','wood','9007199254740993',''],['resources',' wood','1',''],['quotas','x'.repeat(301),'1',''],['uids','7','',''],['uids','7','','x'.repeat(301)],['forged','wood','1','']]){
  graphBudgetAdd(h,kind,id,num,type);assert.equal(h.node('wf-json').value,source);assert.equal(h.node('wf-budget-rows').textContent,text);
 }
 const exact='x'.repeat(RUN_BUDGET_LIMITS.idLength);graphBudgetAdd(h,'uids',exact,'',exact);h.node('wf-budget-apply').click();assert.deepEqual(normalizeBudgetClaims(conditionGraph(h).budget),conditionGraph(h).budget);assert.equal(writes(h).length,0);
});

test('graph budget callbacks expire when the graph or account scope changes',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);graphBudgetAdd(h,'resources','GOLD','7');const oldApply=h.node('wf-budget-apply').onclick,oldAdd=h.node('wf-budget-add').onclick,oldEnable=h.node('wf-budget-enabled').onchange;
 const graph=conditionGraph(h);graph.budget={resources:[{id:'WOOD',num:5}],quotas:[],uids:[]};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();const source=h.node('wf-json').value;oldAdd();oldEnable();oldApply();assert.equal(h.node('wf-json').value,source);assert.match(h.node('wf-budget-rows').textContent,/WOOD/);assert.doesNotMatch(h.node('wf-budget-rows').textContent,/GOLD/);
 const currentApply=h.node('wf-budget-apply').onclick,currentAdd=h.node('wf-budget-add').onclick;h.run("selectAccount('B');selectAccount('A')");const reset=h.node('wf-json').value;currentAdd();currentApply();assert.equal(h.node('wf-json').value,reset);assert.equal(writes(h).length,0);
});

test('graph budget remains locked during pending and running execution and never changes a live parent allowance',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);graphBudgetAdd(h,'resources','GOLD','7');const apply=h.node('wf-budget-apply').onclick,add=h.node('wf-budget-add').onclick,remove=graphBudgetRemove(h,'resources:0'),source=h.node('wf-json').value;
 const reading=h.node('wf-load').click();for(const id of ['enabled','apply','add','kind','id','num'])assert.equal(h.node('wf-budget-'+id).disabled,true);apply();add();remove.click();assert.equal(h.node('wf-json').value,source);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;apply();add();remove.click();assert.equal(h.node('wf-json').value,source);
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;assert.equal(h.node('wf-budget-apply').disabled,false);h.node('wf-budget-apply').click();assert.equal(conditionGraph(h).budget.resources[0].num,7);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('malformed graph budgets keep original data and require advanced correction instead of silently replacing values',async()=>{
 for(const budget of [null,[],{resources:'unknown'},{resources:[],extra:{keep:'original'}}]){
  const h=await parameterPage('free-gold'),graph=conditionGraph(h);graph.budget=budget;h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();const source=h.node('wf-json').value;assert.equal(h.node('wf-budget-apply').disabled,true);h.node('wf-budget-add').click();h.node('wf-budget-apply').click();assert.equal(h.node('wf-json').value,source);assert.deepEqual(conditionGraph(h).budget,budget);assert.match(h.node('wf-budget-hint').textContent,/JSON/);assert.equal(writes(h).length,0);
 }
});

test('graph budget preserves original invalid row facts for the authoritative contract and escapes display text',async()=>{
 const h=await parameterPage('free-gold'),graph=conditionGraph(h),budget={resources:[{id:'<img onerror=alert(1)>',num:0,extra:'keep'}],uids:[{type:'mail',id:'9007199254740995'}]};graph.budget=budget;h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();h.node('wf-budget-apply').click();assert.deepEqual(conditionGraph(h).budget,{...budget,quotas:[]});assert.throws(()=>normalizeBudgetClaims(conditionGraph(h).budget));assert.ok(descendants(h.node('wf-budget-rows')).every(n=>n.tagName!=='img'));assert.equal(writes(h).length,0);
});

test('graph budget saves and simulates using the original Workflow API without issuing any execution request',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);graphBudgetAdd(h,'quotas','free-gold:reset:2000','1');graphBudgetAdd(h,'uids','2000:1','','free-gold');h.node('wf-budget-apply').click();const graph=conditionGraph(h);
 for(const action of ['save','simulate']){
  const request=h.node('wf-'+action).click();await tick();const pending=h.pending('/api/workflows/'+action);assert.ok(pending);assert.deepEqual(JSON.parse(pending.options.body).graph,graph);
  h.respond('/api/workflows/'+action,{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[graph],history:[],simulation:action==='simulate'?{valid:true,budget:graph.budget}:undefined});await request;
 }
 assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('current graph budget rows can be explicitly replaced without leaking to the old unified budget draft',async()=>{
 const h=await parameterPage('free-gold');unifiedBudget(h,'resources','GOLD','99');const unified=h.node('wf-unified-intent').value,graph=conditionGraph(h);graph.budget={resources:[{id:'GOLD',num:7}],quotas:[],uids:[]};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();
 graphBudgetRemove(h,'resources:0').click();graphBudgetAdd(h,'resources','GOLD','5');h.node('wf-budget-apply').click();assert.deepEqual(conditionGraph(h).budget.resources,[{id:'GOLD',num:5}]);assert.equal(h.node('wf-unified-intent').value,unified);assert.equal(writes(h).length,0);
});

function fleetEditorFacts() {
 const fleet=buildingId=>({buildingId,state:1,durability:100,maxDura:100,cityId:1,targetCityId:0,treasureLootUid:0,repairing:null,autoFight:{isOn:false,todayTimes:0}});
 return {config:{tables:{}},now:100,stockReliable:true,stock:new Map(),fleetReliable:true,fleets:[fleet('f1'),fleet('f2')],repairParams:new Map(),ships:[],cargoReliable:false,protocolReady:{FleetSaveFormationRequest:true},
 formationFacts:{buildingsReliable:true,heroesReliable:true,presetsReliable:true,buildings:[{buildingId:'f1',level:1,formation:{presetId:1,heroPositions:[{heroId:'hero-a',pos:{x:0,y:0}}]}},{buildingId:'f2',level:1,formation:{presetId:1,heroPositions:[{heroId:'hero-c',pos:{x:0,y:0}}]}}],ownedHeroIds:['hero-a','hero-b','hero-c'],unlockedPresetIds:[1],catalog:{reliable:true,maxHeroes:2,layouts:[{id:1,reliable:true,positions:[{x:0,y:0},{x:1,y:0}]},{id:2,reliable:true,positions:[{x:2,y:0}]}],heroes:['hero-a','hero-b','hero-c','hero-d'].map(heroId=>({heroId,career:'坦克',reliable:true}))}}};
}
const fleetEditorConfig={...GAMEPLAY_MODULES.fleet.defaultConfig,enabled:true,formation:true};
function fleetEditorData(facts=fleetEditorFacts(),parameters={}) {return {accountId:'A',module:'fleet',csrfToken:'synthetic-csrf-A',config:fleetEditorConfig,status:{running:false,blocked:false},functions:[],view:fleetView(facts,{moduleConfig:fleetEditorConfig,parameters})};}
async function fleetEditorPage(data=fleetEditorData()) {const h=await boot(),load=h.node('gp-fleet-load').click();h.respond('/api/gameplay',data,{module:'fleet'});await load;return h;}
const fleetEditorControl=(h,key)=>descendants(h.node('gp-fleet-formations')).find(n=>n.dataset.fleetFormation===key);
const fleetEditorApply=h=>descendants(h.node('gp-fleet-formations')).find(n=>n.dataset.fleetFormationApply);
const fleetEditorHero=(h,id,axis)=>descendants(h.node('gp-fleet-formations')).find(n=>n.dataset.fleetFormationHero===id&&n.dataset.fleetFormationAxis===axis);
function fleetEditorTarget(h,id='f1') {const input=fleetEditorControl(h,'building');input.value=id;input.onchange();}
function fleetEditorChoose(h,id,x,y) {const check=fleetEditorHero(h,id);check.checked=true;fleetEditorHero(h,id,'x').value=x;fleetEditorHero(h,id,'y').value=y;}

test('professional fleet editor prepares exact manual formation parameters without planning or dispatch',async()=>{
 const h=await fleetEditorPage(),requests=h.requests.length;assert.equal([...PAGE.matchAll(/id="gp-fleet-formations"/g)].length,1);assert.match(h.node('gp-fleet-formations').textContent,/MyFleets.*OnWater/);
 fleetEditorTarget(h);assert.equal(fleetEditorControl(h,'preset').value,'1');fleetEditorHero(h,'hero-a').checked=false;fleetEditorChoose(h,'hero-b','1','0');fleetEditorApply(h).click();
 const parameters={buildingId:'f1',presetId:1,heroPositions:[{heroId:'hero-b',pos:{x:1,y:0}}]};assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),parameters);assert.deepEqual(GAMEPLAY_MODULES.fleet.validateParameters(parameters),parameters);
 assert.equal(h.node('gp-fleet-plan').disabled,true);assert.equal(h.node('gp-fleet-authorize').disabled,true);assert.equal(h.requests.length,requests);assert.match(h.node('gp-fleet-hint').textContent,/重新探测/);
});

test('professional fleet draft resurvey reaches the original exact candidate and Manual preview with shared account and CSRF',async()=>{
 const facts=fleetEditorFacts(),h=await fleetEditorPage(fleetEditorData(facts));fleetEditorTarget(h);fleetEditorHero(h,'hero-a').checked=false;fleetEditorChoose(h,'hero-b','1','0');fleetEditorApply(h).click();const parameters=JSON.parse(h.node('gp-fleet-parameters').value);
 const scan=h.node('gp-fleet-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'fleet',parameters});const next=fleetEditorData(facts,parameters),candidate=next.view.candidates.find(row=>row.actionType==='fleetFormation');assert.equal(candidate.decision,'READY');h.respond('/api/gameplay/survey',next);await scan;
 const card=h.node('gp-fleet-candidates').children.find(n=>n.children.some(c=>c.textContent.includes('fleetFormation'))),check=descendants(card).find(n=>n.tagName==='input'&&n.type==='checkbox');check.checked=true;check.onchange();const preview=h.node('gp-fleet-plan').click();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'fleet',mode:'Manual',selections:[candidate.actionId],parameters});
 const spec={module:'fleet',actionId:candidate.actionId,actionType:candidate.actionType,parameters,costs:[],target:candidate.target};h.respond('/api/operations/plan',plan(spec));await preview;assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('fleet editor excludes other-fleet heroes and unowned heroes without moving either formation',async()=>{
 const h=await fleetEditorPage();fleetEditorTarget(h);assert.equal(fleetEditorHero(h,'hero-c').disabled,true);assert.equal(fleetEditorHero(h,'hero-d').disabled,true);assert.match(h.node('gp-fleet-formations').textContent,/其他舰队占用/);
 fleetEditorHero(h,'hero-a').checked=false;fleetEditorChoose(h,'hero-c','0','0');const source=h.node('gp-fleet-parameters').value;fleetEditorApply(h).click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.match(h.node('gp-fleet-hint').textContent,/占用/);assert.equal(writes(h).length,0);
});

test('fleet manual positions require reliable unlocked templates, exact integers and unique configured coordinates atomically',async()=>{
 const h=await fleetEditorPage();fleetEditorTarget(h);assert.deepEqual(fleetEditorControl(h,'preset').children.map(n=>n.value),['','1']);fleetEditorHero(h,'hero-a').checked=false;fleetEditorChoose(h,'hero-b','0','0');
 const source=h.node('gp-fleet-parameters').value;for(const value of ['', '1e0','1.0000000000000001',' 0','01','9007199254740993','2147483648','-2147483649','2']){fleetEditorHero(h,'hero-b','x').value=value;fleetEditorApply(h).click();assert.equal(h.node('gp-fleet-parameters').value,source,value);}
 fleetEditorHero(h,'hero-b','x').value='0';fleetEditorHero(h,'hero-a').checked=true;fleetEditorApply(h).click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.match(h.node('gp-fleet-hint').textContent,/重叠/);assert.equal(writes(h).length,0);
});

test('fleet editor respects configured hero count and does not accept forged preset selections',async()=>{
 const facts=fleetEditorFacts();facts.formationFacts.catalog.maxHeroes=1;const h=await fleetEditorPage(fleetEditorData(facts));fleetEditorTarget(h);fleetEditorChoose(h,'hero-b','1','0');const source=h.node('gp-fleet-parameters').value;fleetEditorApply(h).click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.match(h.node('gp-fleet-hint').textContent,/英雄数量/);
 fleetEditorHero(h,'hero-a').checked=false;fleetEditorControl(h,'preset').value='2';fleetEditorApply(h).click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.equal(writes(h).length,0);
});

test('fleet nonzero pet identity remains blocked and is never copied into writable parameters or silently discarded',async()=>{
 const facts=fleetEditorFacts();facts.formationFacts.buildings[0].formation.petUid='9007199254740995';const h=await fleetEditorPage(fleetEditorData(facts));fleetEditorTarget(h);assert.equal(fleetEditorApply(h).disabled,true);assert.match(h.node('gp-fleet-formations').textContent,/9007199254740995/);assert.match(h.node('gp-fleet-formations').textContent,/FLEET_PET_BINDING_UNVERIFIED/);const source=h.node('gp-fleet-parameters').value;fleetEditorApply(h).click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.equal(writes(h).length,0);
});

test('missing fleet formation reliability, disabled config and unavailable fleet states never infer edit eligibility',async()=>{
 const data=fleetEditorData();for(const mutation of [d=>delete d.view.formationReliability,d=>d.view.formationReliability.heroes=false,d=>d.view.formationCatalog.maxHeroes=null,d=>d.config={...d.config,formation:false},d=>d.view.fleets[0].state=2,d=>d.view.fleets[0].repairing={endTs:200},d=>d.view.fleets[0].autoFight=null]){
  const next=structuredClone(data);mutation(next);const h=await fleetEditorPage(next);fleetEditorTarget(h);assert.equal(fleetEditorApply(h).disabled,true);const source=h.node('gp-fleet-parameters').value;fleetEditorApply(h).click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.equal(writes(h).length,0);
 }
});

test('fleet form old target, roster and apply callbacks expire after selecting another fleet or changing advanced parameters',async()=>{
 const h=await fleetEditorPage();fleetEditorTarget(h);const old=fleetEditorApply(h),oldTarget=fleetEditorControl(h,'building');fleetEditorHero(h,'hero-a').checked=false;fleetEditorChoose(h,'hero-b','1','0');fleetEditorTarget(h,'f2');const source=h.node('gp-fleet-parameters').value;old.click();oldTarget.value='f1';oldTarget.onchange();assert.equal(h.node('gp-fleet-parameters').value,source);assert.equal(fleetEditorControl(h,'building').value,'f2');
 const apply=fleetEditorApply(h);h.node('gp-fleet-parameters').value=JSON.stringify({cityId:7});h.node('gp-fleet-parameters').oninput();apply.click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{cityId:7});assert.equal(writes(h).length,0);
});

test('fleet form locks for pending requests and UNKNOWN status and clears on account switch with late reads ignored',async()=>{
 const h=await fleetEditorPage();fleetEditorTarget(h);const old=fleetEditorApply(h),reading=h.node('gp-fleet-load').click();assert.equal(old.disabled,true);old.click();const blocked=fleetEditorData();blocked.status={running:false,blocked:true,state:'UNKNOWN'};h.respond('/api/gameplay',blocked,{module:'fleet'});await reading;assert.equal(fleetEditorControl(h,'building').disabled,true);
 const late=h.node('gp-fleet-load').click();h.run("selectAccount('B')");h.respond('/api/gameplay',fleetEditorData(),{module:'fleet'});await late;old.click();assert.equal(h.node('gp-fleet-formations').textContent,'');assert.equal(writes(h).length,0);
});

test('fleet editor treats identities as literal DOM values and detached callbacks cannot cross back into the old account',async()=>{
 const facts=fleetEditorFacts(),literal='<img onerror=alert(1)>',oldId=facts.fleets[0].buildingId;facts.fleets[0].buildingId=literal;facts.formationFacts.buildings.find(b=>b.buildingId===oldId).buildingId=literal;
 const h=await fleetEditorPage(fleetEditorData(facts));fleetEditorTarget(h,literal);assert.ok(descendants(h.node('gp-fleet-formations')).every(n=>n.tagName!=='img'));fleetEditorHero(h,'hero-a').checked=false;fleetEditorChoose(h,'hero-b','1','0');const apply=fleetEditorApply(h);h.run("selectAccount('B');selectAccount('A')");apply.click();assert.equal(h.node('gp-fleet-formations').textContent,'');assert.equal(writes(h).length,0);
});
