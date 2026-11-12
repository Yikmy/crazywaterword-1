import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNCTION_CONTRACTS, describeFunctionContract, validateFunctionContract, validateFunctionParameters } from '../src/function-contracts.mjs';
import { formationModule, validateFormationParameters } from '../src/formation.mjs';
import { CORE_OPERATION_MODULES } from '../src/core-operation-adapters.mjs';
import { heroModule } from '../src/hero-operations.mjs';
const ids = ['badge-growth','equipment-growth','formation-unlock','equipment-forge','farm', 'formation', 'alliance', 'museum', 'fleet', 'treasure', 'naval', 'stage', 'orders', 'city', 'production', 'heroes'];
function adapter(id, validateParameters = value => value) {
  return { id, survey() {}, view() {}, plan() {}, verify() {}, execute() {}, validateParameters, dependencyVersions() { return { moduleConfig: {} }; } };
}
const invalid = fn => assert.throws(fn, error => ['INVALID_PARAMETERS', 'INVALID_FUNCTION_CONTRACT'].includes(error.code));
const stage = () => ({ config: { enabled: true, retryDelaySeconds: 0, maxAttempts: 2, maxStage: null, interStageDelay: { minSeconds: 10, maxSeconds: 11 }, formation: { enabled: false, presetId: null } } });

test('sixteen trusted contracts have detached JSON descriptions and stable capability/C/P/S identities', () => {
  assert.deepEqual(Object.keys(FUNCTION_CONTRACTS), ids);
  for (const id of ids) {
    const value = describeFunctionContract(id);
    assert.deepEqual(value, JSON.parse(JSON.stringify(value)));
    assert.equal(value.id, id); assert.equal(value.capabilityId, 'cw.' + id); assert.equal(value.version, 1);
    for (const C of value.requirementIds.C) assert.match(C, /^C[0-9]{3}$/);
    for (const P of value.requirementIds.P) assert.match(P, /^P[0-8]-[1-9]$/);
    assert.deepEqual(value.requirementIds.S, value.scheduler.supported);
    assert.ok(value.source.length && value.source.every(item => /^src\/.+\.mjs#/.test(item)));
    assert.equal(value.inputSchema.additionalProperties, false);
    assert.equal(value.outputSchema.properties.verify.properties.confirmed.type, 'boolean');
    assert.equal(value.permissions.arbitraryRequest, false); assert.equal(value.permissions.script, false);
    assert.equal(value.evidence.realGame, 'REAL_UNVERIFIED'); assert.equal(value.evidence.grantsPermission, false);
  }
  assert.deepEqual(FUNCTION_CONTRACTS['equipment-growth'].requirementIds.C,['C229']);assert.deepEqual(FUNCTION_CONTRACTS['equipment-growth'].requirementIds.P,['P3-6','P3-7']);
  assert.deepEqual(FUNCTION_CONTRACTS['formation-unlock'].requirementIds.C,[]);assert.deepEqual(FUNCTION_CONTRACTS['formation-unlock'].requirementIds.P,['P3-5']);assert.deepEqual(FUNCTION_CONTRACTS['formation-unlock'].inventoryRequirementIds,['FRM-005']);
  assert.deepEqual(FUNCTION_CONTRACTS['equipment-forge'].requirementIds.P,['P3-6','P3-7']); assert.deepEqual(FUNCTION_CONTRACTS['equipment-forge'].requirementIds.C,[]); assert.deepEqual(FUNCTION_CONTRACTS['equipment-forge'].inventoryRequirementIds,['BIZ-R07']);
  assert.deepEqual(FUNCTION_CONTRACTS.farm.requirementIds.C, []);assert.deepEqual(FUNCTION_CONTRACTS.farm.inventoryRequirementIds,['BIZ-R16a','BIZ-R16b','BIZ-R16c']);
  assert.deepEqual(FUNCTION_CONTRACTS.treasure.requirementIds.C, []); // World treasure is not Museum C141-C144.
});
test('all metadata is deeply immutable and description changes never affect registration', () => {
  for (const value of Object.values(FUNCTION_CONTRACTS)) {
    assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.inputSchema.properties)); assert.ok(Object.isFrozen(value.implementation.actions));
    assert.throws(() => value.implementation.actions.push('INJECTED'), TypeError);
  }
  const value = describeFunctionContract('formation'); value.requirementIds.C.push('C999'); value.permissions.premium = true; value.inputSchema.properties.request = {};
  assert.equal(describeFunctionContract('formation').permissions.premium, false);
  assert.equal(Object.hasOwn(describeFunctionContract('formation').inputSchema.properties, 'request'), false);
  assert.equal(describeFunctionContract('formation').requirementIds.C.includes('C999'), false);
});
test('unknown IDs, arbitrary metadata objects and contract validation options fail closed', () => {
  for (const id of ['__proto__', 'constructor', 'unknown', '', null, {}, { id: 'formation' }]) invalid(() => describeFunctionContract(id));
  invalid(() => validateFunctionContract('formation', adapter('alliance')));
  for (const options of [{ request: 'x' }, { requireExecutable: 'yes' }, { inputSchema: {} }, [], null, true, false, 1, 'x']) invalid(() => validateFunctionContract('formation', adapter('formation'), options));
  const injected = adapter('formation'); injected.contract = { implementation: { actions: ['INJECTED'] }, permissions: { premium: true } };
  assert.equal(validateFunctionContract('formation', injected), FUNCTION_CONTRACTS.formation);
  assert.equal(validateFunctionContract('formation', injected).permissions.premium, false);
});
test('production adapters require all real contract hooks and retain original custom executor', () => {
  for (const method of ['survey', 'view', 'plan', 'verify', 'validateParameters', 'dependencyVersions']) {
    const value = adapter('formation'); delete value[method]; invalid(() => validateFunctionContract('formation', value));
  }
  for (const id of ['orders', 'city', 'production', 'stage']) {
    const value = adapter(id); delete value.execute; invalid(() => validateFunctionContract(id, value));
  }
  const standard = adapter('formation'); delete standard.execute;
  assert.equal(validateFunctionContract('formation', standard).id, 'formation'); // Shared existing BusinessExecutor owns dispatch.
});
test('observation and protocol-only branches cannot become executable capabilities', () => {
  invalid(() => validateFunctionContract('naval', adapter('naval'), { requireExecutable: true }));
  assert.equal(validateFunctionContract('naval', adapter('naval')).implementation.mode, 'OBSERVATION_ONLY');
  for (const id of ids.filter(id => id !== 'naval')) assert.equal(validateFunctionContract(id, adapter(id), { requireExecutable: true }).id, id);
  for (const value of Object.values(FUNCTION_CONTRACTS)) for (const blocked of value.implementation.blockedCapabilities) {
    assert.equal(blocked.executable, false); assert.ok(blocked.reason.length); assert.ok(!value.implementation.actions.includes(blocked.capability));
  }
  assert.equal(FUNCTION_CONTRACTS.naval.implementation.actions.length, 0);
  assert.ok(!FUNCTION_CONTRACTS.alliance.implementation.actions.includes('ask'));
  assert.ok(!FUNCTION_CONTRACTS.alliance.implementation.actions.includes('help'));
  assert.ok(!FUNCTION_CONTRACTS.museum.implementation.actions.includes('completeExplore'));
  assert.ok(!FUNCTION_CONTRACTS.museum.implementation.actions.includes('claimExplore'));
  assert.ok(!FUNCTION_CONTRACTS.fleet.implementation.actions.includes('autoFight'));
  assert.deepEqual(FUNCTION_CONTRACTS.treasure.implementation.actions, ['treasureDispatch']);
});
test('supported scheduler declarations do not promise persistent timed or event writes', () => {
  for (const [id, value] of Object.entries(FUNCTION_CONTRACTS)) {
    assert.deepEqual(value.scheduler.supported, id === 'stage' ? ['S1', 'S2', 'S4', 'S7'] : ['S1', 'S2', 'S7']);
    assert.ok(value.scheduler.unsupported.includes('S5')); assert.ok(value.scheduler.unsupported.includes('S6'));
    assert.equal(value.scheduler.restart, 'READ_ONLY_RECOVERY_NO_AUTOMATIC_WRITES');
  }
});
test('budget, cancellation and verification contracts preserve existing shared owners and UNKNOWN', () => {
  for (const value of Object.values(FUNCTION_CONTRACTS)) {
    assert.equal(value.budget.owner, 'ResourceLedger'); assert.equal(value.budget.authorizationOwner, 'OperationService');
    assert.equal(value.budget.unknown, 'KEEP_RESERVATION_AND_STOP'); assert.ok(value.budget.required.includes('PARENT_RUN_CEILING_IF_PRESENT'));
    assert.equal(value.cancellation.signal, 'AbortSignal'); assert.equal(value.cancellation.afterDispatch, 'UNCONFIRMED_WRITE_IS_UNKNOWN');
    assert.equal(value.verification.typedResponseAlone, false); assert.equal(value.verification.historyOwner, 'ExecutionHistory');
  }
  for (const id of ['orders', 'city', 'production']) assert.equal(FUNCTION_CONTRACTS[id].verification.genericExecutorSubstitution, false);
});
test('true dependencies separate unrelated order rules and production policy', () => {
  assert.ok(FUNCTION_CONTRACTS.orders.dependencyVersions.required.includes('rules'));
  assert.equal(FUNCTION_CONTRACTS.orders.dependencyVersions.required.some(value => value.includes('productionPolicy')), false);
  for (const id of ids.filter(id => id !== 'orders')) assert.equal(FUNCTION_CONTRACTS[id].dependencyVersions.required.includes('rules'), false);
  for (const id of ids.filter(id => id !== 'production')) assert.equal(FUNCTION_CONTRACTS[id].dependencyVersions.required.some(value => value.includes('productionPolicy')), false);
  assert.deepEqual(FUNCTION_CONTRACTS.production.dependencyVersions.conditional, [{ when: 'mode=Automatic', keys: ['productionPolicy'] }]);
  assert.deepEqual(FUNCTION_CONTRACTS.naval.dependencyVersions.required, ['moduleConfig']);
  assert.equal(FUNCTION_CONTRACTS.stage.dependencyVersions.required.includes('config.StageCfg'), false); // Existing Runner consumes no StageCfg.
});
test('input fields match sixteen existing domain parameter interfaces without transport controls', () => {
  const expected = { 'badge-growth':['heroId','uid','action','pos'], 'equipment-growth':['heroId','uid','action'], 'formation-unlock':['presetId'], 'equipment-forge':['buildingId','action','makeId','allowUniversal'], farm: ['buildingId','action','productId'],
    formation: ['presetId','heroIds','heroPositions'], alliance: ['memberIds','itemIds','reqIds','cityId','season','techId','targetLevel','itemId','num'],
    museum: ['stageId','heroIds','factor','exhibitionId','useNum','payment','caseIndex','keywordType','antiqueId'], fleet: ['buildingId','cityId','shipIndex','cargoIndex','presetId','heroIds','heroPositions'],
    treasure: ['uid','fleetBuildingIds'], naval: ['targetId','playerId','excludeGuildIds','cityIds','minimumPower','maximumPower','screenCenter'], stage: ['config'], orders: [], city: [], production: [], heroes: ['heroId','action','skillIdx','allowUniversal'],
  };
  for (const [id, keys] of Object.entries(expected)) assert.deepEqual(Object.keys(FUNCTION_CONTRACTS[id].inputSchema.properties), keys);
});
test('known shapes delegate exactly once and preserve domain normalization without mutating caller', () => {
  const original = { memberIds: [123], reqIds: [{ low: 9, high: 0 }], techId: 7, targetLevel: 2 }; let called = 0;
  const result = validateFunctionParameters('alliance', adapter('alliance', value => { called++; value.memberIds = ['123']; value.reqIds = ['9']; return value; }), original);
  assert.equal(called, 1); assert.deepEqual(result.memberIds, ['123']); assert.deepEqual(original.memberIds, [123]); assert.notEqual(result, original);
  result.memberIds.push('456'); assert.deepEqual(original.memberIds, [123]);
});
test('real formation validator remains sole owner of formation values and layout conflicts', () => {
  const value = { ...formationModule, validateParameters: validateFormationParameters, dependencyVersions() { return {}; } };
  assert.deepEqual(validateFunctionParameters('formation', value, { presetId: 2, heroPositions: [{ heroId: 'h', pos: { x: 1, y: 2 } }] }), { presetId: 2, heroPositions: [{ heroId: 'h', pos: { x: 1, y: 2 } }] });
  for (const parameters of [{ presetId: -1 }, { heroIds: ['h','h'] }, { heroIds: ['h'], heroPositions: [{ heroId: 'h', pos: { x: 1, y: 2 } }] }]) assert.throws(() => validateFunctionParameters('formation', value, parameters), /presetId|heroIds|英雄/);
});
test('core adapters accept only empty business parameters and keep mode/selections out of transport schema', () => {
  for (const [id, value] of Object.entries(CORE_OPERATION_MODULES)) {
    assert.equal(validateFunctionContract(id, value).id, id); assert.deepEqual(validateFunctionParameters(id, value), {});
    for (const parameters of [{ mode: 'Automatic' }, { selections: ['x'] }, { allowMutate: true }, { uid: 1 }]) invalid(() => validateFunctionParameters(id, value, parameters));
  }
});
test('domain error identities propagate unchanged and normalized output is checked', () => {
  const domainError = Object.assign(new Error('domain rule refused'), { code: 'DOMAIN_REFUSED' });
  assert.throws(() => validateFunctionParameters('formation', adapter('formation', () => { throw domainError; }), {}), error => error === domainError);
  for (const normalized of [undefined, { request: 'AnythingRequest' }, { unknown: 1 }, Promise.resolve({})]) invalid(() => validateFunctionParameters('formation', adapter('formation', () => normalized), {}));
  assert.equal(validateFunctionParameters('stage', adapter('stage', () => null), {}), null);
  invalid(() => validateFunctionParameters('formation', adapter('formation', () => null), {}));
});
test('Stage nested unknown fields are rejected before calling existing finite-run validator', () => {
  let calls = 0; const value = adapter('stage', parameters => { calls++; if (parameters.config.maxAttempts === null && parameters.config.maxStage === null) throw Object.assign(new Error('finite limit required'), { code: 'DOMAIN_FINITE_REQUIRED' }); return parameters; });
  assert.deepEqual(validateFunctionParameters('stage', value, stage()), stage()); assert.equal(calls, 1);
  const unbounded = stage(); unbounded.config.maxAttempts = null;
  assert.throws(() => validateFunctionParameters('stage', value, unbounded), error => error.code === 'DOMAIN_FINITE_REQUIRED');
  const unknown = stage(); unknown.config.interStageDelay.extra = 1;
  invalid(() => validateFunctionParameters('stage', value, unknown)); assert.equal(calls, 2);
});
test('unknown top-level and nested schema fields never reach a domain validator', () => {
  let called = 0; const value = adapter('formation', parameters => { called++; return parameters; });
  for (const parameters of [{ petUid: '123' }, { heroIds: 'h' }, { heroPositions: [{ heroId: 'h', pos: { x: 1, y: 2, z: 3 } }] }, { heroPositions: [{ heroId: 'h', pos: { x: 1, y: 2 }, extra: true }] }]) invalid(() => validateFunctionParameters('formation', value, parameters));
  assert.equal(called, 0);
});
test('request/body/JS/auth and prototype injection keys are recursively forbidden before delegation', () => {
  let called = 0; const value = adapter('stage', parameters => { called++; return parameters; });
  for (const key of ['request','body','costs','permit','permitId','authorization','AuthorizationHeader','credentials','credential','password','Token','sign','login','loginFrameHex','wsUrl','url','javascript','script','code','eval','__proto__','prototype','constructor']) {
    const parameters = stage(); Object.defineProperty(parameters.config, key, { value: 'not executed', enumerable: true });
    invalid(() => validateFunctionParameters('stage', value, parameters));
  }
  invalid(() => validateFunctionParameters('formation', adapter('formation'), JSON.parse('{"__proto__":{"polluted":true}}')));
  assert.equal(called, 0); assert.equal({}.polluted, undefined);
});
test('acyclic plain JSON guard rejects executable types, accessors and hidden fields without invocation', () => {
  let accessed = 0;
  const getter = {}; Object.defineProperty(getter, 'presetId', { enumerable: true, get() { accessed++; throw new Error('getter executed'); } });
  const hidden = {}; Object.defineProperty(hidden, 'presetId', { value: 1, enumerable: false });
  const symbol = { [Symbol('secret')]: true }, cyclic = {}; cyclic.presetId = cyclic;
  const values = [getter, hidden, symbol, cyclic, Object.create({ presetId: 1 }), new Date(), new Map(), new Set(), { presetId: () => 1 }, { presetId: 1n }, { presetId: NaN }, { presetId: Infinity }, { presetId: undefined }];
  for (const parameters of values) invalid(() => validateFunctionParameters('formation', adapter('formation'), parameters));
  assert.equal(accessed, 0);
  assert.deepEqual(validateFunctionParameters('formation', adapter('formation'), Object.assign(Object.create(null), { presetId: 1 })), { presetId: 1 });
});
test('sparse, extended, subclassed and oversized JSON arrays fail closed', () => {
  const sparse = Array(1), extended = ['h']; extended.extra = true; class CustomArray extends Array {}
  for (const heroIds of [sparse, extended, new CustomArray('h'), Array.from({ length: 101 }, (_, index) => String(index))]) invalid(() => validateFunctionParameters('formation', adapter('formation'), { heroIds }));
  invalid(() => validateFunctionParameters('formation', adapter('formation'), { heroIds: ['x'.repeat(2001)] }));
  const deep = {}; let cursor = deep; for (let index = 0; index < 10; index++) { cursor.child = {}; cursor = cursor.child; }
  invalid(() => validateFunctionParameters('formation', adapter('formation'), deep));
  invalid(() => validateFunctionParameters('formation', adapter('formation'), Object.fromEntries(Array.from({ length: 51 }, (_, index) => ['k' + index, 1]))));
});

test('exclusive LEVEL extends existing hero contract without activation or guessed typed response',()=>{
 const c=FUNCTION_CONTRACTS.heroes;assert.deepEqual(c.requirementIds.C,['C221','C222','C223','C224','C225','C226']);assert.ok(c.inputSchema.properties.action.enum.includes('exclusive-level'));assert.ok(c.implementation.actions.includes('EXCLUSIVE-LEVEL'));assert.equal(c.verification.typedResponseAlone,false);assert.ok(c.implementation.blockedCapabilities.some(r=>r.capability==='EXCLUSIVE_ACTIVATION'&&!r.executable));assert.deepEqual(c.dependencyVersions.conditional.find(r=>r.when==='parameters.action=exclusive-level').keys,['config.ExclusiveUpgradeCfg','config.ExclusiveStarCfg','config.ExclusiveShowCfg','config.ExclusiveWeaponCfg','config.ItemCfg']);
});

test('exclusive STAR extends the same contract without level-only configuration or universal input',()=>{
 const c=FUNCTION_CONTRACTS.heroes;assert.ok(c.inputSchema.properties.action.enum.includes('exclusive-star'));assert.ok(c.implementation.actions.includes('EXCLUSIVE-STAR'));assert.equal(c.verification.typedResponseAlone,false);
 assert.deepEqual(c.dependencyVersions.conditional.find(r=>r.when==='parameters.action=exclusive-star').keys,['config.ExclusiveStarCfg','config.ExclusiveShowCfg','config.ExclusiveWeaponCfg','config.ItemCfg']);
 assert.deepEqual(validateFunctionParameters('heroes',heroModule,{action:'exclusive-star',heroId:'A'}),{action:'exclusive-star',heroId:'A'});
 for(const extra of [{allowUniversal:false},{universal:false},{star:1},{action:'exclusive-activate'}])invalid(()=>validateFunctionParameters('heroes',heroModule,{action:'exclusive-star',heroId:'A',...extra}));
});

test('badge growth C228 contract declares typed evidence plus reread and leaves other branches blocked',()=>{
 const c=FUNCTION_CONTRACTS['badge-growth'];assert.deepEqual(c.requirementIds.C,['C228']);assert.deepEqual(c.implementation.actions,['LEVEL','PUT-ON']);assert.deepEqual(c.inputSchema.properties.action.enum,['put-on']);
 assert.equal(c.verification.authoritativeRead,true);assert.equal(c.verification.typedResponseAlone,false);
 assert.ok(c.implementation.blockedCapabilities.some(row=>row.capability==='SACRIFICE_OR_REPLACE'&&!row.executable));
});

test('equipment empty-slot wear has a dedicated no-replacement action and dependency gate',()=>{
 const c=FUNCTION_CONTRACTS['equipment-growth'];assert.ok(c.implementation.actions.includes('PUT-ON'));assert.ok(c.inputSchema.properties.action.enum.includes('put-on'));
 assert.deepEqual(c.requirementIds.C,['C229']);assert.ok(c.implementation.blockedCapabilities.some(row=>row.capability==='STAR_REPLACE'&&!row.executable));
 assert.deepEqual(c.dependencyVersions.conditional.find(row=>row.when==='parameters.action=put-on').keys,['config.ModuleOpenCfg']);
});
