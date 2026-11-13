import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-memory-api-'));
process.env.CW_DATA_DIR=dir;process.env.CW_CONFIG_PACK=path.join(dir,'absent-config.json');
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
const {createExecutionMemory}=await import('../src/execution-memory.mjs');
const token='synthetic-memory-api-token',sign='synthetic-memory-api-sign';
const account=id=>({id,label:'label-'+id,url:'wss://example.invalid',login:{eworldParams:{openId:id,token,sign,timestamp:1}}});
function harness(){
 saveStore({version:1,activeId:'A',accounts:[account('A'),account('B')]});let clients=0,collections=0;
 const app=createConsole({protocol:{},clientFactory(){clients++;throw Error('No Runtime/client allowed');},collect(){collections++;throw Error('No collector allowed');},tracePath:path.join(dir,'never-trace.log'),writerOwnership:{assertOwned(){return true;},release(){},claim(){return true;}}});
 app.server.address=()=>({port:17321});
 const request=(pathname='/api/operations/memory?account=A',{method='GET',headers={}}={})=>new Promise(resolve=>{const req=new EventEmitter();Object.assign(req,{url:pathname,method,headers:{host:'127.0.0.1:17321',origin:'http://127.0.0.1:17321',...headers}});const res={writeHead(code,head){this.code=code;this.headers=head;},end(text){resolve({status:this.code,data:JSON.parse(text),text,headers:this.headers});}};app.server.emit('request',req,res);req.emit('end');});
 return {...app,request,counts:()=>({clients,collections})};
}
const memoryFile=path.join(dir,'execution-memory.json');
const seed=()=>createExecutionMemory({file:memoryFile,secrets:()=>[token,sign]}).record('A',{module:'fixture',actionType:'SAVE',target:{id:'synthetic'},identity:{revision:1},source:'synthetic authoritative History',generation:1,runId:'audit-run',workflowId:'parent-run',nodeId:'node-a',batchId:'batch-a',actionId:'action-a',capabilityId:'cw.fixture',status:'REJECTED',dispatched:true,unresolvedWrite:false,reason:'synthetic refusal '+token});

test('production Console injects persistent owned memory and its same-origin GET never allocates Runtime or opens a listener',async()=>{
 const app=harness();try{assert.equal(app.server.listening,false);assert.equal(app.operations.executionMemory('A').available,true);const event=seed(),bytes=fs.readFileSync(memoryFile,'utf8');const result=await app.request();assert.equal(result.status,200);assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.data.events[0].eventId,event.eventId);assert.equal(result.data.resumable,false);assert.equal(result.data.retryAllowed,false);assert.equal(result.text.includes(token),false);assert.equal(result.text.includes(sign),false);assert.equal(fs.readFileSync(memoryFile,'utf8'),bytes);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.server.listening,false);}finally{await app.close();}
});

test('memory GET requires one exact stored account and isolates run/account selectors',async()=>{
 const app=harness();try{for(const [url,status]of [['/api/operations/memory',400],['/api/operations/memory?account=label-A',404],['/api/operations/memory?account=unknown',404],['/api/operations/memory?account=A&account=B',400]])assert.equal((await app.request(url)).status,status);assert.equal((await app.request('/api/operations/memory?account=B')).data.events.length,0);assert.equal((await app.request('/api/operations/memory?account=A&runId=audit-run')).data.events.length,1);assert.equal((await app.request('/api/operations/memory?account=A&runId=other')).data.events.length,0);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();}
});


test('original refusal projection gap is scoped to its account and exposed by readonly HTTP without inventing fields',async()=>{
 const app=harness();try{
  const {createExecutionHistory}=await import('../src/execution-history.mjs'),file=path.join(dir,'execution-history.json'),history=createExecutionHistory({file});
  history.put({accountId:'A',runId:'legacy-gap-http',module:'fixture',planSummary:{batchId:'gap-batch'},finalStatus:'REJECTED',actions:[{actionId:'gap-action',actionType:'SAVE',target:{id:'exact'},identity:{revision:1},requestStatus:'REJECTED',result:'REJECTED',unresolvedWrite:false}]});
  const original=fs.readFileSync(file,'utf8'),memory=fs.readFileSync(memoryFile,'utf8'),result=await app.request();
  assert.equal(result.status,200);const gaps=result.data.pendingHistoryProjection.filter(row=>row.projectable===false);assert.equal(gaps.length,1);assert.equal(gaps[0].runId,'legacy-gap-http');assert.equal(gaps[0].actionId,'gap-action');
  assert.equal(gaps[0].reason,'REJECTION_HISTORY_INCOMPLETE_OR_CONFLICTING');assert.equal(result.data.events.some(event=>event.runId==='legacy-gap-http'),false);assert.equal(result.data.retryAllowed,false);
  assert.equal((await app.request('/api/operations/memory?account=B')).data.pendingHistoryProjection.length,0);
  assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(fs.readFileSync(memoryFile,'utf8'),memory);assert.deepEqual(app.counts(),{clients:0,collections:0});assert.equal(app.sessions.size,0);assert.equal(result.text.includes(token),false);assert.equal(result.text.includes(sign),false);
 }finally{await app.close();}
});

test('memory HTTP interface admits only local readonly GET and never accepts memory writes, proofs or expiry policies',async()=>{
 const app=harness();try{for(const headers of [{origin:'https://attacker.invalid'},{host:'attacker.invalid'},{'sec-fetch-site':'cross-site'}])assert.equal((await app.request(undefined,{headers})).status,403);for(const url of ['/api/operations/memory','/api/operations/memory/record','/api/operations/memory/clear','/api/operations/memory/proof'])assert.equal((await app.request(url+'?account=A',{method:'POST'})).status,403);for(const filter of ['proof=forged','policy=COOLDOWN','__proto__=x','runId=a&runId=b','runId='])assert.equal((await app.request('/api/operations/memory?account=A&'+filter)).status,400);assert.equal(app.sessions.size,0);assert.deepEqual(app.counts(),{clients:0,collections:0});}finally{await app.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
