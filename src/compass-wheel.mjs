// W17/BIZ-R17c: owned-ticket compass draws; transport, permissions and history stay shared.
import { createHash } from 'node:crypto';
import { buildCompassSpinBody } from './actions.mjs';
import { readFestivalActivitySnapshot } from './client.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { stockMatchesDelta } from './naval-facts.mjs';
import { ResourceLedger, safeResourceQuantity } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue, businessRejectionIdentity } from './business-functions.mjs';
const moduleId='compass-wheel',request='SpinCompassWheelRequest',response='SpinCompassWheelResponse',ticket='活动26捞尸人_抽奖券',scope={kind:'ACCOUNT'};
const copy=v=>structuredClone(v),same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b),hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value');
const uint=n=>Number.isInteger(n)&&n>=0&&n<=2147483647,positive=n=>uint(n)&&n>0;
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=200;
const fields=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>keys.includes(k)&&Object.getOwnPropertyDescriptor(v,k)?.enumerable&&own(v,k));
const dense=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=10000&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,i)).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const configNames=['LinkageLSRCompassWheelCfg','ItemCfg','ModuleOpenCfg'],sources={compass:'CompassWheelInfoResponse',items:'AllItemResponse',resources:'AllResourceResponse'},liveFacts=new WeakMap();
const costSource='Fixed v76 LSRCompassPanel._gotoRequestBuyCompassRewards/_doRequestBuyCompassRewards; exact Info.cost * explicit 1/5/10/50, owned tickets only';
export const COMPASS_WHEEL_DEFAULT_CONFIG=Object.freeze({enabled:false});
export function validateCompassWheelConfig(v={}){if(!fields(v,['enabled'])||own(v,'enabled')&&typeof v.enabled!=='boolean')throw invalid('罗盘配置只接受enabled布尔值');return {enabled:v.enabled??false};}
function exactId(v){if(typeof v==='number'&&(!Number.isSafeInteger(v)||v<=0))return null;const n=toSnapshotJson(v);if(!(typeof n==='number'||typeof n==='string'&&/^[1-9][0-9]*$/.test(n)))return null;try{return BigInt(n)>0n&&BigInt(n)<(1n<<63n)?String(n):null;}catch{return null;}}
export function validateCompassWheelParameters(v={}){
 if(!fields(v,['activityId','count'])||own(v,'activityId')&&(typeof v.activityId!=='string'||exactId(v.activityId)!==v.activityId)||own(v,'count')&&![1,5,10,50].includes(v.count)||own(v,'activityId')!==own(v,'count'))throw invalid('罗盘须明确活动正int64字符串及1/5/10/50次数，或空参数仅观察');
 return own(v,'activityId')?{activityId:v.activityId,count:v.count}:{};
}
export function compassWheelAction(parameters) {const p=validateCompassWheelParameters(parameters);if(!p.activityId)throw invalid('罗盘恢复须绑定原明确活动及次数');return {request,response,body:buildCompassSpinBody(p.activityId,p.count)};}
function contextOf(client,player){const c=client.factContext,role=k=>{const id=own(player,k)?exactId(player[k]):null;return own(c,k)&&exactId(c[k])!==id?null:id;};return {accountId:text(c?.accountId)?c.accountId:null,generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null,playerId:role('playerId'),worldId:role('worldId'),playerLevel:own(player,'level')&&positive(player.level)?player.level:null};}
function clockOf(client,c){let t;try{t=client.gameClock?.read(c);}catch{return null;}return t?.status==='TRUSTED'&&t.reliable===true&&t.source==='PingResponse.serverTimestamp'&&t.accountId===c.accountId&&t.generation===c.generation&&['earliestMs','nowMs','latestMs'].every(k=>own(t,k)&&Number.isFinite(t[k])&&t[k]>=0&&t[k]<=Number.MAX_SAFE_INTEGER)&&t.earliestMs<=t.nowMs&&t.nowMs<=t.latestMs?{earliestMs:t.earliestMs,nowMs:t.nowMs,latestMs:t.latestMs}:null;}
function windowOf(client,c,id){
 const s=toSnapshotJson(readFestivalActivitySnapshot(client,c));
 if(s?.reliable!==true||s.status!=='OBSERVED'||!dense(s.activities)||['playerId','worldId'].some(k=>exactId(s[k])!==c[k]))return null;
 const rows=s.activities.filter(r=>own(r,'activityId')&&exactId(r.activityId)===id);if(rows.length!==1)return null;const r=rows[0];
 if(!['festival','season','startTime','openTime','closeTime','endTime'].every(k=>own(r,k)&&uint(r[k]))||!own(r,'type')||r.type!=='捞尸人联动活动'||!dense(r.subActivity))return null;
 const subs=r.subActivity.filter(s=>own(s,'subActivityType')&&s.subActivityType===28);if(subs.length!==1)return null;const sub=subs[0];
 if(!['openTime','closeTime'].every(k=>own(sub,k)&&uint(sub[k]))||!(r.startTime<=r.openTime&&r.openTime<r.closeTime&&r.closeTime<=r.endTime&&sub.openTime<sub.closeTime))return null;
 return {activityId:id,festival:r.festival,type:r.type,season:r.season,startTime:r.startTime,openTime:r.openTime,closeTime:r.closeTime,endTime:r.endTime,subOpenTime:sub.openTime,subCloseTime:sub.closeTime};
}
// Parse original decoded objects before snapshotting; absent own fields never authorize.
function activitySelections(f){
 const l=liveFacts.get(f),c=f?.context;
 if(!l||l.digest!==digest(f)||l.client.connected!==true||!same(c,contextOf(l.client,l.player)))return null;
 const observed=toSnapshotJson(readFestivalActivitySnapshot(l.client,c));
 if(observed?.reliable!==true||observed.status!=='OBSERVED'||!dense(observed.activities)||['playerId','worldId'].some(key=>exactId(observed[key])!==c[key]))return null;
 // Reuse the exact write-side identity/window parser; this is a selection
 // source only, never proof that its time window or spin eligibility is open.
 return observed.activities.filter(row=>row?.type==='捞尸人联动活动').map(row=>{const id=exactId(row.activityId);return id?windowOf(l.client,c,id):null;}).filter(Boolean);
}
function infoOf(raw){
 if(!['score','claimedId','times','minScore','maxScore','pity'].every(k=>own(raw,k)&&uint(raw[k]))||raw.minScore>raw.maxScore||!own(raw,'cost')||!['type','id','num'].every(k=>own(raw.cost,k))||raw.cost.type!==0||raw.cost.id!==ticket||!positive(safeResourceQuantity(raw.cost.num))||!own(raw,'outerGot')||!dense(raw.outerGot)||raw.outerGot.some(n=>!Number.isInteger(n)||n<9||n>16)||new Set(raw.outerGot).size!==raw.outerGot.length)return null;
 return {score:raw.score,claimedId:raw.claimedId,times:raw.times,minScore:raw.minScore,maxScore:raw.maxScore,pity:raw.pity,cost:{type:0,id:ticket,num:safeResourceQuantity(raw.cost.num)},outerGot:[...raw.outerGot].sort((a,b)=>a-b)};
}
// Info observations retain their original source proof even when an unrelated
// inventory read fails. They never replace the complete write-side authority.
function liveContext(f){
 const l=liveFacts.get(f),c=f?.context;
 if(!l||!(f.stock instanceof Map)||l.digest!==digest(f)||l.client.connected!==true||!same(c,contextOf(l.client,l.player))||!text(c?.accountId)||!text(c?.connectionId)||!Number.isSafeInteger(c?.generation)||c.generation<0||!c.playerId||!c.worldId)return null;
 return l;
}
export function validateCompassInfoObservation(value){
 const keys=['version','status','source','sourceAt','activityId','info','reason','readOnly','claimable','executable','settlement','autoResume'];
 if(!fields(value,keys)||Reflect.ownKeys(value).length!==keys.length||value.version!==1||!['OBSERVED','UNKNOWN'].includes(value.status)||value.source!==sources.compass||
   value.activityId!==null&&(typeof value.activityId!=='string'||exactId(value.activityId)!==value.activityId)||value.readOnly!==true||value.claimable!==null||value.executable!==false||value.settlement!=='UNKNOWN'||value.autoResume!==false)throw invalid('罗盘历史须为精确只读Info观察，不含执行或领奖资格');
 const info=infoOf(value.info);
 if(value.status==='OBSERVED'?(!value.activityId||!Number.isSafeInteger(value.sourceAt)||value.sourceAt<0||!info||!same(info,value.info)||value.reason!==null):
   (value.sourceAt!==null||value.info!==null||value.reason!==(value.activityId?'INFO_SOURCE_UNKNOWN':'EXACT_ACTIVITY_REQUIRED')))throw invalid('罗盘Info历史缺少原来源、活动身份或完整字段');
 return copy(value);
}
export function compassInfoObservation(f){
 const activityId=typeof f?.parameters?.activityId==='string'&&exactId(f.parameters.activityId)===f.parameters.activityId?f.parameters.activityId:null;
 const base={version:1,status:'UNKNOWN',source:sources.compass,sourceAt:null,activityId,info:null,reason:activityId?'INFO_SOURCE_UNKNOWN':'EXACT_ACTIVITY_REQUIRED',readOnly:true,claimable:null,executable:false,settlement:'UNKNOWN',autoResume:false};
 if(!activityId||!liveContext(f))return validateCompassInfoObservation(base);
 const fact=f.sourceFacts?.compass,info=infoOf(f.inputs?.compass);
 if(fact?.provenance?.source!==sources.compass||!same(fact.value,f.inputs.compass)||!info||factsFreshnessPolicy(fact,{accountId:f.context.accountId,generation:f.context.generation,maxAgeMs:30000,scope}).status!=='FRESH')return validateCompassInfoObservation(base);
 return validateCompassInfoObservation({...base,status:'OBSERVED',sourceAt:fact.provenance.sourceAt,info,reason:null});
}
const stockState=stock=>[...stock].filter(([,num])=>num>0).sort(([a],[b])=>a.localeCompare(b)).map(([id,num])=>({id,num}));
function snapshot(inputs,context,compass=infoOf(inputs?.compass)){const stock=parseOperationInventory(inputs?.items,inputs?.resources);return compass&&stock.stockReliable?{context,compass,inventory:stockState(stock.stock)}:null;}
const digest=f=>hash({parameters:f.parameters,context:f.context,configEvidence:f.configEvidence,inputs:f.inputs,sourceFacts:f.sourceFacts,state:f.state,stock:[...f.stock].sort(),stockReliable:f.stockReliable,available:f.available,window:f.window,startClock:f.startClock,endClock:f.endClock});
export async function surveyCompassWheel(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
 parameters=validateCompassWheelParameters(parameters);const context=contextOf(client,player),opts={signal,stop},active=()=>assertExecutionActive(client,opts),startClock=clockOf(client,context),window=parameters.activityId?windowOf(client,context,parameters.activityId):null,notes=[];active();
 const observations=await Promise.all(Object.entries(sources).map(async([key,response])=>{const name=response.replace(/Response$/,'Request');active();if(key==='compass'&&!parameters.activityId||!protocol?.[name]||!protocol?.[response])return [key,null,null];try{const value=await awaitExecution(client.request(name,key==='compass'?{activityId:parameters.activityId}:{},response,timeout,{signal}),client,opts);return [key,value,Date.now()];}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': STATE_UNKNOWN');return [key,null,null];}}));
 active();if(!same(context,contextOf(client,player)))throw Object.assign(Error('罗盘采集期间账号或连接变化'),{code:'CANCELLED'});
 const raw=Object.fromEntries(observations.map(([k,v])=>[k,v])),inputs=toSnapshotJson(raw),compass=infoOf(raw.compass),inventory=parseOperationInventory(raw.items,raw.resources),state=snapshot(inputs,context,compass),sourceFacts=Object.fromEntries(observations.map(([k,,sourceAt])=>[k,createStateFact(inputs[k],{accountId:context.accountId,generation:context.generation,source:sources[k],sourceAt,scope,reliable:k==='compass'?compass!==null:inventory.stockReliable})]));
 const f={module:moduleId,parameters,context,configEvidence:{tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))},inputs,sourceFacts,state,...inventory,available:Object.keys(protocol??{}),window:same(window,parameters.activityId?windowOf(client,context,parameters.activityId):null)?window:null,startClock,endClock:clockOf(client,context),notes};liveFacts.set(f,{client,player,digest:digest(f)});return f;
}
function authority(f){const c=f?.context;if(!liveContext(f)||!f.state||!f.stockReliable||!(f.stock instanceof Map)||!same(snapshot(f.inputs,c),f.state))return false;return Object.entries(sources).every(([k,s])=>f.sourceFacts?.[k]?.provenance?.source===s&&same(f.sourceFacts[k].value,f.inputs[k])&&factsFreshnessPolicy(f.sourceFacts[k],{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope}).status==='FRESH');}
function period(f){const l=liveFacts.get(f),clock=l?clockOf(l.client,f.context):null,w=f?.window;if(!w||!clock||!f.startClock||!f.endClock||!same(w,windowOf(l.client,f.context,f.parameters.activityId))||f.startClock.earliestMs>f.endClock.earliestMs||f.endClock.earliestMs>clock.earliestMs)return false;return [f.startClock,f.endClock,clock].every(t=>t.earliestMs>=Math.max(w.openTime,w.subOpenTime)*1000&&t.latestMs<Math.min(w.closeTime,w.subCloseTime)*1000);}
function definitions(config){
 const rows=config?.tables?.LinkageLSRCompassWheelCfg?.data,items=config?.tables?.ItemCfg?.data,gates=config?.tables?.ModuleOpenCfg?.data;
 if(!dense(rows)||rows.length!==16||!dense(items)||!dense(gates))return null;const gate=gates.filter(r=>r.moduleId==='节日活动'),item=id=>items.filter(r=>own(r,'id')&&r.id===id);
 if(gate.length!==1||!own(gate[0],'playerLevel')||!positive(gate[0].playerLevel)||item(ticket).length!==1||item(ticket)[0].type!=='节日活动')return null;const map=new Map();
 for(const r of rows){if(!['rewardId','ring','isDragon','minDraw','mustDraw','fixedReward'].every(k=>own(r,k))||!positive(r.rewardId)||r.rewardId>16||map.has(r.rewardId)||r.ring!==(r.rewardId<=8?1:2)||r.isDragon!==(r.rewardId===8?'是':'')||!uint(r.minDraw)||!uint(r.mustDraw)||!dense(r.fixedReward))return null;
 if(r.rewardId===8){if(r.fixedReward.length!==0||r.minDraw>r.mustDraw||!positive(r.mustDraw))return null;}else if(r.fixedReward.length!==2||!text(r.fixedReward[0])||!positive(r.fixedReward[1])||item(r.fixedReward[0]).length!==1||!['节日活动','英雄碎片','英雄万能碎片','自选包'].includes(item(r.fixedReward[0])[0].type))return null;map.set(r.rewardId,r);}
 return {map,level:gate[0].playerLevel};
}
export function parseCompassWheelState(value) {
 const keys=['context','compass','inventory'],c=value?.context,contextKeys=['accountId','generation','connectionId','playerId','worldId','playerLevel'];
 if(!fields(value,keys)||Reflect.ownKeys(value).length!==keys.length||!fields(c,contextKeys)||Reflect.ownKeys(c).length!==contextKeys.length||!text(c.accountId)||!text(c.connectionId)||!Number.isSafeInteger(c.generation)||c.generation<0||!c.playerId||!c.worldId||exactId(c.playerId)!==c.playerId||exactId(c.worldId)!==c.worldId||!positive(c.playerLevel))return null;
 const compass=infoOf(value.compass);if(!compass||!same(compass,value.compass)||!dense(value.inventory)||value.inventory.some(row=>!fields(row,['id','num'])||Reflect.ownKeys(row).length!==2||!text(row.id)||!Number.isSafeInteger(row.num)||row.num<=0)||new Set(value.inventory.map(row=>row.id)).size!==value.inventory.length)return null;
 const inventory=stockState(new Map(value.inventory.map(row=>[row.id,row.num])));return same(inventory,value.inventory)?{context:copy(c),compass,inventory}:null;
}
export function parseCompassWheelSources(inputs,context) {const state=snapshot(toSnapshotJson(inputs),context);return state?parseCompassWheelState(state):null;}
export function compassWheelRecoveryWindow(client,context,parameters,expectedWindow) {
 let p;try{p=validateCompassWheelParameters(parameters);}catch{return null;}
 const w=p.activityId?windowOf(client,context,p.activityId):null,t=clockOf(client,context);
 return w&&t&&same(w,expectedWindow)&&t.earliestMs>=Math.max(w.openTime,w.subOpenTime)*1000&&t.latestMs<Math.min(w.closeTime,w.subCloseTime)*1000?{window:w,clock:t}:null;
}
export function compassWheelExpectedState(before,parameters,window) {
 let p;try{p=validateCompassWheelParameters(parameters);}catch{return null;}const state=parseCompassWheelState(before);
 return state&&p.activityId&&window?.activityId===p.activityId?{context:copy(state.context),window:copy(window),times:state.compass.times+p.count,claimedId:state.compass.claimedId,receiptRule:'EXACT_CONFIGURED_SPIN_REWARDS_AND_SCORE_WITH_COMPLETE_INVENTORY_NET',outerRule:'ORDERED_UNIQUE_OUTER_ADDITIONS; FULL_CYCLE_TRANSITION_UNVERIFIED',pityRule:'INDEPENDENT_SERVER_OBSERVATION_ONLY; NO_QUALIFICATION_OR_FORMULA',cost:copy(state.compass.cost),minScore:state.compass.minScore,maxScore:state.compass.maxScore}:null;
}
function candidate(f,{config,parameters=f?.parameters??{},moduleConfig=COMPASS_WHEEL_DEFAULT_CONFIG}={}){
 const valid=authority(f),info=f?.state?.compass??null,defs=same(configNames.map(n=>config?.tables?.[n]??null),configNames.map(n=>f?.configEvidence?.tables?.[n]??null))?definitions(f?.configEvidence):null,count=f?.parameters?.count??null,total=info&&count?info.cost.num*count:null;
 const blockedReason=!validateCompassWheelConfig(moduleConfig).enabled?'COMPASS_DISABLED':!f?.parameters?.activityId||!same(parameters,f.parameters)?'COMPASS_EXACT_SELECTION_REQUIRED':!valid?'COMPASS_AUTHORITY_UNKNOWN':!defs?'COMPASS_CONFIG_UNKNOWN':!positive(f.context.playerLevel)||f.context.playerLevel<defs.level?'COMPASS_LEVEL_LOCKED':!period(f)?'COMPASS_WINDOW_UNKNOWN':info.outerGot.length===8?'COMPASS_OUTER_CYCLE_UNVERIFIED':!Number.isSafeInteger(total)||!positive(total)||!uint(info.times+count)?'COMPASS_COST_UNKNOWN':(f.stock.get(ticket)??0)<total?'COMPASS_TICKETS_INSUFFICIENT':![request,response].every(n=>f.available.includes(n))?'PROTOCOL_UNAVAILABLE':null;
 const beforeState=copy(f?.state??null),identity=hash({beforeState,window:f?.window??null,parameters:f?.parameters??{},config:f?.configEvidence??null}),costs=total?[{id:ticket,num:total}]:[],target={activityId:f?.parameters?.activityId??null,season:f?.window?.season??null,timesBefore:info?.times??null,count},budgetClaims={resources:copy(costs),quotas:[{id:moduleId+':'+target.activityId,num:count??1}],uids:[{type:moduleId,id:target.activityId+':'+target.timesBefore}]};
 const expectedState=compassWheelExpectedState(beforeState,f?.parameters,f?.window);
 return {module:moduleId,actionId:moduleId+':'+identity,actionType:'SPIN',target,parameters:copy(f?.parameters??{}),identity,beforeState,expectedState,costs,costSource,budgetClaims,executable:blockedReason===null,blockedReason,label:'龙王罗盘 ×'+(count??'?'),...(blockedReason===null?{action:compassWheelAction(f.parameters)}:{})};
}
export function viewCompassWheel(f,options={}){validateCompassWheelParameters(options.parameters??{});const compassObservation=compassInfoObservation(f);return {module:moduleId,activitySelections:activitySelections(f),window:copy(f?.window??null),compass:copy(compassObservation.info),compassObservation,candidates:[candidate(f,options)],notes:[...(f?.notes??[]),'仅使用持有铜钱；完成抽取、累计领奖和到账分开。保底仅显示服务器原值，不预测；跨外环整轮结算未经证明时保持UNKNOWN，不自动重放。']};}
export function planCompassWheel(f,{parameters={},selections=[],ledger=new ResourceLedger(f?.stockReliable?f.stock:null),...options}={}){validateCompassWheelParameters(parameters);if(!dense(selections)||selections.length>1||selections.some(s=>!text(s)))throw invalid('罗盘每批只允许一个精确动作');const row=same(parameters,f?.parameters)?viewCompassWheel(f,{...options,parameters}).candidates.find(r=>r.executable&&selections.includes(r.actionId)):null;return {module:moduleId,actions:row&&ledger.reserve(row.costs)?[row]:[],notes:[]};}
// Fixed slot rewards stay held; full outer-cycle transition has no proven recovery rule.
export function compassWheelReceipt(result,before){
 const defs=definitions(before?.configEvidence);if(!defs)return null;
 if(!own(result,'spin')||!dense(result.spin)||result.spin.length!==before.parameters.count||!own(result,'score')||!uint(result.score)||!own(result,'reward')||!own(result.reward,'asset')||!dense(result.reward.asset))return null;
 let score=0;const rewards=new Map(),outer=new Set(before.state.compass.outerGot);
 for(const s of result.spin){if(!['innerId','outerId','score'].every(k=>own(s,k))||!uint(s.score)||!positive(s.innerId)||s.innerId>8||!uint(s.outerId))return null;const dragon=s.innerId===8;if(dragon?(s.outerId<9||s.outerId>16||outer.has(s.outerId)||outer.size===7):s.outerId!==0)return null;if(dragon)outer.add(s.outerId);const r=defs.map.get(dragon?s.outerId:s.innerId).fixedReward;rewards.set(r[0],(rewards.get(r[0])??0)+r[1]);score+=s.score;if(!uint(score))return null;}
 const typed=new Map();for(const a of result.reward.asset){const n=own(a,'num')?safeResourceQuantity(a.num):null;if(!own(a,'type')||a.type!==0||!own(a,'id')||!text(a.id)||!positive(n)||typed.has(a.id))return null;typed.set(a.id,n);}
 if(!same([...rewards].sort(),[...typed].sort())||result.score!==before.state.compass.score+score||!uint(result.score))return null;return {score:result.score,rewards:[...rewards].map(([id,num])=>({id,num})),outerGot:[...outer].sort((a,b)=>a-b)};
}
// The parsed receipt is created only after the original per-spin/config checks.
// This one state/net comparison is shared by live verification and read-only recovery.
export function verifyCompassWheelOutcome(operation,before,after,receipt) {
 const no=reason=>({confirmed:false,reason}),bState=parseCompassWheelState(before),aState=parseCompassWheelState(after);let p;try{p=validateCompassWheelParameters(operation?.parameters);}catch{return no('罗盘精确参数未知');}
 if(!p.activityId||!bState||!aState||!same(bState.context,aState.context)||!same(operation.beforeState,bState)||!fields(receipt,['score','rewards','outerGot'])||Reflect.ownKeys(receipt).length!==3||!uint(receipt.score)||!dense(receipt.rewards)||!receipt.rewards.length||receipt.rewards.some(row=>!fields(row,['id','num'])||Reflect.ownKeys(row).length!==2||!text(row.id)||!positive(row.num))||new Set(receipt.rewards.map(row=>row.id)).size!==receipt.rewards.length||!dense(receipt.outerGot)||receipt.outerGot.some(n=>!Number.isInteger(n)||n<9||n>16)||new Set(receipt.outerGot).size!==receipt.outerGot.length)return no('罗盘原状态或逐抽结算凭据不完整');
 const a=aState.compass,b=bState.compass,total=b.cost.num*p.count,expected=compassWheelExpectedState(bState,p,operation.expectedState?.window),costs=[{id:ticket,num:total}];
 if(!expected||!same(operation.expectedState,expected)||!same(operation.target,{activityId:p.activityId,season:expected.window.season,timesBefore:b.times,count:p.count})||!Number.isSafeInteger(total)||!positive(total)||!same(operation.costs,costs)||(new Map(bState.inventory.map(row=>[row.id,row.num])).get(ticket)??0)<total||b.outerGot.length>=8||receipt.outerGot.length>=8||receipt.outerGot.length-b.outerGot.length>p.count||b.outerGot.some(id=>!receipt.outerGot.includes(id))||receipt.score<b.score||!same([...receipt.outerGot].sort((a,b)=>a-b),receipt.outerGot)||a.times!==b.times+p.count||a.score!==receipt.score||a.claimedId!==b.claimedId||!same(a.cost,b.cost)||a.minScore!==b.minScore||a.maxScore!==b.maxScore||!same(a.outerGot,receipt.outerGot)||!stockMatchesDelta(new Map(bState.inventory.map(row=>[row.id,row.num])),new Map(aState.inventory.map(row=>[row.id,row.num])),costs,receipt.rewards))return no('逐抽配置奖励、typed积分、同活动累计次数/外环与完整库存净入未同时确认；未知不重放');
 return {confirmed:true,afterState:copy(aState),reason:'专用逐抽回执与同活动独立计次、积分、外环及完整库存精确结算确认',responseEvidence:{activityId:p.activityId,count:p.count,rewards:copy(receipt.rewards),scoreBefore:b.score,scoreAfter:a.score,pityObserved:a.pity,pitySemantics:'UNKNOWN'}};
}
export function verifyCompassWheel(operation,before,after,result){
 const no=reason=>({confirmed:false,reason});if(!authority(before)||!authority(after)||!same(before.context,after.context)||!same(before.parameters,after.parameters)||!same(before.window,after.window)||!period(before)||!period(after)||!same(before.configEvidence,after.configEvidence))return no('罗盘前后权威身份、窗口、配置或独立库存未知');
 const canonical=candidate(before,{config:before.configEvidence,moduleConfig:{enabled:true}});if(!canonical.executable||['module','actionId','actionType','target','parameters','identity','beforeState','expectedState','costs','costSource','budgetClaims','action'].some(k=>!same(operation?.[k],canonical[k])))return no('罗盘合同与写前事实不一致');
 const receipt=compassWheelReceipt(result,before);if(Object.keys(sources).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt))return no('罗盘复读来源早于原写前调查');
 return verifyCompassWheelOutcome(operation,before.state,after.state,receipt);
}
export function compassWheelDependencyVersions({config,moduleConfig=COMPASS_WHEEL_DEFAULT_CONFIG}={}){return {moduleConfig:validateCompassWheelConfig(moduleConfig),tables:Object.fromEntries(configNames.map(n=>[n,copy(config?.tables?.[n]??null)]))};}
export const compassWheelModule=Object.freeze({id:moduleId,label:'龙王罗盘',capabilities:Object.freeze(['BIZ-R17c']),defaultConfig:COMPASS_WHEEL_DEFAULT_CONFIG,validateConfig:validateCompassWheelConfig,validateParameters:validateCompassWheelParameters,survey:surveyCompassWheel,view:viewCompassWheel,plan:planCompassWheel,verify:verifyCompassWheel,rejectionIdentity:businessRejectionIdentity,dependencyVersions:compassWheelDependencyVersions});
