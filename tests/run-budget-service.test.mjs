import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { createWorkflowRunner, createWorkflowStore } from '../src/workflow.mjs';
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

async function boundedServiceWorkflow({apply=true,limit=80,maxActions=2,onUpdate=()=>{},...options}={}){
 const f=fixture({stock:1000,apply,...options}),store=createWorkflowStore({file:path.join(path.dirname(f.history.storagePath),'workflows.json'),modules:CORE_OPERATION_MODULES}),updates=[];
 const facts=await ordersModule.survey(f.session.client,protocol,{config,player:f.session.player}),rows=ordersModule.view(facts,{config,rules,moduleConfig:{enabled:true},parameters:{}}).candidates;
 const graph={version:1,id:'explicit-run-orders',name:'Explicit finite order strategy',budget:claims(limit),runPolicy:{maxDurationMs:10000,maxActions,modules:['orders']},nodes:[{id:'s',type:'START'},{id:'a1',type:'ACTION',module:'orders',parameters:{},selection:rows[0].actionId},{id:'v1',type:'VERIFY',module:'orders'},{id:'a2',type:'ACTION',module:'orders',parameters:{},selection:rows[1].actionId},{id:'v2',type:'VERIFY',module:'orders'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a1'},{from:'a1',to:'v1'},{from:'v1',to:'a2'},{from:'a2',to:'v2'},{from:'v2',to:'z'}]};
 const runner=createWorkflowRunner({operations:f.service,modules:CORE_OPERATION_MODULES,getSession:()=>f.session,clock:options.clock??Date.now,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.session,runId,opts),onUpdate:async state=>{updates.push(structuredClone(state));await onUpdate(state);store.record('A',state);}});
 const status=await runner.start('A',graph);return{...f,runner,workflowStore:store,updates,graph,status,payload:{offer:status.authorizationOffer,batchId:status.plan.batchId,planHash:status.plan.planHash,confirm:true},async cleanup(){runner.stop();await runner.settle();await f.cleanup();}};
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
