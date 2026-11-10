import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Only synthetic accounts; no GameClient, certificate or game network is used.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-explorer-api-'));
process.env.CW_DATA_DIR = sandbox;
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const token = 'explorer-synthetic-token', sign = 'explorer-synthetic-sign';
const account = (id) => ({ id, label: id === 'account-A' ? 'Alias A' : id, url: 'wss://example.invalid/ws', login: { eworldParams: { openId: id, token, sign, timestamp: 1 } } });
async function harness() {
  saveStore({ version: 1, activeId: 'account-A', accounts: [account('account-A'), account('account-B')] });
  let creates = 0, collects = 0;
  const app = createConsole({ port: 0, protocol: {}, tracePath: path.join(sandbox, 'trace.log'), clientFactory: () => { creates++; throw Error('Explorer must never create a client'); }, collect: () => { collects++; throw Error('Explorer must never collect'); } });
  await app.listen();
  const call = (query = '', method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:' + app.server.address().port + '/api/data-explorer' + query, { method, headers: { connection: 'close' } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => text += chunk); res.on('end', () => resolve({ status: res.statusCode, text, data: JSON.parse(text) }));
    });
    req.on('error', reject); req.end();
  });
  return { ...app, call, counts: () => ({ creates, collects }) };
}
function cached(snapshot, at) {
  return { id: at, snapshot, snapshotAt: at, snapshotStale: true, generation: 0, abort: new AbortController(), loop: { stop: { aborted: false }, running: false }, client: null };
}

test('Explorer reads a named account without allocating a Runtime, client or collection', async () => {
  const app = await harness();
  try {
    for (let i = 0; i < 3; i++) {
      const response = await app.call('?account=account-A'); assert.equal(response.status, 200); assert.equal(response.data.accountId, 'account-A');
      assert.equal(response.data.total, 48); assert.equal(response.data.domains.length, 12); assert.equal(response.data.entries.length, 48);
      assert.ok(response.data.entries.every(({ status }) => status === 'NOT_EXECUTED'));
    }
    assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test('Explorer requires exact account IDs and never falls back to active account, label or index', async () => {
  const app = await harness();
  try {
    assert.equal((await app.call()).status, 400);
    for (const id of ['unknown', 'account', 'Alias A', '1']) assert.equal((await app.call('?account=' + encodeURIComponent(id))).status, 404);
    assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test('separate accounts return only their own snapshot and preserve concurrent reads', async () => {
  const app = await harness();
  try {
    for (const id of ['account-A', 'account-B']) app.sessions.set(id, cached({ ok: { AllItemRequest: { items: [{ itemId: id, num: 3 }] } }, failed: {} }, id + '-time'));
    const [a, b] = await Promise.all([app.call('?account=account-A'), app.call('?account=account-B')]);
    assert.equal(a.data.updatedAt, 'account-A-time'); assert.equal(b.data.updatedAt, 'account-B-time'); assert.equal(a.data.stale, true);
    assert.equal(a.data.entries[0].raw.items[0].itemId, 'account-A'); assert.equal(b.data.entries[0].raw.items[0].itemId, 'account-B');
    assert.equal(a.text.includes('account-B-time'), false); assert.equal(b.text.includes('account-A-time'), false); assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test('Explorer domain filtering uses the same catalog; invalid domains fail without side effects', async () => {
  const app = await harness();
  try {
    const response = await app.call('?account=account-A&domain=orders'); assert.equal(response.status, 200); assert.equal(response.data.total, 48);
    assert.ok(response.data.entries.some(({ request }) => request === 'OnWaterRequest')); assert.ok(response.data.entries.every(({ domains }) => domains.includes('orders')));
    assert.equal((await app.call('?account=account-A&domain=unknown')).status, 400); assert.equal((await app.call('?account=account-A', 'POST')).status, 403);
    assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test('raw and parsed data remain visible together, failures stay null, exports are safely redacted and lossless', async () => {
  const app = await harness();
  try {
    app.sessions.set('account-A', cached({
      ok: { AllItemRequest: { items: [{ itemId: 'wood', num: 8 }] }, BadgesRequest: { badges: [{ id: 5 }] } },
      raw: { AllItemRequest: { items: [{ itemId: 'wood', num: 8 }], serial: '18446744073709551615', nested: [{ Token: token, SIGN: sign }], message: token + '/' + sign }, BadgesRequest: { badges: [{ id: 5 }], huge: 9223372036854775807n } },
      failed: { AllHeroRequest: 'timeout ' + token, EquipsRequest: 'missing response' },
      outcomes: { AllHeroRequest: { status: 'FAILED', error: 'timeout ' + token, updatedAt: 'failed-time' }, EquipsRequest: { status: 'NOT_EXECUTED', error: 'missing response' } },
    }, 'snapshot-time'));
    const response = await app.call('?account=account-A'); assert.equal(response.status, 200);
    const byName = new Map(response.data.entries.map((entry) => [entry.request, entry]));
    assert.equal(byName.get('AllItemRequest').raw.serial, '18446744073709551615'); assert.equal(byName.get('AllItemRequest').parsed.items.total, 8);
    assert.equal(byName.get('BadgesRequest').raw.huge, '9223372036854775807'); assert.equal(byName.get('BadgesRequest').parsed, null);
    assert.equal(byName.get('AllHeroRequest').status, 'FAILED'); assert.equal(byName.get('AllHeroRequest').raw, null); assert.equal(byName.get('AllHeroRequest').parsed, null);
    assert.equal(byName.get('EquipsRequest').status, 'NOT_EXECUTED'); assert.equal(byName.get('EquipsRequest').raw, null); assert.equal(byName.get('EquipsRequest').parsed, null);
    for (const secret of [token, sign]) assert.equal(response.text.includes(secret), false); assert.ok(response.text.includes('[REDACTED]'));
    assert.deepEqual(app.counts(), { creates: 0, collects: 0 });
  } finally { await app.close(); }
});

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
