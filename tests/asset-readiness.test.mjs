import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createAssetManifest, assetReadinessReport, assetRecoveryInstructions, runtimeAssetReadiness, readRuntimeAsset } from '../src/asset-readiness.mjs';

import { loadConfig, loadTables } from '../src/config.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { loadMapAsset } from '../src/world.mjs';

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

test('fixed runtime manifest reports retained baselines without rewriting or discovering a missing map',()=>{
 const f=fixture();try{const manifest=f.manifest();fs.mkdirSync(path.join(f.root,'docs'));const file=path.join(f.root,'docs','RUNTIME_ASSETS.json'),bytes=JSON.stringify({...manifest,provenanceNote:'Synthetic retained baseline; upstream version unknown'});fs.writeFileSync(file,bytes);
 assert.equal(runtimeAssetReadiness({root:f.root}).ready,true);fs.unlinkSync(path.join(f.root,f.assets[2].path));const report=runtimeAssetReadiness({root:f.root});assert.equal(report.ready,false);assert.equal(report.assets[2].reason,'ASSET_MISSING');assert.equal(report.recovery[2].expectedSha256,manifest.assets[2].sha256);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(JSON.stringify(report).includes(f.root),false);
 }finally{f.cleanup();}
});
test('missing invalid or unsupported runtime manifest gives a fixed blocked reason without raw errors',()=>{
 const f=fixture();try{
 assert.equal(runtimeAssetReadiness({root:'.'}).reason,'MANIFEST_ROOT_INVALID');assert.equal(runtimeAssetReadiness({root:f.root}).reason,'MANIFEST_MISSING');
 fs.mkdirSync(path.join(f.root,'docs'));const file=path.join(f.root,'docs','RUNTIME_ASSETS.json');
 for(const value of ['{secret-parser-input',JSON.stringify({schemaVersion:1,assets:[{id:'x',role:'config',path:'data/accounts.json'}]})]){fs.writeFileSync(file,value);const report=runtimeAssetReadiness({root:f.root});assert.equal(report.reason,'MANIFEST_INVALID_OR_UNREADABLE');assert.deepEqual(report.assets,[]);assert.equal(JSON.stringify(report).includes(f.root),false);assert.equal(JSON.stringify(report).includes('secret-parser-input'),false);}
 fs.writeFileSync(file,JSON.stringify({schemaVersion:2}));assert.equal(runtimeAssetReadiness({root:f.root}).reason,'MANIFEST_VERSION_UNKNOWN');
 }finally{f.cleanup();}
});
test('a manifest directory link is blocked without following retained files',()=>{
 const f=fixture(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'cw-manifest-link-'));try{
 fs.writeFileSync(path.join(outside,'RUNTIME_ASSETS.json'),JSON.stringify(f.manifest()));const linked=path.join(f.root,'docs');fs.symlinkSync(outside,linked,process.platform==='win32'?'junction':'dir');assert.equal(runtimeAssetReadiness({root:f.root}).reason,'MANIFEST_LINK_NOT_ALLOWED');fs.unlinkSync(linked);
 }finally{f.cleanup();fs.rmSync(outside,{recursive:true,force:true});}
});

function preserveManifest(f) {
 const manifest=f.manifest(),file=path.join(f.root,'docs','RUNTIME_ASSETS.json');
 fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,JSON.stringify(manifest));
 return {manifest,file,bytes:fs.readFileSync(file,'utf8')};
}
const syntheticProtocol = [
 "define('src/chunks/bundle.synthetic.js',function(require,module,exports){",
 "System.register([],function(){return {execute(){",
 "System.register('chunks:///_virtual/proto-bundle.js',['helpers','protobuf'],function(exportValue){",
 "return {setters:[()=>{},()=>{}],execute(){exportValue('protocol',{SyntheticMessage:{retained:true}});}};",
 "});",
 "}};});",
 "});"
].join('\n');

test('protocol loader consumes only a matching preserved asset while unrelated missing map stays isolated',()=>{
 const f=fixture();try{
  f.write(0,syntheticProtocol);const retained=preserveManifest(f);fs.unlinkSync(path.join(f.root,f.assets[2].path));
  const protocol=loadProtocol(path.join(f.root,f.assets[0].path),{root:f.root});
  assert.deepEqual(protocol,{SyntheticMessage:{retained:true}});
  assert.equal(runtimeAssetReadiness({root:f.root}).ready,false);
  assert.equal(fs.readFileSync(retained.file,'utf8'),retained.bytes);
  assert.equal(loadMapAsset(1,{root:f.root}),null);
 }finally{f.cleanup();}
});

test('tampered protocol cannot execute even its top-level code before digest verification',()=>{
 const f=fixture();try{
  f.write(0,syntheticProtocol);const retained=preserveManifest(f);
  globalThis.__cwUnexpectedAssetExecution=0;
  f.write(0,"globalThis.__cwUnexpectedAssetExecution++;\n"+syntheticProtocol);
  assert.throws(()=>loadProtocol(path.join(f.root,f.assets[0].path),{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_HASH_MISMATCH'});
  assert.equal(globalThis.__cwUnexpectedAssetExecution,0);
  assert.equal(fs.readFileSync(retained.file,'utf8'),retained.bytes);
 }finally{delete globalThis.__cwUnexpectedAssetExecution;f.cleanup();}
});

test('missing unregistered or source-less runtime assets cannot bypass the retained manifest',()=>{
 const f=fixture();try{
  assert.throws(()=>readRuntimeAsset('protocol',f.assets[0].path,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'MANIFEST_MISSING'});
  const retained=preserveManifest(f);
  for(const [role,relativePath] of [['protocol','data/accounts.json'],['config','../config.json'],['__proto__',f.assets[0].path]])
   assert.throws(()=>readRuntimeAsset(role,relativePath,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_PATH_NOT_ALLOWED'});
  assert.throws(()=>readRuntimeAsset('map','work/cdn/world_map.world_map2.json',{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_NOT_REGISTERED'});
  const manifest=structuredClone(retained.manifest);manifest.assets[0].source=null;fs.writeFileSync(retained.file,JSON.stringify(manifest));
  assert.throws(()=>readRuntimeAsset('protocol',f.assets[0].path,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_SOURCE_UNKNOWN'});
  manifest.assets[0].source='synthetic retained';manifest.assets[0].sha256=null;fs.writeFileSync(retained.file,JSON.stringify(manifest));
  assert.throws(()=>readRuntimeAsset('protocol',f.assets[0].path,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_BASELINE_UNKNOWN'});
  manifest.schemaVersion=2;fs.writeFileSync(retained.file,JSON.stringify(manifest));
  assert.throws(()=>readRuntimeAsset('protocol',f.assets[0].path,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'MANIFEST_VERSION_UNKNOWN'});
 }finally{f.cleanup();}
});

test('retained map loads the existing grid projection and mutated or malformed grids degrade without accepting a new baseline',()=>{
 const f=fixture();try{
  f.write(2,JSON.stringify([null,null,null,null,null,[[null,null,{mapInfo:{width:2,height:1},cityInfo:[{cityId:17}],mapData:[10017,0]}]]]));
  const retained=preserveManifest(f),map=loadMapAsset(1,{root:f.root});
  assert.equal(map.width,2);assert.equal(map.height,1);assert.equal(map.scenarioId,1);assert.equal(map.fieldCount,1);
  assert.deepEqual(map.fieldAt(0),{gridIdx:0,resType:1,cityId:17});assert.equal(map.fieldAt(1),null);
  assert.equal(map.file,path.join(f.root,f.assets[2].path));
  for(const value of ['{bad',JSON.stringify([null,null,null,null,null,[[null,null,{mapInfo:{width:2,height:1},mapData:[0]}]]]),JSON.stringify([null,null,null,null,null,[[null,null,{mapInfo:{width:2,height:1},mapData:[20017,0]}]]])]){
   f.write(2,value);assert.equal(loadMapAsset(1,{root:f.root}),null);
  }
  assert.equal(fs.readFileSync(retained.file,'utf8'),retained.bytes);
  assert.equal(loadMapAsset(2,{root:f.root}),null);
 }finally{f.cleanup();}
});

test('runtime consumption never follows asset or manifest links',()=>{
 const f=fixture(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'cw-runtime-asset-link-'));try{
  f.write(0,syntheticProtocol);const retained=preserveManifest(f),directory=path.join(f.root,'work','cdn'),moved=path.join(outside,'cdn');
  fs.renameSync(directory,moved);fs.symlinkSync(moved,directory,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>readRuntimeAsset('config',f.assets[1].path,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_LINK_NOT_ALLOWED'});
  assert.equal(loadMapAsset(1,{root:f.root}),null);fs.unlinkSync(directory);
  const docs=path.join(f.root,'docs'),movedDocs=path.join(outside,'docs');fs.renameSync(docs,movedDocs);fs.symlinkSync(movedDocs,docs,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>loadProtocol(path.join(f.root,f.assets[0].path),{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'MANIFEST_LINK_NOT_ALLOWED'});
  assert.equal(fs.readFileSync(path.join(movedDocs,'RUNTIME_ASSETS.json'),'utf8'),retained.bytes);fs.unlinkSync(docs);
 }finally{f.cleanup();fs.rmSync(outside,{recursive:true,force:true});}
});

test('protocol loader executes its checked buffer even when the file changes immediately after the final stat',()=>{
 const f=fixture();const stat=fs.statSync,read=fs.readFileSync;try{
  f.write(0,syntheticProtocol);preserveManifest(f);const file=path.join(f.root,f.assets[0].path);let stats=0,reads=0;
  globalThis.__cwUnexpectedAssetExecution=0;
  fs.readFileSync=function(p,...args){if(p===file)reads++;return read.call(this,p,...args);};
  fs.statSync=function(p,...args){const value=stat.call(this,p,...args);if(p===file&&++stats===2)fs.writeFileSync(file,"globalThis.__cwUnexpectedAssetExecution++;\n"+syntheticProtocol);return value;};
  const protocol=loadProtocol(file,{root:f.root});
  assert.equal(protocol.SyntheticMessage.retained,true);assert.equal(reads,1);assert.equal(globalThis.__cwUnexpectedAssetExecution,0);
  fs.statSync=stat;fs.readFileSync=read;
  assert.throws(()=>loadProtocol(file,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_HASH_MISMATCH'});
 }finally{fs.statSync=stat;fs.readFileSync=read;delete globalThis.__cwUnexpectedAssetExecution;f.cleanup();}
});

test('default retained configuration consumes the same manifest bytes and stays independent of a missing map',()=>{
 const f=fixture();try{
  const retained=preserveManifest(f);fs.unlinkSync(path.join(f.root,f.assets[2].path));
  assert.deepEqual(loadTables(path.join(f.root,f.assets[1].path),{root:f.root}),{ResourceCfg:{data:[{id:'GOLD'}]}});
  const config=loadConfig({file:pathToFileURL(path.join(f.root,f.assets[1].path)),root:f.root});
  assert.deepEqual(config.names,['ResourceCfg']);assert.equal(config.resourceId(3),'GOLD');
  f.write(1,JSON.stringify([[1,'ResourceCfg',{data:[{id:'RUBY'}]}]]));
  assert.throws(()=>loadTables(path.join(f.root,f.assets[1].path),{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_HASH_MISMATCH'});
  assert.equal(fs.readFileSync(retained.file,'utf8'),retained.bytes);
 }finally{f.cleanup();}
});

test('runtime config never falls back to enumerating user caches, including an unavailable explicit source',()=>{
 const f=fixture(),readdir=fs.readdirSync,previous=process.env.CW_CONFIG_PACK;try{
  preserveManifest(f);delete process.env.CW_CONFIG_PACK;
  fs.readdirSync=()=>{throw Error('User cache enumeration forbidden');};
  assert.deepEqual(loadTables(undefined,{root:f.root}),{ResourceCfg:{data:[{id:'GOLD'}]}});
  process.env.CW_CONFIG_PACK=path.join(f.root,'explicit-missing.json');
  assert.throws(()=>loadTables(undefined,{root:f.root}),{code:'ENOENT'});
  delete process.env.CW_CONFIG_PACK;fs.unlinkSync(path.join(f.root,f.assets[1].path));
  assert.throws(()=>loadTables(undefined,{root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_MISSING'});
 }finally{fs.readdirSync=readdir;if(previous===undefined)delete process.env.CW_CONFIG_PACK;else process.env.CW_CONFIG_PACK=previous;f.cleanup();}
});

test('explicit config imports remain available while retained file aliases cannot bypass its digest',()=>{
 const f=fixture();try{
  preserveManifest(f);const explicit=path.join(f.root,'explicit-import.json');
  fs.writeFileSync(explicit,JSON.stringify([[1,'ResourceCfg',{data:[{id:'GOLD',show_name:'Explicit Gold'}]}]]));
  assert.equal(loadConfig({file:explicit,root:f.root}).resourceName(3),'Explicit Gold');
  f.write(1,JSON.stringify([[1,'ResourceCfg',{data:[{id:'GOLD',show_name:'Tampered'}]}]]));
  assert.throws(()=>loadConfig({file:path.join(f.root,'work','cdn','..','cdn','config_cn_pack.json'),root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_HASH_MISMATCH'});
  assert.throws(()=>loadConfig({file:pathToFileURL(path.join(f.root,f.assets[1].path)),root:f.root}),{code:'ASSET_UNAVAILABLE',reason:'ASSET_HASH_MISMATCH'});
 }finally{f.cleanup();}
});

test('config consumes a checked buffer without reopening a replaced retained file',()=>{
 const f=fixture(),stat=fs.statSync,read=fs.readFileSync;try{
  preserveManifest(f);const file=path.join(f.root,f.assets[1].path);let stats=0,reads=0;
  fs.readFileSync=function(p,...args){if(p===file)reads++;return read.call(this,p,...args);};
  fs.statSync=function(p,...args){const value=stat.call(this,p,...args);if(p===file&&++stats===2)fs.writeFileSync(file,JSON.stringify([[1,'ResourceCfg',{data:[{id:'RUBY'}]}]]));return value;};
  assert.deepEqual(loadTables(file,{root:f.root}),{ResourceCfg:{data:[{id:'GOLD'}]}});
  assert.equal(reads,1);
 }finally{fs.statSync=stat;fs.readFileSync=read;f.cleanup();}
});
