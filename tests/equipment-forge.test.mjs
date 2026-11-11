import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FORGE_DEFAULT_CONFIG, equipmentForgeModule, validateForgeConfig, validateForgeParameters, parseForgeQueue, parseForgeEquipment, surveyEquipmentForge, viewEquipmentForge, planEquipmentForge, verifyEquipmentForge, forgeDependencyVersions } from '../src/equipment-forge.mjs';
import { ResourceLedger, createRunBudgetContext } from '../src/resource-ledger.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { extractTables } from '../src/config.mjs';

const cfg=()=>({tables:{BuildingCfg:{data:[{buildingType:'装备厂'},{buildingType:'食品厂'}]},BuildingEquipMakeCfg:{data:[
  {makeId:1001,type:'武器',libId:1,seconds:1800,season:1,costItem:[['材料',4],['GOLD',20]]},
  {makeId:1004,type:'武器',libId:4,seconds:3600,season:2,costItem:[['红材料',8],['GOLD',50]]},
]},EquipMakeLibCfg:{data:[{libId:1,equipId:'蓝武器1',rate:100},{libId:1,equipId:'蓝武器2',rate:100},{libId:4,equipId:'红武器1',rate:100}]},EquipCfg:{data:[{id:'蓝武器1',type:'武器'},{id:'蓝武器2',type:'武器'},{id:'红武器1',type:'武器'}]}}});
const idle=()=>({makeId:0,finishTime:0,equipId:'',star:0});
const making=(extra={})=>({makeId:1001,finishTime:900,equipId:'蓝武器1',star:2,...extra});
const equip=(uid='9007199254740993',extra={})=>({uid,equipId:'蓝武器1',level:0,star:0,refineLv:0,attr:[{attr:1,value:1.5}],rerollAttrs:[],...extra});
const hero=(heroId='A',extra={})=>({heroId,level:1,star:1,power:'9007199254740995',skillLevels:[1],equips:[equip('9007199254740994')],...extra});
const building=(buildingId='1装备厂',queue=idle())=>({buildingId,level:1,buildStartTime:0,buildFinishTime:0,equipMaking:queue});
const player=()=>({id:'17',level:2,worldId:1000001});
const params=(action='make',extra={})=>({buildingId:'1装备厂',action,...(action==='make'?{makeId:1001}:{}),...extra});
const enabled={enabled:true};
const protocol=Object.fromEntries(['OnWaterRequest','OnWaterResponse','AllItemRequest','AllItemResponse','AllResourceRequest','AllResourceResponse','EquipsRequest','EquipsResponse','AllHeroRequest','AllHeroResponse','MakeEquipRequest','PickMadeEquipRequest','PickMadeEquipResponse'].map(n=>[n,{}]));
const wireProtocol=loadProtocol();
function wire(name,value){const t=wireProtocol[name];return t.decode(t.encode(value).finish());}
function fake({queue=idle(),afterWrite,response,watchStatus='UNKNOWN',stock={材料:20,红材料:20,GOLD:100},bag=[equip()],heroes=[hero()],buildings,clock=true,wireMode=false}={}){
  const client={connected:true,factContext:{accountId:'17',generation:1},stock:new Map(Object.entries(stock)),buildings:structuredClone(buildings??[building('1装备厂',queue)]),bag:structuredClone(bag),heroes:structuredClone(heroes),reads:[],writes:[],uncertainWrites:new Map(),nowMs:1000000,
    gameClock:{read(){return clock?{status:'TRUSTED',reliable:true,nowMs:client.nowMs,earliestMs:client.nowMs,latestMs:client.nowMs,accountId:client.factContext.accountId,generation:client.factContext.generation}:null;}},
    markUnverifiedWrite(request){this.uncertainWrites.set(request,true);},confirmWatchedWrite(request){this.uncertainWrites.delete(request);},
    mutate(name,body){this.writes.push({request:name,body:structuredClone(body)});const b=this.buildings.find(v=>v.buildingId===body.buildingId);let reply=null;
      if(name==='MakeEquipRequest'){b.equipMaking=making({makeId:body.makeId,finishTime:2000,equipId:body.makeId===1004?'红武器1':'蓝武器2'});this.stock.set('材料',this.stock.get('材料')-4);this.stock.set('GOLD',this.stock.get('GOLD')-20);}
      if(name==='PickMadeEquipRequest'){const q=b.equipMaking;reply={equipId:q.equipId};this.bag.push(equip('9007199254740996',{equipId:q.equipId,star:q.star,level:3,refineLv:2}));b.equipMaking=idle();}
      afterWrite?.(this,name,body);return response===undefined?reply:response;},
    async request(name,body,responseName){let value;
      if(!['MakeEquipRequest','PickMadeEquipRequest'].includes(name)){this.reads.push(name);if(name==='OnWaterRequest')value={building:structuredClone(this.buildings)};else if(name==='AllItemRequest')value={items:[...this.stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))};else if(name==='AllResourceRequest')value={list:[{res:3,amount:this.stock.get('GOLD')}]};else if(name==='EquipsRequest')value={equip:structuredClone(this.bag)};else if(name==='AllHeroRequest')value={heroes:structuredClone(this.heroes)};else throw Error('unexpected read '+name);}
      else value=this.mutate(name,body);
      if(wireMode){wire(name,body);return wire(responseName,value);}return value;},
    async sendWatch(name,body){if(wireMode)wire(name,body);this.mutate(name,body);return {status:watchStatus};},
  };return client;
}
const options=(parameters=params(),config=cfg(),extra={})=>({config,moduleConfig:enabled,parameters,player:player(),...extra});
const survey=(client,p=params(),c=cfg(),extra={})=>surveyEquipmentForge(client,protocol,options(p,c,extra));
const plan=(facts,p=params(),c=cfg(),extra={})=>planEquipmentForge(facts,options(p,c,extra));
async function prepared(p=params(),input={},c=cfg()){const client=fake(input),facts=await survey(client,p,c),operation=plan(facts,p,c).actions[0];return {client,facts,operation};}
const run=(client,operation,p=params(),extra={})=>executeBusinessOperation(client,protocol,operation,{adapter:equipmentForgeModule,...options(p),allowMutate:true,...extra});
async function changed(p=params(),input={}){const state=await prepared(p,input);state.response=state.client.mutate(state.operation.action.request,state.operation.action.body);state.after=await survey(state.client,p);return state;}

test('forge adapter default off has no executor and strict explicit single-action parameters',()=>{
  assert.deepEqual(FORGE_DEFAULT_CONFIG,{enabled:false});assert.equal(equipmentForgeModule.execute,undefined);assert.equal(equipmentForgeModule.id,'equipment-forge');
  assert.deepEqual(validateForgeParameters(params()),{...params(),allowUniversal:false});
  for(const value of [{request:'MakeEquipRequest'},{count:2},{action:'speed'},{action:'pick',makeId:1},{action:'pick',allowUniversal:false},{action:'make',makeId:0},{action:'make',makeId:'1001'},{buildingId:' x'},Object.create({action:'make'})])assert.throws(()=>validateForgeParameters(value),{code:'INVALID_PARAMETERS'});
  const getter={};Object.defineProperty(getter,'buildingId',{enumerable:true,get(){throw Error('not evaluated');}});assert.throws(()=>validateForgeParameters(getter),{code:'INVALID_PARAMETERS'});assert.throws(()=>validateForgeConfig({enabled:true,auto:true}));
});

test('forge queue needs all four own fields, never optional scalar defaults',()=>{
  assert.equal(parseForgeQueue(idle()).state,'IDLE');assert.equal(parseForgeQueue(making()).state,'MAKING');
  for(const raw of [undefined,null,{},Object.create(idle()),{...idle(),star:1},{...idle(),makeId:1},{...making(),finishTime:0},{...making(),equipId:''},{...making(),star:-1}])assert.equal(parseForgeQueue(raw),null);
  for(const key of Object.keys(idle())){const q=idle(),value=q[key];delete q[key];Object.setPrototypeOf(q,{[key]:value});assert.equal(parseForgeQueue(q),null);}
  const missing=wire('DispEquipMaking',{});assert.equal(missing.makeId,0);assert.equal(Object.hasOwn(missing,'makeId'),false);assert.equal(parseForgeQueue(missing),null);assert.equal(parseForgeQueue(wire('DispEquipMaking',idle())).state,'IDLE');
});

test('equipment parser keeps exact UID and double attributes, requires owned complete growth fields',()=>{
  const parsed=parseForgeEquipment(wire('DispEquip',equip()));assert.equal(parsed.uid,'9007199254740993');assert.equal(parsed.attr[0].value,1.5);
  for(const key of ['uid','equipId','level','star','refineLv','attr','rerollAttrs']){const raw=equip();delete raw[key];assert.equal(parseForgeEquipment(raw),null);}
  for(const raw of [equip('0'),equip('01'),equip('9223372036854775808'),equip(Number.MAX_SAFE_INTEGER+1),equip('1',{attr:Array(1)}),equip('1',{star:-1}),equip('1',{attr:[{}]}),equip('1',{rerollAttrs:[{attr:1}]}),equip('1',{attr:[{attr:1,value:NaN}]})])assert.equal(parseForgeEquipment(raw),null);
});

test('survey reuses original city collection and adds ownership reads only once',async()=>{
  const client=fake(),facts=await survey(client);assert.equal(facts.stockReliable,true);assert.equal(facts.ownership.bag[0].uid,'9007199254740993');assert.equal(facts.season,1);
  assert.deepEqual([...client.reads].sort(),['OnWaterRequest','AllItemRequest','AllResourceRequest','EquipsRequest','AllHeroRequest'].sort());assert.equal(client.writes.length,0);
});

test('forge requires one explicit target and recipe with default off and no fallback',async()=>{
  const facts=await survey(fake());assert.equal(plan(facts,{}).actions.length,0);assert.equal(plan(facts,{buildingId:'1装备厂',action:'make'}).actions.length,0);assert.equal(plan(facts,params(),cfg(),{moduleConfig:FORGE_DEFAULT_CONFIG}).actions.length,0);
  const operation=plan(facts).actions[0];assert.ok(operation);assert.deepEqual(operation.action,{request:'MakeEquipRequest',response:null,body:{buildingId:'1装备厂',makeId:1001,universal:false}});assert.deepEqual(operation.expectedState.equipIds,['蓝武器1','蓝武器2']);assert.equal(operation.expectedState.star,undefined);
  const poor=await survey(fake({stock:{材料:3,红材料:20,GOLD:100}}));assert.equal(plan(poor).actions.length,0);assert.equal(plan(poor,params('make',{makeId:1004})).actions.length,0);assert.equal(plan(facts,params('make',{allowUniversal:true})).actions.length,0);
});

test('missing, partial and null queues remain blocked and no pick-to-make composition occurs',async()=>{
  for(const q of [null,{},undefined,{...idle(),finishTime:1}]){const client=fake();if(q===undefined)delete client.buildings[0].equipMaking;else client.buildings[0].equipMaking=q;const f=await survey(client);assert.equal(plan(f).actions.length,0);assert.equal(plan(f,params('pick')).actions.length,0);}
  const client=fake({queue:making()}),f=await survey(client);assert.equal(plan(f).actions.length,0);assert.equal(plan(f,params('pick')).actions.length,1);assert.ok(viewEquipmentForge(f,options({})).candidates.every(v=>!v.executable||v.actionType==='PICK'));
});

test('season derives only from current session world and gates explicit recipe',async()=>{
  const client=fake(),c=cfg(),p=params('make',{makeId:1004});assert.equal(plan(await survey(client),p,c).actions.length,0);
  const f=await survey(client,p,c,{player:{...player(),worldId:2000001}});assert.equal(f.season,2);assert.equal(plan(f,p,c).actions.length,1);
  for(const worldId of [undefined,0,NaN,Number.MAX_SAFE_INTEGER+1,'garbage',1001]){const facts=await survey(client,p,c,{player:{...player(),worldId}});assert.equal(plan(facts,p,c).actions.length,0);}
});

test('maturity requires earliest trusted time and matching account-generation clock',async()=>{
  for(const setup of [c=>{c.gameClock.read=()=>null;},c=>{c.gameClock.read=()=>({status:'TRUSTED',reliable:true,nowMs:1000000,earliestMs:899000,latestMs:1001000,accountId:'17',generation:1});},c=>{c.gameClock.read=()=>({status:'TRUSTED',reliable:true,nowMs:1000000,earliestMs:1000000,latestMs:1000000,accountId:'18',generation:1});}]){const client=fake({queue:making()});setup(client);const f=await survey(client,params('pick'));assert.equal(plan(f,params('pick')).actions.length,0);f.now=999999;assert.equal(plan(f,params('pick')).actions.length,0);}
  const f=await survey(fake({queue:making({finishTime:1000})}),params('pick'));assert.equal(plan(f,params('pick')).actions.length,1);
});

test('duplicate bag/worn UID or malformed complete ownership blocks before dispatch',async()=>{
  for(const input of [{bag:[equip(),equip()]},{bag:[equip('9007199254740994')]},{heroes:[hero(),hero('B')]},{heroes:[hero('A',{equips:[{uid:'2'}]})]},{bag:[equip('1',{attr:Array(1)})]}]){const facts=await survey(fake(input));assert.equal(facts.ownership,null);assert.equal(plan(facts).actions.length,0);}
});

test('inventory aliases, duplicate raw IDs and unsafe quantities remain unknown',async()=>{
  for(const reply of [{items:[{itemId:'材料',num:5},{itemId:'材料',num:5}]},{items:[{itemId:'材料',id:'GOLD',num:5}]},{items:[{itemId:'材料',num:Number.MAX_SAFE_INTEGER+1}]},{items:Array(1)}]){const client=fake(),original=client.request.bind(client);client.request=async(n,...args)=>n==='AllItemRequest'?reply:original(n,...args);const f=await survey(client);assert.equal(f.stockReliable,false);assert.equal(plan(f).actions.length,0);}
});

test('malformed or duplicate config, invalid costs and library mismatch fail closed',async()=>{
  for(const mutate of [c=>c.tables.BuildingCfg.data.push(c.tables.BuildingCfg.data[0]),c=>c.tables.BuildingEquipMakeCfg.data.push(c.tables.BuildingEquipMakeCfg.data[0]),c=>c.tables.EquipMakeLibCfg.data.push(c.tables.EquipMakeLibCfg.data[0]),c=>c.tables.EquipCfg.data.push(c.tables.EquipCfg.data[0]),c=>c.tables.BuildingEquipMakeCfg.data[0].costItem=[['材料',null]],c=>c.tables.BuildingEquipMakeCfg.data[0].costItem=Array(1),c=>c.tables.EquipCfg.data[0].type='防具',c=>c.tables.EquipMakeLibCfg.data[0].rate=0,c=>c.tables.BuildingEquipMakeCfg.data[0].season=0]){const c=cfg();mutate(c);const f=await survey(fake(),params(),c);assert.equal(plan(f,params(),c).actions.length,0);}
});

test('selected recipe costs merge and reserve shared finite ledger without guessing queue quota',async()=>{
  const c=cfg();c.tables.BuildingEquipMakeCfg.data[0].costItem=[['材料',2],['材料',2],['GOLD',20]];const f=await survey(fake(),params(),c),ledger=new ResourceLedger(new Map([['材料',6],['GOLD',100]]));
  const first=plan(f,params(),c,{ledger});assert.equal(first.actions.length,1);assert.deepEqual(first.actions[0].costs,[{id:'材料',num:4},{id:'GOLD',num:20}]);assert.equal(plan(f,params(),c,{ledger}).actions.length,0);assert.equal(ledger.reserved.get('材料'),4);
});

test('D6 and universal routes remain forbidden regardless of ample stock',async()=>{
  const c=cfg();c.tables.BuildingEquipMakeCfg.data[0].costItem=[['RUBY',1]];const f=await survey(fake({stock:{RUBY:100,GOLD:100}}),params(),c);assert.equal(plan(f,params(),c).actions.length,0);const normal=await survey(fake());assert.equal(plan(normal,params('make',{allowUniversal:true})).actions.length,0);
});

for(const action of ['make','pick'])test('generic forge '+action+' confirms only fresh authority and exact inventory',async()=>{
  const p=params(action),{client,operation}=await prepared(p,action==='pick'?{queue:making()}:{}),result=await run(client,operation,p);assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,0);if(action==='make')assert.equal(client.writes[0].body.universal,false);else assert.equal(result.responseEvidence.uid,'9007199254740996');
});

test('make accepts either legal random output and nonzero server star without inventing exact duration',async()=>{
  for(const equipId of ['蓝武器1','蓝武器2']){const {client,facts,operation}=await prepared(),reply=client.mutate(operation.action.request,operation.action.body);client.buildings[0].equipMaking={makeId:1001,equipId,star:3,finishTime:1001};client.nowMs=1002000;const after=await survey(client);assert.equal(verifyEquipmentForge(operation,facts,after,reply).confirmed,true);assert.equal(plan(after).actions.length,0);}
});

test('make wrong queue, output, material delta or premature instance cannot confirm',async()=>{
  for(const mutate of [c=>c.buildings[0].equipMaking.makeId=1004,c=>c.buildings[0].equipMaking.equipId='红武器1',c=>delete c.buildings[0].equipMaking.star,c=>c.buildings[0].equipMaking.finishTime=0,c=>c.buildings[0].equipMaking.finishTime=999,c=>c.stock.set('材料',17),c=>c.stock.set('GOLD',79),c=>c.stock.set('额外奖励',1),c=>c.bag.push(equip('9007199254740996')),c=>c.heroes[0].power='99']){const {client,operation}=await prepared(params(),{afterWrite:mutate}),result=await run(client,operation);assert.equal(result.status,'UNKNOWN');assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,1);}
});

test('pick confirms only explicit idle plus exact typed reply and one new UID',async()=>{
  for(const omit of [false,true]){const p=params('pick'),{client,operation}=await prepared(p,{queue:making(),afterWrite(c){if(omit)delete c.buildings[0].equipMaking;}}),result=await run(client,operation,p);assert.equal(result.status,omit?'UNKNOWN':'SUCCESS');if(!omit)assert.equal(result.responseEvidence.star,2);if(omit){const f=await survey(client);assert.equal(plan(f).actions.length,0);}}
});

test('pick typed missing/default/wrong equipId or typed-only no effect stays UNKNOWN',async()=>{
  for(const reply of [{},{equipId:'红武器1'},wire('PickMadeEquipResponse',{}),Object.create({equipId:'蓝武器1'})]){const p=params('pick'),{client,operation}=await prepared(p,{queue:making(),response:reply});const result=await run(client,operation,p);assert.equal(result.status,'UNKNOWN');}
  const p=params('pick'),{client,operation}=await prepared(p,{queue:making(),afterWrite(c){c.buildings[0].equipMaking=making();c.bag.pop();}});assert.equal((await run(client,operation,p)).status,'UNKNOWN');
});

test('pick rejects partial/null/new queue and all unexpected UID, star, ownership or inventory movement',async()=>{
  for(const mutate of [c=>c.buildings[0].equipMaking=null,c=>c.buildings[0].equipMaking={},c=>c.buildings[0].equipMaking=making({finishTime:2000}),c=>c.bag.at(-1).star=0,c=>c.bag.at(-1).equipId='蓝武器2',c=>c.bag.at(-1).uid='9007199254740994',c=>c.bag.push(equip('9007199254740997')),c=>c.bag[0].level++,c=>c.bag.shift(),c=>c.heroes[0].level++,c=>c.stock.set('材料',19),c=>c.stock.set('奖励',1)]){const p=params('pick'),{client,operation}=await prepared(p,{queue:making(),afterWrite:mutate});assert.equal((await run(client,operation,p)).status,'UNKNOWN');assert.equal(client.writes.length,1);}
});

test('non-target buildings and original target fields are immutable for each action',async()=>{
  for(const action of ['make','pick'])for(const mutate of [c=>c.buildings[0].level++,c=>c.buildings[1].level++,c=>c.buildings.pop()]){const p=params(action),{client,operation}=await prepared(p,{queue:action==='make'?idle():making(),buildings:[building('1装备厂',action==='make'?idle():making()),building('1食品厂')],afterWrite:mutate});assert.equal((await run(client,operation,p)).status,'UNKNOWN');}
});

test('authority array ordering may change without changing equipment ownership',async()=>{
  const p=params('pick'),{client,operation}=await prepared(p,{queue:making(),bag:[equip('7'),equip('8')],heroes:[hero('A'),hero('B',{equips:[equip('9')]})],afterWrite(c){c.bag.reverse();c.heroes.reverse();}});assert.equal((await run(client,operation,p)).status,'SUCCESS');
});

test('source freshness, account/generation and projected/raw disagreement block planner',async()=>{
  const original=await survey(fake());for(const mutate of [f=>f.stock.set('材料',999),f=>f.ownership.bag[0].level++,f=>f.buildings[0].queue.state='IDLE_BAD',f=>f.sourceFacts.water.provenance.sourceAt-=31000,f=>f.sourceFacts.inventory.provenance.accountId='18',f=>f.sourceFacts.ownership.provenance.generation=2,f=>f.identityContext.worldId='2000001']){const f=structuredClone(original);mutate(f);assert.equal(plan(f).actions.length,0);}
});

test('stale exact queue, ownership, config or session invalidates generic operation before write',async()=>{
  for(const mutate of [c=>c.buildings[0].equipMaking=making(),c=>c.bag.push(equip('10')),c=>c.factContext.generation++,c=>c.stock.set('材料',0)]){const {client,operation}=await prepared();mutate(client);assert.equal((await run(client,operation)).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);}
  const {client,operation}=await prepared(),c=cfg();c.tables.BuildingEquipMakeCfg.data[0].costItem[0][1]++;assert.equal((await run(client,operation,params(),{config:c})).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);
});

test('stable selector binds fresh before state and config while old operation remains unusable',async()=>{
  const p=params('pick'),{client,facts,operation}=await prepared(p,{queue:making()});client.buildings[0].equipMaking.finishTime=800;const f=await survey(client,p),next=plan(f,p).actions[0];assert.equal(next.actionId,operation.actionId);assert.notEqual(next.identity,operation.identity);assert.equal((await run(client,operation,p)).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);
  const versions=forgeDependencyVersions(options());assert.ok(versions['config.EquipMakeLibCfg']);assert.equal(facts.season,1);
});

test('cancellation before dispatch stops and cancellation after dispatch retains UNKNOWN without retry',async()=>{
  const first=await prepared(),controller=new AbortController();controller.abort();assert.equal((await run(first.client,first.operation,params(),{signal:controller.signal})).status,'CANCELLED');assert.equal(first.client.writes.length,0);
  const second=await prepared(),afterController=new AbortController();second.client.sendWatch=async(name,body)=>{second.client.mutate(name,body);afterController.abort();return {status:'SUCCESS'};};const result=await run(second.client,second.operation,params(),{signal:afterController.signal});assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(second.client.writes.length,1);assert.equal(second.client.uncertainWrites.size,1);
});

test('late typed response after cancellation cannot turn an unconfirmed pick into success',async()=>{
  const p=params('pick'),{client,operation}=await prepared(p,{queue:making()}),controller=new AbortController(),original=client.request.bind(client);let release;client.request=async(name,...args)=>name==='PickMadeEquipRequest'?new Promise(resolve=>{release=()=>resolve(client.mutate(name,args[0]));controller.abort();}):original(name,...args);
  const result=await run(client,operation,p,{signal:controller.signal});assert.equal(result.status,'UNKNOWN');release();await Promise.resolve();assert.equal(result.status,'UNKNOWN');assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,1);
});

test('post-write authority failure and durable callback failure remain UNKNOWN and do not resend',async()=>{
  for(const mode of ['read','history']){const {client,operation}=await prepared(),original=client.request.bind(client);if(mode==='read')client.request=async(name,...args)=>client.writes.length&&name==='EquipsRequest'?Promise.reject(Error('unavailable')):original(name,...args);const result=await run(client,operation,params(),mode==='history'?{onStage(stage){if(stage==='DISPATCHED')throw Error('history unavailable');}}:{});assert.equal(result.status,'UNKNOWN');assert.equal(client.writes.length,1);}
});

test('generic forge consumes one parent resource budget across separate queue batches',async()=>{
  const {client,operation}=await prepared(),scope={accountId:'17',runId:'forge-run',generation:1,connectionId:'forge-connection'},parent=createRunBudgetContext({scope,limits:{resources:[{id:'材料',num:6},{id:'GOLD',num:100}],quotas:[],uids:[]}});
  const budget=batchId=>({runBudget:parent,scope,batchId,limits:{resources:operation.costs,quotas:[],uids:[]},ledger:null});assert.equal((await run(client,operation,params(),{budget:budget('forge-1')})).status,'SUCCESS');client.buildings[0].equipMaking=idle();client.stock.set('材料',100);const fresh=plan(await survey(client)).actions[0];assert.equal((await run(client,fresh,params(),{budget:budget('forge-2')})).status,'NOT_EXECUTED');assert.equal(client.writes.length,1);assert.deepEqual(parent.snapshot().reserved.resources,[{id:'材料',num:4},{id:'GOLD',num:20}]);
});

for(const action of ['make','pick'])test('real local codecs confirm complete forge '+action+' with synthetic client',async()=>{
  const p=params(action),client=fake({queue:action==='make'?idle():making(),wireMode:true}),opts=options(p),facts=await surveyEquipmentForge(client,wireProtocol,opts),operation=planEquipmentForge(facts,opts).actions[0];assert.ok(operation);const result=await executeBusinessOperation(client,wireProtocol,operation,{adapter:equipmentForgeModule,...opts,allowMutate:true});assert.equal(result.status,'SUCCESS');assert.equal(client.writes.length,1);assert.equal(result.verification.status,'CONFIRMED');
});

test('actual fixed config gives twelve explicit forge recipes without changing their costs',async()=>{
  const config={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))},client=fake({stock:{蓝武器材料:80,GOLD:5000}}),facts=await survey(client,params(),config),operation=plan(facts,params(),config).actions[0];assert.equal(facts.catalog.recipes.length,12);assert.ok(operation);assert.deepEqual(operation.costs,[{id:'蓝武器材料',num:40},{id:'GOLD',num:2000}]);assert.deepEqual(operation.expectedState.equipIds,['蓝武器1','蓝武器2']);
});