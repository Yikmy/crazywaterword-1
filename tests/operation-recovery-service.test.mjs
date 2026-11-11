import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';
import { RECOVERY_DISPATCH_CONTRACT } from '../src/operation-recovery.mjs';

const clone = value => structuredClone(value);
const context = { accountId: 'synthetic-A', playerId: '9007199254740993', worldId: 9, generation: 7, connectionId: 'synthetic-connection-A' };
const before = { presetId: 1, heroPositions: [{ heroId: 'h1', pos: { x: 0, y: 1 } }], petUid: '9007199254740995' };
const desired = { presetId: 2, heroPositions: [{ heroId: 'h1', pos: { x: 1, y: 1 } }], petUid: '9007199254740995' };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture({ receipt = true, notDispatched = false, seed = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-recovery-service-')), file = path.join(dir, 'history.json'), reads = [], writes = [];
  let now = Date.UTC(2026, 10, 11), owned = true, reply = () => ({ formation: clone(desired) });
  const assertWriter = () => { if (!owned) throw Object.assign(new Error('synthetic writer lost'), { code: 'WRITER_NOT_OWNED', statusCode: 409 }); };
  const history = createExecutionHistory({ file, assertWriter });
  const row = { module: 'formation', actionId: 'formation-save', actionType: 'SAVE', target: { module: 1, presetId: 2 }, costs: [],
    beforeState: clone(before), expectedState: clone(desired), result: 'UNKNOWN', requestStatus: 'UNKNOWN', dispatched: true, unresolvedWrite: true,
    resourceReservation: [], stages: ['SURVEY', 'RESOURCE_PREFLIGHT', 'DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'VERIFY', 'VERIFIED'].map(stage => ({ stage, timestamp: '2026-11-11T00:00:00.000Z' })),
    dispatchEvidence: { version: 1, contract: RECOVERY_DISPATCH_CONTRACT, state: 'DISPATCHED' },
    ...(receipt ? { verifiedReceipt: { version: 1, verified: true, request: 'SaveFormationRequest', response: 'SaveFormationResponse', module: 1,
      beforeFacts: { formation: clone(before), reliability: { formation: true } }, expectedState: clone(desired), responseEvidence: { formation: clone(desired) }, executionContext: clone(context) } } : {}),
  };
  if (notDispatched) {
    delete row.verifiedReceipt;
    Object.assign(row, { dispatched: false, unresolvedWrite: false, stages: [{ stage: 'SURVEY' }, { stage: 'RESOURCE_PREFLIGHT' }], dispatchEvidence: { version: 1, contract: RECOVERY_DISPATCH_CONTRACT, state: 'NOT_DISPATCHED' } });
  }
  const record = { runId: 'synthetic-run', accountId: context.accountId, executionContext: clone(context), module: 'formation', actions: [row], finalStatus: 'UNKNOWN',
    resourceBudget: [], authorizationSummary: { planHash: 'original-hash', actionIds: [row.actionId], resourceBudget: [] } };
  const client = { connected: true, pending: [], watchers: [], lateResponses: new Set(), uncertainWrites: new Set(['original-write']),
    request(name, body, responseName, timeout, options) { reads.push({ name, body, responseName, timeout, options }); assert.equal(name, 'GetFormationRequest'); assert.deepEqual(body, { module: 1 }); assert.equal(responseName, 'GetFormationResponse'); return Promise.resolve().then(() => reply(reads.length)); },
    send(...args) { writes.push(args); throw Error('Recovery must never send a business write'); },
    sendWatch(...args) { writes.push(args); throw Error('Recovery must never send a watched write'); },
  };
  const session = { id: context.accountId, player: { playerId: context.playerId, worldId: context.worldId }, generation: context.generation,
    connectionId: context.connectionId, client, state: 'READY', abort: new AbortController(), busy: null, loop: { running: false } };
  const planned = { actionId: 'fixture-only-plan', actionType: 'SAVE', costs: [], target: { module: 1, presetId: 2 }, beforeState: clone(before), expectedState: clone(desired), action: { request: 'SaveFormationRequest', response: 'SaveFormationResponse', body: { module: 1, formation: clone(desired) } } };
  const adapter = { id: 'fixture', defaultConfig: { enabled: true }, survey: async () => ({ stockReliable: true, stock: new Map() }),
    view: () => ({ candidates: [planned] }), plan: () => ({ actions: [planned] }) };
  const service = createOperationService({ history, assertWriter, protocol: { GetFormationRequest: {}, GetFormationResponse: {} }, clock: () => now,
    getConfig: () => ({ version: 1 }), loadRules: () => ({ config: { version: 1, enabled: true, rules: [] } }), loadProduction: () => ({ config: { version: 1, enabled: false } }),
    modules: { fixture: adapter }, moduleSettings: { get: () => ({ config: { enabled: true } }) } });
  if (seed) history.put(record);
  const preview = (payload = { runId: record.runId, actionId: row.actionId }) => service.previewRecovery(session, payload);
  const confirm = (shown, extra = {}) => service.confirmRecovery(session, { previewId: shown.previewId, previewHash: shown.previewHash, confirm: true, ...extra });
  return { dir, file, history, record, row, service, session, client, reads, writes, preview, confirm, seed: () => history.put(record),
    advance: ms => { now += ms; }, reply: fn => { reply = fn; }, loseWriter: () => { owned = false; },
    bytes: () => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, raw: () => JSON.parse(fs.readFileSync(file, 'utf8')).accounts[context.accountId][0],
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const events = f => f.history.list(context.accountId)[0].actions[0].reconciliations ?? [];
const assertReadOnly = f => { assert.equal(f.writes.length, 0); assert.equal(f.client.uncertainWrites.has('original-write'), true); };

test('service preview and confirmation bind two real collector reads to an append-only APPLIED event', async () => {
  const f = fixture();
  try {
    const original = f.raw(), bytes = f.bytes(), shown = await f.preview();
    assert.equal(typeof shown.previewId, 'string'); assert.equal(typeof shown.previewHash, 'string'); assert.notEqual(shown.previewId, shown.previewHash);
    assert.equal(f.reads.length, 1); assert.equal(f.bytes(), bytes); assert.equal(f.service.blocked(context.accountId), true); assert.equal(f.session.busy, null);
    await f.confirm(shown);
    assert.equal(f.reads.length, 2); assert.equal(events(f).length, 1); assert.equal(events(f)[0].status, 'APPLIED');
    const saved = f.raw(), { reconciliations, ...action } = saved.actions[0];
    assert.deepEqual(action, original.actions[0]); assert.equal(saved.finalStatus, 'UNKNOWN'); assert.deepEqual(saved.resourceBudget, original.resourceBudget); assert.deepEqual(saved.authorization, original.authorization);
    assert.equal(f.service.blocked(context.accountId), false); assert.equal(createExecutionHistory({ file: f.file }).unresolved(context.accountId), false);
    await assert.rejects(() => f.confirm(shown)); assert.equal(events(f).length, 1); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('legacy missing receipt remains UNKNOWN despite matching desired state and records only appended observation', async () => {
  const f = fixture({ receipt: false });
  try {
    const shown = await f.preview(); await f.confirm(shown);
    assert.equal(f.reads.length, 2); assert.equal(events(f)[0].status, 'STILL_UNKNOWN'); assert.equal(events(f)[0].evidence.observation.desiredStateMatches, true);
    assert.equal(f.service.blocked(context.accountId), true); assert.equal(f.raw().actions[0].result, 'UNKNOWN'); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('durable NOT_DISPATCHED barrier permits NOT_APPLIED without any read or replay', async () => {
  const f = fixture({ notDispatched: true });
  try {
    const original = f.raw(), shown = await f.preview(); await f.confirm(shown);
    assert.equal(f.reads.length, 0); assert.equal(events(f)[0].status, 'NOT_APPLIED'); assert.equal(events(f)[0].evidence.method, 'DURABLE_NOT_DISPATCHED_V1');
    const { reconciliations, ...action } = f.raw().actions[0]; assert.deepEqual(action, original.actions[0]); assert.equal(f.raw().finalStatus, 'UNKNOWN'); assert.equal(f.service.blocked(context.accountId), false); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('preview expires at sixty seconds and never appends or rereads after expiration', async () => {
  const f = fixture();
  try {
    const shown = await f.preview(), bytes = f.bytes(); f.advance(60001);
    await assert.rejects(() => f.confirm(shown)); assert.equal(f.reads.length, 1); assert.equal(f.bytes(), bytes); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('forged preview hash or missing explicit confirmation cannot append recovery evidence', async () => {
  for (const extra of [{ previewHash: 'forged' }, { confirm: false }, { confirm: undefined }, { allowPaid: true }]) {
    const f = fixture();
    try { const shown = await f.preview(), bytes = f.bytes(); await assert.rejects(() => f.confirm(shown, extra)); assert.equal(f.bytes(), bytes); assert.equal(f.reads.length, 1); assertReadOnly(f); }
    finally { f.cleanup(); }
  }
});

for (const [name, mutate] of [
  ['account', s => { s.id = 'synthetic-B'; }], ['player', s => { s.player.playerId = '9007199254740994'; }],
  ['world', s => { s.player.worldId = 10; }], ['generation', s => { s.generation++; }], ['connection', s => { s.connectionId = 'new-connection'; }],
  ['client', s => { s.client = { ...s.client }; }],
]) test('confirmation rejects changed ' + name + ' identity without a second read or persisted resolution', async () => {
  const f = fixture();
  try { const shown = await f.preview(), bytes = f.bytes(); mutate(f.session); await assert.rejects(() => f.confirm(shown)); assert.equal(f.reads.length, 1); assert.equal(f.bytes(), bytes); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f); }
  finally { f.cleanup(); }
});

test('history digest change invalidates a preview and preserves the independently appended evidence', async () => {
  const f = fixture();
  try {
    const shown = await f.preview(); f.history.appendReconciliation(context.accountId, f.record.runId, f.row.actionId, { status: 'STILL_UNKNOWN', timestamp: '2026-11-11T00:00:00.000Z', evidence: { reason: 'synthetic new evidence' } });
    const bytes = f.bytes(); await assert.rejects(() => f.confirm(shown)); assert.equal(f.bytes(), bytes); assert.equal(events(f).length, 1); assert.equal(f.reads.length, 1); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('a changed authoritative second read invalidates confirmation rather than silently committing its preview', async () => {
  const f = fixture();
  try {
    const shown = await f.preview(), bytes = f.bytes(); f.reply(() => ({ formation: clone(before) }));
    await assert.rejects(() => f.confirm(shown)); assert.equal(f.reads.length, 2); assert.equal(f.bytes(), bytes); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('recovery holds the existing account lock throughout a pending read and concurrent preview performs no second request', async () => {
  const f = fixture(), gate = deferred();
  try {
    f.reply(() => gate.promise); const first = f.preview(); await new Promise(resolve => setImmediate(resolve));
    assert.match(f.session.busy, /RECOVERY|recovery/); await assert.rejects(() => f.preview(), error => error.code === 'ACCOUNT_BUSY'); assert.equal(f.reads.length, 1);
    gate.resolve({ formation: clone(desired) }); await first; assert.equal(f.session.busy, null); assert.equal(events(f).length, 0); assertReadOnly(f);
  } finally { gate.resolve({ formation: clone(desired) }); f.cleanup(); }
});

test('generation replacement during preview cannot append a late read or clear a newer task owner', async () => {
  const f = fixture(), gate = deferred();
  try {
    f.reply(() => gate.promise); const pending = f.preview(); await new Promise(resolve => setImmediate(resolve));
    f.session.generation++; f.session.busy = 'new-owner'; gate.resolve({ formation: clone(desired) });
    await assert.rejects(() => pending); assert.equal(f.session.busy, 'new-owner'); assert.equal(events(f).length, 0); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f);
  } finally { gate.resolve({ formation: clone(desired) }); f.cleanup(); }
});

test('aborted recovery read ignores a later result and retains the original unresolved evidence', async () => {
  const f = fixture(), gate = deferred();
  try {
    f.reply(() => gate.promise); const pending = f.preview(); await new Promise(resolve => setImmediate(resolve)); f.session.abort.abort();
    await assert.rejects(() => pending); gate.resolve({ formation: clone(desired) }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(events(f).length, 0); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f);
  } finally { gate.resolve({ formation: clone(desired) }); f.cleanup(); }
});

for (const field of ['pending', 'watchers', 'lateResponses', 'promptUncertain']) test('recovery service refuses uncertain read transport ' + field + ' before any request', async () => {
  const f = fixture();
  try {
    f.client[field] = field === 'lateResponses' ? new Set(['GetFormationResponse']) : field === 'promptUncertain' ? true : [{}];
    await assert.rejects(() => f.preview(), error => error.code === 'RESPONSE_UNCERTAIN'); assert.equal(f.reads.length, 0); assert.equal(events(f).length, 0); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('writer loss before preview prevents read; writer loss during confirmation prevents append', async () => {
  for (const phase of ['preview', 'confirm']) {
    const f = fixture();
    try {
      if (phase === 'preview') { f.loseWriter(); await assert.rejects(() => f.preview(), error => error.code === 'WRITER_NOT_OWNED'); assert.equal(f.reads.length, 0); }
      else { const shown = await f.preview(); f.reply(() => { f.loseWriter(); return { formation: clone(desired) }; }); await assert.rejects(() => f.confirm(shown), error => error.code === 'WRITER_NOT_OWNED'); assert.equal(f.reads.length, 2); }
      assert.equal(events(f).length, 0); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f);
    } finally { f.cleanup(); }
  }
});

test('failed atomic recovery append retains original history and unresolved protection', async () => {
  const f = fixture();
  try {
    const shown = await f.preview(), bytes = f.bytes(), rename = fs.renameSync; fs.renameSync = () => { throw Error('synthetic rename failure'); };
    try { await assert.rejects(() => f.confirm(shown), error => error.code === 'HISTORY_UNAVAILABLE'); } finally { fs.renameSync = rename; }
    assert.equal(f.bytes(), bytes); assert.equal(f.service.blocked(context.accountId), true); assert.deepEqual(fs.readdirSync(f.dir), ['history.json']); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('successful reconciliation invalidates any older displayed and approved business plan', async () => {
  const f = fixture({ seed: false });
  try {
    f.client.uncertainWrites.clear();
    const plan = await f.service.plan(f.session, { module: 'fixture', mode: 'Manual', selections: ['fixture-only-plan'] });
    const authorization = { batchId: plan.batchId, planHash: plan.planHash, approvedActionIds: plan.actions.map(a => a.actionId), resourceBudget: plan.resourceBudget, confirm: true };
    f.service.authorize(f.session, authorization); f.seed();
    const shown = await f.preview(); await f.confirm(shown);
    assert.throws(() => f.service.authorize(f.session, authorization), error => error.code === 'STALE_PLAN'); assert.equal(f.writes.length, 0);
  } finally { f.cleanup(); }
});

test('preview expiry during the confirmation reread prevents appending an otherwise matching result', async () => {
  const f = fixture();
  try {
    const shown = await f.preview(), bytes = f.bytes(); f.advance(59999);
    f.reply(() => { f.advance(2); return { formation: clone(desired) }; });
    await assert.rejects(() => f.confirm(shown), error => error.code === 'STALE_RECOVERY');
    assert.equal(f.reads.length, 2); assert.equal(f.bytes(), bytes); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f);
  } finally { f.cleanup(); }
});

test('independent history changes during confirmation reread prevent append and preserve their first evidence', async () => {
  const f = fixture();
  try {
    const shown = await f.preview();
    f.reply(() => {
      f.history.appendReconciliation(context.accountId, f.record.runId, f.row.actionId, { status: 'STILL_UNKNOWN', timestamp: '2026-11-11T00:00:01.000Z', evidence: { reason: 'synthetic changed during read' } });
      return { formation: clone(desired) };
    });
    await assert.rejects(() => f.confirm(shown), error => error.code === 'STALE_RECOVERY');
    assert.equal(events(f).length, 1); assert.equal(events(f)[0].status, 'STILL_UNKNOWN'); assert.equal(f.service.blocked(context.accountId), true); assertReadOnly(f);
  } finally { f.cleanup(); }
});
