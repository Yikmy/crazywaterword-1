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
import { toSnapshotJson } from '../src/game.mjs';

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
function fixture({ enabled = true, apply = true, historyFile, watchStatus = 'UNKNOWN', derived = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-equipment-growth-service-'));
  const file = historyFile ?? path.join(dir, 'history.json'), journal = [], sessions = new Map(), runners = [];
  const durable = createExecutionHistory({ file });
  const moduleSettings = createModuleSettings({ file: path.join(dir, 'modules.json'), modules: GAMEPLAY_MODULES });
  let gameConfig = config(), failPersist = () => false, serviceTime = Date.now();
  const history = { ...durable, put(record) { if (failPersist(record)) throw Error('synthetic equipment-growth persistence unavailable'); journal.push(structuredClone(record)); return durable.put(record); } };
  const service = createOperationService({ protocol, modules: GAMEPLAY_MODULES, moduleSettings, history, clock: () => serviceTime, getConfig: () => structuredClone(gameConfig), loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }), loadProduction: () => ({ config: { version: 1, enabled: false } }) });
  function session(accountId = 'account-A') {
    // Complete pool and hero mirrors are independent objects, not shared aliases.
    const state = { pool: [equip(ids.A), equip(ids.B), equip(ids.idle)], heroes: [hero('A'), hero('B')], stock: new Map([['精铁', 30], ['其他材料', 7], ['GOLD', 100]]), writes: [], reads: [], apply, derived, onRead: null, onWrite: null, nowMs: 1000000, clock: true };
    const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Map(), factContext: { accountId, generation: 1 },
      gameClock: { read() { return state.clock ? { status: 'TRUSTED', reliable: true, nowMs: state.nowMs, earliestMs: state.nowMs, latestMs: state.nowMs, accountId: client.factContext.accountId, generation: client.factContext.generation } : null; } },
      markUnverifiedWrite(name, body) { this.uncertainWrites.set(JSON.stringify({ name, body }), true); },
      confirmWatchedWrite(name, body) { this.uncertainWrites.delete(JSON.stringify({ name, body })); },
      mutate(name, body) {
        assert.equal(name, 'EnhanceEquipRequest');
        state.writes.push({ name, body: structuredClone(body), durableBeforeWrite: structuredClone(journal.at(-1)) });
        const uid = toSnapshotJson(wire(name, body)).uid.toString();
        const row = state.pool.find(value => value.uid === uid), owner = state.heroes.find(value => value.equips.some(e => e.uid === uid));
        if (state.apply) {
          const cost = row.level === 1 ? 4 : 6;
          row.level++;
          owner.equips.find(value => value.uid === uid).level++;
          state.stock.set('精铁', state.stock.get('精铁') - cost);
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
      async sendWatch(name, body) { wire(name, body); this.mutate(name, body); return { status: watchStatus }; },
    };
    const result = { id: accountId, client, state: 'READY', player: { playerId: accountId === 'account-A' ? '1001' : '1002', worldId: 1000001, level: 20 }, generation: 1, connectionId: 'offline-equipment-growth-' + accountId, abort: new AbortController(), busy: null, loop: { running: false }, synthetic: state };
    if (enabled) moduleSettings.save(accountId, moduleId, { enabled: true });
    sessions.set(accountId, result); return result;
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
  async function cleanup() { for (const r of runners) r.stop(); await Promise.all(runners.map(r => r.settle())); for (const target of sessions.values()) target.abort.abort(); await Promise.all([...sessions.keys()].map(id => service.settle(id))); assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); }
  return { file, service, durable, journal, moduleSettings, session, displayed, authorize, execute, runner, cleanup, advance: ms => { serviceTime += ms; }, config: mutate => mutate(gameConfig), failPersist: predicate => { failPersist = predicate; } };
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
    for (const extra of [{ request: 'EnhanceEquipRequest' }, { count: 2 }, { action: 'refine' }, { universal: false }, { decomposeUid: [] }]) await assert.rejects(f.service.plan(target, { module: moduleId, mode: 'Manual', parameters: { ...parameters(), ...extra }, selections: ['fake'] }));
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