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
const { saveStore, loadStore, ACCOUNTS_PATH } = await import('../src/accounts.mjs');
const {GameClient,readActivityDirectorySnapshot}=await import('../src/client.mjs'),{loadProtocol}=await import('../src/proto.mjs'),{createCodec}=await import('../src/codec.mjs');
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

async function harness({ assetRoot, writerOwnership, connectGate, connectImpl, clientFactory, operationOptions = {}, protocol = {}, collect = async () => snapshot() } = {}) {
  saveStore({ version: 1, activeId: 'account-A', accounts: [credential('account-A'), credential('account-B')] });
  const clients = []; let collects = 0;
  const app = createConsole({ operationOptions, ...(assetRoot?{assetRoot}:{}), ...(writerOwnership ? { writerOwnership } : {}), port: 0, protocol, tracePath: path.join(sandbox, 'trace.log'), clientFactory: (options) => { const client = clientFactory ? clientFactory(options) : new FakeClient(connectGate); if (connectImpl) client.connect = connectImpl; clients.push(client); return client; }, collect: async (...args) => { collects++; return collect(...args); } });
  await app.listen(); const port = app.server.address().port;
  function call(route, { method = 'GET', account = 'account-A', body, headers = {}, rawBody } = {}) {
    const url = new URL(route, 'http://127.0.0.1:' + port); if (account) url.searchParams.set('account', account);
    return new Promise((resolve, reject) => {
      const req = http.request(url, { method, headers: { connection: 'close', 'content-type': 'application/json', ...headers } }, (res) => {
        let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => text += chunk);
        res.on('end', () => { try { resolve({ status: res.statusCode, text, data: JSON.parse(text) }); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.end(rawBody === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : rawBody);
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
  const app = await harness({ collect: async () => data, connectImpl: async function(login) { const response=await FakeClient.prototype.connect.call(this,login); return {...response,playerInfo:{...response.playerInfo,playerId:'17',worldId:'9'}}; } });
  try {
    await app.connect(); await app.refresh();
    const response = await app.call('/api/dailies'); assert.equal(response.status, 200);
    assert.equal(response.data.tasks[0].status, 'unknown'); assert.match(response.data.tasks[0].reason, /ArenaInfoRequest/);
    assert.deepEqual(response.data.tasks[0].actions, []); assert.equal(app.collects, 1);
    for (const route of ['/api/world', '/api/heroes']) assert.notEqual((await app.call(route)).status, 200);
    const tasks=await app.call('/api/tasks');assert.equal(tasks.status,200);assert.equal(tasks.data.readOnly,true);assert.equal(tasks.data.executable,false);assert.deepEqual(tasks.data.plan,[]);assert.ok(Object.values(tasks.data.sources).every(row=>row.status==='UNKNOWN'));
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

test('trusted explicit player levels publish to the current Session before consumers and invalidate old snapshots only',async()=>{
 const protocol=loadProtocol(),codec=createCodec(protocol),sockets=[];class Socket{constructor(){this.readyState=0;sockets.push(this);}send(){}close(){this.readyState=3;}open(){this.readyState=1;this.onopen();}receive(name,body,seq=0){this.onmessage?.({data:codec.encode(name,seq,body)});}}
 const app=await harness({protocol,clientFactory:options=>new GameClient({...options,WebSocketImpl:Socket})});try{const connecting=app.connect();await until(()=>sockets.length===1);const socket=sockets[0];socket.open();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:'17',worldId:'9',level:1,nickname:'synthetic-player'}});assert.equal((await connecting).status,200);const session=app.sessions.get('account-A'),client=app.clients[0];clearInterval(client.tickTimer);client.tickTimer=null;await app.refresh();assert.equal(session.snapshotStale,false);client.readPlayerLevelEvent=()=>({reliable:true,playerLevel:99});client.emit('message',{name:'SCPlayerExpUpdate',seq:1,body:{level:99}});assert.equal(session.player.level,1);assert.equal(session.snapshotStale,false);socket.receive('SCPlayerLevelGrade',{level:99,grade:1},1);assert.equal(session.player.level,1);let observed;client.on('message',message=>{if(message.name==='SCPlayerExpUpdate')observed=session.player.level;});socket.receive('SCPlayerExpUpdate',{level:3,exp:'9007199254740993'},2);assert.equal(observed,3);assert.equal(session.player.level,3);assert.equal(session.snapshotStale,true);assert.equal((await app.call('/api/overview')).data.player.level,3);assert.equal(app.collects,1);socket.receive('SCPlayerExpUpdate',{level:99},2);assert.equal(session.player.level,3);session.player.worldId='10';socket.receive('SCPlayerExpUpdate',{level:4},3);assert.equal(session.player.level,3);session.player.worldId='9';session.generation++;socket.receive('SCPlayerExpUpdate',{level:5},4);assert.equal(session.player.level,3);assert.equal(app.clients.length,1);assert.equal(app.collects,1);
 }finally{await app.close();}
});

function dailyRuntimeSnapshot(marker=1780000000) {
 const bodies={...snapshot().ok,
  DailyTaskInfoRequest:{dailyTask:[{id:1001,progress:1,targetProgress:1,rewardClaimed:false}],dailyActivity:40,weeklyActivity:85,dailyRewardClaimed:[],weeklyRewardClaimed:[],dailyResetTime:marker},
  DailyGiftPackRequest:{boughtPack:[],drawnPack:[],heroId:'synthetic-hero',resetTime:marker},
  AchievementInfoRequest:{task:[{id:1,progress:'1',targetProgress:'1',rewardClaimed:false}]},
  AfkInfoRequest:{clickGoldInfo:{freeTimes:0,paidTimes:0,resetTime:marker,minGold:1}},RecruitInfoRequest:{}};
 return {ok:structuredClone(bodies),raw:structuredClone(bodies),failed:{},outcomes:Object.fromEntries(Object.keys(bodies).map(name=>[name,{status:'SUCCESS'}]))};
}
async function dailyRuntimeHarness(options={}) {
 const protocol=loadProtocol(),codec=createCodec(protocol),sockets=[],sent=[],observation={marker:1780000000};
 class Socket{
  constructor(){this.readyState=0;sockets.push(this);}
  send(bytes){sent.push(codec.decode(bytes).name);}
  close(){this.readyState=3;}
  open(){this.readyState=1;this.onopen();}
  receive(name,body,seq=0){this.onmessage?.({data:codec.encode(name,seq,body)});}
 }
 const app=await harness({protocol,collect:async()=>dailyRuntimeSnapshot(observation.marker),...options,clientFactory:opts=>new GameClient({...opts,WebSocketImpl:Socket})});
 async function login(account='account-A'){
  const count=sockets.length,connecting=app.connect(account);await until(()=>sockets.length===count+1);
  const socket=sockets.at(-1);socket.open();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:account==='account-A'?'17':'18',worldId:options.worldId??'9',level:1,nickname:'synthetic-player'}});
  assert.equal((await connecting).status,200);const client=app.clients.at(-1);clearInterval(client.tickTimer);client.tickTimer=null;return socket;
 }
 return {...app,sockets,sent,login,observation,get collects(){return app.collects;}};
}
test('daily reset invalidates only the old daily source without changing raw facts or collecting automatically',async()=>{
 const app=await dailyRuntimeHarness();try{
  const socket=await app.login();await app.refresh();const session=app.sessions.get('account-A'),raw=JSON.stringify(session.snapshot),sent=app.sent.length;
  const before=(await app.call('/api/dailies')).data;assert.equal(before.checklist.tasks.counts.eligible,1);
  socket.receive('SCDailyTaskReset',{dailyResetTime:1780086400},1);
  const after=(await app.call('/api/dailies')).data;
  assert.equal(after.checklist.sources.daily.status,'UNKNOWN');assert.equal(after.checklist.tasks.counts.eligible,null);assert.equal(after.checklist.activity.daily.activity,null);assert.equal(after.checklist.resetMarker,null);
  assert.equal(after.stale,true);assert.deepEqual(after.tasks,[]);assert.equal(after.chests,null);assert.match(after.chestsUnavailable,/重新采集/);
  for(const key of ['gift','achievements','freeGold'])assert.deepEqual(after.checklist[key],before.checklist[key]);
  assert.equal(JSON.stringify(session.snapshot),raw);assert.equal(app.collects,1);assert.equal(app.sent.length,sent);
  await app.refresh();assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'UNKNOWN','old response marker stays invalid after refresh');
  app.observation.marker=1780086400;await app.refresh();assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'AVAILABLE');assert.equal(session.snapshotStale,false);assert.equal(app.collects,3);
 }finally{await app.close();}
});
test('daily reset during collection cannot publish the raced daily source as fresh',async()=>{
 const gate=deferred();let collecting=false;const app=await dailyRuntimeHarness({collect:async()=>{collecting=true;return gate.promise;}});
 try{
  const socket=await app.login(),refresh=app.refresh();await until(()=>collecting);
  socket.receive('SCDailyTaskReset',{dailyResetTime:1780086400},1);gate.resolve(dailyRuntimeSnapshot());
  assert.equal((await refresh).status,200);const daily=(await app.call('/api/dailies')).data;
  assert.equal(daily.stale,true);assert.equal(daily.checklist.sources.daily.status,'UNKNOWN');assert.equal(app.sessions.get('account-A').snapshotStale,true);assert.equal(app.collects,1);
 }finally{gate.resolve(dailyRuntimeSnapshot());await app.close();}
});
test('forged daily events and unrelated pushes cannot invalidate or renew daily cache authority',async()=>{
 const app=await dailyRuntimeHarness();try{
  const socket=await app.login();await app.refresh();const client=app.clients[0];
  client.readDailyResetEvent=()=>({reliable:true,cursor:99,event:{seq:1,dailyResetTime:1780086400}});
  client.emit('message',{name:'SCDailyTaskReset',seq:1,body:{dailyResetTime:1780086400}});
  socket.receive('SCPlayerExpUpdate',{level:1},1);
  assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'AVAILABLE');
  socket.receive('SCDailyTaskReset',{dailyResetTime:1780086400},2);app.observation.marker=1780086400;await app.refresh();
  socket.receive('SCDailyTaskReset',{dailyResetTime:1780086400},3);
  assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'AVAILABLE');assert.equal(app.sessions.get('account-A').snapshotStale,false);
 }finally{await app.close();}
});
for(const [label,mutate]of[
 ['account',s=>s.id='account-B'],['role',s=>s.player.playerId='18'],['world',s=>s.player.worldId='10'],
 ['connection',s=>s.connectionId='other'],['generation',s=>s.generation++]
])test('daily cache fails closed after '+label+' context changes',async()=>{
 const app=await dailyRuntimeHarness();try{
  await app.login();await app.refresh();mutate(app.sessions.get('account-A'));
  const daily=(await app.call('/api/dailies')).data;assert.equal(daily.checklist.sources.daily.status,'UNKNOWN');assert.equal(daily.stale,true);assert.equal(app.collects,1);
 }finally{await app.close();}
});
test('daily cache cannot recover from rollback or sequence gaps through a plain refresh',async()=>{
 for(const gap of [false,true]){
  const app=await dailyRuntimeHarness();try{
   const socket=await app.login();socket.receive('SCDailyTaskReset',{dailyResetTime:1780086400},1);app.observation.marker=1780086400;await app.refresh();
   socket.receive('SCDailyTaskReset',{dailyResetTime:gap?1780172800:1780000000},gap?3:2);
   assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'UNKNOWN');
   await app.refresh();assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'UNKNOWN');assert.equal(app.sessions.get('account-A').snapshotStale,true);
  }finally{await app.close();}
 }
});
test('daily reset remains account isolated and old connections cannot renew the cache',async()=>{
 const app=await dailyRuntimeHarness();try{
  const old=await app.login();await app.refresh();await app.login('account-B');await app.refresh('account-B');
  old.receive('SCDailyTaskReset',{dailyResetTime:1780086400},1);
  assert.equal((await app.call('/api/dailies',{account:'account-B'})).data.checklist.sources.daily.status,'AVAILABLE');
  await app.call('/api/disconnect',{method:'POST'});assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'UNKNOWN');
  await app.login();old.receive('SCDailyTaskReset',{dailyResetTime:1780172800},2);
  assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'UNKNOWN');
  await app.refresh();assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'AVAILABLE');assert.equal(app.clients.length,3);
 }finally{await app.close();}
});

for(const [name,body]of[
 ['SCDailyTaskUpdate',{task:{id:1001,progress:2,targetProgress:2,rewardClaimed:false}}],
 ['SCDailyWeeklyReset',{}]
])test('daily cache invalidates on accepted '+name+' without turning it into a scheduled reset',async()=>{
 const app=await dailyRuntimeHarness();try{
  const socket=await app.login();await app.refresh();const raw=JSON.stringify(app.sessions.get('account-A').snapshot),sent=app.sent.length;
  app.clients[0].emit('message',{name,body,seq:1});
  assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'AVAILABLE');
  socket.receive(name,body,1);
  const after=(await app.call('/api/dailies')).data;assert.equal(after.checklist.sources.daily.status,'UNKNOWN');assert.equal(after.stale,true);assert.equal(after.checklist.gift.status,'ELIGIBLE');
  assert.equal(JSON.stringify(app.sessions.get('account-A').snapshot),raw);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
  await app.refresh();assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'AVAILABLE');
  socket.receive(name,body,1);assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'AVAILABLE','duplicate frame was not accepted');
 }finally{await app.close();}
});
for(const [name,body]of[['SCDailyTaskUpdate',{task:{id:1001}}],['SCDailyWeeklyReset',{}]])
test('daily source remains unknown when '+name+' races collection',async()=>{
 const gate=deferred(),app=await dailyRuntimeHarness({collect:()=>gate.promise});
 try{const socket=await app.login(),refresh=app.refresh();await until(()=>app.collects===1);socket.receive(name,body,1);gate.resolve(dailyRuntimeSnapshot());assert.equal((await refresh).status,200);assert.equal((await app.call('/api/dailies')).data.checklist.sources.daily.status,'UNKNOWN');}
 finally{gate.resolve(dailyRuntimeSnapshot());await app.close();}
});


async function importContext(app) {
  const response = await app.call('/api/accounts', { account: null });
  return { origin: 'http://127.0.0.1:' + app.server.address().port, 'x-cw-csrf': response.data.csrfToken };
}
test('explicit local import persists synthetic credentials without connection, overwrite, switch or raw frame', async () => {
  const app = await harness();
  try {
    const headers = await importContext(app);
    const response = await app.call('/api/accounts/import', { method: 'POST', account: null, headers, body: { confirm: true, credential: credential('account-C'), label: 'Imported' } });
    assert.equal(response.status, 201); assert.equal(response.data.account.id, 'account-C');
    assert.equal(app.clients.length, 0); assert.equal(app.collects, 0);
    const stored = loadStore(); assert.equal(stored.activeId, 'account-A'); assert.equal(stored.accounts.length, 3);
    const added = stored.accounts.find(a => a.id === 'account-C');
    assert.equal(added.source, 'local-import'); assert.equal(added.label, 'Imported'); assert.equal(added.loginFrameHex, null);
    assert.equal(added.login.eworldParams.token, token);
    for (const secret of [token, sign, frame]) assert.ok(!response.text.includes(secret));
    const before = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
    const duplicate = await app.call('/api/accounts/import', { method: 'POST', account: null, headers, body: { confirm: true, credential: credential('account-C') } });
    assert.equal(duplicate.status, 409); assert.equal(duplicate.data.code, 'ACCOUNT_EXISTS'); assert.equal(fs.readFileSync(ACCOUNTS_PATH, 'utf8'), before);
    await app.close();
    const restarted = createConsole({ port: 0, protocol: {}, tracePath: path.join(sandbox, 'import-restart.log'), clientFactory: () => { throw Error('must not connect'); } });
    try { await restarted.listen(); assert.equal(loadStore().accounts.find(a => a.id === 'account-C').label, 'Imported'); assert.equal(restarted.sessions.size, 0); }
    finally { await restarted.close(); }
  } finally { await app.close(); }
});
test('empty-store import accepts existing wsUrl/body envelope and only sets a local default', async () => {
  const app = await harness();
  try {
    saveStore({ version: 1, activeId: null, accounts: [] }); const headers = await importContext(app), c = credential('first');
    const response = await app.call('/api/accounts/import', { method: 'POST', account: null, headers, body: { confirm: true, credential: { wsUrl: c.url, body: c.login } } });
    assert.equal(response.status, 201); assert.equal(loadStore().activeId, 'first'); assert.equal(app.clients.length, 0);
  } finally { await app.close(); }
});
test('local import requires same-origin CSRF, JSON, confirmation and unique route context', async () => {
  const app = await harness();
  try {
    const headers = await importContext(app), body = { confirm: true, credential: credential('account-C') }, before = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
    const cases = [
      { headers: {}, status: 403 }, { headers: { ...headers, origin: 'http://evil.invalid' }, status: 403 },
      { headers: { ...headers, host: 'evil.invalid' }, status: 403 }, { headers: { ...headers, 'sec-fetch-site': 'cross-site' }, status: 403 },
      { headers: { ...headers, 'x-cw-csrf': 'wrong' }, status: 403 }, { headers: { ...headers, 'content-type': 'text/plain' }, status: 403 },
      { headers, account: 'account-A', status: 400 }, { headers, body: { ...body, confirm: false }, status: 400 },
      { headers, body: { ...body, replace: true }, status: 400 }, { headers, body: { ...body, label: 'x'.repeat(101) }, status: 400 },
      { headers, rawBody: 'x'.repeat(65537), status: 400 }, { headers, rawBody: '{"secret":"malformed-sensitive-value"', status: 400 },
    ];
    for (const item of cases) {
      const response = await app.call('/api/accounts/import', { method: 'POST', account: null, headers, body, ...item });
      assert.equal(response.status, item.status); assert.ok(!response.text.includes('malformed-sensitive-value')); assert.equal(fs.readFileSync(ACCOUNTS_PATH, 'utf8'), before);
    }
    assert.equal((await app.call('/api/accounts', { account: null, headers: { origin: 'http://evil.invalid' } })).status, 403); assert.equal(app.clients.length, 0);
  } finally { await app.close(); }
});
test('invalid or developer credentials fail closed without reflection or account changes', async () => {
  const app = await harness();
  try {
    const headers = await importContext(app), before = fs.readFileSync(ACCOUNTS_PATH, 'utf8'), base = credential('account-C');
    const invalid = [null, [], { ...base, id: 'other' }, { ...base, url: 'ws://example.invalid/ws' },
      { ...base, login: { eworldParams: { ...base.login.eworldParams, timestamp: 0 } } },
      { ...base, login: { eworldParams: { ...base.login.eworldParams, token: '' } } }, { ...base, nested: { superToken: 'never-reflect-this' } }];
    for (const value of invalid) {
      const response = await app.call('/api/accounts/import', { method: 'POST', account: null, headers, body: { confirm: true, credential: value } });
      assert.equal(response.status, 400); for (const secret of [token, sign, frame, 'never-reflect-this']) assert.ok(!response.text.includes(secret)); assert.equal(fs.readFileSync(ACCOUNTS_PATH, 'utf8'), before);
    }
    assert.equal(app.clients.length, 0);
  } finally { await app.close(); }
});


test('import storage failure preserves existing accounts and never creates a client', async () => {
  const app = await harness(), temp = ACCOUNTS_PATH + '.tmp';
  try {
    const headers = await importContext(app), before = fs.readFileSync(ACCOUNTS_PATH, 'utf8');
    fs.mkdirSync(temp);
    const response = await app.call('/api/accounts/import', { method: 'POST', account: null, headers, body: { confirm: true, credential: credential('account-C') } });
    assert.notEqual(response.status, 201); assert.equal(fs.readFileSync(ACCOUNTS_PATH, 'utf8'), before);
    assert.equal(loadStore().accounts.some(a => a.id === 'account-C'), false); assert.equal(app.clients.length, 0);
    for (const secret of [token, sign, frame]) assert.ok(!response.text.includes(secret));
  } finally { fs.rmdirSync(temp); await app.close(); }
});
test('lost writer ownership blocks local import before persistence', async () => {
  let owned = false;
  const writerOwnership = { claim() { owned = true; }, assertOwned() { if (!owned) throw Object.assign(Error('writer lost'), { statusCode: 409, code: 'WRITER_LOST' }); }, release() { owned = false; } };
  const app = await harness({ writerOwnership });
  try {
    const headers = await importContext(app), before = fs.readFileSync(ACCOUNTS_PATH, 'utf8'); owned = false;
    const response = await app.call('/api/accounts/import', { method: 'POST', account: null, headers, body: { confirm: true, credential: credential('account-C') } });
    assert.equal(response.status, 409); assert.equal(response.data.code, 'WRITER_LOST'); assert.equal(fs.readFileSync(ACCOUNTS_PATH, 'utf8'), before); assert.equal(app.clients.length, 0);
  } finally { await app.close(); }
});

const worldBits=(low,high=0)=>({low,high,unsigned:false});
const rawWorldList=()=>({latestGroupId:3,recentWorlds:[{worldId:worldBits(3,2097152),roleInfo:{id:worldBits(1,2097152),nickname:'synthetic exact role',bornWorldId:worldBits(3,2097152),worldId:worldBits(5,2097152),level:10}}]});
test('world identity descriptions preserve real Codec int64 role/birth/merged keys through both original list functions',async()=>{
 const {describeRole,describeWorld,listWorlds,listGroup}=await import('../src/worlds.mjs'),codec=createCodec(loadProtocol());
 const response=codec.decode(codec.encode('GameWorldListResponse',1,rawWorldList())).body,world=response.recentWorlds[0];
 const describe=describeWorld(world);assert.equal(describe.worldId,'9007199254740995');assert.equal(describe.role.id,'9007199254740993');assert.equal(describe.role.bornWorldId,'9007199254740995');assert.equal(describe.role.worldId,'9007199254740997');assert.equal(describeRole({playerId:world.roleInfo.id,worldId:world.roleInfo.worldId}).id,'9007199254740993');
 const requests=[],client={async request(...args){requests.push(args);return args[0]==='GameWorldListRequest'?response:codec.decode(codec.encode('GameWorldGroupListResponse',2,{worlds:[world]})).body;}};
 assert.deepEqual((await listWorlds(client)).recentWorlds,[describe]);assert.deepEqual(await listGroup(client,3),[describe]);assert.deepEqual(requests.map(row=>row.slice(0,3)),[['GameWorldListRequest',{},'GameWorldListResponse'],['GameWorldGroupListRequest',{groupId:3},'GameWorldGroupListResponse']]);
});
test('world identities reject missing/default/unsafe/conflicting IDs without altering legacy numeric facts',async()=>{
 const {describeRole,describeWorld,listWorlds,listGroup,normalize}=await import('../src/worlds.mjs');
 for(const value of [undefined,0,-1,Number.MAX_SAFE_INTEGER+1,'01','0','9223372036854775808',worldBits(-1,-1),Object.create({low:1,high:0})])assert.equal(describeRole({id:value,worldId:value,bornWorldId:value}).id,null);
 assert.equal(describeRole(Object.create({id:7,worldId:9,bornWorldId:7})).id,null);assert.equal(describeRole({id:1,playerId:2}).id,null);assert.equal(describeRole({id:1,playerId:'1'}).id,1);assert.equal(describeWorld({}).worldId,null);
 const missing=describeRole({id:1});assert.equal(missing.worldId,null);assert.equal(missing.bornWorldId,null);assert.deepEqual(normalize({num:worldBits(5)}),{num:5});
 for(const body of [{},null,{recentWorlds:null},{recentWorlds:{}}])await assert.rejects(listWorlds({request:async()=>body}),{code:'WORLD_LIST_UNKNOWN'});
 await assert.rejects(listWorlds({request:async()=>Object.create({recentWorlds:[]})}),{code:'WORLD_LIST_UNKNOWN'});await assert.rejects(listGroup({request:async()=>({})},1),{code:'WORLD_LIST_UNKNOWN'});assert.deepEqual(await listWorlds({request:async()=>({recentWorlds:[]})}),{latestGroupId:null,recentWorlds:[]});
});
async function worldsHarness({gate=null}={}) {
 const reads=[];const app=await harness({clientFactory:()=>{const client=new FakeClient(),connect=client.connect.bind(client);client.connect=async login=>({...await connect(login),playerInfo:{playerId:worldBits(1,2097152),worldId:worldBits(5,2097152),bornWorldId:worldBits(3,2097152),nickname:'synthetic exact role'}});client.request=async(...args)=>{reads.push(args);assert.equal(args[0],'GameWorldListRequest');return gate?gate.promise:rawWorldList();};return client;}});return {...app,reads};
}
test('original worlds HTTP exposes exact identities without opening implicit login or world writes',async()=>{
 const app=await worldsHarness();try{
  assert.equal((await app.call('/api/worlds')).status,409);assert.equal(app.clients.length,0);await app.connect();const bytes=fs.readFileSync(ACCOUNTS_PATH,'utf8');
  const response=await app.call('/api/worlds');assert.equal(response.status,200);assert.equal(response.data.accountId,'account-A');assert.equal(response.data.currentPlayer.id,'9007199254740993');assert.equal(response.data.recentWorlds[0].role.id,'9007199254740993');assert.equal(response.data.recentWorlds[0].worldId,'9007199254740995');assert.equal(response.data.recentWorlds[0].role.worldId,'9007199254740997');assert.equal(app.reads.length,1);assert.equal(app.sessions.get('account-A').busy,null);
  assert.equal((await app.call('/api/worlds',{account:'account-B'})).status,409);assert.equal(app.clients.length,1);assert.equal(app.collects,0);assert.equal((await app.call('/api/worlds/enter',{method:'POST',body:{worldId:'9007199254740995',confirm:true}})).status,403);assert.equal(app.reads.length,1);assert.equal(fs.readFileSync(ACCOUNTS_PATH,'utf8'),bytes);for(const secret of [token,sign,frame])assert.ok(!response.text.includes(secret));
 }finally{await app.close();}
});
for(const change of ['account','role','world','generation','connection','client-account','client-generation','client-connection','disconnected'])test('worlds HTTP rejects late original read after '+change+' change',async()=>{
 const gate=deferred(),app=await worldsHarness({gate});try{
  await app.connect();const session=app.sessions.get('account-A'),client=app.clients[0],old={id:session.id,player:session.player,generation:session.generation,connectionId:session.connectionId,context:{...client.factContext}};
  const pending=app.call('/api/worlds');await until(()=>app.reads.length===1);assert.match(session.busy,/worlds:READ:/);
  if(change==='account')session.id='foreign';if(change==='role')session.player={...session.player,playerId:worldBits(2,2097152)};if(change==='world')session.player={...session.player,worldId:worldBits(6,2097152)};if(change==='generation')session.generation++;if(change==='connection')session.connectionId='other';if(change==='client-account')client.factContext.accountId='foreign';if(change==='client-generation')client.factContext.generation++;if(change==='client-connection')client.factContext.connectionId='other';if(change==='disconnected')client.connected=false;
  gate.resolve(rawWorldList());const response=await pending;assert.equal(response.status,409);assert.equal(response.data.code,'SESSION_CHANGED');assert.equal(response.data.recentWorlds,undefined);assert.equal(app.reads.length,1);assert.equal(app.clients.length,1);assert.equal(app.collects,0);
  session.id=old.id;session.player=old.player;session.generation=old.generation;session.connectionId=old.connectionId;client.factContext=old.context;
 }finally{await app.close();}
});
test('worlds HTTP shares the original busy lock and cancellation cannot release a successor owner',async()=>{
 const gate=deferred(),app=await worldsHarness({gate});try{
  await app.connect();const session=app.sessions.get('account-A');for(const key of ['busy','workflowOwner','collectionPromise']){session[key]='synthetic-active';const response=await app.call('/api/worlds');assert.equal(response.status,409);assert.equal(response.data.code,'ACCOUNT_BUSY');session[key]=null;}assert.equal(app.reads.length,0);
  const pending=app.call('/api/worlds');await until(()=>app.reads.length===1);assert.equal((await app.call('/api/worlds')).data.code,'ACCOUNT_BUSY');assert.equal(app.reads.length,1);
  const oldClient=app.clients[0];assert.equal((await app.call('/api/disconnect',{method:'POST'})).status,200);assert.equal((await pending).status,409);await app.connect();const current=app.sessions.get('account-A');current.busy='successor-owner';gate.resolve(rawWorldList());await flush();assert.equal(current.busy,'successor-owner');assert.equal(current.client,app.clients[1]);assert.equal(app.reads.length,1);assert.equal(oldClient.connected,false);
 }finally{await app.close();}
});

function activityRuntimeSnapshot(){
 const state=dailyRuntimeSnapshot(),bodies={AllGuildAbstractionRequest:{guilds:[{id:'9007199254740995',level:0}]},WeekInfoRequest:{activityTime:[{type:1,period:0,startTime:100,endTime:200}]}};
 Object.assign(state.ok,structuredClone(bodies));Object.assign(state.raw,structuredClone(bodies));for(const name of Object.keys(state.ok))state.outcomes[name]={status:'SUCCESS',updatedAt:'2026-11-15T08:00:00.000Z'};return state;
}
async function activityRuntimeHarness(options={}){
 const app=await harness({collect:async()=>activityRuntimeSnapshot(),...options});await app.connect();Object.assign(app.sessions.get('account-A').player,{playerId:'17',worldId:'9'});return app;
}
test('activity alliance cached overview HTTP has no implicit collection, exact account isolation and no executable authority',async()=>{
 const app=await activityRuntimeHarness();try{
  const before=await app.call('/api/overview');assert.equal(before.data.activityAlliance.status,'UNKNOWN');assert.equal(app.collects,0);
  await app.refresh();const response=(await app.call('/api/overview')).data,result=response.activityAlliance;assert.equal(response.dataContext.playerId,'17');assert.equal(response.dataContext.worldId,'9');for(const key of ['accountId','generation','connectionId','playerId','worldId'])assert.equal(response.dataContext[key],result.context[key]);assert.equal(result.accountId,'account-A');assert.equal(result.status,'OBSERVED');assert.equal(result.alliance.rows[0].id,'9007199254740995');assert.equal(result.alliance.rows[0].level,0);assert.equal(result.alliance.membershipKnown,false);assert.equal(result.weekly.rows[0].period,0);assert.equal(result.readOnly,true);assert.equal(result.executable,false);assert.equal(result.complete,false);assert.equal(result.checklist.tasks.counts.total,1);assert.equal(app.collects,1);
  const b=(await app.call('/api/overview',{account:'account-B'})).data.activityAlliance;assert.equal(b.status,'UNKNOWN');assert.deepEqual(b.alliance.rows,[]);assert.deepEqual(b.weekly.rows,[]);for(let i=0;i<3;i++)await app.call('/api/overview');assert.equal(app.collects,1);assert.equal(app.clients.length,1);
 }finally{await app.close();}
});
for(const key of ['generation','connectionId','playerId','worldId'])test('activity alliance cached overview HTTP '+key+' change invalidates prior observed identity',async()=>{
 const app=await activityRuntimeHarness();try{await app.refresh();const session=app.sessions.get('account-A'),original=JSON.stringify(session.snapshot);if(key==='generation')session.generation++;else if(key==='connectionId')session.connectionId='new-synthetic-connection';else session.player[key]=key==='playerId'?'18':'10';const result=(await app.call('/api/overview')).data.activityAlliance;assert.equal(result.status,'UNKNOWN');assert.deepEqual(result.alliance.rows,[]);assert.equal(result.checklist.tasks.counts.total,null);assert.equal(app.collects,1);assert.equal(JSON.stringify(session.snapshot),original);}finally{await app.close();}
});
test('activity alliance cached overview HTTP failed source does not hide independent weekly or task observations',async()=>{
 const app=await activityRuntimeHarness({collect:async()=>{const state=activityRuntimeSnapshot();state.failed.AllGuildAbstractionRequest='synthetic failure';state.outcomes.AllGuildAbstractionRequest.status='FAILED';return state;}});try{await app.refresh();const result=(await app.call('/api/overview')).data.activityAlliance;assert.equal(result.alliance.status,'UNKNOWN');assert.equal(result.weekly.status,'OBSERVED');assert.equal(result.checklist.tasks.counts.total,1);assert.equal(result.sources.find(row=>row.request==='AllGuildAbstractionRequest').status,'FAILED');assert.equal(app.collects,1);}finally{await app.close();}
});
test('activity alliance cached overview HTTP source identity captured before collection prevents late role migration',async()=>{
 const gate=deferred(),app=await activityRuntimeHarness({collect:()=>gate.promise});try{const reading=app.refresh();await until(()=>app.collects===1);app.sessions.get('account-A').player.worldId='10';gate.resolve(activityRuntimeSnapshot());const result=await reading;assert.equal(result.status,200);assert.equal(result.data.activityAlliance.status,'UNKNOWN');assert.deepEqual(result.data.activityAlliance.alliance.rows,[]);assert.equal(app.collects,1);}finally{await app.close();}
});
test('activity alliance cached overview HTTP reuses accepted daily reset invalidation without sending or replaying',async()=>{
 const app=await dailyRuntimeHarness();try{const socket=await app.login();await app.refresh();const before=(await app.call('/api/overview')).data.activityAlliance;assert.equal(before.checklist.tasks.counts.eligible,1);const sent=app.sent.length;socket.receive('SCDailyTaskReset',{dailyResetTime:1780086400},1);const after=(await app.call('/api/overview')).data.activityAlliance;assert.equal(after.stale,true);assert.equal(after.checklist.sources.daily.status,'UNKNOWN');assert.equal(after.checklist.tasks.counts.total,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);}finally{await app.close();}
});


async function ownAllianceRuntime({gate=null,failed=null}={}){
 const queries=['GuildInfo','GuildMember','GuildAidList','MyGuildAid','GuildOrder','GuildCityInfo','CounterInfo','AllItem','AllResource','GuildTechInfo','SeasonTaskStage'],protocol=Object.fromEntries(queries.flatMap(n=>[[n+'Request',{}],[n+'Response',{}]]));
 const app=await harness({protocol}),reads=[],answers={GuildInfoRequest:{guild:{guildId:'9007199254740995'}},GuildMemberRequest:{titleList:[{guildTitle:0,members:[{playerId:'9007199254740997',nickname:'synthetic-owned-member',online:false}]}]},GuildAidListRequest:{askItems:[]},MyGuildAidRequest:{aids:[]},GuildOrderRequest:{order:{requirements:[],nextRefreshTime:0}},GuildCityInfoRequest:{cities:[]},CounterInfoRequest:{counters:[]},AllItemRequest:{items:[]},AllResourceRequest:{list:[]},GuildTechInfoRequest:{tech:[{techId:1,level:0}]},SeasonTaskStageRequest:{stage:0}};
 await app.connect();Object.assign(app.sessions.get('account-A').player,{playerId:'9007199254740993',worldId:1000001});
 app.clients[0].request=async name=>{reads.push(name);if(gate&&name==='GuildMemberRequest')await gate.promise;if(name===failed)throw Error('synthetic failure');return structuredClone(answers[name]);};
 const headers=await importContext(app);
 return {...app,reads,survey:()=>app.call('/api/gameplay/survey',{method:'POST',headers,body:{module:'alliance',parameters:{}}})};
}
test('own alliance HTTP overview reuses explicit Service survey independently of Collector with zero implicit requests',async()=>{
 const app=await ownAllianceRuntime();try{
  assert.equal((await app.call('/api/overview')).data.ownAlliance.status,'UNKNOWN');assert.equal(app.reads.length,0);
  const surveyed=await app.survey();assert.equal(surveyed.status,200);assert.equal(surveyed.data.view.members[0].playerId,'9007199254740997');assert.equal(app.reads.length,11);
  const r=(await app.call('/api/overview')).data;assert.equal(r.ownAlliance.status,'OBSERVED');assert.equal(r.activityAlliance.status,'UNKNOWN');assert.equal(r.ownAlliance.guildId,'9007199254740995');assert.equal(r.ownAlliance.members.rows[0].nickname,'synthetic-owned-member');assert.equal(r.ownAlliance.technology.rows[0].level,0);assert.equal(r.ownAlliance.order.nextRefreshTime,0);assert.equal(r.ownAlliance.membershipObserved,true);assert.ok(r.ownAlliance.members.observedAt);assert.ok(r.ownAlliance.surveyedAt);
  for(const k of ['accountId','generation','connectionId','playerId','worldId'])assert.equal(r.dataContext[k],r.ownAlliance.context[k]);
  for(let i=0;i<3;i++)await app.call('/api/overview');assert.equal(app.reads.length,11);assert.equal(app.collects,0);assert.equal(app.clients.length,1);
  assert.equal((await app.call('/api/overview',{account:'account-B'})).data.ownAlliance.status,'UNKNOWN');for(const key of ['candidates','lastPlan','qualification','budgetClaims','inputs','identity'])assert.equal(Object.hasOwn(r.ownAlliance,key),false);
 }finally{await app.close();}
});
test('own alliance HTTP failed member source preserves independent technology and order observations',async()=>{
 const app=await ownAllianceRuntime({failed:'GuildMemberRequest'});try{assert.equal((await app.survey()).status,200);const r=(await app.call('/api/overview')).data.ownAlliance;assert.equal(r.members.status,'UNKNOWN');assert.equal(r.members.observedAt,null);assert.equal(r.technology.status,'OBSERVED');assert.equal(r.order.status,'OBSERVED');assert.equal(app.collects,0);assert.equal(app.reads.length,11);}finally{await app.close();}
});
for(const key of ['generation','connectionId','playerId','worldId'])test('own alliance HTTP '+key+' change clears former own alliance observation',async()=>{
 const app=await ownAllianceRuntime();try{assert.equal((await app.survey()).status,200);const s=app.sessions.get('account-A');if(key==='generation')s.generation++;else if(key==='connectionId')s.connectionId='other';else s.player[key]=key==='playerId'?'18':2000001;const r=(await app.call('/api/overview')).data.ownAlliance;assert.equal(r.status,'UNKNOWN');assert.equal(r.guildId,null);assert.deepEqual(r.members.rows,[]);assert.equal(app.reads.length,11);}finally{await app.close();}
});
test('own alliance HTTP delayed explicit survey cannot publish across changed role context',async()=>{
 const gate=deferred(),app=await ownAllianceRuntime({gate});try{const pending=app.survey();await until(()=>app.reads.includes('GuildMemberRequest'));app.sessions.get('account-A').player.worldId=2000001;gate.resolve();assert.equal((await pending).status,409);assert.equal((await app.call('/api/overview')).data.ownAlliance.status,'UNKNOWN');assert.equal(app.reads.length,11);}finally{gate.resolve();await app.close();}
});

async function fleetOverviewRuntime({failed=null,gate=null}={}){
 const names=['MyFleets','AllItem','AllResource','CargoShips','WorldInfo','GuildInfo'],protocol=Object.fromEntries(names.flatMap(n=>[[n+'Request',{}],[n+'Response',{}]])),app=await harness({protocol}),reads=[],bodies=[];
 const answers={MyFleetsRequest:{fleets:[{buildingId:'synthetic-own-fleet',state:0,cityId:1,durability:0,maxDura:100}]},AllItemRequest:{items:[]},AllResourceRequest:{list:[]},CargoShipsRequest:{ship:[]},WorldInfoRequest:{cities:[{id:1,state:0,guildIdx:0}]},GuildInfoRequest:{guild:{guildId:10}}};
 await app.connect();Object.assign(app.sessions.get('account-A').player,{playerId:'9007199254740993',worldId:1000001});app.clients[0].request=async(name,body)=>{reads.push(name);bodies.push(structuredClone(body));if(gate&&name==='WorldInfoRequest')await gate.promise;if(name===failed)throw Error('synthetic failure');return structuredClone(answers[name]);};const headers=await importContext(app);return {...app,reads,bodies,survey:()=>app.call('/api/gameplay/survey',{method:'POST',headers,body:{module:'fleet',parameters:{}}})};
}
test('bounded Fleet HTTP overview only reads original explicit six-request cache',async()=>{const app=await fleetOverviewRuntime();try{assert.equal((await app.call('/api/overview')).data.fleetWorld.status,'UNKNOWN');assert.equal(app.reads.length,0);const surveyed=await app.survey();assert.equal(surveyed.status,200,JSON.stringify(surveyed.data));assert.equal(app.reads.length,6);const r=(await app.call('/api/overview')).data;assert.equal(r.fleetWorld.status,'OBSERVED');assert.equal(r.fleetWorld.fleets.rows[0].durability,0);assert.equal(r.fleetWorld.world.rows[0].guildIdx,0);assert.equal(r.fleetWorld.world.mapComplete,false);assert.deepEqual(app.bodies[app.reads.indexOf('WorldInfoRequest')],{screenCenter:{x:0,y:0}});for(const key of ['accountId','generation','connectionId','playerId','worldId'])assert.equal(r.fleetWorld.context[key],r.dataContext[key]);for(let i=0;i<3;i++)await app.call('/api/overview');assert.equal(app.reads.length,6);assert.equal(app.collects,0);assert.equal((await app.call('/api/overview',{account:'account-B'})).data.fleetWorld.status,'UNKNOWN');}finally{await app.close();}});
test('bounded Fleet HTTP failed source stays unknown independently of city response',async()=>{const app=await fleetOverviewRuntime({failed:'MyFleetsRequest'});try{const surveyed=await app.survey();assert.equal(surveyed.status,200,JSON.stringify(surveyed.data));const r=(await app.call('/api/overview')).data.fleetWorld;assert.equal(r.status,'PARTIAL');assert.equal(r.fleets.status,'UNKNOWN');assert.deepEqual(r.fleets.rows,[]);assert.equal(r.world.status,'OBSERVED');assert.equal(app.reads.length,6);}finally{await app.close();}});
test('bounded Fleet HTTP delayed response cannot publish across role switch',async()=>{const gate=deferred(),app=await fleetOverviewRuntime({gate});try{const pending=app.survey();await until(()=>app.reads.includes('WorldInfoRequest'));app.sessions.get('account-A').player.worldId=2000001;gate.resolve();assert.equal((await pending).status,409);assert.equal((await app.call('/api/overview')).data.fleetWorld.status,'UNKNOWN');assert.equal(app.reads.length,6);}finally{gate.resolve();await app.close();}});


test('Tasks HTTP reads exact source cache per account and never calls the game transport',async()=>{
 const app=await dailyRuntimeHarness({collect:async client=>{
  const claimed=client.factContext.accountId==='account-B';
  const raw={MainTaskInfoRequest:{task:{taskId:1,progress:15,rewardClaimed:claimed},branch:[]},AchievementInfoRequest:{task:[{id:1001,progress:'9007199254740993',targetProgress:'9007199254740994',rewardClaimed:claimed}]},OnWaterRequest:{}};
  return {ok:{...raw,AchievementInfoRequest:{task:[{id:1001,progress:9007199254740992,targetProgress:9007199254740992,rewardClaimed:false}]}},raw,failed:{}};
 }});
 try{
  for(const account of ['account-A','account-B']){await app.login(account);await app.refresh(account);}
  const sent=app.sent.length;
  for(const account of ['account-A','account-B']){
   const response=await app.call('/api/tasks',{account});assert.equal(response.status,200);assert.equal(response.data.readOnly,true);assert.equal(response.data.executable,false);
   const row=response.data.achievement[0];assert.equal(row.progress,'9007199254740993');assert.equal(row.target,'9007199254740994');assert.equal(row.qualification.completion,'INCOMPLETE');assert.equal(row.qualification.claimable,false);assert.equal(row.claimed,account==='account-B');
  }
  delete app.sessions.get('account-A').snapshot.raw.AchievementInfoRequest;
  const missing=await app.call('/api/tasks');assert.equal(missing.status,200);assert.deepEqual(missing.data.achievement,[]);assert.equal(missing.data.plan.some(x=>x.kind==='achievement'),false);
  assert.equal(app.collects,2);assert.equal(app.sent.length,sent);assert.equal(app.clients.length,2);
 }finally{await app.close();}
});


function taskRuntimeSnapshot(){
 const state=dailyRuntimeSnapshot();
 state.raw.MainTaskInfoRequest={task:{taskId:1,progress:15,rewardClaimed:false},branch:[{taskId:8001,progress:1}]};state.raw.OnWaterRequest={};
 state.raw.AchievementInfoRequest={task:[{id:1001,progress:'1',targetProgress:'1',rewardClaimed:false}]};
 state.ok={...state.ok,...structuredClone(state.raw)};return state;
}
for(const [name,body,changed]of [
 ['SCMainTaskUpdate',{task:{taskId:1,progress:'15',rewardClaimed:true}},'MainTaskInfoRequest'],
 ['SCBranchTaskUpdate',{task:{taskId:8001,progress:'1'}},'MainTaskInfoRequest'],
 ['SCAchievementUpdate',{task:[{id:1001,progress:'1',targetProgress:'1',rewardClaimed:true}]},'AchievementInfoRequest'],
])test('Tasks cache invalidates only the accepted source, including claim-only push '+name,async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>taskRuntimeSnapshot()});
 try{
  const socket=await app.login();socket.receive(name,body,1);await app.refresh();
  const original=JSON.stringify(app.sessions.get('account-A').snapshot),before=(await app.call('/api/tasks')).data,sent=app.sent.length;
  assert.equal(before.sources[changed].status,'OBSERVED');
  app.clients[0].emit('message',{name,seq:2,body});assert.equal((await app.call('/api/tasks')).data.sources[changed].status,'OBSERVED');
  socket.receive(name,body,2);
  const after=(await app.call('/api/tasks')).data;assert.equal(after.sources[changed].status,'UNKNOWN');assert.equal(after.stale,true);
  assert.equal(after.plan.some(x=>changed==='MainTaskInfoRequest'?['main','branch'].includes(x.kind):x.kind==='achievement'),false);
  const independent=changed==='MainTaskInfoRequest'?'AchievementInfoRequest':'MainTaskInfoRequest';assert.equal(after.sources[independent].status,'OBSERVED');assert.equal(after.plan.some(x=>independent==='MainTaskInfoRequest'?x.kind==='main':x.kind==='achievement'),true);
  if(changed==='AchievementInfoRequest'){
   assert.equal((await app.call('/api/dailies')).data.checklist.sources.achievements.status,'UNKNOWN');
   const overview=(await app.call('/api/overview')).data.activityAlliance;
   assert.equal(overview.checklist.sources.achievements.status,'UNKNOWN');assert.equal(overview.checklist.tasks.counts.eligible,1);
  }
  assert.equal(JSON.stringify(app.sessions.get('account-A').snapshot),original);assert.equal(app.collects,1);assert.equal(app.sent.length,sent);
  await app.refresh();assert.equal((await app.call('/api/tasks')).data.sources[changed].status,'OBSERVED');assert.equal(app.collects,2);
 }finally{await app.close();}
});
for(const field of ['accountId','generation','connectionId','playerId','worldId','client'])test('Tasks cache cannot transfer or revive after observed context change '+field,async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>taskRuntimeSnapshot()});
 try{
  await app.login();await app.refresh();const session=app.sessions.get('account-A'),sent=app.sent.length;
  assert.ok((await app.call('/api/tasks')).data.plan.length>0);
  const target=field==='accountId'?session:field==='playerId'||field==='worldId'?session.player:session,key=field==='accountId'?'id':field,old=target[key];
  target[key]=field==='generation'?old+1:field==='client'?{connected:true}:'changed';
  const invalid=(await app.call('/api/tasks')).data;assert.deepEqual(invalid.plan,[]);assert.ok(Object.values(invalid.sources).every(x=>x.status==='UNKNOWN'));
  target[key]=old;const restored=(await app.call('/api/tasks')).data;assert.deepEqual(restored.plan,[]);assert.equal(restored.stale,true);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});

test('task push during collection cannot certify the raced source and sequence gaps require a new connection',async()=>{
 const gate=deferred();const app=await dailyRuntimeHarness({collect:()=>gate.promise});
 try{
  const socket=await app.login(),refresh=app.refresh();await until(()=>app.collects===1);
  socket.receive('SCAchievementUpdate',{task:[{id:1001,progress:'1',targetProgress:'1',rewardClaimed:true}]},1);gate.resolve(taskRuntimeSnapshot());await refresh;
  const raced=(await app.call('/api/tasks')).data;assert.equal(raced.sources.AchievementInfoRequest.status,'UNKNOWN');assert.equal(raced.sources.MainTaskInfoRequest.status,'OBSERVED');
  socket.receive('SCAchievementUpdate',{task:[{id:1001,progress:'1',targetProgress:'1',rewardClaimed:true}]},3);
  await app.refresh();assert.equal((await app.call('/api/tasks')).data.sources.AchievementInfoRequest.status,'UNKNOWN');
 }finally{gate.resolve(taskRuntimeSnapshot());await app.close();}
});


for(const [name,kind]of [['MainTaskInfoRequest','main'],['AchievementInfoRequest','achievement'],['OnWaterRequest','orderDaily']])test('missing or failed task source leaves independent cache observations available '+name,async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>taskRuntimeSnapshot()});
 try{
  await app.login();await app.refresh();const session=app.sessions.get('account-A'),sent=app.sent.length;
  for(const mode of ['failed','missing','outcome']){
   const old=session.snapshot.ok[name];
   if(mode==='failed')session.snapshot.failed[name]='synthetic failure';
   if(mode==='missing')delete session.snapshot.ok[name];
   if(mode==='outcome')session.snapshot.outcomes[name]={status:'UNKNOWN'};
   const result=await app.call('/api/tasks');assert.equal(result.status,200);assert.equal(result.data.sources[name].status,'UNKNOWN');assert.equal(result.data.plan.some(x=>x.kind===kind),false);
   const independent=name==='MainTaskInfoRequest'?'achievement':'main';assert.ok(result.data.plan.some(x=>x.kind===independent));
   session.snapshot.ok[name]=old;delete session.snapshot.failed[name];session.snapshot.outcomes[name]={status:'SUCCESS'};
  }
  assert.equal(app.collects,1);assert.equal(app.sent.length,sent);
 }finally{await app.close();}
});

// Real original Service, registry, codec and durable history; all task responses and sends are synthetic.
async function taskRewardCacheHarness({kind='main',outcome='SUCCESS',onWrite=null}={}) {
 const {createExecutionHistory}=await import('../src/execution-history.mjs'),{loadConfig}=await import('../src/config.mjs');
 const history=createExecutionHistory({file:path.join(sandbox,'task-cache-'+kind+'-'+outcome+'.json')}),config=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')}),state=taskRuntimeSnapshot(),writes=[],reads=[];
 state.raw.AllItemRequest={items:[{itemId:'塑料',num:20}]};state.raw.AllResourceRequest={list:[{res:1,amount:100},{res:3,amount:200},{res:4,amount:50}]};state.ok=structuredClone(state.raw);
 state.raw.DailyTaskInfoRequest.dailyResetTime=Math.floor(Date.now()/1000)+7200;state.raw.DailyGiftPackRequest.heroId='马斯克';state.ok=structuredClone(state.raw);
 const app=await dailyRuntimeHarness({worldId:['daily-activity','daily-gift'].includes(kind)?'1000001':'9',collect:async()=>structuredClone(state),operationOptions:{history,getConfig:()=>config,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}}),moduleSettings:{get:()=>({config:{enabled:true}})}}});
 await app.login();await app.refresh();
 const session=app.sessions.get('account-A'),client=session.client;
 const {trustedGameClock}=await import('../src/state-facts.mjs'),wall=Date.now(),clock=trustedGameClock({accountId:session.id,generation:session.generation,wallNow:()=>Date.now(),monotonicNow:()=>performance.now()});
 clock.markPing(wall);clock.observePong({clientTimestamp:wall,serverTimestamp:wall});client.gameClock=clock;
 const applyReward=([id,num])=>{const resource={EXP:1,GOLD:3,RUBY:4}[id];if(resource)state.raw.AllResourceRequest.list.find(row=>row.res===resource).amount+=num;else{let item=state.raw.AllItemRequest.items.find(row=>row.itemId===id);if(!item)state.raw.AllItemRequest.items.push(item={itemId:id,num:0});item.num+=num;}};
 const applyDaily=()=>{state.raw.DailyTaskInfoRequest.dailyTask.find(row=>row.id===1001).rewardClaimed=true;state.raw.DailyTaskInfoRequest.dailyActivity+=5;state.raw.DailyTaskInfoRequest.weeklyActivity+=5;applyReward(['EXP',100]);state.ok=structuredClone(state.raw);};
 client.request=async(name,body,response,_timeout,options)=>{
  if(options?.mutate){options.beforeDispatch?.();writes.push({name,body:structuredClone(body)});await onWrite?.(app);if(outcome==='SUCCESS')applyDaily();if(outcome==='REJECTED')throw Object.assign(Error('synthetic rejected'),{code:'REJECTED'});return client.codec.decode(client.codec.encode(response,0,{activity:5})).body;}
  reads.push(name);assert.ok(state.raw[name],'unexpected task read '+name);return client.codec.decode(client.codec.encode(response,0,state.raw[name])).body;};
 client.sendWatch=async(name,body,options)=>{
  options.beforeDispatch?.();writes.push({name,body:structuredClone(body)});
  await onWrite?.(app);
  if(outcome==='SUCCESS'){
   if(kind==='daily-gift'){state.raw.DailyGiftPackRequest.drawnPack.push('赠礼');applyReward(['RUBY',10]);}
   else if(kind==='daily-activity'){state.raw.DailyTaskInfoRequest.dailyRewardClaimed.push(body.index[0]);const row=config.tables.DailyActivityRewardCfg.data.find(row=>row.season===1&&row.id===body.index[0]);applyReward(row.reward);}
   else if(kind==='achievement'){state.raw.AchievementInfoRequest.task[0].rewardClaimed=true;state.raw.AllResourceRequest.list[2].amount+=20;}
   else{
    const reward=config.tables[kind==='main'?'MainTaskCfg':'BranchTaskCfg'].data.find(row=>row.taskId===body.taskId).reward;
    if(kind==='main')state.raw.MainTaskInfoRequest.task.rewardClaimed=true;else state.raw.MainTaskInfoRequest.branch=[];
    for(const[id,num]of reward){if(id==='EXP')state.raw.AllResourceRequest.list[0].amount+=num;else{let item=state.raw.AllItemRequest.items.find(row=>row.itemId===id);if(!item)state.raw.AllItemRequest.items.push(item={itemId:id,num:0});item.num+=num;}}
   }
   state.ok=structuredClone(state.raw);
  }
  return {status:outcome==='REJECTED'?'REJECTED':'UNKNOWN'};
 };
 const parameters=kind==='daily-activity'?{kind,tierId:1}:kind==='daily-gift'?{kind,packId:'赠礼'}:{kind,taskId:kind==='main'?1:kind==='branch'?8001:1001};
 async function plan(){const result=await app.operations.surveyModule(session,'task-rewards',parameters),candidate=result.view.candidates.find(row=>row.executable);assert.ok(candidate,JSON.stringify(result.view));return app.operations.plan(session,{module:'task-rewards',mode:'Manual',parameters,selections:[candidate.actionId]});}
 function authorize(plan){return app.operations.authorize(session,{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});}
 return {...app,history,state,writes,reads,session,plan,authorize,get collects(){return app.collects;}};
}
for(const kind of ['main','branch','achievement'])for(const outcome of ['SUCCESS','UNKNOWN','REJECTED'])test('silent original Service claim invalidates only its task cache '+kind+' '+outcome,async()=>{
 const app=await taskRewardCacheHarness({kind,outcome});try{
  const source=kind==='achievement'?'AchievementInfoRequest':'MainTaskInfoRequest',other=kind==='achievement'?'MainTaskInfoRequest':'AchievementInfoRequest';
  const original=JSON.stringify(app.session.snapshot),plan=await app.plan();assert.equal((await app.call('/api/tasks')).data.sources[source].status,'OBSERVED');
  const permit=app.authorize(plan);assert.equal((await app.call('/api/tasks')).data.sources[source].status,'OBSERVED');
  app.operations.executeTaskRewards(app.session,permit);await app.operations.settle('account-A');
  const record=app.history.originalRecords('account-A')[0];assert.equal(record.finalStatus,outcome);assert.equal(record.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.equal(app.writes.length,1);
  const sent=app.sent.length,reads=app.reads.length,result=(await app.call('/api/tasks')).data;
  assert.equal(result.sources[source].status,'UNKNOWN');assert.equal(result.sources[source].reason,'TASK_CACHE_REWARD_WRITE');assert.equal(result.sources[other].status,'OBSERVED');assert.equal(result.sources.OnWaterRequest.status,'OBSERVED');
  assert.equal(result.plan.some(row=>kind==='achievement'?row.kind==='achievement':['main','branch'].includes(row.kind)),false);
  if(kind==='achievement'){assert.equal((await app.call('/api/dailies')).data.checklist.sources.achievements.status,'UNKNOWN');assert.equal((await app.call('/api/overview')).data.activityAlliance.checklist.sources.achievements.status,'UNKNOWN');}
  assert.equal(app.reads.length,reads);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);assert.equal(JSON.stringify(app.session.snapshot),original);
  if(outcome==='SUCCESS'){await app.refresh();const fresh=(await app.call('/api/tasks')).data;assert.equal(fresh.sources[source].status,'OBSERVED');assert.equal(fresh.plan.some(row=>row.kind===kind),false);}
  else{await assert.rejects(app.plan());assert.equal(app.writes.length,1);assert.equal((await app.call('/api/tasks')).data.sources[source].status,'UNKNOWN');}
 }finally{await app.close();}
});
test('original pre-dispatch evidence keeps task cache observed when fresh execution eligibility changed',async()=>{
 const app=await taskRewardCacheHarness({outcome:'NOT_EXECUTED'});try{
  const plan=await app.plan(),permit=app.authorize(plan);app.state.raw.MainTaskInfoRequest.task.progress=0;
  app.operations.executeTaskRewards(app.session,permit);await app.operations.settle('account-A');
  const record=app.history.originalRecords('account-A')[0];assert.equal(record.finalStatus,'NOT_EXECUTED');assert.equal(record.actions[0].dispatchEvidence.state,'NOT_DISPATCHED');assert.equal(app.writes.length,0);
  assert.equal((await app.call('/api/tasks')).data.sources.MainTaskInfoRequest.status,'OBSERVED');assert.equal(app.collects,1);
 }finally{await app.close();}
});

test('write-ahead task intent invalidates cache while silent claim response is still pending',async()=>{
 const gate=deferred();let dispatched=false;
 const app=await taskRewardCacheHarness({onWrite:async current=>{
  dispatched=true;const result=(await current.call('/api/tasks')).data;assert.equal(result.sources.MainTaskInfoRequest.reason,'TASK_CACHE_REWARD_WRITE');await gate.promise;
 }});
 try{
  const permit=app.authorize(await app.plan());app.operations.execute(app.session,permit);await until(()=>dispatched);
  assert.equal((await app.call('/api/tasks')).data.sources.MainTaskInfoRequest.status,'UNKNOWN');assert.equal(app.writes.length,1);
  gate.resolve();await app.operations.settle('account-A');assert.equal(app.history.originalRecords('account-A')[0].finalStatus,'SUCCESS');
  assert.equal((await app.call('/api/tasks')).data.sources.MainTaskInfoRequest.status,'UNKNOWN');
 }finally{gate.resolve();await app.close();}
});
test('task cache history fingerprint ignores other accounts and daily or season task contracts',async()=>{
 const app=await taskRewardCacheHarness();try{
  app.operations.execute(app.session,app.authorize(await app.plan()));await app.operations.settle('account-A');await app.refresh();
  const original=app.history.originalRecords('account-A')[0];
  const foreign=structuredClone(original);foreign.runId+='-other-account';foreign.accountId='account-B';foreign.executionContext.accountId='account-B';app.history.put(foreign);
  for(const kind of ['daily','weekly-chip-task']){const row=structuredClone(original);row.runId+='-'+kind;row.actions[0].parameters={kind,taskId:1,round:7};app.history.put(row);}
  const sent=app.sent.length,reads=app.reads.length,result=(await app.call('/api/tasks')).data;assert.equal(result.stale,false);assert.ok(Object.values(result.sources).every(row=>row.status==='OBSERVED'));assert.equal(app.sent.length,sent);assert.equal(app.reads.length,reads);
  // Unreadable original history hides only the dependent task sources; restoring
  // its exact original evidence cannot invent writes or invalidate unrelated data.
  const source=app.history.originalRecords;app.history.originalRecords=()=>{throw Error('synthetic unreadable history');};
  const unavailable=(await app.call('/api/tasks')).data;assert.equal(unavailable.sources.MainTaskInfoRequest.reason,'TASK_CACHE_HISTORY_UNAVAILABLE');assert.equal(unavailable.sources.AchievementInfoRequest.reason,'TASK_CACHE_HISTORY_UNAVAILABLE');assert.equal(unavailable.sources.OnWaterRequest.status,'OBSERVED');app.history.originalRecords=source;
  assert.equal((await app.call('/api/tasks')).data.stale,false);assert.equal(app.writes.length,1);
 }finally{await app.close();}
});

for(const kind of ['daily','daily-activity','daily-gift'])for(const outcome of ['SUCCESS','UNKNOWN','REJECTED'])test('original daily claim invalidates only its cached source '+kind+' '+outcome,async()=>{
 const app=await taskRewardCacheHarness({kind,outcome});try{
  const before=(await app.call('/api/dailies')).data;assert.equal(before.checklist.sources.daily.status,'AVAILABLE');assert.equal(before.checklist.sources.gift.status,'AVAILABLE');
  const raw=JSON.stringify(app.session.snapshot),permit=app.authorize(await app.plan());
  app.operations.executeDailyRewards(app.session,permit);await app.operations.settle('account-A');
  assert.equal(app.history.originalRecords('account-A')[0].finalStatus,outcome);assert.equal(app.writes.length,1);
  const reads=app.reads.length,sent=app.sent.length,after=(await app.call('/api/dailies')).data,overview=(await app.call('/api/overview')).data.activityAlliance.checklist;
  const changed=kind==='daily-gift'?'gift':'daily',other=kind==='daily-gift'?'daily':'gift';
  assert.equal(after.checklist.sources[changed].status,'UNKNOWN');assert.equal(overview.sources[changed].status,'UNKNOWN');assert.equal(after.checklist.sources[other].status,'AVAILABLE');assert.equal(overview.sources[other].status,'AVAILABLE');
  if(kind==='daily-gift'){assert.equal(after.gift,null);assert.equal(after.tasks.length,1);assert.equal(after.chestsUnavailable,null);}
  else{assert.deepEqual(after.tasks,[]);assert.equal(after.chests,null);assert.ok(after.gift);}
  assert.equal((await app.call('/api/tasks')).data.stale,false);assert.equal(JSON.stringify(app.session.snapshot),raw);assert.equal(app.reads.length,reads);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
  if(outcome==='SUCCESS'){await app.refresh();assert.equal((await app.call('/api/dailies')).data.checklist.sources[changed].status,'AVAILABLE');}
  else {await assert.rejects(app.plan());assert.equal(app.writes.length,1);}
 }finally{await app.close();}
});

test('old daily API and Checklist expose the same observation qualification and independent unknown reward state',async()=>{
 const rows=[{id:1001,progress:1,targetProgress:1},{id:1002,progress:'1',targetProgress:1,rewardClaimed:false},{id:1006,progress:1,targetProgress:1,rewardClaimed:true}];
 const app=await dailyRuntimeHarness({collect:async()=>{const state=dailyRuntimeSnapshot();state.raw.DailyTaskInfoRequest.dailyTask=rows;state.ok=structuredClone(state.raw);return state;}});
 try{
  await app.login();await app.refresh();const raw=JSON.stringify(app.sessions.get('account-A').snapshot),sent=app.sent.length,response=await app.call('/api/dailies');assert.equal(response.status,200);
  const view=response.data;assert.equal(view.readOnly,true);assert.equal(view.executable,false);assert.equal(view.taskListStatus,'OBSERVED');
  assert.equal(view.tasks[0].status,'done');assert.equal(view.tasks[0].qualification.rewardState,'UNKNOWN');assert.equal(view.tasks[0].qualification.claimable,null);
  assert.equal(view.tasks[1].status,'unknown');assert.deepEqual(view.tasks[1].actions,[]);assert.equal(view.tasks[2].qualification.rewardState,'CLAIMED');assert.equal(view.tasks[2].qualification.claimable,false);
  for(let i=0;i<rows.length;i++)assert.deepEqual(view.tasks[i].qualification,view.checklist.tasks.rows[i].qualification);
  const overview=(await app.call('/api/overview')).data.activityAlliance.checklist;assert.deepEqual(overview.tasks.rows.map(row=>row.qualification),view.tasks.map(row=>row.qualification));
  assert.equal(JSON.stringify(app.sessions.get('account-A').snapshot),raw);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});

function onlineRuntimeSnapshot(num='0'){
 const s=dailyRuntimeSnapshot();s.raw.CounterInfoRequest={counters:[{type:'DAILY_WORLD_ONLINE_RWD',num,updateTime:1780000000}]};s.ok.CounterInfoRequest=structuredClone(s.raw.CounterInfoRequest);s.outcomes.CounterInfoRequest={status:'SUCCESS',updatedAt:'2026-11-16T01:00:00Z'};return s;
}

test('war online HTTP reads only collected account counter and never sends a claim or refresh',async()=>{
 const app=await dailyRuntimeHarness({collect:async client=>onlineRuntimeSnapshot(client.factContext.accountId==='account-A'?'0':'4')});
 try{
  for(const account of ['account-A','account-B']){await app.login(account);await app.refresh(account);}
  const sent=app.sent.length,bytes=JSON.stringify(app.sessions.get('account-A').snapshot);
  for(const account of ['account-A','account-B'])for(let i=0;i<2;i++){
   const result=await app.call('/api/dailies',{account}),v=result.data.checklist.warOnlineReward;assert.equal(result.status,200);assert.equal(v.status,'OBSERVED');assert.equal(v.reportedStage,account==='account-A'?'0':'4');assert.equal(v.eligible,null);assert.equal(v.executable,false);assert.equal(v.settlement,'UNKNOWN');assert.equal(Object.hasOwn(v,'action'),false);
  }
  assert.equal(app.collects,2);assert.equal(app.sent.length,sent);assert.equal(app.sent.includes('GotWorldOnlineRwdRequest'),false);assert.equal(JSON.stringify(app.sessions.get('account-A').snapshot),bytes);
  delete app.sessions.get('account-A').snapshot.raw.CounterInfoRequest;assert.equal((await app.call('/api/dailies')).data.checklist.warOnlineReward.status,'UNKNOWN');assert.equal((await app.call('/api/dailies',{account:'account-B'})).data.checklist.warOnlineReward.reportedStage,'4');
 }finally{await app.close();}
});

for(const field of ['accountId','generation','connectionId','playerId','worldId','client'])test('war online cache cannot transfer across identity '+field,async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>onlineRuntimeSnapshot()});
 try{
  await app.login();await app.refresh();const session=app.sessions.get('account-A'),sent=app.sent.length;
  assert.equal((await app.call('/api/dailies')).data.checklist.warOnlineReward.status,'OBSERVED');
  if(field==='accountId')session.id='foreign';else if(field==='client')session.client={...session.client,stop(){}};else if(['playerId','worldId'].includes(field))session.player[field]='9007199254740993';else if(field==='generation')session.generation++;else session.connectionId='replacement';
  const result=(await app.call('/api/dailies')).data.checklist;assert.equal(result.warOnlineReward.status,'UNKNOWN');assert.equal(result.warOnlineReward.reportedStage,null);assert.equal(result.warOnlineReward.eligible,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});

test('war online late collection keeps former role counter unknown with zero extra dispatch',async()=>{
 const gate=deferred();let started=false;const app=await dailyRuntimeHarness({collect:async()=>{started=true;return gate.promise;}});
 try{
  await app.login();const pending=app.refresh();await until(()=>started);app.sessions.get('account-A').player.worldId='different';gate.resolve(onlineRuntimeSnapshot());assert.equal((await pending).status,200);
  const sent=app.sent.length,result=(await app.call('/api/dailies')).data.checklist.warOnlineReward;assert.equal(result.status,'UNKNOWN');assert.equal(result.reportedStage,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{gate.resolve(onlineRuntimeSnapshot());await app.close();}
});

test('war online restored public snapshot has no connection binding or implicit resume authority',async()=>{
 const app=await dailyRuntimeHarness();try{
  const first=await app.call('/api/dailies');assert.equal(first.data.checklist.warOnlineReward.status,'UNKNOWN');assert.equal(app.clients.length,0);
  const session=app.sessions.get('account-A');session.snapshot=onlineRuntimeSnapshot('4');session.snapshotAt='2026-11-16T01:00:00Z';
  const second=await app.call('/api/dailies');assert.equal(second.data.checklist.warOnlineReward.status,'UNKNOWN');assert.equal(second.data.checklist.warOnlineReward.reportedStage,null);assert.equal(second.data.checklist.warOnlineReward.executable,false);assert.equal(app.clients.length,0);assert.equal(app.sent.length,0);assert.equal(app.collects,0);
 }finally{await app.close();}
});

function floaterRuntimeSnapshot(num=3){
 const state=dailyRuntimeSnapshot();state.raw.OnWaterRequest={floater:[{floaterId:'塑料垃圾1',num}]};state.ok.OnWaterRequest=structuredClone(state.raw.OnWaterRequest);state.outcomes.OnWaterRequest={status:'SUCCESS',updatedAt:'2026-11-16T01:00:00Z'};return state;
}
test('water floater HTTP and overview share collected observations with zero pickup or automatic refresh',async()=>{
 const app=await dailyRuntimeHarness({collect:async client=>floaterRuntimeSnapshot(client.factContext.accountId==='account-A'?3:7)});try{
  for(const account of ['account-A','account-B']){await app.login(account);await app.refresh(account);}
  const sent=app.sent.length,bytes=JSON.stringify(app.sessions.get('account-A').snapshot);
  for(const account of ['account-A','account-B']){
   const d=(await app.call('/api/dailies',{account})).data,o=(await app.call('/api/overview',{account})).data;
   assert.deepEqual(o.activityAlliance.checklist.waterFloaters,d.checklist.waterFloaters);assert.equal(d.checklist.waterFloaters.totalCount,account==='account-A'?3:7);assert.equal(d.checklist.waterFloaters.eligible,null);assert.equal(d.checklist.waterFloaters.executable,false);assert.equal(Object.hasOwn(d.checklist.waterFloaters,'action'),false);
  }
  assert.equal(app.sent.length,sent);assert.equal(app.collects,2);assert.equal(app.sent.includes('PickUpFloaterRequest'),false);assert.equal(JSON.stringify(app.sessions.get('account-A').snapshot),bytes);
  app.sessions.get('account-A').snapshot.failed.OnWaterRequest='synthetic failure';const v=(await app.call('/api/dailies')).data.checklist;assert.equal(v.waterFloaters.totalCount,null);assert.equal(v.tasks.counts.eligible,1);assert.equal((await app.call('/api/dailies',{account:'account-B'})).data.checklist.waterFloaters.totalCount,7);
 }finally{await app.close();}
});
for(const field of ['accountId','generation','connectionId','playerId','worldId','client'])test('water floater collected cache cannot cross identity '+field,async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>floaterRuntimeSnapshot()});try{
  await app.login();await app.refresh();const s=app.sessions.get('account-A'),sent=app.sent.length;assert.equal((await app.call('/api/dailies')).data.checklist.waterFloaters.totalCount,3);
  if(field==='accountId')s.id='foreign';else if(field==='client')s.client={...s.client,stop(){}};else if(['playerId','worldId'].includes(field))s.player[field]='9007199254740993';else if(field==='generation')s.generation++;else s.connectionId='replacement';
  const v=(await app.call('/api/dailies')).data.checklist.waterFloaters;assert.equal(v.status,'UNKNOWN');assert.equal(v.totalCount,null);assert.equal(v.eligible,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});
test('water floater late former-world collection and restored snapshots never grant pickup or resume',async()=>{
 const gate=deferred();let started=false;const app=await dailyRuntimeHarness({collect:async()=>{started=true;return gate.promise;}});try{
  const first=await app.call('/api/dailies');assert.equal(first.data.checklist.waterFloaters.status,'UNKNOWN');assert.equal(app.clients.length,0);
  const s=app.sessions.get('account-A');s.snapshot=floaterRuntimeSnapshot(9);assert.equal((await app.call('/api/dailies')).data.checklist.waterFloaters.totalCount,null);assert.equal(app.clients.length,0);
  await app.login();const pending=app.refresh();await until(()=>started);s.player.worldId='different';gate.resolve(floaterRuntimeSnapshot());await pending;const sent=app.sent.length,v=(await app.call('/api/dailies')).data.checklist.waterFloaters;assert.equal(v.status,'UNKNOWN');assert.equal(v.totalCount,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{gate.resolve(floaterRuntimeSnapshot());await app.close();}
});
test('water floater push never turns historical species counts into a current pickup qualification',async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>floaterRuntimeSnapshot()});try{
  const socket=await app.login();await app.refresh();const bytes=JSON.stringify(app.sessions.get('account-A').snapshot),sent=app.sent.length;socket.receive('SCRandomWaterFloaters',{floater:[{floaterId:'塑料垃圾1',num:10}]},1);
  const v=(await app.call('/api/dailies')).data.checklist.waterFloaters;assert.equal(v.coverage,'COLLECTED_ON_WATER_ONLY');assert.equal(v.totalCount,3);assert.equal(v.eligible,null);assert.equal(v.executable,false);assert.equal(JSON.stringify(app.sessions.get('account-A').snapshot),bytes);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});

test('task summary HTTP shares exact read-only eligibility with original daily checklist across accounts',async()=>{
 const app=await dailyRuntimeHarness({collect:async client=>{const state=dailyRuntimeSnapshot();state.raw.AchievementInfoRequest.task=[{id:1,progress:client.factContext.accountId==='account-A'?'2':'10',targetProgress:'10',rewardClaimed:false}];state.ok.AchievementInfoRequest={task:[{id:1,progress:100,targetProgress:1,rewardClaimed:false}]};return state;}});try{
  for(const account of ['account-A','account-B']){await app.login(account);await app.refresh(account);}
  const sent=app.sent.length,bytes=JSON.stringify(app.sessions.get('account-A').snapshot);
  for(const account of ['account-A','account-B']){const summary=(await app.call('/api/overview',{account})).data,detail=(await app.call('/api/dailies',{account})).data.checklist;assert.equal(summary.claimable.achievement,detail.achievements.counts.eligible);assert.equal(summary.claimable.achievement,account==='account-A'?0:1);assert.equal(summary.claimable.daily,detail.tasks.counts.eligible);assert.doesNotMatch(summary.text,/个可领奖/);}
  delete app.sessions.get('account-A').snapshot.raw.DailyTaskInfoRequest.dailyTask[0].rewardClaimed;assert.equal((await app.call('/api/overview')).data.claimable.daily,null);assert.equal((await app.call('/api/dailies')).data.checklist.tasks.counts.eligible,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,2);assert.equal(bytes.includes('rewardClaimed'),true);
 }finally{await app.close();}
});

function mainSummaryRuntimeSnapshot(task={taskId:1,progress:15,rewardClaimed:false}){
 const state=taskRuntimeSnapshot();state.raw.MainTaskInfoRequest={...(task===null?{}:{task}),branch:[]};state.ok.MainTaskInfoRequest=structuredClone(state.raw.MainTaskInfoRequest);state.outcomes.MainTaskInfoRequest={status:'SUCCESS'};return state;
}
test('main task summary shares original target qualification and never treats existence as claimability',async()=>{
 let state=mainSummaryRuntimeSnapshot();const app=await dailyRuntimeHarness({collect:async()=>structuredClone(state)});try{
  await app.login();
  for(const [label,task,expected]of [
   ['incomplete',{taskId:1,progress:14,rewardClaimed:false},0],['complete unclaimed',{taskId:1,progress:15,rewardClaimed:false},1],['already claimed',{taskId:1,progress:15,rewardClaimed:true},0],['missing reward flag',{taskId:1,progress:15},null],['missing identity',{progress:15,rewardClaimed:false},null],['unknown config identity',{taskId:2147483647,progress:15,rewardClaimed:false},null],['invalid count',{taskId:1,progress:'15garbage',rewardClaimed:false},null],['absent task',null,null]
  ]){
   state=mainSummaryRuntimeSnapshot(task);await app.refresh();const sent=app.sent.length,summary=(await app.call('/api/overview')).data,tasks=(await app.call('/api/tasks')).data;
   assert.equal(summary.claimable.mainTask,expected,label);const qualified=tasks.main?.qualification?.claimable;assert.equal(summary.claimable.mainTask,qualified===true?1:qualified===false?0:null,label+' same original parser');assert.equal(app.sent.length,sent);
  }
 }finally{await app.close();}
});
for(const field of ['accountId','generation','connectionId','playerId','worldId','client'])test('main task summary cannot transfer or revive qualification across '+field,async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>mainSummaryRuntimeSnapshot()});try{
  await app.login();await app.refresh();const s=app.sessions.get('account-A'),sent=app.sent.length;assert.equal((await app.call('/api/overview')).data.claimable.mainTask,1);
  const obj=field==='accountId'?s:['playerId','worldId'].includes(field)?s.player:s,key=field==='accountId'?'id':field,old=obj[key];obj[key]=field==='client'?{...old,stop(){}}:field==='generation'?old+1:'different';
  const invalid=(await app.call('/api/overview')).data;assert.equal(invalid.claimable.mainTask,null);assert.equal(invalid.claimable.daily,null);assert.equal(invalid.claimable.achievement,null);obj[key]=old;assert.equal((await app.call('/api/overview')).data.claimable.mainTask,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});
test('main task summary unknowns follow accepted task changes and daily reset without extra requests',async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>mainSummaryRuntimeSnapshot()});try{
  const socket=await app.login();socket.receive('SCMainTaskUpdate',{task:{taskId:1,progress:15,rewardClaimed:false}},1);await app.refresh();assert.equal((await app.call('/api/overview')).data.claimable.mainTask,1);const sent=app.sent.length;
  socket.receive('SCMainTaskUpdate',{task:{taskId:1,progress:15,rewardClaimed:true}},2);let v=(await app.call('/api/overview')).data;assert.equal(v.claimable.mainTask,null);assert.equal(v.claimable.daily,1);
  socket.receive('SCDailyTaskReset',{dailyResetTime:1780086400},3);v=(await app.call('/api/overview')).data;assert.equal(v.claimable.mainTask,null);assert.equal(v.claimable.daily,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});
test('main task summary restored or failed exact source stays unknown with zero implicit reconnect',async()=>{
 const app=await dailyRuntimeHarness({collect:async()=>mainSummaryRuntimeSnapshot()});try{
  await app.call('/api/overview');app.sessions.get('account-A').snapshot=mainSummaryRuntimeSnapshot();assert.equal((await app.call('/api/overview')).data.claimable.mainTask,null);assert.equal(app.clients.length,0);assert.equal(app.collects,0);assert.equal(app.sent.length,0);
  await app.login();await app.refresh();const s=app.sessions.get('account-A'),sent=app.sent.length;delete s.snapshot.raw.MainTaskInfoRequest;assert.equal((await app.call('/api/overview')).data.claimable.mainTask,null);s.snapshot.raw.MainTaskInfoRequest={task:{taskId:1,progress:15,rewardClaimed:false}};s.snapshot.failed.MainTaskInfoRequest='synthetic-error';assert.equal((await app.call('/api/overview')).data.claimable.mainTask,null);assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});

test('main task summary local Codec keeps explicit false distinct from omitted inherited defaults',async()=>{
 const codec=createCodec(loadProtocol());let state;const app=await dailyRuntimeHarness({collect:async()=>state});try{
  await app.login();for(const flag of [false,true,undefined]){
   const task={taskId:1,progress:15,...(flag===undefined?{}:{rewardClaimed:flag})};state=mainSummaryRuntimeSnapshot(task);state.raw.MainTaskInfoRequest=codec.decode(codec.encode('MainTaskInfoResponse',1,{task,branch:[]})).body;state.ok.MainTaskInfoRequest={task:{taskId:1,progress:999,rewardClaimed:false}};await app.refresh();const sent=app.sent.length,result=(await app.call('/api/overview')).data;assert.equal(result.claimable.mainTask,flag===undefined?null:flag?0:1);assert.equal(app.sent.length,sent);
  }
 }finally{await app.close();}
});


function directoryRuntimeSnapshot(client){const state=dailyRuntimeSnapshot();state.sessionFacts={activityDirectory:readActivityDirectorySnapshot(client)};return state;}
test('directory HTTP shares collected private metadata across original pages without game reads or writes',async()=>{
 const app=await dailyRuntimeHarness({collect:async client=>directoryRuntimeSnapshot(client)});try{
  for(const [account,period]of [['account-A',7],['account-B',8]]){const socket=await app.login(account);socket.receive('SCAllActivity',{trade:{period,startTime:0,endTime:100}},1);await app.refresh(account);}
  const sent=app.sent.length,bytes=JSON.stringify(app.sessions.get('account-A').snapshot);
  for(const [account,period]of [['account-A',7],['account-B',8]]){
   const daily=(await app.call('/api/dailies',{account})).data.checklist.activityDirectory,overview=(await app.call('/api/overview',{account})).data.activityAlliance.checklist.activityDirectory;
   assert.equal(daily.status,'OBSERVED');assert.deepEqual(overview,daily);assert.equal(daily.sections.find(row=>row.field==='trade').rows[0].identity.period,period);assert.equal(daily.eligible,null);assert.equal(daily.executable,false);assert.equal(daily.complete,false);
  }
  assert.equal(app.sent.length,sent);assert.equal(app.collects,2);assert.equal(JSON.stringify(app.sessions.get('account-A').snapshot),bytes);
 }finally{await app.close();}
});
for(const field of ['accountId','generation','connectionId','playerId','worldId','client'])test('directory HTTP cache cannot revive after '+field+' changes',async()=>{
 const app=await dailyRuntimeHarness({collect:async client=>directoryRuntimeSnapshot(client)});try{
  const socket=await app.login();socket.receive('SCAllActivity',{trade:{period:7,startTime:0,endTime:100}},1);await app.refresh();const session=app.sessions.get('account-A'),sent=app.sent.length;
  assert.equal((await app.call('/api/dailies')).data.checklist.activityDirectory.status,'OBSERVED');
  const target=['playerId','worldId'].includes(field)?session.player:session,key=field==='accountId'?'id':field,old=target[key];target[key]=field==='generation'?old+1:field==='client'?{...old,stop(){}}:'changed';
  assert.equal((await app.call('/api/dailies')).data.checklist.activityDirectory.status,'UNKNOWN');assert.equal((await app.call('/api/overview')).data.activityAlliance.checklist.activityDirectory.status,'UNKNOWN');target[key]=old;
  assert.equal((await app.call('/api/dailies')).data.checklist.activityDirectory.status,'UNKNOWN');assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});
test('directory HTTP public snapshot restore cannot substitute for a current collection binding',async()=>{
 const app=await dailyRuntimeHarness({collect:async client=>directoryRuntimeSnapshot(client)});try{
  const socket=await app.login();socket.receive('SCAllActivity',{trade:{period:7,startTime:0,endTime:100}},1);await app.refresh();const session=app.sessions.get('account-A');const restored=JSON.parse(JSON.stringify(session.snapshot));session.snapshot=restored;const sent=app.sent.length;
  for(const route of ['/api/dailies','/api/overview']){const result=(await app.call(route)).data,view=route==='/api/dailies'?result.checklist.activityDirectory:result.activityAlliance.checklist.activityDirectory;assert.equal(view.status,'UNKNOWN');assert.equal(view.executable,false);assert.equal(view.eligible,null);}
  assert.equal(app.sent.length,sent);assert.equal(app.collects,1);
 }finally{await app.close();}
});
