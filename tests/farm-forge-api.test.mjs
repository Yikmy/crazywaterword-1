import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cw-farm-forge-api-'));
process.env.CW_DATA_DIR=root;process.env.CW_CONFIG_PACK=path.join(root,'absent-config.json');
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
const {createExecutionHistory}=await import('../src/execution-history.mjs');
const {createModuleSettings}=await import('../src/gameplay-settings.mjs');
const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs');
const {loadProtocol}=await import('../src/proto.mjs');
// Actual Console routes/registered adapters/Service/History, no listener or Runtime.
// Every account, secret marker, game response and transport below is synthetic.
const protocol=loadProtocol(),wire=(name,value)=>protocol[name].decode(protocol[name].encode(value).finish());
const token='synthetic-farm-forge-token',sign='synthetic-farm-forge-sign';
const account=id=>({id,label:'label-'+id,url:'wss://example.invalid',login:{eworldParams:{openId:id,token,sign,timestamp:1}}});
const idle=()=>({makeId:0,finishTime:0,equipId:'',star:0});
const making=()=>({makeId:1001,finishTime:900,equipId:'蓝武器2',star:2});
const equipment=(uid='9007199254740993',extra={})=>({uid,equipId:'蓝武器1',level:0,star:0,refineLv:0,attr:[{attr:1,value:1.5}],rerollAttrs:[],...extra});
const params=(module,action=module==='farm'?'plant':'make')=>module==='farm'?{buildingId:'1农田',action,...(action==='plant'?{productId:'小麦'}:{})}:{buildingId:'1装备厂',action,...(action==='make'?{makeId:1001}:{})};
const configuration=()=>({tables:{BuildingCfg:{data:[{buildingType:'农田'},{buildingType:'装备厂'}]},FarmlandPlantCfg:{data:[{id:'小麦',material:['小麦种子',1],time:1800,produceNum:5}]},BuildingEquipMakeCfg:{data:[{makeId:1001,type:'武器',libId:1,seconds:1800,season:1,costItem:[['材料',4],['GOLD',20]]}]},EquipMakeLibCfg:{data:[{libId:1,equipId:'蓝武器1',rate:100},{libId:1,equipId:'蓝武器2',rate:100}]},EquipCfg:{data:[{id:'蓝武器1',type:'武器'},{id:'蓝武器2',type:'武器'}]}}});
function harness({apply=true}={}){
 const dir=fs.mkdtempSync(path.join(root,'case-'));saveStore({version:1,activeId:'A',accounts:[account('A'),account('B')]});let clients=0,collections=0,csrf;
 const history=createExecutionHistory({file:path.join(dir,'history.json')}),moduleSettings=createModuleSettings({file:path.join(dir,'settings.json'),modules:GAMEPLAY_MODULES});
 const app=createConsole({protocol,tracePath:path.join(dir,'never-trace.log'),clientFactory(){clients++;throw Error('No real client/Runtime allowed');},collect(){collections++;throw Error('No full collector allowed');},writerOwnership:{assertOwned(){return true;},release(){},claim(){return true;}},operationOptions:{history,moduleSettings,getConfig:configuration,loadRules:()=>({config:{version:1,enabled:true,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})}});
 app.server.address=()=>({port:17321});
 const call=(route='/api/gameplay?module=farm',{id='A',body,method=body===undefined?'GET':'POST',headers={},authorized=true}={})=>new Promise(resolve=>{
  const url=new URL(route,'http://127.0.0.1:17321');if(id!==null)url.searchParams.set('account',id);
  const req=new EventEmitter();Object.assign(req,{url:url.pathname+url.search,method,headers:{host:'127.0.0.1:17321','content-type':'application/json',...(authorized?{origin:'http://127.0.0.1:17321',...(csrf?{'x-cw-csrf':csrf}:{})}:{}),...headers}});
  const res={writeHead(status,head){this.status=status;this.headers=head;},end(text){const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:this.status,headers:this.headers,data,text});}};app.server.emit('request',req,res);if(body!==undefined)req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');
 });
 const ready=(id='A',queue=idle())=>{
  const state={apply,raw:{building:[{buildingId:'1农田',level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},farm:{productId:'',plantTime:0,ripeTime:0}},{buildingId:'1装备厂',level:1,buildStartTime:0,buildFinishTime:0,equipMaking:queue}],autoFarming:false,workerOrder:[],orderOfTheDay:{orderNum:0}},bag:[equipment()],heroes:[{heroId:'A',level:1,star:1,power:'9007199254740995',skillLevels:[1],equips:[equipment('9007199254740994')]}],stock:new Map([['小麦种子',3],['小麦',5],['材料',20],['GOLD',100]]),reads:[],writes:[],onWrite:null};
  const client=new EventEmitter();Object.assign(client,{connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Set(),factContext:{accountId:id,generation:1},gameClock:{read(){return {status:'TRUSTED',reliable:true,nowMs:1000000,earliestMs:1000000,latestMs:1000000,accountId:id,generation:client.factContext.generation};}},stop(){this.connected=false;},markUnverifiedWrite(name){this.uncertainWrites.add(name);},confirmWatchedWrite(name){this.uncertainWrites.delete(name);},
   mutate(name,body){state.writes.push({name,body:structuredClone(body)});const forge=state.raw.building[1];let reply={equipId:forge.equipMaking.equipId};if(state.apply){if(name==='FarmPlantRequest'){const p=body.args[0];state.raw.building[0].farm={productId:p.productId,plantTime:1000,ripeTime:2800};state.stock.set('小麦种子',state.stock.get('小麦种子')-1);}if(name==='MakeEquipRequest'){forge.equipMaking=making();forge.equipMaking.finishTime=2000;state.stock.set('材料',state.stock.get('材料')-4);state.stock.set('GOLD',state.stock.get('GOLD')-20);}if(name==='PickMadeEquipRequest'){state.bag.push(equipment('9007199254740996',{equipId:forge.equipMaking.equipId,star:forge.equipMaking.star,level:3,refineLv:2}));forge.equipMaking=idle();}}state.onWrite?.(name,body);return reply;},
   async request(name,body,response,_timeout,opts){wire(name,body);if(opts?.mutate)return wire(response,this.mutate(name,body));state.reads.push(name);const value=name==='OnWaterRequest'?state.raw:name==='AllItemRequest'?{items:[...state.stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))}:name==='AllResourceRequest'?{list:[{res:3,amount:state.stock.get('GOLD')}]}:name==='EquipsRequest'?{equip:state.bag}:name==='AllHeroRequest'?{heroes:state.heroes}:name==='MyResFieldsRequest'?{info:{fields:[]}}:name==='MyFleetsRequest'?{fleets:[]}:null;assert.ok(value,'Unexpected synthetic read '+name);return wire(response,value);},
   async sendWatch(name,body){wire(name,body);this.mutate(name,body);return {status:'UNKNOWN'};},
  });
  const session={id,client,player:{playerId:id==='A'?'1':'2',worldId:1000001,level:2},state:'READY',generation:1,connectionId:'offline-api-'+id,abort:new AbortController(),busy:null,loop:{running:false,stop:{}},log:[],snapshot:{ok:{},failed:{}},snapshotStale:false,synthetic:state};app.sessions.set(id,session);return session;
 };
 const enable=async(module,id='A')=>{await call('/api/gameplay?module='+module,{id});return call('/api/gameplay/config',{id,body:{module,config:{enabled:true}}});};
 const survey=(module,parameters=params(module),id='A')=>call('/api/gameplay/survey',{id,body:{module,parameters}});
 const plan=async(module,parameters=params(module),id='A')=>{const read=await survey(module,parameters,id);assert.equal(read.status,200);const candidate=read.data.view.candidates.find(v=>v.executable);assert.ok(candidate,JSON.stringify(read.data));const result=await call('/api/operations/plan',{id,body:{module,mode:'Manual',parameters,selections:[candidate.actionId]}});assert.equal(result.status,200,JSON.stringify(result.data));return result.data;};
 const approve=(p,id='A')=>call('/api/operations/authorize',{id,body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(v=>v.actionId),resourceBudget:p.resourceBudget,confirm:true}});
 const execute=async(permit,id='A')=>{const result=await call('/api/operations/execute',{id,body:permit});await app.operations.settle(id);return result;};
 const historyFor=async(id='A')=>(await call('/api/operations/history',{id})).data.runs;
 const close=async()=>{await app.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(root));fs.rmSync(dir,{recursive:true,force:true});};
 return {...app,call,ready,enable,survey,plan,approve,execute,historyFor,close,counts:()=>({clients,collections})};
}

test('cached Farm/Forge GET defaults off, is redacted and never creates a Session, Runtime or listener',async()=>{
 const app=harness();try{for(const module of ['farm','equipment-forge']){const result=await app.call('/api/gameplay?module='+module);assert.equal(result.status,200);assert.equal(result.data.config.enabled,false);assert.equal(result.data.view,null);assert.ok(result.data.csrfToken);assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.text.includes(token),false);assert.equal(result.text.includes(sign),false);}assert.equal(app.sessions.size,0);assert.equal(app.server.listening,false);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.deepEqual(await app.historyFor(),[]);}finally{await app.close();}
});

test('Farm/Forge require a single exact account selector before reads or dispatch',async()=>{
 const app=harness();try{for(const module of ['farm','equipment-forge']){for(const id of [null,'label-A','missing'])assert.equal((await app.call('/api/gameplay?module='+module,{id})).status,id===null?400:404);assert.equal((await app.call('/api/gameplay?module='+module+'&account=A&account=B',{id:null})).status,400);assert.equal((await app.call('/api/gameplay/config?account=A&account=B',{id:null,body:{module,config:{enabled:true}}})).status,400);}assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}
});

for(const module of ['farm','equipment-forge'])test(module+' API enforces same-origin CSRF JSON and strict fields before business reads',async()=>{
 const app=harness();try{const target=app.ready();await app.call('/api/gameplay?module='+module);for(const extra of [{authorized:false},{headers:{'x-cw-csrf':undefined}},{headers:{'x-cw-csrf':'forged'}},{headers:{origin:'https://attacker.invalid'}},{headers:{host:'evil.invalid'}},{headers:{'sec-fetch-site':'cross-site'}},{headers:{'content-type':'text/plain'}}])assert.equal((await app.call('/api/gameplay/survey',{body:{module,parameters:params(module)},...extra})).status,403);
  for(const id of [null,'missing','label-A'])assert.equal((await app.call('/api/gameplay/survey',{id,body:{module,parameters:params(module)}})).status,id===null?400:404);
  for(const bad of [{...params(module),request:'AnythingRequest'},{...params(module),body:{}},{...params(module),allowPaid:true},{...params(module),count:2},{...params(module),action:'speed'}])assert.equal((await app.call('/api/gameplay/survey',{body:{module,parameters:bad}})).status,400);
  for(const extra of [{request:'AnythingRequest'},{body:{}},{allowPaid:true}])assert.equal((await app.call('/api/gameplay/survey',{body:{module,parameters:params(module),...extra}})).status,400);
  assert.equal((await app.call('/api/gameplay/config',{body:{module,config:{enabled:true,allowPaid:true}}})).status,400);assert.equal(target.synthetic.reads.length,0);assert.equal(target.synthetic.writes.length,0);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('Farm PLANT HTTP path confirms one crop and exact seed debit with durable single-use permit',async()=>{
 const app=harness();try{const target=app.ready();assert.equal((await app.enable('farm')).status,200);const p=await app.plan('farm');assert.deepEqual(p.resourceBudget,[{id:'小麦种子',num:1}]);assert.equal(p.actions[0].action,undefined);assert.equal(p.actions[0].actionType,'PLANT');assert.equal(target.synthetic.writes.length,0);const permit=await app.approve(p);assert.equal(permit.status,200);assert.equal((await app.execute(permit.data)).status,200);const row=(await app.historyFor()).find(v=>v.planSummary.batchId===p.batchId);assert.equal(row.finalStatus,'SUCCESS');assert.equal(row.actions[0].verification.status,'CONFIRMED');assert.equal(row.actions[0].requestStatus,'UNKNOWN');assert.deepEqual(target.synthetic.writes,[{name:'FarmPlantRequest',body:{args:[{buildingId:'1农田',productId:'小麦'}]}}]);assert.equal(target.synthetic.stock.get('小麦种子'),2);assert.equal(target.synthetic.stock.get('小麦'),5);assert.equal((await app.execute(permit.data)).status,403);assert.equal(target.synthetic.writes.length,1);assert.equal((await app.call('/api/gameplay?module=farm',{id:'B'})).data.config.enabled,false);assert.deepEqual(await app.historyFor('B'),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}
});

test('Farm HARVEST stays evidence-blocked and cannot create a write batch through HTTP',async()=>{
 const app=harness();try{const target=app.ready();target.synthetic.raw.building[0].farm={productId:'小麦',plantTime:1,ripeTime:2};await app.enable('farm');const p=params('farm','harvest'),read=await app.survey('farm',p);assert.equal(read.status,200);const row=read.data.view.candidates[0];assert.equal(row.executable,false);assert.equal(row.blockedReason,'FARM_MATURITY_TIME_UNIT_UNVERIFIED');const planned=await app.call('/api/operations/plan',{body:{module:'farm',mode:'Manual',parameters:p,selections:[row.actionId]}});assert.equal(planned.status,409);assert.equal(target.synthetic.writes.length,0);assert.deepEqual(await app.historyFor(),[]);}finally{await app.close();}
});

for(const action of ['make','pick'])test('Forge '+action.toUpperCase()+' HTTP path requires exact permit and authoritative queue/UID/material confirmation',async()=>{
 const app=harness();try{const target=app.ready('A',action==='make'?idle():making());await app.enable('equipment-forge');const p=await app.plan('equipment-forge',params('equipment-forge',action));assert.equal(p.actions.length,1);assert.equal(p.actions[0].actionType,action.toUpperCase());assert.equal(p.actions[0].action,undefined);assert.deepEqual(p.resourceBudget,action==='make'?[{id:'材料',num:4},{id:'GOLD',num:20}]:[]);const permit=await app.approve(p);assert.equal(permit.status,200);assert.equal((await app.execute(permit.data)).status,200);const row=(await app.historyFor()).find(v=>v.planSummary.batchId===p.batchId);assert.equal(row.finalStatus,'SUCCESS');assert.equal(row.actions[0].verification.status,'CONFIRMED');assert.equal(row.actions[0].dispatched,true);assert.equal(target.synthetic.writes.length,1);assert.equal(target.synthetic.writes[0].name,action==='make'?'MakeEquipRequest':'PickMadeEquipRequest');assert.equal((await app.execute(permit.data)).status,403);assert.equal(target.synthetic.writes.length,1);if(action==='make'){assert.equal(target.synthetic.stock.get('材料'),16);assert.equal(target.synthetic.stock.get('GOLD'),80);assert.equal(target.synthetic.writes[0].body.universal,false);}else{assert.equal(target.synthetic.bag.length,2);assert.equal(target.synthetic.bag[1].star,2);assert.equal(target.synthetic.bag[1].uid,'9007199254740996');assert.equal(target.synthetic.stock.get('材料'),20);}assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}
});

for(const module of ['farm','equipment-forge'])test(module+' authorized target changes stop with zero HTTP-triggered writes',async()=>{
 const app=harness();try{const target=app.ready();await app.enable(module);const p=await app.plan(module),permit=await app.approve(p);if(module==='farm')target.synthetic.raw.building[0].farm={productId:'小麦',plantTime:1000,ripeTime:2800};else target.synthetic.raw.building[1].equipMaking=making();assert.equal((await app.execute(permit.data)).status,200);const row=(await app.historyFor())[0];assert.equal(row.finalStatus,'NOT_EXECUTED');assert.equal(row.actions[0].dispatched,false);assert.equal(row.runBudget.reserved.resources.length,0);assert.equal(target.synthetic.writes.length,0);}finally{await app.close();}
});

test('typed Forge PICK with no authority effect stays UNKNOWN and blocks all subsequent account writes',async()=>{
 const app=harness({apply:false});try{const target=app.ready('A',making());await app.enable('equipment-forge');const p=await app.plan('equipment-forge',params('equipment-forge','pick')),permit=await app.approve(p);assert.equal((await app.execute(permit.data)).status,200);const row=(await app.historyFor())[0];assert.equal(row.finalStatus,'UNKNOWN');assert.equal(row.actions[0].requestStatus,'SUCCESS');assert.equal(row.actions[0].verification.status,'UNCONFIRMED');assert.equal(row.actions[0].unresolvedWrite,true);assert.equal(target.client.uncertainWrites.has('PickMadeEquipRequest'),true);assert.equal((await app.call('/api/gameplay?module=equipment-forge')).data.status.blocked,true);assert.equal((await app.survey('equipment-forge',params('equipment-forge','pick'))).data.code,'RESPONSE_UNCERTAIN');assert.equal((await app.survey('farm')).data.code,'RESPONSE_UNCERTAIN');assert.equal(target.synthetic.writes.length,1);}finally{await app.close();}
});

test('Farm/Forge permits, configuration and complete histories cannot cross exact accounts',async()=>{
 const app=harness();try{const a=app.ready('A'),b=app.ready('B');await app.enable('farm');await app.enable('equipment-forge','B');assert.equal((await app.call('/api/gameplay?module=farm',{id:'B'})).data.config.enabled,false);assert.equal((await app.call('/api/gameplay?module=equipment-forge')).data.config.enabled,false);const p=await app.plan('farm'),permit=await app.approve(p);const cross=await app.execute(permit.data,'B');assert.equal(cross.status,409);assert.equal(cross.data.code,'STALE_PLAN');assert.equal(b.synthetic.writes.length,0);assert.equal((await app.execute(permit.data)).status,200);assert.equal((await app.historyFor()).length,1);assert.deepEqual(await app.historyFor('B'),[]);const second=await app.plan('equipment-forge',params('equipment-forge'),'B'),approved=await app.approve(second,'B');assert.equal((await app.execute(approved.data,'B')).status,200);assert.equal(a.synthetic.writes.length,1);assert.equal(b.synthetic.writes.length,1);assert.equal((await app.historyFor())[0].module,'farm');assert.equal((await app.historyFor('B'))[0].module,'equipment-forge');assert.equal(app.server.listening,false);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}
});


for(const module of ['farm','equipment-forge'])test(module+' rejects missing or forged permits and altered budgets without any transport',async()=>{
 const app=harness();try{const target=app.ready();await app.enable(module);const p=await app.plan(module);assert.equal(target.synthetic.writes.length,0);assert.deepEqual(await app.historyFor(),[]);
  const forged=await app.call('/api/operations/execute',{body:{batchId:p.batchId,permitId:'forged'}});assert.equal(forged.status,403);assert.equal(forged.data.code,'AUTHORIZATION_REQUIRED');
  const base={batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(v=>v.actionId),resourceBudget:p.resourceBudget,confirm:true};
  for(const changes of [{planHash:'forged'},{approvedActionIds:[]},{resourceBudget:[]},{confirm:false}]){const result=await app.call('/api/operations/authorize',{body:{...base,...changes}});assert.equal(result.status,403);assert.equal(result.data.code,'AUTHORIZATION_REQUIRED');}
  assert.equal((await app.call('/api/gameplay/survey',{body:{module,parameters:params(module),padding:'x'.repeat(66000)}})).status,413);
  assert.equal(target.synthetic.writes.length,0);assert.deepEqual(await app.historyFor(),[]);assert.deepEqual(app.counts(),{clients:0,collections:0});
 }finally{await app.close();}
});

test('Forge universal exchange remains blocked through HTTP even with ample own materials',async()=>{
 const app=harness();try{const target=app.ready();await app.enable('equipment-forge');const p={...params('equipment-forge'),allowUniversal:true},read=await app.survey('equipment-forge',p);assert.equal(read.status,200);assert.equal(read.data.view.candidates[0].executable,false);assert.equal(read.data.view.candidates[0].blockedReason,'UNIVERSAL_EXCHANGE_BLOCKED_EVIDENCE');assert.equal(target.synthetic.writes.length,0);assert.deepEqual(await app.historyFor(),[]);}finally{await app.close();}
});
test.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});