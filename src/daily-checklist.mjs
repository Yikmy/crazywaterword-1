// W16: cached facts and eligibility only; writes belong to registered Functions.
import { CHEST_TABLE, claimableDailyTasks, describeDailyTask, planDailyGift } from './dailies.mjs';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (v,k) => object(v) && Object.hasOwn(v,k);
const own = (v,k) => {
  const d = has(v,k) ? Object.getOwnPropertyDescriptor(v,k) : null;
  return d?.enumerable && Object.hasOwn(d,'value') ? d.value : undefined;
};
const dense = v => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= 10000
  && Reflect.ownKeys(v).length === v.length+1 && Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const uint = v => Number.isInteger(v) && v >= 0 && v <= 2147483647;
const positive = v => uint(v) && v > 0;
const count = (v,k) => uint(own(v,k)) ? own(v,k) : null;
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 500 && v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v);
const table = (config,name) => own(own(own(config,'tables'),name),'data');
const list = (v,valid) => dense(v) && v.every(valid) && new Set(v).size === v.length ? [...v] : null;
const labels = { CLAIMED:'已领', ELIGIBLE:'达到门槛', INCOMPLETE:'未达标', UNKNOWN:'未知' };

function source(state,request) {
  const outcome = own(own(state,'outcomes'),request), exact = has(state,'raw');
  const status = own(outcome,'status'), body = own(own(state,exact?'raw':'ok'),request);
  const failed = has(own(state,'failed'),request);
  const successful = !failed && (status === 'SUCCESS' || !has(state,'outcomes') && !exact && object(body));
  const observedAt = own(outcome,'updatedAt');
  return { body:successful && object(body)?body:null, info:{request,response:request.replace(/Request$/,'Response'),
    status:successful&&object(body)?'AVAILABLE':'UNKNOWN',
    reason:failed?'SOURCE_FAILED':status==='SUCCESS'&&!object(body)?'SOURCE_BODY_MISSING':successful&&object(body)?null:'SOURCE_NOT_CONFIRMED',
    observedAt:typeof observedAt==='string'&&Number.isFinite(Date.parse(observedAt))?observedAt:null,
    precision:exact?'DECODED_EXACT':'LEGACY_NORMALIZED'} };
}
function dailyTasks(body,config) {
  const rows = own(body,'dailyTask');
  const validList = dense(rows) && rows.every(row=>positive(own(row,'id'))) && new Set(rows.map(row=>own(row,'id'))).size === rows.length;
  if(!validList)return {status:'UNKNOWN',reason:'DAILY_TASK_LIST_UNKNOWN',rows:[],counts:{total:null,completed:null,claimed:null,eligible:null}};
  const configured=table(config,'DailyTaskCfg'), validConfig=dense(configured)&&configured.every(row=>positive(own(row,'taskId')))&&new Set(configured.map(row=>own(row,'taskId'))).size===configured.length;
  const tasks=rows.map(row=>{
    const taskId=own(row,'id'),progress=count(row,'progress'),target=count(row,'targetProgress'),claimed=own(row,'rewardClaimed');
    const rewardClaimed=typeof claimed==='boolean'?claimed:null;
    const parsed={id:taskId,progress,targetProgress:target,rewardClaimed};
    const known=progress!==null&&target!==null&&target>0&&rewardClaimed!==null;
    const eligible=known?claimableDailyTasks({dailyTask:[parsed]}).length===1:null;
    const status=rewardClaimed===true?'CLAIMED':!known?'UNKNOWN':eligible?'ELIGIBLE':'INCOMPLETE';
    const definition=validConfig?configured.find(r=>own(r,'taskId')===taskId):null;
    const safeDefinition=definition?{taskId,type:text(own(definition,'type'))?own(definition,'type'):String(taskId),desc:text(own(definition,'desc'))?own(definition,'desc'):''}:null;
    const described=describeDailyTask(parsed,{tables:{DailyTaskCfg:{data:safeDefinition?[safeDefinition]:[]}}});
    const activity=count(definition,'point'),experience=count(definition,'exp');
    return {taskId,title:described.title,description:described.desc,progress,targetProgress:target,rewardClaimed,eligible,status,
      configuredReward:activity!==null&&experience!==null?{activity,experience}:null,
      executable:false,blockedReason:'DAILY_TASK_CLAIM_CONTRACT_UNVERIFIED',...(taskId===1010?{functionId:'pirate-sweep'}:{})};
  });
  const complete=row=>row.progress!==null&&row.targetProgress!==null&&row.targetProgress>0;
  return {status:tasks.every(row=>row.eligible!==null)?'AVAILABLE':'PARTIAL',reason:tasks.some(row=>row.eligible===null)?'DAILY_TASK_FIELDS_UNKNOWN':null,rows:tasks,
    counts:{total:tasks.length,completed:tasks.every(complete)?tasks.filter(row=>row.progress>=row.targetProgress).length:null,
      claimed:tasks.every(row=>row.rewardClaimed!==null)?tasks.filter(row=>row.rewardClaimed).length:null,
      eligible:tasks.every(row=>row.eligible!==null)?tasks.filter(row=>row.eligible).length:null}};
}
function rewards(value) {
  // These two existing activity tables contain one flat [itemId, quantity].
  if(!dense(value)||value.length!==2||!text(value[0])||!Number.isSafeInteger(value[1])||value[1]<=0)return null;
  return [{id:value[0],num:value[1]}];
}
function activityView(body,config,kind) {
  const activity=count(body,kind+'Activity'), claimed=list(own(body,kind+'RewardClaimed'),positive);
  const rows=table(config,CHEST_TABLE[kind]),seasons=[1,2,3,4]; // Existing captured activity tables cover four seasons.
  const validConfig=dense(rows)&&rows.length>0&&rows.every(row=>positive(own(row,'id'))&&seasons.includes(own(row,'season'))&&count(row,'activity')!==null)
    &&new Set(rows.map(row=>own(row,'season')+':'+own(row,'id'))).size===rows.length;
  const base={activity,claimed,tiers:[],nextAt:null,complete:null,executable:false,blockedReason:'ACTIVITY_CLAIM_CONTRACT_UNVERIFIED'};
  if(!validConfig)return {...base,status:'UNKNOWN',reason:'ACTIVITY_CONFIG_UNKNOWN'};
  const grouped=new Map();for(const row of rows){const id=own(row,'id');if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(row);}
  const unknownClaim=claimed?.some(id=>!grouped.has(id))??false;
  base.tiers=[...grouped].map(([id,variants])=>{
    const completeSeasons=variants.length===seasons.length&&seasons.every(season=>variants.some(row=>own(row,'season')===season));
    const thresholds=new Set(variants.map(row=>own(row,'activity'))),threshold=completeSeasons&&thresholds.size===1?own(variants[0],'activity'):null;
    const taken=claimed!==null&&!unknownClaim?claimed.includes(id):null;
    const eligible=activity!==null&&threshold!==null&&taken!==null?activity>=threshold&&!taken:null;
    const variantsRewards=variants.map(row=>rewards(own(row,'reward')));
    const rewardKnown=completeSeasons&&variantsRewards.every(r=>r!==null)&&new Set(variantsRewards.map(r=>JSON.stringify(r))).size===1;
    return {id,requiredActivity:threshold,claimed:taken,eligible,status:taken===true?'CLAIMED':eligible===null?'UNKNOWN':eligible?'ELIGIBLE':'INCOMPLETE',
      configuredRewards:rewardKnown?variantsRewards[0]:null,rewardStatus:rewardKnown?'AVAILABLE':'UNKNOWN',rewardReason:rewardKnown?null:!completeSeasons?'SEASON_CONFIG_INCOMPLETE':variantsRewards.some(r=>r===null)?'REWARD_CONFIG_INVALID':'SEASON_REWARD_AMBIGUOUS',
      executable:false,blockedReason:'ACTIVITY_CLAIM_CONTRACT_UNVERIFIED'};
  }).sort((a,b)=>a.id-b.id);
  const known=base.tiers.every(row=>row.eligible!==null);
  base.complete=known?base.tiers.every(row=>row.claimed):null;
  const pending=base.tiers.filter(row=>row.claimed===false&&row.eligible===false);
  base.nextAt=known&&pending.length?Math.min(...pending.map(row=>row.requiredActivity)):null;
  return {...base,status:known?'AVAILABLE':'PARTIAL',reason:known?null:unknownClaim?'CLAIMED_TIER_UNRECOGNIZED':'ACTIVITY_FIELDS_OR_THRESHOLDS_UNKNOWN'};
}
function giftView(body) {
  const drawn=list(own(body,'drawnPack'),text),heroId=own(body,'heroId'),resetMarker=count(body,'resetTime');
  const known=drawn!==null&&text(heroId),gift=known?planDailyGift({drawnPack:drawn,heroId,resetTime:resetMarker}):null;
  return {packId:'赠礼',heroId:text(heroId)?heroId:null,drawn,resetMarker,eligible:gift?.freeAvailable??null,
    status:known?gift.freeAvailable?'ELIGIBLE':'CLAIMED':'UNKNOWN',reason:known?null:'DAILY_GIFT_STATE_UNKNOWN',
    executable:false,blockedReason:'FREE_GIFT_CLAIM_CONTRACT_UNVERIFIED'};
}
export function dailyChecklist(state,{config=null}={}) {
  const daily=source(state,'DailyTaskInfoRequest'),gift=source(state,'DailyGiftPackRequest');
  return {readOnly:true,tasks:dailyTasks(daily.body,config),activity:{daily:activityView(daily.body,config,'daily'),weekly:activityView(daily.body,config,'weekly')},
    gift:giftView(gift.body),resetMarker:count(daily.body,'dailyResetTime'),sources:{daily:daily.info,gift:gift.info},
    note:'门槛资格来自本账号缓存；重置字段保留原值。领取仍需精确周期、奖励及权威复核合同。'};
}
export function formatDailyChecklist(view) {
  const known=v=>v??'未知',c=view.tasks.counts;
  return ['每日任务：'+known(c.completed)+'/'+known(c.total)+' 完成，'+known(c.eligible)+' 项达到领奖门槛',
    '每日活跃 '+known(view.activity.daily.activity)+'；每周活跃 '+known(view.activity.weekly.activity),
    '免费赠礼：'+labels[view.gift.status],view.note].join('\n');
}
