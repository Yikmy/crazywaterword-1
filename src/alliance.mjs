// Alliance adapter only; the shared service owns authorization and transport.
// Evidence: cached GuildHelpRequest/Pop:1455-1459, GuildCityArmyPop:1445,
// GuildChestPop:1441, GuildUtil:1533, static protocol and configuration.
import { ResourceLedger, resourceCosts, safeResourceQuantity as quantity, stockFromResponses } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
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

export const ALLIANCE_DEFAULT_CONFIG=Object.freeze({enabled:false,help:false,cancel:false,claimAid:false,ask:false,orders:false,welfare:false,fort:false,memberIds:[],itemIds:[],priorityMemberIds:[],priorityItemIds:[],stockItemIds:[],stockReserveQuantities:[],dailyBudgetItemIds:[],dailyBudgetQuantities:[],maxDailyHelps:0,maxActionsPerPlan:1});
export function validateAllianceConfig(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(ALLIANCE_DEFAULT_CONFIG,k)))throw Error('联盟配置包含未知字段');
  const c=copy({...ALLIANCE_DEFAULT_CONFIG,...input});
  for(const k of ['enabled','help','cancel','claimAid','ask','orders','welfare','fort'])if(typeof c[k]!=='boolean')throw Error('联盟开关必须为布尔值');
  for(const k of ['memberIds','priorityMemberIds'])if(!Array.isArray(c[k])||c[k].length>100||c[k].some(id=>typeof id!=='string'||allianceId(id)!==id)||!unique(c[k],id=>id))throw Error('联盟配置成员ID无效');
  for(const k of ['itemIds','priorityItemIds','stockItemIds','dailyBudgetItemIds'])if(!Array.isArray(c[k])||c[k].length>100||c[k].some(id=>!text(id)||id.length>200)||!unique(c[k],id=>id))throw Error('联盟配置物品ID无效');
  for(const [ids,nums] of [['stockItemIds','stockReserveQuantities'],['dailyBudgetItemIds','dailyBudgetQuantities']])if(!Array.isArray(c[nums])||c[nums].length!==c[ids].length||c[nums].some(n=>quantity(n)===null||typeof n!=='number'||n>1e9))throw Error('联盟库存线或日预算无效');
  if(!Number.isSafeInteger(c.maxDailyHelps)||c.maxDailyHelps<0||c.maxDailyHelps>1e6||!Number.isSafeInteger(c.maxActionsPerPlan)||c.maxActionsPerPlan<1||c.maxActionsPerPlan>100)throw Error('联盟数量上限无效');
  return c;
}
export const allianceBudgetDay=now=>quantity(now)===null?null:new Date((now+28800)*1000).toISOString().slice(0,10);
// Server limits and local daily spend must come from trusted survey/history facts,
// never from business parameters or user-editable configuration.
export function allianceHelpRules(f,{moduleConfig={},parameters=f.parameters??{},ledger=null}={}){
  const c=validateAllianceConfig(moduleConfig),p=parametersOf(parameters),decisions=[];
  const allowance=f.helpAllowance,usage=f.helpUsage,day=allianceBudgetDay(f.now);
  const knownLimit=allowance?.reliable===true&&text(allowance.source)&&quantity(allowance.remaining)!==null&&quantity(allowance.cooldownUntil)!==null;
  const knownUsage=usage?.reliable===true&&text(usage.source)&&usage.dayKey===day&&quantity(usage.total)!==null&&usage.spentByItem instanceof Map&&[...usage.spentByItem].every(([id,num])=>text(id)&&quantity(num)!==null);
  const rank=(list,id)=>{const i=list.indexOf(id);return i<0?list.length:i;};
  const sorted=[...(f.asks??[])].sort((a,b)=>rank(c.priorityMemberIds,a.askerId)-rank(c.priorityMemberIds,b.askerId)||rank(c.priorityItemIds,a.itemId)-rank(c.priorityItemIds,b.itemId)||a.endTime-b.endTime||String(a.reqId).localeCompare(String(b.reqId)));
  const budget=new Map(c.dailyBudgetItemIds.map((id,i)=>[id,c.dailyBudgetQuantities[i]])),reserve=new Map(c.stockItemIds.map((id,i)=>[id,c.stockReserveQuantities[i]]));
  let remaining=knownLimit&&knownUsage?Math.min(allowance.remaining,Math.max(0,c.maxDailyHelps-usage.total)):null;
  for(const a of sorted){let blockedReason=null;
    if(!c.enabled||!c.help)blockedReason='MODULE_DISABLED';
    else if(!knownLimit)blockedReason='HELP_DAILY_LIMIT_OR_COOLDOWN_UNKNOWN';
    else if(!knownUsage)blockedReason='HELP_DAILY_BUDGET_USAGE_UNKNOWN';
    else if(allowance.cooldownUntil>f.now)blockedReason='HELP_COOLDOWN_ACTIVE';
    else if(remaining<=0)blockedReason='HELP_DAILY_LIMIT_EXHAUSTED';
    else if(!f.asksReliable||!f.membersReliable||!f.stockReliable||quantity(f.now)===null)blockedReason='HELP_FACTS_UNKNOWN';
    else if(a.endTime<=f.now||a.askerId===f.playerId||!f.members.some(m=>m.playerId===a.askerId))blockedReason='HELP_TARGET_UNAVAILABLE';
    else if((c.memberIds.length&&!c.memberIds.includes(a.askerId))||(c.itemIds.length&&!c.itemIds.includes(a.itemId))||(p.memberIds&&!p.memberIds.includes(a.askerId))||(p.itemIds&&!p.itemIds.includes(a.itemId))||(p.reqIds&&!p.reqIds.includes(a.reqId)))blockedReason='HELP_TARGET_FILTERED';
    else if(!budget.has(a.itemId))blockedReason='HELP_ITEM_DAILY_BUDGET_NOT_CONFIGURED';
    else if((usage.spentByItem.get(a.itemId)??0)>=budget.get(a.itemId))blockedReason='HELP_ITEM_DAILY_BUDGET_EXHAUSTED';
    else {const have=ledger?ledger.available(a.itemId):f.stock.get(a.itemId)??0;if(quantity(have)===null||have-1<(reserve.get(a.itemId)??0))blockedReason='HELP_SAFETY_STOCK';}
    decisions.push({request:a,blockedReason,priority:decisions.length});
  }
  return {decisions,remaining,dayKey:day,config:c};
}

function parametersOf(p={}) {
  if (!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).some(k=>!['memberIds','itemIds','reqIds','cityId','season'].includes(k))) throw Error('联盟参数不在业务白名单');
  const out={};
  for(const k of ['memberIds','reqIds'])if(p[k]!==undefined){
    if(!Array.isArray(p[k]) || p[k].some(id=>!allianceId(id)) || !unique(p[k],allianceId))throw Error('联盟身份无效或重复'); out[k]=p[k].map(allianceId);
  }
  if(p.itemIds!==undefined){if(!Array.isArray(p.itemIds)||p.itemIds.some(id=>!text(id))||!unique(p.itemIds,x=>x))throw Error('联盟物品无效');out.itemIds=[...p.itemIds];}
  for(const k of ['cityId','season'])if(p[k]!==undefined){if(!Number.isSafeInteger(p[k])||p[k]<=0)throw Error('联盟城市或赛季无效');out[k]=p[k];}
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
export async function surveyAlliance(client,protocol,{player=null,signal,parameters={},moduleConfig={},timeout=8000}={}){
  parameters=parametersOf(parameters);validateAllianceConfig(moduleConfig);const notes=[],available=Object.keys(protocol??{});
  const get=async(name,body={})=>{assertExecutionActive(client,{signal});const response=name.replace(/Request$/,'Response');
    if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': 协议不可用');return null;}
    try{return await awaitExecution(client.request(name,body,response,timeout),client,{signal});}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': UNKNOWN');return null;}};
  const [info,membersRes,aidRes,ownRes,orderRes,citiesRes,countersRes,items,resources]=await Promise.all([
    get('GuildInfoRequest'),get('GuildMemberRequest'),get('GuildAidListRequest',{type:0}),get('MyGuildAidRequest',{type:0}),get('GuildOrderRequest'),get('GuildCityInfoRequest'),get('CounterInfoRequest'),get('AllItemRequest'),get('AllResourceRequest')]);
  const asks=Array.isArray(aidRes?.askItems)?aidRes.askItems.map(a=>aidRow(a,true)):null,ownAids=Array.isArray(ownRes?.aids)?ownRes.aids.map(a=>aidRow(a)):null;
  const groups=membersRes?.titleList,members=Array.isArray(groups)&&groups.every(g=>Array.isArray(g?.members))?groups.flatMap(g=>g.members.map(m=>({playerId:allianceId(m?.playerId),nickname:m?.nickname,online:m?.online,title:g.guildTitle}))):null;
  const itemsValid=Array.isArray(items?.items)&&items.items.every(a=>text(a?.itemId??a?.id)&&quantity(field(a,'num')??field(a,'count'))!==null)&&unique(items.items,a=>a.itemId??a.id),resourcesValid=Array.isArray(resources?.list)&&resources.list.every(a=>quantity(a?.res)!==null&&quantity(field(a,'amount'))!==null)&&unique(resources.list,a=>a.res);
  const stock=stockFromResponses(itemsValid?items:null,resourcesValid?resources:null),stockReliable=itemsValid&&resourcesValid&&[...stock.values()].every(n=>n!==null);
  return {module:'alliance',available,now:Number.isFinite(client.serverClockOffsetMs)?Math.floor((Date.now()+client.serverClockOffsetMs)/1000):null,
    playerId:allianceId(player?.id??player?.playerId),playerLevel:quantity(player?.level),season:null,helpAllowance:null,helpUsage:null,guildId:allianceId(info?.guild?.guildId),guild:info?.guild?{guildId:field(info.guild,'guildId'),welfarePack:info.guild.welfarePack,gotWelfareTime:quantity(field(info.guild,'gotWelfareTime'))}:null,members,
    membersReliable:!!members&&members.every(m=>!!m.playerId)&&unique(members,m=>m.playerId),asks,asksReliable:!!asks&&asks.every(a=>aidValid(a,true))&&unique(asks,a=>a.reqId),ownAids,ownReliable:!!ownAids&&ownAids.every(a=>aidValid(a))&&unique(ownAids,a=>a.reqId),order:orderRes?.order?{requirements:Array.isArray(orderRes.order.requirements)?orderRes.order.requirements.map(r=>({id:field(r,'id'),num:quantity(field(r,'num'))})):null,nextRefreshTime:quantity(field(orderRes.order,'nextRefreshTime'))}:null,cities:Array.isArray(citiesRes?.cities)?citiesRes.cities.map(c=>({cityId:field(c,'cityId'),recommended:field(c,'recommended')})):null,counters:Array.isArray(countersRes?.counters)?countersRes.counters.map(c=>({type:field(c,'type'),num:quantity(field(c,'num'))})):null,stock,stockReliable,parameters,notes};
}
export function allianceView(f,{config=null,parameters=f.parameters??{},moduleConfig={}}={}){
  parameters=parametersOf(parameters);moduleConfig=validateAllianceConfig(moduleConfig);const candidates=[],blocked=[],notes=[...(f.notes??[])];
  const block=(actionType,blockedReason,target={})=>blocked.push({actionType,target,blockedReason});
  const enabled=d=>moduleConfig.enabled===true&&(moduleConfig[d]===true||moduleConfig[d]?.enabled===true),has=n=>f.available?.includes(n),chosen=(k,v)=>parameters[k]===undefined||parameters[k].includes(v),ledger=new ResourceLedger(f.stockReliable?f.stock:null);
  const add=(domain,type,target,beforeState,costs,costSource,request,body,response,expectedState)=>{
    if(!enabled(domain))return;if(!has(request))return block(type,'PROTOCOL_UNAVAILABLE',target);
    if(costs.length&&(!f.stockReliable||!ledger.canReserve(costs)))return block(type,'RESOURCE_UNKNOWN_OR_INSUFFICIENT',target);
    candidates.push({actionId:'alliance:'+type+':'+encodeURIComponent(stable(target)),actionType:type,target,costs,costSource,beforeState:copy(beforeState),identity:stable({guildId:f.guildId,playerId:f.playerId,beforeState}),expectedState,parameters:copy(parameters),action:{request,response:has(response)?response:null,body},label:'联盟 '+type});};
  if(!f.guildId||!f.playerId)return {candidates,blocked:[{blockedReason:'ALLIANCE_IDENTITY_UNKNOWN'}],notes,members:f.members??[],dailyLimits:{ask:null,help:null}};
  const own=f.ownReliable?f.ownAids:[],nowKnown=quantity(f.now)!==null;
  const helpRules=allianceHelpRules(f,{moduleConfig,parameters});
  if(f.asksReliable&&f.membersReliable&&nowKnown)for(const decision of helpRules.decisions){const a=decision.request;if(decision.blockedReason){if(enabled('help'))block('help',decision.blockedReason,{reqId:a.reqId});continue;}
    if(a.endTime<=f.now||a.askerId===f.playerId||!chosen('memberIds',a.askerId)||!chosen('reqIds',a.reqId)||!chosen('itemIds',a.itemId))continue;
    if(!f.members.some(m=>m.playerId===a.askerId)){block('help','REQUESTER_MEMBERSHIP_UNKNOWN',{reqId:a.reqId});continue;}
    add('help','help',{reqId:a.reqId,playerId:a.askerId,itemId:a.itemId},a,[{id:a.itemId,num:1}],'GuildHelpRequest.ts:1459 one item per reqId','GuildAidHelpRequest',{reqId:[a.reqId],type:0},null,{requestRemoved:true,stockConsumed:1});
  }else block('help','AID_LIST_MEMBERS_OR_SERVER_TIME_UNKNOWN');
  if(f.ownReliable&&nowKnown)for(const a of own)if(!a.helperId&&a.endTime>f.now&&chosen('reqIds',a.reqId)&&chosen('itemIds',a.itemId))add('cancel','cancel',{reqId:a.reqId,itemId:a.itemId},a,[],'GuildHelpItem.ts:1455 cancel own request','CancelMyGuildAidRequest',{reqId:a.reqId},null,{ownRequestRemoved:true});
  const helped=own.filter(a=>a.helperId);
  if(f.ownReliable&&helped.length&&f.stockReliable)add('claimAid','claimAid',{reqIds:helped.map(a=>a.reqId)},own,[],'GuildHelpItem.ts:1455 claim-all, no cost','GotMyGuildAidRequest',{},null,{receivedItems:helped.map(a=>a.itemId)});
  const limitRows=rows(config,'GuildParamCfg').filter(r=>r.paramName==='每日求助次数上限'),maxAsk=limitRows.length===1?quantity(limitRows[0].paramValue):null,usedAsk=counter(f,'DAILY_GUILD_AID');
  // No authoritative ask cooldown field exists in the inspected model.
  if(enabled('ask'))block('ask',maxAsk===null||usedAsk===null?'ASK_DAILY_LIMIT_UNKNOWN':'ASK_COOLDOWN_UNKNOWN');
  const cap=maxOrders(config,f.playerLevel,f.season),done=counter(f,'DAILY_FINISH_GUILD_ORDER'),order=f.order;
  if(enabled('orders')){
    if(cap===null||done===null)block('finishOrder','ORDER_DAILY_LIMIT_UNKNOWN');
    else if(cap!==-1&&done>=cap)block('finishOrder','ORDER_DAILY_LIMIT_EXHAUSTED');
    else if(!nowKnown||quantity(order?.nextRefreshTime)===null||order.nextRefreshTime<=f.now||!assetsValid(order?.requirements)||!order.requirements.length||order.requirements.some(a=>quantity(a.num)===0))block('finishOrder','ORDER_STATE_UNKNOWN_OR_EXPIRED');
    else if(!Array.isArray(f.cities)||f.cities.some(c=>!Number.isSafeInteger(c?.cityId)||c.cityId<=0)||!unique(f.cities,c=>c.cityId))block('finishOrder','ORDER_CITY_UNKNOWN');
    else for(const city of f.cities.filter(c=>parameters.cityId===undefined||c.cityId===parameters.cityId))add('orders','finishOrder',{cityId:city.cityId},{order,done},resourceCosts(order.requirements),'GuildOrderResponse.order.requirements; GuildCityArmyPop.ts:1445','FinishGuildOrderRequest',{cityId:city.cityId},'FinishGuildOrderResponse',{counterIncrement:1});
  }
  const packs=f.guild?.welfarePack,got=quantity(f.guild?.gotWelfareTime);
  if(enabled('welfare')){
    if(!f.stockReliable||!Array.isArray(packs)||packs.some(p=>!allianceId(p?.id)||quantity(p.createTime)===null)||!unique(packs,p=>allianceId(p.id))||got===null||!nowKnown)block('claimWelfare','WELFARE_STATE_UNKNOWN');
    else {const unclaimed=packs.filter(p=>p.createTime>got&&p.createTime+86400>f.now);if(unclaimed.length)add('welfare','claimWelfare',{packIds:unclaimed.map(p=>allianceId(p.id))},{gotWelfareTime:got,packs:unclaimed.map(p=>({id:allianceId(p.id),createTime:p.createTime}))},[],'GuildChestPop.ts:1441 claim-all, no cost','GotGuildWelfarePackRequest',{},'GotGuildWelfarePackResponse',{gotWelfareTimeAtLeast:Math.max(...unclaimed.map(p=>p.createTime))});}
  }
  if(enabled('fort'))block('donateFort','FORT_IS_INDEPENDENT_CONSTRUCTION_REQUIRES_CITY_FORT_SURVEY');
  return {candidates,blocked,notes,members:f.members??[],requests:f.asks??[],ownRequests:own,dailyLimits:{ask:maxAsk===null||usedAsk===null?null:Math.max(0,maxAsk-usedAsk),help:helpRules.remaining,order:cap===null||done===null?null:cap===-1?'UNLIMITED':Math.max(0,cap-done)}};
}
export function planAlliance(f,options={}){
  const {selections=[],ledger=new ResourceLedger(f.stockReliable?f.stock:null)}=options;
  if(!Array.isArray(selections)||selections.some(id=>!text(id))||!unique(selections,x=>x))throw Error('联盟选择必须是唯一 actionId 数组');
  const view=allianceView(f,options),known=new Map(view.candidates.map(c=>[c.actionId,c]));if(selections.some(id=>!known.has(id)))throw Error('联盟候选已失效或无证据');
  const chosen=selections.map(id=>known.get(id));if(chosen.filter(a=>a.actionType==='finishOrder').length>1)throw Error('每次仅允许一个联盟订单');
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
  if(!b.guildId||b.guildId!==a.guildId||b.playerId!==a.playerId)return false;const t=op.target;
  if(op.actionType==='help'){const old=b.asks?.find(x=>x.reqId===t.reqId&&x.askerId===t.playerId&&x.itemId===t.itemId);return !!old&&b.asksReliable&&a.asksReliable&&quantity(a.now)!==null&&a.now<old.endTime&&!a.asks.some(x=>x.reqId===t.reqId)&&consume(b,a,op.costs);}
  if(op.actionType==='cancel'){const old=b.ownAids?.find(x=>x.reqId===t.reqId&&!x.helperId);return !!old&&b.ownReliable&&a.ownReliable&&quantity(a.now)!==null&&a.now<old.endTime&&!a.ownAids.some(x=>x.reqId===t.reqId);}
  if(op.actionType==='claimAid'){const claimed=b.ownAids?.filter(x=>t.reqIds.includes(x.reqId)&&x.helperId)??[],rewards=new Map();for(const x of claimed)rewards.set(x.itemId,(rewards.get(x.itemId)??0)+1);return b.ownReliable&&a.ownReliable&&claimed.length===t.reqIds.length&&t.reqIds.every(id=>!a.ownAids.some(x=>x.reqId===id))&&[...rewards].every(([id,num])=>increase(b,a,id,num));}
  if(op.actionType==='finishOrder'){const n=counter(b,'DAILY_FINISH_GUILD_ORDER'),m=counter(a,'DAILY_FINISH_GUILD_ORDER');return n!==null&&m===n+1&&quantity(b.order?.nextRefreshTime)!==null&&a.order?.nextRefreshTime===b.order.nextRefreshTime&&consume(b,a,op.costs);}
  if(op.actionType==='claimWelfare'){const n=quantity(b.guild?.gotWelfareTime),m=quantity(a.guild?.gotWelfareTime),assets=response?.reward?.asset;return n!==null&&m!==null&&m>n&&m>=op.expectedState.gotWelfareTimeAtLeast&&assetsValid(assets)&&resourceCosts(assets).length>0&&resourceCosts(assets).every(({id,num})=>increase(b,a,id,num));}
  return false;
}
export const allianceModule=Object.freeze({id:'alliance',defaultConfig:ALLIANCE_DEFAULT_CONFIG,validateConfig:validateAllianceConfig,survey:surveyAlliance,view:allianceView,plan:planAlliance,verify:verifyAlliance});
