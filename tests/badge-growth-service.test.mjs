import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { loadProtocol } from '../src/proto.mjs';

const protocol = loadProtocol();
const wire = (name, data) => protocol[name].decode(protocol[name].encode(data).finish());
const moduleId = 'badge-growth';
const account = 'badge-account';
const uid = '9007199254740993';
const parameters = { heroId: 'A', uid };
const badgeId = '蓝法师徽章';
const xp = '徽章经验';
const costs = { [xp]: 5, GOLD: 100 };
const uidClaim = [{ type: 'badge', id: uid }];
const costMap = rows => Object.fromEntries(rows.map(({ id, num }) => [id, num]));

function fixture(t, { effect = 'apply', material = { asset: [] } } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-badge-service-'));
  const file = path.join(dir, 'execution-history.json');
  const newHistory = () => createExecutionHistory({ file });
  const history = newHistory();
  const settings = createModuleSettings({ file: path.join(dir, 'settings.json'), modules: GAMEPLAY_MODULES });
  const config = { tables: {
    HeroCfg: { data: [{ id: 'A', type: '英雄', career: '法师' }] },
    HeroBadgeCfg: { data: [{ id: badgeId, career: '法师' }] },
    HeroBadgeAttrCfg: { data: [{ id: badgeId, star: 0, maxLevel: 4 }] },
    HeroBadgeLevelCfg: { data: [
      { level: 1, exp: 0, goldExpRadio: 0 },
      { level: 2, exp: 5, goldExpRadio: 20 },
      { level: 3, exp: 7, goldExpRadio: 25 },
      { level: 4, exp: 10, goldExpRadio: 30 },
    ] },
    HeroBadgeUnlockCfg: { data: [1, 70, 90, 110].map((level, index) => ({ pos: index + 1, level })) },
  } };
  const services = [], sessions = [];
  t.after(async () => {
    for (const session of sessions) session.abort.abort();
    await Promise.all(services.map(service => service.settle(account)));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  settings.save(account, moduleId, { enabled: true });
  const newService = (store = newHistory()) => {
    const service = createOperationService({
      protocol, modules: GAMEPLAY_MODULES, history: store, moduleSettings: settings, getConfig: () => structuredClone(config),
      loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }),
      loadProduction: () => ({ config: { version: 1, enabled: false } }),
    });
    services.push(service);
    return service;
  };
  function newSession(generation = 1) {
    const connectionId = 'offline-badge-' + generation;
    const core = { uid, badgeId, level: 1, star: 0, attr: { attr: 1, value: 1.5, rating: 2 } };
    const worn = { ...structuredClone(core), pos: 1 };
    const badge = { ...structuredClone(core), exp: 0 };
    const hero = { heroId: 'A', level: 20, star: 3, power: '9007199254741001', attributes: [{ attr: 1, value: 4 }], skillLevels: [1, 2], badges: [worn] };
    const stock = new Map([[xp, 25], ['GOLD', 500], ['其他', 1]]);
    const writes = [], reads = [], uncertainWrites = new Map();
    const client = {
      connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites,
      factContext: { accountId: account, generation, connectionId },
      markUnverifiedWrite(name, body) { uncertainWrites.set(JSON.stringify([name, body]), true); },
      async request(name, body, reply, _timeout, options = {}) {
        const decoded = toSnapshotJson(wire(name, body));
        if (options.mutate) {
          options.beforeDispatch?.();
          assert.equal(name, 'EnhanceBadgeRequest');
          assert.equal(reply, 'EnhanceBadgeResponse');
          assert.deepEqual(decoded, { uid, decomposeUid: [], expItemNum: 5 });
          // Read the actual file at the transport boundary, before altering
          // synthetic game state. The snapshot is not a stubbed history callback.
          const durable = JSON.parse(fs.readFileSync(file, 'utf8')).accounts[account][0];
          writes.push({ body: decoded, durable });
          if (effect !== 'none') {
            const increase = effect === 'double-level' ? 2 : 1;
            badge.level += increase;
            worn.level += increase;
            hero.power = '9007199254741007';
            hero.attributes[0].value++;
            stock.set(xp, stock.get(xp) - 5);
            stock.set('GOLD', stock.get('GOLD') - 100);
          }
          return wire(reply, { material });
        }
        reads.push({ name, afterDispatch: writes.length > 0 });
        const value = {
          BadgesRequest: () => ({ badge: [badge] }),
          AllHeroRequest: () => ({ heroes: [hero] }),
          AllItemRequest: () => ({ items: [...stock].filter(([id]) => id !== 'GOLD').map(([itemId, num]) => ({ itemId, num })) }),
          AllResourceRequest: () => ({ list: [{ res: 3, amount: stock.get('GOLD') }] }),
        }[name]?.();
        assert.ok(value, 'Unexpected offline read ' + name);
        return wire(reply, value);
      },
    };
    const session = {
      id: account, client, state: 'READY', player: { playerId: '17', worldId: '9', level: 30 },
      generation, connectionId, abort: new AbortController(), busy: null, loop: { running: false }, snapshot: { ok: {}, failed: {} },
      writes, reads, stock,
    };
    sessions.push(session);
    return session;
  }
  async function displayed(service, session) {
    const survey = await service.surveyModule(session, moduleId, parameters);
    const candidate = survey.view.candidates.find(row => row.executable);
    assert.ok(candidate, JSON.stringify(survey.view.blocked));
    assert.equal(candidate.action, undefined);
    assert.equal(candidate.configEvidence, undefined);
    return service.plan(session, { module: moduleId, mode: 'Manual', parameters, selections: [candidate.actionId] });
  }
  const permitPayload = plan => ({
    batchId: plan.batchId, planHash: plan.planHash, approvedActionIds: plan.actions.map(row => row.actionId), resourceBudget: plan.resourceBudget, confirm: true,
  });
  return { history, newHistory, newService, newSession, displayed, permitPayload };
}

test('C228 real OperationService persists both costs and exact badge UID before typed transport and confirms full effect', async t => {
  const f = fixture(t), service = f.newService(f.history), session = f.newSession();
  const plan = await f.displayed(service, session), payload = f.permitPayload(plan);
  assert.deepEqual(costMap(plan.resourceBudget), costs);
  assert.deepEqual(plan.budgetClaims.uids, uidClaim);
  assert.equal(plan.actions[0].action, undefined);
  assert.equal(plan.actions[0].configEvidence, undefined);
  assert.throws(() => service.execute(session, { batchId: plan.batchId }));
  for (const omitted of [xp, 'GOLD']) {
    assert.throws(() => service.authorize(session, { ...payload, resourceBudget: payload.resourceBudget.filter(row => row.id !== omitted) }), { code: 'AUTHORIZATION_REQUIRED' });
  }
  assert.equal(session.writes.length, 0);
  const permit = service.authorize(session, payload);
  service.execute(session, permit);
  await service.settle(session.id);
  assert.equal(session.writes.length, 1);
  const [{ body, durable }] = session.writes;
  assert.deepEqual(body, { uid, decomposeUid: [], expItemNum: 5 });
  assert.equal(durable.actions[0].dispatchEvidence.state, 'MAY_HAVE_DISPATCHED');
  assert.equal(durable.actions[0].stages.at(-1).stage, 'DISPATCH_INTENT');
  assert.deepEqual(costMap(durable.runBudget.reserved.resources), costs);
  assert.deepEqual(durable.runBudget.reserved.uids, uidClaim);

  const reopened = f.newHistory();
  const [run] = reopened.list(account), [action] = run.actions;
  assert.equal(run.finalStatus, 'SUCCESS');
  assert.equal(action.requestStatus, 'SUCCESS');
  assert.equal(action.verification.status, 'CONFIRMED');
  assert.deepEqual(action.stages.slice(-3).map(row => row.stage), ['RESPONSE', 'VERIFY', 'VERIFIED']);
  assert.deepEqual(session.reads.filter(row => row.afterDispatch).map(row => row.name).sort(), ['AllHeroRequest', 'AllItemRequest', 'AllResourceRequest', 'BadgesRequest']);
  assert.equal(action.afterState.badge.uid, uid);
  assert.equal(action.afterState.badge.level, 2);
  assert.equal(action.afterState.badge.exp, 0);
  assert.equal(action.afterState.hero.badges[0].level, 2);
  assert.equal(session.stock.get(xp), 20);
  assert.equal(session.stock.get('GOLD'), 400);
  assert.equal(reopened.unresolved(account), false);
  assert.throws(() => service.execute(session, permit), { code: 'AUTHORIZATION_REQUIRED' });
});

for (const [label, options] of [
  ['typed reply alone', { effect: 'none' }],
  ['wrong level effect with the expected typed reply', { effect: 'double-level' }],
  ['exact level and debits with unexpected typed material', { material: { asset: [{ type: 0, id: 'unexpected', num: 1 }] } }],
]) {
  test('C228 ' + label + ' leaves both claims reserved and blocks retries after restart', async t => {
    const f = fixture(t, options), service = f.newService(f.history), session = f.newSession();
    const plan = await f.displayed(service, session), permit = service.authorize(session, f.permitPayload(plan));
    service.execute(session, permit);
    await service.settle(session.id);
    const [run] = f.history.list(account), [action] = run.actions;
    assert.equal(run.finalStatus, 'UNKNOWN');
    assert.equal(action.requestStatus, 'SUCCESS', 'typed transport completed but effect verification did not');
    assert.equal(action.unresolvedWrite, true);
    assert.equal(action.verification.status, 'UNCONFIRMED');
    assert.ok(action.stages.some(row => row.stage === 'RESPONSE'));
    assert.equal(action.stages.some(row => row.stage === 'VERIFIED'), false);
    assert.deepEqual(costMap(run.runBudget.reserved.resources), costs);
    assert.deepEqual(run.runBudget.reserved.uids, uidClaim);
    assert.throws(() => service.execute(session, permit));
    assert.equal(session.writes.length, 1);
    const restarted = f.newService(), fresh = f.newSession(2);
    assert.equal(restarted.status(fresh.id).blocked, true);
    await assert.rejects(f.displayed(restarted, fresh), { code: 'RECOVERY_UNCERTAIN' });
    assert.equal(fresh.writes.length, 0);
    assert.equal(f.newHistory().unresolved(account), true);
  });
}
