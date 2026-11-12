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
  function ready() {
    let formation = { presetId: 1, petUid: '9007199254740993', heroPositions: [{ heroId: 'tank', pos: { x: 1, y: 3 } }] };
    const client = new EventEmitter();
    Object.assign(client, { connected: true, pending: [], watchers: [], uncertainWrites: new Set(),
      stop() { this.connected = false; },
      async request(name, body) {
        sent.push(name);
        if (name === 'GetFormationRequest') return { formation: structuredClone(formation) };
        if (name === 'MyFormationPresetRequest') return { ids: [2] };
        if (name === 'AllHeroRequest') return { heroes: [{ heroId: 'tank' }] };
        if (name === 'SaveFormationRequest') { formation = structuredClone(body.formation); return { formation }; }
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
