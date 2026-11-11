// Alliance adapter only; the shared service owns authorization and transport.
// Evidence: cached GuildHelpRequest/Pop:1455-1459, GuildCityArmyPop:1445,
// GuildChestPop:1441, GuildUtil:1533, static protocol and configuration.
import { ResourceLedger, resourceCosts, safeResourceQuantity as quantity, stockFromResponses } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { readGameTime, gameTimeBounds } from './state-facts.mjs';
import { allianceFortContext, parseAllianceFortObservations, validateAllianceFortParameters, viewAllianceFort, planAllianceFort, verifyAllianceFort } from './alliance-fort.mjs';
const rows = (c,n) => c?.tables?.[n]?.data ?? [];
const text = (s) => typeof s === 'string' && s.trim().length > 0;
const stable = (v) => JSON.stringify(v, (_,x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])) : x);
const copy = (v) => JSON.parse(JSON.stringify(v));
const unique = (a,key) => Array.isArray(a) && new Set(a.map(key)).size === a.length;
// Preserve int64 identifiers rather than passing them through display normalization.
export function allianceId(v) {
  let n;
  if (typeof v === 'string' && v.length<=19 && /^\d+$/.test(v)) n=BigInt(v);
  else if (typeof v === 'number' && Number.isSafeInteger(v) && v>=0) n=BigInt(v);
  else if (v && Number.isInteger(v.low) && Number.isInteger(v.high) && v.low>=-2147483648 && v.low<=2147483647 && v.high>=-2147483648 && v.high<=2147483647) {
    n=(BigInt(v.high)<<32n)+BigInt(v.low>>>0); if(v.unsigned)n=BigInt.asUintN(64,n);
  }
  return n>0n && n<=9223372036854775807n ? n.toString() : null;
}

export const ALLIANCE_DEFAULT_CONFIG=Object.freeze({enabled:false,help:false,cancel:false,claimAid:false,ask:false,orders:false,welfare:false,fort:false,tech:false,memberIds:[],itemIds:[],priorityMemberIds:[],priorityItemIds:[],stockItemIds:[],stockReserveQuantities:[],dailyBudgetItemIds:[],dailyBudgetQuantities:[],maxDailyHelps:0,maxActionsPerPlan:1});
export function validateAllianceConfig(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(ALLIANCE_DEFAULT_CONFIG,k)))throw Error('联盟配置包含未知字段');
  const c=copy({...ALLIANCE_DEFAULT_CONFIG,...input});
  for(const k of ['enabled','help','cancel','claimAid','ask','orders','welfare','fort','tech'])if(typeof c[k]!=='boolean')throw Error('联盟开关必须为布尔值');
  for(const k of ['memberIds','priorityMemberIds'])if(!Array.isArray(c[k])||c[k].length>100||c[k].some(id=>typeof id!=='string'||allianceId(id)!==id)||!unique(c[k],id=>id))throw Error('联盟配置成员ID无效');
  for(const k of ['itemIds','priorityItemIds','stockItemIds','dailyBudgetItemIds'])if(!Array.isArray(c[k])||c[k].length>100||c[k].some(id=>!text(id)||id.length>200)||!unique(c[k],id=>id))throw Error('联盟配置物品ID无效');
  for(const [ids,nums] of [['stockItemIds','stockReserveQuantities'],['dailyBudgetItemIds','dailyBudgetQuantities']])if(!Array.isArray(c[nums])||c[nums].length!==c[ids].length||c[nums].some(n=>quantity(n)===null||typeof n!=='number'||n>1e9))throw Error('联盟库存线或日预算无效');
  if(!Number.isSafeInteger(c.maxDailyHelps)||c.maxDailyHelps<0||c.maxDailyHelps>1e6||!Number.isSafeInteger(c.maxActionsPerPlan)||c.maxActionsPerPlan<1||c.maxActionsPerPlan>100)throw Error('联盟数量上限无效');
  return c;
}
export const allianceBudgetDay=now=>{if(quantity(now)===null)return null;const day=new Date((now+28800)*1000);return Number.isNaN(day.getTime())?null:day.toISOString().slice(0,10);};
// Server limits and local daily spend must come from trusted survey/history facts,
// never from business parameters or user-editable configuration.
export function allianceHelpRules(f,{moduleConfig={},parameters=f.parameters??{},ledger=null}={}){
  const c=validateAllianceConfig(moduleConfig),p=parametersOf(parameters),decisions=[];
  const allowance=f.helpAllowance,usage=f.helpUsage,time=gameTimeBounds(f),firstDay=allianceBudgetDay(time.earliest),lastDay=allianceBudgetDay(time.latest),day=firstDay===lastDay?firstDay:null;
  const knownLimit=allowance?.reliable===true&&text(allowance.source)&&quantity(allowance.remaining)!==null&&quantity(allowance.cooldownUntil)!==null;
  const knownUsage=day!==null&&usage?.reliable===true&&text(usage.source)&&usage.dayKey===day&&quantity(usage.total)!==null&&usage.spentByItem instanceof Map&&[...usage.spentByItem].every(([id,num])=>text(id)&&quantity(num)!==null);
  const rank=(list,id)=>{const i=list.indexOf(id);return i<0?list.length:i;};
  const sorted=[...(f.asks??[])].sort((a,b)=>rank(c.priorityMemberIds,a.askerId)-rank(c.priorityMemberIds,b.askerId)||rank(c.priorityItemIds,a.itemId)-rank(c.priorityItemIds,b.itemId)||a.endTime-b.endTime||String(a.reqId).localeCompare(String(b.reqId)));
  const budget=new Map(c.dailyBudgetItemIds.map((id,i)=>[id,c.dailyBudgetQuantities[i]])),reserve=new Map(c.stockItemIds.map((id,i)=>[id,c.stockReserveQuantities[i]]));
  let remaining=knownLimit&&knownUsage?Math.min(allowance.remaining,Math.max(0,c.maxDailyHelps-usage.total)):null;
  for(const a of sorted){let blockedReason=null;
    if(!c.enabled||!c.help)blockedReason='MODULE_DISABLED';
    else if(!knownLimit)blockedReason='HELP_DAILY_LIMIT_OR_COOLDOWN_UNKNOWN';
    else if(!knownUsage)blockedReason='HELP_DAILY_BUDGET_USAGE_UNKNOWN';
    else if(time.earliest===null||time.latest===null)blockedReason='HELP_FACTS_UNKNOWN';
    else if(allowance.cooldownUntil>time.earliest)blockedReason='HELP_COOLDOWN_ACTIVE';
    else if(remaining<=0)blockedReason='HELP_DAILY_LIMIT_EXHAUSTED';
    else if(!f.asksReliable||!f.membersReliable||!f.stockReliable||time.now===null)blockedReason='HELP_FACTS_UNKNOWN';
    else if(a.endTime<=time.latest||a.askerId===f.playerId||!f.members.some(m=>m.playerId===a.askerId))blockedReason='HELP_TARGET_UNAVAILABLE';
    else if((c.memberIds.length&&!c.memberIds.includes(a.askerId))||(c.itemIds.length&&!c.itemIds.includes(a.itemId))||(p.memberIds&&!p.memberIds.includes(a.askerId))||(p.itemIds&&!p.itemIds.includes(a.itemId))||(p.reqIds&&!p.reqIds.includes(a.reqId)))blockedReason='HELP_TARGET_FILTERED';
    else if(!budget.has(a.itemId))blockedReason='HELP_ITEM_DAILY_BUDGET_NOT_CONFIGURED';
    else if((usage.spentByItem.get(a.itemId)??0)>=budget.get(a.itemId))blockedReason='HELP_ITEM_DAILY_BUDGET_EXHAUSTED';
    else {const have=ledger?ledger.available(a.itemId):f.stock.get(a.itemId)??0;if(quantity(have)===null||have-1<(reserve.get(a.itemId)??0))blockedReason='HELP_SAFETY_STOCK';}
    decisions.push({request:a,blockedReason,priority:decisions.length});
  }
  return {decisions,remaining,dayKey:day,config:c};
}

function parametersOf(p={}) {
  if (!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).some(k=>!['memberIds','itemIds','reqIds','cityId','season','techId','targetLevel','itemId','num'].includes(k))) throw Error('联盟参数不在业务白名单');
  if(Object.hasOwn(p,'itemId')||Object.hasOwn(p,'num'))return validateAllianceFortParameters(p);
  const out={};
  for(const k of ['memberIds','reqIds'])if(p[k]!==undefined){
    if(!Array.isArray(p[k]) || p[k].some(id=>!allianceId(id)) || !unique(p[k],allianceId))throw Error('联盟身份无效或重复'); out[k]=p[k].map(allianceId);
  }
  if(p.itemIds!==undefined){if(!Array.isArray(p.itemIds)||p.itemIds.some(id=>!text(id))||!unique(p.itemIds,x=>x))throw Error('联盟物品无效');out.itemIds=[...p.itemIds];}
  for(const k of ['cityId','season'])if(p[k]!==undefined){if(!Number.isSafeInteger(p[k])||p[k]<=0)throw Error('联盟城市或赛季无效');out[k]=p[k];}
  for(const k of ['techId','targetLevel'])if(p[k]!==undefined){if(!Number.isSafeInteger(p[k])||p[k]<=0||p[k]>2147483647)throw Error('联盟科技或目标等级无效');out[k]=p[k];}
  if((p.techId===undefined)!==(p.targetLevel===undefined))throw Error('联盟科技必须同时指定精确科技ID和目标等级');
  return out;
}
const field=(o,k)=>o&&Object.hasOwn(o,k)?o[k]:undefined;
const assetsValid = a => Array.isArray(a)&&a.every(x=>text(x?.id)&&quantity(x.num)!==null);
const aidRow=(a,others=false)=>({reqId:allianceId(a?.reqId),itemId:a?.reqItemId,endTime:quantity(field(a,'endTime')),...(others?{askerId:allianceId(a?.asker?.playerId),askTime:quantity(field(a,'askTime'))}:{helperId:a?.helper==null?null:allianceId(a.helper.playerId),helperKnown:a?.helper==null||!!allianceId(a.helper.playerId)})});
const aidValid=(a,others=false)=>!!a.reqId&&text(a.itemId)&&a.endTime!==null&&(others?!!a.askerId&&a.askTime!==null:a.helperKnown);
const counter=(f,type)=>{const found=f.counters?.filter(c=>c?.type===type);return found?.length===1?quantity(found[0].num):null;};
function maxOrders(c,level,season){
  if(quantity(level)===null||quantity(season)===null||!season)return null;
  const pool=rows(c,'GuildOrderNumCfg').filter(r=>Number.isSafeInteger(r.season)&&r.season<=season);if(!pool.length)return null;
  const s=Math.max(...pool.map(r=>r.season)),eligible=pool.filter(r=>r.season===s&&Number.isSafeInteger(r.playerLevel)&&r.playerLevel<=level);if(!eligible.length)return null;
  const l=Math.max(...eligible.map(r=>r.playerLevel)),chosen=eligible.filter(r=>r.playerLevel===l);
  return chosen.length===1&&Number.isSafeInteger(chosen[0].maxNum)&&chosen[0].maxNum>=-1?chosen[0].maxNum:null;
}
// Static client: GuildTechPop.ts:1525, GuildTechUtil.ts:1527, WorldIdRule.ts:3603.
const techInteger=n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
const techTypes=new Set(['世界','英雄','职级世界','职级基地','职级英雄']);
const techCostSource='GuildTechPop.ts:1525 techPointCost + techPointCostGrowth * currentLevel; AllItemsModel WellKnownItems';
export function allianceTechView(f,{config=null,parameters=f.parameters??{}}={}){
  const p=parametersOf(parameters),technologies=[],state={worldId:f.worldId??null,season:f.season??null,stage:f.seasonStage??null,reliable:f.techReliable===true};
  if(!Number.isSafeInteger(f.season)||f.season<1)return {technologies,state,blockedReason:'TECH_SEASON_UNKNOWN'};
  const configured=rows(config,'GuildTechCfg').filter(c=>c?.season===f.season);
  if(!configured.length||!unique(configured,c=>c.techId)||configured.some(c=>!techInteger(c.techId)||!c.techId))return {technologies,state,blockedReason:'TECH_CONFIG_UNKNOWN'};
  const current=new Map((f.techReliable?f.tech:[]).map(t=>[t.techId,t.level]));
  for(const c of configured){
    const level=f.techReliable?(current.get(c.techId)??0):null,itemId=c.type==='世界'||c.type==='英雄'?'公会科技点':techTypes.has(c.type)?'联盟职级科技点':null;
    const unlocks=rows(config,'TechUnlockCfg').filter(u=>u?.techId===c.techId);
    const validUnlocks=unlocks.length>0&&unlocks.every((u,i)=>techInteger(u.openStage)&&u.openStage>0&&techInteger(u.maxLevel)&&u.maxLevel>0&&techInteger(u.preTech)&&techInteger(u.preTechLevel)&&(u.preTech!==0||u.preTechLevel===0)&&(!i||(u.openStage>unlocks[i-1].openStage&&u.maxLevel>unlocks[i-1].maxLevel)));
    const stage=techInteger(f.seasonStage)?f.seasonStage:null;
    const unlocked=validUnlocks&&stage!==null?(stage===0?unlocks.at(-1):unlocks.filter(u=>u.openStage<=stage).at(-1)??unlocks[0]):null;
    const cost=level!==null&&quantity(c.techPointCost)!==null&&c.techPointCost>0&&quantity(c.techPointCostGrowth)!==null?c.techPointCost+c.techPointCostGrowth*level:null;
    const costs=itemId&&Number.isSafeInteger(cost)&&cost>0?[{id:itemId,num:cost}]:null;
    let blockedReason=null;
    if(!f.techReliable)blockedReason='TECH_LEVELS_UNKNOWN';
    else if(stage===null)blockedReason='TECH_STAGE_UNKNOWN';
    else if(!validUnlocks)blockedReason='TECH_UNLOCK_CONFIG_UNKNOWN';
    else if(!itemId)blockedReason='TECH_TYPE_UNKNOWN';
    else if(!costs)blockedReason='TECH_COST_UNKNOWN';
    else if(level>=unlocked.maxLevel)blockedReason='TECH_LEVEL_CAP_REACHED';
    else if(stage!==0&&stage<unlocked.openStage)blockedReason='TECH_STAGE_LOCKED';
    else if(unlocked.preTech&&(current.get(unlocked.preTech)??0)<unlocked.preTechLevel)blockedReason='TECH_PREREQUISITE_LOCKED';
    else if(!f.stockReliable)blockedReason='TECH_STOCK_UNKNOWN';
    else if(!new ResourceLedger(f.stock).canReserve(costs))blockedReason='TECH_RESOURCES_INSUFFICIENT';
    technologies.push({techId:c.techId,name:c.name??null,type:c.type??null,group:c.group??null,level,targetLevel:level===null?null:level+1,maxLevel:unlocked?.maxLevel??null,openStage:unlocked?.openStage??null,preTech:unlocked?.preTech??null,preTechLevel:unlocked?.preTechLevel??null,prerequisiteLevel:unlocked?.preTech?(current.get(unlocked.preTech)??0):0,itemId,costs,costSource:techCostSource,blockedReason});
  }
  const target=p.techId===undefined?null:technologies.find(t=>t.techId===p.techId);
  return {technologies,state,target,blockedReason:p.techId!==undefined&&!target?'TECH_TARGET_NOT_IN_SEASON':target?.blockedReason??(target&&p.targetLevel!==target.targetLevel?'TECH_EXACT_SINGLE_LEVEL_REQUIRED':null)};
}

// WorldIdRule.ts:3603; retain exact integer parsing used by the original alliance survey.
export function seasonFromWorldId(value) { const worldId=quantity(value); return worldId!==null&&worldId>0?Number(BigInt(worldId)/1000000n%1000n):null; }

export async function surveyAlliance(client,protocol,{config=null,player=null,signal,stop,parameters={},moduleConfig={},timeout=8000}={}){
  parameters=parametersOf(parameters);validateAllianceConfig(moduleConfig);const notes=[],available=Object.keys(protocol??{}),observations={},context=allianceFortContext(client,player),options={signal,stop};
  const observationKeys={GuildInfoRequest:'guild',GuildCityInfoRequest:'cities',CityFortInfoRequest:'fort',AllItemRequest:'items',AllResourceRequest:'resources'};
  const get=async(name,body={})=>{assertExecutionActive(client,options);const response=name.replace(/Request$/,'Response');
    if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': 协议不可用');return null;}
    try{const value=await awaitExecution(client.request(name,body,response,timeout,{signal}),client,options);assertExecutionActive(client,options);if(observationKeys[name])observations[observationKeys[name]]={value,sourceAt:Date.now(),gameTime:readGameTime(client).gameTime};return value;}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': UNKNOWN');return null;}};
  const [info,membersRes,aidRes,ownRes,orderRes,citiesRes,countersRes,items,resources,techRes,stageRes]=await Promise.all([
    get('GuildInfoRequest'),get('GuildMemberRequest'),get('GuildAidListRequest',{type:0}),get('MyGuildAidRequest',{type:0}),get('GuildOrderRequest'),get('GuildCityInfoRequest'),get('CounterInfoRequest'),get('AllItemRequest'),get('AllResourceRequest'),get('GuildTechInfoRequest'),get('SeasonTaskStageRequest'),parameters.cityId?get('CityFortInfoRequest',{cityId:parameters.cityId}):null]);
  assertExecutionActive(client,options);
  if(parameters.cityId&&stable(context)!==stable(allianceFortContext(client,player)))throw Object.assign(new Error('联盟采集期间账号、联盟或连接上下文变化'),{code:'CANCELLED'});
  const fortParameters=Object.fromEntries(['cityId','itemId','num'].filter(k=>parameters[k]!==undefined).map(k=>[k,parameters[k]]));
  const fortFacts=parameters.cityId?parseAllianceFortObservations(observations,{context,parameters:fortParameters,config,available,notes,currentGameTime:()=>readGameTime(client).gameTime,currentContext:()=>allianceFortContext(client,player)}):null;
  const asks=Array.isArray(aidRes?.askItems)?aidRes.askItems.map(a=>aidRow(a,true)):null,ownAids=Array.isArray(ownRes?.aids)?ownRes.aids.map(a=>aidRow(a)):null;
  const groups=membersRes?.titleList,members=Array.isArray(groups)&&groups.every(g=>Array.isArray(g?.members))?groups.flatMap(g=>g.members.map(m=>({playerId:allianceId(m?.playerId),nickname:m?.nickname,online:typeof field(m,'online')==='boolean'?m.online:null,title:g.guildTitle}))):null;
  const itemsValid=Array.isArray(items?.items)&&items.items.every(a=>text(a?.itemId??a?.id)&&quantity(field(a,'num')??field(a,'count'))!==null)&&unique(items.items,a=>a.itemId??a.id),resourcesValid=Array.isArray(resources?.list)&&resources.list.every(a=>quantity(a?.res)!==null&&quantity(field(a,'amount'))!==null)&&unique(resources.list,a=>a.res);
  const tech=Array.isArray(techRes?.tech)?techRes.tech.map(t=>({techId:field(t,'techId'),level:quantity(field(t,'level'))})):null;
  const techReliable=!!tech&&tech.every(t=>techInteger(t.techId)&&t.techId>0&&techInteger(t.level))&&unique(tech,t=>t.techId);
  const worldId=quantity(field(player,'worldId')),season=seasonFromWorldId(worldId),seasonStage=quantity(field(stageRes,'stage'));
  const stock=stockFromResponses(itemsValid?items:null,resourcesValid?resources:null),stockReliable=itemsValid&&resourcesValid&&[...stock.values()].every(n=>n!==null);
  return {module:'alliance',available,fortFacts,...readGameTime(client),
    playerId:allianceId(player?.id??player?.playerId),playerLevel:quantity(player?.level),worldId,season,seasonStage:techInteger(seasonStage)?seasonStage:null,tech,techReliable,helpAllowance:null,helpUsage:null,guildId:allianceId(info?.guild?.guildId),guild:info?.guild?{guildId:field(info.guild,'guildId'),welfarePack:info.guild.welfarePack,gotWelfareTime:quantity(field(info.guild,'gotWelfareTime'))}:null,members,
    membersReliable:!!members&&members.every(m=>!!m.playerId)&&unique(members,m=>m.playerId),asks,asksReliable:!!asks&&asks.every(a=>aidValid(a,true))&&unique(asks,a=>a.reqId),ownAids,ownReliable:!!ownAids&&ownAids.every(a=>aidValid(a))&&unique(ownAids,a=>a.reqId),order:orderRes?.order?{requirements:Array.isArray(orderRes.order.requirements)?orderRes.order.requirements.map(r=>({id:field(r,'id'),num:quantity(field(r,'num'))})):null,nextRefreshTime:quantity(field(orderRes.order,'nextRefreshTime'))}:null,cities:Array.isArray(citiesRes?.cities)?citiesRes.cities.map(c=>({cityId:field(c,'cityId'),recommended:field(c,'recommended')})):null,counters:Array.isArray(countersRes?.counters)?countersRes.counters.map(c=>({type:field(c,'type'),num:quantity(field(c,'num'))})):null,stock,stockReliable,parameters,notes};
}
export function allianceView(f,{config=null,parameters=f.parameters??{},moduleConfig={}}={}){
  parameters=parametersOf(parameters);moduleConfig=validateAllianceConfig(moduleConfig);const candidates=[],blocked=[],notes=[...(f.notes??[])];
  const tech=allianceTechView(f,{config,parameters});
  const fort=f.fortFacts?viewAllianceFort(f.fortFacts,{config,moduleConfig,parameters:Object.fromEntries(['cityId','itemId','num'].filter(k=>parameters[k]!==undefined).map(k=>[k,parameters[k]]))}):null;
  if(parameters.itemId!==undefined)return {guildId:f.guildId,playerId:f.playerId,fort,candidates:(fort?.candidates??[]).filter(c=>c.executable),blocked:(fort?.candidates??[]).filter(c=>!c.executable),notes:[...notes,...(fort?.notes??[])],members:[],technologies:[],dailyLimits:{ask:null,help:null}};
  const block=(actionType,blockedReason,target={})=>blocked.push({actionType,target,blockedReason});
  const enabled=d=>moduleConfig.enabled===true&&(moduleConfig[d]===true||moduleConfig[d]?.enabled===true),has=n=>f.available?.includes(n),chosen=(k,v)=>parameters[k]===undefined||parameters[k].includes(v),ledger=new ResourceLedger(f.stockReliable?f.stock:null);
  const add=(domain,type,target,beforeState,costs,costSource,request,body,response,expectedState)=>{
    if(!enabled(domain))return;if(!has(request))return block(type,'PROTOCOL_UNAVAILABLE',target);
    if(costs.length&&(!f.stockReliable||!ledger.canReserve(costs)))return block(type,'RESOURCE_UNKNOWN_OR_INSUFFICIENT',target);
    candidates.push({actionId:'alliance:'+type+':'+encodeURIComponent(stable(target)),actionType:type,target,costs,costSource,beforeState:copy(beforeState),identity:stable({guildId:f.guildId,playerId:f.playerId,beforeState}),expectedState,parameters:copy(parameters),action:{request,response:has(response)?response:null,body},label:'联盟 '+type});};
  if(!f.guildId||!f.playerId)return {candidates,blocked:[{blockedReason:'ALLIANCE_IDENTITY_UNKNOWN'}],notes,guildId:f.guildId,playerId:f.playerId,members:f.members??[],technologies:tech.technologies,techState:tech.state,dailyLimits:{ask:null,help:null}};
  const time=gameTimeBounds(f),own=f.ownReliable?f.ownAids:[],nowKnown=time.now!==null,dayKnown=allianceBudgetDay(time.earliest)!==null&&allianceBudgetDay(time.earliest)===allianceBudgetDay(time.latest);
  const helpRules=allianceHelpRules(f,{moduleConfig,parameters});
  if(f.asksReliable&&f.membersReliable&&nowKnown)for(const decision of helpRules.decisions){const a=decision.request;if(decision.blockedReason){if(enabled('help'))block('help',decision.blockedReason,{reqId:a.reqId});continue;}
    if(a.endTime<=time.latest||a.askerId===f.playerId||!chosen('memberIds',a.askerId)||!chosen('reqIds',a.reqId)||!chosen('itemIds',a.itemId))continue;
    if(!f.members.some(m=>m.playerId===a.askerId)){block('help','REQUESTER_MEMBERSHIP_UNKNOWN',{reqId:a.reqId});continue;}
    add('help','help',{reqId:a.reqId,playerId:a.askerId,itemId:a.itemId},a,[{id:a.itemId,num:1}],'GuildHelpRequest.ts:1459 one item per reqId','GuildAidHelpRequest',{reqId:[a.reqId],type:0},null,{requestRemoved:true,stockConsumed:1});
  }else block('help','AID_LIST_MEMBERS_OR_SERVER_TIME_UNKNOWN');
  if(f.ownReliable&&nowKnown)for(const a of own)if(!a.helperId&&a.endTime>time.latest&&chosen('reqIds',a.reqId)&&chosen('itemIds',a.itemId))add('cancel','cancel',{reqId:a.reqId,itemId:a.itemId},a,[],'GuildHelpItem.ts:1455 cancel own request','CancelMyGuildAidRequest',{reqId:a.reqId},null,{ownRequestRemoved:true});
  const helped=own.filter(a=>a.helperId);
  if(f.ownReliable&&helped.length&&f.stockReliable)add('claimAid','claimAid',{reqIds:helped.map(a=>a.reqId)},own,[],'GuildHelpItem.ts:1455 claim-all, no cost','GotMyGuildAidRequest',{},null,{receivedItems:helped.map(a=>a.itemId)});
  const limitRows=rows(config,'GuildParamCfg').filter(r=>r.paramName==='每日求助次数上限'),maxAsk=limitRows.length===1?quantity(limitRows[0].paramValue):null,usedAsk=counter(f,'DAILY_GUILD_AID');
  // No authoritative ask cooldown field exists in the inspected model.
  if(enabled('ask'))block('ask',maxAsk===null||usedAsk===null?'ASK_DAILY_LIMIT_UNKNOWN':'ASK_COOLDOWN_UNKNOWN');
  const cap=maxOrders(config,f.playerLevel,f.season),done=counter(f,'DAILY_FINISH_GUILD_ORDER'),order=f.order;
  if(enabled('orders')){
    if(cap===null||done===null)block('finishOrder','ORDER_DAILY_LIMIT_UNKNOWN');
    else if(cap!==-1&&done>=cap)block('finishOrder','ORDER_DAILY_LIMIT_EXHAUSTED');
    else if(!nowKnown||!dayKnown||quantity(order?.nextRefreshTime)===null||order.nextRefreshTime<=time.latest||!assetsValid(order?.requirements)||!order.requirements.length||order.requirements.some(a=>quantity(a.num)===0))block('finishOrder','ORDER_STATE_UNKNOWN_OR_EXPIRED');
    else if(!Array.isArray(f.cities)||f.cities.some(c=>!Number.isSafeInteger(c?.cityId)||c.cityId<=0)||!unique(f.cities,c=>c.cityId))block('finishOrder','ORDER_CITY_UNKNOWN');
    else for(const city of f.cities.filter(c=>parameters.cityId===undefined||c.cityId===parameters.cityId))add('orders','finishOrder',{cityId:city.cityId},{order,done},resourceCosts(order.requirements),'GuildOrderResponse.order.requirements; GuildCityArmyPop.ts:1445','FinishGuildOrderRequest',{cityId:city.cityId},'FinishGuildOrderResponse',{counterIncrement:1});
  }
  const packs=f.guild?.welfarePack,got=quantity(f.guild?.gotWelfareTime);
  if(enabled('welfare')){
    if(!f.stockReliable||!Array.isArray(packs)||packs.some(p=>!allianceId(p?.id)||quantity(p.createTime)===null)||!unique(packs,p=>allianceId(p.id))||got===null||!nowKnown)block('claimWelfare','WELFARE_STATE_UNKNOWN');
    else {const unclaimed=packs.filter(p=>p.createTime>got&&p.createTime+86400>time.latest);if(unclaimed.length)add('welfare','claimWelfare',{packIds:unclaimed.map(p=>allianceId(p.id))},{gotWelfareTime:got,packs:unclaimed.map(p=>({id:allianceId(p.id),createTime:p.createTime}))},[],'GuildChestPop.ts:1441 claim-all, no cost','GotGuildWelfarePackRequest',{},'GotGuildWelfarePackResponse',{gotWelfareTimeAtLeast:Math.max(...unclaimed.map(p=>p.createTime))});}
  }
  if(enabled('tech')){
    if(parameters.techId===undefined)block('upgradeTech','TECH_EXACT_TARGET_REQUIRED');
    else if(!has('UpgradeGuildTechRequest')||!has('UpgradeGuildTechResponse'))block('upgradeTech','TECH_TYPED_PROTOCOL_UNAVAILABLE',{techId:parameters.techId,targetLevel:parameters.targetLevel});
    else if(tech.blockedReason)block('upgradeTech',tech.blockedReason,{techId:parameters.techId,targetLevel:parameters.targetLevel});
    else {const t=tech.target;add('tech','upgradeTech',{techId:t.techId,targetLevel:parameters.targetLevel},{worldId:f.worldId,season:f.season,stage:f.seasonStage,techId:t.techId,level:t.level,preTech:t.preTech,prerequisiteLevel:t.prerequisiteLevel},t.costs,t.costSource,'UpgradeGuildTechRequest',{techId:t.techId},'UpgradeGuildTechResponse',{techId:t.techId,level:parameters.targetLevel});}
  }
  if(enabled('fort'))block('donateFort',fort?'FORT_EXPLICIT_SINGLE_DONATION_REQUIRED':'FORT_IS_INDEPENDENT_CONSTRUCTION_REQUIRES_CITY_FORT_SURVEY');
  return {candidates,blocked,notes,fort,cities:f.cities??[],guildId:f.guildId,playerId:f.playerId,technologies:tech.technologies,techState:tech.state,members:f.members??[],requests:f.asks??[],ownRequests:own,dailyLimits:{ask:maxAsk===null||usedAsk===null?null:Math.max(0,maxAsk-usedAsk),help:helpRules.remaining,order:cap===null||done===null?null:cap===-1?'UNLIMITED':Math.max(0,cap-done)}};
}
export function planAlliance(f,options={}){
  const {selections=[],ledger=new ResourceLedger(f.stockReliable?f.stock:null)}=options;
  if(!Array.isArray(selections)||selections.some(id=>!text(id))||!unique(selections,x=>x))throw Error('联盟选择必须是唯一 actionId 数组');
  const view=allianceView(f,options),known=new Map(view.candidates.map(c=>[c.actionId,c]));if(selections.some(id=>!known.has(id)))throw Error('联盟候选已失效或无证据');
  if((options.parameters??f.parameters)?.itemId!==undefined){const planned=planAllianceFort(f.fortFacts,{...options,parameters:options.parameters??f.parameters,ledger,selections});return {...planned,view};}
  const chosen=selections.map(id=>known.get(id));if(chosen.filter(a=>a.actionType==='finishOrder').length>1)throw Error('每次仅允许一个联盟订单');
  if(chosen.some(a=>a.actionType==='upgradeTech')&&chosen.length!==1)throw Error('联盟科技每批仅允许单次一级升级并独立复读');
  if(chosen.some(a=>a.actionType==='claimAid')&&chosen.some(a=>a.actionType==='cancel'))throw Error('领取与取消必须分别回读');
  const cfg=validateAllianceConfig(options.moduleConfig),actions=[],notes=[...view.notes],local={...f,helpUsage:f.helpUsage?{...f.helpUsage,spentByItem:new Map(f.helpUsage.spentByItem)}:null,helpAllowance:f.helpAllowance?{...f.helpAllowance}:null};
  const ordered=chosen.slice().sort((a,b)=>view.candidates.indexOf(a)-view.candidates.indexOf(b));
  for(const a of ordered){if(actions.length>=cfg.maxActionsPerPlan){notes.push(a.actionId+': 每批上限');continue;}
    if(a.actionType==='help'){const d=allianceHelpRules(local,{moduleConfig:cfg,parameters:options.parameters??f.parameters,ledger}).decisions.find(d=>d.request.reqId===a.target.reqId);if(!d||d.blockedReason){notes.push(a.actionId+': '+(d?.blockedReason??'HELP_UNKNOWN'));continue;}}
    if(!ledger.reserve(a.costs)){notes.push(a.actionId+': 共享预算不足');continue;}actions.push(a);
    if(a.actionType==='help'){local.helpUsage.total++;local.helpUsage.spentByItem.set(a.target.itemId,(local.helpUsage.spentByItem.get(a.target.itemId)??0)+1);local.helpAllowance.remaining--;}
  }
  return {module:'alliance',actions,notes,view};
}
const increase=(b,a,id,n)=>b.stockReliable&&a.stockReliable&&quantity(b.stock.get(id)??0)!==null&&quantity(a.stock.get(id)??0)!==null&&(a.stock.get(id)??0)-(b.stock.get(id)??0)>=n;
const consume=(b,a,costs)=>b.stockReliable&&a.stockReliable&&costs.every(({id,num})=>quantity(b.stock.get(id)??0)!==null&&quantity(a.stock.get(id)??0)!==null&&(b.stock.get(id)??0)-(a.stock.get(id)??0)>=num);
export function verifyAlliance(op,b,a,response){
  if(op.actionType==='donateFort')return verifyAllianceFort(op,b.fortFacts,a.fortFacts,response);
  if(!b.guildId||b.guildId!==a.guildId||b.playerId!==a.playerId)return false;const t=op.target,time=gameTimeBounds(a),beforeTime=gameTimeBounds(b);
  if(op.actionType==='upgradeTech'){
    const old=b.tech?.find(x=>x.techId===t.techId),next=a.tech?.find(x=>x.techId===t.techId),reply=response?.tech;
    const level=old?.level??0;
    return b.techReliable===true&&a.techReliable===true&&b.worldId===a.worldId&&b.season===a.season&&b.seasonStage===a.seasonStage&&Number.isSafeInteger(b.worldId)&&b.worldId>0&&techInteger(level)&&t.targetLevel===level+1&&next?.level===t.targetLevel&&field(reply,'techId')===t.techId&&quantity(field(reply,'level'))===t.targetLevel&&consume(b,a,op.costs)&&op.costs.every(({id,num})=>(b.stock.get(id)??0)-(a.stock.get(id)??0)===num);
  }
  if(op.actionType==='help'){const old=b.asks?.find(x=>x.reqId===t.reqId&&x.askerId===t.playerId&&x.itemId===t.itemId);return !!old&&b.asksReliable&&a.asksReliable&&time.latest!==null&&time.latest<old.endTime&&!a.asks.some(x=>x.reqId===t.reqId)&&consume(b,a,op.costs);}
  if(op.actionType==='cancel'){const old=b.ownAids?.find(x=>x.reqId===t.reqId&&!x.helperId);return !!old&&b.ownReliable&&a.ownReliable&&time.latest!==null&&time.latest<old.endTime&&!a.ownAids.some(x=>x.reqId===t.reqId);}
  if(op.actionType==='claimAid'){const claimed=b.ownAids?.filter(x=>t.reqIds.includes(x.reqId)&&x.helperId)??[],rewards=new Map();for(const x of claimed)rewards.set(x.itemId,(rewards.get(x.itemId)??0)+1);return b.ownReliable&&a.ownReliable&&claimed.length===t.reqIds.length&&t.reqIds.every(id=>!a.ownAids.some(x=>x.reqId===id))&&[...rewards].every(([id,num])=>increase(b,a,id,num));}
  if(op.actionType==='finishOrder'){const n=counter(b,'DAILY_FINISH_GUILD_ORDER'),m=counter(a,'DAILY_FINISH_GUILD_ORDER');return beforeTime.latest!==null&&time.latest!==null&&allianceBudgetDay(beforeTime.earliest)===allianceBudgetDay(time.latest)&&b.order?.nextRefreshTime>time.latest&&n!==null&&m===n+1&&quantity(b.order?.nextRefreshTime)!==null&&a.order?.nextRefreshTime===b.order.nextRefreshTime&&consume(b,a,op.costs);}
  if(op.actionType==='claimWelfare'){const n=quantity(b.guild?.gotWelfareTime),m=quantity(a.guild?.gotWelfareTime),assets=response?.reward?.asset;return n!==null&&m!==null&&m>n&&m>=op.expectedState.gotWelfareTimeAtLeast&&assetsValid(assets)&&resourceCosts(assets).length>0&&resourceCosts(assets).every(({id,num})=>increase(b,a,id,num));}
  return false;
}
export const allianceModule=Object.freeze({id:'alliance', validateParameters: parametersOf,defaultConfig:ALLIANCE_DEFAULT_CONFIG,validateConfig:validateAllianceConfig,survey:surveyAlliance,view:allianceView,plan:planAlliance,verify:verifyAlliance});
