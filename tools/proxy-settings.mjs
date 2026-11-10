import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const KEY = process.env.CW_REG_KEY ?? 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
// Old backups discarded registry types and trimmed strings; retain them as evidence.
export const LEGACY_BACKUP = path.join(os.homedir(), '.cw-ca', 'proxy-backup.json');
const VERSIONED_BACKUP = path.join(os.homedir(), '.cw-ca', 'proxy-backup.v1.json');
export const BACKUP = process.env.CW_PROXY_BACKUP ?? VERSIONED_BACKUP;
const VALUES = ['ProxyEnable', 'ProxyServer', 'ProxyOverride'];
const equalValues = (left, right) => VALUES.every((name) => {
  const a = left.values[name], b = right.values[name];
  return a.exists === b.exists && (!a.exists || (a.type === b.type && a.data === b.data));
});

export function createProxySettings({ key = KEY, backupPath = BACKUP, legacyBackupPath = backupPath === VERSIONED_BACKUP ? LEGACY_BACKUP : null, runner = execFileSync, fileSystem = fs } = {}) {
  const reg = (args) => runner('reg', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  function readSnapshot() {
    // Query the complete key once; query failures must never be mistaken for absent values.
    const output = reg(['query', key]);
    const values = Object.fromEntries(VALUES.map((name) => [name, { exists: false, type: null, data: null }]));
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^\s*(ProxyEnable|ProxyServer|ProxyOverride)[ \t]+(REG_\w+)(?: {4}|\t)(.*)$/i);
      if (!match) { if (/^\s*(ProxyEnable|ProxyServer|ProxyOverride)\s/i.test(line)) throw new Error('Unable to parse an original proxy registry value'); continue; }
      const name = VALUES.find((candidate) => candidate.toLowerCase() === match[1].toLowerCase());
      values[name] = { exists: true, type: match[2].toUpperCase(), data: match[3] };
    }
    return { version: 1, key, values, savedAt: new Date().toISOString() };
  }
  function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || snapshot.key !== key || !snapshot.values) throw new Error('Proxy snapshot does not match this registry key');
    for (const name of VALUES) {
      const value = snapshot.values[name];
      if (!value || typeof value.exists !== 'boolean' || (value.exists && (!/^REG_\w+$/.test(value.type) || typeof value.data !== 'string'))) throw new Error('Invalid proxy registry snapshot');
    }
    return snapshot;
  }
  function inspectRecord(file) {
    if (!file || !fileSystem.existsSync(file)) return { path: file, format: 'ABSENT', complete: false };
    try {
      const raw = JSON.parse(fileSystem.readFileSync(file, 'utf8'));
      if (raw?.version === 1) return { path: file, format: 'V1', complete: true, snapshot: validateSnapshot(raw) };
      // Both historical implementations recorded only matched, trimmed strings.
      // A missing field could mean absent, unparsable or a failed registry query.
      if (raw && !Object.hasOwn(raw, 'version') && raw.key === key && raw.values &&
          typeof raw.values === 'object' && !Array.isArray(raw.values) &&
          Object.keys(raw.values).every((name) => VALUES.includes(name) && typeof raw.values[name] === 'string')) {
        return { path: file, format: 'LEGACY_PARTIAL', complete: false,
          fields: Object.keys(raw.values), savedAt: raw.savedAt ?? null };
      }
      throw new Error('Unrecognized proxy backup format');
    } catch (error) { return { path: file, format: 'ERROR', complete: false, error: error.message }; }
  }
  function inspectBackups() {
    const publicRecord = ({ snapshot, ...record }) => record;
    const current = inspectRecord(backupPath), historical = inspectRecord(legacyBackupPath);
    const legacy = publicRecord(historical);
    legacy.recoveryRequired = historical.format === 'ERROR';
    if (historical.format === 'V1') {
      try {
        legacy.matchesCurrent = equalValues(historical.snapshot, readSnapshot());
        legacy.recoveryRequired = !legacy.matchesCurrent;
      } catch (error) {
        legacy.matchesCurrent = null;
        legacy.recoveryRequired = true;
        legacy.error = error.message;
      }
    }
    return { current: publicRecord(current), legacy };
  }
  function backupProblem(message, code = 'PROXY_BACKUP_INVALID') {
    return Object.assign(new Error(message), { code });
  }
  function checkLegacy(original) {
    const historical = inspectRecord(legacyBackupPath);
    if (historical.format === 'ERROR') throw backupProblem(historical.error);
    if (historical.format === 'V1' && !equalValues(historical.snapshot, original)) {
      throw backupProblem('Historical versioned proxy backup differs from current settings; recover its transaction first', 'PROXY_BACKUP_EXISTS');
    }
    return historical;
  }
  function assertBackupReady(snapshot = readSnapshot()) {
    validateSnapshot(snapshot);
    const current = inspectRecord(backupPath);
    if (current.format !== 'ABSENT') throw backupProblem('An unrestored proxy backup already exists', 'PROXY_BACKUP_EXISTS');
    checkLegacy(snapshot);
    return inspectBackups();
  }
  function readCurrent() {
    const { values } = readSnapshot();
    return Object.fromEntries(VALUES.filter((name) => values[name].exists).map((name) => [name, values[name].data]));
  }
  function backup(snapshot = readSnapshot()) {
    assertBackupReady(snapshot);
    fileSystem.mkdirSync(path.dirname(backupPath), { recursive: true });
    const temporary = backupPath + '.pending-' + crypto.randomUUID();
    let created = false;
    try {
      const fd = fileSystem.openSync(temporary, 'wx', 0o600);
      created = true;
      try { fileSystem.writeFileSync(fd, JSON.stringify(snapshot, null, 2) + '\n'); fileSystem.fsyncSync(fd); } finally { fileSystem.closeSync(fd); }
      // A hard link publishes the complete durable file atomically and refuses to
      // replace an existing recovery backup. A failed write never owns backupPath.
      fileSystem.linkSync(temporary, backupPath);
    } catch (error) {
      if (error.code === 'EEXIST') { const conflict = new Error('An unrestored proxy backup already exists'); conflict.code = 'PROXY_BACKUP_EXISTS'; throw conflict; }
      throw error;
    } finally {
      if (created) fileSystem.unlinkSync(temporary);
    }
    return snapshot;
  }
  function setProxy(host, port, { snapshot = null } = {}) {
    if (typeof host !== 'string' || !/^[a-zA-Z0-9.:-]+$/.test(host) || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid proxy endpoint');
    const current = readSnapshot();
    const original = snapshot ? validateSnapshot(snapshot) : current;
    if (!equalValues(original, current)) { const conflict = new Error('Proxy settings changed since the snapshot was taken'); conflict.code = 'PROXY_SNAPSHOT_CONFLICT'; throw conflict; }
    backup(original);
    // A failed command may have applied its side effect. Retain the backup until verified restore.
    reg(['add', key, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
    reg(['add', key, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', host + ':' + port, '/f']);
    reg(['add', key, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', '<local>', '/f']);
    const after = readSnapshot();
    if (!after.values.ProxyEnable.exists || Number(after.values.ProxyEnable.data) !== 1 || after.values.ProxyServer.data !== host + ':' + port || after.values.ProxyOverride.data !== '<local>') throw new Error('Proxy update could not be verified; restore the saved snapshot');
    return Object.fromEntries(VALUES.map((name) => [name, after.values[name].data]));
  }
  function restore(snapshot = null) {
    const current = inspectRecord(backupPath);
    if (current.format === 'ERROR') throw backupProblem(current.error);
    if (current.format === 'LEGACY_PARTIAL') throw backupProblem('Legacy proxy backup lacks registry types and original presence; original file preserved', 'PROXY_LEGACY_INCOMPLETE');
    const saved = current.snapshot ?? null;
    let target;
    if (snapshot || saved) {
      // A transaction's complete journal/new V1 backup is authoritative. Historical
      // files are independent evidence and cannot prevent its rollback.
      target = validateSnapshot(snapshot || saved);
      if (saved && !equalValues(saved, target)) throw new Error('Recovery snapshot differs from the unrestored proxy backup');
    } else {
      const historical = inspectRecord(legacyBackupPath);
      if (historical.format === 'ERROR') throw backupProblem(historical.error);
      if (historical.format === 'LEGACY_PARTIAL') throw backupProblem('Legacy proxy backup lacks registry types and original presence; original file preserved', 'PROXY_LEGACY_INCOMPLETE');
      if (historical.format === 'ABSENT') return readCurrent();
      target = validateSnapshot(historical.snapshot);
    }
    for (const name of VALUES) {
      const value = target.values[name];
      const current = readSnapshot().values[name];
      if (value.exists) {
        if (!current.exists || current.type !== value.type || current.data !== value.data) reg(['add', key, '/v', name, '/t', value.type, '/d', value.data, '/f']);
      } else if (current.exists) reg(['delete', key, '/v', name, '/f']);
    }
    const after = readSnapshot();
    if (!equalValues(target, after)) throw new Error('Proxy restoration verification failed; recovery backup retained');
    if (saved) fileSystem.unlinkSync(backupPath);
    return Object.fromEntries(VALUES.filter((name) => after.values[name].exists).map((name) => [name, after.values[name].data]));
  }
  function isProxyOn() { return Number(readCurrent().ProxyEnable) === 1; }
  return { KEY: key, BACKUP: backupPath, LEGACY_BACKUP: legacyBackupPath, readCurrent, readSnapshot, snapshot: readSnapshot, inspectBackups, assertBackupReady, backup, setProxy, restore, isProxyOn };
}
const defaults = createProxySettings();
export const { readCurrent, readSnapshot, snapshot, inspectBackups, assertBackupReady, backup, setProxy, restore, isProxyOn } = defaults;
function main() {
  const [cmd, host = '127.0.0.1', port = '17321'] = process.argv.slice(2);
  if (cmd === 'show') console.log({ snapshot: readSnapshot(), backups: inspectBackups() });
  else if (cmd === 'backup') console.log(backup());
  else if (cmd === 'set') console.log(setProxy(host, Number(port)));
  else if (cmd === 'restore') console.log(restore());
  else console.log('usage: proxy-settings.mjs show | backup | set [host] [port] | restore');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
