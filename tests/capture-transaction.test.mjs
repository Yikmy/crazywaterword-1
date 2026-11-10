import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createCaptureController } from '../src/capture.mjs';

const fingerprint = 'A'.repeat(40), unrelated = 'B'.repeat(40);
function harness(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-capture-transaction-'));
  const lifecycle = new EventEmitter(); lifecycle.pid = 2147483000; lifecycle.exits = []; lifecycle.exit = (code) => lifecycle.exits.push(code);
  const original = { version: 1, key: 'FAKE-REGISTRY-ONLY', savedAt: 'before', values: { ProxyEnable: { exists: true, type: 'REG_DWORD', data: '0x0' }, ProxyServer: { exists: true, type: 'REG_SZ', data: 'original.example:8080' }, ProxyOverride: { exists: false, type: null, data: null } } };
  let current = structuredClone(original), installs = 0, removals = 0, sets = 0, restores = 0, restoreFailures = options.restoreFailures || 0;
  const certificates = new Set([unrelated, ...(options.preexisting ? [fingerprint] : [])]);
  const ca = { CA_DIR: dir, CA_CRT: path.join(dir, 'synthetic.crt'), CA_CN: 'Synthetic test only', initCa() {}, caFingerprint: () => fingerprint, isInstalled: (id = fingerprint) => certificates.has(id), installCa() { installs++; const owned = !certificates.has(fingerprint); certificates.add(fingerprint); if (options.installFail) throw Error('synthetic install failure after side effect'); return { installed: true, thumbprint: fingerprint, owned }; }, uninstallCa(receipt) { assert.equal(receipt.owned, true); assert.equal(receipt.thumbprint, fingerprint); removals++; certificates.delete(receipt.thumbprint); return false; } };
  const settings = { readSnapshot: () => structuredClone(current), setProxy(host, port, { snapshot }) { sets++; assert.deepEqual(snapshot, original); if (options.conflict) { const error = Error('snapshot changed'); error.code = 'PROXY_SNAPSHOT_CONFLICT'; throw error; } current.values.ProxyEnable.data = '0x1'; current.values.ProxyServer.data = host + ':' + port; if (options.setFail) throw Error('synthetic write failure after side effect'); return {}; }, restore(saved) { restores++; if (restoreFailures-- > 0) throw Error('synthetic restore failure'); current = structuredClone(saved); return {}; } };
  const proxies = []; const factory = (args) => { const instance = { args, port: args.port || 17399, listens: 0, stops: 0, async listen() { this.listens++; if (options.listenGate) await options.listenGate; if (options.listenFail) throw Error('EADDRINUSE synthetic port conflict'); }, async stop() { this.stops++; } }; proxies.push(instance); return instance; };
  const journalPath = path.join(dir, 'capture-session.json');
  const controller = createCaptureController({ ca, settings, proxyFactory: factory, journalPath, lifecycle, pidIsAlive: () => options.liveOwner === true });
  return { ...controller, dir, lifecycle, ca, settings, factory, journalPath, proxies, certificates, original, current: () => current, counts: () => ({ installs, removals, sets, restores }), async dispose() { await controller.stopCapture(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
function restored(app) { assert.deepEqual(app.current(), app.original); assert.equal(app.certificates.has(unrelated), true); assert.equal(app.certificates.has(fingerprint), false); assert.equal(fs.existsSync(app.journalPath), false); assert.equal(app.captureState().running, false); }

test('capture startup snapshots before mutation; repeated start and stop are idempotent', async () => {
  const app = harness();
  try {
    assert.equal(app.lifecycle.eventNames().length, 0);
    const first = app.startCapture(), second = app.startCapture(); assert.equal(first, second);
    const state = await first; assert.equal(state.running, true); assert.equal(state.phase, 'waiting');
    assert.deepEqual(JSON.parse(fs.readFileSync(app.journalPath)).originalProxy, app.original);
    await app.startCapture(); assert.equal(app.proxies.length, 1); assert.deepEqual(app.counts(), { installs: 1, removals: 0, sets: 1, restores: 0 });
    const stop = app.stopCapture(), again = app.stopCapture(); assert.equal(stop, again); await stop; await app.stopCapture(); restored(app);
    assert.deepEqual(app.counts(), { installs: 1, removals: 1, sets: 1, restores: 1 }); assert.equal(app.lifecycle.eventNames().length, 0);
  } finally { await app.dispose(); }
});
test('port conflict and proxy startup failure roll back owned CA without touching proxy settings', async () => {
  const app = harness({ listenFail: true });
  try { const result = await app.startCapture(); assert.equal(result.running, false); assert.match(result.error, /EADDRINUSE/); restored(app); assert.equal(app.counts().sets, 0); assert.equal(app.counts().removals, 1); }
  finally { await app.dispose(); }
});
test('certificate installation failure after side effect removes only the newly added CA', async () => {
  const app = harness({ installFail: true });
  try { const result = await app.startCapture(); assert.match(result.error, /install failure/); restored(app); assert.equal(app.counts().sets, 0); assert.equal(app.counts().removals, 1); }
  finally { await app.dispose(); }
});
test('partial proxy write failure restores exact original values', async () => {
  const app = harness({ setFail: true });
  try { const result = await app.startCapture(); assert.match(result.error, /write failure/); restored(app); assert.equal(app.counts().restores, 1); }
  finally { await app.dispose(); }
});
test('preexisting exact CA is retained and unrelated CA is never deleted', async () => {
  const app = harness({ preexisting: true });
  try { await app.startCapture(); await app.stopCapture(); assert.equal(app.certificates.has(fingerprint), true); assert.equal(app.certificates.has(unrelated), true); assert.equal(app.counts().removals, 0); assert.deepEqual(app.current(), app.original); }
  finally { await app.dispose(); }
});
test('failed recovery retains journal and retry completes cleanup', async () => {
  const app = harness({ restoreFailures: 1 });
  try { await app.startCapture(); const failed = await app.stopCapture(); assert.equal(failed.phase, 'recovery_required'); assert.equal(failed.recoveryPending, true); assert.equal(fs.existsSync(app.journalPath), true); await app.stopCapture(); restored(app); }
  finally { await app.dispose(); }
});
test('uncaught exception, rejected promise and exit handlers restore without exposing errors', async () => {
  for (const event of ['uncaughtException', 'unhandledRejection', 'exit']) {
    const app = harness();
    try { await app.startCapture(); app.lifecycle.emit(event, new Error('synthetic fatal')); restored(app); if (event !== 'exit') assert.deepEqual(app.lifecycle.exits, [1]); }
    finally { await app.dispose(); }
  }
});
test('signal handler awaits rollback before exiting', async () => {
  const app = harness();
  try { await app.startCapture(); app.lifecycle.emit('SIGINT'); await new Promise((resolve) => setImmediate(resolve)); restored(app); assert.deepEqual(app.lifecycle.exits, [130]); }
  finally { await app.dispose(); }
});
test('stale crash journal is recovered by a new controller without installing a CA', async () => {
  const app = harness();
  try {
    await app.startCapture();
    const lifecycle = new EventEmitter(); lifecycle.pid = 2147482999; lifecycle.exit = () => assert.fail('unexpected exit');
    const next = createCaptureController({ ca: app.ca, settings: app.settings, proxyFactory: app.factory, journalPath: app.journalPath, lifecycle, pidIsAlive: () => false });
    await next.recoverCapture(); assert.deepEqual(app.current(), app.original); assert.equal(app.certificates.has(fingerprint), false); assert.equal(fs.existsSync(app.journalPath), false); assert.equal(app.counts().installs, 1);
  } finally { await app.dispose(); }
});
test('another live capture owner cannot be recovered or overwritten', async () => {
  const app = harness();
  try {
    await app.startCapture(); const before = fs.readFileSync(app.journalPath, 'utf8');
    const other = createCaptureController({ ca: app.ca, settings: app.settings, proxyFactory: app.factory, journalPath: app.journalPath, lifecycle: app.lifecycle, pidIsAlive: () => true });
    const result = await other.startCapture(); assert.equal(result.running, false); assert.match(result.error, /仍在运行/); assert.equal(fs.readFileSync(app.journalPath, 'utf8'), before); assert.equal(app.counts().removals, 0);
  } finally { await app.dispose(); }
});
test('pre-mutation proxy conflict never writes the stale snapshot back', async () => {
  const app = harness({ conflict: true });
  try { await app.startCapture(); assert.equal(app.counts().restores, 0); restored(app); }
  finally { await app.dispose(); }
});
test('synthetic credentials and raw login frame are redacted in logs and public state', async () => {
  const app = harness(); const token = 'synthetic-capture-token', sign = 'synthetic-capture-sign', frame = 'ffeeabcd1234567890'; const logs = [];
  try {
    await app.startCapture({ onLog: (line) => logs.push(line), onLogin: async () => { throw Error(token + ' / ' + sign + ' / ' + frame); } });
    const journalBefore = fs.readFileSync(app.journalPath, 'utf8');
    await app.proxies[0].args.onLogin({ url: 'wss://example.invalid/ws', name: 'LoginRequest', body: { eworldParams: { openId: 'synthetic-user', token, sign, timestamp: 1 } }, rawFrameHex: frame });
    const output = JSON.stringify({ logs, state: app.captureState() }); for (const secret of [token, sign, frame]) assert.equal(output.includes(secret), false);
    for (const secret of [token, sign, frame]) assert.equal(journalBefore.includes(secret), false);
    restored(app);
  } finally { await app.dispose(); }
});
test('stop during startup cancels before proxy settings are modified', async () => {
  let release; const gate = new Promise((resolve) => { release = resolve; }); const app = harness({ listenGate: gate });
  try { const starting = app.startCapture(); await new Promise((resolve) => setImmediate(resolve)); const stopping = app.stopCapture(); release(); await starting; await stopping; restored(app); assert.equal(app.counts().sets, 0); }
  finally { await app.dispose(); }
});

// Exercise the real transaction controller through the real CLI, with fake OS adapters.
test('CLI and transaction controller integrate without false recovery or implicit login', async () => {
  const { runCaptureCli } = await import('../tools/capture-credentials.mjs');
  const app = harness(); let time = 0, writes = 0; const logs = [];
  try {
    const accountStore = { loadStore: () => ({ accounts: [] }), upsertAccount: (store, value) => { assert.equal(value.loginFrameHex, undefined); return { account: { id: value.login.eworldParams.openId }, created: true }; }, saveStore: () => writes++ };
    const result = await runCaptureCli({ controller: app, accountStore, confirm: async () => true, write: (line) => logs.push(line), waitMs: 1000, now: () => time, sleep: async (ms) => { time += ms; await app.proxies[0].args.onLogin({ url: 'wss://example.invalid/ws', body: { eworldParams: { openId: 'synthetic', token: 'integration-token', sign: 'integration-sign', timestamp: 1 } }, rawFrameHex: 'synthetic-integration-frame' }); } });
    assert.equal(result.status, 'captured'); assert.equal(writes, 1); restored(app);
    assert.doesNotMatch(JSON.stringify(logs), /integration-token|integration-sign|synthetic-integration-frame/);
  } finally { await app.dispose(); }
});

test('invalid login and failed account storage automatically stop and restore capture', async () => {
  for (const record of [{ url: 'wss://example.invalid/ws', body: {} }, { url: 'wss://example.invalid/ws', body: { eworldParams: { openId: 'synthetic', token: 'synthetic-token', sign: 'synthetic-sign', timestamp: 1 } } }]) {
    const app = harness();
    try { await app.startCapture({ onLogin: async () => { throw Error('synthetic store failure'); } }); await app.proxies[0].args.onLogin(record); restored(app); assert.ok(app.captureState().error); }
    finally { await app.dispose(); }
  }
});
test('failed proxy stop retains ownership until recover retries the same instance', async () => {
  const app = harness();
  try {
    await app.startCapture(); const instance = app.proxies[0]; let stops = 0;
    instance.stop = async () => { if (++stops === 1) throw Error('synthetic close failure'); };
    const failed = await app.stopCapture(); assert.equal(failed.phase, 'recovery_required'); assert.equal(failed.recoveryPending, true); assert.equal(fs.existsSync(app.journalPath), true);
    await app.recoverCapture(); restored(app); assert.equal(app.proxies.length, 1); assert.equal(stops, 2);
  } finally { await app.dispose(); }
});
test('corrupt journal is reported and never triggers system mutation', async () => {
  const app = harness();
  try {
    fs.writeFileSync(app.journalPath, '{truncated'); const before = fs.readFileSync(app.journalPath, 'utf8');
    assert.equal(app.captureState().recoveryPending, true); const result = await app.startCapture(); assert.equal(result.phase, 'recovery_required'); assert.equal(result.running, false);
    assert.deepEqual(app.counts(), { installs: 0, removals: 0, sets: 0, restores: 0 }); assert.equal(fs.readFileSync(app.journalPath, 'utf8'), before);
  } finally { await app.dispose(); }
});

test('failed CA write-ahead journal does not install or remove a certificate', async () => {
  const app = harness();
  try {
    fs.mkdirSync(app.journalPath + '.tmp'); const result = await app.startCapture();
    assert.equal(result.running, false); assert.deepEqual(app.counts(), { installs: 0, removals: 0, sets: 0, restores: 0 });
    assert.deepEqual(app.current(), app.original);
  } finally { await app.dispose(); }
});
test('failed proxy write-ahead journal never restores settings that were not changed', async () => {
  const app = harness(); const install = app.ca.installCa;
  try {
    app.ca.installCa = () => { const receipt = install(); fs.mkdirSync(app.journalPath + '.tmp'); return receipt; };
    const result = await app.startCapture(); assert.equal(result.running, false); assert.equal(app.counts().sets, 0); assert.equal(app.counts().restores, 0);
    assert.deepEqual(app.current(), app.original); assert.equal(app.certificates.has(fingerprint), false);
    fs.rmdirSync(app.journalPath + '.tmp'); await app.recoverCapture(); restored(app);
  } finally { await app.dispose(); }
});

test('late callbacks from a stopped transaction cannot alter its replacement', async () => {
  const app = harness(); let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  try {
    await app.startCapture({ onLogin: () => pending });
    const oldCallback = app.proxies[0].args.onLogin;
    const old = oldCallback({ url: 'wss://example.invalid/ws', body: { eworldParams: { openId: 'old', token: 'old-token', sign: 'old-sign', timestamp: 1 } } });
    await new Promise((resolve) => setImmediate(resolve)); await app.stopCapture(); await app.startCapture();
    complete({ id: 'old' }); await old;
    assert.equal(app.captureState().accountId, null); assert.equal(app.captureState().phase, 'waiting'); assert.equal(app.captureState().running, true);
    await oldCallback({ body: {} }); assert.equal(app.captureState().running, true);
  } finally { await app.dispose(); }
});

test('replaced journal is preserved and cannot authorize restoration of another transaction', async () => {
  const app = harness();
  try {
    await app.startCapture(); const original = fs.readFileSync(app.journalPath, 'utf8'); const replacement = JSON.parse(original); replacement.id = 'another-transaction';
    fs.writeFileSync(app.journalPath, JSON.stringify(replacement)); const result = await app.stopCapture();
    assert.equal(result.phase, 'recovery_required'); assert.equal(result.recoveryPending, true); assert.equal(app.counts().restores, 0); assert.equal(app.counts().removals, 0);
    assert.equal(JSON.parse(fs.readFileSync(app.journalPath)).id, 'another-transaction');
    fs.writeFileSync(app.journalPath, original); await app.stopCapture(); restored(app);
  } finally { await app.dispose(); }
});

test('repeated recovery calls share one completion and never race a new capture', async () => {
  const app = harness({ restoreFailures: 1 });
  try {
    await app.startCapture(); await app.stopCapture();
    const first = app.recoverCapture(), second = app.recoverCapture(); assert.equal(first, second);
    const restart = app.startCapture(); await first; await restart;
    assert.equal(app.captureState().running, true); assert.equal(app.proxies.length, 2); assert.equal(app.counts().restores, 2);
  } finally { await app.dispose(); }
});

test('CA identity change before installation cannot authorize removal of another tool certificate', async () => {
  const app = harness();
  try {
    app.ca.installCa = ({ expectedThumbprint }) => {
      assert.equal(expectedThumbprint, fingerprint); app.certificates.add(fingerprint);
      const error = Error('CA identity changed'); error.code = 'CA_IDENTITY_CHANGED'; error.ownership = { thumbprint: unrelated, owned: false }; throw error;
    };
    const state = await app.startCapture();
    assert.equal(state.running, false); assert.match(state.error, /identity changed/);
    assert.equal(app.counts().removals, 0); assert.equal(app.counts().sets, 0);
    assert.deepEqual([...app.certificates].sort(), [fingerprint, unrelated].sort());
    assert.equal(fs.existsSync(app.journalPath), false);
  } finally { await app.dispose(); }
});

test('mismatched CA adapter receipt rolls back the actual owned identity', async () => {
  const app = harness(), actual = 'C'.repeat(40); let removed;
  try {
    app.ca.installCa = () => { app.certificates.add(actual); return { thumbprint: actual, owned: true, installed: true }; };
    app.ca.uninstallCa = (receipt) => { removed = receipt; app.certificates.delete(receipt.thumbprint); };
    const state = await app.startCapture();
    assert.equal(state.running, false); assert.deepEqual(removed, { thumbprint: actual, owned: true });
    assert.equal(app.certificates.has(actual), false); assert.equal(app.certificates.has(unrelated), true);
    assert.equal(app.counts().sets, 0); assert.equal(fs.existsSync(app.journalPath), false);
  } finally { await app.dispose(); }
});
