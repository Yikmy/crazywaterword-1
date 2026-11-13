import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';

// Set paths before project imports: every transport and credential is synthetic.
const isolation=fs.mkdtempSync(path.join(os.tmpdir(),'cw-pet-http-'));
process.env.CW_DATA_DIR=isolation;process.env.CW_CONFIG_PACK=path.join(isolation,'absent-config.json');
const pet=await import('../src/pet-operations.mjs');
const {loadProtocol}=await import('../src/proto.mjs');
const {toSnapshotJson}=await import('../src/game.mjs');
const {extractTables}=await import('../src/config.mjs');
const {executeBusinessOperation}=await import('../src/business-functions.mjs');
const {assertPaymentAllowed}=await import('../src/actions.mjs');
const {createRunBudgetContext}=await import('../src/resource-ledger.mjs');
const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs');
const {createExecutionHistory}=await import('../src/execution-history.mjs');
const {createModuleSettings}=await import('../src/gameplay-settings.mjs');
const {createOperationService}=await import('../src/operation-service.mjs');
const {createWorkflowRunner}=await import('../src/workflow.mjs');
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
test.after(()=>{assert.equal(path.dirname(path.resolve(isolation)),path.resolve(os.tmpdir()));fs.rmSync(isolation,{recursive:true,force:true});});
const protocol=loadProtocol(),wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
const parameters={action:'feed',buildingId:'1宠物培育室',jobIdx:0},account='pet-account',uid='9007199254740993';
const claims={resources:[{id:'粗铁',num:4},{id:'鱼肠线',num:12}].sort((a,b)=>a.id.localeCompare(b.id)),quotas:[],uids:[{type:'pet-job',id:'1宠物培育室:0:900'}]};
function fixture(t,{apply=true,mature=false,reroll=false,watchStatus='UNKNOWN',shared=false,http=false}={}){
 const config={tables:{
  BuildingCfg:{data:[{buildingType:'宠物培育室'},{buildingType:'民居'}]},
  PetParamCfg:{data:[{paramName:'投喂减少培育时间',paramValue:100}]},
  PetBaseCfg:{data:['蓝宠物1','紫宠物2'].flatMap(petId=>[0,1].map(star=>({petId,star})))},
  ItemCfg:{data:['鱼肠线','粗铁','其他'].map(id=>({id}))},
 }};
 const needs=()=>[{type:0,id:'鱼肠线',num:12},{type:0,id:'粗铁',num:4}];
 const job={idx:0,petId:'蓝宠物1',star:0,startTime:900,finishTime:mature?1050:2000,feedRequirements:needs()};
 const room={buildingId:parameters.buildingId,level:1,buildStartTime:0,buildFinishTime:0,auto:false,petBreed:{maxQLength:2,breedQ:[job,{...structuredClone(job),idx:2,finishTime:3000}],maturePets:[{petId:'紫宠物2',star:0}]}};
 const state={now:1000,clock:true,buildings:[room,{buildingId:'1民居',level:1,buildStartTime:0,buildFinishTime:0}],
  pets:[{uid,petId:'蓝宠物1',star:0,level:1,baseAttrs:[],extAttrs:[]}],stock:new Map([['鱼肠线',100],['粗铁',100],['GOLD',500],['其他',1]]),
  writes:[],reads:[],onRead:null,onWatch:null,afterWrite:null};
 let file,dir,app,csrf,clients=0,collections=0,failPersist=()=>false;
 const client={
  connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),
  factContext:{accountId:account,generation:1,connectionId:'offline-pet'},
  stop(){this.connected=false;},
  gameClock:{read(){return state.clock?{status:'TRUSTED',reliable:true,accountId:client.factContext.accountId,generation:client.factContext.generation,nowMs:state.now*1000,earliestMs:state.now*1000,latestMs:state.now*1000}:null;}},
  markUnverifiedWrite(name,body){this.uncertainWrites.set(JSON.stringify({name,body}),true);},
  confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));},
  async request(name,body,response,_timeout,opts={}){
   assert.notEqual(opts.mutate,true,'PetFeed has no dedicated response');wire(name,body);state.reads.push(name);await state.onRead?.(name);
   const value={OnWaterRequest:()=>({building:state.buildings}),AllPetRequest:()=>({pets:state.pets}),AllItemRequest:()=>({items:[...state.stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))}),AllResourceRequest:()=>({list:[{res:3,amount:state.stock.get('GOLD')}]})}[name]?.();
   assert.ok(value,'unexpected synthetic read '+name);const decoded=wire(response,value);return state.onResponse?state.onResponse(name,decoded):decoded;
  },
  async sendWatch(name,body,{beforeDispatch}={}){
   beforeDispatch?.();assert.equal(name,'PetFeedRequest');assert.deepEqual(toSnapshotJson(wire(name,body)),{jobIdx:0});
   const durable=file?JSON.parse(fs.readFileSync(file,'utf8')).accounts[account][0]:null;state.writes.push({name,body:structuredClone(body),durable});
   if(apply){
    const current=room.petBreed.breedQ.find(j=>j.idx===body.jobIdx);
    for(const r of current.feedRequirements)state.stock.set(r.id,state.stock.get(r.id)-Number(r.num));
    current.finishTime-=config.tables.PetParamCfg.data[0].paramValue;
    if(current.finishTime<=state.now){room.petBreed.breedQ=room.petBreed.breedQ.filter(j=>j.idx!==body.jobIdx);room.petBreed.maturePets.push({petId:current.petId,star:current.star});}
    else if(reroll)current.feedRequirements=[{type:0,id:'粗铁',num:7}];
   }
   state.afterWrite?.();await state.onWatch?.();return {status:watchStatus};
  },
 };
 const session={id:account,client,state:'READY',generation:1,connectionId:'offline-pet',player:{playerId:'17',worldId:'9',level:30},abort:new AbortController(),busy:null,loop:{running:false,stop:{aborted:false}},log:[],snapshot:{ok:{},failed:{}}};
 const options=extra=>({config,moduleConfig:{enabled:true},player:session.player,parameters,...extra});
 const survey=extra=>pet.surveyPet(client,protocol,options(extra));
 const plan=(facts,extra)=>pet.planPet(facts,options(extra));
 const budget=(limits=claims)=>{const scope={...client.factContext,runId:'pet-run'};return {scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-batch',limits:claims,ledger:null};};
 const run=(operation,extra)=>executeBusinessOperation(client,protocol,operation,{adapter:pet.petModule,...options(),allowMutate:true,budget:budget(),...extra});
 let durable,history,settings,service;
 const services=[],runners=[];
 if(shared||http){
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-pet-service-'));file=path.join(dir,'history.json');durable=createExecutionHistory({file});
  history={...durable,put(record){if(failPersist(record))throw Error('synthetic pet persistence unavailable');return durable.put(record);}};
  settings=createModuleSettings({file:path.join(dir,'settings.json'),modules:GAMEPLAY_MODULES});settings.save(account,'pet',{enabled:true});
  const operationOptions={history,moduleSettings:settings,getConfig:()=>structuredClone(config),loadRules:()=>({config:{version:1,enabled:true,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})};
  if(http){
   saveStore({version:1,activeId:account,accounts:[account,'other-account'].map(id=>({id,label:id,url:'wss://synthetic.invalid',login:{eworldParams:{openId:id,token:'synthetic-pet-only',sign:'synthetic-pet-sign',timestamp:1}}}))});
   app=createConsole({protocol,tracePath:path.join(dir,'never-trace.log'),clientFactory(){clients++;throw Error('Offline pet test forbids clients');},collect(){collections++;throw Error('Offline pet test forbids collection');},writerOwnership:{assertOwned(){return true;},claim(){return true;},release(){}},operationOptions});
   app.server.address=()=>({port:17321});app.sessions.set(account,session);
  }
  service=app?.operations??createOperationService({protocol,modules:GAMEPLAY_MODULES,...operationOptions});services.push(service);
 }
 const newService=()=>{const next=createOperationService({protocol,modules:GAMEPLAY_MODULES,history:createExecutionHistory({file}),moduleSettings:settings,getConfig:()=>structuredClone(config),loadRules:()=>({config:{enabled:true,rules:[]}}),loadProduction:()=>({config:{enabled:false}})});services.push(next);return next;};
 async function displayed(p=parameters,workflowId=null){
  const read=await service.surveyModule(session,'pet',p,{workflowId}),c=read.view.candidates.find(r=>r.executable);assert.ok(c,JSON.stringify(read.view.blocked));
  return service.plan(session,{module:'pet',mode:'Manual',parameters:p,selections:[c.actionId]},{workflowId});
 }
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function execute(p){const permit=authorize(p);service.execute(session,permit);await service.settle(account);return {permit,record:durable.list(account).find(r=>r.planSummary.batchId===p.batchId),status:service.status(account)};}
 function runner(){const r=createWorkflowRunner({operations:service,modules:GAMEPLAY_MODULES,getSession:id=>id===account?session:null,claim:(id,runId,opts)=>service.claimWorkflow(session,runId,opts),isCurrent:(s,g,c)=>s===session&&s.generation===g&&s.client===c});runners.push(r);return r;}
 const call=(route,{id=account,body,headers={},authorized=true}={})=>new Promise(resolve=>{
  const url=new URL(route,'http://127.0.0.1:17321');if(id!==null)url.searchParams.set('account',id);
  const req=new EventEmitter();Object.assign(req,{url:url.pathname+url.search,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:17321','content-type':'application/json',...(authorized?{origin:'http://127.0.0.1:17321',...(csrf?{'x-cw-csrf':csrf}:{})}:{}),...headers}});
  const res={writeHead(status){this.status=status;},end(text){const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:this.status,data});}};app.server.emit('request',req,res);if(body!==undefined)req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');
 });
 t.after(async()=>{for(const r of runners)r.stop();await Promise.all(runners.map(r=>r.settle()));session.abort.abort();await Promise.all(services.map(s=>s.settle(account)));if(app)await app.close();if(dir){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}});
 return {config,state,job,room,client,session,options,survey,plan,budget,run,service,durable,newService,displayed,authorize,execute,runner,call,app,counts:()=>({clients,collections}),file,failPersist:fn=>{failPersist=fn;}};
}
async function prepared(t,options){const f=fixture(t,options),before=await f.survey(),operation=f.plan(before).actions[0];assert.ok(operation,JSON.stringify(pet.viewPet(before,f.options()).blocked));return {...f,before,operation};}
test('Pet BIZ-R08 defaults disabled; parameters use authoritative idx including zero and reject transport or paid controls',()=>{
 assert.deepEqual(pet.PET_DEFAULT_CONFIG,{enabled:false});assert.deepEqual(pet.petModule.capabilities,['BIZ-R08']);assert.equal(pet.petModule.execute,undefined);
 assert.equal(pet.PET_EVIDENCE.realGame,'REAL_UNVERIFIED');assert.equal(protocol.PetFeedResponse,undefined);assert.deepEqual(pet.validatePetParameters(parameters),parameters);
 for(const extra of [{action:'breed'},{action:'claim'},{jobIdx:-1},{jobIdx:'0'},{jobIdx:2147483648},{buildingId:' 1宠物培育室'},{petId:'蓝宠物1'},{universal:false},{request:'PetFeedRequest'},{costs:[]},{body:{}}])assert.throws(()=>pet.validatePetParameters({...parameters,...extra}),{code:'INVALID_PARAMETERS'});
 assert.throws(()=>pet.validatePetConfig({enabled:true,autoClaim:true}),{code:'INVALID_PARAMETERS'});
});
test('complete Pet survey binds exact batch identity and all current feed costs to shared resource and instance claims',async t=>{
 const f=await prepared(t);assert.deepEqual(f.state.reads.sort(),['OnWaterRequest','AllPetRequest','AllItemRequest','AllResourceRequest'].sort());assert.equal(f.state.writes.length,0);
 assert.deepEqual(f.operation.action,{request:'PetFeedRequest',response:null,body:{jobIdx:0}});assert.deepEqual(f.operation.budgetClaims,claims);
 assert.deepEqual(f.operation.target,{buildingId:parameters.buildingId,jobIdx:0,petId:'蓝宠物1',startTime:900,star:0,finishTime:2000});
 assert.equal(f.operation.expectedState.finishTime,1900);
 const v=pet.viewPet(f.before,f.options());assert.equal(v.rooms.length,1);assert.deepEqual(v.candidates[0].action,f.operation.action);assert.equal(v.candidates[0].identity,undefined);
 for(const p of [{},{action:'feed'},{buildingId:parameters.buildingId,action:'feed'},{...parameters,jobIdx:99}])assert.equal(f.plan(f.before,{parameters:p}).actions.length,0);
 assert.equal(f.plan(f.before,{moduleConfig:{enabled:false}}).actions.length,0);
});
for(const mature of [false,true])for(const reroll of mature?[false]:[false,true])test('Pet FEED independently confirms '+(mature?'exact mature transfer':'one exact time reduction')+(reroll?' and next cost refresh':''),async t=>{
 const f=await prepared(t,{mature,reroll}),other=structuredClone(f.room.petBreed.breedQ[1]),owned=structuredClone(f.state.pets),stages=[];
 const result=await f.run(f.operation,{onStage:s=>stages.push(s)});assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.requestStatus,'UNKNOWN');assert.equal(result.afterState.effect,mature?'MATURE':'RUNNING');
 assert.deepEqual(f.state.pets,owned);assert.deepEqual(f.room.petBreed.breedQ.find(j=>j.idx===2),other);assert.equal(f.state.writes.length,1);
 assert.equal(f.state.stock.get('鱼肠线'),88);assert.equal(f.state.stock.get('粗铁'),96);assert.equal(f.state.stock.get('GOLD'),500);
 assert.equal(f.client.uncertainWrites.size,0);assert.deepEqual(stages,['SURVEY','RESOURCE_PREFLIGHT','DISPATCH_INTENT','DISPATCHED','OBSERVATION_ENDED','VERIFY','VERIFIED']);
 if(mature){assert.equal(f.room.petBreed.breedQ.length,1);assert.deepEqual(f.room.petBreed.maturePets.at(-1),{petId:'蓝宠物1',star:0});}
});
test('fixed Pet configuration proves 14400-second reduction with actual ordinary feed materials, without a default duration',async t=>{
 const f=fixture(t);f.config.tables=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));
 f.job.finishTime=20000;f.room.petBreed.breedQ[1].finishTime=30000;
 const before=await f.survey(),op=f.plan(before).actions[0];assert.ok(op);assert.equal(op.expectedState.secondsReduced,14400);assert.equal(op.expectedState.finishTime,5600);assert.deepEqual(op.costs,claims.resources);
 assert.equal((await f.run(op)).status,'SUCCESS');
});
test('Pet rejects missing authority, unavailable building, alias idx, unknown/paid costs and duplicate or defaulted fields',async t=>{
 for(const mutate of [
  f=>delete f.room.petBreed,f=>delete f.room.petBreed.maxQLength,f=>f.room.petBreed.maxQLength=0,
  f=>delete f.job.star,f=>{f.state.onResponse=(name,value)=>{if(name==='OnWaterRequest')delete value.building[0].petBreed.breedQ[0].idx;return value;};},f=>delete f.job.startTime,f=>f.job.startTime=f.job.finishTime,
  f=>f.job.finishTime=1000,f=>f.room.level=0,f=>delete f.room.buildFinishTime,f=>f.room.buildFinishTime=1001,
  f=>f.room.petBreed.breedQ.push(structuredClone(f.job)),
  f=>f.state.buildings.push({...structuredClone(f.room),buildingId:'2宠物培育室'}),
  f=>f.job.feedRequirements=[],f=>f.job.feedRequirements[0].num='9007199254740992',
  f=>f.job.feedRequirements[0].num=0,f=>{f.state.onResponse=(name,value)=>{if(name==='OnWaterRequest')delete value.building[0].petBreed.breedQ[0].feedRequirements[0].type;return value;};},
  f=>f.job.feedRequirements[0].type=1,f=>f.job.feedRequirements[0].id='unknown',
  f=>f.job.feedRequirements[0]={type:1,id:'RUBY',num:1},
  f=>f.job.feedRequirements.push(structuredClone(f.job.feedRequirements[0])),
  f=>f.state.stock.set('鱼肠线',11),f=>f.state.clock=false,
  f=>delete f.client.factContext.connectionId,f=>f.client.factContext.generation=-1,
  f=>delete f.config.tables.PetParamCfg,f=>f.config.tables.PetParamCfg.data[0].paramValue=0,
  f=>f.state.pets[0].uid='9223372036854775808',f=>f.state.pets.push(structuredClone(f.state.pets[0])),
 ]){
  const f=fixture(t);mutate(f);const before=await f.survey();assert.equal(f.plan(before).actions.length,0);assert.equal(f.state.writes.length,0);
 }
});
test('Pet feed requires an actual breeding room and explicitly disabled server automation before all writes',async t=>{
 for(const auto of [true,'missing']){
  const f=fixture(t,{shared:true});if(auto==='missing')delete f.room.auto;else f.room.auto=auto;
  const read=await f.service.surveyModule(f.session,'pet',parameters);
  assert.equal(read.view.candidates[0].executable,false);assert.equal(read.view.candidates[0].blockedReason,'PET_SERVER_AUTO_WORK_NOT_EXPLICITLY_DISABLED');assert.equal(f.state.writes.length,0);
 }
 const f=fixture(t);f.state.buildings[1].petBreed=structuredClone(f.room.petBreed);f.state.buildings[1].auto=false;
 const before=await f.survey();assert.equal(pet.planPet(before,f.options({parameters:{...parameters,buildingId:'1民居'}})).actions.length,0);
 const view=pet.viewPet(before,f.options({parameters:{}}));assert.deepEqual(view.rooms.map(r=>r.buildingId),[parameters.buildingId]);assert.ok(view.candidates.every(c=>c.target.buildingId===parameters.buildingId));assert.equal(f.state.writes.length,0);
});
test('Pet fact edits, foreign clocks, stale reads and dropped authority never become executable',async t=>{
 const f=await prepared(t);
 assert.equal(f.plan(structuredClone(f.before)).actions.length,0);
 for(const change of [b=>b.stock.set('鱼肠线',10000),b=>b.sourceFacts.water.provenance.accountId='foreign',b=>b.buildings[0].level++,b=>b.sourceFacts.resources.provenance.sourceAt-=31000]){
  const g=await prepared(t);change(g.before);assert.equal(g.plan(g.before).actions.length,0);
 }
 f.client.gameClock.read=()=>({status:'TRUSTED',reliable:true,accountId:'other',generation:1,nowMs:1000000,earliestMs:1000000,latestMs:1000000});assert.equal(f.plan(f.before).actions.length,0);
 const missing=fixture(t);missing.state.onRead=name=>{if(name==='OnWaterRequest')throw Error('synthetic read unavailable');};assert.equal(missing.plan(await missing.survey()).actions.length,0);
});
test('Pet no-effect, double feed, wrong cost, unrelated changes and ambiguous natural maturity remain UNKNOWN',async t=>{
 const cases=[
  {apply:false},...[
   f=>f.job.finishTime--,f=>f.job.startTime++,f=>f.job.star++,
   f=>f.room.petBreed.breedQ[1].finishTime--,f=>f.room.petBreed.maxQLength++,
   f=>f.state.stock.set('鱼肠线',89),f=>f.state.stock.set('粗铁',95),f=>f.state.stock.set('其他',2),
   f=>f.state.pets[0].level++,f=>f.state.buildings[1].level++,
   f=>f.room.petBreed.maturePets.push({petId:'蓝宠物1',star:0}),f=>f.state.now=2000,
  ].map(change=>({change})),
 ];
 for(const {change,...opts} of cases){const f=await prepared(t,opts);f.state.afterWrite=()=>change?.(f);const result=await f.run(f.operation);assert.equal(result.status,'UNKNOWN',JSON.stringify(result));assert.equal(f.client.uncertainWrites.size,1);assert.equal(f.state.writes.length,1);}
 for(const change of [f=>f.room.petBreed.maturePets.pop(),f=>f.room.petBreed.maturePets.at(-1).star=1,f=>f.state.pets.push({...f.state.pets[0],uid:'99'})]){
  const f=await prepared(t,{mature:true});f.state.afterWrite=()=>change(f);assert.equal((await f.run(f.operation)).status,'UNKNOWN');assert.equal(f.state.writes.length,1);
 }
});
test('Pet parameter/identity/cost tampering and absent parent claims never dispatch',async t=>{
 for(const change of [op=>op.action.body.jobIdx=2,op=>op.target.startTime++,op=>op.expectedState.finishTime--,op=>op.costs[0].num++,op=>op.budgetClaims.uids[0].id='other']){
  const f=await prepared(t);change(f.operation);assert.notEqual((await f.run(f.operation)).status,'SUCCESS');assert.equal(f.state.writes.length,0);
 }
 for(const omitted of ['粗铁','鱼肠线','uid']){
  const f=await prepared(t),limits=structuredClone(claims);if(omitted==='uid')limits.uids=[];else limits.resources=limits.resources.filter(r=>r.id!==omitted);
  assert.notEqual((await f.run(f.operation,{budget:f.budget(limits)})).status,'SUCCESS');assert.equal(f.state.writes.length,0);
 }
});
test('Pet write-time clock advancement and expired facts fail closed before sending',async t=>{
 const f=await prepared(t);f.state.now=2000;assert.notEqual((await f.run(f.operation)).status,'SUCCESS');assert.equal(f.state.writes.length,0);
 const g=await prepared(t),real=Date.now;let now=real();Date.now=()=>now;
 try{g.state.onRead=()=>{if(g.state.reads.length>8)now+=31000;};assert.notEqual((await g.run(g.operation)).status,'SUCCESS');assert.equal(g.state.writes.length,0);}finally{Date.now=real;}
});
test('Pet D6 independently rejects targetless/extra bodies, zero/unknown costs and RUBY even with opt-in',()=>{
 const good={request:'PetFeedRequest',response:null,body:{jobIdx:0},costs:claims.resources};assert.doesNotThrow(()=>assertPaymentAllowed(good));
 for(const extra of [{body:{}},{body:{jobIdx:-1}},{body:{jobIdx:'0'}},{body:{jobIdx:0,universal:false}},{costs:[]},{costs:[{id:'RUBY',num:1}]},{costs:undefined},{costs:[{id:'鱼肠线',num:0}]}])assert.throws(()=>assertPaymentAllowed({...good,...extra},{allowPaid:true}));
 assert.throws(()=>assertPaymentAllowed({request:'PetBreedRequest',body:{petId:'蓝宠物1',universal:false},costs:[{id:'GOLD',num:1}]}));
 assert.throws(()=>assertPaymentAllowed({request:'GetMaturePetRequest',body:{},costs:[]}));
});
test('Pet actual Service persists resources, batch UID and dispatch intent then reopens confirmed history',async t=>{
 const f=fixture(t,{shared:true,mature:true}),p=await f.displayed();assert.deepEqual(p.budgetClaims,claims);assert.equal(p.actions[0].action,undefined);
 const permit=f.authorize(p);assert.equal(f.state.writes.length,0);f.service.execute(f.session,permit);await f.service.settle(account);
 const record=f.durable.list(account)[0],sent=f.state.writes[0];assert.equal(record.finalStatus,'SUCCESS');assert.equal(record.actions[0].verification.status,'CONFIRMED');
 assert.equal(sent.durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(sent.durable.runBudget.reserved,claims);assert.equal(sent.durable.actions[0].stages.at(-1).stage,'DISPATCH_INTENT');
 assert.equal(record.actions[0].afterState.effect,'MATURE');assert.equal(createExecutionHistory({file:f.file}).unresolved(account),false);assert.throws(()=>f.service.execute(f.session,permit));
});
test('Pet UNKNOWN keeps materials and instance reserved across process/store restart with no replay',async t=>{
 const f=fixture(t,{shared:true,apply:false,watchStatus:'SUCCESS'}),p=await f.displayed(),{record}=await f.execute(p);
 assert.equal(record.finalStatus,'UNKNOWN');assert.equal(record.actions[0].unresolvedWrite,true);assert.deepEqual(record.runBudget.reserved,claims);
 const next=f.newService(),fresh={...f.session,generation:2,connectionId:'restarted',client:{...f.client,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{...f.client.factContext,generation:2,connectionId:'restarted'}}};
 await assert.rejects(next.surveyModule(fresh,'pet',parameters),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.state.writes.length,1);
});
test('Pet exact permit binds both materials and cannot cross identity or configuration',async t=>{
 for(const kind of ['cost','account','player','world','generation','connection']){
  const f=fixture(t,{shared:true}),p=await f.displayed();
  if(kind==='cost'){f.config.tables.PetParamCfg.data[0].paramValue++;assert.throws(()=>f.authorize(p),{code:'STALE_PLAN'});}
  else{const permit=f.authorize(p);if(kind==='account')assert.throws(()=>f.service.execute({...f.session,id:'other-account'},permit));
   else{if(kind==='player')f.session.player.playerId='99';if(kind==='world')f.session.player.worldId='11';if(kind==='generation'){f.session.generation++;f.client.factContext.generation++;}if(kind==='connection'){f.session.connectionId+='new';f.client.factContext.connectionId+='new';}try{f.service.execute(f.session,permit);await f.service.settle(account);}catch{}assert.notEqual(f.service.status(account).finalStatus,'SUCCESS');}}
  assert.equal(f.state.writes.length,0);
 }
});
test('Pet reservation and intent persistence failures prevent all transport',async t=>{
 for(const kind of ['budget','intent']){
  const f=fixture(t,{shared:true}),p=await f.displayed();f.failPersist(r=>kind==='budget'?(r.runBudget?.reserved.resources??[]).length>0:r.actions?.some(a=>a.dispatchEvidence?.state==='MAY_HAVE_DISPATCHED'));
  try{f.service.execute(f.session,f.authorize(p));await f.service.settle(account);assert.equal(f.state.writes.length,0);assert.notEqual(f.service.status(account).finalStatus,'SUCCESS');}finally{f.failPersist(()=>false);}
 }
});
test('Pet cancellation and late completion cannot convert a stopped write to success or replay',async t=>{
 for(const before of [true,false]){
  const f=fixture(t,{shared:true}),p=await f.displayed(),permit=f.authorize(p);let finish;
  if(before){f.session.abort.abort();try{f.service.execute(f.session,permit);await f.service.settle(account);}catch{}assert.equal(f.state.writes.length,0);}
  else{f.state.onWatch=()=>new Promise(resolve=>{finish=resolve;});f.service.execute(f.session,permit);
   for(let i=0;i<100&&!finish;i++)await new Promise(setImmediate);assert.ok(finish);f.service.stop(account);finish();await f.service.settle(account);
   const r=f.durable.list(account)[0];assert.equal(r.finalStatus,'UNKNOWN');assert.equal(r.actions[0].unresolvedWrite,true);assert.deepEqual(r.runBudget.reserved,claims);await assert.rejects(f.displayed());assert.equal(f.state.writes.length,1);}
 }
});
for(const mode of ['enough','material-short','uid-missing','same-job'])test('Pet Workflow cumulative material/instance budget: '+mode,async t=>{
 const f=fixture(t,{shared:true}),read=await f.service.surveyModule(f.session,'pet',parameters),selection=read.view.candidates.find(r=>r.executable).actionId;
 const limits=structuredClone(claims);if(mode==='material-short')limits.resources[0].num--;if(mode==='uid-missing')limits.uids=[];if(mode==='same-job')for(const r of limits.resources)r.num*=3;
 const nodes=[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'pet',parameters,selection},{id:'v',type:'VERIFY',module:'pet'}];
 if(mode==='same-job')nodes.push({id:'b',type:'ACTION',module:'pet',parameters,selection:{unique:true}},{id:'v2',type:'VERIFY',module:'pet'});
 nodes.push({id:'z',type:'STOP'});const graph={version:1,id:'pet-'+mode,name:'Pet parent',budget:limits,nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id}))},runner=f.runner();
 const first=await runner.start(account,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);
 if(['enough','same-job'].includes(mode)){
  await f.execute(first.plan);const next=await runner.resume();
  if(mode==='enough')assert.equal(next.status,'COMPLETED');else{if(next.status==='AWAITING_AUTHORIZATION'){try{await f.execute(next.plan);}catch{}}const stopped=await runner.resume();assert.equal(stopped.status,'UNKNOWN');assert.deepEqual(stopped.runBudget.reserved.uids,claims.uids);assert.equal(f.durable.list(account).filter(r=>r.finalStatus==='SUCCESS').length,1);const denied=f.durable.list(account).find(r=>r.planSummary.batchId===next.plan.batchId);assert.equal(denied.actions[0].result,'NOT_EXECUTED');assert.equal(denied.actions[0].dispatchEvidence.state,'NOT_DISPATCHED');assert.deepEqual(stopped.runBudget.batches[1].reserved,{resources:[],quotas:[],uids:[]});}
  assert.equal(f.state.writes.length,1);
 }else{assert.throws(()=>f.service.execute(f.session,f.authorize(first.plan)),{code:'RUN_BUDGET_INVALID'});assert.equal(f.state.writes.length,0);}
});
test('Pet HTTP reuses CSRF, strict exact parameters, cropped plans, permits and per-account history without clients',async t=>{
 const f=fixture(t,{http:true});await f.call('/api/gameplay?module=pet');
 for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'wrong'}},{headers:{origin:'https://invalid.example'}}])assert.equal((await f.call('/api/gameplay/survey',{body:{module:'pet',parameters},...extra})).status,403);
 for(const extra of [{jobIdx:'0'},{body:{}},{request:'PetFeedRequest'},{universal:false},{action:'claim'}])assert.equal((await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:{...parameters,...extra}}})).status,400);
 assert.equal(f.state.reads.length,0);const read=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters}});assert.equal(read.status,200);const candidate=read.data.view.candidates.find(r=>r.executable);
 assert.equal(candidate.action,undefined);assert.equal(candidate.configEvidence,undefined);
 const plan=await f.call('/api/operations/plan',{body:{module:'pet',mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(plan.status,200);assert.equal(f.state.writes.length,0);
 const p=plan.data,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(a=>a.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);
 assert.equal((await f.call('/api/operations/execute',{id:'other-account',body:auth.data})).status,409);
 assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);
 assert.equal((await f.call('/api/operations/history')).data.runs[0].finalStatus,'SUCCESS');assert.equal(f.state.writes[0].name,'PetFeedRequest');assert.deepEqual(f.counts(),{clients:0,collections:0});assert.equal(f.app.server.listening,false);
});

test('W19 Pet feed refusal survives reconnect, restart and role return without replay',async t=>{
 const f=fixture(t,{shared:true,apply:false,watchStatus:'REJECTED'});assert.equal((await f.execute(await f.displayed())).record.finalStatus,'REJECTED');const bytes=fs.readFileSync(f.file,'utf8');f.session.generation=f.client.factContext.generation=2;f.session.connectionId=f.client.factContext.connectionId='replacement-pet';const next=f.newService();
 const displayed=async()=>{const read=await next.surveyModule(f.session,'pet',parameters),c=read.view.candidates.find(r=>r.executable);assert.ok(c);return next.plan(f.session,{module:'pet',mode:'Manual',parameters,selections:[c.actionId]});};
 await assert.rejects(displayed(),{code:'REJECTION_MEMORY_ACTIVE'});f.session.player.worldId='10';assert.equal((await displayed()).actions.length,1);f.session.player.worldId='9';await assert.rejects(displayed(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.state.writes.length,1);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
});

for(const missing of ['expectedState','executionContext'])test('W19 Pet original '+missing+' missing keeps refusal blocked',async t=>{
 const f=fixture(t,{shared:true,apply:false,watchStatus:'REJECTED'});await f.execute(await f.displayed());const store=createExecutionHistory({file:f.file}),r=store.list(account)[0];if(missing==='executionContext')delete r.executionContext;else delete r.actions[0][missing];store.put(r);f.session.generation=f.client.factContext.generation=2;f.session.connectionId=f.client.factContext.connectionId='replacement-pet';const next=f.newService();
 const attempt=async()=>{const read=await next.surveyModule(f.session,'pet',parameters),c=read.view.candidates.find(r=>r.executable);assert.ok(c);return next.plan(f.session,{module:'pet',mode:'Manual',parameters,selections:[c.actionId]});};await assert.rejects(attempt(),{code:missing==='executionContext'?'MEMORY_EVENT_CONFLICT':'REJECTION_MEMORY_ACTIVE'});assert.equal(f.state.writes.length,1);
});
