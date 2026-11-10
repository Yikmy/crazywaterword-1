import assert from 'node:assert/strict';
import test from 'node:test';
import { GameClient, PING_TIMEOUT_MS } from '../src/client.mjs';

// No real socket or protocol asset is used in these lifecycle checks.
const codec = {
  encode: (name, seq, body = {}) => Buffer.from(JSON.stringify({ name, seq, body })),
  decode: (bytes) => JSON.parse(Buffer.from(bytes).toString()),
};
function setup() {
  const sockets = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.closes = []; sockets.push(this); }
    send(frame) { if (this.readyState !== 1) throw new Error('socket not open'); this.sent.push(codec.decode(frame)); }
    close(code, reason) { this.closes.push({ code, reason }); this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(name, body, seq = 0) { this.onmessage?.({ data: codec.encode(name, seq, body) }); }
    end(code = 1006) { this.readyState = 3; this.onclose?.({ code, reason: '' }); }
  }
  const client = new GameClient({ protocol: {}, WebSocketImpl: FakeSocket });
  client.codec = codec;
  return { client, sockets };
}
async function ready(env) {
  const promise = env.client.connect({ eworldParams: { openId: 'synthetic' } });
  const socket = env.sockets.at(-1);
  socket.open();
  socket.receive('LoginResponse', { result: 0, initSeqNo: 12, playerInfo: { nickname: 'fixture' } });
  await promise;
  return socket;
}
function cleaned(client, state) {
  assert.equal(client.state, state);
  assert.equal(client.socket, null);
  assert.equal(client.loginPromise, null);
  assert.equal(client.loginAttempt, null);
  assert.equal(client.tickTimer, null);
  assert.equal(client.ackTimer, null);
  assert.equal(client.nextAckSeqNo, null);
  assert.equal(client.lastPingTimestamp, 0);
  assert.equal(client.pending.length, 0);
  assert.equal(client.watchers.length, 0);
}

test('concurrent connect shares login and READY reuses its response', async (t) => {
  const env = setup(); t.after(() => env.client.stop());
  const first = env.client.connect({});
  assert.equal(first, env.client.connect({}));
  assert.equal(env.sockets.length, 1);
  const socket = env.sockets[0]; socket.open();
  socket.receive('LoginResponse', { result: 0, initSeqNo: 1 });
  const response = await first;
  assert.equal(await env.client.connect({}), response);
  assert.equal(env.sockets.length, 1);
  assert.equal(socket.sent.filter((frame) => frame.name === 'LoginRequest').length, 1);
});

test('login timeout closes socket and clears all resources', async () => {
  const { client, sockets } = setup();
  await assert.rejects(client.connect({}, { timeout: 5 }), /login timeout/);
  cleaned(client, 'FAILED');
  assert.equal(sockets[0].closes.length, 1);
});

test('rejected login closes socket and preserves rejection response', async () => {
  const { client, sockets } = setup();
  const pending = assert.rejects(client.connect({}), (error) => error.loginResponse.result === 3);
  sockets[0].open(); sockets[0].receive('LoginResponse', { result: 3, errorMessage: 'synthetic rejected' });
  await pending; cleaned(client, 'REJECTED');
  assert.equal(sockets[0].closes.length, 1);
});

test('stop while CONNECTING rejects shared callers and ignores stale callbacks', async (t) => {
  const env = setup(); t.after(() => env.client.stop());
  const first = env.client.connect({}); const socket = env.sockets[0];
  const staleMessage = socket.onmessage;
  const rejected = assert.rejects(first, /client stopped/);
  env.client.stop(); await rejected; cleaned(env.client, 'STOPPED');
  staleMessage({ data: codec.encode('LoginResponse', 0, { result: 0 }) });
  cleaned(env.client, 'STOPPED');
  await ready(env); assert.equal(env.sockets.length, 2);
});

test('close during login rejects immediately', async () => {
  const { client, sockets } = setup();
  const rejected = assert.rejects(client.connect({}), /socket closed/);
  sockets[0].end(); await rejected; cleaned(client, 'CLOSED');
});

test('normal close cancels pending requests, watchers and ack timer', async () => {
  const env = setup(); const socket = await ready(env);
  const requested = assert.rejects(env.client.request('ReadRequest', {}), /socket closed/);
  const watched = assert.rejects(env.client.sendWatch('WatchRequest', {}, { window: 10000 }), /socket closed/);
  env.client.ack(1); assert.ok(env.client.ackTimer);
  socket.end(); await Promise.all([requested, watched]); cleaned(env.client, 'CLOSED');
});

test('heartbeat timeout transitions out of READY and settles in-flight work', async () => {
  const env = setup(); const socket = await ready(env);
  const rejected = assert.rejects(env.client.request('ReadRequest', {}), /ping timeout/);
  env.client.lastPingTimestamp = Date.now() - PING_TIMEOUT_MS - 1;
  env.client.tick(); await rejected; cleaned(env.client, 'FAILED');
  assert.equal(socket.closes.length, 1);
});

test('channel expiry and resend failure release connection and reject work', async () => {
  for (const [message, state, reason] of [['SCChannelExpired', 'EXPIRED', /channel expired/], ['ResendFailed', 'FAILED', /resend failed/]]) {
    const env = setup(); const socket = await ready(env);
    const requested = assert.rejects(env.client.request('ReadRequest', {}), reason);
    const watched = assert.rejects(env.client.sendWatch('WatchRequest', {}, { window: 10000 }), reason);
    socket.receive(message, { reason: 'synthetic' });
    await Promise.all([requested, watched]); cleaned(env.client, state);
  }
});

test('login and established socket errors clean up without requiring an error listener', async () => {
  const first = setup(); const pending = assert.rejects(first.client.connect({}), /socket error during login/);
  first.sockets[0].onerror(); await pending; cleaned(first.client, 'FAILED');
  const second = setup(); const socket = await ready(second);
  const query = assert.rejects(second.client.request('ReadRequest', {}), /socket error/);
  socket.onerror(); await query; cleaned(second.client, 'FAILED');
});

test('login encode failure closes the newly allocated socket', async () => {
  const { client, sockets } = setup(); client.codec = { encode() { throw new Error('synthetic codec failure'); } };
  await assert.rejects(client.connect({}), /synthetic codec failure/); cleaned(client, 'FAILED');
  assert.equal(sockets[0].closes.length, 1);
});

test('identical requests share one response and conflicting same-response requests are rejected', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const first = env.client.request('ReadRequest', { id: 1 });
  assert.equal(first, env.client.request('ReadRequest', { id: 1 }));
  await assert.rejects(env.client.request('ReadRequest', { id: 2 }), { code: 'RESPONSE_CONFLICT' });
  await assert.rejects(env.client.request('OtherRequest', {}, 'ReadResponse'), { code: 'RESPONSE_CONFLICT' });
  assert.equal(socket.sent.filter((frame) => frame.name === 'ReadRequest').length, 1);
  socket.receive('ReadResponse', { value: 'one' });
  assert.deepEqual(await first, { value: 'one' });
});

test('a single prompt candidate is rejected; multiple candidates remain unassigned', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const single = assert.rejects(env.client.request('ReadRequest', {}), /server prompt/);
  socket.receive('PromptResponse', { args: ['single rejected'] }); await single;
  let ambiguous; env.client.on('promptAmbiguous', (detail) => { ambiguous = detail; });
  const first = env.client.request('ReadRequest', {});
  const second = env.client.request('OtherRequest', {});
  const firstRejected = assert.rejects(first, /client stopped/);
  const secondRejected = assert.rejects(second, /client stopped/);
  socket.receive('PromptResponse', { args: ['cannot correlate'] });
  assert.deepEqual(ambiguous.requests, ['ReadRequest', 'OtherRequest']);
  assert.equal(env.client.pending.length, 2);
  env.client.stop(); await Promise.all([firstRejected, secondRejected]);
});

test('separate clients isolate responses, failures and request queues', async (t) => {
  const left = setup(); const right = setup(); t.after(() => { left.client.stop(); right.client.stop(); });
  const leftSocket = await ready(left); const rightSocket = await ready(right);
  const leftResult = left.client.request('ReadRequest', {});
  const rightRejected = assert.rejects(right.client.request('ReadRequest', {}), /channel expired/);
  rightSocket.receive('SCChannelExpired', { reason: 'synthetic' }); await rightRejected;
  assert.equal(left.client.state, 'READY'); assert.equal(left.client.pending.length, 1);
  leftSocket.receive('ReadResponse', { account: 'left' }); assert.deepEqual(await leftResult, { account: 'left' });
});
test('an open transport cannot send business requests before authentication', async () => {
  const { client, sockets } = setup();
  const loginRejected = assert.rejects(client.connect({}), /client stopped/);
  sockets[0].open();
  assert.equal(client.connected, false);
  await assert.rejects(client.request('ReadRequest', {}), /not connected/);
  assert.equal(sockets[0].sent.filter((frame) => frame.name === 'ReadRequest').length, 0);
  client.stop(); await loginRejected;
});

test('a lone watcher can own a prompt; ambiguous watchers cannot report success', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const single = assert.rejects(env.client.sendWatch('WatchRequest', {}, { window: 10000 }), /server prompt/);
  socket.receive('PromptResponse', { args: ['single rejected'] }); await single;
  const first = assert.rejects(env.client.sendWatch('FirstRequest', {}, { window: 5 }), { code: 'AMBIGUOUS_PROMPT' });
  const second = assert.rejects(env.client.sendWatch('SecondRequest', {}, { window: 5 }), { code: 'AMBIGUOUS_PROMPT' });
  socket.receive('PromptResponse', { args: ['ambiguous'] });
  assert.equal(env.client.watchers.length, 2);
  await Promise.all([first, second]);
  assert.equal(env.client.watchers.length, 0);
});

test('stop from a READY state observer cannot resurrect heartbeat resources', async () => {
  const { client, sockets } = setup();
  client.on('state', ({ state }) => { if (state === 'READY') client.stop(); });
  const rejected = assert.rejects(client.connect({}), /client stopped/);
  sockets[0].open(); sockets[0].receive('LoginResponse', { result: 0 });
  await rejected; cleaned(client, 'STOPPED');
});
test('initial ping failure rejects login and never leaks timers', async () => {
  const { client, sockets } = setup();
  const rejected = assert.rejects(client.connect({}), /synthetic ping failure/);
  const socket = sockets[0]; socket.open();
  socket.send = (frame) => { if (codec.decode(frame).name === 'PingRequest') throw new Error('synthetic ping failure'); };
  socket.receive('LoginResponse', { result: 0 });
  await rejected; cleaned(client, 'FAILED');
});

test('terminal state observer can stop without overwriting the failure or recursing', async () => {
  const env = setup(); const socket = await ready(env);
  let states = 0;
  env.client.on('state', () => { states += 1; env.client.stop(); });
  const rejected = assert.rejects(env.client.request('ReadRequest', {}), /channel expired/);
  socket.receive('SCChannelExpired', { reason: 'synthetic' });
  await rejected; cleaned(env.client, 'EXPIRED'); assert.equal(states, 1);
  env.client.stop(); assert.equal(states, 1);
});

test('stop from a CONNECTING observer creates no socket and rejects login', async () => {
  const { client, sockets } = setup();
  client.on('state', ({ state }) => { if (state === 'CONNECTING') client.stop(); });
  await assert.rejects(client.connect({}), /client stopped/);
  assert.equal(sockets.length, 0); cleaned(client, 'STOPPED');
});
test('a timed-out response cannot be reused by a newer request', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  await assert.rejects(env.client.request('ReadRequest', { id: 'old' }, 'ReadResponse', 5), /timeout waiting/);
  await assert.rejects(env.client.request('ReadRequest', { id: 'new' }), { code: 'RESPONSE_UNCERTAIN' });
  assert.equal(socket.sent.filter((frame) => frame.name === 'ReadRequest').length, 1);
  socket.receive('ReadResponse', { id: 'old' });
  const next = env.client.request('ReadRequest', { id: 'new' });
  socket.receive('ReadResponse', { id: 'new' });
  assert.deepEqual(await next, { id: 'new' });
});
test('prompt ambiguity survives watcher expiry and cannot reject a later lone request', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const first = assert.rejects(env.client.sendWatch('FirstRequest', {}, { window: 5 }), { code: 'AMBIGUOUS_PROMPT' });
  const second = assert.rejects(env.client.sendWatch('SecondRequest', {}, { window: 5 }), { code: 'AMBIGUOUS_PROMPT' });
  socket.receive('PromptResponse', { args: ['ambiguous'] }); await Promise.all([first, second]);
  const read = env.client.request('ReadRequest', {});
  socket.receive('PromptResponse', { args: ['possibly old'] });
  assert.equal(env.client.pending.length, 1);
  socket.receive('ReadResponse', { value: 'certain' }); assert.deepEqual(await read, { value: 'certain' });
});
test('a quiet watcher is UNKNOWN and cannot dispatch the same unresolved write again', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const outcome = await env.client.sendWatch('WatchRequest', { id: 7 }, { window: 1 });
  assert.equal(outcome.status, 'UNKNOWN');
  assert.equal(outcome.ok, null);
  assert.equal(env.client.watchers.length, 0);
  await assert.rejects(env.client.sendWatch('WatchRequest', { id: 7 }), { code: 'WRITE_UNCERTAIN' });
  assert.equal(socket.sent.filter((frame) => frame.name === 'WatchRequest').length, 1);
  // Even a new transport cannot make the earlier write's effect known.
  env.client.stop(); await ready(env);
  await assert.rejects(env.client.sendWatch('WatchRequest', { id: 7 }), { code: 'WRITE_UNCERTAIN' });
});

test('watcher cancellation releases its timer and listener while retaining unknown dispatch', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const controller = new AbortController();
  const pending = assert.rejects(env.client.sendWatch('WatchRequest', { id: 8 }, { window: 10000, signal: controller.signal }), { code: 'CANCELLED' });
  controller.abort(); await pending;
  assert.equal(env.client.watchers.length, 0);
  assert.equal(env.client.uncertainWrites.size, 1);
  socket.receive('PromptResponse', { args: ['late refusal'] });
  assert.equal(env.client.promptUncertain, true);
  await assert.rejects(env.client.sendWatch('WatchRequest', { id: 8 }), { code: 'WRITE_UNCERTAIN' });
});

test('synchronous transport termination while dispatching a watcher cannot recreate its timer', async () => {
  const env = setup(); const socket = await ready(env);
  const controller = new AbortController(); let watcher;
  const send = socket.send.bind(socket);
  socket.send = (frame) => {
    send(frame);
    if (codec.decode(frame).name === 'WatchRequest') {
      watcher = env.client.watchers[0]; env.client.stop();
    }
  };
  await assert.rejects(env.client.sendWatch('WatchRequest', {}, { window: 10000, signal: controller.signal }), /client stopped/);
  assert.equal(watcher.timer, null);
  assert.equal(env.client.uncertainWrites.size, 1);
  assert.equal(env.client.watchers.length, 0);
});

test('a synchronous definitive prompt does not leave an unknown-write lock or watchdog', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const send = socket.send.bind(socket); let watcher;
  socket.send = (frame) => {
    send(frame);
    if (codec.decode(frame).name === 'WatchRequest') {
      watcher = env.client.watchers[0];
      socket.receive('PromptResponse', { args: ['definite rejection'] });
    }
  };
  await assert.rejects(env.client.sendWatch('WatchRequest', {}, { window: 10000 }), /server prompt/);
  assert.equal(watcher.timer, null); assert.equal(env.client.uncertainWrites.size, 0);
  await assert.rejects(env.client.sendWatch('WatchRequest', {}, { window: 10000 }), /server prompt/);
});

test('abort from a frame observer prevents socket dispatch', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const controller = new AbortController();
  env.client.on('frame', ({ name }) => { if (name === 'WatchRequest') controller.abort(); });
  await assert.rejects(env.client.sendWatch('WatchRequest', {}, { signal: controller.signal }), { code: 'CANCELLED' });
  assert.equal(socket.sent.filter((frame) => frame.name === 'WatchRequest').length, 0);
  assert.equal(env.client.uncertainWrites.size, 0);
});

test('only an explicit state verification releases the matching watched write', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); await ready(env);
  await env.client.sendWatch('WatchRequest', { id: 1 }, { window: 1 });
  await env.client.sendWatch('WatchRequest', { id: 2 }, { window: 1 });
  assert.equal(env.client.uncertainWrites.size, 2);
  assert.equal(env.client.confirmWatchedWrite('WatchRequest', { id: 1 }), true);
  assert.equal(env.client.uncertainWrites.size, 1);
  await assert.rejects(env.client.sendWatch('WatchRequest', { id: 2 }), { code: 'WRITE_UNCERTAIN' });
  env.client.confirmWatchedWrite('WatchRequest', { id: 2 });
  assert.equal(env.client.uncertainWrites.size, 0);
  assert.equal(env.client.promptUncertain, false);
});

test('typed writes retain unknown fingerprints across close and reconnect, reads remain reusable', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  const pending = assert.rejects(env.client.request('WriteRequest', { id: 9 }, 'WriteResponse', 10000, { mutate: true }), /socket closed/);
  socket.end(); await pending;
  assert.equal(env.client.uncertainWrites.size, 1);
  const nextSocket = await ready(env);
  await assert.rejects(env.client.request('WriteRequest', { id: 9 }, 'WriteResponse', 10000, { mutate: true }), { code: 'WRITE_UNCERTAIN' });
  const reading = env.client.request('ReadRequest', {}, 'ReadResponse');
  nextSocket.receive('ReadResponse', { id: 1 });
  assert.deepEqual(await reading, { id: 1 });
  assert.equal(nextSocket.sent.some((frame) => frame.name === 'WriteRequest'), false);
});

test('a typed write timeout remains locked even after its late response has been discarded', async (t) => {
  const env = setup(); t.after(() => env.client.stop()); const socket = await ready(env);
  await assert.rejects(env.client.request('WriteRequest', {}, 'WriteResponse', 1, { mutate: true }), { code: 'RESPONSE_TIMEOUT' });
  socket.receive('WriteResponse', { result: 0 });
  assert.equal(env.client.lateResponses.size, 0);
  await assert.rejects(env.client.request('WriteRequest', {}, 'WriteResponse', 1, { mutate: true }), { code: 'WRITE_UNCERTAIN' });
  assert.equal(socket.sent.filter((frame) => frame.name === 'WriteRequest').length, 1);
});
