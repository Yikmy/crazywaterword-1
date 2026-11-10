import test from 'node:test';
import assert from 'node:assert/strict';
import { formationModule, defaultConfig, surveyFormation, planFormation, viewFormation, verifyFormation, parseFormation, validateFormationParameters, battleAnalysis, recommendFormations } from '../src/formation.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';
import { loadProtocol } from '../src/proto.mjs';

const names = ['GetFormationRequest', 'GetFormationResponse', 'MyFormationPresetRequest', 'MyFormationPresetResponse', 'AllHeroRequest', 'AllHeroResponse', 'SaveFormationRequest', 'SaveFormationResponse'];
const protocol = Object.fromEntries(names.map(name => [name, {}]));
const enabled = { enabled: true, mainlineEnabled: false };
const pos = (heroId, x, y) => ({ heroId, pos: { x, y } });
const formation = () => ({ presetId: 1, petUid: '9007199254740993', heroPositions: [pos('ranged', 4, 4), pos('tank', 1, 3), pos('mage', 1, 5)] });
function config() {
  return { tables: {
    HeroCfg: { data: [{ id: 'ranged', career: '射手' }, { id: 'tank', career: '坦克' }, { id: 'mage', career: '法师' }, { id: 'tank2', career: '坦克' }, { id: 'warrior', career: '战士' }] },
    FormationHeroNumCfg: { data: [{ heroNum: 3, mainlineStage: 0 }, { heroNum: 4, mainlineStage: 100 }, { heroNum: 5, mainlineStage: 200 }] },
    FormationTypePositionCfg: { data: [
      { id: 1, position: [4, 4] }, { id: 1, position: [1, 3] }, { id: 1, position: [1, 5] }, { id: 1, position: [1, 1] }, { id: 1, position: [4, 2] },
      { id: 2, position: [2, 4] }, { id: 2, position: [5, 5] }, { id: 2, position: [5, 1] }, { id: 2, position: [2, 0] }, { id: 2, position: [1, 3] },
      { id: 3, position: [5, 5] }, { id: 3, position: [5, 3] }, { id: 3, position: [5, 1] }, { id: 3, position: [2, 4] }, { id: 3, position: [2, 2] }, { id: 3, position: [1, 3] },
    ] },
  } };
}
async function facts({ current = formation(), presets = { ids: [2] }, heroes = { heroes: ['ranged', 'tank', 'mage', 'tank2', 'warrior'].map(heroId => ({ heroId })) }, cfg = config(), player = { mainlineStage: 101 }, proto = protocol, reject = null } = {}) {
  const calls = [], client = { connected: true, async request(name, body, response, timeout, options) {
    calls.push({ name, body, response, timeout, options });
    if (name === reject) throw new Error('synthetic-error token=must-not-retain');
    return name === 'GetFormationRequest' ? { formation: current } : name === 'MyFormationPresetRequest' ? presets : heroes;
  } };
  const result = await surveyFormation(client, proto, { config: cfg, player });
  return { result, calls };
}
const plan = (f, parameters = { presetId: 2 }, extra = {}) => planFormation(f, { moduleConfig: enabled, parameters, ...extra });
const op = f => plan(f).actions[0];
function after(f, operation) { return { ...f, formation: structuredClone(operation.expectedState) }; }

// Each test exercises an observable safety contract rather than reproducing helper logic.
test('adapter reuses only three existing read queries and emits full typed SaveFormation', async () => {
  const { result, calls } = await facts();
  assert.deepEqual(calls.map(c => c.name).sort(), ['AllHeroRequest', 'GetFormationRequest', 'MyFormationPresetRequest']);
  assert.deepEqual(calls.find(c => c.name === 'GetFormationRequest').body, { module: 1 });
  assert.ok(result.stock instanceof Map); assert.equal(result.stockReliable, true); assert.equal(result.stock.size, 0);
  const operation = op(result);
  assert.equal(operation.action.request, 'SaveFormationRequest'); assert.equal(operation.action.response, 'SaveFormationResponse');
  assert.equal(operation.action.body.module, 1); assert.deepEqual(operation.costs, []); assert.match(operation.costSource, /already-unlocked/);
  assert.equal(operation.action.body.formation.petUid, '9007199254740993');
  assert.deepEqual(operation.action.body.formation.heroPositions, [pos('tank', 5, 5), pos('mage', 5, 1), pos('ranged', 2, 4)]);
  assert.deepEqual(operation.parameters, { presetId: 2 }); assert.deepEqual(operation.restoreParameters, { presetId: 1, heroPositions: formation().heroPositions });
  assert.deepEqual(formationModule.defaultConfig, { enabled: false, mainlineEnabled: false });
});
test('module is disabled by default and Stage flag does not authorize or block explicit manual requests', async () => {
  const { result } = await facts();
  assert.equal(planFormation(result, { parameters: { presetId: 2 } }).actions.length, 0);
  assert.equal(plan(result).actions.length, 1); assert.equal(defaultConfig.mainlineEnabled, false);
  assert.equal(planFormation(result, { moduleConfig: { enabled: false, mainlineEnabled: true }, parameters: { presetId: 2 } }).actions.length, 0);
  assert.equal(plan(result, {}).actions.length, 0);
});
test('career sorting is stable for equal careers and x ties retain source configuration order', async () => {
  const { result } = await facts();
  const operation = plan(result, { presetId: 2, heroIds: ['tank2', 'ranged', 'tank', 'mage'] }).actions[0];
  assert.deepEqual(operation.action.body.formation.heroPositions, [pos('tank2', 5, 5), pos('tank', 5, 1), pos('mage', 2, 4), pos('ranged', 2, 0)]);
});
test('explicit same-template hero replacement and manual positions are supported without separate hero switch protocol', async () => {
  const { result } = await facts();
  const replace = plan(result, { heroIds: ['tank2', 'tank', 'mage'] }).actions[0];
  assert.ok(replace); assert.equal(replace.action.body.formation.presetId, 1);
  assert.equal(replace.action.request, 'SaveFormationRequest');
  const manual = plan(result, { heroPositions: [pos('tank2', 1, 5), pos('mage', 4, 4)] }).actions[0];
  assert.deepEqual(manual.action.body.formation.heroPositions, [pos('tank2', 1, 5), pos('mage', 4, 4)]);
  assert.equal(manual.action.body.formation.petUid, formation().petUid);
});
test('unlocked template ids are layouts; unknown and locked layouts never create unlock actions', async () => {
  const { result } = await facts();
  assert.equal(plan(result, { presetId: 3 }).actions.length, 0);
  assert.equal(plan(result, { presetId: 99 }).actions.length, 0);
  const view = viewFormation(result, { moduleConfig: enabled });
  assert.equal(view.templatesAreNotSavedTeams, true); assert.equal(view.candidates.find(r => r.target.presetId === 3).executable, false);
  assert.ok(view.candidates.every(r => !r.action || r.action.request === 'SaveFormationRequest'));
});
test('default template 1 stays available even when absent from server ids', async () => {
  const { result } = await facts({ current: { ...formation(), presetId: 2, heroPositions: [pos('tank', 5, 5), pos('mage', 5, 1), pos('ranged', 2, 4)] }, presets: { ids: [] } });
  assert.deepEqual(result.unlockedPresetIds, [1]); assert.equal(plan(result, { presetId: 1 }).actions.length, 1);
  assert.equal(plan(result, { presetId: 2 }).actions.length, 0);
});
test('max hero gate uses strict stage threshold even for templates containing six slots', async () => {
  const { result } = await facts({ player: { mainlineStage: 100 }, presets: { ids: [2, 3] } });
  assert.equal(result.catalog.maxHeroes, 3);
  assert.equal(plan(result, { presetId: 3, heroIds: ['tank', 'tank2', 'mage', 'ranged'] }).actions.length, 0);
  const next = (await facts({ player: { mainlineStage: 101 } })).result;
  assert.equal(plan(next, { presetId: 2, heroIds: ['tank', 'tank2', 'mage', 'ranged'] }).actions.length, 1);
});
test('missing player stage, malformed config and unknown careers remain blocked', async () => {
  for (const player of [{}, { mainlineStage: 0 }, Object.create({ mainlineStage: 101 })]) assert.equal(plan((await facts({ player })).result).actions.length, 0);
  for (const mutate of [c => delete c.tables.FormationHeroNumCfg, c => c.tables.HeroCfg.data[0].career = '未知', c => c.tables.FormationTypePositionCfg.data.push({ id: 2, position: [5, 5] }), c => c.tables.HeroCfg.data.push({ id: 'tank', career: '坦克' })]) {
    const cfg = config(); mutate(cfg); assert.equal(plan((await facts({ cfg })).result).actions.length, 0);
  }
});
test('unknown heroes, duplicate heroes and duplicate or off-template positions cannot be written', async () => {
  const { result } = await facts();
  assert.equal(plan(result, { heroIds: ['foreign'] }).actions.length, 0);
  assert.equal(plan(result, { heroPositions: [pos('tank', 99, 99)] }).actions.length, 0);
  for (const parameters of [{ heroIds: ['tank', 'tank'] }, { heroPositions: [pos('tank', 1, 3), pos('mage', 1, 3)] }, { heroIds: [] }, { heroPositions: [] }]) assert.throws(() => plan(result, parameters), { code: 'INVALID_PARAMETERS' });
});
test('business parameters reject arbitrary requests, cost overrides, pet changes and mixed forms', async () => {
  for (const parameters of [{ request: 'UnlockFormationPresetRequest' }, { body: {} }, { costs: [] }, { petUid: 0 }, { presetId: '2' }, { heroIds: ['tank'], heroPositions: [pos('tank', 1, 3)] }, { heroPositions: [{ ...pos('tank', 1, 3), unchecked: true }] }, { heroPositions: [{ heroId: 'tank', pos: { x: 1 } }] }]) assert.throws(() => validateFormationParameters(parameters), { code: 'INVALID_PARAMETERS' });
});
test('selections filter exactly and selected operations reserve through supplied ledger', async () => {
  const { result } = await facts(), operation = op(result);
  const calls = [], ledger = { reserve(costs) { calls.push(costs); return true; } };
  assert.equal(plan(result, { presetId: 2 }, { selections: [], ledger }).actions.length, 0); assert.equal(calls.length, 0);
  assert.equal(plan(result, { presetId: 2 }, { selections: [operation.actionId], ledger }).actions.length, 1); assert.deepEqual(calls, [[]]);
  assert.equal(plan(result, { presetId: 2 }, { selections: ['forged'] }).actions.length, 0);
  assert.equal(plan(result, { presetId: 2 }, { ledger: { reserve() { return false; } } }).actions.length, 0);
  assert.equal(new ResourceLedger(result.stock).reserve([]), true);
});
test('planning and JSON serialization retain input data and exact unsafe pet UID', async () => {
  const current = formation(), cfg = config(), copy = structuredClone({ current, cfg });
  const { result } = await facts({ current, cfg }); const operation = op(result);
  assert.equal(JSON.parse(JSON.stringify(operation)).action.body.formation.petUid, '9007199254740993');
  assert.deepEqual({ current, cfg }, copy);
  assert.equal(plan(result, { heroPositions: current.heroPositions }).actions.length, 0);
  for (const uid of [0, -1, '-9223372036854775808', '9223372036854775807', { low: 1, high: 2097152, unsigned: false }]) {
    const f = (await facts({ current: { ...current, petUid: uid } })).result;
    assert.equal(exactPet(op(f).action.body.formation.petUid), exactPet(uid));
  }
});
function exactPet(v) { if (typeof v === 'object') return ((BigInt(v.high) << 32n) + BigInt(v.low >>> 0)).toString(); return String(v); }
test('optional pet absence is preserved and unsafe numeric UID cannot be guessed', async () => {
  const current = formation(); delete current.petUid;
  const { result } = await facts({ current }); assert.equal(Object.hasOwn(op(result).action.body.formation, 'petUid'), false);
  for (const petUid of [9007199254740992, '9223372036854775808', '-9223372036854775809', null]) assert.equal(plan((await facts({ current: { ...formation(), petUid } })).result).actions.length, 0);
});
test('missing read fields and protocol failures are observable unknowns, with no fallback write', async () => {
  for (const current of [{}, { presetId: 1 }, { ...formation(), heroPositions: [ { heroId: 'tank', pos: Object.create({ x: 1, y: 3 }) } ] }, Object.create(formation())]) assert.equal(plan((await facts({ current })).result).actions.length, 0);
  assert.equal(plan((await facts({ heroes: {} })).result).actions.length, 0);
  assert.equal(plan((await facts({ presets: {} })).result).actions.length, 0);
  const missing = { ...protocol }; delete missing.SaveFormationResponse;
  assert.equal(plan((await facts({ proto: missing })).result).actions.length, 0);
  const rejected = (await facts({ reject: 'AllHeroRequest' })).result;
  assert.equal(plan(rejected).actions.length, 0); assert.doesNotMatch(JSON.stringify(rejected.errors), /must-not-retain/);
});
test('cancelled survey does not dispatch any write or hide cancellation as empty state', async () => {
  const controller = new AbortController(), requests = [];
  await assert.rejects(surveyFormation({ connected: true, request(name) { requests.push(name); controller.abort(); return new Promise(() => {}); } }, protocol, { config: config(), player: { mainlineStage: 101 }, signal: controller.signal }), { code: 'CANCELLED' });
  assert.ok(requests.every(name => name !== 'SaveFormationRequest'));
});
test('verification needs a matching full response and a fresh matching GetFormation', async () => {
  const { result } = await facts(), operation = op(result), fresh = after(result, operation);
  assert.equal(verifyFormation(operation, result, fresh, { formation: operation.expectedState }).confirmed, true);
  assert.equal(verifyFormation(operation, result, result, { formation: operation.expectedState }).confirmed, false);
  for (const response of [{}, { formation: {} }, { formation: { ...operation.expectedState, petUid: 0 } }, { formation: { ...operation.expectedState, presetId: 1 } }]) assert.equal(verifyFormation(operation, result, fresh, response).confirmed, false);
  const changed = { ...fresh, formation: { ...fresh.formation, petUid: '9007199254740994' } };
  assert.equal(verifyFormation(operation, result, changed, { formation: operation.expectedState }).confirmed, false);
  const reorder = { ...fresh, formation: { ...fresh.formation, heroPositions: [...fresh.formation.heroPositions].reverse() } };
  assert.equal(verifyFormation(operation, result, reorder, { formation: operation.expectedState }).confirmed, true);
});
test('pre-write changes alter identity and cannot validate a stale approved operation', async () => {
  const { result } = await facts(), operation = op(result);
  const changed = { ...result, formation: { ...result.formation, petUid: 0 } };
  assert.notEqual(op(changed).actionId, operation.actionId);
  assert.equal(verifyFormation(operation, changed, after(changed, operation), { formation: operation.expectedState }).confirmed, false);
  const forged = structuredClone(operation); forged.action.body.module = 2;
  assert.equal(verifyFormation(forged, result, after(result, operation), { formation: operation.expectedState }).confirmed, false);
});

function battle(win = false) {
  const damage = (heroId, x, y, hp, n) => ({ heroId, pos: { x, y }, leftHp: hp, statBar: { damage: { physical: n, magic: 0, true: 0 } } });
  return { initialData: { mainlineStage: 41, battleType: 1, leftPlayer: { nickname: 'synthetic' }, leftTeam: { presetId: 1, power: '9007199254740993', members: formation().heroPositions.map(r => ({ hero: { heroId: r.heroId }, pos: r.pos, hp: 100 })) }, rightTeams: [{ members: [{ hero: { heroId: 'enemy' }, pos: { x: 8, y: 3 }, hp: 100 }] }] },
    stats: { isLeftWin: win, leftHeroDamages: [damage('ranged', 4, 4, 0, 10), damage('tank', 1, 3, 0, 5), damage('mage', 1, 5, 0, 10)], rightHeroDamages: [damage('enemy', 8, 3, 50, '9007199254740993')] } };
}
test('battle analysis uses actual response participants, stats and optional opponent player without any I/O', async () => {
  const { result } = await facts(), source = battle(), original = structuredClone(source);
  const report = battleAnalysis(source, { stage: 41, formationFacts: result, moduleConfig: enabled, client: { request() { throw Error('No extra battle'); } } });
  assert.equal(report.status, 'ANALYZED'); assert.equal(report.playerSide, 'LEFT'); assert.equal(report.outcome, 'FAILED');
  assert.equal(report.leftTeam.power, '9007199254740993'); assert.equal(report.rightPlayer, null); assert.equal(report.leftPlayer.nickname, 'synthetic');
  assert.ok(report.positionComparisons.every(r => r.matches)); assert.deepEqual(report.defeatReasons.map(r => r.code), ['TEAM_WIPED', 'DAMAGE_GAP']);
  assert.equal(report.rightHeroDamages[0].damage, '9007199254740993');
  assert.ok(report.recommendations.length > 0); assert.ok(report.recommendations.every(r => r.requiresApproval === true && r.automatic === false));
  assert.equal(report.automaticSwitch, false); assert.equal(report.resumeAllowed, false); assert.deepEqual(source, original);
});
test('other battle modes and missing explicit side or result stay unknown and never recommend', async () => {
  for (const modify of [r => r.initialData.battleType = 2, r => delete r.initialData.battleType, r => delete r.stats.isLeftWin, r => r.initialData.mainlineStage = 42]) {
    const source = battle(); modify(source); const report = battleAnalysis(source, { stage: 41 });
    assert.notEqual(report.status, 'ANALYZED'); assert.equal(report.outcome, 'UNKNOWN'); assert.deepEqual(report.recommendations, []);
  }
  assert.equal(battleAnalysis(battle(), { battleMode: 'ARENA' }).status, 'SIDE_UNVERIFIED');
});
test('missing or partial battle statistics never assert total wipe or invent timing', () => {
  for (const change of [r => delete r.stats.leftHeroDamages, r => r.stats.leftHeroDamages.pop(), r => delete r.stats.leftHeroDamages[0].leftHp, r => r.stats.leftHeroDamages.push(r.stats.leftHeroDamages[0])]) {
    const source = battle(); change(source); const report = battleAnalysis(source);
    assert.ok(!report.defeatReasons.some(r => r.code === 'TEAM_WIPED')); assert.ok(report.gaps.length > 0);
  }
  const source = battle(); delete source.stats.leftHeroDamages[0].statBar.damage.magic;
  assert.equal(battleAnalysis(source).leftHeroDamages[0].damage, null);
});
test('victory and unknown modes generate no formation recommendation; recommendation stays separate from application', async () => {
  const { result } = await facts();
  const success = battleAnalysis(battle(true), { formationFacts: result, moduleConfig: enabled });
  assert.deepEqual(success.recommendations, []); assert.deepEqual(success.defeatReasons, []);
  assert.deepEqual(recommendFormations({ status: 'SIDE_UNVERIFIED', outcome: 'FAILED', playerSide: 'LEFT' }, result, { moduleConfig: enabled }), []);
});

// Existing local protocol artifact only: no account store, connection or game client.
const real = loadProtocol();
const roundtrip = (name, body) => real[name].decode(real[name].encode(body).finish());
test('actual SaveFormation protobuf preserves complete positions, module and unsafe int64 pet UID', async () => {
  const { result } = await facts(), operation = op(result), decoded = roundtrip('SaveFormationRequest', operation.action.body);
  assert.equal(decoded.module, 1); assert.equal(decoded.formation.petUid.toString(), '9007199254740993');
  assert.deepEqual(parseFormation(decoded.formation), operation.action.body.formation);
  const response = roundtrip('SaveFormationResponse', { formation: operation.expectedState });
  assert.equal(verifyFormation(operation, result, after(result, operation), response).confirmed, true);
  assert.equal(real.FormationModule.MAINLINE, 1); assert.equal(real.UnlockFormationPresetResponse, undefined); assert.equal(real.SwitchFormationHeroResponse, undefined);
});
test('actual protobuf missing optional fields cannot silently become valid positions, pet or response', async () => {
  const noPet = formation(); delete noPet.petUid;
  const decoded = roundtrip('GetFormationResponse', { formation: noPet });
  assert.equal(Object.hasOwn(decoded.formation, 'petUid'), false); assert.equal(Object.hasOwn(parseFormation(decoded.formation), 'petUid'), false);
  const missingPosition = roundtrip('GetFormationResponse', { formation: { presetId: 1, heroPositions: [{ heroId: 'tank', pos: { x: 1 } }] } });
  assert.equal(missingPosition.formation.heroPositions[0].pos.y, 0); assert.equal(parseFormation(missingPosition.formation), null);
  const { result } = await facts(), operation = op(result);
  assert.equal(verifyFormation(operation, result, after(result, operation), roundtrip('SaveFormationResponse', {})).confirmed, false);
});
test('actual ChallengeStage protobuf preserves explicit mainline side and conservative missing survival stats', () => {
  const decoded = roundtrip('ChallengeStageResponse', battle());
  const report = battleAnalysis(decoded, { stage: 41 });
  assert.equal(report.status, 'ANALYZED'); assert.equal(report.outcome, 'FAILED'); assert.equal(report.rightHeroDamages[0].damage, '9007199254740993');
  const missing = battle(); delete missing.stats.leftHeroDamages[0].leftHp;
  const unknown = battleAnalysis(roundtrip('ChallengeStageResponse', missing));
  assert.equal(unknown.leftHeroDamages[0].survival, 'UNKNOWN'); assert.ok(!unknown.defeatReasons.some(r => r.code === 'TEAM_WIPED'));
});

test('restore is a new explicit approved plan preserving the old full team and current pet', async () => {
  const { result } = await facts(), operation = op(result), fresh = after(result, operation);
  const restored = plan(fresh, operation.restoreParameters).actions[0];
  assert.ok(restored); assert.deepEqual(restored.expectedState, operation.beforeState);
  assert.notEqual(restored.actionId, operation.actionId);
  assert.equal(verifyFormation(restored, fresh, { ...fresh, formation: restored.expectedState }, { formation: restored.expectedState }).confirmed, true);
});
