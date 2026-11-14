import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cw-mail-api-'));process.env.CW_DATA_DIR=root;
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
const {loadProtocol}=await import('../src/proto.mjs');
const protocol=loadProtocol(),wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
const account=id=>({id,label:id,url:'wss://example.invalid',login:{eworldParams:{openId:id,token:'synthetic-mail-token',sign:'synthetic-mail-sign',timestamp:1}}});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
async function harness(){
  saveStore({version:1,activeId:'A',accounts:[account('A'),account('B')]});let creates=0,collects=0;const reads=[],writes=[],sessions={};
  const app=createConsole({port:0,protocol,clientFactory(){creates++;throw Error('no game client');},collect(){collects++;throw Error('no collector');},tracePath:path.join(root,'trace-'+Math.random()+'.log')});await app.listen();
  const origin='http://127.0.0.1:'+app.server.address().port;let csrf;
  const call=(route,{id='A',body}={})=>new Promise((resolve,reject)=>{const url=new URL(route,origin);url.searchParams.set('account',id);const req=http.request(url,{method:body===undefined?'GET':'POST',headers:{connection:'close','content-type':'application/json',origin,...(csrf?{'x-cw-csrf':csrf}:{})}},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>{const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:res.statusCode,data,text});});});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
  function ready(id){
    const client=Object.assign(new EventEmitter(),{connected:true,factContext:{accountId:id,generation:2,connectionId:'mail-'+id},pending:[],watchers:[],uncertainWrites:new Set(),lateResponses:new Map(),stop(){this.connected=false;},
      async request(name,body,response,_timeout,options){assert.equal(name,'EmailBoxRequest');assert.equal(response,'EmailBoxResponse');assert.equal(options?.mutate,undefined);wire(name,body);reads.push({id,body:structuredClone(body)});await sessions[id].onRead?.();return wire(response,sessions[id].mailPage?.(body)??{email:[{emailId:id==='A'?'9007199254740995':'9007199254740997',subject:id+' page '+body.pageNo,content:'private-content',sender:'private-sender',status:2,got:false}],total:37});},async sendWatch(...args){writes.push(args);throw Error('mail write forbidden');}});
    const session={id,client,player:{playerId:id==='A'?'9007199254740993':'9007199254740994',worldId:'17'},generation:2,connectionId:'mail-'+id,state:'READY',abort:new AbortController(),loop:{running:false,stop:{aborted:false}},busy:null,log:[]};sessions[id]=session;app.sessions.set(id,session);return session;
  }
  return {...app,call,ready,reads,writes,counts:()=>({creates,collects})};
}
test('HTTP registered mail only reads explicitly surveyed pages and isolates accounts without a client or collection',async()=>{
  const app=await harness();try{
    const cached=await app.call('/api/gameplay?module=mail');assert.equal(cached.status,200);assert.equal(cached.data.view,null);assert.equal(app.reads.length,0);
    app.ready('A');app.ready('B');
    for(const id of['A','B']){const result=await app.call('/api/gameplay/survey',{id,body:{module:'mail',parameters:{pageNo:id==='A'?2:4}}});assert.equal(result.status,200);assert.equal(result.data.view.page.pageNo,id==='A'?2:4);assert.equal(result.data.config.enabled,false);assert.equal(result.data.view.page.allPagesComplete,false);assert.equal(result.data.view.page.emails[0].read,false);assert.doesNotMatch(result.text,/private-content|private-sender/);}
    assert.equal((await app.call('/api/gameplay?module=mail')).data.view.page.emails[0].subject,'A page 2');assert.equal((await app.call('/api/gameplay?module=mail',{id:'B'})).data.view.page.emails[0].subject,'B page 4');
    const count=app.reads.length;
    for(const parameters of[{pageNo:-1},{pageNo:'1'},{pageNo:0,all:true},{emailId:['1']}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'mail',parameters}})).status,400);
    assert.equal(app.reads.length,count);
    assert.notEqual((await app.call('/api/operations/plan',{body:{module:'mail',mode:'Manual',parameters:{pageNo:2},selections:['all']}})).status,200);
    assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});
  }finally{await app.close();}
});
test('late page from replaced connection is cancelled and cannot replace cached mail facts',async()=>{
  const app=await harness();let release;
  try{
    app.ready('A');await app.call('/api/gameplay?module=mail');await app.call('/api/gameplay/survey',{body:{module:'mail',parameters:{pageNo:1}}});
    const session=app.sessions.get('A');session.onRead=()=>{session.generation++;session.client.factContext.generation++;};
    const late=await app.call('/api/gameplay/survey',{body:{module:'mail',parameters:{pageNo:2}}});assert.equal(late.data.code,'CANCELLED');
    assert.equal((await app.call('/api/gameplay?module=mail')).data.view.page.pageNo,1);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});
  }finally{release?.();await app.close();}
});

function mailboxResponse(total,base=100){return ({pageNo})=>({total,email:Array.from({length:Math.min(10,Math.max(0,total-pageNo*10))},(_,i)=>({emailId:String(base+pageNo*10+i),subject:'mail page '+pageNo,content:'private-content',sender:'private-sender',status:2,got:false,attachment:{assets:{asset:[]},heroes:[],equips:[],antiques:[]}}))});}
test('HTTP explicit mailbox enumeration stays bounded, read-only, private and account isolated',async()=>{
 const app=await harness();try{const a=app.ready('A'),b=app.ready('B');a.mailPage=mailboxResponse(21);b.mailPage=mailboxResponse(1,200);await app.call('/api/gameplay?module=mail');
 const result=await app.call('/api/gameplay/survey',{body:{module:'mail',parameters:{action:'enumerate',maxPages:3}}});assert.equal(result.status,200);assert.equal(result.data.view.mailbox.allPagesComplete,true);assert.equal(result.data.view.mailbox.atomicSnapshot,false);assert.equal(result.data.view.mailbox.emails.at(-1).pageNo,2);assert.equal(result.data.view.mailbox.emails.at(-1).emailId,'120');assert.doesNotMatch(result.text,/private-content|private-sender/);assert.deepEqual(app.reads.map(r=>r.body),[{pageNo:0},{pageNo:1},{pageNo:2}]);
 assert.equal((await app.call('/api/gameplay?module=mail',{id:'B'})).data.view,null);const other=await app.call('/api/gameplay/survey',{id:'B',body:{module:'mail',parameters:{action:'enumerate',maxPages:1}}});assert.equal(other.data.view.mailbox.emails[0].emailId,'200');assert.equal((await app.call('/api/gameplay?module=mail')).data.view.mailbox.emails[0].emailId,'100');
 const count=app.reads.length;for(const parameters of [{action:'enumerate',maxPages:101},{action:'enumerate',pageNo:0},{action:'enumerate',emailId:'100'},{action:'enumerate',all:true}])assert.equal((await app.call('/api/gameplay/survey',{body:{module:'mail',parameters}})).status,400);assert.equal(app.reads.length,count);
 const plan=await app.call('/api/operations/plan',{body:{module:'mail',mode:'Manual',parameters:{action:'enumerate',maxPages:3},selections:['all']}});assert.notEqual(plan.status,200);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});
 }finally{await app.close();}
});
test('HTTP partial mailbox never silently retries and cancelled enumeration preserves prior account cache',async()=>{
 const app=await harness();try{const s=app.ready('A');s.mailPage=mailboxResponse(31);await app.call('/api/gameplay?module=mail');
 const partial=await app.call('/api/gameplay/survey',{body:{module:'mail',parameters:{action:'enumerate',maxPages:2}}});assert.equal(partial.data.view.mailbox.allPagesComplete,false);assert.equal(partial.data.view.mailbox.reason,'MAIL_PAGE_LIMIT_REACHED');assert.equal(app.reads.length,2);
 let reads=0;s.onRead=()=>{if(++reads===2){s.generation++;s.client.factContext.generation++;}};const late=await app.call('/api/gameplay/survey',{body:{module:'mail',parameters:{action:'enumerate',maxPages:4}}});assert.equal(late.data.code,'CANCELLED');assert.equal(app.reads.length,4);assert.equal((await app.call('/api/gameplay?module=mail')).data.view.mailbox.maxPages,2);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});
 }finally{await app.close();}
});
test('recreated Console does not restore mail enumeration, connect, authorize or send a request',async()=>{
 let app=await harness();try{const s=app.ready('A');s.mailPage=mailboxResponse(11);await app.call('/api/gameplay?module=mail');const result=await app.call('/api/gameplay/survey',{body:{module:'mail',parameters:{action:'enumerate',maxPages:2}}});assert.equal(result.data.view.mailbox.allPagesComplete,true);}finally{await app.close();}
 app=await harness();try{const result=await app.call('/api/gameplay?module=mail');assert.equal(result.data.view,null);assert.equal(app.reads.length,0);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});}finally{await app.close();}
});

test('HTTP compiled Tasks and Loop mailbox surveys persist exact coverage and reopen without replay',async()=>{
 let app=await harness();const runs=[];
 try{
 const intent=entry=>({entry,tasks:[{kind:'mail-enumeration',maxPages:2}],budget:{resources:[],quotas:[],uids:[]}});
 assert.equal((await app.call('/api/workflows/prepare',{body:intent('tasks')})).status,403);assert.equal(app.reads.length,0);
 await app.call('/api/workflows');const session=app.ready('A');session.mailPage=mailboxResponse(11);
 for(const entry of ['tasks','loop']){
  const prepared=await app.call('/api/workflows/prepare',{body:intent(entry)});assert.equal(prepared.status,200);assert.equal(prepared.data.graph.nodes.filter(n=>n.type==='SURVEY').length,1);assert.equal(prepared.data.graph.nodes.some(n=>n.type==='ACTION'),false);
  const before=app.reads.length,started=await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}});assert.equal(started.status,200);
  let current;for(let i=0;i<100;i++){current=await app.call('/api/workflows');if(current.data.status.status==='COMPLETED')break;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.equal(current.data.status.status,'COMPLETED');const runId=current.data.status.runId;runs.push(runId);
  assert.equal(app.reads.length,before+2);const history=await app.call('/api/workflows/history?workflowRunId='+runId);assert.equal(history.status,200);assert.equal(history.data.surveys[0].mailbox.status,'COMPLETE');assert.equal(history.data.surveys[0].mailbox.readPages,2);assert.equal(history.data.nodes.length,0);assert.equal(history.data.resumable,false);assert.doesNotMatch(history.text,/private-content|private-sender|mail page|emailId/);
  assert.equal((await app.call('/api/workflows/history?workflowRunId='+runId,{id:'B'})).status,404);
 }
 assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});
 }finally{await app.close();}
 app=await harness();try{
  for(const runId of runs){const history=await app.call('/api/workflows/history?workflowRunId='+runId);assert.equal(history.status,200);assert.equal(history.data.surveys[0].mailbox.observedMails,11);assert.equal(history.data.readOnly,true);assert.equal(history.data.resumable,false);}
  assert.equal((await app.call('/api/workflows')).data.status.status,'IDLE');assert.equal(app.reads.length,0);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});
 }finally{await app.close();}
});

test('HTTP Loop world SURVEY uses original mail Function and persists each bounded partial observation without a batch',async()=>{
 let app=await harness(),runId;
 try{
  const base={entry:'loop',world:[{type:'SURVEY',module:'mail',parameters:{action:'enumerate',maxPages:1}}],rounds:2,budget:{resources:[],quotas:[],uids:[]}};
  assert.equal((await app.call('/api/workflows/prepare',{body:base})).status,403);await app.call('/api/workflows');
  for(const patch of [{selection:'all'},{type:'VERIFY'},{module:'unknown'},{parameters:{request:'InjectedRequest'}},{parameters:{action:'enumerate'}},{parameters:null}])assert.equal((await app.call('/api/workflows/prepare',{body:{...base,world:[{...base.world[0],...patch}]}})).status,400);
  assert.equal(app.reads.length,0);const prepared=await app.call('/api/workflows/prepare',{body:base});assert.equal(prepared.status,200);assert.deepEqual(prepared.data.graph.nodes.map(n=>n.type),['START','SURVEY','SURVEY','STOP']);
  app.ready('A').mailPage=mailboxResponse(11);assert.equal((await app.call('/api/workflows/start',{body:{graph:prepared.data.graph}})).status,200);
  let result;for(let i=0;i<100;i++){result=await app.call('/api/workflows');if(result.data.status.status==='COMPLETED')break;await new Promise(resolve=>setTimeout(resolve,5));}assert.equal(result.data.status.status,'COMPLETED');runId=result.data.status.runId;
  const history=await app.call('/api/workflows/history?workflowRunId='+runId);assert.equal(history.status,200);assert.equal(history.data.surveys.length,2);
  for(const row of history.data.surveys){assert.equal(row.module,'mail');assert.equal(row.mailbox.status,'PARTIAL');assert.equal(row.mailbox.readPages,1);assert.equal(row.mailbox.observedMails,10);assert.equal(row.mailbox.allPagesComplete,false);assert.equal(row.mailbox.atomicSnapshot,false);assert.equal(row.mailbox.reason,'MAIL_PAGE_LIMIT_REACHED');}
  assert.deepEqual(history.data.nodes,[]);assert.equal((await app.call('/api/workflows/history?workflowRunId='+runId,{id:'B'})).status,404);
  assert.deepEqual(app.reads.map(r=>r.body),[{pageNo:0},{pageNo:0}]);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});
 }finally{await app.close();}
 app=await harness();try{const history=await app.call('/api/workflows/history?workflowRunId='+runId);assert.equal(history.status,200);assert.equal(history.data.surveys.length,2);assert.equal(history.data.resumable,false);assert.equal(app.reads.length,0);assert.equal(app.writes.length,0);assert.deepEqual(app.counts(),{creates:0,collects:0});}finally{await app.close();}
});
