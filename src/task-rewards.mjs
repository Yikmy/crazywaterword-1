// W16/C502/C503/BIZ-A10: exact task reward IDs; the shared executor owns writes.
import { createHash } from 'node:crypto';
import { readMonthCardRewardSnapshot } from './client.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { ACTIONS, buildBody, assertPaymentAllowed } from './actions.mjs';
import { surveyDailyTaskReward, viewDailyTaskReward, planDailyTaskReward, verifyDailyTaskReward, dailyTaskRewardDependencyVersions, prepareDailyRewardWorkflow, activityTaskClosingFact, activityTaskClosingChoices, OPEN_RANK_TASK_KINDS } from './daily-task-rewards.mjs';
import { taskTarget, achievementProgressCount, parseTaskObservation, taskConfigurationRow, taskQualification } from './tasks.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, RESOURCE_NAMES, safeResourceQuantity, normalizeBudgetClaims } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';

export { OPEN_RANK_TASK_KINDS };
const moduleId = 'task-rewards', scope = { kind: 'ACCOUNT' };
const closingGiftKinds = ['daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'];
const copy = value => structuredClone(value), same = (a,b) => stableBusinessValue(a) === stableBusinessValue(b);
const hash = value => createHash('sha256').update(stableBusinessValue(value)).digest('hex');
const own = (v,k) => v !== null && typeof v === 'object' && Object.hasOwn(v,k);
const positive = n => Number.isInteger(n) && n > 0 && n <= 2147483647;
const identifier = s => typeof s === 'string' && s.length > 0 && s.length <= 200 && s.trim() === s;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype,null].includes(Object.getPrototypeOf(v));
const fields = (v,keys) => plain(v) && Reflect.ownKeys(v).every(k => keys.includes(k) && Object.getOwnPropertyDescriptor(v,k)?.enumerable && own(Object.getOwnPropertyDescriptor(v,k),'value'));
const dense = v => Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= 10000 && Reflect.ownKeys(v).length === v.length+1 && Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&own(d,'value'));
const invalid = message => Object.assign(new Error(message), {code:'INVALID_PARAMETERS',statusCode:400});
const sources = { tasks:'MainTaskInfoResponse', items:'AllItemResponse', resources:'AllResourceResponse' };
const configNames = ['MainTaskCfg','BranchTaskCfg','AchievementTaskCfg','ItemCfg'];
const sourcesFor = parameters => parameters?.kind==='achievement'?{...sources,tasks:'AchievementInfoResponse'}:sources;
const liveTaskFacts = new WeakMap();
const sealOf = f => hash({parameters:f.parameters,inputs:f.inputs,context:f.context,configEvidence:f.configEvidence,sourceFacts:f.sourceFacts,available:f.available});
export const ACHIEVEMENT_REWARD_EVIDENCE = Object.freeze({
  source:'Fixed v76 main/game.js; FunctionPreviewItem.initData/_toGotReward and AchievementUtil.achieveTaskCfg',
  functionPreviewItemByte:2823786, achievementModelByte:24520,
  semantics:'DispAchievementTask.id -> AchievementTaskCfg.taskId; flat reward; exact {id}; observed progress/targetProgress and explicit rewardClaimed'
});
function parseAchievements(raw) {
  if(!own(raw,'task')||!dense(raw.task))return null;
  const rows=raw.task.map(row=>parseTaskObservation(row,'achievement'));
  return rows.some(row=>row===null)||new Set(rows.map(row=>row.taskId)).size!==rows.length?null:{achievements:rows.sort((a,b)=>a.taskId-b.taskId)};
}
const parseFor = (raw,parameters) => parameters?.kind==='achievement'?parseAchievements(raw):parseTasks(raw);
const rewardActionFor = kind => kind==='achievement'?ACTIONS.achievementDraw:kind==='main'?ACTIONS.taskDrawMain:ACTIONS.taskDrawBranch;
export function taskRewardAction(parameters) {
 const p=validateTaskRewardsParameters(parameters);
 if(!['main','branch','achievement'].includes(p.kind))throw invalid('复核仅支持原明确主线、支线或成就任务');
 const action=rewardActionFor(p.kind);
 return {request:action.request,response:null,body:buildBody(action,p.kind==='achievement'?{id:p.taskId}:{taskId:p.taskId})};
}
const requestOf = kind => rewardActionFor(kind).request;
const costSource = 'Existing taskTarget and fixed v76 achievement ID mapping; MainTaskCfg/BranchTaskCfg/AchievementTaskCfg.reward; one exact task ID, no resource debit or purchase';
export const TASK_REWARDS_DEFAULT_CONFIG = Object.freeze({enabled:false});
export function validateTaskRewardsConfig(v={}) {
  if (!fields(v,['enabled']) || own(v,'enabled') && typeof v.enabled !== 'boolean') throw invalid('任务奖励配置只接受 enabled 布尔值');
  return {enabled:v.enabled??false};
}
export function validateTaskRewardsParameters(v={}) {
  if(!fields(v,['kind','taskId','tierId','packId','round','expectedResetTime','cardType']))throw invalid('任务奖励仅接受明确任务或日活跃档位');
  if(!Reflect.ownKeys(v).length)return {};
  if(v.kind==='month-card-gift'){if(['taskId','tierId','packId','round','expectedResetTime'].some(k=>own(v,k))||own(v,'cardType')&&![1,2].includes(v.cardType))throw invalid('月卡每日权益只接受明确普通/高级cardType=1/2，不指定日界、奖励或购买');return {kind:v.kind,...(own(v,'cardType')?{cardType:v.cardType}:{})};}
  if(own(v,'cardType'))throw invalid('cardType仅用于月卡每日权益');
  const period=own(v,'expectedResetTime')?{expectedResetTime:v.expectedResetTime}:{};
  if(own(v,'expectedResetTime')&&(!['daily','daily-activity'].includes(v.kind)||!positive(v.expectedResetTime)))throw invalid('expectedResetTime仅用于明确日常任务或日活跃，须为服务器原正int32重置秒');
  if(v.kind==='weekly-chip-task'){if(!own(v,'kind')||!own(v,'round')||!positive(v.round)||!own(v,'taskId')||!positive(v.taskId)||own(v,'packId')||own(v,'tierId'))throw invalid('周芯片领奖须明确正整数round与taskId');return {kind:v.kind,round:v.round,taskId:v.taskId};}
  if(v.kind==='weekly-battle-pass-task'){if(!own(v,'kind')||!own(v,'taskId')||!positive(v.taskId)||['round','packId','tierId'].some(k=>own(v,k)))throw invalid('战令只读观察须明确kind与正int32任务ID');return {kind:v.kind,taskId:v.taskId};}
  if(own(v,'round'))throw invalid('round仅用于周芯片具名任务领奖');
  if(['weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift'].includes(v.kind)){if(!own(v,'kind')||!own(v,'packId')||v.packId!=='1000'||own(v,'taskId')||own(v,'tierId'))throw invalid('周活动免费礼包仅允许明确转盘/翻牌/芯片种类与packId=1000');return {kind:v.kind,packId:v.packId};}
  if(v.kind==='daily-gift'){if(!own(v,'kind')||!own(v,'packId')||v.packId!=='赠礼'||own(v,'taskId')||own(v,'tierId'))throw invalid('免费日赠礼仅允许kind=daily-gift与明确packId=赠礼');return {kind:v.kind,packId:v.packId};}
  if(own(v,'packId'))throw invalid('packId仅用于明确免费赠礼');
  if(OPEN_RANK_TASK_KINDS.includes(v.kind)){if(!own(v,'kind')||own(v,'taskId')||!own(v,'tierId')||!positive(v.tierId))throw invalid('开服任务领奖须明确种类与正整数score档位tierId');return {kind:v.kind,tierId:v.tierId};}
  if(v.kind==='daily-activity'){if(!own(v,'kind')||own(v,'taskId')||!own(v,'tierId')||!positive(v.tierId))throw invalid('日活跃宝箱须明确kind=daily-activity与正整数tierId');return {kind:v.kind,tierId:v.tierId,...period};}
  if(!own(v,'kind')||!['main','branch','achievement','daily'].includes(v.kind)||!own(v,'taskId')||!positive(v.taskId)||own(v,'tierId'))throw invalid('任务奖励须同时指定kind(main/branch/achievement/daily)与正整数taskId');
  return {kind:v.kind,taskId:v.taskId,...period};
}
function roleId(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  const normalized = toSnapshotJson(value);
  if (!(typeof normalized === 'number' || typeof normalized === 'string' && /^[1-9][0-9]*$/.test(normalized))) return null;
  try { const n=BigInt(normalized); return n>0n&&n<(1n<<63n)?String(n):null; } catch { return null; }
}
function contextOf(client,player) {
  const c=client.factContext, role=key=>{const id=own(player,key)?roleId(player[key]):null;return own(c,key)&&roleId(c[key])!==id?null:id;};
  return {accountId:identifier(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,
    connectionId:identifier(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId')};
}
function parseTasks(raw) {
  if (!raw || !own(raw,'branch') || !dense(raw.branch)) return null;
  const parse = (row,main) => parseTaskObservation(row,main?'main':'branch');
  const main=own(raw,'task')&&raw.task!==null?parse(raw.task,true):null;
  if (own(raw,'task')&&raw.task!==null&&!main) return null;
  const branch=raw.branch.map(row=>parse(row,false));
  if (branch.some(row=>row===null) || new Set(branch.map(row=>row.taskId)).size!==branch.length) return null;
  return {main,branch:branch.sort((a,b)=>a.taskId-b.taskId)};
}
const stockState = stock => [...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function snapshot(inputs,context,parameters) {
  const tasks=parseFor(inputs?.tasks,parameters),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
  return tasks&&inventory.stockReliable?{context,tasks,inventory:stockState(inventory.stock)}:null;
}
export async function surveyTaskRewards(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}) {
  parameters=validateTaskRewardsParameters(parameters);
  if(parameters.kind==='month-card-gift')return surveyMonthCardReward(client,protocol,{config,player,parameters,signal,stop,timeout});
  if(['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...OPEN_RANK_TASK_KINDS,'weekly-battle-pass-task'].includes(parameters.kind))return surveyDailyTaskReward(client,protocol,{config,player,parameters,signal,stop,timeout});
  const options={signal,stop},context=contextOf(client,player),notes=[],readSources=sourcesFor(parameters);
  const active=()=>assertExecutionActive(client,options); active();
  const observations=await Promise.all(Object.entries(readSources).map(async([key,response])=>{
    const request=response.replace(/Response$/,'Request'); active();
    if (!protocol?.[request] || !protocol?.[response]) {notes.push(request+': PROTOCOL_UNAVAILABLE');return [key,null,null];}
    try { const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,options);return [key,value,Date.now()]; }
    catch(error) {if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}
  }));
  active(); if(!same(context,contextOf(client,player)))throw Object.assign(new Error('任务采集期间账号或连接改变'),{code:'CANCELLED'});
  const raw=Object.fromEntries(observations.map(([key,value])=>[key,value])),inputs=toSnapshotJson(raw);
  const tasks=parseFor(raw.tasks,parameters),inventory=parseOperationInventory(raw.items,raw.resources);
  const sourceFacts=Object.fromEntries(observations.map(([key,,sourceAt])=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,source:readSources[key],sourceAt,scope,reliable:key==='tasks'?tasks!==null:inventory.stockReliable})]));
  const facts={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(name=>[name,copy(config?.tables?.[name]??null)]))},inputs,sourceFacts,tasks,...inventory,state:tasks&&inventory.stockReliable?snapshot(inputs,context,parameters):null,available:Object.keys(protocol??{}),notes};
  liveTaskFacts.set(facts,{client,player,seal:sealOf(facts)});
  return facts;
}
function authority(f) {
  const c=f?.context;
  if(!identifier(c?.accountId)||!identifier(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
  if(f.parameters?.kind==='achievement') {
    const live=liveTaskFacts.get(f);
    if(!live||live.client.connected!==true||!same(contextOf(live.client,live.player),c)||live.seal!==sealOf(f))return false;
  }
  const state=snapshot(f.inputs,c,f.parameters);
  const parsed=parseOperationInventory(f.inputs?.items,f.inputs?.resources);
  if(!same(state,f.state)||!same(f.tasks,state?.tasks)||!same([...f.stock].sort(),[...parsed.stock].sort()))return false;
  return Object.entries(sourcesFor(f.parameters)).every(([key,source])=>f.sourceFacts?.[key]?.provenance?.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function configuredRewards(config,rewards){
  const itemRows=config?.tables?.ItemCfg?.data,known=new Set(Object.values(RESOURCE_NAMES));
  if(dense(itemRows))for(const item of itemRows)if(own(item,'id')&&identifier(item.id))known.add(item.id);
  if(!dense(rewards)||!rewards.length)return null;
  const seen=new Set(),parsed=[];
  for(const pair of rewards) {
    if(!dense(pair)||pair.length!==2||!known.has(pair[0])||seen.has(pair[0])||!Number.isSafeInteger(pair[1])||pair[1]<=0)return null;
    seen.add(pair[0]);parsed.push({id:pair[0],num:pair[1]});
  }
  return parsed;
}
function definition(config,kind,taskId,task) {
  const row=taskConfigurationRow(config,kind,taskId),target=kind==='achievement'?task?.targetProgress:taskTarget(row),rewards=kind==='achievement'?(dense(row?.reward)&&row.reward.length===2?[row.reward]:null):row?.reward;
  if((kind==='achievement'?(achievementProgressCount(target)===null||BigInt(target)<=0n):!Number.isSafeInteger(target)||target<=0))return null;
  const parsed=configuredRewards(config,rewards);if(!parsed)return null;
  return {kind,taskId,target,rewards:parsed,description:typeof row.desc==='string'?row.desc:''};
}
// Durable state uses the same normalized task rows and full-inventory projection.
// It carries no eligibility, configuration, permit or replay authority.
export function parseTaskRewardState(value,parameters) {
 let p;try{p=validateTaskRewardsParameters(parameters);}catch{return null;}
 if(!['main','branch','achievement'].includes(p.kind)||!fields(value,['context','tasks','inventory'])||Reflect.ownKeys(value).length!==3)return null;
 const c=value.context,keys=['accountId','generation','connectionId','playerId','worldId'];
 if(!fields(c,keys)||Reflect.ownKeys(c).length!==keys.length||!identifier(c.accountId)||!identifier(c.connectionId)||!Number.isSafeInteger(c.generation)||c.generation<0||roleId(c.playerId)!==c.playerId||roleId(c.worldId)!==c.worldId||!c.playerId||!c.worldId)return null;
 const parseRow=(row,kind)=>{const keys=kind==='achievement'?['taskId','progress','targetProgress','rewardClaimed']:kind==='main'?['taskId','progress','rewardClaimed']:['taskId','progress'];if(!fields(row,keys)||Reflect.ownKeys(row).length!==keys.length)return null;const parsed=parseTaskObservation(kind==='achievement'?{id:row.taskId,progress:row.progress,targetProgress:row.targetProgress,rewardClaimed:row.rewardClaimed}:row,kind);return parsed&&same(parsed,row)?parsed:null;};
 const list=(rows,kind)=>{if(!dense(rows))return null;const parsed=rows.map(row=>parseRow(row,kind));return parsed.some(row=>!row)||new Set(parsed.map(row=>row.taskId)).size!==parsed.length?null:parsed.sort((a,b)=>a.taskId-b.taskId);};
 const t=value.tasks;let tasks;
 if(p.kind==='achievement'){if(!fields(t,['achievements'])||Reflect.ownKeys(t).length!==1)return null;const achievements=list(t.achievements,'achievement');if(!achievements)return null;tasks={achievements};}
 else{if(!fields(t,['main','branch'])||Reflect.ownKeys(t).length!==2)return null;const main=t.main===null?null:parseRow(t.main,'main'),branch=list(t.branch,'branch');if(t.main!==null&&!main||!branch)return null;tasks={main,branch};}
 if(!same(tasks,t)||!dense(value.inventory)||value.inventory.some(row=>!fields(row,['id','num'])||Reflect.ownKeys(row).length!==2||!identifier(row.id)||!Number.isSafeInteger(row.num)||row.num<=0)||new Set(value.inventory.map(row=>row.id)).size!==value.inventory.length)return null;
 const inventory=stockState(new Map(value.inventory.map(row=>[row.id,row.num])));
 return same(inventory,value.inventory)?{context:copy(c),tasks,inventory}:null;
}
export function parseTaskRewardSources(inputs,context,parameters) {
 const state=snapshot(toSnapshotJson(inputs),context,parameters);
 return state?parseTaskRewardState(state,parameters):null;
}
export function taskRewardExpectedState(before,parameters,rewards,balances) {
 const state=parseTaskRewardState(before,parameters),p=parameters;
 if(!state||!(balances instanceof Map)||!dense(rewards)||!rewards.length||rewards.some(row=>!fields(row,['id','num'])||Reflect.ownKeys(row).length!==2||!identifier(row.id)||!Number.isSafeInteger(row.num)||row.num<=0)||new Set(rewards.map(row=>row.id)).size!==rewards.length)return null;
 if([...balances].some(([id,num])=>!identifier(id)||!Number.isSafeInteger(num)||num<0)||!same(stockState(balances),state.inventory))return null;
 const task=p.kind==='achievement'?state.tasks.achievements.find(row=>row.taskId===p.taskId):p.kind==='main'?state.tasks.main:state.tasks.branch.find(row=>row.taskId===p.taskId);
 if(task?.taskId!==p.taskId||p.kind!=='branch'&&task.rewardClaimed!==false)return null;
 if(p.kind==='achievement'||p.kind==='main')task.rewardClaimed=true;
 else state.tasks.branch=state.tasks.branch.filter(row=>row.taskId!==p.taskId);
 const stock=new Map(balances);
 for(const reward of rewards){if(Object.values(RESOURCE_NAMES).includes(reward.id)&&!stock.has(reward.id))return null;const next=(stock.get(reward.id)??0)+reward.num;if(!Number.isSafeInteger(next))return null;stock.set(reward.id,next);}
 state.inventory=stockState(stock);return state;
}
function expected(f,p,def) {return def?taskRewardExpectedState(f?.state,p,def.rewards,f?.stock):null;}
export function verifyTaskRewardOutcome(operation,before,after,rewards,balances) {
 const no=reason=>({confirmed:false,reason}),p=operation?.parameters;
 const from=parseTaskRewardState(before,p),observed=parseTaskRewardState(after,p);
 if(!from||!observed||!same(from.context,observed.context))return no('任务复核状态或账号角色世界连接不完整');
 const expected=taskRewardExpectedState(from,p,rewards,balances);
 if(!expected||!same(operation.beforeState,from)||!same(operation.expectedState,expected)||!same(observed,expected))return no('未同时确认原精确任务状态及完整库存奖励净入');
 return {confirmed:true,afterState:copy(observed),reason:'独立复读确认精确任务领取状态与奖励净入'};
}
function candidate(f,p,{config,moduleConfig=TASK_REWARDS_DEFAULT_CONFIG}={}) {
  const task=p.kind==='achievement'?f?.tasks?.achievements?.find(row=>row.taskId===p.taskId):p.kind==='main'?f?.tasks?.main:f?.tasks?.branch?.find(row=>row.taskId===p.taskId),def=same(configNames.map(name=>config?.tables?.[name]??null),configNames.map(name=>f?.configEvidence?.tables?.[name]??null))?definition(f.configEvidence,p.kind,p.taskId,task):null;
  const after=authority(f)&&task?.taskId===p.taskId?expected(f,p,def):null;
  const qualification=taskQualification(task,def?.target,p.kind);
  let blockedReason=!validateTaskRewardsConfig(moduleConfig).enabled?'TASK_REWARDS_DISABLED':!authority(f)?'TASK_AUTHORITY_UNKNOWN':!def?'TASK_CONFIG_OR_REWARD_UNKNOWN':task?.taskId!==p.taskId?'TASK_NOT_PRESENT':qualification.rewardState==='CLAIMED'?'TASK_ALREADY_CLAIMED':qualification.completion==='INCOMPLETE'?'TASK_INCOMPLETE':qualification.claimable!==true?'TASK_STATE_UNKNOWN':!after?'REWARD_BALANCE_UNKNOWN':!f.available?.includes(requestOf(p.kind))?'PROTOCOL_UNAVAILABLE':null;
  const beforeState=copy(f?.state??null),identity=hash({p,beforeState,def}),budgetClaims={resources:[],quotas:[],uids:[{type:'task-reward',id:p.kind+':'+p.taskId}]};
  return {module:moduleId,capabilityId:'C503',actionId:moduleId+':'+p.kind+':'+p.taskId+':'+identity,actionType:'CLAIM',target:copy(p),parameters:copy(p),identity,beforeState,expectedState:after,
    costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:(p.kind==='achievement'?'成就':p.kind==='main'?'主线':'支线')+'任务 '+p.taskId+' 奖励',rewards:copy(def?.rewards??null),progress:task?.progress??null,requiredProgress:def?.target??null,qualification,
    ...(blockedReason===null?{action:taskRewardAction(p)}:{})};
}
// Read-only progress uses the original task parsers, independent of inventory
// or reward mapping. It cannot grant a write, prove settlement or restore a permit.
export function validateTaskQualificationObservation(value) {
  const keys=['kind','taskId','status','source','sourceAt','progress','requiredProgress','completion','rewardState','observedRequirementsMet','eligibility','readOnly','executable','autoResume','settlement','reason'];
  if(!fields(value,keys)||Reflect.ownKeys(value).length!==keys.length||!['main','branch','achievement'].includes(value.kind)||!positive(value.taskId)||
    !['OBSERVED','UNKNOWN'].includes(value.status)||value.source!==sourcesFor(value).tasks||
    value.sourceAt!==null&&(!Number.isSafeInteger(value.sourceAt)||value.sourceAt<0)||value.eligibility!==null||value.readOnly!==true||
    value.executable!==false||value.autoResume!==false||value.settlement!=='UNKNOWN')throw invalid('任务资格历史须为原来源的精确只读观察');
  const count=n=>value.kind==='achievement'?achievementProgressCount(n):safeResourceQuantity(n);
  if(value.requiredProgress!==null&&(count(value.requiredProgress)!==value.requiredProgress||BigInt(value.requiredProgress)<=0n)||
    value.status==='OBSERVED'&&(value.sourceAt===null||value.progress===null||count(value.progress)!==value.progress)||
    value.status==='UNKNOWN'&&value.progress!==null)throw invalid('任务资格历史进度、目标或来源时间未知');
  const task=value.status==='OBSERVED'?{taskId:value.taskId,progress:value.progress,...(value.rewardState==='CLAIMED'?{rewardClaimed:true}:value.rewardState==='UNCLAIMED'?{rewardClaimed:false}:{})}:null;
  const qualification=taskQualification(task,value.requiredProgress,value.kind);
  const reason=value.status==='UNKNOWN'?(value.sourceAt===null?'TASK_OBSERVATION_UNKNOWN':'TASK_NOT_PRESENT'):qualification.completion==='UNKNOWN'?'TASK_TARGET_UNKNOWN':'READ_ONLY_QUALIFICATION';
  if(value.completion!==qualification.completion||value.rewardState!==qualification.rewardState||value.observedRequirementsMet!==qualification.claimable||value.reason!==reason)
    throw invalid('任务资格历史与原任务解析不一致');
  return copy(value);
}
function qualificationObservations(f,parameters,choices,config) {
  const live=liveTaskFacts.get(f),c=f?.context,source=f?.sourceFacts?.tasks;
  const parsed=parseFor(f?.inputs?.tasks,f?.parameters);
  const valid=Boolean(live&&live.client.connected===true&&same(parameters,f.parameters)&&
    same(contextOf(live.client,live.player),c)&&live.seal===sealOf(f)&&
    identifier(c?.accountId)&&identifier(c?.connectionId)&&Number.isSafeInteger(c?.generation)&&c.generation>=0&&c.playerId&&c.worldId&&
    parsed&&same(parsed,f.tasks)&&source?.provenance?.source===sourcesFor(f.parameters).tasks&&same(source.value,f.inputs.tasks)&&
    factsFreshnessPolicy(source,{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
  return choices.map(p=>{
    const task=valid?(p.kind==='achievement'?parsed.achievements?.find(row=>row.taskId===p.taskId):p.kind==='main'?parsed.main:parsed.branch?.find(row=>row.taskId===p.taskId)):null;
    const exact=task?.taskId===p.taskId?task:null;
    const table={main:'MainTaskCfg',branch:'BranchTaskCfg',achievement:'AchievementTaskCfg'}[p.kind];
    const row=same(config?.tables?.[table]??null,f?.configEvidence?.tables?.[table]??null)?taskConfigurationRow(f?.configEvidence,p.kind,p.taskId):null;
    const target=p.kind==='achievement'?exact?.targetProgress??null:taskTarget(row);
    const qualification=taskQualification(exact,target,p.kind);
    return validateTaskQualificationObservation({kind:p.kind,taskId:p.taskId,status:exact?'OBSERVED':'UNKNOWN',source:sourcesFor(f?.parameters).tasks,sourceAt:valid?source.provenance.sourceAt:null,
      progress:exact?.progress??null,requiredProgress:target??null,completion:qualification.completion,rewardState:qualification.rewardState,
      observedRequirementsMet:qualification.claimable,eligibility:null,readOnly:true,executable:false,autoResume:false,
      settlement:'UNKNOWN',reason:!valid?'TASK_OBSERVATION_UNKNOWN':!exact?'TASK_NOT_PRESENT':qualification.completion==='UNKNOWN'?'TASK_TARGET_UNKNOWN':'READ_ONLY_QUALIFICATION'});
  });
}
// Rebind only original already-collected task facts; no new source, write or future state.
function taskClosingFact(f,p,config){
 if(closingGiftKinds.includes(p.kind))return same(f?.parameters,p)?f:null;
 const owner=liveTaskFacts.get(f),achievement=p.kind==='achievement';
 if(p.kind==='weekly-chip-task'||OPEN_RANK_TASK_KINDS.includes(p.kind))return activityTaskClosingFact(f,p,config);
 if(!owner||owner.seal!==sealOf(f)||owner.client.connected!==true||!same(contextOf(owner.client,owner.player),f.context)||achievement!==(f.parameters?.kind==='achievement'))return null;
 const target={...f,parameters:p};liveTaskFacts.set(target,{client:owner.client,player:owner.player,seal:sealOf(target)});return target;
}
function taskClosingRows(f,options){
 const choices=f?.parameters?.kind==='achievement'?(f.tasks?.achievements??[]).map(row=>({kind:'achievement',taskId:row.taskId})):[...(f?.tasks?.main?[{kind:'main',taskId:f.tasks.main.taskId}]:[]),...(f?.tasks?.branch??[]).map(row=>({kind:'branch',taskId:row.taskId}))];
 return choices.flatMap(parameters=>{const source=taskClosingFact(f,parameters);if(!source)return [];const row=candidate(source,parameters,options);return [{parameters:copy(parameters),rewards:copy(row.rewards),budgetClaims:copy(row.budgetClaims),costs:[],executable:row.executable,blockedReason:row.blockedReason}];});
}
export function validateTaskRewardClosingPreparation(v){
 if(own(v,'groups')){
  if(!fields(v,['groups','maxDurationMs'])||Reflect.ownKeys(v).length!==2||!dense(v.groups)||Object.getPrototypeOf(v.groups)!==Array.prototype||Reflect.ownKeys(v.groups).length!==v.groups.length+1||!Array.from({length:v.groups.length},(_,i)=>Object.getOwnPropertyDescriptor(v.groups,i)).every(d=>d?.enumerable&&own(d,'value'))||!v.groups.length||v.groups.length>12)throw invalid('跨来源收尾须明确1至12个原任务来源分组');
  const groups=v.groups.map(targets=>validateTaskRewardClosingPreparation({targets,maxDurationMs:v.maxDurationMs}).targets),targets=groups.flat();
  const source=p=>['main','branch'].includes(p.kind)?'tasks':['daily','daily-activity'].includes(p.kind)?'daily':p.kind;
  if(targets.length>24||new Set(groups.map(rows=>source(rows[0]))).size!==groups.length||new Set(targets.map(p=>p.kind+':'+(p.taskId??p.tierId??p.packId))).size!==targets.length)throw invalid('跨来源收尾共最多24项，每个原来源只允许一个分组且目标不得重复');
  return {groups,maxDurationMs:v.maxDurationMs};
 }
 if(!fields(v,['targets','maxDurationMs'])||Reflect.ownKeys(v).length!==2||!dense(v.targets)||v.targets.length<1||v.targets.length>24||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('任务收尾须明确1至24个当前任务及有限总时长');
 const targets=v.targets.map(row=>{const p=validateTaskRewardsParameters(row);if(!['main','branch','achievement','daily','daily-activity',...closingGiftKinds,'weekly-chip-task',...OPEN_RANK_TASK_KINDS].includes(p.kind)||['daily','daily-activity'].includes(p.kind)&&!own(p,'expectedResetTime'))throw invalid('本收尾仅接受原已交任务及免费礼包；日常任务/日活跃须固定服务器重置标记，其他活动继续原入口');return p;});
 const source=p=>p.kind==='achievement'?'achievement':['daily','daily-activity'].includes(p.kind)?'daily:'+p.expectedResetTime:closingGiftKinds.includes(p.kind)?p.kind:p.kind==='weekly-chip-task'?'chip:'+p.round:OPEN_RANK_TASK_KINDS.includes(p.kind)?p.kind:'tasks';
 if(new Set(targets.map(p=>p.kind+':'+(p.taskId??p.tierId??p.packId))).size!==targets.length||targets.some(p=>source(p)!==source(targets[0])))throw invalid('任务目标不得重复，主支/成就/周芯片/开服各模式来源及芯片轮次必须隔离');
 return {targets,maxDurationMs:v.maxDurationMs};
}
export function prepareTaskRewardClosingWorkflow(f,{config,moduleConfig=TASK_REWARDS_DEFAULT_CONFIG,...input}={}){
 if(own(input,'groups')){
  const p=validateTaskRewardClosingPreparation(input);
  if(!dense(f)||f.length!==p.groups.length||!f.every(facts=>facts?.stockReliable===true&&facts.stock instanceof Map&&same(facts.context,f[0].context)&&same([...facts.stock].sort(),[...f[0].stock].sort())))throw invalid('跨来源收尾须保持同账号、角色、世界、连接、代次及完整初始库存，变化须重新调查');
  // Each original group keeps its own private source proof, window and limits.
  const parts=p.groups.map((targets,i)=>prepareTaskRewardClosingWorkflow(f[i],{config,moduleConfig,targets,maxDurationMs:p.maxDurationMs})),steps=parts.flatMap(part=>part.steps),totals=new Map(f[0].stock);
  for(const step of steps)for(const reward of step.rewards){const n=(totals.get(reward.id)??0)+reward.num;if(!Number.isSafeInteger(n))throw invalid('跨来源累计奖励超过原安全整数余额范围');totals.set(reward.id,n);}
  const budget=normalizeBudgetClaims({resources:[],quotas:[],uids:parts.flatMap(part=>part.budget.uids)}),nodes=[{id:'start',type:'START'}];
  steps.forEach((step,i)=>nodes.push({id:'reward-'+i,type:'ACTION',module:moduleId,parameters:copy(step.parameters),selection:copy(step.selection)},{id:'verify-'+i,type:'VERIFY',module:moduleId}));nodes.push({id:'stop',type:'STOP'});
  return {...p,parts,steps,budget,graph:{version:1,id:'task-rewards-groups-'+hash(p).slice(0,20),name:'明确跨来源任务奖励逐项收尾',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:[moduleId]}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'仅明确清单中的当前合格任务；每组保留原独立任务来源、活动窗口及轮次限制。准备时各组重新调查并确认相同完整库存，每项执行再调查、单次授权及原独立结算验证；变化、拒绝或UNKNOWN停止后续。累计奖励只核溢出，不增加父预算；不追加未来任务、不领取排名奖励、不跨周芯片末任务换轮，重启只读不重放。'};
 }
 const p=validateTaskRewardClosingPreparation(input);
 if(['daily','daily-activity'].includes(p.targets[0].kind)){
  const result=prepareDailyRewardWorkflow(f,{config,moduleConfig,expectedResetTime:p.targets[0].expectedResetTime,taskIds:p.targets.filter(p=>p.kind==='daily').map(p=>p.taskId),tierIds:p.targets.filter(p=>p.kind==='daily-activity').map(p=>p.tierId),maxDurationMs:p.maxDurationMs});
  if(!same(result.steps.map(row=>row.parameters),p.targets))throw invalid('日常分组须保留原逐任务后逐日活跃档位顺序');
  return {...result,targets:copy(p.targets)};
 }
 const nodes=[{id:'start',type:'START'}],totals=new Map(f?.stock??[]);
 const chip=p.targets[0].kind==='weekly-chip-task',gift=closingGiftKinds.includes(p.targets[0].kind),activity=chip||gift||OPEN_RANK_TASK_KINDS.includes(p.targets[0].kind),choices=activity&&!gift?activityTaskClosingChoices(f,{config,moduleConfig}):null;if(activity&&!gift&&(choices.status!=='OBSERVED'||chip&&choices.round!==p.targets[0].round||p.targets.length>choices.maximumClaims))throw invalid('活动任务组合须同一当前来源；周芯片须保留至少一项未领，末任务跨轮仍缺证');
 const steps=p.targets.map((parameters,i)=>{const facts=taskClosingFact(f,parameters,config);if(!facts)throw invalid('任务收尾原账号、连接或任务来源变化，须重新调查');const row=activity?viewDailyTaskReward(facts,{config,moduleConfig,parameters}).candidates[0]:candidate(facts,parameters,{config,moduleConfig});
  if(!row.executable)throw Object.assign(new Error('所选任务当前资格未确认：'+row.blockedReason),{code:row.blockedReason,statusCode:409});
  for(const reward of row.rewards){const next=(totals.get(reward.id)??0)+reward.num;if(!Number.isSafeInteger(next))throw invalid('所选任务累计奖励超过原安全整数余额范围');totals.set(reward.id,next);}
  const selection={unique:true};nodes.push({id:'reward-'+i,type:'ACTION',module:moduleId,parameters,selection},{id:'verify-'+i,type:'VERIFY',module:moduleId});return {parameters,selection,costs:[],rewards:copy(row.rewards),budgetClaims:copy(row.budgetClaims)};
 });nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:[],uids:steps.flatMap(row=>row.budgetClaims.uids)};
 return {...p,steps,budget,graph:{version:1,id:'task-rewards-closing-'+hash({p,steps}).slice(0,20),name:gift?'明确免费礼包收尾':chip?'明确同轮周芯片任务逐项收尾':activity?'明确同模式开服任务逐档收尾':'明确当前任务奖励逐项收尾',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:[moduleId]}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:gift?'仅明确已交的日赠礼或1000号周免费礼包，复用原唯一免费领取、窗口和完整库存净入验证；不购买、不开包、不推断重置或跨周重领。每项重新调查、单次授权，变化、拒绝或UNKNOWN停止；收入不扩大父预算。':chip?'仅本次明确同轮周芯片当前已合格任务，原WeekInfo窗口/轮次/任务父UID预算固定且至少保留一个未领任务，不进入末任务跨轮。复用原任务定义、资格、typed轮次/完整已领ID回执及完整库存净入验证，每项重新调查、单次授权后继续；变化、拒绝或UNKNOWN停止，零重领/开箱/未来任务/续权，奖励不扩父预算，准备不执行。':activity?'仅同一开服模式的明确当前合格score档位，原世界/赛季/配置规则和私有活动窗口不变，原UID父预算固定对应窗口及档位。复用原候选、请求、同源进度/唯一已领档位和完整库存净入验证；每档重新调查/单次授权，窗口/资格变化、拒绝或UNKNOWN停止，不领取排名奖励、其他模式或未来任务，不新增恢复分支，奖励不扩父预算。':'仅当前明确已合格的主线/支线或同源成就，复用原任务身份、资格、配置奖励和完整库存净入验证；每项重新调查、单次授权并验证后继续。主线前移不证明原任务成功；资格不明、拒绝或UNKNOWN停止，任务/配置变化仍须原重新预览与授权，不领取未来任务、不重发或续权，奖励不扩父预算，日常/赛季活动仍走原独立入口。'};
}

export function viewTaskRewards(f,options={}) {
  const p=validateTaskRewardsParameters(options.parameters??{});
  if(p.kind==='month-card-gift'){const choices=own(p,'cardType')?[p]:[1,2].map(cardType=>({kind:p.kind,cardType}));return {module:moduleId,monthCards:copy(f?.monthCards??null),candidates:choices.map(parameters=>monthCardCandidate(f,parameters,options)),notes:[...(f?.notes??[])],evidence:MONTH_CARD_REWARD_EVIDENCE};}
  if(['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...OPEN_RANK_TASK_KINDS,'weekly-battle-pass-task'].includes(p.kind))return viewDailyTaskReward(f,{...options,parameters:p,moduleConfig:validateTaskRewardsConfig(options.moduleConfig)});
  const choices=own(p,'taskId')?[p]:[
    ...(f?.tasks?.main?[{kind:'main',taskId:f.tasks.main.taskId}]:[]),...(f?.tasks?.branch??[]).map(row=>({kind:'branch',taskId:row.taskId})),
  ];
  return {module:moduleId,tasks:copy(f?.tasks??null),rewardClosing:{targets:taskClosingRows(f,options)},qualificationObservations:qualificationObservations(f,p,choices,options.config),candidates:choices.map(p=>candidate(f,p,options)),notes:[...(f?.notes??[]),'主线仅确认同任务明确已领及精确奖励净入；任务前移不推定成功。成就请指定 kind=achievement 与精确 taskId，复读仅接受同 ID 已领及配置奖励净入；每日订单空请求尚未接入。']};
}
export function planTaskRewards(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
  parameters=validateTaskRewardsParameters(parameters);
  if(!dense(selections)||selections.length>1||selections.some(id=>!identifier(id)))throw invalid('任务奖励每批仅允许一个精确 actionId');
  if(['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...OPEN_RANK_TASK_KINDS,'weekly-battle-pass-task'].includes(parameters.kind))return planDailyTaskReward(f,{...options,parameters,selections,ledger,moduleConfig:validateTaskRewardsConfig(options.moduleConfig)});
  const rows=viewTaskRewards(f,{...options,parameters}).candidates,selected=rows.find(row=>row.executable&&selections.includes(row.actionId));
  return {module:moduleId,actions:selected&&ledger.reserve(selected.costs)?[selected]:[],notes:[]};
}
export function verifyTaskReward(operation,before,after,response) {
  const no=reason=>({confirmed:false,reason});
  if(operation?.parameters?.kind==='month-card-gift')return verifyMonthCardReward(operation,before,after,response);
  if(['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...OPEN_RANK_TASK_KINDS,'weekly-battle-pass-task'].includes(operation?.parameters?.kind))return verifyDailyTaskReward(operation,before,after,response);
  if(response!==null&&response!==undefined)return no('任务领取没有专用成功响应');
  if(!authority(before)||!authority(after)||!same(before.context,after.context))return no('前后账号、库存或任务权威不可靠');
  const p=operation?.parameters;
  try{validateTaskRewardsParameters(p);}catch{return no('领取目标不完整');}
  if(!p?.taskId)return no('缺少单任务目标');
  if(!same(before.configEvidence,after.configEvidence))return no('前后任务配置发生变化');
  const canonical=candidate(before,p,{config:before.configEvidence,moduleConfig:{enabled:true}});
  if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(key=>!same(operation[key],canonical[key])))return no('领取合同与写前状态或配置不一致');
  if(Object.keys(sources).some(key=>after.sourceFacts[key].provenance.sourceAt<before.sourceFacts[key].provenance.sourceAt))return no('复读早于写前观察');
  return verifyTaskRewardOutcome(operation,before.state,after.state,canonical.rewards,before.stock);
}
export function taskRewardsDependencyVersions({config,moduleConfig=TASK_REWARDS_DEFAULT_CONFIG,parameters={}}={}) {
  parameters=validateTaskRewardsParameters(parameters);
  if(parameters.kind==='month-card-gift')return {moduleConfig:validateTaskRewardsConfig(moduleConfig),tables:Object.fromEntries(['MonthCardCfg','ItemCfg'].map(name=>[name,copy(config?.tables?.[name]??null)]))};
  if(['daily','daily-activity','daily-gift','weekly-lottery-gift','weekly-unique-lottery-gift','weekly-chip-gift','weekly-chip-task',...OPEN_RANK_TASK_KINDS,'weekly-battle-pass-task'].includes(parameters.kind))return dailyTaskRewardDependencyVersions({config,moduleConfig:validateTaskRewardsConfig(moduleConfig),parameters});
  return {moduleConfig:validateTaskRewardsConfig(moduleConfig),tables:Object.fromEntries(configNames.map(name=>[name,copy(config?.tables?.[name]??null)]))};
}
export const taskRewardsModule=Object.freeze({id:moduleId,label:'任务奖励',capabilities:Object.freeze(['C502','C503','C513','C515','C516','C517']),defaultConfig:TASK_REWARDS_DEFAULT_CONFIG,
  validateConfig:validateTaskRewardsConfig,validateParameters:validateTaskRewardsParameters,survey:surveyTaskRewards,view:viewTaskRewards,plan:planTaskRewards,verify:verifyTaskReward,rejectionIdentity:businessRejectionIdentity,dependencyVersions:taskRewardsDependencyVersions});

const monthCardNames={1:'普通月卡',2:'高级月卡'},monthCardSources={cards:'MonthCardResponse',items:'AllItemResponse',resources:'AllResourceResponse'};
export const MONTH_CARD_REWARD_EVIDENCE=Object.freeze({requirement:'BIZ-A15',source:'v76 MonthCardItem.refreshButtonState/_btnGotReward; MonthCardCfg.dayReward; explicit active current gotDailyReward=false to true and independent full inventory',panelSha256:'f297b8d45ad33363a6667243fed6d1065b8ca4e9ddf28808cd5f5a4bb37cdd06',modelSha256:'5fcf22ef42392b52ac22f4fb249a9dbe03d662415ff8a603973eb74b333e4b63',request:'MonthCardDailyRewardRequest',response:null,scope:'CURRENT_UNCLAIMED_OWNED_CARD_INSTANCE_ONCE_NO_PURCHASE_OR_ASSUMED_DAILY_EPOCH',realGame:'REAL_UNVERIFIED'});
function monthCardRows(raw){
  if(!own(raw,'cardItem')||!dense(raw.cardItem)||raw.cardItem.length>2)return null;
  const rows=[];
  for(const row of raw.cardItem){if(![1,2].includes(row?.type)||!own(row,'type')||!own(row,'endTime')||row.endTime!==-1&&(!Number.isInteger(row.endTime)||row.endTime<0||row.endTime>2147483647)||own(row,'gotDailyReward')&&typeof row.gotDailyReward!=='boolean')return null;rows.push({type:row.type,endTime:row.endTime,...(own(row,'gotDailyReward')?{gotDailyReward:row.gotDailyReward}:{})});}
  return new Set(rows.map(r=>r.type)).size===rows.length?rows.sort((a,b)=>a.type-b.type):null;
}
function monthCardClock(client,context){
  let c;try{c=client.gameClock?.read(context);}catch{return null;}
  return c?.status==='TRUSTED'&&c.reliable===true&&c.source==='PingResponse.serverTimestamp'&&c.accountId===context.accountId&&c.generation===context.generation&&['earliestMs','nowMs','latestMs'].every(k=>Number.isFinite(c[k])&&c[k]>=0&&c[k]<=Number.MAX_SAFE_INTEGER)&&c.earliestMs<=c.nowMs&&c.nowMs<=c.latestMs?{earliestMs:c.earliestMs,nowMs:c.nowMs,latestMs:c.latestMs}:null;
}
async function surveyMonthCardReward(client,protocol,{config,player,parameters,signal,stop,timeout}){
 const context=contextOf(client,player),notes=[],active=()=>assertExecutionActive(client,{signal,stop});active();
 const rows=await Promise.all(Object.entries(monthCardSources).map(async([key,response])=>{const request=response.replace(/Response$/,'Request');active();try{if(!protocol?.[request]||!protocol?.[response])throw Error('protocol');const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,{signal,stop});return [key,toSnapshotJson(value),Date.now()];}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}}));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('月卡权益采集期间身份改变'),{code:'CANCELLED'});
 const inputs=Object.fromEntries(rows.map(([key,value])=>[key,value])),monthCards=monthCardRows(inputs.cards),inventory=parseOperationInventory(inputs.items,inputs.resources),native=readMonthCardRewardSnapshot(client);
 const sourceFacts=Object.fromEntries(rows.map(([key,value,sourceAt])=>[key,createStateFact(value,{accountId:context.accountId,generation:context.generation,source:monthCardSources[key],sourceAt,scope,reliable:key==='cards'?monthCards!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,inputs,sourceFacts,monthCards,...inventory,configEvidence:{tables:Object.fromEntries(['MonthCardCfg','ItemCfg'].map(name=>[name,copy(config?.tables?.[name]??null)]))},available:Object.keys(protocol??{}),notes};
 liveTaskFacts.set(f,{client,player,native,clock:monthCardClock(client,context),seal:sealOf(f)});return f;
}
function monthCardAuthority(f,{settlement=false}={}){
 const live=liveTaskFacts.get(f),c=f?.context,native=live&&readMonthCardRewardSnapshot(live.client);
 if(!live||live.seal!==sealOf(f)||live.client.connected!==true||!same(contextOf(live.client,live.player),c)||!identifier(c?.accountId)||!identifier(c?.connectionId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||native?.status!=='CURRENT'||native.reliable!==true||!['accountId','generation','connectionId','playerId','worldId'].every(k=>native[k]===c[k])||!same(live.native.cards,f.monthCards)||live.native.status!=='CURRENT'||!same(monthCardRows(f.inputs.cards),f.monthCards))return false;
 if(!settlement&&!same(native,live.native))return false;
 if(!Object.entries(monthCardSources).every(([key,source])=>f.sourceFacts[key]?.provenance.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH'))return false;
 const inventory=parseOperationInventory(f.inputs.items,f.inputs.resources);return inventory.stockReliable&&f.stockReliable===true&&f.stock instanceof Map&&same([...f.stock].sort(),[...inventory.stock].sort());
}
function monthCardCandidate(f,p,{config,moduleConfig=TASK_REWARDS_DEFAULT_CONFIG,settlement=false}={}){
 moduleConfig=validateTaskRewardsConfig(moduleConfig);const live=liveTaskFacts.get(f),card=f?.monthCards?.find(r=>r.type===p.cardType),rows=config?.tables?.MonthCardCfg?.data,found=dense(rows)?rows.filter(r=>r.id===monthCardNames[p.cardType]):[],rewards=found.length===1?configuredRewards(config,found[0].dayReward):null,clock=live?(settlement?live.clock:monthCardClock(live.client,f.context)):null;
 const target={kind:'month-card-gift',cardType:p.cardType??null,endTime:card?.endTime??null},action={request:'MonthCardDailyRewardRequest',response:null,body:{type:p.cardType}},budgetClaims={resources:[],quotas:[],uids:card?[{type:'month-card-reward',id:card.type+':'+card.endTime}]:[]};let reason=null;
 if(![1,2].includes(p.cardType))reason='EXPLICIT_MONTH_CARD_TYPE_REQUIRED';else if(!moduleConfig.enabled)reason='TASK_REWARDS_MODULE_DISABLED';else if(!monthCardAuthority(f,{settlement})||!same(config?.tables?.MonthCardCfg,f.configEvidence?.tables?.MonthCardCfg)||!same(config?.tables?.ItemCfg,f.configEvidence?.tables?.ItemCfg))reason='MONTH_CARD_PRIVATE_AUTHORITY_UNKNOWN';else if(!card||!own(card,'gotDailyReward')||card.gotDailyReward!==false)reason='CURRENT_UNCLAIMED_MONTH_CARD_REQUIRED';else if(card.endTime!==-1&&(!clock||clock.latestMs>=card.endTime*1000))reason='MONTH_CARD_ACTIVE_EXPIRY_NOT_PROVEN';else if(!rewards)reason='MONTH_CARD_FIXED_DAILY_REWARDS_UNKNOWN';else if(!f.available.includes(action.request)||f.available.includes('MonthCardDailyRewardResponse'))reason='PROTOCOL_UNAVAILABLE';else{try{assertPaymentAllowed({...action,costs:[]});}catch(error){reason=error.code??'COST_NOT_ALLOWED';}}
 const expected=card?f.monthCards.map(r=>r.type===card.type?{...copy(r),gotDailyReward:true}:copy(r)):null;
 return {module:moduleId,actionId:'task-rewards:MONTH-CARD:'+hash(target),actionType:'MONTH-CARD-REWARD',parameters:p,target,identity:card?hash({context:f.context,cards:f.monthCards,config:f.configEvidence}):null,beforeState:{context:copy(f?.context??null),cards:copy(f?.monthCards??null)},expectedState:{context:copy(f?.context??null),cards:expected},costs:[],costSource:MONTH_CARD_REWARD_EVIDENCE.source,budgetClaims,rewards:copy(rewards),executable:reason===null,blockedReason:reason,label:(monthCardNames[p.cardType]??'月卡')+'当前每日权益',...(reason===null?{action}:{})};
}
function verifyMonthCardReward(op,b,a,response){
 const no=reason=>({confirmed:false,reason});if(response!==null&&response!==undefined)return no('MONTH_CARD_NO_DEDICATED_RESPONSE');if(!monthCardAuthority(b,{settlement:true})||!monthCardAuthority(a)||!same(b.context,a.context)||!same(b.configEvidence,a.configEvidence))return no('MONTH_CARD_AUTHORITY_OR_CONFIG_CHANGED');
 let p;try{p=validateTaskRewardsParameters(op.parameters);}catch{return no('MONTH_CARD_PARAMETERS_INVALID');}const canonical=monthCardCandidate(b,p,{config:b.configEvidence,moduleConfig:{enabled:true},settlement:true});
 if(!canonical.executable||['module','actionId','actionType','parameters','target','identity','beforeState','expectedState','costs','costSource','budgetClaims','rewards','action'].some(k=>!same(op[k],canonical[k])))return no('MONTH_CARD_PLAN_MISMATCH');
 if(liveTaskFacts.get(a).native.epoch!==liveTaskFacts.get(b).native.epoch+1)return no('MONTH_CARD_UNRELATED_ENTITLEMENT_CHANGE');
 if(Object.keys(monthCardSources).some(k=>a.sourceFacts[k].provenance.sourceAt<b.sourceFacts[k].provenance.sourceAt)||!same(a.monthCards,canonical.expectedState.cards))return no('MONTH_CARD_EXACT_CLAIM_OR_PEERS_NOT_CONFIRMED');if(!stockMatchesDelta(b.stock,a.stock,[],canonical.rewards))return no('MONTH_CARD_EXACT_DAILY_REWARD_NET_IN_NOT_CONFIRMED');
 return {confirmed:true,reason:'原私有MonthCard独立复读确认指定当前卡仅未领改已领、有效期及其他卡保持，固定日奖励完整库存精确净入；无购买、无推定日界及重放',afterState:{cards:copy(a.monthCards),inventory:stockState(a.stock)},responseEvidence:null};
}
