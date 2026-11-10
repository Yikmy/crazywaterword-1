import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameClient } from '../src/client.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { createWorkflowRunner } from '../src/workflow.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';

// Every fact, wire frame and response is synthetic. No connect(), account file,
// protocol asset or default persistence path is used by this integration fixture.
const codec = { encode: (name, seq, body = {}) => Buffer.from(JSON.stringify({ name, seq, body })), decode: bytes => JSON.parse(Buffer.from(bytes).toString()) };
const protocol = Object.fromEntries(['AllItemRequest','AllItemResponse','AllResourceRequest','AllResourceResponse','SaveFormationRequest','SaveFormationResponse','RepairFleetRequest','BuyFixtureRequest','UnknownFixtureRequest'].map(name => [name, {}]));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture({ watch = false, acknowledge = true, mutate = true, verify = true, costs = [{ id: 'wood', num: 40 }], costSource = 'synthetic authoritative configuration', timeout = 100, historyFile, unsafePlanner = false } = {}) {
  const dir = historyFile ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'cw-gameplay-execution-'));
  const file = historyFile ?? path.join(dir, 'history.json'), clients = [], calls = [];
  let gameConfig = { version: 1 }, moduleConfig = { enabled: true, revision: 1 }, rules = { version: 1, enabled: true, rules: [] }, production = { version: 1, enabled: false };
  const adapter = { id: 'fixture', defaultConfig: { enabled: false },
    async survey(client, _wire, options) {
      const state = client.synthetic; state.surveys++; calls.push({ account: state.id, phase: 'survey', number: state.surveys });
      await state.onSurvey?.(state.surveys, options);
      return { stockReliable: state.reliable, stock: new Map(state.stock), state: structuredClone(state.rows) };
    },
    view(facts) { return { candidates: Object.values(facts.state).map(row => operation(row)) }; },
    plan(facts, { selections = [], ledger }) {
      const actions = [];
      for (const id of selections) { const row = facts.state[id]; if (!row) continue; const op = operation(row); if (unsafePlanner || ledger.reserve(op.costs)) actions.push(op); }
      return { actions };
    },
    verify(op, before, after) {
      return { confirmed: verify && after.state[op.actionId]?.revision === before.state[op.actionId]?.revision + 1, reason: 'synthetic authoritative revision re-read', afterState: after.state[op.actionId] };
    },
  };
  function operation(row) { return { actionId: row.id, actionType: 'SYNTHETIC_UPDATE', target: { id: row.id }, identity: { id: row.id, revision: row.revision }, beforeState: { revision: row.revision }, expectedState: { revision: row.revision + 1 }, costs: structuredClone(row.costs), costSource: row.costSource, action: { request: row.request, response: row.response, body: { id: row.id, revision: row.revision } } }; }
  function session(id = 'A') {
    const client = new GameClient({ protocol: {}, WebSocketImpl: class { constructor() { throw Error('Offline fixture must not open a socket'); } } });
    client.codec = codec; client.state = 'READY';
    const state = { id, stock: new Map([['wood', 100], ['GOLD', 100], ['RUBY', 100]]), reliable: true, surveys: 0, writes: [], reads: [], onSurvey: null, onWrite: null, acknowledge, mutate,
      rows: Object.fromEntries(['write-1','write-2'].map(key => [key, { id: key, revision: 1, costs: structuredClone(costs), costSource, request: watch ? 'RepairFleetRequest' : 'SaveFormationRequest', response: watch ? null : 'SaveFormationResponse' }])) };
    client.synthetic = state;
    const receive = (name, body) => client.onMessage(codec.encode(name, 0, body));
    client.socket = { readyState: 1, close() { this.readyState = 3; }, send(bytes) {
      const frame = codec.decode(bytes);
      if (frame.name === 'AllItemRequest') { state.reads.push(frame.name); receive('AllItemResponse', { items: [...state.stock].filter(([key]) => !['GOLD','RUBY'].includes(key)).map(([itemId,num]) => ({ itemId,num })) }); return; }
      if (frame.name === 'AllResourceRequest') { state.reads.push(frame.name); receive('AllResourceResponse', { list: [{ res: 3, amount: state.stock.get('GOLD') ?? 0 }, { res: 4, amount: state.stock.get('RUBY') ?? 0 }] }); return; }
      state.writes.push(frame); calls.push({ account: id, phase: 'write', name: frame.name });
      if (state.mutate && state.rows[frame.body.id]) state.rows[frame.body.id].revision++;
      state.onWrite?.(frame);
      if (state.acknowledge && frame.name === 'SaveFormationRequest') receive('SaveFormationResponse', { accepted: true });
    } };
    const result = { id, generation: 1, abort: new AbortController(), state: 'READY', client, loop: { running: false }, busy: null };
    clients.push(client); return result;
  }
  const history = createExecutionHistory({ file });
  const moduleSettings = { get: () => ({ config: structuredClone(moduleConfig) }), save: (_id, _module, value) => { moduleConfig = structuredClone(value); return { config: structuredClone(moduleConfig) }; } };
  const service = createOperationService({ protocol, modules: { fixture: adapter }, moduleSettings, history, getConfig: () => structuredClone(gameConfig), loadRules: () => ({ config: structuredClone(rules) }), loadProduction: () => ({ config: structuredClone(production) }), businessExecute: (client, wire, op, options) => executeBusinessOperation(client, wire, op, { ...options, timeout, window: 1 }) });
  return { dir, file, adapter, service, history, session, calls, operation,
    config: value => { gameConfig = value; }, moduleConfig: value => { moduleConfig = value; }, rules: value => { rules = value; }, production: value => { production = value; },
    direct: (account, op = operation(account.client.synthetic.rows['write-1']), options = {}) => executeBusinessOperation(account.client, protocol, op, { adapter, allowMutate: true, timeout, window: 1, ...options }),
    cleanup() { for (const client of clients) client.stop(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
const plan = (f, account, selections = ['write-1'], scope = {}) => f.service.plan(account, { module: 'fixture', mode: selections.length === 1 ? 'Manual' : 'Automatic', selections }, scope);
const authorize = (f, account, displayed) => f.service.authorize(account, { batchId: displayed.batchId, planHash: displayed.planHash, approvedActionIds: displayed.actions.map(row => row.actionId), resourceBudget: displayed.resourceBudget, confirm: true });
function execute(f, account, displayed) { return f.service.execute(account, authorize(f, account, displayed)); }
const rows = (f, id = 'A') => f.service.history(id).runs[0].actions;

test('real service and executor charge the exact displayed total over one conservative run ledger', async () => {
  const f = fixture(), a = f.session();
  try { const displayed = await plan(f,a,['write-1','write-2']); assert.deepEqual(displayed.resourceBudget,[{id:'wood',num:80}]); assert.equal(displayed.actions[0].action,undefined); execute(f,a,displayed); await f.service.settle(a.id);
    assert.equal(f.service.status(a.id).finalStatus,'SUCCESS'); assert.equal(a.client.synthetic.writes.length,2); assert.deepEqual(rows(f).map(row=>row.resourceReservation),[[{id:'wood',num:40}],[{id:'wood',num:80}]]); assert.deepEqual(a.client.synthetic.reads,['AllItemRequest','AllResourceRequest','AllItemRequest','AllResourceRequest']);
    assert.equal(rows(f).every(row=>row.verification.status==='CONFIRMED'&&row.beforeInventoryReliable&&row.afterInventoryReliable),true); assert.equal(a.client.uncertainWrites.size,0);
  } finally { f.cleanup(); }
});

test('execution revalidates exact identity, target, action parameters, costs and cost source before dispatch', async () => {
  for (const change of [row=>row.revision++,row=>row.costs[0].num++,row=>row.request='RepairFleetRequest',row=>row.costSource='']) {
    const f=fixture(),a=f.session();try{const displayed=await plan(f,a);change(a.client.synthetic.rows['write-1']);execute(f,a,displayed);await f.service.settle(a.id);assert.equal(f.service.status(a.id).finalStatus,'NOT_EXECUTED');assert.equal(a.client.synthetic.writes.length,0);assert.equal(rows(f)[0].dispatched,false)}finally{f.cleanup()}
  }
});

test('unknown costs, unknown action semantics and D6 RUBY or paid requests never dispatch', async () => {
  for (const change of [row=>row.costs=null,row=>row.costs=[{id:'wood',num:null}],row=>row.costSource='',row=>row.request='UnknownFixtureRequest',row=>row.request='BuyFixtureRequest',row=>row.costs=[{id:'RUBY',num:1}]]) {
    const f=fixture({unsafePlanner:true}),a=f.session();try{change(a.client.synthetic.rows['write-1']);const result=await f.direct(a);assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(a.client.synthetic.writes.length,0);assert.equal(a.client.synthetic.reads.length,0)}finally{f.cleanup()}
  }
});

test('fresh inventory blocks a formerly affordable authorized write and cannot replenish a run budget', async () => {
  const f=fixture(),a=f.session();try{const displayed=await plan(f,a);a.client.synthetic.stock.set('wood',39);execute(f,a,displayed);await f.service.settle(a.id);assert.equal(f.service.status(a.id).finalStatus,'NOT_EXECUTED');assert.equal(a.client.synthetic.writes.length,0)}finally{f.cleanup()}
  const g=fixture({unsafePlanner:true}),b=g.session();try{const displayed=await plan(g,b,['write-1','write-2']);displayed.resourceBudget[0].num=1;assert.throws(()=>authorize(g,b,displayed),{code:'AUTHORIZATION_REQUIRED'});const budget={ledger:new ResourceLedger(new Map([['wood',40]]))};assert.equal((await g.direct(b,undefined,{budget})).status,'SUCCESS');assert.equal((await g.direct(b,g.operation(b.client.synthetic.rows['write-2']),{budget})).status,'NOT_EXECUTED');assert.equal(b.client.synthetic.writes.length,1);assert.equal(budget.ledger.reserved.get('wood'),40)}finally{g.cleanup()}
});

test('quiet watch reaches SUCCESS only after an authoritative exact state re-read', async () => {
  const f=fixture({watch:true}),a=f.session();try{const displayed=await plan(f,a);execute(f,a,displayed);await f.service.settle(a.id);const result=rows(f)[0];assert.equal(result.requestStatus,'UNKNOWN');assert.equal(result.result,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(a.client.synthetic.surveys,3);assert.equal(a.client.uncertainWrites.size,0)}finally{f.cleanup()}
  const g=fixture({watch:true,mutate:false}),b=g.session();try{execute(g,b,await plan(g,b));await g.service.settle(b.id);assert.equal(rows(g)[0].result,'UNKNOWN');assert.equal(rows(g)[0].verification.status,'UNCONFIRMED');assert.equal(b.client.uncertainWrites.size,1);await assert.rejects(plan(g,b),{code:'RESPONSE_UNCERTAIN'})}finally{g.cleanup()}
});

test('typed acknowledgement without authoritative verification remains UNKNOWN and locked', async () => {
  const f=fixture({verify:false}),a=f.session();try{execute(f,a,await plan(f,a,['write-1','write-2']));await f.service.settle(a.id);assert.equal(rows(f)[0].requestStatus,'SUCCESS');assert.equal(rows(f)[0].result,'UNKNOWN');assert.equal(rows(f)[0].unresolvedWrite,true);assert.equal(rows(f)[1].requestStatus,'NOT_DISPATCHED');assert.equal(a.client.synthetic.writes.length,1);assert.equal(a.client.uncertainWrites.size,1);assert.equal(f.history.unresolved(a.id),true)}finally{f.cleanup()}
});

test('typed timeout retains fingerprint, budget and UNKNOWN history after late response and restart', async () => {
  const f=fixture({acknowledge:false,timeout:5}),a=f.session();let restarted;
  try{execute(f,a,await plan(f,a,['write-1','write-2']));await f.service.settle(a.id);assert.equal(rows(f)[0].result,'UNKNOWN');assert.equal(rows(f)[0].unresolvedWrite,true);assert.deepEqual(rows(f)[0].resourceReservation,[{id:'wood',num:40}]);assert.equal(rows(f)[1].requestStatus,'NOT_DISPATCHED');assert.equal(a.client.uncertainWrites.size,1);assert.equal(a.client.lateResponses.has('SaveFormationResponse'),true);
    a.client.onMessage(codec.encode('SaveFormationResponse',0,{accepted:true,late:true}));assert.equal(a.client.lateResponses.size,0);assert.equal(a.client.uncertainWrites.size,1);assert.equal(rows(f)[0].result,'UNKNOWN');await assert.rejects(a.client.request('SaveFormationRequest',{id:'write-1',revision:1},'SaveFormationResponse',5,{mutate:true}),{code:'WRITE_UNCERTAIN'});
    restarted=fixture({historyFile:f.file});const fresh=restarted.session(a.id);await assert.rejects(plan(restarted,fresh),{code:'RECOVERY_UNCERTAIN'});assert.equal(fresh.client.synthetic.writes.length,0);assert.equal(restarted.service.history(a.id).runs[0].finalStatus,'UNKNOWN');
  }finally{restarted?.cleanup();f.cleanup()}
});

test('cancel before write sends nothing; cancel after dispatch is UNKNOWN and prevents later writes', async () => {
  const f=fixture(),a=f.session();try{const abort=new AbortController();abort.abort();assert.equal((await f.direct(a,undefined,{signal:abort.signal})).status,'CANCELLED');assert.equal(a.client.synthetic.surveys,0);assert.equal(a.client.synthetic.writes.length,0)}finally{f.cleanup()}
  const g=fixture({acknowledge:false,timeout:1000}),b=g.session(),sent=deferred();try{b.client.synthetic.onWrite=()=>sent.resolve();execute(g,b,await plan(g,b,['write-1','write-2']));await sent.promise;b.abort.abort();await g.service.settle(b.id);assert.equal(rows(g)[0].result,'UNKNOWN');assert.equal(rows(g)[0].unresolvedWrite,true);assert.equal(rows(g)[1].requestStatus,'NOT_DISPATCHED');assert.equal(b.client.synthetic.writes.length,1);assert.equal(b.client.uncertainWrites.size,1)}finally{g.cleanup()}
});

test('account generation changes during preflight or after dispatch cannot continue the batch', async () => {
  for(const afterDispatch of [false,true]){const f=fixture(),a=f.session();try{const displayed=await plan(f,a,['write-1','write-2']);if(afterDispatch)a.client.synthetic.onWrite=()=>{a.generation++};else a.client.synthetic.onSurvey=number=>{if(number===2)a.generation++};execute(f,a,displayed);await f.service.settle(a.id);assert.equal(rows(f)[0].result,afterDispatch?'UNKNOWN':'CANCELLED');assert.equal(a.client.synthetic.writes.length,afterDispatch?1:0);assert.equal(rows(f)[1].requestStatus,'NOT_DISPATCHED');assert.equal(a.client.uncertainWrites.size,afterDispatch?1:0)}finally{f.cleanup()}}
});

test('module, game, rule and production changes invalidate authorization and in-flight preflight', async () => {
  for(const kind of ['moduleConfig','config','rules','production']){const f=fixture(),a=f.session();try{const displayed=await plan(f,a);f[kind]({version:2,enabled:true,revision:2});assert.throws(()=>authorize(f,a,displayed));assert.equal(a.client.synthetic.writes.length,0)}finally{f.cleanup()}}
  const f=fixture(),a=f.session();try{const displayed=await plan(f,a);a.client.synthetic.onSurvey=number=>{if(number===2)f.moduleConfig({enabled:true,revision:2})};execute(f,a,displayed);await f.service.settle(a.id);assert.equal(rows(f)[0].result,'NOT_EXECUTED');assert.equal(a.client.synthetic.writes.length,0)}finally{f.cleanup()}
});

test('workflow account claim uses the real service lock and other accounts remain independent', async () => {
  const f=fixture(),a=f.session('A'),b=f.session('B');
  const graph={version:1,id:'integration-workflow',name:'Synthetic integration workflow',nodes:[{id:'start',type:'START'},{id:'action',type:'ACTION',module:'fixture',selection:{actionId:'write-1'}},{id:'verify',type:'VERIFY',module:'fixture'},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'action'},{from:'action',to:'verify'},{from:'verify',to:'stop'}]};
  const runner=createWorkflowRunner({operations:f.service,modules:{fixture:f.adapter},getSession:id=>id===a.id?a:b,claim:(id,runId)=>f.service.claimWorkflow(id===a.id?a:b,runId)});
  try{const paused=await runner.start(a.id,graph);assert.equal(paused.status,'AWAITING_AUTHORIZATION');assert.equal(a.workflowOwner,paused.runId);await assert.rejects(plan(f,a),{code:'ACCOUNT_BUSY'});assert.throws(()=>f.service.claimWorkflow(a,'different-workflow'),{code:'ACCOUNT_BUSY'});
    execute(f,b,await plan(f,b));execute(f,a,paused.plan);await Promise.all([f.service.settle(a.id),f.service.settle(b.id)]);assert.equal(f.service.status(a.id).finalStatus,'SUCCESS');assert.equal(f.service.status(b.id).finalStatus,'SUCCESS');assert.equal((await runner.resume()).status,'COMPLETED');assert.equal(a.workflowOwner,null);assert.equal(a.busy,null);assert.equal(a.client.synthetic.writes.length,1);assert.equal(b.client.synthetic.writes.length,1);
  }finally{runner.stop();await runner.settle();await Promise.all([f.service.settle(a.id),f.service.settle(b.id)]);f.cleanup()}
});

test('same-account active execution excludes a second batch while separate real executors overlap', async () => {
  const f=fixture({acknowledge:false,timeout:1000}),a=f.session('A'),b=f.session('B'),sentA=deferred(),sentB=deferred();
  try{a.client.synthetic.onWrite=()=>sentA.resolve();b.client.synthetic.onWrite=()=>sentB.resolve();const pa=await plan(f,a),pb=await plan(f,b);execute(f,a,pa);execute(f,b,pb);await Promise.all([sentA.promise,sentB.promise]);assert.equal(a.client.pending.length,1);assert.equal(b.client.pending.length,1);await assert.rejects(plan(f,a),{code:'ACCOUNT_BUSY'});
    for(const account of [a,b])account.client.onMessage(codec.encode('SaveFormationResponse',0,{accepted:true}));await Promise.all([f.service.settle(a.id),f.service.settle(b.id)]);assert.equal(f.service.status(a.id).finalStatus,'SUCCESS');assert.equal(f.service.status(b.id).finalStatus,'SUCCESS');
  }finally{a.abort.abort();b.abort.abort();await Promise.all([f.service.settle(a.id),f.service.settle(b.id)]);f.cleanup()}
});
