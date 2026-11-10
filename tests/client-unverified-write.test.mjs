import test from 'node:test';
import assert from 'node:assert/strict';
import { GameClient } from '../src/client.mjs';

test('an acknowledged but unverified write blocks both transport paths until exact authoritative confirmation', async () => {
  const client = new GameClient({ protocol: {}, WebSocketImpl: class { constructor() { throw Error('offline only'); } } });
  let sends = 0;
  client.codec = { encode: (name, seq, body) => Buffer.from(JSON.stringify({ name, seq, body })) };
  client.state = 'READY'; client.socket = { readyState: 1, send() { sends++; }, close() {} };
  try {
    const body = { index: 1 }; client.markUnverifiedWrite('FinishWorkerOrderRequest', body);
    await assert.rejects(client.request('FinishWorkerOrderRequest', body, 'FinishWorkerOrderResponse', 100, { mutate: true }), { code: 'WRITE_UNCERTAIN' });
    await assert.rejects(client.sendWatch('FinishWorkerOrderRequest', body, { window: 1 }), { code: 'WRITE_UNCERTAIN' });
    assert.equal(sends, 0); assert.equal(client.confirmWatchedWrite('FinishWorkerOrderRequest', { index: 2 }), false);
    assert.equal(client.uncertainWrites.size, 1); client.stop(); assert.equal(client.uncertainWrites.size, 1);
    assert.equal(client.confirmWatchedWrite('FinishWorkerOrderRequest', body), true); assert.equal(client.uncertainWrites.size, 0);
  } finally { client.stop(); }
});
