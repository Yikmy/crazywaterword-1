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
async function harness({unconfirmed=false,includeStage=false,includeAlliance=false,includeHeroes=false,includeFragments=false,includeMaterialPacks=false,includeDailyReward=false,includeDailyActivity=false,includeDailyGift=false,includeWeeklyGift=false,includeUniqueGift=false,includeChipGift=false,includeChipTask=false,includeWorkflowTasks=false,includeFarm=false,includeExpedition=false,badTechReply=false}={}){includeWeeklyGift ||= includeUniqueGift||includeChipGift||includeChipTask;saveStore({version:1,activeId:'A',accounts:[account('A'),account('B')]});let clients=0,collections=0;const requests=[];const modules={formation:formationModule,...(includeWeeklyGift||includeDailyGift||includeDailyReward||includeDailyActivity||includeWorkflowTasks?{'task-rewards':GAMEPLAY_MODULES['task-rewards']}:{}),...(includeMaterialPacks?{'material-packs':GAMEPLAY_MODULES['material-packs']}:{}),...(includeFarm?{farm:GAMEPLAY_MODULES.farm}:{}),...(includeHeroes?{heroes:heroModule}:{}),...(includeAlliance?{alliance:allianceModule}:{}),...(includeStage?{stage:{id:'stage',defaultConfig:{enabled:false}}}:{})};const hc=structuredClone(heroCfg);if(includeFragments){hc.tables.HeroCfg.data.forEach(row=>{row.type='英雄';row.universalItemId='蓝卡万能碎片';});hc.tables.ItemCfg={data:[{id:'蓝卡万能碎片',type:'英雄万能碎片',quality:'BLUE'},...['tank','ranger'].map(id=>({id:id+'碎片',type:'英雄碎片',quality:'BLUE'}))]};}const history=createExecutionHistory({file:path.join(root,'execution-'+Math.random()+'.json')});const moduleSettings=createModuleSettings({file:path.join(root,'settings-'+Math.random()+'.json'),modules});
 const app=createConsole({port:0,protocol,tracePath:path.join(root,'trace-'+Math.random()+'.log'),clientFactory(){clients++;throw Error('Real client forbidden');},collect(){collections++;throw Error('Full collector forbidden');},operationOptions:{history,...(includeStage?{}:{modules}),moduleSettings,getConfig:()=>includeChipTask?chipTaskCfg:includeChipGift?chipGiftCfg:includeUniqueGift?uniqueGiftCfg:includeWeeklyGift?weeklyGiftCfg:includeDailyGift?dailyGiftCfg:includeDailyActivity?dailyActivityCfg:includeDailyReward?dailyRewardCfg:includeMaterialPacks?materialPackCfg:includeExpedition?{tables:{...cfg.tables,ExpeditionRaidCfg:{data:[{raidId:1001,unlockLv:30,heroCount:10}]}}}:includeFarm?farmCfg:includeHeroes?hc:includeAlliance?allianceCfg:cfg,loadRules:()=>({config:{version:1,enabled:true,rules:[]}})}});await app.listen();const origin='http://127.0.0.1:'+app.server.address().port;let csrf;
 const call=(route='/api/gameplay?module=formation',{id='A',body,method=body===undefined?'GET':'POST',headers={},authorized=true}={})=>new Promise((resolve,reject)=>{const url=new URL(route,origin);if(id!==null)url.searchParams.set('account',id);const req=http.request(url,{method,headers:{connection:'close','content-type':'application/json',...(authorized?{origin,...(csrf?{'x-cw-csrf':csrf}:{})}:{}),...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>{const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:res.statusCode,data,text});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 const ready=id=>{const weekState={activityTime:[{type:includeChipTask||includeChipGift?6:includeUniqueGift?7:4,period:includeChipTask?3001:includeChipGift?1001:includeUniqueGift?20001:12,startTime:900,endTime:2000}]},weeklyState=includeChipTask?{round:1,score:2000,gotTaskId:[],gifts:[{giftId:1000,paidTimes:0}]}:includeChipGift?{round:1,score:100,gotTaskId:[1],gifts:[{giftId:1000,paidTimes:0},{giftId:1001,paidTimes:1}]}:includeUniqueGift?{gift:[{giftId:1001,gotTimes:1,charge:30}],floor:2,selectId:1001,gotFloor:1,buyTimes:0,prizePos:[{prizeId:2,pos:1}],gotFree:false}:{gift:[{giftId:1000,gotTimes:0,charge:0}],gotInfo:{times:0,gotStage:0}};const giftState={heroId:'马斯克',resetTime:1,boughtPack:[],drawnPack:[]};const dailyActivityStock=new Map();const dailyState={dailyTask:[{id:1001,progress:1,targetProgress:1,rewardClaimed:false}],dailyActivity:40,weeklyActivity:85,dailyRewardClaimed:[],weeklyRewardClaimed:[],dailyResetTime:2000},dailyResources=[{res:1,amount:100},{res:3,amount:200},...(includeWeeklyGift||includeDailyGift?[{res:4,amount:50}]:[])];let current=initial(),techLevel=1,techPoints=10000;const expedition={raidId:1001,stageFormId:0,endTime:2000,passedStage:0,hero:[{heroId:'tank',hp:'9007199254740993'}],buff:[],gotFinal:false,isFirst:true,formation:initial(),stageBuff:[],stagePower:'9007199254740995',passedRaid:[]};
 const materialStock=new Map([['原料自选包',5],['工事材料自选包',4],['无关道具',7]]);
 const farmState={water:{building:[{buildingId:'1农田',level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},farm:{productId:'小麦',plantTime:1700000000,ripeTime:1700001800}}],autoFarming:false},stock:new Map([['小麦',5],['小麦种子',3]])};
 const heroState={heroes:['tank','ranger'].map(heroId=>({heroId,level:1,star:1,power:'9007199254740993',skillLevels:[1,1],attributes:[{attr:1,value:1.5}]})),stock:new Map([['英雄经验',30],['tank碎片',10],['ranger碎片',10],['技能书',20],['万能碎片',20]]),onWrite:null};
 const mutateHero=(name,body)=>{const row=heroState.heroes.find(value=>value.heroId===body.heroId);if(!unconfirmed){if(name==='HeroFragExchangeRequest'){heroState.stock.set('蓝卡万能碎片',heroState.stock.get('蓝卡万能碎片')-body.num);heroState.stock.set(body.fragItemId,(heroState.stock.get(body.fragItemId)??0)+body.num);}if(name==='HeroLevelUpRequest'){row.level++;heroState.stock.set('英雄经验',heroState.stock.get('英雄经验')-5);}if(name==='HeroStarUpRequest'){row.star++;heroState.stock.set(row.heroId+'碎片',heroState.stock.get(row.heroId+'碎片')-5);}if(name==='HeroSkillLevelUpRequest'){row.skillLevels[body.skillIdx-1]++;heroState.stock.set('技能书',heroState.stock.get('技能书')-4);}}heroState.onWrite?.(name,body);return row;};const client=new EventEmitter();Object.assign(client,{id,connected:true,pending:[],watchers:[],uncertainWrites:new Set(),stop(){this.connected=false;},markUnverifiedWrite(name){this.uncertainWrites.add(name);},confirmWatchedWrite(name){this.uncertainWrites.delete(name);},async request(name,body,response,timeout,options){requests.push({id,name,body:structuredClone(body),response,options});if(includeWeeklyGift||includeDailyGift||includeDailyReward||includeDailyActivity){heroWire(name,body);if(name==='DrawDailyTaskRewardRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);if(!unconfirmed){dailyState.dailyTask[0].rewardClaimed=true;dailyState.dailyActivity+=5;dailyState.weeklyActivity+=5;dailyResources[0].amount+=100;}return heroWire(response,{activity:5});}if(name==='WeekChipGotTaskRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);const rewards=chipTaskCfg.tables.WeekChipPointsCfg.data.find(r=>r.rwdId===body.taskId).reward,gotTaskId=[...weeklyState.gotTaskId,body.taskId];if(!unconfirmed){weeklyState.gotTaskId=gotTaskId;for(const [id,num]of rewards)if(id==='GOLD')dailyResources.find(r=>r.res===3).amount+=num;else dailyActivityStock.set(id,(dailyActivityStock.get(id)??0)+num);}return heroWire(response,{round:body.round,gotTaskId,reward:{asset:rewards.map(([id,num])=>({type:0,id,num}))}});}if(name==='WeekChipInfoRequest')return heroWire(response,weeklyState);if(name==='WeekUniqueLotteryRequest')return heroWire(response,weeklyState);if(name==='WeekInfoRequest')return heroWire(response,weekState);if(name==='WeekLotteryInfoRequest')return heroWire(response,weeklyState);if(name==='DailyGiftPackRequest')return heroWire(response,giftState);if(name==='DailyTaskInfoRequest')return heroWire(response,dailyState);if(name==='AllItemRequest')return heroWire(response,{items:[...dailyActivityStock].map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return heroWire(response,{list:dailyResources});}if(includeMaterialPacks){heroWire(name,body);if(name==='AllItemRequest')return heroWire(response,{items:[...materialStock].map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return heroWire(response,{list:[]});}if(includeExpedition){heroWire(name,body);if(name==='ExpeditionSaveFormationRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);if(!unconfirmed)expedition.formation=structuredClone(body.formation);return heroWire(response,{formation:body.formation});}if(name==='ExpeditionInfoRequest')return heroWire(response,expedition);if(name==='AllItemRequest')return heroWire(response,{items:[]});if(name==='AllResourceRequest')return heroWire(response,{list:[]});}if(includeFarm){if(name==='FarmHarvestRequest'){options.beforeDispatch?.();assert.equal(options.mutate,true);assert.deepEqual(body,{buildingId:['1农田']});if(!unconfirmed){farmState.water.building[0].farm={productId:'',plantTime:0,ripeTime:0};farmState.stock.set('小麦',15);}return heroWire(response,{reward:[{reward:{type:0,id:'小麦',num:10},critical:2}]});}const raw=name==='OnWaterRequest'?farmState.water:name==='AllItemRequest'?{items:[...farmState.stock].map(([itemId,num])=>({itemId,num}))}:name==='AllResourceRequest'?{list:[]}:name==='MyResFieldsRequest'?{info:{fields:[]}}:name==='MyFleetsRequest'?{fleets:[]}:null;if(raw)return heroWire(response,raw);}if(includeHeroes){heroWire(name,body);if(name==='AllHeroRequest')return heroWire(response,{heroes:heroState.heroes});if(name==='AllItemRequest')return heroWire(response,{items:[...heroState.stock].map(([itemId,num])=>({itemId,num}))});if(name==='AllResourceRequest')return heroWire(response,{list:[]});if(name==='HeroStarUpRequest'){const row=mutateHero(name,body);return heroWire(response,{nextStar:unconfirmed?{...row,star:row.star+1}:row});}}if(includeAlliance){const state={GuildInfoRequest:{guild:{guildId:'10',welfarePack:[],gotWelfareTime:0}},GuildMemberRequest:{titleList:[{guildTitle:1,members:[{playerId:'2',nickname:'same'}]}]},GuildAidListRequest:{askItems:[]},MyGuildAidRequest:{aids:[]},GuildOrderRequest:{order:{requirements:[],nextRefreshTime:2000000000}},GuildCityInfoRequest:{cities:[]},CounterInfoRequest:{counters:[]},AllItemRequest:{items:[{itemId:'公会科技点',num:techPoints}]},AllResourceRequest:{list:[]},GuildTechInfoRequest:{tech:[{techId:10101,level:techLevel}]},SeasonTaskStageRequest:{stage:1}};if(name==='UpgradeGuildTechRequest'){if(!unconfirmed){techLevel++;techPoints-=2400;}return {tech:{techId:badTechReply?10102:10101,level:techLevel+(unconfirmed?1:0)}};}if(Object.hasOwn(state,name))return structuredClone(state[name]);}if(name==='GetFormationRequest')return {formation:structuredClone(current)};if(name==='MyFormationPresetRequest')return {ids:[2]};if(name==='AllHeroRequest')return {heroes:[{heroId:'tank'}]};if(name==='SaveFormationRequest'){if(!unconfirmed)current=structuredClone(body.formation);return {formation:structuredClone(body.formation)};}if(name==='ChallengeStageRequest')return {initialData:{mainlineStage:body.stage,battleType:1},stats:{isLeftWin:true}};throw Error('Unexpected synthetic request '+name);},async sendWatch(name,body,options){if(includeWeeklyGift){assert.equal(name,includeChipGift?'WeekChipGotFreeRequest':includeUniqueGift?'GotUniqueLotteryFreeRequest':'WeekLotteryFreePackRequest');heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){if(includeChipGift){weeklyState.gifts[0].paidTimes=1;dailyActivityStock.set('白芯片宝箱',10);}else{if(includeUniqueGift)weeklyState.gotFree=true;else weeklyState.gift[0].gotTimes=1;dailyActivityStock.set(includeUniqueGift?'周翻牌币':'周转盘币',1);dailyResources.find(r=>r.res===4).amount+=10;}}return {status:'UNKNOWN'};}if(includeDailyGift){assert.equal(name,'GotFreeDailyPackRequest');heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){giftState.drawnPack.push('赠礼');dailyResources.find(r=>r.res===4).amount+=10;}return {status:'UNKNOWN'};}if(includeDailyActivity){heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){dailyState.dailyRewardClaimed.push(body.index[0]);dailyActivityStock.set('加速器',120);}return {status:'UNKNOWN'};}if(includeMaterialPacks){heroWire(name,body);options.beforeDispatch?.();requests.push({id,name,body:structuredClone(body),response:null});if(!unconfirmed){materialStock.set(body.itemId,materialStock.get(body.itemId)-body.num);materialStock.set(body.selectItemId,(materialStock.get(body.selectItemId)??0)+body.num);}return {status:'UNKNOWN'};}if(!includeHeroes)throw Error('Unexpected watch '+name);heroWire(name,body);requests.push({id,name,body:structuredClone(body),response:null});mutateHero(name,body);return {status:'UNKNOWN'};}});const session={id,client,player:includeWeeklyGift||includeDailyGift||includeDailyActivity?{playerId:id==='A'?'1':'2',worldId:1000001}:includeDailyReward?{playerId:id==='A'?'1':'2',worldId:17}:includeMaterialPacks?{playerId:id==='A'?'1':'2',worldId:1000001,level:20}:includeExpedition?{playerId:id==='A'?'1':'2',worldId:1,level:40,mainlineStage:41}:includeFarm?{playerId:id==='A'?'1':'2',worldId:1,level:20}:includeHeroes?{playerId:id==='A'?'1':'2',worldId:1,level:2}:includeAlliance?{playerId:'1',worldId:1000001,level:20}:{playerId:'synthetic-player-'+id,mainlineStage:41},state:'READY',generation:1,abort:new AbortController(),busy:null,loop:{running:false,stop:{}},log:[],snapshot:{ok:{},failed:{}},snapshotStale:false,...(includeFarm?{farmState}:{}),...(includeHeroes?{heroState}:{})};if(includeWeeklyGift||includeDailyGift||includeDailyReward||includeDailyActivity){session.weekState=weekState;session.weeklyState=weeklyState;session.giftState=giftState;session.giftResources=dailyResources;session.dailyState=dailyState;session.dailyActivityStock=dailyActivityStock;session.connectionId='daily-http-'+id;client.factContext={accountId:id,generation:1,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,source:'PingResponse.serverTimestamp',accountId:id,generation:session.generation,earliestMs:1000000,nowMs:1000000,latestMs:1000000})};}if(includeMaterialPacks){session.materialStock=materialStock;session.connectionId='packs-http-'+id;client.factContext={accountId:id,generation:1,connectionId:session.connectionId};}if(includeFragments){heroState.stock.set('蓝卡万能碎片',20);session.connectionId='fragment-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};}if(includeExpedition){session.connectionId='expedition-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,accountId:id,generation:session.generation,source:'PingResponse.serverTimestamp',earliestMs:1000000,nowMs:1000000,latestMs:1000000})};}if(includeFarm){session.connectionId='farm-http-'+id;client.factContext={accountId:id,generation:session.generation,connectionId:session.connectionId};client.gameClock={read:()=>({status:'TRUSTED',reliable:true,accountId:id,generation:session.generation,source:'PingResponse.serverTimestamp',earliestMs:1700001801000,nowMs:1700001801100,latestMs:1700001801200})};}app.sessions.set(id,session);return session;};
 const module=includeWeeklyGift||includeDailyGift||includeDailyActivity?'task-rewards':includeDailyReward?'task-rewards':includeMaterialPacks?'material-packs':includeFarm?'farm':includeHeroes?'heroes':includeAlliance?'alliance':'formation',parameters=includeChipTask?{kind:'weekly-chip-task',round:1,taskId:1}:includeChipGift?{kind:'weekly-chip-gift',packId:'1000'}:includeUniqueGift?{kind:'weekly-unique-lottery-gift',packId:'1000'}:includeWeeklyGift?{kind:'weekly-lottery-gift',packId:'1000'}:includeDailyGift?{kind:'daily-gift',packId:'赠礼'}:includeDailyActivity?{kind:'daily-activity',tierId:1}:includeDailyReward?{kind:'daily',taskId:1001}:includeMaterialPacks?{packId:'原料自选包',itemId:'木材',num:2}:includeFarm?{buildingId:'1农田',action:'harvest'}:includeHeroes?{heroId:'tank',action:'level'}:includeAlliance?{techId:10101,targetLevel:2}:includeExpedition?{mode:'expedition',raidId:1001,presetId:2}:{presetId:2};const enable=async()=>{await call('/api/gameplay?module='+module);return call('/api/gameplay/config',{body:{module,config:includeWeeklyGift||includeDailyGift||includeDailyActivity||includeDailyReward||includeMaterialPacks||includeHeroes||includeFarm?{enabled:true}:includeAlliance?{enabled:true,tech:true}:{enabled:true,mainlineEnabled:true}}});};
 const survey=(input=parameters)=>call('/api/gameplay/survey',{body:{module,parameters:input}});
 const plan=async(input=parameters)=>{const read=await survey(input);assert.equal(read.status,200);const candidate=read.data.view.candidates[0];assert.equal(candidate.executable,true);return call('/api/operations/plan',{body:{module,mode:'Manual',selections:[candidate.actionId],parameters:input}});};
 const approve=p=>call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true}});
 return {...app,call,ready,enable,survey,plan,approve,requests,counts:()=>({clients,collections})};}
async function waitForWorkflow(app,expected){let data;for(let i=0;i<30;i++){data=(await app.call('/api/workflows')).data;if(data.status.status===expected)return data;if(['FAILED','UNKNOWN','CANCELLED'].includes(data.status.status))throw Error('Unexpected workflow '+JSON.stringify(data.status));}throw Error('Workflow did not reach '+expected+': '+JSON.stringify(data.status));}
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
for(const kind of ['VIP_LEVEL_CHANGED','PLAYER_LEVEL_CHANGED'])for(const approval of [true,false])test('trusted business event HTTP retains CSRF, exact scope and the original single action permit '+kind+' '+approval,async()=>{
 const app=await harness({includeWorkflowTasks:true});let source;try{
 const session=app.ready('A');await app.enable();const surveyed=await app.survey(),g=graph('level-event-http-'+kind+'-'+approval,[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:surveyed.data.view.candidates[0].actionId},{id:'v',type:'VERIFY',module:'formation'},{id:'e',type:'STOP'}],[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]);g.budget={resources:[],quotas:[],uids:[]};g.runPolicy={maxDurationMs:10000,maxActions:1,modules:['formation'],eventTrigger:{kind,level:3}};const before=app.requests.length;
 assert.equal((await app.call('/api/workflows/save',{body:{graph:g}})).status,200);const sim=await app.call('/api/workflows/simulate',{body:{graph:g}});assert.equal(sim.status,200);assert.equal(sim.data.requestsSent,0);assert.equal(app.requests.length,before);const denied=await app.call('/api/workflows/start',{body:{graph:g}});assert.equal(denied.data.status.running,false);assert.equal(session.workflowOwner??null,null);assert.equal(app.requests.length,before);source=await attachVipHttpSource(session);assert.equal((await app.call('/api/workflows/start',{body:{graph:g}})).status,200);const status=(await waitForWorkflow(app,'WAITING')).status,payload={offer:status.authorizationOffer,batchId:null,planHash:null,confirm:true};assert.equal(status.plan,null);assert.equal(status.eventTrigger.baseline.cursor,0);assert.deepEqual(status.authorizationOffer.eventCursor,status.eventTrigger.baseline);assert.equal(app.requests.length,before);
 if(approval){for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}},{headers:{origin:'https://example.invalid'}}])assert.equal((await app.call('/api/workflows/authorize-run',{body:payload,...extra})).status,403);for(const mutate of [p=>delete p.offer.eventCursor,p=>p.offer.eventCursor.cursor++,p=>p.offer.graph.runPolicy.eventTrigger.level=4,p=>p.offer.executionContext.worldId=2,p=>p.offer.accountId='B',p=>p.batchId='forged']){const bad=structuredClone(payload);mutate(bad);assert.equal((await app.call('/api/workflows/authorize-run',{body:bad})).status,400);}assert.equal((await app.call('/api/workflows/authorize-run',{body:payload})).status,200);assert.equal(app.requests.length,before);}
 source.client.emit('message',{name:'SCVipUpdate',seq:1,body:{vipLevel:3}});assert.equal((await app.call('/api/workflows')).data.status.status,'WAITING');source.socket.receive(kind==='PLAYER_LEVEL_CHANGED'?'SCPlayerExpUpdate':'SCVipUpdate',kind==='PLAYER_LEVEL_CHANGED'?{level:3,exp:'1'}:{vipLevel:3},1);let final;for(let i=0;i<100;i++){final=await app.call('/api/workflows');if(final.data.status.status===(approval?'COMPLETED':'AWAITING_AUTHORIZATION'))break;await new Promise(r=>setTimeout(r,10));}assert.equal(final.data.status.status,approval?'COMPLETED':'AWAITING_AUTHORIZATION',JSON.stringify(final.data.status));assert.equal(app.requests.filter(r=>r.name==='SaveFormationRequest').length,approval?1:0);const count=app.requests.length,detail=await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId));assert.equal(detail.status,200);assert.deepEqual(detail.data.runPolicy.eventTrigger,g.runPolicy.eventTrigger);assert.equal(detail.data.eventTrigger.state,'FIRED');assert.equal(detail.data.eventTrigger.event.cursor,1);assert.equal(detail.data.resumable,false);assert.equal(detail.data.readOnly,true);assert.equal(app.requests.length,count);if(approval)assert.equal(detail.data.nodes[0].batches[0].runAuthorizationLink.status,'MATCHED');assert.equal((await app.call('/api/workflows/history?workflowRunId='+encodeURIComponent(status.runId),{id:'B'})).status,404);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(source.client.listenerCount('message'),0);
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
  const response=await app.call('/api/dailies');assert.equal(response.status,200);assert.equal(response.data.accountId,'A');const a=response.data.checklist.festival;assert.equal(a.status,'OBSERVED');assert.equal(a.rows[0].activityId,'9007199254740993');assert.deepEqual(a.rows[0].checkInRecord.checkInId,[1]);assert.equal(a.rows[0].checkInRecord.checkRuby,'9007199254740993');assert.equal(a.rows[0].eligible,null);assert.equal(a.rows[0].executable,false);assert.equal(a.complete,false);assert.match(response.data.text,/当前领取资格未知/);
  for(const [object,key,value]of[[session,'generation',2],[session,'connectionId','other'],[session.player,'playerId','2'],[session.player,'worldId',18]]){const old=object[key];object[key]=value;const changed=(await app.call('/api/dailies')).data.checklist.festival;assert.equal(changed.status,'UNKNOWN');assert.deepEqual(changed.rows,[]);object[key]=old;}
  app.ready('B');const other=await app.call('/api/dailies',{id:'B'});assert.equal(other.data.checklist.festival.status,'UNKNOWN');assert.deepEqual(other.data.checklist.festival.rows,[]);
  assert.equal(app.requests.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal((await app.call('/api/dailies/run',{body:{confirm:true}})).data.code,'READ_ONLY_ROUTE');
 }finally{await app.close();}
});