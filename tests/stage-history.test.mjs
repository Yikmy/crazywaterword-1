import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {battleAnalysis} from '../src/formation.mjs';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {createStandaloneStageJournal,projectStageBattleHistory,compareStageBattles} from '../src/stage-history.mjs';

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