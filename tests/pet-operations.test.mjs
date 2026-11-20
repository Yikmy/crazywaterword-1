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
const {createOfflineBrowser}=await import('./offline-browser-helper.mjs');
const withOfflineBrowser=createOfflineBrowser(isolation);
test.after(()=>{assert.equal(path.dirname(path.resolve(isolation)),path.resolve(os.tmpdir()));fs.rmSync(isolation,{recursive:true,force:true});});
const protocol=loadProtocol(),wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
const parameters={action:'feed',buildingId:'1宠物培育室',jobIdx:0},account='pet-account',uid='9007199254740993';
const claims={resources:[{id:'粗铁',num:4},{id:'鱼肠线',num:12}].sort((a,b)=>a.id.localeCompare(b.id)),quotas:[],uids:[{type:'pet-job',id:'1宠物培育室:0:900'}]};
function fixture(t,{apply=true,mature=false,reroll=false,watchStatus='UNKNOWN',shared=false,http=false,level=false,vipLevel}={}){
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
  ready=client.connect({});socket.readyState=1;socket.onopen();socket.receive('LoginResponse',{result:0,initSeqNo:12,playerInfo:{playerId:'17',worldId:'9',level:30,...(vipLevel===undefined?{}:{vip:{vipLevel,vipExp:'0'}})}});
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
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'GetMaturePetRequest',body:{},costs:[]}));for(const extra of [{body:{buildingId:'1宠物培育室'}},{costs:undefined},{costs:[{id:'RUBY',num:1}]}])assert.throws(()=>assertPaymentAllowed({request:'GetMaturePetRequest',body:{},costs:[],...extra}));
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

// Ordinary breeding observations reuse the original Pet survey only; no writer.
function ordinaryBreedFacts(t,options={}){
 const f=fixture(t,options);
 f.session.player.worldId='1000001';
 f.config.tables.ItemCfg.data.push({id:'宠物1蓝基因'});f.state.stock.set('宠物1蓝基因',80);f.state.stock.set('GOLD',4000);
 f.config.tables.PetSpeciesCfg={data:[{spId:1,season:1}]};
 f.config.tables.PetBreedCfg={data:[{petId:'蓝宠物1',spId:1,season:1,breedTime:14400,cost:[['宠物1蓝基因',80],['GOLD',4000]]}]};
 f.room.level=2;f.room.petBreed.breedQ.splice(1);
 return f;
}
test('ordinary Pet breeding observes exact fixed-client prerequisites without an action, authorization or history',async t=>{
 const f=ordinaryBreedFacts(t,{shared:true}),facts=await f.survey(),q=pet.petBreedQualification(facts,f.options());
 assert.equal(q.status,'OBSERVED');assert.equal(q.readOnly,true);assert.equal(q.executable,false);assert.equal(q.universal,false);assert.equal(q.season,1);
 assert.deepEqual(q.candidates[0].costs,[{id:'宠物1蓝基因',num:80},{id:'GOLD',num:4000}]);assert.equal(q.candidates[0].conditions,'MET');assert.equal(q.candidates[0].breedTime,14400);
 assert.equal(q.candidates[0].action,undefined);assert.equal(q.candidates[0].executable,false);assert.equal(q.candidates[0].blockedReason,'PET_BREED_EXPLICIT_QUEUE_SELECTION_REQUIRED');
 assert.deepEqual(pet.viewPet(facts,f.options()).breeding,q);assert.equal(f.plan(facts).actions[0].action.request,'PetFeedRequest');
 assert.equal(f.state.writes.length,0);assert.equal(f.state.reads.length,4);assert.deepEqual(f.durable.list(account),[]);
 assert.doesNotThrow(()=>pet.validatePetParameters({action:'breed',buildingId:parameters.buildingId,petId:'蓝宠物1'}));assert.equal(pet.planPet(facts,f.options({parameters:{action:'breed',buildingId:parameters.buildingId,petId:'蓝宠物1'}})).actions.length,0);
 assert.doesNotThrow(()=>assertPaymentAllowed({request:'PetBreedRequest',body:{petId:'蓝宠物1',universal:false},costs:q.candidates[0].costs}));
});
for(const [name,mutate,expected]of [
 ['genes',f=>f.state.stock.set('宠物1蓝基因',79),'NOT_MET'],
 ['gold',f=>f.state.stock.set('GOLD',3999),'NOT_MET'],
 ['pet season',f=>f.config.tables.PetBreedCfg.data[0].season=2,'NOT_MET'],
 ['species season',f=>f.config.tables.PetSpeciesCfg.data[0].season=2,'NOT_MET'],
 ['full queue',f=>f.room.petBreed.breedQ.push({...structuredClone(f.job),idx:2}),'NOT_MET'],
 ['building level',f=>f.room.level=1,'NOT_MET'],
 ['automatic room',f=>f.room.auto=true,'UNKNOWN'],
 ['missing automation',f=>delete f.room.auto,'UNKNOWN'],
 ['upgrading room',f=>f.room.buildFinishTime=1200,'UNKNOWN'],
 ['no breeding room',f=>f.state.buildings.splice(0,1),'UNKNOWN'],
])test('ordinary Pet read-only conditions preserve '+name,async t=>{
 const f=ordinaryBreedFacts(t);mutate(f);const q=pet.petBreedQualification(await f.survey(),f.options());assert.equal(q.status,'OBSERVED');assert.equal(q.candidates[0].conditions,expected);assert.equal(q.candidates[0].executable,false);assert.equal(f.state.writes.length,0);
});
for(const [name,mutate]of [
 ['missing cost',f=>delete f.config.tables.PetBreedCfg.data[0].cost],
 ['missing species',f=>delete f.config.tables.PetSpeciesCfg],
 ['duplicate pet',f=>f.config.tables.PetBreedCfg.data.push(structuredClone(f.config.tables.PetBreedCfg.data[0]))],
 ['duplicate species',f=>f.config.tables.PetSpeciesCfg.data.push({spId:1,season:1})],
 ['string cost',f=>f.config.tables.PetBreedCfg.data[0].cost[0][1]='80'],
 ['negative cost',f=>f.config.tables.PetBreedCfg.data[0].cost[0][1]=-1],
 ['paid cost',f=>f.config.tables.PetBreedCfg.data[0].cost[1][0]='RUBY'],
 ['unknown gene',f=>f.config.tables.PetBreedCfg.data[0].cost[0][0]='unknown-gene'],
 ['missing duration',f=>delete f.config.tables.PetBreedCfg.data[0].breedTime],
 ['inherited season',f=>{const row=f.config.tables.PetBreedCfg.data[0];delete row.season;Object.setPrototypeOf(row,{season:1});}],
 ['accessor cost',f=>Object.defineProperty(f.config.tables.PetBreedCfg.data[0],'cost',{enumerable:true,get(){throw Error('must not read accessor');}})],
])test('unknown ordinary Pet definition is local and preserves original feed '+name,async t=>{
 const f=ordinaryBreedFacts(t);mutate(f);const facts=await f.survey(),q=pet.petBreedQualification(facts,f.options());assert.equal(q.status,'UNKNOWN');assert.deepEqual(q.candidates,[]);assert.equal(f.plan(facts).actions[0].action.request,'PetFeedRequest');assert.equal(f.state.writes.length,0);
});
for(const dimension of ['account','player','world','generation','connection','config','snapshot','disconnected'])test('ordinary Pet observation cannot reuse another '+dimension,async t=>{
 const f=ordinaryBreedFacts(t),facts=await f.survey();assert.equal(pet.petBreedQualification(facts,f.options()).candidates[0].conditions,'MET');
 if(dimension==='account')f.client.factContext.accountId='other-account';if(dimension==='player')f.session.player.playerId='18';if(dimension==='world')f.session.player.worldId='2000001';if(dimension==='generation')f.client.factContext.generation++;if(dimension==='connection')f.client.factContext.connectionId='new';if(dimension==='config')f.config.tables.PetBreedCfg.data[0].cost[0][1]++;if(dimension==='snapshot')facts.breedDefinitions[0].costs[0].num=0;if(dimension==='disconnected')f.client.connected=false;
 assert.equal(pet.petBreedQualification(facts,f.options()).status,'UNKNOWN');assert.equal(f.state.writes.length,0);
});
test('ordinary Pet reads use the retained real config and Codec, preserving unknown inventory and season',async t=>{
 const f=ordinaryBreedFacts(t),fixed=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));
 for(const name of ['PetBreedCfg','PetSpeciesCfg','PetBaseCfg','ItemCfg'])f.config.tables[name]=fixed[name];
 const q=pet.petBreedQualification(await f.survey(),f.options()),row=q.candidates.find(r=>r.petId==='蓝宠物1');assert.equal(q.status,'OBSERVED');assert.deepEqual(row.costs,[{id:'宠物1蓝基因',num:80},{id:'GOLD',num:4000}]);assert.equal(row.breedTime,14400);assert.equal(row.conditions,'MET');
 f.state.onResponse=(name,value)=>{if(name==='AllResourceRequest')delete value.list[0].amount;return value;};assert.equal(pet.petBreedQualification(await f.survey(),f.options()).status,'UNKNOWN');
 f.state.onResponse=null;f.session.player.worldId='9';assert.equal(pet.petBreedQualification(await f.survey(),f.options()).reason,'PET_BREED_SEASON_UNKNOWN');assert.equal(f.state.writes.length,0);
});
test('ordinary Pet existing HTTP survey returns read-only conditions with no extra queries or history',async t=>{
 const f=ordinaryBreedFacts(t,{http:true});await f.call('/api/gameplay?module=pet');const result=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters}});
 assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.view.breeding.candidates[0].conditions,'MET');assert.equal(result.data.view.breeding.executable,false);assert.deepEqual(f.durable.list(account),[]);assert.equal(f.state.reads.length,4);assert.equal(f.state.writes.length,0);assert.deepEqual(f.counts(),{clients:0,collections:0});
});

test('ordinary Pet late read is cancelled after identity changes and creates no write or recovered observation',async t=>{
 const f=ordinaryBreedFacts(t);f.state.onRead=async name=>{if(name==='OnWaterRequest')f.client.factContext.connectionId='late-read-other-connection';};
 await assert.rejects(f.survey(),{code:'CANCELLED'});assert.equal(f.state.writes.length,0);
});
test('ordinary Pet observed conditions do not change original Service UNKNOWN reservations or restart blocking',async t=>{
 const f=ordinaryBreedFacts(t,{shared:true,apply:false}),read=await f.service.surveyModule(f.session,'pet',parameters);assert.equal(read.view.breeding.candidates[0].conditions,'MET');
 const p=await f.displayed(),{record}=await f.execute(p);assert.equal(record.finalStatus,'UNKNOWN');assert.deepEqual(record.runBudget.reserved,claims);
 const next=f.newService();await assert.rejects(next.surveyModule({...f.session,client:{...f.client,uncertainWrites:new Map()}},'pet',parameters),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0].name,'PetFeedRequest');
});

async function petBatchFixture(t,{action='feed',count=2,stop=null,http=false}={}){
 const f=fixture(t,{shared:true,level:action==='level',http});await f.ready;const {state}=f,originalPet=structuredClone(state.pets[0]);let targets;
 if(action==='level'){
  targets=Array.from({length:count},(_,i)=>({action,buildingId:(i+2)+'宠物',uid:(9007199254770000n+BigInt(i)).toString()}));
  state.pets=[originalPet,...targets.map(p=>({...structuredClone(originalPet),uid:p.uid}))];
  state.buildings=state.buildings.filter(row=>!row.petServe);state.buildings.push(...targets.map(p=>({buildingId:p.buildingId,level:1,buildStartTime:0,buildFinishTime:0,petServe:{petUid:p.uid,upgradeRequirements:[]}})));
  state.stock.set('宠物经验',count*1300);f.push();
 }else{
  targets=Array.from({length:count},(_,jobIdx)=>({action,buildingId:f.room.buildingId,jobIdx}));
  f.room.petBreed.maxQLength=count;f.room.petBreed.breedQ=targets.map((p,i)=>({...structuredClone(f.job),idx:p.jobIdx,startTime:900+i,finishTime:2000+i*200}));
  state.stock.set('鱼肠线',count*12);state.stock.set('粗铁',count*4);
 }
 const per=action==='level'?[{id:'宠物经验',num:1300}]:[{id:'粗铁',num:4},{id:'鱼肠线',num:12}].sort((a,b)=>a.id.localeCompare(b.id));
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{
  beforeDispatch?.();assert.equal(name,action==='level'?'PetLevelUpRequest':'PetFeedRequest');const decoded=toSnapshotJson(wire(name,body)),i=targets.findIndex(p=>action==='level'?p.buildingId===decoded.buildingId:p.jobIdx===decoded.jobIdx);assert.ok(i>=0);assert.deepEqual(decoded,action==='level'?{buildingId:targets[i].buildingId}:{jobIdx:targets[i].jobIdx});
  state.writes.push({name,body:decoded,durable:structuredClone(f.durable.list(account)[0])});
  if(stop?.index===state.writes.length&&stop.kind==='refused')throw Object.assign(Error('synthetic pet batch refusal'),{code:'REJECTED'});
  if(!(stop?.index===state.writes.length&&stop.kind==='unknown')){
   if(action==='level'){const row=state.pets.find(row=>row.uid===targets[i].uid);row.level++;for(const a of row.baseAttrs)a.value+=a.attr===1?10:2;f.push();}
   else f.room.petBreed.breedQ.find(row=>row.idx===targets[i].jobIdx).finishTime-=100;
   for(const r of per)state.stock.set(r.id,state.stock.get(r.id)-r.num);
  }
  return {status:'UNKNOWN'};
 };
 return {...f,targets,per,originalPet,input:{targets,maxDurationMs:60000}};
}
for(const action of ['feed','level'])for(const count of [1,24])test('Pet prepared batch '+action+' '+count+' executes exact original target IDs and exhausts only initial materials',async t=>{
 const f=await petBatchFixture(t,{action,count}),p=await f.service.preparePetGrowthSource(f.session,f.input);assert.deepEqual(p.budget.resources,f.per.map(r=>({...r,num:r.num*count})));assert.equal(p.budget.uids.length,count*(action==='level'?2:1));const runner=f.runner();let run=await runner.start(account,p.graph);
 for(let i=0;i<count;i++){
  assert.equal(run.status,'AWAITING_AUTHORIZATION');assert.deepEqual(run.plan.actions[0].target,p.steps[i].target);assert.equal(f.state.writes.length,i);const result=await f.execute(run.plan);assert.equal(result.record.finalStatus,'SUCCESS');assert.equal(result.record.workflowNodeId,'grow-'+i);assert.equal(result.record.runBudget.reserved.uids.length,(i+1)*(action==='level'?2:1));assert.throws(()=>f.service.execute(f.session,result.permit));run=await runner.resume();
 }
 assert.equal(run.status,'COMPLETED');assert.equal(f.state.writes.length,count);for(const r of f.per)assert.equal(f.state.stock.get(r.id),0);assert.equal(f.state.stock.get('GOLD'),500);assert.equal(f.state.stock.get('其他'),1);assert.deepEqual(f.state.pets.find(row=>row.uid===f.originalPet.uid),f.originalPet);
 for(let i=0;i<count;i++)if(action==='level'){const row=f.state.pets.find(row=>row.uid===f.targets[i].uid);assert.equal(row.level,2);assert.deepEqual(row.baseAttrs,[{attr:1,value:120},{attr:2,value:24},{attr:3,value:34}]);}else assert.equal(f.room.petBreed.breedQ.find(row=>row.idx===i).finishTime,1900+i*200);
 assert.equal(createExecutionHistory({file:f.file}).unresolved(account),false);
});
for(const action of ['feed','level'])for(const kind of ['unknown','refused'])test('Pet prepared batch '+action+' second '+kind+' stops third and preserves original budget across restart',async t=>{
 const f=await petBatchFixture(t,{action,count:3,stop:{index:2,kind}}),p=await f.service.preparePetGrowthSource(f.session,f.input),runner=f.runner();let run=await runner.start(account,p.graph);assert.equal((await f.execute(run.plan)).record.finalStatus,'SUCCESS');run=await runner.resume();const result=await f.execute(run.plan);assert.equal(result.record.finalStatus,kind==='unknown'?'UNKNOWN':'REJECTED');run=await runner.resume();assert.equal(run.status,kind==='unknown'?'UNKNOWN':'FAILED');
 const bytes=fs.readFileSync(f.file,'utf8'),reads=f.state.reads.length;await assert.rejects(runner.resume(),{code:'WORKFLOW_INVALID'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(f.state.reads.length,reads);assert.equal(f.state.writes.length,2);assert.deepEqual(result.record.runBudget.reserved.uids,p.budget.uids.slice(0,action==='level'?4:2));if(action==='level')assert.equal(f.state.pets.find(row=>row.uid===f.targets[2].uid).level,1);else assert.equal(f.room.petBreed.breedQ[2].finishTime,2400);assert.equal(createExecutionHistory({file:f.file}).unresolved(account),kind==='unknown');
});
for(const action of ['feed','level'])test('Pet prepared batch '+action+' rejects cumulative shortage without history or transport',async t=>{
 const f=await petBatchFixture(t,{action,count:24}),r=f.per[0];f.state.stock.set(r.id,r.num*24-1);await assert.rejects(f.service.preparePetGrowthSource(f.session,f.input),{code:'INVALID_PARAMETERS'});assert.equal(f.state.writes.length,0);assert.deepEqual(f.durable.list(account),[]);
});

for(const action of ['feed','level'])test('Pet prepared batch '+action+' rejects malformed targets and missing last exact authority without dispatch',async t=>{
 const f=await petBatchFixture(t,{action,count:24});let getters=0;const accessor={};Object.defineProperty(accessor,'action',{enumerable:true,get(){getters++;return action;}});
 const collision=action==='level'?{...f.targets[1],buildingId:f.targets[0].buildingId}:{...f.targets[1],buildingId:'2宠物培育室',jobIdx:0};
 for(const targets of [[],Array(1),[accessor],[f.targets[0],f.targets[0]],[f.targets[0],collision],[...f.targets,{...f.targets[0]}]])await assert.rejects(f.service.preparePetGrowthSource(f.session,{targets,maxDurationMs:60000}),{code:'INVALID_PARAMETERS'});
 assert.equal(getters,0);assert.equal(f.state.reads.length,0);if(action==='level'){f.state.buildings.find(row=>row.buildingId===f.targets.at(-1).buildingId).petServe.petUid='0';f.push();}else f.room.petBreed.breedQ.pop();
 await assert.rejects(f.service.preparePetGrowthSource(f.session,f.input),{code:'INVALID_PARAMETERS'});assert.equal(f.state.writes.length,0);assert.deepEqual(f.durable.list(account),[]);
});


async function petBatchHttp(f){
 await new Promise(resolve=>f.app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+f.app.server.address().port;
 const get=async(route,id=account)=>{const response=await fetch(base+route+(route.includes('?')?'&':'?')+'account='+encodeURIComponent(id),{headers:{connection:'close'}});return {status:response.status,data:await response.json()};};
 const info=await get('/api/gameplay?module=pet');assert.equal(info.status,200);const csrf=info.data.csrfToken;assert.ok(csrf);
 const post=async(route,body,{id=account,authorized=true}={})=>{const response=await fetch(base+route+'?account='+encodeURIComponent(id),{method:'POST',headers:{connection:'close',origin:base,'content-type':'application/json',...(authorized?{'x-cw-csrf':csrf}:{})},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 return {get,post};
}

for(const action of ['feed','level'])for(const outcome of ['success','unknown','refused'])
 test('Pet batch actual localhost HTTP '+action+' '+outcome+' uses original per-target authorization',{timeout:60000},async t=>{
 const f=await petBatchFixture(t,{action,count:2,http:'listen',stop:outcome==='success'?null:{index:1,kind:outcome}});
 const {get,post}=await petBatchHttp(f);
 const route='/api/gameplay/pet/growth/prepare';assert.equal((await post(route,f.input,{authorized:false})).status,403);
 const prepared=await post(route,f.input);assert.equal(prepared.status,200,JSON.stringify(prepared.data));
 assert.equal(prepared.data.accountId,account);assert.deepEqual(prepared.data.budget.resources,f.per.map(row=>({...row,num:row.num*2})));
 assert.equal(prepared.data.budget.uids.length,action==='level'?4:2);const graph=prepared.data.graph,actions=graph.nodes.filter(row=>row.type==='ACTION');
 assert.deepEqual(actions.map(row=>row.parameters),f.targets);
 const simulation=await post('/api/workflows/simulate',{graph});assert.equal(simulation.status,200);assert.equal(simulation.data.requestsSent,0);assert.equal(f.state.writes.length,0);
 assert.equal((await post('/api/workflows/start',{graph})).status,200);
 let runId;const count=outcome==='success'?2:1;
 for(let i=0;i<count;i++){
  let pending;for(let attempt=0;attempt<100;attempt++){pending=(await get('/api/workflows')).data.status;if(pending.status==='AWAITING_AUTHORIZATION')break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(pending.status,'AWAITING_AUTHORIZATION',JSON.stringify(pending));runId??=pending.runId;assert.equal(pending.runId,runId);assert.equal(pending.currentNode,actions[i].id);
  assert.equal(f.state.writes.length,i);const plan=pending.plan,authorization=await post('/api/operations/authorize',{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});
  assert.equal(authorization.status,200,JSON.stringify(authorization.data));assert.equal((await post('/api/operations/execute',authorization.data)).status,200);
  await f.service.settle(account);const record=f.durable.list(account)[0];
  assert.equal(record.finalStatus,outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED',record.stopReason);
  assert.equal(record.workflowId,runId);assert.equal(record.workflowNodeId,actions[i].id);
  assert.notEqual((await post('/api/operations/execute',authorization.data)).status,200);await post('/api/workflows/resume',{});
 }
 const final=(await get('/api/workflows')).data.status;assert.equal(final.status,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED',JSON.stringify(final));
 assert.equal(f.state.writes.length,count);assert.equal(f.durable.list(account).length,count);
 assert.equal(createExecutionHistory({file:f.file}).unresolved(account),outcome==='unknown');
 const budget=f.service.workflowBudget(account);assert.equal(budget.state,'CLOSED');assert.deepEqual(budget.limits,prepared.data.budget);
 assert.equal((await get('/api/workflows/history?workflowRunId='+runId,'other-account')).status,404);
 assert.deepEqual(f.counts(),{clients:0,collections:0});
});


for(const action of ['feed','level'])for(const outcome of ['success','unknown','refused'])
 test('Pet batch 24-target localhost HTTP '+action+' '+outcome+' at final target',{timeout:240000},async t=>{
 const f=await petBatchFixture(t,{action,count:24,http:'listen',stop:outcome==='success'?null:{index:24,kind:outcome}});
 const {get,post}=await petBatchHttp(f),input={...f.input,maxDurationMs:180000};
 const prepared=await post('/api/gameplay/pet/growth/prepare',input);assert.equal(prepared.status,200,JSON.stringify(prepared.data));
 assert.deepEqual(prepared.data.budget.resources,f.per.map(row=>({...row,num:row.num*24})));
 assert.equal(prepared.data.budget.uids.length,action==='level'?48:24);const graph=prepared.data.graph,actions=graph.nodes.filter(row=>row.type==='ACTION');
 assert.equal(actions.length,24);assert.equal(graph.nodes.filter(row=>row.type==='VERIFY').length,24);assert.deepEqual(actions.map(row=>row.parameters),f.targets);
 const simulation=await post('/api/workflows/simulate',{graph});assert.equal(simulation.data.requestsSent,0);assert.equal(f.state.writes.length,0);
 assert.equal((await post('/api/workflows/start',{graph})).status,200);let runId;
 for(let i=0;i<24;i++){
  let pending;for(let attempt=0;attempt<100;attempt++){pending=(await get('/api/workflows')).data.status;if(pending.status==='AWAITING_AUTHORIZATION')break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(pending.status,'AWAITING_AUTHORIZATION',JSON.stringify(pending));runId??=pending.runId;assert.equal(pending.runId,runId);assert.equal(pending.currentNode,actions[i].id);
  assert.equal(f.state.writes.length,i);const plan=pending.plan,authorization=await post('/api/operations/authorize',{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});
  assert.equal(authorization.status,200,JSON.stringify(authorization.data));assert.equal((await post('/api/operations/execute',authorization.data)).status,200);
  await f.service.settle(account);const record=f.durable.list(account)[0],result=i===23?(outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED'):'SUCCESS';
  assert.equal(record.finalStatus,result,record.stopReason);assert.equal(record.workflowId,runId);assert.equal(record.workflowNodeId,actions[i].id);
  assert.equal(f.state.writes[i].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');
  assert.notEqual((await post('/api/operations/execute',authorization.data)).status,200);await post('/api/workflows/resume',{});
 }
 const final=(await get('/api/workflows')).data.status;assert.equal(final.status,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED',JSON.stringify(final));
 assert.equal(f.state.writes.length,24);assert.equal(f.durable.list(account).length,24);
 for(const row of f.per)assert.equal(f.state.stock.get(row.id),outcome==='success'?0:row.num);
 assert.equal(createExecutionHistory({file:f.file}).unresolved(account),outcome==='unknown');
 const budget=f.service.workflowBudget(account);assert.equal(budget.state,'CLOSED');assert.equal(budget.resumable,false);
 assert.deepEqual(budget.limits,prepared.data.budget);assert.equal(budget.batches.length,24);
 assert.equal((await get('/api/workflows/history?workflowRunId='+runId,'other-account')).status,404);assert.deepEqual(f.counts(),{clients:0,collections:0});
});


for(const action of ['feed','level'])for(const phase of ['prepare','execute'])
 for(const change of ['account','player','world','generation','connection','client','disconnect','abort','config'])
 test('Pet batch localhost HTTP '+action+' '+phase+' rejects changed '+change+' before dispatch',{timeout:30000},async t=>{
 const f=await petBatchFixture(t,{action,count:2,http:'listen'}),{get,post}=await petBatchHttp(f),route='/api/gameplay/pet/growth/prepare';
 let permit;
 if(phase==='execute'){
  const prepared=await post(route,f.input);assert.equal(prepared.status,200,JSON.stringify(prepared.data));
  assert.equal((await post('/api/workflows/start',{graph:prepared.data.graph})).status,200);
  let pending;for(let attempt=0;attempt<100;attempt++){pending=(await get('/api/workflows')).data.status;if(pending.status==='AWAITING_AUTHORIZATION')break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(pending.status,'AWAITING_AUTHORIZATION',JSON.stringify(pending));const plan=pending.plan;
  permit=await post('/api/operations/authorize',{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});
  assert.equal(permit.status,200,JSON.stringify(permit.data));
 }
 const client=f.client;let hit=false;
 f.state.onRead=name=>{
  if(hit||name!=='AllPetRequest')return;hit=true;
  if(change==='account')client.factContext.accountId='other-account';
  if(change==='player')f.session.player.playerId='18';
  if(change==='world')f.session.player.worldId='10';
  if(change==='generation')client.factContext.generation=++f.session.generation;
  if(change==='connection')client.factContext.connectionId=f.session.connectionId='replaced';
  if(change==='client')f.session.client={...client};
  if(change==='disconnect'){if(action==='level')client.state='CLOSED';else client.connected=false;}
  if(change==='abort')f.session.abort.abort();
  if(change==='config'){if(action==='level')f.config.tables.PetLevelCfg.data[1].cost[1]++;else f.config.tables.PetParamCfg.data[0].paramValue++;}
 };
 try{
  if(phase==='prepare'){const reply=await post(route,f.input);assert.notEqual(reply.status,200,JSON.stringify(reply.data));assert.equal(f.durable.list(account).length,0);}
  else{const reply=await post('/api/operations/execute',permit.data);if(reply.status===200)await f.service.settle(account);
   assert.notEqual(f.service.status(account).finalStatus,'SUCCESS');assert.notEqual((await post('/api/operations/execute',permit.data)).status,200);}
  assert.equal(hit,true);assert.equal(f.state.writes.length,0);assert.equal(createExecutionHistory({file:f.file}).unresolved(account),false);
  assert.deepEqual(f.counts(),{clients:0,collections:0});
 }finally{f.session.client=client;}
});


for(const action of ['feed','level'])for(const {outcome,targetCount,failAt} of [
 ...['success','unknown'].map(outcome=>({outcome,targetCount:2,failAt:1})),
 ...['success','unknown','refused'].map(outcome=>({outcome,targetCount:24,failAt:24}))
])test('browser offline Pet batch '+action+' '+(targetCount===24?'24-target '+outcome+' at final target':outcome+' preserves explicit targets and stops safely'),{skip:!process.env.CW_TEST_BROWSER,timeout:targetCount===24?240000:60000},async t=>{
 const f=await petBatchFixture(t,{action,count:targetCount,http:'listen',stop:outcome==='success'?null:{index:failAt,kind:outcome}});
 const beforeBuildings=structuredClone(f.state.buildings),beforePets=structuredClone(f.state.pets);
 const observed=await f.service.surveyModule(f.session,'pet',{action});
 const targetById=new Map(observed.view.candidates.filter(row=>row.executable).map(row=>[row.actionId,row.parameters]));
 await new Promise(resolve=>f.app.server.listen(0,'127.0.0.1',resolve));
 await withOfflineBrowser(f.app,async({evaluate,waitFor})=>{
  const {graph,simulation,selectedIds}=await evaluate('('+(async({account,action,targetCount})=>{
   const find=selector=>document.querySelector(selector),wait=async(selector,accept=element=>element&&!element.disabled)=>{
    for(let i=0;i<150;i++){const element=find(selector);if(accept(element))return element;await new Promise(resolve=>setTimeout(resolve,100));}
    throw Error(selector+' '+find('#gp-pet-hint')?.textContent+' '+find('#wf-hint')?.textContent);
   };
   await wait('#account',element=>element?.value===account);
   (await wait('#tabs button[data-tab="heroes"]')).click();(await wait('#gp-pet-load')).click();
   const parameters=await wait('#gp-pet-parameters');parameters.value=JSON.stringify({action});parameters.dispatchEvent(new Event('input',{bubbles:true}));
   (await wait('#gp-pet-survey')).click();await wait('[data-growth-batch-target]',element=>element&&!element.disabled);
   const choices=Array.from(document.querySelectorAll('#gp-pet-facts [data-growth-batch-target]')).filter(element=>!element.disabled);
   if(choices.length!==targetCount||choices.some(element=>element.checked))throw Error('Expected '+targetCount+' unselected Pet targets');
   const selectedIds=choices.map(choice=>choice.dataset.growthBatchTarget);
   for(const choice of choices)choice.click();
   const duration=await wait('#gp-pet-facts [data-growth-batch-duration]');duration.value=targetCount===24?'180':'60';duration.dispatchEvent(new Event('input',{bubbles:true}));
   (await wait('#gp-pet-facts [data-growth-batch-prepare]')).click();
   const editor=await wait('#wf-json',element=>element?.value.includes('pet-growths-'));const graph=JSON.parse(editor.value);
   (await wait('#tabs button[data-tab="workflow"]')).click();(await wait('#wf-simulate')).click();
   const output=await wait('#wf-result',element=>element?.textContent.includes('"requestsSent"'));
   return {graph,simulation:JSON.parse(output.textContent),selectedIds};
  }).toString()+')('+JSON.stringify({account,action,targetCount})+')');
  assert.equal(new Set(selectedIds).size,targetCount);assert.ok(selectedIds.every(id=>targetById.has(id)));
  const orderedTargets=selectedIds.map(id=>targetById.get(id)),targetKey=row=>JSON.stringify([row.action,row.buildingId,row.uid??null,row.jobIdx??null]);
  assert.deepEqual(orderedTargets.map(targetKey).sort(),f.targets.map(targetKey).sort());
  const actions=graph.nodes.filter(row=>row.type==='ACTION');assert.deepEqual(actions.map(row=>row.parameters),orderedTargets);
  assert.equal(actions.length,targetCount);assert.equal(graph.nodes.filter(row=>row.type==='VERIFY').length,targetCount);
  assert.deepEqual(graph.budget.resources,f.per.map(row=>({...row,num:row.num*targetCount})));assert.equal(graph.budget.uids.length,targetCount*(action==='level'?2:1));
  assert.equal(graph.runPolicy.maxActions,targetCount);assert.equal(graph.runPolicy.maxDurationMs,targetCount===24?180000:60000);
  assert.equal(simulation.requestsSent,0);assert.equal(simulation.runtimeCreated,false);assert.equal(f.state.writes.length,0);assert.deepEqual(f.durable.list(account),[]);
  await waitFor(()=>evaluate("(() => {const button=document.getElementById('wf-start');if(!button||button.disabled)return false;button.click();return true;})()"),'start control');
  const count=outcome==='success'?targetCount:failAt,attempts=targetCount===24?300:100;
  for(let i=0;i<count;i++){
   assert.equal(f.state.writes.length,i);
   await waitFor(()=>evaluate(`(() => {const text=document.getElementById('wf-status').textContent,status=text?JSON.parse(text):{},button=document.getElementById('wf-authorize');
    if(status.currentNode!==${JSON.stringify(actions[i].id)}||status.status!=='AWAITING_AUTHORIZATION'||button.disabled)return false;button.click();return true;})()`),'authorization '+i,attempts).catch(async error=>{
     const page=await evaluate("({status:document.getElementById('wf-status').textContent,hint:document.getElementById('wf-hint').textContent})");
     throw Error(error.message+' '+JSON.stringify({page,writes:f.state.writes.length,history:f.durable.list(account).map(row=>row.finalStatus)}),{cause:error});
    });
   const expected=outcome!=='success'&&i+1===failAt?outcome==='unknown'?'UNKNOWN':'REJECTED':'SUCCESS';
   await waitFor(()=>{const record=f.durable.list(account)[0];return record?.workflowNodeId===actions[i].id&&record.finalStatus===expected;},'settlement '+i,attempts);
   assert.equal(f.state.writes[i].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');
   await waitFor(()=>evaluate(`(() => {const text=document.getElementById('wf-status').textContent,status=text?JSON.parse(text):{},button=document.getElementById('wf-resume');
    if(status.currentNode!==${JSON.stringify(actions[i].id)}||status.status!=='AWAITING_AUTHORIZATION'||button.disabled)return false;button.click();return true;})()`),'resume '+i,attempts);
  }
  const terminal=outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED';
  await waitFor(()=>evaluate(`(() => {const text=document.getElementById('wf-status').textContent;return text&&JSON.parse(text).status===${JSON.stringify(terminal)};})()`),'terminal '+terminal,attempts);
  assert.equal(await evaluate('globalThis.confirmations'),count);assert.equal(f.state.writes.length,count);assert.deepEqual(await evaluate('globalThis.pageErrors'),[]);
  assert.deepEqual(f.state.writes.map(row=>row.body),orderedTargets.slice(0,count).map(row=>action==='level'?{buildingId:row.buildingId}:{jobIdx:row.jobIdx}));
  const successful=outcome==='success'?targetCount:failAt-1;
  const appliedUids=new Set(orderedTargets.slice(0,successful).map(row=>row.uid)),appliedJobs=new Set(orderedTargets.slice(0,successful).map(row=>row.jobIdx));
  for(const row of f.per)assert.equal(f.state.stock.get(row.id),row.num*(targetCount-successful));
  assert.equal(f.state.stock.get('GOLD'),500);assert.equal(f.state.stock.get('其他'),1);
  assert.deepEqual(f.state.pets.find(row=>row.uid===f.originalPet.uid),f.originalPet);
  if(action==='level'){
   assert.deepEqual(f.state.buildings,beforeBuildings);
   assert.deepEqual(f.state.pets,beforePets.map(row=>appliedUids.has(row.uid)?{...row,level:2,baseAttrs:[{attr:1,value:120},{attr:2,value:24},{attr:3,value:34}]}:row));
  }else{
   assert.deepEqual(f.state.pets,beforePets);
   assert.deepEqual(f.state.buildings,beforeBuildings.map(row=>row.buildingId===f.room.buildingId?{...row,petBreed:{...row.petBreed,breedQ:row.petBreed.breedQ.map(job=>({...job,finishTime:job.finishTime-(appliedJobs.has(job.idx)?100:0)}))}}:row));
  }
  const records=f.durable.list(account);assert.equal(records.length,count);
  assert.deepEqual(records.slice().reverse().map(row=>row.finalStatus),Array.from({length:count},(_,i)=>outcome!=='success'&&i+1===failAt?outcome==='unknown'?'UNKNOWN':'REJECTED':'SUCCESS'));
  assert.deepEqual(records.slice().reverse().map(row=>row.workflowNodeId),actions.slice(0,count).map(row=>row.id));
  const reopened=createExecutionHistory({file:f.file});assert.equal(reopened.unresolved(account),outcome==='unknown');assert.deepEqual(reopened.list('other-account'),[]);
  const budget=f.service.workflowBudget(account);assert.equal(budget.state,'CLOSED');assert.equal(budget.resumable,false);assert.deepEqual(budget.limits,graph.budget);assert.equal(budget.batches.length,count);
  assert.deepEqual(budget.reserved.resources,f.per.map(row=>({...row,num:row.num*count})));assert.equal(budget.reserved.uids.length,count*(action==='level'?2:1));
  assert.deepEqual(f.counts(),{clients:0,collections:0});
 },{commandTimeoutMs:targetCount===24?45000:20000});
});

// Explicit mature-cohort claiming reuses the existing codec, fake transport,
// original Service/Workflow/History and parent budget. No live game or browser.
async function matureFixture(t,{outcome='success',http=false,shared=false}={}){
 const f=fixture(t,{http,shared});f.room.petBreed.maturePets=[{petId:'紫宠物2',star:0},{petId:'蓝宠物1',star:1},{petId:'紫宠物2',star:0}];
 const initial=await f.survey({parameters:{action:'claim'}}),parameters=pet.viewPet(initial,f.options({parameters:{action:'claim'}})).claimPreparation;
 assert.ok(parameters);const opts=()=>f.options({parameters});
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{wire(name,body);beforeDispatch();assert.equal(name,'GetMaturePetRequest');assert.deepEqual(body,{});const durable=f.file?f.durable.list(account)[0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')return {status:'REJECTED'};
  if(outcome!=='unknown'){for(const [i,row]of f.room.petBreed.maturePets.entries())f.state.pets.push({uid:String(BigInt(uid)+BigInt(i+1)),petId:row.petId,star:row.star,level:1,grade:i,baseAttrs:[{attr:1,value:100+i}],extAttrs:[]});f.room.petBreed.maturePets=[];}
  f.state.afterWrite?.();await f.state.onWatch?.();return {status:'UNKNOWN'};
 };
 const before=await pet.surveyPet(f.client,protocol,opts()),operation=pet.planPet(before,opts()).actions[0];assert.ok(operation);
 const run=(op=operation)=>{const scope={...f.client.factContext,runId:'pet-mature-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-mature-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget});};
 return {...f,parameters,before,operation,opts,run};
}

test('Pet mature claim binds complete duplicate cohort, new precise UIDs and zero inventory cost',async t=>{
 const f=await matureFixture(t);assert.equal(protocol.GetMaturePetResponse,undefined);assert.equal(f.operation.actionType,'CLAIM');assert.deepEqual(f.operation.action,{request:'GetMaturePetRequest',response:null,body:{}});assert.deepEqual(f.operation.costs,[]);assert.equal(f.operation.budgetClaims.uids[0].type,'pet-mature-batch');const old=structuredClone(f.state.pets),stock=[...f.state.stock];const result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.afterState.pets.length,3);assert.deepEqual(f.state.pets.slice(0,1),old);assert.equal(f.room.petBreed.maturePets.length,0);assert.deepEqual([...f.state.stock],stock);assert.equal(f.state.writes.length,1);assert.equal(pet.planPet(await pet.surveyPet(f.client,protocol,f.opts()),f.opts()).actions.length,0);
});

test('Pet mature claim rejects stale lists, ambiguous rooms, auto work and due jobs before dispatch',async t=>{
 for(const mode of ['cohort','pool','queue','room','auto','building','clock','due','hash','scope','config']){const f=await matureFixture(t);if(mode==='cohort')f.room.petBreed.maturePets.pop();if(mode==='pool')f.state.pets[0].level++;if(mode==='queue')f.job.finishTime++;if(mode==='room')f.state.buildings.push({...structuredClone(f.room),buildingId:'2宠物培育室'});if(mode==='auto')f.room.auto=true;if(mode==='building')f.room.buildFinishTime=900;if(mode==='clock')f.state.clock=false;if(mode==='due')f.state.now=2000;if(mode==='hash')f.operation.parameters.expectedMatureHash='f'.repeat(64);if(mode==='scope')f.session.player.worldId='10';if(mode==='config')f.config.tables.PetBaseCfg.data.pop();const r=await f.run();assert.equal(r.dispatched,false,mode+JSON.stringify(r));assert.equal(f.state.writes.length,0);}
 const f=await matureFixture(t);assert.equal(pet.planPet(structuredClone(f.before),f.opts()).actions.length,0);for(const p of [{...f.parameters,jobIdx:0},{...f.parameters,uid},{...parameters,expectedMatureHash:'a'.repeat(64)},{...f.parameters,expectedMatureHash:'bad'}])assert.throws(()=>pet.validatePetParameters(p));
});

test('Pet mature claim retains UNKNOWN for cohort, peer, inventory or natural maturity conflicts',async t=>{
 for(const mode of ['unknown','wrong-species','wrong-level','missing','extra','old-pet','queue','building','inventory','new-mature','due','rejected']){const f=await matureFixture(t,{outcome:mode==='unknown'||mode==='rejected'?mode:'success'});f.state.afterWrite=()=>{if(mode==='wrong-species')f.state.pets[1].petId='蓝宠物1';if(mode==='wrong-level')f.state.pets[1].level=2;if(mode==='missing')f.state.pets.pop();if(mode==='extra')f.state.pets.push({...structuredClone(f.state.pets[1]),uid:'99'});if(mode==='old-pet')f.state.pets[0].level++;if(mode==='queue')f.job.finishTime--;if(mode==='building')f.state.buildings[1].level++;if(mode==='inventory')f.state.stock.set('其他',2);if(mode==='new-mature')f.room.petBreed.maturePets.push({petId:'蓝宠物1',star:0});if(mode==='due')f.state.now=2000;};const r=await f.run();assert.equal(r.status,mode==='rejected'?'REJECTED':'UNKNOWN',mode+JSON.stringify(r));assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet mature claim original HTTP Tasks Workflow '+outcome+' preserves budget and durable uncertainty',async t=>{
 const f=await matureFixture(t,{http:true,outcome});await f.call('/api/gameplay?module=pet');const surveyed=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(surveyed.status,200);const row=surveyed.data.view.candidates.find(r=>r.executable);assert.ok(row);const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,authorized=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(authorized.status,200,JSON.stringify(authorized.data));assert.equal((await f.call('/api/operations/execute',{body:authorized.data})).status,200);await f.service.settle(account);const final=await runner.resume();assert.equal(final.status,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED');assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.writes[0].body,{});assert.equal(f.state.writes[0].durable.actions[0].requestStatus,'DISPATCHING');assert.equal(createExecutionHistory({file:f.file}).unresolved(account),outcome==='unknown');assert.deepEqual(f.service.workflowBudget(account).reserved.uids,f.operation.budgetClaims.uids);assert.equal(f.service.workflowBudget(account).state,'CLOSED');assert.deepEqual((await f.call('/api/operations/history',{id:'other-account'})).data.runs,[]);assert.deepEqual(f.counts(),{clients:0,collections:0});
});


async function breedFixture(t,{outcome='success',http=false,empty=false}={}){
 const f=ordinaryBreedFacts(t,{http});if(empty)f.room.petBreed.breedQ=[];
 const initial=await f.survey({parameters:{action:'breed'}}),choice=pet.viewPet(initial,f.options({parameters:{action:'breed'}})).breedPreparation[0];assert.ok(choice);const parameters=choice.parameters,opts=()=>f.options({parameters});
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{wire(name,body);beforeDispatch();assert.equal(name,'PetBreedRequest');assert.deepEqual(body,{petId:'蓝宠物1',universal:false});const durable=f.file?f.durable.list(account)[0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')return {status:'REJECTED'};if(outcome!=='unknown'){for(const c of choice.costs)f.state.stock.set(c.id,f.state.stock.get(c.id)-c.num);if(f.state.stock.get('宠物1蓝基因')===0)f.state.stock.delete('宠物1蓝基因');f.room.petBreed.breedQ.push({idx:empty?0:7,petId:'蓝宠物1',star:1,startTime:f.state.now,finishTime:f.state.now+14400,feedRequirements:[{type:0,id:'粗铁',num:7}]});}f.state.afterWrite?.();await f.state.onWatch?.();return {status:'UNKNOWN'};};
 const before=await pet.surveyPet(f.client,protocol,opts()),operation=pet.planPet(before,opts()).actions[0];assert.ok(operation,JSON.stringify(pet.viewPet(before,opts()).blocked));const run=(op=operation,extra={})=>{const scope={...f.client.factContext,runId:'pet-breed-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-breed-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget,...extra});};return {...f,parameters,before,operation,opts,run};
}

test('Pet ordinary breed creates exactly one observed job with original gene GOLD debits and no projected pet',async t=>{
 for(const empty of [false,true]){const f=await breedFixture(t,{empty});assert.equal(protocol.PetBreedResponse,undefined);assert.deepEqual(f.operation.costs,[{id:'宠物1蓝基因',num:80},{id:'GOLD',num:4000}]);assert.equal(f.operation.budgetClaims.uids[0].type,'pet-breed-batch');const pets=structuredClone(f.state.pets),mature=structuredClone(f.room.petBreed.maturePets),result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.afterState.job.idx,empty?0:7);assert.equal(result.afterState.job.star,1);assert.equal(result.afterState.job.finishTime-result.afterState.job.startTime,14400);assert.deepEqual(result.afterState.job.feedRequirements,[{type:0,id:'粗铁',num:7}]);assert.deepEqual(f.state.pets,pets);assert.deepEqual(f.room.petBreed.maturePets,mature);assert.equal(f.state.stock.has('宠物1蓝基因'),false);assert.equal(f.state.stock.get('GOLD'),0);assert.equal(f.state.writes.length,1);assert.equal(pet.planPet(await pet.surveyPet(f.client,protocol,f.opts()),f.opts()).actions.length,0);}
 const f=ordinaryBreedFacts(t);f.config.tables=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));f.room.petBreed.breedQ=[];const all=f.config.tables.PetBreedCfg.data,maxSeason=Math.max(...all.map(r=>r.season),...f.config.tables.PetSpeciesCfg.data.map(r=>r.season));f.session.player.worldId=String(maxSeason*1000000+1);for(const row of all)for(const [id,num]of row.cost)f.state.stock.set(id,Math.max(f.state.stock.get(id)??0,num));const facts=await f.survey({parameters:{action:'breed'}}),choices=pet.viewPet(facts,f.options({parameters:{action:'breed'}})).breedPreparation;assert.equal(choices.length,24);assert.deepEqual(choices.map(r=>r.parameters.petId).sort(),all.map(r=>r.petId).sort());for(const row of choices){const op=pet.planPet(facts,f.options({parameters:row.parameters})).actions[0],original=all.find(r=>r.petId===row.parameters.petId);assert.ok(op);assert.deepEqual(op.costs,original.cost.map(([id,num])=>({id,num})));assert.equal(op.expectedState.breedTime,original.breedTime);assert.equal(op.action.body.universal,false);assert.ok(op.configEvidence.PetSpeciesCfg);}

});

test('Pet ordinary breed requires frozen queue, source, capacity, season, finite parent and both owned materials',async t=>{
 for(const mode of ['queue','pool','auto','full','gene','gold','season','species','duration','clock','due','scope','hash','parent','last-clock']){const f=await breedFixture(t);if(mode==='queue')f.job.finishTime++;if(mode==='pool')f.state.pets[0].level++;if(mode==='auto')f.room.auto=true;if(mode==='full')f.room.level=1;if(mode==='gene')f.state.stock.set('宠物1蓝基因',79);if(mode==='gold')f.state.stock.set('GOLD',3999);if(mode==='season')f.config.tables.PetBreedCfg.data[0].season=2;if(mode==='species')f.config.tables.PetSpeciesCfg.data[0].season=2;if(mode==='duration')f.config.tables.PetBreedCfg.data[0].breedTime++;if(mode==='clock')f.state.clock=false;if(mode==='due')f.state.now=2000;if(mode==='scope')f.session.player.worldId='2000001';if(mode==='hash')f.operation.parameters.expectedBreedHash='f'.repeat(64);if(mode==='last-clock')f.state.onRead=n=>{if(n==='AllResourceRequest')f.state.clock=false;};let extra={};if(mode==='parent'){const scope={...f.client.factContext,runId:'no-breed-uid'},limits={resources:f.operation.costs,quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'bad',limits,ledger:null}};}const result=await f.run(f.operation,extra);assert.equal(result.dispatched,false,mode+JSON.stringify(result));assert.equal(f.state.writes.length,0);}
 for(const bad of [{action:'breed',petId:'蓝宠物1',expectedBreedHash:'bad'},{action:'breed',jobIdx:0},{action:'breed',uid},{action:'feed',petId:'蓝宠物1'},{action:'breed',universal:false}])assert.throws(()=>pet.validatePetParameters(bad));const valid={request:'PetBreedRequest',body:{petId:'蓝宠物1',universal:false},costs:[{id:'宠物1蓝基因',num:80},{id:'GOLD',num:4000}]};assert.doesNotThrow(()=>assertPaymentAllowed(valid));for(const bad of [{body:{petId:'蓝宠物1',universal:true}},{body:{petId:'蓝宠物1',universal:false,buildingId:parameters.buildingId}},{costs:[]},{costs:[{id:'宠物蓝色万能基因',num:80},{id:'GOLD',num:4000}]},{costs:[{id:'宠物1蓝基因',num:80},{id:'RUBY',num:4000}]}])assert.throws(()=>assertPaymentAllowed({...valid,...bad}));
});

test('Pet ordinary breed preserves UNKNOWN for wrong job, timing, costs or any non-target conflict',async t=>{
 for(const mode of ['unknown','wrong-pet','double','old-job','start','duration','due','gene','gold','pet','mature','building','inventory','rejected']){const f=await breedFixture(t,{outcome:['unknown','rejected'].includes(mode)?mode:'success'});f.state.afterWrite=()=>{const job=f.room.petBreed.breedQ.at(-1);if(mode==='wrong-pet')job.petId='紫宠物2';if(mode==='double')f.room.petBreed.breedQ.push({...structuredClone(job),idx:8});if(mode==='old-job')f.job.finishTime--;if(mode==='start')job.startTime--;if(mode==='duration')job.finishTime++;if(mode==='due')f.state.now=2000;if(mode==='gene')f.state.stock.set('宠物1蓝基因',1);if(mode==='gold')f.state.stock.set('GOLD',1);if(mode==='pet')f.state.pets[0].level++;if(mode==='mature')f.room.petBreed.maturePets=[];if(mode==='building')f.state.buildings[1].level++;if(mode==='inventory')f.state.stock.set('其他',2);};const r=await f.run();assert.equal(r.status,mode==='rejected'?'REJECTED':'UNKNOWN',mode+JSON.stringify(r));assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet ordinary breed original HTTP Tasks Workflow '+outcome+' binds costs queue budget and durable History',async t=>{
 const f=await breedFixture(t,{http:true,outcome});await f.call('/api/gameplay?module=pet');const read=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(read.status,200);const row=read.data.view.candidates.find(r=>r.executable);assert.ok(row);const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200,JSON.stringify(auth.data));assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);const final=await runner.resume();assert.equal(final.status,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED');assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0].durable.actions[0].requestStatus,'DISPATCHING');assert.equal(createExecutionHistory({file:f.file}).unresolved(account),outcome==='unknown');assert.deepEqual(f.service.workflowBudget(account).reserved,f.operation.budgetClaims);assert.equal(f.service.workflowBudget(account).state,'CLOSED');assert.deepEqual((await f.call('/api/operations/history',{id:'other-account'})).data.runs,[]);assert.deepEqual(f.counts(),{clients:0,collections:0});
});


async function geneFixture(t,{outcome='success',http=false,petId='蓝宠物1',actual=false}={}){
 const f=ordinaryBreedFacts(t,{http});if(actual){f.config.tables=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));f.session.player.worldId='5000001';}else{f.config.tables.PetBreedCfg.data[0].quality='BLUE';Object.assign(f.config.tables.ItemCfg.data.find(r=>r.id==='宠物1蓝基因'),{type:'宠物基因',quality:'BLUE'});f.config.tables.ItemCfg.data.push({id:'蓝宠基因自选包',type:'自选包',quality:'BLUE'});f.config.tables.SelectPackLibCfg={data:[{itemId:'蓝宠基因自选包',selectItemId:'宠物1蓝基因',type:'道具',num:1,season:1}]};}
 for(const id of ['蓝宠基因自选包','紫宠基因自选包','橙宠基因自选包','红宠基因自选包','橙宠基因自选包2','红宠基因自选包2'])f.state.stock.set(id,7);
 const parameters={action:'gene-exchange',petId,num:7},opts=()=>f.options({parameters}),before=await pet.surveyPet(f.client,protocol,opts()),view=pet.viewPet(before,opts()),route=view.genePreparation.find(r=>r.petId===petId),operation=pet.planPet(before,opts()).actions[0];assert.ok(operation,JSON.stringify(view.blocked));
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{wire(name,body);beforeDispatch();assert.equal(name,'PetFragExchangeRequest');assert.deepEqual(body,{fragItemId:route.targetId,num:7});const durable=f.file?f.durable.list(account)[0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')return {status:'REJECTED'};if(outcome!=='unknown'){f.state.stock.set(route.sourceId,f.state.stock.get(route.sourceId)-7);if(f.state.stock.get(route.sourceId)===0)f.state.stock.delete(route.sourceId);f.state.stock.set(route.targetId,(f.state.stock.get(route.targetId)??0)+7);}f.state.afterWrite?.();await f.state.onWatch?.();return {status:'UNKNOWN'};};
 const run=(op=operation,extra={})=>{const scope={...f.client.factContext,runId:'pet-gene-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-gene-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget,...extra});};return {...f,parameters,opts,before,view,route,operation,run};
}

test('Pet gene exchange fixed 18 routes preserve all six pack pools with exact 1:1 final-source debit',async t=>{
 const f=await geneFixture(t,{actual:true});assert.equal(protocol.PetFragExchangeResponse,undefined);assert.equal(f.view.genePreparation.length,18);assert.equal(new Set(f.view.genePreparation.map(r=>r.sourceId)).size,6);assert.ok(!f.view.genePreparation.some(r=>/^[蓝紫]宠物[4-6]$/.test(r.petId)));
 for(const route of f.view.genePreparation){const parameters={action:'gene-exchange',petId:route.petId,num:1},op=pet.planPet(f.before,f.options({parameters})).actions[0];assert.ok(op);assert.deepEqual(op.costs,[{id:route.sourceId,num:1}]);assert.deepEqual(op.action.body,{fragItemId:route.targetId,num:1});assert.ok(op.configEvidence.SelectPackLibCfg);}
 for(const petId of ['蓝宠物1','紫宠物2','橙宠物3','红宠物1','橙宠物4','红宠物6']){const g=await geneFixture(t,{actual:true,petId}),buildings=structuredClone(g.state.buildings),pets=structuredClone(g.state.pets),target=g.state.stock.get(g.route.targetId)??0,result=await g.run();assert.equal(result.status,'SUCCESS',petId+JSON.stringify(result));assert.equal(g.state.stock.has(g.route.sourceId),false);assert.equal(g.state.stock.get(g.route.targetId),target+7);assert.deepEqual(g.state.buildings,buildings);assert.deepEqual(g.state.pets,pets);assert.equal(g.state.writes.length,1);}
});

test('Pet gene exchange rejects unknown pool, season, config, source shortage and missing parent before transport',async t=>{
 for(const mode of ['stock','type','quality','row-quantity','duplicate-route','season','species','scope','source','parent','mixed']){const f=await geneFixture(t);if(mode==='stock')f.state.stock.set(f.route.sourceId,6);if(mode==='type')f.config.tables.ItemCfg.data.find(r=>r.id===f.route.sourceId).type='礼包';if(mode==='quality')f.config.tables.ItemCfg.data.find(r=>r.id===f.route.targetId).quality='RED';if(mode==='row-quantity')f.config.tables.SelectPackLibCfg.data[0].num=2;if(mode==='duplicate-route')f.config.tables.SelectPackLibCfg.data.push({...f.config.tables.SelectPackLibCfg.data[0]});if(mode==='season')f.config.tables.SelectPackLibCfg.data[0].season=2;if(mode==='species')f.config.tables.PetBreedCfg.data[0].spId=4;if(mode==='scope')f.session.player.worldId='2000001';if(mode==='source')f.state.onResponse=(n,v)=>n==='AllItemRequest'?{items:[]}:v;if(mode==='mixed')f.operation.parameters.buildingId='1宠物培育室';let extra={};if(mode==='parent'){const scope={...f.client.factContext,runId:'missing-gene-parent'},limits={resources:f.operation.costs,quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'bad',limits,ledger:null}};}const r=await f.run(f.operation,extra);assert.equal(r.dispatched,false,mode+JSON.stringify(r));assert.equal(f.state.writes.length,0);}
 const f=await geneFixture(t);assert.equal(pet.planPet(structuredClone(f.before),f.opts()).actions.length,0);for(const p of [{action:'gene-exchange',petId:'蓝宠物1',num:0},{action:'gene-exchange',petId:'蓝宠物1',num:'7'},{action:'gene-exchange',petId:'蓝宠物1',num:1,jobIdx:0},{action:'breed',num:1},{action:'feed',petId:'蓝宠物1'}])assert.throws(()=>pet.validatePetParameters(p));const good={request:'PetFragExchangeRequest',body:{fragItemId:'宠物1蓝基因',num:7},costs:[{id:'蓝宠基因自选包',num:7}]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const extra of [{costs:[{id:'橙宠基因自选包',num:7}]},{costs:[{id:'蓝宠基因自选包',num:6}]},{body:{fragItemId:'宠物4蓝基因',num:7}},{body:{...good.body,universal:false}},{costs:[]}])assert.throws(()=>assertPaymentAllowed({...good,...extra}));
});

test('Pet gene exchange preserves UNKNOWN on no effect or any wrong debit credit and pet world drift',async t=>{
 for(const mode of ['unknown','debit','credit','other-stock','pet','building','queue','mature','rejected']){const f=await geneFixture(t,{outcome:['unknown','rejected'].includes(mode)?mode:'success'});f.state.afterWrite=()=>{if(mode==='debit')f.state.stock.set(f.route.sourceId,1);if(mode==='credit')f.state.stock.set(f.route.targetId,86);if(mode==='other-stock')f.state.stock.set('其他',2);if(mode==='pet')f.state.pets[0].level++;if(mode==='building')f.state.buildings[1].level++;if(mode==='queue')f.job.finishTime++;if(mode==='mature')f.room.petBreed.maturePets=[];};const result=await f.run();assert.equal(result.status,mode==='rejected'?'REJECTED':'UNKNOWN',mode+JSON.stringify(result));assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet gene exchange original HTTP Tasks Workflow '+outcome+' retains exact parent and durable outcome',async t=>{
 const f=await geneFixture(t,{http:true,outcome});await f.call('/api/gameplay?module=pet');const read=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(read.status,200);const row=read.data.view.candidates.find(r=>r.executable);assert.ok(row);const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);const final=await runner.resume();assert.equal(final.status,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED');assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0].durable.actions[0].requestStatus,'DISPATCHING');assert.deepEqual(f.service.workflowBudget(account).reserved,f.operation.budgetClaims);assert.equal(f.service.workflowBudget(account).state,'CLOSED');assert.equal(createExecutionHistory({file:f.file}).unresolved(account),outcome==='unknown');assert.deepEqual((await f.call('/api/operations/history',{id:'other-account'})).data.runs,[]);assert.deepEqual(f.counts(),{clients:0,collections:0});
});


async function stopAutoFixture(t,{outcome='success',http=false,vip=8}={}){
 const f=fixture(t,{level:true,http,vipLevel:vip});await f.ready;f.config.tables.VipEffectCfg={data:[{effectId:'宠物自动培育',type:'数值'}]};f.config.tables.VipLevelCfg={data:[{level:7,effects:[]},{level:8,effects:[['宠物自动培育',1]]}]};f.room.auto=true;const now=Math.floor(Date.now()/1000);for(const job of f.room.petBreed.breedQ){job.startTime=now-100;job.finishTime=now+1000+job.idx;}
 const initial=await f.survey({parameters:{action:'stop-auto'}}),parameters=pet.viewPet(initial,f.options({parameters:{action:'stop-auto'}})).stopAutoPreparation;if(vip!==8)return {...f,initial};assert.ok(parameters,JSON.stringify(initial.autoWorkSource));const opts=()=>f.options({parameters}),before=await pet.surveyPet(f.client,protocol,opts()),operation=pet.planPet(before,opts()).actions[0];assert.ok(operation);
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{wire(name,body);beforeDispatch();assert.equal(name,'SetBuildingAutoWorkRequest');assert.deepEqual(body,{buildingId:'1宠物培育室',isOn:false});const durable=f.file?JSON.parse(fs.readFileSync(f.file,'utf8')).accounts[account][0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')return {status:'REJECTED'};if(outcome!=='unknown')f.room.auto=false;f.state.afterWrite?.();await f.state.onWatch?.();return {status:'UNKNOWN'};};
 const run=(op=operation,extra={})=>{const scope={...f.client.factContext,runId:'pet-stop-auto'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'stop-auto-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget,...extra});};return {...f,parameters,opts,before,operation,run};
}

test('Pet stop auto requires private current VIP effect and confirms only true to false with queues and inventory unchanged',async t=>{
 const f=await stopAutoFixture(t),room=structuredClone(f.room),pets=structuredClone(f.state.pets),stock=[...f.state.stock];assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'pet-auto-work',id:'1宠物培育室'}]});assert.equal(protocol.SetBuildingAutoWorkResponse,undefined);const result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.deepEqual(f.room,{...room,auto:false});assert.deepEqual(f.state.pets,pets);assert.deepEqual([...f.state.stock],stock);assert.equal(f.state.writes.length,1);assert.equal(pet.planPet(await pet.surveyPet(f.client,protocol,f.opts()),f.opts()).actions.length,0);
 const low=await stopAutoFixture(t,{vip:7});assert.equal(pet.viewPet(low.initial,low.options({parameters:{action:'stop-auto'}})).stopAutoPreparation,null);const no=fixture(t);no.room.auto=true;no.client.readVipLevel=()=>({reliable:true,vipLevel:99});const facts=await no.survey({parameters:{action:'stop-auto'}});assert.equal(pet.viewPet(facts,no.options({parameters:{action:'stop-auto'}})).stopAutoPreparation,null);
});

test('Pet stop auto blocks changed VIP stream, queue, scope, automation, config and absent parent at dispatch',async t=>{
 for(const mode of ['vip','queue','scope','already-off','config','parent','clock']){const f=await stopAutoFixture(t);if(mode==='vip')f.push('SCVipUpdate',{vipLevel:7});if(mode==='queue')f.job.finishTime++;if(mode==='scope')f.session.player.worldId='10';if(mode==='already-off')f.room.auto=false;if(mode==='config')f.config.tables.VipLevelCfg.data[1].effects[0][1]=0;if(mode==='clock')f.client.gameClock.read=()=>({status:'UNKNOWN',reliable:false});let extra={};if(mode==='parent'){const scope={...f.client.factContext,runId:'missing-pet-auto'},limits={resources:[],quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'bad',limits,ledger:null}};}const result=await f.run(f.operation,extra);assert.equal(result.dispatched,false,mode+JSON.stringify(result));assert.equal(f.state.writes.length,0);}
 const good={request:'SetBuildingAutoWorkRequest',body:{buildingId:'1宠物培育室',isOn:false},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const extra of [{body:{buildingId:'1宠物培育室',isOn:true}},{body:{buildingId:'1食品厂',isOn:false}},{costs:undefined},{costs:[{id:'GOLD',num:1}]}])assert.throws(()=>assertPaymentAllowed({...good,...extra}));
});

test('Pet stop auto preserves UNKNOWN for no effect or queue pet inventory change and original refusal',async t=>{
 for(const mode of ['unknown','queue','pet','stock','mature','rejected']){const f=await stopAutoFixture(t,{outcome:['unknown','rejected'].includes(mode)?mode:'success'});f.state.afterWrite=()=>{if(mode==='queue')f.job.finishTime--;if(mode==='pet')f.state.pets[0].level++;if(mode==='stock')f.state.stock.set('其他',2);if(mode==='mature')f.room.petBreed.maturePets=[];};const r=await f.run();assert.equal(r.status,mode==='rejected'?'REJECTED':'UNKNOWN',mode+JSON.stringify(r));assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet stop auto original HTTP Tasks Workflow '+outcome+' retains private eligibility parent and History',async t=>{
 const f=await stopAutoFixture(t,{http:true,outcome});await f.call('/api/gameplay?module=pet');const read=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(read.status,200);const row=read.data.view.candidates.find(r=>r.executable);assert.ok(row);const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);const final=await runner.resume();assert.equal(final.status,outcome==='success'?'COMPLETED':outcome==='unknown'?'UNKNOWN':'FAILED');assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0].durable.actions[0].requestStatus,'DISPATCHING');assert.deepEqual(f.service.workflowBudget(account).reserved,f.operation.budgetClaims);assert.equal(f.service.workflowBudget(account).state,'CLOSED');assert.equal(createExecutionHistory({file:f.file}).unresolved(account),outcome==='unknown');assert.deepEqual(f.counts(),{clients:0,collections:0});
});


async function starFixture(t,{outcome='success',http=false,spId=1,star=0,preview}={}){
 const f=fixture(t,{level:true,http});await f.ready;const retained=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));
 for(const key of ['PetStarCfg','PetBreedCfg','PetBaseCfg'])f.config.tables[key]=structuredClone(retained[key]);
 f.config.tables.ItemCfg.data.push(...Array.from({length:6},(_,i)=>({id:'宠物'+(i+1)+'升星石'})));for(let i=1;i<=6;i++)f.state.stock.set('宠物'+i+'升星石',100);f.state.stock.set('宠物经验',1000000000);
 Object.assign(f.state.pets[0],{petId:'红宠物'+spId,star,profFeed:[],rerollAttrs:[]});
 f.state.previewOverride=preview;f.state.preview=()=>{const next={...structuredClone(f.state.pets[0]),star:f.state.pets[0].star+1,baseAttrs:f.state.pets[0].baseAttrs.map(a=>({...a,value:a.value+100}))};return f.state.previewOverride?f.state.previewOverride(next):next;};
 const read=f.client.request.bind(f.client);f.client.request=async(name,body,response,timeout,opts)=>{if(name!=='PetPreviewStarUpRequest')return read(name,body,response,timeout,opts);assert.deepEqual(body,{buildingId:'1宠物'});f.state.reads.push(name);await f.state.onRead?.(name);return wire(response,{pet:f.state.preview()});};
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{beforeDispatch();assert.equal(name,'PetStarUpRequest');assert.deepEqual(toSnapshotJson(wire(name,body)),{buildingId:'1宠物'});const durable=f.file?JSON.parse(fs.readFileSync(f.file,'utf8')).accounts[account][0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')throw Object.assign(Error('synthetic Pet star refusal'),{code:'REJECTED'});
  if(outcome==='success'){const pet=f.state.pets[0],breed=f.config.tables.PetBreedCfg.data.find(r=>r.petId===pet.petId),row=f.config.tables.PetStarCfg.data.find(r=>r.spId===breed.spId&&r.star===pet.star+1);for(const [id,num]of row.cost)f.state.stock.set(id,f.state.stock.get(id)-num);f.state.pets[0]=f.state.preview();f.push();}f.state.afterWrite?.();return {status:'UNKNOWN'};};
 const parameters={action:'star',buildingId:'1宠物',uid},opts=()=>f.options({parameters}),before=await pet.surveyPet(f.client,protocol,opts()),operation=pet.planPet(before,opts()).actions[0];
 const run=(op=operation,extra={})=>{const scope={...f.client.factContext,runId:'pet-star-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-star-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget,...extra});};
 return {...f,parameters,opts,before,operation,run};
}

test('Pet STAR supports all thirty fixed red species next-star costs, typed complete preview and fifth-star boundary',async t=>{
 for(let spId=1;spId<=6;spId++)for(let star=0;star<5;star++){const f=await starFixture(t,{spId,star});assert.ok(f.operation,JSON.stringify(pet.viewPet(f.before,f.opts()).blocked));const row=f.config.tables.PetStarCfg.data.find(r=>r.spId===spId&&r.star===star+1);assert.deepEqual(f.operation.costs,row.cost.map(([id,num])=>({id,num})).sort((a,b)=>a.id.localeCompare(b.id)));assert.deepEqual(f.operation.action,{request:'PetStarUpRequest',response:null,body:{buildingId:'1宠物'}});assert.deepEqual(f.operation.expectedState.pet,f.state.preview());if(spId===1||spId===6&&star===4){const buildings=structuredClone(f.state.buildings),result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.deepEqual(f.state.buildings,buildings);assert.equal(f.state.pets[0].star,star+1);}}
 const capped=await starFixture(t,{star:5});assert.equal(capped.operation,undefined);assert.equal(capped.state.reads.includes('PetPreviewStarUpRequest'),false);assert.equal(protocol.PetStarUpResponse,undefined);
});

test('Pet STAR rejects wrong preview, absent authority, target or revision drift, unknown cost and missing parent before dispatch',async t=>{
 for(const change of [p=>({...p,uid:'18'}),p=>({...p,star:p.star+1}),p=>({...p,level:p.level+1}),p=>({...p,grade:1}),p=>{delete p.baseAttrs;return p;}]){const f=await starFixture(t,{preview:change});assert.equal(Boolean(f.operation),false);assert.equal(f.state.writes.length,0);}
 for(const mode of ['stock','species','cost','uid','duplicate','connection','revision','late-revision','parent','forged']){const f=await starFixture(t);if(mode==='stock')f.state.stock.set('宠物经验',0);if(mode==='species')f.config.tables.PetBreedCfg.data.find(r=>r.petId==='红宠物1').quality='ORANGE';if(mode==='cost')f.config.tables.PetStarCfg.data[0].cost[0][1]++;if(mode==='uid')f.state.buildings.at(-1).petServe.petUid='18';if(mode==='duplicate')f.state.buildings.push({...structuredClone(f.state.buildings.at(-1)),buildingId:'2宠物'});if(mode==='connection')f.client.factContext.connectionId='changed';if(mode==='revision')f.push();if(mode==='forged'){assert.equal(pet.planPet(structuredClone(f.before),f.opts()).actions.length,0);continue;}let extra=mode==='late-revision'?{onStage:stage=>{if(stage==='DISPATCH_INTENT')f.push();}}:{};if(mode==='parent'){const scope={...f.client.factContext,runId:'absent-star-parent'},limits={resources:f.operation.costs,quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'missing-star',limits,ledger:null}};}const result=await f.run(f.operation,extra);assert.equal(result.dispatched,false,mode+JSON.stringify(result));assert.equal(f.state.writes.length,0);}
 const good={request:'PetStarUpRequest',body:{buildingId:'1宠物'},costs:[{id:'宠物1升星石',num:1},{id:'宠物经验',num:2500000}]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const extra of [{body:{...good.body,universal:false}},{costs:[]},{costs:[{id:'宠物1升星石',num:1}]},{costs:[{id:'GOLD',num:1},{id:'宠物经验',num:2}]}])assert.throws(()=>assertPaymentAllowed({...good,...extra}));for(const p of [{action:'star',uid,jobIdx:0},{action:'star',uid,num:1},{action:'star',uid,petId:'红宠物1'}])assert.throws(()=>pet.validatePetParameters(p));
});

test('Pet STAR preserves UNKNOWN for no effect, wrong exact preview or any peer building and inventory conflict',async t=>{
 for(const mode of ['unknown','star','attrs','building','stock','level']){const f=await starFixture(t,{outcome:mode==='unknown'?'unknown':'success'});f.state.afterWrite=()=>{if(mode==='star')f.state.pets[0].star++;if(mode==='attrs')f.state.pets[0].baseAttrs[0].value++;if(mode==='building')f.state.buildings[1].level++;if(mode==='stock')f.state.stock.set('其他',2);if(mode==='level')f.state.pets[0].level++;};const result=await f.run();assert.equal(result.status,'UNKNOWN',mode+JSON.stringify(result));assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet STAR original HTTP Tasks Workflow '+outcome+' preserves finite materials, UID and durable original outcome',async t=>{
 const f=await starFixture(t,{http:true,outcome});assert.ok(f.operation);await f.call('/api/gameplay?module=pet');const surveyed=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(surveyed.status,200);const row=surveyed.data.view.candidates.find(r=>r.executable);assert.ok(row);if(outcome==='success'){const growth=await f.call('/api/gameplay/pet/growth/prepare',{body:{targets:[f.parameters],maxDurationMs:60000}});assert.equal(growth.status,200,JSON.stringify(growth.data));assert.deepEqual(growth.data.steps[0].parameters,f.parameters);assert.deepEqual(growth.data.graph.budget,f.operation.budgetClaims);assert.equal(f.state.writes.length,0);}const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);const record=f.durable.list(account)[0],expected=outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED';assert.equal(record.finalStatus,expected,JSON.stringify(record));assert.equal(f.state.writes.length,1);assert.equal(f.state.writes[0].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(record.runBudget.reserved.resources,f.operation.costs);assert.deepEqual(record.runBudget.reserved.uids,f.operation.budgetClaims.uids);assert.equal((await runner.resume()).status,outcome==='success'?'COMPLETED':outcome==='rejected'?'FAILED':'UNKNOWN');assert.deepEqual(f.counts(),{clients:0,collections:0});if(outcome==='unknown')assert.equal((await f.call('/api/operations/plan',{body:{module:'pet',mode:'Manual',parameters:f.parameters,selections:[row.actionId]}})).status,409);
});


async function servingFeedFixture(t,{outcome='success',http=false,grade=0,last=false}={}){
 const f=fixture(t,{level:true,http});await f.ready;const retained=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));
 for(const key of ['PetFeedAttrCfg','PetAdvancedCfg'])f.config.tables[key]=structuredClone(retained[key]);
 const serving=f.state.buildings.at(-1),costs=[{id:'粗铁',num:4},{id:'鱼肠线',num:12}].sort((a,b)=>a.id.localeCompare(b.id));serving.petServe.upgradeRequirements=[{type:0,id:'粗铁',num:4},{type:0,id:'鱼肠线',num:12}];f.state.pets[0].grade=grade;f.state.pets[0].profFeed=[];
 const cfg=f.config.tables.PetFeedAttrCfg.data.filter(r=>r.level===grade);
 if(last)f.state.pets[0].profFeed=cfg.map(r=>({heroProf:r.job,attrFeed:r.attrCounts.map((times,i)=>({attr:i+1,times:times-(r.job==='法师'&&i===2?1:0),value:(times-(r.job==='法师'&&i===2?1:0))*r.baseAttrs[i]}))}));
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{beforeDispatch();assert.equal(name,'PetUpgradeFeedRequest');assert.deepEqual(toSnapshotJson(wire(name,body)),{buildingId:'1宠物'});const durable=f.file?JSON.parse(fs.readFileSync(f.file,'utf8')).accounts[account][0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')throw Object.assign(Error('synthetic serving material feed refusal'),{code:'REJECTED'});
  if(outcome==='success'){for(const c of costs)f.state.stock.set(c.id,f.state.stock.get(c.id)-c.num);const pet=f.state.pets[0];let row=pet.profFeed.find(r=>r.heroProf==='法师');if(!row){row={heroProf:'法师',attrFeed:[1,2,3].map(attr=>({attr,times:0,value:0}))};pet.profFeed.push(row);}row.attrFeed[2].times++;row.attrFeed[2].value+=cfg.find(r=>r.job==='法师').baseAttrs[2];serving.petServe.upgradeRequirements=[{type:0,id:'粗铁',num:7}];f.push();}f.state.afterWrite?.();return {status:'UNKNOWN'};};
 const parameters={action:'serve-feed',buildingId:'1宠物',uid},opts=()=>f.options({parameters}),before=await pet.surveyPet(f.client,protocol,opts()),operation=pet.planPet(before,opts()).actions[0];
 const run=(op=operation,extra={})=>{const scope={...f.client.factContext,runId:'pet-serving-feed-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-serving-feed-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget,...extra});};return {...f,parameters,opts,before,operation,run,serving,costs};
}

test('Pet SERVE-FEED accepts all fixed grade caps and observes bounded server progress with exact current materials',async t=>{
 for(let grade=0;grade<=20;grade++){const f=await servingFeedFixture(t,{grade});assert.ok(f.operation,JSON.stringify(pet.viewPet(f.before,f.opts()).blocked));assert.deepEqual(f.operation.costs,f.costs);assert.equal(f.operation.target.capacity,f.config.tables.PetFeedAttrCfg.data.filter(r=>r.level===grade).reduce((n,r)=>n+r.attrCounts.reduce((a,b)=>a+b,0),0));if(grade===0||grade===20){const level=f.state.pets[0].level,attrs=structuredClone(f.state.pets[0].baseAttrs),result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(f.state.pets[0].grade,grade);assert.equal(f.state.pets[0].level,level);assert.deepEqual(f.state.pets[0].baseAttrs,attrs);}}
 const last=await servingFeedFixture(t,{last:true});assert.equal((await last.run()).status,'SUCCESS');assert.equal(pet.planPet(await pet.surveyPet(last.client,protocol,last.opts()),last.opts()).actions.length,0);assert.equal(protocol.PetUpgradeFeedResponse,undefined);
});

test('Pet SERVE-FEED blocks invalid caps, current requirements, ownership, private revision, mixed input and absent parent',async t=>{
 for(const mode of ['stock','cost','grade','caps','full','uid','duplicate','connection','revision','late-revision','late-building','parent','forged']){const f=await servingFeedFixture(t);assert.ok(f.operation);if(mode==='stock')f.state.stock.set('粗铁',0);if(mode==='cost')f.serving.petServe.upgradeRequirements[0].num++;if(mode==='grade')delete f.state.pets[0].grade;if(mode==='caps')f.config.tables.PetFeedAttrCfg.data[0].attrCounts[0]++;if(mode==='full')f.state.pets[0].profFeed=f.config.tables.PetFeedAttrCfg.data.filter(r=>r.level===0).map(r=>({heroProf:r.job,attrFeed:r.attrCounts.map((times,i)=>({attr:i+1,times,value:times}))}));if(mode==='uid')f.serving.petServe.petUid='18';if(mode==='duplicate')f.state.buildings.push({...structuredClone(f.serving),buildingId:'2宠物'});if(mode==='connection')f.client.factContext.connectionId='different';if(mode==='revision')f.push();if(mode==='forged'){assert.equal(pet.planPet(structuredClone(f.before),f.opts()).actions.length,0);continue;}let extra=['late-revision','late-building'].includes(mode)?{onStage:stage=>{if(stage==='DISPATCH_INTENT'){if(mode==='late-building')f.push('SCUpdateWaterBuilding',{building:f.serving});else f.push();}}}:{};if(mode==='parent'){const scope={...f.client.factContext,runId:'missing-serving-feed'},limits={resources:f.costs,quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'missing-feed',limits,ledger:null}};}const result=await f.run(f.operation,extra);assert.equal(result.dispatched,false,mode+JSON.stringify(result));assert.equal(f.state.writes.length,0);}
 const good={request:'PetUpgradeFeedRequest',body:{buildingId:'1宠物'},costs:[{id:'粗铁',num:4}]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const extra of [{body:{...good.body,uid}},{body:{...good.body,universal:false}},{costs:[]},{costs:[{id:'RUBY',num:1}]}])assert.throws(()=>assertPaymentAllowed({...good,...extra}));for(const p of [{action:'serve-feed',uid,jobIdx:0},{action:'serve-feed',uid,num:1},{action:'serve-feed',uid,petId:'蓝宠物1'}])assert.throws(()=>pet.validatePetParameters(p));
});

test('Pet SERVE-FEED preserves UNKNOWN for no progress, cap overflow, altered grade or any collateral state and inventory',async t=>{
 for(const mode of ['unknown','counter','value','grade','level','peer','stock','building']){const f=await servingFeedFixture(t,{outcome:mode==='unknown'?'unknown':'success'});f.state.afterWrite=()=>{if(mode==='counter')f.state.pets[0].profFeed[0].attrFeed[2].times=100000;if(mode==='value')f.state.pets[0].profFeed[0].attrFeed[2].value=0;if(mode==='grade')f.state.pets[0].grade++;if(mode==='level')f.state.pets[0].level++;if(mode==='peer')f.state.buildings[1].level++;if(mode==='stock')f.state.stock.set('其他',2);if(mode==='building')f.serving.petServe.petUid='18';};const result=await f.run();assert.equal(result.status,'UNKNOWN',mode+JSON.stringify(result));assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet SERVE-FEED original HTTP Tasks Workflow '+outcome+' binds current material and serving UID budget',async t=>{
 const f=await servingFeedFixture(t,{http:true,outcome});await f.call('/api/gameplay?module=pet');const surveyed=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(surveyed.status,200);const row=surveyed.data.view.candidates.find(r=>r.executable);assert.ok(row);if(outcome==='success'){const growth=await f.call('/api/gameplay/pet/growth/prepare',{body:{targets:[f.parameters],maxDurationMs:60000}});assert.equal(growth.status,200,JSON.stringify(growth.data));assert.deepEqual(growth.data.graph.budget,f.operation.budgetClaims);}const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);const record=f.durable.list(account)[0],expected=outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED';assert.equal(record.finalStatus,expected,JSON.stringify(record));assert.equal(f.state.writes[0].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(record.runBudget.reserved.resources,f.operation.costs);assert.deepEqual(record.runBudget.reserved.uids,f.operation.budgetClaims.uids);assert.equal((await runner.resume()).status,outcome==='success'?'COMPLETED':outcome==='rejected'?'FAILED':'UNKNOWN');assert.deepEqual(f.counts(),{clients:0,collections:0});if(outcome==='unknown')assert.equal((await f.call('/api/operations/plan',{body:{module:'pet',mode:'Manual',parameters:f.parameters,selections:[row.actionId]}})).status,409);assert.equal(f.state.writes.length,1);
});


async function attributeFixture(t,{action='switch-attrs',fromIdx=1,outcome='success',http=false}={}){
 const f=fixture(t,{level:true,http});await f.ready;const retained=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));for(const key of ['PetBreedCfg','PetRerollCfg','PetBaseCfg'])f.config.tables[key]=structuredClone(retained[key]);
 const ext=(attr,value)=>({attrValue:{attr,value,rating:3},heroProf:'法师',heroCamp:''});Object.assign(f.state.pets[0],{petId:'红宠物1',star:2,profFeed:[],extAttrIdx:fromIdx,extAttrs:[ext(1,100)],extAttrs2:[ext(2,0.12)],rerollAttrs:action==='switch-attrs'?[]:[ext(3,0.25),ext(4,12)]});
 const parameters={action,buildingId:'1宠物',uid,...(action==='switch-attrs'?{extIdx:fromIdx===1?2:1}:{})},opts=()=>f.options({parameters});
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{beforeDispatch();assert.equal(name,action==='switch-attrs'?'PetSwitchExtAttrRequest':'SavePetRerollRequest');assert.deepEqual(toSnapshotJson(wire(name,body)),{buildingId:parameters.buildingId,...(action==='switch-attrs'?{extIdx:parameters.extIdx}:{saveOrNot:action==='save-reroll'})});const durable=f.file?JSON.parse(fs.readFileSync(f.file,'utf8')).accounts[account][0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')throw Object.assign(Error('synthetic Pet attribute refusal'),{code:'REJECTED'});
  if(outcome==='success'){const pet=f.state.pets[0];if(action==='switch-attrs')pet.extAttrIdx=body.extIdx;else{if(body.saveOrNot)pet[pet.extAttrIdx===1?'extAttrs':'extAttrs2']=structuredClone(pet.rerollAttrs);pet.rerollAttrs=[];}f.push();}f.state.afterWrite?.();return {status:'UNKNOWN'};};
 const before=await pet.surveyPet(f.client,protocol,opts()),operation=pet.planPet(before,opts()).actions[0],run=(op=operation,extra={})=>{const scope={...f.client.factContext,runId:'pet-attribute-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-attribute-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget,...extra});};return {...f,parameters,opts,before,operation,run};
}

test('Pet ATTRIBUTES switches existing groups both ways and saves or discards exact current result in either active group',async t=>{
 for(const action of ['switch-attrs','save-reroll','discard-reroll'])for(const fromIdx of [1,2]){const f=await attributeFixture(t,{action,fromIdx});assert.ok(f.operation,JSON.stringify(pet.viewPet(f.before,f.opts()).blocked));const buildings=structuredClone(f.state.buildings),stock=[...f.state.stock],expected=structuredClone(f.operation.expectedState.pet);assert.deepEqual(f.operation.costs,[]);assert.deepEqual(f.operation.budgetClaims,{resources:[],quotas:[],uids:[{type:'pet',id:uid},{type:'pet-serving-building',id:'1宠物'}]});const result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.deepEqual(f.state.pets[0],expected);assert.deepEqual(f.state.buildings,buildings);assert.deepEqual([...f.state.stock],stock);assert.equal(f.state.writes.length,1);assert.equal(pet.planPet(await pet.surveyPet(f.client,protocol,f.opts()),f.opts()).actions.length,0);}
 for(const action of ['save-reroll','discard-reroll']){const f=await attributeFixture(t,{action});Object.assign(f.state.pets[0],{petId:'橙宠物1',star:0,extAttrs2:[]});const facts=await pet.surveyPet(f.client,protocol,f.opts()),op=pet.planPet(facts,f.opts()).actions[0];assert.ok(op);assert.equal((await f.run(op)).status,'SUCCESS');}
 for(const n of ['PetSwitchExtAttrResponse','SavePetRerollResponse'])assert.equal(protocol[n],undefined);
});

test('Pet ATTRIBUTES blocks second-group gates, initialization, pending result or ownership drift and missing original parent',async t=>{
 for(const mode of ['star','quality','pending','uninitialized','same','result','active','config','connection','revision','late-building','parent','forged']){const switching=['star','quality','pending','uninitialized','same'].includes(mode),f=await attributeFixture(t,{action:switching?'switch-attrs':'save-reroll'});assert.ok(f.operation);const target=f.state.pets[0];if(mode==='star')target.star=1;if(mode==='quality')target.petId='橙宠物1';if(mode==='pending')target.rerollAttrs=structuredClone(target.extAttrs);if(mode==='uninitialized')target.extAttrs2=[];if(mode==='same')target.extAttrIdx=2;if(mode==='result')target.rerollAttrs[0].attrValue.value++;if(mode==='active')target.extAttrIdx=2;if(mode==='config')f.config.tables.PetRerollCfg.data=[];if(mode==='connection')f.client.factContext.connectionId='different';if(mode==='revision')f.push();if(mode==='forged'){assert.equal(pet.planPet(structuredClone(f.before),f.opts()).actions.length,0);continue;}let extra=mode==='late-building'?{onStage:stage=>{if(stage==='DISPATCH_INTENT')f.push('SCUpdateWaterBuilding',{building:f.state.buildings.at(-1)});}}:{};if(mode==='parent'){const scope={...f.client.factContext,runId:'absent-attribute-parent'},limits={resources:[],quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'missing-attribute',limits,ledger:null}};}const result=await f.run(f.operation,extra);assert.equal(result.dispatched,false,mode+JSON.stringify(result));assert.equal(f.state.writes.length,0);}
 for(const p of [{action:'switch-attrs',extIdx:3},{action:'save-reroll',extIdx:1},{action:'discard-reroll',saveOrNot:false},{action:'switch-attrs',uid,jobIdx:0}])assert.throws(()=>pet.validatePetParameters(p));
 for(const request of ['PetSwitchExtAttrRequest','SavePetRerollRequest']){const good={request,body:{buildingId:'1宠物',...(request==='PetSwitchExtAttrRequest'?{extIdx:2}:{saveOrNot:true})},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const extra of [{costs:undefined},{costs:[{id:'GOLD',num:1}]},{body:{...good.body,uid}},{body:{...good.body,extIdx:3}}])assert.throws(()=>assertPaymentAllowed({...good,...extra}));}
});

test('Pet ATTRIBUTES preserves UNKNOWN for no effect or wrong group, pending, peer and inventory changes',async t=>{
 for(const mode of ['unknown','group','pending','copy','inactive','level','building','stock']){const f=await attributeFixture(t,{action:'save-reroll',outcome:mode==='unknown'?'unknown':'success'});f.state.afterWrite=()=>{const target=f.state.pets[0];if(mode==='group')target.extAttrIdx=2;if(mode==='pending')target.rerollAttrs=structuredClone(target.extAttrs);if(mode==='copy')target.extAttrs[0].attrValue.value++;if(mode==='inactive')target.extAttrs2=[];if(mode==='level')target.level++;if(mode==='building')f.state.buildings[1].level++;if(mode==='stock')f.state.stock.set('其他',2);};const result=await f.run();assert.equal(result.status,'UNKNOWN',mode+JSON.stringify(result));assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet ATTRIBUTES original HTTP Tasks Workflow '+outcome+' retains exact current group result and zero resource parent',async t=>{
 for(const action of ['switch-attrs','save-reroll','discard-reroll']){const f=await attributeFixture(t,{action,http:true,outcome});await f.call('/api/gameplay?module=pet');const surveyed=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(surveyed.status,200);const row=surveyed.data.view.candidates.find(r=>r.executable);assert.ok(row,JSON.stringify(surveyed.data.view.blocked));if(outcome==='success'){const growth=await f.call('/api/gameplay/pet/growth/prepare',{body:{targets:[f.parameters],maxDurationMs:60000}});assert.equal(growth.status,200,JSON.stringify(growth.data));assert.deepEqual(growth.data.steps[0].parameters,f.parameters);assert.deepEqual(growth.data.graph.budget,f.operation.budgetClaims);}const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);const record=f.durable.list(account)[0],expected=outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED';assert.equal(record.finalStatus,expected,JSON.stringify(record));assert.equal(f.state.writes[0].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(record.runBudget.reserved.resources,[]);assert.deepEqual(record.runBudget.reserved.uids,f.operation.budgetClaims.uids);assert.equal((await runner.resume()).status,outcome==='success'?'COMPLETED':outcome==='rejected'?'FAILED':'UNKNOWN');assert.deepEqual(f.counts(),{clients:0,collections:0});if(outcome==='unknown')assert.equal((await f.call('/api/operations/plan',{body:{module:'pet',mode:'Manual',parameters:f.parameters,selections:[row.actionId]}})).status,409);assert.equal(f.state.writes.length,1);}
});


async function rerollFixture(t,{outcome='success',http=false,quality=5,star=2,locks=[1,3],active=1}={}){
 const f=await attributeFixture(t,{action:'save-reroll',http,outcome}),retained=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));for(const key of ['PetRandomAttrLibCfg','AdditionAttrOverviewCfg','HeroCareerCfg','HeroFactionCfg'])f.config.tables[key]=structuredClone(retained[key]);for(const id of ['宠物洗炼石','红宠物洗炼石','锁定石']){f.config.tables.ItemCfg.data.push({id});f.state.stock.set(id,1000);}
 const attrs=[4,5,6].map((attr,i)=>({attrValue:{attr,value:(i+1)/10,rating:3},heroProf:i===1?'法师':'',heroCamp:i===2?'阵营A':''}));Object.assign(f.state.pets[0],{petId:quality===4?'橙宠物1':'红宠物1',star,extAttrIdx:active,extAttrs:structuredClone(attrs),extAttrs2:quality===5&&star>=2?structuredClone(attrs):[],rerollAttrs:[]});
 const parameters={action:'reroll',buildingId:'1宠物',uid,lockedSlots:locks},opts=()=>f.options({parameters}),before=await pet.surveyPet(f.client,protocol,opts()),operation=pet.planPet(before,opts()).actions[0];
 f.client.sendWatch=async(name,body,{beforeDispatch}={})=>{beforeDispatch();assert.equal(name,'PetRerollAttrRequest');assert.deepEqual(body,{buildingId:'1宠物',lockedSlots:[...locks].sort((a,b)=>a-b)});const decoded=wire(name,body);assert.deepEqual(decoded.specAttrs,[]);const durable=f.file?JSON.parse(fs.readFileSync(f.file,'utf8')).accounts[account][0]:null;f.state.writes.push({name,body:structuredClone(body),durable});if(outcome==='rejected')throw Object.assign(Error('synthetic material reroll refusal'),{code:'REJECTED'});
  if(outcome==='success'){const pet=f.state.pets[0],breed=f.config.tables.PetBreedCfg.data.find(r=>r.petId===pet.petId),row=f.config.tables.PetRerollCfg.data.find(r=>r.quality===breed.qualityIndex+1&&r.star===pet.star&&r.lockCount===body.lockedSlots.length);for(const [id,num]of [row.cost,...(body.lockedSlots.length?[row.lockCost]:[])])f.state.stock.set(id,f.state.stock.get(id)-num);const original=pet[pet.extAttrIdx===1?'extAttrs':'extAttrs2'];pet.rerollAttrs=original.map((v,i)=>body.lockedSlots.includes(i+1)?structuredClone(v):{attrValue:{attr:[4,5,6][i],value:0.03*(i+1),rating:4},heroProf:i===1?'射手':'',heroCamp:i===2?'阵营B':''});f.push();}f.state.afterWrite?.();return {status:'UNKNOWN'};};
 const run=(op=operation,extra={})=>{const scope={...f.client.factContext,runId:'pet-reroll-run'},limits=op.budgetClaims,budget={scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'pet-reroll-batch',limits,ledger:null};return executeBusinessOperation(f.client,protocol,op,{adapter:pet.petModule,...opts(),allowMutate:true,budget,...extra});};return {...f,parameters,opts,before,operation,run};
}

test('Pet REROLL supports all 24 fixed material quotes and explicit locks, leaving exact current groups unchanged',async t=>{
 const retained=extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')));for(const row of retained.PetRerollCfg.data){const locks=row.lockCount===0?[]:row.lockCount===1?[1]:[1,3],f=await rerollFixture(t,{quality:row.quality,star:row.star,locks});assert.ok(f.operation,JSON.stringify(pet.viewPet(f.before,f.opts()).blocked));assert.deepEqual(f.operation.costs,[row.cost,...(locks.length?[row.lockCost]:[])].map(([id,num])=>({id,num})).sort((a,b)=>a.id.localeCompare(b.id)));if(row.star===0||row.star===5&&row.lockCount===2){const groups=structuredClone(f.state.pets[0]),buildings=structuredClone(f.state.buildings),result=await f.run();assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.deepEqual({...f.state.pets[0],rerollAttrs:[]},groups);assert.deepEqual(f.state.buildings,buildings);assert.equal(f.state.pets[0].rerollAttrs.length,3);for(const n of locks)assert.deepEqual(f.state.pets[0].rerollAttrs[n-1],groups.extAttrs[n-1]);assert.equal(pet.planPet(await pet.surveyPet(f.client,protocol,f.opts()),f.opts()).actions.length,0);}}
 const second=await rerollFixture(t,{active:2,locks:[3,1]});assert.deepEqual(second.operation.parameters.lockedSlots,[1,3]);assert.equal((await second.run()).status,'SUCCESS');assert.equal(protocol.PetRerollAttrResponse,undefined);
});

test('Pet REROLL rejects pending results, unknown pools, lock scope, cost and private source drift before dispatch',async t=>{
 for(const mode of ['stock','pending','slots','material','pool','uid','connection','revision','late-building','parent','forged']){const f=await rerollFixture(t);assert.ok(f.operation);if(mode==='stock')f.state.stock.set('锁定石',0);if(mode==='pending')f.state.pets[0].rerollAttrs=structuredClone(f.state.pets[0].extAttrs);if(mode==='slots')f.state.pets[0].extAttrs.pop();if(mode==='material')f.config.tables.PetRerollCfg.data.find(r=>r.quality===5&&r.star===2&&r.lockCount===2).lockCost[1]++;if(mode==='pool')f.config.tables.PetRandomAttrLibCfg.data=[];if(mode==='uid')f.state.buildings.at(-1).petServe.petUid='18';if(mode==='connection')f.client.factContext.connectionId='changed';if(mode==='revision')f.push();if(mode==='forged'){assert.equal(pet.planPet(structuredClone(f.before),f.opts()).actions.length,0);continue;}let extra=mode==='late-building'?{onStage:stage=>{if(stage==='DISPATCH_INTENT')f.push('SCUpdateWaterBuilding',{building:f.state.buildings.at(-1)});}}:{};if(mode==='parent'){const scope={...f.client.factContext,runId:'absent-reroll-parent'},limits={resources:f.operation.costs,quotas:[],uids:[]};extra={budget:{scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'no-parent',limits,ledger:null}};}const result=await f.run(f.operation,extra);assert.equal(result.dispatched,false,mode+JSON.stringify(result));assert.equal(f.state.writes.length,0);}
 const f=await rerollFixture(t);assert.equal(pet.planPet(f.before,{...f.opts(),parameters:{action:'reroll',buildingId:'1宠物',uid}}).actions.length,0);for(const locks of [[0],[1,1],[1,2,3],['1'],Array(1)])assert.throws(()=>pet.validatePetParameters({action:'reroll',uid,lockedSlots:locks}));for(const p of [{action:'reroll',uid,lockedSlots:[],specAttrs:['生命百分比']},{action:'save-reroll',lockedSlots:[]},{action:'reroll',uid,lockedSlots:[],extIdx:2}])assert.throws(()=>pet.validatePetParameters(p));const good={request:'PetRerollAttrRequest',body:{buildingId:'1宠物',lockedSlots:[1]},costs:[{id:'红宠物洗炼石',num:50},{id:'锁定石',num:2}]};assert.doesNotThrow(()=>assertPaymentAllowed(good));for(const extra of [{costs:[]},{body:{...good.body,specAttrs:[]}},{body:{...good.body,lockedSlots:[0]}},{costs:[{id:'RUBY',num:1}]}])assert.throws(()=>assertPaymentAllowed({...good,...extra}));
});

test('Pet REROLL keeps UNKNOWN for no result, wrong fee, changed locks, invalid pool or automatic active-group replacement',async t=>{
 for(const mode of ['unknown','fee','lock','length','pool','profession','active','peer','stock']){const f=await rerollFixture(t,{outcome:mode==='unknown'?'unknown':'success'});f.state.afterWrite=()=>{const pet=f.state.pets[0];if(mode==='fee')f.state.stock.set('锁定石',999);if(mode==='lock')pet.rerollAttrs[0].attrValue.value++;if(mode==='length')pet.rerollAttrs.pop();if(mode==='pool')pet.rerollAttrs[1].attrValue.attr=1;if(mode==='profession')pet.rerollAttrs[1].heroProf='unknown';if(mode==='active')pet.extAttrs=structuredClone(pet.rerollAttrs);if(mode==='peer')f.state.buildings[1].level++;if(mode==='stock')f.state.stock.set('其他',2);};const result=await f.run();assert.equal(result.status,'UNKNOWN',mode+JSON.stringify(result));assert.equal(result.unresolvedWrite,true);assert.equal(f.state.writes.length,1);}
});

for(const outcome of ['success','unknown','rejected'])test('Pet REROLL original HTTP Tasks Workflow '+outcome+' reserves exact materials and current serving UID once',async t=>{
 const f=await rerollFixture(t,{http:true,outcome});assert.ok(f.operation);await f.call('/api/gameplay?module=pet');const surveyed=await f.call('/api/gameplay/survey',{body:{module:'pet',parameters:f.parameters}});assert.equal(surveyed.status,200);const row=surveyed.data.view.candidates.find(r=>r.executable);assert.ok(row);if(outcome==='success'){const growth=await f.call('/api/gameplay/pet/growth/prepare',{body:{targets:[f.parameters],maxDurationMs:60000}});assert.equal(growth.status,200,JSON.stringify(growth.data));assert.deepEqual(growth.data.graph.budget,f.operation.budgetClaims);}const prepared=await f.call('/api/workflows/prepare',{body:{entry:'tasks',tasks:[{kind:'pet',parameters:f.parameters,actionId:row.actionId}],budget:f.operation.budgetClaims}});assert.equal(prepared.status,200,JSON.stringify(prepared.data));const runner=f.runner(),first=await runner.start(account,prepared.data.graph);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);const p=first.plan,auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true}});assert.equal(auth.status,200);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);const record=f.durable.list(account)[0],expected=outcome==='success'?'SUCCESS':outcome==='unknown'?'UNKNOWN':'REJECTED';assert.equal(record.finalStatus,expected,JSON.stringify(record));assert.equal(f.state.writes[0].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(record.runBudget.reserved.resources,f.operation.costs);assert.deepEqual(record.runBudget.reserved.uids,f.operation.budgetClaims.uids);assert.equal((await runner.resume()).status,outcome==='success'?'COMPLETED':outcome==='rejected'?'FAILED':'UNKNOWN');assert.deepEqual(f.counts(),{clients:0,collections:0});if(outcome==='unknown')assert.equal((await f.call('/api/operations/plan',{body:{module:'pet',mode:'Manual',parameters:f.parameters,selections:[row.actionId]}})).status,409);assert.equal(f.state.writes.length,1);
});
