import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProtocol } from '../src/proto.mjs';
import { collectState, summarize, formatState, toSnapshotJson } from '../src/game.mjs';
import { pirateSweepView } from '../src/pirate-sweep.mjs';

const protocol = loadProtocol();
const typed = (name, value) => protocol[name].decode(protocol[name].encode(value).finish());
const pirate = (uid, level, type = 1) => ({ uid, type, level, cityId: 17, gridIdx: 0 });
const state = (pirates = [pirate(1, 5)], records = [{ type: 1, maxKilledLevel: 5 }], sweepTimes = 2) => ({
  ok: {
    AllPirateRequest: typed('AllPirateResponse', { pirates, ...(sweepTimes === null ? {} : { sweepTimes }) }),
    PirateKillRecordRequest: typed('PirateKillRecordResponse', { records }),
  },
  failed: {},
});

test('current typed sweep count is used, while quota and remaining stay unknown', () => {
  const view = pirateSweepView(state([pirate(1, 5), pirate(2, 4), pirate(3, 6), pirate(4, 1, 2)]));
  assert.equal(view.usedSweeps, 2);
  assert.equal(view.totalSweeps, null);
  assert.equal(view.remainingSweeps, null);
  assert.equal(view.quotaReason, 'TOTAL_QUOTA_AUTHORITY_UNAVAILABLE');
  assert.equal(view.targetsStatus, 'AVAILABLE');
  assert.equal(view.killRecordsStatus, 'AVAILABLE');
  assert.deepEqual(view.targets.map(row => [row.uid, row.maxKilledLevel, row.levelRelation]), [
    [1, 5, 'ELIGIBLE_LEVEL'], [2, 5, 'LOWER_LEVEL_CONFIRMATION'],
    [3, 5, 'FIRST_KILL_REQUIRED'], [4, 0, 'FIRST_KILL_REQUIRED'],
  ]);
  assert.ok(view.targets.every(row => !Object.hasOwn(row, 'executable')));
});

test('own explicit zero is distinct from absent protobuf scalar defaults', () => {
  const omitted = state([], [], null), explicit = state([], [], 0);
  assert.equal(omitted.ok.AllPirateRequest.sweepTimes, 0, 'codec prototype default is deliberately present');
  assert.equal(Object.hasOwn(omitted.ok.AllPirateRequest, 'sweepTimes'), false);
  assert.equal(pirateSweepView(omitted).usedSweeps, null);
  assert.equal(pirateSweepView(explicit).usedSweeps, 0);
  assert.equal(pirateSweepView(omitted).targetsStatus, 'AVAILABLE');
  const noMax = state();
  noMax.ok.PirateKillRecordRequest = typed('PirateKillRecordResponse', { records: [{ type: 1 }] });
  assert.equal(noMax.ok.PirateKillRecordRequest.records[0].maxKilledLevel, 0);
  assert.equal(pirateSweepView(noMax).targets[0].levelRelation, 'UNKNOWN');
});

test('raw snapshot and failed/not-executed observations cannot resurrect old success data', () => {
  const sample = state();
  sample.raw = { AllPirateRequest: toSnapshotJson(typed('AllPirateResponse', { pirates: [], sweepTimes: 0 })) };
  assert.equal(pirateSweepView(sample).usedSweeps, 0);
  assert.deepEqual(pirateSweepView(sample).targets, []);
  for (const status of ['FAILED', 'NOT_EXECUTED', 'UNKNOWN']) {
    sample.outcomes = { AllPirateRequest: { status } };
    assert.equal(pirateSweepView(sample).usedSweeps, null);
    assert.equal(pirateSweepView(sample).targetsStatus, 'UNKNOWN');
  }
  for (const outcome of [null, {}, Object.create({ status: 'SUCCESS' })]) {
    sample.outcomes = { AllPirateRequest: outcome };
    assert.equal(pirateSweepView(sample).usedSweeps, null);
  }
  delete sample.outcomes;
  sample.failed.AllPirateRequest = 'timeout';
  assert.equal(pirateSweepView(sample).usedSweeps, null);
  const failedKills = state();
  failedKills.failed.PirateKillRecordRequest = 'timeout';
  const view = pirateSweepView(failedKills);
  assert.equal(view.usedSweeps, 2);
  assert.equal(view.targetsStatus, 'AVAILABLE');
  assert.equal(view.targets[0].maxKilledLevel, null);
  assert.equal(view.targets[0].levelRelation, 'UNKNOWN');
});

test('malformed or duplicate complete target lists do not expose a partial eligible target', () => {
  for (const list of [
    [pirate(1, 5), pirate(1, 6)], [pirate(1, 5), { uid: 2, type: 1, level: 5 }],
    [pirate(1, 5), pirate(0, 5)], [pirate(1, 5), pirate(2, -1)],
    [pirate(1, 5), { ...pirate(2, 5), cityId: 2147483648 }],
    [pirate(1, 5), { ...pirate(2, 5), type: '1' }],
    [pirate(1, 5), Object.create(pirate(2, 5))],
    Array(1),
  ]) {
    const sample = state();
    sample.ok.AllPirateRequest = { pirates: list, sweepTimes: 2 };
    const view = pirateSweepView(sample);
    assert.equal(view.usedSweeps, 2);
    assert.equal(view.targetsStatus, 'UNKNOWN');
    assert.deepEqual(view.targets, []);
  }
});

test('invalid kill records fail closed, while a complete empty record list proves first kill is required', () => {
  for (const records of [
    [{ type: 1, maxKilledLevel: 5 }, { type: 1, maxKilledLevel: 6 }],
    [{ type: 1, maxKilledLevel: -1 }], [{ type: 1, maxKilledLevel: 2147483648 }],
    [{ type: 1 }], [{ type: 0, maxKilledLevel: 5 }], Array(1),
  ]) {
    const sample = state();
    sample.ok.PirateKillRecordRequest = { records };
    const view = pirateSweepView(sample);
    assert.equal(view.killRecordsStatus, 'UNKNOWN');
    assert.equal(view.targets[0].levelRelation, 'UNKNOWN');
  }
  assert.equal(pirateSweepView(state([pirate(1, 1)], [])).targets[0].levelRelation, 'FIRST_KILL_REQUIRED');
});

test('counts are exact nonnegative int32 observations, never coercions or inherited state', () => {
  for (const sweepTimes of [-1, 2147483648, 1.5, '0', NaN, Infinity, undefined]) {
    const sample = state();
    sample.ok.AllPirateRequest = { pirates: [], sweepTimes };
    assert.equal(pirateSweepView(sample).usedSweeps, null);
  }
  const sample = state();
  sample.ok.AllPirateRequest = Object.assign(Object.create({ sweepTimes: 0 }), { pirates: [] });
  assert.equal(pirateSweepView(sample).usedSweeps, null);
});

test('real collector preserves absent and explicit quota scalar fields without adding requests or writes', async () => {
  for (const sweepTimes of [null, 0]) {
    const sent = [], fixture = state([], [], sweepTimes);
    const client = {
      async request(name, body) { sent.push([name, body]); return fixture.ok[name] ?? {}; },
      send() { throw Error('Forbidden write'); },
      sendWatch() { throw Error('Forbidden watched write'); },
    };
    const snapshot = await collectState(client, protocol);
    assert.equal(sent.length, 48);
    assert.equal(sent.filter(([name]) => name === 'AllPirateRequest').length, 1);
    assert.equal(sent.filter(([name]) => name === 'PirateKillRecordRequest').length, 1);
    assert.equal(sent.some(([name]) => name === 'PirateSweepRequest'), false);
    const view = summarize(snapshot);
    assert.equal(view.pirateSweep.usedSweeps, sweepTimes);
    assert.deepEqual(view.pirates, { count: 0, sweepTimes: sweepTimes === null ? undefined : 0 });
  }
});

test('summary and CLI distinguish used from unknown total/remaining and do not imply readiness', () => {
  const sample = state([pirate(1, 5)], [{ type: 1, maxKilledLevel: 5 }], 3);
  const view = summarize(sample);
  assert.deepEqual(view.pirates, { count: 1, sweepTimes: 3 }, 'legacy projection remains compatible');
  assert.equal(view.pirateSweep.targets[0].uid, 1);
  assert.match(formatState(view), /野怪扫荡：已用 3，总额 未知，剩余 未知；等级关系仅供查看/);
  const missing = summarize({ ok: {}, failed: {} });
  assert.equal(missing.pirateSweep.usedSweeps, null);
  assert.match(formatState(missing), /野怪扫荡：已用 未知，总额 未知，剩余 未知/);
});
