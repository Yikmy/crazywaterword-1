import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceLedger } from '../src/resource-ledger.mjs';
import { evaluateNavalRules, navalModule, strictParameters, selectedActions, stockFacts, fleetFacts, readNavalFact } from '../src/naval-rules.mjs';

test('naval ordered rules pass only with all exact authoritative facts', () => {
  const rules=[{id:'target',type:'targetId',value:'fleet-77'},{id:'state',type:'targetState',value:2},{id:'fuel',type:'minPetrol',value:300}];
  const result=evaluateNavalRules(rules,{target:{id:'fleet-77',state:2},petrol:400});
  assert.equal(result.status,'PASS');assert.equal(result.allowed,true);assert.deepEqual(result.trace.map(row=>row.id),['target','state','fuel']);
  assert.equal(evaluateNavalRules(rules,{target:{id:'fleet-77'},petrol:400}).status,'UNKNOWN');
  assert.equal(evaluateNavalRules(rules,{target:{id:'wrong',state:2},petrol:400}).status,'FAIL');
});
test('naval unknown rule fields, duplicate IDs and mainline side fail closed', () => {
  for(const rules of [[],[{id:'x',type:'playerSide',value:'LEFT'}],[{id:'x',type:'minPetrol',value:1,request:'write'}],[{id:'x',type:'minPetrol',value:1},{id:'x',type:'minPetrol',value:1}]]) assert.equal(evaluateNavalRules(rules,{petrol:3}).allowed,false);
});
test('naval rules reject absent facts instead of treating them as zero', () => {
  assert.equal(evaluateNavalRules([{id:'x',type:'minDurability',value:0}],{}).status,'UNKNOWN');
  assert.equal(evaluateNavalRules([{id:'x',type:'freshTarget',value:10}],{target:{observedAt:101},now:100}).status,'UNKNOWN');
});
test('business parameters cannot inject request body or costs', () => {
  for(const key of ['request','body','costs','__proto__']) assert.throws(()=>strictParameters(JSON.parse('{"'+key+'":1}'),['targetId']),{code:'INVALID_INPUT'});
});
test('shared selection reserves cumulative costs and rejects duplicate selection', () => {
  const op=id=>({actionId:id,decision:'READY',action:{request:'Fixture'},target:{buildingId:id},costs:[{id:'汽油',num:300}]});
  const result=selectedActions([op('a'),op('b')],['a','b'],new ResourceLedger(new Map([['汽油',500]])));
  assert.equal(result.actions.length,1);assert.equal(result.notes.length,1);
  assert.throws(()=>selectedActions([op('a')],['a','a']),{code:'INVALID_INPUT'});
});
test('facts keep missing resources and duplicate fleet IDs unreliable',()=>{
  assert.equal(stockFacts({available:true,body:{}},{available:true,body:{list:[]}}).stockReliable,false);
  assert.equal(fleetFacts({available:true,body:{fleets:[{buildingId:'a'},{buildingId:'a'}]}}).fleetReliable,false);
});
test('queries preserve cancellation and never issue writes',async()=>{
  const abort=new AbortController();abort.abort();let called=false;
  await assert.rejects(readNavalFact({request(){called=true;}},{},'MyFleetsRequest',{}, {signal:abort.signal}),{code:'CANCELLED'});assert.equal(called,false);
  const result=await readNavalFact({connected:true,request:async()=>{throw Error('fixture')}},{MyFleetsRequest:{},MyFleetsResponse:{}},'MyFleetsRequest');assert.equal(result.available,false);
});
test('naval adapter remains read-only and never inherits mainline side',()=>{
  const facts={fleets:[],stockReliable:true,stock:new Map(),now:100};
  assert.equal(navalModule.defaultConfig.enabled,false);assert.deepEqual(navalModule.plan(facts,{moduleConfig:{enabled:true,worldBoss:true}}).actions,[]);
  const view=navalModule.view(facts,{moduleConfig:{enabled:true}});assert.equal(view.blocked.find(row=>row.actionType==='follow').code,'TARGET_ID_UNVERIFIED');assert.equal(navalModule.verify().confirmed,false);
});

test('petrol reserve applies after prior module reservations',()=>{
 const operation={actionId:'fuel',decision:'READY',action:{request:'Fixture'},target:{buildingId:'f'},costs:[{id:'汽油',num:300}]};
 const ledger=new ResourceLedger(new Map([['汽油',600]]));ledger.reserve([{id:'汽油',num:200}]);
 const plan=selectedActions([operation],['fuel'],ledger,200);assert.equal(plan.actions.length,0);assert.equal(ledger.available('汽油'),400);
});
test('invalid inventory rows never become reliable empty stock',()=>{
 assert.equal(stockFacts({available:true,body:{items:[{itemId:'汽油',num:null}]}},{available:true,body:{list:[]}}).stockReliable,false);
 assert.equal(stockFacts({available:true,body:{items:[]}},{available:true,body:{list:[{res:4,amount:'invalid'}]}}).stockReliable,false);
});

test('naval observes authoritative world fleets with exact int64 player/guild/power filters',async()=>{
 const {surveyNaval}=await import('../src/naval-rules.mjs');
 const responses={WorldInfoRequest:{fleets:[{buildingId:'fleet-local-name',owner:{playerId:'9007199254740993',guildId:'1003',nickname:'fixture'},state:2,cityId:17,power:'9007199254740995',curGridIdx:4,durability:1900,maxDura:2000},{buildingId:'fleet-local-name',owner:{playerId:'9007199254740994',guildId:'1004',nickname:'same-name'},state:1,cityId:18,power:'10'}]},MyFleetsRequest:{fleets:[]},WorldBossInfoRequest:{},LimitedBossOpenRequest:{},AllItemRequest:{items:[{itemId:'汽油',num:400}]},AllResourceRequest:{list:[]}};const protocol=Object.fromEntries(Object.keys(responses).flatMap(name=>[[name,{}],[name.replace('Request','Response'),{}]])),calls=[];const parameters={playerId:'9007199254740993',excludeGuildIds:['1004'],cityIds:[17],minimumPower:'9007199254740994',maximumPower:'9007199254740996'};const facts=await surveyNaval({connected:true,request:async(name,body)=>{calls.push([name,body]);return responses[name]}},protocol,{parameters,moduleConfig:{observe:true}});const view=navalModule.view(facts,{parameters,moduleConfig:{observe:true,rules:[{id:'state',type:'targetState',value:2},{id:'fuel',type:'minPetrol',value:300}]}});assert.deepEqual(calls.find(([name])=>name==='WorldInfoRequest')[1],{screenCenter:{x:0,y:0}});assert.equal(view.observations.length,1);assert.equal(view.observations[0].playerId,'9007199254740993');assert.equal(view.observations[0].power,'9007199254740995');assert.equal(view.observations[0].targetKey,'9007199254740993:fleet-local-name');assert.deepEqual(view.observations[0].ruleTrace.slice(-2).map(row=>row.id),['state','fuel']);assert.equal(view.targets[1].status,'FAIL');assert.deepEqual(view.candidates,[]);assert.equal(view.scope.completeness,'CURRENT_RESPONSE_ONLY');
});
test('naval unknown owner, power or city cannot pass configured observation filters',()=>{const base={now:100,worldReliable:true,worldFleets:[{buildingId:'f',playerId:'123',guildId:'3',cityId:2,power:'30',state:1}],stockReliable:true,stock:new Map()};for(const key of ['playerId','guildId','cityId','power']){const f=structuredClone(base);f.worldFleets[0][key]=null;const view=navalModule.view(f,{parameters:{playerId:'123',excludeGuildIds:['4'],cityIds:[2],minimumPower:'10'}});assert.equal(view.targets[0].status,'UNKNOWN');assert.equal(view.observations.length,0)}});
test('naval observation parameters reject unsafe IDs, ranges, injections and malformed centers',()=>{for(const parameters of [{playerId:9007199254740992},{playerId:'-1'},{excludeGuildIds:['03']},{cityIds:[0]},{minimumPower:'20',maximumPower:'10'},{screenCenter:{x:0,y:0,request:'x'}},{screenCenter:{x:1.2,y:0}},{body:{}},{power:3}])assert.throws(()=>navalModule.view({worldFleets:[]},{parameters}),{code:'INVALID_INPUT'})});

test('registered naval, treasure and fleet config validators fill partial defaults and reject invalid saves',async()=>{
 const {treasureModule}=await import('../src/treasure.mjs'),{fleetModule}=await import('../src/fleet.mjs');
 for(const adapter of [treasureModule,fleetModule,navalModule]){assert.equal(typeof adapter.validateConfig,'function');assert.equal(adapter.validateConfig({}).enabled,false);assert.equal(adapter.validateConfig({enabled:true}).enabled,true);for(const bad of [{unknown:true},{enabled:'true'},null,[],{enabled:1}])assert.throws(()=>adapter.validateConfig(bad),{code:'INVALID_INPUT'})}
 for(const bad of [{colors:[1]},{colors:[5,5]},{maxFleets:11},{minimumDurabilityRatio:0},{petrolReserve:1.5}])assert.throws(()=>treasureModule.validateConfig(bad),{code:'INVALID_INPUT'});
 for(const bad of [{scenarioId:1.5},{minimumDurabilityRatio:2},{petrolReserve:NaN},{stopRepair:'true'}])assert.throws(()=>fleetModule.validateConfig(bad),{code:'INVALID_INPUT'});
 for(const bad of [{rules:[{id:'x',type:'unknown',value:1}]},{rules:[{id:'x',type:'minPetrol',value:-1}]},{rules:[{id:'x',type:'minPetrol',value:1},{id:'x',type:'minPetrol',value:1}]}])assert.throws(()=>navalModule.validateConfig(bad),{code:'INVALID_INPUT'});
 const rules=[{id:'b',type:'minPetrol',value:1},{id:'a',type:'targetState',value:2}];assert.deepEqual(navalModule.validateConfig({rules}).rules,rules);
});
