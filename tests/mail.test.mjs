import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProtocol } from '../src/proto.mjs';
import { createCodec } from '../src/codec.mjs';
import { mailModule, mailPage, surveyMail, viewMail, planMail, validateMailParameters, validateMailConfig } from '../src/mail.mjs';
import { GAMEPLAY_MODULES } from '../src/function-registry.mjs';
import { createOperationService } from '../src/operation-service.mjs';
import { createWorkflowRunner, validateWorkflow } from '../src/workflow.mjs';
import { toSnapshotJson } from '../src/game.mjs';

const protocol=loadProtocol(),codec=createCodec(protocol),clone=v=>structuredClone(v);
const player=()=>({playerId:'9007199254740993',worldId:'17'});
const wire=(name,body)=>codec.decode(codec.encode(name,1,body)).body;
function email(extra={}) {return {emailId:'9007199254740995',subject:'合成邮件',status:1,got:false,content:'private-content-must-not-escape',sender:'private-sender',attachment:{assets:{asset:[{type:0,id:'抽卡券',num:'9223372036854775807'},{type:1,id:'RUBY',num:200}]},heroes:[],equips:[],antiques:[]},...extra};}
function fake() {
  const reads=[],writes=[],state={onRead:null,raw:{email:[email()],total:37}};
  const client={connected:true,factContext:{accountId:'synthetic-A',generation:3,connectionId:'offline-mail'},pending:[],watchers:[],uncertainWrites:new Set(),lateResponses:new Map(),
    async request(name,body,response,timeout,options){assert.equal(name,'EmailBoxRequest');assert.equal(response,'EmailBoxResponse');assert.equal(options?.mutate,undefined);wire(name,body);reads.push(clone(body));await state.onRead?.();return wire(response,state.raw);},
    async sendWatch(...args){writes.push(args);throw Error('mail must never write');}};
  return {client,state,reads,writes,options:{parameters:{pageNo:2},player:player()}};
}

test('strict page/config whitelist rejects getters, transport, batch and negative or imprecise pages',()=>{
  assert.deepEqual(validateMailParameters(),{pageNo:0});assert.deepEqual(validateMailParameters({pageNo:2147483647}),{pageNo:2147483647});
  for(const v of[null,[],{pageNo:-1},{pageNo:1.5},{pageNo:2147483648},{pageNo:'1'},{all:true},{pageNo:1,emailId:['1']},Object.create({pageNo:1}),{get pageNo(){throw Error('getter');}}])assert.throws(()=>validateMailParameters(v),{code:'INVALID_PARAMETERS'});
  for(const v of[null,{enabled:1},{enabled:true,all:true},{get enabled(){throw Error('getter');}}])assert.throws(()=>validateMailConfig(v),{code:'INVALID_PARAMETERS'});
  assert.deepEqual(validateMailConfig(),{enabled:false});assert.equal(mailModule.execute,undefined);
});
test('actual protocol exact page observes int64 ID and attachment without exposing contents',async()=>{
  const f=fake(),facts=await surveyMail(f.client,protocol,f.options),v=viewMail(facts),row=v.page.emails[0];
  assert.deepEqual(f.reads,[{pageNo:2}]);assert.equal(facts.context.playerId,'9007199254740993');assert.equal(v.page.scope,'CURRENT_PAGE_ONLY');assert.equal(v.page.allPagesComplete,false);assert.equal(v.page.hasNext,null);assert.equal(v.page.totalReported,37);assert.equal(v.page.pageCount,1);
  assert.equal(row.emailId,'9007199254740995');assert.equal(row.read,true);assert.equal(row.got,false);assert.equal(row.eligibility,true);
  assert.deepEqual(row.attachment.assets,[{type:'ITEM',id:'抽卡券',num:'9223372036854775807'},{type:'RESOURCE',id:'RUBY',num:'200'}]);
  assert.equal(v.provenance.source,'EmailBoxResponse');assert.deepEqual(v.provenance.scope,{kind:'ENTITY',key:'mail-page:2'});assert.equal(v.candidates.length,0);
  assert.doesNotMatch(JSON.stringify(facts),/private-content|private-sender/);assert.equal(f.writes.length,0);
  assert.equal(mailPage(toSnapshotJson(wire('EmailBoxResponse',f.state.raw))).emails[0].emailId,row.emailId);
});
test('read-only plans and verifier never turn eligible mail or arbitrary selections into execution',async()=>{
  const f=fake(),facts=await surveyMail(f.client,protocol,f.options);
  assert.deepEqual(planMail(facts).actions,[]);assert.throws(()=>planMail(facts,{selections:['all']}),{code:'MAIL_READ_ONLY'});assert.equal(mailModule.verify({all:true},facts,facts,{success:true}).confirmed,false);
  assert.equal(f.writes.length,0);assert.equal(facts.page.emails[0].executable,false);
});
test('one exact page per request, including zero and max page, never loops based on total',async()=>{
  const f=fake();for(const pageNo of[0,1,2147483647]){f.options.parameters={pageNo};const facts=await surveyMail(f.client,protocol,f.options);assert.equal(facts.page.pageNo,pageNo);assert.equal(facts.page.hasPrevious,pageNo>0);}
  assert.deepEqual(f.reads,[{pageNo:0},{pageNo:1},{pageNo:2147483647}]);assert.equal(f.writes.length,0);
});
test('empty typed page and omitted total are distinct from unknown list and never a complete mailbox',()=>{
  let v=mailPage(wire('EmailBoxResponse',{email:[]}));assert.equal(v.pageCount,0);assert.equal(v.totalReported,null);assert.equal(v.allPagesComplete,false);assert.equal(v.hasNext,null);
  v=mailPage({});assert.equal(v.pageCount,null);assert.equal(v.totalReported,null);
});
for(const[title,rows]of[['duplicate IDs',[email(),email()]],['missing ID',[{subject:'missing'}]],['rounded ID',[email({emailId:9007199254740992})]],['zero ID',[email({emailId:0})]],['negative ID',[email({emailId:'-1'})]],['out of range ID',[email({emailId:'9223372036854775808'})]],['sparse list',Array(1)]])test(title+' cannot form reliable mail identity',()=>{const v=mailPage({email:rows,total:37});assert.equal(v.status,'UNKNOWN');assert.equal(v.pageCount,null);assert.deepEqual(v.emails,[]);assert.equal(v.totalReported,37);});
test('omitted proto status or got is not inherited read or unclaimed; unread and claimed are independent',()=>{
  for(const extra of[{status:undefined},{got:undefined}]){const body=email(extra);for(const k of Object.keys(extra))delete body[k];const v=mailPage(wire('EmailBoxResponse',{email:[body]})).emails[0];assert.equal(v.eligibility,null);}
  assert.equal(mailPage(wire('EmailBoxResponse',{email:[email({status:2})]})).emails[0].read,false);
  assert.equal(mailPage(wire('EmailBoxResponse',{email:[email({status:2})]})).emails[0].eligibility,false);
  assert.equal(mailPage(wire('EmailBoxResponse',{email:[email({got:true})]})).emails[0].got,true);
});
test('missing, malformed or unsupported assets never invent attachment rewards or no-attachment',()=>{
  const none=mailPage({email:[email({attachment:null})]}).emails[0];assert.equal(none.attachment.hasAttachment,false);assert.equal(none.eligibility,false);
  for(const attachment of[undefined,{}, {assets:{asset:[{type:0,id:'x'}]}},{assets:{asset:[{type:3,id:'x',num:1}]}},{assets:{asset:[{type:0,id:'x',num:1},{type:0,id:'x',num:1}]}}]){
    const row=mailPage({email:[email({attachment})]}).emails[0];assert.equal(row.attachment.hasAttachment,null);assert.equal(row.attachment.assets,null);assert.equal(row.eligibility,null);
  }
  const extra=mailPage({email:[email({attachment:{heroes:[{}],equips:[],antiques:[]}})]}).emails[0];assert.equal(extra.attachment.hasAttachment,true);assert.equal(extra.attachment.other.heroes,1);assert.equal(extra.attachment.status,'PARTIAL');
});
test('accessors are not evaluated for mail IDs, claimed, attachments or subject',()=>{
  const getter=()=>{throw Error('getter must not run');};
  for(const key of['status','got','attachment','subject']){const row=email();Object.defineProperty(row,key,{get:getter,enumerable:true});assert.doesNotThrow(()=>mailPage({email:[row]}));}
  const row=email();Object.defineProperty(row,'emailId',{get:getter,enumerable:true});assert.equal(mailPage({email:[row]}).status,'UNKNOWN');
});
test('missing role/account context and unavailable types do not issue even one query',async()=>{
  for(const mutate of[f=>f.options.player={},f=>delete f.client.factContext.connectionId,f=>f.client.factContext.playerId='2',f=>f.client.factContext.generation=-1]){
    const f=fake();mutate(f);const facts=await surveyMail(f.client,protocol,f.options);assert.equal(f.reads.length,0);assert.equal(facts.page.status,'UNKNOWN');
  }
  const f=fake(),p={...protocol};delete p.EmailBoxResponse;assert.equal((await surveyMail(f.client,p,f.options)).notes[0],'MAIL_PROTOCOL_UNAVAILABLE');assert.equal(f.reads.length,0);
});
test('read failure is sanitized and cancellation and replaced context discard late page',async()=>{
  const f=fake();f.state.onRead=()=>{throw Error('token=hidden');};const facts=await surveyMail(f.client,protocol,f.options);assert.equal(facts.notes[0],'MAIL_PAGE_READ_FAILED');assert.doesNotMatch(JSON.stringify(facts),/hidden/);
  for(const mutate of[f=>f.client.factContext.generation++,f=>f.client.factContext.connectionId='new',f=>f.options.player.worldId='18']){const copy=fake();copy.state.onRead=()=>mutate(copy);await assert.rejects(surveyMail(copy.client,protocol,copy.options),{code:'CANCELLED'});assert.equal(copy.writes.length,0);}
  const copy=fake(),abort=new AbortController();copy.state.onRead=()=>{queueMicrotask(()=>abort.abort());return new Promise(()=>{});};await assert.rejects(surveyMail(copy.client,protocol,{...copy.options,signal:abort.signal}),{code:'CANCELLED'});
});
function serviceFixture(){
  const f=fake(),session={id:'synthetic-A',client:f.client,player:player(),generation:3,connectionId:'offline-mail',state:'READY',abort:new AbortController(),loop:{running:false},busy:null};
  const service=createOperationService({protocol,modules:GAMEPLAY_MODULES,history:{list:()=>[],unresolved:()=>false,put(){throw Error('read must not persist history');}},moduleSettings:{get:()=>({config:{enabled:false}})},getConfig:()=>({}),loadRules:()=>({config:{}}),loadProduction:()=>({config:{}})});
  return {...f,session,service};
}
test('registered shared Service reads with disabled writes and isolates cached account pages',async()=>{
  const f=serviceFixture(),a=await f.service.surveyModule(f.session,'mail',{pageNo:2});assert.equal(a.view.page.pageNo,2);assert.equal(a.config.enabled,false);assert.equal(a.functions.find(r=>r.id==='mail').metadata.implementation.mode,'OBSERVATION_ONLY');
  assert.equal(f.service.moduleView('other','mail').view,null);assert.equal(a.view.candidates.length,0);assert.equal(f.session.busy,null);
  await assert.rejects(f.service.plan(f.session,{module:'mail',mode:'Manual',parameters:{pageNo:2},selections:['forged']}));assert.equal(f.writes.length,0);
});
test('existing Workflow SURVEY observes one mail page without authorization, histories or writes',async t=>{
  const f=serviceFixture(),graph={version:1,id:'mail-observation',name:'Mail page',nodes:[{id:'s',type:'START'},{id:'q',type:'SURVEY',module:'mail',parameters:{pageNo:3}},{id:'z',type:'STOP'}],edges:[{from:'s',to:'q'},{from:'q',to:'z'}]};
  assert.equal(validateWorkflow(graph,{modules:GAMEPLAY_MODULES}).valid,true);
  const runner=createWorkflowRunner({modules:GAMEPLAY_MODULES,operations:f.service,claim:(_id,runId,options)=>f.service.claimWorkflow(f.session,runId,options),getSession:id=>id===f.session.id?f.session:null});t.after(()=>runner.stop());
  const result=await runner.start(f.session.id,graph);assert.equal(result.status,'COMPLETED');assert.deepEqual(f.reads,[{pageNo:3}]);assert.equal(f.writes.length,0);assert.equal(f.session.busy,null);
});
