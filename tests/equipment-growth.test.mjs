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

// REFINE is BIZ-R09, not a new C capability or a second executor. Existing LEVEL
// fixtures above are unchanged, so their IDs/parameters/dependencies stay covered.
const refineParameters=()=>({heroId:'A',uid,action:'refine'});
const refineCfg=()=>({tables:{EquipCfg:{data:[{id:'红武器1',type:'武器',quality:'RED'}]},EquipAttrCfg:{data:[{id:'红武器1',star:'0',maxLv:135,maxRefineLv:2}]},EquipRefineCfg:{data:[{level:1,costItem1:4,costItem2:2},{level:2,costItem1:6,costItem2:3}]}}});
function refineFake({wireMode=false,apply=true,derived=true,watchStatus='UNKNOWN',afterWrite}={}){
 const client=fake({wireMode,apply,derived,watchStatus});
 for(const row of client.pool)row.equipId='红武器1';
 for(const h of client.heroes)for(const row of h.equips)row.equipId='红武器1';
 client.stock.set('精炼石',10);
 client.mutate=function(name,body){
  assert.equal(name,'EquipRefineRequest');this.writes.push({name,body:structuredClone(body)});
  if(apply){const row=this.pool.find(value=>value.uid===body.uid),owner=this.heroes.find(value=>value.equips.some(item=>item.uid===body.uid)),iron=row.refineLv===0?4:6,stone=row.refineLv===0?2:3;row.refineLv++;owner.equips.find(value=>value.uid===body.uid).refineLv++;this.stock.set('精铁',this.stock.get('精铁')-iron);this.stock.set('精炼石',this.stock.get('精炼石')-stone);if(derived){owner.power=(BigInt(owner.power)+8n).toString();owner.attributes[0].value+=1.5;}}
  afterWrite?.(this);
 };
 return client;
}
const refineSurvey=(client,config=refineCfg(),p=refineParameters(),extra={})=>surveyEquipmentGrowth(client,protocol,options(p,config,extra));
const refinePlan=(facts,config=refineCfg(),p=refineParameters(),extra={})=>planEquipmentGrowth(facts,options(p,config,extra));
async function refinePrepared(input={},config=refineCfg()){const client=refineFake(input),facts=await refineSurvey(client,config),operation=refinePlan(facts,config).actions[0];assert.ok(operation,'expected executable refine candidate: '+JSON.stringify(viewEquipmentGrowth(facts,options(refineParameters(),config)).blocked));return {client,facts,operation,config};}
function refineBudget(operation,{iron=operation.costs[0].num,stone=operation.costs[1].num,uids=[uid]}={}){
 const scope={accountId:'account-A',runId:'refine-run',generation:1,connectionId:'refine-connection'},limits={resources:[{id:'精铁',num:iron},{id:'精炼石',num:stone}],quotas:[],uids:uids.map(id=>({type:'equipment',id}))},runBudget=createRunBudgetContext({scope,limits});
 return {scope,runBudget,batchId:'refine-batch',limits:operation.budgetClaims,ledger:null};
}
const refineRun=(client,operation,config=refineCfg(),extra={})=>executeBusinessOperation(client,protocol,operation,{adapter:equipmentGrowthModule,...options(refineParameters(),config),allowMutate:true,budget:refineBudget(operation),...extra});

test('explicit refine selector alone extends the strict parameter whitelist and preserves omitted LEVEL',async()=>{
 assert.deepEqual(validateEquipmentGrowthParameters(refineParameters()),refineParameters());assert.deepEqual(validateEquipmentGrowthParameters({}),{});assert.equal(Object.hasOwn(validateEquipmentGrowthParameters(parameters()),'action'),false);
 for(const action of ['level','REFINE','star','replace',null,undefined,{},1])assert.throws(()=>validateEquipmentGrowthParameters({...parameters(),action}),{code:'INVALID_PARAMETERS'});
 for(const extra of [{request:'EquipRefineRequest'},{count:2},{targetRefineLv:1},{universal:false},{decomposeUid:[]}])assert.throws(()=>validateEquipmentGrowthParameters({...refineParameters(),...extra}),{code:'INVALID_PARAMETERS'});
 const inherited=Object.create({action:'refine'});inherited.heroId='A';inherited.uid=uid;assert.throws(()=>validateEquipmentGrowthParameters(inherited));
 const getter={...parameters()};Object.defineProperty(getter,'action',{enumerable:true,get(){throw Error('must not access');}});assert.throws(()=>validateEquipmentGrowthParameters(getter),{code:'INVALID_PARAMETERS'});
 const {operation}=await refinePrepared();assert.equal(operation.actionType,'REFINE');assert.match(operation.actionId,/^equipment-growth:REFINE:/);assert.deepEqual(operation.parameters,refineParameters());assert.equal(operation.expectedState.level,1);assert.equal(operation.expectedState.refineLv,1);assert.deepEqual(operation.action,{request:'EquipRefineRequest',response:null,body:{uid}});
 assert.deepEqual(operation.costs,[{id:'精铁',num:4},{id:'精炼石',num:2}]);assert.deepEqual(operation.budgetClaims,{resources:operation.costs,quotas:[],uids:[{type:'equipment',id:uid}]});assert.deepEqual(Object.keys(operation.configEvidence),['EquipCfg','EquipAttrCfg','EquipRefineCfg']);assert.match(operation.costSource,/EquipDetailPop/);
 assert.equal(protocol.EquipRefineResponse,undefined);assert.equal(equipmentGrowthModule.execute,undefined);assert.deepEqual(equipmentGrowthModule.capabilities,['C229']);
});

test('refine view preserves selected mode for every candidate and cannot silently select LEVEL',async()=>{
 const client=refineFake(),config=refineCfg(),facts=await refineSurvey(client,config,{action:'refine'}),view=viewEquipmentGrowth(facts,options({action:'refine'},config));
 assert.equal(view.candidates.length,2);assert.ok(view.candidates.every(row=>row.actionType==='REFINE'&&row.parameters.action==='refine'&&row.action.request==='EquipRefineRequest'));assert.equal(refinePlan(facts,config,{}).actions.length,0);
 assert.equal(refinePlan(facts,config,{action:'refine'}).actions.length,0,'view listing does not grant an implicit hero or UID');
 assert.equal(refinePlan(facts,config,refineParameters(),{moduleConfig:{enabled:false}}).actions.length,0);
});

test('LEVEL identity and dependency values ignore refinement tables while REFINE ignores level tables',async()=>{
 const lc=cfg(),levelFacts=await survey(fake(),parameters(),lc),before=plan(levelFacts,parameters(),lc).actions[0],augmented=structuredClone(lc);augmented.tables.EquipRefineCfg=refineCfg().tables.EquipRefineCfg;
 const after=plan(levelFacts,parameters(),augmented).actions[0];for(const key of ['actionId','identity','action','costs','costSource','configEvidence','expectedState','parameters'])assert.deepEqual(after[key],before[key],key);
 assert.deepEqual(Object.keys(equipmentGrowthDependencyVersions(options())),['moduleConfig','config.EquipCfg','config.EquipAttrCfg','config.EquipUpDecomposeCfg']);
 const rc=refineCfg(),base=equipmentGrowthDependencyVersions(options(refineParameters(),rc)),unrelated=structuredClone(rc);unrelated.tables.EquipUpDecomposeCfg={revision:9,data:[]};assert.deepEqual(equipmentGrowthDependencyVersions(options(refineParameters(),unrelated)),base);
 assert.deepEqual(Object.keys(base),['moduleConfig','config.EquipCfg','config.EquipAttrCfg','config.EquipRefineCfg']);
 for(const table of ['EquipCfg','EquipAttrCfg','EquipRefineCfg']){const changed=structuredClone(rc);changed.tables[table].revision=2;assert.notDeepEqual(equipmentGrowthDependencyVersions(options(refineParameters(),changed)),base);}
});

test('refine requires RED, exact star cap, explicit active ownership and both sufficient materials',async()=>{
 for(const mutate of [
  c=>{c.pool[0].level=0;c.heroes[0].equips[0].level=0;},
  c=>{delete c.pool[0].refineLv;delete c.heroes[0].equips[0].refineLv;},
  c=>{c.pool[0].refineLv=2;c.heroes[0].equips[0].refineLv=2;},
  c=>{c.pool[0].star=1;c.heroes[0].equips[0].star=1;},
  c=>c.stock.set('精铁',3),c=>c.stock.set('精炼石',1),
  c=>c.heroes[1].equips.push(structuredClone(c.heroes[0].equips[0])),
  c=>c.pool.shift(),c=>c.pool[0].refineLv++,
  c=>delete c.heroes[0].attributes,
 ]){const client=refineFake();mutate(client);assert.equal(refinePlan(await refineSurvey(client)).actions.length,0);assert.equal(client.writes.length,0);}
 const config=refineCfg();config.tables.EquipCfg.data[0].quality='ORANGE';assert.equal(refinePlan(await refineSurvey(refineFake(),config),config).actions.length,0);
 for(const p of [{heroId:'B',uid,action:'refine'},{heroId:'A',uid:idleUid,action:'refine'}])assert.equal(refinePlan(await refineSurvey(refineFake()),refineCfg(),p).actions.length,0);
 for(const star of [0,'0']){const config=refineCfg();config.tables.EquipAttrCfg.data[0].star=star;assert.equal(refinePlan(await refineSurvey(refineFake(),config),config).actions.length,1);}
});

test('refine config rejects absent ambiguous nonpositive or unsafe costs and caps without fallback',async()=>{
 for(const mutate of [
  c=>delete c.tables.EquipRefineCfg,c=>c.tables.EquipRefineCfg.data.splice(0,1),
  c=>c.tables.EquipRefineCfg.data[0].costItem1=0,c=>c.tables.EquipRefineCfg.data[0].costItem2=0,
  c=>c.tables.EquipRefineCfg.data[0].costItem1=-1,c=>c.tables.EquipRefineCfg.data[0].costItem2=1.5,
  c=>c.tables.EquipRefineCfg.data[0].costItem1=2147483648,c=>c.tables.EquipRefineCfg.data[0].costItem2='2',
  c=>delete c.tables.EquipRefineCfg.data[0].costItem2,c=>c.tables.EquipRefineCfg.data.push(c.tables.EquipRefineCfg.data[0]),
  c=>delete c.tables.EquipCfg.data[0].quality,c=>c.tables.EquipCfg.data[0].quality='UNKNOWN',
  c=>c.tables.EquipCfg.data.push(c.tables.EquipCfg.data[0]),
  c=>delete c.tables.EquipAttrCfg.data[0].maxRefineLv,c=>c.tables.EquipAttrCfg.data[0].maxRefineLv=0,
  c=>c.tables.EquipAttrCfg.data[0].maxRefineLv=-1,c=>c.tables.EquipAttrCfg.data[0].maxRefineLv=1.5,
  c=>c.tables.EquipAttrCfg.data[0].star='00',c=>c.tables.EquipAttrCfg.data.push(c.tables.EquipAttrCfg.data[0]),
 ]){const config=refineCfg();mutate(config);const client=refineFake();assert.equal(refinePlan(await refineSurvey(client,config),config).actions.length,0);assert.equal(client.writes.length,0);}
});

test('refine source facts and raw projections retain account world generation and original freshness',async()=>{
 const original=await refineSurvey(refineFake());
 for(const mutate of [f=>f.sourceFacts.ownership.provenance.sourceAt-=31000,f=>f.sourceFacts.inventory.provenance.sourceAt=Date.now()+60000,f=>f.sourceFacts.equips.provenance.generation++,f=>f.sourceFacts.heroes.provenance.accountId='other',f=>f.sourceFacts.inventory.provenance.scope={kind:'CURRENT_RESPONSE_ONLY',key:'one'},f=>f.catalog.refines[0].costItem2=1,f=>f.stock.set('精炼石',999),f=>f.inputs.equips.equip[0].refineLv++,f=>f.ownership.pool[0].refineLv++]){const facts=structuredClone(original);mutate(facts);assert.equal(refinePlan(facts).actions.length,0);}
 const client=refineFake(),available={...protocol};delete available.EquipRefineRequest;const facts=await surveyEquipmentGrowth(client,available,options(refineParameters(),refineCfg()));assert.equal(refinePlan(facts).actions.length,0);
});

for(const wireMode of [false,true])for(const derived of [false,true])test('REFINE full exact authority confirms single increment with codec '+wireMode+' derived '+derived,async()=>{
 const {client,operation,config}=await refinePrepared({wireMode,derived});const result=await refineRun(client,operation,config);assert.equal(result.status,'SUCCESS');assert.equal(result.verification.status,'CONFIRMED');assert.equal(result.responseEvidence,null);assert.equal(client.writes.length,1);assert.equal(client.pool[0].refineLv,1);assert.equal(client.heroes[0].equips[0].refineLv,1);assert.equal(client.stock.get('精铁'),26);assert.equal(client.stock.get('精炼石'),8);assert.equal(client.uncertainWrites.size,0);assert.equal(client.pool[0].level,1);
});

for(const watchStatus of ['UNKNOWN','SUCCESS'])test('REFINE no effect watch '+watchStatus+' retains UNKNOWN',async()=>{
 const {client,operation,config}=await refinePrepared({apply:false,watchStatus}),budget=refineBudget(operation),result=await refineRun(client,operation,config,{budget});
 assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(client.uncertainWrites.size,1);assert.equal(client.writes.length,1);assert.deepEqual(budget.runBudget.snapshot().reserved.resources,operation.costs);assert.deepEqual(budget.runBudget.snapshot().reserved.uids,operation.budgetClaims.uids);
});

test('REFINE exact instance and two-resource effects reject every unrelated mutation',async()=>{
 const changes=[
  c=>{c.pool[0].refineLv++;c.heroes[0].equips[0].refineLv++;},
  c=>{c.pool[0].level++;c.heroes[0].equips[0].level++;},
  c=>{c.pool[0].star++;c.heroes[0].equips[0].star++;},
  c=>{c.pool[0].attr[0].value++;c.heroes[0].equips[0].attr[0].value++;},
  c=>{c.pool[0].rerollAttrs.push({attr:2,value:1.5});c.heroes[0].equips[0].rerollAttrs.push({attr:2,value:1.5});},
  c=>c.heroes[0].equips[0].refineLv++,
  c=>c.pool[2].refineLv++,c=>c.pool.pop(),c=>c.pool.push({...equip('99'),equipId:'红武器1'}),
  c=>c.heroes[1].equips.push(c.heroes[0].equips.pop()),c=>c.heroes[0].level++,c=>c.heroes[1].power='44',
  c=>c.stock.set('精铁',27),c=>c.stock.set('精炼石',9),c=>c.stock.set('GOLD',99),c=>c.stock.set('reward',1),
  c=>delete c.heroes[0].attributes,c=>c.heroes[0].attributes=[{attr:1,value:Infinity}],
 ];
 for(const afterWrite of changes){const {client,operation,config}=await refinePrepared({afterWrite}),result=await refineRun(client,operation,config);assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);assert.equal(client.writes.length,1);assert.equal(client.uncertainWrites.size,1);}
});

test('REFINE verifier rebuilds its full branch contract and cannot accept LEVEL or forged costs',async()=>{
 const {client,facts,operation,config}=await refinePrepared();client.mutate('EquipRefineRequest',{uid});const after=await refineSurvey(client,config);assert.equal(verifyEquipmentGrowth(operation,facts,after).confirmed,true);
 for(const mutate of [o=>delete o.parameters.action,o=>o.actionType='LEVEL',o=>o.action.request='EnhanceEquipRequest',o=>o.costs[0].num=1,o=>o.costs[1].num=1,o=>o.costs.pop(),o=>o.expectedState.refineLv=2,o=>o.expectedState.level=2,o=>o.budgetClaims.uids=[],o=>o.configEvidence.EquipRefineCfg.data[0].costItem2=1,o=>o.identity='fake',o=>o.costSource='fake']){const op=structuredClone(operation);mutate(op);assert.equal(verifyEquipmentGrowth(op,facts,after).confirmed,false);}
});

test('REFINE stale preview changed authority mode or relevant config stops before dispatch',async()=>{
 for(const mutate of [c=>{c.pool[0].refineLv++;c.heroes[0].equips[0].refineLv++;},c=>c.pool[2].level++,c=>c.factContext.generation++,c=>c.factContext.accountId='other',c=>c.stock.set('精炼石',0)]){
  const {client,operation,config}=await refinePrepared();mutate(client);assert.equal((await refineRun(client,operation,config)).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);
 }
 const {client,operation,config}=await refinePrepared();config.tables.EquipRefineCfg.data[0].costItem2++;assert.equal((await refineRun(client,operation,config)).status,'NOT_EXECUTED');assert.equal(client.writes.length,0);
});

test('REFINE budget claims reserve both resources atomically and prohibit same UID reuse',async()=>{
 for(const bounds of [{iron:3},{stone:1},{uids:[]}]){const {client,operation,config}=await refinePrepared(),budget=refineBudget(operation,bounds),result=await refineRun(client,operation,config,{budget});assert.equal(result.status,'NOT_EXECUTED');assert.equal(client.writes.length,0);assert.deepEqual(budget.runBudget.snapshot().reserved,{resources:[],quotas:[],uids:[]});}
 const {client,operation,config}=await refinePrepared(),budget=refineBudget(operation,{iron:30,stone:10});assert.equal((await refineRun(client,operation,config,{budget})).status,'SUCCESS');
 const next=refinePlan(await refineSurvey(client,config),config).actions[0];assert.ok(next);const nextBudget={...budget,batchId:'refine-next',limits:next.budgetClaims,ledger:null};assert.equal((await refineRun(client,next,config,{budget:nextBudget})).status,'NOT_EXECUTED');assert.equal(client.writes.length,1);assert.deepEqual(budget.runBudget.snapshot().reserved.uids,operation.budgetClaims.uids);
});

test('REFINE cancellation and late responses never resend or fabricate confirmation',async()=>{
 const first=await refinePrepared(),before=new AbortController();before.abort();assert.equal((await refineRun(first.client,first.operation,first.config,{signal:before.signal})).status,'CANCELLED');assert.equal(first.client.writes.length,0);
 const second=await refinePrepared(),after=new AbortController();let release;second.client.sendWatch=async(name,body)=>{second.client.mutate(name,body);after.abort();return new Promise(resolve=>{release=()=>resolve({status:'SUCCESS'});});};const result=await refineRun(second.client,second.operation,second.config,{signal:after.signal});assert.equal(result.status,'UNKNOWN');assert.equal(result.unresolvedWrite,true);release();await Promise.resolve();assert.equal(result.status,'UNKNOWN');assert.equal(second.client.writes.length,1);
});

test('REFINE post-read or persistence failure stays UNKNOWN without replay',async()=>{
 for(const mode of ['read','history']){const {client,operation,config}=await refinePrepared(),request=client.request.bind(client);if(mode==='read')client.request=async(name,...args)=>client.writes.length&&name==='EquipsRequest'?Promise.reject(Error('unavailable')):request(name,...args);const result=await refineRun(client,operation,config,mode==='history'?{onStage(stage){if(stage==='DISPATCHED')throw Error('durable failure');}}:{});assert.equal(result.status,'UNKNOWN');assert.equal(client.writes.length,1);}
});

test('REFINE preflight and persistence expiry preserve zero dispatch with exact reservation timing',async()=>{
 const originalNow=Date.now;let now=1000000;Date.now=()=>now;
 try{
  for(const mode of ['preflight','intent']){now=1000000;const {client,operation,config}=await refinePrepared(),budget=refineBudget(operation),request=client.request.bind(client),reads={AllItemRequest:0,AllResourceRequest:0};
   if(mode==='preflight')client.request=async(name,...args)=>{const response=await request(name,...args);if(Object.hasOwn(reads,name)&&++reads[name]===2){await new Promise(resolve=>setImmediate(resolve));now+=14900;}return response;};
   const result=await refineRun(client,operation,config,{budget,onStage(stage){if(mode==='preflight'&&stage==='RESOURCE_PREFLIGHT')now+=500;if(mode==='intent'&&stage==='DISPATCH_INTENT')now+=31000;}});
   assert.equal(client.writes.length,0);assert.equal(result.status,'NOT_EXECUTED');assert.equal(client.stock.get('精铁'),30);assert.equal(client.stock.get('精炼石'),10);const reserved=budget.runBudget.snapshot().reserved;
   if(mode==='preflight')assert.deepEqual(reserved,{resources:[],quotas:[],uids:[]});else{assert.deepEqual(reserved.resources,operation.costs);assert.deepEqual(reserved.uids,operation.budgetClaims.uids);}
  }
 }finally{Date.now=originalNow;}
});

test('fixed actual REFINE config selects exact first cost cap and refuses nonRED without guessing',async()=>{
 const config={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))},client=refineFake();client.stock.set('精铁',100000);client.stock.set('精炼石',1000);
 const operation=refinePlan(await refineSurvey(client,config),config).actions[0];assert.ok(operation);assert.deepEqual(operation.costs,[{id:'精铁',num:90500},{id:'精炼石',num:100}]);assert.equal(operation.expectedState.refineLv,1);
 for(const row of [client.pool[0],client.heroes[0].equips[0]])row.refineLv=10;assert.equal(refinePlan(await refineSurvey(client,config),config).actions.length,0);
 for(const row of [client.pool[0],client.heroes[0].equips[0]]){row.star=1;row.refineLv=10;}const next=refinePlan(await refineSurvey(client,config),config).actions[0];assert.ok(next===undefined,'next star permits cap but stock cannot afford 108500 iron');
 client.stock.set('精铁',200000);assert.deepEqual(refinePlan(await refineSurvey(client,config),config).actions[0].costs,[{id:'精铁',num:108500},{id:'精炼石',num:120}]);
});