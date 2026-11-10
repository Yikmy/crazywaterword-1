import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CA_DIR = path.join(os.homedir(), '.cw-ca');
export const CA_KEY = path.join(CA_DIR, 'ca.key');
export const CA_CRT = path.join(CA_DIR, 'ca.crt');
export const CA_CN = 'CrazyWaterWorld Local Test CA';

const normalizeThumbprint = (value) => {
  const text = String(value ?? '').replace(/[\s:]/g, '').toUpperCase();
  if (!/^[A-F0-9]{40}$/.test(text)) throw new Error('Invalid CA SHA1 thumbprint');
  return text;
};

// A native lookup error is not evidence of absence. Only a completed read-only
// enumeration of the exact current-user store may return ABSENT.
export function queryCurrentUserRoot(thumbprint, { runner = execFileSync, powershellPath = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') } = {}) {
  let target;
  const failure = (message, code = 'CA_STORE_QUERY_ERROR') => ({ status: 'ERROR', thumbprint: target ?? null, store: 'Root', location: 'CurrentUser', error: message, code });
  if (runner === execFileSync && process.platform !== 'win32') return failure('Windows certificate stores are unavailable on this platform', 'UNSUPPORTED_PLATFORM');
  try { target = normalizeThumbprint(thumbprint); }
  catch (error) { return failure(error.message, 'INVALID_THUMBPRINT'); }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
    "$target = '" + target + "'",
    "$result = [ordered]@{ status = 'ERROR'; thumbprint = $target; store = 'Root'; location = 'CurrentUser'; storeOpened = $false; enumerationCompleted = $false; certificateCount = 0; matchCount = 0; error = $null }",
    '$store = $null',
    'try {',
    '  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser)',
    '  $flags = [System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly -bor [System.Security.Cryptography.X509Certificates.OpenFlags]::OpenExistingOnly',
    '  $store.Open($flags)',
    '  $result.storeOpened = $true',
    '  $certificates = $store.Certificates',
    '  foreach ($certificate in $certificates) {',
    "    $candidate = ($certificate.Thumbprint -replace '[\\s:]', '').ToUpperInvariant()",
    "    if ($candidate -cnotmatch '^[A-F0-9]{40}$') { throw 'Invalid certificate thumbprint while enumerating Root' }",
    '    $result.certificateCount++',
    '    if ($candidate -ceq $target) { $result.matchCount++ }',
    '  }',
    '  $result.enumerationCompleted = $true',
    "  if ($result.matchCount -gt 0) { $result.status = 'FOUND' } else { $result.status = 'ABSENT' }",
    '} catch {',
    "  $result.status = 'ERROR'; $result.error = $_.Exception.GetType().FullName + ': ' + $_.Exception.Message",
    '} finally {',
    "  if ($null -ne $store) { try { $store.Close() } catch { $result.status = 'ERROR'; $result.error = 'Unable to close certificate store: ' + $_.Exception.Message } }",
    '}',
    '$result | ConvertTo-Json -Compress',
  ].join('\n');
  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const output = runner(powershellPath, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = JSON.parse(String(output).replace(/^\uFEFF/, '').trim());
    if (!result || Array.isArray(result) || !['status', 'thumbprint', 'store', 'location'].every((name) => Object.hasOwn(result, name)) || result.thumbprint !== target || result.store !== 'Root' || result.location !== 'CurrentUser' || !['FOUND', 'ABSENT', 'ERROR'].includes(result.status)) throw new Error('Invalid certificate-store query response');
    if (result.status === 'ERROR') {
      if (typeof result.error !== 'string' || !result.error) throw new Error('Invalid certificate-store error response');
      return { ...result, code: 'CA_STORE_QUERY_ERROR' };
    }
    if (result.storeOpened !== true || result.enumerationCompleted !== true || result.error !== null ||
        !Number.isSafeInteger(result.certificateCount) || result.certificateCount < 0 ||
        !Number.isSafeInteger(result.matchCount) || result.matchCount < 0 || result.matchCount > result.certificateCount ||
        (result.status === 'FOUND') !== (result.matchCount > 0)) throw new Error('Certificate-store enumeration was not reliably completed');
    return result;
  } catch (error) { return failure('Unable to query current-user Root: ' + (error.code ?? error.message)); }
}

export function resolveOpenSsl({ env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  if (env.CW_OPENSSL) return env.CW_OPENSSL;
  if (platform === 'win32') {
    const roots = [env.ProgramFiles || 'C:/Program Files', env['ProgramFiles(x86)']].filter(Boolean);
    for (const root of roots) for (const suffix of ['Git/usr/bin/openssl.exe', 'Git/mingw64/bin/openssl.exe']) {
      const candidate = path.join(root, suffix); if (exists(candidate)) return candidate;
    }
  }
  return 'openssl';
}
export function createCaManager({ dir = CA_DIR, runner = execFileSync, opensslPath = null } = {}) {
  const key = path.join(dir, 'ca.key');
  const crt = path.join(dir, 'ca.crt');
  const leafKey = path.join(dir, 'leaf.key');
  const owned = new Set();
  const run = (program, args) => runner(program, args, { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  const executable = opensslPath || (runner === execFileSync ? resolveOpenSsl() : 'openssl');
  const openssl = (args) => run(executable, args);
  function validatePair(certPath, keyPath) {
    const publicCert = openssl(['x509', '-in', certPath, '-noout', '-pubkey']).trim();
    const publicKey = openssl(['pkey', '-in', keyPath, '-pubout']).trim();
    if (!publicCert || publicCert !== publicKey) throw new Error('Certificate and private key do not match');
    openssl(['x509', '-in', certPath, '-noout', '-checkend', '0']);
  }
  function certificateFingerprint(certPath = crt) {
    const output = openssl(['x509', '-in', certPath, '-noout', '-fingerprint', '-sha1']).trim();
    return normalizeThumbprint(output.includes('=') ? output.slice(output.lastIndexOf('=') + 1) : output);
  }
  const caFingerprint = () => certificateFingerprint();
  function queryCa(thumbprint = null) {
    try { return queryCurrentUserRoot(thumbprint || caFingerprint(), { runner }); }
    catch (error) { return { status: 'ERROR', thumbprint: null, store: 'Root', location: 'CurrentUser', code: 'CA_STORE_QUERY_ERROR', error: error.message }; }
  }
  function isInstalled(thumbprint = null) {
    const result = queryCa(thumbprint);
    if (result.status === 'ERROR') throw Object.assign(new Error('Unable to inspect current-user certificate trust store: ' + result.error), { code: 'CA_STORE_QUERY_ERROR', query: result });
    return result.status === 'FOUND';
  }
  function initCa({ force = false } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(crt) && !force) {
      if (!fs.existsSync(key)) throw new Error('Existing CA certificate has no matching private key');
      validatePair(crt, key);
      if (!fs.existsSync(leafKey)) openssl(['genrsa', '-out', leafKey, '2048']);
      return { created: false, path: crt };
    }
    if (force && fs.existsSync(crt) && isInstalled()) throw new Error('Remove the exact existing CA before regenerating it');
    openssl(['genrsa', '-out', key, '2048']);
    openssl(['req', '-x509', '-new', '-key', key, '-sha256', '-days', '3650', '-out', crt, '-subj', '/CN=' + CA_CN + '/O=' + CA_CN + '/C=CN', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
    openssl(['genrsa', '-out', leafKey, '2048']);
    validatePair(crt, key);
    return { created: true, path: crt };
  }
  function leafFor(host) {
    if (typeof host !== 'string' || !/^(?=.{1,253}$)[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*$/.test(host)) throw new Error('Invalid leaf hostname');
    const keyPath = path.join(dir, 'leaf-' + host + '.key');
    const certPath = path.join(dir, 'leaf-' + host + '.crt');
    validatePair(crt, key);
    let cached = fs.existsSync(certPath) && fs.existsSync(keyPath);
    if (cached) {
      try {
        validatePair(certPath, keyPath);
        openssl(['verify', '-CAfile', crt, '-purpose', 'sslserver', '-verify_hostname', host, certPath]);
      } catch { cached = false; }
    }
    if (!cached) {
      const csr = path.join(dir, 'leaf-' + host + '.csr');
      const ext = path.join(dir, 'leaf-' + host + '.ext');
      fs.copyFileSync(leafKey, keyPath);
      fs.writeFileSync(ext, ['subjectAltName=DNS:' + host, 'basicConstraints=CA:FALSE', 'keyUsage=digitalSignature,keyEncipherment', 'extendedKeyUsage=serverAuth', ''].join('\n'));
      openssl(['req', '-new', '-key', keyPath, '-out', csr, '-subj', '/CN=' + host]);
      openssl(['x509', '-req', '-in', csr, '-CA', crt, '-CAkey', key, '-CAcreateserial', '-out', certPath, '-days', '3650', '-sha256', '-extfile', ext]);
    }
    validatePair(certPath, keyPath);
    openssl(['verify', '-CAfile', crt, '-purpose', 'sslserver', '-verify_hostname', host, certPath]);
    return { key: keyPath, keyPath, certPath, cert: fs.readFileSync(certPath), keyPem: fs.readFileSync(keyPath), cached };
  }
  function installCa({ expectedThumbprint = null } = {}) {
    // Bind the OS call to immutable bytes, even if another tool replaces ca.crt.
    const snapshot = path.join(dir, '.install-' + crypto.randomUUID() + '.crt');
    let attempted = false, thumbprint = null;
    try {
      fs.writeFileSync(snapshot, fs.readFileSync(crt), { flag: 'wx', mode: 0o600 });
      thumbprint = certificateFingerprint(snapshot);
      if (expectedThumbprint && thumbprint !== normalizeThumbprint(expectedThumbprint)) {
        const error = new Error('CA identity changed before installation'); error.code = 'CA_IDENTITY_CHANGED'; throw error;
      }
      if (isInstalled(thumbprint)) return { thumbprint, installed: true, owned: owned.has(thumbprint) };
      // The command may apply its side effect and then fail.
      attempted = true; owned.add(thumbprint);
      run('certutil', ['-user', '-addstore', 'Root', snapshot]);
      if (!isInstalled(thumbprint)) throw new Error('CA trust installation could not be verified');
      return { thumbprint, installed: true, owned: true };
    } catch (error) {
      if (!attempted) {
        error.code ??= 'CA_PREPARE_FAILED'; error.ownership = { thumbprint, owned: false }; throw error;
      }
      const failure = new Error('CA trust installation failed; exact-thumbprint rollback is required');
      failure.ownership = { thumbprint, owned: true }; failure.cause = error; throw failure;
    } finally {
      // A temporary public certificate is never used as the recovery source.
      try { fs.unlinkSync(snapshot); } catch (error) { if (error.code !== 'ENOENT') { /* no trust or key data is stored here */ } }
    }
  }
  function uninstallCa(receipt = null) {
    const thumbprint = normalizeThumbprint(receipt?.thumbprint || caFingerprint());
    if (!(receipt ? receipt.owned === true : owned.has(thumbprint))) return isInstalled(thumbprint);
    if (isInstalled(thumbprint)) run('certutil', ['-user', '-delstore', 'Root', thumbprint]);
    if (isInstalled(thumbprint)) throw new Error('CA trust removal could not be verified');
    owned.delete(thumbprint);
    return false;
  }
  return { CA_DIR: dir, CA_KEY: key, CA_CRT: crt, CA_CN, initCa, leafFor, caFingerprint, queryCa, isInstalled, installCa, uninstallCa };
}

const defaults = createCaManager();
export const { initCa, leafFor, caFingerprint, queryCa, isInstalled, installCa, uninstallCa } = defaults;
function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'init') console.log(initCa({ force: arg === '--force' }));
  else if (cmd === 'leaf') { const { keyPath, certPath, cached } = leafFor(arg); console.log({ keyPath, certPath, cached }); }
  else if (cmd === 'install') console.log(installCa());
  else if (cmd === 'uninstall') { console.error('No current-process ownership receipt. Use capture-credentials.mjs --recover for transaction-owned CA cleanup.'); process.exitCode = 1; }
  else if (cmd === 'status') { const result = queryCa(arg); console.log({ path: CA_CRT, exists: fs.existsSync(CA_CRT), ...result }); if (result.status === 'ERROR') process.exitCode = 1; }
  else console.log('usage: mitm-ca.mjs init [--force] | leaf <host> | install | uninstall | status');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
