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
