import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_DOMAINS, DATA_CATALOG, exploreSnapshot } from '../src/data-catalog.mjs';
import { collectState, ENTRY_QUERIES, formatState, summarize } from '../src/game.mjs';

const successful = () => ({ ok: Object.fromEntries(ENTRY_QUERIES.map(({ name }) => [name, {}])), failed: {}, outcomes: Object.fromEntries(ENTRY_QUERIES.map(({ name }) => [name, { status: 'SUCCESS' }])) });

test('one catalog covers exactly 48 existing queries, 12 domains, 28 summary views and 20 raw-only entries', () => {
  assert.equal(DATA_DOMAINS.length, 12); assert.equal(new Set(DATA_DOMAINS.map(({ id }) => id)).size, 12);
  assert.equal(DATA_CATALOG.length, 48); assert.equal(new Set(DATA_CATALOG.map(({ request }) => request)).size, 48);
  assert.deepEqual(DATA_CATALOG.map(({ request }) => request), ENTRY_QUERIES.map(({ name }) => name));
  assert.equal(DATA_CATALOG.filter(({ hasParsedView }) => hasParsedView).length, 28);
  assert.equal(DATA_CATALOG.filter(({ hasParsedView }) => !hasParsedView).length, 20);
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

test('all 28 parsed views reuse summary fields and keep all 20 raw-only responses', () => {
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
  assert.equal(byName.get('BadgesRequest').status, 'NOT_EXECUTED'); assert.equal(byName.get('AllPetRequest').status, 'NOT_EXECUTED');
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
    ['AchievementInfoRequest', { task: [{ progress: 2, targetProgress: 2, rewardClaimed: false }, { progress: 1, targetProgress: 3, rewardClaimed: false }, { progress: 4, targetProgress: 4, rewardClaimed: true }] }, { achievements: { total: 3, done: 2, claimable: 1 } }],
    ['DailyTaskInfoRequest', { dailyTask: [{ progress: 5, targetProgress: 5, rewardClaimed: false }], dailyActivity: 110, weeklyActivity: 210, dailyRewardClaimed: [10], dailyResetTime: 310 }, { daily: { tasks: 1, done: 1, claimable: 1, dailyActivity: 110, weeklyActivity: 210, dailyRewardClaimed: [10], resetTime: 310 } }],
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

test('business metadata registers 13 additional read queries and reuses 22 existing entries without changing the 48 collector', () => {
 const extras=['AntiqueAttrSummaryRequest','GuildInfoRequest','GuildMemberRequest','GuildAidListRequest','MyGuildAidRequest','GuildCityInfoRequest','MuseumInfoRequest','WorldInfoRequest','FleetRepairParamRequest','TreasureLootStatsRequest','TreasureLootListRequest','TreasureLootRankRequest','TreasureLootDefenceRequest'];
 assert.equal(BUSINESS_QUERY_CATALOG.length,35);assert.equal(ADDITIONAL_READ_QUERIES.length,13);assert.equal(new Set(BUSINESS_QUERY_CATALOG.map(row=>row.request)).size,35);
 assert.deepEqual(ADDITIONAL_READ_QUERIES.map(row=>row.request),extras);assert.ok(ADDITIONAL_READ_QUERIES.every(row=>!ENTRY_QUERIES.some(query=>query.name===row.request)));
 for(const row of BUSINESS_QUERY_CATALOG){assert.equal(row.readOnly,true);assert.equal(row.metadataOnly,true);assert.equal(row.response,row.request.replace(/Request$/,'Response'));assert.ok(row.consumers.length);assert.equal(row.source.length,row.consumers.length);assert.ok(row.scope.binding.includes('accountId'));assert.ok(row.scope.binding.includes('generation'));assert.equal(row.parameters.arbitraryFields,false);assert.ok(row.notes);assert.ok(DATA_DOMAINS.some(domain=>domain.id===row.domain));
  const base=DATA_CATALOG.find(entry=>entry.request===row.request);assert.equal(row.baseEntry,base??null);assert.equal(row.registration,base?'ENTRY_QUERY_REUSE':'DOMAIN_SURVEY_ONLY');
 }
 assert.equal(BUSINESS_QUERY_CATALOG.filter(row=>row.baseEntry).length,22);assert.equal(DATA_CATALOG.length,48);assert.equal(ENTRY_QUERIES.length,48);assert.equal(exploreSnapshot(null).entries.length,48);
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
 const cases=[['EmailBoxRequest',{pageNo:0}],['EmailBoxRequest',{pageNo:2147483647}],['AntiqueAttrSummaryRequest',{}],['AllItemRequest',{}],['GetFormationRequest',{module:1}],['GuildAidListRequest',{type:0}],['MyGuildAidRequest',{type:0}],['WorldInfoRequest',{screenCenter:{x:-2147483647,y:2147483647}}],['FleetRepairParamRequest',{buildingId:'fleet-A'}],['TreasureLootRankRequest',{uid:1}],['TreasureLootDefenceRequest',{uid:2147483647}]];
 const protocol=loadProtocol();for(const [request,body] of cases){const copy=validateBusinessQueryParameters(request,body);assert.deepEqual(copy,body);assert.notEqual(copy,body);const decoded=protocol[request].decode(protocol[request].encode(copy).finish());for(const key of Object.keys(copy))if(typeof copy[key]!=='object')assert.equal(decoded[key],copy[key]);}
 for(const [request,body] of [['EmailBoxRequest',{}],['EmailBoxRequest',{pageNo:-1}],['EmailBoxRequest',{pageNo:2147483648}],['EmailBoxRequest',{pageNo:'1'}],['EmailBoxRequest',{pageNo:0,all:true}],['AllItemRequest',{page:1}],['GetFormationRequest',{}],['GetFormationRequest',{module:2}],['GetFormationRequest',{module:1,body:{}}],['GuildAidListRequest',{type:1}],['MyGuildAidRequest',{type:'0'}],['WorldInfoRequest',{}],['WorldInfoRequest',{screenCenter:{x:0}}],['WorldInfoRequest',{screenCenter:{x:0,y:0,z:0}}],['WorldInfoRequest',{screenCenter:{x:1.2,y:0}}],['WorldInfoRequest',{screenCenter:{x:-2147483648,y:0}}],['FleetRepairParamRequest',{buildingId:''}],['FleetRepairParamRequest',{buildingId:1}],['TreasureLootRankRequest',{uid:0}],['TreasureLootDefenceRequest',{uid:2147483648}],['TreasureLootRankRequest',{uid:'7'}],['TreasureLootRankRequest',{uid:7,request:'PayRequest'}],['MissingRequest',{}]])assert.throws(()=>validateBusinessQueryParameters(request,body),{code:'INVALID_QUERY_PARAMETERS'});
 for(const body of [null,[],new Date(),Object.create({module:1}),JSON.parse('{"module":1,"__proto__":{}}')])assert.throws(()=>validateBusinessQueryParameters('GetFormationRequest',body),{code:'INVALID_QUERY_PARAMETERS'});
});

test('all existing domain read surveys consume exactly the registered read queries and parameter restrictions',async()=>{
 const [{surveyFormation},{surveyAlliance},{surveyMuseum},{surveyFleet},{surveyTreasure},{surveyNaval}]=await Promise.all([import('../src/formation.mjs'),import('../src/alliance.mjs'),import('../src/museum.mjs'),import('../src/fleet.mjs'),import('../src/treasure.mjs'),import('../src/naval-rules.mjs')]);
 const {surveyAntiqueGrowth}=await import('../src/antique-growth.mjs');
 const {surveyAntiqueSummary}=await import('../src/antique-summary.mjs');
 const {surveyPirateSweep}=await import('../src/pirate-operations.mjs');
 const {surveyTaskRewards}=await import('../src/task-rewards.mjs');
 const {surveyMail}=await import('../src/mail.mjs');
 const {surveyAfkLevelRewards}=await import('../src/afk-level-rewards.mjs');
 const calls=[],protocol=Object.fromEntries(BUSINESS_QUERY_CATALOG.flatMap(row=>[[row.request,{}],[row.response,{}]]));
 const rawFleet={buildingId:'synthetic-fleet',state:1,durability:100,maxDura:200,cityId:1,targetCityId:0,treasureLootUid:0,autoFight:{isOn:false,todayTimes:0}};
 const responses={MyFleetsRequest:{fleets:[rawFleet]},AllItemRequest:{items:[]},AllResourceRequest:{list:[]},FleetRepairParamRequest:{unitRepairCost:1,unitRepairTime:1},WorldInfoRequest:{cities:[],fleets:[]}};
 let module=null;const client=Object.assign(new EventEmitter(),{connected:true,factContext:{accountId:'synthetic-A',generation:1,connectionId:'catalog-mail'},gameClock:{read:()=>({status:'TRUSTED',reliable:true,nowMs:100000,earliestMs:100000,latestMs:100000})},async request(request,body,response){calls.push({module,request,body:structuredClone(body),response});return structuredClone(responses[request]??{});},send(){throw Error('Forbidden write');},sendWatch(){throw Error('Forbidden watched write');}});
 const player={playerId:'1',worldId:1000001,mainlineStage:1,level:30};
 for(const [id,survey,options] of [['afk-level-rewards',surveyAfkLevelRewards,{}],['mail',surveyMail,{parameters:{pageNo:2}}],['task-rewards',surveyTaskRewards,{}],['pirate-sweep',surveyPirateSweep,{}],['antique-growth',surveyAntiqueGrowth,{}],['antiqueSummary',surveyAntiqueSummary,{}],['formation',surveyFormation,{}],['alliance',surveyAlliance,{}],['museum',surveyMuseum,{}],['fleet',surveyFleet,{moduleConfig:{repair:true,formation:true}}],['treasure',surveyTreasure,{parameters:{uid:7}}],['naval',surveyNaval,{parameters:{screenCenter:{x:10,y:-20}}}]]){module=id;await survey(client,protocol,{config:{tables:{}},player,...options});}
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
