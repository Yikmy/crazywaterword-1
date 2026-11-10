import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-order-rules-store-'));
process.env.CW_DATA_DIR = path.join(isolated, 'settings');
const { ORDER_RULES_PATH, loadOrderRules, saveOrderRules } = await import('../src/order-rules-store.mjs');
const config = (id, action = 'KEEP') => ({
  version: 1, enabled: true,
  rules: [
    { id: id + '-exp', priority: 2, type: 'MIN_EXPERIENCE', enabled: true, params: { value: 700, operator: 'GT' }, onFail: action },
    { id: id + '-item', priority: 1, type: 'ITEM_FORBIDDEN', enabled: false, params: { itemIds: ['item-stable-001'] }, onFail: 'REVIEW' },
  ],
});
function reset() {
  fs.rmSync(path.dirname(ORDER_RULES_PATH), { recursive: true, force: true });
}
function writeRaw(value) {
  fs.mkdirSync(path.dirname(ORDER_RULES_PATH), { recursive: true });
  fs.writeFileSync(ORDER_RULES_PATH, typeof value === 'string' ? value : JSON.stringify(value));
}
function safeDefault(result) {
  assert.equal(result.source, 'default');
  assert.deepEqual(result.config, { version: 1, enabled: false, rules: [] });
}

test('missing configuration returns independent safe global defaults without creating any files', () => {
  reset();
  const first = loadOrderRules('account-A');
  safeDefault(first); assert.equal(first.warning, null);
  first.config.rules.push({ synthetic: true });
  safeDefault(loadOrderRules('account-B'));
  assert.equal(fs.existsSync(ORDER_RULES_PATH), false);
});

test('account overrides save and reload independently while retaining explicit priorities', () => {
  reset();
  const a = saveOrderRules('account-A', config('a', 'REFRESH'));
  assert.equal(a.source, 'account'); assert.equal(a.warning, null);
  saveOrderRules('account-B', config('b', 'KEEP'));
  const loadedA = loadOrderRules('account-A'), loadedB = loadOrderRules('account-B');
  assert.deepEqual(loadedA.config, a.config);
  assert.equal(loadedA.config.rules.find((rule) => rule.id === 'a-exp').onFail, 'REFRESH');
  assert.equal(loadedB.config.rules.find((rule) => rule.id === 'b-exp').onFail, 'KEEP');
  assert.deepEqual(loadedA.config.rules.map((rule) => rule.priority).sort(), [1, 2]);
  loadedA.config.rules[0].enabled = !loadedA.config.rules[0].enabled;
  assert.notDeepEqual(loadedA.config, loadOrderRules('account-A').config);
  const persisted = JSON.parse(fs.readFileSync(ORDER_RULES_PATH, 'utf8'));
  assert.equal(persisted.version, 1); assert.deepEqual(Object.keys(persisted).sort(), ['accounts', 'version']);
  assert.equal(Object.keys(persisted.accounts).length, 2);
});

test('prototype and path-shaped identifiers remain ordinary JSON keys in the single settings file', () => {
  reset();
  for (const id of ['__proto__', 'constructor', 'toString', '../../synthetic-account']) {
    saveOrderRules(id, config('safe'));
    assert.equal(loadOrderRules(id).source, 'account');
  }
  const persisted = JSON.parse(fs.readFileSync(ORDER_RULES_PATH, 'utf8'));
  assert.ok(Object.hasOwn(persisted.accounts, '__proto__'));
  assert.equal(persisted.accounts.__proto__.version, 1);
  assert.deepEqual(fs.readdirSync(path.dirname(ORDER_RULES_PATH)), ['order-rules.json']);
  assert.equal(Object.prototype.version, undefined);
});

test('invalid IDs and invalid rule configuration cannot overwrite previously saved accounts', () => {
  reset(); saveOrderRules('account-A', config('a'));
  const original = fs.readFileSync(ORDER_RULES_PATH, 'utf8');
  for (const id of [null, '', ' account-A', 'account-A ', 'account\nA', 7, 'x'.repeat(513)]) {
    assert.throws(() => loadOrderRules(id), (error) => error.statusCode === 400);
    assert.throws(() => saveOrderRules(id, config('b')), (error) => error.statusCode === 400);
  }
  for (const invalid of [
    null, { version: 99, enabled: true, rules: [] },
    { version: 1, enabled: true, rules: [{ id: 'broken', priority: 1, type: 'EXECUTE_ACTION', enabled: true, params: {}, onFail: 'REFRESH' }] },
    { version: 1, enabled: true, rules: [{ id: 'broken', priority: 1, type: 'MIN_EXPERIENCE', enabled: true, params: { value: -1, operator: 'GT' }, onFail: 'KEEP' }] },
  ]) assert.throws(() => saveOrderRules('account-B', invalid));
  assert.equal(fs.readFileSync(ORDER_RULES_PATH, 'utf8'), original);
});

test('corrupt or unsupported root documents use safe defaults and reject destructive saves', () => {
  reset();
  for (const raw of ['{"version":', 'null', '[]', { version: 2, accounts: {} }, { version: 1, accounts: [] }, { version: 1, accounts: {}, future: true }]) {
    writeRaw(raw);
    const original = fs.readFileSync(ORDER_RULES_PATH, 'utf8');
    const loaded = loadOrderRules('account-A'); safeDefault(loaded); assert.ok(loaded.warning);
    assert.throws(() => saveOrderRules('account-A', config('a')), (error) => error.statusCode === 409);
    assert.equal(fs.readFileSync(ORDER_RULES_PATH, 'utf8'), original);
  }
});

test('one invalid account override falls back safely without erasing it or another account', () => {
  reset();
  const invalid = { version: 1, enabled: true, rules: 'broken' };
  writeRaw({ version: 1, accounts: { 'account-A': invalid } });
  const loaded = loadOrderRules('account-A'); safeDefault(loaded); assert.ok(loaded.warning);
  saveOrderRules('account-B', config('b'));
  assert.deepEqual(JSON.parse(fs.readFileSync(ORDER_RULES_PATH, 'utf8')).accounts['account-A'], invalid);
  assert.equal(loadOrderRules('account-B').source, 'account');
});

test('a failed atomic replacement preserves the old JSON and removes only its own temporary file', () => {
  reset(); saveOrderRules('account-A', config('a'));
  const original = fs.readFileSync(ORDER_RULES_PATH, 'utf8');
  const unrelated = path.join(path.dirname(ORDER_RULES_PATH), 'unrelated.tmp');
  fs.writeFileSync(unrelated, 'sentinel');
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => { if (to === ORDER_RULES_PATH) throw Error('synthetic rename failure'); return rename(from, to); };
    assert.throws(() => saveOrderRules('account-B', config('b')), (error) => error.statusCode === 500);
  } finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(ORDER_RULES_PATH, 'utf8'), original);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'sentinel');
  assert.deepEqual(fs.readdirSync(path.dirname(ORDER_RULES_PATH)).sort(), ['order-rules.json', 'unrelated.tmp']);
  safeDefault(loadOrderRules('account-B'));
});

test('read I/O failure returns a warning and default; account files and snapshot material stay untouched', () => {
  reset(); fs.mkdirSync(path.dirname(ORDER_RULES_PATH), { recursive: true });
  fs.mkdirSync(ORDER_RULES_PATH);
  const loaded = loadOrderRules('account-A'); safeDefault(loaded); assert.ok(loaded.warning);
  assert.throws(() => saveOrderRules('account-A', config('a')), (error) => error.statusCode === 409);
  assert.equal(fs.existsSync(path.join(path.dirname(ORDER_RULES_PATH), 'accounts.json')), false);
  assert.equal(fs.existsSync(path.join(path.dirname(ORDER_RULES_PATH), 'credentials.json')), false);
});

test.after(() => fs.rmSync(isolated, { recursive: true, force: true }));
