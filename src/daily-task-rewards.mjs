// W16 / BIZ-D18 / BIZ-D19 sub-contract of the existing task-rewards Function.
import { createHash } from 'node:crypto';
import { parseOperationInventory } from './hero-operations.mjs';
import { ResourceLedger, RESOURCE_NAMES } from './resource-ledger.mjs';
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
const configNamesFor=p=>p?.kind==='daily-activity'?['DailyActivityRewardCfg','ItemCfg']:configNames;
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
 if(!keys.every(k=>own(raw,k)&&uint(raw[k]))||!positive(raw.dailyResetTime)||!own(raw,'dailyTask')||!dense(raw.dailyTask))return null;
 const tasks=raw.dailyTask.map(row=>['id','progress','targetProgress','rewardClaimed'].every(k=>own(row,k))&&positive(row.id)&&uint(row.progress)&&positive(row.targetProgress)&&typeof row.rewardClaimed==='boolean'?{taskId:row.id,progress:row.progress,targetProgress:row.targetProgress,rewardClaimed:row.rewardClaimed}:null);
 if(tasks.some(r=>r===null)||new Set(tasks.map(r=>r.taskId)).size!==tasks.length)return null;
 const claims={};for(const key of['dailyRewardClaimed','weeklyRewardClaimed']){if(!own(raw,key)||!dense(raw[key])||raw[key].some(v=>!positive(v))||new Set(raw[key]).size!==raw[key].length)return null;claims[key]=[...raw[key]].sort((a,b)=>a-b);}
 return {resetTime:raw.dailyResetTime,dailyActivity:raw.dailyActivity,weeklyActivity:raw.weeklyActivity,...claims,tasks:tasks.sort((a,b)=>a.taskId-b.taskId)};
}
const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
const snapshot=(inputs,context)=>{const daily=parseDaily(inputs?.daily),i=parseOperationInventory(inputs?.items,inputs?.resources);return daily&&i.stockReliable?{context,daily,inventory:stockState(i.stock)}:null;};
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available,startClock:f.startClock,endClock:f.endClock});
export async function surveyDailyTaskReward(client,protocol,{config,player,parameters,signal,stop,timeout=15000}={}){
 const opts={signal,stop},context=contextOf(client,player),notes=[],startClock=clockOf(client,context);const active=()=>assertExecutionActive(client,opts);active();
 const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{const name=response.replace(/Response$/,'Request');active();if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return[key,null,null];}try{const value=await awaitExecution(client.request(name,{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}}));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('日常领取采集期间账号或连接变化'),{code:'CANCELLED'});
 const endClock=clockOf(client,context),raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),daily=parseDaily(raw.daily),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sources[k],sourceAt,scope,reliable:k==='daily'?daily!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters:copy(parameters),context,configEvidence:{tables:Object.fromEntries(configNamesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,daily,...inventory,state:daily&&inventory.stockReliable?snapshot(inputs,context):null,available:Object.keys(protocol??{}),notes,startClock,endClock};liveFacts.set(f,{client,player,digest:digest(f)});return f;
}
function authority(f){
 const live=liveFacts.get(f),c=f?.context;if(!live||live.digest!==digest(f)||live.client.connected!==true||!same(c,contextOf(live.client,live.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map)||!same(snapshot(f.inputs,c),f.state)||!same(f.daily,f.state.daily))return false;
 return Object.entries(sources).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}
function currentPeriod(f){const live=liveFacts.get(f),clock=live?clockOf(live.client,f.context):null,expiry=f?.daily?.resetTime*1000;return clock&&f.startClock&&f.endClock&&f.startClock.earliestMs<=f.endClock.earliestMs&&f.endClock.earliestMs<=clock.earliestMs&&[f.startClock,f.endClock,clock].every(c=>c.latestMs<expiry)?clock:null;}
function definition(config,taskId){const rows=config?.tables?.DailyTaskCfg?.data;if(!dense(rows))return null;const found=rows.filter(row=>own(row,'taskId')&&row.taskId===taskId);if(found.length!==1)return null;const r=found[0];return own(r,'point')&&positive(r.point)&&own(r,'exp')&&positive(r.exp)&&own(r,'moduleId')&&r.moduleId===''?{point:r.point,exp:r.exp}:null;}
function candidate(f,{config,moduleConfig={enabled:false},parameters=f?.parameters}={}){
 const taskId=parameters?.taskId,p={kind:'daily',taskId},valid=authority(f),def=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null))?definition(f?.configEvidence,taskId):null;
 const task=f?.daily?.tasks?.find(r=>r.taskId===taskId),beforeState=copy(f?.state??null);let expectedState=null;
 if(valid&&def&&task&&f.stock.has('EXP')){const next=copy(beforeState),stock=new Map(f.stock);stock.set('EXP',stock.get('EXP')+def.exp);next.daily.tasks.find(r=>r.taskId===taskId).rewardClaimed=true;next.daily.dailyActivity+=def.point;next.daily.weeklyActivity+=def.point;if(Number.isSafeInteger(stock.get('EXP'))&&uint(next.daily.dailyActivity)&&uint(next.daily.weeklyActivity)){next.inventory=stockState(stock);expectedState=next;}}
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'DAILY_TASK_AUTHORITY_UNKNOWN':!def?'DAILY_TASK_CONFIG_UNKNOWN':!task?'TASK_NOT_PRESENT':task.rewardClaimed?'TASK_ALREADY_CLAIMED':task.progress<task.targetProgress?'TASK_INCOMPLETE':!currentPeriod(f)?'DAILY_TASK_PERIOD_UNKNOWN':!expectedState?'REWARD_BALANCE_UNKNOWN':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const reset=f?.daily?.resetTime??null,identity=hash({p,beforeState,def,configEvidence:f?.configEvidence}),budgetClaims={resources:[],quotas:[],uids:[{type:'task-reward',id:'daily:'+reset+':'+taskId}]};
 return {module:moduleId,capabilityId:'C503',actionId:moduleId+':daily:'+reset+':'+taskId+':'+identity,actionType:'CLAIM',target:{...p,resetTime:reset},parameters:p,identity,beforeState,expectedState,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'日常任务 '+taskId+' 奖励',rewards:def?[{id:'EXP',num:def.exp}]:null,activityGain:def?.point??null,progress:task?.progress??null,requiredProgress:task?.targetProgress??null,...(blockedReason===null?{action:{request,response,body:{id:taskId}}}:{})};
}
const candidateFor=(f,options)=>((options?.parameters??f?.parameters)?.kind==='daily-activity'?activityCandidate:candidate)(f,options);
export function viewDailyTaskReward(f,options={}){const row=candidateFor(f,options);return {module:moduleId,daily:copy(f?.daily??null),candidates:[row],notes:[...(f?.notes??[]),row.parameters.kind==='daily-activity'?'仅领取明确日活跃档位，以服务器dailyResetTime绑定周期，完整库存净入和唯一档位新增共同确认；不打开所得包，不推算周界。':'只领取明确日常任务；以本次服务器dailyResetTime绑定任务周期，不推算周界。typed活跃增量、同周期任务已领、日/周活跃精确增量和EXP净入共同确认。']};}
export function planDailyTaskReward(f,{parameters,selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}){const row=viewDailyTaskReward(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};}
export function verifyDailyTaskReward(operation,before,after,result){const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!same(before.configEvidence,after.configEvidence)||!currentPeriod(before)||!currentPeriod(after))return no('日常任务前后身份、周期、配置或完整库存不可靠');
 const canonical=candidateFor(before,{config:before.configEvidence,moduleConfig:{enabled:true},parameters:before.parameters});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards','activityGain'].some(k=>!same(operation?.[k],canonical[k])))return no('日常领取合同与写前明确任务不一致');
 if(canonical.parameters.kind==='daily-activity'){if(result!==null&&result!==undefined)return no('日活跃宝箱没有独立注册的成功响应');}
 else if(!own(result,'activity')||result.activity!==canonical.activityGain)return no('缺少与唯一任务配置一致的typed活跃增量');
 if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt)||!same(after.state,canonical.expectedState))return no('未同时确认同重置标记的任务已领、日周活跃精确增量、EXP净入及其他状态不变');
 if(canonical.parameters.kind==='daily-activity')return {confirmed:true,afterState:copy(after.state),reason:'同周期唯一日活跃档位新增、配置奖励精确净入和其他完整状态不变共同确认'};
 return {confirmed:true,afterState:copy(after.state),reason:'同日常周期独立任务状态、typed活跃增量和完整库存EXP净入共同确认',responseEvidence:{taskId:operation.parameters.taskId,resetTime:before.daily.resetTime,activity:canonical.activityGain,experience:canonical.rewards[0].num}};
}
export function dailyTaskRewardDependencyVersions({config,moduleConfig={enabled:false},parameters={}}={}){return {moduleConfig:copy(moduleConfig),tables:Object.fromEntries(configNamesFor(parameters).map(n=>[n,copy(config?.tables?.[n]??null)]))};}

export const DAILY_ACTIVITY_REWARD_EVIDENCE=Object.freeze({source:'Fixed v76 main/game.js DailyProgressReward._onClickReward, AchievementUtil.allDailyActiveRewardCfg and SeasonUtil.seasonCfgList',rewardByte:1637597,rewardSha256:'37da9257eadf772ec58dbc386a304c9d2ba7f8c88be627cd30d455c2a32beb8a',seasonByte:5952775,seasonSha256:'cd65c8de61c702d7440a95e1c4ff80bfcec7ee3477bcb1b842d01ec24c731b4c',semantics:'Explicit repeated index; use highest configured season <= exact bound WorldIdRule season; same server dailyResetTime only, no weekly marker',realGame:'REAL_UNVERIFIED'});
function activityDefinition(f,config,tierId){
 if(!same(configNamesFor({kind:'daily-activity'}).map(n=>config?.tables?.[n]??null),configNamesFor({kind:'daily-activity'}).map(n=>f?.configEvidence?.tables?.[n]??null)))return null;
 const rows=f?.configEvidence?.tables?.DailyActivityRewardCfg?.data,itemRows=f?.configEvidence?.tables?.ItemCfg?.data;
 if(!dense(rows)||!rows.length||!dense(itemRows))return null;
 let season;try{season=Number(BigInt(f.context.worldId)/1000000n%1000n);}catch{return null;}
 if(!positive(season))return null;
 const seen=new Set();let lastSeason=0;
 for(const row of rows){if(!own(row,'season')||!positive(row.season)||row.season<lastSeason||!own(row,'id')||!positive(row.id)||seen.has(row.season+':'+row.id))return null;seen.add(row.season+':'+row.id);lastSeason=row.season;}
 const current=Math.max(0,...rows.filter(row=>row.season<=season).map(row=>row.season));if(!current)return null;
 const tiers=rows.filter(row=>row.season===current),row=tiers.find(row=>row.id===tierId);
 if(!row||!own(row,'activity')||!positive(row.activity)||!own(row,'reward')||!dense(row.reward)||row.reward.length!==2||!text(row.reward[0])||!Number.isSafeInteger(row.reward[1])||row.reward[1]<=0)return null;
 const id=row.reward[0],items=itemRows.filter(r=>own(r,'id')&&r.id===id);
 if(!Object.values(RESOURCE_NAMES).includes(id)&&(items.length!==1||!own(items[0],'type')||!text(items[0].type)||!['通用','随机包'].includes(items[0].type)))return null;
 return {season,configuredSeason:current,tierId,requiredActivity:row.activity,rewards:[{id,num:row.reward[1]}],tierIds:tiers.map(r=>r.id)};
}
function activityCandidate(f,{config,moduleConfig={enabled:false},parameters=f?.parameters}={}){
 const p={kind:'daily-activity',tierId:parameters?.tierId},valid=authority(f),def=activityDefinition(f,config,p.tierId),beforeState=copy(f?.state??null);
 const claimed=f?.daily?.dailyRewardClaimed;let expectedState=null;
 if(valid&&def&&claimed.every(id=>def.tierIds.includes(id))){
  const next=copy(beforeState),stock=new Map(f.stock),reward=def.rewards[0],start=stock.get(reward.id);
  if((!Object.values(RESOURCE_NAMES).includes(reward.id)||start!==undefined)&&Number.isSafeInteger((start??0)+reward.num)){
   stock.set(reward.id,(start??0)+reward.num);next.inventory=stockState(stock);next.daily.dailyRewardClaimed=[...claimed,p.tierId].sort((a,b)=>a-b);expectedState=next;
  }
 }
 const blockedReason=moduleConfig.enabled!==true?'TASK_REWARDS_DISABLED':!valid?'DAILY_ACTIVITY_AUTHORITY_UNKNOWN':!def?'DAILY_ACTIVITY_CONFIG_OR_SEASON_UNKNOWN':claimed.includes(p.tierId)?'ACTIVITY_TIER_ALREADY_CLAIMED':f.daily.dailyActivity<def.requiredActivity?'ACTIVITY_INCOMPLETE':!currentPeriod(f)?'DAILY_TASK_PERIOD_UNKNOWN':!expectedState?'REWARD_BALANCE_UNKNOWN':!f.available.includes('DrawDailyRewardRequest')?'PROTOCOL_UNAVAILABLE':null;
 const reset=f?.daily?.resetTime??null,identity=hash({p,beforeState,def,configEvidence:f?.configEvidence}),source='Fixed v76 DailyProgressReward index and SeasonUtil selected DailyActivityRewardCfg; one exact eligible daily tier, zero debit, independent full claimed list and inventory';
 return {module:moduleId,capabilityId:'C516',actionId:moduleId+':daily-activity:'+reset+':'+p.tierId+':'+identity,actionType:'CLAIM',target:{...p,resetTime:reset,season:def?.season??null,configuredSeason:def?.configuredSeason??null},parameters:p,identity,beforeState,expectedState,costs:[],costSource:source,budgetClaims:{resources:[],quotas:[],uids:[{type:'daily-activity-reward',id:reset+':'+p.tierId}]},executable:blockedReason===null,blockedReason,label:'日活跃宝箱 '+p.tierId,rewards:copy(def?.rewards??null),activityGain:0,progress:f?.daily?.dailyActivity??null,requiredProgress:def?.requiredActivity??null,...(blockedReason===null?{action:{request:'DrawDailyRewardRequest',response:null,body:{index:[p.tierId]}}}:{})};
}
