import { navalView } from '../src/naval-rules.mjs';
import { treasureView } from '../src/treasure.mjs';
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
  new vm.Script(inline.replace('Object.assign(globalThis,{addStageTaskDeclaration,', 'Object.assign(globalThis,{GP_MODULES,gpGet,gpControls,gpRenderDomain,gpRenderPlan,gpAuthorize,addStageTaskDeclaration,'), { filename: 'assembled-page-inline.js' }).runInContext(context);
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
  await tick(); h.respond('/api/overview', structuredClone(overview)); await tick();
  assert.deepEqual(h.requests.map((request) => new URL(request.url, 'http://localhost').pathname), ['/api/accounts', '/api/overview']);
  return h;
}
const pirateDay='2026-11-12';
const pirateTarget={uid:17,cityId:9,type:1,level:2,gridIdx:0,maxKilledLevel:3,levelRelation:'LOWER'};
const pirateCase={module:'pirate-sweep',actionId:'pirate-sweep:synthetic-exact',actionType:'SWEEP',parameters:{uid:17,cityId:9,allowLowerLevel:true},costs:[],blockedReason:'PIRATE_FIRST_KILL_REQUIRED',facts:{
 quota:{dayKey:pirateDay,used:2,total:13,remaining:11,reason:null},quotaBreakdown:{base:10,vip:1,monthCards:2},targets:[pirateTarget,{...pirateTarget,uid:18,level:4,levelRelation:'FIRST_KILL_REQUIRED'}],
}};
const cases = [
  {module:'compass-wheel',actionId:'compass-wheel:synthetic',actionType:'SPIN',parameters:{activityId:'9007199254740993',count:5},costs:[{id:'活动26捞尸人_抽奖券',num:10}],facts:{window:{activityId:'9007199254740993',season:1},compass:{score:100,times:10,claimedId:0,cost:{id:'活动26捞尸人_抽奖券',num:2},pity:10}},blockedReason:'COMPASS_WINDOW_UNKNOWN'},
  {module:'task-rewards',actionId:'task-rewards:weekly-chip-gift:synthetic',actionType:'CLAIM',parameters:{kind:'weekly-chip-gift',packId:'1000'},costs:[],facts:{daily:{activityTime:[{type:6,period:1001,startTime:900,endTime:2000}],gift:[{giftId:1000,paidTimes:0}],round:1,score:100,gotTaskId:[1]}},blockedReason:'WEEKLY_GIFT_ALREADY_CLAIMED'},
  {module:'task-rewards',actionId:'task-rewards:weekly-unique-lottery-gift:synthetic',actionType:'CLAIM',parameters:{kind:'weekly-unique-lottery-gift',packId:'1000'},costs:[],facts:{daily:{activityTime:[{type:7,period:20001,startTime:900,endTime:2000}],gift:[],gotFree:false}},blockedReason:'WEEKLY_GIFT_ALREADY_CLAIMED'},
  {module:'task-rewards',actionId:'task-rewards:weekly-lottery-gift:synthetic',actionType:'CLAIM',parameters:{kind:'weekly-lottery-gift',packId:'1000'},costs:[],facts:{daily:{activityTime:[{type:4,period:12,startTime:900,endTime:2000}],gift:[{giftId:1000,gotTimes:0,charge:0}],gotInfo:{times:0,gotStage:0}}},blockedReason:'WEEKLY_GIFT_ALREADY_CLAIMED'},
  {module:'task-rewards',actionId:'task-rewards:daily-gift:synthetic',actionType:'CLAIM',parameters:{kind:'daily-gift',packId:'赠礼'},costs:[],facts:{daily:{heroId:'马斯克',resetMarker:1,boughtPack:[],drawnPack:[]}},blockedReason:'DAILY_GIFT_ALREADY_CLAIMED'},
  {module:'material-packs',actionId:'material-packs:synthetic-exact',actionType:'EXCHANGE',parameters:{packId:'原料自选包',itemId:'木材',num:2},target:{packId:'原料自选包',itemId:'木材'},costs:[{id:'原料自选包',num:2}],facts:{season:1,packs:[{packId:'原料自选包',have:5,targets:[{itemId:'木材',perPack:1,requiredSeason:1,have:0}]}]},blockedReason:'MATERIAL_PACK_SHORTAGE'},
  { module:'mail',actionId:'mail:READ:synthetic-exact',actionType:'READ',parameters:{pageNo:2,action:'read',emailId:'9007199254740995'},target:{pageNo:2,emailId:'9007199254740995',attachmentFingerprint:'synthetic-empty'},costs:[],facts:{page:{pageNo:2,pageCount:1,totalReported:37,emails:[{emailId:'9007199254740995',subject:'synthetic empty',read:false,got:false,attachment:{hasAttachment:false},eligibility:false}],allPagesComplete:false}},blockedReason:'MAIL_ATTACHMENT_OR_AUTHORITY_UNKNOWN' },
  { module:'mail',actionId:'mail:CLAIM:synthetic-exact',actionType:'CLAIM',parameters:{pageNo:2,action:'claim',emailId:'9007199254740995'},target:{pageNo:2,emailId:'9007199254740995',attachmentFingerprint:'synthetic-fingerprint'},costs:[],facts:{page:{pageNo:2,pageCount:1,totalReported:37,emails:[{emailId:'9007199254740995',subject:'synthetic',read:false,got:false,attachment:{hasAttachment:true},eligibility:false}],allPagesComplete:false}},blockedReason:'MAIL_ATTACHMENT_OR_AUTHORITY_UNKNOWN' },
  { module:'pet',actionId:'pet:FEED:synthetic-exact',actionType:'FEED',parameters:{action:'feed',buildingId:'1宠物培育室',jobIdx:0},costs:[{id:'鱼肠线',num:12},{id:'粗铁',num:4}],facts:{secondsReduced:14400,rooms:[{buildingId:'1宠物培育室',level:1,queue:{breedQ:[{idx:0,petId:'蓝宠物1',startTime:900,finishTime:20000,star:0,feedRequirements:[{type:0,id:'鱼肠线',num:12},{type:0,id:'粗铁',num:4}]}],maturePets:[],maxQLength:2}}]},blockedReason:'PET_JOB_IDX_AMBIGUOUS' },
  {module:'trial-challenge',actionId:'trial-challenge:1:1001:synthetic',actionType:'CHALLENGE',parameters:{},costs:[],facts:{raid:{raidId:1,passedStage:0,sweepTimes:0,buySweepTimes:0}},blockedReason:'TRIAL_CHALLENGE_LEVEL_LOCKED'},
  {module:'free-recruit',actionId:'free-recruit:0:synthetic',actionType:'CLAIM',parameters:{},costs:[],facts:{recruit:{hero:{freeEndTimeSeconds:0,recruitTimes:1}},broadcast:{level:1}},blockedReason:'FREE_RECRUIT_COOLDOWN'},
  {module:'free-recruit',actionId:'free-recruit:ticket:2000:synthetic',actionType:'RECRUIT',parameters:{payment:'ticket'},target:{freeEndTimeSeconds:2000,way:2},costs:[{id:'抽卡券',num:1}],facts:{recruit:{hero:{freeEndTimeSeconds:2000,recruitTimes:1}},broadcast:{level:1}},blockedReason:'RECRUIT_TICKET_INSUFFICIENT'},
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
  { module:'equipment-growth',actionId:'equipment-growth:INITIAL_LEVEL:synthetic-exact',actionType:'INITIAL_LEVEL',parameters:{heroId:'A',uid:'9007199254740994',action:'initial-level'},costs:[],facts:{heroes:[{heroId:'A',equips:[{uid:'9007199254740994',equipId:'蓝武器1',level:0,star:0,refineLv:0}]}]},blockedReason:'EXACT_CONFIGURED_FREE_FIRST_LEVEL_REQUIRED' },
  { module:'equipment-growth',actionId:'equipment-growth:LEVEL:synthetic-exact',actionType:'LEVEL',parameters:{heroId:'A',uid:'9007199254740994'},costs:[{id:'精铁',num:4}],facts:{heroes:[{heroId:'A',equips:[{uid:'9007199254740994',equipId:'蓝武器1',level:1,star:0,refineLv:0}]}]},blockedReason:'TARGET_HERO_DERIVED_STATE_UNKNOWN' },
  { module:'equipment-growth',actionId:'equipment-growth:PUT-ON:synthetic-exact',actionType:'PUT-ON',parameters:{heroId:'A',uid:'9007199254740994',action:'put-on'},costs:[],beforeState:{equipment:{equipId:'蓝武器1',level:1,star:0,refineLv:0}},facts:{heroes:[{heroId:'A',equips:[]}]},blockedReason:'EQUIPMENT_TARGET_SLOT_NOT_EMPTY' },
  { module:'badge-growth',actionId:'badge-growth:PUT-ON:synthetic-exact',actionType:'PUT-ON',parameters:{action:'put-on',heroId:'A',pos:2,uid:'9007199254740997'},costs:[],beforeState:{badge:{badgeId:'闲置纹章',level:1,exp:0}},facts:{mode:'put-on',heroes:[{heroId:'A',level:70,badges:[],emptySlots:[1,2]}]},blockedReason:'BADGE_TARGET_SLOT_NOT_EMPTY' },
  { module:'badge-growth',actionId:'badge-growth:STAR:synthetic-exact',actionType:'STAR',parameters:{heroId:'A',uid:'9007199254740995',action:'star'},costs:[{id:'徽章升星石',num:1},{id:'GOLD',num:500000}],beforeState:{badge:{badgeId:'红法师徽章',level:1,star:0,exp:2}},facts:{mode:'star'},blockedReason:'BADGE_STAR_STOCK_INSUFFICIENT' },
  { module:'badge-growth',actionId:'badge-growth:LEVEL:synthetic-exact',actionType:'LEVEL',parameters:{heroId:'A',uid:'9007199254740995'},costs:[{id:'徽章经验',num:3},{id:'GOLD',num:60}],beforeState:{badge:{badgeId:'测试纹章',level:1,exp:2}},facts:{},blockedReason:'BADGE_CAP_BOUNDARY_OUTSIDE_SCOPE' },
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
  return { accountId: 'A', module: spec.module, batchId: 'batch-' + spec.module, planHash: 'hash-' + spec.module, mode: 'Manual', actions: [candidate(spec)], resourceBudget: spec.costs, ...(spec.module==='farm'&&spec.actionType==='HARVEST'?{budgetClaims:{resources:[],quotas:[],uids:[{type:'farm-harvest',id:'synthetic-crop-batch'}]}}:{}), ...(spec.module==='mail'?{budgetClaims:{resources:[],quotas:[],uids:[{type:'mail',id:spec.parameters.emailId}]}}:{}), ...(spec.module==='pet'?{budgetClaims:{resources:spec.costs,quotas:[],uids:spec.actionType==='LEVEL'?[{type:'pet',id:spec.parameters.uid},{type:'pet-serving-building',id:spec.parameters.buildingId}]:[{type:'pet-job',id:'1宠物培育室:0:900'}]}}:{}), ...(spec.module==='trial-challenge'?{budgetClaims:{resources:[],quotas:[{id:'trial-challenge:first-clear:1:1001',num:1}],uids:[{type:'trial-challenge',id:'1:1001'}]}}:{}), ...(spec.module==='free-recruit'?{budgetClaims:spec.parameters.payment==='ticket'?{resources:spec.costs,quotas:[],uids:[{type:'free-recruit',id:'ticket:synthetic'}]}:{resources:[],quotas:[{id:'free-recruit:cooldown:0',num:1}],uids:[{type:'free-recruit',id:'0'}]}}:{}), ...(spec.module==='free-gold'?{budgetClaims:{resources:[],quotas:[{id:'free-gold:reset:2000',num:1}],uids:[{type:'free-gold',id:'2000:1'}]}}:{}), ...(spec.module==='pirate-sweep'?{budgetClaims:{resources:[],quotas:[{id:'pirate-sweep:'+pirateDay,num:1}],uids:[{type:'pirate',id:'17'}]}}:{}), expiresAt: Date.now() + 60000 };
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
async function selectFresh(h,spec){
  let controls=domainButtons(h,spec);assert.equal(controls.length,2);
  assert.equal(controls[0].disabled,false);assert.equal(controls[1].disabled,true);
  const before=h.requests.length;controls[0].click();assert.equal(h.requests.length,before);
  assert.deepEqual(JSON.parse(h.node('gp-'+spec.module+'-parameters').value),spec.parameters);
  if(h.node('gp-'+spec.module+'-plan').disabled){
    assert.equal(h.node('gp-'+spec.module+'-authorize').disabled,true);
    const survey=h.node('gp-'+spec.module+'-survey').onclick();
    assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:spec.module,parameters:spec.parameters});
    h.respond('/api/gameplay/survey',data(spec));await survey;
    controls=domainButtons(h,spec);controls[0].click();
  }
  assert.equal(h.node('gp-'+spec.module+'-plan').disabled,false);
  return domainButtons(h,spec)[0];
}
async function preview(h, spec) {
  const control=await selectFresh(h,spec);
  const task = h.node('gp-' + spec.module + '-plan').onclick();
  assertMutation(h.pending('/api/operations/plan'), '/api/operations/plan', { module: spec.module, mode: 'Manual', selections: [spec.actionId], parameters: spec.parameters });
  assert.equal(control.disabled, true, 'professional selector is locked during preview');
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
    if(spec.module==='free-recruit'){assert.match(h.confirmations.at(-1),spec.parameters.payment==='ticket'?/抽卡券 × 1/:/free-recruit:cooldown:0/);assert.match(h.confirmations.at(-1),spec.parameters.payment==='ticket'?/"way": 2/:/"way": 1/);}
    if(spec.module==='free-gold'){assert.match(h.confirmations.at(-1),/free-gold:reset:2000/);assert.match(h.confirmations.at(-1),/"usedBefore": 0/);}
    if(spec.module==='pirate-sweep')assert.match(h.confirmations.at(-1),/额度占用：海面扫荡 2026-11-12 ×1/);
    h.respond('/api/operations/authorize', { accountId: 'A', batchId: expected.batchId, permitId: 'synthetic-permit' }); await tick();
    assertMutation(h.pending('/api/operations/execute'), '/api/operations/execute', { batchId: expected.batchId, permitId: 'synthetic-permit' });
    h.respond('/api/operations/execute', { runId: 'synthetic-run-' + spec.module, status: 'EXECUTING' }); await running;
    assert.match(h.node('gp-' + spec.module + '-hint').textContent, /结果以复读和执行历史为准/);
    assert.doesNotMatch(h.node('gp-' + spec.module + '-hint').textContent, /执行成功|验证成功/);
    assert.equal(h.node('gp-' + spec.module + '-authorize').disabled, true);
    await h.node('gp-' + spec.module + '-authorize').onclick();
    assert.deepEqual(writes(h).map((request) => new URL(request.url, 'http://localhost').pathname), [...(Object.keys(spec.parameters).length?['/api/gameplay/survey']:[]), '/api/operations/plan', '/api/operations/authorize', '/api/operations/execute']);
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
    const h = await loaded(spec), control = await selectFresh(h,spec);
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
    const h = await loaded(spec); await selectFresh(h,spec);
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
 const spec=cases.find(s=>s.actionType==='REFINE'),h=await loaded(spec);const modes=descendants(h.node('gp-equipment-growth-facts')).filter(e=>e.dataset.equipmentGrowthMode);assert.equal(modes.length,5);const before=h.requests.length;modes.find(e=>e.dataset.equipmentGrowthMode==='refine').click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{action:'refine'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-equipment-growth-plan').disabled,true);assert.equal(h.node('gp-equipment-growth-authorize').disabled,true);const task=h.node('gp-equipment-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'equipment-growth',parameters:{action:'refine'}});assert.equal(modes[0].disabled,true);h.respond('/api/gameplay/survey',data(spec));await task;assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('equipment growth mode selectors cannot reuse stale view after account change or dirty drafts',async()=>{
 const spec=cases.find(s=>s.actionType==='REFINE'),h=await loaded(spec),mode=descendants(h.node('gp-equipment-growth-facts')).find(e=>e.dataset.equipmentGrowthMode==='refine');h.node('gp-equipment-growth-parameters').value=JSON.stringify({heroId:'edited'});h.node('gp-equipment-growth-parameters').oninput();mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{heroId:'edited'});h.run("selectAccount('B');selectAccount('A');");mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});assert.equal(writes(h).length,0);
});

test('hero exclusive assembled PAGE chooses explicit kind and needs a new survey without planning',async()=>{
 const spec=cases.find(s=>s.actionType==='EXCLUSIVE-LEVEL'),h=await loaded(spec),modes=descendants(h.node('gp-heroes-facts')).filter(e=>e.dataset.heroGrowthMode);assert.equal(modes.length,5);const before=h.requests.length;modes.find(e=>e.dataset.heroGrowthMode==='exclusive-level').click();assert.deepEqual(JSON.parse(h.node('gp-heroes-parameters').value),{action:'exclusive-level'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-heroes-plan').disabled,true);assert.equal(h.node('gp-heroes-authorize').disabled,true);const task=h.node('gp-heroes-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'heroes',parameters:{action:'exclusive-level'}});assert.equal(modes[0].disabled,true);h.respond('/api/gameplay/survey',data(spec));await task;assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
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
 for(const word of ['已佩戴徽章','测试纹章','9007199254740995','徽章经验','GOLD','精确补足下一级经验','经验余量须为零'])assert.ok(facts.includes(word),word);
 assert.doesNotMatch(facts,/当前经验为零/);
 assert.equal(spec.beforeState.badge.exp,2);assert.deepEqual(spec.costs,[{id:'徽章经验',num:3},{id:'GOLD',num:60}]);
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

test('daily task and activity rewards navigate to the existing task rewards panel',async()=>{
 const h=await boot(),before=h.requests.length;
 const checklist=dailyChecklist({ok:{DailyTaskInfoRequest:{
  dailyTask:[{id:1002,progress:1,targetProgress:1,rewardClaimed:false}]
 }},failed:{}},{config:{tables:{}}});
 checklist.activity.daily.tiers=[{id:1,requiredActivity:10,status:'ELIGIBLE'}];
 h.run('renderDailies('+JSON.stringify({checklist,tasks:[]})+')');
 h.run('globalThis.rewardNavigation=[];document.querySelector=selector=>({click:()=>globalThis.rewardNavigation.push(selector)})');
 let scrolls=0;
 h.node('gp-task-rewards-section').scrollIntoView=()=>scrolls++;
 const links=['打开日常任务奖励','打开日活跃宝箱领奖'].map(title=>
  descendants(h.node('dailies-table')).find(node=>node.textContent===title)
 );
 for(const link of links){assert.ok(link);link.click();}
 assert.equal(h.run('JSON.stringify(globalThis.rewardNavigation)'),JSON.stringify(Array(2).fill('#tabs button[data-tab="idle"]')));
 assert.equal(scrolls,2);
 assert.equal(h.requests.length,before);
 h.run("selectAccount('B')");
 for(const link of links)link.click();
 assert.equal(h.run('globalThis.rewardNavigation.length'),2);
 assert.equal(scrolls,2);
 assert.equal(writes(h,'/api/operations/execute').length,0);
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

test('all fresh legacy entry buttons prepare the shared Workflow without game reads or execution',async()=>{
 let h;
 for(const entry of ['tasks','dailies','loop']){
  h=await boot();
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
 h.node('wf-unified-pirate-city').value='9';
 for(const [kind,id] of [['daily','8002'],['daily-activity','4'],['daily-gift',''],['free-recruit',''],['free-gold',''],['trial-challenge',''],['pirate-sweep','2147483647']])unifiedAdd(h,'dailies',kind,id);
 assert.deepEqual(unifiedDraft(h).tasks,[{kind:'main',taskId:1},{kind:'branch',taskId:2},{kind:'achievement',taskId:1001},{kind:'daily',taskId:8001},{kind:'daily-activity',tierId:3},{kind:'daily-gift',packId:'赠礼'}]);
 assert.deepEqual(unifiedDraft(h).dailies,[{taskId:8002,action:'claim'},{kind:'daily-activity',tierId:4,action:'claim'},{kind:'daily-gift',packId:'赠礼',action:'claim'},{taskId:1002,action:'perform'},{taskId:1006,action:'perform'},{taskId:1009,action:'perform'},{taskId:1010,action:'perform',parameters:{uid:2147483647,cityId:9}}]);
 assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
});

test('unified form refuses invalid targets and unsupported entry combinations without changing draft',async()=>{
 const h=await unifiedForm(),before=h.requests.length;
 for(const target of ['','0','-1','1.5','1e3','2147483648','9007199254740992']){
  const source=h.node('wf-unified-intent').value;unifiedAdd(h,'tasks','main',target);
  assert.equal(h.node('wf-unified-intent').value,source,target);assert.match(h.node('wf-unified-form-hint').textContent,/明确整数/);
 }
 for(const [phase,kind] of [['dailies','free-gold'],['tasks','arena']]){
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
function parameterGraphForValidation(h){
 const graph=conditionGraph(h),node=graph.nodes.find(n=>n.id==='business');
 if(node?.type==='ACTION'&&node.selection===undefined){
  const card=h.node('wf-nodes').children.find(c=>c.children.some(n=>n.tagName==='h3'&&n.textContent==='节点 2'));
  const selection=descendants(card).find(n=>n.tagName==='textarea'&&n.value==='');
  assert.ok(selection,'explicit selection editor remains available after target changes');
  selection.value=JSON.stringify({actionId:'explicitly-reselected-action'});selection.onchange();
 }
 return conditionGraph(h);
}

function parameterSet(h,key,value,{type,enabled=true}={}) {
 const include=parameterControl(h,key,'enabled');assert.ok(include,key);include.checked=enabled;include.onchange();
 if(type){const select=parameterControl(h,key,'type');select.value=type;select.onchange();}
 if(value!==undefined)parameterControl(h,key).value=value;
}

test('Workflow parameter form creates explicit Pet feed including queue zero and preserves precise mail UID strings',async()=>{
 const pet=await parameterPage();const before=pet.node('wf-json').value;parameterSet(pet,'action',JSON.stringify('feed'));parameterSet(pet,'buildingId','1宠物培育室');parameterSet(pet,'jobIdx','0');
 assert.equal(pet.node('wf-json').value,before);parameterApply(pet).click();assert.deepEqual(businessNode(pet).parameters,{action:'feed',buildingId:'1宠物培育室',jobIdx:0});assert.equal(businessNode(pet).selection,undefined,'edited target must discard the prior action');assert.equal(writes(pet).length,0);
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
 assert.equal(validateWorkflow(parameterGraphForValidation(pet),{modules:{pet:GAMEPLAY_MODULES.pet}}).valid,true);
 parameterSet(pet,'jobIdx','-1');parameterApply(pet).click();assert.throws(()=>validateWorkflow(parameterGraphForValidation(pet),{modules:{pet:GAMEPLAY_MODULES.pet}}),/jobIdx/);assert.equal(writes(pet).length,0);
 const mail=await parameterPage('mail');parameterSet(mail,'pageNo','0');parameterSet(mail,'action',JSON.stringify('claim'));parameterSet(mail,'emailId','9007199254740995');parameterApply(mail).click();
 assert.equal(validateWorkflow(parameterGraphForValidation(mail),{modules:{mail:GAMEPLAY_MODULES.mail}}).valid,true);
 parameterSet(mail,'emailId',undefined,{enabled:false});parameterApply(mail).click();assert.throws(()=>validateWorkflow(parameterGraphForValidation(mail),{modules:{mail:GAMEPLAY_MODULES.mail}}),/同时指定/);assert.equal(writes(mail).length,0);
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
 parameterApply(h).click();assert.equal(validateWorkflow(parameterGraphForValidation(h),{modules:{alliance:GAMEPLAY_MODULES.alliance}}).valid,true);
 parameterListAdd(h,'reqIds','7','string');parameterApply(h).click();assert.throws(()=>validateWorkflow(parameterGraphForValidation(h),{modules:{alliance:GAMEPLAY_MODULES.alliance}}),/联盟身份无效或重复/);assert.equal(writes(h).length,0);
});

test('list edits invalidate original candidates and action selection while preserving nested formation objects',async()=>{
 const positions=[{heroId:'A',pos:{x:0,y:2}}],h=await parameterPage('formation',{presetId:1,heroIds:['A'],heroPositions:positions});
 const reading=descendants(h.node('wf-nodes')).find(n=>n.dataset.workflowCandidate==='business').click();await tick();h.respond('/api/gameplay/survey',{accountId:'A',module:'formation',view:{candidates:[{actionId:'exact-action',actionType:'SAVE',parameters:{presetId:1,heroIds:['A'],heroPositions:positions},costs:[],executable:true}]}});await reading;
 assert.ok(descendants(h.node('wf-nodes')).some(n=>n.dataset.workflowSelection==='business'));parameterListAdd(h,'heroIds','B');parameterApply(h).click();
 assert.deepEqual(businessNode(h).parameters.heroPositions,positions);assert.deepEqual(businessNode(h).parameters.heroIds,['A','B']);assert.equal(businessNode(h).selection,undefined,'applied target change discards old action');assert.equal(descendants(h.node('wf-nodes')).some(n=>n.dataset.workflowSelection==='business'),false);assert.equal(writes(h,'/api/operations/plan').length,0);
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
 assert.deepEqual(businessNode(h).parameters,{presetId:1,heroPositions:[{heroId:'A',pos:{x:0,y:-1}}]});assert.equal(validateWorkflow(parameterGraphForValidation(h),{modules:{formation:GAMEPLAY_MODULES.formation}}).valid,true);assert.equal(writes(h).length,0);
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
 assert.throws(()=>validateWorkflow(parameterGraphForValidation(h),{modules:{formation:GAMEPLAY_MODULES.formation}}),/不能同时提供/);
 parameterControl(h,'heroIds','enabled').checked=false;parameterControl(h,'heroIds','enabled').onchange();parameterListButton(h,'heroPositions','add').click();nestedSet(h,'heroPositions',['heroId'],'B',{index:1});nestedSet(h,'heroPositions',['pos'],undefined,{index:1});nestedSet(h,'heroPositions',['pos','x'],'0',{index:1});nestedSet(h,'heroPositions',['pos','y'],'0',{index:1});parameterApply(h).click();
 assert.throws(()=>validateWorkflow(parameterGraphForValidation(h),{modules:{formation:GAMEPLAY_MODULES.formation}}),/不能重复/);
 nestedSet(h,'heroPositions',['pos','y'],'1',{index:1});parameterApply(h).click();assert.equal(validateWorkflow(parameterGraphForValidation(h),{modules:{formation:GAMEPLAY_MODULES.formation}}).valid,true);assert.equal(writes(h).length,0);
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

function fleetOperationsData(parameters={},change=()=>{}) {
 const f=fleetEditorFacts();f.stock=new Map([['汽油',100]]);f.citiesReliable=true;f.cities=[{id:2,state:1,guildIdx:3},{id:7,state:1,guildIdx:9}];f.guildIdx=3;f.fleets[0].durability=90;f.repairParams.set('f1',{unitRepairCost:1.25,unitRepairTime:0.15});f.protocolReady={...f.protocolReady,RepairFleetRequest:true,MoveFleetsToCityRequest:true,StopRepairingRequest:true,SetFleetAutoFightRequest:true};
 const config={...fleetEditorConfig,formation:false,repair:true,repairBelowDurabilityRatio:1,maximumRepairPetrolPerPlan:20,move:true,stopRepair:true,autoFight:true};change(f,config);
 const view=fleetView(f,{moduleConfig:config,parameters});view.candidates=view.candidates.map(({action,...row})=>({...row,executable:Boolean(action)&&row.executable!==false&&row.decision!=='BLOCKED'}));
 return {accountId:'A',module:'fleet',csrfToken:'synthetic-csrf-A',config,status:{running:false,blocked:false},functions:[],view};
}
const fleetOperationButton=(h,type)=>descendants(h.node('gp-fleet-operations')).find(n=>n.dataset.fleetOperation?.startsWith('fleet:'+type+':'));
const fleetMoveControl=(h,key)=>descendants(h.node('gp-fleet-operations')).find(n=>n.dataset.fleetMovement===key);
const fleetMovePrepare=h=>descendants(h.node('gp-fleet-operations')).find(n=>n.dataset.fleetMovementPrepare);
function fleetMoveDraft(h,building='f1',city='2') {fleetMoveControl(h,'building').value=building;fleetMoveControl(h,'city').value=city;fleetMovePrepare(h).click();}

test('professional fleet maintenance table selects the existing precise repair candidate and previews original rounded cost',async()=>{
 const next=fleetOperationsData(),h=await fleetEditorPage(next),button=fleetOperationButton(h,'fleetRepair');assert.equal([...PAGE.matchAll(/id="gp-fleet-operations"/g)].length,1);assert.equal(button.disabled,false);assert.match(h.node('gp-fleet-operations').textContent,/维修.*汽油/);
 const requests=h.requests.length;button.click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{buildingId:'f1'});assert.equal(h.requests.length,requests);
 const candidate=next.view.candidates.find(row=>row.actionId===button.dataset.fleetOperation);assert.deepEqual(candidate.costs,[{id:'汽油',num:13}]);assert.equal(h.node('gp-fleet-plan').disabled,true);const survey=h.node('gp-fleet-survey').click();h.respond('/api/gameplay/survey',next);await survey;fleetOperationButton(h,'fleetRepair').click();const request=h.node('gp-fleet-plan').click();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'fleet',mode:'Manual',selections:[candidate.actionId],parameters:{buildingId:'f1'}});
 h.respond('/api/operations/plan',plan({module:'fleet',actionId:candidate.actionId,actionType:candidate.actionType,costs:candidate.costs,target:candidate.target,parameters:{buildingId:'f1'}}));await request;assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('professional movement prepares only a current-view city then resurvey selects the original movement candidate',async()=>{
 const h=await fleetEditorPage(fleetOperationsData()),requests=h.requests.length;assert.equal(fleetMovePrepare(h).disabled,false);assert.match(h.node('gp-fleet-operations').textContent,/WorldInfo 当前视野/);fleetMoveDraft(h);
 const parameters={buildingId:'f1',cityId:2};assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),parameters);assert.equal(h.requests.length,requests);assert.equal(h.node('gp-fleet-plan').disabled,true);
 const scan=h.node('gp-fleet-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'fleet',parameters});const next=fleetOperationsData(parameters);h.respond('/api/gameplay/survey',next);await scan;
 const candidate=next.view.candidates.find(row=>row.actionType==='fleetMove');assert.equal(candidate.decision,'READY');const button=fleetOperationButton(h,'fleetMove');assert.equal(button.disabled,false);button.click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),parameters);assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);
});

test('fleet movement rejects absent, forged and non-current targets without numeric coercion',async()=>{
 const h=await fleetEditorPage(fleetOperationsData()),source=h.node('gp-fleet-parameters').value;
 for(const [building,city]of [['','2'],['missing','2'],['f1',''],['f1','999'],['f1','2.0'],['f1','2e0'],['f1',' 2']]){fleetMoveDraft(h,building,city);assert.equal(h.node('gp-fleet-parameters').value,source);}
 assert.equal(writes(h).length,0);
});

test('fleet maintenance blocked cost is displayed as unresolved and cross-guild movement remains blocked when map cost is unknown',async()=>{
 const next=fleetOperationsData({buildingId:'f1',cityId:7},f=>f.repairParams.clear()),h=await fleetEditorPage(next);const repair=fleetOperationButton(h,'fleetRepair'),move=fleetOperationButton(h,'fleetMove');assert.equal(repair.disabled,true);assert.equal(move.disabled,true);assert.match(h.node('gp-fleet-operations').textContent,/尚未形成可执行成本/);assert.match(h.node('gp-fleet-operations').textContent,/MOVE_COST_UNKNOWN/);const source=h.node('gp-fleet-parameters').value;repair.click();move.click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.equal(writes(h).length,0);
});

test('fleet stop-repair and stop-autofight remain separate exact candidates with original premium and automation exclusions visible',async()=>{
 const next=fleetOperationsData({},f=>{f.fleets[0].state=4;f.fleets[0].repairing={startTs:100,endTs:200,endDura:100};f.fleets[1].autoFight={isOn:true,todayTimes:0};}),h=await fleetEditorPage(next);
 assert.equal(fleetOperationButton(h,'fleetStopRepair').disabled,false);const auto=descendants(h.node('gp-fleet-operations')).find(n=>n.dataset.fleetOperation?.startsWith('fleet:fleetStopAutoFight:f2'));assert.ok(auto);assert.equal(auto.disabled,false);auto.click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{buildingId:'f2'});assert.match(h.node('gp-fleet-operations').textContent,/PREMIUM_BLOCKED/);assert.match(h.node('gp-fleet-operations').textContent,/AUTOMATION_UNVERIFIED/);assert.equal(writes(h).length,0);
});

test('movement editing requires real reliability and config while maintenance remains independently selectable',async()=>{
 for(const change of [d=>delete d.view.citiesReliable,d=>d.view.citiesReliable=false,d=>delete d.view.formationReliability,d=>d.config={...d.config,move:false}]){
  const next=fleetOperationsData();change(next);const h=await fleetEditorPage(next);assert.equal(fleetMovePrepare(h).disabled,true);assert.equal(fleetOperationButton(h,'fleetRepair').disabled,false);const source=h.node('gp-fleet-parameters').value;fleetMoveDraft(h);assert.equal(h.node('gp-fleet-parameters').value,source);assert.equal(writes(h).length,0);
 }
});

test('maintenance and movement controls lock on pending and UNKNOWN and old view or parameter callbacks cannot replace fresh targets',async()=>{
 const h=await fleetEditorPage(fleetOperationsData()),repair=fleetOperationButton(h,'fleetRepair'),prepare=fleetMovePrepare(h);fleetMoveControl(h,'building').value='f1';fleetMoveControl(h,'city').value='2';
 h.node('gp-fleet-parameters').value=JSON.stringify({buildingId:'f2'});h.node('gp-fleet-parameters').oninput();repair.click();prepare.click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{buildingId:'f2'});
 const reading=h.node('gp-fleet-load').click();assert.equal(repair.disabled,true);const next=fleetOperationsData();next.status={blocked:true,running:false,state:'UNKNOWN'};h.respond('/api/gameplay',next,{module:'fleet'});await reading;assert.equal(fleetOperationButton(h,'fleetRepair').disabled,true);assert.equal(fleetMovePrepare(h).disabled,true);repair.click();prepare.click();assert.equal(writes(h).length,0);
});

test('fleet movement current-view options render literal identities and late account responses do not revive old operation selectors',async()=>{
 const next=fleetOperationsData();next.view.fleets[0].buildingId='<img onerror=alert(1)>';const h=await fleetEditorPage(next),old=fleetOperationButton(h,'fleetRepair'),prepare=fleetMovePrepare(h),load=h.node('gp-fleet-load').click();assert.ok(descendants(h.node('gp-fleet-operations')).every(n=>n.tagName!=='img'));h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay',next,{module:'fleet'});await load;old.click();prepare.click();assert.equal(h.node('gp-fleet-operations').textContent,'');assert.equal(writes(h).length,0);
});

function treasureEditorFacts() {
 const fleet=(buildingId,extra={})=>({buildingId,state:1,durability:1900,maxDura:2000,treasureLootUid:0,repairing:null,autoFight:{isOn:false},...extra});
 return {now:300000,config:{tables:{WorldParamCfg:{data:[{paramName:'进攻宝藏消耗汽油',paramValue:500}]},GameplayOpenCfg:{data:[{gameplay:'世界宝藏',openDays:[3,1,1]}]}}},player:{worldId:2001000000},parameters:{},stockReliable:true,stock:new Map([['汽油',2000]]),fleetReliable:true,treasureReliable:true,statsReliable:true,protocolReady:true,todayRewardTimes:0,totalRewardTimes:3,season:{reliable:true,startTime:100000,endTime:1000000},fleets:[fleet('fleet-a'),fleet('fleet-b'),fleet('fleet-busy',{state:2})],treasures:[{uid:7,color:5,ownerGuildIdx:0,ownerFleetNum:0,progress:0,gridIdx:1},{uid:8,color:4,ownerGuildIdx:9,ownerFleetNum:1,progress:50,gridIdx:2}]};
}
function treasureEditorData(parameters={},change=()=>{}) {
 const f=treasureEditorFacts(),config={...GAMEPLAY_MODULES.treasure.defaultConfig,enabled:true,dispatch:true,maxFleets:2};if(parameters.uid)f.targetDetails={uid:parameters.uid,rankReliable:true,defenceReliable:true,rank:[{playerId:'9007199254740995',nickname:'<img onerror=alert(1)>'}],defence:[]};change(f,config);
 const view=treasureView(f,{moduleConfig:config,parameters});view.candidates=view.candidates.map(({action,...row})=>({...row,executable:Boolean(action)&&row.executable!==false&&row.decision!=='BLOCKED'}));return {accountId:'A',module:'treasure',csrfToken:'synthetic-csrf-A',config,status:{running:false,blocked:false},functions:[],view};
}
async function treasureEditorPage(data=treasureEditorData()) {const h=await boot(),request=h.node('gp-treasure-load').click();h.respond('/api/gameplay',data,{module:'treasure'});await request;return h;}
const treasureEditorButton=(h,key,value)=>descendants(h.node('gp-treasure-targets')).find(n=>n.dataset[key]!==undefined&&(value===undefined||n.dataset[key]===value));
function treasureEditorDraft(h,uid='7',fleets=['fleet-a']) {treasureEditorButton(h,'treasureTarget').value=uid;for(const input of descendants(h.node('gp-treasure-targets')).filter(n=>n.dataset.treasureFleet))input.checked=fleets.includes(input.dataset.treasureFleet);treasureEditorButton(h,'treasurePrepare').click();}

test('world treasure professional page explicitly prepares a selected target and fleets without authorizing or inferring loot',async()=>{
 const h=await treasureEditorPage(),requests=h.requests.length;assert.equal([...PAGE.matchAll(/id="gp-treasure-targets"/g)].length,1);assert.match(h.node('gp-treasure-targets').textContent,/TreasureLootList.*TreasureLootStats.*MyFleets/);assert.match(h.node('gp-treasure-targets').textContent,/已用 0.*上限 3/);
 treasureEditorDraft(h,'7',['fleet-a','fleet-b']);const parameters={uid:7,fleetBuildingIds:['fleet-a','fleet-b']};assert.deepEqual(JSON.parse(h.node('gp-treasure-parameters').value),parameters);assert.deepEqual(GAMEPLAY_MODULES.treasure.validateParameters(parameters),parameters);assert.equal(h.node('gp-treasure-plan').disabled,true);assert.equal(h.node('gp-treasure-authorize').disabled,true);assert.equal(h.requests.length,requests);assert.match(h.node('gp-treasure-hint').textContent,/排行\/防守/);
});

test('treasure detail selection retains explicit fleet IDs and loads authoritative target details only after normal survey',async()=>{
 const h=await treasureEditorPage();treasureEditorDraft(h,'7',['fleet-a']);const button=treasureEditorButton(h,'treasureDetails','7'),requests=h.requests.length;button.click();assert.equal(h.requests.length,requests);assert.deepEqual(JSON.parse(h.node('gp-treasure-parameters').value),{uid:7,fleetBuildingIds:['fleet-a']});
 const scan=h.node('gp-treasure-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'treasure',parameters:{uid:7,fleetBuildingIds:['fleet-a']}});h.respond('/api/gameplay/survey',treasureEditorData({uid:7,fleetBuildingIds:['fleet-a']}));await scan;assert.match(h.node('gp-treasure-targets').textContent,/排行 本次读取可靠.*防守 本次读取可靠/);assert.match(h.node('gp-treasure-targets').textContent,/9007199254740995/);assert.ok(descendants(h.node('gp-treasure-targets')).every(n=>n.tagName!=='img'));assert.equal(writes(h,'/api/operations/plan').length,0);
});

test('treasure explicit fleet choice reaches the existing ready candidate and Manual preview with exact two-fleet cost',async()=>{
 const h=await treasureEditorPage();treasureEditorDraft(h,'7',['fleet-a','fleet-b']);const parameters=JSON.parse(h.node('gp-treasure-parameters').value),scan=h.node('gp-treasure-survey').click(),data=treasureEditorData(parameters);h.respond('/api/gameplay/survey',data);await scan;
 const candidate=data.view.candidates[0],button=treasureEditorButton(h,'treasureAction',candidate.actionId);assert.equal(button.disabled,false);assert.deepEqual(candidate.costs,[{id:'汽油',num:1000}]);const requests=h.requests.length;button.click();assert.equal(h.requests.length,requests);const preview=h.node('gp-treasure-plan').click();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'treasure',mode:'Manual',selections:[candidate.actionId],parameters});
 h.respond('/api/operations/plan',plan({module:'treasure',actionId:candidate.actionId,actionType:candidate.actionType,costs:candidate.costs,target:candidate.target,parameters}));await preview;assert.match(h.node('gp-treasure-targets').textContent,/仅确认派遣关联/);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('treasure form refuses forged or empty target and fleet sets while preserving the old parameters atomically',async()=>{
 const h=await treasureEditorPage(),source=h.node('gp-treasure-parameters').value;for(const [uid,ids]of [['',[]],['7',[]],['7',['fleet-busy']],['999',['fleet-a']],['7e0',['fleet-a']],['7.0',['fleet-a']]]){treasureEditorDraft(h,uid,ids);assert.equal(h.node('gp-treasure-parameters').value,source);}
 assert.equal(treasureEditorButton(h,'treasureFleet','fleet-busy').disabled,true);assert.equal(writes(h).length,0);
});

test('treasure form respects the existing maximum, durability and automatic-fight rules without choosing substitutes',async()=>{
 const data=treasureEditorData({},(f,c)=>{c.maxFleets=1;f.fleets[1].durability=1;f.fleets[2].state=1;f.fleets[2].autoFight={isOn:true};}),h=await treasureEditorPage(data),source=h.node('gp-treasure-parameters').value;
 assert.equal(treasureEditorButton(h,'treasureFleet','fleet-b').disabled,true);assert.equal(treasureEditorButton(h,'treasureFleet','fleet-busy').disabled,true);treasureEditorDraft(h,'7',['fleet-a','fleet-b']);assert.equal(h.node('gp-treasure-parameters').value,source);assert.equal(writes(h).length,0);
 const max=await treasureEditorPage(treasureEditorData({},(_f,c)=>c.maxFleets=1)),before=max.node('gp-treasure-parameters').value;treasureEditorDraft(max,'7',['fleet-a','fleet-b']);assert.equal(max.node('gp-treasure-parameters').value,before);
});

test('treasure contested targets and missing detailed defence keep original blocked candidates and never claim free execution',async()=>{
 for(const data of [treasureEditorData({uid:8,fleetBuildingIds:['fleet-a']}),treasureEditorData({uid:7,fleetBuildingIds:['fleet-a']},f=>f.targetDetails.defenceReliable=false),treasureEditorData({uid:7,fleetBuildingIds:['fleet-a']},f=>f.targetDetails.defence=[{name:'occupied'}])]){
  const h=await treasureEditorPage(data),candidate=data.view.candidates[0],button=treasureEditorButton(h,'treasureAction',candidate.actionId);assert.equal(button.disabled,true);assert.match(h.node('gp-treasure-targets').textContent,/尚未形成可执行成本/);const source=h.node('gp-treasure-parameters').value;button.click();assert.equal(h.node('gp-treasure-parameters').value,source);assert.equal(writes(h).length,0);
 }
});

test('treasure old cache reliability remains unknown and does not turn absent counters into zero',async()=>{
 const data=treasureEditorData();delete data.view.reliability;const h=await treasureEditorPage(data);assert.equal(treasureEditorButton(h,'treasurePrepare').disabled,true);assert.equal(treasureEditorButton(h,'treasureDetails','7').disabled,true);assert.match(h.node('gp-treasure-targets').textContent,/已用 未知.*上限 未知/);assert.match(h.node('gp-treasure-targets').textContent,/旧缓存不推断完整/);assert.equal(writes(h).length,0);
});

test('treasure draft callbacks expire after advanced edits or a new account-bound view and cannot overwrite new choices',async()=>{
 const h=await treasureEditorPage(),prepare=treasureEditorButton(h,'treasurePrepare'),details=treasureEditorButton(h,'treasureDetails','7');h.node('gp-treasure-parameters').value=JSON.stringify({uid:8});h.node('gp-treasure-parameters').oninput();prepare.click();details.click();assert.deepEqual(JSON.parse(h.node('gp-treasure-parameters').value),{uid:8});
 const read=h.node('gp-treasure-load').click();h.respond('/api/gameplay',treasureEditorData({uid:8}),{module:'treasure'});await read;prepare.click();details.click();assert.deepEqual(JSON.parse(h.node('gp-treasure-parameters').value),{uid:8});assert.equal(writes(h).length,0);
});

test('treasure controls lock for pending and UNKNOWN, and late account reads cannot restore old target actions',async()=>{
 const h=await treasureEditorPage(),prepare=treasureEditorButton(h,'treasurePrepare'),candidate=treasureEditorButton(h,'treasureAction'),reading=h.node('gp-treasure-load').click();assert.equal(prepare.disabled,true);assert.equal(candidate.disabled,true);const data=treasureEditorData();data.status={blocked:true,running:false,state:'UNKNOWN'};h.respond('/api/gameplay',data,{module:'treasure'});await reading;assert.equal(treasureEditorButton(h,'treasurePrepare').disabled,true);
 const late=h.node('gp-treasure-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay',treasureEditorData(),{module:'treasure'});await late;prepare.click();candidate.click();assert.equal(h.node('gp-treasure-targets').textContent,'');assert.equal(writes(h).length,0);
});


function navalEditorData(parameters={},change=()=>{}) {
 const config={...GAMEPLAY_MODULES.naval.defaultConfig,enabled:true,observe:true};
 const facts={now:100,worldReliable:true,stockReliable:true,stock:new Map([['汽油',500]]),scope:{completeness:'CURRENT_RESPONSE_ONLY'},worldFleets:[
  {playerId:'9007199254740995',buildingId:'<img onerror=alert(1)>',guildId:'9007199254740997',cityId:7,power:'9007199254740999',state:1,durability:50,maxDura:100},
  {playerId:'42',buildingId:'fleet-b',guildId:'0',cityId:8,power:'3',state:2,durability:30,maxDura:100},
  {playerId:'43',buildingId:'fleet-c',guildId:null,cityId:7,power:null,state:1,durability:null,maxDura:null}
 ]};change(facts,config);
 return {accountId:'A',module:'naval',csrfToken:'synthetic-csrf-A',config,status:{running:false,blocked:false},functions:[],view:navalView(facts,{parameters,moduleConfig:config})};
}
async function navalEditorPage(data=navalEditorData()) {const h=await boot(),reading=h.node('gp-naval-load').click();h.respond('/api/gameplay',data,{module:'naval'});await reading;return h;}
const navalEditorNodes=h=>descendants(h.node('gp-naval-observations'));
const navalEditorField=(h,key,part='value')=>navalEditorNodes(h).find(n=>n.dataset.navalParameter===key&&n.dataset.navalControl===part);
const navalEditorApply=h=>navalEditorNodes(h).find(n=>n.dataset.navalParametersApply);
function navalEditorDraft(h,values) {for(const [key,value]of Object.entries(values)){const enabled=navalEditorField(h,key,'enabled');enabled.checked=value!==undefined;enabled.onchange();if(value===undefined)continue;if(key==='screenCenter'){for(const axis of ['x','y'])navalEditorField(h,key,axis).value=value[axis];}else navalEditorField(h,key).value=value;}}

test('naval professional observations retain exact IDs and three-valued authority in safe DOM with no combat candidates',async()=>{
 const data=navalEditorData({minimumPower:'9007199254740998'}),h=await navalEditorPage(data),text=h.node('gp-naval-observations').textContent;
 assert.equal([...PAGE.matchAll(/id="gp-naval-observations"/g)].length,1);assert.match(text,/CURRENT_RESPONSE_ONLY/);assert.match(text,/9007199254740995/);assert.match(text,/9007199254740999/);assert.match(text,/PASS/);assert.match(text,/FAIL/);assert.match(text,/UNKNOWN/);assert.match(text,/SIDE_UNVERIFIED/);assert.match(text,/TARGET_ID_UNVERIFIED/);assert.ok(navalEditorNodes(h).every(n=>n.tagName!=='img'));assert.deepEqual(data.view.targets.map(r=>r.status),['PASS','FAIL','UNKNOWN']);assert.equal(h.node('gp-naval-plan').disabled,true);assert.equal(h.node('gp-naval-authorize').disabled,true);assert.equal(writes(h).length,0);
});

test('naval explicit filters preserve int64 text, zero coordinates and empty lists through the existing read-only survey',async()=>{
 const h=await navalEditorPage();navalEditorDraft(h,{playerId:'9007199254740995',excludeGuildIds:'0\n9007199254740997',cityIds:'7\n2147483647',minimumPower:'0',maximumPower:'9223372036854775807',screenCenter:{x:'0',y:'-2147483647'}});navalEditorApply(h).click();
 const parameters={playerId:'9007199254740995',excludeGuildIds:['0','9007199254740997'],cityIds:[7,2147483647],minimumPower:'0',maximumPower:'9223372036854775807',screenCenter:{x:0,y:-2147483647}};
 assert.deepEqual(JSON.parse(h.node('gp-naval-parameters').value),parameters);assert.deepEqual(GAMEPLAY_MODULES.naval.validateParameters(parameters),parameters);assert.equal(writes(h).length,0);
 const scan=h.node('gp-naval-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'naval',parameters});h.respond('/api/gameplay/survey',navalEditorData(parameters));await scan;assert.equal(h.node('gp-naval-plan').disabled,true);assert.equal(h.node('gp-naval-authorize').disabled,true);assert.deepEqual(writes(h).map(r=>new URL(r.url,'http://localhost').pathname),['/api/gameplay/survey']);
 navalEditorDraft(h,{playerId:undefined,excludeGuildIds:'',cityIds:''});navalEditorApply(h).click();const empty=JSON.parse(h.node('gp-naval-parameters').value);assert.equal(Object.hasOwn(empty,'playerId'),false);assert.deepEqual(empty.excludeGuildIds,[]);assert.deepEqual(empty.cityIds,[]);
});

test('naval target selection copies only the precise response key and retains filters until explicit resurvey',async()=>{
 const h=await navalEditorPage(),requests=h.requests.length;navalEditorDraft(h,{minimumPower:'1'});navalEditorApply(h).click();const old=navalEditorNodes(h).find(n=>n.dataset.navalObservedTarget);old.click();const key='9007199254740995:<img onerror=alert(1)>';
 assert.deepEqual(JSON.parse(h.node('gp-naval-parameters').value),{minimumPower:'1',targetId:key,playerId:'9007199254740995'});assert.equal(h.requests.length,requests);const before=h.node('gp-naval-parameters').value;old.click();assert.equal(h.node('gp-naval-parameters').value,before);assert.equal(h.node('gp-naval-plan').disabled,true);
});

for(const [label,values]of [
 ['zero player',{playerId:'0'}],['int64 overflow',{playerId:'9223372036854775808'}],['leading zero',{minimumPower:'01'}],['decimal',{minimumPower:'1.0'}],['exponent',{maximumPower:'1e3'}],['whitespace',{excludeGuildIds:' 7'}],['duplicate guild',{excludeGuildIds:'7\n7'}],['blank guild',{excludeGuildIds:'7\n'}],['duplicate city',{cityIds:'7\n7'}],['zero city',{cityIds:'0'}],['city overflow',{cityIds:'2147483648'}],['oversized list',{cityIds:Array.from({length:101},(_,i)=>String(i+1)).join('\n')}],['reversed bounds',{minimumPower:'9007199254740999',maximumPower:'9007199254740998'}],['missing coordinate',{screenCenter:{x:'0',y:''}}],['coordinate overflow',{screenCenter:{x:'-2147483648',y:'0'}}],['coordinate exponent',{screenCenter:{x:'1e0',y:'0'}}],['empty target',{targetId:' '}]
])test('naval filter form rejects '+label+' atomically and sends no requests',async()=>{
 const h=await navalEditorPage(),before=h.node('gp-naval-parameters').value;navalEditorDraft(h,{targetId:'valid-prior-field',...values});navalEditorApply(h).click();assert.equal(h.node('gp-naval-parameters').value,before);assert.match(h.node('gp-naval-hint').textContent,/筛选未应用/);assert.equal(writes(h).length,0);
});

test('naval malformed advanced parameters require explicit repair and unknown fields reach the original contract rejection',async()=>{
 const h=await navalEditorPage();h.node('gp-naval-parameters').value='[]';h.node('gp-naval-parameters').oninput();let reading=h.node('gp-naval-load').click();h.respond('/api/gameplay',navalEditorData(),{module:'naval'});await reading;assert.equal(navalEditorApply(h).disabled,true);assert.match(h.node('gp-naval-observations').textContent,/高级JSON修正/);navalEditorApply(h).click();assert.equal(h.node('gp-naval-parameters').value,'[]');
 h.node('gp-naval-parameters').value=JSON.stringify({request:'untrusted'});h.node('gp-naval-parameters').oninput();reading=h.node('gp-naval-load').click();h.respond('/api/gameplay',navalEditorData(),{module:'naval'});await reading;navalEditorDraft(h,{cityIds:'7'});navalEditorApply(h).click();const value=JSON.parse(h.node('gp-naval-parameters').value);assert.deepEqual(value,{request:'untrusted',cityIds:[7]});assert.throws(()=>GAMEPLAY_MODULES.naval.validateParameters(value),{code:'INVALID_INPUT'});assert.equal(writes(h).length,0);
});

test('naval missing world authority keeps target selection disabled and observations UNKNOWN',async()=>{
 const h=await navalEditorPage(navalEditorData({},f=>{f.worldReliable=false;})),button=navalEditorNodes(h).find(n=>n.dataset.navalObservedTarget),before=h.node('gp-naval-parameters').value;assert.equal(button.disabled,true);button.click();assert.equal(h.node('gp-naval-parameters').value,before);assert.match(h.node('gp-naval-observations').textContent,/可靠性 UNKNOWN/);assert.equal(writes(h).length,0);
});

test('naval observation callbacks expire on parameter edits, replacement views and account changes',async()=>{
 const h=await navalEditorPage(),apply=navalEditorApply(h),target=navalEditorNodes(h).find(n=>n.dataset.navalObservedTarget);navalEditorDraft(h,{cityIds:'7'});h.node('gp-naval-parameters').value=JSON.stringify({cityIds:[8]});h.node('gp-naval-parameters').oninput();apply.click();target.click();assert.deepEqual(JSON.parse(h.node('gp-naval-parameters').value),{cityIds:[8]});
 let reading=h.node('gp-naval-load').click();h.respond('/api/gameplay',navalEditorData(),{module:'naval'});await reading;apply.click();target.click();assert.deepEqual(JSON.parse(h.node('gp-naval-parameters').value),{cityIds:[8]});
 const latest=navalEditorApply(h);reading=h.node('gp-naval-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay',navalEditorData(),{module:'naval'});await reading;latest.click();target.click();assert.equal(h.node('gp-naval-observations').textContent,'');assert.equal(writes(h).length,0);
});

test('naval pending, UNKNOWN, running, disconnect and busy states lock professional filters',async()=>{
 const h=await navalEditorPage(),apply=navalEditorApply(h),reading=h.node('gp-naval-load').click();assert.equal(apply.disabled,true);apply.click();h.respond('/api/gameplay',navalEditorData(),{module:'naval'});await reading;
 for(const status of [{blocked:true,running:false,state:'UNKNOWN'},{blocked:false,running:true}]){const data=navalEditorData();data.status=status;const read=h.node('gp-naval-load').click();h.respond('/api/gameplay',data,{module:'naval'});await read;assert.equal(navalEditorApply(h).disabled,true);navalEditorApply(h).click();}
 for(const state of ["snapshot={...snapshot,connected:false}","snapshot={...snapshot,busy:'other-operation'}"]){const other=await navalEditorPage();other.run(state);navalEditorApply(other).click();assert.equal(writes(other).length,0);}
 assert.equal(writes(h).length,0);
});


const navalRuleNodes=h=>descendants(h.node('gp-naval-rules'));
const navalRuleButton=(h,key)=>navalRuleNodes(h).find(n=>n.dataset.navalRuleAction===key);
const navalRuleField=(h,index,key)=>navalRuleNodes(h).find(n=>n.dataset.navalRuleIndex===String(index)&&n.dataset.navalRuleField===key);
function navalRuleEdit(h,index,key,value) {const input=navalRuleField(h,index,key);assert.ok(input,'missing rule field '+index+':'+key);input.value=value;(input.oninput||input.onchange)();}
function navalRuleAdd(h,id,type,value) {navalRuleButton(h,'add').click();const index=navalRuleNodes(h).filter(n=>n.dataset.navalRuleField==='id').length-1;navalRuleEdit(h,index,'id',id);navalRuleEdit(h,index,'type',type);navalRuleEdit(h,index,'value',value);}

test('naval ordered rule form keeps exact target text and explicit false and zero values on the original configuration save path',async()=>{
 const h=await navalEditorPage(),source=h.node('gp-naval-config').value;navalRuleAdd(h,'target','targetId','9007199254740995:<img onerror=alert(1)>');navalRuleAdd(h,'guild','sameGuild','false');navalRuleAdd(h,'fuel','minPetrol','0');assert.equal(h.node('gp-naval-config').value,source);assert.equal(writes(h).length,0);
 navalRuleButton(h,'apply').click();const config=JSON.parse(h.node('gp-naval-config').value);assert.deepEqual(config.rules,[{id:'target',type:'targetId',value:'9007199254740995:<img onerror=alert(1)>'},{id:'guild',type:'sameGuild',value:false},{id:'fuel',type:'minPetrol',value:0}]);assert.deepEqual(GAMEPLAY_MODULES.naval.validateConfig(config),config);assert.equal(h.node('gp-naval-plan').disabled,true);assert.equal(h.node('gp-naval-survey').disabled,false);assert.match(h.node('gp-naval-hint').textContent,/保存配置后重新探测/);
 const save=h.node('gp-naval-config-save').click();assertMutation(h.pending('/api/gameplay/config'),'/api/gameplay/config',{module:'naval',config});assert.equal(navalRuleButton(h,'apply').disabled,true);const data=navalEditorData({},(_f,c)=>Object.assign(c,config));h.respond('/api/gameplay/config',data);await save;assert.deepEqual(JSON.parse(h.node('gp-naval-config').value),config);assert.deepEqual(writes(h).map(r=>new URL(r.url,'http://localhost').pathname),['/api/gameplay/config']);assert.ok(navalRuleNodes(h).every(n=>n.tagName!=='img'));
});

test('naval ordered rules preserve draft values while reordering and invalidate detached callbacks',async()=>{
 const h=await navalEditorPage(navalEditorData({},(_f,c)=>{c.rules=[{id:'first',type:'minPetrol',value:7},{id:'second',type:'targetState',value:1}];})),oldApply=navalRuleButton(h,'apply');navalRuleEdit(h,0,'value','123');const oldValue=navalRuleField(h,0,'value');navalRuleButton(h,'down:0').click();oldValue.value='999';oldValue.oninput();oldApply.click();assert.equal(JSON.parse(h.node('gp-naval-config').value).rules[0].value,7);assert.equal(navalRuleField(h,1,'value').value,'123');navalRuleButton(h,'apply').click();assert.deepEqual(JSON.parse(h.node('gp-naval-config').value).rules,[{id:'second',type:'targetState',value:1},{id:'first',type:'minPetrol',value:123}]);
 navalRuleButton(h,'remove:0').click();navalRuleButton(h,'up:0').click();navalRuleButton(h,'apply').click();assert.deepEqual(JSON.parse(h.node('gp-naval-config').value).rules,[{id:'first',type:'minPetrol',value:123}]);navalRuleEdit(h,0,'value','5');navalRuleButton(h,'discard').click();assert.equal(navalRuleField(h,0,'value').value,'123');assert.equal(writes(h).length,0);
});

test('naval rule type changes require a new explicit value and never coerce numeric zero to boolean false',async()=>{
 const h=await navalEditorPage();navalRuleAdd(h,'x','minPetrol','0');navalRuleEdit(h,0,'type','sameGuild');assert.equal(navalRuleField(h,0,'value').value,'');const source=h.node('gp-naval-config').value;navalRuleButton(h,'apply').click();assert.equal(h.node('gp-naval-config').value,source);navalRuleEdit(h,0,'value','true');navalRuleButton(h,'apply').click();assert.deepEqual(JSON.parse(h.node('gp-naval-config').value).rules,[{id:'x',type:'sameGuild',value:true}]);assert.equal(writes(h).length,0);
});

for(const [label,id,type,value]of [['empty ID','','minPetrol','1'],['empty target','id','targetId',''],['negative','id','minDurability','-1'],['fraction','id','fleetState','1.2'],['exponent','id','targetState','1e2'],['unsafe integer','id','freshTarget','9007199254740992'],['empty integer','id','freshTarget',''],['implicit boolean','id','sameGuild','']])test('naval rule form rejects '+label+' without mutating configuration',async()=>{
 const h=await navalEditorPage(),source=h.node('gp-naval-config').value;navalRuleAdd(h,id,type,value);navalRuleButton(h,'apply').click();assert.equal(h.node('gp-naval-config').value,source);assert.match(h.node('gp-naval-hint').textContent,/规则未应用/);assert.equal(writes(h).length,0);
});

test('naval rule form refuses duplicate IDs and respects the existing 100-rule limit',async()=>{
 const h=await navalEditorPage(),source=h.node('gp-naval-config').value;navalRuleAdd(h,'same','minPetrol','1');navalRuleAdd(h,'same','targetState','1');navalRuleButton(h,'apply').click();assert.equal(h.node('gp-naval-config').value,source);assert.match(h.node('gp-naval-hint').textContent,/不重复/);
 const max=await navalEditorPage(navalEditorData({},(_f,c)=>{c.rules=Array.from({length:100},(_,i)=>({id:'r'+i,type:'minPetrol',value:0}));}));assert.equal(navalRuleButton(max,'add').disabled,true);navalRuleButton(max,'add').click();assert.equal(navalRuleNodes(max).filter(n=>n.dataset.navalRuleField==='id').length,100);navalRuleButton(max,'apply').click();assert.equal(GAMEPLAY_MODULES.naval.validateConfig(JSON.parse(max.node('gp-naval-config').value)).rules.length,100);assert.equal(writes(max).length,0);
});

test('naval malformed or unsupported old rules are retained for explicit JSON repair rather than dropped',async()=>{
 for(const rules of [null,[{id:'x',type:'playerSide',value:'LEFT'}],[{id:'x',type:'minPetrol',value:1,request:'untrusted'}]]){
  const data=navalEditorData();data.config.rules=rules;const h=await navalEditorPage(data),source=h.node('gp-naval-config').value;assert.match(h.node('gp-naval-rules').textContent,/高级配置JSON修正/);assert.equal(navalRuleButton(h,'apply'),undefined);assert.equal(h.node('gp-naval-config').value,source);assert.equal(writes(h).length,0);
  h.node('gp-naval-config').value=JSON.stringify({...data.config,rules:[]});h.node('gp-naval-config').oninput();assert.ok(navalRuleButton(h,'apply'));navalRuleAdd(h,'repaired','freshTarget','0');navalRuleButton(h,'apply').click();assert.equal(JSON.parse(h.node('gp-naval-config').value).rules[0].value,0);
 }
});

test('naval applying no rules keeps empty-rule UNKNOWN semantics and never invents default permissions',async()=>{
 const h=await navalEditorPage(navalEditorData({},(_f,c)=>{c.rules=[{id:'fuel',type:'minPetrol',value:1}];}));navalRuleButton(h,'remove:0').click();navalRuleButton(h,'apply').click();assert.deepEqual(JSON.parse(h.node('gp-naval-config').value).rules,[]);assert.match(h.node('gp-naval-rules').textContent,/缺事实保持UNKNOWN/);assert.equal(h.node('gp-naval-authorize').disabled,true);assert.equal(writes(h).length,0);
});

test('naval saved rule traces use original FAIL and UNKNOWN authority without borrowing mainline sides or a local clock',async()=>{
 const data=navalEditorData({},(f,c)=>{f.gameTime={status:'UNKNOWN',reliable:false};c.rules=[{id:'fuel',type:'minPetrol',value:600},{id:'age',type:'freshTarget',value:10}];}),h=await navalEditorPage(data);assert.deepEqual(data.view.targets.map(r=>r.status),['FAIL','FAIL','FAIL']);assert.ok(data.view.targets.every(r=>r.ruleTrace.find(t=>t.id==='age').status==='UNKNOWN'));assert.match(h.node('gp-naval-observations').textContent,/权威事实不符合规则/);assert.match(h.node('gp-naval-observations').textContent,/UNKNOWN/);assert.equal(h.node('gp-naval-plan').disabled,true);assert.equal(writes(h).length,0);
});

test('naval unsaved rule drafts survive same-source refresh but old callbacks cannot edit the new account-bound form',async()=>{
 const h=await navalEditorPage();navalRuleAdd(h,'keep','minPetrol','23');const oldApply=navalRuleButton(h,'apply'),oldField=navalRuleField(h,0,'value'),reading=h.node('gp-naval-load').click();assert.equal(oldApply.disabled,true);oldApply.click();h.respond('/api/gameplay',navalEditorData(),{module:'naval'});await reading;assert.equal(navalRuleField(h,0,'value').value,'23');oldField.value='999';oldField.oninput();oldApply.click();assert.deepEqual(JSON.parse(h.node('gp-naval-config').value).rules,[]);navalRuleButton(h,'apply').click();assert.equal(JSON.parse(h.node('gp-naval-config').value).rules[0].value,23);
 const apply=navalRuleButton(h,'apply'),late=h.node('gp-naval-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay',navalEditorData(),{module:'naval'});await late;apply.click();assert.equal(h.node('gp-naval-rules').textContent,'');assert.equal(writes(h).length,0);
});

test('naval config edits expire old rule drafts and pending or UNKNOWN never saves them implicitly',async()=>{
 const h=await navalEditorPage();navalRuleAdd(h,'old','minPetrol','1');const old=navalRuleButton(h,'apply');h.node('gp-naval-config').value=JSON.stringify({...navalEditorData().config,rules:[{id:'new',type:'targetState',value:2}]});h.node('gp-naval-config').oninput();old.click();assert.equal(navalRuleField(h,0,'id').value,'new');assert.equal(JSON.parse(h.node('gp-naval-config').value).rules[0].id,'new');
 const data=navalEditorData();data.status={running:false,blocked:true,state:'UNKNOWN'};const read=h.node('gp-naval-load').click();h.respond('/api/gameplay',data,{module:'naval'});await read;assert.equal(navalRuleButton(h,'apply').disabled,true);navalRuleButton(h,'apply').click();assert.equal(writes(h).length,0);
});


function numberConfigData(id){return {accountId:'A',module:id,csrfToken:'synthetic-csrf-A',config:structuredClone(GAMEPLAY_MODULES[id].defaultConfig),view:{candidates:[],blocked:[]},status:{blocked:false,running:false},functions:[]};}
async function numberConfigPage(id,data=numberConfigData(id)){const h=await boot(),read=h.node('gp-'+id+'-load').click();h.respond('/api/gameplay',data,{module:id});await read;return h;}
const numberConfigNodes=(h,id)=>descendants(h.node('gp-'+id+'-config-fields'));
const numberConfigField=(h,id,key)=>numberConfigNodes(h,id).find(n=>n.dataset.configNumber===key);
const numberConfigApply=(h,id)=>numberConfigNodes(h,id).find(n=>n.dataset.configNumbersApply===id);
function numberConfigEdit(h,id,values){for(const [key,value]of Object.entries(values)){const field=numberConfigField(h,id,key);assert.ok(field,'missing '+id+':'+key);field.value=value;field.oninput();}}

for(const [id,values]of [
 ['fleet',{repairBelowDurabilityRatio:'0.5',maximumRepairPetrolPerPlan:'1000',minimumDurabilityRatio:'1',petrolReserve:'0',scenarioId:'2'}],
 ['treasure',{maxFleets:'2',minimumDurabilityRatio:'0.75',petrolReserve:'300'}],
 ['museum',{maxActionsPerPlan:'2',maximumSpeedItems:'0',minimumRevenue:'1'}],
 ['alliance',{maxDailyHelps:'0',maxActionsPerPlan:'2'}]
])test(id+' numeric configuration uses explicit draft values and the existing account save API without executing',async()=>{
 const h=await numberConfigPage(id),before=h.node('gp-'+id+'-config').value,requests=h.requests.length;numberConfigEdit(h,id,values);assert.equal(h.node('gp-'+id+'-config').value,before);numberConfigApply(h,id).click();const config=JSON.parse(h.node('gp-'+id+'-config').value);for(const [key,value]of Object.entries(values))assert.equal(config[key],Number(value));assert.deepEqual(GAMEPLAY_MODULES[id].validateConfig(config),config);assert.equal(h.requests.length,requests);assert.equal(h.node('gp-'+id+'-plan').disabled,true);assert.match(h.node('gp-'+id+'-hint').textContent,/保存后重新探测/);
 const saving=h.node('gp-'+id+'-config-save').click();assertMutation(h.pending('/api/gameplay/config'),'/api/gameplay/config',{module:id,config});const data=numberConfigData(id);data.config=config;h.respond('/api/gameplay/config',data);await saving;assert.deepEqual(JSON.parse(h.node('gp-'+id+'-config').value),config);assert.deepEqual(writes(h).map(r=>new URL(r.url,'http://localhost').pathname),['/api/gameplay/config']);
});

for(const [key,value]of [['maxFleets','0'],['maxFleets','1.5'],['maxFleets',''],['maxFleets','1e0'],['maxFleets',' 1'],['petrolReserve','1000000001'],['petrolReserve','NaN'],['minimumDurabilityRatio','0'],['minimumDurabilityRatio','1.1'],['minimumDurabilityRatio','-0.1']])test('numeric config rejects '+key+'='+JSON.stringify(value)+' atomically using the existing scalar contract',async()=>{
 const h=await numberConfigPage('treasure'),before=h.node('gp-treasure-config').value;numberConfigEdit(h,'treasure',{petrolReserve:'25',[key]:value});numberConfigApply(h,'treasure').click();assert.equal(h.node('gp-treasure-config').value,before);assert.match(h.node('gp-treasure-hint').textContent,/数值未应用/);assert.equal(writes(h).length,0);
});

test('numeric config draft discard and ordinary refresh keep edits scoped to the original source',async()=>{
 const h=await numberConfigPage('fleet'),apply=numberConfigApply(h,'fleet'),field=numberConfigField(h,'fleet','petrolReserve');numberConfigEdit(h,'fleet',{petrolReserve:'123'});let reading=h.node('gp-fleet-load').click();assert.equal(apply.disabled,true);h.respond('/api/gameplay',numberConfigData('fleet'),{module:'fleet'});await reading;assert.equal(numberConfigField(h,'fleet','petrolReserve').value,'123');field.value='999';field.oninput();apply.click();assert.equal(JSON.parse(h.node('gp-fleet-config').value).petrolReserve,0);numberConfigApply(h,'fleet').click();assert.equal(JSON.parse(h.node('gp-fleet-config').value).petrolReserve,123);
 numberConfigEdit(h,'fleet',{petrolReserve:'45'});numberConfigNodes(h,'fleet').find(n=>n.dataset.configNumbersDiscard==='fleet').click();assert.equal(numberConfigField(h,'fleet','petrolReserve').value,'123');assert.equal(writes(h).length,0);
});

test('advanced config changes expire old numeric and boolean callbacks while retaining untouched lists and rejecting unknown fields on the original adapter',async()=>{
 const h=await numberConfigPage('alliance'),oldApply=numberConfigApply(h,'alliance'),oldBoolean=numberConfigNodes(h,'alliance').find(n=>n.type==='checkbox');const config={...numberConfigData('alliance').config,memberIds:['9007199254740995'],stockItemIds:['木材'],stockReserveQuantities:[7],unknown:'keep-for-rejection'};h.node('gp-alliance-config').value=JSON.stringify(config);h.node('gp-alliance-config').oninput();oldBoolean.checked=true;oldBoolean.onchange();oldApply.click();numberConfigEdit(h,'alliance',{maxDailyHelps:'4'});numberConfigApply(h,'alliance').click();const actual=JSON.parse(h.node('gp-alliance-config').value);assert.deepEqual(actual,{...config,maxDailyHelps:4});assert.throws(()=>GAMEPLAY_MODULES.alliance.validateConfig(actual));assert.equal(writes(h).length,0);
});

test('numeric controls and stale booleans lock for running and UNKNOWN and cannot cross account generations',async()=>{
 const h=await numberConfigPage('treasure'),apply=numberConfigApply(h,'treasure'),input=numberConfigField(h,'treasure','maxFleets'),boolean=numberConfigNodes(h,'treasure').find(n=>n.type==='checkbox');numberConfigEdit(h,'treasure',{maxFleets:'2'});
 for(const status of [{blocked:true,running:false,state:'UNKNOWN'},{blocked:false,running:true}]){const data=numberConfigData('treasure');data.status=status;const reading=h.node('gp-treasure-load').click();h.respond('/api/gameplay',data,{module:'treasure'});await reading;assert.equal(numberConfigApply(h,'treasure').disabled,true);numberConfigApply(h,'treasure').click();assert.ok(numberConfigNodes(h,'treasure').filter(n=>n.type==='checkbox').every(n=>n.disabled));}
 const late=h.node('gp-treasure-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay',numberConfigData('treasure'),{module:'treasure'});await late;apply.click();input.value='9';input.oninput();boolean.checked=true;boolean.onchange();assert.equal(h.node('gp-treasure-config').value,'{}');assert.equal(h.node('gp-treasure-config-fields').textContent,'');assert.equal(writes(h).length,0);
});

test('numeric form never treats basic scalar validation as domain qualification or a saved budget',async()=>{
 const h=await numberConfigPage('treasure');numberConfigEdit(h,'treasure',{maxFleets:'11'});numberConfigApply(h,'treasure').click();const config=JSON.parse(h.node('gp-treasure-config').value);assert.throws(()=>GAMEPLAY_MODULES.treasure.validateConfig(config),{code:'INVALID_INPUT'});const saving=h.node('gp-treasure-config-save').click();assertMutation(h.pending('/api/gameplay/config'),'/api/gameplay/config',{module:'treasure',config});h.respond('/api/gameplay/config',{error:'寻宝规则无效',code:'INVALID_INPUT'},{ok:false});await saving;assert.match(h.node('gp-treasure-hint').textContent,/操作停止/);assert.equal(JSON.parse(h.node('gp-treasure-config').value).maxFleets,11);assert.equal(h.node('gp-treasure-plan').disabled,true);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});


test('numeric drafts survive ordinary boolean edits while replaced boolean callbacks cannot overwrite the new draft',async()=>{
 const h=await numberConfigPage('treasure');numberConfigEdit(h,'treasure',{maxFleets:'3',petrolReserve:'45'});const boolean=numberConfigNodes(h,'treasure').find(n=>n.type==='checkbox');boolean.checked=true;boolean.onchange();assert.equal(numberConfigField(h,'treasure','maxFleets').value,'3');assert.equal(numberConfigField(h,'treasure','petrolReserve').value,'45');boolean.checked=false;boolean.onchange();assert.equal(JSON.parse(h.node('gp-treasure-config').value).enabled,true);numberConfigApply(h,'treasure').click();assert.equal(JSON.parse(h.node('gp-treasure-config').value).maxFleets,3);assert.equal(JSON.parse(h.node('gp-treasure-config').value).petrolReserve,45);assert.equal(writes(h).length,0);
});


const configListNodes=(h,id)=>descendants(h.node('gp-'+id+'-config-fields'));
const configListButton=(h,id,key)=>configListNodes(h,id).find(n=>n.dataset.configListAction===key);
const configListField=(h,id,key,index,field='value')=>configListNodes(h,id).find(n=>n.dataset.configList===key&&n.dataset.configListIndex===String(index)&&n.dataset.configListField===field);
function configListEdit(h,id,key,index,value,field='value'){const input=configListField(h,id,key,index,field);assert.ok(input,'missing list field '+key+':'+index+':'+field);input.value=value;(input.oninput||input.onchange)();}
function configListAdd(h,id,key,value,quantity){configListButton(h,id,'add:'+key).click();const index=configListNodes(h,id).filter(n=>n.dataset.configList===key&&n.dataset.configListField==='value').length-1;configListEdit(h,id,key,index,value);if(quantity!==undefined)configListEdit(h,id,key,index,quantity,'quantity');}

test('alliance list forms retain exact int64 identities, original item text and aligned stock and daily budget pairs through the original save API',async()=>{
 const h=await numberConfigPage('alliance'),source=h.node('gp-alliance-config').value;
 for(const [key,value,quantity]of [['memberIds','9007199254740995'],['priorityMemberIds','9223372036854775807'],['itemIds','<img onerror=alert(1)>'],['priorityItemIds',' 木材 '],['stockItemIds','木材','0'],['stockItemIds','粗铁','1000000000'],['dailyBudgetItemIds','木材','7']])configListAdd(h,'alliance',key,value,quantity);
 assert.equal(h.node('gp-alliance-config').value,source);configListButton(h,'alliance','apply').click();const config=JSON.parse(h.node('gp-alliance-config').value);assert.deepEqual(config.memberIds,['9007199254740995']);assert.deepEqual(config.priorityMemberIds,['9223372036854775807']);assert.deepEqual(config.itemIds,['<img onerror=alert(1)>']);assert.deepEqual(config.priorityItemIds,[' 木材 ']);assert.deepEqual(config.stockItemIds,['木材','粗铁']);assert.deepEqual(config.stockReserveQuantities,[0,1000000000]);assert.deepEqual(config.dailyBudgetItemIds,['木材']);assert.deepEqual(config.dailyBudgetQuantities,[7]);assert.deepEqual(GAMEPLAY_MODULES.alliance.validateConfig(config),config);assert.equal(writes(h).length,0);assert.ok(configListNodes(h,'alliance').every(n=>n.tagName!=='img'));assert.match(h.node('gp-alliance-config-fields').textContent,/不推断日界/);
 const save=h.node('gp-alliance-config-save').click();assertMutation(h.pending('/api/gameplay/config'),'/api/gameplay/config',{module:'alliance',config});const data=numberConfigData('alliance');data.config=config;h.respond('/api/gameplay/config',data);await save;assert.deepEqual(writes(h).map(r=>new URL(r.url,'http://localhost').pathname),['/api/gameplay/config']);assert.equal(h.node('gp-alliance-plan').disabled,true);assert.equal(h.node('gp-alliance-authorize').disabled,true);
});

test('museum inventory reserve pairs move and delete as complete rows with exact quantities',async()=>{
 const h=await numberConfigPage('museum');configListAdd(h,'museum','stockItemIds','木材','5');configListAdd(h,'museum','stockItemIds','博物馆加速','0');const stale=configListButton(h,'museum','apply'),field=configListField(h,'museum','stockItemIds',0,'quantity');configListButton(h,'museum','down:stockItemIds:0').click();field.value='99';field.oninput();stale.click();assert.deepEqual(JSON.parse(h.node('gp-museum-config').value).stockItemIds,[]);configListButton(h,'museum','apply').click();let config=JSON.parse(h.node('gp-museum-config').value);assert.deepEqual(config.stockItemIds,['博物馆加速','木材']);assert.deepEqual(config.stockReserveQuantities,[0,5]);assert.deepEqual(GAMEPLAY_MODULES.museum.validateConfig(config),config);configListButton(h,'museum','remove:stockItemIds:0').click();configListButton(h,'museum','apply').click();config=JSON.parse(h.node('gp-museum-config').value);assert.deepEqual(config.stockItemIds,['木材']);assert.deepEqual(config.stockReserveQuantities,[5]);assert.equal(writes(h).length,0);
});

test('treasure color form keeps explicit order and original domain values without choosing a replacement',async()=>{
 const h=await numberConfigPage('treasure');configListAdd(h,'treasure','colors','3');configListAdd(h,'treasure','colors','4');configListButton(h,'treasure','up:colors:2').click();configListButton(h,'treasure','apply').click();const config=JSON.parse(h.node('gp-treasure-config').value);assert.deepEqual(config.colors,[5,4,3]);assert.deepEqual(GAMEPLAY_MODULES.treasure.validateConfig(config),config);for(let i=2;i>=0;i--)configListButton(h,'treasure','remove:colors:'+i).click();const before=h.node('gp-treasure-config').value;configListButton(h,'treasure','apply').click();assert.equal(h.node('gp-treasure-config').value,before);assert.match(h.node('gp-treasure-hint').textContent,/列表未应用/);assert.equal(writes(h).length,0);
});

for(const [label,key,value,quantity]of [
 ['zero member','memberIds','0'],['leading zero member','memberIds','01'],['overflow member','memberIds','9223372036854775808'],['exponent member','memberIds','1e3'],['empty member','memberIds',''],['blank item','itemIds',' '],['oversized item','itemIds','x'.repeat(201)],['missing quantity','stockItemIds','木材',''],['negative quantity','stockItemIds','木材','-1'],['fraction quantity','stockItemIds','木材','0.5'],['exponent quantity','dailyBudgetItemIds','木材','1e3'],['overflow quantity','dailyBudgetItemIds','木材','1000000001']
])test('paired list config rejects '+label+' atomically without touching other lists',async()=>{
 const h=await numberConfigPage('alliance'),before=h.node('gp-alliance-config').value;configListAdd(h,'alliance','priorityItemIds','valid earlier change');configListAdd(h,'alliance',key,value,quantity);configListButton(h,'alliance','apply').click();assert.equal(h.node('gp-alliance-config').value,before);assert.match(h.node('gp-alliance-hint').textContent,/列表未应用/);assert.equal(writes(h).length,0);
});

test('list configuration rejects duplicate identities and forged color values while respecting the original 100-row limit',async()=>{
 const h=await numberConfigPage('alliance'),before=h.node('gp-alliance-config').value;configListAdd(h,'alliance','stockItemIds','木材','1');configListAdd(h,'alliance','stockItemIds','木材','2');configListButton(h,'alliance','apply').click();assert.equal(h.node('gp-alliance-config').value,before);assert.match(h.node('gp-alliance-hint').textContent,/不能重复/);
 const data=numberConfigData('alliance');data.config.memberIds=Array.from({length:100},(_,i)=>String(i+1));const max=await numberConfigPage('alliance',data);assert.equal(configListButton(max,'alliance','add:memberIds').disabled,true);configListButton(max,'alliance','add:memberIds').click();configListButton(max,'alliance','apply').click();assert.equal(JSON.parse(max.node('gp-alliance-config').value).memberIds.length,100);
 for(const value of ['2','5','3.0']){const color=await numberConfigPage('treasure'),source=color.node('gp-treasure-config').value;configListAdd(color,'treasure','colors',value);configListButton(color,'treasure','apply').click();assert.equal(color.node('gp-treasure-config').value,source);assert.equal(writes(color).length,0);}
});

test('bad old list structures remain untouched until explicit advanced repair, including mismatched identity and quantity arrays',async()=>{
 for(const change of [c=>c.stockReserveQuantities=[1],c=>{c.stockItemIds=['木材'];c.stockReserveQuantities=[];},c=>c.memberIds=[9007199254740992],c=>c.memberIds=['01'],c=>{c.stockItemIds=['木材'];c.stockReserveQuantities=['1'];}]){
  const data=numberConfigData('alliance');change(data.config);const h=await numberConfigPage('alliance',data),before=h.node('gp-alliance-config').value;assert.equal(configListButton(h,'alliance','apply'),undefined);assert.match(h.node('gp-alliance-config-fields').textContent,/高级配置JSON明确修正/);assert.equal(h.node('gp-alliance-config').value,before);h.node('gp-alliance-config').value=JSON.stringify(numberConfigData('alliance').config);h.node('gp-alliance-config').oninput();configListAdd(h,'alliance','stockItemIds','木材','0');configListButton(h,'alliance','apply').click();assert.deepEqual(JSON.parse(h.node('gp-alliance-config').value).stockReserveQuantities,[0]);assert.equal(writes(h).length,0);
 }
});

test('explicitly deleting optional pairs applies empty arrays and never substitutes an implicit zero row',async()=>{
 const data=numberConfigData('museum');data.config.stockItemIds=['木材'];data.config.stockReserveQuantities=[7];const h=await numberConfigPage('museum',data);configListButton(h,'museum','remove:stockItemIds:0').click();configListButton(h,'museum','apply').click();const config=JSON.parse(h.node('gp-museum-config').value);assert.deepEqual(config.stockItemIds,[]);assert.deepEqual(config.stockReserveQuantities,[]);assert.deepEqual(GAMEPLAY_MODULES.museum.validateConfig(config),config);assert.equal(writes(h).length,0);
});

test('list and numeric drafts preserve each other across explicit applications and ordinary switch edits',async()=>{
 const h=await numberConfigPage('alliance');numberConfigEdit(h,'alliance',{maxDailyHelps:'8'});configListAdd(h,'alliance','stockItemIds','木材','7');const boolean=configListNodes(h,'alliance').find(n=>n.type==='checkbox');boolean.checked=true;boolean.onchange();assert.equal(configListField(h,'alliance','stockItemIds',0).value,'木材');assert.equal(numberConfigField(h,'alliance','maxDailyHelps').value,'8');numberConfigApply(h,'alliance').click();assert.equal(configListField(h,'alliance','stockItemIds',0,'quantity').value,'7');configListButton(h,'alliance','apply').click();const config=JSON.parse(h.node('gp-alliance-config').value);assert.equal(config.enabled,true);assert.equal(config.maxDailyHelps,8);assert.deepEqual(config.stockReserveQuantities,[7]);numberConfigEdit(h,'alliance',{maxDailyHelps:'9'});configListAdd(h,'alliance','itemIds','粗铁');configListButton(h,'alliance','apply').click();assert.equal(numberConfigField(h,'alliance','maxDailyHelps').value,'9');numberConfigApply(h,'alliance').click();assert.equal(JSON.parse(h.node('gp-alliance-config').value).maxDailyHelps,9);assert.equal(writes(h).length,0);
});

test('unsaved list drafts survive same-source refresh and detached row callbacks cannot change the new view',async()=>{
 const h=await numberConfigPage('museum');configListAdd(h,'museum','stockItemIds','木材','7');const apply=configListButton(h,'museum','apply'),field=configListField(h,'museum','stockItemIds',0),read=h.node('gp-museum-load').click();assert.equal(apply.disabled,true);h.respond('/api/gameplay',numberConfigData('museum'),{module:'museum'});await read;assert.equal(configListField(h,'museum','stockItemIds',0).value,'木材');field.value='old injected';field.oninput();apply.click();assert.deepEqual(JSON.parse(h.node('gp-museum-config').value).stockItemIds,[]);configListButton(h,'museum','apply').click();assert.deepEqual(JSON.parse(h.node('gp-museum-config').value).stockItemIds,['木材']);
 const reread=h.node('gp-museum-load').click();h.respond('/api/gameplay',numberConfigData('museum'),{module:'museum'});await reread;assert.equal(configListButton(h,'museum','apply').disabled,false);configListAdd(h,'museum','stockItemIds','粗铁','9');configListButton(h,'museum','discard').click();assert.equal(configListField(h,'museum','stockItemIds',1),undefined);assert.equal(writes(h).length,0);
});

test('advanced list edits expire old callbacks and preserve unknown config fields for original domain rejection',async()=>{
 const h=await numberConfigPage('alliance');configListAdd(h,'alliance','memberIds','9007199254740995');const old=configListButton(h,'alliance','apply'),config={...numberConfigData('alliance').config,unknown:'original-rejection',memberIds:['42']};h.node('gp-alliance-config').value=JSON.stringify(config);h.node('gp-alliance-config').oninput();old.click();assert.equal(configListField(h,'alliance','memberIds',0).value,'42');configListButton(h,'alliance','apply').click();const actual=JSON.parse(h.node('gp-alliance-config').value);assert.deepEqual(actual,config);assert.throws(()=>GAMEPLAY_MODULES.alliance.validateConfig(actual));assert.equal(writes(h).length,0);
});

test('list controls lock during pending, UNKNOWN, running and busy states and cannot survive account changes or late responses',async()=>{
 const h=await numberConfigPage('alliance');configListAdd(h,'alliance','memberIds','42');const old=configListButton(h,'alliance','apply'),field=configListField(h,'alliance','memberIds',0);
 for(const status of [{blocked:true,running:false,state:'UNKNOWN'},{blocked:false,running:true}]){const data=numberConfigData('alliance');data.status=status;const read=h.node('gp-alliance-load').click();assert.equal(configListButton(h,'alliance','apply').disabled,true);h.respond('/api/gameplay',data,{module:'alliance'});await read;assert.equal(configListButton(h,'alliance','apply').disabled,true);configListButton(h,'alliance','apply').click();}
 const late=h.node('gp-alliance-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay',numberConfigData('alliance'),{module:'alliance'});await late;old.click();field.value='99';field.oninput();assert.equal(h.node('gp-alliance-config-fields').textContent,'');assert.equal(h.node('gp-alliance-config').value,'{}');assert.equal(writes(h).length,0);
 const busy=await numberConfigPage('museum');configListAdd(busy,'museum','stockItemIds','木材','1');busy.run("snapshot={...snapshot,busy:'other-operation'}");configListButton(busy,'museum','apply').click();assert.deepEqual(JSON.parse(busy.node('gp-museum-config').value).stockItemIds,[]);assert.equal(writes(busy).length,0);
});


const configRepairMode=h=>configListNodes(h,'fleet').find(n=>n.dataset.configRepairMode);
function configRepairModeEdit(h,value){const mode=configRepairMode(h);mode.value=value;mode.onchange();}

test('fleet repair mode and explicit priority order use the original account configuration path without selecting or authorizing fleets',async()=>{
 const h=await numberConfigPage('fleet'),before=h.node('gp-fleet-config').value;configListAdd(h,'fleet','repairPriorityBuildingIds','f1');configListAdd(h,'fleet','repairPriorityBuildingIds','f2');configRepairModeEdit(h,'WAIT_NATURAL');configListButton(h,'fleet','up:repairPriorityBuildingIds:1').click();assert.equal(configRepairMode(h).value,'WAIT_NATURAL');assert.equal(h.node('gp-fleet-config').value,before);configListButton(h,'fleet','apply').click();const config=JSON.parse(h.node('gp-fleet-config').value);assert.equal(config.repairMode,'WAIT_NATURAL');assert.deepEqual(config.repairPriorityBuildingIds,['f2','f1']);assert.deepEqual(GAMEPLAY_MODULES.fleet.validateConfig(config),config);assert.equal(config.repair,false);assert.equal(h.node('gp-fleet-plan').disabled,true);assert.equal(writes(h).length,0);
 const save=h.node('gp-fleet-config-save').click();assertMutation(h.pending('/api/gameplay/config'),'/api/gameplay/config',{module:'fleet',config});const data=numberConfigData('fleet');data.config=config;h.respond('/api/gameplay/config',data);await save;assert.equal(configRepairMode(h).value,'WAIT_NATURAL');assert.deepEqual(writes(h).map(r=>new URL(r.url,'http://localhost').pathname),['/api/gameplay/config']);assert.match(h.node('gp-fleet-config-fields').textContent,/只排列已明确选择/);assert.match(h.node('gp-fleet-config-fields').textContent,/不会推算恢复时间/);
});

test('fleet natural recovery mode remains observation-only after original config save and survey without invented recovery times',async()=>{
 const facts=fleetEditorFacts();facts.fleets[0].durability=50;facts.stock.set('汽油',5000);facts.protocolReady.RepairFleetRequest=true;facts.repairParams.set('f1',{unitRepairCost:2.2,unitRepairTime:0.15});const data=numberConfigData('fleet');data.config={...data.config,enabled:true,repair:true,maximumRepairPetrolPerPlan:1000};data.view=fleetView(facts,{moduleConfig:data.config});data.view.candidates=data.view.candidates.map(({action,...row})=>({...row,executable:Boolean(action)&&row.decision!=='BLOCKED'}));const h=await numberConfigPage('fleet',data);configRepairModeEdit(h,'WAIT_NATURAL');configListButton(h,'fleet','apply').click();const config=JSON.parse(h.node('gp-fleet-config').value),save=h.node('gp-fleet-config-save').click(),saved={...data,config};h.respond('/api/gameplay/config',saved);await save;
 const survey=h.node('gp-fleet-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'fleet',parameters:{}});const view=fleetView(facts,{moduleConfig:config});const candidate=view.candidates.find(r=>r.actionType==='fleetRepair');assert.equal(candidate.reason,'WAIT_NATURAL_OBSERVATION_ONLY');assert.equal(candidate.action,null);assert.equal(Object.hasOwn(candidate.expectedState,'naturalRecoveryAt'),false);view.candidates=view.candidates.map(({action,...row})=>({...row,executable:Boolean(action)&&row.decision!=='BLOCKED'}));h.respond('/api/gameplay/survey',{...saved,view});await survey;
 const choose=descendants(h.node('gp-fleet-operations')).find(n=>n.dataset.fleetOperation===candidate.actionId);assert.equal(choose.disabled,true);choose.click();assert.equal(h.node('gp-fleet-plan').disabled,true);assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

for(const value of ['AUTO','','immediate',1])test('fleet repair mode refuses forged value '+JSON.stringify(value)+' atomically',async()=>{
 const h=await numberConfigPage('fleet'),before=h.node('gp-fleet-config').value;configListAdd(h,'fleet','repairPriorityBuildingIds','f1');configRepairModeEdit(h,value);configListButton(h,'fleet','apply').click();assert.equal(h.node('gp-fleet-config').value,before);assert.match(h.node('gp-fleet-hint').textContent,/列表未应用/);assert.equal(writes(h).length,0);
});

for(const value of [' f1','f1 ','', 'x'.repeat(301)])test('fleet repair priority refuses invalid exact ID '+JSON.stringify(value.slice(0,12))+' atomically',async()=>{
 const h=await numberConfigPage('fleet'),before=h.node('gp-fleet-config').value;configRepairModeEdit(h,'WAIT_NATURAL');configListAdd(h,'fleet','repairPriorityBuildingIds',value);configListButton(h,'fleet','apply').click();assert.equal(h.node('gp-fleet-config').value,before);assert.match(h.node('gp-fleet-hint').textContent,/列表未应用/);assert.equal(writes(h).length,0);
});

test('fleet repair priority rejects duplicates, allows the original 300-character boundary and preserves exact unsafe-looking text in safe DOM',async()=>{
 const h=await numberConfigPage('fleet'),before=h.node('gp-fleet-config').value;configListAdd(h,'fleet','repairPriorityBuildingIds','f1');configListAdd(h,'fleet','repairPriorityBuildingIds','f1');configListButton(h,'fleet','apply').click();assert.equal(h.node('gp-fleet-config').value,before);configListButton(h,'fleet','remove:repairPriorityBuildingIds:1').click();configListEdit(h,'fleet','repairPriorityBuildingIds',0,'x'.repeat(300));configListAdd(h,'fleet','repairPriorityBuildingIds','<img onerror=alert(1)>');configListButton(h,'fleet','apply').click();const config=JSON.parse(h.node('gp-fleet-config').value);assert.deepEqual(config.repairPriorityBuildingIds,['x'.repeat(300),'<img onerror=alert(1)>']);assert.deepEqual(GAMEPLAY_MODULES.fleet.validateConfig(config),config);assert.ok(configListNodes(h,'fleet').every(n=>n.tagName!=='img'));assert.equal(writes(h).length,0);
});

test('fleet unsupported old repair mode and priority structures require explicit JSON repair without replacing them',async()=>{
 for(const change of [c=>c.repairMode='AUTO',c=>c.repairPriorityBuildingIds=null,c=>c.repairPriorityBuildingIds=[42]]){const data=numberConfigData('fleet');change(data.config);const h=await numberConfigPage('fleet',data),before=h.node('gp-fleet-config').value;assert.equal(configRepairMode(h),undefined);assert.match(h.node('gp-fleet-config-fields').textContent,/高级配置JSON明确修正/);assert.equal(h.node('gp-fleet-config').value,before);assert.equal(writes(h).length,0);}
});

test('fleet repair draft survives numeric and switch edits but stale mode callbacks cannot overwrite refreshed or switched accounts',async()=>{
 const h=await numberConfigPage('fleet');configRepairModeEdit(h,'WAIT_NATURAL');configListAdd(h,'fleet','repairPriorityBuildingIds','f2');numberConfigEdit(h,'fleet',{maximumRepairPetrolPerPlan:'300'});numberConfigApply(h,'fleet').click();assert.equal(configRepairMode(h).value,'WAIT_NATURAL');const boolean=configListNodes(h,'fleet').find(n=>n.type==='checkbox');boolean.checked=true;boolean.onchange();assert.equal(configRepairMode(h).value,'WAIT_NATURAL');const stale=configRepairMode(h),apply=configListButton(h,'fleet','apply'),reading=h.node('gp-fleet-load').click();assert.equal(stale.disabled,true);h.respond('/api/gameplay',numberConfigData('fleet'),{module:'fleet'});await reading;assert.equal(configRepairMode(h).value,'WAIT_NATURAL');stale.value='IMMEDIATE';stale.onchange();apply.click();assert.equal(configRepairMode(h).value,'WAIT_NATURAL');configListButton(h,'fleet','apply').click();assert.equal(JSON.parse(h.node('gp-fleet-config').value).repairMode,'WAIT_NATURAL');
 const mode=configRepairMode(h),oldApply=configListButton(h,'fleet','apply'),late=h.node('gp-fleet-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay',numberConfigData('fleet'),{module:'fleet'});await late;mode.value='IMMEDIATE';mode.onchange();oldApply.click();assert.equal(h.node('gp-fleet-config').value,'{}');assert.equal(h.node('gp-fleet-config-fields').textContent,'');assert.equal(writes(h).length,0);
});


const workflowDragHandle=(h,id)=>descendants(workflowCard(h,id)).find(n=>n.dataset.workflowNodeDrag===id);
const workflowDragEnd=h=>descendants(h.node('wf-nodes')).find(n=>n.dataset.workflowNodeDropEnd);
function workflowDragEvent() {const values=new Map();return {prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},dataTransfer:{get types(){return [...values.keys()];},setData(key,value){values.set(key,value);},getData:key=>values.get(key)||''}};}

test('workflow native node drag preserves exact topology, selections, parameters and budgets while changing display order',async()=>{
 const h=await parameterPage('mail',{action:'read',pageNo:0,emailId:'9007199254740995'}),graph=conditionGraph(h);graph.budget={resources:[{id:'GOLD',num:10}],quotas:[],uids:[]};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();const before=conditionGraph(h),event=workflowDragEvent(),handle=workflowDragHandle(h,'business');assert.equal(handle.draggable,true);handle.ondragstart(event);assert.equal(event.dataTransfer.effectAllowed,'move');
 const over={...event,dataTransfer:{types:event.dataTransfer.types,getData(){throw Error('protected during dragover');}}};workflowCard(h,'start').ondragover(over);assert.equal(over.prevented,true);assert.equal(over.dataTransfer.dropEffect,'move');workflowCard(h,'start').ondrop(event);assert.equal(event.prevented,true);assert.equal(event.stopped,true);const after=conditionGraph(h);assert.deepEqual(after.nodes.map(n=>n.id),['business','start','stop']);assert.deepEqual(after.edges,before.edges);assert.deepEqual(after.budget,before.budget);assert.deepEqual([...after.nodes].sort((a,b)=>a.id.localeCompare(b.id)),[...before.nodes].sort((a,b)=>a.id.localeCompare(b.id)));assert.deepEqual(validateWorkflow(after,{modules:{mail:GAMEPLAY_MODULES.mail}}).order,validateWorkflow(before,{modules:{mail:GAMEPLAY_MODULES.mail}}).order);assert.match(h.node('wf-hint').textContent,/执行顺序仍由原DAG/);assert.equal(writes(h).length,0);
});

test('workflow node drag to end and the original keyboard-friendly move controls preserve node identities',async()=>{
 const h=await parameterPage(),event=workflowDragEvent();workflowDragHandle(h,'start').ondragstart(event);workflowDragEnd(h).ondragover(event);workflowDragEnd(h).ondrop(event);assert.deepEqual(conditionGraph(h).nodes.map(n=>n.id),['business','stop','start']);workflowCardButton(h,'start','上移').click();assert.deepEqual(conditionGraph(h).nodes.map(n=>n.id),['business','start','stop']);assert.equal(writes(h).length,0);
});

test('workflow drag rejects external or forged payloads, self drops, cancelled gestures and absent dataTransfer',async()=>{
 const h=await parameterPage(),source=h.node('wf-json').value;let event=workflowDragEvent();event.dataTransfer.setData('application/x-crazywater-workflow-node','business');workflowCard(h,'start').ondragover(event);workflowCard(h,'start').ondrop(event);assert.equal(event.prevented,false);assert.equal(h.node('wf-json').value,source);
 const handle=workflowDragHandle(h,'business');event=workflowDragEvent();handle.ondragstart(event);event.dataTransfer.setData('application/x-crazywater-workflow-node','forged');workflowCard(h,'start').ondrop(event);assert.equal(h.node('wf-json').value,source);event=workflowDragEvent();handle.ondragstart(event);workflowCard(h,'business').ondrop(event);assert.equal(h.node('wf-json').value,source);handle.ondragend();workflowCard(h,'start').ondrop(event);assert.equal(h.node('wf-json').value,source);const absent={prevented:false,preventDefault(){this.prevented=true;}};handle.ondragstart(absent);assert.equal(absent.prevented,true);assert.equal(writes(h).length,0);
});

test('workflow node drag expires after graph edits and replacement, and stale dragend cannot cancel a newer gesture',async()=>{
 const h=await parameterPage(),oldHandle=workflowDragHandle(h,'business'),oldTarget=workflowCard(h,'start');let event=workflowDragEvent();oldHandle.ondragstart(event);h.node('wf-name').value='edited';h.node('wf-name').oninput();let source=h.node('wf-json').value;oldTarget.ondrop(event);assert.equal(h.node('wf-json').value,source);const graph=conditionGraph(h);graph.nodes.find(n=>n.id==='business').parameters={pageNo:3};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();source=h.node('wf-json').value;oldHandle.ondragstart(event);oldTarget.ondrop(event);assert.equal(h.node('wf-json').value,source);event=workflowDragEvent();workflowDragHandle(h,'business').ondragstart(event);oldHandle.ondragend();workflowCard(h,'start').ondrop(event);assert.deepEqual(conditionGraph(h).nodes.map(n=>n.id),['business','start','stop']);assert.equal(writes(h).length,0);
});

test('workflow dragging locks while pending and running and an idle response does not resume a cancelled gesture',async()=>{
 const h=await parameterPage(),handle=workflowDragHandle(h,'business'),target=workflowCard(h,'start'),event=workflowDragEvent();handle.ondragstart(event);let reading=h.node('wf-load').click();assert.equal(handle.disabled,true);assert.equal(handle.draggable,false);const source=h.node('wf-json').value;target.ondrop(event);assert.equal(h.node('wf-json').value,source);h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await reading;target.ondrop(event);assert.equal(h.node('wf-json').value,source);const active=workflowDragHandle(h,'business');reading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await reading;assert.equal(active.disabled,true);assert.equal(active.draggable,false);active.ondragstart(event);workflowDragEnd(h).ondrop(event);assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('workflow drag callbacks cannot cross account generations or revive after a late workflow response',async()=>{
 const h=await parameterPage(),handle=workflowDragHandle(h,'business'),target=workflowCard(h,'start'),end=workflowDragEnd(h),event=workflowDragEvent();handle.ondragstart(event);const read=h.node('wf-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await read;const source=h.node('wf-json').value;handle.ondragstart(event);target.ondrop(event);end.ondrop(event);assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('workflow drag uses original save and simulate APIs with unchanged graph schema and zero game execution',async()=>{
 const h=await parameterPage('mail',{pageNo:0}),event=workflowDragEvent();workflowDragHandle(h,'business').ondragstart(event);workflowCard(h,'start').ondrop(event);const graph=conditionGraph(h),saving=h.node('wf-save').click(),save=h.pending('/api/workflows/save');assert.equal(new URL(save.url,'http://localhost').searchParams.get('account'),'A');assert.deepEqual(JSON.parse(save.options.body),{graph});h.respond('/api/workflows/save',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[graph],history:[]});await saving;const simulate=h.node('wf-simulate').click();assert.deepEqual(JSON.parse(h.pending('/api/workflows/simulate').options.body),{graph});h.respond('/api/workflows/simulate',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[graph],history:[],simulation:{valid:true}});await simulate;assert.equal(writes(h,'/api/workflows/start').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});


const workflowEdgeDragHandle=(h,id,when='ALWAYS')=>descendants(workflowCard(h,id)).find(n=>n.dataset.workflowEdgeFrom===id&&n.dataset.workflowEdgeWhen===when);
const workflowEdgeDrop=(h,id)=>descendants(workflowCard(h,id)).find(n=>n.dataset.workflowEdgeTo===id);
function workflowEdgeGesture(h,from,to,when='ALWAYS'){const event=workflowDragEvent();workflowEdgeDragHandle(h,from,when).ondragstart(event);workflowEdgeDrop(h,to).ondragover(event);workflowEdgeDrop(h,to).ondrop(event);return event;}
function workflowSetGraph(h,graph){h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').click();}

test('workflow direct edge dragging fills the original edge schema and validates through the existing DAG contract',async()=>{
 const h=await parameterPage('mail',{pageNo:0},'SURVEY'),graph=conditionGraph(h);graph.edges=[];workflowSetGraph(h,graph);const first=workflowEdgeGesture(h,'start','business');assert.equal(first.dataTransfer.effectAllowed,'link');assert.equal(first.dataTransfer.dropEffect,'link');assert.equal(first.prevented,true);workflowEdgeGesture(h,'business','stop');const next=conditionGraph(h);assert.deepEqual(next.edges,[{from:'start',to:'business'},{from:'business',to:'stop'}]);assert.equal(validateWorkflow(next,{modules:{mail:GAMEPLAY_MODULES.mail}}).valid,true);assert.deepEqual(next.nodes,graph.nodes);assert.match(h.node('wf-hint').textContent,/原Workflow验证完整分支/);assert.equal(workflowEdgeDrop(h,'start'),undefined);assert.equal(workflowEdgeDragHandle(h,'stop'),undefined);assert.equal(writes(h).length,0);
 const saving=h.node('wf-save').click();assert.deepEqual(JSON.parse(h.pending('/api/workflows/save').options.body),{graph:next});h.respond('/api/workflows/save',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[next],history:[]});await saving;assert.equal(writes(h,'/api/workflows/start').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);
});

test('workflow direct condition branches keep explicit PASS and FAIL semantics without inventing priority or true defaults',async()=>{
 const h=await parameterPage(),graph={version:1,id:'branch-drag',name:'branch drag',nodes:[{id:'start',type:'START'},{id:'check',type:'CONDITION',condition:{source:'survey',path:['ready'],operator:'EQ',value:true}},{id:'pass',type:'STOP'},{id:'fail',type:'STOP'}],edges:[{from:'start',to:'check'}]};workflowSetGraph(h,graph);workflowEdgeGesture(h,'check','pass','PASS');assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:{}}));workflowEdgeGesture(h,'check','fail','FAIL');const next=conditionGraph(h);assert.deepEqual(next.edges,[...graph.edges,{from:'check',to:'pass',when:'PASS'},{from:'check',to:'fail',when:'FAIL'}]);assert.equal(validateWorkflow(next,{modules:{}}).valid,true);assert.equal(evaluateWorkflowCondition(next.nodes[1].condition,{survey:{}}).status,'UNKNOWN');assert.equal(writes(h).length,0);
});

test('workflow direct edge dragging refuses duplicate exits, mixed unconditional branches, self edges and cycles atomically',async()=>{
 const h=await parameterPage('naval',{},'SURVEY');let source=h.node('wf-json').value;workflowEdgeGesture(h,'start','stop');assert.equal(h.node('wf-json').value,source);assert.match(h.node('wf-hint').textContent,/出口不能重复/);
 let graph=conditionGraph(h);graph.edges=[];workflowSetGraph(h,graph);source=h.node('wf-json').value;workflowEdgeGesture(h,'business','business');assert.equal(h.node('wf-json').value,source);assert.match(h.node('wf-hint').textContent,/禁止自连/);
 graph.nodes.splice(2,0,{id:'second',type:'SURVEY',module:'naval',parameters:{}});graph.edges=[{from:'start',to:'business'},{from:'business',to:'second'}];workflowSetGraph(h,graph);source=h.node('wf-json').value;workflowEdgeGesture(h,'second','business');assert.equal(h.node('wf-json').value,source);assert.match(h.node('wf-hint').textContent,/形成循环/);
 graph={version:1,id:'mixed',name:'mixed',nodes:[{id:'start',type:'START'},{id:'check',type:'CONDITION',condition:{source:'survey',path:['x'],operator:'EXISTS'}},{id:'stop',type:'STOP'}],edges:[{from:'check',to:'stop'}]};workflowSetGraph(h,graph);source=h.node('wf-json').value;workflowEdgeGesture(h,'check','stop','PASS');assert.equal(h.node('wf-json').value,source);assert.match(h.node('wf-hint').textContent,/不能与分支出口混用/);assert.equal(writes(h).length,0);
});

test('workflow edge drag respects original hundred-edge limit and protected browser dragover data',async()=>{
 const h=await parameterPage(),graph=conditionGraph(h);graph.edges=Array.from({length:100},()=>({from:'start',to:'business'}));workflowSetGraph(h,graph);const handle=workflowEdgeDragHandle(h,'business'),target=workflowEdgeDrop(h,'stop'),event=workflowDragEvent();handle.ondragstart(event);const over={...event,dataTransfer:{types:event.dataTransfer.types,getData(){throw Error('protected');}}};target.ondragover(over);assert.equal(over.prevented,true);const source=h.node('wf-json').value;target.ondrop(event);assert.equal(h.node('wf-json').value,source);assert.match(h.node('wf-hint').textContent,/数量上限/);assert.equal(writes(h).length,0);
});

test('workflow edge drag rejects external or forged edge payloads and cancelled gestures without editing the graph',async()=>{
 const h=await parameterPage(),target=workflowEdgeDrop(h,'stop'),source=h.node('wf-json').value;let event=workflowDragEvent();event.dataTransfer.setData('application/x-crazywater-workflow-edge',JSON.stringify({from:'start',when:'ALWAYS'}));target.ondrop(event);assert.equal(event.prevented,false);
 const handle=workflowEdgeDragHandle(h,'business');event=workflowDragEvent();handle.ondragstart(event);event.dataTransfer.setData('application/x-crazywater-workflow-edge',JSON.stringify({from:'business',when:'FAIL'}));target.ondrop(event);assert.equal(h.node('wf-json').value,source);event=workflowDragEvent();handle.ondragstart(event);handle.ondragend();target.ondrop(event);assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('workflow direct edge callbacks expire on graph edits and replacement and display-order gestures cannot create edges',async()=>{
 const h=await parameterPage(),handle=workflowEdgeDragHandle(h,'business'),target=workflowEdgeDrop(h,'stop');let event=workflowDragEvent();handle.ondragstart(event);h.node('wf-name').value='changed';h.node('wf-name').oninput();let source=h.node('wf-json').value;target.ondrop(event);assert.equal(h.node('wf-json').value,source);
 let graph=conditionGraph(h);graph.edges=[];workflowSetGraph(h,graph);source=h.node('wf-json').value;handle.ondragstart(event);target.ondrop(event);assert.equal(h.node('wf-json').value,source);event=workflowDragEvent();workflowDragHandle(h,'business').ondragstart(event);workflowEdgeDrop(h,'stop').ondrop(event);assert.equal(h.node('wf-json').value,source);
 const oldEnd=handle.ondragend;event=workflowDragEvent();workflowEdgeDragHandle(h,'start').ondragstart(event);oldEnd();workflowEdgeDrop(h,'business').ondrop(event);assert.deepEqual(conditionGraph(h).edges,[{from:'start',to:'business'}]);assert.equal(writes(h).length,0);
});

test('workflow edge drag locks during pending and running requests and never resumes an old edge gesture after idle',async()=>{
 const h=await parameterPage(),handle=workflowEdgeDragHandle(h,'business'),target=workflowEdgeDrop(h,'stop'),event=workflowDragEvent();handle.ondragstart(event);const read=h.node('wf-load').click();assert.equal(handle.disabled,true);assert.equal(handle.draggable,false);assert.equal(target.disabled,true);const source=h.node('wf-json').value;target.ondrop(event);h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await read;target.ondrop(event);assert.equal(h.node('wf-json').value,source);
 const running=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION'},graphs:[],history:[]});await running;assert.equal(workflowEdgeDragHandle(h,'business').disabled,true);assert.equal(workflowEdgeDrop(h,'stop').disabled,true);workflowEdgeDragHandle(h,'business').ondragstart(event);workflowEdgeDrop(h,'stop').ondrop(event);assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

test('workflow edge drag cannot cross account generations, stale targets or late response replacement',async()=>{
 const h=await parameterPage(),handle=workflowEdgeDragHandle(h,'business'),target=workflowEdgeDrop(h,'stop'),event=workflowDragEvent();handle.ondragstart(event);const read=h.node('wf-load').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await read;const source=h.node('wf-json').value;handle.ondragstart(event);target.ondrop(event);assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});

function policyDraft(h,{enabled=true,duration='60000',actions='1',modules='free-gold'}={}){
 h.node('wf-policy-enabled').checked=enabled;h.node('wf-policy-enabled').onchange();for(const [key,value]of Object.entries({duration,actions,modules})){h.node('wf-policy-'+key).value=value;h.node('wf-policy-'+key).oninput();}
}
test('run boundary form applies only explicit finite policy to the existing graph without authorization',async()=>{
 const h=await parameterPage('free-gold'),before=conditionGraph(h),intent=h.node('wf-unified-intent').value;assert.equal(h.node('wf-policy-enabled').checked,false);assert.equal(h.node('wf-policy-duration').value,'');policyDraft(h);h.node('wf-policy-apply').click();assert.equal(Object.hasOwn(conditionGraph(h),'runPolicy'),false);assert.match(h.node('wf-policy-hint').textContent,/预算/);
 graphBudgetEnable(h);h.node('wf-budget-apply').click();h.node('wf-policy-apply').click();const graph=conditionGraph(h);assert.deepEqual(graph.runPolicy,{maxDurationMs:60000,maxActions:1,modules:['free-gold']});assert.deepEqual(graph.nodes,before.nodes);assert.deepEqual(graph.edges,before.edges);assert.deepEqual(graph.budget,{resources:[],quotas:[],uids:[]});assert.equal(h.node('wf-unified-intent').value,intent);assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);assert.equal(writes(h).length,0);
 graphBudgetEnable(h,false);h.node('wf-budget-apply').click();assert.equal(Object.hasOwn(conditionGraph(h),'budget'),true);assert.match(h.node('wf-budget-hint').textContent,/先明确移除运行边界/);
 policyDraft(h,{enabled:false});h.node('wf-policy-apply').click();assert.equal(Object.hasOwn(conditionGraph(h),'runPolicy'),false);assert.equal(Object.hasOwn(conditionGraph(h),'budget'),true);
});
test('run boundary drafts reject blank, invalid, excessive or out-of-scope fields atomically',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();const source=h.node('wf-json').value;
 for(const bad of [{duration:''},{duration:'0'},{duration:'86400001'},{duration:'1e3'},{duration:'1.5'},{duration:' 1'},{actions:''},{actions:'201'},{actions:'-1'},{modules:''},{modules:'formation'},{modules:'free-gold\nfree-gold'},{modules:'free-gold\nunknown'},{modules:' free-gold'}]){policyDraft(h,bad);h.node('wf-policy-apply').click();assert.equal(h.node('wf-json').value,source,JSON.stringify(bad));}
 policyDraft(h,{duration:'86400000',actions:'0',modules:'free-gold\nformation'});h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h).runPolicy,{maxDurationMs:86400000,maxActions:0,modules:['free-gold','formation']});assert.equal(writes(h).length,0);
});
test('run boundary draft survives original graph rerenders but old graph and account callbacks cannot apply it',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h,{duration:'1234',actions:'0'});const oldApply=h.node('wf-policy-apply').onclick,oldInput=h.node('wf-policy-duration').oninput;workflowCardButton(h,'business','上移').click();assert.equal(h.node('wf-policy-duration').value,'1234');assert.equal(h.node('wf-policy-actions').value,'0');
 const g=conditionGraph(h);g.id='replacement';h.node('wf-json').value=JSON.stringify(g);h.node('wf-json-apply').click();const source=h.node('wf-json').value;oldApply();oldInput();assert.equal(h.node('wf-json').value,source);assert.equal(h.node('wf-policy-enabled').checked,false);
 policyDraft(h);const apply=h.node('wf-policy-apply').onclick;h.run("selectAccount('B');selectAccount('A')");const reset=h.node('wf-json').value;apply();assert.equal(h.node('wf-json').value,reset);assert.equal(h.node('wf-policy-duration').value,'');assert.equal(writes(h).length,0);
});
test('run boundary edits lock during reads and active runs while retaining the unapplied draft',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h,{duration:'4321'});const source=h.node('wf-json').value,apply=h.node('wf-policy-apply').onclick,edit=h.node('wf-policy-duration').oninput;
 const loading=h.node('wf-load').click();for(const key of ['enabled','duration','actions','modules','apply'])assert.equal(h.node('wf-policy-'+key).disabled,true,key);apply();edit();assert.equal(h.node('wf-json').value,source);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION',runId:'active'},graphs:[],history:[]});await loading;apply();assert.equal(h.node('wf-json').value,source);
 const idle=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[],history:[]});await idle;assert.equal(h.node('wf-policy-duration').value,'4321');h.node('wf-policy-apply').click();assert.equal(conditionGraph(h).runPolicy.maxDurationMs,4321);assert.equal(writes(h).length,0);
});
test('invalid persisted run boundaries remain intact until explicit full JSON correction',async()=>{
 for(const runPolicy of [null,{maxDurationMs:1,maxActions:0,modules:['free-gold'],allowRetry:true},{maxDurationMs:60000,maxActions:1,modules:['<img onerror=alert(1)>']},{maxDurationMs:'1000',maxActions:1,modules:['free-gold']}]){
  const h=await parameterPage('free-gold'),g=conditionGraph(h);g.runPolicy=runPolicy;h.node('wf-json').value=JSON.stringify(g);h.node('wf-json-apply').click();const source=h.node('wf-json').value;assert.equal(h.node('wf-policy-apply').disabled,true);h.node('wf-policy-apply').click();assert.equal(h.node('wf-json').value,source);assert.deepEqual(conditionGraph(h).runPolicy,runPolicy);assert.match(h.node('wf-policy-hint').textContent,/JSON/);assert.equal(writes(h).length,0);
 }
});
test('run boundary save and simulation use the original graph API and never grant a run authorization',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);h.node('wf-policy-apply').click();const g=conditionGraph(h);
 for(const action of ['save','simulate']){const request=h.node('wf-'+action).click();const call=writes(h,'/api/workflows/'+action).at(-1);assert.deepEqual(JSON.parse(call.options.body).graph,g);h.respond('/api/workflows/'+action,{accountId:'A',csrfToken:'synthetic-csrf',status:{running:false,status:'IDLE'},graphs:[g],history:[],simulation:{valid:true}});await request;}
 assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(writes(h,'/api/workflows/start').length,0);
});

test('run boundary history displays persisted plan counts and expiry without restoring authorization',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'bounded-history',workflowId:'bounded-flow',status:'RECOVERED_STOPPED'}]});await loading;
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:'bounded-history',workflowDefinitionId:'bounded-flow',status:'RECOVERED_STOPPED',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[],runPolicy:{maxDurationMs:1200,maxActions:2,modules:['formation']},actionPlans:1,expiresAt:'2026-11-13T03:00:01.200Z'});await reading;const text=h.node('wf-history-detail').textContent;assert.match(text,/总时长 1200 毫秒.*动作计划 1 \/ 2.*允许玩法 formation.*2026-11-13T03:00:01.200Z/);assert.match(text,/不能恢复授权/);assert.equal(writes(h).length,0);
});

for(const entry of ['tasks','dailies','loop'])test(entry+' form explicitly copies the applied graph run boundary into its original declaration and prepare API',async()=>{
 const h=await unifiedForm(entry),module=entry==='tasks'?'task-rewards':'free-gold',intent={entry,budget:{resources:[],quotas:[],uids:[]},...(entry==='tasks'?{tasks:[{kind:'main',taskId:1}]}:{dailies:[{taskId:1006}],...(entry==='loop'?{rounds:2}:{})})};unifiedLoad(h,intent);
 assert.equal(h.node('wf-unified-policy-copy').disabled,true);graphBudgetEnable(h);graphBudgetAdd(h,'resources','GOLD','7');h.node('wf-budget-apply').click();policyDraft(h,{duration:'1234',actions:'1',modules:module});h.node('wf-policy-apply').click();assert.deepEqual(unifiedDraft(h),intent);h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,{maxDurationMs:1234,maxActions:1,modules:[module]});assert.deepEqual(unifiedDraft(h).budget,intent.budget);assert.match(h.node('wf-unified-policy-summary').textContent,/1234/);assert.equal(writes(h).length,0);
 const source=unifiedDraft(h),prepared=compileUnifiedExecution(source,{modules:GAMEPLAY_MODULES}),pending=h.node('wf-unified-prepare').click();await tick();assert.deepEqual(JSON.parse(h.pending('/api/workflows/prepare').options.body),source);for(const id of ['policy-copy','policy-remove'])assert.equal(h.node('wf-unified-'+id).disabled,true);h.respond('/api/workflows/prepare',{accountId:'A',...prepared});await pending;assert.deepEqual(conditionGraph(h).runPolicy,source.runPolicy);assert.deepEqual(conditionGraph(h).budget,intent.budget);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(writes(h,'/api/workflows/start').length,0);
 h.node('wf-unified-policy-remove').click();assert.equal(Object.hasOwn(unifiedDraft(h),'runPolicy'),false);assert.deepEqual(conditionGraph(h).runPolicy,source.runPolicy);assert.equal(Object.hasOwn(unifiedDraft(h),'budget'),true);
});
test('unified run boundary copy rejects stale graph, declaration and account callbacks while retaining the user draft',async()=>{
 const h=await unifiedForm('dailies');unifiedLoad(h,{entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}});graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h,{duration:'1000'});h.node('wf-policy-apply').click();const oldCopy=h.node('wf-unified-policy-copy').onclick;policyDraft(h,{duration:'2000'});h.node('wf-policy-apply').click();const source=h.node('wf-unified-intent').value;oldCopy();assert.equal(h.node('wf-unified-intent').value,source);h.node('wf-unified-policy-copy').click();assert.equal(unifiedDraft(h).runPolicy.maxDurationMs,2000);
 const oldRemove=h.node('wf-unified-policy-remove').onclick;unifiedAdd(h,'dailies','daily','1001');const edited=h.node('wf-unified-intent').value;oldRemove();assert.equal(h.node('wf-unified-intent').value,edited);const copy=h.node('wf-unified-policy-copy').onclick,remove=h.node('wf-unified-policy-remove').onclick;h.run("selectAccount('B');selectAccount('A')");const cleared=h.node('wf-unified-intent').value;copy();remove();assert.equal(h.node('wf-unified-intent').value,cleared);assert.doesNotMatch(h.node('wf-unified-policy-summary').textContent,/2000/);assert.equal(writes(h).length,0);
});
test('unified optional policy remains explicit in advanced JSON and copy never silently repairs malformed declarations',async()=>{
 const h=await unifiedForm('loop');h.node('wf-unified-intent').value='{synthetic invalid';h.node('wf-unified-form-load').click();assert.equal(h.node('wf-unified-intent').value,'{synthetic invalid');const before=h.requests.length;h.node('wf-unified-policy-copy').click();h.node('wf-unified-policy-remove').click();assert.equal(h.node('wf-unified-intent').value,'{synthetic invalid');assert.equal(h.requests.length,before);
 const malformed={maxDurationMs:1000,maxActions:1,modules:['free-gold'],allowRetry:true};unifiedLoad(h,{entry:'loop',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]},runPolicy:malformed});assert.deepEqual(unifiedDraft(h).runPolicy,malformed);unifiedAdd(h,'dailies','daily','1001');assert.deepEqual(unifiedDraft(h).runPolicy,malformed);assert.throws(()=>compileUnifiedExecution(unifiedDraft(h),{modules:GAMEPLAY_MODULES}));h.node('wf-unified-policy-remove').click();assert.equal(Object.hasOwn(unifiedDraft(h),'runPolicy'),false);assert.equal(writes(h).length,0);
});
test('unified boundary buttons stay locked during an active existing Workflow and never transfer automatic permission',async()=>{
 const h=await unifiedForm('dailies');unifiedLoad(h,{entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}});graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);h.node('wf-policy-apply').click();h.node('wf-unified-policy-copy').click();const source=h.node('wf-unified-intent').value,copy=h.node('wf-unified-policy-copy').onclick,remove=h.node('wf-unified-policy-remove').onclick;
 const loading=h.node('wf-load').click();for(const id of ['policy-copy','policy-remove'])assert.equal(h.node('wf-unified-'+id).disabled,true);copy();remove();assert.equal(h.node('wf-unified-intent').value,source);h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{running:true,status:'AWAITING_AUTHORIZATION',runId:'bounded-live'},graphs:[],history:[]});await loading;copy();remove();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);
});

test('manual advanced intent edits invalidate boundary summaries and late prepare results immediately',async()=>{
 const h=await unifiedForm('dailies'),intent={entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]},runPolicy:{maxDurationMs:1234,maxActions:1,modules:['free-gold']}};unifiedLoad(h,intent);const oldRemove=h.node('wf-unified-policy-remove').onclick,graph=h.node('wf-json').value,preparing=h.node('wf-unified-prepare').click();await tick();const prepared=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES});h.node('wf-unified-intent').value='{invalid edited declaration';h.node('wf-unified-intent').oninput();assert.match(h.node('wf-unified-policy-summary').textContent,/JSON 无效/);assert.doesNotMatch(h.node('wf-unified-policy-summary').textContent,/1234/);oldRemove();assert.equal(h.node('wf-unified-intent').value,'{invalid edited declaration');h.respond('/api/workflows/prepare',{accountId:'A',...prepared});await preparing;assert.equal(h.node('wf-json').value,graph);assert.equal(h.node('wf-unified-intent').value,'{invalid edited declaration');assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

async function finiteRunPage({maxRounds,roundIntervalMs,schedule,scheduledAt,eventTrigger}={}){
 const h=await boot(),spec=cases.find(row=>row.module==='free-gold'),pendingPlan=plan(spec),graph=compileUnifiedExecution({entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]},runPolicy:{maxDurationMs:60000,maxActions:1,modules:['free-gold']}},{modules:GAMEPLAY_MODULES}).graph;
 if(maxRounds!==undefined)graph.runPolicy.maxRounds=maxRounds;if(roundIntervalMs!==undefined)graph.runPolicy.roundIntervalMs=roundIntervalMs;
 const offer={accountId:'A',runId:'scoped-run',workflowId:graph.id,graphHash:'a'.repeat(64),executionContext:{accountId:'A',playerId:'9007199254740993',worldId:1,generation:1,connectionId:'synthetic-connection'},graph,dependencies:{configHash:'b'.repeat(64),rulesHash:'c'.repeat(64),productionHash:'d'.repeat(64),moduleConfigs:{'free-gold':{enabled:true}}},expiresAt:new Date(Date.now()+60000).toISOString()},status={status:'AWAITING_AUTHORIZATION',running:true,runId:offer.runId,plan:pendingPlan,authorizationOffer:offer};
 if(schedule){graph.runPolicy.schedule=schedule;status.status='WAITING';status.trigger={state:'WAITING',armedAt:new Date().toISOString(),firedAt:null,missedAt:null};status.plan=null;}if(schedule&&schedule.kind!=='ONCE'){offer.scheduledAt=scheduledAt;Object.assign(status.trigger,{scheduledAt,playerId:'9007199254740993',worldId:'1'});}
 if(eventTrigger){graph.runPolicy.eventTrigger=eventTrigger;offer.eventCursor={streamId:'11111111-1111-4111-8111-111111111111',cursor:4,playerId:'9007199254740993',worldId:'1'};status.status='WAITING';status.plan=null;status.eventTrigger={state:'WAITING',baseline:structuredClone(offer.eventCursor),armedAt:new Date().toISOString(),firedAt:null,observedAt:null,event:null};}
 const loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status,graphs:[graph],history:[]});await loading;return{h,offer,status,pendingPlan};
}
test('finite run page displays the complete scope and requires one explicit confirmation through the original CSRF wrapper',async()=>{
 const {h,offer,status,pendingPlan}=await finiteRunPage();assert.equal(h.node('wf-authorize-run').disabled,false);assert.equal(h.node('wf-authorize').disabled,false);assert.equal(writes(h).length,0);const text=h.node('wf-run-scope').textContent;for(const value of ['9007199254740993','60000','free-gold','最多 1 次','尚未授予运行权限','完整节点策略'])assert.ok(text.includes(value),value);
 h.setConfirm(false);await h.node('wf-authorize-run').click();assert.equal(writes(h).length,0);h.setConfirm(true);const submitting=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:pendingPlan.batchId,planHash:pendingPlan.planHash,confirm:true});assert.match(h.confirmations.at(-1),/角色 9007199254740993.*世界 1/);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(h.node('wf-authorize').disabled,true);
 h.respond('/api/workflows/authorize-run',{accountId:'A',csrfToken:'synthetic-csrf',status:{...status,status:'RUNNING',runAuthorization:{scope:offer,approvedAt:'2026-11-14T00:00:00Z',resumable:false}},graphs:[],history:[]});await submitting;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(h.node('wf-authorize').disabled,true);assert.match(h.node('wf-run-scope').textContent,/有限运行授权已于/);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('old run-scope buttons and late authorization replies cannot affect another account or replacement status',async()=>{
 const {h,status}=await finiteRunPage(),old=h.node('wf-authorize-run').onclick;const loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{...status,runId:'replacement',authorizationOffer:{...status.authorizationOffer,runId:'replacement'}},graphs:[],history:[]});await loading;old();assert.equal(writes(h).length,0);
 const submitting=h.node('wf-authorize-run').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:status.authorizationOffer,approvedAt:'late'}},graphs:[],history:[]});await submitting;assert.doesNotMatch(h.node('wf-run-scope').textContent,/9007199254740993|有限运行授权已于/);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('ambiguous authorization response keeps its plan consumed and does not retry or fall back to batch authorization',async()=>{
 const {h}=await finiteRunPage(),submitting=h.node('wf-authorize-run').click();h.respond('/api/workflows/authorize-run',{error:'synthetic response lost'},{ok:false});await submitting;assert.match(h.node('wf-hint').textContent,/只读检查状态与历史/);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(h.node('wf-authorize').disabled,true);h.node('wf-authorize-run').click();h.node('wf-authorize').click();assert.equal(writes(h,'/api/workflows/authorize-run').length,1);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('original history page shows a finite run scope as read-only audit after restart',async()=>{
 const {h,offer}=await finiteRunPage(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'RECOVERED_STOPPED'}]});await loading;
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'RECOVERED_STOPPED',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[],runAuthorization:{scope:offer,approvedAt:'2026-11-14T00:00:00Z',resumable:false}});await reading;
 const text=h.node('wf-history-detail').textContent;assert.ok(text.includes(offer.graphHash));assert.ok(text.includes('9007199254740993'));assert.match(text,/重启不可恢复授权/);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(h.node('wf-authorize').disabled,true);assert.equal(writes(h).length,0);
});

for(const [status,label] of [['MATCHED','已关联原有限运行授权'],['BATCH_ONLY','仅保留原单批授权记录'],['MISSING','有限运行授权关联证据缺失'],['CONFLICT','有限运行授权关联存在冲突'],[undefined,'原历史未记录授权关联']])test('history page renders '+String(status)+' child authorization without changing UNKNOWN or enabling writes',async()=>{
 const {h,offer}=await finiteRunPage(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'UNKNOWN'}]});await loading;
 const reading=h.node('wf-history-read').click();await tick();const detail={accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'UNKNOWN',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[{nodeId:'action',traceResult:'AWAITING_AUTHORIZATION',batches:[{batchId:'batch',operationRunId:'operation',finalStatus:'UNKNOWN',...(status?{runAuthorizationLink:{status,runId:offer.runId,graphHash:'<img src=x onerror=alert(1)>',approvedAt:'2026-11-14T00:00:00Z'}}:{}),actions:[{actionId:'original-action',result:'UNKNOWN',requestStatus:'UNKNOWN',verificationStatus:null,needsReconciliation:true}]}]}]};h.respond('/api/workflows/history',detail);await reading;
 const text=h.node('wf-history-detail').textContent;assert.ok(text.includes(label));assert.match(text,/UNKNOWN/);assert.match(text,/original-action/);if(status==='MATCHED')assert.ok(text.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(h.node('wf-history-detail')).some(node=>node.tagName==='IMG'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(h.node('wf-authorize').disabled,true);assert.equal(writes(h).length,0);
});

function repeatPolicyDraft(h,rounds,interval){for(const [key,value]of Object.entries({rounds,interval})){h.node('wf-policy-'+key).value=value;h.node('wf-policy-'+key).oninput();}}
test('finite outer repetition form applies explicit rounds atomically and preserves the original DAG and unified copy',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();const before=conditionGraph(h);policyDraft(h);repeatPolicyDraft(h,'3','25');h.node('wf-policy-apply').click();const g=conditionGraph(h);assert.deepEqual(g.runPolicy,{maxDurationMs:60000,maxActions:1,modules:['free-gold'],maxRounds:3,roundIntervalMs:25});assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.equal(h.node('wf-policy-rounds').value,'3');assert.equal(h.node('wf-policy-interval').value,'25');
 unifiedLoad(h,{entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);assert.deepEqual(compileUnifiedExecution(unifiedDraft(h),{modules:GAMEPLAY_MODULES}).graph.runPolicy,g.runPolicy);
 repeatPolicyDraft(h,'','');h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h).runPolicy,{maxDurationMs:60000,maxActions:1,modules:['free-gold']});assert.equal(writes(h).length,0);
});

test('finite outer repetition form rejects invalid counts and intervals without changing the applied policy',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);h.node('wf-policy-apply').click();const source=h.node('wf-json').value;
 for(const [rounds,interval]of [['0','0'],['201','0'],['1.5','0'],[' 2','0'],['2','-1'],['2','60001'],['2','1.5'],['','1']]){repeatPolicyDraft(h,rounds,interval);h.node('wf-policy-apply').click();assert.equal(h.node('wf-json').value,source);}
 repeatPolicyDraft(h,'2','');h.node('wf-policy-apply').click();assert.equal(conditionGraph(h).runPolicy.maxRounds,2);assert.equal(Object.hasOwn(conditionGraph(h).runPolicy,'roundIntervalMs'),false);assert.equal(writes(h).length,0);
});

test('a finite repeated scope is displayed and confirmed as part of the exact original run offer',async()=>{
 const {h,offer,pendingPlan,status}=await finiteRunPage({maxRounds:3,roundIntervalMs:25});assert.match(h.node('wf-run-scope').textContent,/最多 3 轮.*轮间隔 25 毫秒/);assert.equal(h.node('wf-policy-rounds').disabled,true);assert.equal(h.node('wf-policy-interval').disabled,true);const submitting=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:pendingPlan.batchId,planHash:pendingPlan.planHash,confirm:true});assert.match(h.confirmations.at(-1),/最多 3 轮，轮间隔 25 毫秒/);h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,status:'RUNNING',runAuthorization:{scope:offer,approvedAt:'2026-11-14T00:00:00Z',resumable:false}},graphs:[],history:[]});await submitting;assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('finite repeated history shows distinct rounds and interval evidence without reusing permission',async()=>{
 const {h,offer}=await finiteRunPage({maxRounds:3,roundIntervalMs:25}),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'UNKNOWN'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'UNKNOWN',readOnly:true,resumable:false,unlinkedOperationCount:0,runPolicy:offer.graph.runPolicy,round:2,completedRounds:1,actionPlans:2,expiresAt:offer.expiresAt,waits:[{nodeId:'stop',result:'ROUND_WAIT_STARTED',round:1,durationMs:25}],nodes:[1,2].map(round=>({nodeId:'same-action',round,traceResult:'AWAITING_AUTHORIZATION',batches:[]}))});await reading;const text=h.node('wf-history-detail').textContent;assert.match(text,/已完成 1 \/ 3 轮.*当前第 2 轮.*轮间隔 25 毫秒/);assert.match(text,/same-action · 第 1 轮/);assert.match(text,/same-action · 第 2 轮/);assert.match(text,/轮间等待已开始/);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

function schedulePolicyDraft(h,at){h.node('wf-policy-scheduled').checked=true;h.node('wf-policy-scheduled').onchange();h.node('wf-policy-at').value=at;h.node('wf-policy-at').oninput();}
const pageSchedule=()=>({kind:'ONCE',at:new Date(Date.now()+30000).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'});

test('once schedule form explicitly converts Shanghai time without altering the existing DAG or budget',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();const before=conditionGraph(h);policyDraft(h);schedulePolicyDraft(h,'2026-11-14T20:30:00.000');h.node('wf-policy-apply').click();const g=conditionGraph(h);assert.deepEqual(g.runPolicy.schedule,{kind:'ONCE',at:'2026-11-14T12:30:00.000Z',timeZone:'Asia/Shanghai',missedPolicy:'SKIP'});assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.budget,before.budget);assert.equal(h.node('wf-policy-at').value,'2026-11-14T20:30:00.000');unifiedLoad(h,{entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);h.node('wf-policy-scheduled').checked=false;h.node('wf-policy-scheduled').onchange();h.node('wf-policy-apply').click();assert.equal(Object.hasOwn(conditionGraph(h).runPolicy,'schedule'),false);assert.equal(writes(h).length,0);
});

test('once schedule form rejects invalid, missing and rolled dates and preserves drafts under unrelated edits',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);h.node('wf-policy-apply').click();const source=h.node('wf-json').value;
 for(const at of ['', '2026-02-30T12:00:00.000','2026-11-14T24:00:00.000','2026-11-14T00:00','2026-11-14T00:00:00.000Z',' 2026-11-14T00:00:00.000']){schedulePolicyDraft(h,at);h.node('wf-policy-apply').click();assert.equal(h.node('wf-json').value,source,at);}
 schedulePolicyDraft(h,'2026-11-14T20:30:00.000');h.node('wf-policy-actions').value='2';h.node('wf-policy-actions').oninput();h.node('wf-policy-enabled').checked=false;h.node('wf-policy-enabled').onchange();h.node('wf-policy-enabled').checked=true;h.node('wf-policy-enabled').onchange();assert.equal(h.node('wf-policy-at').value,'2026-11-14T20:30:00.000');assert.equal(h.node('wf-policy-scheduled').checked,true);assert.equal(writes(h).length,0);
});

test('waiting schedule can explicitly approve the exact scope with no fabricated plan and zero direct writes',async()=>{
 const {h,offer,status}=await finiteRunPage({schedule:pageSchedule()});assert.equal(h.node('wf-authorize-run').disabled,false);assert.equal(h.node('wf-authorize').disabled,true);assert.match(h.node('wf-run-scope').textContent,/Asia\/Shanghai.*SKIP/);assert.equal(h.node('wf-policy-scheduled').disabled,true);assert.equal(h.node('wf-policy-at').disabled,true);h.setConfirm(false);await h.node('wf-authorize-run').click();assert.equal(writes(h).length,0);h.setConfirm(true);const submitting=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});assert.match(h.confirmations.at(-1),/一次时间触发.*Asia\/Shanghai.*SKIP/);h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:new Date().toISOString(),resumable:false}},graphs:[],history:[]});await submitting;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('ambiguous scheduled scope response remains consumed after status refresh, without fallback or retry',async()=>{
 const {h,status}=await finiteRunPage({schedule:pageSchedule()}),submitting=h.node('wf-authorize-run').click();h.respond('/api/workflows/authorize-run',{error:'synthetic lost response'},{ok:false});await submitting;assert.match(h.node('wf-hint').textContent,/只读检查/);assert.equal(h.node('wf-authorize-run').disabled,true);const loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status,graphs:[],history:[]});await loading;h.node('wf-authorize-run').click();h.node('wf-authorize').click();assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/workflows/authorize-run').length,1);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('stale scheduled approval callbacks and replies cannot authorize another account or replacement run',async()=>{
 const {h,status}=await finiteRunPage({schedule:pageSchedule()}),old=h.node('wf-authorize-run').onclick;const loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{...status,runId:'replacement',authorizationOffer:{...status.authorizationOffer,runId:'replacement'}},graphs:[],history:[]});await loading;old();assert.equal(writes(h).length,0);const submitting=h.node('wf-authorize-run').click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{approvedAt:'late'}},graphs:[],history:[]});await submitting;assert.equal(h.node('wf-authorize-run').disabled,true);assert.doesNotMatch(h.node('wf-run-scope').textContent,/9007199254740993|late/);assert.equal(writes(h,'/api/operations/execute').length,0);
});

for(const state of ['WAITING','FIRED','MISSED'])test('schedule history page shows immutable time and trigger evidence '+state,async()=>{
 const {h,offer}=await finiteRunPage({schedule:pageSchedule()}),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'RECOVERED_STOPPED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'RECOVERED_STOPPED',readOnly:true,resumable:false,runPolicy:offer.graph.runPolicy,trigger:{state,armedAt:'<img src=x onerror=alert(1)>',firedAt:null,missedAt:null},actionPlans:0,expiresAt:offer.expiresAt,nodes:[],waits:[]});await reading;const text=h.node('wf-history-detail').textContent;assert.ok(text.includes(offer.graph.runPolicy.schedule.at));assert.match(text,/Asia\/Shanghai.*SKIP/);assert.ok(text.includes(state));assert.ok(text.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(h.node('wf-history-detail')).some(n=>n.tagName==='IMG'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

function calendarPolicyDraft(h,kind,time,weekDay=''){h.node('wf-policy-scheduled').checked=true;h.node('wf-policy-scheduled').onchange();h.node('wf-policy-kind').value=kind;h.node('wf-policy-kind').onchange();for(const [id,value]of [['local-time',time],['week-day',weekDay]]){h.node('wf-policy-'+id).value=value;h.node('wf-policy-'+id).oninput();}}
const calendarPageSchedule=(kind='DAILY')=>({kind,localTime:'08:30:00.000',timeZone:'Asia/Shanghai',missedPolicy:'SKIP',...(kind==='WEEKLY'?{weekDay:7}:{})});

for(const kind of ['DAILY','WEEKLY'])test('calendar '+kind+' form preserves original strategy and copies its exact rule through unified preparation',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);calendarPolicyDraft(h,kind,'08:30:00.000','7');h.node('wf-policy-apply').click();const g=conditionGraph(h);assert.deepEqual(g.runPolicy.schedule,calendarPageSchedule(kind));assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.budget,before.budget);assert.equal(h.node('wf-policy-local-time').value,'08:30:00.000');assert.equal(h.node('wf-policy-at').disabled,true);assert.equal(h.node('wf-policy-week-day').disabled,kind!=='WEEKLY');unifiedLoad(h,{entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);assert.equal(writes(h).length,0);
});

test('calendar form rejects invalid local time and weekday atomically, and mode changes keep distinct drafts',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);h.node('wf-policy-apply').click();const source=h.node('wf-json').value;
 for(const [kind,time,day]of [['DAILY','',''],['DAILY','24:00:00.000',''],['DAILY','08:30',''],['WEEKLY','08:30:00.000',''],['WEEKLY','08:30:00.000','0'],['WEEKLY','08:30:00.000','8'],['WEEKLY','08:30:00.000','1.5'],['WEEKLY','08:30:00.000',' 1']]){calendarPolicyDraft(h,kind,time,day);h.node('wf-policy-apply').click();assert.equal(h.node('wf-json').value,source);}
 calendarPolicyDraft(h,'WEEKLY','08:30:00.000','7');h.node('wf-policy-kind').value='ONCE';h.node('wf-policy-kind').onchange();h.node('wf-policy-at').value='2026-11-14T20:30:00.000';h.node('wf-policy-at').oninput();h.node('wf-policy-kind').value='WEEKLY';h.node('wf-policy-kind').onchange();assert.equal(h.node('wf-policy-local-time').value,'08:30:00.000');assert.equal(h.node('wf-policy-week-day').value,'7');h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h).runPolicy.schedule,calendarPageSchedule('WEEKLY'));assert.equal(writes(h).length,0);
});

for(const kind of ['DAILY','WEEKLY'])test('calendar '+kind+' scope page confirms the server-resolved occurrence without expanding the authorization window',async()=>{
 const scheduledAt=new Date(Date.now()+30000).toISOString(),{h,offer,status}=await finiteRunPage({schedule:calendarPageSchedule(kind),scheduledAt});assert.equal(h.node('wf-authorize-run').disabled,false);assert.equal(h.node('wf-policy-kind').disabled,true);assert.equal(h.node('wf-policy-local-time').disabled,true);assert.equal(h.node('wf-policy-week-day').disabled,true);const text=h.node('wf-run-scope').textContent;assert.ok(text.includes(scheduledAt));assert.ok(text.includes('08:30:00.000'));assert.match(text,/下一窗口不自动续权/);const submitting=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});assert.ok(h.confirmations.at(-1).includes(scheduledAt));h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:new Date().toISOString(),resumable:false}},graphs:[],history:[]});await submitting;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('calendar scope without a matching concrete occurrence cannot enable approval and historical rules stay read-only',async()=>{
 const {h,offer,status}=await finiteRunPage({schedule:calendarPageSchedule('WEEKLY')});assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);const at=new Date(Date.now()+30000).toISOString(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{...status,authorizationOffer:{...offer,scheduledAt:at},trigger:{...status.trigger,scheduledAt:new Date(Date.now()+40000).toISOString()}},graphs:[],history:[]});await loading;assert.equal(h.node('wf-authorize-run').disabled,true);const reload=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'RECOVERED_STOPPED'}]});await reload;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'RECOVERED_STOPPED',readOnly:true,resumable:false,runPolicy:offer.graph.runPolicy,trigger:{state:'WAITING',scheduledAt:at},actionPlans:0,expiresAt:offer.expiresAt,nodes:[],waits:[]});await reading;assert.ok(h.node('wf-history-detail').textContent.includes(at));assert.match(h.node('wf-history-detail').textContent,/每周.*星期 7/);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

function eventPolicyDraft(h,value,kind='VIP_LEVEL_CHANGED'){h.node('wf-policy-event-enabled').checked=true;h.node('wf-policy-event-enabled').onchange();h.node('wf-policy-event-kind').value=kind;h.node('wf-policy-event-kind').onchange();h.node('wf-policy-event-level').value=value;h.node('wf-policy-event-level').oninput();}
for(const level of ['0','3','2147483647'])test('explicit business event form preserves graph and budget for VIP target '+level,async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);eventPolicyDraft(h,level);h.node('wf-policy-apply').click();const g=conditionGraph(h);assert.deepEqual(g.runPolicy.eventTrigger,{kind:'VIP_LEVEL_CHANGED',level:Number(level)});assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.budget,before.budget);unifiedLoad(h,{entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);assert.equal(writes(h).length,0);
});
for(const value of ['',' ',' 3','3 ','-1','1.5','2147483648','NaN'])test('event target invalid '+JSON.stringify(value)+' leaves original graph atomically intact',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);eventPolicyDraft(h,value);h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h),before);assert.equal(writes(h).length,0);
});
test('calendar and event conflict cannot silently select one trigger or rewrite business graph',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);calendarPolicyDraft(h,'DAILY','08:30:00.000');eventPolicyDraft(h,'3');h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h),before);assert.equal(writes(h).length,0);
});
test('event scope confirms exact original cursor and null plan through existing CSRF authorization once',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'VIP_LEVEL_CHANGED',level:3}});assert.equal(h.node('wf-authorize-run').disabled,false);assert.equal(h.node('wf-authorize').disabled,true);assert.match(h.node('wf-run-scope').textContent,/VIP等级.*3/);assert.equal(h.node('wf-policy-event-level').disabled,true);h.setConfirm(false);await h.node('wf-authorize-run').click();assert.equal(writes(h).length,0);h.setConfirm(true);const submitting=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});assert.ok(h.confirmations.at(-1).includes(offer.eventCursor.streamId));h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:new Date().toISOString(),resumable:false}},graphs:[],history:[]});await submitting;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
for(const fault of ['missing','cursor','stream','role','world'])test('event scope '+fault+' cannot enable authorization',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'VIP_LEVEL_CHANGED',level:3}}),copy=structuredClone(status);if(fault==='missing')delete copy.authorizationOffer.eventCursor;else if(fault==='cursor')copy.eventTrigger.baseline.cursor++;else if(fault==='stream')copy.authorizationOffer.eventCursor.streamId='forged';else if(fault==='role')copy.authorizationOffer.executionContext.playerId='other';else copy.authorizationOffer.executionContext.worldId=2;const loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:copy,graphs:[offer.graph],history:[]});await loading;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});
test('an ambiguous event scope response is never retried after refresh or an old account callback',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'VIP_LEVEL_CHANGED',level:3}}),old=h.node('wf-authorize-run').onclick,submitting=h.node('wf-authorize-run').click();h.respond('/api/workflows/authorize-run',{error:'synthetic response lost'},500);await submitting;const loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status,graphs:[offer.graph],history:[]});await loading;assert.equal(h.node('wf-authorize-run').disabled,true);h.run("selectAccount('B');selectAccount('A')");await old();assert.equal(writes(h,'/api/workflows/authorize-run').length,1);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('event history renders persisted metadata as safe text without restoring live subscriptions or authority',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'VIP_LEVEL_CHANGED',level:3}}),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'RECOVERED_STOPPED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'RECOVERED_STOPPED',readOnly:true,resumable:false,runPolicy:offer.graph.runPolicy,eventTrigger:{...status.eventTrigger,event:{eventId:'<img src=x onerror=alert(1)>'}},actionPlans:0,expiresAt:offer.expiresAt,nodes:[],waits:[]});await reading;const detail=h.node('wf-history-detail');assert.ok(detail.textContent.includes(offer.eventCursor.streamId));assert.ok(detail.textContent.includes('<img src=x onerror=alert(1)>'));const tags=node=>[node.tagName,...node.children.flatMap(tags)];assert.equal(tags(detail).some(tag=>String(tag).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

for(const level of ['0','3','2147483647'])test('player event form preserves explicit target and business graph '+level,async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);eventPolicyDraft(h,level,'PLAYER_LEVEL_CHANGED');h.node('wf-policy-apply').click();const g=conditionGraph(h);assert.deepEqual(g.runPolicy.eventTrigger,{kind:'PLAYER_LEVEL_CHANGED',level:Number(level)});assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.budget,before.budget);unifiedLoad(h,{entry:'dailies',dailies:[{taskId:1006}],budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);assert.equal(h.node('wf-policy-event-kind').value,'PLAYER_LEVEL_CHANGED');assert.equal(writes(h).length,0);
});
test('switching event source clears old conditions and unsupported sources leave graph untouched',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);eventPolicyDraft(h,'3','PLAYER_LEVEL_CHANGED');h.node('wf-policy-event-kind').value='VIP_LEVEL_CHANGED';h.node('wf-policy-event-kind').onchange();assert.equal(h.node('wf-policy-event-level').value,'');h.node('wf-policy-event-level').value='3';h.node('wf-policy-event-level').oninput();h.node('wf-policy-apply').click();const before=conditionGraph(h);assert.deepEqual(before.runPolicy.eventTrigger,{kind:'VIP_LEVEL_CHANGED',level:3});eventPolicyDraft(h,'4','SCPlayerExpUpdate');h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h),before);assert.equal(writes(h).length,0);
});
test('player event scope shows exact source and cursor and only grants the original bounded run',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'PLAYER_LEVEL_CHANGED',level:3}});assert.equal(h.node('wf-authorize-run').disabled,false);assert.equal(h.node('wf-policy-event-kind').disabled,true);assert.match(h.node('wf-run-scope').textContent,/角色等级变为明确值 3/);const pending=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});assert.match(h.confirmations.at(-1),/角色等级变为明确值 3/);h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:new Date().toISOString(),resumable:false}},graphs:[],history:[]});await pending;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('player event source selector ignores callbacks retained before account switch',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);eventPolicyDraft(h,'3','PLAYER_LEVEL_CHANGED');const stale=h.node('wf-policy-event-kind').onchange,apply=h.node('wf-policy-apply').onclick;h.run("selectAccount('B');selectAccount('A')");const before=h.node('wf-json').value;h.node('wf-policy-event-kind').value='VIP_LEVEL_CHANGED';stale();apply();assert.equal(h.node('wf-json').value,before);assert.equal(writes(h).length,0);
});

test('weekly lottery page prepares fixed pack and shows server window without automatic authorization',async()=>{
 const spec=cases.find(s=>s.parameters.kind==='weekly-lottery-gift'),h=await loaded(spec),controls=descendants(h.node('gp-task-rewards-facts')),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare);
 kind.value='weekly-lottery-gift';input.value='';const before=h.requests.length;prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),{kind:'weekly-lottery-gift',packId:'1000'});assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:{kind:'weekly-lottery-gift',packId:'1000'}});h.respond('/api/gameplay/survey',data(spec));await survey;assert.match(h.node('gp-task-rewards-facts').textContent,/活动期数 12/);assert.match(h.node('gp-task-rewards-facts').textContent,/900 至 2000/);assert.match(h.node('gp-task-rewards-facts').textContent,/领取记录缺失时不推断未领/);
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('weekly lottery unified form builds fixed Tasks and Dailies aliases with no ID input or dispatch',async()=>{
 const h=await boot(),opening=h.node('loop-unified').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'tasks','weekly-lottery-gift','');assert.equal(h.node('wf-unified-target').disabled,true);unifiedAdd(h,'dailies','weekly-lottery-gift','');assert.equal(h.node('wf-unified-target').disabled,true);
 assert.deepEqual(unifiedDraft(h).tasks,[{kind:'weekly-lottery-gift',packId:'1000'}]);assert.deepEqual(unifiedDraft(h).dailies,[{kind:'weekly-lottery-gift',packId:'1000',action:'claim'}]);assert.match(h.node('wf-unified-target-label').textContent,/1000/);
 assert.equal(h.node('wf-authorize').disabled,true);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('unique weekly page prepares exact free pack and displays explicit gotFree and type7 window',async()=>{
 const spec=cases.find(s=>s.parameters.kind==='weekly-unique-lottery-gift'),h=await loaded(spec),controls=descendants(h.node('gp-task-rewards-facts')),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare);
 kind.value='weekly-unique-lottery-gift';input.value='';const before=h.requests.length;prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),{kind:'weekly-unique-lottery-gift',packId:'1000'});assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:{kind:'weekly-unique-lottery-gift',packId:'1000'}});h.respond('/api/gameplay/survey',data(spec));await survey;assert.match(h.node('gp-task-rewards-facts').textContent,/周翻牌免费礼包 · 已领 false/);assert.match(h.node('gp-task-rewards-facts').textContent,/活动期数 20001/);assert.match(h.node('gp-task-rewards-facts').textContent,/900 至 2000/);
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('unique weekly unified form creates fixed aliases without choosing a card or spending currency',async()=>{
 const h=await unifiedForm('loop');unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'tasks','weekly-unique-lottery-gift','');assert.equal(h.node('wf-unified-target').disabled,true);unifiedAdd(h,'dailies','weekly-unique-lottery-gift','');assert.equal(h.node('wf-unified-target').disabled,true);
 assert.deepEqual(unifiedDraft(h).tasks,[{kind:'weekly-unique-lottery-gift',packId:'1000'}]);assert.deepEqual(unifiedDraft(h).dailies,[{kind:'weekly-unique-lottery-gift',packId:'1000',action:'claim'}]);assert.match(h.node('wf-unified-target-label').textContent,/周翻牌/);assert.equal(h.node('wf-authorize').disabled,true);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('chip weekly page prepares fixed free pack and shows exact server entitlement without opening boxes',async()=>{
 const spec=cases.find(s=>s.parameters.kind==='weekly-chip-gift'),h=await loaded(spec),controls=descendants(h.node('gp-task-rewards-facts')),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare);
 kind.value='weekly-chip-gift';input.value='';const before=h.requests.length;prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),{kind:'weekly-chip-gift',packId:'1000'});assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:{kind:'weekly-chip-gift',packId:'1000'}});h.respond('/api/gameplay/survey',data(spec));await survey;assert.match(h.node('gp-task-rewards-facts').textContent,/周芯片免费礼包 · 活动期数 1001/);assert.match(h.node('gp-task-rewards-facts').textContent,/900 至 2000/);assert.match(h.node('gp-task-rewards-facts').textContent,/领取计次/);
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('chip weekly unified form uses the existing fixed-pack claim aliases without dispatch',async()=>{
 const h=await unifiedForm('loop');unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'tasks','weekly-chip-gift','');assert.equal(h.node('wf-unified-target').disabled,true);unifiedAdd(h,'dailies','weekly-chip-gift','');assert.equal(h.node('wf-unified-target').disabled,true);
 assert.deepEqual(unifiedDraft(h).tasks,[{kind:'weekly-chip-gift',packId:'1000'}]);assert.deepEqual(unifiedDraft(h).dailies,[{kind:'weekly-chip-gift',packId:'1000',action:'claim'}]);assert.match(h.node('wf-unified-target-label').textContent,/周芯片/);assert.equal(h.node('wf-authorize').disabled,true);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

const chipTaskPageSpec={module:'task-rewards',actionId:'task-rewards:weekly-chip-task:synthetic',actionType:'CLAIM',parameters:{kind:'weekly-chip-task',round:2,taskId:1},target:{kind:'weekly-chip-task',round:2,taskId:1},costs:[],facts:{daily:{activityTime:[{type:6,period:3001,startTime:900,endTime:2000}],gift:[{giftId:1000,paidTimes:0}],round:2,score:9000,gotTaskId:[2]}},blockedReason:'WEEKLY_CHIP_ROUND_TRANSITION_UNVERIFIED'};
test('chip task page requires explicit round and task, displays exact activity and invalidates old callbacks',async()=>{
 const h=await loaded(chipTaskPageSpec),controls=descendants(h.node('gp-task-rewards-facts')),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),round=controls.find(n=>n.dataset.chipTaskRound),prepare=controls.find(n=>n.dataset.dailyRewardPrepare),before=h.requests.length;
 assert.ok(round);kind.value='weekly-chip-task';input.value='1';round.value='';prepare.click();assert.match(h.node('gp-task-rewards-hint').textContent,/当前轮次/);assert.equal(h.requests.length,before);
 round.value='2';input.value='0';prepare.click();assert.equal(h.requests.length,before);input.value='1';prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),{kind:'weekly-chip-task',round:2,taskId:1});assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:{kind:'weekly-chip-task',round:2,taskId:1}});h.respond('/api/gameplay/survey',data(chipTaskPageSpec));await survey;
 assert.match(h.node('gp-task-rewards-facts').textContent,/当前轮次 2.*累计积分 9000.*已领任务 2.*活动期数 3001.*900 至 2000/);assert.match(h.node('gp-task-rewards-facts').textContent,/WEEKLY_CHIP_ROUND_TRANSITION_UNVERIFIED/);
 h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('chip task unified form separates activity round from Loop rounds and preserves exact claim aliases',async()=>{
 const h=await unifiedForm('loop');unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],rounds:3,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'tasks','weekly-chip-task','1');assert.match(h.node('wf-unified-form-hint').textContent,/周芯片当前轮次/);assert.deepEqual(unifiedDraft(h).tasks,[]);assert.equal(h.node('wf-unified-chip-round').disabled,false);
 h.node('wf-unified-chip-round').value='2';unifiedAdd(h,'tasks','weekly-chip-task','1');unifiedAdd(h,'dailies','weekly-chip-task','1');
 const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'weekly-chip-task',round:2,taskId:1}]);assert.deepEqual(draft.dailies,[{kind:'weekly-chip-task',round:2,taskId:1,action:'claim'}]);assert.equal(draft.rounds,3);
 const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.equal(compiled.blocked.length,0);for(const node of compiled.graph.nodes.filter(n=>n.type==='ACTION'))assert.deepEqual(node.parameters,{kind:'weekly-chip-task',round:2,taskId:1});
 unifiedAdd(h,'tasks','weekly-chip-gift','');assert.equal(h.node('wf-unified-chip-round').disabled,true);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B')");assert.equal(h.node('wf-unified-chip-round').value,'');
});
test('assembled daily page renders seasonal observations as text without any automatic signup or claim',async()=>{
 const h=await boot(),snapshot={sessionFacts:{festivalActivities:{status:'OBSERVED',reliable:true,source:'SCAllActivity.festivalActivities',scope:'ACCEPTED_STREAM_OBSERVATION_ONLY',accountId:'A',generation:1,connectionId:'synthetic-push',playerId:'1',worldId:'17',seq:1,observedAt:'2026-11-14T01:00:00.000Z',activities:[{activityId:'9007199254740993',festival:1,type:'<img src=x onerror=alert(1)>',season:1,startTime:800,openTime:900,closeTime:1900,endTime:2000,subActivity:[{subActivityType:11,dailyActive:{checkInId:[1,2],activeScore:0,claimedRewardId:0,checkRuby:'9007199254740993'}}]}]}}},view=dailyChecklist(snapshot),before=h.requests.length;
 h.run('renderDailies('+JSON.stringify({checklist:view,tasks:[]})+')');const text=h.node('dailies-table').textContent;assert.match(text,/季节活动.*最近推送观察/);assert.match(text,/SCAllActivity.festivalActivities.*OBSERVED/);assert.match(text,/9007199254740993/);assert.match(text,/1、2/);assert.match(text,/start 800；open 900；close 1900；end 2000/);assert.match(text,/<img src=x onerror=alert\(1\)>/);assert.match(text,/未知：签到资格及独立复读缺证/);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B')");assert.equal(h.node('dailies-table').textContent,'');assert.equal(writes(h,'/api/operations/execute').length,0);
});
for(const entry of ['dailies','loop'])test('unified '+entry+' professional form declares explicit finite mainline and keeps claim separate',async()=>{
 const h=await unifiedForm(entry),before=h.requests.length;
 unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'dailies','stage','2');
 assert.equal(h.node('wf-unified-target').disabled,false);
 assert.match(h.node('wf-unified-target-label').textContent,/1–200/);
 assert.deepEqual(unifiedDraft(h).dailies,[{taskId:1003,action:'perform',parameters:{config:{enabled:true,retryDelaySeconds:10,maxAttempts:2,maxStage:null,stopOnDefeat:true}}}]);
 assert.match(h.node('wf-unified-steps').textContent,/有限主线战斗/);
 assert.match(h.node('wf-unified-steps').textContent,/maxAttempts/);
 unifiedAdd(h,'dailies','daily','1003');
 assert.deepEqual(unifiedDraft(h).dailies[1],{taskId:1003,action:'claim'});
 for(const target of ['','0','-1','1.5','1e2','201','9007199254740992']){
  const source=h.node('wf-unified-intent').value;unifiedAdd(h,'dailies','stage',target);
  assert.equal(h.node('wf-unified-intent').value,source);
 }
 assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 const stale=h.node('wf-unified-add').onclick;h.run("selectAccount('B');selectAccount('A')");
 const source=h.node('wf-unified-intent').value;stale();assert.equal(h.node('wf-unified-intent').value,source);
});
for(const entry of ['dailies','loop'])test('unified '+entry+' museum form preserves exact team factor and separate daily claim without dispatch',async()=>{
 const h=await unifiedForm(entry),before=h.requests.length;
 unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 h.node('wf-unified-museum-heroes').value='A\nB\n9007199254740993';h.node('wf-unified-museum-factor').value='2';
 unifiedAdd(h,'dailies','museum','1');
 const parameters={stageId:1,heroIds:['A','B','9007199254740993'],factor:2};
 assert.deepEqual(unifiedDraft(h).dailies,[{taskId:1016,action:'perform',parameters}]);
 assert.equal(h.node('wf-unified-museum-heroes').disabled,false);assert.equal(h.node('wf-unified-museum-factor').disabled,false);
 assert.match(h.node('wf-unified-target-label').textContent,/博物馆探险关卡/);
 assert.match(h.node('wf-unified-steps').textContent,/9007199254740993/);
 unifiedAdd(h,'dailies','daily','1016');assert.deepEqual(unifiedDraft(h).dailies[1],{taskId:1016,action:'claim'});
 assert.equal(h.node('wf-unified-museum-heroes').disabled,true);assert.equal(h.node('wf-unified-museum-factor').disabled,true);
 for(const heroes of ['','A\nA',' A','A ','A\n',Array.from({length:101},(_,i)=>String(i)).join('\n')]){
  h.node('wf-unified-museum-heroes').value=heroes;const source=h.node('wf-unified-intent').value;
  unifiedAdd(h,'dailies','museum','1');assert.equal(h.node('wf-unified-intent').value,source);
 }
 h.node('wf-unified-museum-heroes').value='A\nB';
 for(const factor of ['','0','-1','1.5','1e2','2147483648']){
  h.node('wf-unified-museum-factor').value=factor;const source=h.node('wf-unified-intent').value;
  unifiedAdd(h,'dailies','museum','1');assert.equal(h.node('wf-unified-intent').value,source);
 }
 assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 h.run("selectAccount('B')");assert.equal(h.node('wf-unified-museum-heroes').value,'');assert.equal(h.node('wf-unified-museum-factor').value,'');
});
test('unified museum team identifiers remain text in the assembled page',async()=>{
 const h=await unifiedForm('dailies'),before=h.requests.length;
 unifiedLoad(h,{entry:'dailies',dailies:[],budget:{resources:[],quotas:[],uids:[]}});
 h.node('wf-unified-museum-heroes').value='<img src=x onerror=alert(1)>';h.node('wf-unified-museum-factor').value='1';
 unifiedAdd(h,'dailies','museum','1');
 assert.match(h.node('wf-unified-steps').textContent,/<img src=x onerror=alert\(1\)>/);
 assert.equal(descendants(h.node('wf-unified-steps')).some(n=>n.tagName.toLowerCase()==='img'),false);
 assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
});
for(const entry of ['dailies','loop'])test('unified '+entry+' alliance order form binds exact city and keeps daily claim independent',async()=>{
 const h=await unifiedForm(entry),before=h.requests.length;unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'dailies','alliance-order','2');assert.deepEqual(unifiedDraft(h).dailies,[{taskId:1012,action:'perform',parameters:{cityId:2}}]);
 assert.match(h.node('wf-unified-target-label').textContent,/联盟城市/);assert.match(h.node('wf-unified-steps').textContent,/联盟城市募兵订单.*2/);
 assert.equal(h.node('wf-unified-museum-heroes').disabled,true);assert.equal(h.node('wf-unified-museum-factor').disabled,true);
 unifiedAdd(h,'dailies','daily','1012');assert.deepEqual(unifiedDraft(h).dailies[1],{taskId:1012,action:'claim'});
 for(const value of ['','0','-1','1.5','1e2','2147483648','<img src=x onerror=alert(1)>']){const source=h.node('wf-unified-intent').value;unifiedAdd(h,'dailies','alliance-order',value);assert.equal(h.node('wf-unified-intent').value,source);}
 assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 const stale=h.node('wf-unified-add').onclick;h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-unified-intent').value;stale();assert.equal(h.node('wf-unified-intent').value,source);
});
test('daily checklist opens original unified declaration without changing a draft or trusting an old driver readiness',async()=>{
 const h=await unifiedForm('dailies'),before=h.requests.length,source=h.node('wf-unified-intent').value;
 const tasks=[1003,1012,1016,1008].map(id=>({id,progress:0,targetProgress:1,rewardClaimed:false})),checklist=dailyChecklist({ok:{DailyTaskInfoRequest:{dailyTask:tasks}},failed:{}},{config:{tables:{}}});
 h.run('renderDailies('+JSON.stringify({checklist,tasks:tasks.map(task=>({task,status:'blocked',reason:'旧驱动锁定说明'}))})+')');
 const text=h.node('dailies-table').textContent;assert.match(text,/主线战斗；明确最多尝试次数/);assert.match(text,/联盟城市募兵订单；明确城市ID/);assert.match(text,/博物馆出发；明确关卡、英雄队伍和时间倍率/);assert.match(text,/港口货轮单格装货；明确货轮及货格，任务完成另行观察/);assert.match(text,/资格和成本需重新探测并授权/);assert.doesNotMatch(text,/旧驱动锁定说明/);
 const link=descendants(h.node('dailies-table')).find(n=>n.textContent==='打开日常统一执行声明');assert.ok(link);
 h.run("globalThis.openedUnified=false;document.querySelector=selector=>({click:()=>{if(selector!=='#tabs button[data-tab=\"workflow\"]')throw Error('wrong tab');globalThis.openedUnified=true;}});");
 link.click();assert.equal(h.run('globalThis.openedUnified'),true);assert.equal(h.node('wf-unified-intent').value,source);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 h.run("globalThis.openedUnified=false;selectAccount('B');");link.click();assert.equal(h.run('globalThis.openedUnified'),false);assert.equal(h.requests.length,before);
 const blocked=dailyChecklist({ok:{DailyTaskInfoRequest:{dailyTask:[{id:1013,progress:0,targetProgress:1,rewardClaimed:false}]}},failed:{}},{config:{tables:{}}});h.run('renderDailies('+JSON.stringify({checklist:blocked,tasks:[]})+')');assert.equal(descendants(h.node('dailies-table')).some(n=>n.textContent==='打开日常统一执行声明'),false);
});

test('mailbox UI declares bounded reads and prepares the exact observed source page without authorizing',async()=>{
 const h=await boot(),row=(id,pageNo)=>({emailId:id,pageNo,subject:'<img src=x onerror=alert(1)>',read:false,got:false,attachment:{hasAttachment:false}});
 const data=(mailbox=null)=>({accountId:'A',module:'mail',csrfToken:'synthetic-mail-csrf',config:{enabled:false},status:{running:false,blocked:false},functions:[],view:{page:{pageNo:0,pageCount:1,totalReported:21,emails:[row('100',0)]},...(mailbox?{mailbox}:{}),candidates:[]}});
 const load=h.node('gp-mail-load').onclick();h.respond('/api/gameplay',data(),{module:'mail'});await load;
 const find=key=>descendants(h.node('gp-mail-facts')).find(n=>n.dataset[key]==='true'),limit=descendants(h.node('gp-mail-facts')).find(n=>n.id==='gp-mail-maxPages');assert.equal(limit.value,'20');
 const before=h.requests.length;for(const value of ['',0,101,'1.5']){limit.value=String(value);await find('mailEnumerate').click();assert.equal(h.requests.length,before);assert.match(h.node('gp-mail-hint').textContent,/1至100/);}
 limit.value='3';const task=find('mailEnumerate').click();assert.deepEqual(JSON.parse(h.pending('/api/gameplay/survey').options.body),{module:'mail',parameters:{action:'enumerate',maxPages:3}});assert.equal(find('mailEnumerate').disabled,true);assert.equal(limit.disabled,true);
 const mailbox={status:'COMPLETE',allPagesComplete:true,atomicSnapshot:false,readPages:3,expectedPages:3,maxPages:3,reason:null,emails:[row('100',0),row('120',2)]};h.respond('/api/gameplay/survey',data(mailbox));await task;
 assert.match(h.node('gp-mail-facts').textContent,/分页覆盖完成.*3.*3.*非原子快照/);assert.match(h.node('gp-mail-facts').textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(h.node('gp-mail-plan').disabled,true);assert.equal(h.node('gp-mail-authorize').disabled,true);
 const prepare=descendants(h.node('gp-mail-facts')).find(n=>n.dataset.mailReadPrepare==='120');assert.ok(prepare);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-mail-parameters').value),{pageNo:2,action:'read',emailId:'120'});assert.equal(h.node('gp-mail-plan').disabled,true);assert.equal(h.node('gp-mail-authorize').disabled,true);
 assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('partial mailbox UI remains explicit and stale enumeration callbacks cannot cross accounts',async()=>{
 const h=await boot(),data={accountId:'A',module:'mail',csrfToken:'synthetic-mail-csrf',config:{enabled:false},status:{running:false,blocked:false},functions:[],view:{page:{pageNo:0,pageCount:0,totalReported:21,emails:[]},mailbox:{status:'PARTIAL',allPagesComplete:false,atomicSnapshot:false,readPages:2,expectedPages:3,maxPages:2,reason:'MAIL_PAGE_LIMIT_REACHED',emails:[]},candidates:[]}};
 const load=h.node('gp-mail-load').onclick();h.respond('/api/gameplay',data,{module:'mail'});await load;assert.match(h.node('gp-mail-facts').textContent,/分页覆盖未完成.*MAIL_PAGE_LIMIT_REACHED/);
 const button=descendants(h.node('gp-mail-facts')).find(n=>n.dataset.mailEnumerate==='true'),task=button.click();assert.ok(h.pending('/api/gameplay/survey'));h.run("selectAccount('B')");const late=structuredClone(data);late.view.mailbox.reason='late-A-mailbox';h.respond('/api/gameplay/survey',late);await task;assert.doesNotMatch(h.node('gp-mail-facts').textContent,/late-A-mailbox/);const count=h.requests.length;await button.click();assert.equal(h.requests.length,count);assert.equal(writes(h,'/api/operations/execute').length,0);
});

for(const entry of ['tasks','loop'])test('unified '+entry+' mail form preserves exact int64 and page zero without granting budget or authorization',async()=>{
 const h=await unifiedForm(entry),before=h.requests.length;h.node('wf-unified-mail-page').value='0';unifiedAdd(h,'tasks','mail-claim','9007199254740995');assert.equal(h.node('wf-unified-target').disabled,false);assert.equal(h.node('wf-unified-mail-page').disabled,false);assert.match(h.node('wf-unified-target-label').textContent,/精确邮件 ID/);
 h.node('wf-unified-mail-page').value='2';unifiedAdd(h,'tasks','mail-read','9223372036854775807');const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'mail',pageNo:0,emailId:'9007199254740995',action:'claim'},{kind:'mail',pageNo:2,emailId:'9223372036854775807',action:'read'}]);assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});assert.match(h.node('wf-unified-steps').textContent,/单封邮件附件.*9007199254740995.*精确来源页：0.*单封空附件邮件已读.*9223372036854775807.*精确来源页：2/);
 const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.equal(compiled.graph.nodes.filter(n=>n.module==='mail').length,2);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);
 const old=unifiedStep(h,'tasks:0','0');h.run("selectAccount('B')");assert.equal(h.node('wf-unified-mail-page').value,'');assert.equal(h.node('wf-unified-target').value,'');const source=h.node('wf-unified-intent').value;old.click();assert.equal(h.node('wf-unified-intent').value,source);
});
test('unified mail form rejects malformed or missing exact inputs and keeps mail out of Dailies drivers',async()=>{
 const h=await unifiedForm('loop');for(const [id,page] of [['9007199254740995',''],['0','0'],['01','0'],['1e2','0'],[' 1','0'],['1 ','0'],['9223372036854775808','0'],['<img src=x>','0'],['1','-1'],['1','1.5'],['1','2147483648']]){const before=h.node('wf-unified-intent').value;h.node('wf-unified-mail-page').value=page;unifiedAdd(h,'tasks','mail-claim',id);assert.equal(h.node('wf-unified-intent').value,before);}
 h.node('wf-unified-phase').value='dailies';h.node('wf-unified-phase').onchange();assert.equal(h.node('wf-unified-kind').children.some(n=>n.value==='mail-claim'||n.value==='mail-read'),false);assert.equal(h.node('wf-unified-mail-page').disabled,true);unifiedAdd(h,'dailies','alliance-order','2');assert.equal(h.node('wf-unified-target').disabled,false);
 assert.equal(writes(h,'/api/workflows/prepare').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

for(const entry of ['tasks','loop'])test('unified '+entry+' AFK form declares exact separate milestones while retaining explicit UID budgets and no dispatch',async()=>{
 const h=await unifiedForm(entry),before=h.requests.length;unifiedAdd(h,'tasks','afk-level-reward','2');assert.equal(h.node('wf-unified-target').disabled,false);assert.match(h.node('wf-unified-target-label').textContent,/精确挂机奖励等级/);assert.equal(h.node('wf-unified-mail-page').disabled,true);unifiedAdd(h,'tasks','afk-level-reward','5');
 const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'afk-level-reward',level:2},{kind:'afk-level-reward',level:5}]);assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});assert.match(h.node('wf-unified-steps').textContent,/挂机单档等级奖励.*2.*挂机单档等级奖励.*5/);assert.equal(compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.filter(n=>n.module==='afk-level-rewards').length,2);
 const old=unifiedStep(h,'tasks:0','0');assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);h.run("selectAccount('B')");const source=h.node('wf-unified-intent').value;old.click();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(h.node('wf-unified-target').value,'');assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('unified AFK form rejects missing or malformed levels and never aliases the daily interval-income task',async()=>{
 const h=await unifiedForm('loop');for(const value of ['','0','-1','2.5','2e0','2147483648','<img src=x>']){const before=h.node('wf-unified-intent').value;unifiedAdd(h,'tasks','afk-level-reward',value);assert.equal(h.node('wf-unified-intent').value,before);}
 h.node('wf-unified-phase').value='dailies';h.node('wf-unified-phase').onchange();assert.equal(h.node('wf-unified-kind').children.some(n=>n.value==='afk-level-reward'),false);assert.equal(writes(h,'/api/workflows/prepare').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);
});

test('daily reset form has no level and preserves the graph, budget and all unified entry policies',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);eventPolicyDraft(h,'not-a-level','DAILY_TASK_RESET');assert.equal(h.node('wf-policy-event-level').disabled,true);h.node('wf-policy-apply').click();const g=conditionGraph(h);assert.deepEqual(g.runPolicy.eventTrigger,{kind:'DAILY_TASK_RESET'});assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.budget,before.budget);
 for(const entry of ['tasks','dailies','loop']){unifiedLoad(h,{entry,...(entry==='tasks'?{tasks:[{kind:'main',taskId:1}]}:{dailies:[{taskId:1006}]}),budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);}
 assert.equal(writes(h).length,0);h.node('wf-policy-event-kind').value='PLAYER_LEVEL_CHANGED';h.node('wf-policy-event-kind').onchange();assert.equal(h.node('wf-policy-event-level').disabled,false);
});
test('daily reset scope uses original one-shot CSRF confirmation and rejects fabricated level authority',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'DAILY_TASK_RESET'}});assert.equal(h.node('wf-authorize-run').disabled,false);assert.match(h.node('wf-run-scope').textContent,/每日任务重置.*服务端原标记/);h.setConfirm(true);const submitting=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});assert.match(h.confirmations.at(-1),/每日任务重置/);h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:new Date().toISOString(),resumable:false}},graphs:[],history:[]});await submitting;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/execute').length,0);
 const bad=await finiteRunPage({eventTrigger:{kind:'DAILY_TASK_RESET',level:0}});assert.equal(bad.h.node('wf-authorize-run').disabled,true);assert.equal(writes(bad.h).length,0);
});
test('daily reset form stale callbacks cannot edit another account and history remains safe read-only content',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'DAILY_TASK_RESET'}}),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'RECOVERED_STOPPED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'RECOVERED_STOPPED',readOnly:true,resumable:false,runPolicy:offer.graph.runPolicy,eventTrigger:{...status.eventTrigger,event:{dailyResetTime:'<img src=x onerror=alert(1)>'}},actionPlans:0,expiresAt:offer.expiresAt,nodes:[],waits:[]});await reading;const box=h.node('wf-history-detail'),tags=n=>[n.tagName,...n.children.flatMap(tags)];assert.match(box.textContent,/每日任务重置/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(tags(box).some(tag=>String(tag).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
 const old=h.node('wf-policy-apply').onclick;h.run("selectAccount('B');selectAccount('A')");const before=h.node('wf-json').value;old();assert.equal(h.node('wf-json').value,before);assert.equal(writes(h).length,0);
});

test('runtime asset recovery record displays fixed offline commands without enabling web restore or inferring completeness',async()=>{
 const h=await boot(),task=h.node('assets-read').onclick();h.respond('/api/assets/readiness',{...assetUiReport,recoveryArchive:{path:'work/runtime-assets.cwassets.gz',sha256:'b'.repeat(64),size:1901461,status:'RETAINED_RECORD_ONLY'}});await task;
 const text=h.node('assets-readiness').textContent;assert.match(text,/work\/runtime-assets[.]cwassets[.]gz/);assert.match(text,/b{64}/);assert.match(text,/assets verify/);assert.match(text,/assets restore/);assert.match(text,/仅补缺失文件/);assert.match(text,/ASSET_SOURCE_UNKNOWN/);assert.match(text,/记录不证明文件当前存在/);assert.equal(writes(h).length,0);
});

for(const entry of ['tasks','loop'])test('unified '+entry+' mailbox enumeration form preserves explicit bounds without mail writes',async()=>{
 const h=await unifiedForm(entry),before=h.requests.length;
 unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'tasks','mail-enumeration','1');unifiedAdd(h,'tasks','mail-enumeration','100');
 assert.deepEqual(unifiedDraft(h).tasks,[{kind:'mail-enumeration',maxPages:1},{kind:'mail-enumeration',maxPages:100}]);assert.match(h.node('wf-unified-target-label').textContent,/页数上限/);
 assert.equal(h.node('wf-unified-mail-page').disabled,true);assert.match(h.node('wf-unified-steps').textContent,/只读SURVEY.*不自动标已读、领取附件/);
 assert.deepEqual(unifiedDraft(h).budget,{resources:[],quotas:[],uids:[]});assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 const old=descendants(h.node('wf-unified-steps')).find(n=>n.dataset?.unifiedStep);h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-unified-intent').value;old.click();assert.equal(h.node('wf-unified-intent').value,source);
});

test('unified mailbox enumeration form rejects ambiguous limits and excludes Dailies',async()=>{
 const h=await unifiedForm('loop');
 for(const limit of ['','0','-1','1.5','1e2','101',' 2','2 ','<img src=x>']){
  const before=h.node('wf-unified-intent').value;unifiedAdd(h,'tasks','mail-enumeration',limit);assert.equal(h.node('wf-unified-intent').value,before);
 }
 h.node('wf-unified-phase').value='dailies';h.node('wf-unified-phase').onchange();assert.equal(h.node('wf-unified-kind').children.some(n=>n.value==='mail-enumeration'),false);
 assert.equal(writes(h,'/api/workflows/prepare').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('mailbox Workflow history renders partial and legacy coverage safely and ignores late account replies',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();await tick();
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'mail-history',workflowId:'mail-flow',status:'COMPLETED'}]});await loading;
 const history={accountId:'A',workflowRunId:'mail-history',workflowDefinitionId:'mail-flow',status:'COMPLETED',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[],surveys:[{nodeId:'<img src=x onerror=alert(1)>',module:'mail',timestamp:null,mailbox:{maxPages:2,readPages:2,observedMails:20,totalReported:31,status:'PARTIAL',allPagesComplete:false,atomicSnapshot:false,reason:'MAIL_PAGE_LIMIT_REACHED'}},{nodeId:'legacy',module:'mail',timestamp:null}]};
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',history);await reading;
 const box=h.node('wf-history-detail');assert.match(box.textContent,/PARTIAL.*页数上限 2.*已读页数 2.*观察邮件 20.*报告总数 31.*MAIL_PAGE_LIMIT_REACHED/);assert.match(box.textContent,/不证明原子快照或领取资格/);assert.match(box.textContent,/legacy.*原历史未保留覆盖摘要.*不能据流程结束推断完整观察/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);
 const late=h.node('wf-history-read').click();await tick();h.run("selectAccount('B')");h.respond('/api/workflows/history',history);await late;assert.equal(h.node('wf-history-detail').textContent,'');
 assert.equal(writes(h,'/api/workflows/resume').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('professional read-only naval page adds exact Loop SURVEY without enabling writes or sending a request',async()=>{
 const h=await boot(),loading=h.node('gp-naval-load').click();h.respond('/api/gameplay',{accountId:'A',module:'naval',csrfToken:'synthetic-csrf-A',config:{enabled:false,rules:[]},status:{running:false,blocked:false},view:{candidates:[],targets:[],worldReliable:false}},{module:'naval'});await loading;
 const parameters={screenCenter:{x:7,y:-3},minimumPower:'9007199254740993',excludeGuildIds:['9007199254740995']};
 h.node('gp-naval-parameters').value=JSON.stringify(parameters);h.node('gp-naval-parameters').oninput();
 const before=h.requests.length,button=h.node('gp-naval-unified-survey');assert.equal(button.disabled,false);button.click();
 const intent=unifiedDraft(h);assert.equal(intent.entry,'loop');assert.deepEqual(intent.world,[{type:'SURVEY',module:'naval',parameters}]);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});
 assert.match(h.node('wf-unified-steps').textContent,/naval.*只读SURVEY.*不自动选择、授权或执行动作/);assert.doesNotMatch(h.node('wf-unified-steps').textContent,/未指定精确候选/);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 const preparing=h.node('wf-unified-prepare').click();assertMutation(h.pending('/api/workflows/prepare'),'/api/workflows/prepare',intent);const compiled=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES});h.respond('/api/workflows/prepare',{accountId:'A',...compiled});await preparing;
 assert.equal(JSON.parse(h.node('wf-json').value).nodes[1].type,'SURVEY');assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('Loop survey copy uses current parameters and rejects stale callbacks and account returns',async()=>{
 const spec=cases.find(s=>s.module==='mail'),h=await loaded(spec,{disabled:true}),button=h.node('gp-mail-unified-survey'),old=button.onclick;
 h.node('gp-mail-parameters').value=JSON.stringify({action:'enumerate',maxPages:2});h.node('gp-mail-parameters').oninput();
 const source=h.node('wf-unified-intent').value;old();assert.equal(h.node('wf-unified-intent').value,source);button.click();assert.deepEqual(unifiedDraft(h).world,[{type:'SURVEY',module:'mail',parameters:{action:'enumerate',maxPages:2}}]);
 const stale=button.onclick;h.run("selectAccount('B');selectAccount('A')");const after=h.node('wf-unified-intent').value;assert.equal(button.disabled,true);stale();assert.equal(h.node('wf-unified-intent').value,after);assert.equal(writes(h).length,0);
});

test('Loop survey copy rejects invalid parameters and missing mail bounds without rewriting the draft',async()=>{
 const spec=cases.find(s=>s.module==='mail'),h=await loaded(spec,{disabled:true});
 for(const source of ['{','[]','null','{"action":"enumerate"}','{"action":"enumerate","maxPages":0}','{"action":"enumerate","maxPages":101}','{"action":"enumerate","maxPages":"2"}']){
  h.node('gp-mail-parameters').value=source;h.node('gp-mail-parameters').oninput();const before=h.node('wf-unified-intent').value;h.node('gp-mail-unified-survey').click();assert.equal(h.node('wf-unified-intent').value,before);assert.match(h.node('gp-mail-hint').textContent,/加入只读调查失败/);
 }
 assert.equal(writes(h).length,0);
});

test('Loop survey copy preserves Tasks and Dailies declarations, full lists and active execution locks',async()=>{
 const spec=cases.find(s=>s.module==='mail'),h=await loaded(spec,{disabled:true});h.node('gp-mail-parameters').value='{"pageNo":2}';h.node('gp-mail-parameters').oninput();
 for(const entry of ['tasks','dailies']){
  unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],budget:{resources:[{id:'wood',num:10}],quotas:[],uids:[]}});const source=h.node('wf-unified-intent').value;h.node('gp-mail-unified-survey').click();assert.equal(h.node('wf-unified-intent').value,source);assert.match(h.node('gp-mail-hint').textContent,/先将原声明入口改为 Loop/);
 }
 unifiedLoad(h,{entry:'loop',world:Array.from({length:48},()=>({type:'SURVEY',module:'mail',parameters:{pageNo:0}})),budget:{resources:[],quotas:[],uids:[]}});const source=h.node('wf-unified-intent').value;h.node('gp-mail-unified-survey').click();assert.equal(h.node('wf-unified-intent').value,source);assert.match(h.node('gp-mail-hint').textContent,/最多48项/);
 const loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{running:true,status:'RUNNING'},graphs:[],history:[]});await loading;assert.equal(h.node('gp-mail-unified-survey').disabled,true);h.node('gp-mail-unified-survey').click();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);
});

test('workflow history shows interrupted location and reason as safe text without restoring execution',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();await tick();
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'stopped-history',workflowId:'flow',status:'RECOVERED_STOPPED'}]});await loading;
 const marker='<img src=x onerror=alert(1)>',history={accountId:'A',workflowRunId:'stopped-history',workflowDefinitionId:'flow',status:'RECOVERED_STOPPED',recovered:true,currentNode:marker,reason:marker+' interrupted',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[],surveys:[]};
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',history);await reading;
 const box=h.node('wf-history-detail');assert.ok(box.textContent.includes('原运行位置：'+marker));assert.ok(box.textContent.includes('运行说明：'+marker+' interrupted'));assert.match(box.textContent,/位置记录不证明该节点完成或业务成功/);assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);
 const late=h.node('wf-history-read').click();await tick();h.run("selectAccount('B')");h.respond('/api/workflows/history',history);await late;assert.equal(h.node('wf-history-detail').textContent,'');
 assert.equal(writes(h,'/api/workflows/resume').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

async function workflowMemoryPage(){
 const h=await boot(),loading=h.node('wf-load').click();await tick();
 const runId='workflow/?x=1&编号',data={accountId:'A',workflowRunId:runId,workflowDefinitionId:'definition-not-run',status:'UNKNOWN',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[],surveys:[]};
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId,workflowId:'definition-not-run',status:'UNKNOWN'}]});await loading;
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',data);await reading;
 const button=descendants(h.node('wf-history-detail')).find(n=>n.dataset.workflowMemory===runId);assert.ok(button);return {h,runId,data,button};
}
test('Workflow history opens shared memory using exact workflow run instead of definition or stale operation filter',async()=>{
 const {h,runId,button}=await workflowMemoryPage();h.node('ops-memory-run-id').value='previous-operation';h.node('ops-memory-run-id').oninput();
 const reading=button.click(),request=h.pending('/api/operations/memory');assert.ok(request);const query=new URL(request.url,'http://local').searchParams;
 assert.equal(query.get('workflowId'),runId);assert.equal(query.get('runId'),null);assert.equal(query.get('account'),'A');assert.equal(request.options.method,undefined);assert.equal(request.options.body,undefined);
 assert.equal(h.node('ops-memory-run-id').value,'');assert.equal(h.node('ops-memory-workflow-id').value,runId);
 h.respond('/api/operations/memory',{accountId:'A',available:true,coverage:'UNTIL_IDENTITY_CHANGE_AND_UNKNOWN_AUDIT',events:[{eventId:'shared-original',workflowId:runId,runId:'original-operation',status:'UNKNOWN',historyOrigin:{status:'STILL_UNKNOWN',resolved:false}}],pendingHistoryProjection:[],resumable:false,retryAllowed:false,policyCoverage:{identityChange:true,cooldown:false,gameDay:false}});await reading;
 assert.match(h.node('ops-memory').textContent,/shared-original.*原始 UNKNOWN.*仍未解除/s);assert.equal(writes(h).length,0);
});
for(const change of ['selection','replacement','account-return'])test('Workflow memory shortcut rejects retired history callback after '+change,async()=>{
 const {h,data,button}=await workflowMemoryPage();
 if(change==='selection'){h.node('wf-history-selected').value='other';h.node('wf-history-selected').onchange();}
 if(change==='replacement'){const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',data);await reading;}
 if(change==='account-return')h.run("selectAccount('B');selectAccount('A')");
 const before=h.requests.length,filter=h.node('ops-memory-workflow-id').value;await button.click();
 assert.equal(h.requests.length,before);assert.equal(h.node('ops-memory-workflow-id').value,filter);assert.equal(writes(h).length,0);
});

test('naval Workflow history explains response comparison, unknown and legacy evidence with safe DOM and stale account guards',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'naval-history',workflowId:'naval-flow',status:'COMPLETED'}]});await loading;
 const history={accountId:'A',workflowRunId:'naval-history',workflowDefinitionId:'naval-flow',status:'COMPLETED',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[],surveys:[...['BASELINE','UNCHANGED','CHANGED','UNKNOWN'].map(comparison=>({nodeId:'<img src=x onerror=alert(1)>',module:'naval',navalObservation:{status:comparison==='UNKNOWN'?'UNKNOWN':'OBSERVED',comparison,targetCount:comparison==='UNKNOWN'?null:2,matchedCount:1,failedCount:0,unknownCount:1,scope:'CURRENT_RESPONSE_ONLY',source:'WorldInfoResponse.fleets'}})),{nodeId:'legacy-naval',module:'naval'}]};
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',history);await reading;
 const box=h.node('wf-history-detail');assert.match(box.textContent,/海战观察 OBSERVED.*响应目标 2.*筛选通过 1.*不匹配 0.*筛选未知 1/);assert.match(box.textContent,/本次查询基线/);assert.match(box.textContent,/与上次响应一致/);assert.match(box.textContent,/当前响应已变化/);assert.match(box.textContent,/海战观察 UNKNOWN.*响应目标 未知.*无法比较/);assert.match(box.textContent,/CURRENT_RESPONSE_ONLY.*不证明全图覆盖、目标消失或允许攻击/);assert.match(box.textContent,/legacy-naval.*原历史未保留覆盖摘要/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);
 const late=h.node('wf-history-read').click();await tick();h.run("selectAccount('B')");h.respond('/api/workflows/history',history);await late;assert.equal(h.node('wf-history-detail').textContent,'');assert.equal(writes(h,'/api/workflows/resume').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

const merchantUiParameters={action:'ship-order',shipId:41,crewId:1},merchantUiSpec={module:'alliance',actionId:'alliance:shipOrder:synthetic',actionType:'shipOrder',parameters:merchantUiParameters,costs:[{id:'木材',num:2}]};
function merchantUiData({ready=false}={}){
 return {accountId:'A',module:'alliance',csrfToken:'synthetic-csrf-A',config:{enabled:true,ship:true},status:{running:false,blocked:false},view:{guildId:'10',playerId:'9007199254740993',candidates:ready?[candidate(merchantUiSpec)]:[],blocked:[],ship:{selected:{shipId:41,crewId:1},period:{period:7,startTime:100,endTime:200},source:'SCGuildShipActivity.period',status:'OBSERVED',maximum:2,ships:[{shipId:41,state:1,preparedEndTime:180,leaderId:'19',cabin:[{crewId:1,playerId:null,order:[{id:'木材',num:2}]},{crewId:2,playerId:'20',order:[{id:'<img src=x onerror=alert(1)>',num:1}]}]}]}}};
}
async function merchantUiBoot(){const h=await boot(),task=h.node('gp-alliance-load').click();h.respond('/api/gameplay',merchantUiData(),{module:'alliance'});await task;return h;}
const merchantControls=h=>descendants(h.node('gp-alliance-facts'));
test('merchant PAGE selects exact own cargo target, uses original API authorization and keeps safe DOM',async()=>{
 const h=await merchantUiBoot(),controls=merchantControls(h),form=controls.find(n=>n.dataset.allianceShipPrepare),count=h.requests.length;
 assert.match(h.node('gp-alliance-facts').textContent,/SCGuildShipActivity.period/);assert.match(h.node('gp-alliance-facts').textContent,/奖励仍需独立合同/);assert.ok(controls.every(n=>n.tagName!=='img'));
 assert.equal(controls.find(n=>n.dataset.allianceSelect&&JSON.parse(n.dataset.allianceSelect).crewId===2).disabled,true);
 form.click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),merchantUiParameters);assert.equal(h.requests.length,count);assert.equal(h.node('gp-alliance-plan').disabled,true);
 const survey=h.node('gp-alliance-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'alliance',parameters:merchantUiParameters});h.respond('/api/gameplay/survey',merchantUiData({ready:true}));await survey;
 const check=descendants(h.node('gp-alliance-candidates')).find(n=>n.type==='checkbox');check.checked=true;check.onchange();const preview=h.node('gp-alliance-plan').click();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'alliance',mode:'Manual',parameters:merchantUiParameters,selections:[merchantUiSpec.actionId]});h.respond('/api/operations/plan',plan(merchantUiSpec));await preview;
 const execution=h.node('gp-alliance-authorize').click();assertMutation(h.pending('/api/operations/authorize'),'/api/operations/authorize',{batchId:plan(merchantUiSpec).batchId,planHash:plan(merchantUiSpec).planHash,approvedActionIds:[merchantUiSpec.actionId],resourceBudget:merchantUiSpec.costs,confirm:true});h.respond('/api/operations/authorize',{accountId:'A',batchId:plan(merchantUiSpec).batchId,permitId:'merchant-permit'});await tick();assertMutation(h.pending('/api/operations/execute'),'/api/operations/execute',{batchId:plan(merchantUiSpec).batchId,permitId:'merchant-permit'});h.respond('/api/operations/execute',{status:'EXECUTING'});await execution;assert.equal(writes(h,'/api/operations/execute').length,1);
});
test('merchant PAGE rejects malformed IDs and detached controls after pending survey and A B A switch',async()=>{
 for(const bad of ['','0','-1','1.5','1e2',' 41','2147483648','<img>']){const h=await merchantUiBoot(),nodes=merchantControls(h);nodes.find(n=>n.dataset.allianceShipField==='shipId').value=bad;nodes.find(n=>n.dataset.allianceShipPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});assert.match(h.node('gp-alliance-hint').textContent,/正 int32/);assert.equal(writes(h).length,0);}
 const h=await merchantUiBoot(),old=merchantControls(h).find(n=>n.dataset.allianceShipPrepare),read=h.node('gp-alliance-survey').click();assert.equal(old.disabled,true);old.click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay/survey',merchantUiData({ready:true}));await read;old.click();assert.equal(h.node('gp-alliance-facts').textContent,'');assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('merchant PAGE adds exact candidate to original finite Loop declaration without increasing budget or sending',async()=>{
 const h=await merchantUiBoot(),survey=h.node('gp-alliance-survey').click();h.respond('/api/gameplay/survey',merchantUiData({ready:true}));await survey;const before=h.requests.length,button=descendants(h.node('gp-alliance-candidates')).find(n=>n.dataset.unifiedCandidate===merchantUiSpec.actionId);assert.equal(button.disabled,false);button.click();const intent=JSON.parse(h.node('wf-unified-intent').value);assert.deepEqual(intent.world,[{module:'alliance',parameters:merchantUiParameters,selection:{actionId:merchantUiSpec.actionId}}]);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});assert.equal(intent.rounds,1);assert.equal(compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION').module,'alliance');assert.equal(h.requests.length,before);
});

test('merchant PAGE disables target controls while disconnected and preserves ordinary parameters',async()=>{
 const h=await merchantUiBoot(),nodes=merchantControls(h),button=nodes.find(n=>n.dataset.allianceShipPrepare);h.run("snapshot.connected=false");button.click();const refresh=h.node('gp-alliance-load').click();h.respond('/api/gameplay',merchantUiData(),{module:'alliance'});await refresh;assert.ok(merchantControls(h).filter(n=>n.dataset.allianceShipField||n.dataset.allianceShipPrepare).every(n=>n.disabled));button.click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});assert.equal(writes(h).length,0);
});

const captainUiParameters={action:'ship-seek',shipId:41},captainUiClaims={resources:[],quotas:[],uids:[{type:'guild-ship',id:'10:7:41'},{type:'hero',id:'captain-A'}]},captainUiSpec={module:'alliance',actionId:'alliance:shipSeek:synthetic',actionType:'shipSeek',parameters:captainUiParameters,costs:[]};
function captainUiData({ready=false}={}){
 const data=merchantUiData();data.view.ship.selected=captainUiParameters;data.view.ship.ships[0].leaderId=null;data.view.ship.ships[0].preparedEndTime=0;data.view.ship.qualification={rows:[{heroId:'captain-A',requiredCombined:7,baseStar:5,exclusiveStar:2,qualified:true},{heroId:'<img src=x onerror=alert(1)>',requiredCombined:8,baseStar:8,exclusiveStar:null,qualified:true}]};data.view.candidates=ready?[{...candidate(captainUiSpec),budgetClaims:captainUiClaims}]:[];return data;
}
test('merchant captain PAGE selects single ship without crew and authorizes explicit zero cost through original routes',async()=>{
 const h=await merchantUiBoot(),nodes=merchantControls(h),mode=nodes.find(n=>n.dataset.allianceShipAction),crew=nodes.find(n=>n.dataset.allianceShipField==='crewId');mode.value='ship-seek';mode.onchange();assert.equal(crew.disabled,true);crew.value='';const before=h.requests.length;nodes.find(n=>n.dataset.allianceShipPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),captainUiParameters);assert.equal(h.requests.length,before);
 const survey=h.node('gp-alliance-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'alliance',parameters:captainUiParameters});h.respond('/api/gameplay/survey',captainUiData({ready:true}));await survey;assert.match(h.node('gp-alliance-facts').textContent,/船长英雄资格/);assert.match(h.node('gp-alliance-facts').textContent,/其他玩法占用须单独核对/);assert.ok(merchantControls(h).every(n=>n.tagName!=='img'));assert.equal(merchantControls(h).find(n=>n.dataset.allianceShipField==='crewId').disabled,true);
 const check=descendants(h.node('gp-alliance-candidates')).find(n=>n.type==='checkbox');check.checked=true;check.onchange();const preview=h.node('gp-alliance-plan').click();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'alliance',mode:'Manual',parameters:captainUiParameters,selections:[captainUiSpec.actionId]});h.respond('/api/operations/plan',{...plan(captainUiSpec),budgetClaims:captainUiClaims});await preview;
 const execute=h.node('gp-alliance-authorize').click();assertMutation(h.pending('/api/operations/authorize'),'/api/operations/authorize',{batchId:plan(captainUiSpec).batchId,planHash:plan(captainUiSpec).planHash,approvedActionIds:[captainUiSpec.actionId],resourceBudget:[],confirm:true});h.respond('/api/operations/authorize',{accountId:'A',batchId:plan(captainUiSpec).batchId,permitId:'captain-permit'});await tick();assertMutation(h.pending('/api/operations/execute'),'/api/operations/execute',{batchId:plan(captainUiSpec).batchId,permitId:'captain-permit'});h.respond('/api/operations/execute',{status:'EXECUTING'});await execute;assert.equal(writes(h,'/api/operations/execute').length,1);
});
test('merchant captain PAGE empty captain selector prepares only target and ignores stale callbacks',async()=>{
 const h=await merchantUiBoot(),refresh=h.node('gp-alliance-load').click();h.respond('/api/gameplay',captainUiData(),{module:'alliance'});await refresh;const choose=merchantControls(h).find(n=>n.dataset.allianceSelect&&JSON.parse(n.dataset.allianceSelect).action==='ship-seek'&&JSON.parse(n.dataset.allianceSelect).shipId===41),before=h.requests.length;choose.click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),captainUiParameters);assert.equal(h.requests.length,before);assert.equal(h.node('gp-alliance-authorize').disabled,true);const pending=h.node('gp-alliance-survey').click();choose.click();h.run("selectAccount('B');selectAccount('A')");h.respond('/api/gameplay/survey',captainUiData({ready:true}));await pending;choose.click();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});assert.equal(h.node('gp-alliance-facts').textContent,'');assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('merchant captain PAGE uses original Loop declaration and keeps required UID budget unapproved',async()=>{
 const h=await merchantUiBoot(),read=h.node('gp-alliance-survey').click();h.respond('/api/gameplay/survey',captainUiData({ready:true}));await read;descendants(h.node('gp-alliance-candidates')).find(n=>n.dataset.unifiedCandidate===captainUiSpec.actionId).click();const intent=JSON.parse(h.node('wf-unified-intent').value);assert.deepEqual(intent.world,[{module:'alliance',parameters:captainUiParameters,selection:{actionId:captainUiSpec.actionId}}]);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});assert.equal(compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION').parameters.action,'ship-seek');assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('cooldown Workflow history shows original seconds and unknown without implying current eligibility or automatic resume',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'cooldown-history',workflowId:'cooldown-flow',status:'COMPLETED'}]});await loading;
 const c={status:'OBSERVED',source:'RecruitInfoResponse.hero.freeEndTimeSeconds',freeEndTimeSeconds:1001,sourceAt:1000000,serverBounds:{earliestMs:999999,latestMs:1000001},readiness:'COOLDOWN',eligibility:null,executable:false,autoResume:false};
 const history={accountId:'A',workflowRunId:'cooldown-history',workflowDefinitionId:'cooldown-flow',status:'COMPLETED',readOnly:true,resumable:false,unlinkedOperationCount:0,nodes:[],waits:[],surveys:[{nodeId:'<img src=x onerror=alert(1)>',module:'free-recruit',recruitCooldown:c},{nodeId:'unknown',module:'free-recruit',recruitCooldown:{...c,status:'UNKNOWN',freeEndTimeSeconds:null,sourceAt:null,serverBounds:null,readiness:'UNKNOWN'}},{nodeId:'zero',module:'free-recruit',recruitCooldown:{...c,freeEndTimeSeconds:0,readiness:'READY_BY_CLOCK'}},{nodeId:'legacy',module:'free-recruit'}]};
 const read=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',history);await read;
 const box=h.node('wf-history-detail');assert.match(box.textContent,/服务端截止秒 1001.*观察时仍在冷却.*RecruitInfoResponse.hero.freeEndTimeSeconds/);assert.match(box.textContent,/服务端截止秒 未知.*观察时冷却状态未知/);assert.match(box.textContent,/服务端截止秒 0.*观察时冷却已满足/);assert.match(box.textContent,/不代表当前可招募，不自动等待、续跑或解除 UNKNOWN/);assert.match(box.textContent,/原历史未保留覆盖摘要/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);
 const late=h.node('wf-history-read').click();await tick();h.run("selectAccount('B')");h.respond('/api/workflows/history',history);await late;assert.equal(box.textContent,'');assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/workflows/resume').length,0);
});

function dailyProgressPolicyDraft(h,taskId='1001',progress='2'){eventPolicyDraft(h,progress,'DAILY_TASK_PROGRESS');h.node('wf-policy-event-task').value=taskId;h.node('wf-policy-event-task').oninput();}
for(const progress of ['0','2','2147483647'])test('daily progress form preserves exact task and threshold across original editor and unified entries '+progress,async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);dailyProgressPolicyDraft(h,'1001',progress);assert.equal(h.node('wf-policy-event-task').disabled,false);h.node('wf-policy-event-kind').value='PLAYER_LEVEL_CHANGED';h.node('wf-policy-event-kind').onchange();assert.equal(h.node('wf-policy-event-task').disabled,true);h.node('wf-policy-event-kind').value='DAILY_TASK_PROGRESS';h.node('wf-policy-event-kind').onchange();assert.equal(h.node('wf-policy-event-task').value,'');assert.equal(h.node('wf-policy-event-level').value,'');h.node('wf-policy-event-task').value='1001';h.node('wf-policy-event-task').oninput();h.node('wf-policy-event-level').value=progress;h.node('wf-policy-event-level').oninput();h.node('wf-policy-apply').click();const g=conditionGraph(h);assert.deepEqual(g.runPolicy.eventTrigger,{kind:'DAILY_TASK_PROGRESS',taskId:1001,progress:Number(progress)});assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.budget,before.budget);
 for(const entry of ['tasks','dailies','loop']){unifiedLoad(h,{entry,...(entry==='tasks'?{tasks:[{kind:'main',taskId:1}]}:{dailies:[{taskId:1006}]}),budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);}
 assert.equal(h.node('wf-policy-event-task').value,'1001');assert.equal(h.node('wf-policy-event-level').value,progress);assert.equal(writes(h).length,0);
});
test('daily progress form rejects missing, fractional, coerced or out-of-range task and progress',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);
 for(const [task,progress]of [['','2'],['0','2'],['-1','2'],['1.2','2'],['1e3','2'],['2147483648','2'],['<img src=x>','2'],['1001',''],['1001','-1'],['1001','0.1'],['1001','2e0'],['1001','2147483648']]){dailyProgressPolicyDraft(h,task,progress);h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h),before);assert.equal(writes(h).length,0);}
});
test('daily progress scope retains original explicit confirmation and rejects fabricated eligibility',async()=>{
 const eventTrigger={kind:'DAILY_TASK_PROGRESS',taskId:1001,progress:2},{h,offer,status}=await finiteRunPage({eventTrigger});assert.equal(h.node('wf-authorize-run').disabled,false);assert.match(h.node('wf-run-scope').textContent,/任务 1001.*达到 2/);assert.match(h.node('wf-run-scope').textContent,/不证明领取资格/);h.setConfirm(true);const submitting=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});assert.match(h.confirmations.at(-1),/任务 1001.*达到 2/);h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:new Date().toISOString(),resumable:false}},graphs:[],history:[]});await submitting;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/execute').length,0);
 for(const extra of [{eligible:true},{taskId:0},{progress:-1},{progress:'2'},{rewardClaimed:false},{request:'SCDailyTaskUpdate'}]){const bad=await finiteRunPage({eventTrigger:{...eventTrigger,...extra}});assert.equal(bad.h.node('wf-authorize-run').disabled,true);assert.equal(writes(bad.h).length,0);}
});
test('daily progress stale callbacks and late approval cannot update another account',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);dailyProgressPolicyDraft(h);const input=h.node('wf-policy-event-task').oninput,apply=h.node('wf-policy-apply').onclick;h.run("selectAccount('B');selectAccount('A')");const before=h.node('wf-json').value;h.node('wf-policy-event-task').value='1002';input();apply();assert.equal(h.node('wf-json').value,before);assert.equal(writes(h).length,0);
 const scoped=await finiteRunPage({eventTrigger:{kind:'DAILY_TASK_PROGRESS',taskId:1001,progress:2}}),submitting=scoped.h.node('wf-authorize-run').click();scoped.h.run("selectAccount('B');selectAccount('A')");scoped.h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...scoped.status,runAuthorization:{scope:scoped.offer,approvedAt:'late'}},graphs:[],history:[]});await submitting;assert.doesNotMatch(scoped.h.node('wf-run-scope').textContent,/任务 1001|有限运行授权已于/);assert.equal(scoped.h.node('wf-authorize-run').disabled,true);assert.equal(writes(scoped.h,'/api/operations/execute').length,0);
});
test('daily progress history displays observed scalars as safe read-only content without restoring authority',async()=>{
 const {h,offer,status}=await finiteRunPage({eventTrigger:{kind:'DAILY_TASK_PROGRESS',taskId:1001,progress:2}}),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'RECOVERED_STOPPED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'RECOVERED_STOPPED',readOnly:true,resumable:false,runPolicy:offer.graph.runPolicy,eventTrigger:{...status.eventTrigger,state:'FIRED',event:{taskId:'<img src=x onerror=alert(1)>',progress:2,targetProgress:5,rewardClaimed:false}},actionPlans:0,expiresAt:offer.expiresAt,nodes:[],waits:[]});await reading;const box=h.node('wf-history-detail'),tags=n=>[n.tagName,...n.children.flatMap(tags)];assert.match(box.textContent,/任务 1001.*达到 2/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(tags(box).some(tag=>String(tag).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

for(const entry of ['tasks','dailies','loop'])test('unified task observation form distinguishes read-only targets from rewards '+entry,async()=>{
 const h=await unifiedForm(entry);unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});const phase=entry==='tasks'?'tasks':'dailies';unifiedAdd(h,phase,'daily-observe','1004');const data=unifiedDraft(h);assert.deepEqual(data[phase],[{...(phase==='tasks'?{kind:'daily'}:{}),taskId:1004,action:'observe'}]);assert.match(h.node('wf-unified-steps').textContent,/每日任务只读观察.*1004.*不完成任务、不领取奖励/);assert.deepEqual(data.budget,{resources:[],quotas:[],uids:[]});assert.equal(compileUnifiedExecution(data,{modules:GAMEPLAY_MODULES}).graph.nodes.some(n=>n.type==='ACTION'),false);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
 if(entry!=='dailies'){for(const kind of ['main','branch','achievement'])unifiedAdd(h,'tasks',kind+'-observe','1');assert.ok(unifiedDraft(h).tasks.every(row=>row.action==='observe'));}
 const old=descendants(h.node('wf-unified-steps')).find(n=>n.dataset?.unifiedStep);h.run("selectAccount('B');selectAccount('A')");const before=h.node('wf-unified-intent').value;old.click();assert.equal(h.node('wf-unified-intent').value,before);assert.equal(writes(h,'/api/operations/authorize').length,0);
});
test('task observation form rejects ambiguous identities and Dailies cannot select other task families',async()=>{
 const h=await unifiedForm('loop');for(const value of ['','0','-1','1.5','1e3','2147483648',' 1001','1001 ','<img src=x>']){const before=h.node('wf-unified-intent').value;unifiedAdd(h,'tasks','daily-observe',value);assert.equal(h.node('wf-unified-intent').value,before);}h.node('wf-unified-phase').value='dailies';h.node('wf-unified-phase').onchange();for(const kind of ['main-observe','branch-observe','achievement-observe'])assert.equal(h.node('wf-unified-kind').children.some(n=>n.value===kind),false);assert.equal(h.node('wf-unified-kind').children.some(n=>n.value==='daily-observe'),true);assert.equal(writes(h).length,0);
});
test('task observation history renders declared target as safe read-only content without inferred completion',async()=>{
 const {h,offer}=await finiteRunPage(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'COMPLETED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'COMPLETED',readOnly:true,resumable:false,nodes:[],waits:[],surveys:[{nodeId:'survey',module:'task-rewards',taskObservation:{kind:'daily',taskId:'<img src=x onerror=alert(1)>'}}]});await reading;const box=h.node('wf-history-detail'),tags=n=>[n.tagName,...n.children.flatMap(tags)];assert.match(box.textContent,/只读任务调查目标；不证明任务完成、可领或到账/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(tags(box).some(tag=>String(tag).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

async function namedWaitPage(){const h=await parameterPage('free-gold'),g=conditionGraph(h);g.nodes=[{id:'s',type:'START'},{id:'w',type:'WAIT',durationMs:1000},{id:'z',type:'STOP'}];g.edges=[{from:'s',to:'w'},{from:'w',to:'z'}];h.node('wf-json').value=JSON.stringify(g);h.node('wf-json-apply').click();return h;}
const namedWaitControl=(h,key)=>descendants(h.node('wf-nodes')).find(n=>n.dataset.workflowWait===key);
test('named cooldown WAIT editor switches explicitly and retains exact limits without planning or writing',async()=>{
 const h=await namedWaitPage(),before=conditionGraph(h),mode=namedWaitControl(h,'mode');assert.equal(mode.value,'DURATION');mode.value='FREE_RECRUIT';mode.onchange();let g=conditionGraph(h),wait=g.nodes.find(n=>n.type==='WAIT');assert.deepEqual(wait,{id:'w',type:'WAIT',cooldown:{kind:'FREE_RECRUIT',maxWaitMs:60000}});assert.deepEqual(g.edges,before.edges);assert.equal(namedWaitControl(h,'duration'),undefined);assert.match(h.node('wf-nodes').textContent,/保守下界.*不授予招募.*不解除拒绝或UNKNOWN/);const limit=namedWaitControl(h,'limit');limit.value='1000';limit.onchange();assert.equal(conditionGraph(h).nodes[1].cooldown.maxWaitMs,1000);assert.equal(validateWorkflow(conditionGraph(h),{modules:GAMEPLAY_MODULES}).valid,true);for(const value of ['','0','-1','1.5','1e3','60001',' 1000','1000 ','01']){const source=h.node('wf-json').value;limit.value=value;limit.onchange();assert.equal(h.node('wf-json').value,source);}
 const back=namedWaitControl(h,'mode');back.value='DURATION';back.onchange();assert.deepEqual(conditionGraph(h).nodes[1],before.nodes[1]);assert.equal(namedWaitControl(h,'limit'),undefined);assert.equal(writes(h).length,0);
});
test('named cooldown WAIT stale editor callbacks cannot change a replacement graph or account',async()=>{
 const h=await namedWaitPage(),old=namedWaitControl(h,'mode');old.value='FREE_RECRUIT';old.onchange();const limit=namedWaitControl(h,'limit');h.run("selectAccount('B');selectAccount('A')");const before=h.node('wf-json').value;limit.value='1';limit.onchange();old.value='DURATION';old.onchange();assert.equal(h.node('wf-json').value,before);assert.equal(writes(h).length,0);
});
test('named cooldown WAIT history renders original bounds safely and never restores waiting or authorization',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'cooldown-history',workflowId:'cooldown-flow',status:'RECOVERED_STOPPED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:'cooldown-history',workflowDefinitionId:'cooldown-flow',status:'RECOVERED_STOPPED',readOnly:true,resumable:false,nodes:[],waits:[{nodeId:'wait',result:'WAIT_STARTED',durationMs:1000,cooldownWait:{kind:'FREE_RECRUIT',maxWaitMs:60000,observation:{source:'<img src=x onerror=alert(1)>',freeEndTimeSeconds:1001,serverBounds:{earliestMs:1000000,latestMs:1000001},readiness:'COOLDOWN'}}}],surveys:[]});await reading;const box=h.node('wf-history-detail');assert.match(box.textContent,/具名英雄免费招募冷却等待 1000 毫秒/);assert.match(box.textContent,/不证明当前可招募.*不解除拒绝或UNKNOWN/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

for(const entry of ['tasks','dailies','loop'])test('unified named cooldown form retains explicit wait without authorizing '+entry,async()=>{
 const h=await unifiedForm(entry),phase=entry==='tasks'?'tasks':'dailies';unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});unifiedAdd(h,phase,'free-recruit-cooldown','1000');const draft=unifiedDraft(h);assert.deepEqual(draft[phase],[{type:'WAIT',cooldown:{kind:'FREE_RECRUIT',maxWaitMs:1000}}]);assert.match(h.node('wf-unified-target-label').textContent,/最多等待毫秒/);assert.match(h.node('wf-unified-steps').textContent,/具名免费招募冷却.*1000.*不解除拒绝或UNKNOWN/);const g=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph;assert.equal(g.nodes.filter(n=>n.type==='WAIT').length,1);assert.equal(g.nodes.some(n=>n.type==='ACTION'),false);assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});
 for(const value of ['','0','-1','1.5','1e3','60001',' 1000','1000 ','01','<img src=x>']){const before=h.node('wf-unified-intent').value;unifiedAdd(h,phase,'free-recruit-cooldown',value);assert.equal(h.node('wf-unified-intent').value,before);}const stale=descendants(h.node('wf-unified-steps')).find(n=>n.dataset?.unifiedStep);h.run("selectAccount('B');selectAccount('A')");const before=h.node('wf-unified-intent').value;stale.click();assert.equal(h.node('wf-unified-intent').value,before);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
});

test('Dailies and Loop pirate form requires exact int32 UID and city and clears account draft inputs',async()=>{
 for(const entry of ['dailies','loop']){
  const h=await unifiedForm(entry),before=h.requests.length;
  unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],budget:{resources:[],quotas:[],uids:[]}});
  unifiedAdd(h,'dailies','pirate-sweep','7');assert.equal(unifiedDraft(h).dailies.length,0);
  assert.equal(h.node('wf-unified-pirate-city').disabled,false);
  for(const field of ['wf-unified-target','wf-unified-pirate-city'])for(const value of ['','0','-1','1.5','1e3','01',' 9','9 ','2147483648']){
   h.node('wf-unified-target').value='7';h.node('wf-unified-pirate-city').value='9';h.node(field).value=value;
   const source=h.node('wf-unified-intent').value;h.node('wf-unified-add').click();
   assert.equal(h.node('wf-unified-intent').value,source,field+' '+value);
  }
  h.node('wf-unified-pirate-city').value='2147483647';unifiedAdd(h,'dailies','pirate-sweep','2147483647');
  assert.deepEqual(unifiedDraft(h).dailies,[{taskId:1010,action:'perform',parameters:{uid:2147483647,cityId:2147483647}}]);
  assert.match(h.node('wf-unified-steps').textContent,/精确城市 ID：2147483647/);
  const compiled=compileUnifiedExecution(unifiedDraft(h),{modules:GAMEPLAY_MODULES});assert.equal(compiled.blocked.length,0);
  unifiedLoad(h,{...unifiedDraft(h),dailies:[{taskId:1010,parameters:{uid:7,cityId:9,allowLowerLevel:true}},{taskId:1002}]});
  unifiedStep(h,'dailies:0','1').click();assert.deepEqual(unifiedDraft(h).dailies[1].parameters,{uid:7,cityId:9,allowLowerLevel:true});
  assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
  h.node('wf-unified-kind').value='free-gold';h.node('wf-unified-kind').onchange();assert.equal(h.node('wf-unified-pirate-city').disabled,true);
  h.run("selectAccount('B')");assert.equal(h.node('wf-unified-pirate-city').value,'');
 }
});

test('production professional candidate imports its explicit empty business contract into Loop without new requests or budget',async()=>{
 const spec={module:'production',actionId:'city:startProduce:factory-one:cloth',actionType:'startProduce',parameters:{},
  target:{buildingId:'factory-one',productId:'cloth'},costs:[{id:'wood',num:1}],blockedReason:'NO_FREE_FACTORY_SLOT',facts:{factories:[],productionRecommendations:[]}};
 const h=await loaded(spec),before=h.requests.length,button=unifiedCandidateButton(h,spec);
 assert.ok(button);assert.equal(button.disabled,false);button.click();
 const draft=unifiedDraft(h);assert.deepEqual(draft.world,[{module:'production',parameters:{},selection:{actionId:spec.actionId}}]);
 assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 const graph=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph;
 assert.deepEqual(graph.nodes.find(node=>node.type==='ACTION').selection,{actionId:spec.actionId});
 const stale=button;h.run("selectAccount('B')");const source=h.node('wf-unified-intent').value;stale.click();assert.equal(h.node('wf-unified-intent').value,source);
});

test('production Loop bridge keeps candidates without an explicit parameter contract disabled',async()=>{
 const spec={module:'production',actionId:'city:startProduce:factory-one:cloth',actionType:'startProduce',parameters:{},
  target:{buildingId:'factory-one',productId:'cloth'},costs:[{id:'wood',num:1}],blockedReason:'NO_FREE_FACTORY_SLOT',facts:{factories:[],productionRecommendations:[]}};
 const h=await loaded(spec),load=h.node('gp-production-load').click();await tick();const result=data(spec);delete result.view.candidates[0].parameters;
 h.respond('/api/gameplay',result,{module:'production'});await load;
 const button=unifiedCandidateButton(h,spec);assert.equal(button.disabled,true);const before=h.requests.length;
 button.click();assert.equal(h.node('wf-unified-intent').value,'');assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
});

for(const entry of ['tasks','dailies','loop'])test(entry+' unified entry preserves existing declaration bytes, independent phases, budget and run policy',async()=>{
 const h=await unifiedForm('loop'),draft={entry:'loop',id:'original-declaration',name:'保留原声明',tasks:[{kind:'main',taskId:7}],dailies:[{taskId:1010,parameters:{uid:7,cityId:9}}],
  world:[{module:'production',parameters:{},selection:{actionId:'exact-production'}}],rounds:2,everyMs:10,
  budget:{resources:[{id:'wood',num:4}],quotas:[{id:'pirate-sweep:2026-11-12',num:1}],uids:[{type:'pirate',id:'7'}]},
  runPolicy:{maxDurationMs:60000,maxActions:6,modules:['task-rewards','pirate-sweep','production']},custom:{keep:'高级字段'}};
 const source=JSON.stringify(draft,null,3)+'\n';h.node('wf-unified-intent').value=source;h.node('wf-unified-form-load').click();
 const before=h.requests.length,opening=h.node(entry+'-unified').click();await tick();
 assert.equal(h.node('wf-unified-intent').value,source);assert.equal(h.node('wf-unified-entry').value,'loop');assert.equal(h.node('wf-unified-rounds').value,'2');
 assert.match(h.node('wf-unified-blocked').textContent,/保留原声明.*预算.*运行边界/);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 assert.equal(h.node('wf-unified-intent').value,source);assert.deepEqual(unifiedDraft(h),draft);
 assert.equal(h.requests.length,before+1);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);
});

for(const source of ['{"entry":"loop",','{"entry":"unknown","budget":{}}','{"entry":"tasks","tasks":null,"budget":{}}'])test('unified entry keeps malformed advanced declaration intact '+source,async()=>{
 const h=await unifiedForm('tasks');h.node('wf-unified-intent').value=source;
 const opening=h.node('dailies-unified').click();await tick();assert.equal(h.node('wf-unified-intent').value,source);
 assert.match(h.node('wf-unified-blocked').textContent,/原声明已保留.*修正/);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
});

test('unified reopen cannot overwrite a running declaration and account changes discard the prior account draft',async()=>{
 const h=await unifiedForm('loop');unifiedAdd(h,'tasks','main','7');const source=h.node('wf-unified-intent').value;
 const loading=h.node('wf-load').click();await tick();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'AWAITING_AUTHORIZATION',running:true},graphs:[],history:[]});await loading;
 const before=h.requests.length;for(const entry of ['tasks','dailies','loop'])h.node(entry+'-unified').click();
 assert.equal(h.node('wf-unified-intent').value,source);assert.equal(h.requests.length,before);
 h.run("selectAccount('B');snapshot={connected:true,state:'READY'}");assert.equal(h.node('wf-unified-intent').value,'');
 const opening=h.node('tasks-unified').click();await tick();assert.equal(unifiedDraft(h).entry,'tasks');assert.deepEqual(unifiedDraft(h).tasks,[]);
 h.respond('/api/workflows',{accountId:'B',csrfToken:'synthetic-csrf-B',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 assert.deepEqual(unifiedDraft(h).budget,{resources:[],quotas:[],uids:[]});assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
});

for(const entry of ['tasks','dailies','loop'])test(entry+' unified reopen preserves unapplied form edits and requires explicit advanced reload',async()=>{
 const h=await unifiedForm('loop'),source=h.node('wf-unified-intent').value;
 const pending={entry:'dailies',rounds:'3',every:'250',target:'1010','pirate-city':'17','budget-id':'wood','budget-num':'9','budget-type':'pirate'};
 for(const [field,value]of Object.entries(pending))h.node('wf-unified-'+field).value=value;
 h.node('wf-unified-phase').value='dailies';h.node('wf-unified-phase').onchange();
 h.node('wf-unified-kind').value='pirate-sweep';h.node('wf-unified-kind').onchange();
 const before=h.requests.length,opening=h.node(entry+'-unified').click();await tick();
 for(const [field,value]of Object.entries(pending))assert.equal(h.node('wf-unified-'+field).value,value,field);
 assert.equal(h.node('wf-unified-kind').value,'pirate-sweep');assert.equal(h.node('wf-unified-intent').value,source);
 h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[]});await opening;
 for(const [field,value]of Object.entries(pending))assert.equal(h.node('wf-unified-'+field).value,value,field);
 assert.equal(h.requests.length,before+1);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
 h.node('wf-unified-form-load').click();
 assert.equal(h.node('wf-unified-entry').value,'loop');assert.equal(h.node('wf-unified-rounds').value,'1');assert.equal(h.node('wf-unified-every').value,'0');
 assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);
});


const tradeSaleUiSpec={module:'trade',actionId:'trade:sell:7:1:synthetic-exact',actionType:'SELL',parameters:{action:'sell',cityId:1,pid:1,num:2},costs:[],target:{period:7,cityId:1,pid:1,num:2},facts:{status:'OBSERVED',period:7,cargo:{cityId:1,cargoLv:1},holdings:[{pid:1,goodsId:1001,num:3,buyPrice:50,cityId:2}],prices:[{goodsId:1001,price:51,stock:0}]},blockedReason:'TRADE_AUTHORITY_UNKNOWN'};
test('trade full PAGE imports only the explicit current candidate into original Loop without adding budget or permission',async()=>{
 const spec=tradeSaleUiSpec,h=await loaded(spec),before=h.requests.length,button=unifiedCandidateButton(h,spec);assert.equal(button.disabled,false);button.click();const intent=unifiedDraft(h);assert.deepEqual(intent.world,[{module:'trade',parameters:spec.parameters,selection:{actionId:spec.actionId}}]);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);const compiled=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES});assert.equal(compiled.graph.nodes.find(n=>n.type==='ACTION').module,'trade');assert.deepEqual(compiled.graph.budget,intent.budget);
 const fields=descendants(h.node('gp-trade-facts')).filter(e=>e.dataset.tradeSellField);const quantity=fields.find(e=>e.dataset.tradeSellField==='num');quantity.value='2';quantity.oninput();const source=h.node('wf-unified-intent').value;button.click();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(unifiedCandidateButton(h,spec).disabled,true);assert.equal(h.node('gp-trade-authorize').disabled,true);assert.equal(h.requests.length,before);assert.equal(writes(h).length,0);
});
test('trade full PAGE preserves unprepared explicit quantity across polling and drops account-stale input handlers',async()=>{
 const h=await loaded(tradeSaleUiSpec),controls=()=>descendants(h.node('gp-trade-facts')),select=controls().find(e=>e.dataset.tradeHolding==='1');select.click();const quantity=controls().find(e=>e.dataset.tradeSellField==='num');quantity.value='01';quantity.oninput();const poll=h.run("gameplayPoll('trade')");await tick();h.respond('/api/gameplay',data(tradeSaleUiSpec),{module:'trade'});await poll;assert.equal(controls().find(e=>e.dataset.tradeSellField==='num').value,'01');assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});assert.equal(h.node('gp-trade-authorize').disabled,true);h.run("selectAccount('B')");quantity.value='99';quantity.oninput();assert.equal(h.node('gp-trade-facts').textContent,'');assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});assert.equal(writes(h).length,0);
});

const tradeBuyUiSpec={...tradeSaleUiSpec,actionId:'trade:buy:7:1:1001:synthetic-exact',actionType:'BUY',parameters:{action:'buy',cityId:1,goodsId:1001,num:2},costs:[{id:'TRADE_COINS:7',num:80}],target:{period:7,cityId:1,goodsId:1001,num:2}};
test('complete PAGE exact buy drafts retain raw input, revoke old plans and clear on account switch',async()=>{
 const h=await loaded(tradeBuyUiSpec),controls=()=>descendants(h.node('gp-trade-facts')),select=controls().find(e=>e.dataset.tradeGoods==='1001');select.click();const quantity=controls().find(e=>e.dataset.tradeBuyField==='num');assert.equal(quantity.value,'');quantity.value='01';quantity.oninput();const poll=h.run("gameplayPoll('trade')");await tick();h.respond('/api/gameplay',data(tradeBuyUiSpec),{module:'trade'});await poll;const fields=()=>Object.fromEntries(controls().filter(e=>e.dataset.tradeBuyField).map(e=>[e.dataset.tradeBuyField,e]));assert.equal(fields().num.value,'01');assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});const prepare=controls().find(e=>e.dataset.tradeBuyPrepare);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});fields().num.value='2';fields().num.oninput();prepare.click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeBuyUiSpec.parameters);assert.equal(h.node('gp-trade-authorize').disabled,true);h.run("selectAccount('B')");quantity.value='9';quantity.oninput();prepare.click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});assert.equal(writes(h).length,0);
});
test('complete PAGE exact buy enters original Loop without expanding declared currency budget',async()=>{const spec=tradeBuyUiSpec,h=await loaded(spec),before=h.requests.length,button=unifiedCandidateButton(h,spec);assert.equal(button.disabled,false);button.click();const intent=unifiedDraft(h);assert.deepEqual(intent.world,[{module:'trade',parameters:spec.parameters,selection:{actionId:spec.actionId}}]);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});assert.equal(h.requests.length,before);const compiled=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.graph.budget,intent.budget);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);});

test('complete PAGE switching exact buy and sell forms keeps both drafts editable and revokes prior plans',async()=>{const h=await loaded(tradeBuyUiSpec),all=()=>descendants(h.node('gp-trade-facts'));all().find(e=>e.dataset.tradeGoods==='1001').click();const buyNum=all().find(e=>e.dataset.tradeBuyField==='num');buyNum.value='01';buyNum.oninput();all().find(e=>e.dataset.tradeHolding==='1').click();const sellNum=all().find(e=>e.dataset.tradeSellField==='num');assert.equal(sellNum.value,'');sellNum.value='2';sellNum.oninput();all().find(e=>e.dataset.tradeSellPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeSaleUiSpec.parameters);buyNum.value='2';buyNum.oninput();all().find(e=>e.dataset.tradeBuyPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeBuyUiSpec.parameters);assert.equal(h.node('gp-trade-authorize').disabled,true);assert.equal(writes(h).length,0);});

for(const status of ['OPEN','CLOSED','UNKNOWN'])test('complete PAGE shows distinct daily trade hours without authorizing '+status,async()=>{const spec={...tradeBuyUiSpec,facts:{...tradeBuyUiSpec.facts,tradingHours:{status,range:{startHour:10,endHour:22},reason:status==='OPEN'?null:'TRADE_HOURS_POLICIES_OR_OBSERVATIONS_DISAGREE',actualTimezone:null}}},h=await loaded(spec),text=h.node('gp-trade-facts').textContent;assert.ok(text.includes('每日贸易时段：'+status));assert.ok(text.includes('10–22 时'));assert.ok(text.includes('账号时区未精确确认'));assert.equal(h.node('gp-trade-authorize').disabled,true);assert.equal(writes(h).length,0);});

const tradeMoveUiSpec={...tradeSaleUiSpec,actionId:'trade:move:7:1:2:synthetic-exact',actionType:'MOVE',parameters:{action:'move',cityId:1,mvToCityId:2},target:{period:7,cityId:1,mvToCityId:2},facts:{...tradeSaleUiSpec.facts,route:{status:'OBSERVED',destinations:[{cityId:1},{cityId:2}],arrivalConfirmed:false}}};
test('complete PAGE exact Radar move enters original Loop without budget expansion or permission',async()=>{const spec=tradeMoveUiSpec,h=await loaded(spec),before=h.requests.length,button=unifiedCandidateButton(h,spec);assert.equal(button.disabled,false);button.click();const intent=unifiedDraft(h);assert.deepEqual(intent.world,[{module:'trade',parameters:spec.parameters,selection:{actionId:spec.actionId}}]);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});const compiled=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.graph.budget,intent.budget);assert.equal(compiled.graph.nodes.find(n=>n.type==='ACTION').module,'trade');assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);assert.ok(h.node('gp-trade-facts').textContent.includes('不证明到达'));});
test('complete PAGE Radar move drafts preserve raw targets across polling and reject stale view and account callbacks',async()=>{const spec=tradeMoveUiSpec,h=await loaded(spec),all=()=>descendants(h.node('gp-trade-facts')),fields=()=>Object.fromEntries(all().filter(e=>e.dataset.tradeMoveField).map(e=>[e.dataset.tradeMoveField,e]));assert.deepEqual(Object.keys(fields()).sort(),['cityId','mvToCityId']);all().find(e=>e.dataset.tradeDestination==='2').click();assert.equal(fields().cityId.value,'1');assert.equal(fields().mvToCityId.value,'2');const old=fields().mvToCityId,oldPrepare=all().find(e=>e.dataset.tradeMovePrepare);old.value='02';old.oninput();const poll=h.run("gameplayPoll('trade')");await tick();h.respond('/api/gameplay',data(spec),{module:'trade'});await poll;assert.equal(fields().mvToCityId.value,'02');old.value='99';old.oninput();oldPrepare.click();assert.equal(fields().mvToCityId.value,'02');assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});all().find(e=>e.dataset.tradeMovePrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});fields().mvToCityId.value='1';fields().mvToCityId.oninput();all().find(e=>e.dataset.tradeMovePrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});fields().mvToCityId.value='2';fields().mvToCityId.oninput();const prepare=all().find(e=>e.dataset.tradeMovePrepare);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),spec.parameters);assert.equal(h.node('gp-trade-authorize').disabled,true);const target=fields().mvToCityId;h.run("selectAccount('B')");target.value='99';target.oninput();prepare.click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});assert.equal(h.node('gp-trade-facts').textContent,'');assert.equal(writes(h).length,0);});
test('complete PAGE sell buy and move drafts remain editable and invalidate prior plans',async()=>{const h=await loaded(tradeMoveUiSpec),all=()=>descendants(h.node('gp-trade-facts'));all().find(e=>e.dataset.tradeDestination==='2').click();all().find(e=>e.dataset.tradeMovePrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeMoveUiSpec.parameters);all().find(e=>e.dataset.tradeGoods==='1001').click();const buy=all().find(e=>e.dataset.tradeBuyField==='num');buy.value='2';buy.oninput();all().find(e=>e.dataset.tradeBuyPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeBuyUiSpec.parameters);all().find(e=>e.dataset.tradeHolding==='1').click();const sell=all().find(e=>e.dataset.tradeSellField==='num');sell.value='2';sell.oninput();all().find(e=>e.dataset.tradeSellPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeSaleUiSpec.parameters);all().find(e=>e.dataset.tradeMovePrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeMoveUiSpec.parameters);assert.equal(h.node('gp-trade-authorize').disabled,true);assert.equal(unifiedCandidateButton(h,tradeMoveUiSpec).disabled,true);assert.equal(writes(h).length,0);});

const tradeSpeedUiSpec={...tradeMoveUiSpec,actionId:'trade:speed:7:1:2:synthetic-exact',actionType:'SPEED',parameters:{action:'speed',cityId:1,mvToCityId:2,num:1},costs:[{id:'海商王加速',num:1}],target:{period:7,cityId:1,mvToCityId:2,num:1,moveStartTime:10000,moveEndTime:17200},facts:{...tradeMoveUiSpec.facts,cargo:{cargoLv:1,cityId:1,moveStartTime:10000,moveEndTime:17200,moveToCityId:2},speed:{policy:{itemId:'海商王加速',secondsEach:1800,maxTimes:4},owned:4,arrivalConfirmed:false}}};
test('complete PAGE owned speed enters original Loop with explicit leg and no auto item budget',async()=>{const spec=tradeSpeedUiSpec,h=await loaded(spec),before=h.requests.length,button=unifiedCandidateButton(h,spec);assert.equal(button.disabled,false);button.click();const intent=unifiedDraft(h);assert.deepEqual(intent.world,[{module:'trade',parameters:spec.parameters,selection:{actionId:spec.actionId}}]);assert.deepEqual(intent.budget,{resources:[],quotas:[],uids:[]});assert.deepEqual(compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES}).graph.budget,intent.budget);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);const text=h.node('gp-trade-facts').textContent;assert.ok(text.includes('自有商会指针：4'));assert.ok(text.includes('1800'));assert.ok(text.includes('17200'));assert.ok(text.includes('到达边界及补购保持独立'));});
test('complete PAGE owned speed keeps raw quantity across polling and fences stale callbacks',async()=>{const spec=tradeSpeedUiSpec,h=await loaded(spec),all=()=>descendants(h.node('gp-trade-facts')),fields=()=>Object.fromEntries(all().filter(e=>e.dataset.tradeSpeedField).map(e=>[e.dataset.tradeSpeedField,e]));all().find(e=>e.dataset.tradeSpeedLeg==='2').click();assert.equal(fields().cityId.value,'1');assert.equal(fields().mvToCityId.value,'2');assert.equal(fields().num.value,'');const old=fields().num,oldPrepare=all().find(e=>e.dataset.tradeSpeedPrepare);old.value='01';old.oninput();const poll=h.run("gameplayPoll('trade')");await tick();h.respond('/api/gameplay',data(spec),{module:'trade'});await poll;assert.equal(fields().num.value,'01');old.value='9';old.oninput();oldPrepare.click();assert.equal(fields().num.value,'01');all().find(e=>e.dataset.tradeSpeedPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});fields().num.value='1';fields().num.oninput();const prepare=all().find(e=>e.dataset.tradeSpeedPrepare);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),spec.parameters);assert.equal(h.node('gp-trade-authorize').disabled,true);const quantity=fields().num;h.run("selectAccount('B')");quantity.value='99';quantity.oninput();prepare.click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),{});assert.equal(writes(h).length,0);});
test('complete PAGE speed sell buy and move drafts can switch without retaining authorization',async()=>{const h=await loaded(tradeSpeedUiSpec),all=()=>descendants(h.node('gp-trade-facts'));all().find(e=>e.dataset.tradeSpeedLeg==='2').click();const speed=all().find(e=>e.dataset.tradeSpeedField==='num');speed.value='1';speed.oninput();all().find(e=>e.dataset.tradeSpeedPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeSpeedUiSpec.parameters);all().find(e=>e.dataset.tradeDestination==='2').click();all().find(e=>e.dataset.tradeMovePrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeMoveUiSpec.parameters);all().find(e=>e.dataset.tradeGoods==='1001').click();const buy=all().find(e=>e.dataset.tradeBuyField==='num');buy.value='2';buy.oninput();all().find(e=>e.dataset.tradeBuyPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeBuyUiSpec.parameters);all().find(e=>e.dataset.tradeHolding==='1').click();const sell=all().find(e=>e.dataset.tradeSellField==='num');sell.value='2';sell.oninput();all().find(e=>e.dataset.tradeSellPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeSaleUiSpec.parameters);all().find(e=>e.dataset.tradeSpeedPrepare).click();assert.deepEqual(JSON.parse(h.node('gp-trade-parameters').value),tradeSpeedUiSpec.parameters);assert.equal(h.node('gp-trade-authorize').disabled,true);assert.equal(unifiedCandidateButton(h,tradeSpeedUiSpec).disabled,true);assert.equal(writes(h).length,0);});


test('trade leg WAIT PAGE native editor requires explicit ports and preserves stale account guards',async()=>{
 const h=await namedWaitPage(),before=conditionGraph(h),mode=namedWaitControl(h,'mode');mode.value='TRADE_LEG_END';mode.onchange();let wait=conditionGraph(h).nodes[1];assert.deepEqual(wait,{id:'w',type:'WAIT',cooldown:{kind:'TRADE_LEG_END',maxWaitMs:60000,cityId:null,mvToCityId:null}});assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:GAMEPLAY_MODULES}));
 for(const [key,value] of [['cityId','1'],['mvToCityId','2'],['limit','1000']]){const control=namedWaitControl(h,key);control.value=value;control.onchange();}assert.deepEqual(conditionGraph(h).nodes[1].cooldown,{kind:'TRADE_LEG_END',maxWaitMs:1000,cityId:1,mvToCityId:2});assert.equal(validateWorkflow(conditionGraph(h),{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(conditionGraph(h).edges,before.edges);assert.match(h.node('wf-nodes').textContent,/同航段.*不证明到达.*不解除拒绝或UNKNOWN/);
 for(const key of ['cityId','mvToCityId'])for(const value of ['','0','-1','1.5','1e3','2147483648',' 1','1 ','01','<img src=x>']){const source=h.node('wf-json').value,input=namedWaitControl(h,key);input.value=value;input.onchange();assert.equal(h.node('wf-json').value,source);}
 const old=namedWaitControl(h,'cityId'),switcher=namedWaitControl(h,'mode');switcher.value='FREE_RECRUIT';switcher.onchange();assert.equal(namedWaitControl(h,'cityId'),undefined);assert.deepEqual(conditionGraph(h).nodes[1].cooldown,{kind:'FREE_RECRUIT',maxWaitMs:60000});const source=h.node('wf-json').value;old.value='9';old.onchange();assert.equal(h.node('wf-json').value,source);const stale=namedWaitControl(h,'mode');h.run("selectAccount('B');selectAccount('A')");const accountSource=h.node('wf-json').value;stale.value='TRADE_LEG_END';stale.onchange();assert.equal(h.node('wf-json').value,accountSource);assert.equal(writes(h).length,0);
});
for(const entry of ['tasks','dailies','loop'])test('trade leg WAIT PAGE unified '+entry+' compiles exact ports with no budget or permission expansion',async()=>{
 const h=await unifiedForm(entry),phase=entry==='tasks'?'tasks':'dailies';unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-trade-city').value='1';h.node('wf-unified-trade-destination').value='2';unifiedAdd(h,phase,'trade-leg-clock','1000');const draft=unifiedDraft(h);assert.deepEqual(draft[phase],[{type:'WAIT',cooldown:{kind:'TRADE_LEG_END',cityId:1,mvToCityId:2,maxWaitMs:1000}}]);assert.match(h.node('wf-unified-steps').textContent,/具名贸易航段.*1 → 2.*1000.*不证明到达或收益.*不解除拒绝或UNKNOWN/);assert.equal(h.node('wf-unified-trade-city').disabled,false);assert.equal(h.node('wf-unified-trade-destination').disabled,false);const g=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph;assert.equal(g.nodes.filter(n=>n.type==='WAIT').length,1);assert.equal(g.nodes.some(n=>n.type==='ACTION'),false);assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});
 for(const key of ['trade-city','trade-destination','target'])for(const value of ['','0','-1','1.5','1e3','2147483648',' 1','1 ','01','<img src=x>']){h.node('wf-unified-trade-city').value='1';h.node('wf-unified-trade-destination').value='2';h.node('wf-unified-target').value='1000';h.node('wf-unified-'+key).value=value;const source=h.node('wf-unified-intent').value;h.node('wf-unified-add').click();assert.equal(h.node('wf-unified-intent').value,source);}h.node('wf-unified-trade-city').value='1';h.node('wf-unified-trade-destination').value='1';unifiedAdd(h,phase,'trade-leg-clock','1000');assert.equal(unifiedDraft(h)[phase].length,1);
 const old=unifiedStep(h,phase+':0','0');h.run("selectAccount('B');selectAccount('A')");assert.equal(h.node('wf-unified-trade-city').value,'');assert.equal(h.node('wf-unified-trade-destination').value,'');const source=h.node('wf-unified-intent').value;old.click();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
});
test('trade leg WAIT PAGE history safely displays exact clock evidence without restoring wait or permission',async()=>{
 const h=await boot(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'trade-clock-history',workflowId:'trade-clock',status:'RECOVERED_STOPPED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:'trade-clock-history',workflowDefinitionId:'trade-clock',status:'RECOVERED_STOPPED',readOnly:true,resumable:false,nodes:[],surveys:[],waits:[{nodeId:'wait',result:'WAIT_STARTED',durationMs:1000,cooldownWait:{kind:'TRADE_LEG_END',cityId:1,mvToCityId:2,maxWaitMs:1000,observation:{source:'<img src=x onerror=alert(1)>',leg:{period:7,cityId:1,moveToCityId:2,moveStartTime:10000,moveEndTime:10801},serverBounds:{earliestMs:10800000,latestMs:10800001},readiness:'WAITING_BY_CLOCK',arrivalConfirmed:false,executable:false}}}]});await reading;const box=h.node('wf-history-detail');assert.match(box.textContent,/具名贸易航段时钟等待 1000 毫秒/);assert.match(box.textContent,/不证明当前可招募、到达或收益.*不解除拒绝或UNKNOWN.*重启不恢复等待/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

for(const entry of ['dailies','loop'])test('unified '+entry+' cargo form preserves exact slot and independent observation claim with no dispatch',async()=>{
 const h=await unifiedForm(entry),before=h.requests.length;unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 h.node('wf-unified-cargo-index').value='3';unifiedAdd(h,'dailies','cargo-fill','2');assert.deepEqual(unifiedDraft(h).dailies,[{taskId:1008,action:'perform',parameters:{shipIndex:2,cargoIndex:3}}]);
 assert.equal(h.node('wf-unified-cargo-index').disabled,false);assert.match(h.node('wf-unified-target-label').textContent,/港口货轮/);assert.match(h.node('wf-unified-steps').textContent,/货格编号：3/);assert.match(h.node('wf-unified-steps').textContent,/装货不证明日常完成/);
 unifiedAdd(h,'dailies','daily-observe','1008');unifiedAdd(h,'dailies','daily','1008');assert.deepEqual(unifiedDraft(h).dailies.slice(1),[{taskId:1008,action:'observe'},{taskId:1008,action:'claim'}]);assert.equal(h.node('wf-unified-cargo-index').disabled,true);
 for(const value of ['','0','-1','1.5','1e2','2147483648','<img src=x onerror=alert(1)>']){const source=h.node('wf-unified-intent').value;h.node('wf-unified-cargo-index').value=value;unifiedAdd(h,'dailies','cargo-fill','2');assert.equal(h.node('wf-unified-intent').value,source);h.node('wf-unified-cargo-index').value='1';unifiedAdd(h,'dailies','cargo-fill',value);assert.equal(h.node('wf-unified-intent').value,source);}
 const stale=h.node('wf-unified-add').onclick;h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-unified-intent').value;stale();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(h.node('wf-unified-cargo-index').value,'');assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
});

async function workflowOperationEvidencePage(){
 const {h,data,runId}=await workflowMemoryPage(),operationRunId='operation/?x=1&<literal>',batchId='batch-original',actionId='fleet:cargoFill:2:3';
 data.preparation={entry:'dailies',blocked:[]};data.nodes=[{nodeId:'dailies-0-1',round:1,module:'fleet',traceResult:'AWAITING_VERIFICATION',batches:[{batchId,operationRunId,module:'fleet',finalStatus:'UNKNOWN',actions:[{actionId,result:'UNKNOWN',requestStatus:'SUCCESS',verificationStatus:'UNKNOWN',needsReconciliation:true}]}]}];
 const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',data);await reading;
 const button=descendants(h.node('wf-history-detail')).find(n=>n.dataset.workflowOperation===operationRunId);assert.ok(button);
 const record={accountId:'A',runId:operationRunId,module:'fleet',workflowId:runId,workflowDefinitionId:data.workflowDefinitionId,workflowNodeId:'dailies-0-1',workflowRound:1,finalStatus:'UNKNOWN',planSummary:{batchId},authorizationSummary:{batchId},actions:[{actionId,actionType:'cargoFill',result:'UNKNOWN',requestStatus:'SUCCESS',unresolvedWrite:true,verification:{status:'UNKNOWN'},dispatchEvidence:{state:'MAY_HAVE_DISPATCHED'},resourceReservation:[{id:'木材',num:4}]}]};
 return {h,data,runId,operationRunId,record,button};
}
test('Workflow batch opens exact original operation evidence using only the existing history GET',async()=>{
 const {h,operationRunId,record,button}=await workflowOperationEvidencePage();h.node('ops-history-date').value='2026-11-01';h.node('ops-history-run-id').value='previous-run';const count=h.requests.length;
 const reading=button.click(),request=h.pending('/api/operations/history'),url=new URL(request.url,'http://local');assert.equal(url.searchParams.get('runId'),operationRunId);assert.equal(url.searchParams.get('account'),'A');assert.equal(url.searchParams.has('date'),false);assert.equal(request.options.body,undefined);assert.equal(request.options.method,undefined);assert.equal(h.requests.length,count+1);
 h.respond('/api/operations/history',{accountId:'A',runs:[record]});await reading;const text=h.node('ops-history').textContent;for(const value of [operationRunId,record.workflowId,record.workflowNodeId,'batch-original','UNKNOWN','MAY_HAVE_DISPATCHED','木材'])assert.ok(text.includes(value),value);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);
});
for(const fault of ['workflow','definition','node','round','batch','authorization','action','extra-action','account','absent'])test('Workflow evidence shortcut rejects original association mismatch '+fault,async()=>{
 const {h,record,button}=await workflowOperationEvidencePage(),data={accountId:'A',runs:[structuredClone(record)]},run=data.runs[0];
 if(fault==='workflow')run.workflowId='other';if(fault==='definition')run.workflowDefinitionId='other';if(fault==='node')run.workflowNodeId='other';if(fault==='round')run.workflowRound=2;if(fault==='batch')run.planSummary.batchId='other';if(fault==='authorization')run.authorizationSummary.batchId='other';if(fault==='action')run.actions[0].actionId='other';if(fault==='extra-action')run.actions.push({...run.actions[0],actionId:'extra'});if(fault==='account')run.accountId='B';if(fault==='absent')data.runs=[];
 const reading=button.click();h.respond('/api/operations/history',data);await reading;assert.equal(h.node('ops-history').textContent,'');assert.match(h.node('ops-history-hint').textContent,/原始执行证据.*不匹配/);assert.equal(writes(h).length,0);
});
for(const change of ['selection','replacement','account-return'])test('Workflow operation shortcut retires detached history callback after '+change,async()=>{
 const {h,data,button}=await workflowOperationEvidencePage();if(change==='selection'){h.node('wf-history-selected').value='other';h.node('wf-history-selected').onchange();}if(change==='replacement'){const read=h.node('wf-history-read').click();h.respond('/api/workflows/history',data);await read;}if(change==='account-return')h.run("selectAccount('B');selectAccount('A')");const count=h.requests.length,filter=h.node('ops-history-run-id').value;await button.click();assert.equal(h.requests.length,count);assert.equal(h.node('ops-history-run-id').value,filter);assert.equal(writes(h).length,0);
});
test('Workflow evidence navigation ignores a late read after account return or a newer history filter',async()=>{
 for(const change of ['account-return','filter']){const {h,record,button}=await workflowOperationEvidencePage(),reading=button.click();if(change==='account-return')h.run("selectAccount('B');selectAccount('A')");else {h.node('ops-history-run-id').value='other';h.node('ops-history-run-id').oninput();}h.respond('/api/operations/history',{accountId:'A',runs:[record]});await reading;assert.equal(h.node('ops-history').textContent,change==='account-return'?'尚未读取历史。':'');assert.equal(writes(h).length,0);}
});


for(const kind of ['MAIN_TASK_PROGRESS','BRANCH_TASK_PROGRESS','ACHIEVEMENT_TASK_PROGRESS'])for(const progress of ['0','9007199254740993','9223372036854775807'])test(kind+' form preserves exact int64 string and original unified business graph '+progress,async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);eventPolicyDraft(h,progress,kind);assert.equal(h.node('wf-policy-event-task').disabled,false);h.node('wf-policy-event-task').value='71';h.node('wf-policy-event-task').oninput();h.node('wf-policy-apply').click();const graph=conditionGraph(h);
 assert.deepEqual(graph.runPolicy.eventTrigger,{kind,taskId:71,progress});assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(graph.nodes,before.nodes);assert.deepEqual(graph.edges,before.edges);assert.deepEqual(graph.budget,before.budget);
 for(const entry of ['tasks','dailies','loop']){unifiedLoad(h,{entry,...(entry==='tasks'?{tasks:[{kind:'main',taskId:1}]}:{dailies:[{taskId:1006}]}),budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,graph.runPolicy);}
 assert.equal(writes(h).length,0);
});
for(const kind of ['MAIN_TASK_PROGRESS','BRANCH_TASK_PROGRESS','ACHIEVEMENT_TASK_PROGRESS'])test(kind+' form rejects fractional, noncanonical and out-of-int64 progress without mutating the graph',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);
 for(const progress of ['','-1','01','1.0','1e3',' 1','9223372036854775808','<img src=x>']){eventPolicyDraft(h,progress,kind);h.node('wf-policy-event-task').value='71';h.node('wf-policy-event-task').oninput();h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h),before);assert.equal(writes(h).length,0);}
});
for(const kind of ['MAIN_TASK_PROGRESS','BRANCH_TASK_PROGRESS','ACHIEVEMENT_TASK_PROGRESS'])test(kind+' finite run scope requires exact confirmation and stale callbacks cannot alter another account',async()=>{
 const eventTrigger={kind,taskId:71,progress:'9007199254740993'},f=await finiteRunPage({eventTrigger}),{h,offer,status}=f;
 assert.equal(h.node('wf-authorize-run').disabled,false);assert.match(h.node('wf-run-scope').textContent,/任务 71.*9007199254740993/);assert.match(h.node('wf-run-scope').textContent,/不证明完成或领奖资格/);
 const approval=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});h.run("selectAccount('B');selectAccount('A')");h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:'late'}},graphs:[],history:[]});await approval;assert.equal(h.node('wf-authorize-run').disabled,true);assert.doesNotMatch(h.node('wf-run-scope').textContent,/任务 71|有限运行授权已于/);assert.equal(writes(h,'/api/operations/execute').length,0);
 for(const extra of [{eligible:true},{taskId:0},{progress:1},{progress:'9223372036854775808'},{targetProgress:'1'},{rewardClaimed:false}]){const bad=await finiteRunPage({eventTrigger:{...eventTrigger,...extra}});assert.equal(bad.h.node('wf-authorize-run').disabled,true);assert.equal(writes(bad.h).length,0);}
});

for(const entry of ['tasks','loop'])test('daily-order observation PAGE prepares exact account survey without target or implicit authorization '+entry,async()=>{
 const h=await unifiedForm(entry);unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:entry==='loop'?2:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});
 unifiedAdd(h,'tasks','orderDaily-observe','<stale-target>');const intent=unifiedDraft(h);assert.deepEqual(intent.tasks,[{kind:'orderDaily',action:'observe'}]);assert.equal(h.node('wf-unified-target').disabled,true);assert.match(h.node('wf-unified-target-label').textContent,/无需任务 ID/);assert.match(h.node('wf-unified-steps').textContent,/每日订单进度只读观察/);assert.match(h.node('wf-unified-steps').textContent,/周期未知.*不生成动作.*免费刷新资格/);assert.equal(writes(h).length,0);
 const preparing=h.node('wf-unified-prepare').click();await tick();assert.deepEqual(JSON.parse(h.pending('/api/workflows/prepare').options.body),intent);const result=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES});h.respond('/api/workflows/prepare',{accountId:'A',...result});await preparing;
 const graph=JSON.parse(h.node('wf-json').value),surveys=graph.nodes.filter(n=>n.type==='SURVEY');assert.equal(surveys.length,entry==='loop'?2:1);assert.ok(surveys.every(n=>n.module==='orders'));assert.ok(surveys.every(n=>JSON.stringify(n.parameters)==='{}'));assert.equal(graph.nodes.some(n=>n.type==='ACTION'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,1);assert.equal(h.confirmations.length,0);
 const stale=unifiedStep(h,'tasks:0','0');assert.ok(stale);h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-unified-intent').value;stale.click();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,1);
});
test('daily-order observation PAGE rejects Dailies injection and ignores late preparation after account return',async()=>{
 const h=await unifiedForm('loop');unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-phase').value='dailies';h.node('wf-unified-phase').onchange();assert.equal(h.node('wf-unified-kind').children.some(n=>n.value==='orderDaily-observe'),false);const source=h.node('wf-unified-intent').value;h.node('wf-unified-kind').value='orderDaily-observe';h.node('wf-unified-add').click();assert.equal(h.node('wf-unified-intent').value,source);
 unifiedAdd(h,'tasks','orderDaily-observe');const result=compileUnifiedExecution(unifiedDraft(h),{modules:GAMEPLAY_MODULES}),preparing=h.node('wf-unified-prepare').click();await tick();h.run("selectAccount('B');selectAccount('A')");const graphSource=h.node('wf-json').value;h.respond('/api/workflows/prepare',{accountId:'A',...result});await preparing;assert.equal(h.node('wf-json').value,graphSource);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,1);
});

for(const explicit of [true,false])test('Orders historical PAGE displays captured counters independently without restoring authority '+explicit,async()=>{
 const {observeOrderProgress,summarizeOrderProgress}=await import('../src/order-execution.mjs'),h=await boot(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'orders-history',workflowId:'orders-graph',status:'RECOVERED_STOPPED'}]});await loading;
 const orderProgress=summarizeOrderProgress({progress:observeOrderProgress(null,{orderOfTheDay:{...(explicit?{orderNum:0}:{}),rewardedNum:6}})}),reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:'orders-history',workflowDefinitionId:'orders-graph',status:'RECOVERED_STOPPED',readOnly:true,resumable:false,nodes:[],waits:[],surveys:[{nodeId:'<img src=x onerror=alert(1)>',module:'orders',orderProgress}]});await reading;const box=h.node('wf-history-detail');assert.ok(box.textContent.includes('完成计数 '+(explicit?'0':'未知')+' · 已领奖阈值 6'));assert.match(box.textContent,/周期与重置时间未知.*仅当次观察.*不证明当前可领、到账或免费刷新资格.*不能恢复执行/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
});

for(const entry of ['tasks','dailies','loop'])test('factory clock PAGE unified form binds exact factory and zero queue index without dispatch '+entry,async()=>{
 const h=await unifiedForm(entry),phase=entry==='tasks'?'tasks':'dailies';unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-factory-id').value='1材料厂';h.node('wf-unified-factory-index').value='0';unifiedAdd(h,phase,'factory-queue-clock','1000');const draft=unifiedDraft(h);assert.deepEqual(draft[phase],[{type:'WAIT',cooldown:{kind:'FACTORY_QUEUE_CLOCK',buildingId:'1材料厂',index:0,maxWaitMs:1000}}]);assert.equal(h.node('wf-unified-factory-id').disabled,false);assert.equal(h.node('wf-unified-factory-index').disabled,false);assert.match(h.node('wf-unified-steps').textContent,/精确工厂 1材料厂.*队列 idx 0.*不证明生产完成或到账/);const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.graph.nodes.map(n=>n.type),['START','WAIT','STOP']);assert.equal(writes(h).length,0);
 for(const value of ['','-1','01','1.5','1e3','2147483648',' 0','0 ']){const source=h.node('wf-unified-intent').value;h.node('wf-unified-factory-index').value=value;unifiedAdd(h,phase,'factory-queue-clock','1000');assert.equal(h.node('wf-unified-intent').value,source);}h.node('wf-unified-factory-index').value='0';for(const value of ['',' 1材料厂','1材料厂 ','x'.repeat(101)]){const source=h.node('wf-unified-intent').value;h.node('wf-unified-factory-id').value=value;unifiedAdd(h,phase,'factory-queue-clock','1000');assert.equal(h.node('wf-unified-intent').value,source);}
 const old=unifiedStep(h,phase+':0','0');h.run("selectAccount('B');selectAccount('A')");assert.equal(h.node('wf-unified-factory-id').value,'');assert.equal(h.node('wf-unified-factory-index').value,'');const source=h.node('wf-unified-intent').value;old.click();assert.equal(h.node('wf-unified-intent').value,source);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
});
test('factory clock WAIT editor preserves canonical tuple fields and retires old account controls',async()=>{
 const h=await namedWaitPage(),before=conditionGraph(h),mode=namedWaitControl(h,'mode');mode.value='FACTORY_QUEUE_CLOCK';mode.onchange();assert.deepEqual(conditionGraph(h).nodes[1].cooldown,{kind:'FACTORY_QUEUE_CLOCK',maxWaitMs:60000,buildingId:'',index:null});assert.throws(()=>validateWorkflow(conditionGraph(h),{modules:GAMEPLAY_MODULES}));for(const [key,value]of [['buildingId','1材料厂'],['index','0'],['limit','1000']]){const input=namedWaitControl(h,key);input.value=value;input.onchange();}assert.equal(validateWorkflow(conditionGraph(h),{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(conditionGraph(h).edges,before.edges);assert.match(h.node('wf-nodes').textContent,/仅时钟到期.*不证明生产完成、收取或到账/);
 for(const value of ['','-1','01','1.5','1e3','2147483648',' 0']){const source=h.node('wf-json').value,input=namedWaitControl(h,'index');input.value=value;input.onchange();assert.equal(h.node('wf-json').value,source);}const stale=namedWaitControl(h,'buildingId');h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-json').value;stale.value='other';stale.onchange();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});
test('factory clock history PAGE renders captured target safely without treating time as completion or authority',async()=>{
 const {observeProductionQueueClocks}=await import('../src/production-planning.mjs'),h=await boot(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:'factory-history',workflowId:'factory-graph',status:'RECOVERED_STOPPED'}]});await loading;const buildingId='<img src=x onerror=alert(1)>',observation=observeProductionQueueClocks({buildings:[{buildingId,factory:{autoProductId:'',factoryQ:[{idx:0,productId:'cloth',finishTime:101}]}}],sourceAt:1000,serverBounds:{earliestMs:101000,latestMs:101001}})[0],reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:'factory-history',workflowDefinitionId:'factory-graph',status:'RECOVERED_STOPPED',readOnly:true,resumable:false,nodes:[],surveys:[],waits:[{nodeId:'wait',result:'WAIT_STARTED',durationMs:0,cooldownWait:{kind:'FACTORY_QUEUE_CLOCK',buildingId,index:0,maxWaitMs:1000,observation}}]});await reading;const box=h.node('wf-history-detail');assert.match(box.textContent,/具名生产队列时钟等待 0 毫秒/);assert.match(box.textContent,/目标消失或变化为UNKNOWN.*不证明生产完成、收取或到账/);assert.ok(box.textContent.includes(buildingId));assert.equal(descendants(box).some(n=>String(n.tagName).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
});

test('initial-level page explicitly chooses exact zero-level target and invalidates prior plan without authorizing',async()=>{
 const spec=cases.find(s=>s.actionType==='INITIAL_LEVEL'),h=await loaded(spec),modes=descendants(h.node('gp-equipment-growth-facts')).filter(e=>e.dataset.equipmentGrowthMode),mode=modes.find(e=>e.dataset.equipmentGrowthMode==='initial-level');assert.ok(mode);assert.match(h.node('gp-equipment-growth-facts').textContent,/当前零级且第一级配置费用为零/);
 h.node('gp-equipment-growth-parameters').value=JSON.stringify({heroId:'A',uid:'9007199254740994'});const before=h.requests.length;mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),spec.parameters);assert.equal(h.requests.length,before);assert.equal(h.node('gp-equipment-growth-plan').disabled,true);assert.equal(h.node('gp-equipment-growth-authorize').disabled,true);
 const task=h.node('gp-equipment-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'equipment-growth',parameters:spec.parameters});h.respond('/api/gameplay/survey',data(spec));await task;for(const route of ['/api/operations/plan','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
 h.run("selectAccount('B');selectAccount('A');");mode.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});assert.equal(writes(h,'/api/operations/execute').length,0);
});

function heroStarUiPreview(){
 const guards={expectedStar:1,expectedFragmentBalance:2,expectedStarCost:5},nodes=[{id:'start',type:'START'},{id:'exchange',type:'ACTION',module:'heroes',parameters:{heroId:'A',action:'fragment-exchange',num:3,...guards},selection:{unique:true}},{id:'verify-exchange',type:'VERIFY',module:'heroes'},{id:'star',type:'ACTION',module:'heroes',parameters:{heroId:'A',action:'star',allowUniversal:false,...guards,expectedFragmentBalance:5},selection:{unique:true}},{id:'verify-star',type:'VERIFY',module:'heroes'},{id:'stop',type:'STOP'}];
 return {accountId:'A',heroId:'A',fromStar:1,toStar:2,ownedFragments:2,exchangeNum:3,starCost:5,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'合成预览；逐步授权且UNKNOWN停止',graph:{version:1,id:'hero-star-synthetic',name:'A组合',runPolicy:{maxDurationMs:60000,maxActions:2,modules:['heroes']},budget:{resources:[{id:'蓝卡万能碎片',num:3},{id:'A碎片',num:5}],quotas:[],uids:[{type:'hero-fragment-exchange',id:'A'}]},nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))}};
}
async function heroStarUi(){const spec=cases.find(s=>s.actionType==='FRAGMENT-EXCHANGE'),h=await loaded(spec),controls=descendants(h.node('gp-heroes-facts'));return {h,target:controls.find(e=>e.dataset.heroExchangeTarget),num:controls.find(e=>e.dataset.heroExchangeQuantity),duration:controls.find(e=>e.dataset.heroStarDuration),prepare:controls.find(e=>e.dataset.heroStarPrepare)};}
test('hero composition page requires explicit duration and quantity then loads original editor without executing',async()=>{
 const {h,target,num,duration,prepare}=await heroStarUi();assert.ok(prepare);assert.equal(duration.value,'');const before=h.requests.length;await prepare.click();assert.equal(h.requests.length,before);target.value='A';num.value='3';duration.value='60';assert.equal(prepare.disabled,false,'editor='+h.run('stageRecommendationEditable()'));assert.deepEqual([target.value,num.value,duration.value],['A','3','60']);const task=prepare.click();assert.ok(h.pending('/api/gameplay/heroes/star/prepare'),h.node('gp-heroes-hint').textContent);assertMutation(h.pending('/api/gameplay/heroes/star/prepare'),'/api/gameplay/heroes/star/prepare',{heroId:'A',num:3,maxDurationMs:60000});assert.equal(prepare.disabled,true);h.respond('/api/gameplay/heroes/star/prepare',heroStarUiPreview());await task;assert.equal(prepare.disabled,false);assert.equal(JSON.parse(h.node('wf-json').value).id,'hero-star-synthetic');for(const path of ['/api/workflows/save','/api/workflows/start','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,path).length,0);
});
for(const change of ['account','quantity','duration','editor'])test('hero composition page discards late preview after '+change+' changes',async()=>{
 const {h,target,num,duration,prepare}=await heroStarUi();target.value='A';num.value='3';duration.value='60';const original=h.node('wf-json').value,task=prepare.click();assert.ok(h.pending('/api/gameplay/heroes/star/prepare'));
 if(change==='account')h.run("selectAccount('B');selectAccount('A');");if(change==='quantity')num.value='4';if(change==='duration')duration.value='61';if(change==='editor'){h.node('wf-name').value='edited';h.node('wf-name').oninput();}
 const expected=change==='editor'?h.node('wf-json').value:original;h.respond('/api/gameplay/heroes/star/prepare',heroStarUiPreview());await task;assert.equal(h.node('wf-json').value,expected);assert.equal(writes(h,'/api/workflows/start').length,0);
});
for(const corrupt of ['hero','guard','budget','edge','extraParameter','rounds'])test('hero composition page refuses mismatched '+corrupt+' preview',async()=>{
 const {h,target,num,duration,prepare}=await heroStarUi();target.value='A';num.value='3';duration.value='60';const original=h.node('wf-json').value,task=prepare.click(),reply=heroStarUiPreview();
 if(corrupt==='hero')reply.heroId='B';if(corrupt==='guard')reply.graph.nodes[3].parameters.expectedStar=2;if(corrupt==='budget')reply.graph.budget.resources[0].num=2;if(corrupt==='edge')reply.graph.edges[2].to='exchange';if(corrupt==='extraParameter')reply.graph.nodes[3].parameters.allowUniversal=true;if(corrupt==='rounds')reply.graph.runPolicy.maxRounds=2;
 h.respond('/api/gameplay/heroes/star/prepare',reply);await task;assert.equal(h.node('wf-json').value,original);assert.match(h.node('gp-heroes-hint').textContent,/未准备/);assert.equal(writes(h,'/api/workflows/start').length,0);
});


function multiHeroUiPreview(targets=[{heroId:'A',num:3},{heroId:'B',num:3}]) {
 const base=heroStarUiPreview(),nodes=[{id:'start',type:'START'}],resources=new Map(),uids=[];
 base.targets=targets.map(row=>({heroId:row.heroId,fromStar:1,toStar:2,ownedFragments:row.num===0?8:2,exchangeNum:row.num,starCost:5}));
 const add=(id,num)=>resources.set(id,(resources.get(id)||0)+num);
 for(const [i,row]of base.targets.entries())for(const original of heroStarUiPreview().graph.nodes.slice(1,-1)){
  if(row.exchangeNum===0&&original.id.includes('exchange'))continue;const node=structuredClone(original);node.id+='-'+i;
  if(node.parameters){node.parameters.heroId=row.heroId;node.parameters.expectedFragmentBalance=node.parameters.action==='fragment-exchange'?row.ownedFragments:row.ownedFragments+row.exchangeNum;if(node.parameters.action==='fragment-exchange'){node.parameters.num=row.exchangeNum;add('蓝卡万能碎片',row.exchangeNum);uids.push({type:'hero-fragment-exchange',id:row.heroId});}else add(row.heroId+'碎片',5);}
  nodes.push(node);
 }
 nodes.push({id:'stop',type:'STOP'});base.graph={version:1,id:'hero-stars-synthetic',name:'明确英雄单星顺序',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),runPolicy:{maxDurationMs:60000,maxActions:nodes.filter(n=>n.type==='ACTION').length,modules:['heroes']},budget:{resources:[...resources].map(([id,num])=>({id,num})),quotas:[],uids}};return base;
}
async function multiHeroUi(){const spec=structuredClone(cases.find(s=>s.actionType==='FRAGMENT-EXCHANGE'));spec.facts.heroes.push({...structuredClone(spec.facts.heroes[0]),heroId:'B'});spec.facts.fragments.push({...structuredClone(spec.facts.fragments[0]),heroId:'B',targetId:'B碎片'});const h=await loaded(spec),controls=descendants(h.node('gp-heroes-facts'));return {h,target:controls.find(e=>e.dataset.heroExchangeTarget),num:controls.find(e=>e.dataset.heroExchangeQuantity),duration:controls.find(e=>e.dataset.heroStarDuration),add:controls.find(e=>e.dataset.heroStarAdd),prepare:controls.find(e=>e.dataset.heroStarSequencePrepare)};}
function addHeroUi(u,heroId,num){u.target.value=heroId;u.num.value=String(num);u.add.click();}
test('hero composition page sends ordered multi-hero targets and never executes during preview',async()=>{
 const u=await multiHeroUi(),{h,prepare,duration}=u;addHeroUi(u,'A',3);addHeroUi(u,'B',3);duration.value='60';const task=prepare.click();assertMutation(h.pending('/api/gameplay/heroes/star/prepare'),'/api/gameplay/heroes/star/prepare',{targets:[{heroId:'A',num:3},{heroId:'B',num:3}],maxDurationMs:60000});h.respond('/api/gameplay/heroes/star/prepare',multiHeroUiPreview());await task;assert.equal(JSON.parse(h.node('wf-json').value).id,'hero-stars-synthetic',h.node('gp-heroes-hint').textContent);for(const route of ['/api/workflows/start','/api/workflows/save','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
});
test('hero composition page reorders and removes declared targets, allows explicit zero and blocks duplicate targets',async()=>{
 const u=await multiHeroUi(),{h,prepare,duration}=u;addHeroUi(u,'A',3);addHeroUi(u,'A',3);assert.match(h.node('gp-heroes-hint').textContent,/不同英雄/);addHeroUi(u,'B',0);let controls=descendants(h.node('gp-heroes-facts'));const old=controls.find(e=>e.dataset.heroStarList==='up'&&e.dataset.heroStarListIndex==='1');old.click();old.click();duration.value='60';let task=prepare.click();assertMutation(h.pending('/api/gameplay/heroes/star/prepare'),'/api/gameplay/heroes/star/prepare',{targets:[{heroId:'B',num:0},{heroId:'A',num:3}],maxDurationMs:60000});h.respond('/api/gameplay/heroes/star/prepare',multiHeroUiPreview([{heroId:'B',num:0},{heroId:'A',num:3}]));await task;assert.equal(JSON.parse(h.node('wf-json').value).nodes[1].parameters.heroId,'B',h.node('gp-heroes-hint').textContent);controls=descendants(h.node('gp-heroes-facts'));controls.find(e=>e.dataset.heroStarList==='remove'&&e.dataset.heroStarListIndex==='0').click();task=prepare.click();assertMutation(h.pending('/api/gameplay/heroes/star/prepare'),'/api/gameplay/heroes/star/prepare',{targets:[{heroId:'A',num:3}],maxDurationMs:60000});h.respond('/api/gameplay/heroes/star/prepare',multiHeroUiPreview([{heroId:'A',num:3}]));await task;
});
for(const corrupt of ['order','budget','missingCost','zero','nodes','selection'])test('multi-hero page rejects altered '+corrupt+' response and preserves editor',async()=>{
 const u=await multiHeroUi(),{h,prepare,duration}=u;addHeroUi(u,'A',3);addHeroUi(u,'B',3);duration.value='60';const before=h.node('wf-json').value,task=prepare.click(),reply=multiHeroUiPreview();
 if(corrupt==='order')reply.targets.reverse();if(corrupt==='budget')reply.graph.budget.resources[0].num=7;if(corrupt==='missingCost')reply.graph.budget.resources[0]={id:'fake'};if(corrupt==='zero')reply.targets[1].exchangeNum=0;if(corrupt==='nodes')reply.graph.nodes[7].parameters.expectedFragmentBalance=6;if(corrupt==='selection')reply.graph.nodes[7].selection={unique:true,actionId:'fake'};
 h.respond('/api/gameplay/heroes/star/prepare',reply);await task;assert.equal(h.node('wf-json').value,before);assert.match(h.node('gp-heroes-hint').textContent,/未准备/);
});
for(const change of ['account','editor','duration'])test('multi-hero page ignores delayed response after '+change,async()=>{
 const u=await multiHeroUi(),{h,prepare,duration}=u;addHeroUi(u,'A',3);addHeroUi(u,'B',3);duration.value='60';const task=prepare.click();if(change==='account')h.run("selectAccount('B');selectAccount('A');");if(change==='editor'){h.node('wf-name').value='new';h.node('wf-name').oninput();}if(change==='duration')duration.value='61';const before=h.node('wf-json').value;h.respond('/api/gameplay/heroes/star/prepare',multiHeroUiPreview());await task;assert.equal(h.node('wf-json').value,before);assert.equal(writes(h,'/api/workflows/start').length,0);
});


function resourceFieldPageData(parameters={},blocked=false){const data=fleetOperationsData(parameters);data.config.giveUpResourceField=true;data.view.resourceFields={maxNum:3,fields:[{gridIdx:0,cityId:1,type:0},{gridIdx:9,cityId:2,type:1}]};if(Object.hasOwn(parameters,'resourceFieldGridIdx'))data.view.candidates=[{actionId:'fleet:giveUpField:'+parameters.resourceFieldGridIdx,actionType:'giveUpField',target:{gridIdx:parameters.resourceFieldGridIdx},parameters,costs:[],costSource:'Fixed LandUtil',executable:!blocked,decision:blocked?'BLOCKED':'READY',reason:blocked?'RESOURCE_FIELD_NOT_OWNED':null}];return data;}
const fieldUi=(h,name)=>descendants(h.node('gp-fleet-operations')).find(n=>n.dataset[name]);
test('resource field page prepares explicit zero grid without surveying, authorizing or executing automatically',async()=>{
 const h=await fleetEditorPage(resourceFieldPageData()),source=h.node('gp-fleet-parameters').value;assert.equal(fieldUi(h,'resourceFieldPrepare').disabled,false);fieldUi(h,'resourceFieldPrepare').click();assert.equal(h.node('gp-fleet-parameters').value,source);assert.equal(writes(h).length,0);fieldUi(h,'resourceFieldTarget').value='0';fieldUi(h,'resourceFieldPrepare').click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{resourceFieldGridIdx:0});assert.equal(writes(h).length,0);
 const parameters={resourceFieldGridIdx:0},scan=h.node('gp-fleet-survey').click();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'fleet',parameters});h.respond('/api/gameplay/survey',resourceFieldPageData(parameters));await scan;const choose=fieldUi(h,'resourceFieldCandidate');assert.equal(choose.disabled,false);choose.click();assert.equal(writes(h,'/api/operations/authorize').length,0);const plan=h.node('gp-fleet-plan').click();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'fleet',mode:'Manual',parameters,selections:['fleet:giveUpField:0']});h.respond('/api/operations/plan',{error:'synthetic end'});await plan;
});
for(const state of ['disabled','blocked','dirty','account','unknown-fields'])test('resource field page rejects stale or unavailable target '+state,async()=>{
 const data=resourceFieldPageData({resourceFieldGridIdx:0},state==='blocked');if(state==='disabled')data.config.giveUpResourceField=false;if(state==='unknown-fields')data.view.resourceFields=null;const h=await fleetEditorPage(data),old=fieldUi(h,'resourceFieldPrepare'),choose=fieldUi(h,'resourceFieldCandidate'),source=h.node('gp-fleet-parameters').value;
 if(state==='dirty'){h.node('gp-fleet-parameters').value='{}';h.node('gp-fleet-parameters').oninput();}if(state==='account')h.run("selectAccount('B')");if(state==='blocked'){assert.equal(choose.disabled,true);choose.click();}else{if(state==='disabled'||state==='unknown-fields')assert.equal(old.disabled,true);old.click();}assert.equal(writes(h).length,0);if(!['account','dirty'].includes(state))assert.equal(h.node('gp-fleet-parameters').value,source);
});

function petLevelUiSpec(){return {module:'pet',actionId:'pet:LEVEL:exact',actionType:'LEVEL',parameters:{action:'level',buildingId:'1宠物',uid:'9007199254740993'},target:{buildingId:'1宠物',uid:'9007199254740993',petId:'蓝宠物1',fromLevel:1,toLevel:2},costs:[{id:'宠物经验',num:1300}],facts:{mode:'level',playerLevel:30,rooms:[],serving:[{buildingId:'1宠物',uid:'9007199254740993'}]},blockedReason:'PET_LEVEL_CONFIG_OR_EFFECT_UNKNOWN'};}
test('Pet LEVEL full PAGE selects exact serving UID, previews explicit debit and uses original permit once',async()=>{
 const spec=petLevelUiSpec(),h=await loaded(spec);assert.match(h.node('gp-pet-facts').textContent,/9007199254740993/);assert.match(h.node('gp-pet-facts').textContent,/玩家等级 30/);assert.match(h.node('gp-pet-facts').textContent,/宠物经验 × 1300/);await preview(h,spec);
 h.setConfirm(true);const running=h.node('gp-pet-authorize').onclick(),expected=plan(spec);assertMutation(h.pending('/api/operations/authorize'),'/api/operations/authorize',{batchId:expected.batchId,planHash:expected.planHash,approvedActionIds:[spec.actionId],resourceBudget:spec.costs,confirm:true});assert.match(h.confirmations.at(-1),/9007199254740993/);assert.match(h.confirmations.at(-1),/"buildingId": "1宠物"/);h.respond('/api/operations/authorize',{accountId:'A',batchId:expected.batchId,permitId:'level-permit'});await tick();assertMutation(h.pending('/api/operations/execute'),'/api/operations/execute',{batchId:expected.batchId,permitId:'level-permit'});h.respond('/api/operations/execute',{status:'EXECUTING',runId:'level-run'});await running;assert.equal(writes(h,'/api/operations/execute').length,1);assert.equal(h.node('gp-pet-authorize').disabled,true);
});
test('Pet PAGE action-mode controls create read-only drafts and stale controls cannot change current inputs',async()=>{
 const spec=petLevelUiSpec(),h=await loaded(spec),oldLevel=descendants(h.node('gp-pet-facts')).find(n=>n.dataset.petMode==='level');
 const task=h.node('gp-pet-load').click();h.respond('/api/gameplay',data(spec),{module:'pet'});await task;const before=h.node('gp-pet-parameters').value;oldLevel.click();assert.equal(h.node('gp-pet-parameters').value,before);const current=descendants(h.node('gp-pet-facts')).find(n=>n.dataset.petMode==='level');current.click();assert.deepEqual(JSON.parse(h.node('gp-pet-parameters').value),{action:'level'});assert.equal(writes(h).length,0);
 const f=await loaded(spec),feed=descendants(f.node('gp-pet-facts')).find(n=>n.dataset.petMode==='feed');feed.click();assert.deepEqual(JSON.parse(f.node('gp-pet-parameters').value),{action:'feed'});assert.equal(writes(f).length,0);
});
test('Pet LEVEL Workflow parameter editor preserves exact decimal UID and rejects feed job selectors',async()=>{
 const h=await parameterPage();parameterSet(h,'action',JSON.stringify('level'));parameterSet(h,'buildingId','1宠物');parameterSet(h,'uid','9007199254740993');parameterApply(h).click();assert.deepEqual(businessNode(h).parameters,{action:'level',buildingId:'1宠物',uid:'9007199254740993'});assert.equal(validateWorkflow(parameterGraphForValidation(h),{modules:{pet:GAMEPLAY_MODULES.pet}}).valid,true);parameterSet(h,'jobIdx','0');parameterApply(h).click();assert.throws(()=>validateWorkflow(parameterGraphForValidation(h),{modules:{pet:GAMEPLAY_MODULES.pet}}),/混用/);assert.equal(writes(h).length,0);
});


async function forgePrepareUi({making=false,missing=false}={}){
 const spec=structuredClone(cases.find(row=>row.module==='equipment-forge')),queue=making?{state:'MAKING',makeId:1001,finishTime:900,equipId:'蓝武器1',star:0}:{state:'IDLE',makeId:0,finishTime:0,equipId:'',star:0},counts={武器:making?1:0,防具:0,饰品:0},order=making?['防具','饰品','武器']:['武器','防具','饰品'];
 spec.facts.forges[0].queue=queue;spec.facts.season=1;const recipe={...spec.facts.recipes[0],seconds:1800,qualityIndex:1,qualityName:'蓝色',qualityReliable:true};spec.facts.preparation={reliable:!missing,counts:missing?null:counts,order:missing?[]:order,recipes:[recipe]};
 const h=await loaded(spec),controls=descendants(h.node('gp-equipment-forge-facts'));
 return {h,spec,queue,counts,order,recipe,building:controls.find(row=>row.dataset.forgePrepareBuilding),duration:controls.find(row=>row.dataset.forgePrepareDuration),allowed:controls.find(row=>row.dataset.forgePrepareRecipe),prepare:controls.find(row=>row.dataset.forgePrepare)};
}
function forgePreparePreview(u){
 const {state,...queue}=u.queue,parameters={buildingId:'1装备厂',action:'make',makeId:1001,allowUniversal:false,expectedEquipmentCounts:u.counts,expectedQueue:{makeId:0,finishTime:0,equipId:'',star:0}},nodes=[{id:'start',type:'START'}];
 if(state==='MAKING')nodes.push({id:'pick',type:'ACTION',module:'equipment-forge',parameters:{buildingId:'1装备厂',action:'pick',expectedEquipmentCounts:u.counts,expectedQueue:queue},selection:{unique:true}},{id:'verify-pick',type:'VERIFY',module:'equipment-forge'});
 nodes.push({id:'make',type:'ACTION',module:'equipment-forge',parameters,selection:{unique:true}},{id:'verify-make',type:'VERIFY',module:'equipment-forge'},{id:'stop',type:'STOP'});const selected={...u.recipe,blockedReason:null};
 return {accountId:'A',buildingId:'1装备厂',makeIds:[1001],counts:u.counts,order:u.order,queue,selected,candidates:[selected],resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'合成单次制造预览；UNKNOWN停止不重放',graph:{version:1,id:'forge-preparation-synthetic',name:'准备',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget:{resources:u.recipe.costs,quotas:[],uids:[]},runPolicy:{maxDurationMs:60000,maxActions:state==='MAKING'?2:1,modules:['equipment-forge']}}};
}
function chooseForge(u){u.building.value='1装备厂';u.allowed.checked=true;u.duration.value='60';}
for(const making of [false,true])test('forge full PAGE prepares one reviewed '+(making?'pick then make':'make')+' in original editor without execution',async()=>{
 const u=await forgePrepareUi({making}),{h,prepare}=u;assert.equal(u.building.value,'');assert.equal(u.allowed.checked,false);assert.equal(u.duration.value,'');const before=h.requests.length;await prepare.click();assert.equal(h.requests.length,before);chooseForge(u);const task=prepare.click();await tick();assert.ok(h.pending('/api/gameplay/equipment-forge/prepare'),h.node('gp-equipment-forge-hint').textContent+' editor='+h.run('stageRecommendationEditable()')+' disabled='+prepare.disabled);assertMutation(h.pending('/api/gameplay/equipment-forge/prepare'),'/api/gameplay/equipment-forge/prepare',{buildingId:'1装备厂',makeIds:[1001],maxDurationMs:60000});assert.equal(prepare.disabled,true);h.respond('/api/gameplay/equipment-forge/prepare',forgePreparePreview(u));await task;assert.equal(JSON.parse(h.node('wf-json').value).id,'forge-preparation-synthetic',h.node('gp-equipment-forge-hint').textContent);assert.equal(prepare.disabled,false);assert.match(h.node('gp-equipment-forge-facts').textContent,/不含佩戴/);for(const route of ['/api/workflows/start','/api/workflows/save','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
});
for(const change of ['account','building','duration','allowlist','editor'])test('forge preparation PAGE retires late '+change+' preview',async()=>{
 const u=await forgePrepareUi(),{h}=u;chooseForge(u);const task=u.prepare.click();await tick();assert.ok(h.pending('/api/gameplay/equipment-forge/prepare'),h.node('gp-equipment-forge-hint').textContent);if(change==='account')h.run("selectAccount('B');selectAccount('A');");if(change==='building')u.building.value='2装备厂';if(change==='duration')u.duration.value='61';if(change==='allowlist')u.allowed.checked=false;if(change==='editor'){h.node('wf-name').value='edited';h.node('wf-name').oninput();}const original=h.node('wf-json').value;h.respond('/api/gameplay/equipment-forge/prepare',forgePreparePreview(u));await task;assert.equal(h.node('wf-json').value,original);assert.equal(writes(h,'/api/workflows/start').length,0);
});
for(const corrupt of ['account','count','recipe','budget','queue','edge','guard','universal','rounds','extraAction'])test('forge preparation PAGE rejects mismatched '+corrupt+' without editing or executing',async()=>{
 const u=await forgePrepareUi({making:true}),{h}=u;chooseForge(u);const before=h.node('wf-json').value,task=u.prepare.click(),reply=structuredClone(forgePreparePreview(u));await tick();if(corrupt==='account')reply.accountId='B';if(corrupt==='count')reply.counts.武器++;if(corrupt==='recipe')reply.selected.makeId=1002;if(corrupt==='budget')reply.graph.budget.resources[0].num++;if(corrupt==='queue')reply.queue.star++;if(corrupt==='edge')reply.graph.edges[1].to='make';if(corrupt==='guard')delete reply.graph.nodes[3].parameters.expectedEquipmentCounts;if(corrupt==='universal')reply.graph.nodes[3].parameters.allowUniversal=true;if(corrupt==='rounds')reply.graph.runPolicy.maxRounds=2;if(corrupt==='extraAction')reply.graph.nodes.push({id:'again',type:'ACTION',module:'equipment-forge',parameters:reply.graph.nodes[3].parameters});h.respond('/api/gameplay/equipment-forge/prepare',reply);await task;assert.equal(h.node('wf-json').value,before);assert.equal(writes(h,'/api/workflows/start').length,0);
});
test('forge preparation PAGE keeps missing queue or counts blocked without inventing defaults',async()=>{const u=await forgePrepareUi({missing:true}),{h}=u;assert.equal(u.prepare.disabled,true);assert.equal(u.allowed.disabled,true);chooseForge(u);const before=h.requests.length;await u.prepare.click();assert.equal(h.requests.length,before);assert.equal(writes(h).length,0);});


test('museum PAGE keeps elapsed exploration separate from settlement, pending identity and independent revenue',async()=>{
 const h=await numberConfigPage('museum');assert.match(h.node('gp-museum-facts').textContent,/同次结算身份.*待领奖.*到账凭证/);assert.match(h.node('gp-museum-facts').textContent,/到期只表示等待结算.*不证明奖励已生成或到账/);assert.equal(writes(h).length,0);
});


test('ordinary AFK PAGE fixes exact observed interval without sending or replacing milestone parameters implicitly',async()=>{
 const d=numberConfigData('afk-level-rewards');d.view.afk={level:2,rewardedLevel:0,afkStartTime:100,afkFinishTime:500};const h=await numberConfigPage('afk-level-rewards',d),button=descendants(h.node('gp-afk-level-rewards-facts')).find(n=>n.dataset.afkIncomePrepare);assert.ok(button);assert.equal(button.disabled,false);const before=h.requests.length;button.click();assert.deepEqual(JSON.parse(h.node('gp-afk-level-rewards-parameters').value),{action:'income',level:2,afkStartTime:100,afkFinishTime:500});assert.equal(h.requests.length,before);assert.equal(writes(h).length,0);assert.match(h.node('gp-afk-level-rewards-facts').textContent,/至少经过61秒/);assert.match(h.node('gp-afk-level-rewards-hint').textContent,/重新探测/);
});

test('ordinary AFK PAGE missing interval and stale rendered view cannot prepare a replacement target',async()=>{
 const empty=await numberConfigPage('afk-level-rewards'),blocked=descendants(empty.node('gp-afk-level-rewards-facts')).find(n=>n.dataset.afkIncomePrepare);assert.equal(blocked.disabled,true);blocked.click();assert.equal(writes(empty).length,0);
 const d=numberConfigData('afk-level-rewards');d.view.afk={level:2,afkStartTime:100,afkFinishTime:500};const h=await numberConfigPage('afk-level-rewards',d),old=descendants(h.node('gp-afk-level-rewards-facts')).find(n=>n.dataset.afkIncomePrepare),reading=h.node('gp-afk-level-rewards-load').click(),next=structuredClone(d);next.view.afk.afkStartTime=200;next.view.afk.afkFinishTime=600;h.respond('/api/gameplay',next,{module:'afk-level-rewards'});await reading;const before=h.node('gp-afk-level-rewards-parameters').value;old.click();assert.equal(h.node('gp-afk-level-rewards-parameters').value,before);assert.equal(writes(h).length,0);
});

for(const entry of ['tasks','dailies','loop'])test('unified ordinary AFK PAGE '+entry+' requires explicit interval and retains draft budget without dispatch',async()=>{
 const h=await unifiedForm(entry),phase=entry==='dailies'?'dailies':'tasks',initial=structuredClone(unifiedDraft(h)[phase]),before=h.requests.length;h.node('wf-unified-afk-start').value='100';h.node('wf-unified-afk-finish').value='500';unifiedAdd(h,phase,'afk-income','2');assert.equal(h.node('wf-unified-afk-start').disabled,false);assert.equal(h.node('wf-unified-afk-finish').disabled,false);assert.match(h.node('wf-unified-target-label').textContent,/挂机等级/);
 const draft=unifiedDraft(h),p={action:'income',level:2,afkStartTime:100,afkFinishTime:500};assert.deepEqual(draft[phase],[...initial,...(phase==='tasks'?[{kind:'afk-income',level:2,afkStartTime:100,afkFinishTime:500}]:[{taskId:1004,action:'perform',parameters:p}])]);assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});assert.match(h.node('wf-unified-steps').textContent,/普通挂机本段收益.*明确挂机等级 2.*100 → 500/);assert.match(h.node('wf-unified-steps').textContent,/不自动升级或领取任务奖励/);assert.deepEqual(compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.module==='afk-level-rewards').parameters,p);assert.equal(h.requests.length,before);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B')");assert.equal(h.node('wf-unified-afk-start').value,'');assert.equal(h.node('wf-unified-afk-finish').value,'');assert.equal(h.node('wf-unified-target').value,'');
});
test('unified ordinary AFK PAGE refuses missing or malformed intervals and keeps the prior declaration',async()=>{
 const h=await unifiedForm('loop');for(const [level,start,finish]of [['2','','500'],['2','100',''],['2','0','500'],['2','1e2','500'],['2',' 100','500'],['2','100','100'],['2','100','99'],['2','100','2147483648'],['','100','500'],['2.5','100','500']]){const before=h.node('wf-unified-intent').value;h.node('wf-unified-afk-start').value=start;h.node('wf-unified-afk-finish').value=finish;unifiedAdd(h,'dailies','afk-income',level);assert.equal(h.node('wf-unified-intent').value,before);}assert.equal(writes(h,'/api/workflows/prepare').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);
});

for(const levels of [1,5,10])test('AFK upgrade PAGE fixes explicit increment '+levels+' and requires fresh survey and separate authorization',async()=>{
 const d=numberConfigData('afk-level-rewards');d.view.afk={level:2,rewardedLevel:0,afkStartTime:200,afkFinishTime:600};const h=await numberConfigPage('afk-level-rewards',d),button=descendants(h.node('gp-afk-level-rewards-facts')).find(n=>n.dataset.afkUpgradePrepare===String(levels));assert.ok(button);assert.equal(button.disabled,false);const count=h.requests.length;button.click();assert.deepEqual(JSON.parse(h.node('gp-afk-level-rewards-parameters').value),{action:'upgrade',level:2,levels});assert.equal(h.requests.length,count);assert.equal(writes(h).length,0);assert.equal(h.node('gp-afk-level-rewards-plan').disabled,true);assert.equal(h.node('gp-afk-level-rewards-authorize').disabled,true);assert.match(h.node('gp-afk-level-rewards-hint').textContent,/同连接已确认收益.*主线门槛.*逐档成本.*单独授权/);
});
test('AFK upgrade PAGE missing level, stale render and account switch cannot prepare an upgrade',async()=>{
 const empty=await numberConfigPage('afk-level-rewards');for(const b of descendants(empty.node('gp-afk-level-rewards-facts')).filter(n=>n.dataset.afkUpgradePrepare)){assert.equal(b.disabled,true);b.click();}assert.equal(writes(empty).length,0);
 const d=numberConfigData('afk-level-rewards');d.view.afk={level:2,afkStartTime:200,afkFinishTime:600};const h=await numberConfigPage('afk-level-rewards',d),old=descendants(h.node('gp-afk-level-rewards-facts')).find(n=>n.dataset.afkUpgradePrepare==='5'),reading=h.node('gp-afk-level-rewards-load').click(),next=structuredClone(d);next.view.afk.level=3;h.respond('/api/gameplay',next,{module:'afk-level-rewards'});await reading;const before=h.node('gp-afk-level-rewards-parameters').value;old.click();assert.equal(h.node('gp-afk-level-rewards-parameters').value,before);const current=descendants(h.node('gp-afk-level-rewards-facts')).find(n=>n.dataset.afkUpgradePrepare==='5');h.run("selectAccount('B');");const switched=h.node('gp-afk-level-rewards-parameters').value;current.click();assert.equal(h.node('gp-afk-level-rewards-parameters').value,switched);assert.equal(writes(h).length,0);
});

async function afkChainUi({missing=false}={}){
 const spec=structuredClone(cases.find(row=>row.module==='afk-level-rewards'));spec.facts.afk={level:2,rewardedLevel:0,afkStartTime:100,afkFinishTime:500};spec.facts.upgradePreparation={reliable:!missing,mainlineStage:1000,options:[1,5,10].map(levels=>({levels,targetLevel:2+levels,costs:[{id:'挂机徽章',num:levels}],blockedReason:null}))};const h=await loaded(spec),controls=descendants(h.node('gp-afk-level-rewards-facts'));return {h,spec,levels:controls.find(n=>n.dataset.afkChainLevels),duration:controls.find(n=>n.dataset.afkChainDuration),prepare:controls.find(n=>n.dataset.afkChainPrepare)};
}
function afkChainPreview(u){const levels=Number(u.levels.value),source={level:2,afkStartTime:100,afkFinishTime:500},costs=[{id:'挂机徽章',num:levels}],module='afk-level-rewards',nodes=[{id:'start',type:'START'},{id:'income',type:'ACTION',module,parameters:{action:'income',...source,upgradePreparation:{levels,expectedCost:levels}},selection:{unique:true}},{id:'verify-income',type:'VERIFY',module},{id:'upgrade',type:'ACTION',module,parameters:{action:'upgrade',level:2,levels,incomeFrom:{afkStartTime:100,afkFinishTime:500},expectedUpgradeCost:levels},selection:{unique:true}},{id:'verify-upgrade',type:'VERIFY',module},{id:'stop',type:'STOP'}];return {accountId:'A',source,levels,targetLevel:2+levels,costs,mainlineStage:1000,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'合成依赖准备，UNKNOWN停止',graph:{version:1,id:'afk-chain-synthetic',name:'收益确认后升级',nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id})),budget:{resources:costs,quotas:[],uids:[{type:'afk-income-interval',id:'2:100:500'},{type:'afk-upgrade',id:'2:income:100:500:'+levels}]},runPolicy:{maxDurationMs:Number(u.duration.value)*1000,maxActions:2,modules:[module]}}};}
for(const count of [1,5,10])test('AFK chain PAGE prepares explicit finite '+count+' increase in original editor without authorizing or executing',async()=>{
 const u=await afkChainUi(),{h}=u;assert.equal(u.levels.value,'');assert.equal(u.duration.value,'');const before=h.requests.length;await u.prepare.click();assert.equal(h.requests.length,before);u.levels.value=String(count);u.duration.value='60';const task=u.prepare.click();await tick();assert.ok(h.pending('/api/gameplay/afk/upgrade/prepare'),h.node('gp-afk-level-rewards-hint').textContent+' disabled='+u.prepare.disabled);assertMutation(h.pending('/api/gameplay/afk/upgrade/prepare'),'/api/gameplay/afk/upgrade/prepare',{level:2,levels:count,afkStartTime:100,afkFinishTime:500,maxDurationMs:60000});assert.equal(u.prepare.disabled,true);h.respond('/api/gameplay/afk/upgrade/prepare',afkChainPreview(u));await task;assert.equal(JSON.parse(h.node('wf-json').value).id,'afk-chain-synthetic',h.node('gp-afk-level-rewards-hint').textContent);assert.equal(u.prepare.disabled,false);for(const route of ['/api/workflows/start','/api/workflows/save','/api/workflows/authorize-run','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
});
for(const change of ['account','levels','duration','editor','parameters'])test('AFK chain PAGE retires late '+change+' response without replacing draft',async()=>{
 const u=await afkChainUi(),{h}=u;u.levels.value='5';u.duration.value='60';const reply=afkChainPreview(u),task=u.prepare.click();await tick();if(change==='account')h.run("selectAccount('B');selectAccount('A')");if(change==='levels')u.levels.value='10';if(change==='duration')u.duration.value='61';if(change==='editor'){h.node('wf-name').value='edited';h.node('wf-name').oninput();}if(change==='parameters'){h.node('gp-afk-level-rewards-parameters').value='{}';h.node('gp-afk-level-rewards-parameters').oninput();}const original=h.node('wf-json').value;h.respond('/api/gameplay/afk/upgrade/prepare',reply);await task;assert.equal(h.node('wf-json').value,original);assert.equal(writes(h,'/api/workflows/start').length,0);
});
for(const corrupt of ['account','source','cost','target','mainline','budget','source-uid','income-guard','upgrade-guard','edge','order','rounds','extra-action','future-interval'])test('AFK chain PAGE rejects mismatched '+corrupt+' preview',async()=>{
 const u=await afkChainUi(),{h}=u;u.levels.value='5';u.duration.value='60';const before=h.node('wf-json').value,reply=structuredClone(afkChainPreview(u)),task=u.prepare.click();await tick();if(corrupt==='account')reply.accountId='B';if(corrupt==='source')reply.source.afkStartTime++;if(corrupt==='cost')reply.costs[0].num++;if(corrupt==='target')reply.targetLevel++;if(corrupt==='mainline')reply.mainlineStage++;if(corrupt==='budget')reply.graph.budget.resources[0].num++;if(corrupt==='source-uid')reply.graph.budget.uids[1].id='future';if(corrupt==='income-guard')delete reply.graph.nodes[1].parameters.upgradePreparation;if(corrupt==='upgrade-guard')delete reply.graph.nodes[3].parameters.expectedUpgradeCost;if(corrupt==='edge')reply.graph.edges[1].to='upgrade';if(corrupt==='order')reply.graph.nodes.reverse();if(corrupt==='rounds')reply.graph.runPolicy.maxRounds=2;if(corrupt==='extra-action')reply.graph.nodes.push({...reply.graph.nodes[3],id:'again'});if(corrupt==='future-interval')reply.graph.nodes[3].parameters.afkStartTime=200;h.respond('/api/gameplay/afk/upgrade/prepare',reply);await task;assert.equal(h.node('wf-json').value,before);assert.match(h.node('gp-afk-level-rewards-hint').textContent,/未准备/);assert.equal(writes(h,'/api/workflows/start').length,0);
});
test('AFK chain PAGE keeps unknown preparation disabled instead of deriving costs or mainline from defaults',async()=>{const u=await afkChainUi({missing:true}),{h}=u;assert.equal(u.prepare.disabled,true);assert.equal(u.levels.disabled,true);u.levels.value='5';u.duration.value='60';const count=h.requests.length;await u.prepare.click();assert.equal(h.requests.length,count);assert.equal(writes(h).length,0);});

async function farmSequenceUi({unknown=false,count=2,replant=false}={}){const spec=structuredClone(cases.find(r=>r.module==='farm'));spec.facts.plots=Array.from({length:count},(_,i)=>({buildingId:(i+1)+'农田',productId:'小麦',plantTime:100,ripeTime:200,reliable:true,state:unknown?'MATURITY_UNKNOWN':'RIPE'}));if(replant)spec.facts.crops=[{productId:'小麦',costs:[{id:'小麦种子',num:1}],reliable:true},{productId:'玉米',costs:[{id:'玉米种子',num:2}],reliable:true}];spec.facts.candidates=spec.facts.plots.map((p,i)=>({module:'farm',actionType:'HARVEST',actionId:'farm-harvest-'+i,target:{buildingId:p.buildingId,productId:p.productId},identity:String(i+1).padStart(64,'0'),parameters:{buildingId:p.buildingId,action:'harvest'},costs:[],costSource:'exact single crop',budgetClaims:{resources:[],quotas:[],uids:[{type:'farm-harvest',id:'uid-'+i}]},executable:!unknown,blockedReason:unknown?'UNKNOWN':null}));const h=await boot(),loading=h.node('gp-farm-load').onclick(),response=data(spec);response.view.candidates=spec.facts.candidates;h.respond('/api/gameplay',response,{module:'farm'});await loading;const controls=descendants(h.node('gp-farm-facts'));return {h,spec,choices:controls.filter(n=>n.dataset.farmHarvestTarget),duration:controls.find(n=>n.dataset.farmHarvestDuration),prepare:controls.find(n=>n.dataset.farmHarvestPrepare)};}
function farmSequencePreview(u){const targets=u.choices.filter(n=>n.checked).map(n=>{const p=u.spec.facts.plots.find(p=>p.buildingId===n.dataset.farmHarvestTarget);return {buildingId:p.buildingId,productId:p.productId,plantTime:p.plantTime,ripeTime:p.ripeTime,identity:u.spec.facts.candidates.find(c=>c.target.buildingId===p.buildingId).identity};}),nodes=[{id:'start',type:'START'}];for(let i=0;i<targets.length;i++)nodes.push({id:'harvest-'+i,type:'ACTION',module:'farm',parameters:{buildingId:targets[i].buildingId,action:'harvest',pendingHarvests:targets.slice(i)},selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'farm'});nodes.push({id:'stop',type:'STOP'});return {accountId:'A',targets,requiresFreshPlan:true,requiresAuthorization:true,resumable:false,limitation:'合成明确逐田收取',graph:{version:1,id:'farm-sequence-synthetic',name:'逐田收取',nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id})),runPolicy:{maxDurationMs:Number(u.duration.value)*1000,maxActions:targets.length,modules:['farm']},budget:{resources:[],quotas:[],uids:targets.map(t=>u.spec.facts.candidates.find(c=>c.target.buildingId===t.buildingId).budgetClaims.uids[0])}}};}
for(const count of [1,2,12])test('Farm sequence PAGE explicit '+count+' targets prepare original editor only without automatic authorization',async()=>{const u=await farmSequenceUi({count}),{h}=u;assert.equal(u.duration.value,'');assert.ok(u.choices.every(c=>c.checked===false));let before=h.requests.length;await u.prepare.click();assert.equal(h.requests.length,before);for(const c of u.choices)c.checked=true;u.duration.value='60';const expected=farmSequencePreview(u),task=u.prepare.click();await tick();assert.ok(h.pending('/api/gameplay/farm/harvest/prepare'),h.node('gp-farm-hint').textContent);assertMutation(h.pending('/api/gameplay/farm/harvest/prepare'),'/api/gameplay/farm/harvest/prepare',{targets:expected.targets,maxDurationMs:60000});h.respond('/api/gameplay/farm/harvest/prepare',expected);await task;assert.deepEqual(JSON.parse(h.node('wf-json').value),expected.graph,h.node('gp-farm-hint').textContent);for(const route of ['/api/workflows/start','/api/workflows/save','/api/workflows/authorize-run','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);});
for(const change of ['account','selection','duration','editor','parameters'])test('Farm sequence PAGE ignores late '+change+' response and preserves draft',async()=>{const u=await farmSequenceUi(),{h}=u;u.choices.forEach(c=>c.checked=true);u.duration.value='60';const reply=farmSequencePreview(u),task=u.prepare.click();await tick();if(change==='account')h.run("selectAccount('B');selectAccount('A');");if(change==='selection')u.choices[0].checked=false;if(change==='duration')u.duration.value='61';if(change==='editor')h.node('wf-json').value='{}';if(change==='parameters'){h.node('gp-farm-parameters').value=JSON.stringify({action:'plant',buildingId:'1农田',productId:'小麦'});h.node('gp-farm-parameters').oninput();}const draft=h.node('wf-json').value;h.respond('/api/gameplay/farm/harvest/prepare',reply);await task;assert.equal(h.node('wf-json').value,draft);assert.equal(writes(h,'/api/workflows/start').length,0);});
for(const corrupt of ['account','source','identity','order','guard','uid','resources','count','extra','repeat'])test('Farm sequence PAGE rejects corrupted '+corrupt+' prepared graph',async()=>{const u=await farmSequenceUi(),{h}=u;u.choices.forEach(c=>c.checked=true);u.duration.value='60';const reply=structuredClone(farmSequencePreview(u)),draft=h.node('wf-json').value,task=u.prepare.click();await tick();if(corrupt==='account')reply.accountId='B';if(corrupt==='source')reply.targets[0].plantTime++;if(corrupt==='identity')reply.targets[1].identity='fake';if(corrupt==='order')reply.graph.nodes.reverse();if(corrupt==='guard')delete reply.graph.nodes[1].parameters.pendingHarvests;if(corrupt==='uid')reply.graph.budget.uids.pop();if(corrupt==='resources')reply.graph.budget.resources=[{id:'RUBY',num:1}];if(corrupt==='count')reply.graph.runPolicy.maxActions++;if(corrupt==='extra')reply.graph.nodes.push({...reply.graph.nodes[1],id:'extra'});if(corrupt==='repeat')reply.graph.runPolicy.maxRounds=2;h.respond('/api/gameplay/farm/harvest/prepare',reply);await task;assert.equal(h.node('wf-json').value,draft);assert.match(h.node('gp-farm-hint').textContent,/未准备/);assert.equal(writes(h,'/api/workflows/start').length,0);});
test('Farm sequence PAGE unknown maturity never becomes a selectable mature target',async()=>{const u=await farmSequenceUi({unknown:true});assert.equal(u.choices.length,0);assert.equal(u.prepare.disabled,true);await u.prepare.click();assert.equal(writes(u.h).length,0);});

async function farmPlantSequenceUi({count=2,unknown=false}={}){const spec=structuredClone(cases.find(r=>r.module==='farm'));spec.facts.plots=Array.from({length:count},(_,i)=>({buildingId:(i+1)+'农田',productId:'',plantTime:0,ripeTime:0,reliable:!unknown,state:unknown?'UNKNOWN':'EMPTY'}));spec.facts.crops=[{productId:'小麦',costs:[{id:'小麦种子',num:1}],reliable:true},{productId:'玉米',costs:[{id:'玉米种子',num:2}],reliable:true}];spec.facts.candidates=spec.facts.plots.flatMap((p,i)=>spec.facts.crops.map((crop,j)=>({module:'farm',actionType:'PLANT',actionId:'farm-plant-'+i+'-'+j,target:{buildingId:p.buildingId,productId:crop.productId},identity:String(i*2+j+1).padStart(64,'0'),parameters:{buildingId:p.buildingId,action:'plant',productId:crop.productId},costs:crop.costs,budgetClaims:{resources:crop.costs,quotas:[],uids:[]},executable:!unknown,blockedReason:unknown?'UNKNOWN':null})));const h=await boot(),task=h.node('gp-farm-load').onclick(),response=data(spec);response.view.candidates=spec.facts.candidates;h.respond('/api/gameplay',response,{module:'farm'});await task;const nodes=descendants(h.node('gp-farm-facts'));return {h,spec,choices:nodes.filter(n=>n.dataset.farmPlantTarget),crops:nodes.filter(n=>n.dataset.farmPlantCrop),duration:nodes.find(n=>n.dataset.farmPlantDuration),prepare:nodes.find(n=>n.dataset.farmPlantPrepare)};}
function chooseFarmPlants(u){u.choices.forEach(c=>c.checked=true);u.crops.forEach((c,i)=>c.value=i%2?'玉米':'小麦');u.duration.value='60';}
function farmPlantSequencePreview(u){const targets=u.choices.filter(n=>n.checked).map(n=>{const buildingId=n.dataset.farmPlantTarget,productId=u.crops.find(c=>c.dataset.farmPlantCrop===buildingId).value,row=u.spec.facts.candidates.find(c=>c.target.buildingId===buildingId&&c.target.productId===productId);return {buildingId,productId,identity:row.identity};}),nodes=[{id:'start',type:'START'}],resources=new Map();for(let i=0;i<targets.length;i++){const t=targets[i],row=u.spec.facts.candidates.find(c=>c.target.buildingId===t.buildingId&&c.target.productId===t.productId);for(const cost of row.costs)resources.set(cost.id,(resources.get(cost.id)||0)+cost.num);nodes.push({id:'plant-'+i,type:'ACTION',module:'farm',parameters:{buildingId:t.buildingId,action:'plant',productId:t.productId,pendingPlants:targets.slice(i)},selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'farm'});}nodes.push({id:'stop',type:'STOP'});return {accountId:'A',targets,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'合成明确逐田播种',graph:{version:1,id:'farm-plant-synthetic',name:'逐田播种',nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id})),budget:{resources:[...resources].map(([id,num])=>({id,num})),quotas:[],uids:[]},runPolicy:{maxDurationMs:Number(u.duration.value)*1000,maxActions:targets.length,modules:['farm']}}};}
for(const count of [1,2,12])test('Farm plant sequence PAGE explicit '+count+' plots and crops prepare original editor without starting or authorizing',async()=>{const u=await farmPlantSequenceUi({count}),{h}=u;assert.ok(u.choices.every(c=>c.checked===false));assert.ok(u.crops.every(c=>c.value===''));assert.equal(u.duration.value,'');const before=h.requests.length;await u.prepare.click();assert.equal(h.requests.length,before);u.choices.forEach(c=>c.checked=true);u.duration.value='60';await u.prepare.click();assert.equal(h.requests.length,before,'checked empty plot still needs a crop');chooseFarmPlants(u);const reply=farmPlantSequencePreview(u),task=u.prepare.click();await tick();assertMutation(h.pending('/api/gameplay/farm/plant/prepare'),'/api/gameplay/farm/plant/prepare',{targets:reply.targets,maxDurationMs:60000});h.respond('/api/gameplay/farm/plant/prepare',reply);await task;assert.deepEqual(JSON.parse(h.node('wf-json').value),reply.graph,h.node('gp-farm-hint').textContent);for(const route of ['/api/workflows/start','/api/workflows/save','/api/workflows/authorize-run','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);});
for(const change of ['account','selection','crop','duration','json-draft','editor','parameters'])test('Farm plant sequence PAGE late '+change+' response preserves draft and does not start',async()=>{const u=await farmPlantSequenceUi(),{h}=u;chooseFarmPlants(u);const reply=farmPlantSequencePreview(u),task=u.prepare.click();await tick();if(change==='account')h.run("selectAccount('B');selectAccount('A');");if(change==='selection')u.choices[0].checked=false;if(change==='crop')u.crops[0].value='玉米';if(change==='duration')u.duration.value='61';if(change==='json-draft')h.node('wf-json').value='{}';if(change==='editor'){h.node('wf-name').value='changed';h.node('wf-name').oninput();}if(change==='parameters'){h.node('gp-farm-parameters').value='{}';h.node('gp-farm-parameters').oninput();}const draft=h.node('wf-json').value;h.respond('/api/gameplay/farm/plant/prepare',reply);await task;assert.equal(h.node('wf-json').value,draft);assert.equal(writes(h,'/api/workflows/start').length,0);});
for(const corrupt of ['account','crop','identity','source','order','guard','budget','quota','uid','count','extra','repeat'])test('Farm plant sequence PAGE rejects corrupted '+corrupt+' graph',async()=>{const u=await farmPlantSequenceUi(),{h}=u;chooseFarmPlants(u);const reply=structuredClone(farmPlantSequencePreview(u)),draft=h.node('wf-json').value,task=u.prepare.click();await tick();if(corrupt==='account')reply.accountId='B';if(corrupt==='crop')reply.targets[0].productId='玉米';if(corrupt==='identity')reply.targets[0].identity='fake';if(corrupt==='source')reply.graph.nodes[3].parameters.buildingId='1农田';if(corrupt==='order')reply.graph.nodes.reverse();if(corrupt==='guard')delete reply.graph.nodes[1].parameters.pendingPlants;if(corrupt==='budget')reply.graph.budget.resources[0].num++;if(corrupt==='quota')reply.graph.budget.quotas=[{id:'free',num:1}];if(corrupt==='uid')reply.graph.budget.uids=[{type:'farm',id:'other'}];if(corrupt==='count')reply.graph.runPolicy.maxActions++;if(corrupt==='extra')reply.graph.nodes.push({...reply.graph.nodes[1],id:'again'});if(corrupt==='repeat')reply.graph.runPolicy.maxRounds=2;h.respond('/api/gameplay/farm/plant/prepare',reply);await task;assert.equal(h.node('wf-json').value,draft);assert.match(h.node('gp-farm-hint').textContent,/未准备/);assert.equal(writes(h,'/api/workflows/start').length,0);});
test('Farm plant sequence PAGE missing empty evidence provides no plant or crop choice',async()=>{const u=await farmPlantSequenceUi({unknown:true});assert.equal(u.choices.length,0);assert.equal(u.crops.length,0);assert.equal(u.prepare.disabled,true);await u.prepare.click();assert.equal(writes(u.h).length,0);});

async function farmReplantUi(options={}){const u=await farmSequenceUi({...options,replant:true}),controls=descendants(u.h.node('gp-farm-facts'));u.crops=controls.filter(n=>n.dataset.farmReplantCrop);u.prepare=controls.find(n=>n.dataset.farmReplantPrepare);return u;}
function chooseFarmReplant(u){u.choices.forEach(c=>c.checked=true);u.crops.forEach((c,i)=>c.value=i%2?'玉米':'小麦');u.duration.value='60';}
function farmReplantPreview(u){const data=farmSequencePreview(u),replant=data.targets.map((source,i)=>{const next=u.crops.find(c=>c.dataset.farmReplantCrop===source.buildingId).value,cost=u.spec.facts.crops.find(c=>c.productId===next).costs[0];return {...source,nextProductId:next,seedId:cost.id,seedNum:cost.num};}),nodes=[{id:'start',type:'START'}],resources=new Map();for(let i=0;i<replant.length;i++){const r=replant[i];resources.set(r.seedId,(resources.get(r.seedId)||0)+r.seedNum);nodes.push({id:'harvest-'+i,type:'ACTION',module:'farm',parameters:{buildingId:r.buildingId,action:'harvest',pendingHarvests:data.targets.slice(i),replant:replant.slice(i)},selection:{unique:true}},{id:'verify-harvest-'+i,type:'VERIFY',module:'farm'},{id:'plant-'+i,type:'ACTION',module:'farm',parameters:{buildingId:r.buildingId,action:'plant',productId:r.nextProductId,replant:replant.slice(i)},selection:{unique:true}},{id:'verify-plant-'+i,type:'VERIFY',module:'farm'});}nodes.push({id:'stop',type:'STOP'});data.replant=replant;data.graph.nodes=nodes;data.graph.edges=nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id}));data.graph.runPolicy.maxActions=replant.length*2;data.graph.budget.resources=[...resources].map(([id,num])=>({id,num}));return data;}
for(const count of [1,2,12])test('Farm replant PAGE '+count+' explicit plots and next crops prepare original editor only',async()=>{const u=await farmReplantUi({count}),{h}=u;assert.ok(u.choices.every(c=>c.checked===false));assert.ok(u.crops.every(c=>c.value===''));assert.equal(u.duration.value,'');const before=h.requests.length;await u.prepare.click();assert.equal(h.requests.length,before);u.choices.forEach(c=>c.checked=true);u.duration.value='60';await u.prepare.click();assert.equal(h.requests.length,before,'next crop is mandatory');chooseFarmReplant(u);const reply=farmReplantPreview(u),payload={targets:reply.targets,maxDurationMs:60000,replant:reply.replant.map(r=>({buildingId:r.buildingId,productId:r.nextProductId}))},task=u.prepare.click();await tick();assertMutation(h.pending('/api/gameplay/farm/harvest/prepare'),'/api/gameplay/farm/harvest/prepare',payload);h.respond('/api/gameplay/farm/harvest/prepare',reply);await task;assert.deepEqual(JSON.parse(h.node('wf-json').value),reply.graph,h.node('gp-farm-hint').textContent);for(const route of ['/api/workflows/start','/api/workflows/save','/api/workflows/authorize-run','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);});
for(const change of ['account','selection','crop','duration','draft','editor','parameters'])test('Farm replant PAGE late '+change+' response cannot replace the draft',async()=>{const u=await farmReplantUi(),{h}=u;chooseFarmReplant(u);const reply=farmReplantPreview(u),task=u.prepare.click();await tick();if(change==='account')h.run("selectAccount('B');selectAccount('A');");if(change==='selection')u.choices[0].checked=false;if(change==='crop')u.crops[0].value='玉米';if(change==='duration')u.duration.value='61';if(change==='draft')h.node('wf-json').value='{}';if(change==='editor'){h.node('wf-name').value='changed';h.node('wf-name').oninput();}if(change==='parameters'){h.node('gp-farm-parameters').value='{}';h.node('gp-farm-parameters').oninput();}const draft=h.node('wf-json').value;h.respond('/api/gameplay/farm/harvest/prepare',reply);await task;assert.equal(h.node('wf-json').value,draft);assert.equal(writes(h,'/api/workflows/start').length,0);});
for(const corrupt of ['account','source','crop','cost','guard','plant','order','resources','uid','count','repeat'])test('Farm replant PAGE rejects '+corrupt+' prepared contract',async()=>{const u=await farmReplantUi(),{h}=u;chooseFarmReplant(u);const reply=farmReplantPreview(u),draft=h.node('wf-json').value,task=u.prepare.click();await tick();if(corrupt==='account')reply.accountId='B';if(corrupt==='source')reply.replant[0].plantTime++;if(corrupt==='crop')reply.replant[0].nextProductId='玉米';if(corrupt==='cost')reply.replant[0].seedNum++;if(corrupt==='guard')delete reply.graph.nodes[3].parameters.replant;if(corrupt==='plant')reply.graph.nodes[3].parameters.productId='玉米';if(corrupt==='order')reply.graph.nodes.reverse();if(corrupt==='resources')reply.graph.budget.resources[0].num++;if(corrupt==='uid')reply.graph.budget.uids.pop();if(corrupt==='count')reply.graph.runPolicy.maxActions--;if(corrupt==='repeat')reply.graph.runPolicy.maxRounds=2;h.respond('/api/gameplay/farm/harvest/prepare',reply);await task;assert.equal(h.node('wf-json').value,draft);assert.match(h.node('gp-farm-hint').textContent,/未准备/);assert.equal(writes(h,'/api/workflows/start').length,0);});


async function materialProductionUi(){const spec=structuredClone(cases.find(row=>row.module==='material-packs')),h=await loaded(spec),controls=descendants(h.node('gp-material-packs-facts'));return {h,spec,select:controls.find(n=>n.dataset.materialPackTarget),num:controls.find(n=>n.dataset.materialPackQuantity),prepare:controls.find(n=>n.dataset.materialProductionPrepare),fields:Object.fromEntries(controls.filter(n=>n.dataset.materialProductionField).map(n=>[n.dataset.materialProductionField,n]))};}
function fillMaterialProduction(u){u.select.value=JSON.stringify({packId:'原料自选包',itemId:'木材'});u.num.value='2';u.fields.buildingId.value='1材料厂';u.fields.productId.value='布匹';u.fields.maxDurationMs.value='60';}
function materialProductionPreview(u){const source={packId:'原料自选包',itemId:'木材',num:Number(u.num.value),buildingId:u.fields.buildingId.value,productId:u.fields.productId.value,maxDurationMs:Number(u.fields.maxDurationMs.value)*1000},costs=[{id:'木材',num:2}],exchange={actionId:'material-packs:'+'a'.repeat(64),gain:source.num,costs:[{id:source.packId,num:source.num}]},parameters={buildingId:source.buildingId,productId:source.productId,materialSource:{exchangeIdentity:'a'.repeat(64),productionIdentity:'b'.repeat(64)}},nodes=[{id:'start',type:'START'},{id:'exchange',type:'ACTION',module:'material-packs',parameters:{packId:source.packId,itemId:source.itemId,num:source.num},selection:exchange.actionId},{id:'verify-exchange',type:'VERIFY',module:'material-packs'},{id:'produce',type:'ACTION',module:'production',parameters,selection:{unique:true}},{id:'verify-produce',type:'VERIFY',module:'production'},{id:'stop',type:'STOP'}];return {accountId:'A',source,costs,exchange,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'合成明确材料生产，UNKNOWN停止',graph:{version:1,id:'material-production-synthetic',name:'明确材料确认后生产',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget:{resources:structuredClone([...exchange.costs,...costs]),quotas:[],uids:[]},runPolicy:{maxDurationMs:source.maxDurationMs,maxActions:2,modules:['material-packs','production']}}};}
test('material production PAGE requires explicit choices and loads only the original finite editor',async()=>{
 const u=await materialProductionUi(),{h}=u;assert.equal(u.num.value,'');for(const field of Object.values(u.fields))assert.equal(field.value,'');const count=h.requests.length;await u.prepare.click();assert.equal(h.requests.length,count);fillMaterialProduction(u);const reply=materialProductionPreview(u),task=u.prepare.click();await tick();assertMutation(h.pending('/api/gameplay/production/material/prepare'),'/api/gameplay/production/material/prepare',reply.source);h.respond('/api/gameplay/production/material/prepare',reply);await task;assert.deepEqual(JSON.parse(h.node('wf-json').value),reply.graph,h.node('gp-material-packs-hint').textContent);for(const route of ['/api/workflows/start','/api/workflows/save','/api/workflows/authorize-run','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
});
for(const change of ['account','material','num','factory','product','duration','parameters','editor'])test('material production PAGE drops late '+change+' response without overwriting a draft',async()=>{
 const u=await materialProductionUi(),{h}=u;fillMaterialProduction(u);const reply=materialProductionPreview(u),task=u.prepare.click();await tick();if(change==='account')h.run("selectAccount('B');selectAccount('A')");if(change==='material')u.select.value='{}';if(change==='num')u.num.value='3';if(change==='factory')u.fields.buildingId.value='2材料厂';if(change==='product')u.fields.productId.value='燃料';if(change==='duration')u.fields.maxDurationMs.value='61';if(change==='parameters'){h.node('gp-material-packs-parameters').value='{}';h.node('gp-material-packs-parameters').oninput();}if(change==='editor'){h.node('wf-name').value='changed';h.node('wf-name').oninput();}const before=h.node('wf-json').value;h.respond('/api/gameplay/production/material/prepare',reply);await task;assert.equal(h.node('wf-json').value,before);assert.equal(writes(h,'/api/workflows/start').length,0);
});
for(const corrupt of ['account','source','factory','product','gain','pack-cost','recipe-cost','premium','source-hash','budget','edge','order','extra-action','rounds','authorization'])test('material production PAGE rejects '+corrupt+' preview',async()=>{
 const u=await materialProductionUi(),{h}=u;fillMaterialProduction(u);const reply=materialProductionPreview(u),before=h.node('wf-json').value,task=u.prepare.click();await tick();if(corrupt==='account')reply.accountId='B';if(corrupt==='source')reply.source.num++;if(corrupt==='factory')reply.graph.nodes[3].parameters.buildingId='2材料厂';if(corrupt==='product')reply.graph.nodes[3].parameters.productId='燃料';if(corrupt==='gain')reply.exchange.gain++;if(corrupt==='pack-cost')reply.exchange.costs[0].num++;if(corrupt==='recipe-cost')reply.costs[0].num=0;if(corrupt==='premium')reply.costs[0].id='RUBY';if(corrupt==='source-hash')reply.graph.nodes[3].parameters.materialSource.exchangeIdentity='c'.repeat(64);if(corrupt==='budget')reply.graph.budget.resources[1].num++;if(corrupt==='edge')reply.graph.edges[1].to='produce';if(corrupt==='order')reply.graph.nodes.reverse();if(corrupt==='extra-action')reply.graph.nodes.push({...reply.graph.nodes[3],id:'repeat'});if(corrupt==='rounds')reply.graph.runPolicy.maxRounds=2;if(corrupt==='authorization')reply.requiresAuthorization=false;h.respond('/api/gameplay/production/material/prepare',reply);await task;assert.equal(h.node('wf-json').value,before);assert.match(h.node('gp-material-packs-hint').textContent,/未准备/);assert.equal(writes(h,'/api/workflows/start').length,0);
});

async function multipleMaterialUi(){
 const spec=structuredClone(cases.find(row=>row.module==='material-packs'));spec.facts.packs[0].targets.push({itemId:'鱼',perPack:1,requiredSeason:1,have:0});const h=await loaded(spec),initial=descendants(h.node('gp-material-packs-facts')),u={h,spec,select:initial.find(n=>n.dataset.materialPackTarget),num:initial.find(n=>n.dataset.materialPackQuantity),prepare:initial.find(n=>n.dataset.materialProductionPrepare),fields:Object.fromEntries(initial.filter(n=>n.dataset.materialProductionField).map(n=>[n.dataset.materialProductionField,n]))};fillMaterialProduction(u);const controls=descendants(u.h.node('gp-material-packs-facts')),add=controls.find(n=>n.dataset.materialProductionAdd),clear=controls.find(n=>n.dataset.materialProductionClear),list=controls.find(n=>n.dataset.materialProductionList);
 await add.click();u.select.value=JSON.stringify({packId:'原料自选包',itemId:'鱼'});u.num.value='1';await add.click();return {...u,add,clear,list};
}
function multipleMaterialPreview(u){
 const reply=materialProductionPreview(u),exchanges=[{packId:'原料自选包',itemId:'木材',num:2},{packId:'原料自选包',itemId:'鱼',num:1}];reply.source={exchanges,buildingId:u.fields.buildingId.value,productId:u.fields.productId.value,maxDurationMs:Number(u.fields.maxDurationMs.value)*1000};reply.costs=[{id:'木材',num:2},{id:'鱼',num:1}];reply.exchanges=exchanges.map((p,i)=>({actionId:'material-packs:'+(i?'c':'a').repeat(64),gain:p.num,costs:[{id:p.packId,num:p.num}]}));delete reply.exchange;
 const nodes=[{id:'start',type:'START'}];exchanges.forEach((p,i)=>nodes.push({id:'exchange-'+i,type:'ACTION',module:'material-packs',parameters:structuredClone(p),selection:reply.exchanges[i].actionId},{id:'verify-exchange-'+i,type:'VERIFY',module:'material-packs'}));
 nodes.push({id:'produce',type:'ACTION',module:'production',parameters:{buildingId:reply.source.buildingId,productId:reply.source.productId,materialSource:{exchangeIdentity:'c'.repeat(64),productionIdentity:'b'.repeat(64),exchangeIdentities:['a'.repeat(64),'c'.repeat(64)]}},selection:{unique:true}},{id:'verify-produce',type:'VERIFY',module:'production'},{id:'stop',type:'STOP'});
 Object.assign(reply.graph,{nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget:{resources:[{id:'原料自选包',num:3},...structuredClone(reply.costs)],quotas:[],uids:[]},runPolicy:{maxDurationMs:reply.source.maxDurationMs,maxActions:3,modules:['material-packs','production']}});return reply;
}
test('multiple material production PAGE preserves ordered choices and only fills original Workflow editor',async()=>{
 const u=await multipleMaterialUi(),{h}=u,reply=multipleMaterialPreview(u),task=u.prepare.click();await tick();assertMutation(h.pending('/api/gameplay/production/material/prepare'),'/api/gameplay/production/material/prepare',reply.source);h.respond('/api/gameplay/production/material/prepare',reply);await task;assert.deepEqual(JSON.parse(h.node('wf-json').value),reply.graph,h.node('gp-material-packs-hint').textContent);for(const route of ['/api/workflows/start','/api/workflows/save','/api/workflows/authorize-run','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
});
test('multiple material production PAGE requires at least two explicit rows and can clear the ordered draft',async()=>{
 const u=await materialProductionUi();fillMaterialProduction(u);const controls=descendants(u.h.node('gp-material-packs-facts')),add=controls.find(n=>n.dataset.materialProductionAdd),clear=controls.find(n=>n.dataset.materialProductionClear);await add.click();const count=u.h.requests.length;await u.prepare.click();assert.equal(u.h.requests.length,count);await clear.click();const task=u.prepare.click();await tick();const reply=materialProductionPreview(u);assertMutation(u.h.pending('/api/gameplay/production/material/prepare'),'/api/gameplay/production/material/prepare',reply.source);u.h.respond('/api/gameplay/production/material/prepare',reply);await task;assert.deepEqual(JSON.parse(u.h.node('wf-json').value),reply.graph);
});
for(const change of ['account','factory','product','duration','parameters','editor'])test('multiple material production PAGE ignores late '+change+' response',async()=>{
 const u=await multipleMaterialUi(),{h}=u,reply=multipleMaterialPreview(u),task=u.prepare.click();await tick();if(change==='account')h.run("selectAccount('B');selectAccount('A')");if(change==='factory')u.fields.buildingId.value='2材料厂';if(change==='product')u.fields.productId.value='different';if(change==='duration')u.fields.maxDurationMs.value='61';if(change==='parameters'){h.node('gp-material-packs-parameters').value='{}';h.node('gp-material-packs-parameters').oninput();}if(change==='editor'){h.node('wf-name').value='changed';h.node('wf-name').oninput();}const before=h.node('wf-json').value;h.respond('/api/gameplay/production/material/prepare',reply);await task;assert.equal(h.node('wf-json').value,before);
});
for(const fault of ['order','missing-row','source','gain','pack-cost','budget','hash-order','last-hash','duplicate-hash','product','extra-action','repeat','authorization'])test('multiple material production PAGE rejects '+fault+' substituted graph',async()=>{
 const u=await multipleMaterialUi(),{h}=u,reply=multipleMaterialPreview(u),before=h.node('wf-json').value,task=u.prepare.click();await tick();
 if(fault==='order')reply.graph.nodes.reverse();if(fault==='missing-row')reply.exchanges.pop();if(fault==='source')reply.source.exchanges[0].num++;if(fault==='gain')reply.exchanges[1].gain++;if(fault==='pack-cost')reply.exchanges[1].costs[0].num++;if(fault==='budget')reply.graph.budget.resources[0].num++;if(fault==='hash-order')reply.graph.nodes[5].parameters.materialSource.exchangeIdentities.reverse();if(fault==='last-hash')reply.graph.nodes[5].parameters.materialSource.exchangeIdentity='d'.repeat(64);if(fault==='duplicate-hash')reply.exchanges[1].actionId=reply.exchanges[0].actionId;if(fault==='product')reply.graph.nodes[5].parameters.productId='other';if(fault==='extra-action')reply.graph.nodes.push({...reply.graph.nodes[5],id:'again'});if(fault==='repeat')reply.graph.runPolicy.maxRounds=2;if(fault==='authorization')reply.requiresAuthorization=false;
 h.respond('/api/gameplay/production/material/prepare',reply);await task;assert.equal(h.node('wf-json').value,before);assert.match(h.node('gp-material-packs-hint').textContent,/未准备/);
});

async function productionCoverageUi({single=false}={}){
 const costs=[{id:'木材',num:2},...(single?[]:[{id:'鱼',num:1}])],spec={module:'production',actionId:'city:startProduce:1材料厂:布匹',actionType:'startProduce',parameters:{},target:{buildingId:'1材料厂',productId:'布匹'},costs,blockedReason:'MATERIAL_SHORTAGE',facts:{factories:[{buildingId:'1材料厂',recipes:[{productId:'布匹',costs,produceTime:30}]}],productionRecommendations:[]}},h=await loaded(spec),controls=descendants(h.node('gp-production-facts'));
 return {h,spec,select:controls.find(n=>n.dataset.productionCoverageTarget),read:controls.find(n=>n.dataset.productionCoverageRead),use:controls.find(n=>n.dataset.productionCoverageUse),duration:controls.find(n=>n.dataset.productionCoverageDuration),prepare:controls.find(n=>n.dataset.productionCoveragePrepare),results:controls.find(n=>n.dataset.productionCoverageResult)};
}
function productionCoverageReply(u){
 const costs=structuredClone(u.spec.costs),exchanges=costs.map(row=>({packId:'原料自选包',itemId:row.id,num:row.num})),gaps=costs.map(row=>({...row,have:0,gap:row.num,pack:'原料自选包',per:1,packs:row.num,packHave:5,projectedGain:row.num,eligible:true,blockedReason:null}));
 return {accountId:'A',target:{buildingId:'1材料厂',productId:'布匹'},costs,productionIdentity:'b'.repeat(64),executable:false,projectionOnly:true,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,season:1,packs:[{packId:'原料自选包',have:5,targets:costs.map(row=>({itemId:row.id,perPack:1,requiredSeason:1,have:0}))}],coverage:{status:'COVERED',reliable:true,ok:true,reason:null,gaps,needs:[{pack:'原料自选包',num:costs.reduce((sum,row)=>sum+row.num,0),have:5}],exchanges,projectionOnly:true,executable:false},limitation:'合成只读覆盖；新调查和授权才可执行'};
}
async function readProductionCoverage(u,reply=productionCoverageReply(u)){
 u.select.value=JSON.stringify({buildingId:'1材料厂',productId:'布匹'},null,2);const task=u.read.click();await tick();assertMutation(u.h.pending('/api/gameplay/production/material/coverage'),'/api/gameplay/production/material/coverage',reply.target);u.h.respond('/api/gameplay/production/material/coverage',reply);await task;return reply;
}
function productionCoverageGraph(reply,payload){
 const choices=payload.exchanges??[{packId:payload.packId,itemId:payload.itemId,num:payload.num}],multi=choices.length>1,exchanges=choices.map((p,i)=>({actionId:'material-packs:'+(i?'c':'a').repeat(64),gain:p.num,costs:[{id:p.packId,num:p.num}]})),source={exchangeIdentity:(multi?'c':'a').repeat(64),productionIdentity:'b'.repeat(64),...(multi?{exchangeIdentities:exchanges.map(row=>row.actionId.slice(15))}:{})},nodes=[{id:'start',type:'START'}];choices.forEach((p,i)=>{const suffix=multi?'-'+i:'';nodes.push({id:'exchange'+suffix,type:'ACTION',module:'material-packs',parameters:p,selection:exchanges[i].actionId},{id:'verify-exchange'+suffix,type:'VERIFY',module:'material-packs'});});nodes.push({id:'produce',type:'ACTION',module:'production',parameters:{...reply.target,materialSource:source},selection:{unique:true}},{id:'verify-produce',type:'VERIFY',module:'production'},{id:'stop',type:'STOP'});
 return {accountId:'A',source:structuredClone(payload),costs:structuredClone(reply.costs),...(multi?{exchanges}:{exchange:exchanges[0]}),resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'合成有限图',graph:{version:1,id:'coverage-finite',name:'覆盖后的明确生产',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget:{resources:[{id:'原料自选包',num:choices.reduce((n,p)=>n+p.num,0)},...structuredClone(reply.costs)],quotas:[],uids:[]},runPolicy:{maxDurationMs:payload.maxDurationMs,maxActions:choices.length+1,modules:['material-packs','production']}}};
}
for(const single of [true,false])test('material coverage PAGE '+(single?'single':'multiple')+' requires explicit suggestion selection and only prepares original finite editor',async()=>{
 const u=await productionCoverageUi({single}),{h}=u,count=h.requests.length;assert.equal(u.select.value,'');assert.equal(u.duration.value,'');assert.equal(u.use.checked,false);assert.equal(u.prepare.disabled,true);await u.read.click();assert.equal(h.requests.length,count);
 const reply=await readProductionCoverage(u);assert.match(u.results.textContent,/COVERED/);assert.equal(u.prepare.disabled,true);assert.equal(h.node('wf-json').value.includes('coverage-finite'),false);assert.equal(writes(h,'/api/gameplay/production/material/prepare').length,0);
 u.use.checked=true;u.use.onchange();await u.prepare.click();assert.equal(writes(h,'/api/gameplay/production/material/prepare').length,0);u.duration.value='60';const payload={...(single?reply.coverage.exchanges[0]:{exchanges:reply.coverage.exchanges}),...reply.target,maxDurationMs:60000},prepared=productionCoverageGraph(reply,payload),task=u.prepare.click();await tick();assertMutation(h.pending('/api/gameplay/production/material/prepare'),'/api/gameplay/production/material/prepare',payload);h.respond('/api/gameplay/production/material/prepare',prepared);await task;assert.deepEqual(JSON.parse(h.node('wf-json').value),prepared.graph,h.node('gp-production-hint').textContent);for(const route of ['/api/workflows/start','/api/workflows/save','/api/workflows/authorize-run','/api/operations/authorize','/api/operations/execute'])assert.equal(writes(h,route).length,0);
});
for(const status of ['IN_STOCK','INSUFFICIENT','BLOCKED','UNKNOWN'])test('material coverage PAGE '+status+' cannot enable a production preparation',async()=>{
 const u=await productionCoverageUi(),reply=productionCoverageReply(u);Object.assign(reply.coverage,{status,reliable:status!=='UNKNOWN',ok:false,exchanges:[],gaps:[],needs:[],reason:'synthetic-'+status});await readProductionCoverage(u,reply);assert.match(u.results.textContent,new RegExp(status));assert.equal(u.use.disabled,true);assert.equal(u.prepare.disabled,true);u.use.checked=true;u.use.onchange();await u.prepare.click();assert.equal(writes(u.h,'/api/gameplay/production/material/prepare').length,0);
});
for(const fault of ['account','target','cost','permission','executable','projection','identity','status','gain','gap','season','stock','quantity','order','aggregate','eligible','premium'])test('material coverage PAGE rejects '+fault+' altered suggestion',async()=>{
 const u=await productionCoverageUi(),reply=productionCoverageReply(u);if(fault==='account')reply.accountId='B';if(fault==='target')reply.target.productId='other';if(fault==='cost')reply.costs[0].num++;if(fault==='permission')reply.requiresAuthorization=false;if(fault==='executable')reply.coverage.executable=true;if(fault==='projection')reply.projectionOnly=false;if(fault==='identity')reply.productionIdentity='invalid';if(fault==='status')reply.coverage.status='ready';if(fault==='gain')reply.coverage.gaps[0].projectedGain++;if(fault==='gap')reply.coverage.gaps[0].gap++;if(fault==='season')reply.packs[0].targets[1].requiredSeason=2;if(fault==='stock')reply.packs[0].have=2;if(fault==='quantity')reply.coverage.exchanges[0].num++;if(fault==='order')reply.coverage.exchanges.reverse();if(fault==='aggregate')reply.coverage.needs[0].num--;if(fault==='eligible')reply.coverage.gaps[1].eligible=false;if(fault==='premium')reply.coverage.exchanges[0].packId='红徽章自选包';
 u.select.value=JSON.stringify({buildingId:'1材料厂',productId:'布匹'},null,2);const before=u.h.node('wf-json').value,task=u.read.click();await tick();u.h.respond('/api/gameplay/production/material/coverage',reply);await task;assert.equal(u.prepare.disabled,true);assert.equal(u.use.checked,false);assert.equal(u.h.node('wf-json').value,before);assert.match(u.h.node('gp-production-hint').textContent,/未读取/);assert.equal(writes(u.h,'/api/gameplay/production/material/prepare').length,0);
});
for(const change of ['account','target','parameters'])test('material coverage PAGE ignores late '+change+' read without changing editor',async()=>{
 const u=await productionCoverageUi(),reply=productionCoverageReply(u);u.select.value=JSON.stringify(reply.target,null,2);const task=u.read.click();await tick();if(change==='account')u.h.run("selectAccount('B');selectAccount('A')");if(change==='target'){u.select.value='';u.select.onchange();}if(change==='parameters'){u.h.node('gp-production-parameters').value='{}';u.h.node('gp-production-parameters').oninput();}const before=u.h.node('wf-json').value;u.h.respond('/api/gameplay/production/material/coverage',reply);await task;assert.equal(u.h.node('wf-json').value,before);assert.equal(writes(u.h,'/api/gameplay/production/material/prepare').length,0);
});
for(const change of ['account','target','duration','selection','parameters','editor','cost'])test('material coverage PAGE ignores stale or altered '+change+' prepare response',async()=>{
 const u=await productionCoverageUi(),reply=await readProductionCoverage(u);u.use.checked=true;u.use.onchange();u.duration.value='60';const payload={exchanges:reply.coverage.exchanges,...reply.target,maxDurationMs:60000},prepared=productionCoverageGraph(reply,payload),task=u.prepare.click();await tick();
 if(change==='account')u.h.run("selectAccount('B');selectAccount('A')");if(change==='target'){u.select.value='';u.select.onchange();}if(change==='duration')u.duration.value='61';if(change==='selection'){u.use.checked=false;u.use.onchange();}if(change==='parameters'){u.h.node('gp-production-parameters').value='{}';u.h.node('gp-production-parameters').oninput();}if(change==='editor'){u.h.node('wf-name').value='changed';u.h.node('wf-name').oninput();}if(change==='cost')prepared.costs[0].num++;const before=u.h.node('wf-json').value;u.h.respond('/api/gameplay/production/material/prepare',prepared);await task;assert.equal(u.h.node('wf-json').value,before);assert.equal(writes(u.h,'/api/workflows/start').length,0);
});

async function productionFactoryUi(change=()=>{}){
 const costs=[{id:'木材',num:2}],factory={buildingId:'1材料厂',type:'材料厂',level:1,status:'PRODUCING',reliable:true,autoProductId:'',slotCapacity:6,freeSlots:5,queue:[{idx:0,productId:'队列布匹',startTime:100,finishTime:130,remainingSeconds:12}],finishedProducts:[{productId:'已完成布匹',num:2}],recipes:[{productId:'布匹',unlockLevel:1,costs,produceTime:30,appointmentAdjustedSeconds:27,timingScope:'APPOINTMENT_ONLY_SPEED_BONUS_NOT_ESTABLISHED',packCoverage:{reliable:true,gaps:[{id:'木材',gap:2}]}}]},second={...structuredClone(factory),buildingId:'2材料厂',type:'第二厂类型',queue:[{idx:1,productId:'第二厂队列',finishTime:200}],finishedProducts:[{productId:'第二厂成品',num:1}],recipes:[{...structuredClone(factory.recipes[0]),productId:'第二厂配方'}]};
 const spec={module:'production',actionId:'city:startProduce:1材料厂:布匹',actionType:'startProduce',parameters:{},target:{buildingId:'1材料厂',productId:'布匹'},costs,blockedReason:'MATERIAL_SHORTAGE',facts:{stockReliable:true,stock:[],factories:[factory,second],productionRecommendations:[]}},h=await boot(),reply=data(spec);reply.view.candidates.push({...candidate(spec),actionId:'city:startProduce:2材料厂:第二厂配方',target:{buildingId:'2材料厂',productId:'第二厂配方'}});change(reply.view);
 const task=h.node('gp-production-load').onclick();h.respond('/api/gameplay',reply,{module:'production'});await task;const controls=descendants(h.node('gp-production-facts'));
 return {h,spec,select:controls.find(n=>n.dataset.productionFactory),detail:controls.find(n=>n.dataset.productionFactoryDetail),coverage:controls.find(n=>n.dataset.productionCoverageTarget),read:controls.find(n=>n.dataset.productionCoverageRead),results:controls.find(n=>n.dataset.productionCoverageResult),use:controls.find(n=>n.dataset.productionCoverageUse)};
}
function selectProductionFactory(u,key='1材料厂'){u.select.value=key;u.select.onchange();}
test('production factory PAGE preserves overview and isolates selected queue recipes stock and controls without requests',async()=>{
 const u=await productionFactoryUi(),{h}=u,count=h.requests.length;assert.equal(u.select.value,'');assert.match(u.detail.textContent,/明确选择工厂/);assert.equal(domainButtons(h,u.spec).length,3);
 selectProductionFactory(u);assert.match(u.detail.textContent,/队列布匹/);assert.match(u.detail.textContent,/已完成布匹/);assert.match(u.detail.textContent,/木材 ×0/);assert.match(u.detail.textContent,/木材 ×2/);assert.doesNotMatch(u.detail.textContent,/第二厂/);assert.equal(descendants(u.detail).filter(n=>n.dataset.productionFactoryAction).length,2);
 selectProductionFactory(u,'2材料厂');assert.match(u.detail.textContent,/第二厂队列/);assert.match(u.detail.textContent,/第二厂成品/);assert.doesNotMatch(u.detail.textContent,/队列布匹|已完成布匹/);assert.equal(descendants(u.detail).filter(n=>n.dataset.productionFactoryAction).length,1);assert.equal(h.requests.length,count);assert.equal(writes(h).length,0);
});
test('production factory PAGE chooses original single candidate and reaches original Manual preview without authorization',async()=>{
 const u=await productionFactoryUi(),{h}=u;selectProductionFactory(u);const controls=descendants(u.detail).filter(n=>n.dataset.productionFactoryAction);assert.equal(controls[0].disabled,false);assert.equal(controls[1].disabled,true);await controls[0].click();const reading=h.node('gp-production-plan').onclick();assertMutation(h.pending('/api/operations/plan'),'/api/operations/plan',{module:'production',mode:'Manual',selections:[u.spec.actionId],parameters:{}});h.respond('/api/operations/plan',plan(u.spec));await reading;assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('production factory PAGE binds explicit recipe to existing coverage selector and factory changes clear prior suggestions',async()=>{
 const u=await productionFactoryUi(),{h}=u;selectProductionFactory(u);const button=descendants(u.detail).find(n=>n.dataset.productionFactoryRecipe);await button.click();assert.deepEqual(JSON.parse(u.coverage.value),{buildingId:'1材料厂',productId:'布匹'});assert.equal(writes(h).length,0);
 const reading=u.read.click();await tick();const reply=productionCoverageReply({...u,spec:{...u.spec,costs:[{id:'木材',num:2}]}});h.respond('/api/gameplay/production/material/coverage',reply);await reading;assert.match(u.results.textContent,/COVERED/);selectProductionFactory(u,'2材料厂');assert.equal(u.coverage.value,'');assert.equal(u.use.checked,false);assert.equal(u.results.textContent,'');assert.equal(writes(h,'/api/gameplay/production/material/prepare').length,0);
});
test('production factory PAGE switching detail discards an old coverage response without changing Workflow draft',async()=>{
 const u=await productionFactoryUi(),{h}=u;selectProductionFactory(u);await descendants(u.detail).find(n=>n.dataset.productionFactoryRecipe).click();const reading=u.read.click();await tick();selectProductionFactory(u,'2材料厂');const draft=h.node('wf-json').value;h.respond('/api/gameplay/production/material/coverage',productionCoverageReply(u));await reading;assert.equal(u.results.textContent,'');assert.equal(u.use.checked,false);assert.equal(h.node('wf-json').value,draft);assert.equal(writes(h,'/api/gameplay/production/material/prepare').length,0);
});
for(const state of ['missing','false','null','duplicate','bad-count'])test('production factory PAGE '+state+' inventory remains unknown instead of zero',async()=>{
 const u=await productionFactoryUi(view=>{if(state==='missing')delete view.stockReliable;if(state==='false')view.stockReliable=false;if(state==='null')view.stock=null;if(state==='duplicate')view.stock=[{id:'木材',num:1},{id:'木材',num:1}];if(state==='bad-count')view.stock=[{id:'木材',num:-1}];});selectProductionFactory(u);assert.match(u.detail.textContent,/木材 ×未知/);assert.doesNotMatch(u.detail.textContent,/木材 ×0/);assert.equal(writes(u.h).length,0);
});
test('production factory PAGE incomplete factory source does not imply idle queue or finished products',async()=>{
 const u=await productionFactoryUi(view=>{view.factories[0].reliable=false;view.factories[0].status='IDLE';view.factories[0].queue=[];view.factories[0].finishedProducts=[];view.factories[0].freeSlots=6;});selectProductionFactory(u);assert.match(u.detail.textContent,/UNKNOWN/);assert.match(u.detail.textContent,/队列来源未知/);assert.match(u.detail.textContent,/已完成产品来源未知/);assert.equal(writes(u.h).length,0);
});
test('production factory PAGE duplicate identity is unavailable and stale factory controls cannot select another target',async()=>{
 const u=await productionFactoryUi();selectProductionFactory(u);const old=descendants(u.detail).find(n=>n.dataset.productionFactoryAction),recipe=descendants(u.detail).find(n=>n.dataset.productionFactoryRecipe);selectProductionFactory(u,'2材料厂');const before=u.h.node('gp-production-parameters').value;await old.click();await recipe.click();assert.equal(u.h.node('gp-production-parameters').value,before);assert.equal(u.coverage.value,'');const duplicate=await productionFactoryUi(view=>view.factories.push(structuredClone(view.factories[0])));selectProductionFactory(duplicate);assert.match(duplicate.detail.textContent,/身份不唯一/);assert.equal(descendants(duplicate.detail).filter(n=>n.dataset.productionFactoryAction).length,0);
});
test('production factory PAGE retired account controls cannot change current selection or Workflow editor',async()=>{
 const u=await productionFactoryUi();selectProductionFactory(u);const button=descendants(u.detail).find(n=>n.dataset.productionFactoryAction);u.h.run("selectAccount('B');selectAccount('A')");const draft=u.h.node('wf-json').value,count=u.h.requests.length;u.select.value='2材料厂';u.select.onchange();await button.click();assert.equal(u.h.requests.length,count);assert.equal(u.h.node('wf-json').value,draft);assert.equal(writes(u.h).length,0);
});
test('production factory PAGE renders observed identifiers as text and keeps controls bounded after repeated browsing',async()=>{
 const key='<img src=x onerror=alert(1)>',u=await productionFactoryUi(view=>{view.factories[0].buildingId=key;});selectProductionFactory(u,key);assert.ok(u.detail.textContent.includes(key));assert.equal(descendants(u.detail).some(n=>String(n.tagName).toLowerCase()==='img'),false);for(let i=0;i<10;i++){selectProductionFactory(u,'2材料厂');selectProductionFactory(u,key);}assert.equal(descendants(u.detail).filter(n=>n.dataset.productionFactoryRecipe).length,1);assert.equal(writes(u.h).length,0);
});

for(const state of ['MET','NOT_MET','UNKNOWN'])test('Pet ordinary breeding full PAGE shows '+state+' as read-only without new action controls',async()=>{
 const spec=structuredClone(cases.find(s=>s.module==='pet'));spec.facts.breeding={readOnly:true,executable:false,status:'OBSERVED',candidates:[{petId:'<img src=x onerror=alert(1)>',costs:[{id:'宠物1蓝基因',num:80},{id:'GOLD',num:4000}],breedTime:14400,seasonAvailable:true,stockAvailable:state!=='NOT_MET',queueAvailable:state==='UNKNOWN'?null:true,conditions:state,executable:false}]};
 const h=await loaded(spec),text=h.node('gp-pet-facts').textContent;assert.match(text,/普通培育条件（只读）/);assert.match(text,/宠物1蓝基因 × 80/);assert.match(text,/GOLD × 4000/);assert.match(text,/14400/);assert.equal(text.includes('<img src=x onerror=alert(1)>'),true);assert.match(text,state==='MET'?/条件满足；暂不可培育/:state==='NOT_MET'?/条件未满足/:/未知/);assert.match(text,/条件满足不代表可执行/);
 assert.equal(domainButtons(h,spec).length,2);assert.deepEqual(descendants(h.node('gp-pet-facts')).filter(n=>n.dataset.petMode).map(n=>n.dataset.petMode),['feed','level','claim']);assert.equal(writes(h).length,0);
});
test('Pet ordinary breeding full PAGE keeps missing sources local to observation',async()=>{
 const spec=structuredClone(cases.find(s=>s.module==='pet'));spec.facts.breeding={readOnly:true,executable:false,status:'UNKNOWN',reason:'PET_BREED_CONFIG_UNKNOWN_OR_CHANGED',candidates:[]};const h=await loaded(spec);assert.match(h.node('gp-pet-facts').textContent,/来源未知：PET_BREED_CONFIG_UNKNOWN_OR_CHANGED/);assert.equal(domainButtons(h,spec).length,2);assert.equal(writes(h).length,0);
});

for(const payment of ['free','ticket'])test('recruit payment selector only changes draft and invalidates authorization '+payment,async()=>{
 const spec=cases.find(s=>s.module==='free-recruit'),h=await loaded(spec);const controls=descendants(h.node('gp-free-recruit-facts')).filter(n=>n.dataset?.recruitPayment);assert.equal(controls.length,4);const before=h.requests.length,prepare=controls.find(n=>n.dataset.recruitPayment===payment);assert.equal(prepare.disabled,false);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-free-recruit-parameters').value),payment==='ticket'?{payment:'ticket'}:{});assert.equal(h.node('gp-free-recruit-authorize').disabled,true);assert.equal(h.requests.length,before);assert.match(h.node('gp-free-recruit-hint').textContent,/重新探测资格和库存/);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('recruit payment selector cannot act after account replacement',async()=>{
 const spec=cases.find(s=>s.module==='free-recruit'),h=await loaded(spec),control=descendants(h.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitPayment==='ticket');h.run("selectAccount('B');selectAccount('A')");const before=h.node('gp-free-recruit-parameters').value;control.click();assert.equal(h.node('gp-free-recruit-parameters').value,before);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('recruit payment switch discards an existing plan and cannot reuse its authorization',async()=>{
 const spec=cases.find(s=>s.module==='free-recruit'),h=await loaded(spec);await preview(h,spec);assert.equal(h.node('gp-free-recruit-authorize').disabled,false);const before=h.requests.length,control=descendants(h.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitPayment==='ticket');control.click();assert.equal(h.node('gp-free-recruit-authorize').disabled,true);await h.node('gp-free-recruit-authorize').onclick();assert.equal(h.requests.length,before);assert.deepEqual(JSON.parse(h.node('gp-free-recruit-parameters').value),{payment:'ticket'});assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('recruit payment cannot change while the account is busy',async()=>{
 const spec=cases.find(s=>s.module==='free-recruit'),h=await loaded(spec),control=descendants(h.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitPayment==='ticket'),before=h.node('gp-free-recruit-parameters').value;h.run("snapshot.busy='synthetic'");control.click();assert.equal(h.node('gp-free-recruit-parameters').value,before);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('assembled daily page renders open-rank server windows as observations with zero claim or automatic requests',async()=>{
 const h=await boot(),view=dailyChecklist({sessionFacts:{openRankActivity:{status:'OBSERVED',reliable:true,source:'SCAllActivity.openRankActivity',scope:'ACCEPTED_STREAM_WINDOWS_ONLY',accountId:'A',generation:1,connectionId:'synthetic-push',playerId:'1',worldId:'17',seq:1,observedAt:'2026-11-16T01:00:00.000Z',activityTime:[{type:4,startTime:100,endTime:400}]}}}),before=h.requests.length;
 h.run('renderDailies('+JSON.stringify({checklist:view,tasks:[]})+')');const text=h.node('dailies-table').textContent;assert.match(text,/开服排行.*最近窗口观察/);assert.match(text,/SCAllActivity.openRankActivity.*OBSERVED/);assert.ok(text.includes('战争 / 4'));assert.match(text,/100/);assert.match(text,/400/);assert.match(text,/窗口不证明当前开放/);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B')");assert.equal(h.node('dailies-table').textContent,'');assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('assembled overview renders the same read-only open-rank projection and clears it on account change',async()=>{
 const h=await boot(),context={accountId:'A',generation:1,connectionId:'synthetic-push',playerId:'1',worldId:'17'},checklist=dailyChecklist({sessionFacts:{openRankActivity:{...context,status:'OBSERVED',reliable:true,source:'SCAllActivity.openRankActivity',scope:'ACCEPTED_STREAM_WINDOWS_ONLY',seq:1,observedAt:'2026-11-16T01:00:00.000Z',activityTime:[{type:4,startTime:100,endTime:400}]}}}),data={account:{id:'A'},dataContext:context,activityAlliance:{accountId:'A',context,readOnly:true,executable:false,complete:false,coverage:'CURRENT_CACHE_ONLY',status:'OBSERVED',checklist,sources:[]}},before=h.requests.length;
 h.run('renderActivityAlliance('+JSON.stringify(data)+')');const text=h.node('overview-activity-alliance').textContent;assert.match(text,/开服排行窗口原值/);assert.ok(text.includes('战争 / 4'));assert.match(text,/窗口不证明当前开放/);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B')");assert.equal(h.node('overview-activity-alliance').textContent,'');assert.equal(writes(h,'/api/operations/execute').length,0);
});

const warPageSpec={module:'task-rewards',actionId:'task-rewards:open-rank-war:synthetic',actionType:'CLAIM',parameters:{kind:'open-rank-war',tierId:500},target:{kind:'open-rank-war',tierId:500,type:4,startTime:900,endTime:2000,season:1,configuredSeason:1},costs:[],facts:{daily:{endTime:2000,progress:1000,gotRewardId:[100]}},blockedReason:'OPEN_RANK_INCOMPLETE'};
test('open-rank war complete PAGE prepares only exact score and requires fresh survey and authorization',async()=>{
 const h=await loaded(warPageSpec),controls=descendants(h.node('gp-task-rewards-facts')),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare),before=h.requests.length;
 assert.equal(kind.children.filter(n=>n.value==='open-rank-war').length,1);kind.value='open-rank-war';
 for(const value of ['','0','-1','0.5','2147483648']){input.value=value;prepare.click();assert.equal(h.requests.length,before);assert.equal(h.node('gp-task-rewards-parameters').value,'{}');}
 input.value='500';prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),warPageSpec.parameters);assert.equal(h.node('gp-task-rewards-plan').disabled,true);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);
 const survey=h.node('gp-task-rewards-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'task-rewards',parameters:warPageSpec.parameters});h.respond('/api/gameplay/survey',data(warPageSpec));await survey;
 assert.match(h.node('gp-task-rewards-facts').textContent,/type 4.*score档位 500.*已领score 100.*进度 1000.*当前季\/配置季 1 \/ 1.*900 至 2000/);assert.match(h.node('gp-task-rewards-facts').textContent,/窗口观察不能代替领取资格或结算/);
 await preview(h,warPageSpec);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(h.confirmations.length,0);
 h.run("selectAccount('B');selectAccount('A');snapshot={connected:true,state:'READY'}");prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,'{}');assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('open-rank war unified complete PAGE keeps exact score distinct from chip and Loop rounds',async()=>{
 const h=await unifiedForm('loop');unifiedLoad(h,{entry:'loop',tasks:[],dailies:[],world:[],rounds:3,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});const before=h.requests.length;
 for(const value of ['','0','-1','1.5','1e3','2147483648',' 500','500 ']){const source=h.node('wf-unified-intent').value;unifiedAdd(h,'tasks','open-rank-war',value);assert.equal(h.node('wf-unified-intent').value,source);}
 unifiedAdd(h,'tasks','open-rank-war','500');unifiedAdd(h,'dailies','open-rank-war','500');const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'open-rank-war',tierId:500}]);assert.deepEqual(draft.dailies,[{kind:'open-rank-war',tierId:500,action:'claim'}]);assert.equal(draft.rounds,3);assert.equal(h.node('wf-unified-target').disabled,false);assert.equal(h.node('wf-unified-chip-round').disabled,true);assert.match(h.node('wf-unified-target-label').textContent,/score.*非行号/);
 const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.equal(compiled.blocked.length,0);assert.equal(compiled.graph.nodes.filter(n=>n.type==='ACTION').length,6);for(const node of compiled.graph.nodes.filter(n=>n.type==='ACTION'))assert.deepEqual(node.parameters,warPageSpec.parameters);assert.deepEqual(compiled.graph.budget,draft.budget);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('open-rank war observation complete PAGE renders score target as read-only historical text',async()=>{
 const {h,offer}=await finiteRunPage(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'COMPLETED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'COMPLETED',readOnly:true,resumable:false,nodes:[],waits:[],surveys:[{nodeId:'q',module:'task-rewards',taskObservation:{kind:'open-rank-war',tierId:'<img src=x onerror=alert(1)>'}}]});await reading;const box=h.node('wf-history-detail'),tags=n=>[n.tagName,...n.children.flatMap(tags)];assert.match(box.textContent,/只读任务调查目标；不证明任务完成、可领或到账/);assert.match(box.textContent,/open-rank-war/);assert.ok(box.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(tags(box).some(tag=>String(tag).toLowerCase()==='img'),false);assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);
 h.run("selectAccount('B')");assert.equal(h.node('wf-history-detail').textContent,'');assert.equal(writes(h).length,0);
});

for(const target of [{kind:'daily-activity',tierId:2},{kind:'daily-gift',packId:'赠礼'},{kind:'weekly-lottery-gift',packId:'1000'},{kind:'weekly-unique-lottery-gift',packId:'1000'},{kind:'weekly-chip-gift',packId:'1000'},{kind:'weekly-chip-task',round:2,taskId:1}])test('task target consolidation complete PAGE preserves historical '+target.kind+' without permission',async()=>{
 const {h,offer}=await finiteRunPage(),loading=h.node('wf-load').click();h.respond('/api/workflows',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{status:'IDLE',running:false},graphs:[],history:[{accountId:'A',runId:offer.runId,workflowId:offer.workflowId,status:'COMPLETED'}]});await loading;const reading=h.node('wf-history-read').click();await tick();h.respond('/api/workflows/history',{accountId:'A',workflowRunId:offer.runId,workflowDefinitionId:offer.workflowId,status:'COMPLETED',readOnly:true,resumable:false,nodes:[],waits:[],surveys:[{nodeId:'q',module:'task-rewards',taskObservation:target}]});await reading;const text=h.node('wf-history-detail').textContent;assert.match(text,/只读任务调查目标；不证明任务完成、可领或到账/);for(const [key,value]of Object.entries(target)){assert.ok(text.includes(JSON.stringify(key)));assert.ok(text.includes(JSON.stringify(value)));}assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h).length,0);h.run("selectAccount('B')");assert.equal(h.node('wf-history-detail').textContent,'');assert.equal(writes(h).length,0);
});

for(const entry of ['tasks','dailies','loop'])test('task target consolidation unified complete PAGE explicitly selects observation for existing '+entry,async()=>{
 const h=await unifiedForm(entry);unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});assert.equal(h.node('wf-unified-observe').checked,false);const before=h.requests.length;
 const targets=[['daily','1004',{kind:'daily',taskId:1004}],['daily-activity','2',{kind:'daily-activity',tierId:2}],['daily-gift','',{kind:'daily-gift',packId:'赠礼'}],['weekly-lottery-gift','',{kind:'weekly-lottery-gift',packId:'1000'}],['weekly-unique-lottery-gift','',{kind:'weekly-unique-lottery-gift',packId:'1000'}],['weekly-chip-gift','',{kind:'weekly-chip-gift',packId:'1000'}],['weekly-chip-task','1',{kind:'weekly-chip-task',round:2,taskId:1}],['open-rank-war','500',{kind:'open-rank-war',tierId:500}]];
 const phases=entry==='loop'?['tasks','dailies']:[entry];for(const phase of phases){for(const [kind,value,target]of targets){h.node('wf-unified-phase').value=phase;h.node('wf-unified-phase').onchange();h.node('wf-unified-kind').value=kind;h.node('wf-unified-kind').onchange();assert.equal(h.node('wf-unified-observe').disabled,false);h.node('wf-unified-observe').checked=true;h.node('wf-unified-chip-round').value='2';unifiedAdd(h,phase,kind,value);const row=unifiedDraft(h)[phase].at(-1);assert.deepEqual(row,{...(phase==='dailies'&&kind==='daily'?{taskId:1004}:target),action:'observe'});}}
 const compiled=compileUnifiedExecution(unifiedDraft(h),{modules:GAMEPLAY_MODULES});assert.equal(compiled.graph.nodes.some(n=>n.type==='ACTION'),false);assert.equal(compiled.graph.nodes.filter(n=>n.type==='SURVEY').length,targets.length*phases.length);assert.match(h.node('wf-unified-steps').textContent,/只读SURVEY.*不完成任务、不领取奖励/);assert.match(h.node('wf-unified-steps').textContent,/周芯片当前轮次 2 · 精确任务 ID 1/);assert.deepEqual(compiled.graph.budget,{resources:[],quotas:[],uids:[]});assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);
 h.node('wf-unified-kind').value='free-recruit-cooldown';h.node('wf-unified-kind').onchange();assert.equal(h.node('wf-unified-observe').disabled,true);assert.equal(h.node('wf-unified-observe').checked,false);h.run("selectAccount('B');selectAccount('A')");assert.equal(h.node('wf-unified-observe').checked,false);assert.equal(writes(h).length,0);
});


for(const count of [10,50])test('batch recruit complete PAGE explicitly prepares '+count+' tickets and discards old authorization',async()=>{
 const spec=cases.find(s=>s.module==='free-recruit'),h=await loaded(spec);await preview(h,spec);assert.equal(h.node('gp-free-recruit-authorize').disabled,false);const before=h.requests.length,prepare=descendants(h.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitPayment==='ticket-'+count);assert.ok(prepare);assert.equal(prepare.disabled,false);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-free-recruit-parameters').value),{payment:'ticket',count});assert.equal(h.node('gp-free-recruit-authorize').disabled,true);await h.node('gp-free-recruit-authorize').onclick();assert.equal(h.requests.length,before);assert.match(h.node('gp-free-recruit-hint').textContent,new RegExp('自有抽卡券'+count+'张'));assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B');selectAccount('A')");const source=h.node('gp-free-recruit-parameters').value;prepare.click();assert.equal(h.node('gp-free-recruit-parameters').value,source);assert.equal(writes(h,'/api/operations/execute').length,0);
});
for(const count of [10,50])for(const entry of ['dailies','loop'])test('batch recruit unified complete PAGE '+entry+' declares '+count+' with explicit shared budget only',async()=>{
 const h=await unifiedForm(entry),budget={resources:[{id:'抽卡券',num:count}],quotas:[],uids:[]};unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget});assert.equal(h.node('wf-unified-recruit-count').value,'free');h.node('wf-unified-phase').value='dailies';h.node('wf-unified-phase').onchange();h.node('wf-unified-kind').value='free-recruit';h.node('wf-unified-kind').onchange();assert.equal(h.node('wf-unified-recruit-count').disabled,false);const before=h.requests.length,original=h.node('wf-unified-intent').value;h.node('wf-unified-recruit-count').value='20';unifiedAdd(h,'dailies','free-recruit','');assert.equal(h.node('wf-unified-intent').value,original);h.node('wf-unified-recruit-count').value=String(count);unifiedAdd(h,'dailies','free-recruit','');const draft=unifiedDraft(h);assert.deepEqual(draft.dailies,[{taskId:1002,action:'perform',parameters:{payment:'ticket',count}}]);assert.deepEqual(draft.budget,budget);assert.match(h.node('wf-unified-steps').textContent,new RegExp('明确自有抽卡券 '+count+' 张'));const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.blocked,[]);assert.deepEqual(compiled.graph.nodes.find(n=>n.type==='ACTION').parameters,{payment:'ticket',count});assert.deepEqual(compiled.graph.budget,budget);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);h.run("selectAccount('B');selectAccount('A')");assert.equal(h.node('wf-unified-recruit-count').value,'free');assert.equal(writes(h,'/api/operations/execute').length,0);
});

for(const known of [false,true])test('antique recruitment complete PAGE displays conditions without adding action controls '+known,async()=>{
 const original=cases.find(s=>s.module==='free-recruit'),antiqueObservation={kind:'antique',status:known?'OBSERVED':'UNKNOWN',source:'RecruitInfoResponse.antique',recruit:known?{freeEndTimeSeconds:0,recruitTimes:7}:null,requiredLevel:known?10:null,ownedTickets:known?50:null,readiness:known?'READY_BY_CLOCK':'UNKNOWN',eligibility:null,executable:false,autoResume:false,modes:[1,2,3,4].map((way,i)=>({way,payment:i===0?'free':'ticket',count:[1,1,10,50][i],observedRequirementsMet:known?(i!==1):null,executable:false}))};
 const spec={...original,facts:{...original.facts,antiqueObservation}},h=await loaded(spec),box=h.node('gp-free-recruit-facts');
 assert.match(box.textContent,/古董招募条件（仅只读）/);assert.match(box.textContent,/RecruitInfoResponse.antique/);assert.match(box.textContent,/古董招募模式（条件观察）/);assert.match(box.textContent,/不代表任务完成、奖励到账或写入资格/);assert.match(box.textContent,known?/已观察到所需条件/:/未知/);
 assert.equal(descendants(box).filter(n=>n.dataset?.recruitPayment).length,4);assert.equal(domainButtons(h,spec).length,2);assert.equal(descendants(box).filter(n=>n.tagName==='button').length,9);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
 h.run("selectAccount('B')");assert.doesNotMatch(box.textContent,/RecruitInfoResponse.antique/);assert.equal(writes(h).length,0);
});

for(const count of [1,10,50])test('antique recruit complete PAGE preserves explicit identity, ticket amount and invalidates prior permit '+count,async()=>{
 const original=cases.find(s=>s.module==='free-recruit'),parameters={recruit:'antique',payment:'ticket',...(count>1?{count}:{})},spec={...original,parameters,costs:[{id:'藏品券',num:count}],target:{recruit:'antique',type:1,way:({1:2,10:3,50:4})[count],freeEndTimeSeconds:2000}},h=await loaded(spec);await preview(h,spec);const before=h.requests.length,buttons=descendants(h.node('gp-free-recruit-facts')),prepare=buttons.find(n=>n.dataset?.recruitPayment===(count>1?'ticket-'+count:'ticket'));
 assert.match(prepare.textContent,/藏品券/);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-free-recruit-parameters').value),parameters);assert.equal(h.node('gp-free-recruit-authorize').disabled,true);await h.node('gp-free-recruit-authorize').onclick();assert.equal(h.requests.length,before);assert.match(h.node('gp-free-recruit-hint').textContent,new RegExp('藏品券'+count+'张'));
 const hero=buttons.find(n=>n.dataset?.recruitKind==='hero');hero.click();assert.deepEqual(JSON.parse(h.node('gp-free-recruit-parameters').value),parameters,'dirty survey controls cannot restore a permit or change identity');assert.equal(h.requests.length,before);const swap=await loaded(spec),swapBefore=swap.requests.length;descendants(swap.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitKind==='hero').click();assert.deepEqual(JSON.parse(swap.node('gp-free-recruit-parameters').value),{...parameters,recruit:'hero'});assert.equal(swap.requests.length,swapBefore);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B');selectAccount('A')");const source=h.node('gp-free-recruit-parameters').value;prepare.click();assert.equal(h.node('gp-free-recruit-parameters').value,source);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('hero PAGE selection of antique only changes draft and does not start a survey or write',async()=>{
 const spec=cases.find(s=>s.module==='free-recruit'),h=await loaded(spec),before=h.requests.length,choose=descendants(h.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitKind==='antique');choose.click();assert.deepEqual(JSON.parse(h.node('gp-free-recruit-parameters').value),{recruit:'antique'});assert.equal(h.requests.length,before);assert.equal(h.node('gp-free-recruit-authorize').disabled,true);assert.equal(writes(h).length,0);
});

for(const known of [false,true])test('cumulative recruit complete PAGE separates conditions and settlement without claim controls '+known,async()=>{
 const original=cases.find(s=>s.module==='free-recruit'),taskObservations=['hero','antique'].map(kind=>({kind,status:known?'OBSERVED':'UNKNOWN',source:'RecruitInfoResponse.'+kind+'.task',season:known?2:null,configuredSeason:known?2:null,progress:known?650:null,claimedThroughId:known?1:null,tasks:known?[{id:1,requiredProgress:200,completion:'COMPLETE',rewardState:'CLAIMED',observedRequirementsMet:false,rewards:[{id:'<累计奖励>',num:1}]},{id:2,requiredProgress:400,completion:'COMPLETE',rewardState:'UNCLAIMED',observedRequirementsMet:true,rewards:[]},{id:3,requiredProgress:800,completion:'INCOMPLETE',rewardState:'UNCLAIMED',observedRequirementsMet:false,rewards:[]}]:[],eligibility:null,executable:false,settlement:'UNKNOWN'}));
 const spec={...original,facts:{...original.facts,taskObservations}},h=await loaded(spec),box=h.node('gp-free-recruit-facts');
 assert.match(box.textContent,/英雄累计任务（仅只读）/);assert.match(box.textContent,/古董累计任务（仅只读）/);assert.match(box.textContent,/空领奖请求无法绑定档位与赛季/);assert.match(box.textContent,/不代表日常1002完成/);
 if(known){assert.match(box.textContent,/服务端记录已领/);assert.match(box.textContent,/达标且未领/);assert.match(box.textContent,/未达标/);assert.match(box.textContent,/<累计奖励>/);}else assert.match(box.textContent,/UNKNOWN/);
 assert.equal(descendants(box).filter(n=>n.tagName==='button').length,9);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
 h.run("selectAccount('B')");assert.doesNotMatch(box.textContent,/RecruitInfoResponse.(hero|antique).task/);assert.equal(writes(h).length,0);
});


for(const amount of ['0','9007199254740993','9223372036854775807'])test('resource event PAGE preserves exact threshold through original graph and unified entries '+amount,async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);eventPolicyDraft(h,amount,'RESOURCE_AMOUNT_CHANGED');assert.equal(h.node('wf-policy-event-resource').disabled,false);assert.equal(h.node('wf-policy-event-task').disabled,true);h.node('wf-policy-event-resource').value='GOLD';h.node('wf-policy-event-resource').onchange();h.node('wf-policy-apply').click();const g=conditionGraph(h);
 assert.deepEqual(g.runPolicy.eventTrigger,{kind:'RESOURCE_AMOUNT_CHANGED',resource:'GOLD',amount});assert.equal(validateWorkflow(g,{modules:GAMEPLAY_MODULES}).valid,true);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.budget,before.budget);
 for(const entry of ['tasks','dailies','loop']){unifiedLoad(h,{entry,...(entry==='tasks'?{tasks:[{kind:'main',taskId:1}]}:{dailies:[{taskId:1006}]}),budget:{resources:[],quotas:[],uids:[]}});h.node('wf-unified-policy-copy').click();assert.deepEqual(unifiedDraft(h).runPolicy,g.runPolicy);}
 assert.equal(writes(h).length,0);
});
test('resource event PAGE rejects unknown resource and malformed thresholds, and retained callbacks cannot modify another account',async()=>{
 const h=await parameterPage('free-gold');graphBudgetEnable(h);h.node('wf-budget-apply').click();policyDraft(h);const before=conditionGraph(h);
 for(const [resource,amount]of [['GOLD',''],['GOLD','-1'],['GOLD','01'],['GOLD','1.0'],['GOLD','1e3'],['GOLD','9223372036854775808'],['UNKNOWN','1'],['3','1']]){eventPolicyDraft(h,amount,'RESOURCE_AMOUNT_CHANGED');h.node('wf-policy-event-resource').value=resource;h.node('wf-policy-event-resource').onchange();h.node('wf-policy-apply').click();assert.deepEqual(conditionGraph(h),before);}
 const stale=h.node('wf-policy-event-resource').onchange,apply=h.node('wf-policy-apply').onclick;h.run("selectAccount('B');selectAccount('A')");const source=h.node('wf-json').value;h.node('wf-policy-event-resource').value='GOLD';stale();apply();assert.equal(h.node('wf-json').value,source);assert.equal(writes(h).length,0);
});
test('resource event PAGE exact authorization scope keeps threshold and ignores late permission responses',async()=>{
 const eventTrigger={kind:'RESOURCE_AMOUNT_CHANGED',resource:'GOLD',amount:'9007199254740993'},f=await finiteRunPage({eventTrigger}),{h,offer,status}=f;
 assert.equal(h.node('wf-authorize-run').disabled,false);assert.match(h.node('wf-run-scope').textContent,/GOLD.*9007199254740993/);assert.match(h.node('wf-run-scope').textContent,/首次观察不触发.*不证明收入或可支配预算/);
 const approval=h.node('wf-authorize-run').click();assertMutation(h.pending('/api/workflows/authorize-run'),'/api/workflows/authorize-run',{offer,batchId:null,planHash:null,confirm:true});h.run("selectAccount('B');selectAccount('A')");h.respond('/api/workflows/authorize-run',{accountId:'A',status:{...status,runAuthorization:{scope:offer,approvedAt:'late'}},graphs:[],history:[]});await approval;assert.equal(h.node('wf-authorize-run').disabled,true);assert.equal(writes(h,'/api/operations/execute').length,0);
 for(const extra of [{eligible:true},{resource:3},{resource:'UNKNOWN'},{amount:1},{amount:'9223372036854775808'}]){const bad=await finiteRunPage({eventTrigger:{...eventTrigger,...extra}});assert.equal(bad.h.node('wf-authorize-run').disabled,true);assert.equal(writes(bad.h).length,0);}
});

for(const entry of ['tasks','dailies','loop'])test('battle pass unified complete PAGE forces observe through original Function '+entry,async()=>{
 const h=await unifiedForm(entry);unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});const before=h.requests.length,phase=entry==='tasks'?'tasks':'dailies';h.node('wf-unified-phase').value=phase;h.node('wf-unified-phase').onchange();h.node('wf-unified-kind').value='weekly-battle-pass-task';h.node('wf-unified-kind').onchange();assert.equal(h.node('wf-unified-observe').disabled,true);assert.equal(h.node('wf-unified-observe').checked,true);h.node('wf-unified-observe').checked=false;unifiedAdd(h,phase,'weekly-battle-pass-task','1001');const draft=unifiedDraft(h);assert.deepEqual(draft[phase],[{kind:'weekly-battle-pass-task',taskId:1001,action:'observe'}]);const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.graph.nodes.map(n=>n.type),['START','SURVEY','STOP']);assert.deepEqual(compiled.graph.nodes[1].parameters,{kind:'weekly-battle-pass-task',taskId:1001});assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);
});
for(const known of [false,true])test('battle pass complete PAGE separates observations and clears stale controls '+known,async()=>{
 const spec={...warPageSpec,parameters:{kind:'weekly-battle-pass-task',taskId:1001}},reply=data(spec),o={status:known?'OBSERVED':'UNKNOWN',readOnly:true,taskId:1001,taskType:known?'<safe task>':null,progress:known?'9007199254740993':null,requiredProgress:known?'1':null,completion:known?'COMPLETE':'UNKNOWN',taskRewardState:known?'UNCLAIMED_RECORD':'UNKNOWN',totalScore:known?300:null,expectedTaskScore:known?100:null,activePay:known?false:null,activityWindow:known?{period:1001,startTime:900,endTime:2000}:null,rewardStages:known?[{stage:1,freeGot:true,payGot:false}]:null,claimable:null,scoreReceipt:'UNKNOWN',executable:false};reply.view={battlePassObservation:o,candidates:[],notes:[]};
 const h=await boot(),loading=h.node('gp-task-rewards-load').onclick();h.respond('/api/gameplay',reply,{module:'task-rewards'});await loading;const box=h.node('gp-task-rewards-facts'),controls=descendants(box),kind=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare);assert.match(box.textContent,/战令任务只读观察/);assert.match(box.textContent,/战令档位记录（非任务奖励）/);assert.match(box.textContent,/任务完成不等于可领/);if(known){assert.match(box.textContent,/9007199254740993/);assert.match(box.textContent,/<safe task>/);assert.equal(descendants(box).some(n=>n.tagName==='safe task'),false);}assert.equal(domainButtons(h,spec).length,0);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);
 const before=h.requests.length;kind.value='weekly-battle-pass-task';kind.onchange();assert.match(prepare.textContent,/只读/);input.value='1001';prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),spec.parameters);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);h.run("selectAccount('B');selectAccount('A');snapshot={connected:true,state:'READY'}");const source=h.node('gp-task-rewards-parameters').value;prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,source);assert.doesNotMatch(box.textContent,/safe task/);assert.equal(writes(h).length,0);
});

for(const [kind,type,label,tierId]of [['open-rank-order',1,'开服订单',1000],['open-rank-stage',2,'开服闯关',20],['open-rank-pirate',3,'开服剿匪',1000]])test('opening task complete PAGE preserves explicit mode and draft-only controls '+kind,async()=>{
 const spec={...warPageSpec,parameters:{kind,tierId},target:{...warPageSpec.target,kind,type,tierId,...(type<3?{season:null,configuredSeason:null}:{})}},h=await loaded(spec),controls=descendants(h.node('gp-task-rewards-facts')),kindControl=controls.find(n=>n.dataset.dailyRewardKind),input=controls.find(n=>n.dataset.dailyRewardId),prepare=controls.find(n=>n.dataset.dailyRewardPrepare),before=h.requests.length;assert.equal(kindControl.children.filter(n=>n.value===kind).length,1);assert.match(h.node('gp-task-rewards-facts').textContent,new RegExp(label+' · type '+type));kindControl.value=kind;input.value=String(tierId);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-task-rewards-parameters').value),spec.parameters);assert.equal(h.node('gp-task-rewards-authorize').disabled,true);assert.equal(h.requests.length,before);assert.equal(writes(h).length,0);h.run("selectAccount('B');selectAccount('A')");const source=h.node('gp-task-rewards-parameters').value;prepare.click();assert.equal(h.node('gp-task-rewards-parameters').value,source);assert.equal(writes(h).length,0);
});
for(const kind of ['open-rank-order','open-rank-stage','open-rank-pirate'])for(const entry of ['tasks','dailies','loop'])test('opening task unified complete PAGE preserves claim versus observe '+kind+' '+entry,async()=>{
 const h=await unifiedForm(entry);unifiedLoad(h,{entry,tasks:[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});const before=h.requests.length,phase=entry==='tasks'?'tasks':'dailies';unifiedAdd(h,phase,kind,'1000');h.node('wf-unified-observe').checked=true;unifiedAdd(h,phase,kind,'1000');const draft=unifiedDraft(h),compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.deepEqual(draft[phase],[{kind,tierId:1000,...(phase==='dailies'?{action:'claim'}:{})},{kind,tierId:1000,action:'observe'}]);assert.deepEqual(compiled.graph.nodes.map(n=>n.type),['START','ACTION','SURVEY','STOP']);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,0);assert.match(h.node('wf-unified-target-label').textContent,/score.*非行号/);
});

test('assembled daily page shares seasonal child catalog and never infers edict session or automatic claims',async()=>{
 const h=await boot(),observed={status:'OBSERVED',reliable:true,source:'SCAllActivity.festivalActivities',scope:'ACCEPTED_STREAM_OBSERVATION_ONLY',accountId:'A',generation:1,connectionId:'synthetic-push',playerId:'1',worldId:'17',seq:1,observedAt:'2026-11-16T01:00:00.000Z',activities:[{activityId:'9007199254740993',season:3,subActivity:[{subActivityType:28,openTime:900,closeTime:1800,compassWheel:{score:50,claimedId:1}},{subActivityType:29,session:{rune:[0,1,2,3]}},{subActivityType:30,evilExpel:{killTotal:10,claimed:5,alive:0}}]}]},view=dailyChecklist({sessionFacts:{festivalActivities:observed}}),before=h.requests.length;
 h.run('renderDailies('+JSON.stringify({checklist:view,tasks:[]})+')');let text=h.node('dailies-table').textContent;assert.match(text,/活动子项.*最近推送原值/);assert.ok(text.includes('9007199254740993 / 3'));assert.match(text,/龙王罗盘.*28.*open 900；close 1800.*积分 50；已报奖励 ID 1/);assert.ok(text.includes('次数/成本未知'));assert.match(text,/酆都敕令.*29/);assert.ok(text.includes('会话/成本/答案/结算未知'));assert.match(text,/驱邪除祟.*30.*累计击杀 10；已报累计档位 5；存活 0；今日击杀未知/);assert.doesNotMatch(text,/可领取|已到账|0、1、2、3/);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B')");assert.equal(h.node('dailies-table').textContent,'');assert.equal(writes(h,'/api/operations/execute').length,0);
});

test('compass professional draft stays local, invalidates preview and rejects detached account controls',async()=>{
 const spec=cases.find(r=>r.module==='compass-wheel'),h=await loaded(spec),fields=descendants(h.node('gp-compass-wheel-facts')),aid=fields.find(r=>r.dataset.compassActivity),count=fields.find(r=>r.dataset.compassCount),button=fields.find(r=>r.dataset.compassPrepare);
 assert.ok(aid&&count&&button);assert.equal(button.disabled,false);assert.ok(h.node('gp-compass-wheel-facts').textContent.includes('保底仅显示服务器原值'));
 const before=h.requests.length;aid.value='9007199254740997';count.value='50';button.click();assert.equal(h.requests.length,before);assert.deepEqual(JSON.parse(h.node('gp-compass-wheel-parameters').value),{activityId:'9007199254740997',count:50});assert.equal(h.node('gp-compass-wheel-plan').disabled,true);assert.equal(h.node('gp-compass-wheel-authorize').disabled,true);
 h.run("selectAccount('B'); selectAccount('A');");const value=h.node('gp-compass-wheel-parameters').value;aid.value='1';count.value='1';button.click();assert.equal(h.node('gp-compass-wheel-parameters').value,value);assert.equal(writes(h).length,0);
});

test('war online page shows cached stage and config seconds without countdown or claim controls and clears account data',async()=>{
 const h=await boot(),body={counters:[{type:'DAILY_WORLD_ONLINE_RWD',num:'9007199254740993',updateTime:1780000000}]},state={raw:{CounterInfoRequest:body},outcomes:{CounterInfoRequest:{status:'SUCCESS',updatedAt:'2026-11-16T01:00:00Z'}},failed:{}},config={tables:{WorldOnlineRwdCfg:{data:[{stage:1,seconds:1},{stage:2,seconds:60}]}}},before=h.requests.length;
 let view=dailyChecklist(state,{config});h.run('renderDailies('+JSON.stringify({checklist:view,tasks:[]})+')');let text=h.node('dailies-table').textContent;assert.match(text,/城战在线奖.*缓存计数观察/);assert.match(text,/9007199254740993/);assert.match(text,/1780000000/);assert.match(text,/未知 \/ 未知/);assert.match(text,/不计算剩余等待或重置/);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 body.counters[0].num='1';view=dailyChecklist(state,{config});h.run('renderDailies('+JSON.stringify({checklist:view,tasks:[]})+')');text=h.node('dailies-table').textContent;assert.match(text,/2 \/ 60/);assert.equal(h.requests.length,before);assert.equal(descendants(h.node('dailies-table')).some(n=>n.tagName==='BUTTON'&&/在线/.test(n.textContent)),false);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run("selectAccount('B')");assert.equal(h.node('dailies-table').textContent,'');
});

test('water floater page separates species counts and types without pickup controls and clears account data',async()=>{
 const h=await boot(),before=h.requests.length,state={raw:{OnWaterRequest:{floater:[{floaterId:'塑料垃圾1',num:3},{floaterId:'深海宝箱1',num:2}]}},outcomes:{OnWaterRequest:{status:'SUCCESS',updatedAt:'2026-11-16T01:00:00Z'}}},config={tables:{GarbageProductionCfg:{data:[{id:'塑料垃圾1',type:'拾取',production:['塑料',1]},{id:'深海宝箱1',type:'打捞',production:['藏品碎片',1]}]}}};
 h.run('renderDailies('+JSON.stringify({checklist:dailyChecklist(state,{config}),tasks:[]})+')');let text=h.node('dailies-table').textContent;assert.match(text,/海面漂浮物.*缓存种类与数量/);assert.match(text,/2 类 \/ 5 个/);assert.match(text,/塑料垃圾1/);assert.match(text,/深海宝箱1/);assert.match(text,/拾取/);assert.match(text,/打捞/);assert.match(text,/配置产物（非到账）/);assert.match(text,/未知 \/ 未知/);assert.equal(descendants(h.node('dailies-table')).some(n=>n.tagName==='BUTTON'&&/拾取|漂浮|打捞/.test(n.textContent)),false);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 state.raw.OnWaterRequest.floater=[];h.run('renderDailies('+JSON.stringify({checklist:dailyChecklist(state,{config}),tasks:[]})+')');assert.match(h.node('dailies-table').textContent,/本次采集明确报告空列表/);
 delete state.raw.OnWaterRequest.floater;h.run('renderDailies('+JSON.stringify({checklist:dailyChecklist(state,{config}),tasks:[]})+')');text=h.node('dailies-table').textContent;assert.match(text,/漂浮物列表未知/);assert.doesNotMatch(text,/塑料垃圾1|深海宝箱1/);
 h.run("selectAccount('B')");assert.equal(h.node('dailies-table').textContent,'');
});

// Deferred with the owner's consolidated offline regression, not executed yet.
for(const id of ['fleet','treasure','museum','alliance','heroes','farm','compass-wheel','naval'])test(id+' safe defaults share registry metadata and only edit an account draft',async()=>{
 const defaults=structuredClone(GAMEPLAY_MODULES[id].defaultConfig),data=numberConfigData(id);data.config={...defaults,enabled:true};data.source='account';data.functions=[{id,defaultConfig:structuredClone(defaults)}];const h=await numberConfigPage(id,data),requests=h.requests.length;
 assert.match(h.node('gp-'+id+'-config-source').textContent,/账号独立配置/);assert.equal(h.node('gp-'+id+'-config-default').disabled,false);h.node('gp-'+id+'-config-default').click();assert.equal(h.requests.length,requests);assert.deepEqual(JSON.parse(h.node('gp-'+id+'-config').value),defaults);assert.equal(data.config.enabled,true);assert.equal(h.node('gp-'+id+'-plan').disabled,true);assert.equal(h.node('gp-'+id+'-authorize').disabled,true);
 const saving=h.node('gp-'+id+'-config-save').click();assertMutation(h.pending('/api/gameplay/config'),'/api/gameplay/config',{module:id,config:defaults});h.respond('/api/gameplay/config',{accountId:'A',module:id,config:defaults,source:'account'});await saving;assert.equal(writes(h).length,1);assert.match(h.node('gp-'+id+'-config-source').textContent,/账号独立配置/);
 h.run("selectAccount('B');selectAccount('A');");h.node('gp-'+id+'-config-default').click();assert.equal(h.node('gp-'+id+'-config').value,'{}');assert.equal(h.node('gp-'+id+'-config-source').textContent,'');assert.equal(writes(h).length,1);
});
for(const mode of ['missing','duplicate','enabled','running','unknown'])test('safe default drafts block unavailable registry or runtime state '+mode,async()=>{
 const id='fleet',data=numberConfigData(id),metadata={id,defaultConfig:structuredClone(GAMEPLAY_MODULES[id].defaultConfig)};data.functions=mode==='missing'?[]:mode==='duplicate'?[metadata,metadata]:[metadata];if(mode==='enabled')metadata.defaultConfig.enabled=true;if(mode==='running')data.status.running=true;if(mode==='unknown')data.status.blocked=true;
 const h=await numberConfigPage(id,data),before=h.node('gp-'+id+'-config').value,requests=h.requests.length;assert.equal(h.node('gp-'+id+'-config-default').disabled,true);h.node('gp-'+id+'-config-default').click();assert.equal(h.node('gp-'+id+'-config').value,before);assert.equal(h.requests.length,requests);
});

for(const id of ['orders','city','production'])test(id+' Workflow settings reuse registry defaults without an implicit save or run',async()=>{
 const h=await boot(),data={accountId:'A',module:id,config:{enabled:true},source:'account',csrfToken:'synthetic-csrf-A',functions:[{id,defaultConfig:{enabled:false}}]};const loading=h.node('wf-'+id+'-load').click();h.respond('/api/gameplay',data,{module:id});await loading;assert.match(h.node('wf-'+id+'-source').textContent,/账号独立配置/);const before=h.requests.length;assert.equal(h.node('wf-'+id+'-default').disabled,false);h.node('wf-'+id+'-default').click();assert.equal(h.node('wf-'+id+'-enabled').checked,false);assert.equal(h.requests.length,before);assert.equal(writes(h).length,0);
 const saving=h.node('wf-'+id+'-save').click();assertMutation(h.pending('/api/gameplay/config'),'/api/gameplay/config',{module:id,config:{enabled:false}});h.respond('/api/gameplay/config',{accountId:'A',module:id,config:{enabled:false},source:'account'});await saving;assert.equal(writes(h).length,1);h.run("selectAccount('B');selectAccount('A');");h.node('wf-'+id+'-default').click();assert.equal(h.node('wf-'+id+'-source').textContent,'');assert.equal(writes(h).length,1);
});


test('professional and Workflow action preview and confirmation show exact bound identity, expiry and original costs',async()=>{
 const spec=cases.find(row=>row.module==='farm'&&row.actionType==='PLANT'),h=await loaded(spec),context={accountId:'A',playerId:'9007199254740993',worldId:'9007199254740995',generation:7,connectionId:'bound-original-connection'};
 await selectFresh(h,spec);const pending=h.node('gp-'+spec.module+'-plan').onclick(),expected=plan(spec);expected.executionContext=context;h.respond('/api/operations/plan',expected);await pending;
 const box=h.node('gp-'+spec.module+'-plan-view');for(const text of ['角色 9007199254740993','世界 9007199254740995','连接 bound-original-connection','代次 7'])assert.ok(box.textContent.includes(text));
 h.setConfirm(false);await h.node('gp-'+spec.module+'-authorize').onclick();const confirm=h.confirmations.at(-1);for(const text of ['角色 9007199254740993','世界 9007199254740995','连接 bound-original-connection','代次 7',expected.expiresAt,expected.planHash,spec.costs[0].id])assert.ok(confirm.includes(String(text)));assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run('wfPlan='+JSON.stringify(expected)+';gpRenderPlan($("wf-plan"),wfPlan)');assert.ok(h.node('wf-plan').textContent.includes('角色 9007199254740993'));
});
for(const [name,context]of [
 ['missing',undefined],['foreign account',{accountId:'B',playerId:'17',worldId:'9',generation:7,connectionId:'foreign'}],
 ['unsafe role number',{accountId:'A',playerId:9007199254740992,worldId:'9',generation:7,connectionId:'safe'}],
 ['overflow role',{accountId:'A',playerId:'9223372036854775808',worldId:'9',generation:7,connectionId:'safe'}]
])test('plan identity PAGE never borrows snapshot values for '+name,async()=>{
 const h=await boot(),value={accountId:'A',executionContext:context};h.run('snapshot.player={playerId:"should-not-borrow",worldId:"should-not-borrow"}');const text=h.run('operationPlanIdentityText('+JSON.stringify(value)+')');assert.match(text,/角色 未知/);assert.doesNotMatch(text,/should-not-borrow/);assert.equal(writes(h).length,0);
});


test('plan resource balance table and confirmation share original totals without treating expected remainder as settlement',async()=>{
 const spec=cases.find(row=>row.module==='farm'&&row.actionType==='PLANT'),h=await loaded(spec);await selectFresh(h,spec);const pending=h.node('gp-'+spec.module+'-plan').onclick(),expected=plan(spec);
 expected.resourcePreview={readOnly:true,source:'PLAN_SURVEY_STOCK',includesExpectedRewards:false,rows:expected.resourceBudget.map(row=>({id:row.id,plannedCost:row.num,status:'OBSERVED',observed:row.num,projectedRemaining:0}))};h.respond('/api/operations/plan',expected);await pending;
 const box=h.node('gp-'+spec.module+'-plan-view');assert.match(box.textContent,/计划调查时持有/);assert.match(box.textContent,/预计余量（非结算）/);assert.match(box.textContent,/不改变保留线或父预算/);
 h.setConfirm(false);await h.node('gp-'+spec.module+'-authorize').onclick();assert.match(h.confirmations.at(-1),/预计余量 0/);assert.match(h.confirmations.at(-1),/不是实际结算/);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 h.run('wfPlan='+JSON.stringify(expected)+';gpRenderPlan($("wf-plan"),wfPlan)');assert.match(h.node('wf-plan').textContent,/计划调查时持有/);
});
for(const [name,change]of [
 ['missing preview',plan=>delete plan.resourcePreview],['wrong source',plan=>plan.resourcePreview.source='ESTIMATED_REWARDS'],['mutable',plan=>plan.resourcePreview.readOnly=false],['expected income',plan=>plan.resourcePreview.includesExpectedRewards=true],['duplicate',plan=>plan.resourcePreview.rows.push({...plan.resourcePreview.rows[0]})],['wrong cost',plan=>plan.resourcePreview.rows[0].plannedCost=39],['unsafe quantity',plan=>plan.resourcePreview.rows[0].observed=9007199254740992],['unknown',plan=>plan.resourcePreview.rows[0].status='UNKNOWN'],['contradictory remainder',plan=>plan.resourcePreview.rows[0].projectedRemaining=61]
])test('plan balance PAGE retains unknown source rather than calculating a replacement: '+name,async()=>{
 const h=await boot(),plan={resourceBudget:[{id:'wood',num:40}],resourcePreview:{readOnly:true,source:'PLAN_SURVEY_STOCK',includesExpectedRewards:false,rows:[{id:'wood',plannedCost:40,status:'OBSERVED',observed:100,projectedRemaining:60}]}};change(plan);
 h.run('snapshot.resources=[{id:"wood",num:999}]');const rows=h.run('operationPlanResourceRows('+JSON.stringify(plan)+')');assert.equal(rows.length,1);assert.equal(rows[0][0],'wood');assert.equal(rows[0][1],'未知');assert.equal(rows[0][2],40);assert.equal(rows[0][3],'未知');assert.equal(writes(h).length,0);
});


const equipmentTargetFacts=()=>({heroes:[{heroId:'A',equips:[{uid:'9007199254740993',equipId:'蓝武器1',level:1,star:0,refineLv:0}]},{heroId:'B',equips:[{uid:'9007199254740995',equipId:'蓝防具1',level:1,star:0,refineLv:0}]}],bag:[{uid:'9007199254740997',equipId:'蓝武器1',level:1,star:0,refineLv:0}]});
function equipmentTargetControls(h){const nodes=descendants(h.node('gp-equipment-growth-facts'));return {mode:nodes.find(row=>row.dataset.equipmentTargetMode),hero:nodes.find(row=>row.dataset.equipmentTargetHero),uid:nodes.find(row=>row.dataset.equipmentTargetUid),prepare:nodes.find(row=>row.dataset.equipmentTargetPrepare)};}
for(const mode of ['level','initial-level','refine','star','put-on'])test('equipment structured '+mode+' uses exact explicit hero and UID and only changes existing investigation draft',async()=>{
 const base=cases.find(row=>row.module==='equipment-growth'),spec={...base,facts:equipmentTargetFacts()},h=await loaded(spec),form=equipmentTargetControls(h),before=h.requests.length;
 assert.ok(form.mode&&form.hero&&form.uid&&form.prepare);assert.equal(form.hero.value,'');assert.equal(form.prepare.disabled,true);assert.equal(form.hero.children.length,3);
 form.mode.value=mode;form.mode.onchange();form.hero.value='A';form.hero.onchange();assert.equal(form.uid.value,'');const selected=mode==='put-on'?'9007199254740997':'9007199254740993';assert.ok(form.uid.children.some(row=>row.value===selected));assert.equal(form.uid.children.some(row=>row.value==='9007199254740995'),false);
 form.uid.value=selected;form.prepare.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{heroId:'A',uid:selected,...(mode==='level'?{}:{action:mode})});assert.equal(h.requests.length,before);assert.equal(h.node('gp-equipment-growth-plan').disabled,true);assert.equal(h.node('gp-equipment-growth-authorize').disabled,true);assert.equal(form.prepare.disabled,true);
 const query=h.node('gp-equipment-growth-survey').onclick();assertMutation(h.pending('/api/gameplay/survey'),'/api/gameplay/survey',{module:'equipment-growth',parameters:{heroId:'A',uid:selected,...(mode==='level'?{}:{action:mode})}});h.respond('/api/gameplay/survey',data(spec));await query;assert.equal(writes(h,'/api/operations/plan').length,0);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
test('equipment structured hero-only observation does not automatically pick gear or carry old UID across heroes',async()=>{
 const spec={...cases.find(row=>row.module==='equipment-growth'),facts:equipmentTargetFacts()},h=await loaded(spec),form=equipmentTargetControls(h);form.hero.value='A';form.hero.onchange();form.uid.value='9007199254740993';form.hero.value='B';form.hero.onchange();assert.equal(form.uid.value,'');form.prepare.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{heroId:'B'});assert.equal(writes(h).length,0);
});
for(const [name,change,mode]of [
 ['missing heroes',view=>delete view.heroes,'level'],['duplicate heroes',view=>view.heroes.push({...view.heroes[0]}),'level'],['unsafe UID',view=>view.heroes[0].equips[0].uid=9007199254740992,'level'],['overflow UID',view=>view.heroes[0].equips[0].uid='9223372036854775808','level'],['duplicate worn UID',view=>view.heroes[0].equips.push({...view.heroes[0].equips[0]}),'level'],['missing worn list',view=>delete view.heroes[0].equips,'level'],['sparse worn list',view=>view.heroes[0].equips=Array(1),'level'],['missing idle list',view=>delete view.bag,'put-on'],['duplicate idle UID',view=>view.bag.push({...view.bag[0]}),'put-on']
])test('equipment target preserves unknown observation and blocks malformed source: '+name,async()=>{
 const spec={...cases.find(row=>row.module==='equipment-growth'),facts:equipmentTargetFacts()};change(spec.facts);const h=await loaded(spec),form=equipmentTargetControls(h);form.mode.value=mode;form.mode.onchange();form.hero.value='A';form.hero.onchange();assert.equal(form.prepare.disabled,true);form.prepare.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});assert.equal(writes(h).length,0);
});
for(const [name,change]of [['pending','gpGet("equipment-growth").pending=true'],['running','gpGet("equipment-growth").data.status.running=true'],['blocked','gpGet("equipment-growth").data.status.blocked=true'],['busy','snapshot.busy="other-owner"'],['parameters changed','$("gp-equipment-growth-parameters").value=JSON.stringify({heroId:"edited"});$("gp-equipment-growth-parameters").oninput()'],['config changed','$("gp-equipment-growth-config").value=JSON.stringify({enabled:false});$("gp-equipment-growth-config").oninput()']])test('equipment target old controls cannot change draft after '+name,async()=>{
 const spec={...cases.find(row=>row.module==='equipment-growth'),facts:equipmentTargetFacts()},h=await loaded(spec),form=equipmentTargetControls(h);form.hero.value='A';form.hero.onchange();form.uid.value='9007199254740993';h.run(change+';gpControls("equipment-growth")');const before=h.node('gp-equipment-growth-parameters').value;form.prepare.click();assert.equal(h.node('gp-equipment-growth-parameters').value,before);assert.equal(writes(h).length,0);
});
test('equipment target stale account and replaced view controls never revive while raw unknown fields stay untouched',async()=>{
 const spec={...cases.find(row=>row.module==='equipment-growth'),facts:equipmentTargetFacts()},h=await loaded(spec),form=equipmentTargetControls(h);form.hero.value='A';form.hero.onchange();form.uid.value='9007199254740993';h.run("selectAccount('B');selectAccount('A')");form.prepare.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});assert.equal(writes(h).length,0);
 const next=h.node('gp-equipment-growth-load').onclick();h.respond('/api/gameplay',data(spec),{module:'equipment-growth'});await next;const old=equipmentTargetControls(h);old.hero.value='A';old.hero.onchange();old.uid.value='9007199254740993';const reload=h.node('gp-equipment-growth-load').onclick();h.respond('/api/gameplay',data(spec),{module:'equipment-growth'});await reload;old.prepare.click();assert.deepEqual(JSON.parse(h.node('gp-equipment-growth-parameters').value),{});
 h.node('gp-equipment-growth-parameters').value=JSON.stringify({heroId:'A',unsupported:'keep-me'});const raw=h.node('gp-equipment-growth-parameters').value;h.run('gpRenderDomain("equipment-growth",gpGet("equipment-growth").data.view)');assert.match(h.node('gp-equipment-growth-facts').textContent,/目标参数格式未知/);assert.equal(equipmentTargetControls(h).prepare,undefined);assert.equal(h.node('gp-equipment-growth-parameters').value,raw);
});


async function recruitTaskPage(spec){const h=await boot(),loading=h.node('gp-free-recruit-load').click(),reply=data(spec);reply.view.candidates=[candidate(spec)];h.respond('/api/gameplay',reply,{module:'free-recruit'});await loading;return h;}
for(const entry of ['tasks','loop'])for(const recruit of ['hero','antique'])for(const count of ['free','1','10','50'])test('Tasks recruit PAGE '+entry+' '+recruit+' '+count+' compiles exact source without expanding budget',async()=>{
 const h=await unifiedForm(entry),budget={resources:[{id:'GOLD',num:7}],quotas:[],uids:[]};unifiedLoad(h,{entry,tasks:[{kind:'branch',taskId:7}],dailies:[],world:[],rounds:1,everyMs:0,budget});h.node('wf-unified-phase').value='tasks';h.node('wf-unified-phase').onchange();h.node('wf-unified-kind').value='free-recruit';h.node('wf-unified-kind').onchange();assert.equal(h.node('wf-unified-recruit-kind').disabled,false);h.node('wf-unified-recruit-kind').value=recruit;h.node('wf-unified-recruit-kind').onchange();h.node('wf-unified-recruit-count').value=count;h.node('wf-unified-recruit-count').onchange();const before=h.requests.length;h.node('wf-unified-add').click();const parameters={...(recruit==='antique'?{recruit}:{}),...(count==='free'?{}:{payment:'ticket',...(count==='1'?{}:{count:Number(count)})})},draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'branch',taskId:7},{kind:'free-recruit',parameters}]);assert.deepEqual(draft.budget,budget);assert.deepEqual(compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.filter(n=>n.type==='ACTION').at(-1).parameters,parameters);assert.match(h.node('wf-unified-steps').textContent,new RegExp(recruit==='antique'?'古董':'英雄'));assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);h.run("selectAccount('B');selectAccount('A')");assert.equal(h.node('wf-unified-recruit-kind').value,'hero');assert.equal(writes(h,'/api/operations/execute').length,0);
});
for(const entry of ['tasks','loop'])for(const recruit of ['hero','antique'])test('Tasks recruit PAGE professional candidate preserves existing steps and budget '+entry+' '+recruit,async()=>{
 const base=cases.find(s=>s.module==='free-recruit'),parameters={...(recruit==='antique'?{recruit}:{}),payment:'ticket',count:10},spec={...base,parameters,costs:[{id:recruit==='antique'?'藏品券':'抽卡券',num:10}]},h=await recruitTaskPage(spec),budget={resources:[{id:'GOLD',num:3}],quotas:[],uids:[]};unifiedLoad(h,{entry,tasks:[{kind:'main',taskId:1}],dailies:[],world:[],rounds:1,everyMs:0,budget});const control=descendants(h.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitTaskPrepare);assert.ok(control);assert.equal(control.disabled,false);const before=h.requests.length;control.click();assert.deepEqual(unifiedDraft(h).tasks,[{kind:'main',taskId:1},{kind:'free-recruit',parameters}]);assert.deepEqual(unifiedDraft(h).budget,budget);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});
for(const fault of ['dailies','limit','dirty','scope','busy'])test('Tasks recruit PAGE professional candidate rejects '+fault+' without copying permission',async()=>{
 const spec=cases.find(s=>s.module==='free-recruit'),h=await recruitTaskPage(spec);unifiedLoad(h,{entry:fault==='dailies'?'dailies':'tasks',tasks:fault==='limit'?Array.from({length:48},()=>({kind:'main',taskId:1})):[],dailies:[],world:[],rounds:1,everyMs:0,budget:{resources:[],quotas:[],uids:[]}});const control=descendants(h.node('gp-free-recruit-facts')).find(n=>n.dataset?.recruitTaskPrepare);assert.ok(control);if(fault==='dirty'){h.node('gp-free-recruit-parameters').value='{"payment":"ticket"}';h.node('gp-free-recruit-parameters').oninput();}if(fault==='scope')h.run("selectAccount('B');selectAccount('A')");if(fault==='busy')h.run("snapshot.busy='synthetic'");const before=h.node('wf-unified-intent').value,requests=h.requests.length;control.click();assert.equal(h.node('wf-unified-intent').value,before);assert.equal(h.requests.length,requests);assert.equal(h.confirmations.length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});

const tasksBusinessPageSpecs=[
 {kind:'cargo-fill',module:'fleet',actionType:'cargoFill',actionId:'fleet:cargoFill:2:3',parameters:{shipIndex:2,cargoIndex:3},target:{shipIndex:2,cargoIndex:3},costs:[{id:'小麦',num:5}],facts:{}},
 {kind:'alliance-order',module:'alliance',actionType:'finishOrder',actionId:'alliance:finishOrder:synthetic-city',parameters:{cityId:7},target:{cityId:7},costs:[{id:'小麦',num:5}],facts:{cities:[{cityId:7}]}},
 {kind:'museum',module:'museum',actionType:'startExplore',actionId:'museum:startExplore:synthetic-stage',parameters:{stageId:1,heroIds:['A','B'],factor:2},target:{stageId:1,heroIds:['A','B'],factor:2},costs:[{id:'小麦',num:5}],facts:{}},
 {kind:'pirate-sweep',...pirateCase},
 {kind:'trial-challenge',...cases.find(s=>s.module==='trial-challenge'),parameters:{raidId:2,stageId:2001},target:{raidId:2,stageId:2001,passedStage:0}},
 {kind:'free-gold',...cases.find(s=>s.module==='free-gold')}
];
for(const spec of tasksBusinessPageSpecs)test('Tasks business batch native form preserves original parameters and Dailies '+spec.kind,async()=>{
 for(const phase of ['tasks','dailies']){
  const h=await unifiedForm(phase);h.node('wf-unified-cargo-index').value='3';h.node('wf-unified-museum-heroes').value='A\nB';h.node('wf-unified-museum-factor').value='2';h.node('wf-unified-pirate-city').value='9';h.node('wf-unified-pirate-lower').checked=true;
  const targets={'cargo-fill':'2','alliance-order':'7',museum:'1','pirate-sweep':'17','trial-challenge':'2','free-gold':''};
  if(spec.kind==='pirate-sweep'){h.node('wf-unified-phase').value=phase;h.node('wf-unified-phase').onchange();h.node('wf-unified-kind').value=spec.kind;h.node('wf-unified-kind').onchange();h.node('wf-unified-target').value='17';h.node('wf-unified-pirate-city').value='9';h.node('wf-unified-pirate-lower').checked=true;h.node('wf-unified-add').click();}
  else unifiedAdd(h,phase,spec.kind,targets[spec.kind]);const draft=unifiedDraft(h),row=draft[phase].at(-1);assert.ok(row,h.node('wf-unified-form-hint').textContent);
  const parameters=spec.kind==='trial-challenge'?{raidId:2}:spec.parameters;
  assert.deepEqual(row,phase==='tasks'?{kind:spec.kind,parameters}:{taskId:({'cargo-fill':1008,'alliance-order':1012,museum:1016,'pirate-sweep':1010,'trial-challenge':1009,'free-gold':1006})[spec.kind],action:'perform',...(spec.kind==='free-gold'?{}:{parameters})});
  const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}),action=compiled.graph.nodes.filter(n=>n.type==='ACTION').at(-1);assert.equal(action.module,spec.module);assert.deepEqual(action.parameters,parameters);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
 }
});
for(const spec of tasksBusinessPageSpecs)test('Tasks business batch professional candidate keeps target and fixed draft budget '+spec.kind,async()=>{
 const h=await loaded(spec),read=h.node('gp-'+spec.module+'-survey').click(),reply=data(spec);reply.view.candidates=reply.view.candidates.filter(r=>r.executable===true);h.respond('/api/gameplay/survey',reply);await read;
 const draft={entry:'loop',tasks:[{kind:'main',taskId:7}],dailies:[],world:[],rounds:2,everyMs:100,budget:{resources:[{id:'小麦',num:15}],quotas:[],uids:[]}};unifiedLoad(h,draft);
 const button=descendants(h.node('gp-'+spec.module+'-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId)??descendants(h.node('gp-'+spec.module+'-facts')).find(n=>n.dataset.trialTaskPrepare||n.dataset.freeGoldTaskPrepare);
 assert.ok(button,'original Tasks candidate button');assert.equal(button.disabled,false);const before=h.requests.length;button.click();
 const next=unifiedDraft(h),parameters=spec.kind==='free-gold'?{expectedGold:spec.facts.gold}:spec.parameters;assert.deepEqual(next.tasks,[...draft.tasks,{kind:spec.kind,parameters}]);assert.deepEqual(next.budget,draft.budget);assert.deepEqual(next.world,[]);assert.deepEqual(next.dailies,[]);assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
 const compiled=compileUnifiedExecution(next,{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.graph.nodes.filter(n=>n.type==='ACTION')[1].parameters,parameters);
});
for(const spec of tasksBusinessPageSpecs.slice(0,4))test('Tasks business batch professional controls reject stale source foreign entry and overflow '+spec.kind,async()=>{
 const h=await loaded(spec),button=descendants(h.node('gp-'+spec.module+'-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId);assert.ok(button);const before=h.requests.length;
 const full={entry:'tasks',tasks:Array.from({length:48},()=>({kind:'main',taskId:7})),budget:{resources:[],quotas:[],uids:[]}};
 unifiedLoad(h,full);let source=h.node('wf-unified-intent').value;button.click();assert.equal(h.node('wf-unified-intent').value,source);assert.match(h.node('gp-'+spec.module+'-hint').textContent,/48/);
 unifiedLoad(h,{entry:'dailies',dailies:[],budget:{resources:[],quotas:[],uids:[]}});source=h.node('wf-unified-intent').value;button.click();assert.equal(h.node('wf-unified-intent').value,source);
 h.node('gp-'+spec.module+'-parameters').oninput();source=h.node('wf-unified-intent').value;button.click();assert.equal(h.node('wf-unified-intent').value,source);
 h.run("selectAccount('B')");button.click();assert.equal(h.node('wf-unified-intent').value,'');assert.equal(h.requests.filter(r=>r.options.method==='POST').length,0);assert.equal(h.confirmations.length,0);
});


async function explicitCollectionPage(){
 const rows=['factory-1','factory-2'].map((buildingId,i)=>({parameters:{buildingId,action:'collect',expectedCollectionHash:String(i+1).repeat(64)},products:[{id:'cloth',num:2}],costs:[],executable:true}));
 const spec={module:'production',actionId:'collection-synthetic',actionType:'gainFactory',parameters:{},costs:[],facts:{factories:[],collectionPreparation:rows}};
 const h=await loaded(spec),controls=descendants(h.node('gp-production-facts'));
 return {h,rows,picks:controls.filter(n=>n.dataset.productionCollectionBuilding),duration:controls.find(n=>n.dataset.productionCollectionDuration),prepare:controls.find(n=>n.dataset.productionCollectionPrepare)};
}
function explicitCollectionReply(u){
 const targets=u.picks.filter(n=>n.checked).map(n=>u.rows.find(r=>r.parameters.buildingId===n.dataset.productionCollectionBuilding).parameters),maxDurationMs=Number(u.duration.value)*1000,budget={resources:[],quotas:[],uids:[]},nodes=[{id:'start',type:'START'}];
 targets.forEach((parameters,i)=>nodes.push({id:'collect-'+i,type:'ACTION',module:'production',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'production'}));nodes.push({id:'stop',type:'STOP'});
 return {accountId:'A',action:'collect',targets,maxDurationMs,budget,steps:targets.map(parameters=>({parameters,selection:{unique:true},costs:[],products:u.rows.find(r=>r.parameters.buildingId===parameters.buildingId).products})),resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'synthetic collection',graph:{version:1,id:'collection-synthetic',name:'collections',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs,maxActions:targets.length,modules:['production']}}};
}
test('explicit collection PAGE requires choice and loads exact original Workflow without execution',async()=>{
 const u=await explicitCollectionPage(),{h}=u;assert.equal(u.picks.length,2);assert.ok(u.picks.every(n=>!n.checked&&!n.disabled));await u.prepare.click();assert.equal(writes(h).length,0);
 u.picks.forEach(n=>{n.checked=true;n.onchange();});u.duration.value='60';const reply=explicitCollectionReply(u),work=u.prepare.click();await tick();
 assert.ok(h.pending('/api/gameplay/production/start/prepare'),h.node('gp-production-hint').textContent);assertMutation(h.pending('/api/gameplay/production/start/prepare'),'/api/gameplay/production/start/prepare',{action:'collect',targets:reply.targets,maxDurationMs:60000});h.respond('/api/gameplay/production/start/prepare',reply);await work;
 assert.deepEqual(JSON.parse(h.node('wf-json').value),reply.graph);assert.equal(writes(h).length,1);assert.equal(writes(h,'/api/operations/execute').length,0);
});
for(const mode of ['choice','duration','editor','account','products','budget','nodes','targets'])test('explicit collection PAGE rejects stale or tampered preparation '+mode,async()=>{
 const u=await explicitCollectionPage(),{h}=u;u.picks.forEach(n=>{n.checked=true;n.onchange();});const reply=explicitCollectionReply(u),work=u.prepare.click();await tick();
 if(mode==='choice')u.picks[1].checked=false;if(mode==='duration')u.duration.value='61';if(mode==='editor')h.node('wf-json').value='edited';if(mode==='account')h.run("selectAccount('B');snapshot={connected:true,state:'READY'}");
 if(mode==='products')reply.steps[0].products=[{id:'cloth',num:200}];if(mode==='budget')reply.graph.budget={resources:[{id:'gold',num:1}],quotas:[],uids:[]};if(mode==='nodes')reply.graph.nodes.splice(2,1);if(mode==='targets')reply.targets=reply.targets.slice().reverse();
 const before=h.node('wf-json').value;h.respond('/api/gameplay/production/start/prepare',reply);await work;assert.equal(h.node('wf-json').value,before);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});


async function explicitCityPage(){
 const rows=['building-1','building-2'].map((buildingId,i)=>({parameters:{buildingId,action:i?'upgrade':'build',expectedCityHash:String(i+1).repeat(64)},actionId:'city-'+i,costs:[{id:'wood',num:i+1}],beforeState:{level:i},expectedState:{levelAtLeast:i+1},executable:true}));
 const h=await loaded({module:'city',actionId:'city-synthetic',actionType:'build',parameters:{},costs:[],facts:{buildings:[],preparation:rows}}),controls=descendants(h.node('gp-city-facts'));return {h,rows,picks:controls.filter(n=>n.dataset.cityPreparationTarget),duration:controls.find(n=>n.dataset.cityPreparationDuration),prepare:controls.find(n=>n.dataset.cityPreparationPrepare)};
}
function explicitCityReply(u){const targets=u.rows.map(row=>row.parameters),budget={resources:[{id:'wood',num:3}],quotas:[],uids:[]},nodes=[{id:'start',type:'START'}];targets.forEach((parameters,i)=>nodes.push({id:'city-'+i,type:'ACTION',module:'city',parameters,selection:{unique:true}},{id:'verify-'+i,type:'VERIFY',module:'city'}));nodes.push({id:'stop',type:'STOP'});return {accountId:'A',targets,maxDurationMs:60000,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,budget,steps:u.rows.map(row=>({parameters:row.parameters,selection:{unique:true},costs:row.costs,beforeState:row.beforeState,expectedState:row.expectedState})),graph:{version:1,id:'city-synthetic',name:'city',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:60000,maxActions:2,modules:['city']}},limitation:'synthetic city'};}
for(const mode of ['success','late-editor','wrong-cost','wrong-target'])test('explicit city preparation PAGE '+mode+' uses existing guarded route and original editor',async()=>{
 const u=await explicitCityPage(),{h}=u;assert.equal(u.picks.length,2);assert.ok(u.picks.every(n=>!n.checked&&!n.disabled));await u.prepare.click();assert.equal(writes(h).length,0);u.picks.forEach(n=>{n.checked=true;n.onchange();});u.duration.value='60';const reply=explicitCityReply(u),work=u.prepare.click();await tick();assertMutation(h.pending('/api/gameplay/city/prepare'),'/api/gameplay/city/prepare',{targets:reply.targets,maxDurationMs:60000});
 if(mode==='late-editor')h.node('wf-json').value='edited';if(mode==='wrong-cost')reply.steps[0].costs=[];if(mode==='wrong-target')reply.graph.nodes[1].parameters={...reply.targets[0],buildingId:'foreign'};const before=h.node('wf-json').value;h.respond('/api/gameplay/city/prepare',reply);await work;assert.equal(h.node('wf-json').value,mode==='success'?JSON.stringify(reply.graph,null,2):before);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
});


async function explicitAccelerationPage(module,count=2,{sameBuilding=false}={}){
 const production=module==='production',rows=Array.from({length:count},(_,i)=>sameBuilding?'factory-1':'factory-'+(i+1)).map((buildingId,i)=>({parameters:production?{buildingId,action:'speedUpProduce',index:i%2?2147483647:0,expectedAccelerationHash:(i+1).toString(16).padStart(64,'0')}:{buildingId,action:'speedUpUpgrade',expectedCityHash:(i+1).toString(16).padStart(64,'0')},actionId:'speed-'+i,costs:[{id:'加速器',num:2}],beforeState:{buildingId,finishTime:2000},expectedState:{finishTimeReduced:true},executable:true}));
 const h=await loaded({module,actionId:'speed-synthetic',actionType:production?'speedUpProduce':'speedUpUpgrade',parameters:{},costs:[],facts:{buildings:[],factories:[],[production?'accelerationPreparation':'preparation']:rows}}),controls=descendants(h.node('gp-'+module+'-facts'));return {h,rows,picks:controls.filter(n=>production?n.dataset.productionAccelerationBuilding:n.dataset.cityPreparationTarget),duration:controls.find(n=>production?n.dataset.productionAccelerationDuration:n.dataset.cityPreparationDuration),prepare:controls.find(n=>production?n.dataset.productionAccelerationPrepare:n.dataset.cityPreparationPrepare)};
}
for(const module of ['city','production'])for(const mode of ['success','wrong-cost','late-choice'])test('explicit acceleration PAGE '+module+' '+mode+' loads only original guarded Workflow',async()=>{
 const u=await explicitAccelerationPage(module),{h}=u,production=module==='production';assert.equal(u.picks.length,2);assert.ok(u.picks.every(n=>!n.checked&&!n.disabled));u.picks.forEach(n=>{n.checked=true;n.onchange();});u.duration.value='60';const reply=explicitCityReply(u),budget={resources:[{id:'加速器',num:4}],quotas:[],uids:[]};reply.budget=reply.graph.budget=budget;reply.graph.runPolicy.modules=[module];reply.graph.nodes.forEach(n=>{if(n.module)n.module=module;if(production&&n.id.startsWith('city-'))n.id=n.id.replace('city-','accelerate-');});reply.graph.edges=reply.graph.nodes.slice(1).map((n,i)=>({from:reply.graph.nodes[i].id,to:n.id}));if(production)reply.action='speedUpProduce';const work=u.prepare.click();await tick();const route=production?'/api/gameplay/production/start/prepare':'/api/gameplay/city/prepare';assertMutation(h.pending(route),route,{...(production?{action:'speedUpProduce'}:{}),targets:reply.targets,maxDurationMs:60000});if(mode==='wrong-cost')reply.steps[0].costs=[];if(mode==='late-choice')u.picks[0].checked=false;const before=h.node('wf-json').value;h.respond(route,reply);await work;assert.equal(h.node('wf-json').value,mode==='success'?JSON.stringify(reply.graph,null,2):before);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.ok(u.picks.every(n=>!n.disabled));
});


function accelerationBoundaryReply(u,module){
 const reply=explicitCityReply(u),budget={resources:[{id:'加速器',num:u.rows.length*2}],quotas:[],uids:[]};reply.budget=reply.graph.budget=budget;reply.maxDurationMs=reply.graph.runPolicy.maxDurationMs=Number(u.duration.value)*1000;reply.graph.runPolicy.maxActions=u.rows.length;reply.graph.runPolicy.modules=[module];for(const n of reply.graph.nodes){if(n.module)n.module=module;if(module==='production'&&n.id.startsWith('city-'))n.id=n.id.replace('city-','accelerate-');}reply.graph.edges=reply.graph.nodes.slice(1).map((n,i)=>({from:reply.graph.nodes[i].id,to:n.id}));if(module==='production')reply.action='speedUpProduce';return reply;
}
for(const module of ['city','production'])for(const count of [1,24])test('acceleration PAGE boundary '+module+' '+count+' preserves explicit full graph and fixed budget',async()=>{
 const u=await explicitAccelerationPage(module,count),{h}=u;assert.equal(u.picks.length,count);assert.ok(u.picks.every(n=>!n.checked&&!n.disabled));assert.equal(u.duration.value,'');await u.prepare.click();assert.equal(writes(h).length,0);u.picks.forEach(n=>{n.checked=true;n.onchange();});u.duration.value=count===1?'1':'86400';u.duration.oninput();const reply=accelerationBoundaryReply(u,module),route=module==='city'?'/api/gameplay/city/prepare':'/api/gameplay/production/start/prepare',work=u.prepare.click();await tick();assertMutation(h.pending(route),route,{...(module==='production'?{action:'speedUpProduce'}:{}),targets:reply.targets,maxDurationMs:reply.maxDurationMs});assert.ok(u.picks.every(n=>n.disabled));h.respond(route,reply);await work;assert.deepEqual(JSON.parse(h.node('wf-json').value),reply.graph);assert.equal(validateWorkflow(reply.graph,{modules:GAMEPLAY_MODULES}).valid,true);assert.equal(reply.graph.nodes.length,count*2+2);assert.deepEqual(reply.graph.budget.resources,[{id:'加速器',num:count*2}]);assert.ok(u.picks.every(n=>!n.disabled));assert.equal(writes(h).length,1);assert.equal(h.confirmations.length,0);
});
for(const module of ['city','production'])for(const mode of ['none','duplicate','overflow','blank-duration','zero-duration','fraction-duration','overflow-duration'])test('acceleration PAGE boundary '+module+' rejects '+mode+' before HTTP preparation',async()=>{
 const u=await explicitAccelerationPage(module,mode==='overflow'?25:2,{sameBuilding:mode==='duplicate'}),{h}=u;if(mode!=='none')u.picks.forEach(n=>{n.checked=true;n.onchange();});u.duration.value=({'blank-duration':'','zero-duration':'0','fraction-duration':'1.5','overflow-duration':'86401'})[mode]??'60';const before=h.node('wf-json').value;await u.prepare.click();assert.equal(writes(h).length,0);assert.equal(h.node('wf-json').value,before);assert.equal(h.confirmations.length,0);
});
for(const module of ['city','production'])for(const mode of ['duration','editor','account','config','source','busy','disconnected'])test('acceleration PAGE boundary '+module+' drops late '+mode+' response',async()=>{
 const u=await explicitAccelerationPage(module),{h}=u;u.picks.forEach(n=>{n.checked=true;n.onchange();});u.duration.value='60';const reply=accelerationBoundaryReply(u,module),route=module==='city'?'/api/gameplay/city/prepare':'/api/gameplay/production/start/prepare',work=u.prepare.click();await tick();assert.ok(h.pending(route));
 if(mode==='duration')u.duration.value='61';if(mode==='editor')h.node('wf-json').value='preserved edit';if(mode==='account')h.run("selectAccount('B');selectAccount('A')");if(mode==='config')h.run('gpGet('+JSON.stringify(module)+').data.config={enabled:false}');if(mode==='source')h.run('gpGet('+JSON.stringify(module)+').data.view={...gpGet('+JSON.stringify(module)+').data.view}');if(mode==='busy')h.run('snapshot.busy="other-owner"');if(mode==='disconnected')h.run('snapshot.connected=false');
 const before=h.node('wf-json').value;h.respond(route,reply);await work;assert.equal(h.node('wf-json').value,before);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(h.confirmations.length,0);
});
for(const module of ['city','production'])for(const mode of ['before-state','expected-state','budget','verify','edge','selection','limit','order','account'])test('acceleration PAGE boundary '+module+' rejects altered '+mode+' graph',async()=>{
 const u=await explicitAccelerationPage(module),{h}=u;u.picks.forEach(n=>{n.checked=true;n.onchange();});u.duration.value='60';const reply=structuredClone(accelerationBoundaryReply(u,module)),route=module==='city'?'/api/gameplay/city/prepare':'/api/gameplay/production/start/prepare',work=u.prepare.click();await tick();assert.ok(h.pending(route));
 if(mode==='before-state')reply.steps[0].beforeState={};if(mode==='expected-state')reply.steps[0].expectedState={};if(mode==='budget')reply.graph.budget.resources[0].num++;if(mode==='verify')reply.graph.nodes.splice(2,1);if(mode==='edge')reply.graph.edges[0].to='stop';if(mode==='selection')reply.graph.nodes[1].selection={unique:false};if(mode==='limit')reply.graph.runPolicy.maxActions++;if(mode==='order')reply.targets.reverse();if(mode==='account')reply.accountId='B';
 const before=h.node('wf-json').value;h.respond(route,reply);await work;assert.equal(h.node('wf-json').value,before);assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.ok(u.picks.every(n=>!n.disabled));
});


test('resident-order Tasks declaration uses the exact professional candidate and unchanged parent budget',async()=>{
 const actionId='orders:SUBMIT:'+'a'.repeat(64),row={actionId,actionType:'SUBMIT',executable:true,target:{index:0},costs:[{id:'wood',num:2}]};
 const h=await boot(),load=h.node('ops-load').click();
 h.respond('/api/operations',{accountId:'A',csrfToken:'synthetic-csrf-A',status:{running:false},view:{orders:[row,{...row,actionType:'REFRESH',actionId:actionId.replace('SUBMIT','REFRESH')}]}});await load;
 const budget={resources:[{id:'wood',num:4}],quotas:[],uids:[]};
 const draft={entry:'loop',tasks:[{kind:'orderDaily',action:'observe'}],dailies:[],world:[],budget};unifiedLoad(h,draft);
 const buttons=descendants(h.node('ops-orders')).filter(n=>n.dataset.orderTaskActionId);
 assert.equal(buttons.length,1);const [button]=buttons;assert.equal(button.dataset.orderTaskActionId,actionId);
 await button.click();
 unifiedAdd(h,'tasks','resident-order','orders:REFRESH:'+'a'.repeat(64));
 assert.deepEqual(unifiedDraft(h).tasks,[...draft.tasks,{kind:'resident-order',actionId}]);
 unifiedAdd(h,'tasks','resident-order',actionId.replace(/a$/,'b'));
 const next=unifiedDraft(h),{graph}=compileUnifiedExecution(next,{modules:GAMEPLAY_MODULES});
 assert.deepEqual(graph.nodes.filter(n=>n.type==='ACTION').map(n=>[n.module,n.parameters,n.selection]),[['orders',{},{actionId}],['orders',{},{actionId:actionId.replace(/a$/,'b')}]]);
 assert.deepEqual(graph.budget,budget);assert.equal(writes(h).length,0);assert.equal(h.confirmations.length,0);
 h.run("selectAccount('B')");await button.click();assert.equal(h.node('wf-unified-intent').value,'');
});


test('compass Tasks draft sends the exact surveyed spin and unchanged budget to Workflow preparation',async()=>{
 const spec={...cases.find(row=>row.module==='compass-wheel'),actionId:'compass-wheel:'+'a'.repeat(64)};
 const h=await loaded(spec);
 h.node('gp-compass-wheel-parameters').value=JSON.stringify(spec.parameters);
 const survey=h.node('gp-compass-wheel-survey').click();
 h.respond('/api/gameplay/survey',{...data(spec),view:{...spec.facts,candidates:[candidate(spec)]}});
 await survey;
 const fields=descendants(h.node('gp-compass-wheel-facts'));
 const button=fields.find(row=>row.dataset.compassTaskPrepare),count=fields.find(row=>row.dataset.compassCount);
 assert.equal(button.disabled,false);
 const draft={entry:'tasks',tasks:[],dailies:[],world:[],budget:{resources:spec.costs,quotas:[{id:'compass-wheel:'+spec.parameters.activityId,num:5}],uids:[{type:'compass-wheel',id:spec.parameters.activityId+':10'}]}};
 unifiedLoad(h,draft);
 const existingWrites=writes(h).length;
 count.value='10';await button.click();assert.deepEqual(unifiedDraft(h).tasks,[]);
 count.value='5';await button.click();await button.click();
 const intent={...draft,tasks:[{kind:'compass-wheel',parameters:spec.parameters,actionId:spec.actionId}]};
 assert.deepEqual(unifiedDraft(h),intent);
 assert.equal(writes(h).length,existingWrites);
 const pending=h.node('wf-unified-prepare').click();await tick();
 assertMutation(h.pending('/api/workflows/prepare'),'/api/workflows/prepare',intent);
 const result=compileUnifiedExecution(intent,{modules:GAMEPLAY_MODULES});
 h.respond('/api/workflows/prepare',{accountId:'A',...result});await pending;
 const action=conditionGraph(h).nodes.find(row=>row.type==='ACTION');
 assert.deepEqual(action.selection,{actionId:spec.actionId});assert.deepEqual(action.parameters,spec.parameters);
 assert.deepEqual(conditionGraph(h).budget,draft.budget);
 assert.equal(writes(h,'/api/operations/authorize').length,0);
 h.run("selectAccount('B')");await button.click();assert.equal(h.node('wf-unified-intent').value,'');
});

for(const actionType of ['speedExplore','speedCase'])test('museum page submits only the selected current targets for '+actionType,async()=>{
 const h=await boot(),duration=300000;
 const isCase=actionType==='speedCase';
 const rows=[1,2].map(id=>{
  const costs=[{id:isCase?'加速器':'博物馆加速',num:1}],target=isCase?{exhibitionId:1,caseIndex:id}:{stageId:id};
  return {actionType,actionId:'museum:'+actionType+':'+id,target,costs,endTime:1800005400,
   parameters:{...target,useNum:1,payment:'ITEM',expectedSpeedHash:String(id).repeat(64)},
   budgetClaims:{resources:costs,quotas:[],uids:[isCase?{type:'museum-case',id:'1:'+id}:{type:'museum-explore-stage',id:String(id)}]}};
 });
 const snapshot={accountId:'A',module:'museum',csrfToken:'synthetic-csrf-A',config:{enabled:true,exploration:true},status:{running:false,blocked:false},view:{candidates:rows.map(row=>({...row,parameters:{...row.target,payment:'ITEM',useNum:1}})),explorationSelection:{stages:isCase?[]:rows.map(row=>({...row.target,status:'EXPLORING'}))},exhibitionSelection:{exhibitions:isCase?[{exhibitionId:1,level:1,cases:rows.map(row=>({caseIndex:row.target.caseIndex,upgradeFinishTime:row.endTime,level:1}))}]:[],antiques:[]},speedPreparation:rows}};
 const loading=h.node('gp-museum-load').click();
 h.respond('/api/gameplay',snapshot,{module:'museum'});await loading;
 const fields=()=>descendants(h.node('gp-museum-facts'));
 const control=key=>fields().find(row=>row.dataset[key]);
 const mode=control('museumBusinessMode');mode.value=isCase?'case-speed-batch':'explore-speed-batch';mode.onchange();
 control('museumBusinessQuantity').value='1';await control('museumBusinessPrepare').click();
 assert.deepEqual(JSON.parse(h.node('gp-museum-parameters').value),{payment:'ITEM',useNum:1});
 const survey=h.node('gp-museum-survey').click();
 h.respond('/api/gameplay/survey',structuredClone(snapshot));await survey;
 const batchMode=control('museumGrowthBatchMode');batchMode.value=actionType;batchMode.onchange();
 const picks=fields().filter(row=>row.dataset.growthBatchTarget);
 assert.equal(picks.length,2);assert.ok(picks.every(row=>!row.disabled));assert.ok(picks.every(row=>!row.checked));
 picks[1].checked=true;picks[1].onchange();
 const pending=control('growthBatchPrepare').click();
 const route='/api/gameplay/museum/growth/prepare';
 const payload={actionType,targets:[rows[1].parameters],maxDurationMs:duration};
 assertMutation(h.pending(route),route,payload);
 const {target,costs,budgetClaims,parameters,actionId}=rows[1],selection={actionId};
 const nodes=[{id:'start',type:'START'},{id:'grow-0',type:'ACTION',module:'museum',parameters,selection},{id:'verify-0',type:'VERIFY',module:'museum'},{id:'stop',type:'STOP'}];
 const graph={version:1,id:'synthetic-museum-speed',name:'synthetic museum',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget:budgetClaims,runPolicy:{maxDurationMs:duration,maxActions:1,modules:['museum']}};
 h.respond(route,{...payload,accountId:'A',resumable:false,requiresFreshPlan:true,requiresAuthorization:true,steps:[{target,costs,budgetClaims,parameters,selection}],budget:budgetClaims,graph});await pending;
 assert.deepEqual(conditionGraph(h),graph);
 assert.equal(writes(h,'/api/operations/authorize').length,0);
});

test('cross-ship cargo page loads the selected slots with one checked budget',async()=>{
 const spec={module:'fleet',actionId:'fleet:cargoFill:1:1',actionType:'cargoFill',parameters:{shipIndex:1,cargoIndex:1},costs:[{id:'wood',num:2}],facts:{cargo:{inventoryReliable:true,ships:[1,2].map(shipIndex=>({
  shipIndex,reliable:true,status:0,preparationHash:String(shipIndex).repeat(64),
  slots:[{cargoIndex:1,id:'wood',required:2,have:4,missing:0,filled:false,reliable:true}]
 }))}}};
 const h=await boot(),read=h.node('gp-fleet-load').click();
 const response=data(spec);response.config={enabled:true,cargoFill:true};
 h.respond('/api/gameplay',response,{module:'fleet'});await read;
 const controls=descendants(h.node('gp-fleet-cargo')),checks=controls.filter(node=>node.dataset.cargoFillIndex),
  duration=controls.find(node=>node.dataset.cargoFillBatchDuration),prepare=controls.find(node=>node.dataset.cargoFillBatchPrepare);
 assert.equal(checks.length,2);assert.ok(prepare);assert.ok(checks.every(check=>!check.checked));
 duration.value='60';await prepare.click();assert.equal(writes(h).length,0);
 checks.forEach(check=>{check.checked=true;check.onchange();});
 const loads=spec.facts.cargo.ships.map(({shipIndex,preparationHash})=>({shipIndex,cargoIndices:[1],expectedCargoHash:preparationHash}));
 const payload={action:'fill',loads,maxDurationMs:60000},route='/api/gameplay/fleet/cargo/prepare';
 const budget={resources:[{id:'wood',num:4}],quotas:[],uids:[]};
 const nodes=[{id:'start',type:'START'}],steps=loads.map(({shipIndex,expectedCargoHash})=>{
  const parameters={shipIndex,cargoIndex:1,expectedCargoHash},suffix=shipIndex+'-1';
  nodes.push({id:'fill-'+suffix,type:'ACTION',module:'fleet',parameters,selection:{actionId:'fleet:cargoFill:'+shipIndex+':1'}},
   {id:'verify-'+suffix,type:'VERIFY',module:'fleet'});
  return {shipIndex,cargoIndex:1,parameters,costs:[{id:'wood',num:2}]};
 });nodes.push({id:'stop',type:'STOP'});
 const graph={version:1,id:'cargo-fill-ships-test',name:'Cross-ship',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),
  budget,runPolicy:{maxDurationMs:60000,maxActions:2,modules:['fleet']}};
 const reply={...payload,accountId:'A',steps,budget,graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true};
 const original=h.node('wf-json').value,bad=structuredClone(reply);bad.budget.resources[0].num=3;
 let pending=prepare.click();assertMutation(h.pending(route),route,payload);h.respond(route,bad);await pending;
 assert.equal(h.node('wf-json').value,original);
 pending=prepare.click();assertMutation(h.pending(route),route,payload);h.respond(route,reply);await pending;
 assert.deepEqual(JSON.parse(h.node('wf-json').value),graph);
 assert.equal(writes(h).length,2);assert.equal(h.confirmations.length,0);
});


for(const mode of ['success','reward-tamper','budget-tamper','late-selection'])test('arrived Cargo page preserves selected voyages and rejects '+mode,async()=>{
 const ships=[1,2].map(shipIndex=>({shipIndex,reliable:true,status:2,arriveTime:100,preparationHash:String(shipIndex).repeat(64),
  claimActionId:'fleet:cargoClaim:'+shipIndex,reward:[{type:0,id:'badge',num:1}],slots:[]}));
 const spec={module:'fleet',actionId:ships[0].claimActionId,actionType:'cargoClaim',parameters:{shipIndex:1},costs:[],facts:{cargo:{inventoryReliable:true,ships}}};
 const h=await boot(),read=h.node('gp-fleet-load').click(),response=data(spec);response.config={enabled:true,cargoClaim:true};
 response.view.candidates=ships.map(ship=>({...candidate({...spec,actionId:ship.claimActionId,parameters:{shipIndex:ship.shipIndex}}),decision:'READY'}));
 h.respond('/api/gameplay',response,{module:'fleet'});await read;
 const controls=descendants(h.node('gp-fleet-cargo')),checks=controls.filter(node=>node.dataset.cargoClaimTarget),
  duration=controls.find(node=>node.dataset.cargoClaimDuration),prepare=controls.find(node=>node.dataset.cargoClaimPrepare);
 assert.equal(checks.length,2);assert.ok(checks.every(node=>!node.checked&&!node.disabled));
 await prepare.click();assert.equal(writes(h).length,0);
 checks.forEach(node=>{node.checked=true;node.onchange();});duration.value='60';duration.oninput();
 const claims=ships.map(({shipIndex,preparationHash})=>({shipIndex,expectedCargoHash:preparationHash}));
 const payload={action:'claim',claims,maxDurationMs:60000},route='/api/gameplay/fleet/cargo/prepare';
 const budget={resources:[],quotas:[],uids:[]},nodes=[{id:'start',type:'START'}];
 const steps=claims.map((parameters,i)=>{const selection={actionId:ships[i].claimActionId};
  nodes.push({id:'claim-'+i,type:'ACTION',module:'fleet',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'fleet'});
  return {parameters,selection,costs:[],rewards:ships[i].reward};
 });nodes.push({id:'stop',type:'STOP'});
 const graph={version:1,id:'cargo-claims',name:'Cargo claims',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),
  budget,runPolicy:{maxDurationMs:60000,maxActions:2,modules:['fleet']}};
 const reply={...payload,accountId:'A',steps,budget,graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true};
 const original=h.node('wf-json').value,pending=prepare.click();assertMutation(h.pending(route),route,payload);
 if(mode==='reward-tamper')reply.steps[1].rewards=[{type:0,id:'badge',num:2}];
 if(mode==='budget-tamper')reply.graph.budget={resources:[{id:'badge',num:1}],quotas:[],uids:[]};
 if(mode==='late-selection'){checks[1].checked=false;checks[1].onchange();}
 h.respond(route,reply);await pending;
 if(mode==='success')assert.deepEqual(JSON.parse(h.node('wf-json').value),graph);
 else assert.equal(h.node('wf-json').value,original);
 assert.equal(writes(h,'/api/operations/authorize').length,0);
 assert.equal(writes(h,'/api/operations/execute').length,0);
 assert.equal(h.confirmations.length,0);
});


test('arrived Cargo page accepts the full 24 selected voyages without granting permission',async()=>{
 const ships=Array.from({length:24},(_,i)=>({shipIndex:i+1,reliable:true,status:2,arriveTime:100,
  preparationHash:(i+1).toString(16).padStart(64,'0'),claimActionId:'fleet:cargoClaim:'+(i+1),
  reward:[{type:0,id:'badge',num:1}],slots:[]}));
 const spec={module:'fleet',actionId:ships[0].claimActionId,actionType:'cargoClaim',parameters:{shipIndex:1},costs:[],facts:{cargo:{inventoryReliable:true,ships}}};
 const h=await boot(),read=h.node('gp-fleet-load').click(),response=data(spec);response.config={enabled:true,cargoClaim:true};
 response.view.candidates=ships.map(ship=>({...candidate({...spec,actionId:ship.claimActionId,parameters:{shipIndex:ship.shipIndex}}),decision:'READY'}));
 h.respond('/api/gameplay',response,{module:'fleet'});await read;
 const controls=descendants(h.node('gp-fleet-cargo')),checks=controls.filter(node=>node.dataset.cargoClaimTarget),
  duration=controls.find(node=>node.dataset.cargoClaimDuration),prepare=controls.find(node=>node.dataset.cargoClaimPrepare);
 assert.equal(checks.length,24);assert.ok(checks.every(node=>!node.checked&&!node.disabled));
 checks.forEach(node=>{node.checked=true;node.onchange();});duration.value='60';duration.oninput();
 const claims=ships.map(({shipIndex,preparationHash})=>({shipIndex,expectedCargoHash:preparationHash}));
 const payload={action:'claim',claims,maxDurationMs:60000},route='/api/gameplay/fleet/cargo/prepare',nodes=[{id:'start',type:'START'}];
 const steps=claims.map((parameters,i)=>{const selection={actionId:ships[i].claimActionId};
  nodes.push({id:'claim-'+i,type:'ACTION',module:'fleet',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'fleet'});
  return {parameters,selection,costs:[],rewards:ships[i].reward};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:[]};
 const graph={version:1,id:'cargo-24',name:'24 Cargo claims',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),
  budget,runPolicy:{maxDurationMs:60000,maxActions:24,modules:['fleet']}};
 const pending=prepare.click();assertMutation(h.pending(route),route,payload);
 h.respond(route,{...payload,accountId:'A',steps,budget,graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true});await pending;
 assert.deepEqual(JSON.parse(h.node('wf-json').value),graph);
 assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 assert.equal(h.confirmations.length,0);
});


for(const mode of ['success','account-tamper','guild-tamper','state-tamper','cost-tamper','budget-tamper','graph-tamper','late-selection','late-duration','late-editor','late-account'])
 test('alliance tech page preserves original selection and rejects '+mode,async()=>{
 const techState={season:1,stage:1},technologies=[10101,10102].map((techId,i)=>({techId,name:'科技'+techId,level:0,targetLevel:1,
  parameters:{techId,targetLevel:1},selection:{actionId:'alliance:upgradeTech:'+techId},
  costs:[{id:i?'联盟职级科技点':'公会科技点',num:i?10:20}],blockedReason:null}));
 const spec={module:'alliance',actionId:'alliance-tech-synthetic',actionType:'upgradeTech',parameters:{},costs:[],
  facts:{guildId:'10',playerId:'1',techState,technologies}};
 const h=await boot(),read=h.node('gp-alliance-load').click(),response=data(spec);response.config={enabled:true,tech:true};
 h.respond('/api/gameplay',response,{module:'alliance'});await read;
 const controls=descendants(h.node('gp-alliance-facts')),checks=controls.filter(node=>node.dataset.allianceTechTarget),
  duration=controls.find(node=>node.dataset.allianceTechDuration),prepare=controls.find(node=>node.dataset.allianceTechPrepare);
 assert.equal(checks.length,2);assert.ok(checks.every(node=>!node.checked&&!node.disabled));
 await prepare.click();assert.equal(writes(h).length,0);
 checks.forEach(node=>{node.checked=true;node.onchange();});duration.value='60';duration.oninput();
 const targets=technologies.map(row=>row.parameters),payload={targets,maxDurationMs:60000},nodes=[{id:'start',type:'START'}];
 const steps=technologies.map((row,i)=>{const {parameters,selection,costs}=row;
  nodes.push({id:'tech-'+i,type:'ACTION',module:'alliance',parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'alliance'});
  return {parameters,selection,target:parameters,costs,budgetClaims:{resources:costs,quotas:[],uids:[]}};
 });nodes.push({id:'stop',type:'STOP'});
 const budget={resources:[{id:'公会科技点',num:20},{id:'联盟职级科技点',num:10}],quotas:[],uids:[]};
 const graph={version:1,id:'alliance-tech-test',name:'Alliance tech',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),
  budget,runPolicy:{maxDurationMs:60000,maxActions:2,modules:['alliance']}};
 const reply=structuredClone({...payload,accountId:'A',guildId:'10',playerId:'1',techState,steps,budget,graph,
  resumable:false,requiresFreshPlan:true,requiresAuthorization:true});
 const pending=prepare.click(),route='/api/gameplay/alliance/tech/prepare';assertMutation(h.pending(route),route,payload);
 if(mode==='account-tamper')reply.accountId='B';
 if(mode==='guild-tamper')reply.guildId='11';
 if(mode==='state-tamper')reply.techState.stage=2;
 if(mode==='cost-tamper')reply.steps[0].costs[0].num=19;
 if(mode==='budget-tamper')reply.graph.budget.resources[0].num=19;
 if(mode==='graph-tamper')reply.graph.nodes[1].parameters.techId=999;
 if(mode==='late-selection')checks[1].checked=false;
 if(mode==='late-duration')duration.value='61';
 if(mode==='late-editor')h.node('wf-json').value='edited';
 if(mode==='late-account')h.run("selectAccount('B');selectAccount('A');");
 const before=h.node('wf-json').value;h.respond(route,reply);await pending;
 if(mode==='success')assert.deepEqual(JSON.parse(h.node('wf-json').value),graph);else assert.equal(h.node('wf-json').value,before);
 assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);
 assert.equal(h.confirmations.length,0);
});


for(const action of ['feed','level'])for(const mode of ['success','cost-tamper','uid-tamper','late-selection','late-editor','late-account'])
 test('Pet batch PAGE '+action+' preserves original targets and rejects '+mode,async()=>{
 const rows=Array.from({length:2},(_,i)=>{
  const parameters=action==='feed'?{action,buildingId:'1宠物培育室',jobIdx:i}:{action,buildingId:(i+1)+'宠物',uid:(9007199254740993n+BigInt(i)).toString()};
  const target=action==='feed'?{...parameters,petId:'蓝宠物1',startTime:900+i,finishTime:2000+i}:{...parameters,level:1};
  const costs=action==='feed'?[{id:'粗铁',num:4},{id:'鱼肠线',num:12}]:[{id:'宠物经验',num:1300}];
  const uids=action==='feed'?[{type:'pet-job',id:parameters.buildingId+':'+i+':'+(900+i)}]:[{type:'pet',id:parameters.uid},{type:'pet-serving-building',id:parameters.buildingId}];
  return {module:'pet',actionId:'pet:'+action+':'+i,actionType:action.toUpperCase(),parameters,target,costs,
   budgetClaims:{resources:costs,quotas:[],uids},executable:true,blockedReason:null,label:'synthetic pet'};
 });
 const spec={module:'pet',actionId:rows[0].actionId,actionType:rows[0].actionType,parameters:rows[0].parameters,costs:rows[0].costs,facts:{rooms:[],pets:[],serving:[]}};
 const h=await boot(),read=h.node('gp-pet-load').click(),response=data(spec);response.view.candidates=rows;
 h.respond('/api/gameplay',response,{module:'pet'});await read;
 const controls=descendants(h.node('gp-pet-facts')),checks=controls.filter(node=>node.dataset.growthBatchTarget),
  duration=controls.find(node=>node.dataset.growthBatchDuration),prepare=controls.find(node=>node.dataset.growthBatchPrepare);
 assert.equal(checks.length,2);assert.ok(checks.every(node=>!node.checked&&!node.disabled));
 await prepare.click();assert.equal(writes(h).length,0);
 checks.forEach(node=>{node.checked=true;node.onchange();});duration.value='60';duration.oninput();
 const targets=rows.map(row=>row.parameters),payload={targets,maxDurationMs:60000},nodes=[{id:'start',type:'START'}];
 const steps=rows.map((row,i)=>{const selection={actionId:row.actionId};
  nodes.push({id:'grow-'+i,type:'ACTION',module:'pet',parameters:row.parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'pet'});
  return {parameters:row.parameters,selection,target:row.target,costs:row.costs,budgetClaims:row.budgetClaims};
 });nodes.push({id:'stop',type:'STOP'});
 const budget={resources:rows[0].costs.map(row=>({...row,num:row.num*2})),quotas:[],uids:rows.flatMap(row=>row.budgetClaims.uids)};
 const graph={version:1,id:'pet-growth-test',name:'Pet growth',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),
  budget,runPolicy:{maxDurationMs:60000,maxActions:2,modules:['pet']}};
 const reply=structuredClone({...payload,accountId:'A',steps,budget,graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true});
 const pending=prepare.click(),route='/api/gameplay/pet/growth/prepare';assertMutation(h.pending(route),route,payload);
 if(mode==='cost-tamper')reply.steps[0].costs[0].num++;
 if(mode==='uid-tamper')reply.graph.budget.uids[0].id='other';
 if(mode==='late-selection')checks[1].checked=false;
 if(mode==='late-editor')h.node('wf-json').value='edited';
 if(mode==='late-account')h.run("selectAccount('B');selectAccount('A');");
 const before=h.node('wf-json').value;h.respond(route,reply);await pending;
 if(mode==='success')assert.deepEqual(JSON.parse(h.node('wf-json').value),graph);else assert.equal(h.node('wf-json').value,before);
 assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(h.confirmations.length,0);
});


for(const action of ['feed','level'])test('Pet batch PAGE '+action+' accepts 24 explicit targets without authorization',async()=>{
 const rows=Array.from({length:24},(_,i)=>{
  const parameters=action==='feed'?{action,buildingId:'1宠物培育室',jobIdx:i}:{action,buildingId:(i+1)+'宠物',uid:(9007199254740993n+BigInt(i)).toString()};
  const target=action==='feed'?{...parameters,petId:'蓝宠物1',startTime:900+i,finishTime:2000+i}:{...parameters,level:1};
  const costs=action==='feed'?[{id:'粗铁',num:4},{id:'鱼肠线',num:12}]:[{id:'宠物经验',num:1300}];
  const uids=action==='feed'?[{type:'pet-job',id:parameters.buildingId+':'+i+':'+(900+i)}]:[{type:'pet',id:parameters.uid},{type:'pet-serving-building',id:parameters.buildingId}];
  return {module:'pet',actionId:'pet:'+action+':'+i,actionType:action.toUpperCase(),parameters,target,costs,
   budgetClaims:{resources:costs,quotas:[],uids},executable:true,blockedReason:null,label:'synthetic pet'};
 });
 const spec={module:'pet',actionId:rows[0].actionId,actionType:rows[0].actionType,parameters:rows[0].parameters,costs:rows[0].costs,facts:{rooms:[],pets:[],serving:[]}};
 const h=await boot(),read=h.node('gp-pet-load').click(),response=data(spec);response.view.candidates=rows;
 h.respond('/api/gameplay',response,{module:'pet'});await read;
 const controls=descendants(h.node('gp-pet-facts')),checks=controls.filter(node=>node.dataset.growthBatchTarget),
  duration=controls.find(node=>node.dataset.growthBatchDuration),prepare=controls.find(node=>node.dataset.growthBatchPrepare);
 assert.equal(checks.length,24);assert.ok(checks.every(node=>!node.checked&&!node.disabled));
 checks.forEach(node=>{node.checked=true;node.onchange();});duration.value='180';duration.oninput();
 const targets=rows.map(row=>row.parameters),payload={targets,maxDurationMs:180000},nodes=[{id:'start',type:'START'}];
 const steps=rows.map((row,i)=>{const selection={actionId:row.actionId};
  nodes.push({id:'grow-'+i,type:'ACTION',module:'pet',parameters:row.parameters,selection},{id:'verify-'+i,type:'VERIFY',module:'pet'});
  return {parameters:row.parameters,selection,target:row.target,costs:row.costs,budgetClaims:row.budgetClaims};
 });nodes.push({id:'stop',type:'STOP'});
 const budget={resources:rows[0].costs.map(row=>({...row,num:row.num*24})),quotas:[],uids:rows.flatMap(row=>row.budgetClaims.uids)};
 const graph={version:1,id:'pet-growth-24',name:'Pet growth',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),
  budget,runPolicy:{maxDurationMs:180000,maxActions:24,modules:['pet']}};
 const pending=prepare.click(),route='/api/gameplay/pet/growth/prepare';assertMutation(h.pending(route),route,payload);
 h.respond(route,{...payload,accountId:'A',steps,budget,graph,resumable:false,requiresFreshPlan:true,requiresAuthorization:true});await pending;
 assert.deepEqual(JSON.parse(h.node('wf-json').value),graph);
 assert.equal(writes(h,'/api/operations/authorize').length,0);assert.equal(writes(h,'/api/operations/execute').length,0);assert.equal(h.confirmations.length,0);
});


test('every gameplay page loads an unsurveyed null view without dispatching a mutation',async()=>{
 const h=await boot(),modules=Array.from(h.run('GP_MODULES')),failures=[];
 for(const module of modules){
  const loading=h.node('gp-'+module+'-load').click();
  h.respond('/api/gameplay',{accountId:'A',module,csrfToken:'synthetic-csrf-A',config:{enabled:true},status:{running:false,blocked:false},view:null},{module});
  await loading;const hint=h.node('gp-'+module+'-hint').textContent;
  if(hint.includes('读取失败'))failures.push(module+': '+hint);
 }
 assert.deepEqual(failures,[]);assert.equal(writes(h).length,0);
});

test('Tasks candidate entry preserves original growth, farm and material targets and compiles through real registered Functions',async()=>{
 for(const spec of [cases.find(s=>s.module==='pet'),cases.find(s=>s.actionType==='FRAGMENT-EXCHANGE'),cases.find(s=>s.module==='material-packs'),cases.find(s=>s.module==='farm'&&s.actionType==='PLANT'),cases.find(s=>s.module==='equipment-growth')]){
  const h=await loaded(spec),before=h.requests.length;
  const button=descendants(h.node('gp-'+spec.module+'-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId);assert.ok(button);assert.equal(button.disabled,false);button.click();
  const draft=unifiedDraft(h);assert.equal(draft.entry,'tasks');assert.deepEqual(draft.tasks,[{kind:spec.module,parameters:spec.parameters,actionId:spec.actionId}]);assert.deepEqual(draft.budget,{resources:[],quotas:[],uids:[]});
  const compiled=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES});assert.deepEqual(compiled.graph.nodes.find(n=>n.type==='ACTION').selection,{actionId:spec.actionId});
  assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
  const source=h.node('wf-unified-intent').value;h.node('gp-'+spec.module+'-parameters').oninput();button.click();assert.equal(h.node('wf-unified-intent').value,source);
 }
});

test('grouped task rewards professional page accumulates explicit source groups, prepares original graph and clears account drafts',async()=>{
 const row=kind=>({parameters:{kind,taskId:kind==='main'?1:1001},rewards:[{id:'塑料',num:1}],budgetClaims:{resources:[],quotas:[],uids:[{type:'task-reward',id:kind+':'+(kind==='main'?1:1001)}]},costs:[],executable:true,blockedReason:null});
 const spec=kind=>({module:'task-rewards',parameters:row(kind).parameters,actionId:'task-rewards:'+kind,actionType:'CLAIM',costs:[],blockedReason:'UNKNOWN',facts:{rewardClosing:{targets:[row(kind)]}}}),main=spec('main'),h=await loaded(main);
 const controls=key=>descendants(h.node('gp-task-rewards-facts')).filter(n=>n.dataset[key]);
 controls('taskRewardClosingTarget')[0].checked=true;controls('taskRewardClosingTarget')[0].onchange();controls('taskRewardGroupAdd')[0].click();assert.match(h.node('gp-task-rewards-facts').textContent,/main 1/);
 h.node('gp-task-rewards-parameters').value=JSON.stringify({kind:'achievement',taskId:1001});h.node('gp-task-rewards-parameters').oninput();const survey=h.node('gp-task-rewards-survey').click();await tick();h.respond('/api/gameplay/survey',data(spec('achievement')));await survey;
 controls('taskRewardClosingTarget')[0].checked=true;controls('taskRewardClosingTarget')[0].onchange();controls('taskRewardGroupAdd')[0].click();assert.match(h.node('gp-task-rewards-facts').textContent,/achievement 1001/);
 const before=writes(h).length,prepare=controls('taskRewardGroupsPrepare')[0],pending=prepare.click();await tick();const request=h.pending('/api/gameplay/task-rewards/closing/prepare');assert.ok(request);const payload=JSON.parse(request.options.body);delete payload.accountId;delete payload.csrfToken;assert.deepEqual(payload.groups,[[row('main').parameters],[row('achievement').parameters]]);
 const make=targets=>{const steps=targets.map(p=>({...row(p.kind),parameters:p,selection:{unique:true}})),nodes=[{id:'start',type:'START'},...steps.flatMap((step,i)=>[{id:'reward-'+i,type:'ACTION',module:'task-rewards',parameters:step.parameters,selection:step.selection},{id:'verify-'+i,type:'VERIFY',module:'task-rewards'}]),{id:'stop',type:'STOP'}],budget={resources:[],quotas:[],uids:steps.flatMap(s=>s.budgetClaims.uids)};return {targets,maxDurationMs:payload.maxDurationMs,steps,budget,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,graph:{version:1,id:'synthetic-rewards',name:'synthetic rewards',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:payload.maxDurationMs,maxActions:steps.length,modules:['task-rewards']}}};};
 const combined=make(payload.groups.flat()),parts=payload.groups.map(make);delete combined.targets;h.respond('/api/gameplay/task-rewards/closing/prepare',{...combined,accountId:'A',groups:payload.groups,parts,limitation:'synthetic grouped preparation'});await pending;
 assert.equal(JSON.parse(h.node('wf-json').value).nodes.length,6);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,before+1);assert.equal(h.node('wf-authorize').disabled,true);
 h.run("selectAccount('B')");const count=writes(h).length;prepare.click();assert.equal(writes(h).length,count);assert.equal(h.node('gp-task-rewards-facts').textContent,'');
});

test('daily and free gift reward groups professional page imports original daily selection and exact free pack into one checklist',async()=>{
 const target=(parameters,reward,type,id)=>({parameters,rewards:[{id:reward,num:1}],budgetClaims:{resources:[],quotas:[],uids:[{type,id}]},costs:[],executable:true,blockedReason:null}),day=target({kind:'daily',taskId:1001,expectedResetTime:2000},'EXP','task-reward','daily:2000:1001'),tier=target({kind:'daily-activity',tierId:1,expectedResetTime:2000},'加速器','daily-activity-reward','2000:1'),gift=target({kind:'daily-gift',packId:'赠礼'},'RUBY','free-daily-gift','synthetic-gift');
 const spec=(parameters,facts)=>({module:'task-rewards',parameters,facts,actionId:'synthetic:'+parameters.kind,actionType:'CLAIM',costs:[],blockedReason:'UNKNOWN'}),daily=spec(day.parameters,{dailyClosing:{status:'OBSERVED',expectedResetTime:2000,targets:[day,tier]}}),h=await loaded(daily),controls=key=>descendants(h.node('gp-task-rewards-facts')).filter(n=>n.dataset[key]);
 for(const check of controls('dailyClosingTarget')){check.checked=true;check.onchange();}controls('dailyRewardGroupAdd')[0].click();assert.match(h.node('gp-task-rewards-facts').textContent,/daily 1001/);assert.match(h.node('gp-task-rewards-facts').textContent,/daily-activity 1/);
 h.node('gp-task-rewards-parameters').value=JSON.stringify(gift.parameters);h.node('gp-task-rewards-parameters').oninput();const survey=h.node('gp-task-rewards-survey').click();await tick();h.respond('/api/gameplay/survey',data(spec(gift.parameters,{rewardClosing:{targets:[gift]}})));await survey;
 const check=controls('taskRewardClosingTarget')[0];assert.equal(check.dataset.taskRewardClosingTarget,'daily-gift:赠礼');check.checked=true;check.onchange();controls('taskRewardGroupAdd')[0].click();
 const before=writes(h).length,pending=controls('taskRewardGroupsPrepare')[0].click();await tick();const req=h.pending('/api/gameplay/task-rewards/closing/prepare');assert.ok(req);const payload=JSON.parse(req.options.body);assert.deepEqual(payload.groups,[[day.parameters,tier.parameters],[gift.parameters]]);
 const part=rows=>{const steps=rows.map(row=>({...row,selection:{unique:true}})),nodes=[{id:'start',type:'START'},...steps.flatMap((step,i)=>[{id:'reward-'+i,type:'ACTION',module:'task-rewards',parameters:step.parameters,selection:step.selection},{id:'verify-'+i,type:'VERIFY',module:'task-rewards'}]),{id:'stop',type:'STOP'}],budget={resources:[],quotas:[],uids:steps.flatMap(s=>s.budgetClaims.uids)};return {targets:rows.map(row=>row.parameters),maxDurationMs:payload.maxDurationMs,steps,budget,resumable:false,requiresFreshPlan:true,requiresAuthorization:true,graph:{version:1,id:'synthetic-daily-gifts',name:'synthetic daily gifts',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:payload.maxDurationMs,maxActions:steps.length,modules:['task-rewards']}}};};
 const result=part([day,tier,gift]);delete result.targets;h.respond('/api/gameplay/task-rewards/closing/prepare',{...result,accountId:'A',groups:payload.groups,parts:[part([day,tier]),part([gift])],limitation:'synthetic fixed-day/free-pack grouping'});await pending;
 assert.equal(JSON.parse(h.node('wf-json').value).nodes.length,8);assert.equal(h.confirmations.length,0);assert.equal(writes(h).length,before+1);assert.equal(h.node('wf-authorize').disabled,true);
});

test('factory auto stop professional view selects exact original factory parameters and compiles the existing Tasks node without execution',async()=>{
 const spec={module:'production',actionId:'city:stopAutoProduce:1%E6%9D%90%E6%96%99%E5%8E%82',actionType:'stopAutoProduce',parameters:{buildingId:'1材料厂',action:'stopAutoProduce',expectedStopHash:'a'.repeat(64)},target:{buildingId:'1材料厂'},label:'停止本厂自动排产，保留既有队列',costs:[],blockedReason:'SOURCE_UNKNOWN',facts:{factories:[{buildingId:'1材料厂',type:'材料厂',level:1,status:'AUTO',autoProductId:'布匹',queue:[{idx:0,productId:'布匹',finishTime:2000000000}],finishedProducts:[],recipes:[],reliable:true}],stockReliable:true,stock:[{id:'木材',num:4}]}};
 const h=await loaded(spec),controls=()=>descendants(h.node('gp-production-facts')),factory=controls().find(n=>n.dataset.productionFactory);assert.ok(factory);factory.value='1材料厂';factory.onchange();const select=controls().find(n=>n.dataset.productionFactoryAction===spec.actionId);assert.ok(select);assert.equal(select.disabled,false);select.click();assert.deepEqual(JSON.parse(h.node('gp-production-parameters').value),spec.parameters);assert.equal(h.confirmations.length,0);
 const survey=h.node('gp-production-survey').click();await tick();h.respond('/api/gameplay/survey',data(spec));await survey;const add=descendants(h.node('gp-production-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId);assert.ok(add);assert.equal(add.disabled,false);add.click();const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'production',parameters:spec.parameters,actionId:spec.actionId}]);const action=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION');assert.deepEqual(action.parameters,spec.parameters);assert.equal(h.requests.some(r=>r.url.includes('/execute')||r.url.includes('/authorize')),false);assert.equal(h.confirmations.length,0);
});


test('fleet repair item professional control prepares exact owned quantity and reuses original Tasks candidate',async()=>{
 const parameters={action:'speed-repair',buildingId:'repair-fleet',useNum:2,expectedSpeedHash:'a'.repeat(64)},spec={module:'fleet',actionId:'fleet:speedUpRepair:repair-fleet',actionType:'speedUpRepair',parameters,target:{buildingId:'repair-fleet'},label:'自有道具维修加速',costs:[{id:'加速器',num:2}],blockedReason:'SOURCE_UNKNOWN',facts:{repairAcceleration:[{buildingId:'repair-fleet',maxUseNum:2,endTs:2000,expectedSpeedHash:parameters.expectedSpeedHash}],fleets:[],cities:[],ships:[],blocked:[]}};
 const h=await loaded(spec),controls=()=>descendants(h.node('gp-fleet-operations')),num=controls().find(n=>n.dataset.fleetRepairSpeedCount);assert.ok(num);assert.equal(num.value,'');num.value='2';num.oninput();assert.equal(h.node('gp-fleet-authorize').disabled,true);const apply=controls().find(n=>n.dataset.fleetRepairSpeedTarget);assert.equal(apply.disabled,false);apply.click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),parameters);assert.equal(h.confirmations.length,0);
 const survey=h.node('gp-fleet-survey').click();await tick();h.respond('/api/gameplay/survey',data(spec));await survey;const add=descendants(h.node('gp-fleet-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId);assert.ok(add);add.click();const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'fleet',parameters,actionId:spec.actionId}]);const action=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION');assert.deepEqual(action.parameters,parameters);assert.equal(h.requests.some(r=>r.url.includes('/execute')||r.url.includes('/authorize')),false);
});


test('cargo item professional control prepares exact owned quantity and reuses original port and Tasks candidate',async()=>{
 const parameters={action:'speed-cargo',shipIndex:1,useNum:2,expectedSpeedHash:'b'.repeat(64)},spec={module:'fleet',actionId:'fleet:speedUpCargo:1',actionType:'speedUpCargo',parameters,target:{shipIndex:1},label:'自有道具货船加速',costs:[{id:'加速器',num:2}],blockedReason:'SOURCE_UNKNOWN',facts:{cargoAcceleration:[{shipIndex:1,maxUseNum:2,arriveTime:2000,expectedSpeedHash:parameters.expectedSpeedHash}],cargo:{source:'CargoShipsResponse',reliable:true,inventoryReliable:true,ships:[{shipIndex:1,status:1,statusText:'航行中',arriveTime:2000,slots:[],reward:[{type:0,id:'徽章',num:1}]}],shortages:[],notes:[]},fleets:[],cities:[],ships:[],blocked:[]}};
 const h=await loaded(spec),controls=()=>descendants(h.node('gp-fleet-cargo')),num=controls().find(n=>n.dataset.cargoSpeedCount);assert.ok(num);assert.equal(num.value,'');num.value='2';num.oninput();assert.equal(h.node('gp-fleet-authorize').disabled,true);const apply=controls().find(n=>n.dataset.cargoSpeedTarget);assert.equal(apply.disabled,false);apply.click();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),parameters);assert.equal(h.confirmations.length,0);
 const survey=h.node('gp-fleet-survey').click();await tick();h.respond('/api/gameplay/survey',data(spec));await survey;const choose=controls().find(n=>n.dataset.cargoAction===spec.actionId);assert.ok(choose);assert.equal(choose.disabled,false);choose.click();const add=descendants(h.node('gp-fleet-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId);assert.ok(add);add.click();const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'fleet',parameters,actionId:spec.actionId}]);const action=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION');assert.deepEqual(action.parameters,parameters);assert.equal(h.requests.some(r=>r.url.includes('/execute')||r.url.includes('/authorize')),false);
});


test('compass score professional control prepares exact reached range and original Tasks declaration without spinning',async()=>{
 const activityId='9007199254740993',parameters={action:'claim',activityId,expectedScore:800,expectedClaimedId:0,expectedTierId:3},spec={module:'compass-wheel',actionId:'compass-wheel:'+'c'.repeat(64),actionType:'CLAIM',parameters,target:{activityId,fromClaimedId:0,toClaimedId:3},label:'罗盘累计积分奖',costs:[],blockedReason:'SOURCE_UNKNOWN',facts:{window:{activityId},scoreClaim:{parameters,tiers:[{id:3,score:800,rewards:[['精铁',4000]]}],rewards:[{id:'精铁',num:4000}],readOnly:true,requiresFreshSurvey:true},compass:{score:800,claimedId:0,times:10},activitySelections:[]}};
 const h=await loaded(spec),controls=()=>descendants(h.node('gp-compass-wheel-facts')),prepare=controls().find(n=>n.dataset.compassClaimPrepare);assert.ok(prepare);assert.equal(prepare.disabled,false);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-compass-wheel-parameters').value),parameters);assert.equal(h.confirmations.length,0);
 const survey=h.node('gp-compass-wheel-survey').click();await tick();const read=data(spec);read.view.candidates=read.view.candidates.slice(0,1);h.respond('/api/gameplay/survey',read);await survey;const add=controls().find(n=>n.dataset.compassTaskPrepare);assert.ok(add);assert.equal(add.disabled,false);add.click();const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'compass-wheel',parameters,actionId:spec.actionId}]);const action=compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION');assert.deepEqual(action.parameters,parameters);assert.ok(h.node('wf-unified-steps').textContent.includes('累计奖'));assert.equal(h.requests.some(r=>r.url.includes('/execute')||r.url.includes('/authorize')),false);
});


test('exclusive activation professional mode and candidate reuse original Tasks without execution',async()=>{
 const parameters={heroId:'A',action:'exclusive-activate'},spec={module:'heroes',actionId:'heroes:EXCLUSIVE-ACTIVATE:'+'d'.repeat(64),actionType:'EXCLUSIVE-ACTIVATE',parameters,target:{heroId:'A'},label:'英雄专武首次激活',costs:[{id:'初级专武材料',num:150}],blockedReason:'SOURCE_UNKNOWN',facts:{heroes:[{heroId:'A',level:20,star:15,power:'9007199254740993',skillLevels:[1]}]}};const h=await loaded(spec),mode=descendants(h.node('gp-heroes-facts')).find(n=>n.dataset.heroGrowthMode==='exclusive-activate');assert.ok(mode);mode.click();assert.equal(JSON.parse(h.node('gp-heroes-parameters').value).action,'exclusive-activate');assert.equal(h.node('gp-heroes-authorize').disabled,true);
 h.node('gp-heroes-parameters').value=JSON.stringify(parameters);h.node('gp-heroes-parameters').oninput();const survey=h.node('gp-heroes-survey').click();await tick();const snapshot=data(spec);snapshot.view.candidates=[{...candidate(spec),budgetClaims:{resources:spec.costs,quotas:[],uids:[{type:'hero-exclusive',id:'A'}]}}];h.respond('/api/gameplay/survey',snapshot);await survey;const add=descendants(h.node('gp-heroes-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId);assert.ok(add);add.click();const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'heroes',parameters,actionId:spec.actionId}]);assert.deepEqual(compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION').parameters,parameters);const fields=()=>descendants(h.node('gp-heroes-facts')),batchMode=fields().find(n=>n.dataset.heroGrowthBatchMode);assert.ok(batchMode);batchMode.value='exclusive-activate';batchMode.onchange();const check=fields().find(n=>n.dataset.growthBatchTarget==='A:exclusive-activate:');assert.ok(check);assert.equal(check.disabled,false);assert.equal(check.checked,false);check.checked=true;check.onchange();const preparing=fields().find(n=>n.dataset.growthBatchPrepare).click(),route='/api/gameplay/heroes/growth/prepare',payload={targets:[parameters],maxDurationMs:300000};assertMutation(h.pending(route),route,payload);const source=candidate(spec),budget={resources:spec.costs,quotas:[],uids:[{type:'hero-exclusive',id:'A'}]},selection={unique:true},nodes=[{id:'start',type:'START'},{id:'grow-0',type:'ACTION',module:'heroes',parameters,selection},{id:'verify-0',type:'VERIFY',module:'heroes'},{id:'stop',type:'STOP'}],graph={version:1,id:'synthetic-exclusive-activation',name:'专武首次激活',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:300000,maxActions:1,modules:['heroes']}};h.respond(route,{...payload,accountId:'A',resumable:false,requiresFreshPlan:true,requiresAuthorization:true,budget,graph,steps:[{parameters,selection,target:source.target,costs:source.costs,budgetClaims:budget}]});await preparing;assert.deepEqual(conditionGraph(h),graph);assert.equal(h.requests.some(r=>r.url.includes('/execute')||r.url.includes('/authorize')),false);assert.equal(h.confirmations.length,0);
});


test('Pet mature claim professional target and Tasks freeze the full observed cohort without execution',async()=>{
 const parameters={action:'claim',buildingId:'1宠物培育室',expectedMatureHash:'c'.repeat(64)},budgetClaims={resources:[],quotas:[],uids:[{type:'pet-mature-batch',id:'1宠物培育室:'+parameters.expectedMatureHash}]},spec={module:'pet',actionId:'pet:CLAIM:synthetic-cohort',actionType:'CLAIM',parameters,target:{buildingId:parameters.buildingId,expectedMatureHash:parameters.expectedMatureHash},costs:[],blockedReason:'EXPLICIT_CURRENT_MATURE_LIST_REQUIRED',facts:{mode:'claim',claimPreparation:parameters,rooms:[{buildingId:parameters.buildingId,level:1,queue:{breedQ:[],maturePets:[{petId:'蓝宠物1',star:0},{petId:'蓝宠物1',star:0}]}}]}};
 const h=await loaded(spec),mode=descendants(h.node('gp-pet-facts')).find(n=>n.dataset.petMode==='claim');assert.ok(mode);mode.click();assert.deepEqual(JSON.parse(h.node('gp-pet-parameters').value),{action:'claim'});let survey=h.node('gp-pet-survey').click();h.respond('/api/gameplay/survey',data(spec));await survey;const prepare=descendants(h.node('gp-pet-facts')).find(n=>n.dataset.petMaturePrepare);assert.ok(prepare);prepare.click();assert.deepEqual(JSON.parse(h.node('gp-pet-parameters').value),parameters);assert.equal(h.node('gp-pet-authorize').disabled,true);
 survey=h.node('gp-pet-survey').click();const snapshot=data(spec);snapshot.view.candidates=[{...candidate(spec),budgetClaims}];h.respond('/api/gameplay/survey',snapshot);await survey;const add=descendants(h.node('gp-pet-candidates')).find(n=>n.dataset.unifiedTaskCandidate===spec.actionId);assert.ok(add);add.click();const draft=unifiedDraft(h);assert.deepEqual(draft.tasks,[{kind:'pet',parameters,actionId:spec.actionId}]);assert.deepEqual(compileUnifiedExecution(draft,{modules:GAMEPLAY_MODULES}).graph.nodes.find(n=>n.type==='ACTION').parameters,parameters);assert.equal(h.requests.some(r=>r.url.includes('/execute')||r.url.includes('/authorize')),false);assert.equal(h.confirmations.length,0);
});
