import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWorkflow, simulateWorkflow, createWorkflowRunner, createWorkflowStore, exampleWorkflows, evaluateWorkflowCondition } from '../src/workflow.mjs';
const moduleEntry=id=>({id,survey(){throw Error('static validation must not invoke module')},view(){},plan(){},verify(){}});
const modules={fixture:moduleEntry('fixture'),formation:moduleEntry('formation'),stage:moduleEntry('stage')};
function graph(){return {version:1,id:'wf-1',name:'Fixture',nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'fixture'},{id:'a',type:'ACTION',module:'fixture',selection:{actionId:'operation-1'},parameters:{targetId:'exact'}},{id:'v',type:'VERIFY',module:'fixture'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]}}
function readOnly(wait=0){return {version:1,id:'readonly',name:'Readonly',nodes:[{id:'s',type:'START'},{id:'w',type:'WAIT',durationMs:wait},{id:'z',type:'STOP'}],edges:[{from:'s',to:'w'},{from:'w',to:'z'}]}}
function fixture(overrides={}){
 const session={id:'account-1',generation:1,client:{},abort:new AbortController()},calls=[],runs=[];let released=0;
 const plan={accountId:session.id,module:'fixture',batchId:'batch-1',planHash:'hash-1',actions:[{actionId:'operation-1',costs:[]}],resourceBudget:[]};
 const operations={surveyModule:async(...args)=>{calls.push(['survey',...args]);return {available:true}},plan:async(...args)=>{calls.push(['plan',...args]);return structuredClone(plan)},history:async()=>({runs}),authorize(){throw Error('workflow must not authorize')},execute(){throw Error('workflow must not execute')},...overrides};
 const runner=createWorkflowRunner({operations,getSession:id=>id===session.id?session:null,modules,isCurrent:(value,generation,client)=>value===session&&session.generation===generation&&session.client===client,claim:()=>{calls.push(['claim']);return()=>{released++}},clock:()=>1000});
 function success(changes={}){return {runId:'run-1',accountId:session.id,finalStatus:'SUCCESS',finishedAt:'2026-11-11T00:00:00.000Z',planSummary:{batchId:plan.batchId,planHash:plan.planHash},authorizationSummary:{batchId:plan.batchId},actions:[{actionId:'operation-1',result:'SUCCESS',verification:{confirmed:true}}],...changes}}
 return {runner,session,calls,runs,plan,success,released:()=>released};
}
test('validator accepts registered finite DAG without invoking business functions',()=>{const result=validateWorkflow(graph(),{modules});assert.equal(result.valid,true);assert.deepEqual(result.order,['s','q','a','v','z']);assert.notEqual(result.workflow,graph())});
test('validator rejects unknown root/node/edge and transport injection',()=>{
 for(const change of [g=>g.script='return true',g=>g.nodes[2].request='InjectedRequest',g=>g.nodes[2].parameters={body:{}},g=>g.edges[0].permitId='x',g=>g.nodes[2].parameters={nested:{token:'x'}},g=>g.nodes[2].parameters={nested:{fn:()=>1}}]){const g=graph();change(g);assert.throws(()=>validateWorkflow(g,{modules}),{code:'WORKFLOW_INVALID'})}
});
test('validator rejects cycles, unreachable nodes and ambiguous exits',()=>{
 for(const change of [g=>g.edges.push({from:'z',to:'s'}),g=>g.nodes.push({id:'unused',type:'STOP'}),g=>g.edges.push({from:'q',to:'z'}),g=>g.edges[0].to='missing']){const g=graph();change(g);assert.throws(()=>validateWorkflow(g,{modules}),{code:'WORKFLOW_INVALID'})}
});
test('validator enforces bounded WAIT/node count and registered modules',()=>{const wait=readOnly(60001);assert.throws(()=>validateWorkflow(wait,{modules}),{code:'WORKFLOW_INVALID'});const g=graph();g.nodes[2].module='invented';assert.throws(()=>validateWorkflow(g,{modules}),{code:'WORKFLOW_INVALID'});g.nodes=Array.from({length:51},(_,i)=>({id:String(i),type:'STOP'}));assert.throws(()=>validateWorkflow(g,{modules}),{code:'WORKFLOW_INVALID'})});
test('simulation is static and cannot create runtime or send requests',()=>{const result=simulateWorkflow(graph(),{modules});assert.equal(result.runtimeCreated,false);assert.equal(result.requestsSent,0);assert.equal(result.trace.find(row=>row.type==='ACTION').requiresAuthorization,true)});
test('conditions use fixed own-property paths, unknown values and strict types',()=>{assert.equal(evaluateWorkflowCondition({source:'survey',path:['count'],operator:'GTE',value:2},{survey:{count:2}}).status,'PASS');assert.equal(evaluateWorkflowCondition({source:'survey',path:['count'],operator:'EQ',value:0},{survey:{}}).status,'UNKNOWN');assert.equal(evaluateWorkflowCondition({source:'survey',path:['count'],operator:'EQ',value:0},{survey:{count:'0'}}).status,'UNKNOWN');assert.throws(()=>evaluateWorkflowCondition({source:'survey',path:['constructor'],operator:'EXISTS'},{}),{code:'WORKFLOW_INVALID'})});
test('runner surveys and plans Manual then pauses with concrete same-account batch',async()=>{const f=fixture(),result=await f.runner.start(f.session.id,graph());assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(result.plan.batchId,'batch-1');assert.equal(f.calls.filter(row=>row[0]==='plan').length,1);const payload=f.calls.find(row=>row[0]==='plan')[2];assert.equal(payload.mode,'Manual');assert.deepEqual(payload.selections,['operation-1']);assert.equal(f.released(),0);await assert.rejects(f.runner.start(f.session.id,graph()),{code:'WORKFLOW_BUSY'});f.runner.stop();await f.runner.settle();assert.equal(f.released(),1)});
test('resume waits for matching history and ignores foreign account/batch runs',async()=>{const f=fixture();await f.runner.start(f.session.id,graph());f.runs.push(f.success({accountId:'other'}),f.success({planSummary:{batchId:'other'},authorizationSummary:{batchId:'other'}}));assert.equal((await f.runner.resume()).status,'AWAITING_AUTHORIZATION');assert.equal(f.calls.filter(row=>row[0]==='plan').length,1);f.runner.stop();await f.runner.settle()});
test('resume accepts only completed same batch SUCCESS+CONFIRMED and runs VERIFY',async()=>{const f=fixture();await f.runner.start(f.session.id,graph());f.runs.push(f.success());const result=await f.runner.resume();assert.equal(result.status,'COMPLETED');assert.equal(f.released(),1);assert.ok(result.trace.some(row=>row.type==='VERIFY'&&row.result==='CONFIRMED'));assert.equal(f.calls.filter(row=>row[0]==='plan').length,1)});
test('UNKNOWN, unconfirmed, duplicate or mismatching history cannot advance',async()=>{
 for(const make of [f=>[f.success({finalStatus:'UNKNOWN'})],f=>[f.success({actions:[{actionId:'operation-1',result:'SUCCESS',verification:{confirmed:false}}]})],f=>[f.success(),f.success({runId:'duplicate'})],f=>[f.success({planSummary:{batchId:'batch-1',planHash:'wrong'}})],f=>[f.success({actions:[{actionId:'different',result:'SUCCESS',verification:'CONFIRMED'}]})]]){const f=fixture();await f.runner.start(f.session.id,graph());f.runs.push(...make(f));assert.equal((await f.runner.resume()).status,'UNKNOWN');assert.equal(f.released(),1);assert.equal(f.calls.filter(row=>row[0]==='plan').length,1)}
});
test('resume rejects caller supplied results and history failures stop conservatively',async()=>{const f=fixture({history:async()=>{throw Error('fixture')}});await f.runner.start(f.session.id,graph());await assert.rejects(f.runner.resume(f.success()),{code:'WORKFLOW_INVALID'});assert.equal((await f.runner.resume()).status,'UNKNOWN');assert.equal(f.released(),1)});
test('WAIT cancels promptly and never dispatches subsequent work',async()=>{const f=fixture();const running=f.runner.start(f.session.id,readOnly(3000));await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.runner.getStatus().status,'WAITING');f.runner.stop();const result=await running;assert.equal(result.status,'CANCELLED');assert.equal(f.released(),1);assert.equal(f.calls.some(row=>row[0]==='plan'),false)});
test('account abort while waiting authorization releases workflow claim',async()=>{const f=fixture();await f.runner.start(f.session.id,graph());f.session.abort.abort();await f.runner.settle();assert.equal(f.runner.getStatus().status,'CANCELLED');assert.equal(f.released(),1)});
test('unknown condition stops without consuming a branch or requesting a plan',async()=>{const f=fixture(),g={version:1,id:'rules',name:'Rules',nodes:[{id:'s',type:'START'},{id:'r',type:'RULE',condition:{source:'survey',path:['missing'],operator:'EQ',value:true}},{id:'b',type:'BRANCH'},{id:'p',type:'STOP'},{id:'n',type:'STOP'}],edges:[{from:'s',to:'r'},{from:'r',to:'b'},{from:'b',to:'p',when:'PASS'},{from:'b',to:'n',when:'FAIL'}]};assert.equal((await f.runner.start(f.session.id,g)).status,'UNKNOWN');assert.equal(f.calls.some(row=>row[0]==='plan'),false)});
test('store distinguishes the exact live workflow from interrupted snapshots, without restoring execution',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-')),file=path.join(dir,'workflow.json');try{const store=createWorkflowStore({file,modules});store.save('__proto__',graph());assert.equal(store.list('__proto__').length,1);assert.deepEqual(store.list('other'),[]);store.record('__proto__',{runId:'wf-run',workflowId:'wf-1',status:'AWAITING_AUTHORIZATION',plan:{permitId:'must-not-save'},trace:[{nodeId:'a',type:'ACTION',result:'WAIT',token:'must-not-save'}]});const bytes=fs.readFileSync(file,'utf8');assert.equal(bytes.includes('must-not-save'),false);const live=store.history('__proto__',{liveRunId:'wf-run'})[0];assert.equal(live.status,'AWAITING_AUTHORIZATION');assert.equal(live.resumable,false);assert.equal(live.recovered,undefined);assert.deepEqual(store.history('other',{liveRunId:'wf-run'}),[]);assert.equal(store.history('__proto__',{liveRunId:'another-run'})[0].status,'RECOVERED_STOPPED');const recovered=createWorkflowStore({file,modules}).history('__proto__')[0];assert.equal(recovered.status,'RECOVERED_STOPPED');assert.equal(recovered.resumable,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json'])}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('corrupt workflow evidence is preserved and save refuses overwrite',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-corrupt-')),file=path.join(dir,'workflow.json');try{fs.writeFileSync(file,'{corrupt fixture');const store=createWorkflowStore({file,modules});assert.throws(()=>store.save('a',graph()),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),'{corrupt fixture')}finally{fs.rmSync(dir,{recursive:true,force:true})}});
test('examples reference only registered modules and stage has independent authorization',()=>{const examples=exampleWorkflows(modules);assert.ok(examples.some(example=>example.id==='formation-stage-template'));for(const example of examples)assert.equal(validateWorkflow(example.workflow,{modules}).valid,true);assert.equal(exampleWorkflows({formation:modules.formation}).some(example=>example.id==='formation-stage-template'),false)});

test('workflow scope is internal and onUpdate records before an authorization pause',async()=>{
 const session={id:'scope-account',generation:1,client:{},abort:new AbortController()},updates=[],calls=[];
 const plan={batchId:'scope-batch',planHash:'scope-hash',accountId:session.id,module:'fixture',actions:[{actionId:'operation-1'}]};
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule:async(...args)=>{calls.push(['survey',args]);return {}},plan:async(...args)=>{calls.push(['plan',args]);return plan},history:()=>({runs:[]})},claim:()=>true,onUpdate:async state=>{updates.push(state)}});
 const result=await runner.start(session.id,graph());assert.equal(result.status,'AWAITING_AUTHORIZATION');
 const runId=result.runId;assert.deepEqual(calls[0][1][3],{workflowId:runId});assert.deepEqual(calls[1][1][2],{workflowId:runId});
 assert.equal(updates[0].status,'STARTING');assert.equal(updates.at(-1).status,'AWAITING_AUTHORIZATION');assert.equal(updates.at(-1).plan.batchId,'scope-batch');runner.stop();await runner.settle();
});
test('persistence failure stops before the next node and releases the claim',async()=>{
 const session={id:'persist-account',generation:1,client:{},abort:new AbortController()};let planned=0,released=0;
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule:async()=>({}),plan:async()=>{planned++;throw Error('must not plan')},history:()=>({runs:[]})},claim:()=>()=>{released++},onUpdate:state=>{if(state.trace.some(row=>row.type==='SURVEY'))throw Error('storage fixture failure')}});
 const result=await runner.start(session.id,graph());assert.equal(result.status,'FAILED');assert.equal(planned,0);assert.equal(released,1);
});
test('two ACTION nodes require separate concrete batches and independent confirmations',async()=>{
 const session={id:'two-actions',generation:1,client:{},abort:new AbortController()},runs=[];let count=0;
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule:async()=>({}),plan:async(_session,payload)=>({batchId:'batch-'+(++count),planHash:'hash-'+count,accountId:session.id,module:'fixture',actions:[{actionId:typeof payload.selections[0]==='string'?payload.selections[0]:payload.selections[0].actionId}]}),history:()=>({runs})}});
 const g=graph();g.nodes.splice(4,0,{id:'a2',type:'ACTION',module:'fixture',selection:'operation-2'},{id:'v2',type:'VERIFY',module:'fixture'});g.edges=g.edges.filter(edge=>edge.from!=='v');g.edges.push({from:'v',to:'a2'},{from:'a2',to:'v2'},{from:'v2',to:'z'});
 let status=await runner.start(session.id,g);assert.equal(status.plan.batchId,'batch-1');
 runs.push({runId:'r1',accountId:session.id,finalStatus:'SUCCESS',finishedAt:'done',planSummary:{batchId:'batch-1',planHash:'hash-1'},actions:[{actionId:'operation-1',result:'SUCCESS',verification:'CONFIRMED'}]});
 status=await runner.resume();assert.equal(status.status,'AWAITING_AUTHORIZATION');assert.equal(status.plan.batchId,'batch-2');assert.equal(count,2);
 assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');
 runs.push({runId:'r2',accountId:session.id,finalStatus:'SUCCESS',finishedAt:'done',planSummary:{batchId:'batch-2',planHash:'hash-2'},actions:[{actionId:'operation-2',result:'SUCCESS',verification:'CONFIRMED'}]});
 assert.equal((await runner.resume()).status,'COMPLETED');
});
test('concurrent resume checks cannot consume the same confirmation twice',async()=>{
 let releaseHistory;const gate=new Promise(resolve=>{releaseHistory=resolve});const f=fixture({history:async()=>{await gate;return {runs:[]}}});await f.runner.start(f.session.id,graph());const first=f.runner.resume();await assert.rejects(f.runner.resume(),{code:'WORKFLOW_BUSY'});releaseHistory();await first;f.runner.stop();await f.runner.settle();
});
test('VERIFY false condition never continues to an ACTION',async()=>{
 const f=fixture(),g=graph();g.nodes[3]={id:'v',type:'VERIFY',condition:{source:'run',path:['finalStatus'],operator:'EQ',value:'FAILED'}};
 await f.runner.start(f.session.id,g);f.runs.push(f.success());assert.equal((await f.runner.resume()).status,'UNKNOWN');
});
test('registered fleet and alliance templates contain ACTION plus VERIFY without runtime calls',()=>{
 const registry={fleet:moduleEntry('fleet'),alliance:moduleEntry('alliance')},examples=exampleWorkflows(registry);
 for(const id of ['fleet-repair-dispatch-template','alliance-help-template']){const example=examples.find(row=>row.id===id);assert.ok(example);assert.ok(example.workflow.nodes.some(node=>node.type==='ACTION'));assert.ok(example.workflow.nodes.some(node=>node.type==='VERIFY'));assert.equal(validateWorkflow(example.workflow,{modules:registry}).valid,true)}
 assert.equal(examples.some(row=>row.id==='formation-stage-template'),false);
});
