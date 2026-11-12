import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { extractTables } from '../src/config.mjs';
import { createCodec } from '../src/codec.mjs';
import { FISHING_VIEW_EVIDENCE, fishingView } from '../src/fishing-view.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { loadProtocol } from '../src/proto.mjs';

const codec = createCodec(loadProtocol());
const pack = fs.readFileSync(new URL('../work/cdn/config_cn_pack.json', import.meta.url));
const config = { tables: extractTables(JSON.parse(pack.toString('utf8'))) };
const requestKeys = ['OnWaterRequest', 'AllItemRequest', 'GameEffectRequest', 'FishEncyclopediaRequest'];
const typed = (request, body) => {
  const name = request.replace(/Request$/, 'Response');
  return codec.decode(codec.encode(name, 1, body)).body;
};
function current(overrides = {}, snapshot = false) {
  const bodies = {
    OnWaterRequest: { fishingLevel: { level: 2, enhance: 0, criticalRate: 0 } },
    AllItemRequest: { items: [{ itemId: '鱼', num: 88 }, { itemId: '精铁', num: 10 }] },
    GameEffectRequest: { effects: [{ id: 1 }, { id: 16, value: 100 }] },
    FishEncyclopediaRequest: { fishList: [14, 7, 2, 1], rewardId: 1 },
    ...overrides,
  };
  const raw = Object.fromEntries(requestKeys.map(request => {
    const body = typed(request, bodies[request]);
    return [request, snapshot ? toSnapshotJson(body) : body];
  }));
  const outcomes = Object.fromEntries(requestKeys.map(request => [request, { status: 'SUCCESS' }]));
  return { raw, outcomes, failed: {} };
}

test('v76 Codec and fixed configuration expose independent level, stock/cap, and exact incremental collection score', () => {
  assert.equal(createHash('sha256').update(pack).digest('hex'), FISHING_VIEW_EVIDENCE.configSha256);
  for (const snapshot of [false, true]) {
    const view = fishingView(current({}, snapshot), { config });
    assert.deepEqual(view.level, { level: 2, enhance: 0, criticalRate: 0, status: 'AVAILABLE', reason: null });
    assert.deepEqual(view.inventory, { itemId: '鱼', owned: 88, capacity: 100, remaining: 12, full: false, status: 'AVAILABLE', reason: null });
    assert.deepEqual(view.collection, {
      rewardId: 1, collectedIds: [1, 2, 7, 14], collectedCount: 4, catalogCount: 40,
      totalScore: 70, claimedScore: 20, availableScore: 50, complete: false,
      nextStage: { stage: 2, requiredScore: 50, cumulativeRequiredScore: 70, missingScore: 0, eligible: true,
        rewards: [{ type: 'RESOURCE', id: 'RUBY', num: 150 }, { type: 'ITEM', id: '加速器', num: 30 }] },
      status: 'AVAILABLE', reason: null,
    });
    assert.deepEqual(view.pendingCatch, { status: 'UNKNOWN', reason: 'NO_AUTHORITATIVE_PENDING_CATCH_READ' });
  }
});

test('empty authoritative fish and item arrays give zero counts; omitted scalar defaults never give zero stage or enhance', () => {
  const sample = current({
    FishEncyclopediaRequest: { fishList: [], rewardId: 0 },
    AllItemRequest: { items: [] },
    GameEffectRequest: { effects: [{ id: 16, value: 0 }] },
    OnWaterRequest: { fishingLevel: { level: 2 } },
  });
  const view = fishingView(sample, { config });
  assert.equal(view.collection.totalScore, 0);
  assert.equal(view.collection.claimedScore, 0);
  assert.equal(view.collection.rewardId, 0);
  assert.deepEqual(view.collection.collectedIds, []);
  assert.deepEqual(view.collection.nextStage, {
    stage: 1, requiredScore: 20, cumulativeRequiredScore: 20, missingScore: 20, eligible: false,
    rewards: [{ type: 'RESOURCE', id: 'RUBY', num: 100 }],
  });
  assert.deepEqual(view.inventory, { itemId: '鱼', owned: 0, capacity: 0, remaining: 0, full: true, status: 'AVAILABLE', reason: null });
  assert.deepEqual(view.level, { level: 2, enhance: null, criticalRate: null, status: 'PARTIAL', reason: 'FISHING_LEVEL_FIELDS_INCOMPLETE' });
  const body = typed('FishEncyclopediaRequest', {});
  assert.deepEqual(body.fishList, []);
  assert.equal(body.rewardId, 0, 'wire-generated prototype default');
  assert.equal(Object.hasOwn(body, 'rewardId'), false);
  sample.raw.FishEncyclopediaRequest = body;
  const collection = fishingView(sample, { config }).collection;
  assert.equal(collection.rewardId, null);
  assert.equal(collection.nextStage, null);
  assert.equal(collection.complete, null);
  assert.equal(collection.status, 'PARTIAL');
});

test('raw success is required and failed, absent, or accessor-backed current entries cannot use stale normalized data', () => {
  const sample = current();
  sample.ok = { FishEncyclopediaRequest: { fishList: [1, 2], rewardId: 0 }, AllItemRequest: { items: [] } };
  for (const status of ['FAILED', 'UNKNOWN', 'NOT_EXECUTED']) {
    sample.outcomes.FishEncyclopediaRequest = { status };
    assert.equal(fishingView(sample, { config }).collection.rewardId, null);
  }
  for (const outcome of [undefined, {}, Object.create({ status: 'SUCCESS' }), { get status() { throw Error('must not run'); } }]) {
    sample.outcomes.FishEncyclopediaRequest = outcome;
    assert.equal(fishingView(sample, { config }).collection.rewardId, null);
  }
  sample.outcomes.FishEncyclopediaRequest = { status: 'SUCCESS' };
  delete sample.raw.FishEncyclopediaRequest;
  assert.equal(fishingView(sample, { config }).collection.rewardId, null);
  sample.failed.AllItemRequest = 'timeout';
  assert.deepEqual(fishingView(sample, { config }).inventory, {
    itemId: '鱼', owned: null, capacity: 100, remaining: null, full: null, status: 'PARTIAL', reason: 'FISHING_STOCK_UNKNOWN',
  });
  assert.equal(fishingView({ raw: current().raw }, { config }).collection.rewardId, null);
});

test('stock is exact signed int64, no precision is recovered from legacy snapshots, and missing capacity stays unknown', () => {
  const count = '9223372036854775807';
  for (const snapshot of [false, true]) {
    const state = current({ AllItemRequest: { items: [{ itemId: '鱼', num: count }] } }, snapshot);
    const inventory = fishingView(state, { config }).inventory;
    assert.equal(inventory.owned, count);
    assert.equal(inventory.full, true);
    assert.equal(inventory.remaining, 0);
  }
  const legacy = { ok: { AllItemRequest: { items: [{ itemId: '鱼', num: 12 }] }, GameEffectRequest: { effects: [{ id: 16, value: 100 }] } } };
  assert.equal(fishingView(legacy, { config }).inventory.owned, 12);
  legacy.ok.AllItemRequest.items[0].num = Number(count);
  assert.equal(fishingView(legacy, { config }).inventory.owned, null);
  legacy.ok.AllItemRequest.items[0].num = count;
  assert.equal(fishingView(legacy, { config }).inventory.owned, null);
  const absentCap = current({ GameEffectRequest: { effects: [{ id: 16 }] } });
  assert.deepEqual(fishingView(absentCap, { config }).inventory, {
    itemId: '鱼', owned: 88, capacity: null, remaining: null, full: null, status: 'PARTIAL', reason: 'FISHING_CAPACITY_UNKNOWN',
  });
});

test('invalid rows do not prove empty fish stock, a cap, or an eligible collection stage', () => {
  for (const items of [
    undefined, Array(1), [{ itemId: '鱼' }], [{ itemId: '鱼', num: -1 }], [{ itemId: '鱼', num: '9223372036854775808' }],
    [{ itemId: '鱼', num: 1 }, { itemId: '鱼', num: 2 }], [Object.create({ itemId: '鱼', num: 1 })],
  ]) {
    const state = current();
    state.raw.AllItemRequest = { items };
    assert.equal(fishingView(state, { config }).inventory.owned, null);
  }
  for (const effects of [
    [{ id: 16, value: 100 }, { id: 16, value: 100 }], [{ id: 16, value: -1 }], [{ id: 16, value: 1.5 }],
    [{ id: 16, get value() { throw Error('must not run'); } }], [Object.create({ id: 16, value: 100 })],
  ]) {
    const state = current();
    state.raw.GameEffectRequest = { effects };
    assert.equal(fishingView(state, { config }).inventory.capacity, null);
  }
  for (const fishList of [undefined, Array(1), [1, 1], [0], ['1'], [2147483648], [41]]) {
    const state = current();
    state.raw.FishEncyclopediaRequest = { fishList, rewardId: 1 };
    const collection = fishingView(state, { config }).collection;
    assert.equal(collection.totalScore, null);
    assert.equal(collection.nextStage?.eligible, null);
    assert.equal(collection.status, 'PARTIAL');
  }
});

test('ambiguous catalog rows and nonsequential stage tables never invent a score or stage; true completion is explicit', () => {
  const fixture = () => ({ tables: {
    FishBaseCfg: { data: [{ fishId: 1, score: 40 }, { fishId: 2, score: 30 }] },
    FishStageCfg: { data: [{ stage: 1, star: 20, reward: [['RUBY', 100]] }, { stage: 2, star: 50, reward: [['加速器', 30]] }] },
  } });
  const state = current({ FishEncyclopediaRequest: { fishList: [1, 2], rewardId: 2 } });
  const complete = fishingView(state, { config: fixture() }).collection;
  assert.equal(complete.status, 'AVAILABLE');
  assert.equal(complete.complete, true);
  assert.equal(complete.nextStage, null);
  assert.equal(complete.availableScore, 0);
  const noList = current();
  noList.raw.FishEncyclopediaRequest = { rewardId: 2 };
  const observedStage = fishingView(noList, { config: fixture() }).collection;
  assert.equal(observedStage.rewardId, 2);
  assert.equal(observedStage.complete, true, 'explicit last-claimed stage remains visible');
  assert.equal(observedStage.status, 'PARTIAL');
  assert.equal(observedStage.totalScore, null);

  for (const change of [
    tables => { tables.FishBaseCfg.data.push(tables.FishBaseCfg.data[0]); },
    tables => { tables.FishBaseCfg.data[0] = Object.create({ fishId: 1, score: 40 }); },
    tables => { tables.FishStageCfg.data.reverse(); },
    tables => { tables.FishStageCfg.data[1].stage = 3; },
    tables => { tables.FishStageCfg.data[1].reward = [['RUBY', 1], ['RUBY', 2]]; },
    tables => { tables.FishStageCfg.data[1].reward = [['RUBY', 0]]; },
  ]) {
    const cfg = fixture(); change(cfg.tables);
    const view = fishingView(state, { config: cfg }).collection;
    assert.equal(view.status, 'PARTIAL');
    assert.equal(view.nextStage, null);
    assert.equal(view.availableScore, null);
  }
  const impossible = current({ FishEncyclopediaRequest: { fishList: [1], rewardId: 2 } });
  const invalid = fishingView(impossible, { config: fixture() }).collection;
  assert.equal(invalid.complete, null);
  assert.equal(invalid.reason, 'FISHING_COLLECTION_SCORE_INCONSISTENT');
  assert.equal(invalid.nextStage, null);
});
