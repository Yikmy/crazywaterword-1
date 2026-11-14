import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

const operation = (id, module, num = 40) => ({ actionId: id, actionType: module === 'orders' ? 'SUBMIT' : 'UPGRADE', target: { id }, costs: [{ id: 'wood', num }], beforeState: { level: 1 }, identity: id, executable: true, action: { request: 'InternalOnly', body: { id } } });
function fixture({ execute, stock = 100, clock, survey: surveyOverride, history: providedHistory } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-service-')), file = path.join(dir, 'history.json');
  const history = providedHistory ?? createExecutionHistory({ file });
  let rules = { version: 1, enabled: true, rules: [] }, config = { version: 1 }, surveys = 0;
  const calls = [], a = operation('order-a', 'orders'), b = operation('order-b', 'orders'), city = operation('city-a', 'city');
  const survey = async (...args) => { surveys++; return surveyOverride ? surveyOverride(...args) : { stockReliable: true, stock: new Map([['wood', stock]]) }; };
  const orderPlanner = (_facts, { ledger, selections }) => {
    const actions = [];
    for (const op of [a, b]) if ((!selections || selections.includes(op.actionId)) && ledger.reserve(op.costs)) actions.push(op);
    return { rows: [a, b], actions };
  };
  const cityPlanner = (_facts, { ledger, selections }) => ({ actions: selections.includes(city.actionId) && ledger.reserve(city.costs) ? [city] : [] });
  const perform = async (client, protocol, op, opts) => {
    calls.push({ account: client.id, id: op.actionId, budget: opts.budget });
    if (execute) return execute(client, op, opts);
    assert.equal(opts.budget.ledger.reserve(op.costs), true);
    return { status: 'SUCCESS', requestStatus: 'SUCCESS', afterState: { level: 2 }, verification: { status: 'CONFIRMED' } };
  };
  const service = createOperationService({ protocol: {}, loadProduction: () => ({ config: { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 } }), getConfig: () => config, loadRules: () => ({ config: rules }), history, clock,
    survey, orderPlanner, cityPlanner, cityViewer: () => ({ buildings: [], factories: [], candidates: [city] }), orderExecute: perform, cityExecute: perform });
  const session = id => ({ id, generation: 1, abort: new AbortController(), state: 'READY', client: { id, connected: true, pending: [], watchers: [], uncertainWrites: new Set() }, loop: { running: false }, busy: null });
  return { dir, file, history, service, session, calls, surveys: () => surveys,
    rules: value => { rules = value; }, config: value => { config = value; }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const createPlan = (f, session, selections = ['order-a'], mode = 'Manual', module = 'orders') => f.service.plan(session, { module, mode, selections });
function approve(f, session, plan, overrides = {}) { return f.service.authorize(session, { batchId: plan.batchId, planHash: plan.planHash,
  approvedActionIds: plan.actions.map(action => action.actionId), resourceBudget: plan.resourceBudget, confirm: true, ...overrides }); }
function start(f, session, plan) { const permit = approve(f, session, plan); return f.service.execute(session, permit); }

test('only exact displayed plan, account, ordered action set and budget can receive one-use authorization', async () => {
  const f = fixture(), a = f.session('A'), b = f.session('B');
  try {
    const plan = await createPlan(f, a);
    assert.throws(() => f.service.execute(a, { batchId: plan.batchId, confirm: true }), /不支持/);
    for (const fields of [{ confirm: false }, { planHash: 'forged' }, { approvedActionIds: ['order-b'] }, { resourceBudget: [] }]) assert.throws(() => approve(f, a, plan, fields), /授权/);
    assert.throws(() => approve(f, b, plan), /批次/);
    assert.equal(plan.actions[0].action, undefined, 'transport action is not returned to caller');
    const permit = approve(f, a, plan); f.service.execute(a, permit); await f.service.settle('A');
    assert.equal(f.calls.length, 1); assert.throws(() => f.service.execute(a, permit), /授权/);
    assert.throws(() => approve(f, a, plan), /复用/); assert.equal(f.service.status('A').finalStatus, 'SUCCESS');
  } finally { f.cleanup(); }
});
test('planning composes order and city reservations through the same ledger and refuses aggregate overspend', async () => {
  const f = fixture(), a = f.session('A');
  try {
    const plan = await createPlan(f, a, ['order-a', 'city-a'], 'Automatic', 'combined'); assert.deepEqual(plan.resourceBudget, [{ id: 'wood', num: 80 }]);
    await assert.rejects(createPlan(f, a, ['order-a', 'order-b', 'city-a'], 'Automatic', 'combined'), /预算|变化/);
    const chosen = await createPlan(f, a, ['order-b']); assert.equal(chosen.actions[0].actionId, 'order-b');
    const run = start(f, a, await createPlan(f, a, ['order-a', 'city-a'], 'Automatic', 'combined')); await f.service.settle('A');
    assert.equal(f.calls.length, 2); assert.equal(f.calls[0].budget, f.calls[1].budget);
    assert.equal(f.calls[0].budget.ledger.reserved.get('wood'), 80);
    assert.equal(f.service.history('A', run.runId).runs[0].actions.every(action => action.verification.status === 'CONFIRMED'), true);
  } finally { f.cleanup(); }
});
test('Manual only accepts one action and unknown or arbitrary request fields never enter plans', async () => {
  const f = fixture(), a = f.session('A');
  try {
    for (const payload of [ { module: 'orders', mode: 'Manual', selections: ['order-a', 'order-b'] }, { module: 'orders', mode: 'Automatic', selections: ['unknown'] }, { module: 'orders', mode: 'Automatic', selections: ['order-a'], request: 'BuyRubyRequest' }, { module: 'orders', mode: 'Automatic', selections: ['order-a'], allowPaid: true } ]) await assert.rejects(f.service.plan(a, payload));
    assert.equal(f.calls.length, 0);
  } finally { f.cleanup(); }
});
test('account generation, latest rules, config changes, expiration and replacement invalidate authorization', async () => {
  let timestamp = Date.parse('2026-11-10T00:00:00Z'); const f = fixture({ clock: () => timestamp }), a = f.session('A');
  try {
    let plan = await createPlan(f, a); a.generation++; assert.throws(() => approve(f, a, plan), /会话/);
    plan = await createPlan(f, a); f.rules({ version: 1, enabled: false, rules: [] }); assert.throws(() => approve(f, a, plan), /规则/);
    plan = await createPlan(f, a); f.config({ version: 2 }); assert.throws(() => approve(f, a, plan), /配置/);
    plan = await createPlan(f, a); timestamp += 300001; assert.throws(() => approve(f, a, plan), /过期/);
    plan = await createPlan(f, a); await createPlan(f, a, ['order-b']); assert.throws(() => approve(f, a, plan), /批次/);
    assert.equal(f.calls.length, 0);
  } finally { f.cleanup(); }
});
test('server-owned plan is independent of mutations to its returned preview', async () => {
  const f = fixture(), a = f.session('A');
  try {
    const plan = await createPlan(f, a), original = structuredClone(plan); plan.actions[0].costs[0].num = 0; plan.resourceBudget[0].num = 0;
    assert.throws(() => approve(f, a, plan), /授权/); start(f, a, original); await f.service.settle('A');
    assert.equal(f.calls[0].budget.ledger.reserved.get('wood'), 40);
  } finally { f.cleanup(); }
});
test('same account writes exclude Stage and collection, while separate accounts execute in parallel', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ execute: async () => { await gate; return { status: 'SUCCESS', requestStatus: 'SUCCESS' }; } }), a = f.session('A'), b = f.session('B');
  try {
    a.stageRunner = { getStatus: () => ({ running: true }) }; await assert.rejects(createPlan(f, a), /互斥/); delete a.stageRunner;
    a.collectionPromise = Promise.resolve(); await assert.rejects(createPlan(f, a), /互斥/); delete a.collectionPromise;
    const pa = await createPlan(f, a), pb = await createPlan(f, b); start(f, a, pa); start(f, b, pb);
    await Promise.resolve(); assert.equal(f.calls.length, 2); assert.equal(a.busy, 'operations:EXECUTING');
    await assert.rejects(createPlan(f, a), /互斥/); assert.equal(f.service.view('A').status.running, true);
    release(); await Promise.all([f.service.settle('A'), f.service.settle('B')]); assert.equal(a.busy, null); assert.equal(b.busy, null);
  } finally { release(); await Promise.all([f.service.settle('A'), f.service.settle('B')]); f.cleanup(); }
});
test('UNKNOWN halts immediately, retains budget/evidence and prevents a fresh run after restart', async () => {
  const f = fixture({ execute: async (_client, op, opts) => { opts.budget.ledger.reserve(op.costs); return { status: 'UNKNOWN', requestStatus: 'UNKNOWN', verification: { status: 'UNCONFIRMED' } }; } }), a = f.session('A');
  try {
    start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].budget.ledger.reserved.get('wood'), 40); assert.equal(f.service.status('A').blocked, true);
    assert.equal(f.history.list('A')[0].actions[1].requestStatus, 'NOT_DISPATCHED');
    await assert.rejects(createPlan(f, a), /未决/);
    const restarted = fixture({ history: createExecutionHistory({ file: f.file }) });
    try { await assert.rejects(createPlan(restarted, a), /未决/); assert.equal(restarted.calls.length, 0); } finally { restarted.cleanup(); }
  } finally { f.cleanup(); }
});
test('stop before dispatch cancels without sending, and stop during a result prevents the next operation', async () => {
  let unblock; const gate = new Promise(resolve => { unblock = resolve; });
  const f = fixture({ execute: async () => { await gate; return { status: 'SUCCESS', requestStatus: 'SUCCESS' }; } }), a = f.session('A');
  try {
    start(f, a, await createPlan(f, a)); f.service.stop('A'); await f.service.settle('A'); assert.equal(f.calls.length, 0); assert.equal(f.service.status('A').finalStatus, 'CANCELLED');
    start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await Promise.resolve(); f.service.stop('A'); unblock(); await f.service.settle('A');
    assert.equal(f.calls.length, 1); assert.equal(f.service.status('A').finalStatus, 'CANCELLED');
  } finally { unblock(); await f.service.settle('A'); f.cleanup(); }
});
test('rate limit, rejection and stale execution failures stop without retrying later actions', async () => {
  for (const outcome of ['RATE_LIMITED', 'REJECTED', 'NOT_EXECUTED']) {
    const f = fixture({ execute: async () => ({ status: outcome, requestStatus: outcome, error: 'synthetic ' + outcome }) }), a = f.session('A');
    try { start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A'); assert.equal(f.calls.length, 1); assert.equal(f.service.status('A').finalStatus, outcome); }
    finally { f.cleanup(); }
  }
});
test('history is durably present before dispatch and every result is persisted before the next dispatch', async () => {
  let f; f = fixture({ execute: async (_client, op) => {
    const persisted = JSON.parse(fs.readFileSync(f.file, 'utf8')).accounts.A[0];
    const index = persisted.actions.findIndex(action => action.actionId === op.actionId);
    assert.equal(persisted.actions[index].requestStatus, 'DISPATCHING');
    if (index) assert.equal(persisted.actions[index - 1].result, 'SUCCESS');
    return { status: 'SUCCESS', requestStatus: 'SUCCESS' };
  } }); const a = f.session('A');
  try { start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A'); assert.equal(f.calls.length, 2); }
  finally { f.cleanup(); }
});
test('history failure before dispatch sends nothing; failure after dispatch blocks further writes', async () => {
  const fail = () => { throw Error('history unavailable'); };
  let f = fixture({ history: { unresolved: () => false, list: () => [], put: fail } }), a = f.session('A');
  try { const plan = await createPlan(f, a); assert.throws(() => start(f, a, plan), /history/); assert.equal(f.calls.length, 0); assert.equal(a.busy, null); } finally { f.cleanup(); }
  let writes = 0;
  f = fixture({ history: { unresolved: () => false, list: () => [], put: record => { writes++; if (record.actions.some(row => row.result === 'SUCCESS')) fail(); } } }); a = f.session('A');
  try { start(f, a, await createPlan(f, a, ['order-a', 'order-b'], 'Automatic')); await f.service.settle('A'); assert.equal(f.calls.length, 1); assert.equal(f.service.status('A').blocked, true); await assert.rejects(createPlan(f, a), /未决/); } finally { f.cleanup(); }
});

test('Workflow stop cancels ACTION planning reads before continuation and never creates a batch',async t=>{
 const {createWorkflowRunner}=await import('../src/workflow.mjs'),{awaitExecution}=await import('../src/execution.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-plan-cancel-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const history=createExecutionHistory({file:path.join(dir,'history.json')}),reads=[];let release,entered,planned=0,signal;
 const gate=new Promise(resolve=>release=resolve),waiting=new Promise(resolve=>entered=resolve);
 const adapter={id:'fixture',async survey(client,_protocol,options){signal=options.signal;reads.push('first');entered();await awaitExecution(gate,client,options);reads.push('second');return {stockReliable:true,stock:new Map()};},view:()=>({candidates:[]}),plan(){planned++;return {actions:[]};},verify(){}};
 const modules={fixture:adapter},service=createOperationService({protocol:{},modules,history,getConfig:()=>({}),loadRules:()=>({config:{}}),loadProduction:()=>({config:{}}),moduleSettings:{get:()=>({config:{enabled:true}})}}),session={id:'offline-plan',player:{playerId:'1',worldId:'2'},generation:1,connectionId:'offline-plan',client:{connected:true,pending:[],watchers:[]},abort:new AbortController(),state:'READY',loop:{running:false},busy:null};
 const graph={version:1,id:'planning-cancel',name:'Planning cancellation',budget:{resources:[],quotas:[],uids:[]},nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'fixture',selection:{actionId:'one'}},{id:'z',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'z'}]};
 const runner=createWorkflowRunner({modules,operations:service,getSession:()=>session,claim:(_id,runId,options)=>service.claimWorkflow(session,runId,options)});
 t.after(async()=>{release();runner.stop();await runner.settle();});
 const running=runner.start(session.id,graph);await waiting;runner.stop();assert.equal((await running).status,'CANCELLED');assert.equal(session.abort.signal.aborted,false);
 release();await new Promise(resolve=>setTimeout(resolve,40));assert.deepEqual(reads,['first']);assert.equal(signal.aborted,true);assert.equal(planned,0);assert.equal(service.view(session.id).lastPlan,null);assert.deepEqual(history.list(session.id),[]);assert.equal(session.busy,null);
});

test('cancelled planning caller or session performs no investigation and creates no authorization or history',async()=>{
 for(const source of ['caller','session']){
  const f=fixture(),session=f.session('offline-'+source),abort=new AbortController();
  try{(source==='caller'?abort:session.abort).abort();await assert.rejects(f.service.plan(session,{module:'orders',mode:'Manual',selections:['order-a']},{signal:abort.signal}),{code:'CANCELLED'});
   assert.equal(f.surveys(),0);assert.equal(f.calls.length,0);assert.equal(f.service.view(session.id).lastPlan,null);assert.deepEqual(f.history.list(session.id),[]);assert.equal(session.busy,null);
  }finally{f.cleanup();}
 }
});

test('late planning facts from an adapter ignoring cancellation cannot replace a prior plan or acquire a permit',async()=>{
 for(const source of ['caller','session']){
  let block=false,entered,release;const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const f=fixture({survey:async()=>{if(block){entered();await gate;}return {stockReliable:true,stock:new Map([['wood',100]])};}}),session=f.session('offline-late-'+source),abort=new AbortController();
  try{
   const original=await createPlan(f,session);block=true;
   const planning=f.service.plan(session,{module:'orders',mode:'Manual',selections:['order-b']},{signal:abort.signal});await waiting;(source==='caller'?abort:session.abort).abort();release();await assert.rejects(planning,{code:'CANCELLED'});
   assert.deepEqual(f.service.view(session.id).lastPlan,original);assert.equal(f.calls.length,0);assert.deepEqual(f.history.list(session.id),[]);assert.equal(session.busy,null);
  }finally{release();f.cleanup();}
 }
});

const sourceFields=['accountId','playerId','worldId','generation','connectionId'];
function sourceSession(f){
 const session=f.session('offline-source'),factContext={accountId:session.id,playerId:'9007199254740993',worldId:'17',generation:1,connectionId:'source-connection'};
 session.player={playerId:factContext.playerId,worldId:factContext.worldId};session.connectionId=factContext.connectionId;session.client.factContext={...factContext};return session;
}
const changeSource=(session,key)=>{session.client.factContext[key]=key==='generation'?2:key==='accountId'?'other-account':key==='playerId'?'9007199254740995':key==='worldId'?'18':'other-connection';};
for(const key of sourceFields)test('planning rejects late client source '+key+' drift without replacing prior plan or cache',async()=>{
 let release,entered,blocking=false;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
 const f=fixture({survey:async()=>{if(blocking){entered();await gate;}return {stockReliable:true,stock:new Map([['wood',100]])};}}),session=sourceSession(f);
 try{
  const old=await createPlan(f,session),before=f.service.view(session.id);blocking=true;
  const pending=createPlan(f,session,['order-b']);await waiting;changeSource(session,key);release();await assert.rejects(pending,{code:'CANCELLED'});
  assert.deepEqual(f.service.view(session.id),before);assert.equal(f.service.view(session.id).lastPlan.batchId,old.batchId);assert.equal(f.calls.length,0);assert.deepEqual(f.history.list(session.id),[]);assert.equal(session.busy,null);
 }finally{release();f.cleanup();}
});
for(const phase of ['authorization','execution'])for(const key of sourceFields)test(phase+' rejects client source '+key+' drift from displayed plan',async()=>{
 const f=fixture(),session=sourceSession(f);
 try{
  const plan=await createPlan(f,session),permit=phase==='execution'?approve(f,session,plan):null;changeSource(session,key);
  assert.throws(()=>phase==='authorization'?approve(f,session,plan):f.service.execute(session,permit),{code:'STALE_PLAN'});
  assert.equal(f.calls.length,0);assert.deepEqual(f.history.list(session.id),[]);assert.equal(session.busy,null);
 }finally{f.cleanup();}
});


test('production coverage projects only account history and survives a stopped restart without replay or filtering away gaps', () => {
  const timestamp='2026-11-10T04:00:00Z', clock=()=>Date.parse(timestamp), f=fixture({clock});
  const action={actionId:'collect',actionType:'gainFactory',requestStatus:'SUCCESS',result:'SUCCESS',verification:{status:'CONFIRMED'},timestamp,
    beforeState:{factory:{finishedProducts:[{id:'布匹',num:2}]}},afterState:{factory:{finishedProducts:[]}},
    beforeInventory:[{id:'布匹',num:0}],afterInventory:[{id:'布匹',num:2}],beforeInventoryReliable:true,afterInventoryReliable:true};
  const record=(accountId,runId,row)=>({accountId,runId,module:'city',finalStatus:row.result,actions:[row]});
  try {
    f.history.put(record('A','confirmed',action));
    f.history.put(record('A','interrupted',{...action,actionId:'pending',result:'EXECUTING',requestStatus:'DISPATCHING',verification:{status:'NOT_STARTED'}}));
    f.history.put(record('B','confirmed',{...action,afterInventory:[{id:'布匹',num:999}]}));
    const before=fs.readFileSync(f.file,'utf8'), selected=f.service.history('A','confirmed');
    assert.equal(selected.runs.length,1); assert.equal(selected.runs[0].runId,'confirmed');
    assert.deepEqual(selected.dailyReport.collected,[{id:'布匹',num:2}]); assert.equal(selected.dailyReport.coverageDetails.unresolvedOperations,1);
    const reloaded=createExecutionHistory({file:f.file}), restarted=createOperationService({protocol:{},history:reloaded,clock});
    const report=restarted.history('A').dailyReport;
    assert.deepEqual(report,selected.dailyReport); assert.equal(restarted.history('A').runs.find(r=>r.runId==='interrupted').finalStatus,'UNKNOWN');
    assert.deepEqual(restarted.history('missing').dailyReport.collected,[]); assert.equal(restarted.history('B').dailyReport.coverageDetails.unquantifiedCollections,1);
    assert.equal(report.coverageDetails.fullDayCoverage,false); assert.equal(reloaded.unresolved('A'),true);
    assert.equal(fs.readFileSync(f.file,'utf8'),before); assert.equal(f.calls.length,0); assert.equal(f.surveys(),0);
  } finally { f.cleanup(); }
});


test('production history accepts an explicit local date independently of exact run filtering and rejects unsupported options', () => {
  const f=fixture({clock:()=>Date.parse('2026-11-14T04:00:00Z')});
  const action=(actionId,timestamp)=>({actionId,actionType:'startProduce',result:'SUCCESS',requestStatus:'SUCCESS',verification:{status:'CONFIRMED'},timestamp});
  try {
    f.history.put({accountId:'A',runId:'dated',module:'city',finalStatus:'SUCCESS',actions:[action('midnight','2026-11-09T16:05:00Z'),action('next-day','2026-11-10T16:05:00Z')]});
    assert.equal(f.service.history('A').dailyReport.date,'2026-11-14'); assert.equal(f.service.history('A').dailyReport.startedOperations,0);
    const selected=f.service.history('A','missing',{date:'2026-11-10'});assert.deepEqual(selected.runs,[]);
    assert.equal(selected.dailyReport.startedOperations,1);assert.equal(selected.dailyReport.date,'2026-11-10');assert.equal(selected.dailyReport.timeZone,'Asia/Shanghai');
    assert.equal(f.service.history('A',undefined,{date:'2026-11-11'}).dailyReport.startedOperations,1);
    for(const options of [{date:'2026-02-30'},{date:''},{date:null},{timeZone:'UTC'},{date:'2026-11-10',extra:true},null]) assert.throws(()=>f.service.history('A',undefined,options),{code:'INVALID_INPUT'});
    assert.equal(f.calls.length,0);assert.equal(f.surveys(),0);
  }finally{f.cleanup();}
});
