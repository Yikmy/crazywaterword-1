import { dailyChecklist } from '../src/daily-checklist.mjs';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_DOMAINS, DATA_CATALOG, exploreSnapshot, activityAllianceOverview } from '../src/data-catalog.mjs';
import { collectState, ENTRY_QUERIES, formatState, summarize } from '../src/game.mjs';

const successful = () => ({ ok: Object.fromEntries(ENTRY_QUERIES.map(({ name }) => [name, {}])), failed: {}, outcomes: Object.fromEntries(ENTRY_QUERIES.map(({ name }) => [name, { status: 'SUCCESS' }])) });

test('one catalog covers exactly 48 existing queries, 12 domains and 48 summary views', () => {
  assert.equal(DATA_DOMAINS.length, 12); assert.equal(new Set(DATA_DOMAINS.map(({ id }) => id)).size, 12);
  assert.equal(DATA_CATALOG.length, 48); assert.equal(new Set(DATA_CATALOG.map(({ request }) => request)).size, 48);
  assert.deepEqual(DATA_CATALOG.map(({ request }) => request), ENTRY_QUERIES.map(({ name }) => name));
  assert.equal(DATA_CATALOG.filter(({ hasParsedView }) => hasParsedView).length, 48);
  assert.equal(DATA_CATALOG.filter(({ hasParsedView }) => !hasParsedView).length, 0);
  for (const entry of DATA_CATALOG) {
    assert.equal(entry.response, entry.request.replace(/Request$/, 'Response'));
    assert.ok(entry.name); assert.equal(entry.domains[0], entry.domain);
    assert.ok(entry.domains.every((id) => DATA_DOMAINS.some((domain) => domain.id === id)));
    assert.equal(entry.parserSource, entry.hasParsedView ? 'src/game.mjs:summarize' : null);
  }
  for (const domain of DATA_DOMAINS) assert.ok(DATA_CATALOG.some(({ domains }) => domains.includes(domain.id)), domain.id);
});

test('related domain filters share existing queries without duplicating the global catalog', () => {
  const byDomain = (id) => exploreSnapshot(null, { domain: id }).entries.map(({ request }) => request);
  for (const domain of ['city', 'resources', 'orders']) assert.ok(byDomain(domain).includes('OnWaterRequest'));
  assert.ok(byDomain('heroes').includes('AllHeroRequest'));
  assert.ok(byDomain('fleets').includes('CargoShipsRequest'));
  assert.ok(byDomain('map').includes('MyResFieldsRequest'));
  assert.ok(byDomain('guild').includes('GuildTechInfoRequest'));
  assert.ok(byDomain('activities').includes('SeasonRankInfoRequest'));
  assert.ok(byDomain('tasks').includes('EmailBoxRequest'));
  assert.ok(byDomain('collections').includes('AllAntiqueRequest'));
  assert.ok(byDomain('recruitment').includes('RecruitInfoRequest'));
  assert.throws(() => exploreSnapshot(null, { domain: 'not-a-domain' }), /未知数据业务域/);
});

test('all 48 parsed views reuse summary fields and retain original responses', () => {
  const state = successful(); const result = exploreSnapshot(state);
  assert.equal(result.entries.length, 48);
  for (const entry of result.entries) {
    assert.equal(entry.status, 'SUCCESS'); assert.deepEqual(entry.raw, {});
    if (!entry.hasParsedView) { assert.equal(entry.parsed, null); continue; }
    const view = summarize({ ok: { [entry.request]: state.ok[entry.request] }, failed: {} });
    for (const field of entry.parsedFields) assert.deepEqual(entry.parsed[field], field.split('.').reduce((item, key) => item?.[key], view) ?? null);
  }
});

test('SUCCESS empty response, FAILED and NOT_EXECUTED keep different meanings without invented zero data', () => {
  const state = { ok: { AllItemRequest: { items: [] } }, failed: { AllHeroRequest: 'denied', BadgesRequest: 'protocol unavailable' }, outcomes: { AllItemRequest: { status: 'SUCCESS', startedAt: 'start', updatedAt: 'end' }, AllHeroRequest: { status: 'FAILED', error: 'denied', updatedAt: 'failed-at' }, BadgesRequest: { status: 'NOT_EXECUTED', error: 'protocol unavailable' } } };
  const byName = new Map(exploreSnapshot(state).entries.map((entry) => [entry.request, entry]));
  assert.deepEqual(byName.get('AllItemRequest').parsed.items, { kinds: 0, total: 0, top: [] });
  assert.equal(byName.get('AllItemRequest').startedAt, 'start'); assert.equal(byName.get('AllItemRequest').updatedAt, 'end');
  for (const name of ['AllHeroRequest', 'BadgesRequest', 'AllPetRequest']) { assert.equal(byName.get(name).raw, null); assert.equal(byName.get(name).parsed, null); }
  assert.equal(byName.get('AllHeroRequest').status, 'FAILED'); assert.equal(byName.get('AllHeroRequest').error, 'denied');
  assert.equal(byName.get('BadgesRequest').status, 'FAILED'); assert.equal(byName.get('BadgesRequest').error, 'protocol unavailable'); assert.equal(byName.get('AllPetRequest').status, 'NOT_EXECUTED');
  const pending=exploreSnapshot({ok:{},failed:{},outcomes:{BadgesRequest:{status:'NOT_EXECUTED',error:'protocol unavailable'}}}).entries.find(row=>row.request==='BadgesRequest');assert.equal(pending.status,'NOT_EXECUTED');assert.equal(pending.raw,null);assert.equal(pending.parsed,null);
  assert.ok(exploreSnapshot(null).entries.every(({ status, parsed, raw }) => status === 'NOT_EXECUTED' && parsed === null && raw === null));
});

test('successful formation and appointment parsing is independent of failed AllHero response', () => {
  const state = { ok: { GetFormationRequest: { formation: { heroPositions: [{ heroId: 'one', pos: { x: 2, y: 3 } }] } }, AppointInfoRequest: { heroes: [{ heroId: 'one', posId: 4 }] } }, failed: { AllHeroRequest: 'timeout' } };
  const entries = exploreSnapshot(state).entries;
  assert.deepEqual(entries.find(({ request }) => request === 'GetFormationRequest').parsed, { 'heroes.formation': [{ heroId: 'one', x: 2, y: 3 }] });
  assert.deepEqual(entries.find(({ request }) => request === 'AppointInfoRequest').parsed, { 'heroes.appointed': [{ heroId: 'one', posId: 4 }] });
});

test('raw prefers the lossless snapshot and labels legacy normalized fallbacks', () => {
  const state = { ok: { AllItemRequest: { items: [], large: 9007199254740992 } }, raw: { AllItemRequest: { items: [], large: '9007199254740993' } }, failed: {} };
  const entry = exploreSnapshot(state).entries.find(({ request }) => request === 'AllItemRequest');
  assert.equal(entry.raw.large, '9007199254740993'); assert.equal(entry.rawSource, 'decoded-exact');
  const old = exploreSnapshot({ ok: state.ok, failed: {} }).entries.find(({ request }) => request === 'AllItemRequest');
  assert.equal(old.rawSource, 'legacy-normalized'); assert.deepEqual(old.raw, state.ok.AllItemRequest);
});

test('corrupt success metadata cannot turn a missing response into successful empty parsing', () => {
  const entry = exploreSnapshot({ ok: {}, failed: {}, outcomes: { AllHeroRequest: { status: 'SUCCESS' } } }).entries.find(({ request }) => request === 'AllHeroRequest');
  assert.equal(entry.status, 'FAILED'); assert.equal(entry.raw, null); assert.equal(entry.parsed, null);
});

test('all 28 parsed query links preserve distinct synthetic business values', () => {
  // Expectations are handwritten from the existing business contract, not generated
  // by summarize: a wrong catalog field or cross-query link must fail this test.
  const cases = [
    ['AllItemRequest', { items: [{ itemId: 101, num: 103 }] }, { items: { kinds: 1, total: 103, top: [{ itemId: 101, num: 103 }] }, 'fishing.inventory.owned': null }],
    ['AllResourceRequest', { list: [{ res: 102, amount: 107 }] }, { resources: [{ res: 102, amount: 107, name: undefined }] }],
    ['AllHeroRequest', { heroes: [{ heroId: 'hero-103', level: 11, star: 3, power: 109, skinId: 13 }] }, { 'heroes.count': 1, 'heroes.power': 109, 'heroes.list': [{ heroId: 'hero-103', level: 11, star: 3, power: 109, skinId: 13 }] }],
    ['GetFormationRequest', { formation: { heroPositions: [{ heroId: 'formation-104', pos: { x: 7, y: 8 } }] } }, { 'heroes.formation': [{ heroId: 'formation-104', x: 7, y: 8 }] }],
    ['EmailBoxRequest', { total: 105, email: [{ got: false }, { got: true }] }, { email: { total: 105, unclaimed: 1 } }],
    ['EquipsRequest', { equip: [{ id: 106 }, { id: 107 }] }, { equips: 2 }],
    ['RecruitInfoRequest', { hero: { recruitTimes: 108, nextLuck: 19 } }, { recruit: { hero: { recruitTimes: 108, nextLuck: 19 } } }],
    ['AchievementInfoRequest', { task: [{ id: 1, progress: 2, targetProgress: 2, rewardClaimed: false }, { id: 2, progress: 1, targetProgress: 3, rewardClaimed: false }, { id: 3, progress: 4, targetProgress: 4, rewardClaimed: true }] }, { achievements: { total: 3, done: 2, claimable: 1 } }],
    ['DailyTaskInfoRequest', { dailyTask: [{ id: 1001, progress: 5, targetProgress: 5, rewardClaimed: false }], dailyActivity: 110, weeklyActivity: 210, dailyRewardClaimed: [10], dailyResetTime: 310 }, { daily: { tasks: 1, done: 1, claimable: 1, dailyActivity: 110, weeklyActivity: 210, dailyRewardClaimed: [10], resetTime: 310 } }],
    ['MainTaskInfoRequest', { task: { taskId: 111, progress: 211 } }, { mainTask: { taskId: 111, progress: 211 } }],
    ['GuideInfoRequest', { guide: { step: 112 } }, { guide: { step: 112 } }],
    ['AfkInfoRequest', { afkInfo: { level: 113, afkStartTime: 213, afkFinishTime: 0, rewardedLevel: 110 }, clickGoldInfo: { times: 313 } }, { afk: { level: 113, startTime: 213, finishTime: 0, rewardedLevel: 110, capped: false, pendingLevels: 3 }, clickGold: { times: 313 } }],
    ['MonthCardRequest', { cardItem: [{ type: 114, endTime: 1, gotDailyReward: true }] }, { monthCard: [{ type: 114, active: false, endTime: 1, gotDailyReward: true }] }],
    ['AllAntiqueRequest', { antiques: [{ id: 115 }], masterLv: 215, suits: [{ id: 315 }, { id: 415 }] }, { antiques: { count: 1, masterLv: 215, suits: 2 } }],
    ['OnWaterRequest', { building: [{ buildingId: 116, level: 6, auto: true, buildStartTime: 216, buildFinishTime: 316, factory: { autoProductId: 416, finishedProducts: [{ id: 516 }] }, product: { asset: [{ id: 616 }] } }], autoProduceEndTime: 716, autoProduceForever: true, autoFarming: false, fishingLevel: { level: 8 }, salvageLevel: { level: 9 }, divingLevel: { level: 10 }, orderOfTheDay: { id: 816 } }, { buildings: [{ buildingId: 116, level: 6, auto: true, building: { start: 216, finish: 316 }, factory: { autoProductId: 416, finished: [{ id: 516 }] }, product: [{ id: 616 }] }], water: { autoProduceEndTime: 716, autoProduceForever: true, autoFarming: false, fishingLevel: 8, salvageLevel: 9, divingLevel: 10, orderOfTheDay: { id: 816 } }, 'fishing.level': { level: 8, enhance: null, criticalRate: null, status: 'PARTIAL', reason: 'FISHING_LEVEL_FIELDS_INCOMPLETE' } }],
    ['FishEncyclopediaRequest', { species: [117] }, { fish: { species: [117] }, 'fishing.collection': {
      rewardId: null, collectedIds: null, collectedCount: null, catalogCount: null, totalScore: null,
      claimedScore: null, availableScore: null, nextStage: null, complete: null, status: 'UNKNOWN', reason: 'FISHING_FISH_LIST_UNKNOWN',
    } }],
    ['GameEffectRequest', { effects: [{ id: 16, value: 528 }] }, { 'fishing.inventory.capacity': 528 }],
    ['CargoShipsRequest', { ship: [{ id: 118 }, { id: 218 }, { id: 318 }] }, { cargo: 3 }],
    ['AppointInfoRequest', { heroes: [{ heroId: 'appointed-119', posId: 219 }] }, { 'heroes.appointed': [{ heroId: 'appointed-119', posId: 219 }] }],
    ['AllGuildAbstractionRequest', { guilds: [{ id: 'guild-120', level: 12 }] }, { guild: [{ id: 'guild-120', level: 12 }] }],
    ['MyFleetsRequest', { fleets: [{ id: 121 }, { id: 221 }, { id: 321 }, { id: 421 }] }, { fleets: 4 }],
    ['MyResFieldsRequest', { info: { fields: [{ id: 122 }, { id: 222 }], maxNum: 322 } }, { resFields: { count: 2, max: 322 } }],
    ['WorldBossInfoRequest', { info: { bossId: 123, bestDamage: 223 } }, { worldBoss: { bossId: 123, bestDamage: 223 } }],
    ['AllPetRequest', { pets: [{ id: 124 }, { id: 224 }, { id: 324 }, { id: 424 }, { id: 524 }] }, { pets: 5 }],
    ['SeasonRankInfoRequest', { rank: 125, points: 225 }, { season: { rank: 125, points: 225 } }],
    ['WeekInfoRequest', { activityTime: [{ activityId: 126, time: 226 }] }, { week: [{ activityId: 126, time: 226 }] }],
    ['CounterInfoRequest', { counters: [{ type: 127, num: 227 }] }, { counters: [{ type: 127, num: 227 }] }],
    ['AllPirateRequest', { pirates: [{ id: 128 }], sweepTimes: 228 }, { pirates: { count: 1, sweepTimes: 228 } }],
  ];
  assert.equal(cases.length, 28);
  const ok = Object.fromEntries(cases.map(([request, body]) => [request, body]));
  const entries = new Map(exploreSnapshot({ ok, failed: {} }).entries.map((entry) => [entry.request, entry]));
  for (const [request, , expected] of cases) {
    const entry = entries.get(request);
    assert.equal(entry.status, 'SUCCESS', request);
    assert.equal(entry.parseError, null, request);
    assert.deepEqual(entry.parsed, expected, request);
  }
});


import { BUSINESS_QUERY_CATALOG, ADDITIONAL_READ_QUERIES, validateBusinessQueryParameters } from '../src/data-catalog.mjs';
import { loadProtocol } from '../src/proto.mjs';

test('business metadata registers 15 additional read queries and reuses 25 existing entries without changing the 48 collector', () => {
 const extras=['TrialRaidInfoRequest','ClickGoldInfoRequest','AntiqueAttrSummaryRequest','GuildInfoRequest','GuildMemberRequest','GuildAidListRequest','MyGuildAidRequest','GuildCityInfoRequest','MuseumInfoRequest','WorldInfoRequest','FleetRepairParamRequest','TreasureLootStatsRequest','TreasureLootListRequest','TreasureLootRankRequest','TreasureLootDefenceRequest'];
 assert.equal(BUSINESS_QUERY_CATALOG.length,40);assert.equal(ADDITIONAL_READ_QUERIES.length,15);assert.equal(new Set(BUSINESS_QUERY_CATALOG.map(row=>row.request)).size,40);
 assert.deepEqual(ADDITIONAL_READ_QUERIES.map(row=>row.request),extras);assert.ok(ADDITIONAL_READ_QUERIES.every(row=>!ENTRY_QUERIES.some(query=>query.name===row.request)));
 for(const row of BUSINESS_QUERY_CATALOG){assert.equal(row.readOnly,true);assert.equal(row.metadataOnly,true);assert.equal(row.response,row.request.replace(/Request$/,'Response'));assert.ok(row.consumers.length);assert.equal(row.source.length,row.consumers.length);assert.ok(row.scope.binding.includes('accountId'));assert.ok(row.scope.binding.includes('generation'));assert.equal(row.parameters.arbitraryFields,false);assert.ok(row.notes);assert.ok(DATA_DOMAINS.some(domain=>domain.id===row.domain));
  const base=DATA_CATALOG.find(entry=>entry.request===row.request);assert.equal(row.baseEntry,base??null);assert.equal(row.registration,base?'ENTRY_QUERY_REUSE':'DOMAIN_SURVEY_ONLY');
 }
 assert.equal(BUSINESS_QUERY_CATALOG.filter(row=>row.baseEntry).length,25);assert.equal(DATA_CATALOG.length,48);assert.equal(ENTRY_QUERIES.length,48);assert.equal(exploreSnapshot(null).entries.length,48);
});

test('additional query codecs exist locally and metadata never registers a mutation or entry signal',()=>{
 const protocol=loadProtocol(),forbidden=['SaveFormationRequest','GuildAidHelpRequest','CancelMyGuildAidRequest','GotMyGuildAidRequest','FinishGuildOrderRequest','GotGuildWelfarePackRequest','UpgradeGuildTechRequest','MuseumStartExploreRequest','MuseumCollectRevenueRequest','RepairFleetRequest','FleetSaveFormationRequest','MoveFleetsToCityRequest','FillCargoShipRequest','DrawShipRewardRequest','TreasureLootSendFleetsRequest','ChallengeStageRequest','PirateSweepRequest','RedPointRequest','ExitWorldMapRequest'];
 for(const row of BUSINESS_QUERY_CATALOG){assert.ok(protocol[row.request],row.request);assert.ok(protocol[row.response],row.response);assert.ok(!forbidden.includes(row.request));}
 for(const request of forbidden)assert.throws(()=>validateBusinessQueryParameters(request,{}),{code:'INVALID_QUERY_PARAMETERS'});
});

test('query metadata preserves exact scope limitations and domain parameter constraints',()=>{
 const byName=new Map(BUSINESS_QUERY_CATALOG.map(row=>[row.request,row]));
 assert.deepEqual(byName.get('GetFormationRequest').parameters.fixed,{module:1});assert.deepEqual(byName.get('GuildAidListRequest').parameters.fixed,{type:0});assert.deepEqual(byName.get('MyGuildAidRequest').parameters.fixed,{type:0});
 assert.equal(byName.get('WorldInfoRequest').scope.kind,'CURRENT_RESPONSE_ONLY');assert.equal(byName.get('WorldInfoRequest').scope.completeness,'CURRENT_RESPONSE_ONLY');
 assert.equal(byName.get('TreasureLootListRequest').scope.completeness,'CURRENT_RESPONSE_ONLY');assert.ok(byName.get('TreasureLootRankRequest').scope.binding.includes('uid'));assert.ok(byName.get('FleetRepairParamRequest').scope.binding.includes('buildingId'));
 assert.deepEqual(byName.get('GuildInfoRequest').consumers.map(row=>row.module),['alliance','fleet']);assert.deepEqual(byName.get('WorldInfoRequest').consumers.map(row=>row.module),['fleet','naval']);
 assert.ok(byName.get('OnWaterRequest').notes.includes('formation'));assert.ok(byName.get('MyFleetsRequest').notes.includes('no authority'));
 for(const row of BUSINESS_QUERY_CATALOG){assert.equal(Object.isFrozen(row),true);assert.equal(Object.isFrozen(row.scope.binding),true);assert.equal(Object.isFrozen(row.consumers),true);assert.equal(Object.isFrozen(row.parameters.allowedKeys),true);}
 assert.throws(()=>byName.get('GetFormationRequest').parameters.fixed.module=2,TypeError);
});

test('parameter validator accepts only existing survey body shapes and copies caller objects',()=>{
 const cases=[['TrialRaidInfoRequest',{raidId:1}],['EmailBoxRequest',{pageNo:0}],['EmailBoxRequest',{pageNo:2147483647}],['AntiqueAttrSummaryRequest',{}],['AllItemRequest',{}],['GetFormationRequest',{module:1}],['GuildAidListRequest',{type:0}],['MyGuildAidRequest',{type:0}],['WorldInfoRequest',{screenCenter:{x:-2147483647,y:2147483647}}],['FleetRepairParamRequest',{buildingId:'fleet-A'}],['TreasureLootRankRequest',{uid:1}],['TreasureLootDefenceRequest',{uid:2147483647}]];
 const protocol=loadProtocol();for(const [request,body] of cases){const copy=validateBusinessQueryParameters(request,body);assert.deepEqual(copy,body);assert.notEqual(copy,body);const decoded=protocol[request].decode(protocol[request].encode(copy).finish());for(const key of Object.keys(copy))if(typeof copy[key]!=='object')assert.equal(decoded[key],copy[key]);}
 for(const [request,body] of [['TrialRaidInfoRequest',{}],['TrialRaidInfoRequest',{raidId:2}],['TrialRaidInfoRequest',{raidId:1,sweep:true}],['EmailBoxRequest',{}],['EmailBoxRequest',{pageNo:-1}],['EmailBoxRequest',{pageNo:2147483648}],['EmailBoxRequest',{pageNo:'1'}],['EmailBoxRequest',{pageNo:0,all:true}],['AllItemRequest',{page:1}],['GetFormationRequest',{}],['GetFormationRequest',{module:2}],['GetFormationRequest',{module:1,body:{}}],['GuildAidListRequest',{type:1}],['MyGuildAidRequest',{type:'0'}],['WorldInfoRequest',{}],['WorldInfoRequest',{screenCenter:{x:0}}],['WorldInfoRequest',{screenCenter:{x:0,y:0,z:0}}],['WorldInfoRequest',{screenCenter:{x:1.2,y:0}}],['WorldInfoRequest',{screenCenter:{x:-2147483648,y:0}}],['FleetRepairParamRequest',{buildingId:''}],['FleetRepairParamRequest',{buildingId:1}],['TreasureLootRankRequest',{uid:0}],['TreasureLootDefenceRequest',{uid:2147483648}],['TreasureLootRankRequest',{uid:'7'}],['TreasureLootRankRequest',{uid:7,request:'PayRequest'}],['MissingRequest',{}]])assert.throws(()=>validateBusinessQueryParameters(request,body),{code:'INVALID_QUERY_PARAMETERS'});
 for(const body of [null,[],new Date(),Object.create({module:1}),JSON.parse('{"module":1,"__proto__":{}}')])assert.throws(()=>validateBusinessQueryParameters('GetFormationRequest',body),{code:'INVALID_QUERY_PARAMETERS'});
});

test('all existing domain read surveys consume exactly the registered read queries and parameter restrictions',async()=>{
 const [{surveyFormation},{surveyAlliance},{surveyMuseum},{surveyFleet},{surveyTreasure},{surveyNaval}]=await Promise.all([import('../src/formation.mjs'),import('../src/alliance.mjs'),import('../src/museum.mjs'),import('../src/fleet.mjs'),import('../src/treasure.mjs'),import('../src/naval-rules.mjs')]);
 const {surveyAntiqueGrowth}=await import('../src/antique-growth.mjs');
 const {surveyAntiqueSummary}=await import('../src/antique-summary.mjs');
 const {surveyPirateSweep}=await import('../src/pirate-operations.mjs');
 const {surveyTaskRewards}=await import('../src/task-rewards.mjs');
 const {surveyMail}=await import('../src/mail.mjs');
 const {surveyTrialChallenge}=await import('../src/trial-challenge.mjs');
 const {surveyFreeRecruit}=await import('../src/free-recruit.mjs');
 const {surveyFreeGold}=await import('../src/free-gold.mjs');
 const {surveyAfkLevelRewards}=await import('../src/afk-level-rewards.mjs');
 const calls=[],protocol=Object.fromEntries(BUSINESS_QUERY_CATALOG.flatMap(row=>[[row.request,{}],[row.response,{}]]));
 const rawFleet={buildingId:'synthetic-fleet',state:1,durability:100,maxDura:200,cityId:1,targetCityId:0,treasureLootUid:0,autoFight:{isOn:false,todayTimes:0}};
 const responses={MyFleetsRequest:{fleets:[rawFleet]},AllItemRequest:{items:[]},AllResourceRequest:{list:[]},FleetRepairParamRequest:{unitRepairCost:1,unitRepairTime:1},WorldInfoRequest:{cities:[],fleets:[]}};
 let module=null;const client=Object.assign(new EventEmitter(),{connected:true,factContext:{accountId:'synthetic-A',generation:1,connectionId:'catalog-mail'},gameClock:{read:()=>({status:'TRUSTED',reliable:true,nowMs:100000,earliestMs:100000,latestMs:100000})},async request(request,body,response){calls.push({module,request,body:structuredClone(body),response});return structuredClone(responses[request]??{});},send(){throw Error('Forbidden write');},sendWatch(){throw Error('Forbidden watched write');}});
 const player={playerId:'1',worldId:1000001,mainlineStage:1,level:30};
 for(const [id,survey,options] of [['trial-challenge',surveyTrialChallenge,{}],['free-recruit',surveyFreeRecruit,{}],['free-gold',surveyFreeGold,{}],['afk-level-rewards',surveyAfkLevelRewards,{}],['mail',surveyMail,{parameters:{pageNo:2}}],['task-rewards',surveyTaskRewards,{}],['task-rewards',surveyTaskRewards,{parameters:{kind:'achievement',taskId:1001}}],['task-rewards',surveyTaskRewards,{parameters:{kind:'daily',taskId:1001}}],['pirate-sweep',surveyPirateSweep,{}],['antique-growth',surveyAntiqueGrowth,{}],['antiqueSummary',surveyAntiqueSummary,{}],['formation',surveyFormation,{}],['alliance',surveyAlliance,{}],['museum',surveyMuseum,{}],['fleet',surveyFleet,{moduleConfig:{repair:true,formation:true}}],['treasure',surveyTreasure,{parameters:{uid:7}}],['naval',surveyNaval,{parameters:{screenCenter:{x:10,y:-20}}}]]){module=id;await survey(client,protocol,{config:{tables:{}},player,...options});}
 assert.deepEqual([...new Set(calls.map(call=>call.request))].sort(),BUSINESS_QUERY_CATALOG.map(row=>row.request).sort());
 for(const call of calls){const row=BUSINESS_QUERY_CATALOG.find(entry=>entry.request===call.request);assert.ok(row.consumers.some(use=>use.module===call.module),call.module+':'+call.request);assert.equal(row.response,call.response);assert.deepEqual(validateBusinessQueryParameters(call.request,call.body),call.body);}
 assert.deepEqual(calls.find(call=>call.module==='fleet'&&call.request==='WorldInfoRequest').body,{screenCenter:{x:0,y:0}});assert.deepEqual(calls.find(call=>call.request==='FleetRepairParamRequest').body,{buildingId:'synthetic-fleet'});
});

test('real codec fishing facts reach the unchanged collector, CLI summary and exact Explorer source fields', async () => {
  const protocol = loadProtocol(), sent = [];
  const bodies = {
    FishEncyclopediaRequest: { fishList: [7, 2], rewardId: 1 },
    AllItemRequest: { items: [{ itemId: '鱼', num: '9007199254740993' }] },
    GameEffectRequest: { effects: [{ id: 16, value: 500 }] },
    OnWaterRequest: { fishingLevel: { level: 2, enhance: 0, criticalRate: 0.25 } },
  };
  const config = { tables: {
    FishBaseCfg: { data: [{ fishId: 2, score: 10 }, { fishId: 7, score: 15 }] },
    FishStageCfg: { data: [{ stage: 1, star: 20, reward: [['RUBY', 100]] }, { stage: 2, star: 10, reward: [['加速器', 1]] }] },
  } };
  const client = { async request(name, _body, response) {
    sent.push(name);
    return protocol[response].decode(protocol[response].encode(bodies[name] ?? {}).finish());
  } };
  const snapshot = await collectState(client, protocol), summary = summarize(snapshot, { config });
  assert.deepEqual(sent, ENTRY_QUERIES.map(row => row.name));
  assert.deepEqual(summary.fish.fishList, [7, 2]);
  assert.equal(summary.fishing.inventory.owned, '9007199254740993');
  assert.equal(summary.fishing.inventory.capacity, 500);
  assert.equal(summary.fishing.inventory.full, true);
  assert.equal(summary.fishing.collection.availableScore, 5);
  assert.equal(summary.fishing.collection.nextStage.eligible, false);
  assert.equal(summary.fishing.collection.nextStage.missingScore, 5);
  assert.match(formatState(summary), /钓鱼库存: 鱼 9007199254740993 \/ 500，图鉴可用积分 5/);

  const entries = new Map(exploreSnapshot(snapshot, { domain: 'collections', config }).entries.map(row => [row.request, row]));
  assert.equal(entries.get('AllItemRequest').parsed['fishing.inventory.owned'], '9007199254740993');
  assert.equal(entries.get('AllItemRequest').rawSource, 'decoded-exact');
  assert.equal(entries.get('GameEffectRequest').parsed['fishing.inventory.capacity'], 500);
  assert.equal(entries.get('OnWaterRequest').parsed['fishing.level'].level, 2);
  assert.equal(entries.get('FishEncyclopediaRequest').parsed['fishing.collection'].nextStage.missingScore, 5);
  assert.equal(entries.get('FishEncyclopediaRequest').parsed.fish.rewardId, 1);

  snapshot.outcomes.GameEffectRequest = { status: 'FAILED', error: 'synthetic failure' };
  const failed = summarize(snapshot, { config });
  assert.equal(failed.fishing.inventory.capacity, null);
  assert.equal(failed.fishing.inventory.owned, '9007199254740993');
  assert.equal(failed.fishing.collection.availableScore, 5);
  assert.equal(exploreSnapshot(snapshot, { config }).entries.find(row => row.request === 'GameEffectRequest').parsed, null);
});

const overviewContext={accountId:'synthetic-A',generation:2,connectionId:'synthetic-conn',playerId:'9007199254740993',worldId:'1000001'},overviewTime='2026-11-15T08:00:00.000Z';
function activityOverviewState(){
 const raw={AllGuildAbstractionRequest:{guilds:[{id:'9007199254740995',level:0}]},WeekInfoRequest:{activityTime:[{type:0,period:0,startTime:100,endTime:200}]},DailyTaskInfoRequest:{dailyTask:[],dailyActivity:0,weeklyActivity:0,dailyRewardClaimed:[],weeklyRewardClaimed:[],dailyResetTime:100}};
 return {ok:structuredClone(raw),raw:structuredClone(raw),failed:{},outcomes:Object.fromEntries(Object.keys(raw).map(name=>[name,{status:'SUCCESS',updatedAt:overviewTime}]))};
}
function activityOverview(state=activityOverviewState(),options={}){return activityAllianceOverview(state,{context:overviewContext,observedContext:overviewContext,updatedAt:overviewTime,...options});}
test('activity alliance overview composes original cache projections with precise observed guild and raw activity windows',()=>{
 const state=activityOverviewState(),before=structuredClone(state),result=activityOverview(state);
 assert.equal(result.status,'OBSERVED');assert.equal(result.readOnly,true);assert.equal(result.executable,false);assert.equal(result.complete,false);assert.equal(result.coverage,'CURRENT_CACHE_ONLY');assert.equal(result.alliance.membershipKnown,false);assert.equal(result.alliance.rows[0].id,'9007199254740995');assert.equal(result.alliance.rows[0].level,0);assert.equal(result.weekly.rows[0].period,0);assert.equal(result.checklist.tasks.counts.total,0);assert.equal(result.checklist.activity.daily.activity,0);assert.deepEqual(state,before);
 assert.equal(result.sources.filter(row=>row.request==='WeekInfoRequest').length,1);assert.ok(result.sources.some(row=>row.request==='GuildTechInfoRequest'&&row.status==='NOT_COLLECTED'));assert.ok(result.sources.every(row=>!Object.hasOwn(row,'raw')&&!Object.hasOwn(row,'parsed')));assert.ok(result.sources.every(row=>row.status==='AVAILABLE'?row.updatedAt===overviewTime:true));assert.match(result.note,/不代表本人联盟/);
});
for(const key of ['accountId','generation','connectionId','playerId','worldId'])test('activity alliance overview rejects mismatched '+key+' cache without borrowing previous context',()=>{
 const context={...overviewContext,[key]:key==='generation'?3:key==='playerId'?'19':key==='worldId'?'10':'other'},result=activityOverview(undefined,{context});assert.equal(result.status,'UNKNOWN');assert.equal(result.alliance.status,'UNKNOWN');assert.deepEqual(result.alliance.rows,[]);assert.deepEqual(result.weekly.rows,[]);assert.equal(result.checklist.tasks.counts.total,null);assert.ok(result.sources.every(row=>row.status==='CONTEXT_UNKNOWN'));
});
test('activity alliance overview no snapshot identity or incomplete identities cannot imply data presence',()=>{
 for(const options of [{observedContext:null},{context:null},{context:{...overviewContext,playerId:9007199254740992}},{observedContext:{...overviewContext,connectionId:null}}])assert.equal(activityOverview(undefined,options).status,'UNKNOWN');
 const value=activityOverview(null);assert.equal(value.alliance.listObserved,false);assert.equal(value.weekly.listObserved,false);assert.equal(value.checklist.tasks.counts.total,null);
});
for(const failure of ['FAILED','NOT_EXECUTED','missing-body','missing-outcome','missing-raw','failed-conflict'])test('activity alliance overview '+failure+' source stays isolated from independent successful source',()=>{
 const state=activityOverviewState(),name='AllGuildAbstractionRequest';if(failure==='missing-body'){delete state.raw[name];delete state.ok[name];}else if(failure==='missing-raw')delete state.raw[name];else if(failure==='missing-outcome')delete state.outcomes[name];else if(failure==='failed-conflict')state.failed[name]='failed';else state.outcomes[name].status=failure;
 const result=activityOverview(state);assert.equal(result.alliance.listObserved,false);assert.equal(result.weekly.listObserved,true);assert.equal(result.checklist.tasks.counts.total,0);assert.notEqual(result.sources.find(row=>row.request===name).status,'AVAILABLE');
});
test('activity alliance overview stale observations retain original timestamp without granting completeness or membership',()=>{
 const result=activityOverview(undefined,{stale:true});assert.equal(result.status,'STALE');assert.equal(result.updatedAt,overviewTime);assert.equal(result.alliance.rows[0].id,'9007199254740995');assert.equal(result.alliance.membershipKnown,false);assert.ok(result.sources.every(row=>row.stale));assert.equal(result.checklist.festival.eligible,null);
});
test('activity alliance overview original daily reset invalidation only clears daily-dependent fields',()=>{
 const result=activityOverview(undefined,{dailyInvalid:true});assert.equal(result.checklist.sources.daily.status,'UNKNOWN');assert.equal(result.checklist.tasks.counts.total,null);assert.equal(result.checklist.activity.daily.activity,null);assert.equal(result.alliance.listObserved,true);assert.equal(result.weekly.listObserved,true);
});
for(const fault of ['missing-id','unsafe-id','duplicate','missing-level','missing-list','inherited'])test('activity alliance overview '+fault+' guild data never infers membership or defaults missing fields',()=>{
 const state=activityOverviewState(),body=state.raw.AllGuildAbstractionRequest;if(fault==='missing-id')delete body.guilds[0].id;if(fault==='unsafe-id')body.guilds[0].id=9007199254740992;if(fault==='duplicate')body.guilds.push(structuredClone(body.guilds[0]));if(fault==='missing-level')delete body.guilds[0].level;if(fault==='missing-list')delete body.guilds;if(fault==='inherited')body.guilds[0]=Object.create({id:'17',level:2});const result=activityOverview(state);assert.equal(result.alliance.membershipKnown,false);assert.notEqual(result.alliance.status,'OBSERVED');if(fault==='duplicate')assert.ok(result.alliance.rows.every(row=>row.id===null));
});
test('activity alliance overview empty observed lists remain distinct from unavailable sources and expose no raw secrets',()=>{
 const state=activityOverviewState();state.raw.AllGuildAbstractionRequest={guilds:[],token:'synthetic-secret'};state.raw.WeekInfoRequest={activityTime:[]};const result=activityOverview(state);assert.equal(result.alliance.listObserved,true);assert.deepEqual(result.alliance.rows,[]);assert.equal(result.weekly.listObserved,true);assert.deepEqual(result.weekly.rows,[]);assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);delete state.raw.WeekInfoRequest.activityTime;assert.equal(activityOverview(state).weekly.listObserved,false);
});
test('activity alliance overview legacy normalized cache records precision limitation without recovering lost identifiers',()=>{
 const state=activityOverviewState();delete state.raw;delete state.outcomes;state.ok.AllGuildAbstractionRequest.guilds[0].id=9007199254740992;const result=activityOverview(state);assert.equal(result.alliance.rows[0].id,null);assert.ok(result.sources.every(row=>row.precision==='LEGACY_NORMALIZED'));
});

test('activity alliance overview reuses original festival private-context observation without inferring sign eligibility or completeness',()=>{
 const state=activityOverviewState();state.sessionFacts={festivalActivities:{...overviewContext,status:'OBSERVED',reliable:true,readOnly:true,executable:false,source:'SCAllActivity.festivalActivities',scope:'ACCEPTED_STREAM_OBSERVATION_ONLY',complete:false,independentRereadAvailable:false,seq:1,observedAt:overviewTime,activities:[{activityId:'9007199254740995',festival:0,type:'合成活动',season:0,startTime:100,openTime:110,closeTime:190,endTime:200,subActivity:[{subActivityType:11,dailyActive:{checkInId:[0,2],activeScore:0,claimedRewardId:0,checkRuby:'9007199254740993'}}]}]}};
 state.sessionFacts.festivalActivities.activities[0].subActivity.push({subActivityType:28,compassWheel:{score:50,claimedId:1}},{subActivityType:29},{subActivityType:30,evilExpel:{killTotal:10,claimed:5,alive:0}});
 const result=activityOverview(state),festival=result.checklist.festival;assert.deepEqual(festival,dailyChecklist(state,{context:overviewContext}).festival);assert.equal(festival.rows[0].subActivities.rows[1].detail.score,50);assert.equal(festival.rows[0].subActivities.rows[3].detail.alive,0);for(const row of festival.rows[0].subActivities.rows){assert.equal(row.eligible,null);assert.equal(row.executable,false);}assert.equal(festival.status,'OBSERVED');assert.equal(festival.rows[0].activityId,'9007199254740995');assert.deepEqual(festival.rows[0].checkInRecord.checkInId,[0,2]);assert.equal(festival.rows[0].eligible,null);assert.equal(festival.rows[0].executable,false);assert.equal(festival.complete,false);state.sessionFacts.festivalActivities.connectionId='another';assert.equal(activityOverview(state).checklist.festival.status,'UNKNOWN');assert.equal(activityOverview(state).weekly.status,'OBSERVED');
});

test('activity alliance overview source time is unknown when its own outcome omitted time rather than borrowing snapshot collection time',()=>{
 const state=activityOverviewState();delete state.outcomes.AllGuildAbstractionRequest.updatedAt;const result=activityOverview(state);assert.equal(result.updatedAt,overviewTime);assert.equal(result.sources.find(row=>row.request==='AllGuildAbstractionRequest').updatedAt,null);assert.equal(result.sources.find(row=>row.request==='WeekInfoRequest').updatedAt,overviewTime);assert.equal(result.alliance.status,'OBSERVED');
});

test('activity overview uses the original checklist open-rank window projection with cache identity isolation',()=>{
 const state=activityOverviewState();state.sessionFacts={openRankActivity:{...overviewContext,status:'OBSERVED',reliable:true,source:'SCAllActivity.openRankActivity',scope:'ACCEPTED_STREAM_WINDOWS_ONLY',seq:1,observedAt:overviewTime,activityTime:[{type:4,startTime:100,endTime:400}]}};
 const before=structuredClone(state),v=activityOverview(state);assert.equal(v.checklist.openRank.status,'OBSERVED');assert.equal(v.checklist.openRank.rows[0].type,4);assert.equal(v.checklist.openRank.rows[0].eligible,null);assert.equal(v.checklist.openRank.rows[0].executable,false);assert.deepEqual(state,before);
 const changed=activityOverview(state,{context:{...overviewContext,worldId:'2000001'}});assert.equal(changed.checklist.openRank.status,'UNKNOWN');assert.deepEqual(changed.checklist.openRank.rows,[]);
});

function taskSummaryState(){return {ok:{DailyTaskInfoRequest:{dailyTask:[{id:1001,progress:1,targetProgress:1,rewardClaimed:false}]},AchievementInfoRequest:{task:[{id:1,progress:'2',targetProgress:'10',rewardClaimed:false}]}}};}
function assertTaskSummaryMatches(state){
 const summary=summarize(state),view=dailyChecklist(state),a=view.achievements.counts,d=view.tasks.counts;
 assert.deepEqual({total:summary.achievements.total,completed:summary.achievements.done,eligible:summary.achievements.claimable},{total:a.total,completed:a.completed,eligible:a.eligible});
 assert.deepEqual({total:summary.daily.tasks,completed:summary.daily.done,eligible:summary.daily.claimable},{total:d.total,completed:d.completed,eligible:d.eligible});
 for(const value of [summary.daily,summary.achievements])for(const key of ['action','actions','permit','executable','rewards','settlement'])assert.equal(Object.hasOwn(value,key),false);
 return summary;
}
test('task summary uses shared daily and achievement qualification instead of lexicographic progress comparisons',()=>{
 const state=taskSummaryState(),before=structuredClone(state),v=assertTaskSummaryMatches(state);assert.equal(v.achievements.done,0);assert.equal(v.achievements.claimable,0);assert.equal(v.daily.done,1);assert.equal(v.daily.claimable,1);assert.deepEqual(state,before);
 state.ok.AchievementInfoRequest.task[0].progress='10';state.ok.AchievementInfoRequest.task[0].rewardClaimed=true;const claimed=assertTaskSummaryMatches(state);assert.equal(claimed.achievements.done,1);assert.equal(claimed.achievements.claimable,0);
});
for(const [label,mutate]of[
 ['missing daily claim flag',s=>delete s.ok.DailyTaskInfoRequest.dailyTask[0].rewardClaimed],['missing achievement flag',s=>delete s.ok.AchievementInfoRequest.task[0].rewardClaimed],['missing daily identity',s=>delete s.ok.DailyTaskInfoRequest.dailyTask[0].id],['missing achievement identity',s=>delete s.ok.AchievementInfoRequest.task[0].id],
 ['duplicate daily id',s=>s.ok.DailyTaskInfoRequest.dailyTask.push({...s.ok.DailyTaskInfoRequest.dailyTask[0]})],['duplicate achievement id',s=>s.ok.AchievementInfoRequest.task.push({...s.ok.AchievementInfoRequest.task[0]})],['missing daily list',s=>delete s.ok.DailyTaskInfoRequest.dailyTask],['missing achievement list',s=>delete s.ok.AchievementInfoRequest.task],['sparse daily',s=>s.ok.DailyTaskInfoRequest.dailyTask=Array(1)],['sparse achievement',s=>s.ok.AchievementInfoRequest.task=Array(1)],
 ['string daily count',s=>s.ok.DailyTaskInfoRequest.dailyTask[0].progress='1'],['invalid achievement int64',s=>s.ok.AchievementInfoRequest.task[0].progress='1garbage'],['unsafe achievement number',s=>s.ok.AchievementInfoRequest.task[0].progress=9007199254740992],
 ['inherited daily claim',s=>{delete s.ok.DailyTaskInfoRequest.dailyTask[0].rewardClaimed;Object.setPrototypeOf(s.ok.DailyTaskInfoRequest.dailyTask[0],{rewardClaimed:false});}],['inherited achievement progress',s=>{delete s.ok.AchievementInfoRequest.task[0].progress;Object.setPrototypeOf(s.ok.AchievementInfoRequest.task[0],{progress:'20'});}],
 ['daily claim getter',s=>Object.defineProperty(s.ok.DailyTaskInfoRequest.dailyTask[0],'rewardClaimed',{enumerable:true,get(){throw Error('must not read daily getter');}})],['achievement progress getter',s=>Object.defineProperty(s.ok.AchievementInfoRequest.task[0],'progress',{enumerable:true,get(){throw Error('must not read achievement getter');}})]
])test('task summary shares safe unknown handling: '+label,()=>{const state=taskSummaryState();mutate(state);assertTaskSummaryMatches(state);});
test('task summary uses exact collected int64 even when legacy normalized numbers have lost precision',()=>{
 const state=taskSummaryState();state.raw=structuredClone(state.ok);state.outcomes={DailyTaskInfoRequest:{status:'SUCCESS'},AchievementInfoRequest:{status:'SUCCESS'}};state.raw.AchievementInfoRequest.task[0]={id:1,progress:'9007199254740992',targetProgress:'9007199254740993',rewardClaimed:false};state.ok.AchievementInfoRequest.task[0]={id:1,progress:9007199254740992,targetProgress:9007199254740992,rewardClaimed:false};const v=assertTaskSummaryMatches(state);assert.equal(v.achievements.done,0);assert.equal(v.achievements.claimable,0);
 delete state.raw.AchievementInfoRequest;const missing=assertTaskSummaryMatches(state);assert.equal(missing.achievements.total,null);assert.equal(missing.daily.claimable,1);
});
test('task summary known empty lists stay zero and unknown counts render as unknown rather than zero or null',()=>{
 const state=taskSummaryState();state.ok.DailyTaskInfoRequest.dailyTask=[];state.ok.AchievementInfoRequest.task=[];let v=assertTaskSummaryMatches(state);assert.equal(v.daily.tasks,0);assert.equal(v.achievements.total,0);
 delete state.ok.DailyTaskInfoRequest.dailyTask;delete state.ok.AchievementInfoRequest.task;v=assertTaskSummaryMatches(state);assert.equal(v.daily.tasks,null);assert.equal(v.achievements.total,null);const text=formatState(v).split('\n').filter(line=>/^(每日任务|成就):/.test(line)).join('\n');assert.match(text,/每日任务: 未知\/未知/);assert.match(text,/成就: 未知\/未知/);assert.doesNotMatch(text,/null|undefined|个可领奖/);
});

test('task summary local Codec and public JSON preserve explicit flags, int64 comparison and legacy daily fields',async()=>{
 const [{createCodec},{loadProtocol},{toSnapshotJson}]=await Promise.all([import('../src/codec.mjs'),import('../src/proto.mjs'),import('../src/game.mjs')]),codec=createCodec(loadProtocol());
 for(const json of [false,true]){
  const state=taskSummaryState();state.raw={};state.outcomes={};
  for(const name of ['DailyTaskInfoRequest','AchievementInfoRequest']){const body=codec.decode(codec.encode(name.replace(/Request$/,'Response'),1,state.ok[name])).body;state.raw[name]=json?toSnapshotJson(body):body;state.outcomes[name]={status:'SUCCESS'};}
  const v=assertTaskSummaryMatches(state);assert.equal(v.achievements.done,0);assert.equal(v.daily.claimable,1);delete state.raw.DailyTaskInfoRequest.dailyTask[0].rewardClaimed;assert.equal(assertTaskSummaryMatches(state).daily.claimable,null);
 }
});


test('activity overview consumes shared directory metadata and isolates borrowed context without rewriting the snapshot',()=>{
 const state=activityOverviewState();state.sessionFacts={activityDirectory:{...overviewContext,status:'OBSERVED',reliable:true,readOnly:true,executable:false,complete:false,source:'SCAllActivity',scope:'ACCEPTED_STREAM_DIRECTORY_METADATA_ONLY',seq:1,observedAt:overviewTime,fields:{trade:{period:7,startTime:0,endTime:100}}}};
 const before=structuredClone(state),view=activityOverview(state);assert.deepEqual(view.checklist.activityDirectory,dailyChecklist(state,{context:overviewContext}).activityDirectory);assert.equal(view.checklist.activityDirectory.status,'OBSERVED');assert.deepEqual(state,before);
 for(const key of ['accountId','generation','connectionId','playerId','worldId']){const result=activityOverview(state,{context:{...overviewContext,[key]:key==='generation'?99:'other'}});assert.equal(result.checklist.activityDirectory.status,'UNKNOWN');assert.equal(result.checklist.activityDirectory.eligible,null);}
});


test('remaining cached query summaries decode proven protocol fields without granting actions', async () => {
 const {loadProtocol}=await import('../src/proto.mjs'),{toSnapshotJson}=await import('../src/game.mjs'),protocol=loadProtocol();
 const cases=[
  ['BadgesRequest','badges',{badge:[{uid:'9007199254740993',badgeId:'徽章甲',level:0,exp:2,star:1,attr:{attr:3,value:1.5,rating:4}}]},{count:1,list:[{uid:'9007199254740993',badgeId:'徽章甲',level:0,exp:2,star:1,attributes:{attr:3,value:1.5,rating:4}}]}],
  ['DailyGiftPackRequest','dailyGift',{boughtPack:['付费包'],drawnPack:['赠礼'],resetTime:100,heroId:'英雄甲'},{boughtPack:['付费包'],drawnPack:['赠礼'],resetTime:100,heroId:'英雄甲'}],
  ['GuildTechInfoRequest','guildTech',{tech:[{techId:101,level:0}]},{count:1,list:[{techId:101,level:0}]}],
  ['GuildOrderRequest','guildOrder',{order:{requirements:[{type:0,id:'木材',num:7}],nextRefreshTime:101}},{requirements:[{type:0,id:'木材',num:7}],nextRefreshTime:101}],
  ['MyFormationPresetRequest','formationPresets',{ids:[3,8]},{unlockedIds:[3,8]}],
  ['SeasonTaskStageRequest','seasonTaskStage',{stage:0},{stage:0}],
  ['LimitedBossOpenRequest','limitedBoss',{activityStartTs:100,activityEndTs:200,scheduleId:9,rewardInfo:{myTroopsNum:2,myGotRewardLevel:0},bossInfo:{bossId:7,gridIdx:6,todayStartTs:110,todayEndTs:190,leftHp:'9007199254740993',maxHp:'9007199254740995'}},{activityStartTs:100,activityEndTs:200,scheduleId:9,rewardInfo:{myTroopsNum:2,myGotRewardLevel:0},bossInfo:{bossId:7,gridIdx:6,todayStartTs:110,todayEndTs:190,leftHp:'9007199254740993',maxHp:'9007199254740995'}}],
  ['PassStageStateRequest','passStage',{isOver:false,maxOpenStage:0},{isOver:false,maxOpenStage:0}],
  ['WeekOrderInfoRequest','weekOrder',{gotRwdId:[1,2],order:[{type:0,id:'布料',num:3}],isGotFinal:false},{gotRewardIds:[1,2],order:[{type:0,id:'布料',num:3}],isGotFinal:false}],
  ['RadarInfoRequest','radar',{radarInfo:{level:1,exp:2,storedNum:3,nextRefreshTime:150,events:[{uid:'9007199254740993',eventId:4,color:5,gridIdx:6,startTime:100,createTime:90,state:0,reward:{asset:[]}}],fixedEvent:{eventId:7,gridIdx:8,startTime:110,createTime:95,state:1}}},{level:1,exp:2,storedNum:3,nextRefreshTime:150,events:[{uid:'9007199254740993',eventId:4,color:5,gridIdx:6,startTime:100,createTime:90,state:0}],fixedEvent:{eventId:7,gridIdx:8,startTime:110,createTime:95,state:1}}],
  ['EnvSkinListRequest','environmentSkins',{skins:[{objectId:'水厂',skinId:2}]},{count:1,list:[{objectId:'水厂',skinId:2}]}],
  ['ChannelRewardInfoRequest','channelRewards',{rewardInfo:[{rewardId:'渠道甲',received:false}],wxForumCheckTimes:0},{rewards:[{rewardId:'渠道甲',received:false}],wxForumCheckTimes:0}],
  ['LimitTicketRequest','limitTickets',{tickets:[{uid:'9007199254740993',ticketId:'券甲',startTime:100,endTime:200}]},{count:1,list:[{uid:'9007199254740993',ticketId:'券甲',startTime:100,endTime:200}]}],
  ['SeasonCardRequest','seasonCard',{isPaid:false,gotDaily:false,customId:[1,4]},{isPaid:false,gotDaily:false,customIds:[1,4]}],
  ['PlayerFrameRequest','playerFrames',{avatar:[{id:1,isRead:false,endTime:0}]},{count:1,list:[{id:1,isRead:false,endTime:0}]}],
  ['ChurnInfoRequest','churn',{type:0,startTime:100,endTime:200,taskSeason:1,paidMoney:0,task:[{type:'完成订单',num:4,stats:[{level:5,color:6,num:7}]}],gotTaskId:[8],gotPaidGift:[9],paidPack:[{packId:7,times:0}]},{type:0,startTime:100,endTime:200,taskSeason:1,paidMoney:0,tasks:[{type:'完成订单',num:4,stats:[{level:5,color:6,num:7}]}],gotTaskIds:[8],gotPaidGifts:[9],paidPacks:[{packId:7,times:0}]}],
  ['UltraOpenRequest','ultraOpen',{raidId:1,startTime:100,endTime:200},{raidId:1,startTime:100,endTime:200}],
  ['BlackListRequest','blackList',{list:[{playerId:'9007199254740993',nickname:'玩家甲'}]},{count:1,list:[{playerId:'9007199254740993',nickname:'玩家甲'}]}],
  ['ChatRecordRequest','chat',{message:[{timestamp:100,sender:{playerId:'9007199254740993',nickname:'成员甲',guildIdx:1,mark:1,guildTitle:'成员',chatFm:2,title:3},content:{type:0,text:'<script>chat</script>',systemMsgId:'系统甲'}}]},{count:1,list:[{timestamp:100,sender:{playerId:'9007199254740993',nickname:'成员甲',guildIdx:1,mark:1,guildTitle:'成员',chatFm:2,title:3},content:{type:0,text:'<script>chat</script>',systemMsgId:'系统甲'}}]}],
  ['PirateKillRecordRequest','pirateKillRecords',{records:[{type:1,maxKilledLevel:8}]},{count:1,list:[{type:1,maxKilledLevel:8}]}],
 ];
 assert.equal(cases.length,20);
 for(const [request,field,source,expected] of cases){
  const codec=protocol[request.replace(/Request$/,'Response')],raw=toSnapshotJson(codec.decode(codec.encode(source).finish()));
  const state={ok:{[request]:{}},raw:{[request]:raw},failed:{}};const row=exploreSnapshot(state).entries.find(row=>row.request===request);
  assert.deepEqual(row.parsed,{[field]:expected},request);assert.equal(row.readOnly,true);assert.equal(row.executable,false);assert.deepEqual(row.raw,raw);
 }
});

test('remaining cached query summaries preserve missing lists, explicit emptiness and exact-source isolation',()=>{
 const entry=(request,response,extra={})=>exploreSnapshot({ok:{[request]:response},failed:{},...extra}).entries.find(row=>row.request===request);
 assert.deepEqual(entry('BadgesRequest',{}).parsed,{badges:{count:null,list:null}});
 assert.deepEqual(entry('BadgesRequest',{badge:[]}).parsed,{badges:{count:0,list:[]}});
 assert.deepEqual(entry('BadgesRequest',Object.create({badge:[]})).parsed,{badges:{count:null,list:null}});
 assert.deepEqual(entry('BadgesRequest',{get badge(){throw Error('must not invoke getter');}}).parsed,{badges:{count:null,list:null}});
 for(const badge of [[,{uid:1}],Object.assign([],{extra:1})]) assert.equal(entry('BadgesRequest',{badge}).parsed.badges.count,null);
 assert.equal(entry('BlackListRequest',{list:[{playerId:9007199254740992,nickname:'旧缓存'}]}).parsed.blackList.list[0].playerId,null);
 assert.deepEqual(entry('SeasonCardRequest',{}).parsed,{seasonCard:{isPaid:null,gotDaily:null,customIds:null}});
 assert.equal(entry('SeasonCardRequest',{isPaid:true},{failed:{SeasonCardRequest:'invalidated'}}).parsed,null);
 assert.equal(entry('SeasonTaskStageRequest',{stage:9},{outcomes:{SeasonTaskStageRequest:{status:'NOT_EXECUTED'}}}).parsed,null);
 assert.deepEqual(entry('GuildTechInfoRequest',{tech:[{techId:1,level:99}]},{raw:{GuildTechInfoRequest:{tech:[{techId:1,level:0}]}},failed:{GuildOrderRequest:'timeout'}}).parsed,{guildTech:{count:1,list:[{techId:1,level:0}]}});
});
