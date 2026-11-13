import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner } from '../src/workflow.mjs';
import { loadProtocol } from '../src/proto.mjs';

// The real registered Function, OperationService and Workflow are used with local
// real protocol codecs and synthetic transport only. No Runtime/client is created.
const protocol = loadProtocol();
const wire = (name, body) => protocol[name].decode(protocol[name].encode(body).finish());
const config = () => ({ tables: {
  HeroCfg: { data: [{ id: 'A', quality: 'BLUE', universalItemId: '万能碎片' }, { id: 'B', quality: 'BLUE', universalItemId: '万能碎片' }] },
  HeroUpgradeCfg: { data: [{ level: 1, exp: 0, reqPlayerLv: 1 }, { level: 2, exp: 5, reqPlayerLv: 1 }, { level: 3, exp: 8, reqPlayerLv: 2 }] },
  HeroStarCfg: { data: [{ star: 0, consumeBlue: 0, maxSkillLevel: [1, 1] }, { star: 1, consumeBlue: 3, maxSkillLevel: [1, 1] }, { star: 2, consumeBlue: 5, maxSkillLevel: [2, 2] }] },
  HeroSkillUpCfg: { data: [{ quality: 'BLUE', level: 2, costArr: [['技能书', 4], ['技能书', 4]] }] },
} });
const parameters = (action = 'level', heroId = 'A') => ({ heroId, action, ...(action === 'skill' ? { skillIdx: 1 } : {}) });
const claims = amount => ({ resources: [{ id: '英雄经验', num: amount }], quotas: [], uids: [] });
const amount = rows => rows.find(row => row.id === '英雄经验')?.num ?? 0;
function fixture({ enabled = true, apply = true, historyFile, serviceClock = Date.now } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-hero-service-')), file = historyFile ?? path.join(dir, 'history.json'), journal = [], sessions = new Map(), runners = [];
  const durable = createExecutionHistory({ file }), moduleSettings = createModuleSettings({ file: path.join(dir, 'modules.json'), modules: GAMEPLAY_MODULES });
  let gameConfig = config(), failPersist = () => false;
  const history = { ...durable, put(record) { if (failPersist(record)) throw Error('synthetic hero persistence unavailable'); journal.push(structuredClone(record)); return durable.put(record); } };
  const service = createOperationService({ protocol, modules: GAMEPLAY_MODULES, moduleSettings, history, clock:serviceClock, getConfig: () => structuredClone(gameConfig), loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }), loadProduction: () => ({ config: { version: 1, enabled: false } }) });
  function session(accountId = 'account-A') {
    const state = { heroes: ['A', 'B'].map(heroId => ({ heroId, level: 1, star: 2, power: '9007199254740993', skillLevels: [1, 1], attributes: [{ attr: 1, value: 1.5 }] })), stock: new Map([['英雄经验', 30], ['A碎片', 10], ['B碎片', 10], ['技能书', 20], ['万能碎片', 20]]), writes: [], reads: [], apply, onRead: null, onWrite: null };
    const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Map(),
      markUnverifiedWrite(name, body) { this.uncertainWrites.set(JSON.stringify({ name, body }), true); }, confirmWatchedWrite(name, body) { this.uncertainWrites.delete(JSON.stringify({ name, body })); },
      mutate(name, body) {
        state.writes.push({ name, body: structuredClone(body), durableBeforeWrite: structuredClone(journal.at(-1)) });
        const row = state.heroes.find(value => value.heroId === body.heroId);
        if (state.apply) {
          if (name === 'HeroLevelUpRequest') { const cost = row.level === 1 ? 5 : 8; row.level++; state.stock.set('英雄经验', state.stock.get('英雄经验') - cost); }
          if (name === 'HeroSkillLevelUpRequest') { row.skillLevels[body.skillIdx - 1]++; state.stock.set('技能书', state.stock.get('技能书') - 4); }
          if (name === 'HeroFragExchangeRequest') { const source = gameConfig.tables.HeroCfg.data.find(value => value.id === body.heroId).universalItemId; state.stock.set(source, state.stock.get(source) - body.num); state.stock.set(body.fragItemId, (state.stock.get(body.fragItemId) ?? 0) + body.num); }
          if (name === 'HeroStarUpRequest') { row.star++; state.stock.set(row.heroId + '碎片', state.stock.get(row.heroId + '碎片') - 5); }
        }
        state.onWrite?.(name, body);
        return row;
      },
      async request(name, body, response, _timeout, options) {
        wire(name, body);
        if (options?.mutate) return wire(response, { nextStar: this.mutate(name, body) });
        state.reads.push(name); await state.onRead?.(name);
        if (name === 'AllHeroRequest') return wire(response, { heroes: state.heroes });
        if (name === 'AllItemRequest') return wire(response, { items: [...state.stock].map(([itemId, num]) => ({ itemId, num })) });
        if (name === 'AllResourceRequest') return wire(response, { list: [] });
        throw Error('Unexpected synthetic hero read ' + name);
      },
      async sendWatch(name, body) { wire(name, body); this.mutate(name, body); return { status: 'UNKNOWN' }; },
    };
    const result = { id: accountId, client, state: 'READY', player: { playerId: accountId === 'account-A' ? '1001' : '1002', worldId: 1, level: 2 }, generation: 1, connectionId: 'offline-hero-' + accountId, abort: new AbortController(), busy: null, loop: { running: false }, synthetic: state };
    if (enabled) moduleSettings.save(accountId, 'heroes', { enabled: true });
    sessions.set(accountId, result); return result;
  }
  async function displayed(target, p = parameters(), workflowId = null) {
    const surveyed = await service.surveyModule(target, 'heroes', p, { workflowId }), candidate = surveyed.view.candidates.find(row => row.executable);
    assert.ok(candidate, 'expected executable synthetic hero candidate');
    return service.plan(target, { module: 'heroes', mode: 'Manual', parameters: p, selections: [candidate.actionId] }, { workflowId });
  }
  function authorize(target, planned) { return service.authorize(target, { batchId: planned.batchId, planHash: planned.planHash, approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: planned.resourceBudget, confirm: true }); }
  async function execute(target, planned) { const permit = authorize(target, planned), started = service.execute(target, permit); await service.settle(target.id); return { permit, started, record: durable.list(target.id).find(row => row.planSummary.batchId === planned.batchId), status: service.status(target.id) }; }
  function runner(target) { const result = createWorkflowRunner({ operations: service, modules: GAMEPLAY_MODULES, getSession: id => sessions.get(id), claim: (id, runId, opts) => service.claimWorkflow(sessions.get(id), runId, opts), isCurrent: (session, generation, client) => session === target && session.generation === generation && session.client === client }); runners.push(result); return result; }
  async function cleanup() { for (const runner of runners) runner.stop(); await Promise.all(runners.map(runner => runner.settle())); for (const target of sessions.values()) target.abort.abort(); await Promise.all([...sessions.keys()].map(id => service.settle(id))); assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); }
  return { dir, file, service, durable, journal, moduleSettings, session, displayed, authorize, execute, runner, cleanup, config: mutate => mutate(gameConfig), failPersist: predicate => { failPersist = predicate; } };
}

for (const action of ['level', 'skill', 'star']) test('registered heroes ' + action + ' completes Service authorization and durable confirmed history', async () => {
  const f = fixture(), target = f.session();
  try {
    if (action === 'star') target.synthetic.heroes[0].star = 1;
    const planned = await f.displayed(target, parameters(action)); assert.equal(planned.actions.length, 1); assert.equal(planned.actions[0].action, undefined); assert.equal(planned.accountId, target.id);
    const result = await f.execute(target, planned), row = result.record.actions[0]; assert.equal(result.status.finalStatus, 'SUCCESS'); assert.equal(row.result, 'SUCCESS'); assert.equal(row.verification.status, 'CONFIRMED'); assert.equal(row.beforeInventoryReliable, true); assert.equal(row.afterInventoryReliable, true); assert.equal(row.dispatched, true); assert.equal(target.synthetic.writes.length, 1);
    assert.equal(row.stages.some(value => value.stage === 'VERIFIED'), true); assert.equal(target.synthetic.writes[0].durableBeforeWrite.actions[0].dispatchEvidence.state, 'MAY_HAVE_DISPATCHED');
    assert.equal(result.record.runBudget.state, 'CLOSED'); assert.equal(result.record.runBudget.outcome, 'SUCCESS'); assert.equal(result.record.runBudget.resumable, false);
    const restarted = createExecutionHistory({ file: f.file }); assert.equal(restarted.list(target.id)[0].actions[0].verification.status, 'CONFIRMED'); assert.equal(restarted.unresolved(target.id), false);
    assert.throws(() => f.service.execute(target, result.permit));
  } finally { await f.cleanup(); }
});

test('registered hero module stays disabled by default and cannot be planned through raw request injection', async () => {
  const f = fixture({ enabled: false }), target = f.session();
  try {
    const surveyed = await f.service.surveyModule(target, 'heroes', parameters()); assert.equal(surveyed.config.enabled, false); assert.equal(surveyed.view.candidates.some(row => row.executable), false);
    await assert.rejects(f.service.plan(target, { module: 'heroes', mode: 'Manual', parameters: { ...parameters(), request: 'HeroLevelUpRequest' }, selections: ['fake'] }));
    assert.equal(target.synthetic.writes.length, 0); assert.equal(f.durable.list(target.id).length, 0);
  } finally { await f.cleanup(); }
});

test('hero authorization binds module and relevant config but ignores unrelated business tables', async () => {
  const f = fixture(), target = f.session();
  try {
    let planned = await f.displayed(target); f.config(cfg => { cfg.tables.HeroUpgradeCfg.data[1].exp = 6; }); assert.throws(() => f.authorize(target, planned), { code: 'STALE_PLAN' });
    f.config(cfg => { cfg.tables.HeroUpgradeCfg.data[1].exp = 5; }); planned = await f.displayed(target); f.service.saveModuleConfig(target.id, { module: 'heroes', config: { enabled: false } }); assert.throws(() => f.authorize(target, planned));
    f.service.saveModuleConfig(target.id, { module: 'heroes', config: { enabled: true } }); planned = await f.displayed(target); f.config(cfg => { cfg.tables.BuildingCfg = { data: [{ id: 'unrelated' }] }; }); assert.equal((await f.execute(target, planned)).status.finalStatus, 'SUCCESS');
    assert.equal(target.synthetic.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('hero permit cannot cross accounts and separate account histories remain isolated', async () => {
  const f = fixture(), a = f.session(), b = f.session('account-B');
  try {
    const planned = await f.displayed(a), permit = f.authorize(a, planned); assert.throws(() => f.service.execute(b, permit)); assert.equal(b.synthetic.writes.length, 0);
    f.service.execute(a, permit); await f.service.settle(a.id); assert.equal(f.durable.list(a.id)[0].finalStatus, 'SUCCESS'); assert.equal(f.durable.list(b.id).length, 0);
    assert.equal((await f.execute(b, await f.displayed(b))).status.finalStatus, 'SUCCESS'); assert.equal(a.synthetic.writes.length, 1); assert.equal(b.synthetic.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('hero UNKNOWN is durable, retains budget, blocks retry and stays blocked after restart', async () => {
  const f = fixture({ apply: false }), target = f.session(); let restarted;
  try {
    const planned = await f.displayed(target), result = await f.execute(target, planned), row = result.record.actions[0]; assert.equal(result.status.finalStatus, 'UNKNOWN'); assert.equal(row.unresolvedWrite, true); assert.equal(row.verification.status, 'UNCONFIRMED'); assert.equal(amount(result.record.runBudget.reserved.resources), 5); assert.equal(result.record.runBudget.state, 'CLOSED');
    await assert.rejects(f.displayed(target), { code: 'RESPONSE_UNCERTAIN' }); assert.equal(target.synthetic.writes.length, 1);
    restarted = fixture({ historyFile: f.file }); const fresh = restarted.session(); await assert.rejects(restarted.displayed(fresh), { code: 'RECOVERY_UNCERTAIN' }); assert.equal(fresh.synthetic.writes.length, 0); assert.equal(restarted.durable.list(fresh.id)[0].finalStatus, 'UNKNOWN');
  } finally { await restarted?.cleanup(); await f.cleanup(); }
});

test('hero stop before dispatch sends nothing and stop after dispatch preserves UNKNOWN', async () => {
  const f = fixture(), target = f.session();
  try {
    const planned = await f.displayed(target), permit = f.authorize(target, planned); f.service.execute(target, permit); f.service.stop(target.id); await f.service.settle(target.id); assert.equal(target.synthetic.writes.length, 0); assert.equal(f.service.status(target.id).finalStatus, 'CANCELLED');
  } finally { await f.cleanup(); }
  const g = fixture(), second = g.session();
  try {
    second.synthetic.onWrite = () => { second.abort.abort(); }; const result = await g.execute(second, await g.displayed(second)); assert.equal(result.status.finalStatus, 'UNKNOWN'); assert.equal(result.record.actions[0].unresolvedWrite, true); assert.equal(second.synthetic.writes.length, 1);
  } finally { await g.cleanup(); }
});

test('hero generation change during fresh survey prevents dispatch', async () => {
  const f = fixture(), target = f.session();
  try {
    const planned = await f.displayed(target); target.synthetic.onRead = name => { if (name === 'AllHeroRequest') target.generation++; };
    const result = await f.execute(target, planned); assert.equal(target.synthetic.writes.length, 0); assert.notEqual(result.status.finalStatus, 'SUCCESS');
  } finally { await f.cleanup(); }
});

test('hero reserved budget must persist before transport, history failure preserves zero writes', async () => {
  const f = fixture(), target = f.session();
  try {
    const planned = await f.displayed(target); f.failPersist(record => amount(record.runBudget?.reserved.resources ?? []) > 0);
    f.service.execute(target, f.authorize(target, planned)); await f.service.settle(target.id); assert.equal(target.synthetic.writes.length, 0); assert.notEqual(f.service.status(target.id).finalStatus, 'SUCCESS');
  } finally { f.failPersist(() => false); await f.cleanup(); }
});

for (const limit of [8, 10]) test('real registered two-hero Workflow shares ' + limit + '-unit parent across ACTION nodes', async () => {
  const f = fixture(), target = f.session();
  try {
    const a = await f.service.surveyModule(target, 'heroes', parameters()), b = await f.service.surveyModule(target, 'heroes', parameters('level', 'B'));
    const aId = a.view.candidates.find(row => row.executable).actionId, bId = b.view.candidates.find(row => row.executable).actionId;
    const graph = { version: 1, id: 'hero-budget-' + limit, name: 'Offline hero budget ' + limit, budget: claims(limit), nodes: [
      { id: 's', type: 'START' }, { id: 'a', type: 'ACTION', module: 'heroes', parameters: parameters(), selection: aId }, { id: 'v1', type: 'VERIFY', module: 'heroes' },
      { id: 'b', type: 'ACTION', module: 'heroes', parameters: parameters('level', 'B'), selection: bId }, { id: 'v2', type: 'VERIFY', module: 'heroes' }, { id: 'z', type: 'STOP' },
    ], edges: [{ from: 's', to: 'a' }, { from: 'a', to: 'v1' }, { from: 'v1', to: 'b' }, { from: 'b', to: 'v2' }, { from: 'v2', to: 'z' }] };
    const runner = f.runner(target), first = await runner.start(target.id, graph); assert.equal(first.status, 'AWAITING_AUTHORIZATION'); assert.equal(target.synthetic.writes.length, 0);
    assert.equal((await f.execute(target, first.plan)).status.finalStatus, 'SUCCESS'); target.synthetic.stock.set('英雄经验', 1000);
    const second = await runner.resume(); assert.equal(second.status, 'AWAITING_AUTHORIZATION'); assert.equal(second.plan.actions[0].actionId, bId); assert.equal(amount(second.runBudget.reserved.resources), 5);
    const executed = await f.execute(target, second.plan), final = await runner.resume();
    if (limit === 10) { assert.equal(executed.status.finalStatus, 'SUCCESS'); assert.equal(final.status, 'COMPLETED'); assert.equal(target.synthetic.writes.length, 2); assert.equal(amount(final.runBudget.reserved.resources), 10); }
    else { assert.notEqual(executed.status.finalStatus, 'SUCCESS'); assert.notEqual(final.status, 'COMPLETED'); assert.equal(target.synthetic.writes.length, 1); assert.equal(amount(final.runBudget.reserved.resources), 5); }
    assert.equal(target.workflowOwner, null); assert.equal(final.runBudget.state, 'CLOSED');
  } finally { await f.cleanup(); }
});

test('stable hero selector never lets an old preview or permit authorize the next level', async () => {
  const f = fixture(), target = f.session();
  try {
    const planned = await f.displayed(target), oldSelector = planned.actions[0].actionId, permit = f.authorize(target, planned);
    // A separately observed state change preserves the semantic selector but
    // changes the exact before/expected/cost identity bound to this permit.
    target.synthetic.heroes[0].level = 2;
    f.service.execute(target, permit); await f.service.settle(target.id);
    assert.equal(f.service.status(target.id).finalStatus, 'NOT_EXECUTED'); assert.equal(target.synthetic.writes.length, 0);
    assert.throws(() => f.service.execute(target, permit));
    const fresh = await f.displayed(target); assert.equal(fresh.actions[0].actionId, oldSelector); assert.notEqual(fresh.planHash, planned.planHash);
    assert.equal(fresh.actions[0].beforeState.level, 2); assert.equal(fresh.actions[0].expectedState.level, 3); assert.deepEqual(fresh.resourceBudget, [{ id: '英雄经验', num: 8 }]);
    assert.throws(() => f.authorize(target, planned), { code: 'STALE_PLAN' });
    assert.equal((await f.execute(target, fresh)).status.finalStatus, 'SUCCESS'); assert.equal(target.synthetic.writes.length, 1); assert.equal(target.synthetic.heroes[0].level, 3);
  } finally { await f.cleanup(); }
});

const fragmentParams=(heroId='A',num=7)=>({heroId,action:'fragment-exchange',num});
function configureFragments(f,target){
 f.config(cfg=>{cfg.tables.HeroCfg.data.forEach(row=>{row.type='英雄';row.universalItemId='蓝卡万能碎片';});cfg.tables.ItemCfg={data:[{id:'蓝卡万能碎片',type:'英雄万能碎片',quality:'BLUE'},...['A','B'].map(id=>({id:id+'碎片',type:'英雄碎片',quality:'BLUE'}))]};});
 target.synthetic.stock.set('蓝卡万能碎片',20);target.client.factContext={accountId:target.id,generation:target.generation,connectionId:target.connectionId};
}
test('fragment Service confirms exact 1:1 debit and credit without hero growth, with durable intent and single permit',async()=>{
 const f=fixture(),t=f.session();configureFragments(f,t);const heroes=structuredClone(t.synthetic.heroes);
 try{
  const p=await f.displayed(t,fragmentParams()),r=await f.execute(t,p);assert.equal(r.status.finalStatus,'SUCCESS');assert.deepEqual(p.resourceBudget,[{id:'蓝卡万能碎片',num:7}]);assert.equal(t.synthetic.stock.get('蓝卡万能碎片'),13);assert.equal(t.synthetic.stock.get('A碎片'),17);assert.deepEqual(t.synthetic.heroes,heroes);
  const w=t.synthetic.writes[0];assert.deepEqual(w.body,{heroId:'A',fragItemId:'A碎片',num:7});assert.equal(w.durableBeforeWrite.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.equal(r.record.actions[0].verification.status,'CONFIRMED');assert.equal(createExecutionHistory({file:f.file}).unresolved(t.id),false);assert.throws(()=>f.service.execute(t,r.permit));
 }finally{await f.cleanup();}
});
test('fragment UNKNOWN retains universal budget and blocks replay across restart',async()=>{
 const f=fixture({apply:false}),t=f.session();configureFragments(f,t);let restarted;
 try{
  const r=await f.execute(t,await f.displayed(t,fragmentParams()));assert.equal(r.status.finalStatus,'UNKNOWN');assert.equal(r.record.actions[0].unresolvedWrite,true);assert.deepEqual(r.record.runBudget.reserved.resources,[{id:'蓝卡万能碎片',num:7}]);await assert.rejects(f.displayed(t,fragmentParams()),{code:'RESPONSE_UNCERTAIN'});assert.equal(t.synthetic.writes.length,1);
  restarted=fixture({historyFile:f.file});const fresh=restarted.session();configureFragments(restarted,fresh);await assert.rejects(restarted.displayed(fresh,fragmentParams()),{code:'RECOVERY_UNCERTAIN'});assert.equal(fresh.synthetic.writes.length,0);assert.equal(restarted.durable.list(fresh.id)[0].finalStatus,'UNKNOWN');
 }finally{await restarted?.cleanup();await f.cleanup();}
});
test('fragment relevant configuration or balances invalidate existing permit without a send',async()=>{
 for(const kind of ['config','source','target']){
  const f=fixture(),t=f.session();configureFragments(f,t);
  try{const p=await f.displayed(t,fragmentParams());if(kind==='config'){f.config(cfg=>cfg.tables.ItemCfg.revision=2);assert.throws(()=>f.authorize(t,p),{code:'STALE_PLAN'});}else{const permit=f.authorize(t,p);t.synthetic.stock.set(kind==='source'?'蓝卡万能碎片':'A碎片',19);f.service.execute(t,permit);await f.service.settle(t.id);assert.notEqual(f.service.status(t.id).finalStatus,'SUCCESS');}assert.equal(t.synthetic.writes.length,0);}finally{await f.cleanup();}
 }
});
for(const kind of ['account','player','world','generation','connection'])test('fragment '+kind+' isolation prevents dispatch',async()=>{
 const f=fixture(),t=f.session();configureFragments(f,t);
 try{const p=await f.displayed(t,fragmentParams()),permit=f.authorize(t,p);if(kind==='account'){const b=f.session('account-B');configureFragments(f,b);assert.throws(()=>f.service.execute(b,permit));assert.equal(b.synthetic.writes.length,0);}else{if(kind==='player')t.player.playerId='9000';if(kind==='world')t.player.worldId=2;if(kind==='generation'){t.generation++;t.client.factContext.generation++;}if(kind==='connection'){t.connectionId+='changed';t.client.factContext.connectionId+='changed';}try{f.service.execute(t,permit);await f.service.settle(t.id);}catch{}assert.notEqual(f.service.status(t.id).finalStatus,'SUCCESS');}assert.equal(t.synthetic.writes.length,0);}finally{await f.cleanup();}
});
test('fragment persistent budget or intent failure prevents transport',async()=>{
 for(const kind of ['budget','intent']){
  const f=fixture(),t=f.session();configureFragments(f,t);
  try{const p=await f.displayed(t,fragmentParams());f.failPersist(record=>kind==='budget'?(record.runBudget?.reserved.resources??[]).some(row=>row.id==='蓝卡万能碎片'):record.actions?.some(row=>row.dispatchEvidence?.state==='MAY_HAVE_DISPATCHED'));f.service.execute(t,f.authorize(t,p));await f.service.settle(t.id);assert.equal(t.synthetic.writes.length,0);assert.notEqual(f.service.status(t.id).finalStatus,'SUCCESS');}finally{f.failPersist(()=>false);await f.cleanup();}
 }
});
test('fragment stop after dispatch preserves UNKNOWN despite late exact effect',async()=>{
 const f=fixture(),t=f.session();configureFragments(f,t);let finish;
 try{t.client.sendWatch=async(name,body)=>{t.client.mutate(name,body);return new Promise(resolve=>{finish=resolve;});};const p=await f.displayed(t,fragmentParams()),permit=f.authorize(t,p);f.service.execute(t,permit);for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(finish);f.service.stop(t.id);finish({status:'SUCCESS'});await f.service.settle(t.id);const record=f.durable.list(t.id)[0];assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(t.synthetic.stock.get('A碎片'),17);await assert.rejects(f.displayed(t,fragmentParams()));assert.equal(t.synthetic.writes.length,1);}finally{finish?.({status:'UNKNOWN'});await f.cleanup();}
});
for(const limit of [12,14])test('fragment Workflow shares finite universal source '+limit+' across heroes and ignores later stock credits',async()=>{
 const f=fixture(),t=f.session();configureFragments(f,t);
 try{
  const nodes=[{id:'s',type:'START'}];for(const [heroId,suffix]of [['A','a'],['B','b']]){const p=fragmentParams(heroId),survey=await f.service.surveyModule(t,'heroes',p);nodes.push({id:suffix,type:'ACTION',module:'heroes',parameters:p,selection:survey.view.candidates[0].actionId},{id:'v'+suffix,type:'VERIFY',module:'heroes'});}nodes.push({id:'z',type:'STOP'});
  const graph={version:1,id:'fragments-'+limit,name:'Fragment budget',budget:{resources:[{id:'蓝卡万能碎片',num:limit}],quotas:[],uids:['A','B'].map(id=>({type:'hero-fragment-exchange',id}))},nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id}))};
  const runner=f.runner(t),first=await runner.start(t.id,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal((await f.execute(t,first.plan)).status.finalStatus,'SUCCESS');t.synthetic.stock.set('蓝卡万能碎片',1000);
  const second=await runner.resume();assert.equal(second.status,'AWAITING_AUTHORIZATION');assert.deepEqual(second.runBudget.reserved.resources,[{id:'蓝卡万能碎片',num:7}]);const result=await f.execute(t,second.plan),final=await runner.resume();
  assert.equal(t.synthetic.writes.length,limit===14?2:1);assert.equal(result.status.finalStatus==='SUCCESS',limit===14);assert.equal(final.status==='COMPLETED',limit===14);assert.equal(final.runBudget.state,'CLOSED');
 }finally{await f.cleanup();}
});

for(const action of ['level','skill','star','fragment-exchange'])test('W19 hero '+action+' refusal survives restart, reconnect and role return',async()=>{
 const f=fixture({apply:false}),a=f.session();let next;const p=action==='fragment-exchange'?fragmentParams():parameters(action);
 const prepare=t=>{if(action==='star')t.synthetic.heroes[0].star=1;if(action==='fragment-exchange')t.synthetic.stock.set('蓝卡万能碎片',20);};
 try{prepare(a);if(action==='fragment-exchange')configureFragments(f,a);a.synthetic.onWrite=()=>{throw Object.assign(Error('synthetic definite hero refusal'),{code:'REJECTED'});};assert.equal((await f.execute(a,await f.displayed(a,p))).record.finalStatus,'REJECTED');
 next=fixture({apply:false,historyFile:f.file});const b=next.session();prepare(b);if(action==='fragment-exchange')configureFragments(next,b);b.generation=2;b.connectionId='replacement-hero';b.client.factContext={accountId:b.id,generation:2,connectionId:b.connectionId};await assert.rejects(next.displayed(b,p),{code:'REJECTION_MEMORY_ACTIVE'});b.player.playerId='1003';assert.equal((await next.displayed(b,p)).actions.length,1);b.player.playerId='1001';await assert.rejects(next.displayed(b,p),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.synthetic.writes.length,0);
 }finally{await next?.cleanup();await f.cleanup();}
});

for(const changed of ['player','world'])test('W19 base hero identity isolates '+changed+' and returning to original role keeps refusal',async()=>{
 const f=fixture({apply:false}),a=f.session();let next;try{a.synthetic.onWrite=()=>{throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});};await f.execute(a,await f.displayed(a));next=fixture({apply:false,historyFile:f.file});const b=next.session();b.generation=2;b.connectionId='replacement-hero-role';
 b.player[changed==='player'?'playerId':'worldId']=changed==='player'?'1003':2;assert.equal((await next.displayed(b)).actions.length,1);b.player={playerId:'1001',worldId:1,level:2};await assert.rejects(next.displayed(b),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.synthetic.writes.length,0);assert.equal(next.service.executionMemory(b.id).events.length,1);
 }finally{await next?.cleanup();await f.cleanup();}
});

for(const age of [300000,300001])test('W19 changed world needs authoritative planning facts within age '+age,async()=>{
 let now=1700000000000;const f=fixture({apply:false,serviceClock:()=>now}),a=f.session();let next;try{a.synthetic.onWrite=()=>{throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});};await f.execute(a,await f.displayed(a));next=fixture({apply:false,historyFile:f.file,serviceClock:()=>now});const b=next.session();b.player.worldId=2;b.generation=2;b.connectionId='replacement-age';let advanced=false;b.synthetic.onRead=()=>{if(!advanced&&b.synthetic.reads.length===4){advanced=true;now+=age;}};
 if(age===300000)assert.equal((await next.displayed(b)).actions.length,1);else await assert.rejects(next.displayed(b),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.synthetic.writes.length,0);assert.equal(next.service.executionMemory(b.id).events.length,1);
 }finally{await next?.cleanup();await f.cleanup();}
});
for(const missing of ['beforeState','expectedState','budgetClaims'])test('W19 changed world cannot clear hero refusal missing original '+missing,async()=>{
 const f=fixture({apply:false}),a=f.session();let next;try{a.synthetic.onWrite=()=>{throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});};await f.execute(a,await f.displayed(a));const r=f.durable.list(a.id)[0];delete r.actions[0][missing];f.durable.put(r);next=fixture({apply:false,historyFile:f.file});const b=next.session();b.player.worldId=2;await assert.rejects(next.displayed(b),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.synthetic.writes.length,0);
 }finally{await next?.cleanup();await f.cleanup();}
});
