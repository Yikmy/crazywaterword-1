import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOperationRecovery, buildVerifiedReceipt, RECOVERY_DISPATCH_CONTRACT } from '../src/operation-recovery.mjs';

const clone = value => structuredClone(value);
const scope = { accountId: 'synthetic-A', playerId: '9007199254740993', worldId: 9, generation: 7, connectionId: 'synthetic-connection-A' };
const before = { presetId: 1, heroPositions: [{ heroId: 'h1', pos: { x: 0, y: 1 } }], petUid: '9007199254740995' };
const desired = { presetId: 2, heroPositions: [{ heroId: 'h1', pos: { x: 1, y: 1 } }], petUid: '9007199254740995' };
const wire = { GetFormationRequest: {}, GetFormationResponse: {} };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const reads = [], writes = [];
  const row = { module: 'formation', actionId: 'synthetic-formation-save', actionType: 'SAVE', target: { module: 1, presetId: 2 }, costs: [],
    beforeState: clone(before), expectedState: clone(desired), result: 'UNKNOWN', requestStatus: 'UNKNOWN', dispatched: true, unresolvedWrite: true,
    stages: ['SURVEY', 'RESOURCE_PREFLIGHT', 'DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'VERIFY', 'VERIFIED'].map(stage => ({ stage, timestamp: '2026-11-11T00:00:00.000Z' })),
    dispatchEvidence: { version: 1, contract: RECOVERY_DISPATCH_CONTRACT, state: 'DISPATCHED' },
    verifiedReceipt: { version: 1, verified: true, request: 'SaveFormationRequest', response: 'SaveFormationResponse', module: 1,
      beforeFacts: { formation: clone(before), reliability: { formation: true } }, expectedState: clone(desired), responseEvidence: { formation: clone(desired) }, executionContext: clone(scope) },
  };
  const run = { runId: 'synthetic-run', accountId: scope.accountId, executionContext: clone(scope), actions: [row], finalStatus: 'UNKNOWN' };
  const controller = new AbortController(), context = clone(scope);
  let reply = { formation: clone(desired) }, guard = () => {};
  const client = { connected: true, pending: [], watchers: [], lateResponses: new Set(), uncertainWrites: new Set(['original-write']),
    async request(...args) { reads.push(args); return typeof reply === 'function' ? reply(...args) : reply; },
    send(...args) { writes.push(args); throw new Error('Forbidden business send in recovery test'); },
    sendWatch(...args) { writes.push(args); throw new Error('Forbidden watched write in recovery test'); },
    confirmWatchedWrite() { throw new Error('Recovery collector cannot clear original transport evidence'); },
  };
  const options = { context, signal: controller.signal, clock: () => Date.UTC(2026, 10, 11), assertCurrent: () => guard() };
  return { row, run, client, reads, writes, context, controller, options,
    reply: value => { reply = value; }, guard: value => { guard = value; },
    collect: (changes = {}) => collectOperationRecovery(client, wire, run, row, { ...options, ...changes }),
  };
}
function notDispatched(f) {
  delete f.row.verifiedReceipt;
  Object.assign(f.row, { dispatched: false, unresolvedWrite: false, requestStatus: 'UNKNOWN', result: 'UNKNOWN', stages: [{ stage: 'SURVEY' }, { stage: 'RESOURCE_PREFLIGHT' }], dispatchEvidence: { version: 1, contract: RECOVERY_DISPATCH_CONTRACT, state: 'NOT_DISPATCHED' } });
}
function assertProtected(f, result) {
  assert.equal(result.status, 'STILL_UNKNOWN');
  assert.equal(f.writes.length, 0);
  assert.equal(f.client.uncertainWrites.has('original-write'), true);
  assert.equal(f.run.finalStatus, 'UNKNOWN');
}

test('complete persisted receipt plus fixed authoritative reread resolves APPLIED without changing original UNKNOWN or transport lock', async () => {
  const f = fixture(), original = JSON.stringify(f.run);
  const result = await f.collect();
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.evidence.reasonCode, 'RECEIPT_AND_AUTHORITY_CONFIRMED');
  assert.equal(result.evidence.observation.desiredStateMatches, true);
  assert.equal(result.evidence.checkedAt, '2026-11-11T00:00:00.000Z');
  assert.deepEqual(result.evidence.references, { runId: f.run.runId, actionId: f.row.actionId });
  assert.equal(f.reads.length, 1);
  const [request, body, response, timeout, options] = f.reads[0];
  assert.equal(request, 'GetFormationRequest'); assert.deepEqual(body, { module: 1 }); assert.equal(response, 'GetFormationResponse'); assert.equal(timeout, 15000);
  assert.deepEqual(Object.keys(options), ['signal']); assert.equal(options.signal, f.controller.signal);
  assert.equal(JSON.stringify(f.run), original); assert.equal(f.client.uncertainWrites.size, 1); assert.equal(f.writes.length, 0);
});

test('legacy record without execution scope remains UNKNOWN and performs no unbound read', async () => {
  const f = fixture(); delete f.run.executionContext;
  const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 0); assert.equal(result.evidence.reasonCode, 'SCOPE_MISMATCH');
});

for (const key of ['accountId', 'playerId', 'worldId', 'generation', 'connectionId']) test('current ' + key + ' must match the original locked execution identity', async () => {
  const f = fixture(); f.context[key] = key === 'accountId' ? 'synthetic-B' : key === 'playerId' ? '9007199254740994' : key === 'connectionId' ? 'synthetic-connection-B' : 100;
  const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 0); assert.equal(result.evidence.reasonCode, 'SCOPE_MISMATCH');
});

test('accountId alone never authorizes recovery when persisted player or world is absent or imprecise', async () => {
  for (const change of [ctx => { delete ctx.playerId; }, ctx => { ctx.worldId = null; }, ctx => { ctx.playerId = 9007199254740992; }]) {
    const f = fixture(); change(f.run.executionContext); const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 0);
  }
});

test('exact int64 strings remain exact and compare with equivalent safe numeric world identity', async () => {
  const f = fixture(); f.context.worldId = '9';
  const result = await f.collect(); assert.equal(result.status, 'APPLIED'); assert.equal(result.evidence.scope.playerId, '9007199254740993');
});

test('missing receipt leaves desired-state observation UNKNOWN even when current formation equals target', async () => {
  const f = fixture(); delete f.row.verifiedReceipt;
  const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 1); assert.equal(result.evidence.observation.desiredStateMatches, true); assert.equal(result.evidence.reasonCode, 'MISSING_VERIFIED_RECEIPT');
});

test('a persisted VERIFIED token alone cannot replace the typed reply and original before-facts receipt', async () => {
  const f = fixture(); f.row.verifiedReceipt = { version: 1, verified: true };
  const result = await f.collect(); assertProtected(f, result); assert.equal(result.evidence.observation.desiredStateMatches, true);
});

for (const [label, mutate] of [
  ['reply', receipt => { receipt.responseEvidence.formation.heroPositions[0].pos.x = 9; }],
  ['before identity', receipt => { receipt.beforeFacts.formation.presetId = 9; }],
  ['before reliability', receipt => { receipt.beforeFacts.reliability.formation = false; }],
  ['expected state', receipt => { receipt.expectedState.presetId = 9; }],
  ['scope', receipt => { receipt.executionContext.generation++; }],
  ['verified flag', receipt => { receipt.verified = false; }],
]) test('inconsistent persisted receipt ' + label + ' cannot resolve APPLIED', async () => {
  const f = fixture(); mutate(f.row.verifiedReceipt); assertProtected(f, await f.collect());
});

test('current before-state after possible dispatch never proves NOT_APPLIED', async () => {
  const f = fixture(); f.reply({ formation: clone(before) });
  const result = await f.collect(); assertProtected(f, result); assert.equal(result.evidence.observation.desiredStateMatches, false); assert.equal(result.evidence.reasonCode, 'STATE_NOT_CONFIRMED');
});

test('changed pet cannot be hidden behind an otherwise matching full formation', async () => {
  const f = fixture(); f.row.expectedState.petUid = '9007199254740997'; f.row.verifiedReceipt.expectedState = clone(f.row.expectedState); f.row.verifiedReceipt.responseEvidence.formation = clone(f.row.expectedState); f.reply({ formation: clone(f.row.expectedState) });
  const result = await f.collect(); assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'STATE_NOT_CONFIRMED');
});

test('hero ordering is immaterial but exact unique identities and positions remain required', async () => {
  const f = fixture(), second = { heroId: 'h2', pos: { x: 2, y: 0 } };
  for (const formation of [f.row.expectedState, f.row.verifiedReceipt.expectedState, f.row.verifiedReceipt.responseEvidence.formation]) formation.heroPositions.push(clone(second));
  const fresh = clone(f.row.expectedState); fresh.heroPositions.reverse(); f.reply({ formation: fresh });
  assert.equal((await f.collect()).status, 'APPLIED');
  fresh.heroPositions[0].heroId = 'h1'; f.reply({ formation: fresh }); assertProtected(f, await f.collect());
});

test('nonzero costs and unsupported modules or action types never trigger recovery reads', async () => {
  for (const change of [row => { row.costs = [{ id: 'diamond', num: 1 }]; }, row => { delete row.costs; }, row => { row.module = 'fleet'; }, row => { row.actionType = 'REPAIR'; }, row => { row.target.module = 2; }]) {
    const f = fixture(); change(f.row); const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 0); assert.equal(result.evidence.reasonCode, 'UNSUPPORTED_OPERATION');
  }
});

test('malformed, partial or empty expected formations do not become authoritative targets', async () => {
  for (const value of [{ presetId: 2 }, { presetId: 2, heroPositions: [] }, { ...clone(desired), arbitrary: true }, { ...clone(desired), heroPositions: [{ heroId: 'h1', pos: { x: 1 } }] }]) {
    const f = fixture(); f.row.expectedState = value; assertProtected(f, await f.collect()); assert.equal(f.reads.length, 0);
  }
});

test('fixed readonly request ignores arbitrary history action and transport parameters', async () => {
  const f = fixture(); f.row.action = { request: 'PayRequest', response: 'PayResponse', body: { amount: 99 } }; f.row.parameters = { url: 'https://invalid.example', request: 'DestroyRequest' };
  const result = await f.collect(); assert.equal(result.status, 'APPLIED'); assert.equal(f.reads.length, 1); assert.equal(f.reads[0][0], 'GetFormationRequest'); assert.deepEqual(f.reads[0][1], { module: 1 }); assert.equal(f.writes.length, 0);
});

test('collector selects persisted exact action and ignores caller-provided substitute row facts', async () => {
  const f = fixture(); delete f.row.verifiedReceipt;
  const fabricated = clone(fixture().row);
  const result = await collectOperationRecovery(f.client, wire, f.run, fabricated, f.options); assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'MISSING_VERIFIED_RECEIPT');
});

test('duplicate or missing action identity fails closed before read', async () => {
  for (const change of [run => { run.actions.push(clone(run.actions[0])); }, run => { run.actions = []; }]) {
    const f = fixture(); change(f.run); const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 0); assert.equal(result.evidence.reasonCode, 'INVALID_HISTORY');
  }
});

test('versioned NOT_DISPATCHED proof with no transport barrier resolves without any network request', async () => {
  const f = fixture(); notDispatched(f);
  const original = JSON.stringify(f.run), result = await f.collect();
  assert.equal(result.status, 'NOT_APPLIED'); assert.equal(result.evidence.method, 'DURABLE_NOT_DISPATCHED_V1'); assert.equal(result.evidence.readRequest, null); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0); assert.equal(JSON.stringify(f.run), original);
});

test('legacy NOT_DISPATCHED status and dispatched false without versioned durable evidence are insufficient', async () => {
  const f = fixture(); notDispatched(f); delete f.row.dispatchEvidence; f.row.requestStatus = 'NOT_DISPATCHED';
  const result = await f.collect(); assertProtected(f, result); assert.notEqual(result.status, 'NOT_APPLIED');
});

for (const stage of ['DISPATCH_INTENT', 'DISPATCHED', 'RESPONSE', 'OBSERVATION_ENDED', 'VERIFY', 'VERIFIED', 'UNRECOGNIZED']) test('stage ' + stage + ' prevents NOT_APPLIED despite a conflicting pre-dispatch marker', async () => {
  const f = fixture(); notDispatched(f); f.row.stages.push({ stage });
  const result = await f.collect(); assertProtected(f, result); assert.notEqual(result.status, 'NOT_APPLIED');
});

test('contradictory dispatch, unresolved write or successful evidence blocks NOT_APPLIED', async () => {
  for (const change of [row => { row.dispatched = true; }, row => { row.unresolvedWrite = true; }, row => { row.result = 'SUCCESS'; }, row => { row.requestStatus = 'SUCCESS'; }, row => { row.dispatchEvidence.version = 0; }, row => { row.dispatchEvidence.contract = 'legacy'; }, row => { row.stages = null; }]) {
    const f = fixture(); notDispatched(f); change(f.row); assertProtected(f, await f.collect());
  }
});

test('read failure never exposes raw transport error or resolves original uncertainty', async () => {
  const f = fixture(); f.reply(() => { throw new Error('synthetic-private-credential'); });
  const result = await f.collect(); assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'READ_FAILED'); assert.equal(JSON.stringify(result).includes('synthetic-private-credential'), false);
});

test('missing fixed protocol or disconnected client produces no read or write', async () => {
  const f = fixture(); const result = await collectOperationRecovery(f.client, {}, f.run, f.row, f.options); assertProtected(f, result); assert.equal(f.reads.length, 0);
  f.client.connected = false; assertProtected(f, await f.collect()); assert.equal(f.reads.length, 0);
});

for (const field of ['pending', 'watchers', 'lateResponses', 'promptUncertain']) test('uncertain readonly response context ' + field + ' blocks the fixed read', async () => {
  const f = fixture(); f.client[field] = field === 'lateResponses' ? new Set(['GetFormationResponse']) : field === 'promptUncertain' ? true : [{}];
  const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 0); assert.equal(result.evidence.reasonCode, 'READ_CONTEXT_UNCERTAIN');
});

test('pre-aborted recovery performs no read, including a seemingly safe NOT_DISPATCHED record', async () => {
  const f = fixture(); f.controller.abort();
  for (const mutate of [() => {}, () => notDispatched(f)]) { mutate(); const result = await f.collect(); assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'CANCELLED'); assert.equal(f.reads.length, 0); }
});

test('abort during authoritative read and late resolution never commit APPLIED or clear fingerprint', async () => {
  const f = fixture(), gate = deferred(); f.reply(() => gate.promise);
  const pending = f.collect(); f.controller.abort(); const result = await pending; assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'CANCELLED');
  gate.resolve({ formation: clone(desired) }); await new Promise(resolve => setImmediate(resolve)); assertProtected(f, result); assert.equal(f.reads.length, 1);
});

test('session generation changes during read leave UNKNOWN even if the typed read matches target', async () => {
  const f = fixture(), gate = deferred(); f.reply(() => gate.promise);
  const pending = f.collect(); f.context.generation++; gate.resolve({ formation: clone(desired) });
  const result = await pending; assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'SESSION_CHANGED');
});

test('service ownership guard prevents replaced client evidence from reaching APPLIED', async () => {
  const f = fixture(), gate = deferred(); f.reply(() => gate.promise);
  const pending = f.collect(); f.guard(() => { throw Object.assign(new Error('synthetic owner changed'), { code: 'CANCELLED' }); }); gate.resolve({ formation: clone(desired) });
  const result = await pending; assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'CANCELLED');
});

test('unreliable authoritative response is never replaced by expectedState from disk', async () => {
  for (const response of [{}, { formation: { presetId: 2 } }, { formation: { ...clone(desired), heroPositions: [] } }]) {
    const f = fixture(); f.reply(response); const result = await f.collect(); assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'UNRELIABLE_READ');
  }
});

test('invalid clock fails closed without transport or invented evidence timestamp', async () => {
  const f = fixture(); const result = await f.collect({ clock: () => NaN }); assertProtected(f, result); assert.equal(result.evidence.checkedAt, null); assert.equal(f.reads.length, 0);
});




test('same generation after process restart with a different connectionId remains UNKNOWN', async () => {
  const f = fixture(); f.context.connectionId = 'synthetic-restarted-client'; assert.equal(f.context.generation, f.run.executionContext.generation);
  const result = await f.collect(); assertProtected(f, result); assert.equal(result.evidence.reasonCode, 'SCOPE_MISMATCH'); assert.equal(f.reads.length, 0);
});

test('legacy context missing connectionId cannot unlock either a sent write or a NOT_DISPATCHED marker', async () => {
  const f = fixture(); delete f.run.executionContext.connectionId;
  assertProtected(f, await f.collect()); notDispatched(f); const result = await f.collect(); assertProtected(f, result); assert.equal(f.reads.length, 0);
});

test('receipt builder reuses original verification and projects only required non-secret facts', () => {
  const f = fixture();
  const candidate = { ...clone(f.row), action: { request: 'SaveFormationRequest', response: 'SaveFormationResponse', body: { module: 1, formation: clone(desired) } } };
  const beforeFacts = { formation: clone(before), reliability: { formation: true }, token: 'synthetic-secret-before', config: { credential: 'synthetic-secret-config' } };
  const afterFacts = { formation: clone(desired), reliability: { formation: true }, account: { token: 'synthetic-secret-after' } };
  const response = { formation: clone(desired), token: 'synthetic-secret-response' };
  const receipt = buildVerifiedReceipt(candidate, beforeFacts, afterFacts, response, { ...scope, credential: 'synthetic-secret-context' });
  assert.equal(receipt.verified, true);
  assert.deepEqual(receipt.beforeFacts, { formation: before, reliability: { formation: true } });
  assert.deepEqual(receipt.responseEvidence, { formation: desired });
  assert.equal(receipt.executionContext.connectionId, scope.connectionId);
  assert.equal(receipt.executionContext.playerId, scope.playerId);
  assert.equal(JSON.stringify(receipt).includes('synthetic-secret'), false);
  assert.deepEqual(Object.keys(receipt).sort(), ['beforeFacts', 'executionContext', 'expectedState', 'module', 'request', 'response', 'responseEvidence', 'verified', 'version']);
  assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
});

test('receipt builder refuses incomplete reply, mismatched write, changed pet, or absent original connection proof', () => {
  function inputs() {
    const f = fixture();
    return { candidate: { ...clone(f.row), action: { request: 'SaveFormationRequest', response: 'SaveFormationResponse', body: { module: 1, formation: clone(desired) } } },
      beforeFacts: { formation: clone(before), reliability: { formation: true } }, afterFacts: { formation: clone(desired), reliability: { formation: true } }, response: { formation: clone(desired) }, context: clone(scope) };
  }
  for (const change of [
    value => { delete value.response.formation; },
    value => { value.afterFacts.formation = clone(before); },
    value => { value.beforeFacts.reliability.formation = false; },
    value => { value.candidate.action.body.module = 2; },
    value => { value.candidate.action.body.formation = clone(before); },
    value => { value.candidate.action.request = 'UnlockFormationPresetRequest'; },
    value => { value.candidate.costs = [{ id: 'diamond', num: 1 }]; },
    value => { delete value.context.connectionId; },
    value => { value.beforeFacts.formation.petUid = 8; value.candidate.beforeState.petUid = 8; },
  ]) {
    const value = inputs(); change(value);
    assert.equal(buildVerifiedReceipt(value.candidate, value.beforeFacts, value.afterFacts, value.response, value.context), null);
  }
});

test('builder-generated receipt supports APPLIED only with later fixed authoritative state confirmation', async () => {
  const f = fixture(), candidate = { ...clone(f.row), action: { request: 'SaveFormationRequest', response: 'SaveFormationResponse', body: { module: 1, formation: clone(desired) } } };
  f.row.verifiedReceipt = buildVerifiedReceipt(candidate, { formation: clone(before), reliability: { formation: true } }, { formation: clone(desired), reliability: { formation: true } }, { formation: clone(desired) }, f.context);
  assert.equal((await f.collect()).status, 'APPLIED');
  f.reply({ formation: clone(before) }); assertProtected(f, await f.collect());
});
