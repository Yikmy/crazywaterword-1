import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { PAGE } from '../src/page.mjs';
const inline=PAGE.slice(PAGE.indexOf('<script>')+8,PAGE.lastIndexOf('</script>'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.disabled=false;this.value='';this._text='';const classes=new Set();this.classList={add:v=>classes.add(v),contains:v=>classes.has(v),toggle(v,on){if(on)classes.add(v);else classes.delete(v);}};}
  set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  appendChild(n){this.children.push(n);return n;} append(...ns){ns.forEach(n=>this.appendChild(n));} removeChild(n){this.children.splice(this.children.indexOf(n),1);} setAttribute(k,v){this[k]=v;}
  get firstChild(){return this.children[0];}get childElementCount(){return this.children.length;}
}
function harness(){
 const nodes=new Map(),requests=[],timers=[],confirmations=[];let confirm=true;
 const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 const tabs=['overview','stages','order-rules'].map(tab=>{const b=new Element('button');b.dataset.tab=tab;return b;});
 const context=vm.createContext({URL,location:{href:'http://127.0.0.1:17321/'},document:{getElementById:node,createElement:tag=>new Element(tag),createTextNode:text=>{const n=new Element();n.textContent=text;return n;},querySelectorAll:selector=>selector==='#tabs button'?tabs:[]},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},EventSource:class{close(){}},fetch:(url,options={})=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject,settled:false})),setInterval:(callback,delay)=>{timers.push({callback,delay});return timers.length;},clearInterval(){},window:{confirm:message=>{confirmations.push(message);return confirm;}},prompt:()=>null});
 new vm.Script(inline).runInContext(context);
 const run=source=>vm.runInContext(source,context);
 const pending=(path,account)=>requests.find(r=>!r.settled&&new URL(r.url,'http://localhost').pathname===path&&(account===undefined||new URL(r.url,'http://localhost').searchParams.get('account')===account));
 const respond=(path,account,body,ok=true)=>{const r=pending(path,account);assert.ok(r,'pending '+path+' '+account);r.settled=true;r.resolve({ok,statusText:'fixture failure',json:async()=>body});return r;};
 return{nodes,node,requests,timers,confirmations,tabs,run,pending,respond,setConfirm(v){confirm=v;}};
}
const overview=account=>({account:{id:account,title:account},status:{connected:true,state:'READY',busy:null},player:{nickname:account},resources:[],items:{top:[]},heroes:{list:[]},failed:{}});
const fixture=(accountId='A',runner={},available=true)=>({accountId,available,unavailableReason:available?null:'玩家阵营尚未可靠核实（SIDE_UNVERIFIED），不会发送开战请求。',defaults:{enabled:false,retryDelaySeconds:10,maxAttempts:null,maxStage:null},runner:{runId:null,state:'IDLE',running:false,currentStage:41,nextStage:null,lastResult:null,attempts:0,consecutiveFailures:0,retryAt:null,history:[],stopReason:null,stopKind:null,uncertain:false,inFlight:false,config:null,...runner}});
async function boot(){const h=harness();h.respond('/api/accounts',undefined,{activeId:'A',accounts:[{id:'A',title:'A'},{id:'B',title:'B'}]});await tick();h.respond('/api/overview','A',overview('A'));await tick();return h;}
async function load(h,data=fixture()){const p=h.node('stages-load').onclick();h.respond('/api/stages',data.accountId,data);await p;}
function enable(h){h.node('stages-enabled').checked=true;h.node('stages-enabled').onchange();}
async function start(h,data=fixture('A',{state:'WAITING_RESULT',running:true,runId:'run-1',attempts:1,inFlight:true})){const p=h.node('stages-start').onclick();h.respond('/api/stages/start',data.accountId,data);await p;}

test('stage page loads cached status only on request and preserves the ordinary read-only POST boundary',async()=>{
 const h=await boot();assert.equal(h.pending('/api/stages','A'),undefined);await load(h,fixture('A',{},false));
 assert.ok(h.requests.every(r=>(r.options.method||'GET')==='GET'));assert.equal(h.node('stages-retry-delay').value,'10');assert.equal(h.node('stages-max-attempts').value,'');assert.equal(h.node('stages-max-stage').value,'');
 await assert.rejects(h.run("call('/api/stages/start',{method:'POST'})"),/只读/);
 assert.match(PAGE,/关闭页面不会停止服务端任务/);assert.match(PAGE,/不会发送跳过动画请求/);
});
test('unverified player side cannot be unlocked by the enable checkbox or a direct start click',async()=>{
 const h=await boot();await load(h,fixture('A',{},false));enable(h);assert.equal(h.node('stages-start').disabled,true);assert.match(h.node('stages-availability').textContent,/SIDE_UNVERIFIED/);
 const before=h.requests.length;await h.node('stages-start').onclick();assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);
});
test('start requires enable, READY connection and explicit per-run confirmation',async()=>{
 const h=await boot();await load(h);assert.equal(h.node('stages-start').disabled,true);enable(h);assert.equal(h.node('stages-start').disabled,false);
 h.setConfirm(false);const before=h.requests.length;await h.node('stages-start').onclick();assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,1);
 h.run("snapshot={connected:false,state:'CLOSED'}; stageControls()");assert.equal(h.node('stages-start').disabled,true);
});
test('authorized start sends only the scoped stage route with default 10 seconds and nullable limits',async()=>{
 const h=await boot();await load(h);enable(h);const p=h.node('stages-start').onclick(),r=h.pending('/api/stages/start','A');
 assert.equal(r.options.method,'POST');assert.deepEqual(JSON.parse(r.options.body),{config:{enabled:true,retryDelaySeconds:10,maxAttempts:null,maxStage:null},confirm:true});
 assert.equal(h.node('stages-start').disabled,true);assert.match(h.confirmations[0],/实际开战/);
 h.respond('/api/stages/start','A',fixture('A',{runId:'new-run',state:'WAITING_RESULT',running:true,inFlight:true,attempts:1}));await p;
 assert.match(h.node('stages-status').textContent,/战斗中/);assert.match(h.node('stages-status').textContent,/new-run/);assert.equal(h.node('stages-stop').disabled,false);assert.equal(h.node('refresh-data').disabled,true);
});
test('invalid counts do not request authorization or send a game mutation',async()=>{
 const h=await boot();await load(h);enable(h);h.node('stages-max-attempts').value='0';const before=h.requests.length;await h.node('stages-start').onclick();assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,0);assert.match(h.node('stages-hint').textContent,/正整数/);
});
test('late account A stage status cannot replace account B data',async()=>{
 const h=await boot();const old=h.node('stages-load').onclick();h.run("selectAccount('B'); snapshot={connected:true,state:'READY'}");const fresh=h.node('stages-load').onclick();h.respond('/api/stages','B',fixture('B',{currentStage:88}));await fresh;const text=h.node('stages-status').textContent;
 h.respond('/api/stages','A',fixture('A',{currentStage:999}));await old;assert.equal(h.node('stages-status').textContent,text);assert.match(text,/88/);assert.doesNotMatch(text,/999/);
});
test('superseded reads and an old run response cannot overwrite a newly started run',async()=>{
 const h=await boot();await load(h);const old=h.node('stages-load').onclick();enable(h);await start(h,fixture('A',{runId:'new-run',running:true,state:'WAITING_RESULT',inFlight:true}));
 h.respond('/api/stages','A',fixture('A',{runId:'old-run',state:'STOPPED'}));await old;assert.match(h.node('stages-status').textContent,/new-run/);assert.doesNotMatch(h.node('stages-status').textContent,/old-run/);
});
test('late start result cannot affect a newly selected account or launch another request',async()=>{
 const h=await boot();await load(h);enable(h);const p=h.node('stages-start').onclick();h.run("selectAccount('B');snapshot={connected:true,state:'READY'}");await load(h,fixture('B',{currentStage:88}));const text=h.node('stages-status').textContent;const count=h.requests.length;
 h.respond('/api/stages/start','A',fixture('A',{running:true,state:'WAITING_RESULT',runId:'old-A'}));await p;assert.equal(h.node('stages-status').textContent,text);assert.equal(h.requests.length,count);assert.doesNotMatch(text,/old-A/);
});
test('stop is local cancellation and an unresolved prior battle keeps restart disabled',async()=>{
 const h=await boot();await load(h,fixture('A',{runId:'run-1',running:true,state:'WAITING_RESULT',inFlight:true}));const p=h.node('stages-stop').onclick();const req=h.pending('/api/stages/stop','A');assert.deepEqual(JSON.parse(req.options.body),{});
 h.respond('/api/stages/stop','A',fixture('A',{runId:'run-1',state:'STOPPED',stopKind:'USER',stopReason:'用户停止',inFlight:true,uncertain:true}));await p;assert.match(h.node('stages-status').textContent,/用户主动停止/);assert.equal(h.node('stages-start').disabled,true);assert.match(h.node('stages-hint').textContent,/未决请求/);assert.equal(h.confirmations.length,0);
});
test('preview distinguishes victory, defeat, retry, normal completion, errors and unknown results',async()=>{
 const h=await boot();await load(h,fixture('A',{state:'WAIT_RETRY',runId:'r',running:true,attempts:3,consecutiveFailures:2,retryAt:Date.now()+10000,lastResult:{stage:41,outcome:'FAILED'},history:[{stage:40,attempt:1,outcome:'SUCCESS',at:'2026-11-10T00:00:00Z'},{stage:41,attempt:2,outcome:'FAILED'},{stage:41,attempt:3,outcome:'ERROR',reason:'响应超时'}]}));
 assert.match(h.node('stages-status').textContent,/战斗失败，等待重试/);assert.match(h.node('stages-history').textContent,/胜利/);assert.match(h.node('stages-history').textContent,/战败/);assert.match(h.node('stages-history').textContent,/异常/);assert.match(h.node('stages-history').textContent,/响应超时/);assert.match(h.node('stages-countdown').textContent,/秒/);
 await load(h,fixture('A',{state:'STOPPED',stopKind:'COMPLETED',stopReason:'达到目标',lastResult:{stage:42,outcome:'SUCCESS'}}));assert.match(h.node('stages-status').textContent,/正常完成/);assert.match(h.node('stages-status').textContent,/战斗胜利/);
 await load(h,fixture('A',{state:'STOPPED',stopKind:'ERROR',error:{message:'未知战斗结果'},lastResult:{stage:42,outcome:'UNKNOWN'},uncertain:true}));assert.match(h.node('stages-status').textContent,/异常停止/);assert.match(h.node('stages-status').textContent,/未知.*不能作为战败重试/);assert.equal(h.node('stages-start').disabled,true);
});
test('existing polling fetches stage cache only while its tab is selected, never starts or refreshes game data',async()=>{
 const h=await boot();assert.equal(h.timers.length,1);h.tabs.find(t=>t.dataset.tab==='stages').onclick();h.respond('/api/stages','A',fixture());await tick();
 const poll=h.timers[0].callback();h.respond('/api/overview','A',overview('A'));await tick();h.respond('/api/stages','A',fixture());await poll;
 assert.ok(h.requests.every(r=>(r.options.method||'GET')==='GET'));assert.equal(h.pending('/api/connect','A'),undefined);assert.equal(h.pending('/api/refresh','A'),undefined);
 h.tabs.find(t=>t.dataset.tab==='overview').onclick();const before=h.requests.length;const next=h.timers[0].callback();h.respond('/api/overview','A',overview('A'));await next;assert.equal(h.requests.length,before+1);
});
test('status reads retain unsaved configuration, account switch clears it, and account mismatches fail closed',async()=>{
 const h=await boot();await load(h);enable(h);h.node('stages-max-stage').value='65';h.node('stages-max-attempts').value='12';await load(h);assert.equal(h.node('stages-max-stage').value,'65');assert.equal(h.node('stages-max-attempts').value,'12');
 const p=h.node('stages-load').onclick();h.respond('/api/stages','A',fixture('B'));await p;assert.match(h.node('stages-hint').textContent,/账号不匹配/);assert.equal(h.node('stages-start').disabled,true);
 h.run("selectAccount('B')");assert.equal(h.node('stages-max-stage').value,'');assert.equal(h.node('stages-max-attempts').value,'');assert.equal(h.node('stages-enabled').checked,false);
});

test('failed status reads prevent new starts while preserving local stop for a previously running task',async()=>{
 const h=await boot();await load(h,fixture('A',{runId:'running-before-read-error',running:true,state:'WAIT_RETRY'}));
 const p=h.node('stages-load').onclick();h.respond('/api/stages','A',{error:'fixture read failure'},false);await p;
 assert.equal(h.node('stages-start').disabled,true);assert.equal(h.node('stages-stop').disabled,false);assert.match(h.node('stages-availability').textContent,/上次缓存状态/);assert.match(h.node('stages-hint').textContent,/fixture read failure/);
});

test('known running stages keep polling across tabs and completion restores ordinary refresh controls',async()=>{
 const h=await boot();await load(h,fixture('A',{runId:'r',state:'WAITING_RESULT',running:true,inFlight:true}));
 assert.equal(h.node('refresh-data').disabled,true);
 h.tabs.find(t=>t.dataset.tab==='overview').onclick();
 const poll=h.timers[0].callback();h.respond('/api/overview','A',overview('A'));await tick();
 h.respond('/api/stages','A',fixture('A',{runId:'r',state:'STOPPED',running:false,inFlight:false,stopKind:'COMPLETED'}));await poll;
 assert.equal(h.node('refresh-data').disabled,false);assert.match(h.node('stages-status').textContent,/正常完成/);
 const count=h.requests.length;const next=h.timers[0].callback();h.respond('/api/overview','A',overview('A'));await next;
 assert.equal(h.requests.length,count+1);assert.ok(h.requests.every(r=>(r.options.method||'GET')==='GET'));
});


test('B4 production defaults send the configured inter-stage delay without changing battle retry or limits',async()=>{
 const h=await boot(),data=fixture();data.defaults.interStageDelay={minSeconds:10,maxSeconds:11};await load(h,data);enable(h);
 assert.match(h.node('stages-delay-policy').textContent,/10–11 秒/);
 const p=h.node('stages-start').onclick(),req=h.pending('/api/stages/start','A');
 assert.deepEqual(JSON.parse(req.options.body),{config:{enabled:true,retryDelaySeconds:10,maxAttempts:null,maxStage:null,interStageDelay:{minSeconds:10,maxSeconds:11}},confirm:true});
 h.respond('/api/stages/start','A',fixture('A',{state:'WAITING_RESULT',running:true,runId:'paced'}));await p;
});

test('B4 next-stage countdown and selected random delay are distinct from defeat retry and keep start locked',async()=>{
 const h=await boot(),data=fixture('A',{runId:'paced',state:'WAIT_NEXT_STAGE',running:true,inFlight:false,nextStageAt:Date.now()+10500,currentStage:41,nextStage:42,config:{interStageDelay:{minSeconds:10,maxSeconds:11}},history:[{stage:41,attempt:1,outcome:'SUCCESS',interStageDelayMs:10537}]});
 await load(h,data);enable(h);
 assert.match(h.node('stages-status').textContent,/战斗胜利，等待下一关/);
 assert.match(h.node('stages-countdown').textContent,/下一关：约 .* 秒/);assert.doesNotMatch(h.node('stages-countdown').textContent,/重试/);
 assert.match(h.node('stages-history').textContent,/10.537 秒/);assert.equal(h.node('stages-start').disabled,true);assert.equal(h.node('stages-stop').disabled,false);
 const count=h.requests.length;h.run('updateStageCountdown()');assert.equal(h.requests.length,count);
 await load(h,fixture('A',{state:'STOPPED',stopKind:'USER',nextStageAt:null}));assert.equal(h.node('stages-countdown').textContent,'');
});

test('B4 rate limit renders a separate stopped classification and retains safe original time and reason',async()=>{
 const h=await boot();await load(h,fixture('A',{state:'STOPPED',stopKind:'ERROR',error:{code:'RATE_LIMITED',message:'server prompt: too frequent, retry later',at:'2026-11-10T11:47:32.059Z'},stopReason:'server prompt: too frequent, retry later',uncertain:true}));
 assert.match(h.node('stages-status').textContent,/服务器限频，已停止/);assert.match(h.node('stages-status').textContent,/RATE_LIMITED/);assert.match(h.node('stages-status').textContent,/too frequent, retry later/);assert.match(h.node('stages-status').textContent,/错误时间/);assert.equal(h.node('stages-start').disabled,true);
 await load(h,fixture('A',{state:'STOPPED',stopKind:'DEFEAT_STOPPED',lastResult:{stage:42,outcome:'FAILED'}}));assert.match(h.node('stages-status').textContent,/首次战败，已停止/);
});

test('B4 an explicit existing stopOnDefeat policy and custom delay survive a UI start',async()=>{
 const h=await boot();await load(h,fixture('A',{config:{enabled:false,retryDelaySeconds:7,maxAttempts:8,maxStage:90,stopOnDefeat:true,interStageDelay:{minSeconds:10.2,maxSeconds:10.9}}}));enable(h);
 const p=h.node('stages-start').onclick(),request=h.pending('/api/stages/start','A'),config=JSON.parse(request.options.body).config;
 assert.equal(config.stopOnDefeat,true);assert.deepEqual(config.interStageDelay,{minSeconds:10.2,maxSeconds:10.9});assert.equal(config.retryDelaySeconds,7);assert.equal(config.maxAttempts,8);assert.equal(config.maxStage,90);
 h.respond('/api/stages/start','A',fixture('A',{state:'WAITING_RESULT',running:true}));await p;
});
