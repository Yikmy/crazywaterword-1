// 日常任务的自动完成：每个任务一个驱动，先只读探测前置条件，再给出可执行的动作。
//
// 只有客户端确实会发的请求才会被排进计划（request/body 与客户端调用点一致），
// 服务端是否计数以 SCDailyTaskUpdate 推送和完成后的 DailyTaskInfoRequest 为准。
//
// 有些任务天生无法协议完成：需要联盟身份、限时时段（20-21 点城战）、地图上得有野怪，
// 或者功能还没开放。这些驱动只报告原因，不会硬发请求。
//
// 除了任务本身，DailyTaskInfoResponse 还带着两样「领了才算完」的东西：
// - dailyTask[].rewardClaimed：任务达标后要点一下 DrawDailyTaskRewardRequest 才拿到奖励，
//   而奖励里带活跃度，所以顺序必须是「先跑任务 → 再领任务奖励 → 最后领活跃宝箱」。
// - dailyRewardClaimed / weeklyRewardClaimed：活跃度宝箱，各 5 档，领的是
//   DrawDailyRewardRequest / DrawWeeklyRewardRequest（都是 index 数组）。
//   两张表、两套门槛：DailyActivityRewardCfg 20/40/60/80/100，
//   WeeklyActivityRewardCfg 120/240/360/480/600。

import { normalize } from './worlds.mjs';
import { FREE_DAILY_PACK_ID, assertPaymentAllowed } from './actions.mjs';
import { safeResourceQuantity, stockFromResponses } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome, operationResult, stopsExecution, executionDelay } from './execution.mjs';

export const TASK_TITLES = {
  1001: '登录游戏',
  1002: '招募英雄',
  1003: '主线战斗',
  1004: '领取挂机收益',
  1005: '竞技场战斗',
  1006: '点金次数',
  1007: '折扣商店购买',
  1008: '累计贸易次数',
  1009: '累计试炼挑战',
  1010: '累计击败野怪',
  1011: '累计联盟情报',
  1012: '累计联盟订单',
  1013: '累计联盟互助',
  1014: '累计请求帮助',
  1015: '城战获得功勋',
  1016: '博物馆探险',
  1017: '参与积分赛',
};

const RECRUIT_ITEM = '抽卡券';
const RESOURCE_RUBY = '钻石';

export function describeDailyTask(task, config) {
  const row = (config?.tables?.DailyTaskCfg?.data ?? []).find((r) => r.taskId === task.id);
  return { ...task, title: TASK_TITLES[task.id] ?? row?.type ?? String(task.id), desc: row?.desc ?? '' };
}

// ---- 活跃度宝箱 ---------------------------------------------------------------

// 日和周是两张不同的表，门槛差很远：日 20/40/60/80/100，周 120/240/360/480/600。
// 客户端也是分开取的（allDailyActiveRewardCfg / allWeeklyActiveRewardCfg），
// 所以判「哪几档可领」必须按 kind 选表——混用会把 85 周活跃算成能领 4 档，发出去被服务端拒。
export const CHEST_TABLE = { daily: 'DailyActivityRewardCfg', weekly: 'WeeklyActivityRewardCfg' };

// 哪几档现在能领：活跃度够了、而且服务端没记在已领列表里。
// 四个季节的门槛与档位号完全一样（只有第 5 档的奖励不同），所以领哪几档不用挑季节；
// 只有要显示「第 5 档给什么」时才需要知道季节，那一步交给界面，不在这里猜。
function validClaimedTiers(claimed) {
  return Array.isArray(claimed) && claimed.every((id) => Number.isSafeInteger(id) && id > 0);
}
function validChestRow(row) {
  return Number.isSafeInteger(row?.id) && row.id > 0 && Number.isSafeInteger(row.activity) && row.activity >= 0;
}
export function chestTiers(config, { kind = 'daily', activity = null, claimed = [], season = null } = {}) {
  if (!['daily', 'weekly'].includes(kind) || !Number.isSafeInteger(activity) || activity < 0 || !validClaimedTiers(claimed)) return [];
  const rows = config?.tables?.[CHEST_TABLE[kind]]?.data ?? [];
  if (!Array.isArray(rows)) return [];
  const use = season == null ? rows : rows.filter((row) => row.season === season);
  const taken = new Set(claimed);
  const byId = new Map();
  for (const row of use) {
    if (!validChestRow(row) || taken.has(row.id) || activity < row.activity) continue;
    if (!byId.has(row.id)) byId.set(row.id, { id: row.id, activity: row.activity, reward: row.reward });
  }
  return [...byId.values()].sort((a, b) => a.activity - b.activity);
}

// 从一次 DailyTaskInfoResponse 算出要发的两个请求。两个都没有可领档位时返回空动作表。
export function planChests(daily, config) {
  const state = (activityField, claimedField) => {
    const activity = explicitCount(daily, activityField);
    const claimed = daily?.[claimedField];
    const known = activity !== null && validClaimedTiers(claimed);
    return { activity, claimed: validClaimedTiers(claimed) ? claimed : [], status: known ? 'known' : 'unknown' };
  };
  const day = state('dailyActivity', 'dailyRewardClaimed');
  const week = state('weeklyActivity', 'weeklyRewardClaimed');
  const dailyTiers = day.status === 'known' ? chestTiers(config, { ...day, kind: 'daily' }) : [];
  const weeklyTiers = week.status === 'known' ? chestTiers(config, { ...week, kind: 'weekly' }) : [];
  const actions = [];
  if (dailyTiers.length > 0) {
    actions.push({
      request: 'DrawDailyRewardRequest',
      body: { index: dailyTiers.map((tier) => tier.id) },
      response: null,
      cost: '无',
      note: `领日常活跃宝箱 第 ${dailyTiers.map((tier) => tier.id).join('/')} 档（活跃度 ${day.activity}）`,
    });
  }
  if (weeklyTiers.length > 0) {
    actions.push({
      request: 'DrawWeeklyRewardRequest',
      body: { index: weeklyTiers.map((tier) => tier.id) },
      response: null,
      cost: '无',
      note: `领周活跃宝箱 第 ${weeklyTiers.map((tier) => tier.id).join('/')} 档（活跃度 ${week.activity}）`,
    });
  }
  return {
    daily: { ...day, tiers: dailyTiers, nextAt: nextThreshold(config, 'daily', day) },
    weekly: { ...week, tiers: weeklyTiers, nextAt: nextThreshold(config, 'weekly', week) },
    actions,
  };
}

// 下一档的门槛，界面上用来解释「为什么现在没得领」。
function nextThreshold(config, kind, { activity = null, claimed = [], status } = {}) {
  if (status === 'unknown' || !Number.isSafeInteger(activity) || activity < 0 || !validClaimedTiers(claimed)) return null;
  const rows = config?.tables?.[CHEST_TABLE[kind]]?.data ?? [];
  if (!Array.isArray(rows)) return null;
  return rows
    .filter((row) => validChestRow(row) && !claimed.includes(row.id) && row.activity > activity)
    .reduce((min, row) => (min == null || row.activity < min ? row.activity : min), null);
}

// ---- 每日精选的免费礼包 -------------------------------------------------------

// 「每日精选」面板每天有一档免费赠礼，领走的是 GotFreeDailyPackRequest{packId:"赠礼"}。
// packId 是客户端硬编码的字符串，服务端状态在 DailyGiftPackResponse.drawnPack 里；
// resetTime 是次日 0 点，所以这是真正的「日奖励」，和活跃度宝箱是两回事。
//
// 面板里另外三个（礼包1/2/3）要走充值，"合并礼包" 要先买过前三个才可领，都不在本工具范围内。
export function planDailyGift(response) {
  // The real codec requires heroId and initializes omitted repeated fields to [].
  // An empty decoded list is valid; a malformed plain object without the list is unknown.
  const drawn = response?.drawnPack;
  const known = Array.isArray(drawn) && drawn.every((id) => typeof id === 'string')
    && typeof response?.heroId === 'string' && response.heroId.trim().length > 0;
  const available = known && !drawn.includes(FREE_DAILY_PACK_ID);
  return {
    drawn: known ? drawn : null,
    status: known ? available ? 'ready' : 'done' : 'unknown',
    freeAvailable: known ? available : null,
    resetTime: response?.resetTime ?? null,
    actions: available
      ? [{
        request: 'GotFreeDailyPackRequest',
        body: { packId: FREE_DAILY_PACK_ID },
        response: null,
        cost: '无',
        note: '领每日精选的免费赠礼',
      }]
      : [],
  };
}

// An omitted protobuf int32 inherits zero; only an explicit field is a fact.
function explicitCount(value, key) {
  return value && Object.hasOwn(value, key) && typeof value[key] === 'number'
    && Number.isSafeInteger(value[key]) && value[key] >= 0 ? value[key] : null;
}
// The CLI reward preview and the reward executor share the same explicit-state gate.
export function claimableDailyTasks(daily) {
  return (Array.isArray(daily?.dailyTask) ? daily.dailyTask : []).filter((task) => {
    const id = explicitCount(task, 'id');
    const progress = explicitCount(task, 'progress');
    const target = explicitCount(task, 'targetProgress');
    return id !== null && id > 0 && progress !== null && target !== null && target > 0
      && progress >= target && Object.hasOwn(task, 'rewardClaimed') && task.rewardClaimed === false;
  });
}

function configuredCount(config, name) {
  const matches = (config?.tables?.OfflineParamCfg?.data ?? []).filter((row) => row.paramName === name);
  return matches.length === 1 ? explicitCount(matches[0], 'paramValue') : null;
}

// 每个驱动声明它要的只读前置请求，框架统一批量取一遍。
export const DAILY_DRIVERS = {
  1002: {
    id: 1002,
    title: '招募英雄',
    probes: [['RecruitInfoRequest', {}]],
    evaluate({ task, probe, items, now }) {
      const info = probe('RecruitInfoRequest')?.hero;
      const remaining = Math.max(0, task.targetProgress - task.progress);
      if (remaining === 0) return { status: 'done' };
      const freeEnd = explicitCount(info, 'freeEndTimeSeconds');
      if (freeEnd === null || !Number.isFinite(now) || now < 0) return { status: 'unknown', reason: '免费招募状态缺失或不可靠' };
      const actions = [];
      // RecruitWay: 1=免费 2=单抽 3=十连 4=五十连 5=高级；单抽花 1 张抽卡券。
      if (freeEnd <= now) {
        actions.push({ request: 'RecruitStartRequest', body: { way: 1 }, response: 'RecruitStartResponse', cost: '免费次数', note: '免费招募' });
      }
      const tickets = items instanceof Map ? safeResourceQuantity(items.has(RECRUIT_ITEM) ? items.get(RECRUIT_ITEM) : 0) : null;
      const singles = tickets === null ? 0 : Math.min(remaining - actions.length, tickets);
      for (let i = 0; i < singles; i += 1) {
        actions.push({ request: 'RecruitStartRequest', body: { way: 2 }, response: 'RecruitStartResponse', cost: `${RECRUIT_ITEM} x1`, note: '单抽' });
      }
      if (actions.length === 0) {
        if (tickets === null) return { status: 'unknown', reason: '招募券库存缺失或不可靠' };
        return { status: 'blocked', reason: `免费次数未好，且没有${RECRUIT_ITEM}（需要 ${remaining} 次）` };
      }
      if (actions.length < remaining) {
        return { status: 'partial', reason: `只有 ${actions.length}/${remaining} 次可做`, actions };
      }
      return { status: 'ready', actions };
    },
  },

  1003: {
    id: 1003,
    title: '主线战斗',
    probes: [],
    evaluate({ task, player }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      // 客户端发的是 PlayerInfo.mainlineStage（下一关的关卡号），不是 PassStageState.maxOpenStage。
      const stage = player?.mainlineStage;
      if (!stage) return { status: 'blocked', reason: '登录信息里没有 mainlineStage' };
      return {
        status: 'ready',
        actions: [{ request: 'ChallengeStageRequest', body: { stage }, response: 'ChallengeStageResponse', cost: '体力', note: `挑战主线第 ${stage} 关` }],
      };
    },
  },

  1004: {
    id: 1004,
    title: '领取挂机收益',
    probes: [['AfkInfoRequest', {}]],
    evaluate({ task, probe, now }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const afk = probe('AfkInfoRequest')?.afkInfo;
      if (!afk) return { status: 'blocked', reason: '没有挂机信息' };
      if (!(afk.afkFinishTime > 0 && afk.afkFinishTime <= now)) {
        return { status: 'waiting', reason: `本段挂机还有 ${Math.ceil(afk.afkFinishTime - now)} 秒` };
      }
      return { status: 'ready', actions: [{ request: 'DrawAfkRewardRequest', body: {}, response: 'DrawAfkRewardResponse', cost: '无', note: '领取挂机本段收益' }] };
    },
  },

  1005: {
    id: 1005,
    title: '竞技场战斗',
    probes: [['ArenaInfoRequest', {}]],
    evaluate({ task, probe }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const challenges = probe('ArenaInfoRequest')?.challenges ?? [];
      const remaining = task.targetProgress - task.progress;
      if (!challenges.length) return { status: 'blocked', reason: '竞技场没有可挑战对手' };
      // 从战力最低的开始打，胜率最高。
      const targets = [...challenges].sort((a, b) => lowPower(a.power) - lowPower(b.power)).slice(0, remaining);
      const actions = targets.map((target) => ({
        request: 'ArenaChallengeRequest',
        body: { rank: target.rankNo, challengeId: target.id },
        response: 'ArenaChallengeResponse',
        cost: '竞技场次数',
        note: `挑战 rank=${target.rankNo} 战力=${lowPower(target.power)}`,
      }));
      return { status: 'ready', actions };
    },
  },

  1006: {
    id: 1006,
    title: '点金次数',
    probes: [['ClickGoldInfoRequest', {}]],
    evaluate({ task, probe, config, ruby }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const info = probe('ClickGoldInfoRequest')?.info;
      const freeTimes = explicitCount(info, 'freeTimes');
      const freeMax = configuredCount(config, '免费点金次数');
      if (freeTimes === null || freeMax === null || freeTimes > freeMax) return { status: 'unknown', reason: '免费点金次数或配置缺失、无效' };
      const remaining = task.targetProgress - task.progress;
      // 免费次数上限来自 OfflineParamCfg.免费点金次数，付费单价来自 点金价格（单位钻石）。
      const freeLeft = freeMax - freeTimes;
      if (freeLeft > 0) {
        // 免费点金客户端永远是 times:1 一次一发，服务端不接受免费模式下的多连。
        const count = Math.min(freeLeft, remaining);
        const actions = [];
        for (let i = 0; i < count; i += 1) {
          actions.push({ request: 'ClickGoldRequest', body: { times: 1, free: true }, response: 'ClickGoldResponse', cost: '免费次数', note: '免费点金 x1' });
        }
        return { status: 'ready', actions };
      }
      const price = configuredCount(config, '点金价格');
      const paidTimes = explicitCount(info, 'paidTimes');
      const maxPaidTimes = explicitCount(info, 'maxPaidTimes');
      if (price === null || price <= 0 || paidTimes === null || maxPaidTimes === null || paidTimes > maxPaidTimes
        || safeResourceQuantity(ruby) === null || !Number.isSafeInteger(price * remaining)) {
        return { status: 'unknown', reason: '付费点金成本或次数未知；D6 禁止执行' };
      }
      const paidLeft = maxPaidTimes - paidTimes;
      if (paidLeft < remaining) return { status: 'blocked', reason: `免费次数用完，付费上限只剩 ${paidLeft} 次` };
      if (price * remaining > ruby) return { status: 'blocked', reason: `付费点金要 ${price * remaining} 钻石，当前 ${ruby}` };
      // 付费点金扣的是钻石（RUBY），必须显式开 allowPaid。
      return {
        status: 'paid',
        reason: `免费次数已用完，付费 ${price} 钻石一次`,
        actions: [{ request: 'ClickGoldRequest', body: { times: remaining, free: false }, response: 'ClickGoldResponse', cost: `${RESOURCE_RUBY} x${price * remaining}`, note: '付费点金' }],
      };
    },
  },

  1007: {
    id: 1007,
    title: '折扣商店购买',
    probes: [['DiscountShopRequest', {}]],
    evaluate({ task, probe, ruby }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const shop = probe('DiscountShopRequest');
      if (!Array.isArray(shop?.shopItem)) return { status: 'unknown', reason: '折扣商店状态未知' };
      const items = shop.shopItem.filter((item) => item.isBuy === false);
      if (!items.length) return { status: 'blocked', reason: '折扣商店没有可买商品' };
      // Price is dynamic server data; no DiscountShopCfg exists in recovered config.
      // Missing/default/invalid fields cannot establish a known cost.
      if (items.some((item) => !Object.hasOwn(item, 'price') || !Object.hasOwn(item, 'discount')
        || !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.discount)
        || item.discount <= 0 || item.discount > 1 || !Number.isInteger(item.id))) {
        return { status: 'unknown', reason: '商品价格或折扣未知，拒绝购买' };
      }
      const cheapest = items.map((item) => ({ ...item, realPrice: Math.floor(item.price * item.discount) }))
        .sort((a, b) => a.realPrice - b.realPrice)[0];
      if (!Number.isSafeInteger(cheapest.realPrice) || !Number.isFinite(ruby)) return { status: 'unknown', reason: '商品成本或钻石余额未知' };
      if (cheapest.realPrice > ruby) return { status: 'blocked', reason: `最便宜的一件要 ${cheapest.realPrice} 钻石，当前 ${ruby}` };
      return {
        status: 'paid',
        reason: 'D6 禁止钻石消费；allowPaid 不能解除此限制',
        actions: [{ request: 'DiscountShopBuyRequest', body: { id: cheapest.id }, response: 'DiscountShopBuyResponse', paid: true, needsPaid: true,
          cost: `${RESOURCE_RUBY} x${cheapest.realPrice}`, note: `购买商品 ${cheapest.id}` }],
      };
    },
  },

  1008: {
    id: 1008,
    title: '累计贸易次数',
    probes: [['CargoShipsRequest', {}], ['TradeInfoRequest', {}]],
    evaluate({ task, probe }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const ships = probe('CargoShipsRequest')?.ship ?? [];
      const cargo = probe('TradeInfoRequest')?.worldCargo ?? [];
      if (!ships.length && !cargo.length) {
        return { status: 'blocked', reason: '没有货轮也没有世界货物，贸易需要先在地图上接货' };
      }
      return { status: 'blocked', reason: '货轮贸易要在地图上选航线，未找到可自动化的入口' };
    },
  },

  1009: {
    id: 1009,
    title: '累计试炼挑战',
    probes: [['TrialRaidInfoRequest', { raidId: 1 }]],
    evaluate({ task, probe, config, player }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const raid = probe('TrialRaidInfoRequest')?.raid;
      if (!raid) return { status: 'blocked', reason: '拿不到试炼副本信息' };
      // passedStage 是已通关的 stageLevel，stageId 是 1001 这种编号，两者不是一回事。
      const stages = (config?.tables?.TrialRaidStageCfg?.data ?? [])
        .filter((row) => row.raidId === raid.raidId)
        .sort((a, b) => a.stageLevel - b.stageLevel);
      const next = stages.find((row) => row.stageLevel > (raid.passedStage ?? 0));
      if (!next) return { status: 'blocked', reason: '这个试炼副本已经全通' };
      const level = player?.level ?? 1;
      if ((next.openLevel ?? 0) > level) {
        return { status: 'blocked', reason: `试炼副本需要玩家等级 ${next.openLevel}，当前 ${level}` };
      }
      return {
        status: 'ready',
        actions: [{ request: 'TrialRaidChallengeRequest', body: { raidId: raid.raidId, stageId: next.stageId }, response: 'TrialRaidChallengeResponse', cost: '挑战次数', note: `英雄经验副本第 ${next.stageLevel} 关` }],
      };
    },
  },

  1010: {
    id: 1010,
    title: '累计击败野怪',
    probes: [['AllPirateRequest', {}]],
    evaluate({ task, probe }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const pirates = probe('AllPirateRequest')?.pirates ?? [];
      if (!pirates.length) return { status: 'blocked', reason: '世界地图上没有海盗部队可扫荡' };
      const remaining = task.targetProgress - task.progress;
      const actions = pirates.slice(0, remaining).map((pirate) => ({
        request: 'PirateSweepRequest',
        body: { uid: pirate.uid, cityId: pirate.cityId },
        response: null,
        cost: '讨伐次数',
        note: `扫荡海盗 ${pirate.uid}`,
      }));
      return { status: 'ready', actions };
    },
  },

  1011: { id: 1011, title: '累计联盟情报', probes: [['TradeGuildRadarRequest', {}]], evaluate: lockedReason('联盟情报（雷达）') },
  1012: { id: 1012, title: '累计联盟订单', probes: [['GuildCityInfoRequest', {}]], evaluate: lockedReason('联盟城市募兵') },
  1013: { id: 1013, title: '累计联盟互助', probes: [['GuildAidListRequest', { type: 0 }]], evaluate: lockedReason('联盟互助') },
  1014: { id: 1014, title: '累计请求帮助', probes: [], evaluate: lockedReason('联盟求助') },
  1015: { id: 1015, title: '城战获得功勋', probes: [], evaluate: lockedReason('城战（20:00-21:00 限时）') },
  1016: { id: 1016, title: '博物馆探险', probes: [['MuseumInfoRequest', {}]], evaluate: lockedReason('博物馆') },
  1017: { id: 1017, title: '参与积分赛', probes: [['LeagueInfoRequest', {}]], evaluate: lockedReason('跨服积分赛') },
};

// 这类任务的入口请求被服务端直接拒绝（未入盟 / 未开放 / 限时），探测结果只用来确认原因。
function lockedReason(feature) {
  return ({ task }) => {
    if (task.progress >= task.targetProgress) return { status: 'done' };
    return { status: 'blocked', reason: `${feature}当前不可用（服务端拒绝或功能未开放）` };
  };
}

function lowPower(power) {
  if (power == null) return 0;
  if (typeof power === 'number') return power;
  return power.low ?? 0;
}

// 只读调研：跑一遍前置请求，给出每个日常任务能不能做、要发什么。
export async function surveyDailies(client, protocol, options = {}) {
  const { config = null, player = null, timeout = 8000 } = options;
  const query = (name, body, response, duration = timeout) => dailyQuery(client, name, body, response, { ...options, timeout: duration });
  const daily = await query('DailyTaskInfoRequest', {}, 'DailyTaskInfoResponse', timeout);
  const tasks = (daily.dailyTask ?? []).map((task) => describeDailyTask(task, config));
  const itemList = await query('AllItemRequest', {}, 'AllItemResponse', timeout);
  // Preserve invalid/missing quantities rather than coercing null or protobuf defaults to zero.
  const items = Array.isArray(itemList?.items) ? stockFromResponses({ items: itemList.items.map((item) => ({
    itemId: item.itemId ?? item.id,
    num: Object.hasOwn(item, 'num') ? item.num : Object.hasOwn(item, 'count') ? item.count : null,
  })) }, { list: [] }) : null;
  const resourceList = await query('AllResourceRequest', {}, 'AllResourceResponse', timeout);
  const resourceStock = Array.isArray(resourceList?.list) ? stockFromResponses({ items: [] }, resourceList) : null;
  const ruby = resourceStock ? resourceStock.has('RUBY') ? resourceStock.get('RUBY') : 0 : null;

  const cache = new Map();
  const probeFailures = new Map();
  const fetchProbe = async (name, body) => {
    const key = `${name}|${JSON.stringify(body)}`;
    if (cache.has(key)) return cache.get(key);
    const responseName = `${name.slice(0, -7)}Response`;
    let value = null;
    try {
      value = await query(name, body ?? {}, responseName, timeout);
    } catch (error) {
      assertExecutionActive(client, options);
      probeFailures.set(name, error.message);
      value = null;
    }
    cache.set(key, value);
    return value;
  };

  const probeCache = new Map();
  for (const driver of Object.values(DAILY_DRIVERS)) {
    for (const [name, body] of driver.probes ?? []) {
      const key = `${name}|${JSON.stringify(body)}`;
      if (probeCache.has(key)) continue;
      probeCache.set(key, await fetchProbe(name, body));
    }
  }
  const probe = (name) => {
    for (const [key, value] of probeCache) if (key.startsWith(`${name}|`)) return value;
    return null;
  };

  const now = Date.now() / 1000;
  const evaluations = [];
  for (const task of tasks) {
    if (task.progress >= task.targetProgress) {
      evaluations.push({ task, status: 'done', actions: [] });
      continue;
    }
    const driver = DAILY_DRIVERS[task.id];
    if (!driver) {
      evaluations.push({ task, status: 'unknown', reason: '没有对应的驱动' });
      continue;
    }
    const failedProbe = (driver.probes ?? []).find(([name]) => probeFailures.has(name));
    if (failedProbe) {
      evaluations.push({ task, status: 'unknown', reason: probeFailures.get(failedProbe[0]), actions: [] });
      continue;
    }
    let verdict;
    try {
      verdict = normalize(driver.evaluate({ task, probe, items, ruby, now, config, player }));
    } catch (error) {
      verdict = { status: 'error', reason: error.message };
    }
    evaluations.push({ task, ...verdict });
  }
  let gift = null;
  if (protocol.DailyGiftPackRequest && protocol.DailyGiftPackResponse) {
    try {
      gift = planDailyGift(await query('DailyGiftPackRequest', {}, 'DailyGiftPackResponse', timeout));
    } catch {
      assertExecutionActive(client, options);
      // 这个面板取不到不影响任务本身，如实留空比编一个状态好。
      gift = null;
    }
  }
  return { daily, tasks: evaluations, chests: planChests(daily, config), gift, ruby, config, player };
}

async function dailyQuery(client, name, body, response, options, mutate = false) {
  assertExecutionActive(client, options);
  return awaitExecution(client.request(name, body, response, options.timeout ?? 15000, { mutate, signal: options.signal }), client, options);
}

// A quiet watch window proves only that no rejection arrived in that window.
async function sendAction(client, protocol, action, options, verify) {
  assertPaymentAllowed(action, options);
  assertExecutionActive(client, options);
  if (!protocol[action.request] || (action.response && !protocol[action.response])) {
    return operationResult('NOT_EXECUTED', { skipped: true, reason: '缺少已声明的协议类型' });
  }
  if (action.response) {
    const body = await dailyQuery(client, action.request, action.body, action.response, options, true);
    return operationResult(body == null ? 'UNKNOWN' : 'SUCCESS', { body });
  }
  await awaitExecution(client.sendWatch(action.request, action.body, { window: 400, signal: options.signal }), client, options);
  if (verify && await verify()) {
    client.confirmWatchedWrite?.(action.request, action.body);
    return operationResult('SUCCESS');
  }
  return operationResult('UNKNOWN');
}

const actionKey = (id, action) => `${id}:${action.request}:${JSON.stringify(action.body)}`;
function paymentFailure(error) {
  return ['D6_FORBIDDEN', 'PAID_NOT_ALLOWED', 'COST_UNKNOWN'].includes(error.code);
}
function failedOutcome(error) {
  return operationResult(paymentFailure(error) ? 'NOT_EXECUTED' : executionOutcome(error), {
    error: error.message, code: error.code, ...(paymentFailure(error) ? { skipped: true, reason: error.message } : {}),
  });
}

export async function runDailies(client, protocol, survey, options = {}) {
  const { allowMutate = false, claimRewards = true, onStep, rejected = new Set() } = options;
  if (!allowMutate) throw new Error('完成日常会改变账号状态，需要 --yes');
  const settings = { ...options, config: options.config ?? survey.config, player: options.player ?? survey.player };
  const results = [];
  const report = (outcome) => { results.push(outcome); onStep?.(outcome); };
  for (const entry of survey.tasks) {
    for (const action of entry.actions ?? []) {
      const key = actionKey(entry.task.id, action);
      if (rejected.has(key)) continue;
      let outcome;
      try {
        assertExecutionActive(client, settings);
        // Enforce D6 before doing even a refresh for a forbidden planned action.
        assertPaymentAllowed({ ...action, paid: action.paid || entry.status === 'paid' }, settings);
        // Reuse the same survey/driver to check current server state and config before each write.
        const fresh = await surveyDailies(client, protocol, settings);
        const current = fresh.tasks.find((item) => item.task.id === entry.task.id);
        const next = current?.actions?.find((item) => item.request === action.request && JSON.stringify(item.body) === JSON.stringify(action.body));
        if (!next || !['ready', 'partial'].includes(current.status)) {
          outcome = operationResult('NOT_EXECUTED', { skipped: true, reason: current?.reason ?? '计划已失效，执行前复核未通过' });
        } else {
          outcome = await sendAction(client, protocol, next, settings);
        }
      } catch (error) {
        outcome = failedOutcome(error);
      }
      report({ id: entry.task.id, title: entry.task.title, request: action.request, note: action.note, ...outcome });
      if (outcome.status === 'REJECTED') { rejected.add(key); break; }
      if (stopsExecution(outcome)) return results;
      if (outcome.skipped) break;
      try { await executionDelay(400, settings); }
      catch (error) { report(failedOutcome(error)); return results; }
    }
  }
  if (claimRewards) {
    try {
      await executionDelay(1000, settings);
      results.push(...await claimDailies(client, protocol, { ...settings, rejected }));
    } catch (error) { report(failedOutcome(error)); }
  }
  return results;
}

export async function claimDailies(client, protocol, options = {}) {
  const { config = null, onStep, rejected = new Set() } = options;
  if (!options.allowMutate) throw new Error('领取日常奖励会改变账号状态，需要 --yes');
  const results = [];
  if (!protocol.DailyTaskInfoRequest || !protocol.DailyTaskInfoResponse) return results;
  const query = (name, body, response) => dailyQuery(client, name, body, response, options);
  const report = (outcome) => { results.push(outcome); onStep?.(outcome); };
  const perform = async (id, title, action, verify) => {
    const key = actionKey(id, action);
    if (rejected.has(key)) return false;
    let outcome;
    try { outcome = await sendAction(client, protocol, action, options, verify); }
    catch (error) { outcome = failedOutcome(error); }
    report({ id, title, request: action.request, note: action.note, ...outcome });
    if (outcome.status === 'REJECTED') rejected.add(key);
    return stopsExecution(outcome);
  };
  try {
    const after = await query('DailyTaskInfoRequest', {}, 'DailyTaskInfoResponse');
    const claimable = claimableDailyTasks(after);
    for (const task of claimable) {
      const title = TASK_TITLES[task.id] ?? String(task.id);
      const action = { request: 'DrawDailyTaskRewardRequest', response: 'DrawDailyTaskRewardResponse', body: { id: task.id }, cost: '无', note: `领任务奖励（${title}）` };
      if (await perform(task.id, title, action)) return results;
      await executionDelay(300, options);
    }
    const fresh = await query('DailyTaskInfoRequest', {}, 'DailyTaskInfoResponse');
    for (const action of planChests(fresh, config).actions) {
      const weekly = action.request === 'DrawWeeklyRewardRequest';
      const title = weekly ? '周活跃宝箱' : '日常活跃宝箱';
      const field = weekly ? 'weeklyRewardClaimed' : 'dailyRewardClaimed';
      if (await perform('activityChest', title, action, async () => {
        const latest = await query('DailyTaskInfoRequest', {}, 'DailyTaskInfoResponse');
        return validClaimedTiers(latest?.[field]) && action.body.index.every((index) => latest[field].includes(index));
      })) return results;
      await executionDelay(300, options);
    }
    if (protocol.DailyGiftPackRequest && protocol.DailyGiftPackResponse) {
      const before = await query('DailyGiftPackRequest', {}, 'DailyGiftPackResponse');
      const action = planDailyGift(before).actions[0];
      if (action) await perform('freeDailyPack', '每日免费赠礼', action, async () => {
        const latest = await query('DailyGiftPackRequest', {}, 'DailyGiftPackResponse');
        return planDailyGift(latest).status === 'done';
      });
    }
  } catch (error) { report(failedOutcome(error)); }
  return results;
}

// 活跃奖励那两行：没得领的时候也要说清楚差多少，否则看不出是「领完了」还是「没在领」。
function chestLine(name, chest) {
  if (chest.status === 'unknown') return `活跃奖励 ${name} 状态未知，未生成领取计划`;
  const claimed = chest.claimed.length ? chest.claimed.join('/') : '无';
  if (chest.tiers.length) {
    return `活跃奖励 ${name} ${chest.activity} 活跃 · 已领 ${claimed} · 可领 第 ${chest.tiers.map((tier) => tier.id).join('/')} 档`;
  }
  const tail = chest.nextAt == null ? '全部领完' : `还差 ${chest.nextAt - chest.activity} 点到第 ${chest.nextAt} 档`;
  return `活跃奖励 ${name} ${chest.activity} 活跃 · 已领 ${claimed} · 暂无可领（${tail}）`;
}

export function formatSurvey(survey) {
  const lines = [];
  const label = { ready: '可做', paid: '需付费', partial: '部分', waiting: '等待中', done: '已完成', blocked: '不可用', error: '出错', unknown: '未知' };
  for (const entry of survey.tasks) {
    const task = entry.task;
    const progress = `${task.progress}/${task.targetProgress}`;
    const actions = (entry.actions ?? []).length;
    const suffix = entry.reason ? ` — ${entry.reason}` : actions ? ` — ${actions} 个动作` : '';
    lines.push(`${(label[entry.status] ?? entry.status).padEnd(4)} ${String(task.id).padEnd(5)}${task.title.padEnd(8)} ${progress.padEnd(6)}${suffix}`);
  }
  if (survey.chests) {
    lines.push(chestLine('日', survey.chests.daily));
    lines.push(chestLine('周', survey.chests.weekly));
  }
  if (survey.gift) {
    lines.push(survey.gift.status === 'unknown' ? '每日赠礼 状态未知，未生成领取计划' : survey.gift.freeAvailable
      ? `每日赠礼 未领 · 可领（免费，${FREE_DAILY_PACK_ID}）`
      : `每日赠礼 已领（${FREE_DAILY_PACK_ID}）`);
  }
  return lines.join('\n');
}
