// Museum adapter; no separate executor or speculative free-acceleration path.
// Cached client: MuseumModel:2207, MuseumUtil:2225, BuildTeamPop:439,
// SpeedPop:2949, MusuemUpgradePop:2247, MuseumRecruitTaskItem:2219.
import { ResourceLedger, resourceCosts, safeResourceQuantity as quantity, stockFromResponses } from './resource-ledger.mjs';
import { assertExecutionActive, awaitExecution, executionOutcome } from './execution.mjs';
import { allianceId } from './alliance.mjs';
const rows=(c,n)=>c?.tables?.[n]?.data??[];
const text=s=>typeof s==='string'&&s.trim().length>0;
const unique=(a,key)=>Array.isArray(a)&&new Set(a.map(key)).size===a.length;
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const copy=v=>JSON.parse(JSON.stringify(v));
const field=(o,k)=>o&&Object.hasOwn(o,k)?o[k]:undefined;
const costsOf=v=>{try{return resourceCosts(v);}catch{return null;}};
const validAssets=v=>Array.isArray(v)&&v.every(a=>text(a?.id)&&quantity(a.num)!==null);
export const MUSEUM_SPEED_ITEM='博物馆加速';

export const MUSEUM_DEFAULT_CONFIG=Object.freeze({enabled:false,exploration:false,exhibition:false,collection:false,exhibit:false,keyword:false,caseUpgrade:false,caseFinish:false,caseSpeed:false,maxActionsPerPlan:1,maximumSpeedItems:100,minimumRevenue:1,stockItemIds:[],stockReserveQuantities:[]});
export function validateMuseumConfig(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(MUSEUM_DEFAULT_CONFIG,k)))throw Error('博物馆配置包含未知字段');
  const c=copy({...MUSEUM_DEFAULT_CONFIG,...input});
  for(const k of ['enabled','exploration','exhibition','collection','exhibit','keyword','caseUpgrade','caseFinish','caseSpeed'])if(typeof c[k]!=='boolean')throw Error('博物馆开关必须为布尔值');
  if(!Number.isSafeInteger(c.maxActionsPerPlan)||c.maxActionsPerPlan<1||c.maxActionsPerPlan>100||!Number.isSafeInteger(c.maximumSpeedItems)||c.maximumSpeedItems<0||c.maximumSpeedItems>10000||!Number.isSafeInteger(c.minimumRevenue)||c.minimumRevenue<1||c.minimumRevenue>1e9)throw Error('博物馆阈值无效');
  if(!Array.isArray(c.stockItemIds)||c.stockItemIds.length>100||c.stockItemIds.some(id=>!text(id))||!unique(c.stockItemIds,id=>id)||!Array.isArray(c.stockReserveQuantities)||c.stockReserveQuantities.length!==c.stockItemIds.length||c.stockReserveQuantities.some(n=>typeof n!=='number'||quantity(n)===null||n>1e9))throw Error('博物馆库存线无效');
  return c;
}
const casesValid=e=>Array.isArray(e?.cases)&&e.cases.every(c=>quantity(c?.caseIndex)!==null&&c.caseIndex>0&&quantity(c.level)!==null&&typeof c.unlocked==='boolean'&&typeof c.antiqueId==='string'&&quantity(c.upgradeFinishTime)!==null)&&unique(e.cases,c=>c.caseIndex);
const keywordsValid=e=>Array.isArray(e?.keywordLevels)&&e.keywordLevels.length===3&&e.keywordLevels.every(n=>quantity(n)!==null);

function parametersOf(p={}){
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['stageId','heroIds','factor','exhibitionId','useNum','payment','caseIndex','keywordType','antiqueId'].includes(k)))throw Error('博物馆参数不在业务白名单');
  const out={};for(const k of ['stageId','exhibitionId','useNum','factor','caseIndex','keywordType'])if(p[k]!==undefined){if(!Number.isSafeInteger(p[k])||p[k]<=0)throw Error('博物馆数值参数无效');out[k]=p[k];}
  if(p.heroIds!==undefined){if(!Array.isArray(p.heroIds)||p.heroIds.some(id=>!text(id))||!unique(p.heroIds,id=>id))throw Error('探险英雄必须是唯一ID数组');out.heroIds=[...p.heroIds];}
  if(p.payment!==undefined){if(!['ITEM','PREMIUM','FREE'].includes(p.payment))throw Error('博物馆支付参数无效');out.payment=p.payment;}
  if(out.keywordType!==undefined&&out.keywordType>3)throw Error('关键词类型必须为1至3');
  if(p.antiqueId!==undefined){if(typeof p.antiqueId!=='string'||p.antiqueId.length>200)throw Error('藏品ID无效');out.antiqueId=p.antiqueId;}
  return out;
}
function stageOf(s){const e=s?.expedition;return {stageId:quantity(field(s,'stageId')),progress:quantity(field(s,'progress')),expedition:e?{startTime:quantity(field(e,'startTime')),endTime:quantity(field(e,'endTime')),heroIds:Array.isArray(e.heroIds)?[...e.heroIds]:null,cost:Array.isArray(e.cost?.asset)?e.cost.asset.map(a=>({id:a?.id,num:quantity(field(a,'num'))})):null,conditionId:quantity(field(e,'conditionId')),factor:quantity(field(e,'factor'))}:null};}
const stageValid=s=>s.stageId!==null&&s.stageId>0&&s.progress!==null&&(!s.expedition||(s.expedition.startTime!==null&&s.expedition.endTime!==null&&Array.isArray(s.expedition.heroIds)&&s.expedition.heroIds.every(text)&&unique(s.expedition.heroIds,id=>id)&&s.expedition.conditionId!==null&&s.expedition.factor!==null));
export async function surveyMuseum(client,protocol,{player=null,signal,parameters={},moduleConfig={},timeout=8000}={}){
  parameters=parametersOf(parameters);validateMuseumConfig(moduleConfig);const notes=[],available=Object.keys(protocol??{});
  const get=async name=>{assertExecutionActive(client,{signal});const response=name.replace(/Request$/,'Response');if(!protocol?.[name]||!protocol?.[response]){notes.push(name+': 协议不可用');return null;}try{return await awaitExecution(client.request(name,{},response,timeout),client,{signal});}catch(e){if(executionOutcome(e)==='CANCELLED')throw e;notes.push(name+': UNKNOWN');return null;}};
  const [info,heroesRes,items,resources,antiquesRes]=await Promise.all([get('MuseumInfoRequest'),get('AllHeroRequest'),get('AllItemRequest'),get('AllResourceRequest'),get('AllAntiqueRequest')]);
  const stages=Array.isArray(info?.exploreStages)?info.exploreStages.map(stageOf):null;
  const heroes=Array.isArray(heroesRes?.heroes)?heroesRes.heroes.map(h=>h?.heroId):null;
  const itemsValid=Array.isArray(items?.items)&&items.items.every(a=>text(a?.itemId??a?.id)&&quantity(field(a,'num')??field(a,'count'))!==null)&&unique(items.items,a=>a.itemId??a.id),resourcesValid=Array.isArray(resources?.list)&&resources.list.every(a=>quantity(a?.res)!==null&&quantity(field(a,'amount'))!==null)&&unique(resources.list,a=>a.res);
  const stock=stockFromResponses(itemsValid?items:null,resourcesValid?resources:null),stockReliable=itemsValid&&resourcesValid&&[...stock.values()].every(n=>n!==null);
  const exhibitions=Array.isArray(info?.exhibitions)?info.exhibitions.map(e=>({exhibitionId:quantity(field(e,'exhibitionId')),level:quantity(field(e,'level')),keywordLevels:e?.keywordLevels,cases:Array.isArray(e?.cases)?e.cases.map(c=>({caseIndex:quantity(field(c,'caseIndex')),level:quantity(field(c,'level')),unlocked:field(c,'unlocked'),antiqueId:field(c,'antiqueId'),upgradeFinishTime:quantity(field(c,'upgradeFinishTime'))})):null})):null;
  const antiques=Array.isArray(antiquesRes?.antiques)?antiquesRes.antiques.map(a=>a?.id):null;
  const claimed=Array.isArray(info?.claimedAchievements)?info.claimedAchievements.map(quantity):null;
  return {module:'museum',available,playerId:allianceId(player?.id??player?.playerId),playerLevel:quantity(player?.level),now:Number.isFinite(client.serverClockOffsetMs)?Math.floor((Date.now()+client.serverClockOffsetMs)/1000):null,
    antiques,antiquesReliable:!!antiques&&antiques.every(text)&&unique(antiques,id=>id),stages,stagesReliable:!!stages&&stages.every(stageValid)&&unique(stages,s=>s.stageId),heroes,heroesReliable:!!heroes&&heroes.every(text)&&unique(heroes,id=>id),exhibitions,
    exhibitionsReliable:!!exhibitions&&exhibitions.every(e=>e.exhibitionId!==null&&e.exhibitionId>0&&e.level!==null)&&unique(exhibitions,e=>e.exhibitionId),
    uncollectedRevenue:quantity(field(info,'uncollectedRevenue')),topPopularity:quantity(field(info,'topPopularity')),claimedAchievements:claimed,claimedReliable:!!claimed&&claimed.every(n=>n!==null)&&unique(claimed,n=>n),stock,stockReliable,parameters,notes};
}
const stateOf=(s,now)=>!stageValid(s)||quantity(now)===null?'UNKNOWN':!s.expedition||s.expedition.endTime===0?'IDLE':s.expedition.endTime>now?'EXPLORING':'COMPLETE_UNSETTLED';
function unlocked(f,c,s){const cfg=rows(c,'MuseumExpeditionStageCfg').filter(r=>r.stageId===s.stageId);if(cfg.length!==1||!Array.isArray(cfg[0].areaLevelReq))return null;const req=cfg[0].areaLevelReq;if(req.length===0)return true;if(req.length!==2||!f.exhibitionsReliable||quantity(req[0])===null||quantity(req[1])===null)return null;return f.exhibitions.some(e=>e.exhibitionId===req[0]&&e.level>=req[1]);}
export function museumView(f,{config=null,parameters=f.parameters??{},moduleConfig={}}={}){
  parameters=parametersOf(parameters);moduleConfig=validateMuseumConfig(moduleConfig);const candidates=[],blocked=[],notes=[...(f.notes??[])];
  const block=(actionType,blockedReason,target={})=>blocked.push({actionType,target,blockedReason}),enabled=d=>moduleConfig.enabled===true&&(moduleConfig[d]===true||moduleConfig[d]?.enabled===true),has=n=>f.available?.includes(n),ledger=new ResourceLedger(f.stockReliable?f.stock:null);
  const add=(domain,type,target,beforeState,costs,costSource,request,body,response,expectedState)=>{if(!enabled(domain))return;if(!has(request))return block(type,'PROTOCOL_UNAVAILABLE',target);if(costs===null)return block(type,'COST_UNKNOWN',target);if(costs.length&&(!f.stockReliable||!ledger.canReserve(costs)||costs.some(({id,num})=>{const i=moduleConfig.stockItemIds.indexOf(id);return i>=0&&ledger.available(id)-num<moduleConfig.stockReserveQuantities[i];})))return block(type,'RESOURCE_UNKNOWN_OR_INSUFFICIENT',target);candidates.push({actionId:'museum:'+type+':'+encodeURIComponent(stable(target)),actionType:type,target,beforeState:copy(beforeState),identity:stable({playerId:f.playerId,beforeState}),costs,costSource,expectedState,parameters:copy(parameters),action:{request,response:has(response)?response:null,body},label:'博物馆 '+type});};
  if(!f.playerId)return {candidates,blocked:[{blockedReason:'PLAYER_IDENTITY_UNKNOWN'}],notes,stages:[]};
  if(parameters.payment==='PREMIUM')block('speedExplore','PREMIUM_BLOCKED');
  const busy=f.stagesReliable?f.stages.filter(s=>s.expedition?.endTime>0):null,busyHeroes=new Set(busy?.flatMap(s=>s.expedition.heroIds)??[]);
  const teamCfg=rows(config,'MuseumExpeditionTeamCfg'),teamKnown=teamCfg.length>0&&teamCfg.every(r=>quantity(r.teamCount)!==null&&quantity(r.playerLevel)!==null)&&quantity(f.playerLevel)!==null;
  const teamCount=teamKnown?Math.max(0,...teamCfg.filter(r=>r.playerLevel<=f.playerLevel).map(r=>r.teamCount)):null;
  const display=(f.stages??[]).map(s=>({...s,status:f.stagesReliable?stateOf(s,f.now):'UNKNOWN',unlocked:unlocked(f,config,s)}));
  if(enabled('exploration')){
    if(!f.stagesReliable)block('startExplore','EXPEDITION_STATE_UNKNOWN');
    else for(const s of f.stages.filter(s=>parameters.stageId===undefined||s.stageId===parameters.stageId)){
      const target={stageId:s.stageId},status=stateOf(s,f.now),open=unlocked(f,config,s);
      if(status==='UNKNOWN'){block('startExplore','SERVER_TIME_UNKNOWN',target);continue;}
      if(status==='COMPLETE_UNSETTLED'){
        block('completeExplore','SETTLEMENT_PENDING_STATE_NOT_OBSERVABLE',target);block('claimExplore','REQUIRES_VERIFIED_COMPLETE_RESULT_AND_PENDING_IDENTITY',target);continue;
      }
      if(status==='EXPLORING'){
        if(parameters.payment==='PREMIUM')continue;
        if(parameters.payment==='FREE'){block('speedExplore','FREE_SPEED_UP_NOT_PROVEN',target);continue;}
        if(parameters.useNum===undefined)continue;
        if(parameters.useNum>moduleConfig.maximumSpeedItems){block('speedExplore','CONFIGURED_SPEED_BUDGET_EXCEEDED',target);continue;}
        if(parameters.useNum>Math.ceil((s.expedition.endTime-f.now)/1800)){block('speedExplore','SPEED_QUANTITY_EXCEEDS_REMAINING_TIME',target);continue;}
        add('exploration','speedExplore',target,s,[{id:MUSEUM_SPEED_ITEM,num:parameters.useNum}],'SpeedPop.ts:2949, GameConstants.ts:1383; 1800 seconds per item','MuseumSpeedUpExploreRequest',{stageId:s.stageId,useNum:parameters.useNum},'MuseumSpeedUpExploreResponse',{endTimeReducedBy:parameters.useNum*1800});continue;
      }
      if(open!==true){block('startExplore',open===false?'STAGE_LOCKED':'STAGE_UNLOCK_UNKNOWN',target);continue;}
      if(teamCount===null||busy===null){block('startExplore','TEAM_CAPACITY_UNKNOWN',target);continue;}if(busy.length>=teamCount){block('startExplore','TEAM_CAPACITY_EXHAUSTED',target);continue;}
      const conditionRows=rows(config,'MuseumExpeditionConditionCfg').filter(r=>r.conditionId===s.expedition?.conditionId),condition=conditionRows.length===1?conditionRows[0]:null;
      if(!condition||quantity(condition.heroCount)===null||condition.heroCount<=0){block('startExplore','HERO_COUNT_UNKNOWN',target);continue;}
      const heroIds=parameters.heroIds;
      if(!heroIds||heroIds.length!==condition.heroCount||!f.heroesReliable||heroIds.some(id=>!f.heroes.includes(id)||busyHeroes.has(id))){block('startExplore','HERO_SELECTION_MISSING_UNKNOWN_OR_BUSY',target);continue;}
      const factor=parameters.factor??1,factorRows=rows(config,'MuseumExploreTimeFactorCfg').filter(r=>r.factor===factor);
      if(factorRows.length!==1||quantity(factorRows[0].playerLevel)===null||f.playerLevel<factorRows[0].playerLevel){block('startExplore','TIME_FACTOR_LOCKED_OR_UNKNOWN',target);continue;}
      const base=s.expedition?.cost;
      if(!validAssets(base)||!base.length){block('startExplore','AUTHORITATIVE_EXPEDITION_COST_UNKNOWN',target);continue;}
      const costs=costsOf(base.map(a=>({id:a.id,num:Number.isSafeInteger(a.num*factor)?a.num*factor:null})));
      add('exploration','startExplore',{stageId:s.stageId,heroIds:[...heroIds],factor},{stage:s,busyStageIds:busy.map(x=>x.stageId),teamCount},costs,'MuseumInfoResponse.exploreStages.expedition.cost.asset × MuseumExploreTimeFactorCfg.factor; BuildTeamPop.ts:439','MuseumStartExploreRequest',{stageId:s.stageId,heroIds:[...heroIds],factor},'MuseumStartExploreResponse',{activeExpedition:true,heroIds:[...heroIds],factor});
    }
  }
  if(enabled('collection')){
    if(f.uncollectedRevenue===null)block('collectRevenue','REVENUE_UNKNOWN');
    else if(f.uncollectedRevenue>=moduleConfig.minimumRevenue&&f.stockReliable)add('collection','collectRevenue',{}, {uncollectedRevenue:f.uncollectedRevenue},[],'MuseumModel.ts:2207 claim has no cost','MuseumCollectRevenueRequest',{},'MuseumCollectRevenueResponse',{uncollectedRevenue:0,currencyIncreased:'人气币'});
    if(!f.stockReliable||!f.claimedReliable||f.topPopularity===null)block('claimAchievement','ACHIEVEMENT_STATE_UNKNOWN');
    else for(const row of rows(config,'MuseumAchievementCfg'))if(quantity(row.score)!==null&&f.topPopularity>=row.score&&!f.claimedAchievements.includes(row.score)){
      const rewards=costsOf(row.rewards);if(!rewards||!rewards.length){block('claimAchievement','ACHIEVEMENT_REWARD_UNKNOWN',{popularityThreshold:row.score});continue;}
      add('collection','claimAchievement',{popularityThreshold:row.score},{claimedAchievements:f.claimedAchievements,topPopularity:f.topPopularity},[],'MuseumRecruitTaskItem.ts:2219 claim has no cost','MuseumClaimAchievementRequest',{popularityThreshold:row.score},null,{claimed:true,rewards});
    }
  }
  if(enabled('exhibition')){
    if(!f.exhibitionsReliable)block('upgradeExhibition','EXHIBITION_STATE_UNKNOWN');
    else for(const e of f.exhibitions.filter(e=>parameters.exhibitionId===undefined||e.exhibitionId===parameters.exhibitionId)){
      const next=rows(config,'MuseumAreaCfg').filter(r=>r.areaId===e.exhibitionId&&r.level===e.level+1);if(next.length===0)continue;
      if(next.length!==1||quantity(next[0].playerLevelReq)===null||quantity(f.playerLevel)===null){block('upgradeExhibition','EXHIBITION_CONFIG_UNKNOWN',{exhibitionId:e.exhibitionId});continue;}
      if(f.playerLevel<next[0].playerLevelReq){block('upgradeExhibition','PLAYER_LEVEL_TOO_LOW',{exhibitionId:e.exhibitionId});continue;}
      const indicators=rows(config,'MuseumAreaIndicatorCfg').filter(r=>r.areaId===e.exhibitionId&&r.areaLevel===e.level);
      if(!Array.isArray(e.keywordLevels)||e.keywordLevels.length!==3||e.keywordLevels.some(n=>quantity(n)===null)||!indicators.length||indicators.some(r=>quantity(r.level)===null)){block('upgradeExhibition','EXHIBITION_KEYWORD_PREREQUISITES_UNKNOWN',{exhibitionId:e.exhibitionId});continue;}
      if(e.keywordLevels.reduce((sum,n)=>sum+n,0)<3*Math.max(...indicators.map(r=>r.level))){block('upgradeExhibition','EXHIBITION_KEYWORD_PREREQUISITES_NOT_MET',{exhibitionId:e.exhibitionId});continue;}
      add('exhibition','upgradeExhibition',{exhibitionId:e.exhibitionId},e,costsOf(next[0].costArr),'MuseumAreaCfg.costArr; MusuemUpgradePop.ts:2247','MuseumUpgradeExhibitionRequest',{exhibitionId:e.exhibitionId},null,{level:e.level+1});
    }
  }

  if(enabled('exhibition')&&f.exhibitionsReliable)for(const e of f.exhibitions.filter(e=>parameters.exhibitionId===undefined||e.exhibitionId===parameters.exhibitionId)){
    if(moduleConfig.keyword){
      if(!keywordsValid(e))block('upgradeKeyword','KEYWORD_STATE_UNKNOWN',{exhibitionId:e.exhibitionId});
      else for(let index=0;index<3;index++)if(parameters.keywordType===undefined||parameters.keywordType===index+1){
        const target={exhibitionId:e.exhibitionId,keywordType:index+1},level=e.keywordLevels[index],areaRows=rows(config,'MuseumAreaIndicatorCfg').filter(r=>r.areaId===e.exhibitionId&&r.areaLevel===e.level),next=rows(config,'MuseumAreaIndicatorCfg').filter(r=>r.areaId===e.exhibitionId&&r.level===level+1);
        if(!areaRows.length||areaRows.some(r=>quantity(r.level)===null)||next.length!==1){block('upgradeKeyword','KEYWORD_CONFIG_UNKNOWN',target);continue;}
        if(level>=Math.max(...areaRows.map(r=>r.level)))continue;
        const costs=Array.isArray(next[0].upgradeCost)&&next[0].upgradeCost.length===2?costsOf([next[0].upgradeCost]):null;
        add('exhibition','upgradeKeyword',target,{exhibitionId:e.exhibitionId,level:e.level,keywordLevels:e.keywordLevels},costs,'MuseumAreaIndicatorCfg.upgradeCost; MusuemLevelUpPop.ts:2243','MuseumUpgradeKeywordRequest',target,null,{keywordLevel:level+1});
      }
    }
    if((moduleConfig.caseUpgrade||moduleConfig.caseFinish||moduleConfig.caseSpeed||moduleConfig.exhibit)&&!casesValid(e)){block('caseOperations','CASE_STATE_UNKNOWN',{exhibitionId:e.exhibitionId});continue;}
    if(!(moduleConfig.caseUpgrade||moduleConfig.caseFinish||moduleConfig.caseSpeed||moduleConfig.exhibit))continue;
    for(const c of e.cases??[]){
      if(parameters.caseIndex!==undefined&&parameters.caseIndex!==c.caseIndex)continue;
      const target={exhibitionId:e.exhibitionId,caseIndex:c.caseIndex};
      if(moduleConfig.caseFinish&&c.upgradeFinishTime>0){
        if(quantity(f.now)===null)block('finishCase','SERVER_TIME_UNKNOWN',target);
        else if(c.upgradeFinishTime<=f.now)add('exhibition','finishCase',target,c,[],'MuseumModel.ts:2207 expired MuseumFinishCaseUpgradeRequest has no cost','MuseumFinishCaseUpgradeRequest',target,null,{level:c.level+1,upgradeFinishTime:0});
      }

      if(moduleConfig.caseSpeed&&c.upgradeFinishTime>0){
        if(parameters.payment==='PREMIUM')block('speedCase','PREMIUM_BLOCKED',target);
        else if(parameters.payment==='FREE')block('speedCase','ADVERTISING_SPEED_NOT_AUTHORIZED',target);
        else if(quantity(f.now)===null)block('speedCase','SERVER_TIME_UNKNOWN',target);
        else if(c.upgradeFinishTime>f.now&&parameters.useNum!==undefined){
          if(parameters.useNum>moduleConfig.maximumSpeedItems||parameters.useNum>Math.ceil((c.upgradeFinishTime-f.now)/60))block('speedCase','SPEED_QUANTITY_EXCEEDS_REMAINING_TIME_OR_CONFIG',target);
          else add('exhibition','speedCase',target,c,[{id:'加速器',num:parameters.useNum}],'MuseumModel.ts:2207 / MuseumBoothView.ts:2187; SpeedUpPop.ts:2953 ITEM=2, each item 60 seconds','MuseumSpeedUpCaseRequest',{...target,speedUp:{type:2,useNum:parameters.useNum}},null,{upgradeFinishTimeReduced:true});
        }
      }

      if(moduleConfig.caseUpgrade&&c.upgradeFinishTime===0){
        const next=rows(config,'MuseumDisplayCaseCfg').filter(r=>r.areaId===e.exhibitionId&&r.displayCaseId===c.caseIndex&&r.level===c.level+1);
        if(next.length===1){const n=next[0];let reason=null;
          if(quantity(n.areaLevelReq)===null||quantity(n.upgradeTime)===null||!Array.isArray(n.prevCaseId))reason='CASE_CONFIG_UNKNOWN';
          else if(e.level<n.areaLevelReq)reason='CASE_AREA_LEVEL_TOO_LOW';
          else if(n.prevCaseId.length!==0&&(n.prevCaseId.length!==2||!e.cases.some(p=>p.caseIndex===Number(n.prevCaseId[0])&&p.level>=Number(n.prevCaseId[1]))))reason='CASE_PREVIOUS_CASE_REQUIREMENT_NOT_MET';
          if(reason)block('upgradeCase',reason,target);else if(quantity(f.now)===null)block('upgradeCase','SERVER_TIME_UNKNOWN',target);else add('exhibition','upgradeCase',target,c,costsOf(n.costArr),'MuseumDisplayCaseCfg next level costArr; UpgradeBoothPop.ts:3411','MuseumUpgradeCaseRequest',target,null,{level:c.level+1,upgradeSeconds:n.upgradeTime});
        }else if(next.length>1)block('upgradeCase','CASE_CONFIG_AMBIGUOUS',target);
      }
      if(moduleConfig.exhibit&&parameters.antiqueId!==undefined&&c.unlocked&&c.upgradeFinishTime===0&&parameters.antiqueId!==c.antiqueId){
        const antiqueId=parameters.antiqueId,at={...target,antiqueId};
        if(antiqueId){const cfg=rows(config,'AntiqueBaseCfg').filter(r=>r.antiqueId===antiqueId);
          if(!f.antiquesReliable||!f.antiques.includes(antiqueId)){block('exhibit','ANTIQUE_OWNERSHIP_UNKNOWN',at);continue;}
          if(cfg.length!==1||!(cfg[0].isAntique===true||cfg[0].isAntique===1)){block('exhibit','ANTIQUE_NOT_ELIGIBLE',at);continue;}
          if(!f.exhibitions.every(casesValid)){block('exhibit','OTHER_CASE_ASSIGNMENTS_UNKNOWN',at);continue;}
          if(f.exhibitions.some(area=>area.cases.some(other=>other.antiqueId===antiqueId))){block('exhibit','ANTIQUE_ALREADY_DISPLAYED',at);continue;}
        }
        add('exhibition','exhibit',at,{exhibitions:f.exhibitions},[],'MuseumModel.ts:2207 MuseumExhibitRequest has no consumable cost; AntiqueSelectItem.ts:125','MuseumExhibitRequest',at,null,{antiqueId});
      }
    }
  }

  return {candidates,blocked,notes,stages:display,teamCount,occupiedTeams:busy?.length??null,exhibitions:f.exhibitions??[],revenue:f.uncollectedRevenue,topPopularity:f.topPopularity};
}
export function planMuseum(f,options={}){
  const {selections=[],ledger=new ResourceLedger(f.stockReliable?f.stock:null)}=options;
  if(!Array.isArray(selections)||selections.some(id=>!text(id))||!unique(selections,id=>id))throw Error('博物馆选择必须是唯一 actionId 数组');
  const view=museumView(f,options),known=new Map(view.candidates.map(c=>[c.actionId,c]));if(selections.some(id=>!known.has(id)))throw Error('博物馆候选已失效或无证据');
  const picked=selections.map(id=>known.get(id)),stages=picked.filter(a=>a.target.stageId!==undefined);if(!unique(stages,a=>a.target.stageId))throw Error('同一探险每批仅允许一个操作');
  // Occupancy and hero availability change on start; one authoritative re-read per start.
  if(picked.filter(a=>a.actionType==='startExplore').length>1)throw Error('每批仅允许一次探险出发');
  const cfg=validateMuseumConfig(options.moduleConfig),actions=[],notes=[...view.notes];for(const op of picked){if(actions.length>=cfg.maxActionsPerPlan){notes.push(op.actionId+': 每批上限');continue;}if(op.costs.some(({id,num})=>{const i=cfg.stockItemIds.indexOf(id);return i>=0&&(quantity(ledger.available(id))===null||ledger.available(id)-num<cfg.stockReserveQuantities[i]);})||!ledger.reserve(op.costs))notes.push(op.actionId+': 共享预算或库存线不足');else actions.push(op);}return {module:'museum',actions,notes,view};
}
const increase=(b,a,id,n)=>b.stockReliable&&a.stockReliable&&quantity(b.stock.get(id)??0)!==null&&quantity(a.stock.get(id)??0)!==null&&(a.stock.get(id)??0)-(b.stock.get(id)??0)>=n;
const consume=(b,a,c)=>b.stockReliable&&a.stockReliable&&c.every(({id,num})=>quantity(b.stock.get(id)??0)!==null&&quantity(a.stock.get(id)??0)!==null&&(b.stock.get(id)??0)-(a.stock.get(id)??0)>=num);
export function verifyMuseum(op,b,a,response){
  if(!b.playerId||b.playerId!==a.playerId)return false;
  if(op.actionType==='startExplore'){
    const before=b.stages?.find(s=>s.stageId===op.target.stageId),after=a.stages?.find(s=>s.stageId===op.target.stageId),e=after?.expedition;
    return b.stagesReliable&&a.stagesReliable&&before&&stateOf(before,b.now)==='IDLE'&&e&&e.endTime>e.startTime&&e.startTime>=b.now&&e.factor===op.target.factor&&stable([...e.heroIds].sort())===stable([...op.target.heroIds].sort())&&consume(b,a,op.costs);
  }
  if(op.actionType==='speedExplore'){
    const before=b.stages?.find(s=>s.stageId===op.target.stageId)?.expedition,after=a.stages?.find(s=>s.stageId===op.target.stageId)?.expedition;
    return b.stagesReliable&&a.stagesReliable&&before&&after&&before.startTime===after.startTime&&stable(before.heroIds)===stable(after.heroIds)&&before.factor===after.factor&&after.endTime<before.endTime&&after.endTime>0&&consume(b,a,op.costs);
  }
  if(op.actionType==='collectRevenue'){const n=quantity(response?.collected);return b.uncollectedRevenue>0&&a.uncollectedRevenue===0&&n!==null&&n>=b.uncollectedRevenue&&increase(b,a,'人气币',n);}
  if(op.actionType==='claimAchievement')return b.claimedReliable&&a.claimedReliable&&!b.claimedAchievements.includes(op.target.popularityThreshold)&&a.claimedAchievements.includes(op.target.popularityThreshold)&&op.expectedState.rewards.every(({id,num})=>increase(b,a,id,num));
  if(op.actionType==='upgradeExhibition'){const before=b.exhibitions?.find(e=>e.exhibitionId===op.target.exhibitionId),after=a.exhibitions?.find(e=>e.exhibitionId===op.target.exhibitionId);return b.exhibitionsReliable&&a.exhibitionsReliable&&before&&after&&after.level===before.level+1&&consume(b,a,op.costs);}

  if(['upgradeKeyword','upgradeCase','finishCase','speedCase','exhibit'].includes(op.actionType)){
    if(!b.exhibitionsReliable||!a.exhibitionsReliable)return false;
    const before=b.exhibitions.find(e=>e.exhibitionId===op.target.exhibitionId),after=a.exhibitions.find(e=>e.exhibitionId===op.target.exhibitionId);if(!before||!after)return false;
    if(op.actionType==='upgradeKeyword'){const i=op.target.keywordType-1;return keywordsValid(before)&&keywordsValid(after)&&after.keywordLevels[i]===before.keywordLevels[i]+1&&after.keywordLevels.every((n,j)=>j===i||n===before.keywordLevels[j])&&consume(b,a,op.costs);}
    if(!casesValid(before)||!casesValid(after))return false;const old=before.cases.find(c=>c.caseIndex===op.target.caseIndex),current=after.cases.find(c=>c.caseIndex===op.target.caseIndex);if(!old||!current)return false;
    if(op.actionType==='speedCase')return old.upgradeFinishTime>b.now&&current.level===old.level&&current.upgradeFinishTime>0&&current.upgradeFinishTime<old.upgradeFinishTime&&consume(b,a,op.costs);
    if(op.actionType==='finishCase')return old.upgradeFinishTime>0&&quantity(b.now)!==null&&old.upgradeFinishTime<=b.now&&current.level===old.level+1&&current.upgradeFinishTime===0;
    if(op.actionType==='upgradeCase')return consume(b,a,op.costs)&&old.upgradeFinishTime===0&&(current.level===old.level+1&&current.upgradeFinishTime===0||current.level===old.level&&op.expectedState.upgradeSeconds>0&&current.upgradeFinishTime>b.now&&current.upgradeFinishTime>0);
    if(op.actionType==='exhibit')return current.antiqueId===op.target.antiqueId&&old.antiqueId!==current.antiqueId&&a.exhibitions.every(casesValid)&&(op.target.antiqueId===''||a.exhibitions.flatMap(e=>e.cases).filter(c=>c.antiqueId===op.target.antiqueId).length===1);
  }

  return false;
}
export const museumModule=Object.freeze({id:'museum',defaultConfig:MUSEUM_DEFAULT_CONFIG,validateConfig:validateMuseumConfig,survey:surveyMuseum,view:museumView,plan:planMuseum,verify:verifyMuseum});
