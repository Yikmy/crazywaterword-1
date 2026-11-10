import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_DOMAINS, DATA_CATALOG, exploreSnapshot } from '../src/data-catalog.mjs';
import { ENTRY_QUERIES, summarize } from '../src/game.mjs';

const successful = () => ({ ok: Object.fromEntries(ENTRY_QUERIES.map(({ name }) => [name, {}])), failed: {}, outcomes: {} });

test('one catalog covers exactly 48 existing queries, 12 domains, 27 summary views and 21 raw-only entries', () => {
  assert.equal(DATA_DOMAINS.length, 12); assert.equal(new Set(DATA_DOMAINS.map(({ id }) => id)).size, 12);
  assert.equal(DATA_CATALOG.length, 48); assert.equal(new Set(DATA_CATALOG.map(({ request }) => request)).size, 48);
  assert.deepEqual(DATA_CATALOG.map(({ request }) => request), ENTRY_QUERIES.map(({ name }) => name));
  assert.equal(DATA_CATALOG.filter(({ hasParsedView }) => hasParsedView).length, 27);
  assert.equal(DATA_CATALOG.filter(({ hasParsedView }) => !hasParsedView).length, 21);
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

test('all 27 parsed views reuse existing summary fields and keep all 21 raw-only responses', () => {
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

test('all 27 parsed query links preserve distinct synthetic business values', () => {
  // Expectations are handwritten from the existing business contract, not generated
  // by summarize: a wrong catalog field or cross-query link must fail this test.
  const cases = [
    ['AllItemRequest', { items: [{ itemId: 101, num: 103 }] }, { items: { kinds: 1, total: 103, top: [{ itemId: 101, num: 103 }] } }],
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
    ['OnWaterRequest', { building: [{ buildingId: 116, level: 6, auto: true, buildStartTime: 216, buildFinishTime: 316, factory: { autoProductId: 416, finishedProducts: [{ id: 516 }] }, product: { asset: [{ id: 616 }] } }], autoProduceEndTime: 716, autoProduceForever: true, autoFarming: false, fishingLevel: { level: 8 }, salvageLevel: { level: 9 }, divingLevel: { level: 10 }, orderOfTheDay: { id: 816 } }, { buildings: [{ buildingId: 116, level: 6, auto: true, building: { start: 216, finish: 316 }, factory: { autoProductId: 416, finished: [{ id: 516 }] }, product: [{ id: 616 }] }], water: { autoProduceEndTime: 716, autoProduceForever: true, autoFarming: false, fishingLevel: 8, salvageLevel: 9, divingLevel: 10, orderOfTheDay: { id: 816 } } }],
    ['FishEncyclopediaRequest', { species: [117] }, { fish: { species: [117] } }],
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
  assert.equal(cases.length, 27);
  const ok = Object.fromEntries(cases.map(([request, body]) => [request, body]));
  const entries = new Map(exploreSnapshot({ ok, failed: {} }).entries.map((entry) => [entry.request, entry]));
  for (const [request, , expected] of cases) {
    const entry = entries.get(request);
    assert.equal(entry.status, 'SUCCESS', request);
    assert.equal(entry.parseError, null, request);
    assert.deepEqual(entry.parsed, expected, request);
  }
});
