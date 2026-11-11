import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameClient } from '../src/client.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

// Synthetic protocol and socket only: no connect, account data, credentials or real wire.
const codec = { encode: (name, seq, body = {}) => Buffer.from(JSON.stringify({ name, seq, body })), decode: bytes => JSON.parse(Buffer.from(bytes).toString()) };
const protocol = Object.fromEntries(['AllItemRequest', 'AllItemResponse', 'AllResourceRequest', 'AllResourceResponse', 'SaveFormationRequest', 'SaveFormationResponse', 'RepairFleetRequest'].map(name => [name, {}]));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture({ watch = false, acknowledge = true, mutate = true, failStage = null, timeout = 30, historyFile = null } = {}) {
  const dir = historyFile ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'cw-execution-stages-'));
  const file = historyFile ?? path.join(dir, 'history.json');
  const history = createExecutionHistory({ file });
  let revision = 1, failed = false, verifyGate = null;
  const writes = [], persisted = [], clients = [];
  const operation = () => ({ actionId: 'fixture-write', actionType: 'FORMATION_SAVE', target: { id: 'exact-target' }, identity: { revision }, costs: [{ id: 'wood', num: 1 }], costSource: 'synthetic authoritative configuration', beforeState: { revision }, expectedState: { revision: revision + 1 }, action: { request: watch ? 'RepairFleetRequest' : 'SaveFormationRequest', response: watch ? null : 'SaveFormationResponse', body: { id: 'exact-target', revision } } });
  const adapter = { id: 'fixture', defaultConfig: { enabled: false },
    async survey() { if (writes.length && verifyGate) await verifyGate.promise; return { state: { revision }, stockReliable: true, stock: new Map([['wood', 10]]) }; },
    view() { return { candidates: [] }; },
    plan(facts, { selections, ledger }) { const candidate = operation(); return { actions: selections.includes(candidate.actionId) && ledger.reserve(candidate.costs) ? [candidate] : [] }; },
    verify(op, before, after) { return { confirmed: after.state.revision === before.state.revision + 1, afterState: after.state }; },
  };
  const storage = { list: history.list, unresolved: history.unresolved, put(record) {
    const stage = record.actions[0]?.stages?.at(-1)?.stage;
    if (!failed && stage === failStage) { failed = true; throw Object.assign(new Error('synthetic stage persistence failure'), { code: 'HISTORY_UNAVAILABLE' }); }
    const saved = history.put(record); persisted.push(structuredClone(saved)); return saved;
  } };
  const service = createOperationService({ protocol, modules: { fixture: adapter }, history: storage,
    moduleSettings: { get: () => ({ config: { enabled: true } }) }, getConfig: () => ({}), loadRules: () => ({ config: {} }), loadProduction: () => ({ config: {} }),
    businessExecute: (client, wire, op, options) => executeBusinessOperation(client, wire, op, { ...options, timeout, window: 2 }),
  });
  function session() {
    const client = new GameClient({ protocol: {}, WebSocketImpl: class { constructor() { throw Error('Forbidden network in synthetic test'); } } });
    client.codec = codec; client.state = 'READY';
    const receive = (name, body) => client.onMessage(codec.encode(name, 0, body));
    client.socket = { readyState: 1, close() { this.readyState = 3; }, send(bytes) {
      const frame = codec.decode(bytes);
      if (frame.name === 'AllItemRequest') return receive('AllItemResponse', { items: [{ itemId: 'wood', num: 10 }] });
      if (frame.name === 'AllResourceRequest') return receive('AllResourceResponse', { list: [] });
      const beforeSend = JSON.parse(fs.readFileSync(file, 'utf8')).accounts.A[0];
      writes.push({ frame, beforeSend });
      if (mutate) revision++;
      if (acknowledge && !watch) receive('SaveFormationResponse', { accepted: true, token: 'synthetic-response-must-not-persist' });
    } };
    clients.push(client);
    return { id: 'A', generation: 1, state: 'READY', client, abort: new AbortController(), loop: { running: false }, busy: null };
  }
  async function start(account) {
    const displayed = await service.plan(account, { module: 'fixture', mode: 'Manual', selections: ['fixture-write'] });
    const permit = service.authorize(account, { batchId: displayed.batchId, planHash: displayed.planHash, approvedActionIds: ['fixture-write'], resourceBudget: displayed.resourceBudget, confirm: true });
    return service.execute(account, permit);
  }
  return { file, service, history, writes, persisted, session, start, gate: value => { verifyGate = value; }, row: () => service.history('A').runs[0].actions[0],
    cleanup() { for (const client of clients) client.stop(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); },
  };
}
const stages = row => row.stages.map(entry => entry.stage);

test('typed response and authoritative reread have separately persisted evidence, with intent durable before transport', async () => {
  const f = fixture(), a = f.session(), gate = deferred(); f.gate(gate);
  try {
    await f.start(a);
    // Let the typed response resolve and reach the blocked authoritative survey.
    for (let count = 0; count < 30 && !f.persisted.some(run => run.actions[0].stages?.at(-1)?.stage === 'VERIFY'); count++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].beforeSend.actions[0].requestStatus, 'DISPATCHING');
    assert.equal(f.writes[0].beforeSend.actions[0].stages.at(-1).stage, 'DISPATCH_INTENT');
    const pending = JSON.parse(fs.readFileSync(f.file, 'utf8')).accounts.A[0];
    assert.equal(pending.actions[0].stages.at(-1).stage, 'VERIFY');
    assert.equal(pending.finalStatus, 'EXECUTING');
    assert.equal(pending.actions[0].result, 'NOT_EXECUTED');
    const recovered = createExecutionHistory({ file: f.file }).list('A')[0];
    assert.equal(recovered.finalStatus, 'UNKNOWN');
    assert.equal(recovered.actions[0].stages.at(-1).stage, 'VERIFY');
    assert.equal(recovered.actions[0].result, 'UNKNOWN');
    gate.resolve(); await f.service.settle('A');
    assert.deepEqual(stages(f.row()), ['SURVEY', 'RESOURCE_PREFLIGHT', 'DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'VERIFY', 'VERIFIED']);
    assert.equal(f.row().result, 'SUCCESS');
    for (const entry of f.row().stages) { assert.deepEqual(Object.keys(entry).sort(), ['stage', 'timestamp']); assert.equal(Number.isFinite(Date.parse(entry.timestamp)), true); }
    assert.equal(fs.readFileSync(f.file, 'utf8').includes('synthetic-response-must-not-persist'), false);
  } finally { gate.resolve(); await f.service.settle('A'); f.cleanup(); }
});

test('watch observation is distinct from response and only authority can append VERIFIED', async () => {
  for (const mutate of [false, true]) {
    const f = fixture({ watch: true, mutate }), a = f.session();
    try { await f.start(a); await f.service.settle('A'); const tokens = stages(f.row()); assert.equal(tokens.includes('RESPONSE'), false); assert.equal(tokens.includes('OBSERVATION_ENDED'), true); assert.equal(tokens.includes('VERIFIED'), mutate); assert.equal(f.row().result, mutate ? 'SUCCESS' : 'UNKNOWN'); assert.equal(a.client.uncertainWrites.size, mutate ? 0 : 1); }
    finally { f.cleanup(); }
  }
});

for (const failStage of ['SURVEY', 'RESOURCE_PREFLIGHT', 'DISPATCH_INTENT']) test(`history failure at ${failStage} prevents business transport`, async () => {
  const f = fixture({ failStage }), a = f.session();
  try { await f.start(a); await f.service.settle('A'); assert.equal(f.writes.length, 0); assert.equal(f.row().result, 'NOT_EXECUTED'); assert.equal(f.row().dispatched, false); assert.equal(a.client.uncertainWrites.size, 0); }
  finally { f.cleanup(); }
});

for (const failStage of ['DISPATCHED', 'RESPONSE', 'VERIFY', 'VERIFIED']) test(`history failure at ${failStage} retains UNKNOWN, reservation and fingerprint after transport`, async () => {
  const f = fixture({ failStage }), a = f.session();
  try { await f.start(a); await f.service.settle('A'); assert.equal(f.writes.length, 1); assert.equal(f.row().result, 'UNKNOWN'); assert.equal(f.row().unresolvedWrite, true); assert.deepEqual(f.row().resourceReservation, [{ id: 'wood', num: 1 }]); assert.equal(a.client.uncertainWrites.size, 1); assert.equal(f.history.unresolved('A'), true); await assert.rejects(f.service.plan(a, { module: 'fixture', mode: 'Manual', selections: ['fixture-write'] }), { code: 'RESPONSE_UNCERTAIN' }); }
  finally { f.cleanup(); }
});

test('post-dispatch history failure observes a later rejected transport promise and restart cannot resend', async () => {
  const f = fixture({ failStage: 'DISPATCHED', acknowledge: false, timeout: 5 }), a = f.session(); let restarted;
  try {
    await f.start(a); await f.service.settle('A');
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.row().result, 'UNKNOWN'); assert.equal(f.writes.length, 1);
    assert.equal(a.client.lateResponses.has('SaveFormationResponse'), true);
    a.client.onMessage(codec.encode('SaveFormationResponse', 0, { accepted: true, late: true }));
    assert.equal(a.client.uncertainWrites.size, 1); assert.equal(f.row().result, 'UNKNOWN');
    restarted = fixture({ historyFile: f.file }); const fresh = restarted.session();
    await assert.rejects(restarted.service.plan(fresh, { module: 'fixture', mode: 'Manual', selections: ['fixture-write'] }), { code: 'RECOVERY_UNCERTAIN' });
    assert.equal(restarted.writes.length, 0); assert.equal(restarted.history.list('A')[0].finalStatus, 'UNKNOWN');
  } finally { restarted?.cleanup(); f.cleanup(); }
});

test('watch evidence persistence failure keeps the sent write UNKNOWN without authority or resend', async () => {
  const f = fixture({ watch: true, failStage: 'OBSERVATION_ENDED' }), a = f.session();
  try { await f.start(a); await f.service.settle('A'); assert.equal(f.writes.length, 1); assert.equal(f.row().result, 'UNKNOWN'); assert.equal(stages(f.row()).includes('VERIFY'), false); assert.equal(f.row().unresolvedWrite, true); assert.equal(a.client.uncertainWrites.size, 1); assert.equal(f.history.unresolved('A'), true); }
  finally { f.cleanup(); }
});
