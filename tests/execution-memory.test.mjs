import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createExecutionMemory, executionMemoryKey, summarizeExecutionHistory } from '../src/execution-memory.mjs';
import { createStateFact, trustedGameClock } from '../src/state-facts.mjs';

const accountId = 'synthetic-memory-account', generation = 7;
const target = { buildingId: 'synthetic-fleet' }, identity = { durability: 50, autoFight: false };
const query = (extra = {}) => ({ module: 'fleet', actionType: 'fleetRepair', target, identity, ...extra });
const event = (extra = {}) => ({ ...query(), source: 'MyFleetsResponse.fleets', generation, runId: 'synthetic-run', workflowId: 'synthetic-workflow', nodeId: 'repair-node', batchId: 'synthetic-batch', actionId: 'synthetic-action', capabilityId: 'C407', status: 'REJECTED', dispatched: true, unresolvedWrite: false, reason: 'synthetic definite rejection', ...extra });
function makeClock({ account = accountId, sessionGeneration = generation, server = Date.UTC(2026, 10, 10, 15, 59, 0), rtt = 10 } = {}) {
  let wall = Date.UTC(2026, 10, 10, 15, 59, 0), mono = 10;
  const clock = trustedGameClock({ accountId: account, generation: sessionGeneration, wallNow: () => wall, monotonicNow: () => mono, maxSampleAgeMs: 400 * 86400000, maxUncertaintyMs: 1000, driftPpm: 0 });
  const clientTimestamp = wall; clock.markPing(clientTimestamp); wall += rtt; mono += rtt; clock.observePong({ clientTimestamp, serverTimestamp: server });
  return { read: () => clock.read(), wall: () => wall, advance(ms) { wall += ms; mono += ms; }, jump(ms) { wall += ms; } };
}
function fixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-execution-memory-')), file = path.join(dir, 'memory.json');
  let owner = true, wall = Date.UTC(2026, 10, 10, 15, 59, 0);
  const settings = { file, wallNow: () => wall, assertWriter() { if (!owner) throw Object.assign(Error('synthetic writer lost'), { code: 'WRITER_OWNERSHIP_LOST' }); }, ...options };
  const store = createExecutionMemory(settings);
  return { dir,file,store,settings, wall: () => wall, setWall(value) { wall = value; }, owner(value) { owner = value; }, reopen() { return createExecutionMemory(settings); }, cleanup() { assert.equal(path.dirname(dir), os.tmpdir()); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const evaluate = (f, q = query(), options = {}) => f.store.evaluate(accountId, q, { generation, ...options });
function fact(f, value = identity, options = {}) { return createStateFact(value, { accountId, generation, source: 'MyFleetsResponse.fleets', sourceAt: f.wall(), reliable: true, scope: { kind: 'ENTITY', key: executionMemoryKey(query()) }, ...options }); }

test('import and a read-only reopen create no persistence directory, runtime, authorization or executable state', () => {
  const f = fixture(); try { assert.deepEqual(f.store.list(accountId), []); assert.equal(evaluate(f).status, 'CLEAR'); assert.equal(evaluate(f).retryAllowed, false); assert.deepEqual(fs.readdirSync(f.dir), []); assert.equal(Object.hasOwn(f.store, 'resume'), false); assert.equal(Object.hasOwn(f.store, 'clear'), false); } finally { f.cleanup(); }
});

test('a definite rejection stores exact run/workflow/node/batch/action correlation without request or identity payloads', () => {
  const f = fixture(); try {
    const saved = f.store.record(accountId,event()); assert.equal(saved.status, 'REJECTED'); assert.equal(saved.workflowId,'synthetic-workflow'); assert.equal(saved.nodeId,'repair-node'); assert.equal(saved.batchId,'synthetic-batch'); assert.equal(saved.resumable,false); assert.equal(saved.retryAllowed,false);
    assert.equal(evaluate(f).status,'BLOCKED_REJECTED'); const bytes=fs.readFileSync(f.file,'utf8'); assert.equal(bytes.includes('synthetic-fleet'),false); assert.equal(bytes.includes('durability'),false); assert.deepEqual(fs.readdirSync(f.dir),['memory.json','memory.json.anchor']);
    assert.deepEqual(f.reopen().list(accountId),[saved]); assert.deepEqual(f.store.list(accountId,{runId:'other-run'}),[]);
  } finally { f.cleanup(); }
});

test('account keys including __proto__ are exact isolated data and cannot become file paths', () => {
  const f=fixture();try {
    for(const id of [accountId,'__proto__','../synthetic-account','constructor'])f.store.record(id,event());
    assert.equal(f.store.list(accountId).length,1);assert.equal(f.store.list('__proto__').length,1);assert.deepEqual(f.store.list('missing'),[]);assert.equal(f.store.list('constructor')[0].accountId,'constructor');assert.deepEqual(fs.readdirSync(f.dir),['memory.json','memory.json.anchor']);
  }finally{f.cleanup();}
});

test('stable key ignores volatile actionId and canonical object key order, while retaining target and module boundaries',()=>{
  const f=fixture();try{f.store.record(accountId,event());assert.equal(executionMemoryKey(query()),executionMemoryKey(query({target:{buildingId:'synthetic-fleet'},identity:{autoFight:false,durability:50}})));assert.equal(evaluate(f).status,'BLOCKED_REJECTED');assert.equal(evaluate(f,query({target:{buildingId:'another-fleet'}})).status,'CLEAR');assert.equal(evaluate(f,query({module:'another-module'})).status,'CLEAR');}finally{f.cleanup();}
});

test('duplicate event is idempotent across restart and changed clock, while conflicting evidence is rejected',()=>{
  const f=fixture();try{const first=f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8');f.setWall(f.wall()+86400000);assert.deepEqual(f.reopen().record(accountId,event()),first);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.throws(()=>f.store.record(accountId,event({reason:'different refusal'})),{code:'MEMORY_EVENT_CONFLICT'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);}finally{f.cleanup();}
});

test('only definite REJECTED and UNKNOWN are accepted; unresolved rejection is retained as UNKNOWN',()=>{
  const f=fixture();try{for(const status of ['SUCCESS','FAILED','RATE_LIMITED','CANCELLED','NOT_EXECUTED'])assert.throws(()=>f.store.record(accountId,event({status})),{code:'MEMORY_INVALID_INPUT'});const saved=f.store.record(accountId,event({unresolvedWrite:true}));assert.equal(saved.status,'UNKNOWN');assert.equal(saved.policy.kind,'HISTORY_RECONCILIATION');assert.equal(evaluate(f).status,'BLOCKED_UNKNOWN');assert.equal(saved.timeGate,null);}finally{f.cleanup();}
});

test('UNKNOWN blocks the whole account across target/identity/day changes and cannot be shadowed by a later rejection',()=>{
  const f=fixture(),clock=makeClock();try{f.store.record(accountId,event({status:'UNKNOWN',unresolvedWrite:true,policy:{kind:'COOLDOWN',durationMs:1}}),{clock:clock.read()});clock.advance(3*86400000);f.setWall(f.wall()+3*86400000);f.store.record(accountId,event({runId:'new-run',batchId:'new-batch',actionId:'new-action'}));const result=evaluate(f,query({target:{buildingId:'another'},identity:{durability:100}}),{clock:clock.read(),identityFact:fact(f,{durability:100}),maxFactAgeMs:1000});assert.equal(result.status,'BLOCKED_UNKNOWN');assert.equal(result.requiresHistoryReconciliation,true);assert.equal(result.origins[0].runId,'synthetic-run');assert.equal(result.origins[0].actionId,'synthetic-action');assert.equal(f.reopen().evaluate(accountId,query(),{generation,clock:clock.read()}).status,'BLOCKED_UNKNOWN');}finally{f.cleanup();}
});

test('untrusted, stale, cross-account, generation or scope mismatching identity facts cannot clear rejection memory',()=>{
  const f=fixture();try{f.store.record(accountId,event());const changed={durability:100,autoFight:false},q=query({identity:changed});for(const observation of [null,fact(f,changed,{reliable:false}),fact(f,changed,{accountId:'other'}),fact(f,changed,{generation:8}),fact(f,changed,{scope:{kind:'CURRENT_RESPONSE_ONLY',key:executionMemoryKey(query())}}),fact(f,changed,{sourceAt:f.wall()-1001}),fact(f,identity)])assert.equal(evaluate(f,q,{identityFact:observation,maxFactAgeMs:1000}).status,'BLOCKED_REJECTED');assert.equal(evaluate(f,q,{identityFact:fact(f,changed),maxFactAgeMs:1000}).status,'CLEAR');assert.equal(f.store.list(accountId).length,1);}finally{f.cleanup();}
});

test('newly proven identity invalidates earlier refusal while a refusal for the new identity still blocks',()=>{
  const f=fixture();try{const changed={durability:100,autoFight:false};f.store.record(accountId,event());f.store.record(accountId,event({runId:'another-run',batchId:'another-batch',identity:changed}));const result=evaluate(f,query({identity:changed}),{identityFact:fact(f,changed),maxFactAgeMs:1000});assert.equal(result.status,'BLOCKED_REJECTED');assert.deepEqual(result.decisions.map(row=>row.active),[false,true]);assert.equal(f.store.list(accountId).length,2);}finally{f.cleanup();}
});

test('cooldown expires only after the earliest trusted server time passes the original latest bound plus duration',()=>{
  const f=fixture(),clock=makeClock();try{const saved=f.store.record(accountId,event({policy:{kind:'COOLDOWN',durationMs:1000}}),{clock:clock.read()});assert.equal(saved.timeGate.notBeforeMs,Math.ceil(clock.read().latestMs+1000));clock.advance(1000);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'BLOCKED_REJECTED');clock.advance(13);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'CLEAR');assert.equal(f.reopen().evaluate(accountId,query(),{generation}).status,'BLOCKED_REJECTED');assert.equal(f.reopen().evaluate(accountId,query(),{generation,clock:clock.read()}).status,'CLEAR');}finally{f.cleanup();}
});

test('wall-clock edits, mismatching trusted clock context and absent original clock never age out cooldowns',()=>{
  const f=fixture(),clock=makeClock();try{f.store.record(accountId,event({policy:{kind:'COOLDOWN',durationMs:1000}}));f.setWall(f.wall()+100*86400000);clock.advance(10000);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'BLOCKED_REJECTED');const second=fixture();try{second.store.record(accountId,event({policy:{kind:'COOLDOWN',durationMs:1000}}),{clock:clock.read()});const foreign=makeClock({account:'other',server:clock.read().nowMs+10000}),retired=makeClock({sessionGeneration:8,server:clock.read().nowMs+10000});for(const value of [foreign.read(),retired.read(),{now:9999999999999}])assert.equal(evaluate(second,query(),{clock:value}).status,'BLOCKED_REJECTED');clock.jump(10000);assert.equal(clock.read().status,'UNKNOWN');assert.equal(evaluate(second,query(),{clock:clock.read()}).status,'BLOCKED_REJECTED');}finally{second.cleanup();}}finally{f.cleanup();}
});

test('explicit UTC+8 midnight remains blocked inside uncertainty and clears only in a definitely later game day',()=>{
  const f=fixture(),clock=makeClock({server:Date.UTC(2026,10,10,15,59,59,980)});try{const saved=f.store.record(accountId,event({policy:{kind:'GAME_DAY',utcOffsetMinutes:480,boundaryHour:0}}),{clock:clock.read()});assert.equal(saved.timeGate.dayKey,'2026-11-10');clock.advance(10);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'BLOCKED_REJECTED');clock.advance(20);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'CLEAR');assert.equal(f.store.list(accountId).length,1);}finally{f.cleanup();}
});

test('uncertain initial day and reversed server day cannot invent a daily reset',()=>{
  const f=fixture(),clock=makeClock({server:Date.UTC(2026,10,10,15,59,59,999)});try{const saved=f.store.record(accountId,event({policy:{kind:'GAME_DAY',utcOffsetMinutes:480,boundaryHour:0}}),{clock:clock.read()});assert.equal(saved.timeGate.dayKey,null);clock.advance(86400000);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'BLOCKED_REJECTED');const earlier=makeClock({server:Date.UTC(2026,10,9,16)});assert.equal(evaluate(f,query(),{clock:earlier.read()}).status,'BLOCKED_REJECTED');}finally{f.cleanup();}
});

test('source and reason are redacted and raw target/identity secrets are persisted only as irreversible digests',()=>{
  const secret='synthetic-sensitive-value',f=fixture({secrets:()=>[secret]});try{const saved=f.store.record(accountId,event({target:{id:secret},identity:{token:secret},source:'response '+secret,reason:'token='+secret}));const bytes=fs.readFileSync(f.file,'utf8');assert.equal(bytes.includes(secret),false);assert.match(saved.reason,/REDACTED/);assert.match(saved.source,/REDACTED/);assert.equal(bytes.includes('permit'),false);assert.equal(bytes.includes('resourceBudget'),false);}finally{f.cleanup();}
});

test('invalid transport fields, unsafe identity, missing links and invalid expiry policy never create a store',()=>{
  const f=fixture();try{for(const change of [{request:'RepairFleetRequest'},{permitId:'x'},{budget:{}},{runId:''},{batchId:null},{generation:-1},{identity:{num:1.5}},{target:null},{identity:new Map()},{policy:{kind:'COOLDOWN',durationMs:0}},{policy:{kind:'GAME_DAY',utcOffsetMinutes:480}},{policy:{kind:'TTL',durationMs:1}}])assert.throws(()=>f.store.record(accountId,event(change)),{code:'MEMORY_INVALID_INPUT'});const cycle={};cycle.self=cycle;assert.throws(()=>executionMemoryKey(query({target:cycle})),{code:'MEMORY_INVALID_INPUT'});assert.deepEqual(fs.readdirSync(f.dir),[]);}finally{f.cleanup();}
});

test('unknown versions, truncated files, foreign linkage and invalid event digests fail closed without overwriting evidence',()=>{
  const samples=['{"version":1,','{"version":0,"accounts":{}}','{"version":2,"accounts":{}}','{"version":1,"accounts":[]}'];for(const sample of samples){const f=fixture();try{fs.writeFileSync(f.file,sample);assert.throws(()=>f.store.list(accountId),{code:'MEMORY_UNAVAILABLE'});assert.throws(()=>f.store.record(accountId,event()),{code:'MEMORY_UNAVAILABLE'});assert.equal(fs.readFileSync(f.file,'utf8'),sample);}finally{f.cleanup();}}
  for(const mutate of [raw=>raw.accounts[accountId][0].source='changed source',raw=>raw.accounts[accountId].push(structuredClone(raw.accounts[accountId][0])),raw=>{raw.accounts.other=raw.accounts[accountId];delete raw.accounts[accountId];},raw=>raw.accounts[accountId][0].policy={kind:'COOLDOWN',durationMs:1}]){const f=fixture();try{f.store.record(accountId,event());const raw=JSON.parse(fs.readFileSync(f.file,'utf8'));mutate(raw);const bytes=JSON.stringify(raw);fs.writeFileSync(f.file,bytes);assert.throws(()=>f.store.list(accountId),{code:'MEMORY_UNAVAILABLE'});assert.throws(()=>f.store.record(accountId,event()),{code:'MEMORY_UNAVAILABLE'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);}finally{f.cleanup();}}
});

test('writer fencing happens before mutation and again before rename, retaining the original complete file',()=>{
  let checks=0,denyAt=Infinity;const f=fixture({assertWriter(){if(++checks>=denyAt)throw Object.assign(Error('owner lost'),{code:'WRITER_OWNERSHIP_LOST'});}});try{f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8');denyAt=checks+3;assert.throws(()=>f.store.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'WRITER_OWNERSHIP_LOST'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(f.dir),['memory.json','memory.json.anchor']);const readonly=createExecutionMemory({file:f.file,assertWriter(){throw Error('read must not claim writer');}});assert.equal(readonly.list(accountId).length,1);}finally{f.cleanup();}
});

for(const fault of ['writeFileSync','fsyncSync','renameSync'])test('atomic '+fault+' failure preserves prior memory and removes only this write temporary',()=>{
  const f=fixture();try{f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8');fs.writeFileSync(path.join(f.dir,'unrelated.tmp'),'preserve');const fileSystem=new Proxy(fs,{get(target,key){if(key===fault)return()=>{throw Error('synthetic power-loss boundary');};return Reflect.get(target,key);}});const broken=createExecutionMemory({...f.settings,fileSystem});assert.throws(()=>broken.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(f.reopen().list(accountId).length,1);assert.deepEqual(fs.readdirSync(f.dir).sort(),['memory.json','memory.json.anchor','unrelated.tmp']);}finally{f.cleanup();}
});
test('UNKNOWN and definite refusal are immutable separate events even for the same action, with rejection projection available to History owner',()=>{
  const f=fixture();try{f.store.record(accountId,event({status:'UNKNOWN',unresolvedWrite:true}));f.store.record(accountId,event());const result=evaluate(f);assert.equal(result.status,'BLOCKED_UNKNOWN');assert.equal(result.rejection.status,'BLOCKED_REJECTED');assert.equal(result.rejection.blocked,true);assert.equal(result.origins.length,1);assert.equal(f.store.list(accountId).length,2);}finally{f.cleanup();}
});

test('trusted four-AM game boundary does not follow local midnight or process timezone',()=>{
  const f=fixture(),clock=makeClock({server:Date.UTC(2026,10,10,19,59,59,980)});try{const saved=f.store.record(accountId,event({policy:{kind:'GAME_DAY',utcOffsetMinutes:480,boundaryHour:4}}),{clock:clock.read()});assert.equal(saved.timeGate.dayKey,'2026-11-10');clock.advance(10);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'BLOCKED_REJECTED');clock.advance(20);assert.equal(evaluate(f,query(),{clock:clock.read()}).status,'CLEAR');}finally{f.cleanup();}
});

test('default refusal never expires due to elapsed time, and an absent initial day proof cannot be repaired by a later clock',()=>{
  const f=fixture(),clock=makeClock();try{f.store.record(accountId,event());f.store.record(accountId,event({runId:'day-run',batchId:'day-batch',policy:{kind:'GAME_DAY',utcOffsetMinutes:480,boundaryHour:0}}));clock.advance(100*86400000);const result=evaluate(f,query(),{clock:clock.read()});assert.equal(result.status,'BLOCKED_REJECTED');assert.equal(result.decisions.every(row=>row.active),true);assert.equal(f.store.list(accountId).length,2);}finally{f.cleanup();}
});

test('persisted cooldown bounds are integrity-checked rather than trusted when edited to appear elapsed',()=>{
  const f=fixture(),clock=makeClock();try{f.store.record(accountId,event({policy:{kind:'COOLDOWN',durationMs:10000}}),{clock:clock.read()});const raw=JSON.parse(fs.readFileSync(f.file,'utf8'));raw.accounts[accountId][0].timeGate.notBeforeMs=0;const corrupt=JSON.stringify(raw);fs.writeFileSync(f.file,corrupt);assert.throws(()=>evaluate(f,query(),{clock:clock.read()}),{code:'MEMORY_UNAVAILABLE'});assert.throws(()=>f.store.record(accountId,event()),{code:'MEMORY_UNAVAILABLE'});assert.equal(fs.readFileSync(f.file,'utf8'),corrupt);}finally{f.cleanup();}
});

test('a previously observed store disappearing is a storage failure and cannot silently erase rejections',()=>{
  const f=fixture();try{f.store.record(accountId,event());fs.unlinkSync(f.file);assert.throws(()=>f.store.list(accountId),{code:'MEMORY_UNAVAILABLE'});assert.throws(()=>f.store.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});assert.deepEqual(fs.readdirSync(f.dir),['memory.json.anchor']);}finally{f.cleanup();}
});

test('known credentials in correlation IDs are rejected before mutation instead of breaking linkage or leaking the credential',()=>{
  const secret='synthetic-link-secret',f=fixture({secrets:()=>[secret]});try{for(const key of ['module','actionType','runId','workflowId','nodeId','batchId','actionId','capabilityId'])assert.throws(()=>f.store.record(accountId,event({[key]:secret})),{code:'MEMORY_INVALID_INPUT'});assert.deepEqual(fs.readdirSync(f.dir),[]);}finally{f.cleanup();}
});

test('exact int64 identity values and explicit false/zero remain stable across equivalent object field order',()=>{
  const f=fixture();try{const first={owner:{low:1,high:2097152,unsigned:false},remaining:0,enabled:false};f.store.record(accountId,event({identity:first}));const equivalent={enabled:false,remaining:0,owner:'9007199254740993'};assert.equal(evaluate(f,query({identity:equivalent}),{identityFact:fact(f,equivalent),maxFactAgeMs:1000}).status,'BLOCKED_REJECTED');const changed={...equivalent,remaining:1};assert.equal(evaluate(f,query({identity:changed}),{identityFact:fact(f,changed),maxFactAgeMs:1000}).status,'CLEAR');}finally{f.cleanup();}
});
test('an UNKNOWN-only event has a clear rejection subprojection while still requiring original History reconciliation',()=>{
  const f=fixture();try{f.store.record(accountId,event({status:'UNKNOWN',unresolvedWrite:true}));const result=evaluate(f);assert.equal(result.status,'BLOCKED_UNKNOWN');assert.equal(result.requiresHistoryReconciliation,true);assert.equal(result.rejection.status,'CLEAR');assert.equal(result.rejection.blocked,false);assert.deepEqual(result.rejection.decisions,[]);}finally{f.cleanup();}
});
for(const status of ['REJECTED','UNKNOWN'])test('restart cannot forget '+status+' when an established memory file disappears',()=>{
 const f=fixture();try{
  f.store.record(accountId,event({status,unresolvedWrite:status==='UNKNOWN'}));
  fs.unlinkSync(f.file);const restarted=f.reopen();
  assert.throws(()=>restarted.list(accountId),{code:'MEMORY_UNAVAILABLE'});
  assert.throws(()=>restarted.evaluate(accountId,query(),{generation}),{code:'MEMORY_UNAVAILABLE'});
  assert.throws(()=>restarted.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});
  assert.equal(fs.existsSync(f.file),false);
 }finally{f.cleanup();}
});
test('legacy version-one memory reads without creating an anchor and acquires protection on its next write',()=>{
 const f=fixture();try{
  f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8');
  fs.unlinkSync(f.file+'.anchor');const legacy=f.reopen();
  assert.equal(legacy.list(accountId).length,1);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
  assert.deepEqual(fs.readdirSync(f.dir),['memory.json']);
  legacy.record(accountId,event({runId:'second-run',batchId:'second-batch'}));
  assert.equal(f.reopen().list(accountId).length,2);
  const anchor=fs.readFileSync(f.file+'.anchor','utf8');
  assert.deepEqual(JSON.parse(anchor),{version:1,kind:'EXECUTION_MEMORY_EXISTENCE',basename:'memory.json'});
  assert.equal(anchor.includes(accountId),false);assert.equal(anchor.includes('synthetic-run'),false);
  fs.unlinkSync(f.file);assert.throws(()=>f.reopen().list(accountId),{code:'MEMORY_UNAVAILABLE'});
 }finally{f.cleanup();}
});

test('corrupt or foreign memory anchors preserve the original memory bytes and cannot be repaired by a new event',()=>{
 const f=fixture();try{
  f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8'),anchor=f.file+'.anchor';
  const samples=['','{partial',JSON.stringify({version:2,kind:'EXECUTION_MEMORY_EXISTENCE',basename:'memory.json'}),
   JSON.stringify({version:1,kind:'EXECUTION_HISTORY_EXISTENCE',basename:'memory.json'}),
   JSON.stringify({version:1,kind:'EXECUTION_MEMORY_EXISTENCE',basename:'foreign.json'}),
   JSON.stringify({version:1,kind:'EXECUTION_MEMORY_EXISTENCE',basename:'memory.json',accounts:{}}),' '.repeat(1025)];
  for(const sample of samples){
   fs.writeFileSync(anchor,sample);const restarted=f.reopen();
   assert.throws(()=>restarted.list(accountId),{code:'MEMORY_UNAVAILABLE'});
   assert.throws(()=>restarted.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});
   assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(fs.readFileSync(anchor,'utf8'),sample);
  }
  fs.unlinkSync(anchor);fs.mkdirSync(anchor);assert.throws(()=>f.reopen().list(accountId),{code:'MEMORY_UNAVAILABLE'});
  assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
 }finally{f.cleanup();}
});

test('an observed memory anchor disappearing cannot silently switch the current store to legacy mode',()=>{
 const f=fixture();try{
  f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8');assert.equal(f.store.list(accountId).length,1);
  fs.unlinkSync(f.file+'.anchor');
  assert.throws(()=>f.store.list(accountId),{code:'MEMORY_UNAVAILABLE'});
  assert.throws(()=>f.store.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});
  assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(fs.existsSync(f.file+'.anchor'),false);
 }finally{f.cleanup();}
});

for(const fault of ['writeFileSync','fsyncSync'])test('interrupted first memory anchor '+fault+' survives restart as a storage failure',()=>{
 const f=fixture();try{
  let anchorFd;
  const fileSystem=new Proxy(fs,{get(target,key){
   if(key==='openSync')return(name,...args)=>{const fd=fs.openSync(name,...args);if(name===f.file+'.anchor')anchorFd=fd;return fd;};
   if(key===fault)return(fd,...args)=>{if(fd===anchorFd){if(fault==='writeFileSync')fs.writeFileSync(fd,'{partial');throw Error('synthetic interrupted anchor');}return Reflect.get(target,key)(fd,...args);};
   return Reflect.get(target,key);
  }});
  const broken=createExecutionMemory({...f.settings,fileSystem});
  assert.throws(()=>broken.record(accountId,event()),{code:'MEMORY_UNAVAILABLE'});
  const bytes=fs.readFileSync(f.file+'.anchor','utf8');
  assert.equal(fs.existsSync(f.file),false);
  assert.throws(()=>f.reopen().list(accountId),{code:'MEMORY_UNAVAILABLE'});
  assert.throws(()=>f.reopen().record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});
  assert.equal(fs.readFileSync(f.file+'.anchor','utf8'),bytes);
  assert.deepEqual(fs.readdirSync(f.dir),['memory.json.anchor']);
 }finally{f.cleanup();}
});

for(const fault of ['writeFileSync','fsyncSync','renameSync'])test('interrupted first memory snapshot '+fault+' cannot become an empty store after restart',()=>{
 const f=fixture();try{
  let snapshotFd;
  const fileSystem=new Proxy(fs,{get(target,key){
   if(key==='openSync')return(name,...args)=>{const fd=fs.openSync(name,...args);if(name.endsWith('.tmp'))snapshotFd=fd;return fd;};
   if(key===fault)return(...args)=>{if(fault==='renameSync'||args[0]===snapshotFd)throw Error('synthetic interrupted snapshot');return Reflect.get(target,key)(...args);};
   return Reflect.get(target,key);
  }});
  const broken=createExecutionMemory({...f.settings,fileSystem});
  assert.throws(()=>broken.record(accountId,event()),{code:'MEMORY_UNAVAILABLE'});
  assert.equal(fs.existsSync(f.file),false);
  assert.throws(()=>f.reopen().list(accountId),{code:'MEMORY_UNAVAILABLE'});
  assert.throws(()=>f.reopen().record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});
  assert.deepEqual(fs.readdirSync(f.dir),['memory.json.anchor']);
 }finally{f.cleanup();}
});
// Original execution evidence only. These projections create no storage or timer.
const summaryAction=(extra={})=>({actionId:'action',module:'fixture',actionType:'SAVE',requestStatus:'SUCCESS',result:'SUCCESS',dispatched:true,unresolvedWrite:false,verification:{status:'CONFIRMED'},beforeInventoryReliable:true,afterInventoryReliable:true,beforeInventory:[{id:'wood',num:10},{id:'gold',num:0}],afterInventory:[{id:'wood',num:9},{id:'gold',num:0}],...extra});
const summaryRun=(extra={})=>({accountId:'A',runId:'run-1',module:'fixture',workflowId:'workflow-1',workflowNodeId:'node-1',workflowRound:1,executionContext:{accountId:'A',playerId:'role-1',worldId:1,generation:1,connectionId:'connection-1'},planSummary:{batchId:'batch-1'},actions:[summaryAction()],...extra});
const summarize=(runs,filters={})=>summarizeExecutionHistory(runs,{accountId:'A',filters});

test('cross-round summary counts original confirmed actions and explicit net changes including zero',()=>{
 const runs=[summaryRun(),summaryRun({runId:'run-2',workflowRound:2,actions:[summaryAction({beforeInventory:[{id:'wood',num:9},{id:'gold',num:0}],afterInventory:[{id:'gold',num:0},{id:'wood',num:7}]})]})],before=structuredClone(runs),result=summarize(runs),group=result.groups[0];
 assert.equal(group.counts.confirmedSuccess,2);assert.equal(group.quantifiedActions,2);assert.equal(group.unquantifiedActions,0);assert.deepEqual(group.resourceChanges,[{id:'gold',delta:'0'},{id:'wood',delta:'-3'}]);assert.deepEqual(runs,before);
 assert.equal(result.source,'ExecutionHistory.original-actions.v1');assert.equal(result.totalGameResources,null);for(const key of ['gameDayKnown','executable','resumable','retryAllowed'])assert.equal(result[key],false);assert.deepEqual(result.filters,{});
});
test('cross-round summary never promotes UNKNOWN APPLIED or arbitrary FAILED and separates refusal/not-executed',()=>{
 const actions=[summaryAction({actionId:'unknown',result:'UNKNOWN',unresolvedWrite:true,reconciliations:[{status:'APPLIED'}]}),summaryAction({actionId:'rejected',result:'REJECTED',requestStatus:'REJECTED'}),summaryAction({actionId:'not-sent',result:'NOT_EXECUTED',requestStatus:'NOT_DISPATCHED',dispatched:false}),summaryAction({actionId:'failed',result:'FAILED',requestStatus:'FAILED'}),summaryAction({actionId:'unconfirmed',verification:{status:'UNCONFIRMED'}})];
 const result=summarize([summaryRun({actions})]);assert.deepEqual(result.groups[0].counts,{confirmedSuccess:0,originalUnknown:1,rejected:1,notExecuted:1,other:2});assert.equal(result.groups[0].quantifiedActions,0);assert.deepEqual(result.groups[0].resourceChanges,[]);assert.equal(summarize([summaryRun({actions})],{status:'UNKNOWN'}).groups[0].counts.originalUnknown,1);
});
for(const [name,extra] of [
 ['missing reliability',{beforeInventoryReliable:undefined}],['unreliable',{afterInventoryReliable:false}],['missing inventory',{beforeInventory:undefined}],['duplicate item',{beforeInventory:[{id:'wood',num:10},{id:'wood',num:10}]}],['mismatched set',{afterInventory:[{id:'wood',num:9}]}],['unsafe amount',{afterInventory:[{id:'wood',num:Number.MAX_SAFE_INTEGER+1},{id:'gold',num:0}]}],['inherited item',{beforeInventory:[Object.create({id:'wood',num:10})]}],['inherited amount',{beforeInventory:[{id:'wood',num:Object.create({low:10,high:0})}]}],['inherited reliability',Object.assign(Object.create({beforeInventoryReliable:true}),{afterInventoryReliable:true})]
])test('cross-round resource evidence stays unknown: '+name,()=>{
 const action=summaryAction(extra);if(name==='inherited reliability'){delete action.beforeInventoryReliable;Object.setPrototypeOf(action,{beforeInventoryReliable:true});}
 const result=summarize([summaryRun({actions:[action]})]);
 if(name==='inherited reliability'){assert.deepEqual(result.groups,[]);return;}
 const group=result.groups[0];assert.equal(group.counts.confirmedSuccess,1);assert.equal(group.quantifiedActions,0);assert.equal(group.unquantifiedActions,1);assert.deepEqual(group.resourceChanges,[]);
});
test('cross-round summary never infers receipts from costs, reservations or resource claims',()=>{
 const action=summaryAction({beforeInventory:undefined,afterInventory:undefined,costs:[{id:'wood',num:7}],reservation:{wood:7},resourceBefore:{wood:10},resourceAfter:{wood:3}}),result=summarize([summaryRun({actions:[action]})]);assert.equal(result.groups[0].unquantifiedActions,1);assert.deepEqual(result.groups[0].resourceChanges,[]);
});
test('cross-round resource totals use exact signed decimals beyond safe integer aggregates',()=>{
 const max=Number.MAX_SAFE_INTEGER,run=summaryRun({actions:[summaryAction({actionId:'a',beforeInventory:[{id:'wood',num:0}],afterInventory:[{id:'wood',num:max}]}),summaryAction({actionId:'b',beforeInventory:[{id:'wood',num:'0'}],afterInventory:[{id:'wood',num:String(max)}]})]});
 assert.deepEqual(summarize([run]).groups[0].resourceChanges,[{id:'wood',delta:'18014398509481982'}]);
});
test('cross-round duplicates are resolved before selectors and reconciliation does not rewrite original evidence',()=>{
 const a=summaryRun(),b=structuredClone(a);b.actions[0].reconciliations=[{status:'APPLIED'}];const duplicate=summarize([a,b]);assert.equal(duplicate.excluded.duplicateRecords,1);assert.equal(duplicate.groups[0].counts.confirmedSuccess,1);
 for(const mutate of [row=>row.workflowId='foreign',row=>row.actions[0].result='UNKNOWN',row=>row.executionContext.playerId='other',row=>row.actions[0].afterInventory[0].num=8]){
  const bad=structuredClone(a);mutate(bad);const result=summarize([a,bad],{workflowId:'workflow-1',status:'SUCCESS'});assert.equal(result.excluded.conflictingActions,1);assert.deepEqual(result.groups,[]);
 }
});
test('cross-round grouping preserves exact account role world module and action identity',()=>{
 const base=summaryRun(),other=(runId,executionContext,extra={})=>summaryRun({runId,executionContext:{...base.executionContext,...executionContext},...extra});
 const result=summarize([base,other('role',{playerId:'role-2'}),other('world',{worldId:2}),other('string-world',{worldId:'1'}),other('module',{}, {module:'another',actions:[summaryAction({module:'another'})]}),other('action',{}, {actions:[summaryAction({actionType:'OTHER'})]}),other('other-account',{accountId:'B'},{accountId:'B'})]);assert.equal(result.groups.length,6);assert.ok(result.groups.every(group=>group.counts.confirmedSuccess===1));
 for(const context of [null,{playerId:'role-1',worldId:1},{...base.executionContext,accountId:'B'},{...base.executionContext,worldId:null}]){const missing=summarize([summaryRun({executionContext:context})]);assert.deepEqual(missing.groups,[]);assert.equal(missing.excluded.missingIdentityActions,1);}
 assert.equal(summarize([summaryRun({runId:'',actions:[summaryAction()]})]).excluded.unidentifiedActions,1);
});
test('cross-round exact original selectors never borrow absent workflow/node/batch correlation',()=>{
 const run=summaryRun();for(const filters of [{module:'fixture'},{runId:'run-1'},{workflowId:'workflow-1'},{nodeId:'node-1'},{batchId:'batch-1'},{actionId:'action'},{status:'SUCCESS'}]){const result=summarize([run],filters);assert.deepEqual(result.filters,filters);assert.equal(result.groups[0].counts.confirmedSuccess,1);assert.deepEqual(summarize([run],Object.fromEntries(Object.keys(filters).map(key=>[key,'missing']))).groups,[]);}
 assert.deepEqual(summarize([summaryRun({workflowId:undefined,workflowNodeId:undefined,planSummary:{}})],{workflowId:'workflow-1'}).groups,[]);
 assert.equal(summarize([summaryRun({authorizationSummary:{batchId:'different'}})]).excluded.missingIdentityActions,1);
 for(const filters of [{unknown:'x'},{runId:''},{status:' SUCCESS'}])assert.throws(()=>summarize([run],filters),{code:'MEMORY_INVALID_INPUT'});
});

test('cross-round success counts require explicit confirmed dispatched original outcome fields',()=>{
 for(const extra of [{dispatched:undefined},{unresolvedWrite:undefined},{verification:Object.create({status:'CONFIRMED'})},{requestStatus:'NOT_DISPATCHED'}]){
  const group=summarize([summaryRun({actions:[summaryAction(extra)]})]).groups[0];assert.equal(group.counts.confirmedSuccess,0);assert.equal(group.counts.other,1);assert.deepEqual(group.resourceChanges,[]);
 }
});

test('original reason audit separates run stops from missing action causes and preserves exact source strings',()=>{
 const row=summaryAction({result:'NOT_EXECUTED',requestStatus:'NOT_DISPATCHED',dispatched:false}),run=summaryRun({finalStatus:'CANCELLED',stopReason:' explicit original stop\nsecond line ',actions:[row]});const audit=summarize([run]).reasonAudit;
 assert.equal(audit.source,'ExecutionHistory.original-reasons.v1');assert.equal(audit.readOnly,true);assert.equal(audit.runs[0].stopReason.text,run.stopReason);assert.equal(audit.runs[0].stopReason.source,'ExecutionHistory.run.stopReason');assert.equal(audit.runs[0].actionId,null);assert.equal(audit.actions[0].coverage,'UNKNOWN');assert.deepEqual(audit.actions[0].evidence,[]);assert.equal(audit.actions[0].workflowRound,1);assert.equal(audit.actions[0].playerId,'role-1');assert.equal(audit.actions[0].status,'NOT_EXECUTED');assert.equal(audit.actions[0].nextDecision,null);
 row.reason='original reason';row.error='independent original error';const evidence=summarize([run]).reasonAudit.actions[0].evidence;assert.deepEqual(evidence,[{source:'ExecutionHistory.action.reason',text:'original reason'},{source:'ExecutionHistory.action.error',text:'independent original error'}]);
});
test('original reason audit keeps UNKNOWN plus APPLIED and recorded next advice separate from actual skips',()=>{
 const row=summaryAction({result:'UNKNOWN',unresolvedWrite:true,reason:'original unknown',nextDecision:{decision:'RECOMMEND_KEEP',explanation:['recorded recommendation']},reconciliations:[{status:'APPLIED',evidence:{reason:'later reconciliation cause'}}]}),run=summaryRun({finalStatus:'UNKNOWN',stopReason:'original run unknown',actions:[row]}),result=summarize([run]),audit=result.reasonAudit;
 assert.equal(result.groups[0].counts.confirmedSuccess,0);assert.equal(audit.actions[0].status,'UNKNOWN');assert.equal(audit.actions[0].evidence[0].text,'original unknown');assert.equal(audit.actions[0].nextDecision.executionConfirmed,false);assert.deepEqual(audit.actions[0].nextDecision.explanation,['recorded recommendation']);assert.equal(audit.actions[0].nextDecision.coverage,'RECORDED');assert.equal(JSON.stringify(audit).includes('later reconciliation cause'),false);
});
test('original reason audit does not infer missing text from verification current facts or batch causes',()=>{
 for(const reason of [undefined,null,'','   ',{},'x'.repeat(4001)]){
  const row=summaryAction({result:'NOT_EXECUTED',requestStatus:'NOT_EXECUTED',dispatched:false,reason,error:reason,verification:{status:'NOT_STARTED',reason:'not an original cause'},afterState:{reason:'not an original cause'}}),audit=summarize([summaryRun({finalStatus:'CANCELLED',stopReason:reason,actions:[row]})]).reasonAudit;
  assert.equal(audit.actions[0].coverage,'UNKNOWN');assert.deepEqual(audit.actions[0].evidence,[]);assert.equal(audit.runs[0].stopReason.coverage,'UNKNOWN');assert.equal(audit.runs[0].stopReason.text,null);
 }
 for(const nextDecision of [{decision:'SKIP',explanation:['guess']},{decision:'RECOMMEND_KEEP',explanation:[]},{decision:'RECOMMEND_KEEP',explanation:['ok',{}]},Object.create({decision:'RECOMMEND_KEEP',explanation:['inherited']})]){const audit=summarize([summaryRun({finalStatus:'SUCCESS',actions:[summaryAction({nextDecision})]})]).reasonAudit;assert.equal(audit.actions[0].nextDecision.coverage,'UNKNOWN');assert.equal(audit.actions[0].nextDecision.executionConfirmed,false);}
});
test('original reason audit resolves duplicate/conflicting runs and actions before exact selectors',()=>{
 const run=summaryRun({finalStatus:'CANCELLED',stopReason:'original stop',actions:[summaryAction({reason:'original action cause'})]}),duplicate=structuredClone(run);duplicate.actions[0].reconciliations=[{status:'APPLIED'}];let result=summarize([run,duplicate]);assert.equal(result.reasonAudit.excluded.duplicateRunRecords,1);assert.equal(result.reasonAudit.runs.length,1);assert.equal(result.reasonAudit.actions.length,1);
 const runConflict=structuredClone(run);runConflict.stopReason='conflicting stop';result=summarize([run,runConflict]);assert.equal(result.reasonAudit.excluded.conflictingRuns,1);assert.deepEqual(result.reasonAudit.runs,[]);assert.equal(result.reasonAudit.actions.length,1);
 const actionConflict=structuredClone(run);actionConflict.actions[0].reason='conflicting action cause';result=summarize([run,actionConflict]);assert.equal(result.excluded.conflictingActions,1);assert.equal(result.reasonAudit.excluded.conflictingRuns,1);assert.deepEqual(result.reasonAudit.actions,[]);
 const scopeConflict=structuredClone(run);scopeConflict.workflowId='foreign';result=summarize([run,scopeConflict],{workflowId:'workflow-1'});assert.equal(result.reasonAudit.excluded.conflictingRuns,1);assert.deepEqual(result.reasonAudit.runs,[]);assert.deepEqual(result.reasonAudit.actions,[]);
});
test('original reason audit selectors never transfer batch stops to one selected action',()=>{
 const run=summaryRun({finalStatus:'CANCELLED',stopReason:'batch only',actions:[summaryAction({reason:'selected action'})]});
 for(const filters of [{runId:'run-1'},{workflowId:'workflow-1'},{nodeId:'node-1'},{batchId:'batch-1'},{module:'fixture'}]){const audit=summarize([run],filters).reasonAudit;assert.equal(audit.actions.length,1);assert.equal(audit.runs.length,1);const empty=summarize([run],Object.fromEntries(Object.keys(filters).map(key=>[key,'missing']))).reasonAudit;assert.deepEqual(empty.runs,[]);assert.deepEqual(empty.actions,[]);}
 assert.deepEqual(summarize([run],{actionId:'action'}).reasonAudit.runs,[]);assert.equal(summarize([run],{actionId:'action'}).reasonAudit.actions.length,1);assert.deepEqual(summarize([run],{status:'SUCCESS'}).reasonAudit.runs,[]);assert.equal(summarize([run],{status:'CANCELLED'}).reasonAudit.runs.length,1);assert.deepEqual(summarize([run],{status:'CANCELLED'}).reasonAudit.actions,[]);
});
test('original reason audit covers empty stopped runs with exact role/world scope and no recovered substitution',()=>{
 const run=summaryRun({finalStatus:'CANCELLED',stopReason:'empty original stop',actions:[]}),other=summaryRun({accountId:'B',executionContext:{accountId:'B',playerId:'role-1',worldId:1},finalStatus:'CANCELLED',stopReason:'foreign stop'});const audit=summarize([run,other]).reasonAudit;assert.equal(audit.runs.length,1);assert.equal(audit.runs[0].stopReason.text,'empty original stop');assert.deepEqual(audit.actions,[]);
 const missing=summarize([summaryRun({finalStatus:'CANCELLED',executionContext:null,stopReason:'unowned'})]).reasonAudit;assert.equal(missing.excluded.missingIdentityRuns,1);assert.deepEqual(missing.runs,[]);
 const recovered=summarize([{...run,recovered:true,stopReason:'synthetic recovery hint'}]).reasonAudit;assert.equal(recovered.runs[0].stopReason.coverage,'RECOVERY_ONLY');assert.equal(recovered.runs[0].stopReason.text,null);assert.equal(JSON.stringify(recovered).includes('synthetic recovery hint'),false);
});

test('original reason audit treats sparse/inherited advice and recovered original request statuses as unknown',()=>{
 for(const explanation of [new Array(1),Object.assign(new Array(2),{1:'recorded'})]){const audit=summarize([summaryRun({finalStatus:'SUCCESS',actions:[summaryAction({nextDecision:{decision:'RECOMMEND_KEEP',explanation}})]})]).reasonAudit;assert.equal(audit.actions[0].nextDecision.coverage,'UNKNOWN');assert.equal(audit.actions[0].nextDecision.explanation,null);}
 const run=summaryRun({recovered:true,finalStatus:'UNKNOWN',stopReason:'recovery-only',actions:[summaryAction({result:'UNKNOWN',requestStatus:'UNKNOWN',unresolvedWrite:true,reason:'unchanged original action cause'})]}),audit=summarize([run]).reasonAudit;
 assert.equal(audit.runs[0].status,null);assert.equal(audit.runs[0].stopReason.coverage,'RECOVERY_ONLY');assert.equal(audit.actions[0].requestStatus,null);assert.equal(audit.actions[0].evidence[0].text,'unchanged original action cause');assert.deepEqual(summarize([run],{status:'UNKNOWN'}).reasonAudit.runs,[]);
});
