import test from 'node:test';
import assert from 'node:assert/strict';
import { GameClient, PING_TIMEOUT_MS, TICK_INTERVAL_MS } from '../src/client.mjs';
import { trustedGameClock, factsFreshnessPolicy } from '../src/state-facts.mjs';
import { collectState, ENTRY_QUERIES } from '../src/game.mjs';

const responseNameOf = name => name.slice(0, -7) + 'Response';
const codec = { encode: (name, seq, body) => Buffer.from(JSON.stringify({ name, seq, body })), decode: bytes => JSON.parse(Buffer.from(bytes).toString()) };
function fixture() {
  let wall = Date.now(), mono = 0, owned = true;
  const gameClock = trustedGameClock({ accountId: 'synthetic-A', generation: 3, wallNow: () => wall, monotonicNow: () => mono });
  const client = new GameClient({ protocol: {}, accountId: 'synthetic-A', generation: 3, gameClock,
    assertTransport() { if (!owned) throw Object.assign(Error('synthetic writer lost'), { code: 'WRITER_NOT_OWNED' }); },
    WebSocketImpl: class { constructor() { assert.fail('offline clock fixture cannot allocate a socket'); } } });
  const sent = []; client.codec = codec; client.state = 'READY'; client.socket = { readyState: 1, send: frame => sent.push(codec.decode(frame)), close() {} };
  return { client, sent, gameClock, now: () => wall, advance(ms) { wall += ms; mono += ms; }, lose() { owned = false; } };
}
test('client samples only its matching Pong and reset destroys clock trust without changing heartbeat threshold', () => {
  const f = fixture();
  try {
    assert.equal(f.client.serverClockOffsetMs, 0); assert.equal(f.gameClock.read().reliable, false);
    f.client.sendPing(f.now()); assert.equal(f.sent[0].name, 'PingRequest');
    assert.equal(f.client.tryHandlePong({ clientTimestamp: f.now() - 1, serverTimestamp: f.now() + 5000 }), false);
    assert.equal(f.gameClock.read().reliable, false);
    const timestamp = f.now(); f.advance(80);
    assert.equal(f.client.tryHandlePong({ clientTimestamp: timestamp, serverTimestamp: f.now() + 5000 }), true);
    assert.equal(f.gameClock.read().status, 'TRUSTED'); assert.equal(f.gameClock.read({ generation: 4 }).reliable, false);
    const diagnostic = f.client.clockDiagnostics();
    assert.equal(diagnostic.pingTimeoutMs, 1000); assert.equal(diagnostic.tickIntervalMs, 1000);
    assert.deepEqual(diagnostic.events.map(row => row.kind), ['PING', 'PONG']);
    f.client.stop(); assert.equal(f.gameClock.read().reliable, false);
  } finally { f.client.stop(); }
});
test('ownership loss stops ordinary and no-sequence frames before socket dispatch', async () => {
  const f = fixture();
  try {
    f.lose();
    await assert.rejects(f.client.request('ReadRequest', {}, 'ReadResponse', 20), { code: 'WRITER_NOT_OWNED' });
    assert.throws(() => f.client.sendNoSeq('Ack', {}), { code: 'WRITER_NOT_OWNED' });
    assert.equal(f.sent.length, 0); assert.equal(f.client.pending.length, 0);
  } finally { f.client.stop(); }
});
test('heartbeat diagnostics are bounded, structural and include event-loop delay without raising timeout', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 25; i++) f.client.recordHeartbeat('PING', { outstandingAgeMs: i });
    assert.equal(f.client.clockDiagnostics().events.length, 20);
    f.client.lastTickAt = Date.now() - TICK_INTERVAL_MS - 500;
    f.client.lastPingTimestamp = Date.now() - PING_TIMEOUT_MS - 20;
    f.client.tick();
    assert.equal(f.client.state, 'FAILED');
    const diagnostic = f.client.clockDiagnostics();
    assert.ok(diagnostic.events.some(row => row.kind === 'TICK_DELAY'));
    assert.equal(diagnostic.events.at(-1).kind, 'TERMINAL');
    assert.equal(diagnostic.pingTimeoutMs, PING_TIMEOUT_MS);
    assert.doesNotMatch(JSON.stringify(diagnostic), /token|sign|LoginRequest|playerInfo|openId/i);
  } finally { f.client.stop(); }
});
test('a client without account context remains usable for read transport with an UNKNOWN game clock', () => {
  const client = new GameClient({ protocol: {} });
  assert.equal(client.gameClock.read().status, 'UNKNOWN'); client.stop();
});
test('the unique 48-query collector preserves exact raw int64 and response-scoped provenance without claiming semantic reliability', async () => {
  const factContext = { accountId: 'synthetic-A', generation: 8 };
  const client = { factContext, gameClock: { read: () => ({ reliable: false }) },
    async request() { return { exactId: { low: 1, high: 2097152, unsigned: true }, token: 'synthetic-reply-token' }; } };
  const wire = Object.fromEntries(ENTRY_QUERIES.flatMap(row => [[row.name, {}], [responseNameOf(row.name), {}]]));
  const snapshot = await collectState(client, wire);
  assert.equal(Object.keys(snapshot.facts).length, 48); assert.equal(Object.keys(snapshot.raw).length, 48);
  for (const [name, fact] of Object.entries(snapshot.facts)) {
    assert.equal(fact.value.exactId, '9007199254740993');
    assert.equal(fact.provenance.accountId, factContext.accountId); assert.equal(fact.provenance.generation, factContext.generation);
    assert.equal(fact.provenance.source, responseNameOf(name)); assert.equal(fact.provenance.reliability, 'UNKNOWN');
    assert.deepEqual(fact.provenance.scope, { kind: 'CURRENT_RESPONSE_ONLY', key: name });
    assert.equal(factsFreshnessPolicy(fact, { ...factContext, now: fact.provenance.sourceAt, maxAgeMs: 1000 }).reliable, false);
  }
});

test('Login frame observers cannot invalidate ownership and still allow dispatch', async () => {
  let owned = true, sends = 0, sockets = 0;
  class FakeSocket {
    constructor() { sockets++; this.readyState = 1; }
    send() { sends++; }
    close() { this.readyState = 3; }
  }
  const client = new GameClient({ protocol: {}, WebSocketImpl: FakeSocket, assertTransport() { if (!owned) throw Object.assign(Error('owner lost'), { code: 'WRITER_NOT_OWNED' }); } });
  client.codec = codec;
  client.on('frame', frame => { if (frame.name === 'LoginRequest') owned = false; });
  const pending = client.connect({});
  const rejected = assert.rejects(pending, { code: 'WRITER_NOT_OWNED' });
  client.socket.onopen(); await rejected;
  assert.equal(sockets, 1); assert.equal(sends, 0); assert.equal(client.socket, null);
});
test('ownership lost before connect prevents even constructing a socket', async () => {
  let sockets = 0;
  const client = new GameClient({ protocol: {}, WebSocketImpl: class { constructor() { sockets++; } }, assertTransport() { throw Object.assign(Error('owner lost'), { code: 'WRITER_NOT_OWNED' }); } });
  await assert.rejects(client.connect({}), { code: 'WRITER_NOT_OWNED' });
  assert.equal(sockets, 0); assert.equal(client.loginAttempt, null);
});
