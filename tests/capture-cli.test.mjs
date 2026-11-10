import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { runCaptureCli, runRecoveryCli } from '../tools/capture-credentials.mjs';
import { upsertAccount } from '../src/accounts.mjs';
import { createCaptureController } from '../src/capture.mjs';

const cliPath = path.resolve(import.meta.dirname, '../tools/capture-credentials.mjs');
const record = (id = 'fake-open-id') => ({
  url: 'wss://fixture.invalid/ws?token=fixture-query-secret',
  body: { language: 'zh_CN', eworldParams: { openId: id, token: 'fixture-token-secret', sign: 'fixture-sign-secret', timestamp: 1 } },
  rawFrameHex: 'fixture-raw-frame-secret',
});
function fixture(t, behavior = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-capture-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const accountsPath = path.join(dir, 'accounts.json');
  const legacyPath = path.join(dir, 'credentials.json');
  fs.writeFileSync(legacyPath, 'legacy-sentinel-never-read-or-overwritten');
  const logs = []; const calls = []; let clock = 1000; let hooks; let captureCount = 0;
  let state = { running: false, phase: 'idle', error: null, recoveryPending: false };
  const accountStore = {
    loadStore() { calls.push('loadStore'); return fs.existsSync(accountsPath) ? JSON.parse(fs.readFileSync(accountsPath, 'utf8')) : { version: 1, activeId: null, accounts: [] }; },
    upsertAccount(store, credential) { calls.push('upsertAccount'); return upsertAccount(store, credential); },
    saveStore(store) { calls.push('saveStore'); if (behavior.storeFails) throw new Error('fixture-token-secret'); fs.writeFileSync(accountsPath, JSON.stringify(store)); },
  };
  const controller = {
    async startCapture(options) {
      calls.push('start'); hooks = options;
      assert.equal(options.keepCa, false);
      if (behavior.startThrows) throw new Error('fixture-token-secret');
      state = { ...state, running: true, phase: 'waiting', ...behavior.startState };
      if (behavior.captureOnStart) {
        try { await options.onLogin(record()); } catch (error) { state.error = error.message; }
      }
      return state;
    },
    captureState() { calls.push('state'); captureCount++; if (behavior.stateAtRead) state = { ...state, ...behavior.stateAtRead(captureCount) }; return state; },
    async stopCapture() { calls.push('stop'); if (behavior.stopThrows) throw new Error('fixture-sign-secret'); state = { ...state, running: false, phase: 'idle', ...behavior.stopState }; return state; },
  };
  const run = (overrides = {}) => runCaptureCli({ controller, accountStore, confirm: async () => { calls.push('confirm'); return true; }, write: (line) => logs.push(line), waitMs: 100, pollMs: 10, now: () => clock,
    sleep: async (ms) => { clock += ms; if (behavior.onSleep) await behavior.onSleep({ hooks, calls, controller }); }, ...overrides });
  return { dir, accountsPath, legacyPath, logs, calls, run, controller, accountStore, get hooks() { return hooks; } };
}
function assertNoSecrets(logs, result) {
  assert.doesNotMatch(logs.join('\n') + JSON.stringify(result), /fixture-token-secret|fixture-sign-secret|fixture-raw-frame-secret|fixture-query-secret|fake-open-id/);
}

test('import is inert: no account access, capture dependency loading, output, or process handlers', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-capture-cli-import-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sentinel = path.join(dir, 'credentials.json'); fs.writeFileSync(sentinel, 'not-json-do-not-read');
  const source = "import assert from 'node:assert/strict'; const before = Object.fromEntries(['exit','SIGINT','SIGTERM','SIGHUP','uncaughtException'].map((name) => [name, process.listenerCount(name)])); await import(" + JSON.stringify(pathToFileURL(cliPath).href) + "); for (const [name,count] of Object.entries(before)) assert.equal(process.listenerCount(name), count, name);";
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', source], { cwd: dir, env: { ...process.env, CW_DATA_DIR: dir, CW_PROXY_BACKUP: path.join(dir, 'proxy.json') }, encoding: 'utf8', timeout: 10000 });
  assert.equal(output, ''); assert.equal(fs.readFileSync(sentinel, 'utf8'), 'not-json-do-not-read'); assert.deepEqual(fs.readdirSync(dir), ['credentials.json']);
});

test('cancel precedes controller start and all account access', async (t) => {
  const f = fixture(t); const result = await f.run({ confirm: async () => false });
  assert.equal(result.status, 'cancelled'); assert.deepEqual(f.calls, []); assert.equal(fs.existsSync(f.accountsPath), false);
});

test('successful capture uses validated account storage, omits raw frame, never logs credentials, and stops once', async (t) => {
  const f = fixture(t, { captureOnStart: true }); const result = await f.run();
  assert.equal(result.status, 'captured'); assert.equal(f.calls[0], 'confirm'); assert.equal(f.calls[1], 'start'); assert.equal(f.calls.filter((entry) => entry === 'stop').length, 1);
  const stored = JSON.parse(fs.readFileSync(f.accountsPath, 'utf8'));
  assert.equal(stored.accounts.length, 1); assert.equal(stored.accounts[0].login.eworldParams.token, 'fixture-token-secret'); assert.equal(stored.accounts[0].loginFrameHex, null);
  assert.equal(fs.readFileSync(f.legacyPath, 'utf8'), 'legacy-sentinel-never-read-or-overwritten');
  assertNoSecrets(f.logs, result); assert.equal(f.hooks.onLog, undefined);
});

test('duplicate callback and repeated controller cleanup do not duplicate account writes', async (t) => {
  const f = fixture(t, { captureOnStart: true }); await f.run();
  await f.hooks.onLogin(record('second-account')); await f.controller.stopCapture(); await f.controller.stopCapture();
  assert.equal(f.calls.filter((entry) => entry === 'saveStore').length, 1);
  assert.equal(JSON.parse(fs.readFileSync(f.accountsPath, 'utf8')).accounts.length, 1);
});

test('capture callback after timeout cannot save an account', async (t) => {
  const f = fixture(t); const result = await f.run();
  assert.equal(result.status, 'timeout'); assert.equal(f.calls.filter((entry) => entry === 'stop').length, 1);
  await f.hooks.onLogin(record()); assert.equal(fs.existsSync(f.accountsPath), false); assertNoSecrets(f.logs, result);
});

for (const [name, behavior] of [
  ['returned start failure', { startState: { running: false, phase: 'failed', error: 'fixture-token-secret' } }],
  ['thrown start failure', { startThrows: true }],
  ['capture fails while waiting', { stateAtRead: () => ({ running: false, error: 'fixture-sign-secret' }) }],
  ['store failure', { captureOnStart: true, storeFails: true }],
]) test(name + ': cleanup still runs and errors cannot leak credentials', async (t) => {
  const f = fixture(t, behavior); const result = await f.run();
  assert.equal(result.status, 'failed'); assert.equal(f.calls.filter((entry) => entry === 'stop').length, 1); assert.equal(fs.existsSync(f.accountsPath), false); assertNoSecrets(f.logs, result);
});

for (const behavior of [{ stopThrows: true }, { stopState: { recoveryPending: true, phase: 'recovery_required' } }, { stopState: { recoveryPending: false, phase: 'recovery_required' } }, { startState: { running: false, phase: 'recovery_required', recoveryPending: true, error: 'fixture-token-secret' } }]) {
  test('unfinished recovery reports required action without claiming settings restored', async (t) => {
    const f = fixture(t, behavior); const result = await f.run(); assert.equal(result.status, 'recovery_required');
    assert.match(f.logs.at(-1), /恢复尚未完成/); assert.doesNotMatch(f.logs.at(-1), /已恢复/); assertNoSecrets(f.logs, result);
  });
}

test('invalid wait or port parameters do not begin an interactive or system operation', async (t) => {
  const f = fixture(t); assert.equal((await f.run({ waitMs: Number.NaN })).status, 'failed'); assert.equal((await f.run({ port: 0 })).status, 'failed'); assert.deepEqual(f.calls, []);
});


test('CLI with the real capture controller saves one login and restores its complete fake system transaction', async (t) => {
  const f = fixture(t);
  const fingerprint = 'A'.repeat(40), unrelated = 'B'.repeat(40);
  const certificates = new Set([unrelated]);
  const effects = [];
  const original = { version: 1, key: 'FAKE-REGISTRY-ONLY', savedAt: 'before', values: { ProxyEnable: { exists: true, type: 'REG_DWORD', data: '0x0' }, ProxyServer: { exists: true, type: 'REG_SZ', data: 'original.example:8080' }, ProxyOverride: { exists: false, type: null, data: null } } };
  let current = structuredClone(original), proxyOptions, clock = 1000, delivered = false;
  const lifecycle = new EventEmitter();
  lifecycle.pid = 2147483000;
  lifecycle.exit = () => assert.fail('the CLI must not exit its injected lifecycle');
  const ca = {
    CA_DIR: f.dir, CA_CRT: path.join(f.dir, 'synthetic.crt'), CA_CN: 'Synthetic test only',
    initCa() { effects.push('initCa'); }, caFingerprint: () => fingerprint, isInstalled: (id = fingerprint) => certificates.has(id),
    installCa() { effects.push('installCa'); certificates.add(fingerprint); return { installed: true, thumbprint: fingerprint, owned: true }; },
    uninstallCa(receipt) { effects.push('uninstallCa'); assert.deepEqual(receipt, { thumbprint: fingerprint, owned: true }); certificates.delete(receipt.thumbprint); return false; },
  };
  const settings = {
    readSnapshot() { effects.push('readSnapshot'); return structuredClone(current); },
    assertBackupReady(snapshot) { effects.push('assertBackupReady'); assert.deepEqual(snapshot, original); assert.equal(certificates.has(fingerprint), false, 'backup readiness must precede CA installation'); },
    setProxy(host, port, { snapshot }) { effects.push('setProxy'); assert.deepEqual(snapshot, original); current.values.ProxyEnable.data = '0x1'; current.values.ProxyServer.data = host + ':' + port; },
    restore(saved) { effects.push('restore'); current = structuredClone(saved); return {}; },
  };
  const journalPath = path.join(f.dir, 'capture-session.json');
  const controller = createCaptureController({ ca, settings, journalPath, lifecycle, pidIsAlive: () => false, proxyFactory(options) {
    proxyOptions = options;
    return { port: options.port, async listen() { effects.push('listen'); }, async stop() { effects.push('stop'); } };
  } });
  t.after(async () => { await controller.stopCapture('test cleanup'); });
  const result = await f.run({ controller, now: () => clock, sleep: async (ms) => {
    clock += ms;
    assert.equal(delivered, false, 'a normal running journal must not make the CLI reject startup');
    const state = controller.captureState();
    assert.equal(state.running, true); assert.equal(state.phase, 'waiting'); assert.equal(state.recoveryPending, false);
    assert.equal(certificates.has(fingerprint), true); assert.equal(certificates.has(unrelated), true);
    assert.equal(current.values.ProxyServer.data, '127.0.0.1:' + proxyOptions.port);
    const journal = fs.readFileSync(journalPath, 'utf8');
    assert.deepEqual(JSON.parse(journal).originalProxy, original); assertNoSecrets([journal], {});
    delivered = true;
    await proxyOptions.onLogin(record());
    assert.equal(controller.captureState().phase, 'captured');
  } });
  assert.equal(delivered, true); assert.deepEqual(result, { status: 'captured', created: true });
  assert.deepEqual(effects, ['readSnapshot', 'assertBackupReady', 'initCa', 'installCa', 'listen', 'setProxy', 'stop', 'restore', 'uninstallCa']);
  assert.deepEqual(current, original); assert.deepEqual([...certificates], [unrelated]);
  assert.equal(fs.existsSync(journalPath), false); assert.equal(lifecycle.eventNames().length, 0);
  assert.equal(controller.captureState().running, false); assert.equal(controller.captureState().phase, 'idle'); assert.equal(controller.captureState().recoveryPending, false);
  const stored = JSON.parse(fs.readFileSync(f.accountsPath, 'utf8'));
  assert.equal(stored.accounts.length, 1); assert.equal(stored.accounts[0].login.eworldParams.token, 'fixture-token-secret'); assert.equal(stored.accounts[0].loginFrameHex, null);
  assert.equal(JSON.stringify(stored).includes('fixture-raw-frame-secret'), false);
  assert.equal(fs.readFileSync(f.legacyPath, 'utf8'), 'legacy-sentinel-never-read-or-overwritten');
  assertNoSecrets(f.logs, result);
});


test('recovery cancellation precedes controller access and preserves local account sentinels', async (t) => {
  const f = fixture(t);
  const controller = new Proxy({}, { get() { assert.fail('cancelled recovery must not access the controller'); } });
  const result = await runRecoveryCli({ controller, confirm: async () => false, write: (line) => f.logs.push(line) });
  assert.deepEqual(result, { status: 'cancelled' }); assert.deepEqual(f.calls, []);
  assert.equal(fs.existsSync(f.accountsPath), false); assert.equal(fs.readFileSync(f.legacyPath, 'utf8'), 'legacy-sentinel-never-read-or-overwritten');
});

test('recovery calls only recoverCapture after confirmation and emits fixed status text', async () => {
  const calls = [], logs = [];
  const controller = new Proxy({}, { get(_target, name) { assert.equal(name, 'recoverCapture'); return async () => { calls.push('recover'); return { running: false, phase: 'idle', error: null, recoveryPending: false }; }; } });
  const result = await runRecoveryCli({ controller, confirm: async () => { calls.push('confirm'); return true; }, write: (line) => logs.push(line) });
  assert.deepEqual(calls, ['confirm', 'recover']); assert.deepEqual(result, { status: 'recovered' }); assertNoSecrets(logs, result);
});

for (const state of [{ running: true }, { recoveryPending: true }, { phase: 'recovery_required' }, { error: 'fixture-token-secret' }, null]) {
  test('failed or incomplete standalone recovery cannot report success or leak underlying secrets', async () => {
    const logs = [];
    const controller = { async recoverCapture() { if (!state) throw new Error('fixture-sign-secret'); return state; } };
    const result = await runRecoveryCli({ controller, confirm: async () => true, write: (line) => logs.push(line) });
    assert.deepEqual(result, { status: 'recovery_required', reason: 'recovery' }); assert.match(logs.at(-1), /恢复尚未完成/); assertNoSecrets(logs, result);
  });
}

test('standalone recovery restores a pre-existing real-controller journal without starting capture or accessing accounts', async (t) => {
  const f = fixture(t), effects = [], logs = [];
  const thumbprint = 'A'.repeat(40), unrelated = 'B'.repeat(40), certificates = new Set([thumbprint, unrelated]);
  const journalPath = path.join(f.dir, 'capture-session.json');
  const original = { version: 1, key: 'FAKE-REGISTRY-ONLY', savedAt: 'before', values: { ProxyEnable: { exists: true, type: 'REG_DWORD', data: '0x0' }, ProxyServer: { exists: false, type: null, data: null }, ProxyOverride: { exists: false, type: null, data: null } } };
  let current = { modifiedByFixture: true };
  fs.writeFileSync(journalPath, JSON.stringify({ version: 1, id: 'synthetic-crashed-transaction', pid: 2147482999, originalProxy: original, proxyIntent: true, ca: { thumbprint, owned: true, installIntent: true } }));
  const lifecycle = new EventEmitter(); lifecycle.pid = 2147483000; lifecycle.exit = () => assert.fail('unexpected lifecycle exit');
  const forbidden = () => assert.fail('recovery must not initialize or start a new capture transaction');
  const controller = createCaptureController({ journalPath, lifecycle, pidIsAlive: () => false, proxyFactory: forbidden,
    ca: { CA_DIR: f.dir, CA_CRT: path.join(f.dir, 'synthetic.crt'), CA_CN: 'Synthetic test only', initCa: forbidden, installCa: forbidden, caFingerprint: forbidden, isInstalled: forbidden, uninstallCa(receipt) { effects.push('uninstallCa'); assert.deepEqual(receipt, { thumbprint, owned: true }); certificates.delete(thumbprint); } },
    settings: { readSnapshot: forbidden, setProxy: forbidden, restore(saved) { effects.push('restore'); current = structuredClone(saved); } },
  });
  const result = await runRecoveryCli({ controller, confirm: async () => { effects.push('confirm'); return true; }, write: (line) => logs.push(line) });
  assert.deepEqual(result, { status: 'recovered' }); assert.deepEqual(effects, ['confirm', 'restore', 'uninstallCa']);
  assert.deepEqual(current, original); assert.deepEqual([...certificates], [unrelated]);
  assert.equal(fs.existsSync(journalPath), false); assert.equal(fs.existsSync(journalPath + '.lock'), false); assert.equal(lifecycle.eventNames().length, 0);
  assert.deepEqual(f.calls, []); assert.equal(fs.existsSync(f.accountsPath), false); assert.equal(fs.readFileSync(f.legacyPath, 'utf8'), 'legacy-sentinel-never-read-or-overwritten');
  assertNoSecrets(logs, result);
});

test('the explicit --recover executable route confirms recovery before loading dependencies', (t) => {
  const f = fixture(t);
  const output = execFileSync(process.execPath, [cliPath, '--recover'], { input: 'n\n', encoding: 'utf8', timeout: 10000, cwd: f.dir });
  assert.match(output, /确认恢复已有抓包事务/); assert.match(output, /已取消恢复/); assert.doesNotMatch(output, /确认开始捕获/);
  assert.equal(fs.existsSync(f.accountsPath), false); assert.equal(fs.readFileSync(f.legacyPath, 'utf8'), 'legacy-sentinel-never-read-or-overwritten');
});
