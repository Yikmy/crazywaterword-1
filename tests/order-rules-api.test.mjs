import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-order-rules-api-'));
process.env.CW_DATA_DIR = sandbox;
process.env.CW_CONFIG_PACK = path.join(sandbox, 'config-fixture.json');
fs.writeFileSync(process.env.CW_CONFIG_PACK, JSON.stringify([
  [0, 'WorkerOrderCfg', { data: [
    { itemId: 'item/toilet', reward: [['EXP', 410]] },
    { itemId: 'item/wood', reward: [['EXP', 410]] },
    { itemId: 'item/bread', reward: [['EXP', 400]] },
    { itemId: 'GOLD', reward: [['EXP', 1]] },
  ] }],
  [1, 'ResourceCfg', { data: [{ id: 'GOLD', show_name: '金币' }] }],
]));
const { createConsole } = await import('../src/server.mjs');
const { saveStore } = await import('../src/accounts.mjs');
const { ORDER_RULES_PATH } = await import('../src/order-rules-store.mjs');
const token = 'synthetic-order-token', sign = 'synthetic-order-sign';
const account = (id) => ({ id, label: 'label-' + id, url: 'wss://example.invalid/ws', login: { eworldParams: { openId: id, token, sign, timestamp: 1 } } });
const policy = (rules = []) => ({ version: 1, enabled: true, rules });
const rule = (id, priority, type, params, onFail = 'REFRESH') => ({ id, priority, type, params, onFail, enabled: true });
const example = () => policy([
  rule('no-toilet', 1, 'ITEM_FORBIDDEN', { itemIds: ['item/toilet'] }),
  rule('exp', 2, 'MIN_EXPERIENCE', { value: 700, operator: 'GT' }),
  rule('no-bread', 3, 'ITEM_FORBIDDEN', { itemIds: ['item/bread'] }, 'KEEP'),
]);
function snapshot() {
  const ok = {
    OnWaterRequest: { building: [], workerOrder: ['item/toilet', 'item/wood', 'item/bread', 'item/wood'].map((id, index) => ({ index, workerId: 'resident-' + index, requirements: [{ id, num: index === 3 ? 1 : 2 }], isSpecial: false })) },
    AllItemRequest: { items: [{ itemId: 'item/toilet', num: 1 }, { itemId: 'item/wood', num: 20 }, { itemId: 'item/bread', num: 8 }] },
    AllResourceRequest: { list: [{ res: 3, amount: 100 }] }, MyResFieldsRequest: {}, MyFleetsRequest: {},
  };
  return { ok, raw: structuredClone(ok), failed: {}, outcomes: {} };
}
function cached(data) {
  return { snapshot: data, snapshotAt: '2026-11-10T00:00:00Z', snapshotStale: true, generation: 0,
    abort: new AbortController(), loop: { stop: { aborted: false }, running: false }, client: null };
}
async function harness() {
  fs.rmSync(ORDER_RULES_PATH, { force: true });
  saveStore({ version: 1, activeId: 'A', accounts: [account('A'), account('B')] });
  const names = ['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets'];
  const protocol = Object.fromEntries(names.flatMap((name) => [[name + 'Request', {}], [name + 'Response', {}]]));
  let clients = 0, collections = 0;
  const app = createConsole({ port: 0, protocol, tracePath: path.join(sandbox, 'trace.log'),
    clientFactory: () => { clients++; throw Error('no game clients permitted'); },
    collect: () => { collections++; throw Error('no collections permitted'); } });
  await app.listen();
  const call = (route = '/api/order-rules', id = 'A', config, method = config === undefined ? 'GET' : 'POST') => new Promise((resolve, reject) => {
    const query = id === null ? '' : '?account=' + encodeURIComponent(id);
    const req = http.request('http://127.0.0.1:' + app.server.address().port + route + query, { method, headers: { 'content-type': 'application/json', connection: 'close' } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text), text }));
    });
    req.on('error', reject); req.end(config === undefined ? undefined : JSON.stringify({ config }));
  });
  return { ...app, call, counts: () => ({ clients, collections }) };
}
const preview = (app, config = policy(), id = 'A') => app.call('/api/order-rules/preview', id, config);

test('policy settings and missing preview never allocate a Runtime, connection, collection or settings file', async () => {
  const app = await harness();
  try {
    const loaded = await app.call(); assert.equal(loaded.status, 200); assert.equal(loaded.data.source, 'default');
    assert.deepEqual(loaded.data.config, { version: 1, enabled: false, rules: [] }); assert.equal(loaded.data.ruleTypes.length, 5);
    assert.ok(loaded.data.items.some((item) => item.id === 'item/toilet' && item.source.includes('WorkerOrderCfg.itemId')));
    const result = await preview(app); assert.equal(result.status, 200); assert.equal(result.data.status, 'UNKNOWN'); assert.deepEqual(result.data.orders, []);
    assert.equal(app.sessions.size, 0); assert.deepEqual(app.counts(), { clients: 0, collections: 0 }); assert.equal(fs.existsSync(ORDER_RULES_PATH), false);
  } finally { await app.close(); }
});

test('all three policy routes require exact existing account identity', async () => {
  const app = await harness();
  try {
    for (const route of ['/api/order-rules', '/api/order-rules/preview']) {
      for (const id of [null, 'unknown', 'label-A', '1']) {
        const response = await app.call(route, id, route.endsWith('preview') ? policy() : undefined);
        assert.equal(response.status, id === null ? 400 : 404);
      }
    }
    assert.equal((await app.call('/api/order-rules', 'unknown', policy())).status, 404);
    assert.equal(app.sessions.size, 0); assert.equal(fs.existsSync(ORDER_RULES_PATH), false);
  } finally { await app.close(); }
});

test('account policies save and reload independently without changing snapshots or enabling game writes', async () => {
  const app = await harness();
  try {
    const a = snapshot(), b = snapshot(), before = structuredClone(a);
    app.sessions.set('A', cached(a)); app.sessions.set('B', cached(b));
    const pa = example(), pb = policy([rule('b', 1, 'ITEM_REQUIRED', { itemIds: ['item/wood'] }, 'REVIEW')]);
    const saved = await Promise.all([app.call('/api/order-rules', 'A', pa), app.call('/api/order-rules', 'B', pb)]);
    assert.ok(saved.every((result) => result.status === 200));
    assert.deepEqual((await app.call('/api/order-rules', 'A')).data.config, pa);
    assert.deepEqual((await app.call('/api/order-rules', 'B')).data.config, pb);
    assert.deepEqual(a, before);
    for (const route of ['/api/world/run', '/api/actions/finishOrder', '/api/orders/refresh', '/api/loot']) assert.equal((await app.call(route, 'A', {})).status, 403);
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});

test('four-order preview reuses existing experience and requirements, explains first failure and never saves or mutates', async () => {
  const app = await harness();
  try {
    const data = snapshot(), before = structuredClone(data); app.sessions.set('A', cached(data));
    const result = await preview(app, example()); assert.equal(result.status, 200); assert.equal(result.data.status, 'SUCCESS');
    assert.equal(result.data.orders.length, 4);
    assert.deepEqual(result.data.orders.map((entry) => entry.order.rewardExp), [820, 820, 800, 410]);
    assert.deepEqual(result.data.orders.map((entry) => entry.result.decision), ['RECOMMEND_REFRESH', 'RECOMMEND_SUBMIT', 'RECOMMEND_KEEP', 'RECOMMEND_REFRESH']);
    assert.deepEqual(result.data.orders[0].result.ruleResults.map((entry) => entry.status), ['FAIL', 'SKIPPED', 'SKIPPED']);
    assert.equal(result.data.orders[0].result.firstFailedRuleId, 'no-toilet');
    assert.deepEqual(result.data.orders[0].inventoryFacts, [{ id: 'item/toilet', required: 2, available: 1, missing: 1 }]);
    assert.equal(result.data.stale, true); assert.match(result.data.simulationNote, /独立|未跨订单预留/);
    assert.deepEqual(data, before); assert.equal(fs.existsSync(ORDER_RULES_PATH), false); assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
    assert.deepEqual((await preview(app, example())).data, result.data);
  } finally { await app.close(); }
});

test('A and B previews run independently over their own cached order and stock', async () => {
  const app = await harness();
  try {
    const a = snapshot(), b = snapshot(); b.ok.AllItemRequest.items = []; b.raw.AllItemRequest.items = [];
    app.sessions.set('A', cached(a)); app.sessions.set('B', cached(b));
    const [ra, rb] = await Promise.all([preview(app, policy(), 'A'), preview(app, policy(), 'B')]);
    assert.equal(ra.data.accountId, 'A'); assert.equal(rb.data.accountId, 'B');
    assert.equal(ra.data.orders[1].result.decision, 'RECOMMEND_SUBMIT'); assert.equal(rb.data.orders[1].result.decision, 'RECOMMEND_KEEP');
    assert.equal(rb.data.orders[1].inventoryFacts[0].available, 0); assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});

test('failed or malformed stock remains UNKNOWN instead of zero or stale successful inventory', async () => {
  const app = await harness();
  try {
    for (const mutate of [
      (data) => { data.outcomes.AllItemRequest = { status: 'FAILED', error: 'fixture inventory timeout' }; },
      (data) => { delete data.ok.AllItemRequest; delete data.raw.AllItemRequest; data.failed.AllItemRequest = 'missing'; },
      (data) => { data.raw.AllItemRequest.items[1].num = '18446744073709551615'; },
      (data) => { data.raw.AllItemRequest.items[1].num = null; },
      (data) => { data.raw.AllItemRequest.items.push({ num: 10 }); },
    ]) {
      const data = snapshot(); mutate(data); app.sessions.set('A', cached(data));
      const result = await preview(app); assert.equal(result.status, 200);
      assert.equal(result.data.orders[1].result.decision, 'NEEDS_REVIEW');
      assert.equal(result.data.orders[1].inventoryFacts[0].available, null);
    }
  } finally { await app.close(); }
});

test('failed resource cache only blocks resource-dependent orders, without discarding known item stock', async () => {
  const app = await harness();
  try {
    const data = snapshot(); data.outcomes.AllResourceRequest = { status: 'FAILED', error: 'fixture resource timeout' };
    data.ok.OnWaterRequest.workerOrder[0].requirements = [{ id: 'GOLD', num: 10 }]; data.raw.OnWaterRequest = structuredClone(data.ok.OnWaterRequest);
    app.sessions.set('A', cached(data));
    const result = await preview(app);
    assert.equal(result.data.orders[0].result.decision, 'NEEDS_REVIEW'); assert.equal(result.data.orders[0].inventoryFacts[0].available, null);
    assert.equal(result.data.orders[1].result.decision, 'RECOMMEND_SUBMIT');
  } finally { await app.close(); }
});

test('missing orders and unsafe demand cannot be interpreted as a valid zero-demand order', async () => {
  const app = await harness();
  try {
    for (const mutate of [
      (data) => { data.outcomes.OnWaterRequest = { status: 'FAILED', error: 'fixture order timeout' }; },
      (data) => { delete data.raw.OnWaterRequest.workerOrder; },
    ]) {
      const data = snapshot(); mutate(data); app.sessions.set('A', cached(data));
      const result = await preview(app); assert.equal(result.data.status, 'UNKNOWN'); assert.deepEqual(result.data.orders, []);
    }
    const data = snapshot(); data.raw.OnWaterRequest.workerOrder[1].requirements[0].num = '9223372036854775807'; app.sessions.set('A', cached(data));
    assert.equal((await preview(app)).data.orders[1].result.decision, 'NEEDS_REVIEW');
  } finally { await app.close(); }
});

test('unknown reward experience yields review and invalid policy cannot overwrite saved config', async () => {
  const app = await harness();
  try {
    const good = example(); await app.call('/api/order-rules', 'A', good);
    const invalid = { ...good, rules: [{ ...good.rules[0], type: 'MIN_GOLD' }] };
    assert.equal((await app.call('/api/order-rules', 'A', invalid)).status, 400);
    assert.equal((await preview(app, invalid)).status, 400);
    assert.deepEqual((await app.call()).data.config, good);
    const data = snapshot(); data.ok.OnWaterRequest.workerOrder[1].requirements = [{ id: 'unknown-exp-id', num: 1 }];
    data.raw.OnWaterRequest = structuredClone(data.ok.OnWaterRequest); app.sessions.set('A', cached(data));
    const result = await preview(app, good);
    assert.equal(result.data.orders[1].order.rewardExp, null); assert.equal(result.data.orders[1].result.decision, 'NEEDS_REVIEW');
    assert.equal(result.data.orders[1].result.ruleResults[1].status, 'UNKNOWN');
  } finally { await app.close(); }
});

test('policy responses retain recursive credential redaction', async () => {
  const app = await harness();
  try {
    const data = snapshot(); data.ok.OnWaterRequest.workerOrder[0].workerId = token + '/' + sign;
    data.raw.OnWaterRequest = structuredClone(data.ok.OnWaterRequest); app.sessions.set('A', cached(data));
    const result = await preview(app, policy());
    assert.equal(result.text.includes(token), false); assert.equal(result.text.includes(sign), false);
    assert.ok(result.text.includes('[REDACTED]'));
  } finally { await app.close(); }
});

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

test('failed inventory sources cannot contaminate combined stock via colliding or fallback resource IDs', async () => {
  const app = await harness();
  try {
    const itemFailure = snapshot();
    itemFailure.ok.AllItemRequest.items = [{ itemId: 'GOLD', num: 10 }];
    itemFailure.raw.AllItemRequest = structuredClone(itemFailure.ok.AllItemRequest);
    itemFailure.outcomes.AllItemRequest = { status: 'FAILED' };
    itemFailure.ok.AllResourceRequest.list = [{ res: 3, amount: 0 }];
    itemFailure.raw.AllResourceRequest = structuredClone(itemFailure.ok.AllResourceRequest);
    itemFailure.ok.OnWaterRequest.workerOrder[0].requirements = [{ id: 'GOLD', num: 5 }];
    itemFailure.raw.OnWaterRequest = structuredClone(itemFailure.ok.OnWaterRequest);
    app.sessions.set('A', cached(itemFailure));
    const first = await preview(app);
    assert.equal(first.data.orders[0].result.decision, 'NEEDS_REVIEW');
    assert.equal(first.data.orders[0].inventoryFacts[0].available, null);

    const resourceFailure = snapshot();
    resourceFailure.ok.AllResourceRequest.list = [{ res: 99, amount: 10 }];
    resourceFailure.raw.AllResourceRequest = structuredClone(resourceFailure.ok.AllResourceRequest);
    resourceFailure.outcomes.AllResourceRequest = { status: 'FAILED' };
    resourceFailure.ok.OnWaterRequest.workerOrder[0].requirements = [{ id: '99', num: 5 }];
    resourceFailure.raw.OnWaterRequest = structuredClone(resourceFailure.ok.OnWaterRequest);
    app.sessions.set('A', cached(resourceFailure));
    const second = await preview(app);
    assert.equal(second.data.orders[0].result.decision, 'NEEDS_REVIEW');
    assert.equal(second.data.orders[0].inventoryFacts[0].available, null);
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});

test('successful metadata cannot turn an absent inventory body into zero stock', async () => {
  const app = await harness();
  try {
    const data = snapshot(); delete data.ok.AllItemRequest;
    data.outcomes.AllItemRequest = { status: 'SUCCESS' };
    app.sessions.set('A', cached(data));
    const result = await preview(app);
    assert.equal(result.data.orders[1].result.decision, 'NEEDS_REVIEW');
    assert.equal(result.data.orders[1].inventoryFacts[0].available, null);
  } finally { await app.close(); }
});
