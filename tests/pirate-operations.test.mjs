import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameClient } from '../src/client.mjs';
import { createCodec } from '../src/codec.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { compileUnifiedExecution } from '../src/loop.mjs';
import { createWorkflowStore, createWorkflowRunner } from '../src/workflow.mjs';
import {
  pirateSweepModule, planPirateSweep, surveyPirateSweep, validatePirateSweepParameters, viewPirateSweep,
} from '../src/pirate-operations.mjs';

const protocol = loadProtocol(), codec = createCodec(protocol);
const context = { accountId: 'offline-pirates', generation: 3, connectionId: 'offline-connection' };
const player = { playerId: '9007199254740993', worldId: '9', vip: { vipLevel: 1 } };
const noon = Date.parse('2026-11-12T05:00:00Z'), used = 2;
const parameters = { uid: 7, cityId: 9 };
const config = () => ({ tables: {
  PirateParamCfg: { data: [{ paramName: '每日野怪扫荡次数', paramValue: 3 }] },
  VipLevelCfg: { data: [{ level: 1, effects: [['野怪扫荡次数', 1]] }, { level: 2, effects: [] }] },
  MonthCardCfg: { data: [{ id: '普通月卡', effectList: [['野怪扫荡次数', 1]] }] },
} });
const testClaims = { resources: [], quotas: [{ id: 'pirate-sweep:2026-11-12', num: 1 }], uids: [{ type: 'pirate', id: '7' }] };
const quota = (used, total = 5) => ({ dayKey: '2026-11-12', used, total, remaining: total - used, reason: null });
const fixture = async (t, identity = context) => {
  const data = {
    used, pirates: [{ uid: 7, cityId: 9, type: 1, level: 5, gridIdx: 0 }, { uid: 8, cityId: 10, type: 1, level: 4, gridIdx: 1 },
      { uid: 9, cityId: 11, type: 2, level: 1, gridIdx: 2 }],
    records: [{ type: 1, maxKilledLevel: 5 }], cardItem: [{ type: 1, endTime: -1, gotDailyReward: true }],
    clockMs: noon, clockRadiusMs: 50, clockReliable: true, clockSourceAt: Date.now() - 2000,
    iron: 10, effect: null, unsequenced: null, beforeRead: null,
  };
  const writes = [], reads = [], errors = [];
  let socket, seq = 0;
  class OfflineSocket {
    constructor() { socket = this; this.readyState = 0; }
    open() { this.readyState = 1; this.onopen?.(); }
    close() { this.readyState = 3; }
    receive(name, body, ordered = true) {
      this.onmessage?.({ data: codec.encode(name, ordered ? ++seq : 0, body) });
    }
    send(bytes) {
      const { name, body } = codec.decode(bytes);
      if (['LoginRequest', 'PingRequest', 'Ack', 'Nack'].includes(name)) return;
      if (name === 'PirateSweepRequest') {
        writes.push({ name, body: { ...body } });
        data.effect?.();
        return;
      }
      reads.push(name);
      data.beforeRead?.(name);
      const response = {
        MonthCardRequest: { cardItem: data.cardItem },
        PirateKillRecordRequest: { records: data.records },
        AllItemRequest: { items: [{ itemId: '精铁', num: data.iron }] },
        AllResourceRequest: { list: [] },
        AllPirateRequest: { pirates: data.pirates, ...(data.used === undefined ? {} : { sweepTimes: data.used }) },
      }[name];
      assert.ok(response, 'unexpected offline request: ' + name);
      this.receive(name.replace(/Request$/, 'Response'), response, name !== data.unsequenced);
    }
  }
  const gameClock = {
    reset() {}, markPing() {},
    read() {
      return { status: data.clockReliable ? 'TRUSTED' : 'UNKNOWN', reliable: data.clockReliable, ...identity,
        source: 'PingResponse.serverTimestamp', sourceAt: data.clockSourceAt,
        nowMs: data.clockMs, earliestMs: data.clockMs - data.clockRadiusMs, latestMs: data.clockMs + data.clockRadiusMs };
    },
  };
  const client = new GameClient({ protocol, ...identity, WebSocketImpl: OfflineSocket, gameClock });
  client.factContext = { ...identity };
  client.on('error', error => errors.push(error));
  t.after(() => client.stop());
  const login = client.connect({}); socket.open();
  socket.receive('LoginResponse', { result: 0, initSeqNo: 12, playerInfo: player }, false);
  await login;
  const args = { config: config(), moduleConfig: { enabled: true }, player, parameters, timeout: 100 };
  const survey = (options = {}) => surveyPirateSweep(client, protocol, { ...args, ...options });
  const propose = async (options = {}) => {
    const facts = await survey(options);
    return { facts, plan: planPirateSweep(facts, { ...args, ...options }) };
  };
  const run = (operation, budget) => executeBusinessOperation(client, protocol, operation, {
    ...args, adapter: pirateSweepModule, budget, allowMutate: true, window: 0,
  });
  function runBudget(limits = testClaims) {
    const scope = { ...identity, runId: 'offline-pirate-run' };
    const runBudget = createRunBudgetContext({ scope, limits });
    // Lazy child: shared preflight's additional ordered inventory replies must
    // not invalidate the live pirate evidence.
    return { ledger: null, scope, runBudget, limits, batchId: 'offline-pirate-batch' };
  }
  return { data, writes, reads, errors, client, socket, args, survey, propose, run, runBudget };
};

async function integratedPirate(t) {
 const f=await fixture(t),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-pirate-service-')),historyFile=path.join(dir,'history.json');
 const history=createExecutionHistory({file:historyFile});
 const makeService=store=>createOperationService({modules:GAMEPLAY_MODULES,
  moduleSettings:{get:()=>({config:{enabled:true},source:'synthetic'})},protocol,history:store,getConfig:config,
  loadRules:()=>({config:{version:1,enabled:false,rules:[]}}),
  loadProduction:()=>({config:{version:1,enabled:false,onlyShortages:true,productIds:[],maxOperations:10}})});
 const service=makeService(history),session={id:context.accountId,state:'READY',generation:context.generation,connectionId:context.connectionId,
  player,client:f.client,abort:new AbortController(),busy:null,loop:{running:false}};
 const store=createWorkflowStore({file:path.join(dir,'workflow.json'),modules:GAMEPLAY_MODULES});
 const runner=createWorkflowRunner({operations:service,modules:GAMEPLAY_MODULES,getSession:()=>session,
  claim:(_id,runId,options)=>service.claimWorkflow(session,runId,options),onUpdate:state=>store.record(session.id,state)});
 t.after(async()=>{runner.stop();await runner.settle();await service.settle(session.id);f.client.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const execute=async plan=>{
  const permit=service.authorize(session,{batchId:plan.batchId,planHash:plan.planHash,
   approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});
  const started=service.execute(session,permit);await service.settle(session.id);
  return history.list(session.id).find(row=>row.runId===started.runId);
 };
 return {...f,dir,historyFile,history,service,session,store,runner,execute,makeService};
}

for(const entry of ['dailies','loop'])test(entry+' pirate Function uses shared authorization, exact parent budget and durable operation/workflow history',async t=>{
 const f=await integratedPirate(t);
 f.data.effect=()=>{f.data.used++;f.socket.receive('SCPirateSweepTimes',{sweepTimes:f.data.used});};
 const graph=compileUnifiedExecution({entry,dailies:[{taskId:1010,action:'perform',parameters}],budget:testClaims},{modules:GAMEPLAY_MODULES}).graph;
 const pending=await f.runner.start(f.session.id,graph);
 assert.equal(pending.status,'AWAITING_AUTHORIZATION');assert.equal(pending.plan.module,'pirate-sweep');assert.equal(pending.plan.actions.length,1);
 assert.equal(f.writes.length,0);assert.equal(f.history.list(f.session.id).length,0);
 assert.equal((await f.runner.resume()).status,'AWAITING_AUTHORIZATION');assert.equal(f.writes.length,0);
 const record=await f.execute(pending.plan);
 assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record.actions));assert.equal(record.workflowId,pending.runId);
 assert.equal(record.actions[0].verification.status,'CONFIRMED');assert.equal(f.writes.length,1);
 assert.deepEqual(f.writes[0],{name:'PirateSweepRequest',body:parameters});
 assert.equal((await f.runner.resume()).status,'COMPLETED');
 const persisted=createExecutionHistory({file:f.historyFile});assert.equal(persisted.list(f.session.id)[0].finalStatus,'SUCCESS');
 assert.deepEqual(persisted.list('other-account'),[]);assert.deepEqual(f.store.history('other-account'),[]);
 assert.equal(f.store.history(f.session.id)[0].status,'COMPLETED');
});

for(const entry of ['dailies','loop'])test(entry+' pirate UNKNOWN stops later work and survives Service/client restart without replay',async t=>{
 const f=await integratedPirate(t),graph=compileUnifiedExecution({entry,dailies:[{taskId:1010,parameters},{taskId:1010,parameters}],budget:testClaims},{modules:GAMEPLAY_MODULES}).graph;
 const pending=await f.runner.start(f.session.id,graph);assert.equal(pending.status,'AWAITING_AUTHORIZATION');
 const record=await f.execute(pending.plan);assert.equal(record.finalStatus,'UNKNOWN');assert.equal(f.writes.length,1);
 assert.equal((await f.runner.resume()).status,'UNKNOWN');assert.equal(f.writes.length,1);
 const history=createExecutionHistory({file:f.historyFile}),restarted=f.makeService(history);
 assert.equal(restarted.status(f.session.id).blocked,true);assert.equal(history.list(f.session.id)[0].finalStatus,'UNKNOWN');
 assert.equal(f.store.history(f.session.id)[0].status,'UNKNOWN');
 const fresh=await fixture(t,{...context,connectionId:'offline-reopened'}),session={...f.session,connectionId:'offline-reopened',client:fresh.client,busy:null,workflowOwner:null,abort:new AbortController()};
 assert.equal(fresh.client.uncertainWrites.size,0);
 await assert.rejects(restarted.plan(session,{module:'pirate-sweep',mode:'Manual',parameters,selections:pending.plan.actions.map(row=>row.actionId)}),{code:'RECOVERY_UNCERTAIN'});
 assert.equal(fresh.writes.length,0);assert.equal(fresh.reads.length,0);assert.equal(f.writes.length,1);
});

test('daily pirate cannot bypass missing parent quota or UID reservation',async t=>{
 for(const budget of [{...testClaims,quotas:[]},{...testClaims,uids:[]}]){
  const f=await integratedPirate(t),graph=compileUnifiedExecution({entry:'dailies',dailies:[{taskId:1010,parameters}],budget},{modules:GAMEPLAY_MODULES}).graph;
  const result=await f.runner.start(f.session.id,graph);assert.equal(result.status,'AWAITING_AUTHORIZATION');
  await assert.rejects(f.execute(result.plan),{code:'RUN_BUDGET_INVALID'});
  assert.equal(f.writes.length,0);const [record]=f.history.list(f.session.id);
  assert.equal(record.finalStatus,'NOT_EXECUTED');assert.equal(record.actions[0].requestStatus,'NOT_DISPATCHED');
  assert.equal(record.actions[0].result,'NOT_EXECUTED');assert.ok(record.finishedAt);
 }
});

test('actual v76 Codec/client plans exactly one ordinary action with matching UID, city, and day/UID budget', async t => {
  const f = await fixture(t);
  const noTarget = await f.propose({ parameters: {} });
  const view = viewPirateSweep(noTarget.facts, { ...f.args, parameters: {} });
  assert.deepEqual(view.quota, quota(used));
  assert.deepEqual(view.targets.map(({ uid, levelRelation, maxKilledLevel }) => [uid, levelRelation, maxKilledLevel]),
    [[7, 'HIGHEST', 5], [8, 'LOWER', 5], [9, 'FIRST_KILL_REQUIRED', 0]]);
  assert.deepEqual(view.candidates, []);
  assert.deepEqual(noTarget.plan.actions, []);
  const { plan, facts } = await f.propose();
  assert.equal(plan.actions.length, 1);
  const [operation] = plan.actions;
  assert.equal(operation.capabilityId, 'C151');
  assert.equal(operation.actionType, 'SWEEP');
  assert.deepEqual(operation.action, { request: 'PirateSweepRequest', response: null, body: parameters });
  assert.deepEqual(operation.costs, []);
  assert.deepEqual(operation.budgetClaims, testClaims);
  assert.deepEqual(operation.beforeState.quota, quota(2));
  assert.deepEqual(operation.expectedState.quota, quota(3));
  assert.equal(viewPirateSweep(facts, f.args).candidates[0]?.actionId, operation.actionId);
  assert.deepEqual(planPirateSweep({ ...facts }, f.args).actions, [], 'serialized/copied facts do not authorize writes');
  assert.deepEqual(planPirateSweep(facts, { ...f.args, moduleConfig: {} }).actions, []);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.errors, []);
});

test('strict explicit selection: malformed shapes, other city, lower level and first kill are not silently approved', async t => {
  for (const bad of [{ uid: 7 }, { cityId: 9 }, { ...parameters, allowLowerLevel: 1 }, { ...parameters, paid: true },
    { uid: -7, cityId: 9 }, { uid: 2147483648, cityId: 9 }, { uid: '7', cityId: 9 }, { allowLowerLevel: true },
    Object.create(parameters), { get uid() { throw Error('getter must not run'); }, cityId: 9 }]) {
    assert.throws(() => validatePirateSweepParameters(bad), { code: 'INVALID_PARAMETERS' });
  }
  const f = await fixture(t);
  for (const [parameters, reason] of [
    [{ uid: 7, cityId: 10 }, 'PIRATE_TARGET_UID_AND_CITY_NOT_CURRENT'],
    [{ uid: 8, cityId: 10 }, 'PIRATE_LOWER_LEVEL_CONFIRMATION_REQUIRED'],
    [{ uid: 8, cityId: 10, allowLowerLevel: false }, 'PIRATE_LOWER_LEVEL_CONFIRMATION_REQUIRED'],
    [{ uid: 9, cityId: 11, allowLowerLevel: true }, 'PIRATE_FIRST_KILL_REQUIRED'],
  ]) {
    const { plan } = await f.propose({ parameters });
    assert.deepEqual(plan.actions, []);
    assert.deepEqual(plan.notes, [reason]);
  }
  const { plan } = await f.propose({ parameters: { uid: 8, cityId: 10, allowLowerLevel: true } });
  assert.deepEqual(plan.actions.map(row => row.action.body), [{ uid: 8, cityId: 10 }]);
});

test('missing wire counter, duplicate targets, unsequenced reads, quota cap and uncertain clock cannot arm a sweep', async t => {
  for (const [reason, alter] of [
    ['PIRATE_POOL_COUNTER_OR_KILL_RECORDS_UNKNOWN', d => { d.used = undefined; }],
    ['PIRATE_POOL_COUNTER_OR_KILL_RECORDS_UNKNOWN', d => { d.pirates.push(d.pirates[0]); }],
    ['PIRATE_POOL_COUNTER_OR_KILL_RECORDS_UNKNOWN', d => { d.unsequenced = 'AllPirateRequest'; }],
    ['PIRATE_SWEEP_QUOTA_EXHAUSTED', d => { d.used = 5; }],
    ['PIRATE_USED_EXCEEDS_TOTAL', d => { d.used = 6; }],
    ['PIRATE_CLOCK_UNKNOWN', d => { d.clockReliable = false; }],
    ['PIRATE_DAY_POLICIES_DISAGREE', d => { d.clockMs = Date.parse('2026-11-12T15:30:00Z'); }],
    ['PIRATE_DAY_BOUNDARY_UNCERTAIN', d => { d.clockMs = Date.parse('2026-11-12T16:00:05Z'); }],
    ['PIRATE_MONTH_CARD_EXPIRY_UNCERTAIN', d => { d.cardItem[0].endTime = noon / 1000; }],
    ['PIRATE_GAME_DAY_CHANGED', d => { d.beforeRead = name => { if (name === 'AllPirateRequest') d.clockMs = noon + 86400000; }; }],
  ]) {
    await t.test(reason, async t => {
      const f = await fixture(t); alter(f.data);
      const { plan } = await f.propose();
      assert.deepEqual(plan.actions, []);
      assert.deepEqual(plan.notes, [reason]);
      assert.deepEqual(f.writes, []);
    });
  }
});

test('clock change and pirate stream changes invalidate prior authority, even on unrelated sequence traffic', async t => {
  const f = await fixture(t), { facts, plan } = await f.propose();
  f.socket.receive('AllResourceResponse', { list: [] });
  assert.equal(planPirateSweep(facts, f.args).actions[0]?.actionId, plan.actions[0]?.actionId);
  f.socket.receive('SCPirateSweepTimes', {}, false);
  assert.deepEqual(planPirateSweep(facts, f.args).actions, []);
  const next = await f.propose();
  assert.equal(next.plan.actions.length, 1);
  f.socket.receive('SCServerTimeChanged', { serverTimestamp: String(noon) });
  assert.deepEqual(planPirateSweep(next.facts, f.args).actions, []);
  assert.deepEqual((await f.propose()).plan.notes, ['PIRATE_CLOCK_UNKNOWN'], 'clock sample preceding explicit jump is stale');
});

test('scoped declared quota and UID survive shared inventory preflight; independent same-day +1 confirms no reward attribution', async t => {
  const f = await fixture(t);
  const { plan } = await f.propose();
  const [operation] = plan.actions, budget = f.runBudget();
  f.data.effect = () => {
    f.data.used++;
    f.data.iron += 3;
    f.socket.receive('SCPirateSweepTimes', { sweepTimes: f.data.used });
  };
  const result = await f.run(operation, budget);
  assert.equal(result.status, 'SUCCESS', result.error);
  assert.equal(result.dispatched, true);
  assert.equal(result.requestStatus, 'UNKNOWN');
  assert.deepEqual(result.responseEvidence, { namedResponse: 'NONE', reward: 'UNATTRIBUTED' });
  assert.deepEqual(result.afterState.quota, quota(3));
  assert.deepEqual(f.writes, [{ name: 'PirateSweepRequest', body: parameters }]);
  assert.equal(f.reads.filter(name => name === 'AllPirateRequest').length, 3, 'plan, execution baseline and independent readback');
  assert.equal(f.reads.filter(name => name === 'AllItemRequest').length, 4, 'plus shared inventory preflight');
  assert.deepEqual(budget.runBudget.snapshot().reserved, testClaims);
  assert.equal(f.client.uncertainWrites.size, 0);
});

test('the final allowed sweep verifies at exactly zero remaining, without requiring a counter push', async t => {
  const f = await fixture(t);
  f.data.used = 4;
  const { plan } = await f.propose();
  f.data.effect = () => { f.data.used++; };
  const result = await f.run(plan.actions[0], f.runBudget());
  assert.equal(result.status, 'SUCCESS', result.error);
  assert.deepEqual(result.afterState.quota, quota(5));
  assert.equal(f.writes.length, 1);
});

test('stock-only workflow, spent authorization, or a fresh exhausted server quota each stop before dispatch', async t => {
  for (const mode of ['stock-only', 'already-reserved', 'new-server-cap']) {
    await t.test(mode, async t => {
      const f = await fixture(t), { plan, facts } = await f.propose();
      const budget = f.runBudget(mode === 'stock-only' ? { resources: [], quotas: [], uids: [] } : testClaims);
      if (mode === 'new-server-cap') f.data.used = 5;
      if (mode === 'already-reserved') {
        const other = budget.runBudget.child(facts.stock, { batchId: 'earlier-batch', limits: testClaims, scope: budget.scope });
        assert.equal(other.reserveClaims(testClaims), true);
      }
      const result = await f.run(plan.actions[0], budget);
      assert.equal(result.status, 'NOT_EXECUTED', result.error);
      assert.equal(result.dispatched, false);
      assert.deepEqual(f.writes, []);
    });
  }
});

test('an accepted pirate push at the actual outgoing transport boundary stops before socket dispatch', async t => {
  const f = await fixture(t), { plan } = await f.propose(), budget = f.runBudget();
  f.client.on('frame', event => {
    if (event.dir === 'out' && event.name === 'PirateSweepRequest') f.socket.receive('SCPirateSweepTimes', {});
  });
  const result = await f.run(plan.actions[0], budget);
  assert.equal(result.status, 'NOT_EXECUTED', result.error);
  assert.equal(result.dispatched, false);
  assert.equal(result.unresolvedWrite, false);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(budget.runBudget.snapshot().reserved, testClaims);
});

test('a real dispatch stays UNKNOWN without exact isolated same-day readback', async t => {
  for (const [scenario, effect] of [
    ['no increment', () => {}],
    ['two increments', d => { d.used += 2; }],
    ['target disappeared', d => { d.used++; d.pirates.shift(); }],
    ['different pirate changed', d => { d.used++; d.pirates[1].gridIdx++; }],
    ['kill record changed', d => { d.used++; d.records[0].maxKilledLevel++; }],
    ['game day changed', d => { d.used++; d.clockMs += 86400000; }],
    ['conflicting counter push', (d, socket) => { d.used++; socket.receive('SCPirateSweepTimes', { sweepTimes: d.used + 1 }); }],
    ['multiple counter pushes', (d, socket) => {
      d.used++; socket.receive('SCPirateSweepTimes', { sweepTimes: d.used }); socket.receive('SCPirateSweepTimes', { sweepTimes: d.used });
    }],
    ['counter push during independent reread', (d, socket) => {
      d.used++;
      d.beforeRead = name => { if (name === 'AllPirateRequest') socket.receive('SCPirateSweepTimes', { sweepTimes: d.used }); };
    }],
    ['target pool update before independent reread', (d, socket) => { d.used++; socket.receive('SCPirateUpdate', {}); }],
  ]) {
    await t.test(scenario, async t => {
      const f = await fixture(t), { plan } = await f.propose(), budget = f.runBudget();
      f.data.effect = () => effect(f.data, f.socket);
      const result = await f.run(plan.actions[0], budget);
      assert.equal(result.status, 'UNKNOWN', result.error);
      assert.equal(result.dispatched, true);
      assert.equal(result.unresolvedWrite, true);
      assert.equal(result.verification.status, 'UNCONFIRMED');
      assert.equal(f.writes.length, 1);
      assert.equal(f.client.uncertainWrites.size, 1);
      assert.deepEqual(budget.runBudget.snapshot().reserved, testClaims);
    });
  }
});

for(const entry of ['dailies','loop'])test(entry+' registered pirate refusal remains target scoped across restart and independent targets require new authorization',async t=>{
 const f=await integratedPirate(t),firstGraph=compileUnifiedExecution({entry,dailies:[{taskId:1010,parameters}],budget:testClaims},{modules:GAMEPLAY_MODULES}).graph;
 const initial=await f.runner.start(f.session.id,firstGraph);assert.equal(initial.status,'AWAITING_AUTHORIZATION');
 // A definite transport refusal is injected at the same seam as the original
 // Service refusal tests. No server success, reward or eligibility is invented.
 f.client.sendWatch=async(_name,_body,options)=>{options.beforeDispatch?.();return {status:'REJECTED'};};
 const rejected=await f.execute(initial.plan);assert.equal(rejected.finalStatus,'REJECTED');
 await f.runner.resume();f.runner.stop();await f.runner.settle();
 const historyBytes=fs.readFileSync(f.historyFile,'utf8'),memoryFile=f.historyFile+'.memory.json',memoryBytes=fs.readFileSync(memoryFile,'utf8');
 const next=await fixture(t,{...context,generation:4,connectionId:'refusal-reopened'}),session={...f.session,generation:4,connectionId:'refusal-reopened',client:next.client,workflowOwner:null,busy:null,abort:new AbortController()};
 const service=f.makeService(createExecutionHistory({file:f.historyFile})),independent={uid:8,cityId:10,allowLowerLevel:true};
 const budget={resources:[],quotas:testClaims.quotas,uids:[{type:'pirate',id:'8'}]};
 const graph=compileUnifiedExecution({entry,dailies:[{taskId:1010,parameters},{taskId:1010,parameters:independent}],budget},{modules:GAMEPLAY_MODULES}).graph;
 const runner=createWorkflowRunner({operations:service,modules:GAMEPLAY_MODULES,getSession:()=>session,
  claim:(_id,runId,options)=>service.claimWorkflow(session,runId,options),onUpdate:state=>f.store.record(session.id,state)});
 t.after(async()=>{runner.stop();await runner.settle();await service.settle(session.id);});
 const pending=await runner.start(session.id,graph);assert.equal(pending.status,'AWAITING_AUTHORIZATION');
 assert.ok(pending.trace.some(row=>row.result==='BLOCKED_REJECTION_MEMORY'&&row.blockedReasons.includes('REJECTION_MEMORY_ACTIVE')));
 assert.deepEqual(pending.plan.parameters,independent);assert.equal(pending.plan.actions[0].target.uid,8);
 assert.equal(next.writes.length,0);assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');assert.equal(next.writes.length,0);
 assert.equal(fs.readFileSync(f.historyFile,'utf8'),historyBytes);assert.equal(fs.readFileSync(memoryFile,'utf8'),memoryBytes);
 const persisted=createWorkflowStore({file:path.join(f.dir,'workflow.json'),modules:GAMEPLAY_MODULES});
 const restored=persisted.history(session.id).find(row=>row.runId===pending.runId);
 assert.equal(restored.status,'RECOVERED_STOPPED');assert.ok(restored.trace.some(row=>row.result==='BLOCKED_REJECTION_MEMORY'));
 assert.deepEqual(persisted.history('other-account'),[]);
 next.data.effect=()=>{next.data.used++;next.socket.receive('SCPirateSweepTimes',{sweepTimes:next.data.used});};
 const permit=service.authorize(session,{batchId:pending.plan.batchId,planHash:pending.plan.planHash,
  approvedActionIds:pending.plan.actions.map(row=>row.actionId),resourceBudget:pending.plan.resourceBudget,confirm:true});
 service.execute(session,permit);await service.settle(session.id);
 const done=await runner.resume();assert.equal(done.status,'COMPLETED');assert.match(done.reason,/阻塞/);
 assert.deepEqual(next.writes,[{name:'PirateSweepRequest',body:{uid:8,cityId:10}}]);
 const records=service.history(session.id).runs;assert.equal(records.length,2);
 assert.equal(records.find(row=>row.runId===rejected.runId).finalStatus,'REJECTED');
 assert.equal(records.find(row=>row.workflowId===pending.runId).finalStatus,'SUCCESS');
 assert.equal(fs.readFileSync(memoryFile,'utf8'),memoryBytes);
});
