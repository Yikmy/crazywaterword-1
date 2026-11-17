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

import { freeGoldLimit, freeGoldRemaining } from './free-gold.mjs';
import { freeRecruitReadiness, heroRecruitCosts } from './free-recruit.mjs';
import { observeAfkIncome } from './afk-level-rewards.mjs';
import { nextTrialStage } from './trial-challenge.mjs';
import { normalize } from './worlds.mjs';
import { ACTIONS, buildBody, buildDailyDriverBody, FREE_DAILY_PACK_ID } from './actions.mjs';
import { RESOURCE_NAMES, safeResourceQuantity, stockFromResponses } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, delegateAuthorizedBatch } from './execution.mjs';

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
// 无赛季的旧预览仅展示观察值；实际领取使用同一权威配置定义绑定赛季、单档和奖励。
// Shared domain rules: observations may omit period/config, executable adapters may not.
const rewardOwn=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const rewardPositive=v=>Number.isInteger(v)&&v>0&&v<=2147483647;
const rewardText=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const rewardDense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
export function configuredRewardSeason(rows,season,key) {
 if(!rewardPositive(season)||!rewardDense(rows)||!rows.length)return null;
 const seen=new Set();let last=0;
 for(const row of rows){if(!rewardOwn(row,'season')||!rewardPositive(row.season)||row.season<last||!rewardOwn(row,key)||(key==='id'?!rewardPositive(row[key]):!rewardText(row[key]))||seen.has(row.season+':'+row[key]))return null;last=row.season;seen.add(row.season+':'+row[key]);}
 const configuredSeason=Math.max(0,...rows.filter(row=>row.season<=season).map(row=>row.season));
 return configuredSeason?{configuredSeason,rows:rows.filter(row=>row.season===configuredSeason)}:null;
}
export function activityRewardDefinition(config,{worldId,tierId}={}){
 const rows=config?.tables?.DailyActivityRewardCfg?.data,itemRows=config?.tables?.ItemCfg?.data;
 if(!rewardDense(rows)||!rows.length||!rewardDense(itemRows))return null;
 let season;try{season=Number(BigInt(worldId)/1000000n%1000n);}catch{return null;}
 if(!rewardPositive(season))return null;
 const selected=configuredRewardSeason(rows,season,'id');if(!selected)return null;
 const current=selected.configuredSeason,tiers=selected.rows,row=tiers.find(row=>row.id===tierId);
 if(!row||!rewardOwn(row,'activity')||!rewardPositive(row.activity)||!rewardOwn(row,'reward')||!rewardDense(row.reward)||row.reward.length!==2||!rewardText(row.reward[0])||!Number.isSafeInteger(row.reward[1])||row.reward[1]<=0)return null;
 const id=row.reward[0],items=itemRows.filter(r=>rewardOwn(r,'id')&&r.id===id);
 if(!Object.values(RESOURCE_NAMES).includes(id)&&(items.length!==1||!rewardOwn(items[0],'type')||!rewardText(items[0].type)||!['通用','随机包'].includes(items[0].type)))return null;
 return {season,configuredSeason:current,tierId,requiredActivity:row.activity,rewards:[{id,num:row.reward[1]}],tierIds:tiers.map(r=>r.id)};
}
export function dailyGiftDefinition(config,{worldId}={}){
 const rows=config?.tables?.DailyChargeGiftPackCfg?.data;if(!rewardDense(rows)||!rows.length)return null;
 let season;try{season=Number(BigInt(worldId)/1000000n%1000n);}catch{return null;}if(!rewardPositive(season))return null;
 const selection=configuredRewardSeason(rows,season,'packId');if(!selection)return null;
 const selected=selection.configuredSeason,row=selection.rows.find(r=>r.packId===FREE_DAILY_PACK_ID);
 if(!row||!['price','fragNum'].every(k=>rewardOwn(row,k)&&row[k]===0)||!rewardOwn(row,'guildPack')||!rewardDense(row.guildPack)||row.guildPack.length||!rewardOwn(row,'reward')||!rewardDense(row.reward)||row.reward.length!==1||!rewardDense(row.reward[0])||row.reward[0].length!==2||row.reward[0][0]!=='RUBY'||!Number.isSafeInteger(row.reward[0][1])||row.reward[0][1]<=0)return null;
 return {season,configuredSeason:selected,rewards:[{id:'RUBY',num:row.reward[0][1]}]};
}

function validClaimedTiers(claimed) {
  return Array.isArray(claimed) && claimed.every((id) => Number.isSafeInteger(id) && id > 0);
}
function validChestRow(row) {
  return Number.isSafeInteger(row?.id) && row.id > 0 && Number.isSafeInteger(row.activity) && row.activity >= 0;
}
export function activityTierAvailable(row,activity,claimed) {
  return validChestRow(row) && Number.isSafeInteger(activity) && activity >= 0
    && validClaimedTiers(claimed) && !claimed.includes(row.id) && activity >= row.activity;
}
export function chestTiers(config, { kind = 'daily', activity = null, claimed = [], season = null } = {}) {
  if (!['daily', 'weekly'].includes(kind) || !Number.isSafeInteger(activity) || activity < 0 || !validClaimedTiers(claimed)) return [];
  const rows = config?.tables?.[CHEST_TABLE[kind]]?.data ?? [];
  if (!Array.isArray(rows)) return [];
  const use = season == null ? rows : configuredRewardSeason(rows,season,'id')?.rows ?? [];
  const byId = new Map();
  for (const row of use) {
    if (!activityTierAvailable(row, activity, claimed)) continue;
    if (!byId.has(row.id)) byId.set(row.id, { id: row.id, activity: row.activity, reward: row.reward });
  }
  return [...byId.values()].sort((a, b) => a.activity - b.activity);
}

// 从一次 DailyTaskInfoResponse 算出要发的两个请求。两个都没有可领档位时返回空动作表。
export function planChests(daily, config, { season = null } = {}) {
  const state = (activityField, claimedField) => {
    const activity = explicitCount(daily, activityField);
    const claimed = daily?.[claimedField];
    const known = activity !== null && validClaimedTiers(claimed);
    return { activity, claimed: validClaimedTiers(claimed) ? claimed : [], status: known ? 'known' : 'unknown' };
  };
  const day = state('dailyActivity', 'dailyRewardClaimed');
  const week = state('weeklyActivity', 'weeklyRewardClaimed');
  const dailyTiers = day.status === 'known' ? chestTiers(config, { ...day, kind: 'daily', season }) : [];
  const weeklyTiers = week.status === 'known' ? chestTiers(config, { ...week, kind: 'weekly', season }) : [];
  const actions = [];
  if (dailyTiers.length > 0) {
    actions.push({
      request: ACTIONS.dailyRewardDraw.request,
      costs: [],
      body: buildBody(ACTIONS.dailyRewardDraw, { index: dailyTiers.map((tier) => tier.id) }),
      response: null,
      cost: '无',
      note: `领日常活跃宝箱 第 ${dailyTiers.map((tier) => tier.id).join('/')} 档（活跃度 ${day.activity}）`,
    });
  }
  if (weeklyTiers.length > 0) {
    actions.push({
      request: ACTIONS.weeklyRewardDraw.request,
      body: buildBody(ACTIONS.weeklyRewardDraw, { index: weeklyTiers.map((tier) => tier.id) }),
      response: null,
      cost: '无',
      note: `领周活跃宝箱 第 ${weeklyTiers.map((tier) => tier.id).join('/')} 档（活跃度 ${week.activity}）`,
    });
  }
  return {
    daily: { ...day, tiers: dailyTiers, nextAt: nextThreshold(config, 'daily', { ...day, season }) },
    weekly: { ...week, tiers: weeklyTiers, nextAt: nextThreshold(config, 'weekly', { ...week, season }) },
    actions,
  };
}

// 下一档的门槛，界面上用来解释「为什么现在没得领」。
function nextThreshold(config, kind, { activity = null, claimed = [], status, season = null } = {}) {
  if (status === 'unknown' || !Number.isSafeInteger(activity) || activity < 0 || !validClaimedTiers(claimed)) return null;
  const rows = config?.tables?.[CHEST_TABLE[kind]]?.data ?? [];
  if (!Array.isArray(rows)) return null;
  const use = season == null ? rows : configuredRewardSeason(rows,season,'id')?.rows ?? [];
  return use
    .filter((row) => validChestRow(row) && !claimed.includes(row.id) && row.activity > activity)
    .reduce((min, row) => (min == null || row.activity < min ? row.activity : min), null);
}

// ---- 每日精选的免费礼包 -------------------------------------------------------

// 「每日精选」面板每天有一档免费赠礼，领走的是 GotFreeDailyPackRequest{packId:"赠礼"}。
// packId 是客户端硬编码的字符串，服务端状态在 DailyGiftPackResponse.drawnPack 里；
// resetTime 保留为服务端原样标记；未闭合单位与日界合同，不据此安排重领。
//
// 面板里另外三个（礼包1/2/3）要走充值，"合并礼包" 要先买过前三个才可领，都不在本工具范围内。
// Shared read-only identity/list observation; no period, authorization or settlement is inferred.
export function dailyGiftObservation(response) {
  const field=key=>{const d=response!==null&&typeof response==='object'&&!Array.isArray(response)?Object.getOwnPropertyDescriptor(response,key):null;return d?.enumerable&&Object.hasOwn(d,'value')?d.value:undefined;};
  const id=field('heroId'),raw=field('drawnPack');
  const validText=v=>rewardText(v)&&!/[\u0000-\u001f\u007f]/.test(v);
  const heroId=validText(id)?id:null;
  const drawnPack=rewardDense(raw)&&raw.every(validText)&&new Set(raw).size===raw.length?[...raw]:null;
  return {heroId,drawnPack,freeAvailable:heroId!==null&&drawnPack!==null?!drawnPack.includes(FREE_DAILY_PACK_ID):null};
}
export function planDailyGift(response) {
  // The real codec initializes omitted repeated fields to explicit empty lists.
  const observation=dailyGiftObservation(response),drawn=observation.drawnPack;
  const known=observation.freeAvailable!==null,available=observation.freeAvailable===true;
  return {
    drawn: known ? drawn : null,
    status: known ? available ? 'ready' : 'done' : 'unknown',
    freeAvailable: known ? available : null,
    resetTime: Object.getOwnPropertyDescriptor(response ?? {},'resetTime')?.value ?? null,
    actions: available
      ? [{
        request: ACTIONS.freeDailyPackDraw.request,
        costs: [],
        body: buildBody(ACTIONS.freeDailyPackDraw),
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
// Daily protocol rows use explicit int32 fields; period and reward settlement are separate.
export function dailyTaskObservation(row) {
  const field=key=>{
    const descriptor=row!==null&&typeof row==='object'&&!Array.isArray(row)?Object.getOwnPropertyDescriptor(row,key):null;
    return descriptor?.enumerable&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;
  };
  const count=(key,positive=false)=>{const value=field(key);return Number.isInteger(value)&&value>=(positive?1:0)&&value<=2147483647?value:null;};
  const claimed=field('rewardClaimed');
  return {taskId:count('id',true),progress:count('progress'),targetProgress:count('targetProgress',true),rewardClaimed:typeof claimed==='boolean'?claimed:null};
}
// Preserve the original rows; duplicate or incomplete identities cannot form a task list.
export function dailyTaskRows(body) {
  const descriptor=body!==null&&typeof body==='object'?Object.getOwnPropertyDescriptor(body,'dailyTask'):null;
  const rows=descriptor?.enumerable&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
  return rewardDense(rows)&&rows.every(row=>dailyTaskObservation(row).taskId!==null)&&new Set(rows.map(row=>dailyTaskObservation(row).taskId)).size===rows.length?rows:null;
}
export function parseDailyTaskObservation(row) {
  const task=dailyTaskObservation(row);
  return Object.values(task).some(value=>value===null)?null:task;
}
// Progress observations never prove period validity, authority, reward mapping or settlement.
export function dailyTaskQualification(row) {
  const task=dailyTaskObservation(row),known=task.taskId!==null;
  const completion=!known||task.progress===null||task.targetProgress===null?'UNKNOWN':task.progress>=task.targetProgress?'COMPLETE':'INCOMPLETE';
  const rewardState=!known||task.rewardClaimed===null?'UNKNOWN':task.rewardClaimed?'CLAIMED':'UNCLAIMED';
  return {completion,rewardState,claimable:completion==='UNKNOWN'||rewardState==='UNKNOWN'?null:completion==='COMPLETE'&&rewardState==='UNCLAIMED'};
}

// This preview is progress eligibility only; the Function separately requires a current daily period.
export function claimableDailyTasks(daily) {
  return (dailyTaskRows(daily)??[]).filter(row=>dailyTaskQualification(row).claimable===true);
}

function configuredCount(config, name) {
  const matches = (config?.tables?.OfflineParamCfg?.data ?? []).filter((row) => row.paramName === name);
  return matches.length === 1 ? explicitCount(matches[0], 'paramValue') : null;
}

// 每个驱动声明它要的只读前置请求，框架统一批量取一遍。
export const DAILY_DRIVERS = {
  1002: {
    id: 1002, functionId:"free-recruit", actionTypes:["CLAIM","RECRUIT"],
    title: '招募英雄',
    probes: [['RecruitInfoRequest', {}]],
    evaluate({ task, probe, items, now }) {
      const info = probe('RecruitInfoRequest')?.hero;
      const remaining = Math.max(0, task.targetProgress - task.progress);
      if (remaining === 0) return { status: 'done' };
      const freeEnd = explicitCount(info, 'freeEndTimeSeconds');
      if (freeEnd === null || !Number.isFinite(now) || now < 0) return { status: 'unknown', reason: '免费招募状态缺失或不可靠' };
      const actions = [];
      // RecruitWay: 1=免费 2=单抽 3=十连 4=五十连 5=广告；单抽花 1 张抽卡券。
      if (freeRecruitReadiness(freeEnd,{earliestMs:now*1000,latestMs:now*1000}) === 'READY_BY_CLOCK') {
        actions.push({ request: 'RecruitStartRequest', body: buildDailyDriverBody('RecruitStartRequest',{way:1}), response: 'RecruitStartResponse', costs: heroRecruitCosts(1), cost: '免费次数', note: '免费招募' });
      }
      const ticketCosts = heroRecruitCosts(2), ticketCost = ticketCosts[0];
      const tickets = items instanceof Map ? safeResourceQuantity(items.has(ticketCost.id) ? items.get(ticketCost.id) : 0) : null;
      const singles = tickets === null ? 0 : Math.min(remaining - actions.length, Math.floor(tickets / ticketCost.num));
      for (let i = 0; i < singles; i += 1) {
        actions.push({ request: 'RecruitStartRequest', body: buildDailyDriverBody('RecruitStartRequest',{way:2}), response: 'RecruitStartResponse', costs: heroRecruitCosts(2), cost: `${ticketCost.id} x${ticketCost.num}`, note: '单抽' });
      }
      if (actions.length === 0) {
        if (tickets === null) return { status: 'unknown', reason: '招募券库存缺失或不可靠' };
        return { status: 'blocked', reason: `免费次数未好，且没有${ticketCost.id}（需要 ${remaining} 次）` };
      }
      if (actions.length < remaining) {
        return { status: 'partial', reason: `只有 ${actions.length}/${remaining} 次可做`, actions };
      }
      return { status: 'ready', actions };
    },
  },

  1003: {
    id: 1003, functionId:"stage", actionTypes:["RUN_MAINLINE"],
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
    id:1004, functionId:'afk-level-rewards', actionTypes:['INCOME'], title:'领取挂机收益', probes:[['AfkInfoRequest',{}]],
    evaluate({task,afkIncome}) {
      if(task.progress>=task.targetProgress)return {status:'done'};
      if(!afkIncome||afkIncome.status==='UNKNOWN')return {status:'unknown',reason:afkIncome?.reason??'AFK_INCOME_OBSERVATION_UNKNOWN',actions:[]};
      if(afkIncome.status!=='READY_BY_CLOCK')return {status:'waiting',reason:'普通收益至少经过61秒；尚需 '+afkIncome.remainingSeconds+' 秒，不要求整段到期',actions:[]};
      return {status:'ready',functionId:'afk-level-rewards',parameters:afkIncome.parameters,qualificationScope:'TIME_ONLY',reason:'仅时钟条件已满足；须按明确原区间重新调查库存、配置与资格，预览并单次授权',actions:[{request:ACTIONS.afkDraw.request,body:buildBody(ACTIONS.afkDraw),response:ACTIONS.afkDraw.response,costs:[],cost:'无',note:'普通挂机本段收益；不证明日常完成或到账'}]};
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
    id: 1006, functionId:"free-gold", actionTypes:["CLAIM"],
    title: '点金次数',
    probes: [['ClickGoldInfoRequest', {}]],
    evaluate({ task, probe, config, ruby }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const info = probe('ClickGoldInfoRequest')?.info;
      const freeTimes = explicitCount(info, 'freeTimes');
      const freeMax = freeGoldLimit(config);
      if (freeTimes === null || freeMax === null || freeTimes > freeMax) return { status: 'unknown', reason: '免费点金次数或配置缺失、无效' };
      const remaining = task.targetProgress - task.progress;
      // 免费次数上限来自 OfflineParamCfg.免费点金次数，付费单价来自 点金价格（单位钻石）。
      const freeLeft = freeGoldRemaining(freeTimes,freeMax);
      if (freeLeft > 0) {
        // 免费点金客户端永远是 times:1 一次一发，服务端不接受免费模式下的多连。
        const count = Math.min(freeLeft, remaining);
        const actions = [];
        for (let i = 0; i < count; i += 1) {
          actions.push({ request: 'ClickGoldRequest', body: buildDailyDriverBody('ClickGoldRequest',{times:1,free:true}), response: 'ClickGoldResponse', costs: [], cost: '免费次数', note: '免费点金 x1' });
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
        actions: [{ request: 'ClickGoldRequest', body: buildDailyDriverBody('ClickGoldRequest',{times:remaining,free:false}), response: 'ClickGoldResponse', cost: `${RESOURCE_RUBY} x${price * remaining}`, note: '付费点金' }],
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
    id: 1008, functionId:"fleet", actionTypes:["cargoFill"],
    title: '累计贸易次数',
    probes: [['CargoShipsRequest', {}]],
    evaluate({ task }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      return { status: 'blocked', functionId: 'fleet', reason: '港口货轮可经统一执行明确单船单格装货；不补购缺料，日常完成及领奖须独立核实' };
    },
  },

  1009: {
    id: 1009, functionId:"trial-challenge", actionTypes:["CHALLENGE"],
    title: '累计试炼挑战',
    probes: [['TrialRaidInfoRequest', { raidId: 1 }]],
    evaluate({ task, probe, config, player }) {
      if (task.progress >= task.targetProgress) return { status: 'done' };
      const raid = probe('TrialRaidInfoRequest')?.raid;
      if (!raid) return { status: 'blocked', reason: '拿不到试炼副本信息' };
      // passedStage 是已通过的 stageId；复用原首通合同，不能将关卡ID当作stageLevel。
      const stages = (config?.tables?.TrialRaidStageCfg?.data ?? [])
        .filter((row) => row.raidId === raid.raidId)
        .sort((a, b) => a.stageLevel - b.stageLevel);
      const progression = nextTrialStage(stages, explicitCount(raid, 'passedStage'));
      if (!progression.known) return { status: 'unknown', reason: '试炼已通关ID或配置不可靠' };
      const next = progression.stage;
      if (!next) return { status: 'blocked', reason: '这个试炼副本已经全通' };
      const level = player?.level ?? 1;
      if ((next.openLevel ?? 0) > level) {
        return { status: 'blocked', reason: `试炼副本需要玩家等级 ${next.openLevel}，当前 ${level}` };
      }
      return {
        status: 'ready',
        actions: [{ request: 'TrialRaidChallengeRequest', body: buildDailyDriverBody('TrialRaidChallengeRequest',{raidId:raid.raidId,stageId:next.stageId}), response: 'TrialRaidChallengeResponse', costs: [], cost: '挑战次数', note: `英雄经验副本第 ${next.stageLevel} 关` }],
      };
    },
  },

  1010: {
    id: 1010, functionId:"pirate-sweep", actionTypes:["SWEEP"],
    title: '累计击败野怪',
    probes: [],
    evaluate({ task }) {
      return task.progress >= task.targetProgress
        ? { status: 'done' }
        : { status: 'blocked', functionId: 'pirate-sweep', reason: '请在海面扫荡中核验今日额度并单项授权' };
    },
  },

  1011: { id: 1011, title: '累计联盟情报', probes: [['TradeGuildRadarRequest', {}]], evaluate: lockedReason('联盟情报（雷达）') },
  1012: { id: 1012, functionId:"alliance", actionTypes:["finishOrder"], title: '累计联盟订单', probes: [['GuildCityInfoRequest', {}]], evaluate: taskFunctionRequired('alliance','请明确城市ID，经原联盟订单Function重新调查、计划和单次授权；任务进度及领奖独立核实') },
  1013: { id: 1013, title: '累计联盟互助', probes: [['GuildAidListRequest', { type: 0 }]], evaluate: lockedReason('联盟互助') },
  1014: { id: 1014, title: '累计请求帮助', probes: [], evaluate: lockedReason('联盟求助') },
  1015: { id: 1015, title: '城战获得功勋', probes: [], evaluate: lockedReason('城战（20:00-21:00 限时）') },
  1016: { id: 1016, functionId:"museum", actionTypes:["startExplore"], title: '博物馆探险', probes: [['MuseumInfoRequest', {}]], evaluate: taskFunctionRequired('museum','请明确关卡、英雄与倍率，经原探险出发Function重新调查、计划和单次授权；出发不证明完成或领奖') },
  1017: { id: 1017, title: '参与积分赛', probes: [['LeagueInfoRequest', {}]], evaluate: lockedReason('跨服积分赛') },
};

function taskFunctionRequired(functionId,reason) {
 return ({task})=>task.progress>=task.targetProgress?{status:'done',actions:[]}:{status:'blocked',functionId,reason,actions:[]};
}
// Compatibility accepts only concrete actions already used by daily declarations.
// Exact permits, fresh plans and settlement remain in the original Service.
export function dailyDriverAllowsOperation(operation) {
 return Object.values(DAILY_DRIVERS).some(driver=>driver.functionId===operation?.module&&driver.actionTypes?.includes(operation.actionType))
  &&(operation.module!=='free-recruit'||!Object.hasOwn(operation.parameters??{},'recruit')||operation.parameters.recruit==='hero')
  &&(operation.module!=='afk-level-rewards'||operation.parameters?.action==='income');
}
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
  const afkSourceContext=observeAfkIncome(client,null,player).context;
  const query = (name, body, response, duration = timeout) => dailyQuery(client, name, body, response, { ...options, timeout: duration });
  const daily = await query('DailyTaskInfoRequest', {}, 'DailyTaskInfoResponse', timeout);
  const rows=dailyTaskRows(daily),validList=rows!==null;
  const tasks=(validList?rows:[]).map(row=>{
    // Preserve unknown data fields without invoking accessors or inheriting protobuf defaults.
    const data=Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(row)).filter(([,descriptor])=>descriptor.enumerable&&Object.hasOwn(descriptor,'value')).map(([key,descriptor])=>[key,descriptor.value]));
    return {task:describeDailyTask(data,config),qualification:dailyTaskQualification(row)};
  });
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
  const afkIncome=observeAfkIncome(client,probe('AfkInfoRequest'),player,afkSourceContext);
  const evaluations = [];
  for (const {task,qualification} of tasks) {
    if(qualification.completion==='UNKNOWN'){evaluations.push({task,qualification,status:'unknown',reason:'任务进度或目标未知，未生成驱动建议',actions:[]});continue;}
    if (qualification.completion==='COMPLETE') {
      evaluations.push({ task, qualification, status: 'done', actions: [] });
      continue;
    }
    const driver = DAILY_DRIVERS[task.id];
    if (!driver) {
      evaluations.push({ task, qualification, status: 'unknown', reason: '没有对应的驱动' });
      continue;
    }
    const failedProbe = (driver.probes ?? []).find(([name]) => probeFailures.has(name));
    if (failedProbe) {
      evaluations.push({ task, qualification, status: 'unknown', reason: probeFailures.get(failedProbe[0]), actions: [] });
      continue;
    }
    let verdict;
    try {
      verdict = normalize(driver.evaluate({ task, probe, items, ruby, now, config, player, afkIncome }));
    } catch (error) {
      verdict = { status: 'error', reason: error.message };
    }
    evaluations.push({ task, ...verdict, qualification });
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
  return { readOnly:true, executable:false, qualificationScope:'TASK_PROGRESS_ONLY', taskListStatus:validList?'OBSERVED':'UNKNOWN', taskListReason:validList?null:'DAILY_TASK_LIST_UNKNOWN', daily, tasks: evaluations, chests: planChests(daily, config), gift, ruby, config, player };
}

async function dailyQuery(client, name, body, response, options, mutate = false) {
  assertExecutionActive(client, options);
  return awaitExecution(client.request(name, body, response, options.timeout ?? 15000, { mutate, signal: options.signal }), client, options);
}

export async function runDailies(client, protocol, survey, options = {}) {
  if (!options.allowMutate) throw new Error('完成日常会改变账号状态，需要 --yes');
  return delegateAuthorizedBatch(client, options, 'executeDailyDriver');
}

// Compatibility entry: execution and final verification belong to the existing Service.
// A legacy --yes flag or a preview is never a replacement for its exact single-use permit.
export async function claimDailies(client, protocol, options = {}) {
  if (!options.allowMutate) throw new Error('领取日常奖励会改变账号状态，需要 --yes');
  return delegateAuthorizedBatch(client, options, 'executeDailyRewards');
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
  if(survey.taskListStatus==='UNKNOWN')lines.push('每日任务列表未知，未生成驱动建议');
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
