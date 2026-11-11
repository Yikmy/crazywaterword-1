// Trusted, static Function metadata. This module never loads protocol, opens a
// Session, dispatches a request or turns a description into executable code.
const invalid = message => Object.assign(new Error(message), { code: 'INVALID_FUNCTION_CONTRACT', statusCode: 400 });
const badParameters = message => Object.assign(new Error(message), { code: 'INVALID_PARAMETERS', statusCode: 400 });
const own = (value, key) => Object.hasOwn(value, key);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const object = (properties = {}, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const string = { type: 'string' }, integer = { type: 'integer' }, number = { type: 'number' }, boolean = { type: 'boolean' };
const array = items => ({ type: 'array', items });
const nullable = type => ({ type: [type, 'null'] });
const decimalId = { anyOf: [string, integer] };
// The existing Alliance validator also accepts an exact protobuf Long-shaped ID.
const allianceId = { anyOf: [string, integer, object({ low: integer, high: integer, unsigned: boolean }, ['low', 'high'])] };
const point = object({ x: integer, y: integer }, ['x', 'y']);
const formationParameters = { presetId: integer, heroIds: array(string), heroPositions: array(object({ heroId: string, pos: point }, ['heroId', 'pos'])) };
const stageConfig = object({ enabled: boolean, retryDelaySeconds: number, maxAttempts: nullable('integer'), maxStage: nullable('integer'), stopOnDefeat: boolean,
  interStageDelay: object({ minSeconds: number, maxSeconds: number }, ['minSeconds', 'maxSeconds']), formation: object({ enabled: boolean, presetId: nullable('integer') }, ['enabled', 'presetId']) },
['enabled', 'retryDelaySeconds', 'maxAttempts', 'maxStage']);
const outputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    survey: { type: 'object', description: 'Domain facts, reliability and provenance; Maps are serialized by the existing service.' },
    view: { type: 'object', description: 'Display candidates and blocked reasons; display is not authorization.' },
    plan: { type: 'object', required: ['actions'], properties: { actions: array({ type: 'object' }), notes: array(string) } },
    verify: { type: 'object', required: ['confirmed'], properties: { confirmed: boolean, reason: string } },
    execute: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['SUCCESS', 'FAILED', 'UNKNOWN', 'CANCELLED', 'RATE_LIMITED', 'NOT_EXECUTED'] }, dispatched: boolean, unresolvedWrite: boolean } },
  },
};
const common = {
  version: 1,
  contract: 'Survey → View → Plan → Authorize → Execute → Verify → Persist History',
  outputSchema,
  permissions: { read: 'ACCOUNT_SCOPED_SESSION', write: 'ACCOUNT_MODULE_ENABLED_AND_EXACT_BATCH_PERMIT', arbitraryRequest: false, script: false, premium: false, developmentCredentials: false, accountIsolation: 'ACCOUNT_SESSION_GENERATION_AND_CONNECTION' },
  budget: { owner: 'ResourceLedger', authorizationOwner: 'OperationService', required: ['RELIABLE_STOCK', 'EXACT_COST_SOURCE', 'SHARED_RESERVATION', 'PARENT_RUN_CEILING_IF_PRESENT'], unknown: 'KEEP_RESERVATION_AND_STOP', expectedIncome: 'NEVER_SPEND_BEFORE_AUTHORITATIVE_READ', unitReservations: ['ITEM', 'QUOTA', 'INSTANCE_UID'], createsLedger: false },
  cancellation: { methods: ['assertExecutionActive', 'awaitExecution'], signal: 'AbortSignal', owner: 'EXISTING_SESSION_AND_EXECUTOR', beforeDispatch: 'ASSERT_CURRENT_AND_NOT_ABORTED', afterDispatch: 'UNCONFIRMED_WRITE_IS_UNKNOWN', lateResponse: 'NEVER_REAUTHORIZE_OR_REPLAY' },
  scheduler: { supported: ['S1', 'S2', 'S7'], unsupported: ['S3', 'S4', 'S5', 'S6', 'S8'], policy: 'FINITE_ACTION_BATCH_WITH_CURRENT_AUTHORIZATION', restart: 'READ_ONLY_RECOVERY_NO_AUTOMATIC_WRITES' },
  evidence: { kind: 'SOURCE_CONTRACT', realGame: 'REAL_UNVERIFIED', describesCapability: true, grantsPermission: false },
};
function contract(id, C, P, source, properties, details) {
  return { ...common, id, capabilityId: 'cw.' + id, requirementIds: { C, P, S: details.scheduler?.supported ?? common.scheduler.supported }, source,
    inputSchema: { ...object(properties), $comment: 'Structure and field whitelist only. adapter.validateParameters owns all domain values, limits and cross-field rules.' }, ...details };
}
function dependencies(required, conditional = []) { return { method: 'dependencyVersions', required, conditional, unrelatedDependencies: 'MUST_NOT_INVALIDATE_PLAN', actualValues: 'TRUSTED_ADAPTER_ONLY' }; }
function verification(method, source, scope, extra = {}) { return { method, source, scope, authoritativeRead: true, typedResponseAlone: false, historyOwner: 'ExecutionHistory', ...extra }; }
const blocked = (capability, reason, status = 'BLOCKED_EVIDENCE') => ({ capability, status, executable: false, reason });
export const FUNCTION_CONTRACTS = freeze({
  'equipment-forge': contract('equipment-forge', [], ['P3-6','P3-7'], ['src/equipment-forge.mjs#equipmentForgeModule','src/equipment-forge.mjs#planEquipmentForge'], {buildingId:string,action:{type:'string',enum:['make','pick']},makeId:integer,allowUniversal:boolean}, {
    inventoryRequirementIds:['BIZ-R07'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['MAKE','PICK'],blockedCapabilities:[blocked('UNIVERSAL_EXCHANGE','Universal material consumption is not proven'),blocked('IMPLICIT_IDLE_QUEUE','Missing equipMaking does not prove an idle queue'),blocked('QUALITY_FALLBACK','Automatic lower-quality fallback is excluded')]},
    verification:verification('verifyEquipmentForge','src/equipment-forge.mjs#verifyEquipmentForge','Exact original batch, queue, typed pick equipId, one new owned UID and full inventory net change'),
    dependencyVersions:dependencies(['moduleConfig','config.BuildingCfg','config.BuildingEquipMakeCfg','config.EquipMakeLibCfg','config.EquipCfg']),
  }),
  farm: contract('farm', [], ['P2-2'], ['src/farm-operations.mjs#farmModule','src/farm-operations.mjs#planFarmOperations'], {buildingId:string,action:{type:'string',enum:['plant','harvest']},productId:string}, {
    inventoryRequirementIds:['BIZ-R16a','BIZ-R16b','BIZ-R16c'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['PLANT'],blockedCapabilities:[blocked('HARVEST','Maturity time unit and CriticalAsset reward semantics lack authoritative evidence'),blocked('IMPLICIT_EMPTY_PLOT','Missing farm is not proven empty'),blocked('AUTO_FARMING','Server automatic farming is outside a single-plot permit')]},
    verification:verification('verifyFarmOperation','src/farm-operations.mjs#verifyFarmOperation','Fresh exact OnWater crop, unchanged other plots and exact full inventory seed debit'),
    dependencyVersions:dependencies(['moduleConfig','config.BuildingCfg','config.FarmlandPlantCfg']),
  }),
  formation: contract('formation', ['C211', 'C212', 'C213', 'C214'], ['P1-3', 'P3-5'], ['src/formation.mjs#formationModule', 'src/formation.mjs#validateFormationParameters'], formationParameters, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['SAVE'], blockedCapabilities: [blocked('C215', 'Extreme-copy and other battle-mode formation are not implemented', 'NOT_IMPLEMENTED'), blocked('UNLOCK_PRESET', 'Paid unlock is excluded by D6')] },
    verification: verification('verifyFormation', 'src/formation.mjs#verifyFormation', 'Full saved mainline formation and unchanged petUid, typed response plus fresh GetFormation; no victory claim'),
    dependencyVersions: dependencies(['moduleConfig', 'config.FormationTypePositionCfg', 'config.FormationHeroNumCfg', 'config.HeroCfg']),
  }),
  alliance: contract('alliance', ['C301', 'C302', 'C303', 'C304', 'C305', 'C306', 'C307'], ['P1-5', 'P4-1', 'P4-2', 'P4-3', 'P4-4'], ['src/alliance.mjs#allianceModule', 'src/alliance.mjs#parametersOf', 'src/alliance.mjs#allianceTechView'], {
    memberIds: array(allianceId), itemIds: array(string), reqIds: array(allianceId), cityId: integer, season: integer, techId: integer, targetLevel: integer,
  }, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['cancel', 'claimAid', 'finishOrder', 'claimWelfare', 'upgradeTech'], conditionalActions: [{ actionType: 'help', requires: 'Trusted survey allowance, daily usage, cooldown and reliable game clock; production facts currently unavailable' }],
      blockedCapabilities: [blocked('C303/C304:help', 'Production survey cannot yet establish authoritative daily allowance and usage'), blocked('C305:ask', 'Authoritative cooldown and exact eligible request are unavailable'), blocked('donateFort', 'Independent fortress survey and construction contract are missing')] },
    verification: verification('verifyAlliance', 'src/alliance.mjs#verifyAlliance', 'Request identity, membership, counters and inventory; technology exact targetLevel from fresh GuildTechInfo'),
    dependencyVersions: dependencies(['moduleConfig', 'config.GuildParamCfg', 'config.GuildOrderNumCfg', 'config.GuildTechCfg', 'config.TechUnlockCfg']),
  }),
  museum: contract('museum', ['C141', 'C142', 'C143', 'C144'], ['P2-7'], ['src/museum.mjs#museumModule', 'src/museum.mjs#parametersOf'], {
    stageId: integer, heroIds: array(string), factor: integer, exhibitionId: integer, useNum: integer, payment: { type: 'string', enum: ['ITEM', 'PREMIUM', 'FREE'] }, caseIndex: integer, keywordType: integer, antiqueId: string,
  }, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['startExplore', 'speedExplore', 'collectRevenue', 'claimAchievement', 'upgradeExhibition', 'upgradeKeyword', 'upgradeCase', 'finishCase', 'speedCase', 'exhibit'],
      blockedCapabilities: [blocked('C144:completeExplore', 'Pending settlement state is not authoritative'), blocked('C144:claimExplore', 'Verified complete result and pending reward identity are missing'), blocked('PREMIUM_OR_AD_SPEED', 'Only proven existing inventory items are permitted; payment selector does not authorize spending')] },
    verification: verification('verifyMuseum', 'src/museum.mjs#verifyMuseum', 'Exact exploration, exhibition, case, collection and item-cost state; never infer settlement or reward from elapsed time'),
    dependencyVersions: dependencies(['moduleConfig', ...['MuseumExpeditionStageCfg', 'MuseumExpeditionTeamCfg', 'MuseumExpeditionConditionCfg', 'MuseumExploreTimeFactorCfg', 'MuseumAchievementCfg', 'MuseumAreaCfg', 'MuseumAreaIndicatorCfg', 'MuseumDisplayCaseCfg', 'AntiqueBaseCfg'].map(name => 'config.' + name)]),
  }),
  fleet: contract('fleet', ['C131', 'C132', 'C133', 'C134', 'C401', 'C402', 'C406', 'C407', 'C408', 'C409'], ['P1-4', 'P2-6', 'P5-1', 'P5-2'], ['src/fleet.mjs#fleetModule', 'src/fleet.mjs#parametersOf'], {
    buildingId: string, cityId: integer, shipIndex: integer, cargoIndex: integer, ...formationParameters,
  }, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['fleetRepair', 'fleetStopRepair', 'fleetMove', 'fleetFormation', 'fleetStopAutoFight', 'cargoFill', 'cargoClaim'],
      blockedCapabilities: [blocked('C406:attack', 'Existing city dispatch confirms MOVEMENT_ONLY'), blocked('C408:speedUpFleet', 'Current client path consumes premium currency'), blocked('C408:speedUpRepair', 'Unproven cost and payment semantics'), blocked('C134:speedUpCargo', 'Independent unproven payment semantics'), blocked('autoFight:true', 'Persistent automatic dispatch is outside a single-action permit'), blocked('C409:premium', 'D6 hard exclusion', 'NOT_IMPLEMENTED')] },
    verification: verification('verifyFleet', 'src/fleet.mjs#verifyFleet', 'Fresh fleet/OnWater/cargo state, inventory and durability; movement is not attack or victory'),
    dependencyVersions: dependencies(['moduleConfig', 'config.CityCfg', 'config.AttackCityConsumeCfg', 'config.FormationTypePositionCfg', 'config.FormationHeroNumCfg', 'config.HeroCfg', 'mapAsset']),
  }),
  treasure: contract('treasure', [], [], ['src/treasure.mjs#treasureModule', 'src/treasure.mjs#parametersOf'], { uid: integer, fleetBuildingIds: array(string) }, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['treasureDispatch'], requirementScope: 'Original Inventory PRO-009 world TreasureLoot; distinct from Museum C141-C144',
      blockedCapabilities: [blocked('OCCUPIED_TREASURE_COMBAT', 'Battle identity, side and outcome evidence are unavailable'), blocked('TREASURE_REWARD', 'Dispatch confirmation does not establish victory, loot or reward')] },
    verification: verification('verifyTreasure', 'src/treasure.mjs#verifyTreasure', 'MyFleets association confirms dispatch only, not treasure ownership or reward'),
    dependencyVersions: dependencies(['moduleConfig', 'config.GameplayOpenCfg', 'config.WorldParamCfg']),
  }),
  naval: contract('naval', ['C403', 'C404', 'C405', 'C410'], ['P1-4', 'P5-4', 'P5-5'], ['src/naval-rules.mjs#navalModule', 'src/naval-rules.mjs#navalParameters', 'src/naval-rules.mjs#evaluateNavalRules'], {
    targetId: string, playerId: decimalId, excludeGuildIds: array(decimalId), cityIds: array(integer), minimumPower: decimalId, maximumPower: decimalId, screenCenter: point,
  }, {
    permissions: { ...common.permissions, write: 'FORBIDDEN_OBSERVATION_ONLY' },
    implementation: { mode: 'OBSERVATION_ONLY', actions: [], blockedCapabilities: [blocked('worldBoss', 'SIDE_UNVERIFIED; no mode-specific final result association'), blocked('limitedBoss', 'SIDE_UNVERIFIED; no authoritative single-battle association'), blocked('follow', 'Target continuity and dispatch semantics are unverified'), blocked('C410:attack', 'Three-valued rule PASS is observation, not dispatch authorization')] },
    verification: verification('verify', 'src/naval-rules.mjs#navalModule.verify', 'Observation completeness is CURRENT_RESPONSE_ONLY; write verification always false', { authoritativeRead: false, canConfirmWrite: false }),
    dependencyVersions: dependencies(['moduleConfig']),
  }),
  stage: contract('stage', ['C201', 'C202', 'C203', 'C204', 'C205', 'C206', 'C207', 'C208'], ['P3-1', 'P3-2', 'P3-3'], ['src/stage-function.mjs#createStageFunction', 'src/stages.mjs#createStageRunner', 'src/stages.mjs#validateStageConfig'], { config: stageConfig }, {
    implementation: { mode: 'EXISTING_BOUNDED_RUNNER', actions: ['RUN_MAINLINE'], blockedCapabilities: [blocked('OTHER_BATTLE_MODES', 'BT_MAINLINE LEFT proof is not reusable for other modes'), blocked('UNBOUNDED_RUN', 'Workflow Stage parameters must have existing finite limits', 'NOT_IMPLEMENTED')] },
    scheduler: { ...common.scheduler, supported: ['S1', 'S2', 'S4', 'S7'], unsupported: ['S3', 'S5', 'S6', 'S8'], policy: 'EXISTING_STAGE_RUNNER_WITH_FINITE_PARAMETERS' },
    verification: verification('verify', 'src/stage-function.mjs#createStageFunction.verify', 'Same existing Runner/runId/session, complete per-battle typed history and final progress; completion does not promise all victories'),
    dependencyVersions: dependencies(['moduleConfig'], [{ when: 'parameters.config.formation.enabled=true', keys: ['config.FormationTypePositionCfg', 'config.FormationHeroNumCfg', 'config.HeroCfg'] }]),
  }),
  orders: contract('orders', ['C121', 'C122', 'C123', 'C125', 'C126', 'C128'], ['P2-3', 'P2-4', 'P2-5'], ['src/core-operation-adapters.mjs#ordersModule', 'src/order-execution.mjs#surveyOrderExecution', 'src/order-execution.mjs#executeOrderOperation'], {}, {
    implementation: { mode: 'EXISTING_EXECUTOR_ADAPTER', actions: ['SUBMIT'], conditionalActions: [{ actionType: 'REFRESH', requires: 'Trusted original survey proof of a reliably free refresh; business parameters cannot supply it' }],
      blockedCapabilities: [blocked('C126:REFRESH_WITHOUT_PROOF', 'Production free-refresh quota evidence is currently unavailable'), blocked('C124:GOLD_REWARD_RULE', 'This adapter does not implement the gold-order reward product requirement', 'NOT_IMPLEMENTED')] },
    verification: verification('verify', 'src/core-operation-adapters.mjs#verifyCoreOperation', 'Original executeOrderOperation authoritative checks; only original wrapper WeakMap receipt confirms', { executionMethod: 'execute', genericExecutorSubstitution: false }),
    dependencyVersions: dependencies(['moduleConfig', 'rules', 'config.WorkerOrderCfg', 'config.WorkerSpecOrderCfg']),
  }),
  city: contract('city', ['C101', 'C102', 'C103', 'C104', 'C116'], ['P1-2', 'P2-1'], ['src/core-operation-adapters.mjs#cityModule', 'src/city-operations.mjs#surveyCityOperations', 'src/city-operations.mjs#executeCityAction'], {}, {
    implementation: { mode: 'EXISTING_EXECUTOR_ADAPTER', actions: ['build', 'upgrade', 'finishUpgrade', 'collectProduct', 'speedUpUpgrade'], blockedCapabilities: [blocked('PREMIUM_OR_AD_SPEED', 'Only existing proven item acceleration path is permitted')] },
    verification: verification('verify', 'src/core-operation-adapters.mjs#verifyCoreOperation', 'Original executeCityAction building, cost and result reread; original wrapper receipt required', { executionMethod: 'execute', genericExecutorSubstitution: false }),
    dependencyVersions: dependencies(['moduleConfig', 'config.BuildingCfg', 'config.BuildingUpgradeCfg']),
  }),
  production: contract('production', ['C111', 'C113', 'C114', 'C115', 'C116'], ['P1-2', 'P2-2'], ['src/core-operation-adapters.mjs#productionModule', 'src/city-operations.mjs#executeCityAction', 'src/production-policy.mjs#selectProductionCandidates'], {}, {
    implementation: { mode: 'EXISTING_EXECUTOR_ADAPTER', actions: ['startProduce', 'gainFactory', 'speedUpProduce'], blockedCapabilities: [blocked('C112:COMPLETE_DAILY_REPORT', 'Existing queue and shortages do not implement the full daily production report', 'NOT_IMPLEMENTED'), blocked('PREMIUM_OR_AD_SPEED', 'Only existing proven item acceleration path is permitted')] },
    verification: verification('verify', 'src/core-operation-adapters.mjs#verifyCoreOperation', 'Original executeCityAction queue and inventory reread; original wrapper receipt required', { executionMethod: 'execute', genericExecutorSubstitution: false }),
    dependencyVersions: dependencies(['moduleConfig', 'config.BuildingCfg', 'config.BuildingProduceCfg', 'config.BuildingProduceParamCfg', 'config.GameParamCfg', 'config.AppointEffectCfg', 'config.AppointPosCfg', 'config.HeroCfg', 'config.FarmlandPlantCfg', 'config.SelectPackLibCfg'], [{ when: 'mode=Automatic', keys: ['productionPolicy'] }]),
  }),
  heroes: contract('heroes', ['C221','C222','C223','C224'], ['P3-6','P3-7'], ['src/hero-operations.mjs#heroModule','src/heroes.mjs#planHeroes','src/heroes.mjs#buildHeroAction'], {
    heroId: string, action: { type: 'string', enum: ['level','star','skill'] }, skillIdx: integer, allowUniversal: boolean,
  }, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['LEVEL','STAR','SKILL'], blockedCapabilities: [blocked('UNIVERSAL_FRAGMENTS', 'Independent universal-fragment cost and consumption semantics are not proven')] },
    verification: verification('verifyHeroOperation','src/hero-operations.mjs#verifyHeroOperation','Fresh AllHero plus exact single target growth and full inventory delta; LEVEL/SKILL have no invented response and remain UNKNOWN without authoritative effect'),
    dependencyVersions: dependencies(['moduleConfig','config.HeroCfg'], [
      { when: 'parameters.action=level', keys: ['config.HeroUpgradeCfg'] },
      { when: 'parameters.action=star', keys: ['config.HeroStarCfg'] },
      { when: 'parameters.action=skill', keys: ['config.HeroStarCfg','config.HeroSkillUpCfg'] },
      { when: 'parameters.action=null', keys: ['config.HeroUpgradeCfg','config.HeroStarCfg','config.HeroSkillUpCfg'] },
    ]),
  }),
});

function getContract(moduleId) {
  if (typeof moduleId !== 'string' || !own(FUNCTION_CONTRACTS, moduleId)) throw invalid('Unknown trusted Function module');
  return FUNCTION_CONTRACTS[moduleId];
}
// Descriptions are detached JSON values, never an adapter, request or permission.
export function describeFunctionContract(moduleId) { return structuredClone(getContract(moduleId)); }
export function validateFunctionContract(moduleId, adapter, options = {}) {
  const value = getContract(moduleId);
  const opts = jsonValue(options);
  if (!opts || typeof opts !== 'object' || Array.isArray(opts) || Object.keys(opts).some(key => key !== 'requireExecutable') || own(opts, 'requireExecutable') && typeof opts.requireExecutable !== 'boolean') throw invalid('Unknown Function contract validation option');
  if (!adapter || adapter.id !== moduleId) throw invalid('Function adapter identity does not match static contract');
  for (const method of ['survey', 'view', 'plan', 'verify', 'validateParameters', 'dependencyVersions']) if (typeof adapter[method] !== 'function') throw invalid('Function adapter is missing ' + method);
  if (['EXISTING_EXECUTOR_ADAPTER', 'EXISTING_BOUNDED_RUNNER'].includes(value.implementation.mode) && typeof adapter.execute !== 'function') throw invalid('Existing executor adapter must retain its execute method');
  if (opts.requireExecutable && (!value.implementation.actions.length || value.implementation.mode === 'OBSERVATION_ONLY')) throw invalid('Protocol-only or observation capability is not executable');
  return value;
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor', 'request', 'body', 'costs', 'permit', 'permitid', 'authorization', 'authorizationheader', 'credentials', 'credential', 'password', 'token', 'sign', 'login', 'loginframehex', 'wsurl', 'url', 'javascript', 'script', 'code', 'eval']);
// Inspect data descriptors before reading values. Getters, cycles, hidden fields,
// sparse/extended arrays and executable objects cannot smuggle data past JSON.
function jsonValue(value, path = '$', depth = 0, ancestors = new Set(), counter = { count: 0 }) {
  if (depth > 8 || ++counter.count > 3000) throw badParameters('Function parameter structure is too large or deep');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw badParameters('Function numbers must be finite'); return value; }
  if (typeof value === 'string') { if (value.length > 2000) throw badParameters('Function string is too long'); return value; }
  if (typeof value !== 'object' || ancestors.has(value)) throw badParameters('Function parameters must be acyclic JSON data');
  const list = Array.isArray(value), proto = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (list ? proto !== Array.prototype || value.length > 100 || keys.length !== value.length + 1 : ![Object.prototype, null].includes(proto) || keys.length > 50) throw badParameters('Function object or array is not plain bounded JSON');
  ancestors.add(value);
  const out = list ? [] : {};
  for (const key of keys) {
    if (list && key === 'length') continue;
    if (typeof key !== 'string' || forbidden.has(key.toLowerCase()) || key.length > 200) throw badParameters('Forbidden Function parameter field');
    const descriptor = descriptors[key];
    if (!own(descriptor, 'value') || !descriptor.enumerable || list && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) throw badParameters('Function parameters cannot contain accessors or hidden fields');
    out[key] = jsonValue(descriptor.value, path + '.' + key, depth + 1, ancestors, counter);
  }
  ancestors.delete(value);
  return out;
}
function shape(value, schema, path = '$') {
  if (schema.anyOf) {
    for (const alternative of schema.anyOf) { try { shape(value, alternative, path); return; } catch (error) { if (error.code !== 'INVALID_PARAMETERS') throw error; } }
    throw badParameters('Function field has unsupported structure: ' + path);
  }
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.includes(type) && !(types.includes('integer') && type === 'number' && Number.isInteger(value))) throw badParameters('Function field type mismatch: ' + path);
  if (schema.enum && !schema.enum.includes(value)) throw badParameters('Function field value is not declared: ' + path);
  if (type === 'object') {
    for (const key of Object.keys(value)) { if (!own(schema.properties ?? {}, key) && schema.additionalProperties === false) throw badParameters('Unknown Function parameter field: ' + path + '.' + key); if (schema.properties?.[key]) shape(value[key], schema.properties[key], path + '.' + key); }
    for (const key of schema.required ?? []) if (!own(value, key)) throw badParameters('Missing Function field: ' + path + '.' + key);
  } else if (type === 'array' && schema.items) value.forEach((item, index) => shape(item, schema.items, path + '[' + index + ']'));
}
// Structural checks cannot replace the existing domain validator. In particular,
// Stage finiteness, int64 identity, payment and formation rules stay in adapters.
export function validateFunctionParameters(moduleId, adapter, parameters = {}) {
  const value = validateFunctionContract(moduleId, adapter), copied = jsonValue(parameters);
  shape(copied, value.inputSchema);
  const normalized = adapter.validateParameters(copied);
  if (normalized === null && moduleId === 'stage') return null; // Existing Stage survey may omit finite config; plan remains blocked.
  const result = jsonValue(normalized);
  shape(result, value.inputSchema);
  return result;
}
