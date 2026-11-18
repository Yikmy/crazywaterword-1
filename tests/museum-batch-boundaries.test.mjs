import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProtocol } from '../src/proto.mjs';
import { surveyMuseum, museumView, planMuseum, verifyMuseum, prepareMuseumGrowthWorkflow, validateMuseumGrowthPreparation } from '../src/museum.mjs';
import { validateWorkflow } from '../src/workflow.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';

const protocol=loadProtocol(),now=1800000000;
const moduleConfig={enabled:true,exploration:true,collection:true};
const wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
async function fixture(count){
 const stages=Array.from({length:count},(_,i)=>({stageId:i+1,progress:0,expedition:{startTime:0,endTime:0,heroIds:[],cost:{asset:[{id:'小麦',num:2}]},conditionId:100,factor:1}}));
 const heroes=Array.from({length:count*2},(_,i)=>'owned-'+(i+1));
 const answers={MuseumInfoRequest:{popularity:0,revenueLastSettleTime:0,uncollectedRevenue:0,topPopularity:count*100,claimedAchievements:[],exhibitions:[{exhibitionId:1,level:1,keywordLevels:[1,1,1],cases:[]}],exploreStages:stages},AllHeroRequest:{heroes:heroes.map(heroId=>({heroId,level:1,star:0,power:'1',skillLevels:[],equips:[],attributes:[]}))},AllAntiqueRequest:{antiques:[]},AllItemRequest:{items:[{itemId:'小麦',num:100},{itemId:'非目标道具',num:7}]},AllResourceRequest:{list:[{res:3,amount:100}]}};
 const client={connected:true,reads:[],gameClock:{read:()=>({status:'TRUSTED',reliable:true,nowMs:now*1000,earliestMs:now*1000,latestMs:now*1000})},async request(name,body,response){assert.deepEqual(body,{});wire(name,body);this.reads.push(name);assert.ok(Object.hasOwn(answers,name),name);return wire(response,answers[name]);}};
 const facts=await surveyMuseum(client,protocol,{player:{id:'1',level:30},parameters:{}});
 assert.deepEqual(facts.notes,[]);assert.equal(facts.stockReliable,true);assert.equal(facts.stagesReliable,true);assert.equal(facts.heroesReliable,true);
 const config={tables:{MuseumExpeditionTeamCfg:{data:[{teamCount:count,playerLevel:28}]},MuseumExpeditionStageCfg:{data:stages.map(row=>({stageId:row.stageId,areaLevelReq:[]}))},MuseumExpeditionConditionCfg:{data:[{conditionId:100,heroCount:2}]},MuseumExploreTimeFactorCfg:{data:[{factor:1,playerLevel:1}]},MuseumAchievementCfg:{data:Array.from({length:count},(_,i)=>({score:(i+1)*100,rewards:[['小麦',i+1]]}))}}};
 const view=museumView(facts,{config,moduleConfig,parameters:{}});
 const explore=view.explorationSelection.stages.map((row,i)=>({stageId:row.stageId,heroIds:heroes.slice(i*2,i*2+2),factor:1,expectedExploreHash:row.preparationHash}));
 const claims=config.tables.MuseumAchievementCfg.data.map(row=>({popularityThreshold:row.score}));
 assert.equal(client.reads.length,5);
 return {facts,config,view,targets:{startExplore:explore,claimAchievement:claims}};
}

for(const actionType of ['startExplore','claimAchievement'])for(const count of [1,24])test('museum original codec '+actionType+' '+count+' targets replan and independently verify every sequential result',async()=>{
 const {facts,config,targets}=await fixture(count),input={actionType,targets:targets[actionType],maxDurationMs:60000};
 const prepared=prepareMuseumGrowthWorkflow(facts,{config,moduleConfig,...input});
 validateWorkflow(prepared.graph,{modules:GAMEPLAY_MODULES});
 assert.equal(prepared.steps.length,count);assert.equal(prepared.graph.nodes.filter(row=>row.type==='ACTION').length,count);assert.equal(prepared.graph.nodes.filter(row=>row.type==='VERIFY').length,count);
 assert.deepEqual(prepared.budget.resources,actionType==='startExplore'?[{id:'小麦',num:count*2}]:[]);
 assert.equal(prepared.budget.uids.length,count*(actionType==='startExplore'?3:1));
 assert.equal(new Set(prepared.budget.uids.map(row=>row.type+':'+row.id)).size,prepared.budget.uids.length);
 const originalBudget=structuredClone(prepared.budget);let current=structuredClone(facts);
 for(const [i,step] of prepared.steps.entries()){
  const plan=planMuseum(current,{config,moduleConfig,parameters:step.parameters,selections:[step.selection.actionId]});
  assert.equal(plan.actions.length,1);const op=plan.actions[0],after=structuredClone(current);
  assert.deepEqual(op.target,step.target);assert.deepEqual(op.budgetClaims,step.budgetClaims);
  assert.equal(verifyMuseum(op,current,after),false,'unchanged observations cannot confirm an action');
  wire(op.action.request,op.action.body);
  if(actionType==='startExplore'){
   Object.assign(after.stages.find(row=>row.stageId===op.target.stageId).expedition,{startTime:now,endTime:now+3600,heroIds:[...op.target.heroIds],factor:1});
   after.stock.set('小麦',after.stock.get('小麦')-2);
  }else{
   after.claimedAchievements.push(op.target.popularityThreshold);after.stock.set('小麦',after.stock.get('小麦')+i+1);
  }
  assert.equal(verifyMuseum(op,current,after),true,'original independent verification must confirm the exact result');
  const contaminated=structuredClone(after);contaminated.stock.set('非目标道具',8);assert.equal(verifyMuseum(op,current,contaminated),false);
  current=after;
 }
 assert.deepEqual(prepared.budget,originalBudget,'confirmed rewards cannot grow the original parent limits');
 assert.equal(current.stock.get('小麦'),actionType==='startExplore'?100-count*2:100+count*(count+1)/2);
 assert.equal(current.stock.get('非目标道具'),7);
 if(actionType==='startExplore'){
  assert.equal(museumView(current,{config,moduleConfig,parameters:{}}).occupiedTeams,count);
  assert.deepEqual(current.claimedAchievements,[]);
 }else{
  assert.equal(current.claimedAchievements.length,count);assert.equal(current.stages.every(row=>row.expedition.endTime===0),true);
 }
});

for(const actionType of ['startExplore','claimAchievement'])test('museum '+actionType+' rejects zero or 25 targets, sparse arrays and duplicate targets before preparation',async()=>{
 const {targets}=await fixture(24),base={actionType,targets:targets[actionType],maxDurationMs:60000};
 for(const invalid of [[],[...base.targets,structuredClone(base.targets[0])],[base.targets[0],base.targets[0]]])assert.throws(()=>validateMuseumGrowthPreparation({...base,targets:invalid}),{code:'INVALID_INPUT'});
 const sparse=[...base.targets];delete sparse[12];assert.throws(()=>validateMuseumGrowthPreparation({...base,targets:sparse}),{code:'INVALID_INPUT'});
});

test('museum 24-team preparation rejects cumulative shortage, reserve breaches and a changed final source',async()=>{
 const {facts,config,targets}=await fixture(24),input={actionType:'startExplore',targets:targets.startExplore,maxDurationMs:60000};
 const prepare=(next=facts,settings=moduleConfig)=>prepareMuseumGrowthWorkflow(next,{config,moduleConfig:settings,...input});
 const short=structuredClone(facts);short.stock.set('小麦',47);assert.throws(()=>prepare(short));
 assert.throws(()=>prepare(facts,{...moduleConfig,stockItemIds:['小麦'],stockReserveQuantities:[53]}));
 const changed=structuredClone(facts);changed.stages[23].progress++;
 assert.throws(()=>prepare(changed),/候选已失效/);
 const lowerCapacity=structuredClone(config);lowerCapacity.tables.MuseumExpeditionTeamCfg.data[0].teamCount=23;
 assert.throws(()=>prepareMuseumGrowthWorkflow(facts,{config:lowerCapacity,moduleConfig,...input}),/队伍空位不足/);
});

test('museum 24-claim preparation rejects an already claimed final threshold and cumulative reward overflow',async()=>{
 const {facts,config,targets}=await fixture(24),input={actionType:'claimAchievement',targets:targets.claimAchievement,maxDurationMs:60000};
 const claimed=structuredClone(facts);claimed.claimedAchievements.push(2400);
 assert.throws(()=>prepareMuseumGrowthWorkflow(claimed,{config,moduleConfig,...input}));
 const overflow=structuredClone(facts);overflow.stock.set('小麦',Number.MAX_SAFE_INTEGER-299);
 assert.throws(()=>prepareMuseumGrowthWorkflow(overflow,{config,moduleConfig,...input}),/累计奖励/);
});
