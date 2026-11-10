import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProductionHistory } from '../src/production-report.mjs';
const timestamp = '2026-11-10T04:00:00.000Z';
const collect = (extra = {}) => ({ actionId: 'collect-A', actionType: 'gainFactory', result: 'SUCCESS', verification: { status: 'CONFIRMED' }, timestamp,
  beforeState: { factory: { finishedProducts: [{ id: '布匹', num: 2 }] } }, afterState: { factory: { finishedProducts: [] } },
  beforeInventory: [{ id: '布匹', num: 0 }], afterInventory: [{ id: '布匹', num: 2 }], beforeInventoryReliable: true, afterInventoryReliable: true, ...extra });
const summarize = (actions, options = {}) => summarizeProductionHistory([{ runId: 'run-A', actions }], { date: '2026-11-10', ...options });

test('daily production report explicitly limits coverage and separates starts from collected quantities', () => {
  const report = summarize([collect(), { actionId: 'start-A', actionType: 'startProduce', result: 'SUCCESS', verification: { status: 'CONFIRMED' }, timestamp }]);
  assert.equal(report.coverage, 'tool-verified-only'); assert.equal(report.totalGameProduction, null);
  assert.equal(report.startedOperations, 1); assert.equal(report.collectedOperations, 1);
  assert.deepEqual(report.collected, [{ id: '布匹', num: 2 }]); assert.equal(report.timeZone, 'Asia/Shanghai');
});

test('only confirmed SUCCESS records contribute; planned, unknown, rejected and unconfirmed actions remain excluded', () => {
  const report = summarize([collect({ result: 'UNKNOWN' }), collect({ result: 'REJECTED' }), collect({ verification: { status: 'UNCONFIRMED' } }), collect({ verification: undefined })]);
  assert.equal(report.collectedOperations, 0); assert.deepEqual(report.collected, []);
});

test('day membership uses the requested timezone across midnight and ignores other days', () => {
  const actions = [collect({ timestamp: '2026-11-09T16:05:00Z' }), collect({ actionId: 'B', timestamp: '2026-11-10T16:05:00Z' })];
  assert.equal(summarize(actions).collectedOperations, 1);
  assert.equal(summarize(actions, { timeZone: 'UTC' }).collectedOperations, 1);
  assert.equal(summarize([actions[0]], { timeZone: 'UTC' }).collectedOperations, 0);
});

test('unknown timestamps are never assigned to today from a run-level timestamp', () => {
  const report = summarize([collect({ timestamp: undefined }), collect({ actionId: 'B', timestamp: 'not-a-date' }), collect({ actionId: 'C', timestamp: '2026-11-10' })]);
  assert.equal(report.collectedOperations, 0); assert.equal(report.notes.length > 1, true);
});

test('building product collection aggregates the same reliable asset and stock evidence as factories', () => {
  const report = summarize([collect({ actionType: 'collectProduct', beforeState: { product: [{ id: '木材', num: 3 }] }, afterState: { product: [{ id: '木材', num: 1 }] },
    beforeInventory: [{ id: '木材', num: 10 }], afterInventory: [{ id: '木材', num: 12 }] })]);
  assert.deepEqual(report.collected, [{ id: '木材', num: 2 }]);
});

test('missing quantity facts count only operations rather than invented production', () => {
  for (const action of [collect({ beforeState: null }), collect({ beforeInventory: [] }), collect({ afterInventoryReliable: false }),
    collect({ afterInventory: [{ id: '布匹', num: 1 }] }), collect({ beforeInventory: [{ id: '布匹', num: null }] }),
    collect({ beforeState: { factory: { finishedProducts: [{ id: '布匹' }] } } })]) {
    const report = summarize([action]); assert.equal(report.collectedOperations, 1); assert.deepEqual(report.collected, []);
    assert.equal(report.notes.length > 1, true);
  }
});

test('duplicate history records are counted once while distinct runs remain independent', () => {
  assert.equal(summarize([collect(), collect()]).collectedOperations, 1);
  const report = summarizeProductionHistory([{ runId: 'A', actions: [collect()] }, { runId: 'B', actions: [collect()] }], { date: '2026-11-10' });
  assert.equal(report.collectedOperations, 2); assert.deepEqual(report.collected, [{ id: '布匹', num: 4 }]);
});

test('unsafe totals and malformed assets never become rounded daily quantities', () => {
  const action = collect({ beforeState: { factory: { finishedProducts: [{ id: '布匹', num: Number.MAX_SAFE_INTEGER }, { id: '布匹', num: 1 }] } } });
  assert.deepEqual(summarize([action]).collected, []);
  const large = collect({ beforeState: { factory: { finishedProducts: [{ id: '布匹', num: Number.MAX_SAFE_INTEGER }] } }, afterInventory: [{ id: '布匹', num: Number.MAX_SAFE_INTEGER }] });
  const report = summarize([large, { ...large, actionId: 'B' }]); assert.deepEqual(report.collected, []);
});

test('invalid date, timezone and history shapes fail explicitly', () => {
  assert.throws(() => summarize([], { date: '2026-02-30' }), /日期/);
  assert.throws(() => summarize([], { date: '10-11-2026' }), /日期/);
  assert.throws(() => summarize([], { timeZone: 'Unknown/City' }));
  assert.throws(() => summarizeProductionHistory(null));
});

test('summary does not mutate persisted evidence or trust a collectedProducts claim without backing facts', () => {
  const action = collect({ beforeState: null, collectedProducts: [{ id: '布匹', num: 999 }] }), original = structuredClone(action);
  assert.deepEqual(summarize([action]).collected, []); assert.deepEqual(action, original);
});