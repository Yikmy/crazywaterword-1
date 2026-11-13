import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetManifest } from '../src/asset-readiness.mjs';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Only synthetic credentials, fake clients and loopback HTTP are used.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-runtime-test-'));
process.env.CW_DATA_DIR = sandbox;
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const token = 'synthetic-token-never-use-in-game';
const sign = 'synthetic-sign-never-use-in-game';
const frame = 'feedface1234567890abcdef';
const credential = (id) => ({ id, label: id, url: 'wss://example.invalid/ws', login: { eworldParams: { openId: id, token, sign, timestamp: 1 } }, loginFrameHex: frame });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 5)); } throw Error('condition not reached'); }
const snapshot = () => ({ ok: { AllItemRequest: { items: [] }, AllHeroRequest: { heroes: [] }, AllResourceRequest: { resources: [] } }, failed: {}, outcomes: {} });

class FakeClient extends EventEmitter {
  constructor(gate) { super(); this.gate = gate; this.state = 'IDLE'; this.connected = false; this.connectCalls = 0; this.stopCalls = 0; this.pending = []; this.socket = null; this.timer = null; }
  async connect(login) {
    this.connectCalls++; this.login = login;
    this.state = 'CONNECTING'; this.socket = { open: true }; this.timer = setInterval(() => {}, 60000);
    this.emit('state', { state: 'CONNECTING' });
    const response = this.gate ? await this.gate.promise : { result: 0, playerInfo: { nickname: login.eworldParams.openId, level: 7 } };
    this.connected = true; this.state = 'READY'; this.emit('state', { state: 'READY' }); return response;
  }
  stop() {
    this.stopCalls++; this.connected = false; this.state = 'STOPPED';
    if (this.socket) this.socket.open = false;
    this.socket = null; clearInterval(this.timer); this.timer = null;
    for (const item of this.pending.splice(0)) item.reject?.(Error('stopped'));
    this.emit('state', { state: 'STOPPED' });
  }
  request() { throw Error('unexpected live game request'); }
  expire(state) { this.connected = false; this.state = state; this.emit('state', { state, detail: 'synthetic terminal condition' }); }
}

async function harness({ assetRoot, writerOwnership, connectGate, connectImpl, collect = async () => snapshot() } = {}) {
  saveStore({ version: 1, activeId: 'account-A', accounts: [credential('account-A'), credential('account-B')] });
  const clients = []; let collects = 0;
  const app = createConsole({ ...(assetRoot?{assetRoot}:{}), ...(writerOwnership ? { writerOwnership } : {}), port: 0, protocol: {}, tracePath: path.join(sandbox, 'trace.log'), clientFactory: () => { const client = new FakeClient(connectGate); if (connectImpl) client.connect = connectImpl; clients.push(client); return client; }, collect: async (...args) => { collects++; return collect(...args); } });
  await app.listen(); const port = app.server.address().port;
  function call(route, { method = 'GET', account = 'account-A', body } = {}) {
    const url = new URL(route, 'http://127.0.0.1:' + port); if (account) url.searchParams.set('account', account);
    return new Promise((resolve, reject) => {
      const req = http.request(url, { method, headers: { connection: 'close', 'content-type': 'application/json' } }, (res) => {
        let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => text += chunk);
        res.on('end', () => { try { resolve({ status: res.statusCode, text, data: JSON.parse(text) }); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  return { ...app, clients, call, get collects() { return collects; }, connect: (account = 'account-A') => call('/api/connect', { method: 'POST', account }), refresh: (account = 'account-A') => call('/api/refresh', { method: 'POST', account }) };
}
function cleaned(client) {
  assert.equal(client.socket, null); assert.equal(client.timer, null); assert.equal(client.pending.length, 0);
  assert.equal(client.connected, false); assert.equal(client.listenerCount('state'), 0); assert.ok(client.stopCalls >= 1);
}

test('same-account HTTP connects create one Runtime and one login', async () => {
  const gate = deferred(); const app = await harness({ connectGate: gate });
  try {
    const requests = Array.from({ length: 8 }, () => app.connect());
    await until(() => app.clients.length === 1 && app.clients[0].connectCalls === 1); await flush();
    gate.resolve({ result: 0, playerInfo: { nickname: 'A' } });
    for (const result of await Promise.all(requests)) assert.equal(result.status, 200);
    assert.equal(app.clients.length, 1); assert.equal(app.clients[0].connectCalls, 1); assert.equal(app.sessions.get('account-A').state, 'READY');
    assert.equal((await app.connect()).status, 200); assert.equal(app.clients[0].connectCalls, 1);
  } finally { await app.close(); }
});
test('same-account refresh is single-flight; polling reads snapshot only', async () => {
  const gate = deferred(); const app = await harness({ collect: () => gate.promise });
  try {
    await app.connect(); const refreshes = Array.from({ length: 6 }, () => app.refresh()); await until(() => app.collects === 1);
    for (let i = 0; i < 3; i++) assert.equal((await app.call('/api/overview')).data.snapshotStatus, 'NOT_COLLECTED');
    assert.equal(app.collects, 1); gate.resolve(snapshot());
    for (const response of await Promise.all(refreshes)) assert.equal(response.status, 200);
    const a = await app.call('/api/overview'); const b = await app.call('/api/overview');
    assert.equal(a.data.updatedAt, b.data.updatedAt); assert.equal(app.collects, 1); assert.equal(a.data.accountId, 'account-A');
  } finally { await app.close(); }
});
test('A and B collect independently in parallel and never share results', async () => {
  const gates = new Map([['account-A', deferred()], ['account-B', deferred()]]);
  const app = await harness({ collect: (client) => gates.get(client.login.eworldParams.openId).promise });
  try {
    assert.equal((await app.connect()).status, 200); assert.equal((await app.connect('account-B')).status, 200);
    const a = app.refresh(); const b = app.refresh('account-B'); await until(() => app.collects === 2); assert.equal(app.clients.length, 2);
    gates.get('account-B').resolve({ ...snapshot(), ok: { AllItemRequest: { items: [{ itemId: 2, num: 20 }] } } });
    assert.equal((await b).data.accountId, 'account-B'); assert.equal(app.sessions.get('account-A').snapshot, null);
    gates.get('account-A').resolve({ ...snapshot(), ok: { AllItemRequest: { items: [{ itemId: 1, num: 10 }] } } });
    assert.equal((await a).data.accountId, 'account-A');
    assert.equal(app.sessions.get('account-A').snapshot.ok.AllItemRequest.items[0].itemId, 1);
    assert.equal(app.sessions.get('account-B').snapshot.ok.AllItemRequest.items[0].itemId, 2);
  } finally { await app.close(); }
});
test('manual disconnect prevents overview polling and refresh from logging in again', async () => {
  const app = await harness();
  try {
    await app.connect(); await app.refresh(); assert.equal((await app.call('/api/disconnect', { method: 'POST' })).status, 200); cleaned(app.clients[0]);
    for (let i = 0; i < 4; i++) { const result = await app.call('/api/overview'); assert.equal(result.data.status.state, 'STOPPED'); assert.equal(result.data.status.connected, false); assert.equal(result.data.snapshotStale, true); }
    assert.equal((await app.refresh()).status, 409); assert.equal(app.clients.length, 1); assert.equal(app.collects, 1);
  } finally { await app.close(); }
});
test('deletion cancels collection and late completion cannot republish state', async () => {
  const gate = deferred(); const app = await harness({ collect: () => gate.promise });
  try {
    await app.connect(); const session = app.sessions.get('account-A'); session.loop.running = true;
    const refresh = app.refresh(); await until(() => app.collects === 1);
    assert.equal((await app.call('/api/accounts/remove', { method: 'POST', body: { id: 'account-A', confirm: true } })).status, 200);
    assert.equal((await refresh).status, 400); cleaned(app.clients[0]);
    assert.equal(session.loop.running, false); assert.equal(session.loop.stop.aborted, true); assert.equal(session.connectionPromise, null); assert.equal(session.collectionPromise, null);
    gate.resolve(snapshot()); await flush(); assert.equal(session.snapshot, null); assert.equal(app.sessions.has('account-A'), false);
    assert.equal((await app.call('/api/overview')).status, 400); assert.equal((await app.call('/api/overview', { account: 'account-B' })).data.accountId, 'account-B');
  } finally { await app.close(); }
});
test('deletion cancels login and late login cannot resurrect Runtime', async () => {
  const gate = deferred(); const app = await harness({ connectGate: gate });
  try {
    const login = app.connect(); await until(() => app.clients.length === 1 && app.clients[0].connectCalls === 1); const client = app.clients[0];
    await app.call('/api/accounts/remove', { method: 'POST', body: { id: 'account-A', confirm: true } }); assert.equal((await login).status, 400); cleaned(client);
    gate.resolve({ result: 0, playerInfo: { nickname: 'late-A' } }); await flush(); assert.equal(app.sessions.has('account-A'), false);
  } finally { await app.close(); }
});
test('terminal events synchronize HTTP state and cancel resources', async () => {
  for (const terminal of ['FAILED', 'EXPIRED', 'CLOSED', 'REJECTED']) {
    const app = await harness();
    try {
      await app.connect(); app.clients[0].expire(terminal); const result = await app.call('/api/accounts'); const status = result.data.accounts.find((entry) => entry.id === 'account-A').status;
      assert.equal(status.state, terminal); assert.equal(status.connected, false); cleaned(app.clients[0]); assert.equal((await app.call('/api/overview')).data.status.state, terminal);
      assert.equal((await app.refresh()).status, 409); assert.equal(app.clients.length, 1);
    } finally { await app.close(); }
  }
});
test('failed query remains unknown, never successful zero inventory', async () => {
  const app = await harness({ collect: async () => ({ ok: {}, failed: { AllItemRequest: 'synthetic timeout', AllHeroRequest: 'synthetic denied' }, outcomes: { AllItemRequest: { status: 'FAILED', error: 'synthetic timeout' } } }) });
  try {
    await app.connect(); const response = await app.refresh(); assert.equal(response.status, 200); assert.equal(response.data.snapshotStatus, 'FAILED');
    assert.equal(response.data.items.total, null); assert.equal(response.data.heroes.count, null); assert.equal(response.data.failed.AllItemRequest, 'synthetic timeout');
    assert.equal(response.data.outcomes.AllItemRequest.status, 'FAILED'); assert.notEqual((await app.call('/api/heroes')).status, 200);
  } finally { await app.close(); }
});
test('whitelist blocks mutation and capture routes even with confirm=true', async () => {
  const app = await harness();
  try {
    for (const route of ['/api/heroes/run', '/api/dailies/run', '/api/tasks/run', '/api/world/run', '/api/worlds/enter', '/api/loop/start', '/api/capture/start', '/api/capture/stop', '/api/unknown']) {
      const response = await app.call(route, { method: 'POST', body: { confirm: true, worldId: 1 } }); assert.equal(response.status, 403, route); assert.equal(response.data.code, 'READ_ONLY_ROUTE');
    }
    assert.equal(app.clients.length, 0); assert.equal(app.collects, 0); await app.connect(); await app.refresh(); assert.equal(app.collects, 1);
  } finally { await app.close(); }
});
test('JSON, log, trace and export redact recursive credentials and secret substrings', async () => {
  const raw = { ...snapshot(), extra: { nested: [{ Token: token, SIGN: sign, authorization: 'Bearer ' + token, loginFrameHex: frame }], message: 'rejected ' + token + ' / ' + sign } };
  const app = await harness({ collect: async () => raw });
  try {
    await app.connect(); await app.refresh(); const client = app.clients[0]; client.emit('warn', 'upstream ' + token + ' ' + sign);
    client.emit('message', { seq: 1, name: 'SyntheticResponse', body: raw.extra });
    const session = app.sessions.get('account-A'); app.emit(session, 'info', 'log ' + token, raw.extra);
    for (const value of [token, sign, frame]) assert.equal(JSON.stringify(session.log).includes(value), false);
    for (const route of ['/api/snapshot/export', '/api/accounts/credential?reveal=1', '/api/accounts']) { const response = await app.call(route); assert.equal(response.status, 200); for (const value of [token, sign, frame]) assert.equal(response.text.includes(value), false, route); }
    await app.call('/api/accounts/remove', { method: 'POST', body: { id: 'account-A', confirm: true } }); app.emit(null, 'warn', 'late ' + token);
    await app.close(); const trace = fs.readFileSync(path.join(sandbox, 'trace.log'), 'utf8'); for (const value of [token, sign, frame]) assert.equal(trace.includes(value), false);
  } finally { await app.close(); }
});
test('close cancels all Runtime resources and rejects active work', async () => {
  const gate = deferred(); const app = await harness({ collect: () => gate.promise });
  await app.connect(); await app.connect('account-B'); const refresh = app.refresh(); await until(() => app.collects === 1);
  const closing = app.close(); assert.equal((await refresh).status, 400); await closing;
  for (const client of app.clients) cleaned(client); assert.equal(app.sessions.size, 0); gate.resolve(snapshot()); await flush(); assert.equal(app.sessions.size, 0); await app.close();
});
test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

test('synchronous login failure is observed even when state event aborts the session', async () => {
  const app = await harness({ connectImpl() { this.state = 'FAILED'; this.emit('state', { state: 'FAILED' }); return Promise.reject(Error('synthetic encode failure')); } });
  try { const result = await app.connect(); assert.equal(result.status, 400); await flush(); assert.equal(app.sessions.get('account-A').state, 'FAILED'); }
  finally { await app.close(); }
});
test('close rejects already accepted requests and concurrent close shares completion', async () => {
  const app = await harness();
  try {
    const request = http.request({ host: '127.0.0.1', port: app.server.address().port, path: '/api/accounts', method: 'GET', headers: { connection: 'close', 'content-length': '2' } });
    const response = new Promise((resolve, reject) => { request.on('response', (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); request.on('error', reject); });
    request.flushHeaders();
    await until(() => app.server._connections > 0); await flush();
    const first = app.close(); const second = app.close(); assert.equal(first, second); request.end('{}');
    assert.equal(await response, 503); await first; assert.equal(app.sessions.size, 0);
  } finally { await app.close(); }
});
test('reconnect cannot be overwritten by an old collection finishing late', async () => {
  const old = deferred(); let count = 0;
  const app = await harness({ collect: () => ++count === 1 ? old.promise : { ...snapshot(), marker: 'new' } });
  try {
    await app.connect(); const stale = app.refresh(); await until(() => app.collects === 1);
    await app.call('/api/disconnect', { method: 'POST' }); assert.equal((await stale).status, 400);
    await app.connect(); await app.refresh(); old.resolve({ ...snapshot(), marker: 'old' }); await flush();
    assert.equal(app.sessions.get('account-A').snapshot.marker, 'new'); assert.equal(app.sessions.get('account-A').state, 'READY');
    assert.equal(app.clients.length, 2); cleaned(app.clients[0]);
  } finally { await app.close(); }
});

test('cached detail reads never send game requests; absent daily probes stay unknown', async () => {
  const data = { ok: { DailyTaskInfoRequest: { dailyTask: [{ id: 1005, progress: 0, targetProgress: 1 }] }, AllItemRequest: { items: [] }, AllResourceRequest: { list: [] }, AfkInfoRequest: {}, RecruitInfoRequest: {} }, failed: { ArenaInfoRequest: 'not collected' }, outcomes: {} };
  const app = await harness({ collect: async () => data });
  try {
    await app.connect(); await app.refresh();
    const response = await app.call('/api/dailies'); assert.equal(response.status, 200);
    assert.equal(response.data.tasks[0].status, 'unknown'); assert.match(response.data.tasks[0].reason, /ArenaInfoRequest/);
    assert.deepEqual(response.data.tasks[0].actions, []); assert.equal(app.collects, 1);
    for (const route of ['/api/world', '/api/heroes', '/api/tasks']) assert.notEqual((await app.call(route)).status, 200);
    const overview = await app.call('/api/overview'); assert.equal(overview.data.claimable.email, null); assert.equal(overview.data.claimable.mainTask, null);
  } finally { await app.close(); }
});
test('SSE output is valid framed JSON and redacts credentials', { timeout: 5000 }, async () => {
  const app = await harness();
  try {
    const events = new Promise((resolve, reject) => {
      const request = http.get('http://127.0.0.1:' + app.server.address().port + '/api/events?account=account-A', (response) => {
        response.once('data', (chunk) => { resolve(chunk.toString()); response.destroy(); });
      }); request.on('error', reject);
    });
    await until(() => app.server._connections > 0); await flush();
    app.emit(null, 'warn', 'synthetic ' + token, { nested: { Sign: sign } });
    const payload = await events; assert.ok(payload.endsWith('\n\n')); const parsed = JSON.parse(payload.slice(6).trim());
    assert.equal(payload.includes(token), false); assert.equal(payload.includes(sign), false); assert.equal(parsed.level, 'warn');
  } finally { await app.close(); }
});

test('runtime HTTP server error cancels sessions but retains writer ownership until all execution settles', async () => {
  let owned = false, releases = 0;
  const writerOwnership = { claim() { owned = true; return true; }, assertOwned() { assert.equal(owned, true); return true; }, release() { owned = false; releases++; return true; } };
  const app = await harness({ writerOwnership });
  const gate = deferred();
  try {
    await app.connect(); app.operations.settle = () => gate.promise;
    app.server.emit('error', Object.assign(Error('synthetic runtime failure'), { code: 'EIO' }));
    assert.equal(app.clients[0].connected, false); assert.equal(releases, 0); assert.equal(owned, true);
    const closing = app.close(); await flush();
    assert.equal(releases, 0, 'active execution keeps unique writer until settled');
    gate.resolve(); await closing;
    assert.equal(releases, 1); assert.equal(owned, false);
  } finally { gate.resolve(); await app.close(); }
});

test('fixed offline asset HTTP reports exact missing or changed files without connecting or accepting a path override',async()=>{
 const assetRoot=fs.mkdtempSync(path.join(os.tmpdir(),'cw-runtime-assets-http-'));let app;try{
 const relative='work/cdn/config_cn_pack.json',asset=path.join(assetRoot,relative);fs.mkdirSync(path.dirname(asset),{recursive:true});fs.writeFileSync(asset,JSON.stringify([[1,'ResourceCfg',{data:[]}]]));
 const manifest=createAssetManifest({root:assetRoot,assets:[{id:'synthetic-config',role:'config',path:relative,source:'synthetic retained config'}]});fs.mkdirSync(path.join(assetRoot,'docs'));const manifestFile=path.join(assetRoot,'docs','RUNTIME_ASSETS.json'),bytes=JSON.stringify(manifest);fs.writeFileSync(manifestFile,bytes);
 app=await harness({assetRoot});const report=await app.call('/api/assets/readiness',{account:null});assert.equal(report.status,200);assert.equal(report.data.ready,true);assert.equal(report.data.recovery[0].expectedSha256,manifest.assets[0].sha256);
 fs.writeFileSync(asset,JSON.stringify([[1,'ResourceCfg',{data:[{id:'changed'}]}]]));assert.equal((await app.call('/api/assets/readiness')).data.assets[0].reason,'ASSET_HASH_MISMATCH');fs.unlinkSync(asset);assert.equal((await app.call('/api/assets/readiness')).data.assets[0].reason,'ASSET_MISSING');
 for(const query of ['?root=C:/Users','?path=data/accounts.json','?manifest=other.json','?account=A&account=B'])assert.equal((await app.call('/api/assets/readiness'+query,{account:null})).status,400);
 assert.equal((await app.call('/api/assets/readiness',{method:'POST',body:{restore:true}})).status,403);assert.equal(fs.readFileSync(manifestFile,'utf8'),bytes);assert.equal(app.clients.length,0);assert.equal(app.collects,0);assert.equal(app.sessions.size,0);for(const secret of [token,sign,frame,assetRoot])assert.equal(report.text.includes(secret),false);
 fs.writeFileSync(manifestFile,'{bad');const invalid=await app.call('/api/assets/readiness');assert.equal(invalid.status,200);assert.equal(invalid.data.reason,'MANIFEST_INVALID_OR_UNREADABLE');assert.equal(invalid.text.includes(assetRoot),false);
 }finally{await app?.close();assert.equal(path.dirname(path.resolve(assetRoot)),path.resolve(os.tmpdir()));fs.rmSync(assetRoot,{recursive:true,force:true});}
});
