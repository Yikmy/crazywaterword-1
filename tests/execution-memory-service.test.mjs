import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
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
function fixture({outcome='SUCCESS',file=null,memoryFailure=false,moduleId='fixture',domain=null}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-memory-service-')),historyFile=file??path.join(dir,'history.json'),memoryFile=path.join(path.dirname(historyFile),path.basename(historyFile)+'.memory.json');
 const durable=createExecutionHistory({file:historyFile}),store=createExecutionMemory({file:memoryFile});
 let fail=memoryFailure,beforePut=null,onSurvey=null;
 const memory={...store,record(...args){if(fail)throw Object.assign(Error('synthetic memory write unavailable'),{code:'MEMORY_UNAVAILABLE'});return store.record(...args);}};
 const history={...durable,put(record){beforePut?.(record);return durable.put(record);}};
 const protocol=Object.fromEntries(['AllItemRequest','AllItemResponse','AllResourceRequest','AllResourceResponse','SaveFormationRequest','SaveFormationResponse'].map(name=>[name,{}]));
 const rows=new Map(['one','two'].map(id=>[id,{revision:1,applied:false}])),writes=[],reads=[],clients=[];
 const candidate=(id,row)=>({actionId:id,actionType:'SAVE',target:{id},identity:{revision:row.revision},beforeState:{revision:row.revision},expectedState:{revision:row.revision+1},costs:[{id:'wood',num:1}],costSource:'synthetic authoritative exact cost',action:{request:'SaveFormationRequest',response:'SaveFormationResponse',body:{id,revision:row.revision}}});
 const adapter=domain?GAMEPLAY_MODULES[moduleId]:{id:moduleId,defaultConfig:{enabled:true},async survey(client){onSurvey?.(client);return {stockReliable:true,stock:new Map([['wood',client.stock]]),rows:structuredClone(rows)};},view(facts){return {candidates:[...facts.rows].map(([id,row])=>candidate(id,row))};},plan(facts,{selections=[],ledger}){return {actions:selections.map(id=>candidate(id,facts.rows.get(id))).filter(op=>ledger.reserve(op.costs))};},verify(op,before,after){return {confirmed:after.rows.get(op.target.id).revision===before.rows.get(op.target.id).revision+1,afterState:after.rows.get(op.target.id)};}};
 if(domain)for(const name of [...Object.keys(domain.answers),...domain.writes]){protocol[name]={};protocol[name.replace('Request','Response')]={};}
 const service=createOperationService({protocol,history,memory,getConfig:()=>domain?.config??({}),loadRules:()=>({config:domain?.rules??{version:1,enabled:false,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false,onlyShortages:true,productIds:[],maxOperations:10}}),modules:{[moduleId]:adapter},moduleSettings:{get:()=>({config:domain?.settings??{enabled:true}})}});
 function session(id='A') {const client={connected:true,stock:10,pending:[],watchers:[],lateResponses:new Set(),uncertainWrites:new Set(),onRead:null,async request(name,body,_response,_timeout,options){if(options?.mutate){writes.push({id,name,body:structuredClone(body),durable:durable.list(id)[0]});if(outcome==='REJECTED')throw Object.assign(Error('synthetic definite refusal'),{code:'REJECTED'});if(outcome==='SUCCESS'){rows.get(body.id).revision++;this.stock--;}return {}; }reads.push({id,name});this.onRead?.(name);if(domain){if(!Object.hasOwn(domain.answers,name))throw Error('Unexpected domain read '+name);return structuredClone(domain.answers[name]);}if(name==='AllItemRequest')return {items:[{itemId:'wood',num:this.stock}]};if(name==='AllResourceRequest')return {list:[]};throw Error('Unexpected read '+name);},async sendWatch(name,body){return this.request(name,body,null,null,{mutate:true});},gameClock:domain?.gameClock,markUnverifiedWrite(name,body){this.uncertainWrites.add(JSON.stringify({name,body}));},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));}};clients.push(client);return {id,state:'READY',generation:1,connectionId:'synthetic-'+id,player:domain?{id:'1',playerId:'1',worldId:2001000000,level:30,mainlineStage:101}:{playerId:id,worldId:1},client,abort:new AbortController(),busy:null,loop:{running:false}};}
 const account=session();
 const plan=async(ids,target=account)=>{if(!ids){if(domain){const surveyed=await service.surveyModule(target,moduleId,domain.parameters??{});const row=surveyed.view.candidates.find(row=>row.executable===true||row.decision==='READY'||row.action);assert.ok(row,'real domain candidate required');ids=[row.actionId];}else ids=['one'];}return service.plan(target,{module:moduleId,mode:ids.length===1?'Manual':'Automatic',selections:ids,parameters:domain?.parameters??{}},{workflowId:target.workflowOwner??null});};
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
 const filtered=restarted.service.executionMemory('A',{runId:'not-the-unknown-run'});assert.deepEqual(filtered.events,[]);assert.deepEqual(filtered.pendingHistoryProjection,[]);
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

// Real domain surveys/planners run through the existing shared Service fixture.
// Every read and write stays in-process; definite refusals never mutate facts.
function refusalDomain(id){
 const now=300000,gameClock={read:()=>({status:'TRUSTED',reliable:true,nowMs:now*1000,earliestMs:now*1000,latestMs:now*1000})};
 const base={gameClock,config:{tables:{}},settings:{enabled:true},answers:{AllItemRequest:{items:[]},AllResourceRequest:{list:[]}},writes:[]};
 const fleet={buildingId:'fleet-a',state:1,durability:1900,maxDura:2000,cityId:1,targetCityId:0,treasureLootUid:0,repairing:null,autoFight:{isOn:false,todayTimes:0}};
 if(['orders','city','production'].includes(id))return {...base,rules:{version:1,enabled:true,rules:[]},config:{tables:{BuildingCfg:{data:[{buildingType:'民居'},{buildingType:'材料厂'}]},BuildingUpgradeCfg:{data:[{buildingType:'民居',level:1,playerLevel:1,curPeople:0,consume:[['wood',1]],condition:[],effect:[],costTime:0}]},WorkerOrderCfg:{data:[{itemId:'wood',reward:[['EXP',100]]}]},BuildingProduceCfg:{data:[{buildType:'材料厂',itemId:'bread',unlockLevel:1,produceTime:60,costItem:[['wood',1]]}]},GameParamCfg:{data:[{paramName:'产品存量初始上限',paramValue:50}]},BuildingProduceParamCfg:{data:[{paramName:'制造位上限',paramValue:6}]}}},answers:{...base.answers,AllItemRequest:{items:[{itemId:'wood',num:10},{itemId:'bread',num:0}]},OnWaterRequest:{workerOrder:[{index:0,workerId:'resident',textId:1,isSpecial:false,refreshTime:0,requirements:[{id:'wood',num:2}]}],orderOfTheDay:{orderNum:3},building:[{buildingId:'1民居',level:0,buildStartTime:0,buildFinishTime:0,product:{asset:[]}},{buildingId:'1材料厂',level:1,buildStartTime:0,buildFinishTime:0,product:{asset:[]},factory:{autoProductId:'',factoryQ:[],finishedProducts:[]}}]},MyResFieldsRequest:{info:{fields:[]}},MyFleetsRequest:{fleets:[]}},writes:['FinishWorkerOrderRequest','BuildBuildingRequest','StartFactoryProduceRequest']};
 if(id==='formation')return {...base,parameters:{presetId:2},config:{tables:{HeroCfg:{data:[{id:'hero',career:'坦克'}]},FormationHeroNumCfg:{data:[{heroNum:1,mainlineStage:0}]},FormationTypePositionCfg:{data:[{id:1,position:[1,1]},{id:2,position:[2,2]}]}}},answers:{...base.answers,GetFormationRequest:{formation:{presetId:1,heroPositions:[{heroId:'hero',pos:{x:1,y:1}}]}},MyFormationPresetRequest:{ids:[2]},AllHeroRequest:{heroes:[{heroId:'hero'}]}},writes:['SaveFormationRequest']};
 if(id==='alliance')return {...base,settings:{enabled:true,welfare:true},answers:{...base.answers,GuildInfoRequest:{guild:{guildId:'10',welfarePack:[{id:'9',createTime:now-1}],gotWelfareTime:0}},GuildMemberRequest:{titleList:[]},GuildAidListRequest:{askItems:[]},MyGuildAidRequest:{aids:[]},GuildOrderRequest:{},GuildCityInfoRequest:{cities:[]},CounterInfoRequest:{counters:[]}},writes:['GotGuildWelfarePackRequest']};
 if(id==='museum')return {...base,settings:{enabled:true,collection:true},config:{tables:{MuseumAchievementCfg:{data:[{score:100,rewards:[['wood',2]]}]}}},answers:{...base.answers,MuseumInfoRequest:{uncollectedRevenue:0,topPopularity:100,claimedAchievements:[],exhibitions:[],exploreStages:[]},AllAntiqueRequest:{antiques:[]},AllHeroRequest:{heroes:[]},AllItemRequest:{items:[{itemId:'wood',num:10}]}},writes:['MuseumClaimAchievementRequest']};
 if(id==='treasure')return {...base,parameters:{uid:7,fleetBuildingIds:['fleet-a']},settings:{enabled:true,dispatch:true},config:{tables:{WorldParamCfg:{data:[{paramName:'进攻宝藏消耗汽油',paramValue:500}]},GameplayOpenCfg:{data:[{gameplay:'世界宝藏',openDays:[3,1,1]}]}}},answers:{...base.answers,AllItemRequest:{items:[{itemId:'汽油',num:2000}]},MyFleetsRequest:{fleets:[fleet]},TreasureLootRankRequest:{items:[]},TreasureLootDefenceRequest:{fleets:[]},TreasureLootStatsRequest:{todayRewardTimes:0,totalRewardTimes:3},TreasureLootListRequest:{treasure:[{uid:7,color:5,ownerGuildIdx:0,ownerFleetNum:0,progress:0,gridIdx:1}]},SeasonRankInfoRequest:{startTime:100000,endTime:1000000}},writes:['TreasureLootSendFleetsRequest']};
 if(id==='fleet')return {...base,settings:{enabled:true,cargoFill:true},answers:{...base.answers,MyFleetsRequest:{fleets:[]},WorldInfoRequest:{cities:[]},GuildInfoRequest:{},AllItemRequest:{items:[{itemId:'wood',num:10}]},CargoShipsRequest:{ship:[{index:1,status:0,arriveTime:0,orderItem:[{filled:false,asset:{type:0,id:'wood',num:4},reward:{asset:[{type:1,id:'EXP',num:2}]}}],reward:[{type:0,id:'wood',num:3}]}]}},writes:['FillCargoShipRequest']};
 throw Error('Unknown synthetic domain');
}
for(const moduleId of ['formation','alliance','museum','treasure','fleet','orders','city','production'])test('W19 real '+moduleId+' refusal isolates world and role while surviving reconnect and restart',async()=>{
 const domain=refusalDomain(moduleId),f=fixture({moduleId,domain,outcome:'REJECTED'});let restarted;
 try{const result=await f.execute(await f.plan());assert.equal(result.record.finalStatus,'REJECTED',JSON.stringify(result.record.actions));assert.equal(f.writes.length,1);const bytes=fs.readFileSync(f.historyFile,'utf8');
 f.account.generation++;f.account.connectionId+='-replacement';await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});
 for(const field of ['worldId','playerId']){const prior=f.account.player[field];f.account.player[field]=field==='worldId'?2001000001:'2';assert.equal((await f.plan()).actions.length,1);f.account.player[field]=prior;await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});}
 assert.equal((await f.plan(undefined,f.session('B'))).actions.length,1);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);
 restarted=fixture({moduleId,domain,file:f.historyFile});await assert.rejects(restarted.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(restarted.writes.length,0);assert.equal(f.writes.length,1);
 }finally{await restarted?.cleanup();await f.cleanup();}
});

for(const moduleId of ['formation','alliance','museum','treasure','fleet','orders','city','production'])test('W19 registered '+moduleId+' requires changed authoritative business facts for a fresh plan',async()=>{
 const domain=refusalDomain(moduleId),f=fixture({moduleId,domain,outcome:'REJECTED'});try{await f.execute(await f.plan());await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});
 const original=structuredClone(domain.answers);if(moduleId==='orders')domain.answers.OnWaterRequest.workerOrder[0].workerId='replacement-resident';if(moduleId==='city')domain.answers.OnWaterRequest.building[0].product.asset=[{id:'wood',num:1}];if(moduleId==='production')domain.answers.OnWaterRequest.building[1].product.asset=[{id:'wood',num:1}];if(moduleId==='formation')domain.answers.GetFormationRequest.formation.heroPositions[0].pos={x:2,y:2};if(moduleId==='alliance')domain.answers.GuildInfoRequest.guild.gotWelfareTime=1;if(moduleId==='museum')domain.answers.MuseumInfoRequest.topPopularity=101;if(moduleId==='treasure')domain.answers.TreasureLootStatsRequest.todayRewardTimes=1;if(moduleId==='fleet')domain.answers.CargoShipsRequest.ship[0].orderItem[0].asset.num=5;
 assert.equal((await f.plan()).actions.length,1);domain.answers=original;await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);
 }finally{await f.cleanup();}
});
for(const moduleId of ['formation','alliance','museum','treasure','fleet','orders','city','production'])test('W19 registered '+moduleId+' incomplete original context cannot release a refusal',async()=>{
 const domain=refusalDomain(moduleId),f=fixture({moduleId,domain,outcome:'REJECTED'});try{const result=await f.execute(await f.plan());const original=f.history.list('A')[0];delete original.executionContext;f.history.put(original);f.account.player.worldId=2001000001;await assert.rejects(f.plan(),{code:'MEMORY_EVENT_CONFLICT'});assert.equal(f.writes.length,1);assert.equal(f.history.list('A')[0].runId,result.started.runId);
 }finally{await f.cleanup();}
});
for(const moduleId of ['formation','alliance','museum','treasure','fleet','orders','city','production'])test('W19 registered '+moduleId+' UNKNOWN survives restart and world changes without replay',async()=>{
 const domain=refusalDomain(moduleId),f=fixture({moduleId,domain,outcome:'UNKNOWN'});let restarted;try{const result=await f.execute(await f.plan());assert.equal(result.record.finalStatus,'UNKNOWN');assert.equal(f.writes.length,1);const bytes=fs.readFileSync(f.historyFile,'utf8');restarted=fixture({moduleId,domain,file:f.historyFile});restarted.account.player.worldId=2001000001;await assert.rejects(restarted.plan());assert.equal(restarted.writes.length,0);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);assert.equal(restarted.history.unresolved('A'),true);
 }finally{await restarted?.cleanup();await f.cleanup();}
});

for(const [moduleId,field]of [['orders','ruleResult'],['city','expectedState'],['production','expectedState']])test('W19 core '+moduleId+' missing original '+field+' cannot release rejection',async()=>{
 const domain=refusalDomain(moduleId),f=fixture({moduleId,domain,outcome:'REJECTED'});try{await f.execute(await f.plan());const original=f.history.list('A')[0];delete original.actions[0][field];f.history.put(original);f.account.player.worldId=2001000001;await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,1);}finally{await f.cleanup();}
});

async function seedIncompleteRefusal(f,change){
 const plan=await f.plan(),row={...structuredClone(plan.actions[0]),requestStatus:'REJECTED',result:'REJECTED',dispatched:true,unresolvedWrite:false};
 const run={accountId:'A',runId:'legacy-incomplete-refusal',module:f.adapter.id,executionContext:{accountId:'A',playerId:'A',worldId:1,generation:1,connectionId:'synthetic-A'},planSummary:{batchId:'legacy-batch'},finalStatus:'REJECTED',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),actions:[row]};
 change(run,row);f.history.put(run);return {run,row};
}
for(const field of['dispatched','unresolvedWrite','target','actionType','module','identity','batchId','actionId'])test('legacy definite refusal missing '+field+' cannot disappear from shared decision protection',async()=>{
 const f=fixture();try{
  await seedIncompleteRefusal(f,(run,row)=>{
   if(field==='module'){delete run.module;delete row.module;}
   else if(field==='identity'){delete row.identity;delete row.beforeState;}
   else if(field==='batchId')delete run.planSummary;
   else delete row[field];
  });
  const bytes=fs.readFileSync(f.historyFile,'utf8');await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});
  const audit=f.service.executionMemory('A');assert.equal(audit.events.length,0);assert.equal(audit.pendingHistoryProjection.length,1);assert.equal(audit.pendingHistoryProjection[0].projectable,false);
  assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);assert.equal(f.writes.length,0);assert.equal(fs.existsSync(f.memoryFile),false);
  assert.equal((await f.plan(['one'],f.session('B'))).actions.length,1);assert.equal(f.writes.length,0);
 }finally{await f.cleanup();}
});
test('incomplete refusal blocks its known target while another exact target still uses shared authorization',async()=>{
 const f=fixture();try{
  await seedIncompleteRefusal(f,(_run,row)=>delete row.dispatched);const bytes=fs.readFileSync(f.historyFile,'utf8');
  await assert.rejects(f.plan(['one']),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);
  const plan=await f.plan(['two']);assert.equal(plan.actions.length,1);assert.equal((await f.execute(plan)).record.finalStatus,'SUCCESS');assert.equal(f.writes.length,1);assert.equal(f.writes[0].body.id,'two');
 }finally{await f.cleanup();}
});
for(const variant of['request-conflict','result-conflict'])test('contradictory original refusal '+variant+' retains scoped protection without a fabricated memory event',async()=>{
 const f=fixture();try{
  await seedIncompleteRefusal(f,(_run,row)=>{if(variant==='request-conflict')row.requestStatus='SUCCESS';else row.result='SUCCESS';});
  await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.store.list('A').length,0);assert.equal(f.writes.length,0);
 }finally{await f.cleanup();}
});
test('legacy refusal gap survives Service restart and business changes without inferring missing transport facts',async()=>{
 const f=fixture();let restarted;try{
  await seedIncompleteRefusal(f,(_run,row)=>delete row.dispatched);restarted=fixture({file:f.historyFile});restarted.rows.get('one').revision=2;restarted.account.generation=9;restarted.account.connectionId='new-connection';
  await assert.rejects(restarted.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal((await restarted.plan(['two'])).actions.length,1);assert.equal(restarted.store.list('A').length,0);assert.equal(restarted.writes.length,0);
 }finally{await restarted?.cleanup();await f.cleanup();}
});
test('incomplete refusal appearing after authorization stops the shared executor before transport',async()=>{
 const f=fixture();try{
  const plan=await f.plan(),permit=f.authorize(plan);let seeded=false;
  f.onSurvey(()=>{if(seeded)return;seeded=true;f.history.put({accountId:'A',runId:'raced-incomplete-refusal',module:'fixture',planSummary:{batchId:'old-batch'},finalStatus:'REJECTED',actions:[{...structuredClone(plan.actions[0]),result:'REJECTED',requestStatus:'REJECTED',unresolvedWrite:false}]});});
  const result=await f.execute(plan,f.account,permit);assert.equal(result.record.finalStatus,'NOT_EXECUTED');assert.equal(f.writes.length,0);assert.equal(result.record.actions[0].dispatched,false);
 }finally{await f.cleanup();}
});

for(const entry of['tasks','dailies','loop'])test('unified '+entry+' retains incomplete original refusal without new authorization or dispatch',async()=>{
 const moduleId=entry==='dailies'?'free-gold':'task-rewards',f=fixture({moduleId});let runner;
 try{
  f.rows.delete('two');await seedIncompleteRefusal(f,(_run,row)=>delete row.dispatched);const bytes=fs.readFileSync(f.historyFile,'utf8');
  assert.deepEqual(f.service.executionMemory('A',{runId:'not-the-refused-run'}).pendingHistoryProjection,[]);
  runner=unifiedRunner(f);const state=await runner.start('A',compileUnifiedExecution(unifiedIntent(entry,moduleId),{modules:f.service.modules}).graph);
  assert.equal(state.status,'COMPLETED');assert.ok(state.trace.some(row=>row.result==='BLOCKED_REJECTION_MEMORY'));assert.equal(state.plan,null);assert.equal(f.writes.length,0);assert.equal(f.store.list('A').length,0);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);
 }finally{runner?.stop();await runner?.settle();await f.cleanup();}
});

for(const moduleId of['formation','production'])test('registered '+moduleId+' retains incomplete refusal including the original city/production alias',async()=>{
 const f=fixture({moduleId,domain:refusalDomain(moduleId)});try{
  const seeded=await seedIncompleteRefusal(f,(run,row)=>{delete row.dispatched;if(moduleId==='production'){run.module='city';row.module='city';}});
  if(moduleId==='production')assert.equal(seeded.row.actionType,'startProduce');
  const bytes=fs.readFileSync(f.historyFile,'utf8');await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,0);assert.equal(f.store.list('A').length,0);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);
 }finally{await f.cleanup();}
});

test('readonly memory filters include pending and incomplete original History with exact original correlation only',async()=>{
 const f=fixture();try{
  const {run}=await seedIncompleteRefusal(f,(run,row)=>{run.workflowId='workflow-gap';run.workflowNodeId='node-gap';row.capabilityId='cw.gap';delete row.dispatched;});
  const other=structuredClone(run);other.runId='pending-complete';other.workflowId='workflow-complete';other.workflowNodeId='node-complete';other.planSummary.batchId='complete-batch';other.actions[0].actionId='complete-action';other.actions[0].capabilityId='cw.complete';other.actions[0].dispatched=true;f.history.put(other);
  const historyBytes=fs.readFileSync(f.historyFile,'utf8'),audit=f.service.executionMemory('A');assert.equal(audit.events.length,0);assert.equal(audit.pendingHistoryProjection.length,2);
  for(const [key,value,expected] of [['runId',run.runId,run.runId],['workflowId','workflow-gap',run.runId],['nodeId','node-gap',run.runId],['batchId','legacy-batch',run.runId],['actionId','one',run.runId],['module','fixture',null],['status','REJECTED',null],['runId',other.runId,other.runId],['workflowId','workflow-complete',other.runId],['nodeId','node-complete',other.runId],['batchId','complete-batch',other.runId],['actionId','complete-action',other.runId]]){
   const shown=f.service.executionMemory('A',{[key]:value});assert.equal(shown.pendingHistoryProjection.length,expected?1:2,key);
   if(expected)assert.equal(shown.pendingHistoryProjection[0].runId,expected);
   assert.deepEqual(shown.events,[]);assert.equal(shown.retryAllowed,false);
  }
  for(const key of ['runId','workflowId','nodeId','batchId','actionId','module','status'])assert.deepEqual(f.service.executionMemory('A',{[key]:'missing'}).pendingHistoryProjection,[],key);
  assert.equal(f.service.executionMemory('A',{runId:run.runId,nodeId:'node-complete'}).pendingHistoryProjection.length,0);
  assert.deepEqual(f.service.executionMemory('B').pendingHistoryProjection,[]);assert.equal(fs.readFileSync(f.historyFile,'utf8'),historyBytes);assert.equal(fs.existsSync(f.memoryFile),false);assert.equal(f.writes.length,0);
 }finally{await f.cleanup();}
});

test('missing legacy correlation never borrows new run metadata for a filtered memory audit',async()=>{
 const f=fixture();try{
  await seedIncompleteRefusal(f,(_run,row)=>delete row.dispatched);const bytes=fs.readFileSync(f.historyFile,'utf8');
  for(const filters of [{workflowId:'new-workflow'},{nodeId:'new-node'},{runId:'legacy-incomplete-refusal',workflowId:'new-workflow'}])assert.deepEqual(f.service.executionMemory('A',filters).pendingHistoryProjection,[]);
  assert.equal(f.service.executionMemory('A').pendingHistoryProjection.length,1);await assert.rejects(f.plan(),{code:'REJECTION_MEMORY_ACTIVE'});assert.equal(f.writes.length,0);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);assert.equal(fs.existsSync(f.memoryFile),false);
 }finally{await f.cleanup();}
});

test('shared memory projects interrupted legacy UNKNOWN despite another account owning the same runId',async()=>{
 const f=fixture();try{
  const {run}=await seedIncompleteRefusal(f,(run,row)=>{run.finalStatus='EXECUTING';row.requestStatus='DISPATCHING';row.result='EXECUTING';row.dispatched=true;row.unresolvedWrite=true;});run.resourceBudget=[{id:'wood',num:8}];f.history.put(run);
  const owned=createExecutionHistory({file:f.historyFile}),other=structuredClone(run);other.accountId='B';other.executionContext.accountId='B';owned.put(other);
  const service=createOperationService({history:owned,memory:f.memory}),bytes=fs.readFileSync(f.historyFile,'utf8'),shown=service.executionMemory('A',{runId:run.runId});
  assert.equal(shown.events.length,0);assert.equal(shown.pendingHistoryProjection.length,1);assert.equal(shown.pendingHistoryProjection[0].status,'UNKNOWN');assert.equal(shown.retryAllowed,false);assert.equal(shown.resumable,false);
  assert.equal(owned.list('A')[0].finalStatus,'UNKNOWN');assert.equal(owned.unresolved('A'),true);assert.deepEqual(owned.list('A')[0].resourceBudget,[{id:'wood',num:8}]);assert.equal(owned.list('B')[0].finalStatus,'EXECUTING');assert.equal(service.executionMemory('B').pendingHistoryProjection.length,0);
  assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);assert.equal(fs.existsSync(f.memoryFile),false);assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);
 }finally{await f.cleanup();}
});

test('mixed legacy recovery projects only the truly uncertain action into shared memory and retains original confirmation',async()=>{
 const f=fixture();try{
  const {run}=await seedIncompleteRefusal(f,(run,row)=>{run.finalStatus='EXECUTING';row.requestStatus='VERIFY';row.result='SUCCESS';row.verification={status:'CONFIRMED'};row.dispatched=true;row.unresolvedWrite=false;});
  const pending={...structuredClone(run.actions[0]),actionId:'two',target:{id:'two'},result:'EXECUTING',requestStatus:'DISPATCHING',unresolvedWrite:true};delete pending.verification;run.actions.push(pending);run.resourceBudget=[{id:'wood',num:8}];f.history.put(run);
  const owned=createExecutionHistory({file:f.historyFile}),service=createOperationService({history:owned,memory:f.memory}),bytes=fs.readFileSync(f.historyFile,'utf8'),shown=service.executionMemory('A',{runId:run.runId});
  assert.equal(shown.pendingHistoryProjection.length,1);assert.equal(shown.pendingHistoryProjection[0].actionId,'two');assert.equal(shown.pendingHistoryProjection[0].status,'UNKNOWN');assert.deepEqual(owned.list('A')[0].actions[0],run.actions[0]);assert.equal(owned.unresolved('A'),true);assert.equal(fs.readFileSync(f.historyFile,'utf8'),bytes);assert.equal(fs.existsSync(f.memoryFile),false);
  owned.appendReconciliation('A',run.runId,'two',{status:'APPLIED',timestamp:'2026-11-14T00:00:00.000Z',evidence:{version:1,reasonCode:'SYNTHETIC_ONLY'}});
  assert.equal(owned.unresolved('A'),false);assert.equal(owned.list('A')[0].finalStatus,'UNKNOWN');assert.deepEqual(owned.list('A')[0].resourceBudget,run.resourceBudget);assert.equal(service.executionMemory('A').pendingHistoryProjection.length,1);assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);
 }finally{await f.cleanup();}
});
