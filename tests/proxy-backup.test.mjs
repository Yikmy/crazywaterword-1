import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createProxySettings, BACKUP, LEGACY_BACKUP } from '../tools/proxy-settings.mjs';
import { createCaptureController } from '../src/capture.mjs';

const key = 'HKCU\\Software\\CrazyWaterSyntheticOnly';
const seed = () => ({ ProxyEnable: { type: 'REG_DWORD', data: '0x0' }, ProxyServer: { type: 'REG_EXPAND_SZ', data: '%SYNTHETIC_PROXY%:80  ' }, ProxyOverride: { type: 'REG_SZ', data: '' } });
function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-proxy-v1-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const backupPath = path.join(dir, 'proxy-backup.v1.json'), legacyBackupPath = path.join(dir, 'proxy-backup.json');
  const registry = structuredClone(options.seed ?? seed()), calls = [];
  let failWrite = null;
  const runner = (program, args) => {
    assert.equal(program, 'reg'); assert.equal(args[1], key); calls.push(args);
    if (args[0] === 'query') return Buffer.from(key + '\r\n' + Object.entries(registry).map(([name, value]) => '    ' + name + '    ' + value.type + '    ' + value.data).join('\r\n') + '\r\n');
    const name = args[args.indexOf('/v') + 1];
    if (args[0] === 'add') { const type = args[args.indexOf('/t') + 1]; let data = args[args.indexOf('/d') + 1]; if (type === 'REG_DWORD') data = '0x' + Number(data).toString(16); registry[name] = { type, data }; }
    else if (args[0] === 'delete') delete registry[name];
    else assert.fail('unexpected fake registry command');
    if (failWrite === name) throw Error('synthetic write failure');
    return Buffer.from('');
  };
  const settings = createProxySettings({ key, backupPath, legacyBackupPath, runner, ...(options.fileSystem ? { fileSystem: options.fileSystem } : {}) });
  return { dir, registry, runner, calls, backupPath, legacyBackupPath, settings, writeLegacy(value) { fs.writeFileSync(legacyBackupPath, typeof value === 'string' ? value : JSON.stringify(value)); return fs.readFileSync(legacyBackupPath, 'utf8'); }, fail(name) { failWrite = name; } };
}
const old = () => ({ key, values: { ProxyEnable: '0x1', ProxyServer: 'historical:80', ProxyOverride: '' }, savedAt: 'historical' });
const writes = f => f.calls.filter(args => args[0] !== 'query');

test('default new and historical backup paths are separate; no legacy migration is implicit', () => {
  if (!process.env.CW_PROXY_BACKUP) { assert.equal(path.basename(BACKUP), 'proxy-backup.v1.json'); assert.notEqual(BACKUP, LEGACY_BACKUP); }
});

test('legacy strings are classified as incomplete even when all three keys are present', t => {
  const f = fixture(t), bytes = f.writeLegacy(old());
  const state = f.settings.inspectBackups();
  assert.equal(state.current.format, 'ABSENT'); assert.equal(state.legacy.format, 'LEGACY_PARTIAL'); assert.equal(state.legacy.complete, false);
  assert.deepEqual(state.legacy.fields, ['ProxyEnable', 'ProxyServer', 'ProxyOverride']);
  assert.throws(() => f.settings.restore(), { code: 'PROXY_LEGACY_INCOMPLETE' });
  assert.equal(writes(f).length, 0); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});

test('partial legacy empty and omitted values are not converted into registry absence or types', t => {
  const f = fixture(t), partial = { key, values: { ProxyOverride: '' } }, bytes = f.writeLegacy(partial);
  assert.deepEqual(f.settings.inspectBackups().legacy.fields, ['ProxyOverride']);
  assert.throws(() => f.settings.restore(), { code: 'PROXY_LEGACY_INCOMPLETE' });
  assert.equal(writes(f).length, 0); assert.deepEqual(JSON.parse(fs.readFileSync(f.legacyBackupPath)), partial); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});

test('new complete snapshot coexists with historical partial file and restores exact current state', t => {
  const f = fixture(t), original = structuredClone(f.registry), bytes = f.writeLegacy(old());
  f.settings.setProxy('127.0.0.1', 17322);
  const snapshot = JSON.parse(fs.readFileSync(f.backupPath));
  assert.equal(snapshot.version, 1); assert.equal(snapshot.values.ProxyServer.type, 'REG_EXPAND_SZ'); assert.equal(snapshot.values.ProxyServer.data, '%SYNTHETIC_PROXY%:80  '); assert.equal(snapshot.values.ProxyOverride.data, '');
  f.settings.restore(); assert.deepEqual(f.registry, original); assert.equal(fs.existsSync(f.backupPath), false); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});

test('explicit complete journal snapshot restores independently of incomplete historical backup', t => {
  const f = fixture(t), before = f.settings.readSnapshot(), original = structuredClone(f.registry), bytes = f.writeLegacy(old());
  delete f.registry.ProxyOverride; f.registry.ProxyServer = { type: 'REG_SZ', data: 'capture:17322' };
  f.settings.restore(before); assert.deepEqual(f.registry, original); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});

test('complete V1 at old path remains readable for old journals and its original file is preserved', t => {
  const f = fixture(t), before = f.settings.readSnapshot(), bytes = f.writeLegacy(before), original = structuredClone(f.registry);
  f.registry.ProxyServer = { type: 'REG_SZ', data: 'capture:17322' };
  assert.equal(f.settings.inspectBackups().legacy.format, 'V1');
  assert.throws(() => f.settings.setProxy('127.0.0.1', 17322), { code: 'PROXY_BACKUP_EXISTS' }); assert.equal(writes(f).length, 0);
  f.settings.restore(); assert.deepEqual(f.registry, original); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
  f.settings.setProxy('127.0.0.1', 17322); f.settings.restore(); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});

test('unknown or corrupt historical backups fail closed before registry mutation', t => {
  for (const bad of ['{truncated', { key, values: { Unexpected: 'value' } }, { key: 'different-registry', values: {} }, { version: 99, key, values: {} }]) {
    const f = fixture(t), bytes = f.writeLegacy(bad);
    assert.equal(f.settings.inspectBackups().legacy.format, 'ERROR');
    assert.throws(() => f.settings.setProxy('127.0.0.1', 17322), { code: 'PROXY_BACKUP_INVALID' }); assert.throws(() => f.settings.restore(), { code: 'PROXY_BACKUP_INVALID' });
    assert.equal(writes(f).length, 0); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes); assert.equal(fs.existsSync(f.backupPath), false);
  }
});

test('failed atomic publication leaves historical bytes intact and registry untouched', t => {
  const f = fixture(t), bytes = f.writeLegacy(old());
  const fileSystem = { ...fs, linkSync() { throw Object.assign(Error('synthetic publication failure'), { code: 'EIO' }); } };
  const settings = createProxySettings({ key, backupPath: f.backupPath, legacyBackupPath: f.legacyBackupPath, runner: f.runner, fileSystem });
  assert.throws(() => settings.setProxy('127.0.0.1', 17322), { code: 'EIO' });
  assert.equal(writes(f).length, 0); assert.equal(fs.existsSync(f.backupPath), false); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes); assert.deepEqual(fs.readdirSync(f.dir), ['proxy-backup.json']);
});

test('new backup survives partial writes and restart; failed restoration can be retried', t => {
  const f = fixture(t), original = structuredClone(f.registry), bytes = f.writeLegacy(old());
  f.fail('ProxyServer'); assert.throws(() => f.settings.setProxy('127.0.0.1', 17322));
  const backup = fs.readFileSync(f.backupPath, 'utf8');
  const next = createProxySettings({ key, backupPath: f.backupPath, legacyBackupPath: f.legacyBackupPath, runner: f.runner });
  assert.throws(() => next.restore()); assert.equal(fs.readFileSync(f.backupPath, 'utf8'), backup);
  f.fail(null); next.restore(); assert.deepEqual(f.registry, original); assert.equal(fs.existsSync(f.backupPath), false); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});

test('capture preflight refuses unknown backups before touching any CA adapter', async t => {
  const f = fixture(t); f.writeLegacy('{bad'); let caCalls = 0;
  const lifecycle = new EventEmitter(); lifecycle.pid = 2147482000;
  const ca = { CA_DIR: f.dir, CA_CRT: 'synthetic', CA_CN: 'synthetic', initCa() { caCalls++; assert.fail('must not prepare CA'); } };
  const controller = createCaptureController({ ca, settings: f.settings, journalPath: path.join(f.dir, 'capture-session.json'), lifecycle, pidIsAlive: () => false });
  const result = await controller.startCapture(); assert.equal(result.running, false); assert.equal(caCalls, 0); assert.equal(writes(f).length, 0); assert.equal(result.proxyBackups.legacy.format, 'ERROR');
});

test('orphan new versioned backup is visible as pending recovery without pretending it was restored', async t => {
  const f = fixture(t), original = f.settings.readSnapshot(); fs.writeFileSync(f.backupPath, JSON.stringify(original));
  const lifecycle = new EventEmitter(); lifecycle.pid = 2147482000;
  const controller = createCaptureController({ ca: { CA_DIR: f.dir, CA_CRT: 'synthetic', CA_CN: 'synthetic' }, settings: f.settings, journalPath: path.join(f.dir, 'capture-session.json'), lifecycle, pidIsAlive: () => false });
  assert.equal(controller.captureState().recoveryPending, true);
  const state = await controller.recoverCapture(); assert.equal(state.recoveryPending, true); assert.equal(writes(f).length, 0); assert.equal(fs.existsSync(f.backupPath), true);
});


test('hard-killed capture recovers its independent V1 backup in a new process while preserving legacy bytes', { timeout: 20000 }, async t => {
  const f = fixture(t), oldBytes = f.writeLegacy(old());
  const systemFile = path.join(f.dir, 'synthetic-system.json'), script = path.join(f.dir, 'synthetic-child.mjs');
  const original = { registry: seed(), ca: false }; fs.writeFileSync(systemFile, JSON.stringify(original));
  const source = [
    "import fs from 'node:fs'; import path from 'node:path';",
    'import { createCaptureController } from ' + JSON.stringify(new URL('../src/capture.mjs', import.meta.url).href) + ';',
    'import { createProxySettings } from ' + JSON.stringify(new URL('../tools/proxy-settings.mjs', import.meta.url).href) + ';',
    "const [dir, mode] = process.argv.slice(2); const file = path.join(dir, 'synthetic-system.json');",
    "const read = () => JSON.parse(fs.readFileSync(file)); const write = x => fs.writeFileSync(file, JSON.stringify(x));",
    'const key = ' + JSON.stringify(key) + ';',
    "const runner = (program, args) => { if(program !== 'reg' || args[1] !== key) throw Error('unexpected process'); const state=read(); if(args[0] === 'query') return Buffer.from(key+'\\r\\n'+Object.entries(state.registry).map(([n,v])=>'    '+n+'    '+v.type+'    '+v.data).join('\\r\\n')+'\\r\\n'); const name=args[args.indexOf('/v')+1]; if(args[0] === 'delete') delete state.registry[name]; else {const type=args[args.indexOf('/t')+1]; let data=args[args.indexOf('/d')+1]; if(type === 'REG_DWORD') data='0x'+Number(data).toString(16); state.registry[name]={type,data};} write(state); return Buffer.from(''); };",
    "const settings=createProxySettings({key,backupPath:path.join(dir,'proxy-backup.v1.json'),legacyBackupPath:path.join(dir,'proxy-backup.json'),runner});",
    "const fp='A'.repeat(40); const ca={CA_DIR:dir,CA_CRT:'synthetic',CA_CN:'synthetic',initCa(){},caFingerprint:()=>fp,isInstalled:()=>read().ca,installCa(){const state=read();state.ca=true;write(state);return {owned:true,installed:true,thumbprint:fp};},uninstallCa(receipt){if(!receipt.owned||receipt.thumbprint!==fp)throw Error('bad receipt');const state=read();state.ca=false;write(state);}};",
    "const controller=createCaptureController({ca,settings,journalPath:path.join(dir,'capture-session.json'),proxyFactory:()=>({port:17399,async listen(){},async stop(){}})});",
    "if(mode === 'recover'){const result=await controller.recoverCapture();if(result.recoveryPending)throw Error('still pending');process.exit(0);}",
    "const state=await controller.startCapture();if(!state.running)throw Error(state.error);process.stdout.write('READY\\n');setInterval(()=>{},1000);",
  ].join('\n');
  fs.writeFileSync(script, source);
  const run = mode => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, f.dir, mode], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '', killed = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('synthetic process timed out')); }, 10000);
    child.stdout.on('data', chunk => { stdout += chunk; if(mode === 'start' && stdout.includes('READY') && !killed){killed=true;child.kill('SIGKILL');} });
    child.stderr.on('data', chunk => stderr += chunk);
    child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('exit', (code, signal) => { clearTimeout(timer); resolve({code, signal, stderr}); });
  });
  await run('start'); assert.equal(fs.existsSync(f.backupPath), true); assert.equal(fs.existsSync(path.join(f.dir, 'capture-session.json')), true); assert.equal(JSON.parse(fs.readFileSync(systemFile)).ca, true);
  assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), oldBytes);
  const recovered = await run('recover'); assert.equal(recovered.code, 0, recovered.stderr); assert.deepEqual(JSON.parse(fs.readFileSync(systemFile)), original);
  assert.equal(fs.existsSync(f.backupPath), false); assert.equal(fs.existsSync(path.join(f.dir, 'capture-session.json')), false); assert.equal(fs.existsSync(path.join(f.dir, 'capture-session.json.lock')), false); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), oldBytes);
});


for (const mode of ['conflicting-v1', 'corrupt-file', 'registry-query-error']) test('orphan historical backup prevents recovery CLI false success: ' + mode, async t => {
  const f = fixture(t), before = f.settings.readSnapshot();
  const bytes = f.writeLegacy(mode === 'corrupt-file' ? '{bad' : before);
  if (mode === 'conflicting-v1') f.registry.ProxyServer = { type: 'REG_SZ', data: 'still-capture-proxy:17322' };
  const settings = mode === 'registry-query-error' ? createProxySettings({ key, backupPath: f.backupPath, legacyBackupPath: f.legacyBackupPath, runner: () => { throw Error('synthetic query denied'); } }) : f.settings;
  const lifecycle = new EventEmitter(); lifecycle.pid = 2147482000;
  const controller = createCaptureController({ ca: { CA_DIR: f.dir, CA_CRT: 'synthetic', CA_CN: 'synthetic' }, settings, journalPath: path.join(f.dir, 'capture-session.json'), lifecycle, pidIsAlive: () => false });
  const initial = controller.captureState(); assert.equal(initial.recoveryPending, true); assert.equal(initial.proxyBackups.legacy.recoveryRequired, true);
  const { runRecoveryCli } = await import('../tools/capture-credentials.mjs'); const logs = [];
  const result = await runRecoveryCli({ controller, confirm: async () => true, write: line => logs.push(line) });
  assert.equal(result.status, 'recovery_required'); assert.doesNotMatch(logs.join('\n'), /当前没有待恢复事务/);
  assert.equal(writes(f).length, 0); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes); assert.equal(fs.existsSync(path.join(f.dir, 'capture-session.json')), false);
});

test('historical complete V1 matching current state is preserved without falsely blocking recovery', async t => {
  const f = fixture(t), bytes = f.writeLegacy(f.settings.readSnapshot());
  const lifecycle = new EventEmitter(); lifecycle.pid = 2147482000;
  const controller = createCaptureController({ ca: { CA_DIR: f.dir, CA_CRT: 'synthetic', CA_CN: 'synthetic' }, settings: f.settings, journalPath: path.join(f.dir, 'capture-session.json'), lifecycle, pidIsAlive: () => false });
  assert.equal(controller.captureState().proxyBackups.legacy.matchesCurrent, true); assert.equal(controller.captureState().recoveryPending, false);
  const state = await controller.recoverCapture(); assert.equal(state.recoveryPending, false); assert.equal(writes(f).length, 0); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
  f.settings.setProxy('127.0.0.1', 17322); f.settings.restore();
  assert.equal(controller.captureState().recoveryPending, false); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});


for (const mode of ['corrupt-historical', 'conflicting-historical-v1']) test('complete new snapshot restores independently of changed historical material: ' + mode, t => {
  const f = fixture(t), original = structuredClone(f.registry), before = f.settings.readSnapshot(); f.writeLegacy(old());
  f.settings.setProxy('127.0.0.1', 17322, { snapshot: before });
  const bytes = f.writeLegacy(mode === 'corrupt-historical' ? '{changed-invalid' : { ...before, values: { ...before.values, ProxyServer: { exists: true, type: 'REG_SZ', data: 'unrelated-history:80' } } });
  f.settings.restore(before); assert.deepEqual(f.registry, original); assert.equal(fs.existsSync(f.backupPath), false); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
  assert.equal(f.settings.inspectBackups().legacy.recoveryRequired, true);
  f.registry.ProxyServer = { type: 'REG_SZ', data: 'another-synthetic-proxy:17322' };
  f.settings.restore(before); assert.deepEqual(f.registry, original); assert.equal(fs.readFileSync(f.legacyBackupPath, 'utf8'), bytes);
});

test('explicit journal cannot hide corruption in its own new backup', t => {
  const f = fixture(t), before = f.settings.readSnapshot(), original = structuredClone(f.registry); f.writeLegacy(old());
  fs.writeFileSync(f.backupPath, '{own-backup-corrupted');
  assert.throws(() => f.settings.restore(before), { code: 'PROXY_BACKUP_INVALID' }); assert.deepEqual(f.registry, original); assert.equal(writes(f).length, 0); assert.equal(fs.readFileSync(f.backupPath, 'utf8'), '{own-backup-corrupted');
});
