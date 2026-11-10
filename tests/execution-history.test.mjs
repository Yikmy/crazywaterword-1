import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createExecutionHistory } from '../src/execution-history.mjs';

function fixture() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-history-')); return { dir, file: path.join(dir, 'history.json') }; }
function run(id = 'A', status = 'SUCCESS') { return { accountId: id, runId: 'run-' + id, module: 'orders', finalStatus: status,
  authorizationSummary: { planHash: 'hash', actionIds: ['one'] }, actions: [{ actionId: 'one', requestStatus: status, result: status }] }; }

test('history atomically persists account-separated runs, including special dictionary keys', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run('A')); store.put(run('B')); store.put(run('__proto__'));
    const reloaded = createExecutionHistory({ file });
    assert.equal(reloaded.list('A')[0].accountId, 'A'); assert.equal(reloaded.list('B')[0].accountId, 'B');
    assert.equal(reloaded.list('__proto__')[0].accountId, '__proto__'); assert.deepEqual(reloaded.list('missing'), []);
    assert.equal(reloaded.unresolved('A'), false); assert.deepEqual(fs.readdirSync(dir), ['history.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('restart recovers in-flight actions as UNKNOWN, never resumes or releases reservations', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }), record = run('A', 'EXECUTING');
    record.resourceBudget = [{ id: 'wood', num: 80 }]; record.actions[0].requestStatus = 'DISPATCHING'; store.put(record);
    assert.equal(store.list('A')[0].recovered, undefined, 'live run is not reported as crashed');
    const recovered = createExecutionHistory({ file }); const row = recovered.list('A')[0];
    assert.equal(row.finalStatus, 'UNKNOWN'); assert.equal(row.recovered, true); assert.equal(recovered.unresolved('A'), true);
    assert.deepEqual(row.resourceBudget, record.resourceBudget); assert.equal(row.actions[0].requestStatus, 'UNKNOWN');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).accounts.A[0].finalStatus, 'EXECUTING', 'reading never rewrites evidence');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('history removes credentials and known secret echoes but retains public authorization evidence', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file, secrets: () => ['synthetic-secret-value'] }), record = run();
    record.actions[0].beforeState = { token: 'synthetic-token', sign: 'synthetic-sign', cookie: 'synthetic-cookie', loginFrameHex: 'abcdef', note: 'synthetic-secret-value' };
    store.put(record); const text = fs.readFileSync(file, 'utf8');
    for (const secret of ['synthetic-token', 'synthetic-sign', 'synthetic-cookie', 'abcdef', 'synthetic-secret-value']) assert.equal(text.includes(secret), false);
    assert.deepEqual(store.list('A')[0].authorization, record.authorizationSummary);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('corrupt or foreign-version history fails closed and never overwrites original evidence', () => {
  const { dir, file } = fixture();
  try {
    for (const text of ['{broken', '{"version":2,"accounts":{}}', '{"version":1,"accounts":{"A":[{"accountId":"B","runId":"x","actions":[]}]}}']) {
      fs.writeFileSync(file, text); const store = createExecutionHistory({ file });
      assert.throws(() => store.list('A'), /历史/); assert.throws(() => store.put(run()), /历史/); assert.equal(fs.readFileSync(file, 'utf8'), text);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('failed atomic replacement preserves original history and cleans the temporary file', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run()); const before = fs.readFileSync(file, 'utf8');
    const original = fs.renameSync; fs.renameSync = () => { throw Error('synthetic rename failure'); };
    try { assert.throws(() => store.put(run('B')), /保存失败/); } finally { fs.renameSync = original; }
    assert.equal(fs.readFileSync(file, 'utf8'), before); assert.deepEqual(fs.readdirSync(dir), ['history.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sent rate-limited writes remain unresolved across restart even while preserving the rate-limit result', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }), record = run('A', 'RATE_LIMITED');
    record.actions[0].dispatched = true; record.actions[0].unresolvedWrite = true; store.put(record);
    assert.equal(store.list('A')[0].finalStatus, 'RATE_LIMITED'); assert.equal(store.unresolved('A'), true);
    const restarted = createExecutionHistory({ file }); assert.equal(restarted.unresolved('A'), true); assert.equal(restarted.list('A')[0].finalStatus, 'UNKNOWN');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('logical history corruption cannot masquerade as completed writes', () => {
  const { dir, file } = fixture();
  try {
    for (const mutate of [r => { delete r.finalStatus; }, r => { r.actions[0].requestStatus = 'ALIEN'; }, r => { r.actions[0] = null; }, r => { delete r.actions[0].result; }]) {
      const record = run(); mutate(record); fs.writeFileSync(file, JSON.stringify({ version: 1, accounts: { A: [record] } }));
      assert.throws(() => createExecutionHistory({ file }).unresolved('A'), /历史/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
