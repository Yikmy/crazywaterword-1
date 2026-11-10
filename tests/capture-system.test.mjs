import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCaManager, CA_CN, resolveOpenSsl } from '../tools/mitm-ca.mjs';
import { createProxySettings } from '../tools/proxy-settings.mjs';

const A = 'A'.repeat(40), B = 'B'.repeat(40);
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-capture-system-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function fakeCa(dir, initial = []) {
  const store = new Set(initial), calls = [];
  let failAdd = false;
  const runner = (program, args) => {
    calls.push({ program, args });
    if (program === 'openssl') {
      if (args.includes('-pubkey') || args.includes('-pubout')) return Buffer.from('TEST PUBLIC KEY');
      if (args.includes('-fingerprint')) return Buffer.from('sha1 Fingerprint=' + A.match(/../g).join(':'));
      const at = args.indexOf('-out');
      if (at >= 0) fs.writeFileSync(args[at + 1], args[0] === 'genrsa' ? 'TEST PRIVATE KEY' : 'TEST CERTIFICATE');
      return Buffer.from('');
    }
    if (path.basename(program).toLowerCase() === 'powershell.exe') {
      const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
      const target = script.match(/\$target = '([A-F0-9]{40})'/)?.[1];
      assert.equal(target, A, 'lookup must be scoped to the precise certificate');
      return Buffer.from(JSON.stringify({ status: store.has(target) ? 'FOUND' : 'ABSENT', thumbprint: target, store: 'Root', location: 'CurrentUser', storeOpened: true, enumerationCompleted: true, certificateCount: store.size, matchCount: store.has(target) ? 1 : 0, error: null }));
    }
    assert.equal(program, 'certutil');
    assert.equal(args[0], '-user');
    if (args[1] === '-addstore') { store.add(A); if (failAdd) throw new Error('fake add failed after side effect'); return Buffer.from(''); }
    if (args[1] === '-delstore') { assert.equal(args[3], A); assert.notEqual(args[3], CA_CN); store.delete(A); return Buffer.from(''); }
    assert.fail('Unexpected fake certutil arguments');
  };
  return { manager: createCaManager({ dir, runner }), runner, store, calls, setFailAdd(value) { failAdd = value; } };
}

function fakeRegistry(backupPath, initial = {}) {
  const registry = structuredClone(initial), calls = [];
  let failWrite = null, failRead = false;
  const key = 'HKCU\\Software\\CrazyWaterTestOnly';
  const runner = (program, args) => {
    assert.equal(program, 'reg'); assert.equal(args[1], key);
    calls.push(args);
    if (args[0] === 'query') {
      if (failRead) throw new Error('fake registry read denied');
      return Buffer.from(key + '\r\n' + Object.entries(registry).map(([name, entry]) => '    ' + name + '    ' + entry.type + '    ' + entry.data).join('\r\n') + '\r\n');
    }
    assert.ok(fs.existsSync(backupPath), 'transaction backup must precede registry mutations');
    const name = args[args.indexOf('/v') + 1];
    if (args[0] === 'add') {
      let data = args[args.indexOf('/d') + 1];
      const type = args[args.indexOf('/t') + 1];
      if (type === 'REG_DWORD') data = '0x' + Number(data).toString(16);
      registry[name] = { type, data };
    } else if (args[0] === 'delete') delete registry[name];
    else assert.fail('Unexpected fake registry operation');
    if (name === failWrite) throw new Error('fake write failed after side effect');
    return Buffer.from('');
  };
  return { manager: createProxySettings({ key, backupPath, runner }), registry, calls, runner, key, setFailWrite(name) { failWrite = name; }, setFailRead(value) { failRead = value; } };
}

test('CA detection and ownership use exact SHA1; existing certificates remain untouched', (t) => {
  const dir = temporary(t), fake = fakeCa(dir, [A, B]);
  fake.manager.initCa();
  assert.equal(fake.manager.caFingerprint(), A);
  const receipt = fake.manager.installCa();
  assert.equal(receipt.owned, false);
  assert.equal(fake.manager.uninstallCa(receipt), true);
  assert.deepEqual([...fake.store].sort(), [A, B].sort());
  assert.ok(fake.calls.every((call) => !call.args.includes('-delstore')));
});

test('CA install/removal is idempotent and recovery receipt survives process restart', (t) => {
  const dir = temporary(t), fake = fakeCa(dir, [B]); fake.manager.initCa();
  const receipt = fake.manager.installCa();
  assert.equal(receipt.owned, true);
  assert.equal(fake.manager.installCa().owned, true);
  const restarted = createCaManager({ dir, runner: fake.runner });
  assert.equal(restarted.uninstallCa(receipt), false);
  assert.equal(restarted.uninstallCa(receipt), false);
  assert.deepEqual([...fake.store], [B]);
  assert.equal(fake.calls.filter((call) => call.args.includes('-delstore')).length, 1);
});

test('CA add failure after side effect exposes precise rollback ownership', (t) => {
  const dir = temporary(t), fake = fakeCa(dir); fake.manager.initCa(); fake.setFailAdd(true);
  let receipt;
  assert.throws(() => fake.manager.installCa(), (error) => { receipt = error.ownership; return receipt.owned && receipt.thumbprint === A; });
  assert.ok(fake.store.has(A));
  createCaManager({ dir, runner: fake.runner }).uninstallCa(receipt);
  assert.equal(fake.store.has(A), false);
});

test('leaf result explicitly distinguishes certificate/private-key bytes and paths', (t) => {
  const dir = temporary(t), fake = fakeCa(dir); fake.manager.initCa();
  const result = fake.manager.leafFor('game.example');
  assert.ok(Buffer.isBuffer(result.cert)); assert.ok(Buffer.isBuffer(result.keyPem));
  assert.equal(result.keyPath, result.key); assert.equal(result.certPath, path.join(dir, 'leaf-game.example.crt'));
  assert.equal(result.cached, false); assert.equal(fake.manager.leafFor('game.example').cached, true);
  assert.throws(() => fake.manager.leafFor('../outside'));
});

test('proxy snapshot restores exact value types, empty strings and missing values', (t) => {
  const dir = temporary(t), backupPath = path.join(dir, 'proxy.json');
  const seed = { ProxyEnable: { type: 'REG_DWORD', data: '0x0' }, ProxyServer: { type: 'REG_EXPAND_SZ', data: '%CUSTOM_PROXY%:99  ' }, ProxyOverride: { type: 'REG_SZ', data: '' } };
  const fake = fakeRegistry(backupPath, seed), before = fake.manager.readSnapshot();
  assert.equal(before.values.ProxyServer.type, 'REG_EXPAND_SZ'); assert.equal(before.values.ProxyServer.data, '%CUSTOM_PROXY%:99  ');
  assert.equal(before.values.ProxyOverride.data, '');
  fake.manager.setProxy('127.0.0.1', 17322, { snapshot: before });
  assert.equal(fake.manager.isProxyOn(), true); assert.ok(fs.existsSync(backupPath));
  fake.manager.restore(before); assert.deepEqual(fake.registry, seed); assert.equal(fs.existsSync(backupPath), false);
  assert.deepEqual(fake.manager.restore(before), fake.manager.readCurrent());
  assert.deepEqual(fake.manager.restore(), fake.manager.readCurrent());
  delete fake.registry.ProxyOverride;
  const missing = fake.manager.readSnapshot(); assert.equal(missing.values.ProxyOverride.exists, false);
  fake.manager.setProxy('127.0.0.1', 17322, { snapshot: missing }); fake.manager.restore();
  assert.equal(Object.hasOwn(fake.registry, 'ProxyOverride'), false);
});

test('proxy partial mutation keeps the first backup, refuses replacement and recovers after restart', (t) => {
  const dir = temporary(t), backupPath = path.join(dir, 'proxy.json');
  const seed = { ProxyEnable: { type: 'REG_DWORD', data: '0x0' } };
  const fake = fakeRegistry(backupPath, seed), before = fake.manager.readSnapshot(); fake.setFailWrite('ProxyServer');
  assert.throws(() => fake.manager.setProxy('127.0.0.1', 17322, { snapshot: before }));
  const saved = fs.readFileSync(backupPath, 'utf8'), writes = fake.calls.filter((args) => args[0] !== 'query').length;
  assert.throws(() => fake.manager.setProxy('127.0.0.1', 17323), { code: 'PROXY_BACKUP_EXISTS' });
  assert.equal(fs.readFileSync(backupPath, 'utf8'), saved);
  assert.equal(fake.calls.filter((args) => args[0] !== 'query').length, writes);
  fake.setFailWrite(null);
  createProxySettings({ key: fake.key, backupPath, runner: fake.runner }).restore();
  assert.deepEqual(fake.registry, seed); assert.equal(fs.existsSync(backupPath), false);
});

test('proxy restore failures preserve recovery data and stale snapshot cannot change settings', (t) => {
  const dir = temporary(t), backupPath = path.join(dir, 'proxy.json');
  const fake = fakeRegistry(backupPath, { ProxyEnable: { type: 'REG_DWORD', data: '0x0' } });
  const before = fake.manager.readSnapshot(); fake.registry.ProxyServer = { type: 'REG_SZ', data: 'external:1' };
  assert.throws(() => fake.manager.setProxy('127.0.0.1', 17322, { snapshot: before }), { code: 'PROXY_SNAPSHOT_CONFLICT' });
  assert.equal(fs.existsSync(backupPath), false);
  const current = fake.manager.readSnapshot(); fake.manager.setProxy('127.0.0.1', 17322, { snapshot: current });
  fake.setFailWrite('ProxyEnable'); assert.throws(() => fake.manager.restore()); assert.ok(fs.existsSync(backupPath));
  fake.setFailWrite(null); fake.manager.restore(); assert.equal(fake.registry.ProxyServer.data, 'external:1');
  fake.setFailRead(true); assert.throws(() => fake.manager.readSnapshot(), /denied/);
});

test('OpenSSL resolution honors explicit configuration and Windows Git fallback', () => {
  assert.equal(resolveOpenSsl({ env: { CW_OPENSSL: 'X:/custom/openssl.exe' }, platform: 'win32', exists: () => false }), 'X:/custom/openssl.exe');
  const fallback = path.join('C:/Program Files', 'Git/usr/bin/openssl.exe');
  assert.equal(resolveOpenSsl({ env: { ProgramFiles: 'C:/Program Files' }, platform: 'win32', exists: (candidate) => candidate === fallback }), fallback);
  assert.equal(resolveOpenSsl({ env: {}, platform: 'linux', exists: () => false }), 'openssl');
});

test('real OpenSSL validates CA key pairing and renews leaf cache after forced CA rotation without touching trust store', (t) => {
  const dir = temporary(t);
  const executable = resolveOpenSsl();
  let realOpenSslCalls = 0, interceptedStoreQueries = 0;
  const runner = (program, args, options) => {
    if (path.basename(program).toLowerCase() === 'powershell.exe') {
      const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
      assert.match(script, /StoreName\]::Root/); assert.match(script, /StoreLocation\]::CurrentUser/);
      const target = script.match(/\$target = '([A-F0-9]{40})'/)?.[1];
      assert.match(target, /^[A-F0-9]{40}$/);
      interceptedStoreQueries++;
      return Buffer.from(JSON.stringify({ status: 'ABSENT', thumbprint: target, store: 'Root', location: 'CurrentUser', storeOpened: true, enumerationCompleted: true, certificateCount: 0, matchCount: 0, error: null }));
    }
    assert.equal(program, executable, 'only the selected OpenSSL executable may run');
    realOpenSslCalls++;
    return execFileSync(program, args, options);
  };
  const manager = createCaManager({ dir, runner, opensslPath: executable });
  manager.initCa();
  const initialThumbprint = manager.caFingerprint();
  const initial = manager.leafFor('localhost');
  const initialCertificate = initial.cert.toString();
  assert.equal(manager.leafFor('localhost').cached, true);
  manager.initCa({ force: true });
  assert.notEqual(manager.caFingerprint(), initialThumbprint);
  const rotated = manager.leafFor('localhost');
  assert.equal(rotated.cached, false, 'old leaf certificate cannot survive a CA replacement');
  assert.notEqual(rotated.cert.toString(), initialCertificate);
  assert.equal(manager.leafFor('localhost').cached, true);
  const correctKey = fs.readFileSync(manager.CA_KEY);
  fs.copyFileSync(rotated.keyPath, manager.CA_KEY);
  assert.throws(() => manager.initCa(), /do not match/);
  assert.throws(() => manager.leafFor('localhost'), /do not match/);
  fs.writeFileSync(manager.CA_KEY, correctKey);
  fs.copyFileSync(manager.CA_KEY, rotated.keyPath);
  assert.equal(manager.leafFor('localhost').cached, false, 'mismatched leaf private key is renewed');
  assert.ok(realOpenSslCalls > 0);
  assert.equal(interceptedStoreQueries, 1, 'only force rotation inspects the simulated trust store');
});

test('failed backup writes never publish corrupt recovery data or mutate the registry and can retry', (t) => {
  for (const stage of ['write', 'sync']) {
    const dir = temporary(t), backupPath = path.join(dir, 'proxy-' + stage + '.json');
    const seed = { ProxyEnable: { type: 'REG_DWORD', data: '0x0' }, ProxyServer: { type: 'REG_SZ', data: 'original:90' } };
    const fake = fakeRegistry(backupPath, seed);
    let fail = true;
    const fileSystem = {
      ...fs,
      writeFileSync(fd, value, ...rest) {
        if (fail && stage === 'write') {
          fs.writeFileSync(fd, '{partial');
          const error = new Error('synthetic disk full during backup'); error.code = 'ENOSPC'; throw error;
        }
        return fs.writeFileSync(fd, value, ...rest);
      },
      fsyncSync(fd) {
        if (fail && stage === 'sync') { const error = new Error('synthetic backup flush failure'); error.code = 'EIO'; throw error; }
        return fs.fsyncSync(fd);
      },
    };
    const settings = createProxySettings({ key: fake.key, backupPath, runner: fake.runner, fileSystem });
    const original = settings.readSnapshot();
    assert.throws(() => settings.setProxy('127.0.0.1', 17322, { snapshot: original }), { code: stage === 'write' ? 'ENOSPC' : 'EIO' });
    assert.equal(fs.existsSync(backupPath), false, 'failed bytes must not become the recovery backup');
    assert.deepEqual(fs.readdirSync(dir), [], 'the failed operation removes only its own temporary file');
    assert.deepEqual(fake.registry, seed);
    assert.equal(fake.calls.filter((args) => args[0] !== 'query').length, 0);
    settings.restore(original);
    fail = false;
    settings.setProxy('127.0.0.1', 17322, { snapshot: original });
    assert.deepEqual(JSON.parse(fs.readFileSync(backupPath, 'utf8')), original);
    settings.restore();
    assert.deepEqual(fake.registry, seed);
    assert.equal(fs.existsSync(backupPath), false);
    assert.deepEqual(fs.readdirSync(dir), []);
  }
});

test('CA install binds the expected identity before any trust-store mutation', (t) => {
  const dir = temporary(t), fake = fakeCa(dir, [A, B]); fake.manager.initCa();
  const runner = (program, args, options) => {
    if (program === 'openssl' && args.includes('-fingerprint')) return Buffer.from('sha1 Fingerprint=' + B);
    return fake.runner(program, args, options);
  };
  const changed = createCaManager({ dir, runner });
  assert.throws(() => changed.installCa({ expectedThumbprint: A }), (error) => error.code === 'CA_IDENTITY_CHANGED' && error.ownership.owned === false);
  assert.deepEqual([...fake.store], [A, B]);
  assert.ok(fake.calls.every((call) => !call.args.includes('-addstore') && !call.args.includes('-delstore')));
  assert.equal(fs.readdirSync(dir).some((name) => name.startsWith('.install-')), false);
});

test('CA install uses a private certificate snapshot rather than a mutable CA path', (t) => {
  const dir = temporary(t), fake = fakeCa(dir); fake.manager.initCa();
  let installedPath;
  const runner = (program, args, options) => {
    if (program === 'certutil' && args.includes('-addstore')) {
      installedPath = args.at(-1); assert.notEqual(installedPath, fake.manager.CA_CRT);
      fs.writeFileSync(fake.manager.CA_CRT, 'REPLACED CERTIFICATE');
      assert.equal(fs.readFileSync(installedPath, 'utf8'), 'TEST CERTIFICATE');
    }
    return fake.runner(program, args, options);
  };
  const manager = createCaManager({ dir, runner });
  const receipt = manager.installCa({ expectedThumbprint: A });
  assert.equal(receipt.thumbprint, A); assert.equal(receipt.owned, true);
  assert.equal(fs.existsSync(installedPath), false);
  manager.uninstallCa(receipt); assert.equal(fake.store.size, 0);
});
