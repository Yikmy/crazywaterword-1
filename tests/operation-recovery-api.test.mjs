import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-recovery-api-'));
process.env.CW_DATA_DIR = root; process.env.CW_CONFIG_PACK = path.join(root, 'no-config.json');
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const { createExecutionHistory } = await import('../src/execution-history.mjs');
const clone = value => structuredClone(value);
const before = { presetId: 1, heroPositions: [{ heroId: 'h1', pos: { x: 0, y: 1 } }] };
const desired = { presetId: 2, heroPositions: [{ heroId: 'h1', pos: { x: 1, y: 1 } }] };
const scope = { accountId: 'A', playerId: '9007199254740993', worldId: 9, generation: 7, connectionId: 'synthetic-A-connection' };
const account = id => ({ id, label: 'label-' + id, url: 'wss://example.invalid/ws', login: { eworldParams: { openId: id, token: 'synthetic-api-token', sign: 'synthetic-api-sign', timestamp: 1 } } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function harness({ receipt = true } = {}) {
  saveStore({ version: 1, activeId: 'A', accounts: [account('A'), account('B')] });
  const reads = [], writes = [], file = path.join(root, 'history-' + Math.random() + '.json'), history = createExecutionHistory({ file });
  let clients = 0, collections = 0, reply = () => ({ formation: clone(desired) }), csrf;
  const row = { module: 'formation', actionId: 'save-one', actionType: 'SAVE', target: { module: 1, presetId: 2 }, costs: [], beforeState: clone(before), expectedState: clone(desired), requestStatus: 'UNKNOWN', result: 'UNKNOWN', dispatched: true, unresolvedWrite: true, resourceReservation: [],
    ...(receipt ? { verifiedReceipt: { version: 1, verified: true, request: 'SaveFormationRequest', response: 'SaveFormationResponse', module: 1, beforeFacts: { formation: clone(before), reliability: { formation: true } }, expectedState: clone(desired), responseEvidence: { formation: clone(desired) }, executionContext: clone(scope) } } : {}) };
  const record = { accountId: 'A', runId: 'recovery-run', module: 'formation', executionContext: clone(scope), finalStatus: 'UNKNOWN', actions: [row], resourceBudget: [], authorizationSummary: { actionIds: [row.actionId], planHash: 'original-plan', resourceBudget: [] } };
  history.put(record);
  const app = createConsole({ port: 0, protocol: { GetFormationRequest: {}, GetFormationResponse: {} }, tracePath: path.join(root, 'trace-' + Math.random() + '.log'),
    clientFactory: () => { clients++; throw Error('No GameClient or Runtime allocation allowed'); },
    collect: () => { collections++; throw Error('No full state collection allowed'); },
    operationOptions: { history, getConfig: () => null, loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }) } });
  await app.listen();
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const call = (route = '/api/operations', { id = 'A', body, method = body === undefined ? 'GET' : 'POST', authorized = true, headers = {} } = {}) => new Promise((resolve, reject) => {
    const url = new URL(route, origin); if (id !== null) url.searchParams.set('account', id);
    const req = http.request(url, { method, headers: { connection: 'close', 'content-type': 'application/json', ...(authorized ? { origin, ...(csrf ? { 'x-cw-csrf': csrf } : {}) } : {}), ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => { const data = JSON.parse(text); if (data.csrfToken) csrf = data.csrfToken; resolve({ status: res.statusCode, data, text }); });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const ready = (id = 'A') => {
    const client = { connected: true, pending: [], watchers: [], lateResponses: new Set(), uncertainWrites: new Set(['original-write']),
      request(name, body, responseName) { reads.push({ name, body, responseName }); assert.equal(name, 'GetFormationRequest'); assert.deepEqual(body, { module: 1 }); assert.equal(responseName, 'GetFormationResponse'); return Promise.resolve().then(() => reply()); },
      send(...args) { writes.push(args); throw Error('Recovery cannot send business writes'); }, sendWatch(...args) { writes.push(args); throw Error('Recovery cannot watch writes'); }, stop() { this.connected = false; } };
    const session = { id, client, player: { playerId: scope.playerId, worldId: scope.worldId }, state: 'READY', generation: scope.generation, connectionId: scope.connectionId, abort: new AbortController(), busy: null, loop: { running: false, stop: {} }, log: [] };
    app.sessions.set(id, session); return session;
  };
  const preview = (options = {}) => call('/api/operations/recovery/preview', { body: { runId: record.runId, actionId: row.actionId }, ...options });
  const confirm = (shown, options = {}) => call('/api/operations/recovery/confirm', { body: { previewId: shown.previewId, previewHash: shown.previewHash, confirm: true }, ...options });
  return { ...app, call, ready, preview, confirm, history, record, file, reads, writes, origin, counts: () => ({ clients, collections }), reply: fn => { reply = fn; } };
}

test('recovery routes require actual GET-issued CSRF and same-origin before any Runtime allocation or read', async () => {
  const app = await harness();
  try {
    const context = await app.call(); assert.equal(context.status, 200); assert.equal(typeof context.data.csrfToken, 'string');
    const csrf = context.data.csrfToken;
    for (const route of ['/api/operations/recovery/preview', '/api/operations/recovery/confirm']) {
      for (const options of [{ authorized: false }, { authorized: false, headers: { 'x-cw-csrf': csrf } }, { headers: { origin: 'http://invalid.example' } }, { headers: { 'x-cw-csrf': 'forged' } }, { headers: { host: 'attacker.invalid' } }, { headers: { 'sec-fetch-site': 'cross-site' } }]) {
        const denied = await app.call(route, { body: { confirm: true }, ...options }); assert.equal(denied.status, 403);
        assert.equal(app.sessions.size, 0); assert.equal(app.reads.length, 0); assert.equal(app.writes.length, 0); assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
      }
    }
    const disconnected = await app.preview(); assert.equal(disconnected.status, 409); assert.equal(disconnected.data.code, 'NOT_CONNECTED'); assert.equal(app.sessions.size, 0);
  } finally { await app.close(); }
});

test('HTTP preview and confirmation use two fixed readonly requests and append without rewriting UNKNOWN or reservations', async () => {
  const app = await harness();
  try {
    const session = app.ready(); await app.call(); const original = JSON.parse(fs.readFileSync(app.file, 'utf8')).accounts.A[0];
    const shown = await app.preview(); assert.equal(shown.status, 200); assert.equal(shown.data.result.status, 'APPLIED'); assert.equal(app.reads.length, 1); assert.equal(app.history.unresolved('A'), true);
    const result = await app.confirm(shown.data); assert.equal(result.status, 200); assert.equal(result.data.event.status, 'APPLIED'); assert.equal(result.data.status.blocked, false); assert.equal(app.reads.length, 2);
    const saved = JSON.parse(fs.readFileSync(app.file, 'utf8')).accounts.A[0], { reconciliations, ...action } = saved.actions[0];
    assert.deepEqual(action, original.actions[0]); assert.equal(saved.finalStatus, 'UNKNOWN'); assert.deepEqual(saved.resourceBudget, original.resourceBudget); assert.deepEqual(saved.authorization, original.authorization); assert.equal(reconciliations.length, 1);
    assert.equal((await app.confirm(shown.data)).status, 409); assert.equal(session.client.uncertainWrites.has('original-write'), true); assert.equal(app.writes.length, 0); assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});

test('recovery API refuses arbitrary request bodies and another account cannot confirm an A preview', async () => {
  const app = await harness();
  try {
    app.ready(); app.ready('B'); await app.call();
    for (const body of [{ runId: 'recovery-run', actionId: 'save-one', request: 'PayRequest' }, { runId: 'recovery-run', actionId: 'save-one', allowPaid: true }]) {
      const denied = await app.call('/api/operations/recovery/preview', { body }); assert.equal(denied.status, 400); assert.equal(app.reads.length, 0);
    }
    const shown = await app.preview(); assert.equal(shown.status, 200);
    const other = await app.confirm(shown.data, { id: 'B' }); assert.equal(other.status, 409); assert.equal(app.reads.length, 1); assert.equal(app.history.unresolved('A'), true);
    assert.equal((await app.call('/api/operations/recovery/confirm', { body: { previewId: shown.data.previewId, previewHash: shown.data.previewHash, confirm: true, status: 'APPLIED' } })).status, 400);
    assert.equal(app.writes.length, 0);
  } finally { await app.close(); }
});

test('HTTP legacy desired-state match stays STILL_UNKNOWN and does not grant new operations', async () => {
  const app = await harness({ receipt: false });
  try {
    app.ready(); await app.call(); const shown = await app.preview(); assert.equal(shown.status, 200); assert.equal(shown.data.result.status, 'STILL_UNKNOWN');
    const result = await app.confirm(shown.data); assert.equal(result.status, 200); assert.equal(result.data.status.blocked, true); assert.equal(result.data.event.status, 'STILL_UNKNOWN');
    const historical = await app.call('/api/operations/history'); assert.equal(historical.data.runs[0].actions[0].result, 'UNKNOWN');
    assert.equal((await app.call('/api/operations/plan', { body: { module: 'orders', mode: 'Manual', selections: ['anything'] } })).data.code, 'RESPONSE_UNCERTAIN');
    assert.equal(app.reads.length, 2); assert.equal(app.writes.length, 0);
  } finally { await app.close(); }
});

test('recovery HTTP reads participate in the shared account lock and concurrent preview cannot duplicate read', async () => {
  const app = await harness(), gate = deferred();
  try {
    const session = app.ready(); await app.call(); app.reply(() => gate.promise); const first = app.preview();
    for (let attempt = 0; attempt < 100 && app.reads.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(app.reads.length, 1); assert.match(session.busy, /RECOVERY/);
    const conflict = await app.preview(); assert.equal(conflict.status, 409); assert.equal(conflict.data.code, 'ACCOUNT_BUSY'); assert.equal(app.reads.length, 1);
    gate.resolve({ formation: clone(desired) }); assert.equal((await first).status, 200); assert.equal(session.busy, null); assert.equal(app.history.unresolved('A'), true); assert.equal(app.writes.length, 0);
  } finally { gate.resolve({ formation: clone(desired) }); await app.close(); }
});

test('history GET scopes an exact operation run offline and rejects ambiguous filters',async()=>{
 const app=await harness();try{
  app.history.put({...clone(app.record),runId:'another-run'});app.history.put({...clone(app.record),accountId:'B',runId:'foreign-run'});const bytes=fs.readFileSync(app.file,'utf8');
  for(const [id,runId,expected]of [['A','recovery-run',['recovery-run']],['A','another-run',['another-run']],['A','foreign-run',[]],['B','recovery-run',[]],['A','missing',[]]]){
   const result=await app.call('/api/operations/history?'+new URLSearchParams({runId}),{id});assert.equal(result.status,200);assert.equal(result.data.accountId,id);assert.deepEqual(result.data.runs.map(r=>r.runId),expected);
  }
  for(const q of ['runId=','runId=a&runId=b','runId=%20a','runId=a%20','runId='+('x'.repeat(513)),'workflowId=forged','__proto__=x','account=A&account=B'])assert.equal((await app.call('/api/operations/history?'+q,{id:q.startsWith('account=')?null:'A'})).status,400,q);
  assert.equal((await app.call('/api/operations/history')).data.runs.length,2);assert.equal(fs.readFileSync(app.file,'utf8'),bytes);assert.equal(app.history.list('A')[1].actions[0].result,'UNKNOWN');assert.equal(app.sessions.size,0);assert.equal(app.reads.length,0);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
