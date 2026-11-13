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
  'material-packs': contract('material-packs',[],['P2-2'],['src/material-packs.mjs#materialPackModule','src/material-packs.mjs#planMaterialPacks'],{packId:string,itemId:string,num:integer},{
    inventoryRequirementIds:['BIZ-R14'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['EXCHANGE'],blockedCapabilities:[blocked('OTHER_PACKS_OR_AUTO_PRODUCTION','Only owned raw/fort material packs, explicit target and pack count; no purchases or automatic production')]},
    verification:verification('verifyMaterialPack','src/material-packs.mjs#verifyMaterialPack','Independent complete inventory must debit exactly the owned packs, credit the configured selected material and preserve all other balances; season from exact bound worldId'),
    dependencyVersions:dependencies(['moduleConfig','config.ItemCfg','config.SelectPackLibCfg']),
  }),
  pet: contract('pet',[],['P3-6','P3-7'],['src/pet-operations.mjs#petModule','src/pet-operations.mjs#planPet'],{action:{type:'string',enum:['feed']},buildingId:string,jobIdx:integer},{
    inventoryRequirementIds:['BIZ-R08'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['FEED'],blockedCapabilities:[blocked('BREED','Breeding needs a separately recoverable assigned queue and result contract'),blocked('MATURE_CLAIM','GetMaturePet is targetless; no recoverable exact claim identity or automatic claim')]},
    verification:verification('verifyPet','src/pet-operations.mjs#verifyPet','Full OnWater queue identity and AllPet plus exact material debits prove a single configured time reduction or precise transition to mature list; no new owned pet or automatic claim'),
    dependencyVersions:dependencies(['moduleConfig','config.BuildingCfg','config.PetParamCfg','config.PetBaseCfg','config.ItemCfg']),
  }),
  'trial-challenge': contract('trial-challenge',[],['P6-2'],['src/trial-challenge.mjs#trialChallengeModule','src/dailies.mjs#DAILY_DRIVERS'],{},{
    inventoryRequirementIds:['BIZ-D09'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['CHALLENGE'],blockedCapabilities:[blocked('SWEEP_OTHER_RAIDS','Only raid1 next first-clear stage; sweep, buy, ads and other raids need distinct contracts')]},
    verification:verification('verifyTrialChallenge','src/trial-challenge.mjs#verifyTrialChallenge','Exact typed raid/stage/config rewards and independent exact passedStage, unchanged sweep counters/heroes and complete net inventory'),
    dependencyVersions:dependencies(['moduleConfig','config.ModuleOpenCfg','config.TrialRaidCfg','config.TrialRaidStageCfg','config.ItemCfg']),
  }),
  'free-recruit': contract('free-recruit',[],['P6-2'],['src/free-recruit.mjs#freeRecruitModule','src/dailies.mjs#DAILY_DRIVERS'],{},{
    inventoryRequirementIds:['BIZ-D02'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['CLAIM'],blockedCapabilities:[blocked('TICKET_ADVANCED_AND_ANTIQUE','Only one free hero recruit way=1; ticket, bulk, advanced and antique recruit require separate contracts')]},
    verification:verification('verifyFreeRecruit','src/free-recruit.mjs#verifyFreeRecruit','Single typed reward and future cooldown must match independent RecruitInfo, exact new hero ID or fragment net income, complete stock, unchanged other heroes and antique state'),
    dependencyVersions:dependencies(['moduleConfig','config.ModuleOpenCfg','config.HeroCfg','config.ItemCfg']),
  }),
  'free-gold': contract('free-gold',[],['P6-2'],['src/free-gold.mjs#freeGoldModule','src/dailies.mjs#DAILY_DRIVERS'],{},{
    inventoryRequirementIds:['BIZ-D06'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['CLAIM'],blockedCapabilities:[blocked('PAID_OR_BULK','Only one ordinary free click is allowed; never spend RUBY or infer a server day')]},
    verification:verification('verifyFreeGold','src/free-gold.mjs#verifyFreeGold','Single typed gold receipt plus independent complete inventory and freeTimes +1 under the same unexpired server resetTime; all other balances and paid counters unchanged'),
    dependencyVersions:dependencies(['moduleConfig','config.OfflineParamCfg','config.ModuleOpenCfg']),
  }),
  'afk-level-rewards': contract('afk-level-rewards',[],['P6-2'],['src/afk-level-rewards.mjs#afkLevelRewardsModule','src/actions.mjs#ACTIONS'],{level:integer},{
    inventoryRequirementIds:['BIZ-R10'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['CLAIM'],blockedCapabilities:[blocked('PERIOD_INCOME_AND_UPGRADE','Time-dependent income and income-before-upgrade require separate authoritative contracts')]},
    verification:verification('verifyAfkLevelReward','src/afk-level-rewards.mjs#verifyAfkLevelReward','Exact configured next milestone receipt plus independent AFK and complete inventory reads; unchanged level, interval and unrelated stock'),
    dependencyVersions:dependencies(['moduleConfig','config.OfflineLvRewardCfg','config.ItemCfg']),
  }),
  mail: contract('mail',['C511'],['P6-1'],['src/mail.mjs#mailModule','src/mail.mjs#mailPage'],{pageNo:integer,action:{type:'string',enum:['claim','read']},emailId:string},{
    implementation:{mode:'CONTROLLED_WRITE',actions:['CLAIM','READ'],blockedCapabilities:[blocked('BULK_ENUMERATION_AND_INSTANCE_ATTACHMENTS','Complete mailbox enumeration, bulk actions and hero/equipment/antique attachments need distinct contracts')]},
    verification:verification('verifyMailClaim','src/mail.mjs#verifyMailClaim','Exact emailId and immutable attachment, independently read+got with unchanged page peers and complete exact asset net income; READ requires a complete empty attachment and unchanged inventory; a page is never a complete mailbox'),
    dependencyVersions:dependencies(['moduleConfig','config.ItemCfg']),
  }),
  'task-rewards': contract('task-rewards',['C502','C503','C513','C516'],['P6-2'],['src/task-rewards.mjs#taskRewardsModule','src/tasks.mjs#taskTarget','src/daily-task-rewards.mjs#verifyDailyTaskReward'],{kind:{type:'string',enum:['main','branch','achievement','daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift']},taskId:integer,tierId:integer,packId:{type:'string',enum:['赠礼','1000']}},{
    additionalRequirementIds:['BIZ-D18','BIZ-D19'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['CLAIM'],blockedCapabilities:[blocked('DAILY_ORDER','Empty daily-order reward request still requires an exact authorization contract'),blocked('OTHER_WEEKLY_FREE_PACK','Only normal lottery and unique lottery free pack1000 are supported within their exact explicit activity windows and entitlements; other weekly/paid packs require their own evidence'),blocked('WEEKLY_ACTIVITY_REWARD','Weekly claimed indices have no authoritative weekly period marker; a daily marker never authorizes weekly replay')]},
    verification:verification('verifyTaskReward','src/task-rewards.mjs#verifyTaskReward','Independent task and complete inventory reads confirm same main/achievement task explicitly claimed or exact branch removal, unchanged other tasks and exact configured reward net income; main task advancement remains UNKNOWN; daily requires the same unexpired server dailyResetTime, exact typed activity delta, daily/weekly activity increments and configured EXP net income; one explicit daily activity tier requires the same dailyResetTime, season-selected config, exact claimed-index addition and full reward net inventory, with all tasks/activity/weekly state unchanged; daily-gift admits only explicit free pack 赠礼 with season-selected zero-price/zero-fragment/empty guild-pack config and exact RUBY net income, unchanged hero/bought packs/opaque reset marker and exact drawn-pack addition; no day renewal is inferred; weekly-lottery-gift requires explicit pack1000 gotTimes0/charge0, unique zero-price config, trusted matching-Ping bounds within the exact WeekInfo type4/period/startTime/endTime window, exact gotTimes0-to1 and full inventory reward net income, with every other activity/gift/lottery field unchanged; weekly-unique-lottery-gift instead binds type7, WeekUniquePackCfg and explicit gotFree=false, requires no conflicting gift1000 record, and confirms only gotFree false-to-true plus exact inventory net income with all gift/floor/prizePos/selectId/gotFloor/buyTimes state unchanged'),
    dependencyVersions:dependencies(['moduleConfig'],[{when:'parameters.kind=weekly-unique-lottery-gift',keys:['config.WeekUniquePackCfg']},{when:'parameters.kind=weekly-lottery-gift',keys:['config.WeekLotteryPackCfg']},{when:'parameters.kind=daily-gift',keys:['config.DailyChargeGiftPackCfg']},{when:'parameters.kind=daily',keys:['config.DailyTaskCfg']},{when:'parameters.kind=daily-activity',keys:['config.DailyActivityRewardCfg','config.ItemCfg']},...['null','main','branch','achievement'].map(kind=>({when:'parameters.kind='+kind,keys:['config.MainTaskCfg','config.BranchTaskCfg','config.AchievementTaskCfg','config.ItemCfg']}))]),
  }),
  'pirate-sweep': contract('pirate-sweep',['C151'],['P2-8'],['src/pirate-operations.mjs#pirateSweepModule','src/pirate-operations.mjs#planPirateSweep'],{uid:integer,cityId:integer,allowLowerLevel:boolean},{
    implementation:{mode:'CONTROLLED_WRITE',actions:['SWEEP'],blockedCapabilities:[blocked('FIRST_KILL_OR_COMBAT','A higher level requires an independently verified combat contract'),blocked('PAID_OR_BULK_SWEEP','Only one ordinary daily sweep of the exact observed target is admitted')]},
    verification:verification('verifyPirateSweep','src/pirate-operations.mjs#verifyPirateSweep','Fresh same-day quota, one exact increment of used, unchanged target pool and kill records; no assumed reward or target transition'),
    dependencyVersions:dependencies(['moduleConfig','config.PirateParamCfg','config.VipLevelCfg','config.MonthCardCfg']),
  }),
  'antique-growth': contract('antique-growth',[],['P2-7'],['src/antique-growth.mjs#antiqueGrowthModule','src/antique-growth.mjs#planAntiqueGrowth'],{antiqueId:string,action:{type:'string',enum:['activate','star','suit','master','exchange']},suitId:integer,num:integer},{
    inventoryRequirementIds:['PRO-007'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['ACTIVATE','STAR','SUIT','MASTER','EXCHANGE'],blockedCapabilities:[blocked('DIRECT_UNIVERSAL_STAR','Direct universal-fragment star growth requires an independent contract; exchange and star remain separate authorized actions')]},
    verification:verification('verifyAntiqueGrowth','src/antique-growth.mjs#verifyAntiqueGrowth','Independent complete AllAntique/AllItem/AllResource reads confirm exact activation, one star, one suit level, one mastery level or 1:1 exchange, exact owned resource changes and all unrelated state; mastery also requires its explicit typed next-level receipt'),
    dependencyVersions:dependencies(['moduleConfig','config.ModuleOpenCfg','config.AntiqueBaseCfg'],[{when:'parameters.action=activate',keys:['config.AntiqueSuitCfg']},{when:'parameters.action=star',keys:['config.AntiqueStarCfg']},{when:'parameters.action=suit',keys:['config.AntiqueSuitCfg','config.AntiqueSuitLvCfg','config.AntiqueMasterLvCfg']},{when:'parameters.action=master',keys:['config.AntiqueMasterLvCfg']},{when:'parameters.action=exchange',keys:['config.AntiqueStarCfg','config.ItemCfg']},{when:'parameters.action=null',keys:['config.AntiqueSuitCfg','config.AntiqueStarCfg','config.AntiqueSuitLvCfg','config.AntiqueMasterLvCfg','config.ItemCfg']}]),
  }),
  'badge-growth': contract('badge-growth', ['C228'], ['P3-6','P3-7'], ['src/badge-growth.mjs#badgeGrowthModule','src/badge-growth.mjs#planBadgeGrowth'], {heroId:string,uid:string,action:{type:'string',enum:['put-on','star']},pos:integer}, {
    implementation:{mode:'CONTROLLED_WRITE',actions:['LEVEL','PUT-ON','STAR'],additionalRequirementIds:['BIZ-R09'],blockedCapabilities:[blocked('CAP_LANDING','LEVEL uses the exact observed XP deficit and lands below the cap; cap settlement requires separate evidence; STAR preserves observed XP'),blocked('SACRIFICE_OR_REPLACE','Sacrifice and badge replacement require separate contracts; explicit owned-stone RED STAR is implemented')]},
    verification:verification('verifyBadgeGrowth','src/badge-growth.mjs#verifyBadgeGrowth','Full badge pool, hero slots and inventory confirm either one exact level with a typed no-material receipt and EXP/GOLD debits, one RED star with typed no-material receipt, exact owned stone/GOLD debits and unchanged level/XP/slot/non-target state, or one owned idle UID in the exact empty eligible slot with unchanged pool and stock'),
    dependencyVersions:dependencies(['moduleConfig','config.HeroCfg','config.HeroBadgeCfg'],[{when:'parameters.action=null',keys:['config.HeroBadgeAttrCfg','config.HeroBadgeLevelCfg','config.HeroBadgeUnlockCfg']},{when:'parameters.action=put-on',keys:['config.HeroBadgeUnlockCfg','config.ModuleOpenCfg']},{when:'parameters.action=star',keys:['config.HeroBadgeUnlockCfg','config.HeroBadgeAttrCfg','config.HeroBadgeStarCfg']}]),
  }),
  'equipment-growth': contract('equipment-growth', ['C229'], ['P3-6','P3-7'], ['src/equipment-growth.mjs#equipmentGrowthModule','src/equipment-growth.mjs#planEquipmentGrowth'], {heroId:string,uid:string,action:{type:'string',enum:['refine','put-on','star']}}, {
    implementation:{mode:'CONTROLLED_WRITE',actions:['LEVEL','REFINE','PUT-ON','STAR'],additionalRequirementIds:['BIZ-R09'],blockedCapabilities:[blocked('LEVEL_ZERO','Initial zero-level branch is outside the proven positive-cost scope'),blocked('STAR_REPLACE','Replacement still requires a separate contract; explicit RED STAR is implemented')]},
    verification:verification('verifyEquipmentGrowth','src/equipment-growth.mjs#verifyEquipmentGrowth','Full pool and hero mirror confirm same UID LEVEL+1, RED REFINE+1, RED STAR+1 with server-observed target random attrs, or idle UID added to a proven empty matching slot; exact costs and untouched other state; only target hero power/attributes may change'),
    dependencyVersions:dependencies(['moduleConfig','config.EquipCfg'],[{when:'parameters.action=null',keys:['config.EquipAttrCfg','config.EquipUpDecomposeCfg']},{when:'parameters.action=refine',keys:['config.EquipAttrCfg','config.EquipRefineCfg']},{when:'parameters.action=put-on',keys:['config.ModuleOpenCfg']},{when:'parameters.action=star',keys:['config.EquipAttrCfg','config.EquipUpStarCfg']}]),
  }),
  'formation-unlock': contract('formation-unlock', [], ['P3-5'], ['src/formation-unlock.mjs#formationUnlockModule','src/formation-unlock.mjs#planFormationUnlock'], {presetId:integer}, {
    inventoryRequirementIds:['FRM-005'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['UNLOCK'],blockedCapabilities:[blocked('PURCHASE_BLUEPRINT','D6 prohibits buying missing blueprints'),blocked('AUTOMATIC_APPLY','Unlock never applies a saved formation','NOT_IMPLEMENTED')]},
    verification:verification('verifyFormationUnlock','src/formation-unlock.mjs#verifyFormationUnlock','Exact preset set addition, unchanged full formation and exact owned blueprint inventory debit; no typed response exists'),
    dependencyVersions:dependencies(['moduleConfig','config.FormationTypeUnlockCfg','config.ItemCfg','config.FormationTypePositionCfg']),
  }),
  'equipment-forge': contract('equipment-forge', [], ['P3-6','P3-7'], ['src/equipment-forge.mjs#equipmentForgeModule','src/equipment-forge.mjs#planEquipmentForge'], {buildingId:string,action:{type:'string',enum:['make','pick']},makeId:integer,allowUniversal:boolean}, {
    inventoryRequirementIds:['BIZ-R07'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['MAKE','PICK'],blockedCapabilities:[blocked('UNIVERSAL_EXCHANGE','Universal material consumption is not proven'),blocked('IMPLICIT_IDLE_QUEUE','Missing equipMaking does not prove an idle queue'),blocked('QUALITY_FALLBACK','Automatic lower-quality fallback is excluded')]},
    verification:verification('verifyEquipmentForge','src/equipment-forge.mjs#verifyEquipmentForge','Exact original batch, queue, typed pick equipId, one new owned UID and full inventory net change'),
    dependencyVersions:dependencies(['moduleConfig','config.BuildingCfg','config.BuildingEquipMakeCfg','config.EquipMakeLibCfg','config.EquipCfg']),
  }),
  farm: contract('farm', [], ['P2-2'], ['src/farm-operations.mjs#farmModule','src/farm-operations.mjs#planFarmOperations'], {buildingId:string,action:{type:'string',enum:['plant','harvest']},productId:string}, {
    inventoryRequirementIds:['BIZ-R16a','BIZ-R16b','BIZ-R16c'],
    implementation:{mode:'CONTROLLED_WRITE',actions:['PLANT','HARVEST'],blockedCapabilities:[blocked('BATCH_HARVEST','One exact crop batch per request; multi-plot wire settlement is not yet integrated'),blocked('IMPLICIT_EMPTY_PLOT','Missing farm is not proven empty'),blocked('AUTO_FARMING','Server automatic farming is outside a single-plot permit')]},
    verification:verification('verifyFarmOperation','src/farm-operations.mjs#verifyFarmOperation','Fresh exact OnWater crop/empty plot, strict live server seconds, typed harvest quantity and exact full inventory net change'),
    dependencyVersions:dependencies(['moduleConfig','config.BuildingCfg','config.FarmlandPlantCfg']),
  }),
  formation: contract('formation', ['C211', 'C212', 'C213', 'C214', 'C215'], ['P1-3', 'P3-5'], ['src/formation.mjs#formationModule', 'src/formation.mjs#validateFormationParameters'], {...formationParameters,mode:{type:'string',enum:['expedition']},raidId:integer}, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['SAVE','SAVE_EXPEDITION'], preparation: 'C215: authoritative RaidExtremePass module3 + BattleReport source prepares existing mainline SAVE; never auto-authorize', blockedCapabilities: [blocked('OTHER_BATTLE_MODES', 'Mainline and exact active expedition saving are implemented; other battle modes lack evidenced contracts'), blocked('PURCHASE_BLUEPRINT', 'Ordinary owned blueprint unlock uses formation-unlock Adapter; buying missing blueprints remains excluded by D6')] },
    verification: verification('verifyFormation', 'src/formation.mjs#verifyFormation', 'Exact mainline GetFormation or active-raid ExpeditionInfo full-state reread plus typed acknowledgement; unchanged petUid, expedition HP/progress/buffs and inventory; no victory claim'),
    dependencyVersions: dependencies(['moduleConfig', 'config.FormationTypePositionCfg', 'config.FormationHeroNumCfg', 'config.HeroCfg'],[{when:'parameters.mode=expedition',keys:['config.ExpeditionRaidCfg']}]),
  }),
  alliance: contract('alliance', ['C301', 'C302', 'C303', 'C304', 'C305', 'C306', 'C307'], ['P1-5', 'P4-1', 'P4-2', 'P4-3', 'P4-4'], ['src/alliance.mjs#allianceModule', 'src/alliance.mjs#parametersOf', 'src/alliance.mjs#allianceTechView'], {
    memberIds: array(allianceId), itemIds: array(string), reqIds: array(allianceId), cityId: integer, season: integer, techId: integer, targetLevel: integer, itemId: string, num: integer,
  }, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['cancel', 'claimAid', 'finishOrder', 'claimWelfare', 'upgradeTech', 'donateFort'], conditionalActions: [{ actionType: 'help', requires: 'Trusted survey allowance, daily usage, cooldown and reliable game clock; production facts currently unavailable' }],
      blockedCapabilities: [blocked('C303/C304:help', 'Production survey cannot yet establish authoritative daily allowance and usage'), blocked('C305:ask', 'Authoritative cooldown and exact eligible request are unavailable'), blocked('PRO-001:resetTech', 'Fixed v76 GuildTechPop._onBtnReset is empty; ResetGuildTech protocol types do not prove eligibility, cost, refund or final level settlement'), blocked('FORT_BUILD_FINISH_DEMOLISH', 'Only explicit owned ordinary material donation is evidenced; construction and packs remain excluded')] },
    verification: verification('verifyAlliance', 'src/alliance.mjs#verifyAlliance', 'Request identity, membership, counters and inventory; technology exact targetLevel from fresh GuildTechInfo; Fort typed merit and exact same-day full inventory/progress from GuildCityInfo + CityFortInfo'),
    dependencyVersions: dependencies(['moduleConfig', 'config.GuildParamCfg', 'config.GuildOrderNumCfg', 'config.GuildTechCfg', 'config.TechUnlockCfg', 'config.WorldFortCfg', 'config.FortDonateMaterialCfg', 'config.FortParamCfg', 'config.FortSeasonUnlockCfg', 'config.ItemCfg']),
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
  heroes: contract('heroes', ['C221','C222','C223','C224','C225','C226'], ['P3-6','P3-7'], ['src/hero-operations.mjs#heroModule','src/heroes.mjs#planHeroes','src/heroes.mjs#buildHeroAction'], {
    heroId: string, action: { type: 'string', enum: ['level','star','skill','exclusive-level','exclusive-star','fragment-exchange'] }, skillIdx: integer, allowUniversal: boolean, num: integer,
  }, {
    implementation: { mode: 'CONTROLLED_WRITE', actions: ['LEVEL','STAR','SKILL','EXCLUSIVE-LEVEL','EXCLUSIVE-STAR','FRAGMENT-EXCHANGE'], blockedCapabilities: [blocked('EXCLUSIVE_ACTIVATION', 'An active exclusive weapon is required; activation has no authorized contract'), blocked('UNIVERSAL_FRAGMENTS', 'Inline universal consumption during star growth remains blocked; explicit 1:1 fragment-exchange is separately authorized')] },
    verification: verification('verifyHeroOperation','src/hero-operations.mjs#verifyHeroOperation','Fresh AllHero plus exact single target growth and full inventory delta; LEVEL/SKILL and explicit active exclusive actions have no dedicated response; require exactly level+1 or star+1, exact owned cost debits, and unchanged non-target heroes; explicit fragment exchange requires exact 1:1 inventory delta and all heroes unchanged'),
    dependencyVersions: dependencies(['moduleConfig','config.HeroCfg'], [
      { when: 'parameters.action=fragment-exchange', keys: ['config.ItemCfg'] },
      { when: 'parameters.action=exclusive-level', keys: ['config.ExclusiveUpgradeCfg','config.ExclusiveStarCfg','config.ExclusiveShowCfg','config.ExclusiveWeaponCfg','config.ItemCfg'] },
      { when: 'parameters.action=exclusive-star', keys: ['config.ExclusiveStarCfg','config.ExclusiveShowCfg','config.ExclusiveWeaponCfg','config.ItemCfg'] },
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
