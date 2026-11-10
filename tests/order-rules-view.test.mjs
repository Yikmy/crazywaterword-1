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
  setAttribute(key, value) { this[key] = value; }
  click() { this.clicked = true; }
  remove() { this.parent?.removeChild(this); }
  select() { this.selected = true; }
  get firstChild() { return this.children[0]; }
  get childElementCount() { return this.children.length; }
}
function harness() {
  const nodes = new Map(); const requests = []; const timers = []; const streams = []; const copies = [], downloads = [], blobs = [], revoked = [];
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const tabs = ['overview', 'order-rules', 'explorer'].map((tab) => { const button = new Element('button'); button.dataset.tab = tab; return button; });
  const context = vm.createContext({
    URL: class extends URL { static createObjectURL(blob) { blobs.push(blob); return 'blob:fixture'; } static revokeObjectURL(url) { revoked.push(url); } }, Blob,
    navigator: { clipboard: { async writeText(value) { copies.push(value); } } }, location: { href: 'http://127.0.0.1:17321/' },
    document: { body: new Element('body'), getElementById: node, createElement: (tag) => new Element(tag), createTextNode: (text) => { const el = new Element(); el.textContent = text; return el; }, querySelectorAll: (selector) => selector === '#tabs button' ? tabs : [] },
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
  return { nodes, node, requests, timers, streams, run, pending, respond, copies, downloads, blobs, revoked, tabs };
}
const overview = (account) => ({ account: { id: account, title: account }, status: { connected: false, state: 'IDLE' }, player: {}, resources: [], items: { top: [] }, heroes: { list: [] }, failed: {} });
async function boot() {
  const h = harness();
  h.respond('/api/accounts', undefined, { activeId: 'A', accounts: [{ id: 'A', title: 'A' }, { id: 'B', title: 'B' }] });
  await tick(); h.respond('/api/overview', 'A', overview('A')); await tick(); return h;
}
const types = [
  ['ITEM_FORBIDDEN', '禁止物品'], ['ITEM_REQUIRED', '必须包含物品'], ['MIN_EXPERIENCE', '经验门槛'],
  ['MAX_ITEM_COUNT', '物品数量上限'], ['INVENTORY_AVAILABLE', '库存检查'],
].map(([type,label]) => ({type,label}));
const config = () => ({ version:1, enabled:true, rules:[
  { id:'forbid', priority:1, enabled:true, type:'ITEM_FORBIDDEN', params:{itemIds:['item-toilet']}, onFail:'REFRESH' },
  { id:'experience', priority:2, enabled:true, type:'MIN_EXPERIENCE', params:{value:700,operator:'GT'}, onFail:'REFRESH' },
  { id:'bread', priority:3, enabled:true, type:'ITEM_FORBIDDEN', params:{itemIds:['item-bread']}, onFail:'KEEP' },
]});
const fixture=(accountId='A', rules=config())=>({accountId,config:rules,source:'account',warning:null,
  defaults:{version:1,enabled:false,rules:[]},ruleTypes:types,
  items:[{id:'item-toilet',name:'马桶',source:'WorkerOrderCfg.itemId'},{id:'item-bread',name:'面包',source:'snapshot'}],
  itemSourceNote:'精确 ID 来自现有配置表和 Snapshot。'});
async function load(h,data=fixture()){
  const p=h.node('order-rules-load').onclick(); h.respond('/api/order-rules',data.accountId,data);await p;
}
function descendants(node){return[node,...node.children.flatMap(descendants)];}
function card(h,index=0){return h.node('order-rules-editor').children[index];}
function field(h,index,name){return descendants(card(h,index)).find(n=>n.dataset.field===name);}
function action(h,index,name){return descendants(card(h,index)).find(n=>n.dataset.action===name);}
const draft=h=>JSON.parse(h.run('JSON.stringify(orderRulesDraft)'));
function previewFixture(accountId='A'){
  const decisions=['RECOMMEND_REFRESH','RECOMMEND_SUBMIT','RECOMMEND_KEEP','NEEDS_REVIEW'];
  return {accountId,status:'SUCCESS',updatedAt:'2026-11-10T01:00:00Z',stale:false,error:null,
    orders:decisions.map((decision,index)=>({order:{index,rewardExp:820-index*100,requirements:[{id:'item-toilet',num:2}]},
      inventoryFacts:[{id:'item-toilet',required:2,available:index===3?null:3,missing:index===3?null:0}],
      result:{orderId:index,decision,firstFailedRuleId:index===0?'forbid':null,
        ruleResults:[{id:'forbid',priority:1,type:'ITEM_FORBIDDEN',status:index===0?'FAIL':'PASS',onFail:'REFRESH',explanation:'合成规则解释 '+index}],
        inventory:{status:index===0?'SKIPPED':index===3?'UNKNOWN':'PASS',missing:[],explanation:'合成库存解释 '+index},explanation:['合成最终解释 '+index]}}))};
}
async function preview(h,data=previewFixture()){
  const p=h.node('order-rules-preview').onclick();h.respond('/api/order-rules/preview',data.accountId,data);await p;
}

test('rules editor loads account-specific config, five types and exact item IDs without game requests',async()=>{
  const h=await boot();await load(h);
  assert.equal(h.node('order-rules-editor').childElementCount,3);
  assert.equal(h.node('order-rule-add-type').childElementCount,5);
  assert.equal(h.node('order-rules-enabled').checked,true);
  assert.match(h.node('order-rules-source').textContent,/账号独立配置/);
  assert.match(h.node('order-items-note').textContent,/原始 ID|精确 ID/);
  assert.equal(h.node('order-item-options').children[0].value,'item-toilet');
  assert.equal(field(h,0,'itemIds').value,'item-toilet');
  assert.match(card(h,0).textContent,/已选物品：马桶 \[item-toilet\]/);
  assert.equal(h.requests.filter(r=>(r.options.method||'GET')!=='GET').length,0);
  assert.match(PAGE,/只读模拟，不会执行游戏操作/);
  assert.match(PAGE,/不代表四单可同时提交/);
});

test('add, parameter edits, type changes and deletion retain the Rule Contract',async()=>{
  const h=await boot();await load(h);
  h.node('order-rule-add-type').value='ITEM_REQUIRED';h.node('order-rule-add').onclick();
  assert.equal(draft(h).rules.length,4);assert.equal(draft(h).rules[3].type,'ITEM_REQUIRED');
  let ids=field(h,3,'itemIds');ids.value='item-toilet, item-bread，item-toilet';ids.oninput();
  assert.deepEqual(draft(h).rules[3].params,{itemIds:['item-toilet','item-bread']});
  const type=field(h,3,'type');type.value='MAX_ITEM_COUNT';type.onchange();
  let item=field(h,3,'itemId');item.value='item-bread';item.oninput();
  let count=field(h,3,'value');count.value='2';count.oninput();
  assert.deepEqual(draft(h).rules[3].params,{itemId:'item-bread',value:2});
  count.value='';count.oninput();assert.equal(draft(h).rules[3].params.value,null);
  action(h,3,'delete').onclick();assert.equal(draft(h).rules.length,3);
  assert.deepEqual(draft(h).rules.map(r=>r.priority),[1,2,3]);
});

test('moving, disabling and failure recommendations preserve rule IDs and renumber priorities',async()=>{
  const h=await boot();await load(h);
  action(h,0,'down').onclick();assert.deepEqual(draft(h).rules.map(r=>r.id),['experience','forbid','bread']);
  action(h,2,'up').onclick();assert.deepEqual(draft(h).rules.map(r=>r.id),['experience','bread','forbid']);
  const enabled=field(h,1,'enabled');enabled.checked=false;enabled.onchange();
  const fail=field(h,1,'onFail');fail.value='REVIEW';fail.onchange();
  assert.equal(draft(h).rules[1].enabled,false);assert.equal(draft(h).rules[1].onFail,'REVIEW');
  const operator=field(h,0,'operator');operator.value='GTE';operator.onchange();
  assert.equal(draft(h).rules[0].params.operator,'GTE');
  assert.deepEqual(draft(h).rules.map(r=>r.priority),[1,2,3]);
});

test('save sends only local account config and a later reload restores the server copy',async()=>{
  const h=await boot();await load(h);
  const expected=draft(h),p=h.node('order-rules-save').onclick(),request=h.pending('/api/order-rules','A');
  assert.equal(request.options.method,'POST');assert.deepEqual(JSON.parse(request.options.body),{config:expected});
  h.respond('/api/order-rules','A',{accountId:'A',config:expected,source:'account',warning:null});await p;
  assert.match(h.node('order-rules-hint').textContent,/已保存/);
  action(h,0,'delete').onclick();assert.equal(draft(h).rules.length,2);
  await load(h,fixture('A',expected));assert.deepEqual(draft(h),expected);
  assert.ok(h.requests.filter(r=>(r.options.method||'GET')==='POST').every(r=>new URL(r.url,'http://localhost').pathname==='/api/order-rules'));
});

test('restore default copies the safe global config without saving and master switch is editable',async()=>{
  const h=await boot();await load(h);const count=h.requests.length;
  h.node('order-rules-default').onclick();
  assert.deepEqual(draft(h),{version:1,enabled:false,rules:[]});
  assert.equal(h.node('order-rules-enabled').checked,false);
  assert.equal(h.requests.length,count);assert.match(h.node('order-rules-hint').textContent,/需点击保存/);
  h.node('order-rules-enabled').checked=true;h.node('order-rules-enabled').onchange();assert.equal(draft(h).enabled,true);
});

test('preview evaluates unsaved editor config and explains all four cached orders without executing actions',async()=>{
  const h=await boot();await load(h);
  const experience=field(h,1,'value');experience.value='750';experience.oninput();
  const p=h.node('order-rules-preview').onclick(),request=h.pending('/api/order-rules/preview','A');
  assert.equal(JSON.parse(request.options.body).config.rules[1].params.value,750);
  h.respond('/api/order-rules/preview','A',previewFixture());await p;
  assert.equal(h.node('order-preview-list').childElementCount,4);
  const text=h.node('order-preview-list').textContent;
  for(const content of ['订单 #0','经验：820','马桶 [item-toilet] × 2','RECOMMEND_REFRESH','RECOMMEND_SUBMIT','RECOMMEND_KEEP','NEEDS_REVIEW','FAIL','forbid','合成规则解释','合成最终解释','持有 未知'])assert.ok(text.includes(content),content);
  assert.match(h.node('order-preview-meta').textContent,/4 个缓存订单/);
  assert.ok(h.requests.filter(r=>(r.options.method||'GET')==='POST').every(r=>new URL(r.url,'http://localhost').pathname==='/api/order-rules/preview'));
});

test('editing clears old previews and ignores a preview response for an older revision',async()=>{
  const h=await boot();await load(h);await preview(h);
  const p=h.node('order-rules-preview').onclick();
  const value=field(h,1,'value');value.value='999';value.oninput();
  assert.equal(h.node('order-preview-list').childElementCount,0);
  h.respond('/api/order-rules/preview','A',previewFixture());await p;
  assert.equal(h.node('order-preview-list').childElementCount,0);assert.match(h.node('order-preview-meta').textContent,/重新模拟/);
});

test('late account A config and preview responses cannot replace B or resurrect prior editor cards',async()=>{
  const h=await boot();await load(h);const oldCard=action(h,0,'delete');
  const oldLoad=h.node('order-rules-load').onclick(),oldPreview=h.node('order-rules-preview').onclick();
  h.run("selectAccount('B')");assert.equal(h.node('order-rules-preview').disabled,true);
  await load(h,fixture('B',{version:1,enabled:false,rules:[]}));
  h.respond('/api/order-rules','A',fixture('A'));await oldLoad;
  h.respond('/api/order-rules/preview','A',previewFixture('A'));await oldPreview;
  oldCard.onclick();
  assert.deepEqual(draft(h),{version:1,enabled:false,rules:[]});
  assert.match(h.node('order-rules-source').textContent,/当前账号：B/);assert.equal(h.node('order-preview-list').childElementCount,0);
});

test('edits made while saving or reloading cannot be overwritten by late successful responses',async()=>{
  const h=await boot();await load(h);const saved=draft(h),save=h.node('order-rules-save').onclick();
  let value=field(h,1,'value');value.value='888';value.oninput();
  h.respond('/api/order-rules','A',{accountId:'A',config:saved,source:'account',warning:null});await save;
  assert.equal(draft(h).rules[1].params.value,888);assert.match(h.node('order-rules-hint').textContent,/新的未保存修改/);
  const loading=h.node('order-rules-load').onclick();value=field(h,1,'value');value.value='999';value.oninput();
  h.respond('/api/order-rules','A',fixture());await loading;
  assert.equal(draft(h).rules[1].params.value,999);
});

test('config/preview failures and wrong account payloads show explicit errors without restoring recommendations',async()=>{
  const h=await boot();await load(h);await preview(h);
  let p=h.node('order-rules-preview').onclick();h.respond('/api/order-rules/preview','A',previewFixture('B'));await p;
  assert.equal(h.node('order-preview-list').childElementCount,0);assert.match(h.node('order-preview-meta').textContent,/账号不匹配/);
  p=h.node('order-rules-save').onclick();h.respond('/api/order-rules','A',{error:'规则参数无效'},false);await p;
  assert.match(h.node('order-rules-hint').textContent,/规则参数无效/);
  p=h.node('order-rules-load').onclick();h.respond('/api/order-rules','A',fixture('B'));await p;
  assert.match(h.node('order-rules-hint').textContent,/账号不匹配/);
});

test('UNKNOWN data, empty successful batches and missing inventory are not shown as successful zero data',async()=>{
  const h=await boot();await load(h);
  await preview(h,{accountId:'A',status:'UNKNOWN',updatedAt:null,stale:true,error:'OnWaterRequest 未采集',orders:[]});
  assert.match(h.node('order-preview-meta').textContent,/UNKNOWN.*OnWaterRequest 未采集/);
  assert.match(h.node('order-preview-list').textContent,/数据不完整/);
  await preview(h,{accountId:'A',status:'SUCCESS',updatedAt:'2026-11-10T01:00:00Z',stale:false,error:null,orders:[]});
  assert.match(h.node('order-preview-list').textContent,/没有居民订单/);
});

test('rule IDs and explanations render as literal text, and game write paths stay blocked',async()=>{
  const h=await boot(),data=fixture();data.config.rules[0].id='<img src=x>';
  await load(h,data);assert.match(h.node('order-rules-editor').textContent,/<img src=x>/);
  const result=previewFixture();result.orders[0].result.explanation=['<script>alert(1)</script>'];await preview(h,result);
  assert.match(h.node('order-preview-list').textContent,/<script>alert/);
  const count=h.requests.length;
  await assert.rejects(h.run("call('/api/world/run', {method:'POST',body:'{}'})"),/只读/);
  await assert.rejects(h.run("call('/api/tasks/run', {method:'POST',body:'{}'})"),/只读/);
  assert.equal(h.requests.length,count);
});


test('leaving and returning to the rules tab preserves an unsaved draft without an implicit reload', async () => {
  const h = await boot(), rulesTab = h.tabs.find((button) => button.dataset.tab === 'order-rules');
  rulesTab.onclick();
  h.respond('/api/order-rules', 'A', fixture()); await tick();
  const experience = field(h, 1, 'value'); experience.value = '925'; experience.oninput();
  const count = h.requests.length;
  h.tabs.find((button) => button.dataset.tab === 'overview').onclick();
  rulesTab.onclick();
  assert.equal(h.requests.length, count);
  assert.equal(draft(h).rules[1].params.value, 925);
  assert.match(h.node('order-rules-hint').textContent, /未保存修改/);
});
