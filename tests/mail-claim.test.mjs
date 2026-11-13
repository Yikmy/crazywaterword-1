import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';

// Set paths before project imports: every transport and credential is synthetic.
const isolation=fs.mkdtempSync(path.join(os.tmpdir(),'cw-mail-claim-http-'));
process.env.CW_DATA_DIR=isolation;process.env.CW_CONFIG_PACK=path.join(isolation,'absent-config.json');
const mail=await import('../src/mail.mjs');
const {loadProtocol}=await import('../src/proto.mjs');
const {toSnapshotJson}=await import('../src/game.mjs');
const {extractTables}=await import('../src/config.mjs');
const {executeBusinessOperation}=await import('../src/business-functions.mjs');
const {assertPaymentAllowed}=await import('../src/actions.mjs');
const {createRunBudgetContext}=await import('../src/resource-ledger.mjs');
const {GAMEPLAY_MODULES}=await import('../src/function-registry.mjs');
const {createExecutionHistory}=await import('../src/execution-history.mjs');
const {createModuleSettings}=await import('../src/gameplay-settings.mjs');
const {createOperationService}=await import('../src/operation-service.mjs');
const {createWorkflowRunner}=await import('../src/workflow.mjs');
const {createConsole}=await import('../src/server.mjs');
const {saveStore}=await import('../src/accounts.mjs');
test.after(()=>{assert.equal(path.dirname(path.resolve(isolation)),path.resolve(os.tmpdir()));fs.rmSync(isolation,{recursive:true,force:true});});
const protocol=loadProtocol(),wire=(name,body)=>protocol[name].decode(protocol[name].encode(body).finish());
const account='mail-account',emailId='9007199254740995',parameters={pageNo:2,action:'claim',emailId},claims={resources:[],quotas:[],uids:[{type:'mail',id:emailId}]};
function fixture(t,{apply=true,shared=false,http=false,watchStatus='UNKNOWN',unread=false}={}){
 const config={tables:{ItemCfg:{data:[{id:'抽卡券'},{id:'其他'}]}}};
 const row={emailId,subject:'synthetic mail',content:'private-content-should-not-escape',sender:'private-sender',sendTime:900,status:unread?2:1,got:false,attachment:{assets:{asset:[{type:0,id:'抽卡券',num:2},{type:1,id:'GOLD',num:5},{type:1,id:'RUBY',num:3}]},heroes:[],equips:[],antiques:[]}};
 const state={raw:{email:[row,{...structuredClone(row),emailId:'9007199254740996',subject:'peer'}],total:37},stock:new Map([['抽卡券',0],['GOLD',100],['RUBY',9],['其他',1]]),writes:[],reads:[],onRead:null,onResponse:null,onWatch:null,afterWrite:null};
 let file,dir,app,csrf,clients=0,collections=0,failPersist=()=>false;
 const client={connected:true,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{accountId:account,generation:1,connectionId:'offline-mail-claim'},
  stop(){this.connected=false;},markUnverifiedWrite(name,body){this.uncertainWrites.set(JSON.stringify({name,body}),true);},confirmWatchedWrite(name,body){this.uncertainWrites.delete(JSON.stringify({name,body}));},
  async request(name,body,response,_timeout,opts={}){assert.notEqual(opts.mutate,true);wire(name,body);state.reads.push({name,body});await state.onRead?.(name);
   const values={EmailBoxRequest:()=>{assert.equal(body.pageNo,2);return state.raw;},AllItemRequest:()=>({items:[...state.stock].filter(([id])=>!['GOLD','RUBY'].includes(id)).map(([itemId,num])=>({itemId,num}))}),AllResourceRequest:()=>({list:[{res:3,amount:state.stock.get('GOLD')},{res:4,amount:state.stock.get('RUBY')}]})};
   assert.ok(values[name],name);const decoded=wire(response,values[name]());return state.onResponse?state.onResponse(name,decoded):decoded;},
  async sendWatch(name,body,{beforeDispatch}={}){beforeDispatch?.();assert.equal(name,'QuickGotReadEmailRequest');assert.deepEqual(toSnapshotJson(wire(name,body)),{emailId:[emailId],all:false});
   const durable=file?JSON.parse(fs.readFileSync(file,'utf8')).accounts[account][0]:null;state.writes.push({name,body:structuredClone(body),durable});
   if(apply){row.status=1;row.got=true;for(const r of row.attachment.assets.asset)state.stock.set(r.id,(state.stock.get(r.id)??0)+Number(r.num));}
   state.afterWrite?.();await state.onWatch?.();return {status:watchStatus};},
 };
 const session={id:account,client,state:'READY',generation:1,connectionId:'offline-mail-claim',player:{playerId:'17',worldId:'9'},abort:new AbortController(),busy:null,loop:{running:false,stop:{aborted:false}},log:[],snapshot:{ok:{},failed:{}}};
 const options=extra=>({config,moduleConfig:{enabled:true},player:session.player,parameters,...extra}),survey=extra=>mail.surveyMail(client,protocol,options(extra)),plan=(facts,extra)=>mail.planMail(facts,options(extra));
 const budget=(limits=claims)=>{const scope={...client.factContext,runId:'mail-run'};return {scope,runBudget:createRunBudgetContext({scope,limits}),batchId:'mail-batch',limits:claims,ledger:null};};
 const run=(operation,extra)=>executeBusinessOperation(client,protocol,operation,{adapter:mail.mailModule,...options(),allowMutate:true,budget:budget(),...extra});
 let durable,history,settings,service;const services=[],runners=[];
 if(shared||http){dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-mail-claim-service-'));file=path.join(dir,'history.json');durable=createExecutionHistory({file});history={...durable,put(record){if(failPersist(record))throw Error('synthetic persistence unavailable');return durable.put(record);}};
  settings=createModuleSettings({file:path.join(dir,'settings.json'),modules:GAMEPLAY_MODULES});settings.save(account,'mail',{enabled:true});
  const operationOptions={history,moduleSettings:settings,getConfig:()=>structuredClone(config),loadRules:()=>({config:{version:1,enabled:true,rules:[]}}),loadProduction:()=>({config:{version:1,enabled:false}})};
  if(http){saveStore({version:1,activeId:account,accounts:[account,'other-account'].map(id=>({id,label:id,url:'wss://synthetic.invalid',login:{eworldParams:{openId:id,token:'synthetic-mail-only',sign:'synthetic-mail',timestamp:1}}}))});
   app=createConsole({protocol,tracePath:path.join(dir,'never.log'),clientFactory(){clients++;throw Error('Offline test forbids clients');},collect(){collections++;throw Error('Offline test forbids collection');},writerOwnership:{assertOwned(){return true;},claim(){return true;},release(){}},operationOptions});app.server.address=()=>({port:17321});app.sessions.set(account,session);}
  service=app?.operations??createOperationService({protocol,modules:GAMEPLAY_MODULES,...operationOptions});services.push(service);
 }
 const newService=()=>{const next=createOperationService({protocol,modules:GAMEPLAY_MODULES,history:createExecutionHistory({file}),moduleSettings:settings,getConfig:()=>structuredClone(config),loadRules:()=>({config:{enabled:true,rules:[]}}),loadProduction:()=>({config:{enabled:false}})});services.push(next);return next;};
 async function displayed(p=parameters,workflowId=null){const read=await service.surveyModule(session,'mail',p,{workflowId}),c=read.view.candidates.find(r=>r.executable);assert.ok(c,JSON.stringify(read.view.candidates));return service.plan(session,{module:'mail',mode:'Manual',parameters:p,selections:[c.actionId]},{workflowId});}
 const authorize=p=>service.authorize(session,{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:p.resourceBudget,confirm:true});
 async function execute(p){const permit=authorize(p);service.execute(session,permit);await service.settle(account);return {permit,record:durable.list(account).find(r=>r.planSummary.batchId===p.batchId)};}
 function runner(){const r=createWorkflowRunner({operations:service,modules:GAMEPLAY_MODULES,getSession:id=>id===account?session:null,claim:(id,runId,opts)=>service.claimWorkflow(session,runId,opts),isCurrent:(s,g,c)=>s===session&&s.generation===g&&s.client===c});runners.push(r);return r;}
 const call=(route,{id=account,body,headers={},authorized=true}={})=>new Promise(resolve=>{const url=new URL(route,'http://127.0.0.1:17321');if(id!==null)url.searchParams.set('account',id);const req=new EventEmitter();Object.assign(req,{url:url.pathname+url.search,method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:17321','content-type':'application/json',...(authorized?{origin:'http://127.0.0.1:17321',...(csrf?{'x-cw-csrf':csrf}:{})}:{}),...headers}});const res={writeHead(status){this.status=status;},end(text){const data=JSON.parse(text);if(data.csrfToken)csrf=data.csrfToken;resolve({status:this.status,data});}};app.server.emit('request',req,res);if(body!==undefined)req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');});
 t.after(async()=>{for(const r of runners)r.stop();await Promise.all(runners.map(r=>r.settle()));session.abort.abort();await Promise.all(services.map(s=>s.settle(account)));if(app)await app.close();if(dir){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}});
 return {config,state,row,client,session,options,survey,plan,budget,run,service,durable,newService,displayed,authorize,execute,runner,call,app,file,counts:()=>({clients,collections}),failPersist:fn=>{failPersist=fn;}};
}
async function prepared(t,options){const f=fixture(t,options),before=await f.survey(),operation=f.plan(before,{selections:[mail.viewMail(before,f.options()).candidates[0].actionId]}).actions[0];assert.ok(operation);return {...f,before,operation};}

for(const unread of [false,true])test('single exact mail '+(unread?'unread':'read')+' attachment independently confirms read+got and exact item/resource income',async t=>{
 const f=await prepared(t,{unread}),peer=structuredClone(f.state.raw.email[1]),result=await f.run(f.operation);
 assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.requestStatus,'UNKNOWN');assert.deepEqual(f.operation.budgetClaims,claims);for(const r of f.operation.rewards)assert.ok(f.operation.label.includes(r.id+' × '+r.num));
 assert.deepEqual(f.operation.action,{request:'QuickGotReadEmailRequest',response:null,body:{emailId:[emailId],all:false}});
 assert.deepEqual(f.state.stock,new Map([['抽卡券',2],['GOLD',105],['RUBY',12],['其他',1]]));assert.deepEqual(f.state.raw.email[1],peer);assert.equal(f.state.writes.length,1);assert.equal(f.client.uncertainWrites.size,0);
 assert.doesNotMatch(JSON.stringify(f.before),/private-content|private-sender/);assert.doesNotMatch(JSON.stringify(f.operation),/private-content|private-sender/);
});
test('claim parameters reject batch, transport, missing ID and rounded or noncanonical int64 before reads',async t=>{
 const f=fixture(t,{shared:true});for(const extra of [{action:'read'},{action:'all'},{emailId:9007199254740992},{emailId:'01'},{emailId:'0'},{emailId:'9223372036854775808'},{emailId:[emailId]},{all:true},{body:{}},{request:'QuickGotReadEmailRequest'},{pageNo:-1}])await assert.rejects(f.service.surveyModule(f.session,'mail',{...parameters,...extra}),{code:'INVALID_PARAMETERS'});
 for(const p of [{action:'claim'},{emailId}])assert.throws(()=>mail.validateMailParameters(p),{code:'INVALID_PARAMETERS'});assert.equal(f.state.reads.length,0);assert.equal(f.state.writes.length,0);
});
test('mail claim requires complete exact assets, explicit state, known costs and unique authoritative target',async t=>{
 for(const change of [f=>delete f.row.got,f=>delete f.row.status,f=>f.row.got=true,f=>f.row.status=0,f=>delete f.row.attachment,
  f=>f.row.attachment.heroes.push('h'),f=>f.row.attachment.equips.push('e'),f=>f.row.attachment.antiques.push('a'),
  f=>f.row.attachment.assets.asset=[],f=>f.row.attachment.assets.asset[0].id='unknown',f=>f.row.attachment.assets.asset[0].num='9007199254740992',f=>f.row.attachment.assets.asset[0].num=0,f=>f.state.stock.set('GOLD',Number.MAX_SAFE_INTEGER),
  f=>f.row.attachment.assets.asset.push(structuredClone(f.row.attachment.assets.asset[0])),f=>f.row.attachment.assets.asset[0].type=1,
  f=>delete f.state.raw.total,f=>f.state.raw.email.push(structuredClone(f.row)),f=>f.state.raw.email.shift(),f=>delete f.config.tables.ItemCfg,
  f=>{f.state.onResponse=(name,v)=>{if(name==='EmailBoxRequest')delete v.email[0].attachment.assets.asset[0].type;return v;};},
  f=>{f.state.onRead=name=>{if(name==='AllItemRequest')throw Error('synthetic unavailable');};},
 ]){const f=fixture(t);change(f);const b=await f.survey(),v=mail.viewMail(b,f.options());assert.equal(v.candidates[0].executable,false,JSON.stringify(v));assert.equal(f.state.writes.length,0);}
});
test('mail facts copied, edited, stale or from another identity cannot plan',async t=>{
 const f=await prepared(t);assert.equal(f.plan(structuredClone(f.before),{selections:[f.operation.actionId]}).actions.length,0);
 for(const change of [f=>f.before.stock.set('抽卡券',999),f=>f.before.observation.rewards[0].num++,f=>f.before.sourceFacts.page.provenance.sourceAt-=31000,f=>f.client.factContext.connectionId='replaced',f=>f.session.player.worldId='10']){const g=await prepared(t);change(g);assert.equal(g.plan(g.before,{selections:[g.operation.actionId]}).actions.length,0);assert.equal(g.state.writes.length,0);}
});
test('mail no effect, state-only success, wrong reward, moved target, mutated attachment and changed peer stay UNKNOWN',async t=>{
 for(const change of [f=>f.row.got=false,f=>f.row.status=2,f=>{f.state.stock.set('抽卡券',0);f.state.stock.set('GOLD',100);f.state.stock.set('RUBY',9);},f=>f.state.stock.set('抽卡券',1),f=>f.state.stock.set('GOLD',106),f=>f.state.stock.set('其他',2),f=>f.row.attachment.assets.asset[0].num++,f=>f.row.content='changed',f=>f.state.raw.email[1].got=true,f=>f.state.raw.total++,f=>f.state.raw.email.shift()]){
  const f=await prepared(t);f.state.afterWrite=()=>change(f);const r=await f.run(f.operation);assert.equal(r.status,'UNKNOWN',JSON.stringify(r));assert.equal(f.client.uncertainWrites.size,1);assert.equal(f.state.writes.length,1);
 }
 const f=await prepared(t,{apply:false,watchStatus:'SUCCESS'});assert.equal((await f.run(f.operation)).status,'UNKNOWN');assert.equal(f.state.writes.length,1);
});
test('mail contract edits and absent parent UID never dispatch',async t=>{
 for(const change of [op=>op.target.emailId='7',op=>op.action.body.all=true,op=>op.action.body.emailId.push('8'),op=>op.budgetClaims.uids=[],op=>op.expectedState.got=false]){const f=await prepared(t);change(f.operation);assert.notEqual((await f.run(f.operation)).status,'SUCCESS');assert.equal(f.state.writes.length,0);}
 const f=await prepared(t);assert.notEqual((await f.run(f.operation,{budget:f.budget({resources:[],quotas:[],uids:[]})})).status,'SUCCESS');assert.equal(f.state.writes.length,0);
});
test('mail verifier rejects altered reward metadata and executor derives reward evidence from its fresh canonical plan',async t=>{
 const f=await prepared(t),changed=structuredClone(f.operation);changed.rewards[0].num++;
 const result=await f.run(changed);assert.equal(result.status,'SUCCESS');assert.equal(f.state.writes.length,1);assert.equal(f.state.stock.get('抽卡券'),2);
 const after=await f.survey();assert.equal(mail.verifyMailClaim(changed,f.before,after).confirmed,false);assert.equal(mail.verifyMailClaim(f.operation,f.before,after).confirmed,true);
});
test('mail Service persists exact UID and dispatch intent, crops transport and refuses permit reuse',async t=>{
 const f=fixture(t,{shared:true}),p=await f.displayed();assert.deepEqual(p.budgetClaims,claims);assert.equal(p.actions[0].action,undefined);const {permit,record}=await f.execute(p);
 assert.equal(record.finalStatus,'SUCCESS');assert.equal(record.actions[0].verification.status,'CONFIRMED');assert.equal(f.state.writes[0].durable.actions[0].dispatchEvidence.state,'MAY_HAVE_DISPATCHED');assert.deepEqual(f.state.writes[0].durable.runBudget.reserved,claims);assert.equal(createExecutionHistory({file:f.file}).unresolved(account),false);assert.throws(()=>f.service.execute(f.session,permit));
});
test('mail UNKNOWN survives new Service/store and connection with reserved UID and no replay',async t=>{
 const f=fixture(t,{shared:true,apply:false,watchStatus:'SUCCESS'}),p=await f.displayed(),{record}=await f.execute(p);assert.equal(record.finalStatus,'UNKNOWN');assert.deepEqual(record.runBudget.reserved,claims);
 const next=f.newService(),fresh={...f.session,generation:2,connectionId:'restart',client:{...f.client,pending:[],watchers:[],lateResponses:new Map(),uncertainWrites:new Map(),factContext:{...f.client.factContext,generation:2,connectionId:'restart'}}};
 await assert.rejects(next.surveyModule(fresh,'mail',parameters),{code:'RECOVERY_UNCERTAIN'});assert.equal(f.state.writes.length,1);
});
test('mail permits bind account, role, world, connection, generation and ItemCfg',async t=>{
 for(const kind of ['config','account','player','world','connection','generation']){const f=fixture(t,{shared:true}),p=await f.displayed();if(kind==='config'){f.config.tables.ItemCfg.data.push({id:'changed'});assert.throws(()=>f.authorize(p),{code:'STALE_PLAN'});}else{const permit=f.authorize(p);if(kind==='account')assert.throws(()=>f.service.execute({...f.session,id:'other-account'},permit));else{if(kind==='player')f.session.player.playerId='99';if(kind==='world')f.session.player.worldId='11';if(kind==='connection'){f.session.connectionId+='new';f.client.factContext.connectionId+='new';}if(kind==='generation'){f.session.generation++;f.client.factContext.generation++;}try{f.service.execute(f.session,permit);await f.service.settle(account);}catch{}}}assert.equal(f.state.writes.length,0);}
});
test('mail UID reservation and dispatch-intent persistence failures prevent transport',async t=>{
 for(const kind of ['budget','intent']){const f=fixture(t,{shared:true}),p=await f.displayed();f.failPersist(r=>kind==='budget'?(r.runBudget?.reserved.uids??[]).length>0:r.actions?.some(a=>a.dispatchEvidence?.state==='MAY_HAVE_DISPATCHED'));try{f.service.execute(f.session,f.authorize(p));await f.service.settle(account);}catch{}finally{f.failPersist(()=>false);}assert.equal(f.state.writes.length,0);assert.notEqual(f.service.status(account).finalStatus,'SUCCESS');}
});
test('mail cancellation before dispatch and late result after stop cannot report success or replay',async t=>{
 for(const before of [true,false]){const f=fixture(t,{shared:true}),p=await f.displayed(),permit=f.authorize(p);let finish;if(before){f.session.abort.abort();try{f.service.execute(f.session,permit);await f.service.settle(account);}catch{}assert.equal(f.state.writes.length,0);}else{f.state.onWatch=()=>new Promise(resolve=>{finish=resolve;});f.service.execute(f.session,permit);for(let i=0;i<100&&!finish;i++)await new Promise(setImmediate);assert.ok(finish);f.service.stop(account);finish();await f.service.settle(account);const r=f.durable.list(account)[0];assert.equal(r.finalStatus,'UNKNOWN');assert.deepEqual(r.runBudget.reserved,claims);await assert.rejects(f.displayed());assert.equal(f.state.writes.length,1);}}
});
for(const enough of [true,false])test('mail Workflow consumes original cumulative UID declaration '+enough,async t=>{
 const f=fixture(t,{shared:true}),read=await f.service.surveyModule(f.session,'mail',parameters),selection=read.view.candidates.find(r=>r.executable).actionId,nodes=[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'mail',parameters,selection},{id:'v',type:'VERIFY',module:'mail'},{id:'z',type:'STOP'}],graph={version:1,id:'mail-parent',name:'mail parent',budget:enough?claims:{resources:[],quotas:[],uids:[]},nodes,edges:nodes.slice(1).map((n,i)=>({from:nodes[i].id,to:n.id}))},runner=f.runner(),first=await runner.start(account,graph);
 assert.equal(first.status,'AWAITING_AUTHORIZATION');assert.equal(f.state.writes.length,0);if(enough){await f.execute(first.plan);const result=await runner.resume();assert.equal(result.status,'COMPLETED');assert.deepEqual(result.runBudget.reserved,claims);assert.equal(f.state.writes.length,1);}else{assert.throws(()=>f.service.execute(f.session,f.authorize(first.plan)),{code:'RUN_BUDGET_INVALID'});assert.equal(f.state.writes.length,0);}
});
test('mail D6 allows only precise single target and zero spend on selected mode',()=>{
 const good={request:'QuickGotReadEmailRequest',body:{all:false,emailId:[emailId]},costs:[]};assert.doesNotThrow(()=>assertPaymentAllowed(good));
 for(const extra of [{body:{all:false}},{body:{all:false,emailId:[]}},{body:{all:false,emailId:[emailId,'7']}},{body:{all:false,emailId:['01']}},{body:{all:false,emailId:[emailId],delete:true}},{body:{emailId:[emailId]}},{costs:undefined},{costs:[{id:'RUBY',num:1}]}])assert.throws(()=>assertPaymentAllowed({...good,...extra},{allowPaid:true}));
});
test('mail HTTP uses original CSRF, exact parameters, account permits and history without client creation',async t=>{
 const f=fixture(t,{http:true});await f.call('/api/gameplay?module=mail');for(const extra of [{authorized:false},{headers:{'x-cw-csrf':'bad'}},{headers:{origin:'https://invalid.example'}}])assert.equal((await f.call('/api/gameplay/survey',{body:{module:'mail',parameters},...extra})).status,403);
 const read=await f.call('/api/gameplay/survey',{body:{module:'mail',parameters}});assert.equal(read.status,200);const c=read.data.view.candidates.find(r=>r.executable);assert.ok(c);assert.equal(c.action,undefined);assert.doesNotMatch(JSON.stringify(read.data),/private-content|private-sender/);
 const p=(await f.call('/api/operations/plan',{body:{module:'mail',mode:'Manual',parameters,selections:[c.actionId]}})).data;assert.equal(f.state.writes.length,0);
 const auth=await f.call('/api/operations/authorize',{body:{batchId:p.batchId,planHash:p.planHash,approvedActionIds:p.actions.map(r=>r.actionId),resourceBudget:[],confirm:true}});assert.equal(auth.status,200);assert.equal((await f.call('/api/operations/execute',{id:'other-account',body:auth.data})).status,409);assert.equal((await f.call('/api/operations/execute',{body:auth.data})).status,200);await f.service.settle(account);assert.equal((await f.call('/api/operations/history')).data.runs[0].finalStatus,'SUCCESS');assert.deepEqual(f.counts(),{clients:0,collections:0});assert.equal(f.app.server.listening,false);
});

test('mail claim revalidates changed attachment, read age and identity immediately before dispatch',async t=>{
 for(const change of [f=>f.row.attachment.assets.asset[0].num++,f=>f.row.got=true,f=>f.row.content='changed-before-send',f=>f.state.raw.email.shift()]){const f=await prepared(t);change(f);assert.notEqual((await f.run(f.operation)).status,'SUCCESS');assert.equal(f.state.writes.length,0);}
 const f=await prepared(t),real=Date.now;let clock=real();Date.now=()=>clock;
 try{f.state.onRead=()=>{if(f.state.reads.length>6)clock+=31000;};assert.notEqual((await f.run(f.operation)).status,'SUCCESS');assert.equal(f.state.writes.length,0);}finally{Date.now=real;}
 const g=fixture(t);g.state.onRead=name=>{if(name==='EmailBoxRequest')throw Error('token=private-secret');};const b=await g.survey();assert.equal(mail.viewMail(b,g.options()).candidates[0].executable,false);assert.doesNotMatch(JSON.stringify(b),/private-secret/);assert.equal(g.state.writes.length,0);
});
