import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { configuredBaseOrderReward, parseReceivedOrderReward, orderRewardEvidenceScope, inspectOrderRewardEvidence } from '../src/order-rewards.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig, CONFIG_PACK_PATH } from '../src/config.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { createStateFact } from '../src/state-facts.mjs';
import { decorateOrderSurvey, planOrderExecution } from '../src/order-execution.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';

// Local bundled codecs/static config, genuine original order planner, synthetic
// identities and facts only. There is no client, transport, Runtime or file write.
const protocol = loadProtocol(), NOW = 1794355200000;
const context = { accountId: 'synthetic-order-rewards', playerId: '9007199254740993', worldId: 12, generation: 3, connectionId: 'synthetic-order-connection' };
const order = extra => ({ index: 0, workerId: 1, textId: 1, isSpecial: false, refreshTime: 0, requirements: [{ id: 'wood', num: 2 }], ...extra });
const config = () => ({ tables: { WorkerOrderCfg: { data: [
  { itemId: 'wood', reward: [['EXP', 100], ['GOLD', 30]] }, { itemId: 'cloth', reward: [['EXP', 200], ['GOLD', 90]] },
] }, WorkerSpecOrderCfg: { data: [{ times: '1', desc: 'synthetic special', reward: [['EXP', 40], ['GOLD', 30]] }] } } });
const round = (type, value) => protocol[type].decode(protocol[type].encode(value).finish());
const response = (num = 60, type = 1) => round('FinishWorkerOrderResponse', { reward: { asset: [{ type, id: 'GOLD', num }] } });
const resources = amount => round('AllResourceResponse', { list: [{ res: 3, amount }] });
function fixture({ costs = [{ id: 'wood', num: 2 }], received = 60, before = 100, after = 160, result = 'UNKNOWN' } = {}) {
  const raw = order({ requirements: costs.map(cost => ({ ...cost })) });
  const facts = decorateOrderSurvey({ orders: [{ ...raw, rewardExp: 100 }], stockReliable: true, stock: new Map(costs.map(cost => [cost.id, cost.num])) }, { workerOrder: [raw], orderOfTheDay: { orderNum: 2 } });
  const planned = planOrderExecution(facts, { rules: { version: 1, enabled: true, rules: [] } });
  const operation = { ...planned.actions[0], result, verification: { status: 'UNCONFIRMED' } };
  assert.ok(operation.identity, 'use original planner identity without copying its hash');
  const binding = { ...context, runId: 'synthetic-run', batchId: 'synthetic-batch', actionId: operation.actionId, identity: operation.identity, orderIndex: operation.target.index };
  const scope = orderRewardEvidenceScope(binding);
  const envelope = (source, value, sourceAt) => ({ binding: structuredClone(binding), fact: createStateFact(value, { accountId: context.accountId, generation: context.generation, source, sourceAt, scope, reliable: true }) });
  const options = { binding, currentContext: { ...context }, now: NOW, maxAgeMs: 30000,
    response: envelope('FinishWorkerOrderResponse', response(received), NOW - 2000),
    beforeResources: envelope('AllResourceResponse', resources(before), NOW - 3000),
    afterResources: envelope('AllResourceResponse', resources(after), NOW - 1000),
  };
  return { operation, options, inspect: () => inspectOrderRewardEvidence(operation, options) };
}
const blockedPreview = value => {
  assert.equal(value.minGoldEligible, false); assert.equal(value.finalPreview.status, 'BLOCKED_EVIDENCE');
  assert.equal(value.finalPreview.rewardGold, null); assert.equal(value.finalPreview.rewardExp, null);
};

test('normal configuration exposes separate unit rows and requested quantities without inventing the final multiplier or total', () => {
  const raw = order({ requirements: [{ id: 'wood', num: 2 }, { id: 'cloth', num: 3 }] });
  const output = configuredBaseOrderReward(config(), raw);
  assert.equal(output.status, 'CONFIGURED_BASE_ONLY'); assert.equal(output.reliable, true);
  assert.equal(output.configuredBaseReward.basis, 'PER_CONFIGURED_ITEM_UNIT');
  assert.deepEqual(output.configuredBaseReward.rows.map(row => [row.itemId, row.requiredQuantity, row.configuredReward.find(asset => asset.id === 'GOLD').num]), [['wood', 2, 30], ['cloth', 3, 90]]);
  assert.deepEqual(output.configuredBaseReward.rows[0].source, { table: 'WorkerOrderCfg', keyName: 'itemId', key: 'wood', rowIndex: 0 });
  assert.equal(Object.hasOwn(output.configuredBaseReward, 'rewardGold'), false); blockedPreview(output);
});

test('special configuration retains its exact times row without multiplying by ordinary quantities', () => {
  const output = configuredBaseOrderReward(config(), order({ isSpecial: true, requirements: [{ id: 'wood', num: 999 }] }));
  assert.equal(output.configuredBaseReward.basis, 'SPECIAL_CONFIG_ROW');
  assert.deepEqual(output.configuredBaseReward.rows[0].source, { table: 'WorkerSpecOrderCfg', keyName: 'times', key: '1', rowIndex: 0 });
  assert.deepEqual(output.configuredBaseReward.rows[0].configuredReward, [{ id: 'EXP', num: 40 }, { id: 'GOLD', num: 30 }]);
  assert.equal(Object.hasOwn(output.configuredBaseReward.rows[0], 'requiredQuantity'), false); blockedPreview(output);
});

test('repeated demand uses the existing safe resource aggregator while config data remains detached', () => {
  const c = config(), raw = order({ requirements: [{ id: 'wood', num: 1 }, { id: 'wood', num: 2 }] }), saved = structuredClone({ c, raw });
  const output = configuredBaseOrderReward(c, raw); assert.equal(output.configuredBaseReward.rows[0].requiredQuantity, 3);
  output.configuredBaseReward.rows[0].configuredReward[0].num = 999; assert.deepEqual({ c, raw }, saved);
  assert.equal(configuredBaseOrderReward(c, raw).configuredBaseReward.rows[0].configuredReward[0].num, 100);
});

test('the explicit local static 129 ordinary and 25 special rows supply GOLD units without promoting preview evidence', () => {
  assert.equal(fs.existsSync(CONFIG_PACK_PATH), true, 'the existing offline asset is required, never auto-download it');
  const local = loadConfig({ file: CONFIG_PACK_PATH }), ordinary = local.tables.WorkerOrderCfg.data, special = local.tables.WorkerSpecOrderCfg.data;
  assert.equal(ordinary.length, 129); assert.equal(special.length, 25);
  for (const row of ordinary) {
    const output = configuredBaseOrderReward(local, order({ requirements: [{ id: row.itemId, num: 1 }] }));
    assert.equal(output.reliable, true); assert.equal(output.configuredBaseReward.rows[0].configuredReward.find(asset => asset.id === 'GOLD').num, row.reward.find(asset => asset[0] === 'GOLD')[1]); blockedPreview(output);
  }
  for (const row of special) {
    const output = configuredBaseOrderReward(local, order({ isSpecial: true, textId: Number(row.times) }));
    assert.equal(output.reliable, true); assert.equal(output.configuredBaseReward.rows[0].source.key, row.times); blockedPreview(output);
  }
});

test('missing, ambiguous or malformed configured rows keep rewards unknown', () => {
  const changes = [
    c => { delete c.tables.WorkerOrderCfg; }, c => { c.tables.WorkerOrderCfg.data = []; },
    c => { c.tables.WorkerOrderCfg.data.push({ ...c.tables.WorkerOrderCfg.data[0] }); },
    c => { c.tables.WorkerOrderCfg.data[0].reward.push(['GOLD', 1]); },
    c => { c.tables.WorkerOrderCfg.data[0].reward = [['GOLD']]; },
    c => { c.tables.WorkerOrderCfg.data[0].reward = [['GOLD', -1]]; },
    c => { c.tables.WorkerOrderCfg.data[0].reward = [['GOLD', '9007199254740992']]; },
    c => { delete c.tables.WorkerOrderCfg.data[0].itemId; },
  ];
  for (const mutate of changes) { const c = config(); mutate(c); const output = configuredBaseOrderReward(c, order()); assert.equal(output.reliable, false); assert.equal(output.configuredBaseReward, null); blockedPreview(output); }
  const c = config(); c.tables.WorkerSpecOrderCfg.data.push({ times: 1, reward: [['GOLD', 1]] });
  assert.equal(configuredBaseOrderReward(c, order({ isSpecial: true })).reliable, false);
  assert.equal(configuredBaseOrderReward(config(), order({ textId: 99, isSpecial: true })).reason, 'CONFIG_ROW_MISSING');
});

test('missing GOLD configuration never becomes an explicit zero GOLD reward', () => {
  const c = config(); c.tables.WorkerOrderCfg.data[0].reward = [['EXP', 100]];
  const output = configuredBaseOrderReward(c, order()); assert.equal(output.reliable, true);
  assert.equal(output.configuredBaseReward.rows[0].configuredReward.some(asset => asset.id === 'GOLD'), false); blockedPreview(output);
});

test('partial order flags, unsafe or sparse requirements and inherited required fields cannot supply configuration evidence', () => {
  for (const raw of [null, {}, order({ isSpecial: undefined }), order({ requirements: [] }), order({ requirements: [{ id: 'wood', num: 0 }] }), order({ requirements: [{ id: 'wood', num: 9007199254740992 }] }), order({ requirements: new Array(2) }), Object.create(order())]) {
    assert.equal(configuredBaseOrderReward(config(), raw).reliable, false);
  }
  assert.equal(configuredBaseOrderReward(config(), order({ requirements: [{ id: 'wood', num: Number.MAX_SAFE_INTEGER }, { id: 'wood', num: 1 }] })).reliable, false);
});

test('real required-field codec failures are not replaced by inherited protobuf zero defaults', () => {
  assert.throws(() => protocol.DisplayAsset.decode(new Uint8Array()), /missing required/);
  assert.equal(parseReceivedOrderReward(round('FinishWorkerOrderResponse', {})).reliable, false);
  assert.equal(parseReceivedOrderReward({ reward: { asset: [Object.create({ type: 1, id: 'GOLD', num: 0 })] } }).reliable, false);
});

test('genuine typed response yields exact GOLD and preserves item/resource namespaces', () => {
  const raw = round('FinishWorkerOrderResponse', { reward: { asset: [{ type: 0, id: 'GOLD', num: 999 }, { type: 1, id: 'GOLD', num: 60 }, { type: 1, id: 'EXP', num: 200 }] } });
  const parsed = parseReceivedOrderReward(raw); assert.equal(parsed.reliable, true); assert.equal(parsed.receivedGold, 60); assert.equal(parsed.goldEvidence, true); assert.equal(parsed.assets.length, 3);
  const item = parseReceivedOrderReward(response(999, 0)); assert.equal(item.reliable, true); assert.equal(item.receivedGold, null); assert.equal(item.goldEvidence, false);
});

test('int64 quantities retain exact safe bounds and reject rounding, negatives and malformed Long objects', () => {
  assert.equal(parseReceivedOrderReward(response(String(Number.MAX_SAFE_INTEGER))).receivedGold, Number.MAX_SAFE_INTEGER);
  for (const num of ['9007199254740992', '-1', '9223372036854775807']) assert.equal(parseReceivedOrderReward(response(num)).reliable, false);
  for (const num of [9007199254740992, NaN, Infinity, -1, true, '1.5', { low: 1, high: 0, unsigned: 'true' }]) {
    assert.equal(parseReceivedOrderReward({ reward: { asset: [{ type: 1, id: 'GOLD', num }] } }).reliable, false);
  }
});

test('empty or missing rewards stay unknown while an explicit typed zero GOLD remains distinct', () => {
  for (const raw of [null, {}, { reward: null }, { reward: {} }, { reward: { asset: [] } }, { reward: { asset: new Array(1) } }]) {
    const parsed = parseReceivedOrderReward(raw); assert.equal(parsed.reliable, false); assert.equal(parsed.receivedGold, null);
  }
  const zero = parseReceivedOrderReward(response(0)); assert.equal(zero.reliable, true); assert.equal(zero.receivedGold, 0); assert.equal(zero.goldEvidence, true);
});

test('duplicate typed rewards and unsupported fields/types cannot be added together or reinterpreted', () => {
  for (const raw of [
    { reward: { asset: [{ type: 1, id: 'GOLD', num: 1 }, { type: 1, id: 'GOLD', num: 2 }] } },
    { reward: { asset: [{ type: 2, id: 'GOLD', num: 30 }] } },
    { reward: { asset: [{ type: '1', id: 'GOLD', num: 30 }] } },
    { reward: { asset: [{ type: 1, id: 'GOLD', num: 30, total: 30 }] } },
    { reward: { asset: [{ type: 1, id: ' GOLD', num: 30 }] } },
    { reward: { asset: [{ type: 1, id: 'GOLD', num: 30 }] }, rewardGold: 30 },
  ]) assert.equal(parseReceivedOrderReward(raw).reliable, false);
});

test('pure parsers never evaluate getters or mutate typed response/config inputs', () => {
  let invoked = 0; const malicious = {}; Object.defineProperty(malicious, 'reward', { enumerable: true, get() { invoked++; return {}; } });
  assert.equal(parseReceivedOrderReward(malicious).reliable, false);
  const c = config(); Object.defineProperty(c.tables.WorkerOrderCfg.data[0], 'reward', { enumerable: true, get() { invoked++; return []; } });
  assert.equal(configuredBaseOrderReward(c, order()).reliable, false); assert.equal(invoked, 0);
  const raw = response(), before = toSnapshotJson(raw), parsed = parseReceivedOrderReward(raw); parsed.assets[0].num = 999; assert.deepEqual(toSnapshotJson(raw), before);
});

test('evidence is correlated to the genuine original planner identity without recreating or replacing it', () => {
  const f = fixture(), saved = structuredClone({ operation: f.operation, options: f.options }), output = f.inspect();
  assert.equal(output.status, 'EVIDENCE_ONLY'); assert.equal(output.verification.status, 'MATCHED');
  assert.deepEqual(output.verification, { status: 'MATCHED', reason: 'TYPED_REWARD_AND_GOLD_NET_CHANGE_MATCH', receivedGold: 60, goldDebit: 0, beforeGold: 100, afterGold: 160, observedDelta: 60, expectedDelta: 60 });
  assert.equal(output.operationStatusUnchanged, true); assert.deepEqual(f.operation, saved.operation); assert.deepEqual(f.options, saved.options); blockedPreview(output);
});

test('an explicitly configured GOLD input is debited from the typed reward when checking net resources', () => {
  const f = fixture({ costs: [{ id: 'GOLD', num: 20 }], received: 60, before: 100, after: 140 }), output = f.inspect();
  assert.equal(output.verification.status, 'MATCHED'); assert.equal(output.verification.goldDebit, 20); assert.equal(output.verification.expectedDelta, 40);
});

test('zero received GOLD matches unchanged balance only when explicitly present in the typed response', () => {
  const f = fixture({ received: 0, before: 100, after: 100 }); assert.equal(f.inspect().verification.status, 'MATCHED');
  f.options.response.fact.value = {}; assert.equal(f.inspect().verification.status, 'UNKNOWN'); assert.equal(f.inspect().verification.receivedGold, null);
});

test('a typed successful response with wrong, absent or unsafe resource change remains unconfirmed evidence', () => {
  for (const after of [100, 159, 161]) {
    const f = fixture({ after }), output = f.inspect(); assert.equal(output.verification.status, 'UNCONFIRMED'); assert.equal(output.verification.reason, 'GOLD_NET_CHANGE_MISMATCH'); assert.equal(f.operation.result, 'UNKNOWN');
  }
  for (const list of [[], [{ res: 3 }], [{ res: 3, amount: -1 }], [{ res: '3', amount: 160 }], [{ res: 3, amount: '9007199254740992' }], [{ res: 3, amount: 160 }, { res: 3, amount: 160 }]]) {
    const f = fixture(); f.options.afterResources.fact.value = { list }; assert.equal(f.inspect().verification.status, 'UNKNOWN');
  }
});

test('negative expected net changes from explicit GOLD costs remain exact and do not spend the reward twice', () => {
  const f = fixture({ costs: [{ id: 'GOLD', num: 80 }], received: 60, before: 100, after: 80 }), output = f.inspect();
  assert.equal(output.verification.status, 'MATCHED'); assert.equal(output.verification.observedDelta, -20); assert.equal(output.verification.expectedDelta, -20);
});

test('missing, ambiguous or unsafe cost declarations do not infer zero GOLD debit', () => {
  for (const costs of [undefined, null, [{ id: '3', num: 1 }], [{ id: '金币', num: 1 }], [{ id: 'GOLD' }], [{ id: 'GOLD', num: '9007199254740992' }], [{ id: 'GOLD', num: Number.MAX_SAFE_INTEGER }, { id: 'GOLD', num: 1 }]]) {
    const f = fixture(); f.operation.costs = costs; assert.equal(f.inspect().verification.status, 'UNKNOWN');
  }
});

test('current account, player, world, generation and connection must all match the original locked context', () => {
  for (const [key, value] of Object.entries({ accountId: 'other', playerId: '9007199254740994', worldId: 13, generation: 4, connectionId: 'other' })) {
    const f = fixture(); f.options.currentContext[key] = value; assert.equal(f.inspect().verification.reason, 'EXECUTION_CONTEXT_MISMATCH');
  }
  const f = fixture(); f.options.currentContext.worldId = '12'; assert.equal(f.inspect().verification.status, 'MATCHED');
  f.options.currentContext.playerId = 9007199254740993; assert.equal(f.inspect().verification.status, 'UNKNOWN');
});

test('each response and balance envelope must bind the same run, batch, action, opaque identity and exact order index', () => {
  for (const envelope of ['response', 'beforeResources', 'afterResources']) for (const [key, value] of Object.entries({ accountId: 'other', playerId: '5', worldId: 13, generation: 4, connectionId: 'new', runId: 'new-run', batchId: 'new-batch', actionId: 'new-action', identity: 'changed-original-identity', orderIndex: 1 })) {
    const f = fixture(); f.options[envelope].binding[key] = value; assert.equal(f.inspect().verification.reason, 'EVIDENCE_BINDING_MISMATCH');
  }
});

test('changing original operation identity, target, kind or module cannot borrow another matched response', () => {
  for (const mutate of [o => { o.identity = 'other'; }, o => { o.actionId = 'other'; }, o => { o.target.index = 1; }, o => { o.actionType = 'REFRESH'; }, o => { o.module = 'city'; }]) {
    const f = fixture(); mutate(f.operation); assert.equal(f.inspect().verification.reason, 'ORIGINAL_OPERATION_MISMATCH');
  }
});

test('scope key changes on every original binding boundary and canonical safe game IDs compare equivalently', () => {
  const f = fixture(), original = orderRewardEvidenceScope(f.options.binding); assert.equal(original.kind, 'ENTITY'); assert.ok(original.key.length < 256);
  for (const key of ['accountId', 'playerId', 'worldId', 'generation', 'connectionId', 'runId', 'batchId', 'actionId', 'identity', 'orderIndex']) {
    const value = structuredClone(f.options.binding); value[key] = key === 'generation' || key === 'orderIndex' ? value[key] + 1 : key === 'playerId' || key === 'worldId' ? '17' : value[key] + '-other'; assert.notDeepEqual(orderRewardEvidenceScope(value), original);
  }
  assert.deepEqual(orderRewardEvidenceScope({ ...f.options.binding, worldId: '12' }), original);
  for (const input of [null, {}, { ...f.options.binding, generation: -1 }, { ...f.options.binding, identity: '' }, { ...f.options.binding, orderIndex: '0' }]) assert.equal(orderRewardEvidenceScope(input), null);
});

test('facts require exact source, account, generation, scope, freshness and reliable provenance', () => {
  const mutations = [
    p => { p.source = 'SCUpdateResource'; }, p => { p.source = 'Snapshot'; }, p => { p.accountId = 'other'; }, p => { p.generation++; },
    p => { p.scope = { kind: 'ACCOUNT' }; }, p => { p.scope.key = 'another-scope'; }, p => { p.reliability = 'UNKNOWN'; },
    p => { p.sourceAt = NOW - 30001; }, p => { p.sourceAt = NOW + 1; }, p => { delete p.sourceAt; },
  ];
  for (const key of ['response', 'beforeResources', 'afterResources']) for (const mutate of mutations) {
    const f = fixture(); mutate(f.options[key].fact.provenance); assert.equal(f.inspect().verification.reason, 'EVIDENCE_SOURCE_OR_FRESHNESS_UNKNOWN');
  }
});

test('balance reads must bracket the exact typed response rather than borrowing a later or earlier snapshot', () => {
  const f = fixture(); f.options.beforeResources.fact.provenance.sourceAt = NOW - 1500; assert.equal(f.inspect().verification.reason, 'EVIDENCE_TIME_ORDER_INVALID');
  const g = fixture(); g.options.afterResources.fact.provenance.sourceAt = NOW - 2500; assert.equal(g.inspect().verification.reason, 'EVIDENCE_TIME_ORDER_INVALID');
  const sameMillisecond = fixture(); for (const key of ['response', 'beforeResources', 'afterResources']) sameMillisecond.options[key].fact.provenance.sourceAt = NOW - 1000;
  assert.equal(sameMillisecond.inspect().verification.status, 'MATCHED');
});

test('matching reward diagnostics never change UNKNOWN, resource reservations, permit state or MIN_GOLD availability', () => {
  const f = fixture(), ledger = new ResourceLedger(new Map([['wood', 2], ['GOLD', 100]]));
  assert.equal(ledger.reserve(f.operation.costs), true); const saved = structuredClone(f.operation), reservedBefore = [...ledger.reserved];
  const output = f.inspect(); assert.equal(output.verification.status, 'MATCHED'); assert.deepEqual(f.operation, saved);
  assert.equal(f.operation.result, 'UNKNOWN'); assert.deepEqual([...ledger.reserved], reservedBefore); assert.equal(ledger.available('wood'), 0);
  assert.equal(Object.hasOwn(output, 'permit'), false); assert.equal(Object.hasOwn(output, 'confirmed'), false); assert.equal(Object.hasOwn(output, 'result'), false); blockedPreview(output);
});

test('a reward cannot hide an impossible pre-dispatch GOLD deficit even when the arithmetic net would match', () => {
  const f = fixture({ costs: [{ id: 'GOLD', num: 80 }], received: 100, before: 20, after: 40 });
  assert.equal(f.inspect().verification.status, 'UNKNOWN'); assert.equal(f.inspect().verification.reason, 'GOLD_DEBIT_EXCEEDS_BEFORE_BALANCE');
});

test('caller freshness options cannot extend the fixed thirty-second evidence boundary', () => {
  for (const maxAgeMs of [Infinity, NaN, -1, 30001, '30000']) {
    const f = fixture(); f.options.maxAgeMs = maxAgeMs; assert.equal(f.inspect().verification.status, 'UNKNOWN');
  }
  for (const now of [NaN, Infinity, -1]) { const f = fixture(); f.options.now = now; assert.equal(f.inspect().verification.status, 'UNKNOWN'); }
});

test('scope accessors, hidden envelope data and inherited fact fields never invoke caller code or gain provenance', () => {
  let reads = 0; const f = fixture(), scope = { key: 'ignored' };
  Object.defineProperty(scope, 'kind', { enumerable: true, get() { reads++; return 'ENTITY'; } });
  f.options.response.fact.provenance.scope = scope; assert.equal(f.inspect().verification.status, 'UNKNOWN'); assert.equal(reads, 0);
  const g = fixture(); g.options.response.fact = Object.create(g.options.response.fact); assert.equal(g.inspect().verification.status, 'UNKNOWN');
  const h = fixture(); Object.defineProperty(h.options.response, 'unseen', { value: true }); assert.equal(h.inspect().verification.status, 'UNKNOWN');
});

test('a parsed response with only non-GOLD resources is evidence of that package and never an invented zero GOLD reward', () => {
  const f = fixture(); f.options.response.fact.value = toSnapshotJson(round('FinishWorkerOrderResponse', { reward: { asset: [{ type: 1, id: 'EXP', num: 200 }] } }));
  const out = f.inspect(); assert.equal(out.receivedReward.reliable, true); assert.equal(out.receivedReward.receivedGold, null);
  assert.equal(out.verification.status, 'UNKNOWN'); assert.equal(out.verification.reason, 'TYPED_GOLD_REWARD_MISSING');
});

test('int64 resource balances at the safe boundary compare exactly and ambiguous unrelated resource rows remain unknown', () => {
  const f = fixture({ before: String(Number.MAX_SAFE_INTEGER - 60), after: String(Number.MAX_SAFE_INTEGER) });
  assert.equal(f.inspect().verification.status, 'MATCHED'); assert.equal(f.inspect().verification.observedDelta, 60);
  const g = fixture(); g.options.afterResources.fact.value.list.push({ res: 4, amount: '9007199254740992' });
  assert.equal(g.inspect().verification.status, 'UNKNOWN');
});

test('stale response facts cannot be repaired by changing only a caller summary or recorded operation outcome', () => {
  const f = fixture(); f.options.response.fact.provenance.sourceAt = NOW - 30001; f.operation.result = 'SUCCESS'; f.operation.verification.status = 'CONFIRMED';
  const output = f.inspect(); assert.equal(output.verification.status, 'UNKNOWN'); assert.equal(output.receivedReward, null);
  assert.equal(f.operation.result, 'SUCCESS'); assert.equal(f.operation.verification.status, 'CONFIRMED'); blockedPreview(output);
});

test('proven client base preview safely sums ordinary units but keeps final reward and MIN_GOLD blocked',()=>{
 const c=config(),raw=order({requirements:[{id:'wood',num:2},{id:'cloth',num:3}]}),before=structuredClone({c,raw}),out=configuredBaseOrderReward(c,raw),p=out.clientBasePreview;
 assert.equal(p.status,'CLIENT_BASE_PREVIEW');assert.equal(p.formula,'SUM_CONFIG_UNIT_REWARD_TIMES_REQUIREMENT_QUANTITY');assert.equal(p.scope,'CLIENT_BASE_ONLY_BONUSES_NOT_APPLIED');assert.equal(p.rewardGold,330);assert.equal(p.rewardExp,800);assert.equal(p.minGoldEligible,false);assert.match(p.source,/WorkerOrderPop/);blockedPreview(out);assert.deepEqual({c,raw},before);
 p.assets[0].num=9;assert.equal(configuredBaseOrderReward(c,raw).clientBasePreview.rewardExp,800);
 const repeated=configuredBaseOrderReward(c,order({requirements:[{id:'wood',num:1},{id:'wood',num:2}]})).clientBasePreview;assert.equal(repeated.rewardGold,90);assert.equal(repeated.rewardExp,300);
});
test('special base preview never multiplies configured reward by requested quantities',()=>{
 const out=configuredBaseOrderReward(config(),order({isSpecial:true,requirements:[{id:'wood',num:999},{id:'cloth',num:1000}]}));assert.equal(out.clientBasePreview.formula,'SPECIAL_CONFIG_REWARD_UNMULTIPLIED');assert.equal(out.clientBasePreview.rewardGold,30);assert.equal(out.clientBasePreview.rewardExp,40);blockedPreview(out);
});
test('base preview uses every actual local normal and special row with the proven formula',()=>{
 const local=loadConfig({file:CONFIG_PACK_PATH});for(const row of local.tables.WorkerOrderCfg.data){const out=configuredBaseOrderReward(local,order({requirements:[{id:row.itemId,num:3}]}));assert.equal(out.clientBasePreview.status,'CLIENT_BASE_PREVIEW');for(const[id,num]of row.reward)assert.equal(out.clientBasePreview.assets.find(v=>v.id===id).num,num*3);blockedPreview(out);}
 for(const row of local.tables.WorkerSpecOrderCfg.data){const out=configuredBaseOrderReward(local,order({isSpecial:true,textId:Number(row.times),requirements:[{id:'wood',num:9}]}));assert.equal(out.clientBasePreview.status,'CLIENT_BASE_PREVIEW');for(const[id,num]of row.reward)assert.equal(out.clientBasePreview.assets.find(v=>v.id===id).num,num);blockedPreview(out);}
});
test('unsafe products and accumulated base totals do not destroy valid static source evidence',()=>{
 for(const which of ['product','sum']){const c=config();c.tables.WorkerOrderCfg.data[0].reward=[['GOLD',which==='product'?Number.MAX_SAFE_INTEGER:Number.MAX_SAFE_INTEGER-1]];c.tables.WorkerOrderCfg.data[1].reward=[['GOLD',2]];const raw=which==='product'?order():order({requirements:[{id:'wood',num:1},{id:'cloth',num:1}]});const out=configuredBaseOrderReward(c,raw);assert.equal(out.reliable,true);assert.equal(out.status,'CONFIGURED_BASE_ONLY');assert.equal(out.clientBasePreview.status,'UNKNOWN');assert.equal(out.clientBasePreview.rewardGold,null);blockedPreview(out);}
 const c=config();c.tables.WorkerOrderCfg.data[0].reward=[['GOLD',Number.MAX_SAFE_INTEGER]];const out=configuredBaseOrderReward(c,order({requirements:[{id:'wood',num:1}]}));assert.equal(out.clientBasePreview.rewardGold,Number.MAX_SAFE_INTEGER);
});
test('explicit base zero remains distinct from absent or invalid GOLD and cannot enable MIN_GOLD',()=>{
 const c=config();c.tables.WorkerOrderCfg.data[0].reward=[['GOLD',0],['EXP',1]];let out=configuredBaseOrderReward(c,order());assert.equal(out.clientBasePreview.rewardGold,0);blockedPreview(out);c.tables.WorkerOrderCfg.data[0].reward=[['EXP',1]];out=configuredBaseOrderReward(c,order());assert.equal(out.clientBasePreview.rewardGold,null);blockedPreview(out);out=configuredBaseOrderReward(c,order({requirements:[{id:'missing',num:1}]}));assert.equal(out.clientBasePreview.status,'UNKNOWN');assert.equal(out.clientBasePreview.rewardGold,null);blockedPreview(out);
});
