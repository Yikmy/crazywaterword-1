import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createExecutionHistory } from '../src/execution-history.mjs';

function fixture() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-history-')); return { dir, file: path.join(dir, 'history.json') }; }
function run(id = 'A', status = 'SUCCESS') { return { accountId: id, runId: 'run-' + id, module: 'orders', finalStatus: status,
  authorizationSummary: { planHash: 'hash', actionIds: ['one'] }, actions: [{ actionId: 'one', requestStatus: status, result: status }] }; }

test('history atomically persists account-separated runs, including special dictionary keys', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run('A')); store.put(run('B')); store.put(run('__proto__'));
    const reloaded = createExecutionHistory({ file });
    assert.equal(reloaded.list('A')[0].accountId, 'A'); assert.equal(reloaded.list('B')[0].accountId, 'B');
    assert.equal(reloaded.list('__proto__')[0].accountId, '__proto__'); assert.deepEqual(reloaded.list('missing'), []);
    assert.equal(reloaded.unresolved('A'), false); assert.deepEqual(fs.readdirSync(dir), ['history.json','history.json.anchor']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('restart recovers in-flight actions as UNKNOWN, never resumes or releases reservations', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }), record = run('A', 'EXECUTING');
    record.resourceBudget = [{ id: 'wood', num: 80 }]; record.actions[0].requestStatus = 'DISPATCHING'; store.put(record);
    assert.equal(store.list('A')[0].recovered, undefined, 'live run is not reported as crashed');
    const recovered = createExecutionHistory({ file }); const row = recovered.list('A')[0];
    assert.equal(row.finalStatus, 'UNKNOWN'); assert.equal(row.recovered, true); assert.equal(recovered.unresolved('A'), true);
    assert.deepEqual(row.resourceBudget, record.resourceBudget); assert.equal(row.actions[0].requestStatus, 'UNKNOWN');
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).accounts.A[0].finalStatus, 'EXECUTING', 'reading never rewrites evidence');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('history removes credentials and known secret echoes but retains public authorization evidence', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file, secrets: () => ['synthetic-secret-value'] }), record = run();
    record.actions[0].beforeState = { token: 'synthetic-token', sign: 'synthetic-sign', cookie: 'synthetic-cookie', loginFrameHex: 'abcdef', note: 'synthetic-secret-value' };
    store.put(record); const text = fs.readFileSync(file, 'utf8');
    for (const secret of ['synthetic-token', 'synthetic-sign', 'synthetic-cookie', 'abcdef', 'synthetic-secret-value']) assert.equal(text.includes(secret), false);
    assert.deepEqual(store.list('A')[0].authorization, record.authorizationSummary);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('corrupt or foreign-version history fails closed and never overwrites original evidence', () => {
  const { dir, file } = fixture();
  try {
    for (const text of ['{broken', '{"version":2,"accounts":{}}', '{"version":1,"accounts":{"A":[{"accountId":"B","runId":"x","actions":[]}]}}']) {
      fs.writeFileSync(file, text); const store = createExecutionHistory({ file });
      assert.throws(() => store.list('A'), /历史/); assert.throws(() => store.put(run()), /历史/); assert.equal(fs.readFileSync(file, 'utf8'), text);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('failed atomic replacement preserves original history and cleans the temporary file', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run()); const before = fs.readFileSync(file, 'utf8');
    const original = fs.renameSync; fs.renameSync = () => { throw Error('synthetic rename failure'); };
    try { assert.throws(() => store.put(run('B')), /保存失败/); } finally { fs.renameSync = original; }
    assert.equal(fs.readFileSync(file, 'utf8'), before); assert.deepEqual(fs.readdirSync(dir), ['history.json','history.json.anchor']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sent rate-limited writes remain unresolved across restart even while preserving the rate-limit result', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }), record = run('A', 'RATE_LIMITED');
    record.actions[0].dispatched = true; record.actions[0].unresolvedWrite = true; store.put(record);
    assert.equal(store.list('A')[0].finalStatus, 'RATE_LIMITED'); assert.equal(store.unresolved('A'), true);
    const restarted = createExecutionHistory({ file }); assert.equal(restarted.unresolved('A'), true); assert.equal(restarted.list('A')[0].finalStatus, 'UNKNOWN');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('logical history corruption cannot masquerade as completed writes', () => {
  const { dir, file } = fixture();
  try {
    for (const mutate of [r => { delete r.finalStatus; }, r => { r.actions[0].requestStatus = 'ALIEN'; }, r => { r.actions[0] = null; }, r => { delete r.actions[0].result; }]) {
      const record = run(); mutate(record); fs.writeFileSync(file, JSON.stringify({ version: 1, accounts: { A: [record] } }));
      assert.throws(() => createExecutionHistory({ file }).unresolved('A'), /历史/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const reconciliation = (status, evidence = {}) => ({ status, timestamp: '2026-11-11T00:00:00.000Z', evidence: { version: 1, reasonCode: 'SYNTHETIC', ...evidence } });

test('append reconciliation preserves original UNKNOWN, dispatch evidence and reserved budgets across restart', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }), record = run('A', 'UNKNOWN');
    record.resourceBudget = [{ id: 'wood', num: 8 }]; record.actions[0].resourceReservation = [{ id: 'wood', num: 8 }];
    record.actions[0].dispatched = true; record.actions[0].unresolvedWrite = true; store.put(record);
    const original = JSON.parse(fs.readFileSync(file, 'utf8')).accounts.A[0];
    const event = store.appendReconciliation('A', record.runId, 'one', reconciliation('APPLIED'));
    assert.equal(event.status, 'APPLIED'); assert.equal(typeof event.eventId, 'string'); assert.equal(store.unresolved('A'), false);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).accounts.A[0], { reconciliations, ...savedAction } = saved.actions[0];
    assert.deepEqual(savedAction, original.actions[0]); assert.equal(saved.finalStatus, 'UNKNOWN');
    assert.deepEqual(saved.resourceBudget, original.resourceBudget); assert.deepEqual(saved.authorization, original.authorization);
    assert.equal(reconciliations.length, 1); assert.deepEqual(reconciliations[0], event);
    const restarted = createExecutionHistory({ file }); assert.equal(restarted.unresolved('A'), false); assert.equal(restarted.list('A')[0].actions[0].result, 'UNKNOWN');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('STILL_UNKNOWN appends evidence without unlocking, then a later resolution is append-only', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run('A', 'UNKNOWN'));
    const first = store.appendReconciliation('A', 'run-A', 'one', reconciliation('STILL_UNKNOWN'));
    assert.equal(store.unresolved('A'), true);
    const second = store.appendReconciliation('A', 'run-A', 'one', reconciliation('NOT_APPLIED'));
    assert.notEqual(first.eventId, second.eventId); assert.deepEqual(store.list('A')[0].actions[0].reconciliations, [first, second]);
    assert.equal(store.unresolved('A'), false);
    const before = fs.readFileSync(file, 'utf8');
    assert.throws(() => store.appendReconciliation('A', 'run-A', 'one', reconciliation('APPLIED')), /复核/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('put cannot replace original history once reconciliation events exist', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run('A', 'UNKNOWN'));
    store.appendReconciliation('A', 'run-A', 'one', reconciliation('STILL_UNKNOWN'));
    const before = fs.readFileSync(file, 'utf8');
    assert.throws(() => store.put(run('A', 'SUCCESS')), /不可覆盖|追加证据/);
    assert.equal(fs.readFileSync(file, 'utf8'), before); assert.equal(store.unresolved('A'), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('UNKNOWN run without a pending action stays blocked and cannot be unlocked by unrelated append', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }), record = run('A', 'UNKNOWN'); record.actions[0].requestStatus = 'SUCCESS'; record.actions[0].result = 'SUCCESS'; store.put(record);
    const before = fs.readFileSync(file, 'utf8'); assert.equal(store.unresolved('A'), true);
    assert.throws(() => store.appendReconciliation('A', 'run-A', 'one', reconciliation('APPLIED')), /复核/);
    assert.throws(() => store.appendReconciliation('B', 'run-A', 'one', reconciliation('APPLIED')), /批次/);
    assert.equal(store.unresolved('A'), true); assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reconciliation requires exact existing run/action, a known status and valid evidence timestamp', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run('A', 'UNKNOWN')); const before = fs.readFileSync(file, 'utf8');
    for (const [runId, actionId, event] of [['missing', 'one', reconciliation('APPLIED')], ['run-A', 'missing', reconciliation('APPLIED')],
      ['run-A', 'one', reconciliation('SUCCESS')], ['run-A', 'one', { ...reconciliation('APPLIED'), evidence: null }],
      ['run-A', 'one', { ...reconciliation('APPLIED'), timestamp: 'invalid' }]])
      assert.throws(() => store.appendReconciliation('A', runId, actionId, event), error => error.code === 'HISTORY_UNAVAILABLE');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('lost writer ownership rejects reconciliation before any disk replacement', () => {
  const { dir, file } = fixture();
  try {
    let owned = true; const store = createExecutionHistory({ file, assertWriter() { if (!owned) throw Object.assign(new Error('synthetic ownership lost'), { code: 'WRITER_NOT_OWNED' }); } });
    store.put(run('A', 'UNKNOWN')); const before = fs.readFileSync(file, 'utf8'); owned = false;
    assert.throws(() => store.appendReconciliation('A', 'run-A', 'one', reconciliation('APPLIED')), error => error.code === 'WRITER_NOT_OWNED');
    assert.equal(fs.readFileSync(file, 'utf8'), before); assert.deepEqual(fs.readdirSync(dir), ['history.json','history.json.anchor']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('reconciliation atomic rename failure retains original UNKNOWN, reservation and unresolved lock', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file }); store.put(run('A', 'UNKNOWN')); const before = fs.readFileSync(file, 'utf8');
    const original = fs.renameSync; fs.renameSync = () => { throw Error('synthetic append rename failure'); };
    try { assert.throws(() => store.appendReconciliation('A', 'run-A', 'one', reconciliation('APPLIED')), /保存失败/); } finally { fs.renameSync = original; }
    assert.equal(fs.readFileSync(file, 'utf8'), before); assert.equal(store.unresolved('A'), true); assert.deepEqual(fs.readdirSync(dir), ['history.json','history.json.anchor']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('appended recovery evidence is redacted without deleting prior failure evidence', () => {
  const { dir, file } = fixture();
  try {
    const store = createExecutionHistory({ file, secrets: () => ['synthetic-private-echo'] }); store.put(run('A', 'UNKNOWN'));
    store.appendReconciliation('A', 'run-A', 'one', reconciliation('STILL_UNKNOWN', { token: 'synthetic-private-token', note: 'synthetic-private-echo' }));
    const saved = fs.readFileSync(file, 'utf8'); assert.equal(saved.includes('synthetic-private-token'), false); assert.equal(saved.includes('synthetic-private-echo'), false);
    assert.equal(store.list('A')[0].actions[0].result, 'UNKNOWN'); assert.equal(store.unresolved('A'), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('known History disappearing before a result fails closed both live and after restart',()=>{
 const {dir,file}=fixture();try{const history=createExecutionHistory({file}),record=run('A','EXECUTING');record.actions[0].requestStatus='DISPATCHING';history.put(record);const original=fs.readFileSync(file,'utf8');assert.equal(fs.existsSync(file+'.anchor'),true);fs.unlinkSync(file);
 for(const store of [history,createExecutionHistory({file})]){assert.throws(()=>store.list('A'),{code:'HISTORY_UNAVAILABLE'});assert.throws(()=>store.unresolved('A'),{code:'HISTORY_UNAVAILABLE'});assert.throws(()=>store.put(run('B')),{code:'HISTORY_UNAVAILABLE'});}assert.equal(fs.existsSync(file),false);
 fs.writeFileSync(file,original);assert.equal(createExecutionHistory({file}).unresolved('A'),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('legacy History may be read without an anchor but observed disappearance is never an empty first run',()=>{
 const {dir,file}=fixture();try{const record=run();fs.writeFileSync(file,JSON.stringify({version:1,accounts:{A:[record]}}));const history=createExecutionHistory({file});assert.equal(history.list('A').length,1);assert.equal(fs.existsSync(file+'.anchor'),false);fs.unlinkSync(file);assert.throws(()=>history.list('A'),{code:'HISTORY_UNAVAILABLE'});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('confirmed action crash before final run write stops audit without inventing UNKNOWN or batch success',()=>{
 const {dir,file}=fixture();try{const history=createExecutionHistory({file}),record=run('A','EXECUTING');Object.assign(record.actions[0],{requestStatus:'UNKNOWN',result:'SUCCESS',verification:{status:'CONFIRMED'},dispatched:true,unresolvedWrite:false});record.runBudget={state:'ACTIVE',reserved:{wood:4}};history.put(record);const bytes=fs.readFileSync(file,'utf8');const store=createExecutionHistory({file}),restored=store.list('A')[0];
 assert.equal(restored.finalStatus,'CANCELLED');assert.equal(restored.recoveryDisposition,'RECOVERED_STOPPED_AFTER_CONFIRMED_ACTIONS');assert.equal(restored.resumable,false);assert.equal(restored.interruptedFinalStatus,'EXECUTING');assert.deepEqual(restored.actions,record.actions);assert.deepEqual(restored.runBudget,record.runBudget);assert.equal(store.unresolved('A'),false);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('original UNKNOWN is never lowered even when all action confirmation appears complete',()=>{
 const {dir,file}=fixture();try{const history=createExecutionHistory({file}),record=run('A','UNKNOWN');Object.assign(record.actions[0],{requestStatus:'SUCCESS',result:'SUCCESS',verification:{status:'CONFIRMED'},unresolvedWrite:false});history.put(record);const store=createExecutionHistory({file});assert.equal(store.list('A')[0].finalStatus,'UNKNOWN');assert.equal(store.unresolved('A'),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('incomplete or corrupt existence anchor is fail closed without overwriting original History',()=>{
 const {dir,file}=fixture();try{const history=createExecutionHistory({file});history.put(run());const bytes=fs.readFileSync(file,'utf8');for(const value of ['','{bad',JSON.stringify({version:9})]){fs.writeFileSync(file+'.anchor',value);const store=createExecutionHistory({file});assert.throws(()=>store.list('A'),{code:'HISTORY_UNAVAILABLE'});assert.throws(()=>store.put(run('B')),{code:'HISTORY_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.readFileSync(file+'.anchor','utf8'),value);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('an observed existence anchor cannot silently disappear into legacy compatibility',()=>{
 const {dir,file}=fixture();try{const history=createExecutionHistory({file});history.put(run());const bytes=fs.readFileSync(file,'utf8');history.list('A');fs.unlinkSync(file+'.anchor');assert.throws(()=>history.list('A'),{code:'HISTORY_UNAVAILABLE'});assert.throws(()=>history.put(run('B')),{code:'HISTORY_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.existsSync(file+'.anchor'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
