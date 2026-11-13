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
const moduleId = 'antique-growth';
const account = 'antique-account';
const antiqueId = '藏品蓝1', fragment = antiqueId + '碎片';
const entityClaims = [{ type: 'antique', id: antiqueId }];
const resourceMap = rows => Object.fromEntries(rows.map(({ id, num }) => [id, num]));
const expectedReads = ['AllAntiqueRequest', 'AllItemRequest', 'AllResourceRequest'];

function fixture(t, { action = 'activate', effect = 'apply' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-antique-growth-service-'));
  const file = path.join(dir, 'execution-history.json');
  const newHistory = () => createExecutionHistory({ file });
  const history = newHistory();
  const settings = createModuleSettings({ file: path.join(dir, 'settings.json'), modules: GAMEPLAY_MODULES });
  const cost = action === 'activate' ? 10 : 2;
  const parameters = { antiqueId, action };
  const expectedRequest = action === 'activate' ? 'ActivateAntiqueRequest' : 'AntiqueStarUpRequest';
  const expectedBody = { id: antiqueId, ...(action === 'star' ? { universal: false } : {}) };
  const config = { tables: {
    ModuleOpenCfg: { data: [{ moduleId: '藏品', playerLevel: 10 }] },
    AntiqueBaseCfg: { data: [
      { antiqueId, color: 'BLUE', activeFrag: 10, showName: '测试藏品', suitId: 1001, isAntique: false },
      { antiqueId: '藏品蓝2', color: 'BLUE', activeFrag: 10, showName: '其他藏品', suitId: 1001, isAntique: false },
    ] },
    AntiqueStarCfg: { data: Array.from({ length: 25 }, (_, i) => ({
      star: i + 1, consumeBlue: i === 0 ? 2 : 3, consumePur: 2, consumeOra: 2, consumeRed: 10,
    })) },
    AntiqueSuitCfg: { data: [] },
  } };
  const services = [], sessions = [];
  t.after(async () => {
    for (const session of sessions) session.abort.abort();
    await Promise.all(services.map(service => service.settle(account)));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  settings.save(account, moduleId, { enabled: true });

  function newService(store = newHistory()) {
    const service = createOperationService({
      protocol, modules: GAMEPLAY_MODULES, history: store, moduleSettings: settings,
      getConfig: () => structuredClone(config),
      loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }),
      loadProduction: () => ({ config: { version: 1, enabled: false } }),
    });
    services.push(service);
    return service;
  }
  function newSession(generation = 1) {
    const connectionId = 'offline-antique-growth-' + generation;
    const state = {
      antiques: [
        ...(action === 'star' ? [{ id: antiqueId, star: 0 }] : []),
        { id: '藏品蓝2', star: 2 },
      ],
      suits: [], masterLv: 0,
    };
    const stock = new Map([[fragment, 30], ['其他材料', 5], ['GOLD', 500]]);
    const writes = [], reads = [], uncertainWrites = new Map();
    const client = {
      connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites,
      factContext: { accountId: account, generation, connectionId },
      markUnverifiedWrite(name, body) { uncertainWrites.set(JSON.stringify([name, body]), true); },
      confirmWatchedWrite(name, body) { uncertainWrites.delete(JSON.stringify([name, body])); },
      async sendWatch(name, body, options) {
        options.beforeDispatch?.();
        assert.equal(name, expectedRequest);
        const decoded = toSnapshotJson(wire(name, body));
        assert.deepEqual(decoded, expectedBody);
        // Read the actual disk at the last transport boundary before changing
        // synthetic state; the executor and persistence layer are not mocked.
        const durable = JSON.parse(fs.readFileSync(file, 'utf8')).accounts[account][0];
        writes.push({ name, body: decoded, durable });
        if (effect !== 'none') {
          if (action === 'activate') state.antiques.push({ id: antiqueId, star: 0 });
          else state.antiques.find(row => row.id === antiqueId).star++;
          stock.set(fragment, stock.get(fragment) - cost);
          if (effect === 'unrelated-state') state.masterLv++;
        }
        this.markUnverifiedWrite(name, body);
        return { status: 'UNKNOWN' };
      },
      async request(name, body, reply, _timeout, options = {}) {
        assert.equal(options.mutate, undefined);
        assert.deepEqual(toSnapshotJson(wire(name, body)), {});
        reads.push({ name, afterDispatch: writes.length > 0 });
        const value = {
          AllAntiqueRequest: () => structuredClone(state),
          AllItemRequest: () => ({ items: [...stock].filter(([id]) => id !== 'GOLD').map(([itemId, num]) => ({ itemId, num })) }),
          AllResourceRequest: () => ({ list: [{ res: 3, amount: stock.get('GOLD') }] }),
        }[name]?.();
        assert.ok(value, 'Unexpected offline read ' + name);
        return wire(reply, value);
      },
    };
    const session = {
      id: account, client, state: 'READY', player: { playerId: '17', worldId: '9', level: 30 },
      generation, connectionId, abort: new AbortController(), busy: null, loop: { running: false },
      snapshot: { ok: {}, failed: {} }, writes, reads, stock, synthetic: state,
    };
    sessions.push(session);
    return session;
  }
  async function displayed(service, session) {
    const survey = await service.surveyModule(session, moduleId, parameters);
    const candidate = survey.view.candidates.find(row => row.executable);
    assert.ok(candidate, JSON.stringify(survey.view));
    for (const key of ['action', 'configEvidence']) assert.equal(candidate[key], undefined);
    return service.plan(session, { module: moduleId, mode: 'Manual', parameters, selections: [candidate.actionId] });
  }
  const permitPayload = plan => ({
    batchId: plan.batchId, planHash: plan.planHash,
    approvedActionIds: plan.actions.map(row => row.actionId), resourceBudget: plan.resourceBudget, confirm: true,
  });
  return { history, newHistory, newService, newSession, displayed, permitPayload, cost, parameters, expectedRequest, expectedBody };
}

for (const actionName of ['activate', 'star']) {
  test('PRO-007 ' + actionName + ' persists exact fragment and entity claims before watched transport and confirms the independent effect', async t => {
    const f = fixture(t, { action: actionName }), service = f.newService(f.history), session = f.newSession();
    const plan = await f.displayed(service, session), payload = f.permitPayload(plan);
    assert.deepEqual(resourceMap(plan.resourceBudget), { [fragment]: f.cost });
    assert.deepEqual(plan.budgetClaims.uids, entityClaims);
    assert.deepEqual(plan.actions[0].parameters, f.parameters);
    for (const key of ['action', 'configEvidence']) assert.equal(plan.actions[0][key], undefined);
    assert.match(plan.actions[0].identity,/^[0-9a-f]{64}$/, 'public identity is opaque and contains no configuration or complete inventory');
    assert.throws(() => service.execute(session, { batchId: plan.batchId }), { code: 'AUTHORIZATION_REQUIRED' });
    assert.throws(() => service.authorize(session, { ...payload, resourceBudget: [] }), { code: 'AUTHORIZATION_REQUIRED' });
    assert.equal(session.writes.length, 0);

    const permit = service.authorize(session, payload);
    service.execute(session, permit);
    await service.settle(session.id);
    assert.equal(session.writes.length, 1);
    const [{ name, body, durable }] = session.writes;
    assert.equal(name, f.expectedRequest);
    assert.deepEqual(body, f.expectedBody);
    assert.equal(durable.actions[0].dispatchEvidence.state, 'MAY_HAVE_DISPATCHED');
    assert.equal(durable.actions[0].stages.at(-1).stage, 'DISPATCH_INTENT');
    assert.deepEqual(resourceMap(durable.runBudget.reserved.resources), { [fragment]: f.cost });
    assert.deepEqual(durable.runBudget.reserved.uids, entityClaims);
    assert.deepEqual(session.reads.filter(row => row.afterDispatch).map(row => row.name).sort(), expectedReads);
    assert.equal(session.stock.get(fragment), 30 - f.cost);
    assert.equal(session.stock.get('GOLD'), 500);
    assert.equal(session.stock.get('其他材料'), 5);

    const reopened = f.newHistory(), [run] = reopened.list(account), [action] = run.actions;
    assert.equal(run.finalStatus, 'SUCCESS');
    assert.equal(action.requestStatus, 'UNKNOWN');
    assert.equal(action.verification.status, 'CONFIRMED');
    assert.deepEqual(action.stages.slice(-3).map(row => row.stage), ['OBSERVATION_ENDED', 'VERIFY', 'VERIFIED']);
    assert.deepEqual(action.afterState.antique, { id: antiqueId, star: actionName === 'activate' ? 0 : 1 });
    assert.equal(session.client.uncertainWrites.size, 0);
    assert.equal(reopened.unresolved(account), false);
    assert.throws(() => service.execute(session, permit), { code: 'AUTHORIZATION_REQUIRED' });
  });

  for (const effect of ['none', 'unrelated-state']) {
    test('PRO-007 ' + actionName + ' ' + effect + ' retains disk UNKNOWN and both claims with no replay after restart', async t => {
      const f = fixture(t, { action: actionName, effect }), service = f.newService(f.history), session = f.newSession();
      const plan = await f.displayed(service, session), permit = service.authorize(session, f.permitPayload(plan));
      service.execute(session, permit);
      await service.settle(session.id);
      const [run] = f.newHistory().list(account), [action] = run.actions;
      assert.equal(run.finalStatus, 'UNKNOWN');
      assert.equal(action.requestStatus, 'UNKNOWN');
      assert.equal(action.unresolvedWrite, true);
      assert.equal(action.verification.status, 'UNCONFIRMED');
      assert.ok(action.stages.some(row => row.stage === 'OBSERVATION_ENDED'));
      assert.equal(action.stages.some(row => row.stage === 'VERIFIED'), false);
      assert.deepEqual(resourceMap(run.runBudget.reserved.resources), { [fragment]: f.cost });
      assert.deepEqual(run.runBudget.reserved.uids, entityClaims);
      assert.equal(session.client.uncertainWrites.size, 1);
      assert.equal(session.writes.length, 1);
      assert.throws(() => service.execute(session, permit));
      const restarted = f.newService(), fresh = f.newSession(2);
      assert.equal(restarted.status(account).blocked, true);
      await assert.rejects(f.displayed(restarted, fresh), { code: 'RECOVERY_UNCERTAIN' });
      assert.equal(fresh.writes.length, 0);
      assert.equal(f.newHistory().unresolved(account), true);
    });
  }
}

for(const action of ['activate','star'])test('W19 antique '+action+' refusal survives reconnect and role return',async t=>{
 const f=fixture(t,{action,effect:'none'}),service=f.newService(f.history),a=f.newSession();
 a.client.sendWatch=async(name,body,options)=>{options.beforeDispatch?.();assert.equal(name,f.expectedRequest);assert.deepEqual(toSnapshotJson(wire(name,body)),f.expectedBody);a.writes.push({name,body});return {status:'REJECTED'};};
 const p=await f.displayed(service,a),permit=service.authorize(a,f.permitPayload(p));service.execute(a,permit);await service.settle(account);assert.equal(f.newHistory().list(account)[0].finalStatus,'REJECTED');
 const next=f.newService(),b=f.newSession(2);await assert.rejects(f.displayed(next,b),{code:'REJECTION_MEMORY_ACTIVE'});b.player.worldId='10';assert.equal((await f.displayed(next,b)).actions.length,1);b.player.worldId='9';await assert.rejects(f.displayed(next,b),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(b.writes.length,0);assert.equal(next.executionMemory(account).events.length,1);
});
