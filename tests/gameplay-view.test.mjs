import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { GAMEPLAY_HTML, GAMEPLAY_SCRIPT } from '../src/gameplay-page.mjs';
import { PAGE, createAccountViewGuard } from '../src/page.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.value='';this.checked=false;this.disabled=false;this._text='';this.attrs={};}
 set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 set innerHTML(value){throw Error('unsafe HTML insertion');}appendChild(node){this.children.push(node);return node;}append(...nodes){nodes.forEach(n=>this.appendChild(n));}setAttribute(key,value){this.attrs[key]=String(value);}click(){return this.onclick?.();}
}
function harness(){const nodes=new Map(),requests=[],confirmations=[];let confirm=true;const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};const guard=createAccountViewGuard();guard.select('A');
 const ctx=vm.createContext({current:'A',snapshot:{connected:true,state:'READY',busy:null},viewGuard:guard,document:{createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag),createTextNode:text=>{const e=new Element();e.textContent=text;return e;},getElementById:node,querySelector:()=>null},$:node,window:{confirm(text){confirmations.push(text);return confirm;}},operationCosts:costs=>Array.isArray(costs)?costs.length?costs.map(r=>r.id+' × '+r.num).join(';'):'无资源消耗':'成本未知',call:(path,options,scope)=>new Promise((resolve,reject)=>requests.push({path,body:null,scope,resolve,reject,settled:false})),operationMutation:(path,body,scope)=>new Promise((resolve,reject)=>requests.push({path,body,scope,csrfToken:vm.runInContext('gameplayCsrfToken()',ctx),resolve,reject,settled:false}))});
 new vm.Script(GAMEPLAY_SCRIPT).runInContext(ctx);const run=source=>vm.runInContext(source,ctx);return {ctx,node,nodes,requests,confirmations,run,guard,setConfirm(value){confirm=value;},select(account){ctx.current=account;guard.select(account);run('resetGameplay()');},pending(path){return requests.find(r=>r.path===path&&!r.settled);},respond(path,data){const r=this.pending(path);assert.ok(r,'expected '+path);r.settled=true;r.resolve(data);return r;}};
}
const row=(id='safe-action')=>({actionId:id,actionType:'SAVE',label:'synthetic <img onerror=evil()>',target:{module:1,presetId:2},costs:[],costSource:'client proof',beforeState:{presetId:1},expectedState:{presetId:2},parameters:{presetId:2},action:{request:'SaveFormationRequest',response:'SaveFormationResponse',body:{}}});
function data(module='formation',accountId='A'){return {accountId,module,csrfToken:'synthetic-csrf-'+accountId,config:{enabled:true,mainlineEnabled:false},status:{running:false,blocked:false},view:{formation:{presetId:1,petUid:'9007199254740993',heroPositions:[{heroId:'tank',pos:{x:1,y:3}}]},layouts:[{id:1,reliable:true,positions:[{x:1,y:3}]},{id:2,reliable:true,positions:[{x:5,y:5}]}],unlockedPresetIds:[1,2],heroes:[{heroId:'tank',career:'坦克',reliable:true}],candidates:[row(),{...row('blocked'),action:null,blockedReason:'COST_UNKNOWN'}],blocked:[{reason:'missing battle side'}]},functions:['survey','plan']};}
const plan=()=>({accountId:'A',batchId:'batch-one',planHash:'exact-hash',mode:'Manual',actions:[{...row(),restoreParameters:{presetId:1,heroPositions:[{heroId:'tank',pos:{x:1,y:3}}]}}],resourceBudget:[],expiresAt:Date.now()+60000});
async function boot(module='formation'){const h=harness(),p=h.run('refreshGameplay('+JSON.stringify(module)+')');h.respond('/api/gameplay?module='+module,data(module));await p;return h;}
async function preview(h,module='formation'){h.node('gp-'+module+'-candidates').children[0].children[0].children[0].checked=true;h.node('gp-'+module+'-candidates').children[0].children[0].children[0].onchange();const p=h.node('gp-'+module+'-plan').onclick();h.respond('/api/operations/plan',{plan:plan()});await p;}
test('seven separate sections and controls mount without any implicit fetch or game call',()=>{const h=harness();assert.equal(h.requests.length,0);for(const id of ['formation','alliance','museum','treasure','fleet','naval','workflow'])assert.match(GAMEPLAY_HTML,new RegExp('id="tab-'+id+'"'));for(const id of ['formation','alliance','museum','treasure','fleet','naval'])assert.equal(h.node('gp-'+id+'-plan').disabled,true);assert.doesNotMatch(GAMEPLAY_SCRIPT,/innerHTML|eval\(/);});
test('cached facts use textContent for hostile strings and show blocked reasons and exact UID',async()=>{const h=await boot();assert.match(h.node('gp-formation-candidates').textContent,/<img onerror=evil\(\)>/);assert.match(h.node('gp-formation-candidates').textContent,/COST_UNKNOWN|client proof/);assert.match(h.node('gp-formation-facts').textContent,/9007199254740993/);assert.equal(h.node('gp-formation-candidates').children[1].children[0].children[0].disabled,true);assert.equal(h.run('gameplayCsrfToken()'),'synthetic-csrf-A');});
test('same-account token remains usable across repeated module reads but A→B→A invalidates it',async()=>{const h=await boot();const p=h.run("refreshGameplay('fleet')");h.respond('/api/gameplay?module=fleet',data('fleet'));await p;assert.equal(h.run('gameplayCsrfToken()'),'synthetic-csrf-A');h.select('B');assert.equal(h.run('gameplayCsrfToken()'),null);h.select('A');assert.equal(h.run('gameplayCsrfToken()'),null);assert.equal(h.node('gp-formation-candidates').textContent,'');});
test('late A reads cannot replace B state, including A→B→A and late errors',async()=>{for(const back of [false,true]){const h=harness(),p=h.run("refreshGameplay('formation')");h.select('B');if(back)h.select('A');h.respond('/api/gameplay?module=formation',data());await p;assert.equal(h.node('gp-formation-candidates').textContent,'');assert.equal(h.run('gameplayCsrfToken()'),null);}});
test('config and survey are explicit mutations and module payload cannot become protocol dispatch',async()=>{const h=await boot();h.node('gp-formation-config').value=JSON.stringify({enabled:false,mainlineEnabled:false});const saved=h.node('gp-formation-config-save').onclick();const req=h.pending('/api/gameplay/config');assert.deepEqual(JSON.parse(JSON.stringify(req.body)),{module:'formation',config:{enabled:false,mainlineEnabled:false}});h.respond('/api/gameplay/config',{accountId:'A',config:{enabled:false,mainlineEnabled:false}});await saved;h.node('gp-formation-parameters').value=JSON.stringify({presetId:2});const p=h.node('gp-formation-survey').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/gameplay/survey').body)),{module:'formation',parameters:{presetId:2}});h.respond('/api/gameplay/survey',data());await p;assert.ok(h.requests.every(r=>!r.path.includes('connect')));});
test('selected exact action plans through Manual mode and old preview invalidates on edit',async()=>{const h=await boot();await preview(h);const req=h.requests.find(r=>r.path==='/api/operations/plan');assert.deepEqual(JSON.parse(JSON.stringify(req.body)),{module:'formation',mode:'Manual',selections:['safe-action'],parameters:{presetId:2}});assert.match(h.node('gp-formation-plan-view').textContent,/exact-hash|batch-one/);assert.equal(h.node('gp-formation-authorize').disabled,false);h.node('gp-formation-parameters').value='{"presetId":1}';h.node('gp-formation-parameters').oninput();assert.equal(h.node('gp-formation-authorize').disabled,true);assert.equal(h.node('gp-formation-plan').disabled,true);});
test('cancelled confirmation sends no authorization; approval binds batch hash, actions and budget',async()=>{const h=await boot();await preview(h);h.setConfirm(false);await h.node('gp-formation-authorize').onclick();assert.equal(h.pending('/api/operations/authorize'),undefined);h.setConfirm(true);const run=h.node('gp-formation-authorize').onclick();const authorize=h.pending('/api/operations/authorize');assert.deepEqual(JSON.parse(JSON.stringify(authorize.body)),{batchId:'batch-one',planHash:'exact-hash',approvedActionIds:['safe-action'],resourceBudget:[],confirm:true});assert.match(h.confirmations.at(-1),/账号 A.*batch-one/);h.respond('/api/operations/authorize',{batchId:'batch-one',permitId:'permit-one'});await tick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/operations/execute').body)),{batchId:'batch-one',permitId:'permit-one'});h.respond('/api/operations/execute',{accountId:'A',status:{running:true}});await run;assert.equal(h.node('gp-formation-authorize').disabled,true);assert.equal(h.node('gp-formation-restore').disabled,false);h.node('gp-formation-restore').onclick();assert.equal(JSON.parse(h.node('gp-formation-parameters').value).presetId,1);assert.equal(h.node('gp-formation-authorize').disabled,true);});
test('account switch after authorization cannot dispatch execute for a late permit',async()=>{const h=await boot();await preview(h);const p=h.node('gp-formation-authorize').onclick();h.select('B');h.select('A');h.respond('/api/operations/authorize',{batchId:'batch-one',permitId:'late'});await p;assert.equal(h.pending('/api/operations/execute'),undefined);assert.equal(h.node('gp-formation-hint').textContent,'');});
test('parameter edit during pending preview discards stale plan before authorization',async()=>{const h=await boot();const input=h.node('gp-formation-candidates').children[0].children[0].children[0];input.checked=true;input.onchange();const p=h.node('gp-formation-plan').onclick();h.node('gp-formation-parameters').value='{"presetId":1}';h.node('gp-formation-parameters').oninput();h.respond('/api/operations/plan',{plan:plan()});await p;assert.equal(h.node('gp-formation-authorize').disabled,true);assert.doesNotMatch(h.node('gp-formation-plan-view').textContent,/exact-hash/);});
test('formation layout and hero controls produce business parameters while preserving pet read-only',async()=>{const h=await boot();h.node('gp-formation-template').value='2';h.node('gp-formation-career').onclick();assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),{presetId:2,heroIds:['tank']});h.node('gp-formation-manual').onclick();assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),{presetId:2,heroPositions:[{heroId:'tank',pos:{x:1,y:3}}]});assert.ok(!Object.hasOwn(JSON.parse(h.node('gp-formation-parameters').value),'petUid'));});
test('unknown or expired plans remain unavailable for authorize',async()=>{for(const change of [p=>p.expiresAt=0,p=>p.resourceBudget=null,p=>p.actions[0].costs=[{id:'GOLD',num:null}]]){const h=await boot();const input=h.node('gp-formation-candidates').children[0].children[0].children[0];input.checked=true;input.onchange();const pending=h.node('gp-formation-plan').onclick(),p=plan();change(p);h.respond('/api/operations/plan',{plan:p});await pending;assert.equal(h.node('gp-formation-authorize').disabled,true);}});
async function workflows(){const h=harness(),p=h.run('refreshWorkflows()');h.respond('/api/workflows',{accountId:'A',csrfToken:'wf-token',graphs:[{version:1,id:'saved',name:'Saved',nodes:[{id:'s',type:'START'},{id:'a',type:'ACTION',module:'formation',parameters:{presetId:2},selection:['safe-action']},{id:'end',type:'STOP'}],edges:[{from:'s',to:'a'},{from:'a',to:'end',when:'PASS'}]}],examples:[],status:{state:'IDLE'}});await p;return h;}
test('workflow graph loads, adds and deletes nodes and edges, edits branch conditions and draws SVG safely',async()=>{const h=await workflows();h.node('wf-saved').value='saved';h.node('wf-open').onclick();assert.equal(h.node('wf-nodes').children.length,3);assert.ok(h.node('wf-canvas').children.some(e=>e.tagName==='line'));h.node('wf-add').onclick();assert.equal(h.node('wf-nodes').children.length,4);h.node('wf-add-edge').onclick();assert.equal(h.node('wf-edges').children.length,3);const edge=h.node('wf-edges').children[2],branch=edge.children[2].children[1];branch.value='FAIL';branch.onchange();assert.equal(JSON.parse(h.node('wf-json').value).edges[2].when,'FAIL');const card=h.node('wf-nodes').children[3];card.children.at(-1).onclick();assert.equal(JSON.parse(h.node('wf-json').value).nodes.length,3);assert.ok(JSON.parse(h.node('wf-json').value).edges.every(e=>e.to!=='node-4'));});
test('workflow JSON preserves condition semantics and explicit graph order through save and simulate',async()=>{const h=await workflows();const graph={version:1,id:'rules',name:'<script>danger</script>',nodes:[{id:'start',type:'START'},{id:'branch',type:'BRANCH',condition:{source:'survey',path:['formation','presetId'],operator:'EQ',value:2}},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'branch'},{from:'branch',to:'stop',when:'PASS'},{from:'branch',to:'stop',when:'FAIL'}]};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').onclick();assert.equal(h.node('wf-nodes').children[1].children[1].children[1].value,'branch');const saved=h.node('wf-save').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/workflows/save').body)),{graph});h.respond('/api/workflows/save',{accountId:'A',status:{state:'IDLE'}});await saved;const sim=h.node('wf-simulate').onclick();h.respond('/api/workflows/simulate',{accountId:'A',simulation:{result:'PAUSED_AT_ACTION',steps:[]}});await sim;assert.match(h.node('wf-result').textContent,/PAUSED_AT_ACTION/);assert.equal(h.pending('/api/operations/authorize'),undefined);});
test('workflow ACTION renders exact pending plan without automatic authorization, then resume and stop are explicit',async()=>{const h=await workflows();const start=h.node('wf-start').onclick();h.respond('/api/workflows/start',{accountId:'A',status:{state:'AWAITING_AUTHORIZATION',pendingPlan:plan()}});await start;assert.match(h.node('wf-plan').textContent,/batch-one/);assert.equal(h.node('wf-authorize').disabled,false);assert.equal(h.pending('/api/operations/authorize'),undefined);const resume=h.node('wf-resume').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/workflows/resume').body)),{});h.respond('/api/workflows/resume',{accountId:'A',status:{state:'STOPPED'}});await resume;const stop=h.node('wf-stop').onclick();h.respond('/api/workflows/stop',{accountId:'A',status:{state:'STOPPED'}});await stop;assert.ok(h.requests.every(r=>!r.path.includes('ChallengeStage')));});
test('late workflow mutation after A→B→A cannot restore pending action or token',async()=>{const h=await workflows(),p=h.node('wf-start').onclick();h.select('B');h.select('A');h.respond('/api/workflows/start',{accountId:'A',status:{state:'AWAITING_AUTHORIZATION',pendingPlan:plan()}});await p;assert.equal(h.node('wf-plan').textContent,'');assert.equal(h.run('gameplayCsrfToken()'),null);});


test('three-second cache polling preserves local configuration drafts and edited parameters until explicit survey',async()=>{const h=await boot();const draft='{"enabled":false,"mainlineEnabled":true}';h.node('gp-formation-config').value=draft;h.node('gp-formation-config').oninput();h.node('gp-formation-parameters').value='{"presetId":1}';h.node('gp-formation-parameters').oninput();const p=h.run("gameplayPoll('formation')");h.respond('/api/gameplay?module=formation',data());await p;assert.equal(h.node('gp-formation-config').value,draft);assert.equal(h.node('gp-formation-parameters').value,'{"presetId":1}');assert.equal(h.node('gp-formation-plan').disabled,true);assert.equal(h.node('gp-formation-candidates').children[0].children[0].children[0].disabled,true);});
test('matching cached plan stays available and polling never creates another survey or authorization',async()=>{const h=await boot();await preview(h);const p=h.run("gameplayPoll('formation')");h.respond('/api/gameplay?module=formation',{...data(),lastPlan:plan()});await p;assert.equal(h.node('gp-formation-authorize').disabled,false);assert.equal(h.requests.filter(r=>r.path==='/api/operations/plan').length,1);assert.equal(h.pending('/api/operations/authorize'),undefined);});
test('workflow stage module defaults off and its setting is account-local and explicit',async()=>{const h=await workflows();const p=h.node('wf-stage-load').onclick();h.respond('/api/gameplay?module=stage',{accountId:'A',module:'stage',csrfToken:'stage-token',config:{enabled:false}});await p;assert.equal(h.node('wf-stage-enabled').checked,false);h.node('wf-stage-enabled').checked=true;const saved=h.node('wf-stage-save').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/gameplay/config').body)),{module:'stage',config:{enabled:true}});h.respond('/api/gameplay/config',{accountId:'A',module:'stage',config:{enabled:true}});await saved;h.select('B');assert.equal(h.node('wf-stage-enabled').checked,false);assert.equal(h.node('wf-stage-save').disabled,true);});
test('safe server-cropped candidate with executable=true remains selectable without exposing action body',async()=>{const h=harness(),p=h.run("refreshGameplay('formation')"),value=data();delete value.view.candidates[0].action;value.view.candidates[0].executable=true;h.respond('/api/gameplay?module=formation',value);await p;assert.equal(h.node('gp-formation-candidates').children[0].children[0].children[0].disabled,false);});


test('ACTION candidate collection uses only read-only survey and selects the exact executable server action',async()=>{const h=await workflows();h.node('wf-saved').value='saved';h.node('wf-open').onclick();const card=h.node('wf-nodes').children[1],button=card.children.find(e=>e.dataset.workflowCandidate==='a');const task=button.onclick();const request=h.pending('/api/gameplay/survey');assert.deepEqual(JSON.parse(JSON.stringify(request.body)),{module:'formation',parameters:{presetId:2}});const body=data();delete body.view.candidates[0].action;body.view.candidates[0].executable=true;h.respond('/api/gameplay/survey',body);await task;const fresh=h.node('wf-nodes').children[1],select=fresh.children.find(e=>e.dataset.workflowSelection==='a');assert.ok(select);assert.equal(select.children[2].disabled,true);select.value='safe-action';select.onchange();assert.equal(JSON.parse(h.node('wf-json').value).nodes[1].selection,'safe-action');assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);});
test('late ACTION candidate replies cannot cross account generations or replace edited nodes',async()=>{for(const switchAccount of [false,true]){const h=await workflows();h.node('wf-saved').value='saved';h.node('wf-open').onclick();const button=h.node('wf-nodes').children[1].children.find(e=>e.dataset.workflowCandidate==='a'),task=button.onclick();if(switchAccount){h.select('B');h.select('A');}else{const graph=JSON.parse(h.node('wf-json').value);graph.nodes[1].parameters={presetId:1};h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').onclick();}h.respond('/api/gameplay/survey',data());await task;assert.ok(!h.node('wf-nodes').children.some(card=>card.children.some(e=>e.dataset.workflowSelection==='a')));assert.equal(h.pending('/api/operations/authorize'),undefined);}});

test('workflow resume accepts only its own retained run lock and cannot survive account changes',async()=>{
 const h=await workflows();
 const refresh=h.run('refreshWorkflows()');
 h.ctx.snapshot.busy='workflow:wf-current';
 h.respond('/api/workflows',{accountId:'A',csrfToken:'wf-token',status:{status:'AWAITING_AUTHORIZATION',runId:'wf-current',running:true}});
 await refresh;
 assert.equal(h.node('wf-resume').disabled,false);
 assert.equal(h.node('wf-start').disabled,true);
 const update=async()=>{const task=h.run('refreshWorkflows()');h.respond('/api/workflows',{accountId:'A',csrfToken:'wf-token',status:{status:'AWAITING_AUTHORIZATION',runId:'wf-current',running:true}});await task;};
 for(const busy of ['workflow:wf-other','operations:EXECUTING']){
  h.ctx.snapshot.busy=busy;await update();
  assert.equal(h.node('wf-resume').disabled,true);
 }
 h.ctx.snapshot.busy='workflow:wf-current';h.ctx.snapshot.connected=false;await update();
 assert.equal(h.node('wf-resume').disabled,true);
 h.ctx.snapshot.connected=true;await update();
 assert.equal(h.node('wf-resume').disabled,false);
 h.select('B');h.select('A');
 assert.equal(h.node('wf-resume').disabled,true);
 assert.equal(h.run('gameplayCsrfToken()'),null);
 assert.equal(h.pending('/api/workflows/resume'),undefined);
 assert.equal(h.pending('/api/operations/authorize'),undefined);
});

test('formation selected-template preview draws confirmed coordinates and updates locally without requests',async()=>{
 const h=await boot(),box=h.node('gp-formation-layout');
 assert.match(box.textContent,/模板 1.*已解锁/);assert.match(box.textContent,/\(1, 3\)/);assert.match(box.textContent,/当前英雄：tank/);
 assert.equal(box.children.at(-1).children[0].style.gridRow,'1');
 const requests=h.requests.length,parameters=h.node('gp-formation-parameters').value;
 h.node('gp-formation-template').value='2';h.node('gp-formation-template').onchange();
 assert.match(box.textContent,/模板 2.*已解锁/);assert.match(box.textContent,/\(5, 5\)/);assert.doesNotMatch(box.textContent,/当前英雄：tank|\(1, 3\)/);
 assert.equal(h.requests.length,requests);assert.equal(h.node('gp-formation-parameters').value,parameters);
 const poll=h.run("gameplayPoll('formation')");h.respond('/api/gameplay?module=formation',data());await poll;
 assert.equal(h.node('gp-formation-template').value,'2');assert.match(box.textContent,/模板 2.*已解锁/);
});

test('formation preview marks unknown layouts, supports minimal DOM and clears across account generations',async()=>{
 const h=harness(),create=h.ctx.document.createElement;h.ctx.document.createElement=tag=>{const e=create(tag);e.style=undefined;e.setAttribute=undefined;return e;};
 const value=data();value.view.layouts.push({id:3,reliable:false,positions:[{x:8,y:8}]});
 const read=h.run("refreshGameplay('formation')");h.respond('/api/gameplay?module=formation',value);await read;
 const box=h.node('gp-formation-layout');assert.match(box.textContent,/\(1, 3\)/);
 for(const id of ['3','999']){h.node('gp-formation-template').value=id;h.node('gp-formation-template').onchange();assert.match(box.textContent,/未解锁/);assert.match(box.textContent,/布局未知或坐标未经证实/);assert.equal(box.children.length,2);}
 h.select('B');assert.equal(box.textContent,'');h.select('A');assert.equal(box.textContent,'');
 h.node('gp-formation-template').value='1';h.node('gp-formation-template').onchange();assert.match(box.textContent,/尚未读取本账号模板布局/);assert.doesNotMatch(box.textContent,/tank|\(1, 3\)/);
 assert.equal(h.requests.length,1);assert.equal(h.pending('/api/operations/authorize'),undefined);
});

function allianceData(){const value=data('alliance');value.view={guildId:'10',playerId:'1',members:[{playerId:'9007199254740993',nickname:'<script>same</script>',title:1,online:false},{playerId:'9007199254740994',nickname:'<script>same</script>',title:2}],requests:[{reqId:'9007199254740995',askerId:'9007199254740993',itemId:'小麦',endTime:12345}],ownRequests:[{reqId:'7',itemId:'小麦',helperId:null,helperKnown:true,endTime:12346}],dailyLimits:{ask:4,help:null,order:0},technologies:[{techId:101,name:'科技 <img>',level:2,targetLevel:3,costs:[{id:'公会科技点',num:17}],costSource:'client formula',prerequisites:{stage:1},blockedReason:'MODULE_DISABLED'},{techId:102,name:'未知等级',level:null,targetLevel:null,costs:null,blockedReason:'TECH_LEVEL_UNKNOWN'}],candidates:[row()],blocked:[{blockedReason:'HELP_DAILY_LIMIT_OR_COOLDOWN_UNKNOWN'}]};return value;}
async function allianceBoot(){const h=harness(),p=h.run("refreshGameplay('alliance')");h.respond('/api/gameplay?module=alliance',allianceData());await p;return h;}
const allianceButtons=h=>{const found=[];const visit=e=>{if(e.dataset.allianceSelect)found.push(e);for(const child of e.children)visit(child);};visit(h.node('gp-alliance-facts'));return found;};
test('alliance professional tables preserve exact IDs, show unknown limits and render untrusted names as text',async()=>{const h=await allianceBoot(),text=h.node('gp-alliance-facts').textContent;for(const expected of ['9007199254740993','9007199254740994','9007199254740995','<script>same</script>','帮助剩余：UNKNOWN','订单剩余：0','公会科技点 × 17','MODULE_DISABLED','TECH_LEVEL_UNKNOWN'])assert.ok(text.includes(expected),expected);assert.equal(allianceButtons(h)[2].disabled,true);assert.equal(h.pending('/api/operations/authorize'),undefined);});
test('alliance request and technology selection only sets exact business parameters and invalidates previous authorization',async()=>{const h=await allianceBoot();await preview(h,'alliance');assert.equal(h.node('gp-alliance-authorize').disabled,false);allianceButtons(h)[0].onclick();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{reqIds:['9007199254740995'],memberIds:['9007199254740993'],itemIds:['小麦']});assert.equal(h.node('gp-alliance-authorize').disabled,true);assert.equal(h.node('gp-alliance-plan').disabled,true);allianceButtons(h)[1].onclick();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{techId:101,targetLevel:3});assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);assert.equal(h.pending('/api/gameplay/survey'),undefined);const task=h.node('gp-alliance-survey').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/gameplay/survey').body)),{module:'alliance',parameters:{techId:101,targetLevel:3}});h.respond('/api/gameplay/survey',allianceData());await task;});
test('alliance selection cannot mutate a pending survey or retain previous account facts',async()=>{const h=await allianceBoot(),buttons=allianceButtons(h),task=h.node('gp-alliance-survey').onclick();assert.equal(buttons[0].disabled,true);buttons[0].onclick();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});h.select('B');h.select('A');h.respond('/api/gameplay/survey',allianceData());await task;assert.equal(h.node('gp-alliance-facts').textContent,'');buttons[1].onclick();assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{});assert.equal(h.pending('/api/operations/execute'),undefined);});
test('alliance cached polling preserves selected technology draft and never generates an implicit write',async()=>{const h=await allianceBoot();allianceButtons(h)[1].onclick();const task=h.run("gameplayPoll('alliance')");h.respond('/api/gameplay?module=alliance',allianceData());await task;assert.deepEqual(JSON.parse(h.node('gp-alliance-parameters').value),{techId:101,targetLevel:3});assert.equal(h.node('gp-alliance-plan').disabled,true);assert.equal(h.requests.filter(r=>r.body).length,0);});

const coreSettingData=(module,accountId='A',enabled=false)=>({accountId,module,csrfToken:'core-settings-'+accountId,config:{enabled}});
async function loadWorkflowSetting(h,module,accountId='A',enabled=false){const pending=h.node('wf-'+module+'-load').onclick();h.respond('/api/gameplay?module='+module,coreSettingData(module,accountId,enabled));await pending;}

for(const module of ['orders','city','production'])test('workflow '+module+' enable is explicit, account scoped and sends only local configuration through current CSRF',async()=>{
 const h=harness();
 for(const suffix of ['load','enabled','save','hint'])assert.match(GAMEPLAY_HTML,new RegExp('id="wf-'+module+'-'+suffix+'"'));
 assert.equal(h.node('wf-'+module+'-enabled').checked,false);assert.equal(h.node('wf-'+module+'-enabled').disabled,true);assert.equal(h.node('wf-'+module+'-save').disabled,true);
 await h.node('wf-'+module+'-save').onclick();assert.equal(h.requests.length,0);
 await loadWorkflowSetting(h,module);const read=h.requests[0];assert.equal(read.path,'/api/gameplay?module='+module);assert.equal(read.scope.account,'A');assert.equal(h.node('wf-'+module+'-enabled').checked,false);assert.equal(h.node('wf-'+module+'-enabled').disabled,false);
 h.node('wf-'+module+'-enabled').checked=true;h.node('wf-'+module+'-enabled').onchange();assert.equal(h.requests.length,1);assert.match(h.node('wf-'+module+'-hint').textContent,/尚未保存/);
 const save=h.node('wf-'+module+'-save').onclick(),request=h.pending('/api/gameplay/config');assert.deepEqual(JSON.parse(JSON.stringify(request.body)),{module,config:{enabled:true}});assert.equal(request.scope.account,'A');assert.equal(request.csrfToken,'core-settings-A');assert.equal(h.node('wf-'+module+'-save').disabled,true);
 h.respond('/api/gameplay/config',coreSettingData(module,'A',true));await save;assert.match(h.node('wf-'+module+'-hint').textContent,/已保存/);
 assert.deepEqual(h.requests.filter(r=>r.body).map(r=>r.path),['/api/gameplay/config']);assert.equal(h.pending('/api/gameplay/survey'),undefined);assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
 h.select('B');assert.equal(h.node('wf-'+module+'-enabled').checked,false);assert.equal(h.node('wf-'+module+'-save').disabled,true);assert.equal(h.run('gameplayCsrfToken()'),null);
 await loadWorkflowSetting(h,module,'B');h.node('wf-'+module+'-enabled').checked=true;const savedB=h.node('wf-'+module+'-save').onclick(),requestB=h.pending('/api/gameplay/config');assert.equal(requestB.scope.account,'B');assert.equal(requestB.csrfToken,'core-settings-B');h.respond('/api/gameplay/config',coreSettingData(module,'B',true));await savedB;
 h.select('A');assert.equal(h.node('wf-'+module+'-enabled').checked,false);assert.equal(h.node('wf-'+module+'-save').disabled,true);
});

test('core Workflow setting reads fail closed for wrong account/module, malformed config or missing current CSRF',async()=>{
 for(const change of [v=>v.accountId='B',v=>v.module='fleet',v=>v.config.enabled='true',v=>v.config={enabled:false,request:'ArbitraryRequest'},v=>delete v.csrfToken]){
  const h=harness(),pending=h.node('wf-orders-load').onclick(),value=coreSettingData('orders');change(value);h.respond('/api/gameplay?module=orders',value);await pending;
  assert.equal(h.node('wf-orders-save').disabled,true);assert.equal(h.node('wf-orders-enabled').disabled,true);const count=h.requests.length;await h.node('wf-orders-save').onclick();assert.equal(h.requests.length,count);assert.equal(h.pending('/api/gameplay/config'),undefined);
 }
});

test('core Workflow settings discard A to B to A late reads and do not restore old configuration or token',async()=>{
 for(const module of ['orders','city','production']){
  const h=harness(),old=h.node('wf-'+module+'-load').onclick();h.select('B');h.select('A');
  h.respond('/api/gameplay?module='+module,coreSettingData(module,'A',true));await old;
  assert.equal(h.node('wf-'+module+'-enabled').checked,false);assert.equal(h.node('wf-'+module+'-save').disabled,true);assert.equal(h.node('wf-'+module+'-hint').textContent,'');assert.equal(h.run('gameplayCsrfToken()'),null);
  await loadWorkflowSetting(h,module);assert.equal(h.node('wf-'+module+'-enabled').checked,false);assert.equal(h.node('wf-'+module+'-save').disabled,false);
 }
});

test('late configuration saves and errors cannot change a newer account generation or its current setting',async()=>{
 for(const fail of [false,true]){
  const h=harness();await loadWorkflowSetting(h,'production');h.node('wf-production-enabled').checked=true;const old=h.node('wf-production-save').onclick(),oldRequest=h.pending('/api/gameplay/config');
  h.select('B');h.select('A');await loadWorkflowSetting(h,'production');const current=h.node('wf-production-hint').textContent,token=h.run('gameplayCsrfToken()');
  if(fail){oldRequest.settled=true;oldRequest.reject(Error('old account <img onerror=alert(1)>'));}else h.respond('/api/gameplay/config',coreSettingData('production','A',true));await old;
  assert.equal(h.node('wf-production-enabled').checked,false);assert.equal(h.node('wf-production-save').disabled,false);assert.equal(h.node('wf-production-hint').textContent,current);assert.equal(h.run('gameplayCsrfToken()'),token);assert.equal(h.pending('/api/operations/execute'),undefined);
 }
});

test('Workflow core setting edits clear candidate previews and pending plan without authorizing or dispatching',async()=>{
 const h=await workflows();await loadWorkflowSetting(h,'orders');h.node('wf-saved').value='saved';h.node('wf-open').onclick();
 const action=h.node('wf-nodes').children[1],modules=action.children.find(e=>e.children?.[0]?.textContent==='玩法 ').children[1];for(const id of ['orders','city','production'])assert.ok(modules.children.some(option=>option.value===id));
 const collect=action.children.find(e=>e.dataset.workflowCandidate==='a').onclick();h.respond('/api/gameplay/survey',data());await collect;
 assert.ok(h.node('wf-nodes').children[1].children.some(e=>e.dataset.workflowSelection==='a'));
 const refreshed=h.run('refreshWorkflows()');h.respond('/api/workflows',{accountId:'A',csrfToken:'core-settings-A',status:{status:'AWAITING_AUTHORIZATION',plan:plan()}});await refreshed;assert.equal(h.node('wf-authorize').disabled,false);
 h.node('wf-orders-enabled').checked=true;h.node('wf-orders-enabled').onchange();assert.equal(h.node('wf-authorize').disabled,true);assert.equal(h.node('wf-plan').textContent,'');assert.ok(!h.node('wf-nodes').children[1].children.some(e=>e.dataset.workflowSelection==='a'));
 assert.equal(h.pending('/api/gameplay/config'),undefined);assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
});

test('Workflow setting pending state prevents duplicate writes and failures require a fresh explicit read',async()=>{
 const h=harness();await loadWorkflowSetting(h,'city');h.node('wf-city-enabled').checked=true;
 const pending=h.node('wf-city-save').onclick(),request=h.pending('/api/gameplay/config');const count=h.requests.length;await h.node('wf-city-save').onclick();await h.node('wf-orders-load').onclick();assert.equal(h.requests.length,count);
 request.settled=true;request.reject(Error('<img onerror=alert(1)> local save rejected'));await pending;assert.equal(h.node('wf-city-save').disabled,true);assert.equal(h.node('wf-city-enabled').disabled,true);assert.match(h.node('wf-city-hint').textContent,/<img onerror=alert\(1\)> local save rejected/);
 await h.node('wf-city-save').onclick();assert.equal(h.requests.length,count);await loadWorkflowSetting(h,'city');assert.equal(h.node('wf-city-save').disabled,false);
 h.ctx.snapshot.busy='workflow:running';const before=h.requests.length;await h.node('wf-city-save').onclick();assert.equal(h.requests.length,before);
});

test('changing a Workflow core setting rejects an earlier in-flight candidate response',async()=>{
 const h=await workflows();await loadWorkflowSetting(h,'orders');h.node('wf-saved').value='saved';h.node('wf-open').onclick();
 const collect=h.node('wf-nodes').children[1].children.find(e=>e.dataset.workflowCandidate==='a').onclick();h.node('wf-orders-enabled').checked=true;h.node('wf-orders-enabled').onchange();
 h.respond('/api/gameplay/survey',data());await collect;
 assert.ok(!h.node('wf-nodes').children[1].children.some(e=>e.dataset.workflowSelection==='a'));assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
});

function cargoUiData(accountId='A'){
 const value=data('fleet',accountId),fillId='fleet:cargoFill:1:1',blockedId='fleet:cargoFill:1:2',claimId='fleet:cargoClaim:2';
 const cargoRow=(actionId,actionType,target,costs,parameters,blockedReason=null)=>({actionId,actionType,label:actionType,target,costs,parameters,executable:!blockedReason,blockedReason,costSource:'CargoShipsResponse original typed asset',beforeState:{ship:{index:target.shipIndex}},expectedState:{verifiedBy:'authoritative cargo and exact inventory'}});
 value.config={enabled:true,cargoFill:true,cargoClaim:true};
 value.view={candidates:[
  cargoRow(fillId,'cargoFill',{shipIndex:1,cargoIndex:1},[{id:'<img onerror=evil()>',num:6}],{shipIndex:1,cargoIndex:1}),
  cargoRow(blockedId,'cargoFill',{shipIndex:1,cargoIndex:2},[{id:'<img onerror=evil()>',num:6}],{shipIndex:1,cargoIndex:2},'INSUFFICIENT_CARGO_MATERIALS'),
  cargoRow(claimId,'cargoClaim',{shipIndex:2},[],{shipIndex:2})
 ],blocked:[],cargo:{source:'CargoShipsResponse',reliable:true,inventoryReliable:true,notes:['每船每批一个航次动作'],ships:[
  {shipIndex:1,status:0,statusText:'采购中',arriveTime:0,reliable:true,claimActionId:null,slots:[
   {cargoIndex:1,id:'<img onerror=evil()>',type:0,required:6,have:10,missing:0,filled:false,reliable:true,reason:null,actionId:fillId},
   {cargoIndex:2,id:'<img onerror=evil()>',type:0,required:6,have:10,missing:0,filled:false,reliable:true,reason:'INSUFFICIENT_CARGO_MATERIALS',actionId:blockedId}
  ]},
  {shipIndex:2,status:2,statusText:'已返回',arriveTime:100,reliable:true,claimActionId:claimId,slots:[]},
  {shipIndex:3,status:null,statusText:'未知',arriveTime:null,reliable:false,reason:'CARGO_SHIP_UNRELIABLE',claimActionId:null,slots:[
   {cargoIndex:1,id:'未知物品',type:null,required:null,have:null,missing:null,filled:null,reliable:false,reason:'CARGO_FACTS_UNRELIABLE',actionId:null}
  ]}
 ],shortages:[{id:'<img onerror=evil()>',type:0,required:12,have:10,missing:2,reliable:true}]}};
 return value;
}
async function cargoUiBoot(value=cargoUiData()){
 const h=harness(),pending=h.run("refreshGameplay('fleet')");h.respond('/api/gameplay?module=fleet',value);await pending;return h;
}
function cargoUiButtons(h){
 const result=[],visit=node=>{if(node.dataset.cargoAction)result.push(node);for(const child of node.children)visit(child);};visit(h.node('gp-fleet-cargo'));return result;
}
function cargoUiPlan(actionId='fleet:cargoFill:1:1'){
 const selected=cargoUiData().view.candidates.find(row=>row.actionId===actionId);
 return {accountId:'A',batchId:'cargo-batch',planHash:'cargo-exact-hash',mode:'Manual',actions:[structuredClone(selected)],resourceBudget:structuredClone(selected.costs),expiresAt:Date.now()+60000};
}
async function cargoUiPreview(h,actionId='fleet:cargoFill:1:1'){
 cargoUiButtons(h).find(button=>button.dataset.cargoAction===actionId).onclick();
 const pending=h.node('gp-fleet-plan').onclick();h.respond('/api/operations/plan',{plan:cargoUiPlan(actionId)});await pending;
}
test('Cargo professional view shows authoritative per-slot numbers and aggregated shortage once using safe text',async()=>{
 const h=await cargoUiBoot(),box=h.node('gp-fleet-cargo');
 assert.match(GAMEPLAY_HTML,/id="gp-fleet-cargo"/);for(const text of ['CargoShipsResponse','采购中','已返回','货船 3','CARGO_SHIP_UNRELIABLE','未知物品','<img onerror=evil()>','每船每批一个航次动作'])assert.ok(box.textContent.includes(text),text);
 const summary=box.children.find(node=>node.tagName==='table');assert.deepEqual(summary.children[1].children.map(node=>node.textContent),['<img onerror=evil()>','12','10','2']);
 const purchase=box.children.find(node=>node.tagName==='article'),table=purchase.children.find(node=>node.tagName==='table');
 assert.deepEqual(table.children[1].children.slice(0,5).map(node=>node.textContent),['1','<img onerror=evil()>','6','10','0']);
 assert.deepEqual(table.children[2].children.slice(0,5).map(node=>node.textContent),['2','<img onerror=evil()>','6','10','0']);
 const unknown=box.children.filter(node=>node.tagName==='article')[2].children.find(node=>node.tagName==='table');assert.deepEqual(unknown.children[1].children.slice(2,5).map(node=>node.textContent),['未知','未知','未知']);
 assert.equal(h.requests.length,1);assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
});
test('Cargo slot and arrival buttons select exact existing Fleet candidates and Manual plan without implicit authorization',async()=>{
 const h=await cargoUiBoot(),buttons=cargoUiButtons(h);assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);assert.equal(buttons[2].disabled,false);
 await cargoUiPreview(h);const request=h.requests.find(row=>row.path==='/api/operations/plan');
 assert.deepEqual(JSON.parse(JSON.stringify(request.body)),{module:'fleet',mode:'Manual',selections:['fleet:cargoFill:1:1'],parameters:{shipIndex:1,cargoIndex:1}});
 assert.equal(h.node('gp-fleet-authorize').disabled,false);assert.match(h.node('gp-fleet-plan-view').textContent,/cargo-exact-hash/);
 buttons[2].onclick();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{shipIndex:2});assert.equal(h.node('gp-fleet-authorize').disabled,true);
 const pending=h.node('gp-fleet-plan').onclick();const claimRequest=h.pending('/api/operations/plan');assert.deepEqual(JSON.parse(JSON.stringify(claimRequest.body)),{module:'fleet',mode:'Manual',selections:['fleet:cargoClaim:2'],parameters:{shipIndex:2}});
 h.respond('/api/operations/plan',{plan:cargoUiPlan('fleet:cargoClaim:2')});await pending;
 assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);assert.equal(h.pending('/api/gameplay/survey'),undefined);
});
test('Cargo buttons remain disabled for blocked or missing exact candidates and busy or stale local state',async()=>{
 for(const change of [
 value=>value.status.blocked=true,value=>value.status.running=true,
 value=>{value.view.candidates[0].executable=false;value.view.candidates[0].blockedReason='UNKNOWN';},
 value=>value.view.candidates.shift()
 ]){
  const value=cargoUiData();change(value);const h=await cargoUiBoot(value),button=cargoUiButtons(h)[0],before=h.node('gp-fleet-parameters').value;
  assert.equal(button.disabled,true);button.onclick();assert.equal(h.node('gp-fleet-parameters').value,before);assert.equal(h.requests.length,1);
 }
 for(const set of [async h=>{h.ctx.snapshot.busy='workflow:other';const pending=h.node('gp-fleet-load').onclick();h.respond('/api/gameplay?module=fleet',cargoUiData());await pending;},async h=>{h.ctx.snapshot.connected=false;const pending=h.node('gp-fleet-load').onclick();h.respond('/api/gameplay?module=fleet',cargoUiData());await pending;},h=>h.node('gp-fleet-parameters').oninput(),h=>h.node('gp-fleet-config').oninput()]){
  const h=await cargoUiBoot();await set(h);const button=cargoUiButtons(h)[0],before=h.node('gp-fleet-parameters').value;assert.equal(button.disabled,true);button.onclick();assert.equal(h.node('gp-fleet-parameters').value,before);assert.equal(h.pending('/api/operations/plan'),undefined);
 }
});
test('Cargo pending survey disables detached buttons and account generations discard late facts and permits',async()=>{
 const h=await cargoUiBoot(),buttons=cargoUiButtons(h),task=h.node('gp-fleet-survey').onclick();
 assert.equal(buttons[0].disabled,true);buttons[0].onclick();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{});
 h.select('B');h.select('A');h.respond('/api/gameplay/survey',cargoUiData());await task;
 assert.equal(h.node('gp-fleet-cargo').textContent,'');assert.equal(h.node('gp-fleet-facts').textContent,'');assert.equal(h.run('gameplayCsrfToken()'),null);
 buttons[2].onclick();assert.deepEqual(JSON.parse(h.node('gp-fleet-parameters').value),{});assert.equal(h.pending('/api/operations/execute'),undefined);
 const live=await cargoUiBoot();await cargoUiPreview(live);const authorize=live.node('gp-fleet-authorize').onclick();live.select('B');live.select('A');
 live.respond('/api/operations/authorize',{batchId:'cargo-batch',permitId:'late-cargo-permit'});await authorize;assert.equal(live.pending('/api/operations/execute'),undefined);assert.equal(live.node('gp-fleet-cargo').textContent,'');
});
test('Cargo edited parameters discard a late preview and cached polling preserves the draft',async()=>{
 const h=await cargoUiBoot();cargoUiButtons(h)[0].onclick();const pending=h.node('gp-fleet-plan').onclick();
 const draft='{"shipIndex":9,"cargoIndex":2}';h.node('gp-fleet-parameters').value=draft;h.node('gp-fleet-parameters').oninput();
 h.respond('/api/operations/plan',{plan:cargoUiPlan()});await pending;assert.equal(h.node('gp-fleet-authorize').disabled,true);assert.doesNotMatch(h.node('gp-fleet-plan-view').textContent,/cargo-exact-hash/);
 const poll=h.run("gameplayPoll('fleet')");h.respond('/api/gameplay?module=fleet',cargoUiData());await poll;
 assert.equal(h.node('gp-fleet-parameters').value,draft);assert.equal(cargoUiButtons(h)[0].disabled,true);assert.equal(h.node('gp-fleet-plan').disabled,true);assert.equal(h.pending('/api/operations/authorize'),undefined);
});
test('port Workflow projection reuses Fleet survey and exact action selection without a second cargo executor',async()=>{
 const h=await workflows(),graph={version:1,id:'port',name:'港口',nodes:[{id:'start',type:'START'},{id:'cargo',type:'ACTION',module:'fleet',parameters:{shipIndex:1,cargoIndex:1}},{id:'stop',type:'STOP'}],edges:[{from:'start',to:'cargo'},{from:'cargo',to:'stop'}]};
 h.node('wf-json').value=JSON.stringify(graph);h.node('wf-json-apply').onclick();
 const card=h.node('wf-nodes').children[1],pending=card.children.find(node=>node.dataset.workflowCandidate==='cargo').onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/gameplay/survey').body)),{module:'fleet',parameters:{shipIndex:1,cargoIndex:1}});
 h.respond('/api/gameplay/survey',cargoUiData());await pending;
 const fresh=h.node('wf-nodes').children[1],select=fresh.children.find(node=>node.dataset.workflowSelection==='cargo');
 assert.equal(select.children[2].disabled,true);select.value='fleet:cargoFill:1:1';select.onchange();
 const selected=JSON.parse(h.node('wf-json').value).nodes[1];assert.equal(selected.module,'fleet');assert.equal(selected.selection,'fleet:cargoFill:1:1');assert.deepEqual(selected.parameters,{shipIndex:1,cargoIndex:1});
 assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
});

const domainButtons=(h,id)=>{const out=[];const walk=node=>{if(node.dataset?.domainAction)out.push(node);for(const child of node.children||[])walk(child);};walk(h.node('gp-'+id+'-facts'));return out;};
function growthUiData(module='heroes'){const value=data(module);value.config={enabled:true};value.view={heroes:[{heroId:'<unsafe hero>',level:1,star:2,skillLevels:[1,3],power:20}],universalExchange:'BLOCKED_EVIDENCE',appointment:{reliable:false,seconds:null,reason:'APPOINT_SOURCE_UNKNOWN'},factories:[{buildingId:'factory',recipes:[{productId:'cloth',produceTime:30,appointmentAdjustedSeconds:null,packCoverage:{reliable:false,executable:false},timingScope:'APPOINTMENT_ONLY_SPEED_BONUS_NOT_ESTABLISHED'}]}],cropSupply:{projectionOnly:true,waterlines:[{cropId:'wheat',uses:1,target:40}],seedDemand:[],surplusDemand:[]},candidates:[{...row('domain-action'),actionType:module==='heroes'?'LEVEL':'startProduce',parameters:module==='heroes'?{heroId:'A',action:'level'}:{}},{...row('domain-blocked'),action:null,executable:false,blockedReason:'BLOCKED_EVIDENCE'}]};return value;}
async function growthUiBoot(id){const h=harness(),pending=h.run('refreshGameplay('+JSON.stringify(id)+')');h.respond('/api/gameplay?module='+id,growthUiData(id));await pending;return h;}
for(const id of ['heroes','production']){
 test(id+' professional view selects only a current server action and never authorizes implicitly',async()=>{const h=await growthUiBoot(id),buttons=domainButtons(h,id);assert.equal(buttons.length,2);assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);buttons[0].onclick();assert.equal(h.node('gp-'+id+'-plan').disabled,false);const pending=h.node('gp-'+id+'-plan').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/operations/plan').body)),{module:id,mode:'Manual',selections:['domain-action'],parameters:id==='heroes'?{heroId:'A',action:'level'}:{}});h.respond('/api/operations/plan',{plan:plan()});await pending;assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);});
 test(id+' professional controls reject pending, dirty and cross-account detached actions',async()=>{const h=await growthUiBoot(id),buttons=domainButtons(h,id);const pending=h.node('gp-'+id+'-survey').onclick();assert.equal(buttons[0].disabled,true);buttons[0].onclick();h.select('B');h.select('A');h.respond('/api/gameplay/survey',growthUiData(id));await pending;assert.equal(h.node('gp-'+id+'-facts').textContent,'');buttons[0].onclick();assert.equal(h.node('gp-'+id+'-parameters').value,'{}');assert.equal(h.pending('/api/operations/authorize'),undefined);const live=await growthUiBoot(id);live.node('gp-'+id+'-parameters').oninput();assert.equal(domainButtons(live,id)[0].disabled,true);assert.equal(live.node('gp-'+id+'-plan').disabled,true);});
}
test('hero tables render hostile names as text and production projections retain unknown time and coverage',async()=>{const hero=await growthUiBoot('heroes');assert.match(hero.node('gp-heroes-facts').textContent,/<unsafe hero>/);assert.match(hero.node('gp-heroes-facts').textContent,/BLOCKED_EVIDENCE/);const production=await growthUiBoot('production');assert.match(production.node('gp-production-facts').textContent,/委任减时：未知/);assert.match(production.node('gp-production-facts').textContent,/仅投影|规划投影/);assert.match(production.node('gp-production-facts').textContent,/wheat/);assert.equal(production.requests.length,1);});

test('existing hero and production pages mount each controlled UI once and Workflow modules remain unique',async()=>{
 const ids=[...PAGE.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 for(const id of ['tab-heroes','tab-production','gp-heroes-section','gp-production-section','gp-heroes-plan','gp-production-plan'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const h=await workflows();h.node('wf-add').onclick();const card=h.node('wf-nodes').children.at(-1);assert.ok(card);
 assert.match(PAGE,/gp-heroes-section/);assert.match(PAGE,/gp-production-section/);
});

function farmUiData(){const value=data('farm');value.config={enabled:true};value.view={plots:[{buildingId:'<unsafe plot>',state:'EMPTY',productId:'',plantTime:0,ripeTime:0,reason:null}],autoFarming:false,crops:[{productId:'小麦',costs:[{id:'小麦种子',num:1}],reliable:true}],candidates:[{...row('farm-plant'),actionType:'PLANT',costs:[{id:'小麦种子',num:1}],parameters:{buildingId:'1农田',action:'plant',productId:'小麦'}},{...row('farm-harvest'),action:null,executable:false,blockedReason:'FARM_MATURITY_TIME_UNIT_UNVERIFIED'}]};return value;}
async function farmUiBoot(){const h=harness(),pending=h.run("refreshGameplay('farm')");h.respond('/api/gameplay?module=farm',farmUiData());await pending;return h;}
test('farm page renders explicit plots and seed costs; selection requires a new exact plan and no implicit authorization',async()=>{
 const h=await farmUiBoot(),buttons=domainButtons(h,'farm');assert.match(h.node('gp-farm-facts').textContent,/<unsafe plot>/);assert.match(h.node('gp-farm-facts').textContent,/成熟收获仍待证/);assert.equal(buttons.length,2);assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);buttons[0].onclick();
 assert.deepEqual(JSON.parse(h.node('gp-farm-parameters').value),{buildingId:'1农田',action:'plant',productId:'小麦'});const pending=h.node('gp-farm-plan').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/operations/plan').body)),{module:'farm',mode:'Manual',selections:['farm-plant'],parameters:{buildingId:'1农田',action:'plant',productId:'小麦'}});h.respond('/api/operations/plan',{plan:plan()});await pending;assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
 const ids=[...PAGE.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const id of ['gp-farm-section','gp-farm-plan'])assert.equal(ids.filter(v=>v===id).length,1);
});
test('farm detached controls cannot survive pending survey, draft changes or account generation switches',async()=>{
 const h=await farmUiBoot(),button=domainButtons(h,'farm')[0],pending=h.node('gp-farm-survey').onclick();assert.equal(button.disabled,true);button.onclick();h.select('B');h.select('A');h.respond('/api/gameplay/survey',farmUiData());await pending;assert.equal(h.node('gp-farm-facts').textContent,'');button.onclick();assert.equal(h.node('gp-farm-parameters').value,'{}');assert.equal(h.pending('/api/operations/authorize'),undefined);
 const live=await farmUiBoot();live.node('gp-farm-parameters').oninput();assert.equal(domainButtons(live,'farm')[0].disabled,true);assert.equal(live.node('gp-farm-plan').disabled,true);
});

function namedEntry(extra={}){return {accountId:'A',id:'named-one',revision:1,name:'<unsafe team>',mode:'MAINLINE',formation:{presetId:1,heroPositions:[{heroId:'tank',pos:{x:1,y:3}}],petUid:'9007199254740993'},...extra};}
async function namedUiBoot(entries=[namedEntry()]){const h=await boot(),pending=h.node('nf-load').onclick();h.respond('/api/formations/named',{accountId:'A',csrfToken:'named-csrf',entries});await pending;return h;}
test('named formation list and save remain local; current formation proof is supplied only by Service',async()=>{
 const h=await namedUiBoot();assert.equal(h.node('nf-selected').children[0].textContent,'<unsafe team> · v1');assert.match(h.node('nf-detail').textContent,/9007199254740993/);h.node('nf-name').value='new team';const pending=h.node('nf-save').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/formations/named/save').body)),{name:'new team'});assert.equal(h.node('nf-prepare').disabled,true);h.respond('/api/formations/named/save',namedEntry({id:'named-two',name:'new team'}));await pending;assert.equal(h.node('nf-selected').value,'named-two');assert.equal(h.pending('/api/gameplay/survey'),undefined);assert.equal(h.pending('/api/operations/plan'),undefined);assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
});
test('named formation prepare discards old authorization and loads only fresh-survey parameters',async()=>{
 const h=await namedUiBoot();await preview(h);assert.equal(h.node('gp-formation-authorize').disabled,false);const pending=h.node('nf-prepare').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/formations/named/prepare').body)),{id:'named-one',expectedRevision:1});const parameters={presetId:1,heroPositions:[{heroId:'tank',pos:{x:1,y:3}}]};h.respond('/api/formations/named/prepare',{id:'named-one',revision:1,accountId:'A',mode:'MAINLINE',parameters,preservedPetUid:'9007199254740993',requiresFreshSurvey:true,requiresFreshPlan:true,requiresAuthorization:true,resumable:false});await pending;assert.deepEqual(JSON.parse(h.node('gp-formation-parameters').value),parameters);assert.equal(h.node('gp-formation-authorize').disabled,true);assert.equal(h.node('gp-formation-plan').disabled,true);assert.match(h.node('nf-hint').textContent,/重新只读探测/);assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);
});
test('named rename overwrite and delete bind exact stored revision and never send formation or provenance from browser',async()=>{
 for(const kind of ['rename','overwrite','delete']){const h=await namedUiBoot();h.node('nf-name').value='renamed';const pending=h.node('nf-'+kind).onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/formations/named/'+kind).body)),{id:'named-one',expectedRevision:1,...(kind==='rename'?{name:'renamed'}:{})});h.respond('/api/formations/named/'+kind,kind==='delete'?{accountId:'A',id:'named-one',revision:1,deleted:true}:namedEntry({revision:2,name:kind==='rename'?'renamed':'<unsafe team>'}));await pending;assert.equal(h.pending('/api/operations/plan'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);if(kind==='delete')assert.equal(h.node('nf-selected').children.length,0);else assert.match(h.node('nf-detail').textContent,/"revision": 2/);}
});
test('named late reads mutations and errors cannot restore another account generation or old team parameters',async()=>{
 for(const kind of ['load','prepare','save']){const h=await namedUiBoot();h.node('nf-name').value='late';const pending=h.node('nf-'+kind).onclick();h.select('B');h.select('A');h.respond('/api/formations/named'+(kind==='load'?'':'/'+kind),kind==='load'?{accountId:'A',entries:[namedEntry()]}:namedEntry());await pending;assert.equal(h.node('nf-selected').children.length,0);assert.equal(h.node('nf-detail').textContent,'');assert.equal(h.node('gp-formation-parameters').value,'{}');assert.equal(h.run('gameplayCsrfToken()'),null);}
});
test('named version conflict or malformed prepare clears local readiness and requires a new list read',async()=>{
 const h=await namedUiBoot(),pending=h.node('nf-prepare').onclick();h.respond('/api/formations/named/prepare',{accountId:'B',mode:'MAINLINE',parameters:{presetId:2}});await pending;assert.equal(h.node('nf-prepare').disabled,true);assert.equal(h.node('nf-selected').children.length,0);assert.equal(h.node('gp-formation-parameters').value,'{}');assert.match(h.node('nf-hint').textContent,/重新读取队伍/);
});
function forgeUiData(){const value=data('equipment-forge');value.config={enabled:true};value.view={forges:[{buildingId:'1装备厂',level:1,queue:{state:'IDLE'}}],recipes:[{makeId:1001,type:'武器',season:1,costs:[{id:'材料',num:4}],equipIds:['<unsafe item>']}],bag:[{uid:'9007199254740993',equipId:'蓝武器1',level:0,star:2,refineLv:0}],candidates:[{...row('forge-make'),actionType:'MAKE',parameters:{buildingId:'1装备厂',action:'make',makeId:1001,allowUniversal:false}},{...row('forge-blocked'),action:null,executable:false,blockedReason:'QUEUE_IDLE_BLOCKED_EVIDENCE'}]};return value;}
async function forgeUiBoot(){const h=harness(),pending=h.run("refreshGameplay('equipment-forge')");h.respond('/api/gameplay?module=equipment-forge',forgeUiData());await pending;return h;}
test('forge page preserves exact UID and selects server recipe for ordinary Manual plan without implicit permission',async()=>{
 const h=await forgeUiBoot(),buttons=domainButtons(h,'equipment-forge');assert.match(h.node('gp-equipment-forge-facts').textContent,/9007199254740993/);assert.match(h.node('gp-equipment-forge-facts').textContent,/<unsafe item>/);assert.equal(buttons[1].disabled,true);buttons[0].onclick();const pending=h.node('gp-equipment-forge-plan').onclick();assert.deepEqual(JSON.parse(JSON.stringify(h.pending('/api/operations/plan').body)),{module:'equipment-forge',mode:'Manual',selections:['forge-make'],parameters:{buildingId:'1装备厂',action:'make',makeId:1001,allowUniversal:false}});h.respond('/api/operations/plan',{plan:plan()});await pending;assert.equal(h.pending('/api/operations/authorize'),undefined);assert.equal(h.pending('/api/operations/execute'),undefined);const ids=[...PAGE.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const id of ['gp-equipment-forge-section','gp-equipment-forge-plan'])assert.equal(ids.filter(v=>v===id).length,1);
});
test('forge detached recipe cannot survive pending survey account switch or edited parameters',async()=>{
 const h=await forgeUiBoot(),button=domainButtons(h,'equipment-forge')[0],pending=h.node('gp-equipment-forge-survey').onclick();assert.equal(button.disabled,true);h.select('B');h.select('A');h.respond('/api/gameplay/survey',forgeUiData());await pending;button.onclick();assert.equal(h.node('gp-equipment-forge-parameters').value,'{}');assert.equal(h.pending('/api/operations/authorize'),undefined);const live=await forgeUiBoot();live.node('gp-equipment-forge-parameters').oninput();assert.equal(domainButtons(live,'equipment-forge')[0].disabled,true);
});

test('named prepare invalidates authorization immediately and cannot overwrite an edited formation draft',async()=>{
 const h=await namedUiBoot();await preview(h);const pending=h.node('nf-prepare').onclick();assert.equal(h.node('gp-formation-authorize').disabled,true);assert.equal(h.node('gp-formation-plan').disabled,true);const draft=JSON.stringify({presetId:2});h.node('gp-formation-parameters').value=draft;h.node('gp-formation-parameters').oninput();h.respond('/api/formations/named/prepare',{accountId:'A',id:'named-one',revision:1,mode:'MAINLINE',parameters:{presetId:1},requiresFreshSurvey:true,requiresFreshPlan:true,requiresAuthorization:true,resumable:false});await pending;assert.equal(h.node('gp-formation-parameters').value,draft);assert.equal(h.node('gp-formation-authorize').disabled,true);assert.match(h.node('nf-hint').textContent,/草稿已变化/);assert.equal(h.pending('/api/operations/authorize'),undefined);
});


const workflowHistoryPath = id => '/api/workflows/history?workflowRunId=' + encodeURIComponent(id);
async function historyBoot() {
  const h = harness(), task = h.run('refreshWorkflows()');
  h.ctx.snapshot.connected = false;
  h.respond('/api/workflows', { accountId: 'A', status: { status: 'IDLE' }, history: ['run/one', 'run-two'].map(runId => ({ accountId: 'A', runId, status: 'RECOVERED_STOPPED' })) });
  await task; return h;
}
function workflowHistoryDetail(runId = 'run/one') {
  return { accountId: 'A', workflowRunId: runId, workflowDefinitionId: 'old-graph', status: 'RECOVERED_STOPPED', recovered: true,
    readOnly: true, resumable: false, unlinkedOperationCount: 1, nodes: [{ nodeId: '<img src=x>', traceResult: 'AWAITING_AUTHORIZATION', batches: [
      { batchId: 'batch-old', operationRunId: 'operation-old', finalStatus: 'UNKNOWN', actions: [
        { actionId: 'action-old', result: 'UNKNOWN', requestStatus: 'UNKNOWN', verificationStatus: null, reconciliationStatus: 'APPLIED', needsReconciliation: false },
        { actionId: 'still-pending', result: 'UNKNOWN', requestStatus: 'DISPATCHING', verificationStatus: null, reconciliationStatus: 'STILL_UNKNOWN', needsReconciliation: true },
      ] },
    ] }] };
}

test('workflow history reads exact persisted node, batch and action evidence while disconnected without authorization', async () => {
  const h = await historyBoot();
  assert.equal(h.node('wf-history-read').disabled, false);
  assert.equal(h.node('wf-authorize').disabled, true);
  const task = h.node('wf-history-read').onclick();
  assert.equal(h.node('wf-history-read').disabled, true);
  h.respond(workflowHistoryPath('run/one'), workflowHistoryDetail()); await task;
  const text = h.node('wf-history-detail').textContent;
  for (const value of ['run/one', 'old-graph', 'RECOVERED_STOPPED', '<img src=x>', 'batch-old', 'operation-old', 'UNKNOWN', 'APPLIED', 'STILL_UNKNOWN', '待复核', '未关联的操作记录：1']) assert.ok(text.includes(value), value);
  assert.match(h.node('wf-history-hint').textContent, /原始 UNKNOWN 保留/);
  assert.ok(h.requests.every(row => row.body === null));
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.pending('/api/operations/authorize'), undefined);
  assert.equal(h.pending('/api/workflows/resume'), undefined);
});

test('workflow history selection, account changes, wrong identities and failed reads cannot restore stale evidence', async () => {
  const h = await historyBoot(), old = h.node('wf-history-read').onclick();
  h.node('wf-history-selected').value = 'run-two'; h.node('wf-history-selected').onchange();
  const current = h.node('wf-history-read').onclick();
  h.respond(workflowHistoryPath('run-two'), workflowHistoryDetail('run-two')); await current;
  h.respond(workflowHistoryPath('run/one'), workflowHistoryDetail()); await old;
  assert.match(h.node('wf-history-detail').textContent, /运行 run-two/);
  assert.doesNotMatch(h.node('wf-history-detail').textContent, /run\/one/);
  const late = h.node('wf-history-read').onclick(); h.select('B'); h.select('A');
  h.respond(workflowHistoryPath('run-two'), workflowHistoryDetail('run-two')); await late;
  assert.equal(h.node('wf-history-detail').textContent, '');
  assert.equal(h.node('wf-history-read').disabled, true);
  for (const mutate of [data => data.accountId = 'B', data => data.workflowRunId = 'foreign-run', data => data.resumable = true]) {
    const f = await historyBoot(), task = f.node('wf-history-read').onclick(), data = workflowHistoryDetail(); mutate(data);
    f.respond(workflowHistoryPath('run/one'), data); await task;
    assert.equal(f.node('wf-history-detail').textContent, '');
    assert.match(f.node('wf-history-hint').textContent, /归属不匹配/);
  }
  const f = await historyBoot(), task = f.node('wf-history-read').onclick(), request = f.pending(workflowHistoryPath('run/one'));
  request.settled = true; request.reject(Error('history unavailable')); await task;
  assert.equal(f.node('wf-history-detail').textContent, '');
  assert.match(f.node('wf-history-hint').textContent, /history unavailable/);
  assert.equal(f.node('wf-history-read').disabled, false);
});
