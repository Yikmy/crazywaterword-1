import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DATA_DIR } from './accounts.mjs';

export const WRITER_OWNERSHIP_PATH = path.join(DATA_DIR, 'writer-owner.lock');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const failure = (code, message) => Object.assign(new Error(message), { code, statusCode: 409 });

// Machine identity is required for same-host crash recovery on a shared NAS.
// Hostnames, wall clocks and heartbeat expiry alone cannot authorize takeover.
export function localWriterIdentity() {
  let machine;
  if (process.platform === 'win32') {
    const output = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    machine = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)?.[1]?.trim();
  } else if (process.platform === 'linux') machine = fs.readFileSync('/etc/machine-id', 'utf8').trim();
  if (!machine || machine.length < 16) throw failure('WRITER_IDENTITY_UNAVAILABLE', 'Cannot prove local machine identity; game writer ownership is denied');
  return { host: os.hostname().toLowerCase(), hostFence: createHash('sha256').update(process.platform + '\n' + os.hostname().toLowerCase() + '\n' + machine.toLowerCase()).digest('hex') };
}

export function writerProcessState(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return 'UNKNOWN';
  try { process.kill(pid, 0); return 'ALIVE'; }
  catch (error) { return error.code === 'ESRCH' ? 'DEAD' : 'UNKNOWN'; }
}

// Call before loading credentials/connecting whenever a standalone CLI intends
// a game write. No CLI flag or environment opt-in overrides the single service.
export function rejectStandaloneGameWrite() {
  throw failure('CLI_WRITE_DISABLED', 'Standalone CLI game writes are disabled; use the unique Console service controlled business API');
}

// The exclusion primitive follows capture's exclusive directory pattern, but
// never auto-deletes an empty, invalid, remote or apparently dead owner.
// Injected adapters are trusted local test dependencies, never HTTP/config data.
export function createWriterOwnership({ lockPath = WRITER_OWNERSHIP_PATH, fileSystem = fs, identity = localWriterIdentity, processState = writerProcessState, pid = process.pid, clock = Date.now } = {}) {
  if (typeof lockPath !== 'string' || !path.isAbsolute(lockPath) || !Number.isSafeInteger(pid) || pid < 1) throw failure('WRITER_INVALID_INPUT', 'Invalid writer owner path or process identity');
  let held = null, lost = false, machineIdentity = null;
  const now = () => new Date(clock()).toISOString();
  const unavailable = () => failure('WRITER_UNAVAILABLE', 'Writer storage is unavailable or invalid; game writes denied and original lock retained');
  const hostIdentity = () => {
    if (machineIdentity) return machineIdentity;
    let result;
    try { result = identity(); } catch { throw failure('WRITER_IDENTITY_UNAVAILABLE', 'Cannot prove local machine identity; writer ownership denied'); }
    if (!result || typeof result.host !== 'string' || !result.host || result.host.length > 253 || !/^[a-f0-9]{64}$/.test(result.hostFence ?? '')) throw failure('WRITER_IDENTITY_UNAVAILABLE', 'Invalid local machine identity; takeover denied');
    machineIdentity = { host: result.host, hostFence: result.hostFence };
    return machineIdentity;
  };
  function readOwner() {
    try {
      const directory = fileSystem.lstatSync(lockPath);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw unavailable();
      const entries = fileSystem.readdirSync(lockPath);
      if (entries.length !== 1 || !/^owner-[a-f0-9-]+\.json$/.test(entries[0])) throw unavailable();
      const file = path.join(lockPath, entries[0]), stat = fileSystem.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw unavailable();
      const raw = fileSystem.readFileSync(file, 'utf8'), owner = JSON.parse(raw);
      const keys = ['version', 'ownerId', 'pid', 'host', 'hostFence', 'createdAt', 'role'];
      if (!owner || Object.keys(owner).length !== keys.length || Object.keys(owner).some(key => !keys.includes(key)) || owner.version !== 1 || !uuid.test(owner.ownerId ?? '') || entries[0] !== 'owner-' + owner.ownerId + '.json' || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.host !== 'string' || !owner.host || owner.host.length > 253 || !/^[a-f0-9]{64}$/.test(owner.hostFence ?? '') || !Number.isFinite(Date.parse(owner.createdAt)) || owner.role !== 'console') throw unavailable();
      return { owner, file, raw };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // A missing owner file in an existing directory is not a free lock.
        try { fileSystem.lstatSync(lockPath); } catch (missing) { if (missing.code === 'ENOENT') return null; }
      }
      throw unavailable();
    }
  }
  function durableWrite(file, value) {
    let fd;
    try {
      fd = fileSystem.openSync(file, 'wx', 0o600);
      fileSystem.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n', 'utf8');
      fileSystem.fsyncSync(fd);
    } finally { if (fd !== undefined) fileSystem.closeSync(fd); }
  }
  function inspect() {
    const saved = readOwner();
    return saved ? { state: held && !lost && saved.raw === held.raw ? 'OWNED' : 'BLOCKED', owner: structuredClone(saved.owner) } : { state: 'FREE', owner: null };
  }
  function assertOwned() {
    if (!held || lost) throw failure('WRITER_NOT_OWNED', 'Current service does not own the game writer');
    try {
      const saved = readOwner(), local = hostIdentity();
      if (!saved || saved.raw !== held.raw || saved.owner.pid !== pid || saved.owner.hostFence !== local.hostFence || saved.owner.host !== local.host) throw unavailable();
      return structuredClone(saved.owner);
    } catch { held = null; lost = true; throw failure('WRITER_OWNERSHIP_LOST', 'Cannot verify writer ownership; stop dispatch and retain unresolved evidence; no automatic reacquisition'); }
  }
  function claim() {
    if (lost) throw failure('WRITER_OWNERSHIP_LOST', 'Writer reliability was lost; this service cannot automatically reacquire');
    if (held) return assertOwned();
    const local = hostIdentity();
    const owner = { version: 1, ownerId: randomUUID(), pid, host: local.host, hostFence: local.hostFence, createdAt: now(), role: 'console' };
    try {
      fileSystem.mkdirSync(path.dirname(lockPath), { recursive: true });
      try { fileSystem.mkdirSync(lockPath); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (!readOwner()) throw unavailable();
        throw failure('WRITER_RECOVERY_REQUIRED', 'A game writer owner already exists; second service/standalone CLI writes denied; residual owner requires explicit evidence review');
      }
      durableWrite(path.join(lockPath, 'owner-' + owner.ownerId + '.json'), owner);
      const saved = readOwner();
      if (!saved || JSON.stringify(saved.owner) !== JSON.stringify(owner)) throw unavailable();
      held = saved;
      return assertOwned();
    } catch (error) {
      if (error.code === 'WRITER_RECOVERY_REQUIRED') throw error;
      held = null; lost = true;
      // Uncertain write/fsync/read leaves the lock as evidence, never cleans it.
      throw unavailable();
    }
  }
  function release() {
    if (!held) return false;
    assertOwned();
    const saved = held; held = null;
    try { fileSystem.unlinkSync(saved.file); fileSystem.rmdirSync(lockPath); return true; }
    catch { lost = true; throw unavailable(); }
  }
  function recoverAbandoned({ expectedOwnerId } = {}) {
    if (held || !uuid.test(expectedOwnerId ?? '')) throw failure('WRITER_INVALID_INPUT', 'Recovery requires exact old owner confirmation and no held live ownership');
    const original = readOwner(), local = hostIdentity();
    if (!original || original.owner.ownerId !== expectedOwnerId) throw failure('WRITER_OWNER_CHANGED', 'Original writer owner changed; cleanup denied');
    if (original.owner.host !== local.host || original.owner.hostFence !== local.hostFence) throw failure('WRITER_REMOTE_OWNER', 'Cannot prove the remote/other machine writer stopped; retain original lock');
    const proveDead = () => {
      let result;
      try { result = processState(original.owner.pid); } catch { result = 'UNKNOWN'; }
      if (result !== 'DEAD') throw failure('WRITER_PROCESS_UNCERTAIN', 'Original writer process is alive or uncertain; takeover denied');
    };
    proveDead();
    const recordPath = lockPath + '.recovery-' + randomUUID() + '.json';
    try {
      durableWrite(recordPath, { version: 1, kind: 'DEAD_OWNER_RECOVERY_INTENT', owner: original.owner, checkedAt: now(), checkedBy: { pid, host: local.host, hostFence: local.hostFence }, processState: 'DEAD' });
      const current = readOwner();
      if (!current || current.raw !== original.raw) throw failure('WRITER_OWNER_CHANGED', 'Writer owner changed during review; original lock retained');
      proveDead();
      // Never recursively clear a lock. Unique old filename fences replacement
      // owners even if two explicit recoveries race. The archive is an intent,
      // not a claim that game UNKNOWN/history was resolved or budget released.
      fileSystem.unlinkSync(original.file); fileSystem.rmdirSync(lockPath);
      return { recovered: true, ownerId: expectedOwnerId, recordPath };
    } catch (error) {
      if (['WRITER_OWNER_CHANGED', 'WRITER_PROCESS_UNCERTAIN'].includes(error.code)) throw error;
      throw unavailable();
    }
  }
  return { claim, assertOwned, inspect, release, recoverAbandoned };
}
