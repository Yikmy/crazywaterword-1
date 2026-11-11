import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameClient } from '../src/client.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { ordersModule } from '../src/core-operation-adapters.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

// Actual registered orders, Service, History, GameClient and bundled protobuf
// Codec; synthetic account state and in-process fake socket only. connect() and
// real WebSocket construction fail immediately. All persistence uses private TEMP.
const protocol = loadProtocol();
const rules = { version: 1, enabled: true, rules: [] };
const amount = (rows, id = 'GOLD') => rows.find(row => row.id === id)?.num ?? 0;
const claims = num => ({ resources: [{ id: 'GOLD', num }], quotas: [], uids: [] });
function rawOrder(index, itemId, num) {
  return { index, workerId: index + 1, textId: 1, isSpecial: false, refreshTime: 0,
    requirements: [{ type: itemId === 'GOLD' ? 1 : 0, id: itemId, num }] };
}
function fixture({ orderCount = 1, input = 'wood', cost = 2, apply = true,
  reward = { reward: { asset: [{ type: 1, id: 'GOLD', num: 60 }] } }, goldChange = 60 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-order-rewards-service-'));
  const file = path.join(dir, 'history.json'), history = createExecutionHistory({ file });
  const moduleSettings = createModuleSettings({ file: path.join(dir, 'modules.json'), modules: GAMEPLAY_MODULES });
  const config = { tables: {
    WorkerOrderCfg: { data: [{ itemId: input, reward: [['EXP', 100], ['GOLD', 30]] }] },
    WorkerSpecOrderCfg: { data: [] }, BuildingCfg: { data: [] }, BuildingUpgradeCfg: { data: [] },
  } };
  const service = createOperationService({ protocol, modules: GAMEPLAY_MODULES, history, moduleSettings,
    getConfig: () => config, loadRules: () => ({ config: rules }), loadProduction: () => ({ config: { version: 1, enabled: false } }) });
  const writes = [], reads = [], sessions = [], releases = [];
  function session(id = 'synthetic-order-A') {
    const state = { water: { building: [], workerOrder: Array.from({ length: orderCount }, (_, i) => rawOrder(i, input, cost)), orderOfTheDay: { orderNum: 3 } },
      items: new Map([['wood', 20]]), gold: 100, apply, reward: structuredClone(reward), goldChange, onRead: null, onWrite: null };
    const client = new GameClient({ protocol, accountId: id, generation: 3,
      WebSocketImpl: class { constructor() { throw Error('Synthetic order tests must never construct WebSocket'); } } });
    client.connect = () => { throw Error('Synthetic order tests must never connect'); };
    client.state = 'READY';
    const receive = (name, body) => client.onMessage(client.codec.encode(name, 0, body));
    const target = { id, client, state: 'READY', generation: 3, connectionId: 'synthetic-order-connection-' + id,
      player: { playerId: id.endsWith('-A') ? '9007199254740993' : '9007199254740994', worldId: 12, level: 20 },
      abort: new AbortController(), busy: null, loop: { running: false }, synthetic: state, receive };
    client.socket = { readyState: 1, close() { this.readyState = 3; }, send(bytes) {
      const frame = client.codec.decode(bytes), { name, body } = frame;
      if (name === 'FinishWorkerOrderRequest') {
        assert.deepEqual(Object.keys(body), ['index']);
        const durable = history.list(id)[0];
        writes.push({ accountId: id, name, body: structuredClone(body), durableBeforeWrite: structuredClone(durable) });
        assert.equal(durable.actions.find(row => row.target.index === body.index).requestStatus, 'DISPATCHING');
        const order = state.water.workerOrder.find(row => row.index === body.index); assert.ok(order);
        if (state.apply) {
          state.water.workerOrder = state.water.workerOrder.filter(row => row !== order);
          state.water.orderOfTheDay.orderNum++;
          if (input === 'GOLD') state.gold -= cost;
          else state.items.set(input, state.items.get(input) - cost);
        }
        state.gold += state.goldChange;
        state.onWrite?.(target, frame);
        receive('FinishWorkerOrderResponse', state.reward); return;
      }
      reads.push({ accountId: id, name }); state.onRead?.(target, name);
      const bodyOut = name === 'OnWaterRequest' ? structuredClone(state.water)
        : name === 'AllItemRequest' ? { items: [...state.items].map(([itemId, num]) => ({ itemId, num })) }
        : name === 'AllResourceRequest' ? { list: [{ res: 3, amount: state.gold }] }
        : name === 'MyResFieldsRequest' ? { info: { fields: [] } }
        : name === 'MyFleetsRequest' ? { fleets: [] } : null;
      assert.notEqual(bodyOut, null, 'Unexpected synthetic order request ' + name);
      receive(name.replace('Request', 'Response'), bodyOut);
    } };
    service.saveModuleConfig(id, { module: 'orders', config: { enabled: true } });
    sessions.push(target); return target;
  }
  const target = session();
  async function plan(account = target, index = 0) {
    const workflowId = account.workflowOwner ?? null;
    const surveyed = await service.surveyModule(account, 'orders', {}, { workflowId });
    const row = surveyed.view.candidates.find(value => value.target.index === index && value.executable);
    assert.ok(row, 'Expected original order planner candidate #' + index);
    return service.plan(account, { module: 'orders', mode: 'Manual', parameters: {}, selections: [row.actionId] }, { workflowId });
  }
  function authorize(planned, account = target) {
    return service.authorize(account, { batchId: planned.batchId, planHash: planned.planHash,
      approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: planned.resourceBudget, confirm: true });
  }
  async function execute(planned, account = target, permit = authorize(planned, account)) {
    const started = service.execute(account, permit); await service.settle(account.id);
    return history.list(account.id).find(record => record.runId === started.runId);
  }
  function claim(limit) {
    const runId = 'synthetic-order-parent';
    releases.push(service.claimWorkflow(target, runId, { limits: claims(limit) })); return runId;
  }
  async function cleanup() {
    for (const release of releases.reverse()) release();
    for (const account of sessions) account.abort.abort();
    await Promise.all(sessions.map(account => service.settle(account.id)));
    for (const account of sessions) account.client.stop();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { dir, file, history, service, target, session, plan, authorize, execute, claim, cleanup, writes, reads };
}

function unchangedPreview(row) {
  assert.equal(row.rewardEvidence.minGoldEligible, false);
  if (row.rewardEvidence.finalPreview) assert.equal(row.rewardEvidence.finalPreview.status, 'BLOCKED_EVIDENCE');
}

test('registered orders persist actual typed GOLD and matching net evidence with the original order confirmation', async () => {
  const f = fixture(); try {
    assert.equal(f.service.modules.orders, GAMEPLAY_MODULES.orders);
    assert.equal(GAMEPLAY_MODULES.orders.execute, ordersModule.execute);
    const surveyed = await f.service.surveyModule(f.target, 'orders');
    const base = surveyed.view.orders[0].configuredRewardEvidence;
    assert.equal(base.status, 'CONFIGURED_BASE_ONLY'); assert.equal(base.minGoldEligible, false);
    const planned = await f.plan(), permit = f.authorize(planned);
    assert.equal(f.writes.length, 0); assert.equal(f.history.list(f.target.id).length, 0);
    const run = await f.execute(planned, f.target, permit), row = run.actions[0];
    assert.equal(run.finalStatus, 'SUCCESS', JSON.stringify(row)); assert.equal(row.result, 'SUCCESS');
    assert.equal(row.verification.status, 'CONFIRMED'); assert.equal(row.verification.counterBefore, 3); assert.equal(row.verification.counterAfter, 4);
    assert.equal(row.receivedReward.receivedGold, 60); assert.equal(row.rewardEvidence.verification.status, 'MATCHED');
    assert.equal(row.rewardEvidence.verification.beforeGold, 100); assert.equal(row.rewardEvidence.verification.afterGold, 160);
    assert.equal(row.rewardEvidence.verification.expectedDelta, 60); assert.equal(row.rewardEvidence.operationStatusUnchanged, true);
    assert.deepEqual(row.resourceReservation, [{ id: 'wood', num: 2 }]);
    assert.equal(amount(run.runBudget.reserved.resources, 'wood'), 2); assert.equal(amount(run.runBudget.reserved.resources), 0);
    assert.equal(f.writes[0].durableBeforeWrite.runBudget.reserved.resources[0].num, 2);
    assert.deepEqual(f.writes.map(({ name, body }) => ({ name, body })), [{ name: 'FinishWorkerOrderRequest', body: { index: 0 } }]);
    assert.equal(f.target.client.uncertainWrites.size, 0); assert.equal(f.history.unresolved(f.target.id), false);
    assert.deepEqual(createExecutionHistory({ file: f.file }).list(f.target.id)[0], run); unchangedPreview(row);
    assert.throws(() => f.service.execute(f.target, permit), { code: 'AUTHORIZATION_REQUIRED' });
  } finally { await f.cleanup(); }
});

for (const [label, reward, goldChange, evidence] of [
  ['item named GOLD', { reward: { asset: [{ type: 0, id: 'GOLD', num: 60 }] } }, 60, 'UNKNOWN'],
  ['only EXP', { reward: { asset: [{ type: 1, id: 'EXP', num: 60 }] } }, 60, 'UNKNOWN'],
  ['empty typed response', {}, 60, 'UNKNOWN'],
  ['wrong net GOLD', { reward: { asset: [{ type: 1, id: 'GOLD', num: 60 }] } }, 59, 'UNCONFIRMED'],
]) test('registered order ' + label + ' cannot invent matching reward evidence or change original completion', async () => {
  const f = fixture({ reward, goldChange }); try {
    const run = await f.execute(await f.plan()), row = run.actions[0];
    assert.equal(run.finalStatus, 'SUCCESS'); assert.equal(row.verification.status, 'CONFIRMED');
    assert.equal(row.rewardEvidence.verification.status, evidence); assert.equal(row.rewardEvidence.operationStatusUnchanged, true);
    assert.equal(row.receivedReward.receivedGold, label === 'wrong net GOLD' ? 60 : null);
    assert.equal(f.writes.length, 1); assert.equal(f.history.unresolved(f.target.id), false); unchangedPreview(row);
  } finally { await f.cleanup(); }
});

test('matching typed GOLD never confirms an unchanged order or releases UNKNOWN after restart', async () => {
  const f = fixture({ apply: false }); try {
    const run = await f.execute(await f.plan()), row = run.actions[0];
    assert.equal(row.rewardEvidence.verification.status, 'MATCHED'); assert.equal(row.receivedReward.receivedGold, 60);
    assert.equal(row.verification.status, 'UNCONFIRMED'); assert.equal(row.result, 'UNKNOWN'); assert.equal(run.finalStatus, 'UNKNOWN');
    assert.equal(row.unresolvedWrite, true); assert.equal(f.target.client.uncertainWrites.size, 1);
    assert.equal(amount(run.runBudget.reserved.resources, 'wood'), 2); assert.equal(run.runBudget.outcome, 'UNKNOWN');
    const reopened = createExecutionHistory({ file: f.file }); assert.equal(reopened.unresolved(f.target.id), true);
    assert.equal(reopened.list(f.target.id)[0].actions[0].rewardEvidence.verification.status, 'MATCHED');
    await assert.rejects(f.plan(), error => ['RESPONSE_UNCERTAIN', 'RECOVERY_UNCERTAIN'].includes(error.code));
    assert.equal(f.writes.length, 1); unchangedPreview(row);
  } finally { await f.cleanup(); }
});

for (const [label, mutate] of [
  ['generation', account => { account.generation++; }],
  ['world', account => { account.player.worldId = 13; }],
  ['player', account => { account.player.playerId = '9007199254740995'; }],
]) test('order ' + label + ' changes during locked fresh survey stop before dispatch', async () => {
  const f = fixture(); try {
    const planned = await f.plan(), permit = f.authorize(planned);
    f.target.synthetic.onRead = (account, name) => { if (name === 'OnWaterRequest') mutate(account); };
    const run = await f.execute(planned, f.target, permit);
    assert.notEqual(run.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 0);
    assert.equal(run.actions[0].dispatched, false); assert.notEqual(run.actions[0].rewardEvidence?.verification.status, 'MATCHED');
  } finally { await f.cleanup(); }
});

for (const [label, mutate] of [
  ['abort', account => { account.abort.abort(); }],
  ['world change', account => { account.player.worldId = 13; }],
]) test('order ' + label + ' after dispatch retains UNKNOWN despite a received typed reward', async () => {
  const f = fixture(); try {
    const planned = await f.plan(); f.target.synthetic.onWrite = mutate;
    const run = await f.execute(planned), row = run.actions[0];
    assert.equal(run.finalStatus, 'UNKNOWN'); assert.equal(row.unresolvedWrite, true); assert.equal(f.writes.length, 1);
    assert.notEqual(row.rewardEvidence.verification.status, 'MATCHED'); assert.equal(f.history.unresolved(f.target.id), true);
    assert.equal(amount(run.runBudget.reserved.resources, 'wood'), 2); unchangedPreview(row);
  } finally { await f.cleanup(); }
});

test('an unsolicited old typed reward cannot be borrowed by the following actual order response', async () => {
  const f = fixture({ reward: {}, goldChange: 0 }); try {
    f.target.receive('FinishWorkerOrderResponse', { reward: { asset: [{ type: 1, id: 'GOLD', num: 999 }] } });
    const run = await f.execute(await f.plan()), row = run.actions[0];
    assert.equal(row.verification.status, 'CONFIRMED'); assert.equal(row.rewardEvidence.verification.status, 'UNKNOWN');
    assert.equal(row.receivedReward.receivedGold, null); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('typed GOLD gains do not refill a parent budget or authorize a second GOLD-consuming order', async () => {
  const f = fixture({ input: 'GOLD', cost: 20, orderCount: 2 }); try {
    f.claim(20); const first = await f.execute(await f.plan()), row = first.actions[0];
    assert.equal(first.finalStatus, 'SUCCESS'); assert.equal(row.rewardEvidence.verification.status, 'MATCHED');
    assert.equal(row.rewardEvidence.verification.goldDebit, 20); assert.equal(row.rewardEvidence.verification.expectedDelta, 40);
    assert.equal(f.target.synthetic.gold, 140); assert.equal(amount(f.service.workflowBudget(f.target.id).reserved.resources), 20);
    const second = await f.execute(await f.plan(f.target, 1));
    assert.notEqual(second.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
    assert.equal(amount(f.service.workflowBudget(f.target.id).reserved.resources), 20); assert.equal(f.target.synthetic.gold, 140);
    assert.equal(second.actions[0].dispatched, false);
  } finally { await f.cleanup(); }
});

test('order permits and reward history remain isolated across account, player and connection contexts', async () => {
  const f = fixture(); try {
    const other = f.session('synthetic-order-B'), planned = await f.plan(), permit = f.authorize(planned);
    assert.throws(() => f.service.execute(other, permit)); assert.equal(f.writes.length, 0);
    const first = await f.execute(planned, f.target, permit);
    assert.equal(first.executionContext.accountId, f.target.id); assert.equal(f.history.list(other.id).length, 0);
    other.synthetic.reward = { reward: { asset: [{ type: 1, id: 'GOLD', num: 7 }] } }; other.synthetic.goldChange = 7;
    const second = await f.execute(await f.plan(other), other);
    assert.equal(second.actions[0].receivedReward.receivedGold, 7); assert.equal(first.actions[0].receivedReward.receivedGold, 60);
    assert.equal(second.actions[0].rewardEvidence.verification.status, 'MATCHED'); assert.notEqual(first.runId, second.runId);
    const restarted = createExecutionHistory({ file: f.file });
    assert.equal(restarted.list(f.target.id)[0].actions[0].receivedReward.receivedGold, 60);
    assert.equal(restarted.list(other.id)[0].actions[0].receivedReward.receivedGold, 7); assert.equal(f.writes.length, 2);
  } finally { await f.cleanup(); }
});
