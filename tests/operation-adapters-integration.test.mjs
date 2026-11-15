import { createModuleSettings } from '../src/gameplay-settings.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOperationService } from '../src/operation-service.mjs';
import { createExecutionHistory } from '../src/execution-history.mjs';

const policy = { version: 1, enabled: true, rules: [] };
const config = { tables: {
  BuildingCfg: { data: [{ buildingType: '民居' }, { buildingType: '材料厂' }] },
  BuildingUpgradeCfg: { data: [{ buildingType: '民居', level: 1, playerLevel: 1, curPeople: 0,
    consume: [['wood', 1]], condition: [], effect: [], costTime: 0 }] },
  WorkerOrderCfg: { data: [{ itemId: 'wood', reward: [['EXP', 100]] }] },
  BuildingProduceCfg: { data: [{ buildType: '材料厂', itemId: 'bread', unlockLevel: 1, produceTime: 60, costItem: [['wood', 1]] }] },
  GameParamCfg: { data: [{ paramName: '产品存量初始上限', paramValue: 50 }] },
  BuildingProduceParamCfg: { data: [{ paramName: '制造位上限', paramValue: 6 }] },
} };
const wire = Object.fromEntries(['OnWater', 'AllItem', 'AllResource', 'MyResFields', 'MyFleets', 'FinishWorkerOrder']
  .flatMap(name => [[name + 'Request', {}], [name + 'Response', {}]]));
wire.BuildBuildingRequest = {}; wire.StartFactoryProduceRequest = {};
wire.SpeedUpUpgradeBuildingRequest = {}; wire.SpeedUpFactoryProduceRequest = {};
for (const name of ["CollectBuildingProduct", "GainFactoryProduce"]) { wire[name + "Request"] = {}; wire[name + "Response"] = {}; }
function fixture(stock = 4, outcome = 'SUCCESS', options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-adapters-integration-'));
  const history = createExecutionHistory({ file: path.join(dir, 'history.json') });
  let productionPolicy = { version: 1, enabled: false, onlyShortages: true, productIds: [], maxOperations: 10 };
  const raw = { workerOrder: [{ index: 0, workerId: 'synthetic-resident', textId: 1, isSpecial: false,
    refreshTime: 0, requirements: [{ id: 'wood', num: 2 }] }], orderOfTheDay: { orderNum: 3 }, building: [
    { buildingId: '1民居', level: 0, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] } },
    { buildingId: '1材料厂', level: 1, buildStartTime: 0, buildFinishTime: 0, product: { asset: [] },
      factory: { autoProductId: '', factoryQ: [], finishedProducts: [] } },
  ] };
  const writes = [], reads = [], uncertain = new Set();
  const mutate = (name, body) => {
    writes.push({ name, body });if(outcome==='REJECTED')throw Object.assign(Error('synthetic definite core refusal'),{code:'REJECTED'});
    if (name === 'FinishWorkerOrderRequest') { raw.workerOrder = raw.workerOrder.filter(order => order.index !== body.index); raw.orderOfTheDay.orderNum++; stock -= 2; }
    else if (name === 'BuildBuildingRequest') { raw.building.find(row => row.buildingId === body.buildingId).level = 1; stock--; }
    else if (name === 'StartFactoryProduceRequest') { raw.building.find(row => row.buildingId === body.buildingId).factory.factoryQ.push({ idx: 1, productId: body.productId, finishTime: Math.floor(Date.now() / 1000) + 60 }); stock--; }
    else throw Error('unexpected mutation ' + name);
  };
  const client = { connected: true, pending: [], watchers: [], lateResponses: new Map(), uncertainWrites: uncertain,
    async request(name, body, response, timeout, options) {
      if (options?.mutate) { mutate(name, body); return {}; }
      reads.push(name);
      if (name === 'OnWaterRequest') return structuredClone(raw);
      if (name === 'AllItemRequest') return { items: [{ itemId: 'wood', num: stock }, { itemId: 'bread', num: 0 }] };
      if (name === 'AllResourceRequest') return { list: [] };
      if (name === 'MyResFieldsRequest') return { info: { fields: [] } };
      if (name === 'MyFleetsRequest') return { fleets: [] };
      throw Error('unexpected read ' + name);
    },
    async sendWatch(name, body) { mutate(name, body); uncertain.add(JSON.stringify({ name, body })); return { status: 'UNKNOWN', sent: true }; },
    markUnverifiedWrite(name, body) { uncertain.add(JSON.stringify({ name, body })); },
    confirmWatchedWrite(name, body) { uncertain.delete(JSON.stringify({ name, body })); },
  };
  const moduleSettings=createModuleSettings({file:path.join(dir,'settings.json'),modules:GAMEPLAY_MODULES});
  const service = createOperationService({ moduleSettings, protocol: wire, getConfig: () => config, clock:options.clock,loadRules: () => ({ config: options.rules ?? policy }), loadProduction: () => ({ config: structuredClone(productionPolicy), warning: null }), history });
  const session = { id: 'synthetic-account', client, state: 'READY', generation: 1, abort: new AbortController(),
    player: { level: 3 }, loop: { running: false }, busy: null };
  const start = async (module, mode, selections) => {
    const plan = await service.plan(session, { module, mode, selections });
    const approval = service.authorize(session, { batchId: plan.batchId, planHash: plan.planHash,
      approvedActionIds: plan.actions.map(action => action.actionId), resourceBudget: plan.resourceBudget, confirm: true });
    service.execute(session, approval); await service.settle(session.id); return plan;
  };
  return { service, session, client, raw, history, writes, reads, start,
    setProductionPolicy(value) { productionPolicy = structuredClone(value); },
    cleanup() { assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('real combined survey, order and city adapters complete authorized order/build and manual production with durable evidence', async () => {
  const f = fixture();
  try {
    const collected = await f.service.survey(f.session), view = collected.view;
    assert.equal(f.reads.length, 5, 'combined metadata comes from one existing survey collection');
    assert.equal(view.orders[0].executable, true);
    assert.equal(view.orders[0].action, undefined, 'internal request construction stays on the server');
    const build = view.city.candidates.find(action => action.actionType === 'build');
    assert.ok(build);
    const plan = await f.start('combined', 'Automatic', [view.orders[0].actionId, build.actionId]);
    assert.deepEqual(plan.resourceBudget, [{ id: 'wood', num: 3 }]);
    assert.equal(f.service.status(f.session.id).finalStatus, 'SUCCESS');
    assert.deepEqual(f.writes.map(row => row.name), ['FinishWorkerOrderRequest', 'BuildBuildingRequest']);
    const run = f.history.list(f.session.id)[0];
    assert.equal(run.actions.length, 2);
    for (const action of run.actions) {
      assert.equal(action.result, 'SUCCESS'); assert.equal(action.verification.status, 'CONFIRMED');
      assert.ok(action.beforeState); assert.notEqual(action.afterState, undefined);
      assert.ok(action.resourceBefore || action.beforeInventory, 'each action retains its before-inventory evidence');
    }
    const refreshed = (await f.service.survey(f.session)).view;
    const production = refreshed.city.candidates.find(action => action.actionType === 'startProduce');
    assert.ok(production);
    await f.start('city', 'Manual', [production.actionId]);
    assert.equal(f.service.status(f.session.id).finalStatus, 'SUCCESS');
    assert.deepEqual(f.writes.map(row => row.name), ['FinishWorkerOrderRequest', 'BuildBuildingRequest', 'StartFactoryProduceRequest']);
    assert.equal(f.raw.building[1].factory.factoryQ[0].productId, 'bread');
    assert.equal(f.client.uncertainWrites.size, 0); assert.equal(f.session.busy, null);
    assert.equal(f.history.list(f.session.id).length, 2);
  } finally { await f.service.settle(f.session.id); f.cleanup(); }
});

test('real combined planning rejects individually affordable order/build operations that share insufficient materials', async () => {
  const f = fixture(2);
  try {
    const view = (await f.service.survey(f.session)).view;
    const build = view.city.candidates.find(action => action.actionType === 'build');
    assert.ok(build); assert.equal(view.orders[0].executable, true);
    await assert.rejects(f.service.plan(f.session, { module: 'combined', mode: 'Automatic', selections: [view.orders[0].actionId, build.actionId] }), /预算不足|无法执行/);
    assert.equal(f.writes.length, 0); assert.equal(f.history.list(f.session.id).length, 0);
  } finally { f.cleanup(); }
});

test('real Automatic production is restricted by account policy and a policy change invalidates its exact authorization', async () => {
  const f = fixture();
  try {
    const view = (await f.service.survey(f.session)).view;
    const production = view.city.candidates.find(action => action.actionType === 'startProduce');
    const request = { module: 'city', mode: 'Automatic', selections: [production.actionId] };
    await assert.rejects(f.service.plan(f.session, request), /自动生产未启用|策略范围/);
    f.setProductionPolicy({ version: 1, enabled: true, onlyShortages: false, productIds: ['other-product'], maxOperations: 1 });
    await assert.rejects(f.service.plan(f.session, request), /策略范围/);
    f.setProductionPolicy({ version: 1, enabled: true, onlyShortages: false, productIds: ['bread'], maxOperations: 1 });
    const plan = await f.service.plan(f.session, request);
    const approval = f.service.authorize(f.session, { batchId: plan.batchId, planHash: plan.planHash,
      approvedActionIds: plan.actions.map(action => action.actionId), resourceBudget: plan.resourceBudget, confirm: true });
    f.setProductionPolicy({ version: 1, enabled: true, onlyShortages: false, productIds: ['bread'], maxOperations: 2 });
    assert.throws(() => f.service.execute(f.session, approval), /生产策略已变化/);
    assert.equal(f.writes.length, 0);
    await f.start('city', 'Automatic', [production.actionId]);
    assert.equal(f.service.status(f.session.id).finalStatus, 'SUCCESS');
    assert.deepEqual(f.writes.map(row => row.name), ['StartFactoryProduceRequest']);
    assert.deepEqual(f.history.list(f.session.id)[0].planSummary.productionPolicy.productIds, ['bread']);
  } finally { await f.service.settle(f.session.id); f.cleanup(); }
});

for(const [module,kind]of [['orders','SUBMIT'],['city','build']])test('W19 legacy '+module+' shares refusal across combined and explicit Registry entry',async()=>{
 const f=fixture(4,'REJECTED');try{f.session.player.playerId='1';f.session.player.worldId=17;f.session.connectionId='legacy-core';const view=(await f.service.survey(f.session)).view,row=module==='orders'?view.orders[0]:view.city.candidates.find(r=>r.actionType===kind),payload={module:'combined',mode:'Manual',selections:[row.actionId]};await f.start('combined','Manual',[row.actionId]);assert.equal(f.history.list(f.session.id)[0].finalStatus,'REJECTED');f.session.generation++;f.session.connectionId='replacement-core';await assert.rejects(f.service.plan(f.session,payload),{code:'REJECTION_MEMORY_ACTIVE'});f.service.saveModuleConfig(f.session.id,{module,config:{enabled:true}});await assert.rejects(f.service.plan(f.session,{...payload,module,parameters:{}}),{code:'REJECTION_MEMORY_ACTIVE'});f.session.player.worldId=18;assert.equal((await f.service.plan(f.session,payload)).actions.length,1);f.session.player.worldId=17;await assert.rejects(f.service.plan(f.session,payload),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});

for(const fromLegacy of [true,false])test('W19 production refusal shared across '+(fromLegacy?'legacy city to Registry production':'Registry production to legacy city'),async()=>{
 const f=fixture(4,'REJECTED');try{f.session.player.playerId='1';f.session.player.worldId=17;f.session.connectionId='core-production';f.service.saveModuleConfig(f.session.id,{module:'production',config:{enabled:true}});const row=(await f.service.survey(f.session)).view.city.candidates.find(r=>r.actionType==='startProduce');const legacy={module:'city',mode:'Manual',selections:[row.actionId]},registered={...legacy,module:'production',parameters:{}};const p=await f.service.plan(f.session,fromLegacy?legacy:registered);const permit=f.service.authorize(f.session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});f.service.execute(f.session,permit);await f.service.settle(f.session.id);assert.equal(f.history.list(f.session.id)[0].finalStatus,'REJECTED');const opposite=fromLegacy?registered:legacy;await assert.rejects(f.service.plan(f.session,opposite),{code:'REJECTION_MEMORY_ACTIVE'});f.session.player.worldId=18;assert.equal((await f.service.plan(f.session,opposite)).actions.length,1);f.session.player.worldId=17;await assert.rejects(f.service.plan(f.session,opposite),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});

for(const route of ['legacy','registered'])for(const key of ['accountId','playerId','worldId','generation','connectionId'])test(route+' order executor blocks client source '+key+' drift during independent write preflight',async()=>{
 const f=fixture();
 try{
  f.session.player={...f.session.player,playerId:'9007199254740993',worldId:'17'};f.session.connectionId='source-connection';
  f.client.factContext={accountId:f.session.id,playerId:'9007199254740993',worldId:'17',generation:1,connectionId:'source-connection'};
  const view=(await f.service.survey(f.session)).view,actionId=view.orders[0].actionId;
  if(route==='registered')f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});
  const plan=await f.service.plan(f.session,{module:'orders',mode:'Manual',selections:[actionId],...(route==='registered'?{parameters:{}}:{})});
  const permit=f.service.authorize(f.session,{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:[actionId],resourceBudget:plan.resourceBudget,confirm:true});
  const request=f.client.request.bind(f.client);let changed=false;
  f.client.request=async(...args)=>{const result=await request(...args);if(args[0]==='AllItemRequest'&&!changed){changed=true;f.client.factContext[key]=key==='generation'?2:key==='accountId'?'other-account':key==='playerId'?'9007199254740995':key==='worldId'?'18':'other-connection';}return result;};
  f.service.execute(f.session,permit);await f.service.settle(f.session.id);assert.equal(changed,true);assert.deepEqual(f.writes,[]);
  const run=f.history.list(f.session.id)[0];assert.equal(run.finalStatus,'NOT_EXECUTED');assert.equal(run.actions[0].dispatched,false);assert.equal(run.actions[0].unresolvedWrite,false);assert.equal(f.client.uncertainWrites.size,0);assert.equal(f.raw.orderOfTheDay.orderNum,3);assert.equal(f.session.busy,null);
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});

for(const route of ['legacy','registered'])test(route+' dispatched order with changed client source stays UNKNOWN across service restart with zero replay',async()=>{
 const f=fixture();
 try{
  f.session.player={...f.session.player,playerId:'9007199254740993',worldId:'17'};f.session.connectionId='source-connection';
  f.client.factContext={accountId:f.session.id,playerId:'9007199254740993',worldId:'17',generation:1,connectionId:'source-connection'};
  const view=(await f.service.survey(f.session)).view,actionId=view.orders[0].actionId;
  if(route==='registered')f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});
  const plan=await f.service.plan(f.session,{module:'orders',mode:'Manual',selections:[actionId],...(route==='registered'?{parameters:{}}:{})});
  const permit=f.service.authorize(f.session,{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:[actionId],resourceBudget:plan.resourceBudget,confirm:true});
  const request=f.client.request.bind(f.client);f.client.request=async(...args)=>{const result=await request(...args);if(args[0]==='FinishWorkerOrderRequest')f.client.factContext.connectionId='changed-after-dispatch';return result;};
  f.service.execute(f.session,permit);await f.service.settle(f.session.id);assert.equal(f.writes.length,1);
  const run=f.history.list(f.session.id)[0];assert.equal(run.finalStatus,'UNKNOWN');assert.equal(run.actions[0].dispatched,true);assert.equal(run.actions[0].unresolvedWrite,true);assert.equal(f.history.unresolved(f.session.id),true);
  assert.equal(f.service.status(f.session.id).blocked,true);const history=createExecutionHistory({file:f.history.storagePath}),restarted=createOperationService({protocol:wire,history,getConfig:()=>config,loadRules:()=>({config:policy}),loadProduction:()=>({config:{}})});
  const reads=f.reads.length,session={...f.session,generation:2,connectionId:'restart-connection',abort:new AbortController(),busy:null,client:{...f.client,pending:[],watchers:[],uncertainWrites:new Set(),lateResponses:new Map(),factContext:{...f.client.factContext,generation:2,connectionId:'restart-connection'}}};
  await assert.rejects(restarted.plan(session,{module:'orders',mode:'Manual',selections:[actionId]}),{code:'RECOVERY_UNCERTAIN'});
  assert.equal(history.list(session.id)[0].finalStatus,'UNKNOWN');assert.equal(history.unresolved(session.id),true);assert.equal(f.writes.length,1);assert.equal(f.reads.length,reads);assert.equal(session.busy,null);
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});

for(const key of ['accountId','playerId','worldId','generation','connectionId','sessionPlayer','sessionWorld'])test('legacy shared survey discards '+key+' source drift without replacing cached facts',async()=>{
 const f=fixture();
 try{
  f.session.player={...f.session.player,playerId:'9007199254740993',worldId:'17'};f.session.connectionId='source-connection';
  f.client.factContext={accountId:f.session.id,playerId:'9007199254740993',worldId:'17',generation:1,connectionId:'source-connection'};
  await f.service.survey(f.session);const before=f.service.view(f.session.id),request=f.client.request.bind(f.client);
  f.client.request=async(...args)=>{const result=await request(...args);if(args[0]==='OnWaterRequest'){
   if(key==='sessionPlayer')f.session.player.playerId='9007199254740995';else if(key==='sessionWorld')f.session.player.worldId='18';else f.client.factContext[key]=key==='generation'?2:key==='accountId'?'other-account':key==='playerId'?'9007199254740995':key==='worldId'?'18':'other-connection';
  }return result;};
  await assert.rejects(f.service.survey(f.session),{code:'CANCELLED'});assert.deepEqual(f.service.view(f.session.id),before);assert.equal(f.session.busy,null);assert.deepEqual(f.writes,[]);assert.deepEqual(f.history.list(f.session.id),[]);
 }finally{f.cleanup();}
});

test('registered core Service projection preserves explicit empty parameters for the Loop UI without exposing transport actions',async()=>{
 const {compileUnifiedExecution}=await import('../src/loop.mjs'),f=fixture();
 try{
  for(const [module,kind]of [['orders','SUBMIT'],['city','build'],['production','startProduce']]){
   f.service.saveModuleConfig(f.session.id,{module,config:{enabled:true}});
   const response=JSON.parse(JSON.stringify(await f.service.surveyModule(f.session,module,{})));
   assert.equal(response.accountId,f.session.id);assert.equal(response.module,module);
   const candidate=response.view.candidates.find(row=>row.actionType===kind&&row.executable);assert.ok(candidate);
   assert.deepEqual(candidate.parameters,{});assert.equal(Object.hasOwn(candidate,'action'),false);
   const compiled=compileUnifiedExecution({entry:'loop',world:[{module,parameters:candidate.parameters,selection:{actionId:candidate.actionId}}],budget:{resources:[{id:'wood',num:4}],quotas:[],uids:[]}},{modules:GAMEPLAY_MODULES});
   assert.deepEqual(compiled.blocked,[]);assert.deepEqual(compiled.graph.nodes.find(row=>row.type==='ACTION').selection,{actionId:candidate.actionId});
  }
  assert.equal(f.writes.length,0);assert.deepEqual(f.history.list(f.session.id),[]);
 }finally{await f.cleanup();}
});

for(const route of ['legacy','registered'])for(const outcome of ['success','window-closes','refusal'])test('explicit local strategy window uses shared '+route+' order authorization history and memory '+outcome,async()=>{
 let now=Date.parse('2026-11-15T17:59:59.900+08:00');const rules={version:1,enabled:true,rules:[{id:'local-window',priority:1,type:'LOCAL_TIME_WINDOW',enabled:true,params:{start:'09:00',end:'18:00',timeZone:'Asia/Shanghai'},onFail:'KEEP'}]},f=fixture(4,outcome==='refusal'?'REJECTED':'SUCCESS',{rules,clock:()=>now});
 try{
  f.session.player={...f.session.player,playerId:'1',worldId:17};f.session.connectionId='window-connection';f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});
  const view=route==='registered'?(await f.service.surveyModule(f.session,'orders')).view:(await f.service.survey(f.session)).view,row=route==='registered'?view.candidates[0]:view.orders[0];assert.equal(row.ruleResult.ruleResults[0].status,'PASS');
  const payload={module:'orders',mode:'Manual',selections:[row.actionId],...(route==='registered'?{parameters:{}}:{})},plan=await f.service.plan(f.session,payload),permit=f.service.authorize(f.session,{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(a=>a.actionId),resourceBudget:plan.resourceBudget,confirm:true});if(outcome==='window-closes')now+=1000;
  f.service.execute(f.session,permit);await f.service.settle(f.session.id);const run=f.history.list(f.session.id)[0];assert.equal(run.finalStatus,outcome==='window-closes'?'NOT_EXECUTED':outcome==='refusal'?'REJECTED':'SUCCESS');assert.equal(f.writes.length,outcome==='window-closes'?0:1);assert.throws(()=>f.service.execute(f.session,permit));
  if(outcome==='refusal'){now=Date.parse('2026-11-16T10:00:00+08:00');await assert.rejects(f.service.plan(f.session,payload),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);}
  if(outcome==='window-closes'){const newView=(await f.service.survey(f.session)).view;assert.equal(newView.orders[0].actionType,'KEEP');assert.equal(newView.orders[0].executable,false);}
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});

for(const closes of [false,true])test('explicit local strategy window remains enforced inside original finite Workflow '+closes,async()=>{
 const {createWorkflowRunner}=await import('../src/workflow.mjs');let now=Date.parse('2026-11-15T17:59:59.900+08:00');const rules={version:1,enabled:true,rules:[{id:'local-window',priority:1,type:'LOCAL_TIME_WINDOW',enabled:true,params:{start:'09:00',end:'18:00',timeZone:'Asia/Shanghai'},onFail:'KEEP'}]},f=fixture(4,'SUCCESS',{rules,clock:()=>now});let runner;
 try{
  f.session.player={...f.session.player,playerId:'1',worldId:17};f.session.connectionId='window-workflow';f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});
  runner=createWorkflowRunner({operations:f.service,getSession:()=>f.session,modules:GAMEPLAY_MODULES,clock:()=>now,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options)});
  const graph={version:1,id:'original-window-orders',name:'Original orders local strategy',budget:{resources:[{id:'wood',num:2}],quotas:[],uids:[]},runPolicy:{maxDurationMs:60000,maxActions:1,modules:['orders']},nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'orders',parameters:{},selection:{unique:true}},{id:'v',type:'VERIFY',module:'orders'},{id:'e',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]};
  await runner.start(f.session.id,graph);await runner.settle();const waiting=runner.getStatus();assert.equal(waiting.status,'AWAITING_AUTHORIZATION');assert.equal(f.writes.length,0);if(closes)now+=1000;await runner.authorizeRun({offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true});await runner.settle();const final=runner.getStatus();assert.equal(final.status,closes?'UNKNOWN':'COMPLETED');assert.equal(f.writes.length,closes?0:1);assert.equal(f.history.list(f.session.id)[0].finalStatus,closes?'NOT_EXECUTED':'SUCCESS');assert.equal(f.service.workflowBudget(f.session.id).state,'CLOSED');assert.equal(final.running,false);
 }finally{runner?.stop();await runner?.settle();await f.service.settle(f.session.id);f.cleanup();}
});

for(const route of ['legacy','registered'])for(const outcome of ['success','threshold-changes','refusal'])test('observed order count shares '+route+' original Service and durable refusal '+outcome,async()=>{
 const rules={version:1,enabled:true,rules:[{id:'observed-count',priority:1,type:'OBSERVED_ORDER_COUNT',enabled:true,params:{value:10,operator:'LT'},onFail:'KEEP'}]},f=fixture(4,outcome==='refusal'?'REJECTED':'SUCCESS',{rules});try{
  f.session.player={...f.session.player,playerId:'1',worldId:17};f.session.connectionId='observed-count-connection';f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});const view=(await f.service.survey(f.session)).view,row=view.orders[0];assert.equal(row.ruleResult.ruleResults[0].countObservation.value,3);const payload={module:'orders',mode:'Manual',selections:[row.actionId],...(route==='registered'?{parameters:{}}:{})};const p=await f.service.plan(f.session,payload),permit=f.service.authorize(f.session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true});if(outcome==='threshold-changes')f.raw.orderOfTheDay.orderNum=10;
  f.service.execute(f.session,permit);await f.service.settle(f.session.id);const record=f.history.list(f.session.id)[0];assert.equal(record.finalStatus,outcome==='success'?'SUCCESS':outcome==='refusal'?'REJECTED':'NOT_EXECUTED');assert.equal(f.writes.length,outcome==='threshold-changes'?0:1);assert.throws(()=>f.service.execute(f.session,permit));
  if(outcome==='refusal'){
   for(const count of [4,0]){f.raw.orderOfTheDay.orderNum=count;f.session.generation++;f.session.connectionId='next-count-'+count;await assert.rejects(f.service.plan(f.session,payload),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);}
   const restarted=createOperationService({protocol:wire,getConfig:()=>config,loadRules:()=>({config:rules}),loadProduction:()=>({config:{version:1,enabled:false,onlyShortages:true,productIds:[],maxOperations:10}}),history:createExecutionHistory({file:f.history.storagePath}),moduleSettings:createModuleSettings({file:path.join(path.dirname(f.history.storagePath),'settings.json'),modules:GAMEPLAY_MODULES})});await assert.rejects(restarted.plan(f.session,payload),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);
  }
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});

for(const changes of [false,true])test('observed order count remains enforced inside original finite Workflow '+changes,async()=>{
 const {createWorkflowRunner}=await import('../src/workflow.mjs'),rules={version:1,enabled:true,rules:[{id:'observed-count',priority:1,type:'OBSERVED_ORDER_COUNT',enabled:true,params:{value:4,operator:'LT'},onFail:'KEEP'}]},f=fixture(4,'SUCCESS',{rules});let runner;try{
  f.session.player={...f.session.player,playerId:'1',worldId:17};f.session.connectionId='count-workflow';f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});runner=createWorkflowRunner({operations:f.service,getSession:()=>f.session,modules:GAMEPLAY_MODULES,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.session,runId,opts)});
  const graph={version:1,id:'original-count-orders',name:'Original observed count strategy',budget:{resources:[{id:'wood',num:2}],quotas:[],uids:[]},runPolicy:{maxDurationMs:60000,maxActions:1,modules:['orders']},nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'orders',parameters:{},selection:{unique:true}},{id:'v',type:'VERIFY',module:'orders'},{id:'e',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]};await runner.start(f.session.id,graph);await runner.settle();const waiting=runner.getStatus();assert.equal(waiting.status,'AWAITING_AUTHORIZATION');if(changes)f.raw.orderOfTheDay.orderNum=4;await runner.authorizeRun({offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true});await runner.settle();assert.equal(runner.getStatus().status,changes?'UNKNOWN':'COMPLETED');assert.equal(f.history.list(f.session.id)[0].finalStatus,changes?'NOT_EXECUTED':'SUCCESS');assert.equal(f.writes.length,changes?0:1);assert.equal(f.service.workflowBudget(f.session.id).state,'CLOSED');
 }finally{runner?.stop();await runner?.settle();await f.service.settle(f.session.id);f.cleanup();}
});

const explicitWaitPolicy={version:1,enabled:true,rules:[{id:'wait-limit',priority:1,type:'MAX_PRODUCTION_WAIT',enabled:true,params:{value:0},onFail:'KEEP'}]};
for(const route of ['legacy','registered'])for(const outcome of ['success','stock-changes','refusal','source-changes-after-send'])test('original '+route+' wait filter keeps shared execution and recovery '+outcome,async()=>{
 const rules=structuredClone(explicitWaitPolicy),f=fixture(4,outcome==='refusal'?'REJECTED':'SUCCESS',{rules});try{
  f.session.player={...f.session.player,playerId:'1',worldId:'17'};f.session.connectionId='wait-filter-connection';f.client.factContext={accountId:f.session.id,playerId:'1',worldId:'17',generation:1,connectionId:f.session.connectionId};f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});
  const row=(await f.service.survey(f.session)).view.orders[0];assert.equal(row.ruleResult.ruleResults[0].waitObservation.status,'IN_STOCK');assert.equal(row.ruleResult.ruleResults[0].waitObservation.leadSeconds,0);const payload={module:'orders',mode:'Manual',selections:[row.actionId],...(route==='registered'?{parameters:{}}:{})},p=await f.service.plan(f.session,payload),permit=f.service.authorize(f.session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true});
  const request=f.client.request.bind(f.client);f.client.request=async(...args)=>{const v=await request(...args);if(outcome==='stock-changes'&&args[0]==='AllItemRequest')return {items:v.items.map(r=>r.itemId==='wood'?{...r,num:0}:r)};if(outcome==='source-changes-after-send'&&args[0]==='FinishWorkerOrderRequest')f.client.factContext.connectionId='late-source';return v;};
  f.service.execute(f.session,permit);await f.service.settle(f.session.id);const record=f.history.list(f.session.id)[0];assert.equal(record.finalStatus,{success:'SUCCESS','stock-changes':'NOT_EXECUTED',refusal:'REJECTED','source-changes-after-send':'UNKNOWN'}[outcome]);assert.equal(f.writes.length,outcome==='stock-changes'?0:1);assert.throws(()=>f.service.execute(f.session,permit));
  if(outcome==='refusal'||outcome==='source-changes-after-send'){
   const history=createExecutionHistory({file:f.history.storagePath}),restarted=createOperationService({protocol:wire,getConfig:()=>config,loadRules:()=>({config:rules}),history,moduleSettings:createModuleSettings({file:path.join(path.dirname(f.history.storagePath),'settings.json'),modules:GAMEPLAY_MODULES})});f.session.generation++;f.session.connectionId='restart-wait';f.client.factContext={...f.client.factContext,generation:f.session.generation,connectionId:f.session.connectionId};const reads=f.reads.length,restartedSession={...f.session,busy:null,abort:new AbortController(),client:{...f.client,pending:[],watchers:[],uncertainWrites:new Set(),lateResponses:new Map()}};await assert.rejects(restarted.plan(restartedSession,payload),{code:outcome==='refusal'?'REJECTION_MEMORY_ACTIVE':'RECOVERY_UNCERTAIN'});assert.equal(f.writes.length,1);if(outcome==='source-changes-after-send')assert.equal(f.reads.length,reads);
  }
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});
test('wait projection countdown cannot silently change original refusal identity for the same declared order action',async()=>{
 const {ordersModule}=await import('../src/core-operation-adapters.mjs'),context={accountId:'A',playerId:'1',worldId:'17',generation:1,connectionId:'a'},operation={module:'orders',actionType:'REFRESH',target:{index:0},identity:'same-order',beforeState:{index:0},costs:[],budgetClaims:{resources:[],quotas:[],uids:[]},decision:'RECOMMEND_REFRESH',ruleResult:{ruleResults:[{id:'wait-limit',type:'MAX_PRODUCTION_WAIT',status:'FAIL',waitPolicy:{value:100},waitObservation:{scope:'CAPTURED_SERVER_TIME_PROJECTION',executable:false,status:'PROJECTED',leadSeconds:200,refreshEligibility:null}}]}};
 const a=ordersModule.rejectionIdentity(operation,{context}),next=structuredClone(operation);next.ruleResult.ruleResults[0].waitObservation.leadSeconds=190;assert.ok(a);assert.deepEqual(ordersModule.rejectionIdentity(next,{context}),a);next.ruleResult.ruleResults[0].waitPolicy.value=99;assert.notDeepEqual(ordersModule.rejectionIdentity(next,{context}),a);assert.equal(operation.ruleResult.ruleResults[0].waitObservation.leadSeconds,200);
});

for(const changes of [false,true])test('explicit production wait remains enforced inside original finite Workflow '+changes,async()=>{
 const {createWorkflowRunner}=await import('../src/workflow.mjs'),rules=structuredClone(explicitWaitPolicy),f=fixture(4,'SUCCESS',{rules});let runner;try{
  f.session.player={...f.session.player,playerId:'1',worldId:17};f.session.connectionId='wait-workflow';f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});runner=createWorkflowRunner({operations:f.service,getSession:()=>f.session,modules:GAMEPLAY_MODULES,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.session,runId,opts)});
  const graph={version:1,id:'original-wait-orders',name:'Original wait projection strategy',budget:{resources:[{id:'wood',num:2}],quotas:[],uids:[]},runPolicy:{maxDurationMs:60000,maxActions:1,modules:['orders']},nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'orders',parameters:{},selection:{unique:true}},{id:'v',type:'VERIFY',module:'orders'},{id:'e',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'v'},{from:'v',to:'e'}]};await runner.start(f.session.id,graph);await runner.settle();const waiting=runner.getStatus();assert.equal(waiting.status,'AWAITING_AUTHORIZATION');if(changes){const request=f.client.request.bind(f.client);f.client.request=async(...args)=>{const v=await request(...args);return args[0]==='AllItemRequest'?{items:v.items.map(row=>row.itemId==='wood'?{...row,num:0}:row)}:v;};}await runner.authorizeRun({offer:waiting.authorizationOffer,batchId:waiting.plan.batchId,planHash:waiting.plan.planHash,confirm:true});await runner.settle();assert.equal(runner.getStatus().status,changes?'UNKNOWN':'COMPLETED');assert.equal(f.history.list(f.session.id)[0].finalStatus,changes?'NOT_EXECUTED':'SUCCESS');assert.equal(f.writes.length,changes?0:1);assert.equal(f.service.workflowBudget(f.session.id).state,'CLOSED');
 }finally{runner?.stop();await runner?.settle();await f.service.settle(f.session.id);f.cleanup();}
});

for(const route of ['legacy','registered'])test('wait policy invalidates original '+route+' authorization when production configuration changes',async()=>{
 const rules=structuredClone(explicitWaitPolicy),f=fixture(4,'SUCCESS',{rules}),original=structuredClone(config.tables.BuildingProduceCfg);try{
  f.service.saveModuleConfig(f.session.id,{module:'orders',config:{enabled:true}});const row=(await f.service.survey(f.session)).view.orders[0],p=await f.service.plan(f.session,{module:'orders',mode:'Manual',selections:[row.actionId],...(route==='registered'?{parameters:{}}:{})});config.tables.BuildingProduceCfg.data[0].produceTime++;assert.throws(()=>f.service.authorize(f.session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true}),{code:'STALE_PLAN'});assert.equal(f.writes.length,0);assert.deepEqual(f.history.list(f.session.id),[]);
 }finally{config.tables.BuildingProduceCfg=original;await f.service.settle(f.session.id);f.cleanup();}
});

for(const entry of ['city','production','combined'])for(const fault of ['no-debit','over-debit','new-balance','two-jobs'])test('production settlement shared '+entry+' '+fault+' persists UNKNOWN and restart never replays',async()=>{
 const f=fixture();try{
  f.session.player.playerId='1';f.session.player.worldId=17;f.session.connectionId='production-settlement';f.service.saveModuleConfig(f.session.id,{module:'production',config:{enabled:true}});
  const request=f.client.request.bind(f.client);f.client.request=async(...args)=>{const value=await request(...args);if(args[0]==='AllItemRequest'&&f.writes.length){if(fault==='no-debit')value.items.find(r=>r.itemId==='wood').num=4;if(fault==='over-debit')value.items.find(r=>r.itemId==='wood').num=2;if(fault==='new-balance')value.items.push({itemId:'unexpected',num:1});}return value;};
  const send=f.client.sendWatch.bind(f.client);f.client.sendWatch=async(...args)=>{assert.equal(f.history.list(f.session.id)[0].actions[0].requestStatus,'DISPATCHING');const result=await send(...args);if(fault==='two-jobs')f.raw.building[1].factory.factoryQ.push({idx:2,productId:'bread',finishTime:Math.floor(Date.now()/1000)+90});return result;};
  const row=(await f.service.surveyModule(f.session,'production')).view.candidates.find(r=>r.actionType==='startProduce'),p=await f.service.plan(f.session,{module:entry,mode:'Manual',selections:[row.actionId],...(entry==='production'?{parameters:{}}:{})});
  const permit=f.service.authorize(f.session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});f.service.execute(f.session,permit);await f.service.settle(f.session.id);
  const record=f.history.list(f.session.id)[0];assert.equal(record.finalStatus,'UNKNOWN',JSON.stringify(record));assert.equal(record.actions[0].result,'UNKNOWN');assert.equal(record.actions[0].verification.status,'UNCONFIRMED');assert.equal(record.actions[0].unresolvedWrite,true);assert.deepEqual(record.runBudget.reserved.resources,[{id:'wood',num:1}]);assert.equal(f.writes.length,1);
  const durable=createExecutionHistory({file:f.history.storagePath}),restarted=createOperationService({history:durable,protocol:wire,getConfig:()=>config,moduleSettings:{get:()=>({config:{enabled:true}})},loadRules:()=>({config:policy})});const next={...f.session,client:{...f.client,connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Set(),factContext:{accountId:f.session.id,generation:2,connectionId:'restart',playerId:'1',worldId:17}},generation:2,connectionId:'restart',busy:null,workflowOwner:null,abort:new AbortController()};
  await assert.rejects(f.service.surveyModule(f.session,'production'),{code:'RESPONSE_UNCERTAIN'});assert.equal(restarted.blocked(next.id),true);await assert.rejects(restarted.surveyModule(next,'production'),{code:'RECOVERY_UNCERTAIN'});assert.throws(()=>restarted.execute(next,permit));assert.equal(durable.list(next.id)[0].finalStatus,'UNKNOWN');assert.equal(f.writes.length,1);
 }finally{await f.service.settle(f.session.id);f.cleanup();}
});
test('production exact settlement UNKNOWN stops original finite Workflow before successor',async()=>{
 const {createWorkflowRunner}=await import('../src/workflow.mjs'),f=fixture();let runner;try{
  f.session.player.playerId='1';f.session.player.worldId=17;f.session.connectionId='production-workflow';for(const module of ['production','city'])f.service.saveModuleConfig(f.session.id,{module,config:{enabled:true}});
  const before=(await f.service.survey(f.session)).view.city.candidates,produce=before.find(r=>r.actionType==='startProduce'),build=before.find(r=>r.actionType==='build');
  const request=f.client.request.bind(f.client);f.client.request=async(...args)=>{const value=await request(...args);if(args[0]==='AllItemRequest'&&f.writes.length)value.items.find(r=>r.itemId==='wood').num=4;return value;};
  const graph={version:1,id:'production-settlement-flow',name:'Synthetic production exact debit',budget:{resources:[{id:'wood',num:2}],quotas:[],uids:[]},runPolicy:{maxDurationMs:60000,maxActions:2,modules:['production','city']},nodes:[{id:'s',type:'START'},{id:'p',type:'ACTION',module:'production',parameters:{},selection:produce.actionId},{id:'pv',type:'VERIFY',module:'production'},{id:'b',type:'ACTION',module:'city',parameters:{},selection:build.actionId},{id:'bv',type:'VERIFY',module:'city'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'p'},{from:'p',to:'pv'},{from:'pv',to:'b'},{from:'b',to:'bv'},{from:'bv',to:'z'}]};
  runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});let r=await runner.start(f.session.id,graph);assert.equal(r.status,'AWAITING_AUTHORIZATION');const permit=f.service.authorize(f.session,{batchId:r.plan.batchId,planHash:r.plan.planHash,approvedActionIds:r.plan.actions.map(row=>row.actionId),resourceBudget:r.plan.resourceBudget,confirm:true});f.service.execute(f.session,permit);await f.service.settle(f.session.id);r=await runner.resume();assert.equal(r.status,'UNKNOWN');assert.deepEqual(f.writes.map(row=>row.name),['StartFactoryProduceRequest']);assert.equal(f.raw.building[0].level,0);assert.equal(f.history.list(f.session.id).length,1);assert.equal(f.history.list(f.session.id)[0].workflowNodeId,'p');
 }finally{await runner?.stop();await f.service.settle(f.session.id);f.cleanup();}
});
function acceleratorFixture(kind, debit) {
  const f = fixture();
  f.session.player.playerId = '1'; f.session.player.worldId = 17; f.session.connectionId = 'accelerator-settlement';
  for (const module of ['city', 'production']) f.service.saveModuleConfig(f.session.id, { module, config: { enabled: true } });
  const future = Math.floor(Date.now() / 1000) + 175;
  if (kind === 'speedUpUpgrade') Object.assign(f.raw.building[0], { level: 1, buildStartTime: future - 200, buildFinishTime: future });
  else f.raw.building[1].factory.factoryQ.push({ idx: 2, productId: 'bread', finishTime: future });
  let accelerators = 6;
  const request = f.client.request.bind(f.client);
  f.client.request = async (...args) => {
    const value = await request(...args);
    if (args[0] === 'AllItemRequest') value.items.push({ itemId: '加速器', num: accelerators });
    return value;
  };
  f.client.sendWatch = async (name, body) => {
    assert.equal(f.history.list(f.session.id)[0].actions[0].requestStatus, 'DISPATCHING');
    assert.equal(body.speedUp.type, 2); assert.equal(body.speedUp.useNum, 3);
    f.writes.push({ name, body });
    if (debit) accelerators -= body.speedUp.useNum;
    if (kind === 'speedUpUpgrade') f.raw.building[0].buildFinishTime -= 60;
    else f.raw.building[1].factory.factoryQ[0].finishTime -= 60;
    f.client.uncertainWrites.add(JSON.stringify({ name, body }));
    return { status: 'UNKNOWN', sent: true };
  };
  return f;
}

for (const kind of ['speedUpUpgrade', 'speedUpProduce']) for (const entry of
  kind === 'speedUpUpgrade' ? ['city', 'combined'] : ['city', 'production', 'combined']) for (const debit of [false, true])
  test('accelerator shared settlement ' + kind + ' ' + entry + ' exact-debit=' + debit, async () => {
    const f = acceleratorFixture(kind, debit);
    try {
      const row = (await f.service.survey(f.session)).view.city.candidates.find(r => r.actionType === kind);
      assert.ok(row);
      const plan = await f.start(entry, 'Manual', [row.actionId]), record = f.history.list(f.session.id)[0];
      assert.deepEqual(plan.resourceBudget, [{ id: '加速器', num: 3 }]);
      assert.equal(record.finalStatus, debit ? 'SUCCESS' : 'UNKNOWN');
      assert.equal(record.actions[0].result, debit ? 'SUCCESS' : 'UNKNOWN');
      assert.equal(record.actions[0].verification.status, debit ? 'CONFIRMED' : 'UNCONFIRMED');
      assert.equal(record.actions[0].unresolvedWrite, !debit);
      assert.deepEqual(record.runBudget.reserved.resources, [{ id: '加速器', num: 3 }]);
      assert.equal(f.writes.length, 1); assert.equal(f.client.uncertainWrites.size, debit ? 0 : 1);
      if (!debit) {
        const durable = createExecutionHistory({ file: f.history.storagePath });
        const restarted = createOperationService({ history: durable, protocol: wire, getConfig: () => config,
          moduleSettings: { get: () => ({ config: { enabled: true } }) }, loadRules: () => ({ config: policy }) });
        const next = { ...f.session, client: { ...f.client, connected: true, pending: [], watchers: [], lateResponses: new Map(),
          uncertainWrites: new Set(), factContext: { accountId: f.session.id, generation: 2, connectionId: 'restart', playerId: '1', worldId: 17 } },
          generation: 2, connectionId: 'restart', busy: null, workflowOwner: null, abort: new AbortController() };
        assert.equal(restarted.blocked(next.id), true);
        await assert.rejects(restarted.surveyModule(next, kind === 'speedUpUpgrade' ? 'city' : 'production'), { code: 'RECOVERY_UNCERTAIN' });
        assert.equal(durable.list(next.id)[0].finalStatus, 'UNKNOWN'); assert.equal(f.writes.length, 1);
      }
    } finally { await f.service.settle(f.session.id); f.cleanup(); }
  });

test('accelerator settlement UNKNOWN stops original finite Workflow before successor', async () => {
  const { createWorkflowRunner } = await import('../src/workflow.mjs'), f = acceleratorFixture('speedUpProduce', false);
  let runner;
  try {
    const candidates = (await f.service.survey(f.session)).view.city.candidates;
    const speed = candidates.find(r => r.actionType === 'speedUpProduce'), build = candidates.find(r => r.actionType === 'build');
    const graph = { version: 1, id: 'accelerator-settlement-flow', name: 'Synthetic accelerator exact debit',
      budget: { resources: [{ id: '加速器', num: 3 }, { id: 'wood', num: 1 }], quotas: [], uids: [] },
      runPolicy: { maxDurationMs: 60000, maxActions: 2, modules: ['production', 'city'] }, nodes: [
        { id: 's', type: 'START' }, { id: 'p', type: 'ACTION', module: 'production', parameters: {}, selection: speed.actionId },
        { id: 'pv', type: 'VERIFY', module: 'production' }, { id: 'b', type: 'ACTION', module: 'city', parameters: {}, selection: build.actionId },
        { id: 'bv', type: 'VERIFY', module: 'city' }, { id: 'z', type: 'STOP' }],
      edges: [{ from: 's', to: 'p' }, { from: 'p', to: 'pv' }, { from: 'pv', to: 'b' }, { from: 'b', to: 'bv' }, { from: 'bv', to: 'z' }] };
    runner = createWorkflowRunner({ modules: GAMEPLAY_MODULES, operations: f.service,
      claim: (_id, runId, options) => f.service.claimWorkflow(f.session, runId, options), getSession: id => id === f.session.id ? f.session : null });
    let result = await runner.start(f.session.id, graph); assert.equal(result.status, 'AWAITING_AUTHORIZATION');
    const permit = f.service.authorize(f.session, { batchId: result.plan.batchId, planHash: result.plan.planHash,
      approvedActionIds: result.plan.actions.map(row => row.actionId), resourceBudget: result.plan.resourceBudget, confirm: true });
    f.service.execute(f.session, permit); await f.service.settle(f.session.id); result = await runner.resume();
    assert.equal(result.status, 'UNKNOWN'); assert.deepEqual(f.writes.map(row => row.name), ['SpeedUpFactoryProduceRequest']);
    assert.equal(f.raw.building[0].level, 0); assert.equal(f.history.list(f.session.id)[0].workflowNodeId, 'p');
  } finally { await runner?.stop(); await f.service.settle(f.session.id); f.cleanup(); }
});

function collectionFixture(kind, credit) {
  const f = fixture();
  f.session.player.playerId = '1'; f.session.player.worldId = 17; f.session.connectionId = 'collection-settlement';
  for (const module of ['city', 'production']) f.service.saveModuleConfig(f.session.id, { module, config: { enabled: true } });
  if (kind === 'collectProduct') Object.assign(f.raw.building[0], { level: 1, product: { asset: [{ id: 'bread', num: 3 }] } });
  else f.raw.building[1].factory.finishedProducts.push({ id: 'bread', num: 3 });
  const requestName = kind === 'collectProduct' ? 'CollectBuildingProductRequest' : 'GainFactoryProduceRequest';
  const request = f.client.request.bind(f.client);
  let received = 0;
  f.client.request = async (...args) => {
    if (args[0] === requestName && args[4]?.mutate) {
      assert.equal(f.history.list(f.session.id)[0].actions[0].requestStatus, 'DISPATCHING');
      f.writes.push({ name: args[0], body: args[1] }); received += credit;
      if (kind === 'collectProduct') f.raw.building[0].product.asset = []; else f.raw.building[1].factory.finishedProducts = [];
      return {};
    }
    const value = await request(...args);
    if (args[0] === 'AllItemRequest') value.items.find(row => row.itemId === 'bread').num = received;
    return value;
  };
  return f;
}

for (const kind of ['collectProduct', 'gainFactory']) for (const entry of
  kind === 'collectProduct' ? ['city', 'combined'] : ['city', 'production', 'combined']) for (const credit of [1, 3])
  test('collection shared settlement ' + kind + ' ' + entry + ' actual-credit=' + credit, async () => {
    const f = collectionFixture(kind, credit);
    try {
      const row = (await f.service.survey(f.session)).view.city.candidates.find(r => r.actionType === kind);
      assert.ok(row);
      const plan = await f.start(entry, 'Manual', [row.actionId]), record = f.history.list(f.session.id)[0], confirmed = credit === 3;
      assert.deepEqual(plan.resourceBudget, []); assert.equal(f.writes.length, 1);
      assert.equal(record.finalStatus, confirmed ? 'SUCCESS' : 'UNKNOWN');
      assert.equal(record.actions[0].result, confirmed ? 'SUCCESS' : 'UNKNOWN');
      assert.equal(record.actions[0].verification.status, confirmed ? 'CONFIRMED' : 'UNCONFIRMED');
      assert.equal(record.actions[0].unresolvedWrite, !confirmed); assert.equal(f.client.uncertainWrites.size, confirmed ? 0 : 1);
      if (confirmed) assert.deepEqual(record.actions[0].collectedProducts, [{ id: 'bread', num: 3 }]);
      else {
        const durable = createExecutionHistory({ file: f.history.storagePath });
        const restarted = createOperationService({ history: durable, protocol: wire, getConfig: () => config,
          moduleSettings: { get: () => ({ config: { enabled: true } }) }, loadRules: () => ({ config: policy }) });
        const next = { ...f.session, client: { ...f.client, connected: true, pending: [], watchers: [], lateResponses: new Map(),
          uncertainWrites: new Set(), factContext: { accountId: f.session.id, generation: 2, connectionId: 'restart', playerId: '1', worldId: 17 } },
          generation: 2, connectionId: 'restart', busy: null, workflowOwner: null, abort: new AbortController() };
        assert.equal(restarted.blocked(next.id), true);
        await assert.rejects(restarted.surveyModule(next, kind === 'collectProduct' ? 'city' : 'production'), { code: 'RECOVERY_UNCERTAIN' });
        assert.equal(durable.list(next.id)[0].finalStatus, 'UNKNOWN'); assert.equal(f.writes.length, 1);
      }
    } finally { await f.service.settle(f.session.id); f.cleanup(); }
  });
