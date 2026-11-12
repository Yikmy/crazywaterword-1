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
      async request(name,body,response,_timeout,options){assert.equal(name,'EmailBoxRequest');assert.equal(response,'EmailBoxResponse');assert.equal(options?.mutate,undefined);wire(name,body);reads.push({id,body:structuredClone(body)});await sessions[id].onRead?.();return wire(response,{email:[{emailId:id==='A'?'9007199254740995':'9007199254740997',subject:id+' page '+body.pageNo,content:'private-content',sender:'private-sender',status:2,got:false}],total:37});},async sendWatch(...args){writes.push(args);throw Error('mail write forbidden');}});
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
