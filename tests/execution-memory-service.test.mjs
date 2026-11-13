import { compileUnifiedExecution } from '../src/loop.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createExecutionHistory} from '../src/execution-history.mjs';
import {createExecutionMemory} from '../src/execution-memory.mjs';
import {createOperationService} from '../src/operation-service.mjs';
import {createWorkflowRunner,projectWorkflowExecutionHistory} from '../src/workflow.mjs';

// Private TEMP storage and synthetic in-process requests only. No account data,
// credentials, Runtime, socket, server clock sample or real transport is used.
function fixture({outcome='SUCCESS',file=null,memoryFailure=false,moduleId='fixture'}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-memory-service-')),historyFile=file??path.join(dir,'history.json'),memoryFile=path.join(path.dirname(historyFile),path.basename(historyFile)+'.memory.json');
 const durable=createExecutionHistory({file:historyFile}),store=createExecutionMemory({file:memoryFile});
 let fail=memoryFailure,beforePut=null,onSurvey=null;
 const memory={...store,record(...args){if(fail)throw Object.assign(Error('synthetic memory write unavailable'),{code:'MEMORY_UNAVAILABLE'});return store.record(...args);}};
 const history={...durable,put(record){beforePut?.(record);return durable.put(record);}};
 const protocol=Object.fromEntries(['AllItemRequest','AllItemResponse','AllResourceRequest','AllResourceResponse','SaveFormationRequest','SaveFormationResponse'].map(name=>[name,{}]));
 const rows=new Map(['one','two'].map(id=>[id,{revision:1,applied:false}])),writes=[],reads=[],clients=[];
 const candidate=(id,row)=>({actionId:id,actionType:'SAVE',target:{id},identity:{revision:row.revision},beforeState:{revision:row.revision},expectedState:{revision:row.revision+1},costs:[{id:'wood',num:1}],costSource:'synthetic authoritative exact cost',action:{request:'SaveFormationRequest',response:'SaveFormationResponse',body:{id,revision:row.revision}}});
 const adapter={id:moduleId,defaultConfig:{enabled:true},async survey(client){onSurvey?.(client);return {stockReliable:true,stock:new Map([['wood',client.stock]]),rows:structuredClone(rows)};},view(facts){return {candidates:[...facts.rows].map(([id,row])=>candidate(id,row))};},plan(facts,{selections=[],ledger}){return {actions:selections.map(id=>candidate(id,facts.rows.get(id))).filter(op=>ledger.reserve(op.costs))};},verify(op,before,after){return {confirmed:after.rows.get(op.target.id).revision===before.rows.get(op.target.id).revision+1,afterState:after.rows.get(op.target.id)};}};
 const service=createOperationService({protocol,history,memory,getConfig:()=>({}),loadRules:()=>({config:{version:1,enabled:false,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}}),modules:{[moduleId]:adapter},moduleSettings:{get:()=>({config:{enabled:true}})}});
 function session(id='A') {const client={connected:true,stock:10,pending:[],watchers:[],lateResponses:new Set(),uncertainWrites:new Set(),onRead:null,async request(name,body,_response,_timeout,options){if(options?.mutate){writes.push({id,name,body:structuredClone(body),durable:durable.list(id)[0]});if(outcome==='REJECTED')throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});if(outcome==='SUCCESS'){rows.get(body.id).revision++;this.stock--;}return {}; }reads.push({id,name});this.onRead?.(name);if(name==='AllItemRequest')return {items:[{itemId:'wood',num:this.stock}]};if(name==='AllResourceRequest')return {list:[]};throw Error('Unexpected read '+name);},markUnverifiedWrite(name,body){this.uncertainWrites.add(JSON.stringify({name,body}));},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));}};clients.push(client);return {id,state:'READY',generation:1,connectionId:'synthetic-'+id,player:{playerId:id,worldId:1},client,abort:new AbortController(),busy:null,loop:{running:false}};}
 const account=session();
 const plan=(ids=['one'],target=account)=>service.plan(target,{module:moduleId,mode:ids.length===1?'Manual':'Automatic',selections:ids,parameters:{}},{workflowId:target.workflowOwner??null});
 const authorize=(planned,target=account)=>service.authorize(target,{batchId:planned.batchId,planHash:planned.planHash,approvedActionIds:planned.actions.map(row=>row.actionId),resourceBudget:planned.resourceBudget,confirm:true});
 async function execute(planned,target=account,permit=authorize(planned,target)){const started=service.execute(target,permit);await service.settle(target.id);return {started,record:durable.list(target.id).find(run=>run.runId===started.runId),status:service.status(target.id)};}
 function rejectEvent(extra={}) {return {module:'fixture',actionType:'SAVE',target:{id:'one'},identity:{revision:1},source:'synthetic trusted refusal',generation:1,runId:'prior-run',batchId:'prior-batch',actionId:'one',status:'REJECTED',dispatched:true,unresolvedWrite:false,reason:'synthetic definite refusal',...extra};}
 async function cleanup(){for(const client of clients)client.connected=false;await service.settle(account.id);assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
 return {dir,historyFile,memoryFile,history:durable,store,memory,adapter,service,account,session,rows,writes,reads,plan,authorize,execute,rejectEvent,fail:value=>fail=value,onPut:value=>beforePut=value,onSurvey:value=>onSurvey=value,cleanup};
}

test('file History declares local storage metadata and Service auto-derives an isolated sibling without a read side effect',async()=>{
 const f=fixture();try{assert.equal(f.history.storagePath,path.resolve(f.historyFile));const service=createOperationService({history:f.history,loadRules:()=>({config:{}})});assert.equal(service.executionMemory('A').available,true);assert.deepEqual(fs.readdirSync(f.dir),[]);assert.equal(service.executionMemory('A').resumable,false);}finally{await f.cleanup();}
});

test('definite executor refusal is persisted in original History before supplemental immutable memory',async()=>{
 const f=fixture({outcome:'REJECTED'});try{const planned=await f.plan(),result=await f.execute(planned),event=f.service.executionMemory('A').events[0];assert.equal(result.record.actions[0].result,'REJECTED');assert.equal(result.record.actions[0].requestStatus,'REJECTED');assert.equal(event.status,'REJECTED');assert.equal(event.runId,result.started.runId);assert.equal(event.batchId,planned.batchId);assert.equal(event.actionId,'one');assert.equal(event.policy.kind,'UNTIL_IDENTITY_CHANGE');assert.equal(event.resumable,false);assert.equal(result.record.actions[0].memoryEventId,event.eventId);assert.equal(f.writes.length,1);assert.equal(f.history.unresolved('A'),false);await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);}finally{await f.cleanup();}
});

test('rejection survives Service restart and only a newly surveyed changed exact identity permits a new plan',async()=>{
 const f=fixture({outcome:'REJECTED'});let restarted;try{await f.execute(await f.plan());restarted=fixture({file:f.historyFile});await assert.rejects(restarted.plan(),{code:'REJECTION_MEMORY_ACTIVE'});restarted.rows.get('one').revision=2;const planned=await restarted.plan();assert.equal(planned.actions[0].identity.revision,2);assert.equal((await restarted.execute(planned)).status.finalStatus,'SUCCESS');assert.equal(restarted.store.list('A').length,1);assert.equal(restarted.writes.length,1);}finally{await restarted?.cleanup();await f.cleanup();}
});

test('rejection does not contaminate another account or another target',async()=>{
 const f=fixture({outcome:'REJECTED'});try{await f.execute(await f.plan());assert.equal((await f.plan(['two'])).actions[0].actionId,'two');const other=f.session('B');assert.equal((await f.plan(['one'],other)).actions.length,1);assert.deepEqual(f.service.executionMemory('B').events,[]);}finally{await f.cleanup();}
});

test('a fresh refusal arriving after authorization blocks shared executor before game transport',async()=>{
 const f=fixture();try{const planned=await f.plan(),permit=f.authorize(planned);let recorded=false;f.onSurvey(()=>{if(!recorded){recorded=true;f.store.record('A',f.rejectEvent());}});const result=await f.execute(planned,f.account,permit);assert.equal(result.status.finalStatus,'NOT_EXECUTED');assert.equal(f.writes.length,0);assert.equal(result.record.actions[0].dispatched,false);}finally{await f.cleanup();}
});

test('memory is rechecked after resource preflight and immediately before shared transport',async()=>{
 const f=fixture();try{const planned=await f.plan(),permit=f.authorize(planned);f.account.client.onRead=name=>{if(name==='AllResourceRequest')f.store.record('A',f.rejectEvent());};const result=await f.execute(planned,f.account,permit);assert.equal(f.writes.length,0);assert.equal(result.status.finalStatus,'NOT_EXECUTED');assert.equal(result.record.actions[0].dispatched,false);}finally{await f.cleanup();}
});

test('UNKNOWN writes retain original History and budget, supplemental audit and no automatic retry',async()=>{
 const f=fixture({outcome:'UNKNOWN'});try{const result=await f.execute(await f.plan()),event=f.service.executionMemory('A').events[0];assert.equal(result.record.actions[0].result,'UNKNOWN');assert.equal(event.status,'UNKNOWN');assert.equal(event.policy.kind,'HISTORY_RECONCILIATION');assert.equal(event.historyOrigin.status,'STILL_UNKNOWN');assert.equal(result.record.runBudget.reserved.resources[0].num,1);await assert.rejects(f.plan());assert.equal(f.writes.length,1);assert.equal(f.store.list('A').length,1);}finally{await f.cleanup();}
});

for(const status of ['APPLIED','NOT_APPLIED'])test('original History '+status+' resolves its UNKNOWN audit without rewriting outcome or creating a permanent memory lock',async()=>{
 const f=fixture({outcome:'UNKNOWN'});let restarted;try{const result=await f.execute(await f.plan()),original=f.history.list('A')[0];f.history.appendReconciliation('A',result.started.runId,'one',{status,timestamp:new Date().toISOString(),evidence:{method:'synthetic original History authority'}});const after=f.history.list('A')[0];assert.equal(after.actions[0].result,'UNKNOWN');assert.deepEqual(after.resourceBudget,original.resourceBudget);assert.equal(f.service.executionMemory('A').events[0].historyOrigin.status,status);assert.equal(f.service.executionMemory('A').events[0].status,'UNKNOWN');restarted=fixture({file:f.historyFile});assert.equal((await restarted.plan()).actions.length,1);assert.equal(restarted.writes.length,0);assert.equal(restarted.store.list('A').length,1);}finally{await restarted?.cleanup();await f.cleanup();}
});

test('an orphan UNKNOWN audit remains blocked without any History or transport repair',async()=>{
 const f=fixture();try{f.store.record('A',f.rejectEvent({status:'UNKNOWN',unresolvedWrite:true}));await assert.rejects(f.plan(),{code:'MEMORY_ORIGIN_UNRESOLVED'});assert.equal(f.writes.length,0);assert.deepEqual(f.history.list('A'),[]);}finally{await f.cleanup();}
});

test('failure writing memory stops later actions while preserving the definite original outcome and budget',async()=>{
 const f=fixture({outcome:'REJECTED',memoryFailure:true});try{const result=await f.execute(await f.plan(['one','two']));assert.equal(result.record.actions[0].result,'REJECTED');assert.equal(result.record.actions[1].requestStatus,'NOT_DISPATCHED');assert.equal(result.record.memoryPersistence.status,'FAILED');assert.equal(f.writes.length,1);assert.equal(f.service.executionMemory('A').pendingHistoryProjection.length,1);assert.equal(f.service.status('A').blocked,true);await assert.rejects(f.plan(),{code:'MEMORY_UNAVAILABLE'});assert.equal(f.writes.length,1);f.fail(false);await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.store.list('A').length,1);}finally{await f.cleanup();}
});

test('History-first crash window is read-only visible and synchronized before any new dispatch',async()=>{
 const f=fixture({outcome:'REJECTED',memoryFailure:true});let restarted;try{await f.execute(await f.plan());assert.equal(fs.existsSync(f.memoryFile),false);const bytes=fs.readFileSync(f.historyFile,'utf8');restarted=fixture({file:f.historyFile});assert.equal(restarted.service.executionMemory('A').pendingHistoryProjection.length,1);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);await assert.rejects(restarted.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(restarted.writes.length,0);assert.equal(restarted.store.list('A').length,1);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);}finally{await restarted?.cleanup();await f.cleanup();}
});

test('memory corruption or disappearance after a refusal fails closed before another dispatch',async()=>{
 for(const erase of [false,true]){const f=fixture({outcome:'REJECTED'});try{await f.execute(await f.plan());if(erase)fs.unlinkSync(f.memoryFile);else fs.writeFileSync(f.memoryFile,'{truncated');await assert.rejects(f.plan(),{code:'MEMORY_UNAVAILABLE'});assert.equal(f.writes.length,1);if(!erase)assert.equal(fs.readFileSync(f.memoryFile,'utf8'),'{truncated');}finally{await f.cleanup();}}
});

test('Workflow correlation preserves old workflowId parent-run meaning and adds graph/node links',async()=>{
 const f=fixture({outcome:'REJECTED'});let runner;try{const graph={version:1,id:'named-graph',name:'Synthetic memory graph',nodes:[{id:'s',type:'START'},{id:'save-node',type:'ACTION',module:'fixture',selection:'one'},{id:'z',type:'STOP'}],edges:[{from:'s',to:'save-node'},{from:'save-node',to:'z'}]};runner=createWorkflowRunner({operations:f.service,modules:{fixture:f.adapter},getSession:()=>f.account,claim:(_id,runId,opts)=>f.service.claimWorkflow(f.account,runId,opts)});const paused=await runner.start('A',graph);assert.equal(paused.plan.workflowDefinitionId,'named-graph');assert.equal(paused.plan.workflowNodeId,'save-node');const result=await f.execute(paused.plan),event=f.service.executionMemory('A').events[0];assert.equal(result.record.workflowId,paused.runId);assert.equal(event.workflowId,paused.runId);assert.equal(event.nodeId,'save-node');assert.equal(event.historyOrigin.workflowDefinitionId,'named-graph');assert.equal(event.runId,result.started.runId);assert.equal(f.service.executionMemory('A',{runId:result.started.runId}).events.length,1);assert.equal(f.service.executionMemory('A',{nodeId:'missing'}).events.length,0);}finally{runner?.stop();await runner?.settle();await f.cleanup();}
});

test('read-only memory query rejects arbitrary filters and never imports proof or expiry from caller input',async()=>{
 const f=fixture();try{for(const filters of [{proof:{}},{policy:{kind:'COOLDOWN'}},{runId:''},{status:0}])assert.throws(()=>f.service.executionMemory('A',filters));assert.deepEqual(f.service.executionMemory('A').policyCoverage,{identityChange:true,cooldown:false,gameDay:false});assert.deepEqual(fs.readdirSync(f.dir),[]);assert.equal(f.writes.length,0);}finally{await f.cleanup();}
});


test('a crash before result persistence keeps durable DISPATCHING authority and cannot create a false successful memory',async()=>{
 const f=fixture({outcome:'REJECTED'});let restarted;try{f.onPut(run=>{if(run.actions.some(row=>row.result==='REJECTED'))throw Object.assign(Error('synthetic result history crash'),{code:'HISTORY_UNAVAILABLE'});});await f.execute(await f.plan());assert.equal(f.writes.length,1);assert.equal(f.store.list('A').length,0);restarted=fixture({file:f.historyFile});await assert.rejects(restarted.plan(),{code:'RECOVERY_UNCERTAIN'});assert.equal(restarted.writes.length,0);assert.equal(restarted.store.list('A')[0].status,'UNKNOWN');assert.equal(restarted.history.list('A')[0].actions[0].result,'UNKNOWN');}finally{await restarted?.cleanup();await f.cleanup();}
});

test('identity changing after authorization to a previously rejected identity still prevents dispatch',async()=>{
 const f=fixture();try{f.store.record('A',f.rejectEvent());f.rows.get('one').revision=2;const planned=await f.plan(),permit=f.authorize(planned);f.rows.get('one').revision=1;const result=await f.execute(planned,f.account,permit);assert.equal(result.status.finalStatus,'NOT_EXECUTED');assert.equal(f.writes.length,0);}finally{await f.cleanup();}
});

test('old complete History without optional memory links remains readable and no proof is invented',async()=>{
 const f=fixture();try{f.history.put({runId:'legacy',accountId:'A',finalStatus:'SUCCESS',actions:[{actionId:'legacy-action',requestStatus:'SUCCESS',result:'SUCCESS',verification:{status:'CONFIRMED'}}]});const bytes=fs.readFileSync(f.historyFile,'utf8');assert.equal((await f.plan()).actions.length,1);assert.deepEqual(f.service.executionMemory('A').events,[]);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);}finally{await f.cleanup();}
});

test('supplemental rejection cannot shadow an unresolved UNKNOWN from a different original History action',async()=>{
 const f=fixture({outcome:'UNKNOWN'});try{await f.execute(await f.plan());f.store.record('A',f.rejectEvent({target:{id:'two'},actionId:'two'}));await assert.rejects(f.plan(['two']));assert.equal(f.writes.length,1);assert.equal(f.store.list('A').filter(event=>event.status==='UNKNOWN').length,1);}finally{await f.cleanup();}
});


test('definite unconfirmed RATE_LIMITED retains the original result but gains UNKNOWN-only supplemental audit',async()=>{
 const f=fixture();try{f.history.put({runId:'limited-run',accountId:'A',module:'fixture',executionContext:{generation:1},planSummary:{batchId:'limited-batch'},finalStatus:'RATE_LIMITED',actions:[{module:'fixture',actionId:'one',actionType:'SAVE',target:{id:'one'},identity:{revision:1},beforeState:{revision:1},requestStatus:'RATE_LIMITED',result:'RATE_LIMITED',dispatched:true,unresolvedWrite:true}]});await assert.rejects(f.plan(),{code:'RECOVERY_UNCERTAIN'});const event=f.service.executionMemory('A').events[0];assert.equal(event.status,'UNKNOWN');assert.equal(f.history.list('A')[0].actions[0].result,'RATE_LIMITED');assert.equal(event.historyOrigin.status,'STILL_UNKNOWN');assert.equal(f.service.blocked('A'),true);assert.equal(f.writes.length,0);}finally{await f.cleanup();}
});

test('an UNKNOWN event cannot borrow a different identity origin reconciliation to unlock',async()=>{
 const f=fixture();try{f.history.put({runId:'prior-run',accountId:'A',module:'fixture',executionContext:{generation:1},planSummary:{batchId:'prior-batch'},finalStatus:'UNKNOWN',actions:[{module:'fixture',actionId:'one',actionType:'SAVE',target:{id:'one'},identity:{revision:2},requestStatus:'UNKNOWN',result:'UNKNOWN',dispatched:true,unresolvedWrite:true}]});f.history.appendReconciliation('A','prior-run','one',{status:'NOT_APPLIED',timestamp:new Date().toISOString(),evidence:{method:'synthetic authority for different identity'}});f.store.record('A',f.rejectEvent({status:'UNKNOWN',unresolvedWrite:true}));assert.equal(f.service.executionMemory('A').events[0].historyOrigin.status,'ORIGIN_MISMATCH');await assert.rejects(f.plan(),{code:'MEMORY_ORIGIN_UNRESOLVED'});assert.equal(f.service.blocked('A'),true);assert.equal(f.writes.length,0);}finally{await f.cleanup();}
});

function unifiedIntent(entry,moduleId='task-rewards',rounds=1){
 const budget={resources:[{id:'wood',num:2}],quotas:[],uids:[]};
 return entry==='tasks'?{entry,tasks:[{kind:'main',taskId:1}],budget}:entry==='dailies'?{entry,dailies:[{taskId:1006}],budget}:{entry,tasks:moduleId==='task-rewards'?[{kind:'main',taskId:1}]:[],dailies:moduleId==='free-gold'?[{taskId:1006}]:[],rounds,budget};
}
function unifiedRunner(f){return createWorkflowRunner({operations:f.service,modules:f.service.modules,getSession:()=>f.account,claim:(_id,runId,options)=>f.service.claimWorkflow(f.account,runId,options)});}
for(const entry of ['tasks','dailies','loop'])test('unified '+entry+' uses the shared authorization, parent budget and durable exact-node history',async()=>{
 const moduleId=entry==='dailies'?'free-gold':'task-rewards',f=fixture({moduleId});let runner;
 try{f.rows.delete('two');runner=unifiedRunner(f);const {graph}=compileUnifiedExecution(unifiedIntent(entry,moduleId),{modules:f.service.modules});
 const paused=await runner.start('A',graph);assert.equal(paused.status,'AWAITING_AUTHORIZATION');assert.equal(f.writes.length,0);
 assert.equal((await runner.resume()).status,'AWAITING_AUTHORIZATION');
 const result=await f.execute(paused.plan);assert.equal(result.record.finalStatus,'SUCCESS');assert.equal(result.record.workflowId,paused.runId);
 assert.equal(result.record.workflowDefinitionId,graph.id);assert.equal(result.record.workflowNodeId,graph.nodes[1].id);
 assert.equal((await runner.resume()).status,'COMPLETED');assert.equal(f.writes.length,1);assert.equal(f.history.list('A').length,1);
 assert.equal(result.record.runBudget.reserved.resources[0].num,1);
 }finally{runner?.stop();await runner?.settle();await f.cleanup();}
});
test('Tasks refusal is shared with Loop after Service restart without automatic replay',async()=>{
 const f=fixture({moduleId:'task-rewards',outcome:'REJECTED'});let runner,restarted,next;
 try{f.rows.delete('two');runner=unifiedRunner(f);const paused=await runner.start('A',compileUnifiedExecution(unifiedIntent('tasks'),{modules:f.service.modules}).graph);
 const result=await f.execute(paused.plan);assert.equal(result.record.actions[0].result,'REJECTED');
 const stopped=await runner.resume();assert.equal(stopped.status,'FAILED');assert.equal(stopped.lastRun.finalStatus,'REJECTED');
 const joined=projectWorkflowExecutionHistory('A',{...stopped,workflowId:'unified-tasks'},f.history.list('A'));
 assert.equal(joined.unlinkedOperationCount,0);assert.equal(joined.nodes.length,1);assert.equal(joined.nodes[0].batches[0].finalStatus,'REJECTED');
 restarted=fixture({moduleId:'task-rewards',file:f.historyFile});restarted.rows.delete('two');next=unifiedRunner(restarted);
 const blocked=await next.start('A',compileUnifiedExecution(unifiedIntent('loop'),{modules:restarted.service.modules}).graph);
 assert.equal(blocked.status,'COMPLETED');assert.ok(blocked.trace.some(row=>row.result==='BLOCKED_REJECTION_MEMORY'));assert.match(blocked.reason,/阻塞/);
 assert.equal(restarted.writes.length,0);assert.equal(restarted.service.executionMemory('B').events.length,0);
 }finally{runner?.stop();next?.stop();await runner?.settle();await next?.settle();await restarted?.cleanup();await f.cleanup();}
});
test('Dailies UNKNOWN stops Loop and remains blocked after restart',async()=>{
 const f=fixture({moduleId:'free-gold',outcome:'UNKNOWN'});let runner,restarted,next;
 try{f.rows.delete('two');runner=unifiedRunner(f);
 const paused=await runner.start('A',compileUnifiedExecution(unifiedIntent('loop','free-gold',2),{modules:f.service.modules}).graph);
 await f.execute(paused.plan);assert.equal((await runner.resume()).status,'UNKNOWN');assert.equal(f.writes.length,1);
 restarted=fixture({moduleId:'free-gold',file:f.historyFile});restarted.rows.delete('two');next=unifiedRunner(restarted);
 await assert.rejects(next.start('A',compileUnifiedExecution(unifiedIntent('dailies','free-gold'),{modules:restarted.service.modules}).graph));
 assert.equal(restarted.writes.length,0);assert.equal(restarted.service.executionMemory('A').events[0].status,'UNKNOWN');
 }finally{runner?.stop();next?.stop();await runner?.settle();await next?.settle();await restarted?.cleanup();await f.cleanup();}
});

for(const entry of ['tasks','dailies','loop'])for(const outcome of ['SUCCESS','UNKNOWN'])for(const changed of ['connection','player','world'])test('unified '+entry+' cancels after '+changed+' replacement while preserving '+outcome+' History',async()=>{
 const moduleId=entry==='dailies'?'free-gold':'task-rewards',f=fixture({moduleId,outcome});let runner;
 try{f.rows.delete('two');runner=unifiedRunner(f);const paused=await runner.start('A',compileUnifiedExecution(unifiedIntent(entry,moduleId,entry==='loop'?2:1),{modules:f.service.modules}).graph);
 const result=await f.execute(paused.plan);assert.equal(result.record.finalStatus,outcome);assert.equal(f.writes.length,1);
 const historyBytes=fs.readFileSync(f.historyFile,'utf8'),memoryBefore=f.store.list('A');
 if(changed==='connection')f.account.connectionId='replacement-connection';if(changed==='player')f.account.player.playerId='other-role';if(changed==='world')f.account.player.worldId=2;assert.equal(runner.getLiveRunId(),null);
 const stopped=await runner.resume();assert.equal(stopped.status,'CANCELLED');assert.equal(stopped.plan,null);assert.equal(f.writes.length,1);
 assert.equal(fs.readFileSync(f.historyFile,'utf8'),historyBytes);assert.deepEqual(f.store.list('A'),memoryBefore);
 assert.equal(f.history.unresolved('A'),outcome==='UNKNOWN');assert.deepEqual(f.service.executionMemory('B').events,[]);
 }finally{runner?.stop();await runner?.settle();await f.cleanup();}
});
