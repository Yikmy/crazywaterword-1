// Alliance Fort ordinary owned-material donation semantics only. The existing
// Alliance adapter and shared executor own authorization, transport and history.
// Static evidence: v76 FortExchangePop.ts:1263, FortDonatePop.ts:1261,
// FortUtil.ts:1269; fixed local protocol and Fort* configuration tables.
import { createHash } from 'node:crypto';
import { ResourceLedger, safeResourceQuantity as quantity } from './resource-ledger.mjs';
import { parseOperationInventory } from './hero-operations.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { createStateFact, factsFreshnessPolicy, readGameTime, trustedGameDay } from './state-facts.mjs';
import { toSnapshotJson } from './game.mjs';
import { stableBusinessValue } from './business-functions.mjs';

const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const dense=v=>Array.isArray(v)&&v.length<=10000&&Array.from({length:v.length},(_,i)=>own(v,i)).every(Boolean);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const uint=v=>Number.isInteger(v)&&v>=0&&v<=2147483647;
const positive=v=>uint(v)&&v>0;
const same=(a,b)=>stableBusinessValue(a)===stableBusinessValue(b),copy=v=>structuredClone(v);
const hash=v=>createHash('sha256').update(stableBusinessValue(v)).digest('hex');
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_PARAMETERS',statusCode:400});
const fields=(v,keys)=>object(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&own(Object.getOwnPropertyDescriptor(v,k),'value')&&Object.getOwnPropertyDescriptor(v,k).enumerable);
const materials=Object.freeze(['压电陶瓷','炮弹','耐火砖','高温合金','液态金属','碳纤维']);
const tableNames=Object.freeze(['WorldFortCfg','FortDonateMaterialCfg','FortParamCfg','FortSeasonUnlockCfg','ItemCfg']);
const names=Object.freeze({guild:'GuildInfoResponse',cities:'GuildCityInfoResponse',fort:'CityFortInfoResponse',items:'AllItemResponse',resources:'AllResourceResponse'});
const liveSessions=new WeakMap();
const source='v76 FortExchangePop._onBtnDonate/_calcRewardNum; WorldFortCfg.donateCost; FortDonateMaterialCfg.res; FortParamCfg; existing owned ordinary material only, selectPackNum=0';
export const ALLIANCE_FORT_DEFAULT_CONFIG=Object.freeze({enabled:false,fort:false});
export const ALLIANCE_FORT_EVIDENCE=Object.freeze({capabilityId:'PRO-002',ordinaryOwnedMaterials:'STATIC_VERIFIED',realGame:'REAL_UNVERIFIED',responseProcess:'SHAPE_ONLY_SEMANTICS_UNPROVEN',build:'EXCLUDED',finish:'EXCLUDED',demolish:'EXCLUDED',selectPack:'EXCLUDED_D6',automaticExchange:'EXCLUDED_D6'});
export function validateAllianceFortParameters(v={}){
 if(!fields(v,['cityId','itemId','num'])||own(v,'cityId')&&!positive(v.cityId)||own(v,'itemId')&&!materials.includes(v.itemId)||own(v,'num')&&!positive(v.num))throw invalid('堡垒普通材料捐赠只接受明确 cityId、六种普通 itemId 和正整数 num');
 if((own(v,'itemId')||own(v,'num'))&&(!own(v,'cityId')||!own(v,'itemId')||!own(v,'num')))throw invalid('堡垒捐赠必须同时指定 cityId、itemId、num');
 return Object.fromEntries(['cityId','itemId','num'].filter(k=>own(v,k)).map(k=>[k,v[k]]));
}
function configEnabled(c={}){if(!object(c)||![Object.prototype,null].includes(Object.getPrototypeOf(c))||['enabled','fort'].some(k=>own(c,k)&&(!own(Object.getOwnPropertyDescriptor(c,k),'value')||typeof c[k]!=='boolean')))throw invalid('联盟和堡垒开关必须为布尔值');return c.enabled===true&&c.fort===true;}
function exactId(v){if(typeof v==='number'&&!Number.isSafeInteger(v))return null;const n=toSnapshotJson(v);if(!(typeof n==='number'&&Number.isSafeInteger(n))&&!(typeof n==='string'&&/^[1-9]\d*$/.test(n)))return null;try{const id=BigInt(n);return id>0n&&id<(1n<<63n)?id.toString():null;}catch{return null;}}
export function allianceFortContext(client,player){
 assertExecutionActive(client);
 const c=client?.factContext,role=(keys,contextKey)=>{const values=keys.filter(k=>own(player,k)).map(k=>exactId(player[k]));return values.length&&values.every(v=>v!==null&&v===values[0])&&(!own(c,contextKey)||exactId(c[contextKey])===values[0])?values[0]:null;};
 return {accountId:text(c?.accountId)?c.accountId:null,playerId:role(['playerId','id'],'playerId'),worldId:role(['worldId'],'worldId'),guildId:role(['guildId'],'guildId'),generation:Number.isSafeInteger(c?.generation)&&c.generation>=0?c.generation:null,connectionId:text(c?.connectionId)?c.connectionId:null};
}
function validContext(c){return fields(c,['accountId','playerId','worldId','guildId','generation','connectionId'])&&text(c.accountId)&&['playerId','worldId','guildId'].every(k=>exactId(c[k])===c[k]&&c[k]!==null)&&Number.isSafeInteger(c.generation)&&c.generation>=0&&(c.connectionId===null||text(c.connectionId));}
function catalog(config){
 const rows=n=>config?.tables?.[n]?.data,bad=()=>({reliable:false,forts:[],materials:[],threshold:null,ratio:null,unlockSeason:null});
 if(tableNames.some(n=>!dense(rows(n))||!rows(n).length))return bad();
 const itemRows=rows('ItemCfg'),donations=rows('FortDonateMaterialCfg'),fortRows=rows('WorldFortCfg'),params=rows('FortParamCfg'),unlocks=rows('FortSeasonUnlockCfg');
 if(new Set(itemRows.map(r=>r?.id)).size!==itemRows.length||donations.length!==materials.length||new Set(donations.map(r=>r?.id)).size!==donations.length)return bad();
 const parsed=[];
 for(const row of donations){if(!fields(row,['id','res'])||!materials.includes(row.id)||!dense(row.res)||row.res.length!==2||row.res[0]!=='功勋'||quantity(row.res[1])!==row.res[1]||row.res[1]<=0||itemRows.find(r=>r?.id===row.id)?.type!=='加工品')return bad();parsed.push({id:row.id,rewardId:row.res[0],base:row.res[1]});}
 if(itemRows.find(r=>r?.id==='功勋')?.type!=='通用')return bad();
 const thresholdRows=params.filter(r=>r?.param==='捐献功勋衰减阈值'),ratioRows=params.filter(r=>r?.param==='捐献功勋衰减比例');
 if(thresholdRows.length!==1||ratioRows.length!==1||quantity(thresholdRows[0].value)!==thresholdRows[0].value||!uint(ratioRows[0].value)||ratioRows[0].value>10000)return bad();
 const fortKeys=['fortId','icon','modelRes','name','buildCost','buildCd','maxCount','seasonStage','effectCd','durability','durabilityDesc','desc','donateCost','effectParam'];
 if(new Set(fortRows.map(r=>r?.fortId)).size!==fortRows.length)return bad();const forts=[];
 for(const row of fortRows){if(!fields(row,fortKeys)||!text(row.fortId)||!dense(row.donateCost)||!row.donateCost.length||row.donateCost.some(v=>!dense(v)||v.length!==2||!materials.includes(v[0])||!positive(v[1]))||new Set(row.donateCost.map(v=>v[0])).size!==row.donateCost.length)return bad();forts.push({type:row.fortId,requirements:row.donateCost.map(([id,num])=>({id,num})).sort((a,b)=>a.id.localeCompare(b.id))});}
 const first=unlocks[0];if(!positive(first?.season)||!dense(first?.fortIdList)||!forts.every(f=>first.fortIdList.includes(f.type)))return bad();
 return {reliable:true,forts:forts.sort((a,b)=>a.type.localeCompare(b.type)),materials:parsed.sort((a,b)=>a.id.localeCompare(b.id)),threshold:thresholdRows[0].value,ratio:ratioRows[0].value,unlockSeason:first.season};
}
function parseProcess(v,definition){
 if(!dense(v)||!definition||v.some(r=>!own(r,'itemId')||!own(r,'num')||!text(r.itemId)||quantity(r.num)===null)||new Set(v.map(r=>r.itemId)).size!==v.length)return null;
 const requirements=new Map(definition.requirements.map(r=>[r.id,r.num]));
 if(v.some(r=>!requirements.has(r.itemId)||quantity(r.num)>requirements.get(r.itemId)))return null;
 // FortDonatePop._getDonatedItemNum explicitly treats an absent material as 0.
 const current=new Map(v.map(r=>[r.itemId,quantity(r.num)]));return definition.requirements.map(r=>({itemId:r.id,num:current.get(r.id)??0}));
}
function parseFort(v,c){
 if(!own(v,'cityId')||!positive(v.cityId)||!own(v,'type')||!text(v.type)||!own(v,'state')||!uint(v.state)||v.state>1||!own(v,'process'))return null;
 const process=parseProcess(v.process,c.forts.find(r=>r.type===v.type));if(!process)return null;
 const result={cityId:v.cityId,type:v.type,state:v.state,process};
 for(const key of['durability','effectTime'])if(own(v,key)){if(!uint(v[key]))return null;result[key]=v[key];}return result;
}
const scope=(key,cityId)=>key==='fort'?{kind:'ENTITY',key:'CITY:'+String(cityId??'?')}:{kind:'ACCOUNT'};
const stockEntries=stock=>[...stock].sort(([a],[b])=>a.localeCompare(b));
const stockState=stock=>stockEntries(stock).filter(([,num])=>num>0).map(([id,num])=>({id,num}));
function decode(inputs,c,p,context){
 const inventory=parseOperationInventory(inputs?.items,inputs?.resources),guildId=own(inputs?.guild,'guild')&&own(inputs.guild.guild,'guildId')?exactId(inputs.guild.guild.guildId):null;
 const cityRows=own(inputs?.cities,'cities')&&dense(inputs.cities.cities)?inputs.cities.cities:null;
 const cities=cityRows&&cityRows.every(r=>own(r,'cityId')&&positive(r.cityId)&&own(r,'recommended')&&typeof r.recommended==='boolean'&&own(r,'defenceNum')&&uint(r.defenceNum))&&new Set(cityRows.map(r=>r.cityId)).size===cityRows.length?cityRows.map(r=>r.cityId).sort((a,b)=>a-b):null;
 const rawFort=own(inputs?.fort,'fort')?inputs.fort.fort:null,fort=parseFort(rawFort,c),dailyDonateNum=own(inputs?.fort,'dailyDonateNum')?quantity(inputs.fort.dailyDonateNum):null;
 const city=cityRows?.find(r=>r.cityId===p.cityId),cityFort=own(city,'fort')?parseFort(city.fort,c):null;
 const season=validContext(context)?Number(BigInt(context.worldId)/1000000n%1000n):null;
 const reliable={guild:guildId!==null&&guildId===context?.guildId,cities:cities!==null&&!!p.cityId&&cities.includes(p.cityId)&&cityFort!==null,fort:fort!==null&&fort.cityId===p.cityId&&dailyDonateNum!==null&&same(fort,cityFort),items:inventory.stockReliable,resources:inventory.stockReliable};
 return {guildId,cities,fort,dailyDonateNum,season,...inventory,reliable};
}
function dayOf(gameTime,context){
 if(gameTime?.status!=='TRUSTED'||gameTime.reliable!==true||gameTime.accountId!==context?.accountId||gameTime.generation!==context?.generation||gameTime.source!=='PingResponse.serverTimestamp'||![gameTime.earliestMs,gameTime.nowMs,gameTime.latestMs].every(v=>Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER)||gameTime.earliestMs>gameTime.nowMs||gameTime.nowMs>gameTime.latestMs)return null;
 const day=trustedGameDay(gameTime,{utcOffsetMinutes:480});return day.reliable?day.dayKey:null;
}
function derivedState(decoded,context,dayKey){return {context:copy(context),dayKey,guildId:decoded.guildId,season:decoded.season,cities:copy(decoded.cities),fort:copy(decoded.fort),dailyDonateNum:decoded.dailyDonateNum,inventory:decoded.stockReliable?stockState(decoded.stock):null};}
// Reuse raw Alliance observations with their original completion times and clocks.
// Never replace sourceAt or gameTime with the completion time of a later sibling.
export function parseAllianceFortObservations(observations,{context,parameters={},config,available=[],notes=[],currentGameTime,currentContext}={}){
 parameters=validateAllianceFortParameters(parameters);context=copy(context??{});const definitions=catalog(config),raw=Object.fromEntries(Object.keys(names).map(k=>[k,observations?.[k]?.value??null]));
 const decoded=decode(raw,definitions,parameters,context),inputs=toSnapshotJson(raw),sourceFacts={},sourceClocks={};
 for(const [key,name]of Object.entries(names)){const observation=observations?.[key],clock=toSnapshotJson(observation?.gameTime??null);sourceClocks[key]=clock;sourceFacts[key]=createStateFact(inputs[key],{accountId:context.accountId,generation:context.generation,source:name,sourceAt:observation?.sourceAt??null,serverTime:Number.isFinite(clock?.nowMs)?Math.floor(clock.nowMs):null,scope:scope(key,parameters.cityId),reliable:decoded.reliable[key]===true&&(!own(observation,'source')||observation.source===name)});}
 const days=Object.keys(names).map(k=>dayOf(sourceClocks[k],context)),dayKey=days[0]&&days.every(d=>d===days[0])?days[0]:null;
 const facts={module:'alliance',parameters,identityContext:context,...decoded,catalog:definitions,inputs,sourceFacts,sourceClocks,dayKey,available:[...available],notes:[...notes],evidence:ALLIANCE_FORT_EVIDENCE,state:derivedState(decoded,context,dayKey)};
 if(typeof currentGameTime==='function'&&typeof currentContext==='function')liveSessions.set(facts,{currentGameTime,currentContext});return facts;
}
export async function surveyAllianceFort(client,protocol,{config,player,parameters={},signal,stop,timeout=15000}={}){
 parameters=validateAllianceFortParameters(parameters);const options={signal,stop},active=()=>assertExecutionActive(client,options),context=allianceFortContext(client,player),observations={},notes=[];active();
 const get=async(key,request,body={})=>{const response=names[key];active();if(!protocol?.[request]||!protocol?.[response]){notes.push(request+': PROTOCOL_UNAVAILABLE');return;}try{const value=await awaitExecution(client.request(request,body,response,timeout,{signal}),client,options);active();observations[key]={value,sourceAt:Date.now(),gameTime:readGameTime(client).gameTime};}catch(error){if(executionOutcome(error)==='CANCELLED')throw error;notes.push(request+': STATE_UNKNOWN');}};
 await Promise.all([get('guild','GuildInfoRequest'),get('cities','GuildCityInfoRequest'),parameters.cityId?get('fort','CityFortInfoRequest',{cityId:parameters.cityId}):null,get('items','AllItemRequest'),get('resources','AllResourceRequest')]);
 active();if(!same(context,allianceFortContext(client,player)))throw Object.assign(new Error('堡垒采集期间账号、角色、联盟或代次改变'),{code:'CANCELLED'});
 return parseAllianceFortObservations(observations,{context,parameters,config,available:Object.keys(protocol??{}),notes,currentGameTime:()=>readGameTime(client).gameTime,currentContext:()=>allianceFortContext(client,player)});
}
function authority(f){try{
 const c=f?.identityContext,session=liveSessions.get(f);if(!validContext(c)||!f?.catalog?.reliable||!session||!same(session.currentContext(),c))return false;
 const currentClock=session.currentGameTime();if(dayOf(currentClock,c)!==f.dayKey)return false;
 try{validateAllianceFortParameters(f.parameters);}catch{return false;}
 const decoded=decode(f.inputs,f.catalog,f.parameters,c);if(!Object.values(decoded.reliable).every(Boolean)||!f.stockReliable||!(f.stock instanceof Map)||[...f.stock].some(([id,num])=>!text(id)||quantity(num)!==num)||!same(stockEntries(decoded.stock),stockEntries(f.stock)))return false;
 for(const key of['guildId','cities','fort','dailyDonateNum','season'])if(!same(decoded[key],f[key]))return false;
 const days=Object.keys(names).map(k=>dayOf(f.sourceClocks?.[k],c));if(!days[0]||!days.every(d=>d===days[0])||f.dayKey!==days[0]||!same(f.state,derivedState(decoded,c,days[0])))return false;
 return Object.entries(names).every(([key,name])=>{const fact=f.sourceFacts?.[key],clock=f.sourceClocks?.[key],age=Date.now()-fact?.provenance?.sourceAt,margin=Math.max(0,age)*0.00005,projected=clock?{...clock,earliestMs:clock.earliestMs+age-margin,nowMs:clock.nowMs+age,latestMs:clock.latestMs+age+margin}:null;return fact?.provenance?.source===name&&fact.provenance.serverTime===Math.floor(clock?.nowMs)&&same(fact.value,f.inputs[key])&&factsFreshnessPolicy(fact,{accountId:c.accountId,generation:c.generation,maxAgeMs:30000,scope:scope(key,f.parameters.cityId)}).status==='FRESH'&&dayOf(projected,c)===f.dayKey;});
 }catch{return false;}
}
// Match the client's single floor after the reduced subtotal, using exact math.
export function allianceFortReward(base,num,used,threshold,ratio){
 if([base,num,used,threshold,ratio].some(v=>quantity(v)!==v)||!base||!num||ratio>10000)return null;
 const normal=Math.max(0,Math.min(num,threshold-used)),reduced=num-normal,n=BigInt(base)*BigInt(normal)+BigInt(base)*BigInt(reduced)*BigInt(ratio)/10000n;
 return n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;
}
function expectation(f,p,reward){
 if(!authority(f)||reward===null)return null;const state=copy(f.state),stock=new Map(f.stock);
 const balance=(stock.get(p.itemId)??0)-p.num,merit=(stock.get('功勋')??0)+reward,count=state.dailyDonateNum+p.num;
 if(quantity(balance)!==balance||quantity(merit)!==merit||quantity(count)!==count)return null;
 stock.set(p.itemId,balance);stock.set('功勋',merit);state.inventory=stockState(stock);state.dailyDonateNum=count;state.fort.process.find(r=>r.itemId===p.itemId).num+=p.num;return state;
}
function candidate(f,p,{config,moduleConfig=ALLIANCE_FORT_DEFAULT_CONFIG}={}){
 p=validateAllianceFortParameters(p);const enabled=configEnabled(moduleConfig),known=authority(f),c=f?.catalog,definition=dense(c?.forts)?c.forts.find(r=>r.type===f?.fort?.type):null,material=dense(c?.materials)?c.materials.find(r=>r.id===p.itemId):null,progress=dense(f?.fort?.process)?f.fort.process.find(r=>r.itemId===p.itemId)?.num:undefined,limit=dense(definition?.requirements)?definition.requirements.find(r=>r.id===p.itemId)?.num:undefined;
 const costs=p.itemId&&p.num?[{id:p.itemId,num:p.num}]:[],reward=known&&material&&p.num?allianceFortReward(material.base,p.num,f.dailyDonateNum,c.threshold,c.ratio):null;let reason=null;
 if(!p.cityId||!p.itemId||!p.num)reason='FORT_EXPLICIT_SINGLE_DONATION_REQUIRED';
 else if(!enabled)reason='FORT_DISABLED';
 else if(!known)reason='FORT_AUTHORITY_OR_TRUSTED_DAY_UNKNOWN';
 else if(!same(f.parameters,p))reason='FORT_SURVEY_TARGET_MISMATCH';
 else if(!same(c,catalog(config))||!definition||!material)reason='FORT_CONFIG_UNKNOWN';
 else if(!f.available?.includes('DonateFortRequest')||!f.available?.includes('DonateFortResponse'))reason='PROTOCOL_UNAVAILABLE';
 else if(f.season<c.unlockSeason)reason='FORT_SEASON_LOCKED';
 else if(f.fort.state!==0)reason='FORT_NOT_BUILDING';
 else if(limit===undefined||progress===undefined||p.num>limit-progress)reason='FORT_REMAINING_DEMAND_EXCEEDED';
 else if((f.stock.get(p.itemId)??0)<p.num)reason='FORT_OWNED_MATERIAL_INSUFFICIENT';
 const expectedState=known&&p.itemId&&p.num&&limit!==undefined&&progress!==undefined&&p.num<=limit-progress?expectation(f,p,reward):null;if(reason===null&&!expectedState)reason='FORT_REWARD_OR_QUANTITY_UNSAFE';
 const target={guildId:f?.guildId??null,cityId:p.cityId??null,fortType:f?.fort?.type??null,itemId:p.itemId??null,num:p.num??null},beforeState=copy(f?.state??null),identity=hash({beforeState,target,catalog:c??null,costs,reward});
 return {module:'alliance',capabilityId:'PRO-002',actionId:'alliance:donateFort:'+String(p.cityId??'?')+':'+identity,actionType:'donateFort',target,parameters:p,costs,costSource:source,beforeState,identity,expectedState,reward:reward===null?null:{type:0,id:'功勋',num:reward},executable:reason===null,blockedReason:reason,label:'堡垒普通材料捐赠 '+String(p.itemId??''),...(reason===null?{action:{request:'DonateFortRequest',response:'DonateFortResponse',body:{cityId:p.cityId,item:{itemId:p.itemId,num:p.num},selectPackNum:0}}}:{})};
}
export function viewAllianceFort(f,options={}){const p=validateAllianceFortParameters(options.parameters??f?.parameters??{});return {module:'alliance',fort:copy(f?.fort??null),materials:(f?.catalog?.forts?.find(r=>r.type===f?.fort?.type)?.requirements??[]).map(r=>({itemId:r.id,required:r.num,donated:f.fort.process.find(p=>p.itemId===r.id)?.num??null,owned:f.stockReliable?f.stock.get(r.id)??0:null})),dailyDonateNum:f?.dailyDonateNum??null,dayKey:f?.dayKey??null,candidates:[candidate(f,p,options)],reliability:{authority:authority(f),catalog:f?.catalog?.reliable===true},evidence:ALLIANCE_FORT_EVIDENCE,notes:[...(f?.notes??[]),'仅捐赠已经持有的六种普通材料；当日计数仅计算功勋衰减，不视为每日硬配额。']};}
export function planAllianceFort(f,{parameters=f?.parameters??{},selections,ledger=new ResourceLedger(f?.stockReliable?f.stock:null),...options}={}){
 parameters=validateAllianceFortParameters(parameters);if(selections!==undefined&&(!dense(selections)||selections.some(v=>!text(v))||new Set(selections).size!==selections.length))throw invalid('selections 必须为不重复的明确 actionId');
 const row=candidate(f,parameters,options);if(row.executable&&(selections===undefined||selections.includes(row.actionId))&&ledger.reserve(row.costs))return {module:'alliance',actions:[row],notes:[]};return {module:'alliance',actions:[],notes:[row.blockedReason??'ACTION_NOT_SELECTED_OR_SHARED_BUDGET_EXHAUSTED']};
}
export function verifyAllianceFort(operation,before,after,response){
 const failed=reason=>({confirmed:false,reason}),p=operation?.parameters;let parameters;try{parameters=validateAllianceFortParameters(p);}catch{return failed('捐赠参数不在单目标白名单');}
 if(!parameters.cityId||!parameters.itemId||!parameters.num||operation.actionType!=='donateFort'||operation.module!=='alliance'||operation.costSource!==source||!same(operation.action,{request:'DonateFortRequest',response:'DonateFortResponse',body:{cityId:p.cityId,item:{itemId:p.itemId,num:p.num},selectPackNum:0}}))return failed('捐赠请求必须为明确单城市单普通材料且selectPackNum=0');
 if(!authority(before)||!authority(after)||!same(before.identityContext,after.identityContext)||!same(before.catalog,after.catalog)||!same(before.parameters,p)||!same(after.parameters,p)||before.dayKey!==after.dayKey)return failed('权威事实、账号联盟代次、配置或可信游戏日不一致');
 if(Object.keys(names).some(k=>after.sourceFacts[k].provenance.sourceAt<before.sourceFacts[k].provenance.sourceAt||after.sourceClocks[k].nowMs<before.sourceClocks[k].nowMs))return failed('写后来源早于原始写前观察');
 const material=before.catalog.materials.find(r=>r.id===p.itemId),definition=before.catalog.forts.find(r=>r.type===before.fort.type),progress=before.fort.process.find(r=>r.itemId===p.itemId)?.num,limit=definition?.requirements.find(r=>r.id===p.itemId)?.num;
 if(before.fort.state!==0||limit===undefined||progress===undefined||p.num>limit-progress||!material||before.season<before.catalog.unlockSeason)return failed('写前堡垒状态、季节或剩余材料需求不允许捐赠');
 const reward=allianceFortReward(material.base,p.num,before.dailyDonateNum,before.catalog.threshold,before.catalog.ratio),expected=expectation(before,p,reward),target={guildId:before.guildId,cityId:p.cityId,fortType:before.fort.type,itemId:p.itemId,num:p.num},costs=[{id:p.itemId,num:p.num}],identity=hash({beforeState:before.state,target,catalog:before.catalog,costs,reward});
 if(!expected||!same(operation.target,target)||!same(operation.costs,costs)||!same(operation.beforeState,before.state)||operation.identity!==identity||!same(operation.expectedState,expected)||!same(operation.reward,{type:0,id:'功勋',num:reward}))return failed('动作身份、完整写前状态、成本或预期功勋不一致');
 // Response.process has no proven full-versus-delta consumer. Validate shape only;
 // fresh CityFortInfo is the authority for the complete current progress.
 if(!own(response,'process')||parseProcess(response.process,definition)===null||!own(response,'reward')||!own(response.reward,'asset')||!dense(response.reward.asset)||response.reward.asset.length!==1)return failed('typed响应缺少合法堡垒进度字段或精确功勋奖励');
 const asset=response.reward.asset[0];if(!own(asset,'type')||asset.type!==0||!own(asset,'id')||asset.id!=='功勋'||!own(asset,'num')||quantity(asset.num)!==reward)return failed('typed响应功勋类型或数量不匹配');
 if(!same(after.state,expected))return failed('完整权威复读未确认精确材料净扣、功勋净增、当日计数及堡垒进度，或其他状态变化');
 return {confirmed:true,reason:'typed功勋奖励匹配，权威复读精确确认自有材料扣除、功勋增加及同日捐赠计数，完整其他库存和归属不变',afterState:copy(after.state),responseEvidence:{typedResponse:'DonateFortResponse',responseProcess:'SHAPE_ONLY_SEMANTICS_UNPROVEN',authority:Object.values(names),dayKey:after.dayKey}};
}
export function allianceFortDependencyVersions({config,moduleConfig=ALLIANCE_FORT_DEFAULT_CONFIG}={}){return {catalog:catalog(config),tables:Object.fromEntries(tableNames.map(n=>[n,copy(config?.tables?.[n]??null)])),enabled:configEnabled(moduleConfig)};}
