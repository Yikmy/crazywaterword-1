import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {battleAnalysis,surveyFormation} from '../src/formation.mjs';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {createStandaloneStageJournal,projectStageBattleHistory,compareStageBattles,prepareStageRecommendation,validateStageRecommendationSource} from '../src/stage-history.mjs';

const context={accountId:'A',playerId:'9007199254740993',worldId:'17',generation:1,connectionId:'synthetic'};
function analysis(damage='9007199254740993',win=false) {
 return battleAnalysis({initialData:{mainlineStage:41,battleType:1,leftTeam:{members:[{hero:{heroId:'hero'},pos:{x:1,y:2}}]},rightTeams:[{members:[{hero:{heroId:'enemy'},pos:{x:2,y:2}}]}]},stats:{isLeftWin:win,leftHeroDamages:[{heroId:'hero',pos:{x:1,y:2},leftHp:win?10:0,statBar:{damage:{physical:damage,magic:0,true:0}}}]}});
}
function record(runId='run',damage,win=false) {
 const history={put(row){this.saved=structuredClone(row);}},journal=createStandaloneStageJournal(history,context),at='2026-11-13T00:00:00Z';
 journal.start({runId,stage:41,at,config:{}});journal.dispatch({runId,stage:41,attempt:1,at});
 journal.settle({runId,stage:41,attempt:1,at,result:{stage:41,outcome:win?'SUCCESS':'FAILED',isLeftWin:win,playerSide:'LEFT'},analysis:analysis(damage,win)});
 journal.finish({runId,at,kind:'COMPLETED',reason:'synthetic done'});return history.saved;
}
const reports=()=>projectStageBattleHistory('A',[record('before','9007199254740993'),record('after','9007199254740998',true)]).reports;
test('standalone analysis is durable in the original v1 History and restart reads leave bytes unchanged',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-stage-analysis-'));try {
  const file=path.join(dir,'history.json'),history=createExecutionHistory({file});history.put(record());
  const bytes=fs.readFileSync(file,'utf8'),restored=createExecutionHistory({file});
  const projected=projectStageBattleHistory('A',restored.list('A'));assert.equal(projected.reports.length,1);assert.equal(projected.reports[0].analysis.leftHeroDamages[0].damage,'9007199254740993');assert.equal(projected.resumable,false);
  assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(projectStageBattleHistory('B',restored.list('B')).reports,[]);
 } finally{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});}
});
test('projection preserves known individual battles from the existing Function runner without claiming its unknown batch completed',()=>{
 const original=record(),a=original.actions[0],entry={runId:'runner',stage:41,attempt:1,outcome:'FAILED',battleAnalysis:a.battleAnalysis};
 const run={...original,source:undefined,finalStatus:'UNKNOWN',actions:[{...a,actionType:'RUN_MAINLINE',result:'UNKNOWN',afterState:{runId:'runner',history:[entry]}}]};
 const result=projectStageBattleHistory('A',[run]);assert.equal(result.reports.length,1);assert.equal(result.reports[0].outcome,'FAILED');assert.equal(run.finalStatus,'UNKNOWN');
 run.actions[0].afterState.history[0].runId='foreign-runner';assert.equal(projectStageBattleHistory('A',[run]).reports.length,0);
});
for(const change of ['legacy','missing-role','foreign-account','unknown','mismatched-stage','missing-intent'])test('projection excludes '+change+' without inventing analysis or identity',()=>{
 const run=record();if(change==='legacy')delete run.actions[0].battleAnalysis;
 if(change==='missing-role')delete run.executionContext.worldId;
 if(change==='foreign-account')run.accountId='B';
 if(change==='unknown')run.actions[0].result='UNKNOWN';
 if(change==='mismatched-stage')run.actions[0].battleAnalysis.stage=42;
 if(change==='missing-intent')delete run.actions[0].dispatchEvidence;
 assert.deepEqual(projectStageBattleHistory('A',[run]).reports,[]);
});
test('projection is bounded and caller cannot select an unbounded history',()=>{
 const runs=Array.from({length:5},(_,i)=>record('run-'+i));const result=projectStageBattleHistory('A',runs,{limit:2});assert.equal(result.total,5);assert.equal(result.reports.length,2);
 for(const limit of [0,201,Infinity])assert.throws(()=>projectStageBattleHistory('A',runs,{limit}));
});
test('same-stage observation comparison keeps exact signed deltas above Number precision',()=>{
 const [before,after]=reports(),result=compareStageBattles(before,after);assert.equal(result.status,'COMPARED');assert.deepEqual(result.damage,{before:'9007199254740993',after:'9007199254740998',delta:'5'});assert.equal(result.heroes[0].hpDelta,'10');assert.equal(result.automaticSwitch,false);assert.equal(result.resumeAllowed,false);assert.equal(compareStageBattles(after,before).damage.delta,'-5');
});
for(const key of ['accountId','playerId','worldId','battleMode'])test('comparison refuses mismatched '+key,()=>{
 const [before,after]=reports();after.scope[key]='other';assert.equal(compareStageBattles(before,after).status,'BLOCKED');
});
test('different stages, the same report and unknown outcomes are not comparable',()=>{
 const [before,after]=reports();assert.equal(compareStageBattles(before,before).status,'BLOCKED');after.stage=42;assert.equal(compareStageBattles(before,after).status,'BLOCKED');after.stage=41;after.analysis.outcome='UNKNOWN';assert.equal(compareStageBattles(before,after).status,'BLOCKED');
});
for(const change of ['missing-damage','duplicate-damage','extra-damage','wrong-position','missing-team','duplicate-member'])test('incomplete '+change+' stays unknown and cannot become zero damage',()=>{
 const [before,after]=reports(),a=after.analysis;
 if(change==='missing-damage')a.leftHeroDamages[0].damage=null;
 if(change==='duplicate-damage'||change==='extra-damage')a.leftHeroDamages.push({...a.leftHeroDamages[0],...(change==='extra-damage'?{heroId:'unrelated'}:{})});
 if(change==='wrong-position')a.leftHeroDamages[0].pos.x++;
 if(change==='missing-team')a.leftTeam=null;
 if(change==='duplicate-member')a.leftTeam.members.push(a.leftTeam.members[0]);
 const result=compareStageBattles(before,after);assert.equal(result.status,'COMPARED');assert.equal(result.damage.after,null);assert.equal(result.damage.delta,null);assert.ok(result.gaps.length);
});
test('comparison never mutates the selected reports or invents a delta for a different participant',()=>{
 const [before,after]=reports(),bytes=JSON.stringify([before,after]);compareStageBattles(before,after);assert.equal(JSON.stringify([before,after]),bytes);
 after.analysis.leftTeam.members[0].heroId='different';after.analysis.leftHeroDamages[0].heroId='different';const result=compareStageBattles(before,after);assert.equal(result.heroes.length,2);assert.ok(result.heroes.every(row=>row.damageDelta===null));
});

async function recommendationFixture({extraPreset=false}={}){
 const run=record(),report=projectStageBattleHistory('A',[run]).reports[0];report.analysis.leftTeam.presetId=1;
 const config={tables:{HeroCfg:{data:[{id:'hero',career:'坦克'}]},FormationHeroNumCfg:{data:[{heroNum:1,mainlineStage:0}]},FormationTypePositionCfg:{data:[{id:1,position:[1,2]},{id:2,position:[5,2]},...(extraPreset?[{id:3,position:[9,2]}]:[])]}}},player={playerId:context.playerId,worldId:context.worldId,mainlineStage:41};
 const protocol=Object.fromEntries(['GetFormation','MyFormationPreset','AllHero','SaveFormation'].flatMap(n=>[[n+'Request',{}],[n+'Response',{}]])),client={connected:true,async request(name){return name==='GetFormationRequest'?{formation:{presetId:1,petUid:'9007199254740993',heroPositions:[{heroId:'hero',pos:{x:1,y:2}}]}}:name==='MyFormationPresetRequest'?{ids:extraPreset?[2,3]:[2]}:{heroes:[{heroId:'hero'}]};}};
 const facts=await surveyFormation(client,protocol,{config,player}),options={accountId:'A',player,progress:41,presetId:2,maxAttempts:3,moduleConfig:{enabled:true,mainlineEnabled:true}};
 return {report,facts,options,prepare(){return prepareStageRecommendation(this.report,this.facts,this.options);}};
}
test('battle recommendation preparation fixes source, exact team and bounded original Formation then Stage nodes',async()=>{
 const f=await recommendationFixture(),prepared=f.prepare();assert.equal(prepared.source.rule,'CLIENT_CAREER_LAYOUT');assert.equal(prepared.source.declarativeOnly,true);assert.equal(prepared.resumable,false);assert.equal(prepared.requiresAuthorization,true);assert.equal(prepared.requiresFreshPlan,true);
 assert.equal(prepared.graph.nodes[1].module,'formation');assert.deepEqual(prepared.graph.nodes[1].parameters,{presetId:2,heroPositions:[{heroId:'hero',pos:{x:5,y:2}}]});assert.equal(prepared.graph.nodes[2].type,'VERIFY');
 assert.equal(prepared.graph.nodes[3].module,'stage');assert.equal(prepared.graph.nodes[3].parameters.expectedStage,41);assert.equal(prepared.graph.nodes[3].parameters.config.maxAttempts,3);assert.equal(prepared.graph.nodes[3].parameters.config.stopOnDefeat,true);assert.deepEqual(prepared.graph.nodes[3].parameters.config.formation,{enabled:true,presetId:2});
 assert.deepEqual(prepared.graph.budget,{resources:[],quotas:[],uids:[]});assert.equal(prepared.source.playerId,'9007199254740993');assert.match(prepared.limitation,/不证明/);prepared.source.stage=42;assert.equal(f.prepare().source.stage,41);
});
for(const mode of ['account','role','world','mode','victory','unknown','side','progress','report-stage','team','preset','locked','stale','future','missing-source','disabled','mainline-disabled','unbounded'])test('battle recommendation preparation blocks '+mode,async()=>{
 const f=await recommendationFixture();if(mode==='account')f.options.accountId='B';if(mode==='role')f.options.player.playerId='2';if(mode==='world')f.options.player.worldId='2';if(mode==='mode')f.report.scope.battleMode='ARENA';if(mode==='victory')f.report.outcome='SUCCESS';if(mode==='unknown')f.report.analysis.status='UNKNOWN';if(mode==='side')f.report.analysis.playerSide='RIGHT';if(mode==='progress')f.options.progress=42;if(mode==='report-stage')f.report.analysis.stage=42;if(mode==='team')f.report.analysis.leftTeam.members[0].pos.x=9;if(mode==='preset')f.report.analysis.leftTeam.presetId=2;if(mode==='locked')f.facts.unlockedPresetIds=[1];if(mode==='stale')f.options.now=f.facts.formationSource.sourceAt+30001;if(mode==='future')f.options.now=f.facts.formationSource.sourceAt-1;if(mode==='missing-source')delete f.facts.formationSource;if(mode==='disabled')f.options.moduleConfig.enabled=false;if(mode==='mainline-disabled')f.options.moduleConfig.mainlineEnabled=false;if(mode==='unbounded')f.options.maxAttempts=null;
 assert.throws(()=>f.prepare(),{code:'STAGE_RECOMMENDATION_UNAVAILABLE'});
});
test('battle recommendation source schema rejects arbitrary authority, mismatching links and executable state',async()=>{
 const f=await recommendationFixture(),source=f.prepare().source;
 for(const patch of [{permit:'x'},{declarativeOnly:false},{rule:'BEST_FORMATION'},{reportId:'unbound'},{attempt:0},{maxAttempts:201},{playerId:'01'},{worldId:'9223372036854775808'},{analysisHash:'abc'},{accountId:' '}])assert.throws(()=>validateStageRecommendationSource({...source,...patch}),{code:'INVALID_STAGE_RECOMMENDATION'});
});


test('bounded recommendation compiles explicit ordered candidates as one finite original DAG',async()=>{
 const f=await recommendationFixture({extraPreset:true});Object.assign(f.options,{presetIds:[2,3],maxAttempts:2,maxDurationMs:60000});const prepared=f.prepare();
 assert.deepEqual(prepared.source.presetIds,[2,3]);assert.equal(prepared.source.maxAttempts,2);assert.equal(prepared.source.maxDurationMs,60000);assert.equal(prepared.source.decisionRule,'ORDERED_CLIENT_CAREER_LAYOUT');assert.deepEqual(prepared.graph.runPolicy,{maxDurationMs:60000,maxActions:4,modules:['formation','stage']});
 const actions=prepared.graph.nodes.filter(row=>row.type==='ACTION');assert.equal(actions.length,4);assert.deepEqual(actions.filter(row=>row.module==='formation').map(row=>row.parameters.presetId),[2,3]);assert.ok(actions.every(row=>row.selection.unique===true));
 const battles=actions.filter(row=>row.module==='stage');assert.ok(battles.every(row=>row.parameters.expectedStage===41&&row.parameters.config.maxAttempts===1&&row.parameters.config.stopOnDefeat===true));assert.equal(battles[0].onConfirmedDefeat,'BRANCH');assert.equal(Object.hasOwn(battles[1],'onConfirmedDefeat'),false);assert.equal(prepared.resumable,false);assert.equal(prepared.requiresAuthorization,true);
 const {validateWorkflow}=await import('../src/workflow.mjs'),{formationModule}=await import('../src/formation.mjs');assert.equal(validateWorkflow(prepared.graph,{modules:{formation:formationModule,stage:{id:'stage',survey(){},view(){},plan(){},verify(){}}}}).valid,true);
 prepared.source.presetIds.reverse();assert.deepEqual(f.prepare().source.presetIds,[2,3]);
});
test('bounded recommendation clips candidates to the explicit total battle count and changes graph identity with scope',async()=>{
 const f=await recommendationFixture({extraPreset:true});Object.assign(f.options,{presetIds:[2,3],maxAttempts:1,maxDurationMs:60000});const one=f.prepare();assert.deepEqual(one.source.presetIds,[2]);assert.equal(one.graph.runPolicy.maxActions,2);assert.equal(one.graph.nodes.some(row=>row.onConfirmedDefeat),false);
 f.options.maxAttempts=2;const two=f.prepare();assert.notEqual(one.graph.id,two.graph.id);f.options.maxDurationMs++;assert.notEqual(two.graph.id,f.prepare().graph.id);
});
for(const mode of ['duplicate','first-mismatch','too-many','missing-duration','zero-duration','large-duration','too-many-attempts','locked','unknown-template'])test('bounded recommendation refuses invalid or unavailable candidate scope '+mode,async()=>{
 const f=await recommendationFixture({extraPreset:true});Object.assign(f.options,{presetIds:[2,3],maxAttempts:2,maxDurationMs:60000});
 if(mode==='duplicate')f.options.presetIds=[2,2];if(mode==='first-mismatch')f.options.presetIds=[3,2];if(mode==='too-many')f.options.presetIds=Array.from({length:11},(_,i)=>i+2);if(mode==='missing-duration')delete f.options.maxDurationMs;if(mode==='zero-duration')f.options.maxDurationMs=0;if(mode==='large-duration')f.options.maxDurationMs=86400001;if(mode==='too-many-attempts')f.options.maxAttempts=3;if(mode==='locked')f.facts.unlockedPresetIds=[2];if(mode==='unknown-template')f.options.presetIds=[2,9];
 assert.throws(()=>f.prepare(),error=>['INVALID_STAGE_RECOMMENDATION','STAGE_RECOMMENDATION_UNAVAILABLE'].includes(error.code));
});
test('bounded source rejects a changed rule, duplicate candidates, count or implicit deadline',async()=>{
 const f=await recommendationFixture({extraPreset:true});Object.assign(f.options,{presetIds:[2,3],maxAttempts:2,maxDurationMs:60000});const source=f.prepare().source;
 for(const patch of [{decisionRule:'RETRY_UNKNOWN'},{presetIds:[2,2]},{maxAttempts:1},{maxDurationMs:null},{presetIds:[3,2]}])assert.throws(()=>validateStageRecommendationSource({...source,...patch}),{code:'INVALID_STAGE_RECOMMENDATION'});
});

async function empiricalRecommendationFixture(){
 const f=await recommendationFixture({extraPreset:true});f.report.analysis.leftTeam.raw.presetId=1;Object.assign(f.options,{presetIds:[2,3],maxAttempts:2,maxDurationMs:60000,selectionRule:'OBSERVED_WIN_RATE',minSamples:2});
 const history=(presetId,win,i)=>{const row=structuredClone(f.report);row.runId='observed-'+presetId+'-'+i;row.reportId=JSON.stringify([row.runId,row.actionId,row.runnerId,row.attempt]);row.outcome=win?'SUCCESS':'FAILED';row.analysis.outcome=row.outcome;row.analysis.leftTeam.presetId=presetId;row.analysis.leftTeam.raw.presetId=presetId;const pos={x:presetId===2?5:9,y:2};row.analysis.leftTeam.members[0].pos=pos;row.analysis.leftTeam.raw.members[0].pos=structuredClone(pos);return row;};
 f.options.reports=[history(2,false,1),history(2,false,2),history(3,true,1),history(3,true,2)];f.history=history;return f;
}
test('explicit empirical rule orders all declared candidates by exact observed win fraction before clipping battle count',async()=>{
 const f=await empiricalRecommendationFixture(),before=structuredClone({options:f.options,report:f.report}),result=f.prepare();assert.equal(result.source.rule,'CLIENT_CAREER_LAYOUT');assert.equal(result.source.decisionRule,'OBSERVED_WIN_RATE_CLIENT_CAREER_LAYOUT');assert.deepEqual(result.source.presetIds,[3,2]);assert.equal(result.source.presetId,3);assert.deepEqual(result.source.statistics.candidatePresetIds,[2,3]);assert.deepEqual(result.source.statistics.entries.map(r=>[r.presetId,r.wins,r.losses]),[[2,0,2],[3,2,0]]);assert.equal(result.graph.nodes.find(r=>r.id==='save-0').parameters.presetId,3);assert.equal(result.graph.runPolicy.maxActions,4);assert.match(result.limitation,/不证明因果或未来更优/);assert.equal(result.requiresAuthorization,true);assert.equal(result.resumable,false);assert.deepEqual(f.options,before.options);assert.deepEqual(f.report,before.report);
 f.options.maxAttempts=1;const clipped=f.prepare();assert.deepEqual(clipped.source.presetIds,[3]);assert.equal(clipped.source.statistics.entries.length,2);assert.equal(clipped.graph.runPolicy.maxActions,2);assert.equal(clipped.graph.nodes.some(r=>r.onConfirmedDefeat),false);assert.deepEqual(validateStageRecommendationSource(clipped.source),clipped.source);
});
test('empirical rule ties preserve declared candidate order and exact repeated reports count once',async()=>{
 const f=await empiricalRecommendationFixture();f.options.reports=[f.history(2,true,1),f.history(2,false,2),f.history(3,true,1),f.history(3,false,2)];const a=f.prepare();assert.deepEqual(a.source.presetIds,[2,3]);f.options.reports.push(structuredClone(f.options.reports[0]));assert.deepEqual(f.prepare().source,a.source);f.options.reports.reverse();assert.deepEqual(f.prepare().source,a.source);
});
for(const mode of ['account','role','world','stage','mode','unknown','analysis-outcome','side','opponent','hero-growth','hero-id','pet','preset','position','missing-team','missing-opponent','missing-hero','missing-position','duplicate-hero','conflict'])test('empirical selection excludes unmatched or conflicting history '+mode,async()=>{
 const f=await empiricalRecommendationFixture(),r=f.options.reports[0],a=r.analysis;
 if(mode==='account')r.scope.accountId='B';if(mode==='role')r.scope.playerId='1';if(mode==='world')r.scope.worldId='1';if(mode==='stage')r.stage=42;if(mode==='mode')r.scope.battleMode='ARENA';if(mode==='unknown')r.outcome='UNKNOWN';if(mode==='analysis-outcome')a.outcome='SUCCESS';if(mode==='side')a.playerSide='RIGHT';if(mode==='opponent')a.rightTeams[0].raw.members[0].hero.level=2;if(mode==='hero-growth')a.leftTeam.raw.members[0].hero.level=2;if(mode==='hero-id')a.leftTeam.raw.members[0].hero.heroId='another';if(mode==='pet')a.leftTeam.raw.pet={uid:'1'};if(mode==='preset')a.leftTeam.raw.presetId=9;if(mode==='position')a.leftTeam.raw.members[0].pos.x++;if(mode==='missing-team')a.leftTeam=null;if(mode==='missing-opponent')a.rightTeams=null;if(mode==='missing-hero')delete a.leftTeam.raw.members[0].hero;if(mode==='missing-position')delete a.leftTeam.raw.members[0].pos;if(mode==='duplicate-hero')a.leftTeam.raw.members.push(structuredClone(a.leftTeam.raw.members[0]));if(mode==='conflict'){const other=structuredClone(r);other.outcome='SUCCESS';other.analysis.outcome='SUCCESS';f.options.reports.push(other);}
 assert.throws(()=>f.prepare(),{code:'STAGE_RECOMMENDATION_UNAVAILABLE'});
});
for(const patch of [{minSamples:0},{minSamples:null},{minSamples:'2'},{minSamples:201},{minSamples:undefined},{selectionRule:'MOST_DAMAGE'},{selectionRule:undefined},{presetIds:undefined},{maxDurationMs:undefined}])test('empirical preparation requires explicit bounded rule and minimum samples '+JSON.stringify(patch),async()=>{const f=await empiricalRecommendationFixture();Object.assign(f.options,patch);assert.throws(()=>f.prepare(),{code:'INVALID_STAGE_RECOMMENDATION'});});
for(const mode of ['missing-source-basis','insufficient','unbounded','unsafe-position'])test('empirical source remains unavailable '+mode,async()=>{const f=await empiricalRecommendationFixture();if(mode==='missing-source-basis')f.report.analysis.rightTeams=[];if(mode==='insufficient')f.options.minSamples=3;if(mode==='unbounded')f.options.reports=Array.from({length:201},()=>f.options.reports[0]);if(mode==='unsafe-position')f.report.analysis.leftTeam.raw.members[0].pos.x=NaN;assert.throws(()=>f.prepare(),{code:'STAGE_RECOMMENDATION_UNAVAILABLE'});});
for(const mode of ['minimum','wins','ids','digest','basis','candidate','order','selected-first','unknown-field','duplicate-id'])test('original Workflow source rejects tampered empirical provenance '+mode,async()=>{
 const f=await empiricalRecommendationFixture(),s=f.prepare().source,v=s.statistics;if(mode==='minimum')v.minSamples=3;if(mode==='wins')v.entries[0].wins++;if(mode==='ids')v.entries[0].reportIds[0]='different';if(mode==='digest')v.evidenceHash='0'.repeat(64);if(mode==='basis')v.basisHash='0'.repeat(64);if(mode==='candidate')v.candidatePresetIds.reverse();if(mode==='order')s.presetIds.reverse();if(mode==='selected-first')s.presetId=2;if(mode==='unknown-field')v.authorization=true;if(mode==='duplicate-id')v.entries[1].reportIds[0]=v.entries[0].reportIds[0];assert.throws(()=>validateStageRecommendationSource(s),{code:'INVALID_STAGE_RECOMMENDATION'});
});
test('shared battle projection excludes both conflicting copies and deduplicates identical reports without mutation',()=>{
 const a=record(),same=structuredClone(a),other=record('run','42',true),before=JSON.stringify([a,same,other]);assert.equal(projectStageBattleHistory('A',[a,same]).total,1);assert.equal(projectStageBattleHistory('A',[a,other]).total,0);assert.equal(projectStageBattleHistory('A',[other,a]).total,0);assert.equal(JSON.stringify([a,same,other]),before);
});

for(const mode of ['projected-members-object','projected-hero-null','projected-position','source-raw-conflict','opponent-hole','member-hole'])test('empirical malformed observed team is unavailable without a parser crash '+mode,async()=>{
 const f=await empiricalRecommendationFixture(),r=mode==='source-raw-conflict'?f.report:f.options.reports[0];if(mode==='projected-members-object')r.analysis.leftTeam.members={};if(mode==='projected-hero-null')r.analysis.leftTeam.members[0].heroId=null;if(mode==='projected-position')r.analysis.leftTeam.members[0].pos.x++;if(mode==='source-raw-conflict')r.analysis.leftTeam.raw.presetId=9;if(mode==='opponent-hole')delete r.analysis.rightTeams[0];if(mode==='member-hole')delete r.analysis.leftTeam.raw.members[0];assert.throws(()=>f.prepare(),{code:'STAGE_RECOMMENDATION_UNAVAILABLE'});
});
