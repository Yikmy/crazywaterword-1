import { compileUnifiedExecution } from '../src/loop.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateWorkflow, workflowScheduledAt, simulateWorkflow, createWorkflowRunner, createWorkflowStore, exampleWorkflows, evaluateWorkflowCondition } from '../src/workflow.mjs';
const moduleEntry=id=>({id,survey(){throw Error('static validation must not invoke module')},view(){},plan(){},verify(){}});
const modules={fixture:moduleEntry('fixture'),formation:moduleEntry('formation'),stage:moduleEntry('stage')};
function graph(){return {version:1,id:'wf-1',name:'Fixture',nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'fixture'},{id:'a',type:'ACTION',module:'fixture',selection:{actionId:'operation-1'},parameters:{targetId:'exact'}},{id:'v',type:'VERIFY',module:'fixture'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'a'},{from:'a',to:'v'},{from:'v',to:'z'}]}}
function readOnly(wait=0){return {version:1,id:'readonly',name:'Readonly',nodes:[{id:'s',type:'START'},{id:'w',type:'WAIT',durationMs:wait},{id:'z',type:'STOP'}],edges:[{from:'s',to:'w'},{from:'w',to:'z'}]}}
function fixture(overrides={},options={}){
 const session={id:'account-1',generation:1,client:{},abort:new AbortController()},calls=[],runs=[];let released=0;
 const plan={accountId:session.id,module:'fixture',batchId:'batch-1',planHash:'hash-1',actions:[{actionId:'operation-1',costs:[]}],resourceBudget:[]};
 const operations={surveyModule:async(...args)=>{calls.push(['survey',...args]);return {available:true}},plan:async(...args)=>{calls.push(['plan',...args]);return structuredClone(plan)},history:async()=>({runs}),authorize(){throw Error('workflow must not authorize')},execute(){throw Error('workflow must not execute')},...overrides};
 const runner=createWorkflowRunner({operations,getSession:id=>id===session.id?session:null,modules,isCurrent:(value,generation,client)=>value===session&&session.generation===generation&&session.client===client,claim:()=>{calls.push(['claim']);return()=>{released++}},clock:options.clock??(()=>1000),onUpdate:options.onUpdate??(()=>{})});
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
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-')),file=path.join(dir,'workflow.json');try{const store=createWorkflowStore({file,modules});store.save('__proto__',graph());assert.equal(store.list('__proto__').length,1);assert.deepEqual(store.list('other'),[]);store.record('__proto__',{runId:'wf-run',workflowId:'wf-1',status:'AWAITING_AUTHORIZATION',plan:{permitId:'must-not-save'},trace:[{nodeId:'a',type:'ACTION',result:'WAIT',token:'must-not-save'}]});const bytes=fs.readFileSync(file,'utf8');assert.equal(bytes.includes('must-not-save'),false);const live=store.history('__proto__',{liveRunId:'wf-run'})[0];assert.equal(live.status,'AWAITING_AUTHORIZATION');assert.equal(live.resumable,false);assert.equal(live.recovered,undefined);assert.deepEqual(store.history('other',{liveRunId:'wf-run'}),[]);assert.equal(store.history('__proto__',{liveRunId:'another-run'})[0].status,'RECOVERED_STOPPED');const recovered=createWorkflowStore({file,modules}).history('__proto__')[0];assert.equal(recovered.status,'RECOVERED_STOPPED');assert.equal(recovered.resumable,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json','workflow.json.anchor'])}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('corrupt workflow evidence is preserved and save refuses overwrite',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-corrupt-')),file=path.join(dir,'workflow.json');try{fs.writeFileSync(file,'{corrupt fixture');const store=createWorkflowStore({file,modules});assert.throws(()=>store.save('a',graph()),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),'{corrupt fixture')}finally{fs.rmSync(dir,{recursive:true,force:true})}});
test('examples reference only registered modules and stage has independent authorization',()=>{const examples=exampleWorkflows(modules);assert.ok(examples.some(example=>example.id==='formation-stage-template'));for(const example of examples)assert.equal(validateWorkflow(example.workflow,{modules}).valid,true);assert.equal(exampleWorkflows({formation:modules.formation}).some(example=>example.id==='formation-stage-template'),false)});

test('workflow scope is internal and onUpdate records before an authorization pause',async()=>{
 const session={id:'scope-account',generation:1,client:{},abort:new AbortController()},updates=[],calls=[];
 const plan={batchId:'scope-batch',planHash:'scope-hash',accountId:session.id,module:'fixture',actions:[{actionId:'operation-1'}]};
 const runner=createWorkflowRunner({modules,getSession:()=>session,operations:{surveyModule:async(...args)=>{calls.push(['survey',args]);return {}},plan:async(...args)=>{calls.push(['plan',args]);return plan},history:()=>({runs:[]})},claim:()=>true,onUpdate:async state=>{updates.push(state)}});
 const result=await runner.start(session.id,graph());assert.equal(result.status,'AWAITING_AUTHORIZATION');
 const runId=result.runId,signal=calls[0][1][3].signal;assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);assert.notEqual(signal,session.abort.signal);assert.deepEqual(calls[0][1][3],{workflowId:runId,signal});assert.deepEqual(calls[1][1][2],{workflowId:runId,signal});
 assert.equal(updates[0].status,'STARTING');assert.equal(updates.at(-1).status,'AWAITING_AUTHORIZATION');assert.equal(updates.at(-1).plan.batchId,'scope-batch');runner.stop();await runner.settle();assert.equal(signal.aborted,true);assert.equal(session.abort.signal.aborted,false);
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
 assert.deepEqual(fs.readdirSync(dir),['workflow.json.anchor']);fs.writeFileSync(file,bytes);assert.equal(store.history('B')[0].status,'UNKNOWN');assert.deepEqual(store.history('A'),[]);
});

for(const fault of ['fsync','rename','writer','missing'])test('workflow '+fault+' failure preserves evidence and removes only its own temporary file',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-fault-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const base=createWorkflowStore({file,modules});base.save('A',graph());base.record('B',{runId:'prior',workflowId:'wf-1',status:'UNKNOWN'});const bytes=fs.readFileSync(file,'utf8');let armed=false,owned=true;
 const io={...fs,fsyncSync(fd){if(armed&&fault==='fsync')throw Error('flush failure');fs.fsyncSync(fd);if(armed&&fault==='writer')owned=false;if(armed&&fault==='missing')fs.unlinkSync(file);},renameSync(...args){if(armed&&fault==='rename')throw Error('replace failure');return fs.renameSync(...args);}};
 const store=createWorkflowStore({file,modules,fileSystem:io,assertWriter(){if(!owned)throw Object.assign(Error('owner lost'),{code:'WRITER_LOST'});}});assert.equal(store.history('B')[0].status,'UNKNOWN');armed=true;
 assert.throws(()=>store.record('A',{runId:'new',workflowId:'wf-1',status:'COMPLETED'}),{code:fault==='writer'?'WRITER_LOST':'WORKFLOW_STORE_UNAVAILABLE'});
 assert.deepEqual(fs.readdirSync(dir),fault==='missing'?['workflow.json.anchor']:['workflow.json','workflow.json.anchor']);if(fault!=='missing')assert.equal(fs.readFileSync(file,'utf8'),bytes);
 if(fault==='missing')assert.throws(()=>store.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});else assert.deepEqual(store.history('A'),[]);
});

for(const defect of ['version','status','trace','steps','duplicate','directory','symlink','size'])test('workflow rejects '+defect+' evidence and refuses overwrite',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-invalid-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules});store.save('A',graph());store.record('A',{runId:'prior',workflowId:'wf-1',status:'UNKNOWN'});const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(defect==='version')data.version=2;if(defect==='status')data.accounts.A.history[0].status='AUTO_RESUMED';if(defect==='trace')data.accounts.A.history[0].trace=[{nodeId:'a',type:'ACTION',result:'WAIT',blockedReasons:[3]}];if(defect==='steps')data.accounts.A.history[0].steps=-1;if(defect==='duplicate')data.accounts.A.history.push(data.accounts.A.history[0]);
 fs.writeFileSync(file,JSON.stringify(data));const bytes=fs.readFileSync(file,'utf8');
 const io={...fs,lstatSync(p){const stat=fs.lstatSync(p);if(defect==='directory')return {isFile:()=>false,isSymbolicLink:()=>false,size:0};if(defect==='symlink')return {isFile:()=>true,isSymbolicLink:()=>true,size:0};if(defect==='size')return {isFile:()=>true,isSymbolicLink:()=>false,size:8*1024*1024+1};return stat;}};
 const restored=createWorkflowStore({file,modules,fileSystem:io});assert.throws(()=>restored.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.throws(()=>restored.save('B',graph()),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json','workflow.json.anchor']);
});

test('oversized workflow write cannot replace a readable store',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-limit-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules});store.save('A',graph());const bytes=fs.readFileSync(file,'utf8');assert.throws(()=>store.record('A',{runId:'new',workflowId:'wf-1',status:'UNKNOWN',reason:'x'.repeat(8*1024*1024)}),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json','workflow.json.anchor']);
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

const onceSchedule=at=>({kind:'ONCE',at:new Date(at).toISOString(),timeZone:'Asia/Shanghai',missedPolicy:'SKIP'});
const scheduledGraph=(at=1050,g=graph(),policy={})=>boundedGraph(g,{schedule:onceSchedule(at),...policy});
test('explicit one-time triggers require canonical absolute time, Shanghai zone and skip-on-miss policy',()=>{
 const g=scheduledGraph();assert.deepEqual(validateWorkflow(g,{modules}).workflow.runPolicy.schedule,g.runPolicy.schedule);for(const change of [s=>s.kind='DAILY',s=>s.timeZone='UTC',s=>s.missedPolicy='RUN_NOW',s=>s.at='2026-02-30T00:00:00.000Z',s=>s.at='2026-11-14T08:00:00+08:00',s=>delete s.at,s=>s.at=1050,s=>s.extra=true]){const bad=structuredClone(g);change(bad.runPolicy.schedule);assert.throws(()=>validateWorkflow(bad,{modules}));}assert.equal(simulateWorkflow(g,{modules}).requestsSent,0);
});

test('an armed one-time Workflow creates no survey or plan before its declared time, then uses the original manual pause',async()=>{
 let time=1000;const f=fixture({}, {clock:()=>time});const waiting=await f.runner.start(f.session.id,scheduledGraph());assert.equal(waiting.status,'WAITING');assert.equal(waiting.trigger.state,'WAITING');assert.equal(waiting.actionPlans,0);assert.equal(waiting.plan,null);assert.equal(f.calls.some(row=>['survey','plan'].includes(row[0])),false);time=1050;const result=await f.runner.settle();assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(result.trigger.state,'FIRED');assert.equal(result.trigger.firedAt,new Date(1050).toISOString());assert.equal(f.calls.filter(row=>row[0]==='survey').length,1);assert.equal(f.calls.filter(row=>row[0]==='plan').length,1);f.runner.stop();await f.runner.settle();assert.equal(f.released(),1);
});

for(const [label,at]of [['missed',1000],['beyond-deadline',11000]])test('one-time '+label+' run never claims a writer or catches up automatically',async()=>{
 const f=fixture(),result=await f.runner.start(f.session.id,scheduledGraph(at));assert.equal(result.status,'STOPPED');assert.equal(result.trigger.state,label==='missed'?'MISSED':'PENDING');assert.equal(result.actionPlans,0);assert.equal(f.calls.length,0);assert.equal(f.released(),0);assert.equal(result.trace.length,0);
});

for(const phase of ['STARTING','WAITING'])test('a trigger crossed during '+phase+' persistence is skipped rather than silently caught up',async()=>{
 let time=1000;const f=fixture({}, {clock:()=>time,onUpdate:state=>{if(state.status===phase&&!state.finishedAt)time=1050;}});const result=await f.runner.start(f.session.id,scheduledGraph());assert.equal(result.status,'STOPPED');assert.equal(result.trigger.state,'MISSED');assert.equal(f.calls.some(row=>['plan','survey'].includes(row[0])),false);assert.equal(f.released(),1);
});

test('cancelling an armed trigger clears its wait and late time cannot revive it or affect a replacement',async()=>{
 let time=1000;const f=fixture({}, {clock:()=>time});await f.runner.start(f.session.id,scheduledGraph());f.runner.stop();assert.equal((await f.runner.settle()).status,'CANCELLED');assert.equal(f.released(),1);time=1050;assert.equal((await f.runner.start(f.session.id,readOnly())).status,'COMPLETED');assert.equal(f.calls.some(row=>['survey','plan'].includes(row[0])),false);assert.equal(f.released(),2);
});

test('trigger waiting keeps the original deadline even when the wall clock remains behind',async()=>{
 const f=fixture();await f.runner.start(f.session.id,scheduledGraph(1050,readOnly(),{modules:[],maxActions:0,maxDurationMs:80}));const result=await f.runner.settle();assert.equal(result.status,'STOPPED');assert.equal(result.trigger.state,'WAITING');assert.equal(result.trace.length,0);assert.equal(f.released(),1);
});

test('armed trigger restart is only readable original evidence and does not reconstruct timers or authority',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-scheduled-restart-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules}),f=fixture({}, {onUpdate:state=>store.record('account-1',state)});try{const pending=await f.runner.start(f.session.id,scheduledGraph(2000));const bytes=fs.readFileSync(file,'utf8'),recovered=createWorkflowStore({file,modules}).history(f.session.id)[0];assert.equal(recovered.status,'RECOVERED_STOPPED');assert.equal(recovered.trigger.state,'WAITING');assert.deepEqual(recovered.runPolicy.schedule,pending.runPolicy.schedule);assert.equal(recovered.resumable,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(f.calls.some(row=>['plan','survey'].includes(row[0])),false);}finally{f.runner.stop();await f.runner.settle();}
});

test('corrupt one-time trigger evidence is rejected without overwriting persisted bytes or reconstructing authority',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-once-corrupt-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules}),run={accountId:'A',runId:'once-history',workflowId:'wf',status:'COMPLETED',startedAt:new Date(1000).toISOString(),finishedAt:new Date(1100).toISOString(),expiresAt:new Date(2000).toISOString(),runPolicy:{maxDurationMs:1000,maxActions:0,modules:[],schedule:onceSchedule(1050)},actionPlans:0,trace:[],trigger:{state:'FIRED',armedAt:new Date(1000).toISOString(),firedAt:new Date(1050).toISOString(),missedAt:null}};store.record('A',run);const bytes=fs.readFileSync(file,'utf8');
 for(const change of [r=>delete r.trigger,r=>r.trigger.state='RETRY',r=>r.trigger.armedAt=null,r=>r.trigger.armedAt=new Date(1050).toISOString(),r=>r.trigger.firedAt=new Date(1049).toISOString(),r=>r.trigger.firedAt=new Date(2000).toISOString(),r=>r.trigger.firedAt=1050,r=>r.trigger.firedAt='1970-01-01T00:00:01.050+00:00',r=>r.trigger.missedAt=new Date(1050).toISOString(),r=>delete r.runPolicy.schedule,r=>r.trigger.extra=true,r=>{r.trigger.state='WAITING';r.trigger.firedAt=null;r.trace=[{nodeId:'s',type:'START',result:'START'}];}]){const bad=structuredClone(run);change(bad);assert.throws(()=>store.record('A',bad));assert.equal(fs.readFileSync(file,'utf8'),bytes);const raw=JSON.parse(bytes);raw.accounts.A.history[0]=bad;fs.writeFileSync(file,JSON.stringify(raw));const damaged=fs.readFileSync(file,'utf8'),restarted=createWorkflowStore({file,modules});assert.throws(()=>restarted.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.throws(()=>restarted.save('A',graph()));assert.equal(fs.readFileSync(file,'utf8'),damaged);fs.writeFileSync(file,bytes);}
});

for(const entry of ['tasks','dailies','loop'])test(entry+' carries one explicit trigger through its existing compiler without changing original business nodes',()=>{
 const intent=unifiedBoundedIntent(entry),before=compileUnifiedExecution(intent,{modules:unifiedRegistry});intent.runPolicy.schedule=onceSchedule(1050);const scheduled=compileUnifiedExecution(intent,{modules:unifiedRegistry});assert.deepEqual(scheduled.graph.runPolicy,intent.runPolicy);assert.deepEqual(scheduled.graph.nodes,before.graph.nodes);assert.deepEqual(scheduled.graph.edges,before.graph.edges);assert.deepEqual(scheduled.graph.budget,before.graph.budget);assert.deepEqual(scheduled.graph.preparation,before.graph.preparation);
});

const calendarSchedule=(kind='DAILY',localTime='00:00:00.000',weekDay=7)=>({kind,localTime,timeZone:'Asia/Shanghai',missedPolicy:'SKIP',...(kind==='WEEKLY'?{weekDay}:{})});

test('calendar schedule resolves Shanghai date, ISO weekdays, month/year and leap boundaries without using the host timezone',()=>{
 for(const [schedule,start,expected]of [
 [calendarSchedule(),'2026-11-14T15:59:59.950Z','2026-11-14T16:00:00.000Z'],
 [calendarSchedule(),'2026-11-14T16:00:00.000Z','2026-11-15T16:00:00.000Z'],
 [calendarSchedule(),'2026-12-31T15:59:59.999Z','2026-12-31T16:00:00.000Z'],
 [calendarSchedule(),'2028-02-28T15:59:59.999Z','2028-02-28T16:00:00.000Z'],
 [calendarSchedule(),'2028-02-29T15:59:59.999Z','2028-02-29T16:00:00.000Z'],
 [calendarSchedule('WEEKLY'),'2026-11-14T15:59:59.950Z','2026-11-14T16:00:00.000Z'],
 [calendarSchedule('WEEKLY'),'2026-11-14T16:00:00.000Z','2026-11-21T16:00:00.000Z'],
 [calendarSchedule('WEEKLY','23:59:59.999',1),'2026-11-15T16:00:00.000Z','2026-11-16T15:59:59.999Z'],
 [calendarSchedule('DAILY','08:30:01.002'),'2026-11-14T00:30:01.001Z','2026-11-14T00:30:01.002Z']])assert.equal(workflowScheduledAt(schedule,start),expected);
 for(const kind of ['DAILY','WEEKLY']){const schedule=calendarSchedule(kind),g=boundedGraph(graph(),{schedule});assert.equal(validateWorkflow(g,{modules}).valid,true);assert.equal(simulateWorkflow(g,{modules}).requestsSent,0);for(const mutate of [s=>s.localTime='24:00:00.000',s=>s.localTime='08:00',s=>s.localTime='08:00:60.000',s=>s.localTime=' 08:00:00.000',s=>s.timeZone='UTC',s=>s.missedPolicy='CATCH_UP',s=>s.at='2026-11-14T00:00:00.000Z',s=>s.weekDay=0,s=>s.weekDay=8,s=>s.weekDay='7']){const bad=structuredClone(g);mutate(bad.runPolicy.schedule);assert.throws(()=>validateWorkflow(bad,{modules}));}}
});

for(const kind of ['DAILY','WEEKLY'])test('calendar '+kind+' waits for its persisted concrete occurrence and then follows the original manual execution pause',async()=>{
 let time=Date.parse('2026-11-14T15:59:59.950Z');const f=fixture({}, {clock:()=>time});f.session.player={playerId:'9007199254740993',worldId:0};try{const g=boundedGraph(graph(),{schedule:calendarSchedule(kind)}),pending=await f.runner.start(f.session.id,g);assert.equal(pending.status,'WAITING');assert.equal(pending.trigger.scheduledAt,'2026-11-14T16:00:00.000Z');assert.equal(pending.trigger.worldId,'0');assert.equal(f.calls.some(row=>['survey','plan'].includes(row[0])),false);time+=50;const result=await f.runner.settle();assert.equal(result.status,'AWAITING_AUTHORIZATION');assert.equal(result.trigger.state,'FIRED');assert.equal(result.actionPlans,1);assert.equal(result.runPolicy.maxDurationMs,10000);}finally{f.runner.stop();await f.runner.settle();}
});

test('calendar occurrences beyond the existing run window stop without claims and missing role/world cannot arm one',async()=>{
 let time=Date.parse('2026-11-14T15:59:59.950Z');const f=fixture({}, {clock:()=>time});f.session.player={playerId:'p',worldId:1};const result=await f.runner.start(f.session.id,boundedGraph(readOnly(),{modules:[],maxActions:0,schedule:calendarSchedule('WEEKLY','00:00:00.000',1)}));assert.equal(result.status,'STOPPED');assert.equal(result.trigger.scheduledAt,'2026-11-15T16:00:00.000Z');assert.equal(f.calls.length,0);delete f.session.player.worldId;await assert.rejects(f.runner.start(f.session.id,boundedGraph(readOnly(),{modules:[],maxActions:0,schedule:calendarSchedule()})));assert.equal(f.calls.length,0);
});

for(const phase of ['STARTING','WAITING'])test('calendar '+phase+' persistence crossing the resolved occurrence skips it without choosing a new date',async()=>{
 let time=Date.parse('2026-11-14T15:59:59.950Z');const f=fixture({}, {clock:()=>time,onUpdate:state=>{if(state.status===phase&&!state.finishedAt)time+=50;}});f.session.player={playerId:'p',worldId:1};const result=await f.runner.start(f.session.id,boundedGraph(graph(),{schedule:calendarSchedule()}));assert.equal(result.status,'STOPPED');assert.equal(result.trigger.state,'MISSED');assert.equal(result.trigger.scheduledAt,'2026-11-14T16:00:00.000Z');assert.equal(f.calls.some(row=>['survey','plan'].includes(row[0])),false);
});

test('calendar history persists exact occurrence and prevents clock-rollback replay across restart for the same role, world and graph',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-calendar-replay-')),file=path.join(dir,'workflows.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let time=Date.parse('2026-11-14T15:59:59.950Z');const store=createWorkflowStore({file,modules}),g=boundedGraph(readOnly(),{modules:[],maxActions:0,schedule:calendarSchedule()}),make=(id='account-1',worldId=1)=>{const f=fixture({}, {clock:()=>time,onUpdate:state=>store.record(id,state)});f.session.id=id;f.session.player={playerId:'9007199254740993',worldId};return f;};
 const f=make();await f.runner.start(f.session.id,g);time+=50;const completed=await f.runner.settle();assert.equal(completed.status,'COMPLETED');const bytes=fs.readFileSync(file,'utf8'),reopened=createWorkflowStore({file,modules});assert.equal(reopened.history(f.session.id)[0].trigger.state,'FIRED');assert.equal(reopened.history(f.session.id)[0].resumable,false);assert.equal(fs.readFileSync(file,'utf8'),bytes);
 time-=50;const replay=make();await assert.rejects(replay.runner.start(replay.session.id,g),{code:'WORKFLOW_TRIGGER_CONSUMED'});assert.equal(replay.runner.getStatus().status,'FAILED');assert.equal(replay.calls.some(row=>['survey','plan'].includes(row[0])),false);assert.equal(store.history(f.session.id).find(row=>row.runId===completed.runId).trigger.state,'FIRED');
 for(const [id,world]of [['account-1',2],['other-account',1]]){const independent=make(id,world);try{assert.equal((await independent.runner.start(id,g)).status,'WAITING');}finally{independent.runner.stop();await independent.runner.settle();}}
 const old=store.history(f.session.id).find(row=>row.runId===completed.runId),before=fs.readFileSync(file,'utf8');for(const mutate of [r=>r.trigger.scheduledAt='2026-11-15T16:00:00.000Z',r=>delete r.trigger.worldId,r=>r.trigger.playerId='',r=>r.trigger.scheduledAt=Date.parse(r.trigger.scheduledAt)]){const bad=structuredClone(old);mutate(bad);assert.throws(()=>store.record(f.session.id,bad));assert.equal(fs.readFileSync(file,'utf8'),before);}
});

for(const entry of ['tasks','dailies','loop'])test(entry+' preserves daily and weekly rules in the existing unified compiler without creating another execution graph',()=>{
 const intent=unifiedBoundedIntent(entry),before=compileUnifiedExecution(intent,{modules:unifiedRegistry});for(const kind of ['DAILY','WEEKLY']){intent.runPolicy.schedule=calendarSchedule(kind);const compiled=compileUnifiedExecution(intent,{modules:unifiedRegistry});assert.deepEqual(compiled.graph.runPolicy,intent.runPolicy);assert.deepEqual(compiled.graph.nodes,before.graph.nodes);assert.deepEqual(compiled.graph.edges,before.graph.edges);assert.deepEqual(compiled.graph.budget,before.graph.budget);assert.deepEqual(compiled.graph.preparation,before.graph.preparation);}delete intent.runPolicy.schedule.weekDay;assert.throws(()=>compileUnifiedExecution(intent,{modules:unifiedRegistry}));
});

const vipEventRule=()=>({kind:'VIP_LEVEL_CHANGED',level:3});
test('business event rule is explicit and cannot inject transports, rewards, retries or calendar authority',()=>{
 for(const level of [0,3,2147483647])assert.equal(validateWorkflow(boundedGraph(graph(),{eventTrigger:{kind:'VIP_LEVEL_CHANGED',level}}),{modules}).valid,true);
 for(const rule of [null,{}, {kind:'SCVipUpdate',level:3},{kind:'VIP_LEVEL_CHANGED'},...[-1,1.5,2147483648,'3',null].map(level=>({kind:'VIP_LEVEL_CHANGED',level})),{...vipEventRule(),request:'SCVipUpdate'},{...vipEventRule(),reward:10},{...vipEventRule(),allowRetry:true}])assert.throws(()=>validateWorkflow(boundedGraph(graph(),{eventTrigger:rule}),{modules}),{code:'WORKFLOW_INVALID'});
 assert.throws(()=>validateWorkflow(boundedGraph(graph(),{eventTrigger:vipEventRule(),schedule:onceSchedule(1050)}),{modules}),{code:'WORKFLOW_INVALID'});
});
for(const entry of ['tasks','dailies','loop'])test(entry+' keeps the original business DAG and explicit event rule without creating runtime',()=>{
 const intent=unifiedBoundedIntent(entry),before=compileUnifiedExecution(intent,{modules:unifiedRegistry});intent.runPolicy.eventTrigger=vipEventRule();const compiled=compileUnifiedExecution(intent,{modules:unifiedRegistry});assert.deepEqual(compiled.graph.nodes,before.graph.nodes);assert.deepEqual(compiled.graph.edges,before.graph.edges);assert.deepEqual(compiled.graph.budget,before.graph.budget);assert.deepEqual(compiled.graph.runPolicy,intent.runPolicy);const simulation=simulateWorkflow(compiled.graph,{modules:unifiedRegistry});assert.equal(simulation.runtimeCreated,false);assert.equal(simulation.requestsSent,0);
});
test('a forged public VIP reader or plain message source cannot arm an event workflow or obtain a claim',async()=>{
 const f=fixture();f.session.player={playerId:'17',worldId:1};f.session.connectionId='synthetic';f.session.client.readVipLevel=()=>({reliable:true,accountId:f.session.id,generation:1,connectionId:'synthetic',playerId:'17',worldId:'1',vipLevel:3});await assert.rejects(f.runner.start(f.session.id,boundedGraph(graph(),{eventTrigger:vipEventRule()})),{code:'WORKFLOW_EVENT_UNKNOWN'});assert.equal(f.calls.length,0);assert.equal(f.runner.getStatus().running,false);
});

for(const entry of ['tasks','dailies','loop'])test(entry+' supports an explicit player level event through the existing compiler without changing the business DAG',()=>{
 const intent=unifiedBoundedIntent(entry),before=compileUnifiedExecution(intent,{modules:unifiedRegistry});intent.runPolicy.eventTrigger={kind:'PLAYER_LEVEL_CHANGED',level:3};const result=compileUnifiedExecution(intent,{modules:unifiedRegistry});assert.deepEqual(result.graph.nodes,before.graph.nodes);assert.deepEqual(result.graph.edges,before.graph.edges);assert.deepEqual(result.graph.budget,before.graph.budget);assert.deepEqual(result.graph.runPolicy,intent.runPolicy);assert.equal(simulateWorkflow(result.graph,{modules:unifiedRegistry}).requestsSent,0);
});

for(const entry of ['dailies','loop'])test('unified '+entry+' maps daily mainline to the original finite Stage Function without implying a daily claim',async()=>{
 const {createStageFunction}=await import('../src/stage-function.mjs');
 const stage=createStageFunction({getSession(){throw Error('compile must not survey');},prepareRunner(){throw Error('compile must not prepare Runner');}});
 const {registerBusinessFunction}=await import('../src/function-registry.mjs');const registry={...unifiedRegistry,stage:registerBusinessFunction(stage)},config={enabled:true,retryDelaySeconds:10,maxAttempts:1,maxStage:null,stopOnDefeat:true};
 const input={entry,dailies:[{taskId:1003,action:'perform',parameters:{config}}],budget:unifiedBudget,...(entry==='loop'?{rounds:2}:{})};
 const result=compileUnifiedExecution(input,{modules:registry}),nodes=result.graph.nodes.filter(n=>n.type==='ACTION');
 assert.equal(result.blocked.length,0);assert.equal(nodes.length,entry==='loop'?2:1);
 for(const node of nodes){assert.equal(node.module,'stage');assert.deepEqual(node.parameters,{config});assert.deepEqual(node.selection,{unique:true});}
 assert.equal(simulateWorkflow(result.graph,{modules:registry}).requestsSent,0);
 const claim=compileUnifiedExecution({entry,dailies:[{taskId:1003,action:'claim'}],budget:unifiedBudget},{modules:registry}).graph.nodes.find(n=>n.type==='ACTION');
 assert.equal(claim.module,'task-rewards');assert.deepEqual(claim.parameters,{kind:'daily',taskId:1003});
 for(const bad of [{...config,maxAttempts:null},{...config,maxAttempts:201},{...config,enabled:false},{...config,allowPaid:true}]){
  assert.throws(()=>compileUnifiedExecution({...input,dailies:[{taskId:1003,parameters:{config:bad}}]},{modules:registry}));
 }
 assert.throws(()=>compileUnifiedExecution({...input,dailies:[{taskId:1003,parameters:{request:'ChallengeStageRequest'}}]},{modules:registry}));
});
for(const entry of ['dailies','loop'])test('unified '+entry+' daily museum exploration uses domain exact selection without replacing its execution contract',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs');
 const {museumStartExploreSelection}=await import('../src/museum.mjs');
 const parameters={stageId:1,heroIds:['A','B','C'],factor:1},registry={...unifiedRegistry,museum:GAMEPLAY_MODULES.museum};
 const input={entry,dailies:[{taskId:1016,action:'perform',parameters}],budget:unifiedBudget,...(entry==='loop'?{rounds:2}:{})};
 const result=compileUnifiedExecution(input,{modules:registry}),actions=result.graph.nodes.filter(n=>n.type==='ACTION');
 assert.equal(result.blocked.length,0);assert.equal(actions.length,entry==='loop'?2:1);
 for(const node of actions){assert.equal(node.module,'museum');assert.deepEqual(node.parameters,parameters);assert.deepEqual(node.selection,museumStartExploreSelection(parameters));}
 assert.equal(simulateWorkflow(result.graph,{modules:registry}).requestsSent,0);
 const claim=compileUnifiedExecution({entry,dailies:[{taskId:1016,action:'claim'}],budget:unifiedBudget},{modules:registry}).graph.nodes.find(n=>n.type==='ACTION');
 assert.equal(claim.module,'task-rewards');assert.deepEqual(claim.parameters,{kind:'daily',taskId:1016});
 for(const parameters of [{},{stageId:1,heroIds:[],factor:1},{stageId:1,heroIds:['A']},{stageId:1,heroIds:['A'],factor:1,payment:'FREE'}])
  assert.throws(()=>compileUnifiedExecution({...input,dailies:[{taskId:1016,parameters}]},{modules:registry}),{code:'WORKFLOW_INVALID'});
});
test('Workflow store restart cannot turn missing established history into a new empty account',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-anchor-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules});store.save('__proto__',graph());store.record('B',{runId:'prior',workflowId:'wf-1',status:'UNKNOWN'});
 const bytes=fs.readFileSync(file,'utf8'),anchor=fs.readFileSync(file+'.anchor','utf8');fs.unlinkSync(file);
 const fresh=createWorkflowStore({file,modules});
 for(const account of ['__proto__','B','new'])for(const read of [()=>fresh.list(account),()=>fresh.history(account),()=>fresh.save(account,graph()),()=>fresh.record(account,{runId:'replacement',workflowId:'wf-1',status:'COMPLETED'}),()=>fresh.remove(account,'wf-1')])assert.throws(read,{code:'WORKFLOW_STORE_UNAVAILABLE'});
 assert.equal(fs.existsSync(file),false);assert.equal(fs.readFileSync(file+'.anchor','utf8'),anchor);assert.deepEqual(fs.readdirSync(dir),['workflow.json.anchor']);
 fs.writeFileSync(file,bytes);assert.equal(fresh.history('B')[0].status,'UNKNOWN');assert.equal(fresh.list('__proto__').length,1);assert.equal(fs.readFileSync(file,'utf8'),bytes);
});
test('legacy Workflow v1 reads stay pure and the next normal write establishes the original existence protection',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-legacy-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const legacy={version:1,accounts:{A:{workflows:[graph()],history:[{accountId:'A',runId:'old',workflowId:'wf-1',status:'AWAITING_AUTHORIZATION'}]}}};
 const bytes=JSON.stringify(legacy);fs.writeFileSync(file,bytes);let writes=0;
 const store=createWorkflowStore({file,modules,assertWriter(){writes++;}});assert.equal(store.history('A')[0].status,'RECOVERED_STOPPED');assert.equal(store.list('A').length,1);assert.deepEqual(store.list('B'),[]);
 assert.equal(writes,0);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json']);
 store.record('B',{runId:'new',workflowId:'wf-1',status:'UNKNOWN'});assert.equal(fs.existsSync(file+'.anchor'),true);assert.equal(store.history('A')[0].resumable,false);assert.equal(store.history('B')[0].status,'UNKNOWN');
 fs.unlinkSync(file);assert.throws(()=>createWorkflowStore({file,modules}).history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});
});
test('a genuinely new Workflow store reads without creating evidence or taking writer ownership',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-new-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules,assertWriter(){throw Error('read must not take writer');}});assert.deepEqual(store.list('A'),[]);assert.deepEqual(store.history('B'),[]);assert.deepEqual(fs.readdirSync(dir),[]);
});
for(const fault of ['anchor-write','anchor-flush','rename','owner'])test('Workflow first write '+fault+' cannot reopen as pristine after restart',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-first-write-')),file=path.join(dir,'workflow.json'),anchor=file+'.anchor';t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let anchorFd,owned=true;
 const io={...fs,openSync(p,...args){const fd=fs.openSync(p,...args);if(p===anchor)anchorFd=fd;return fd;},writeFileSync(fd,...args){if(fd===anchorFd&&fault==='anchor-write'){fs.writeFileSync(fd,'{interrupted');throw Error('anchor write failed');}return fs.writeFileSync(fd,...args);},fsyncSync(fd){fs.fsyncSync(fd);if(fd===anchorFd&&fault==='anchor-flush')throw Error('anchor flush failed');if(fd===anchorFd&&fault==='owner')owned=false;},renameSync(...args){if(fault==='rename')throw Error('rename failed');return fs.renameSync(...args);}};
 const store=createWorkflowStore({file,modules,fileSystem:io,assertWriter(){if(!owned)throw Object.assign(Error('writer lost'),{code:'WRITER_LOST'});}});
 assert.throws(()=>store.save('A',graph()),{code:fault==='owner'?'WRITER_LOST':'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.existsSync(file),false);
 const anchorBytes=fs.readFileSync(anchor,'utf8'),fresh=createWorkflowStore({file,modules});assert.throws(()=>fresh.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.throws(()=>fresh.save('B',graph()),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(anchor,'utf8'),anchorBytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json.anchor']);
});
for(const defect of ['truncated','version','kind','basename','extra','directory','symlink','size'])test('Workflow '+defect+' existence anchor preserves readable historical bytes and blocks replacement',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-bad-anchor-')),file=path.join(dir,'workflow.json'),anchor=file+'.anchor';t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=createWorkflowStore({file,modules});store.save('A',graph());const bytes=fs.readFileSync(file,'utf8'),value=JSON.parse(fs.readFileSync(anchor,'utf8'));
 if(defect==='version')value.version=2;if(defect==='kind')value.kind='EXECUTION_HISTORY_EXISTENCE';if(defect==='basename')value.basename='other.json';if(defect==='extra')value.resumable=true;
 fs.writeFileSync(anchor,defect==='truncated'?'{interrupted':JSON.stringify(value));const anchorBytes=fs.readFileSync(anchor,'utf8');
 const io={...fs,lstatSync(p){if(p===anchor&&['directory','symlink','size'].includes(defect))return {isFile:()=>defect!=='directory',isSymbolicLink:()=>defect==='symlink',size:defect==='size'?1025:1};return fs.lstatSync(p);}};
 const fresh=createWorkflowStore({file,modules,fileSystem:io});for(const read of [()=>fresh.list('A'),()=>fresh.history('B'),()=>fresh.save('A',graph())])assert.throws(read,{code:'WORKFLOW_STORE_UNAVAILABLE'});
 assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.readFileSync(anchor,'utf8'),anchorBytes);assert.deepEqual(fs.readdirSync(dir),['workflow.json','workflow.json.anchor']);
});
test('observed Workflow anchor removal cannot be ignored within the same store owner',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-anchor-lost-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules});store.save('A',graph());const bytes=fs.readFileSync(file,'utf8');fs.unlinkSync(file+'.anchor');
 assert.throws(()=>store.history('A'),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.throws(()=>store.save('B',graph()),{code:'WORKFLOW_STORE_UNAVAILABLE'});assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.existsSync(file+'.anchor'),false);
});
test('restarted Workflow missing evidence stops before survey plan authorization or dispatch',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-workflow-restart-stop-')),file=path.join(dir,'workflow.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createWorkflowStore({file,modules});store.save('A',graph());store.record('A',{runId:'old',workflowId:'wf-1',status:'UNKNOWN'});fs.unlinkSync(file);
 const fresh=createWorkflowStore({file,modules}),calls=[],session={id:'A',generation:1,client:{},abort:new AbortController()};let released=0;
 const runner=createWorkflowRunner({modules,getSession:()=>session,claim:()=>()=>{released++;},operations:{history:()=>({runs:[]}),...Object.fromEntries(['surveyModule','plan','authorize','execute'].map(name=>[name,()=>{calls.push(name);throw Error('must not reach '+name);} ]))},onUpdate:status=>fresh.record('A',status)});
 await assert.rejects(runner.start('A',graph()),{code:'WORKFLOW_STORE_UNAVAILABLE'});await runner.settle();assert.equal(runner.getStatus().status,'FAILED');assert.deepEqual(calls,[]);assert.equal(released,1);assert.equal(fs.existsSync(file),false);
});
for(const entry of ['dailies','loop'])test('unified '+entry+' daily alliance order compiles exact city selection and keeps claiming separate',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs'),{allianceOrderSelection}=await import('../src/alliance.mjs'),registry={...unifiedRegistry,alliance:GAMEPLAY_MODULES.alliance};
 const input={entry,dailies:[{taskId:1012,action:'perform',parameters:{cityId:2}}],budget:unifiedBudget,...(entry==='loop'?{rounds:2}:{})};
 const result=compileUnifiedExecution(input,{modules:registry}),actions=result.graph.nodes.filter(n=>n.type==='ACTION');assert.deepEqual(result.blocked,[]);assert.equal(actions.length,entry==='loop'?2:1);
 for(const node of actions){assert.equal(node.module,'alliance');assert.deepEqual(node.parameters,{cityId:2});assert.deepEqual(node.selection,allianceOrderSelection({cityId:2}));}
 assert.equal(simulateWorkflow(result.graph,{modules:registry}).requestsSent,0);
 const claim=compileUnifiedExecution({...input,dailies:[{taskId:1012,action:'claim'}]},{modules:registry}).graph.nodes.find(n=>n.type==='ACTION');assert.equal(claim.module,'task-rewards');assert.deepEqual(claim.parameters,{kind:'daily',taskId:1012});
 for(const parameters of [{},{cityId:0},{cityId:'1'},{cityId:2147483648},{cityId:1,season:1},{cityId:1,request:'FinishGuildOrderRequest'}])assert.throws(()=>compileUnifiedExecution({...input,dailies:[{taskId:1012,parameters}]},{modules:registry}),{code:'WORKFLOW_INVALID'});
});

for(const entry of ['tasks','loop'])test('unified '+entry+' exact mail intents reuse native mail Function and remain static',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs'),tasks=['claim','read'].map((action,index)=>({kind:'mail',pageNo:index,emailId:String(9007199254740995n+BigInt(index)),action}));
 const input={entry,tasks,budget:{resources:[],quotas:[],uids:tasks.map(row=>({type:'mail',id:row.emailId}))},...(entry==='loop'?{rounds:2,everyMs:100}:{})},before=structuredClone(input),compiled=compileUnifiedExecution(input,{modules:GAMEPLAY_MODULES}),actions=compiled.graph.nodes.filter(n=>n.type==='ACTION');
 assert.deepEqual(input,before);assert.deepEqual(compiled.blocked,[]);assert.equal(actions.length,entry==='loop'?4:2);for(const [index,node] of actions.entries()){const {kind,...parameters}=tasks[index%2];assert.equal(node.module,'mail');assert.deepEqual(node.parameters,parameters);assert.deepEqual(node.selection,{unique:true});}assert.equal(simulateWorkflow(compiled.graph,{modules:GAMEPLAY_MODULES}).requestsSent,0);
});
test('unified mail declarations require exact page/ID and can never compile enumeration, bulk or raw transport into writes',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs'),row={kind:'mail',pageNo:0,emailId:'9007199254740995',action:'claim'},input={entry:'tasks',tasks:[row],budget:{resources:[],quotas:[],uids:[]}};
 for(const change of [r=>delete r.pageNo,r=>delete r.emailId,r=>delete r.action,r=>r.pageNo=-1,r=>r.pageNo='0',r=>r.pageNo=2147483648,r=>r.emailId=9007199254740992,r=>r.emailId='01',r=>r.emailId='0',r=>r.emailId='9223372036854775808',r=>r.emailId=['1'],r=>r.action='enumerate',r=>r.all=true,r=>r.maxPages=2,r=>r.parameters={},r=>r.request='QuickGotReadEmailRequest']){const bad=structuredClone(row);change(bad);assert.throws(()=>compileUnifiedExecution({...input,tasks:[bad]},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID'});}
 assert.throws(()=>compileUnifiedExecution({entry:'dailies',dailies:[row],budget:input.budget},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID'});
});

for(const entry of ['tasks','loop'])test('unified '+entry+' AFK milestone declarations compile only explicit levels into the original Function',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs'),input={entry,tasks:[{kind:'afk-level-reward',level:2},{kind:'afk-level-reward',level:5}],budget:{resources:[],quotas:[],uids:[{type:'afk-level-reward',id:'2'},{type:'afk-level-reward',id:'5'}]},...(entry==='loop'?{rounds:2}:{})},before=structuredClone(input),result=compileUnifiedExecution(input,{modules:GAMEPLAY_MODULES}),actions=result.graph.nodes.filter(n=>n.type==='ACTION');
 assert.deepEqual(input,before);assert.deepEqual(result.blocked,[]);assert.equal(actions.length,entry==='loop'?4:2);for(const [index,node] of actions.entries()){assert.equal(node.module,'afk-level-rewards');assert.deepEqual(node.parameters,{level:index%2?5:2});assert.deepEqual(node.selection,{unique:true});}assert.equal(simulateWorkflow(result.graph,{modules:GAMEPLAY_MODULES}).requestsSent,0);
});
test('unified AFK rewards never infer levels or compile interval income, upgrades, protocol payloads or daily action1004',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs'),budget={resources:[],quotas:[],uids:[]};
 for(const row of [{kind:'afk-level-reward'},{kind:'afk-level-reward',level:0},{kind:'afk-level-reward',level:'2'},{kind:'afk-level-reward',level:1.5},{kind:'afk-level-reward',level:2147483648},{kind:'afk-level-reward',level:2,action:'upgrade'},{kind:'afk-level-reward',level:2,useAdvCard:true},{kind:'afk-level-reward',level:2,parameters:{}},{kind:'afk-level-reward',level:2,request:'UpgradeAfkLevelRequest'}])assert.throws(()=>compileUnifiedExecution({entry:'tasks',tasks:[row],budget},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID'});
 const result=compileUnifiedExecution({entry:'dailies',dailies:[{taskId:1004}],budget},{modules:GAMEPLAY_MODULES});assert.equal(result.graph,null);assert.equal(result.blocked[0].reason,'DAILY_ACTION_CONTRACT_UNVERIFIED');
});

for(const entry of ['tasks','dailies','loop'])test(entry+' compiles explicit daily reset events without modifying the original business graph',()=>{
 const intent=unifiedBoundedIntent(entry),before=compileUnifiedExecution(intent,{modules:unifiedRegistry});intent.runPolicy.eventTrigger={kind:'DAILY_TASK_RESET'};const result=compileUnifiedExecution(intent,{modules:unifiedRegistry});assert.deepEqual(result.graph.nodes,before.graph.nodes);assert.deepEqual(result.graph.edges,before.graph.edges);assert.deepEqual(result.graph.budget,before.graph.budget);assert.deepEqual(result.graph.runPolicy,intent.runPolicy);assert.equal(simulateWorkflow(result.graph,{modules:unifiedRegistry}).requestsSent,0);
});
test('daily reset event rule accepts no inferred clock, eligibility, level, transport, retry or automatic renewal',()=>{
 const valid={kind:'DAILY_TASK_RESET'};assert.equal(validateWorkflow(boundedGraph(graph(),{eventTrigger:valid}),{modules}).valid,true);
 for(const extra of [{level:0},{dailyResetTime:1000},{timeZone:'Asia/Shanghai'},{boundaryHour:0},{eligible:true},{request:'SCDailyTaskReset'},{retry:true},{allowPaid:true},{budget:[]}])assert.throws(()=>validateWorkflow(boundedGraph(graph(),{eventTrigger:{...valid,...extra}}),{modules}),{code:'WORKFLOW_INVALID'});
 assert.throws(()=>validateWorkflow(boundedGraph(graph(),{eventTrigger:valid,schedule:onceSchedule(1050)}),{modules}),{code:'WORKFLOW_INVALID'});
});

for(const entry of ['tasks','loop'])test('unified '+entry+' mail enumeration uses only the original bounded SURVEY nodes',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs'),input={entry,tasks:[{kind:'mail-enumeration',maxPages:3}],budget:{resources:[],quotas:[],uids:[]},...(entry==='loop'?{rounds:2,everyMs:10}:{})},before=structuredClone(input);
 const result=compileUnifiedExecution(input,{modules:GAMEPLAY_MODULES}),surveys=result.graph.nodes.filter(row=>row.type==='SURVEY');
 assert.deepEqual(input,before);assert.deepEqual(result.blocked,[]);assert.equal(surveys.length,entry==='loop'?2:1);assert.equal(result.graph.nodes.some(row=>row.type==='ACTION'),false);
 for(const node of surveys){assert.equal(node.module,'mail');assert.deepEqual(node.parameters,{action:'enumerate',maxPages:3});assert.equal(Object.hasOwn(node,'selection'),false);}
 assert.equal(simulateWorkflow(result.graph,{modules:GAMEPLAY_MODULES}).requestsSent,0);
});
test('unified mail enumeration requires an explicit page bound and rejects claim, transport or budget overrides',async()=>{
 const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs'),input={entry:'tasks',tasks:[{kind:'mail-enumeration',maxPages:2}],budget:{resources:[],quotas:[],uids:[]}};
 for(const change of [r=>delete r.maxPages,r=>r.maxPages=0,r=>r.maxPages=101,r=>r.maxPages='2',r=>r.maxPages=1.5,r=>r.pageNo=1,r=>r.emailId='1',r=>r.action='claim',r=>r.selection={unique:true},r=>r.parameters={action:'claim'},r=>r.request='QuickGotReadEmailRequest',r=>r.budget={}]){
  const row=structuredClone(input.tasks[0]);change(row);assert.throws(()=>compileUnifiedExecution({...input,tasks:[row]},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID'});
 }
 assert.throws(()=>compileUnifiedExecution({entry:'dailies',dailies:input.tasks,budget:input.budget},{modules:GAMEPLAY_MODULES}),{code:'WORKFLOW_INVALID'});
 const mixed=compileUnifiedExecution({...input,tasks:[...input.tasks,{kind:'mail',pageNo:0,emailId:'1',action:'claim'}]},{modules:GAMEPLAY_MODULES});
 assert.deepEqual(mixed.graph.nodes.map(row=>row.type),['START','SURVEY','ACTION','STOP']);assert.deepEqual(mixed.graph.nodes[2].parameters,{pageNo:0,emailId:'1',action:'claim'});
});

test('unique ACTION candidate survey receives the same Workflow cancellation fence before planning',async()=>{
 const session={id:'unique-cancel',generation:1,client:{connected:true},abort:new AbortController()};let signal,entered,planned=0;const waiting=new Promise(resolve=>entered=resolve);
 const g=graph();g.nodes=g.nodes.filter(n=>n.id!=='q');g.nodes.find(n=>n.id==='a').selection={unique:true};g.edges=g.edges.filter(e=>e.from!=='q'&&e.to!=='q');g.edges.push({from:'s',to:'a'});
 const runner=createWorkflowRunner({modules,getSession:()=>session,claim:()=>true,operations:{async surveyModule(_session,_module,_parameters,options){signal=options.signal;entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{code:'CANCELLED'})),{once:true}));},plan(){planned++;throw Error('must not plan');},history:()=>({runs:[]})}});
 const running=runner.start(session.id,g);await waiting;assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,false);runner.stop();assert.equal((await running).status,'CANCELLED');assert.equal(signal.aborted,true);assert.equal(session.abort.signal.aborted,false);assert.equal(planned,0);
});
