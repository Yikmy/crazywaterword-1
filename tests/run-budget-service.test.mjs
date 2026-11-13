import test from 'node:test';
import { GameClient, readVipLevelEvent } from '../src/client.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createCodec } from '../src/codec.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createWorkflowRunner, createWorkflowStore, projectWorkflowExecutionHistory } from '../src/workflow.mjs';
import { CORE_OPERATION_MODULES, ordersModule } from '../src/core-operation-adapters.mjs';

const rules = { version: 1, enabled: true, rules: [] };
const config = { tables: { WorkerOrderCfg: { data: [{ itemId: 'wood', reward: [['EXP', 1]] }] }, WorkerSpecOrderCfg: { data: [] } } };
const production = { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 };
const protocol = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets', 'FinishWorkerOrder'].flatMap(name => [[name + 'Request', {}], [name + 'Response', {}]]));
const claims = amount => ({ resources: [{ id: 'wood', num: amount }], quotas: [], uids: [] });
const amount = (rows, id = 'wood') => rows.find(row => row.id === id)?.num ?? 0;
const order = index => ({ index, workerId: 'synthetic-resident-' + index, textId: 1, isSpecial: false, refreshTime: 0, requirements: [{ id: 'wood', num: 40 }] });
function fixture({ stock = 60, apply = true, connection = true, clock = Date.now } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-run-budget-service-'));
  const durable = createExecutionHistory({ file: path.join(dir, 'history.json') });
  let failPut = () => false, writerAllowed = true;
  const journal = [], reads = [], writes = [], clients = new Map(), releases = [];
  const history = { ...durable, put(record) { if (failPut(record)) throw Object.assign(Error('synthetic run-budget persistence failure'), { code: 'HISTORY_UNAVAILABLE' }); journal.push(structuredClone(record)); return durable.put(record); } };
  const moduleSettings = createModuleSettings({ file: path.join(dir, 'module-settings.json'), modules: CORE_OPERATION_MODULES });
  const service = createOperationService({ protocol, clock, getConfig: () => config, loadRules: () => ({ config: rules }), loadProduction: () => ({ config: production, warning: null }), history, modules: CORE_OPERATION_MODULES, moduleSettings, assertWriter() { if (!writerAllowed) throw Object.assign(Error('synthetic writer owner lost'), { code: 'WRITER_LOST' }); } });
  function makeSession(id = 'A') {
    const state = { stock, raw: { building: [], workerOrder: [order(0), order(1), order(2)], orderOfTheDay: { orderNum: 7 } }, apply, beforeWrite: null, beforeRead: null };
    const uncertainWrites = new Set();
    const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites,
      async request(name, body, response, timeout, options) {
        if (options?.mutate) {
          state.beforeWrite?.(name, body); writes.push({ id, name, body: structuredClone(body), durableBeforeWrite: structuredClone(journal.at(-1) ?? null) });
          if (state.apply) { state.raw.workerOrder = state.raw.workerOrder.filter(row => row.index !== body.index); state.raw.orderOfTheDay.orderNum++; state.stock -= 40; }
          return {};
        }
        reads.push({ id, name }); await state.beforeRead?.(name);
        if (name === 'OnWaterRequest') return structuredClone(state.raw);
        if (name === 'AllItemRequest') return { items: [{ itemId: 'wood', num: state.stock }] };
        if (name === 'AllResourceRequest') return { list: [] };
        if (name === 'MyResFieldsRequest') return { info: { fields: [] } };
        if (name === 'MyFleetsRequest') return { fleets: [] };
        throw Error('Unexpected synthetic request ' + name);
      },
      markUnverifiedWrite(name, body) { uncertainWrites.add(JSON.stringify({ name, body })); },
      confirmWatchedWrite(name, body) { uncertainWrites.delete(JSON.stringify({ name, body })); },
    };
    clients.set(client, state);
    moduleSettings.save(id, 'orders', { enabled: true });
    return { id, client, player: { playerId: 'synthetic-player-' + id, worldId: 1, level: 5 }, state: 'READY', generation: 1, ...(connection ? { connectionId: 'synthetic-connection-' + id } : {}), abort: new AbortController(), busy: null, loop: { running: false } };
  }
  const session = makeSession();
  function claim(target = session, runId = 'synthetic-parent-' + target.id, limits = claims(60)) {
    const release = service.claimWorkflow(target, runId, { limits }); releases.push(release); return { runId, release };
  }
  async function plan(target = session, index = 0, workflowId = target.workflowOwner ?? null, { legacy = false } = {}) {
    const facts = await ordersModule.survey(target.client, protocol, { config, player: target.player });
    const candidate = ordersModule.view(facts, { config, rules, moduleConfig: { enabled: true }, parameters: {} }).candidates.find(row => row.target.index === index);
    assert.ok(candidate, 'expected synthetic order candidate #' + index);
    return service.plan(target, { module: 'orders', mode: 'Manual', selections: [candidate.actionId], ...(!legacy ? { parameters: {} } : {}) }, { workflowId });
  }
  function authorize(target, planned, extra = {}) { return service.authorize(target, { batchId: planned.batchId, planHash: planned.planHash, approvedActionIds: planned.actions.map(row => row.actionId), resourceBudget: planned.resourceBudget, confirm: true, ...extra }); }
  async function execute(target, planned) { const permit = authorize(target, planned); const started = service.execute(target, permit); await service.settle(target.id); return { started, status: service.status(target.id), record: durable.list(target.id).find(row => row.planSummary?.batchId === planned.batchId) }; }
  async function attemptAnother(target = session, index = 1) {
    let planned;
    try { planned = await plan(target, index); } catch (error) { assert.match(error.message, /预算|budget|声明/i); return { rejected: true, error }; }
    const result = await execute(target, planned); assert.notEqual(result.status.finalStatus, 'SUCCESS'); return result;
  }
  async function cleanup() {
    writerAllowed = true; failPut = () => false; for (const release of releases.reverse()) release();
    await Promise.all([...new Set(['A', 'B'])].map(id => service.settle(id)));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true });
  }
  return { service, session, moduleSettings, history: durable, journal, reads, writes, clients, makeSession, claim, plan, authorize, execute, attemptAnother, cleanup, state(target = session) { return clients.get(target.client); }, setFailPut(predicate) { failPut = predicate; }, setWriterAllowed(value) { writerAllowed = value; } };
}

test('Workflow previews and authorization bind a finite scope/limits identity without debiting the parent', async () => {
  const f = fixture();
  try {
    const parent = f.claim(), initial = f.service.workflowBudget('A'); assert.equal(initial.scope.accountId, 'A'); assert.equal(initial.scope.runId, parent.runId); assert.equal(initial.scope.generation, 1); assert.equal(initial.scope.connectionId, 'synthetic-connection-A'); assert.deepEqual(initial.limits, claims(60));
    for (let i = 0; i < 2; i++) {
      const planned = await f.plan(); assert.deepEqual(planned.resourceBudget, [{ id: 'wood', num: 40 }]);
      assert.deepEqual(planned.runBudgetIdentity, { scope: initial.scope, limits: initial.limits });
      f.authorize(f.session, planned); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 0);
    }
    assert.equal(f.writes.length, 0); assert.equal(f.service.workflowBudget('A').batches.length, 0);
  } finally { await f.cleanup(); }
});

test('a 60-unit parent cannot execute two 40-unit batches even when fresh inventory becomes 1000', async () => {
  const f = fixture();
  try {
    const parent = f.claim(), first = await f.execute(f.session, await f.plan());
    assert.equal(first.status.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
    assert.equal(first.record.parentRunId, parent.runId); assert.equal(first.record.workflowId, parent.runId); assert.equal(first.record.runBudget.scope.runId, parent.runId); assert.equal(amount(first.record.runBudget.reserved.resources), 40);
    f.state().stock = 1000; await f.attemptAnother();
    const budget = f.service.workflowBudget('A'); assert.deepEqual(budget.limits, claims(60)); assert.equal(amount(budget.reserved.resources), 40); assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].durableBeforeWrite.runBudget.scope.runId, parent.runId); assert.equal(amount(f.writes[0].durableBeforeWrite.runBudget.reserved.resources), 40, 'parent debit must be durable before transport');
  } finally { await f.cleanup(); }
});

test('an omitted parent limit freezes the first reliable stock once and later fresh income cannot replenish it', async () => {
  const f = fixture();
  try {
    f.claim(f.session, 'stock-frozen-parent', null);
    const planned = await f.plan(); assert.deepEqual(f.service.workflowBudget('A').limits, claims(60));
    assert.equal((await f.execute(f.session, planned)).status.finalStatus, 'SUCCESS'); f.state().stock = 1000;
    await f.attemptAnother(); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('a standalone exact batch also persists its finite parent/child budget before the original executor writes', async () => {
  const f = fixture({ stock: 1000 });
  try {
    const planned = await f.plan(), result = await f.execute(f.session, planned); assert.equal(result.status.finalStatus, 'SUCCESS');
    assert.deepEqual(result.record.runBudget.limits, claims(40)); assert.equal(amount(result.record.runBudget.reserved.resources), 40); assert.equal(result.record.runBudget.batches.length, 1);
    assert.equal(result.record.runBudget.scope.accountId, 'A'); assert.equal(result.record.runBudget.scope.generation, 1); assert.equal(result.record.runBudget.scope.connectionId, 'synthetic-connection-A'); assert.equal(result.record.runBudget.resumable, false);
    assert.equal(amount(f.writes[0].durableBeforeWrite.runBudget.reserved.resources), 40); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('different accounts may reuse a human run label while keeping parent scopes and material debits isolated', async () => {
  const f = fixture();
  try {
    const b = f.makeSession('B'); f.claim(f.session, 'same-display-run'); f.claim(b, 'same-display-run');
    assert.equal((await f.execute(f.session, await f.plan())).status.finalStatus, 'SUCCESS');
    assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40); assert.equal(amount(f.service.workflowBudget('B').reserved.resources), 0);
    assert.equal((await f.execute(b, await f.plan(b))).status.finalStatus, 'SUCCESS');
    assert.equal(amount(f.service.workflowBudget('B').reserved.resources), 40); assert.notDeepEqual(f.service.workflowBudget('A').scope, f.service.workflowBudget('B').scope); assert.equal(f.writes.length, 2);
  } finally { await f.cleanup(); }
});

for (const change of ['generation', 'client', 'connectionId']) test('a changed ' + change + ' cannot reuse an authorized Workflow parent or transmit its order', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), permit = f.authorize(f.session, planned);
    if (change === 'generation') f.session.generation++;
    else if (change === 'connectionId') f.session.connectionId = 'forged-current-connection';
    else f.session.client = f.makeSession('B').client;
    assert.throws(() => f.service.execute(f.session, permit), /预算|会话|连接|范围|代次|失效|切换/); assert.equal(f.writes.length, 0); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 0);
  } finally { await f.cleanup(); }
});

test('synthetic Sessions without connectionId receive a stable per-client identity that cannot survive replacement', async () => {
  const f = fixture({ connection: false });
  try {
    f.claim(); const planned = await f.plan(), scope = f.service.workflowBudget('A').scope; assert.ok(scope.connectionId);
    assert.equal((await f.execute(f.session, planned)).status.finalStatus, 'SUCCESS');
    const replacement = f.makeSession('A'); f.session.client = replacement.client;
    await assert.rejects(f.plan(f.session, 1), /预算|会话|连接|范围|代次|失效|切换/); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('UNKNOWN holds cumulative material claims, records an unresumable budget and blocks automatic replanning', async () => {
  const f = fixture({ apply: false });
  try {
    const parent = f.claim(), result = await f.execute(f.session, await f.plan());
    assert.equal(result.status.finalStatus, 'UNKNOWN'); assert.equal(result.status.blocked, true); assert.equal(result.record.actions[0].unresolvedWrite, true);
    assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40); assert.equal(result.record.runBudget.resumable, false);
    await assert.rejects(f.plan(f.session, 1), /未决|UNKNOWN|不确定/); assert.equal(f.writes.length, 1);
    parent.release(); const closed = f.service.workflowBudget('A'); assert.equal(closed.state, 'CLOSED'); assert.equal(amount(closed.reserved.resources), 40);
  } finally { await f.cleanup(); }
});

test('stopping a claimed parent invalidates old authorization without refunding a successful earlier child', async () => {
  const f = fixture({ stock: 80 });
  try {
    const parent = f.claim(f.session, 'stopped-parent', claims(80)); assert.equal((await f.execute(f.session, await f.plan())).status.finalStatus, 'SUCCESS');
    const planned = await f.plan(f.session, 1), permit = f.authorize(f.session, planned); parent.release();
    assert.throws(() => f.service.execute(f.session, permit), /批次|归属|预算|关闭|失效/);
    const closed = f.service.workflowBudget('A'); assert.equal(closed.state, 'CLOSED'); assert.equal(closed.outcome, 'STOPPED'); assert.equal(amount(closed.reserved.resources), 40); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('a caller-mutated displayed runBudgetIdentity cannot change the actual parent or authorize a forged hash', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), original = structuredClone(planned); planned.runBudgetIdentity.limits.resources[0].num = 1000; planned.runBudgetIdentity.scope.accountId = 'B';
    assert.throws(() => f.authorize(f.session, planned, { planHash: 'forged-parent-budget-hash' }), /授权|计划|预算/);
    assert.deepEqual(f.service.workflowBudget('A').limits, claims(60)); assert.equal((await f.execute(f.session, original)).status.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
  } finally { await f.cleanup(); }
});

test('failure persisting the reserved parent budget stops transport and conservatively keeps the debit', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(); f.setFailPut(record => amount(record.runBudget?.reserved?.resources ?? []) > 0);
    const permit = f.authorize(f.session, planned); f.service.execute(f.session, permit); await f.service.settle('A');
    assert.equal(f.writes.length, 0); assert.notEqual(f.service.status('A').finalStatus, 'SUCCESS'); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40);
  } finally { await f.cleanup(); }
});

test('loss of the writer owner before execution never starts resource reads, reservations or transport', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), permit = f.authorize(f.session, planned), readCount = f.reads.length; f.setWriterAllowed(false);
    assert.throws(() => f.service.execute(f.session, permit), /writer owner lost/); assert.equal(f.writes.length, 0); assert.equal(f.reads.length, readCount); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 0);
  } finally { await f.cleanup(); }
});

test('writer ownership lost during original resource preflight prevents dispatch and cannot become SUCCESS', async () => {
  const f = fixture();
  try {
    f.claim(); const planned = await f.plan(), permit = f.authorize(f.session, planned);
    f.state().beforeRead = name => { if (name === 'AllResourceRequest') f.setWriterAllowed(false); };
    f.service.execute(f.session, permit); await f.service.settle('A');
    assert.equal(f.writes.length, 0); assert.notEqual(f.service.status('A').finalStatus, 'SUCCESS');
  } finally { await f.cleanup(); }
});

for (const limit of [60, 80]) test('real two-ACTION Workflow obeys the same ' + limit + '-unit parent across independently authorized child batches', async () => {
  const f = fixture({ stock: 1000 }); let runner;
  try {
    const facts = await ordersModule.survey(f.session.client, protocol, { config, player: f.session.player });
    const rows = ordersModule.view(facts, { config, rules, moduleConfig: { enabled: true }, parameters: {} }).candidates;
    const graph = { version: 1, id: 'two-real-orders-' + limit, name: 'Synthetic two-order budget ' + limit, budget: claims(limit), nodes: [
      { id: 's', type: 'START' }, { id: 'a1', type: 'ACTION', module: 'orders', parameters: {}, selection: rows[0].actionId }, { id: 'v1', type: 'VERIFY', module: 'orders' },
      { id: 'a2', type: 'ACTION', module: 'orders', parameters: {}, selection: rows[1].actionId }, { id: 'v2', type: 'VERIFY', module: 'orders' }, { id: 'z', type: 'STOP' },
    ], edges: [{ from: 's', to: 'a1' }, { from: 'a1', to: 'v1' }, { from: 'v1', to: 'a2' }, { from: 'a2', to: 'v2' }, { from: 'v2', to: 'z' }] };
    const updates = [];
    runner = createWorkflowRunner({ operations: f.service, modules: CORE_OPERATION_MODULES, getSession: id => id === 'A' ? f.session : null,
      isCurrent: (session, generation, client) => session === f.session && session.generation === generation && session.client === client,
      claim: (id, runId, options) => f.claim(f.session, runId, options.limits).release, onUpdate: status => { updates.push(structuredClone(status)); } });
    const first = await runner.start('A', graph); assert.equal(first.status, 'AWAITING_AUTHORIZATION'); assert.equal(f.writes.length, 0);
    assert.equal(first.plan.parentRunId, first.runId); assert.equal(amount(first.runBudget.reserved.resources), 0);
    const executedFirst = await f.execute(f.session, first.plan); assert.equal(executedFirst.status.finalStatus, 'SUCCESS'); assert.equal(f.writes.length, 1);
    const second = await runner.resume(); assert.equal(second.status, 'AWAITING_AUTHORIZATION'); assert.notEqual(second.plan.batchId, first.plan.batchId); assert.equal(second.plan.parentRunId, first.runId);
    assert.equal(second.plan.runBudgetIdentity.scope.runId, first.runId); assert.equal(amount(second.runBudget.reserved.resources), 40); assert.equal(f.writes.length, 1, 'planning the next node never auto-dispatches');
    const executedSecond = await f.execute(f.session, second.plan), finished = await runner.resume();
    if (limit === 80) {
      assert.equal(executedSecond.status.finalStatus, 'SUCCESS'); assert.equal(finished.status, 'COMPLETED'); assert.equal(f.writes.length, 2); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 80);
      assert.equal(finished.trace.filter(row => row.type === 'VERIFY' && row.result === 'CONFIRMED').length, 2);
    } else {
      assert.notEqual(executedSecond.status.finalStatus, 'SUCCESS'); assert.equal(finished.status, 'UNKNOWN'); assert.equal(f.writes.length, 1); assert.equal(amount(f.service.workflowBudget('A').reserved.resources), 40);
      assert.equal(finished.trace.filter(row => row.type === 'VERIFY' && row.result === 'CONFIRMED').length, 1);
    }
    for (const write of f.writes) { assert.equal(write.durableBeforeWrite.runBudget.scope.runId, first.runId); assert.ok(amount(write.durableBeforeWrite.runBudget.reserved.resources) >= 40); }
    assert.equal(f.service.workflowBudget('A').state, 'CLOSED'); assert.equal(f.service.workflowBudget('A').resumable, false); assert.ok(updates.some(row => row.status === 'AWAITING_AUTHORIZATION'));
  } finally { runner?.stop(); await runner?.settle(); await f.cleanup(); }
});

for(const phase of ['authorize','execute','preflight'])test('existing Service rejects expired Workflow at '+phase+' before any synthetic write',async()=>{
 let time=Date.now();const f=fixture({stock:1000,clock:()=>time});let runner;
 try{
  const facts=await ordersModule.survey(f.session.client,protocol,{config,player:f.session.player}),candidate=ordersModule.view(facts,{config,rules,moduleConfig:{enabled:true},parameters:{}}).candidates[0];
  const graph={version:1,id:'bounded-orders',name:'Bounded existing service',budget:claims(80),runPolicy:{maxDurationMs:10000,maxActions:1,modules:['orders']},nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'orders',parameters:{},selection:candidate.actionId},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'z'}]};
  runner=createWorkflowRunner({modules:CORE_OPERATION_MODULES,operations:f.service,clock:()=>time,getSession:()=>f.session,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options)});
  const status=await runner.start('A',graph);assert.equal(status.status,'AWAITING_AUTHORIZATION');assert.equal(f.writes.length,0);const permit=phase==='authorize'?null:f.authorize(f.session,status.plan);
  if(phase==='preflight'){
   let moved=false;f.clients.get(f.session.client).beforeRead=()=>{if(!moved){moved=true;time=Date.parse(status.expiresAt);}};
   f.service.execute(f.session,permit);await f.service.settle('A');assert.notEqual(f.service.status('A').finalStatus,'SUCCESS');
  }else{
   time=Date.parse(status.expiresAt);assert.throws(()=>phase==='authorize'?f.authorize(f.session,status.plan):f.service.execute(f.session,permit),{code:'RUN_BUDGET_CLOSED'});
  }
  assert.equal(f.writes.length,0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');const stopped=await runner.resume();assert.equal(stopped.status,'STOPPED');assert.equal(f.session.workflowOwner,null);assert.equal(f.session.busy,null);assert.throws(()=>f.authorize(f.session,status.plan));assert.equal(f.writes.length,0);
 }finally{runner?.stop();await runner?.settle();await f.cleanup();}
});
test('expired runtime boundary never refunds an UNKNOWN child or authorizes a replacement batch',async()=>{
 let time=Date.now();const f=fixture({stock:100,apply:false,clock:()=>time});let release;
 try{
  release=f.service.claimWorkflow(f.session,'bounded-unknown',{limits:claims(80),expiresAt:new Date(time+10000).toISOString()});const planned=await f.plan(),executed=await f.execute(f.session,planned);assert.equal(executed.status.finalStatus,'UNKNOWN');assert.equal(f.writes.length,1);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);
  time+=10000;assert.throws(()=>f.authorize(f.session,planned));assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);assert.equal(f.service.workflowBudget('A').outcome,'UNKNOWN');assert.equal(f.writes.length,1);
 }finally{release?.();await f.cleanup();}
});
test('invalid or already-expired Workflow deadlines cannot acquire an account or replace its budget',async()=>{
 const f=fixture();try{for(const options of [{limits:claims(40),expiresAt:'invalid'},{limits:claims(40),expiresAt:new Date(0).toISOString()},{expiresAt:new Date(Date.now()+10000).toISOString()}]){assert.throws(()=>f.service.claimWorkflow(f.session,'invalid-boundary',options),{code:'INVALID_INPUT'});assert.equal(f.session.workflowOwner??null,null);assert.equal(f.session.busy,null);assert.equal(f.writes.length,0);}}finally{await f.cleanup();}
});

test('deadline while a child awaits verification retains ownership and UNKNOWN reservations until the existing execution settles',async()=>{
 let time=Date.now();const f=fixture({stock:100,apply:false,clock:()=>time});let runner,allowRead,entered;const blocked=new Promise(r=>allowRead=r),verifying=new Promise(r=>entered=r);
 try{
  const facts=await ordersModule.survey(f.session.client,protocol,{config,player:f.session.player}),candidate=ordersModule.view(facts,{config,rules,moduleConfig:{enabled:true},parameters:{}}).candidates[0];
  const graph={version:1,id:'inflight-boundary',name:'Bound existing execution',budget:claims(80),runPolicy:{maxDurationMs:10000,maxActions:1,modules:['orders']},nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'orders',selection:candidate.actionId},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'z'}]};
  runner=createWorkflowRunner({modules:CORE_OPERATION_MODULES,operations:f.service,clock:()=>time,getSession:()=>f.session,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options)});
  const status=await runner.start('A',graph);f.clients.get(f.session.client).beforeRead=async()=>{if(f.writes.length){entered();await blocked;}};
  const permit=f.authorize(f.session,status.plan);f.service.execute(f.session,permit);await Promise.race([verifying,f.service.settle('A').then(()=>{throw Error('Synthetic child finished before verification gate: '+JSON.stringify(f.service.status('A')));})]);time=Date.parse(status.expiresAt);const stopping=runner.resume();await new Promise(r=>setImmediate(r));assert.equal(runner.getStatus().status,'STOPPED');assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);assert.equal(f.session.workflowOwner,status.runId);await assert.rejects(runner.start('A',graph),{code:'WORKFLOW_BUSY'});
  allowRead();await stopping;await runner.settle();assert.equal(f.writes.length,1);assert.notEqual(f.service.status('A').finalStatus,'SUCCESS');assert.equal(f.session.workflowOwner,null);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);assert.throws(()=>f.authorize(f.session,status.plan));
 }finally{allowRead?.();runner?.stop();await runner?.settle();await f.cleanup();}
});

async function boundedServiceWorkflow({apply=true,limit=80,maxActions=2,onUpdate=()=>{},schedule,eventTrigger,beforeStart=async()=>{},...options}={}){
 const f=fixture({stock:1000,apply,...options}),store=createWorkflowStore({file:path.join(path.dirname(f.history.storagePath),'workflows.json'),modules:CORE_OPERATION_MODULES}),updates=[];
 const facts=await ordersModule.survey(f.session.client,protocol,{config,player:f.session.player}),rows=ordersModule.view(facts,{config,rules,moduleConfig:{enabled:true},parameters:{}}).candidates;
 const graph={version:1,id:'explicit-run-orders',name:'Explicit finite order strategy',budget:claims(limit),runPolicy:{maxDurationMs:10000,maxActions,modules:['orders'],...(schedule?{schedule}:{}),...(eventTrigger?{eventTrigger}:{})},nodes:[{id:'s',type:'START'},{id:'a1',type:'ACTION',module:'orders',parameters:{},selection:rows[0].actionId},{id:'v1',type:'VERIFY',module:'orders'},{id:'a2',type:'ACTION',module:'orders',parameters:{},selection:rows[1].actionId},{id:'v2',type:'VERIFY',module:'orders'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a1'},{from:'a1',to:'v1'},{from:'v1',to:'a2'},{from:'a2',to:'v2'},{from:'v2',to:'z'}]};
 await beforeStart(f,graph);
 const runner=createWorkflowRunner({operations:f.service,modules:CORE_OPERATION_MODULES,getSession:()=>f.session,clock:options.clock??Date.now,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.session,runId,opts),onUpdate:async state=>{updates.push(structuredClone(state));await onUpdate(state);store.record('A',state);}});
 const status=await runner.start('A',graph);return{...f,runner,workflowStore:store,updates,graph,status,payload:{offer:status.authorizationOffer,batchId:status.plan?.batchId??null,planHash:status.plan?.planHash??null,confirm:true},async cleanup(){runner.stop();await runner.settle();await f.cleanup();}};
}
for(const apply of [true,false])test('explicit finite run confirmation reuses original Service permits and authoritative history '+apply,async()=>{
 const f=await boundedServiceWorkflow({apply});try{
  assert.equal(f.status.status,'AWAITING_AUTHORIZATION');assert.equal(f.writes.length,0);assert.equal(f.status.runAuthorization,undefined);assert.deepEqual(f.status.authorizationOffer.graph,f.graph);assert.equal(f.status.authorizationOffer.executionContext.playerId,f.session.player.playerId);
  const result=await f.runner.authorizeRun(f.payload);assert.equal(result.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.writes.length,apply?2:1);assert.equal(f.session.workflowOwner,null);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(amount(f.service.workflowBudget('A').reserved.resources),apply?80:40);
  const approved=f.updates.find(row=>row.runAuthorization);assert.ok(approved);for(const write of f.writes){assert.deepEqual(write.durableBeforeWrite.authorizationSummary.workflowRunAuthorization,{runId:f.status.runId,graphHash:f.status.authorizationOffer.graphHash,approvedAt:approved.runAuthorization.approvedAt});}
  const saved=f.workflowStore.history('A',{runId:f.status.runId})[0];assert.deepEqual(saved.runAuthorization.scope,f.status.authorizationOffer);assert.equal(saved.resumable,false);await assert.rejects(Promise.resolve().then(()=>f.runner.authorizeRun(f.payload)));assert.equal(f.writes.length,apply?2:1);
 }finally{await f.cleanup();}
});
for(const options of [{limit:60},{maxActions:1}])test('finite run never expands its original resource or action cap '+JSON.stringify(options),async()=>{
 const f=await boundedServiceWorkflow(options);try{const result=await f.runner.authorizeRun(f.payload);assert.notEqual(result.status,'COMPLETED');assert.equal(f.writes.length,1);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);assert.equal(result.runAuthorization.resumable,false);}finally{await f.cleanup();}
});
test('wrong finite scope, identity, graph, deadline, budget or confirmation cannot mint an existing child permit',async()=>{
 const f=await boundedServiceWorkflow();try{
  for(const change of [p=>p.confirm=false,p=>delete p.offer,p=>p.extra=true,p=>p.offer.accountId='B',p=>p.offer.runId='other',p=>p.offer.executionContext.worldId=2,p=>p.offer.executionContext.connectionId='other',p=>p.offer.graph.nodes[1].selection='other',p=>p.offer.graph.budget=claims(800),p=>p.offer.graph.runPolicy.maxActions=20,p=>p.offer.expiresAt='2099-01-01T00:00:00Z',p=>p.planHash='wrong']){const payload=structuredClone(f.payload);change(payload);await assert.rejects(f.service.authorizeWorkflow(f.session,payload,()=>{}));assert.equal(f.writes.length,0);}
  assert.equal(f.runner.getStatus().status,'AWAITING_AUTHORIZATION');assert.equal((await f.runner.authorizeRun(f.payload)).status,'COMPLETED');assert.equal(f.writes.length,2);
 }finally{await f.cleanup();}
});
test('run authorization persistence failure creates zero writes and closes the original budget',async()=>{
 const f=await boundedServiceWorkflow({onUpdate:state=>{if(state.runAuthorization)throw Error('synthetic approval persistence failure');}});try{const result=await f.runner.authorizeRun(f.payload);assert.equal(result.status,'FAILED');assert.equal(f.writes.length,0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(f.workflowStore.history('A')[0].runAuthorization,undefined);assert.throws(()=>f.authorize(f.session,f.status.plan));}finally{await f.cleanup();}
});

for(const fault of ['stop','expiry','player','world','generation','connection','client','factContext','writer','module-config'])test('pending durable run approval becomes unusable after '+fault,async()=>{
 let time=Date.now(),release,entered;const blocked=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const f=await boundedServiceWorkflow({clock:()=>time,onUpdate:async state=>{if(state.runAuthorization&&!state.finishedAt){entered();await blocked;}}});let task;
 try{task=f.runner.authorizeRun(f.payload);await waiting;assert.equal(f.writes.length,0);
 const child={runId:f.status.runId,nodeId:'a1',batchId:f.status.plan.batchId,planHash:f.status.plan.planHash};assert.throws(()=>f.service.authorizeWorkflowPlan(f.session,child));
 switch(fault){case 'stop':f.runner.stop();break;case 'expiry':time=Date.parse(f.status.expiresAt);break;case 'player':f.session.player.playerId='other';break;case 'world':f.session.player.worldId=2;break;case 'generation':f.session.generation++;break;case 'connection':f.session.connectionId='other';break;case 'client':f.session.client=f.makeSession('B').client;break;case 'factContext':f.session.client.factContext={accountId:'B',generation:1,connectionId:'other'};break;case 'writer':f.setWriterAllowed(false);break;case 'module-config':f.moduleSettings.save('A','orders',{enabled:false});break;}
 release();const result=await task;assert.notEqual(result.status,'COMPLETED');assert.equal(f.writes.length,0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(amount(f.service.workflowBudget('A').reserved.resources),0);assert.throws(()=>f.service.authorizeWorkflowPlan(f.session,child));
 }finally{release();await task;await f.cleanup();}
});

test('run grant never permits an unapproved, foreign, duplicate or substituted child plan',async()=>{
 const f=await boundedServiceWorkflow();try{
 const child={runId:f.status.runId,nodeId:'a1',batchId:f.status.plan.batchId,planHash:f.status.plan.planHash};assert.throws(()=>f.service.authorizeWorkflowPlan(f.session,child));
 await f.service.authorizeWorkflow(f.session,f.payload,audit=>f.workflowStore.record('A',{...f.status,runAuthorization:audit}));
 for(const extra of [{runId:'foreign'},{nodeId:'a2'},{planHash:'wrong'},{batchId:'foreign'}])assert.throws(()=>f.service.authorizeWorkflowPlan(f.session,{...child,...extra}));
 for(const payload of [{module:'orders',mode:'Manual',selections:[f.graph.nodes[3].selection],parameters:{}},{module:'orders',mode:'Manual',selections:[f.graph.nodes[1].selection],parameters:{extra:true}},{module:'orders',mode:'Automatic',selections:[f.graph.nodes[1].selection],parameters:{}}])await assert.rejects(f.service.plan(f.session,payload,{workflowId:f.status.runId}));
 const permit=f.service.authorizeWorkflowPlan(f.session,child);assert.ok(permit.permitId);assert.throws(()=>f.service.authorizeWorkflowPlan(f.session,child));assert.equal(f.writes.length,0);
 f.runner.stop();await f.runner.settle();assert.throws(()=>f.service.execute(f.session,permit));assert.equal(f.writes.length,0);
 }finally{await f.cleanup();}
});

test('a changed business configuration after a dispatched child stops all subsequent run actions',async()=>{
 const f=await boundedServiceWorkflow();try{f.state().beforeWrite=()=>f.moduleSettings.save('A','orders',{enabled:false});const result=await f.runner.authorizeRun(f.payload);assert.notEqual(result.status,'COMPLETED');assert.equal(f.writes.length,1);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(f.history.list('A').length,1);await assert.rejects(Promise.resolve().then(()=>f.runner.authorizeRun(f.payload)));assert.equal(f.writes.length,1);}finally{await f.cleanup();}
});

for(const apply of [true,false])test('run authorization audit survives restart read-only and cannot restore Service permission '+apply,async()=>{
 const f=await boundedServiceWorkflow({apply});try{const result=await f.runner.authorizeRun(f.payload),file=path.join(path.dirname(f.history.storagePath),'workflows.json'),bytes=fs.readFileSync(file,'utf8');
 const store=createWorkflowStore({file,modules:CORE_OPERATION_MODULES}),saved=store.history('A',{runId:f.status.runId})[0];assert.deepEqual(saved.runAuthorization,result.runAuthorization);assert.equal(saved.status,apply?'COMPLETED':'UNKNOWN');assert.equal(saved.resumable,false);assert.equal(store.history('B').length,0);
 const restarted=createOperationService({protocol,getConfig:()=>config,loadRules:()=>({config:rules}),loadProduction:()=>({config:production}),history:createExecutionHistory({file:f.history.storagePath}),modules:CORE_OPERATION_MODULES,moduleSettings:f.moduleSettings});
 assert.equal(restarted.workflowAuthorizationOffer(f.session,f.status.runId),null);await assert.rejects(restarted.authorizeWorkflow(f.session,f.payload,()=>assert.fail('old approval must not persist')));assert.throws(()=>restarted.authorizeWorkflowPlan(f.session,{runId:f.status.runId,nodeId:'a1',batchId:f.status.plan.batchId,planHash:f.status.plan.planHash}));
 if(!apply){assert.throws(()=>restarted.claimWorkflow(f.session,'uncertain-connection',{limits:claims(80)}),{code:'RESPONSE_UNCERTAIN'});const fresh=f.makeSession();assert.throws(()=>restarted.claimWorkflow(fresh,'new-run',{limits:claims(80)}),{code:'RECOVERY_UNCERTAIN'});}
 assert.equal(f.writes.length,apply?2:1);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }finally{await f.cleanup();}
});

test('invalid or substituted persisted run authorization is rejected while original bytes remain intact',async()=>{
 const f=await boundedServiceWorkflow();try{const result=await f.runner.authorizeRun(f.payload),file=path.join(path.dirname(f.history.storagePath),'workflows.json'),bytes=fs.readFileSync(file,'utf8');
 for(const change of [r=>r.runAuthorization.resumable=true,r=>r.runAuthorization.scope.graphHash='0'.repeat(64),r=>r.runAuthorization.scope.executionContext.accountId='B',r=>r.runAuthorization.scope.executionContext.worldId=null,r=>r.runAuthorization.scope.expiresAt='2099-01-01T00:00:00Z',r=>r.runAuthorization.approvedAt=r.expiresAt,r=>delete r.runAuthorization.scope.dependencies.moduleConfigs.orders,r=>{r.workflowId='substituted';r.runAuthorization.scope.workflowId='substituted';},r=>{r.expiresAt=new Date(Date.parse(r.startedAt)+r.runPolicy.maxDurationMs+1).toISOString();r.runAuthorization.scope.expiresAt=r.expiresAt;},r=>r.runAuthorization.approvedAt=new Date(Date.parse(r.startedAt)-1).toISOString()]){
 const bad=structuredClone(result);change(bad);assert.throws(()=>f.workflowStore.record('A',bad));assert.equal(fs.readFileSync(file,'utf8'),bytes);
 const raw=JSON.parse(bytes);raw.accounts.A.history[0]=Object.fromEntries(Object.entries(bad).filter(([key])=>!['authorizationOffer','running','plan','lastRun'].includes(key)));fs.writeFileSync(file,JSON.stringify(raw));const damaged=fs.readFileSync(file,'utf8');const restarted=createWorkflowStore({file,modules:CORE_OPERATION_MODULES});assert.throws(()=>restarted.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.throws(()=>restarted.save('A',f.graph));assert.equal(fs.readFileSync(file,'utf8'),damaged);fs.writeFileSync(file,bytes);
 }
 }finally{await f.cleanup();}
});

test('a finite unique strategy must still have exactly one executable candidate in the plan fresh read',async()=>{
 const f=fixture({stock:1000});let release;try{
 f.state().raw.workerOrder=[order(0)];const view=await f.service.surveyModule(f.session,'orders'),selected=view.view.candidates[0].actionId;
 const graph={version:1,id:'unique-run',name:'Unique bounded order',budget:claims(40),runPolicy:{maxDurationMs:10000,maxActions:2,modules:['orders']},nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'orders',parameters:{},selection:{unique:true}},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'z'}]};
 release=f.service.claimWorkflow(f.session,'unique-run',{graph,limits:claims(40),expiresAt:new Date(Date.now()+9000).toISOString()});f.service.bindWorkflowNode(f.session,'unique-run',{workflowId:graph.id,nodeId:'a'});f.state().raw.workerOrder.push(order(1));
 await assert.rejects(f.service.plan(f.session,{module:'orders',mode:'Manual',parameters:{},selections:[selected]},{workflowId:'unique-run'}),{code:'STALE_PLAN'});assert.equal(f.writes.length,0);
 f.state().raw.workerOrder=[order(0)];const planned=await f.service.plan(f.session,{module:'orders',mode:'Manual',parameters:{},selections:[selected]},{workflowId:'unique-run'});assert.equal(planned.actions[0].actionId,selected);assert.equal(f.writes.length,0);
 }finally{release?.();await f.cleanup();}
});

test('finite graph and parent claims cannot authorize RUBY or inherit a different budget or deadline',async()=>{
 const f=fixture();try{
 const graph={version:1,id:'invalid-contract',name:'Invalid run',budget:claims(40),runPolicy:{maxDurationMs:1000,maxActions:0,modules:[]},nodes:[{id:'s',type:'START'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'z'}]};
 for(const opts of [{limits:claims(400),expiresAt:new Date(Date.now()+500).toISOString()},{limits:claims(40),expiresAt:new Date(Date.now()+5000).toISOString()},{limits:{resources:[{id:'RUBY',num:1}],quotas:[],uids:[]},expiresAt:new Date(Date.now()+500).toISOString(),graph:{...graph,budget:{resources:[{id:'RUBY',num:1}],quotas:[],uids:[]}}}])assert.throws(()=>f.service.claimWorkflow(f.session,'invalid-contract',{graph,...opts}));
 assert.equal(f.session.workflowOwner,null);assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);
 }finally{await f.cleanup();}
});

async function repeatingOrderWorkflow({limit=120,maxActions=3,maxRounds=3,roundIntervalMs=0,apply=true,onUpdate=()=>{},beforeStart=()=>{}}={}){
 const f=fixture({stock:1000,apply}),file=path.join(path.dirname(f.history.storagePath),'workflows.json'),store=createWorkflowStore({file,modules:CORE_OPERATION_MODULES});f.state().raw.workerOrder=[order(0)];f.state().beforeWrite=(_name,body)=>f.state().raw.workerOrder.push(order(body.index+1));
 const graph={version:1,id:'repeated-orders',name:'Finite new orders in existing run',budget:claims(limit),runPolicy:{maxDurationMs:10000,maxActions,modules:['orders'],maxRounds,roundIntervalMs},nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'orders',parameters:{}},{id:'a',type:'ACTION',module:'orders',parameters:{},selection:{unique:true}},{id:'v',type:'VERIFY',module:'orders'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]};
 const runner=createWorkflowRunner({modules:CORE_OPERATION_MODULES,operations:f.service,getSession:()=>f.session,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.session,runId,opts),onUpdate:async state=>{await onUpdate(state);store.record('A',state);}});beforeStart(f.session);const status=await runner.start('A',graph);
 return{...f,runner,graph,status,file,store,payload:{offer:status.authorizationOffer,batchId:status.plan.batchId,planHash:status.plan.planHash,confirm:true},async cleanup(){runner.stop();await runner.settle();await f.cleanup();}};
}
for(const options of [{},{limit:80},{maxActions:2},{apply:false}])test('finite repeated real Service orders preserve shared budget, unique plans and UNKNOWN '+JSON.stringify(options),async()=>{
 const f=await repeatingOrderWorkflow(options);try{
 assert.equal(f.status.round,1);assert.equal(f.writes.length,0);const result=await f.runner.authorizeRun(f.payload),expected=options.apply===false?1:options.limit===80||options.maxActions===2?2:3;assert.equal(f.writes.length,expected,JSON.stringify(result));assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40*expected);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(result.status,options.apply===false?'UNKNOWN':expected===3?'COMPLETED':options.maxActions===2?'STOPPED':'UNKNOWN');assert.equal(result.actionPlans,options.limit===80?3:expected);assert.equal(result.completedRounds,options.apply===false?0:expected);
 const operations=f.history.list('A').sort((a,b)=>a.workflowRound-b.workflowRound),recordCount=expected+(options.limit===80?1:0);assert.deepEqual(operations.map(row=>row.workflowRound),Array.from({length:recordCount},(_,i)=>i+1));assert.equal(new Set(operations.map(row=>row.planSummary.batchId)).size,recordCount);if(options.limit===80){assert.notEqual(operations.at(-1).finalStatus,'SUCCESS');assert.ok(operations.at(-1).actions.every(row=>row.dispatched!==true));}assert.deepEqual(f.writes.map(row=>row.body.index),Array.from({length:expected},(_,i)=>i));for(const row of operations)assert.equal(row.planSummary.workflowRound,row.workflowRound);
 const saved=f.store.history('A',{runId:f.status.runId})[0],detail=projectWorkflowExecutionHistory('A',saved,operations);assert.equal(detail.nodes.length,recordCount);assert.equal(detail.unlinkedOperationCount,0);assert.deepEqual(detail.nodes.map(row=>row.round),operations.map(row=>row.workflowRound));assert.ok(detail.nodes.every(row=>row.batches.length===1&&row.batches[0].runAuthorizationLink.status==='MATCHED'));assert.equal(detail.completedRounds,result.completedRounds);
 const wrong=structuredClone(operations);wrong[0].workflowRound=2;assert.ok(projectWorkflowExecutionHistory('A',saved,wrong).unlinkedOperationCount>=1);const bytes=fs.readFileSync(f.file,'utf8'),reopened=createWorkflowStore({file:f.file,modules:CORE_OPERATION_MODULES}).history('A')[0];assert.equal(reopened.round,result.round);assert.equal(reopened.resumable,false);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);await assert.rejects(Promise.resolve().then(()=>f.runner.authorizeRun(f.payload)));assert.equal(f.writes.length,expected);
 }finally{await f.cleanup();}
});

test('finite run round identity cannot be omitted, forged, or substituted in a child permission',async()=>{
 const f=await repeatingOrderWorkflow();try{
 for(const round of [undefined,0,4,'1'])assert.throws(()=>f.service.bindWorkflowNode(f.session,f.status.runId,{workflowId:f.graph.id,nodeId:'a',...(round===undefined?{}:{round})}));
 await f.service.authorizeWorkflow(f.session,f.payload,audit=>f.store.record('A',{...f.status,runAuthorization:audit}));const child={runId:f.status.runId,nodeId:'a',batchId:f.status.plan.batchId,planHash:f.status.plan.planHash};for(const round of [undefined,0,2,4,'1'])assert.throws(()=>f.service.authorizeWorkflowPlan(f.session,{...child,...(round===undefined?{}:{round})}));const permit=f.service.authorizeWorkflowPlan(f.session,{...child,round:1});f.runner.stop();await f.runner.settle();assert.throws(()=>f.service.execute(f.session,permit));assert.equal(f.writes.length,0);
 }finally{await f.cleanup();}
});

test('stopping a real authorized run in its round interval retains consumed resources and invalidates later rounds',async()=>{
 let entered;const waiting=new Promise(r=>entered=r),f=await repeatingOrderWorkflow({roundIntervalMs:60000,onUpdate:state=>{if(state.trace.at(-1)?.result==='ROUND_WAIT_STARTED')entered();}});let running;try{running=f.runner.authorizeRun(f.payload);await waiting;assert.equal(f.writes.length,1);assert.equal(f.runner.getStatus().round,1);assert.equal(f.runner.getStatus().completedRounds,1);assert.equal(f.session.workflowOwner,f.status.runId);f.runner.stop();const result=await running;assert.equal(result.status,'CANCELLED');assert.equal(f.writes.length,1);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(f.session.workflowOwner,null);await assert.rejects(f.service.authorizeWorkflow(f.session,f.payload,()=>{}));}finally{f.runner.stop();await running;await f.cleanup();}
});

test('finite repetition without complete role identity keeps original per-batch operation and exposes no run grant',async()=>{
 const f=await repeatingOrderWorkflow({maxRounds:2,maxActions:2,beforeStart:session=>delete session.player.worldId});try{let status=f.status;assert.equal(status.authorizationOffer,undefined);await assert.rejects(Promise.resolve().then(()=>f.runner.authorizeRun(f.payload)));assert.equal(f.writes.length,0);for(let round=1;round<=2;round++){assert.equal(status.round,round);assert.equal(status.status,'AWAITING_AUTHORIZATION');const permit=f.authorize(f.session,status.plan);f.service.execute(f.session,permit);await f.service.settle('A');status=await f.runner.resume();}assert.equal(status.status,'COMPLETED');assert.equal(status.completedRounds,2);assert.equal(f.writes.length,2);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),80);assert.equal(status.runAuthorization,undefined);}finally{await f.cleanup();}
});

for(const approval of [true,false])test('scheduled original Service waits without business requests and investigates fresh at the explicit time '+approval,async()=>{
 let time=Date.now();const at=time+80,schedule={kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'},f=await boundedServiceWorkflow({clock:()=>time,schedule});
 try{assert.equal(f.status.status,'WAITING');const count=f.reads.length;assert.equal(f.writes.length,0);assert.equal(f.status.plan,null);await assert.rejects(f.service.plan(f.session,{module:'orders',mode:'Manual',selections:[f.graph.nodes[1].selection],parameters:{}},{workflowId:f.status.runId}),{code:'SCHEDULE_NOT_DUE'});assert.equal(f.reads.length,count);
 if(approval){const accepted=await f.runner.authorizeRun(f.payload);assert.equal(accepted.status,'WAITING');assert.equal(f.reads.length,count);assert.equal(f.writes.length,0);assert.deepEqual(accepted.runAuthorization.scope.graph.runPolicy.schedule,schedule);}
 time=at;const result=await f.runner.settle();assert.equal(result.status,approval?'COMPLETED':'AWAITING_AUTHORIZATION');assert.equal(result.trigger.state,'FIRED');assert.equal(f.writes.length,approval?2:0);assert.ok(f.reads.length>count);
 const saved=f.workflowStore.history('A')[0],records=f.history.list('A'),projection=projectWorkflowExecutionHistory('A',saved,records);if(approval){assert.ok(records.every(row=>Date.parse(row.startedAt)>=at));assert.ok(projection.nodes.flatMap(row=>row.batches).every(row=>row.runAuthorizationLink.status==='MATCHED'));
 for(const mutate of [r=>r.startedAt=new Date(at-1).toISOString(),r=>r.authorizationSummary.approvedAt=new Date(at-1).toISOString()]){const changed=structuredClone(records[0]);mutate(changed);const link=projectWorkflowExecutionHistory('A',saved,[changed]).nodes.flatMap(row=>row.batches)[0];assert.equal(link.runAuthorizationLink.status,'CONFLICT');assert.equal(link.finalStatus,records[0].finalStatus);}
 const noTrigger=structuredClone(saved);delete noTrigger.trigger;assert.equal(projectWorkflowExecutionHistory('A',noTrigger,[records[0]]).nodes.flatMap(row=>row.batches)[0].runAuthorizationLink.status,'MISSING');const lateTrigger=structuredClone(saved);lateTrigger.trigger.firedAt=new Date(Date.parse(records[0].authorizationSummary.approvedAt)+1).toISOString();assert.equal(projectWorkflowExecutionHistory('A',lateTrigger,[records[0]]).nodes.flatMap(row=>row.batches)[0].runAuthorizationLink.status,'CONFLICT');}
 const file=path.join(path.dirname(f.history.storagePath),'workflows.json'),bytes=fs.readFileSync(file,'utf8'),reopened=createWorkflowStore({file,modules:CORE_OPERATION_MODULES});assert.equal(reopened.history('A')[0].resumable,false);assert.deepEqual(reopened.history('B'),[]);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }finally{await f.cleanup();}
});

test('scheduled run rejects altered scope, date, zone, budget and non-null batch before approval',async()=>{
 let time=Date.now();const f=await boundedServiceWorkflow({clock:()=>time,schedule:{kind:'ONCE',at:new Date(time+500).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'}});
 try{for(const mutate of [p=>p.confirm=false,p=>p.batchId='forged',p=>p.planHash='forged',p=>p.extra=true,p=>p.offer.accountId='B',p=>p.offer.graph.runPolicy.schedule.at=new Date(time+501).toISOString(),p=>p.offer.graph.runPolicy.schedule.timeZone='UTC',p=>p.offer.graph.budget=claims(800),p=>p.offer.executionContext.worldId=2]){const payload=structuredClone(f.payload);mutate(payload);await assert.rejects(f.service.authorizeWorkflow(f.session,payload,()=>{}));assert.equal(f.writes.length,0);}assert.equal(f.runner.getStatus().status,'WAITING');}finally{await f.cleanup();}
});

for(const fault of ['stop','expiry','player','world','generation','connection','client','writer','module-config','persistence'])test('pending scheduled grant cannot dispatch or release ownership early after '+fault,async()=>{
 let time=Date.now(),release,entered;const at=time+80,blocked=new Promise(r=>release=r),waiting=new Promise(r=>entered=r),f=await boundedServiceWorkflow({clock:()=>time,schedule:{kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'},onUpdate:async state=>{if(state.runAuthorization&&!state.finishedAt){entered();await blocked;if(fault==='persistence')throw Error('synthetic delayed schedule persistence failure');}}});let approval;
 try{const count=f.reads.length;approval=f.runner.authorizeRun(f.payload);await waiting;time=at;
 switch(fault){case 'stop':f.runner.stop();break;case 'expiry':time=Date.parse(f.status.expiresAt);break;case 'player':f.session.player.playerId='other';break;case 'world':f.session.player.worldId=2;break;case 'generation':f.session.generation++;break;case 'connection':f.session.connectionId='other';break;case 'client':f.session.client=f.makeSession('B').client;break;case 'writer':f.setWriterAllowed(false);break;case 'module-config':f.moduleSettings.save('A','orders',{enabled:false});break;}
 await new Promise(r=>setTimeout(r,100));assert.equal(f.writes.length,0);assert.equal(f.reads.length,count);assert.equal(f.session.workflowOwner,f.status.runId);if(fault==='stop'||fault==='expiry')assert.equal(f.service.workflowBudget('A').state,'CLOSED');release();await approval;const result=await f.runner.settle();assert.notEqual(result.status,'COMPLETED');assert.notEqual(result.status,'WAITING');assert.equal(f.writes.length,0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(amount(f.service.workflowBudget('A').reserved.resources),0);assert.ok(f.workflowStore.history('A')[0].finishedAt);assert.equal(f.workflowStore.history('A')[0].resumable,false);await assert.rejects(f.service.authorizeWorkflow(f.session,f.payload,()=>{}));
 }finally{release();await approval;await f.cleanup();}
});

test('an armed trigger waits for approval persistence crossing its time before obtaining any original child permit',async()=>{
 let time=Date.now(),release,entered;const at=time+80,blocked=new Promise(r=>release=r),waiting=new Promise(r=>entered=r),f=await boundedServiceWorkflow({clock:()=>time,schedule:{kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'},onUpdate:async state=>{if(state.runAuthorization&&!state.finishedAt&&state.trigger.state==='WAITING'){entered();await blocked;}}});let approval;
 try{const count=f.reads.length;approval=f.runner.authorizeRun(f.payload);await waiting;time=at;await new Promise(r=>setTimeout(r,100));assert.equal(f.reads.length,count);assert.equal(f.writes.length,0);release();await approval;assert.equal((await f.runner.settle()).status,'COMPLETED');assert.equal(f.writes.length,2);assert.equal(f.workflowStore.history('A')[0].trigger.state,'FIRED');}finally{release();await approval;await f.cleanup();}
});

test('scheduled UNKNOWN retains its original parent reservation and never proceeds to the next business node',async()=>{
 let time=Date.now();const at=time+50,f=await boundedServiceWorkflow({apply:false,clock:()=>time,schedule:{kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'}});
 try{await f.runner.authorizeRun(f.payload);time=at;const result=await f.runner.settle();assert.equal(result.status,'UNKNOWN');assert.equal(f.writes.length,1);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),40);assert.equal(f.service.workflowBudget('A').state,'CLOSED');await assert.rejects(f.service.authorizeWorkflow(f.session,f.payload,()=>{}));assert.equal(f.writes.length,1);}finally{await f.cleanup();}
});

test('a stale standalone plan neither prevents an explicit scheduled scope nor grants permission during its wait',async()=>{
 let time=Date.now(),oldPermit;const at=time+50,f=await boundedServiceWorkflow({clock:()=>time,schedule:{kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'},beforeStart:async fixture=>{oldPermit=fixture.authorize(fixture.session,await fixture.plan());}});
 try{assert.throws(()=>f.service.execute(f.session,oldPermit));assert.equal(f.writes.length,0);assert.equal((await f.runner.authorizeRun(f.payload)).status,'WAITING');time=at;assert.equal((await f.runner.settle()).status,'COMPLETED');assert.equal(f.writes.length,2);}finally{await f.cleanup();}
});

const serviceCalendar=(kind='DAILY')=>({kind,localTime:'00:00:00.000',timeZone:'Asia/Shanghai',missedPolicy:'SKIP',...(kind==='WEEKLY'?{weekDay:7}:{})});
for(const kind of ['DAILY','WEEKLY'])for(const apply of [true,false])test('calendar '+kind+' binds a concrete occurrence to original Service authorization, independent effects and UNKNOWN '+apply,async()=>{
 let time=Date.parse('2026-11-14T15:59:59.950Z');const at=time+50,f=await boundedServiceWorkflow({apply,clock:()=>time,schedule:serviceCalendar(kind)});try{
 const count=f.reads.length;assert.equal(f.status.trigger.scheduledAt,new Date(at).toISOString());assert.equal(f.payload.offer.scheduledAt,f.status.trigger.scheduledAt);assert.equal(f.payload.offer.graph.runPolicy.maxDurationMs,10000);for(const mutate of [p=>delete p.offer.scheduledAt,p=>p.offer.scheduledAt=new Date(at+1).toISOString(),p=>p.offer.graph.runPolicy.schedule.localTime='00:00:00.001',p=>p.offer.graph.runPolicy.schedule.kind='ONCE',p=>p.offer.executionContext.worldId=2]){const payload=structuredClone(f.payload);mutate(payload);await assert.rejects(f.service.authorizeWorkflow(f.session,payload,()=>{}));assert.equal(f.writes.length,0);}
 const accepted=await f.runner.authorizeRun(f.payload);assert.equal(accepted.status,'WAITING');assert.equal(f.reads.length,count);assert.equal(f.writes.length,0);time=at;const result=await f.runner.settle();assert.equal(result.status,apply?'COMPLETED':'UNKNOWN');assert.equal(f.writes.length,apply?2:1);assert.equal(result.trigger.scheduledAt,new Date(at).toISOString());assert.equal(amount(f.service.workflowBudget('A').reserved.resources),apply?80:40);assert.equal(f.service.workflowBudget('A').state,'CLOSED');const saved=f.workflowStore.history('A')[0],projected=projectWorkflowExecutionHistory('A',saved,f.history.list('A'));assert.ok(projected.nodes.flatMap(n=>n.batches).every(b=>b.runAuthorizationLink.status==='MATCHED'));assert.equal(projected.runAuthorization.scope.scheduledAt,result.trigger.scheduledAt);assert.equal(projected.resumable,false);
 const file=path.join(path.dirname(f.history.storagePath),'workflows.json'),bytes=fs.readFileSync(file,'utf8');for(const change of [r=>r.runAuthorization.scope.scheduledAt=new Date(at+1).toISOString(),r=>r.trigger.worldId='2',r=>r.trigger.scheduledAt=new Date(at+1).toISOString()]){const bad=structuredClone(saved);change(bad);assert.throws(()=>f.workflowStore.record('A',bad));assert.equal(fs.readFileSync(file,'utf8'),bytes);}assert.equal(createWorkflowStore({file,modules:CORE_OPERATION_MODULES}).history('A')[0].resumable,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }finally{await f.cleanup();}
});

for(const fault of ['stop','expiry','world','persistence'])test('pending calendar approval cannot become active after '+fault,async()=>{
 let time=Date.parse('2026-11-14T15:59:59.950Z'),release,entered;const at=time+50,blocked=new Promise(r=>release=r),waiting=new Promise(r=>entered=r),f=await boundedServiceWorkflow({clock:()=>time,schedule:serviceCalendar(),onUpdate:async state=>{if(state.runAuthorization&&!state.finishedAt){entered();await blocked;if(fault==='persistence')throw Error('synthetic calendar persistence failure');}}});let pending;
 try{const count=f.reads.length;pending=f.runner.authorizeRun(f.payload);await waiting;time=at;if(fault==='stop')f.runner.stop();if(fault==='expiry')time=Date.parse(f.status.expiresAt);if(fault==='world')f.session.player.worldId=2;await new Promise(r=>setTimeout(r,70));assert.equal(f.writes.length,0);assert.equal(f.reads.length,count);assert.equal(f.session.workflowOwner,f.status.runId);release();await pending;const result=await f.runner.settle();assert.ok(['CANCELLED','STOPPED','FAILED'].includes(result.status));assert.equal(f.writes.length,0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(amount(f.service.workflowBudget('A').reserved.resources),0);}finally{release();await pending;await f.cleanup();}
});

test('a consumed calendar occurrence stays consumed after clock rollback and a new Runner over the original Service',async()=>{
 let time=Date.parse('2026-11-14T15:59:59.950Z');const start=time,f=await boundedServiceWorkflow({clock:()=>time,schedule:serviceCalendar()});try{await f.runner.authorizeRun(f.payload);time+=50;assert.equal((await f.runner.settle()).status,'COMPLETED');const sent=f.writes.length;time=start;const runner=createWorkflowRunner({operations:f.service,modules:CORE_OPERATION_MODULES,getSession:()=>f.session,clock:()=>time,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.session,runId,opts),onUpdate:state=>f.workflowStore.record('A',state)});await assert.rejects(runner.start('A',f.graph),{code:'WORKFLOW_TRIGGER_CONSUMED'});assert.equal(runner.getStatus().status,'FAILED');assert.equal(f.writes.length,sent);assert.equal(f.session.workflowOwner,null);assert.equal(f.service.workflowBudget('A').state,'CLOSED');}finally{await f.cleanup();}
});

const vipEventProtocol=loadProtocol(),vipEventCodec=createCodec(vipEventProtocol);
async function eventServiceWorkflow({level=3,initialLevel=1,beforeEventStart=()=>{},...options}={}){
 let live;const f=await boundedServiceWorkflow({...options,eventTrigger:{kind:'VIP_LEVEL_CHANGED',level},beforeStart:async fixture=>{
 const old=fixture.session.client,state=fixture.state();let socket;class Socket{constructor(){this.readyState=0;socket=this;this.sent=[];}send(bytes){this.sent.push(vipEventCodec.decode(bytes));}close(){this.readyState=3;}receive(name,body,seq=0){this.onmessage?.({data:vipEventCodec.encode(name,seq,body)});}}
 const client=new GameClient({url:'wss://example.invalid',protocol:vipEventProtocol,accountId:'A',generation:fixture.session.generation,WebSocketImpl:Socket});client.factContext={accountId:'A',generation:fixture.session.generation,connectionId:fixture.session.connectionId};client.on('error',()=>{});const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:'17',worldId:'1',vip:{vipLevel:initialLevel,vipExp:'0'}}});await pending;clearInterval(client.tickTimer);client.tickTimer=null;client.request=old.request.bind(old);client.uncertainWrites=old.uncertainWrites;client.markUnverifiedWrite=old.markUnverifiedWrite.bind(old);client.confirmWatchedWrite=old.confirmWatchedWrite.bind(old);fixture.clients.set(client,state);fixture.session.client=client;fixture.session.player={playerId:'17',worldId:1,level:5};live={client,socket};await beforeEventStart(fixture,live);
 }});return {...f,...live,async cleanup(){await f.cleanup();live.client.stop();}};
}

for(const apply of [true,false])test('a trusted changed VIP event fires one original Service workflow, never granting eligibility or bypassing UNKNOWN '+apply,async()=>{
 const f=await eventServiceWorkflow({apply});try{
 const count=f.reads.length,baseline=f.status.eventTrigger.baseline;assert.equal(f.status.status,'WAITING');assert.equal(f.status.eventTrigger.state,'WAITING');assert.deepEqual(f.payload.offer.eventCursor,baseline);assert.equal(f.status.plan,null);await assert.rejects(f.service.plan(f.session,{module:'orders',mode:'Manual',selections:[f.graph.nodes[1].selection],parameters:{}},{workflowId:f.status.runId}),{code:'WORKFLOW_EVENT_PENDING'});assert.equal(f.reads.length,count);
 for(const mutate of [p=>delete p.offer.eventCursor,p=>p.offer.eventCursor.cursor++,p=>p.offer.eventCursor.streamId='a'.repeat(36),p=>p.offer.graph.runPolicy.eventTrigger.level=4,p=>p.offer.executionContext.worldId=2,p=>p.batchId='forged']){const payload=structuredClone(f.payload);mutate(payload);await assert.rejects(f.service.authorizeWorkflow(f.session,payload,()=>{}));}
 assert.equal((await f.runner.authorizeRun(f.payload)).status,'WAITING');assert.equal(f.reads.length,count);assert.equal(f.writes.length,0);f.socket.receive('SCVipUpdate',{vipLevel:2},1);f.client.emit('message',{name:'SCVipUpdate',seq:2,body:{vipLevel:3}});await new Promise(r=>setImmediate(r));assert.equal(f.runner.getStatus().status,'WAITING');assert.equal(f.writes.length,0);f.socket.receive('SCVipUpdate',{vipLevel:3},2);const result=await f.runner.settle();assert.equal(result.status,apply?'COMPLETED':'UNKNOWN',JSON.stringify(result));assert.equal(result.eventTrigger.state,'FIRED');assert.equal(result.eventTrigger.event.cursor,2);assert.equal(result.eventTrigger.event.previousLevel,2);assert.equal(f.writes.length,apply?2:1);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),apply?80:40);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(f.client.listenerCount('message'),0);const saved=f.workflowStore.history('A')[0],projection=projectWorkflowExecutionHistory('A',saved,f.history.list('A'));assert.equal(projection.eventTrigger.event.eventId,result.eventTrigger.event.eventId);assert.ok(projection.nodes.flatMap(n=>n.batches).every(b=>b.runAuthorizationLink.status==='MATCHED'));assert.equal(projection.resumable,false);f.socket.receive('SCVipUpdate',{vipLevel:3},2);await assert.rejects(Promise.resolve().then(()=>f.runner.authorizeRun(f.payload)));assert.equal(f.writes.length,apply?2:1);
 }finally{await f.cleanup();}
});

test('event without run approval only creates a fresh original manual plan and repeated or unchanged updates do not trigger it',async()=>{
 const f=await eventServiceWorkflow({initialLevel:3});try{const count=f.reads.length;f.socket.receive('SCVipUpdate',{vipLevel:3},1);f.socket.receive('SCVipUpdate',{vipLevel:3},1);await new Promise(r=>setImmediate(r));assert.equal(f.runner.getStatus().status,'WAITING');assert.equal(f.reads.length,count);assert.equal(f.writes.length,0);f.socket.receive('SCVipUpdate',{vipLevel:2},2);f.socket.receive('SCVipUpdate',{vipLevel:3},3);const status=await f.runner.settle();assert.equal(status.status,'AWAITING_AUTHORIZATION');assert.equal(status.eventTrigger.event.cursor,3);assert.equal(f.writes.length,0);assert.ok(status.plan.batchId);assert.equal(f.client.listenerCount('message'),0);}finally{await f.cleanup();}
});

for(const fault of ['stop','expiry','world','connection','gap','persistence'])test('pending durable event approval cannot dispatch after '+fault,async()=>{
 let time=Date.now(),release,entered;const blocked=new Promise(r=>release=r),waiting=new Promise(r=>entered=r),f=await eventServiceWorkflow({clock:()=>time,onUpdate:async state=>{if(state.runAuthorization&&!state.finishedAt){entered();await blocked;if(fault==='persistence')throw Error('synthetic event approval persistence failure');}}});let approval;
 try{const count=f.reads.length;approval=f.runner.authorizeRun(f.payload);await waiting;f.socket.receive('SCVipUpdate',{vipLevel:3},1);if(fault==='stop')f.runner.stop();if(fault==='expiry')time=Date.parse(f.status.expiresAt);if(fault==='world')f.session.player.worldId=2;if(fault==='connection')f.session.connectionId='changed';if(fault==='gap')f.socket.receive('SCVipUpdate',{vipLevel:4},3);await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,0);assert.equal(f.reads.length,count);assert.equal(f.session.workflowOwner,f.status.runId);release();await approval;const result=await f.runner.settle();assert.ok(['CANCELLED','FAILED','STOPPED','UNKNOWN'].includes(result.status),result.status);assert.equal(f.writes.length,0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(f.client.listenerCount('message'),0);}finally{release();await approval;await f.cleanup();}
});

test('failure persisting a fired event obtains no shared Service activation or child permit',async()=>{
 const f=await eventServiceWorkflow({onUpdate:state=>{if(state.eventTrigger?.state==='FIRED'&&!state.finishedAt)throw Error('synthetic fired event history failure');}});try{await f.runner.authorizeRun(f.payload);f.socket.receive('SCVipUpdate',{vipLevel:3},1);const result=await f.runner.settle();assert.equal(result.status,'FAILED');assert.equal(f.writes.length,0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(f.client.listenerCount('message'),0);}finally{await f.cleanup();}
});

test('an event arriving during pending approval waits for durable authorization and freezes the first matching cursor',async()=>{
 let release,entered;const blocked=new Promise(r=>release=r),waiting=new Promise(r=>entered=r),f=await eventServiceWorkflow({onUpdate:async state=>{if(state.runAuthorization&&!state.finishedAt&&state.eventTrigger.state==='WAITING'){entered();await blocked;}}});let approval;
 try{const count=f.reads.length;approval=f.runner.authorizeRun(f.payload);await waiting;f.socket.receive('SCVipUpdate',{vipLevel:3},1);f.socket.receive('SCVipUpdate',{vipLevel:2},2);f.socket.receive('SCVipUpdate',{vipLevel:3},3);await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,0);assert.equal(f.reads.length,count);release();await approval;const result=await f.runner.settle();assert.equal(result.status,'COMPLETED');assert.equal(result.eventTrigger.event.cursor,1);assert.equal(result.eventTrigger.event.seq,1);assert.equal(f.writes.length,2);}finally{release();await approval;await f.cleanup();}
});
for(const phase of ['STARTING','WAITING'])test('a trusted event captured during '+phase+' persistence never dispatches before the original armed record',async()=>{
 let captured=false,live;const f=await eventServiceWorkflow({beforeEventStart:(_f,value)=>live=value,onUpdate:state=>{if(!captured&&state.status===phase){captured=true;live.socket.receive('SCVipUpdate',{vipLevel:3},1);}}});try{const result=await f.runner.settle();assert.equal(captured,true);assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(result.eventTrigger.event.cursor,1);assert.equal(f.writes.length,0);assert.ok(result.plan.batchId);}finally{await f.cleanup();}
});
test('lost event source and evicted queued evidence stop UNKNOWN without business reads or writes',async()=>{
 for(const fault of ['gap','eviction']){let release,entered;const blocked=new Promise(r=>release=r),waiting=new Promise(r=>entered=r),f=await eventServiceWorkflow({onUpdate:async state=>{if(state.runAuthorization&&!state.finishedAt&&state.eventTrigger.state==='WAITING'){entered();await blocked;}}});let approval;try{const count=f.reads.length;if(fault==='eviction'){approval=f.runner.authorizeRun(f.payload);await waiting;f.socket.receive('SCVipUpdate',{vipLevel:3},1);for(let seq=2;seq<=202;seq++)f.socket.receive('SCVipUpdate',{vipLevel:2},seq);}else{f.socket.receive('SCVipUpdate',{vipLevel:2},1);f.socket.receive('SCVipUpdate',{vipLevel:3},3);}release();await approval;const result=await f.runner.settle();assert.equal(result.status,'UNKNOWN');assert.equal(f.writes.length,0);assert.equal(f.reads.length,count);assert.equal(f.client.listenerCount('message'),0);}finally{release();await approval;await f.cleanup();}}
});
test('the original Store preserves event scope across read-only restart and rejects tampered or duplicate consumption',async()=>{
 const f=await eventServiceWorkflow();try{await f.runner.authorizeRun(f.payload);const file=path.join(path.dirname(f.history.storagePath),'workflows.json');let bytes=fs.readFileSync(file,'utf8'),recovered=createWorkflowStore({file,modules:CORE_OPERATION_MODULES});assert.equal(recovered.history('A')[0].status,'RECOVERED_STOPPED');assert.deepEqual(recovered.history('A')[0].eventTrigger.baseline,f.payload.offer.eventCursor);assert.equal(recovered.history('A')[0].resumable,false);assert.deepEqual(recovered.history('B'),[]);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(f.writes.length,0);
 const forged={eventId:'forged',cursor:1};assert.throws(()=>f.service.activateWorkflowEvent(f.session,f.status.runId,forged));assert.equal(f.writes.length,0);f.socket.receive('SCVipUpdate',{vipLevel:3},1);assert.equal((await f.runner.settle()).status,'COMPLETED');const saved=f.workflowStore.history('A')[0];bytes=fs.readFileSync(file,'utf8');for(const change of [r=>r.eventTrigger.event.eventId='forged',r=>r.eventTrigger.event.cursor=0,r=>r.eventTrigger.baseline.playerId='18',r=>r.runAuthorization.scope.eventCursor.cursor++,r=>r.eventTrigger.event.vipLevel=4,r=>r.eventTrigger.observedAt=null,r=>r.eventTrigger.event.extra='injected']){const bad=structuredClone(saved);change(bad);assert.throws(()=>f.workflowStore.record('A',bad));assert.equal(fs.readFileSync(file,'utf8'),bytes);}const duplicate=structuredClone(saved);duplicate.runId='another-run';duplicate.runAuthorization.scope.runId=duplicate.runId;assert.throws(()=>f.workflowStore.record('A',duplicate),{code:'WORKFLOW_TRIGGER_CONSUMED'});assert.equal(fs.readFileSync(file,'utf8'),bytes);recovered=createWorkflowStore({file,modules:CORE_OPERATION_MODULES});assert.equal(recovered.history('A')[0].eventTrigger.event.eventId,saved.eventTrigger.event.eventId);assert.equal(recovered.history('A')[0].resumable,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }finally{await f.cleanup();}
});
test('cancelled event listeners cannot trigger a replacement run or inherit its previous scope grant',async()=>{
 const f=await eventServiceWorkflow();try{await f.runner.authorizeRun(f.payload);f.runner.stop();assert.equal((await f.runner.settle()).status,'CANCELLED');f.socket.receive('SCVipUpdate',{vipLevel:3},1);const second=await f.runner.start('A',f.graph);assert.equal(second.status,'WAITING');assert.equal(second.eventTrigger.baseline.cursor,1);assert.equal(Object.hasOwn(second,'runAuthorization'),false);await assert.rejects(Promise.resolve().then(()=>f.runner.authorizeRun(f.payload)));assert.equal(f.writes.length,0);f.socket.receive('SCVipUpdate',{vipLevel:3},2);await new Promise(r=>setImmediate(r));assert.equal(f.runner.getStatus().status,'WAITING');f.socket.receive('SCVipUpdate',{vipLevel:2},3);f.socket.receive('SCVipUpdate',{vipLevel:3},4);const result=await f.runner.settle();assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(result.eventTrigger.event.cursor,4);assert.equal(f.writes.length,0);assert.equal(f.client.listenerCount('message'),0);}finally{await f.cleanup();}
});

for(const boundary of ['survey','plan-persistence','approval-persistence','settlement'])test('loss of attested event source during '+boundary+' remains UNKNOWN and never advances another action',async()=>{
 let live,broken=false;const breakSource=()=>{if(!broken){broken=true;live.socket.receive('SCVipUpdate',{vipLevel:4},3);}},f=await eventServiceWorkflow({beforeEventStart:(_fixture,value)=>live=value,onUpdate:state=>{if(boundary==='plan-persistence'&&state.status==='AWAITING_AUTHORIZATION')breakSource();if(boundary==='approval-persistence'&&state.runAuthorization&&!state.finishedAt)breakSource();}});
 try{if(boundary==='survey')f.state().beforeRead=()=>breakSource();if(boundary==='settlement')f.state().beforeWrite=()=>breakSource();let result;
 if(boundary==='approval-persistence'){f.socket.receive('SCVipUpdate',{vipLevel:3},1);const pending=await f.runner.settle();assert.equal(pending.status,'AWAITING_AUTHORIZATION');result=await f.runner.authorizeRun({offer:pending.authorizationOffer,batchId:pending.plan.batchId,planHash:pending.plan.planHash,confirm:true});}else{await f.runner.authorizeRun(f.payload);f.socket.receive('SCVipUpdate',{vipLevel:3},1);result=await f.runner.settle();}
 assert.equal(broken,true);assert.equal(result.status,'UNKNOWN');assert.equal(f.writes.length,boundary==='settlement'?1:0);assert.equal(amount(f.service.workflowBudget('A').reserved.resources),boundary==='settlement'?40:0);assert.equal(f.service.workflowBudget('A').state,'CLOSED');assert.equal(f.workflowStore.history('A')[0].status,'UNKNOWN');assert.equal(f.client.listenerCount('message'),0);const sent=f.writes.length;await assert.rejects(f.runner.resume());assert.equal(f.writes.length,sent);
 }finally{await f.cleanup();}
});
