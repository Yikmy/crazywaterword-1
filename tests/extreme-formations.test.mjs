import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProtocol} from '../src/proto.mjs';
import {planFormation,verifyFormation} from '../src/formation.mjs';
import {EXTREME_FORMATION_EVIDENCE,validateExtremeFormationParameters,surveyExtremeFormationList,surveyExtremeFormations,prepareExtremeFormation,viewExtremeFormations} from '../src/extreme-formations.mjs';
const protocol=loadProtocol(),wire=(name,value)=>protocol[name].decode(protocol[name].encode(value).finish());
const copy=value=>structuredClone(value),pos=(heroId,x,y)=>({heroId,pos:{x,y}});
const player=()=>({playerId:'1001',worldId:'1000001',mainlineStage:101});
const viewer=()=>({accountId:'A',playerId:'1001',worldId:'1000001',generation:2,connectionId:'connection-A'});
const parameters=()=>({stage:101,playerId:'9007199254740993',worldId:'2000001',replayId:'9007199254740995'});
const sourcePositions=()=>[pos('tank',5,5),pos('mage',5,1),pos('ranged',2,4)];
const current=()=>({presetId:1,heroPositions:[pos('tank',1,3),pos('mage',1,5),pos('ranged',4,4)],petUid:'9007199254740997'});
const config=()=>({tables:{HeroCfg:{data:[{id:'tank',career:'坦克'},{id:'mage',career:'法师'},{id:'ranged',career:'射手'}]},FormationHeroNumCfg:{data:[{heroNum:3,mainlineStage:0}]},FormationTypePositionCfg:{data:[...[[1,3],[1,5],[4,4]].map(position=>({id:1,position})),...[[5,5],[5,1],[2,4]].map(position=>({id:2,position})),...[[5,5],[5,1],[2,4]].map(position=>({id:3,position}))]}}});
const source=()=>({playerId:parameters().playerId,worldId:parameters().worldId,replayId:parameters().replayId,nickname:'<img src=x>',power:'9007199254740999',hero:sourcePositions()});
const report=()=>({initialData:{battleType:1,mainlineStage:101,leftTeam:{presetId:2,power:'9007199254740999',members:sourcePositions().map(row=>({pos:row.pos,hero:{heroId:row.heroId}})),pet:{uid:'33',petId:'synthetic-source-pet',level:1,star:0}},rightTeams:[]},createTime:'1'});
function fixture({codec=true}={}){
 const client={connected:true,factContext:viewer(),pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),reads:[],writes:[],raw:{list:{pass:[source()]},report:report(),formation:{formation:current()},presets:{ids:[2,3]},heroes:{heroes:['tank','mage','ranged'].map(heroId=>({heroId}))}},onRead:null,async request(name,body,response,timeout,options){
  this.reads.push({name,body:codec?wire(name,body):copy(body),response,timeout,options});
  const key={RaidExtremePassRequest:'list',BattleReportRequest:'report',GetFormationRequest:'formation',MyFormationPresetRequest:'presets',AllHeroRequest:'heroes'}[name];
  if(!key){this.writes.push({name,body});throw Error('No writes allowed');}
  await this.onRead?.(name,this);const value=copy(this.raw[key]);return codec?wire(response,value):value;
 }};
 const options={parameters:parameters(),config:config(),player:player(),viewerContext:viewer()};return {client,options};
}
const survey=f=>surveyExtremeFormations(f.client,protocol,f.options),prepare=(f,facts)=>prepareExtremeFormation(facts,{...f.options,moduleConfig:{enabled:true}});
const rejected=async(f,pattern)=>{await assert.rejects(survey(f),error=>['EXTREME_FORMATION_BLOCKED','CANCELLED'].includes(error.code)&&(!pattern||pattern.test(error.message)));assert.equal(f.client.writes.length,0);};

test('strict source parameters admit explicit exact IDs only without invoking accessors',()=>{
 assert.deepEqual(validateExtremeFormationParameters(parameters()),parameters());assert.equal(EXTREME_FORMATION_EVIDENCE.realGame,'REAL_UNVERIFIED');assert.equal(EXTREME_FORMATION_EVIDENCE.independentVictoryVerification,false);
 for(const value of [{},{...parameters(),stage:0},{...parameters(),stage:1.5},{...parameters(),playerId:1001},{...parameters(),replayId:'01'},{...parameters(),worldId:'0'},{...parameters(),replayId:'9223372036854775808'},{...parameters(),request:'SaveFormationRequest'},Object.create(parameters())])assert.throws(()=>validateExtremeFormationParameters(value),{code:'INVALID_PARAMETERS'});
 const injected={...parameters()};Object.defineProperty(injected,'stage',{enumerable:true,get(){throw Error('accessor evaluated');}});assert.throws(()=>validateExtremeFormationParameters(injected),{code:'INVALID_PARAMETERS'});
});

test('list discovery uses current mainline module3 only and keeps source player distinct from viewer',async()=>{
 const f=fixture(),facts=await surveyExtremeFormationList(f.client,protocol,f.options),view=viewExtremeFormations(facts);assert.equal(f.client.reads.length,1);assert.equal(f.client.reads[0].name,'RaidExtremePassRequest');assert.equal(f.client.reads[0].body.module,3);assert.equal(f.client.reads[0].body.raidId,101);assert.equal(view.rows[0].playerId,parameters().playerId);assert.equal(view.rows[0].power,'9007199254740999');assert.equal(view.rows[0].nickname,'<img src=x>');assert.equal(view.rows[0].worldId,'2000001');assert.equal(view.evidence.sourceKind,'SERVER_EXTREME_PASS_SOURCE');assert.equal(facts.listFact.provenance.accountId,'A');assert.equal(facts.listFact.provenance.generation,2);assert.equal(view.action,undefined);assert.equal(f.client.writes.length,0);
});

for(const codec of [false,true])test('source chain prepares original Formation parameters and preserves target pet with codec '+codec,async()=>{
 const f=fixture({codec}),facts=await survey(f),result=prepare(f,facts);assert.deepEqual(f.client.reads.map(row=>row.name),['RaidExtremePassRequest','BattleReportRequest','GetFormationRequest','MyFormationPresetRequest','AllHeroRequest']);assert.equal(String(f.client.reads[1].body.reportId),parameters().replayId);assert.deepEqual(result.parameters,{presetId:2,heroPositions:[...sourcePositions()].sort((a,b)=>a.heroId.localeCompare(b.heroId))});assert.equal(result.preservedPetUid,'9007199254740997');assert.equal(result.mode,'MAINLINE');assert.equal(result.source.playerId,parameters().playerId);assert.equal(result.requiresFreshPlan,true);assert.equal(result.requiresAuthorization,true);assert.equal(result.resumable,false);for(const key of ['action','actions','batchId','permit','authorizationId','planHash'])assert.equal(Object.hasOwn(result,key),false);assert.equal(f.client.writes.length,0);
 const original=planFormation(facts.targetFacts,{parameters:result.parameters,moduleConfig:{enabled:true}}).actions[0];assert.ok(original);assert.equal(original.action.request,'SaveFormationRequest');assert.equal(original.action.body.formation.petUid,result.preservedPetUid);assert.equal(verifyFormation(original,facts.targetFacts,{...facts.targetFacts,formation:original.expectedState},{formation:original.expectedState}).confirmed,true);assert.equal(verifyFormation(original,facts.targetFacts,facts.targetFacts,{formation:original.expectedState}).confirmed,false);
});

test('explicit report preset disambiguates identical layouts and never infers one from coordinates',async()=>{
 const f=fixture();f.client.raw.report.initialData.leftTeam.presetId=3;const facts=await survey(f);assert.equal(prepare(f,facts).parameters.presetId,3);delete f.client.raw.report.initialData.leftTeam.presetId;await rejected(f,/MODE_STAGE_OR_HERO/);
});

for(const change of [r=>delete r.playerId,r=>delete r.worldId,r=>delete r.replayId,r=>delete r.hero,r=>r.hero.push(copy(r.hero[0])),r=>r.hero[1].pos=copy(r.hero[0].pos),r=>r.hero[0].heroId='',r=>r.power=-1])test('incomplete or ambiguous extreme list cannot provide a report source '+String(change),async()=>{
 const f=fixture({codec:false});change(f.client.raw.list.pass[0]);await rejected(f,/NOT_IN_CURRENT_LIST/);assert.equal(f.client.reads.length,1);
});

test('empty and malformed lists are distinguishable and never trigger report query',async()=>{
 const f=fixture();f.client.raw.list.pass=[];const facts=await surveyExtremeFormationList(f.client,protocol,f.options);assert.deepEqual(viewExtremeFormations(facts).rows,[]);assert.deepEqual(viewExtremeFormations(facts).notes,[]);await rejected(f,/NOT_IN_CURRENT_LIST/);
 const bad=fixture({codec:false});bad.client.raw.list={};const broken=await surveyExtremeFormationList(bad.client,protocol,bad.options);assert.ok(viewExtremeFormations(broken).notes.length>0);await rejected(bad,/NOT_IN_CURRENT_LIST/);
});

for(const [label,change]of [['battle type',r=>r.initialData.battleType=2],['absent mode',r=>delete r.initialData.battleType],['stage',r=>r.initialData.mainlineStage=102],['absent stage',r=>delete r.initialData.mainlineStage],['right team only',r=>{r.initialData.rightTeams=[r.initialData.leftTeam];delete r.initialData.leftTeam;}],['hero mismatch',r=>r.initialData.leftTeam.members[0].hero.heroId='foreign'],['position mismatch',r=>r.initialData.leftTeam.members[0].pos.x=7],['duplicate hero',r=>r.initialData.leftTeam.members.push(copy(r.initialData.leftTeam.members[0]))],['assistant',r=>r.initialData.leftTeam.members[0].assistant=true],['summon',r=>r.initialData.leftTeam.members[0].summon={heroId:'summoned'}],['boss',r=>r.initialData.leftTeam.members[0].boss=true],['extra summon',r=>r.initialData.leftTeam.members[0].extSummons=[{heroId:'summoned'}]]])test('source report '+label+' blocks before target reads',async()=>{
 const f=fixture();change(f.client.raw.report);await rejected(f,/MODE_STAGE_OR_HERO/);assert.equal(f.client.reads.length,2);
});

for(const [label,change]of [['missing hero',f=>f.client.raw.heroes.heroes.pop()],['locked layout',f=>f.client.raw.presets.ids=[]],['unknown pet',f=>delete f.client.raw.formation.formation.petUid],['negative pet',f=>f.client.raw.formation.formation.petUid='-1'],['unknown max',f=>f.options.config.tables.FormationHeroNumCfg.data=[]],['illegal position',f=>{f.options.config.tables.FormationTypePositionCfg.data=f.options.config.tables.FormationTypePositionCfg.data.filter(row=>row.id!==2||row.position[0]!==5||row.position[1]!==5);}]] )test('target '+label+' blocks preparation without writes',async()=>{
 const f=fixture();change(f);const facts=await survey(f);assert.throws(()=>prepare(f,facts),{code:'EXTREME_FORMATION_BLOCKED'});assert.equal(f.client.writes.length,0);
});

test('disabled Formation cannot prepare and no default permission is granted',async()=>{const f=fixture(),facts=await survey(f);assert.throws(()=>prepareExtremeFormation(facts,f.options),{code:'EXTREME_FORMATION_BLOCKED'});assert.equal(f.client.writes.length,0);});

for(const [label,change]of [['generation',f=>f.client.factContext.generation++],['account',f=>f.client.factContext.accountId='B'],['connection',f=>f.client.factContext.connectionId='new'],['player',f=>f.options.player.playerId='2'],['world',f=>f.options.player.worldId='3'],['current stage',f=>f.options.player.mainlineStage++]])test('viewer '+label+' change during list stops chain',async()=>{
 const f=fixture();f.client.onRead=name=>{if(name==='RaidExtremePassRequest')change(f);};await rejected(f);assert.equal(f.client.reads.length,1);
});

test('exact source request must match latest current list rather than earlier UI row',async()=>{const f=fixture();f.client.raw.list.pass[0].replayId='999';await rejected(f,/NOT_IN_CURRENT_LIST/);assert.equal(f.client.reads.length,1);f.options.parameters.stage=100;await rejected(f,/NOT_CURRENT_STAGE/);assert.equal(f.client.reads.length,1);});

for(const name of ['RaidExtremePassRequest','BattleReportRequest'])test(name+' timeout does not continue or retry',async()=>{const f=fixture();f.client.onRead=request=>{if(request===name){f.client.lateResponses.set(request,true);throw Error('timeout');}};await rejected(f,/RESPONSE_UNKNOWN/);assert.equal(f.client.reads.length,name==='RaidExtremePassRequest'?1:2);});

test('uncertain response or pending transport forbids all source reads',async()=>{for(const mutate of [c=>c.pending.push({}),c=>c.watchers.push({}),c=>c.promptUncertain=true,c=>c.lateResponses.set('BattleReportResponse',true),c=>c.uncertainWrites.set('write',{})]){const f=fixture();mutate(f.client);await rejected(f,/CONNECTION_UNCERTAIN/);assert.equal(f.client.reads.length,0);}});

test('late marker after list prevents the report request',async()=>{const f=fixture();f.client.onRead=name=>{if(name==='RaidExtremePassRequest')f.client.lateResponses.set('synthetic',true);};await rejected(f,/CONNECTION_UNCERTAIN/);assert.equal(f.client.reads.length,1);});

test('cancellation before or during source reads stops without later calls',async()=>{const f=fixture(),controller=new AbortController();f.options.signal=controller.signal;controller.abort();await rejected(f);assert.equal(f.client.reads.length,0);const second=fixture(),later=new AbortController();second.options.signal=later.signal;second.client.onRead=()=>later.abort();await rejected(second);assert.equal(second.client.reads.length,1);});

test('source and each target timestamp retain completion age; a slow sibling cannot renew authority',async()=>{
 const real=Date.now;let now=1000000;Date.now=()=>now;try{const f=fixture();f.client.onRead=async name=>{if(name==='AllHeroRequest'){await new Promise(resolve=>setImmediate(resolve));now+=30001;}};const facts=await survey(f);assert.equal(facts.listFact.provenance.sourceAt,1000000);assert.equal(facts.reportFact.provenance.sourceAt,1000000);assert.equal(facts.targetSourceFacts.formation.provenance.sourceAt,1000000);assert.equal(facts.targetSourceFacts.heroes.provenance.sourceAt,1030001);assert.throws(()=>prepare(f,facts),{code:'EXTREME_FORMATION_BLOCKED'});assert.equal(viewExtremeFormations(facts).rows.length,0);}finally{Date.now=real;}
});

test('caller edited source facts, mappings, ownership, provenance and config cannot gain preparation',async()=>{
 const f=fixture(),facts=await survey(f);
 for(const mutate of [x=>x.selected.replayId='8',x=>x.mapping.presetId=3,x=>x.rows[0].heroPositions[0].pos.x=7,x=>x.reportInput.initialData.mainlineStage=1,x=>x.sourceFacts.list.provenance.accountId='other',x=>x.targetInputs.heroes.heroes.pop(),x=>x.targetFacts.ownedHeroIds.pop(),x=>x.targetSourceFacts.formation.provenance.source='foreign',x=>x.targetFacts.catalog.maxHeroes=100]){const changed=copy(facts);mutate(changed);assert.throws(()=>prepare(f,changed),{code:'EXTREME_FORMATION_BLOCKED'});}
 f.options.config.tables.FormationTypePositionCfg.data[0].position=[99,99];assert.throws(()=>prepare(f,facts),{code:'EXTREME_FORMATION_BLOCKED'});assert.equal(f.client.writes.length,0);
});

test('target pet zero remains explicit and source pet is never applied',async()=>{const f=fixture();f.client.raw.formation.formation.petUid='0';const facts=await survey(f),result=prepare(f,facts);assert.equal(result.preservedPetUid,0);const op=planFormation(facts.targetFacts,{parameters:result.parameters,moduleConfig:{enabled:true}}).actions[0];assert.equal(op.action.body.formation.petUid,0);assert.equal(f.client.writes.length,0);});

test('missing source protocols fail closed without a raw fallback',async()=>{for(const name of ['RaidExtremePassRequest','RaidExtremePassResponse','BattleReportRequest','BattleReportResponse']){const f=fixture(),missing={...protocol};delete missing[name];await assert.rejects(surveyExtremeFormations(f.client,missing,f.options),{code:'EXTREME_FORMATION_BLOCKED'});assert.equal(f.client.reads.length,name.startsWith('BattleReport')?1:0);assert.equal(f.client.writes.length,0);}});

test('late marker during report never starts target source reads',async()=>{const f=fixture();f.client.onRead=name=>{if(name==='BattleReportRequest')f.client.lateResponses.set('late-report',true);};await rejected(f,/CONNECTION_UNCERTAIN/);assert.equal(f.client.reads.length,2);});

for(const name of ['GetFormationRequest','MyFormationPresetRequest','AllHeroRequest'])test(name+' failure cannot produce prepared write parameters',async()=>{const f=fixture();f.client.onRead=request=>{if(request===name)throw Error('synthetic unavailable');};const facts=await survey(f);assert.throws(()=>prepare(f,facts),{code:'EXTREME_FORMATION_BLOCKED'});assert.equal(f.client.writes.length,0);});

test('unsupported accessors and unsafe source scalar values are rejected before interpretation',async()=>{const f=fixture({codec:false});const original=f.client.request;f.client.request=async function(name,...args){const value=await original.call(this,name,...args);if(name==='RaidExtremePassRequest')Object.defineProperty(value.pass[0],'power',{enumerable:true,get(){throw Error('must not invoke');}});return value;};await rejected(f,/SOURCE_DATA_UNSAFE/);const bad=fixture({codec:false});bad.client.raw.list.pass[0].playerId=Number.MAX_SAFE_INTEGER+1;await rejected(bad,/SOURCE_DATA_UNSAFE/);assert.equal(f.client.writes.length,0);});
