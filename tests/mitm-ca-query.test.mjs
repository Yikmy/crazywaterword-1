import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { queryCurrentUserRoot, createCaManager } from '../tools/mitm-ca.mjs';

const A = 'A'.repeat(40), B = 'B'.repeat(40);
const report = (status, changes = {}) => ({ status, thumbprint: A, store: 'Root', location: 'CurrentUser', storeOpened: true,
  enumerationCompleted: true, certificateCount: 3, matchCount: status === 'FOUND' ? 1 : 0, error: null, ...changes });
const query = (value) => queryCurrentUserRoot(A, { runner: () => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });

test('X509Store query normalizes exact SHA1 and opens only CurrentUser Root read-only', () => {
  const result = queryCurrentUserRoot(A.toLowerCase().match(/../g).join(':'), { runner(program, args, options) {
    assert.match(program, /[\\/]powershell\.exe$/i);
    assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
    assert.equal(options.windowsHide, true); assert.equal(options.encoding, 'utf8'); assert.ok(options.timeout > 0);
    const script = Buffer.from(args[4], 'base64').toString('utf16le');
    assert.match(script, /StoreName\]::Root/); assert.match(script, /StoreLocation\]::CurrentUser/);
    assert.match(script, /OpenFlags\]::ReadOnly/); assert.match(script, /OpenFlags\]::OpenExistingOnly/);
    assert.match(script, /foreach \(\$certificate in \$certificates\)/);
    assert.match(script, /\$candidate -ceq \$target/); assert.match(script, new RegExp("\\$target = '" + A + "'"));
    assert.doesNotMatch(script, /\.(Add|Remove)\(/); assert.doesNotMatch(script, /certutil/i);
    return JSON.stringify(report('FOUND'));
  } });
  assert.equal(result.status, 'FOUND'); assert.equal(result.thumbprint, A); assert.equal(result.matchCount, 1);
});

test('ABSENT requires successful store open and completed enumeration without an exact match', () => {
  const result = query(report('ABSENT'));
  assert.equal(result.status, 'ABSENT'); assert.equal(result.storeOpened, true);
  assert.equal(result.enumerationCompleted, true); assert.equal(result.certificateCount, 3); assert.equal(result.matchCount, 0);
});

test('store-open and enumeration failures remain ERROR', () => {
  for (const changes of [
    { storeOpened: false, enumerationCompleted: false, error: 'Store cannot be opened' },
    { enumerationCompleted: false, certificateCount: 1, error: 'Enumeration failed' },
  ]) {
    const result = query(report('ERROR', changes));
    assert.equal(result.status, 'ERROR'); assert.equal(result.code, 'CA_STORE_QUERY_ERROR'); assert.equal(result.error, changes.error);
  }
});

test('native not-found error codes never substitute for completed store enumeration', () => {
  for (const message of ['0x80090011 NTE_NOT_FOUND', 'CRYPT_E_NOT_FOUND 0x80092004', 'access denied']) {
    const result = queryCurrentUserRoot(A, { runner() { throw new Error(message); } });
    assert.equal(result.status, 'ERROR'); assert.equal(result.code, 'CA_STORE_QUERY_ERROR'); assert.match(result.error, new RegExp(message));
  }
});

test('invalid or incomplete query reports fail closed', () => {
  for (const value of [null, [], 'not json', report('UNKNOWN'), report('FOUND', { matchCount: 0 }),
    report('ABSENT', { storeOpened: false }), report('ABSENT', { enumerationCompleted: false }),
    report('FOUND', { certificateCount: 0 }), report('ABSENT', { error: 'unhandled failure' }),
    report('FOUND', { certificateCount: 1.5 }), report('ABSENT', { matchCount: -1 })]) {
    assert.equal(query(value).status, 'ERROR', JSON.stringify(value));
  }
});

test('query results must belong to the exact thumbprint and store scope', () => {
  for (const changes of [{ thumbprint: B }, { thumbprint: A + '0' }, { store: 'My' }, { location: 'LocalMachine' }]) {
    assert.equal(query(report('FOUND', changes)).status, 'ERROR');
  }
});

test('malformed thumbprints cannot reach a query process', () => {
  let calls = 0;
  for (const thumbprint of ['', 'A'.repeat(39), A + "'; Remove-Item x", null]) {
    const result = queryCurrentUserRoot(thumbprint, { runner() { calls++; assert.fail('invalid thumbprint reached query process'); } });
    assert.equal(result.status, 'ERROR'); assert.equal(result.code, 'INVALID_THUMBPRINT');
  }
  assert.equal(calls, 0);
});

test('isInstalled preserves boolean compatibility and throws for uncertain store state', () => {
  let value = report('FOUND');
  const manager = createCaManager({ runner() { return JSON.stringify(value); } });
  assert.equal(manager.isInstalled(A), true); assert.equal(manager.queryCa(A).status, 'FOUND');
  value = report('ABSENT'); assert.equal(manager.isInstalled(A), false); assert.equal(manager.queryCa(A).status, 'ABSENT');
  value = report('ERROR', { enumerationCompleted: false, error: 'synthetic failure' });
  assert.throws(() => manager.isInstalled(A), (error) => error.code === 'CA_STORE_QUERY_ERROR' && error.query.status === 'ERROR');
});

test('query errors prevent certificate installation or deletion and preserve ownership', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-ca-query-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'ca.crt'), 'SYNTHETIC PUBLIC CERTIFICATE');
  const calls = [];
  const manager = createCaManager({ dir, runner(program, args) {
    calls.push({ program, args });
    if (program === 'openssl' && args.includes('-fingerprint')) return Buffer.from('sha1 Fingerprint=' + A);
    if (/[\\/]powershell\.exe$/i.test(program)) throw new Error('synthetic store-open failure');
    assert.fail('Query failure must precede any trust-store mutation');
  } });
  assert.throws(() => manager.installCa({ expectedThumbprint: A }), (error) => error.code === 'CA_STORE_QUERY_ERROR' && error.ownership.owned === false);
  assert.throws(() => manager.uninstallCa({ thumbprint: A, owned: true }), { code: 'CA_STORE_QUERY_ERROR' });
  assert.ok(calls.every(call => call.program !== 'certutil'));
  assert.equal(fs.readdirSync(dir).some(name => name.startsWith('.install-')), false);
});
