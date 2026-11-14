import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProductionHistory, productionCoverageReport } from '../src/production-report.mjs';
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

test('coverage distinguishes quantified, unquantified, unresolved and excluded operations without proving full-day production', () => {
  const actions = [collect(), collect({actionId:'missing',afterInventoryReliable:false}),
    collect({actionId:'unknown',result:'UNKNOWN',requestStatus:'UNKNOWN',unresolvedWrite:true}),
    collect({actionId:'rejected',result:'REJECTED'}), collect({actionId:'other-day',timestamp:'2026-11-11T04:00:00Z'}),
    collect({actionId:'undated',timestamp:undefined}), collect({actionId:undefined}),
    {actionId:'start',actionType:'startProduce',result:'SUCCESS',verification:{status:'CONFIRMED'},timestamp}];
  const runs=[{runId:'A',actions}], report=summarizeProductionHistory(runs,{date:'2026-11-10'}), c=report.coverageDetails;
  assert.deepEqual(productionCoverageReport(runs,{date:'2026-11-10'}),c);
  assert.equal(c.source,'EXECUTION_HISTORY'); assert.equal(c.dateBasis,'LOCAL_CALENDAR');
  assert.equal(c.fullDayCoverage,false); assert.equal(c.gameDayKnown,false); assert.equal(c.totalGameProduction,null);
  assert.equal(c.quantifiedCollections,1); assert.equal(c.unquantifiedCollections,1); assert.equal(c.unresolvedOperations,1);
  assert.equal(c.otherOperations,1); assert.equal(c.undatedOperations,1); assert.equal(c.unidentifiedOperations,1);
  assert.deepEqual(report.collected,[{id:'布匹',num:2}]); assert.equal(report.collectedOperations,2); assert.equal(report.startedOperations,1);
});

test('empty history and completely quantified local history both retain unknown full-day coverage', () => {
  for(const actions of [[],[collect()]]) {
    const c=summarize(actions).coverageDetails;
    assert.equal(c.fullDayCoverage,false); assert.equal(c.gameDayKnown,false); assert.equal(c.totalGameProduction,null);
    assert.equal(c.unquantifiedCollections,0); assert.equal(c.unresolvedOperations,0);
  }
});

test('a confirmed result with an unresolved write is excluded using the shared uncertainty contract', () => {
  const report=summarize([collect({unresolvedWrite:true})]);
  assert.equal(report.collectedOperations,0); assert.deepEqual(report.collected,[]); assert.equal(report.coverageDetails.unresolvedOperations,1);
});

test('conflicting action identities exclude all versions regardless of history ordering', () => {
  const first=collect(), second=collect({afterInventory:[{id:'布匹',num:9}]});
  for(const actions of [[first,second],[second,first]]) {
    const report=summarize(actions); assert.equal(report.collectedOperations,0); assert.deepEqual(report.collected,[]);
    assert.equal(report.coverageDetails.conflictingRecords,1); assert.match(report.notes.join(' '),/冲突/);
  }
});

test('unresolved and confirmed copies of the same action never become a confirmed collection', () => {
  for(const actions of [[collect(),collect({result:'UNKNOWN'})],[collect({result:'UNKNOWN'}),collect()]]) {
    const report=summarize(actions); assert.equal(report.collectedOperations,0); assert.equal(report.coverageDetails.conflictingRecords,1);
  }
});

test('deduplication uses exact tuple identities including account without delimiter collisions', () => {
  const runs=[{accountId:'A',runId:'a:b',actions:[collect({actionId:'c'})]},
    {accountId:'A',runId:'a',actions:[collect({actionId:'b:c'})]},
    {accountId:'B',runId:'a',actions:[collect({actionId:'b:c'})]}];
  const report=summarizeProductionHistory(runs,{date:'2026-11-10'});
  assert.equal(report.collectedOperations,3); assert.deepEqual(report.collected,[{id:'布匹',num:6}]);
});

test('equivalent duplicate objects with reordered keys are counted once', () => {
  const a=collect(), b=Object.fromEntries(Object.entries(a).reverse());
  const report=summarize([a,b]); assert.equal(report.collectedOperations,1); assert.equal(report.coverageDetails.duplicateRecords,1);
  assert.equal(report.coverageDetails.conflictingRecords,0);
});

test('coverage exposes quantity overflow while preserving other proven resource totals', () => {
  const large=collect({beforeState:{factory:{finishedProducts:[{id:'布匹',num:Number.MAX_SAFE_INTEGER}]}},afterInventory:[{id:'布匹',num:Number.MAX_SAFE_INTEGER}]});
  const wood=collect({actionId:'wood',beforeState:{factory:{finishedProducts:[{id:'木材',num:1}]}},beforeInventory:[{id:'木材',num:0}],afterInventory:[{id:'木材',num:1}]});
  const report=summarize([large,{...large,actionId:'large-B'},wood]);
  assert.deepEqual(report.collected,[{id:'木材',num:1}]); assert.deepEqual(report.coverageDetails.unsafeResourceTotals,['布匹']);
});

test('missing identities are excluded rather than silently counted multiple times', () => {
  for(const runs of [[{actions:[collect()]}],[{runId:'A',actions:[collect({actionId:''})]}]]) {
    const report=summarizeProductionHistory(runs,{date:'2026-11-10'});
    assert.equal(report.collectedOperations,0); assert.deepEqual(report.collected,[]); assert.equal(report.coverageDetails.unidentifiedOperations,1);
  }
});

test('coverage is a pure projection and does not turn reconciliation claims into replay or quantity proof', () => {
  const action=collect({result:'UNKNOWN',requestStatus:'UNKNOWN',reconciliations:[{status:'APPLIED',evidence:{collectedProducts:[{id:'布匹',num:999}]}}]});
  const runs=[{runId:'A',actions:[action]}], original=structuredClone(runs);
  const c=productionCoverageReport(runs,{date:'2026-11-10'});
  assert.equal(c.unresolvedOperations,1); assert.equal(c.quantifiedCollections,0); assert.deepEqual(runs,original);
});


test('conflicting dates are detected before selecting the local calendar day', () => {
  for(const actions of [[collect(),collect({timestamp:'2026-11-11T04:00:00Z'})], [collect({timestamp:'2026-11-11T04:00:00Z'}),collect()]]) {
    const report=summarize(actions); assert.equal(report.collectedOperations,0); assert.equal(report.coverageDetails.conflictingRecords,1);
  }
});

test('conflicting nonproduction action type cannot conceal a collision with a production identity', () => {
  const report=summarize([collect(),collect({actionType:'UPGRADE'})]);
  assert.equal(report.collectedOperations,0); assert.equal(report.coverageDetails.conflictingRecords,1);
  assert.equal(summarize([collect({actionType:'UPGRADE'})]).coverageDetails.conflictingRecords,0);
});
