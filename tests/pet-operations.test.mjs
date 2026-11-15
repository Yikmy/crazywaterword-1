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
const {GameClient,readPetRevision}=await import('../src/client.mjs');
const {createCodec}=await import('../src/codec.mjs');
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
function fixture(t,{apply=true,mature=false,reroll=false,watchStatus='UNKNOWN',shared=false,http=false,level=false}={}){
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
 let ready=Promise.resolve(),push=()=>{},client={
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
   beforeDispatch?.();assert.equal(name,level?'PetLevelUpRequest':'PetFeedRequest');assert.deepEqual(toSnapshotJson(wire(name,body)),level?{buildingId:'1宠物'}:{jobIdx:0});
   const durable=file?JSON.parse(fs.readFileSync(file,'utf8')).accounts[account][0]:null;state.writes.push({name,body:structuredClone(body),durable});
   if(apply&&level){state.pets[0].level++;for(const a of state.pets[0].baseAttrs)a.value+=a.attr===1?10:2;state.stock.set('宠物经验',state.stock.get('宠物经验')-1300);push();}
   if(apply&&!level){
    const current=room.petBreed.breedQ.find(j=>j.idx===body.jobIdx);
    for(const r of current.feedRequirements)state.stock.set(r.id,state.stock.get(r.id)-Number(r.num));
    current.finishTime-=config.tables.PetParamCfg.data[0].paramValue;
    if(current.finishTime<=state.now){room.petBreed.breedQ=room.petBreed.breedQ.filter(j=>j.idx!==body.jobIdx);room.petBreed.maturePets.push({petId:current.petId,star:current.star});}
    else if(reroll)current.feedRequirements=[{type:0,id:'粗铁',num:7}];
   }
   state.afterWrite?.();await state.onWatch?.();return {status:watchStatus};
  },
 };
 if(level){
  config.tables.BuildingCfg.data.push({buildingType:'宠物'},{buildingType:'宠物B'},{buildingType:'宠物C'});
  for(const r of config.tables.PetBaseCfg.data)Object.assign(r,{hp:100,hpGrowth:10,ad:20,adGrowth:2,ap:30,apGrowth:2});
  config.tables.PetLevelCfg={data:[{level:1,playerLevel:1,extraAttrNum:0,baseAttrAdd:1,cost:[]},{level:2,playerLevel:1,extraAttrNum:0,baseAttrAdd:2,cost:['宠物经验',1300]},{level:3,playerLevel:40,extraAttrNum:0,baseAttrAdd:3,cost:['宠物经验',2600]}]};
  config.tables.PetAdvancedCfg={data:[{grade:0,attrs:[]}]};config.tables.ItemCfg.data.push({id:'宠物经验'});state.stock.set('宠物经验',10000);
  state.buildings.push({buildingId:'1宠物',level:1,buildStartTime:0,buildFinishTime:0,petServe:{petUid:uid,upgradeRequirements:[]}});
  Object.assign(state.pets[0],{grade:0,baseAttrs:[{attr:1,value:110},{attr:2,value:22},{attr:3,value:32}],extAttrIdx:1,extAttrs:[],extAttrs2:[]});
  const overrides=client,codec=createCodec(protocol);let socket,seq=1;
  class Socket{constructor(){socket=this;this.readyState=0;}send(bytes){const frame=codec.decode(bytes);if(frame.name==='PingRequest')queueMicrotask(()=>this.receive('PingResponse',{clientTimestamp:frame.body.clientTimestamp,serverTimestamp:Date.now()}));}close(){this.readyState=3;}receive(n,b,q=0){this.onmessage?.({data:codec.encode(n,q,b)});}}
  client=new GameClient({protocol,accountId:account,generation:1,WebSocketImpl:Socket});client.factContext={accountId:account,generation:1,connectionId:'offline-pet'};client.on('error',()=>{});
  ready=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:'17',worldId:'9',level:30}});
  client.request=overrides.request;client.sendWatch=overrides.sendWatch;
  push=(name='SCPetsUpdate',body={pets:state.pets},q)=>socket.receive(name,body,q??seq++);
 }
 const session={id:account,client,state:'READY',generation:1,connectionId:'offline-pet',player:{playerId:'17',worldId:'9',level:30},abort:new AbortController(),busy:null,loop:{running:false,stop:{aborted:false}},log:[],snapshot:{ok:{},failed:{}}};
 const activeParameters=level?{action:'level',buildingId:'1宠物',uid}:parameters;
 const activeClaims=level?{resources:[{id:'宠物经验',num:1300}],quotas:[],uids:[{type:'pet',id:uid},{type:'pet-serving-building',id:'1宠物'}]}:claims;
 const options=extra=>({config,moduleConfig:{enabled:true},player:session.player,parameters:activeParameters,...extra});
 const survey=extra=>pet.surveyPet(client,protocol,options(extra));
 const plan=(facts,extra)=>pet.planPet(facts,options(extra));
 const budget=(limits=activeClaims)=>{const scope={...client.factContext,runId:'pet-run'};return {scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-batch',limits:activeClaims,ledger:null};};
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
   if(http!=='listen')app.server.address=()=>({port:17321});app.sessions.set(account,session);
  }
  service=app?.operations??createOperationService({protocol,modules:GAMEPLAY_MODULES,...operationOptions});services.push(service);
 }
 const newService=()=>{const next=createOperationService({protocol,modules:GAMEPLAY_MODULES,history:createExecutionHistory({file}),moduleSettings:settings,getConfig:()=>structuredClone(config),loadRules:()=>({config:{enabled:true,rules:[]}}),loadProduction:()=>({config:{enabled:false}})});services.push(next);return next;};
 async function displayed(p=activeParameters,workflowId=null){
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
 t.after(async()=>{for(const r of runners)r.stop();await Promise.all(runners.map(r=>r.settle()));session.abort.abort();await Promise.all(services.map(s=>s.settle(account)));if(app)await app.close();if(level)client.stop();if(dir){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}});
 return {ready,push,parameters:activeParameters,claims:activeClaims,config,state,job,room,client,session,options,survey,plan,budget,run,service,durable,newService,displayed,authorize,execute,runner,call,app,counts:()=>({clients,collections}),file,failPersist:fn=>{failPersist=fn;}};
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

async function levelPrepared(t,options={}){const f=fixture(t,{level:true,...options});await f.ready;const before=await f.survey(),operation=f.plan(before).actions[0];assert.ok(operation,JSON.stringify(pet.viewPet(before,f.options()).blocked));return {...f,before,operation};}
test('Pet LEVEL uses exact serving UID, fixed next-level cost and original shared budgets; transport contains building only',async t=>{
 const f=await levelPrepared(t);assert.equal(protocol.PetLevelUpResponse,undefined);assert.deepEqual(f.operation.action,{request:'PetLevelUpRequest',response:null,body:{buildingId:'1宠物'}});assert.deepEqual(f.operation.budgetClaims,f.claims);assert.equal(f.operation.expectedState.pet.level,2);assert.deepEqual(f.operation.expectedState.pet.baseAttrs.map(r=>r.value),[120,24,34]);assert.equal(f.state.writes.length,0);
 const result=await f.run(f.operation);assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.requestStatus,'UNKNOWN');assert.equal(f.state.writes.length,1);assert.equal(f.state.stock.get('宠物经验'),8700);assert.equal(f.client.uncertainWrites.size,0);
});
for(const fault of ['no-uid','mixed-job','unsafe-uid','non-serving','wrong-uid','duplicate-serving','missing-serving-uid','missing-grade','unknown-base-attr','wrong-base-value','missing-level-source','player-level-limit','cost-missing','cost-ruby','cost-free','stock','missing-protocol','changed-read','push-read','missing-attrs','new-extra-attr'])test('Pet LEVEL blocks exact precondition: '+fault,async t=>{
 const f=fixture(t,{level:true});await f.ready;
 if(fault==='no-uid')delete f.parameters.uid;if(fault==='mixed-job')f.parameters.jobIdx=0;if(fault==='unsafe-uid')f.parameters.uid=9007199254740992;
 const b=f.state.buildings.at(-1),p=f.state.pets[0],cfg=f.config.tables;
 if(fault==='non-serving')f.parameters.buildingId=parameters.buildingId;if(fault==='wrong-uid')f.parameters.uid='12';if(fault==='duplicate-serving')f.state.buildings.push({...structuredClone(b),buildingId:'2宠物'});if(fault==='missing-serving-uid')delete b.petServe.petUid;
 if(fault==='missing-grade')delete p.grade;if(fault==='unknown-base-attr')p.baseAttrs[0].attr=99;if(fault==='wrong-base-value')p.baseAttrs[0].value++;
 if(fault==='missing-level-source')f.client.factContext.connectionId='unseeded';if(fault==='player-level-limit')cfg.PetLevelCfg.data[1].playerLevel=31;if(fault==='cost-missing')delete cfg.PetLevelCfg.data[1].cost;if(fault==='cost-ruby')cfg.PetLevelCfg.data[1].cost=['RUBY',1];if(fault==='cost-free')cfg.PetLevelCfg.data[1].cost=['宠物经验',0];if(fault==='stock')f.state.stock.set('宠物经验',1299);
 if(fault==='missing-protocol')f.options=extra=>({config:f.config,player:f.session.player,moduleConfig:{enabled:true},parameters:f.parameters,...extra});
 if(fault==='changed-read'||fault==='push-read'){let once=false;f.state.onRead=n=>{if(n==='AllItemRequest'&&!once){once=true;if(fault==='changed-read')b.petServe.petUid='12';f.push();}};}
 if(fault==='missing-attrs')delete p.baseAttrs;if(fault==='new-extra-attr')cfg.PetLevelCfg.data[1].extraAttrNum=1;
 if(['mixed-job','unsafe-uid'].includes(fault)){await assert.rejects(f.survey(),{code:'INVALID_PARAMETERS'});}else{const protocolCopy=fault==='missing-protocol'?{...protocol,PetLevelUpRequest:undefined}:protocol;const before=await pet.surveyPet(f.client,protocolCopy,f.options());assert.equal(f.plan(before).actions.length,0,JSON.stringify(f.plan(before)));}assert.equal(f.state.writes.length,0);
});
for(const fault of ['no-effect','extra-level','wrong-attrs','wrong-debit','other-stock','other-pet','serving-change','deleted-pet'])test('Pet LEVEL ambiguous settlement persists UNKNOWN: '+fault,async t=>{
 const f=await levelPrepared(t,{shared:true,apply:fault!=='no-effect'});f.state.afterWrite=()=>{const p=f.state.pets[0];if(fault==='extra-level')p.level++;if(fault==='wrong-attrs')p.baseAttrs[0].value++;if(fault==='wrong-debit')f.state.stock.set('宠物经验',9999);if(fault==='other-stock')f.state.stock.set('GOLD',501);if(fault==='other-pet')f.state.pets.push({...structuredClone(p),uid:'123'});if(fault==='serving-change')f.state.buildings.at(-1).petServe.petUid='123';if(fault==='deleted-pet')f.state.pets=[];};
 const plan=await f.displayed(),{record,permit}=await f.execute(plan);assert.equal(record.finalStatus,'UNKNOWN',JSON.stringify(record));assert.equal(record.actions[0].unresolvedWrite,true);assert.deepEqual(record.runBudget.reserved,f.claims);assert.equal(f.state.writes.length,1);assert.throws(()=>f.service.execute(f.session,permit));
 const next=f.newService(),fresh={...f.session,generation:2,connectionId:'restarted-level',client:{...f.client,connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{...f.client.factContext,generation:2,connectionId:'restarted-level'}}};await assert.rejects(next.surveyModule(fresh,'pet',f.parameters),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.state.writes.length,1);
});
for(const fault of ['account','role','world','connection','generation','revision','facts','age','clock-backward'])test('Pet LEVEL cached source invalidation: '+fault,async t=>{
 const f=await levelPrepared(t);if(fault==='account')f.client.factContext.accountId='other';if(fault==='role')f.session.player.playerId='18';if(fault==='world')f.session.player.worldId='10';if(fault==='connection')f.client.factContext.connectionId='other';if(fault==='generation')f.client.factContext.generation++;if(fault==='revision')f.push();if(fault==='facts')f.before.pets[0].level++;if(fault==='age'||fault==='clock-backward'){const at=f.before.sourceFacts.water.provenance.sourceAt;t.mock.method(Date,'now',()=>at+(fault==='age'?30001:-1));}assert.equal(f.plan(f.before).actions.length,0);assert.equal(f.state.writes.length,0);
});
test('Pet LEVEL rechecks private stream after durable intent and before physical dispatch',async t=>{
 const f=await levelPrepared(t,{shared:true}),p=await f.displayed(),original=f.client.sendWatch;f.client.sendWatch=(n,b,opts)=>{f.push('SCUpdateWaterBuilding',{building:f.state.buildings});return original(n,b,opts);};const {record}=await f.execute(p);assert.equal(record.finalStatus,'NOT_EXECUTED');assert.equal(f.state.writes.length,0);
});
test('Pet LEVEL source cannot be forged on a plain client or after zero-sequence pet push',async t=>{
 const f=await levelPrepared(t);assert.equal(readPetRevision({connected:true,factContext:f.client.factContext,petRevision:0}),null);f.client.petRevision=999;assert.ok(f.plan(f.before).actions.length);f.push('SCPetsUpdate',{pets:f.state.pets},0);assert.equal(readPetRevision(f.client),null);assert.equal(f.plan(f.before).actions.length,0);
});
test('Pet LEVEL successful Service dispatch persists exact intent and independent verification before success',async t=>{
 const f=await levelPrepared(t,{shared:true}),p=await f.displayed(),{record}=await f.execute(p);assert.equal(record.finalStatus,'SUCCESS',JSON.stringify(record));const d=f.state.writes[0].durable;assert.equal(d.actions[0].requestStatus,'DISPATCHING');assert.equal(d.actions[0].parameters.uid,uid);assert.deepEqual(record.runBudget.reserved,f.claims);assert.equal(record.actions[0].verification.status,'CONFIRMED');assert.equal(f.state.writes.length,1);
});
for(const mode of ['enough','resource-short','pet-uid-missing','building-uid-missing'])test('Pet LEVEL Workflow parent ceilings: '+mode,async t=>{
 const f=await levelPrepared(t,{shared:true}),limits=structuredClone(f.claims);if(mode==='resource-short')limits.resources[0].num--;if(mode==='pet-uid-missing')limits.uids=limits.uids.filter(r=>r.type!=='pet');if(mode==='building-uid-missing')limits.uids=limits.uids.filter(r=>r.type!=='pet-serving-building');
 const nodes=[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'pet',parameters:f.parameters,selection:{unique:true}},{id:'v',type:'VERIFY',module:'pet'},{id:'z',type:'STOP'}],graph={version:1,id:'pet-level-'+mode,name:'Pet level',budget:limits,nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id}))},runner=f.runner(),first=await runner.start(account,graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);
 if(mode==='enough'){await f.execute(first.plan);assert.equal((await runner.resume()).status,'COMPLETED');assert.equal(f.state.writes.length,1);}else{assert.throws(()=>f.service.execute(f.session,f.authorize(first.plan)),{code:'RUN_BUDGET_INVALID'});assert.equal(f.state.writes.length,0);}
});
test('Pet LEVEL original HTTP performs explicit survey-plan-permit-execute and account-isolated history with zero real clients',async t=>{
 const f=await levelPrepared(t,{http:true});await f.call('/api/gameplay?module=pet');assert.equal((await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:{...f.parameters,jobIdx:0}}})).status,400);assert.equal((await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters},authorized:false})).status,403);
 const read=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(read.status,200);const c=read.data.view.candidates.find(r=>r.executable);assert.ok(c);assert.equal(c.action,undefined);
 const planned=await f.call('/api/operations/plan',{body:{module:'pet',mode:'Manual',parameters:f.parameters,selections:[c.actionId]}});assert.equal(planned.status,200);const p=planned.data,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);
 assert.equal((await f.call('/api/operations/execute',{id:'other-account',body:auth.data})).status,409);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);assert.equal((await f.call('/api/operations/history')).data.runs[0].finalStatus,'SUCCESS');assert.equal((await f.call('/api/operations/history',{id:'other-account'})).data.runs.length,0);assert.deepEqual(f.counts(),{clients:0,collections:0});assert.equal(f.state.writes.length,1);
});
test('Pet LEVEL D6 refuses free, premium, mixed-body and unknown experience declarations',()=>{
 const valid={request:'PetLevelUpRequest',body:{buildingId:'1宠物'},costs:[{id:'宠物经验',num:1300}]};assert.doesNotThrow(()=>assertPaymentAllowed(valid));for(const mutate of [r=>r.costs=[],r=>r.costs[0].id='RUBY',r=>r.costs[0].num=0,r=>r.body.uid=uid,r=>r.body.buildingId='']){const r=structuredClone(valid);mutate(r);assert.throws(()=>assertPaymentAllowed(r));}
});

test('Pet LEVEL fixed retained config proves the actual experience and three attribute formulas',async t=>{
 const f=fixture(t,{level:true,apply:false});await f.ready;f.config.tables=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));const base=f.config.tables.PetBaseCfg.data.find(r=>r.petId==='蓝宠物1'&&r.star===0),p=f.state.pets[0];p.baseAttrs=[{attr:1,value:Math.floor(base.hp+base.hpGrowth)},{attr:2,value:Math.floor(base.ad+base.adGrowth)},{attr:3,value:Math.floor(base.ap+base.apGrowth)}];
 const before=await f.survey(),op=f.plan(before).actions[0];assert.ok(op,JSON.stringify(pet.viewPet(before,f.options()).blocked));assert.deepEqual(op.costs,[{id:'宠物经验',num:1300}]);assert.deepEqual(op.expectedState.pet.baseAttrs.map(r=>r.value),[Math.floor(base.hp+2*base.hpGrowth),Math.floor(base.ad+2*base.adGrowth),Math.floor(base.ap+2*base.apGrowth)]);assert.equal(f.state.writes.length,0);
});
for(const failure of ['intent','refusal'])test('Pet LEVEL original durable '+failure+' policy prevents implicit replay',async t=>{
 const f=await levelPrepared(t,{shared:true,apply:false,watchStatus:failure==='refusal'?'REJECTED':'UNKNOWN'}),p=await f.displayed();if(failure==='intent')f.failPersist(r=>r.actions.some(a=>a.requestStatus==='DISPATCHING'));const {record}=await f.execute(p);
 if(failure==='intent'){assert.equal(f.state.writes.length,0);assert.notEqual(record.finalStatus,'SUCCESS');}else{assert.equal(record.finalStatus,'REJECTED');assert.equal(f.state.writes.length,1);const next=f.newService(),read=await next.surveyModule(f.session,'pet',f.parameters);assert.ok(read.view.candidates.some(r=>r.executable));await assert.rejects(next.plan(f.session,{module:'pet',mode:'Manual',parameters:f.parameters,selections:[f.operation.actionId]}),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.state.writes.length,1);}
});
for(const fault of ['cancel','role','world','connection','generation'])test('Pet LEVEL late write completion after '+fault+' remains UNKNOWN',async t=>{
 const f=await levelPrepared(t,{shared:true}),p=await f.displayed(),permit=f.authorize(p);let entered,release;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r);f.state.onWatch=async()=>{entered();await wait;};f.service.execute(f.session,permit);await started;
 if(fault==='cancel')f.service.stop(account);if(fault==='role')f.session.player.playerId='18';if(fault==='world')f.session.player.worldId='10';if(fault==='connection')f.session.connectionId=f.client.factContext.connectionId='changed';if(fault==='generation')f.client.factContext.generation=++f.session.generation;release();await f.service.settle(account);assert.equal(f.durable.list(account)[0].finalStatus,'UNKNOWN');assert.equal(f.durable.list(account)[0].actions[0].unresolvedWrite,true);assert.equal(f.state.writes.length,1);assert.throws(()=>f.service.execute(f.session,permit));
});
for(const name of ['SCPetDelete','SCUpdateWaterBuilding'])test('Pet LEVEL accepted '+name+' invalidates cached plan',async t=>{const f=await levelPrepared(t);f.push(name,name==='SCPetDelete'?{uids:[uid]}:{building:f.state.buildings});assert.equal(f.plan(f.before).actions.length,0);assert.equal(f.state.writes.length,0);});

test('Pet LEVEL actual localhost HTTP retains exact CSRF/account boundary and shared durable history',async t=>{
 const f=await levelPrepared(t,{http:'listen'});await new Promise(resolve=>f.app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+f.app.server.address().port;
 const info=await (await fetch(base+'/api/gameplay?account='+account+'&module=pet')).json(),csrf=info.csrfToken;assert.ok(csrf);
 async function post(path,body,extra={}){const r=await fetch(base+path+'?account='+account,{method:'POST',headers:{origin:base,'content-type':'application/json','x-cw-csrf':csrf,...extra},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 assert.equal((await post('/api/gameplay/survey',{module:'pet',parameters:f.parameters},{'x-cw-csrf':'wrong'})).status,403);assert.equal(f.state.writes.length,0);
 const read=await post('/api/gameplay/survey',{module:'pet',parameters:f.parameters});assert.equal(read.status,200);const c=read.data.view.candidates.find(r=>r.executable);assert.ok(c);const planned=await post('/api/operations/plan',{module:'pet',mode:'Manual',parameters:f.parameters,selections:[c.actionId]});assert.equal(planned.status,200);const p=planned.data;assert.deepEqual(p.budgetClaims,f.claims);assert.equal(f.state.writes.length,0);
 const authorized=await post('/api/operations/authorize',{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});assert.equal(authorized.status,200);assert.equal((await post('/api/operations/execute',authorized.data)).status,200);await f.service.settle(account);
 const history=await (await fetch(base+'/api/operations/history?account='+account)).json();assert.equal(history.runs[0].finalStatus,'SUCCESS');assert.equal(history.runs[0].actions[0].verification.status,'CONFIRMED');assert.equal(f.state.writes.length,1);assert.deepEqual(f.counts(),{clients:0,collections:0});
});
test('Pet LEVEL player-level stream and changed next-level config invalidate original authorization',async t=>{
 const f=await levelPrepared(t);f.push('SCPlayerExpUpdate',{level:31});assert.equal(f.plan(f.before).actions.length,0);assert.equal((await f.run(f.operation)).status,'NOT_EXECUTED');assert.equal(f.state.writes.length,0);
 const g=await levelPrepared(t);g.config.tables.PetLevelCfg.data[1].cost[1]++;assert.equal((await g.run(g.operation)).status,'NOT_EXECUTED');assert.equal(g.state.writes.length,0);
});

for(const level of [false,true])for(const balance of ['explicit-zero','omitted-zero','new-unrelated'])
 test('Pet shared net debit '+(level?'LEVEL':'FEED')+' preserves '+balance+' through original durable execution',async t=>{
  const f=fixture(t,{shared:true,level});await f.ready;
  for(const row of f.claims.resources)f.state.stock.set(row.id,row.num);
  f.state.onResponse=(name,value)=>{
   if(name==='AllItemRequest'&&f.state.writes.length&&balance==='omitted-zero')value.items=value.items.filter(row=>!f.claims.resources.some(cost=>cost.id===row.itemId));
   return value;
  };
  f.state.afterWrite=()=>{if(balance==='new-unrelated')f.state.stock.set('new-unrelated',1);};
  const p=await f.displayed(),{record,permit}=await f.execute(p),known=balance!=='new-unrelated';
  assert.equal(record.finalStatus,known?'SUCCESS':'UNKNOWN');assert.deepEqual(record.runBudget.reserved,f.claims);
  assert.equal(f.state.writes.length,1);for(const row of f.claims.resources)assert.equal(f.state.stock.get(row.id),0);
  assert.equal(record.actions[0].verification.status,known?'CONFIRMED':'UNCONFIRMED');assert.throws(()=>f.service.execute(f.session,permit));
  if(!known){
   assert.equal(record.actions[0].unresolvedWrite,true);const next=f.newService(),fresh={...f.session,generation:2,connectionId:'shared-delta-restart',client:{...f.client,connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{...f.client.factContext,generation:2,connectionId:'shared-delta-restart'}}};
   await assert.rejects(next.surveyModule(fresh,'pet',f.parameters),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.state.writes.length,1);
  }
 });
