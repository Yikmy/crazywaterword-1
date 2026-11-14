import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOperationService} from '../src/operation-service.mjs';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {GAMEPLAY_MODULES} from '../src/function-registry.mjs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createStageRunner, defaultStageConfig, defaultStageFormationConfig, validateStageConfig, resolveMainlineChallengeSide } from '../src/stages.mjs';
import { surveyFormation } from '../src/formation.mjs';
const player={playerId:'synthetic-player',mainlineStage:41};
const protocol={ChallengeStageRequest:{},ChallengeStageResponse:{}};
const saved={presetId:2,petUid:'9007199254740993',heroPositions:[{heroId:'tank',pos:{x:5,y:5}}]};
const config=(extra={})=>({...defaultStageConfig(),enabled:true,maxAttempts:1,formation:{enabled:true,presetId:2},...extra});
function response(stage=41,win=false){return {initialData:{mainlineStage:stage,battleType:1,leftTeam:{presetId:2,members:[{hero:{heroId:'tank'},pos:{x:5,y:5},hp:100}]},rightTeams:[{members:[{hero:{heroId:'enemy'},pos:{x:8,y:3},hp:100}]}]},stats:{isLeftWin:win,leftHeroDamages:[{heroId:'tank',pos:{x:5,y:5},leftHp:0,statBar:{damage:{physical:10,magic:0,true:0}}}],rightHeroDamages:[{heroId:'enemy',pos:{x:8,y:3},leftHp:50,statBar:{damage:{physical:100,magic:0,true:0}}}]}};}
function harness(handler=stage=>response(stage),options={}){const client=new EventEmitter();client.connected=true;client.calls=[];client.request=(...args)=>{client.calls.push(args);return handler(args[1].stage);};const runner=createStageRunner({client,player,protocol,clock:{now:()=>100000},resolvePlayerSide:resolveMainlineChallengeSide,...options});const proof=()=>({confirmed:true,presetId:2,formation:structuredClone(saved),client,playerId:player.playerId,checkedAt:100000,batchId:'approved-batch',planHash:'approved-hash'});return {client,runner,proof};}
test('optional formation config validates strict shape without altering legacy defaults',()=>{assert.deepEqual(defaultStageFormationConfig(),{enabled:false,presetId:null});assert.equal(Object.hasOwn(defaultStageConfig(),'formation'),false);const input=config(),clean=validateStageConfig(input);input.formation.presetId=1;assert.equal(clean.formation.presetId,2);for(const formation of [null,{},[],{enabled:true,presetId:null},{enabled:1,presetId:2},{enabled:true,presetId:'2'},{enabled:false,presetId:0},{enabled:true,presetId:2,request:'anything'}])assert.throws(()=>validateStageConfig(config({formation})),{code:'INVALID_CONFIG'});});
test('enabled formation fails before dispatch when evidence is absent or incomplete',()=>{const h=harness();for(const proof of [null,{},Object.create(h.proof())])assert.throws(()=>h.runner.start(config(),{allowMutate:true,formationEvidence:proof}),{code:'FORMATION_UNVERIFIED'});assert.equal(h.client.calls.length,0);});
test('formation proof binds the exact current client, player, preset, batch hash and thirty-second freshness',()=>{for(const change of [p=>p.confirmed=false,p=>p.client={},p=>p.playerId='other',p=>p.presetId=1,p=>p.formation.presetId=1,p=>p.formation.heroPositions=[],p=>p.checkedAt=69999,p=>p.checkedAt=100001,p=>delete p.checkedAt,p=>p.batchId='',p=>p.planHash='',p=>delete p.formation.heroPositions[0].pos.y]){const h=harness(),proof=h.proof();change(proof);assert.throws(()=>h.runner.start(config(),{allowMutate:true,formationEvidence:proof}),{code:'FORMATION_UNVERIFIED'});assert.equal(h.client.calls.length,0);}});
test('valid approved formation proof permits only the original ChallengeStage request and stores no client reference',async()=>{const h=harness(),proof=h.proof();const status=h.runner.start(config(),{allowMutate:true,formationEvidence:proof});proof.formation.heroPositions[0].pos.x=99;await h.runner.completion;assert.equal(h.client.calls.length,1);assert.equal(h.client.calls[0][0],'ChallengeStageRequest');assert.equal(status.formationVerification.formation.heroPositions[0].pos.x,5);assert.equal(Object.hasOwn(status.formationVerification,'client'),false);assert.equal(h.runner.getStatus().formationVerification.batchId,'approved-batch');});
test('disabled or omitted formation retains existing runner behavior without a proof',async()=>{for(const extra of [{formation:{enabled:false,presetId:null}},{formation:undefined}]){const h=harness();const c=config(extra);if(c.formation===undefined)delete c.formation;h.runner.start(c,{allowMutate:true});await h.runner.completion;assert.equal(h.client.calls.length,1);}});
test('formation proof never replaces existing explicit mutation, side or account generation authorization',()=>{const h=harness();assert.throws(()=>h.runner.start(config(),{formationEvidence:h.proof()}),{code:'MUTATION_NOT_AUTHORIZED'});const stale=harness(undefined,{isCurrent:()=>false});assert.throws(()=>stale.runner.start(config(),{allowMutate:true,formationEvidence:stale.proof()}),{code:'DISCONNECTED'});const side=harness(undefined,{resolvePlayerSide:null});assert.throws(()=>side.runner.start(config(),{allowMutate:true,formationEvidence:side.proof()}),{code:'SIDE_UNVERIFIED'});});
test('battle history and status consume the same response without extra query or write and copies are isolated',async()=>{const body=response(),h=harness(()=>body);h.runner.start(config({formation:{enabled:false,presetId:null},stopOnDefeat:true}),{allowMutate:true});await h.runner.completion;const status=h.runner.getStatus();assert.equal(status.battleAnalysis.outcome,'FAILED');assert.equal(status.history[0].battleAnalysis.leftTeam.presetId,2);assert.equal(status.history[0].battleAnalysis.rightPlayer,null);assert.equal(status.battleAnalysis.automaticSwitch,false);assert.equal(status.battleAnalysis.resumeAllowed,false);assert.equal(h.client.calls.length,1);body.initialData.leftTeam.members[0].pos.x=100;status.history[0].battleAnalysis.leftTeam.members[0].pos.x=101;status.lastResult.battleAnalysis.leftTeam.members[0].pos.x=102;assert.equal(h.runner.getStatus().history[0].battleAnalysis.leftTeam.members[0].pos.x,5);});
async function formationFacts(){const config={tables:{HeroCfg:{data:[{id:'tank',career:'坦克'}]},FormationHeroNumCfg:{data:[{heroNum:1,mainlineStage:0}]},FormationTypePositionCfg:{data:[{id:1,position:[1,3]},{id:2,position:[5,5]}]}}};const proto=Object.fromEntries(['GetFormationRequest','GetFormationResponse','MyFormationPresetRequest','MyFormationPresetResponse','AllHeroRequest','AllHeroResponse','SaveFormationRequest','SaveFormationResponse'].map(name=>[name,{}]));return surveyFormation({connected:true,request:async name=>name==='GetFormationRequest'?{formation:saved}:name==='MyFormationPresetRequest'?{ids:[2]}:{heroes:[{heroId:'tank'}]}},proto,{config,player});}
test('defeat only recommends from cached formation facts when the independent mainline switch is enabled',async()=>{const facts=await formationFacts();for(const enabled of [false,true]){const h=harness(undefined,{formationFacts:()=>facts,formationModuleConfig:()=>({enabled:true,mainlineEnabled:enabled})});h.runner.start(config({stopOnDefeat:true}),{allowMutate:true,formationEvidence:h.proof()});await h.runner.completion;assert.equal(h.client.calls.length,1);const status=h.runner.getStatus();assert.equal(status.stopKind,'DEFEAT_STOPPED');if(enabled){assert.equal(status.recommendations.length,1);assert.equal(status.recommendations[0].requiresApproval,true);assert.equal(status.recommendations[0].automatic,false);}else assert.equal(status.recommendations.length,0);}});
test('unavailable recommendation facts do not provoke an extra battle or bypass stop-on-defeat',async()=>{const h=harness(undefined,{formationFacts(){throw Error('facts unavailable');}});h.runner.start(config({stopOnDefeat:true}),{allowMutate:true,formationEvidence:h.proof()});await h.runner.completion;assert.equal(h.client.calls.length,1);assert.equal(h.runner.getStatus().stopKind,'DEFEAT_STOPPED');});
test('late response after user stop cannot publish battle analysis or recommendations',async()=>{let resolve;const h=harness(()=>new Promise(r=>resolve=r));h.runner.start(config(),{allowMutate:true,formationEvidence:h.proof()});await new Promise(r=>setImmediate(r));h.runner.stop();await h.runner.completion;resolve(response());await new Promise(r=>setImmediate(r));assert.equal(h.runner.getStatus().battleAnalysis,null);assert.deepEqual(h.runner.getStatus().recommendations,[]);});

test('optional analysis failure cannot turn an already parsed defeat into an unresolved battle',async()=>{
 const settled=[],journal={start(){},dispatch(){},settle(row){settled.push(row);},finish(){}};
 const h=harness(undefined,{formationFacts:()=>({get catalog(){throw Error('synthetic optional analysis failure');}}),formationModuleConfig:()=>({enabled:true,mainlineEnabled:true})});
 h.runner.start(config({stopOnDefeat:true}),{allowMutate:true,formationEvidence:h.proof(),journal});await h.runner.completion;
 assert.equal(h.client.calls.length,1);assert.equal(h.runner.getStatus().stopKind,'DEFEAT_STOPPED');assert.equal(h.runner.getStatus().uncertain,false);assert.equal(settled.length,1);assert.equal(settled[0].result.outcome,'FAILED');assert.equal(settled[0].analysis.status,'ANALYSIS_UNAVAILABLE');
});

function formationProofFixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-stage-proof-')),file=path.join(dir,'history.json'),durable=createExecutionHistory({file});
 const cfg={tables:{HeroCfg:{data:[{id:'tank',career:'坦克'}]},FormationHeroNumCfg:{data:[{heroNum:1,mainlineStage:0}]},FormationTypePositionCfg:{data:[{id:1,position:[1,3]},{id:2,position:[5,5]}]}}};
 const wire=Object.fromEntries(['GetFormation','MyFormationPreset','AllHero','SaveFormation','AllItem','AllResource'].flatMap(name=>[[name+'Request',{}],[name+'Response',{}]]));
 const state={formation:{presetId:1,heroPositions:[{heroId:'tank',pos:{x:1,y:3}}]},writes:0,reads:0,onRead:null,onPut:null,config:{enabled:true,mainlineEnabled:true}};
 const session={id:'A',generation:1,connectionId:'connection-A',state:'READY',player:{playerId:'17',worldId:7,mainlineStage:41},abort:new AbortController(),loop:{running:false},busy:null,client:{connected:true,pending:[],watchers:[],lateResponses:new Set(),uncertainWrites:new Set(),async request(name,body){
  if(name==='SaveFormationRequest'){state.writes++;state.formation=structuredClone(body.formation);return {formation:structuredClone(state.formation)};}
  state.reads++;state.onRead?.(name);
  if(name==='GetFormationRequest')return {formation:structuredClone(state.formation)};
  if(name==='MyFormationPresetRequest')return {ids:[2]};if(name==='AllHeroRequest')return {heroes:[{heroId:'tank'}]};
  if(name==='AllItemRequest')return {items:[]};if(name==='AllResourceRequest')return {list:[]};throw Error('unexpected offline request '+name);
 }}};
 const history={...durable,put(row){state.onPut?.(row);durable.put(row);}},options={protocol:wire,modules:{formation:GAMEPLAY_MODULES.formation},history,getConfig:()=>cfg,loadRules:()=>({config:{}}),loadProduction:()=>({config:{}}),moduleSettings:{get:()=>({config:state.config})}},service=createOperationService(options);
 t.after(async()=>{session.client.connected=false;await service.settle('A');assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});
 async function save(){const plan=await service.plan(session,{module:'formation',mode:'Manual',selections:(await service.surveyModule(session,'formation',{presetId:2})).view.candidates.filter(row=>row.executable).map(row=>row.actionId),parameters:{presetId:2}});const permit=service.authorize(session,{batchId:plan.batchId,planHash:plan.planHash,approvedActionIds:plan.actions.map(row=>row.actionId),resourceBudget:plan.resourceBudget,confirm:true});const started=service.execute(session,permit);await service.settle('A');return durable.list('A').find(row=>row.runId===started.runId);}
 return {service,session,state,durable,save,file,reopen:()=>createOperationService({...options,history:createExecutionHistory({file})})};
}
for(const field of ['playerId','worldId','connectionId'])test('approved formation proof cannot follow changed '+field,async t=>{
 const f=formationProofFixture(t);assert.equal((await f.save()).finalStatus,'SUCCESS');assert.equal((await f.service.assertFormationReady(f.session,{enabled:true,presetId:2})).confirmed,true);
 if(field==='connectionId')f.session.connectionId='other-connection';else f.session.player[field]=field==='playerId'?'18':8;
 const reads=f.state.reads;await assert.rejects(f.service.assertFormationReady(f.session,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});assert.equal(f.state.reads,reads);assert.equal(f.state.writes,1);
});
for(const field of ['playerId','worldId','connectionId'])test('formation preflight rejects '+field+' replacement during independent reread',async t=>{
 const f=formationProofFixture(t);await f.save();let changed=false;f.state.onRead=()=>{if(changed)return;changed=true;if(field==='connectionId')f.session.connectionId='other-connection';else f.session.player[field]=field==='playerId'?'18':8;};
 await assert.rejects(f.service.assertFormationReady(f.session,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});assert.equal(f.state.writes,1);
});
for(const failFinal of [false,true])test('formation proof is unavailable until original final history is durably saved '+failFinal,async t=>{
 const f=formationProofFixture(t);let checkpoint;
 f.state.onPut=row=>{if(row.finishedAt&&row.finalStatus==='SUCCESS'){checkpoint=f.service.assertFormationReady(f.session,{enabled:true,presetId:2},{alreadyLocked:true}).then(()=>true,e=>e.code);if(failFinal)throw Object.assign(Error('synthetic final fsync failure'),{code:'HISTORY_UNAVAILABLE'});}};
 await f.save();assert.equal(await checkpoint,'FORMATION_REQUIRED');assert.equal(f.state.writes,1);
 if(failFinal)await assert.rejects(f.service.assertFormationReady(f.session,{enabled:true,presetId:2},{alreadyLocked:true}),{code:'FORMATION_REQUIRED'});
 else assert.equal((await f.service.assertFormationReady(f.session,{enabled:true,presetId:2})).confirmed,true);
});
test('formation proof is not restored from historical success after Service restart',async t=>{
 const f=formationProofFixture(t);await f.save();const bytes=fs.readFileSync(f.file,'utf8');await assert.rejects(f.reopen().assertFormationReady(f.session,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});assert.equal(fs.readFileSync(f.file,'utf8'),bytes);assert.equal(f.state.writes,1);
});

for(const field of ['playerId','worldId','connectionId','generation','client','clientIdentity'])test('detected formation proof identity loss cannot be undone by restoring '+field,async t=>{
 const f=formationProofFixture(t);await f.save();const original={id:f.session.id,player:structuredClone(f.session.player),generation:f.session.generation,connectionId:f.session.connectionId,client:f.session.client};
 if(field==='playerId')f.session.player.playerId='18';if(field==='worldId')f.session.player.worldId=8;if(field==='connectionId')f.session.connectionId='replacement';if(field==='generation')f.session.generation++;if(field==='client')f.session.client={...f.session.client};if(field==='clientIdentity')f.session.client.factContext={accountId:'other-account'};
 await assert.rejects(f.service.assertFormationReady(f.session,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});
 Object.assign(f.session,original);delete f.session.client.factContext;
 await assert.rejects(f.service.assertFormationReady(f.session,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});assert.equal(f.state.writes,1);
});
test('formation proof cannot be read from another account without destroying the original account proof',async t=>{
 const f=formationProofFixture(t);await f.save();const other={...f.session,id:'B',connectionId:'B',player:{playerId:'18',worldId:8}};
 await assert.rejects(f.service.assertFormationReady(other,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});assert.equal((await f.service.assertFormationReady(f.session,{enabled:true,presetId:2})).confirmed,true);assert.equal(f.state.writes,1);
});
test('final history save identity race preserves original success but never publishes it for a replacement role',async t=>{
 const f=formationProofFixture(t);f.state.onPut=row=>{if(row.finishedAt&&row.finalStatus==='SUCCESS')f.session.player.playerId='18';};
 const saved=await f.save();assert.equal(saved.finalStatus,'SUCCESS');assert.equal(saved.executionContext.playerId,'17');await assert.rejects(f.service.assertFormationReady(f.session,{enabled:true,presetId:2}),{code:'FORMATION_REQUIRED'});assert.equal(f.state.writes,1);
});
