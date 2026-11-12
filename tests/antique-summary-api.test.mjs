import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-antique-summary-api-'));
process.env.CW_DATA_DIR = root;
process.env.CW_CONFIG_PACK = path.join(root, 'absent-config.json');
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const { createExecutionHistory } = await import('../src/execution-history.mjs');
const { createModuleSettings } = await import('../src/gameplay-settings.mjs');
const { GAMEPLAY_MODULES } = await import('../src/function-registry.mjs');
const { loadProtocol } = await import('../src/proto.mjs');
const { toSnapshotJson } = await import('../src/game.mjs');

const protocol = loadProtocol();
const wire = (name, value) => protocol[name].decode(protocol[name].encode(value).finish());
const attr = protocol.EnhanceAttr.attriGain_healthPoint_base;
const account = id => ({
  id, label: 'synthetic-' + id, url: 'wss://example.invalid/ws',
  login: { eworldParams: { openId: id, token: 'synthetic-antique-token', sign: 'synthetic-antique-sign', timestamp: 1 } },
});
const response = value => ({
  items: [
    { attrValue: { attr, value } },
    { heroCamp: '阵营A', attrValue: { attr, value: 1.25 } },
    { heroProf: '射手', attrValue: { attr, value: -2.5 } },
  ],
  effects: [{ effectId: 'synthetic-effect', value: 0.125 }],
});

function harness() {
  const dir = fs.mkdtempSync(path.join(root, 'case-'));
  saveStore({ version: 1, activeId: 'A', accounts: [account('A'), account('B')] });
  const history = createExecutionHistory({ file: path.join(dir, 'execution-history.json') });
  const moduleSettings = createModuleSettings({ file: path.join(dir, 'module-settings.json'), modules: GAMEPLAY_MODULES });
  let clients = 0, collections = 0, csrf;
  const app = createConsole({
    protocol, tracePath: path.join(dir, 'trace.log'),
    clientFactory() { clients++; throw Error('Real clients forbidden'); },
    collect() { collections++; throw Error('Full collection forbidden'); },
    writerOwnership: { assertOwned() {}, release() {}, claim() {} },
    operationOptions: {
      history, moduleSettings, getConfig: () => ({ tables: {} }),
      loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }),
      loadProduction: () => ({ config: { version: 1, enabled: false } }),
    },
  });
  app.server.address = () => ({ port: 17322 });
  const origin = 'http://127.0.0.1:17322';
  function ready(id = 'A') {
    const state = { reads: [], writes: [], value: id === 'A' ? 7.75 : 11, onRead: null };
    const client = new EventEmitter();
    Object.assign(client, {
      connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Map(),
      factContext: { accountId: id, generation: 1, connectionId: 'offline-antique-' + id },
      stop() { this.connected = false; },
      async request(name, body, reply, timeout, options) {
        assert.equal(name, 'AntiqueAttrSummaryRequest');
        assert.equal(reply, 'AntiqueAttrSummaryResponse');
        assert.deepEqual(toSnapshotJson(wire(name, body)), {});
        assert.equal(options?.mutate, undefined);
        state.reads.push({ name, body: structuredClone(body), reply });
        await state.onRead?.();
        return wire(reply, response(state.value));
      },
      send() { state.writes.push('send'); throw Error('Writes forbidden'); },
      sendWatch() { state.writes.push('watch'); throw Error('Writes forbidden'); },
    });
    const session = {
      id, client, player: { playerId: id === 'A' ? '17' : '19', worldId: '9', level: 30 },
      generation: 1, connectionId: 'offline-antique-' + id, state: 'READY',
      abort: new AbortController(), busy: null, loop: { running: false, stop: {} },
      log: [], snapshot: { ok: {}, failed: {} }, snapshotStale: false, synthetic: state,
    };
    app.sessions.set(id, session);
    return session;
  }
  function call(route = '/api/antiques/summary', { id = 'A', body = {}, method = 'POST', headers = {}, authorized = true, rawBody } = {}) {
    return new Promise(resolve => {
      const url = new URL(route, origin);
      if (id !== null) url.searchParams.set('account', id);
      const req = new EventEmitter();
      Object.assign(req, {
        url: url.pathname + url.search, method,
        headers: {
          host: '127.0.0.1:17322', 'content-type': 'application/json',
          ...(authorized ? { origin, ...(csrf ? { 'x-cw-csrf': csrf } : {}) } : {}), ...headers,
        },
      });
      const res = {
        writeHead(status) { this.status = status; },
        end(text) {
          const data = JSON.parse(text);
          if (data.csrfToken) csrf = data.csrfToken;
          resolve({ status: this.status, data, text });
        },
      };
      app.server.emit('request', req, res);
      if (method !== 'GET') req.emit('data', Buffer.from(rawBody === undefined ? JSON.stringify(body) : rawBody));
      req.emit('end');
    });
  }
  const context = () => call('/api/gameplay?module=museum', { method: 'GET' });
  const cleanup = async () => {
    await app.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(root));
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { ...app, history, call, context, ready, cleanup, counts: () => ({ clients, collections }) };
}

test.after(() => {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  fs.rmSync(root, { recursive: true, force: true });
});

test('Antique read requires an existing READY session and never creates clients or full collection', async () => {
  const f = harness();
  try {
    assert.equal((await f.context()).status, 200);
    const missing = await f.call();
    assert.equal(missing.status, 409);
    assert.equal(missing.data.code, 'NOT_CONNECTED');
    assert.equal(f.sessions.size, 0);
    const session = f.ready();
    session.client.connected = false;
    assert.equal((await f.call()).data.code, 'NOT_CONNECTED');
    session.client.connected = true;
    session.state = 'CONNECTING';
    assert.equal((await f.call()).data.code, 'NOT_CONNECTED');
    assert.equal(session.synthetic.reads.length, 0);
    assert.deepEqual(f.counts(), { clients: 0, collections: 0 });
    assert.deepEqual(f.history.list('A'), []);
    assert.equal(f.server.listening, false);
  } finally { await f.cleanup(); }
});

test('Antique HTTP validates Origin CSRF JSON account and exact fields before any game reads', async () => {
  const f = harness(), session = f.ready();
  try {
    await f.context();
    for (const extra of [
      { authorized: false }, { headers: { 'x-cw-csrf': undefined } },
      { headers: { 'x-cw-csrf': 'forged' } }, { headers: { origin: 'https://invalid.example' } },
      { headers: { host: 'invalid.example' } }, { headers: { 'sec-fetch-site': 'cross-site' } },
      { headers: { 'content-type': 'text/plain' } },
    ]) assert.equal((await f.call(undefined, extra)).status, 403);
    for (const id of [null, 'missing', 'synthetic-A']) {
      assert.equal((await f.call(undefined, { id })).status, id === null ? 400 : 404);
    }
    for (const route of ['/api/antiques/summary?account=A&account=B', '/api/antiques/summary?account=A&account=A']) {
      assert.equal((await f.call(route, { id: null })).status, 400);
    }
    assert.equal((await f.call('/api/antiques/summary?extra=x')).status, 400);
    for (const body of [
      null, [], 1, 'x', { request: 'ActivateAntiqueRequest' }, { body: {} }, { parameters: {} },
      { allowPaid: true }, { accountId: 'B' }, { confirm: true }, { permitId: 'forged' },
    ]) assert.equal((await f.call(undefined, { body })).status, 400, JSON.stringify(body));
    assert.equal((await f.call(undefined, { rawBody: '{' })).status, 400);
    assert.equal(session.synthetic.reads.length, 0);
    assert.equal(session.synthetic.writes.length, 0);
    assert.deepEqual(f.counts(), { clients: 0, collections: 0 });
  } finally { await f.cleanup(); }
});

test('Antique HTTP returns one exact scoped typed read with no write history plan or permit', async () => {
  const f = harness(), a = f.ready(), b = f.ready('B');
  try {
    await f.context();
    const result = await f.call();
    assert.equal(result.status, 200, result.text);
    assert.equal(result.data.accountId, 'A');
    assert.equal(result.data.source, 'AntiqueAttrSummaryResponse');
    assert.equal(result.data.readOnly, true);
    assert.ok(Number.isFinite(Date.parse(result.data.surveyedAt)));
    assert.deepEqual(result.data.view, {
      status: 'AVAILABLE', reason: null,
      global: [{ attr, value: 7.75, name: null, viewType: null }],
      camps: [{ id: '阵营A', name: null, attributes: [{ attr, value: 1.25, name: null, viewType: null }] }],
      professions: [{ id: '射手', name: null, attributes: [{ attr, value: -2.5, name: null, viewType: null }] }],
      effects: [{ effectId: 'synthetic-effect', value: 0.125, description: null, viewType: null }],
    });
    assert.deepEqual(a.synthetic.reads, [{ name: 'AntiqueAttrSummaryRequest', body: {}, reply: 'AntiqueAttrSummaryResponse' }]);
    assert.equal(b.synthetic.reads.length, 0);
    assert.equal(a.synthetic.writes.length, 0);
    assert.equal(a.busy, null);
    for (const key of ['batchId', 'planHash', 'actions', 'permitId']) assert.equal(Object.hasOwn(result.data, key), false);
    assert.equal(result.text.includes('synthetic-antique-token'), false);
    assert.equal(result.text.includes('synthetic-antique-sign'), false);
    assert.deepEqual(f.history.list('A'), []);
    assert.equal(f.operations.view('A').lastPlan, null);
    assert.equal(f.operations.workflowBudget('A'), null);
    assert.equal(f.operations.moduleView('A', 'museum').config.enabled, false);
    const second = await f.call(undefined, { id: 'B' });
    assert.equal(second.data.accountId, 'B');
    assert.equal(second.data.view.global[0].value, 11);
    assert.equal(b.synthetic.reads.length, 1);
    assert.deepEqual(f.counts(), { clients: 0, collections: 0 });
    assert.equal(f.server.listening, false);
  } finally { await f.cleanup(); }
});

for (const [label, change] of [
  ['held account', s => { s.busy = 'other'; }],
  ['workflow owner', s => { s.workflowOwner = 'other'; }],
  ['running loop', s => { s.loop.running = true; }],
  ['pending request', s => { s.client.pending.push({}); }],
  ['late response', s => { s.client.lateResponses.set('late', true); }],
  ['unverified write', s => { s.client.uncertainWrites.set('write', true); }],
]) test('Antique read honors ' + label + ' without another transport call', async () => {
  const f = harness(), session = f.ready();
  try {
    await f.context();
    change(session);
    const blocked = await f.call();
    assert.equal(blocked.status, 409);
    assert.equal(session.synthetic.reads.length, 0);
    assert.equal(session.synthetic.writes.length, 0);
    assert.deepEqual(f.history.list('A'), []);
  } finally {
    session.loop.running = false;
    session.workflowOwner = null;
    session.busy = null;
    await f.cleanup();
  }
});

for (const [label, change] of [
  ['generation', s => { s.generation++; }],
  ['client', s => { s.client = Object.assign(new EventEmitter(), { connected: true, stop() {} }); }],
  ['player', s => { s.player = { ...s.player, playerId: '99' }; }],
  ['world', s => { s.player = { ...s.player, worldId: '99' }; }],
]) test('Antique delayed ' + label + ' drift discards the scoped response', async () => {
  const f = harness(), session = f.ready();
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  let entered;
  const reading = new Promise(resolve => { entered = resolve; });
  session.synthetic.onRead = () => { entered(); return wait; };
  try {
    const pending = f.operations.surveyAntiqueAttributes(session, {});
    await reading;
    change(session);
    release();
    await assert.rejects(pending, { code: 'CANCELLED' });
    assert.equal(session.synthetic.reads.length, 1);
    assert.equal(session.synthetic.writes.length, 0);
    assert.deepEqual(f.history.list('A'), []);
    assert.equal(f.operations.view('A').lastPlan, null);
  } finally { release(); await f.cleanup(); }
});

test('Antique concurrent read keeps one account lock and never changes the write pipeline', async () => {
  const f = harness(), session = f.ready();
  let release, entered;
  const wait = new Promise(resolve => { release = resolve; });
  const reading = new Promise(resolve => { entered = resolve; });
  session.synthetic.onRead = () => { entered(); return wait; };
  try {
    const first = f.operations.surveyAntiqueAttributes(session, {});
    await reading;
    assert.ok(session.busy);
    await assert.rejects(f.operations.surveyAntiqueAttributes(session, {}), { code: 'ACCOUNT_BUSY' });
    assert.equal(session.synthetic.reads.length, 1);
    release();
    const result = await first;
    assert.equal(result.view.status, 'AVAILABLE');
    assert.equal(session.busy, null);
    assert.equal(session.synthetic.writes.length, 0);
    assert.deepEqual(f.history.list('A'), []);
    assert.equal(f.operations.view('A').lastPlan, null);
  } finally { release(); await f.cleanup(); }
});
