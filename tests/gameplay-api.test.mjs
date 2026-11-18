import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cw-gameplay-api-'));
process.env.CW_DATA_DIR=root;process.env.CW_CONFIG_PACK=path.join(root,'unavailable-config.json');
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
const {createExecutionHistory}=await import('../src/execution-history.mjs');
const {createExecutionMemory}=await import('../src/execution-memory.mjs');
const {createModuleSettings}=await import('../src/gameplay-settings.mjs');
const {formationModule}=await import('../src/formation.mjs');
const {allianceModule}=await import('../src/alliance.mjs');
const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs');
const {loadProtocol}=await import('../src/proto.mjs');
const {GameClient:VipHttpClient}=await import('../src/client.mjs'),{createCodec:createVipHttpCodec}=await import('../src/codec.mjs');
const heroModule=GAMEPLAY_MODULES.heroes,heroWireProtocol=loadProtocol();
const heroWire=(name,body)=>heroWireProtocol[name].decode(heroWireProtocol[name].encode(body).finish());
const account=id=>({id,label:'synthetic-'+id,url:'wss://example.invalid/ws',login:{eworldParams:{openId:id,token:'synthetic-gameplay-token',sign:'synthetic-gameplay-sign',timestamp:1}}});
const initial=()=>({presetId:1,petUid:'9007199254740993',heroPositions:[{heroId:'tank',pos:{x:1,y:3}}]});
const cfg={tables:{HeroCfg:{data:[{id:'tank',career:'坦克'}]},FormationHeroNumCfg:{data:[{heroNum:1,mainlineStage:0}]},FormationTypePositionCfg:{data:[{id:1,position:[1,3]},{id:2,position:[5,5]}]}}};
const protocol=Object.fromEntries(['GetFormationRequest','GetFormationResponse','MyFormationPresetRequest','MyFormationPresetResponse','AllHeroRequest','AllHeroResponse','SaveFormationRequest','SaveFormationResponse','ChallengeStageRequest','ChallengeStageResponse'].map(name=>[name,{}]));

const allianceCfg={tables:{GuildTechCfg:{data:[{season:1,techId:10101,type:'世界',group:'资源',name:'种子产量',techPointCost:2000,techPointCostGrowth:400}]},TechUnlockCfg:{data:[{techId:10101,maxLevel:10,openStage:1,preTech:0,preTechLevel:0}]}}};
for(const name of ['GuildInfo','GuildMember','GuildAidList','MyGuildAid','GuildOrder','GuildCityInfo','CounterInfo','AllItem','AllResource','GuildTechInfo','SeasonTaskStage','UpgradeGuildTech'])for(const suffix of ['Request','Response'])protocol[name+suffix]={};
const heroCfg={tables:{HeroCfg:{data:[{id:'tank',quality:'BLUE',universalItemId:'万能碎片'},{id:'ranger',quality:'BLUE',universalItemId:'万能碎片'}]},HeroUpgradeCfg:{data:[{level:1,exp:0,reqPlayerLv:1},{level:2,exp:5,reqPlayerLv:1},{level:3,exp:8,reqPlayerLv:2}]},HeroStarCfg:{data:[{star:0,consumeBlue:0,maxSkillLevel:[1,1]},{star:1,consumeBlue:3,maxSkillLevel:[1,1]},{star:2,consumeBlue:5,maxSkillLevel:[2,2]}]},HeroSkillUpCfg:{data:[{quality:'BLUE',level:2,costArr:[['技能书',4],['技能书',4]]}]}}};
for(const name of ['HeroLevelUpRequest','HeroStarUpRequest','HeroStarUpResponse','HeroSkillLevelUpRequest','HeroFragExchangeRequest'])protocol[name]={};
const farmCfg={tables:{BuildingCfg:{data:[{buildingType:'农田'}]},FarmlandPlantCfg:{data:[{id:'小麦',time:1800,produceNum:5,material:['小麦种子',1]}]},BuildingUpgradeCfg:{data:[]},WorkerOrderCfg:{data:[]},WorkerSpecOrderCfg:{data:[]}}};
for(const name of ['OnWater','MyResFields','MyFleets','FarmHarvest'])for(const suffix of ['Request','Response'])protocol[name+suffix]={};
protocol.FarmPlantRequest={};
protocol.SelectPackRequest={};
protocol.DrawDailyRewardRequest={};for(const name of ['DailyGiftPackRequest','DailyGiftPackResponse','GotFreeDailyPackRequest'])protocol[name]={};
for(const name of ['WeekInfoRequest','WeekInfoResponse','WeekLotteryInfoRequest','WeekLotteryInfoResponse','WeekLotteryFreePackRequest'])protocol[name]={};
for(const name of ['WeekUniqueLotteryRequest','WeekUniqueLotteryResponse','GotUniqueLotteryFreeRequest'])protocol[name]={};
for(const name of ['WeekChipInfoRequest','WeekChipInfoResponse','WeekChipGotFreeRequest'])protocol[name]={};
for(const name of ['WeekChipGotTaskRequest','WeekChipGotTaskResponse'])protocol[name]={};
const chipTaskCfg={tables:{WeekChipPointsCfg:{data:[{rwdId:1,amount:1000,reward:[['绿芯片宝箱',10],['高级专武材料',10],['GOLD',15000]]},{rwdId:2,amount:2000,reward:[['绿芯片宝箱',10],['高级专武材料',20],['GOLD',25000]]}]},WeekChipPeriodCfg:{data:[{periodId:3001,round:5}]},ItemCfg:{data:[{id:'绿芯片宝箱',type:'芯片宝箱'},{id:'高级专武材料',type:'专武经验'}]}}};
const chipGiftCfg={tables:{WeekChipPackCfg:{data:[{packId:1000,price:0,buyLimit:1,guildPack:[],reward:[['白芯片宝箱',10]]},{packId:1001,price:30}]}}};
const uniqueGiftCfg={tables:{WeekUniquePackCfg:{data:[{packId:1000,price:0,limitedTimes:1,guildPack:[],reward:[['周翻牌币',1],['RUBY',10]]},{packId:1001,price:30}]}}};
const weeklyGiftCfg={tables:{WeekLotteryPackCfg:{data:[{packId:1000,price:0,limitedTimes:1,guildPack:[],reward:[['周转盘币',1],['RUBY',10]]},{packId:1001,price:30}]}}};
const dailyGiftCfg={tables:{DailyChargeGiftPackCfg:{data:[{season:1,packId:'赠礼',price:0,fragNum:0,guildPack:[],reward:[['RUBY',10]]}]}}};
const dailyActivityCfg={tables:{DailyActivityRewardCfg:{data:[{season:1,id:1,activity:20,reward:['加速器',120]}]},ItemCfg:{data:[{id:'加速器',type:'通用'}]}}};
for(const name of ['DailyTaskInfoRequest','DailyTaskInfoResponse','DrawDailyTaskRewardRequest','DrawDailyTaskRewardResponse'])protocol[name]={};
const dailyRewardCfg={tables:{DailyTaskCfg:{data:[{taskId:1001,point:5,exp:100,moduleId:''}]}}};
const materialPackCfg={tables:{ItemCfg:{data:[{id:'原料自选包',type:'自选包'},{id:'工事材料自选包',type:'自选包'},{id:'木材',type:'原料'}]},SelectPackLibCfg:{data:[{itemId:'原料自选包',selectItemId:'木材',type:'道具',num:1,season:1}]}}};
for(const name of ['ExpeditionInfoRequest','ExpeditionInfoResponse','ExpeditionSaveFormationRequest','ExpeditionSaveFormationResponse'])protocol[name]={};
for(const name of ['MuseumInfo','AllAntique','MuseumStartExplore','MuseumSpeedUpExplore','MuseumCollectRevenue'])for(const suffix of ['Request','Response'])protocol[name+suffix]??={};
for(const name of ['FinishGuildOrder','GotGuildWelfarePack'])for(const suffix of ['Request','Response'])protocol[name+suffix]??={};
const allianceDailyCfg={tables:{GuildOrderNumCfg:{data:[{season:1,playerLevel:1,maxNum:3}]}}};
const museumDailyCfg={tables:{MuseumExpeditionTeamCfg:{data:[{teamCount:1,playerLevel:28}]},MuseumExpeditionStageCfg:{data:[{stageId:1,areaLevelReq:[]}]},MuseumExpeditionConditionCfg:{data:[{conditionId:100,heroCount:3}]},MuseumExploreTimeFactorCfg:{data:[{factor:1,playerLevel:1},{factor:2,playerLevel:30}]}}};
async function harness({includeTreasure=false,includeAllianceFort=false,includeFormationUnlock=false,includeCompass=false,recruitState=null,testProtocol=protocol,configOverride=null,includeProduction=false,includeOrders=false,unconfirmed=false,includeCargo=false,includeTrade=false,includeAllianceOrders=false,includeMuseum=false,includePirate=false,includeStage=false,includeAlliance=false,includeHeroes=false,includeFragments=false,includeMaterialPacks=false,includeDailyReward=false,includeDailyActivity=false,includeDailyGift=false,includeWeeklyGift=false,includeUniqueGift=false,includeChipGift=false,includeChipTask=false,includeWorkflowTasks=false,includeFreeRecruit=false,includeAfk=false,includeFarm=false,includeForge=false,includeExpedition=false,badTechReply=false,collectSnapshot=null}={}){includeWeeklyGift ||= includeUniqueGift||includeChipGift||includeChipTask;
 // Each harness has its own module registry. Keep same-test restart evidence,
 // but do not load another test's Workflow contracts or authorization history.
 for(const name of ['workflows.json','workflows.json.anchor'])fs.rmSync(path.join(root,name),{force:true});
 saveStore({version:1,activeId:'A',accounts:[account('A'),account('B')]});let clients=0,collections=0;const requests=[];const modules={formation:formationModule,...(includeTreasure?{treasure:GAMEPLAY_MODULES.treasure}:{}),...(includeFormationUnlock?{'formation-unlock':GAMEPLAY_MODULES['formation-unlock']}:{}),...(includeCompass?{'compass-wheel':GAMEPLAY_MODULES['compass-wheel']}:{}),...(includeForge?{'equipment-forge':GAMEPLAY_MODULES['equipment-forge']}:{}),...(includeProduction?{production:GAMEPLAY_MODULES.production}:{}),...(includeOrders?{orders:GAMEPLAY_MODULES.orders}:{}),...(includeCargo?{fleet:GAMEPLAY_MODULES.fleet}:{}),...(includeTrade?{trade:GAMEPLAY_MODULES.trade}:{}),...(includePirate?{'pirate-sweep':GAMEPLAY_MODULES['pirate-sweep']}:{}),...(includeFreeRecruit?{'free-recruit':GAMEPLAY_MODULES['free-recruit']}:{}),...(includeAfk?{'afk-level-rewards':GAMEPLAY_MODULES['afk-level-rewards']}:{}),...(includeWeeklyGift||includeDailyGift||includeDailyReward||includeDailyActivity||includeWorkflowTasks?{'task-rewards':GAMEPLAY_MODULES['task-rewards']}:{}),...(includeMaterialPacks?{'material-packs':GAMEPLAY_MODULES['material-packs']}:{}),...(includeFarm?{farm:GAMEPLAY_MODULES.farm}:{}),...(includeMuseum?{museum:GAMEPLAY_MODULES.museum}:{}),...(includeHeroes?{heroes:heroModule}:{}),...(includeAlliance||includeAllianceOrders||includeAllianceFort?{alliance:includeAllianceFort?GAMEPLAY_MODULES.alliance:allianceModule}:{}),...(includeStage?{stage:{id:'stage',defaultConfig:{enabled:false}}}:{})};const hc=structuredClone(heroCfg);if(includeFragments){hc.tables.HeroCfg.data.forEach(row=>{row.type='英雄';row.universalItemId='蓝卡万能碎片';});hc.tables.ItemCfg={data:[{id:'蓝卡万能碎片',type:'英雄万能碎片',quality:'BLUE'},...['tank','ranger'].map(id=>({id:id+'碎片',type:'英雄碎片',quality:'BLUE'}))]};}const history=createExecutionHistory({file:path.join(root,'execution-'+Math.random()+'.json')});const moduleSettings=createModuleSettings({file:path.join(root,'settings-'+Math.random()+'.json'),modules});
 const memory=includeAllianceOrders?createExecutionMemory({file:history.storagePath+'.memory.json'}):null;
 const app=createConsole({port:0,protocol:testProtocol,tracePath:path.join(root,'trace-'+Math.random()+'.log'),clientFactory(){clients++;throw Error('Real client forbidden');},collect(...args){collections++;if(collectSnapshot)return collectSnapshot(...args);throw Error('Full collector forbidden');},operationOptions:{history,...(memory?{memory}:{}),...(includeStage||includeMuseum||includeAllianceOrders||includeCargo||includeTrade?{}:{modules}),moduleSettings,getConfig:()=>configOverride??(includeAllianceOrders?allianceDailyCfg:includeMuseum?museumDailyCfg:includeChipTask?chipTaskCfg:includeChipGift?chipGiftCfg:includeUniqueGift?uniqueGiftCfg:includeWeeklyGift?weeklyGiftCfg:includeDailyGift?dailyGiftCfg:includeDailyActivity?dailyActivityCfg:includeDailyReward?dailyRewardCfg:includeMaterialPacks?materialPackCfg:includeExpedition?{tables:{...cfg.tables,ExpeditionRaidCfg:{data:[{raidId:1001,unlockLv:30,heroCount:10}]}}}:includeFarm?farmCfg:includeHeroes?hc:includeAlliance?allianceCfg:cfg),loadRules:()=>({config:{version:1,enabled:true,rules:[]}})}});await app.listen();const origin='http://127.0.0.1:'+app.server.address().port;let csrf;
 const call=(route='/api/gameplay?module=formation',{id='A',body,method=body===undefined?'GET':'POST',headers={},authorized=true}={})=>new Promise((resolve,reject)=>{const url=new URL(route,origin);if(id!==null)url.searchParams.set('account',id);const req=http.request(url,{method,headers:{connection:'close','content-type':'application/json',...(authorized?{origin,...(csrf?{'x-cw-csrf':csrf}:{})}:{}),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>{const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:res.statusCode,data,text});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 const ready=id=>{const forgeEquip=(uid,equipId='蓝武器1')=>({uid,equipId,level:0,star:0,refineLv:0,attr:[],rerollAttrs:[]}),forgeState={queue:{makeId:1001,finishTime:900,equipId:'蓝武器1',star:0},stock:20,gold:100,pool:[forgeEquip('9007199254740993'),forgeEquip('9007199254740994')],heroes:[{heroId:'tank',level:1,star:1,power:'1',skillLevels:[1],equips:[forgeEquip('9007199254740994')]}],refused:false,onRead:null};const allianceOrderState={stock:10,completed:0,refreshAt:1800003600,requirements:[{id:'小麦',num:2}],cities:[{cityId:1},{cityId:2}],refused:false};const museumState={info:{uncollectedRevenue:10,topPopularity:0,claimedAchievements:[],exhibitions:[{exhibitionId:1,level:1,keywordLevels:[1,1,1],cases:[]}],exploreStages:[{stageId:1,progress:0,expedition:{startTime:0,endTime:0,heroIds:[],cost:{asset:[{id:'小麦',num:2}]},conditionId:100,factor:1}}]},stock:10,refused:false,onRead:null};const weekState={activityTime:[{type:includeChipTask||includeChipGift?6:includeUniqueGift?7:4,period:includeChipTask?3001:includeChipGift?1001:includeUniqueGift?20001:12,startTime:900,endTime:2000}]},weeklyState=includeChipTask?{round:1,score:2000,gotTaskId:[],gifts:[{giftId:1000,paidTimes:0}]}:includeChipGift?{round:1,score:100,gotTaskId:[1],gifts:[{giftId:1000,paidTimes:0},{giftId:1001,paidTimes:1}]}:includeUniqueGift?{gift:[{giftId:1001,gotTimes:1,charge:30}],floor:2,selectId:1001,gotFloor:1,buyTimes:0,prizePos:[{prizeId:2,pos:1}],gotFree:false}:{gift:[{giftId:1000,gotTimes:0,charge:0}],gotInfo:{times:0,gotStage:0}};const giftState={heroId:'马斯克',resetTime:1,boughtPack:[],drawnPack:[]};const dailyActivityStock=new Map();const dailyState={dailyTask:[{id:1001,progress:1,targetProgress:1,rewardClaimed:false}],dailyActivity:40,weeklyActivity:85,dailyRewardClaimed:[],weeklyRewardClaimed:[],dailyResetTime:2000},dailyResources=[{res:1,amount:100},{res:3,amount:200},...(includeWeeklyGift||includeDailyGift?[{res:4,amount:50}]:[])];let current=initial(),techLevel=1,techPoints=10000;const expedition={raidId:1001,stageFormId:0,endTime:2000,passedStage:0,hero:[{heroId:'tank',hp:'9007199254740993'}],buff:[],gotFinal:false,isFirst:true,formation:initial(),stageBuff:[],stagePower:'9007199254740995',passedRaid:[]};
 const materialStock=new Map([['原料自选包',5],['工事材料自选包',4],['无关道具',7]]);
 const farmState={water:{building:[{buildingId:'1农田',level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},farm:{productId:'小麦',plantTime:1700000000,ripeTime:1700001800}}],autoFarming:false},stock:new Map([['小麦',5],['小麦种子',3]])};
 const heroState={heroes:['tank','ranger'].map(heroId=>({heroId,level:1,star:1,power:'9007199254740993',skillLevels:[1,1],attributes:[{attr:1,value:1.5}]})),stock:new Map([['英雄经验',30],['tank碎片',10],['ranger碎片',10],['技能书',20],['万能碎片',20]]),onWrite:null};
 const mutateHero=(name,body)=>{const row=heroState.heroes.find(value=>value.heroId===body.heroId);if(!unconfirmed){if(name==='HeroFragExchangeRequest'){heroState.stock.set('蓝卡万能碎片',heroState.stock.get('蓝卡万能碎片')-body.num);heroState.stock.set(body.fragItemId,(heroState.stock.get(body.fragItemId)??0)+body.num);}if(name==='HeroLevelUpRequest'){row.level++;heroState.stock.set('英雄经验',heroState.stock.get('英雄经验')-5);}if(name==='HeroStarUpRequest'){row.star++;heroState.stock.set(row.heroId+'碎片',heroState.stock.get(row.heroId+'碎片')-5);}if(name==='HeroSkillLevelUpRequest'){row.skillLevels[body.skillIdx-1]++;heroState.stock.set('技能书',heroState.stock.get('技能书')-4);}}heroState.onWrite?.(name,body);return row;};const client=new EventEmitter();Object.assign(client,{id,connected:true,pending:[],watchers:[],uncertainWrites:new Set(),stop(){this.connected=false;},markUnverifiedWrite(name){this.uncertainWrites.add(name);},confirmWatchedWrite(name){this.uncertainWrites.delete(name);},async request(name,body,response,timeout,options){requests.push({id,name,body:structuredClone(body),response,options});
if(recruitState){
 heroWire(name,body);
 if(name==='AntiqueRecruitRequest'){
  options.beforeDispatch?.();assert.equal(options.mutate,true);const count=recruitState.count??1;assert.equal(recruitState.antiqueMode,true);assert.deepEqual(body,{type:1,way:recruitState.freeAntique?1:({1:2,10:3,50:4})[count]});
  if(!unconfirmed){if(!recruitState.freeAntique)recruitState.stock-=count;recruitState.antique.recruitTimes+=count;if(recruitState.freeAntique)recruitState.antique.freeEndTimeSeconds=2000;recruitState.ownership.antiques.push({id:recruitState.newAntiqueId,star:0});recruitState.fragments+=recruitState.conversionCount*(count-1);}
  return heroWire(response,{recruitData:{...recruitState.antique,recruitTimes:1+count,freeEndTimeSeconds:2000},reward:Array.from({length:count},(_,i)=>i===0?{antiqueId:recruitState.newAntiqueId,trans:false}:{antiqueId:recruitState.antiqueId,trans:true})});
 }
 if(name==='RecruitStartRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);const count=recruitState.count??1;assert.deepEqual(body,{way:({1:2,10:3,50:4})[count]});if(!unconfirmed){recruitState.stock-=count;recruitState.recruit.recruitTimes+=count;recruitState.heroes.push({heroId:'ranger',level:1,star:0,power:'1',skillLevels:[1],equips:[],attributes:[]});if(count>1)recruitState.fragments+=2*(count-1);}return heroWire(response,{recruitData:{...recruitState.recruit,recruitTimes:1+count},reward:Array.from({length:count},(_,i)=>i===0?{heroId:'ranger',trans:false}:{heroId:'tank',trans:true,frag:{asset:[{type:0,id:'tank碎片',num:2}]}})});}
 const answers={RecruitInfoRequest:{hero:recruitState.recruit,antique:recruitState.antique},AllHeroRequest:{heroes:recruitState.heroes},AllAntiqueRequest:recruitState.ownership,OnWaterRequest:{building:[{buildingId:'1广播站',level:1}]},AllItemRequest:{items:[...(recruitState.stock?[{itemId:recruitState.antiqueMode?'藏品券':'抽卡券',num:recruitState.stock}]:[]),...(recruitState.count?[{itemId:recruitState.antiqueMode?recruitState.antiqueId+'碎片':'tank碎片',num:recruitState.fragments}]:[])]},AllResourceRequest:{list:[{res:3,amount:100},{res:4,amount:50}]}};
 if(Object.hasOwn(answers,name))return heroWire(response,answers[name]);throw Error('unexpected recruit read '+name);
}
if(includeForge){
 heroWire(name,body);await forgeState.onRead?.(name);
 if(name==='PickMadeEquipRequest'){options.beforeDispatch?.();if(forgeState.refused)throw Object.assign(Error('synthetic forge refusal'),{code:'REJECTED'});const equipId=forgeState.queue.equipId;if(!unconfirmed){forgeState.pool.push(forgeEquip('9007199254740995',equipId));forgeState.queue={makeId:0,finishTime:0,equipId:'',star:0};}return heroWire(response,{equipId});}
 const answers={OnWaterRequest:{building:[{buildingId:'1装备厂',level:1,buildStartTime:0,buildFinishTime:0,equipMaking:forgeState.queue}]},EquipsRequest:{equip:forgeState.pool},AllHeroRequest:{heroes:forgeState.heroes},AllItemRequest:{items:[{itemId:'材料',num:forgeState.stock}]},AllResourceRequest:{list:[{res:3,amount:forgeState.gold}]}};if(Object.hasOwn(answers,name))return heroWire(response,answers[name]);throw Error('unexpected forge read '+name);
}
if(includeAllianceOrders){
 heroWire(name,body);
 if(name==='FinishGuildOrderRequest'){
  options.beforeDispatch?.();assert.equal(options.mutate,true);
  if(allianceOrderState.refused)throw Object.assign(Error('synthetic alliance refusal'),{code:'REJECTED'});
  if(!unconfirmed){allianceOrderState.stock-=2;allianceOrderState.completed++;}
  return heroWire(response,{});
 }
 const answers={GuildInfoRequest:{guild:{guildId:'10',welfarePack:[{id:'9',createTime:1799999999}],gotWelfareTime:0}},GuildMemberRequest:{titleList:[]},GuildAidListRequest:{askItems:[]},MyGuildAidRequest:{aids:[]},GuildOrderRequest:{order:{requirements:allianceOrderState.requirements,nextRefreshTime:allianceOrderState.refreshAt}},GuildCityInfoRequest:{cities:allianceOrderState.cities},CounterInfoRequest:{counters:[{type:'DAILY_FINISH_GUILD_ORDER',num:allianceOrderState.completed}]},AllItemRequest:{items:[{itemId:'小麦',num:allianceOrderState.stock}]},AllResourceRequest:{list:[{res:3,amount:100}]},GuildTechInfoRequest:{tech:[]},SeasonTaskStageRequest:{stage:1}};
 if(Object.hasOwn(answers,name))return heroWire(response,structuredClone(answers[name]));
}
if(includeMuseum){
 heroWire(name,body);
 if(name==='MuseumStartExploreRequest'){
  options.beforeDispatch?.();assert.equal(options.mutate,true);
  if(museumState.refused)throw Object.assign(Error('synthetic museum refusal'),{code:'REJECTED'});
  if(!unconfirmed){museumState.stock-=2*body.factor;Object.assign(museumState.info.exploreStages.find(stage=>stage.stageId===body.stageId).expedition,{startTime:1800000000,endTime:1800003600,heroIds:[...body.heroIds],factor:body.factor});}
  return {};
 }
 const answers={MuseumInfoRequest:museumState.info,AllHeroRequest:{heroes:['A','B','C','D'].map(heroId=>({heroId}))},AllItemRequest:{items:[{itemId:'小麦',num:museumState.stock},{itemId:'人气币',num:1}]},AllResourceRequest:{list:[{res:3,amount:100}]},AllAntiqueRequest:{antiques:[]}};
 if(Object.hasOwn(answers,name)){museumState.onRead?.(name);return structuredClone(answers[name]);}
}
if(includeWeeklyGift||includeDailyGift||includeDailyReward||includeDailyActivity){heroWire(name,body);if(name==='DrawDailyTaskRewardRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);if(!unconfirmed){dailyState.dailyTask[0].rewardClaimed=true;dailyState.dailyActivity+=5;dailyState.weeklyActivity+=5;dailyResources[0].amount+=100;}return heroWire(response,{activity:5});}if(name==='WeekChipGotTaskRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);const rewards=chipTaskCfg.tables.WeekChipPointsCfg.data.find(r=>r.rwdId===body.taskId).reward,gotTaskId=[...weeklyState.gotTaskId,body.taskId];if(!unconfirmed){weeklyState.gotTaskId=gotTaskId;for(const [id,num]of rewards)if(id==='GOLD')dailyResources.find(r=>r.res===3).amount+=num;else dailyActivityStock.set(id,(dailyActivityStock.get(id)??0)+num);}return heroWire(response,{round:body.round,gotTaskId,reward:{asset:rewards.map(([id,num])=>({type:0,id,num}))}});}if(name==='WeekChipInfoRequest')return heroWire(response,weeklyState);if(name==='WeekUniqueLotteryRequest')return heroWire(response,weeklyState);if(name==='WeekInfoRequest')return heroWire(response,weekState);if(name==='WeekLotteryInfoRequest')return heroWire(response,weeklyState);if(name==='DailyGiftPackRequest')return heroWire(response,giftState);if(name==='DailyTaskInfoRequest')return heroWire(response,dailyState);if(name==='AllItemRequest')return heroWire(response,{items:[...dailyActivityStock].map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return heroWire(response,{list:dailyResources});}if(includeMaterialPacks){heroWire(name,body);if(name==='AllItemRequest')return heroWire(response,{items:[...materialStock].map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return heroWire(response,{list:[]});}if(includeExpedition){heroWire(name,body);if(name==='ExpeditionSaveFormationRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);if(!unconfirmed)expedition.formation=structuredClone(body.formation);return heroWire(response,{formation:body.formation});}if(name==='ExpeditionInfoRequest')return heroWire(response,expedition);if(name==='AllItemRequest')return heroWire(response,{items:[]});if(name==='AllResourceRequest')return heroWire(response,{list:[]});}if(includeFarm){if(name==='FarmHarvestRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);assert.deepEqual(body,{buildingId:['1农田']});if(!unconfirmed){farmState.water.building[0].farm={productId:'',plantTime:0,ripeTime:0};farmState.stock.set('小麦',15);}return heroWire(response,{reward:[{reward:{type:0,id:'小麦',num:10},critical:2}]});}const raw=name==='OnWaterRequest'?farmState.water:name==='AllItemRequest'?{items:[...farmState.stock].map(([itemId,num])=>({itemId,num}))}:name==='AllResourceRequest'?{list:[]}:name==='MyResFieldsRequest'?{info:{fields:[]}}:name==='MyFleetsRequest'?{fleets:[]}:null;if(raw)return heroWire(response,raw);}if(includeHeroes){heroWire(name,body);if(name==='AllHeroRequest')return heroWire(response,{heroes:heroState.heroes});if(name==='AllItemRequest')return heroWire(response,{items:[...heroState.stock].map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return heroWire(response,{list:[]});if(name==='HeroStarUpRequest'){const row=mutateHero(name,body);return heroWire(response,{nextStar:unconfirmed?{...row,star:row.star+1}:row});}}if(includeAlliance){const state={GuildInfoRequest:{guild:{guildId:'10',welfarePack:[],gotWelfareTime:0}},GuildMemberRequest:{titleList:[{guildTitle:1,members:[{playerId:'2',nickname:'same'}]}]},GuildAidListRequest:{askItems:[]},MyGuildAidRequest:{aids:[]},GuildOrderRequest:{order:{requirements:[],nextRefreshTime:2000000000}},GuildCityInfoRequest:{cities:[]},CounterInfoRequest:{counters:[]},AllItemRequest:{items:[{itemId:'公会科技点',num:techPoints}]},AllResourceRequest:{list:[]},GuildTechInfoRequest:{tech:[{techId:10101,level:techLevel}]},SeasonTaskStageRequest:{stage:1}};if(name==='UpgradeGuildTechRequest'){if(!unconfirmed){techLevel++;techPoints-=2400;}return {tech:{techId:badTechReply?10102:10101,level:techLevel+(unconfirmed?1:0)}};}if(Object.hasOwn(state,name))return structuredClone(state[name]);}if(name==='GetFormationRequest')return {formation:structuredClone(current)};if(name==='MyFormationPresetRequest')return {ids:[2]};if(name==='AllHeroRequest')return {heroes:[{heroId:'tank'}]};if(name==='SaveFormationRequest'){if(!unconfirmed)current=structuredClone(body.formation);return {formation:structuredClone(body.formation)};}if(name==='ChallengeStageRequest')return {initialData:{mainlineStage:body.stage,battleType:1},stats:{isLeftWin:true}};throw Error('Unexpected synthetic request '+name);},async sendWatch(name,body,options){if(includeForge){assert.equal(name,'MakeEquipRequest');heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){forgeState.queue={makeId:body.makeId,finishTime:2000,equipId:'蓝防具1',star:0};forgeState.stock-=4;forgeState.gold-=20;}return {status:'UNKNOWN'};}if(includeWeeklyGift){assert.equal(name,includeChipGift?'WeekChipGotFreeRequest':includeUniqueGift?'GotUniqueLotteryFreeRequest':'WeekLotteryFreePackRequest');heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){if(includeChipGift){weeklyState.gifts[0].paidTimes=1;dailyActivityStock.set('白芯片宝箱',10);}else{if(includeUniqueGift)weeklyState.gotFree=true;else weeklyState.gift[0].gotTimes=1;dailyActivityStock.set(includeUniqueGift?'周翻牌币':'周转盘币',1);dailyResources.find(r=>r.res===4).amount+=10;}}return {status:'UNKNOWN'};}if(includeDailyGift){assert.equal(name,'GotFreeDailyPackRequest');heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){giftState.drawnPack.push('赠礼');dailyResources.find(r=>r.res===4).amount+=10;}return {status:'UNKNOWN'};}if(includeDailyActivity){heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){dailyState.dailyRewardClaimed.push(body.index[0]);dailyActivityStock.set('加速器',120);}return {status:'UNKNOWN'};}if(includeMaterialPacks){heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){materialStock.set(body.itemId,materialStock.get(body.itemId)-body.num);materialStock.set(body.selectItemId,(materialStock.get(body.selectItemId)??0)+body.num);}return {status:'UNKNOWN'};}if(!includeHeroes)throw Error('Unexpected watch '+name);heroWire(name,body);requests.push({id,name,body:structuredClone(body),response:null});mutateHero(name,body);return {status:'UNKNOWN'};}});const session={id,client,player:includeForge?{playerId:id==='A'?'1':'2',worldId:1000001,level:20}:includeAllianceOrders?{playerId:id==='A'?'1':'2',worldId:1000001,level:30}:includeMuseum?{playerId:id==='A'?'1':'2',worldId:1,level:30}:includeWeeklyGift||includeDailyGift||includeDailyActivity?{playerId:id==='A'?'1':'2',worldId:1000001}:includeDailyReward?{playerId:id==='A'?'1':'2',worldId:17}:includeMaterialPacks?{playerId:id==='A'?'1':'2',worldId:1000001,level:20}:includeExpedition?{playerId:id==='A'?'1':'2',worldId:1,level:40,mainlineStage:41}:includeFarm?{playerId:id==='A'?'1':'2',worldId:1,level:20}:includeHeroes?{playerId:id==='A'?'1':'2',worldId:1,level:2}:includeAlliance?{playerId:'1',worldId:1000001,level:20}:{playerId:'synthetic-player-'+id,mainlineStage:41},state:'READY',generation:1,abort:new AbortController(),busy:null,loop:{running:false,stop:{}},log:[],snapshot:{ok:{},failed:{}},snapshotStale:false,...(includeFarm?{farmState}:{}),...(includeHeroes?{heroState}:{})};if(includeWeeklyGift||includeDailyGift||includeDailyReward||includeDailyActivity){session.weekState=weekState;session.weeklyState=weeklyState;session.giftState=giftState;session.giftResources=dailyResources;session.dailyState=dailyState;session.dailyActivityStock=dailyActivityStock;session.connectionId='daily-http-'+id;client.factContext={accountId:id,generation:1,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:id,generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};}if(includeMaterialPacks){session.materialStock=materialStock;session.connectionId='packs-http-'+id;client.factContext={accountId:id,generation:1,connectionId:session.connectionId};}if(includeFragments){heroState.stock.set('蓝卡万能碎片',20);session.connectionId='fragment-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};}if(includeExpedition){session.connectionId='expedition-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,accountId:id,generation:session.generation,source:'PingResponse.serverTimestamp',earliestMs:1000000,nowMs:1000000,latestMs:1000000})};}if(includeFarm){session.connectionId='farm-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,accountId:id,generation:session.generation,source:'PingResponse.serverTimestamp',earliestMs:1700001801000,nowMs:1700001801100,latestMs:1700001801200})};}if(includeAllianceOrders){session.allianceOrderState=allianceOrderState;session.connectionId='alliance-order-'+id;client.factContext={accountId:id,generation:1,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'synthetic accepted clock',accountId:id,generation:session.generation,nowMs:1800000000000,earliestMs:1800000000000,latestMs:1800000000000})};}if(includeMuseum){session.museumState=museumState;session.connectionId='museum-http-'+id;client.factContext={accountId:id,generation:1,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'synthetic accepted clock',accountId:id,generation:session.generation,nowMs:1800000000000,earliestMs:1800000000000,latestMs:1800000000000})};}if(includeForge){session.forgeState=forgeState;session.connectionId='forge-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,accountId:id,generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};}if(recruitState){session.player={playerId:id==='A'?'9007199254740993':'9007199254740995',worldId:17,level:10};session.connectionId='recruit-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:id,generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000001})};}app.sessions.set(id,session);return session;};
 const module=includeWeeklyGift||includeDailyGift||includeDailyActivity?'task-rewards':includeDailyReward?'task-rewards':includeMaterialPacks?'material-packs':includeFarm?'farm':includeHeroes?'heroes':includeAlliance?'alliance':'formation',parameters=includeChipTask?{kind:'weekly-chip-task',round:1,taskId:1}:includeChipGift?{kind:'weekly-chip-gift',packId:'1000'}:includeUniqueGift?{kind:'weekly-unique-lottery-gift',packId:'1000'}:includeWeeklyGift?{kind:'weekly-lottery-gift',packId:'1000'}:includeDailyGift?{kind:'daily-gift',packId:'赠礼'}:includeDailyActivity?{kind:'daily-activity',tierId:1}:includeDailyReward?{kind:'daily',taskId:1001}:includeMaterialPacks?{packId:'原料自选包',itemId:'木材',num:2}:includeFarm?{buildingId:'1农田',action:'harvest'}:includeHeroes?{heroId:'tank',action:'level'}:includeAlliance?{techId:10101,targetLevel:2}:includeExpedition?{mode:'expedition',raidId:1001,presetId:2}:{presetId:2};const enable=async()=>{await call('/api/gameplay?module='+module);return call('/api/gameplay/config',{body:{module,config:includeWeeklyGift||includeDailyGift||includeDailyActivity||includeDailyReward||includeMaterialPacks||includeHeroes||includeFarm?{enabled:true}:includeAlliance?{enabled:true,tech:true}:{enabled:true,mainlineEnabled:true}}});};
 const survey=(input=parameters)=>call('/api/gameplay/survey',{body:{module,parameters:input}});
 const plan=async(input=parameters)=>{const read=await survey(input);assert.equal(read.status,200);const candidate=read.data.view.candidates[0];assert.equal(candidate.executable,true);return call('/api/operations/plan',{body:{module,mode:'Manual',selections:[candidate.actionId],parameters:input}});};
 const approve=p=>call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true}});
 return {...app,history,memory,call,ready,enable,survey,plan,approve,requests,counts:()=>({clients,collections})};}
async function waitForWorkflow(app,expected){let data;for(let i=0;i<30;i++){data=(await app.call('/api/workflows')).data;assert.ok(data.status,JSON.stringify(data));if(data.status.status===expected)return data;if(['FAILED','UNKNOWN','CANCELLED'].includes(data.status.status))throw Error('Unexpected workflow '+JSON.stringify(data.status));}throw Error('Workflow did not reach '+expected+': '+JSON.stringify(data.status));}
const graph=(id,nodes,edges)=>({version:1,id,name:id,nodes,edges});
const stoppedGraph=id=>graph(id,[{id:'start',type:'START'},{id:'stop',type:'STOP'}],[{from:'start',to:'stop'}]);
test('gameplay and workflow cached routes require exact accounts and never create a Session or game connection',async()=>{const app=await harness();try{for(const route of ['/api/gameplay?module=formation','/api/workflows'])for(const id of [null,'synthetic-A','missing'])assert.equal((await app.call(route,{id})).status,id===null?400:404);const read=await app.call();assert.equal(read.status,200);assert.equal(read.data.config.enabled,false);assert.equal(read.data.view,null);assert.ok(read.data.csrfToken);assert.equal((await app.call('/api/workflows')).data.status.status,'IDLE');assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal((await app.survey()).data.code,'NOT_CONNECTED');}finally{await app.close();}});
test('local per-account config and workflow save/simulate work without connecting and cannot accept transport or credentials',async()=>{const app=await harness();try{await app.call();assert.equal((await app.enable()).status,200);assert.equal((await app.call(undefined,{id:'B'})).data.config.enabled,false);assert.equal((await app.call('/api/gameplay/config',{body:{module:'formation',config:{enabled:true,request:'Anything'}}})).status,400);const g=stoppedGraph('local-only');assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const read=await app.call('/api/workflows');assert.ok(read.data.graphs.some(v=>v.id===g.id));assert.equal((await app.call('/api/workflows',{id:'B'})).data.graphs.some(v=>v.id===g.id),false);const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.equal(sim.data.runtimeCreated,false);const bad=graph('bad',[{id:'s',type:'START'},{id:'x',type:'SURVEY',module:'formation',parameters:{request:'SaveFormationRequest'}},{id:'e',type:'STOP'}],[{from:'s',to:'x'},{from:'x',to:'e'}]);assert.equal((await app.call('/api/workflows/save',{body:{graph:bad}})).status,400);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);}finally{await app.close();}});
test('all gameplay writes require same-origin CSRF and strict JSON before reading or mutating',async()=>{const app=await harness();try{app.ready('A');await app.call();for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'forged'}},{headers:{origin:'https://example.invalid'}},{headers:{host:'evil.invalid'}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{'content-type':'text/plain'}}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'formation',parameters:{}},...extra})).status,403);for(const route of ['/api/gameplay/config','/api/workflows/save','/api/workflows/start','/api/workflows/stop'])assert.equal((await app.call(route,{body:{},authorized:false})).status,403);assert.equal(app.requests.length,0);for(const extra of [{request:'AnyRequest'},{body:{}},{allowPaid:true}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'formation',parameters:{},...extra}})).status,400);}finally{await app.close();}});
test('real Formation adapter runs only after exact plan authorization and confirms full fresh state',async()=>{const app=await harness();try{app.ready('A');await app.enable();const p=await app.plan();assert.equal(p.status,200);assert.equal(p.data.actions[0].action,undefined);assert.deepEqual(p.data.resourceBudget,[]);assert.equal((await app.call('/api/operations/execute',{body:{batchId:p.data.batchId,confirm:true}})).status,400);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);const permit=await app.approve(p.data);assert.equal(permit.status,200);const run=await app.call('/api/operations/execute',{body:permit.data});assert.equal(run.status,200);await app.operations.settle('A');const writes=app.requests.filter(r=>r.name==='SaveFormationRequest');assert.equal(writes.length,1);assert.equal(writes[0].body.formation.petUid,'9007199254740993');const history=await app.call('/api/operations/history');assert.equal(history.data.runs[0].finalStatus,'SUCCESS');assert.equal(history.data.runs[0].actions[0].verification.status,'CONFIRMED');assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.equal((await app.call('/api/gameplay?module=formation',{id:'B'})).data.view,null);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}});
test('a typed Formation reply without matching authoritative reread is UNKNOWN and blocks another batch',async()=>{const app=await harness({unconfirmed:true});try{const session=app.ready('A');await app.enable();const p=await app.plan(),permit=await app.approve(p.data);await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');const read=await app.call();assert.equal(read.data.status.finalStatus,'UNKNOWN');assert.equal(read.data.status.blocked,true);assert.equal(session.client.uncertainWrites.has('SaveFormationRequest'),true);assert.equal((await app.survey()).data.code,'RESPONSE_UNCERTAIN');assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);}finally{await app.close();}});
test('workflow ACTION claims the account, exposes only a plan, and advances solely after confirmed same-batch history',async()=>{const app=await harness();try{const session=app.ready('A');await app.enable();const surveyed=await app.survey(),actionId=surveyed.data.view.candidates[0].actionId;const g=graph('authorized-flow',[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:actionId},{id:'v',type:'VERIFY',module:'formation'},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]);const start=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(start.status,200);const waitingPlan=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');
 const runId=waitingPlan.status.runId, persisted=data=>data.history.find(run=>run.runId===runId);
 assert.equal(persisted(waitingPlan).status,'AWAITING_AUTHORIZATION');
 assert.equal(persisted(waitingPlan).recovered,undefined);
 const generation=session.generation;
 try {
  session.generation++;
  const detached=await app.call('/api/workflows');
  assert.equal(detached.status,200);
  assert.equal(persisted(detached.data).status,'RECOVERED_STOPPED');
  assert.equal(persisted(detached.data).resumable,false);
 } finally { session.generation=generation; }
 assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);assert.match(session.busy,/workflow:/);assert.equal((await app.survey()).data.code,'ACCOUNT_BUSY');const waiting=await app.call('/api/workflows/resume',{body:{}});assert.equal(waiting.data.status.status,'AWAITING_AUTHORIZATION');const p=waitingPlan.status.plan,permit=await app.approve(p);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const complete=await app.call('/api/workflows/resume',{body:{}});assert.equal(complete.status,200);await waitForWorkflow(app,'COMPLETED');assert.equal(session.busy,null);assert.equal(session.workflowOwner,null);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);}finally{await app.close();}});
test('STOP at pending ACTION releases Workflow claim and invalidates any earlier authorization',async()=>{const app=await harness();try{const session=app.ready('A');await app.enable();const surveyed=await app.survey(),actionId=surveyed.data.view.candidates[0].actionId;const g=graph('stop-before-write',[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:actionId},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'e'}]);const start=await app.call('/api/workflows/start',{body:{graph:g}});const waitingPlan=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');const permit=await app.approve(waitingPlan.status.plan);const stop=await app.call('/api/workflows/stop',{body:{}});assert.equal(stop.data.status.status,'CANCELLED');assert.equal(session.busy,null);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).data.code,'STALE_PLAN');assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);}finally{await app.close();}});
test('Workflow WAIT holds the same-account claim and stop cancels it without a game write',async()=>{const app=await harness();let start;try{const session=app.ready('A');await app.call('/api/workflows');const g=graph('wait-stop',[{id:'s',type:'START'},{id:'w',type:'WAIT',durationMs:60000},{id:'e',type:'STOP'}],[{from:'s',to:'w'},{from:'w',to:'e'}]);start=app.call('/api/workflows/start',{body:{graph:g}});let status;for(let i=0;i<20;i++){status=(await app.call('/api/workflows')).data.status;if(status.status==='WAITING')break;}assert.equal(status.status,'WAITING');assert.match(session.busy,/workflow:/);assert.equal((await app.survey()).data.code,'ACCOUNT_BUSY');const stop=await app.call('/api/workflows/stop',{body:{}});assert.equal(stop.data.status.status,'CANCELLED');await start;assert.equal(session.busy,null);assert.equal(app.requests.length,0);}finally{if(start)await app.call('/api/workflows/stop',{body:{}});await app.close();}});




test('registered finite Stage Function uses the server original Runner through the existing exact batch authorization',async()=>{const app=await harness({includeStage:true});try{const session=app.ready('A');const read=await app.call('/api/gameplay?module=stage');assert.equal(read.status,200);assert.equal(read.data.config.enabled,false);assert.equal((await app.call('/api/gameplay/config',{body:{module:'stage',config:{enabled:true}}})).status,200);const parameters={config:{enabled:true,retryDelaySeconds:10,maxAttempts:2,maxStage:null}},surveyed=await app.call('/api/gameplay/survey',{body:{module:'stage',parameters}});assert.equal(surveyed.status,200);const action=surveyed.data.view.candidates[0];assert.equal(action.executable,true);const p=await app.call('/api/operations/plan',{body:{module:'stage',mode:'Manual',parameters,selections:[action.actionId]}});assert.equal(p.status,200);assert.deepEqual(p.data.resourceBudget,[]);assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,0);const permit=await app.approve(p.data);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const history=(await app.call('/api/operations/history')).data.runs[0];assert.equal(history.finalStatus,'SUCCESS');assert.equal(history.actions[0].verification.status,'CONFIRMED');assert.deepEqual(app.requests.filter(r=>r.name==='ChallengeStageRequest').map(r=>r.body.stage),[41,42]);const runner=session.stageRunner;assert.ok(runner);assert.equal(runner.getStatus().nextStage,43);assert.equal(session.stageClient,session.client);assert.equal(app.counts().clients,0);}finally{await app.close();}});


test('disconnect cancels a running Workflow and clears its owner before the same Session reconnects', async () => {
  const app = await harness();
  try {
    const session = app.ready('A'), oldClient = session.client, generation = session.generation;
    await app.call('/api/workflows');
    const waiting = graph('disconnect-wait', [{ id: 's', type: 'START' }, { id: 'w', type: 'WAIT', durationMs: 60000 }, { id: 'e', type: 'STOP' }], [{ from: 's', to: 'w' }, { from: 'w', to: 'e' }]);
    assert.equal((await app.call('/api/workflows/start', { body: { graph: waiting } })).status, 200);
    const previous = await waitForWorkflow(app, 'WAITING');
    assert.equal(session.workflowOwner, previous.status.runId);
    const disconnected = await app.call('/api/disconnect', { body: {} });
    assert.equal(disconnected.status, 200);
    await waitForWorkflow(app, 'CANCELLED');
    assert.equal(app.sessions.get('A'), session);
    assert.equal(session.generation, generation + 1);
    assert.equal(session.workflowOwner, null, 'generation changes must synchronously invalidate the previous Workflow owner');
    assert.equal(session.busy, null);
    assert.equal(oldClient.connected, false);

    // Restore a synthetic transport onto the same Session object; no game client is created.
    const replacement = app.ready('A');
    Object.assign(session, { client: replacement.client, player: replacement.player, abort: new AbortController(), state: 'READY' });
    app.sessions.set('A', session);
    const restarted = await app.call('/api/workflows/start', { body: { graph: stoppedGraph('after-disconnect') } });
    assert.equal(restarted.status, 200);
    const complete = await waitForWorkflow(app, 'COMPLETED');
    assert.notEqual(complete.status.runId, previous.status.runId);
    assert.equal(session.workflowOwner, null);
    assert.equal(session.busy, null);
    assert.equal(app.requests.length, 0);
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});



for (const change of [
  { name: 'account becomes busy', code: 'ACCOUNT_BUSY', apply: session => { session.busy = 'synthetic-other-task'; }, restore: session => { session.busy = null; } },
  { name: 'Session generation changes', code: 'CANCELLED', apply: session => { session.generation++; }, restore: () => {} },
]) test('legacy Stage start rechecks safety after formation await when ' + change.name, async () => {
  const app = await harness({ includeStage: true });
  let unblock, reached;
  const gate = new Promise(resolve => { unblock = resolve; }), entered = new Promise(resolve => { reached = resolve; });
  const original = app.operations.assertFormationReady;
  try {
    const session = app.ready('A');
    const body = { confirm: true, config: { enabled: true, retryDelaySeconds: 10, maxAttempts: 1, maxStage: null } };
    const stageRead = await app.call('/api/stages');
    assert.equal(stageRead.status, 200);
    assert.ok(stageRead.data.csrfToken, 'legacy start uses CSRF issued by the actual Stage read route');
    app.operations.assertFormationReady = () => { reached(); return gate; };
    const pending = app.call('/api/stages/start', { body });
    await Promise.race([entered, pending.then(result => { throw Error('Stage rejected before formation preflight: ' + JSON.stringify(result)); })]);
    change.apply(session);
    unblock(null);
    const rejected = await pending;
    assert.equal(rejected.status, 409);
    assert.equal(rejected.data.code, change.code);
    assert.equal(app.requests.filter(row => row.name === 'ChallengeStageRequest').length, 0);
    change.restore(session);
    app.operations.assertFormationReady = original;
    const started = await app.call('/api/stages/start', { body });
    assert.equal(started.status, 200);
    await session.stageRunner.completion;
    assert.deepEqual(app.requests.filter(row => row.name === 'ChallengeStageRequest').map(row => row.body.stage), [41]);
    assert.equal(session.stageRunner.getStatus().stopKind, 'COMPLETED');
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { unblock(null); app.operations.assertFormationReady = original; await app.close(); }
});

test('explicitly reapplying the complete current formation establishes proof for a bounded Stage Function', async () => {
  const app = await harness({ includeStage: true });
  try {
    const session = app.ready('A');
    assert.equal((await app.enable()).status, 200);
    const parameters = { presetId: 1, heroPositions: initial().heroPositions };
    const surveyed = await app.call('/api/gameplay/survey', { body: { module: 'formation', parameters } });
    assert.equal(surveyed.status, 200);
    const candidate = surveyed.data.view.candidates[0];
    assert.equal(candidate.executable, true);
    const planned = await app.call('/api/operations/plan', { body: { module: 'formation', mode: 'Manual', parameters, selections: [candidate.actionId] } });
    assert.equal(planned.status, 200);
    const approved = await app.approve(planned.data);
    assert.equal((await app.call('/api/operations/execute', { body: approved.data })).status, 200);
    await app.operations.settle('A');
    let history = (await app.call('/api/operations/history')).data.runs;
    const formationRun = history.find(row => row.planSummary.batchId === planned.data.batchId);
    assert.equal(formationRun.finalStatus, 'SUCCESS');
    assert.equal(formationRun.actions[0].verification.status, 'CONFIRMED');
    const saved = app.requests.filter(row => row.name === 'SaveFormationRequest');
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].body.formation, initial());

    assert.equal((await app.call('/api/gameplay/config', { body: { module: 'stage', config: { enabled: true } } })).status, 200);
    const stageParameters = { config: { enabled: true, retryDelaySeconds: 10, maxAttempts: 1, maxStage: null, formation: { enabled: true, presetId: 1 } } };
    const stageSurvey = await app.call('/api/gameplay/survey', { body: { module: 'stage', parameters: stageParameters } });
    assert.equal(stageSurvey.status, 200);
    const stageAction = stageSurvey.data.view.candidates[0];
    assert.equal(stageAction.executable, true);
    const stagePlan = await app.call('/api/operations/plan', { body: { module: 'stage', mode: 'Manual', parameters: stageParameters, selections: [stageAction.actionId] } });
    assert.equal(stagePlan.status, 200);
    const stagePermit = await app.approve(stagePlan.data);
    assert.equal((await app.call('/api/operations/execute', { body: stagePermit.data })).status, 200);
    await app.operations.settle('A');
    history = (await app.call('/api/operations/history')).data.runs;
    const stageRun = history.find(row => row.planSummary.batchId === stagePlan.data.batchId);
    assert.equal(stageRun.finalStatus, 'SUCCESS');
    assert.equal(stageRun.actions[0].verification.status, 'CONFIRMED');
    assert.deepEqual(app.requests.filter(row => row.name === 'ChallengeStageRequest').map(row => row.body.stage), [41]);
    assert.equal(session.stageRunner.getStatus().nextStage, 42);
    assert.equal(session.stageClient, session.client);
    assert.deepEqual(app.counts(), { clients: 0, collections: 0 });
  } finally { await app.close(); }
});

test('real Alliance adapter uses the existing API gates, exact tech cost and authoritative point deduction',async()=>{const app=await harness({includeAlliance:true});try{app.ready('A');await app.call('/api/gameplay?module=alliance');assert.equal((await app.call('/api/gameplay?module=alliance')).data.config.tech,false);await app.enable();const p=await app.plan();assert.equal(p.status,200);assert.deepEqual(p.data.resourceBudget,[{id:'公会科技点',num:2400}]);assert.deepEqual(p.data.actions[0].target,{techId:10101,targetLevel:2});assert.equal(p.data.actions[0].action,undefined);assert.equal(app.requests.filter(r=>r.name==='UpgradeGuildTechRequest').length,0);const permit=await app.approve(p.data);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const writes=app.requests.filter(r=>r.name==='UpgradeGuildTechRequest');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{techId:10101});assert.equal(writes[0].options.mutate,true);const history=(await app.call('/api/operations/history')).data.runs[0];assert.equal(history.finalStatus,'SUCCESS');assert.equal(history.actions[0].verification.status,'CONFIRMED');assert.deepEqual(history.actions[0].stages.map(r=>r.stage),['SURVEY','RESOURCE_PREFLIGHT','DISPATCH_INTENT','DISPATCHED','RESPONSE','VERIFY','VERIFIED']);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.equal((await app.call('/api/gameplay?module=alliance',{id:'B'})).data.config.tech,false);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}});
for(const options of [{unconfirmed:true},{badTechReply:true}])test('Alliance response does not substitute for exact authoritative confirmation '+JSON.stringify(options),async()=>{const app=await harness({includeAlliance:true,...options});try{const session=app.ready('A');await app.enable();const p=await app.plan(),permit=await app.approve(p.data);await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].verification.status,'UNCONFIRMED');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(session.client.uncertainWrites.has('UpgradeGuildTechRequest'),true);assert.equal((await app.call('/api/gameplay?module=alliance')).data.status.blocked,true);assert.equal(app.requests.filter(r=>r.name==='UpgradeGuildTechRequest').length,1);}finally{await app.close();}});
test('Alliance rechecks trusted world/season after authorization and never permits caller-supplied stage or arbitrary request',async()=>{const app=await harness({includeAlliance:true});try{const session=app.ready('A');await app.enable();for(const parameters of [{techId:10101,targetLevel:2,stage:0},{techId:10101,targetLevel:2,worldId:1000001},{request:'UpgradeGuildTechRequest'}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'alliance',parameters}})).status,400);const p=await app.plan(),permit=await app.approve(p.data);session.player={...session.player,worldId:2000001};const denied=await app.call('/api/operations/execute',{body:permit.data});assert.equal(denied.status,409);assert.equal(denied.data.code,'STALE_PLAN');await app.operations.settle('A');assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);assert.equal(app.requests.filter(r=>r.name==='UpgradeGuildTechRequest').length,0);}finally{await app.close();}});

test('heroes HTTP cached module stays default off and exact-account scoped; legacy run stays 403',async()=>{
 const app=await harness({includeHeroes:true});
 try{
  for(const id of [null,'synthetic-A','missing'])assert.equal((await app.call('/api/gameplay?module=heroes',{id})).status,id===null?400:404);
  const cached=await app.call('/api/gameplay?module=heroes');assert.equal(cached.status,200);assert.equal(cached.data.config.enabled,false);assert.equal(cached.data.view,null);assert.equal(app.sessions.size,0);
  assert.equal((await app.call('/api/heroes/run',{body:{confirm:true}})).status,403);
  app.ready('A');const surveyed=await app.survey();assert.equal(surveyed.status,200);assert.equal(surveyed.data.view.candidates[0].executable,false);assert.equal(surveyed.data.view.candidates[0].blockedReason,'HERO_MODULE_DISABLED');
  await app.enable();assert.equal((await app.call('/api/gameplay?module=heroes',{id:'B'})).data.config.enabled,false);
  assert.equal((await app.call('/api/heroes/run',{body:{confirm:true,parameters:{heroId:'tank',action:'level'}}})).data.code,'READ_ONLY_ROUTE');
  assert.equal(app.requests.some(row=>/^Hero(Level|Star|Skill)/.test(row.name)),false);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('heroes HTTP enforces origin CSRF account and strict fields before business reads',async()=>{
 const app=await harness({includeHeroes:true});
 try{
  app.ready('A');await app.call('/api/gameplay?module=heroes');
  const parameters={heroId:'tank',action:'level'};
  for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'forged'}},{headers:{origin:'https://example.invalid'}},{headers:{host:'evil.invalid'}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{'content-type':'text/plain'}}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'heroes',parameters},...extra})).status,403);
  for(const id of [null,'missing'])assert.equal((await app.call('/api/gameplay/survey',{id,body:{module:'heroes',parameters}})).status,id===null?400:404);
  for(const bad of [{...parameters,count:2},{...parameters,request:'HeroLevelUpRequest'},{...parameters,body:{heroId:'tank'}},{...parameters,allowPaid:true},{...parameters,skillIdx:1},{heroId:'tank',action:'skill',skillIdx:0},{heroId:'tank',action:'skill',skillIdx:5},{heroId:'tank',action:'star',allowUniversal:1}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'heroes',parameters:bad}})).status,400);
  for(const extra of [{request:'HeroLevelUpRequest'},{body:{}},{allowPaid:true}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'heroes',parameters,...extra}})).status,400);
  assert.equal((await app.call('/api/gameplay/config',{body:{module:'heroes',config:{enabled:true,allowPaid:true}}})).status,400);
  assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const action of ['level','star','skill'])test('heroes HTTP '+action.toUpperCase()+' uses exact plan permit, single request and confirmed history',async()=>{
 const app=await harness({includeHeroes:true});
 try{
  const session=app.ready('A');if(action==='skill')session.heroState.heroes[0].star=2;
  await app.enable();const parameters={heroId:'tank',action,...(action==='skill'?{skillIdx:2}:{})},planned=await app.plan(parameters);assert.equal(planned.status,200);
  const p=planned.data;assert.equal(p.actions.length,1);assert.equal(p.actions[0].actionType,action.toUpperCase());assert.equal(p.actions[0].action,undefined);
  assert.deepEqual(p.resourceBudget,[{id:action==='level'?'英雄经验':action==='star'?'tank碎片':'技能书',num:action==='skill'?4:5}]);
  assert.equal((await app.call('/api/operations/execute',{body:{batchId:p.batchId,confirm:true}})).status,400);
  assert.equal((await app.approve({...p,resourceBudget:[{id:p.resourceBudget[0].id,num:0}]})).status,403);
  assert.equal(app.requests.filter(row=>/^Hero(Level|Star|Skill)/.test(row.name)).length,0);
  const permit=await app.approve(p);assert.equal(permit.status,200);
  app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
  const writes=app.requests.filter(row=>/^Hero(Level|Star|Skill)/.test(row.name));assert.equal(writes.length,1);assert.equal(writes[0].id,'A');
  assert.deepEqual(writes[0].body,action==='level'?{heroId:'tank'}:action==='star'?{heroId:'tank',universal:false}:{heroId:'tank',skillIdx:2});
  const record=(await app.call('/api/operations/history')).data.runs[0],row=record.actions[0];assert.equal(record.finalStatus,'SUCCESS');assert.equal(row.verification.status,'CONFIRMED');assert.equal(row.result,'SUCCESS');assert.equal(row.dispatched,true);assert.equal(row.beforeInventoryReliable,true);assert.equal(row.afterInventoryReliable,true);
  assert.equal(row.beforeState.heroId,'tank');assert.equal(row.afterState.heroId,'tank');assert.equal(row.afterState.power,'9007199254740993');assert.equal(row.stages.some(value=>value.stage==='VERIFIED'),true);
  assert.equal(record.runBudget.state,'CLOSED');assert.equal(record.runBudget.resumable,false);assert.equal(record.authorizationSummary.batchId,p.batchId);
  assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.equal((await app.call('/api/heroes/run',{body:{confirm:true}})).status,403);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('heroes typed STAR reply without authoritative effect stays UNKNOWN and blocks another write',async()=>{
 const app=await harness({includeHeroes:true,unconfirmed:true});
 try{
  const session=app.ready('A');await app.enable();const planned=await app.plan({heroId:'tank',action:'star'}),permit=await app.approve(planned.data);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
  const record=(await app.call('/api/operations/history')).data.runs[0],row=record.actions[0];assert.equal(row.requestStatus,'SUCCESS');assert.equal(record.finalStatus,'UNKNOWN');assert.equal(row.verification.status,'UNCONFIRMED');assert.equal(row.unresolvedWrite,true);
  assert.equal(record.runBudget.state,'CLOSED');assert.equal(record.runBudget.outcome,'UNKNOWN');assert.deepEqual(record.runBudget.reserved.resources,[{id:'tank碎片',num:5}]);assert.equal(session.client.uncertainWrites.has('HeroStarUpRequest'),true);
  assert.equal((await app.call('/api/gameplay?module=heroes')).data.status.blocked,true);assert.equal((await app.survey({heroId:'tank',action:'star'})).data.code,'RESPONSE_UNCERTAIN');
  assert.equal(app.requests.filter(row=>row.name==='HeroStarUpRequest').length,1);assert.equal((await app.call('/api/heroes/run',{body:{confirm:true}})).status,403);
 }finally{await app.close();}
});

test('heroes HTTP STOP after dispatch keeps late effect UNKNOWN and invalidates the permit',async()=>{
 const app=await harness({includeHeroes:true});let finishWatch;
 try{
  const session=app.ready('A');await app.enable();const planned=await app.plan(),permit=await app.approve(planned.data);
  const original=session.client.sendWatch.bind(session.client);let reached;const sent=new Promise(resolve=>{reached=resolve;});
  session.client.sendWatch=async(...args)=>{await original(...args);reached();return new Promise(resolve=>{finishWatch=resolve;});};
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await sent;
  assert.equal((await app.call('/api/operations/stop',{body:{}})).status,200);await app.operations.settle('A');
  let record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(record.actions[0].verification.status,'UNCONFIRMED');
  finishWatch({status:'SUCCESS'});await Promise.resolve();record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].result,'UNKNOWN');
  assert.equal(app.requests.filter(row=>row.name==='HeroLevelUpRequest').length,1);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);
 }finally{finishWatch?.({status:'UNKNOWN'});await app.close();}
});

test('heroes HTTP blocks universal exchange and rejects stale exact state despite stable selector',async()=>{
 const app=await harness({includeHeroes:true});
 try{
  const session=app.ready('A');await app.enable();const blocked=await app.survey({heroId:'tank',action:'star',allowUniversal:true});assert.equal(blocked.status,200);assert.equal(blocked.data.view.candidates[0].blockedReason,'UNIVERSAL_EXCHANGE_BLOCKED_EVIDENCE');
  const first=await app.plan(),permit=await app.approve(first.data);session.heroState.heroes[0].level=2;
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');assert.equal((await app.call('/api/operations/history')).data.runs[0].finalStatus,'NOT_EXECUTED');
  assert.equal(app.requests.filter(row=>/^Hero(Level|Star|Skill)/.test(row.name)).length,0);
  const next=await app.plan();assert.equal(next.data.actions[0].actionId,first.data.actions[0].actionId);assert.notEqual(next.data.planHash,first.data.planHash);assert.equal(next.data.actions[0].beforeState.level,2);assert.deepEqual(next.data.resourceBudget,[{id:'英雄经验',num:8}]);assert.equal((await app.approve(first.data)).data.code,'STALE_PLAN');
 }finally{await app.close();}
});

test('unified preparation is offline and scoped while old raw write routes stay closed',async()=>{
 const app=await harness();try{
  await app.call();
  const payload={entry:'loop',world:[{module:'formation',parameters:{presetId:2},selection:'exact-synthetic'}],rounds:2,budget:{resources:[],quotas:[],uids:[]}};
  const prepared=await app.call('/api/workflows/prepare',{body:payload});assert.equal(prepared.status,200);assert.equal(prepared.data.accountId,'A');
  assert.deepEqual(prepared.data.graph.nodes.filter(n=>n.type==='ACTION').map(n=>n.module),['formation','formation']);
  assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);
  const invalid=await app.call('/api/workflows/prepare',{body:{...payload,rounds:0}});assert.equal(invalid.status,400);
  for(const route of ['/api/tasks/run','/api/dailies/run','/api/loop/start']){const denied=await app.call(route,{body:{confirm:true}});assert.equal(denied.status,403);assert.equal(denied.data.code,'READ_ONLY_ROUTE');}
  const csrf=await app.call('/api/workflows/prepare',{body:payload,headers:{'x-cw-csrf':'wrong'}});assert.equal(csrf.status,403);
 }finally{await app.close();}
});

for(const unconfirmed of [false,true])test('hero explicit fragment HTTP authorizes exact quantity with '+(unconfirmed?'durable UNKNOWN':'confirmed 1:1 inventory'),async()=>{
 const app=await harness({includeHeroes:true,includeFragments:true,unconfirmed});
 try{
  const t=app.ready('A'),heroes=structuredClone(t.heroState.heroes);await app.enable();const parameters={heroId:'tank',action:'fragment-exchange',num:7};
  const start=app.requests.length;for(const extra of [{num:0},{num:2147483648},{fragItemId:'tank碎片'},{allowUniversal:true}])assert.equal((await app.survey({...parameters,...extra})).status,400);assert.equal(app.requests.length,start);
  const p=await app.plan(parameters);assert.equal(p.status,200);assert.deepEqual(p.data.resourceBudget,[{id:'蓝卡万能碎片',num:7}]);assert.equal(p.data.actions[0].action,undefined);
  assert.equal((await app.approve({...p.data,resourceBudget:[{id:'蓝卡万能碎片',num:6}]})).status,403);assert.equal(app.requests.filter(row=>row.name==='HeroFragExchangeRequest').length,0);
  const permit=await app.approve(p.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
  const writes=app.requests.filter(row=>row.name==='HeroFragExchangeRequest');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{heroId:'tank',fragItemId:'tank碎片',num:7});assert.equal(writes[0].response,null);
  const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.equal(record.actions[0].verification.status,unconfirmed?'UNCONFIRMED':'CONFIRMED');assert.deepEqual(t.heroState.heroes,heroes);assert.deepEqual(record.runBudget.reserved.resources,[{id:'蓝卡万能碎片',num:7}]);
  if(unconfirmed){assert.equal((await app.survey(parameters)).data.code,'RESPONSE_UNCERTAIN');assert.equal(record.actions[0].unresolvedWrite,true);}else{assert.equal(t.heroState.stock.get('tank碎片'),17);assert.equal(t.heroState.stock.get('蓝卡万能碎片'),13);}
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of [false,true])test('farm single-plot HTTP uses shared exact authorization and '+(unconfirmed?'durable UNKNOWN':'typed inventory confirmation'),async()=>{
 const app=await harness({includeFarm:true,unconfirmed});try{const session=app.ready('A');await app.enable();const parameters={buildingId:'1农田',action:'harvest'},start=app.requests.length;
 for(const extra of [{all:true},{productId:'小麦'},{buildingId:['1农田','2农田']},{costs:[]}])assert.equal((await app.survey({...parameters,...extra})).status,400);assert.equal(app.requests.length,start);
 const p=await app.plan();assert.equal(p.status,200);assert.deepEqual(p.data.resourceBudget,[]);assert.equal(p.data.budgetClaims.uids.length,1);assert.equal(p.data.budgetClaims.uids[0].type,'farm-harvest');assert.equal(p.data.actions[0].action,undefined);assert.equal(p.data.actions[0].beforeState.farm.ripeTime,1700001800);
 const permit=await app.approve(p.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
 const writes=app.requests.filter(row=>row.name==='FarmHarvestRequest');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{buildingId:['1农田']});assert.equal(writes[0].response,'FarmHarvestResponse');assert.equal(writes[0].options.mutate,true);const run=(await app.call('/api/operations/history')).data.runs[0];assert.equal(run.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.equal(run.actions[0].verification.status,unconfirmed?'UNCONFIRMED':'CONFIRMED');assert.equal(run.runBudget.reserved.uids.length,1);assert.equal(session.farmState.stock.get('小麦'),unconfirmed?5:15);assert.equal(session.farmState.stock.get('小麦种子'),3);if(!unconfirmed)assert.equal(run.actions[0].responseEvidence.num,10);
 assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of [false,true])test('expedition HTTP uses original CSRF/plan/permit/history with isolated '+(unconfirmed?'UNKNOWN':'confirmed')+' result',async()=>{
 const app=await harness({includeExpedition:true,unconfirmed});try{
 app.ready('A');await app.enable();
 assert.equal((await app.call('/api/gameplay/survey',{body:{module:'formation',parameters:{mode:'expedition',raidId:1001}},authorized:false})).status,403);
 assert.equal((await app.survey({mode:'expedition'})).status,400);
 const p=await app.plan();assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(p.data.actions[0].actionType,'SAVE_EXPEDITION');assert.deepEqual(p.data.resourceBudget,[]);
 assert.equal(app.requests.filter(r=>r.name==='ExpeditionSaveFormationRequest').length,0);
 const permit=await app.approve(p.data);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);
 await app.operations.settle('A');const run=(await app.call('/api/operations/history')).data.runs[0];assert.equal(run.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.equal(run.actions[0].verification.status,unconfirmed?'UNCONFIRMED':'CONFIRMED');
 const writes=app.requests.filter(r=>r.name==='ExpeditionSaveFormationRequest');assert.equal(writes.length,1);assert.equal(writes[0].body.raidId,1001);assert.equal(writes[0].body.formation.petUid,'9007199254740993');assert.equal(app.requests.some(r=>r.name==='SaveFormationRequest'),false);
 assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of[false,true])test('material packs HTTP uses existing CSRF/exact permit and confirmed inventory or UNKNOWN '+unconfirmed,async()=>{
 const app=await harness({includeMaterialPacks:true,unconfirmed});try{const session=app.ready('A');const read=await app.call('/api/gameplay?module=material-packs');assert.equal(read.status,200);assert.equal(read.data.config.enabled,false);assert.equal((await app.call('/api/gameplay?module=material-packs',{id:'B'})).data.config.enabled,false);
 assert.equal((await app.call('/api/gameplay/config',{body:{module:'material-packs',config:{enabled:true}},authorized:false})).status,403);await app.enable();
 for(const parameters of[{packId:'原料自选包',itemId:'RUBY',num:1},{packId:'原料自选包',itemId:'木材'},{request:'SelectPackRequest'}])assert.equal((await app.survey(parameters)).status,400);
 const plan=await app.plan();assert.equal(plan.status,200);assert.deepEqual(plan.data.resourceBudget,[{id:'原料自选包',num:2}]);assert.equal(plan.data.actions[0].action,undefined);assert.equal(app.requests.filter(r=>r.name==='SelectPackRequest').length,0);
 const permit=await app.approve(plan.data);assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data,authorized:false})).status,403);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
 const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.equal(app.requests.filter(r=>r.name==='SelectPackRequest').length,1);assert.deepEqual(app.requests.find(r=>r.name==='SelectPackRequest').body,{itemId:'原料自选包',selectItemId:'木材',num:2});
 const reused=await app.call('/api/operations/execute',{body:permit.data});assert.equal(reused.status,403);assert.equal(reused.data.code,'AUTHORIZATION_REQUIRED');assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed){assert.equal((await app.survey()).status,409);assert.equal(session.materialStock.has('木材'),false);}else assert.equal(session.materialStock.get('木材'),2);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of[false,true])test('daily task reward HTTP shares exact CSRF/permit/period UID/history '+unconfirmed,async()=>{
 const app=await harness({includeDailyReward:true,unconfirmed});try{
  const session=app.ready('A');assert.equal((await app.call('/api/gameplay?module=task-rewards')).data.config.enabled,false);await app.enable();
  const start=app.requests.length;
  for(const p of[{kind:'daily'},{kind:'daily',taskId:0},{kind:'daily',taskId:1001,request:'InjectedRequest'}])assert.equal((await app.survey(p)).status,400);
  assert.equal(app.requests.length,start);
  const plan=await app.plan();assert.equal(plan.status,200);assert.deepEqual(plan.data.resourceBudget,[]);assert.equal(plan.data.actions[0].action,undefined);assert.deepEqual(plan.data.budgetClaims.uids,[{type:'task-reward',id:'daily:2000:1001'}]);
  const denied=await app.call('/api/operations/authorize',{body:{batchId:plan.data.batchId,planHash:plan.data.planHash},authorized:false});assert.equal(denied.status,403);
  assert.equal(app.requests.filter(r=>r.name==='DrawDailyTaskRewardRequest').length,0);
  const permit=await app.approve(plan.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
  const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.equal(record.actions[0].verification.status,unconfirmed?'UNCONFIRMED':'CONFIRMED');
  const writes=app.requests.filter(r=>r.name==='DrawDailyTaskRewardRequest');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{id:1001});assert.equal(writes[0].response,'DrawDailyTaskRewardResponse');
  assert.equal(session.dailyState.dailyActivity,unconfirmed?40:45);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);
  if(unconfirmed)assert.equal((await app.survey()).status,409);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('Dailies HTTP preparation compiles claim intent offline and preserves unsupported perform blockers',async()=>{
 const app=await harness({includeDailyReward:true});try{
  await app.call('/api/workflows');
  const payload={entry:'dailies',dailies:[{taskId:1001,action:'claim'},{taskId:1001}],budget:{resources:[],quotas:[],uids:[]}};
  const p=await app.call('/api/workflows/prepare',{body:payload});assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(p.data.accountId,'A');
  const actions=p.data.graph.nodes.filter(n=>n.type==='ACTION');assert.equal(actions.length,1);assert.equal(actions[0].module,'task-rewards');assert.deepEqual(actions[0].parameters,{kind:'daily',taskId:1001});
  assert.deepEqual(p.data.blocked,[{phase:'dailies',index:1,reason:'DAILY_ACTION_CONTRACT_UNVERIFIED',taskId:1001}]);
  assert.equal(app.sessions.size,0);assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
  assert.equal((await app.call('/api/workflows/prepare',{body:payload,authorized:false})).status,403);
  const bad={...payload,dailies:[{taskId:1001,action:'claim',parameters:{request:'DrawDailyTaskRewardRequest'}}]};assert.equal((await app.call('/api/workflows/prepare',{body:bad})).status,400);
 }finally{await app.close();}
});

for(const unconfirmed of[false,true])test('daily activity HTTP shares original exact tier authorization, independent net income or UNKNOWN '+unconfirmed,async()=>{
 const app=await harness({includeDailyActivity:true,unconfirmed});try{
  const session=app.ready('A'),cached=await app.call('/api/gameplay?module=task-rewards');assert.equal(cached.data.config.enabled,false);await app.enable();
  const before=app.requests.length;for(const parameters of[{kind:'daily-activity',taskId:1},{kind:'daily-activity',tierId:0},{kind:'daily-activity',tierId:1,index:[1,2]},{kind:'weekly-activity',tierId:1}])assert.equal((await app.survey(parameters)).status,400);assert.equal(app.requests.length,before);
  const plan=await app.plan();assert.equal(plan.status,200,JSON.stringify(plan.data));assert.deepEqual(plan.data.resourceBudget,[]);assert.equal(plan.data.actions[0].action,undefined);assert.equal(plan.data.actions[0].capabilityId,'cw.task-rewards');assert.ok(cached.data.functions.find(r=>r.id==='task-rewards').capabilities.includes('C516'));assert.deepEqual(plan.data.budgetClaims.uids,[{type:'daily-activity-reward',id:'2000:1'}]);assert.equal(app.requests.filter(r=>r.name==='DrawDailyRewardRequest').length,0);
  const permit=await app.approve(plan.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data,authorized:false})).status,403);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
  const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.equal(record.actions[0].verification.status,unconfirmed?'UNCONFIRMED':'CONFIRMED');const writes=app.requests.filter(r=>r.name==='DrawDailyRewardRequest');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{index:[1]});assert.equal(session.dailyActivityStock.get('加速器'),unconfirmed?undefined:120);assert.deepEqual(session.dailyState.dailyRewardClaimed,unconfirmed?[]:[1]);assert.equal(session.dailyState.dailyActivity,40);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed)assert.equal((await app.survey()).status,409);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});


test('activity unified HTTP prepares exact tier without a session or authorization and rejects weekly or driver injection',async()=>{
 const app=await harness({includeDailyActivity:true});try{
  await app.call('/api/workflows');
  for(const entry of['tasks','dailies','loop']){
   const phase=entry==='tasks'?'tasks':'dailies',row=phase==='tasks'?{kind:'daily-activity',tierId:2}:{kind:'daily-activity',tierId:2,action:'claim'},payload={entry,[phase]:[row],budget:{resources:[],quotas:[],uids:[]}};
   const prepared=await app.call('/api/workflows/prepare',{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.accountId,'A');assert.deepEqual(prepared.data.blocked,[]);const action=prepared.data.graph.nodes.find(n=>n.type==='ACTION');assert.equal(action.module,'task-rewards');assert.deepEqual(action.parameters,{kind:'daily-activity',tierId:2});
   assert.equal((await app.call('/api/workflows/prepare',{body:payload,authorized:false})).status,403);
  }
  for(const row of[{kind:'daily-activity',tierId:2},{kind:'daily-activity',tierId:2,action:'perform'},{kind:'daily-activity',tierId:2,action:'claim',taskId:1001},{kind:'daily-activity',tierId:2,action:'claim',parameters:{request:'DrawDailyRewardRequest'}},{kind:'weekly-activity',tierId:2,action:'claim'}])assert.equal((await app.call('/api/workflows/prepare',{body:{entry:'dailies',dailies:[row],budget:{resources:[],quotas:[],uids:[]}}})).status,400);
  assert.equal(app.sessions.size,0);assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});


for(const unconfirmed of[false,true])test('free gift HTTP binds exact free pack, authorization and full RUBY net income '+unconfirmed,async()=>{
 const app=await harness({includeDailyGift:true,unconfirmed});try{
  const session=app.ready('A');await app.enable();const before=app.requests.length;
  for(const parameters of[{kind:'daily-gift'},{kind:'daily-gift',packId:'礼包1'},{kind:'daily-gift',packId:'合并礼包'},{kind:'daily-gift',packId:'赠礼',taskId:1}])assert.equal((await app.survey(parameters)).status,400);assert.equal(app.requests.length,before);
  const plan=await app.plan();assert.equal(plan.status,200,JSON.stringify(plan.data));assert.deepEqual(plan.data.resourceBudget,[]);assert.equal(app.requests.filter(r=>r.name==='GotFreeDailyPackRequest').length,0);
  const permit=await app.approve(plan.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data,authorized:false})).status,403);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.deepEqual(app.requests.filter(r=>r.name==='GotFreeDailyPackRequest').map(r=>r.body),[{packId:'赠礼'}]);assert.equal(session.giftResources.find(r=>r.res===4).amount,unconfirmed?50:60);
  assert.deepEqual(session.giftState.drawnPack,unconfirmed?[]:['赠礼']);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed)assert.equal((await app.survey()).status,409);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('existing Workflow API stores and simulates optional run boundaries with strict budgets and account isolation offline',async()=>{
 const app=await harness();try{
  await app.call();const g=stoppedGraph('bounded-http');g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:60000,maxActions:0,modules:[]};
  assert.equal((await app.call('/api/workflows/save',{body:{graph:g},authorized:false})).status,403);assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);
  const read=await app.call('/api/workflows');assert.deepEqual(read.data.graphs.find(row=>row.id===g.id).runPolicy,g.runPolicy);assert.equal((await app.call('/api/workflows',{id:'B'})).data.graphs.some(row=>row.id===g.id),false);
  const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.equal(sim.data.runtimeCreated,false);
  for(const change of [bad=>delete bad.budget,bad=>bad.runPolicy.maxDurationMs=0,bad=>bad.runPolicy.maxActions=201,bad=>bad.runPolicy.allowRetry=true,bad=>bad.runPolicy.modules=['unknown']]){const bad=structuredClone(g);change(bad);assert.equal((await app.call('/api/workflows/save',{body:{graph:bad}})).status,400);assert.equal((await app.call('/api/workflows/simulate',{body:{graph:bad}})).status,400);}
  assert.deepEqual((await app.call('/api/workflows')).data.graphs.find(row=>row.id===g.id).runPolicy,g.runPolicy);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);
 }finally{await app.close();}
});

for(const entry of ['tasks','dailies','loop'])test(entry+' HTTP prepares the existing bounded graph offline and rejects scope expansion or malformed run policy',async()=>{
 const app=await harness({includeDailyReward:true});try{
  await app.call();const payload={entry,budget:{resources:[],quotas:[],uids:[]},runPolicy:{maxDurationMs:1000,maxActions:1,modules:['task-rewards']},...(entry==='tasks'?{tasks:[{kind:'main',taskId:1}]}:{dailies:[{taskId:1001,action:'claim'}],...(entry==='loop'?{rounds:2}:{})})};
  const prepared=await app.call('/api/workflows/prepare',{body:payload});assert.equal(prepared.status,200);assert.deepEqual(prepared.data.graph.runPolicy,payload.runPolicy);assert.deepEqual(prepared.data.graph.budget,payload.budget);assert.equal(prepared.data.graph.preparation.entry,entry);
  const save=await app.call('/api/workflows/save',{body:{graph:prepared.data.graph}});assert.equal(save.status,200);
  for(const policy of [null,{...payload.runPolicy,modules:[]},{...payload.runPolicy,maxDurationMs:0},{...payload.runPolicy,allowRetry:true}])assert.equal((await app.call('/api/workflows/prepare',{body:{...payload,runPolicy:policy}})).status,400);
  assert.equal((await app.call('/api/workflows/prepare',{body:payload,authorized:false})).status,403);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);
 }finally{await app.close();}
});

for(const unconfirmed of [false,true])test('finite run HTTP requires exact scoped confirmation and uses existing Formation permit/history '+unconfirmed,async()=>{
 const app=await harness({unconfirmed,includeWorkflowTasks:true});try{
  const session=app.ready('A');session.player.worldId=1;await app.enable();const surveyed=await app.survey(),actionId=surveyed.data.view.candidates[0].actionId,g=graph('http-finite-run',[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:actionId},{id:'v',type:'VERIFY',module:'formation'},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]);g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:10000,maxActions:1,modules:['formation']};
  const starting=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(starting.status,200,JSON.stringify(starting.data));const waiting=await waitForWorkflow(app,'AWAITING_AUTHORIZATION'),status=waiting.status,payload={offer:status.authorizationOffer,batchId:status.plan.batchId,planHash:status.plan.planHash,confirm:true};assert.ok(payload.offer);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);
  for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}},{headers:{origin:'https://example.invalid'}}])assert.equal((await app.call('/api/workflows/authorize-run',{body:payload,...extra})).status,403);
  for(const change of [p=>p.confirm=false,p=>p.offer.accountId='B',p=>p.offer.executionContext.worldId=99,p=>p.offer.graph.runPolicy.maxActions=2,p=>p.offer.graph.nodes[1].parameters.presetId=1,p=>p.planHash='wrong']){const bad=structuredClone(payload);change(bad);assert.equal((await app.call('/api/workflows/authorize-run',{body:bad})).status,400);}
  assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);const started=await app.call('/api/workflows/authorize-run',{body:payload});assert.equal(started.status,200);let final;for(let i=0;i<40;i++){final=await app.call('/api/workflows');if(['COMPLETED','UNKNOWN','FAILED'].includes(final.data.status.status))break;await new Promise(r=>setImmediate(r));}assert.equal(final.data.status.status,unconfirmed?'UNKNOWN':'COMPLETED');assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);assert.equal(session.workflowOwner,null);
  const history=await app.call('/api/operations/history');assert.deepEqual(history.data.runs[0].authorizationSummary.workflowRunAuthorization,{runId:status.runId,graphHash:status.authorizationOffer.graphHash,approvedAt:final.data.status.runAuthorization.approvedAt});assert.equal(history.data.runs[0].finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');const detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId));assert.equal(detail.status,200);assert.deepEqual(detail.data.runAuthorization.scope,status.authorizationOffer);assert.equal(detail.data.resumable,false);
  assert.equal((await app.call('/api/workflows/authorize-run',{body:payload})).status,400);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('finite run HTTP never creates a connection and cannot grant scope to a legacy graph',async()=>{
 const app=await harness({includeWorkflowTasks:true});try{await app.call();assert.equal((await app.call('/api/workflows/authorize-run',{body:{confirm:true}})).status,409);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});app.ready('A');await app.enable();const p=await app.plan(),g=graph('legacy-manual',[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:p.data.actions[0].actionId},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'e'}]);await app.call('/api/workflows/start',{body:{graph:g}});await waitForWorkflow(app,'AWAITING_AUTHORIZATION');assert.equal((await app.call('/api/workflows/authorize-run',{body:{confirm:true}})).status,400);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,0);}finally{await app.close();}
});

test('finite repeated Workflow HTTP reuses the original graph and parent, with fresh surveys and read-only history',async()=>{
 const app=await harness({includeWorkflowTasks:true});try{
 await app.call();const g=graph('repeated-read-http',[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'formation',parameters:{presetId:2}},{id:'z',type:'STOP'}],[{from:'s',to:'q'},{from:'q',to:'z'}]);g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:10000,maxActions:0,modules:['formation'],maxRounds:3,roundIntervalMs:1};assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.equal(app.requests.length,0);assert.equal(app.sessions.size,0);
 for(const policy of [{...g.runPolicy,maxRounds:0},{...g.runPolicy,maxRounds:201},{...g.runPolicy,roundIntervalMs:60001},{maxDurationMs:1000,maxActions:0,modules:['formation'],roundIntervalMs:1}])assert.equal((await app.call('/api/workflows/save',{body:{graph:{...g,runPolicy:policy}}})).status,400);
 assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,409);app.ready('A');await app.enable();assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const status=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(status.round,3);assert.equal(status.completedRounds,3);assert.equal(status.actionPlans,0);assert.deepEqual(status.runPolicy,g.runPolicy);assert.equal(status.runBudget.reserved.resources.length,0);assert.equal(app.requests.filter(row=>row.name==='GetFormationRequest').length,3);assert.equal(app.requests.filter(row=>row.name==='SaveFormationRequest').length,0);
 const before=app.requests.length,result=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId));assert.equal(result.status,200);assert.equal(result.data.round,3);assert.equal(result.data.completedRounds,3);assert.equal(result.data.resumable,false);assert.deepEqual(result.data.waits.map(row=>[row.round,row.result]),[[1,'ROUND_WAIT_STARTED'],[1,'ROUND_WAITED'],[2,'ROUND_WAIT_STARTED'],[2,'ROUND_WAITED']]);assert.equal(app.requests.length,before);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const approval of [true,false])test('once time trigger HTTP preserves exact scope, CSRF and original permit semantics '+approval,async()=>{
 const app=await harness({includeWorkflowTasks:true});try{
 const session=app.ready('A');session.player.worldId=1;await app.enable();const surveyed=await app.survey(),g=graph('once-time-http-'+approval,[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:surveyed.data.view.candidates[0].actionId},{id:'v',type:'VERIFY',module:'formation'},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]);g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:10000,maxActions:1,modules:['formation'],schedule:{kind:'ONCE',at:new Date(Date.now()+1500).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'}};
 const before=app.requests.length;assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const simulation=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(simulation.status,200);assert.equal(simulation.data.requestsSent,0);assert.equal(app.requests.length,before);
 for(const schedule of [{...g.runPolicy.schedule,timeZone:'UTC'},{...g.runPolicy.schedule,missedPolicy:'RUN'},{...g.runPolicy.schedule,kind:'DAILY'},{...g.runPolicy.schedule,at:'2026-11-14T00:00:00Z'}])assert.equal((await app.call('/api/workflows/save',{body:{graph:{...g,runPolicy:{...g.runPolicy,schedule}}}})).status,400);
 assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const status=(await waitForWorkflow(app,'WAITING')).status,payload={offer:status.authorizationOffer,batchId:null,planHash:null,confirm:true};assert.equal(status.plan,null);assert.equal(status.trigger.state,'WAITING');assert.equal(app.requests.length,before);
 if(approval){for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}},{headers:{origin:'https://example.invalid'}}])assert.equal((await app.call('/api/workflows/authorize-run',{body:payload,...extra})).status,403);for(const mutate of [p=>p.confirm=false,p=>p.offer.accountId='B',p=>p.offer.graph.runPolicy.schedule.at=new Date(Date.now()+5000).toISOString(),p=>p.batchId='forged']){const bad=structuredClone(payload);mutate(bad);assert.equal((await app.call('/api/workflows/authorize-run',{body:bad})).status,400);}const accepted=await app.call('/api/workflows/authorize-run',{body:payload});assert.equal(accepted.status,200);assert.equal(accepted.data.status.status,'WAITING');assert.equal(app.requests.length,before);}
 let final;for(let i=0;i<200;i++){final=await app.call('/api/workflows');if(final.data.status.status===(approval?'COMPLETED':'AWAITING_AUTHORIZATION'))break;await new Promise(r=>setTimeout(r,20));}assert.equal(final.data.status.status,approval?'COMPLETED':'AWAITING_AUTHORIZATION',JSON.stringify(final.data.status));assert.equal(final.data.status.trigger.state,'FIRED');assert.ok(Date.parse(final.data.status.trigger.firedAt)>=Date.parse(g.runPolicy.schedule.at));assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,approval?1:0);
 const count=app.requests.length,detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId));assert.equal(detail.status,200);assert.deepEqual(detail.data.runPolicy.schedule,g.runPolicy.schedule);assert.equal(detail.data.trigger.state,'FIRED');assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(app.requests.length,count);if(approval)assert.equal(detail.data.nodes[0].batches[0].runAuthorizationLink.status,'MATCHED');assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('missed once time trigger HTTP skips without business survey, plan or automatic retry',async()=>{
 const app=await harness({includeWorkflowTasks:true});try{app.ready('A');await app.enable();const g=graph('once-missed-http',[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'formation',parameters:{presetId:2}},{id:'z',type:'STOP'}],[{from:'s',to:'q'},{from:'q',to:'z'}]);g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:10000,maxActions:0,modules:['formation'],schedule:{kind:'ONCE',at:new Date(Date.now()-1000).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'}};const count=app.requests.length;assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const status=(await waitForWorkflow(app,'STOPPED')).status;assert.equal(status.trigger.state,'MISSED');assert.equal(status.trace.length,0);assert.equal(status.plan,null);assert.equal(app.requests.length,count);const detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId));assert.equal(detail.data.trigger.state,'MISSED');assert.equal(detail.data.resumable,false);assert.equal(app.requests.length,count);}finally{await app.close();}
});

for(const kind of ['DAILY','WEEKLY'])test('calendar '+kind+' HTTP persists rules and binds only this concrete occurrence to original scope/permit/history',async()=>{
 const app=await harness({includeWorkflowTasks:true});try{const session=app.ready('A');session.player.worldId=1;await app.enable();const surveyed=await app.survey(),due=Date.now()+1500,local=new Date(due+8*3600000),scheduledAt=new Date(due).toISOString(),schedule={kind,localTime:local.toISOString().slice(11,23),timeZone:'Asia/Shanghai',missedPolicy:'SKIP',...(kind==='WEEKLY'?{weekDay:local.getUTCDay()||7}:{})},g=graph('calendar-http-'+kind,[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:surveyed.data.view.candidates[0].actionId},{id:'v',type:'VERIFY',module:'formation'},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]);g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:10000,maxActions:1,modules:['formation'],schedule};const count=app.requests.length;
 assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.deepEqual(sim.data.runPolicy,g.runPolicy);assert.equal(app.requests.length,count);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const status=(await waitForWorkflow(app,'WAITING')).status;assert.equal(status.authorizationOffer.scheduledAt,scheduledAt);assert.equal(status.trigger.scheduledAt,scheduledAt);assert.equal(status.trigger.playerId,String(session.player.playerId));assert.equal(app.requests.length,count);const payload={offer:status.authorizationOffer,batchId:null,planHash:null,confirm:true};
 assert.equal((await app.call('/api/workflows/authorize-run',{body:payload,headers:{'x-cw-csrf':'wrong'}})).status,403);for(const mutate of [p=>delete p.offer.scheduledAt,p=>p.offer.scheduledAt=new Date(due+1).toISOString(),p=>p.offer.graph.runPolicy.schedule.localTime='bad',p=>p.offer.executionContext.worldId=2]){const bad=structuredClone(payload);mutate(bad);assert.equal((await app.call('/api/workflows/authorize-run',{body:bad})).status,400);}const accepted=await app.call('/api/workflows/authorize-run',{body:payload});assert.equal(accepted.status,200);assert.equal(accepted.data.status.status,'WAITING');assert.equal(app.requests.length,count);
 let final;for(let i=0;i<200;i++){final=await app.call('/api/workflows');if(final.data.status.status==='COMPLETED')break;await new Promise(r=>setTimeout(r,20));}assert.equal(final.data.status.status,'COMPLETED',JSON.stringify(final.data.status));assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);const before=app.requests.length,detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId));assert.equal(detail.status,200);assert.equal(detail.data.runAuthorization.scope.scheduledAt,scheduledAt);assert.deepEqual(detail.data.runPolicy.schedule,schedule);assert.equal(detail.data.trigger.state,'FIRED');assert.equal(detail.data.nodes[0].batches[0].runAuthorizationLink.status,'MATCHED');assert.equal(detail.data.resumable,false);assert.equal(app.requests.length,before);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

async function attachVipHttpSource(session){
 const old=session.client,codec=createVipHttpCodec(heroWireProtocol);session.connectionId='event-http-connection';session.player={...session.player,playerId:'17',worldId:1};let socket;class Socket{constructor(){socket=this;this.readyState=0;}send(){}close(){this.readyState=3;}receive(name,body,seq=0){this.onmessage?.({data:codec.encode(name,seq,body)});}}
 const client=new VipHttpClient({url:'wss://example.invalid',protocol:heroWireProtocol,accountId:session.id,generation:session.generation,WebSocketImpl:Socket});client.factContext={accountId:session.id,generation:session.generation,connectionId:session.connectionId};client.on('error',()=>{});const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:'17',worldId:'1',level:1,vip:{vipLevel:1,vipExp:'0'}}});await pending;clearInterval(client.tickTimer);client.tickTimer=null;client.request=old.request.bind(old);client.uncertainWrites=old.uncertainWrites;client.markUnverifiedWrite=old.markUnverifiedWrite.bind(old);client.confirmWatchedWrite=old.confirmWatchedWrite.bind(old);session.client=client;return {client,socket};
}
for(const kind of ['VIP_LEVEL_CHANGED','PLAYER_LEVEL_CHANGED','DAILY_TASK_RESET','DAILY_TASK_PROGRESS','RESOURCE_AMOUNT_CHANGED'])for(const approval of [true,false])test('trusted business event HTTP retains CSRF, exact scope and the original single action permit '+kind+' '+approval,async()=>{
 const app=await harness({includeWorkflowTasks:true});let source;try{
 const session=app.ready('A');await app.enable();const surveyed=await app.survey(),g=graph('level-event-http-'+kind+'-'+approval,[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:surveyed.data.view.candidates[0].actionId},{id:'v',type:'VERIFY',module:'formation'},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]);g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:10000,maxActions:1,modules:['formation'],eventTrigger:kind==='RESOURCE_AMOUNT_CHANGED'?{kind,resource:'GOLD',amount:'9007199254740993'}:kind==='DAILY_TASK_PROGRESS'?{kind,taskId:1001,progress:2}:kind==='DAILY_TASK_RESET'?{kind}:{kind,level:3}};const before=app.requests.length;
 assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.equal(app.requests.length,before);const denied=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(denied.data.status.running,false);assert.equal(session.workflowOwner??null,null);assert.equal(app.requests.length,before);source=await attachVipHttpSource(session);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const status=(await waitForWorkflow(app,'WAITING')).status,payload={offer:status.authorizationOffer,batchId:null,planHash:null,confirm:true};assert.equal(status.plan,null);assert.equal(status.eventTrigger.baseline.cursor,0);assert.deepEqual(status.authorizationOffer.eventCursor,status.eventTrigger.baseline);assert.equal(app.requests.length,before);
 if(approval){for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}},{headers:{origin:'https://example.invalid'}}])assert.equal((await app.call('/api/workflows/authorize-run',{body:payload,...extra})).status,403);for(const mutate of [p=>delete p.offer.eventCursor,p=>p.offer.eventCursor.cursor++,p=>p.offer.graph.runPolicy.eventTrigger.level=4,p=>p.offer.executionContext.worldId=2,p=>p.offer.accountId='B',p=>p.batchId='forged']){const bad=structuredClone(payload);mutate(bad);assert.equal((await app.call('/api/workflows/authorize-run',{body:bad})).status,400);}assert.equal((await app.call('/api/workflows/authorize-run',{body:payload})).status,200);assert.equal(app.requests.length,before);}
 if(kind==='RESOURCE_AMOUNT_CHANGED')source.socket.receive('SCUpdateResource',{list:[{res:3,amount:'9007199254740992'}]},1);const progressEvent={name:'SCDailyTaskUpdate',seq:1,body:{task:{id:1001,progress:2,targetProgress:5,rewardClaimed:false}}};source.client.emit('message',kind==='RESOURCE_AMOUNT_CHANGED'?{name:'SCUpdateResource',seq:2,body:{list:[{res:3,amount:'9007199254740993'}]}}:kind==='DAILY_TASK_PROGRESS'?progressEvent:kind==='DAILY_TASK_RESET'?{name:'SCDailyTaskReset',seq:1,body:{dailyResetTime:1000}}:{name:'SCVipUpdate',seq:1,body:{vipLevel:3}});assert.equal((await app.call('/api/workflows')).data.status.status,'WAITING');source.socket.receive(kind==='RESOURCE_AMOUNT_CHANGED'?'SCUpdateResource':kind==='DAILY_TASK_PROGRESS'?'SCDailyTaskUpdate':kind==='DAILY_TASK_RESET'?'SCDailyTaskReset':kind==='PLAYER_LEVEL_CHANGED'?'SCPlayerExpUpdate':'SCVipUpdate',kind==='RESOURCE_AMOUNT_CHANGED'?{list:[{res:3,amount:'9007199254740993'}]}:kind==='DAILY_TASK_PROGRESS'?progressEvent.body:kind==='DAILY_TASK_RESET'?{dailyResetTime:1000}:kind==='PLAYER_LEVEL_CHANGED'?{level:3,exp:'1'}:{vipLevel:3},kind==='RESOURCE_AMOUNT_CHANGED'?2:1);let final;for(let i=0;i<100;i++){final=await app.call('/api/workflows');if(final.data.status.status===(approval?'COMPLETED':'AWAITING_AUTHORIZATION'))break;await new Promise(r=>setTimeout(r,10));}assert.equal(final.data.status.status,approval?'COMPLETED':'AWAITING_AUTHORIZATION',JSON.stringify(final.data.status));assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,approval?1:0);const count=app.requests.length,detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId));assert.equal(detail.status,200);assert.deepEqual(detail.data.runPolicy.eventTrigger,g.runPolicy.eventTrigger);assert.equal(detail.data.eventTrigger.state,'FIRED');assert.equal(detail.data.eventTrigger.event.cursor,1);assert.equal(detail.data.resumable,false);assert.equal(detail.data.readOnly,true);assert.equal(app.requests.length,count);if(approval)assert.equal(detail.data.nodes[0].batches[0].runAuthorizationLink.status,'MATCHED');assert.equal((await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId),{id:'B'})).status,404);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(source.client.listenerCount('message'),0);
 }finally{await app.close();source?.client.stop();}
});

for(const unconfirmed of[false,true])test('weekly lottery HTTP enforces exact entitlement, scoped authorization and '+(unconfirmed?'UNKNOWN':'full net settlement'),async()=>{
 const app=await harness({includeWeeklyGift:true,unconfirmed});try{
  const session=app.ready('A');await app.enable();const before=app.requests.length;
  for(const parameters of[{kind:'weekly-lottery-gift'},{kind:'weekly-lottery-gift',packId:1000},{kind:'weekly-lottery-gift',packId:'1001'},{kind:'weekly-lottery-gift',packId:'1000',taskId:1}])assert.equal((await app.survey(parameters)).status,400);
  assert.equal(app.requests.length,before);const p=await app.plan();assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[]);assert.equal(app.requests.filter(r=>r.name==='WeekLotteryFreePackRequest').length,0);
  const permit=await app.approve(p.data);assert.equal(permit.status,200);app.ready('B');
  assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data,authorized:false})).status,403);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
  const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',record.stopReason);
  assert.deepEqual(app.requests.filter(r=>r.name==='WeekLotteryFreePackRequest').map(r=>r.body),[{}]);assert.equal(session.weeklyState.gift[0].gotTimes,unconfirmed?0:1);assert.equal(session.giftResources.find(r=>r.res===4).amount,unconfirmed?50:60);assert.equal(session.dailyActivityStock.get('周转盘币'),unconfirmed?undefined:1);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed)assert.equal((await app.survey()).status,409);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('weekly lottery HTTP does not infer absent entitlement or authorize another event period',async()=>{
 const app=await harness({includeWeeklyGift:true});try{
  const session=app.ready('A');await app.enable();session.weeklyState.gift=[];
  const missing=await app.survey();assert.equal(missing.status,200);assert.equal(missing.data.view.candidates[0].blockedReason,'WEEKLY_GIFT_ENTITLEMENT_UNKNOWN');
  session.weeklyState.gift=[{giftId:1000,gotTimes:0,charge:0}];const p=await app.plan(),permit=await app.approve(p.data);assert.equal(permit.status,200);session.weekState.activityTime[0].period++;
  const result=await app.call('/api/operations/execute',{body:permit.data});if(result.status===200)await app.operations.settle('A');assert.equal(app.requests.filter(r=>r.name==='WeekLotteryFreePackRequest').length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of[false,true])test('unique weekly HTTP uses exact gotFree and original permission/history '+unconfirmed,async()=>{
 const app=await harness({includeUniqueGift:true,unconfirmed});try{
  const session=app.ready('A');await app.enable();const before=app.requests.length;
  for(const parameters of[{kind:'weekly-unique-lottery-gift'},{kind:'weekly-unique-lottery-gift',packId:1000},{kind:'weekly-unique-lottery-gift',packId:'1001'},{kind:'weekly-unique-lottery-gift',packId:'1000',tierId:1}])assert.equal((await app.survey(parameters)).status,400);
  assert.equal(app.requests.length,before);const p=await app.plan();assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[]);assert.equal(app.requests.filter(r=>r.name==='GotUniqueLotteryFreeRequest').length,0);
  const permit=await app.approve(p.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data,authorized:false})).status,403);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',record.stopReason);
  assert.deepEqual(app.requests.filter(r=>r.name==='GotUniqueLotteryFreeRequest').map(r=>r.body),[{}]);assert.equal(session.weeklyState.gotFree,!unconfirmed);assert.deepEqual(session.weeklyState.gift,[{giftId:1001,gotTimes:1,charge:30}]);assert.equal(session.giftResources.find(r=>r.res===4).amount,unconfirmed?50:60);assert.equal(session.dailyActivityStock.get('周翻牌币'),unconfirmed?undefined:1);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed)assert.equal((await app.survey()).status,409);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('unique weekly HTTP refuses missing gotFree and conflicting free-pack records without sends',async()=>{
 const app=await harness({includeUniqueGift:true});try{
  const session=app.ready('A');await app.enable();const request=session.client.request.bind(session.client);session.client.request=(name,...args)=>name==='WeekUniqueLotteryRequest'&&!Object.hasOwn(session.weeklyState,'gotFree')?Promise.resolve(structuredClone(session.weeklyState)):request(name,...args);delete session.weeklyState.gotFree;assert.equal((await app.survey()).data.view.candidates[0].executable,false);
  session.weeklyState.gotFree=false;session.weeklyState.gift.push({giftId:1000,gotTimes:0,charge:0});assert.equal((await app.survey()).data.view.candidates[0].blockedReason,'WEEKLY_GIFT_ENTITLEMENT_UNKNOWN');assert.equal(app.requests.filter(r=>r.name==='GotUniqueLotteryFreeRequest').length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of[false,true])test('chip weekly HTTP claims only held boxes through original permission/history '+unconfirmed,async()=>{
 const app=await harness({includeChipGift:true,unconfirmed});try{
  const session=app.ready('A');await app.enable();const before=app.requests.length;
  for(const parameters of[{kind:'weekly-chip-gift'},{kind:'weekly-chip-gift',packId:1000},{kind:'weekly-chip-gift',packId:'1001'},{kind:'weekly-chip-gift',packId:'1000',taskId:1}])assert.equal((await app.survey(parameters)).status,400);assert.equal(app.requests.length,before);
  const p=await app.plan();assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[]);assert.equal(app.requests.filter(r=>r.name==='WeekChipGotFreeRequest').length,0);
  const permit=await app.approve(p.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data,authorized:false})).status,403);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',record.stopReason);
  assert.deepEqual(app.requests.filter(r=>r.name==='WeekChipGotFreeRequest').map(r=>r.body),[{}]);assert.equal(session.weeklyState.gifts[0].paidTimes,unconfirmed?0:1);assert.equal(session.giftResources.find(r=>r.res===4).amount,50);assert.equal(session.dailyActivityStock.get('白芯片宝箱'),unconfirmed?undefined:10);assert.equal(app.requests.some(r=>/Open.*(Pack|Box)|ChipOpen/.test(r.name)),false);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed)assert.equal((await app.survey()).status,409);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('chip weekly HTTP never manufactures zero paidTimes or an absent gift entitlement',async()=>{
 const app=await harness({includeChipGift:true});try{
  const session=app.ready('A');await app.enable();delete session.weeklyState.gifts[0].paidTimes;assert.equal((await app.survey()).data.view.candidates[0].executable,false);
  session.weeklyState.gifts.shift();assert.equal((await app.survey()).data.view.candidates[0].blockedReason,'WEEKLY_GIFT_ENTITLEMENT_UNKNOWN');assert.equal(app.requests.filter(r=>r.name==='WeekChipGotFreeRequest').length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of[false,true])test('chip task original HTTP binds round/task and confirms only full held income '+unconfirmed,async()=>{
 const app=await harness({includeChipTask:true,unconfirmed});try{
  const session=app.ready('A');await app.enable();const before=app.requests.length;
  for(const parameters of[{kind:'weekly-chip-task',taskId:1},{kind:'weekly-chip-task',round:1},{kind:'weekly-chip-task',round:'1',taskId:1},{kind:'weekly-chip-task',round:1,taskId:1,packId:'1000'}])assert.equal((await app.survey(parameters)).status,400);
  assert.equal(app.requests.length,before);const p=await app.plan();assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[]);assert.equal(app.requests.some(r=>r.name==='WeekChipGotTaskRequest'),false);
  const permit=await app.approve(p.data);assert.equal(permit.status,200);app.ready('B');assert.equal((await app.call('/api/operations/execute',{id:'B',body:permit.data})).status,409);assert.equal((await app.call('/api/operations/execute',{body:permit.data,authorized:false})).status,403);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',record.stopReason);
  assert.deepEqual(app.requests.filter(r=>r.name==='WeekChipGotTaskRequest').map(r=>r.body),[{round:1,taskId:1}]);assert.deepEqual(session.weeklyState.gotTaskId,unconfirmed?[]:[1]);assert.equal(session.giftResources.find(r=>r.res===3).amount,unconfirmed?200:15200);assert.equal(session.dailyActivityStock.get('绿芯片宝箱'),unconfirmed?undefined:10);assert.equal(session.dailyActivityStock.get('高级专武材料'),unconfirmed?undefined:10);
  assert.equal(app.requests.some(r=>/Open.*(Pack|Box)|ChipOpen/.test(r.name)),false);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed)assert.equal((await app.survey()).status,409);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('chip task HTTP blocks exact final-task transition and period changes before dispatch',async()=>{
 const app=await harness({includeChipTask:true});try{
  const session=app.ready('A');await app.enable();session.weeklyState.gotTaskId=[2];assert.equal((await app.survey()).data.view.candidates[0].blockedReason,'WEEKLY_CHIP_ROUND_TRANSITION_UNVERIFIED');
  session.weeklyState.gotTaskId=[];const p=await app.plan(),permit=await app.approve(p.data);assert.equal(permit.status,200);session.weekState.activityTime[0].period++;
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');assert.equal(app.requests.some(r=>r.name==='WeekChipGotTaskRequest'),false);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('original dailies HTTP exposes only cached seasonal observations per account without creating any connection or write',async()=>{
 const app=await harness();try{
  const session=app.ready('A');session.connectionId='synthetic-push';session.player={playerId:'1',worldId:17};session.snapshot={ok:{},failed:{},sessionFacts:{festivalActivities:{status:'OBSERVED',reliable:true,source:'SCAllActivity.festivalActivities',scope:'ACCEPTED_STREAM_OBSERVATION_ONLY',accountId:'A',generation:1,connectionId:'synthetic-push',playerId:'1',worldId:'17',seq:1,observedAt:'2026-11-14T01:00:00.000Z',activities:[{activityId:'9007199254740993',festival:1,type:'合成活动',season:1,startTime:800,openTime:900,closeTime:1900,endTime:2000,subActivity:[{subActivityType:11,dailyActive:{checkInId:[1],activeScore:0,claimedRewardId:0,checkRuby:'9007199254740993'}}]}]}}};
  session.snapshot.sessionFacts.festivalActivities.activities[0].subActivity.push({subActivityType:28,compassWheel:{score:50,claimedId:1}},{subActivityType:29},{subActivityType:30,evilExpel:{killTotal:10,claimed:5,alive:0}});
  const response=await app.call('/api/dailies');assert.equal(response.status,200);assert.equal(response.data.accountId,'A');const a=response.data.checklist.festival;assert.equal(a.status,'OBSERVED');assert.equal(a.rows[0].activityId,'9007199254740993');assert.deepEqual(a.rows[0].checkInRecord.checkInId,[1]);assert.equal(a.rows[0].checkInRecord.checkRuby,'9007199254740993');assert.equal(a.rows[0].eligible,null);assert.equal(a.rows[0].executable,false);assert.equal(a.complete,false);assert.match(response.data.text,/当前领取资格未知/);
  const subs=a.rows[0].subActivities;assert.equal(subs.status,'OBSERVED');assert.deepEqual(subs.rows.map(r=>r.subActivityType),[11,28,29,30]);assert.equal(subs.rows[1].detail.score,50);assert.equal(subs.rows[3].detail.alive,0);assert.equal(subs.rows[2].detail.reason,'EDICT_SESSION_NOT_IN_PUSH');for(const row of subs.rows){assert.equal(row.eligible,null);assert.equal(row.executable,false);assert.equal(Object.hasOwn(row,'action'),false);}
  for(const [object,key,value]of[[session,'generation',2],[session,'connectionId','other'],[session.player,'playerId','2'],[session.player,'worldId',18]]){const old=object[key];object[key]=value;const changed=(await app.call('/api/dailies')).data.checklist.festival;assert.equal(changed.status,'UNKNOWN');assert.deepEqual(changed.rows,[]);object[key]=old;}
  app.ready('B');const other=await app.call('/api/dailies',{id:'B'});assert.equal(other.data.checklist.festival.status,'UNKNOWN');assert.deepEqual(other.data.checklist.festival.rows,[]);
  assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal((await app.call('/api/dailies/run',{body:{confirm:true}})).data.code,'READ_ONLY_ROUTE');
 }finally{await app.close();}
});
for(const entry of ['dailies','loop'])test('unified '+entry+' daily mainline reuses original Runner authorization history and account isolation',async()=>{
 const app=await harness({includeStage:true});try{
  const session=app.ready('A');app.ready('B');
  await app.call('/api/gameplay?module=stage');
  await app.call('/api/gameplay/config',{body:{module:'stage',config:{enabled:true}}});
  const config={enabled:true,retryDelaySeconds:10,maxAttempts:1,maxStage:null,stopOnDefeat:true};
  const intent={entry,dailies:[{taskId:1003,action:'perform',parameters:{config}}],budget:{resources:[],quotas:[],uids:[]}};
  const prepared=await app.call('/api/workflows/prepare',{body:intent});
  assert.equal(prepared.status,200);assert.deepEqual(prepared.data.blocked,[]);
  const g=prepared.data.graph;assert.equal(g.nodes.find(n=>n.type==='ACTION').module,'stage');
  const count=app.requests.length;assert.equal((await app.call('/api/workflows/simulate',{body:{graph:g}})).data.requestsSent,0);
  assert.equal(app.requests.length,count);assert.equal(session.stageRunner,undefined);
  await app.call('/api/workflows/start',{body:{graph:g}});const paused=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;
  assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,0);assert.equal(session.stageRunner,undefined);
  const p=paused.plan,payload={batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true};
  assert.notEqual((await app.call('/api/operations/authorize',{id:'B',body:payload})).status,200);
  assert.equal((await app.call('/api/operations/authorize',{body:payload,headers:{'x-cw-csrf':'wrong'}})).status,403);
  const permit=await app.approve(p);assert.equal(permit.status,200);
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);
  await app.operations.settle('A');
  assert.equal((await app.call('/api/workflows/resume',{body:{}})).status,200);
  const completed=(await waitForWorkflow(app,'COMPLETED')).status;
  assert.deepEqual(app.requests.filter(r=>r.name==='ChallengeStageRequest').map(r=>r.body.stage),[41]);
  assert.ok(session.stageRunner);assert.equal(session.stageClient,session.client);
  const detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(completed.runId));
  assert.equal(detail.status,200);assert.equal(detail.data.preparation.entry,entry);
  const runs=(await app.call('/api/operations/history')).data.runs;
  assert.equal(runs.length,1);assert.equal(runs[0].module,'stage');assert.equal(runs[0].workflowId,completed.runId);
  assert.equal(runs[0].actions[0].verification.status,'CONFIRMED');assert.equal(runs[0].finalStatus,'SUCCESS');
  assert.equal(app.requests.some(r=>r.name==='DrawDailyTaskRewardRequest'),false);
  assert.notEqual((await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(completed.runId),{id:'B'})).status,200);
  assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const entry of ['dailies','loop'])test('unified '+entry+' daily mainline UNKNOWN stops siblings and survives a new shared Service without replay',async()=>{
 const app=await harness({includeStage:true});try{
  const session=app.ready('A'),original=session.client.request;
  session.client.request=async function(name,...args){const response=await original.call(this,name,...args);return name==='ChallengeStageRequest'?{...response,initialData:{...response.initialData,battleType:2}}:response;};
  await app.call('/api/gameplay?module=stage');
  await app.call('/api/gameplay/config',{body:{module:'stage',config:{enabled:true}}});
  const row={taskId:1003,action:'perform',parameters:{config:{enabled:true,retryDelaySeconds:10,maxAttempts:2,maxStage:null,stopOnDefeat:true}}};
  const prepared=await app.call('/api/workflows/prepare',{body:{entry,dailies:[row,row],budget:{resources:[],quotas:[],uids:[]}}});
  await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const paused=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,permit=await app.approve(paused.plan);
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');
  await app.call('/api/workflows/resume',{body:{}});
  const stopped=(await app.call('/api/workflows')).data.status;assert.equal(stopped.status,'UNKNOWN');
  const runs=app.history.list('A');assert.equal(runs.length,1);assert.equal(runs[0].actions[0].result,'UNKNOWN');
  assert.equal(runs[0].actions[0].unresolvedWrite,true);assert.equal(app.history.unresolved('A'),true);
  assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,1);
  const before=fs.readFileSync(app.history.storagePath,'utf8');
  const {createOperationService}=await import('../src/operation-service.mjs');
  const reopened=createExecutionHistory({file:app.history.storagePath}),service=createOperationService({history:reopened,modules:app.operations.modules,loadRules:()=>({config:{}})});
  const fresh={...session,stageRunner:null,busy:null,workflowOwner:null,abort:new AbortController(),client:{...session.client,uncertainWrites:new Set()}};
  assert.equal(service.blocked('A'),true);
  await assert.rejects(service.plan(fresh,{module:'stage',mode:'Manual',selections:[],parameters:row.parameters}));
  assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),before);
  assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,1);
  assert.equal(app.requests.some(r=>r.name==='DrawDailyTaskRewardRequest'),false);
  assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const entry of ['dailies','loop'])test('unified '+entry+' daily mainline cancellation before authorization cannot dispatch through an old plan',async()=>{
 const app=await harness({includeStage:true});try{
  const session=app.ready('A');await app.call('/api/gameplay?module=stage');
  await app.call('/api/gameplay/config',{body:{module:'stage',config:{enabled:true}}});
  const intent={entry,dailies:[{taskId:1003,parameters:{config:{enabled:true,retryDelaySeconds:10,maxAttempts:1,maxStage:null,stopOnDefeat:true}}}],budget:{resources:[],quotas:[],uids:[]}};
  const prepared=await app.call('/api/workflows/prepare',{body:intent});await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const p=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status.plan,permit=await app.approve(p);
  assert.equal((await app.call('/api/workflows/stop',{body:{}})).data.status.status,'CANCELLED');
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).data.code,'STALE_PLAN');
  assert.equal(session.stageRunner,undefined);assert.equal(session.busy,null);
  assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,0);
  assert.deepEqual(app.history.list('A'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
function museumDailyIntent(entry,extra={}){
 return {entry,dailies:[{taskId:1016,action:'perform',parameters:{stageId:1,heroIds:['A','B','C'],factor:1}}],budget:{resources:[{id:'小麦',num:2}],quotas:[],uids:[]},...extra};
}
for(const entry of ['dailies','loop'])test('unified '+entry+' museum departure uses the original exact material authorization and independent state settlement',async()=>{
 const app=await harness({includeMuseum:true});try{
  const session=app.ready('A');app.ready('B');
  const disabled=await app.call('/api/gameplay?module=museum');assert.equal(disabled.data.config.enabled,false);
  await app.call('/api/gameplay/config',{body:{module:'museum',config:{enabled:true,exploration:true,collection:true}}});
  const intent=museumDailyIntent(entry),prepared=await app.call('/api/workflows/prepare',{body:intent});
  assert.equal(prepared.status,200);assert.deepEqual(prepared.data.blocked,[]);
  const node=prepared.data.graph.nodes.find(n=>n.type==='ACTION');assert.equal(node.module,'museum');
  assert.match(node.selection.actionId,/^museum:startExplore:/);assert.equal(app.requests.length,0);
  await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const paused=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,p=paused.plan;
  assert.equal(p.actions.length,1);assert.equal(p.actions[0].actionType,'startExplore');
  assert.deepEqual(p.resourceBudget,[{id:'小麦',num:2}]);assert.deepEqual(p.actions[0].target,{stageId:1,heroIds:['A','B','C'],factor:1});
  assert.equal(app.requests.filter(r=>r.options?.mutate).length,0);
  const approve={batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true};
  assert.equal((await app.call('/api/operations/authorize',{body:approve,headers:{'x-cw-csrf':'wrong'}})).status,403);
  assert.notEqual((await app.call('/api/operations/authorize',{id:'B',body:approve})).status,200);
  const permit=await app.approve(p);assert.equal(permit.status,200);
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});
  const completed=(await waitForWorkflow(app,'COMPLETED')).status,runs=app.history.list('A');
  assert.equal(runs.length,1);assert.equal(runs[0].finalStatus,'SUCCESS');assert.equal(runs[0].actions[0].verification.status,'CONFIRMED');
  assert.equal(runs[0].workflowId,completed.runId);assert.equal(runs[0].workflowNodeId,node.id);
  const writes=app.requests.filter(r=>r.options?.mutate);assert.deepEqual(writes.map(r=>r.name),['MuseumStartExploreRequest']);
  assert.deepEqual(writes[0].body,{stageId:1,heroIds:['A','B','C'],factor:1});
  assert.ok(app.requests.slice(app.requests.indexOf(writes[0])+1).some(r=>r.name==='MuseumInfoRequest'));
  assert.ok(app.requests.slice(app.requests.indexOf(writes[0])+1).some(r=>r.name==='AllItemRequest'));
  assert.equal(session.museumState.stock,8);assert.equal(session.museumState.info.uncollectedRevenue,10);
  assert.equal(runs[0].runBudget.reserved.resources.find(r=>r.id==='小麦').num,2);
  const detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(completed.runId));
  assert.equal(detail.data.preparation.entry,entry);assert.equal(detail.data.nodes[0].batches[0].actions[0].actionType,'startExplore');
  assert.deepEqual(app.history.list('B'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const entry of ['dailies','loop'])test('unified '+entry+' museum typed response without independent effect stays UNKNOWN across restart with zero replay',async()=>{
 const app=await harness({includeMuseum:true,unconfirmed:true});try{
  const session=app.ready('A');await app.call('/api/gameplay?module=museum');
  await app.call('/api/gameplay/config',{body:{module:'museum',config:{enabled:true,exploration:true,collection:true}}});
  const intent=museumDailyIntent(entry);intent.dailies.push(structuredClone(intent.dailies[0]));
  const prepared=await app.call('/api/workflows/prepare',{body:intent});await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const p=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status.plan,permit=await app.approve(p);
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});
  assert.equal((await app.call('/api/workflows')).data.status.status,'UNKNOWN');
  const record=app.history.list('A')[0];assert.equal(record.actions[0].result,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);
  assert.equal(record.runBudget.reserved.resources.find(r=>r.id==='小麦').num,2);
  const writes=app.requests.filter(r=>r.options?.mutate);assert.deepEqual(writes.map(r=>r.name),['MuseumStartExploreRequest']);
  assert.equal(session.museumState.stock,10);assert.equal(session.museumState.info.uncollectedRevenue,10);
  const bytes=fs.readFileSync(app.history.storagePath,'utf8'),{createOperationService}=await import('../src/operation-service.mjs');
  const service=createOperationService({history:createExecutionHistory({file:app.history.storagePath}),modules:app.operations.modules,loadRules:()=>({config:{}})});
  const fresh={...session,busy:null,workflowOwner:null,abort:new AbortController(),client:{...session.client,uncertainWrites:new Set()}};
  assert.equal(service.blocked('A'),true);
  await assert.rejects(service.plan(fresh,{module:'museum',mode:'Manual',parameters:intent.dailies[0].parameters,selections:[p.actions[0].actionId]}));
  assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.equal(app.requests.filter(r=>r.options?.mutate).length,1);
  assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const kind of ['disabled','occupied','missing-cost','unknown-clock','parent-budget'])test('daily museum '+kind+' cannot fall back to collection or another observed action',async()=>{
 const app=await harness({includeMuseum:true});try{
  const session=app.ready('A');await app.call('/api/gameplay?module=museum');
  await app.call('/api/gameplay/config',{body:{module:'museum',config:{enabled:kind!=='disabled',exploration:true,collection:true}}});
  if(kind==='occupied')Object.assign(session.museumState.info.exploreStages[0].expedition,{startTime:1799999990,endTime:1800003600,heroIds:['A','B','C']});
  if(kind==='missing-cost')delete session.museumState.info.exploreStages[0].expedition.cost;
  if(kind==='unknown-clock')session.client.gameClock={read:()=>({status:'UNKNOWN',reliable:false})};
  const intent=museumDailyIntent('dailies');if(kind==='parent-budget')intent.budget.resources[0].num=1;
  const prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200);
  await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const status=(await app.call('/api/workflows')).data.status;
  if(kind==='parent-budget'){
   assert.equal(status.status,'AWAITING_AUTHORIZATION');
   assert.deepEqual(status.plan.resourceBudget,[{id:'小麦',num:2}]);
   const permit=await app.approve(status.plan);assert.equal(permit.status,200);
   const executed=await app.call('/api/operations/execute',{body:permit.data});
   assert.notEqual(executed.status,200);assert.equal(executed.data.code,'RUN_BUDGET_INVALID');
   const records=app.history.list('A');assert.equal(records.length,1);
   assert.equal(records[0].finalStatus,'NOT_EXECUTED');assert.equal(records[0].actions[0].requestStatus,'NOT_DISPATCHED');
   assert.equal(records[0].actions[0].result,'NOT_EXECUTED');assert.equal(session.museumState.stock,10);
  }else{
   assert.equal(status.status,'FAILED');assert.equal(status.plan,null);assert.deepEqual(app.history.list('A'),[]);
  }
  assert.equal(app.requests.filter(r=>r.options?.mutate).length,0);assert.equal(session.museumState.info.uncollectedRevenue,10);
  assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('daily museum original History persistence failure prevents the departure transport',async()=>{
 const app=await harness({includeMuseum:true});try{
  app.ready('A');await app.call('/api/gameplay?module=museum');
  await app.call('/api/gameplay/config',{body:{module:'museum',config:{enabled:true,exploration:true}}});
  const prepared=await app.call('/api/workflows/prepare',{body:museumDailyIntent('dailies')});
  await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const p=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status.plan,permit=await app.approve(p);
  fs.writeFileSync(app.history.storagePath,'{synthetic interrupted history');
  const response=await app.call('/api/operations/execute',{body:permit.data});assert.notEqual(response.status,200);
  assert.equal(app.requests.filter(r=>r.options?.mutate).length,0);
  assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),'{synthetic interrupted history');
 }finally{await app.close();}
});

test('daily museum cancellation keeps a late applied departure UNKNOWN instead of replaying or claiming',async()=>{
 const app=await harness({includeMuseum:true});let release;try{
  const session=app.ready('A'),request=session.client.request;let dispatched;
  const seen=new Promise(resolve=>dispatched=resolve);
  session.client.request=async function(name,...args){
   const result=await request.call(this,name,...args);
   if(name!=='MuseumStartExploreRequest')return result;
   return new Promise(resolve=>{release=()=>resolve(result);dispatched();});
  };
  await app.call('/api/gameplay?module=museum');
  await app.call('/api/gameplay/config',{body:{module:'museum',config:{enabled:true,exploration:true}}});
  const prepared=await app.call('/api/workflows/prepare',{body:museumDailyIntent('dailies')});
  await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const p=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status.plan,permit=await app.approve(p);
  await app.call('/api/operations/execute',{body:permit.data});await seen;
  await app.call('/api/workflows/stop',{body:{}});await app.operations.settle('A');
  const before=fs.readFileSync(app.history.storagePath,'utf8');
  assert.equal(app.history.list('A')[0].actions[0].result,'UNKNOWN');
  release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),before);
  assert.equal(app.history.unresolved('A'),true);assert.equal(session.museumState.stock,8);
  assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>r.name),['MuseumStartExploreRequest']);
  assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{release?.();await app.close();}
});
function allianceDailyIntent(entry){return {entry,dailies:[{taskId:1012,action:'perform',parameters:{cityId:2}}],budget:{resources:[{id:'小麦',num:2}],quotas:[],uids:[]}};}
async function allianceDailyPlan(app,entry='dailies',intent=allianceDailyIntent(entry)){
 await app.call('/api/gameplay?module=alliance');assert.equal((await app.call('/api/gameplay/config',{body:{module:'alliance',config:{enabled:true,orders:true,welfare:true}}})).status,200);
 const prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200);assert.deepEqual(prepared.data.blocked,[]);
 const started=await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});assert.equal(started.status,200);
 return (await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status.plan;
}
for(const entry of ['dailies','loop'])test('unified '+entry+' alliance daily order uses original city material authorization and independent counter settlement',async()=>{
 const app=await harness({includeAllianceOrders:true});try{
  const session=app.ready('A');app.ready('B');const p=await allianceDailyPlan(app,entry);
  assert.equal(p.actions.length,1);assert.equal(p.actions[0].actionType,'finishOrder');assert.deepEqual(p.actions[0].target,{cityId:2});assert.deepEqual(p.resourceBudget,[{id:'小麦',num:2}]);
  const approve={batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true};
  assert.equal((await app.call('/api/operations/authorize',{body:approve,headers:{'x-cw-csrf':'wrong'}})).status,403);assert.notEqual((await app.call('/api/operations/authorize',{id:'B',body:approve})).status,200);assert.equal(app.requests.some(r=>r.options?.mutate),false);
  const permit=await app.approve(p);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});
  const completed=(await waitForWorkflow(app,'COMPLETED')).status,run=app.history.list('A')[0];assert.equal(run.finalStatus,'SUCCESS');assert.equal(run.actions[0].verification.status,'CONFIRMED');assert.equal(run.workflowId,completed.runId);
  assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>[r.name,r.body]),[['FinishGuildOrderRequest',{cityId:2}]]);
  const writeAt=app.requests.findIndex(r=>r.name==='FinishGuildOrderRequest');for(const name of ['CounterInfoRequest','GuildOrderRequest','AllItemRequest'])assert.ok(app.requests.slice(writeAt+1).some(r=>r.name===name));
  assert.equal(session.allianceOrderState.stock,8);assert.equal(session.allianceOrderState.completed,1);assert.equal(run.runBudget.reserved.resources.find(r=>r.id==='小麦').num,2);
  const detail=(await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(completed.runId))).data;assert.equal(detail.preparation.entry,entry);assert.equal(detail.nodes[0].batches[0].actions[0].actionType,'finishOrder');assert.deepEqual(app.history.list('B'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const entry of ['dailies','loop'])test('unified '+entry+' alliance daily order unconfirmed response remains UNKNOWN across restart without replay',async()=>{
 const app=await harness({includeAllianceOrders:true,unconfirmed:true});try{
  const session=app.ready('A'),intent=allianceDailyIntent(entry);intent.dailies.push(structuredClone(intent.dailies[0]));const p=await allianceDailyPlan(app,entry,intent),permit=await app.approve(p);
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});assert.equal((await app.call('/api/workflows')).data.status.status,'UNKNOWN');
  const record=app.history.list('A')[0];assert.equal(record.actions[0].result,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.equal(record.runBudget.reserved.resources.find(r=>r.id==='小麦').num,2);
  const bytes=fs.readFileSync(app.history.storagePath,'utf8'),{createOperationService}=await import('../src/operation-service.mjs');
  const service=createOperationService({history:createExecutionHistory({file:app.history.storagePath}),memory:createExecutionMemory({file:app.history.storagePath+'.memory.json'}),modules:app.operations.modules});
  assert.equal(service.blocked('A'),true);await assert.rejects(service.plan({...session,busy:null,workflowOwner:null,abort:new AbortController()},{module:'alliance',mode:'Manual',parameters:{cityId:2},selections:[p.actions[0].actionId]}));
  assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>r.name),['FinishGuildOrderRequest']);assert.equal(session.allianceOrderState.completed,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('alliance daily exact order refusal survives reconnect and restart in the existing execution memory',async()=>{
 const app=await harness({includeAllianceOrders:true});try{
  const session=app.ready('A');session.allianceOrderState.refused=true;const p=await allianceDailyPlan(app),permit=await app.approve(p);
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});
  assert.equal(app.history.list('A')[0].finalStatus,'REJECTED');const bytes=fs.readFileSync(app.history.storagePath,'utf8'),{createOperationService}=await import('../src/operation-service.mjs');
  const service=createOperationService({history:createExecutionHistory({file:app.history.storagePath}),memory:createExecutionMemory({file:app.history.storagePath+'.memory.json'}),modules:app.operations.modules,protocol,getConfig:()=>allianceDailyCfg,moduleSettings:{get:()=>({config:{enabled:true,orders:true,welfare:true}})},loadRules:()=>({config:{}})});
  const fresh={...session,generation:2,connectionId:'alliance-reconnected',busy:null,workflowOwner:null,abort:new AbortController(),client:{...session.client,uncertainWrites:new Set(),factContext:{accountId:'A',generation:2,connectionId:'alliance-reconnected'},gameClock:{read:()=>({status:'TRUSTED',reliable:true,accountId:'A',generation:2,nowMs:1800000000000,earliestMs:1800000000000,latestMs:1800000000000})}}};
  await assert.rejects(service.plan(fresh,{module:'alliance',mode:'Manual',parameters:{cityId:2},selections:[p.actions[0].actionId]}),{code:'REJECTION_MEMORY_ACTIVE'});
  assert.equal(service.executionMemory('A').events[0].status,'REJECTED');assert.deepEqual(service.executionMemory('B').events,[]);assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>r.name),['FinishGuildOrderRequest']);
 }finally{await app.close();}
});
for(const kind of ['disabled','quota','expired','missing-cost','unknown-clock','unknown-season','missing-city'])test('alliance daily '+kind+' cannot fall back to welfare or another city',async()=>{
 const app=await harness({includeAllianceOrders:true});try{
  const session=app.ready('A'),state=session.allianceOrderState;await app.call('/api/gameplay?module=alliance');await app.call('/api/gameplay/config',{body:{module:'alliance',config:{enabled:kind!=='disabled',orders:true,welfare:true}}});
  if(kind==='quota')state.completed=3;if(kind==='expired')state.refreshAt=1799999999;if(kind==='missing-cost')state.requirements=null;if(kind==='unknown-season')session.player.worldId=1;if(kind==='missing-city')state.cities=[{cityId:1}];if(kind==='unknown-clock')session.client.gameClock={read:()=>({status:'UNKNOWN',reliable:false})};
  const prepared=await app.call('/api/workflows/prepare',{body:allianceDailyIntent('dailies')});assert.equal(prepared.status,200);await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});
  const status=(await app.call('/api/workflows')).data.status;assert.equal(status.status,'FAILED');assert.equal(status.plan,null);assert.equal(app.requests.some(r=>r.options?.mutate),false);assert.equal(state.stock,10);assert.deepEqual(app.history.list('A'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const change of ['city','cost','stock'])test('alliance daily '+change+' change after authorization is rejected before departure',async()=>{
 const app=await harness({includeAllianceOrders:true});try{
  const session=app.ready('A'),p=await allianceDailyPlan(app),permit=await app.approve(p);
  if(change==='city')session.allianceOrderState.cities=[{cityId:1}];if(change==='cost')session.allianceOrderState.requirements=[{id:'小麦',num:3}];if(change==='stock')session.allianceOrderState.stock=1;
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');const run=app.history.list('A')[0];assert.equal(run.finalStatus,'NOT_EXECUTED');assert.equal(run.actions[0].result,'NOT_EXECUTED');assert.equal(run.actions[0].dispatched,false);
  assert.equal(app.requests.some(r=>r.options?.mutate),false);assert.equal(session.allianceOrderState.completed,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('alliance daily order child material budget cannot exceed original parent authorization',async()=>{
 const app=await harness({includeAllianceOrders:true});try{
  app.ready('A');const intent=allianceDailyIntent('dailies');intent.budget.resources[0].num=1;const p=await allianceDailyPlan(app,'dailies',intent);assert.deepEqual(p.resourceBudget,[{id:'小麦',num:2}]);
  const permit=await app.approve(p),executed=await app.call('/api/operations/execute',{body:permit.data});assert.equal(executed.data.code,'RUN_BUDGET_INVALID');assert.equal(app.requests.some(r=>r.options?.mutate),false);assert.equal(app.history.list('A')[0].finalStatus,'NOT_EXECUTED');assert.equal(app.history.list('A')[0].actions[0].requestStatus,'NOT_DISPATCHED');
 }finally{await app.close();}
});
test('alliance daily History failure prevents order transport and preserves evidence bytes',async()=>{
 const app=await harness({includeAllianceOrders:true});try{
  app.ready('A');const p=await allianceDailyPlan(app),permit=await app.approve(p);fs.writeFileSync(app.history.storagePath,'{synthetic interrupted History');
  assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);assert.equal(app.requests.some(r=>r.options?.mutate),false);assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),'{synthetic interrupted History');
 }finally{await app.close();}
});
test('alliance daily cancelled late order remains UNKNOWN with original reservation and no fallback',async()=>{
 const app=await harness({includeAllianceOrders:true});let release;try{
  const session=app.ready('A'),request=session.client.request;let dispatched;const seen=new Promise(resolve=>dispatched=resolve);
  session.client.request=async function(name,...args){const response=await request.call(this,name,...args);if(name!=='FinishGuildOrderRequest')return response;return new Promise(resolve=>{release=()=>resolve(response);dispatched();});};
  const p=await allianceDailyPlan(app),permit=await app.approve(p);await app.call('/api/operations/execute',{body:permit.data});await seen;await app.call('/api/workflows/stop',{body:{}});await app.operations.settle('A');
  const bytes=fs.readFileSync(app.history.storagePath,'utf8'),run=app.history.list('A')[0];assert.equal(run.actions[0].result,'UNKNOWN');assert.equal(run.runBudget.reserved.resources.find(r=>r.id==='小麦').num,2);
  release();await new Promise(resolve=>setImmediate(resolve));assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.equal(app.history.unresolved('A'),true);assert.equal(session.allianceOrderState.completed,1);assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>r.name),['FinishGuildOrderRequest']);
 }finally{release?.();await app.close();}
});
test('daily cached HTTP advertises existing unified drivers per account without asserting perform eligibility',async()=>{
 const body=heroWire('DailyTaskInfoResponse',{dailyTask:[1003,1012,1016].map(id=>({id,progress:0,targetProgress:1,rewardClaimed:false}))});
 const app=await harness({collectSnapshot:async()=>({ok:{DailyTaskInfoRequest:body},raw:{DailyTaskInfoRequest:body},outcomes:{DailyTaskInfoRequest:{status:'SUCCESS'}},failed:{}})});try{
  const session=app.ready('A');app.ready('B');session.player={playerId:'1',worldId:17,mainlineStage:41};session.connectionId='cached-daily-http-A';
  await app.call();assert.equal((await app.call('/api/refresh',{body:{}})).status,200);
  const counts=app.counts();assert.deepEqual(counts,{clients:0,collections:1});
  const response=await app.call('/api/dailies');assert.equal(response.status,200);assert.deepEqual(response.data.checklist.tasks.rows.map(r=>r.functionId),['stage','alliance','museum']);
  for(const row of response.data.checklist.tasks.rows){assert.equal(row.executable,false);assert.equal(row.eligible,false);assert.equal(Object.hasOwn(row,'parameters'),false);assert.deepEqual(row.claimParameters,{kind:'daily',taskId:row.taskId});}
  assert.deepEqual((await app.call('/api/dailies',{id:'B'})).data.checklist.tasks.rows,[]);assert.equal(app.requests.length,0);assert.deepEqual(app.history.list('A'),[]);assert.deepEqual(app.counts(),counts);
 }finally{await app.close();}
});

test('HTTP unified AFK declaration uses full Registry, requires exact level and stays static across accounts',async()=>{
 const app=await harness({includeMuseum:true});try{await app.call();const input={entry:'tasks',tasks:[{kind:'afk-level-reward',level:2}],budget:{resources:[],quotas:[],uids:[{type:'afk-level-reward',id:'2'}]}},count=app.requests.length;
 for(const id of ['A','B']){const response=await app.call('/api/workflows/prepare',{id,body:input});assert.equal(response.status,200);assert.equal(response.data.accountId,id);const node=response.data.graph.nodes.find(n=>n.type==='ACTION');assert.equal(node.module,'afk-level-rewards');assert.deepEqual(node.parameters,{level:2});assert.equal(app.requests.length,count);}
 assert.equal((await app.call('/api/workflows/prepare',{body:input,authorized:false})).status,403);assert.equal((await app.call('/api/workflows/prepare',{id:null,body:input})).status,400);assert.equal((await app.call('/api/workflows/prepare',{body:{...input,tasks:[{kind:'afk-level-reward',level:2,useAdvCard:true}]}})).status,400);assert.equal(app.requests.length,count);
 }finally{await app.close();}
});

for(const name of ['GuildShipRequest','GuildShipResponse','GuildShipOrderRequest','GuildShipSeekRequest'])protocol[name]=heroWireProtocol[name];

const {loadConfig:loadShipHttpConfig}=await import('../src/config.mjs');
const merchantHttpActual=loadShipHttpConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const merchantHttpConfig={tables:Object.fromEntries(['GuildShipParamCfg','GuildShipCfg','ModuleOpenCfg','ItemCfg'].map(k=>[k,structuredClone(merchantHttpActual.tables[k])]))};
const merchantHttpParameters={action:'ship-order',shipId:41,crewId:1};
async function merchantHttpReady(app,{unconfirmed=false,captain=false}={}){
 const session=app.ready('A'),codec=createVipHttpCodec(heroWireProtocol);session.player={playerId:'9007199254740993',worldId:'1000001',guildId:'10',level:20};session.connectionId='merchant-http-A';
 let socket;class Socket{constructor(){socket=this;this.readyState=0;}send(bytes){assert.equal(this.readyState,1);const frame=codec.decode(bytes);if(frame.name==='PingRequest')this.receive('PingResponse',{clientTimestamp:frame.body.clientTimestamp,serverTimestamp:frame.body.clientTimestamp});}close(){this.readyState=3;}receive(name,body,seq=0){this.onmessage?.({data:codec.encode(name,seq,body)});}}
 const client=new VipHttpClient({protocol:heroWireProtocol,accountId:'A',generation:session.generation,WebSocketImpl:Socket});client.on('error',()=>{});client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};
 const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:session.player});await pending;
 const now=1800000000;client.gameClock={...client.gameClock,read:()=>({status:'TRUSTED',reliable:true,accountId:'A',generation:session.generation,source:'synthetic clock',nowMs:now*1000,earliestMs:now*1000,latestMs:now*1000})};
 socket.receive('SCGuildShipActivity',{period:{period:7,startTime:now-100,endTime:now+1000}},1);
 const state={stock:10,ship:{shipId:41,type:1,state:1,leader:{playerId:'19'},preparedEndTime:now+100,cabin:[{crewId:1,order:[{type:0,id:'木材',num:2}]},{crewId:2,order:[{type:0,id:'木材',num:2}]}]}};
 if(captain){delete state.ship.leader;state.ship.preparedEndTime=0;state.ship.leaderCond=[{heroId:'captain-A',star:6,exStar:1}];state.heroes=[{heroId:'captain-A',level:20,star:5,power:'9007199254740993',skillLevels:[1],exclusive:{level:1,star:2}}];}
 client.request=async(n,b,r)=>{heroWire(n,b);app.requests.push({id:'A',name:n,body:structuredClone(b),response:r});const v=n==='AllHeroRequest'?{heroes:state.heroes}:n==='GuildInfoRequest'?{guild:{guildId:'10'}}:n==='GuildShipRequest'?{period:7,ship:[state.ship],ownRun:[]}:n==='AllItemRequest'?{items:[{itemId:'木材',num:state.stock}]}:n==='AllResourceRequest'?{list:[{res:3,amount:100}]}:null;assert.ok(v,n);return heroWire(r,v);};
 client.sendWatch=async(n,b,options)=>{heroWire(n,b);options.beforeDispatch?.();app.requests.push({id:'A',name:n,body:structuredClone(b),response:null});if(!unconfirmed){if(captain){state.ship.leader={playerId:session.player.playerId};state.ship.preparedEndTime=now+300;}else{state.stock-=2;state.ship.cabin[0].player={playerId:session.player.playerId};}}return {status:'UNKNOWN'};};
 session.client=client;return {session,client,state,socket};
}
for(const unconfirmed of [false,true])test('merchant HTTP original routes enforce exact permit and independent settlement '+unconfirmed,async()=>{
 const app=await harness({includeAlliance:true,configOverride:merchantHttpConfig});let client;try{
 ({client}=await merchantHttpReady(app,{unconfirmed}));await app.call('/api/gameplay?module=alliance');
 assert.equal((await app.call('/api/gameplay/config',{body:{module:'alliance',config:{enabled:true,ship:true}}})).status,200);
 assert.equal((await app.call('/api/gameplay?module=alliance',{id:'B'})).data.config.ship,false);
 assert.equal((await app.call('/api/gameplay/survey',{authorized:false,body:{module:'alliance',parameters:merchantHttpParameters}})).status,403);
 for(const p of [{...merchantHttpParameters,request:'GuildShipOrderRequest'},{...merchantHttpParameters,buy:false},{...merchantHttpParameters,crewId:0}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'alliance',parameters:p}})).status,400);
 const read=await app.call('/api/gameplay/survey',{body:{module:'alliance',parameters:merchantHttpParameters}});assert.equal(read.status,200);const row=read.data.view.candidates[0];assert.ok(row);assert.equal(row.action,undefined);assert.deepEqual(row.parameters,merchantHttpParameters);
 const p=await app.call('/api/operations/plan',{body:{module:'alliance',mode:'Manual',parameters:merchantHttpParameters,selections:[row.actionId]}});assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[{id:'木材',num:2}]);assert.equal(app.requests.filter(r=>r.name==='GuildShipOrderRequest').length,0);
 const approved=await app.approve(p.data);assert.equal(approved.status,200);assert.equal((await app.call('/api/operations/execute',{body:approved.data})).status,200);await app.operations.settle('A');
 const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.equal(app.requests.filter(r=>r.name==='GuildShipOrderRequest').length,1);assert.deepEqual(app.requests.find(r=>r.name==='GuildShipOrderRequest').body,{shipId:41,crewId:1});const replay=await app.call('/api/operations/execute',{body:approved.data});assert.equal(replay.status,403,JSON.stringify(replay.data));assert.equal((await app.call('/api/gameplay?module=alliance')).data.status.blocked,unconfirmed);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});

for(const unconfirmed of[false,true])test('merchant captain HTTP uses original permit and exact UID reservation with independent settlement '+unconfirmed,async()=>{
 const app=await harness({includeAlliance:true,configOverride:merchantHttpConfig});let client;try{
 const f=await merchantHttpReady(app,{captain:true,unconfirmed});client=f.client;await app.call('/api/gameplay?module=alliance');await app.call('/api/gameplay/config',{body:{module:'alliance',config:{enabled:true,ship:true}}});
 const parameters={action:'ship-seek',shipId:41};for(const p of[{...parameters,crewId:1},{...parameters,heroIds:['captain-A']},{...parameters,buy:false}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'alliance',parameters:p}})).status,400);
 const read=await app.call('/api/gameplay/survey',{body:{module:'alliance',parameters}});assert.equal(read.status,200);const row=read.data.view.candidates[0];assert.ok(row);assert.equal(row.actionType,'shipSeek');assert.deepEqual(row.costs,[]);assert.equal(row.qualification.rows[0].requiredCombined,7);assert.equal(row.action,undefined);
 const p=await app.call('/api/operations/plan',{body:{module:'alliance',mode:'Manual',parameters,selections:[row.actionId]}});assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[]);assert.deepEqual(p.data.budgetClaims.uids,[{type:'guild-ship',id:'10:7:41'},{type:'hero',id:'captain-A'}]);assert.equal(app.requests.filter(r=>r.name==='GuildShipSeekRequest').length,0);
 const approved=await app.approve(p.data);assert.equal(approved.status,200);assert.equal((await app.call('/api/operations/execute',{body:approved.data})).status,200);await app.operations.settle('A');const record=(await app.call('/api/operations/history')).data.runs[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');assert.deepEqual(record.runBudget.reserved.uids,p.data.budgetClaims.uids);assert.deepEqual(app.requests.find(r=>r.name==='GuildShipSeekRequest').body,{shipId:41});const replay=await app.call('/api/operations/execute',{body:approved.data});assert.equal(replay.status,403,JSON.stringify(replay.data));assert.equal((await app.call('/api/gameplay?module=alliance')).data.status.blocked,unconfirmed);assert.equal(f.state.stock,10);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});

test('cooldown history HTTP restores only original observation without a Session or automatic clock transition',async()=>{
 const app=await harness({includeStage:true});try{
 const {createWorkflowStore}=await import('../src/workflow.mjs'),file=path.join(root,'workflows.json'),store=createWorkflowStore({file,modules:GAMEPLAY_MODULES});
 const c={status:'OBSERVED',source:'RecruitInfoResponse.hero.freeEndTimeSeconds',freeEndTimeSeconds:1001,sourceAt:1000000,serverBounds:{earliestMs:999999,latestMs:1000001},readiness:'COOLDOWN',eligibility:null,executable:false,autoResume:false};
 const run={accountId:'A',runId:'cooldown-http-restored',workflowId:'cooldown-http-original',status:'COMPLETED',currentNode:'stop',steps:3,startedAt:'2026-01-01T00:00:00.000Z',finishedAt:'2026-01-01T00:00:01.000Z',trace:[{nodeId:'survey',type:'SURVEY',module:'free-recruit',result:'SURVEYED',timestamp:'2026-01-01T00:00:00.500Z',recruitCooldown:c}]};
 store.record('A',run);const before=fs.readFileSync(file,'utf8'),read=await app.call('/api/workflows/history?workflowRunId='+run.runId);
 assert.equal(read.status,200,JSON.stringify(read.data));assert.deepEqual(read.data.surveys[0].recruitCooldown,c);assert.equal(read.data.readOnly,true);assert.equal(read.data.resumable,false);assert.equal(read.data.surveys[0].recruitCooldown.readiness,'COOLDOWN');
 const other=await app.call('/api/workflows/history?workflowRunId='+run.runId,{id:'B'});assert.equal(other.status,404,JSON.stringify(other.data));assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(app.sessions.size,0);assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});


async function recommendationHttpFixture({extraPreset=false,...options}={}){
 const config=structuredClone(cfg);if(extraPreset)config.tables.FormationTypePositionCfg.data.push({id:3,position:[9,5]});
 const app=await harness({includeStage:true,...options,...(extraPreset?{configOverride:config}:{})}),session=app.ready('A');if(extraPreset){const request=session.client.request.bind(session.client);session.client.request=async(...args)=>{const value=await request(...args);return args[0]==='MyFormationPresetRequest'?{ids:[2,3]}:value;};}Object.assign(session.player,{playerId:'17',worldId:7});await app.enable();await app.call('/api/gameplay/config',{body:{module:'stage',config:{enabled:true}}});
 const {createStandaloneStageJournal,projectStageBattleHistory}=await import('../src/stage-history.mjs'),{battleAnalysis}=await import('../src/formation.mjs');
 const journal=createStandaloneStageJournal(app.history,{accountId:'A',playerId:'17',worldId:7,generation:session.generation,connectionId:'source-connection'}),runId='source-defeat',at=new Date().toISOString();
 const analysis=battleAnalysis({initialData:{mainlineStage:41,battleType:1,leftTeam:{presetId:1,members:[{hero:{heroId:'tank'},pos:{x:1,y:3}}]},rightTeams:[{members:[{hero:{heroId:'enemy'},pos:{x:2,y:3}}]}]},stats:{isLeftWin:false,leftHeroDamages:[{heroId:'tank',pos:{x:1,y:3},leftHp:0,statBar:{damage:{physical:1,magic:0,true:0}}}]}});
 journal.start({runId,stage:41,at,config:{}});journal.dispatch({runId,stage:41,attempt:1,at});journal.settle({runId,stage:41,attempt:1,at,result:{stage:41,outcome:'FAILED',isLeftWin:false,playerSide:'LEFT'},analysis});journal.finish({runId,at,kind:'DEFEAT_STOPPED',reason:'synthetic confirmed defeat'});
 const report=projectStageBattleHistory('A',app.history.list('A')).reports[0],payload={reportId:report.reportId,presetId:2,maxAttempts:1};return {app,session,report,payload};
}
for(const outcome of ['first-victory','defeat-then-victory','all-defeat','unknown-first'])test('bounded recommendation HTTP finite authorization follows only confirmed same-stage defeat '+outcome,async()=>{
 const {app,payload,session}=await recommendationHttpFixture({extraPreset:true});try{
  let battles=0;const request=session.client.request.bind(session.client);session.client.request=async(...args)=>{const value=await request(...args);if(args[0]!=='ChallengeStageRequest')return value;battles++;return {...value,initialData:{...value.initialData,...(outcome==='unknown-first'?{battleType:2}:{})},stats:{...value.stats,isLeftWin:outcome==='first-victory'||outcome==='defeat-then-victory'&&battles===2}};};
  const prepared=await app.call('/api/formations/recommendation/prepare',{body:{...payload,presetIds:[2,3],maxAttempts:2,maxDurationMs:60000}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.source.presetIds,[2,3]);assert.equal(app.requests.some(row=>['SaveFormationRequest','ChallengeStageRequest'].includes(row.name)),false);
  const started=await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});assert.equal(started.status,200,JSON.stringify(started.data));const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,approval={offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true};assert.ok(approval.offer);assert.equal(approval.offer.graph.runPolicy.maxActions,4);assert.equal(battles,0);
  const authorized=await app.call('/api/workflows/authorize-run',{body:approval});assert.equal(authorized.status,200,JSON.stringify(authorized.data));const terminal=outcome==='all-defeat'?'FAILED':outcome==='unknown-first'?'UNKNOWN':'COMPLETED',done=(await waitForWorkflow(app,terminal)).status;
  const expected=outcome==='first-victory'||outcome==='unknown-first'?1:2;assert.equal(battles,expected);assert.deepEqual(app.requests.filter(row=>row.name==='ChallengeStageRequest').map(row=>row.body.stage),Array(expected).fill(41));assert.deepEqual(app.requests.filter(row=>row.name==='SaveFormationRequest').map(row=>row.body.formation.presetId),[2,3].slice(0,expected));
  assert.equal(done.actionPlans,expected*2);assert.equal(done.running,false);assert.equal(done.trace.filter(row=>row.result==='CONFIRMED_DEFEAT').length,outcome==='defeat-then-victory'||outcome==='all-defeat'?1:0);
  const detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200,JSON.stringify(detail.data));assert.deepEqual(detail.data.preparation.source.presetIds,[2,3]);assert.equal(detail.data.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);
  const bytes=fs.readFileSync(app.history.storagePath,'utf8'),restarted=createExecutionHistory({file:app.history.storagePath});assert.equal(restarted.list('A').filter(row=>row.workflowId===done.runId).length,expected*2);assert.equal(restarted.unresolved('A'),outcome==='unknown-first');assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);
  assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.equal(battles,expected);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
test('bounded recommendation per-batch authorization requires four fresh original permits across confirmed defeat',async()=>{
 const {app,payload,session}=await recommendationHttpFixture({extraPreset:true});try{
  let battles=0;const request=session.client.request.bind(session.client);session.client.request=async(...args)=>{const value=await request(...args);if(args[0]!=='ChallengeStageRequest')return value;return {...value,stats:{...value.stats,isLeftWin:++battles===2}};};
  const prepared=await app.call('/api/formations/recommendation/prepare',{body:{...payload,presetIds:[2,3],maxAttempts:2,maxDurationMs:60000}});assert.equal(prepared.status,200);assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);
  const batches=new Set();for(let i=0;i<4;i++){
   const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(waiting.plan.module,i%2?'stage':'formation');assert.equal(app.requests.filter(r=>['SaveFormationRequest','ChallengeStageRequest'].includes(r.name)).length,i);assert.equal(batches.has(waiting.plan.batchId),false);batches.add(waiting.plan.batchId);
   const permit=await app.approve(waiting.plan);assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
   assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);assert.equal((await app.call('/api/workflows/resume',{body:{}})).status,200);
  }
  const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.trace.filter(row=>row.result==='CONFIRMED_DEFEAT').length,1);assert.equal(battles,2);assert.equal(app.operations.workflowBudget('A').state,'CLOSED');assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const mode of ['refused-next-save','unconfirmed-next-save','role','world','generation','connection','configuration','write-intent','result-persistence','memory-persistence','deadline'])test('bounded recommendation stops further dispatch at original shared boundary '+mode,async t=>{
 let boundaryNow=Date.now();if(mode==='deadline')t.mock.method(Date,'now',()=>boundaryNow);
 const {app,payload,session}=await recommendationHttpFixture({extraPreset:true});const put=app.history.put,list=app.history.list;try{
  let battles=0,saves=0;const request=session.client.request.bind(session.client);session.client.request=async(...args)=>{
   if(args[0]==='SaveFormationRequest'&&++saves===2){if(mode==='refused-next-save')throw Object.assign(Error('synthetic definite refusal'),{code:'SERVER_ERROR',serverError:1});if(mode==='unconfirmed-next-save')return {formation:structuredClone(args[1].formation)};}
   const value=await request(...args);if(args[0]!=='ChallengeStageRequest')return value;battles++;
   if(mode==='role')session.player.playerId='18';if(mode==='world')session.player.worldId=8;if(mode==='generation')session.generation++;if(mode==='connection')session.connectionId='changed';
   if(mode==='configuration')app.operations.saveModuleConfig('A',{module:'formation',config:{enabled:false,mainlineEnabled:false}});
   if(mode==='deadline')boundaryNow+=60001;
   return {...value,stats:{...value.stats,isLeftWin:false}};
  };
  const prepared=await app.call('/api/formations/recommendation/prepare',{body:{...payload,presetIds:[2,3],maxAttempts:2,maxDurationMs:60000}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));
  if(mode==='memory-persistence'){let pending=false;app.history.put=record=>{const result=put(record);if(record.module==='stage'&&record.actions.some(row=>row.result==='FAILED')&&!record.finishedAt)pending=true;return result;};app.history.list=(...args)=>{if(pending){pending=false;throw Error('synthetic execution memory origin unavailable');}return list(...args);};}
  if(mode==='write-intent'||mode==='result-persistence')app.history.put=record=>{if(record.module==='stage'&&(mode==='write-intent'?record.actions.some(row=>row.requestStatus==='DISPATCHING'):record.finishedAt))throw Object.assign(Error('synthetic bounded persistence failure'),{code:'HISTORY_UNAVAILABLE'});return put(record);};
  assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal((await app.call('/api/workflows/authorize-run',{body:{offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true}})).status,200);
  let done;for(let i=0;i<100;i++){done=(await app.call('/api/workflows')).data.status;if(!done.running)break;await new Promise(resolve=>setTimeout(resolve,15));}await app.operations.settle('A');done=(await app.call('/api/workflows')).data.status;
  assert.ok(['FAILED','UNKNOWN','STOPPED','CANCELLED','BLOCKED'].includes(done.status),JSON.stringify({status:done.status,reason:done.reason}));assert.equal(battles,mode==='write-intent'?0:1);assert.equal(saves,mode.endsWith('next-save')?2:1);assert.equal(app.operations.workflowBudget('A').state,'CLOSED');assert.equal(app.requests.filter(row=>row.name==='ChallengeStageRequest').length,battles);
  if(mode==='memory-persistence')assert.equal(app.history.list('A').find(row=>row.module==='stage'&&row.workflowId===done.runId).memoryPersistence.status,'FAILED');
  assert.notEqual((await app.call('/api/workflows/resume',{body:{}})).status,200);assert.equal(battles,mode==='write-intent'?0:1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{app.history.put=put;app.history.list=list;await app.close();}
});
for(const patch of [{presetIds:[2,2],maxDurationMs:1000},{presetIds:[3,2],maxDurationMs:1000},{presetIds:[2,3]},{maxDurationMs:1000},{presetIds:[2,3],maxDurationMs:86400001}])test('bounded recommendation HTTP rejects malformed scope before domain reads '+JSON.stringify(patch),async()=>{
 const {app,payload}=await recommendationHttpFixture({extraPreset:true});try{const before=app.requests.length,read=await app.call('/api/formations/recommendation/prepare',{body:{...payload,...patch}});assert.equal(read.status,400,JSON.stringify(read.data));assert.equal(app.requests.length,before);}finally{await app.close();}
});

test('recommendation HTTP stores confirmed defeat as FAILED and stops original Workflow without another save or battle',async()=>{
 const {app,payload,session}=await recommendationHttpFixture();try{
  const request=session.client.request.bind(session.client);session.client.request=async(...args)=>{const value=await request(...args);return args[0]==='ChallengeStageRequest'?{...value,stats:{...value.stats,isLeftWin:false}}:value;};
  const prepared=await app.call('/api/formations/recommendation/prepare',{body:{...payload,maxAttempts:3}});assert.equal(prepared.status,200);
  await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});let waiting=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');let permit=await app.approve(waiting.status.plan);
  await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});waiting=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');
  assert.equal(waiting.status.currentNode,'retry-mainline');permit=await app.approve(waiting.status.plan);await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');
  const runs=app.history.list('A').filter(row=>row.workflowId===waiting.status.runId),battle=runs.find(row=>row.module==='stage');assert.ok(battle);assert.equal(battle.finalStatus,'FAILED');assert.equal(battle.actions[0].verification.status,'CONFIRMED');assert.equal(battle.actions[0].unresolvedWrite,false);assert.equal(battle.actions[0].afterState.lastResult.playerSide,'LEFT');
  await app.call('/api/workflows/resume',{body:{}});const done=await waitForWorkflow(app,'FAILED');assert.match(done.status.reason,/确认战败/);assert.equal(done.status.running,false);
  assert.equal(app.requests.filter(row=>row.name==='SaveFormationRequest').length,1);assert.equal(app.requests.filter(row=>row.name==='ChallengeStageRequest').length,1);assert.equal(app.history.list('B').length,0);
  const snapshot=fs.readFileSync(app.history.storagePath,'utf8'),history=await app.call('/api/operations/history');assert.equal(history.status,200);assert.equal(history.data.runs.find(row=>row.runId===battle.runId).actions[0].verification.status,'CONFIRMED');assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),snapshot);
  const restarted=createExecutionHistory({file:app.history.storagePath});assert.equal(restarted.list('A').find(row=>row.runId===battle.runId).actions[0].verification.status,'CONFIRMED');assert.equal(restarted.list('A').find(row=>row.runId===battle.runId).finalStatus,'FAILED');assert.equal(restarted.unresolved('A'),false);assert.equal(restarted.list('B').length,0);assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),snapshot);
  const secondResume=await app.call('/api/workflows/resume',{body:{}});assert.notEqual(secondResume.status,200);assert.equal(app.requests.filter(row=>row.name==='ChallengeStageRequest').length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('recommendation HTTP prepares read-only source then original Workflow authorizes save, verifies and separately authorizes bounded retry',async()=>{
 const {app,payload}=await recommendationHttpFixture();try{
  const bytes=fs.readFileSync(app.history.storagePath,'utf8'),prepared=await app.call('/api/formations/recommendation/prepare',{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.source.reportId,payload.reportId);assert.equal(prepared.data.resumable,false);assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.equal(app.requests.filter(r=>['SaveFormationRequest','ChallengeStageRequest'].includes(r.name)).length,0);
  await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});let waiting=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');const first=waiting.status.plan;assert.equal(first.module,'formation');assert.equal(first.actions[0].actionId,prepared.data.graph.nodes[1].selection);
  let permit=await app.approve(first);await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});waiting=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');assert.equal(waiting.status.currentNode,'retry-mainline');assert.equal(waiting.status.plan.parameters.expectedStage,41);assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,0);
  permit=await app.approve(waiting.status.plan);await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');await app.call('/api/workflows/resume',{body:{}});const done=await waitForWorkflow(app,'COMPLETED');assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,1);assert.equal(done.status.preparation.source.reportId,payload.reportId);
  const entries=app.history.list('A');assert.equal(entries.filter(r=>r.workflowId===done.status.runId).length,2);assert.ok(entries.filter(r=>r.workflowId===done.status.runId).every(r=>r.finalStatus==='SUCCESS'));assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const mode of ['unknown-source','role','world','stage','busy','unknown','extra','query','csrf','no-session'])test('recommendation HTTP preserves exact source and common safety boundary '+mode,async()=>{
 const f=await recommendationHttpFixture(),{app,session}=f;try{
  let payload={...f.payload},route='/api/formations/recommendation/prepare',options={};if(mode==='unknown-source')payload.reportId='missing';if(mode==='role')session.player.playerId='18';if(mode==='world')session.player.worldId=8;if(mode==='stage')session.player.mainlineStage=42;if(mode==='busy')session.busy='unrelated';if(mode==='unknown')session.client.uncertainWrites.add('old');if(mode==='extra')payload.request='SaveFormationRequest';if(mode==='query')route+='?other=1';if(mode==='csrf')options.authorized=false;if(mode==='no-session')options.id='B';
  const before=app.requests.length,bytes=fs.readFileSync(app.history.storagePath,'utf8'),response=await app.call(route,{body:payload,...options});assert.ok([400,403,409].includes(response.status),JSON.stringify(response.data));assert.equal(app.requests.filter(r=>['SaveFormationRequest','ChallengeStageRequest'].includes(r.name)).length,0);assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);if(['extra','query','csrf','no-session','unknown-source','busy','unknown'].includes(mode))assert.equal(app.requests.length,before);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const mode of ['unconfirmed','refused','progress'])test('recommendation original Workflow prevents retry after '+mode,async()=>{
 const {app,session,payload}=await recommendationHttpFixture({unconfirmed:mode==='unconfirmed'});try{
  const prepared=await app.call('/api/formations/recommendation/prepare',{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});const pending=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');
  if(mode==='refused'){const request=session.client.request.bind(session.client);session.client.request=async(name,...args)=>{if(name==='SaveFormationRequest')throw Object.assign(Error('synthetic definite refusal'),{code:'SERVER_ERROR',serverError:1});return request(name,...args);};}
  const permit=await app.approve(pending.status.plan);await app.call('/api/operations/execute',{body:permit.data});await app.operations.settle('A');if(mode==='progress')session.player.mainlineStage=42;
  await app.call('/api/workflows/resume',{body:{}});const final=(await app.call('/api/workflows')).data.status;assert.ok(['UNKNOWN','FAILED','BLOCKED'].includes(final.status),JSON.stringify(final));assert.equal(app.requests.filter(r=>r.name==='ChallengeStageRequest').length,0);
  if(mode==='unconfirmed'){assert.equal(final.status,'UNKNOWN');assert.equal(session.client.uncertainWrites.has('SaveFormationRequest'),true);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).data.code,'STALE_PLAN');assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,1);}
 }finally{await app.close();}
});
for(const mode of ['role','world','generation','connection','configuration','history'])test('recommendation cancels source race during existing Formation survey '+mode,async()=>{
 const {app,session,payload}=await recommendationHttpFixture();try{
  const request=session.client.request.bind(session.client);let release,enter;const pending=new Promise(r=>release=r),entered=new Promise(r=>enter=r);session.client.request=async(name,...args)=>{if(name==='GetFormationRequest'){enter();await pending;}return request(name,...args);};
  const preparation=app.call('/api/formations/recommendation/prepare',{body:payload});await entered;
  if(mode==='role')session.player.playerId='18';if(mode==='world')session.player.worldId=8;if(mode==='generation')session.generation++;if(mode==='connection')session.connectionId='changed';if(mode==='configuration'){const blocked=await app.call('/api/gameplay/config',{body:{module:'formation',config:{enabled:false,mainlineEnabled:false}}});assert.equal(blocked.data.code,'ACCOUNT_BUSY');}if(mode==='history'){const run=app.history.list('A').find(r=>r.runId==='source-defeat');run.actions[0].battleAnalysis.reason='changed historical content';app.history.put(run);}
  release();const result=await preparation;assert.equal(result.status,mode==='configuration'?200:409,JSON.stringify(result.data));assert.equal(app.requests.filter(r=>['SaveFormationRequest','ChallengeStageRequest'].includes(r.name)).length,0);assert.equal((await app.call('/api/workflows')).data.status.status,'IDLE');
 }finally{await app.close();}
});

for(const entry of ['tasks','dailies','loop'])test('unified task observation HTTP uses original Service and durable read-only survey history '+entry,async()=>{
 const app=await harness({includeDailyReward:true});try{app.ready('A');await app.call();const rows=entry==='tasks'?{tasks:[{kind:'daily',taskId:1001,action:'observe'}]}:{dailies:[{taskId:1001,action:'observe'}]},intent={entry,...rows,budget:{resources:[],quotas:[],uids:[]},...(entry==='loop'?{rounds:2}:{})},before=app.requests.length;
 for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}}])assert.equal((await app.call('/api/workflows/prepare',{body:intent,...extra})).status,403);const prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(app.requests.length,before);const g=prepared.data.graph;assert.equal(g.nodes.some(n=>n.type==='ACTION'),false);assert.equal((await app.call('/api/workflows/simulate',{body:{graph:g}})).data.requestsSent,0);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.plan,null);assert.equal(done.runAuthorization,undefined);assert.equal(done.trace.filter(r=>r.result==='SURVEYED').length,entry==='loop'?2:1);assert.ok(app.requests.some(r=>r.name==='DailyTaskInfoRequest'));assert.equal(app.requests.some(r=>r.options?.mutate||r.name.startsWith('Draw')),false);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);assert.equal((await app.call('/api/gameplay?module=task-rewards')).data.config.enabled,false);
 const count=app.requests.length,detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.deepEqual(detail.data.nodes,[]);assert.equal(detail.data.surveys.length,entry==='loop'?2:1);for(const row of detail.data.surveys)assert.deepEqual(row.taskObservation,{kind:'daily',taskId:1001});assert.equal(app.requests.length,count);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}
});

for(const unconfirmed of [false,true])test('task observation never lends authority to a following claim or replays UNKNOWN '+unconfirmed,async()=>{
 const app=await harness({includeDailyReward:true,unconfirmed});try{app.ready('A');await app.enable();const surveyed=await app.survey({kind:'daily',taskId:1001});assert.equal(surveyed.status,200);const candidate=surveyed.data.view.candidates[0];assert.equal(candidate.executable,true);const intent={entry:'dailies',dailies:[{taskId:1001,action:'observe'},{taskId:1001,action:'claim'},{taskId:1001,action:'observe'}],budget:candidate.budgetClaims},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const g=prepared.data.graph;assert.deepEqual(g.nodes.map(n=>n.type),['START','SURVEY','ACTION','SURVEY','STOP']);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const pending=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(pending.trace.filter(r=>r.result==='SURVEYED').length,1);assert.equal(pending.runAuthorization,undefined);assert.equal(app.requests.filter(r=>r.name==='DrawDailyTaskRewardRequest').length,0);assert.equal((await app.call('/api/operations/execute',{body:{batchId:pending.plan.batchId,confirm:true}})).status,400);
 const permit=await app.approve(pending.plan);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const advancing=await app.call('/api/workflows/resume',{body:{}});assert.equal(advancing.status,200);const status=(await app.call('/api/workflows')).data.status;assert.equal(status.status,unconfirmed?'UNKNOWN':'COMPLETED',JSON.stringify(status));assert.equal(status.trace.filter(r=>r.result==='SURVEYED').length,unconfirmed?1:2);assert.equal(app.requests.filter(r=>r.name==='DrawDailyTaskRewardRequest').length,1);const replay=await app.call('/api/operations/execute',{body:permit.data});assert.equal(replay.status,409,JSON.stringify(replay.data));assert.equal(replay.data.code,'STALE_PLAN',JSON.stringify(replay.data));await app.call('/api/workflows/resume',{body:{}});assert.equal(app.requests.filter(r=>r.name==='DrawDailyTaskRewardRequest').length,1);
 }finally{await app.close();}
});

test('named cooldown HTTP save/simulate is offline and missing native source cannot authorize or dispatch',async()=>{
 const app=await harness({includeStage:true,includeFreeRecruit:true});try{await app.call();const g={version:1,id:'cooldown-http',name:'Named recruit cooldown',nodes:[{id:'s',type:'START'},{id:'w',type:'WAIT',cooldown:{kind:'FREE_RECRUIT',maxWaitMs:1000}},{id:'z',type:'STOP'}],edges:[{from:'s',to:'w'},{from:'w',to:'z'}]};for(const route of ['/api/workflows/save','/api/workflows/simulate','/api/workflows/start'])assert.equal((await app.call(route,{body:{graph:g},authorized:false})).status,403);const saved=await app.call('/api/workflows/save',{body:{graph:g}});assert.equal(saved.status,200,JSON.stringify(saved.data));const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.deepEqual(sim.data.trace.find(r=>r.type==='WAIT').cooldown,g.nodes[1].cooldown);assert.equal(sim.data.trace.find(r=>r.type==='WAIT').durationMs,null);assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.sessions.size,0);
 app.ready('A');assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const status=(await app.call('/api/workflows')).data.status;assert.equal(status.status,'UNKNOWN',JSON.stringify(status));assert.equal(status.authorizationOffer,undefined);assert.equal(status.plan,null);assert.equal((await app.call('/api/workflows/authorize-run',{body:{confirm:true}})).status,400);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);assert.deepEqual(app.requests.map(r=>r.name).sort(),['AllHeroRequest','AllItemRequest','AllResourceRequest','OnWaterRequest'].sort());assert.equal(app.requests.some(r=>r.options?.mutate),false);const readCount=app.requests.length;const detail=await app.call('/api/workflows/history?workflowRunId='+status.runId);assert.equal(app.requests.length,readCount);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.deepEqual(detail.data.waits,[]);assert.equal((await app.call('/api/workflows/history?workflowRunId='+status.runId,{id:'B'})).status,404);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const entry of ['tasks','dailies','loop'])test('unified named cooldown HTTP prepares offline and never dispatches without native source '+entry,async()=>{
 const app=await harness({includeStage:true,includeFreeRecruit:true});try{await app.call();const phase=entry==='loop'?'world':entry,intent={entry,id:'unified-cooldown-'+entry,[phase]:[{type:'WAIT',cooldown:{kind:'FREE_RECRUIT',maxWaitMs:1000}}],budget:{resources:[],quotas:[],uids:[]}};assert.equal((await app.call('/api/workflows/prepare',{body:intent,authorized:false})).status,403);const prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.blocked,[]);const g=prepared.data.graph;assert.deepEqual(g.nodes.map(n=>n.type),['START','WAIT','STOP']);assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const simulated=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(simulated.status,200);assert.equal(simulated.data.requestsSent,0);assert.equal(simulated.data.trace.find(r=>r.type==='WAIT').durationMs,null);assert.equal(app.requests.length,0);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 const bad=structuredClone(intent);bad[phase][0].cooldown.request='RecruitStartRequest';assert.equal((await app.call('/api/workflows/prepare',{body:bad})).status,400);app.ready('A');assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const done=(await app.call('/api/workflows')).data.status;assert.equal(done.status,'UNKNOWN',JSON.stringify(done));assert.equal(done.plan,null);assert.equal(done.authorizationOffer,undefined);assert.deepEqual(app.requests.map(r=>r.name).sort(),['AllHeroRequest','OnWaterRequest','AllItemRequest','AllResourceRequest'].sort());assert.equal(app.requests.some(r=>r.options?.mutate),false);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);const bytes=fs.readFileSync(path.join(root,'workflows.json'),'utf8'),detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);assert.equal(fs.readFileSync(path.join(root,'workflows.json'),'utf8'),bytes);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const entry of ['dailies','loop'])test(entry+' pirate preparation HTTP keeps exact UID/city offline and blocks only missing targets',async()=>{
 const app=await harness({includePirate:true,includeFreeRecruit:true});try{
  await app.call();const budget={resources:[],quotas:[{id:'pirate-sweep:2026-11-12',num:1}],uids:[{type:'pirate',id:'7'}]};
  const payload={entry,dailies:[{taskId:1010,action:'perform',parameters:{uid:7,cityId:9}}],budget};
  const prepared=await app.call('/api/workflows/prepare',{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));
  assert.equal(prepared.data.accountId,'A');assert.deepEqual(prepared.data.blocked,[]);
  const [action]=prepared.data.graph.nodes.filter(n=>n.type==='ACTION');assert.equal(action.module,'pirate-sweep');assert.deepEqual(action.parameters,{uid:7,cityId:9});
  assert.deepEqual(prepared.data.graph.budget,budget);
  for(const parameters of [{},{uid:7},{cityId:9}]){
   const result=await app.call('/api/workflows/prepare',{body:{...payload,dailies:[{taskId:1010,parameters},{taskId:1002}]}});
   assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.blocked[0].reason,'EXACT_PIRATE_TARGET_REQUIRED');
   assert.deepEqual(result.data.graph.nodes.filter(n=>n.type==='ACTION').map(n=>n.module),['free-recruit']);
  }
  for(const parameters of [{uid:2147483648,cityId:9},{uid:7,cityId:'9'},{uid:7,cityId:9,allowLowerLevel:'true'},{uid:7,cityId:9,request:'PirateSweepRequest'}])
   assert.equal((await app.call('/api/workflows/prepare',{body:{...payload,dailies:[{taskId:1010,parameters}]}})).status,400);
  assert.equal((await app.call('/api/workflows/prepare',{body:payload,authorized:false})).status,403);
  assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);
 }finally{await app.close();}
});


test('W18 registered read-only HTTP survey brackets the current port, preserves account scope and cannot authorize a fabricated sale',async()=>{
 for(const n of ['TradeInfoRequest','TradeInfoResponse','TradeCityRequest','TradeCityResponse'])protocol[n]=heroWireProtocol[n];
 const config={tables:{TradeGoodsCfg:{data:[{goodsId:1001,itemName:'生鱼片',capacity:1}]},TradeShipCfg:{data:[{lv:1,capacity:1000,profitMargin:300}]}}};
 const app=await harness({includeTrade:true,configOverride:config});try{
  const session=app.ready('A'),reads=[];session.player={playerId:'1',worldId:'1000001'};session.connectionId='trade-A';session.client.factContext={accountId:'A',connectionId:session.connectionId,generation:session.generation};session.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};
  const info={period:1,player:{coins:100,maxCoins:100,profit:0,buySpeedTimes:0,goods:[{pid:1,goodsId:1001,num:3,buyPrice:50,cityId:2}]},cargo:{cargoLv:1,cityId:1,moveStartTime:0,moveEndTime:0,moveToCityId:0}};
  session.client.request=async(name,body,response,_timeout,options)=>{assert.ok(!options.mutate);reads.push({name,body});assert.ok(['TradeInfoRequest','TradeCityRequest'].includes(name));return heroWire(response,name==='TradeInfoRequest'?info:{goods:[{goodsId:1001,stock:0,price:51}]});};
  const initial=await app.call('/api/gameplay?module=trade');assert.equal(initial.status,200);assert.equal(initial.data.config.enabled,false);assert.equal(reads.length,0);
  const result=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters:{}}});assert.equal(result.status,200);assert.equal(result.data.accountId,'A');assert.equal(result.data.view.status,'OBSERVED');assert.equal(result.data.view.quotes[0].total,154);assert.deepEqual(result.data.view.candidates,[]);assert.equal(reads.length,3);
  const other=await app.call('/api/gameplay?module=trade',{id:'B'});assert.equal(other.data.view,null);
  const bad=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters:{cityId:2}}});assert.equal(bad.status,400);assert.equal(reads.length,3);
  const blocked=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters:{},selections:['fake-sell']}});assert.notEqual(blocked.status,200);assert.equal(session.busy,null);assert.equal(reads.length,6);assert.equal(app.history.list('A').length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
  const g=graph('trade-read-only',[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'trade',parameters:{}},{id:'z',type:'STOP'}],[{from:'s',to:'q'},{from:'q',to:'z'}]);
  const start=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(start.status,200,JSON.stringify(start.data));const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(reads.length,9);
  const detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(done.runId));assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(detail.data.nodes.length,0);assert.equal(detail.data.surveys.length,1);assert.equal(detail.data.surveys[0].module,'trade');assert.deepEqual(detail.data.surveys[0].tradeObservation,{scope:'CURRENT_PORT_RESPONSE_ONLY',source:'TradeInfoResponse/TradeCityResponse/TradeInfoResponse',status:'OBSERVED',period:1,cityId:1,cargoLv:1,priceCount:1,holdingCount:1,nonLossPreviewCount:1,unknownQuoteCount:0});assert.equal(reads.length,9);assert.equal((await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(done.runId),{id:'B'})).status,404);
 }finally{await app.close();}
});


const {trustedGameClock:tradeHttpClock}=await import('../src/state-facts.mjs');
for(const n of ['TradeInfo','TradeCity','TradeSell','TradeBuy','TradeGuildRadar','TradeMove','TradeSpeed'])for(const s of ['Request','Response'])protocol[n+s]=heroWireProtocol[n+s];
const tradeSellHttpConfig={tables:Object.fromEntries(['TradeGoodsCfg','TradeShipCfg','ModuleOpenCfg','ActivityTradeCfg','ItemCfg'].map(n=>[n,structuredClone(merchantHttpActual.tables[n])]))};
async function tradeSellHttpReady(app,{unconfirmed=false,buy=false,move=false,speed=false}={}){
 const session=app.ready('A');session.player={playerId:'9007199254740993',worldId:'1000001',level:30};session.connectionId='trade-sale-http-A';const codec=createVipHttpCodec(heroWireProtocol),clock=tradeHttpClock({accountId:'A',generation:session.generation}),wallStart=Date.now(),serverNow=()=>10800000+Date.now()-wallStart;
 let socket;class Socket{constructor(){socket=this;this.readyState=0;}send(bytes){const frame=codec.decode(bytes);if(frame.name==='PingRequest')queueMicrotask(()=>this.receive('PingResponse',{clientTimestamp:frame.body.clientTimestamp,serverTimestamp:serverNow()}));}close(){this.readyState=3;}receive(n,b,seq=0){this.onmessage?.({data:codec.encode(n,seq,b)});}}
 const client=new VipHttpClient({protocol:heroWireProtocol,accountId:'A',generation:session.generation,WebSocketImpl:Socket,gameClock:clock});client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};client.on('error',()=>{});const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:session.player});await pending;socket.receive('SCAllActivity',{trade:{period:7,startTime:100,endTime:100000}},1);
 const state={info:{period:7,player:{coins:100,maxCoins:100,profit:0,buySpeedTimes:0,goods:[{pid:1,goodsId:1001,num:3,buyPrice:50,cityId:2}]},cargo:{cargoLv:1,cityId:1,moveStartTime:0,moveEndTime:0,moveToCityId:0},gotAchieveRwdId:0,gotReportRwdId:0,guildReportNum:0}};
 if(speed){Object.assign(state.info.cargo,{moveStartTime:10000,moveEndTime:17200,moveToCityId:2});state.items=[{itemId:'无关',num:9},{itemId:'海商王加速',num:4}];}
 client.request=async(n,b,r,_timeout,options={})=>{heroWire(n,b);if(options.mutate){options.beforeDispatch?.();assert.equal(n,speed?'TradeSpeedRequest':move?'TradeMoveRequest':buy?'TradeBuyRequest':'TradeSellRequest');const intent=app.history.list('A')[0];assert.equal(intent.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(intent.runBudget.reserved.quotas,[{id:speed?'trade:7:cargo-speed':move?'trade:7:cargo-move':buy?'trade:7:market:1:1001':'trade:7:holding:1',num:move||speed?1:2}]);if(!unconfirmed&&speed){state.info.cargo.moveEndTime-=1800*b.useNum;state.items.find(row=>row.itemId==='海商王加速').num-=b.useNum;}else if(!unconfirmed&&move){state.info.cargo={cargoLv:1,cityId:b.cityId,moveStartTime:Math.floor(serverNow()/1000),moveEndTime:Math.floor(serverNow()/1000)+7200,moveToCityId:b.mvToCityId};}else if(!unconfirmed&&buy){state.info.player.coins=20;state.info.player.goods.push({pid:99,goodsId:1001,num:2,buyPrice:40,cityId:1});}else if(!unconfirmed){state.info.player.coins=203;state.info.player.maxCoins=203;state.info.player.profit=3;state.info.player.goods[0].num=1;}}app.requests.push({id:'A',name:n,body:structuredClone(b),response:r});const value=n==='TradeSpeedRequest'?{moveEndTime:state.info.cargo.moveEndTime}:n==='TradeMoveRequest'?{cargo:state.info.cargo}:n==='TradeGuildRadarRequest'?{radar:[{cityId:1},{cityId:2}]}:['TradeSellRequest','TradeBuyRequest'].includes(n)?{player:state.info.player}:n==='TradeInfoRequest'?state.info:n==='TradeCityRequest'?{goods:[{goodsId:1001,stock:0,price:buy?40:51}]}:n==='AllItemRequest'?{items:state.items??[{itemId:'无关',num:9}]}:n==='AllResourceRequest'?{list:[{res:3,amount:100},{res:4,amount:50}]}:null;assert.ok(value,n);return heroWire(r,value);};session.client=client;return {session,client,state,socket};
}
for(const unconfirmed of [false,true])test('trade HTTP exact single sale preserves authorization, durable budget, independent verification and no replay '+unconfirmed,async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{({client}=await tradeSellHttpReady(app,{unconfirmed}));await app.call('/api/gameplay?module=trade');assert.equal((await app.call('/api/gameplay/config',{body:{module:'trade',config:{enabled:true}}})).status,200);const parameters={action:'sell',cityId:1,pid:1,num:2};
 const read=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}});assert.equal(read.status,200,JSON.stringify(read.data));const candidate=read.data.view.candidates[0];assert.equal(candidate.executable,true,JSON.stringify(candidate));assert.equal(candidate.action,undefined);assert.equal((await app.call('/api/gameplay?module=trade',{id:'B'})).data.view,null);
 const p=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[]);assert.deepEqual(p.data.budgetClaims,{resources:[],quotas:[{id:'trade:7:holding:1',num:2}],uids:[{type:'trade-holding',id:'7:1'}]});assert.equal(app.requests.filter(r=>r.name==='TradeSellRequest').length,0);assert.equal((await app.call('/api/operations/execute',{body:{batchId:p.data.batchId,confirm:true}})).status,400);
 const permit=await app.approve(p.data);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const run=(await app.call('/api/operations/history')).data.runs[0];assert.equal(run.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',run.stopReason);assert.equal(run.actions[0].verification.status,unconfirmed?'UNCONFIRMED':'CONFIRMED');assert.equal(app.requests.filter(r=>r.name==='TradeSellRequest').length,1);assert.deepEqual(app.requests.find(r=>r.name==='TradeSellRequest').body,{cityId:1,pid:1,sellNum:2});assert.deepEqual(run.runBudget.reserved.uids,p.data.budgetClaims.uids);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.equal((await app.call('/api/gameplay?module=trade')).data.status.blocked,unconfirmed);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});


for(const outcome of ['SUCCESS','UNKNOWN','REJECTED'])test('W19 Loop trade uses original HTTP preparation, shared permit, history and cross-entry memory '+outcome,async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{({client}=await tradeSellHttpReady(app,{unconfirmed:outcome!=='SUCCESS'}));await app.call('/api/gameplay?module=trade');await app.call('/api/gameplay/config',{body:{module:'trade',config:{enabled:true}}});const parameters={action:'sell',cityId:1,pid:1,num:2},observed=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}}),candidate=observed.data.view.candidates[0];assert.equal(candidate.executable,true);
 const before=app.requests.length,intent={entry:'loop',id:'trade-loop-'+outcome,world:[{type:'SURVEY',module:'trade',parameters:{}},{module:'trade',parameters,selection:{actionId:candidate.actionId}},{type:'SURVEY',module:'trade',parameters:{}}],budget:candidate.budgetClaims},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.blocked,[]);assert.equal(app.requests.length,before);const g=prepared.data.graph;assert.deepEqual(g.nodes.map(n=>n.type),['START','SURVEY','ACTION','SURVEY','STOP']);assert.deepEqual(g.budget,candidate.budgetClaims);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const pending=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(pending.plan.module,'trade');assert.deepEqual(pending.plan.parameters,parameters);assert.equal(pending.trace.filter(r=>r.result==='SURVEYED').length,1);assert.equal(app.requests.filter(r=>r.name==='TradeSellRequest').length,0);
 if(outcome==='REJECTED'){const send=client.request.bind(client);client.request=async(n,b,r,timeout,options)=>{if(n==='TradeSellRequest'){options.beforeDispatch();app.requests.push({id:'A',name:n,body:structuredClone(b)});throw Object.assign(Error('definite synthetic trade refusal'),{code:'REJECTED'});}return send(n,b,r,timeout,options);};}
 const permit=await app.approve(pending.plan);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');assert.equal((await app.call('/api/workflows/resume',{body:{}})).status,200);const final=(await app.call('/api/workflows')).data.status;assert.equal(final.status,outcome==='SUCCESS'?'COMPLETED':outcome==='REJECTED'?'FAILED':'UNKNOWN',JSON.stringify(final));assert.equal(final.trace.filter(r=>r.result==='SURVEYED').length,outcome==='SUCCESS'?2:1);
 const history=(await app.call('/api/operations/history')).data.runs;assert.equal(history.length,1);assert.equal(history[0].finalStatus,outcome);assert.equal(history[0].workflowId,pending.runId);assert.equal(history[0].workflowNodeId,g.nodes.find(n=>n.type==='ACTION').id);assert.deepEqual(history[0].runBudget.reserved.quotas,candidate.budgetClaims.quotas);assert.equal(app.requests.filter(r=>r.name==='TradeSellRequest').length,1);const detail=await app.call('/api/workflows/history?workflowRunId='+pending.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(detail.data.surveys.length,outcome==='SUCCESS'?2:1);assert.equal((await app.call('/api/workflows/history?workflowRunId='+pending.runId,{id:'B'})).status,404);
 assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);if(outcome!=='SUCCESS'){const direct=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(direct.status,409,JSON.stringify(direct.data));if(outcome==='REJECTED'){assert.equal(direct.data.code,'REJECTION_MEMORY_ACTIVE');assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const next=(await waitForWorkflow(app,'COMPLETED')).status;assert.ok(next.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));}else{const reads=app.requests.length,restarted=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(restarted.status,200);const stopped=(await app.call('/api/workflows')).data.status;assert.equal(stopped.running,false);assert.equal(stopped.plan,null);assert.ok(['FAILED','UNKNOWN'].includes(stopped.status),JSON.stringify(stopped));assert.equal(app.requests.length,reads);}}
 assert.equal(app.requests.filter(r=>r.name==='TradeSellRequest').length,1);assert.equal(app.history.list('A').length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});

for(const outcome of ['SUCCESS','UNKNOWN','REJECTED'])test('W19 Loop trade BUY uses original HTTP preparation, shared permit, history and cross-entry memory '+outcome,async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{({client}=await tradeSellHttpReady(app,{unconfirmed:outcome!=='SUCCESS',buy:true}));await app.call('/api/gameplay?module=trade');await app.call('/api/gameplay/config',{body:{module:'trade',config:{enabled:true}}});const parameters={action:'buy',cityId:1,goodsId:1001,num:2},observed=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}}),candidate=observed.data.view.candidates[0];assert.equal(candidate.executable,true);
 const before=app.requests.length,intent={entry:'loop',id:'trade-loop-'+outcome,world:[{type:'SURVEY',module:'trade',parameters:{}},{module:'trade',parameters,selection:{actionId:candidate.actionId}},{type:'SURVEY',module:'trade',parameters:{}}],budget:candidate.budgetClaims},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.blocked,[]);assert.equal(app.requests.length,before);const g=prepared.data.graph;assert.deepEqual(g.nodes.map(n=>n.type),['START','SURVEY','ACTION','SURVEY','STOP']);assert.deepEqual(g.budget,candidate.budgetClaims);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const pending=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(pending.plan.module,'trade');assert.deepEqual(pending.plan.parameters,parameters);assert.equal(pending.trace.filter(r=>r.result==='SURVEYED').length,1);assert.equal(app.requests.filter(r=>r.name==='TradeBuyRequest').length,0);
 if(outcome==='REJECTED'){const send=client.request.bind(client);client.request=async(n,b,r,timeout,options)=>{if(n==='TradeBuyRequest'){options.beforeDispatch();app.requests.push({id:'A',name:n,body:structuredClone(b)});throw Object.assign(Error('definite synthetic trade refusal'),{code:'REJECTED'});}return send(n,b,r,timeout,options);};}
 const permit=await app.approve(pending.plan);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');assert.equal((await app.call('/api/workflows/resume',{body:{}})).status,200);const final=(await app.call('/api/workflows')).data.status;assert.equal(final.status,outcome==='SUCCESS'?'COMPLETED':outcome==='REJECTED'?'FAILED':'UNKNOWN',JSON.stringify(final));assert.equal(final.trace.filter(r=>r.result==='SURVEYED').length,outcome==='SUCCESS'?2:1);
 const history=(await app.call('/api/operations/history')).data.runs;assert.equal(history.length,1);assert.equal(history[0].finalStatus,outcome);assert.equal(history[0].workflowId,pending.runId);assert.equal(history[0].workflowNodeId,g.nodes.find(n=>n.type==='ACTION').id);assert.deepEqual(history[0].runBudget.reserved.resources,candidate.costs);assert.deepEqual(history[0].runBudget.reserved.quotas,candidate.budgetClaims.quotas);assert.equal(app.requests.filter(r=>r.name==='TradeBuyRequest').length,1);const detail=await app.call('/api/workflows/history?workflowRunId='+pending.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(detail.data.surveys.length,outcome==='SUCCESS'?2:1);assert.equal((await app.call('/api/workflows/history?workflowRunId='+pending.runId,{id:'B'})).status,404);
 assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);if(outcome!=='SUCCESS'){const direct=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(direct.status,409,JSON.stringify(direct.data));if(outcome==='REJECTED'){assert.equal(direct.data.code,'REJECTION_MEMORY_ACTIVE');assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const next=(await waitForWorkflow(app,'COMPLETED')).status;assert.ok(next.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));}else{const reads=app.requests.length,restarted=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(restarted.status,200);const stopped=(await app.call('/api/workflows')).data.status;assert.equal(stopped.running,false);assert.equal(stopped.plan,null);assert.ok(['FAILED','UNKNOWN'].includes(stopped.status),JSON.stringify(stopped));assert.equal(app.requests.length,reads);}}
 assert.equal(app.requests.filter(r=>r.name==='TradeBuyRequest').length,1);assert.equal(app.history.list('A').length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});


for(const outcome of ['SUCCESS','UNKNOWN','REJECTED'])test('W19 Loop trade MOVE uses original HTTP preparation, shared permit, history and cross-entry memory '+outcome,async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{({client}=await tradeSellHttpReady(app,{unconfirmed:outcome!=='SUCCESS',move:true}));await app.call('/api/gameplay?module=trade');await app.call('/api/gameplay/config',{body:{module:'trade',config:{enabled:true}}});const parameters={action:'move',cityId:1,mvToCityId:2},observed=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}}),candidate=observed.data.view.candidates[0];assert.equal(candidate.executable,true);
 const before=app.requests.length,intent={entry:'loop',id:'trade-loop-'+outcome,world:[{type:'SURVEY',module:'trade',parameters:{}},{module:'trade',parameters,selection:{actionId:candidate.actionId}},{type:'SURVEY',module:'trade',parameters:{}}],budget:candidate.budgetClaims},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.blocked,[]);assert.equal(app.requests.length,before);const g=prepared.data.graph;assert.deepEqual(g.nodes.map(n=>n.type),['START','SURVEY','ACTION','SURVEY','STOP']);assert.deepEqual(g.budget,candidate.budgetClaims);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const pending=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(pending.plan.module,'trade');assert.deepEqual(pending.plan.parameters,parameters);assert.equal(pending.trace.filter(r=>r.result==='SURVEYED').length,1);assert.equal(app.requests.filter(r=>r.name==='TradeMoveRequest').length,0);
 if(outcome==='REJECTED'){const send=client.request.bind(client);client.request=async(n,b,r,timeout,options)=>{if(n==='TradeMoveRequest'){options.beforeDispatch();app.requests.push({id:'A',name:n,body:structuredClone(b)});throw Object.assign(Error('definite synthetic trade refusal'),{code:'REJECTED'});}return send(n,b,r,timeout,options);};}
 const permit=await app.approve(pending.plan);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');assert.equal((await app.call('/api/workflows/resume',{body:{}})).status,200);const final=(await app.call('/api/workflows')).data.status;assert.equal(final.status,outcome==='SUCCESS'?'COMPLETED':outcome==='REJECTED'?'FAILED':'UNKNOWN',JSON.stringify(final));assert.equal(final.trace.filter(r=>r.result==='SURVEYED').length,outcome==='SUCCESS'?2:1);
 const history=(await app.call('/api/operations/history')).data.runs;assert.equal(history.length,1);assert.equal(history[0].finalStatus,outcome);assert.equal(history[0].workflowId,pending.runId);assert.equal(history[0].workflowNodeId,g.nodes.find(n=>n.type==='ACTION').id);assert.deepEqual(history[0].runBudget.reserved.resources,candidate.costs);assert.deepEqual(history[0].runBudget.reserved.quotas,candidate.budgetClaims.quotas);assert.equal(app.requests.filter(r=>r.name==='TradeMoveRequest').length,1);assert.deepEqual(app.requests.find(r=>r.name==='TradeMoveRequest').body,{cityId:1,mvToCityId:2});assert.deepEqual(history[0].runBudget.reserved.uids,[{type:'trade-cargo',id:'7'}]);const detail=await app.call('/api/workflows/history?workflowRunId='+pending.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(detail.data.surveys.length,outcome==='SUCCESS'?2:1);assert.equal((await app.call('/api/workflows/history?workflowRunId='+pending.runId,{id:'B'})).status,404);
 assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);if(outcome!=='SUCCESS'){const direct=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(direct.status,409,JSON.stringify(direct.data));if(outcome==='REJECTED'){assert.equal(direct.data.code,'REJECTION_MEMORY_ACTIVE');assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const next=(await waitForWorkflow(app,'COMPLETED')).status;assert.ok(next.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));}else{const reads=app.requests.length,restarted=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(restarted.status,200);const stopped=(await app.call('/api/workflows')).data.status;assert.equal(stopped.running,false);assert.equal(stopped.plan,null);assert.ok(['FAILED','UNKNOWN'].includes(stopped.status),JSON.stringify(stopped));assert.equal(app.requests.length,reads);}}
 assert.equal(app.requests.filter(r=>r.name==='TradeMoveRequest').length,1);assert.equal(app.history.list('A').length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});


for(const outcome of ['SUCCESS','UNKNOWN','REJECTED'])test('W19 Loop trade owned SPEED uses original HTTP preparation, shared permit, history and cross-entry memory '+outcome,async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{({client}=await tradeSellHttpReady(app,{unconfirmed:outcome!=='SUCCESS',speed:true}));await app.call('/api/gameplay?module=trade');await app.call('/api/gameplay/config',{body:{module:'trade',config:{enabled:true}}});const parameters={action:'speed',cityId:1,mvToCityId:2,num:1},observed=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}}),candidate=observed.data.view.candidates[0];assert.equal(candidate.executable,true);
 const before=app.requests.length,intent={entry:'loop',id:'trade-loop-'+outcome,world:[{type:'SURVEY',module:'trade',parameters:{}},{module:'trade',parameters,selection:{actionId:candidate.actionId}},{type:'SURVEY',module:'trade',parameters:{}}],budget:candidate.budgetClaims},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.blocked,[]);assert.equal(app.requests.length,before);const g=prepared.data.graph;assert.deepEqual(g.nodes.map(n=>n.type),['START','SURVEY','ACTION','SURVEY','STOP']);assert.deepEqual(g.budget,candidate.budgetClaims);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const pending=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(pending.plan.module,'trade');assert.deepEqual(pending.plan.parameters,parameters);assert.equal(pending.trace.filter(r=>r.result==='SURVEYED').length,1);assert.equal(app.requests.filter(r=>r.name==='TradeSpeedRequest').length,0);
 if(outcome==='REJECTED'){const send=client.request.bind(client);client.request=async(n,b,r,timeout,options)=>{if(n==='TradeSpeedRequest'){options.beforeDispatch();app.requests.push({id:'A',name:n,body:structuredClone(b)});throw Object.assign(Error('definite synthetic trade refusal'),{code:'REJECTED'});}return send(n,b,r,timeout,options);};}
 const permit=await app.approve(pending.plan);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');assert.equal((await app.call('/api/workflows/resume',{body:{}})).status,200);const final=(await app.call('/api/workflows')).data.status;assert.equal(final.status,outcome==='SUCCESS'?'COMPLETED':outcome==='REJECTED'?'FAILED':'UNKNOWN',JSON.stringify(final));assert.equal(final.trace.filter(r=>r.result==='SURVEYED').length,outcome==='SUCCESS'?2:1);
 const history=(await app.call('/api/operations/history')).data.runs;assert.equal(history.length,1);assert.equal(history[0].finalStatus,outcome);assert.equal(history[0].workflowId,pending.runId);assert.equal(history[0].workflowNodeId,g.nodes.find(n=>n.type==='ACTION').id);assert.deepEqual(history[0].runBudget.reserved.resources,candidate.costs);assert.deepEqual(history[0].runBudget.reserved.quotas,candidate.budgetClaims.quotas);assert.equal(app.requests.filter(r=>r.name==='TradeSpeedRequest').length,1);assert.deepEqual(app.requests.find(r=>r.name==='TradeSpeedRequest').body,{useNum:1});assert.deepEqual(history[0].runBudget.reserved.uids,[{type:'trade-cargo',id:'7'}]);const detail=await app.call('/api/workflows/history?workflowRunId='+pending.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(detail.data.surveys.length,outcome==='SUCCESS'?2:1);assert.equal((await app.call('/api/workflows/history?workflowRunId='+pending.runId,{id:'B'})).status,404);
 assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);if(outcome==='REJECTED'){const reread=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}});assert.equal(reread.data.view.candidates[0].executable,true,JSON.stringify(reread.data.view.candidates[0]));assert.equal(reread.data.view.candidates[0].actionId,candidate.actionId,JSON.stringify(reread.data.view.candidates[0]));}if(outcome!=='SUCCESS'){const direct=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(direct.status,409,JSON.stringify(direct.data));if(outcome==='REJECTED'){assert.equal(direct.data.code,'REJECTION_MEMORY_ACTIVE');assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const next=(await waitForWorkflow(app,'COMPLETED')).status;assert.ok(next.trace.some(r=>r.result==='BLOCKED_REJECTION_MEMORY'));}else{const reads=app.requests.length,restarted=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(restarted.status,200);const stopped=(await app.call('/api/workflows')).data.status;assert.equal(stopped.running,false);assert.equal(stopped.plan,null);assert.ok(['FAILED','UNKNOWN'].includes(stopped.status),JSON.stringify(stopped));assert.equal(app.requests.length,reads);}}
 assert.equal(app.requests.filter(r=>r.name==='TradeSpeedRequest').length,1);assert.equal(app.history.list('A').length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});


for(const entry of ['tasks','dailies','loop'])test('trade leg WAIT HTTP unified preparation stays offline and exact two surveys persist read-only '+entry,async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{
 await app.call();const phase=entry==='loop'?'world':entry,policy={kind:'TRADE_LEG_END',cityId:1,mvToCityId:2,maxWaitMs:1000},intent={entry,id:'trade-clock-'+entry,[phase]:[{type:'WAIT',cooldown:policy}],budget:{resources:[],quotas:[],uids:[]}};
 assert.equal((await app.call('/api/workflows/prepare',{body:intent,authorized:false})).status,403);const prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.blocked,[]);const g=prepared.data.graph;assert.deepEqual(g.nodes.map(n=>n.type),['START','WAIT','STOP']);assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.deepEqual(sim.data.trace.find(r=>r.type==='WAIT').cooldown,policy);assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.sessions.size,0);
 const f=await tradeSellHttpReady(app,{move:true});client=f.client;Object.assign(f.state.info.cargo,{moveStartTime:10000,moveEndTime:10799,moveToCityId:2});assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.plan,null);assert.equal(done.authorizationOffer,undefined);assert.deepEqual(done.trace.filter(r=>r.type==='WAIT').map(r=>[r.result,r.durationMs]),[['WAIT_STARTED',0],['WAITED',0]]);assert.equal(app.requests.filter(r=>r.name==='TradeInfoRequest').length,4);assert.ok(app.requests.every(r=>['TradeInfoRequest','TradeGuildRadarRequest','AllItemRequest','AllResourceRequest'].includes(r.name)));assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);assert.equal((await app.call('/api/workflows/authorize-run',{body:{confirm:true}})).status,400);
 const before=app.requests.length,bytes=fs.readFileSync(path.join(root,'workflows.json'),'utf8'),detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(detail.data.waits.length,2);assert.ok(detail.data.waits.every(r=>r.cooldownWait.observation.arrivalConfirmed===false&&r.cooldownWait.observation.executable===false));assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);const {createWorkflowStore}=await import('../src/workflow.mjs'),saved=createWorkflowStore({file:path.join(root,'workflows.json'),modules:app.operations.modules}).history('A').find(r=>r.runId===done.runId);assert.equal(saved.status,'COMPLETED');assert.equal(saved.resumable,false);assert.equal(saved.runAuthorization,undefined);assert.equal(app.requests.length,before);assert.equal(fs.readFileSync(path.join(root,'workflows.json'),'utf8'),bytes);
 }finally{client?.stop();await app.close();}
});
for(const fault of ['missing-source','changed-leg','unresolved'])test('trade leg WAIT HTTP fails closed without writes or replay for '+fault,async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{await app.call();const f=await tradeSellHttpReady(app,{move:true});client=f.client;Object.assign(f.state.info.cargo,{moveStartTime:10000,moveEndTime:10799,moveToCityId:2});if(fault==='missing-source')f.socket.receive('SCAllActivity',{},2);if(fault==='unresolved')client.uncertainWrites.add('TradeMoveRequest');if(fault==='changed-leg'){const original=client.request;let n=0;client.request=async(...args)=>{if(args[0]==='TradeInfoRequest'&&++n===3)f.state.info.cargo.moveStartTime--;return original(...args);};}
 const g={version:1,id:'trade-clock-fail-'+fault,name:'trade leg',nodes:[{id:'s',type:'START'},{id:'w',type:'WAIT',cooldown:{kind:'TRADE_LEG_END',cityId:1,mvToCityId:2,maxWaitMs:1000}},{id:'z',type:'STOP'}],edges:[{from:'s',to:'w'},{from:'w',to:'z'}]};assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);let done;for(let i=0;i<30;i++){done=(await app.call('/api/workflows')).data.status;if(!done.running)break;}assert.ok(['UNKNOWN','FAILED'].includes(done.status),JSON.stringify(done));assert.equal(done.plan,null);assert.equal(done.trace.some(r=>r.result==='WAITED'),false);assert.ok(app.requests.every(r=>['TradeInfoRequest','TradeGuildRadarRequest','AllItemRequest','AllResourceRequest'].includes(r.name)));assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);if(fault==='unresolved'){assert.equal(app.requests.length,0);assert.ok(client.uncertainWrites.has('TradeMoveRequest'));}const before=app.requests.length;await app.call('/api/workflows/resume',{body:{}});assert.equal(app.requests.length,before);
 }finally{client?.stop();await app.close();}
});


test('trade leg WAIT HTTP completion retains original durable refusal across Tasks Dailies and direct planning',async()=>{
 const app=await harness({includeTrade:true,configOverride:tradeSellHttpConfig});let client;try{const f=await tradeSellHttpReady(app,{unconfirmed:true});client=f.client;await app.call('/api/gameplay?module=trade');await app.call('/api/gameplay/config',{body:{module:'trade',config:{enabled:true}}});const parameters={action:'sell',cityId:1,pid:1,num:2},original=structuredClone(f.state.info.cargo),observed=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}}),candidate=observed.data.view.candidates[0];assert.equal(candidate.executable,true);const planned=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(planned.status,200);const send=client.request;client.request=async(n,b,r,timeout,options)=>{if(n==='TradeSellRequest'){options.beforeDispatch();app.requests.push({id:'A',name:n,body:structuredClone(b)});throw Object.assign(Error('definite synthetic refusal'),{code:'REJECTED'});}return send(n,b,r,timeout,options);};const permit=await app.approve(planned.data);assert.equal(permit.status,200);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');assert.equal(app.history.list('A')[0].finalStatus,'REJECTED');
 Object.assign(f.state.info.cargo,{moveStartTime:10000,moveEndTime:10799,moveToCityId:2});for(const entry of ['tasks','dailies']){const intent={entry,[entry]:[{type:'WAIT',cooldown:{kind:'TRADE_LEG_END',cityId:1,mvToCityId:2,maxWaitMs:1000}}],budget:{resources:[],quotas:[],uids:[]}},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200);assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.trace.filter(r=>r.result==='WAITED').length,1);assert.equal(done.plan,null);}
 f.state.info.cargo=original;const reread=await app.call('/api/gameplay/survey',{body:{module:'trade',parameters}});assert.equal(reread.data.view.candidates[0].actionId,candidate.actionId);assert.equal(reread.data.view.candidates[0].executable,true);const refused=await app.call('/api/operations/plan',{body:{module:'trade',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(refused.status,409,JSON.stringify(refused.data));assert.equal(refused.data.code,'REJECTION_MEMORY_ACTIVE');assert.equal(app.requests.filter(r=>r.name==='TradeSellRequest').length,1);assert.equal(app.history.list('A').length,1);assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);
 }finally{client?.stop();await app.close();}
});

for(const entry of ['dailies','loop'])test('unified '+entry+' HTTP prepare binds Cargo to Fleet and preserves separate task observation and claim',async()=>{
 const app=await harness({includeCargo:true});try{
  await app.call();const intent={entry,dailies:[{taskId:1008,action:'perform',parameters:{shipIndex:2,cargoIndex:3}},{taskId:1008,action:'observe'},{taskId:1008,action:'claim'}],budget:{resources:[{id:'木材',num:4}],quotas:[],uids:[]}};
  assert.equal((await app.call('/api/workflows/prepare',{body:intent,headers:{'x-cw-csrf':'wrong'}})).status,403);
  const result=await app.call('/api/workflows/prepare',{body:intent});assert.equal(result.status,200,JSON.stringify(result.data));assert.deepEqual(result.data.blocked,[]);
  const nodes=result.data.graph.nodes.filter(n=>['ACTION','SURVEY'].includes(n.type));assert.deepEqual(nodes.map(n=>[n.type,n.module]),[['ACTION','fleet'],['SURVEY','task-rewards'],['ACTION','task-rewards']]);assert.deepEqual(nodes[0].selection,{actionId:'fleet:cargoFill:2:3'});assert.deepEqual(nodes[0].parameters,{shipIndex:2,cargoIndex:3});assert.deepEqual(result.data.graph.budget,intent.budget);
  for(const parameters of [{shipIndex:1},{shipIndex:1,cargoIndex:1,cityId:1},{shipIndex:1,cargoIndex:1,request:'DrawShipRewardRequest'}])assert.equal((await app.call('/api/workflows/prepare',{body:{...intent,dailies:[{taskId:1008,parameters}]}})).status,400);
  assert.equal(app.requests.length,0);assert.equal(app.history.list('A').length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('Orders Function HTTP survey returns the shared captured wait without granting writes or crossing accounts',async()=>{
 const saved=Object.fromEntries(['GameEffectRequest','GameEffectResponse'].map(name=>[name,protocol[name]]));
 protocol.GameEffectRequest={};protocol.GameEffectResponse={};
 const config={tables:{OrderParamCfg:{data:[{paramName:'订单每日上限',paramValue:40}]},BuildingCfg:{data:[{buildingType:'材料厂'}]},BuildingProduceCfg:{data:[{buildType:'材料厂',itemId:'cloth',produceTime:30,unlockLevel:1,costItem:[['wood',1]]}]},WorkerOrderCfg:{data:[{itemId:'cloth',reward:[['EXP',1]]}]},WorkerSpecOrderCfg:{data:[]}}};
 const app=await harness({includeOrders:true,configOverride:config}),reads=[];
 try{
  const session=app.ready('A');
  session.client.request=async(name,body,response,_timeout,options)=>{
   assert.notEqual(options?.mutate,true);reads.push(name);assert.deepEqual(body,{});
   const bodies={OnWaterRequest:{building:[{buildingId:'1材料厂',level:1,buildFinishTime:0,factory:{autoProductId:'',factoryQ:[],finishedProducts:[]}}],workerOrder:[{index:0,workerId:'synthetic-worker',textId:1,isSpecial:false,refreshTime:0,requirements:[{id:'cloth',num:2}]}],orderOfTheDay:{orderNum:0,rewardedNum:0}},AllItemRequest:{items:[{itemId:'wood',num:4}]},AllResourceRequest:{list:[]},MyResFieldsRequest:{info:{fields:[]}},MyFleetsRequest:{fleets:[]},GameEffectRequest:{effects:[{id:1,value:0},{id:2,value:0},{id:18,value:5}]}};
   assert.ok(Object.hasOwn(bodies,name));return heroWire(response,bodies[name]);
  };
  assert.equal((await app.call('/api/gameplay?module=orders')).status,200);
  const result=await app.call('/api/gameplay/survey',{body:{module:'orders',parameters:{}}});assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(result.data.view.orders[0].productionWait.status,'PROJECTED');assert.equal(result.data.view.orders[0].productionWait.leadSeconds,60);assert.equal(result.data.view.orders[0].productionWait.executable,false);assert.equal(result.data.view.candidates[0].executable,false);assert.equal(result.data.lastPlan,null);
  assert.equal(result.data.view.progress.completed.value,0);assert.equal(result.data.view.progress.rewardedThrough.value,0);assert.equal(result.data.view.progress.clientLimit.value,45);assert.equal(result.data.view.progress.remainingProjection.value,45);assert.equal(result.data.view.progress.period.status,'UNKNOWN');assert.equal(result.data.view.orders[0].refreshTiming.status,'OBSERVED_NO_MARKER');assert.equal(result.data.view.candidates[0].refreshTiming,undefined);
  const cached=await app.call('/api/gameplay?module=orders');assert.equal(cached.data.view.orders[0].productionWait.leadSeconds,60);assert.equal(reads.length,6);assert.equal(reads.filter(name=>name==='GameEffectRequest').length,1);
  const other=await app.call('/api/gameplay?module=orders',{id:'B'});assert.equal(other.status,200);assert.equal(other.data.accountId,'B');assert.equal(other.data.view,null);
  for(const entry of ['tasks','loop']){
   const intent={entry,tasks:[{kind:'orderDaily',action:'observe'}],...(entry==='loop'?{rounds:2}:{}),budget:{resources:[],quotas:[],uids:[]}},before=reads.length;
   const prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.blocked,[]);assert.equal(reads.length,before);const graph=prepared.data.graph;assert.equal(graph.nodes.some(n=>n.type==='ACTION'),false);const started=await app.call('/api/workflows/start',{body:{graph}});assert.equal(started.status,200,JSON.stringify(started.data));
   const done=(await waitForWorkflow(app,'COMPLETED')).status,count=entry==='loop'?2:1;assert.equal(done.status,'COMPLETED');assert.equal(done.plan,null);assert.equal(done.runAuthorization,undefined);assert.equal(done.trace.filter(r=>r.type==='SURVEY'&&r.module==='orders'&&r.result==='SURVEYED').length,count);assert.equal(reads.length,before+6*count);assert.equal((await app.call('/api/gameplay?module=orders')).data.lastPlan,null);
   const file=path.join(root,'workflows.json'),bytes=fs.readFileSync(file,'utf8'),detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal(detail.data.surveys.length,count);assert.ok(detail.data.surveys.every(r=>r.module==='orders'&&r.orderProgress.completed.value===0&&r.orderProgress.rewardedThrough.value===0&&r.orderProgress.period.status==='UNKNOWN'&&r.orderProgress.executable===false));assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);
   const {createWorkflowStore}=await import('../src/workflow.mjs'),reopened=createWorkflowStore({file,modules:app.operations.modules}),saved=reopened.history('A').find(r=>r.runId===done.runId);assert.equal(saved.resumable,false);assert.equal(saved.runAuthorization,undefined);assert.equal(saved.trace.filter(r=>r.module==='orders'&&r.result==='SURVEYED').length,count);assert.deepEqual(reopened.history('B'),[]);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(reads.length,before+6*count);
  }
  assert.equal((await app.call('/api/operations/history')).data.runs.length,0);assert.equal(app.counts().clients,0);assert.equal(app.counts().collections,0);
 }finally{await app.close();for(const [name,value]of Object.entries(saved)){if(value===undefined)delete protocol[name];else protocol[name]=value;}}
});

test('production queue clock original HTTP prepares offline and persists only same-target clock evidence without game writes',async()=>{
 const config={tables:{BuildingCfg:{data:[{buildingType:'材料厂'}]},BuildingProduceCfg:{data:[{buildType:'材料厂',itemId:'cloth',produceTime:30,unlockLevel:1,costItem:[]}]},WorkerOrderCfg:{data:[]},WorkerSpecOrderCfg:{data:[]}}},app=await harness({includeProduction:true,configOverride:config}),reads=[];let count=0,now=100990;
 try{
  await app.call('/api/gameplay?module=production');const intent={entry:'tasks',tasks:[{type:'WAIT',cooldown:{kind:'FACTORY_QUEUE_CLOCK',buildingId:'1材料厂',index:0,maxWaitMs:1000}}],budget:{resources:[],quotas:[],uids:[]}},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(app.sessions.size,0);assert.equal(reads.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});const graph=prepared.data.graph;assert.deepEqual(graph.nodes.map(n=>n.type),['START','WAIT','STOP']);
  const session=app.ready('A');session.connectionId='production-http-A';session.player={playerId:'17',worldId:9,level:5,mainlineStage:41};session.client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};session.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:session.generation,nowMs:now,earliestMs:now,latestMs:now+1})};session.client.request=async(name,body,response,_timeout,options)=>{assert.notEqual(options?.mutate,true);assert.deepEqual(body,{});reads.push(name);if(name==='OnWaterRequest'&&++count>1)now=101000;const bodies={OnWaterRequest:{building:[{buildingId:'1材料厂',level:1,buildFinishTime:0,factory:{autoProductId:'',factoryQ:[{idx:0,productId:'cloth',finishTime:101}],finishedProducts:[]}}],workerOrder:[],orderOfTheDay:{orderNum:0,rewardedNum:0}},AllItemRequest:{items:[]},AllResourceRequest:{list:[]},MyResFieldsRequest:{info:{fields:[]}},MyFleetsRequest:{fleets:[]},AllHeroRequest:{heroes:[]},AppointInfoRequest:{heroes:[]}};assert.ok(Object.hasOwn(bodies,name));return heroWire(response,bodies[name]);};
  const started=await app.call('/api/workflows/start',{body:{graph}});assert.equal(started.status,200,JSON.stringify(started.data));const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.status,'COMPLETED');assert.equal(done.plan,null);assert.equal(done.runAuthorization,undefined);assert.equal(count,2);assert.ok(reads.every(n=>n!=='GameEffectRequest'));assert.equal((await app.call('/api/gameplay?module=production',{id:'B'})).data.view,null);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);
  const file=path.join(root,'workflows.json'),bytes=fs.readFileSync(file,'utf8'),before=reads.length,detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.waits.length,2);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.ok(detail.data.waits.every(r=>r.cooldownWait.observation.target.index===0&&r.cooldownWait.observation.collectionConfirmed===false&&r.cooldownWait.observation.executable===false));assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);const {createWorkflowStore}=await import('../src/workflow.mjs'),saved=createWorkflowStore({file,modules:app.operations.modules}).history('A').find(r=>r.runId===done.runId);assert.equal(saved.resumable,false);assert.equal(saved.runAuthorization,undefined);assert.equal(reads.length,before);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

async function empiricalHttpFixture(){
 const f=await recommendationHttpFixture({extraPreset:true}),{createStandaloneStageJournal}=await import('../src/stage-history.mjs'),{battleAnalysis}=await import('../src/formation.mjs');
 for(const presetId of [2,3])for(const attempt of [1,2]){
  const pos={x:presetId===2?5:9,y:5},win=presetId===3,at='2026-11-15T00:00:00.000Z',runId='empirical-'+presetId+'-'+attempt;
  const analysis=battleAnalysis({initialData:{mainlineStage:41,battleType:1,leftTeam:{presetId,members:[{hero:{heroId:'tank'},pos}]},rightTeams:[{members:[{hero:{heroId:'enemy'},pos:{x:2,y:3}}]}]},stats:{isLeftWin:win,leftHeroDamages:[{heroId:'tank',pos,leftHp:win?10:0,statBar:{damage:{physical:1,magic:0,true:0}}}]}}),journal=createStandaloneStageJournal(f.app.history,{accountId:'A',playerId:'17',worldId:7,generation:f.session.generation,connectionId:'old-statistics-connection'});
  journal.start({runId,stage:41,at,config:{}});journal.dispatch({runId,stage:41,attempt:1,at});journal.settle({runId,stage:41,attempt:1,at,result:{stage:41,outcome:win?'SUCCESS':'FAILED',isLeftWin:win,playerSide:'LEFT'},analysis});journal.finish({runId,at,kind:win?'COMPLETED':'DEFEAT_STOPPED',reason:'synthetic observed result'});
 }
 f.payload={...f.payload,presetIds:[2,3],maxAttempts:2,maxDurationMs:60000,selectionRule:'OBSERVED_WIN_RATE',minSamples:2};return f;
}
for(const outcome of ['victory','defeat-then-victory','unknown'])test('empirical recommendation HTTP derives original History order and keeps finite authorization '+outcome,async()=>{
 const {app,session,payload}=await empiricalHttpFixture();try{
  let battles=0;const request=session.client.request.bind(session.client);session.client.request=async(...args)=>{const value=await request(...args);if(args[0]!=='ChallengeStageRequest')return value;battles++;return {...value,initialData:{...value.initialData,...(outcome==='unknown'?{battleType:2}:{})},stats:{...value.stats,isLeftWin:outcome==='victory'||outcome==='defeat-then-victory'&&battles===2}};};
  const bytes=fs.readFileSync(app.history.storagePath,'utf8'),prepared=await app.call('/api/formations/recommendation/prepare',{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.source.presetIds,[3,2]);assert.equal(prepared.data.source.statistics.minSamples,2);assert.deepEqual(prepared.data.source.statistics.entries.map(r=>[r.presetId,r.wins,r.losses]),[[2,0,2],[3,2,0]]);assert.equal(prepared.data.graph.nodes.find(r=>r.id==='save-0').parameters.presetId,3);assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.equal(app.requests.some(r=>['SaveFormationRequest','ChallengeStageRequest'].includes(r.name)),false);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const waiting=await waitForWorkflow(app,'AWAITING_AUTHORIZATION');assert.equal(battles,0);const approval={offer:waiting.status.authorizationOffer,batchId:waiting.status.plan.batchId,planHash:waiting.status.plan.planHash,confirm:true};assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);const done=(await waitForWorkflow(app,outcome==='unknown'?'UNKNOWN':'COMPLETED')).status,expected=outcome==='defeat-then-victory'?2:1;assert.equal(battles,expected);assert.deepEqual(app.requests.filter(r=>r.name==='SaveFormationRequest').map(r=>r.body.formation.presetId),[3,2].slice(0,expected));assert.deepEqual(app.requests.filter(r=>r.name==='ChallengeStageRequest').map(r=>r.body.stage),Array(expected).fill(41));
  const restored=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.deepEqual(restored.data.preparation.source.statistics,prepared.data.source.statistics);assert.equal(restored.data.resumable,false);const {createWorkflowStore}=await import('../src/workflow.mjs'),workflowFile=path.join(root,'workflows.json'),workflowBytes=fs.readFileSync(workflowFile,'utf8'),restoredWorkflow=createWorkflowStore({file:workflowFile,modules:app.operations.modules}).history('A').find(row=>row.runId===done.runId);assert.deepEqual(restoredWorkflow.preparation.source.statistics,prepared.data.source.statistics);assert.equal(restoredWorkflow.resumable,false);assert.equal(restoredWorkflow.runAuthorization.resumable,false);assert.deepEqual(Object.keys(restoredWorkflow.runAuthorization).sort(),['approvedAt','resumable','scope']);assert.deepEqual(restoredWorkflow.runAuthorization.scope.graph.preparation.source.statistics,prepared.data.source.statistics);assert.equal(fs.readFileSync(workflowFile,'utf8'),workflowBytes);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.equal(battles,expected);const disk=fs.readFileSync(app.history.storagePath,'utf8'),history=createExecutionHistory({file:app.history.storagePath});assert.equal(history.unresolved('A'),outcome==='unknown');assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),disk);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const mode of ['insufficient','foreign-scope','foreign-stage','growth','duplicate','conflict','body-reports','body-statistics','missing-minimum','invalid-rule','missing-sequence'])test('empirical HTTP never accepts missing or caller supplied sample authority '+mode,async()=>{
 const {app,payload}=await empiricalHttpFixture();try{
  const body=structuredClone(payload);if(mode==='insufficient')body.minSamples=3;if(mode==='missing-minimum')delete body.minSamples;if(mode==='invalid-rule')body.selectionRule='RETRY_UNKNOWN';if(mode==='missing-sequence')delete body.presetIds;if(mode==='body-reports')body.reports=[];if(mode==='body-statistics')body.statistics={wins:100};
  if(['foreign-scope','foreign-stage','growth','duplicate','conflict'].includes(mode)){const run=app.history.list('A').find(r=>r.runId==='empirical-2-1');if(mode==='foreign-scope')run.executionContext.worldId=8;if(mode==='foreign-stage')run.actions[0].battleAnalysis.stage=42;if(mode==='growth')run.actions[0].battleAnalysis.leftTeam.raw.members[0].hero.level=2;if(mode==='duplicate'){run.actions.push(structuredClone(run.actions[0]));body.minSamples=3;}if(mode==='conflict'){const a=run.actions[0];run.actions.push({...structuredClone(a),battleAnalysis:{...structuredClone(a.battleAnalysis),leftTeam:{...structuredClone(a.battleAnalysis.leftTeam),raw:{...structuredClone(a.battleAnalysis.leftTeam.raw),power:1}}}});}app.history.put(run);}
  const before=app.requests.length,result=await app.call('/api/formations/recommendation/prepare',{body});assert.equal(result.status,['body-reports','body-statistics','missing-minimum','invalid-rule','missing-sequence'].includes(mode)?400:409,JSON.stringify(result.data));if(result.status===400)assert.equal(app.requests.length,before);assert.equal(app.requests.some(r=>['SaveFormationRequest','ChallengeStageRequest'].includes(r.name)),false);assert.equal((await app.call('/api/workflows')).data.status.status,'IDLE');
 }finally{await app.close();}
});
for(const mode of ['samples-change','role','connection'])test('empirical preparation cancels original source race '+mode,async()=>{
 const {app,session,payload}=await empiricalHttpFixture();try{
  let release,enter;const hold=new Promise(r=>release=r),entered=new Promise(r=>enter=r),request=session.client.request.bind(session.client);session.client.request=async(name,...args)=>{if(name==='GetFormationRequest'){enter();await hold;}return request(name,...args);};const work=app.call('/api/formations/recommendation/prepare',{body:payload});await entered;
  if(mode==='samples-change'){const run=app.history.list('A').find(r=>r.runId==='empirical-2-1');run.actions[0].battleAnalysis.gaps.push('changed after capture');app.history.put(run);}if(mode==='role')session.player.playerId='18';if(mode==='connection')session.connectionId='different';release();const result=await work;assert.equal(result.status,409,JSON.stringify(result.data));assert.equal(app.requests.some(r=>['SaveFormationRequest','ChallengeStageRequest'].includes(r.name)),false);
 }finally{await app.close();}
});

for(const unconfirmed of [false,true])test('hero combination HTTP prepares read-only and original finite authorization '+(unconfirmed?'stops UNKNOWN':'confirms exact exchange and single star'),async()=>{
 const app=await harness({includeHeroes:true,includeFragments:true,unconfirmed});
 try{
  const t=app.ready('A');t.heroState.heroes[0].star=1;t.heroState.stock.set('tank碎片',2);await app.enable();const route='/api/gameplay/heroes/star/prepare',body={heroId:'tank',num:3,maxDurationMs:60000};
  assert.equal((await app.call(route,{body,headers:{'x-cw-csrf':'wrong'}})).status,403);assert.equal((await app.call(route+'?extra=1',{body})).status,400);assert.equal((await app.call(route,{id:null,body})).status,400);assert.equal((await app.call(route,{body:{...body,costs:[]}})).status,400);assert.equal((await app.call(route,{body:{...body,num:2}})).status,400);
  const prepared=await app.call(route,{body});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.accountId,'A');assert.equal(prepared.data.resumable,false);assert.equal(app.requests.filter(row=>/^Hero(FragExchange|StarUp)Request$/.test(row.name)).length,0);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const first=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(first.plan.parameters.expectedStar,1);assert.equal(first.plan.parameters.expectedFragmentBalance,2);assert.deepEqual(first.plan.resourceBudget,[{id:'蓝卡万能碎片',num:3}]);
  const approval={offer:first.authorizationOffer,batchId:first.plan.batchId,planHash:first.plan.planHash,confirm:true};assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);const final=(await waitForWorkflow(app,unconfirmed?'UNKNOWN':'COMPLETED')).status;
  const writes=app.requests.filter(row=>/^Hero(FragExchange|StarUp)Request$/.test(row.name));assert.deepEqual(writes.map(row=>row.name),unconfirmed?['HeroFragExchangeRequest']:['HeroFragExchangeRequest','HeroStarUpRequest']);if(!unconfirmed){assert.deepEqual(writes[1].body,{heroId:'tank',universal:false});assert.equal(t.heroState.heroes[0].star,2);assert.equal(t.heroState.stock.get('tank碎片'),0);assert.equal(t.heroState.stock.get('蓝卡万能碎片'),17);}
  const history=(await app.call('/api/workflows/history?workflowRunId='+final.runId)).data;assert.equal(history.resumable,false);assert.equal(history.readOnly,true);assert.equal((await app.call('/api/workflows/history?workflowRunId='+final.runId,{id:'B'})).status,404);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('multi-hero star preparation HTTP accepts only explicit ordered targets and stays read-only',async()=>{
 const app=await harness({includeHeroes:true,includeFragments:true});
 try{const t=app.ready('A');t.heroState.heroes.forEach(row=>row.star=1);t.heroState.stock.set('tank碎片',2);t.heroState.stock.set('ranger碎片',2);t.heroState.stock.set('蓝卡万能碎片',6);await app.enable();const body={targets:[{heroId:'tank',num:3},{heroId:'ranger',num:3}],maxDurationMs:60000};
  const prepared=await app.call('/api/gameplay/heroes/star/prepare',{body});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.targets.map(row=>row.heroId),['tank','ranger']);assert.equal(prepared.data.graph.runPolicy.maxActions,4);assert.deepEqual(prepared.data.graph.budget.resources,[{id:'蓝卡万能碎片',num:6},{id:'tank碎片',num:5},{id:'ranger碎片',num:5}]);assert.deepEqual(prepared.data.graph.nodes.filter(n=>n.type==='ACTION').map(n=>n.parameters.heroId),['tank','tank','ranger','ranger']);assert.equal(app.requests.filter(row=>/^Hero(FragExchange|StarUp)Request$/.test(row.name)).length,0);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);
  for(const invalid of [{targets:[{heroId:'tank',num:3},{heroId:'tank',num:3}],maxDurationMs:60000},{targets:[{heroId:'tank',num:2},{heroId:'ranger',num:3}],maxDurationMs:60000},{targets:body.targets,maxDurationMs:0},{targets:body.targets,maxDurationMs:86400001}])assert.equal((await app.call('/api/gameplay/heroes/star/prepare',{body:invalid})).status,400);
 }finally{await app.close();}
});

for(const uncertainSecond of [false,true])test('multi-hero HTTP original finite authorization '+(uncertainSecond?'stops on second-target UNKNOWN':'settles both targets and shared budget'),async()=>{
 const app=await harness({includeHeroes:true,includeFragments:true});
 try{const t=app.ready('A');t.heroState.stock.set('tank碎片',2);t.heroState.stock.set('ranger碎片',2);t.heroState.stock.set('蓝卡万能碎片',6);await app.enable();const payload={targets:[{heroId:'tank',num:3},{heroId:'ranger',num:3}],maxDurationMs:60000};
 if(uncertainSecond){const old=t.client.sendWatch.bind(t.client);t.client.sendWatch=async(name,body,...args)=>name==='HeroFragExchangeRequest'&&body.heroId==='ranger'?{status:'UNKNOWN'}:old(name,body,...args);}
 const prepared=await app.call('/api/gameplay/heroes/star/prepare',{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const first=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;const approval={offer:first.authorizationOffer,batchId:first.plan.batchId,planHash:first.plan.planHash,confirm:true};assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);const final=(await waitForWorkflow(app,uncertainSecond?'UNKNOWN':'COMPLETED')).status;
 assert.equal(t.heroState.heroes[0].star,2);assert.equal(t.heroState.heroes[1].star,uncertainSecond?1:2);assert.equal(t.heroState.stock.get('蓝卡万能碎片'),uncertainSecond?3:0);const runs=(await app.call('/api/operations/history')).data.runs;assert.equal(runs.length,uncertainSecond?3:4);assert.equal(runs[0].finalStatus,uncertainSecond?'UNKNOWN':'SUCCESS');assert.equal(final.runBudget.state,'CLOSED');
 const history=(await app.call('/api/workflows/history?workflowRunId='+final.runId)).data;assert.equal(history.readOnly,true);assert.equal(history.resumable,false);assert.equal(history.runAuthorization.scope.graph.nodes.filter(n=>n.type==='ACTION').length,4);assert.deepEqual(history.runAuthorization.scope.graph.budget,prepared.data.graph.budget);assert.equal((await app.call('/api/workflows/history?workflowRunId='+final.runId,{id:'B'})).status,404);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});


async function resourceFieldHttpReady(app,{apply=true}={}){
 const session=app.ready('A'),codec=createVipHttpCodec(heroWireProtocol),state={seq:1,reads:[],writes:[],fields:{info:{fields:[{gridIdx:0,cityId:1,type:0},{gridIdx:9,cityId:2,type:1}],maxNum:3}},items:[{itemId:'木材',num:9}],resources:[{res:3,amount:100}]};
 let socket;class Socket{constructor(){this.readyState=0;socket=this;}send(bytes){const f=codec.decode(bytes);if(f.name==='PingRequest')queueMicrotask(()=>this.receive('PingResponse',{clientTimestamp:f.body.clientTimestamp,serverTimestamp:Date.now()}));}close(){this.readyState=3;}receive(n,b,seq=0){this.onmessage?.({data:codec.encode(n,seq,b)});}}
 const client=new VipHttpClient({protocol:heroWireProtocol,accountId:'A',generation:session.generation,WebSocketImpl:Socket});session.connectionId='field-http-A';Object.assign(session.player,{playerId:'9007199254740993',worldId:'1000001',level:30});client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};client.on('error',()=>{});const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:session.player});await pending;session.client=client;
 client.request=async(n,b,r,_timeout,options={})=>{assert.equal(options.mutate,undefined);heroWire(n,b);state.reads.push(n);const value=n==='MyResFieldsRequest'?state.fields:n==='AllItemRequest'?{items:state.items}:n==='AllResourceRequest'?{list:state.resources}:null;assert.ok(value,n);return heroWire(r,value);};
 client.sendWatch=async(n,b,options)=>{heroWire(n,b);options.beforeDispatch();assert.equal(n,'GiveUpResFieldRequest');const durable=app.history.list('A')[0];assert.equal(durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(durable.runBudget.reserved.uids,[{type:'resource-field',id:'1000001:0'}]);state.writes.push({n,b:structuredClone(b)});if(apply){state.fields.info.fields=state.fields.info.fields.filter(row=>row.gridIdx!==b.resFieldGridIdx);socket.receive('SCResFieldInfo',{info:state.fields.info},state.seq++);}return {status:'UNKNOWN'};};
 await app.call('/api/gameplay?module=fleet');assert.equal((await app.call('/api/gameplay/config',{body:{module:'fleet',config:{enabled:true,giveUpResourceField:true}}})).status,200);return {session,client,state};
}
for(const outcome of ['SUCCESS','UNKNOWN'])test('resource field real localhost HTTP uses original finite Workflow and history '+outcome,async()=>{
 const app=await harness({includeCargo:true,testProtocol:heroWireProtocol,configOverride:{tables:{}}});let client;try{
 const f=await resourceFieldHttpReady(app,{apply:outcome==='SUCCESS'});client=f.client;const parameters={resourceFieldGridIdx:0};for(const bad of [{resourceFieldGridIdx:-1},{resourceFieldGridIdx:'0'},{resourceFieldGridIdx:0,cityId:1}]){const n=f.state.reads.length;assert.equal((await app.call('/api/gameplay/survey',{body:{module:'fleet',parameters:bad}})).status,400);assert.equal(f.state.reads.length,n);}
 const observed=await app.call('/api/gameplay/survey',{body:{module:'fleet',parameters}});assert.equal(observed.status,200,JSON.stringify(observed.data));const row=observed.data.view.candidates[0];assert.equal(row.executable,true);assert.deepEqual(row.costs,[]);assert.equal(f.state.writes.length,0);
 const nodes=[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'fleet',parameters,selection:{unique:true}},{id:'v',type:'VERIFY',module:'fleet'},{id:'e',type:'STOP'}],g={version:1,id:'field-http-'+outcome,name:'field',nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id})),budget:row.budgetClaims,runPolicy:{maxActions:1,maxDurationMs:60000,modules:['fleet']}};
 assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,approval={offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true};assert.equal(f.state.writes.length,0);assert.equal((await app.call('/api/workflows/authorize-run',{body:approval,headers:{'x-cw-csrf':'wrong'}})).status,403);assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);
 const done=(await waitForWorkflow(app,outcome==='SUCCESS'?'COMPLETED':'UNKNOWN')).status;assert.deepEqual(f.state.writes,[{n:'GiveUpResFieldRequest',b:{resFieldGridIdx:0}}]);const records=(await app.call('/api/operations/history')).data.runs;assert.equal(records.length,1);assert.equal(records[0].finalStatus,outcome);assert.equal(records[0].workflowId,done.runId);assert.deepEqual(records[0].runBudget.reserved.resources,[]);assert.deepEqual(records[0].runBudget.reserved.uids,row.budgetClaims.uids);
 const detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);const bytes=fs.readFileSync(app.history.storagePath,'utf8'),restored=createExecutionHistory({file:app.history.storagePath});assert.equal(restored.list('A')[0].finalStatus,outcome);assert.equal(restored.unresolved('A'),outcome==='UNKNOWN');assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.equal(f.state.writes.length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});


const forgeHttpCfg={tables:{BuildingCfg:{data:[{buildingType:'装备厂'}]},BuildingEquipMakeCfg:{data:[{makeId:1001,type:'武器',libId:1,seconds:1800,season:1,costItem:[['材料',4],['GOLD',20]]},{makeId:1002,type:'防具',libId:2,seconds:1800,season:1,costItem:[['材料',4],['GOLD',20]]}]},EquipMakeLibCfg:{data:[{libId:1,equipId:'蓝武器1',rate:100},{libId:2,equipId:'蓝防具1',rate:100}]},EquipCfg:{data:[{id:'蓝武器1',type:'武器',qualityIndex:1,qualityName:'蓝色'},{id:'蓝防具1',type:'防具',qualityIndex:1,qualityName:'蓝色'}]}}};
const forgeBody={buildingId:'1装备厂',makeIds:[1001,1002],maxDurationMs:60000},forgeRoute='/api/gameplay/equipment-forge/prepare';
async function forgeHttp(){const config=structuredClone(forgeHttpCfg),app=await harness({includeForge:true,testProtocol:heroWireProtocol,configOverride:config}),session=app.ready('A');await app.call('/api/gameplay?module=equipment-forge');assert.equal((await app.call('/api/gameplay/config',{body:{module:'equipment-forge',config:{enabled:true}}})).status,200);return {app,session,config};}
for(const outcome of ['success','unknown','refused'])test('forge preparation actual HTTP reuses finite authorization and '+outcome+' stops dependent writes',async()=>{
 const {app,session}=await forgeHttp();try{
  if(outcome==='refused')session.forgeState.refused=true;
  if(outcome==='unknown'){const request=session.client.request.bind(session.client);session.client.request=async(...args)=>{const pool=structuredClone(session.forgeState.pool),q=structuredClone(session.forgeState.queue),value=await request(...args);if(args[0]==='PickMadeEquipRequest'){session.forgeState.pool=pool;session.forgeState.queue=q;}return value;};}
  for(const [opts,status]of [[{body:forgeBody,headers:{'x-cw-csrf':'bad'}},403],[{body:forgeBody,id:null},400],[{body:{...forgeBody,allowUniversal:true}},400],[{body:{...forgeBody,makeIds:[]}},400]])assert.equal((await app.call(forgeRoute,opts)).status,status);
  assert.equal((await app.call(forgeRoute+'?extra=1',{body:forgeBody})).status,400);
  const prepared=await app.call(forgeRoute,{body:forgeBody});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.selected.makeId,1002);assert.deepEqual(prepared.data.counts,{武器:2,防具:0,饰品:0});assert.equal(app.requests.some(row=>/^(PickMadeEquip|MakeEquip)Request$/.test(row.name)),false);assert.equal((await app.call('/api/operations/history')).data.runs.length,0);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const first=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,approval={offer:first.authorizationOffer,batchId:first.plan.batchId,planHash:first.plan.planHash,confirm:true};assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);
  const final=(await waitForWorkflow(app,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED')).status,writes=app.requests.filter(row=>/^(PickMadeEquip|MakeEquip)Request$/.test(row.name));assert.deepEqual(writes.map(row=>row.name),outcome==='success'?['PickMadeEquipRequest','MakeEquipRequest']:['PickMadeEquipRequest']);
  if(outcome==='success'){assert.equal(session.forgeState.stock,16);assert.equal(session.forgeState.gold,80);}else assert.equal(session.forgeState.stock,20);
  const history=(await app.call('/api/workflows/history?workflowRunId='+final.runId)).data;assert.equal(history.readOnly,true);assert.equal(history.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+final.runId,{id:'B'})).status,404);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.deepEqual(app.counts(),{clients:0,collections:0});
  if(outcome==='unknown'){
   const bytes=fs.readFileSync(app.history.storagePath,'utf8'),{createOperationService}=await import('../src/operation-service.mjs'),reopened=createExecutionHistory({file:app.history.storagePath}),service=createOperationService({protocol:heroWireProtocol,history:reopened,modules:app.operations.modules,loadRules:()=>({config:{}})});
   const fresh={...session,busy:null,workflowOwner:null,abort:new AbortController(),client:{...session.client,uncertainWrites:new Set()}};assert.equal(service.blocked('A'),true);await assert.rejects(service.plan(fresh,{module:'equipment-forge',mode:'Manual',parameters:prepared.data.graph.nodes[1].parameters,selections:[]}));assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);
  }
  if(outcome!=='success'){app.sessions.delete('A');app.ready('A');assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.equal(app.requests.filter(row=>/^(PickMadeEquip|MakeEquip)Request$/.test(row.name)).length,1);}
 }finally{await app.close();}
});
for(const change of ['account','player','world','connection','generation','configuration'])test('forge preparation HTTP fences late '+change+' without writing or clearing a new owner',async()=>{
 const {app,session,config}=await forgeHttp();try{let changed=false;session.forgeState.onRead=async()=>{if(changed)return;changed=true;if(change==='account')session.client.factContext.accountId='B';if(change==='player')session.player.playerId='9';if(change==='world')session.player.worldId=2000001;if(change==='connection')session.connectionId='changed';if(change==='generation'){session.generation++;session.busy='new-generation-owner';}if(change==='configuration')config.tables.BuildingEquipMakeCfg.data[0].costItem[0][1]++;};const reply=await app.call(forgeRoute,{body:forgeBody});assert.notEqual(reply.status,200);assert.equal(session.busy,change==='generation'?'new-generation-owner':null);assert.equal(app.requests.some(row=>/^(PickMadeEquip|MakeEquip)Request$/.test(row.name)),false);}finally{await app.close();}
});


test('forge finite parent budget never grows from collection and insufficient explicit budget cannot dispatch make',async()=>{
 const {app,session}=await forgeHttp();try{const prepared=(await app.call(forgeRoute,{body:forgeBody})).data;prepared.graph.budget.resources.find(row=>row.id==='材料').num=3;assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.graph}})).status,200);const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal((await app.call('/api/workflows/authorize-run',{body:{offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true}})).status,200);const final=(await waitForWorkflow(app,'FAILED')).status;assert.equal(app.requests.filter(row=>row.name==='PickMadeEquipRequest').length,1);assert.equal(app.requests.filter(row=>row.name==='MakeEquipRequest').length,0);assert.equal(session.forgeState.stock,20);assert.equal(final.running,false);}finally{await app.close();}
});


test('ordinary AFK HTTP uses original survey plan authorize execute routes, exact interval and account scope',async()=>{
 const config={tables:Object.fromEntries(['OfflineCfg','ItemCfg','HeroBadgeCfg'].map(n=>[n,structuredClone(merchantHttpActual.tables[n])]))},app=await harness({includeAfk:true,testProtocol:heroWireProtocol,configOverride:config});
 try{const session=app.ready('A'),client=session.client,state={afk:{level:2,rewardedLevel:0,afkStartTime:900,afkFinishTime:1900},gold:100,writes:[]};session.connectionId='afk-http-A';session.player={playerId:'1',worldId:17};client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};
 client.request=async(n,b,r,_t,o)=>{heroWire(n,b);if(n==='DrawAfkRewardRequest'){o?.beforeDispatch?.();assert.equal(o.mutate,true);state.writes.push({n,b:structuredClone(b)});state.afk.afkStartTime=1000;state.afk.afkFinishTime=2000;state.gold+=25;return heroWire(r,{afkStartTime:1000,afkFinishTime:2000,reward:{assetPackage:{asset:[{type:0,id:'GOLD',num:25}]}}});}const value=n==='AfkInfoRequest'?{afkInfo:state.afk}:n==='AllItemRequest'?{items:[]}:n==='AllResourceRequest'?{list:[{res:3,amount:state.gold}]}:n==='BadgesRequest'?{badge:[]}:n==='AllHeroRequest'?{heroes:[{heroId:'tank',level:1,star:0,power:1,skillLevels:[1],badges:[]}]}:null;assert.ok(value,n);return heroWire(r,value);};
 const module='afk-level-rewards',parameters={action:'income',level:2,afkStartTime:900,afkFinishTime:1900};await app.call('/api/gameplay?module='+module);assert.equal((await app.call('/api/gameplay/config',{body:{module,config:{enabled:true}}})).status,200);
 for(const entry of ['tasks','dailies','loop']){
   const intent={entry,budget:{resources:[],quotas:[],uids:[{type:'afk-income-interval',id:'2:900:1900'}]},...(entry==='dailies'?{dailies:[{taskId:1004,action:'perform',parameters}]}:{tasks:[{kind:'afk-income',level:2,afkStartTime:900,afkFinishTime:1900}]})},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(prepared.data.accountId,'A');assert.equal(prepared.data.graph.nodes.filter(n=>n.type==='ACTION').length,1);assert.deepEqual(prepared.data.graph.nodes.find(n=>n.type==='ACTION').parameters,parameters);assert.deepEqual(prepared.data.graph.budget,intent.budget);assert.equal(state.writes.length,0);
   assert.equal((await app.call('/api/workflows/prepare',{id:null,body:intent})).status,400);assert.equal((await app.call('/api/workflows/prepare',{body:intent,authorized:false})).status,403);
  }
  const legacy=await app.call('/api/workflows/prepare',{body:{entry:'dailies',dailies:[{taskId:1004}],budget:{resources:[],quotas:[],uids:[]}}});assert.equal(legacy.status,200);assert.equal(legacy.data.graph,null);assert.equal(legacy.data.blocked[0].reason,'DAILY_ACTION_CONTRACT_UNVERIFIED');assert.equal((await app.call('/api/workflows/prepare',{body:{entry:'dailies',dailies:[{taskId:1004,parameters:{...parameters,useAdvCard:false}}],budget:{resources:[],quotas:[],uids:[]}}})).status,400);
  assert.equal((await app.call('/api/gameplay/survey',{body:{module,parameters},authorized:false})).status,403);assert.equal((await app.call('/api/gameplay/survey',{id:null,body:{module,parameters}})).status,400);assert.equal((await app.call('/api/gameplay/survey',{body:{module,parameters:{...parameters,useAdvCard:true}}})).status,400);
 const read=await app.call('/api/gameplay/survey',{body:{module,parameters}});assert.equal(read.status,200,JSON.stringify(read.data));assert.equal(read.data.view.candidates[0].executable,true,JSON.stringify(read.data));assert.equal(state.writes.length,0);
 const made=await app.call('/api/operations/plan',{body:{module,mode:'Manual',parameters,selections:[read.data.view.candidates[0].actionId]}});assert.equal(made.status,200,JSON.stringify(made.data));const p=made.data;assert.equal((await app.call('/api/operations/authorize',{id:'B',body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:[],confirm:true}})).status>=400,true);assert.equal(state.writes.length,0);
 const permit=await app.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:[],confirm:true}});assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const record=app.history.list('A')[0];assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record));assert.deepEqual(state.writes,[{n:'DrawAfkRewardRequest',b:{}}]);assert.equal(state.afk.level,2);assert.equal(state.afk.rewardedLevel,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('AFK upgrade HTTP requires durable ordinary income before exact debit through original authorization routes',async()=>{
 const config={tables:Object.fromEntries(['OfflineCfg','ItemCfg','HeroBadgeCfg'].map(n=>[n,structuredClone(merchantHttpActual.tables[n])]))},app=await harness({includeAfk:true,testProtocol:heroWireProtocol,configOverride:config});
 try{const session=app.ready('A'),client=session.client,state={afk:{level:2,rewardedLevel:0,afkStartTime:900,afkFinishTime:1900},gold:100,badges:100,writes:[]};session.connectionId='afk-upgrade-http-A';session.player={playerId:'1',worldId:17,mainlineStage:1000};client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};
 client.request=async(n,b,r,_t,o)=>{heroWire(n,b);if(n==='DrawAfkRewardRequest'||n==='UpgradeAfkLevelRequest'){o?.beforeDispatch?.();assert.equal(o.mutate,true);state.writes.push({n,b:structuredClone(b)});state.afk.afkStartTime=1000;state.afk.afkFinishTime=2000;if(n==='DrawAfkRewardRequest'){state.gold+=25;return heroWire(r,{afkStartTime:1000,afkFinishTime:2000,reward:{assetPackage:{asset:[{type:0,id:'GOLD',num:25}]}}});}state.badges-=config.tables.OfflineCfg.data.filter(row=>row.level>state.afk.level&&row.level<=state.afk.level+b.level).reduce((n,row)=>n+row.consume[1],0);state.afk.level+=b.level;return heroWire(r,{level:state.afk.level,afkStartTime:1000,afkFinishTime:2000});}const value=n==='AfkInfoRequest'?{afkInfo:state.afk}:n==='AllItemRequest'?{items:[{itemId:'挂机徽章',num:state.badges}]}:n==='AllResourceRequest'?{list:[{res:3,amount:state.gold}]}:n==='BadgesRequest'?{badge:[]}:n==='AllHeroRequest'?{heroes:[{heroId:'tank',level:1,star:0,power:1,skillLevels:[1],badges:[]}]}:null;assert.ok(value,n);return heroWire(r,value);};
 const module='afk-level-rewards',upgrade={action:'upgrade',level:2,levels:5};await app.call('/api/gameplay?module='+module);assert.equal((await app.call('/api/gameplay/config',{body:{module,config:{enabled:true}}})).status,200);
 const blocked=await app.call('/api/gameplay/survey',{body:{module,parameters:upgrade}});assert.equal(blocked.status,200);assert.equal(blocked.data.view.candidates[0].blockedReason,'AFK_CONFIRMED_INCOME_REQUIRED');assert.equal(state.writes.length,0);
 for(const parameters of [{action:'income',level:2,afkStartTime:900,afkFinishTime:1900},upgrade]){
  assert.equal((await app.call('/api/gameplay/survey',{body:{module,parameters},authorized:false})).status,403);assert.equal((await app.call('/api/gameplay/survey',{id:null,body:{module,parameters}})).status,400);
  const read=await app.call('/api/gameplay/survey',{body:{module,parameters}});assert.equal(read.status,200,JSON.stringify(read.data));assert.equal(read.data.view.candidates[0].executable,true,JSON.stringify(read.data));assert.equal(JSON.stringify(read.data).includes('readIncomeHistory'),false);
  const made=await app.call('/api/operations/plan',{body:{module,mode:'Manual',parameters,selections:[read.data.view.candidates[0].actionId]}});assert.equal(made.status,200,JSON.stringify(made.data));const p=made.data;assert.deepEqual(p.resourceBudget,parameters.action==='upgrade'?[{id:'挂机徽章',num:5}]:[]);const authorization={batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true};assert.equal((await app.call('/api/operations/authorize',{id:'B',body:authorization})).status>=400,true);
  const permit=await app.call('/api/operations/authorize',{body:authorization});assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');assert.equal(app.history.list('A')[0].finalStatus,'SUCCESS',JSON.stringify(app.history.list('A')[0]));
 }
 assert.deepEqual(state.writes,[{n:'DrawAfkRewardRequest',b:{}},{n:'UpgradeAfkLevelRequest',b:{level:5}}]);assert.equal(state.afk.level,7);assert.equal(state.badges,95);assert.equal(state.afk.rewardedLevel,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

const afkChainRoute='/api/gameplay/afk/upgrade/prepare',afkChainBody={level:2,levels:5,afkStartTime:900,afkFinishTime:1900,maxDurationMs:60000};
async function afkChainHttp(){
 const config={tables:Object.fromEntries(['OfflineCfg','ItemCfg','HeroBadgeCfg'].map(n=>[n,structuredClone(merchantHttpActual.tables[n])]))},app=await harness({includeAfk:true,testProtocol:heroWireProtocol,configOverride:config}),session=app.ready('A'),client=session.client,state={afk:{level:2,rewardedLevel:0,afkStartTime:900,afkFinishTime:1900},gold:100,badges:100,writes:[],incomeApply:true,upgradeApply:true,refuse:null,onRead:null,onWrite:null};
 session.connectionId='afk-chain-http-A';session.player={playerId:'1',worldId:17,mainlineStage:1000};client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};
 client.request=async(n,b,r,_t,o)=>{
  heroWire(n,b);if(n==='DrawAfkRewardRequest'||n==='UpgradeAfkLevelRequest'){
   o?.beforeDispatch?.();assert.equal(o.mutate,true);state.writes.push({n,b:structuredClone(b)});if(state.refuse===n)throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});
   const income=n==='DrawAfkRewardRequest';let receipt;
   if(income){receipt={afkStartTime:1000,afkFinishTime:2000,reward:{assetPackage:{asset:[{type:0,id:'GOLD',num:25}]}}};if(state.incomeApply){state.afk.afkStartTime=1000;state.afk.afkFinishTime=2000;state.gold+=25;}}
   else{receipt={level:state.afk.level+b.level,afkStartTime:1000,afkFinishTime:2050};if(state.upgradeApply){state.badges-=config.tables.OfflineCfg.data.filter(row=>row.level>state.afk.level&&row.level<=state.afk.level+b.level).reduce((n,row)=>n+row.consume[1],0);Object.assign(state.afk,receipt);}}
   await state.onWrite?.(n);return heroWire(r,receipt);
  }
  await state.onRead?.(n);const value=n==='AfkInfoRequest'?{afkInfo:state.afk}:n==='AllItemRequest'?{items:[{itemId:'挂机徽章',num:state.badges}]}:n==='AllResourceRequest'?{list:[{res:3,amount:state.gold}]}:n==='BadgesRequest'?{badge:[]}:n==='AllHeroRequest'?{heroes:[{heroId:'tank',level:1,star:0,power:1,skillLevels:[1],badges:[]}]}:null;assert.ok(value,n);return heroWire(r,value);
 };
 await app.call('/api/gameplay?module=afk-level-rewards');assert.equal((await app.call('/api/gameplay/config',{body:{module:'afk-level-rewards',config:{enabled:true}}})).status,200);return {app,session,client,state,config};
}
for(const stage of ['income','upgrade'])for(const outcome of ['success','unknown','refused'])test('AFK chain HTTP '+stage+' '+outcome+' uses original finite authorization and durable history',async()=>{
 const f=await afkChainHttp(),{app,state}=f;try{
  const affected=stage==='income'?'DrawAfkRewardRequest':'UpgradeAfkLevelRequest';if(outcome==='unknown')state[stage+'Apply']=false;if(outcome==='refused')state.refuse=affected;
  for(const [opts,status]of [[{body:afkChainBody,headers:{'x-cw-csrf':'bad'}},403],[{body:afkChainBody,id:null},400],[{body:{...afkChainBody,allowPaid:false}},400],[{body:{...afkChainBody,levels:2}},400],[{body:{...afkChainBody,maxDurationMs:0}},400]])assert.equal((await app.call(afkChainRoute,opts)).status,status);
  assert.equal((await app.call(afkChainRoute+'?extra=1',{body:afkChainBody})).status,400);const prepared=await app.call(afkChainRoute,{body:afkChainBody});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.deepEqual(prepared.data.costs,[{id:'挂机徽章',num:5}]);assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);assert.equal(prepared.data.requiresAuthorization,true);assert.equal(prepared.data.resumable,false);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const first=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(first.plan.actions[0].actionType,'INCOME');const approval={offer:first.authorizationOffer,batchId:first.plan.batchId,planHash:first.plan.planHash,confirm:true};assert.equal((await app.call('/api/workflows/authorize-run',{body:approval,authorized:false})).status,403);assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);
  const expected=outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED',done=(await waitForWorkflow(app,expected)).status;assert.equal(state.writes.length,outcome==='success'||stage==='upgrade'?2:1);assert.equal(state.writes[0].n,'DrawAfkRewardRequest');if(state.writes.length===2)assert.deepEqual(state.writes[1],{n:'UpgradeAfkLevelRequest',b:{level:5}});if(outcome==='success'){assert.equal(state.afk.level,7);assert.equal(state.badges,95);}
  const rows=app.history.list('A');assert.equal(rows.length,state.writes.length);assert.equal(rows[0].finalStatus,outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED');assert.equal(rows[0].workflowId,done.runId);const detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);const bytes=fs.readFileSync(app.history.storagePath,'utf8'),restored=createExecutionHistory({file:app.history.storagePath});assert.equal(restored.unresolved('A'),outcome==='unknown');assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.equal(state.writes.length,outcome==='success'||stage==='upgrade'?2:1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const change of ['account','player','world','connection','generation','mainline','config'])test('AFK chain HTTP rejects late '+change+' preparation with zero writes',async()=>{
 const f=await afkChainHttp(),{app,session,state,config}=f;try{let changed=false;state.onRead=()=>{if(changed)return;changed=true;if(change==='account')session.client.factContext.accountId='B';if(change==='player')session.player.playerId='9';if(change==='world')session.player.worldId=18;if(change==='connection')session.connectionId='changed';if(change==='generation'){session.generation++;session.busy='new-owner';}if(change==='mainline')session.player.mainlineStage++;if(change==='config')config.tables.OfflineCfg.data[2].consume[1]++;};const reply=await app.call(afkChainRoute,{body:afkChainBody});assert.notEqual(reply.status,200);assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal(session.busy,change==='generation'?'new-owner':null);}finally{await app.close();}
});
test('AFK chain HTTP parent budget remains fixed after income and cannot authorize an underfunded upgrade',async()=>{
 const {app,state}=await afkChainHttp();try{const reply=await app.call(afkChainRoute,{body:afkChainBody});assert.equal(reply.status,200);const graph=reply.data.graph;graph.budget.resources[0].num=4;assert.equal((await app.call('/api/workflows/start',{body:{graph}})).status,200);const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal((await app.call('/api/workflows/authorize-run',{body:{offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true}})).status,200);await waitForWorkflow(app,'FAILED');assert.deepEqual(state.writes,[{n:'DrawAfkRewardRequest',b:{}}]);assert.equal(state.badges,100);assert.equal(app.history.list('A')[0].finalStatus,'NOT_EXECUTED');}finally{await app.close();}
});

const farmSequenceRoute='/api/gameplay/farm/harvest/prepare';
async function farmSequenceHttp(){const app=await harness({includeFarm:true}),session=app.ready('A'),state=session.farmState,base=session.client.request.bind(session.client);state.water.building.push({...structuredClone(state.water.building[0]),buildingId:'2农田'});state.writes=[];state.failAt=null;state.onRead=null;state.onWrite=null;
 session.client.request=async(n,b,response,...args)=>{if(n==='FarmHarvestRequest'){args.at(-1)?.beforeDispatch?.();assert.equal(args.at(-1).mutate,true);assert.equal(b.buildingId.length,1);heroWire(n,b);state.writes.push(structuredClone(b));if(state.failAt==='refused-'+state.writes.length)throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});if(state.failAt!=='unknown-'+state.writes.length){state.water.building.find(r=>r.buildingId===b.buildingId[0]).farm={productId:'',plantTime:0,ripeTime:0};state.stock.set('小麦',state.stock.get('小麦')+10);}await state.onWrite?.();return heroWire(response,{reward:[{reward:{type:0,id:'小麦',num:10},critical:2}]});}await state.onRead?.(n);return base(n,b,response,...args);};
 assert.equal((await app.enable()).status,200);const surveyed=await app.survey({action:'harvest'});assert.equal(surveyed.status,200);const view=surveyed.data.view,payload={targets:view.plots.map(p=>({buildingId:p.buildingId,productId:p.productId,plantTime:p.plantTime,ripeTime:p.ripeTime,identity:view.candidates.find(c=>c.target.buildingId===p.buildingId).identity})),maxDurationMs:60000};return {app,session,state,payload};}
for(const outcome of ['success','unknown-1','unknown-2','refused-1','refused-2'])test('Farm sequence HTTP '+outcome+' uses original run authorization and dual durable histories',async()=>{
 const {app,session,state,payload}=await farmSequenceHttp();try{state.failAt=outcome;for(const [options,status]of [[{body:payload,headers:{'x-cw-csrf':'bad'}},403],[{body:payload,id:null},400],[{body:{...payload,allowPaid:false}},400],[{body:{...payload,targets:[]}},400],[{body:{...payload,maxDurationMs:0}},400],[{body:{...payload,targets:[payload.targets[0],payload.targets[0]]}},400]])assert.equal((await app.call(farmSequenceRoute,options)).status,status);assert.equal((await app.call(farmSequenceRoute+'?extra=1',{body:payload})).status,400);
 const prepared=await app.call(farmSequenceRoute,{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal(prepared.data.graph.budget.uids.length,2);assert.deepEqual(prepared.data.graph.budget.resources,[]);
 assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const wait=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;const approve={offer:wait.authorizationOffer,batchId:wait.plan.batchId,planHash:wait.plan.planHash,confirm:true};assert.equal((await app.call('/api/workflows/authorize-run',{body:approve,authorized:false})).status,403);assert.equal((await app.call('/api/workflows/authorize-run',{body:approve})).status,200);const expected=outcome==='success'?'COMPLETED':outcome.startsWith('unknown')?'UNKNOWN':'FAILED',done=(await waitForWorkflow(app,expected)).status,count=outcome.endsWith('-1')?1:2;assert.equal(state.writes.length,count);assert.deepEqual(state.writes[0],{buildingId:['1农田']});if(count===2)assert.deepEqual(state.writes[1],{buildingId:['2农田']});const records=app.history.list('A');assert.equal(records.length,count);assert.equal(records[0].finalStatus,expected==='COMPLETED'?'SUCCESS':expected==='UNKNOWN'?'UNKNOWN':'REJECTED');assert.equal(records[0].runBudget.reserved.uids.length,count);
 const detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);const bytes=fs.readFileSync(app.history.storagePath,'utf8'),reopened=createExecutionHistory({file:app.history.storagePath});assert.equal(reopened.unresolved('A'),expected==='UNKNOWN');assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approve})).status,200);assert.equal(state.writes.length,count);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const change of ['account','player','world','connection','generation','config','source'])test('Farm sequence HTTP late '+change+' preparation cannot replace source or release new owner',async()=>{const f=await farmSequenceHttp(),{app,session,state,payload}=f;try{let once=false;state.onRead=()=>{if(once)return;once=true;if(change==='account')session.client.factContext.accountId='B';if(change==='player')session.player.playerId='9';if(change==='world')session.player.worldId=13;if(change==='connection')session.connectionId='new';if(change==='generation'){session.generation++;session.busy='new-owner';}if(change==='config')farmCfg.tables.FarmlandPlantCfg.data[0].time++;if(change==='source')state.water.building[1].farm.plantTime++;};const r=await app.call(farmSequenceRoute,{body:payload});assert.notEqual(r.status,200);assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal(session.busy,change==='generation'?'new-owner':null);}finally{if(change==='config')farmCfg.tables.FarmlandPlantCfg.data[0].time--;await app.close();}});
test('Farm sequence HTTP missing parent target UID cannot borrow the first target authorization',async()=>{const {app,state,payload}=await farmSequenceHttp();try{const p=await app.call(farmSequenceRoute,{body:payload});p.data.graph.budget.uids.pop();assert.equal((await app.call('/api/workflows/start',{body:{graph:p.data.graph}})).status,200);const w=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal((await app.call('/api/workflows/authorize-run',{body:{offer:w.authorizationOffer,batchId:w.plan.batchId,planHash:w.plan.planHash,confirm:true}})).status,200);await waitForWorkflow(app,'FAILED');assert.equal(state.writes.length,1);assert.equal(app.history.list('A')[0].finalStatus,'NOT_EXECUTED');}finally{await app.close();}});

const farmPlantSequenceRoute='/api/gameplay/farm/plant/prepare';
async function farmPlantSequenceHttp(){const app=await harness({includeFarm:true}),session=app.ready('A'),state=session.farmState,base=session.client.request.bind(session.client);state.water.building[0].farm={productId:'',plantTime:0,ripeTime:0};state.water.building.push({...structuredClone(state.water.building[0]),buildingId:'2农田'});state.writes=[];state.failAt=null;state.onRead=null;state.onWrite=null;session.client.request=async(n,b,r,...args)=>{await state.onRead?.(n);return base(n,b,r,...args);};session.client.sendWatch=async(n,b,o)=>{assert.equal(n,'FarmPlantRequest');assert.equal(b.args.length,1);heroWire(n,b);o.beforeDispatch?.();state.writes.push(structuredClone(b));if(state.failAt==='refused-'+state.writes.length)return {status:'REJECTED'};session.client.markUnverifiedWrite(n,b);if(state.failAt!=='unknown-'+state.writes.length){state.water.building.find(p=>p.buildingId===b.args[0].buildingId).farm={productId:b.args[0].productId,plantTime:1700000000,ripeTime:1700001800};state.stock.set('小麦种子',state.stock.get('小麦种子')-1);}await state.onWrite?.();return {status:'UNKNOWN'};};assert.equal((await app.enable()).status,200);const surveyed=await app.survey({action:'plant'});assert.equal(surveyed.status,200);const v=surveyed.data.view,payload={targets:v.plots.map(p=>({buildingId:p.buildingId,productId:'小麦',identity:v.candidates.find(c=>c.actionType==='PLANT'&&c.target.buildingId===p.buildingId).identity})),maxDurationMs:60000};return {app,session,state,payload};}
for(const outcome of ['success','unknown-1','unknown-2','refused-1','refused-2'])test('Farm plant sequence HTTP '+outcome+' stays on original finite authorization and independent exact seed verification',async()=>{const {app,state,payload}=await farmPlantSequenceHttp();try{state.failAt=outcome;for(const [options,status]of [[{body:payload,headers:{'x-cw-csrf':'bad'}},403],[{body:payload,authorized:false},403],[{body:payload,id:null},400],[{body:{...payload,allowPaid:false}},400],[{body:{...payload,targets:[]}},400],[{body:{...payload,maxDurationMs:0}},400],[{body:{...payload,targets:[payload.targets[0],payload.targets[0]]}},400]])assert.equal((await app.call(farmPlantSequenceRoute,options)).status,status);assert.equal((await app.call(farmPlantSequenceRoute+'?extra=1',{body:payload})).status,400);const p=await app.call(farmPlantSequenceRoute,{body:payload});assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.graph.budget,{resources:[{id:'小麦种子',num:2}],quotas:[],uids:[]});assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal((await app.call('/api/workflows/start',{body:{graph:p.data.graph}})).status,200);const wait=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,approve={offer:wait.authorizationOffer,batchId:wait.plan.batchId,planHash:wait.plan.planHash,confirm:true};assert.equal(state.writes.length,0);assert.equal((await app.call('/api/workflows/authorize-run',{body:approve,authorized:false})).status,403);assert.equal((await app.call('/api/workflows/authorize-run',{body:approve})).status,200);const expected=outcome==='success'?'COMPLETED':outcome.startsWith('unknown')?'UNKNOWN':'FAILED',done=(await waitForWorkflow(app,expected)).status,count=outcome.endsWith('-1')?1:2;assert.equal(state.writes.length,count);assert.deepEqual(state.writes[0],{args:[{buildingId:'1农田',productId:'小麦'}]});if(count===2)assert.deepEqual(state.writes[1],{args:[{buildingId:'2农田',productId:'小麦'}]});const records=app.history.list('A');assert.equal(records.length,count);assert.equal(records[0].finalStatus,expected==='COMPLETED'?'SUCCESS':expected==='UNKNOWN'?'UNKNOWN':'REJECTED');assert.equal(records[0].runBudget.reserved.resources[0].num,count);const detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);const bytes=fs.readFileSync(app.history.storagePath,'utf8'),next=createExecutionHistory({file:app.history.storagePath});assert.equal(next.unresolved('A'),expected==='UNKNOWN');assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approve})).status,200);assert.equal(state.writes.length,count);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}});
for(const change of ['account','player','world','connection','generation','config','source'])test('Farm plant sequence HTTP late '+change+' preparation does not publish a changed source or release another owner',async()=>{const {app,session,state,payload}=await farmPlantSequenceHttp();try{let once=false;state.onRead=()=>{if(once)return;once=true;if(change==='account')session.client.factContext.accountId='B';if(change==='player')session.player.playerId='9';if(change==='world')session.player.worldId=13;if(change==='connection')session.connectionId='new';if(change==='generation'){session.generation++;session.busy='new-owner';}if(change==='config')farmCfg.tables.FarmlandPlantCfg.data[0].material[1]++;if(change==='source')state.water.building[1].level++;};const p=await app.call(farmPlantSequenceRoute,{body:payload});assert.notEqual(p.status,200);assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal(session.busy,change==='generation'?'new-owner':null);}finally{if(change==='config')farmCfg.tables.FarmlandPlantCfg.data[0].material[1]--;await app.close();}});
test('Farm plant sequence HTTP refuses aggregate seed shortage before producing a graph and never grants future income',async()=>{const {app,state,payload}=await farmPlantSequenceHttp();try{state.stock.set('小麦种子',1);const p=await app.call(farmPlantSequenceRoute,{body:payload});assert.equal(p.status,400);assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal((await app.call('/api/workflows')).data.status.status,'IDLE');}finally{await app.close();}});

async function farmReplantHttp(){const f=await farmSequenceHttp(),{session,state}=f;session.client.sendWatch=async(n,b,o)=>{assert.equal(n,'FarmPlantRequest');assert.equal(b.args.length,1);heroWire(n,b);o.beforeDispatch?.();state.writes.push(structuredClone(b));if(state.failAt==='refused-'+state.writes.length)return {status:'REJECTED'};session.client.markUnverifiedWrite(n,b);if(state.failAt!=='unknown-'+state.writes.length){state.water.building.find(p=>p.buildingId===b.args[0].buildingId).farm={productId:b.args[0].productId,plantTime:1700000000,ripeTime:1700001800};state.stock.set('小麦种子',state.stock.get('小麦种子')-1);}await state.onWrite?.();return {status:'UNKNOWN'};};f.payload.replant=f.payload.targets.map(t=>({buildingId:t.buildingId,productId:'小麦'}));return f;}
for(const outcome of ['success','unknown-1','unknown-2','unknown-3','unknown-4','refused-1','refused-2','refused-3','refused-4'])test('Farm replant HTTP '+outcome+' uses original finite authorization and durable per-step verification',async()=>{const {app,state,payload}=await farmReplantHttp();try{state.failAt=outcome;const reply=await app.call(farmSequenceRoute,{body:payload});assert.equal(reply.status,200,JSON.stringify(reply.data));assert.deepEqual(reply.data.graph.budget.resources,[{id:'小麦种子',num:2}]);assert.equal(reply.data.graph.budget.uids.length,2);assert.equal(reply.data.graph.runPolicy.maxActions,4);assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal((await app.call('/api/workflows/start',{body:{graph:reply.data.graph}})).status,200);const w=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,approve={offer:w.authorizationOffer,batchId:w.plan.batchId,planHash:w.plan.planHash,confirm:true};assert.equal(state.writes.length,0);assert.equal((await app.call('/api/workflows/authorize-run',{body:approve,authorized:false})).status,403);assert.equal((await app.call('/api/workflows/authorize-run',{body:approve})).status,200);const expected=outcome==='success'?'COMPLETED':outcome.startsWith('unknown')?'UNKNOWN':'FAILED';await waitForWorkflow(app,expected);const count=outcome==='success'?4:Number(outcome.at(-1));assert.equal(state.writes.length,count);assert.deepEqual(state.writes[0],{buildingId:['1农田']});if(count>1)assert.deepEqual(state.writes[1],{args:[{buildingId:'1农田',productId:'小麦'}]});if(count>2)assert.deepEqual(state.writes[2],{buildingId:['2农田']});if(count>3)assert.deepEqual(state.writes[3],{args:[{buildingId:'2农田',productId:'小麦'}]});const rows=app.history.list('A');assert.equal(rows.length,count);assert.equal(rows[0].finalStatus,expected==='COMPLETED'?'SUCCESS':expected==='UNKNOWN'?'UNKNOWN':'REJECTED');assert.deepEqual(app.history.list('B'),[]);assert.equal(app.counts().clients,0);assert.equal(app.counts().collections,0);assert.equal((await app.call('/api/workflows/authorize-run',{body:approve})).status,400);}finally{await app.close();}});
test('Farm replant HTTP preparation preserves original guards and rejects incomplete or substituted explicit crops',async()=>{const {app,state,payload}=await farmReplantHttp();try{for(const[options,status]of [[{body:payload,authorized:false},403],[{body:payload,headers:{'x-cw-csrf':'bad'}},403],[{body:payload,id:null},400],[{body:{...payload,replant:[]}},400],[{body:{...payload,replant:payload.replant.slice(0,1)}},400],[{body:{...payload,replant:[payload.replant[1],payload.replant[0]]}},400],[{body:{...payload,replant:payload.replant.map(r=>({...r,seedNum:0}))}},400],[{body:{...payload,replant:payload.replant.map(r=>({...r,productId:'unproven'}))}},400]])assert.equal((await app.call(farmSequenceRoute,options)).status,status);assert.equal((await app.call(farmSequenceRoute+'?extra=1',{body:payload})).status,400);assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);state.stock.set('小麦种子',1);assert.equal((await app.call(farmSequenceRoute,{body:payload})).status,400);assert.equal(state.writes.length,0);}finally{await app.close();}});


const materialProductionRoute='/api/gameplay/production/material/prepare',materialProductionBody={packId:'原料自选包',itemId:'木材',num:2,buildingId:'1材料厂',productId:'布匹',maxDurationMs:60000};
async function materialProductionHttp(){
 const config=structuredClone(materialPackCfg);Object.assign(config.tables,{BuildingCfg:{data:[{buildingType:'材料厂'}]},BuildingProduceCfg:{data:[{buildType:'材料厂',itemId:'布匹',unlockLevel:1,produceTime:30,costItem:[['木材',2]]}]},BuildingProduceParamCfg:{data:[{paramName:'制造位上限',paramValue:6}]},GameParamCfg:{data:[{paramName:'产品存量初始上限',paramValue:50},{paramName:'初始人口上限',paramValue:100}]},WorkerOrderCfg:{data:[]},WorkerSpecOrderCfg:{data:[]}});
 const app=await harness({includeProduction:true,includeMaterialPacks:true,testProtocol:heroWireProtocol,configOverride:config}),session=app.ready('A'),client=session.client,state={stock:new Map([['原料自选包',5],['unrelated',7]]),water:{building:[{buildingId:'1材料厂',level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},factory:{autoProductId:'',factoryQ:[],finishedProducts:[]}}],workerOrder:[]},writes:[],exchangeApply:true,productionApply:true,refuse:null,onRead:null,onWrite:null};
 session.player={playerId:'1',worldId:1000001,level:10};session.connectionId='material-production-http-A';client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};
 client.request=async(n,b,r)=>{heroWire(n,b);await state.onRead?.(n);const value=n==='OnWaterRequest'?state.water:n==='AllItemRequest'?{items:[...state.stock].map(([itemId,num])=>({itemId,num}))}:n==='AllResourceRequest'?{list:[]}:n==='MyResFieldsRequest'?{info:{fields:[]}}:n==='MyFleetsRequest'?{fleets:[]}:n==='AppointInfoRequest'||n==='AllHeroRequest'?{heroes:[]}:null;assert.ok(value,'unexpected synthetic request '+n);return heroWire(r,value);};
 client.sendWatch=async(n,b,o)=>{heroWire(n,b);o?.beforeDispatch?.();const audit=app.history.list('A')[0];assert.equal(audit.actions[0].requestStatus,'DISPATCHING');state.writes.push({n,b:structuredClone(b)});if(state.refuse===n)throw Object.assign(Error('synthetic refused'),{code:'REJECTED'});
  if(n==='SelectPackRequest'){if(state.exchangeApply){state.stock.set(b.itemId,state.stock.get(b.itemId)-b.num);state.stock.set(b.selectItemId,(state.stock.get(b.selectItemId)??0)+b.num);}}
  else if(n==='StartFactoryProduceRequest'){if(state.productionApply){state.stock.set('木材',state.stock.get('木材')-2);state.water.building[0].factory.factoryQ.push({idx:0,productId:b.productId,finishTime:Math.floor(Date.now()/1000)+30});}}else assert.fail('Unexpected synthetic write '+n);await state.onWrite?.(n);return {status:'UNKNOWN',sent:true};
 };
 await app.call('/api/gameplay?module=material-packs');for(const module of ['material-packs','production']){const saved=await app.call('/api/gameplay/config',{body:{module,config:{enabled:true}}});assert.equal(saved.status,200,JSON.stringify(saved.data));}return {app,session,client,state,config};
}
for(const stage of ['exchange','production'])for(const outcome of ['success','unknown','refused'])test('material production HTTP '+stage+' '+outcome+' reuses finite authorization and original history',async()=>{
 const {app,state}=await materialProductionHttp();try{
  const affected=stage==='exchange'?'SelectPackRequest':'StartFactoryProduceRequest';if(outcome==='unknown')state[stage+'Apply']=false;if(outcome==='refused')state.refuse=affected;
  for(const [opts,status]of [[{body:materialProductionBody,headers:{'x-cw-csrf':'bad'}},403],[{body:materialProductionBody,authorized:false},403],[{body:materialProductionBody,id:null},400],[{body:{...materialProductionBody,allowPaid:false}},400],[{body:{...materialProductionBody,num:0}},400],[{body:{...materialProductionBody,maxDurationMs:0}},400]])assert.equal((await app.call(materialProductionRoute,opts)).status,status);
  assert.equal((await app.call(materialProductionRoute+'?extra=1',{body:materialProductionBody})).status,400);const prepared=await app.call(materialProductionRoute,{body:materialProductionBody});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);assert.deepEqual(prepared.data.graph.budget.resources,[{id:'原料自选包',num:2},{id:'木材',num:2}]);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(waiting.plan.module,'material-packs');const approval={offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true};assert.equal((await app.call('/api/workflows/authorize-run',{body:approval,id:'B'})).status>=400,true);assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);
  const done=(await waitForWorkflow(app,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED')).status,expected=outcome==='success'||stage==='production'?2:1;assert.equal(state.writes.length,expected);assert.equal(state.writes[0].n,'SelectPackRequest');if(expected===2)assert.deepEqual(state.writes[1].b,{buildingId:'1材料厂',productId:'布匹'});if(outcome==='success')assert.equal(state.stock.get('木材'),0);
  const rows=app.history.list('A');assert.equal(rows.length,expected);assert.equal(rows[0].finalStatus,outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED');assert.equal(rows[0].workflowId,done.runId);const restored=createExecutionHistory({file:app.history.storagePath});assert.equal(restored.unresolved('A'),outcome==='unknown');const detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.equal(detail.data.resumable,false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);assert.notEqual((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);assert.equal(state.writes.length,expected);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const change of ['account','player','world','connection','generation','config'])test('material production HTTP rejects late '+change+' preparation without writes',async()=>{
 const {app,session,client,state,config}=await materialProductionHttp();try{let changed=false;state.onRead=()=>{if(changed)return;changed=true;if(change==='account')client.factContext.accountId='B';if(change==='player')session.player.playerId='2';if(change==='world')session.player.worldId=2000001;if(change==='connection')client.factContext.connectionId=session.connectionId='other';if(change==='generation'){client.factContext.generation=++session.generation;session.busy='successor';}if(change==='config')config.tables.BuildingProduceCfg.data[0].costItem[0][1]++;};const reply=await app.call(materialProductionRoute,{body:materialProductionBody});assert.notEqual(reply.status,200);assert.equal(state.writes.length,0);assert.equal(app.history.list('A').length,0);assert.equal(session.busy,change==='generation'?'successor':null);}finally{await app.close();}
});

const multipleMaterialHttpBody={exchanges:[{packId:'原料自选包',itemId:'木材',num:2},{packId:'原料自选包',itemId:'鱼',num:1}],buildingId:'1材料厂',productId:'布匹',maxDurationMs:60000};
async function multipleMaterialHttp(){
 const f=await materialProductionHttp();f.config.tables.ItemCfg.data.push({id:'鱼',type:'原料'});f.config.tables.SelectPackLibCfg.data.push({itemId:'原料自选包',selectItemId:'鱼',type:'道具',num:1,season:1});f.config.tables.BuildingProduceCfg.data[0].costItem=[['木材',2],['鱼',1]];const send=f.client.sendWatch.bind(f.client);f.client.sendWatch=async(n,b,o)=>{const r=await send(n,b,o);if(n==='StartFactoryProduceRequest'&&f.state.productionApply)f.state.stock.set('鱼',f.state.stock.get('鱼')-1);return r;};return f;
}
for(const outcome of ['success','unknown-1','unknown-2','unknown-3','refused-1','refused-2','refused-3'])test('multiple material production HTTP '+outcome+' uses original finite run authorization and per-step history',async()=>{
 const {app,state,client}=await multipleMaterialHttp();try{
  const at=Number(outcome.at(-1)),send=client.sendWatch.bind(client);client.sendWatch=async(n,b,o)=>{
   if(outcome.startsWith('refused')&&state.writes.length+1===at){o.beforeDispatch?.();state.writes.push({n,b:structuredClone(b)});throw Object.assign(Error('synthetic refusal'),{code:'REJECTED'});}
   const r=await send(n,b,o);if(outcome.startsWith('unknown')&&state.writes.length===at)state.stock.set('unrelated',999);return r;
  };
  const reply=await app.call(materialProductionRoute,{body:multipleMaterialHttpBody});assert.equal(reply.status,200,JSON.stringify(reply.data));assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);assert.deepEqual(reply.data.graph.budget.resources,[{id:'原料自选包',num:3},{id:'木材',num:2},{id:'鱼',num:1}]);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:reply.data.graph}})).status,200);const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,approval={offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true};
  assert.equal((await app.call('/api/workflows/authorize-run',{body:approval,authorized:false})).status,403);assert.equal(state.writes.length,0);assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,200);
  const expected=outcome==='success'?'COMPLETED':outcome.startsWith('unknown')?'UNKNOWN':'FAILED';await waitForWorkflow(app,expected);assert.equal(state.writes.length,outcome==='success'?3:at);assert.equal(app.history.list('A').length,state.writes.length);assert.deepEqual(app.history.list('B'),[]);assert.equal(app.history.list('A')[0].finalStatus,outcome==='success'?'SUCCESS':expected==='UNKNOWN'?'UNKNOWN':'REJECTED');
  if(outcome==='success')assert.deepEqual(state.writes.map(row=>row.b.selectItemId??row.b.productId),['木材','鱼','布匹']);assert.equal((await app.call('/api/workflows/authorize-run',{body:approval})).status,400);assert.equal(app.counts().clients,0);
 }finally{await app.close();}
});
test('multiple material production HTTP preserves guards and rejects malformed or underfunded selections',async()=>{
 const {app,state}=await multipleMaterialHttp();try{
  for(const [opts,expected]of [[{body:multipleMaterialHttpBody,authorized:false},403],[{body:multipleMaterialHttpBody,headers:{'x-cw-csrf':'bad'}},403],[{body:multipleMaterialHttpBody,id:null},400],[{body:{...multipleMaterialHttpBody,...materialProductionBody}},400],[{body:{...multipleMaterialHttpBody,exchanges:[]}},400],[{body:{...multipleMaterialHttpBody,exchanges:[{packId:'原料自选包',itemId:'木材',num:0},multipleMaterialHttpBody.exchanges[1]]}},400]])assert.equal((await app.call(materialProductionRoute,opts)).status,expected);
  assert.equal((await app.call(materialProductionRoute+'?extra=1',{body:multipleMaterialHttpBody})).status,400);state.stock.set('原料自选包',2);assert.equal((await app.call(materialProductionRoute,{body:multipleMaterialHttpBody})).status,400);assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);
 }finally{await app.close();}
});

const materialCoverageRoute='/api/gameplay/production/material/coverage',materialCoverageTarget={buildingId:'1材料厂',productId:'布匹'};
for(const result of ['success','unknown','refused'])test('material coverage HTTP '+result+' reuses read-only projection and original authorized finite chain',async()=>{
 const {app,state,client}=await multipleMaterialHttp();try{
  const reply=await app.call(materialCoverageRoute,{body:materialCoverageTarget});assert.equal(reply.status,200,JSON.stringify(reply.data));assert.equal(reply.data.coverage.status,'COVERED');assert.equal(reply.data.coverage.ok,true);assert.deepEqual(reply.data.coverage.exchanges,multipleMaterialHttpBody.exchanges);assert.deepEqual(reply.data.coverage.needs,[{pack:'原料自选包',num:3,have:5}]);assert.equal(reply.data.executable,false);assert.equal(reply.data.projectionOnly,true);assert.equal(reply.data.requiresAuthorization,true);assert.equal(reply.data.graph,undefined);assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);assert.deepEqual(app.history.list('B'),[]);
  const payload={...materialCoverageTarget,exchanges:reply.data.coverage.exchanges,maxDurationMs:60000},prepared=await app.call(materialProductionRoute,{body:payload});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(state.writes.length,0);
  const send=client.sendWatch.bind(client);client.sendWatch=async(n,b,o)=>{if(result==='refused'&&state.writes.length===1){o.beforeDispatch?.();state.writes.push({n,b:structuredClone(b)});throw Object.assign(Error('synthetic rejection'),{code:'REJECTED'});}const r=await send(n,b,o);if(result==='unknown'&&state.writes.length===2)state.stock.set('unrelated',999);return r;};
  assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;assert.equal(state.writes.length,0);assert.equal((await app.call('/api/workflows/authorize-run',{body:{offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true}})).status,200);await waitForWorkflow(app,result==='success'?'COMPLETED':result==='unknown'?'UNKNOWN':'FAILED');assert.equal(state.writes.length,result==='success'?3:2);assert.equal(app.counts().clients,0);assert.equal(app.counts().collections,0);
 }finally{await app.close();}
});
test('material coverage HTTP rejects guard, schema and account substitutions without writes',async()=>{
 const {app,state}=await multipleMaterialHttp();try{
  for(const[opts,status]of [[{body:materialCoverageTarget,authorized:false},403],[{body:materialCoverageTarget,headers:{'x-cw-csrf':'bad'}},403],[{body:materialCoverageTarget,id:null},400],[{body:{...materialCoverageTarget,maxDurationMs:60000}},400],[{body:{...materialCoverageTarget,exchanges:[]}},400],[{body:{buildingId:'1材料厂'}},400],[{body:{...materialCoverageTarget,buildingId:' 1材料厂'}},400]])assert.equal((await app.call(materialCoverageRoute,opts)).status,status);
  assert.equal((await app.call(materialCoverageRoute+'?extra=1',{body:materialCoverageTarget})).status,400);assert.equal((await app.call(materialCoverageRoute+'?account=A&account=B',{body:materialCoverageTarget,id:null})).status,400);assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);
 }finally{await app.close();}
});
for(const condition of ['stock','shortage','season','type','disabled'])test('material coverage HTTP '+condition+' stays read-only and cannot imply executable qualification',async()=>{
 const {app,state,config}=await multipleMaterialHttp();try{
  if(condition==='stock'){state.stock.set('木材',2);state.stock.set('鱼',1);}if(condition==='shortage')state.stock.set('原料自选包',2);if(condition==='season')config.tables.SelectPackLibCfg.data.find(row=>row.selectItemId==='鱼').season=2;if(condition==='type')config.tables.ItemCfg.data.find(row=>row.id==='鱼').type='货币';if(condition==='disabled')assert.equal((await app.call('/api/gameplay/config',{body:{module:'material-packs',config:{enabled:false}}})).status,200);
  const reply=await app.call(materialCoverageRoute,{body:materialCoverageTarget});assert.equal(reply.status,200,JSON.stringify(reply.data));assert.equal(reply.data.coverage.status,{stock:'IN_STOCK',shortage:'INSUFFICIENT',season:'BLOCKED',type:'UNKNOWN',disabled:'BLOCKED'}[condition]);assert.equal(reply.data.coverage.ok,false);assert.deepEqual(reply.data.coverage.exchanges,[]);assert.equal(reply.data.executable,false);assert.equal(reply.data.coverage.executable,false);assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);
 }finally{await app.close();}
});
for(const change of ['account','player','world','connection','generation','config'])test('material coverage HTTP late '+change+' source is rejected',async()=>{
 const {app,state,session,client,config}=await multipleMaterialHttp();try{
  let changed=false;state.onRead=()=>{if(changed)return;changed=true;if(change==='account')client.factContext.accountId='B';if(change==='player')session.player.playerId='2';if(change==='world')session.player.worldId=2000001;if(change==='connection')session.connectionId=client.factContext.connectionId='changed';if(change==='generation'){client.factContext.generation=++session.generation;session.busy='successor';}if(change==='config')config.tables.ItemCfg.revision=2;};
  const reply=await app.call(materialCoverageRoute,{body:materialCoverageTarget});assert.notEqual(reply.status,200);assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);if(change==='generation')assert.equal(session.busy,'successor');
 }finally{await app.close();}
});

for(const fault of ['extra-item','extra-gold','other-tech'])test('Alliance exact technology settlement '+fault+' persists UNKNOWN and prevents replay after restart',async()=>{
 const app=await harness({includeAlliance:true});
 try{
  const session=app.ready('A');await app.enable();const p=await app.plan(),permit=await app.approve(p.data);
  const request=session.client.request.bind(session.client);
  session.client.request=async(...args)=>{const value=await request(...args);if(app.requests.some(row=>row.name==='UpgradeGuildTechRequest')){
   if(fault==='extra-item'&&args[0]==='AllItemRequest')value.items.push({itemId:'unrelated',num:1});
   if(fault==='extra-gold'&&args[0]==='AllResourceRequest')value.list.push({res:3,amount:1});
   if(fault==='other-tech'&&args[0]==='GuildTechInfoRequest')value.tech.push({techId:10102,level:1});
  }return value;};
  assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
  const record=(await app.call('/api/operations/history')).data.runs[0];
  assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].verification.status,'UNCONFIRMED');assert.equal(record.actions[0].unresolvedWrite,true);
  assert.deepEqual(record.runBudget.reserved.resources,[{id:'公会科技点',num:2400}]);assert.deepEqual(app.history.list('A')[0].runBudget.reserved.resources,[{id:'公会科技点',num:2400}]);
  assert.equal(session.client.uncertainWrites.has('UpgradeGuildTechRequest'),true);assert.equal(app.history.unresolved('A'),true);
  assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);
  const bytes=fs.readFileSync(app.history.storagePath,'utf8'),{createOperationService}=await import('../src/operation-service.mjs');
  const reopened=createExecutionHistory({file:app.history.storagePath}),service=createOperationService({history:reopened,modules:app.operations.modules,protocol});
  assert.equal(service.blocked('A'),true);const fresh=app.ready('A');
  await assert.rejects(service.surveyModule(fresh,'alliance',{techId:10101,targetLevel:2}),{code:'RECOVERY_UNCERTAIN'});
  assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);assert.equal(app.requests.filter(row=>row.name==='UpgradeGuildTechRequest').length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const unconfirmed of [false,true])test('single-ticket recruit HTTP uses existing survey plan permit history and UNKNOWN '+unconfirmed,async()=>{
 const data={freeEndTimeSeconds:2000,nextLuck:10,recruitTimes:1,task:{times:1,gotId:0}},state={stock:1,recruit:structuredClone(data),antique:structuredClone(data),heroes:[{heroId:'tank',level:1,star:0,power:'1',skillLevels:[1],equips:[],attributes:[]}]};
 const configOverride={tables:{ModuleOpenCfg:{data:[{moduleId:'英雄入口',playerLevel:6}]},HeroCfg:{data:[{id:'tank'},{id:'ranger'}]},ItemCfg:{data:[{id:'抽卡券'}]}}};
 const app=await harness({testProtocol:heroWireProtocol,includeFreeRecruit:true,recruitState:state,configOverride,unconfirmed});try{
 const route='/api/gameplay?module=free-recruit';assert.equal((await app.call(route)).data.view,null);assert.equal(app.requests.length,0);app.ready('A');assert.equal((await app.call('/api/gameplay/config',{body:{module:'free-recruit',config:{enabled:true}}})).status,200);
 const args={module:'free-recruit',parameters:{payment:'ticket'}};assert.equal((await app.call('/api/gameplay/survey',{body:args,authorized:false})).status,403);const read=await app.call('/api/gameplay/survey',{body:args});assert.equal(read.status,200,JSON.stringify(read.data));const row=read.data.view.candidates[0];assert.equal(row.executable,true,JSON.stringify(row));assert.deepEqual(row.costs,[{id:'抽卡券',num:1}]);assert.equal(app.requests.some(r=>r.options?.mutate),false);
 const planned=await app.call('/api/operations/plan',{body:{...args,mode:'Manual',selections:[row.actionId]}});assert.equal(planned.status,200,JSON.stringify(planned.data));assert.deepEqual(planned.data.resourceBudget,[{id:'抽卡券',num:1}]);assert.equal(app.requests.some(r=>r.options?.mutate),false);const permit=await app.approve(planned.data);assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
 const history=(await app.call('/api/operations/history')).data.runs;assert.equal(history[0].finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',JSON.stringify(history[0]));assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>({name:r.name,body:r.body})),[{name:'RecruitStartRequest',body:{way:2}}]);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);if(unconfirmed){const before=app.requests.length;assert.equal((await app.call('/api/gameplay/survey',{body:args})).data.code,'RESPONSE_UNCERTAIN');assert.equal(app.requests.length,before);}assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('original dailies HTTP exposes read-only open-rank windows with current account and role isolation',async()=>{
 const app=await harness();try{
  const session=app.ready('A');session.connectionId='synthetic-open-rank';session.player={playerId:'1',worldId:17};session.snapshot={ok:{},failed:{},sessionFacts:{openRankActivity:{status:'OBSERVED',reliable:true,source:'SCAllActivity.openRankActivity',scope:'ACCEPTED_STREAM_WINDOWS_ONLY',accountId:'A',generation:1,connectionId:'synthetic-open-rank',playerId:'1',worldId:'17',seq:1,observedAt:'2026-11-16T01:00:00.000Z',activityTime:[{type:4,startTime:100,endTime:400}]}}};
  const response=await app.call('/api/dailies');assert.equal(response.status,200);const a=response.data.checklist.openRank;assert.equal(a.status,'OBSERVED');assert.equal(a.rows[0].type,4);assert.equal(a.rows[0].eligible,null);assert.equal(a.rows[0].executable,false);assert.equal(a.complete,false);assert.match(response.data.text,/开服排行窗口：OBSERVED/);
  for(const [object,key,value]of[[session,'generation',2],[session,'connectionId','other'],[session.player,'playerId','2'],[session.player,'worldId',18]]){const old=object[key];object[key]=value;const changed=(await app.call('/api/dailies')).data.checklist.openRank;assert.equal(changed.status,'UNKNOWN');assert.deepEqual(changed.rows,[]);object[key]=old;}
  app.ready('B');const other=await app.call('/api/dailies',{id:'B'});assert.equal(other.data.checklist.openRank.status,'UNKNOWN');assert.deepEqual(other.data.checklist.openRank.rows,[]);assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal((await app.call('/api/dailies/run',{body:{confirm:true}})).data.code,'READ_ONLY_ROUTE');
 }finally{await app.close();}
});

const openRankWarHttpConfig={tables:Object.fromEntries(['OpenRankWarTaskCfg','ItemCfg'].map(k=>[k,structuredClone(merchantHttpActual.tables[k])]))};
const openRankWarHttpParameters={kind:'open-rank-war',tierId:500};
async function openRankWarHttpReady(app,{unconfirmed=false,kind='open-rank-war'}={}){
 const mode=kind.slice(10),type=({order:1,stage:2,pirate:3,war:4})[mode],table='OpenRank'+mode[0].toUpperCase()+mode.slice(1)+'TaskCfg',tierId=({order:1000,stage:20,pirate:1000,war:500})[mode];
 const session=app.ready('A'),codec=createVipHttpCodec(heroWireProtocol);session.player={playerId:'9007199254740993',worldId:'1000001'};session.connectionId='open-rank-war-http-A';let socket;
 class Socket{constructor(){socket=this;this.readyState=0;}send(bytes){assert.equal(this.readyState,1);codec.decode(bytes);}close(){this.readyState=3;}receive(n,b,seq=0){this.onmessage?.({data:codec.encode(n,seq,b)});}}
 const client=new VipHttpClient({protocol:heroWireProtocol,accountId:'A',generation:session.generation,WebSocketImpl:Socket});client.on('error',()=>{});client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};
 const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:session.player});await pending;clearInterval(client.tickTimer);client.tickTimer=null;
 client.gameClock={reset(){},read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:'A',generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};
 socket.receive('SCAllActivity',{openRankActivity:{activityTime:[{type,startTime:900,endTime:2000}]}},1);
 const state={daily:{endTime:2000,progress:1000,gotRewardId:[]},stock:[{itemId:'unrelated',num:9}],resources:[{res:1,amount:100},{res:3,amount:200},{res:4,amount:50}]};
 client.request=async(n,b,r)=>{heroWire(n,b);app.requests.push({id:'A',name:n,body:structuredClone(b),response:r});if(n==='OpenRankInfoRequest')assert.deepEqual(b,{type});else assert.deepEqual(b,{});const value=n==='OpenRankInfoRequest'?state.daily:n==='AllItemRequest'?{items:state.stock}:n==='AllResourceRequest'?{list:state.resources}:null;assert.ok(value,n);return heroWire(r,value);};
 client.sendWatch=async(n,b,opts)=>{assert.equal(n,'GotOpenRankRewardRequest');assert.deepEqual({...heroWire(n,b)},{type,id:tierId});opts?.beforeDispatch?.();app.requests.push({id:'A',name:n,body:structuredClone(b),response:null});if(!unconfirmed){state.daily.gotRewardId.push(tierId);const row=merchantHttpActual.tables[table].data.find(r=>r.score===tierId&&(type<3||r.season===1));for(const [id,num]of row.reward){const resource={RUBY:4,GOLD:3,EXP:1}[id];if(resource)state.resources.find(r=>r.res===resource).amount+=num;else state.stock.push({itemId:id,num});}}return {status:'UNKNOWN'};};
 session.client=client;return {session,client,state};
}
for(const unconfirmed of [false,true])test('open-rank war HTTP shares original permit, persistence and UNKNOWN protection '+unconfirmed,async()=>{
 const app=await harness({includeDailyReward:true,testProtocol:heroWireProtocol,configOverride:openRankWarHttpConfig});let client;try{
 const f=await openRankWarHttpReady(app,{unconfirmed});client=f.client;const route='/api/gameplay?module=task-rewards',read=await app.call(route);assert.equal(read.data.config.enabled,false);assert.equal(read.data.view,null);assert.equal(app.requests.length,0);await app.call('/api/gameplay/config',{body:{module:'task-rewards',config:{enabled:true}}});
 const body={module:'task-rewards',parameters:openRankWarHttpParameters};assert.equal((await app.call('/api/gameplay/survey',{body,authorized:false})).status,403);
 for(const parameters of [{...openRankWarHttpParameters,type:4},{...openRankWarHttpParameters,taskId:500},{...openRankWarHttpParameters,tierId:0},{...openRankWarHttpParameters,tierId:'500'}])assert.equal((await app.call('/api/gameplay/survey',{body:{...body,parameters}})).status,400);assert.equal(app.requests.length,0);
 const surveyed=await app.call('/api/gameplay/survey',{body});assert.equal(surveyed.status,200,JSON.stringify(surveyed.data));const row=surveyed.data.view.candidates[0];assert.equal(row.executable,true,JSON.stringify(row));assert.equal(row.action,undefined);assert.deepEqual(row.parameters,openRankWarHttpParameters);assert.equal(row.target.type,4);assert.equal(row.target.season,1);assert.equal(app.requests.some(r=>r.name==='GotOpenRankRewardRequest'),false);
 const p=await app.call('/api/operations/plan',{body:{...body,mode:'Manual',selections:[row.actionId]}});assert.equal(p.status,200,JSON.stringify(p.data));assert.deepEqual(p.data.resourceBudget,[]);assert.equal(p.data.budgetClaims.uids[0].type,'open-rank-war-task-reward');assert.equal((await app.call('/api/operations/execute',{body:{batchId:p.data.batchId,confirm:true}})).status,400);assert.equal(app.requests.some(r=>r.name==='GotOpenRankRewardRequest'),false);
 const approved=await app.approve(p.data);assert.equal(approved.status,200);assert.equal((await app.call('/api/operations/execute',{body:approved.data})).status,200);await app.operations.settle('A');
 const history=(await app.call('/api/operations/history')).data.runs[0];assert.equal(app.requests.filter(r=>r.name==='GotOpenRankRewardRequest').length,1,history.stopReason);assert.equal(history.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',history.stopReason);assert.deepEqual(history.runBudget.reserved.uids,p.data.budgetClaims.uids);assert.deepEqual(app.requests.find(r=>r.name==='GotOpenRankRewardRequest').body,{type:4,id:500});assert.equal((await app.call('/api/operations/execute',{body:approved.data})).status,403);assert.equal((await app.call(route)).data.status.blocked,unconfirmed);
 const restored=createExecutionHistory({file:app.history.storagePath});assert.equal(restored.unresolved('A'),unconfirmed);assert.equal(restored.list('A')[0].finalStatus,history.finalStatus);assert.equal((await app.call(route,{id:'B'})).data.view,null);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(f.state.stock.find(r=>r.itemId==='unrelated').num,9);
 }finally{client?.stop();await app.close();}
});

for(const qualified of [false,true])test('open-rank war observation HTTP records only target and reads durable history with zero writes '+qualified,async()=>{
 const app=await harness({includeDailyReward:true,testProtocol:heroWireProtocol,configOverride:openRankWarHttpConfig});let client;try{
 const f=await openRankWarHttpReady(app);client=f.client;if(!qualified)f.state.daily.progress=0;await app.call('/api/gameplay?module=task-rewards');
 const g=graph('war-read-only',[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'task-rewards',parameters:openRankWarHttpParameters},{id:'z',type:'STOP'}],[{from:'s',to:'q'},{from:'q',to:'z'}]);assert.equal((await app.call('/api/workflows/simulate',{body:{graph:g}})).data.requestsSent,0);assert.equal(app.requests.length,0);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.plan,null);assert.equal(done.runAuthorization,undefined);assert.deepEqual(app.requests.map(r=>r.name),['OpenRankInfoRequest','AllItemRequest','AllResourceRequest']);assert.equal((await app.call('/api/gameplay?module=task-rewards')).data.config.enabled,false);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);
 const count=app.requests.length,history=(await app.call('/api/workflows/history?workflowRunId='+done.runId)).data;assert.equal(history.readOnly,true);assert.equal(history.resumable,false);assert.deepEqual(history.nodes,[]);assert.deepEqual(history.surveys[0].taskObservation,openRankWarHttpParameters);assert.equal(Object.hasOwn(history.surveys[0].taskObservation,'eligible'),false);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);
 const {createWorkflowStore}=await import('../src/workflow.mjs'),file=path.join(root,'workflows.json'),bytes=fs.readFileSync(file,'utf8'),store=createWorkflowStore({file,modules:GAMEPLAY_MODULES}),saved=store.history('A').find(row=>row.runId===done.runId);assert.ok(saved);assert.equal(saved.resumable,false);assert.deepEqual(saved.trace.find(row=>row.taskObservation).taskObservation,openRankWarHttpParameters);assert.deepEqual(store.history('B'),[]);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(app.requests.length,count);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});

for(const [parameters,options]of [[{kind:'daily-activity',tierId:1},{includeDailyActivity:true}],[{kind:'daily-gift',packId:'赠礼'},{includeDailyGift:true}],[{kind:'weekly-lottery-gift',packId:'1000'},{includeWeeklyGift:true}],[{kind:'weekly-unique-lottery-gift',packId:'1000'},{includeUniqueGift:true}],[{kind:'weekly-chip-gift',packId:'1000'},{includeChipGift:true}],[{kind:'weekly-chip-task',round:1,taskId:1},{includeChipTask:true}]])for(const entry of ['tasks','dailies','loop'])test('task target consolidation HTTP preserves original read-only '+parameters.kind+' '+entry,async()=>{
 const app=await harness(options);try{app.ready('A');await app.call('/api/gameplay?module=task-rewards');const phase=entry==='tasks'?'tasks':'dailies',prepared=await app.call('/api/workflows/prepare',{body:{entry,[phase]:[{...parameters,action:'observe'}],budget:{resources:[],quotas:[],uids:[]}}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const g=prepared.data.graph;assert.equal(g.nodes.some(n=>n.type==='ACTION'),false);assert.equal((await app.call('/api/workflows/simulate',{body:{graph:g}})).data.requestsSent,0);assert.equal(app.requests.length,0);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.plan,null);assert.equal(done.runAuthorization,undefined);assert.ok(app.requests.length>=3);assert.equal(app.requests.some(r=>r.options?.mutate||r.name.startsWith('Got')||r.name.startsWith('Draw')||r.name.includes('FreePack')||r.name==='WeekChipGotTaskRequest'),false);assert.equal((await app.call('/api/gameplay?module=task-rewards')).data.config.enabled,false);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);
 const count=app.requests.length,detail=await app.call('/api/workflows/history?workflowRunId='+done.runId);assert.equal(detail.status,200);assert.deepEqual(detail.data.surveys[0].taskObservation,parameters);assert.equal(detail.data.readOnly,true);assert.equal(detail.data.resumable,false);assert.deepEqual(detail.data.nodes,[]);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);const {createWorkflowStore}=await import('../src/workflow.mjs'),file=path.join(root,'workflows.json'),bytes=fs.readFileSync(file,'utf8'),store=createWorkflowStore({file,modules:GAMEPLAY_MODULES});assert.deepEqual(store.history('A')[0].trace.find(r=>r.taskObservation).taskObservation,parameters);assert.deepEqual(store.history('B'),[]);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(app.requests.length,count);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const count of [10,50])for(const unconfirmed of [false,true])test('owned-ticket batch recruit HTTP exact '+count+' authorization budget and history UNKNOWN '+unconfirmed,async()=>{
 const configOverride={tables:{ModuleOpenCfg:{data:[{moduleId:'英雄入口',playerLevel:1}]},HeroCfg:{data:['tank','ranger'].map(id=>({id,type:'英雄'}))},ItemCfg:{data:[{id:'抽卡券'},{id:'tank碎片'}]}}},data={freeEndTimeSeconds:0,nextLuck:10,recruitTimes:1,task:{times:1,gotId:0}},state={count,fragments:0,stock:count,recruit:structuredClone(data),antique:structuredClone(data),heroes:[{heroId:'tank',level:1,star:0,power:'1',skillLevels:[1],equips:[],attributes:[]}]},app=await harness({testProtocol:heroWireProtocol,includeFreeRecruit:true,recruitState:state,configOverride,unconfirmed});try{
 app.ready('A');await app.call('/api/gameplay?module=free-recruit');const args={module:'free-recruit',parameters:{payment:'ticket',count}};await app.call('/api/gameplay/config',{body:{module:'free-recruit',config:{enabled:true}}});assert.equal((await app.call('/api/gameplay/survey',{body:args,authorized:false})).status,403);const read=await app.call('/api/gameplay/survey',{body:args});assert.equal(read.status,200,JSON.stringify(read.data));const row=read.data.view.candidates[0];assert.equal(row.executable,true,JSON.stringify(row));assert.deepEqual(row.costs,[{id:'抽卡券',num:count}]);assert.equal(app.requests.some(r=>r.options?.mutate),false);
 const preview=await app.call('/api/operations/plan',{body:{...args,mode:'Manual',selections:[row.actionId]}});assert.equal(preview.status,200,JSON.stringify(preview.data));const plan=preview.data;assert.deepEqual(plan.resourceBudget,[{id:'抽卡券',num:count}]);const auth={batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(a=>a.actionId),resourceBudget:plan.resourceBudget,confirm:true};const refused=await app.call('/api/operations/authorize',{body:{...auth,resourceBudget:[]}});assert.equal(refused.status,403);assert.notEqual(refused.data.code,'CSRF_REQUIRED');const permit=await app.call('/api/operations/authorize',{body:auth});assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const history=(await app.call('/api/operations/history')).data.runs;assert.equal(history[0].finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',JSON.stringify(history[0]));assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>({name:r.name,body:r.body})),[{name:'RecruitStartRequest',body:{way:count===10?3:4}}]);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);if(unconfirmed){const before=app.requests.length;assert.equal((await app.call('/api/gameplay/survey',{body:args})).data.code,'RESPONSE_UNCERTAIN');assert.equal(app.requests.length,before);}assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('antique recruitment HTTP shares the original read-only survey and never offers a write',async()=>{
 const data={freeEndTimeSeconds:2000,nextLuck:10,recruitTimes:1,task:{times:1,gotId:0}},state={stock:50,recruit:structuredClone(data),antique:{...structuredClone(data),freeEndTimeSeconds:0},heroes:[{heroId:'tank',level:1,star:0,power:'1',skillLevels:[1],equips:[],attributes:[]}]};
 const configOverride={tables:{ModuleOpenCfg:{data:[{moduleId:'英雄入口',playerLevel:6},{moduleId:'藏品',playerLevel:10}]},HeroCfg:{data:[{id:'tank'},{id:'ranger'}]},ItemCfg:{data:[{id:'抽卡券'},{id:'藏品券'}]}}};
 const app=await harness({testProtocol:heroWireProtocol,includeFreeRecruit:true,recruitState:state,configOverride});try{
  const route='/api/gameplay?module=free-recruit';assert.equal((await app.call(route)).data.view,null);app.ready('A');
  const read=await app.call('/api/gameplay/survey',{body:{module:'free-recruit',parameters:{}}});assert.equal(read.status,200,JSON.stringify(read.data));
  const a=read.data.view.antiqueObservation;assert.equal(a.status,'OBSERVED');assert.equal(a.source,'RecruitInfoResponse.antique');assert.equal(a.readiness,'READY_BY_CLOCK');assert.equal(a.modes[0].observedRequirementsMet,true);assert.equal(a.ownedTickets,0);assert.equal(a.eligibility,null);assert.equal(a.executable,false);assert.equal(a.autoResume,false);assert.ok(a.modes.every(r=>r.executable===false&&!Object.hasOwn(r,'actionId')));
  assert.deepEqual(app.requests.map(r=>r.name),['RecruitInfoRequest','AllHeroRequest','OnWaterRequest','AllItemRequest','AllResourceRequest']);assert.equal(app.requests.some(r=>r.options?.mutate),false);
  const before=app.requests.length;assert.equal((await app.call('/api/gameplay/survey',{body:{module:'free-recruit',parameters:{kind:'antique'}}})).status,400);assert.equal(app.requests.length,before);
  assert.equal((await app.call(route,{id:'B'})).data.view,null);assert.equal(app.requests.length,before);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const [freeAntique,count]of [[true,1],[false,1],[false,10],[false,50]])for(const unconfirmed of [false,true])test('antique recruit HTTP uses existing exact permit and independent settlement '+freeAntique+' '+count+' '+unconfirmed,async()=>{
 const base=merchantHttpActual.tables.AntiqueBaseCfg.data[0],second=merchantHttpActual.tables.AntiqueBaseCfg.data[1],conversionCount=merchantHttpActual.tables.AntiqueFragReturnCfg.data.find(r=>r.color===base.color).count;
 const data={freeEndTimeSeconds:2000,nextLuck:10,recruitTimes:1,task:{times:1,gotId:0}},state={antiqueMode:true,freeAntique,count,stock:count,fragments:0,antiqueId:base.antiqueId,newAntiqueId:second.antiqueId,conversionCount,recruit:structuredClone(data),antique:{...structuredClone(data),freeEndTimeSeconds:freeAntique?0:2000},ownership:{antiques:[{id:base.antiqueId,star:0}],suits:[],masterLv:0},heroes:[{heroId:'tank',level:1,star:0,power:'1',skillLevels:[1],equips:[],attributes:[]}]};
 const configOverride={tables:{ModuleOpenCfg:{data:[{moduleId:'英雄入口',playerLevel:6},{moduleId:'藏品',playerLevel:10}]},HeroCfg:{data:[{id:'tank'},{id:'ranger'}]},...Object.fromEntries(['ItemCfg','AntiqueBaseCfg','AntiqueFragReturnCfg','AntiqueSuitCfg'].map(n=>[n,structuredClone(merchantHttpActual.tables[n])]))}};
 const app=await harness({testProtocol:heroWireProtocol,includeFreeRecruit:true,recruitState:state,configOverride,unconfirmed});try{
 app.ready('A');await app.call('/api/gameplay?module=free-recruit');await app.call('/api/gameplay/config',{body:{module:'free-recruit',config:{enabled:true}}});const parameters={recruit:'antique',...(freeAntique?{}:{payment:'ticket',...(count>1?{count}:{})})},args={module:'free-recruit',parameters};
 const read=await app.call('/api/gameplay/survey',{body:args});assert.equal(read.status,200,JSON.stringify(read.data));const row=read.data.view.candidates[0];assert.equal(row.executable,true,JSON.stringify(row));assert.equal(row.target.recruit,'antique');assert.equal(row.target.type,1);const cooldown=read.data.view.cooldownObservation;assert.equal(cooldown.status,'OBSERVED');assert.equal(cooldown.source,'RecruitInfoResponse.antique.freeEndTimeSeconds');assert.equal(cooldown.freeEndTimeSeconds,freeAntique?0:2000);assert.equal(cooldown.readiness,freeAntique?'READY_BY_CLOCK':'COOLDOWN');assert.equal(cooldown.eligibility,null);assert.equal(cooldown.executable,false);assert.equal(cooldown.autoResume,false);assert.equal(app.requests.some(r=>r.options?.mutate),false);
 const planned=await app.call('/api/operations/plan',{body:{...args,mode:'Manual',selections:[row.actionId]}});assert.equal(planned.status,200,JSON.stringify(planned.data));assert.deepEqual(planned.data.resourceBudget,freeAntique?[]:[{id:'藏品券',num:count}]);assert.equal(app.requests.some(r=>r.options?.mutate),false);
 const permit=await app.approve(planned.data);assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const rows=(await app.call('/api/operations/history')).data.runs;assert.equal(rows[0].finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',JSON.stringify(rows[0]));
 assert.deepEqual(app.requests.filter(r=>r.options?.mutate).map(r=>({name:r.name,body:r.body})),[{name:'AntiqueRecruitRequest',body:{type:1,way:freeAntique?1:({1:2,10:3,50:4})[count]}}]);assert.deepEqual(state.recruit,data);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);
 if(unconfirmed){const before=app.requests.length;assert.equal((await app.call('/api/gameplay/survey',{body:args})).data.code,'RESPONSE_UNCERTAIN');assert.equal(app.requests.length,before);}assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('cumulative recruit HTTP observes both seasonal identities through the original survey with zero writes',async()=>{
 const data={freeEndTimeSeconds:2000,nextLuck:10,recruitTimes:999,task:{times:650,gotId:1}},state={stock:50,recruit:structuredClone(data),antique:{...structuredClone(data),task:{times:100,gotId:0}},heroes:[{heroId:'tank',level:1,star:0,power:'1',skillLevels:[1],equips:[],attributes:[]}]};
 const configOverride={tables:{ModuleOpenCfg:{data:[{moduleId:'英雄入口',playerLevel:6},{moduleId:'藏品',playerLevel:10}]},HeroCfg:{data:[{id:'tank'}]},ItemCfg:{data:[{id:'抽卡券'},{id:'藏品券'},{id:'任务奖励'}]},HeroRecruitTaskCfg:{data:[{season:1,id:1,times:200,reward:[['任务奖励',1]]},{season:2,id:1,times:200,reward:[['任务奖励',2]]},{season:2,id:2,times:400,reward:[['任务奖励',3]]}]},AntiqueRecruitTaskCfg:{data:[{season:1,id:1,times:50,reward:[['任务奖励',1]]}]}}};
 const app=await harness({testProtocol:heroWireProtocol,includeFreeRecruit:true,recruitState:state,configOverride});try{
  const route='/api/gameplay?module=free-recruit';assert.equal((await app.call(route)).data.view,null);const session=app.ready('A');session.player.worldId='2000001';
  const read=await app.call('/api/gameplay/survey',{body:{module:'free-recruit',parameters:{}}});assert.equal(read.status,200,JSON.stringify(read.data));const [h,a]=read.data.view.taskObservations;
  assert.equal(h.status,'OBSERVED');assert.equal(h.season,2);assert.equal(h.configuredSeason,2);assert.equal(h.progress,650);assert.equal(h.nextRewardId,2);assert.deepEqual(h.tasks.map(r=>r.rewardState),['CLAIMED','UNCLAIMED']);assert.equal(h.tasks[1].observedRequirementsMet,true);assert.equal(h.settlement,'UNKNOWN');assert.equal(h.eligibility,null);assert.equal(h.executable,false);
  assert.equal(a.configuredSeason,1);assert.equal(a.progress,100);assert.equal(a.claimedThroughId,0);assert.equal(a.tasks[0].requiredProgress,50);
  assert.deepEqual(app.requests.map(r=>r.name),['RecruitInfoRequest','AllHeroRequest','OnWaterRequest','AllItemRequest','AllResourceRequest']);assert.equal(app.requests.some(r=>r.options?.mutate),false);
  const before=app.requests.length;assert.equal((await app.call(route,{id:'B'})).data.view,null);assert.equal(app.requests.length,before);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const entry of ['tasks','dailies','loop'])test('battle pass original HTTP exposes observations and pure survey history '+entry,async()=>{
 const parameters={kind:'weekly-battle-pass-task',taskId:1001},configOverride={tables:{WeekPassTaskCfg:{data:[{taskId:1001,type:'登录游戏',target:1,score:100,desc:'<safe task>'}]}}},app=await harness({includeDailyReward:true,testProtocol:heroWireProtocol,configOverride});try{
 const session=app.ready('A');session.client.request=async(name,body,response,timeout,options)=>{assert.equal(options?.mutate,undefined);assert.deepEqual(body,{});app.requests.push({name,body,response,options});heroWire(name,body);const answers={WeekBattlePassInfoRequest:{score:300,activePay:false,task:[{taskId:1001,progress:'9007199254740993',isGot:false}],got:[{stage:1,freeGot:true,payGot:false}]},WeekInfoRequest:{activityTime:[{type:1,period:1001,startTime:900,endTime:2000}]}};assert.ok(Object.hasOwn(answers,name),name);return heroWire(response,answers[name]);};
 const cached=await app.call('/api/gameplay?module=task-rewards');assert.equal(cached.data.config.enabled,false);assert.equal(app.requests.length,0);assert.equal((await app.call('/api/gameplay/survey',{body:{module:'task-rewards',parameters},authorized:false})).status,403);
 const read=await app.survey(parameters);assert.equal(read.status,200,JSON.stringify(read.data));assert.deepEqual(read.data.view.candidates,[]);const o=read.data.view.battlePassObservation;assert.equal(o.progress,'9007199254740993');assert.equal(o.completion,'COMPLETE');assert.equal(o.taskRewardState,'UNCLAIMED_RECORD');assert.equal(o.scoreReceipt,'UNKNOWN');assert.equal(o.claimable,null);assert.equal(o.executable,false);assert.equal(o.totalScore,300);
 const before=app.requests.length,phase=entry==='tasks'?'tasks':'dailies',intent={entry,[phase]:[{...parameters,action:'observe'}],budget:{resources:[],quotas:[],uids:[]}},prepared=await app.call('/api/workflows/prepare',{body:intent});assert.equal(prepared.status,200,JSON.stringify(prepared.data));assert.equal(app.requests.length,before);const g=prepared.data.graph;assert.equal(g.nodes.some(n=>n.type==='ACTION'),false);assert.equal((await app.call('/api/workflows/simulate',{body:{graph:g}})).data.requestsSent,0);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const done=(await waitForWorkflow(app,'COMPLETED')).status;assert.equal(done.plan,null);assert.equal(done.runAuthorization,undefined);
 const detail=(await app.call('/api/workflows/history?workflowRunId='+done.runId)).data;assert.deepEqual(detail.surveys[0].taskObservation,parameters);assert.equal(detail.resumable,false);assert.deepEqual(detail.nodes,[]);assert.equal((await app.call('/api/workflows/history?workflowRunId='+done.runId,{id:'B'})).status,404);
 const {createWorkflowStore}=await import('../src/workflow.mjs'),store=createWorkflowStore({file:path.join(root,'workflows.json'),modules:GAMEPLAY_MODULES}),saved=store.history('A').find(r=>r.runId===done.runId);assert.equal(saved.resumable,false);assert.equal(saved.runAuthorization,undefined);assert.deepEqual(saved.trace.find(r=>r.taskObservation).taskObservation,parameters);const observation=saved.trace.find(r=>r.battlePassObservation).battlePassObservation;
 assert.equal(Number.isSafeInteger(observation.infoSourceAt),true);assert.equal(Number.isSafeInteger(observation.windowSourceAt),true);assert.ok(observation.infoSourceAt>=o.sourceAt);assert.ok(observation.windowSourceAt>=o.windowSourceAt);
 assert.deepEqual(observation,{version:1,taskId:1001,infoStatus:'OBSERVED',infoSource:'WeekBattlePassInfoResponse',infoSourceAt:observation.infoSourceAt,info:{score:300,activePay:false,task:[{taskId:1001,progress:'9007199254740993',isGot:false}],got:[{stage:1,freeGot:true,payGot:false}]},windowStatus:'OBSERVED',windowSource:'WeekInfoResponse',windowSourceAt:observation.windowSourceAt,activityWindow:{type:1,period:1001,startTime:900,endTime:2000},readOnly:true,claimable:null,executable:false,autoResume:false,periodBinding:'UNPROVEN',dailyEpoch:'UNKNOWN',scoreReceipt:'UNKNOWN'});
 assert.deepEqual(detail.surveys[0].battlePassObservation,observation);assert.doesNotMatch(JSON.stringify(saved),/CLAIMED_RECORD|safe task/);assert.deepEqual(store.history('B'),[]);
 await app.enable();const p=await app.call('/api/operations/plan',{body:{module:'task-rewards',mode:'Manual',selections:['forged'],parameters}});assert.notEqual(p.status,200);assert.deepEqual((await app.call('/api/operations/history')).data.runs,[]);assert.ok(app.requests.every(r=>['WeekBattlePassInfoRequest','WeekInfoRequest'].includes(r.name)));assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const [kind,type,table,tierId]of [['open-rank-order',1,'OpenRankOrderTaskCfg',1000],['open-rank-stage',2,'OpenRankStageTaskCfg',20],['open-rank-pirate',3,'OpenRankPirateTaskCfg',1000]])for(const unconfirmed of [false,true])test('opening task HTTP original Service precise permit and result '+kind+' '+unconfirmed,async()=>{
 const parameters={kind,tierId},configOverride={tables:Object.fromEntries([table,'ItemCfg'].map(n=>[n,structuredClone(merchantHttpActual.tables[n])]))},app=await harness({includeDailyReward:true,testProtocol:heroWireProtocol,configOverride});let client;try{
 const f=await openRankWarHttpReady(app,{kind,unconfirmed});client=f.client;const cached=await app.call('/api/gameplay?module=task-rewards');assert.equal(cached.data.config.enabled,false);assert.equal(app.requests.length,0);await app.enable();const args={module:'task-rewards',parameters};assert.equal((await app.call('/api/gameplay/survey',{body:args,authorized:false})).status,403);const surveyed=await app.survey(parameters);assert.equal(surveyed.status,200,JSON.stringify(surveyed.data));const candidate=surveyed.data.view.candidates[0];assert.equal(candidate.executable,true,JSON.stringify(candidate));assert.equal(candidate.target.type,type);assert.equal(candidate.action,undefined);const planned=await app.call('/api/operations/plan',{body:{...args,mode:'Manual',selections:[candidate.actionId]}});assert.equal(planned.status,200,JSON.stringify(planned.data));assert.deepEqual(planned.data.resourceBudget,[]);assert.equal(app.requests.some(r=>r.name==='GotOpenRankRewardRequest'),false);const permit=await app.approve(planned.data);assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');const records=(await app.call('/api/operations/history')).data.runs;assert.equal(records[0].finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',JSON.stringify(records[0]));assert.deepEqual(app.requests.filter(r=>r.name==='GotOpenRankRewardRequest').map(r=>r.body),[{type,id:tierId}]);assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,403);assert.deepEqual((await app.call('/api/operations/history',{id:'B'})).data.runs,[]);if(unconfirmed){const count=app.requests.length;assert.equal((await app.survey(parameters)).data.code,'RESPONSE_UNCERTAIN');assert.equal(app.requests.length,count);}assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});
for(const unconfirmed of [false,true])test('compass original HTTP exact permit, budget, history and UNKNOWN '+unconfirmed,async()=>{
 const {loadConfig}=await import('../src/config.mjs'),{trustedGameClock}=await import('../src/state-facts.mjs'),config=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')}),app=await harness({includeCompass:true,testProtocol:heroWireProtocol,configOverride:config});let client;
 try{
  const cached=await app.call('/api/gameplay?module=compass-wheel');assert.equal(cached.status,200);assert.equal(cached.data.config.enabled,false);assert.equal(app.sessions.size,0);
  const session=app.ready('A'),player={playerId:'9007199254740993',worldId:'1000001',level:30},clock=trustedGameClock({accountId:'A',generation:1,wallNow:()=>1000000,monotonicNow:()=>100});let socket;
  const codec=createVipHttpCodec(heroWireProtocol);class Socket{constructor(){socket=this;this.readyState=0;}send(){}close(){this.readyState=3;}receive(n,b,seq=0){this.onmessage?.({data:codec.encode(n,seq,b)});}}
  client=new VipHttpClient({protocol:heroWireProtocol,accountId:'A',generation:1,WebSocketImpl:Socket,gameClock:clock});client.factContext={accountId:'A',generation:1,connectionId:'compass-http-A'};client.on('error',()=>{});const pending=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:player});pending.catch(()=>{});clearInterval(client.tickTimer);client.tickTimer=null;clock.markPing(1000000);clock.observePong(heroWire('PingResponse',{clientTimestamp:1000000,serverTimestamp:1000000}));
  const activityId='9007199254740995',ticket='活动26捞尸人_抽奖券',currency='活动26捞尸人_货币',info={score:100,claimedId:0,times:10,cost:{type:0,id:ticket,num:2},minScore:5,maxScore:20,outerGot:[],pity:10},stock=[{itemId:ticket,num:10},{itemId:currency,num:0}];
  socket.receive('SCAllActivity',{festivalActivities:[{activityId,festival:1,type:'捞尸人联动活动',season:1,startTime:800,openTime:900,closeTime:1900,endTime:2000,subActivity:[{subActivityType:28,openTime:900,closeTime:1900,compassWheel:{score:100,claimedId:0}}]}]},1);
  client.request=async(n,b,r,_timeout,opts)=>{heroWire(n,b);app.requests.push({id:'A',name:n,body:structuredClone(b),mutate:opts?.mutate===true});if(opts?.mutate){opts.beforeDispatch?.();assert.deepEqual(b,{activityId,num:1});if(!unconfirmed){info.score+=10;info.times++;info.pity++;stock[0].num-=2;stock[1].num+=10;}return heroWire(r,{spin:[{innerId:2,outerId:0,score:10}],score:110,reward:{asset:[{type:0,id:currency,num:10}]}});}return heroWire(r,n==='CompassWheelInfoRequest'?info:n==='AllItemRequest'?{items:stock}:{list:[{res:3,amount:100},{res:4,amount:50}]});};
  Object.assign(session,{client,player,connectionId:'compass-http-A'});await app.call('/api/gameplay/config',{body:{module:'compass-wheel',config:{enabled:true}}});
  const parameters={activityId,count:1},read=await app.call('/api/gameplay/survey',{body:{module:'compass-wheel',parameters}});assert.equal(read.status,200);const row=read.data.view.candidates[0];assert.equal(row.executable,true,JSON.stringify(row));assert.equal(app.requests.filter(r=>r.mutate).length,0);
  assert.equal((await app.call('/api/gameplay/survey',{body:{module:'compass-wheel',parameters:{...parameters,buy:true}}})).status,400);
  const planned=await app.call('/api/operations/plan',{body:{module:'compass-wheel',mode:'Manual',parameters,selections:[row.actionId]}});assert.equal(planned.status,200,JSON.stringify(planned.data));const p=planned.data;assert.deepEqual(p.resourceBudget,[{id:ticket,num:2}]);assert.equal(app.requests.filter(r=>r.mutate).length,0);
  const approved=await app.approve(p);assert.equal(approved.status,200);const permit=approved.data,executed=await app.call('/api/operations/execute',{body:{batchId:p.batchId,permitId:permit.permitId}});assert.equal(executed.status,200);await app.operations.settle('A');
  const record=app.history.list('A')[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS',record.stopReason);assert.equal(app.history.list('B').length,0);assert.equal(app.requests.filter(r=>r.mutate).length,1);assert.deepEqual(record.runBudget.reserved.resources,[{id:ticket,num:2}]);
  assert.equal((await app.call('/api/operations/execute',{body:{batchId:p.batchId,permitId:permit.permitId}})).status,403);assert.equal(app.requests.filter(r=>r.mutate).length,1);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{client?.stop();await app.close();}
});

// Exercise the existing HTTP preparation and per-node execution contracts together.
async function museumGrowthHttpFixture(actionType,{unconfirmed=false}={}){
 const config=structuredClone(museumDailyCfg);
 config.tables.MuseumExpeditionTeamCfg.data[0].teamCount=2;
 config.tables.MuseumExpeditionConditionCfg.data[0].heroCount=2;
 config.tables.MuseumExpeditionStageCfg.data.push({stageId:2,areaLevelReq:[]});
 config.tables.MuseumAchievementCfg={data:[{score:100,rewards:[['小麦',2]]},{score:200,rewards:[['小麦',3]]}]};
 const app=await harness({includeMuseum:true,testProtocol:heroWireProtocol,configOverride:config,unconfirmed});
 try{
  const session=app.ready('A'),state=session.museumState;
  state.info.topPopularity=200;
  state.info.exploreStages.push({...structuredClone(state.info.exploreStages[0]),stageId:2});
  session.client.sendWatch=async(name,body,options)=>{
   assert.equal(actionType,'claimAchievement');assert.equal(name,'MuseumClaimAchievementRequest');heroWire(name,body);
   options.beforeDispatch?.();app.requests.push({id:'A',name,body:structuredClone(body),response:null,options});
   if(!unconfirmed){
    const reward=config.tables.MuseumAchievementCfg.data.find(row=>row.score===body.popularityThreshold);
    assert.ok(reward);assert.equal(state.info.claimedAchievements.includes(body.popularityThreshold),false);
    state.info.claimedAchievements.push(body.popularityThreshold);state.stock+=reward.rewards[0][1];
   }
   return {status:'UNKNOWN'};
  };
  await app.call('/api/gameplay?module=museum');
  assert.equal((await app.call('/api/gameplay/config',{body:{module:'museum',config:{enabled:true,exploration:true,collection:true}}})).status,200);
  const survey=await app.call('/api/gameplay/survey',{body:{module:'museum',parameters:{}}});
  assert.equal(survey.status,200,JSON.stringify(survey.data));
  const targets=actionType==='claimAchievement'?[{popularityThreshold:100},{popularityThreshold:200}]:survey.data.view.explorationSelection.stages.map((row,i)=>({stageId:row.stageId,heroIds:i?['C','D']:['A','B'],factor:i?2:1,expectedExploreHash:row.preparationHash}));
  return {app,session,input:{actionType,targets,maxDurationMs:60000}};
 }catch(error){await app.close();throw error;}
}
for(const actionType of ['claimAchievement','startExplore'])for(const unconfirmed of [false,true])test('museum growth HTTP explicit batch per-item permits and independent settlement '+actionType+' '+unconfirmed,async()=>{
 const {app,session,input}=await museumGrowthHttpFixture(actionType,{unconfirmed});
 try{
  const route='/api/gameplay/museum/growth/prepare',before=app.requests.length;
  assert.equal((await app.call(route,{body:input,authorized:false})).status,403);assert.equal(app.requests.length,before);
  const prepared=await app.call(route,{body:input});assert.equal(prepared.status,200,JSON.stringify(prepared.data));
  const result=prepared.data,g=result.graph;
  assert.equal(result.accountId,'A');assert.equal(result.resumable,false);assert.equal(result.requiresFreshPlan,true);assert.equal(result.requiresAuthorization,true);
  assert.deepEqual(g.nodes.map(row=>row.type),['START','ACTION','VERIFY','ACTION','VERIFY','STOP']);
  assert.deepEqual(result.budget.resources,actionType==='startExplore'?[{id:'小麦',num:6}]:[]);
  assert.equal(result.budget.uids.length,actionType==='startExplore'?6:2);
  const writes=()=>app.requests.filter(row=>['MuseumClaimAchievementRequest','MuseumStartExploreRequest'].includes(row.name));
  assert.equal(writes().length,0);assert.equal((await app.call('/api/workflows/simulate',{body:{graph:g}})).data.requestsSent,0);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);
  let runId;
  for(let i=0;i<2;i++){
   const paused=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,p=paused.plan;runId=paused.runId;
   assert.equal(p.actions.length,1);assert.equal(p.actions[0].actionType,actionType);
   assert.deepEqual(p.actions[0].target,result.steps[i].target);assert.deepEqual(p.resourceBudget,result.steps[i].costs);
   assert.equal(writes().length,i);
   const cross=await app.call('/api/operations/authorize',{id:'B',body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(row=>row.actionId),resourceBudget:p.resourceBudget,confirm:true}});
   assert.notEqual(cross.status,200);
   const permit=await app.approve(p);assert.equal(permit.status,200,JSON.stringify(permit.data));
   assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
   const replay=await app.call('/api/operations/execute',{body:permit.data});assert.equal(replay.status,unconfirmed?400:403,JSON.stringify(replay.data));if(unconfirmed)assert.equal(replay.data.code,'RUN_BUDGET_CLOSED');
   assert.equal(writes().length,i+1);assert.deepEqual(writes()[i].body,result.steps[i].target);
   assert.ok(app.requests.slice(app.requests.indexOf(writes()[i])+1).some(row=>row.name==='MuseumInfoRequest'));
   assert.ok(app.requests.slice(app.requests.indexOf(writes()[i])+1).some(row=>row.name==='AllItemRequest'));
   const record=app.history.list('A')[0];assert.equal(record.finalStatus,unconfirmed?'UNKNOWN':'SUCCESS');
   assert.equal(record.actions[0].verification.status,unconfirmed?'UNCONFIRMED':'CONFIRMED');
   assert.equal(record.workflowId,runId);assert.equal(record.workflowNodeId,'grow-'+i);
   assert.equal(record.runBudget.reserved.uids.length,(i+1)*(actionType==='startExplore'?3:1));
   await app.call('/api/workflows/resume',{body:{}});
   if(unconfirmed){
    assert.equal((await app.call('/api/workflows')).data.status.status,'UNKNOWN');
    const count=app.requests.length;await app.call('/api/workflows/resume',{body:{}});
    assert.equal(app.requests.length,count);assert.equal(writes().length,1);assert.equal(app.operations.blocked('A'),true);
    break;
   }
  }
  if(!unconfirmed){assert.equal((await waitForWorkflow(app,'COMPLETED')).status.runId,runId);assert.equal(app.history.list('A').length,2);}
  assert.equal(session.museumState.stock,unconfirmed?10:actionType==='startExplore'?4:15);
  assert.deepEqual(session.museumState.info.claimedAchievements,actionType==='claimAchievement'&&!unconfirmed?[100,200]:[]);
  assert.equal(session.museumState.info.uncollectedRevenue,10);
  assert.equal((await app.call('/api/workflows/history?workflowRunId='+runId,{id:'B'})).status,404);
  assert.deepEqual(app.history.list('B'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});


// Actual local configuration/codecs, synthetic transport; use the existing HTTP,
// Service and Workflow implementation for every permit, debit and verification.
async function ownedBatchHttpFixture(kind,{count=2,outcome='success'}={}) {
 const {loadConfig}=await import('../src/config.mjs');
 const config=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
 const module=kind==='blueprint'?'formation-unlock':'alliance';
 const app=await harness({includeFormationUnlock:kind==='blueprint',includeAllianceFort:kind==='fort',testProtocol:heroWireProtocol,configOverride:config});
 try {
  const session=app.ready('A');
  session.player={playerId:'9007199254740993',worldId:'3000017',guildId:'9007199254740995',mainlineStage:101};
  session.connectionId='owned-http-A';session.client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};
  const formation={presetId:1,petUid:'9007199254740995',heroPositions:[{heroId:'A',pos:{x:1,y:3}},{heroId:'B',pos:{x:4,y:4}}]};
  const state={ids:[],formation,used:499,fort:{cityId:7,type:'挖沙船',state:0,process:[],durability:0,effectTime:0},stock:new Map(kind==='blueprint'?[...Array.from({length:count},(_,i)=>['阵型'+(i+2)+'图纸',1]),['技能书',9]]:[['耐火砖',20],['高温合金',20],['功勋',10],['技能书',9]]),onRead:null,writes:[]};
  const stock=()=>({items:[...state.stock].filter(([,num])=>num>0).map(([itemId,num])=>({itemId,num}))});
  const write=(name,body,options)=>{
   heroWire(name,body);options.beforeDispatch?.();
   assert.equal(app.history.list('A')[0].actions[0].requestStatus,'DISPATCHING');
   state.writes.push({name,body:structuredClone(body)});
   app.requests.push({id:'A',name,body:structuredClone(body),options});
   const index=state.writes.length;
   if(outcome==='refused-'+index)throw Object.assign(Error('synthetic owned-material refusal'),{code:'REJECTED'});
   if(outcome==='unknown-'+index){
    if(kind==='blueprint')return null;
    const base=config.tables.FortDonateMaterialCfg.data.find(row=>row.id===body.item.itemId).res[1];
    return {process:state.fort.process,reward:{asset:[{type:0,id:'功勋',num:state.allianceFortReward(base,body.item.num,state.used,500,2500)}]}};
   }
   if(kind==='blueprint'){
    assert.equal(name,'UnlockFormationPresetRequest');assert.equal(state.ids.includes(body.id),false);
    state.ids.push(body.id);const item='阵型'+body.id+'图纸';state.stock.set(item,state.stock.get(item)-1);return null;
   }
   assert.equal(name,'DonateFortRequest');assert.equal(body.selectPackNum,0);
   const {allianceFortReward}=state,base=config.tables.FortDonateMaterialCfg.data.find(row=>row.id===body.item.itemId).res[1],reward=allianceFortReward(base,body.item.num,state.used,500,2500);
   let progress=state.fort.process.find(row=>row.itemId===body.item.itemId);
   if(!progress){progress={itemId:body.item.itemId,num:0};state.fort.process.push(progress);}
   progress.num+=body.item.num;state.used+=body.item.num;
   state.stock.set(body.item.itemId,state.stock.get(body.item.itemId)-body.item.num);state.stock.set('功勋',state.stock.get('功勋')+reward);
   return {process:state.fort.process,reward:{asset:[{type:0,id:'功勋',num:reward}]}};
  };
  state.allianceFortReward=(await import('../src/alliance-fort.mjs')).allianceFortReward;
  session.client.gameClock={read(){const now=Date.now();return {status:'TRUSTED',reliable:true,accountId:'A',generation:session.generation,nowMs:now,earliestMs:now-1,latestMs:now+1,source:'PingResponse.serverTimestamp'};}};
  session.client.request=async(name,body,response,_timeout,options)=>{
   if(name==='DonateFortRequest'){assert.equal(options.mutate,true);const value=write(name,body,options);return heroWire(response,value??{process:state.fort.process,reward:{asset:[]}});}
   assert.equal(options?.mutate,undefined);heroWire(name,body);app.requests.push({id:'A',name,body:structuredClone(body)});await state.onRead?.(name);
   const answers={GetFormationRequest:{formation:state.formation},MyFormationPresetRequest:{ids:state.ids},AllHeroRequest:{heroes:[{heroId:'A'},{heroId:'B'}]},AllItemRequest:stock(),AllResourceRequest:{list:[{res:3,amount:700},{res:6,amount:12}]},GuildInfoRequest:{guild:{guildId:session.player.guildId,level:1},myTitle:4},GuildCityInfoRequest:{cities:[{cityId:7,recommended:false,defenceNum:1,fort:state.fort}]},CityFortInfoRequest:{fort:state.fort,fortStats:[],fortFund:123,fundSpeed:2,dailyDonateNum:state.used},GuildMemberRequest:{titleList:[]},GuildAidListRequest:{askItems:[]},MyGuildAidRequest:{aids:[]},GuildOrderRequest:{order:{requirements:[],nextRefreshTime:1800003600}},CounterInfoRequest:{counters:[]},GuildTechInfoRequest:{tech:[]},SeasonTaskStageRequest:{stage:1}};
   assert.ok(Object.hasOwn(answers,name),'unexpected owned batch read '+name);return heroWire(response,answers[name]);
  };
  session.client.sendWatch=async(name,body,options)=>{assert.equal(kind,'blueprint');write(name,body,options);return {status:'UNKNOWN'};};
  await app.call('/api/gameplay?module='+module);
  assert.equal((await app.call('/api/gameplay/config',{body:{module,config:kind==='blueprint'?{enabled:true}:{enabled:true,fort:true}}})).status,200);
  const surveyed=await app.call('/api/gameplay/survey',{body:{module,parameters:kind==='blueprint'?{}:{cityId:7}}});assert.equal(surveyed.status,200,JSON.stringify(surveyed.data));
  const input=kind==='blueprint'?{targets:Array.from({length:count},(_,i)=>({presetId:i+2})),maxDurationMs:60000}:{cityId:7,donations:surveyed.data.view.fort.donationSources.slice(0,count).map(row=>({...row,num:2})),maxDurationMs:60000};
  return {app,session,state,module,input,route:'/api/gameplay/'+(kind==='blueprint'?'formation-unlock':'alliance/fort')+'/prepare'};
 }catch(error){await app.close();throw error;}
}
for(const kind of ['blueprint','fort'])for(const outcome of ['success','unknown-1','unknown-2','refused-1','refused-2'])test('owned material batch HTTP '+kind+' '+outcome+' preserves per-item authority and fixed parent debit',async()=>{
 const {app,state,module,input,route}=await ownedBatchHttpFixture(kind,{outcome});
 try {
  const before=app.requests.length;assert.equal((await app.call(route,{body:input,authorized:false})).status,403);assert.equal(app.requests.length,before);
  const prepared=await app.call(route,{body:input});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const p=prepared.data;
  assert.equal(p.accountId,'A');assert.equal(p.resumable,false);assert.equal(p.requiresFreshPlan,true);assert.equal(p.requiresAuthorization,true);
  assert.deepEqual(p.graph.nodes.map(n=>n.type),['START','ACTION','VERIFY','ACTION','VERIFY','STOP']);
  assert.deepEqual(p.budget.resources,kind==='blueprint'?[{id:'阵型2图纸',num:1},{id:'阵型3图纸',num:1}]:input.donations.map(row=>({id:row.itemId,num:2})));
  assert.equal(state.writes.length,0);assert.equal((await app.call('/api/workflows/simulate',{body:{graph:p.graph}})).data.requestsSent,0);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:p.graph}})).status,200);
  const stopIndex=outcome==='success'?2:Number(outcome.at(-1));let runId;
  for(let i=0;i<stopIndex;i++){
   const paused=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status,plan=paused.plan;runId=paused.runId;
   assert.equal(plan.module,module);assert.equal(plan.actions.length,1);assert.deepEqual(plan.actions[0].target,p.steps[i].target);assert.deepEqual(plan.resourceBudget,p.steps[i].costs);assert.equal(state.writes.length,i);
   assert.notEqual((await app.call('/api/operations/authorize',{id:'B',body:{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true}})).status,200);
   const permit=await app.approve(plan);assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
   const stopped=outcome!=='success'&&i===stopIndex-1,expected=stopped?outcome.startsWith('unknown')?'UNKNOWN':'REJECTED':'SUCCESS';
   const record=app.history.list('A')[0];assert.equal(record.finalStatus,expected);assert.equal(record.workflowId,runId);assert.equal(record.workflowNodeId,(kind==='blueprint'?'grow-':'fort-')+i);
   assert.equal(record.actions[0].verification.status,expected==='SUCCESS'?'CONFIRMED':'UNCONFIRMED');
   assert.equal(state.writes.length,i+1);assert.equal(record.runBudget.reserved.resources.length,i+1);
   if(expected!=='REJECTED'){const lastWrite=app.requests.findLastIndex(row=>row.name===(kind==='blueprint'?'UnlockFormationPresetRequest':'DonateFortRequest'));const after=app.requests.slice(lastWrite+1);assert.ok(after.some(row=>row.name==='AllItemRequest'));assert.ok(after.some(row=>row.name===(kind==='blueprint'?'MyFormationPresetRequest':'CityFortInfoRequest')));}
   assert.notEqual((await app.call('/api/operations/execute',{body:permit.data})).status,200);
   await app.call('/api/workflows/resume',{body:{}});
  }
  const terminal=(await app.call('/api/workflows')).data.status;assert.equal(terminal.status,outcome==='success'?'COMPLETED':outcome.startsWith('unknown')?'UNKNOWN':'FAILED');
  const reads=app.requests.length,bytes=fs.readFileSync(app.history.storagePath,'utf8');await app.call('/api/workflows/resume',{body:{}});assert.equal(app.requests.length,reads);assert.equal(fs.readFileSync(app.history.storagePath,'utf8'),bytes);
  const confirmed=outcome==='success'?2:stopIndex-1;
  if(kind==='blueprint'){assert.deepEqual(state.ids,Array.from({length:confirmed},(_,i)=>i+2));assert.equal(state.stock.get('阵型2图纸'),confirmed?0:1);assert.equal(state.stock.get('阵型3图纸'),confirmed===2?0:1);assert.equal(state.formation.petUid,'9007199254740995');}
  else {assert.equal(state.used,499+2*confirmed);assert.equal(state.stock.get('功勋'),confirmed===0?10:confirmed===1?5010:7010);for(const [i,donation]of input.donations.entries())assert.equal(state.stock.get(donation.itemId),i<confirmed?18:20);}
  assert.equal(state.stock.get('技能书'),9);assert.equal(createExecutionHistory({file:app.history.storagePath}).unresolved('A'),outcome.startsWith('unknown'));
  assert.equal((await app.call('/api/workflows/history?workflowRunId='+runId,{id:'B'})).status,404);assert.deepEqual(app.history.list('B'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

for(const count of [1,23])test('owned material batch HTTP blueprint '+count+' targets exhausts exactly the initial corresponding blueprints',async()=>{
 const {app,state,input,route}=await ownedBatchHttpFixture('blueprint',{count});
 try {
  const prepared=await app.call(route,{body:input});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const p=prepared.data;
  assert.equal(p.graph.runPolicy.maxActions,count);assert.equal(p.budget.resources.length,count);assert.deepEqual(p.budget.uids,[]);
  assert.equal((await app.call('/api/workflows/start',{body:{graph:p.graph}})).status,200);
  let runId;
  for(let i=0;i<count;i++){
   const waiting=(await waitForWorkflow(app,'AWAITING_AUTHORIZATION')).status;runId=waiting.runId;assert.equal(state.writes.length,i);
   assert.deepEqual(waiting.plan.actions[0].target,{presetId:i+2});assert.deepEqual(waiting.plan.resourceBudget,[{id:'阵型'+(i+2)+'图纸',num:1}]);
   const permit=await app.approve(waiting.plan);assert.equal(permit.status,200);
   assert.equal((await app.call('/api/operations/execute',{body:permit.data})).status,200);await app.operations.settle('A');
   const row=app.history.list('A')[0];assert.equal(row.finalStatus,'SUCCESS');assert.equal(row.workflowId,runId);assert.equal(row.runBudget.reserved.resources.length,i+1);
   assert.equal(state.stock.get('阵型'+(i+2)+'图纸'),0);await app.call('/api/workflows/resume',{body:{}});
  }
  assert.equal((await waitForWorkflow(app,'COMPLETED')).status.runId,runId);assert.deepEqual(state.ids,Array.from({length:count},(_,i)=>i+2));assert.equal(app.history.list('A').length,count);assert.equal(state.stock.get('技能书'),9);assert.equal(state.formation.petUid,'9007199254740995');assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});
for(const kind of ['blueprint','fort'])for(const dimension of ['account','player','world','connection','generation'])test('owned material batch HTTP '+kind+' prepare rejects '+dimension+' drift before returning an executable graph',async()=>{
 const {app,session,state,input,route}=await ownedBatchHttpFixture(kind);
 try {
  let changed=false;state.onRead=()=>{
   if(changed)return;changed=true;
   if(dimension==='account')session.client.factContext.accountId='B';
   if(dimension==='player')session.player.playerId='3';
   if(dimension==='world')session.player.worldId='3000018';
   if(dimension==='connection')session.connectionId='replacement';
   if(dimension==='generation')session.generation++;
  };
  const result=await app.call(route,{body:input});assert.equal(result.status,['connection','generation'].includes(dimension)?409:400,JSON.stringify(result.data));assert.equal(result.data.code,'CANCELLED');assert.equal(result.data.graph,undefined);assert.equal(state.writes.length,0);assert.deepEqual(app.history.list('A'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});


for(const entry of ['tasks','loop'])test('Tasks recruit HTTP '+entry+' prepares explicit hero and antique modes without session or permit',async()=>{
 const app=await harness({includeFreeRecruit:true});try{await app.call();for(const recruit of ['hero','antique'])for(const count of [0,1,10,50]){
  const parameters={...(recruit==='antique'?{recruit}:{}),...(count?{payment:'ticket',...(count>1?{count}:{})}:{})},budget={resources:count?[{id:recruit==='antique'?'藏品券':'抽卡券',num:count}]:[],quotas:[],uids:[]},payload={entry,tasks:[{kind:'free-recruit',parameters}],budget},p=await app.call('/api/workflows/prepare',{body:payload});assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(p.data.accountId,'A');assert.deepEqual(p.data.blocked,[]);assert.deepEqual(p.data.graph.budget,budget);const action=p.data.graph.nodes.find(n=>n.type==='ACTION');assert.equal(action.module,'free-recruit');assert.deepEqual(action.parameters,parameters);assert.deepEqual(action.selection,{unique:true});assert.equal(p.data.permit,undefined);
 }assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);}finally{await app.close();}
});
test('Tasks recruit HTTP rejects invalid source and parameters and retains Origin CSRF account guards',async()=>{
 const app=await harness({includeFreeRecruit:true});try{await app.call();const payload={entry:'tasks',tasks:[{kind:'free-recruit',parameters:{recruit:'antique',payment:'ticket',count:10}}],budget:{resources:[],quotas:[],uids:[]}};
 for(const row of [{kind:'free-recruit'},{kind:'free-recruit',parameters:{recruit:'unknown'}},{kind:'free-recruit',parameters:{payment:'ticket',count:20}},{kind:'free-recruit',parameters:{request:'AntiqueRecruitRequest'}}])assert.equal((await app.call('/api/workflows/prepare',{body:{...payload,tasks:[row]}})).status,400);
 assert.equal((await app.call('/api/workflows/prepare',{body:payload,authorized:false})).status,403);assert.equal((await app.call('/api/workflows/prepare',{body:payload,headers:{'x-cw-csrf':'invalid'}})).status,403);assert.equal((await app.call('/api/workflows/prepare',{body:payload,id:'missing'})).status,404);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.requests.length,0);
 }finally{await app.close();}
});


async function cancellationHttp(count=2){const app=await harness({includeAllianceFort:true,testProtocol:heroWireProtocol,configOverride:{tables:{}}});try{const session=app.ready('A');session.player={playerId:'1',worldId:'1000001',guildId:'10',level:20};session.connectionId='cancel-http-A';session.client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};const now=Math.floor(Date.now()/1000),state={own:Array.from({length:count},(_,i)=>({reqId:(9007199254780000n+BigInt(i)).toString(),reqItemId:'小麦',endTime:now+1000})),onRead:null};session.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,nowMs:now*1000,earliestMs:now*1000,latestMs:now*1000})};session.client.request=async(n,b,r)=>{heroWire(n,b);app.requests.push({id:'A',name:n,body:structuredClone(b)});await state.onRead?.(n);const value={GuildInfoRequest:{guild:{guildId:'10'}},GuildMemberRequest:{titleList:[]},GuildAidListRequest:{askItems:[]},MyGuildAidRequest:{aids:state.own},GuildOrderRequest:{order:{requirements:[],nextRefreshTime:now+2000}},GuildCityInfoRequest:{cities:[]},CounterInfoRequest:{counters:[]},AllItemRequest:{items:[{itemId:'小麦',num:7}]},AllResourceRequest:{list:[{res:3,amount:9}]}}[n];assert.ok(value,'unexpected cancel read '+n);return heroWire(r,value);};session.client.sendWatch=async()=>{throw Error('prepare cannot write');};await app.call('/api/gameplay?module=alliance');assert.equal((await app.call('/api/gameplay/config',{body:{module:'alliance',config:{enabled:true,cancel:true,maxActionsPerPlan:24}}})).status,200);const read=await app.call('/api/gameplay/survey',{body:{module:'alliance',parameters:{}}});assert.equal(read.status,200);assert.equal(read.data.view.cancelPreparation.length,count);return {app,session,state,input:{targets:read.data.view.cancelPreparation.map(r=>r.parameters),maxDurationMs:60000},route:'/api/gameplay/alliance/aid/cancel/prepare'};}catch(error){await app.close();throw error;}}
for(const count of [1,24])test('aid cancellation HTTP '+count+' prepares original exact request graph without writing',async()=>{const f=await cancellationHttp(count);try{const p=await f.app.call(f.route,{body:f.input});assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(p.data.accountId,'A');assert.deepEqual(p.data.targets,f.input.targets);assert.equal(p.data.steps.length,count);assert.equal(p.data.graph.nodes.filter(n=>n.type==='ACTION').length,count);assert.equal(p.data.graph.nodes.filter(n=>n.type==='VERIFY').length,count);assert.deepEqual(p.data.budget,{resources:[],quotas:[],uids:f.input.targets.map(r=>({type:'alliance-aid',id:'10:'+r.reqIds[0]}))});assert.deepEqual((await f.app.call('/api/operations/history')).data.runs,[]);assert.ok(f.app.requests.every(r=>r.name!=='CancelMyGuildAidRequest'));assert.deepEqual(f.app.counts(),{clients:0,collections:0});}finally{await f.app.close();}});
test('aid cancellation HTTP retains original Origin CSRF writer and exact-source rejection',async()=>{const f=await cancellationHttp();try{for(const args of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}}])assert.equal((await f.app.call(f.route,{body:f.input,...args})).status,403);assert.equal((await f.app.call(f.route,{body:f.input,id:'missing'})).status,404);for(const targets of [[],[f.input.targets[0],f.input.targets[0]],[{...f.input.targets[0],request:'CancelMyGuildAidRequest'}]])assert.equal((await f.app.call(f.route,{body:{...f.input,targets}})).status,400);const release=f.app.operations.claimWorkflow(f.session,'cancel-writer');try{assert.equal((await f.app.call(f.route,{body:f.input})).status,409);}finally{release();}f.state.own[1].reqItemId='玉米';assert.equal((await f.app.call(f.route,{body:f.input})).status,400);assert.ok(f.app.requests.every(r=>r.name!=='CancelMyGuildAidRequest'));assert.deepEqual((await f.app.call('/api/operations/history')).data.runs,[]);}finally{await f.app.close();}});

async function fleetPreparationHttp(action='repair',count=2){
 const app=await harness({includeCargo:true,testProtocol:heroWireProtocol,configOverride:{tables:{}}});try{
 const session=app.ready('A');session.player={playerId:'1',worldId:'1000001',guildId:'3003',level:30};session.connectionId='fleet-http-A';session.client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};const state={onRead:null,fleets:Array.from({length:count},(_,i)=>({buildingId:'http-fleet-'+i,state:action==='stop-repair'?4:1,durability:action==='move'?1900:1500,maxDura:2000,cityId:1,targetCityId:0,treasureLootUid:0,repairing:action==='stop-repair'?{startTs:100,endTs:200,endDura:2000}:null,autoFight:{isOn:action==='stop-auto-fight',todayTimes:0}}))};
 session.client.request=async(n,b,r,_timeout,options)=>{assert.equal(options?.mutate,undefined);heroWire(n,b);app.requests.push({id:'A',name:n,body:structuredClone(b)});await state.onRead?.(n);const value={MyFleetsRequest:{fleets:state.fleets},AllItemRequest:{items:[{itemId:'汽油',num:count*1100}]},AllResourceRequest:{list:[]},CargoShipsRequest:{ship:[]},WorldInfoRequest:{cities:[{id:2,state:1,guildIdx:3}]},GuildInfoRequest:{guild:{guildId:'3003'}},FleetRepairParamRequest:{unitRepairCost:2.2,unitRepairTime:0.15}}[n];assert.ok(value,n);return heroWire(r,value);};session.client.sendWatch=async()=>{throw Error('prepare cannot dispatch');};
 await app.call('/api/gameplay?module=fleet');const saved=await app.call('/api/gameplay/config',{body:{module:'fleet',config:{enabled:true,repair:true,stopRepair:true,autoFight:true,move:true,repairBelowDurabilityRatio:1,maximumRepairPetrolPerPlan:100000}}});assert.equal(saved.status,200,JSON.stringify(saved.data));const surveyed=await app.call('/api/gameplay/survey',{body:{module:'fleet',parameters:{}}});assert.equal(surveyed.status,200,JSON.stringify(surveyed.data));const rows=action==='repair'?surveyed.data.view.repairPreparation:surveyed.data.view.maintenancePreparation.filter(r=>r.actionType===(action==='stop-repair'?'fleetStopRepair':'fleetStopAutoFight'));
 return {app,session,state,route:'/api/gameplay/fleet/'+(action==='move'?'move':'repair')+'/prepare',input:action==='move'?{buildingIds:state.fleets.map(f=>f.buildingId),cityId:2,screenCenter:{x:-10,y:0},maxDurationMs:60000}:{action,repairs:rows.map(({buildingId,expectedRepairHash})=>({buildingId,expectedRepairHash})),maxDurationMs:60000}};
 }catch(error){await app.close();throw error;}
}
for(const action of ['repair','stop-repair','stop-auto-fight','move'])for(const count of [1,24])test('prepared Fleet HTTP uses original '+action+' source for '+count+' targets',async()=>{
 const f=await fleetPreparationHttp(action,count);try{const p=await f.app.call(f.route,{body:f.input});assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(p.data.accountId,'A');assert.equal(p.data.steps.length,count);assert.equal(p.data.graph.nodes.filter(n=>n.type==='ACTION').length,count);assert.equal(p.data.graph.nodes.filter(n=>n.type==='VERIFY').length,count);assert.deepEqual(p.data.budget,{resources:action==='repair'?[{id:'汽油',num:1100*count}]:[],quotas:[],uids:[]});assert.deepEqual((await f.app.call('/api/operations/history')).data.runs,[]);assert.ok(f.app.requests.every(r=>!['RepairFleetRequest','StopRepairingRequest','SetFleetAutoFightRequest','MoveFleetsToCityRequest'].includes(r.name)));assert.deepEqual(f.app.counts(),{clients:0,collections:0});if(action==='move')assert.deepEqual(f.app.requests.filter(r=>r.name==='WorldInfoRequest').at(-1).body,{screenCenter:{x:-10,y:0}});}finally{await f.app.close();}
});
for(const action of ['repair','stop-repair','stop-auto-fight','move'])test('prepared Fleet HTTP retains Origin CSRF writer and source drift '+action,async()=>{
 const f=await fleetPreparationHttp(action);try{for(const args of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}}])assert.equal((await f.app.call(f.route,{body:f.input,...args})).status,403);assert.equal((await f.app.call(f.route,{body:f.input,id:'missing'})).status,404);assert.equal((await f.app.call(f.route,{body:{...f.input,request:'forged'}})).status,400);const release=f.app.operations.claimWorkflow(f.session,'fleet-http-owner');try{assert.equal((await f.app.call(f.route,{body:f.input})).status,409);}finally{release();}f.state.onRead=n=>{if(n==='AllItemRequest')f.session.player.worldId='1000002';};const drift=await f.app.call(f.route,{body:f.input});assert.equal(drift.status,409,JSON.stringify(drift.data));assert.equal(drift.data.code,'CANCELLED');assert.deepEqual((await f.app.call('/api/operations/history')).data.runs,[]);}finally{await f.app.close();}
});

async function treasurePreparationHttp(count=2,per=2){
 const config={tables:{WorldParamCfg:{data:[{paramName:'进攻宝藏消耗汽油',paramValue:500}]},GameplayOpenCfg:{data:[{gameplay:'世界宝藏',openDays:[3,1,1]}]}}},app=await harness({includeTreasure:true,testProtocol:heroWireProtocol,configOverride:config});try{
 const session=app.ready('A');session.player={playerId:'1',worldId:2001000000,level:30};session.connectionId='treasure-http-A';session.client.factContext={accountId:'A',generation:session.generation,connectionId:session.connectionId};session.client.gameClock={read:()=>({status:'TRUSTED',reliable:true,nowMs:300000000,earliestMs:300000000,latestMs:300000000})};const state={onRead:null,fuel:count*per*500,fleets:Array.from({length:count*per},(_,i)=>({buildingId:'http-treasure-fleet-'+i,state:1,durability:1900,maxDura:2000,treasureLootUid:0,repairing:null,autoFight:{isOn:false,todayTimes:0}})),treasures:Array.from({length:count},(_,i)=>({uid:7+i,color:5,ownerGuildIdx:0,ownerFleetNum:0,progress:0,gridIdx:i+1})),writes:[]};
 session.client.request=async(n,b,r,_timeout,options)=>{assert.equal(options?.mutate,undefined);heroWire(n,b);app.requests.push({id:'A',name:n,body:structuredClone(b)});await state.onRead?.(n,b);const value={TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:state.treasures.map(t=>({...t,reward:{asset:[]}}))},MyFleetsRequest:{fleets:state.fleets},SeasonRankInfoRequest:{startTime:100000,endTime:1000000},AllItemRequest:{items:[{itemId:'汽油',num:state.fuel}]},AllResourceRequest:{list:[]},TreasureLootRankRequest:{items:[]},TreasureLootDefenceRequest:{fleets:[]}}[n];assert.ok(value,n);return heroWire(r,value);};session.client.sendWatch=async(n,b,options)=>{heroWire(n,b);assert.equal(n,'TreasureLootSendFleetsRequest');options.beforeDispatch();state.writes.push(structuredClone(b));for(const id of b.fleetBuildingIds){const f=state.fleets.find(f=>f.buildingId===id);f.state=2;f.treasureLootUid=b.uid;}state.fuel-=b.fleetBuildingIds.length*500;return {status:'UNKNOWN'};};
 await app.call('/api/gameplay?module=treasure');const saved=await app.call('/api/gameplay/config',{body:{module:'treasure',config:{enabled:true,dispatch:true,maxFleets:per}}});assert.equal(saved.status,200,JSON.stringify(saved.data));const surveyed=await app.call('/api/gameplay/survey',{body:{module:'treasure',parameters:{}}});assert.equal(surveyed.status,200,JSON.stringify(surveyed.data));assert.equal(surveyed.data.view.treasures.length,count,JSON.stringify({view:surveyed.data.view,requests:app.requests}));const source=surveyed.data.view.preparation,input={targets:state.treasures.map((target,i)=>{const ids=state.fleets.slice(i*per,(i+1)*per).map(f=>f.buildingId);return {uid:target.uid,fleetBuildingIds:ids,expectedDispatch:{targetHash:source.targets.find(t=>t.uid===target.uid).targetHash,fleetHashes:ids.map(id=>source.fleets.find(f=>f.buildingId===id).fleetHash)}};}),maxDurationMs:60000};return {app,session,state,config,input,route:'/api/gameplay/treasure/prepare'};
 }catch(error){await app.close();throw error;}
}
for(const count of [1,10])for(const per of [1,10])test('prepared treasure HTTP prepares and executes original '+count+' targets '+per+' fleets',async()=>{
 const f=await treasurePreparationHttp(count,per);try{const offset=f.app.requests.length,p=await f.app.call(f.route,{body:f.input});assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(p.data.steps.length,count);assert.deepEqual(p.data.targets,f.input.targets);assert.deepEqual(p.data.budget,{resources:[{id:'汽油',num:count*per*500}],quotas:[],uids:f.input.targets.flatMap(t=>[{type:'treasure',id:String(t.uid)},...t.fleetBuildingIds.map(id=>({type:'fleet',id}))])});assert.equal(f.state.writes.length,0);assert.deepEqual((await f.app.call('/api/operations/history')).data.runs,[]);const calls=f.app.requests.slice(offset);assert.equal(calls.length,6+2*count);for(const name of ['TreasureLootRankRequest','TreasureLootDefenceRequest'])assert.deepEqual(calls.filter(r=>r.name===name).map(r=>r.body),f.input.targets.map(t=>({uid:t.uid})));
 let run=await f.app.call('/api/workflows/start',{body:{graph:p.data.graph}});assert.equal(run.status,200,JSON.stringify(run.data));
 for(let i=0;i<count;i++){const current=(await f.app.call('/api/workflows')).data.status;assert.equal(current.status,'AWAITING_AUTHORIZATION',JSON.stringify(current));assert.equal(f.state.writes.length,i);const plan=current.plan,permit=await f.app.call('/api/operations/authorize',{body:{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(r=>r.actionId),resourceBudget:plan.resourceBudget,confirm:true}});assert.equal(permit.status,200,JSON.stringify(permit.data));assert.equal((await f.app.call('/api/operations/execute',{body:permit.data})).status,200);await f.app.operations.settle('A');assert.equal(f.app.history.list('A')[0].finalStatus,'SUCCESS');run=await f.app.call('/api/workflows/resume',{body:{}});assert.equal(run.status,200,JSON.stringify(run.data));}
 assert.equal((await f.app.call('/api/workflows')).data.status.status,'COMPLETED');assert.equal(f.state.fuel,0);assert.deepEqual(f.state.writes,f.input.targets.map(({uid,fleetBuildingIds})=>({uid,fleetBuildingIds})));assert.deepEqual(f.app.counts(),{clients:0,collections:0});
 }finally{await f.app.close();}
});
test('prepared treasure HTTP preserves Origin CSRF writer malformed targets and source isolation',async()=>{
 const f=await treasurePreparationHttp();try{for(const args of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}}])assert.equal((await f.app.call(f.route,{body:f.input,...args})).status,403);assert.equal((await f.app.call(f.route,{body:f.input,id:'missing'})).status,404);for(const targets of [[],[f.input.targets[0],f.input.targets[0]],[{...f.input.targets[0],request:'forged'}]])assert.equal((await f.app.call(f.route,{body:{...f.input,targets}})).status,400);const release=f.app.operations.claimWorkflow(f.session,'treasure-http-owner');try{assert.equal((await f.app.call(f.route,{body:f.input})).status,409);}finally{release();}f.state.onRead=(n)=>{if(n==='AllItemRequest')f.session.player.worldId=2001000001;};const drift=await f.app.call(f.route,{body:f.input});assert.equal(drift.status,409,JSON.stringify(drift.data));assert.equal(drift.data.code,'CANCELLED');assert.equal(f.state.writes.length,0);assert.deepEqual((await f.app.call('/api/operations/history')).data.runs,[]);}finally{await f.app.close();}
});
