import { tradeModule } from '../src/trade.mjs';
import { materialPackModule } from '../src/material-packs.mjs';
import { petModule } from '../src/pet-operations.mjs';
import { trialChallengeModule } from '../src/trial-challenge.mjs';
import { freeRecruitModule } from '../src/free-recruit.mjs';
import { freeGoldModule } from '../src/free-gold.mjs';
import { afkLevelRewardsModule } from '../src/afk-level-rewards.mjs';
import { mailModule } from '../src/mail.mjs';
import { taskRewardsModule } from '../src/task-rewards.mjs';
import { pirateSweepModule } from '../src/pirate-operations.mjs';
import { antiqueGrowthModule } from '../src/antique-growth.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMEPLAY_MODULES, registerBusinessFunction, listBusinessFunctions } from '../src/function-registry.mjs';
import { FUNCTION_CONTRACTS, describeFunctionContract, validateFunctionContract } from '../src/function-contracts.mjs';
import { createStageFunction } from '../src/stage-function.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { equipmentGrowthModule } from '../src/equipment-growth.mjs';
import { badgeGrowthModule } from '../src/badge-growth.mjs';
import { formationUnlockModule } from '../src/formation-unlock.mjs';
import { equipmentForgeModule } from '../src/equipment-forge.mjs';
import { farmModule } from '../src/farm-operations.mjs';
import { heroModule } from '../src/hero-operations.mjs';
import { formationModule } from '../src/formation.mjs';
import { allianceModule } from '../src/alliance.mjs';
import { museumModule } from '../src/museum.mjs';
import { fleetModule } from '../src/fleet.mjs';
import { treasureModule } from '../src/treasure.mjs';
import { navalModule } from '../src/naval-rules.mjs';
import { CORE_OPERATION_MODULES } from '../src/core-operation-adapters.mjs';

// Every protocol type, response and account below is synthetic. No GameClient
// connection, asset loader, default account path or persistent store is used.
const clone = value => structuredClone(value);
const allIds = ['trade','formation','alliance','museum','treasure','fleet','naval','orders','city','production','heroes','farm','equipment-forge','formation-unlock','equipment-growth','badge-growth','antique-growth','pirate-sweep','task-rewards','mail','afk-level-rewards','free-gold','free-recruit','trial-challenge','pet','material-packs','stage'];
const rawModules = { trade: tradeModule, formation: formationModule, alliance: allianceModule, museum: museumModule, treasure: treasureModule, fleet: fleetModule, naval: navalModule, ...CORE_OPERATION_MODULES, heroes: heroModule, farm: farmModule, 'equipment-forge':equipmentForgeModule, 'formation-unlock':formationUnlockModule, 'equipment-growth':equipmentGrowthModule, 'badge-growth':badgeGrowthModule, 'antique-growth':antiqueGrowthModule, 'pirate-sweep':pirateSweepModule, 'task-rewards':taskRewardsModule, mail:mailModule, 'afk-level-rewards':afkLevelRewardsModule,'free-gold':freeGoldModule,'free-recruit':freeRecruitModule,'trial-challenge':trialChallengeModule,pet:petModule,'material-packs':materialPackModule };
const tablesByModule = { trade:['TradeGoodsCfg','TradeShipCfg'], 'material-packs':['ItemCfg','SelectPackLibCfg'], pet:['BuildingCfg','PetParamCfg','PetBaseCfg','ItemCfg'], 'trial-challenge':['ModuleOpenCfg','TrialRaidCfg','TrialRaidStageCfg','ItemCfg'], 'free-recruit':['ModuleOpenCfg','HeroCfg','ItemCfg'], 'free-gold':['OfflineParamCfg','ModuleOpenCfg'], 'afk-level-rewards':['OfflineLvRewardCfg','ItemCfg'], mail:['ItemCfg'], 'task-rewards':['MainTaskCfg','BranchTaskCfg','AchievementTaskCfg','ItemCfg'], 'pirate-sweep':['PirateParamCfg','VipLevelCfg','MonthCardCfg'], 'antique-growth':['ModuleOpenCfg','AntiqueBaseCfg','AntiqueSuitCfg','AntiqueStarCfg','AntiqueSuitLvCfg','AntiqueMasterLvCfg','ItemCfg'], 'badge-growth':['HeroCfg','HeroBadgeCfg','HeroBadgeAttrCfg','HeroBadgeLevelCfg','HeroBadgeUnlockCfg'], 'equipment-growth':['EquipCfg','EquipAttrCfg','EquipUpDecomposeCfg'], 'formation-unlock':['FormationTypeUnlockCfg','ItemCfg','FormationTypePositionCfg'], 'equipment-forge':['BuildingCfg','BuildingEquipMakeCfg','EquipMakeLibCfg','EquipCfg'], farm: ['BuildingCfg','FarmlandPlantCfg'],
  heroes: ['HeroCfg','HeroUpgradeCfg','HeroStarCfg','HeroSkillUpCfg'],
  formation: ['FormationTypePositionCfg','FormationHeroNumCfg','HeroCfg'],
  alliance: ['GuildParamCfg','GuildOrderNumCfg','GuildTechCfg','TechUnlockCfg','WorldFortCfg','FortDonateMaterialCfg','FortParamCfg','FortSeasonUnlockCfg','ItemCfg'],
  museum: ['MuseumExpeditionStageCfg','MuseumExpeditionTeamCfg','MuseumExpeditionConditionCfg','MuseumExploreTimeFactorCfg','MuseumAchievementCfg','MuseumAreaCfg','MuseumAreaIndicatorCfg','MuseumDisplayCaseCfg','AntiqueBaseCfg'],
  fleet: ['CityCfg','AttackCityConsumeCfg','FormationTypePositionCfg','FormationHeroNumCfg','HeroCfg'],
  treasure: ['GameplayOpenCfg','WorldParamCfg'], naval: [], stage: [], orders: ['WorkerOrderCfg','WorkerSpecOrderCfg'],
  city: ['BuildingCfg','BuildingUpgradeCfg'], production: ['BuildingCfg','BuildingProduceCfg','BuildingProduceParamCfg','GameParamCfg',...["AppointEffectCfg","AppointPosCfg","HeroCfg","FarmlandPlantCfg","SelectPackLibCfg"]],
};
const stageParameters = (formationEnabled = false) => ({ config: { enabled: true, retryDelaySeconds: 0, maxAttempts: 1, maxStage: null, stopOnDefeat: true, formation: { enabled: formationEnabled, presetId: formationEnabled ? 2 : null } } });
function fixture() {
  const config = { tables: {
    FormationTypePositionCfg: { data: [{ id: 1, position: [1,1] },{ id: 2, position: [2,1] }] },
    FormationHeroNumCfg: { data: [{ heroNum: 1, mainlineStage: 0 }] }, HeroCfg: { data: [{ id: 'h', career: '坦克' }] },
    BuildingCfg: { data: [{ buildingType: '民居' },{ buildingType: '材料厂' }] },
    BuildingUpgradeCfg: { data: ['民居','材料厂'].flatMap(buildingType => [
      { buildingType, level: 1, playerLevel: 1, curPeople: 0, consume: [['wood',1]], condition: [], effect: [['人口增加',10]], costTime: 0 },
      { buildingType, level: 2, playerLevel: 1, curPeople: 0, consume: [['wood',2]], condition: [], effect: [], costTime: 30 },
    ]) },
    BuildingProduceCfg: { data: [{ buildType: '材料厂', itemId: 'cloth', produceTime: 30, unlockLevel: 1, costItem: [['wood',1]] }] },
    BuildingProduceParamCfg: { data: [{ paramName: '制造位上限', paramValue: 6 }] },
    GameParamCfg: { data: [{ paramName: '初始人口上限', paramValue: 100 },{ paramName: '产品存量初始上限', paramValue: 50 }] },
    WorkerOrderCfg: { data: [{ itemId: 'wood', reward: [['EXP',100]] }] }, WorkerSpecOrderCfg: { data: [] },
    UnrelatedCfg: { data: [{ value: 1 }] },
  } };
  for (const names of Object.values(tablesByModule)) for (const name of names) config.tables[name] ??= { data: [{ revision: 1 }] };
  const state = { config, rules: { version: 1, enabled: true, rules: [] }, productionPolicy: { version: 1, enabled: true, onlyShortages: false, productIds: ['cloth'], maxOperations: 1 }, moduleConfigs: {}, mapAsset: { version: 1 }, lookups: 0, historyWrites: 0, runnerPreparations: 0 };
  const reads = [], writes = [];
  const raw = { building: [
    { buildingId: '1民居', level: 0, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] } },
    { buildingId: '1材料厂', level: 1, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] }, factory: { autoProductId: '', factoryQ: [], finishedProducts: [] } },
  ], workerOrder: [{ index: 0, workerId: 'synthetic-resident', textId: 1, isSpecial: false, refreshTime: 0, requirements: [{ id: 'wood', num: 2 }] }], orderOfTheDay: { orderNum: 3 } };
  const formation = { presetId: 1, heroPositions: [{ heroId: 'h', pos: { x: 1, y: 1 } }], petUid: '9007199254740993' };
  const responses = {
    OnWaterRequest: raw, AllItemRequest: { items: [{ itemId: 'wood', num: 20 },{ itemId: 'cloth', num: 0 },{ itemId: '加速器', num: 3 }] },
    AllResourceRequest: { list: [] }, MyResFieldsRequest: { info: { fields: [] } }, MyFleetsRequest: { fleets: [] },
    GetFormationRequest: { formation }, MyFormationPresetRequest: { ids: [2] }, AllHeroRequest: { heroes: [{ heroId: 'h' }] },
  };
  const protocol = Object.fromEntries(['OnWater','AllItem','AllResource','MyResFields','MyFleets','FinishWorkerOrder','CollectBuildingProduct','GainFactoryProduce','GetFormation','MyFormationPreset','AllHero','SaveFormation','ChallengeStage']
    .flatMap(name => [[name + 'Request',{}],[name + 'Response',{}]]));
  for (const name of ['BuildBuilding','UpgradeBuilding','FinishUpgradeBuilding','StartFactoryProduce','SpeedUpUpgradeBuilding','SpeedUpFactoryProduce','DenyOrder']) protocol[name + 'Request'] = {};
  const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: new Set(),
    async request(name, body, response, timeout, options) {
      if (options?.mutate) { writes.push({ name, body }); throw new Error('This integration fixture never executes writes'); }
      reads.push({ name, body: clone(body) });
      if (!Object.hasOwn(responses,name)) throw new Error('Unexpected synthetic read: ' + name);
      return clone(responses[name]);
    },
    async sendWatch(name, body) { writes.push({ name, body }); throw new Error('This integration fixture never executes writes'); },
  };
  const session = { id: 'synthetic-A', generation: 1, connectionId: 'synthetic-connection', abort: new AbortController(), state: 'READY', client,
    player: { playerId: '1', worldId: '1', level: 5, mainlineStage: 101 }, loop: { running: false }, busy: null };
  const stage = createStageFunction({ getSession: async queried => queried === client ? session : null, prepareRunner: async () => { state.runnerPreparations++; throw new Error('Runner creation is outside these read/plan tests'); } });
  const modules = Object.freeze({ ...GAMEPLAY_MODULES, stage: registerBusinessFunction(stage) });
  for (const [id, module] of Object.entries(modules)) state.moduleConfigs[id] = { ...clone(module.defaultConfig), enabled: true };
  const moduleSettings = { get(_account, id) { state.lookups++; return { config: clone(state.moduleConfigs[id]), source: 'synthetic' }; } };
  const history = { unresolved: () => false, list: () => [], put() { state.historyWrites++; throw new Error('Execution history must not be written by read/plan/authorize tests'); } };
  const service = createOperationService({ protocol, modules, moduleSettings, history, getConfig: () => clone(state.config), clock: () => Date.parse('2026-11-11T00:00:00Z'),
    loadRules: () => { state.lookups++; return { config: clone(state.rules) }; }, loadProduction: () => { state.lookups++; return { config: clone(state.productionPolicy) }; } });
  return { state, session, modules, stage, service, reads, writes, options: (id, mode = 'Manual', parameters = {}) => ({ config: clone(state.config), moduleConfig: clone(state.moduleConfigs[id]), rules: clone(state.rules), productionPolicy: clone(state.productionPolicy), mode, parameters, mapAsset: clone(state.mapAsset) }) };
}
const expectedTypes = { formation: 'SAVE', orders: 'SUBMIT', city: 'build', production: 'startProduce', stage: 'RUN_MAINLINE' };
async function makePlan(f, id, { mode = 'Manual', parameters = id === 'formation' ? { presetId: 2 } : id === 'stage' ? stageParameters() : {} } = {}) {
  const read = await f.service.surveyModule(f.session,id,parameters);
  const candidate = read.view.candidates.find(row => row.actionType === expectedTypes[id] && row.executable);
  assert.ok(candidate, 'actual adapter produced executable synthetic candidate ' + id);
  const plan = await f.service.plan(f.session,{ module: id, mode, selections: [candidate.actionId], parameters });
  assert.equal(plan.module,id); assert.equal(plan.actions.length,1); assert.equal(plan.actions[0].action,undefined);
  return plan;
}
const approve = (f, plan) => f.service.authorize(f.session,{ batchId: plan.batchId, planHash: plan.planHash, approvedActionIds: plan.actions.map(row => row.actionId), resourceBudget: plan.resourceBudget, confirm: true });
function noExecution(f) { assert.equal(f.writes.length,0); assert.equal(f.state.runnerPreparations,0); assert.equal(f.state.historyWrites,0); assert.equal(f.session.busy,null); }

test('static adapters and dynamic Stage register as contract-backed Functions', () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.modules),allIds);
  for (const [id,module] of Object.entries(f.modules)) {
    assert.equal(module.contractVersion,1); assert.ok(Object.isFrozen(module));
    assert.equal(validateFunctionContract(id,module),FUNCTION_CONTRACTS[id]);
    const raw = id === 'stage' ? f.stage : rawModules[id];
    for (const method of ['survey','view','plan','verify','validateParameters']) assert.equal(module[method],raw[method]);
    if (id === 'stage' || ['orders','city','production'].includes(id)) assert.equal(module.execute,raw.execute);
    assert.equal(typeof module.dependencyVersions,'function');
  }
  assert.throws(() => validateFunctionContract('naval',f.modules.naval,{ requireExecutable: true }),{ code: 'INVALID_FUNCTION_CONTRACT' }); noExecution(f);
});
test('registry rejects missing real hooks and unknown module identities', () => {
  for (const method of ['survey','view','plan','verify','validateParameters']) {
    const malformed = { ...formationModule }; delete malformed[method]; assert.throws(() => registerBusinessFunction(malformed),{ code: 'INVALID_FUNCTION_CONTRACT' });
  }
  const noExecutor = { ...CORE_OPERATION_MODULES.production }; delete noExecutor.execute;
  assert.throws(() => registerBusinessFunction(noExecutor),{ code: 'INVALID_FUNCTION_CONTRACT' });
  assert.throws(() => registerBusinessFunction({ ...formationModule, id: 'untrusted' }),{ code: 'INVALID_FUNCTION_CONTRACT' });
});
test('registry and Service expose exact detached C/P/S, schema, permission and evidence metadata', () => {
  const f = fixture(), listed = listBusinessFunctions(f.modules); assert.equal(listed.length,allIds.length);
  for (const entry of listed) {
    assert.deepEqual(entry.metadata,describeFunctionContract(entry.id)); assert.deepEqual(entry.capabilities,FUNCTION_CONTRACTS[entry.id].inventoryRequirementIds??FUNCTION_CONTRACTS[entry.id].requirementIds.C);
    const throughService = f.service.moduleView(f.session.id,entry.id).functions.find(row => row.id === entry.id);
    assert.deepEqual(throughService.metadata,entry.metadata); assert.equal(entry.metadata.permissions.arbitraryRequest,false);
    entry.metadata.permissions.premium = true; entry.metadata.requirementIds.C.push('C999'); entry.defaultConfig.enabled = true;
    assert.equal(listBusinessFunctions(f.modules).find(row => row.id === entry.id).metadata.permissions.premium,false);
    assert.equal(f.modules[entry.id].defaultConfig.enabled,false);
  }
  assert.deepEqual(listed.find(row => row.id === 'treasure').metadata.requirementIds.P,[]); noExecution(f);
});
for (const id of allIds) test(id + ' rejects unknown transport controls in survey and plan before all state reads', async () => {
  const f = fixture();
  for (const parameters of [{ request: 'BuyRubyRequest' },{ body: {} },{ authorization: 'injected' },{ unknown: 1 }]) {
    await assert.rejects(f.service.surveyModule(f.session,id,parameters),{ code: 'INVALID_PARAMETERS' });
    await assert.rejects(f.service.plan(f.session,{ module: id, mode: 'Manual', selections: ['irrelevant'], parameters }),{ code: 'INVALID_PARAMETERS' });
  }
  assert.equal(f.reads.length,0); assert.equal(f.state.lookups,0); noExecution(f);
});
test('real domain validators reject semantically invalid fields before survey reads and locks', async () => {
  const invalid = { formation: { presetId: -1 }, alliance: { techId: 1 }, museum: { keywordType: 4 }, fleet: { cityId: 0 }, treasure: { uid: 0 }, 'badge-growth': {uid:'01'}, naval: { minimumPower: '10', maximumPower: '2' }, stage: { config: { enabled: true, retryDelaySeconds: 0, maxAttempts: null, maxStage: null } } };
  for (const [id,parameters] of Object.entries(invalid)) {
    const f = fixture(); await assert.rejects(f.service.surveyModule(f.session,id,parameters));
    await assert.rejects(f.service.plan(f.session,{ module: id, mode: 'Manual', selections: ['irrelevant'], parameters }));
    assert.equal(f.reads.length,0); assert.equal(f.state.lookups,0); noExecution(f);
  }
});
test('all actual dependency hooks ignore unrelated tables and bind every declared relevant table', () => {
  const f = fixture();
  for (const id of allIds) {
    const module = f.modules[id], base = f.options(id), before = module.dependencyVersions(base), unrelated = clone(base);
    unrelated.config.tables.UnrelatedCfg.data[0].value++; unrelated.config.rootRevision = 999;
    assert.deepEqual(module.dependencyVersions(unrelated),before,id + ' ignores unrelated config');
    for (const name of tablesByModule[id]) { const changed = clone(base); changed.config.tables[name].revision = 2; assert.notDeepEqual(module.dependencyVersions(changed),before,id + ' binds ' + name); }
    const changedModule = clone(base); changedModule.moduleConfig.enabled = false; assert.notDeepEqual(module.dependencyVersions(changedModule),before,id + ' binds account module settings');
    const changedRules = clone(base); changedRules.rules.enabled = false;
    if (id === 'orders') assert.notDeepEqual(module.dependencyVersions(changedRules),before); else assert.deepEqual(module.dependencyVersions(changedRules),before,id + ' ignores orders rules');
    const changedPolicy = clone(base); changedPolicy.productionPolicy.maxOperations++;
    assert.deepEqual(module.dependencyVersions(changedPolicy),before,id + ' Manual does not depend on automatic production policy');
  }
  noExecution(f);
});
test('actual conditional dependencies bind only Automatic production policy and requested Stage formation', () => {
  const f = fixture(), production = f.modules.production, automatic = f.options('production','Automatic'), policyChanged = clone(automatic);
  policyChanged.productionPolicy.maxOperations++;
  assert.notDeepEqual(production.dependencyVersions(policyChanged),production.dependencyVersions(automatic));
  const stage = f.modules.stage, formationOff = f.options('stage','Manual',stageParameters(false)), formationOn = f.options('stage','Manual',stageParameters(true));
  for (const name of ['FormationTypePositionCfg','FormationHeroNumCfg','HeroCfg']) {
    const offChanged = clone(formationOff); offChanged.config.tables[name].revision = 2;
    assert.deepEqual(stage.dependencyVersions(offChanged),stage.dependencyVersions(formationOff));
    const onChanged = clone(formationOn); onChanged.config.tables[name].revision = 2;
    assert.notDeepEqual(stage.dependencyVersions(onChanged),stage.dependencyVersions(formationOn));
  }
  noExecution(f);
});
for (const id of Object.keys(expectedTypes)) test(id + ' actual survey → plan → authorize ignores unrelated table changes', async () => {
  const f = fixture(), plan = await makePlan(f,id), reads = f.reads.length;
  f.state.config.tables.UnrelatedCfg.data[0].value++; f.state.config.unrelatedRoot = 'changed';
  assert.ok(approve(f,plan).permitId); assert.equal(f.reads.length,reads); noExecution(f);
});
for (const id of ['formation','city','production','stage']) test(id + ' actual Service plan ignores unrelated order rules and policy', async () => {
  const f = fixture(), plan = await makePlan(f,id), reads = f.reads.length;
  f.state.rules.enabled = false; f.state.productionPolicy.maxOperations++;
  assert.ok(approve(f,plan).permitId); assert.equal(f.reads.length,reads); noExecution(f);
});
for (const [id,change] of [
  ['formation', state => { state.config.tables.HeroCfg.data[0].career = '法师'; }],
  ['orders', state => { state.rules.enabled = false; }],
  ['orders', state => { state.config.tables.WorkerOrderCfg.data[0].reward[0][1]++; }],
  ['city', state => { state.config.tables.BuildingUpgradeCfg.data[0].consume[0][1]++; }],
  ['production', state => { state.config.tables.BuildingProduceCfg.data[0].costItem[0][1]++; }],
  ['stage', state => { state.moduleConfigs.stage.enabled = false; }],
]) test(id + ' related dependency change invalidates displayed plan before authorization and any additional read', async () => {
  const f = fixture(), plan = await makePlan(f,id), reads = f.reads.length; change(f.state);
  assert.throws(() => approve(f,plan),{ code: 'STALE_PLAN' }); assert.equal(f.reads.length,reads); noExecution(f);
});
test('Automatic production policy change invalidates actual Service plan while Manual stays valid', async () => {
  for (const mode of ['Manual','Automatic']) {
    const f = fixture(), plan = await makePlan(f,'production',{ mode }); f.state.productionPolicy.maxOperations++;
    if (mode === 'Automatic') assert.throws(() => approve(f,plan),{ code: 'STALE_PLAN' }); else assert.ok(approve(f,plan).permitId);
    noExecution(f);
  }
});
test('Stage formation dependency is enforced by actual Service only when that finite run requests formation', async () => {
  for (const enabled of [false,true]) {
    const f = fixture(), plan = await makePlan(f,'stage',{ parameters: stageParameters(enabled) }); f.state.config.tables.HeroCfg.data[0].career = '法师';
    if (enabled) assert.throws(() => approve(f,plan),{ code: 'STALE_PLAN' }); else assert.ok(approve(f,plan).permitId);
    noExecution(f);
  }
});
test('related dependency change after permit blocks execute before history, dispatch or Runner preparation', async () => {
  const f = fixture(), plan = await makePlan(f,'formation'), permit = approve(f,plan), reads = f.reads.length;
  f.state.config.tables.FormationTypePositionCfg.data[0].position[0]++;
  assert.throws(() => f.service.execute(f.session,permit),{ code: 'STALE_PLAN' }); assert.equal(f.reads.length,reads); noExecution(f);
});

for (const [scope, change] of [
  ['player', session => { session.player.playerId = '2'; }],
  ['world', session => { session.player.worldId = '2'; }],
  ['connection', session => { session.connectionId = 'replacement-connection'; }],
]) test(scope + ' identity change invalidates actual Service plan and permit without reads or execution', async () => {
  for (const afterPermit of [false,true]) {
    const f = fixture(), plan = await makePlan(f,'formation'), permit = afterPermit ? approve(f,plan) : null, reads = f.reads.length;
    change(f.session);
    if (afterPermit) assert.throws(() => f.service.execute(f.session,permit),{ code: 'STALE_PLAN' });
    else assert.throws(() => approve(f,plan),{ code: 'STALE_PLAN' });
    assert.equal(f.reads.length,reads); noExecution(f);
  }
});
test('equivalent same-account identity objects and unrelated player display changes preserve authorization', async () => {
  const f = fixture(), plan = await makePlan(f,'formation');
  f.session.player = { ...clone(f.session.player), nickname: 'changed display only' };
  assert.ok(approve(f,plan).permitId); noExecution(f);
});

test('equipment LEVEL and explicit REFINE bind their own exact configuration tables without unrelated invalidation',()=>{
 const f=fixture(),module=f.modules['equipment-growth'],level=f.options('equipment-growth'),refine=clone(level);refine.parameters={action:'refine'};level.config.tables.EquipRefineCfg={revision:1,data:[{level:1,costItem1:90500,costItem2:100}]};refine.config.tables.EquipRefineCfg=clone(level.config.tables.EquipRefineCfg);
 const lv=module.dependencyVersions(level),rf=module.dependencyVersions(refine);assert.ok(Object.hasOwn(lv,'config.EquipUpDecomposeCfg'));assert.equal(Object.hasOwn(lv,'config.EquipRefineCfg'),false);assert.ok(Object.hasOwn(rf,'config.EquipRefineCfg'));assert.equal(Object.hasOwn(rf,'config.EquipUpDecomposeCfg'),false);
 const changedLevel=clone(refine);changedLevel.config.tables.EquipUpDecomposeCfg.revision=42;assert.deepEqual(module.dependencyVersions(changedLevel),rf);const changedRefine=clone(level);changedRefine.config.tables.EquipRefineCfg.revision=42;assert.deepEqual(module.dependencyVersions(changedRefine),lv);
 for(const name of ['EquipCfg','EquipAttrCfg','EquipRefineCfg']){const changed=clone(refine);changed.config.tables[name].revision=99;assert.notDeepEqual(module.dependencyVersions(changed),rf);}noExecution(f);
});

test('equipment declared fallback matches custom dependencies for omitted LEVEL and explicit REFINE',()=>{
 const f=fixture(),raw={...equipmentGrowthModule};delete raw.dependencyVersions;const declared=registerBusinessFunction(raw);
 for(const parameters of [{},{heroId:'h',uid:'1'},{action:'refine'},{heroId:'h',uid:'1',action:'refine'}]){const options={...f.options('equipment-growth'),parameters};options.config.tables.EquipRefineCfg={revision:1,data:[{level:1,costItem1:90500,costItem2:100}]};assert.deepEqual(declared.dependencyVersions(options),equipmentGrowthModule.dependencyVersions(options));}noExecution(f);
});

test('explicit exclusive LEVEL dependency contract matches adapter and declared fallback without changing basic growth tables',()=>{
 const f=fixture(),base=f.options('heroes'),options=clone(base);options.parameters={heroId:'h',action:'exclusive-level'};for(const name of ['ExclusiveUpgradeCfg','ExclusiveStarCfg','ExclusiveShowCfg','ExclusiveWeaponCfg','ItemCfg'])options.config.tables[name]={revision:1,data:[{fixture:true}]};const raw={...heroModule};delete raw.dependencyVersions;const fallback=registerBusinessFunction(raw),actual=f.modules.heroes.dependencyVersions(options);assert.deepEqual(fallback.dependencyVersions(options),actual);for(const name of ['HeroCfg','ExclusiveUpgradeCfg','ExclusiveStarCfg','ExclusiveShowCfg','ExclusiveWeaponCfg','ItemCfg']){const changed=clone(options);changed.config.tables[name].revision=42;assert.notDeepEqual(f.modules.heroes.dependencyVersions(changed),actual);}for(const name of ['HeroUpgradeCfg','HeroStarCfg','HeroSkillUpCfg']){const changed=clone(options);changed.config.tables[name].revision=42;assert.deepEqual(f.modules.heroes.dependencyVersions(changed),actual);}const basic={...options,parameters:{action:'level'}},before=f.modules.heroes.dependencyVersions(basic),changed=clone(basic);changed.config.tables.ExclusiveUpgradeCfg.revision=99;assert.deepEqual(f.modules.heroes.dependencyVersions(changed),before);noExecution(f);
});

test('exclusive STAR declared and custom dependency versions omit level-only configuration',()=>{
 const f=fixture(),options=clone(f.options('heroes'));options.parameters={heroId:'h',action:'exclusive-star'};
 const bound=['HeroCfg','ExclusiveStarCfg','ExclusiveShowCfg','ExclusiveWeaponCfg','ItemCfg'],unrelated=['ExclusiveUpgradeCfg','HeroUpgradeCfg','HeroStarCfg','HeroSkillUpCfg'];
 for(const name of [...bound,...unrelated])options.config.tables[name]={revision:1,data:[{fixture:true}]};
 const raw={...heroModule};delete raw.dependencyVersions;const expected=f.modules.heroes.dependencyVersions(options);
 assert.deepEqual(registerBusinessFunction(raw).dependencyVersions(options),expected);
 for(const name of bound){const changed=clone(options);changed.config.tables[name].revision++;assert.notDeepEqual(f.modules.heroes.dependencyVersions(changed),expected);}
 for(const name of unrelated){const changed=clone(options);changed.config.tables[name].revision++;assert.deepEqual(f.modules.heroes.dependencyVersions(changed),expected);}
 noExecution(f);
});

test('equipment empty-slot wear binds ModuleOpenCfg and excludes growth-only tables',()=>{
 const f=fixture(),options=clone(f.options('equipment-growth'));options.parameters={heroId:'A',uid:'9007199254740993',action:'put-on'};
 options.config.tables.ModuleOpenCfg={revision:1,data:[{moduleId:'英雄装备',playerLevel:16}]};
 const raw={...equipmentGrowthModule};delete raw.dependencyVersions;const versions=f.modules['equipment-growth'].dependencyVersions(options);
 assert.deepEqual(registerBusinessFunction(raw).dependencyVersions(options),versions);
 assert.deepEqual(Object.keys(versions),['moduleConfig','config.EquipCfg','config.ModuleOpenCfg']);
 const changed=clone(options);changed.config.tables.ModuleOpenCfg.revision++;assert.notDeepEqual(f.modules['equipment-growth'].dependencyVersions(changed),versions);
 const priceChanged=clone(options);priceChanged.config.tables.EquipUpDecomposeCfg.revision++;assert.deepEqual(f.modules['equipment-growth'].dependencyVersions(priceChanged),versions);
 noExecution(f);
});

test('badge empty-slot wear binds the feature gate but does not bind upgrade prices',()=>{
 const f=fixture(),options=clone(f.options('badge-growth'));options.parameters={heroId:'A',uid:'9007199254740993',action:'put-on',pos:1};
 options.config.tables.ModuleOpenCfg={revision:1,data:[{moduleId:'英雄徽章',playerLevel:12}]};
 const raw={...badgeGrowthModule};delete raw.dependencyVersions;const custom=f.modules['badge-growth'].dependencyVersions(options),declared=registerBusinessFunction(raw);
 assert.deepEqual(declared.dependencyVersions(options),custom);assert.deepEqual(Object.keys(custom),['moduleConfig','config.HeroCfg','config.HeroBadgeCfg','config.HeroBadgeUnlockCfg','config.ModuleOpenCfg']);
 const changed=clone(options);changed.config.tables.ModuleOpenCfg.revision++;assert.notDeepEqual(f.modules['badge-growth'].dependencyVersions(changed),custom);
 const priceChanged=clone(options);priceChanged.config.tables.HeroBadgeLevelCfg.revision++;assert.deepEqual(f.modules['badge-growth'].dependencyVersions(priceChanged),custom);
 const level={...options,parameters:{heroId:'A',uid:'9007199254740993'}};assert.deepEqual(declared.dependencyVersions(level),f.modules['badge-growth'].dependencyVersions(level));
 noExecution(f);
});

test('antique modes bind exact price, gate and item tables without invalidating unrelated modes',()=>{
 const f=fixture(),raw={...antiqueGrowthModule};delete raw.dependencyVersions;
 const declared=registerBusinessFunction(raw);
 for(const action of ['activate','star','suit','master','exchange',null]){
  const options=clone(f.options('antique-growth'));options.parameters=action==='master'?{action}:action==='suit'?{action,suitId:1001}:action?{action,antiqueId:'测试藏品',...(action==='exchange'?{num:2}:{})}:{};
  const adapter=f.modules['antique-growth'],versions=adapter.dependencyVersions(options);
  assert.deepEqual(declared.dependencyVersions(options),versions);
  const extra={activate:['AntiqueSuitCfg'],star:['AntiqueStarCfg'],suit:['AntiqueSuitCfg','AntiqueSuitLvCfg','AntiqueMasterLvCfg'],master:['AntiqueMasterLvCfg'],exchange:['AntiqueStarCfg','ItemCfg'],null:['AntiqueSuitCfg','AntiqueStarCfg','AntiqueSuitLvCfg','AntiqueMasterLvCfg','ItemCfg']}[action];
  assert.deepEqual(Object.keys(versions),['moduleConfig','config.ModuleOpenCfg','config.AntiqueBaseCfg',...extra.map(name=>'config.'+name)]);
  for(const name of tablesByModule['antique-growth']){
   const changed=clone(options);changed.config.tables[name].revision=2;
   const bound=Object.hasOwn(versions,'config.'+name);
   if(bound)assert.notDeepEqual(adapter.dependencyVersions(changed),versions,name);
   else assert.deepEqual(adapter.dependencyVersions(changed),versions,name);
  }
  const unrelated=clone(options);unrelated.config.tables.UnrelatedCfg.revision=2;
  assert.deepEqual(adapter.dependencyVersions(unrelated),versions);
 }
 noExecution(f);
});

test('equipment STAR registry declares precisely the adapter star dependencies',()=>{
 const f=fixture(),module=f.modules['equipment-growth'],options=f.options('equipment-growth');options.parameters={action:'star'};options.config.tables.EquipUpStarCfg={revision:1,data:[{star:1,upCosts:[['装备升星石',1],['精铁',100000]]}]};const versions=module.dependencyVersions(options);assert.deepEqual(versions,equipmentGrowthModule.dependencyVersions(options));assert.equal(Object.hasOwn(versions,'config.EquipRefineCfg'),false);assert.equal(Object.hasOwn(versions,'config.EquipUpDecomposeCfg'),false);assert.ok(Object.hasOwn(versions,'config.EquipUpStarCfg'));const unrelated=clone(options);unrelated.config.tables.EquipRefineCfg={revision:9};assert.deepEqual(module.dependencyVersions(unrelated),versions);noExecution(f);
});

test('badge STAR conditional dependencies match the trusted declaration and exclude unrelated LEVEL prices',()=>{
 const f=fixture(),options=clone(f.options('badge-growth'));options.parameters={heroId:'A',uid:'9007199254740993',action:'star'};
 options.config.tables.HeroBadgeStarCfg={revision:1,data:[{star:1,upBadgeNum:1,consume:['GOLD',500000]}]};
 const raw={...badgeGrowthModule};delete raw.dependencyVersions;const custom=f.modules['badge-growth'].dependencyVersions(options),declared=registerBusinessFunction(raw);
 assert.deepEqual(declared.dependencyVersions(options),custom);assert.ok(Object.hasOwn(custom,'config.HeroBadgeStarCfg'));
 assert.equal(Object.hasOwn(custom,'config.HeroBadgeLevelCfg'),false);assert.equal(Object.hasOwn(custom,'config.ModuleOpenCfg'),false);
 const changed=clone(options);changed.config.tables.HeroBadgeStarCfg.revision++;assert.notDeepEqual(f.modules['badge-growth'].dependencyVersions(changed),custom);
 const unrelated=clone(options);unrelated.config.tables.HeroBadgeLevelCfg.revision++;assert.deepEqual(f.modules['badge-growth'].dependencyVersions(unrelated),custom);
});
