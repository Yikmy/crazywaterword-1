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
  ['AllItemRequest', '库存道具', 'resources', ['items']],
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
  ['OnWaterRequest', '建筑、生产与居民订单', 'city', ['buildings', 'water'], ['resources', 'orders']],
  ['FishEncyclopediaRequest', '鱼类图鉴', 'collections', ['fish']],
  ['CargoShipsRequest', '货船', 'fleets', ['cargo']],
  ['AppointInfoRequest', '英雄任命', 'heroes', ['heroes.appointed']],
  ['ChatRecordRequest', '聊天记录', 'guild', []],
  ['GameEffectRequest', '游戏效果', 'collections', []],
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
        const view = summarize({ ok: { [entry.request]: ok[entry.request] }, failed: {} }, { config });
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
      parsed, parseError,
    };
  });
  return {
    domains: DATA_DOMAINS.map((entry) => ({ ...entry, count: DATA_CATALOG.filter(({ domains }) => domains.includes(entry.id)).length })),
    total: DATA_CATALOG.length, entries: result,
  };
}
