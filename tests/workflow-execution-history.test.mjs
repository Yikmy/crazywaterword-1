import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-workflow-execution-history-'));
process.env.CW_DATA_DIR = dir;
process.env.CW_CONFIG_PACK = path.join(dir, 'absent-config.json');
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const { createExecutionHistory } = await import('../src/execution-history.mjs');
const { createWorkflowStore, projectWorkflowExecutionHistory } = await import('../src/workflow.mjs');

const origin = 'http://127.0.0.1:17321', workflowFile = path.join(dir, 'workflows.json');
const account = id => ({ id, label: 'synthetic-' + id, url: 'wss://example.invalid', login: {
  eworldParams: { openId: id, token: 'offline-workflow-token', sign: 'offline-workflow-sign', timestamp: 1 },
} });
saveStore({ version: 1, activeId: 'A', accounts: [account('A'), account('B')] });
after(() => {
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const protocol = Object.fromEntries(['GetFormation', 'MyFormationPreset', 'AllHero', 'SaveFormation'].flatMap(name =>
  [[name + 'Request', {}], [name + 'Response', {}]]));
const config = { tables: {
  HeroCfg: { data: [{ id: 'tank', career: '坦克' }] },
  FormationHeroNumCfg: { data: [{ heroNum: 1, mainlineStage: 0 }] },
  FormationTypePositionCfg: { data: [{ id: 1, position: [1, 3] }, { id: 2, position: [5, 5] }] },
} };

function fixture(name) {
  const file = path.join(dir, name + '-execution.json'), history = createExecutionHistory({ file });
  const sent = [];
  const app = createConsole({ protocol, tracePath: path.join(dir, name + '-trace.log'),
    clientFactory() { assert.fail('a history read must never create a game client'); },
    collect() { assert.fail('a history read must never query the game'); },
    writerOwnership: { assertOwned: () => true, release() {}, claim: () => true },
    operationOptions: { history, getConfig: () => config, loadRules: () => ({ config: {} }),
      loadProduction: () => ({ config: {} }), moduleSettings: { get: () => ({ config: { enabled: true, mainlineEnabled: true } }) } },
  });
  app.server.address = () => ({ port: 17321 });
  const request = (url, { body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) =>
    new Promise(resolve => {
      const req = new EventEmitter();
      Object.assign(req, { url, method, headers: { host: '127.0.0.1:17321', origin, 'content-type': 'application/json', ...headers } });
      const res = {
        writeHead(status, headers) { this.status = status; this.headers = headers; },
        end(text) { resolve({ status: this.status, headers: this.headers, data: JSON.parse(text), text }); },
      };
      app.server.emit('request', req, res);
      if (body !== undefined) req.emit('data', JSON.stringify(body));
      req.emit('end');
    });
  function ready({apply=true}={}) {
    let formation = { presetId: 1, petUid: '9007199254740993', heroPositions: [{ heroId: 'tank', pos: { x: 1, y: 3 } }] };
    const client = new EventEmitter();
    Object.assign(client, { connected: true, pending: [], watchers: [], uncertainWrites: new Set(),
      stop() { this.connected = false; },
      async request(name, body) {
        sent.push(name);
        if (name === 'GetFormationRequest') return { formation: structuredClone(formation) };
        if (name === 'MyFormationPresetRequest') return { ids: [2] };
        if (name === 'AllHeroRequest') return { heroes: [{ heroId: 'tank' }] };
        if (name === 'SaveFormationRequest') { if(apply)formation = structuredClone(body.formation); return { formation }; }
        throw Error('Unexpected synthetic request ' + name);
      },
    });
    const session = { id: 'A', state: 'READY', generation: 1, connectionId: 'synthetic-connection', client,
      player: { playerId: '17', worldId: 9, mainlineStage: 41 }, abort: new AbortController(), loop: { running: false, stop: {} },
      busy: null, log: [] };
    app.sessions.set('A', session);
    return session;
  }
  const workflowStore = createWorkflowStore({ file: workflowFile, modules: app.operations.modules });
  return { ...app, request, history, file, workflowStore, ready, sent };
}

function historyUrl(accountId, runId) {
  return '/api/workflows/history?' + new URLSearchParams({ account: accountId, workflowRunId: runId });
}

async function waitStatus(app, status) {
  for (let i = 0; i < 30; i++) {
    const read = (await app.request('/api/workflows?account=A')).data;
    if (read.status.status === status) return read;
    if (['FAILED', 'UNKNOWN', 'CANCELLED'].includes(read.status.status)) assert.fail(JSON.stringify(read.status));
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Workflow did not reach ' + status);
}

test('actual Workflow and shared Operation produce a read-only node, batch and action association', async t => {
  const f = fixture('joined');
  t.after(() => f.close());
  const session = f.ready(), parameters = { presetId: 2 };
  const surveyed = await f.operations.surveyModule(session, 'formation', parameters);
  const action = surveyed.view.candidates[0];
  assert.equal(action.executable, true);
  const graph = { version: 1, id: 'formation-flow', name: 'Synthetic formation flow',
    nodes: [{ id: 'start', type: 'START' }, { id: 'formation-node', type: 'ACTION', module: 'formation',
      selection: action.actionId, parameters }, { id: 'stop', type: 'STOP' }],
    edges: [{ from: 'start', to: 'formation-node' }, { from: 'formation-node', to: 'stop' }] };
  const get = await f.request('/api/workflows?account=A');
  const headers = { 'x-cw-csrf': get.data.csrfToken };
  const start = await f.request('/api/workflows/start?account=A', { headers, body: { graph } });
  assert.equal(start.status, 200);
  const { status: pending } = await waitStatus(f, 'AWAITING_AUTHORIZATION');
  const url = historyUrl('A', pending.runId);
  const before = await f.request(url);
  assert.equal(before.status, 200);
  assert.equal(before.data.status, 'AWAITING_AUTHORIZATION');
  assert.deepEqual(before.data.nodes.map(node => [node.nodeId, node.batches]), [['formation-node', []]]);
  assert.equal(f.sent.filter(name => name === 'SaveFormationRequest').length, 0);

  const plan = pending.plan, permit = f.operations.authorize(session, { batchId: plan.batchId, planHash: plan.planHash,
    approvedActionIds: [action.actionId], resourceBudget: plan.resourceBudget, confirm: true });
  const { runId: operationRunId } = f.operations.execute(session, permit);
  await f.operations.settle('A');
  assert.equal((await f.request('/api/workflows/resume?account=A', { headers, body: {} })).status, 200);
  await waitStatus(f, 'COMPLETED');

  const bytes = [workflowFile, f.file].map(file => fs.readFileSync(file, 'utf8'));
  const requests = f.sent.slice();
  const result = await f.request(url);
  assert.equal(result.status, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.data.accountId, 'A');
  assert.equal(result.data.workflowRunId, pending.runId);
  assert.equal(result.data.workflowDefinitionId, graph.id);
  assert.equal(result.data.status, 'COMPLETED');
  assert.equal(result.data.readOnly, true);
  assert.equal(result.data.resumable, false);
  assert.equal(result.data.unlinkedOperationCount, 0);
  const [{ nodeId, batches: [batch] }] = result.data.nodes;
  assert.equal(nodeId, 'formation-node');
  assert.equal(batch.batchId, plan.batchId);
  assert.equal(batch.operationRunId, operationRunId);
  assert.equal(batch.finalStatus, 'SUCCESS');
  assert.deepEqual(batch.actions.map(row => [row.actionId, row.result, row.verificationStatus, row.needsReconciliation]),
    [[action.actionId, 'SUCCESS', 'CONFIRMED', false]]);
  assert.equal(result.text.includes(permit.permitId), false);
  assert.deepEqual(f.sent, requests);
  assert.deepEqual([workflowFile, f.file].map(file => fs.readFileSync(file, 'utf8')), bytes);
  assert.equal(f.server.listening, false);
});

test('interrupted workflow links only unambiguous exact-account evidence and retains the original UNKNOWN result', async t => {
  const f = fixture('recovered');
  t.after(() => f.close());
  const workflowRunId = 'synthetic-interrupted-parent', workflowDefinitionId = 'former-graph-definition', workflowNodeId = 'same-node';
  const at = '2026-11-12T05:00:00.000Z';
  f.workflowStore.record('A', { runId: workflowRunId, workflowId: workflowDefinitionId, status: 'RUNNING',
    trace: [{ nodeId: workflowNodeId, type: 'ACTION', result: 'AWAITING_AUTHORIZATION', timestamp: at }] });
  function row(runId, batchId = runId + '-batch', accountId = 'A') {
    return { accountId, runId, workflowId: workflowRunId, parentRunId: workflowRunId, workflowDefinitionId, workflowNodeId,
      module: 'formation', finalStatus: 'UNKNOWN',
      planSummary: { accountId, parentRunId: workflowRunId, workflowDefinitionId, workflowNodeId, batchId,
        actions: [{ actionId: 'action' }], body: { value: 'synthetic-body-must-not-be-projected' } },
      authorizationSummary: { batchId, actionIds: ['action'], permitId: 'synthetic-permit-must-not-be-projected' },
      actions: [{ actionId: 'action', actionType: 'SAVE', capabilityId: 'cw.formation',
        requestStatus: 'UNKNOWN', result: 'UNKNOWN', unresolvedWrite: true }] };
  }
  f.history.put(row('original-unknown'));
  f.history.appendReconciliation('A', 'original-unknown', 'action', { status: 'APPLIED', timestamp: at,
    evidence: { method: 'synthetic-evidence-must-not-be-projected' } });
  const missing = row('legacy'); delete missing.workflowNodeId; f.history.put(missing);
  const wrong = row('conflict'); wrong.planSummary.workflowDefinitionId = 'other-definition'; f.history.put(wrong);
  const authConflict = row('wrong-authorization'); authConflict.authorizationSummary.actionIds = ['wrong-action']; f.history.put(authConflict);
  f.history.put(row('duplicate-one', 'duplicate-batch')); f.history.put(row('duplicate-two', 'duplicate-batch'));
  f.history.put(row('foreign-account', undefined, 'B'));

  const bytes = [workflowFile, f.file].map(file => fs.readFileSync(file, 'utf8')), url = historyUrl('A', workflowRunId);
  const result = await f.request(url);
  assert.equal(result.status, 200);
  assert.equal(result.data.status, 'RECOVERED_STOPPED');
  assert.equal(result.data.recovered, true);
  assert.equal(result.data.resumable, false);
  assert.equal(result.data.coverage, 'PERSISTED_WORKFLOW_OPERATION_LINKS_ONLY');
  assert.equal(result.data.unlinkedOperationCount, 5);
  const [batch] = result.data.nodes[0].batches;
  assert.equal(result.data.nodes[0].batches.length, 1);
  assert.equal(batch.operationRunId, 'original-unknown');
  assert.equal(batch.finalStatus, 'UNKNOWN');
  assert.equal(batch.actions[0].result, 'UNKNOWN');
  assert.equal(batch.actions[0].reconciliationStatus, 'APPLIED');
  assert.equal(batch.actions[0].needsReconciliation, false);
  assert.doesNotMatch(result.text, /must-not-be-projected|foreign-account|duplicate-one/);
  assert.equal((await f.request(historyUrl('B', workflowRunId))).status, 404);
  for (const bad of ['/api/workflows/history?account=A', url + '&account=B', url + '&workflowRunId=extra', url + '&status=RUNNING']) {
    assert.equal((await f.request(bad)).status, 400);
  }
  assert.equal((await f.request(url, { method: 'POST' })).status, 403);
  assert.equal((await f.request(url, { headers: { origin: 'https://foreign.invalid' } })).status, 403);
  assert.equal(f.sessions.size, 0);
  assert.deepEqual(f.sent, []);
  assert.deepEqual([workflowFile, f.file].map(file => fs.readFileSync(file, 'utf8')), bytes);

  fs.writeFileSync(f.file, '{synthetic corrupt history');
  const unavailable = await f.request(url);
  assert.equal(unavailable.status, 409);
  assert.equal(unavailable.data.code, 'HISTORY_UNAVAILABLE');
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{synthetic corrupt history');
});

test('persisted blocked and preview identities survive restart without inventing dispatch or linking conflicting batches',async t=>{
 const f=fixture('blocked-preview');t.after(()=>f.close());
 const runId='blocked-preview-run',workflowId='blocked-preview-graph',at='2026-11-13T01:00:00.000Z';
 const trace=[
  {nodeId:'blocked',type:'ACTION',result:'BLOCKED_NO_EXECUTABLE_CANDIDATE',module:'free-gold',blockedReasons:['FREE_GOLD_CLOCK_UNKNOWN'],timestamp:at},
  {nodeId:'preview',type:'ACTION',result:'AWAITING_AUTHORIZATION',module:'formation',actionId:'exact-action',batchId:'exact-batch',planHash:'exact-hash',timestamp:at,permitId:'discard-this-permit',body:{token:'discard-this-token'}},
 ];
 f.workflowStore.record('A',{runId,workflowId,status:'AWAITING_AUTHORIZATION',trace});
 const bytes=fs.readFileSync(workflowFile,'utf8'),result=await f.request(historyUrl('A',runId));
 assert.equal(result.status,200);assert.equal(result.data.status,'RECOVERED_STOPPED');assert.equal(result.data.resumable,false);
 assert.equal(result.data.nodes[0].module,'free-gold');assert.deepEqual(result.data.nodes[0].blockedReasons,['FREE_GOLD_CLOCK_UNKNOWN']);
 assert.equal(result.data.nodes[1].batchId,'exact-batch');assert.equal(result.data.nodes[1].planHash,'exact-hash');
 assert.deepEqual(result.data.nodes.map(node=>node.batches),[[],[]]);assert.equal(f.sent.length,0);assert.equal(f.sessions.size,0);
 assert.equal(fs.readFileSync(workflowFile,'utf8'),bytes);assert.doesNotMatch(bytes,/discard-this-permit|discard-this-token/);
 const persisted=f.workflowStore.history('A',{runId})[0];
 const operation={accountId:'A',runId:'exact-operation',workflowId:runId,parentRunId:runId,workflowDefinitionId:workflowId,workflowNodeId:'preview',module:'formation',finalStatus:'SUCCESS',
  planSummary:{accountId:'A',parentRunId:runId,workflowDefinitionId:workflowId,workflowNodeId:'preview',batchId:'exact-batch',planHash:'exact-hash',actions:[{actionId:'exact-action'}]},
  authorizationSummary:{batchId:'exact-batch',actionIds:['exact-action']},actions:[{actionId:'exact-action',result:'SUCCESS',requestStatus:'SUCCESS',verification:{status:'CONFIRMED'}}]};
 assert.equal(projectWorkflowExecutionHistory('A',persisted,[operation]).nodes[1].batches.length,1);
 for(const mutate of [
  row=>row.planSummary.planHash='different-hash',
  row=>{row.module='free-gold';},
  row=>{row.workflowNodeId='blocked';row.planSummary.workflowNodeId='blocked';row.module='free-gold';},
  row=>{row.actions[0].actionId='other';row.planSummary.actions[0].actionId='other';row.authorizationSummary.actionIds=['other'];}
 ]){
  const changed=structuredClone(operation);mutate(changed);const joined=projectWorkflowExecutionHistory('A',persisted,[changed]);
  assert.equal(joined.unlinkedOperationCount,1);assert.deepEqual(joined.nodes.map(node=>node.batches),[[],[]]);
 }
 for(const extra of [{module:''},{blockedReasons:[' '.repeat(3)]},{batchId:42},{blockedReasons:Array(51).fill('too-many')}]){
  assert.throws(()=>f.workflowStore.record('A',{runId:'invalid-trace',workflowId,status:'COMPLETED',trace:[{...trace[0],...extra}]}));
 }
 assert.equal(fs.readFileSync(workflowFile,'utf8'),bytes);
});

test('Console cannot replace a known missing Workflow Store or run the next game operation',async t=>{
 const f=fixture('missing-workflow-store');t.after(()=>f.close());f.ready();f.workflowStore.save('A',{version:1,id:'missing-store',name:'Missing store',nodes:[{id:'start',type:'START'},{id:'action',type:'ACTION',module:'formation',parameters:{presetId:2},selection:{unique:true}},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'action'},{from:'action',to:'stop'}]});
 const prior=await f.request('/api/workflows?account=A');assert.equal(prior.status,200);const bytes=fs.readFileSync(workflowFile,'utf8'),headers={'x-cw-csrf':prior.data.csrfToken};fs.unlinkSync(workflowFile);
 try{
  const missing=await f.request('/api/workflows?account=A');assert.equal(missing.data.code,'WORKFLOW_STORE_UNAVAILABLE');
  const save=await f.request('/api/workflows/save?account=A',{headers,body:{graph:{version:1,id:'replacement',name:'Replacement',nodes:[{id:'s',type:'START'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'z'}]}}});assert.equal(save.data.code,'WORKFLOW_STORE_UNAVAILABLE');
  assert.equal(fs.existsSync(workflowFile),false);assert.deepEqual(f.sent,[]);assert.deepEqual(f.history.list('A'),[]);
 }finally{fs.writeFileSync(workflowFile,bytes);}
 assert.equal((await f.request('/api/workflows?account=A')).status,200);assert.equal(fs.readFileSync(workflowFile,'utf8'),bytes);
});


for(const apply of[true,false])test('unified compilation exclusions survive exact authorized HTTP execution and read-only restart '+apply,async t=>{
 const f=fixture('unified-audit-'+apply);t.after(()=>f.close());
 const first=await f.request('/api/workflows?account=A'),headers={'x-cw-csrf':first.data.csrfToken};
 const input={entry:'loop',id:'unified-audit-'+apply,tasks:[{kind:'orderDaily',taskId:6}],dailies:[{taskId:1001}],world:[{module:'formation',parameters:{presetId:2}}],budget:{resources:[],quotas:[],uids:[]}};
 const compiled=await f.request('/api/workflows/prepare?account=A',{headers,body:input});assert.equal(compiled.status,200,compiled.text);
 const graph=compiled.data.graph,preparation=structuredClone(graph.preparation);assert.equal(preparation.blocked.length,2);assert.deepEqual(f.sent,[]);assert.equal(f.sessions.size,0);
 assert.equal((await f.request('/api/workflows/save?account=A',{headers,body:{graph}})).status,200);
 assert.deepEqual(f.workflowStore.list('A').find(g=>g.id===graph.id).preparation,preparation);
 assert.equal((await f.request('/api/workflows/start?account=A',{headers,body:{graph}})).status,409);assert.deepEqual(f.sent,[]);
 const session=f.ready({apply});assert.equal((await f.request('/api/workflows/start?account=A',{headers,body:{graph}})).status,200);
 const pending=(await waitStatus(f,'AWAITING_AUTHORIZATION')).status;assert.deepEqual(pending.preparation,preparation);
 assert.equal(f.sent.includes('SaveFormationRequest'),false);assert.equal(pending.plan.actions.length,1);
 const changed=structuredClone(graph);changed.preparation.blocked=[];f.workflowStore.save('A',changed);
 const plan=pending.plan,permit=f.operations.authorize(session,{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(a=>a.actionId),resourceBudget:plan.resourceBudget,confirm:true});
 f.operations.execute(session,permit);await f.operations.settle('A');await f.request('/api/workflows/resume?account=A',{headers,body:{}});
 let read;for(let i=0;i<30;i++){read=await f.request('/api/workflows?account=A');if(read.data.status.status===(apply?'COMPLETED':'UNKNOWN'))break;await new Promise(r=>setImmediate(r));}
 assert.equal(read.data.status.status,apply?'COMPLETED':'UNKNOWN',read.text);
 assert.equal(f.sent.filter(n=>n==='SaveFormationRequest').length,1);
 const url=historyUrl('A',pending.runId),before=await f.request(url);assert.deepEqual(before.data.preparation,preparation);assert.equal(before.data.nodes.length,1);
 assert.equal(before.data.nodes[0].batches[0].finalStatus,apply?'SUCCESS':'UNKNOWN');if(apply)assert.match(read.data.status.reason,/未纳入/);
 const bytes=[workflowFile,f.file].map(file=>fs.readFileSync(file,'utf8')),sent=f.sent.slice();
 const restarted=createWorkflowStore({file:workflowFile,modules:f.operations.modules}),saved=restarted.history('A',{runId:pending.runId})[0];
 assert.deepEqual(saved.preparation,preparation);assert.equal(saved.resumable,false);assert.equal(restarted.history('B',{runId:pending.runId}).length,0);
 const projected=projectWorkflowExecutionHistory('A',saved,f.history.list('A'));assert.deepEqual(projected.preparation,preparation);assert.equal(projected.resumable,false);
 assert.equal((await f.request(historyUrl('B',pending.runId))).status,404);assert.deepEqual(f.sent,sent);assert.deepEqual([workflowFile,f.file].map(file=>fs.readFileSync(file,'utf8')),bytes);
 if(!apply){await assert.rejects(f.operations.surveyModule(session,'formation',{presetId:2}));assert.equal(f.sent.filter(n=>n==='SaveFormationRequest').length,1);}
});

test('WAIT HTTP history records start before later actions and cancellation/restart remain read-only',async t=>{
 const f=fixture('wait-start');t.after(()=>f.close());f.ready();
 const headers={'x-cw-csrf':(await f.request('/api/workflows?account=A')).data.csrfToken};
 const graph={version:1,id:'wait-before-business',name:'Wait before business',nodes:[{id:'start',type:'START'},{id:'interval',type:'WAIT',durationMs:60000},{id:'save',type:'ACTION',module:'formation',parameters:{presetId:2},selection:{unique:true}},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'interval'},{from:'interval',to:'save'},{from:'save',to:'stop'}]};
 assert.equal((await f.request('/api/workflows/start?account=A',{headers,body:{graph}})).status,200);
 const state=(await waitStatus(f,'WAITING')).status,url=historyUrl('A',state.runId),before=await f.request(url);
 assert.equal(before.status,200);assert.deepEqual(before.data.nodes,[]);assert.deepEqual(before.data.waits.map(row=>[row.nodeId,row.result,row.durationMs]),[['interval','WAIT_STARTED',60000]]);assert.deepEqual(f.sent,[]);
 const bytes=fs.readFileSync(workflowFile,'utf8'),store=createWorkflowStore({file:workflowFile,modules:f.operations.modules}),recovered=store.history('A',{runId:state.runId})[0];
 assert.equal(recovered.status,'RECOVERED_STOPPED');assert.equal(recovered.resumable,false);assert.equal(fs.readFileSync(workflowFile,'utf8'),bytes);assert.deepEqual(f.sent,[]);
 assert.equal((await f.request('/api/workflows/stop?account=A',{headers,body:{}})).status,200);
 const after=await f.request(url);assert.equal(after.data.status,'CANCELLED');assert.equal(after.data.waits.length,1);assert.deepEqual(f.sent,[]);
});

test('bounded history API retains exact policy and expiry after restart without restoring execution',async t=>{
 const f=fixture('bounded-history');t.after(()=>f.close());const run={accountId:'A',runId:'bounded-historical-run',workflowId:'bounded-flow',status:'AWAITING_AUTHORIZATION',runPolicy:{maxDurationMs:1200,maxActions:2,modules:['formation']},expiresAt:'2026-11-13T03:00:01.200Z',actionPlans:1,trace:[]};f.workflowStore.record('A',run);
 const bytes=fs.readFileSync(workflowFile,'utf8'),result=await f.request(historyUrl('A',run.runId));assert.equal(result.status,200);assert.deepEqual(result.data.runPolicy,run.runPolicy);assert.equal(result.data.expiresAt,run.expiresAt);assert.equal(result.data.actionPlans,1);assert.equal(result.data.status,'RECOVERED_STOPPED');assert.equal(result.data.resumable,false);assert.equal((await f.request(historyUrl('B',run.runId))).status,404);
 const restarted=createWorkflowStore({file:workflowFile,modules:f.operations.modules}),saved=restarted.history('A',{runId:run.runId})[0];assert.deepEqual(projectWorkflowExecutionHistory('A',saved,[]),result.data);assert.deepEqual(f.sent,[]);assert.equal(fs.readFileSync(workflowFile,'utf8'),bytes);assert.equal(f.sessions.size,0);
});
