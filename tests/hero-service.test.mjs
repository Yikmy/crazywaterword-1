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
function fixture({ enabled = true, apply = true, historyFile } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-hero-service-')), file = historyFile ?? path.join(dir, 'history.json'), journal = [], sessions = new Map(), runners = [];
  const durable = createExecutionHistory({ file }), moduleSettings = createModuleSettings({ file: path.join(dir, 'modules.json'), modules: GAMEPLAY_MODULES });
  let gameConfig = config(), failPersist = () => false;
  const history = { ...durable, put(record) { if (failPersist(record)) throw Error('synthetic hero persistence unavailable'); journal.push(structuredClone(record)); return durable.put(record); } };
  const service = createOperationService({ protocol, modules: GAMEPLAY_MODULES, moduleSettings, history, getConfig: () => structuredClone(gameConfig), loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }), loadProduction: () => ({ config: { version: 1, enabled: false } }) });
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
