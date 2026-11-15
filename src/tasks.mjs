// 任务领取闭环：主线（成长任务）、支线、成就，以及每日订单的进度档位奖励。
//
// 目标值不靠猜：主线/支线从 MainTaskCfg / BranchTaskCfg 的 params 取，取法逐条对齐客户端
// TaskUtil.taskProgress()（那段 switch 是从游戏自身的 _subpackages_main_ 里读出来的）。
// 算不出目标值的任务不排进计划，只在 notes 里写明，宁可漏领也不乱发请求。
// 成就的响应自带 targetProgress，不需要配置表。
//
// 旧调查保留只读预览；写入仅转交注册Function的当前许可，结算和拒绝/UNKNOWN由原Service持久化。

import { ACTIONS, buildBody } from './actions.mjs';
import { normalize } from './worlds.mjs';
import { observeOrderProgress } from './order-execution.mjs';
import { safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, delegateAuthorizedBatch } from './execution.mjs';

// 客户端 TaskUtil.taskProgress 的第二组：目标值取 params[1]（params[0] 是物品名或类型名）。
const TARGET_FROM_PARAM1 = new Set([
  '拥有指定资源', '获取资源', '生产物品', '种植作物', '占领资源地', '击败野怪',
  '英雄升星', '英雄万能升星', '藏品万能升星', '强化装备', '分解装备', '分解海兽',
]);

function formatDesc(row) {
  if (!row?.desc) return '';
  const params = row.descParams ?? [];
  return row.desc.replace(/\{(\d+)\}/g, (all, i) => (params[Number(i)] ?? all));
}

// 任务目标值。与客户端同款规则，算不出来就返回 null（调用方据此跳过，不猜）。
export function taskTarget(row) {
  const params = row?.params;
  if (!Array.isArray(params) || params.length === 0) return null;
  // 升级建筑：params[1] 形如 "1|1"（数量|等级），客户端取 "|" 前那段。
  if (row.type === '升级建筑') {
    const n = parseInt(String(params[1] ?? '').split('|')[0], 10);
    return Number.isFinite(n) ? n : null;
  }
  // 试炼挑战：客户端把这个类型的目标值写死成 1（通过某副本的某一关）。
  if (row.type === '试炼挑战') return 1;
  const raw = TARGET_FROM_PARAM1.has(row.type) ? params[1] : params[0];
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

const own = (v,k) => {
  const descriptor = v !== null && typeof v === 'object' ? Object.getOwnPropertyDescriptor(v,k) : null;
  return descriptor?.enumerable === true && Object.hasOwn(descriptor,'value');
};
const taskIdKnown = n => Number.isInteger(n) && n > 0 && n <= 2147483647;
const denseTaskList = v => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= 10000 && Reflect.ownKeys(v).length === v.length+1 && Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&own(d,'value'));

// Original achievement parser: signed int64 counts stay exact; protobuf defaults are not facts.
export function achievementProgressCount(value) {
  let n;
  if(typeof value==='number') {if(!Number.isSafeInteger(value)||value<0)return null;n=BigInt(value);}
  else if(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&value.length<=19)n=BigInt(value);
  else if(value&&typeof value==='object'&&!Array.isArray(value)&&own(value,'low')&&own(value,'high')&&own(value,'unsigned')&&value.unsigned===false&&[value.low,value.high].every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647))n=(BigInt(value.high)<<32n)+BigInt(value.low>>>0);
  else return null;
  return n>=0n&&n<(1n<<63n)?String(n):null;
}

// Only the three original Tasks protocols share these semantics. No daily/season identity inference.
export function taskObservation(row, kind) {
  if(!['main','branch','achievement'].includes(kind))return null;
  const key=kind==='achievement'?'id':'taskId', count=kind==='achievement'?achievementProgressCount:safeResourceQuantity;
  return {taskId:own(row,key)&&taskIdKnown(row[key])?row[key]:null,progress:own(row,'progress')?count(row.progress):null,
    ...(kind==='achievement'?{targetProgress:own(row,'targetProgress')?count(row.targetProgress):null}:{}),
    ...(kind!=='branch'?{rewardClaimed:own(row,'rewardClaimed')&&typeof row.rewardClaimed==='boolean'?row.rewardClaimed:null}:{})};
}
export function parseTaskObservation(row, kind) {
  const value=taskObservation(row,kind);
  return value&&value.taskId!==null&&value.progress!==null&&(kind==='branch'||value.rewardClaimed!==null)&&(kind!=='achievement'||value.targetProgress!==null&&BigInt(value.targetProgress)>0n)?value:null;
}
export function taskConfigurationRow(config, kind, taskId) {
  const name={main:'MainTaskCfg',branch:'BranchTaskCfg',achievement:'AchievementTaskCfg'}[kind],rows=config?.tables?.[name]?.data;
  if(!name||!taskIdKnown(taskId)||!denseTaskList(rows)||rows.some(row=>!own(row,'taskId')||!taskIdKnown(row.taskId))||new Set(rows.map(row=>row.taskId)).size!==rows.length)return null;
  return rows.find(row=>row.taskId===taskId)??null;
}

// Progress eligibility only. Inventory, context, period, reward mapping and settlement remain separate.
export function taskQualification(task, target, kind) {
  const known=['main','branch','achievement'].includes(kind)&&own(task,'taskId')&&taskIdKnown(task.taskId);
  const progress=!own(task,'progress')?null:kind==='achievement'?achievementProgressCount(task.progress):safeResourceQuantity(task.progress);
  const required=kind==='achievement'?achievementProgressCount(target):Number.isSafeInteger(target)&&target>0?target:null;
  const completion=known&&progress!==null&&required!==null&&BigInt(required)>0n?(BigInt(progress)>=BigInt(required)?'COMPLETE':'INCOMPLETE'):'UNKNOWN';
  const rewardState=!known?'UNKNOWN':kind==='branch'?'UNCLAIMED':!own(task,'rewardClaimed')?'UNKNOWN':task.rewardClaimed===true?'CLAIMED':task?.rewardClaimed===false?'UNCLAIMED':'UNKNOWN';
  return {completion,rewardState,claimable:completion==='UNKNOWN'||rewardState==='UNKNOWN'?null:completion==='COMPLETE'&&rewardState==='UNCLAIMED'};
}

// A threshold calculation requires explicit counts and one applicable config
// list. Never merge season/worldOpenDays rows; the legacy Tasks read set cannot
// establish that context. Reward identity/period still needs its own contract.
export function nextOrderTier(config, { orderNum, rewardedNum } = {}) {
  const unknown = reason => ({ status: 'UNKNOWN', reason, tier: null, reqNums: [], claimable: false });
  const count = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
  if (!count(orderNum) || !count(rewardedNum)) return unknown('ORDER_COUNTS_UNAVAILABLE');
  const rows = config?.tables?.OrderDailyRewardCfg?.data;
  if (!Array.isArray(rows) || !rows.length) return unknown('ORDER_REWARD_CONFIG_UNAVAILABLE');
  if (rows.some(row => row && ['season','worldOpenDays'].some(key => Object.hasOwn(row,key)))) return unknown('ORDER_REWARD_CONTEXT_UNAVAILABLE');
  if (rows.some(row => !count(row?.reqNum) || row.reqNum === 0)
    || new Set(rows.map(row => row.reqNum)).size !== rows.length) return unknown('ORDER_REWARD_CONFIG_INVALID');
  const reqNums = rows.map(row => row.reqNum).sort((a,b) => a-b);
  if (rewardedNum !== 0 && !reqNums.includes(rewardedNum) || rewardedNum > orderNum) return unknown('ORDER_REWARDED_THRESHOLD_INCONSISTENT');
  const tier = reqNums.find(num => num > rewardedNum) ?? null;
  return { status: 'CALCULATED', reason: null, tier, reqNums, claimable: tier !== null && orderNum >= tier };
}

// 只读探测：把三类任务和每日订单档位都拉一遍，算出每一条能不能领。
export async function surveyTasks(client, protocol, { config = null, water = null, timeout = 8000, signal, stop } = {}) {
  const options = { signal, stop };
  const request = async (...args) => {
    assertExecutionActive(client, options);
    return awaitExecution(client.request(...args), client, options);
  };
  const main = await request('MainTaskInfoRequest', {}, 'MainTaskInfoResponse', timeout);
  const achievement = await request('AchievementInfoRequest', {}, 'AchievementInfoResponse', timeout);
  // 每日订单档位要 OnWaterResponse；调用方手里已经有了就传进来，省一次往返。
  const waterBody = normalize(water ?? (await request('OnWaterRequest', {}, 'OnWaterResponse', timeout)));

  const plan = [], notes = [];
  const observe = (raw,kind,listKnown=true) => {
    const task=taskObservation(raw,kind),row=taskConfigurationRow(config,kind,task?.taskId);
    const target=kind==='achievement'?task?.targetProgress:taskTarget(row);
    const qualification=taskQualification(listKnown?task:null,target,kind);
    const displayCount=value=>typeof value==='string'&&BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):value;
    const view=kind==='achievement'?{id:task?.taskId,progress:displayCount(task?.progress),target:displayCount(target),claimed:task?.rewardClaimed,qualification}:{taskId:task?.taskId,type:row?.type??null,desc:formatDesc(row),progress:task?.progress,target,...(kind==='main'?{claimed:task?.rewardClaimed}:{}),qualification};
    const label=kind==='achievement'?'成就':kind==='main'?'主线':'支线',id=task?.taskId??'未知';
    if(qualification.claimable===null)notes.push(label+' '+id+' 状态未知，跳过');
    else if(qualification.rewardState==='CLAIMED')notes.push(label+' '+id+' 已领过');
    else if(qualification.completion==='INCOMPLETE')notes.push(label+' '+id+' 进度 '+view.progress+'/'+view.target+'，还不能领');
    else {
      const action=kind==='achievement'?ACTIONS.achievementDraw:kind==='main'?ACTIONS.taskDrawMain:ACTIONS.taskDrawBranch;
      plan.push({kind,id:task.taskId,request:action.request,body:buildBody(action,kind==='achievement'?{id:task.taskId}:{taskId:task.taskId}),label:label+' '+task.taskId+(kind==='achievement'?'':' '+view.desc),reward:kind==='achievement'?null:row?.reward??null});
    }
    return view;
  };
  const mainView=own(main,'task')&&main.task!==null?observe(main.task,'main'):null;
  const observeList=(raw,key,kind)=>{
    if(!own(raw,key)||!denseTaskList(raw[key])){notes.push((kind==='branch'?'支线':'成就')+'列表未知，跳过');return [];}
    const ids=raw[key].map(row=>taskObservation(row,kind)?.taskId),known=ids.every(id=>id!==null)&&new Set(ids).size===ids.length;
    return raw[key].map(row=>observe(row,kind,known));
  };
  const branchView=observeList(main,'branch','branch'),achievementView=observeList(achievement,'task','achievement');

  // 每日订单档位奖励：空体请求，服务端按 reqNum 发下一档。
  const progress = observeOrderProgress(config, { orderOfTheDay: waterBody.orderOfTheDay });
  const tier = nextOrderTier(config, { orderNum: progress.completed.value, rewardedNum: progress.rewardedThrough.value });
  const orderView = { orderNum: progress.completed.value, rewardedNum: progress.rewardedThrough.value,
    tier: tier.tier, claimable: tier.claimable, status: tier.status, reason: tier.reason, progress };
  if (tier.status === 'UNKNOWN') notes.push('每日订单：档位资格未知（' + tier.reason + '）；不生成领取计划');
  else if (tier.tier === null) notes.push('每日订单：本配置列表的阈值均已达到，周期及实际奖励归属未证');
  else if (!tier.claimable) notes.push('每日订单：下一配置阈值为 ' + tier.tier + ' 单，观察完成 ' + orderView.orderNum + ' 单');
  else {
    plan.push({ kind: 'orderDaily', id: tier.tier, request: 'GetNextOrderOTDRewardRequest', body: {},
      label: '每日订单 ' + tier.tier + ' 单档位奖励', reward: null });
  }

  return { readOnly:true, executable:false, qualificationScope:'TASK_PROGRESS_ONLY', main: mainView, branch: branchView, achievement: achievementView, orderOfTheDay: orderView, plan, notes };
}

// Compatibility entry: a legacy plan/--yes never authorizes a second write path.
export async function runTasks(client, protocol, survey, options = {}) {
  if (!options.allowMutate) throw new Error('领取任务奖励会改变账号状态，需要 --yes');
  const decorate = row => ({ ...row, step: { kind: row.target?.kind, id: row.target?.taskId, label: row.label ?? '任务奖励' } });
  const results = await delegateAuthorizedBatch(client, { ...options, onStep: row => options.onStep?.(decorate(row)) }, 'executeTaskRewards');
  return results.map(decorate);
}

export function formatTaskPlan(survey) {
  const lines = [];
  const mark = (ok) => (ok ? '可领' : '  ');
  const planned = (kind, id) => (survey.plan ?? []).some((step) => step.kind === kind && step.id === id);
  if (survey.main) {
    const m = survey.main;
    const target = m.target === null ? '?' : m.target;
    lines.push(`${mark(planned('main', m.taskId))} 主线 ${String(m.taskId).padEnd(6)}${m.type ?? ''} ${m.progress}/${target}${m.claimed ? ' 已领' : ''}`);
  }
  for (const b of survey.branch) {
    const target = b.target === null ? '?' : b.target;
    lines.push(`${mark(planned('branch', b.taskId))} 支线 ${String(b.taskId).padEnd(6)}${b.type ?? ''} ${b.progress}/${target}`);
  }
  for (const a of survey.achievement) {
    lines.push(`${mark(planned('achievement', a.id))} 成就 ${String(a.id).padEnd(6)}${a.progress}/${a.target ?? '?'}${a.claimed ? ' 已领' : ''}`);
  }
  const o = survey.orderOfTheDay;
  lines.push(`${mark(o.claimable)} 订单 观察完成 ${o.orderNum ?? '未知'} 单，已领奖阈值 ${o.rewardedNum ?? '未知'}，下一档 ${o.status === 'UNKNOWN' ? '未知' : o.tier ?? '无'}；周期与重置时间未知`);
  for (const note of survey.notes) lines.push(`跳过 ${note}`);
  return lines.join('\n');
}
