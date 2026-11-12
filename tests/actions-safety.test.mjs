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

test('equipment D6 admits only one exact int64 UID with positive iron and no expanded growth or payment controls',()=>{
 const action=()=>({request:'EnhanceEquipRequest',body:{uid:'9007199254740993'},costs:[{id:'精铁',num:50}]});assert.doesNotThrow(()=>assertPaymentAllowed(action()));
 for(const mutate of [a=>a.body.uid=9007199254740992,a=>a.body.uid='0',a=>a.body.uid='01',a=>a.body.uid='-1',a=>a.body.uid='9223372036854775808',a=>a.body.uid='1.5',a=>a.body.heroId='A',a=>a.body.count=2,a=>a.body.universal=false,a=>a.body.buyMissing=true,a=>delete a.costs,a=>a.costs=[],a=>a.costs[0].num=0,a=>a.costs[0].num=1.5,a=>a.costs[0].id='GOLD',a=>a.costs.push({id:'精铁',num:1})]){const a=action();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});}
 for(const id of ['RUBY','钻石','4']){const a=action();a.costs[0].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}
 for(const request of ['EquipRefineRequest','EquipStarUpRequest','EquipReplaceRequest'])assert.throws(()=>assertPaymentAllowed({...action(),request}),{code:'COST_UNKNOWN'});
});

test('Fort D6 admits only exact single-city ordinary owned material and matching cost with selectPackNum zero',()=>{
 const materials=['压电陶瓷','炮弹','耐火砖','高温合金','液态金属','碳纤维'];
 const action=(id='耐火砖')=>({request:'DonateFortRequest',body:{cityId:7,item:{itemId:id,num:2},selectPackNum:0},costs:[{id,num:2}]});
 for(const id of materials)assert.doesNotThrow(()=>assertPaymentAllowed(action(id)));
 for(const mutate of [a=>a.body.cityId=0,a=>a.body.cityId='7',a=>a.body.cityId=2147483648,a=>a.body.item.num=0,a=>a.body.item.num=1.5,a=>a.body.item.num=2147483648,a=>a.body.item.itemId='材料',a=>a.body.item.buyMissing=true,a=>a.body.selectPackNum=1,a=>delete a.body.selectPackNum,a=>a.body.autoExchange=false,a=>delete a.costs,a=>a.costs=[],a=>a.costs[0].id='高温合金',a=>a.costs[0].num=1,a=>a.costs[0].num=0,a=>a.costs.push({id:'高温合金',num:1})]){const a=action();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});}
 for(const id of ['RUBY','钻石','4']){const a=action();a.costs[0].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}
 for(const request of ['BuildFortRequest','FinishFortRequest','DemolishFortRequest'])assert.throws(()=>assertPaymentAllowed({...action(),request}),{code:'COST_UNKNOWN'});
});

test('equipment refinement D6 accepts exact UID and two positive owned materials without hidden growth controls',()=>{
 const action=()=>({request:'EquipRefineRequest',body:{uid:'9007199254740993'},costs:[{id:'精铁',num:90500},{id:'精炼石',num:100}]});assert.doesNotThrow(()=>assertPaymentAllowed(action()));const reversed=action();reversed.costs.reverse();assert.doesNotThrow(()=>assertPaymentAllowed(reversed));
 for(const mutate of [a=>a.body.uid='0',a=>a.body.uid='01',a=>a.body.uid=9007199254740992,a=>a.body.uid='9223372036854775808',a=>a.body.action='refine',a=>a.body.num=2,a=>a.body.universal=false,a=>a.body.buyMissing=true,a=>a.body.heroId='A',a=>a.costs.pop(),a=>a.costs[1].id='精铁',a=>a.costs[1].id='材料',a=>a.costs[0].num=0,a=>a.costs[1].num=0,a=>a.costs[1].num=1.5,a=>delete a.costs,a=>a.costs.push({id:'GOLD',num:1})]){const a=action();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});}
 for(const id of ['RUBY','钻石','4']){const a=action();a.costs[1].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}const paid=action();paid.needsPaid=true;assert.throws(()=>assertPaymentAllowed(paid,{allowPaid:true}),{code:'D6_FORBIDDEN'});
});

test('exclusive LEVEL D6 admits only exact hero and one positive owned dedicated material',()=>{
 const action=()=>({request:'HeroExclusiveLevelUpRequest',body:{heroId:'A'},costs:[{id:'初级专武材料',num:20}]});for(const id of ['初级专武材料','中级专武材料','高级专武材料','特级专武材料']){const a=action();a.costs[0].id=id;assert.doesNotThrow(()=>assertPaymentAllowed(a));}
 for(const mutate of [a=>a.body.heroId='',a=>a.body.heroId=' A',a=>a.body.universal=false,a=>a.body.level=2,a=>a.body.star=1,a=>a.body.count=2,a=>a.body.buyMissing=true,a=>a.costs=[],a=>delete a.costs,a=>a.costs[0].id='GOLD',a=>a.costs[0].num=0,a=>a.costs[0].num=1.5,a=>a.costs[0].num=Number.MAX_SAFE_INTEGER+1,a=>a.costs.push({id:'中级专武材料',num:1})]){const a=action();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});}
 for(const id of ['RUBY','钻石','4']){const a=action();a.costs[0].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}const a=action();a.paid=true;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});
});

import {runHeroPlan,buildHeroAction} from '../src/heroes.mjs';
test('new exclusive request builder cannot extend the legacy CLI hero transport loop',async()=>{
 let writes=0,reads=0;const client={connected:true,async request(name){reads++;if(name==='AllItemRequest')return {items:[{itemId:'初级专武材料',num:100}]};if(name==='AllResourceRequest')return {list:[]};throw Error('unexpected request');},async sendWatch(){writes++;return {status:'UNKNOWN'};}};const step={kind:'exclusive-level',heroId:'A',from:1,to:2,costs:[{id:'初级专武材料',num:20}]};assert.deepEqual(buildHeroAction(step),{request:'HeroExclusiveLevelUpRequest',response:null,body:{heroId:'A'}});const result=await runHeroPlan(client,protocol,{steps:[step]},{allowMutate:true});assert.equal(writes,0,'exclusive writes require the registered domain contract');assert.equal(reads,0);assert.equal(result[0].status,'NOT_EXECUTED');
});

test('exclusive STAR D6 requires matching owned hero fragments, one quality stone, and explicit false',()=>{
 const action=(stone='橙专武升星石')=>({request:'HeroExclusiveStarUpRequest',body:{heroId:'A',universal:false},costs:[{id:'A碎片',num:60},{id:stone,num:5}]});
 assert.doesNotThrow(()=>assertPaymentAllowed(action()));const red=action('红专武升星石');red.costs.reverse();assert.doesNotThrow(()=>assertPaymentAllowed(red));
 for(const mutate of [a=>delete a.body.universal,a=>a.body.universal=true,a=>a.body.universal=0,a=>a.body.star=1,a=>a.body.heroId='B',a=>a.body.buyMissing=false,a=>a.costs.pop(),a=>a.costs[0].id='英雄万能碎片',a=>a.costs[1].id='初级专武材料',a=>a.costs[0].num=0,a=>a.costs[1].num=1.5,a=>a.costs.push({id:'GOLD',num:1})]){const a=action();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});}
 for(const id of ['RUBY','钻石','4']){const a=action();a.costs[1].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}
 const activation={...action(),request:'HeroExclusiveUnlockRequest'};assert.throws(()=>assertPaymentAllowed(activation),{code:'COST_UNKNOWN'});
});

test('exclusive STAR builder preserves required false and cannot use the legacy hero loop',async()=>{
 let reads=0,writes=0;const client={connected:true,async request(){reads++;throw Error('unexpected read');},async sendWatch(){writes++;throw Error('unexpected write');}};
 const step={kind:'exclusive-star',heroId:'A',universal:true,from:0,to:1,costs:[{id:'A碎片',num:60},{id:'橙专武升星石',num:5}]};
 assert.deepEqual(buildHeroAction(step),{request:'HeroExclusiveStarUpRequest',response:null,body:{heroId:'A',universal:false}});
 assert.equal((await runHeroPlan(client,protocol,{steps:[step]},{allowMutate:true}))[0].status,'NOT_EXECUTED');assert.equal(reads,0);assert.equal(writes,0);
});

test('worn badge D6 admits only exact UID, empty sacrifice list and matching positive owned EXP and GOLD',()=>{
 const make=()=>({request:'EnhanceBadgeRequest',body:{uid:'9007199254740993',decomposeUid:[],expItemNum:5},costs:[{id:'徽章经验',num:5},{id:'GOLD',num:100}]});
 assert.doesNotThrow(()=>assertPaymentAllowed(make()));const reversed=make();reversed.costs.reverse();assert.doesNotThrow(()=>assertPaymentAllowed(reversed));
 for(const mutate of [a=>a.body.uid='01',a=>a.body.uid=9007199254740992,a=>a.body.uid='9223372036854775808',a=>a.body.decomposeUid.push('2'),a=>a.body.decomposeUid.extra=true,a=>delete a.body.decomposeUid,a=>a.body.expItemNum=0,a=>a.body.expItemNum=2147483648,a=>a.body.expItemNum=4,a=>a.body.buyMissing=false,a=>a.costs[0].id='万能经验',a=>a.costs[1].num=0,a=>a.costs.pop(),a=>a.costs.push({id:'其他',num:1})]){
  const a=make();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});
 }
 for(const id of ['RUBY','钻石','4']){const a=make();a.costs[1].id=id;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});}
 for(const request of ['BadgeReplaceRequest','BadgeStarUpRequest','TakeOffBadgeRequest'])assert.throws(()=>assertPaymentAllowed({...make(),request}),{code:'COST_UNKNOWN'});
});

test('empty-slot equipment D6 accepts exact UID and hero with explicit zero costs only',()=>{
 const make=()=>({request:'PutOnEquipRequest',body:{uid:'9007199254740993',heroId:'A'},costs:[]});
 assert.doesNotThrow(()=>assertPaymentAllowed(make()));
 for(const mutate of [a=>a.body.uid='01',a=>a.body.uid=9007199254740992,a=>a.body.uid='9223372036854775808',a=>a.body.heroId='',a=>a.body.heroId=' A',a=>a.body.upUid='7',a=>a.body.replace=false,a=>a.body.universal=false,a=>delete a.costs,a=>a.costs=null,a=>a.costs.extra=true,a=>a.costs.push({id:'GOLD',num:1})]){
  const a=make();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});
 }
 const paid=make();paid.costs.push({id:'RUBY',num:1});assert.throws(()=>assertPaymentAllowed(paid,{allowPaid:true}),{code:'D6_FORBIDDEN'});
 assert.throws(()=>assertPaymentAllowed({...make(),request:'EquipReplaceRequest'}),{code:'COST_UNKNOWN'});
});

test('empty-slot badge D6 accepts exact owned UID, hero, slot and explicit zero cost only',()=>{
 const make=(pos=1)=>({request:'PutOnBadgeRequest',body:{uid:'9007199254740993',heroId:'A',pos},costs:[]});
 for(const pos of [1,2,3,4])assert.doesNotThrow(()=>assertPaymentAllowed(make(pos)));
 for(const mutate of [a=>a.body.pos=0,a=>a.body.pos=5,a=>a.body.pos='1',a=>a.body.pos=1.5,a=>a.body.uid='01',a=>a.body.uid=9007199254740992,a=>a.body.heroId=' A',a=>a.body.oldUid='2',a=>a.body.replace=false,a=>delete a.costs,a=>a.costs=null,a=>a.costs.extra=true,a=>a.costs.push({id:'GOLD',num:1})]){
  const a=make();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});
 }
 const paid=make();paid.costs.push({id:'RUBY',num:1});assert.throws(()=>assertPaymentAllowed(paid,{allowPaid:true}),{code:'D6_FORBIDDEN'});
 assert.throws(()=>assertPaymentAllowed({...make(),request:'BadgeReplaceRequest'}),{code:'COST_UNKNOWN'});
});

test('Antique D6 admits only exact owned dedicated fragments and never universal or expanded requests',()=>{
 for(const request of ['ActivateAntiqueRequest','AntiqueStarUpRequest']){
  const make=()=>({request,body:{id:'藏品蓝1',...(request==='AntiqueStarUpRequest'?{universal:false}:{})},costs:[{id:'藏品蓝1碎片',num:2}]});
  assert.doesNotThrow(()=>assertPaymentAllowed(make()));
  for(const mutate of [a=>a.body.id='',a=>a.body.id=' 藏品蓝1',a=>a.body.num=2,a=>a.body.buyMissing=true,a=>a.costs=[],a=>delete a.costs,a=>a.costs=null,a=>a.costs[0].id='蓝藏万能碎片',a=>a.costs[0].num=0,a=>a.costs[0].num=1.5,a=>a.costs[0].extra=1,a=>a.costs.push({id:'GOLD',num:1})]){
   const a=make();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});
  }
  if(request==='AntiqueStarUpRequest')for(const value of [undefined,true,null,0,'false']){const a=make();if(value===undefined)delete a.body.universal;else a.body.universal=value;assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});}
  else{const a=make();a.body.universal=false;assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});}
  const paid=make();paid.costs[0].id='RUBY';assert.throws(()=>assertPaymentAllowed(paid,{allowPaid:true}),{code:'D6_FORBIDDEN'});
 }
 for(const request of ['AntiqueSuitLevelUpRequest','AntiqueFragExchangeRequest','AntiqueMasterLevelUpRequest'])assert.throws(()=>assertPaymentAllowed({request,body:{id:'藏品蓝1'},costs:[{id:'藏品蓝1碎片',num:1}]}),{code:'COST_UNKNOWN'});
});

test('Antique advanced D6 requires explicit free costs, exact XP currencies and 1:1 exchange debits',()=>{
 const freeSuit=()=>({request:'AntiqueSuitLevelUpRequest',body:{id:1001},costs:[]});
 const paidSuit=()=>({...freeSuit(),costs:[{id:'GOLD',num:50},{id:'蓝藏品经验',num:370}]});
 const freeMaster=()=>({request:'AntiqueMasterLevelUpRequest',body:{},costs:[]});
 const paidMaster=()=>({...freeMaster(),costs:[{id:'藏品大师经验',num:5}]});
 const exchange=()=>({request:'AntiqueFragExchangeRequest',body:{antiqueId:'藏品蓝1',fragItemId:'蓝藏万能碎片',num:7},costs:[{id:'蓝藏万能碎片',num:7}]});
 for(const make of [freeSuit,paidSuit,freeMaster,paidMaster,exchange]){
  assert.doesNotThrow(()=>assertPaymentAllowed(make()));
  for(const mutate of [a=>delete a.costs,a=>a.costs=null,a=>a.costs.extra=1,a=>a.body.buyMissing=false,a=>a.body.universal=true]){
   const a=make();mutate(a);assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'COST_UNKNOWN'});
  }
  const a=make();a.costs=[{id:'RUBY',num:1}];assert.throws(()=>assertPaymentAllowed(a,{allowPaid:true}),{code:'D6_FORBIDDEN'});
 }
 for(const make of [paidSuit,paidMaster,exchange])for(const num of [0,-1,1.5,2147483648]){
  const a=make();a.costs[0].num=num;assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});
 }
 for(const mutate of [a=>a.body.id=0,a=>a.body.id='1001',a=>a.body.id=2147483648,a=>a.costs[1].id='藏品大师经验',a=>a.costs[0].id='其他金币',a=>a.costs.pop()]){
  const a=paidSuit();mutate(a);assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});
 }
 for(const mutate of [a=>delete a.body,a=>a.body=null,a=>a.body={level:1},a=>a.body=Object.create({}),a=>a.costs[0].id='蓝藏品经验']){
  const a=paidMaster();mutate(a);assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});
 }
 for(const mutate of [a=>a.body.num=6,a=>a.body.num=0,a=>a.body.num=2147483648,a=>a.body.antiqueId='',a=>a.body.fragItemId='万能碎片',a=>a.costs[0].id='藏品蓝1碎片',a=>a.costs.push({id:'GOLD',num:1})]){
  const a=exchange();mutate(a);assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});
 }
});
test('D6 cannot be bypassed by overridden array iterators or accessor-backed costs',()=>{
 class ForgedCosts extends Array {some(){return false;}every(){return true;}map(){return ['a','b'];}}
 const paid={request:'AntiqueSuitLevelUpRequest',body:{id:1001},costs:new ForgedCosts({id:'RUBY',num:1},{id:'付费材料',num:1})};
 assert.throws(()=>assertPaymentAllowed(paid,{allowPaid:true}),{code:'D6_FORBIDDEN'});
 const spoof={...paid,costs:new ForgedCosts({id:'普通材料',num:1},{id:'其他',num:1})};
 assert.throws(()=>assertPaymentAllowed(spoof),{code:'COST_UNKNOWN'});
 const accessor=[{id:'GOLD',num:50}];Object.defineProperty(accessor,1,{enumerable:true,get:()=>({id:'蓝藏品经验',num:370})});
 assert.throws(()=>assertPaymentAllowed({...paid,costs:accessor}),{code:'COST_UNKNOWN'});
});