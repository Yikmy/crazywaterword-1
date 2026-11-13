import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateFarmSurvey, surveyFarmOperations, viewFarmOperations, planFarmOperations, verifyFarmOperation, farmDependencyVersions, farmModule, validateFarmParameters, validateFarmConfig, FARM_EVIDENCE } from '../src/farm-operations.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { assertPaymentAllowed } from '../src/actions.mjs';
const enabled={enabled:true},context={accountId:'synthetic-a',generation:3},player={playerId:'9007199254740993',worldId:12,level:20};
const empty=(buildingId='1农田')=>({buildingId,level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},farm:{productId:'',plantTime:0,ripeTime:0}});
const growing=(buildingId='1农田',productId='小麦')=>({...empty(buildingId),farm:{productId,plantTime:1700000000,ripeTime:1700001800}});
function config(){return {tables:{BuildingCfg:{data:[{buildingType:'农田'},{buildingType:'食品厂'},{buildingType:'高级农田'}]},FarmlandPlantCfg:{data:[
 {id:'小麦',time:1800,produceNum:5,material:['小麦种子',1]},{id:'玉米',time:1800,produceNum:5,material:['玉米种子',2]}]},
 BuildingUpgradeCfg:{data:[]},WorkerOrderCfg:{data:[]},WorkerSpecOrderCfg:{data:[]}}};}
const protocol=Object.fromEntries(['FarmHarvestRequest','FarmHarvestResponse','FarmPlantRequest','OnWaterRequest','OnWaterResponse','AllItemRequest','AllItemResponse','AllResourceRequest','AllResourceResponse','MyResFieldsRequest','MyResFieldsResponse','MyFleetsRequest','MyFleetsResponse'].map(k=>[k,{}]));
function core({buildings=[empty()],autoFarming=false,items=[{itemId:'小麦种子',num:3},{itemId:'玉米种子',num:3},{itemId:'小麦',num:10}],resources=[{res:3,amount:50}]}={}){
 return {player,rawOnWater:{building:buildings,autoFarming},rawAllItem:{items},rawAllResource:{list:resources},stock:new Map([['do-not-trust-defaulted-stock',999]]),stockReliable:true};
}
const facts=(raw=core(),options={})=>decorateFarmSurvey(raw,{config:config(),protocol,context,sourceAt:Date.now(),...options});
const parameters={buildingId:'1农田',action:'plant',productId:'小麦'};
const plan=(f,extra={})=>planFarmOperations(f,{parameters,moduleConfig:enabled,...extra});
const operation=f=>plan(f).actions[0];
function planted(before,{productId='小麦',spend=1}={}){
 const raw={player,rawOnWater:structuredClone(before.rawOnWater),rawAllItem:structuredClone(before.rawAllItem),rawAllResource:structuredClone(before.rawAllResource)};
 raw.rawOnWater.building[0].farm=growing('1农田',productId).farm;raw.rawAllItem.items.find(r=>r.itemId==='小麦种子').num-=spend;return facts(raw);
}
// Synthetic account/facts only. No real GameClient, login, runtime or transport.
test('farm projection reuses exact raw sources and strict item/resource quantities',()=>{
 const raw=core(),before=structuredClone(raw),f=facts(raw);assert.deepEqual(raw,before);assert.equal(f.stock.get('小麦种子'),3);assert.equal(f.stock.has('do-not-trust-defaulted-stock'),false);
 assert.equal(f.plots[0].state,'EMPTY');assert.equal(f.autoFarming,false);assert.equal(f.identityContext.playerId,'9007199254740993');assert.equal(f.sourceFacts.water.provenance.source,'OnWaterResponse');assert.equal(f.sourceFacts.inventory.provenance.source,'AllItemResponse+AllResourceResponse');assert.equal(f.evidence.maturityTimeUnit,'SERVER_SECONDS_STRICTLY_BEFORE');
});
test('original core survey supplies exactly five reads and retains raw farm fields',async()=>{
 const raw=core(),calls=[],client={connected:true,factContext:context,request:async name=>{calls.push(name);return name==='OnWaterRequest'?raw.rawOnWater:name==='AllItemRequest'?raw.rawAllItem:name==='AllResourceRequest'?raw.rawAllResource:name==='MyResFieldsRequest'?{info:{fields:[]}}:{fleets:[]};}};
 const f=await surveyFarmOperations(client,protocol,{config:config(),player,parameters});assert.deepEqual(calls.sort(),['AllItemRequest','AllResourceRequest','MyFleetsRequest','MyResFieldsRequest','OnWaterRequest']);assert.equal(f.plots[0].state,'EMPTY');assert.deepEqual(f.rawOnWater,raw.rawOnWater);assert.equal(f.stock.get('小麦种子'),3);assert.equal(f.gameTime.reliable,false);assert.equal(Object.hasOwn(farmModule,'execute'),false);
});
test('pre-cancellation sends no reads and generation switch during survey cancels',async()=>{
 const ctrl=new AbortController();ctrl.abort();let reads=0;await assert.rejects(()=>surveyFarmOperations({connected:true,factContext:context,request:async()=>{reads++;return {};}},protocol,{config:config(),player,signal:ctrl.signal}),e=>e.code==='CANCELLED');assert.equal(reads,0);
 const raw=core(),client={connected:true,factContext:{...context},request:async name=>{if(name==='OnWaterRequest'){client.factContext={...context,generation:4};return raw.rawOnWater;}return name==='AllItemRequest'?raw.rawAllItem:name==='AllResourceRequest'?raw.rawAllResource:{};}};await assert.rejects(()=>surveyFarmOperations(client,protocol,{config:config(),player}),e=>e.code==='CANCELLED');
});
test('missing raw sources never fall back to defaulted world summaries',()=>{
 const f=facts({player,stock:new Map([['小麦种子',5]]),stockReliable:true,buildings:[empty()],autoFarming:false,now:Math.floor(Date.now()/1000)});assert.equal(f.stockReliable,false);assert.equal(f.farmReliability.buildings,false);assert.deepEqual(plan(f).actions,[]);
});
test('missing farm null partial or inherited fields never become empty',()=>{
 for(const mutate of [b=>{delete b.farm;},b=>{b.farm=null;},b=>{b.farm={};},b=>{b.farm=Object.create({productId:'',plantTime:0,ripeTime:0});},b=>{delete b.farm.plantTime;},b=>{b.farm={productId:'',plantTime:1,ripeTime:1};}]){const b=empty();mutate(b);const f=facts(core({buildings:[b]}));assert.equal(f.plots[0].state,'UNKNOWN');assert.equal(plan(f).actions.length,0);}
});
test('farm identity uses longest configured type and explicit completed building fields',()=>{
 assert.equal(facts(core({buildings:[empty('1高级农田')]})).plots.length,0);for(const mutate of [b=>{b.level=0;},b=>{b.buildFinishTime=1700000100;},b=>{delete b.buildStartTime;},b=>{b.level='1';}]){const b=empty();mutate(b);assert.equal(plan(facts(core({buildings:[b]}))).actions.length,0);}
});
test('unknown timestamps never become zero or known mature state',()=>{
 for(const farm of [{productId:'小麦',plantTime:1700000000},{productId:'小麦',plantTime:NaN,ripeTime:1700001800},{productId:'小麦',plantTime:1700001800,ripeTime:1700000000},{productId:'小麦',plantTime:0,ripeTime:1700000000}])assert.equal(facts(core({buildings:[{...empty(),farm}]})).plots[0].state,'UNKNOWN');const f=facts(core({buildings:[growing()]}));assert.equal(f.plots[0].state,'GROWING_OR_RIPE_UNVERIFIED');assert.equal(f.plots[0].ripeTime,1700001800);
});
test('harvest maturity stays blocked despite local now or edited evidence',()=>{
 const f=facts(core({buildings:[growing()]}));f.now=2147483647;f.evidence={maturityTimeUnit:'SECONDS'};const row=viewFarmOperations(f,{parameters:{buildingId:'1农田',action:'harvest'},moduleConfig:enabled}).candidates[0];assert.equal(row.blockedReason,'FARM_TRUSTED_CLOCK_OR_CONNECTION_UNKNOWN');assert.equal(Object.hasOwn(row,'action'),false);assert.deepEqual(planFarmOperations(f,{parameters:{buildingId:'1农田',action:'harvest'},moduleConfig:enabled}).actions,[]);assert.equal(verifyFarmOperation({...row,action:{request:'FarmHarvestRequest',response:'FarmHarvestResponse',body:{buildingId:['1农田']}}},f,f,{reward:[]}).confirmed,false);
});
test('plant constructs one exact repeated argument with seed costs and budget claims',()=>{
 const f=facts(),before=structuredClone(f),op=operation(f);assert.deepEqual(f,before);assert.equal(op.actionType,'PLANT');assert.deepEqual(op.costs,[{id:'小麦种子',num:1}]);assert.deepEqual(op.budgetClaims,{resources:op.costs,quotas:[],uids:[]});assert.deepEqual(op.action,{request:'FarmPlantRequest',response:null,body:{args:[{buildingId:'1农田',productId:'小麦'}]}});assert.equal(op.expectedState.requiresCompleteCropState,true);assert.equal(op.executable,true);
});
test('default disabled module and arbitrary request payment autoFarming parameters are rejected',()=>{
 assert.equal(planFarmOperations(facts(),{parameters}).actions.length,0);for(const input of [{...parameters,request:'x'},{...parameters,body:{}},{...parameters,costs:[]},{...parameters,allowPaid:true},{...parameters,autoFarming:false},{buildingId:'1农田',action:'harvest',productId:'小麦'},{buildingId:'1农田',action:'buy'},{buildingId:' ',action:'plant',productId:'小麦'}])assert.throws(()=>validateFarmParameters(input));for(const cfg of [{enabled:1},{enabled:true,autoFarming:false},{enabled:true,allowPaid:true}])assert.throws(()=>validateFarmConfig(cfg));
});
test('server autoFarming true omitted or malformed blocks without changing the setting',()=>{
 for(const value of [true,null,undefined,0,'false']){const raw=core();if(value===undefined)delete raw.rawOnWater.autoFarming;else raw.rawOnWater.autoFarming=value;const before=structuredClone(raw);assert.equal(plan(facts(raw)).actions.length,0);assert.deepEqual(raw,before);}
});
test('seed insufficiency malformed duplicate premium and missing costs are blocked',()=>{
 assert.equal(plan(facts(core({items:[{itemId:'小麦种子',num:0}]}))).actions.length,0);for(const material of [null,[],['小麦种子'],[['小麦种子',1]],['小麦种子',0],['小麦种子',9007199254740992],['RUBY',1],['钻石',1],['4',1]]){const cfg=config();cfg.tables.FarmlandPlantCfg.data[0].material=material;assert.equal(plan(facts(core(),{config:cfg})).actions.length,0);}const cfg=config();cfg.tables.FarmlandPlantCfg.data.push({...cfg.tables.FarmlandPlantCfg.data[0]});assert.equal(plan(facts(core(),{config:cfg})).actions.length,0);
});
test('configured duration and yield never become authoritative finish time or rewards',()=>{
 const cfg=config();delete cfg.tables.FarmlandPlantCfg.data[0].produceNum;delete cfg.tables.FarmlandPlantCfg.data[0].time;const f=facts(core(),{config:cfg}),op=operation(f);assert.ok(op);assert.equal(f.catalog.crops[0].configuredYield,null);assert.equal(f.catalog.crops[0].configuredTime,null);assert.equal(Object.hasOwn(op.expectedState,'ripeTime'),false);assert.equal(Object.hasOwn(op.expectedState,'rewards'),false);
});
test('strict inventory rejects missing aliases duplicates scalar conflicts and unsafe quantities',()=>{
 for(const items of [null,{},[{itemId:'小麦种子'}],[{itemId:'小麦种子',num:9007199254740992}],[{itemId:'小麦种子',num:2},{itemId:'小麦种子',num:2}],[{id:'小麦种子',count:4}]]){const raw=core();raw.rawAllItem=Array.isArray(items)?{items}:items;const f=facts(raw);assert.equal(f.stockReliable,false);assert.equal(plan(f).actions.length,0);}for(const resources of [[{res:3,amount:1},{res:3,amount:2}],[{res:3}],[{res:3,amount:-1}]])assert.equal(facts(core({resources})).stockReliable,false);assert.equal(facts(core({items:[{itemId:'GOLD',num:3}],resources:[{res:3,amount:3}]})).stockReliable,false);
});
test('stale wrong-account generation or mutated source facts block planning',()=>{
 for(const mutate of [f=>{f.sourceFacts.water.provenance.sourceAt=Date.now()-30001;},f=>{f.sourceFacts.water.provenance.accountId='b';},f=>{f.sourceFacts.inventory.provenance.generation=9;},f=>{f.sourceFacts.water.provenance.source='Snapshot';},f=>{f.sourceFacts.water.provenance.reliability='UNKNOWN';},f=>{f.identityContext.playerId=null;},f=>{f.identityContext.worldId=null;},f=>{f.rawOnWater.autoFarming=true;},f=>{f.plots[0].raw.farm.productId='fake';},f=>{f.stock.set('小麦种子',99);}]){const f=facts();mutate(f);assert.equal(plan(f).actions.length,0);}
});
test('duplicate sparse and missing raw building lists cannot establish complete authority',()=>{
 const b=empty();for(const buildings of [[b,b],new Array(2),[{level:1}],null]){const f=facts(core({buildings}));assert.equal(f.farmReliability.buildings,false);assert.equal(plan(f).actions.length,0);}
});
test('plots reserve one shared seed Ledger and never spend anticipated harvest yield',()=>{
 const f=facts(core({buildings:[empty(),empty('2农田')],items:[{itemId:'小麦种子',num:1},{itemId:'小麦',num:0}]})),view=viewFarmOperations(f,{moduleConfig:enabled}),selected=view.candidates.filter(r=>r.actionType==='PLANT'&&r.target.productId==='小麦').map(r=>r.actionId),ledger=new ResourceLedger(f.stock),result=planFarmOperations(f,{moduleConfig:enabled,selections:selected,ledger});assert.equal(result.actions.length,1);assert.deepEqual([...ledger.reserved],[['小麦种子',1]]);assert.equal(result.notes.includes('SHARED_SEED_BUDGET_INSUFFICIENT'),true);assert.equal(ledger.available('小麦'),0);assert.equal(planFarmOperations(f,{moduleConfig:enabled,selections:[selected[1]],ledger}).actions.length,0);
});
test('same plot cannot combine harvest plant or two crops in one batch',()=>{
 const f=facts(),rows=viewFarmOperations(f,{moduleConfig:enabled}).candidates;assert.throws(()=>planFarmOperations(f,{moduleConfig:enabled,selections:rows.filter(r=>r.actionType==='PLANT').map(r=>r.actionId)}));assert.throws(()=>planFarmOperations(f,{moduleConfig:enabled,selections:[rows[0].actionId,rows[1].actionId]}));assert.throws(()=>planFarmOperations(f,{moduleConfig:enabled,selections:['foreign']}));assert.throws(()=>planFarmOperations(f,{moduleConfig:enabled,selections:[rows[0].actionId,rows[0].actionId]}));assert.equal(planFarmOperations(f,{moduleConfig:enabled}).actions.length,0);
});
test('successful verification requires exact target crop plus exact net seed debit',()=>{
 const before=facts(),op=operation(before),after=planted(before),result=verifyFarmOperation(op,before,after,null);assert.equal(result.confirmed,true);assert.deepEqual(result.afterState,after.plots[0].raw);assert.equal(Object.hasOwn(result,'responseEvidence'),false);assert.equal(verifyFarmOperation(op,before,before,{status:'SUCCESS'}).confirmed,false);assert.equal(verifyFarmOperation(op,before,planted(before,{spend:0}),{}).confirmed,false);
});
test('wrong crop missing state bad timing and wrong seed debit remain unconfirmed',()=>{
 const before=facts(),op=operation(before);for(const after of [planted(before,{productId:'玉米'}),planted(before,{spend:0}),planted(before,{spend:2})])assert.equal(verifyFarmOperation(op,before,after,null).confirmed,false);for(const mutate of [r=>{delete r.rawOnWater.building[0].farm.ripeTime;},r=>{r.rawOnWater.building[0].farm.plantTime=0;}]){const raw=core({buildings:[growing()],items:[{itemId:'小麦种子',num:2},{itemId:'玉米种子',num:3},{itemId:'小麦',num:10}]});mutate(raw);assert.equal(verifyFarmOperation(op,before,facts(raw),null).confirmed,false);}
});
test('unrelated plot resource item or target building changes cannot prove planting',()=>{
 const before=facts(core({buildings:[empty(),empty('2农田')]})),op=operation(before);for(const mutate of [r=>{r.rawOnWater.building[1].farm=growing('2农田').farm;},r=>{r.rawAllResource.list[0].amount++;},r=>{r.rawAllItem.items.find(a=>a.itemId==='玉米种子').num--;},r=>{r.rawOnWater.building[0].level=2;}]){const raw=core({buildings:[growing(),empty('2农田')],items:[{itemId:'小麦种子',num:2},{itemId:'玉米种子',num:3},{itemId:'小麦',num:10}]});mutate(raw);assert.equal(verifyFarmOperation(op,before,facts(raw),null).confirmed,false);}
});
test('stale operation body claims source or identity cannot borrow successful state',()=>{
 const before=facts(),op=operation(before),after=planted(before);for(const mutate of [o=>{o.action.body.args[0].buildingId='2农田';},o=>{o.action.body.args.push({buildingId:'2农田',productId:'小麦'});},o=>{o.costs=[];},o=>{o.budgetClaims.resources=[];},o=>{o.identity='fake';},o=>{o.costSource='fake';},o=>{o.expectedState.productId='玉米';},o=>{o.beforeState.level=2;}]){const changed=structuredClone(op);mutate(changed);assert.equal(verifyFarmOperation(changed,before,after,null).confirmed,false);}
});
test('account world player generation autoFarming or config switches invalidate verification',()=>{
 const before=facts(),op=operation(before);for(const mutate of [f=>{f.identityContext.generation=4;},f=>{f.identityContext.worldId='13';},f=>{f.identityContext.playerId='1';},f=>{f.rawOnWater.autoFarming=true;f.autoFarming=true;f.sourceFacts.water.value.autoFarming=true;},f=>{f.catalog.crops[0].costs[0].num=2;}]){const after=planted(before);mutate(after);assert.equal(verifyFarmOperation(op,before,after,null).confirmed,false);}
});
test('real codec proves single-plot harvest typed rewards and plant args without invented response',()=>{
 const p=loadProtocol(),round=(type,v)=>toSnapshotJson(p[type].decode(p[type].encode(v).finish()));assert.deepEqual(round('FarmPlantRequest',{args:[{buildingId:'1农田',productId:'小麦'}]}),{args:[{buildingId:'1农田',productId:'小麦'}]});assert.deepEqual(round('FarmHarvestRequest',{buildingId:['1农田']}),{buildingId:['1农田']});assert.deepEqual(round('FarmHarvestResponse',{reward:[{reward:{type:0,id:'小麦',num:5},critical:1}]}),{reward:[{reward:{type:0,id:'小麦',num:5},critical:1}]});assert.equal(p.FarmPlantResponse,undefined);const raw=round('FarmBuildingInfo',{});assert.deepEqual(raw,{});assert.equal(facts(core({buildings:[{...empty(),farm:raw}]})).plots[0].reliable,false);
});
test('shared D6 allows exact seed-only plant and single-plot harvest; adapter never bypasses executor',()=>{
 const op=operation(facts());assert.doesNotThrow(()=>assertPaymentAllowed({...op.action,costs:op.costs}));assert.doesNotThrow(()=>assertPaymentAllowed({request:'FarmHarvestRequest',body:{buildingId:['1农田']},costs:[]}));assert.throws(()=>assertPaymentAllowed({request:'FarmHarvestRequest',body:{buildingId:['1农田','2农田']},costs:[]}),e=>e.code==='COST_UNKNOWN');assert.equal(Object.hasOwn(farmModule,'execute'),false);assert.equal(FARM_EVIDENCE.maturityTimeUnit,'SERVER_SECONDS_STRICTLY_BEFORE');
});
test('dependency projection binds actual farm configs and preserves input data',()=>{
 const cfg=config(),versions=farmDependencyVersions({config:cfg,moduleConfig:enabled});assert.deepEqual(Object.keys(versions).sort(),['config.BuildingCfg','config.FarmlandPlantCfg','evidence','moduleConfig']);cfg.tables.FarmlandPlantCfg.data[0].material[1]=9;assert.equal(versions['config.FarmlandPlantCfg'].data[0].material[1],1);assert.deepEqual(farmModule.capabilities,['BIZ-R16a','BIZ-R16b','BIZ-R16c']);
});
test('another confirmed plot does not stale an independent same-batch target identity',()=>{
 const before=facts(core({buildings:[empty(),empty('2农田')]}));
 const second={buildingId:'2农田',action:'plant',productId:'小麦'};
 const firstPlan=plan(before,{parameters:second}).actions[0];
 const afterFirst=planted(before),refreshed=plan(afterFirst,{parameters:second}).actions[0];
 assert.ok(refreshed);assert.deepEqual(refreshed.identity,firstPlan.identity);assert.deepEqual(refreshed.beforeState,firstPlan.beforeState);
 assert.deepEqual(refreshed.action,firstPlan.action);assert.deepEqual(refreshed.costs,firstPlan.costs);
 const changed=core({buildings:[empty(),{...empty('2农田'),level:2}]});
 assert.notEqual(plan(facts(changed),{parameters:second}).actions[0].identity,firstPlan.identity);
});
// Live harvest facts are produced only by the existing survey hook and bundled codecs.
async function harvestFixture({earliest=1700001801000,autoFarming=false,protocolOverride}={}){
 const p=protocolOverride??loadProtocol(),raw=core({buildings:[growing(),empty('2农田')],autoFarming}),c={...context,connectionId:'synthetic-harvest-connection'};
 let clock={status:'TRUSTED',reliable:true,accountId:c.accountId,generation:c.generation,source:'PingResponse.serverTimestamp',earliestMs:earliest,nowMs:earliest+100,latestMs:earliest+200};
 const client={connected:true,factContext:c,gameClock:{read:()=>clock},request:async(name,body,response)=>{const value=name==='OnWaterRequest'?raw.rawOnWater:name==='AllItemRequest'?raw.rawAllItem:name==='AllResourceRequest'?raw.rawAllResource:name==='MyResFieldsRequest'?{info:{fields:[]}}:{fleets:[]};return p[response].decode(p[response].encode(value).finish());}};
 const read=()=>surveyFarmOperations(client,p,{config:config(),player,parameters:{buildingId:'1农田',action:'harvest'}});
 const before=await read(),options={parameters:{buildingId:'1农田',action:'harvest'},moduleConfig:enabled},op=planFarmOperations(before,options).actions[0];
 const receipt=(num=10,critical=2)=>p.FarmHarvestResponse.decode(p.FarmHarvestResponse.encode({reward:[{reward:{type:0,id:'小麦',num},critical}]}).finish());
 function apply(num=10){raw.rawOnWater.building[0].farm=empty().farm;raw.rawAllItem.items.find(r=>r.itemId==='小麦').num+=num;}
 return {p,raw,client,before,op,options,read,receipt,apply,clock:()=>clock,setClock:value=>{clock=value;}};
}
test('single ripe plot plans exact typed harvest and binds crop batch UID without claiming configured income',async()=>{
 const f=await harvestFixture();assert.ok(f.op);assert.deepEqual(f.op.action,{request:'FarmHarvestRequest',response:'FarmHarvestResponse',body:{buildingId:['1农田']}});assert.deepEqual(f.op.costs,[]);assert.equal(f.op.budgetClaims.uids.length,1);assert.equal(f.op.budgetClaims.uids[0].type,'farm-harvest');assert.deepEqual(f.op.budgetClaims.resources,[]);assert.equal(f.op.expectedState.rewards,undefined);assertPaymentAllowed({...f.op.action,costs:f.op.costs});
 f.apply(10);const verified=verifyFarmOperation(f.op,f.before,await f.read(),f.receipt(10,2));assert.equal(verified.confirmed,true,verified.reason);assert.equal(verified.responseEvidence.num,10);assert.deepEqual(verified.responseEvidence.critical,[2]);
});
for(const earliest of [1700001799999,1700001800000,1700001800999])test('strict floor(server seconds) maturity excludes boundary '+earliest,async()=>{const f=await harvestFixture({earliest});assert.equal(f.op,undefined);assert.equal(viewFarmOperations(f.before,f.options).candidates[0].blockedReason,'FARM_MATURITY_NOT_PROVEN');});
test('unknown clock, foreign account/generation, broken interval and copied or edited facts never grant harvest',async()=>{
 const f=await harvestFixture();const valid=f.clock();for(const clock of [null,{...valid,status:'UNKNOWN'},{...valid,source:'Date.now'},{...valid,accountId:'foreign'},{...valid,generation:4},{...valid,earliestMs:valid.latestMs+1},{...valid,earliestMs:NaN}]){f.setClock(clock);assert.equal(planFarmOperations(f.before,f.options).actions.length,0);}f.setClock(valid);
 assert.equal(planFarmOperations(structuredClone(f.before),f.options).actions.length,0);f.before.gameTime.earliestMs=0;assert.equal(planFarmOperations(f.before,f.options).actions.length,0);
});
test('harvest needs current exact connection, role, world and explicit idle auto farming',async()=>{
 for(const mutate of [f=>{f.client.factContext.connectionId='other';},f=>{f.client.factContext.generation++;},f=>{f.client.factContext.accountId='other';},f=>{f.client.connected=false;}]){const f=await harvestFixture();mutate(f);assert.equal(planFarmOperations(f.before,f.options).actions.length,0);}
 for(const autoFarming of [true,null]){const f=await harvestFixture({autoFarming});assert.equal(f.op,undefined);}
});
test('harvest receipt critical is presentation only and exact typed quantity must equal net gain',async()=>{
 for(const gain of [0,9,20]){const f=await harvestFixture();f.apply(gain);assert.equal(verifyFarmOperation(f.op,f.before,await f.read(),f.receipt(10,2)).confirmed,false);}
 const f=await harvestFixture();f.apply();const after=await f.read();for(const mutate of [r=>delete r.reward,r=>r.reward=[],r=>delete r.reward[0].critical,r=>delete r.reward[0].reward.type,r=>r.reward[0].reward.type=1,r=>r.reward[0].reward.id='玉米',r=>r.reward[0].reward.num=0,r=>r.reward[0].critical=-1]){const r=toSnapshotJson(f.receipt());mutate(r);assert.equal(verifyFarmOperation(f.op,f.before,after,r).confirmed,false);}
});
test('harvest requires explicit cleared farm, unchanged non-target plots/building and other inventory',async()=>{
 for(const mutate of [f=>delete f.raw.rawOnWater.building[0].farm,f=>{f.raw.rawOnWater.building[0].farm=growing().farm;},f=>{f.raw.rawOnWater.building[0].level=2;},f=>{f.raw.rawOnWater.building[1].farm=growing('2农田').farm;},f=>f.raw.rawAllResource.list[0].amount++,f=>f.raw.rawAllItem.items[0].num--,f=>{f.raw.rawOnWater.autoFarming=true;}]){const f=await harvestFixture();f.apply();mutate(f);assert.equal(verifyFarmOperation(f.op,f.before,await f.read(),f.receipt()).confirmed,false);}
});
test('harvest rejects tampered wire target, batch claims, identity and expected state',async()=>{
 const f=await harvestFixture();f.apply();const after=await f.read();for(const mutate of [o=>o.action.body.buildingId.push('2农田'),o=>o.action.body.buildingId[0]='2农田',o=>o.budgetClaims.uids=[],o=>o.identity='fake',o=>o.beforeState.farm.ripeTime--,o=>o.expectedState.maturityTimeUnit='LOCAL',o=>o.costs=[{id:'小麦种子',num:1}]]){const op=structuredClone(f.op);mutate(op);assert.equal(verifyFarmOperation(op,f.before,after,f.receipt()).confirmed,false);}
});
test('single-plot harvest D6 rejects arrays with holes/extra keys, hidden controls, nonzero or omitted costs',()=>{
 const action=()=>({request:'FarmHarvestRequest',body:{buildingId:['1农田']},costs:[]});assert.doesNotThrow(()=>assertPaymentAllowed(action()));
 for(const mutate of [a=>a.body.buildingId=[],a=>a.body.buildingId.push('2农田'),a=>delete a.body.buildingId[0],a=>a.body.buildingId.extra=true,a=>a.body.all=true,a=>a.body.buyMissing=true,a=>a.body.autoFarming=false,a=>delete a.costs,a=>a.costs=[{id:'小麦种子',num:1}],a=>a.body.buildingId[0]='']){const a=action();mutate(a);assert.throws(()=>assertPaymentAllowed(a),{code:'COST_UNKNOWN'});}
});

test('harvest verification cannot borrow matching inventory and plot state from a different live client',async()=>{const before=await harvestFixture(),other=await harvestFixture();other.apply();assert.equal(verifyFarmOperation(before.op,before.before,await other.read(),other.receipt()).confirmed,false);});

test('harvest professional view distinguishes live ripe, growing and copied unknown facts',async()=>{const f=await harvestFixture();assert.equal(viewFarmOperations(f.before,f.options).plots[0].state,'RIPE');assert.equal(viewFarmOperations(structuredClone(f.before),f.options).plots[0].state,'MATURITY_UNKNOWN');f.setClock({...f.clock(),earliestMs:1700001800000,nowMs:1700001800100,latestMs:1700001800200});assert.equal(viewFarmOperations(f.before,f.options).plots[0].state,'GROWING');});
test('harvest permits zero initial crop inventory and aggregates exact typed rows without anticipating configured yield',async()=>{const f=await harvestFixture();f.raw.rawAllItem.items=f.raw.rawAllItem.items.filter(r=>r.itemId!=='小麦');const before=await f.read(),op=planFarmOperations(before,f.options).actions[0];f.raw.rawOnWater.building[0].farm=empty().farm;f.raw.rawAllItem.items.push({itemId:'小麦',num:13});const response=f.p.FarmHarvestResponse.decode(f.p.FarmHarvestResponse.encode({reward:[{reward:{type:0,id:'小麦',num:5},critical:0},{reward:{type:0,id:'小麦',num:8},critical:3}]}).finish()),result=verifyFarmOperation(op,before,await f.read(),response);assert.equal(result.confirmed,true,result.reason);assert.equal(result.responseEvidence.num,13);});
