// Capture owns a small write-ahead recovery journal. Importing this module has no
// certificate/registry side effects; tests inject both system adapters.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as defaultCa from '../tools/mitm-ca.mjs';
import * as defaultSettings from '../tools/proxy-settings.mjs';
const DEFAULT_PROXY_PORT = Number(process.env.CW_PROXY_PORT ?? 17322);
const defaultProxyFactory = async (options) => (await import('../tools/mitm-proxy.mjs')).createProxy(options);
import { redact, redactText, validateCredentials } from './security.mjs';

export function createCaptureController({ ca = defaultCa, settings = defaultSettings, proxyFactory = defaultProxyFactory, journalPath = path.join(ca.CA_DIR, 'capture-session.json'), lifecycle = process, pidIsAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } } } = {}) {
  const state = { running: false, phase: 'idle', error: null, port: DEFAULT_PROXY_PORT, caInstalled: false, proxy: null, capturedAt: null, accountId: null, startedAt: null, log: [] };
  const knownSecrets = new Set();
  let proxy = null, journal = null, startPromise = null, stopPromise = null, recoveryPromise = null, cancelled = false, hooks = [];
  let onLog = null;
  let lockOwner = null;
  const lockPath = journalPath + '.lock';
  const safe = (value) => redactText(value, [...knownSecrets]);
  function note(message) {
    const line = safe(message);
    state.log.push({ t: new Date().toISOString(), line });
    if (state.log.length > 200) state.log.shift();
    try { onLog?.(line); } catch { /* an observer cannot prevent recovery */ }
  }
  function captureState() {
    const proxyBackups = settings.inspectBackups?.();
    const orphanBackup = (proxyBackups?.current && proxyBackups.current.format !== 'ABSENT') || proxyBackups?.legacy?.recoveryRequired;
    return redact({ ...state, log: state.log.slice(-40).map((entry) => entry.line), recoveryPending: Boolean((journal || proxy || fs.existsSync(journalPath) || orphanBackup) && !state.running), proxyBackups, ca: { cn: ca.CA_CN, crt: ca.CA_CRT, fingerprint: journal?.ca?.thumbprint ?? null } }, [...knownSecrets]);
  }
  // Publish a populated directory atomically, so stale-lock cleanup cannot remove
  // a new owner between mkdir and owner-file creation.
  function acquireLock() {
    if (lockOwner) return;
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    const id = crypto.randomUUID();
    const candidate = lockPath + '.candidate-' + id;
    const ownerFile = 'owner-' + id + '.json';
    fs.mkdirSync(candidate);
    fs.writeFileSync(path.join(candidate, ownerFile), JSON.stringify({ id, pid: lifecycle.pid }), { mode: 0o600 });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { fs.renameSync(candidate, lockPath); lockOwner = ownerFile; return; }
        catch (error) { if (!fs.existsSync(lockPath)) throw error; }
        const entries = fs.readdirSync(lockPath);
        if (entries.length !== 1 || !/^owner-[a-f0-9-]+\.json$/.test(entries[0])) throw new Error('抓包锁无效，拒绝接管');
        const oldPath = path.join(lockPath, entries[0]);
        let owner;
        try { owner = JSON.parse(fs.readFileSync(oldPath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (!Number.isInteger(owner.pid) || owner.pid < 1 || pidIsAlive(owner.pid)) throw new Error('另一个抓包进程仍在运行，拒绝接管其恢复记录');
        try { fs.unlinkSync(oldPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        try { fs.rmdirSync(lockPath); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
      }
      throw new Error('抓包恢复锁发生竞争，请稍后重试');
    } finally {
      if (fs.existsSync(candidate)) { fs.unlinkSync(path.join(candidate, ownerFile)); fs.rmdirSync(candidate); }
    }
  }
  function releaseLock() {
    if (!lockOwner) return;
    const ownedPath = path.join(lockPath, lockOwner);
    try { fs.unlinkSync(ownedPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { fs.rmdirSync(lockPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    lockOwner = null;
  }
  function verifyJournalOwner() {
    if (!journal || !lockOwner) throw new Error('未持有抓包恢复记录');
    const saved = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    if (saved.id !== journal.id) throw new Error('恢复记录已被替换，拒绝覆盖或删除');
  }
  function writeDurable(file, value) {
    const fd = fs.openSync(file, 'w', 0o600);
    try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  function saveJournal() {
    verifyJournalOwner();
    const temporary = journalPath + '.tmp';
    writeDurable(temporary, JSON.stringify(journal, null, 2) + '\n');
    fs.renameSync(temporary, journalPath);
  }
  function removeHooks() {
    for (const [name, handler] of hooks) lifecycle.off(name, handler);
    hooks = [];
  }
  // Synchronous OS adapters also work in exit/uncaughtException handlers. Failed
  // recovery retains its journal and is retried before another capture may start.
  function restoreSystem() {
    const errors = [];
    if (!journal) { if (!proxy) { releaseLock(); removeHooks(); } return errors; }
    try { verifyJournalOwner(); } catch (error) { state.phase = 'recovery_required'; state.error = safe(error.message); return [state.error]; }
    if (journal.proxyIntent) {
      try { settings.restore(journal.originalProxy); journal.proxyIntent = false; state.proxy = null; saveJournal(); note('系统代理已恢复并验证'); }
      catch (error) { errors.push('代理恢复失败: ' + safe(error.message)); }
    }
    if (journal.ca?.owned && journal.ca.installIntent) {
      try {
        ca.uninstallCa({ thumbprint: journal.ca.thumbprint, owned: true });
        journal.ca.installIntent = false;
        state.caInstalled = false;
        saveJournal();
        note('本次新增 CA 已按指纹清理');
      } catch (error) { errors.push('CA 恢复失败: ' + safe(error.message)); }
    }
    if (!errors.length && !proxy) {
      try { verifyJournalOwner(); fs.unlinkSync(journalPath); journal = null; releaseLock(); }
      catch (error) { if (error.code === 'ENOENT') journal = null; else errors.push('恢复记录清理失败: ' + safe(error.message)); }
    }
    if (errors.length) { state.phase = 'recovery_required'; state.error = errors.join('; '); for (const error of errors) note(error); }
    else if (!proxy) removeHooks();
    return errors;
  }
  function installHooks() {
    if (hooks.length) return;
    const on = (name, handler) => { hooks.push([name, handler]); lifecycle.on(name, handler); };
    on('exit', () => { cancelled = true; state.running = false; proxy = null; restoreSystem(); });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) on(signal, () => { stopCapture(signal).finally(() => lifecycle.exit(signal === 'SIGINT' ? 130 : 143)); });
    const fatal = (error) => {
      state.error = safe(error?.message ?? '未处理的异常'); note('异常退出，执行恢复: ' + state.error);
      cancelled = true;
      const exitingProxy = proxy; proxy = null;
      try { Promise.resolve(exitingProxy?.stop()).catch(() => {}); } catch { /* process exit closes remaining sockets */ }
      state.running = false;
      restoreSystem();
      lifecycle.exit(1);
    };
    on('uncaughtException', fatal);
    on('unhandledRejection', fatal);
  }
  function loadPending() {
    if (!fs.existsSync(journalPath)) return false;
    const saved = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    if (saved.version !== 1 || typeof saved.id !== 'string' || !saved.id || !Number.isInteger(saved.pid) || saved.pid < 1 || !saved.originalProxy || typeof saved.proxyIntent !== 'boolean' || !saved.ca || typeof saved.ca.owned !== 'boolean' || typeof saved.ca.installIntent !== 'boolean' || !/^[A-F0-9]{40}$/.test(saved.ca.thumbprint)) throw new Error('恢复记录格式无效，拒绝修改系统设置');
    if (saved.id !== journal?.id && pidIsAlive(saved.pid)) throw new Error('另一个抓包进程仍在运行，拒绝接管其恢复记录');
    journal = saved;
    journal.pid = lifecycle.pid; saveJournal();
    return true;
  }
  function recoverCapture() {
    if (recoveryPromise) return recoveryPromise;
    const task = Promise.resolve().then(async () => {

      if (startPromise || state.running) throw new Error('抓包运行期间不能接管恢复');
      acquireLock();
      try { if (!journal && !loadPending()) { releaseLock(); return captureState(); } } catch (error) { releaseLock(); throw error; }
      state.phase = 'recovering';
      if (proxy) { await proxy.stop(); proxy = null; }
      installHooks();
      const errors = restoreSystem();
      if (errors.length) throw new Error(state.error);
      state.phase = 'idle'; state.error = null;
      return captureState();
    }).finally(() => { if (recoveryPromise === task) recoveryPromise = null; });
    recoveryPromise = task; return task;
  }
  async function rollback(reason) {
    state.phase = 'stopping'; state.running = false;
    note('停止抓包（' + reason + '）');
    const instance = proxy; proxy = null;
    let proxyError = null;
    try { await instance?.stop(); } catch (error) { proxy = instance; proxyError = '代理关闭失败: ' + safe(error.message); note(proxyError); }
    const errors = restoreSystem();
    if (proxyError) { errors.push(proxyError); state.error = errors.join('; '); state.phase = 'recovery_required'; }
    if (!errors.length) state.phase = fs.existsSync(journalPath) ? 'recovery_required' : 'idle';
    return captureState();
  }
  function startCapture({ onLogin, onLog: logger, port = DEFAULT_PROXY_PORT, keepCa = false } = {}) {
    if (startPromise) return startPromise;
    if (recoveryPromise) return recoveryPromise.then(() => startCapture({ onLogin, onLog: logger, port, keepCa }));
    if (state.running) return Promise.resolve(captureState());
    if (stopPromise) return stopPromise.then(() => startCapture({ onLogin, onLog: logger, port, keepCa }));
    cancelled = false; onLog = logger;
    state.error = null; state.log = []; state.port = port; state.accountId = null; state.capturedAt = null; state.startedAt = new Date().toISOString(); state.phase = 'starting';
    const guard = () => { if (cancelled) throw new Error('启动已取消'); };
    const task = Promise.resolve().then(async () => {
      try {
        acquireLock();
        if (journal || loadPending()) {
          installHooks(); const errors = restoreSystem(); if (errors.length) throw new Error(state.error);
          acquireLock();
        }
        if (proxy) { await proxy.stop(); proxy = null; }
        guard();
        if (keepCa) throw new Error('本流程必须清理本次新增 CA，不支持保留选项');
        const originalProxy = settings.readSnapshot();
        settings.assertBackupReady?.(originalProxy);
        ca.initCa();
        const thumbprint = ca.caFingerprint();
        const existed = ca.isInstalled(thumbprint);
        journal = { version: 1, id: crypto.randomUUID(), pid: lifecycle.pid, startedAt: state.startedAt, originalProxy, proxyIntent: false, ca: { thumbprint, owned: !existed, installIntent: false } };
        fs.mkdirSync(path.dirname(journalPath), { recursive: true });
        // Exclusive create prevents replacing another process's recovery source.
        try {
          if (fs.existsSync(journalPath)) throw new Error('恢复记录已经存在');
          const initial = journalPath + '.initial-' + journal.id;
          writeDurable(initial, JSON.stringify(journal, null, 2) + '\n');
          fs.renameSync(initial, journalPath);
        } catch (error) { journal = null; throw error; }
        installHooks(); guard();
        state.phase = 'ca';
        if (!existed) {
          journal.ca.installIntent = true;
          try { saveJournal(); } catch (error) { journal.ca.installIntent = false; throw error; }
        }
        let receipt;
        try { receipt = ca.installCa({ expectedThumbprint: thumbprint }); }
        catch (error) {
          if (error.ownership?.owned === false) { journal.ca.owned = false; journal.ca.installIntent = false; saveJournal(); }
          throw error;
        }
        if (receipt?.thumbprint && receipt.thumbprint !== thumbprint) {
          // Defensive adapter contract: retain responsibility for the actual receipt.
          if (!/^[A-F0-9]{40}$/.test(receipt.thumbprint)) throw new Error('CA 安装回执指纹无效');
          journal.ca = { thumbprint: receipt.thumbprint, owned: receipt.owned === true, installIntent: receipt.owned === true };
          saveJournal();
          throw new Error('CA 安装回执与准备指纹不一致');
        }
        // Another installer may have added this exact CA before our installation.
        if (receipt?.owned === false) { journal.ca.owned = false; journal.ca.installIntent = false; saveJournal(); }
        state.caInstalled = ca.isInstalled(thumbprint);
        if (!state.caInstalled) throw new Error('CA 安装后未能验证');
        note(existed ? '复用原有 CA，结束时保留' : '本次 CA 安装完成（按指纹跟踪）');
        guard(); state.phase = 'listening';
        const transactionId = journal.id;
        proxy = await proxyFactory({ port, log: (kind, message) => { if (['upgrade', 'capture', 'warn'].includes(kind)) note(message); }, onLogin: async (record) => {
          if (!state.running || cancelled || journal?.id !== transactionId) return;
          for (const value of [record.body?.eworldParams?.token, record.body?.eworldParams?.sign, record.rawFrameHex]) if (typeof value === 'string' && value) knownSecrets.add(value);
          try {
            validateCredentials({ url: record.url, login: record.body });
            state.capturedAt = new Date().toISOString(); state.phase = 'captured'; note('已捕获正常登录请求');
            const result = await onLogin?.(record);
            if (!cancelled && journal?.id === transactionId) state.accountId = result?.id ?? null;
          } catch (error) {
            if (journal?.id !== transactionId) return;
            const message = safe(error.message);
            await stopCapture('凭证处理失败');
            state.error = message;
            note('凭证处理失败: ' + message);
          }
        } });
        guard();
        await proxy.listen();
        guard();
        state.port = proxy.port;
        state.phase = 'proxy';
        journal.proxyIntent = true;
        try { saveJournal(); } catch (error) { journal.proxyIntent = false; throw error; }
        try { settings.setProxy('127.0.0.1', state.port, { snapshot: originalProxy }); }
        catch (error) {
          if (['PROXY_SNAPSHOT_CONFLICT', 'PROXY_BACKUP_EXISTS'].includes(error.code)) { journal.proxyIntent = false; saveJournal(); }
          throw error;
        }
        state.proxy = { host: '127.0.0.1', port: state.port };
        guard(); state.running = true; state.phase = 'waiting';
        note('抓包代理已就绪（仅解密白名单主机）');
      } catch (error) {
        const message = safe(error.message);
        await rollback('启动失败');
        state.error = message + (journal ? '; ' + (state.error ?? '需要恢复') : '');
        if (!journal) state.phase = fs.existsSync(journalPath) || proxy ? 'recovery_required' : 'failed';
        note('启动失败: ' + message);
      }
      return captureState();
    }).finally(() => { if (startPromise === task) startPromise = null; });
    startPromise = task; return task;
  }
  function stopCapture(reason = '停止') {
    if (stopPromise) return stopPromise;
    if (recoveryPromise) return recoveryPromise.then(() => stopCapture(reason));
    cancelled = true;
    // A pending listen owns no system proxy yet, but should be cancelled promptly.
    if (startPromise && proxy) { try { Promise.resolve(proxy.stop()).catch(() => {}); } catch {} }
    const task = Promise.resolve(startPromise).then(() => rollback(reason)).finally(() => { if (stopPromise === task) stopPromise = null; });
    stopPromise = task; return task;
  }
  return { startCapture, stopCapture, captureState, recoverCapture };
}
const defaults = createCaptureController();
export const { startCapture, stopCapture, captureState, recoverCapture } = defaults;
export { DEFAULT_PROXY_PORT };
