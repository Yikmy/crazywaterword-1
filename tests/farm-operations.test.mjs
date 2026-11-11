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
 assert.equal(f.plots[0].state,'EMPTY');assert.equal(f.autoFarming,false);assert.equal(f.identityContext.playerId,'9007199254740993');assert.equal(f.sourceFacts.water.provenance.source,'OnWaterResponse');assert.equal(f.sourceFacts.inventory.provenance.source,'AllItemResponse+AllResourceResponse');assert.equal(f.evidence.maturityTimeUnit,'BLOCKED_EVIDENCE');
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
 const f=facts(core({buildings:[growing()]}));f.now=2147483647;f.evidence={maturityTimeUnit:'SECONDS'};const row=viewFarmOperations(f,{parameters:{buildingId:'1农田',action:'harvest'},moduleConfig:enabled}).candidates[0];assert.equal(row.blockedReason,'FARM_MATURITY_TIME_UNIT_UNVERIFIED');assert.equal(Object.hasOwn(row,'action'),false);assert.deepEqual(planFarmOperations(f,{parameters:{buildingId:'1农田',action:'harvest'},moduleConfig:enabled}).actions,[]);assert.equal(verifyFarmOperation({...row,action:{request:'FarmHarvestRequest',response:'FarmHarvestResponse',body:{buildingId:['1农田']}}},f,f,{reward:[]}).confirmed,false);
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
test('shared D6 allows exact seed-only plant and denies harvest; adapter never bypasses executor',()=>{
 const op=operation(facts());assert.doesNotThrow(()=>assertPaymentAllowed({...op.action,costs:op.costs}));assert.throws(()=>assertPaymentAllowed({request:'FarmHarvestRequest',body:{buildingId:['1农田']},costs:[]}),e=>e.code==='COST_UNKNOWN');assert.equal(Object.hasOwn(farmModule,'execute'),false);assert.equal(FARM_EVIDENCE.maturityTimeUnit,'BLOCKED_EVIDENCE');
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