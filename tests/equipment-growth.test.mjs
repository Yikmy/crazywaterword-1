import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EQUIPMENT_GROWTH_DEFAULT_CONFIG, EQUIPMENT_GROWTH_EVIDENCE, equipmentGrowthModule, validateEquipmentGrowthConfig, validateEquipmentGrowthParameters, surveyEquipmentGrowth, viewEquipmentGrowth, planEquipmentGrowth, verifyEquipmentGrowth, equipmentGrowthDependencyVersions } from '../src/equipment-growth.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { ResourceLedger, createRunBudgetContext } from '../src/resource-ledger.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { extractTables } from '../src/config.mjs';
const protocol=loadProtocol(),wire=(name,value)=>protocol[name].decode(protocol[name].encode(value).finish());
const uid='9007199254740993',otherUid='9007199254740994',idleUid='9007199254740995';
const equip=(value=uid,extra={})=>({uid:value,equipId:'蓝武器1',level:1,star:0,refineLv:0,attr:[{attr:1,value:1.5,rating:2}],rerollAttrs:[],...extra});
const hero=(heroId='A',value=uid,extra={})=>({heroId,level:10,star:2,power:'9007199254740997',attributes:[{attr:1,value:10.5}],skillLevels:[1,1],equips:[equip(value)],...extra});
const cfg=()=>({tables:{EquipCfg:{data:[{id:'蓝武器1',type:'武器'}]},EquipAttrCfg:{data:[{id:'蓝武器1',star:'0',maxLv:3}]},EquipUpDecomposeCfg:{data:[{level:1,upgradeCost:0},{level:2,upgradeCost:4},{level:3,upgradeCost:6}]}}});
const parameters=()=>({heroId:'A',uid}),player=()=>({playerId:'1001',worldId:1000001,level:20});
const options=(p=parameters(),config=cfg(),extra={})=>({config,parameters:p,moduleConfig:{enabled:true},player:player(),...extra});
function fake({wireMode=false,apply=true,derived=true,watchStatus='UNKNOWN',afterWrite}={}){
 const client={connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{accountId:'account-A',generation:1},pool:[equip(),equip(otherUid),equip(idleUid)],heroes:[hero(),hero('B',otherUid)],stock:new Map([['精铁',30],['GOLD',100],['其他',7]]),reads:[],writes:[],
 markUnverifiedWrite(name,body){this.uncertainWrites.set(JSON.stringify({name,body}),true);},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));},
 mutate(name,body){assert.equal(name,'EnhanceEquipRequest');this.writes.push({name,body:structuredClone(body)});if(apply){const row=this.pool.find(value=>value.uid===body.uid),owner=this.heroes.find(value=>value.equips.some(item=>item.uid===body.uid)),cost=row.level===1?4:6;row.level++;owner.equips.find(value=>value.uid===body.uid).level++;this.stock.set('精铁',this.stock.get('精铁')-cost);if(derived){owner.power=(BigInt(owner.power)+8n).toString();owner.attributes[0].value+=1.5;}}afterWrite?.(this);},
 async request(name,body,response){this.reads.push(name);const value=name==='EquipsRequest'?{equip:this.pool}:name==='AllHeroRequest'?{heroes:this.heroes}:name==='AllItemRequest'?{items:[...this.stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))}:name==='AllResourceRequest'?{list:[{res:3,amount:this.stock.get('GOLD')}]}:null;assert.ok(value,'unexpected read '+name);if(wireMode){wire(name,body);return wire(response,value);}return structuredClone(value);},
 async sendWatch(name,body){if(wireMode)wire(name,body);this.mutate(name,body);return {status:watchStatus};},
 };return client;
}
const survey=(client,p=parameters(),config=cfg(),extra={})=>surveyEquipmentGrowth(client,protocol,options(p,config,extra));
const plan=(facts,p=parameters(),config=cfg(),extra={})=>planEquipmentGrowth(facts,options(p,config,extra));
async function prepared(input={},config=cfg()){const client=fake(input),facts=await survey(client,parameters(),config),operation=plan(facts,parameters(),config).actions[0];assert.ok(operation,'expected executable candidate: '+JSON.stringify(viewEquipmentGrowth(facts,options(parameters(),config)).blocked));return {client,facts,operation,config};}
function budgetFor(operation,{iron=operation.costs[0].num,uids=[uid]}={}){const scope={accountId:'account-A',runId:'equipment-run',generation:1,connectionId:'equipment-connection'},limits={resources:[{id:'精铁',num:iron}],quotas:[],uids:uids.map(id=>({type:'equipment',id}))},runBudget=createRunBudgetContext({scope,limits});return {scope,runBudget,batchId:'equipment-batch',limits:operation.budgetClaims,ledger:null};}
const run=(client,operation,extra={})=>executeBusinessOperation(client,protocol,operation,{adapter:equipmentGrowthModule,...options(),allowMutate:true,budget:budgetFor(operation),...extra});

test('equipment growth is C229 only, default off and has no executor or hidden protocol parameters',()=>{
 assert.deepEqual(EQUIPMENT_GROWTH_DEFAULT_CONFIG,{enabled:false});assert.deepEqual(equipmentGrowthModule.capabilities,['C229']);assert.equal(equipmentGrowthModule.execute,undefined);assert.equal(equipmentGrowthModule.id,'equipment-growth');assert.equal(EQUIPMENT_GROWTH_EVIDENCE.realGame,'REAL_UNVERIFIED');assert.deepEqual(validateEquipmentGrowthParameters(parameters()),parameters());
 for(const value of [{uid:9007199254740993},{uid:'01'},{uid:'0'},{uid:'9223372036854775808'},{heroId:' A'},{request:'EnhanceEquipRequest'},{body:{uid}},{action:'level'},{allowUniversal:false},{uid,heroId:'A',targetLevel:2},Object.create({uid})])assert.throws(()=>validateEquipmentGrowthParameters(value),{code:'INVALID_PARAMETERS'});
 const getter={};Object.defineProperty(getter,'uid',{enumerable:true,get(){throw Error('must not read accessor');}});assert.throws(()=>validateEquipmentGrowthParameters(getter),{code:'INVALID_PARAMETERS'});assert.throws(()=>validateEquipmentGrowthConfig({enabled:true,paid:false}));
});

test('survey reads exact authority once and keeps full pool mirrors separate from idle bag',async()=>{
 const client=fake(),facts=await survey(client);assert.deepEqual([...client.reads].sort(),['AllHeroRequest','EquipsRequest','AllItemRequest','AllResourceRequest'].sort());assert.equal(client.writes.length,0);assert.equal(facts.stockReliable,true);assert.equal(facts.ownership.pool.length,3);assert.deepEqual(facts.ownership.bag.map(value=>value.uid),[idleUid]);assert.equal(facts.sourceFacts.ownership.provenance.source,'EquipsResponse+AllHeroResponse');assert.equal(facts.sourceFacts.inventory.provenance.source,'AllItemResponse+AllResourceResponse');assert.equal(facts.sourceFacts.ownership.provenance.reliability,'RELIABLE');assert.ok(facts.sourceFacts.ownership.provenance.sourceAt<=Date.now());
});

test('one explicit owned UID has exact next level, iron cost, config identity and UID claim',async()=>{
 const facts=await survey(fake()),operation=plan(facts).actions[0];assert.deepEqual(operation.action,{request:'EnhanceEquipRequest',response:null,body:{uid}});assert.deepEqual(operation.costs,[{id:'精铁',num:4}]);assert.deepEqual(operation.budgetClaims,{resources:[{id:'精铁',num:4}],quotas:[],uids:[{type:'equipment',id:uid}]});assert.equal(operation.expectedState.level,2);assert.equal(operation.expectedState.uid,uid);assert.match(operation.costSource,/EquipLevelBtn/);assert.equal(plan(facts,{}).actions.length,0);assert.equal(plan(facts,{heroId:'B',uid}).actions.length,0);assert.equal(plan(facts,{heroId:'A',uid:idleUid}).actions.length,0);assert.equal(plan(facts,parameters(),cfg(),{moduleConfig:EQUIPMENT_GROWTH_DEFAULT_CONFIG}).actions.length,0);
 assert.deepEqual(equipmentGrowthDependencyVersions(options()).moduleConfig,{enabled:true});assert.ok(equipmentGrowthDependencyVersions(options())['config.EquipUpDecomposeCfg']);
});

test('config stars normalize explicit decimal strings and green equipment uses zero-star base cap',async()=>{
 for(const star of [0,'0']){const config=cfg();config.tables.EquipAttrCfg.data[0].star=star;assert.equal(plan(await survey(fake(),parameters(),config),parameters(),config).actions.length,1);}
 const client=fake(),config=cfg();for(const row of client.pool)row.equipId='绿武器1';for(const h of client.heroes)for(const row of h.equips)row.equipId='绿武器1';client.pool[0].star=1;client.heroes[0].equips[0].star=1;config.tables.EquipCfg.data[0].id='绿武器1';config.tables.EquipAttrCfg.data[0].id='绿武器1';assert.equal(plan(await survey(client,parameters(),config),parameters(),config).actions.length,1);
});

test('level zero, cap, missing or nonpositive exact cost, unknown config and insufficient iron block without fallback',async()=>{
 for(const change of [c=>{c.pool[0].level=0;c.heroes[0].equips[0].level=0;},c=>{c.pool[0].level=3;c.heroes[0].equips[0].level=3;},c=>c.stock.set('精铁',3)]){const client=fake();change(client);assert.equal(plan(await survey(client)).actions.length,0);assert.equal(client.writes.length,0);}
 for(const change of [c=>c.tables.EquipUpDecomposeCfg.data.splice(1,1),c=>c.tables.EquipUpDecomposeCfg.data[1].upgradeCost=0,c=>delete c.tables.EquipUpDecomposeCfg.data[1].upgradeCost,c=>c.tables.EquipUpDecomposeCfg.data[1].upgradeCost=-1,c=>c.tables.EquipUpDecomposeCfg.data[1].upgradeCost=1.5,c=>c.tables.EquipUpDecomposeCfg.data[1].upgradeCost=Number.MAX_SAFE_INTEGER+1,c=>c.tables.EquipCfg.data.push(c.tables.EquipCfg.data[0]),c=>c.tables.EquipAttrCfg.data.push(c.tables.EquipAttrCfg.data[0]),c=>c.tables.EquipAttrCfg.data[0].star='00',c=>c.tables.EquipAttrCfg.data[0].maxLv=0,c=>c.tables.EquipUpDecomposeCfg.data.push(c.tables.EquipUpDecomposeCfg.data[1])]){const config=cfg();change(config);assert.equal(plan(await survey(fake(),parameters(),config),parameters(),config).actions.length,0);}
});

test('source freshness, raw projections and exact account player world generation remain authoritative',async()=>{
 const original=await survey(fake());for(const change of [f=>f.sourceFacts.ownership.provenance.sourceAt-=31000,f=>f.sourceFacts.inventory.provenance.sourceAt=Date.now()+60000,f=>f.sourceFacts.ownership.provenance.accountId='other',f=>f.sourceFacts.ownership.provenance.generation++,f=>f.sourceFacts.inventory.provenance.source='wrong',f=>f.ownership.pool[0].level++,f=>f.ownership.uids.pop(),f=>f.stock.set('精铁',999),f=>f.inputs.heroes.heroes[0].power='42',f=>f.catalog.levels[1].upgradeCost=1]){const facts=structuredClone(original);change(facts);assert.equal(plan(facts).actions.length,0);}
 for(const bad of [{worldId:0},{playerId:'0'},{}]){assert.equal(plan(await survey(fake(),parameters(),cfg(),{player:bad})).actions.length,0);}
});

test('complete pool conflicts missing fields and duplicate owner are rejected even with real codecs',async()=>{
 for(const change of [c=>c.pool.splice(0,1),c=>c.pool[0].level++,c=>c.pool.push(structuredClone(c.pool[0])),c=>c.heroes[1].equips.push(structuredClone(c.heroes[0].equips[0])),c=>delete c.heroes[0].equips[0].uid,c=>delete c.pool[0].level]){const client=fake({wireMode:true});change(client);const facts=await survey(client);assert.equal(facts.ownership,null);assert.equal(plan(facts).actions.length,0);}
});

test('target power and attributes need observed complete finite structured data',async()=>{
 for(const change of [c=>delete c.heroes[0].attributes,c=>c.heroes[0].attributes=[],c=>c.heroes[0].attributes=[{}],c=>c.heroes[0].attributes=[{attr:1,value:NaN}],c=>c.heroes[0].attributes=[{attr:1,value:Number.MAX_SAFE_INTEGER+1}],c=>c.heroes[0].attributes.push({attr:1,value:2}),c=>delete c.heroes[0].power]){const client=fake();change(client);assert.equal(plan(await survey(client)).actions.length,0);}
});

for(const wireMode of [false,true])for(const derived of [false,true])test('generic executor confirms only full single level and exact iron debit with codec '+wireMode+' derived '+derived,async()=>{
 const {client,operation}=await prepared({wireMode,derived}),stages=[];const result=await run(client,operation,{onStage(stage){stages.push(stage);}});assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(client.writes.length,1);assert.equal(client.pool[0].level,2);assert.equal(client.heroes[0].equips[0].level,2);assert.equal(client.stock.get('精铁'),26);assert.deepEqual(stages,['SURVEY','RESOURCE_PREFLIGHT','DISPATCH_INTENT','DISPATCHED','OBSERVATION_ENDED','VERIFY','VERIFIED']);assert.equal(client.uncertainWrites.size,0);
});

test('authority ordering may change and target derived values need not rise to prove exact equipment upgrade',async()=>{
 const {client,operation}=await prepared({afterWrite(c){c.pool.reverse();c.heroes.reverse();const owner=c.heroes.find(h=>h.heroId==='A');owner.power='1';owner.attributes=[{attr:2,value:0.25}];}});assert.equal((await run(client,operation)).status,'SUCCESS');
});

for(const watchStatus of ['UNKNOWN','SUCCESS'])test('watch '+watchStatus+' without authoritative effect remains UNKNOWN',async()=>{
 const {client,operation}=await prepared({apply:false,watchStatus}),result=await run(client,operation);assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,1);
});

test('wrong increment identity attr star refine owner or other hero changes cannot confirm',async()=>{
 const changes=[c=>{c.pool[0].level++;c.heroes[0].equips[0].level++;},c=>{c.pool[0].star++;c.heroes[0].equips[0].star++;},c=>{c.pool[0].attr[0].value++;c.heroes[0].equips[0].attr[0].value++;},c=>{c.pool[0].refineLv++;c.heroes[0].equips[0].refineLv++;},c=>{c.pool[0].uid='99';c.heroes[0].equips[0].uid='99';},c=>{c.pool[0].equipId='蓝武器2';c.heroes[0].equips[0].equipId='蓝武器2';},c=>c.heroes[0].level++,c=>c.heroes[0].skillLevels[0]++,c=>c.heroes[1].power='44',c=>{c.heroes[1].equips.push(c.heroes[0].equips.pop());},c=>c.pool.push(equip('99')),c=>c.pool.pop()];
 for(const afterWrite of changes){const {client,operation}=await prepared({afterWrite});assert.equal((await run(client,operation)).status,'UNKNOWN');assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,1);}
});

test('one-sided mirrors, incomplete post-derived facts and unrelated resource changes remain UNKNOWN',async()=>{
 for(const afterWrite of [c=>c.heroes[0].equips[0].level++,c=>delete c.heroes[0].attributes,c=>c.heroes[0].attributes=[],c=>c.heroes[0].attributes=[{attr:1,value:Infinity}],c=>c.heroes[0].attributes=[{value:3}],c=>c.stock.set('精铁',25),c=>c.stock.set('GOLD',99),c=>c.stock.set('reward',1)]){const {client,operation}=await prepared({afterWrite});assert.equal((await run(client,operation)).status,'UNKNOWN');assert.equal(client.writes.length,1);}
});

test('stale exact preview or changed dependencies stops before dispatch',async()=>{
 for(const change of [c=>{c.pool[0].level++;c.heroes[0].equips[0].level++;},c=>c.pool.push(equip('99')),c=>c.factContext.generation++,c=>c.factContext.accountId='other',c=>c.stock.set('精铁',0)]){const {client,operation}=await prepared();change(client);assert.equal((await run(client,operation)).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);}
 const {client,operation}=await prepared(),config=cfg();config.tables.EquipUpDecomposeCfg.data[1].upgradeCost=5;assert.equal((await run(client,operation,{config})).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);
});

test('verifier binds exact server-owned operation contract rather than a caller plan label',async()=>{
 const {client,facts,operation}=await prepared();client.mutate('EnhanceEquipRequest',{uid});const after=await survey(client);assert.equal(verifyEquipmentGrowth(operation,facts,after).confirmed,true);
 for(const change of [o=>o.costs[0].num=1,o=>o.expectedState.level=3,o=>o.action.body.uid=otherUid,o=>o.target.heroId='B',o=>o.budgetClaims.uids=[],o=>o.costSource='fake',o=>o.identity='fake']){const forged=structuredClone(operation);change(forged);assert.equal(verifyEquipmentGrowth(forged,facts,after).confirmed,false);}
});

test('finite parent resource and exact UID claims are both required and retain reservation after success',async()=>{
 for(const bound of [{iron:3},{uids:[]}]){const {client,operation}=await prepared(),budget=budgetFor(operation,bound),result=await run(client,operation,{budget});assert.equal(result.status,'NOT_EXECUTED');assert.equal(client.writes.length,0);}
 const {client,operation}=await prepared(),budget=budgetFor(operation,{iron:20}),first=await run(client,operation,{budget});assert.equal(first.status,'SUCCESS');const next=plan(await survey(client)).actions[0];assert.ok(next);const nextBudget={...budget,batchId:'next-batch',limits:next.budgetClaims,ledger:null};assert.equal((await run(client,next,{budget:nextBudget})).status,'NOT_EXECUTED');assert.equal(client.writes.length,1);assert.deepEqual(budget.runBudget.snapshot().reserved.uids,[{type:'equipment',id:uid}]);
});

test('cancellation before or after transport and late watch results never resend or fabricate success',async()=>{
 const first=await prepared(),before=new AbortController();before.abort();assert.equal((await run(first.client,first.operation,{signal:before.signal})).status,'CANCELLED');assert.equal(first.client.writes.length,0);
 const second=await prepared(),after=new AbortController();let release;second.client.sendWatch=async(name,body)=>{second.client.mutate(name,body);after.abort();return new Promise(resolve=>{release=()=>resolve({status:'SUCCESS'});});};const result=await run(second.client,second.operation,{signal:after.signal});assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);release();await Promise.resolve();assert.equal(result.status,'UNKNOWN');assert.equal(second.client.writes.length,1);
});

test('post-write read failure and durable stage failure remain UNKNOWN without retry',async()=>{
 for(const mode of ['read','history']){const {client,operation}=await prepared(),original=client.request.bind(client);if(mode==='read')client.request=async(name,...args)=>client.writes.length&&name==='EquipsRequest'?Promise.reject(Error('unavailable')):original(name,...args);const result=await run(client,operation,mode==='history'?{onStage(stage){if(stage==='DISPATCHED')throw Error('durable failure');}}:{});assert.equal(result.status,'UNKNOWN');assert.equal(client.writes.length,1);}
});

test('fixed real config supports exact C229 next cost and original string star cap without guessing',async()=>{
 const config={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))},client=fake();client.stock.set('精铁',100);const facts=await survey(client,parameters(),config),operation=plan(facts,parameters(),config).actions[0];assert.ok(operation);assert.deepEqual(operation.costs,[{id:'精铁',num:50}]);assert.equal(operation.expectedState.level,2);
});
for(const slowName of ['AllHeroRequest','AllResourceRequest'])test('slow '+slowName+' preserves every original response time and cannot refresh early facts',async()=>{
 const originalNow=Date.now;let now=1000000,release;Date.now=()=>now;
 try{const client=fake(),request=client.request.bind(client);client.request=async(name,...args)=>{const response=await request(name,...args);if(name===slowName)await new Promise(resolve=>{release=resolve;});return response;};
  const pending=survey(client);await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function');now+=31000;release();const facts=await pending;
  const delayed=slowName==='AllHeroRequest'?'heroes':'resources';assert.equal(facts.sourceFacts[delayed].provenance.sourceAt,1031000);
  for(const key of ['equips','heroes','items','resources'])if(key!==delayed)assert.equal(facts.sourceFacts[key].provenance.sourceAt,1000000);
  assert.equal(facts.sourceFacts.ownership.provenance.sourceAt,1000000);assert.equal(facts.sourceFacts.inventory.provenance.sourceAt,1000000);assert.equal(plan(facts).actions.length,0);
  const forged=structuredClone(facts);forged.sourceFacts.ownership.provenance.sourceAt=now;forged.sourceFacts.inventory.provenance.sourceAt=now;assert.equal(plan(forged).actions.length,0);
 }finally{Date.now=originalNow;}
});
test('expired equipment facts after asynchronous resource preflight never dispatch',async()=>{
 const originalNow=Date.now;let now=1000000;Date.now=()=>now;
 try{
  const {client,operation}=await prepared(),request=client.request.bind(client),budget=budgetFor(operation);
  const reads={AllItemRequest:0,AllResourceRequest:0};
  client.request=async(name,...args)=>{
   const response=await request(name,...args);
   if(Object.hasOwn(reads,name)&&++reads[name]===2){await new Promise(resolve=>setImmediate(resolve));now+=14900;}
   return response;
  };
  const result=await run(client,operation,{budget,onStage(stage){if(stage==='RESOURCE_PREFLIGHT')now+=500;}});
  assert.equal(now,1030300,'separate sub-timeout reads age the observed equipment facts beyond 30 seconds');
  assert.equal(client.writes.length,0,'expired authority must stop before EnhanceEquipRequest');
  assert.deepEqual(reads,{AllItemRequest:2,AllResourceRequest:2});
  assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(result.unresolvedWrite,false);
  assert.equal(client.stock.get('精铁'),30);assert.equal(client.pool[0].level,1);assert.equal(client.heroes[0].equips[0].level,1);assert.equal(client.uncertainWrites.size,0);
  // Expiry is observed during the final resource query, before reserveClaims.
  assert.deepEqual(budget.runBudget.snapshot().reserved,{resources:[],quotas:[],uids:[]});
 }finally{Date.now=originalNow;}
});
test('equipment facts expiring during dispatch-intent persistence never dispatch and retain conservative reservations',async()=>{
 const originalNow=Date.now;let now=1000000;Date.now=()=>now;
 try{
  const {client,operation}=await prepared(),budget=budgetFor(operation);
  const result=await run(client,operation,{budget,onStage(stage){if(stage==='DISPATCH_INTENT')now+=31000;}});
  assert.equal(client.writes.length,0,'synchronous persistence cannot bypass the final authority check');
  assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(result.unresolvedWrite,false);
  assert.equal(client.stock.get('精铁'),30);assert.equal(client.pool[0].level,1);assert.equal(client.heroes[0].equips[0].level,1);assert.equal(client.uncertainWrites.size,0);
  // Reservation was durably declared before this synchronous boundary. Keep it
  // conservatively locked under the current finite-parent contract.
  const reserved=budget.runBudget.snapshot().reserved;
  assert.deepEqual(reserved.resources,operation.costs);assert.deepEqual(reserved.uids,operation.budgetClaims.uids);
 }finally{Date.now=originalNow;}
});
test('equipment facts expiring in the final synchronous authority callback never dispatch',async()=>{
 const originalNow=Date.now;let now=1000000,intent=false,calls=0;Date.now=()=>now;
 try{
  const {client,operation}=await prepared(),budget=budgetFor(operation);
  const result=await run(client,operation,{budget,onStage(stage){if(stage==='DISPATCH_INTENT')intent=true;},assertCurrent(){if(intent&&++calls===2)now+=31000;}});
  assert.equal(client.writes.length,0,'the last authority I/O must precede the final pure domain eligibility check');
  assert.equal(result.status,'NOT_EXECUTED');assert.equal(result.dispatched,false);assert.equal(client.stock.get('精铁'),30);
  assert.deepEqual(budget.runBudget.snapshot().reserved.resources,operation.costs);
 }finally{Date.now=originalNow;}
});
