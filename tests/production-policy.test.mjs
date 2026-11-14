import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-production-policy-'));
process.env.CW_DATA_DIR = path.join(isolated, 'settings');
const { PRODUCTION_POLICY_PATH, defaultProductionPolicy, validateProductionPolicy, loadProductionPolicy, saveProductionPolicy, selectProductionCandidates, productionShortages, productionDemand } = await import('../src/production-policy.mjs');
const policy = (extra = {}) => ({ ...defaultProductionPolicy(), enabled: true, ...extra });
const candidate = (buildingId, productId, actionType = 'startProduce') => ({ actionId: `city:${buildingId}:${productId}`, actionType, target: { buildingId, productId } });
function survey(extra = {}) {
  return { stock: new Map(), stockReliable: true, orders: [{ requirements: [{ id: '布匹', num: 3 }] }],
    orderReliability: { orders: true }, factories: [], cityReliability: { buildings: true, byBuilding: {} }, ...extra };
}
const reset = () => fs.rmSync(path.dirname(PRODUCTION_POLICY_PATH), { recursive: true, force: true });
const writeRaw = (value) => { fs.mkdirSync(path.dirname(PRODUCTION_POLICY_PATH), { recursive: true }); fs.writeFileSync(PRODUCTION_POLICY_PATH, typeof value === 'string' ? value : JSON.stringify(value)); };

test('production policies use fresh disabled defaults and never write on a read', () => {
  reset(); const value = loadProductionPolicy('synthetic-A');
  assert.deepEqual(value.config, { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 });
  assert.equal(value.source, 'default'); assert.equal(fs.existsSync(PRODUCTION_POLICY_PATH), false);
  value.config.productIds.push('x'); assert.deepEqual(loadProductionPolicy('synthetic-B').config.productIds, []);
});

test('strict production validation rejects unknown fields, duplicates, unsafe IDs and invalid bounds', () => {
  for (const value of [null, {}, policy({ version: 2 }), policy({ enabled: 1 }), policy({ onlyShortages: 'true' }),
    policy({ productIds: ['布匹', '布匹'] }), policy({ productIds: [' x'] }), policy({ productIds: ['x\ny'] }),
    policy({ productIds: '布匹' }), policy({ maxOperations: 0 }), policy({ maxOperations: 101 }), policy({ maxOperations: 1.5 }),
    policy({ arbitraryRequest: {} })]) assert.throws(() => validateProductionPolicy(value), (e) => e.statusCode === 400);
  const valid = policy({ productIds: ['布匹'], maxOperations: 100 }); assert.deepEqual(validateProductionPolicy(valid), valid);
});

test('production overrides persist by exact account key including prototype and path-like text', () => {
  reset();
  for (const accountId of ['synthetic-A', '__proto__', 'constructor', '../../synthetic-B']) saveProductionPolicy(accountId, policy({ productIds: [accountId] }));
  assert.deepEqual(loadProductionPolicy('synthetic-A').config.productIds, ['synthetic-A']);
  assert.deepEqual(loadProductionPolicy('__proto__').config.productIds, ['__proto__']);
  assert.equal(Object.prototype.version, undefined);
  assert.deepEqual(fs.readdirSync(path.dirname(PRODUCTION_POLICY_PATH)), ['production-policy.json']);
  const original = fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8');
  for (const id of [null, '', ' a', 'a ', '\nx', 7, 'x'.repeat(513)]) assert.throws(() => saveProductionPolicy(id, policy()));
  assert.equal(fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), original);
});

test('corrupt policy documents remain intact while defaulting to disabled and refusing saves', () => {
  reset();
  for (const value of ['{', 'null', '[]', { version: 2, accounts: {} }, { version: 1, accounts: [], extra: 1 }]) {
    writeRaw(value); const original = fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), loaded = loadProductionPolicy('synthetic');
    assert.equal(loaded.config.enabled, false); assert.ok(loaded.warning);
    assert.throws(() => saveProductionPolicy('synthetic', policy()), (e) => e.statusCode === 409);
    assert.equal(fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), original);
  }
});

test('invalid individual override is isolated and atomic replacement failures preserve prior data', () => {
  reset(); writeRaw({ version: 1, accounts: { broken: { version: 2 } } });
  assert.equal(loadProductionPolicy('broken').config.enabled, false); assert.ok(loadProductionPolicy('broken').warning);
  saveProductionPolicy('valid', policy()); const original = fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8');
  const rename = fs.renameSync;
  try { fs.renameSync = () => { throw Error('synthetic rename failure'); }; assert.throws(() => saveProductionPolicy('other', policy()), (e) => e.statusCode === 500); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(PRODUCTION_POLICY_PATH, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(path.dirname(PRODUCTION_POLICY_PATH)), ['production-policy.json']);
});

test('production selection is disabled by default and never admits collection or arbitrary actions', () => {
  const candidates = [candidate('A', '布匹'), candidate('B', '布匹', 'gainFactory'), candidate('C', '布匹', 'custom')];
  assert.deepEqual(selectProductionCandidates(survey(), { candidates }), []);
  assert.deepEqual(selectProductionCandidates(survey(), { policy: policy(), candidates }), ['city:A:布匹']);
});

test('production selections respect whitelist, max operations and one product per factory', () => {
  const candidates = [candidate('A', '布匹'), candidate('A', '燃料'), candidate('B', '燃料'), candidate('C', '布匹')];
  assert.deepEqual(selectProductionCandidates(survey(), { policy: policy({ onlyShortages: false, productIds: ['燃料'], maxOperations: 1 }), candidates }), ['city:A:燃料']);
  assert.equal(selectProductionCandidates(survey(), { policy: policy({ onlyShortages: false }), candidates }).length, 3);
});

test('combined order requirements subtract reliable stock, queues and already finished goods', () => {
  const state = survey({ stock: new Map([['布匹', 1]]), orders: [{ requirements: [{ id: '布匹', num: 2 }] }, { requirements: [{ id: '布匹', num: 2 }] }],
    factories: [{ buildingId: 'existing', factory: { factoryQ: [{ idx: 0, productId: '布匹', finishTime: 100 }], finishedProducts: [{ id: '布匹', num: 1 }] } }],
    cityReliability: { buildings: true, byBuilding: { existing: { factory: true, queue: true, finishedProducts: true } } } });
  const candidates = [candidate('A', '布匹'), candidate('B', '布匹')];
  assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), ['city:A:布匹']);
  state.stock.set('布匹', 2); assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), []);
});

test('shortage selection never overproduces the remaining one-unit demand across factories', () => {
  const candidates = [candidate('A', '布匹'), candidate('B', '布匹'), candidate('C', '布匹')];
  assert.equal(selectProductionCandidates(survey({ stock: new Map([['布匹', 2]]) }), { policy: policy(), candidates }).length, 1);
});

test('unknown requirements, inventory, queue completeness and unsafe totals block shortage automation', () => {
  const candidates = [candidate('A', '布匹')];
  for (const state of [survey({ stockReliable: false }), survey({ orderReliability: { orders: false } }), survey({ orders: [{ requirements: [{ id: '布匹', num: null }] }] }),
    survey({ orders: [{ requirements: [{ id: '布匹', num: 0 }] }] }), survey({ stock: new Map([['布匹', null]]) }),
    survey({ factories: [{ buildingId: 'unknown', factory: { factoryQ: [], finishedProducts: [] } }] }),
    survey({ orders: [{ requirements: [{ id: '布匹', num: Number.MAX_SAFE_INTEGER }, { id: '布匹', num: 1 }] }] })]) {
    assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), []);
  }
});

test('reliable empty demand makes no shortage recommendation while explicit all-products mode remains available', () => {
  const state = survey({ orders: [] }), candidates = [candidate('A', '布匹')];
  assert.deepEqual(selectProductionCandidates(state, { policy: policy(), candidates }), []);
  assert.deepEqual(selectProductionCandidates(state, { policy: policy({ onlyShortages: false }), candidates }), ['city:A:布匹']);
});

test.after(() => fs.rmSync(isolated, { recursive: true, force: true }));

test('production shortage view exposes reliable required, inventory, queued, finished and missing counts', () => {
  const state = survey({ stock: new Map([['布匹', 1]]), orders: [{ requirements: [{ id: '布匹', num: 4 }] }],
    factories: [{ buildingId: 'F', factory: { factoryQ: [{ productId: '布匹' }], finishedProducts: [{ id: '布匹', num: 1 }] } }],
    cityReliability: { buildings: true, byBuilding: { F: { factory: true, queue: true, finishedProducts: true } } } });
  assert.deepEqual(productionShortages(state), { reliable: true, items: [{ id: '布匹', required: 4, inventory: 1, inProgress: 1, finished: 1, missing: 1 }], notes: [] });
  state.stockReliable = false; assert.equal(productionShortages(state).reliable, false); assert.deepEqual(productionShortages(state).items, []);
});


function cropCase({wheat=0,seeds=0,orders=[],queued=[],finished=[]}={}) {
  const buildings=[{buildingId:'farm',type:'农田',level:1,buildFinishTime:0},...['s1','s2','f1','f2','f3'].map(buildingId=>({buildingId,type:buildingId[0]==='s'?'种子厂':'食品厂',level:1,buildFinishTime:0,factory:{factoryQ:buildingId==='s1'?queued:[],finishedProducts:buildingId==='s1'?finished:[]}}))];
  const config={tables:{FarmlandPlantCfg:{data:[{id:'小麦',material:['小麦种子',1]}]},BuildingProduceCfg:{data:[
    {buildType:'种子厂',itemId:'小麦种子',unlockLevel:1,costItem:[['木材',1]]},
    {buildType:'食品厂',itemId:'面包',unlockLevel:1,costItem:[['小麦',5],['木材',1]]}]}}};
  const facts=survey({orders,stock:new Map([['小麦',wheat],['小麦种子',seeds],['木材',20]]),buildings,factories:buildings.filter(row=>row.factory),
    cityReliability:{buildings:true,byBuilding:Object.fromEntries(buildings.map(row=>[row.buildingId,{base:true,factory:true,queue:true,finishedProducts:true}]))}});
  const candidates=buildings.filter(row=>row.factory).map(row=>({...candidate(row.buildingId,row.type==='种子厂'?'小麦种子':'面包'),costs:row.type==='种子厂'?[{id:'木材',num:1}]:[{id:'小麦',num:5},{id:'木材',num:1}]}));
  return {facts,config,candidates,settings:policy({cropSupply:{enabled:true,cropCap:250,seedReserve:2,maxSurplusPerRecipe:3}})};
}
const cropSelect=f=>selectProductionCandidates(f.facts,{policy:f.settings,config:f.config,candidates:f.candidates});

test('explicit crop supply config persists by account while old policy shape and defaults remain unchanged',()=>{
  reset();const f=cropCase();assert.deepEqual(validateProductionPolicy(f.settings),f.settings);
  saveProductionPolicy('crop-A',f.settings);assert.deepEqual(loadProductionPolicy('crop-A').config,f.settings);assert.equal(loadProductionPolicy('crop-B').config.cropSupply,undefined);
  for(const cropSupply of [null,{}, {enabled:true,cropCap:250,seedReserve:2,maxSurplusPerRecipe:3,request:'arbitrary'},
    {...f.settings.cropSupply,seedReserve:101},{...f.settings.cropSupply,cropCap:-1},{...f.settings.cropSupply,maxSurplusPerRecipe:1.5}]) assert.throws(()=>validateProductionPolicy(policy({cropSupply})),e=>e.statusCode===400);
  assert.throws(()=>validateProductionPolicy({...f.settings,onlyShortages:false}),e=>e.statusCode===400);
});

test('seed reserve demand selects existing startProduce candidates and deducts outstanding queues and finished stock',()=>{
  const f=cropCase();assert.deepEqual(cropSelect(f),['city:s1:小麦种子','city:s2:小麦种子']);
  const d=productionDemand(f.facts,{policy:f.settings,config:f.config});assert.equal(d.items.find(row=>row.id==='小麦种子').missing,2);
  assert.deepEqual(d.items[0].sources,['SEED_RESERVE']);assert.equal(d.cropSupply.projectionOnly,true);
  const queued=cropCase({queued:[{productId:'小麦种子'}],finished:[{id:'小麦种子',num:1}]});assert.deepEqual(cropSelect(queued),[]);
  f.settings.cropSupply.enabled=false;assert.deepEqual(cropSelect(f),[]);
});

test('surplus production protects outstanding orders and the crop waterline across factories',()=>{
  const f=cropCase({wheat:51,orders:[{requirements:[{id:'小麦',num:6}]}]});
  assert.deepEqual(cropSelect(f),['city:f1:面包']);
  f.facts.stock.set('小麦',50);assert.deepEqual(cropSelect(f),[]);
  f.facts.stock.set('小麦',100);f.settings.productIds=['小麦种子'];assert.deepEqual(cropSelect(f),[]);
});

test('orders and surplus targets merge without addition and queue output does not become spendable materials',()=>{
  const f=cropCase({wheat:60,orders:[{requirements:[{id:'面包',num:2}]}]});
  const row=productionDemand(f.facts,{policy:f.settings,config:f.config}).items.find(row=>row.id==='面包');
  assert.equal(row.orderMissing,2);assert.equal(row.surplusTargetMissing,3);assert.equal(row.missing,3);assert.equal(cropSelect(f).length,3);
  f.facts.orders=[];f.facts.stock.set('木材',0);f.facts.factories[0].factory.finishedProducts=[{id:'木材',num:100}];assert.deepEqual(cropSelect(f),[]);
});

test('missing crop evidence freezes only strategy demand and retains independent ordinary order selection',()=>{
  const f=cropCase({wheat:100,orders:[{requirements:[{id:'面包',num:1}]}]});delete f.config.tables.FarmlandPlantCfg;
  assert.deepEqual(cropSelect(f),['city:f1:面包']);
  const d=productionDemand(f.facts,{policy:f.settings,config:f.config});assert.equal(d.cropSupply.reliable,false);assert.equal(d.items[0].missing,1);
  f.facts.orders=[];assert.deepEqual(cropSelect(f),[]);
});

test('strategy candidates require exact ordinary recipe cost and preserve factory and operation bounds',()=>{
  const f=cropCase({wheat:100});f.settings.maxOperations=1;assert.equal(cropSelect(f).length,1);
  f.settings.maxOperations=10;f.candidates[2].costs=[];f.candidates[3].costs=[{id:'RUBY',num:1}];f.candidates[4].costs=[{id:'小麦',num:4},{id:'木材',num:1}];assert.deepEqual(cropSelect(f),[]);
  f.candidates[2].costs=[{id:'小麦',num:5},{id:'木材',num:1}];f.candidates.push(structuredClone(f.candidates[2]));assert.deepEqual(cropSelect(f),['city:f1:面包']);
});

test('crop supply planning never mutates account inventory, policy, candidates or fixed config',()=>{
  const f=cropCase({wheat:100}),before=structuredClone(f);cropSelect(f);productionDemand(f.facts,{policy:f.settings,config:f.config});assert.deepEqual(f,before);
});


async function integratedProduction({wheat=0,seeds=0,seedReserve=2,maxSurplusPerRecipe=3,applyAt=()=>true,registered=false}={}) {
  const {createOperationService}=await import('../src/operation-service.mjs'),{createExecutionHistory}=await import('../src/execution-history.mjs'),{loadProtocol}=await import('../src/proto.mjs'),{toSnapshotJson}=await import('../src/game.mjs');
  const protocol=loadProtocol(),file=path.join(isolated,'production-history-'+Math.random()+'.json'),history=createExecutionHistory({file});
  const farm={buildingId:'1农田',level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},farm:{productId:'',plantTime:0,ripeTime:0}};
  const factories=['1种子厂','2种子厂','1食品厂','2食品厂','3食品厂'].map(buildingId=>({buildingId,level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},factory:{autoProductId:'',factoryQ:[],finishedProducts:[]}}));
  const config={tables:{BuildingCfg:{data:['农田','种子厂','食品厂'].map(buildingType=>({buildingType}))},BuildingUpgradeCfg:{data:[]},
    FarmlandPlantCfg:{data:[{id:'小麦',material:['小麦种子',1],time:1800,produceNum:5}]},
    BuildingProduceCfg:{data:[{buildType:'种子厂',itemId:'小麦种子',unlockLevel:1,produceTime:20,costItem:[['木材',1]]},{buildType:'食品厂',itemId:'面包',unlockLevel:1,produceTime:20,costItem:[['小麦',5],['木材',1]]}]},
    GameParamCfg:{data:[{paramName:'产品存量初始上限',paramValue:50}]},BuildingProduceParamCfg:{data:[{paramName:'制造位上限',paramValue:6}]},WorkerOrderCfg:{data:[]},WorkerSpecOrderCfg:{data:[]}}};
  const stock=new Map([['小麦',wheat],['小麦种子',seeds],['木材',10]]),raw={building:[farm,...factories],workerOrder:[],orderOfTheDay:{orderNum:0}},writes=[],reads=[];
  let settings=policy({cropSupply:{enabled:true,cropCap:250,seedReserve,maxSurplusPerRecipe}});
  const round=(name,value)=>toSnapshotJson(protocol[name].decode(protocol[name].encode(value).finish()));
  const account={id:'production-A',generation:1,connectionId:'production-connection',player:{playerId:'9007199254740993',worldId:12,level:20},abort:new AbortController(),busy:null,state:'READY'};
  account.client={connected:true,factContext:{accountId:account.id,generation:1,connectionId:account.connectionId},pending:[],watchers:[],uncertainWrites:new Set(),
    async request(name,body,response,_timeout,options){assert.notEqual(options?.mutate,true);reads.push(name);const value=name==='OnWaterRequest'?raw:name==='AllItemRequest'?{items:[...stock].map(([itemId,num])=>({itemId,num}))}:name==='AllResourceRequest'?{list:[]}:name==='MyResFieldsRequest'?{info:{fields:[]}}:name==='MyFleetsRequest'?{fleets:[]}:null;assert.ok(value,name);return round(response,value);},
    async sendWatch(name,body){assert.equal(name,'StartFactoryProduceRequest');assert.ok(history.list(account.id)[0]?.actions.some(row=>row.requestStatus==='DISPATCHING'),'durable shared history precedes sending');writes.push({name,body:round(name,body)});this.uncertainWrites.add(JSON.stringify(body));
      if(applyAt(writes.length)){const plot=raw.building.find(row=>row.buildingId===body.buildingId),recipe=config.tables.BuildingProduceCfg.data.find(row=>row.itemId===body.productId);plot.factory.factoryQ.push({idx:plot.factory.factoryQ.length,productId:body.productId,finishTime:Math.floor(Date.now()/1000)+60});for(const [id,num] of recipe.costItem)stock.set(id,stock.get(id)-num);}
      if(this.onWrite)await this.onWrite();return {status:'UNKNOWN',sent:true};},
    markUnverifiedWrite(name,body){this.uncertainWrites.add(JSON.stringify(body));},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify(body));}};
  const service=provided=>createOperationService({protocol,moduleSettings:{get:()=>({config:{enabled:true}})},history:provided??history,getConfig:()=>config,loadRules:()=>({config:{version:1,enabled:false,rules:[]}}),loadProduction:()=>({config:settings})});
  const operations=service(),plan=async()=>{const view=registered?await operations.surveyModule(account,'production'):await operations.survey(account);return operations.plan(account,{module:registered?'production':'city',mode:'Automatic',selections:view.view.productionRecommendations,...(registered?{parameters:{}}:{})});};
  const authorize=p=>operations.authorize(account,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(row=>row.actionId),resourceBudget:p.resourceBudget,confirm:true});
  const execute=async(p,permit=authorize(p))=>{const start=operations.execute(account,permit);await operations.settle(account.id);return history.list(account.id).find(row=>row.runId===start.runId);};
  return {account,operations,history,stock,raw,writes,reads,config,get settings(){return settings;},plan,authorize,execute,restart:()=>service(createExecutionHistory({file})),changePolicy:fn=>{settings=fn(settings);},cleanup:async()=>{await operations.settle(account.id);account.client.connected=false;}};
}

test('seed reserve executes two exact existing factory writes through one shared authorized history and net material budget',async()=>{
  const f=await integratedProduction();try{
    const p=await f.plan();assert.equal(p.actions.length,2);assert.deepEqual(p.resourceBudget,[{id:'木材',num:2}]);assert.equal(f.writes.length,0);
    const record=await f.execute(p);assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record.actions.map(row=>({result:row.result,error:row.error,verification:row.verification}))));assert.equal(f.writes.length,2);assert.equal(f.stock.get('木材'),8);
    assert.deepEqual(f.writes.map(row=>row.body.buildingId),['1种子厂','2种子厂']);assert.ok(f.writes.every(row=>row.body.productId==='小麦种子'));
    assert.ok(record.actions.every(row=>row.result==='SUCCESS'&&row.verification.status==='CONFIRMED'));assert.deepEqual(record.resourceBudget,p.resourceBudget);
    const repeat=await f.operations.survey(f.account);assert.deepEqual(repeat.view.productionRecommendations,[]);
  }finally{await f.cleanup();}
});

test('surplus crops execute only to the explicit waterline and spend ordinary inventory without packs or paid replacements',async()=>{
  const f=await integratedProduction({wheat:55});try{const p=await f.plan();assert.equal(p.actions.length,3);
    assert.deepEqual(p.resourceBudget,[{id:'小麦',num:15},{id:'木材',num:3}]);const record=await f.execute(p);
    assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record.actions.map(row=>({result:row.result,error:row.error,verification:row.verification}))));assert.equal(f.stock.get('小麦'),40);assert.equal(f.stock.get('木材'),7);assert.equal(f.writes.length,3);
    assert.ok(f.writes.every(row=>row.name==='StartFactoryProduceRequest'&&row.body.productId==='面包'));
    assert.deepEqual((await f.operations.survey(f.account)).view.productionRecommendations,[]);
  }finally{await f.cleanup();}
});

test('unconfirmed strategy production stops the shared batch, retains UNKNOWN after restart and never replays',async()=>{
  const f=await integratedProduction({wheat:55,applyAt:index=>index===1});try{
    const p=await f.plan(),record=await f.execute(p);assert.equal(record.finalStatus,'UNKNOWN');assert.equal(f.writes.length,2);
    assert.equal(record.actions[1].result,'UNKNOWN');assert.equal(f.operations.status(f.account.id).blocked,true);
    const restarted=f.restart();assert.equal(restarted.status(f.account.id).blocked,true);assert.equal(restarted.history(f.account.id).runs[0].finalStatus,'UNKNOWN');
    const reopened={...f.account,connectionId:'reopened-connection',client:{...f.account.client,uncertainWrites:new Set(),factContext:{...f.account.client.factContext,connectionId:'reopened-connection'}}};await assert.rejects(restarted.plan(reopened,{module:'city',mode:'Automatic',selections:p.actions.map(row=>row.actionId)}),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.writes.length,2);
  }finally{await f.cleanup();}
});

for(const change of ['waterline','queue','policy'])test('strategy '+change+' change after exact authorization prevents stale writes',async()=>{
  const f=await integratedProduction({wheat:change==='waterline'?55:0});try{
    const p=await f.plan(),permit=f.authorize(p);
    if(change==='waterline')f.stock.set('小麦',40);
    if(change==='queue')f.raw.building.find(row=>row.buildingId==='1种子厂').factory.factoryQ=[{idx:0,productId:'小麦种子',finishTime:Math.floor(Date.now()/1000)+60},{idx:1,productId:'小麦种子',finishTime:Math.floor(Date.now()/1000)+60}];
    if(change==='policy'){f.changePolicy(value=>({...value,cropSupply:{...value.cropSupply,enabled:false}}));assert.throws(()=>f.operations.execute(f.account,permit),{code:'STALE_PLAN'});}
    else {const record=await f.execute(p,permit);assert.equal(record.finalStatus,'NOT_EXECUTED');}
    assert.equal(f.writes.length,0);
  }finally{await f.cleanup();}
});

for(const field of ['playerId','worldId','connectionId','generation'])test('strategy authorization rejects changed '+field+' before any write',async()=>{
  const f=await integratedProduction();try{const p=await f.plan(),permit=f.authorize(p);if(['playerId','worldId'].includes(field))f.account.player[field]=99;else f.account[field]=field==='generation'?2:'changed';assert.throws(()=>f.operations.execute(f.account,permit),{code:field==='generation'?'CANCELLED':'STALE_PLAN'});assert.equal(f.writes.length,0);}finally{await f.cleanup();}
});

test('cancelled late strategy confirmation remains UNKNOWN and cannot continue the next authorized factory',async()=>{
  const f=await integratedProduction();let release;const gate=new Promise(resolve=>release=resolve);try{const p=await f.plan();f.account.client.onWrite=()=>gate;const start=f.operations.execute(f.account,f.authorize(p));for(let attempt=0;attempt<200&&f.writes.length===0&&f.operations.running(f.account.id);attempt++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.writes.length,1,'expected the first exact write before cancellation');f.operations.stop(f.account.id);release();await f.operations.settle(f.account.id);const record=f.history.list(f.account.id).find(row=>row.runId===start.runId);assert.equal(record.finalStatus,'UNKNOWN');assert.equal(f.writes.length,1);assert.equal(f.operations.status(f.account.id).blocked,true);}finally{release();await f.cleanup();}
});


test('surplus pending-output cap and current input availability are independent after earlier confirmed consumption',()=>{
  const f=cropCase({wheat:45,queued:[{productId:'面包'},{productId:'面包'}]});
  assert.deepEqual(cropSelect(f),['city:f1:面包']);
  f.facts.factories[0].factory.factoryQ.push({productId:'面包'});assert.deepEqual(cropSelect(f),[]);
  f.facts.factories[0].factory.factoryQ=[];f.facts.factories[0].factory.finishedProducts=[{id:'面包',num:3}];assert.deepEqual(cropSelect(f),[]);
});

test('different surplus recipes share the same available crop stock above its waterline',()=>{
  const f=cropCase({wheat:50});f.settings.cropSupply.cropCap=41;
  f.config.tables.BuildingProduceCfg.data.push({buildType:'食品厂',itemId:'麦片',unlockLevel:1,costItem:[['小麦',5],['木材',1]]});
  for(const buildingId of ['f1','f2','f3'])f.candidates.push({...candidate(buildingId,'麦片'),costs:[{id:'小麦',num:5},{id:'木材',num:1}]});
  const selected=cropSelect(f);assert.equal(selected.length,2);assert.equal(new Set(selected.map(id=>id.split(':')[1])).size,2);
});


test('fixed cached configuration supplies exact ordinary seed costs to the same selectable factory actions',async()=>{
  const {extractTables}=await import('../src/config.mjs'),f=cropCase();f.config={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))};
  const recipe=f.config.tables.BuildingProduceCfg.data.find(row=>row.buildType==='种子厂'&&row.itemId==='小麦种子');assert.ok(recipe);
  const costs=recipe.costItem.map(([id,num])=>({id,num}));for(const {id,num} of costs)f.facts.stock.set(id,num*2);
  for(const row of f.candidates.filter(row=>row.target.productId==='小麦种子'))row.costs=structuredClone(costs);
  assert.deepEqual(cropSelect(f),['city:s1:小麦种子','city:s2:小麦种子']);assert.equal(productionDemand(f.facts,{policy:f.settings,config:f.config}).cropSupply.reliable,true);
  assert.ok(costs.every(row=>row.num>0&&!['RUBY','钻石','4'].includes(row.id)));
});


for (const [kind,wheat,expected] of [['seed',0,2],['surplus',55,3]]) test('registered production Function executes '+kind+' demand through the original Service, durable history and budget',async()=>{
 const f=await integratedProduction({registered:true,wheat});try{
  const view=await f.operations.surveyModule(f.account,'production');
  assert.equal(f.operations.modules.production.contractVersion,1);
  const source=kind==='seed'?'SEED_RESERVE':'SURPLUS_CROP';
  assert.ok(view.view.productionShortages.items.some(row=>row.sources?.includes(source)));
  assert.equal(view.view.productionRecommendations.length,expected);assert.equal(f.writes.length,0);
  const p=await f.plan();assert.equal(p.module,'production');assert.equal(p.actions.length,expected);
  assert.deepEqual(p.resourceBudget,kind==='seed'?[{id:'木材',num:2}]:[{id:'小麦',num:15},{id:'木材',num:3}]);
  const record=await f.execute(p);assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record.actions));
  assert.equal(f.writes.length,expected);assert.ok(record.actions.every(row=>row.result==='SUCCESS'&&row.verification.status==='CONFIRMED'));
  assert.equal(f.stock.get('木材'),10-expected);assert.equal(f.stock.get('小麦'),kind==='seed'?0:40);
  assert.deepEqual((await f.operations.surveyModule(f.account,'production')).view.productionRecommendations,[]);
 }finally{await f.cleanup();}
});



test('Loop world action uses the registered production Function and shared workflow history',async()=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs');const {createWorkflowRunner}=await import('../src/workflow.mjs');
 const f=await integratedProduction({registered:true});let runner;try{
  const surveyed=await f.operations.surveyModule(f.account,'production'),actionId=surveyed.view.productionRecommendations[0];assert.ok(actionId);
  const candidate=surveyed.view.candidates.find(row=>row.actionId===actionId);assert.deepEqual(candidate.parameters,{});
  const graph=compileUnifiedExecution({entry:'loop',world:[{module:'production',parameters:candidate.parameters,selection:{actionId}}],budget:{resources:[{id:'木材',num:1}],quotas:[],uids:[]}}, {modules:f.operations.modules}).graph;
  runner=createWorkflowRunner({operations:f.operations,modules:f.operations.modules,getSession:()=>f.account,claim:(_id,runId,options)=>f.operations.claimWorkflow(f.account,runId,options)});
  const pending=await runner.start(f.account.id,graph);assert.equal(pending.status,'AWAITING_AUTHORIZATION');assert.equal(pending.plan.module,'production');assert.equal(f.writes.length,0);
  const record=await f.execute(pending.plan);assert.equal(record.finalStatus,'SUCCESS');assert.equal(record.workflowId,pending.runId);assert.equal(f.writes.length,1);
  const done=await runner.resume();assert.equal(done.status,'COMPLETED');assert.equal(f.history.list(f.account.id).length,1);
 }finally{runner?.stop();await runner?.settle();await f.cleanup();}
});

test('registered production binds crop policy and recipe dependencies before authorization and execution',async()=>{
 for(const change of ['policy','recipe']){
  const f=await integratedProduction({registered:true});try{
   const p=await f.plan(),permit=f.authorize(p);
   if(change==='policy')f.changePolicy(value=>({...value,cropSupply:{...value.cropSupply,seedReserve:0}}));
   else f.config.tables.FarmlandPlantCfg.data[0].material[1]=2;
   assert.throws(()=>f.operations.execute(f.account,permit),{code:'STALE_PLAN'});assert.equal(f.writes.length,0);
  }finally{await f.cleanup();}
 }
});

test('registered production UNKNOWN is durable, blocks later factories and never replays after restart',async()=>{
 const f=await integratedProduction({registered:true,applyAt:()=>false});try{
  const p=await f.plan(),record=await f.execute(p);assert.equal(record.finalStatus,'UNKNOWN');assert.equal(f.writes.length,1);
  const restarted=f.restart();assert.equal(restarted.status(f.account.id).blocked,true);
  assert.equal(restarted.history(f.account.id).runs[0].finalStatus,'UNKNOWN');
  const reopened={...f.account,connectionId:'registry-reopened',client:{...f.account.client,uncertainWrites:new Set(),factContext:{...f.account.client.factContext,connectionId:'registry-reopened'}}};await assert.rejects(restarted.plan(reopened,{module:'production',mode:'Automatic',parameters:{},selections:p.actions.map(row=>row.actionId)}),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.writes.length,1);
 }finally{await f.cleanup();}
});
