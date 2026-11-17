// W16/BIZ-D09: one explicit next first-clear stage of a selected original trial.
// The shared executor owns authorization, persistence, budgets and transport.
import { createHash } from 'node:crypto';
import { buildDailyDriverBody } from './actions.mjs';
import { parseOperationInventory, parseOperationHero } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity, resourceCosts } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';

const moduleId='trial-challenge',scope={kind:'ACCOUNT'},request='TrialRaidChallengeRequest',response='TrialRaidChallengeResponse';
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const uint=n=>Number.isInteger(n)&&n>=0&&n<=2147483647,positive=n=>uint(n)&&n>0;
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const fields=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const trialRaidId=n=>[1,2,3].includes(n),raidIdOf=p=>p?.raidId??1;
const configNames=['ModuleOpenCfg','TrialRaidCfg','TrialRaidStageCfg','ItemCfg'];
const sources={raid:'TrialRaidInfoResponse',heroes:'AllHeroResponse',items:'AllItemResponse',resources:'AllResourceResponse'};
const liveFacts=new WeakMap(),costSource='Fixed v76 RaidItem._onBtnGo: only the next unpassed stage uses TrialRaidChallengeRequest; sweep/buy/advert branches use a different request';
export const TRIAL_CHALLENGE_EVIDENCE=Object.freeze({
 source:'Fixed v76 main/game.js RaidItem/TrialRaidUtil',challengeByteOffset:5480841,nextStageByteOffset:6766819,
 semantics:'Explicit passedStage=0 sentinel or exact configured predecessor; explicit raid1/raid2/raid3 next first-clear stage, zero resource cost. Omitted raidId preserves legacy raid1. Confirmation requires matching typed raid/stage/reward and independent exact passedStage and full net rewards.',
 realGame:'REAL_UNVERIFIED'
});
export const TRIAL_CHALLENGE_DEFAULT_CONFIG=Object.freeze({enabled:false});
export function validateTrialChallengeConfig(v={}) {
 if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('试炼配置只接受 enabled 布尔值');
 return {enabled:v.enabled??false};
}
export function validateTrialChallengeParameters(v={}) {
 if(!fields(v,['raidId','stageId'])||own(v,'raidId')&&!trialRaidId(v.raidId)||own(v,'stageId')&&(!own(v,'raidId')||!positive(v.stageId)))throw invalid('首通试炼仅接受raidId=1/2/3及可选明确下一关stageId；省略保留英雄经验副本，禁止扫荡购买');
 return {...(own(v,'raidId')?{raidId:v.raidId}:{}),...(own(v,'stageId')?{stageId:v.stageId}:{})};
}
function roleId(v) {
 if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<=0))return null;
 const n=toSnapshotJson(v);
 if(!(typeof n==='number'||typeof n==='string'&&/^[1-9][0-9]*$/.test(n)))return null;
 try{return BigInt(n)>0n&&BigInt(n)<(1n<<63n)?String(n):null;}catch{return null;}
}
function contextOf(client,player) {
 const c=client.factContext,role=k=>{const id=own(player,k)?roleId(player[k]):null;return own(c,k)&&roleId(c[k])!==id?null:id;};
 return {accountId:text(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId'),playerLevel:own(player,'level')&&positive(player.level)?player.level:null};
}
function parseRaid(raw) {
 const r=own(raw,'raid')?raw.raid:null;
 return ['raidId','passedStage','sweepTimes','buySweepTimes'].every(k=>own(r,k)&&uint(r[k]))&&trialRaidId(r.raidId)?{raidId:r.raidId,passedStage:r.passedStage,sweepTimes:r.sweepTimes,buySweepTimes:r.buySweepTimes}:null;
}
function parseHeroes(raw) {
 if(!own(raw,'heroes')||!dense(raw.heroes)||!raw.heroes.length)return null;
 const rows=raw.heroes.map(parseOperationHero);
 return rows.some(row=>row===null)||new Set(rows.map(row=>row.heroId)).size!==rows.length?null:rows.sort((a,b)=>a.heroId.localeCompare(b.heroId)).map(row=>row.raw);
}
const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function snapshot(inputs,context) {
 const raid=parseRaid(inputs?.raid),heroes=parseHeroes(inputs?.heroes),inventory=parseOperationInventory(inputs?.items,inputs?.resources);
 return raid&&heroes&&inventory.stockReliable?{context,raid,heroes,inventory:stockState(inventory.stock)}:null;
}
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available});
export async function surveyTrialChallenge(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}) {
 parameters=validateTrialChallengeParameters(parameters);
 const opts={signal,stop},context=contextOf(client,player),notes=[];
 const active=()=>assertExecutionActive(client,opts);active();
 const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{
  const name=response.replace(/Response$/,'Request');active();
  if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': PROTOCOL_UNAVAILABLE');return[key,null,null];}
  try{const value=await awaitExecution(client.request(name,key==='raid'?{raidId:raidIdOf(parameters)}:{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}
  catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}
 }));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('试炼采集期间账号或连接变化'),{code:'CANCELLED'});
 const raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),raid=parseRaid(raw.raid),heroes=parseHeroes(raw.heroes),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sources[k],sourceAt,scope,reliable:k==='raid'?raid!==null&&raid.raidId===raidIdOf(parameters):k==='heroes'?heroes!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,...inventory,state:snapshot(inputs,context),available:Object.keys(protocol??{}),notes};
 liveFacts.set(f,{client,player,digest:digest(f)});return f;
}

function authority(f) {
 const live=liveFacts.get(f),c=f?.context;
 if(!live||live.digest!==digest(f)||live.client.connected!==true||!same(c,contextOf(live.client,live.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
 if(!same(snapshot(f.inputs,c),f.state)||f.state.raid.raidId!==raidIdOf(f.parameters))return false;
 return Object.entries(sources).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}

function catalog(config,raidId) {
 const modules=config?.tables?.ModuleOpenCfg?.data,raids=config?.tables?.TrialRaidCfg?.data,stages=config?.tables?.TrialRaidStageCfg?.data,items=config?.tables?.ItemCfg?.data;
 if(!dense(modules)||!dense(raids)||!dense(stages)||!dense(items))return null;
 const gates=modules.filter(r=>own(r,'moduleId')&&r.moduleId==='试炼副本');
 if(gates.length!==1||!own(gates[0],'playerLevel')||!positive(gates[0].playerLevel)||raids.filter(r=>own(r,'raidId')&&r.raidId===raidId).length!==1||items.some(r=>!own(r,'id')||!text(r.id))||new Set(items.map(r=>r.id)).size!==items.length)return null;
 const rows=stages.filter(r=>own(r,'raidId')&&r.raidId===raidId).map(copy).sort((a,b)=>a.stageLevel-b.stageLevel);
 if(!rows.length||new Set(rows.map(r=>r.stageId)).size!==rows.length)return null;
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(!own(r,'stageId')||!positive(r.stageId)||!own(r,'stageLevel')||r.stageLevel!==i+1||!own(r,'openLevel')||!positive(r.openLevel)||!own(r,'reward')||!dense(r.reward)||!r.reward.length)return null;
  if(r.reward.some(v=>!dense(v)||v.length!==2||!items.some(x=>x.id===v[0])||safeResourceQuantity(v[1])===null||safeResourceQuantity(v[1])<=0))return null;
  try{r.rewards=resourceCosts(r.reward).sort((a,b)=>a.id.localeCompare(b.id));}catch{return null;}
 }
 return {requiredLevel:gates[0].playerLevel,rows};
}
export function nextTrialStage(rows,passedStage) {
 if(!dense(rows)||!rows.length||!uint(passedStage)||rows.some((row,index)=>!own(row,'stageId')||!positive(row.stageId)||!own(row,'stageLevel')||row.stageLevel!==index+1)||new Set(rows.map(row=>row.stageId)).size!==rows.length)return {known:false,stage:null};
 const index=passedStage===0?-1:rows.findIndex(row=>row.stageId===passedStage);
 return passedStage!==0&&index===-1?{known:false,stage:null}:{known:true,stage:rows[index+1]??null};
}
export function trialChallengeAction(target) {
 if(!fields(target,['raidId','stageId','passedStage'])||Reflect.ownKeys(target).length!==3||!trialRaidId(target.raidId)||!positive(target.stageId)||!uint(target.passedStage)||target.stageId===target.passedStage)throw invalid('试炼复核仅支持原三类副本精确下一首通目标');
 return {request,response,body:buildDailyDriverBody(request,{raidId:target.raidId,stageId:target.stageId})};
}
export function parseTrialChallengeState(value) {
 const keys=['context','raid','heroes','inventory'],c=value?.context,contextKeys=['accountId','generation','connectionId','playerId','worldId','playerLevel'];
 if(!fields(value,keys)||Reflect.ownKeys(value).length!==keys.length||!fields(c,contextKeys)||Reflect.ownKeys(c).length!==contextKeys.length||!text(c.accountId)||!text(c.connectionId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||roleId(c.playerId)!==c.playerId||roleId(c.worldId)!==c.worldId||!positive(c.playerLevel))return null;
 const raid=parseRaid({raid:value.raid}),heroes=parseHeroes({heroes:value.heroes});
 if(!raid||!heroes||!same(raid,value.raid)||!same(heroes,value.heroes)||!dense(value.inventory)||value.inventory.some(row=>!fields(row,['id','num'])||Reflect.ownKeys(row).length!==2||!text(row.id)||!Number.isSafeInteger(row.num)||row.num<=0)||new Set(value.inventory.map(row=>row.id)).size!==value.inventory.length)return null;
 const inventory=stockState(new Map(value.inventory.map(row=>[row.id,row.num])));return same(inventory,value.inventory)?{context:copy(c),raid,heroes,inventory}:null;
}
export function parseTrialChallengeSources(inputs,context) {const state=snapshot(toSnapshotJson(inputs),context);return state?parseTrialChallengeState(state):null;}
export function trialChallengeExpectedState(before,stageId,rewards) {
 const state=parseTrialChallengeState(before);if(!state||!positive(stageId)||stageId===state.raid.passedStage||!dense(rewards)||!rewards.length||rewards.some(row=>!fields(row,['id','num'])||Reflect.ownKeys(row).length!==2||!text(row.id)||!Number.isSafeInteger(row.num)||row.num<=0)||new Set(rewards.map(row=>row.id)).size!==rewards.length)return null;
 const stock=new Map(state.inventory.map(row=>[row.id,row.num]));for(const reward of rewards){const next=(stock.get(reward.id)??0)+reward.num;if(!Number.isSafeInteger(next))return null;stock.set(reward.id,next);}
 return {...state,raid:{...state.raid,passedStage:stageId},inventory:stockState(stock)};
}
export function trialChallengeReceipt(result,target) {
 const no=reason=>({confirmed:false,reason});
 if(!own(result,'raidId')||!trialRaidId(target?.raidId)||result.raidId!==target.raidId||!own(result,'stageId')||result.stageId!==target?.stageId||!own(result,'reward')||!own(result.reward,'asset')||!dense(result.reward.asset))return no('缺少相同副本、关卡及明确奖励回执');
 const assets=[];for(const a of result.reward.asset){const n=own(a,'num')?safeResourceQuantity(a.num):null;if(!own(a,'type')||a.type!==0||!own(a,'id')||!text(a.id)||n===null||n<=0)return no('奖励身份或数量不明确');assets.push({id:a.id,num:n});}
 let rewards;try{rewards=resourceCosts(assets).sort((a,b)=>a.id.localeCompare(b.id));}catch{return no('奖励数值无效');}
 return {raidId:target.raidId,stageId:target.stageId,rewards};
}
export function verifyTrialChallengeOutcome(operation,before,after,receipt) {
 const no=reason=>({confirmed:false,reason}),b=parseTrialChallengeState(before),a=parseTrialChallengeState(after);try{trialChallengeAction(operation?.target);const p=validateTrialChallengeParameters(operation?.parameters);if(raidIdOf(p)!==operation.target.raidId||own(p,'stageId')&&p.stageId!==operation.target.stageId)return no('试炼参数与原副本目标不一致');}catch{return no('试炼原精确首通目标未知');}
 if(!b||!a||!same(b.context,a.context)||!same(operation.beforeState,b)||operation.target.raidId!==b.raid.raidId||operation.target.passedStage!==b.raid.passedStage||!fields(receipt,['raidId','stageId','rewards'])||Reflect.ownKeys(receipt).length!==3||receipt.raidId!==b.raid.raidId||receipt.stageId!==operation.target.stageId)return no('缺少原副本、关卡及完整typed结算凭据');
 const expected=trialChallengeExpectedState(b,receipt.stageId,receipt.rewards);
 if(!expected||!same(operation.expectedState,expected)||!same(a,expected))return no('独立首通进度、完整净入或无关英雄/次数未精确确认');
 return {confirmed:true,afterState:copy(a),reason:'精确关卡回执、独立首通进度与配置奖励净入共同确认',responseEvidence:copy(receipt)};
}
function candidate(f,{config,moduleConfig=TRIAL_CHALLENGE_DEFAULT_CONFIG,parameters=f?.parameters??{}}={}) {
 parameters=validateTrialChallengeParameters(parameters);const raidId=raidIdOf(parameters);
 const matches=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null)),defs=matches?catalog(f?.configEvidence,raidId):null;
 const valid=authority(f)&&same(parameters,f.parameters),beforeState=copy(f?.state??null),passed=f?.state?.raid?.passedStage??null;
 const next=nextTrialStage(defs?.rows,passed),row=next.stage;
 let blockedReason=!validateTrialChallengeConfig(moduleConfig).enabled?'TRIAL_CHALLENGE_DISABLED':!valid?'TRIAL_CHALLENGE_AUTHORITY_UNKNOWN':!defs?'TRIAL_CHALLENGE_CONFIG_UNKNOWN':!next.known?'TRIAL_CHALLENGE_PROGRESS_UNKNOWN':!row?'TRIAL_CHALLENGE_COMPLETE':!positive(f.context.playerLevel)?'TRIAL_CHALLENGE_LEVEL_UNKNOWN':f.context.playerLevel<Math.max(defs.requiredLevel,row.openLevel)?'TRIAL_CHALLENGE_LEVEL_LOCKED':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 if(!blockedReason&&own(parameters,'stageId')&&parameters.stageId!==row.stageId)blockedReason='TRIAL_CHALLENGE_TARGET_CHANGED';
 const identity=hash({beforeState,defs}),stageId=row?.stageId??null;
 const budgetClaims=trialChallengeBudgetClaims(raidId,stageId);
 const expectedState=beforeState&&row?trialChallengeExpectedState(beforeState,stageId,row.rewards):null;if(valid&&positive(f.context.playerLevel)&&row&&!expectedState)blockedReason='TRIAL_CHALLENGE_REWARD_OVERFLOW';
 return {module:moduleId,actionId:moduleId+':'+raidId+':'+stageId+':'+identity,actionType:'CHALLENGE',target:{raidId,stageId,passedStage:passed},parameters:copy(parameters),identity,beforeState,expectedState,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:({1:'英雄经验',2:'强化石',3:'海兽经验'}[raidId])+'试炼首通 '+stageId,requiredLevel:row?Math.max(defs.requiredLevel,row.openLevel):null,rewards:copy(row?.rewards??[]),
 ...(blockedReason===null?{action:trialChallengeAction({raidId,stageId,passedStage:passed})}:{})};
}
function trialChallengeBudgetClaims(raidId,stageId){return {resources:[],quotas:[{id:moduleId+':first-clear:'+raidId+':'+stageId,num:1}],uids:[{type:moduleId,id:raidId+':'+stageId}]};}
export function viewTrialChallenge(f,options={}) {
 validateTrialChallengeParameters(options.parameters??{});
 return {module:moduleId,raid:copy(f?.state?.raid??null),raidSelection:[1,2,3].flatMap(raidId=>{const defs=catalog(options.config,raidId);return defs?[{raidId,label:{1:'英雄经验',2:'强化石',3:'海兽经验'}[raidId],requiredLevel:Math.max(defs.requiredLevel,defs.rows[0].openLevel)}]:[];}),candidates:[candidate(f,options)],upcomingStages:upcomingTrialStages(f,options),notes:[...(f?.notes??[]),'仅明确所选英雄经验/强化石/海兽经验副本下一首通关；默认仍为英雄经验。当前阵容由服务器结算，不预测胜负。扫荡/购买/广告及其他副本未接入，结果不明不重放。']};
}
// Future rows are explicit configured targets, never evidence of future victory or income.
function upcomingTrialStages(f,options={}){
 const current=candidate(f,options);if(!current.executable)return [];const defs=catalog(f.configEvidence,current.target.raidId),start=defs.rows.findIndex(row=>row.stageId===current.target.stageId),rows=[];
 for(const row of defs.rows.slice(start,start+24)){const requiredLevel=Math.max(defs.requiredLevel,row.openLevel);if(f.context.playerLevel<requiredLevel)break;rows.push({stageId:row.stageId,stageLevel:row.stageLevel,requiredLevel,rewards:copy(row.rewards),budgetClaims:trialChallengeBudgetClaims(current.target.raidId,row.stageId)});}return rows;
}
export function validateTrialPreparation(v){
 if(!fields(v,['raidId','stageIds','maxDurationMs'])||Reflect.ownKeys(v).length!==3||!trialRaidId(v.raidId)||!dense(v.stageIds)||v.stageIds.length<1||v.stageIds.length>24||v.stageIds.some(id=>!positive(id))||new Set(v.stageIds).size!==v.stageIds.length||!Number.isSafeInteger(v.maxDurationMs)||v.maxDurationMs<1||v.maxDurationMs>86400000)throw invalid('有限首通须明确副本、顺序唯一的1至24个关卡ID和有限总时长');return {raidId:v.raidId,stageIds:[...v.stageIds],maxDurationMs:v.maxDurationMs};
}
export function prepareTrialWorkflow(f,{config,moduleConfig=TRIAL_CHALLENGE_DEFAULT_CONFIG,...input}={}){
 const p=validateTrialPreparation(input),parameters={raidId:p.raidId},rows=upcomingTrialStages(f,{config,moduleConfig,parameters});
 if(p.stageIds.some((id,i)=>rows[i]?.stageId!==id))throw invalid('首通序列须从当前原下一关开始按原stageLevel连续选择；进度、配置或等级变化须重新调查');
 const nodes=[{id:'start',type:'START'}],steps=p.stageIds.map((stageId,i)=>{const parameters={raidId:p.raidId,stageId},selection={unique:true},budgetClaims=trialChallengeBudgetClaims(p.raidId,stageId);nodes.push({id:'challenge-'+i,type:'ACTION',module:moduleId,parameters,selection},{id:'verify-'+i,type:'VERIFY',module:moduleId});return {parameters,selection,costs:[],rewards:copy(rows[i].rewards),budgetClaims};});
 nodes.push({id:'stop',type:'STOP'});const budget={resources:[],quotas:steps.flatMap(step=>step.budgetClaims.quotas),uids:steps.flatMap(step=>step.budgetClaims.uids)};
 return {...p,steps,budget,graph:{version:1,id:'trial-first-clears-'+hash({p,steps}).slice(0,20),name:'明确试炼关卡有限首通',nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id})),budget,runPolicy:{maxDurationMs:p.maxDurationMs,maxActions:steps.length,modules:[moduleId]}},resumable:false,requiresFreshPlan:true,requiresAuthorization:true,limitation:'仅挑战明确所选副本从当前下一关开始的配置关卡序列；每关重新调查、精确下一关守卫、原单次授权、typed奖励及完整库存/英雄/次数独立验证，只有确认首通才进入下一关。不预测胜负、不扫荡/购买，不使用预期奖励扩预算；进度变化、拒绝或UNKNOWN停止，不重试、不恢复执行。准备只读，不授予写权限。'};
}

export function planTrialChallenge(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
 validateTrialChallengeParameters(parameters);
 if(!dense(selections)||selections.length>1||selections.some(v=>!text(v)))throw invalid('试炼每批只允许一个精确 actionId');
 const row=viewTrialChallenge(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));
 return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};
}
export function verifyTrialChallenge(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!same(before.configEvidence,after.configEvidence))return no('试炼前后账号、配置或库存不可靠');
 const canonical=candidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(k=>!same(operation?.[k],canonical[k])))return no('试炼合同与写前事实不一致');
 const receipt=trialChallengeReceipt(result,canonical.target);if(receipt.confirmed===false)return receipt;
 if(!same(receipt.rewards,canonical.rewards)||Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt))return no('独立首通进度、完整净入或无关英雄/次数未精确确认');
 return verifyTrialChallengeOutcome(operation,before.state,after.state,receipt);
}
export function trialChallengeDependencyVersions({config,moduleConfig=TRIAL_CHALLENGE_DEFAULT_CONFIG}={}) {return {moduleConfig:validateTrialChallengeConfig(moduleConfig),tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const trialChallengeModule=Object.freeze({id:moduleId,label:'试炼副本首通',capabilities:Object.freeze(['BIZ-D09']),defaultConfig:TRIAL_CHALLENGE_DEFAULT_CONFIG,validateConfig:validateTrialChallengeConfig,validateParameters:validateTrialChallengeParameters,survey:surveyTrialChallenge,view:viewTrialChallenge,plan:planTrialChallenge,verify:verifyTrialChallenge,rejectionIdentity:businessRejectionIdentity,dependencyVersions:trialChallengeDependencyVersions});
