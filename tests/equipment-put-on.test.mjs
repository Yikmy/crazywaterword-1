import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  EQUIPMENT_PUT_ON_EVIDENCE, equipmentGrowthDependencyVersions, equipmentGrowthModule,
  planEquipmentGrowth, surveyEquipmentGrowth, validateEquipmentGrowthParameters, verifyEquipmentGrowth, viewEquipmentGrowth,
} from '../src/equipment-growth.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
import { extractTables } from '../src/config.mjs';
import { toSnapshotJson } from '../src/game.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { createRunBudgetContext } from '../src/resource-ledger.mjs';

const protocol=loadProtocol();
const wire=(type,body)=>protocol[type].decode(protocol[type].encode(body).finish());
const uid='9007199254740993', armorUid='9007199254740994', otherUid='9007199254740995', idleArmorUid='9007199254740996';
const parameters={heroId:'A',uid,action:'put-on'};
const player={playerId:'17',worldId:'9',level:16};
const config=()=>({tables:{
  EquipCfg:{revision:1,data:[{id:'蓝武器1',type:'武器'},{id:'蓝防具1',type:'防具'}]},
  ModuleOpenCfg:{revision:1,data:[{moduleId:'英雄装备',playerLevel:16}]},
}});
const options=(cfg=config(),extra={})=>({parameters,config:cfg,player,moduleConfig:{enabled:true},...extra});
const equipment=(uid,equipId='蓝武器1')=>({uid,equipId,level:1,star:0,refineLv:0,attr:[{attr:1,value:1.5,rating:2}],rerollAttrs:[]});
const hero=(heroId,equips=[])=>({heroId,level:10,star:1,power:'9007199254741000',attributes:[{attr:1,value:10.5}],skillLevels:[1],equips:structuredClone(equips)});
const action={request:'PutOnEquipRequest',response:null,body:{uid,heroId:'A'}};
const claims={resources:[],quotas:[],uids:[{type:'equipment',id:uid}]};

function fake({codec=false,apply=true,watchStatus='UNKNOWN',afterWrite,onWatch}={}){
  const pool=[equipment(uid),equipment(armorUid,'蓝防具1'),equipment(otherUid),equipment(idleArmorUid,'蓝防具1')];
  return {
    connected:true,factContext:{accountId:'equip-account',generation:3,connectionId:'equip-connection'},
    pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),
    pool,heroes:[hero('A',[pool[1]]),hero('B',[pool[2]])],stock:new Map([['GOLD',500],['其他',1]]),reads:[],writes:[],
    markUnverifiedWrite(name,body){this.uncertainWrites.set(JSON.stringify({name,body}),true);},
    confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));},
    async request(name,body,type){
      this.reads.push(name);
      const value={
        EquipsRequest:()=>({equip:this.pool}),AllHeroRequest:()=>({heroes:this.heroes}),
        AllItemRequest:()=>({items:[...this.stock].filter(([id])=>id!=='GOLD').map(([itemId,num])=>({itemId,num}))}),
        AllResourceRequest:()=>({list:[{res:3,amount:this.stock.get('GOLD')}]}),
      }[name]?.();
      assert.ok(value,'unexpected read '+name);
      if(codec)wire(name,body);
      return codec?wire(type,value):structuredClone(value);
    },
    async sendWatch(name,body,{beforeDispatch}={}){
      beforeDispatch?.();
      assert.equal(name,action.request);
      if(codec)assert.deepEqual(toSnapshotJson(wire(name,body)),body);
      this.writes.push({name,body:structuredClone(body)});
      if(apply){
        const target=this.heroes.find(h=>h.heroId===body.heroId),item=this.pool.find(row=>row.uid===body.uid);
        target.equips.push(structuredClone(item));target.power=(BigInt(target.power)+8n).toString();target.attributes[0].value++;
      }
      afterWrite?.(this);
      if(onWatch)return onWatch();
      return {status:watchStatus};
    },
  };
}

const survey=(client,cfg,extra)=>surveyEquipmentGrowth(client,protocol,options(cfg,extra));
const plan=(facts,cfg,extra)=>planEquipmentGrowth(facts,options(cfg,extra));

async function prepared(input,cfg=config()){
  const client=fake(input),before=await survey(client,cfg),operation=plan(before,cfg).actions[0];
  assert.ok(operation,JSON.stringify(viewEquipmentGrowth(before,options(cfg)).blocked));
  return {client,cfg,before,operation};
}

function budgetFor(limits=claims){
  const scope={...fake().factContext,runId:'equip-run'};
  return {scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'equip-batch',limits:claims,ledger:null};
}

const run=({client,cfg,operation},extra={})=>executeBusinessOperation(client,protocol,operation,{
  ...options(cfg),adapter:equipmentGrowthModule,allowMutate:true,budget:budgetFor(),...extra,
});

test('PUT-ON is explicit with only target identifiers, preserves C229 and validates its fixed codec',()=>{
  assert.deepEqual(equipmentGrowthModule.capabilities,['C229']);
  assert.equal(EQUIPMENT_PUT_ON_EVIDENCE.requirement,'BIZ-R09');
  assert.equal(EQUIPMENT_PUT_ON_EVIDENCE.realGame,'REAL_UNVERIFIED');
  assert.equal(EQUIPMENT_PUT_ON_EVIDENCE.replace,'BLOCKED_EVIDENCE');
  assert.deepEqual(validateEquipmentGrowthParameters(parameters),parameters);
  assert.deepEqual(validateEquipmentGrowthParameters({heroId:'A',uid}),{heroId:'A',uid});
  assert.deepEqual(validateEquipmentGrowthParameters({heroId:'A',uid,action:'refine'}),{heroId:'A',uid,action:'refine'});
  for(const extra of [{action:'replace'},{body:{}},{slot:1},{type:'武器'},{uid:9},{heroId:' A'},{costs:[]},{allowPaid:false},{replacementUid:otherUid}])assert.throws(()=>validateEquipmentGrowthParameters({...parameters,...extra}),{code:'INVALID_PARAMETERS'});
  assert.equal(protocol.PutOnEquipResponse,undefined);
  assert.deepEqual(toSnapshotJson(wire(action.request,action.body)),action.body);
});

test('complete pool and explicit empty slot produce an exact zero-cost action and shared UID claim',async()=>{
  const {client,cfg,before,operation}=await prepared({codec:true});
  assert.deepEqual(client.reads.sort(),['EquipsRequest','AllHeroRequest','AllItemRequest','AllResourceRequest'].sort());
  assert.equal(client.writes.length,0);
  assert.deepEqual(operation.action,action);
  assert.equal(operation.actionType,'PUT-ON');
  assert.deepEqual(operation.target,{heroId:'A',uid,type:'武器'});
  assert.deepEqual(operation.costs,[]);
  assert.deepEqual(operation.budgetClaims,claims);
  assert.deepEqual(operation.expectedState,{heroId:'A',uid,type:'武器',equipId:'蓝武器1',level:1,star:0,refineLv:0});
  assert.deepEqual(Object.keys(equipmentGrowthDependencyVersions(options(cfg))),['moduleConfig','config.EquipCfg','config.ModuleOpenCfg']);
  const initial=viewEquipmentGrowth(before,options(cfg,{parameters:{action:'put-on'}}));
  assert.equal(initial.candidates.some(row=>row.executable),false);
  const picked=viewEquipmentGrowth(before,options(cfg,{parameters:{heroId:'A',action:'put-on'}}));
  assert.equal(picked.candidates.length,2);
  const executable=picked.candidates.find(row=>row.executable);
  assert.deepEqual(executable.action,action);
  assert.deepEqual(executable.beforeState,{equipment:operation.beforeState.equipment});
  for(const key of ['identity','configEvidence'])assert.equal(Object.hasOwn(executable,key),false);
  assert.equal(picked.candidates.find(row=>!row.executable).blockedReason,'EQUIPMENT_SLOT_NOT_EMPTY');
  assert.equal(plan(before,cfg,{parameters:{heroId:'A',action:'put-on'}}).actions.length,0);
  assert.equal(plan(before,cfg,{moduleConfig:{enabled:false}}).actions.length,0);
});

test('wrong owner, occupied or unknown slot, invalid pool and duplicate same-type mirrors all block',async()=>{
  for(const change of [
    c=>c.pool.shift(),c=>c.pool.push(structuredClone(c.pool[0])),
    c=>c.heroes[0].equips.push(structuredClone(c.pool[0])),
    c=>c.heroes[1].equips.push(structuredClone(c.pool[0])),
    c=>{c.heroes[1].equips.push(equipment('99'));c.pool.push(equipment('99'));},
    c=>{c.heroes[1].equips.push(structuredClone(c.pool[1]));},
    c=>c.heroes[0].equips[0].star++,
    c=>c.pool[0].equipId='未知',
    c=>delete c.heroes[0].equips,
    c=>delete c.heroes[0].attributes,
    c=>delete c.pool[0].refineLv,
  ]){
    const client=fake();change(client);
    assert.equal(plan(await survey(client)).actions.length,0);
    assert.equal(client.writes.length,0);
  }
  const facts=await survey(fake());
  for(const p of [{...parameters,uid:idleArmorUid},{...parameters,heroId:'B'},{...parameters,heroId:'NOBODY'}])assert.equal(plan(facts,config(),{parameters:p}).actions.length,0);
});

test('unique positive configured module level and authenticated player scope are mandatory',async()=>{
  for(const changed of [
    {level:15},{level:undefined},{level:1.5},{level:'16'},{playerId:'0'},{worldId:0},{playerId:'18',id:'17'},
  ]){
    const facts=await survey(fake(),config(),{player:{...player,...changed}});
    assert.equal(plan(facts).actions.length,0);
  }
  for(const change of [
    c=>delete c.tables.ModuleOpenCfg,
    c=>c.tables.ModuleOpenCfg.data[0].playerLevel=0,
    c=>c.tables.ModuleOpenCfg.data[0].playerLevel=17,
    c=>c.tables.ModuleOpenCfg.data[0].playerLevel='16',
    c=>c.tables.ModuleOpenCfg.data.push({...c.tables.ModuleOpenCfg.data[0]}),
    c=>c.tables.EquipCfg.data[0].type='未知',
    c=>c.tables.EquipCfg.data.push({...c.tables.EquipCfg.data[0]}),
  ]){
    const cfg=config();change(cfg);
    assert.equal(plan(await survey(fake(),cfg),cfg).actions.length,0);
  }
  const missing=fake();delete missing.factContext.connectionId;
  assert.equal(plan(await survey(missing)).actions.length,0);
});

test('the protocol cannot be silently upgraded to an unknown dedicated response or missing request',async()=>{
  const missing={...protocol};delete missing.PutOnEquipRequest;
  for(const version of [missing,{...protocol,PutOnEquipResponse:{}}]){
    const facts=await surveyEquipmentGrowth(fake(),version,options());
    assert.equal(plan(facts).actions.length,0);
  }
});

for(const codec of [false,true])test('shared execution confirms exact new owner and unchanged inventory even with silent watch (codec='+codec+')',async()=>{
  const input=await prepared({codec}),budget=budgetFor(),stages=[];
  const result=await run(input,{budget,onStage(stage){stages.push(stage);}});
  assert.equal(result.status,'SUCCESS',JSON.stringify(result));
  assert.deepEqual(stages,['SURVEY','RESOURCE_PREFLIGHT','DISPATCH_INTENT','DISPATCHED','OBSERVATION_ENDED','VERIFY','VERIFIED']);
  assert.deepEqual(input.client.writes,[{name:action.request,body:action.body}]);
  assert.deepEqual(input.client.pool,input.before.ownership.pool);
  assert.deepEqual(input.client.stock,input.before.stock);
  assert.equal(input.client.uncertainWrites.size,0);
  assert.deepEqual(budget.runBudget.snapshot().reserved,claims);
});

test('mere watch result and any replacement, ownership, gear or stock change leave persistent UNKNOWN',async()=>{
  for(const variant of [
    {apply:false},{apply:false,watchStatus:'SUCCESS'},
    {afterWrite:c=>{c.heroes[1].equips.push(c.heroes[0].equips.pop());}},
    {afterWrite:c=>{c.heroes[0].equips.shift();}},
    {afterWrite:c=>{c.pool.pop();}},
    {afterWrite:c=>{c.pool[0].level++;c.heroes[0].equips.at(-1).level++;}},
    {afterWrite:c=>{c.heroes[0].star++;}},
    {afterWrite:c=>{c.heroes[1].power='8';}},
    {afterWrite:c=>{c.stock.set('GOLD',499);}},
    {afterWrite:c=>{c.stock.set('返还材料',1);}},
    {afterWrite:c=>{c.heroes[0].attributes[0].value=Infinity;}},
  ]){
    const input=await prepared(variant),budget=budgetFor();
    const result=await run(input,{budget});
    assert.equal(result.status,'UNKNOWN');
    assert.equal(result.unresolvedWrite,true);
    assert.equal(input.client.writes.length,1);
    assert.equal(input.client.uncertainWrites.size,1);
    assert.deepEqual(budget.runBudget.snapshot().reserved,claims);
  }
});

test('verification independently reconstructs exact planned mode, action, scope and empty claims',async()=>{
  const {client,cfg,before,operation}=await prepared();
  await client.sendWatch(action.request,action.body,{});
  const after=await survey(client,cfg);
  assert.equal(verifyEquipmentGrowth(operation,before,after).confirmed,true);
  for(const mutate of [
    op=>op.actionId='altered',op=>op.action.body.uid=otherUid,op=>op.action.body.type='武器',op=>op.action.response='PutOnEquipResponse',
    op=>op.target.type='防具',op=>op.costs.push({id:'GOLD',num:1}),op=>op.budgetClaims.uids.pop(),
    op=>op.expectedState.level++,op=>op.beforeState.equipment.star++,op=>op.configEvidence.ModuleOpenCfg.data[0].playerLevel++,
  ]){
    const changed=structuredClone(operation);mutate(changed);
    assert.equal(verifyEquipmentGrowth(changed,before,after).confirmed,false);
  }
});

test('freshness is per typed source, including post-read chronology and slow sibling completion',async()=>{
  const {client,cfg,before,operation}=await prepared();
  await client.sendWatch(action.request,action.body,{});
  const after=await survey(client,cfg);
  for(const key of ['equips','heroes','items','resources']){
    const stale=structuredClone(after);
    stale.sourceFacts[key].provenance.sourceAt=before.sourceFacts[key].provenance.sourceAt-1;
    const pair=['equips','heroes'].includes(key)?['ownership','equips','heroes']:['inventory','items','resources'];
    stale.sourceFacts[pair[0]].provenance.sourceAt=Math.min(...pair.slice(1).map(name=>stale.sourceFacts[name].provenance.sourceAt));
    assert.equal(verifyEquipmentGrowth(operation,before,stale).reason,'EQUIPMENT_POST_READ_PREDATES_DISPATCH_BASELINE');
  }
  const realNow=Date.now;let now=1000000;Date.now=()=>now;
  try{
    const slow=fake(),orig=slow.request.bind(slow);
    slow.request=async(name,...args)=>{if(name==='AllResourceRequest'){await new Promise(setImmediate);now+=31000;}return orig(name,...args);};
    const facts=await survey(slow,cfg);
    assert.equal(facts.sourceFacts.equips.provenance.sourceAt,1000000);
    assert.equal(facts.sourceFacts.resources.provenance.sourceAt,1031000);
    assert.equal(plan(facts,cfg).actions.length,0);
  }finally{Date.now=realNow;}
});

test('scope drift, config revision, parent UID denial and intent expiration stop before dispatch',async()=>{
  for(const mutate of [
    ({client})=>client.factContext.connectionId='other',
    ({client})=>client.factContext.generation++,
    ({client})=>client.factContext.accountId='other',
    ({client})=>client.heroes[0].equips.push(structuredClone(client.pool[0])),
    ({cfg})=>cfg.tables.ModuleOpenCfg.revision++,
  ]){
    const input=await prepared();mutate(input);
    assert.equal((await run(input)).status,'NOT_EXECUTED');
    assert.equal(input.client.writes.length,0);
  }
  const missing=await prepared(),budget=budgetFor({resources:[],quotas:[],uids:[]});
  assert.equal((await run(missing,{budget})).status,'NOT_EXECUTED');
  assert.equal(missing.client.writes.length,0);
  assert.deepEqual(budget.runBudget.snapshot().reserved,{resources:[],quotas:[],uids:[]});
  const realNow=Date.now;let now=1000000;Date.now=()=>now;
  try{
    const expire=await prepared(),reserved=budgetFor();
    assert.equal((await run(expire,{budget:reserved,onStage(stage){if(stage==='DISPATCH_INTENT')now+=31000;}})).status,'NOT_EXECUTED');
    assert.equal(expire.client.writes.length,0);
    assert.deepEqual(reserved.runBudget.snapshot().reserved,claims);
  }finally{Date.now=realNow;}
});

test('cancel before watch never writes; late observation after dispatch cannot replay or verify',async()=>{
  const early=await prepared(),a=new AbortController();a.abort();
  assert.equal((await run(early,{signal:a.signal})).status,'CANCELLED');
  assert.equal(early.client.writes.length,0);
  const b=new AbortController();let release;
  const late=await prepared({onWatch(){queueMicrotask(()=>b.abort());return new Promise(resolve=>{release=resolve;});}});
  assert.equal((await run(late,{signal:b.signal})).status,'UNKNOWN');
  assert.equal(late.client.writes.length,1);
  const reads=late.client.reads.length;release({status:'SUCCESS'});
  await new Promise(setImmediate);
  assert.equal(late.client.reads.length,reads);
});

test('fixed configuration proves actual type and equipment module unlock threshold',async()=>{
  const cfg={tables:extractTables(JSON.parse(fs.readFileSync(new URL('../work/cdn/config_cn_pack.json',import.meta.url),'utf8')))};
  const facts=await survey(fake({codec:true}),cfg);
  assert.equal(facts.catalog.playerLevel,16);
  assert.equal(plan(facts,cfg).actions[0]?.target.type,'武器');
  const locked=await survey(fake({codec:true}),cfg,{player:{...player,level:15}});
  assert.equal(plan(locked,cfg).actions.length,0);
});
