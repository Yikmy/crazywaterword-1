import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createExecutionMemory, executionMemoryKey } from '../src/execution-memory.mjs';
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
    assert.equal(evaluate(f).status,'BLOCKED_REJECTED'); const bytes=fs.readFileSync(f.file,'utf8'); assert.equal(bytes.includes('synthetic-fleet'),false); assert.equal(bytes.includes('durability'),false); assert.deepEqual(fs.readdirSync(f.dir),['memory.json']);
    assert.deepEqual(f.reopen().list(accountId),[saved]); assert.deepEqual(f.store.list(accountId,{runId:'other-run'}),[]);
  } finally { f.cleanup(); }
});

test('account keys including __proto__ are exact isolated data and cannot become file paths', () => {
  const f=fixture();try {
    for(const id of [accountId,'__proto__','../synthetic-account','constructor'])f.store.record(id,event());
    assert.equal(f.store.list(accountId).length,1);assert.equal(f.store.list('__proto__').length,1);assert.deepEqual(f.store.list('missing'),[]);assert.equal(f.store.list('constructor')[0].accountId,'constructor');assert.deepEqual(fs.readdirSync(f.dir),['memory.json']);
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
  let checks=0,denyAt=Infinity;const f=fixture({assertWriter(){if(++checks>=denyAt)throw Object.assign(Error('owner lost'),{code:'WRITER_OWNERSHIP_LOST'});}});try{f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8');denyAt=checks+3;assert.throws(()=>f.store.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'WRITER_OWNERSHIP_LOST'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(f.dir),['memory.json']);const readonly=createExecutionMemory({file:f.file,assertWriter(){throw Error('read must not claim writer');}});assert.equal(readonly.list(accountId).length,1);}finally{f.cleanup();}
});

for(const fault of ['writeFileSync','fsyncSync','renameSync'])test('atomic '+fault+' failure preserves prior memory and removes only this write temporary',()=>{
  const f=fixture();try{f.store.record(accountId,event());const bytes=fs.readFileSync(f.file,'utf8');fs.writeFileSync(path.join(f.dir,'unrelated.tmp'),'preserve');const fileSystem=new Proxy(fs,{get(target,key){if(key===fault)return()=>{throw Error('synthetic power-loss boundary');};return Reflect.get(target,key);}});const broken=createExecutionMemory({...f.settings,fileSystem});assert.throws(()=>broken.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(f.reopen().list(accountId).length,1);assert.deepEqual(fs.readdirSync(f.dir).sort(),['memory.json','unrelated.tmp']);}finally{f.cleanup();}
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
  const f=fixture();try{f.store.record(accountId,event());fs.unlinkSync(f.file);assert.throws(()=>f.store.list(accountId),{code:'MEMORY_UNAVAILABLE'});assert.throws(()=>f.store.record(accountId,event({runId:'new-run',batchId:'new-batch'})),{code:'MEMORY_UNAVAILABLE'});assert.deepEqual(fs.readdirSync(f.dir),[]);}finally{f.cleanup();}
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