import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol } from '../src/proto.mjs';
import { ACTIONS, buildBody, runAction, assertPaymentAllowed } from '../src/actions.mjs';

// Recovered generated codecs only: no account store, GameClient or game network.
const protocol = loadProtocol();
const roundtrip = (id, params) => {
  const body = buildBody(ACTIONS[id], params);
  const type = protocol[ACTIONS[id].request];
  return type.decode(type.encode(body).finish());
};

test('buildingCollect scalar, CSV and array survive actual repeated-string protobuf', () => {
  for (const [input, expected] of [
    ['fixture-building', ['fixture-building']],
    ['one, two', ['one', 'two']],
    [['one', 'two'], ['one', 'two']],
    [42, ['42']],
  ]) assert.deepEqual([...roundtrip('buildingCollect', { buildingId: input }).buildingId], expected);
  assert.throws(() => buildBody(ACTIONS.buildingCollect, { buildingId: [] }), /missing parameter/);
  assert.throws(() => buildBody(ACTIONS.buildingCollect, { buildingId: [{}] }), /IDs/);
});

test('challengeField missing fleet stays empty and supplied scalar/array roundtrip intact', () => {
  for (const [fleetBuildingIds, expected] of [
    [undefined, []], [null, []], ['', []], ['fleet-1', ['fleet-1']],
    ['fleet-1, fleet-2', ['fleet-1', 'fleet-2']], [['fleet-1', 'fleet-2'], ['fleet-1', 'fleet-2']],
  ]) {
    const decoded = roundtrip('challengeField', { gridIdx: 12, fleetBuildingIds });
    assert.equal(decoded.resFieldGridIdx, 12);
    assert.deepEqual([...decoded.fleetBuildingIds], expected);
  }
});

test('both repeated-int32 reward actions normalize scalars/CSV/arrays and reject lossy inputs', () => {
  for (const id of ['dailyRewardDraw', 'weeklyRewardDraw']) {
    for (const [index, expected] of [[2, [2]], ['1,2,3', [1, 2, 3]], [[1, '3'], [1, 3]]]) {
      assert.deepEqual([...roundtrip(id, { index }).index], expected);
    }
    for (const index of [[], null, 'one', '1,', [true], [NaN], [1.5], [2147483648]]) {
      assert.throws(() => buildBody(ACTIONS[id], { index }), /int32|missing parameter/);
    }
  }
});

test('accelerator quantities reject negative, empty, fractional and overflowing values', () => {
  for (const id of ['speedUpUpgrade', 'speedUpProduce']) {
    for (const useNum of [null, '', 0, -1, 1.5, NaN, Infinity, 2147483648]) {
      assert.throws(() => buildBody(ACTIONS[id], { buildingId: 'b', index: 1, useNum }), /positive int32|missing parameter/);
    }
    assert.equal(roundtrip(id, { buildingId: 'b', index: 1, useNum: '2' }).speedUp.type, 2);
  }
});

test('D6 cannot be bypassed by allowPaid, a ready label, zero price or false paid metadata', () => {
  for (const allowPaid of [false, true]) {
    for (const action of [
      { request: 'DiscountShopBuyRequest', body: { id: 1 }, cost: '无', paid: false },
      { request: 'ClickGoldRequest', body: { free: false, times: 1 }, cost: '无' },
      { request: 'GotFreeDailyPackRequest', body: { packId: '礼包1' }, cost: '无' },
      { request: 'SpeedUpFleetRequest', body: { speedUp: { type: 1, useNum: 1 } }, cost: '无' },
      { request: 'UpgradeBuildingRequest', body: { buildingId: 'b' }, costs: [{ id: 'RUBY', num: 1 }] },
    ]) assert.throws(() => assertPaymentAllowed(action, { allowPaid }), { code: 'D6_FORBIDDEN' });
  }
  assert.throws(() => assertPaymentAllowed({ request: 'UnknownRequest', body: {}, cost: '无' }), { code: 'COST_UNKNOWN' });
  assert.throws(() => assertPaymentAllowed({ request: 'DrawAfkRewardRequest', body: { useAdvCard: true } }), { code: 'COST_UNKNOWN' });
});

test('silent action is UNKNOWN; missing declared response never falls back to watch', async () => {
  const sent = [];
  const client = { sendWatch: async (name) => { sent.push(name); }, request: async (name) => { sent.push(name); return {}; } };
  const result = await runAction(client, protocol, 'buildingFinish', { buildingId: 'b' }, { allowMutate: true });
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.ok, null);
  assert.deepEqual(sent, ['FinishUpgradeBuildingRequest']);
  await assert.rejects(runAction(client, { GainFactoryProduceRequest: {} }, 'factoryGain', { buildingId: 'b' }, { allowMutate: true }), /protocol has no type GainFactoryProduceResponse/);
  assert.equal(sent.length, 1);
});

test('aborted or disconnected action does not dispatch', async () => {
  const ac = new AbortController(); ac.abort();
  let sent = 0;
  const client = { request: async () => { sent += 1; } };
  await assert.rejects(runAction(client, protocol, 'factoryGain', { buildingId: 'b' }, { allowMutate: true, signal: ac.signal }), { code: 'CANCELLED' });
  await assert.rejects(runAction({ ...client, connected: false }, protocol, 'factoryGain', { buildingId: 'b' }, { allowMutate: true }), { code: 'CANCELLED' });
  assert.equal(sent, 0);
});


test('typed actions retain mutation metadata for unresolved-write protection', async () => {
  const controller = new AbortController();
  let metadata;
  const client = { async request(name, body, response, timeout, options) { metadata = options; return {}; } };
  const result = await runAction(client, protocol, 'factoryGain', { buildingId: 'b' }, { allowMutate: true, signal: controller.signal });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(metadata.mutate, true);
  assert.equal(metadata.signal, controller.signal);
});

// These assertions formerly reached Action transport through the standalone CLI.
// CLI writes now fail before login; synthetic transport still proves lifecycle/UNKNOWN semantics.
test('Action cancellation after synthetic login sends no first write; silent responses stay unknown', async () => {
  const controller = new AbortController(); let requests = 0, watches = 0;
  const cancelled = { connected: true, async connect() { controller.abort(); }, async request() { requests++; return {}; } };
  await cancelled.connect();
  await assert.rejects(runAction(cancelled, protocol, 'afkDraw', {}, { allowMutate: true, signal: controller.signal }), { code: 'CANCELLED' });
  assert.equal(requests, 0);
  const silent = { connected: true, async sendWatch(name, body) { watches++; assert.equal(name, 'SetBuildingAutoWorkRequest'); assert.deepEqual(body, { buildingId: 'fixture-building', isOn: true }); return { status: 'UNKNOWN', name }; } };
  const result = await runAction(silent, protocol, 'buildingAutoWork', { buildingId: 'fixture-building', isOn: true }, { allowMutate: true });
  assert.equal(watches, 1); assert.equal(result.status, 'UNKNOWN'); assert.equal(result.ok, null);
  assert.equal(result.response, null); assert.equal(result.body, null);
});