// W16 / BIZ-D18 / BIZ-D19 sub-contract of the existing task-rewards Function.
import { createHash } from 'node:crypto';
import { achievementProgressCount } from './tasks.mjs';
import { readOpenRankActivitySnapshot } from './client.mjs';
import { ACTIONS, buildBody, buildOpenRankTaskRewardBody, FREE_DAILY_PACK_ID } from './actions.mjs';
import { activityRewardDefinition, activityTierAvailable, dailyGiftDefinition, dailyGiftObservation, dailyTaskRows, parseDailyTaskObservation } from './dailies.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, RESOURCE_NAMES, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';
const moduleId='task-rewards',request='DrawDailyTaskRewardRequest',response='DrawDailyTaskRewardResponse',scope={kind:'ACCOUNT'};
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647,positive=v=>uint(v)&&v>0;
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const sources={daily:'DailyTaskInfoResponse',items:'AllItemResponse',resources:'AllResourceResponse'},configNames=['DailyTaskCfg'],liveFacts=new WeakMap();
export const OPEN_RANK_TASK_KINDS=Object.freeze(['open-rank-order','open-rank-stage','open-rank-pirate','open-rank-war']);
const openRankSpecs=Object.freeze({'open-rank-order':{type:1,table:'OpenRankOrderTaskCfg',label:'开服订单',seasonal:false},'open-rank-stage':{type:2,table:'OpenRankStageTaskCfg',label:'开服闯关',seasonal:false},'open-rank-pirate':{type:3,table:'OpenRankPirateTaskCfg',label:'开服剿匪',seasonal:true},'open-rank-war':{type:4,table:'OpenRankWarTaskCfg',label:'开服战争',seasonal:true}});
const isOpenRank=p=>OPEN_RANK_TASK_KINDS.includes(p?.kind),openRankSpec=p=>isOpenRank(p)?openRankSpecs[p.kind]:null;
const weeklyKinds=['weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task'];
const weekSpec=p=>p?.kind==='weekly-unique-lottery-gift'?{type:7,table:'WeekUniquePackCfg',info:'WeekUniqueLotteryResponse',request:'GotUniqueLotteryFreeRequest',coin:'周翻牌币',label:'周翻牌',unique:true}:['weekly-chip-gift','weekly-chip-task'].includes(p?.kind)?{type:6,table:'WeekChipPackCfg',info:'WeekChipInfoResponse',request:'WeekChipGotFreeRequest',coin:'白芯片宝箱',label:'周芯片',unique:false,chip:true}:{type:4,table:'WeekLotteryPackCfg',info:'WeekLotteryInfoResponse',request:'WeekLotteryFreePackRequest',coin:'周转盘币',label:'周转盘',unique:false};
const configNamesFor=p=>p?.kind==='weekly-battle-pass-task'?['WeekPassTaskCfg']:isOpenRank(p)?[openRankSpec(p).table,'ItemCfg']:p?.kind==='weekly-chip-task'?['WeekChipPointsCfg','WeekChipPeriodCfg','ItemCfg']:weeklyKinds.includes(p?.kind)?[weekSpec(p).table]:p?.kind==='daily-gift'?['DailyChargeGiftPackCfg']:p?.kind==='daily-activity'?['DailyActivityRewardCfg','ItemCfg']:configNames;
const sourcesFor=p=>p?.kind==='weekly-battle-pass-task'?{daily:'WeekBattlePassInfoResponse',week:'WeekInfoResponse'}:isOpenRank(p)?{daily:'OpenRankInfoResponse',items:sources.items,resources:sources.resources}:weeklyKinds.includes(p?.kind)?{daily:weekSpec(p).info,week:'WeekInfoResponse',items:sources.items,resources:sources.resources}:p?.kind==='daily-gift'?{daily:'DailyGiftPackResponse',items:sources.items,resources:sources.resources}:sources;
const costSource='Fixed v76 DailyTaskItem._gotReward/_buildExpReward and DailyTaskModel.increaseActivity: exact task id, configured EXP and typed activity delta to both daily and weekly counters';
export const DAILY_TASK_REWARD_EVIDENCE=Object.freeze({source:'Fixed v76 main/game.js DailyTaskItem.ts / DailyTaskModel.ts / DailyTaskPanel.ts',itemByte:1642263,itemSha256:'322c2df607970618ba59f1f29f53a86cfa219c292c89870604eeb4bdce2bbd65',modelByte:1646749,modelSha256:'8cd26d52987707fbf81ff6f5513728f6bcccbcf604ee54c1fd59965acb868075',semantics:'dailyResetTime is server seconds; activity response is an increment for both daily and weekly; EXP from DailyTaskCfg.exp',realGame:'REAL_UNVERIFIED'});
function roleId(v) {
 if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<=0))return null;
 const n=toSnapshotJson(v);
 if(!(typeof n==='number'||typeof n==='string'&&/^[1-9][0-9]*$/.test(n)))return null;
 try{return BigInt(n)>0n&&BigInt(n)<(1n<<63n)?String(n):null;}catch{return null;}
}
function contextOf(client,player) {
 const c=client.factContext,role=k=>{const id=own(player,k)?roleId(player[k]):null;return own(c,k)&&roleId(c[k])!==id?null:id;};
 return {accountId:text(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId')};
}


function clockOf(client,context) {
 let c;try{c=client.gameClock?.read(context);}catch{return null;}
 if(c?.status!=='TRUSTED'||c.reliable!==true||c.source!=='PingResponse.serverTimestamp'||c.accountId!==context.accountId||c.generation!==context.generation||!['earliestMs','nowMs','latestMs'].every(k=>own(c,k)&&Number.isFinite(c[k])&&c[k]>=0&&c[k]<=Number.MAX_SAFE_INTEGER)||c.earliestMs>c.nowMs||c.nowMs>c.latestMs)return null;
 return {earliestMs:c.earliestMs,nowMs:c.nowMs,latestMs:c.latestMs};
}

function parseDaily(raw){
 const keys=['dailyActivity','weeklyActivity','dailyResetTime'];
 if(!keys.every(k=>own(raw,k)&&uint(raw[k]))||!positive(raw.dailyResetTime))return null;
 const rows=dailyTaskRows(raw);if(rows===null)return null;
 const tasks=rows.map(parseDailyTaskObservation);
 if(tasks.some(r=>r===null))return null;
 const claims={};for(const key of['dailyRewardClaimed','weeklyRewardClaimed']){if(!own(raw,key)||!dense(raw[key])||raw[key].some(v=>!positive(v))||new Set(raw[key]).size!==raw[key].length)return null;claims[key]=[...raw[key]].sort((a,b)=>a-b);}
 return {resetTime:raw.dailyResetTime,dailyActivity:raw.dailyActivity,weeklyActivity:raw.weeklyActivity,...claims,tasks:tasks.sort((a,b)=>a.taskId-b.taskId)};
}
const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
const parseFor=(inputs,p)=>p?.kind==='weekly-battle-pass-task'?parseBattlePass(inputs?.daily,inputs?.week):isOpenRank(p)?parseOpenRankInfo(inputs?.daily):weeklyKinds.includes(p?.kind)?parseWeekly(inputs?.daily,inputs?.week,p):p?.kind==='daily-gift'?parseGift(inputs?.daily):parseDaily(inputs?.daily);
const snapshot=(inputs,context,p)=>{const daily=parseFor(inputs,p),i=parseOperationInventory(inputs?.items,inputs?.resources);return daily&&i.stockReliable?{context,daily,...(isOpenRank(p)?{window:copy(inputs?.window??null)}:{}),inventory:stockState(i.stock)}:null;};
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available,startClock:f.startClock,endClock:f.endClock});
export async function surveyDailyTaskReward(client,protocol,{config,player,parameters,signal,stop,timeout=15000}={}){
 const opts={signal,stop},context=contextOf(client,player),notes=[],startClock=clockOf(client,context),startWindow=isOpenRank(parameters)?openRankWindow(client,context,parameters):null;const active=()=>assertExecutionActive(client,opts);active();
 const observations=await Promise.all(Object.entries(sourcesFor(parameters)).map(async([key,response])=>{const name=response.replace(/Response$/,'Request');active();if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return[key,null,null];}try{const value=await awaitExecution(client.request(name,isOpenRank(parameters)&&key==='daily'?{type:openRankSpec(parameters).type}:{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}}));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('日常领取采集期间账号或连接变化'),{code:'CANCELLED'});
 const endClock=clockOf(client,context),raw={...Object.fromEntries(observations.map(([k,v])=>[k,v])),...(isOpenRank(parameters)?{window:same(startWindow,openRankWindow(client,context,parameters))?startWindow:null}:{})},inputs=toSnapshotJson(raw),daily=parseFor(raw,parameters),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sourcesFor(parameters)[k],sourceAt,scope,reliable:['daily','week'].includes(k)?daily!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters:copy(parameters),context,configEvidence:{tables:Object.fromEntries(configNamesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,daily,...inventory,state:daily&&inventory.stockReliable?snapshot(inputs,context,parameters):null,available:Object.keys(protocol??{}),notes,startClock,endClock};liveFacts.set(f,{client,player,digest:digest(f)});return f;
}
function liveSourceAuthority(f){
 const live=liveFacts.get(f),c=f?.context;
 return Boolean(live&&live.digest===digest(f)&&live.client.connected===true&&same(c,contextOf(live.client,live.player))&&text(c?.accountId)&&text(c?.connectionId)&&Number.isSafeInteger(c?.generation)&&c.generation>=0&&c.playerId&&c.worldId);
}
function sourceAuthority(f){
 const c=f?.context;if(!liveSourceAuthority(f))return false;
 return Object.entries(sourcesFor(f.parameters)).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function authority(f){if(!sourceAuthority(f)||!f.state||f.stockReliable!==true||!(f.stock instanceof Map)||!same(snapshot(f.inputs,f.context,f.parameters),f.state)||!same(f.daily,f.state.daily))return false;return !isOpenRank(f.parameters)||Boolean(f.state.window&&same(openRankWindow(liveFacts.get(f).client,f.context,f.parameters),f.state.window));}
function currentPeriod(f){const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null,expiry=f?.daily?.resetTime*1000;return clock&&f.startClock&&f.endClock&&f.startClock.earliestMs<=f.endClock.earliestMs&&f.endClock.earliestMs<=clock.earliestMs&&[f.startClock,f.endClock,clock].every(c=>c.latestMs<expiry)?clock:null;}
function definition(config,taskId){const rows=config?.tables?.DailyTaskCfg?.data;if(!dense(rows))return null;const found=rows.filter(row=>own(row,'taskId')&&row.taskId===taskId);if(found.length!==1)return null;const r=found[0];return own(r,'point')&&positive(r.point)&&own(r,'exp')&&positive(r.exp)&&own(r,'moduleId')&&r.moduleId===''?{point:r.point,exp:r.exp}:null;}
// Durable read-only reconciliation uses the same projections and settlement as live verification.
const rewardFields=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k));
const dailyRecoveryKinds=['daily','daily-activity','daily-gift',...weeklyKinds];
export function dailyTaskRewardAction(p){
 if(p?.kind==='daily')return {request,response,body:buildBody(ACTIONS.dailyTaskDraw,{id:p.taskId})};
 if(p?.kind==='daily-activity')return {request:ACTIONS.dailyRewardDraw.request,response:ACTIONS.dailyRewardDraw.response,body:buildBody(ACTIONS.dailyRewardDraw,{index:[p.tierId]})};
 if(p?.kind==='daily-gift')return {request:ACTIONS.freeDailyPackDraw.request,response:ACTIONS.freeDailyPackDraw.response,body:buildBody(ACTIONS.freeDailyPackDraw)};
 if(p?.kind==='weekly-chip-task')return {request:'WeekChipGotTaskRequest',response:'WeekChipGotTaskResponse',body:{round:p.round,taskId:p.taskId}};
 if(weeklyKinds.includes(p?.kind))return {request:weekSpec(p).request,response:null,body:{}};
 throw new Error('Unsupported daily reward recovery target');
}
export function parseDailyTaskRewardState(value,p){
 if(!dailyRecoveryKinds.includes(p?.kind)||!rewardFields(value,['context','daily','inventory']))return null;
 const c=value.context,d=value.daily,contextKeys=['accountId','generation','connectionId','playerId','worldId'];
 if(!rewardFields(c,contextKeys)||!text(c.accountId)||!text(c.connectionId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||roleId(c.playerId)!==c.playerId||roleId(c.worldId)!==c.worldId)return null;
 const spec=weeklyKinds.includes(p.kind)?weekSpec(p):null;
 const dailyKeys=spec?['activityTime','gift',...(spec.chip?['round','score','gotTaskId']:spec.unique?['floor','selectId','gotFloor','buyTimes','gotFree','prizePos']:['gotInfo'])]:p.kind==='daily-gift'?['heroId','resetMarker','drawnPack','boughtPack']:['resetTime','dailyActivity','weeklyActivity','dailyRewardClaimed','weeklyRewardClaimed','tasks'];
 if(!rewardFields(d,dailyKeys))return null;
 let daily;
 if(spec){
  if(!dense(d.activityTime)||d.activityTime.some(r=>!rewardFields(r,['type','period','startTime','endTime']))||!dense(d.gift)||d.gift.some(r=>!rewardFields(r,spec.chip?['giftId','paidTimes']:['giftId','gotTimes','charge']))||(!spec.chip&&!spec.unique&&!rewardFields(d.gotInfo,['times','gotStage']))||(spec.unique&&(!dense(d.prizePos)||d.prizePos.some(r=>!rewardFields(r,['prizeId','pos'])))))return null;
  daily=parseWeekly({...d,...(spec.chip?{gifts:d.gift}:{})},{activityTime:d.activityTime},p);
 }else if(p.kind==='daily-gift')daily=parseGift({heroId:d?.heroId,resetTime:d?.resetMarker,drawnPack:d?.drawnPack,boughtPack:d?.boughtPack});
 else {if(!dense(d?.tasks)||d.tasks.some(r=>!rewardFields(r,['taskId','progress','targetProgress','rewardClaimed'])))return null;daily=parseDaily({dailyResetTime:d.resetTime,dailyActivity:d.dailyActivity,weeklyActivity:d.weeklyActivity,dailyRewardClaimed:d.dailyRewardClaimed,weeklyRewardClaimed:d.weeklyRewardClaimed,dailyTask:d.tasks.map(r=>({id:r.taskId,progress:r.progress,targetProgress:r.targetProgress,rewardClaimed:r.rewardClaimed}))});}
 if(!daily||!same(daily,d)||!dense(value.inventory)||value.inventory.some(r=>!rewardFields(r,['id','num'])||!text(r.id)||!Number.isSafeInteger(r.num)||r.num<=0)||new Set(value.inventory.map(r=>r.id)).size!==value.inventory.length)return null;
 const inventory=stockState(new Map(value.inventory.map(r=>[r.id,r.num])));return same(inventory,value.inventory)?{context:copy(c),daily,inventory}:null;
}
export function dailyTaskRewardReadSources(p){return dailyRecoveryKinds.includes(p?.kind)?copy(sourcesFor(p)):null;}
export function parseDailyTaskRewardSources(inputs,context,p){const state=snapshot(toSnapshotJson(inputs),context,p);return state?parseDailyTaskRewardState(state,p):null;}
export function dailyTaskRewardExpectedState(before,p,rewards,activityGain,balances){
 const next=parseDailyTaskRewardState(before,p);
 if(!next||!(balances instanceof Map)||balances.size>10000||[...balances].some(([id,num])=>!text(id)||!Number.isSafeInteger(num)||num<0)||!same(stockState(balances),next.inventory)||!dense(rewards)||!rewards.length||rewards.some(r=>!rewardFields(r,['id','num'])||!text(r.id)||!Number.isSafeInteger(r.num)||r.num<=0)||new Set(rewards.map(r=>r.id)).size!==rewards.length)return null;
 if(own(p,'expectedResetTime')&&(!['daily','daily-activity'].includes(p.kind)||!positive(p.expectedResetTime)||p.expectedResetTime!==next.daily.resetTime))return null;
 if(p.kind==='daily'){
  const task=next.daily.tasks.find(r=>r.taskId===p.taskId);
  if(!task||task.rewardClaimed!==false||task.progress<task.targetProgress||!positive(activityGain)||rewards.length!==1||rewards[0].id!=='EXP'||!uint(next.daily.dailyActivity+activityGain)||!uint(next.daily.weeklyActivity+activityGain))return null;
  task.rewardClaimed=true;next.daily.dailyActivity+=activityGain;next.daily.weeklyActivity+=activityGain;
 }else if(p.kind==='daily-activity'){
  if(activityGain!==0||!positive(p.tierId)||rewards.length!==1||next.daily.dailyRewardClaimed.includes(p.tierId))return null;
  next.daily.dailyRewardClaimed=[...next.daily.dailyRewardClaimed,p.tierId].sort((a,b)=>a-b);
 }else if(p.kind==='daily-gift'){
  if(activityGain!==0||p.packId!==FREE_DAILY_PACK_ID||rewards.length!==1||rewards[0].id!=='RUBY'||next.daily.drawnPack.includes(FREE_DAILY_PACK_ID))return null;
  next.daily.drawnPack=[...next.daily.drawnPack,FREE_DAILY_PACK_ID].sort();
 }else if(weeklyKinds.includes(p.kind)){
  const spec=weekSpec(p),gift=next.daily.gift.find(r=>r.giftId===1000);
  if(activityGain!==0||!next.daily.activityTime.some(r=>r.type===spec.type))return null;
  if(p.kind==='weekly-chip-task'){
   if(!positive(p.round)||!positive(p.taskId)||next.daily.round!==p.round||next.daily.gotTaskId.includes(p.taskId))return null;
   next.daily.gotTaskId=[...next.daily.gotTaskId,p.taskId].sort((a,b)=>a-b);
  }else {
   if(p.packId!=='1000')return null;
   if(spec.unique){if(gift||next.daily.gotFree!==false)return null;next.daily.gotFree=true;}
   else {const key=spec.chip?'paidTimes':'gotTimes';if(!gift||gift[key]!==0||!spec.chip&&gift.charge!==0)return null;gift[key]=1;}
  }
 }else return null;
 const stock=new Map(balances);
 for(const {id,num}of rewards){const total=(stock.get(id)??0)+num;if(Object.values(RESOURCE_NAMES).includes(id)&&!stock.has(id)||!Number.isSafeInteger(total))return null;stock.set(id,total);}
 next.inventory=stockState(stock);return next;
}
export function dailyTaskRewardSettlement(result,operation){
 const p=operation?.parameters;if(!dailyRecoveryKinds.includes(p?.kind))return null;
 if(p.kind==='weekly-chip-task'?!chipTaskReceipt(result,operation):p.kind==='daily'?!own(result,'activity')||result.activity!==operation.activityGain:result!==null&&result!==undefined)return null;
 return {rewards:copy(operation.rewards),activityGain:operation.activityGain,evidence:p.kind==='weekly-chip-task'?{round:p.round,gotTaskId:copy(operation.expectedState.daily.gotTaskId),rewards:copy(operation.rewards)}:p.kind==='daily'?{activity:result.activity}:null};
}
export function verifyDailyTaskRewardOutcome(operation,before,after,settlement,balances){
 const no=reason=>({confirmed:false,reason}),p=operation?.parameters,b=parseDailyTaskRewardState(before,p),a=parseDailyTaskRewardState(after,p);
 if(!b||!a||!same(b.context,a.context)||!same(operation.beforeState,b)||!rewardFields(settlement,['rewards','activityGain','evidence']))return no('缺少原日常奖励完整状态与结算凭据');
 const expected=dailyTaskRewardExpectedState(b,p,settlement.rewards,settlement.activityGain,balances);
 const evidence=p.kind==='weekly-chip-task'?{round:p.round,gotTaskId:expected?.daily.gotTaskId,rewards:settlement.rewards}:p.kind==='daily'?{activity:settlement.activityGain}:null;
 if(!expected||!same(operation.expectedState,expected)||!same(a,expected)||!same(settlement.evidence,evidence))return no('原周期、唯一领取变化、完整库存净入或typed增量未精确确认');
 if(weeklyKinds.includes(p.kind))return {confirmed:true,afterState:copy(a),reason:p.kind==='weekly-chip-task'?'同活动窗口、精确轮次与任务typed回执、唯一已领ID新增和完整库存净入共同确认；不跨轮或开箱':'同活动窗口、唯一免费礼包领取变化和完整库存配置奖励净入共同确认；其他活动/礼包/进度不变，不推算跨周重领或开箱'};
 return {confirmed:true,afterState:copy(a),reason:p.kind==='daily-gift'?'原样标记、英雄、唯一赠礼领取与RUBY净入共同确认；不证明日界':p.kind==='daily-activity'?'同周期唯一日活跃档位新增、配置奖励精确净入和其他完整状态不变共同确认':'同日常周期独立任务状态、typed活跃增量和完整库存EXP净入共同确认',...(p.kind==='daily'?{responseEvidence:{taskId:p.taskId,resetTime:b.daily.resetTime,activity:settlement.activityGain,experience:settlement.rewards[0].num}}:{})};
}
export function dailyTaskRewardRecoveryParts(row){
 const p=row?.parameters,before=parseDailyTaskRewardState(row?.beforeState,p),after=parseDailyTaskRewardState(row?.expectedState,p);if(!before||!after||!same(before.context,after.context))return null;
 const t=row.target;let target,uid,actionId;
 if(p.kind==='daily'){target={...p,resetTime:before.daily.resetTime};uid={type:'task-reward',id:'daily:'+before.daily.resetTime+':'+p.taskId};actionId=moduleId+':daily:'+before.daily.resetTime+':'+p.taskId+':'+row.identity;}
 else if(p.kind==='daily-activity'){if(!positive(t?.season)||!positive(t?.configuredSeason))return null;target={...p,resetTime:before.daily.resetTime,season:t.season,configuredSeason:t.configuredSeason};uid={type:'daily-activity-reward',id:before.daily.resetTime+':'+p.tierId};actionId=moduleId+':daily-activity:'+before.daily.resetTime+':'+p.tierId+':'+row.identity;}
 else if(p.kind==='daily-gift'){if(!positive(t?.season)||!positive(t?.configuredSeason))return null;target={...p,heroId:before.daily.heroId,resetMarker:before.daily.resetMarker,season:t.season,configuredSeason:t.configuredSeason};uid={type:'free-daily-gift',id:hash({p,daily:before.daily,season:t.configuredSeason})};actionId=moduleId+':daily-gift:'+row.identity;}
 else {const spec=weekSpec(p),activity=before.daily.activityTime.find(r=>r.type===spec.type);if(!activity)return null;target={...p,...activity};uid={type:p.kind==='weekly-chip-task'?'weekly-chip-task-reward':spec.chip?'free-weekly-chip-gift':spec.unique?'free-weekly-unique-lottery-gift':'free-weekly-lottery-gift',id:hash(target)};actionId=moduleId+':'+p.kind+':'+row.identity;}
 if(!same(t,target))return null;return {before,action:dailyTaskRewardAction(p),actionId,budgetClaims:{resources:[],quotas:[],uids:[uid]}};
}
export function dailyTaskRewardRecoveryClock(client,context,p,state,previous){
 const parsed=parseDailyTaskRewardState(state,p);if(!parsed||!same(parsed.context,context))return null;
 if(p.kind==='daily-gift')return previous===null?{clock:null}:null;
 const valid=c=>rewardFields(c,['earliestMs','nowMs','latestMs'])&&['earliestMs','nowMs','latestMs'].every(k=>Number.isFinite(c[k])&&c[k]>=0&&c[k]<=Number.MAX_SAFE_INTEGER)&&c.earliestMs<=c.nowMs&&c.nowMs<=c.latestMs;
 const clock=clockOf(client,context),activity=weeklyKinds.includes(p.kind)?parsed.daily.activityTime.find(r=>r.type===weekSpec(p).type):null,expiry=(activity?.endTime??parsed.daily.resetTime)*1000;
 return valid(previous)&&valid(clock)&&previous.latestMs<expiry&&clock.latestMs<expiry&&(!weeklyKinds.includes(p.kind)||activity&&previous.earliestMs>=activity.startTime*1000&&clock.earliestMs>=activity.startTime*1000)&&previous.earliestMs<=clock.earliestMs?{clock}:null;
}
export function dailyTaskRewardVerificationClock(f){const live=liveFacts.get(f);return live&&authority(f)?dailyTaskRewardRecoveryClock(live.client,f.context,f.parameters,f.state,f.parameters.kind==='daily-gift'?null:f.endClock):null;}
function candidate(f,{config,moduleConfig={enabled:false},parameters=f?.parameters}={}){
 const taskId=parameters?.taskId,p={kind:'daily',taskId,...(own(parameters,'expectedResetTime')?{expectedResetTime:parameters.expectedResetTime}:{})},valid=authority(f),def=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null))?definition(f?.configEvidence,taskId):null;
 const task=f?.daily?.tasks?.find(r=>r.taskId===taskId),beforeState=copy(f?.state??null);
 const expectedState=valid&&def&&task?dailyTaskRewardExpectedState(beforeState,p,[{id:'EXP',num:def.exp}],def.point,f.stock):null;
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'DAILY_TASK_AUTHORITY_UNKNOWN':!def?'DAILY_TASK_CONFIG_UNKNOWN':!task?'TASK_NOT_PRESENT':task.rewardClaimed?'TASK_ALREADY_CLAIMED':task.progress<task.targetProgress?'TASK_INCOMPLETE':own(p,'expectedResetTime')&&p.expectedResetTime!==f.daily.resetTime?'DAILY_TASK_PERIOD_CHANGED':!currentPeriod(f)?'DAILY_TASK_PERIOD_UNKNOWN':!expectedState?'REWARD_BALANCE_UNKNOWN':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const reset=f?.daily?.resetTime??null,identity=hash({p,beforeState,def,configEvidence:f?.configEvidence}),budgetClaims={resources:[],quotas:[],uids:[{type:'task-reward',id:'daily:'+reset+':'+taskId}]};
 return {module:moduleId,capabilityId:'C503',actionId:moduleId+':daily:'+reset+':'+taskId+':'+identity,actionType:'CLAIM',target:{...p,resetTime:reset},parameters:p,identity,beforeState,expectedState,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'日常任务 '+taskId+' 奖励',rewards:def?[{id:'EXP',num:def.exp}]:null,activityGain:def?.point??null,progress:task?.progress??null,requiredProgress:task?.targetProgress??null,...(blockedReason===null?{action:dailyTaskRewardAction(p)}:{})};
}
const candidateFor=(f,options)=>{const kind=(options?.parameters??f?.parameters)?.kind;return (OPEN_RANK_TASK_KINDS.includes(kind)?openRankTaskCandidate:kind==='weekly-chip-task'?chipTaskCandidate:weeklyKinds.includes(kind)?weeklyCandidate:kind==='daily-gift'?giftCandidate:kind==='daily-activity'?activityCandidate:candidate)(f,options);};
function taskTargetSelection(f,config,parameters=f?.parameters){
 const kind=f?.parameters?.kind,unknown={kind,readOnly:true,status:'UNKNOWN',field:null,targets:null,round:null};
 if(!same(parameters,f?.parameters)||!sourceAuthority(f)||!same(f?.daily,parseFor(f?.inputs,f.parameters)))return unknown;
 const table=kind==='daily-activity'?'DailyActivityRewardCfg':kind==='weekly-chip-task'?'WeekChipPointsCfg':isOpenRank(f.parameters)?openRankSpec(f.parameters).table:null;
 if(!table)return unknown;const rows=f.configEvidence?.tables?.[table]?.data,key=kind==='daily-activity'?'id':kind==='weekly-chip-task'?'rwdId':'score';
 if(!dense(rows)||!rows.length||rows.some(row=>!own(row,key)||!positive(row[key])))return unknown;
 const ids=[...new Set(rows.map(row=>row[key]))],targets=[];
 for(const id of ids){
  const definition=kind==='daily-activity'?activityDefinition(f,config,id):kind==='weekly-chip-task'?chipTaskDefinition(f,config,id):openRankTaskDefinition(f,config,id);
  if(!definition)continue;
  targets.push({id,requiredProgress:kind==='daily-activity'?definition.requiredActivity:kind==='weekly-chip-task'?definition.amount:id,rewards:copy(definition.rewards),season:definition.season??null,configuredSeason:definition.configuredSeason??null});
 }
 return targets.length?{kind,readOnly:true,status:'OBSERVED_DEFINITIONS',field:kind==='weekly-chip-task'?'taskId':'tierId',targets,round:kind==='weekly-chip-task'?f.daily.round:null}:unknown;
}

function closingTargetFact(f,parameters,config){
 const owner=liveFacts.get(f);
 if(!owner||!['daily','daily-activity'].includes(f?.parameters?.kind)||!authority(f)||!currentPeriod(f)||!same(configNamesFor(f.parameters).map(n=>config?.tables?.[n]??null),configNamesFor(f.parameters).map(n=>f.configEvidence?.tables?.[n]??null)))return null;
 const target={...f,parameters:copy(parameters),configEvidence:{tables:Object.fromEntries(configNamesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)]))}};
 liveFacts.set(target,{client:owner.client,player:owner.player,digest:digest(target)});return target;
}
export function dailyRewardClosingChoices(f,{config,moduleConfig={enabled:false}}={}){
 if(!['daily','daily-activity'].includes(f?.parameters?.kind)||!authority(f)||!currentPeriod(f))return {status:'UNKNOWN',expectedResetTime:null,targets:[]};
 const reset=f.daily.resetTime,targets=[];
 const add=parameters=>{const target=closingTargetFact(f,{...parameters,expectedResetTime:reset},config);if(!target)return;const row=candidateFor(target,{config,moduleConfig});targets.push({parameters:copy(row.parameters),selection:{unique:true},costs:[],rewards:copy(row.rewards),activityGain:row.activityGain,progress:row.progress,requiredProgress:row.requiredProgress,budgetClaims:copy(row.budgetClaims),executable:row.executable,blockedReason:row.blockedReason});};
 for(const task of f.daily.tasks)add({kind:'daily',taskId:task.taskId});
 const rows=config?.tables?.DailyActivityRewardCfg?.data;
 if(dense(rows))for(const tierId of [...new Set(rows.map(row=>own(row,'id')?row.id:null))].filter(positive)){if(activityRewardDefinition(config,{worldId:f.context.worldId,tierId}))add({kind:'daily-activity',tierId});}
 return {status:'OBSERVED',expectedResetTime:reset,targets};
}
export function validateDailyRewardPreparation(v){
 const keys=['expectedResetTime','taskIds','tierIds','maxDurationMs'];
 if(!v||typeof v!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Reflect.ownKeys(v).some(k=>!keys.includes(k)||!Object.getOwnPropertyDescriptor(v,k)?.enumerable||!own(v,k))||!['expectedResetTime','taskIds','tierIds'].every(k=>Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k))||!positive(v.expectedResetTime)||!dense(v.taskIds)||!dense(v.tierIds)||v.taskIds.length+v.tierIds.length<1||v.taskIds.length+v.tierIds.length>24||[v.taskIds,v.tierIds].some(ids=>ids.some(id=>!positive(id))||new Set(ids).size!==ids.length)||own(v,'maxDurationMs')&&(!Number.isInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000))throw Object.assign(new Error('日常收尾须明确原重置秒、taskIds/tierIds数组，共1至24个唯一正int32目标及1至86400000毫秒时长'),{code:'INVALID_PARAMETERS',statusCode:400});
 return {expectedResetTime:v.expectedResetTime,taskIds:[...v.taskIds],tierIds:[...v.tierIds],maxDurationMs:v.maxDurationMs??300000};
}
export function prepareDailyRewardWorkflow(f,{config,moduleConfig={enabled:false},...input}={}){
 const p=validateDailyRewardPreparation(input),choices=dailyRewardClosingChoices(f,{config,moduleConfig});
 if(choices.status!=='OBSERVED'||choices.expectedResetTime!==p.expectedResetTime)throw Object.assign(new Error('原日常周期或完整来源已变化，须重新调查'),{code:'DAILY_TASK_PERIOD_CHANGED',statusCode:409});
 const targets=[...p.taskIds.map(taskId=>({kind:'daily',taskId,expectedResetTime:p.expectedResetTime})),...p.tierIds.map(tierId=>({kind:'daily-activity',tierId,expectedResetTime:p.expectedResetTime}))];
 const steps=targets.map(parameters=>{const row=choices.targets.find(row=>same(row.parameters,parameters));if(!row?.executable)throw Object.assign(new Error('所选日常目标没有当前明确领取资格：'+(row?.blockedReason??'TARGET_UNKNOWN')),{code:row?.blockedReason??'DAILY_REWARD_TARGET_UNKNOWN',statusCode:409});return copy(row);});
 const nodes=[{id:'start',type:'START'}];steps.forEach((row,i)=>nodes.push({id:'reward-'+i,type:'ACTION',module:moduleId,parameters:row.parameters,selection:row.selection},{id:'verify-'+i,type:'VERIFY',module:moduleId}));nodes.push({id:'stop',type:'STOP'});
 const budget={resources:[],quotas:[],uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...p,steps,budget,graph:{version:1,id:'daily-rewards-'+hash({context:f.context,p,steps}).slice(0,20),name:'同周期明确日常奖励收尾',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:[moduleId]}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'仅领取明确所选且准备时已合格的日常任务及日活跃档位；先逐任务、后逐档，原Function每步重新调查、单次授权、typed回执及完整库存净入验证。同一服务器重置标记固定，周期变化、拒绝或UNKNOWN停止，不重试或跨日重领；未达档不使用预期活跃度生成资格，收入不补预算，不开包、不领取周活跃。准备只读，不授予执行权限。'};
}

export function viewDailyTaskReward(f,options={}){if((options.parameters??f?.parameters)?.kind==='weekly-battle-pass-task')return viewBattlePassTask(f,options);const row=candidateFor(f,options);return {module:moduleId,daily:copy(f?.daily??null),...(f?.parameters?.kind==='weekly-chip-task'||isOpenRank(f?.parameters)?{rewardClosing:activityTaskClosingChoices(f,options)}:{}),dailyClosing:dailyRewardClosingChoices(f,options),targetSelection:taskTargetSelection(f,options.config,options.parameters??f?.parameters),candidates:[row],notes:[...(f?.notes??[]),isOpenRank(row.parameters)?'仅领取当前可信对应type窗口中的明确score任务档位；订单/闯关直接配置，剿匪/战争精确当前季否则取最大配置季；进度与已领分离，独立OpenRankInfo及完整库存净入共同确认，不将通用奖励包当同次回执或排名奖励。':row.parameters.kind==='weekly-chip-task'?'仅领取明确轮次与任务ID，可信type6活动窗口、typed回执及完整库存独立确认。末个未领任务涉及轮次转换，证据未闭合时保持阻断；不打开宝箱。':weeklyKinds.includes(row.parameters.kind)?'仅领取服务器明确未领的1000号免费周礼包；绑定type/period/startTime/endTime，可信Ping时间范围须完全位于本活动窗口；不推算跨周重领。':row.parameters.kind==='daily-gift'?'仅领取本次明确未领的免费赠礼，绑定服务器原样标记/英雄及完整领取列表，不推断resetTime的时间单位或周期，不定时重领。':row.parameters.kind==='daily-activity'?'仅领取明确日活跃档位，以服务器dailyResetTime绑定周期，完整库存净入和唯一档位新增共同确认；不打开所得包，不推算周界。':'只领取明确日常任务；以本次服务器dailyResetTime绑定任务周期，不推算周界。typed活跃增量、同周期任务已领、日/周活跃精确增量和EXP净入共同确认。']};}
export function planDailyTaskReward(f,{parameters,selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}){const row=viewDailyTaskReward(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};}
export function verifyDailyTaskReward(operation,before,after,result){const no=reason=>({confirmed:false,reason});
 if([operation?.parameters?.kind,before?.parameters?.kind,after?.parameters?.kind].includes('weekly-battle-pass-task'))return no('战令任务仅只读观察；每日周期和独立积分结算缺证');
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!same(before.configEvidence,after.configEvidence)||(isOpenRank(before.parameters)?(!currentOpenRankWindow(before)||!currentOpenRankWindow(after)):weeklyKinds.includes(before.parameters?.kind)?(!currentWeek(before)||!currentWeek(after)):before.parameters?.kind!=='daily-gift'&&(!currentPeriod(before)||!currentPeriod(after))))return no('日常任务前后身份、周期、配置或完整库存不可靠');
 const canonical=candidateFor(before,{config:before.configEvidence,moduleConfig:{enabled:true},parameters:before.parameters});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards','activityGain'].some(k=>!same(operation?.[k],canonical[k])))return no('日常领取合同与写前明确任务不一致');
 if(dailyRecoveryKinds.includes(canonical.parameters.kind)){
  const settlement=dailyTaskRewardSettlement(result,canonical);
  if(!settlement||Object.keys(sourcesFor(before.parameters)).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt))return no('日常奖励typed回执或独立来源时间不可靠');
  return verifyDailyTaskRewardOutcome(operation,before.state,after.state,settlement,before.stock);
 }
 if(isOpenRank(canonical.parameters)){
  if(result!==null&&result!==undefined||Object.keys(sourcesFor(before.parameters)).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,canonical.expectedState))return no('开服任务同一类型窗口、唯一score已领新增及完整库存净入未同时确认');
  return {confirmed:true,afterState:copy(after.state),reason:'独立对应type排行复读确认同窗口、同进度且仅明确score档位新增；完整库存按固定配置精确净入，其他库存保持，不打开所得包'};
 }
 return no('不支持的日常奖励合同');
}
export function dailyTaskRewardDependencyVersions({config,moduleConfig={enabled:false},parameters={}}={}){return {moduleConfig:copy(moduleConfig),tables:Object.fromEntries(configNamesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)]))};}

export const DAILY_ACTIVITY_REWARD_EVIDENCE=Object.freeze({source:'Fixed v76 main/game.js DailyProgressReward._onClickReward, AchievementUtil.allDailyActiveRewardCfg and SeasonUtil.seasonCfgList',rewardByte:1637597,rewardSha256:'37da9257eadf772ec58dbc386a304c9d2ba7f8c88be627cd30d455c2a32beb8a',seasonByte:5952775,seasonSha256:'cd65c8de61c702d7440a95e1c4ff80bfcec7ee3477bcb1b842d01ec24c731b4c',semantics:'Explicit repeated index; use highest configured season <= exact bound WorldIdRule season; same server dailyResetTime only, no weekly marker',realGame:'REAL_UNVERIFIED'});
function activityDefinition(f,config,tierId){
 if(!same(configNamesFor({kind:'daily-activity'}).map(n=>config?.tables?.[n]??null),configNamesFor({kind:'daily-activity'}).map(n=>f?.configEvidence?.tables?.[n]??null)))return null;
 return activityRewardDefinition(f?.configEvidence,{worldId:f?.context?.worldId,tierId});
}
function activityCandidate(f,{config,moduleConfig={enabled:false},parameters=f?.parameters}={}){
 const p={kind:'daily-activity',tierId:parameters?.tierId,...(own(parameters,'expectedResetTime')?{expectedResetTime:parameters.expectedResetTime}:{})},valid=authority(f),def=activityDefinition(f,config,p.tierId),beforeState=copy(f?.state??null);
 const claimed=f?.daily?.dailyRewardClaimed;
 const expectedState=valid&&def&&claimed.every(id=>def.tierIds.includes(id))?dailyTaskRewardExpectedState(beforeState,p,def.rewards,0,f.stock):null;
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'DAILY_ACTIVITY_AUTHORITY_UNKNOWN':!def?'DAILY_ACTIVITY_CONFIG_OR_SEASON_UNKNOWN':claimed.includes(p.tierId)?'ACTIVITY_TIER_ALREADY_CLAIMED':!activityTierAvailable({id:p.tierId,activity:def.requiredActivity},f.daily.dailyActivity,claimed)?'ACTIVITY_INCOMPLETE':own(p,'expectedResetTime')&&p.expectedResetTime!==f.daily.resetTime?'DAILY_TASK_PERIOD_CHANGED':!currentPeriod(f)?'DAILY_TASK_PERIOD_UNKNOWN':!expectedState?'REWARD_BALANCE_UNKNOWN':!f.available.includes('DrawDailyRewardRequest')?'PROTOCOL_UNAVAILABLE':null;
 const reset=f?.daily?.resetTime??null,identity=hash({p,beforeState,def,configEvidence:f?.configEvidence}),source='Fixed v76 DailyProgressReward index and SeasonUtil selected DailyActivityRewardCfg; one exact eligible daily tier, zero debit, independent full claimed list and inventory';
 return {module:moduleId,capabilityId:'C516',actionId:moduleId+':daily-activity:'+reset+':'+p.tierId+':'+identity,actionType:'CLAIM',target:{...p,resetTime:reset,season:def?.season??null,configuredSeason:def?.configuredSeason??null},parameters:p,identity,beforeState,expectedState,costs:[],costSource:source,budgetClaims:{resources:[],quotas:[],uids:[{type:'daily-activity-reward',id:reset+':'+p.tierId}]},executable:blockedReason===null,blockedReason,label:'日活跃宝箱 '+p.tierId,rewards:copy(def?.rewards??null),activityGain:0,progress:f?.daily?.dailyActivity??null,requiredProgress:def?.requiredActivity??null,...(blockedReason===null?{action:dailyTaskRewardAction(p)}:{})};
}

// C513: this exact free pack is independent of paid/combine packs. The server
// resetTime is an opaque identity component; no clock/day policy is inferred.
export const DAILY_GIFT_EVIDENCE=Object.freeze({source:'Fixed v76 main/game.js DailyCombinePanel._onClickFree/_asyncDrawGiftPack/_packCfgList and DailyChargeGiftPackCfg',byte:1613827,sha256:'f428fcb14c89df67357bf2256ff959d41a6918489803f14c73e8030c79a5c3b2',realGame:'REAL_UNVERIFIED'});
function parseGift(raw){
 const observed=dailyGiftObservation(raw);
 if(observed.freeAvailable===null||!own(raw,'resetTime')||!positive(raw.resetTime)||!own(raw,'boughtPack')||!dense(raw.boughtPack)||raw.boughtPack.some(v=>!text(v))||new Set(raw.boughtPack).size!==raw.boughtPack.length)return null;
 return {heroId:observed.heroId,resetMarker:raw.resetTime,drawnPack:observed.drawnPack.sort(),boughtPack:[...raw.boughtPack].sort()};
}
function giftDefinition(f,config){
 if(!same(f?.configEvidence?.tables?.DailyChargeGiftPackCfg,config?.tables?.DailyChargeGiftPackCfg))return null;
 return dailyGiftDefinition(f?.configEvidence,{worldId:f?.context?.worldId});
}
function giftCandidate(f,{config,moduleConfig={enabled:false}}={}){
 const p={kind:'daily-gift',packId:FREE_DAILY_PACK_ID},valid=authority(f),def=giftDefinition(f,config),beforeState=copy(f?.state??null);
 const expectedState=valid&&def?dailyTaskRewardExpectedState(beforeState,p,def.rewards,0,f.stock):null;
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'DAILY_GIFT_AUTHORITY_UNKNOWN':!def?'DAILY_GIFT_CONFIG_OR_SEASON_UNKNOWN':dailyGiftObservation(f.daily).freeAvailable!==true?'DAILY_GIFT_ALREADY_CLAIMED':!expectedState?'REWARD_BALANCE_UNKNOWN':!f.available.includes('GotFreeDailyPackRequest')?'PROTOCOL_UNAVAILABLE':null;
 const identity=hash({p,beforeState,def,configEvidence:f?.configEvidence}),uid=hash({p,daily:f?.daily,season:def?.configuredSeason}),source='Fixed v76 DailyCombinePanel explicit free 赠礼 only; selected DailyChargeGiftPackCfg price=0 fragNum=0 guildPack=[] and RUBY reward; opaque server marker, no assumed game-day renewal';
 return {module:moduleId,capabilityId:'C513',actionId:moduleId+':daily-gift:'+identity,actionType:'CLAIM',target:{...p,heroId:f?.daily?.heroId??null,resetMarker:f?.daily?.resetMarker??null,season:def?.season??null,configuredSeason:def?.configuredSeason??null},parameters:p,identity,beforeState,expectedState,costs:[],costSource:source,budgetClaims:{resources:[],quotas:[],uids:[{type:'free-daily-gift',id:uid}]},executable:blockedReason===null,blockedReason,label:'免费日赠礼',rewards:copy(def?.rewards??null),activityGain:0,...(blockedReason===null?{action:dailyTaskRewardAction(p)}:{})};
}

export const WEEKLY_LOTTERY_GIFT_EVIDENCE=Object.freeze({source:'Fixed v76 main/game.js WeekModel.ts / WeekLotteryPackItem.ts / WeekLotteryPop.ts / ActivityWeekUtil.ts / WeekChipPack.ts',chipPackByte:7349214,chipPackSha256:'2bd2d69589d676b5047026a834d3893a2ecaf43660fa4f030072efc01a14fc79',packItemByte:7384451,packItemSha256:'d04eb947a7fd1c970cfead55184cab0fd424fa22aee0243eee7a42ee21432cf4',semantics:'ACT_LOTTERY=4; startTime <= server seconds < endTime; unique zero-price WeekLotteryPackCfg pack1000; empty WeekLotteryFreePackRequest; no absent gift default; ACT_UNIQUE_LOTTERY=7 uses WeekUniquePackCfg1000 and GotUniqueLotteryFreeRequest with explicit gotFree=false, only gotFree=true afterward and no gift-list mutation; ACT_CHIP=6 uses WeekChipPack.ts and WeekChipGotFreeRequest, explicit paidTimes0-to1, WeekChipPackCfg buyLimit1 and held box net income',realGame:'REAL_UNVERIFIED'});
function parseWeekly(raw,week,p){
 const spec=weekSpec(p),giftKey=spec.chip?'gifts':'gift';
 if(!own(week,'activityTime')||!dense(week.activityTime)||!own(raw,giftKey)||!dense(raw[giftKey]))return null;
 const activityTime=week.activityTime.map(r=>['type','period','startTime','endTime'].every(k=>own(r,k)&&positive(r[k]))&&r.startTime<r.endTime?{type:r.type,period:r.period,startTime:r.startTime,endTime:r.endTime}:null);
 const gift=raw[giftKey].map(r=>own(r,'giftId')&&positive(r.giftId)&&(spec.chip?own(r,'paidTimes')&&uint(r.paidTimes):['gotTimes','charge'].every(k=>own(r,k)&&uint(r[k])))?spec.chip?{giftId:r.giftId,paidTimes:r.paidTimes}:{giftId:r.giftId,gotTimes:r.gotTimes,charge:r.charge}:null);
 if(activityTime.some(r=>!r)||gift.some(r=>!r)||new Set(activityTime.map(r=>r.type)).size!==activityTime.length||new Set(gift.map(r=>r.giftId)).size!==gift.length)return null;
 const common={activityTime:activityTime.sort((a,b)=>a.type-b.type),gift:gift.sort((a,b)=>a.giftId-b.giftId)};
 if(spec.chip){if(!['round','score'].every(k=>own(raw,k)&&uint(raw[k]))||!own(raw,'gotTaskId')||!dense(raw.gotTaskId)||raw.gotTaskId.some(v=>!positive(v))||new Set(raw.gotTaskId).size!==raw.gotTaskId.length)return null;return {...common,round:raw.round,score:raw.score,gotTaskId:[...raw.gotTaskId].sort((a,b)=>a-b)};}
 if(spec.unique){
  if(!['floor','selectId','gotFloor','buyTimes'].every(k=>own(raw,k)&&uint(raw[k]))||!own(raw,'gotFree')||typeof raw.gotFree!=='boolean'||!own(raw,'prizePos')||!dense(raw.prizePos))return null;
  const prizePos=raw.prizePos.map(r=>['prizeId','pos'].every(k=>own(r,k)&&uint(r[k]))?{prizeId:r.prizeId,pos:r.pos}:null);
  if(prizePos.some(r=>!r)||new Set(prizePos.map(r=>r.pos)).size!==prizePos.length)return null;
  return {...common,floor:raw.floor,selectId:raw.selectId,gotFloor:raw.gotFloor,buyTimes:raw.buyTimes,gotFree:raw.gotFree,prizePos:prizePos.sort((a,b)=>a.pos-b.pos)};
 }
 if(!own(raw,'gotInfo')||!['times','gotStage'].every(k=>own(raw.gotInfo,k)&&uint(raw.gotInfo[k])))return null;
 return {...common,gotInfo:{times:raw.gotInfo.times,gotStage:raw.gotInfo.gotStage}};
}
function currentWeek(f){
 const activity=f?.daily?.activityTime?.find(r=>r.type===weekSpec(f?.parameters).type),live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null;
 return activity&&clock&&f.startClock&&f.endClock&&f.startClock.earliestMs<=f.endClock.earliestMs&&f.endClock.earliestMs<=clock.earliestMs&&[f.startClock,f.endClock,clock].every(c=>c.earliestMs>=activity.startTime*1000&&c.latestMs<activity.endTime*1000)?activity:null;
}
function weeklyDefinition(f,config){
 const spec=weekSpec(f?.parameters);
 if(!same(f?.configEvidence?.tables?.[spec.table],config?.tables?.[spec.table]))return null;
 const rows=f?.configEvidence?.tables?.[spec.table]?.data;
 if(!dense(rows)||!rows.length||rows.some(r=>!own(r,'packId')||!positive(r.packId)||!own(r,'price')||!uint(r.price))||new Set(rows.map(r=>r.packId)).size!==rows.length)return null;
 const free=rows.filter(r=>r.price===0);if(free.length!==1||free[0].packId!==1000)return null;const r=free[0];
 const limit=spec.chip?'buyLimit':'limitedTimes',rewardIds=spec.chip?[spec.coin]:[spec.coin,'RUBY'];
 if(!own(r,limit)||r[limit]!==1||!own(r,'guildPack')||!dense(r.guildPack)||r.guildPack.length||!own(r,'reward')||!dense(r.reward)||r.reward.length!==rewardIds.length||r.reward.some(v=>!dense(v)||v.length!==2||!rewardIds.includes(v[0])||!positive(v[1]))||new Set(r.reward.map(v=>v[0])).size!==rewardIds.length)return null;
 return {rewards:r.reward.map(([id,num])=>({id,num}))};
}
function weeklyCandidate(f,{config,moduleConfig={enabled:false},parameters=f?.parameters}={}){
 const p=copy(parameters),spec=weekSpec(p),valid=authority(f)&&same(p,f.parameters),def=weeklyDefinition(f,config),activity=currentWeek(f),gift=f?.daily?.gift?.find(r=>r.giftId===1000),beforeState=copy(f?.state??null);let expectedState=null;
 if(valid&&def)expectedState=dailyTaskRewardExpectedState(beforeState,p,def.rewards,0,f.stock);
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'WEEKLY_GIFT_AUTHORITY_UNKNOWN':!def?'WEEKLY_GIFT_CONFIG_UNKNOWN':(spec.unique?Boolean(gift):!gift)?'WEEKLY_GIFT_ENTITLEMENT_UNKNOWN':(spec.unique?f.daily.gotFree:gift[spec.chip?'paidTimes':'gotTimes']!==0)?'WEEKLY_GIFT_ALREADY_CLAIMED':!spec.unique&&!spec.chip&&gift.charge!==0?'WEEKLY_GIFT_CHARGE_UNKNOWN':!activity?'WEEKLY_GIFT_PERIOD_UNKNOWN':!expectedState?'REWARD_BALANCE_UNKNOWN':!f.available.includes(spec.request)?'PROTOCOL_UNAVAILABLE':null;
 const target={...p,type:spec.type,period:activity?.period??null,startTime:activity?.startTime??null,endTime:activity?.endTime??null},identity=hash({target,beforeState,def,configEvidence:f?.configEvidence}),source=spec.chip?'Fixed v76 WeekChipPack WeekChipGotFreeRequest and WeekChipPackCfg1000: zero price, buyLimit1, empty guildPack; trusted WeekInfo activity6 window and explicit WeekChipGift paidTimes0; grant configured held box count, never open boxes':spec.unique?'Fixed v76 WeekLotteryPackItem GotUniqueLotteryFreeRequest and WeekUniquePackCfg1000: zero price, limitedTimes1, empty guildPack; trusted WeekInfo activity7 window and explicit gotFree=false with no conflicting gift1000 record':'Fixed v76 WeekLotteryPackItem free normal pack request; unique WeekLotteryPackCfg1000 zero price, limitedTimes1 and empty guildPack; explicit WeekLotteryGift and trusted WeekInfo activity4 window';
 return {module:moduleId,capabilityId:'C513',actionId:moduleId+':'+p.kind+':'+identity,actionType:'CLAIM',target,parameters:p,identity,beforeState,expectedState,costs:[],costSource:source,budgetClaims:{resources:[],quotas:[],uids:[{type:spec.chip?'free-weekly-chip-gift':spec.unique?'free-weekly-unique-lottery-gift':'free-weekly-lottery-gift',id:hash(target)}]},executable:blockedReason===null,blockedReason,label:spec.label+'免费礼包 1000',rewards:copy(def?.rewards??null),activityGain:0,...(blockedReason===null?{action:dailyTaskRewardAction(p)}:{})};
}

// C516/W17: exact chip task and round. The final unclaimed task is held until
// the server's round transition has an independently recoverable contract.
export const WEEKLY_CHIP_TASK_EVIDENCE=Object.freeze({source:'Fixed v76 WeekChipTask.ts / WeekChip.ts / ActivityWeekUtil.ts',byte:7353073,sha256:'5306147a2a46bc09ce658e92e6be10e331dce080435b6b7e5adc30c3b8d32844',semantics:'WeekChipGotTaskRequest round/taskId; cumulative score minus highest amount*(round-1); typed round, full gotTaskId and DisplayAssetPackage; held inventory only',realGame:'REAL_UNVERIFIED'});
function chipTaskDefinition(f,config,taskId=f?.parameters?.taskId){
 if(!same(configNamesFor(f?.parameters).map(n=>f?.configEvidence?.tables?.[n]??null),configNamesFor(f?.parameters).map(n=>config?.tables?.[n]??null)))return null;
 const tables=f?.configEvidence?.tables,rows=tables?.WeekChipPointsCfg?.data,periods=tables?.WeekChipPeriodCfg?.data,items=tables?.ItemCfg?.data,activity=f?.daily?.activityTime?.find(r=>r.type===6);
 if(!dense(rows)||!rows.length||!dense(periods)||!dense(items)||!activity||periods.some(r=>!own(r,'periodId')||!positive(r.periodId))||new Set(periods.map(r=>r.periodId)).size!==periods.length)return null;
 const period=periods.find(r=>r.periodId===activity.period);if(!period||!own(period,'round')||!positive(period.round))return null;
 let lastId=0,lastAmount=0;const definitions=[];
 for(const r of rows){
  if(!own(r,'rwdId')||!positive(r.rwdId)||r.rwdId<=lastId||!own(r,'amount')||!positive(r.amount)||r.amount<=lastAmount||!own(r,'reward')||!dense(r.reward)||!r.reward.length)return null;
  const rewards=[];
  for(const pair of r.reward){
   if(!dense(pair)||pair.length!==2||!text(pair[0])||!positive(pair[1]))return null;
   const [id,num]=pair,matches=items.filter(x=>own(x,'id')&&x.id===id);
   if(!Object.values(RESOURCE_NAMES).includes(id)&&(matches.length!==1||!own(matches[0],'type')||!['通用','芯片宝箱','专武经验'].includes(matches[0].type)))return null;
   rewards.push({id,num});
  }
  if(new Set(rewards.map(r=>r.id)).size!==rewards.length)return null;
  definitions.push({taskId:r.rwdId,amount:r.amount,rewards});lastId=r.rwdId;lastAmount=r.amount;
 }
 const row=definitions.find(r=>r.taskId===taskId);
 return row?{...row,ids:definitions.map(r=>r.taskId),roundAmount:lastAmount,maxRound:period.round}:null;
}
function chipTaskCandidate(f,{config,moduleConfig={enabled:false},parameters=f?.parameters}={}){
 const p=copy(parameters),valid=authority(f)&&same(p,f.parameters),def=chipTaskDefinition(f,config),activity=currentWeek(f),beforeState=copy(f?.state??null),claimed=f?.daily?.gotTaskId;
 const known=def&&claimed?.every(id=>def.ids.includes(id)),roundKnown=def&&positive(f?.daily?.round)&&f.daily.round===p.round&&p.round<=def.maxRound;
 const progress=roundKnown?f.daily.score-def.roundAmount*(p.round-1):null;let expectedState=null;
 if(valid&&known&&roundKnown)expectedState=dailyTaskRewardExpectedState(beforeState,p,def.rewards,0,f.stock);
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'WEEKLY_CHIP_TASK_AUTHORITY_UNKNOWN':!def||!known?'WEEKLY_CHIP_TASK_CONFIG_UNKNOWN':!roundKnown?'WEEKLY_CHIP_TASK_ROUND_UNKNOWN':claimed.includes(p.taskId)?'WEEKLY_CHIP_TASK_ALREADY_CLAIMED':!Number.isSafeInteger(progress)||progress<def.amount?'WEEKLY_CHIP_TASK_INCOMPLETE':claimed.length===def.ids.length-1?'WEEKLY_CHIP_ROUND_TRANSITION_UNVERIFIED':!activity?'WEEKLY_GIFT_PERIOD_UNKNOWN':!expectedState?'REWARD_BALANCE_UNKNOWN':!['WeekChipGotTaskRequest','WeekChipGotTaskResponse'].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const target={...p,type:6,period:activity?.period??null,startTime:activity?.startTime??null,endTime:activity?.endTime??null},identity=hash({target,beforeState,def,configEvidence:f?.configEvidence});
 return {module:moduleId,capabilityId:'C516',actionId:moduleId+':weekly-chip-task:'+identity,actionType:'CLAIM',target,parameters:p,identity,beforeState,expectedState,costs:[],costSource:'Fixed v76 WeekChipTask exact round/taskId; WeekChipPointsCfg and matching WeekChipPeriodCfg; score minus full prior-round maxima; no round-transition inference',budgetClaims:{resources:[],quotas:[],uids:[{type:'weekly-chip-task-reward',id:hash(target)}]},executable:blockedReason===null,blockedReason,label:'周芯片第'+p.round+'轮任务 '+p.taskId,rewards:copy(def?.rewards??null),activityGain:0,progress,requiredProgress:def?.amount??null,...(blockedReason===null?{action:dailyTaskRewardAction(p)}:{})};
}
// Rebind only the original complete same-source activity survey, with no query,
// future progress or new eligibility algorithm.
export function activityTaskClosingFact(f,parameters,config){
 const owner=liveFacts.get(f),chip=f?.parameters?.kind==='weekly-chip-task',rank=isOpenRank(f?.parameters);
 if(!owner||!chip&&!rank||parameters?.kind!==f?.parameters?.kind||!authority(f))return null;
 if(chip?parameters.round!==f.daily?.round||!currentWeek(f)||!chipTaskDefinition(f,config,parameters.taskId):!currentOpenRankWindow(f)||!openRankTaskDefinition(f,config,parameters.tierId))return null;
 const target={...f,parameters:copy(parameters)};liveFacts.set(target,{client:owner.client,player:owner.player,digest:digest(target)});return target;
}
export function activityTaskClosingChoices(f,{config,moduleConfig={enabled:false}}={}){
 const unknown={status:'UNKNOWN',round:null,maximumClaims:null,targets:[]},chip=f?.parameters?.kind==='weekly-chip-task',rank=isOpenRank(f?.parameters);
 if(!chip&&!rank||!authority(f)||!(chip?currentWeek(f):currentOpenRankWindow(f)))return unknown;
 const definition=chip?chipTaskDefinition(f,config):openRankTaskDefinition(f,config),claimed=chip?f.daily.gotTaskId:f.daily.gotRewardId;if(!definition||claimed.some(id=>!definition.ids.includes(id)))return unknown;
 const targets=definition.ids.flatMap(id=>{const parameters=chip?{kind:'weekly-chip-task',round:f.daily.round,taskId:id}:{kind:f.parameters.kind,tierId:id},source=activityTaskClosingFact(f,parameters,config);if(!source)return [];const row=candidateFor(source,{config,moduleConfig});return [{parameters:copy(parameters),rewards:copy(row.rewards),budgetClaims:copy(row.budgetClaims),costs:[],executable:row.executable,blockedReason:row.blockedReason}];});
 return {status:'OBSERVED',round:chip?f.daily.round:null,maximumClaims:Math.max(0,definition.ids.length-claimed.length-(chip?1:0)),targets};
}
function chipTaskReceipt(raw,op){
 if(!own(raw,'round')||raw.round!==op.parameters.round||!own(raw,'gotTaskId')||!dense(raw.gotTaskId)||raw.gotTaskId.some(v=>!positive(v))||new Set(raw.gotTaskId).size!==raw.gotTaskId.length||!same([...raw.gotTaskId].sort((a,b)=>a-b),op.expectedState.daily.gotTaskId)||!own(raw,'reward')||!own(raw.reward,'asset')||!dense(raw.reward.asset))return false;
 const rows=[];
 for(const a of raw.reward.asset){const num=own(a,'num')?safeResourceQuantity(a.num):null;if(!own(a,'type')||a.type!==0||!own(a,'id')||!text(a.id)||num===null||num<=0)return false;rows.push({id:a.id,num});}
 return same(rows,op.rewards);
}

// C517 task milestones share one adapter; rank payouts remain a distinct contract.
export const OPEN_RANK_TASK_REWARD_EVIDENCE=Object.freeze({source:'Fixed v76 OpenRankType / OpenRankTaskItem / OpenRankOrderPanel / OpenRankStagePanel / OpenRankPiratePanel / OpenRankWarPanel / OpenRankUtil',semantics:'ORA_ORDER=1/ORA_STAGE=2/ORA_PIRATE=3/ORA_WAR=4; id is cfg.score. Order/Stage use direct tables; Pirate/War select exact current season otherwise the maximum configured season. Single-task rewards have no debit. Independent same-type Info/endTime/private window and exact inventory net income remain mandatory; rank payouts and opening boxes are excluded.',realGame:'REAL_UNVERIFIED'});
export const OPEN_RANK_WAR_REWARD_EVIDENCE=Object.freeze({source:'Fixed v76 OpenRankTaskItem / OpenRankWarPanel / OpenRankUtil / AllActivityModel',itemByte:5068559,itemSha256:'6975e69626117c1735c0fbf472096bde6e3b4cf334b538351e3a5bc355475928',warByte:5075868,warSha256:'70be7be0cdc04e11e2be3d4a044c6087041055fd68aa57b9c26f4a34eb2242a2',utilByte:5071461,utilSha256:'46ddbaeda9eb0ab75d3d4b6f4325d7d8027dd2fb987a550d6d8087e693b0c040',semantics:'type4/id=cfg.score; exact current-season group or maximum configured season; explicit progress and gotRewardId, current continuous-stream window and matching OpenRankInfo.endTime; no dedicated reward response is assumed',realGame:'REAL_UNVERIFIED'});
function openRankWindow(client,context,parameters){
 const s=readOpenRankActivitySnapshot(client,context);return s.status==='OBSERVED'&&s.reliable===true?s.activityTime.find(r=>r.type===openRankSpec(parameters)?.type)??null:null;
}
function parseOpenRankInfo(raw){
 if(!['endTime','progress'].every(k=>own(raw,k)&&uint(raw[k]))||!positive(raw.endTime)||!own(raw,'gotRewardId')||!dense(raw.gotRewardId)||raw.gotRewardId.some(id=>!positive(id))||new Set(raw.gotRewardId).size!==raw.gotRewardId.length)return null;
 return {endTime:raw.endTime,progress:raw.progress,gotRewardId:[...raw.gotRewardId].sort((a,b)=>a-b)};
}
function currentOpenRankWindow(f){
 const live=liveFacts.get(f),window=f?.state?.window,clock=live?clockOf(live.client,f.context):null;
 return window&&window.type===openRankSpec(f?.parameters)?.type&&window.endTime===f?.daily?.endTime&&clock&&f.startClock&&f.endClock&&f.startClock.earliestMs<=f.endClock.earliestMs&&f.endClock.earliestMs<=clock.earliestMs&&[f.startClock,f.endClock,clock].every(c=>c.earliestMs>=window.startTime*1000&&c.latestMs<window.endTime*1000)?window:null;
}
function openRankTaskDefinition(f,config,tierId=f?.parameters?.tierId){
 if(!same(configNamesFor(f?.parameters).map(n=>config?.tables?.[n]??null),configNamesFor(f?.parameters).map(n=>f?.configEvidence?.tables?.[n]??null)))return null;
 const spec=openRankSpec(f?.parameters),rows=f?.configEvidence?.tables?.[spec?.table]?.data,items=f?.configEvidence?.tables?.ItemCfg?.data,world=roleId(f?.context?.worldId);if(!world||!dense(rows)||!rows.length||!dense(items))return null;
 const season=spec.seasonal?Number(BigInt(world)/1000000n%1000n):null;if(spec.seasonal&&!positive(season)||rows.some(r=>!own(r,'score')||!positive(r.score)||(spec.seasonal?!own(r,'season')||!positive(r.season):own(r,'season')))||new Set(rows.map(r=>(spec.seasonal?r.season+':':'')+r.score)).size!==rows.length)return null;
 const configuredSeason=spec.seasonal?(rows.some(r=>r.season===season)?season:Math.max(...rows.map(r=>r.season))):null,selected=spec.seasonal?rows.filter(r=>r.season===configuredSeason):rows,row=selected.find(r=>r.score===tierId);if(!row||!own(row,'reward')||!dense(row.reward)||!row.reward.length)return null;
 const rewards=[];
 for(const pair of row.reward){
  if(!dense(pair)||pair.length!==2||!text(pair[0])||!Number.isSafeInteger(pair[1])||pair[1]<=0)return null;
  const [id,num]=pair,matches=items.filter(r=>own(r,'id')&&r.id===id);
  if(!Object.values(RESOURCE_NAMES).includes(id)&&(matches.length!==1||!own(matches[0],'type')||!['通用','自选包','专武经验','藏品万能碎片','英雄万能碎片','芯片宝箱'].includes(matches[0].type)))return null;
  rewards.push({id,num});
 }
 return new Set(rewards.map(r=>r.id)).size===rewards.length?{season,configuredSeason,ids:selected.map(r=>r.score),rewards}:null;
}
function openRankTaskCandidate(f,{config,moduleConfig={enabled:false},parameters=f?.parameters}={}){
 const p=copy(parameters),valid=authority(f)&&same(p,f.parameters),def=openRankTaskDefinition(f,config),window=currentOpenRankWindow(f),beforeState=copy(f?.state??null),claimed=f?.daily?.gotRewardId,known=def&&claimed?.every(id=>def.ids.includes(id));let expectedState=null;
 if(valid&&known){
  const next=copy(beforeState),stock=new Map(f.stock);let safe=true;
  for(const {id,num}of def.rewards){const start=stock.get(id),total=(start??0)+num;if(Object.values(RESOURCE_NAMES).includes(id)&&start===undefined||!Number.isSafeInteger(total))safe=false;stock.set(id,total);}
  if(safe){next.inventory=stockState(stock);next.daily.gotRewardId=[...claimed,p.tierId].sort((a,b)=>a-b);expectedState=next;}
 }
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'OPEN_RANK_AUTHORITY_UNKNOWN':!def||!known?'OPEN_RANK_CONFIG_OR_CLAIMS_UNKNOWN':claimed.includes(p.tierId)?'OPEN_RANK_ALREADY_CLAIMED':f.daily.progress<p.tierId?'OPEN_RANK_INCOMPLETE':!window?'OPEN_RANK_WINDOW_UNKNOWN':!expectedState?'REWARD_BALANCE_UNKNOWN':!f.available.includes('GotOpenRankRewardRequest')?'PROTOCOL_UNAVAILABLE':null;
 const target={...p,type:openRankSpec(p).type,startTime:window?.startTime??null,endTime:window?.endTime??null,season:def?.season??null,configuredSeason:def?.configuredSeason??null},identity=hash({target,beforeState,def,configEvidence:f?.configEvidence});
 return {module:moduleId,capabilityId:'C517',actionId:moduleId+':'+p.kind+':'+identity,actionType:'CLAIM',target,parameters:p,identity,beforeState,expectedState,costs:[],costSource:p.kind==='open-rank-war'?'Fixed v76 OpenRankTaskItem type/id=cfg.score, no debit; OpenRankUtil exact season otherwise maximum configured season; current private type4 window and independent OpenRankInfo':'Fixed v76 OpenRankTaskItem type/id=cfg.score, no debit; current private mode-specific window and independent OpenRankInfo; Order/Stage direct tables, Pirate exact season otherwise maximum configured season',budgetClaims:{resources:[],quotas:[],uids:[{type:p.kind+'-task-reward',id:hash({playerId:f?.context?.playerId,worldId:f?.context?.worldId,target})}]},executable:blockedReason===null,blockedReason,label:openRankSpec(p).label+'档位 '+p.tierId,rewards:copy(def?.rewards??null),activityGain:0,progress:f?.daily?.progress??null,requiredProgress:p.tierId,...(blockedReason===null?{action:{request:'GotOpenRankRewardRequest',response:null,body:buildOpenRankTaskRewardBody(openRankSpec(p).type,p.tierId)}}:{})};
}

export const WEEKLY_BATTLE_PASS_TASK_EVIDENCE=Object.freeze({source:'Fixed v76 WeekTaskItem.ts / WeekBattlePass.ts / WeekPassTaskCfg; existing protocol WeekBattlePassInfoResponse/WeekBattlePassTask/WeekBattlePassItem',semantics:'Exact taskId/progress(int64)/isGot; target from WeekPassTaskCfg.target. Info.score and FinishTaskResponse.score are cumulative totals. got(stage,freeGot,payGot) records are independent of tasks. WeekInfo type1 window does not prove a daily task epoch or bind an Info response to that window.',realGame:'REAL_UNVERIFIED'});
// Preserve the original Info and WeekInfo parsers as distinct read-only sources.
// Their presence together never establishes a task epoch or a claim authority.
function parseBattlePassInfo(raw){
 if(!own(raw,'score')||!uint(raw.score)||!own(raw,'activePay')||typeof raw.activePay!=='boolean'||!own(raw,'task')||!dense(raw.task)||!own(raw,'got')||!dense(raw.got))return null;
 const tasks=raw.task.map(row=>{const progress=own(row,'progress')?achievementProgressCount(row.progress):null;return own(row,'taskId')&&positive(row.taskId)&&progress!==null&&own(row,'isGot')&&typeof row.isGot==='boolean'?{taskId:row.taskId,progress,isGot:row.isGot}:null;});
 const got=raw.got.map(row=>own(row,'stage')&&positive(row.stage)&&['freeGot','payGot'].every(k=>own(row,k)&&typeof row[k]==='boolean')?{stage:row.stage,freeGot:row.freeGot,payGot:row.payGot}:null);
 if(tasks.some(row=>!row)||got.some(row=>!row)||new Set(tasks.map(row=>row.taskId)).size!==tasks.length||new Set(got.map(row=>row.stage)).size!==got.length)return null;
 return {score:raw.score,activePay:raw.activePay,tasks:tasks.sort((a,b)=>a.taskId-b.taskId),got:got.sort((a,b)=>a.stage-b.stage)};
}
function parseBattlePassWindow(week){
 if(!own(week,'activityTime')||!dense(week.activityTime))return null;
 const rows=week.activityTime.map(row=>['type','period','startTime','endTime'].every(k=>own(row,k)&&positive(row[k]))&&row.startTime<row.endTime?{type:row.type,period:row.period,startTime:row.startTime,endTime:row.endTime}:null);
 return rows.some(row=>!row)||new Set(rows.map(row=>row.type)).size!==rows.length?null:rows.sort((a,b)=>a.type-b.type);
}
function parseBattlePass(raw,week){
 const info=parseBattlePassInfo(raw),activityTime=parseBattlePassWindow(week);
 return info&&activityTime?{...info,activityTime}:null;
}
// Fixed history whitelist of the original two independent read projections.
// Reuse their parsers; historical counters never become claim or epoch facts.
export function validateBattlePassObservationSummary(value){
 const keys=['version','taskId','infoStatus','infoSource','infoSourceAt','info','windowStatus','windowSource','windowSourceAt','activityWindow','readOnly','claimable','executable','autoResume','periodBinding','dailyEpoch','scoreReceipt'];
 const exact=(v,names)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===names.length&&Reflect.ownKeys(v).every(key=>names.includes(key)&&Object.getOwnPropertyDescriptor(v,key)?.enumerable&&own(v,key));
 const time=v=>Number.isSafeInteger(v)&&v>=0;
 if(!exact(value,keys)||value.version!==1||!positive(value.taskId)||!['OBSERVED','UNKNOWN'].includes(value.infoStatus)||!['OBSERVED','UNKNOWN'].includes(value.windowStatus)||
    value.infoSource!=='WeekBattlePassInfoResponse'||value.windowSource!=='WeekInfoResponse'||value.readOnly!==true||value.claimable!==null||value.executable!==false||value.autoResume!==false||value.periodBinding!=='UNPROVEN'||value.dailyEpoch!=='UNKNOWN'||value.scoreReceipt!=='UNKNOWN')throw invalid('战令历史须保留两个原来源及只读边界');
 if(value.infoStatus==='UNKNOWN'){
  if(value.infoSourceAt!==null||value.info!==null)throw invalid('未知战令Info不得补入积分或任务');
 }else{
  const info=value.info;
  if(!time(value.infoSourceAt)||!exact(info,['score','activePay','task','got'])||!dense(info.task)||info.task.length>1)throw invalid('战令Info历史缺少原时间或精确任务');
  const parsed=parseBattlePassInfo(info);
  if(!parsed||parsed.tasks.some(row=>row.taskId!==value.taskId)||!same({score:parsed.score,activePay:parsed.activePay,task:parsed.tasks,got:parsed.got},info))throw invalid('战令Info历史字段与原解析不一致');
 }
 if(value.windowStatus==='UNKNOWN'){
  if(value.windowSourceAt!==null||value.activityWindow!==null)throw invalid('未知战令窗口不得补入活动身份');
 }else{
  if(!time(value.windowSourceAt))throw invalid('战令窗口历史缺少原时间');
  const activityTime=value.activityWindow===null?[]:[value.activityWindow],parsed=parseBattlePassWindow({activityTime});
  if(!parsed||parsed.some(row=>row.type!==1)||!same(parsed,activityTime))throw invalid('战令窗口历史与原WeekInfo type1观察不一致');
 }
 return copy(value);
}
export function summarizeBattlePassObservation(view){
 const observation=view?.battlePassObservation;if(observation===undefined)return null;
 const task=observation.progress===null?[]:[{taskId:observation.taskId,progress:observation.progress,isGot:observation.taskRewardState==='CLAIMED_RECORD'}];
 if(observation.progress!==null&&!['CLAIMED_RECORD','UNCLAIMED_RECORD'].includes(observation.taskRewardState))throw invalid('战令任务历史缺少明确奖励记录');
 return validateBattlePassObservationSummary({version:1,taskId:observation.taskId,infoStatus:observation.status,infoSource:'WeekBattlePassInfoResponse',infoSourceAt:observation.sourceAt,
  info:observation.status==='OBSERVED'?{score:observation.totalScore,activePay:observation.activePay,task,got:copy(observation.rewardStages)}:null,
  windowStatus:observation.windowStatus,windowSource:'WeekInfoResponse',windowSourceAt:observation.windowSourceAt,activityWindow:copy(observation.activityWindow),
  readOnly:true,claimable:null,executable:false,autoResume:false,periodBinding:'UNPROVEN',dailyEpoch:'UNKNOWN',scoreReceipt:'UNKNOWN'});
}
function battlePassSource(f,key,value){
 if(f?.parameters?.kind!=='weekly-battle-pass-task'||!liveSourceAuthority(f)||value===null)return null;
 const source=f.sourceFacts?.[key];
 if(source?.provenance?.source!==sourcesFor(f.parameters)[key]||!same(source.value,f.inputs[key]))return null;
 const fact=createStateFact(value,{...source.provenance,reliable:true});
 return factsFreshnessPolicy(fact,{accountId:f.context.accountId,generation:f.context.generation,maxAgeMs:30000,scope}).status==='FRESH'?fact:null;
}
function viewBattlePassTask(f,{config,parameters=f?.parameters}={}){
 const matches=same(parameters,f?.parameters);
 const info=matches?battlePassSource(f,'daily',parseBattlePassInfo(f?.inputs?.daily)):null;
 const window=matches?battlePassSource(f,'week',parseBattlePassWindow(f?.inputs?.week)):null;
 const observed=info?.value??null;
 const source=f?.configEvidence?.tables?.WeekPassTaskCfg,rows=source?.data;
 const configs=same(source,config?.tables?.WeekPassTaskCfg)&&dense(rows)&&rows.length&&rows.every(row=>own(row,'taskId')&&positive(row.taskId))&&new Set(rows.map(row=>row.taskId)).size===rows.length?rows:null;
 const row=configs?.find(row=>row.taskId===parameters.taskId),target=row&&own(row,'target')?achievementProgressCount(row.target):null;
 const known=row&&target!==null&&target!=='0'&&own(row,'type')&&text(row.type)&&own(row,'score')&&positive(row.score),task=observed?.tasks.find(task=>task.taskId===parameters.taskId);
 const completion=task&&known?BigInt(task.progress)>=BigInt(target)?'COMPLETE':'INCOMPLETE':'UNKNOWN';
 return {module:moduleId,candidates:[],targetSelection:{kind:'weekly-battle-pass-task',readOnly:true,status:observed?'OBSERVED_TASKS':'UNKNOWN',field:'taskId',targets:observed?observed.tasks.map(task=>({id:task.taskId})):null,round:null},battlePassObservation:{status:observed?'OBSERVED':'UNKNOWN',sourceAt:info?.provenance.sourceAt??null,windowStatus:window?'OBSERVED':'UNKNOWN',windowSourceAt:window?.provenance.sourceAt??null,readOnly:true,taskId:parameters.taskId,taskType:known?row.type:null,description:known&&own(row,'desc')&&typeof row.desc==='string'?row.desc:null,progress:task?.progress??null,requiredProgress:known?target:null,completion,taskRewardState:task?task.isGot?'CLAIMED_RECORD':'UNCLAIMED_RECORD':'UNKNOWN',claimable:null,expectedTaskScore:known?row.score:null,totalScore:observed?.score??null,activePay:observed?.activePay??null,rewardStages:copy(observed?.got??null),activityWindow:copy(window?.value.find(row=>row.type===1)??null),periodBinding:'UNPROVEN',dailyEpoch:'UNKNOWN',scoreReceipt:'UNKNOWN',executable:false,blockedReason:'WEEKLY_BATTLE_PASS_PERIOD_AND_SETTLEMENT_UNVERIFIED'},notes:[...(f?.notes??[]),'战令只读：任务完成、任务已领记录、普通/付费档位记录、累计积分各自独立；WeekInfo type1窗口不证明本任务的每日周期或绑定归属。积分不是增量，到账未知；不生成领取动作、许可或重启恢复权限。']};
}
