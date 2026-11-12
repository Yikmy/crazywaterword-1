// W16/BIZ-D09: one explicit next first-clear stage of the hero experience trial.
// The shared executor owns authorization, persistence, budgets and transport.
import { createHash } from 'node:crypto';
import { parseOperationInventory, parseOperationHero } from './hero-operations.mjs';
import { ResourceLedger, safeResourceQuantity, resourceCosts } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const moduleId='trial-challenge',scope={kind:'ACCOUNT'},request='TrialRaidChallengeRequest',response='TrialRaidChallengeResponse';
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const uint=n=>Number.isInteger(n)&&n>=0&&n<=2147483647,positive=n=>uint(n)&&n>0;
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const fields=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const configNames=['ModuleOpenCfg','TrialRaidCfg','TrialRaidStageCfg','ItemCfg'];
const sources={raid:'TrialRaidInfoResponse',heroes:'AllHeroResponse',items:'AllItemResponse',resources:'AllResourceResponse'};
const liveFacts=new WeakMap(),costSource='Fixed v76 RaidItem._onBtnGo: only the next unpassed stage uses TrialRaidChallengeRequest; sweep/buy/advert branches use a different request';
export const TRIAL_CHALLENGE_EVIDENCE=Object.freeze({
 source:'Fixed v76 main/game.js RaidItem/TrialRaidUtil',challengeByteOffset:5480841,nextStageByteOffset:6766819,
 semantics:'Explicit passedStage=0 sentinel or exact configured predecessor; only raid1 next first-clear stage, zero resource cost. Confirmation requires matching typed raid/stage/reward and independent exact passedStage and full net rewards.',
 realGame:'REAL_UNVERIFIED'
});
export const TRIAL_CHALLENGE_DEFAULT_CONFIG=Object.freeze({enabled:false});
export function validateTrialChallengeConfig(v={}) {
 if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('经验试炼配置只接受 enabled 布尔值');
 return {enabled:v.enabled??false};
}
export function validateTrialChallengeParameters(v={}) {
 if(!fields(v,[]))throw invalid('经验试炼只接受空参数，固定英雄经验副本下一首通关，禁止扫荡购买');
 return {};
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
 return ['raidId','passedStage','sweepTimes','buySweepTimes'].every(k=>own(r,k)&&uint(r[k]))&&r.raidId===1?{raidId:1,passedStage:r.passedStage,sweepTimes:r.sweepTimes,buySweepTimes:r.buySweepTimes}:null;
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
  try{const value=await awaitExecution(client.request(name,key==='raid'?{raidId:1}:{},response,timeout,{signal}),client,opts);return[key,value,Date.now()];}
  catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return[key,null,null];}
 }));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(new Error('试炼采集期间账号或连接变化'),{code:'CANCELLED'});
 const raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),raid=parseRaid(raw.raid),heroes=parseHeroes(raw.heroes),inventory=parseOperationInventory(raw.items,raw.resources);
 const sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sources[k],sourceAt,scope,reliable:k==='raid'?raid!==null:k==='heroes'?heroes!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,...inventory,state:snapshot(inputs,context),available:Object.keys(protocol??{}),notes};
 liveFacts.set(f,{client,player,digest:digest(f)});return f;
}

function authority(f) {
 const live=liveFacts.get(f),c=f?.context;
 if(!live||live.digest!==digest(f)||live.client.connected!==true||!same(c,contextOf(live.client,live.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId||!f.state||f.stockReliable!==true||!(f.stock instanceof Map))return false;
 if(!same(snapshot(f.inputs,c),f.state))return false;
 return Object.entries(sources).every(([k,source])=>f.sourceFacts?.[k]?.provenance?.source===source&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');
}

function catalog(config) {
 const modules=config?.tables?.ModuleOpenCfg?.data,raids=config?.tables?.TrialRaidCfg?.data,stages=config?.tables?.TrialRaidStageCfg?.data,items=config?.tables?.ItemCfg?.data;
 if(!dense(modules)||!dense(raids)||!dense(stages)||!dense(items))return null;
 const gates=modules.filter(r=>own(r,'moduleId')&&r.moduleId==='试炼副本');
 if(gates.length!==1||!own(gates[0],'playerLevel')||!positive(gates[0].playerLevel)||raids.filter(r=>own(r,'raidId')&&r.raidId===1).length!==1||items.some(r=>!own(r,'id')||!text(r.id))||new Set(items.map(r=>r.id)).size!==items.length)return null;
 const rows=stages.filter(r=>own(r,'raidId')&&r.raidId===1).map(copy).sort((a,b)=>a.stageLevel-b.stageLevel);
 if(!rows.length||new Set(rows.map(r=>r.stageId)).size!==rows.length)return null;
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(!own(r,'stageId')||!positive(r.stageId)||!own(r,'stageLevel')||r.stageLevel!==i+1||!own(r,'openLevel')||!positive(r.openLevel)||!own(r,'reward')||!dense(r.reward)||!r.reward.length)return null;
  if(r.reward.some(v=>!dense(v)||v.length!==2||!items.some(x=>x.id===v[0])||safeResourceQuantity(v[1])===null||safeResourceQuantity(v[1])<=0))return null;
  try{r.rewards=resourceCosts(r.reward).sort((a,b)=>a.id.localeCompare(b.id));}catch{return null;}
 }
 return {requiredLevel:gates[0].playerLevel,rows};
}
function candidate(f,{config,moduleConfig=TRIAL_CHALLENGE_DEFAULT_CONFIG}={}) {
 const matches=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null)),defs=matches?catalog(f?.configEvidence):null;
 const valid=authority(f),beforeState=copy(f?.state??null),passed=f?.state?.raid?.passedStage??null;
 const index=passed===0?-1:defs?.rows.findIndex(r=>r.stageId===passed),row=defs&&(passed===0||index>=0)?defs.rows[index+1]??null:null;
 let blockedReason=!validateTrialChallengeConfig(moduleConfig).enabled?'TRIAL_CHALLENGE_DISABLED':!valid?'TRIAL_CHALLENGE_AUTHORITY_UNKNOWN':!defs?'TRIAL_CHALLENGE_CONFIG_UNKNOWN':passed!==0&&index===-1?'TRIAL_CHALLENGE_PROGRESS_UNKNOWN':!row?'TRIAL_CHALLENGE_COMPLETE':!positive(f.context.playerLevel)?'TRIAL_CHALLENGE_LEVEL_UNKNOWN':f.context.playerLevel<Math.max(defs.requiredLevel,row.openLevel)?'TRIAL_CHALLENGE_LEVEL_LOCKED':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const identity=hash({beforeState,defs}),stageId=row?.stageId??null;
 const budgetClaims={resources:[],quotas:[{id:moduleId+':first-clear:1:'+stageId,num:1}],uids:[{type:moduleId,id:'1:'+stageId}]};
 const stock=new Map(f?.stock??[]);let expectedState=null;
 if(beforeState&&row){for(const r of row.rewards){const n=(stock.get(r.id)??0)+r.num;if(!Number.isSafeInteger(n)){blockedReason='TRIAL_CHALLENGE_REWARD_OVERFLOW';break;}stock.set(r.id,n);}
 expectedState={...copy(beforeState),raid:{...beforeState.raid,passedStage:stageId},inventory:stockState(stock)};}
 return {module:moduleId,actionId:moduleId+':1:'+stageId+':'+identity,actionType:'CHALLENGE',target:{raidId:1,stageId,passedStage:passed},parameters:{},identity,beforeState,expectedState,costs:[],costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'英雄经验试炼首通 '+stageId,requiredLevel:row?Math.max(defs.requiredLevel,row.openLevel):null,rewards:copy(row?.rewards??[]),
 ...(blockedReason===null?{action:{request,response,body:{raidId:1,stageId}}}:{})};
}
export function viewTrialChallenge(f,options={}) {
 validateTrialChallengeParameters(options.parameters??{});
 return {module:moduleId,raid:copy(f?.state?.raid??null),candidates:[candidate(f,options)],notes:[...(f?.notes??[]),'仅英雄经验副本下一首通关；当前阵容由服务器结算，不预测胜负。扫荡/购买/广告及其他副本未接入，结果不明不重放。']};
}
export function planTrialChallenge(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable===true?f.stock:null),...options}={}) {
 validateTrialChallengeParameters(parameters);
 if(!dense(selections)||selections.length>1||selections.some(v=>!text(v)))throw invalid('经验试炼每批只允许一个精确 actionId');
 const row=viewTrialChallenge(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId));
 return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};
}
export function verifyTrialChallenge(operation,before,after,result) {
 const no=reason=>({confirmed:false,reason});
 if(!authority(before)||!authority(after)||!same(before.context,after.context)||!same(before.configEvidence,after.configEvidence))return no('试炼前后账号、配置或库存不可靠');
 const canonical=candidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}});
 if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action','rewards'].some(k=>!same(operation?.[k],canonical[k])))return no('试炼合同与写前事实不一致');
 if(!own(result,'raidId')||result.raidId!==1||!own(result,'stageId')||result.stageId!==canonical.target.stageId||!own(result,'reward')||!own(result.reward,'asset')||!dense(result.reward.asset))return no('缺少相同副本、关卡及明确奖励回执');
 const assets=[];for(const a of result.reward.asset){const n=own(a,'num')?safeResourceQuantity(a.num):null;if(!own(a,'type')||a.type!==0||!own(a,'id')||!text(a.id)||n===null||n<=0)return no('奖励身份或数量不明确');assets.push({id:a.id,num:n});}
 let rewards;try{rewards=resourceCosts(assets).sort((a,b)=>a.id.localeCompare(b.id));}catch{return no('奖励数值无效');}
 if(!same(rewards,canonical.rewards)||!same(after.state,canonical.expectedState)||Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt))return no('独立首通进度、完整净入或无关英雄/次数未精确确认');
 return {confirmed:true,afterState:copy(after.state),reason:'精确关卡回执、独立首通进度与配置奖励净入共同确认',responseEvidence:{raidId:1,stageId:canonical.target.stageId,rewards}};
}
export function trialChallengeDependencyVersions({config,moduleConfig=TRIAL_CHALLENGE_DEFAULT_CONFIG}={}) {return {moduleConfig:validateTrialChallengeConfig(moduleConfig),tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const trialChallengeModule=Object.freeze({id:moduleId,label:'英雄经验试炼首通',capabilities:Object.freeze(['BIZ-D09']),defaultConfig:TRIAL_CHALLENGE_DEFAULT_CONFIG,validateConfig:validateTrialChallengeConfig,validateParameters:validateTrialChallengeParameters,survey:surveyTrialChallenge,view:viewTrialChallenge,plan:planTrialChallenge,verify:verifyTrialChallenge,dependencyVersions:trialChallengeDependencyVersions});
