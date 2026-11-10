import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Real process exits, with certificate and registry state represented only by JSON.
const captureUrl = new URL('../src/capture.mjs', import.meta.url).href;
const childSource = [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  'import { createCaptureController } from ' + JSON.stringify(captureUrl) + ';',
  'const [dir, mode] = process.argv.slice(2);',
  "const statePath = path.join(dir, 'fake-system.json');",
  "const read = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));",
  'const write = (value) => fs.writeFileSync(statePath, JSON.stringify(value));',
  "const thumbprint = 'A'.repeat(40);",
  "const ca = { CA_DIR: dir, CA_CRT: 'synthetic.crt', CA_CN: 'synthetic', initCa() {}, caFingerprint: () => thumbprint, isInstalled: () => read().ca, installCa() { const value = read(); value.ca = true; write(value); return { owned: true, installed: true, thumbprint }; }, uninstallCa(receipt) { if (receipt.thumbprint !== thumbprint || !receipt.owned) throw Error('bad receipt'); const value = read(); value.ca = false; write(value); } };",
  "const settings = { readSnapshot: () => read().proxy, setProxy() { const value = read(); value.proxy = { synthetic: 'capture-proxy' }; write(value); }, restore(snapshot) { const value = read(); value.proxy = snapshot; write(value); } };",
  "const controller = createCaptureController({ ca, settings, journalPath: path.join(dir, 'capture-session.json'), proxyFactory: () => ({ port: 17399, async listen() {}, async stop() {} }) });",
  "if (mode === 'recover') { await controller.recoverCapture(); process.exit(0); }",
  'const state = await controller.startCapture();',
  "if (!state.running) throw Error('synthetic startup failed');",
  "if (mode === 'exception') throw Error('synthetic-unhandled-error');",
  "if (mode === 'exit') process.exit(0);",
  "process.stdout.write('READY\\n'); setInterval(() => {}, 1000);",
].join('\n');

function runChild(file, args, onReady) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', ready = false;
    const timeout = setTimeout(() => { child.kill(); reject(Error('isolated child timed out')); }, 10000);
    child.stdout.on('data', (chunk) => { stdout += chunk; if (!ready && stdout.includes('READY')) { ready = true; onReady?.(child); } });
    child.stderr.on('data', (chunk) => stderr += chunk);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stdout, stderr }); });
  });
}
for (const mode of ['exception', 'exit', 'hard-kill']) test('isolated child recovery after ' + mode, { timeout: 20000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-process-recovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const original = { ca: false, proxy: { synthetic: 'original-proxy', missingValue: null } };
  const systemPath = path.join(dir, 'fake-system.json'), file = path.join(dir, 'child.mjs');
  fs.writeFileSync(systemPath, JSON.stringify(original)); fs.writeFileSync(file, childSource);
  const child = await runChild(file, [dir, mode], (process) => process.kill('SIGKILL'));
  if (mode === 'hard-kill') {
    assert.equal(JSON.parse(fs.readFileSync(systemPath)).ca, true);
    assert.equal(fs.existsSync(path.join(dir, 'capture-session.json')), true);
    const recovery = await runChild(file, [dir, 'recover']); assert.equal(recovery.code, 0, recovery.stderr);
  } else assert.equal(child.code, mode === 'exception' ? 1 : 0, child.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(systemPath)), original);
  assert.equal(fs.existsSync(path.join(dir, 'capture-session.json')), false);
  assert.equal(fs.existsSync(path.join(dir, 'capture-session.json.lock')), false);
});
