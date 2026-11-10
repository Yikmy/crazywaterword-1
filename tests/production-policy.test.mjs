import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-production-policy-'));
process.env.CW_DATA_DIR = path.join(isolated, 'settings');
const { PRODUCTION_POLICY_PATH, defaultProductionPolicy, validateProductionPolicy, loadProductionPolicy, saveProductionPolicy, selectProductionCandidates, productionShortages } = await import('../src/production-policy.mjs');
const policy = (extra = {}) => ({ ...defaultProductionPolicy(), enabled: true, ...extra });
const candidate = (buildingId, productId, actionType = 'startProduce') => ({ actionId: `city:${buildingId}:${productId}`, actionType, target: { buildingId, productId } });
function survey(extra = {}) {
  return { stock: new Map(), stockReliable: true, orders: [{ requirements: [{ id: '布匹', num: 3 }] }],
    orderReliability: { orders: true }, factories: [], cityReliability: { buildings: true, byBuilding: {} }, ...extra };
}
const reset = () => fs.rmSync(path.dirname(PRODUCTION_POLICY_PATH), { recursive: true, force: true });
const writeRaw = (value) => { fs.mkdirSync(path.dirname(PRODUCTION_POLICY_PATH), { recursive: true }); fs.writeFileSync(PRODUCTION_POLICY_PATH, typeof value === 'string' ? value : JSON.stringify(value)); };

test('production policies use fresh disabled defaults and never write on a read', () => {
  reset(); const value = loadProductionPolicy('synthetic-A');
  assert.deepEqual(value.config, { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 });
  assert.equal(value.source, 'default'); assert.equal(fs.existsSync(PRODUCTION_POLICY_PATH), false);
  value.config.productIds.push('x'); assert.deepEqual(loadProductionPolicy('synthetic-B').config.productIds, []);
});

test('strict production validation rejects unknown fields, duplicates, unsafe IDs and invalid bounds', () => {
  for (const value of [null, {}, policy({ version: 2 }), policy({ enabled: 1 }), policy({ onlyShortages: 'true' }),
    policy({ productIds: ['布匹', '布匹'] }), policy({ productIds: [' x'] }), policy({ productIds: ['x\ny'] }),
    policy({ productIds: '布匹' }), policy({ maxOperations: 0 }), policy({ maxOperations: 101 }), policy({ maxOperations: 1.5 }),
    policy({ arbitraryRequest: {} })]) assert.throws(() => validateProductionPolicy(value), (e) => e.statusCode === 400);
  const valid = policy({ productIds: ['布匹'], maxOperations: 100 }); assert.deepEqual(validateProductionPolicy(valid), valid);
});

test('production overrides persist by exact account key including prototype and path-like text', () => {
  reset();
  for (const accountId of ['synthetic-A', '__proto__', 'constructor', '../../synthetic-B']) saveProductionPolicy(accountId, policy({ productIds: [accountId] }));
  assert.deepEqual(loadProductionPolicy('synthetic-A').config.productIds, ['synthetic-A']);
  assert.deepEqual(loadProductionPolicy('__proto__').config.productIds, ['__proto__']);
  assert.equal(Object.prototype.version, undefined);
  assert.deepEqual(fs.readdirSync(path.dirname(PRODUCTION_POLICY_PATH)), ['production-policy.json']);
  const original = fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8');
  for (const id of [null, '', ' a', 'a ', '\nx', 7, 'x'.repeat(513)]) assert.throws(() => saveProductionPolicy(id, policy()));
  assert.equal(fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), original);
});

test('corrupt policy documents remain intact while defaulting to disabled and refusing saves', () => {
  reset();
  for (const value of ['{', 'null', '[]', { version: 2, accounts: {} }, { version: 1, accounts: [], extra: 1 }]) {
    writeRaw(value); const original = fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), loaded = loadProductionPolicy('synthetic');
    assert.equal(loaded.config.enabled, false); assert.ok(loaded.warning);
    assert.throws(() => saveProductionPolicy('synthetic', policy()), (e) => e.statusCode === 409);
    assert.equal(fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), original);
  }
});

test('invalid individual override is isolated and atomic replacement failures preserve prior data', () => {
  reset(); writeRaw({ version: 1, accounts: { broken: { version: 2 } } });
  assert.equal(loadProductionPolicy('broken').config.enabled, false); assert.ok(loadProductionPolicy('broken').warning);
  saveProductionPolicy('valid', policy()); const original = fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8');
  const rename = fs.renameSync;
  try { fs.renameSync = () => { throw Error('synthetic rename failure'); }; assert.throws(() => saveProductionPolicy('other', policy()), (e) => e.statusCode === 500); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(path.dirname(PRODUCTION_POLICY_PATH)), ['production-policy.json']);
});

test('production selection is disabled by default and never admits collection or arbitrary actions', () => {
  const candidates = [candidate('A', '布匹'), candidate('B', '布匹', 'gainFactory'), candidate('C', '布匹', 'custom')];
  assert.deepEqual(selectProductionCandidates(survey(), { candidates }), []);
  assert.deepEqual(selectProductionCandidates(survey(), { policy: policy(), candidates }), ['city:A:布匹']);
});

test('production selections respect whitelist, max operations and one product per factory', () => {
  const candidates = [candidate('A', '布匹'), candidate('A', '燃料'), candidate('B', '燃料'), candidate('C', '布匹')];
  assert.deepEqual(selectProductionCandidates(survey(), { policy: policy({ onlyShortages: false, productIds: ['燃料'], maxOperations: 1 }), candidates }), ['city:A:燃料']);
  assert.equal(selectProductionCandidates(survey(), { policy: policy({ onlyShortages: false }), candidates }).length, 3);
});

test('combined order requirements subtract reliable stock, queues and already finished goods', () => {
  const state = survey({ stock: new Map([['布匹', 1]]), orders: [{ requirements: [{ id: '布匹', num: 2 }] }, { requirements: [{ id: '布匹', num: 2 }] }],
    factories: [{ buildingId: 'existing', factory: { factoryQ: [{ idx: 0, productId: '布匹', finishTime: 100 }], finishedProducts: [{ id: '布匹', num: 1 }] } }],
    cityReliability: { buildings: true, byBuilding: { existing: { factory: true, queue: true, finishedProducts: true } } } });
  const candidates = [candidate('A', '布匹'), candidate('B', '布匹')];
  assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), ['city:A:布匹']);
  state.stock.set('布匹', 2); assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), []);
});

test('shortage selection never overproduces the remaining one-unit demand across factories', () => {
  const candidates = [candidate('A', '布匹'), candidate('B', '布匹'), candidate('C', '布匹')];
  assert.equal(selectProductionCandidates(survey({ stock: new Map([['布匹', 2]]) }), { policy: policy(), candidates }).length, 1);
});

test('unknown requirements, inventory, queue completeness and unsafe totals block shortage automation', () => {
  const candidates = [candidate('A', '布匹')];
  for (const state of [survey({ stockReliable: false }), survey({ orderReliability: { orders: false } }), survey({ orders: [{ requirements: [{ id: '布匹', num: null }] }] }),
    survey({ orders: [{ requirements: [{ id: '布匹', num: 0 }] }] }), survey({ stock: new Map([['布匹', null]]) }),
    survey({ factories: [{ buildingId: 'unknown', factory: { factoryQ: [], finishedProducts: [] } }] }),
    survey({ orders: [{ requirements: [{ id: '布匹', num: Number.MAX_SAFE_INTEGER }, { id: '布匹', num: 1 }] }] })]) {
    assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), []);
  }
});

test('reliable empty demand makes no shortage recommendation while explicit all-products mode remains available', () => {
  const state = survey({ orders: [] }), candidates = [candidate('A', '布匹')];
  assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), []);
  assert.deepEqual(selectProductionCandidates(state, { policy: policy({ onlyShortages: false }), candidates }), ['city:A:布匹']);
});

test.after(() => fs.rmSync(isolated, { recursive: true, force: true }));

test('production shortage view exposes reliable required, inventory, queued, finished and missing counts', () => {
  const state = survey({ stock: new Map([['布匹', 1]]), orders: [{ requirements: [{ id: '布匹', num: 4 }] }],
    factories: [{ buildingId: 'F', factory: { factoryQ: [{ productId: '布匹' }], finishedProducts: [{ id: '布匹', num: 1 }] } }],
    cityReliability: { buildings: true, byBuilding: { F: { factory: true, queue: true, finishedProducts: true } } } });
  assert.deepEqual(productionShortages(state), { reliable: true, items: [{ id: '布匹', required: 4, inventory: 1, inProgress: 1, finished: 1, missing: 1 }], notes: [] });
  state.stockReliable = false; assert.equal(productionShortages(state).reliable, false); assert.deepEqual(productionShortages(state).items, []);
});
