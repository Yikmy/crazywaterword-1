import { normalize } from './worlds.mjs';
import { redact } from './security.mjs';
import { createStateFact } from './state-facts.mjs';
import { pirateSweepView, observePirateVipLevel } from './pirate-sweep.mjs';

// The read-only state queries the real client fires immediately after login, in the
// order it sends them. Taken verbatim from a capture of the game entering its main UI.
// Every one of these is a pure query: none of them mutates account state.
export const ENTRY_QUERIES = [
  { name: 'AllItemRequest' },
  { name: 'AllResourceRequest' },
  { name: 'AllHeroRequest' },
  { name: 'GetFormationRequest', body: { module: 1 } },
  { name: 'EmailBoxRequest', body: { pageNo: 0 } },
  { name: 'EquipsRequest' },
  { name: 'BadgesRequest' },
  { name: 'RecruitInfoRequest' },
  { name: 'AchievementInfoRequest' },
  { name: 'DailyTaskInfoRequest' },
  { name: 'DailyGiftPackRequest' },
  { name: 'MainTaskInfoRequest' },
  { name: 'GuideInfoRequest' },
  { name: 'AfkInfoRequest' },
  { name: 'MonthCardRequest' },
  { name: 'AllAntiqueRequest' },
  { name: 'OnWaterRequest' },
  { name: 'FishEncyclopediaRequest' },
  { name: 'CargoShipsRequest' },
  { name: 'AppointInfoRequest' },
  { name: 'ChatRecordRequest', body: { channel: 1 } },
  { name: 'GameEffectRequest' },
  { name: 'AllGuildAbstractionRequest' },
  { name: 'MyFleetsRequest' },
  { name: 'PirateKillRecordRequest' },
  { name: 'MyResFieldsRequest' },
  { name: 'GuildTechInfoRequest' },
  { name: 'GuildOrderRequest' },
  { name: 'MyFormationPresetRequest' },
  { name: 'SeasonTaskStageRequest' },
  { name: 'WorldBossInfoRequest' },
  { name: 'LimitedBossOpenRequest' },
  { name: 'AllPetRequest' },
  { name: 'SeasonRankInfoRequest' },
  { name: 'WeekInfoRequest' },
  { name: 'PassStageStateRequest' },
  { name: 'WeekOrderInfoRequest' },
  { name: 'CounterInfoRequest' },
  { name: 'RadarInfoRequest' },
  { name: 'EnvSkinListRequest' },
  { name: 'ChannelRewardInfoRequest' },
  { name: 'LimitTicketRequest' },
  { name: 'SeasonCardRequest' },
  { name: 'AllPirateRequest' },
  { name: 'PlayerFrameRequest' },
  { name: 'ChurnInfoRequest' },
  { name: 'UltraOpenRequest' },
  { name: 'BlackListRequest' },
];

// These two have no matching `*Response` type in the protocol table: the server answers
// with a push instead (`SCRedPoint`) or a generic `OkResponse`. Sending them with the
// request/response helper would just burn a timeout, so they go out fire-and-forget.
export const ENTRY_SIGNALS = [{ name: 'ExitWorldMapRequest' }, { name: 'RedPointRequest' }];

function responseNameOf(name) {
  return `${name.slice(0, -'Request'.length)}Response`;
}

// Preserve the exact decoded response separately from the existing numeric business view.
// JSON has no int64 type: unsafe integers are decimal strings, safe integers stay numbers.
export function toSnapshotJson(value) {
  const seen = new WeakSet();
  const int32 = (part) => Number.isInteger(part) && part >= -2147483648 && part <= 4294967295;
  function copy(item) {
    if (typeof item === 'bigint') return item.toString();
    if (typeof item === 'function' || typeof item === 'symbol') return undefined;
    if (item === null || typeof item !== 'object') return item;
    if (item instanceof Date) return Number.isNaN(item.getTime()) ? null : item.toISOString();
    if (int32(item.low) && int32(item.high) &&
        (item.unsigned === undefined || typeof item.unsigned === 'boolean') &&
        Object.keys(item).every((key) => ['low', 'high', 'unsigned'].includes(key))) {
      const bits = (BigInt(item.high >>> 0) << 32n) | BigInt(item.low >>> 0);
      const exact = item.unsigned === true ? bits : BigInt.asIntN(64, bits);
      return exact >= BigInt(Number.MIN_SAFE_INTEGER) && exact <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exact) : exact.toString();
    }
    if (seen.has(item)) return '[Circular]';
    seen.add(item);
    const result = Array.isArray(item) ? [] : {};
    for (const [key, entry] of Object.entries(item)) {
      Object.defineProperty(result, key, { value: copy(entry), enumerable: true, configurable: true, writable: true });
    }
    seen.delete(item);
    return result;
  }
  return copy(value);
}

// Concurrent refreshes on one connection share work; account connections stay independent.
const collections = new WeakMap();
export function collectState(client, protocol, { timeout = 15000, onResult = null } = {}) {
  const existing = collections.get(client);
  if (existing) { if (onResult) existing.listeners.add(onResult); return existing.promise; }
  const job = { listeners: new Set(onResult ? [onResult] : []), promise: null };
  job.promise = Promise.resolve().then(async () => {
    const ok = {}, failed = {}, outcomes = {}, raw = {}, facts = {};
    const vipContext = Object.fromEntries(['accountId', 'generation', 'connectionId'].map(key => [key, client.factContext?.[key]]));
    const notify = (name, body, error) => { for (const listener of job.listeners) { try { listener(name, body, error); } catch {} } };
    // ENTRY_SIGNALS remain protocol evidence; data refresh never sends them.
    await Promise.all(ENTRY_QUERIES.map(async (query) => {
      const response = responseNameOf(query.name);
      const startedAt = new Date().toISOString();
      const finish = (status, error = null) => { outcomes[query.name] = { status, response, startedAt, updatedAt: new Date().toISOString(), error }; };
      if (!protocol[query.name] || !protocol[response]) {
        const reason = 'no protocol type for ' + (protocol[query.name] ? response : query.name);
        failed[query.name] = reason; finish('NOT_EXECUTED', reason); notify(query.name, null, new Error(reason)); return;
      }
      try {
        const body = await client.request(query.name, query.body || {}, response, timeout);
        raw[query.name] = toSnapshotJson(body);
        ok[query.name] = normalize(body); finish('SUCCESS');
        const serverTime = client.gameClock?.read(client.factContext);
        facts[query.name] = createStateFact(raw[query.name], { accountId: client.factContext?.accountId, generation: client.factContext?.generation, source: response, sourceAt: Date.parse(outcomes[query.name].updatedAt), serverTime: serverTime?.reliable === true ? Math.floor(serverTime.nowMs) : null, scope: { kind: 'CURRENT_RESPONSE_ONLY', key: query.name }, reliable: false });
        // Domain parsers establish semantic reliability; transport SUCCESS alone does not.
        notify(query.name, body, null);
      } catch (error) {
        const reason = redact({ login: client.login, error: error?.message || 'query failed' }).error;
        failed[query.name] = reason; finish('FAILED', reason); notify(query.name, null, new Error(reason));
      }
    }));
    return { ok, failed, outcomes, raw, facts, sessionFacts: { vipLevel: observePirateVipLevel(client, vipContext) } };
  }).finally(() => { if (collections.get(client) === job) collections.delete(client); });
  collections.set(client, job); return job.promise;
}
const asArray = (value) => (Array.isArray(value) ? value : []);

// Turns the raw response bodies into the picture a player would describe. Every number
// here is straight from the server; nothing is inferred except the obvious sums.
export function summarize(state, { now = Date.now() / 1000, config = null } = {}) {
  const q = state.ok || {};
  const water = q.OnWaterRequest || {};
  const afk = q.AfkInfoRequest?.afkInfo;
  const daily = q.DailyTaskInfoRequest;
  const achievement = q.AchievementInfoRequest;
  const email = q.EmailBoxRequest;
  const resFields = q.MyResFieldsRequest?.info;
  const items = asArray(q.AllItemRequest?.items);
  const heroes = asArray(q.AllHeroRequest?.heroes);
  const buildings = asArray(water.building);
  const monthCard = asArray(q.MonthCardRequest?.cardItem);

  const tasksDone = (list) => asArray(list).filter((task) => task.progress >= task.targetProgress);
  const claimable = (list) =>
    tasksDone(list).filter((task) => !task.rewardClaimed).length;

  const view = {
    resources: asArray(q.AllResourceRequest?.list).map((entry) => ({
      res: entry.res,
      amount: entry.amount,
      name: config ? config.resourceName(entry.res) : undefined,
    })),
    items: {
      kinds: items.length,
      total: items.reduce((sum, item) => sum + item.num, 0),
      top: [...items].sort((a, b) => b.num - a.num).slice(0, 12),
    },
    heroes: {
      count: heroes.length,
      power: heroes.reduce((sum, hero) => sum + hero.power, 0),
      list: heroes
        .map((hero) => ({ heroId: hero.heroId, level: hero.level, star: hero.star, power: hero.power, skinId: hero.skinId }))
        .sort((a, b) => b.power - a.power),
      formation: asArray(q.GetFormationRequest?.formation?.heroPositions).map((slot) => ({ heroId: slot.heroId, x: slot.pos?.x, y: slot.pos?.y })),
      appointed: asArray(q.AppointInfoRequest?.heroes).map((slot) => ({ heroId: slot.heroId, posId: slot.posId })),
    },
    afk: afk
      ? {
          level: afk.level,
          startTime: afk.afkStartTime,
          finishTime: afk.afkFinishTime,
          rewardedLevel: afk.rewardedLevel,
          capped: afk.afkFinishTime > 0 && now >= afk.afkFinishTime,
          pendingLevels: Math.max((afk.level ?? 0) - (afk.rewardedLevel ?? 0), 0),
        }
      : null,
    clickGold: q.AfkInfoRequest?.clickGoldInfo ?? null,
    daily: daily
      ? {
          tasks: asArray(daily.dailyTask).length,
          done: tasksDone(daily.dailyTask).length,
          claimable: claimable(daily.dailyTask),
          dailyActivity: daily.dailyActivity,
          weeklyActivity: daily.weeklyActivity,
          dailyRewardClaimed: asArray(daily.dailyRewardClaimed),
          resetTime: daily.dailyResetTime,
        }
      : null,
    achievements: achievement
      ? {
          total: asArray(achievement.task).length,
          done: tasksDone(achievement.task).length,
          claimable: claimable(achievement.task),
        }
      : null,
    mainTask: q.MainTaskInfoRequest?.task ? { taskId: q.MainTaskInfoRequest.task.taskId, progress: q.MainTaskInfoRequest.task.progress } : null,
    email: email ? { total: email.total, unclaimed: asArray(email.email).filter((mail) => !mail.got).length } : null,
    buildings: buildings.map((building) => ({
      buildingId: building.buildingId,
      level: building.level,
      auto: building.auto,
      building: building.buildFinishTime ? { start: building.buildStartTime, finish: building.buildFinishTime } : null,
      factory: building.factory ? { autoProductId: building.factory.autoProductId, finished: asArray(building.factory.finishedProducts) } : null,
      product: asArray(building.product?.asset),
    })),
    water: {
      autoProduceEndTime: water.autoProduceEndTime,
      autoProduceForever: water.autoProduceForever,
      autoFarming: water.autoFarming,
      fishingLevel: water.fishingLevel?.level,
      salvageLevel: water.salvageLevel?.level,
      divingLevel: water.divingLevel?.level,
      orderOfTheDay: water.orderOfTheDay ?? null,
    },
    resFields: resFields ? { count: asArray(resFields.fields).length, max: resFields.maxNum } : null,
    fleets: asArray(q.MyFleetsRequest?.fleets).length,
    guild: asArray(q.AllGuildAbstractionRequest?.guilds).map((entry) => ({ id: entry.id, level: entry.level })),
    counters: asArray(q.CounterInfoRequest?.counters),
    recruit: q.RecruitInfoRequest ?? null,
    antiques: q.AllAntiqueRequest ? { count: asArray(q.AllAntiqueRequest.antiques).length, masterLv: q.AllAntiqueRequest.masterLv, suits: asArray(q.AllAntiqueRequest.suits).length } : null,
    pets: asArray(q.AllPetRequest?.pets).length,
    equips: asArray(q.EquipsRequest?.equip).length,
    pirateSweep: pirateSweepView(state),
    pirates: q.AllPirateRequest ? { count: asArray(q.AllPirateRequest.pirates).length, sweepTimes: q.AllPirateRequest.sweepTimes } : null,
    worldBoss: q.WorldBossInfoRequest?.info ?? null,
    season: q.SeasonRankInfoRequest ?? null,
    week: asArray(q.WeekInfoRequest?.activityTime),
    monthCard: monthCard.map((card) => ({ type: card.type, active: card.endTime > now, endTime: card.endTime, gotDailyReward: card.gotDailyReward })),
    guide: q.GuideInfoRequest?.guide ?? null,
    cargo: asArray(q.CargoShipsRequest?.ship).length,
    fish: q.FishEncyclopediaRequest ?? null,
  };
  const failures = state.failed || {};
  const sources = { resources: "AllResourceRequest", items: "AllItemRequest", heroes: "AllHeroRequest", afk: "AfkInfoRequest", clickGold: "AfkInfoRequest", daily: "DailyTaskInfoRequest", achievements: "AchievementInfoRequest", mainTask: "MainTaskInfoRequest", email: "EmailBoxRequest", buildings: "OnWaterRequest", water: "OnWaterRequest", resFields: "MyResFieldsRequest", fleets: "MyFleetsRequest", guild: "AllGuildAbstractionRequest", counters: "CounterInfoRequest", recruit: "RecruitInfoRequest", antiques: "AllAntiqueRequest", pets: "AllPetRequest", equips: "EquipsRequest", pirates: "AllPirateRequest", worldBoss: "WorldBossInfoRequest", season: "SeasonRankInfoRequest", week: "WeekInfoRequest", monthCard: "MonthCardRequest", guide: "GuideInfoRequest", cargo: "CargoShipsRequest", fish: "FishEncyclopediaRequest" };
  for (const [field, name] of Object.entries(sources)) if (Object.hasOwn(failures, name)) view[field] = null;
  if (view.heroes && Object.hasOwn(failures, "GetFormationRequest")) view.heroes.formation = null;
  if (view.heroes && Object.hasOwn(failures, "AppointInfoRequest")) view.heroes.appointed = null;
  view.availability = Object.fromEntries(ENTRY_QUERIES.map(({ name }) => [name, { status: state.outcomes?.[name]?.status || (Object.hasOwn(failures, name) ? "FAILED" : Object.hasOwn(q, name) ? "SUCCESS" : "UNKNOWN"), error: failures[name] ?? null, updatedAt: state.outcomes?.[name]?.updatedAt ?? null }]));
  return view;
}

const clock = (seconds) => (seconds ? new Date(seconds * 1000).toLocaleString() : '-');

// One renderer, shared by the CLI and the console, so both always agree.
export function formatState(view) {
  const unknown = "未知（读取失败）";
  const failed = Object.entries(view.availability || {}).filter(([, item]) => item.status === "FAILED" || item.status === "NOT_EXECUTED").map(([name]) => name);
  view = { ...view, resources: view.resources || [], items: view.items || { kinds: unknown, total: unknown, top: [] }, heroes: view.heroes || { count: unknown, power: unknown, list: [], formation: [] }, buildings: view.buildings || [], water: view.water || {}, guild: view.guild || [], counters: view.counters || [] };
  view.heroes = { ...view.heroes, formation: view.heroes.formation || [] };
  const lines = [];
  lines.push(`资源:`);
  for (const entry of view.resources) lines.push(`  ${entry.name ? `${entry.name} ` : ''}res=${entry.res} amount=${entry.amount}`);
  lines.push(`道具: ${view.items.kinds} 种 / ${view.items.total} 个`);
  for (const item of view.items.top) lines.push(`  ${item.itemId} x${item.num}`);
  lines.push(`英雄: ${view.heroes.count} 个, 总战力 ${view.heroes.power}`);
  for (const hero of view.heroes.list) lines.push(`  ${hero.heroId} lv${hero.level} ${hero.star}星 战力${hero.power}`);
  lines.push(`  上阵: ${view.heroes.formation.map((slot) => `${slot.heroId}(${slot.x},${slot.y})`).join(' ')}`);
  if (view.afk) {
    lines.push(`挂机: 等级${view.afk.level} 开始${clock(view.afk.startTime)} 封顶${clock(view.afk.finishTime)}`);
    lines.push(`  已封顶=${view.afk.capped} 已领等级=${view.afk.rewardedLevel} 待领等级=${view.afk.pendingLevels}`);
  }
  if (view.daily) {
    lines.push(`每日任务: ${view.daily.done}/${view.daily.tasks} 完成, ${view.daily.claimable} 个可领奖, 活跃度 ${view.daily.dailyActivity}`);
    lines.push(`  重置 ${clock(view.daily.resetTime)}`);
  }
  if (view.achievements) lines.push(`成就: ${view.achievements.done}/${view.achievements.total} 完成, ${view.achievements.claimable} 个可领奖`);
  if (view.email) lines.push(`邮件: ${view.email.total} 封, ${view.email.unclaimed} 封未领附件`);
  lines.push(`水上建筑 ${view.buildings.length} 座:`);
  for (const building of view.buildings) {
    const bits = [
      building.level ? `lv${building.level}` : '未建',
      building.auto ? '自动' : '',
      building.building ? `建造中至 ${clock(building.building.finish)}` : '',
      building.factory ? `工厂产出 ${JSON.stringify(building.factory.finished)}` : '',
    ].filter(Boolean);
    lines.push(`  ${building.buildingId} ${bits.join(' ')}`);
  }
  lines.push(`世界: 资源田 ${view.resFields?.count ?? 0}/${view.resFields?.max ?? 0} 舰队 ${view.fleets} 货船 ${view.cargo} 海盗 ${view.pirates?.count ?? 0}`);
  const sweep = view.pirateSweep;
  lines.push('  VIP 等级：'+(sweep?.vipLevel ?? '未知')+'；'+(sweep?.vipLevelStatus==='OBSERVED'?'本次采集的连接观察值':'连接权威未知')+'，仅作为额度组件查看。');
  lines.push(`  野怪扫荡：已用 ${sweep?.usedSweeps ?? '未知'}，总额 ${sweep?.totalSweeps ?? '未知'}，剩余 ${sweep?.remainingSweeps ?? '未知'}；等级关系仅供查看。`);
  lines.push(`  自动生产至 ${clock(view.water.autoProduceEndTime)} 永久=${view.water.autoProduceForever} 自动种植=${view.water.autoFarming}`);
  lines.push(`  钓鱼lv${view.water.fishingLevel ?? '-'} 打捞lv${view.water.salvageLevel ?? '-'} 潜水lv${view.water.divingLevel ?? '-'}`);
  if (view.worldBoss) lines.push(`  世界Boss bossId=${view.worldBoss.bossId} 最高伤害=${view.worldBoss.bestDamage} 已领档位=${view.worldBoss.gotRewardLevel}`);
  lines.push(`公会候选: ${JSON.stringify(view.guild.map((entry) => entry.id))}`);
  lines.push(`每日计数: ${view.counters.map((counter) => `${counter.type}=${counter.num}`).join(' ')}`);
  lines.push(`招募: 英雄${view.recruit?.hero?.recruitTimes ?? '-'}次 下次保底${view.recruit?.hero?.nextLuck ?? '-'} | 藏品${view.recruit?.antique?.recruitTimes ?? '-'}次`);
  lines.push(`藏品 ${view.antiques?.count ?? 0} 件 大师lv${view.antiques?.masterLv ?? '-'} | 宠物 ${view.pets} | 装备 ${view.equips} | 月卡 ${JSON.stringify(view.monthCard)}`);
  lines.push(`新手引导: ${JSON.stringify(view.guide)} | 主线 ${JSON.stringify(view.mainTask)}`);
  if (view.fish) lines.push(`鱼类图鉴: ${JSON.stringify(view.fish)}`);
  const prefixes = { AllResourceRequest: "资源:", OnWaterRequest: "水上建筑", MyResFieldsRequest: "世界:", MyFleetsRequest: "世界:", CargoShipsRequest: "世界:", AllPirateRequest: "世界:", AllGuildAbstractionRequest: "公会候选:", CounterInfoRequest: "每日计数:", RecruitInfoRequest: "招募:", AllAntiqueRequest: "藏品 ", AllPetRequest: "藏品 ", EquipsRequest: "藏品 ", MonthCardRequest: "藏品 " };
  for (const name of failed) {
    const prefix = prefixes[name];
    if (prefix) { const index = lines.findIndex((line) => line.startsWith(prefix)); if (index >= 0) lines[index] = prefix + " " + unknown; }
  }
  if (failed.length) lines.push("读取失败/未执行: " + failed.join(", "));
  return lines.join("\n");
}

