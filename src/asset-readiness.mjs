import fs from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
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
function inspect(root, entry, { includeBytes = false } = {}) {
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
    return { ...metadata, status: 'PRESENT', reason: null, ...(includeBytes ? { bytes } : {}) };
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

function readinessEntry(entry, observed) {
  let reason = observed.reason;
  if (!reason && !reference(entry.source)) reason = 'ASSET_SOURCE_UNKNOWN';
  else if (!reason && (!digest(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size <= 0)) reason = 'ASSET_BASELINE_UNKNOWN';
  else if (!reason && (entry.sha256 !== observed.sha256 || entry.size !== observed.size)) reason = 'ASSET_HASH_MISMATCH';
  return { ...publicEntry(entry), status: reason ? 'BLOCKED' : 'READY', reason,
    expectedSha256: digest(entry.sha256) ? entry.sha256 : null, actualSha256: observed.sha256 ?? null, size: observed.size ?? null };
}

/** READY means specified local assets match a preserved manifest, not that all game semantics are proven. */
export function assetReadinessReport(manifest, { root } = {}) {
  if (manifest?.schemaVersion !== 1) return { status: 'BLOCKED', ready: false, reason: 'MANIFEST_VERSION_UNKNOWN', assets: [] };
  validateList(root, manifest.assets);
  const assets = manifest.assets.map(entry => readinessEntry(entry, inspect(root, entry)));
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

function readRuntimeManifest(root) {
  const failure=reason=>{throw Object.assign(new Error('运行资产清单不可用：'+reason),{code:'ASSET_UNAVAILABLE',reason});};
  if(typeof root!=='string'||!path.isAbsolute(root))failure('MANIFEST_ROOT_INVALID');
  try {
    const directory=path.join(root,'docs'),file=path.join(directory,'RUNTIME_ASSETS.json');
    if(fs.lstatSync(directory).isSymbolicLink()||fs.lstatSync(file).isSymbolicLink())failure('MANIFEST_LINK_NOT_ALLOWED');
    const before=fs.statSync(file);
    if(!before.isFile())failure('MANIFEST_NOT_FILE');
    const bytes=fs.readFileSync(file),after=fs.statSync(file);
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino||bytes.length!==after.size)failure('MANIFEST_CHANGED_DURING_READ');
    const manifest=JSON.parse(bytes.toString('utf8'));
    if(manifest?.schemaVersion!==1)failure('MANIFEST_VERSION_UNKNOWN');
    validateList(root,manifest.assets);
    return manifest;
  }catch(error){
    if(error?.code==='ASSET_UNAVAILABLE')throw error;
    failure(error?.code==='ENOENT'?'MANIFEST_MISSING':'MANIFEST_INVALID_OR_UNREADABLE');
  }
}

/** Read the exact bytes validated against the retained baseline. Other missing
 * assets do not block this role; bytes are never re-opened after validation. */
export function readRuntimeAsset(role, relativePath, {root=path.resolve(import.meta.dirname,'..')}={}) {
  if(!Object.hasOwn(allowed,role)||typeof relativePath!=='string'||!allowed[role].test(relativePath))
    throw Object.assign(new Error('运行资产路径未登记'),{code:'ASSET_UNAVAILABLE',reason:'ASSET_PATH_NOT_ALLOWED'});
  const manifest=readRuntimeManifest(root),entry=manifest.assets.find(row=>row.role===role&&row.path===relativePath);
  if(!entry)throw Object.assign(new Error('运行资产缺少保留基线'),{code:'ASSET_UNAVAILABLE',reason:'ASSET_NOT_REGISTERED'});
  const observed=inspect(root,entry,{includeBytes:true}),checked=readinessEntry(entry,observed);
  if(checked.status!=='READY')throw Object.assign(new Error('运行资产校验未通过：'+checked.reason),{code:'ASSET_UNAVAILABLE',reason:checked.reason});
  return observed.bytes;
}

function retainedArchive(value) {
  return value?.path==='work/runtime-assets.cwassets.gz' && digest(value.sha256) && Number.isSafeInteger(value.size) && value.size>0
    ? {path:value.path,sha256:value.sha256,size:value.size,status:'RETAINED_RECORD_ONLY'} : null;
}

/** Read-only diagnosis never restores, discovers or executes assets. */
export function runtimeAssetReadiness({root=path.resolve(import.meta.dirname,'..')}={}) {
  try {
    const manifest=readRuntimeManifest(root),report=assetReadinessReport(manifest,{root});
    return {...report,...(retainedArchive(manifest.recoveryArchive)?{recoveryArchive:retainedArchive(manifest.recoveryArchive)}:{}),provenanceNote:reference(manifest.provenanceNote)?manifest.provenanceNote:null,recovery:assetRecoveryInstructions(manifest)};
  }catch(error){return {status:'BLOCKED',ready:false,reason:error?.reason??'MANIFEST_INVALID_OR_UNREADABLE',assets:[],recovery:[]};}
}

const ARCHIVE_LIMIT = 128 * 1024 * 1024;
const archiveFail = reason => Object.assign(new Error('离线资产归档不可用：'+reason), {code:'ASSET_ARCHIVE_UNAVAILABLE',reason});
const archiveIdentity = entry => ({...publicEntry(entry),source:entry.source??null,sha256:entry.sha256??null,size:entry.size??null,...(entry.requiredTables?{requiredTables:[...entry.requiredTables]}:{})});
function archiveManifest(manifest,root) {
  if(manifest?.schemaVersion!==1)throw archiveFail('MANIFEST_VERSION_UNKNOWN');
  validateList(root,manifest.assets);
  return manifest.assets.map(archiveIdentity);
}

/** Retain only hash-verified declared files. Missing entries remain explicit gaps;
 * this archive preserves the local baseline, never invents an upstream version. */
export function createRuntimeAssetArchive({root=path.resolve(import.meta.dirname,'..')}={}) {
  const manifest=readRuntimeManifest(root),assets=archiveManifest(manifest,root),files=[],missing=[];
  for(const entry of manifest.assets){
    const observed=inspect(root,entry,{includeBytes:true}),checked=readinessEntry(entry,observed);
    if(checked.status==='READY')files.push({path:entry.path,base64:observed.bytes.toString('base64')});
    else missing.push({path:entry.path,reason:checked.reason});
  }
  if(!files.length)throw archiveFail('NO_VERIFIED_ASSETS');
  const json=Buffer.from(JSON.stringify({schemaVersion:1,kind:'CRAZYWATER_RUNTIME_ASSETS',assets,files,missing}));
  if(json.length>ARCHIVE_LIMIT)throw archiveFail('ARCHIVE_TOO_LARGE');
  const bytes=gzipSync(json,{level:9});
  return {bytes,report:{schemaVersion:1,sha256:hash(bytes),size:bytes.length,archived:files.map(row=>row.path),missing,complete:missing.length===0,upstreamProvenance:'UNCHANGED_FROM_PRESERVED_MANIFEST'}};
}

/** Validate against the independently retained manifest before exposing bytes.
 * The embedded manifest cannot grant paths, change hashes or add sources. */
export function inspectRuntimeAssetArchive(bytes,{root=path.resolve(import.meta.dirname,'..')}={}) {
  const manifest=readRuntimeManifest(root),expected=archiveManifest(manifest,root),record=retainedArchive(manifest.recoveryArchive);
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>ARCHIVE_LIMIT)throw archiveFail('ARCHIVE_SIZE_INVALID');
  if(record&&(record.size!==bytes.length||record.sha256!==hash(bytes)))throw archiveFail('ARCHIVE_HASH_MISMATCH');
  let data;
  try{data=JSON.parse(gunzipSync(bytes,{maxOutputLength:ARCHIVE_LIMIT}).toString('utf8'));}catch{throw archiveFail('ARCHIVE_INVALID');}
  if(data?.schemaVersion!==1||data?.kind!=='CRAZYWATER_RUNTIME_ASSETS'||JSON.stringify(data.assets)!==JSON.stringify(expected)
      ||!Array.isArray(data.files)||!Array.isArray(data.missing)||!data.files.length)throw archiveFail('ARCHIVE_MANIFEST_MISMATCH');
  const seen=new Set(),files=[];
  for(const row of data.files){
    const entry=expected.find(entry=>entry.path===row?.path);
    if(!entry||seen.has(row.path)||!reference(entry.source)||!digest(entry.sha256)||!Number.isSafeInteger(entry.size)||entry.size<1
        ||typeof row.base64!=='string'||row.base64.length!==4*Math.ceil(entry.size/3))throw archiveFail('ARCHIVE_ENTRY_INVALID');
    const content=Buffer.from(row.base64,'base64');
    if(content.toString('base64')!==row.base64||content.length!==entry.size||hash(content)!==entry.sha256)throw archiveFail('ARCHIVE_ENTRY_HASH_MISMATCH');
    seen.add(row.path);files.push({path:row.path,bytes:content});
  }
  for(const row of data.missing){
    if(!expected.some(entry=>entry.path===row?.path)||seen.has(row.path)||!reference(row.reason))throw archiveFail('ARCHIVE_GAP_INVALID');
    seen.add(row.path);
  }
  if(seen.size!==expected.length)throw archiveFail('ARCHIVE_COVERAGE_INVALID');
  return {files,report:{schemaVersion:1,sha256:hash(bytes),size:bytes.length,archived:files.map(row=>row.path),missing:structuredClone(data.missing),complete:data.missing.length===0,upstreamProvenance:'UNCHANGED_FROM_PRESERVED_MANIFEST'}};
}

/** Restore only missing declared files. Preflight every destination before any
 * write; preserve conflicts, original manifest, account data and all other files.
 * Interrupted new-file writes remain visible and cannot be silently overwritten. */
export function restoreRuntimeAssetArchive(bytes,{root=path.resolve(import.meta.dirname,'..')}={}) {
  const checked=inspectRuntimeAssetArchive(bytes,{root}),pending=[],present=[];
  for(const row of checked.files){
    const segments=row.path.split('/');let current=root,exists=true;
    for(let index=0;index<segments.length;index++){
      current=path.join(current,segments[index]);
      let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT'){exists=false;continue;}throw archiveFail('RESTORE_PATH_UNREADABLE');}
      if(stat.isSymbolicLink()||(index<segments.length-1?!stat.isDirectory():!stat.isFile()))throw archiveFail('RESTORE_PATH_CONFLICT');
    }
    if(exists){if(!fs.readFileSync(current).equals(row.bytes))throw archiveFail('RESTORE_FILE_CONFLICT');present.push(row.path);}
    else pending.push(row);
  }
  const restored=[];
  for(const row of pending){
    const segments=row.path.split('/');let current=root;
    for(const segment of segments.slice(0,-1)){
      current=path.join(current,segment);
      try{fs.mkdirSync(current);}catch(error){if(error.code!=='EEXIST')throw archiveFail('RESTORE_DIRECTORY_FAILED');}
      const stat=fs.lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw archiveFail('RESTORE_PATH_CONFLICT');
    }
    let descriptor;
    try{descriptor=fs.openSync(path.join(root,row.path),'wx');fs.writeFileSync(descriptor,row.bytes);fs.fsyncSync(descriptor);}
    catch{throw archiveFail('RESTORE_WRITE_FAILED');}
    finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
    restored.push(row.path);
  }
  return {...checked.report,restored,present,readiness:runtimeAssetReadiness({root})};
}

/** Fixed offline CLI entry: no caller-supplied paths and no overwrite. */
export function runtimeAssetArchive(action,{root=path.resolve(import.meta.dirname,'..')}={}) {
  if(typeof root!=='string'||!path.isAbsolute(root))throw archiveFail('ARCHIVE_ROOT_INVALID');
  if(!['archive','verify','restore'].includes(action))throw archiveFail('ARCHIVE_ACTION_INVALID');
  const directory=path.join(root,'work'),relative='work/runtime-assets.cwassets.gz',file=path.join(root,relative);
  let stat;
  try{stat=fs.lstatSync(directory);}catch{throw archiveFail('ARCHIVE_DIRECTORY_MISSING');}
  if(stat.isSymbolicLink()||!stat.isDirectory())throw archiveFail('ARCHIVE_PATH_CONFLICT');
  if(action==='archive'){
    const result=createRuntimeAssetArchive({root});
    let descriptor;
    try{descriptor=fs.openSync(file,'wx');fs.writeFileSync(descriptor,result.bytes);fs.fsyncSync(descriptor);}
    catch(error){throw archiveFail(error.code==='EEXIST'?'ARCHIVE_ALREADY_EXISTS':'ARCHIVE_WRITE_FAILED');}
    finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
    return {...result.report,path:relative};
  }
  try{
    const before=fs.lstatSync(file);if(before.isSymbolicLink()||!before.isFile())throw archiveFail('ARCHIVE_PATH_CONFLICT');
    if(before.size>ARCHIVE_LIMIT)throw archiveFail('ARCHIVE_SIZE_INVALID');
    const bytes=fs.readFileSync(file),after=fs.lstatSync(file);
    if(before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||bytes.length!==after.size)throw archiveFail('ARCHIVE_CHANGED_DURING_READ');
    return {...(action==='verify'?inspectRuntimeAssetArchive(bytes,{root}).report:restoreRuntimeAssetArchive(bytes,{root})),path:relative};
  }catch(error){if(error.code==='ASSET_ARCHIVE_UNAVAILABLE')throw error;throw archiveFail('ARCHIVE_UNREADABLE');}
}
