import test from 'node:test';
import assert from 'node:assert/strict';
import { GameClient } from '../src/client.mjs';
import { createCodec } from '../src/codec.mjs';
import { loadProtocol } from '../src/proto.mjs';

const protocol = loadProtocol(), codec = createCodec(protocol);
const playerInfo = { playerId: '9007199254740993', worldId: '9' };
const response = { cardItem: [{ type: 2, endTime: 0, gotDailyReward: false }, { type: 1, endTime: -1, gotDailyReward: true }] };
async function ready(t, accountId = 'card-offline', loginBody = { result: 0, initSeqNo: 12, playerInfo }) {
  let socket;
  class Socket {
    constructor() { socket = this; this.readyState = 1; this.sent = []; }
    send(bytes) { this.sent.push(codec.decode(bytes)); }
    close() { this.readyState = 3; }
    receive(name, body, seq = 0) { this.onmessage?.({ data: codec.encode(name, seq, body) }); }
  }
  const client = new GameClient({ protocol, accountId, generation: 4, WebSocketImpl: Socket });
  client.factContext = { accountId, generation: 4, connectionId: 'offline-' + accountId };
  client.on('error', () => {});
  t.after(() => client.stop());
  const connected = client.connect({});
  socket.onopen(); socket.receive('LoginResponse', loginBody); await connected;
  return { client, socket };
}
const read = (client, options, timeout = 500) => client.request('MonthCardRequest', {}, 'MonthCardResponse', timeout, options);
const refresh = async ({ client, socket }, body, seq) => {
  const pending = read(client); socket.receive('MonthCardResponse', body, seq); await pending;
  return client.readMonthCards();
};
const unknown = (client, reason) => {
  const fact = client.readMonthCards();
  assert.equal(fact.status, 'UNKNOWN'); assert.equal(fact.reliable, false); assert.equal(fact.cards, null);
  if (reason) assert.equal(fact.reason, reason);
  return fact;
};

test('real codec responses replace the complete month card list, including own empty list and explicit zero', async t => {
  const f = await ready(t);
  unknown(f.client, 'MONTH_CARD_QUERY_REQUIRED');
  assert.equal(f.client.readVipLevel().status, 'UNKNOWN', 'month card login does not depend on VIP');
  let atMessage;
  f.client.on('message', ({ name }) => { if (name === 'MonthCardResponse') atMessage = f.client.readMonthCards(); });
  const rows = await refresh(f, response, 1);
  assert.equal(rows.status, 'CURRENT'); assert.equal(rows.reliable, true);
  assert.deepEqual(rows.cards, [{ type: 1, endTime: -1 }, { type: 2, endTime: 0 }]);
  assert.deepEqual(rows, atMessage); assert.equal(rows.source, 'MonthCardResponse');
  assert.ok(Number.isSafeInteger(rows.sourceAt));
  assert.deepEqual([rows.accountId, rows.generation, rows.connectionId, rows.playerId, rows.worldId],
    ['card-offline', 4, 'offline-card-offline', playerInfo.playerId, playerInfo.worldId]);
  rows.cards[0].endTime = 99;
  assert.equal(f.client.readMonthCards().cards[0].endTime, -1);
  const decoded = protocol.MonthCardResponse.decode(protocol.MonthCardResponse.encode({}).finish());
  assert.ok(Object.hasOwn(decoded, 'cardItem')); assert.deepEqual(decoded.cardItem, []);
  assert.deepEqual((await refresh(f, {}, 2)).cards, []);
});

test('delivery invalidates before listeners and a query started before delivery cannot restore authority', async t => {
  const f = await ready(t); await refresh(f, response, 1);
  f.socket.receive('SCEWorldOrderDelivery', {}, 2);
  assert.equal(f.client.readMonthCards().status, 'CURRENT', 'unrelated delivery is not a card event');
  let observed;
  f.client.on('message', ({ name, body }) => { if (name === 'SCEWorldOrderDelivery' && body.monthCard) observed = f.client.readMonthCards(); });
  const pending = read(f.client);
  unknown(f.client, 'MONTH_CARD_QUERY_PENDING');
  f.socket.receive('SCEWorldOrderDelivery', { monthCard: { endTime: 9 } }, 3);
  assert.equal(observed.status, 'UNKNOWN');
  f.socket.receive('MonthCardResponse', response, 4); await pending;
  unknown(f.client, 'MONTH_CARD_CHANGED_DURING_QUERY');
  assert.deepEqual((await refresh(f, {}, 5)).cards, []);
});

test('timeout and cancellation quarantine late replies and permit only a later fresh query', async t => {
  const f = await ready(t); await refresh(f, response, 1);
  const expired = read(f.client, undefined, 5);
  await assert.rejects(expired, { code: 'RESPONSE_TIMEOUT' });
  unknown(f.client, 'MONTH_CARD_QUERY_TIMEOUT');
  await assert.rejects(read(f.client), { code: 'RESPONSE_UNCERTAIN' });
  f.socket.receive('MonthCardResponse', response, 2);
  unknown(f.client);
  assert.deepEqual((await refresh(f, {}, 3)).cards, []);
  const ac = new AbortController(), cancelled = read(f.client, { signal: ac.signal });
  ac.abort(); await assert.rejects(cancelled, { code: 'CANCELLED' });
  unknown(f.client, 'MONTH_CARD_QUERY_CANCELLED');
  f.socket.receive('MonthCardResponse', response, 4);
  assert.deepEqual((await refresh(f, {}, 5)).cards, []);
  const notSent = new AbortController(); notSent.abort();
  const before = f.socket.sent.length;
  await assert.rejects(read(f.client, { signal: notSent.signal }), { code: 'CANCELLED' });
  assert.equal(f.socket.sent.length, before);
  assert.deepEqual(f.client.readMonthCards().cards, []);
});

test('unknown scalar defaults, wrong types, duplicates and uncorrelated responses cannot invent a current card row', async t => {
  const f = await ready(t);
  for (const [index, cardItem] of [
    [{ type: 1 }], [{ endTime: -1 }], [{ type: 1, endTime: -2 }], [{ type: 3, endTime: -1 }],
    [{ type: 1, endTime: 0 }, { type: 1, endTime: -1 }],
  ].entries()) {
    await refresh(f, { cardItem }, index + 1);
    unknown(f.client, 'MONTH_CARD_LIST_NOT_EXPLICIT_OR_INVALID');
  }
  await refresh(f, response, 6);
  f.socket.receive('MonthCardResponse', {}, 7);
  unknown(f.client, 'MONTH_CARD_RESPONSE_UNCORRELATED');
  await refresh(f, response, 8);
  f.client.send('MonthCardRequest', {});
  f.socket.receive('MonthCardResponse', response, 9);
  await refresh(f, response, 10);
  unknown(f.client, 'MONTH_CARD_QUERY_UNCORRELATED');
});

test('sequence gaps, decode errors, unsequenced replies, terminal and role mismatch fail closed', async t => {
  for (const kind of ['gap', 'decode', 'unsequenced', 'terminal', 'context']) {
    const f = await ready(t, kind); await refresh(f, response, 1);
    let last = 1;
    if (kind === 'gap') f.socket.receive('SCEWorldOrderDelivery', {}, 3);
    if (kind === 'decode') f.socket.onmessage({ data: new Uint8Array([1, 2, 3]) });
    if (kind === 'unsequenced') await refresh(f, response, 0);
    if (kind === 'terminal') {
      let beforePublish;
      f.client.on('message', ({ name }) => { if (name === 'SCChannelExpired') beforePublish = f.client.readMonthCards(); });
      f.socket.receive('SCChannelExpired', {}, ++last); assert.equal(beforePublish.status, 'UNKNOWN');
    }
    if (kind === 'context') f.client.factContext.connectionId = 'other';
    unknown(f.client);
    if (kind !== 'terminal') { await refresh(f, response, ++last); unknown(f.client); }
  }
  const f = await ready(t, 'missing-role', { result: 0, initSeqNo: 12, playerInfo: { playerId: '1' } });
  await refresh(f, response, 1); unknown(f.client, 'MONTH_CARD_PLAYER_IDENTITY_UNKNOWN');
});

test('an accepted server time-change push invalidates the old trusted clock before observers', async t => {
  const { client, socket } = await ready(t);
  const sample = () => {
    const sent = client.lastPingTimestamp || Date.now();
    if (!client.lastPingTimestamp) client.sendPing(sent);
    socket.receive('PingResponse', { clientTimestamp: String(sent), serverTimestamp: String(sent + 1000) });
    assert.equal(client.gameClock.read().status, 'TRUSTED');
  };
  sample();
  let observed;
  client.on('message', ({ name }) => { if (name === 'SCServerTimeChanged') observed = client.gameClock.read(); });
  socket.receive('SCServerTimeChanged', { serverTimestamp: String(Date.now() + 3000) }, 1);
  assert.equal(observed.status, 'UNKNOWN'); assert.equal(client.gameClock.read().reliable, false);
  sample();
  socket.receive('SCServerTimeChanged', { serverTimestamp: String(Date.now() + 6000) }, 1);
  assert.equal(client.gameClock.read().status, 'TRUSTED', 'a duplicate is dropped before trust changes');
});
