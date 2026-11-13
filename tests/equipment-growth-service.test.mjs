import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EventEmitter } from 'node:events';
const isolationRoot=fs.mkdtempSync(path.join(os.tmpdir(),'cw-equipment-growth-http-'));
process.env.CW_DATA_DIR=isolationRoot;process.env.CW_CONFIG_PACK=path.join(isolationRoot,'absent-config.json');
const { GAMEPLAY_MODULES } = await import('../src/function-registry.mjs');
const { createModuleSettings } = await import('../src/gameplay-settings.mjs');
const { createOperationService } = await import('../src/operation-service.mjs');
const { createExecutionHistory } = await import('../src/execution-history.mjs');
const { createWorkflowRunner } = await import('../src/workflow.mjs');
const { loadProtocol } = await import('../src/proto.mjs');
const { toSnapshotJson } = await import('../src/game.mjs');
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
test.after(()=>{assert.equal(path.dirname(path.resolve(isolationRoot)),path.resolve(os.tmpdir()));fs.rmSync(isolationRoot,{recursive:true,force:true});});

// Actual registered Service/History/Workflow and local codecs; synthetic transport
// and temporary persistence only. No GameClient, account credentials or Runtime.
const moduleId = 'equipment-growth', protocol = loadProtocol();
const wire = (name, value) => protocol[name].decode(protocol[name].encode(value).finish());
const ids = { A: '9007199254740993', B: '9007199254740994', idle: '9007199254740995' };
const config = () => ({ tables: {
  EquipCfg: { data: [{ id: '蓝武器1', type: '武器' }] },
  EquipAttrCfg: { data: [{ id: '蓝武器1', star: '0', maxLv: 10 }] },
  EquipUpDecomposeCfg: { data: [{ level: 2, upgradeCost: 4 }, { level: 3, upgradeCost: 6 }] },
} });
const equip = (uid, extra = {}) => ({ uid, equipId: '蓝武器1', level: 1, star: 0, refineLv: 0, attr: [{ attr: 1, value: 1.5, rating: 2 }], rerollAttrs: [], ...extra });
const hero = heroId => ({ heroId, level: 10, star: 2, power: '9007199254740997', skillLevels: [1, 1], attributes: [{ attr: 1, value: 10.5 }], equips: [equip(ids[heroId])] });
const parameters = (heroId = 'A') => ({ heroId, uid: ids[heroId] });
const claims = (num = 4, uids = [ids.A]) => ({ resources: [{ id: '精铁', num }], quotas: [], uids: uids.map(id => ({ type: 'equipment', id })) });
const iron = rows => rows.find(row => row.id === '精铁')?.num ?? 0;
function fixture({ enabled = true, apply = true, historyFile, watchStatus = 'UNKNOWN', derived = true, refine = false, star = false, putOn = false, useConsole = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-equipment-growth-service-'));
  const file = historyFile ?? path.join(dir, 'history.json'), journal = [], sessions = new Map(), runners = [];
  const durable = createExecutionHistory({ file });
  const moduleSettings = createModuleSettings({ file: path.join(dir, 'modules.json'), modules: GAMEPLAY_MODULES });
  let gameConfig = config();if(refine){gameConfig.tables.EquipCfg.data[0]={id:'红武器1',type:'武器',quality:'RED'};gameConfig.tables.EquipAttrCfg.data[0]={id:'红武器1',star:'0',maxLv:10,maxRefineLv:10};gameConfig.tables.EquipRefineCfg={data:[{level:1,costItem1:4,costItem2:2,growNum:1},{level:2,costItem1:6,costItem2:3,growNum:2}]};}if(star){gameConfig.tables.EquipCfg.data[0]={id:'红武器1',type:'武器',quality:'RED'};gameConfig.tables.EquipAttrCfg={data:[0,1,2,3,4,5].map(star=>({id:'红武器1',star,maxLv:135,maxRefineLv:10}))};gameConfig.tables.EquipUpStarCfg={data:[1,2,3,4,5].map(star=>({star,upCosts:[['装备升星石',star],['精铁',4*star]]}))};}let failPersist = () => false, serviceTime = Date.now();
  const history = { ...durable, put(record) { if (failPersist(record)) throw Error('synthetic equipment-growth persistence unavailable'); journal.push(structuredClone(record)); return durable.put(record); } };
  if (putOn) {
    gameConfig.tables.EquipCfg.data.push({ id: '蓝饰品1', type: '饰品' });
    gameConfig.tables.ModuleOpenCfg = { data: [{ moduleId: '英雄装备', playerLevel: 16 }] };
  }
  const operationOptions={history,moduleSettings,clock:()=>serviceTime,getConfig:()=>structuredClone(gameConfig),loadRules:()=>({config:{version:1,enabled:true,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})};let app=null,csrf,clients=0,collections=0;if(useConsole){saveStore({version:1,activeId:'account-A',accounts:['account-A','account-B'].map(id=>({id,label:id,url:'wss://synthetic.invalid',login:{eworldParams:{openId:id,token:'synthetic-refine-only',sign:'synthetic-refine-sign',timestamp:1}}}))});app=createConsole({protocol,tracePath:path.join(dir,'never-trace.log'),clientFactory(){clients++;throw Error('Offline REFINE forbids Runtime/client');},collect(){collections++;throw Error('Offline REFINE forbids collectors');},writerOwnership:{assertOwned(){return true;},claim(){return true;},release(){}},operationOptions});app.server.address=()=>({port:17321});}const service=app?.operations??createOperationService({protocol,modules:GAMEPLAY_MODULES,...operationOptions});
  function session(accountId = 'account-A') {
    // Complete pool and hero mirrors are independent objects, not shared aliases.
    const state = { pool: [equip(ids.A), equip(ids.B), equip(ids.idle)], heroes: [hero('A'), hero('B')], stock: new Map([['精铁', 30], ['其他材料', 7], ['GOLD', 100]]), writes: [], reads: [], apply, derived, onRead: null, onWrite: null, nowMs: 1000000, clock: true };
    if (putOn) state.pool.find(row => row.uid === ids.idle).equipId = '蓝饰品1';
    if(star){state.stock.set('装备升星石',20);for(const row of [...state.pool,...state.heroes.flatMap(h=>h.equips)])row.equipId='红武器1';}if(refine){state.stock.set('精炼石',20);for(const row of state.pool)row.equipId='红武器1';for(const h of state.heroes)for(const row of h.equips)row.equipId='红武器1';}const client = { connected: true,stop(){this.connected=false;}, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Map(), factContext: { accountId, generation: 1, connectionId: 'offline-equipment-growth-' + accountId },
      gameClock: { read() { return state.clock ? { status: 'TRUSTED', reliable: true, nowMs: state.nowMs, earliestMs: state.nowMs, latestMs: state.nowMs, accountId: client.factContext.accountId, generation: client.factContext.generation } : null; } },
      markUnverifiedWrite(name, body) { this.uncertainWrites.set(JSON.stringify({ name, body }), true); },
      confirmWatchedWrite(name, body) { this.uncertainWrites.delete(JSON.stringify({ name, body })); },
      mutate(name, body) {
        if (name === 'PutOnEquipRequest') {
          assert.equal(putOn, true);
          const decoded = toSnapshotJson(wire(name, body));
          assert.deepEqual(decoded, { uid: ids.idle, heroId: 'A' });
          const durableBeforeWrite = JSON.parse(fs.readFileSync(file, 'utf8')).accounts[accountId][0];
          state.writes.push({ name, body: decoded, durableBeforeWrite });
          if (state.apply) {
            const owner = state.heroes.find(row => row.heroId === decoded.heroId);
            owner.equips.push(structuredClone(state.pool.find(row => row.uid === decoded.uid)));
            if (state.derived) { owner.power = (BigInt(owner.power) + 8n).toString(); owner.attributes[0].value += 1.5; }
          }
          state.onWrite?.(name, body);
          return;
        }
        assert.ok(['EnhanceEquipRequest','EquipRefineRequest','EquipStarUpRequest'].includes(name));
        state.writes.push({ name, body: structuredClone(body), durableBeforeWrite: structuredClone(journal.at(-1)) });
        const uid = toSnapshotJson(wire(name, body)).uid.toString();
        const row = state.pool.find(value => value.uid === uid), owner = state.heroes.find(value => value.equips.some(e => e.uid === uid));
        if (state.apply) {
          if(name==='EquipStarUpRequest'){const cost=gameConfig.tables.EquipUpStarCfg.data.find(v=>v.star===row.star+1);row.star++;if(state.derived)row.attr.push({attr:2,value:2.5,rating:3});owner.equips[owner.equips.findIndex(v=>v.uid===uid)]=structuredClone(row);for(const [id,num]of cost.upCosts)state.stock.set(id,state.stock.get(id)-num);}else if(name==='EquipRefineRequest'){const cost=gameConfig.tables.EquipRefineCfg.data.find(v=>v.level===row.refineLv+1);row.refineLv++;owner.equips.find(value=>value.uid===uid).refineLv++;state.stock.set('精铁',state.stock.get('精铁')-cost.costItem1);state.stock.set('精炼石',state.stock.get('精炼石')-cost.costItem2);}else{const cost = row.level === 1 ? 4 : 6;row.level++;owner.equips.find(value => value.uid === uid).level++;state.stock.set('精铁', state.stock.get('精铁') - cost);}
          if (state.derived) { owner.power = (BigInt(owner.power) + 8n).toString(); owner.attributes[0].value += 1.5; }
        }
        state.onWrite?.(name, body);
      },
      async request(name, body, response, _timeout, options) {
        wire(name, body);
        assert.notEqual(options?.mutate, true, 'EnhanceEquip has no typed response and must use the shared watch path');
        state.reads.push(name); await state.onRead?.(name);
        if (name === 'AllHeroRequest') return wire(response, { heroes: state.heroes });
        if (name === 'EquipsRequest') return wire(response, { equip: state.pool });
        if (name === 'AllItemRequest') return wire(response, { items: [...state.stock].filter(([id]) => id !== 'GOLD').map(([itemId, num]) => ({ itemId, num })) });
        if (name === 'AllResourceRequest') return wire(response, { list: [{ res: 3, amount: state.stock.get('GOLD') }] });
        throw Error('Unexpected synthetic equipment-growth read ' + name);
      },
      async sendWatch(name, body, options) { wire(name, body); if (name === 'PutOnEquipRequest') options?.beforeDispatch?.(); this.mutate(name, body);await state.onWatch?.(name,body); return { status: watchStatus }; },
    };
    const result = { id: accountId, client, state: 'READY', player: { playerId: accountId === 'account-A' ? '1001' : '1002', worldId: 1000001, level: 20 }, generation: 1, connectionId: 'offline-equipment-growth-' + accountId, abort: new AbortController(), busy: null, loop: { running: false,stop:{aborted:false} },log:[],snapshot:{ok:{},failed:{}},synthetic: state };
    if (enabled) moduleSettings.save(accountId, moduleId, { enabled: true });
    sessions.set(accountId, result);app?.sessions.set(accountId,result); return result;
  }
  async function displayed(target, p = parameters(), workflowId = null) {
    const surveyed = await service.surveyModule(target, moduleId, p, { workflowId });
    const candidate = surveyed.view.candidates.find(row => row.executable);
    assert.ok(candidate, 'expected executable synthetic equipment-growth candidate: ' + JSON.stringify(surveyed.view.blocked ?? surveyed.view.candidates));
    return service.plan(target, { module: moduleId, mode: 'Manual', parameters: p, selections: [candidate.actionId] }, { workflowId });
  }
  const authorize = (target, planned) => service.authorize(target, { batchId: planned.batchId, planHash: planned.planHash, approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: planned.resourceBudget, confirm: true });
  async function execute(target, planned) { const permit = authorize(target, planned), started = service.execute(target, permit); await service.settle(target.id); return { permit, started, record: durable.list(target.id).find(row => row.planSummary.batchId === planned.batchId), status: service.status(target.id) }; }
  function runner(target) { const result = createWorkflowRunner({ operations: service, modules: GAMEPLAY_MODULES, getSession: id => sessions.get(id), claim: (id, runId, opts) => service.claimWorkflow(sessions.get(id), runId, opts), isCurrent: (s, generation, client) => s === target && s.generation === generation && s.client === client }); runners.push(result); return result; }
  async function cleanup() { for (const r of runners) r.stop(); await Promise.all(runners.map(r => r.settle())); for (const target of sessions.values()) target.abort.abort(); await Promise.all([...sessions.keys()].map(id => service.settle(id)));if(app)await app.close(); assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); }
  const call=(route,{id='account-A',body,method=body===undefined?'GET':'POST',headers={},authorized=true}={})=>new Promise(resolve=>{assert.ok(app);const url=new URL(route,'http://127.0.0.1:17321');if(id!==null)url.searchParams.set('account',id);const req=new EventEmitter();Object.assign(req,{url:url.pathname+url.search,method,headers:{host:'127.0.0.1:17321','content-type':'application/json',...(authorized?{origin:'http://127.0.0.1:17321',...(csrf?{'x-cw-csrf':csrf}:{})}:{}),...headers}});const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(text){const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:this.status,data,text});}};app.server.emit('request',req,res);if(body!==undefined)req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');});return {app,call,counts:()=>({clients,collections}),file, service, durable, journal, moduleSettings, session, displayed, authorize, execute, runner, cleanup, advance: ms => { serviceTime += ms; }, config: mutate => mutate(gameConfig), failPersist: predicate => { failPersist = predicate; } };
}

for (const derived of [false, true]) test('registered equipment level confirms full codec mirrors and durable history with derived changes ' + derived, async () => {
  const f = fixture({ derived }), target = f.session();
  try {
    const planned = await f.displayed(target); assert.equal(planned.actions.length, 1); assert.equal(planned.actions[0].action, undefined); assert.deepEqual(planned.budgetClaims, claims());
    const result = await f.execute(target, planned), row = result.record.actions[0];
    assert.equal(result.status.finalStatus, 'SUCCESS'); assert.equal(row.result, 'SUCCESS'); assert.equal(row.verification.status, 'CONFIRMED'); assert.equal(row.dispatched, true); assert.equal(row.beforeInventoryReliable, true); assert.equal(row.afterInventoryReliable, true);
    assert.equal(target.synthetic.writes.length, 1); assert.deepEqual(target.synthetic.writes[0].body, { uid: ids.A });
    const beforeDispatch = target.synthetic.writes[0].durableBeforeWrite; assert.equal(beforeDispatch.actions[0].dispatchEvidence.state, 'MAY_HAVE_DISPATCHED'); assert.equal(iron(beforeDispatch.runBudget.reserved.resources), 4); assert.deepEqual(beforeDispatch.runBudget.reserved.uids, claims().uids);
    assert.equal(target.synthetic.pool[0].level, 2); assert.equal(target.synthetic.heroes[0].equips[0].level, 2); assert.equal(target.synthetic.stock.get('精铁'), 26);
    assert.equal(result.record.runBudget.state, 'CLOSED'); assert.equal(result.record.runBudget.outcome, 'SUCCESS'); assert.equal(result.record.runBudget.resumable, false);
    const restarted = createExecutionHistory({ file: f.file }); assert.equal(restarted.list(target.id)[0].actions[0].verification.status, 'CONFIRMED'); assert.equal(restarted.unresolved(target.id), false); assert.throws(() => f.service.execute(target, result.permit));
  } finally { await f.cleanup(); }
});

test('registered equipment growth defaults off and rejects raw protocol, batch and growth-family injection', async () => {
  const f = fixture({ enabled: false }), target = f.session();
  try {
    const surveyed = await f.service.surveyModule(target, moduleId, parameters()); assert.equal(surveyed.config.enabled, false); assert.equal(surveyed.view.candidates.some(row => row.executable), false);
    for (const extra of [{ request: 'EnhanceEquipRequest' }, { count: 2 }, { action: 'star' }, { universal: false }, { decomposeUid: [] }]) await assert.rejects(f.service.plan(target, { module: moduleId, mode: 'Manual', parameters: { ...parameters(), ...extra }, selections: ['fake'] }));
    assert.equal(target.synthetic.writes.length, 0); assert.equal(f.durable.list(target.id).length, 0);
  } finally { await f.cleanup(); }
});

test('equipment permit binds cost config, enabled state and exact finite iron budget', async () => {
  const f = fixture(), target = f.session();
  try {
    let planned = await f.displayed(target); f.config(c => { c.tables.EquipUpDecomposeCfg.data[0].upgradeCost = 5; }); assert.throws(() => f.authorize(target, planned), { code: 'STALE_PLAN' });
    f.config(c => { c.tables.EquipUpDecomposeCfg.data[0].upgradeCost = 4; }); planned = await f.displayed(target); f.service.saveModuleConfig(target.id, { module: moduleId, config: { enabled: false } }); assert.throws(() => f.authorize(target, planned));
    f.service.saveModuleConfig(target.id, { module: moduleId, config: { enabled: true } }); planned = await f.displayed(target);
    assert.throws(() => f.service.authorize(target, { batchId: planned.batchId, planHash: planned.planHash, approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: [], confirm: true }));
    assert.equal(target.synthetic.writes.length, 0);
  } finally { await f.cleanup(); }
});

test('equipment permits and exact UID histories remain account isolated', async () => {
  const f = fixture(), a = f.session(), b = f.session('account-B');
  try {
    const permit = f.authorize(a, await f.displayed(a)); assert.throws(() => f.service.execute(b, permit)); assert.equal(b.synthetic.writes.length, 0);
    f.service.execute(a, permit); await f.service.settle(a.id); assert.equal(f.durable.list(a.id)[0].finalStatus, 'SUCCESS'); assert.equal(f.durable.list(b.id).length, 0);
    assert.equal((await f.execute(b, await f.displayed(b))).status.finalStatus, 'SUCCESS'); assert.equal(a.synthetic.stock.get('精铁'), 26); assert.equal(b.synthetic.stock.get('精铁'), 26);
  } finally { await f.cleanup(); }
});

for (const watchStatus of ['UNKNOWN', 'SUCCESS']) test('equipment no-effect watch ' + watchStatus + ' retains iron and UID UNKNOWN across restart', async () => {
  const f = fixture({ apply: false, watchStatus }), target = f.session(); let restarted;
  try {
    const result = await f.execute(target, await f.displayed(target)), row = result.record.actions[0]; assert.equal(result.status.finalStatus, 'UNKNOWN'); assert.equal(row.unresolvedWrite, true); assert.equal(row.verification.status, 'UNCONFIRMED'); assert.equal(iron(result.record.runBudget.reserved.resources), 4); assert.deepEqual(result.record.runBudget.reserved.uids, claims().uids);
    await assert.rejects(f.displayed(target), { code: 'RESPONSE_UNCERTAIN' }); assert.equal(target.synthetic.writes.length, 1);
    restarted = fixture({ historyFile: f.file }); const fresh = restarted.session(); await assert.rejects(restarted.displayed(fresh), { code: 'RECOVERY_UNCERTAIN' }); assert.equal(fresh.synthetic.writes.length, 0); assert.equal(restarted.durable.list(fresh.id)[0].finalStatus, 'UNKNOWN');
  } finally { await restarted?.cleanup(); await f.cleanup(); }
});

for (const change of ['target', 'idle-instance', 'world', 'generation', 'account']) test('equipment authorized ' + change + ' change prevents dispatch', async () => {
  const f = fixture(), target = f.session();
  try {
    const permit = f.authorize(target, await f.displayed(target)), s = target.synthetic;
    if (change === 'target') { s.pool[0].level++; s.heroes[0].equips[0].level++; }
    if (change === 'idle-instance') s.pool[2].level++;
    if (change === 'world') target.player.worldId = 2000001;
    if (change === 'generation') { target.generation++; target.client.factContext.generation++; }
    if (change === 'account') target.client.factContext.accountId = 'other-account';
    try { f.service.execute(target, permit); await f.service.settle(target.id); } catch {}
    assert.equal(s.writes.length, 0); assert.notEqual(f.service.status(target.id).finalStatus, 'SUCCESS'); assert.throws(() => f.service.execute(target, permit));
  } finally { await f.cleanup(); }
});

test('equipment preview expiry needs new authorization while no game timer is required', async () => {
  const f = fixture(), target = f.session();
  try {
    target.synthetic.clock = false;
    const planned = await f.displayed(target); f.advance(300001);
    assert.throws(() => f.authorize(target, planned), { code: 'STALE_PLAN' });
    assert.equal(target.synthetic.writes.length, 0);
    assert.equal((await f.execute(target, await f.displayed(target))).status.finalStatus, 'SUCCESS');
  } finally { await f.cleanup(); }
});

test('equipment mirror, ownership and already-active level eligibility fail closed before history', async () => {
  const mutations = [s => s.pool.shift(), s => s.pool[0].level++, s => s.heroes[1].equips.push(structuredClone(s.heroes[0].equips[0])), s => { s.pool[0].level = 0; s.heroes[0].equips[0].level = 0; }, s => { s.pool[0].level = 10; s.heroes[0].equips[0].level = 10; }, s => { delete s.heroes[0].attributes; }, s => { s.stock.set('精铁', 3); }];
  for (const mutate of mutations) {
    const f = fixture(), target = f.session();
    try { mutate(target.synthetic); const surveyed = await f.service.surveyModule(target, moduleId, parameters()); assert.equal(surveyed.view.candidates.some(row => row.executable), false); assert.equal(target.synthetic.writes.length, 0); assert.equal(f.durable.list(target.id).length, 0); }
    finally { await f.cleanup(); }
  }
});

for (const change of ['target-hero-level', 'other-hero-power', 'equipment-attr', 'idle-instance', 'extra-item', 'wrong-iron', 'one-mirror', 'double-level', 'malformed-attributes']) test('equipment post-write ' + change + ' stays durable UNKNOWN without retry', async () => {
  const f = fixture(), target = f.session();
  try {
    target.synthetic.onWrite = () => { const s = target.synthetic;
      if (change === 'target-hero-level') s.heroes[0].level++;
      if (change === 'other-hero-power') s.heroes[1].power = '42';
      if (change === 'equipment-attr') { s.pool[0].attr[0].value++; s.heroes[0].equips[0].attr[0].value++; }
      if (change === 'idle-instance') s.pool[2].level++;
      if (change === 'extra-item') s.stock.set('额外奖励', 1);
      if (change === 'wrong-iron') s.stock.set('精铁', 27);
      if (change === 'one-mirror') s.heroes[0].equips[0].level++;
      if (change === 'double-level') { s.pool[0].level++; s.heroes[0].equips[0].level++; }
      if (change === 'malformed-attributes') s.heroes[0].attributes = [{ attr: 1, value: NaN }];
    };
    const result = await f.execute(target, await f.displayed(target)); assert.equal(result.status.finalStatus, 'UNKNOWN'); assert.equal(result.record.actions[0].unresolvedWrite, true); assert.equal(target.synthetic.writes.length, 1); assert.equal(f.durable.unresolved(target.id), true); assert.deepEqual(result.record.runBudget.reserved.uids, claims().uids); await assert.rejects(f.displayed(target));
  } finally { await f.cleanup(); }
});

test('equipment stop before transport sends nothing and abort after write retains UID and UNKNOWN', async () => {
  const f = fixture(), target = f.session();
  try { const permit = f.authorize(target, await f.displayed(target)); f.service.execute(target, permit); f.service.stop(target.id); await f.service.settle(target.id); assert.equal(target.synthetic.writes.length, 0); assert.equal(f.service.status(target.id).finalStatus, 'CANCELLED'); }
  finally { await f.cleanup(); }
  const g = fixture(), second = g.session();
  try { second.synthetic.onWrite = () => second.abort.abort(); const result = await g.execute(second, await g.displayed(second)); assert.equal(result.status.finalStatus, 'UNKNOWN'); assert.equal(result.record.actions[0].unresolvedWrite, true); assert.equal(second.synthetic.writes.length, 1); assert.deepEqual(result.record.runBudget.reserved.uids, claims().uids); }
  finally { await g.cleanup(); }
});

test('equipment iron and UID reservation must persist before transport', async () => {
  const f = fixture(), target = f.session();
  try { const planned = await f.displayed(target); f.failPersist(record => (record.runBudget?.reserved.uids ?? []).length > 0); f.service.execute(target, f.authorize(target, planned)); await f.service.settle(target.id); assert.equal(target.synthetic.writes.length, 0); assert.notEqual(f.service.status(target.id).finalStatus, 'SUCCESS'); }
  finally { f.failPersist(() => false); await f.cleanup(); }
});

for (const mode of ['enough', 'iron-short', 'uid-missing', 'same-uid']) test('registered equipment Workflow parent budget ' + mode + ' controls resources and exact UID once', async () => {
  const f = fixture(), target = f.session();
  try {
    const a = await f.service.surveyModule(target, moduleId, parameters()), bParams = mode === 'same-uid' ? parameters() : parameters('B');
    const b = await f.service.surveyModule(target, moduleId, bParams), aId = a.view.candidates.find(row => row.executable).actionId, bId = b.view.candidates.find(row => row.executable).actionId;
    const limit = mode === 'iron-short' ? 6 : 20, allowedUids = mode === 'uid-missing' || mode === 'same-uid' ? [ids.A] : [ids.A, ids.B];
    const graph = { version: 1, id: 'equipment-budget-' + mode, name: 'Offline equipment budget ' + mode, budget: claims(limit, allowedUids), nodes: [{ id: 's', type: 'START' }, { id: 'a', type: 'ACTION', module: moduleId, parameters: parameters(), selection: aId }, { id: 'v1', type: 'VERIFY', module: moduleId }, { id: 'b', type: 'ACTION', module: moduleId, parameters: bParams, selection: bId }, { id: 'v2', type: 'VERIFY', module: moduleId }, { id: 'z', type: 'STOP' }], edges: [{ from: 's', to: 'a' }, { from: 'a', to: 'v1' }, { from: 'v1', to: 'b' }, { from: 'b', to: 'v2' }, { from: 'v2', to: 'z' }] };
    const runner = f.runner(target), first = await runner.start(target.id, graph); assert.equal(first.status, 'AWAITING_AUTHORIZATION'); assert.equal((await f.execute(target, first.plan)).status.finalStatus, 'SUCCESS'); target.synthetic.stock.set('精铁', 1000);
    let second, final;
    try { second = await runner.resume(); if (second.status === 'AWAITING_AUTHORIZATION') { await f.execute(target, second.plan); final = await runner.resume(); } else final = second; }
    catch { final = null; }
    if (mode === 'enough') { assert.equal(final?.status, 'COMPLETED'); assert.equal(target.synthetic.writes.length, 2); assert.equal(iron(final.runBudget.reserved.resources), 8); assert.deepEqual(final.runBudget.reserved.uids, claims(8, [ids.A, ids.B]).uids); }
    else { assert.notEqual(final?.status, 'COMPLETED'); assert.equal(target.synthetic.writes.length, 1); const budget = f.service.workflowBudget(target.id) ?? final?.runBudget ?? second?.runBudget; if (budget) { assert.equal(iron(budget.reserved.resources), 4); assert.deepEqual(budget.reserved.uids, claims().uids); } }
  } finally { await f.cleanup(); }
});
// Explicit REFINE extends the same registered module; omitted action remains LEVEL.
const refineParameters=(heroId='A')=>({...parameters(heroId),action:'refine'});
const refineClaims=(ironNum=4,stoneNum=2,uids=[ids.A])=>({resources:[{id:'精铁',num:ironNum},{id:'精炼石',num:stoneNum}],quotas:[],uids:uids.map(id=>({type:'equipment',id}))});
const stones=rows=>rows.find(row=>row.id==='精炼石')?.num??0;

for(const derived of[false,true])test('REFINE registered Service confirms same RED UID and exact two-material debit with derived state '+derived,async()=>{const f=fixture({refine:true,derived}),t=f.session();try{assert.equal(protocol.EquipRefineResponse,undefined);const p=await f.displayed(t,refineParameters());assert.equal(p.actions[0].actionType,'REFINE');assert.deepEqual(p.actions[0].parameters,refineParameters());assert.equal(p.actions[0].action,undefined);assert.deepEqual(p.budgetClaims,refineClaims());const r=await f.execute(t,p),row=r.record.actions[0];assert.equal(r.status.finalStatus,'SUCCESS');assert.equal(row.verification.status,'CONFIRMED');assert.equal(t.synthetic.writes.length,1);assert.equal(t.synthetic.writes[0].name,'EquipRefineRequest');assert.deepEqual(t.synthetic.writes[0].body,{uid:ids.A});assert.equal(t.synthetic.pool[0].refineLv,1);assert.equal(t.synthetic.heroes[0].equips[0].refineLv,1);assert.equal(t.synthetic.pool[0].level,1);assert.equal(t.synthetic.pool[0].star,0);assert.equal(t.synthetic.stock.get('精铁'),26);assert.equal(t.synthetic.stock.get('精炼石'),18);const durable=t.synthetic.writes[0].durableBeforeWrite;assert.equal(durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.equal(iron(durable.runBudget.reserved.resources),4);assert.equal(stones(durable.runBudget.reserved.resources),2);assert.deepEqual(durable.runBudget.reserved.uids,refineClaims().uids);const restarted=createExecutionHistory({file:f.file});assert.equal(restarted.unresolved(t.id),false);assert.equal(restarted.list(t.id)[0].actions[0].verification.status,'CONFIRMED');assert.throws(()=>f.service.execute(t,r.permit));}finally{await f.cleanup();}});

test('REFINE is never selected by omission and separate action IDs cannot be borrowed between modes',async()=>{const f=fixture({refine:true}),t=f.session();try{const level=await f.service.surveyModule(t,moduleId,parameters()),refine=await f.service.surveyModule(t,moduleId,refineParameters()),a=level.view.candidates.find(r=>r.executable),b=refine.view.candidates.find(r=>r.executable);assert.equal(a.actionType,'LEVEL');assert.equal(Object.hasOwn(a.parameters,'action'),false);assert.equal(b.actionType,'REFINE');assert.notEqual(a.actionId,b.actionId);assert.deepEqual(a.costs,[{id:'精铁',num:4}]);assert.deepEqual(b.costs,refineClaims().resources);await assert.rejects(f.service.plan(t,{module:moduleId,mode:'Manual',parameters:parameters(),selections:[b.actionId]}));const r=await f.execute(t,await f.displayed(t));assert.equal(r.status.finalStatus,'SUCCESS');assert.equal(t.synthetic.writes[0].name,'EnhanceEquipRequest');assert.equal(t.synthetic.pool[0].refineLv,0);assert.equal(t.synthetic.stock.get('精炼石'),20);}finally{await f.cleanup();}});

test('REFINE selects next refineLv row and exact star cap rather than LEVEL costs',async()=>{const f=fixture({refine:true}),t=f.session();try{t.synthetic.pool[0].refineLv=1;t.synthetic.heroes[0].equips[0].refineLv=1;const p=await f.displayed(t,refineParameters());assert.deepEqual(p.resourceBudget,refineClaims(6,3).resources);assert.equal((await f.execute(t,p)).status.finalStatus,'SUCCESS');assert.equal(t.synthetic.pool[0].refineLv,2);assert.equal(t.synthetic.stock.get('精铁'),24);assert.equal(t.synthetic.stock.get('精炼石'),17);}finally{await f.cleanup();}});

for(const mode of['default-off','non-red','cap','missing-refineLv','level-zero','wrong-owner','stone-short'])test('REFINE '+mode+' blocks before any write or history',async()=>{const f=fixture({refine:true,enabled:mode!=='default-off'}),t=f.session(),s=t.synthetic;try{if(mode==='non-red')f.config(c=>c.tables.EquipCfg.data[0].quality='ORANGE');if(mode==='cap'){s.pool[0].refineLv=10;s.heroes[0].equips[0].refineLv=10;}if(mode==='missing-refineLv'){delete s.pool[0].refineLv;delete s.heroes[0].equips[0].refineLv;}if(mode==='level-zero'){s.pool[0].level=0;s.heroes[0].equips[0].level=0;}if(mode==='wrong-owner')s.heroes[0].equips=[];if(mode==='stone-short')s.stock.set('精炼石',1);const v=await f.service.surveyModule(t,moduleId,refineParameters());assert.equal(v.view.candidates.some(r=>r.executable),false);assert.equal(s.writes.length,0);assert.deepEqual(f.durable.list(t.id),[]);}finally{await f.cleanup();}});

test('REFINE relevant cost/cap/quality config invalidates permits while unrelated LEVEL table does not',async()=>{for(const name of['EquipRefineCfg','EquipAttrCfg','EquipCfg']){const f=fixture({refine:true}),t=f.session();try{const p=await f.displayed(t,refineParameters());f.config(c=>c.tables[name].revision=2);assert.throws(()=>f.authorize(t,p),{code:'STALE_PLAN'});assert.equal(t.synthetic.writes.length,0);}finally{await f.cleanup();}}const f=fixture({refine:true}),t=f.session();try{const p=await f.displayed(t,refineParameters());f.config(c=>{c.tables.EquipUpDecomposeCfg.revision=9;c.tables.EquipUpDecomposeCfg.data[0].upgradeCost=999;});assert.equal((await f.execute(t,p)).status.finalStatus,'SUCCESS');}finally{await f.cleanup();}const g=fixture({refine:true}),u=g.session();try{const p=await g.displayed(u);g.config(c=>{c.tables.EquipRefineCfg.revision=8;c.tables.EquipRefineCfg.data[0].costItem1=999;});assert.equal((await g.execute(u,p)).status.finalStatus,'SUCCESS');assert.equal(u.synthetic.writes[0].name,'EnhanceEquipRequest');}finally{await g.cleanup();}});

test('REFINE permit stays single-use, account-bound and cannot omit either material budget',async()=>{const f=fixture({refine:true}),a=f.session(),b=f.session('account-B');try{const p=await f.displayed(a,refineParameters());assert.throws(()=>f.service.execute(a,{batchId:p.batchId}));for(const resourceBudget of[[{id:'精铁',num:4}],[{id:'精炼石',num:2}],[{id:'精铁',num:4},{id:'精炼石',num:1}]])assert.throws(()=>f.service.authorize(a,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget,confirm:true}));const permit=f.authorize(a,p);assert.throws(()=>f.service.execute(b,permit));assert.equal(a.synthetic.writes.length+b.synthetic.writes.length,0);f.service.execute(a,permit);await f.service.settle(a.id);assert.equal(f.service.status(a.id).finalStatus,'SUCCESS');assert.deepEqual(f.durable.list(b.id),[]);assert.throws(()=>f.service.execute(a,permit));}finally{await f.cleanup();}});

for(const watchStatus of['UNKNOWN','SUCCESS'])test('REFINE no-effect watch '+watchStatus+' retains both costs and UID UNKNOWN after restart',async()=>{const f=fixture({refine:true,apply:false,watchStatus}),t=f.session();let restart;try{const r=await f.execute(t,await f.displayed(t,refineParameters()));assert.equal(r.status.finalStatus,'UNKNOWN');assert.equal(r.record.actions[0].unresolvedWrite,true);assert.equal(iron(r.record.runBudget.reserved.resources),4);assert.equal(stones(r.record.runBudget.reserved.resources),2);assert.deepEqual(r.record.runBudget.reserved.uids,refineClaims().uids);assert.equal(t.synthetic.writes.length,1);await assert.rejects(f.displayed(t,refineParameters()));restart=fixture({refine:true,historyFile:f.file});const next=restart.session();await assert.rejects(restart.displayed(next,refineParameters()),{code:'RECOVERY_UNCERTAIN'});assert.equal(next.synthetic.writes.length,0);}finally{await restart?.cleanup();await f.cleanup();}});

for(const change of['wrong-stone','wrong-iron','extra-item','one-mirror','double-refine','level-changed','star-changed','other-owner-power','other-equipment','equipment-attr'])test('REFINE after-read '+change+' stays UNKNOWN without retry',async()=>{const f=fixture({refine:true}),t=f.session();try{t.synthetic.onWrite=()=>{const s=t.synthetic;if(change==='wrong-stone')s.stock.set('精炼石',19);if(change==='wrong-iron')s.stock.set('精铁',27);if(change==='extra-item')s.stock.set('extra',1);if(change==='one-mirror')s.heroes[0].equips[0].refineLv=0;if(change==='double-refine'){s.pool[0].refineLv++;s.heroes[0].equips[0].refineLv++;}if(change==='level-changed'){s.pool[0].level++;s.heroes[0].equips[0].level++;}if(change==='star-changed'){s.pool[0].star++;s.heroes[0].equips[0].star++;}if(change==='other-owner-power')s.heroes[1].power='42';if(change==='other-equipment')s.pool[2].refineLv++;if(change==='equipment-attr'){s.pool[0].attr[0].value++;s.heroes[0].equips[0].attr[0].value++;}};const r=await f.execute(t,await f.displayed(t,refineParameters()));assert.equal(r.status.finalStatus,'UNKNOWN');assert.equal(r.record.actions[0].unresolvedWrite,true);assert.equal(iron(r.record.runBudget.reserved.resources),4);assert.equal(stones(r.record.runBudget.reserved.resources),2);assert.deepEqual(r.record.runBudget.reserved.uids,refineClaims().uids);assert.equal(t.synthetic.writes.length,1);await assert.rejects(f.displayed(t,refineParameters()));}finally{await f.cleanup();}});

test('REFINE stop and late cancelled watch preserve zero-before or UNKNOWN-after dispatch boundaries',async()=>{const f=fixture({refine:true}),t=f.session();try{const permit=f.authorize(t,await f.displayed(t,refineParameters()));f.service.execute(t,permit);f.service.stop(t.id);await f.service.settle(t.id);assert.equal(t.synthetic.writes.length,0);assert.equal(f.service.status(t.id).finalStatus,'CANCELLED');}finally{await f.cleanup();}const g=fixture({refine:true}),u=g.session();let release;try{u.synthetic.onWatch=()=>{queueMicrotask(()=>u.abort.abort());return new Promise(resolve=>release=resolve);};const r=await g.execute(u,await g.displayed(u,refineParameters()));assert.equal(r.status.finalStatus,'UNKNOWN');assert.equal(u.synthetic.writes.length,1);assert.equal(stones(r.record.runBudget.reserved.resources),2);const reads=u.synthetic.reads.length,final=structuredClone(g.durable.list(u.id)[0]);release();await new Promise(setImmediate);assert.equal(u.synthetic.reads.length,reads);assert.deepEqual(g.durable.list(u.id)[0],final);assert.equal(createExecutionHistory({file:g.file}).unresolved(u.id),true);}finally{release?.();await g.cleanup();}});

for(const mode of['enough','stone-short','iron-short','uid-missing','same-uid'])test('REFINE Workflow finite parent '+mode+' enforces two resources and shared equipment UID',async()=>{const f=fixture({refine:true}),t=f.session();try{const a=await f.service.surveyModule(t,moduleId,refineParameters()),bParams=mode==='same-uid'?refineParameters():refineParameters('B'),b=await f.service.surveyModule(t,moduleId,bParams),aId=a.view.candidates.find(r=>r.executable).actionId,bId=b.view.candidates.find(r=>r.executable).actionId;const budget=refineClaims(mode==='iron-short'?6:20,mode==='stone-short'?3:10,mode==='uid-missing'||mode==='same-uid'?[ids.A]:[ids.A,ids.B]);const graph={version:1,id:'refine-parent-'+mode,name:'Offline refine '+mode,budget,nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:moduleId,parameters:refineParameters(),selection:aId},{id:'v1',type:'VERIFY',module:moduleId},{id:'b',type:'ACTION',module:moduleId,parameters:bParams,selection:bId},{id:'v2',type:'VERIFY',module:moduleId},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'v1'},{from:'v1',to:'b'},{from:'b',to:'v2'},{from:'v2',to:'z'}]},runner=f.runner(t),first=await runner.start(t.id,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(t.synthetic.writes.length,0);assert.equal((await f.execute(t,first.plan)).status.finalStatus,'SUCCESS');t.synthetic.stock.set('精铁',1000);t.synthetic.stock.set('精炼石',1000);let final;try{const next=await runner.resume();if(next.status==='AWAITING_AUTHORIZATION'){await f.execute(t,next.plan);final=await runner.resume();}else final=next;}catch{final=null;}if(mode==='enough'){assert.equal(final?.status,'COMPLETED');assert.equal(t.synthetic.writes.length,2);assert.equal(iron(final.runBudget.reserved.resources),8);assert.equal(stones(final.runBudget.reserved.resources),4);}else{assert.notEqual(final?.status,'COMPLETED');assert.equal(t.synthetic.writes.length,1);const parent=f.service.workflowBudget(t.id)??final?.runBudget;if(parent){assert.equal(iron(parent.reserved.resources),4);assert.equal(stones(parent.reserved.resources),2);}}}finally{await f.cleanup();}});

test('REFINE HTTP uses original CSRF/permit pipeline and rejects action/transport/cost/UID injection before reads',async()=>{const f=fixture({refine:true,useConsole:true}),t=f.session();try{await f.call('/api/gameplay?module=equipment-growth');for(const extra of[{action:'level'},{action:'star-bulk'},{request:'EquipRefineRequest'},{body:{}},{costs:[]},{num:2},{refineLv:0},{universal:false},{allowPaid:true},{uid:9007199254740992}]){const r=await f.call('/api/gameplay/survey',{body:{module:moduleId,parameters:{...refineParameters(),...extra}}});assert.equal(r.status,400,JSON.stringify(extra));}assert.equal(t.synthetic.reads.length,0);for(const extra of[{authorized:false},{headers:{'x-cw-csrf':'forged'}},{headers:{origin:'https://invalid.example'}},{headers:{'content-type':'text/plain'}}])assert.equal((await f.call('/api/gameplay/survey',{body:{module:moduleId,parameters:refineParameters()},...extra})).status,403);assert.equal(t.synthetic.reads.length,0);const v=await f.call('/api/gameplay/survey',{body:{module:moduleId,parameters:refineParameters()}});assert.equal(v.status,200,JSON.stringify(v.data));const candidate=v.data.view.candidates.find(r=>r.executable);assert.equal(candidate.actionType,'REFINE');assert.equal(candidate.action,undefined);const p=await f.call('/api/operations/plan',{body:{module:moduleId,mode:'Manual',parameters:refineParameters(),selections:[candidate.actionId]}});assert.equal(p.status,200);assert.equal((await f.call('/api/operations/execute',{body:{batchId:p.data.batchId}})).status,403);assert.equal(t.synthetic.writes.length,0);const a=await f.call('/api/operations/authorize',{body:{batchId:p.data.batchId,planHash:p.data.planHash,approvedActionIds:p.data.actions.map(r=>r.actionId),resourceBudget:p.data.resourceBudget,confirm:true}});assert.equal(a.status,200);assert.equal((await f.call('/api/operations/execute',{body:a.data})).status,200);await f.service.settle(t.id);const h=await f.call('/api/operations/history');assert.equal(h.data.runs[0].finalStatus,'SUCCESS');assert.equal(h.data.runs[0].actions[0].actionType,'REFINE');assert.equal(t.synthetic.writes[0].name,'EquipRefineRequest');assert.deepEqual(f.counts(),{clients:0,collections:0});assert.equal(f.app.server.listening,false);}finally{await f.cleanup();}});

for(const firstMode of['LEVEL','REFINE'])test('shared equipment UID parent claim forbids '+firstMode+' then another growth mode on same UID',async()=>{const f=fixture({refine:true}),t=f.session();let release;try{release=f.service.claimWorkflow(t,'mixed-equipment-parent',{limits:refineClaims(20,10)});const first=firstMode==='LEVEL'?parameters():refineParameters(),next=firstMode==='LEVEL'?refineParameters():parameters();const p=await f.displayed(t,first,'mixed-equipment-parent');assert.equal((await f.execute(t,p)).status.finalStatus,'SUCCESS');t.synthetic.stock.set('精铁',1000);t.synthetic.stock.set('精炼石',1000);try{const q=await f.displayed(t,next,'mixed-equipment-parent');const result=await f.execute(t,q);assert.notEqual(result.status.finalStatus,'SUCCESS');}catch{}assert.equal(t.synthetic.writes.length,1);assert.equal(f.service.workflowBudget(t.id).reserved.uids.length,1);assert.deepEqual(f.service.workflowBudget(t.id).reserved.uids,[{type:'equipment',id:ids.A}]);}finally{release?.();await f.cleanup();}});

for(const boundary of['resource-await','dispatch-intent'])test('REFINE expired facts at '+boundary+' prevent dispatch and preserve appropriate UID/resource reservation',async t=>{let wall=1800000000000;t.mock.method(Date,'now',()=>wall);const f=fixture({refine:true}),target=f.session();try{const p=await f.displayed(target,refineParameters()),permit=f.authorize(target,p);let phase=false,changed=false;f.failPersist(record=>{const stage=record.actions?.[0]?.stages?.at(-1)?.stage;if(stage==='RESOURCE_PREFLIGHT')phase=true;if(boundary==='dispatch-intent'&&!changed&&stage==='DISPATCH_INTENT'){changed=true;wall+=30001;}return false;});target.synthetic.onRead=name=>{if(boundary==='resource-await'&&phase&&!changed&&name==='AllResourceRequest'){changed=true;wall+=30001;}};f.service.execute(target,permit);await f.service.settle(target.id);assert.equal(changed,true);assert.equal(target.synthetic.writes.length,0);assert.notEqual(f.service.status(target.id).finalStatus,'SUCCESS');const record=f.durable.list(target.id)[0];assert.equal(record.actions[0].dispatched,false);if(boundary==='dispatch-intent'){assert.equal(iron(record.runBudget.reserved.resources),4);assert.equal(stones(record.runBudget.reserved.resources),2);assert.deepEqual(record.runBudget.reserved.uids,refineClaims().uids);}else{assert.equal(iron(record.runBudget.reserved.resources),0);assert.equal(stones(record.runBudget.reserved.resources),0);assert.deepEqual(record.runBudget.reserved.uids,[]);}}finally{await f.cleanup();}});

test('REFINE dual-material and equipment UID intent must be durable before watched transport',async()=>{const f=fixture({refine:true}),t=f.session();try{const p=await f.displayed(t,refineParameters());let hit=false;f.failPersist(record=>{if(stones(record.runBudget?.reserved.resources??[])>0&&(record.runBudget?.reserved.uids??[]).length){hit=true;return true;}return false;});f.service.execute(t,f.authorize(t,p));await f.service.settle(t.id);assert.equal(hit,true);assert.equal(t.synthetic.writes.length,0);assert.notEqual(f.service.status(t.id).finalStatus,'SUCCESS');}finally{f.failPersist(()=>false);await f.cleanup();}});

const putOnParameters = () => ({ action: 'put-on', heroId: 'A', uid: ids.idle });
const putOnClaims = () => ({ resources: [], quotas: [], uids: [{ type: 'equipment', id: ids.idle }] });

test('PUT-ON confirms exact idle UID in empty typed slot with zero stock delta and durable UID-only intent', async () => {
  const f = fixture({ putOn: true, watchStatus: 'UNKNOWN' }), session = f.session();
  try {
    const params = putOnParameters(), state = session.synthetic;
    const surveyed = await f.service.surveyModule(session, moduleId, params);
    const candidate = surveyed.view.candidates.find(row => row.executable);
    assert.ok(candidate, JSON.stringify(surveyed.view.candidates));
    assert.deepEqual(candidate.target, { heroId: 'A', uid: ids.idle, type: '饰品' });
    assert.equal(candidate.action, undefined);
    assert.equal(candidate.configEvidence, undefined);
    assert.equal(protocol.PutOnEquipResponse, undefined);

    const p = await f.displayed(session, params);
    assert.equal(p.actions[0].actionType, 'PUT-ON');
    assert.deepEqual(p.resourceBudget, []);
    assert.deepEqual(p.budgetClaims, putOnClaims());
    assert.equal(p.actions[0].action, undefined);
    assert.throws(() => f.service.execute(session, { batchId: p.batchId }));
    assert.equal(state.writes.length, 0);
    const pool = structuredClone(state.pool), heroes = structuredClone(state.heroes), stock = new Map(state.stock);
    const result = await f.execute(session, p), row = result.record.actions[0];
    assert.equal(result.status.finalStatus, 'SUCCESS');
    assert.equal(row.verification.status, 'CONFIRMED');
    assert.equal(row.requestStatus, 'UNKNOWN', 'watch alone did not confirm the effect');
    assert.equal(state.writes.length, 1);
    const [sent] = state.writes;
    assert.equal(sent.name, 'PutOnEquipRequest');
    assert.deepEqual(sent.body, { uid: ids.idle, heroId: 'A' });
    assert.equal(sent.durableBeforeWrite.actions[0].dispatchEvidence.state, 'MAY_HAVE_DISPATCHED');
    assert.equal(sent.durableBeforeWrite.actions[0].stages.at(-1).stage, 'DISPATCH_INTENT');
    assert.deepEqual(sent.durableBeforeWrite.runBudget.reserved, putOnClaims());
    assert.deepEqual(state.pool, pool);
    assert.deepEqual(state.stock, stock);
    assert.deepEqual(state.heroes[1], heroes[1]);
    assert.deepEqual(state.heroes[0].equips, [...heroes[0].equips, pool.find(row => row.uid === ids.idle)]);
    assert.deepEqual(row.beforeInventory, row.afterInventory);
    assert.equal(createExecutionHistory({ file: f.file }).unresolved(session.id), false);
    assert.throws(() => f.service.execute(session, result.permit));
  } finally { await f.cleanup(); }
});

test('PUT-ON no-effect watch SUCCESS remains UNKNOWN with the zero-cost UID held across restart', async () => {
  const f = fixture({ putOn: true, apply: false, watchStatus: 'SUCCESS' }), session = f.session();
  let restarted;
  try {
    const r = await f.execute(session, await f.displayed(session, putOnParameters()));
    assert.equal(r.status.finalStatus, 'UNKNOWN');
    assert.equal(r.record.actions[0].requestStatus, 'SUCCESS');
    assert.equal(r.record.actions[0].verification.status, 'UNCONFIRMED');
    assert.equal(r.record.actions[0].unresolvedWrite, true);
    assert.deepEqual(r.record.runBudget.reserved, putOnClaims());
    assert.equal(session.synthetic.writes.length, 1);
    assert.throws(() => f.service.execute(session, r.permit));
    restarted = fixture({ putOn: true, historyFile: f.file });
    const next = restarted.session();
    await assert.rejects(restarted.displayed(next, putOnParameters()), { code: 'RECOVERY_UNCERTAIN' });
    assert.equal(next.synthetic.writes.length, 0);
    assert.equal(restarted.durable.unresolved(next.id), true);
  } finally { await restarted?.cleanup(); await f.cleanup(); }
});

test('PUT-ON zero-cost batch cannot proceed without the exact UID in its parent authorization', async () => {
  const f = fixture({ putOn: true }), session = f.session();
  let release;
  try {
    const parent = 'put-on-parent';
    release = f.service.claimWorkflow(session, parent, { limits: { resources: [], quotas: [], uids: [{ type: 'equipment', id: ids.B }] } });
    const p = await f.displayed(session, putOnParameters(), parent);
    assert.deepEqual(p.resourceBudget, []);
    assert.deepEqual(p.budgetClaims, putOnClaims());
    const permit = f.authorize(session, p);
    assert.throws(() => f.service.execute(session, permit), { code: 'RUN_BUDGET_INVALID' });
    assert.equal(session.synthetic.writes.length, 0);
    assert.deepEqual(f.service.workflowBudget(session.id).reserved, { resources: [], quotas: [], uids: [] });
    assert.equal(f.durable.list(session.id)[0].actions[0].dispatchEvidence.state, 'NOT_DISPATCHED');
  } finally { release?.(); await f.cleanup(); }
});

const starParameters=(heroId='A')=>({...parameters(heroId),action:'star'});
const starClaims=(iron=4,stone=1,uids=[ids.A])=>({resources:[{id:'装备升星石',num:stone},{id:'精铁',num:iron}],quotas:[],uids:uids.map(id=>({type:'equipment',id}))});
test('STAR Service confirms full mirrors and exact materials after durable intent, without another executor',async()=>{
 const f=fixture({star:true}),t=f.session();try{const p=await f.displayed(t,starParameters());assert.deepEqual(p.budgetClaims,starClaims());const r=await f.execute(t,p);assert.equal(r.status.finalStatus,'SUCCESS');assert.equal(r.record.actions[0].verification.status,'CONFIRMED');assert.deepEqual(t.synthetic.writes[0].body,{uid:ids.A});assert.equal(t.synthetic.writes[0].durableBeforeWrite.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(t.synthetic.writes[0].durableBeforeWrite.runBudget.reserved,starClaims());assert.equal(t.synthetic.pool[0].star,1);assert.equal(t.synthetic.pool[0].level,1);assert.equal(t.synthetic.pool[0].attr.length,2);assert.equal(createExecutionHistory({file:f.file}).unresolved(t.id),false);assert.throws(()=>f.service.execute(t,r.permit));}finally{await f.cleanup();}
});
test('STAR UNKNOWN retains both resources and UID across process restart without replay',async()=>{
 const f=fixture({star:true,apply:false}),t=f.session();let other;try{const r=await f.execute(t,await f.displayed(t,starParameters()));assert.equal(r.status.finalStatus,'UNKNOWN');assert.equal(r.record.actions[0].unresolvedWrite,true);assert.deepEqual(r.record.runBudget.reserved,starClaims());await assert.rejects(f.displayed(t,starParameters()),{code:'RESPONSE_UNCERTAIN'});other=fixture({star:true,historyFile:f.file});const fresh=other.session();await assert.rejects(other.displayed(fresh,starParameters()),{code:'RECOVERY_UNCERTAIN'});assert.equal(fresh.synthetic.writes.length,0);assert.equal(t.synthetic.writes.length,1);}finally{await other?.cleanup();await f.cleanup();}
});
test('STAR authorization binds all star costs and cannot cross account, player, world, connection or generation',async()=>{
 for(const kind of ['config','account','player','world','generation','connection']){
  const f=fixture({star:true}),t=f.session();try{const p=await f.displayed(t,starParameters());if(kind==='config'){f.config(c=>c.tables.EquipUpStarCfg.data[0].upCosts[0][1]++);assert.throws(()=>f.authorize(t,p),{code:'STALE_PLAN'});}else{const permit=f.authorize(t,p);if(kind==='account'){const b=f.session('account-B');assert.throws(()=>f.service.execute(b,permit));assert.equal(b.synthetic.writes.length,0);}else{if(kind==='player')t.player.playerId='99';if(kind==='world')t.player.worldId=2;if(kind==='generation'){t.generation++;t.client.factContext.generation++;}if(kind==='connection'){t.connectionId+='new';t.client.factContext.connectionId+='new';}try{f.service.execute(t,permit);await f.service.settle(t.id);}catch{}assert.notEqual(f.service.status(t.id).finalStatus,'SUCCESS');}}assert.equal(t.synthetic.writes.length,0);}finally{await f.cleanup();}
 }
});
test('STAR requires persisted two-material UID reservation and dispatch intent',async()=>{
 for(const kind of ['budget','intent']){const f=fixture({star:true}),t=f.session();try{const p=await f.displayed(t,starParameters());f.failPersist(r=>kind==='budget'?(r.runBudget?.reserved.resources??[]).some(row=>row.id==='装备升星石'):r.actions?.some(row=>row.dispatchEvidence?.state==='MAY_HAVE_DISPATCHED'));f.service.execute(t,f.authorize(t,p));await f.service.settle(t.id);assert.equal(t.synthetic.writes.length,0);assert.notEqual(f.service.status(t.id).finalStatus,'SUCCESS');}finally{f.failPersist(()=>false);await f.cleanup();}}
});
test('STAR cancellation after dispatch keeps exact late inventory effect UNKNOWN',async()=>{
 const f=fixture({star:true}),t=f.session();let finish;try{t.synthetic.onWatch=()=>new Promise(resolve=>{finish=resolve;});const p=await f.displayed(t,starParameters());f.service.execute(t,f.authorize(t,p));for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(finish);f.service.stop(t.id);finish();await f.service.settle(t.id);const record=f.durable.list(t.id)[0];assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);await assert.rejects(f.displayed(t,starParameters()));assert.equal(t.synthetic.writes.length,1);}finally{finish?.();await f.cleanup();}
});
for(const mode of ['enough','iron-short','stone-short','uid-missing'])test('STAR Workflow shares exact resources and UID parent: '+mode,async()=>{
 const f=fixture({star:true}),t=f.session();try{
  const nodes=[{id:'s',type:'START'}];for(const h of ['A','B']){const p=starParameters(h),v=await f.service.surveyModule(t,moduleId,p);nodes.push({id:h,type:'ACTION',module:moduleId,parameters:p,selection:v.view.candidates[0].actionId},{id:'v'+h,type:'VERIFY',module:moduleId});}nodes.push({id:'z',type:'STOP'});
  const graph={version:1,id:'star-'+mode,name:'Star parent',budget:starClaims(mode==='iron-short'?7:8,mode==='stone-short'?1:2,mode==='uid-missing'?[ids.A]:[ids.A,ids.B]),nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))};
  const runner=f.runner(t),first=await runner.start(t.id,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal((await f.execute(t,first.plan)).status.finalStatus,'SUCCESS');t.synthetic.stock.set('精铁',10000);t.synthetic.stock.set('装备升星石',1000);let final;try{const next=await runner.resume();if(next.status==='AWAITING_AUTHORIZATION'){await f.execute(t,next.plan);final=await runner.resume();}else final=next;}catch{}assert.equal(t.synthetic.writes.length,mode==='enough'?2:1);assert.equal(final?.status==='COMPLETED',mode==='enough');
 }finally{await f.cleanup();}
});
test('STAR and LEVEL share the same one-use equipment UID within a parent',async()=>{
 const f=fixture({star:true}),t=f.session();let release;try{release=f.service.claimWorkflow(t,'star-level-parent',{limits:starClaims(30,10)});assert.equal((await f.execute(t,await f.displayed(t,starParameters(),'star-level-parent'))).status.finalStatus,'SUCCESS');try{await f.execute(t,await f.displayed(t,parameters(),'star-level-parent'));}catch{}assert.equal(t.synthetic.writes.length,1);assert.deepEqual(f.service.workflowBudget(t.id).reserved.uids,[{type:'equipment',id:ids.A}]);}finally{release?.();await f.cleanup();}
});
test('STAR HTTP preserves CSRF, exact cropped plan, explicit permit and account history',async()=>{
 const f=fixture({star:true,useConsole:true}),t=f.session();try{
  await f.call('/api/gameplay?module=equipment-growth');const p=starParameters();
  for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}},{headers:{origin:'https://invalid.example'}}])assert.equal((await f.call('/api/gameplay/survey',{body:{module:moduleId,parameters:p},...extra})).status,403);
  for(const extra of [{count:2},{request:'EquipStarUpRequest'},{targetStar:1},{universal:false},{uid:9007199254740992}])assert.equal((await f.call('/api/gameplay/survey',{body:{module:moduleId,parameters:{...p,...extra}}})).status,400);assert.equal(t.synthetic.reads.length,0);
  const v=await f.call('/api/gameplay/survey',{body:{module:moduleId,parameters:p}});assert.equal(v.status,200);const candidate=v.data.view.candidates.find(row=>row.executable);assert.equal(candidate.actionType,'STAR');assert.equal(candidate.action,undefined);
  const plan=await f.call('/api/operations/plan',{body:{module:moduleId,mode:'Manual',parameters:p,selections:[candidate.actionId]}});assert.equal(plan.status,200);assert.equal(t.synthetic.writes.length,0);
  const auth=await f.call('/api/operations/authorize',{body:{batchId:plan.data.batchId,planHash:plan.data.planHash,approvedActionIds:plan.data.actions.map(row=>row.actionId),resourceBudget:plan.data.resourceBudget,confirm:true}});assert.equal(auth.status,200);
  f.session('account-B');assert.equal((await f.call('/api/operations/execute',{id:'account-B',body:auth.data})).status,409);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(t.id);assert.equal((await f.call('/api/operations/history')).data.runs[0].finalStatus,'SUCCESS');assert.equal(t.synthetic.writes[0].name,'EquipStarUpRequest');assert.deepEqual(f.counts(),{clients:0,collections:0});assert.equal(f.app.server.listening,false);
 }finally{await f.cleanup();}
});

for(const mode of ['level','refine','star','put-on'])test('W19 equipment '+mode+' refusal survives restart, reconnect and returning to original role',async()=>{
 const opts={apply:false,watchStatus:'REJECTED',refine:mode==='refine',star:mode==='star',putOn:mode==='put-on'},f=fixture(opts),a=f.session();let next;
 const p=mode==='refine'?refineParameters():mode==='star'?starParameters():mode==='put-on'?putOnParameters():parameters();
 try{assert.equal((await f.execute(a,await f.displayed(a,p))).record.finalStatus,'REJECTED');const bytes=fs.readFileSync(f.file,'utf8');
 next=fixture({...opts,historyFile:f.file});const b=next.session();b.generation=b.client.factContext.generation=2;b.connectionId=b.client.factContext.connectionId='replacement-equipment';
 await assert.rejects(next.displayed(b,p),{code:'REJECTION_MEMORY_ACTIVE'});b.player.worldId=1000002;assert.equal((await next.displayed(b,p)).actions.length,1);b.player.worldId=1000001;await assert.rejects(next.displayed(b,p),{code:'REJECTION_MEMORY_ACTIVE'});
 assert.equal(next.service.executionMemory(b.id).events.length,1);assert.equal(b.synthetic.writes.length,0);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
 }finally{await next?.cleanup();await f.cleanup();}
});
