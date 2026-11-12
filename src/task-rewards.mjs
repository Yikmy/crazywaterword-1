// W16/C502/C503: exact main/branch reward IDs; the shared executor owns writes.
import { createHash } from 'node:crypto';
import { taskTarget } from './tasks.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, RESOURCE_NAMES, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const moduleId = 'task-rewards', scope = { kind: 'ACCOUNT' };
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
const configNames = ['MainTaskCfg','BranchTaskCfg','ItemCfg'];
const requestOf = kind => kind === 'main' ? 'DrawMainTaskRewardRequest' : 'GotBranchTaskRewardRequest';
const costSource = 'Existing tasks.mjs taskTarget; MainTaskCfg/BranchTaskCfg.reward; one exact taskId, no resource debit or purchase';
export const TASK_REWARDS_DEFAULT_CONFIG = Object.freeze({enabled:false});
export function validateTaskRewardsConfig(v={}) {
  if (!fields(v,['enabled']) || own(v,'enabled') && typeof v.enabled !== 'boolean') throw invalid('任务奖励配置只接受 enabled 布尔值');
  return {enabled:v.enabled??false};
}
export function validateTaskRewardsParameters(v={}) {
  if (!fields(v,['kind','taskId']) || own(v,'kind') && !['main','branch'].includes(v.kind) || own(v,'taskId') && !positive(v.taskId) || own(v,'kind') !== own(v,'taskId')) throw invalid('任务奖励须同时指定 kind(main/branch) 与正整数 taskId，或留空读取候选');
  return own(v,'taskId') ? {kind:v.kind,taskId:v.taskId} : {};
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
  const parse = (row,main) => {
    const progress=own(row,'progress')?safeResourceQuantity(row.progress):null;
    if (!own(row,'taskId') || !positive(row.taskId) || progress===null || main&&(!own(row,'rewardClaimed')||typeof row.rewardClaimed!=='boolean')) return null;
    return {taskId:row.taskId,progress,...(main?{rewardClaimed:row.rewardClaimed}:{})};
  };
  const main=own(raw,'task')&&raw.task!==null?parse(raw.task,true):null;
  if (own(raw,'task')&&raw.task!==null&&!main) return null;
  const branch=raw.branch.map(row=>parse(row,false));
  if (branch.some(row=>row===null) || new Set(branch.map(row=>row.taskId)).size!==branch.length) return null;
  return {main,branch:branch.sort((a,b)=>a.taskId-b.taskId)};
}
const stockState = stock => [...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function snapshot(inputs,context) {
  const tasks=parseTasks(inputs?.tasks),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
  return tasks&&inventory.stockReliable?{context,tasks,inventory:stockState(inventory.stock)}:null;
}
export async function surveyTaskRewards(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}) {
  parameters=validateTaskRewardsParameters(parameters);
  const options={signal,stop},context=contextOf(client,player),notes=[];
  const active=()=>assertExecutionActive(client,options); active();
  const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{
    const request=response.replace(/Response$/,'Request'); active();
    if (!protocol?.[request] || !protocol?.[response]) {notes.push(request+': PROTOCOL_UNAVAILABLE');return [key,null,null];}
    try { const value=await awaitExecution(client.request(request,{},response,timeout,{signal}),client,options);return [key,value,Date.now()]; }
    catch(error) {if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');return [key,null,null];}
  }));
  active(); if(!same(context,contextOf(client,player)))throw Object.assign(new Error('任务采集期间账号或连接改变'),{code:'CANCELLED'});
  const raw=Object.fromEntries(observations.map(([key,value])=>[key,value])),inputs=toSnapshotJson(raw);
  const tasks=parseTasks(raw.tasks),inventory=parseOperationInventory(raw.items,raw.resources);
  const sourceFacts=Object.fromEntries(observations.map(([key,,sourceAt])=>[key,createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,source:sources[key],sourceAt,scope,reliable:key==='tasks'?tasks!==null:inventory.stockReliable})]));
  return {module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(name=>[name,copy(config?.tables?.[name]??null)]))},inputs,sourceFacts,tasks,...inventory,state:tasks&&inventory.stockReliable?snapshot(inputs,context):null,available:Object.keys(protocol??{}),notes};
}
function authority(f) {
  const c=f?.context;
  if(!identifier(c?.accountId)||!identifier(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
  const state=snapshot(f.inputs,c);
  const parsed=parseOperationInventory(f.inputs?.items,f.inputs?.resources);
  if(!same(state,f.state)||!same(f.tasks,state?.tasks)||!same([...f.stock].sort(),[...parsed.stock].sort()))return false;
  return Object.entries(sources).every(([key,source])=>f.sourceFacts?.[key]?.provenance?.source===source&&same(f.sourceFacts[key].value,f.inputs[key])&&factsFreshnessPolicy(f.sourceFacts[key],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function definition(config,kind,taskId) {
  const rows=config?.tables?.[kind==='main'?'MainTaskCfg':'BranchTaskCfg']?.data;
  if(!dense(rows)||rows.some(row=>!own(row,'taskId')||!positive(row.taskId))||new Set(rows.map(row=>row.taskId)).size!==rows.length)return null;
  const row=rows.find(row=>row.taskId===taskId),target=taskTarget(row),rewards=row?.reward;
  const itemRows=config?.tables?.ItemCfg?.data,known=new Set(Object.values(RESOURCE_NAMES));
  if(dense(itemRows))for(const item of itemRows)if(own(item,'id')&&identifier(item.id))known.add(item.id);
  if(!Number.isSafeInteger(target)||target<=0||!dense(rewards)||!rewards.length)return null;
  const seen=new Set(),parsed=[];
  for(const pair of rewards) {
    if(!dense(pair)||pair.length!==2||!known.has(pair[0])||seen.has(pair[0])||!Number.isSafeInteger(pair[1])||pair[1]<=0)return null;
    seen.add(pair[0]);parsed.push({id:pair[0],num:pair[1]});
  }
  return {kind,taskId,target,rewards:parsed,description:typeof row.desc==='string'?row.desc:''};
}
function expected(f,p,def) {
  if(!f?.state||!def)return null;
  const state=copy(f.state);
  if(p.kind==='main')state.tasks.main.rewardClaimed=true;
  else state.tasks.branch=state.tasks.branch.filter(row=>row.taskId!==p.taskId);
  const stock=new Map(f.stock);
  for(const reward of def.rewards) {
    if(Object.values(RESOURCE_NAMES).includes(reward.id)&&!stock.has(reward.id))return null;
    const next=(stock.get(reward.id)??0)+reward.num;if(!Number.isSafeInteger(next))return null;stock.set(reward.id,next);
  }
  state.inventory=stockState(stock);return state;
}
function candidate(f,p,{config,moduleConfig=TASK_REWARDS_DEFAULT_CONFIG}={}) {
  const def=same(configNames.map(name=>config?.tables?.[name]??null),configNames.map(name=>f?.configEvidence?.tables?.[name]??null))?definition(f.configEvidence,p.kind,p.taskId):null,task=p.kind==='main'?f?.tasks?.main:f?.tasks?.branch?.find(row=>row.taskId===p.taskId);
  const after=authority(f)&&task?.taskId===p.taskId?expected(f,p,def):null;
  let blockedReason=!validateTaskRewardsConfig(moduleConfig).enabled?'TASK_REWARDS_DISABLED':!authority(f)?'TASK_AUTHORITY_UNKNOWN':!def?'TASK_CONFIG_OR_REWARD_UNKNOWN':task?.taskId!==p.taskId?'TASK_NOT_PRESENT':p.kind==='main'&&task.rewardClaimed?'TASK_ALREADY_CLAIMED':task.progress<def.target?'TASK_INCOMPLETE':!after?'REWARD_BALANCE_UNKNOWN':!f.available?.includes(requestOf(p.kind))?'PROTOCOL_UNAVAILABLE':null;
  const beforeState=copy(f?.state??null),identity=hash({p,beforeState,def}),budgetClaims={resources:[],quotas:[],uids:[{type:'task-reward',id:p.kind+':'+p.taskId}]};
  return {module:moduleId,capabilityId:'C503',actionId:moduleId+':'+p.kind+':'+p.taskId+':'+identity,actionType:'CLAIM',target:copy(p),parameters:copy(p),identity,beforeState,expectedState:after,
    costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:(p.kind==='main'?'主线':'支线')+'任务 '+p.taskId+' 奖励',rewards:copy(def?.rewards??null),progress:task?.progress??null,requiredProgress:def?.target??null,
    ...(blockedReason===null?{action:{request:requestOf(p.kind),response:null,body:{taskId:p.taskId}}}:{})};
}
export function viewTaskRewards(f,options={}) {
  const p=validateTaskRewardsParameters(options.parameters??{}),choices=own(p,'taskId')?[p]:[
    ...(f?.tasks?.main?[{kind:'main',taskId:f.tasks.main.taskId}]:[]),...(f?.tasks?.branch??[]).map(row=>({kind:'branch',taskId:row.taskId})),
  ];
  return {module:moduleId,tasks:copy(f?.tasks??null),candidates:choices.map(p=>candidate(f,p,options)),notes:[...(f?.notes??[]),'主线仅确认同任务明确已领及精确奖励净入；任务前移不推定成功。成就与每日订单空请求尚未接入。']};
}
export function planTaskRewards(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
  parameters=validateTaskRewardsParameters(parameters);
  if(!dense(selections)||selections.length>1||selections.some(id=>!identifier(id)))throw invalid('任务奖励每批仅允许一个精确 actionId');
  const rows=viewTaskRewards(f,{...options,parameters}).candidates,selected=rows.find(row=>row.executable&&selections.includes(row.actionId));
  return {module:moduleId,actions:selected&&ledger.reserve(selected.costs)?[selected]:[],notes:[]};
}
export function verifyTaskReward(operation,before,after,response) {
  const no=reason=>({confirmed:false,reason});
  if(response!==null&&response!==undefined)return no('任务领取没有专用成功响应');
  if(!authority(before)||!authority(after)||!same(before.context,after.context))return no('前后账号、库存或任务权威不可靠');
  const p=operation?.parameters;
  try{validateTaskRewardsParameters(p);}catch{return no('领取目标不完整');}
  if(!p?.taskId)return no('缺少单任务目标');
  if(!same(before.configEvidence,after.configEvidence))return no('前后任务配置发生变化');
  const canonical=candidate(before,p,{config:before.configEvidence,moduleConfig:{enabled:true}});
  if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(key=>!same(operation[key],canonical[key])))return no('领取合同与写前状态或配置不一致');
  if(Object.keys(sources).some(key=>after.sourceFacts[key].provenance.sourceAt<before.sourceFacts[key].provenance.sourceAt))return no('复读早于写前观察');
  if(!same(after.state,canonical.expectedState))return no('未同时确认单任务已领与完整库存的精确奖励净入');
  return {confirmed:true,afterState:copy(after.state),reason:'独立复读确认精确任务领取状态与奖励净入'};
}
export function taskRewardsDependencyVersions({config,moduleConfig=TASK_REWARDS_DEFAULT_CONFIG}={}) {
  return {moduleConfig:validateTaskRewardsConfig(moduleConfig),tables:Object.fromEntries(configNames.map(name=>[name,copy(config?.tables?.[name]??null)]))};
}
export const taskRewardsModule=Object.freeze({id:moduleId,label:'任务奖励',capabilities:Object.freeze(['C502','C503']),defaultConfig:TASK_REWARDS_DEFAULT_CONFIG,
  validateConfig:validateTaskRewardsConfig,validateParameters:validateTaskRewardsParameters,survey:surveyTaskRewards,view:viewTaskRewards,plan:planTaskRewards,verify:verifyTaskReward,dependencyVersions:taskRewardsDependencyVersions});
