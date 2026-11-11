import test from 'node:test';
import assert from 'node:assert/strict';
import { appointEffectValue, appointProduceReduce, produceFinalTime, packCoverPlan, cropSupplyPlan, MATERIAL_PACKS, CROP_SUPPLY_POLICY } from '../src/production-planning.mjs';

const table = data => ({ data });
const effect = () => ({ effectId: '生产时间', viewType: '数值', heroAdd: [10, 20, 150, 200], starAdd: [1, 2, 12, 20] });
function appointmentFixture() {
  return { config: { tables: { AppointEffectCfg: table([effect()]), AppointPosCfg: table([1, 2, 3].map(posId => ({ posId, effectId: '生产时间' }))), HeroCfg: table(['a', 'b', 'c'].map(id => ({ id, qualityIndex: 3 }))) } },
    facts: { appointed: [1, 2, 3].map((posId, i) => ({ posId, heroId: ['a', 'b', 'c'][i] })), heroes: ['a', 'b', 'c'].map(heroId => ({ heroId, star: 9 })), reliable: true } };
}
const packRow = (selectItemId, num = 1, itemId = '原料自选包') => ({ itemId, selectItemId, num, type: '道具' });
const packs = rows => ({ tables: { SelectPackLibCfg: table(rows) } });
const cost = (id, num) => ({ id, num });
const recipe = (itemId, costs, extra = {}) => ({ buildType: '食品厂', itemId, unlockLevel: 1, costItem: costs, ...extra });
const crop = (id, seed = id + '种子') => ({ id, material: [seed, 1] });
const building = (type, extra = {}) => ({ buildingId: '1' + type, type, level: 1, buildFinishTime: 0, ...extra });
function cropFixture({ crops = [crop('小麦')], recipes = [recipe('面包', [['小麦', 2], ['木材', 1]])], stock = new Map([['小麦', 100], ['小麦种子', 0], ['木材', 10]]), buildings = [building('食品厂'), building('农田'), building('种子厂')] } = {}) {
  return { config: { tables: { FarmlandPlantCfg: table(crops), BuildingProduceCfg: table(recipes) } }, input: { stock, buildings, farmsReliable: true } };
}
const supply = f => cropSupplyPlan(f.config, f.input);

// Oracles follow world.mjs AppointUtil/produceFinalTime/waterlineOf and
// factories.mjs packCoverPlan, with unknown input retained rather than coerced.
test('appointment sums quality base plus star contribution for the same three production positions', () => {
  const f = appointmentFixture(), result = appointProduceReduce(f.config, f.facts);
  assert.equal(appointEffectValue(effect(), { qualityIndex: 3 }, 9), 258); assert.equal(result.reliable, true); assert.equal(result.seconds, 774);
  assert.deepEqual(result.contributions.map(row => row.seconds), [258, 258, 258]); assert.equal(produceFinalTime(300, result.seconds), 0);
});

test('missing, percentage, unsafe and malformed effect evidence stays null rather than zero', () => {
  for (const [e, h, star] of [[null, { qualityIndex: 3 }, 9], [effect(), null, 9], [{ ...effect(), viewType: '百分比' }, { qualityIndex: 3 }, 9], [effect(), { qualityIndex: 0 }, 9], [effect(), { qualityIndex: 5 }, 9], [effect(), { qualityIndex: 3 }, null], [{ ...effect(), heroAdd: [] }, { qualityIndex: 3 }, 9], [{ ...effect(), starAdd: [0, 0, Number.MAX_SAFE_INTEGER, 0] }, { qualityIndex: 3 }, 2]]) assert.equal(appointEffectValue(e, h, star), null);
  assert.equal(appointEffectValue(effect(), { qualityIndex: 3 }, 0), 150);
});

test('appointment rejects incomplete and duplicate facts while a proven empty appointment yields zero', () => {
  for (const change of [f => f.facts.reliable = false, f => delete f.config.tables.HeroCfg, f => f.facts.appointed.push({ ...f.facts.appointed[0] }), f => f.facts.heroes.push({ ...f.facts.heroes[0] }), f => f.config.tables.AppointPosCfg.data.push({ ...f.config.tables.AppointPosCfg.data[0] }), f => delete f.facts.heroes[0].star]) { const f = appointmentFixture(); change(f); const result = appointProduceReduce(f.config, f.facts); assert.equal(result.reliable, false); assert.equal(result.seconds, null); }
  const f = appointmentFixture(); f.facts.appointed = []; assert.equal(appointProduceReduce(f.config, f.facts).seconds, 0);
});

test('non-production positions do not contribute or require an owned hero star to determine production reduction', () => {
  const f = appointmentFixture(); f.config.tables.AppointPosCfg.data[0].effectId = '贸易时间'; f.facts.heroes = f.facts.heroes.filter(row => row.heroId !== 'a');
  const result = appointProduceReduce(f.config, f.facts); assert.equal(result.reliable, true); assert.equal(result.seconds, 516); assert.deepEqual(result.contributions.map(row => row.posId), [2, 3]);
});

test('final time uses reduction before speedup, rounds upward and never promotes unknown to instant', () => {
  assert.equal(produceFinalTime(301, 100, 1), 101); assert.equal(produceFinalTime(100, 200, 0.5), 0); assert.equal(produceFinalTime(0, 0), 0);
  for (const values of [[300, null], [null, 0], [300, undefined], [300, -1], [300, 0, NaN], [300, 0, -0.1], [Number.MAX_SAFE_INTEGER + 1, 0], [300, 0, '1']]) assert.equal(produceFinalTime(...values), null);
});

test('same material pack must cover the sum across multiple missing materials, not each material independently', () => {
  const config = packs([packRow('木材'), packRow('石头')]), costs = [cost('木材', 4), cost('石头', 3)];
  const short = packCoverPlan(config, { costs, stock: new Map([['原料自选包', 6]]) }); assert.equal(short.reliable, true); assert.equal(short.ok, false); assert.deepEqual(short.needs, [{ pack: '原料自选包', num: 7, have: 6 }]);
  const enough = packCoverPlan(config, { costs, stock: new Map([['原料自选包', 7]]) }); assert.equal(enough.ok, true); assert.equal(enough.executable, false); assert.equal(enough.gaps.length, 2);
});

test('package projections aggregate duplicate material costs, ceil each gap and never count expected gain as stock', () => {
  const stock = new Map([['木材', 1], ['原料自选包', 3]]), result = packCoverPlan(packs([packRow('木材', 2)]), { costs: [cost('木材', 3), cost('木材', 3)], stock });
  assert.equal(result.ok, true); assert.equal(result.gaps[0].gap, 5); assert.equal(result.gaps[0].packs, 3); assert.equal(result.gaps[0].projectedGain, 6); assert.equal(stock.get('木材'), 1); assert.equal(result.executable, false);
});

test('rare packages remain excluded even when they can cover every material gap', () => {
  const result = packCoverPlan(packs([packRow('木材', 100, '装备材料自选包'), packRow('石头', 100, '稀有资源包')]), { costs: [cost('木材', 3), cost('石头', 2)], stock: new Map([['装备材料自选包', 100], ['稀有资源包', 100]]) });
  assert.equal(result.ok, false); assert.equal(result.executable, false); assert.equal(result.needs.length, 0); assert.deepEqual(MATERIAL_PACKS, ['原料自选包', '工事材料自选包']);
});

test('D6 resources cannot appear as a coverable material package gap even in a projection', () => {
  for (const id of ['RUBY', '钻石', '4']) { const result = packCoverPlan(packs([packRow(id)]), { costs: [cost(id, 1)], stock: new Map([['原料自选包', 100]]) }); assert.equal(result.ok, false, id); assert.equal(result.executable, false); }
});

test('unknown costs, stock, pack quantity, duplicate rates and package provenance remain unreliable', () => {
  for (const [config, input] of [[packs([packRow('木材')]), { costs: null, stock: new Map() }], [packs([packRow('木材')]), { costs: [cost('木材', 2)], stock: null }], [packs([packRow('木材')]), { costs: [cost('木材', 2)], stock: new Map([['木材', null]]) }], [packs([packRow('木材')]), { costs: [cost('木材', 2)], stock: new Map([['原料自选包', null]]) }], [packs([packRow('木材', 0)]), { costs: [cost('木材', 2)], stock: new Map() }], [packs([packRow('木材'), packRow('木材', 2)]), { costs: [cost('木材', 2)], stock: new Map() }], [packs([{ ...packRow('木材'), type: '资源' }]), { costs: [cost('木材', 2)], stock: new Map() }]]) { const result = packCoverPlan(config, input); assert.equal(result.reliable, false); assert.equal(result.ok, false); }
});

test('overflow in expected package output or combined pack count cannot produce reliable coverage', () => {
  const gain = packCoverPlan(packs([packRow('木材', 2)]), { costs: [cost('木材', Number.MAX_SAFE_INTEGER)], stock: new Map([['原料自选包', Number.MAX_SAFE_INTEGER]]) }); assert.equal(gain.reliable, false); assert.equal(gain.ok, false);
  const total = packCoverPlan(packs([packRow('木材'), packRow('石头')]), { costs: [cost('木材', Number.MAX_SAFE_INTEGER), cost('石头', 1)], stock: new Map([['原料自选包', Number.MAX_SAFE_INTEGER]]) }); assert.equal(total.reliable, false); assert.equal(total.ok, false);
});

test('no material gap is reported as no exchange needed, without creating executable package operations', () => {
  const result = packCoverPlan(packs([packRow('木材')]), { costs: [cost('木材', 2)], stock: new Map([['木材', 2], ['原料自选包', 10]]) }); assert.equal(result.reliable, true); assert.equal(result.ok, false); assert.deepEqual(result.needs, []); assert.deepEqual(result.gaps, []); assert.equal(result.executable, false);
});

test('crop use counts map every zero-through-six recipe use to the original safety waterline', () => {
  const crops = Array.from({ length: 7 }, (_, i) => crop('crop-' + i)), recipes = crops.flatMap((row, n) => Array.from({ length: n }, (_, i) => recipe(row.id + '-product-' + i, [[row.id, 1]])));
  const f = cropFixture({ crops, recipes, buildings: [], stock: new Map() }), result = supply(f); assert.equal(result.reliable, true); assert.deepEqual(result.waterlines.map(row => row.uses), [0, 1, 2, 3, 4, 5, 6]); assert.deepEqual(result.waterlines.map(row => row.target), [40, 40, 80, 120, 150, 180, 200]); assert.equal(result.projectionOnly, true);
});

test('crop caps clamp below the strategy cap and zero explicitly disables surplus protection without inventing zero waterlines', () => {
  const f = cropFixture({ recipes: Array.from({ length: 6 }, (_, i) => recipe('product-' + i, [['小麦', 1]])) });
  f.input.policy = { ...CROP_SUPPLY_POLICY, cropCap: 100 }; assert.equal(supply(f).waterlines[0].target, 99);
  f.input.policy = { ...CROP_SUPPLY_POLICY, cropCap: 0 }; const result = supply(f); assert.equal(result.waterlines[0].target, null); assert.equal(result.waterlines[0].capDisabled, true); assert.deepEqual(result.surplusDemand, []);
});

test('seed demand requires farm plots, unlocked seed factory, crop deficit and seed reserve below eight', () => {
  const recipes = [recipe('面包', [['小麦', 1]]), recipe('小麦种子', [], { buildType: '种子厂', unlockLevel: 2 })], f = cropFixture({ recipes });
  f.input.buildings.find(row => row.type === '种子厂').level = 2; let result = supply(f); assert.deepEqual(result.seedDemand, []);
  f.input.stock.set('小麦', 20); f.input.stock.set('小麦种子', 2); result = supply(f); assert.equal(result.seedDemand[0].missing, 6); assert.equal(result.seedDemand[0].required, 8); assert.equal(result.seedDemand[0].have, 2); assert.equal(result.seedDemand[0].urgency, 0.45);
  f.input.stock.set('小麦种子', 8); assert.deepEqual(supply(f).seedDemand, []);
  f.input.stock.set('小麦种子', 0); f.input.buildings.find(row => row.type === '种子厂').level = 1; assert.deepEqual(supply(f).seedDemand, []);
  f.input.buildings.find(row => row.type === '种子厂').level = 2; f.input.buildings = f.input.buildings.filter(row => row.type !== '农田'); assert.deepEqual(supply(f).seedDemand, []);
});

test('an upgrading seed factory and an unknown crop or seed inventory cannot create an actionable seed shortage', () => {
  const f = cropFixture({ recipes: [recipe('小麦种子', [], { buildType: '种子厂' })] }); f.input.stock.set('小麦', 0); f.input.buildings.find(row => row.type === '种子厂').buildFinishTime = 100; assert.deepEqual(supply(f).seedDemand, []);
  f.input.buildings.find(row => row.type === '种子厂').buildFinishTime = 0;
  for (const id of ['小麦', '小麦种子']) { const prior = f.input.stock.get(id); f.input.stock.set(id, null); const result = supply(f); assert.equal(result.reliable, false); assert.deepEqual(result.seedDemand, []); f.input.stock.set(id, prior); }
});

test('surplus requires all ingredients already held and never invokes packages to fill a missing non-crop material', () => {
  const f = cropFixture(); f.input.stock.set('木材', 0); f.input.stock.set('原料自选包', 10000); let result = supply(f); assert.deepEqual(result.surplusDemand, []);
  f.input.stock.set('木材', null); result = supply(f); assert.equal(result.reliable, false); assert.deepEqual(result.surplusDemand, []);
  f.input.stock.set('木材', 1); result = supply(f); assert.equal(result.surplusDemand[0].maximumUnits, 1); assert.equal(result.surplusDemand[0].allowPacks, false);
});

test('surplus quantity is bounded by every crop waterline, every other ingredient and the finite per-recipe cap', () => {
  const f = cropFixture({ crops: [crop('小麦'), crop('玉米')], recipes: [recipe('双谷面包', [['小麦', 3], ['玉米', 2], ['木材', 2]])], stock: new Map([['小麦', 1000], ['玉米', 45], ['木材', 20]]) });
  let result = supply(f); assert.equal(result.surplusDemand[0].maximumUnits, 2); assert.equal(result.surplusDemand[0].allowPacks, false);
  f.input.stock.set('玉米', 1000); assert.equal(supply(f).surplusDemand[0].maximumUnits, 3); f.input.policy = { ...CROP_SUPPLY_POLICY, maxSurplusPerRecipe: 1 }; assert.equal(supply(f).surplusDemand[0].maximumUnits, 1);
  f.input.stock.set('小麦', 40); assert.deepEqual(supply(f).surplusDemand, []);
});

test('surplus cannot recommend a D6-paid recipe and never exceeds the unlocked actual factory scope', () => {
  for (const premium of ['RUBY', '钻石', '4']) { const f = cropFixture({ recipes: [recipe('premium-product', [['小麦', 1], [premium, 1]])] }); f.input.stock.set(premium, 100); assert.deepEqual(supply(f).surplusDemand, [], premium); }
  const f = cropFixture({ recipes: [recipe('locked-product', [['小麦', 1]], { unlockLevel: 2 })] }); assert.deepEqual(supply(f).surplusDemand, []); f.input.buildings[0].level = 2; assert.equal(supply(f).surplusDemand.length, 1); f.input.buildings[0].buildFinishTime = 100; assert.deepEqual(supply(f).surplusDemand, []);
});

test('missing, duplicate and unknown crop recipe evidence is not equivalent to empty or zero-cost state', () => {
  for (const change of [f => f.input.farmsReliable = false, f => f.config.tables.FarmlandPlantCfg.data.push(crop('小麦')), f => f.config.tables.BuildingProduceCfg.data.push(structuredClone(f.config.tables.BuildingProduceCfg.data[0])), f => f.config.tables.BuildingProduceCfg.data[0].costItem = null, f => delete f.config.tables.BuildingProduceCfg, f => f.input.stock = null]) { const f = cropFixture(); change(f); const result = supply(f); assert.equal(result.reliable, false); assert.deepEqual(result.seedDemand, []); assert.deepEqual(result.surplusDemand, []); }
  for (const policy of [{ ...CROP_SUPPLY_POLICY, maxSurplusPerRecipe: Infinity }, { ...CROP_SUPPLY_POLICY, cropCap: -1 }, { ...CROP_SUPPLY_POLICY, seedReserve: 101 }, { ...CROP_SUPPLY_POLICY, unknown: 1 }]) { const f = cropFixture(); assert.throws(() => cropSupplyPlan(f.config, { ...f.input, policy }), TypeError); }
});

test('all planning functions preserve caller tables, facts, maps and policy across successful and rejected projections', () => {
  const appointment = appointmentFixture(), beforeAppointment = structuredClone(appointment); appointProduceReduce(appointment.config, appointment.facts); assert.deepEqual(appointment, beforeAppointment);
  const config = packs([packRow('木材'), packRow('石头')]), input = { costs: [cost('木材', 2), cost('石头', 1)], stock: new Map([['原料自选包', 3]]) }, beforeConfig = structuredClone(config), beforeInput = structuredClone(input); packCoverPlan(config, input); assert.deepEqual(config, beforeConfig); assert.deepEqual(input, beforeInput);
  const f = cropFixture(); f.input.policy = { ...CROP_SUPPLY_POLICY }; const before = structuredClone(f); supply(f); assert.deepEqual(f, before);
});
test('seed demand excludes all D6-paid recipe aliases even with complete crop and factory evidence', () => {
  for(const premium of ['RUBY','钻石','4']){
    const f=cropFixture({recipes:[recipe('小麦种子',[[premium,1]],{buildType:'种子厂'})],stock:new Map([['小麦',0],['小麦种子',0],[premium,100]])});
    assert.equal(supply(f).reliable,true);assert.deepEqual(supply(f).seedDemand,[]);
  }
});
