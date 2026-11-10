import assert from 'node:assert/strict';
import test from 'node:test';
import { GameClient, PING_TIMEOUT_MS } from '../src/client.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createCodec } from '../src/codec.mjs';
import { createB2Diagnostics } from '../tools/b2-harness.mjs';

// All credentials, sockets and responses in this file are synthetic. No store is read.
const protocol = loadProtocol();
const codec = createCodec(protocol);
const instant = '2026-11-10T12:00:00.000Z';
const login = Object.freeze({ eworldParams: { openId: 'C1_SYNTHETIC_OPENID', token: 'C1_SYNTHETIC_TOKEN', sign: 'C1_SYNTHETIC_SIGN', timestamp: 1 } });
const secretValues = [login.eworldParams.openId, login.eworldParams.token, login.eworldParams.sign, 'C1_SYNTHETIC_AUTHORIZATION', 'a1b2c3d4_SYNTHETIC_FRAME'];

function setup(t, { failSend, persistFirstFailure, now = () => instant } = {}) {
  const sockets = [], persisted = [];
  class FakeWebSocket {
    constructor(url) { assert.equal(url, 'wss://c1-offline.invalid/ws'); this.readyState = 0; this.sent = []; this.closes = []; sockets.push(this); }
    send(bytes) {
      assert.equal(this.readyState, 1);
      const decoded = codec.decode(bytes);
      failSend?.(decoded);
      this.sent.push(decoded);
    }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(name, body, seq = 0) { this.onmessage?.({ data: codec.encode(name, seq, body) }); }
    malformed() { this.onmessage?.({ data: new Uint8Array([0, 1, 2]) }); }
    end(code = 1006, reason = 'synthetic closed') { this.readyState = 3; this.onclose?.({ code, reason }); }
    close(code, reason) { this.readyState = 3; this.closes.push({ code, reason }); }
  }
  const client = new GameClient({ url: 'wss://c1-offline.invalid/ws', protocol, WebSocketImpl: FakeWebSocket });
  const diagnostics = createB2Diagnostics({ getSecrets: () => secretValues, now,
    persistFirstFailure: value => { persisted.push(structuredClone(value)); persistFirstFailure?.(value); } });
  diagnostics.attach(client);
  t.after(() => client.stop());
  return { client, diagnostics, sockets, persisted };
}
async function ready(env) {
  const pending = env.client.connect(login);
  const socket = env.sockets.at(-1); socket.open();
  socket.receive('LoginResponse', { result: 0, initSeqNo: 12, playerInfo: { nickname: 'C1_OFFLINE', mainlineStage: 138 } });
  const response = await pending;
  assert.equal(response.result, 0);
  return socket;
}
function clean(client) {
  assert.equal(client.socket, null);
  assert.equal(client.tickTimer, null);
  assert.equal(client.ackTimer, null);
  assert.equal(client.loginAttempt, null);
  assert.equal(client.loginPromise, null);
  assert.equal(client.pending.length, 0);
  assert.equal(client.watchers.length, 0);
}
function noSecret(value) {
  const text = JSON.stringify(value);
  for (const secret of secretValues) assert.equal(text.includes(secret), false, 'diagnostic contains a synthetic secret');
  return text;
}

test('B2 guard permits successful LoginResponse, READY and exactly one initial PingRequest', async t => {
  const env = setup(t); const socket = await ready(env);
  assert.equal(env.client.state, 'READY'); assert.equal(env.client.connected, true);
  assert.deepEqual(socket.sent.map(x => x.name), ['LoginRequest', 'PingRequest']);
  assert.equal(env.diagnostics.getFirstFailure(), null);
  assert.equal(env.persisted.length, 0);
  assert.match(JSON.stringify(env.diagnostics.getEvents()), /LoginResponse/);
});

test('B2 guard permits Ack and leaves a heartbeat-acknowledged client READY', async t => {
  const env = setup(t); const socket = await ready(env);
  const timestamp = env.client.lastPingTimestamp;
  socket.receive('PingResponse', { clientTimestamp: timestamp, serverTimestamp: timestamp }, 0);
  assert.equal(env.client.lastPingTimestamp, 0);
  env.client.sendNoSeq('Ack', { seqNo: 12 });
  assert.equal(socket.sent.at(-1).name, 'Ack');
  assert.equal(env.client.state, 'READY');
  assert.equal(env.diagnostics.getFirstFailure(), null);
});

test('B2 guard refuses Nack and other unapproved no-sequence messages before transport send', async t => {
  const env = setup(t); const socket = await ready(env); const count = socket.sent.length;
  for (const name of ['Nack', 'ChallengeStageRequest', 'WorkerOrderRefreshRequest', 'UnknownRequest']) {
    assert.throws(() => env.client.sendNoSeq(name, { stage: 138 }), /Unapproved no-sequence send blocked/);
  }
  assert.equal(socket.sent.length, count);
});

test('genuine initial Ping send error preserves the original error before terminal cleanup', async t => {
  const root = new Error('synthetic ping transport failure'); root.code = 'C1_PING_SEND';
  const env = setup(t, { failSend: ({ name }) => { if (name === 'PingRequest') throw root; } });
  let persistedBeforeFailed = false;
  env.client.on('state', ({ state }) => {
    if (state === 'FAILED') {
      persistedBeforeFailed = env.persisted.length === 1;
      env.diagnostics.capture(new Error('Terminal client state: FAILED'), { eventType: 'state', state });
    }
  });
  const rejected = assert.rejects(env.client.connect(login), error => error === root);
  const socket = env.sockets[0]; socket.open(); socket.receive('LoginResponse', { result: 0, initSeqNo: 12 });
  await rejected;
  const first = env.diagnostics.getFirstFailure();
  assert.equal(env.client.state, 'FAILED');
  assert.equal(first.at, instant); assert.equal(first.beforeState, 'READY');
  assert.equal(first.state, 'FAILED'); assert.equal(first.eventType, 'loginFailed');
  assert.equal(first.messageType, 'PingRequest');
  assert.equal(first.error.name, 'Error'); assert.equal(first.error.message, root.message); assert.equal(first.error.code, root.code);
  assert.equal(persistedBeforeFailed, true); assert.equal(env.persisted.length, 1);
  clean(env.client);
});

test('a later terminal error, catch and stop cannot replace the first failure', async t => {
  const env = setup(t); await ready(env);
  env.client.lastPingTimestamp = Date.now() - PING_TIMEOUT_MS - 10;
  env.client.tick();
  const original = structuredClone(env.diagnostics.getFirstFailure());
  assert.equal(original.error.message, 'ping timeout');
  assert.equal(original.beforeState, 'READY'); assert.equal(original.eventType, 'pingTimeout');
  env.diagnostics.capture(new Error('Terminal client state: FAILED'), { eventType: 'state', beforeState: 'FAILED' });
  env.diagnostics.capture(new Error('API canceled'), { eventType: 'catch' });
  env.client.stop();
  assert.deepEqual(env.diagnostics.getFirstFailure(), original);
  assert.equal(env.persisted.length, 1); clean(env.client);
});

test('first-failure snapshots cannot be mutated by callers or persistence callbacks', t => {
  const env = setup(t, { persistFirstFailure: value => { value.error.message = 'callback mutation'; } });
  env.diagnostics.capture(new Error('original synthetic error'), { beforeState: 'CONNECTING', eventType: 'error', messageType: 'LoginRequest', state: 'FAILED' });
  const first = env.diagnostics.getFirstFailure(); first.error.message = 'caller mutation';
  assert.equal(env.diagnostics.getFirstFailure().error.message, 'original synthetic error');
});

test('WebSocket close code and reason are recorded before connection resources are discarded', async t => {
  const env = setup(t); const pending = assert.rejects(env.client.connect(login), /socket closed/);
  env.sockets[0].open(); env.sockets[0].end(4002, 'synthetic remote closure'); await pending;
  const first = env.diagnostics.getFirstFailure();
  assert.equal(first.beforeState, 'CONNECTING'); assert.equal(first.eventType, 'socketClosed');
  assert.equal(first.state, 'CLOSED');
  assert.deepEqual(first.close, { code: 4002, reason: 'synthetic remote closure' });
  assert.equal(env.persisted.length, 1); clean(env.client);
});

test('login rejection preserves response metadata and the first rejection error', async t => {
  const env = setup(t); const pending = assert.rejects(env.client.connect(login), /login rejected/);
  env.sockets[0].open(); env.sockets[0].receive('LoginResponse', { result: 3, errorMessage: 'synthetic refusal' }); await pending;
  const first = env.diagnostics.getFirstFailure();
  assert.equal(first.eventType, 'loginRejected'); assert.equal(first.state, 'REJECTED');
  assert.equal(first.beforeState, 'CONNECTING'); assert.equal(first.messageType, 'LoginResponse');
  assert.match(first.error.message, /result=3/);
  assert.match(JSON.stringify(env.diagnostics.getEvents()), /LoginResponse/); clean(env.client);
});

test('login timeout is recorded once and never needs a real socket', async t => {
  const env = setup(t);
  await assert.rejects(env.client.connect(login, { timeout: 5 }), /login timeout/);
  const first = env.diagnostics.getFirstFailure();
  assert.equal(first.eventType, 'loginTimeout'); assert.equal(first.beforeState, 'CONNECTING');
  assert.equal(first.state, 'FAILED'); assert.equal(env.persisted.length, 1); clean(env.client);
});

test('malformed authentication bytes are captured as a decode failure and retain first cause', async t => {
  const env = setup(t); const pending = assert.rejects(env.client.connect(login));
  env.sockets[0].open(); env.sockets[0].malformed(); await pending;
  const first = env.diagnostics.getFirstFailure();
  assert.equal(first.beforeState, 'CONNECTING'); assert.equal(first.state, 'FAILED');
  assert.equal(typeof first.error.message, 'string'); assert.ok(first.error.message.length > 0);
  assert.equal(env.persisted.length, 1); clean(env.client);
});

test('diagnostics recursively redact Token, Sign, Authorization and raw-frame material', t => {
  const env = setup(t);
  const nested = new Error('nested token=' + secretValues[1]);
  nested.sign = secretValues[2];
  const error = new Error('transport failed: ' + secretValues[1] + ' Authorization: ' + secretValues[3], { cause: nested });
  error.token = secretValues[1]; error.sign = secretValues[2];
  error.details = { auth: { Authorization: secretValues[3] }, loginFrameHex: secretValues[4] };
  env.diagnostics.capture(error, { at: instant, beforeState: 'READY', eventType: 'error', messageType: 'PingRequest', state: 'FAILED', close: { code: 4002, reason: 'token=' + secretValues[1] } });
  noSecret(env.diagnostics.getFirstFailure()); noSecret(env.persisted); noSecret(env.diagnostics.getEvents());
});

test('auth and state diagnostics never contain decoded bodies or raw frame bytes', async t => {
  const env = setup(t); await ready(env);
  const text = noSecret(env.diagnostics.getEvents());
  assert.equal(text.includes('eworldParams'), false); assert.equal(text.includes('"bytes"'), false);
  assert.equal(text.includes('"body"'), false);
});

test('diagnostic persistence failure cannot prevent GameClient cleanup', async t => {
  const env = setup(t, { persistFirstFailure: () => { throw new Error('synthetic diagnostic disk failure'); } });
  const pending = assert.rejects(env.client.connect(login), /socket error during login/);
  env.sockets[0].onerror?.(); await pending;
  assert.equal(env.client.state, 'FAILED');
  assert.equal(env.diagnostics.getFirstFailure().error.message, 'socket error during login'); clean(env.client);
});
