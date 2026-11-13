import { compileUnifiedExecution } from '../src/loop.mjs';
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

const unifiedRegistry=Object.fromEntries(['task-rewards','free-recruit','free-gold','trial-challenge','pirate-sweep','fixture'].map(id=>[id,moduleEntry(id)]));
const unifiedBudget={resources:[],quotas:[],uids:[]};
test('legacy intent compilation is offline, finite, registered and preserves phase order and exact task identity',()=>{
 const result=compileUnifiedExecution({entry:'loop',tasks:[{kind:'branch',taskId:19}],dailies:[{taskId:1006}],world:[{module:'fixture',parameters:{targetId:'one'},selection:'one'}],rounds:2,everyMs:10,budget:unifiedBudget},{modules:unifiedRegistry});
 assert.equal(result.blocked.length,0);assert.equal(result.graph.nodes.filter(n=>n.type==='WAIT').length,1);
 assert.deepEqual(result.graph.nodes.filter(n=>n.type==='ACTION').map(n=>n.module),['task-rewards','free-gold','fixture','task-rewards','free-gold','fixture']);
 assert.deepEqual(result.graph.nodes[1].parameters,{kind:'branch',taskId:19});assert.deepEqual(result.graph.nodes[1].selection,{unique:true});
 assert.deepEqual(simulateWorkflow(result.graph,{modules:unifiedRegistry}).requestsSent,0);
 for(const change of [{rounds:0},{rounds:-1},{rounds:49},{everyMs:60001},{budget:undefined},{request:'InjectedRequest'},{world:[{module:'unknown'}]},{rounds:48,everyMs:1}])
  assert.throws(()=>compileUnifiedExecution({...{entry:'loop',dailies:[{taskId:1006}],budget:unifiedBudget},...change},{modules:unifiedRegistry}));
});
test('missing daily contracts and pirate identity block only the named intents',()=>{
 const result=compileUnifiedExecution({entry:'loop',tasks:[{kind:'orderDaily',taskId:1}],dailies:[{taskId:1001},{taskId:1010},{taskId:1002}],budget:unifiedBudget},{modules:unifiedRegistry});
 assert.equal(result.blocked.length,3);assert.deepEqual(result.graph.nodes.filter(n=>n.type==='ACTION').map(n=>n.module),['free-recruit']);
 assert.equal(compileUnifiedExecution({entry:'tasks',tasks:[{kind:'orderDaily',taskId:1}],budget:unifiedBudget},{modules:unifiedRegistry}).graph,null);
 assert.throws(()=>compileUnifiedExecution({entry:'tasks',dailies:[{taskId:1006}],budget:unifiedBudget},{modules:unifiedRegistry}));
 for(const selection of [{unique:false},{unique:true,actionId:'one'},{unique:1}]){const g=graph();g.nodes[2].selection=selection;assert.throws(()=>validateWorkflow(g,{modules}));}
});
function uniqueGraph(rounds=1){return compileUnifiedExecution({entry:'loop',world:[{module:'fixture'}],rounds,budget:unifiedBudget},{modules}).graph;}
test('unique selection freshly resolves every round and pauses for a new exact batch',async()=>{
 let serial=0;const runs=[],session={id:'A',generation:1,client:{},abort:new AbortController()},selected=[];
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule:async()=>({accountId:'A',module:'fixture',view:{candidates:[{actionId:'fresh-'+(++serial),executable:true}]}}),plan:async(_session,payload)=>{selected.push(payload.selections[0]);return {accountId:'A',module:'fixture',batchId:'b'+serial,planHash:'h'+serial,actions:[{actionId:payload.selections[0]}]};},history:()=>({runs})}});
 let state=await runner.start('A',uniqueGraph(2));assert.equal(state.plan.actions[0].actionId,'fresh-1');assert.equal(selected.length,1);
 assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');
 runs.push({accountId:'A',finalStatus:'SUCCESS',finishedAt:'done',planSummary:{batchId:'b1',planHash:'h1'},actions:[{actionId:'fresh-1',result:'SUCCESS',verification:'CONFIRMED'}]});
 state=await runner.resume();assert.equal(state.plan.actions[0].actionId,'fresh-2');assert.equal(state.plan.batchId,'b2');assert.deepEqual(selected,['fresh-1','fresh-2']);runner.stop();await runner.settle();
});
test('unique unavailable or remembered refusal nodes are traced without hiding subsequent independent work',async()=>{
 for(const remembered of [false,true]){
  let surveyed=0,planned=0;const session={id:'A',generation:1,client:{},abort:new AbortController()};
  const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule:async()=>({accountId:'A',module:'fixture',view:{candidates:++surveyed===1&&!remembered?[]:[{actionId:'operation-1',executable:true}]}}),plan:async()=>{if(++planned===1&&remembered)throw Object.assign(Error('refused'),{code:'REJECTION_MEMORY_ACTIVE'});return {accountId:'A',module:'fixture',batchId:'next',actions:[{actionId:'operation-1'}]};},history:()=>({runs:[]})}});
  const state=await runner.start('A',uniqueGraph(2));assert.equal(state.status,'AWAITING_AUTHORIZATION');assert.ok(state.trace.some(row=>row.result=== (remembered?'BLOCKED_REJECTION_MEMORY':'BLOCKED_NO_EXECUTABLE_CANDIDATE')));assert.equal(surveyed,2);runner.stop();await runner.settle();
 }
});
test('unique selection fails closed on ambiguous, foreign or malformed fresh observations and unresolved memory',async()=>{
 for(const observation of [{accountId:'B',module:'fixture',view:{candidates:[]}},{accountId:'A',module:'fixture',view:{candidates:[{actionId:'one',executable:true},{actionId:'two',executable:true}]}},{accountId:'A',module:'fixture',view:{}}]){
  let planned=0;const f=fixture({surveyModule:async()=>observation,plan:async()=>{planned++;}});
  assert.equal((await f.runner.start(f.session.id,uniqueGraph())).status,'UNKNOWN');assert.equal(planned,0);
 }
 for(const code of ['RECOVERY_UNCERTAIN','MEMORY_ORIGIN_UNRESOLVED','MEMORY_UNAVAILABLE']){
  let planned=0;const f=fixture({surveyModule:async()=>({accountId:'account-1',module:'fixture',view:{candidates:[{actionId:'one',executable:true}]}}),plan:async()=>{planned++;throw Object.assign(Error(code),{code});}});
  assert.equal((await f.runner.start(f.session.id,uniqueGraph(2))).status,'FAILED');assert.equal(planned,1);
 }
});
test('late unique survey after cancellation cannot create a plan',async()=>{
 let release,planned=0;const pending=new Promise(resolve=>release=resolve);
 const f=fixture({surveyModule:()=>pending,plan:async()=>{planned++;}}),starting=f.runner.start(f.session.id,uniqueGraph());
 await new Promise(resolve=>setImmediate(resolve));f.runner.stop();assert.equal((await starting).status,'CANCELLED');
 release({accountId:f.session.id,module:'fixture',view:{candidates:[{actionId:'one',executable:true}]}});await new Promise(resolve=>setImmediate(resolve));assert.equal(planned,0);
});

test('a skipped ACTION cannot reuse the prior batch confirmation in VERIFY',async()=>{
 let surveyed=0;const f=fixture({surveyModule:async()=>({accountId:'account-1',module:'fixture',view:{candidates:++surveyed===1?[{actionId:'operation-1',executable:true}]:[]}})});
 const g=uniqueGraph(2);g.nodes.splice(-1,0,{id:'verify',type:'VERIFY',module:'fixture'});const last=g.edges.at(-1);last.to='verify';g.edges.push({from:'verify',to:'stop'});
 const first=await f.runner.start(f.session.id,g);assert.equal(first.status,'AWAITING_AUTHORIZATION');f.runs.push(f.success());
 const result=await f.runner.resume();assert.equal(result.status,'UNKNOWN');assert.ok(result.trace.some(row=>row.result==='BLOCKED_NO_EXECUTABLE_CANDIDATE'));assert.equal(f.calls.filter(row=>row[0]==='plan').length,1);
});
test('empty or fully blocked intents still validate the entire budget and explicit limits',()=>{
 for(const change of [{rounds:null},{everyMs:null},{tasks:null},{budget:{request:'InjectedRequest'}}]){
  assert.throws(()=>compileUnifiedExecution({entry:'tasks',tasks:[],budget:unifiedBudget,...change},{modules:unifiedRegistry}));
 }
});


test('known workflow store disappearance cannot erase either account history',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-lost-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules});assert.deepEqual(store.list('A'),[]);assert.equal(fs.existsSync(file),false);
 store.save('A',graph());store.record('B',{runId:'prior',workflowId:'wf-1',status:'UNKNOWN'});const bytes=fs.readFileSync(file,'utf8');fs.unlinkSync(file);
 for(const act of [()=>store.list('A'),()=>store.history('B'),()=>store.save('A',graph()),()=>store.record('B',{runId:'new',workflowId:'wf-1',status:'COMPLETED'}),()=>store.remove('A','wf-1')])assert.throws(act,{code:'WORKFLOW_STORE_UNAVAILABLE'});
 assert.deepEqual(fs.readdirSync(dir),[]);fs.writeFileSync(file,bytes);assert.equal(store.history('B')[0].status,'UNKNOWN');assert.deepEqual(store.history('A'),[]);
});

for(const fault of ['fsync','rename','writer','missing'])test('workflow '+fault+' failure preserves evidence and removes only its own temporary file',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-fault-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const base=createWorkflowStore({file,modules});base.save('A',graph());base.record('B',{runId:'prior',workflowId:'wf-1',status:'UNKNOWN'});const bytes=fs.readFileSync(file,'utf8');let armed=false,owned=true;
 const io={...fs,fsyncSync(fd){if(armed&&fault==='fsync')throw Error('flush failure');fs.fsyncSync(fd);if(armed&&fault==='writer')owned=false;if(armed&&fault==='missing')fs.unlinkSync(file);},renameSync(...args){if(armed&&fault==='rename')throw Error('replace failure');return fs.renameSync(...args);}};
 const store=createWorkflowStore({file,modules,fileSystem:io,assertWriter(){if(!owned)throw Object.assign(Error('owner lost'),{code:'WRITER_LOST'});}});assert.equal(store.history('B')[0].status,'UNKNOWN');armed=true;
 assert.throws(()=>store.record('A',{runId:'new',workflowId:'wf-1',status:'COMPLETED'}),{code:fault==='writer'?'WRITER_LOST':'WORKFLOW_STORE_UNAVAILABLE'});
 assert.deepEqual(fs.readdirSync(dir),fault==='missing'?[]:['workflow.json']);if(fault!=='missing')assert.equal(fs.readFileSync(file,'utf8'),bytes);
 if(fault==='missing')assert.throws(()=>store.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});else assert.deepEqual(store.history('A'),[]);
});

for(const defect of ['version','status','trace','steps','duplicate','directory','symlink','size'])test('workflow rejects '+defect+' evidence and refuses overwrite',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-invalid-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules});store.save('A',graph());store.record('A',{runId:'prior',workflowId:'wf-1',status:'UNKNOWN'});const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(defect==='version')data.version=2;if(defect==='status')data.accounts.A.history[0].status='AUTO_RESUMED';if(defect==='trace')data.accounts.A.history[0].trace=[{nodeId:'a',type:'ACTION',result:'WAIT',blockedReasons:[3]}];if(defect==='steps')data.accounts.A.history[0].steps=-1;if(defect==='duplicate')data.accounts.A.history.push(data.accounts.A.history[0]);
 fs.writeFileSync(file,JSON.stringify(data));const bytes=fs.readFileSync(file,'utf8');
 const io={...fs,lstatSync(p){const stat=fs.lstatSync(p);if(defect==='directory')return {isFile:()=>false,isSymbolicLink:()=>false,size:0};if(defect==='symlink')return {isFile:()=>true,isSymbolicLink:()=>true,size:0};if(defect==='size')return {isFile:()=>true,isSymbolicLink:()=>false,size:8*1024*1024+1};return stat;}};
 const restored=createWorkflowStore({file,modules,fileSystem:io});assert.throws(()=>restored.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.throws(()=>restored.save('B',graph()),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json']);
});

test('oversized workflow write cannot replace a readable store',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-limit-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules});store.save('A',graph());const bytes=fs.readFileSync(file,'utf8');assert.throws(()=>store.record('A',{runId:'new',workflowId:'wf-1',status:'UNKNOWN',reason:'x'.repeat(8*1024*1024)}),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json']);
});

test('lost workflow evidence stops unified Loop before its next plan',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-stop-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules});store.save('A',graph());
 const session={id:'A',generation:1,client:{},abort:new AbortController()};let surveyed=0,planned=0,released=0;
 const runner=createWorkflowRunner({modules,getSession:()=>session,claim:()=>()=>{released++;},operations:{history:()=>({runs:[]}),surveyModule:async()=>{surveyed++;fs.unlinkSync(file);return {accountId:'A',module:'fixture',view:{candidates:[]}};},plan:async()=>{planned++;}},onUpdate:status=>store.record('A',status)});
 const result=await runner.start('A',uniqueGraph(2));assert.equal(result.status,'FAILED');assert.equal(planned,0);assert.equal(surveyed,1);assert.equal(released,1);assert.equal(fs.existsSync(file),false);
});

for(const change of ['session-connection','client-connection','client-account','client-generation','account','disconnected','abort-replaced'])test('workflow authorization pause is fenced after '+change+' changes on the same client',async()=>{
 const f=fixture();f.session.connectionId='first';f.session.client.connected=true;f.session.client.factContext={accountId:f.session.id,generation:1,connectionId:'first'};
 await f.runner.start(f.session.id,graph());f.runs.push(f.success());
 if(change==='session-connection')f.session.connectionId='second';
 if(change==='client-connection')f.session.client.factContext.connectionId='second';
 if(change==='client-account')f.session.client.factContext.accountId='other';
 if(change==='client-generation')f.session.client.factContext.generation=2;
 if(change==='account')f.session.id='other';
 if(change==='disconnected')f.session.client.connected=false;
 if(change==='abort-replaced')f.session.abort=new AbortController();
 assert.equal(f.runner.getLiveRunId(),null);
 const stopped=await f.runner.resume();assert.equal(stopped.status,'CANCELLED');assert.equal(stopped.plan,null);
 assert.equal(stopped.trace.some(row=>row.type==='VERIFY'),false);assert.equal(f.calls.filter(row=>row[0]==='plan').length,1);assert.equal(f.released(),1);
});

test('late unique survey from a replaced same-client connection cannot create a plan',async()=>{
 let resolveSurvey,planned=0;const pending=new Promise(resolve=>resolveSurvey=resolve);
 const f=fixture({surveyModule:()=>pending,plan:async()=>{planned++;}});f.session.connectionId='first';
 const starting=f.runner.start(f.session.id,uniqueGraph());await new Promise(resolve=>setImmediate(resolve));
 f.session.connectionId='second';resolveSurvey({accountId:f.session.id,module:'fixture',view:{candidates:[{actionId:'one',executable:true}]}});
 assert.equal((await starting).status,'CANCELLED');assert.equal(planned,0);assert.equal(f.released(),1);
});

test('connection replacement during History read cannot consume an old completed batch',async()=>{
 let resolveHistory;const pending=new Promise(resolve=>resolveHistory=resolve);const f=fixture({history:()=>pending});f.session.connectionId='first';
 await f.runner.start(f.session.id,graph());const resuming=f.runner.resume();await new Promise(resolve=>setImmediate(resolve));
 f.session.connectionId='second';resolveHistory({runs:[f.success()]});
 const state=await resuming;assert.equal(state.status,'CANCELLED');assert.equal(state.trace.some(row=>row.type==='VERIFY'),false);assert.equal(state.plan,null);assert.equal(f.released(),1);
});

for(const field of ['playerId','worldId'])test('workflow cannot consume old confirmation after same-connection '+field+' replacement',async()=>{
 const f=fixture();f.session.player={playerId:'9007199254740993',worldId:'9'};await f.runner.start(f.session.id,graph());f.runs.push(f.success());f.session.player[field]=field==='playerId'?'9007199254740994':'10';
 assert.equal(f.runner.getLiveRunId(),null);assert.equal((await f.runner.resume()).status,'CANCELLED');assert.equal(f.runner.getStatus().trace.some(row=>row.type==='VERIFY'),false);assert.equal(f.released(),1);
});

test('workflow role scope preserves exact int64 identity across equivalent Long and string representations',async()=>{
 const f=fixture();f.session.player={playerId:{low:1,high:2097152,unsigned:false},worldId:'9'};await f.runner.start(f.session.id,graph());f.session.player.playerId='9007199254740993';f.runs.push(f.success());assert.equal((await f.runner.resume()).status,'COMPLETED');assert.equal(f.released(),1);
});
test('unified Tasks/Loop preserve explicit daily reward ID through the original Registry path',()=>{
 for(const entry of['tasks','loop']){const result=compileUnifiedExecution({entry,tasks:[{kind:'daily',taskId:1001}],budget:unifiedBudget},{modules:unifiedRegistry});assert.equal(result.blocked.length,0);const action=result.graph.nodes.find(n=>n.type==='ACTION');assert.equal(action.module,'task-rewards');assert.deepEqual(action.parameters,{kind:'daily',taskId:1001});assert.deepEqual(action.selection,{unique:true});assert.equal(simulateWorkflow(result.graph,{modules:unifiedRegistry}).requestsSent,0);}
});
test('Dailies claim is an explicit original task-rewards Function intent, preserving perform drivers',()=>{
 for(const entry of['dailies','loop']){
  const result=compileUnifiedExecution({entry,dailies:[{taskId:1002},{taskId:1001,action:'claim'},{taskId:1006,action:'perform'}],budget:unifiedBudget},{modules:unifiedRegistry});
  assert.deepEqual(result.blocked,[]);const actions=result.graph.nodes.filter(n=>n.type==='ACTION');assert.deepEqual(actions.map(n=>n.module),['free-recruit','task-rewards','free-gold']);assert.deepEqual(actions[1].parameters,{kind:'daily',taskId:1001});assert.deepEqual(actions[1].selection,{unique:true});assert.equal(simulateWorkflow(result.graph,{modules:unifiedRegistry}).requestsSent,0);
 }
 const only=compileUnifiedExecution({entry:'dailies',dailies:[{taskId:1001,action:'claim',parameters:{}}],budget:unifiedBudget},{modules:unifiedRegistry});assert.equal(only.graph.nodes[1].module,'task-rewards');
 for(const row of[{taskId:1001,action:'auto'},{taskId:1001,action:null},{taskId:1001,action:'claim',parameters:{request:'InjectedRequest'}},{taskId:1001,action:'claim',parameters:{uid:1}},{taskId:1001,action:'claim',parameters:null},{taskId:1001,action:'claim',parameters:[]}]){
  assert.throws(()=>compileUnifiedExecution({entry:'dailies',dailies:[row],budget:unifiedBudget},{modules:unifiedRegistry}),{code:'WORKFLOW_INVALID'});
 }
});


test('Tasks Dailies and Loop compile explicit daily activity tiers through the same Function offline',()=>{
 for(const entry of['tasks','dailies','loop']){
  const row=entry==='tasks'?{kind:'daily-activity',tierId:2}:{kind:'daily-activity',tierId:2,action:'claim'};
  const phase=entry==='tasks'?'tasks':'dailies',result=compileUnifiedExecution({entry,[phase]:[row],budget:unifiedBudget},{modules:unifiedRegistry});
  assert.deepEqual(result.blocked,[]);const action=result.graph.nodes.find(n=>n.type==='ACTION');assert.equal(action.module,'task-rewards');assert.deepEqual(action.parameters,{kind:'daily-activity',tierId:2});assert.deepEqual(action.selection,{unique:true});assert.equal(simulateWorkflow(result.graph,{modules:unifiedRegistry}).requestsSent,0);
 }
 const mixed=compileUnifiedExecution({entry:'loop',tasks:[{kind:'main',taskId:1}],dailies:[{kind:'daily-activity',tierId:2,action:'claim'},{taskId:1006},{taskId:1001}],budget:unifiedBudget},{modules:unifiedRegistry});
 assert.deepEqual(mixed.graph.nodes.filter(n=>n.type==='ACTION').map(n=>n.module),['task-rewards','task-rewards','free-gold']);assert.deepEqual(mixed.blocked,[{phase:'dailies',index:2,reason:'DAILY_ACTION_CONTRACT_UNVERIFIED',taskId:1001}]);
});

test('daily activity entry refuses implicit claims, mixed identities and arbitrary driver parameters',()=>{
 for(const phase of['tasks','dailies']){
  const base={kind:'daily-activity',tierId:2,...(phase==='dailies'?{action:'claim'}:{})};
  const rows=[{...base,tierId:0},{...base,tierId:'2'},{...base,tierId:2147483648},{...base,tierId:null},{...base,taskId:1001},{...base,index:[2]},{...base,kind:'weekly-activity'}];
  if(phase==='dailies')rows.push({kind:'daily-activity',tierId:2},{...base,action:'perform'},{...base,action:null},{...base,parameters:{uid:1}},{...base,parameters:{request:'DrawDailyRewardRequest'}},{...base,parameters:null},{...base,parameters:[]});
  else rows.push({...base,action:'claim'},{...base,parameters:{}});
  for(const row of rows)assert.throws(()=>compileUnifiedExecution({entry:phase,[phase]:[row],budget:unifiedBudget},{modules:unifiedRegistry}),{code:'WORKFLOW_INVALID'},JSON.stringify(row));
 }
});


test('free gift unified intents are explicit, offline, and reject paid or mixed task identities',()=>{
 for(const entry of['tasks','dailies','loop']){
  const phase=entry==='tasks'?'tasks':'dailies',row={kind:'daily-gift',packId:'赠礼',...(phase==='dailies'?{action:'claim'}:{})};
  const r=compileUnifiedExecution({entry,[phase]:[row],budget:unifiedBudget},{modules:unifiedRegistry});assert.deepEqual(r.blocked,[]);assert.deepEqual(r.graph.nodes[1].parameters,{kind:'daily-gift',packId:'赠礼'});assert.equal(simulateWorkflow(r.graph,{modules:unifiedRegistry}).requestsSent,0);
  for(const bad of[{...row,packId:'礼包1'},{...row,packId:'合并礼包'},{...row,taskId:1001},{...row,tierId:1},{...row,parameters:{request:'GotFreeDailyPackRequest'}},...(phase==='dailies'?[{kind:'daily-gift',packId:'赠礼'},{...row,action:'perform'}]:[])])assert.throws(()=>compileUnifiedExecution({entry,[phase]:[bad],budget:unifiedBudget},{modules:unifiedRegistry}),{code:'WORKFLOW_INVALID'});
 }
});


test('unified preparation persists exact excluded intents and entry without creating executable nodes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-unified-audit-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const input={entry:'loop',id:'owner-selected-id',tasks:[{kind:'orderDaily',taskId:6}],dailies:[{taskId:1001},{taskId:1010},{taskId:1006}],budget:unifiedBudget};
 const result=compileUnifiedExecution(input,{modules:unifiedRegistry}),expected={entry:'loop',blocked:result.blocked};
 assert.deepEqual(result.graph.preparation,expected);assert.equal(result.blocked.length,3);
 assert.deepEqual(result.graph.nodes.filter(n=>n.type==='ACTION').map(n=>n.module),['free-gold']);
 const store=createWorkflowStore({file,modules:unifiedRegistry});store.save('A',result.graph);
 const bytes=fs.readFileSync(file,'utf8'),restarted=createWorkflowStore({file,modules:unifiedRegistry});
 assert.deepEqual(restarted.list('A')[0].preparation,expected);assert.deepEqual(restarted.list('B'),[]);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 result.blocked[0].taskId=99;assert.equal(result.graph.preparation.blocked[0].taskId,6);
 assert.equal(Object.hasOwn(validateWorkflow(graph(),{modules}).workflow,'preparation'),false);
});
test('unified audit metadata rejects malformed policies, credentials, duplicate or ambiguous blockers',()=>{
 const base={entry:'loop',blocked:[{phase:'dailies',index:0,reason:'EXACT_PIRATE_TARGET_REQUIRED',taskId:1010}]};
 const variants=[null,{}, {...base,entry:'scheduler'},{...base,policy:{kind:'GAME_DAY'}},{...base,token:'fake'},
  {...base,blocked:[...base.blocked,...base.blocked]}, {...base,blocked:[{...base.blocked[0],index:48}]},
  {...base,blocked:[{...base.blocked[0],index:-1}]},{...base,blocked:[{...base.blocked[0],taskId:1006}]},
  {...base,blocked:[{...base.blocked[0],reason:'ALLOW_RETRY'}]},{...base,blocked:[{...base.blocked[0],request:'InjectedRequest'}]},
  {...base,blocked:[{...base.blocked[0],phase:'world'}]},{...base,entry:'tasks'}, {...base,blocked:new Array(1)},
  {...base,blocked:[{...base.blocked[0],taskId:undefined}]},{...base,blocked:Array.from({length:97},()=>base.blocked[0])}];
 for(const preparation of variants)assert.throws(()=>validateWorkflow({...graph(),preparation},{modules}),{code:'WORKFLOW_INVALID'});
 const prepared={...graph(),preparation:base};prepared.nodes[2].module='unregistered';assert.throws(()=>validateWorkflow(prepared,{modules}));
});
test('original declaration blockers survive completion but never authorize or mask UNKNOWN',async t=>{
 const preparation={entry:'loop',blocked:[{phase:'tasks',index:0,reason:'DAILY_ORDER_CONTRACT_UNVERIFIED',taskId:6}]};
 for(const outcome of ['SUCCESS','UNKNOWN']){
  const f=fixture(),g={...graph(),preparation:structuredClone(preparation)};t.after(async()=>{f.runner.stop();await f.runner.settle();});
  const pending=await f.runner.start(f.session.id,g);assert.deepEqual(pending.preparation,preparation);assert.equal(pending.status,'AWAITING_AUTHORIZATION');
  g.preparation.blocked=[];f.runs.push(f.success({finalStatus:outcome}));const result=await f.runner.resume();
  assert.equal(result.status,outcome==='SUCCESS'?'COMPLETED':'UNKNOWN');assert.deepEqual(result.preparation,preparation);
  if(outcome==='SUCCESS')assert.match(result.reason,/未纳入/);assert.equal(f.calls.filter(c=>c[0]==='plan').length,1);
 }
});
test('invalid persisted preparation fails closed without replacing existing Workflow evidence',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-unified-corrupt-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules}),preparation={entry:'tasks',blocked:[{phase:'tasks',index:0,reason:'DAILY_ORDER_CONTRACT_UNVERIFIED',taskId:6}]};
 store.record('A',{runId:'original',workflowId:'wf-1',status:'UNKNOWN',preparation});
 assert.deepEqual(store.history('A')[0].preparation,preparation);
 const original=fs.readFileSync(file,'utf8');assert.throws(()=>store.record('A',{runId:'bad',workflowId:'wf-1',status:'UNKNOWN',preparation:{...preparation,policy:'retry'}}));assert.equal(fs.readFileSync(file,'utf8'),original);
 const raw=JSON.parse(original);raw.accounts.A.history[0].preparation.blocked[0].reason='ALLOW_RETRY';fs.writeFileSync(file,JSON.stringify(raw));const damaged=fs.readFileSync(file,'utf8');
 const restarted=createWorkflowStore({file,modules});assert.throws(()=>restarted.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),damaged);
});

test('WAIT start is persisted before its timer and restart never continues the pending interval',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-wait-start-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules});let release,entered;const pending=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const session={id:'A',generation:1,client:{connected:true},abort:new AbortController()};let planned=0;
 const g=readOnly(0);g.nodes.splice(-1,0,{id:'write',type:'ACTION',module:'fixture',selection:'one'});g.edges[1].to='write';g.edges.push({from:'write',to:'z'});
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule(){throw Error('No survey while WAIT persists');},plan(){planned++;throw Error('No plan before wait ends');},history:()=>({runs:[]})},onUpdate:async state=>{store.record('A',state);if(state.trace.at(-1)?.result==='WAIT_STARTED'&&state.status==='WAITING'){entered();await pending;}}});
 t.after(async()=>{release();runner.stop();await runner.settle();});const running=runner.start('A',g);await started;
 assert.equal(runner.getStatus().status,'WAITING');await new Promise(resolve=>setImmediate(resolve));assert.equal(planned,0);
 const bytes=fs.readFileSync(file,'utf8'),restarted=createWorkflowStore({file,modules}),saved=restarted.history('A')[0];
 assert.equal(saved.status,'RECOVERED_STOPPED');assert.equal(saved.resumable,false);assert.equal(saved.trace.at(-1).result,'WAIT_STARTED');assert.equal(saved.trace.at(-1).durationMs,0);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 runner.stop();release();const end=await running;assert.equal(end.status,'CANCELLED');assert.equal(planned,0);assert.equal(end.trace.some(row=>row.result==='WAITED'),false);
});
test('WAIT persistence failure prevents its timer and every subsequent business plan',async()=>{
 const session={id:'A',generation:1,client:{connected:true},abort:new AbortController()};let planned=0;
 const g=readOnly(0);g.nodes.splice(-1,0,{id:'write',type:'ACTION',module:'fixture',selection:'one'});g.edges[1].to='write';g.edges.push({from:'write',to:'z'});
 const states=[],runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule(){},plan(){planned++;throw Error('must not plan');},history:()=>({runs:[]})},onUpdate:state=>{states.push(state);if(state.trace.at(-1)?.result==='WAIT_STARTED')throw Object.assign(Error('synthetic disk failure'),{code:'WORKFLOW_STORE_UNAVAILABLE'});}});
 const end=await runner.start('A',g);assert.equal(end.status,'FAILED');assert.equal(planned,0);assert.equal(end.trace.some(row=>row.result==='WAITED'),false);assert.ok(states.some(s=>s.status==='WAITING'));await runner.settle();
});
test('completed waits persist exact bounded duration separately from any game clock or expiry policy',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-wait-ended-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules}),session={id:'A',generation:1,client:{connected:true},abort:new AbortController()};
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule(){throw Error('no reads');},plan(){throw Error('no writes');},history:()=>({runs:[]})},onUpdate:state=>store.record('A',state)});
 assert.equal((await runner.start('A',readOnly(0))).status,'COMPLETED');
 const saved=store.history('A')[0],waits=saved.trace.filter(row=>row.type==='WAIT');assert.deepEqual(waits.map(row=>[row.result,row.durationMs]),[['WAIT_STARTED',0],['WAITED',0]]);
 assert.equal(saved.runBudget,undefined);assert.equal(saved.resumable,false);
 const legacy={runId:'legacy-wait',workflowId:'readonly',status:'STOPPED',trace:[{nodeId:'w',type:'WAIT',result:'WAITED'}]};store.record('A',legacy);assert.equal(Object.hasOwn(store.history('A',{runId:legacy.runId})[0].trace[0],'durationMs'),false);
});
test('WAIT duration audit rejects non-WAIT, unsupported results and invalid durations without replacing the store',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-wait-invalid-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules}),base={nodeId:'w',type:'WAIT',result:'WAIT_STARTED',durationMs:60000};
 store.record('A',{runId:'known',workflowId:'wf',status:'WAITING',trace:[base]});const bytes=fs.readFileSync(file,'utf8');
 for(const change of[{durationMs:-1},{durationMs:60001},{durationMs:0.5},{durationMs:null},{durationMs:'1000'},{type:'ACTION'},{result:'RESUME_ALLOWED'}]){
  assert.throws(()=>store.record('A',{runId:'invalid',workflowId:'wf',status:'WAITING',trace:[{...base,...change}]}));assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }
});

const boundedGraph=(g=graph(),policy={})=>({...g,budget:{resources:[],quotas:[],uids:[]},runPolicy:{maxDurationMs:10000,maxActions:1,modules:['fixture'],...policy}});
test('run boundaries require explicit budget, finite limits and precise module coverage, while legacy graphs remain valid',()=>{
 assert.equal(validateWorkflow(boundedGraph(),{modules}).valid,true);assert.equal(Object.hasOwn(validateWorkflow(graph(),{modules}).workflow,'runPolicy'),false);
 for(const change of [g=>delete g.budget,g=>g.runPolicy=null,g=>g.runPolicy.extra=true,g=>g.runPolicy.maxDurationMs=0,g=>g.runPolicy.maxDurationMs=86400001,g=>g.runPolicy.maxDurationMs='10',g=>g.runPolicy.maxActions=-1,g=>g.runPolicy.maxActions=201,g=>g.runPolicy.maxActions=0.5,g=>g.runPolicy.modules=[],g=>g.runPolicy.modules=['fixture','fixture'],g=>g.runPolicy.modules=[' fixture']]){
  const g=boundedGraph();change(g);assert.throws(()=>validateWorkflow(g,{modules}),{code:'WORKFLOW_INVALID'});
 }
 assert.equal(validateWorkflow(boundedGraph(readOnly(),{modules:[],maxActions:0}),{modules}).valid,true);
});
test('zero action-plan cap never asks the service to plan or authorize',async()=>{
 const f=fixture(),status=await f.runner.start(f.session.id,boundedGraph(graph(),{maxActions:0}));assert.equal(status.status,'STOPPED');assert.equal(status.actionPlans,0);assert.equal(f.calls.some(c=>c[0]==='plan'),false);assert.equal(f.released(),1);
});
test('action-plan cap is cumulative across explicit batch confirmations',async()=>{
 const f=fixture(),g=boundedGraph();g.nodes.splice(4,0,{id:'a2',type:'ACTION',module:'fixture',selection:'operation-2'});g.edges=g.edges.filter(e=>e.from!=='v');g.edges.push({from:'v',to:'a2'},{from:'a2',to:'z'});
 const first=await f.runner.start(f.session.id,g);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(first.actionPlans,1);f.runs.push(f.success());const result=await f.runner.resume();assert.equal(result.status,'STOPPED');assert.equal(result.actionPlans,1);assert.equal(f.calls.filter(c=>c[0]==='plan').length,1);assert.equal(f.released(),1);
});
test('authorization pause expires without resume and closes the existing parent before release',async()=>{
 let closed=0;const f=fixture({closeWorkflowBudget(){closed++;}}),first=await f.runner.start(f.session.id,boundedGraph(graph(),{maxDurationMs:80}));assert.equal(first.status,'AWAITING_AUTHORIZATION');await new Promise(resolve=>setTimeout(resolve,120));const result=await f.runner.settle();assert.equal(result.status,'STOPPED');assert.equal(result.plan,null);assert.equal(closed,1);assert.equal(f.released(),1);await assert.rejects(f.runner.resume());assert.equal(f.calls.filter(c=>c[0]==='plan').length,1);
});
test('WAIT deadline cancels remaining nodes and clears the wait timer',async()=>{
 const f=fixture(),result=await f.runner.start(f.session.id,boundedGraph(readOnly(60000),{maxDurationMs:25,modules:[],maxActions:0}));assert.equal(result.status,'STOPPED');assert.ok(result.trace.some(r=>r.result==='WAIT_STARTED'));assert.equal(result.trace.some(r=>r.result==='WAITED'||r.result==='STOP'),false);assert.equal(f.released(),1);
});
test('expired pending plan and its late result cannot revive the run or leak its timer into a replacement',async()=>{
 let resolvePlan,entered;const pending=new Promise(r=>resolvePlan=r),planning=new Promise(r=>entered=r);const f=fixture({plan(){entered();return pending;}}),starting=f.runner.start(f.session.id,boundedGraph(graph(),{maxDurationMs:40}));await planning;assert.equal((await starting).status,'STOPPED');assert.equal(f.released(),1);resolvePlan(f.plan);await new Promise(r=>setImmediate(r));assert.equal(f.runner.getStatus().plan,null);assert.equal((await f.runner.start(f.session.id,readOnly())).status,'COMPLETED');assert.equal(f.released(),2);
});
test('startup claim time counts towards the same deadline and late ownership is released',async()=>{
 const session={id:'A',generation:1,client:{},abort:new AbortController()};let releaseClaim,entered,released=0,planned=0;const claimGate=new Promise(r=>releaseClaim=r),claimed=new Promise(r=>entered=r);const runner=createWorkflowRunner({modules,getSession:()=>session,claim:async()=>{entered();await claimGate;return()=>released++;},operations:{surveyModule(){planned++;},plan(){planned++;},history(){return{runs:[]};}}});
 const starting=runner.start('A',boundedGraph(readOnly(),{modules:[],maxDurationMs:20,maxActions:0}));const rejected=assert.rejects(starting,{code:'WORKFLOW_LIMIT'});await claimed;await new Promise(r=>setTimeout(r,40));releaseClaim();await rejected;assert.equal(runner.getStatus().status,'STOPPED');assert.equal(planned,0);assert.equal(released,1);
});
test('clock deadline during resume rejects even a successful exact batch without a later node',async()=>{
 let time=1000;const session={id:'A',generation:1,client:{},abort:new AbortController()},runs=[];let planned=0,released=0;
 const runner=createWorkflowRunner({modules,clock:()=>time,getSession:()=>session,claim:()=>()=>released++,operations:{surveyModule:()=>({}),plan:()=>{planned++;return{accountId:'A',module:'fixture',batchId:'b',planHash:'h',actions:[{actionId:'operation-1'}]};},history:()=>({runs})}});
 const first=await runner.start('A',boundedGraph());runs.push({accountId:'A',runId:'r',finishedAt:'done',finalStatus:'SUCCESS',planSummary:{batchId:'b',planHash:'h'},actions:[{actionId:'operation-1',result:'SUCCESS',verification:'CONFIRMED'}]});time=Date.parse(first.expiresAt);const result=await runner.resume();assert.equal(result.status,'STOPPED');assert.equal(result.trace.some(r=>r.type==='VERIFY'),false);assert.equal(planned,1);assert.equal(released,1);
});
test('action count must be durably recorded before plan creation',async()=>{
 const session={id:'A',generation:1,client:{},abort:new AbortController()};let planned=0,released=0;const runner=createWorkflowRunner({modules,getSession:()=>session,claim:()=>()=>released++,operations:{surveyModule:()=>({}),plan:()=>{planned++;},history:()=>({runs:[]})},onUpdate:state=>{if(state.actionPlans===1)throw Error('synthetic write failure');}});
 assert.equal((await runner.start('A',boundedGraph())).status,'FAILED');assert.equal(planned,0);assert.equal(released,1);
});
test('bounded UNKNOWN stays terminal, and boundaries persist across restart without restoring execution',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-bounded-workflow-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules}),g=boundedGraph(),f=fixture();store.save(f.session.id,g);const first=await f.runner.start(f.session.id,g);store.record(f.session.id,first);const restarted=createWorkflowStore({file,modules});assert.deepEqual(restarted.list(f.session.id)[0].runPolicy,g.runPolicy);const recovered=restarted.history(f.session.id)[0];assert.equal(recovered.status,'RECOVERED_STOPPED');assert.equal(recovered.expiresAt,first.expiresAt);assert.equal(recovered.actionPlans,1);assert.equal(recovered.resumable,false);assert.deepEqual(restarted.history('B'),[]);
 f.runs.push(f.success({finalStatus:'UNKNOWN'}));const unknown=await f.runner.resume();assert.equal(unknown.status,'UNKNOWN');store.record(f.session.id,unknown);assert.equal(restarted.history(f.session.id)[0].status,'UNKNOWN');await assert.rejects(f.runner.resume());assert.equal(f.calls.filter(c=>c[0]==='plan').length,1);
 const bytes=fs.readFileSync(file,'utf8');for(const change of [{actionPlans:2},{actionPlans:-1},{expiresAt:'invalid'},{runPolicy:{...g.runPolicy,allowRetry:true}}]){assert.throws(()=>store.record(f.session.id,{...unknown,...change}));assert.equal(fs.readFileSync(file,'utf8'),bytes);}
});
for(const mutate of [s=>s.generation++,s=>s.client={},s=>s.player={playerId:'replacement'},s=>s.connectionId='new'])test('bounded run still rejects changed account execution identity '+String(mutate),async()=>{
 const f=fixture();await f.runner.start(f.session.id,boundedGraph());f.runs.push(f.success());mutate(f.session);assert.equal((await f.runner.resume()).status,'CANCELLED');assert.equal(f.calls.filter(c=>c[0]==='plan').length,1);assert.equal(f.released(),1);
});

const unifiedBoundedIntent=entry=>({entry,budget:structuredClone(unifiedBudget),runPolicy:{maxDurationMs:10000,maxActions:1,modules:entry==='tasks'?['task-rewards']:entry==='dailies'?['free-recruit','free-gold']:['fixture']},...(entry==='tasks'?{tasks:[{kind:'main',taskId:1},{kind:'branch',taskId:2}]}:entry==='dailies'?{dailies:[{taskId:1002},{taskId:1006}]}:{world:[{module:'fixture'}],rounds:2})});
for(const entry of ['tasks','dailies','loop'])test(entry+' compiles the same explicit run policy without changing steps, budgets, or the legacy missing-policy contract',()=>{
 const input=unifiedBoundedIntent(entry),before=structuredClone(input),result=compileUnifiedExecution(input,{modules:unifiedRegistry});assert.deepEqual(input,before);assert.deepEqual(result.graph.runPolicy,input.runPolicy);assert.deepEqual(result.graph.budget,input.budget);assert.deepEqual(result.graph.preparation,{entry,blocked:[]});const legacy=structuredClone(input);delete legacy.runPolicy;const old=compileUnifiedExecution(legacy,{modules:unifiedRegistry});assert.deepEqual(result.graph.nodes,old.graph.nodes);assert.deepEqual(result.graph.edges,old.graph.edges);assert.equal(Object.hasOwn(old.graph,'runPolicy'),false);input.runPolicy.modules.push('formation');assert.deepEqual(result.graph.runPolicy,before.runPolicy);
 for(const bad of [null,{...before.runPolicy,maxDurationMs:0},{...before.runPolicy,maxActions:201},{...before.runPolicy,modules:[]},{...before.runPolicy,allowRetry:true},{...before.runPolicy,modules:['unknown']}])assert.throws(()=>compileUnifiedExecution({...before,runPolicy:bad},{modules:unifiedRegistry}),{code:'WORKFLOW_INVALID'});
});
for(const entry of ['tasks','dailies','loop'])test(entry+' shares the original Runner action cap across independent authorization pauses',async()=>{
 const input=unifiedBoundedIntent(entry),g=compileUnifiedExecution(input,{modules:unifiedRegistry}).graph,session={id:'A',generation:1,client:{},abort:new AbortController()},runs=[];let planned=0,released=0;
 const runner=createWorkflowRunner({modules:unifiedRegistry,getSession:()=>session,claim:()=>()=>released++,operations:{surveyModule:(_s,module)=>({accountId:'A',module,view:{candidates:[{actionId:'exact-'+module,executable:true}]}}),plan:(_s,payload)=>{planned++;return{accountId:'A',module:payload.module,batchId:'batch-'+planned,planHash:'hash-'+planned,actions:[{actionId:payload.selections[0]}]};},history:()=>({runs}),authorize(){assert.fail('compiler and Runner cannot authorize');},execute(){assert.fail('compiler and Runner cannot execute');}}});
 const first=await runner.start('A',g);assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(first.actionPlans,1);assert.deepEqual(first.runPolicy,input.runPolicy);assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');runs.push({runId:'confirmed',accountId:'A',finalStatus:'SUCCESS',finishedAt:'done',planSummary:{batchId:first.plan.batchId,planHash:first.plan.planHash},actions:[{actionId:first.plan.actions[0].actionId,result:'SUCCESS',verification:'CONFIRMED'}]});assert.equal((await runner.resume()).status,'STOPPED');assert.equal(planned,1);assert.equal(released,1);
});
test('bounded unified intent keeps specific evidence blockers and no-operation results instead of filling them with automatic actions',()=>{
 const input={entry:'loop',tasks:[{kind:'orderDaily',taskId:1}],dailies:[{taskId:1001},{taskId:1006}],budget:unifiedBudget,runPolicy:{maxDurationMs:1000,maxActions:1,modules:['free-gold']}},result=compileUnifiedExecution(input,{modules:unifiedRegistry});assert.equal(result.blocked.length,2);assert.deepEqual(result.graph.preparation.blocked,result.blocked);assert.deepEqual(result.graph.runPolicy,input.runPolicy);assert.equal(result.graph.nodes.filter(n=>n.type==='ACTION').length,1);
 const none=compileUnifiedExecution({...input,dailies:[{taskId:1001}]},{modules:unifiedRegistry});assert.equal(none.graph,null);assert.equal(none.blocked.length,2);
});

const repeatingGraph=(g=graph(),policy={})=>boundedGraph(g,{maxActions:3,maxRounds:3,roundIntervalMs:0,...policy});
test('finite outer repetition is an explicit run contract and keeps the original graph acyclic',()=>{
 const g=repeatingGraph();assert.deepEqual(validateWorkflow(g,{modules}).workflow.runPolicy,g.runPolicy);assert.equal(g.nodes.length,graph().nodes.length);assert.deepEqual(g.edges,graph().edges);
 for(const change of [p=>p.maxRounds=0,p=>p.maxRounds=201,p=>p.maxRounds='2',p=>p.maxRounds=1.5,p=>p.roundIntervalMs=-1,p=>p.roundIntervalMs=60001,p=>p.roundIntervalMs='0',p=>delete p.maxRounds]){const bad=structuredClone(g);change(bad.runPolicy);assert.throws(()=>validateWorkflow(bad,{modules}));}
 const cyclic=repeatingGraph();cyclic.edges[cyclic.edges.length-1].to='a';assert.throws(()=>validateWorkflow(cyclic,{modules}));assert.equal(Object.hasOwn(validateWorkflow(boundedGraph(),{modules}).workflow.runPolicy,'maxRounds'),false);
});

test('manual repeated rounds use fresh surveys and distinct plans while sharing action count and the original claim',async()=>{
 let planned=0;const bound=[];const f=fixture({bindWorkflowNode:(_s,_id,node)=>bound.push(node),plan:()=>({...f.plan,batchId:'round-batch-'+(++planned),planHash:'round-hash-'+planned})});let pending=await f.runner.start(f.session.id,repeatingGraph());
 for(let round=1;round<=3;round++){assert.equal(pending.status,'AWAITING_AUTHORIZATION');assert.equal(pending.round,round);assert.equal(pending.completedRounds,round-1);assert.equal(pending.actionPlans,round);assert.equal(f.released(),0);if(round>1){const noResult=await f.runner.resume();assert.equal(noResult.status,'AWAITING_AUTHORIZATION');assert.equal(noResult.round,round);}
 f.runs.push(f.success({runId:'child-'+round,authorizationSummary:{batchId:pending.plan.batchId},planSummary:{batchId:pending.plan.batchId,planHash:pending.plan.planHash}}));pending=await f.runner.resume();}
 assert.equal(pending.status,'COMPLETED');assert.equal(pending.round,3);assert.equal(pending.completedRounds,3);assert.equal(planned,3);assert.deepEqual(bound.map(row=>row.round),[1,2,3]);assert.equal(f.calls.filter(row=>row[0]==='survey').length,3);assert.equal(f.calls.filter(row=>row[0]==='claim').length,1);assert.equal(f.released(),1);assert.deepEqual(pending.trace.filter(row=>row.type==='STOP').map(row=>row.round),[1,2,3]);
});

for(const unknown of [false,true])test('outer repetition does not reset its action cap or repeat UNKNOWN '+unknown,async()=>{
 let planned=0;const f=fixture({plan:()=>({...f.plan,batchId:'unique-'+(++planned),planHash:'h-'+planned})});const first=await f.runner.start(f.session.id,repeatingGraph(graph(),{maxActions:1}));f.runs.push(f.success({finalStatus:unknown?'UNKNOWN':'SUCCESS',authorizationSummary:{batchId:first.plan.batchId},planSummary:{batchId:first.plan.batchId,planHash:first.plan.planHash}}));const result=await f.runner.resume();assert.equal(result.status,unknown?'UNKNOWN':'STOPPED');assert.equal(result.completedRounds,unknown?0:1);assert.equal(result.actionPlans,1);assert.equal(planned,1);assert.equal(f.released(),1);await assert.rejects(f.runner.resume());
});

test('stopping during an outer round interval cancels the timer and restart stays read-only',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-round-wait-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules}),session={id:'A',generation:1,client:{},abort:new AbortController()};let entered,released=0;const waiting=new Promise(r=>entered=r);
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule(){assert.fail('read-only graph');},plan(){assert.fail('read-only graph');},history:()=>({runs:[]})},claim:()=>()=>released++,onUpdate:state=>{store.record('A',state);if(state.trace.at(-1)?.result==='ROUND_WAIT_STARTED')entered();}});
 const running=runner.start('A',repeatingGraph(readOnly(),{maxActions:0,modules:[],roundIntervalMs:60000}));await waiting;const pending=runner.getStatus();assert.equal(pending.status,'WAITING');assert.equal(pending.round,1);assert.equal(pending.completedRounds,1);const bytes=fs.readFileSync(file,'utf8'),recovered=createWorkflowStore({file,modules}).history('A')[0];assert.equal(recovered.status,'RECOVERED_STOPPED');assert.equal(recovered.resumable,false);assert.equal(recovered.trace.at(-1).round,1);assert.equal(fs.readFileSync(file,'utf8'),bytes);runner.stop();assert.equal((await running).status,'CANCELLED');assert.equal(released,1);assert.equal(runner.getStatus().trace.filter(row=>row.type==='START').length,1);
});

test('the original overall deadline includes outer round intervals',async()=>{
 const f=fixture();const result=await f.runner.start(f.session.id,repeatingGraph(readOnly(),{maxDurationMs:50,maxActions:0,modules:[],roundIntervalMs:1000}));assert.equal(result.status,'STOPPED');assert.equal(result.completedRounds,1);assert.equal(result.round,1);assert.equal(result.trace.filter(row=>row.type==='START').length,1);assert.equal(f.released(),1);
});

test('failure persisting the next round prevents another survey or action',async()=>{
 const session={id:'A',generation:1,client:{},abort:new AbortController()};let released=0;const runner=createWorkflowRunner({modules,getSession:()=>session,claim:()=>()=>released++,operations:{surveyModule(){assert.fail('no next round work');},plan(){assert.fail('no next round work');},history:()=>({runs:[]})},onUpdate:state=>{if(state.round===2&&!state.finishedAt)throw Error('synthetic round persistence failure');}});const result=await runner.start('A',repeatingGraph(readOnly(),{maxActions:0,modules:[]}));assert.equal(result.status,'FAILED');assert.equal(result.completedRounds,1);assert.equal(result.trace.filter(row=>row.type==='START').length,1);assert.equal(released,1);
});

test('repetition retains the original cumulative step and trace limits in a persistable terminal snapshot',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-repeat-limit-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules}),session={id:'A',generation:1,client:{},abort:new AbortController()};const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule(){assert.fail('none');},plan(){assert.fail('none');},history:()=>({runs:[]})},onUpdate:state=>store.record('A',state)});const result=await runner.start('A',repeatingGraph(readOnly(),{maxRounds:200,maxActions:0,modules:[]}));assert.equal(result.status,'STOPPED');assert.ok(result.steps<=200);assert.equal(result.trace.length,200);assert.ok(result.completedRounds<200);assert.equal(store.history('A')[0].status,'STOPPED');
 const bytes=fs.readFileSync(file,'utf8');for(const change of [s=>s.round=201,s=>s.completedRounds=s.round+1,s=>delete s.round,s=>delete s.trace[0].round,s=>s.trace[0].round=201,s=>delete s.runPolicy.maxRounds]){const bad=structuredClone(result);change(bad);assert.throws(()=>store.record('A',bad));assert.equal(fs.readFileSync(file,'utf8'),bytes);}
});

test('one captured start timestamp defines the entire deadline even when successive clock reads advance',async()=>{
 let time=1000;const session={id:'A',generation:1,client:{},abort:new AbortController()},runner=createWorkflowRunner({modules,clock:()=>time++,getSession:()=>session,operations:{surveyModule(){},plan(){},history:()=>({runs:[]})}});const result=await runner.start('A',repeatingGraph(readOnly(),{maxActions:0,modules:[],maxRounds:1}));assert.equal(result.status,'COMPLETED');assert.equal(Date.parse(result.expiresAt)-Date.parse(result.startedAt),10000);
});

test('a repeated simulation exposes the whole fixed contract and one static DAG pass without runtime creation',()=>{
 const g=repeatingGraph(graph(),{maxRounds:3,roundIntervalMs:20}),simulation=simulateWorkflow(g,{modules});assert.deepEqual(simulation.runPolicy,g.runPolicy);assert.equal(simulation.traceCoverage,'ONE_STATIC_DAG_PASS');assert.equal(simulation.trace.length,g.nodes.length);assert.equal(simulation.requestsSent,0);assert.equal(simulation.runtimeCreated,false);assert.deepEqual(g.edges,graph().edges);
});

test('damaged repeated history cannot alter the declared interval or round order and retains original bytes',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-repeat-corrupt-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules}),run={accountId:'A',runId:'repeat-history',workflowId:'wf',status:'WAITING',runPolicy:{maxDurationMs:10000,maxActions:0,modules:[],maxRounds:3,roundIntervalMs:10},round:2,completedRounds:2,actionPlans:0,expiresAt:'2026-11-14T00:00:10Z',trace:[{nodeId:'s',type:'START',result:'START',round:1},{nodeId:'z',type:'STOP',result:'STOP',round:1},{nodeId:'s',type:'START',result:'START',round:2},{nodeId:'z',type:'STOP',result:'STOP',round:2},{nodeId:'z',type:'STOP',result:'ROUND_WAIT_STARTED',round:2,durationMs:10}]};store.record('A',run);const bytes=fs.readFileSync(file,'utf8');
 for(const change of [r=>r.trace.at(-1).durationMs=11,r=>r.trace.at(-1).result='ROUND_FAKE',r=>r.trace[1].round=2,r=>r.completedRounds=0,r=>r.trace.at(-1).round=3]){const bad=structuredClone(run);change(bad);assert.throws(()=>store.record('A',bad));assert.equal(fs.readFileSync(file,'utf8'),bytes);const raw=JSON.parse(bytes);raw.accounts.A.history[0]=bad;fs.writeFileSync(file,JSON.stringify(raw));const damaged=fs.readFileSync(file,'utf8'),restarted=createWorkflowStore({file,modules});assert.throws(()=>restarted.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.throws(()=>restarted.save('A',graph()));assert.equal(fs.readFileSync(file,'utf8'),damaged);fs.writeFileSync(file,bytes);}
});

for(const change of ['generation','connection'])test('identity change during a repeated round interval invalidates the original run '+change,async()=>{
 const session={id:'A',generation:1,connectionId:'one',client:{},abort:new AbortController()};let released=0;const runner=createWorkflowRunner({modules,getSession:()=>session,claim:()=>()=>released++,operations:{surveyModule(){assert.fail('none');},plan(){assert.fail('none');},history:()=>({runs:[]})},onUpdate:state=>{if(state.trace.at(-1)?.result==='ROUND_WAIT_STARTED'){if(change==='generation')session.generation++;else session.connectionId='two';}}});const result=await runner.start('A',repeatingGraph(readOnly(),{modules:[],maxActions:0,roundIntervalMs:1}));assert.equal(result.status,'CANCELLED');assert.equal(result.round,1);assert.equal(result.completedRounds,1);assert.equal(result.trace.filter(row=>row.type==='START').length,1);assert.equal(released,1);
});

test('a stopped second-round plan and its late reply cannot affect a replacement run',async()=>{
 let planned=0,entered,resolvePlan;const waiting=new Promise(r=>entered=r),late=new Promise(r=>resolvePlan=r),f=fixture({plan:()=>{planned++;if(planned===2){entered();return late;}return f.plan;}});const first=await f.runner.start(f.session.id,repeatingGraph());f.runs.push(f.success());const advancing=f.runner.resume();await waiting;assert.equal(f.runner.getStatus().round,2);f.runner.stop();assert.equal((await advancing).status,'CANCELLED');assert.equal(f.released(),1);assert.equal((await f.runner.start(f.session.id,readOnly())).status,'COMPLETED');resolvePlan({...f.plan,batchId:'late-second-round'});await new Promise(r=>setImmediate(r));assert.equal(f.runner.getStatus().workflowId,'readonly');assert.equal(f.runner.getStatus().plan,null);assert.equal(f.released(),2);
});

for(const entry of ['tasks','dailies','loop'])test(entry+' retains finite outer repetition in the original compiler without expanding or replacing its DAG',()=>{
 const intent=unifiedBoundedIntent(entry),before=compileUnifiedExecution(intent,{modules:unifiedRegistry});intent.runPolicy.maxRounds=3;intent.runPolicy.roundIntervalMs=20;const repeated=compileUnifiedExecution(intent,{modules:unifiedRegistry});assert.deepEqual(repeated.graph.nodes,before.graph.nodes);assert.deepEqual(repeated.graph.edges,before.graph.edges);assert.deepEqual(repeated.graph.budget,before.graph.budget);assert.deepEqual(repeated.graph.runPolicy,intent.runPolicy);assert.deepEqual(repeated.graph.preparation,before.graph.preparation);
});
