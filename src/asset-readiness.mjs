import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractTables } from './config.mjs';

const allowed = {
  protocol: /^work\/extracted\/_src_chunks_\/src\/chunks\/game\.js$/,
  config: /^work\/cdn\/config_cn_pack\.json$/,
  map: /^work\/cdn\/world_map\.world_map[1-9]\d*\.json$/,
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const reference = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\r\n]/.test(value);
const publicEntry = entry => ({ id: entry?.id, role: entry?.role, path: entry?.path, required: entry?.required !== false });
function validEntry(entry) {
  return reference(entry?.id) && Object.hasOwn(allowed, entry?.role) && typeof entry.path === 'string'
    && allowed[entry.role].test(entry.path) && (entry.required === undefined || typeof entry.required === 'boolean')
    && (entry.requiredTables === undefined || entry.role === 'config' && Array.isArray(entry.requiredTables)
      && entry.requiredTables.every(name => reference(name)) && new Set(entry.requiredTables).size === entry.requiredTables.length);
}
function inspect(root, entry) {
  if (!validEntry(entry)) return { status: 'BLOCKED', reason: 'ASSET_PATH_NOT_ALLOWED' };
  const segments = entry.path.split('/');
  let current = root;
  try {
    // Never enumerate a user's caches/accounts or follow links to other directories.
    for (let i = 0; i < segments.length; i++) {
      current = path.join(current, segments[i]);
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return { status: 'BLOCKED', reason: 'ASSET_LINK_NOT_ALLOWED' };
      if (i < segments.length - 1 && !stat.isDirectory()) return { status: 'BLOCKED', reason: 'ASSET_NOT_DIRECTORY' };
      if (i === segments.length - 1 && !stat.isFile()) return { status: 'BLOCKED', reason: 'ASSET_NOT_FILE' };
    }
    const before = fs.statSync(current), bytes = fs.readFileSync(current), after = fs.statSync(current);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || bytes.length !== after.size)
      return { status: 'BLOCKED', reason: 'ASSET_CHANGED_DURING_READ' };
    const sha256 = hash(bytes), metadata = { sha256, size: bytes.length };
    if (!bytes.length) return { ...metadata, status: 'BLOCKED', reason: 'ASSET_EMPTY' };
    if (entry.role === 'protocol') {
      // Static readiness is not permission to evaluate an unverified JavaScript bundle.
      if (!bytes.toString('utf8').includes('chunks:///_virtual/proto-bundle.js')) return { ...metadata, status: 'BLOCKED', reason: 'PROTOCOL_MODULE_MISSING' };
    } else {
      let json;
      try { json = JSON.parse(bytes.toString('utf8')); } catch { return { ...metadata, status: 'BLOCKED', reason: 'ASSET_JSON_INVALID' }; }
      if (entry.role === 'config') {
        const tables = extractTables(json), names = Object.keys(tables);
        if (!names.length || names.some(name => !Array.isArray(tables[name]?.data))
            || (entry.requiredTables ?? []).some(name => !Array.isArray(tables[name]?.data)))
          return { ...metadata, status: 'BLOCKED', reason: 'CONFIG_TABLES_INVALID' };
      } else {
        const data = json?.[5]?.[0]?.[2], width = data?.mapInfo?.width, height = data?.mapInfo?.height;
        if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0
            || !Number.isSafeInteger(width * height) || !Array.isArray(data?.mapData) || data.mapData.length !== width * height
            || data.mapData.some(value => !Number.isSafeInteger(value) || value < 0))
          return { ...metadata, status: 'BLOCKED', reason: 'MAP_DATA_INVALID' };
      }
    }
    return { ...metadata, status: 'PRESENT', reason: null };
  } catch (error) {
    // Fixed reason codes deliberately omit OS messages, absolute paths and file contents.
    return { status: 'BLOCKED', reason: error?.code === 'ENOENT' ? 'ASSET_MISSING' : 'ASSET_UNREADABLE' };
  }
}
function validateList(root, assets) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError('Asset root must be explicit and absolute');
  if (!Array.isArray(assets) || !assets.length || assets.some(entry => !validEntry(entry))
      || new Set(assets.map(entry => entry.id)).size !== assets.length || new Set(assets.map(entry => entry.path)).size !== assets.length)
    throw new TypeError('Asset manifest requires unique explicit protocol/config/map paths');
}

/** Capture only caller-declared runtime assets. It does not discover caches, fetch or write files.
 * source is a retained provenance reference, not an implicit online download instruction.
 * Review/preserve the returned manifest before using it as the baseline for a later readiness check.
 */
export function createAssetManifest({ root, assets } = {}) {
  validateList(root, assets);
  return { schemaVersion: 1, assets: assets.map(entry => {
    const observed = inspect(root, entry);
    return { ...publicEntry(entry), source: reference(entry.source) ? entry.source : null,
      sha256: observed.status === 'PRESENT' ? observed.sha256 : null,
      size: observed.status === 'PRESENT' ? observed.size : null,
      ...(entry.requiredTables ? { requiredTables: [...entry.requiredTables] } : {}) };
  }) };
}

/** READY means specified local assets match a preserved manifest, not that all game semantics are proven. */
export function assetReadinessReport(manifest, { root } = {}) {
  if (manifest?.schemaVersion !== 1) return { status: 'BLOCKED', ready: false, reason: 'MANIFEST_VERSION_UNKNOWN', assets: [] };
  validateList(root, manifest.assets);
  const assets = manifest.assets.map(entry => {
    const observed = inspect(root, entry);
    let reason = observed.reason;
    if (!reason && !reference(entry.source)) reason = 'ASSET_SOURCE_UNKNOWN';
    else if (!reason && (!digest(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size <= 0)) reason = 'ASSET_BASELINE_UNKNOWN';
    else if (!reason && (entry.sha256 !== observed.sha256 || entry.size !== observed.size)) reason = 'ASSET_HASH_MISMATCH';
    return { ...publicEntry(entry), status: reason ? 'BLOCKED' : 'READY', reason,
      expectedSha256: digest(entry.sha256) ? entry.sha256 : null, actualSha256: observed.sha256 ?? null, size: observed.size ?? null };
  });
  const ready = assets.every(entry => !entry.required || entry.status === 'READY');
  return { status: ready ? 'READY' : 'BLOCKED', ready, assets };
}

/** Data for the product recovery guide. Recovery is manual; no fetch, execution or credential access occurs. */
export function assetRecoveryInstructions(manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.assets)) return [];
  return manifest.assets.filter(validEntry).map(entry => ({ ...publicEntry(entry),
    source: reference(entry.source) ? entry.source : null, expectedSha256: digest(entry.sha256) ? entry.sha256 : null,
    steps: ['Restore this exact relative path from the retained source without changing the preserved manifest.',
      'Verify the expected SHA-256 and format with assetReadinessReport before loading protocol/config/map assets.',
      'If the source or digest is unavailable, keep the affected capability blocked; do not search account/token caches or fetch automatically.'] }));
}
