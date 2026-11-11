import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWriterOwnership, rejectStandaloneGameWrite, writerProcessState, localWriterIdentity } from '../src/writer-ownership.mjs';

const local = { host: 'synthetic-host', hostFence: 'a'.repeat(64) };
const identity = () => ({ ...local });
const code = expected => error => error.code === expected;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-writer-owner-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const lockPath = path.join(dir, 'writer-owner.lock');
  return { dir, lockPath, make: options => createWriterOwnership({ lockPath, identity, ...options }), file: owner => path.join(lockPath, 'owner-' + owner.ownerId + '.json') };
}
function diskSnapshot(dir) { return fs.readdirSync(dir).sort().map(name => [name, fs.statSync(path.join(dir, name)).isFile() ? fs.readFileSync(path.join(dir, name), 'utf8') : fs.readdirSync(path.join(dir, name)).sort().map(file => [file, fs.readFileSync(path.join(dir, name, file), 'utf8')])]); }
function adapter(overrides) { return new Proxy(fs, { get: (target, key) => Object.hasOwn(overrides, key) ? overrides[key] : target[key] }); }

test('read-only inspection has no store/credential effects; standalone writes have no override', t => {
  const f = fixture(t), owner = f.make();
  assert.deepEqual(owner.inspect(), { state: 'FREE', owner: null });
  assert.deepEqual(fs.readdirSync(f.dir), []);
  assert.throws(() => owner.assertOwned(), code('WRITER_NOT_OWNED'));
  assert.throws(() => rejectStandaloneGameWrite({ allowMutate: true, force: true }), code('CLI_WRITE_DISABLED'));
});

test('one owner excludes another instance, guards exact metadata and releases only its own directory', t => {
  const f = fixture(t), first = f.make(), second = f.make();
  const saved = first.claim(); saved.pid = -1;
  assert.equal(first.assertOwned().pid, process.pid);
  assert.equal(first.inspect().state, 'OWNED');
  assert.throws(() => second.claim(), code('WRITER_RECOVERY_REQUIRED'));
  assert.equal(second.inspect().state, 'BLOCKED');
  assert.equal(second.release(), false);
  assert.equal(first.release(), true);
  assert.equal(first.release(), false);
  const next = second.claim(); assert.notEqual(next.ownerId, saved.ownerId);
  assert.equal(second.release(), true);
});

test('host identity is resolved once, not a blocking subprocess on every dispatch guard', t => {
  const f = fixture(t); let calls = 0;
  const owner = f.make({ identity: () => { calls++; return identity(); } });
  owner.claim(); owner.assertOwned(); owner.assertOwned(); owner.release();
  assert.equal(calls, 1);
});

test('missing or untrusted machine identity denies creation and never touches a prior lock', t => {
  const f = fixture(t);
  for (const identity of [() => null, () => ({ host: 'host' }), () => { throw Error('machine identity unavailable'); }]) {
    assert.throws(() => f.make({ identity }).claim(), code('WRITER_IDENTITY_UNAVAILABLE'));
  }
  assert.deepEqual(fs.readdirSync(f.dir), []);
});

test('owner file mutation fences the old writer and cannot delete the replacement evidence', t => {
  const f = fixture(t), owner = f.make(), saved = owner.claim();
  const replacement = { ...saved, createdAt: '2020-01-01T00:00:00.000Z' };
  fs.writeFileSync(f.file(saved), JSON.stringify(replacement));
  assert.throws(() => owner.assertOwned(), code('WRITER_OWNERSHIP_LOST'));
  assert.throws(() => owner.claim(), code('WRITER_OWNERSHIP_LOST'));
  assert.equal(owner.release(), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file(saved))), replacement);
});

test('NAS read failure permanently fences that service even if storage becomes readable again', t => {
  const f = fixture(t); let unavailable = false;
  const owner = f.make({ fileSystem: adapter({ readFileSync(...args) { if (unavailable) throw Object.assign(Error('synthetic NAS disconnected'), { code: 'EIO' }); return fs.readFileSync(...args); } }) });
  const saved = owner.claim(); unavailable = true;
  assert.throws(() => owner.assertOwned(), code('WRITER_OWNERSHIP_LOST'));
  unavailable = false;
  assert.throws(() => owner.assertOwned(), code('WRITER_NOT_OWNED'));
  assert.throws(() => owner.claim(), code('WRITER_OWNERSHIP_LOST'));
  assert.equal(fs.existsSync(f.file(saved)), true);
});

test('NAS mkdir/write/fsync failures deny ownership and never auto-remove uncertain directories', t => {
  for (const method of ['mkdirSync', 'writeFileSync', 'fsyncSync']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-writer-io-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const lockPath = path.join(dir, 'owner.lock');
    const owner = createWriterOwnership({ lockPath, identity, fileSystem: adapter({ [method]() { throw Object.assign(Error('synthetic NAS failure'), { code: 'EIO' }); } }) });
    assert.throws(() => owner.claim(), code('WRITER_UNAVAILABLE'));
    assert.throws(() => owner.claim(), code('WRITER_OWNERSHIP_LOST'));
    if (method !== 'mkdirSync') {
      assert.equal(fs.existsSync(lockPath), true);
      assert.throws(() => createWriterOwnership({ lockPath, identity }).claim());
    }
  }
});

test('empty, corrupt, multiple-owner and unknown-version locks stay blocked and byte-preserved', t => {
  for (const kind of ['empty', 'corrupt', 'extra', 'version']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-writer-invalid-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const lockPath = path.join(dir, 'owner.lock'), owner = createWriterOwnership({ lockPath, identity });
    if (kind === 'empty') fs.mkdirSync(lockPath);
    else {
      const record = owner.claim(), file = path.join(lockPath, 'owner-' + record.ownerId + '.json');
      if (kind === 'corrupt') fs.writeFileSync(file, '{broken');
      if (kind === 'extra') fs.writeFileSync(path.join(lockPath, 'unexpected.json'), '{}');
      if (kind === 'version') fs.writeFileSync(file, JSON.stringify({ ...record, version: 2 }));
    }
    const before = diskSnapshot(dir), contender = createWriterOwnership({ lockPath, identity });
    assert.throws(() => contender.claim(), code('WRITER_UNAVAILABLE'));
    assert.throws(() => contender.inspect(), code('WRITER_UNAVAILABLE'));
    assert.deepEqual(diskSnapshot(dir), before);
  }
});

test('a symlink/reparse-shaped lock is refused instead of followed', t => {
  const f = fixture(t), owner = f.make(); owner.claim();
  const guard = f.make({ fileSystem: adapter({ lstatSync(file) { if (file === f.lockPath) return { isDirectory: () => true, isSymbolicLink: () => true }; return fs.lstatSync(file); } }) });
  assert.throws(() => guard.inspect(), code('WRITER_UNAVAILABLE'));
});

test('release storage failure leaves owner evidence and permanently disables the old writer', t => {
  const f = fixture(t); let fail = false;
  const owner = f.make({ fileSystem: adapter({ unlinkSync(file) { if (fail) throw Object.assign(Error('synthetic NAS write denied'), { code: 'EACCES' }); return fs.unlinkSync(file); } }) });
  const saved = owner.claim(); fail = true;
  assert.throws(() => owner.release(), code('WRITER_UNAVAILABLE'));
  assert.equal(fs.existsSync(f.file(saved)), true);
  assert.throws(() => owner.claim(), code('WRITER_OWNERSHIP_LOST'));
});

test('apparently ancient/dead locks never expire or recover automatically', t => {
  const f = fixture(t), old = f.make({ pid: 2147483000, clock: () => 0 }).claim();
  const contender = f.make({ processState: () => 'DEAD', clock: () => 9999999999999 });
  const before = diskSnapshot(f.dir);
  assert.throws(() => contender.claim(), code('WRITER_RECOVERY_REQUIRED'));
  assert.equal(contender.inspect().owner.ownerId, old.ownerId);
  assert.deepEqual(diskSnapshot(f.dir), before);
});

test('explicit recovery needs exact owner, same machine fence and two definitive dead-process checks', t => {
  const f = fixture(t), saved = f.make({ pid: 2147483000 }).claim();
  for (const otherIdentity of [() => ({ ...local, host: 'other-host' }), () => ({ ...local, hostFence: 'b'.repeat(64) })]) {
    const contender = f.make({ identity: otherIdentity, processState: () => 'DEAD' });
    assert.throws(() => contender.recoverAbandoned({ expectedOwnerId: saved.ownerId }), code('WRITER_REMOTE_OWNER'));
  }
  for (const state of ['ALIVE', 'UNKNOWN', false, undefined]) assert.throws(() => f.make({ processState: () => state }).recoverAbandoned({ expectedOwnerId: saved.ownerId }), code('WRITER_PROCESS_UNCERTAIN'));
  assert.throws(() => f.make().recoverAbandoned({ expectedOwnerId: '00000000-0000-0000-0000-000000000000' }), code('WRITER_OWNER_CHANGED'));
  assert.throws(() => f.make().recoverAbandoned(), code('WRITER_INVALID_INPUT'));
  assert.equal(fs.existsSync(f.file(saved)), true);
});

test('confirmed dead same-host recovery archives intent and leaves execution history/UNKNOWN untouched', t => {
  const f = fixture(t), saved = f.make({ pid: 2147483000 }).claim();
  const history = path.join(f.dir, 'synthetic-history.json'), evidence = '{"result":"UNKNOWN","budget":80}'; fs.writeFileSync(history, evidence);
  let checks = 0; const contender = f.make({ processState: () => { checks++; return 'DEAD'; } });
  const result = contender.recoverAbandoned({ expectedOwnerId: saved.ownerId });
  assert.equal(checks, 2); assert.equal(result.recovered, true);
  const archive = JSON.parse(fs.readFileSync(result.recordPath, 'utf8'));
  assert.equal(archive.kind, 'DEAD_OWNER_RECOVERY_INTENT'); assert.equal(archive.owner.ownerId, saved.ownerId); assert.equal(archive.processState, 'DEAD');
  assert.deepEqual(contender.inspect(), { state: 'FREE', owner: null });
  assert.equal(fs.readFileSync(history, 'utf8'), evidence);
  assert.throws(() => contender.assertOwned(), code('WRITER_NOT_OWNED'));
  const next = contender.claim(); assert.notEqual(next.ownerId, saved.ownerId); contender.release();
});

test('recovery audit write failure keeps exact original owner and never clears lock', t => {
  const f = fixture(t), saved = f.make({ pid: 2147483000 }).claim(), before = fs.readFileSync(f.file(saved), 'utf8');
  const contender = f.make({ processState: () => 'DEAD', fileSystem: adapter({ fsyncSync() { throw Error('synthetic NAS fsync failure'); } }) });
  assert.throws(() => contender.recoverAbandoned({ expectedOwnerId: saved.ownerId }), code('WRITER_UNAVAILABLE'));
  assert.equal(fs.readFileSync(f.file(saved), 'utf8'), before);
});

test('PID becoming alive during recovery and owner replacement both preserve the lock', t => {
  const f = fixture(t), saved = f.make({ pid: 2147483000 }).claim(); let checks = 0;
  assert.throws(() => f.make({ processState: () => ++checks === 1 ? 'DEAD' : 'ALIVE' }).recoverAbandoned({ expectedOwnerId: saved.ownerId }), code('WRITER_PROCESS_UNCERTAIN'));
  assert.equal(fs.existsSync(f.file(saved)), true);
  checks = 0;
  const contender = f.make({ processState: () => { if (++checks === 1) fs.writeFileSync(f.file(saved), JSON.stringify({ ...saved, pid: process.pid })); return 'DEAD'; } });
  assert.throws(() => contender.recoverAbandoned({ expectedOwnerId: saved.ownerId }), code('WRITER_OWNER_CHANGED'));
  assert.equal(JSON.parse(fs.readFileSync(f.file(saved))).pid, process.pid);
});

const moduleUrl = new URL('../src/writer-ownership.mjs', import.meta.url).href;
function child(t, f) {
  const source = [
    `import { createWriterOwnership } from ${JSON.stringify(moduleUrl)};`,
    `const owner = createWriterOwnership({ lockPath: process.argv[2], identity: () => (${JSON.stringify(local)}) });`,
    "try { const record = owner.claim(); process.send({ state: 'CLAIMED', owner: record }); } catch (error) { process.send({ state: 'BLOCKED', code: error.code }); process.exitCode = 23; process.disconnect(); }",
    "if (!process.exitCode) { const timer = setInterval(() => {}, 1000); process.on('message', message => { if (message === 'release') { try { owner.release(); } finally { clearInterval(timer); process.disconnect(); } } }); }",
  ].join('\n');
  const file = path.join(f.dir, 'child-' + Math.random().toString(16).slice(2) + '.mjs'); fs.writeFileSync(file, source);
  const processChild = spawn(process.execPath, [file, f.lockPath], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = ''; processChild.stderr.on('data', data => stderr += data);
  const exited = new Promise((resolve, reject) => { processChild.once('error', reject); processChild.once('exit', (code, signal) => resolve({ code, signal, stderr })); });
  const message = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { processChild.kill(); reject(Error('isolated writer process timed out: ' + stderr)); }, 10000);
    processChild.once('message', value => { clearTimeout(timer); resolve(value); });
    exited.then(value => { clearTimeout(timer); if (value.code !== 23 && value.code !== 0 && value.signal !== 'SIGKILL') reject(Error('child exited before owner message: ' + stderr)); }, reject);
  });
  t.after(async () => { if (processChild.exitCode === null && processChild.signalCode === null) processChild.kill(); await exited; });
  return { process: processChild, message, exited };
}

test('two real concurrent processes get at most one writer, without a second GameClient/runtime', { timeout: 20000 }, async t => {
  const f = fixture(t), a = child(t, f), b = child(t, f);
  const records = await Promise.all([a.message, b.message]);
  assert.equal(records.filter(row => row.state === 'CLAIMED').length, 1);
  assert.equal(records.filter(row => row.state === 'BLOCKED').length, 1);
  const winner = records[0].state === 'CLAIMED' ? a : b, loser = winner === a ? b : a;
  assert.equal((await loser.exited).code, 23);
  assert.throws(() => f.make({ processState: writerProcessState }).recoverAbandoned({ expectedOwnerId: records.find(row => row.state === 'CLAIMED').owner.ownerId }), code('WRITER_PROCESS_UNCERTAIN'));
  winner.process.send('release'); assert.equal((await winner.exited).code, 0);
  assert.equal(f.make().inspect().state, 'FREE');
});

test('hard-killed writer stays blocked until explicit same-host dead PID recovery; archive survives', { timeout: 20000 }, async t => {
  const f = fixture(t), first = child(t, f), record = await first.message;
  assert.equal(record.state, 'CLAIMED'); first.process.kill('SIGKILL'); await first.exited;
  const next = f.make({ processState: writerProcessState });
  assert.throws(() => next.claim(), code('WRITER_RECOVERY_REQUIRED'));
  assert.equal(writerProcessState(record.owner.pid), 'DEAD');
  const result = next.recoverAbandoned({ expectedOwnerId: record.owner.ownerId });
  assert.equal(fs.existsSync(result.recordPath), true);
  next.claim(); next.release();
});

test('real local machine identity is a stable hash and process probe never treats invalid PID as dead', () => {
  const a = localWriterIdentity(), b = localWriterIdentity(); assert.deepEqual(a, b); assert.match(a.hostFence, /^[a-f0-9]{64}$/);
  assert.equal(writerProcessState(process.pid), 'ALIVE');
  for (const pid of [0, -1, NaN, '123']) assert.equal(writerProcessState(pid), 'UNKNOWN');
});

test('release interrupted after owner unlink leaves an uncertain empty directory that no contender clears', t => {
  const f = fixture(t); let fail = false;
  const owner = f.make({ fileSystem: adapter({ rmdirSync(file) { if (fail && file === f.lockPath) throw Object.assign(Error('synthetic NAS interrupted removal'), { code: 'EIO' }); return fs.rmdirSync(file); } }) });
  owner.claim(); fail = true;
  assert.throws(() => owner.release(), code('WRITER_UNAVAILABLE'));
  assert.deepEqual(fs.readdirSync(f.lockPath), []);
  const contender = f.make({ processState: () => 'DEAD' });
  assert.throws(() => contender.claim(), code('WRITER_UNAVAILABLE'));
  assert.deepEqual(fs.readdirSync(f.lockPath), []);
});

test('recovery never recursively removes extra concurrent evidence and cannot clear a replacement owner', t => {
  const f = fixture(t), saved = f.make({ pid: 2147483000 }).claim(); let checks = 0;
  const evidence = JSON.stringify({ preserve: true });
  const contender = f.make({ processState: () => {
    if (++checks === 2) fs.writeFileSync(path.join(f.lockPath, 'concurrent-evidence.json'), evidence);
    return 'DEAD';
  } });
  assert.throws(() => contender.recoverAbandoned({ expectedOwnerId: saved.ownerId }), code('WRITER_UNAVAILABLE'));
  assert.equal(fs.readFileSync(path.join(f.lockPath, 'concurrent-evidence.json'), 'utf8'), evidence);
  assert.throws(() => f.make().claim(), code('WRITER_UNAVAILABLE'));
});
