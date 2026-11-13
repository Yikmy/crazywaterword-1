import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameClient } from '../src/client.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { FUNCTION_CONTRACTS } from '../src/function-contracts.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

const protocol = loadProtocol();
const moduleId = 'pirate-sweep', accountId = 'synthetic-pirate-account';
const parameters = { uid: 72, cityId: 501 };
const target = { ...parameters, type: 1, level: 4, gridIdx: 81 };
const beforeUsed = 3;
const nowMs = Date.parse('2026-11-12T05:00:00Z');
const claim = { resources: [], quotas: [{ id: moduleId + ':2026-11-12', num: 1 }], uids: [{ type: 'pirate', id: '72' }] };
const config = { tables: {
  PirateParamCfg: { data: [{ paramName: '每日野怪扫荡次数', paramValue: 10 }] },
  VipLevelCfg: { data: [{ level: 1, effects: [['野怪扫荡次数', 2]] }] },
  MonthCardCfg: { data: [
    { id: '普通月卡', effectList: [['野怪扫荡次数', 4]] },
    { id: '高级月卡', effectList: [['野怪扫荡次数', 7]] },
  ] },
} };

// Actual Service, adapter, Codec, GameClient and durable stores. The only
// transport is a synthetic socket that returns explicit sequenced read frames.
async function fixture(t, { delta = 1, file = null, generation = 1, usedCount = beforeUsed, playerId = '9007199254740993', worldId = '9' } = {}) {
  const dir = file === null ? fs.mkdtempSync(path.join(os.tmpdir(), 'cw-pirate-service-')) : null;
  file ??= path.join(dir, 'history.json');
  const history = createExecutionHistory({ file });
  const service = createOperationService({ protocol, history, modules: GAMEPLAY_MODULES,
    moduleSettings: { get: () => ({ config: { enabled: true } }) },
    getConfig: () => config, loadRules: () => ({ config: {} }), loadProduction: () => ({ config: {} }),
  });

  const connectionId = 'synthetic-pirate-connection-' + generation;
  const gameClock = { reset() {}, markPing() {}, read() {
    return { status: 'TRUSTED', reliable: true, source: 'PingResponse.serverTimestamp',
      accountId, generation, earliestMs: nowMs - 10, nowMs, latestMs: nowMs + 10 };
  } };
  const reads = [], writes = [];
  let seq = 0, used = usedCount;
  class SyntheticSocket {
    constructor() { this.readyState = 0; }
    close() { this.readyState = 3; }
    receive(name, body, sequence = ++seq) { this.onmessage({ data: client.codec.encode(name, sequence, body) }); }
    send(bytes) {
      const { name, body } = client.codec.decode(bytes);
      if (name === 'LoginRequest' || name === 'Ack' || name === 'PingRequest') return;
      if (name === 'PirateSweepRequest') {
        const durable = JSON.parse(fs.readFileSync(file, 'utf8')).accounts[accountId][0];
        writes.push({ name, body: { ...body }, durable });
        used += delta;
        return; // There is no named response for this command.
      }
      reads.push({ name, used });
      const response = {
        MonthCardRequest: { cardItem: [{ type: 1, endTime: -1 }, { type: 2, endTime: 0 }] },
        PirateKillRecordRequest: { records: [{ type: 1, maxKilledLevel: 4 }] },
        AllPirateRequest: { sweepTimes: used, pirates: [target] },
        AllItemRequest: { items: [{ itemId: 'wood', num: 5 }] },
        AllResourceRequest: { list: [{ res: 3, amount: 100 }] },
      }[name];
      assert.ok(response, 'unexpected synthetic wire request: ' + name);
      this.receive(name.replace(/Request$/, 'Response'), response);
    }
  }

  const client = new GameClient({ protocol, accountId, generation, gameClock, WebSocketImpl: SyntheticSocket });
  client.factContext = { accountId, generation, connectionId };
  t.after(async () => {
    await service.settle(accountId);
    client.stop();
    if (dir) {
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  const login = client.connect({});
  client.socket.readyState = 1;
  client.socket.onopen();
  client.socket.receive('LoginResponse', { result: 0, initSeqNo: 12, playerInfo: {
    playerId, worldId, vip: { vipLevel: 1, vipExp: '0' },
  } }, 0);
  const player = (await login).playerInfo;
  const session = { id: accountId, client, player, generation, connectionId, state: 'READY', abort: new AbortController() };
  async function plan() {
    const surveyed = await service.surveyModule(session, moduleId, parameters);
    const row = surveyed.view.candidates[0];
    assert.ok(row?.executable, 'current explicit target should be eligible: ' + JSON.stringify({ row, notes: surveyed.view.notes }));
    assert.deepEqual(surveyed.view.quota, { dayKey: '2026-11-12', used: usedCount, total: 16, remaining: 16-usedCount, reason: null });
    const planInput = { module: moduleId, mode: 'Manual', parameters, selections: [row.actionId] };
    const plan = await service.plan(session, planInput);
    assert.deepEqual(FUNCTION_CONTRACTS[moduleId].requirementIds.C, ['C151']);
    assert.equal(plan.actions[0].capabilityId, 'cw.pirate-sweep');
    assert.deepEqual(plan.budgetClaims, claim);
    return { plan, planInput };
  }
  function authorize(plan) {
    return service.authorize(session, { batchId: plan.batchId, planHash: plan.planHash,
      approvedActionIds: plan.actions.map(row => row.actionId), resourceBudget: plan.resourceBudget, confirm: true });
  }
  return { client, service, session, history, file, reads, writes, plan, authorize };
}

function assertDispatch(f, plan, runId) {
  assert.equal(f.writes.length, 1);
  const [{ name, body, durable }] = f.writes;
  assert.equal(name, 'PirateSweepRequest');
  assert.deepEqual(body, parameters, 'the wire contains only the approved UID and cityId');
  assert.equal(durable.runId, runId);
  assert.equal(durable.planSummary.batchId, plan.batchId);
  assert.equal(durable.actions[0].requestStatus, 'DISPATCHING');
  assert.deepEqual(durable.actions[0].dispatchEvidence, { version: 1, contract: 'business-write-ahead-v1', state: 'MAY_HAVE_DISPATCHED' });
  assert.equal(durable.actions[0].stages.at(-1).stage, 'DISPATCH_INTENT');
  assert.deepEqual(durable.runBudget.limits, claim);
  assert.deepEqual(durable.runBudget.reserved, claim, 'quota and UID must be persisted before socket.send');
  assert.equal(durable.runBudget.scope.connectionId, f.session.connectionId);
}

test('C151 approved PirateSweep sends exactly once and requires a fresh +1 counter to succeed', async t => {
  const f = await fixture(t);
  const { plan } = await f.plan();
  assert.equal(f.writes.length, 0, 'read and plan do not send a write');
  assert.throws(() => f.service.execute(f.session, { batchId: plan.batchId, permitId: 'unapproved' }),
    { code: 'AUTHORIZATION_REQUIRED' });
  const permit = f.authorize(plan);
  assert.equal(f.writes.length, 0, 'authorization alone does not send a write');
  const { runId } = f.service.execute(f.session, permit);
  await f.service.settle(accountId);
  assertDispatch(f, plan, runId);

  const [run] = f.service.history(accountId, runId).runs;
  const [row] = run.actions;
  assert.equal(run.finalStatus, 'SUCCESS');
  assert.equal(row.result, 'SUCCESS');
  assert.equal(row.verification.status, 'CONFIRMED');
  assert.equal(row.beforeState.quota.used, beforeUsed);
  assert.equal(row.afterState.quota.used, beforeUsed + 1);
  assert.match(row.verification.reason, /奖励归属未确认/);
  assert.equal(Object.hasOwn(row, 'receivedReward'), false);
  assert.ok(row.stages.some(event => event.stage === 'OBSERVATION_ENDED'));
  assert.equal(row.stages.some(event => event.stage === 'RESPONSE'), false);
  assert.deepEqual(f.reads.filter(row => row.name === 'AllPirateRequest').map(row => row.used),
    [beforeUsed, beforeUsed, beforeUsed, beforeUsed + 1], 'survey, plan, write preflight and verification use independent replies');
  assert.equal(f.client.uncertainWrites.size, 0);
  assert.throws(() => f.service.execute(f.session, permit), { code: 'AUTHORIZATION_REQUIRED' });
  assert.equal(f.writes.length, 1);
});

test('C151 unchanged counter retains the quota and UID, blocks a new plan after restart, and never replays', async t => {
  const f = await fixture(t, { delta: 0 });
  const { plan, planInput } = await f.plan();
  const permit = f.authorize(plan);
  const { runId } = f.service.execute(f.session, permit);
  await f.service.settle(accountId);
  assertDispatch(f, plan, runId);

  const [run] = f.service.history(accountId, runId).runs;
  assert.equal(run.finalStatus, 'UNKNOWN');
  assert.equal(run.actions[0].result, 'UNKNOWN');
  assert.equal(run.actions[0].unresolvedWrite, true);
  assert.equal(run.actions[0].afterState.quota.used, beforeUsed);
  assert.match(run.actions[0].verification.reason, /COUNTER_INCREMENT_NOT_CONFIRMED/);
  assert.deepEqual(run.runBudget.reserved, claim);
  assert.equal(f.client.uncertainWrites.size, 1);
  f.client.stop();

  const restarted = await fixture(t, { file: f.file, generation: 2 });
  assert.equal(restarted.client.uncertainWrites.size, 0, 'fresh socket has no original in-memory fingerprint');
  assert.equal(restarted.service.status(accountId).blocked, true);
  assert.equal(restarted.history.list(accountId)[0].resumable, false);
  assert.deepEqual(restarted.history.list(accountId)[0].runBudget.reserved, claim);
  await assert.rejects(restarted.service.plan(restarted.session, planInput), { code: 'RECOVERY_UNCERTAIN' });
  assert.throws(() => restarted.service.execute(restarted.session, permit), { code: 'STALE_PLAN' });
  assert.deepEqual(restarted.writes, []);
  assert.deepEqual(restarted.reads, [], 'unresolved write blocks before a new plan or transport');
  assert.equal(restarted.history.list(accountId).length, 1);
});

test('C151 definite refusal survives a new socket with the same target and quota',async t=>{
 const f=await fixture(t,{delta:0}),{plan}=await f.plan();
 f.client.sendWatch=async(_name,_body,options)=>{options.beforeDispatch?.();return {status:'REJECTED'};};
 f.service.execute(f.session,f.authorize(plan));await f.service.settle(accountId);
 assert.equal(f.history.list(accountId)[0].finalStatus,'REJECTED');
 const historyBefore=fs.readFileSync(f.file,'utf8'),memoryBefore=fs.readFileSync(f.file+'.memory.json','utf8');
 const next=await fixture(t,{file:f.file,generation:2});
 await assert.rejects(next.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.deepEqual(next.writes,[]);
 assert.equal(fs.readFileSync(f.file,'utf8'),historyBefore);assert.equal(fs.readFileSync(f.file+'.memory.json','utf8'),memoryBefore);
});
async function refusedPirate(t){
 const f=await fixture(t,{delta:0}),{plan}=await f.plan();
 f.client.sendWatch=async(_name,_body,options)=>{options.beforeDispatch?.();return {status:'REJECTED'};};
 f.service.execute(f.session,f.authorize(plan));await f.service.settle(accountId);assert.equal(f.history.list(accountId)[0].finalStatus,'REJECTED');return f;
}
for(const changed of ['quota','player','world'])test('C151 refusal permits fresh '+changed+' facts and retains the original scope',async t=>{
 const f=await refusedPirate(t),next=await fixture(t,{file:f.file,generation:2,...(changed==='quota'?{usedCount:4}:changed==='player'?{playerId:'9007199254740994'}:{worldId:'10'})});
 assert.equal((await next.plan()).plan.actions.length,1);assert.deepEqual(next.writes,[]);assert.equal(next.service.executionMemory(accountId).events.length,1);
 const back=await fixture(t,{file:f.file,generation:3});await assert.rejects(back.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.deepEqual(back.writes,[]);
});
for(const missing of ['executionContext','worldId'])test('C151 refusal missing original '+missing+' cannot be unlocked by a new connection',async t=>{
 const f=await refusedPirate(t),saved=f.history.list(accountId)[0];if(missing==='executionContext')delete saved.executionContext;else delete saved.executionContext.worldId;f.history.put(saved);
 const next=await fixture(t,{file:f.file,generation:2,usedCount:4});await assert.rejects(next.plan(),error=>['REJECTION_MEMORY_ACTIVE','MEMORY_EVENT_CONFLICT'].includes(error.code));assert.deepEqual(next.writes,[]);
});