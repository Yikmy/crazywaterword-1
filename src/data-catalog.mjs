import { ENTRY_QUERIES, summarize } from './game.mjs';

// One catalog for the Explorer: collection stays in ENTRY_QUERIES and business
// parsing stays in summarize/survey modules. Related domains share a query.
export const DATA_DOMAINS = Object.freeze([
  { id: 'city', label: '城市建设' },
  { id: 'resources', label: '资源与生产' },
  { id: 'orders', label: '居民订单' },
  { id: 'heroes', label: '英雄养成' },
  { id: 'fleets', label: '舰队与航海' },
  { id: 'battle', label: '城战与战斗' },
  { id: 'map', label: '世界地图' },
  { id: 'guild', label: '公会与联盟' },
  { id: 'activities', label: '活动与赛季' },
  { id: 'tasks', label: '日常与成长任务' },
  { id: 'collections', label: '收藏与辅助养成' },
  { id: 'recruitment', label: '招募与商店' },
].map(Object.freeze));

// [request, display name, primary domain, existing summary fields, related domains]
const entries = [
  ['AllItemRequest', '库存道具', 'resources', ['items', 'fishing.inventory.owned'], ['collections']],
  ['AllResourceRequest', '玩家资源', 'resources', ['resources']],
  ['AllHeroRequest', '英雄', 'heroes', ['heroes.count', 'heroes.power', 'heroes.list']],
  ['GetFormationRequest', '英雄阵型', 'heroes', ['heroes.formation']],
  ['EmailBoxRequest', '邮件', 'tasks', ['email']],
  ['EquipsRequest', '装备', 'heroes', ['equips'], ['collections']],
  ['BadgesRequest', '徽章', 'heroes', [], ['collections']],
  ['RecruitInfoRequest', '招募信息', 'recruitment', ['recruit']],
  ['AchievementInfoRequest', '成就', 'tasks', ['achievements']],
  ['DailyTaskInfoRequest', '每日任务与活跃度', 'tasks', ['daily']],
  ['DailyGiftPackRequest', '每日赠礼', 'tasks', [], ['recruitment']],
  ['MainTaskInfoRequest', '主线与支线任务', 'tasks', ['mainTask']],
  ['GuideInfoRequest', '新手引导', 'tasks', ['guide']],
  ['AfkInfoRequest', '挂机收益与点金摘要', 'tasks', ['afk', 'clickGold'], ['resources']],
  ['MonthCardRequest', '月卡', 'recruitment', ['monthCard'], ['activities']],
  ['AllAntiqueRequest', '藏品', 'collections', ['antiques']],
  ['OnWaterRequest', '建筑、生产与居民订单', 'city', ['buildings', 'water', 'fishing.level'], ['resources', 'orders', 'collections']],
  ['FishEncyclopediaRequest', '鱼类图鉴', 'collections', ['fish', 'fishing.collection']],
  ['CargoShipsRequest', '货船', 'fleets', ['cargo']],
  ['AppointInfoRequest', '英雄任命', 'heroes', ['heroes.appointed']],
  ['ChatRecordRequest', '聊天记录', 'guild', []],
  ['GameEffectRequest', '游戏效果', 'collections', ['fishing.inventory.capacity']],
  ['AllGuildAbstractionRequest', '公会摘要', 'guild', ['guild']],
  ['MyFleetsRequest', '我的舰队', 'fleets', ['fleets'], ['map']],
  ['PirateKillRecordRequest', '海盗击杀记录', 'battle', [], ['fleets']],
  ['MyResFieldsRequest', '我的资源田', 'map', ['resFields']],
  ['GuildTechInfoRequest', '公会科技', 'guild', []],
  ['GuildOrderRequest', '公会订单', 'guild', [], ['orders']],
  ['MyFormationPresetRequest', '阵型预设', 'heroes', []],
  ['SeasonTaskStageRequest', '赛季任务阶段', 'activities', [], ['tasks']],
  ['WorldBossInfoRequest', '世界 Boss', 'battle', ['worldBoss'], ['activities']],
  ['LimitedBossOpenRequest', '限时 Boss 开放信息', 'battle', [], ['activities']],
  ['AllPetRequest', '宠物', 'collections', ['pets']],
  ['SeasonRankInfoRequest', '赛季排名信息', 'activities', ['season']],
  ['WeekInfoRequest', '周活动', 'activities', ['week']],
  ['PassStageStateRequest', '关卡状态', 'battle', []],
  ['WeekOrderInfoRequest', '周订单', 'activities', [], ['orders']],
  ['CounterInfoRequest', '日常计数', 'tasks', ['counters']],
  ['RadarInfoRequest', '雷达', 'map', []],
  ['EnvSkinListRequest', '环境皮肤', 'collections', []],
  ['ChannelRewardInfoRequest', '渠道奖励信息', 'activities', []],
  ['LimitTicketRequest', '限时券', 'recruitment', [], ['activities']],
  ['SeasonCardRequest', '赛季卡', 'activities', [], ['recruitment']],
  ['AllPirateRequest', '海盗', 'battle', ['pirates'], ['map']],
  ['PlayerFrameRequest', '玩家头像框', 'collections', []],
  ['ChurnInfoRequest', 'Churn 信息', 'activities', []],
  ['UltraOpenRequest', 'Ultra 开放信息', 'activities', []],
  ['BlackListRequest', '黑名单', 'guild', []],
];

export const DATA_CATALOG = Object.freeze(entries.map(([request, name, domain, parsedFields, related = []]) => Object.freeze({
  request, response: request.replace(/Request$/, 'Response'), name, domain,
  domains: Object.freeze([domain, ...related]),
  parserSource: parsedFields.length ? 'src/game.mjs:summarize' : null,
  hasParsedView: parsedFields.length > 0,
  parsedFields: Object.freeze(parsedFields),
})));

const domainIds = new Set(DATA_DOMAINS.map(({ id }) => id));
const queryNames = new Set(ENTRY_QUERIES.map(({ name }) => name));
if (queryNames.size !== DATA_CATALOG.length || DATA_CATALOG.some(({ request, domains }) => !queryNames.delete(request) || domains.some((id) => !domainIds.has(id)))) {
  throw new Error('数据目录必须完整且唯一映射已有入口查询');
}

function fieldOf(value, field) {
  return field.split('.').reduce((item, key) => item?.[key], value) ?? null;
}

// No connection or Runtime access: callers pass only the selected account's cache.
export function exploreSnapshot(snapshot, { domain = null, config = null, updatedAt = null } = {}) {
  if (domain && !domainIds.has(domain)) {
    const error = new Error('未知数据业务域'); error.statusCode = 400; throw error;
  }
  const state = snapshot ?? { ok: {}, failed: {}, outcomes: {} };
  const ok = state.ok ?? {}, failed = state.failed ?? {}, outcomes = state.outcomes ?? {};
  const selected = DATA_CATALOG.filter((entry) => !domain || entry.domains.includes(domain));
  const result = selected.map((entry) => {
    const outcome = outcomes[entry.request];
    const hasBody = Object.hasOwn(ok, entry.request);
    let status = outcome?.status;
    if (!['SUCCESS', 'FAILED', 'NOT_EXECUTED'].includes(status)) status = Object.hasOwn(failed, entry.request) ? 'FAILED' : hasBody ? 'SUCCESS' : 'NOT_EXECUTED';
    let error = outcome?.error ?? failed[entry.request] ?? null;
    if (status === 'SUCCESS' && !hasBody) { status = 'FAILED'; error ??= '成功状态缺少缓存响应'; }
    if (status === 'NOT_EXECUTED') error ??= snapshot ? '未采集此查询' : '尚未采集';
    let parsed = null, parseError = null;
    if (status === 'SUCCESS' && entry.hasParsedView) {
      try {
        // Isolate each source so failure in an unrelated query cannot erase its view.
        const isolated = { ok: { [entry.request]: ok[entry.request] }, failed: {} };
        if (Object.hasOwn(state, 'raw')) isolated.raw = Object.hasOwn(state.raw ?? {}, entry.request) ? { [entry.request]: state.raw[entry.request] } : {};
        if (Object.hasOwn(state, 'outcomes')) isolated.outcomes = Object.hasOwn(outcomes, entry.request) ? { [entry.request]: outcome } : {};
        const view = summarize(isolated, { config });
        parsed = Object.fromEntries(entry.parsedFields.map((field) => [field, fieldOf(view, field)]));
      } catch {
        parseError = '已有业务解析无法处理本次响应；可查看原始响应';
      }
    }
    return {
      ...entry, status, startedAt: outcome?.startedAt ?? null,
      updatedAt: outcome?.updatedAt ?? (status === 'SUCCESS' ? updatedAt : null), error,
      raw: status === 'SUCCESS' ? (Object.hasOwn(state.raw ?? {}, entry.request) ? state.raw[entry.request] : ok[entry.request]) : null,
      rawSource: status !== 'SUCCESS' ? null : Object.hasOwn(state.raw ?? {}, entry.request) ? 'decoded-exact' : 'legacy-normalized',
      precisionNote: status !== 'SUCCESS' ? null : Object.hasOwn(state.raw ?? {}, entry.request) ? '原始解码响应；超出安全范围的 int64 使用十进制字符串' : '旧快照经过数字归一化；超出安全范围的 int64 精度无法恢复，请手动刷新获取新快照',
      provenance: state.facts?.[entry.request]?.provenance ?? null,
      parsed, parseError,
    };
  });
  return {
    domains: DATA_DOMAINS.map((entry) => ({ ...entry, count: DATA_CATALOG.filter(({ domains }) => domains.includes(entry.id)).length })),
    total: DATA_CATALOG.length, entries: result,
  };
}

// Domain-only read metadata. This does not add queries to ENTRY_QUERIES, start
// collection, grant transport permission, or expand any API write allowlist.
const freezeQueryMetadata = value => {
  if (value && typeof value === 'object') { for (const nested of Object.values(value)) freezeQueryMetadata(nested); Object.freeze(value); }
  return value;
};
const consumer = (module, functionName, source, fields) => ({ module, function: functionName, source, fields });
const uses = {
  'free-recruit': consumer('free-recruit','surveyFreeRecruit','src/free-recruit.mjs:surveyFreeRecruit',['recruit','heroes','city','stock']),
  'free-gold': consumer('free-gold','surveyFreeGold','src/free-gold.mjs:surveyFreeGold',['gold','stock']),
  'afk-level-rewards': consumer('afk-level-rewards','surveyAfkLevelRewards','src/afk-level-rewards.mjs:surveyAfkLevelRewards',['afk','stock']),
  mail: consumer('mail','surveyMail','src/mail.mjs:surveyMail',['page']),
  'task-rewards': consumer('task-rewards','surveyTaskRewards','src/task-rewards.mjs:surveyTaskRewards',['tasks','stock']),
  'pirate-sweep': consumer('pirate-sweep','surveyPirateSweep','src/pirate-operations.mjs:surveyPirateSweep',['pirates','records','quota','stock']),
  'antique-growth': consumer('antique-growth','surveyAntiqueGrowth','src/antique-growth.mjs:surveyAntiqueGrowth',['antiques','suits','masterLv','stock']),
  antiqueSummary: consumer('antiqueSummary','surveyAntiqueSummary','src/antique-summary.mjs:surveyAntiqueSummary',['global','camps','professions','effects']),
  formation: consumer('formation', 'surveyFormation', 'src/formation.mjs:surveyFormation', ['formation', 'presets', 'heroes']),
  alliance: consumer('alliance', 'surveyAlliance', 'src/alliance.mjs:surveyAlliance', ['guild', 'members', 'aids', 'order', 'counters', 'stock', 'technology', 'seasonStage']),
  museum: consumer('museum', 'surveyMuseum', 'src/museum.mjs:surveyMuseum', ['exploreStages', 'exhibitions', 'revenue', 'achievements', 'heroes', 'antiques', 'stock']),
  fleet: consumer('fleet', 'surveyFleet', 'src/fleet.mjs:surveyFleet', ['fleets', 'repairParams', 'cargo', 'worldCities', 'guild', 'formation', 'stock']),
  treasure: consumer('treasure', 'surveyTreasure', 'src/treasure.mjs:surveyTreasure', ['treasure', 'rank', 'defence', 'fleets', 'season', 'stock']),
  naval: consumer('naval', 'surveyNaval', 'src/naval-rules.mjs:surveyNaval', ['worldFleets', 'fleets', 'bossInfo', 'limitedBossOpen', 'stock']),
};
const accountScope = { kind: 'ACCOUNT', binding: ['accountId', 'generation'], completeness: 'CURRENT_TYPED_RESPONSE_ONLY' };
const guildScope = { kind: 'ENTITY', binding: ['accountId', 'generation', 'guildId'], key: 'CURRENT_GUILD', completeness: 'CURRENT_TYPED_RESPONSE_ONLY' };
const emptyParameters = { mode: 'EMPTY', allowedKeys: [], requiredKeys: [], arbitraryFields: false };
const mainlineParameters = { mode: 'FIXED', allowedKeys: ['module'], requiredKeys: ['module'], fixed: { module: 1 }, arbitraryFields: false };
const aidParameters = { mode: 'FIXED', allowedKeys: ['type'], requiredKeys: ['type'], fixed: { type: 0 }, arbitraryFields: false };
const worldParameters = { mode: 'SCREEN_CENTER', allowedKeys: ['screenCenter'], requiredKeys: ['screenCenter'], nestedKeys: { screenCenter: ['x', 'y'] }, integerRange: [-2147483647, 2147483647], arbitraryFields: false,
  policy: 'surveyFleet uses fixed {x:0,y:0}; surveyNaval accepts only explicit integer center or its {x:0,y:0} default' };
const fleetParameters = { mode: 'FLEET_BUILDING_ID', allowedKeys: ['buildingId'], requiredKeys: ['buildingId'], arbitraryFields: false,
  policy: 'Exact buildingId from current reliable MyFleets response; queried sequentially only for immediate repair of an idle damaged fleet' };
const treasureParameters = { mode: 'TREASURE_UID', allowedKeys: ['uid'], requiredKeys: ['uid'], integerRange: [1, 2147483647], arbitraryFields: false,
  policy: 'Exact explicitly selected positive int32 treasure uid, shared by rank and defence reads; never a dispatch request' };
// [request, consumers, result authority, allowed parameter shape, domain, notes]
const businessReads = [
  ['EmailBoxRequest',['mail'],{...accountScope,key:'EXACT_PAGE_NO',completeness:'CURRENT_PAGE_ONLY'},{mode:'PAGE_NO',allowedKeys:['pageNo'],requiredKeys:['pageNo'],integerRange:[0,2147483647],arbitraryFields:false},'tasks','Explicit exact page only; total never proves page count, complete enumeration or snapshot consistency'],
  ['RecruitInfoRequest',['free-recruit'],accountScope,emptyParameters,'recruitment','Explicit current hero cooldown and recruit data; independent receipt matching, no inferred clock or ticket fallback'],
  ['ClickGoldInfoRequest',['free-gold'],accountScope,emptyParameters,'tasks','Explicit ordinary free used count, minGold and server resetTime marker; no inferred game day or paid fallback'],
  ['AfkInfoRequest',['afk-level-rewards'],accountScope,emptyParameters,'tasks','Exact observed AFK level, rewarded milestone and unchanged income interval; no inferred time units'],
  ['AchievementInfoRequest',['task-rewards'],accountScope,emptyParameters,'tasks','Explicit achievement kind and exact ID; complete observed list with signed int64 progress and explicit claim flags'],
  ['MainTaskInfoRequest',['task-rewards'],accountScope,emptyParameters,'tasks','Exact main task claim flag and complete branch membership; missing fields remain unknown'],
  ['MonthCardRequest',['pirate-sweep'],accountScope,emptyParameters,'activities','Complete typed replacement list bound to the current login; a delivery push invalidates the list'],
  ['PirateKillRecordRequest',['pirate-sweep'],accountScope,emptyParameters,'fleets','Complete current kill thresholds for the selected pirate type; absence never grants first-kill eligibility'],
  ['AllPirateRequest',['pirate-sweep'],accountScope,emptyParameters,'map','Current target pool and explicit used count; remaining quota requires a proven same-day observation and live entitlements'],
  ['AntiqueAttrSummaryRequest',['antiqueSummary'],accountScope,emptyParameters,'collections','Explicit typed current-account attribute summary only; no cultivation, exchange or activation'],
  ['GetFormationRequest', ['formation'], { ...accountScope, key: 'MAINLINE_MODULE_1' }, mainlineParameters, 'heroes', 'Complete formation with exact hero positions and optional pet UID; does not prove save success by itself'],
  ['MyFormationPresetRequest', ['formation', 'fleet'], accountScope, emptyParameters, 'heroes', 'Unlocked formation layouts; not saved complete teams'],
  ['AllHeroRequest', ['formation', 'museum', 'fleet', 'free-recruit'], accountScope, emptyParameters, 'heroes', 'Owned hero identities; no growth or recruitment request'],
  ['AllItemRequest', ['alliance', 'museum', 'fleet', 'treasure', 'naval', 'antique-growth', 'pirate-sweep', 'task-rewards', 'afk-level-rewards', 'free-gold', 'free-recruit'], accountScope, emptyParameters, 'resources', 'Exact inventory fields are parsed conservatively by each existing survey'],
  ['AllResourceRequest', ['alliance', 'museum', 'fleet', 'treasure', 'naval', 'antique-growth', 'pirate-sweep', 'task-rewards', 'afk-level-rewards', 'free-gold', 'free-recruit'], accountScope, emptyParameters, 'resources', 'Missing resource fields remain unknown'],
  ['GuildInfoRequest', ['alliance', 'fleet'], guildScope, emptyParameters, 'guild', 'Current guild identity and welfare watermark; fleet derives guild index'],
  ['GuildMemberRequest', ['alliance'], guildScope, emptyParameters, 'guild', 'Current titleList members; absent online flag remains unknown'],
  ['GuildAidListRequest', ['alliance'], guildScope, aidParameters, 'guild', 'Exact request, asker, item and expiry identity; type is fixed zero'],
  ['MyGuildAidRequest', ['alliance'], guildScope, aidParameters, 'guild', 'Own aid request/helper identity; no ask, cancel or claim'],
  ['GuildOrderRequest', ['alliance'], guildScope, emptyParameters, 'guild', 'Current material requirements and nextRefreshTime'],
  ['GuildCityInfoRequest', ['alliance'], guildScope, emptyParameters, 'guild', 'City identities used for exact single-order target selection'],
  ['CounterInfoRequest', ['alliance'], accountScope, emptyParameters, 'tasks', 'Known daily counters only; no invented allowance or cooldown'],
  ['GuildTechInfoRequest', ['alliance'], guildScope, emptyParameters, 'guild', 'Current technology levels require exact reliable parsing'],
  ['SeasonTaskStageRequest', ['alliance'], { ...accountScope, binding: ['accountId', 'generation', 'worldId', 'season'] }, emptyParameters, 'activities', 'Explicit stage presence is mandatory; user season cannot replace current world evidence'],
  ['MuseumInfoRequest', ['museum'], accountScope, emptyParameters, 'collections', 'Explore stages, exhibitions, revenue and claimed achievement markers; no settlement claim'],
  ['AllAntiqueRequest', ['museum','antique-growth'], accountScope, emptyParameters, 'collections', 'Owned antique identities/stars, suits and mastery for display and exact activation/star verification; the query performs no write'],
  ['MyFleetsRequest', ['fleet', 'treasure', 'naval'], accountScope, emptyParameters, 'fleets', 'Fleet states and exact building IDs; no authority over fleet formation payload'],
  ['CargoShipsRequest', ['fleet'], accountScope, emptyParameters, 'fleets', 'Ship and cargo slot state; no fill, claim or acceleration'],
  ['WorldInfoRequest', ['fleet', 'naval'], { kind: 'CURRENT_RESPONSE_ONLY', binding: ['accountId', 'generation', 'screenCenter'], key: 'SCREEN_CENTER', completeness: 'CURRENT_RESPONSE_ONLY' }, worldParameters, 'map', 'Observed cities/fleets in this response only; not a complete world or continuous global target registry'],
  ['FleetRepairParamRequest', ['fleet'], { kind: 'ENTITY', binding: ['accountId', 'generation', 'buildingId'], key: 'EXACT_FLEET_BUILDING_ID', completeness: 'CURRENT_TYPED_RESPONSE_ONLY' }, fleetParameters, 'fleets', 'Unit repair cost/time only; does not start or stop repair'],
  ['OnWaterRequest', ['fleet','free-recruit'], accountScope, emptyParameters, 'city', 'Fleet formation authority for exact building ID; other building state still uses existing parser'],
  ['TreasureLootStatsRequest', ['treasure'], accountScope, emptyParameters, 'activities', 'Current reward counters; no reward or dispatch'],
  ['TreasureLootListRequest', ['treasure'], { kind: 'CURRENT_RESPONSE_ONLY', binding: ['accountId', 'generation', 'worldId'], key: 'TREASURE_LIST', completeness: 'CURRENT_RESPONSE_ONLY' }, emptyParameters, 'map', 'Only current returned treasure targets; not global completeness'],
  ['SeasonRankInfoRequest', ['treasure'], { ...accountScope, binding: ['accountId', 'generation', 'worldId', 'season'] }, emptyParameters, 'activities', 'Explicit startTime/endTime for activity boundary checks with trusted clock'],
  ['TreasureLootRankRequest', ['treasure'], { kind: 'ENTITY', binding: ['accountId', 'generation', 'uid'], key: 'EXACT_TREASURE_UID', completeness: 'CURRENT_TYPED_RESPONSE_ONLY' }, treasureParameters, 'map', 'Exact selected treasure rank observation; not victory evidence'],
  ['TreasureLootDefenceRequest', ['treasure'], { kind: 'ENTITY', binding: ['accountId', 'generation', 'uid'], key: 'EXACT_TREASURE_UID', completeness: 'CURRENT_TYPED_RESPONSE_ONLY' }, treasureParameters, 'map', 'Exact selected treasure defence observation; not a battle result'],
  ['WorldBossInfoRequest', ['naval'], { ...accountScope, completeness: 'OBSERVATION_ONLY' }, emptyParameters, 'battle', 'Existing survey fetches read source; no new complete battle parser or side authorization'],
  ['LimitedBossOpenRequest', ['naval'], { ...accountScope, completeness: 'OBSERVATION_ONLY' }, emptyParameters, 'battle', 'Open-state source only; not a challenge or an authorized combat mode'],
];
const existingReadEntries = new Map(DATA_CATALOG.map(entry => [entry.request, entry]));
export const BUSINESS_QUERY_CATALOG = freezeQueryMetadata(businessReads.map(([request, modules, scope, parameters, domain, notes]) => ({
  request, response: request.replace(/Request$/, 'Response'), readOnly: true, metadataOnly: true,
  registration: existingReadEntries.has(request) ? 'ENTRY_QUERY_REUSE' : 'DOMAIN_SURVEY_ONLY',
  baseEntry: existingReadEntries.get(request) ?? null,
  consumers: modules.map(module => uses[module]), source: modules.map(module => uses[module].source),
  scope, parameters, domain, notes,
})));
export const ADDITIONAL_READ_QUERIES = Object.freeze(BUSINESS_QUERY_CATALOG.filter(entry => entry.registration === 'DOMAIN_SURVEY_ONLY'));
const businessReadsByName = new Map(BUSINESS_QUERY_CATALOG.map(entry => [entry.request, entry]));
if (businessReadsByName.size !== BUSINESS_QUERY_CATALOG.length || BUSINESS_QUERY_CATALOG.some(entry =>
    !entry.readOnly || !entry.metadataOnly || !domainIds.has(entry.domain) || !entry.consumers.length || entry.source.length !== entry.consumers.length)) {
  throw new Error('业务只读目录必须唯一映射实际 survey，且不能改变基础采集目录');
}

// Metadata validation only: deliberately no protocol/client/transport argument.
// Existing business surveys remain the sole callers and builders of these reads.
export function validateBusinessQueryParameters(request, body = {}) {
  const entry = businessReadsByName.get(request);
  const fail = () => { throw Object.assign(new Error('查询不在业务只读目录或参数不符合固定范围'), { code: 'INVALID_QUERY_PARAMETERS', statusCode: 400 }); };
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  if (!entry || !plain(body) || Object.keys(body).some(key => !entry.parameters.allowedKeys.includes(key)) || entry.parameters.requiredKeys.some(key => !Object.hasOwn(body, key))) fail();
  const schema = entry.parameters;
  if (schema.mode === 'PAGE_NO') { const descriptor=Object.getOwnPropertyDescriptor(body,'pageNo'); if(Reflect.ownKeys(body).length!==1||!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')||!Number.isInteger(descriptor.value)||descriptor.value<0||descriptor.value>2147483647)fail(); }
  if (schema.mode === 'FIXED' && Object.entries(schema.fixed).some(([key, value]) => body[key] !== value)) fail();
  if (schema.mode === 'FLEET_BUILDING_ID' && (typeof body.buildingId !== 'string' || !body.buildingId.trim())) fail();
  if (schema.mode === 'TREASURE_UID' && (!Number.isInteger(body.uid) || body.uid < 1 || body.uid > 2147483647)) fail();
  if (schema.mode === 'SCREEN_CENTER' && (!plain(body.screenCenter) || Object.keys(body.screenCenter).some(key => !['x', 'y'].includes(key)) || ['x', 'y'].some(key => !Object.hasOwn(body.screenCenter, key) || !Number.isInteger(body.screenCenter[key]) || Math.abs(body.screenCenter[key]) > 2147483647))) fail();
  return structuredClone(body);
}
