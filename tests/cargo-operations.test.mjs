import test from 'node:test';
import assert from 'node:assert/strict';
import { cargoShortageView, fleetModule, fleetView, planFleet, surveyFleet, verifyFleet } from '../src/fleet.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { ResourceLedger, RESOURCE_NAMES } from '../src/resource-ledger.mjs';

// All transports and facts are synthetic. This suite never connects a socket,
// opens an account/credential file, creates a Runtime or reads protocol assets.
const settings={enabled:true,cargoFill:true,cargoClaim:true};
const slot=(id='木材',num=4)=>({asset:{type:0,id,num},filled:false,reward:{asset:[{type:1,id:'EXP',num:2},{type:1,id:'GOLD',num:3}]}});
function ship(index=1){return {index,status:0,arriveTime:0,orderItem:[slot(),slot('石头',2)],reward:[{type:0,id:'藏品大师徽章',num:3}]};}
function facts(){return {config:{tables:{}},parameters:{},stockReliable:true,stock:new Map([['木材',10],['石头',5],['EXP',10],['GOLD',100]]),fleetReliable:true,fleets:[],repairParams:new Map(),cargoReliable:true,ships:[ship()],protocolReady:{FillCargoShipRequest:true,DrawShipRewardRequest:true}};}
const candidates=f=>fleetView(f,{moduleConfig:settings}).candidates;
const operation=(f,type='cargoFill',index=1)=>candidates(f).find(row=>row.actionType===type&&(type!=='cargoFill'||row.target.cargoIndex===index));
function fillResult(before,index=1){
 const after=structuredClone(before),row=after.ships[0].orderItem[index-1];row.filled=true;
 after.stock.set(row.asset.id,after.stock.get(row.asset.id)-row.asset.num);
 for(const asset of row.reward.asset)after.stock.set(asset.id,(after.stock.get(asset.id)??0)+asset.num);
 if(after.ships[0].orderItem.every(row=>row.filled)){after.ships[0].status=1;after.ships[0].arriveTime=200;}
 return {after,response:{reward:structuredClone(row.reward)}};
}
function arrival(){
 const before=facts();before.ships[0].status=2;before.ships[0].arriveTime=100;before.ships[0].orderItem.forEach(row=>row.filled=true);
 const after=facts();after.stock.set('藏品大师徽章',3);
 return {before,after,response:{reward:{asset:structuredClone(before.ships[0].reward)},ship:structuredClone(after.ships[0])}};
}
function sources(f){
 const resourceByName=new Map(Object.entries(RESOURCE_NAMES).map(([res,id])=>[id,Number(res)]));
 return {AllItemRequest:{available:true,body:{items:[...f.stock].filter(([id])=>!resourceByName.has(id)).map(([itemId,num])=>({itemId,num}))}},AllResourceRequest:{available:true,body:{list:[...f.stock].filter(([id])=>resourceByName.has(id)).map(([id,amount])=>({res:resourceByName.get(id),amount}))}}};
}
test('cargo projection aggregates same-item requirements before subtracting inventory once',()=>{
 const f=facts();f.ships[0].orderItem=[slot('木材',6),slot('木材',6)];f.ships.push(ship(2));f.ships[1].orderItem=[slot('木材',4)];
 const view=cargoShortageView(f,{moduleConfig:settings});assert.equal(view.reliable,true);assert.equal(view.inventoryReliable,true);
 assert.deepEqual(view.shortages,[{id:'木材',type:0,required:16,have:10,missing:6,reliable:true}]);
 assert.deepEqual(view.ships[0].slots.map(row=>row.missing),[0,0]);
 assert.deepEqual(view.ships[0].slots.map(row=>row.actionId),['fleet:cargoFill:1:1','fleet:cargoFill:1:2']);
 assert.equal(view.ships[0].statusText,'采购中');assert.equal(JSON.stringify(view).includes('"required":16'),true);
});
test('cargo projection excludes filled, transporting and arrived demand',()=>{
 const f=facts();f.ships[0].orderItem[0].filled=true;
 const sailing=ship(2);sailing.status=1;sailing.arriveTime=200;sailing.orderItem.forEach(row=>row.filled=true);
 const arrived=structuredClone(sailing);arrived.index=3;arrived.status=2;f.ships.push(sailing,arrived);
 assert.deepEqual(cargoShortageView(f,{moduleConfig:settings}).shortages,[{id:'石头',type:0,required:2,have:5,missing:0,reliable:true}]);
});
test('missing inventory stays unknown while an authoritative absent item is zero',()=>{
 const f=facts();f.stock.delete('木材');let view=cargoShortageView(f,{moduleConfig:settings});assert.equal(view.ships[0].slots[0].have,0);assert.equal(view.ships[0].slots[0].missing,4);assert.equal(operation(f).reason,'INSUFFICIENT_CARGO_MATERIALS');
 f.stockReliable=false;view=cargoShortageView(f,{moduleConfig:settings});assert.equal(view.inventoryReliable,false);assert.equal(view.ships[0].slots[0].have,null);assert.equal(view.ships[0].slots[0].missing,null);assert.equal(operation(f).decision,'BLOCKED');
});
test('cargo aggregate overflow remains unknown after further same-item rows',()=>{
 const f=facts();f.ships[0].orderItem=[slot('木材',Number.MAX_SAFE_INTEGER),slot('木材',1),slot('木材',1)];
 const row=cargoShortageView(f,{moduleConfig:settings}).shortages[0];assert.equal(row.required,null);assert.equal(row.missing,null);assert.equal(row.reliable,false);
});
test('cargo ship count and cargo slot count follow explicit response rather than hardcoded prose',()=>{
 const f=facts();f.ships[0].orderItem=[slot()];f.ships.push(ship(4));f.ships[1].orderItem.push(slot('木材',1));
 const view=cargoShortageView(f,{moduleConfig:settings});assert.deepEqual(view.ships.map(row=>row.shipIndex),[1,4]);assert.deepEqual(view.ships.map(row=>row.slots.length),[1,3]);assert.equal(view.reliable,true);
});
test('cargo identity rejects missing own defaults, unknown enums, malformed and sparse fields',()=>{
 const mutations=[
 f=>delete f.ships[0].status,f=>delete f.ships[0].arriveTime,f=>f.ships[0].status=8,f=>f.ships[0].arriveTime=-1,
 f=>delete f.ships[0].orderItem[0].filled,f=>f.ships[0].orderItem[0].filled=0,f=>delete f.ships[0].orderItem[0].asset.type,
 f=>f.ships[0].orderItem[0].asset.type=3,f=>f.ships[0].orderItem[0].asset.type=1,f=>f.ships[0].orderItem[0].asset.num=0,
 f=>f.ships[0].orderItem[0].asset.num='9007199254740992',f=>delete f.ships[0].orderItem[0].reward,
 f=>f.ships[0].orderItem[0].reward.asset=[],f=>f.ships[0].reward=[],f=>delete f.ships[0].orderItem[1],
 f=>{const raw=f.ships[0];f.ships[0]=Object.assign(Object.create({status:0}),raw);delete f.ships[0].status;},
 f=>{const raw=f.ships[0].orderItem[0].asset;f.ships[0].orderItem[0].asset=Object.assign(Object.create({type:0}),raw);delete f.ships[0].orderItem[0].asset.type;}
 ];
 for(const mutate of mutations){const f=facts();mutate(f);assert.equal(operation(f).decision,'BLOCKED');assert.equal(cargoShortageView(f,{moduleConfig:settings}).ships[0].reliable,false);}
});
test('cargo outer collection rejects duplicate and sparse ship IDs, not just Array.every',()=>{
 for(const mutate of [f=>f.ships.push(structuredClone(f.ships[0])),f=>delete f.ships[0],f=>f.ships[0].index=0,f=>f.ships[0].index=2147483648]){
  const f=facts();mutate(f);assert.equal(cargoShortageView(f,{moduleConfig:settings}).reliable,false);assert.equal(planFleet(f,{moduleConfig:settings,selections:[]}).actions.length,0);assert.equal(candidates(f).some(row=>row.decision==='READY'),false);
 }
});
test('unreliable reward source blocks dispatch before accepting any response-defined expectation',()=>{
 for(const mutate of [f=>f.ships[0].orderItem[0].reward.asset[0].id='UNKNOWN_RESOURCE',f=>f.ships[0].orderItem[0].reward.asset[0].type=0,f=>f.ships[0].reward[0].num=-1,f=>delete f.ships[0].reward[0].num]){
  const f=facts();mutate(f);const op=operation(f);assert.equal(op.action,null);assert.equal(op.reason,'CARGO_FACTS_UNRELIABLE');
 }
});
test('resource and premium cargo costs never become a buying or acceleration request',()=>{
 for(const asset of [{type:1,id:'GOLD',num:1},{type:1,id:'RUBY',num:1},{type:0,id:'钻石',num:1}]){
  const f=facts();f.ships[0].orderItem[0].asset=asset;const op=operation(f);assert.equal(op.decision,'BLOCKED');assert.equal(op.action,null);
 }
 assert.equal(candidates(facts()).some(row=>/Buy|SpeedUp/.test(row.action?.request??'')),false);
});
test('all cargo slots and ships debit the existing shared ResourceLedger only once',()=>{
 const f=facts();f.ships[0].orderItem=[slot('木材',6),slot('木材',6)];f.ships.push(ship(2));f.ships[1].orderItem=[slot('木材',4)];
 const ledger=new ResourceLedger(f.stock);ledger.reserve([{id:'木材',num:1}]);
 const plan=planFleet(f,{moduleConfig:settings,selections:candidates(f).filter(row=>row.actionType==='cargoFill').map(row=>row.actionId),ledger});
 assert.deepEqual(plan.actions.map(row=>row.actionId),['fleet:cargoFill:1:1']);assert.equal(ledger.reserved.get('木材'),7);assert.ok(plan.notes.some(row=>row.includes('共享资源预算')));
});
test('full voyage identity changes when any cost, other slot, reward or original timestamp changes',()=>{
 const f=facts(),original=operation(f);
 for(const mutate of [f=>f.ships[0].orderItem[1].asset.num++,f=>f.ships[0].orderItem[1].filled=true,f=>f.ships[0].orderItem[0].reward.asset[0].num++,f=>f.ships[0].reward[0].num++]){
  const changed=structuredClone(f);mutate(changed);assert.notEqual(operation(changed).identity,original.identity);
 }
 const arrived=arrival().before,claim=operation(arrived,'cargoClaim');arrived.ships[0].arriveTime++;assert.notEqual(operation(arrived,'cargoClaim').identity,claim.identity);
});
test('nonterminal fill confirms exact slot, original typed reward and all inventory deltas',()=>{
 const before=facts(),{after,response}=fillResult(before),op=operation(before);assert.equal(verifyFleet(op,before,after,response).confirmed,true);assert.equal(after.ships[0].status,0);
 const terminal=structuredClone(before);terminal.ships[0].orderItem[1].filled=true;const done=fillResult(terminal);assert.equal(done.after.ships[0].status,1);assert.equal(verifyFleet(operation(terminal),terminal,done.after,done.response).confirmed,true);
});
test('old fill false positive without reward or inventory proof remains unconfirmed',()=>{
 const before=facts(),{after,response}=fillResult(before),op=operation(before);
 assert.equal(verifyFleet(op,before,after,{}).confirmed,false);after.stock=new Map(before.stock);assert.equal(verifyFleet(op,before,after,response).confirmed,false);
});
test('typed reward equality aggregates duplicate rows and accepts response order only',()=>{
 const before=facts(),{after}=fillResult(before),op=operation(before);
 assert.equal(verifyFleet(op,before,after,{reward:{asset:[{type:1,id:'GOLD',num:1},{type:1,id:'EXP',num:2},{type:1,id:'GOLD',num:2}]}}).confirmed,true);
 for(const asset of [[{type:1,id:'EXP',num:2}],[{type:0,id:'EXP',num:2},{type:1,id:'GOLD',num:3}],[{type:1,id:'EXP',num:2},{type:1,id:'GOLD',num:4}],[{type:1,id:'EXP',num:0},{type:1,id:'GOLD',num:3}],[{id:'EXP',num:2},{id:'GOLD',num:3}]]){
  assert.equal(verifyFleet(op,before,after,{reward:{asset}}).confirmed,false);
 }
});
test('fill rejects wrong slot, changed topology, wrong phase and other cargo mutation',()=>{
 const before=facts(),op=operation(before);
 for(const mutate of [f=>f.ships[0].orderItem[0].filled=false,f=>f.ships[0].orderItem[1].filled=true,f=>f.ships[0].orderItem[0].asset.num++,f=>f.ships[0].orderItem.reverse(),f=>f.ships[0].orderItem[1].reward.asset[0].num++,f=>f.ships[0].reward[0].num++,f=>{f.ships[0].status=1;f.ships[0].arriveTime=200;},f=>f.ships[0].orderItem.push(slot())]){
  const {after,response}=fillResult(before);mutate(after);assert.equal(verifyFleet(op,before,after,response).confirmed,false);
 }
});
test('fill rejects forged operation body, target, before state, costs and expectation',()=>{
 const before=facts(),{after,response}=fillResult(before);
 for(const mutate of [o=>o.action.body.cargoIndex=[2],o=>o.action.request='SpeedUpShipRequest',o=>o.action.response=null,o=>o.target.shipIndex=2,o=>o.costs[0].num++,o=>o.beforeState.ship.reward[0].num++,o=>o.identity='stale',o=>o.expectedState.reward[0].num++]){
  const op=operation(before);mutate(op);assert.equal(verifyFleet(op,before,after,response).confirmed,false);
 }
});
test('fill and claim reject under/over/wrong resource debits and unrelated inventory changes',()=>{
 for(const mutate of [f=>f.stock.set('木材',10),f=>f.stock.set('木材',5),f=>f.stock.set('EXP',10),f=>f.stock.set('GOLD',104),f=>f.stock.set('石头',4),f=>f.stock.set('EXP',0),f=>f.stock.set('木材',null),f=>f.stockReliable=false]){
  const before=facts(),{after,response}=fillResult(before);mutate(after);assert.equal(verifyFleet(operation(before),before,after,response).confirmed,false);
 }
 const {before,after,response}=arrival();after.stock.set('石头',4);assert.equal(verifyFleet(operation(before,'cargoClaim'),before,after,response).confirmed,false);
});
test('claim confirms only original arrival reward and exact full new ship response with inventory',()=>{
 const {before,after,response}=arrival(),op=operation(before,'cargoClaim');assert.equal(op.decision,'READY');assert.equal(verifyFleet(op,before,after,response).confirmed,true);
 const oldStyle={ship:{index:1},reward:{asset:[{id:'木材',num:1}]}};assert.equal(verifyFleet(op,before,after,oldStyle).confirmed,false);
});
test('claim rejects unrelated/invalid reward, unchanged inventory, stale returned ship and wrong old arrival',()=>{
 const base=arrival(),op=operation(base.before,'cargoClaim');
 const mutations=[
 ({after})=>after.stock.delete('藏品大师徽章'),({response})=>response.reward.asset[0].num++,({response})=>response.reward.asset[0].id='无关物品',
 ({response})=>response.reward.asset[0].num=0,({response})=>delete response.reward.asset[0].type,({response})=>response.ship={index:1},
 ({response})=>response.ship.orderItem[0].asset.num++,({after})=>after.ships[0].orderItem[0].filled=true,
 ({before})=>before.ships[0].arriveTime++,({after})=>{after.ships[0].status=1;after.ships[0].arriveTime=300;after.ships[0].orderItem.forEach(row=>row.filled=true);}
 ];
 for(const mutate of mutations){const value=structuredClone(base);mutate(value);assert.equal(verifyFleet(op,value.before,value.after,value.response).confirmed,false);}
});
test('strict inventory sources reject duplicate, sparse, inherited and type-colliding rows',()=>{
 const mutations=[
 f=>f.sources.AllItemRequest.body.items.push({...f.sources.AllItemRequest.body.items[0]}),
 f=>f.sources.AllResourceRequest.body.list.push({...f.sources.AllResourceRequest.body.list[0]}),
 f=>delete f.sources.AllItemRequest.body.items[0],f=>delete f.sources.AllResourceRequest.body.list[0],
 f=>f.sources.AllItemRequest.body.items.push({itemId:'GOLD',num:1}),
 f=>{const raw=f.sources.AllResourceRequest.body.list[0];f.sources.AllResourceRequest.body.list[0]=Object.assign(Object.create({amount:10}),raw);delete f.sources.AllResourceRequest.body.list[0].amount;},
 f=>delete f.sources.AllItemRequest.body.items[0].num,f=>f.sources.AllResourceRequest.available=false,
 f=>f.sources.AllItemRequest.body.items[0].num='9007199254740992'
 ];
 for(const mutate of mutations){const f=facts();f.sources=sources(f);mutate(f);assert.equal(cargoShortageView(f,{moduleConfig:settings}).inventoryReliable,false);assert.equal(operation(f).decision,'BLOCKED');}
});
test('strict source inventories still prove exact item and resource changes',()=>{
 const before=facts(),{after,response}=fillResult(before);before.sources=sources(before);after.sources=sources(after);assert.equal(verifyFleet(operation(before),before,after,response).confirmed,true);
 after.sources.AllResourceRequest.body.list.find(row=>row.res===1).amount=0;assert.equal(verifyFleet(operation(before),before,after,response).confirmed,false);
});
const requestNames=['MyFleetsRequest','AllItemRequest','AllResourceRequest','CargoShipsRequest','WorldInfoRequest','GuildInfoRequest','FillCargoShipRequest','DrawShipRewardRequest'];
const wire=Object.fromEntries(requestNames.flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}]]));
function transport(initial=facts(),onWrite=null){
 let current=structuredClone(initial);const calls=[],uncertain=[],confirmed=[];let abort;
 const client={connected:true,request:async(name,body,_response,_timeout,options)=>{
  calls.push({name,body:structuredClone(body),mutate:options?.mutate===true});
  if(name==='FillCargoShipRequest'||name==='DrawShipRewardRequest'){
   if(onWrite)return onWrite({name,body,current,set:value=>current=value,abort});
   if(name==='FillCargoShipRequest'){const result=fillResult(current,body.cargoIndex[0]);current=result.after;return result.response;}
   const result=arrival();current=result.after;return result.response;
  }
  const inventory=sources(current);
  return name==='AllItemRequest'?inventory.AllItemRequest.body:name==='AllResourceRequest'?inventory.AllResourceRequest.body:name==='CargoShipsRequest'?{ship:structuredClone(current.ships)}:name==='MyFleetsRequest'?{fleets:[]}:name==='WorldInfoRequest'?{cities:[]}:{};
 },markUnverifiedWrite:(...args)=>uncertain.push(args),confirmWatchedWrite:(...args)=>confirmed.push(args)};
 return {client,calls,uncertain,confirmed,set:value=>current=value,setAbort:value=>abort=value,get:()=>current};
}
test('real Fleet survey and existing executor fill through fixed read/write chain',async()=>{
 const t=transport();const before=await surveyFleet(t.client,wire,{moduleConfig:settings});const op=operation(before);
 const result=await executeBusinessOperation(t.client,wire,op,{adapter:fleetModule,moduleConfig:settings,allowMutate:true});
 assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(result.beforeInventoryReliable,true);assert.equal(result.afterInventoryReliable,true);assert.deepEqual(result.resourceReservation,[{id:'木材',num:4}]);
 assert.deepEqual(t.calls.filter(row=>row.mutate).map(row=>({name:row.name,body:row.body})),[{name:'FillCargoShipRequest',body:{shipIndex:1,cargoIndex:[1]}}]);assert.equal(t.confirmed.length,1);assert.equal(t.uncertain.length,0);
});
test('real Fleet executor claim verifies full response, original reward and authoritative resource survey',async()=>{
 const t=transport(arrival().before);const before=await surveyFleet(t.client,wire,{moduleConfig:settings});
 const result=await executeBusinessOperation(t.client,wire,operation(before,'cargoClaim'),{adapter:fleetModule,moduleConfig:settings,allowMutate:true});
 assert.equal(result.status,'SUCCESS');assert.deepEqual(result.resourceReservation,[]);assert.equal(result.responseEvidence.rewardMatched,true);assert.equal(result.responseEvidence.shipMatched,true);
 assert.deepEqual(t.calls.filter(row=>row.mutate).map(row=>row.name),['DrawShipRewardRequest']);
});
test('fresh voyage mutation or newly insufficient materials stops executor before any cargo dispatch',async()=>{
 for(const mutate of [f=>f.ships[0].orderItem[1].asset.num++,f=>f.ships[0].reward[0].num++,f=>f.stock.set('木材',0)]){
  const t=transport(),before=await surveyFleet(t.client,wire,{moduleConfig:settings}),op=operation(before),fresh=structuredClone(t.get());mutate(fresh);t.set(fresh);
  const result=await executeBusinessOperation(t.client,wire,op,{adapter:fleetModule,moduleConfig:settings,allowMutate:true});assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(t.calls.some(row=>row.mutate),false);
 }
});
test('typed acknowledgement alone remains UNKNOWN with reservation and no confirmation',async()=>{
 const t=transport(facts(),({current})=>({reward:structuredClone(current.ships[0].orderItem[0].reward)}));
 const before=await surveyFleet(t.client,wire,{moduleConfig:settings}),result=await executeBusinessOperation(t.client,wire,operation(before),{adapter:fleetModule,moduleConfig:settings,allowMutate:true});
 assert.equal(result.status,'UNKNOWN');assert.equal(result.requestStatus,'SUCCESS');assert.equal(result.unresolvedWrite,true);assert.deepEqual(result.resourceReservation,[{id:'木材',num:4}]);assert.equal(t.uncertain.length,1);assert.equal(t.confirmed.length,0);
});
test('post-dispatch cancellation and late successful cargo state stay UNKNOWN',async()=>{
 const abort=new AbortController(),t=transport(facts(),({current,set})=>{const result=fillResult(current);set(result.after);abort.abort();return result.response;});
 const before=await surveyFleet(t.client,wire,{moduleConfig:settings}),result=await executeBusinessOperation(t.client,wire,operation(before),{adapter:fleetModule,moduleConfig:settings,allowMutate:true,signal:abort.signal});
 assert.equal(result.status,'UNKNOWN');assert.equal(result.dispatched,true);assert.equal(result.unresolvedWrite,true);assert.deepEqual(result.resourceReservation,[{id:'木材',num:4}]);assert.equal(t.uncertain.length,1);assert.equal(t.confirmed.length,0);
});

test('each batch retains one exact voyage action per ship while different ships can run',()=>{
 const f=facts(),all=candidates(f).filter(row=>row.actionType==='cargoFill'),first=planFleet(f,{moduleConfig:settings,selections:all.map(row=>row.actionId)});
 assert.equal(first.actions.length,1);assert.ok(first.notes.some(row=>row.includes('重新读取并规划授权')));
 f.ships.push(ship(2));const across=candidates(f).filter(row=>row.actionType==='cargoFill'&&row.target.cargoIndex===1);
 const second=planFleet(f,{moduleConfig:settings,selections:across.map(row=>row.actionId)});assert.equal(second.actions.length,2);assert.deepEqual(second.actions.map(row=>row.target.shipIndex),[1,2]);
});
