import test from 'node:test';
import assert from 'node:assert/strict';
import {GameClient} from '../src/client.mjs';
import {loadProtocol} from '../src/proto.mjs';
import {executeBusinessOperation} from '../src/business-functions.mjs';
import {ResourceLedger,createRunBudgetContext} from '../src/resource-ledger.mjs';

const protocol=loadProtocol();
// A real Codec/client with an in-memory socket. No login, listener or network.
function harness(kind,{boundary=null,change=null,effect=true,sendFailure=false}={}){
 const originalNow=Date.now;let now=1000000,outgoing=null,applied=false,changes=0,authority=true;Date.now=()=>now;
 const silent=kind==='silent',costs=silent?[{id:'精铁',num:4}]:[];
 const uid='9007199254740993',request=silent?'EnhanceEquipRequest':'SaveFormationRequest',response=silent?null:'SaveFormationResponse';
 const body=silent?{uid}:{module:1,formation:{presetId:2,heroPositions:[{heroId:'synthetic-hero',pos:{x:1,y:1}}],petUid:'0'}},claims={resources:costs,quotas:silent?[]:[{id:'synthetic-fixture-quota',num:1}],uids:silent?[{type:'equipment',id:uid}]:[]};
 const operation={actionId:'offline:'+kind,actionType:silent?'UPGRADE':'UNLOCK',target:silent?{uid}:{presetId:2},costs,costSource:'synthetic-boundary-fixture',identity:'unchanged',beforeState:{applied:false},expectedState:{applied:true},budgetClaims:claims,action:{request,response,body}};
 const controller=new AbortController(),writes=[],reads=[],frames=[];
 const scope={accountId:'synthetic-A',generation:1,connectionId:'offline-only',runId:'boundary-run'};
 const runBudget=createRunBudgetContext({scope,limits:claims}),stock=new Map(costs.map(({id,num})=>[id,num+5]));
 const budget={scope,runBudget,batchId:'boundary-batch',limits:claims,ledger:runBudget.child(stock,{scope,batchId:'boundary-batch',limits:claims})};
 const alter=()=>{if(outgoing!==request||changes++)return;if(change==='expire')now+=31000;else if(change==='cancel')controller.abort();else if(change==='disconnect')client.state='FAILED';else if(['identity','config'].includes(change))authority=false;};
 const client=new GameClient({protocol,WebSocketImpl:class{constructor(){throw Error('offline only');}},assertTransport(){if(boundary==='assertTransport')alter();}});
 client.factContext={accountId:'synthetic-A',generation:1,connectionId:'offline-only'};client.state='READY';
 const encode=client.codec.encode.bind(client.codec);client.codec.encode=(name,seq,...args)=>{const bytes=encode(name,seq,...args);if(boundary==='encoding'&&name===request&&seq>0){outgoing=name;alter();}return bytes;};
 client.on('frame',event=>{outgoing=event.name;frames.push(event.name);if(boundary==='frame')alter();});
 client.socket={readyState:1,close(){},send(bytes){
  const decoded=client.codec.decode(bytes),name=decoded.name;
  if(name===request){writes.push({name,body:decoded.body,at:now});if(sendFailure){const error=Error('synthetic socket failure after onDispatch');error.dispatchPrevented=true;throw error;}if(effect){applied=true;for(const {id,num}of costs)stock.set(id,stock.get(id)-num);}if(response)client.onMessage(client.codec.encode(response,0,{formation:body.formation}));return;}
  reads.push(name);const value=name==='AllItemRequest'?{items:[...stock].map(([itemId,num])=>({itemId,num}))}:name==='AllResourceRequest'?{list:[]}:null;
  assert.ok(value,'unexpected synthetic transport '+name);client.onMessage(client.codec.encode(name==='AllItemRequest'?'AllItemResponse':'AllResourceResponse',0,value));
 }};
 const facts=()=>({stock:new Map(stock),stockReliable:true,sourceAt:now,state:{applied}});
 const adapter={async survey(){return facts();},plan(f){return {actions:now-f.sourceAt<=30000?[operation]:[]};},verify(_candidate,_before,after){return {confirmed:after.state.applied,afterState:after.state};},view(f){return f.state;}};
 return {client,operation,budget,writes,reads,frames,run:()=>executeBusinessOperation(client,protocol,operation,{adapter,allowMutate:true,budget,signal:controller.signal,assertCurrent(){if(!authority)throw Object.assign(Error('synthetic identity/config changed'),{code:'NOT_EXECUTED'});},timeout:100,window:0}),restore(){Date.now=originalNow;client.stop();},get now(){return now;}};
}
function cleanTransport(f){assert.deepEqual(f.client.pending,[]);assert.deepEqual(f.client.watchers,[]);assert.equal(f.client.uncertainWrites.size,0);assert.equal(f.client.lateResponses.size,0);assert.equal(f.client.promptUncertain,false);}
for(const kind of ['typed','silent'])for(const boundary of ['encoding','frame','assertTransport']){
 test(kind+' stale facts after '+boundary+' stop at the real socket boundary',async()=>{
  const f=harness(kind,{boundary,change:'expire'});try{const result=await f.run();assert.equal(f.now,1031000);assert.equal(f.writes.length,0,'31-second synchronous callback cannot bypass domain fact expiry');assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(result.unresolvedWrite,false);cleanTransport(f);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims,'already reserved parent resources and UID remain held');}finally{f.restore();}
 });
 for(const change of ['cancel','disconnect','identity','config'])test(kind+' '+change+' during '+boundary+' stops before the socket and cleans transport',async()=>{
  const f=harness(kind,{boundary,change});try{const result=await f.run();assert.equal(f.writes.length,0);assert.equal(result.dispatched,false);assert.equal(result.unresolvedWrite,false);assert.equal(result.status,['cancel','disconnect'].includes(change)?'CANCELLED':'NOT_EXECUTED');cleanTransport(f);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims);}finally{f.restore();}
 });
}
for(const kind of ['typed','silent'])test(kind+' normal authoritative verification still dispatches once and clears uncertainty',async()=>{
 const f=harness(kind);try{const result=await f.run();assert.equal(f.writes.length,1);assert.equal(result.status,'SUCCESS');assert.equal(result.dispatched,true);assert.equal(result.unresolvedWrite,false);assert.equal(result.verification.status,'CONFIRMED');assert.deepEqual(f.reads,kind==='silent'?['AllItemRequest','AllResourceRequest']:[]);cleanTransport(f);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims);}finally{f.restore();}
});


for(const kind of ['typed','silent'])for(const failure of ['no-effect','socket-failure'])test(kind+' actual dispatch with '+failure+' remains UNKNOWN and retains the fingerprint',async()=>{
 const f=harness(kind,{effect:failure!=='no-effect',sendFailure:failure==='socket-failure'});try{const result=await f.run();assert.equal(f.writes.length,1);assert.equal(result.status,'UNKNOWN');assert.equal(result.dispatched,true);assert.equal(result.unresolvedWrite,true);assert.equal(result.verification.status,'UNCONFIRMED');assert.equal(f.client.uncertainWrites.size,1);assert.equal(f.client.pending.length,0);assert.equal(f.client.watchers.length,0);assert.equal(f.client.lateResponses.size,0);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims);}finally{f.restore();}
});

// The synthetic adapter above isolates the transport contract. These cases also
// exercise the registered C229 domain's original facts and 30-second planner.
import {equipmentGrowthModule,surveyEquipmentGrowth,planEquipmentGrowth} from '../src/equipment-growth.mjs';
async function equipmentHarness({boundary=null}={}){
 const originalNow=Date.now;let now=1000000,outgoing=null,aged=false,iron=30;Date.now=()=>now;
 const uid='9007199254740993',equip=()=>({uid,equipId:'蓝武器1',level:1,star:0,refineLv:0,attr:[{attr:1,value:1.5,rating:2}],rerollAttrs:[]});
 const pool=[equip()],heroes=[{heroId:'A',level:10,star:2,power:'9007199254740997',attributes:[{attr:1,value:10.5}],skillLevels:[1,1],equips:[equip()]}],writes=[];
 const config={tables:{EquipCfg:{data:[{id:'蓝武器1',type:'武器'}]},EquipAttrCfg:{data:[{id:'蓝武器1',star:'0',maxLv:3}]},EquipUpDecomposeCfg:{data:[{level:1,upgradeCost:0},{level:2,upgradeCost:4},{level:3,upgradeCost:6}]}}};
 const options={config,player:{playerId:'1001',worldId:1000001,level:20},parameters:{heroId:'A',uid},moduleConfig:{enabled:true}};
 const age=()=>{if(outgoing==='EnhanceEquipRequest'&&!aged){aged=true;now+=31000;}};
 const client=new GameClient({protocol,accountId:'synthetic-A',generation:1,WebSocketImpl:class{constructor(){throw Error('offline only');}},assertTransport(){if(boundary==='assertTransport')age();}});client.state='READY';client.factContext.connectionId='offline-equipment';
 const encode=client.codec.encode.bind(client.codec);client.codec.encode=(name,seq,...args)=>{const bytes=encode(name,seq,...args);if(boundary==='encoding'&&name==='EnhanceEquipRequest'&&seq>0){outgoing=name;age();}return bytes;};
 client.on('frame',event=>{outgoing=event.name;if(boundary==='frame')age();});
 client.socket={readyState:1,close(){},send(bytes){const {name,body}=client.codec.decode(bytes);if(name==='EnhanceEquipRequest'){writes.push({name,body,at:now});pool[0].level++;heroes[0].equips[0].level++;iron-=4;return;}const raw=name==='EquipsRequest'?{equip:pool}:name==='AllHeroRequest'?{heroes}:name==='AllItemRequest'?{items:[{itemId:'精铁',num:iron}]}:name==='AllResourceRequest'?{list:[{res:3,amount:100}]}:null;assert.ok(raw,'unexpected equipment transport '+name);client.onMessage(client.codec.encode(name.slice(0,-7)+'Response',0,raw));}};
 try{const facts=await surveyEquipmentGrowth(client,protocol,options),operation=planEquipmentGrowth(facts,options).actions[0];assert.ok(operation,'synthetic C229 fixture must yield the original planner action');const scope={accountId:'synthetic-A',generation:1,connectionId:'offline-equipment',runId:'equipment-boundary'},limits=operation.budgetClaims,runBudget=createRunBudgetContext({scope,limits}),budget={scope,runBudget,batchId:'equipment-batch',limits,ledger:runBudget.child(facts.stock,{scope,batchId:'equipment-batch',limits})};return {client,writes,pool,heroes,operation,budget,run:()=>executeBusinessOperation(client,protocol,operation,{...options,adapter:equipmentGrowthModule,allowMutate:true,budget,window:0}),restore(){Date.now=originalNow;client.stop();}};}catch(error){Date.now=originalNow;client.stop();throw error;}
}
for(const boundary of ['encoding','frame','assertTransport'])test('original C229 facts expiring during '+boundary+' never reach the real socket',async()=>{const f=await equipmentHarness({boundary});try{const result=await f.run();assert.equal(f.writes.length,0);assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(result.unresolvedWrite,false);assert.equal(f.pool[0].level,1);assert.equal(f.heroes[0].equips[0].level,1);cleanTransport(f);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims);}finally{f.restore();}});
test('original C229 authority verifies the real Codec/client single upgrade and exact finite reservation',async()=>{const f=await equipmentHarness();try{const result=await f.run();assert.equal(f.writes.length,1);assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(result.dispatched,true);assert.equal(f.pool[0].level,2);assert.equal(f.heroes[0].equips[0].level,2);cleanTransport(f);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims);}finally{f.restore();}});
for(const kind of ['typed','silent'])test(kind+' an earlier true predispatch Error cannot attest a later socket attempt',async()=>{
 let phase='early',oldError,writes=0,oldGuard,newGuard;
 const operation={actionId:'offline:reused:'+kind,actionType:'SAVE',target:{module:1},costs:[],costSource:'synthetic-boundary-fixture',identity:'unchanged',beforeState:{saved:false},expectedState:{saved:true},action:{request:'SaveFormationRequest',response:kind==='typed'?'SaveFormationResponse':null,body:{module:1,formation:{presetId:2,heroPositions:[],petUid:'0'}}}};
 const facts={stock:new Map(),stockReliable:true},adapter={async survey(){return facts;},plan(){return {actions:[operation]};},verify(){return {confirmed:false};},view(){return {};}};
 const client=new GameClient({protocol,WebSocketImpl:class{constructor(){throw Error('offline only');}}});client.state='READY';client.socket={readyState:1,close(){},send(){writes++;throw oldError;}};
 client.on('frame',()=>{if(phase==='early')throw Error('synthetic failure before first socket attempt');});
 const method=kind==='typed'?'request':'sendWatch',original=client[method].bind(client);
 client[method]=(...args)=>{const guard=args[kind==='typed'?4:2].beforeDispatch;if(phase==='early')oldGuard=guard;else newGuard=guard;return original(...args).catch(error=>{if(phase==='early')oldError=error;throw error;});};
 const run=()=>executeBusinessOperation(client,protocol,operation,{adapter,allowMutate:true,budget:{ledger:new ResourceLedger(new Map())},window:0});
 try{
  const first=await run();assert.equal(first.dispatched,false);assert.equal(first.status,'NOT_EXECUTED');assert.equal(first.unresolvedWrite,false);assert.equal(writes,0);assert.ok(oldError instanceof Error);assert.equal(client.uncertainWrites.size,0);
  phase='late';const second=await run();assert.notEqual(oldGuard,newGuard,'each execution must bind a distinct transport proof callback');assert.equal(writes,1);assert.equal(second.status,'UNKNOWN');assert.equal(second.dispatched,true);assert.equal(second.unresolvedWrite,true);assert.equal(second.verification.status,'UNCONFIRMED');assert.equal(client.uncertainWrites.size,1);assert.equal(client.pending.length,0);assert.equal(client.watchers.length,0);assert.equal(client.lateResponses.size,0);
 }finally{client.stop();}
});

import {heroModule,surveyHeroOperations,planHeroOperations} from '../src/hero-operations.mjs';
import fs from 'node:fs';
import {extractTables} from '../src/config.mjs';
const exclusiveConfig={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))};
async function exclusiveHarness({boundary=null}={}){
 const originalNow=Date.now;let now=1000000,outgoing=null,aged=false,material=100;Date.now=()=>now;
 const heroes=[{heroId:'马斯克',level:10,star:15,power:'9007199254740997',attributes:[{attr:1,value:10.5}],skillLevels:[1,1],exclusive:{level:1,star:0}}],writes=[];
 const options={config:exclusiveConfig,player:{playerId:'1001',worldId:1000001,level:20},parameters:{heroId:'马斯克',action:'exclusive-level'},moduleConfig:{enabled:true}};
 const age=()=>{if(outgoing==='HeroExclusiveLevelUpRequest'&&!aged){aged=true;now+=31000;}};
 const client=new GameClient({protocol,accountId:'synthetic-A',generation:1,WebSocketImpl:class{constructor(){throw Error('offline only');}},assertTransport(){if(boundary==='assertTransport')age();}});client.state='READY';client.factContext.connectionId='offline-exclusive';
 const encode=client.codec.encode.bind(client.codec);client.codec.encode=(name,seq,...args)=>{const bytes=encode(name,seq,...args);if(boundary==='encoding'&&name==='HeroExclusiveLevelUpRequest'&&seq>0){outgoing=name;age();}return bytes;};
 client.on('frame',event=>{outgoing=event.name;if(boundary==='frame')age();});
 client.socket={readyState:1,close(){},send(bytes){const {name,body}=client.codec.decode(bytes);if(name==='HeroExclusiveLevelUpRequest'){writes.push({name,body,at:now});heroes[0].exclusive.level++;material-=20;return;}const raw=name==='AllHeroRequest'?{heroes}:name==='AllItemRequest'?{items:[{itemId:'初级专武材料',num:material}]}:name==='AllResourceRequest'?{list:[{res:3,amount:100}]}:null;assert.ok(raw,'unexpected exclusive transport '+name);client.onMessage(client.codec.encode(name.slice(0,-7)+'Response',0,raw));}};
 try{const facts=await surveyHeroOperations(client,protocol,options),operation=planHeroOperations(facts,options).actions[0];assert.ok(operation,'synthetic C225 fixture must yield the original hero planner action');const scope={accountId:'synthetic-A',generation:1,connectionId:'offline-exclusive',runId:'exclusive-boundary'},limits=operation.budgetClaims,runBudget=createRunBudgetContext({scope,limits}),budget={scope,runBudget,batchId:'exclusive-batch',limits,ledger:runBudget.child(facts.stock,{scope,batchId:'exclusive-batch',limits})};return{client,writes,heroes,operation,budget,run:()=>executeBusinessOperation(client,protocol,operation,{...options,adapter:heroModule,allowMutate:true,budget,window:0}),restore(){Date.now=originalNow;client.stop();}};}catch(error){Date.now=originalNow;client.stop();throw error;}
}
for(const boundary of ['encoding','frame','assertTransport'])test('C225 original hero facts expiring during '+boundary+' never reach the real socket',async()=>{const f=await exclusiveHarness({boundary});try{const result=await f.run();assert.equal(f.writes.length,0);assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(result.unresolvedWrite,false);assert.equal(f.heroes[0].exclusive.level,1);cleanTransport(f);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims);}finally{f.restore();}});
test('C225 original hero authority confirms real Codec/client upgrade without a named response',async()=>{const f=await exclusiveHarness();try{const result=await f.run();assert.equal(f.writes.length,1);assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(result.dispatched,true);assert.equal(f.heroes[0].exclusive.level,2);cleanTransport(f);assert.deepEqual(f.budget.runBudget.snapshot().reserved,f.operation.budgetClaims);}finally{f.restore();}});
