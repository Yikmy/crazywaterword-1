import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAssetManifest, assetReadinessReport, assetRecoveryInstructions } from '../src/asset-readiness.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-asset-readiness-'));
  const assets = [
    { id: 'protocol-v76', role: 'protocol', path: 'work/extracted/_src_chunks_/src/chunks/game.js', source: 'synthetic retained bundle v76' },
    { id: 'config-cn', role: 'config', path: 'work/cdn/config_cn_pack.json', source: 'synthetic retained config', requiredTables: ['ResourceCfg'] },
    { id: 'map-1', role: 'map', path: 'work/cdn/world_map.world_map1.json', source: 'synthetic retained map scenario 1' },
  ];
  const contents = ['// chunks:///_virtual/proto-bundle.js\nthrow Error("must never execute assets");',
    JSON.stringify([[1, 'ResourceCfg', { data: [{ id: 'GOLD' }] }]]),
    JSON.stringify([null, null, null, null, null, [[null, null, { mapInfo: { width: 1, height: 1 }, mapData: [0] }]]])];
  const write = (index, value) => { const file = path.join(root, assets[index].path); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  contents.forEach((value, index) => write(index, value));
  return { root, assets, write, manifest: () => createAssetManifest({ root, assets }), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('explicit retained protocol/config/map manifest is reproducible and checking never executes bundle code', () => {
  const f = fixture();
  try {
    const manifest = f.manifest(), original = JSON.stringify(manifest);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.assets.length, 3);
    for (const row of manifest.assets) assert.equal(row.sha256, createHash('sha256').update(fs.readFileSync(path.join(f.root, row.path))).digest('hex'));
    assert.deepEqual(f.manifest(), manifest);
    const report = assetReadinessReport(manifest, { root: f.root });
    assert.equal(report.ready, true); assert.deepEqual(report.assets.map(row => row.status), ['READY', 'READY', 'READY']);
    assert.equal(JSON.stringify(manifest), original);
    assert.equal(JSON.stringify(report).includes(f.root), false);
    assert.equal(JSON.stringify(report).includes('must never execute'), false);
  } finally { f.cleanup(); }
});

test('missing or mutated required asset blocks readiness without silently refreshing its baseline', () => {
  const f = fixture();
  try {
    const manifest = f.manifest(), expected = manifest.assets[1].sha256;
    f.write(1, JSON.stringify([[1, 'ResourceCfg', { data: [{ id: 'CHANGED' }] }]]));
    let report = assetReadinessReport(manifest, { root: f.root });
    assert.equal(report.ready, false); assert.equal(report.assets[1].reason, 'ASSET_HASH_MISMATCH');
    assert.equal(manifest.assets[1].sha256, expected);
    fs.unlinkSync(path.join(f.root, f.assets[2].path));
    report = assetReadinessReport(manifest, { root: f.root });
    assert.equal(report.assets[2].reason, 'ASSET_MISSING');
  } finally { f.cleanup(); }
});

test('malformed JSON, missing configuration tables and absent protocol module do not become ready', () => {
  for (const [index, bad, reason] of [[1, '{bad-json', 'ASSET_JSON_INVALID'], [1, '[]', 'CONFIG_TABLES_INVALID'],
    [1, JSON.stringify([[1, 'ResourceCfg', { data: null }]]), 'CONFIG_TABLES_INVALID'],
    [1, JSON.stringify([[1, 'OtherCfg', { data: [] }]]), 'CONFIG_TABLES_INVALID'],
    [0, '// no protocol module', 'PROTOCOL_MODULE_MISSING'], [2, '{}', 'MAP_DATA_INVALID']]) {
    const f = fixture();
    try {
      const manifest = f.manifest(); f.write(index, bad);
      const report = assetReadinessReport(manifest, { root: f.root });
      assert.equal(report.ready, false); assert.equal(report.assets[index].reason, reason);
      assert.equal(f.manifest().assets[index].sha256, null);
    } finally { f.cleanup(); }
  }
});

test('asset origin and preserved digest are mandatory and optional assets do not hide required failures', () => {
  const f = fixture();
  try {
    const manifest = f.manifest();
    manifest.assets[0].source = null;
    assert.equal(assetReadinessReport(manifest, { root: f.root }).assets[0].reason, 'ASSET_SOURCE_UNKNOWN');
    manifest.assets[0].source = 'synthetic retained'; manifest.assets[0].sha256 = null;
    assert.equal(assetReadinessReport(manifest, { root: f.root }).assets[0].reason, 'ASSET_BASELINE_UNKNOWN');
    const optional = f.manifest(); optional.assets[2].required = false;
    fs.unlinkSync(path.join(f.root, f.assets[2].path));
    assert.equal(assetReadinessReport(optional, { root: f.root }).ready, true);
    fs.unlinkSync(path.join(f.root, f.assets[1].path));
    assert.equal(assetReadinessReport(optional, { root: f.root }).ready, false);
  } finally { f.cleanup(); }
});

test('asset descriptors reject traversal, arbitrary account paths, absolute paths and duplicates before any read', () => {
  const f = fixture();
  try {
    for (const assetPath of ['../data/accounts.json', 'data/accounts.json', 'work/cdn/config_cn_pack.json:secret', '/tmp/file', 'C:/data/accounts.json', 'work/cdn/../cdn/config_cn_pack.json'])
      assert.throws(() => createAssetManifest({ root: f.root, assets: [{ ...f.assets[1], path: assetPath }] }), TypeError);
    assert.throws(() => createAssetManifest({ root: '.', assets: f.assets }), TypeError);
    assert.throws(() => createAssetManifest({ root: f.root, assets: [f.assets[0], f.assets[0]] }), TypeError);
    assert.throws(() => createAssetManifest({ root: f.root, assets: [] }), TypeError);
    assert.deepEqual(assetReadinessReport({ schemaVersion: 2 }, { root: f.root }), { status: 'BLOCKED', ready: false, reason: 'MANIFEST_VERSION_UNKNOWN', assets: [] });
  } finally { f.cleanup(); }
});

test('recovery guide binds retained source and digest without performing restoration or changing files', () => {
  const f = fixture();
  try {
    const manifest = f.manifest(), guide = assetRecoveryInstructions(manifest);
    assert.equal(guide.length, 3);
    assert.equal(guide[0].source, manifest.assets[0].source);
    assert.equal(guide[0].expectedSha256, manifest.assets[0].sha256);
    assert.equal(guide.every(row => row.steps.some(step => step.includes('do not search account/token caches'))), true);
    assert.deepEqual(f.manifest(), manifest);
  } finally { f.cleanup(); }
});


test('map readiness requires the complete grid shape consumed by loadMapAsset', () => {
  const f = fixture();
  try {
    const manifest = f.manifest();
    f.write(2, JSON.stringify([null, null, null, null, null, [[null, null, { mapInfo: { width: 2, height: 1 }, mapData: [0] }]]]));
    assert.equal(assetReadinessReport(manifest, { root: f.root }).assets[2].reason, 'MAP_DATA_INVALID');
  } finally { f.cleanup(); }
});

test('directory links cannot redirect explicit asset inspection outside the declared root', () => {
  const f = fixture(), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-asset-link-'));
  try {
    const manifest = f.manifest(), directory = path.join(f.root, 'work', 'cdn'), retained = path.join(outside, 'retained');
    fs.renameSync(directory, retained);
    fs.symlinkSync(retained, directory, process.platform === 'win32' ? 'junction' : 'dir');
    const report = assetReadinessReport(manifest, { root: f.root });
    assert.equal(report.assets[1].reason, 'ASSET_LINK_NOT_ALLOWED');
    assert.equal(report.assets[2].reason, 'ASSET_LINK_NOT_ALLOWED');
    fs.unlinkSync(directory);
  } finally { f.cleanup(); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('capturing a missing asset retains the concrete missing-file reason during readiness', () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.root, f.assets[2].path));
    const manifest = f.manifest();
    assert.equal(manifest.assets[2].sha256, null);
    assert.equal(assetReadinessReport(manifest, { root: f.root }).assets[2].reason, 'ASSET_MISSING');
  } finally { f.cleanup(); }
});
