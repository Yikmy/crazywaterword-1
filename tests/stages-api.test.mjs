import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-stages-api-'));
process.env.CW_DATA_DIR = sandbox;
process.env.CW_CONFIG_PACK = path.join(sandbox, 'no-config.json');
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const token = 'synthetic-stages-token', sign = 'synthetic-stages-sign';
const credential = id => ({ id, label: 'label-' + id, url: 'wss://example.invalid/ws', login: { eworldParams: { openId: id, token, sign, timestamp: 1 } } });
const config = extra => ({ enabled: true, retryDelaySeconds: 10, maxAttempts: null, maxStage: null, ...extra });
const response = (stage, win = true) => ({ initialData: { mainlineStage: stage }, stats: { isLeftWin: win } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class FakeClient extends EventEmitter {
  constructor() { super(); this.connected = false; this.state = 'IDLE'; this.requests = []; this.pending = []; this.watchers = []; }
  async connect(login) { this.connected = true; this.state = 'READY'; this.emit('state', { state: 'READY' }); return { playerInfo: { nickname: login.eworldParams.openId, mainlineStage: 41 } }; }
  request(name, body, responseName) {
    assert.equal(name, 'ChallengeStageRequest'); assert.equal(responseName, 'ChallengeStageResponse');
    const gate = deferred(); const item = { name, body, ...gate }; this.requests.push(item); this.pending.push(item);
    return gate.promise.finally(() => { this.pending = this.pending.filter(entry => entry !== item); });
  }
  stop() { this.connected = false; this.state = 'STOPPED'; this.emit('state', { state: 'STOPPED' }); this.rejectPending(); }
  rejectPending() { for (const entry of this.pending.splice(0)) entry.reject?.(Object.assign(new Error('synthetic connection stopped'), { code: 'CANCELLED' })); }
  expire(state) { this.connected = false; this.state = state; this.emit('state', { state }); this.rejectPending(); }
}
async function harness({ side = () => 'LEFT', collect, productionSide = false, stageClock } = {}) {
  saveStore({ version: 1, activeId: 'A', accounts: [credential('A'), credential('B')] });
  const clients = []; let collections = 0;
  const app = createConsole({ port: 0, protocol: { ChallengeStageRequest: {}, ChallengeStageResponse: {} },
    ...(productionSide ? {} : { stageSideResolver: side }), stageClock, tracePath: path.join(sandbox, 'trace.log'),
    clientFactory: () => { const client = new FakeClient(); clients.push(client); return client; },
    collect: (...args) => { collections++; return collect ? collect(...args) : { ok: {}, failed: {} }; } });
  await app.listen();
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const rawCall = (route, { id = 'A', method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const url = new URL(route, 'http://127.0.0.1:' + app.server.address().port);
    if (id !== null) url.searchParams.set('account', id);
    const req = http.request(url, { method, headers: { connection: 'close', 'content-type': 'application/json', ...headers } }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text), text }));
    });
    req.on('error', reject); req.end(method === 'GET' || body === undefined ? undefined : JSON.stringify(body));
  });
  // Exercise the public read-before-write flow; never substitute a hard-coded CSRF token.
  const call = async (route, options = {}) => {
    if (options.method !== 'POST' || !['/api/stages/start', '/api/stages/stop'].includes(route)) return rawCall(route, options);
    const context = await rawCall('/api/stages', { id: options.id === undefined ? 'A' : options.id });
    const headers = { origin, ...(context.data.csrfToken ? { 'x-cw-csrf': context.data.csrfToken } : {}), ...options.headers };
    return rawCall(route, { ...options, headers });
  };
  const connect = id => call('/api/connect', { id, method: 'POST', body: {} });
  const start = (id = 'A', extra = {}) => call('/api/stages/start', { id, method: 'POST', body: { confirm: true, config: config(extra) } });
  const stop = id => call('/api/stages/stop', { id, method: 'POST', body: {} });
  return { ...app, clients, origin, rawCall, call, connect, start, stop, get collections() { return collections; } };
}

test('production side gap blocks before Runtime allocation or game request; HTTP cannot supply a side resolver', async () => {
  const app = await harness({ side: null });
  try {
    const read = await app.call('/api/stages');
    assert.equal(read.status, 200); assert.equal(read.data.available, false); assert.match(read.data.unavailableReason, /SIDE_UNVERIFIED/);
    assert.equal(app.sessions.size, 0); assert.equal(app.clients.length, 0);
    const result = await app.start();
    assert.equal(result.status, 409); assert.equal(result.data.code, 'SIDE_UNVERIFIED'); assert.equal(app.sessions.size, 0);
    await app.connect('A');
    const forged = await app.call('/api/stages/start', { method: 'POST', body: { confirm: true, playerSide: 'LEFT', resolvePlayerSide: 'LEFT', config: config() } });
    assert.equal(forged.status, 400); assert.match(forged.data.error, /未知字段/); assert.equal(app.clients[0].requests.length, 0);
  } finally { await app.close(); }
});
test('all stages routes require exact account IDs without allocating sessions', async () => {
  const app = await harness();
  try {
    for (const route of ['/api/stages', '/api/stages/start', '/api/stages/stop']) {
      for (const id of [null, 'label-A', '1', 'unknown']) {
        const result = await app.call(route, { id, method: route.endsWith('stages') ? 'GET' : 'POST', body: {} });
        assert.equal(result.status, id === null ? 400 : 404);
      }
    }
    assert.equal(app.sessions.size, 0); assert.equal(app.clients.length, 0);
  } finally { await app.close(); }
});
test('start needs confirmation, enabled config and an existing READY connection', async () => {
  const app = await harness();
  try {
    const denied = await app.call('/api/stages/start', { method: 'POST', body: { config: config() } });
    assert.equal(denied.status, 400); assert.match(denied.data.error, /确认/);
    assert.equal((await app.start('A', { enabled: false })).status, 409);
    assert.equal((await app.start()).data.code, 'NOT_CONNECTED');
    assert.equal(app.clients.length, 0); assert.equal(app.sessions.size, 0);
    await app.connect('A');
    const bad = await app.start('A', { maxAttempts: 0 }); assert.equal(bad.status, 400);
    assert.equal(app.clients[0].requests.length, 0);
  } finally { await app.close(); }
});
test('authorized start is single-flight; battle blocks full collection while cache browsing remains available', async () => {
  const app = await harness();
  try {
    await app.connect('A'); const session = app.sessions.get('A');
    session.snapshot = { ok: {}, failed: {}, outcomes: {} }; session.snapshotAt = '2026-11-10T00:00:00Z';
    assert.equal((await app.start('A', { maxAttempts: 1 })).status, 200);
    assert.equal((await app.start()).status, 409);
    assert.equal(app.clients[0].requests.length, 1);
    const full = await app.call('/api/refresh', { method: 'POST' }); assert.equal(full.status, 409);
    for (const route of ['/api/stages', '/api/overview', '/api/data-explorer', '/api/snapshot/export']) assert.equal((await app.call(route)).status, 200);
    assert.equal(app.collections, 0); assert.equal(app.clients[0].requests.length, 1);
    app.clients[0].requests[0].resolve(response(41));
    await session.stageRunner.completion;
    const done = (await app.call('/api/stages')).data.runner;
    assert.equal(done.stopKind, 'COMPLETED'); assert.equal(done.attempts, 1); assert.equal(done.lastResult.outcome, 'SUCCESS');
    assert.equal(session.snapshotStale, true); assert.equal(done.nextStage, 42);
  } finally { await app.close(); }
});
test('collection in progress prevents stage start without a battle request', async () => {
  const gate = deferred(); const app = await harness({ collect: () => gate.promise });
  try {
    await app.connect('A');
    const read = app.call('/api/refresh', { method: 'POST' });
    for (let i = 0; i < 30 && app.collections === 0; i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(app.collections, 1); assert.equal((await app.start()).data.code, 'ACCOUNT_BUSY');
    assert.equal(app.clients[0].requests.length, 0);
    gate.resolve({ ok: {}, failed: {} }); assert.equal((await read).status, 200);
  } finally { gate.resolve({ ok: {}, failed: {} }); await app.close(); }
});
test('A and B run independently with isolated results and neither starts another Runtime', async () => {
  const app = await harness();
  try {
    await app.connect('A'); await app.connect('B');
    assert.ok((await Promise.all([app.start('A', { maxAttempts: 1 }), app.start('B', { maxAttempts: 1 })])).every(r => r.status === 200));
    assert.equal(app.clients.length, 2);
    app.clients[0].requests[0].resolve(response(41, true)); app.clients[1].requests[0].resolve(response(41, false));
    await Promise.all([...app.sessions.values()].map(s => s.stageRunner.completion));
    assert.equal((await app.call('/api/stages')).data.runner.lastResult.outcome, 'SUCCESS');
    assert.equal((await app.call('/api/stages', { id: 'B' })).data.runner.lastResult.outcome, 'FAILED');
  } finally { await app.close(); }
});
test('stop retains old battle lock and late responses cannot populate a new run; explicit reconnect permits fresh state', async () => {
  const app = await harness();
  try {
    await app.connect('A'); await app.start();
    const oldSession = app.sessions.get('A'), old = oldSession.stageRunner, first = app.clients[0];
    const runId = old.getStatus().runId;
    await app.stop('A'); assert.equal(old.getStatus().stopKind, 'USER'); assert.equal(old.getStatus().uncertain, true);
    assert.equal((await app.start()).status, 409); assert.equal(first.requests.length, 1);
    first.requests[0].resolve(response(41)); await tick(); await tick();
    assert.equal(old.getStatus().lastResult, null); assert.equal(old.getStatus().runId, runId);
    assert.equal((await app.start()).status, 409);
    await app.call('/api/disconnect', { method: 'POST' }); await app.connect('A');
    assert.equal((await app.start('A', { maxAttempts: 1 })).status, 200);
    const fresh = app.sessions.get('A').stageRunner;
    assert.notEqual(fresh.getStatus().runId, runId);
    app.clients[1].requests[0].resolve(response(41)); await fresh.completion;
    assert.equal(fresh.getStatus().attempts, 1);
  } finally { await app.close(); }
});
test('disconnect, account expiry and deletion cancel the runner and remove its client listeners', async () => {
  for (const terminal of ['disconnect', 'EXPIRED', 'delete']) {
    const app = await harness();
    try {
      await app.connect('A'); await app.start();
      const session = app.sessions.get('A'), runner = session.stageRunner, client = app.clients[0];
      if (terminal === 'disconnect') await app.call('/api/disconnect', { method: 'POST' });
      else if (terminal === 'delete') await app.call('/api/accounts/remove', { method: 'POST', body: { id: 'A', confirm: true } });
      else client.expire('EXPIRED');
      await runner.completion;
      assert.equal(runner.getStatus().running, false); assert.equal(runner.getStatus().state, 'STOPPED');
      assert.equal(client.listenerCount('state'), 0); assert.equal(client.listenerCount('error'), 0);
      client.requests[0].resolve(response(41)); await tick();
      assert.equal(runner.getStatus().lastResult, null);
      if (terminal === 'delete') assert.equal(app.sessions.has('A'), false);
    } finally { await app.close(); }
  }
});
test('decode errors and ambiguous prompts stop immediately with no retry', async () => {
  for (const event of ['error', 'promptAmbiguous']) {
    const app = await harness();
    try {
      await app.connect('A'); await app.start();
      const runner = app.sessions.get('A').stageRunner, client = app.clients[0];
      client.emit(event, Error('synthetic decode or prompt problem'));
      await runner.completion;
      assert.equal(runner.getStatus().stopKind, 'ERROR'); assert.equal(client.requests.length, 1);
      client.requests[0].resolve(response(41)); await tick();
      assert.equal(runner.getStatus().lastResult, null);
    } finally { await app.close(); }
  }
});
test('server shutdown cancels all stage runtimes; old game write routes stay forbidden', async () => {
  const app = await harness();
  await app.connect('A'); await app.start();
  const runner = app.sessions.get('A').stageRunner, client = app.clients[0];
  for (const route of ['/api/world/run', '/api/dailies/run', '/api/act', '/api/loop/start', '/api/orders/refresh']) {
    assert.equal((await app.call(route, { method: 'POST', body: { confirm: true } })).status, 403);
  }
  await app.close(); await runner.completion;
  assert.equal(runner.getStatus().running, false); assert.equal(client.listenerCount('state'), 0);
  client.requests[0].resolve(response(41)); await tick();
  assert.equal(runner.getStatus().lastResult, null);
});
test('stage status and errors remain recursively redacted', async () => {
  const app = await harness();
  try {
    await app.connect('A'); await app.start();
    const runner = app.sessions.get('A').stageRunner;
    app.clients[0].requests[0].reject(Error('synthetic rejection token=' + token + ' sign=' + sign));
    await runner.completion;
    const result = await app.call('/api/stages');
    assert.equal(result.text.includes(token), false); assert.equal(result.text.includes(sign), false);
    assert.equal(result.data.runner.stopKind, 'ERROR');
  } finally { await app.close(); }
});

test('world-list requests are blocked during a battle including active-account and alias selection', async () => {
  const app = await harness();
  try {
    await app.connect('A'); await app.start();
    for (const id of ['A', null, 'label-A']) {
      const read = await app.call('/api/worlds', { id });
      assert.equal(read.status, 409); assert.equal(read.data.code, 'STAGE_BUSY');
    }
    assert.equal(app.clients[0].requests.length, 1);
  } finally { await app.close(); }
});
test('every restart of an existing runner rejects unrelated pending or uncertain client requests', async () => {
  const app = await harness();
  try {
    await app.connect('A'); await app.start('A', { maxAttempts: 1 });
    const session = app.sessions.get('A'), client = app.clients[0];
    client.requests[0].resolve(response(41)); await session.stageRunner.completion;
    const checks = [
      () => { client.pending.push({ name: 'GameWorldListRequest' }); return () => { client.pending = []; }; },
      () => { client.watchers.push({ name: 'synthetic-watch' }); return () => { client.watchers = []; }; },
      () => { client.promptUncertain = true; return () => { client.promptUncertain = false; }; },
      () => { client.lateResponses = new Set(['GameWorldListResponse']); return () => { client.lateResponses.clear(); }; },
    ];
    for (const setup of checks) {
      const clear = setup();
      const result = await app.start('A', { maxAttempts: 1 });
      assert.equal(result.status, 409); assert.equal(result.data.code, 'RESPONSE_UNCERTAIN');
      clear(); assert.equal(client.requests.length, 1);
    }
    assert.equal((await app.start('A', { maxAttempts: 1 })).status, 200);
    assert.equal(client.requests[1].body.stage, 42);
    client.requests[1].resolve(response(42)); await session.stageRunner.completion;
  } finally { await app.close(); }
});


test('production default exposes only accepted mainline evidence without allocating a Runtime or granting writes', async () => {
  const app = await harness({ productionSide: true });
  try {
    const read = await app.call('/api/stages');
    assert.equal(read.status, 200); assert.equal(read.data.available, true);
    assert.equal(read.data.battleMode, 'MAINLINE_CHALLENGE');
    assert.equal(read.data.sideAuthorization.playerSide, 'LEFT');
    assert.equal(read.data.sideAuthorization.requestName, 'ChallengeStageRequest');
    assert.equal(read.data.sideAuthorization.responseName, 'ChallengeStageResponse');
    assert.equal(read.data.sideAuthorization.battleType, 1);
    assert.equal(read.data.sideAuthorization.acceptedIn, 'STEP 4-B1');
    assert.match(read.data.sideAuthorization.evidenceSha256, /^[a-f0-9]{64}$/);
    assert.equal(app.sessions.size, 0); assert.equal(app.clients.length, 0);
    assert.equal((await app.start()).data.code, 'NOT_CONNECTED');
    const unconfirmed = await app.call('/api/stages/start', { method: 'POST', body: { config: config() } });
    assert.equal(unconfirmed.status, 400); assert.equal(app.clients.length, 0);
    const otherMode = await app.start('A', { battleMode: 'ARENA' });
    assert.equal(otherMode.status, 400); assert.equal(app.clients.length, 0);
  } finally { await app.close(); }
});

test('production mainline adapter uses existing READY Session and refuses a concurrent same-account start', async () => {
  const app = await harness({ productionSide: true });
  try {
    await app.connect('A');
    const session = app.sessions.get('A'), generation = session.generation;
    assert.equal((await app.start('A', { maxAttempts: 1 })).status, 200); await tick();
    const duplicate = await app.start();
    assert.equal(duplicate.status, 409); assert.equal(duplicate.data.code, 'RESPONSE_UNCERTAIN');
    assert.equal(app.clients.length, 1); assert.equal(app.clients[0].requests.length, 1);
    app.clients[0].requests[0].resolve({ initialData: { mainlineStage: 41, battleType: 1 }, stats: { isLeftWin: true } });
    await session.stageRunner.completion;
    const read = await app.call('/api/stages');
    assert.equal(read.data.runner.lastResult.outcome, 'SUCCESS');
    assert.equal(read.data.runner.lastResult.playerSide, 'LEFT');
    assert.equal(read.data.runner.stopKind, 'COMPLETED');
    assert.equal(app.sessions.get('A'), session); assert.equal(session.generation, generation);
    assert.equal(app.collections, 0);
  } finally { await app.close(); }
});

test('production response with unknown or missing battle mode stops rather than retrying or inheriting mainline mapping', async () => {
  for (const battleType of [undefined, 2, 999, '1']) {
    const app = await harness({ productionSide: true });
    try {
      await app.connect('A'); await app.start(); await tick();
      const initialData = { mainlineStage: 41, ...(battleType === undefined ? {} : { battleType }) };
      app.clients[0].requests[0].resolve({ initialData, stats: { isLeftWin: false } });
      await app.sessions.get('A').stageRunner.completion;
      const read = await app.call('/api/stages');
      assert.equal(read.data.runner.stopKind, 'ERROR'); assert.equal(read.data.runner.error.code, 'SIDE_UNVERIFIED');
      assert.equal(read.data.runner.consecutiveFailures, 0); assert.equal(read.data.runner.retryAt, null);
      assert.equal(app.clients[0].requests.length, 1);
    } finally { await app.close(); }
  }
});


test('B4 stage defaults advertise ten-to-eleven second pacing without allocating a Runtime', async()=>{
 const app=await harness();try {
  const read=await app.call('/api/stages');assert.equal(read.status,200);assert.deepEqual(read.data.defaults.interStageDelay,{minSeconds:10,maxSeconds:11});assert.equal(read.data.runner.nextStageAt,null);assert.equal(app.sessions.size,0);assert.equal(app.clients.length,0);
 } finally {await app.close();}
});

test('B4 cooldown retains the account Runner lock and cached browsing until local stop cancels its timer', async()=>{
 let next=0;const timers=new Map();
 const stageClock={now:()=>0,setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 const app=await harness({stageClock});try {
  await app.connect('A');await app.start('A',{interStageDelay:{minSeconds:10,maxSeconds:11}});await tick();
  const runner=app.sessions.get('A').stageRunner;app.clients[0].requests[0].resolve(response(41));await tick();
  const read=await app.call('/api/stages');assert.equal(read.data.runner.state,'WAIT_NEXT_STAGE');assert.equal(read.data.runner.running,true);assert.equal(read.data.runner.inFlight,false);assert.ok(read.data.runner.nextStageAt>=10000&&read.data.runner.nextStageAt<=11000);assert.equal(timers.size,1);
  const duplicate=await app.start('A',{interStageDelay:{minSeconds:10,maxSeconds:11}});assert.equal(duplicate.status,409);assert.equal(duplicate.data.code,'STAGE_BUSY');assert.equal(app.clients[0].requests.length,1);
  const refresh=await app.call('/api/refresh',{method:'POST'});assert.equal(refresh.status,409);assert.equal((await app.call('/api/data-explorer')).status,200);
  await app.stop('A');await runner.completion;assert.equal(timers.size,0);assert.equal(runner.getStatus().nextStageAt,null);assert.equal(app.clients[0].requests.length,1);
 } finally {await app.close();}
});


test('Stage start and stop require same-origin and the actual GET-issued CSRF context before allocating any Runtime', async () => {
  const app = await harness();
  try {
    const context = await app.rawCall('/api/stages');
    assert.equal(context.status, 200); assert.equal(typeof context.data.csrfToken, 'string'); assert.ok(context.data.csrfToken.length > 0);
    assert.equal(app.sessions.size, 0); assert.equal(app.clients.length, 0);
    const csrf = context.data.csrfToken;
    const cases = [
      { headers: { 'x-cw-csrf': csrf }, code: 'CSRF_REQUIRED' },
      { headers: { origin: 'http://cross-site.invalid', 'x-cw-csrf': csrf }, code: 'ORIGIN_REQUIRED' },
      { headers: { origin: app.origin }, code: 'CSRF_REQUIRED' },
      { headers: { origin: app.origin, 'x-cw-csrf': 'invalid-csrf' }, code: 'CSRF_REQUIRED' },
      { headers: { origin: app.origin, 'x-cw-csrf': csrf, 'sec-fetch-site': 'cross-site' }, code: 'ORIGIN_REQUIRED' },
      { headers: { origin: app.origin, 'x-cw-csrf': csrf, 'content-type': 'text/plain' }, code: 'CSRF_REQUIRED' },
    ];
    for (const route of ['/api/stages/start', '/api/stages/stop']) {
      for (const denied of cases) {
        const result = await app.rawCall(route, { method: 'POST', body: route.endsWith('start') ? { confirm: true, config: config() } : {}, headers: denied.headers });
        assert.equal(result.status, 403); assert.equal(result.data.code, denied.code);
        assert.equal(app.sessions.size, 0); assert.equal(app.clients.length, 0); assert.equal(app.collections, 0);
      }
    }
  } finally { await app.close(); }
});

test('Stage unknown payload fields are rejected after a real CSRF read and before any Runtime or battle request', async () => {
  const app = await harness();
  try {
    for (const body of [{ confirm: true, config: config(), playerSide: 'LEFT' }, { confirm: true, config: config(), resolvePlayerSide: 'LEFT' }, { confirm: true, config: config(), request: 'BuyFixtureRequest' }]) {
      const denied = await app.call('/api/stages/start', { method: 'POST', body });
      assert.equal(denied.status, 400); assert.match(denied.data.error, /未知字段/);
      assert.equal(app.sessions.size, 0); assert.equal(app.clients.length, 0);
    }
    const stop = await app.call('/api/stages/stop', { method: 'POST', body: { confirm: true } });
    assert.equal(stop.status, 400); assert.equal(app.sessions.size, 0); assert.equal(app.clients.length, 0);
    await app.connect('A');
    const session = app.sessions.get('A'), client = app.clients[0];
    const connected = await app.call('/api/stages/start', { method: 'POST', body: { confirm: true, config: config(), playerSide: 'LEFT' } });
    assert.equal(connected.status, 400); assert.equal(app.sessions.get('A'), session); assert.equal(app.clients.length, 1); assert.equal(client.requests.length, 0);
  } finally { await app.close(); }
});
