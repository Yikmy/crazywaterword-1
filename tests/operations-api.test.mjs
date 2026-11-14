import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-operations-api-'));
process.env.CW_DATA_DIR = root; process.env.CW_CONFIG_PACK = path.join(root, 'no-config.json');
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const { createExecutionHistory } = await import('../src/execution-history.mjs');
const account = id => ({ id, label: 'label-' + id, url: 'wss://example.invalid/ws', login: { eworldParams: { openId: id, token: 'synthetic-api-token', sign: 'synthetic-api-sign', timestamp: 1 } } });
const op = { actionId: 'order:one', actionType: 'SUBMIT', target: { index: 0 }, beforeState: { requirements: [{ id: 'wood', num: 2 }] }, costs: [{ id: 'wood', num: 2 }], executable: true, action: { request: 'InternalRequest', body: {} } };
async function harness({ executor, clock, outcome = 'SUCCESS' } = {}) {
  saveStore({ version: 1, activeId: 'A', accounts: [account('A'), account('B')] });
  let surveys = 0, clients = 0, collections = 0; const writes = [];
  const history = createExecutionHistory({ file: path.join(root, 'history-' + Math.random() + '.json') });
  const app = createConsole({ port: 0, protocol: {}, tracePath: path.join(root, 'trace.log'), stageSideResolver: () => 'LEFT',
    clientFactory: () => { clients++; throw Error('No game client allowed'); }, collect: () => { collections++; throw Error('No full collector allowed'); },
    operationOptions: { history, clock, getConfig: () => null, loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }),
      survey: async () => { surveys++; return { stockReliable: true, stock: new Map([['wood', 4]]) }; },
      orderPlanner: (_facts, { ledger, selections }) => ({ rows: [op], actions: (!selections || selections.includes(op.actionId)) && ledger.reserve(op.costs) ? [op] : [] }),
      cityViewer: () => ({ buildings: [], factories: [], candidates: [] }), cityPlanner: () => ({ actions: [] }),
      orderExecute: async (client, protocol, operation, options) => { writes.push(client.id); return executor ? executor(client, options) : { status: outcome, requestStatus: outcome, verification: { status: outcome === 'SUCCESS' ? 'CONFIRMED' : 'UNCONFIRMED' } }; },
    } });
  await app.listen(); const origin = 'http://127.0.0.1:' + app.server.address().port; let csrf;
  const call = (route = '/api/operations', { id = 'A', body, method = body === undefined ? 'GET' : 'POST', headers = {}, authorized = true } = {}) => new Promise((resolve, reject) => {
    const url = new URL(route, origin); if (id !== null) url.searchParams.set('account', id);
    const req = http.request(url, { method, headers: { connection: 'close', 'content-type': 'application/json', ...(authorized ? { origin, ...(csrf ? { 'x-cw-csrf': csrf } : {}) } : {}), ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => { const data = JSON.parse(text); if (data.csrfToken) csrf = data.csrfToken; resolve({ status: res.statusCode, data, text }); });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const ready = id => {
    const client = { id, connected: true, pending: [], watchers: [], uncertainWrites: new Set(), stop() { this.connected = false; } };
    const session = { id, client, state: 'READY', generation: 1, abort: new AbortController(), busy: null, loop: { running: false, stop: {} }, log: [], snapshot: { ok: {}, failed: {} }, snapshotAt: '2026-11-10T00:00:00Z', snapshotStale: false };
    app.sessions.set(id, session); return session;
  };
  const plan = () => call('/api/operations/plan', { body: { module: 'orders', mode: 'Manual', selections: [op.actionId] } });
  const approve = p => call('/api/operations/authorize', { body: { batchId: p.batchId, planHash: p.planHash, approvedActionIds: p.actions.map(action => action.actionId), resourceBudget: p.resourceBudget, confirm: true } });
  const start = async () => { const p = await plan(); assert.equal(p.status, 200); const permit = await approve(p.data); assert.equal(permit.status, 200); return call('/api/operations/execute', { body: permit.data }); };
  return { ...app, history, call, ready, plan, approve, start, origin, writes, counts: () => ({ clients, collections, surveys }) };
}
test('new read routes require exact account and never allocate or connect a runtime', async () => {
  const app = await harness();
  try {
    for (const route of ['/api/operations', '/api/operations/history']) for (const id of [null, 'label-A', 'unknown', '1']) assert.equal((await app.call(route, { id })).status, id === null ? 400 : 404);
    const state = await app.call(); assert.equal(state.status, 200); assert.equal(state.data.view, null); assert.ok(state.data.csrfToken);
    assert.deepEqual((await app.call('/api/operations/history')).data.runs, []); assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { clients: 0, collections: 0, surveys: 0 });
    assert.equal((await app.plan()).data.code, 'NOT_CONNECTED');
  } finally { await app.close(); }
});
test('confirm alone, missing or forged CSRF, cross origin and forged Host are rejected before survey or mutation', async () => {
  const app = await harness();
  try {
    app.ready('A'); await app.call();
    for (const options of [{ authorized: false }, { headers: { 'x-cw-csrf': 'forged' } }, { headers: { origin: 'https://example.invalid' } }, { headers: { host: 'attacker.invalid' } }, { headers: { 'sec-fetch-site': 'cross-site' } }, { headers: { 'content-type': 'text/plain' } }]) assert.equal((await app.call('/api/operations/survey', { body: { confirm: true }, ...options })).status, 403);
    assert.equal(app.counts().surveys, 0); assert.equal(app.writes.length, 0);
    assert.equal((await app.call('/api/operations', { headers: { origin: 'https://example.invalid' } })).status, 403);
  } finally { await app.close(); }
});
test('narrow survey/plan/authorize/execute/history flow persists evidence and never opens old write routes', async () => {
  const app = await harness();
  try {
    app.ready('A'); await app.call();
    const survey = await app.call('/api/operations/survey', { body: {} }); assert.equal(survey.status, 200); assert.equal(survey.data.view.orders.length, 1);
    assert.equal(survey.data.view.orders[0].action, undefined);
    const plan = await app.plan(); assert.equal(plan.status, 200); assert.equal(plan.data.accountId, 'A');
    assert.equal((await app.call('/api/operations/execute', { body: { batchId: plan.data.batchId, confirm: true } })).status, 400);
    const permit = await app.approve(plan.data); assert.equal(permit.status, 200);
    const started = await app.call('/api/operations/execute', { body: permit.data }); assert.equal(started.status, 200); await app.operations.settle('A');
    assert.equal(app.writes.length, 1); assert.equal((await app.call()).data.status.finalStatus, 'SUCCESS');
    assert.equal((await app.call('/api/operations/execute', { body: permit.data })).status, 403);
    const history = await app.call('/api/operations/history?runId=' + started.data.runId); assert.equal(history.data.runs.length, 1); assert.equal(history.data.runs[0].actions[0].verification.status, 'CONFIRMED');
    assert.deepEqual((await app.call('/api/operations/history', { id: 'B' })).data.runs, []);
    for (const route of ['/api/world/run', '/api/actions/finishOrder', '/api/orders/refresh', '/api/operations/request', '/api/loot']) assert.equal((await app.call(route, { body: { confirm: true } })).status, 403);
    assert.deepEqual(app.counts(), { clients: 0, collections: 0, surveys: 2 });
  } finally { await app.close(); }
});
test('Stage and full collection conflict with operations while cached browsing stays available', async () => {
  let resolve; const gate = new Promise(yes => { resolve = yes; }); const app = await harness({ executor: async () => { await gate; return { status: 'SUCCESS', requestStatus: 'SUCCESS' }; } });
  try {
    const session = app.ready('A'); await app.call();
    session.stageRunner = { getStatus: () => ({ running: true }), stop() {} };
    assert.equal((await app.plan()).data.code, 'ACCOUNT_BUSY'); session.stageRunner = null;
    const started = await app.start(); assert.equal(started.status, 200);
    const stage = await app.call('/api/stages/start', { body: { confirm: true, config: { enabled: true, retryDelaySeconds: 10, maxAttempts: 1, maxStage: null } } }); assert.equal(stage.status, 409); assert.equal(stage.data.code, 'ACCOUNT_BUSY');
    assert.equal((await app.call('/api/refresh', { body: {} })).status, 409);
    for (const route of ['/api/operations', '/api/operations/history', '/api/data-explorer', '/api/snapshot/export']) assert.equal((await app.call(route)).status, 200);
    assert.equal((await app.call('/api/operations/stop', { body: {} })).status, 200);
    resolve(); await app.operations.settle('A'); assert.equal(app.writes.length, 1); assert.equal(app.counts().collections, 0);
  } finally { resolve(); await app.close(); }
});
test('UNKNOWN history continues to block Stage and new batches after client/session replacement', async () => {
  const app = await harness({ outcome: 'UNKNOWN' });
  try {
    app.ready('A'); await app.call(); await app.start(); await app.operations.settle('A'); app.ready('A');
    assert.equal((await app.call()).data.status.blocked, true); assert.equal((await app.plan()).data.code, 'RECOVERY_UNCERTAIN');
    const stage = await app.call('/api/stages/start', { body: { confirm: true, config: { enabled: true, retryDelaySeconds: 10, maxAttempts: 1, maxStage: null } } }); assert.equal(stage.data.code, 'RECOVERY_UNCERTAIN'); assert.equal(app.writes.length, 1);
  } finally { await app.close(); }
});
test('strict operation inputs cannot inject Action, paid options or substitute another account batch', async () => {
  const app = await harness();
  try {
    app.ready('A'); app.ready('B'); await app.call(); const plan = await app.plan(); const permit = await app.approve(plan.data);
    assert.equal((await app.call('/api/operations/execute', { id: 'B', body: permit.data })).status, 409);
    for (const extra of [{ request: 'BuyRubyRequest' }, { allowPaid: true }, { body: { cost: 0 } }]) assert.equal((await app.call('/api/operations/plan', { body: { module: 'orders', mode: 'Manual', selections: [op.actionId], ...extra } })).status, 400);
    assert.equal((await app.call('/api/operations/survey', { body: { request: 'Anything' } })).status, 400); assert.equal(app.writes.length, 0);
  } finally { await app.close(); }
});
test('disconnect cancels operation context and an old authorization cannot attach to a replacement Session', async () => {
  const app = await harness();
  try {
    app.ready('A'); await app.call(); const plan = await app.plan(); const permit = await app.approve(plan.data);
    assert.equal((await app.call('/api/disconnect', { body: {} })).status, 200); app.ready('A');
    assert.equal((await app.call('/api/operations/execute', { body: permit.data })).data.code, 'CANCELLED'); assert.equal(app.writes.length, 0);
  } finally { await app.close(); }
});

test('production policy settings are account-local, strict, CSRF gated and invalidate already approved plans', async () => {
  const app = await harness();
  try {
    await app.call(); const defaults = await app.call('/api/operations/production-policy'); assert.equal(defaults.status, 200); assert.equal(defaults.data.config.enabled, false);
    const config = { version: 1, enabled: true, onlyShortages: true, productIds: ['bread'], maxOperations: 2 };
    assert.equal((await app.call('/api/operations/production-policy', { body: { config }, authorized: false })).status, 403);
    assert.equal((await app.call('/api/operations/production-policy', { body: { config: { ...config, allowPaid: true } } })).status, 400);
    app.ready('A'); const plan = await app.plan(); const permit = await app.approve(plan.data);
    const saved = await app.call('/api/operations/production-policy', { body: { config } }); assert.equal(saved.status, 200); assert.deepEqual(saved.data.config, config);
    assert.equal((await app.call('/api/operations/production-policy', { id: 'B' })).data.config.enabled, false);
    assert.equal((await app.call('/api/operations/execute', { body: permit.data })).status, 409); assert.equal(app.writes.length, 0);
    const daily = (await app.call('/api/operations/history')).data.dailyReport; assert.equal(daily.coverage, 'tool-verified-only'); assert.equal(daily.totalGameProduction, null);
  } finally { await app.close(); }
});


test('production coverage API reads durable account gaps offline without clients, surveys, collection or permit allocation', async () => {
  const timestamp='2026-11-10T04:00:00Z', app=await harness({clock:()=>Date.parse(timestamp)});
  const row={actionId:'collect',actionType:'gainFactory',requestStatus:'UNKNOWN',result:'UNKNOWN',verification:{status:'UNCONFIRMED'},timestamp};
  try {
    app.history.put({accountId:'A',runId:'unresolved-production',module:'city',finalStatus:'UNKNOWN',actions:[row]});
    const before=fs.readFileSync(app.history.storagePath,'utf8');
    for(const route of ['/api/operations/history','/api/operations/history?runId=not-found']) {
      const response=await app.call(route); assert.equal(response.status,200);
      assert.equal(response.data.dailyReport.coverageDetails.unresolvedOperations,1);
      assert.equal(response.data.dailyReport.coverageDetails.fullDayCoverage,false);
      assert.equal(response.data.dailyReport.totalGameProduction,null); assert.deepEqual(response.data.dailyReport.collected,[]);
    }
    assert.equal((await app.call('/api/operations/history',{id:'B'})).data.dailyReport.coverageDetails.unresolvedOperations,0);
    assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),before);
    assert.equal(app.sessions.size,0); assert.equal(app.writes.length,0); assert.deepEqual(app.counts(),{clients:0,collections:0,surveys:0});
  } finally { await app.close(); }
});


test('production history API selects a valid calendar date without filtering away account gaps or opening a runtime', async () => {
  const app=await harness({clock:()=>Date.parse('2026-11-14T04:00:00Z')});
  try {
    const action={actionId:'historical-start',actionType:'startProduce',result:'SUCCESS',requestStatus:'SUCCESS',verification:{status:'CONFIRMED'},timestamp:'2026-11-09T16:05:00Z'};
    app.history.put({accountId:'A',runId:'dated',module:'city',finalStatus:'SUCCESS',actions:[action]});
    const response=await app.call('/api/operations/history?date=2026-11-10&runId=missing');assert.equal(response.status,200);
    assert.equal(response.data.dailyReport.date,'2026-11-10');assert.equal(response.data.dailyReport.startedOperations,1);assert.deepEqual(response.data.runs,[]);
    assert.equal(response.data.dailyReport.coverageDetails.gameDayKnown,false);assert.equal(response.data.dailyReport.totalGameProduction,null);
    assert.equal((await app.call('/api/operations/history')).data.dailyReport.date,'2026-11-14');
    assert.equal((await app.call('/api/operations/history?date=2026-11-10',{id:'B'})).data.dailyReport.startedOperations,0);
    for(const query of ['date=','date=2026-02-30','date=2026-11-10&date=2026-11-11','date=2026-11-10&timeZone=UTC','date=2026-11-10T00:00:00Z','date=%202026-11-10']) {
      const denied=await app.call('/api/operations/history?'+query);assert.equal(denied.status,400,query);assert.equal(denied.data.code,'INVALID_INPUT');
    }
    assert.equal(app.sessions.size,0);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0,surveys:0});
  }finally{await app.close();}
});


test('crop supply settings use original exact-account CSRF API and never allocate a runtime or grant a production permit', async()=>{
  const app=await harness();try{
    await app.call();const config={version:1,enabled:true,onlyShortages:true,productIds:[],maxOperations:3,cropSupply:{enabled:true,cropCap:250,seedReserve:8,maxSurplusPerRecipe:3}};
    assert.equal((await app.call('/api/operations/production-policy',{body:{config},authorized:false})).status,403);
    const saved=await app.call('/api/operations/production-policy',{body:{config}});assert.equal(saved.status,200);assert.deepEqual(saved.data.config,config);
    assert.deepEqual((await app.call('/api/operations/production-policy')).data.config,config);assert.equal((await app.call('/api/operations/production-policy',{id:'B'})).data.config.cropSupply,undefined);
    for(const changed of [{...config,onlyShortages:false},{...config,cropSupply:{...config.cropSupply,seedReserve:101}},{...config,cropSupply:{...config.cropSupply,allowPaid:true}}])assert.equal((await app.call('/api/operations/production-policy',{body:{config:changed}})).status,400);
    const denied=await app.call('/api/operations/execute',{body:{confirm:true}});assert.equal(denied.status,409);assert.equal(denied.data.code,'NOT_CONNECTED');
    assert.equal(app.sessions.size,0);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0,surveys:0});
  }finally{await app.close();}
});
