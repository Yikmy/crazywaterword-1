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
test('farm seed-only D6 contract rejects batch expansion, hidden payment fields and missing costs',()=>{
 const action=()=>({request:'FarmPlantRequest',body:{args:[{buildingId:'1农田',productId:'小麦'}]},costs:[{id:'小麦种子',num:1}]});
 assert.doesNotThrow(()=>assertPaymentAllowed(action()));
 for(const mutate of [a=>a.body.args.push({...a.body.args[0]}),a=>a.body.args=[],a=>a.body.args[0].buyMissing=true,a=>a.body.autoFarming=true,a=>a.costs=[],a=>delete a.costs,a=>a.costs[0].num=0,a=>a.costs[0].num=1.5,a=>a.body.args[0].productId='',a=>a.body.args.extra=true]){const a=action();mutate(a);assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});}
 for(const id of ['RUBY','钻石','4']){const a=action();a.costs[0].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}
 assert.throws(()=>assertPaymentAllowed({request:'FarmHarvestRequest',body:{buildingId:['1农田']},costs:[]}),{code:'COST_UNKNOWN'});
});

test('forge D6 allows only exact owned-material Make and explicit zero-cost Pick',()=>{
 const make=()=>({request:'MakeEquipRequest',body:{buildingId:'1装备厂',makeId:1001,universal:false},costs:[{id:'材料',num:4}]});
 const pick=()=>({request:'PickMadeEquipRequest',body:{buildingId:'1装备厂'},costs:[]});
 assert.doesNotThrow(()=>assertPaymentAllowed(make()));assert.doesNotThrow(()=>assertPaymentAllowed(pick()));
 for(const mutate of [a=>delete a.body.universal,a=>a.body.universal=true,a=>a.body.makeId=0,a=>a.body.makeId=1.5,a=>a.body.buyMissing=true,a=>a.costs=[],a=>a.costs.push({id:'材料',num:4})]){const a=make();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});}
 for(const mutate of [a=>delete a.costs,a=>a.body.universal=false,a=>a.costs=[{id:'材料',num:1}],a=>a.body.buildingId='']){const a=pick();mutate(a);assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});}
 for(const id of ['RUBY','钻石','4']){const a=make();a.costs[0].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}
});

test('ordinary preset D6 allows only the exact owned matching blueprint and never payment or purchase expansion',()=>{
 const action=id=>({request:'UnlockFormationPresetRequest',body:{id},costs:[{id:'阵型'+id+'图纸',num:1}]});
 for(let id=2;id<=24;id++)assert.doesNotThrow(()=>assertPaymentAllowed(action(id)));
 for(const mutate of [a=>a.body.id=1,a=>a.body.id=25,a=>a.body.id='2',a=>a.body.id=2.5,a=>a.body.universal=false,a=>a.body.buyMissing=true,a=>delete a.costs,a=>a.costs=[],a=>a.costs.push({id:'材料',num:1}),a=>a.costs[0].id='阵型3图纸',a=>a.costs[0].num=2,a=>a.costs[0].num=0,a=>a.costs[0].num=1.5,a=>a.costs[0].hidden=true]){
  const a=action(2);mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});
 }
 for(const id of ['RUBY','钻石','4']){const a=action(2);a.costs[0].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}
 const paid=action(2);paid.paid=true;assert.throws(()=>assertPaymentAllowed(paid,{allowPaid:true}),{code:'D6_FORBIDDEN'});
});
