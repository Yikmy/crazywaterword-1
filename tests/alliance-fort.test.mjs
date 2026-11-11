import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ALLIANCE_FORT_DEFAULT_CONFIG,ALLIANCE_FORT_EVIDENCE,validateAllianceFortParameters,allianceFortContext,parseAllianceFortObservations,surveyAllianceFort,viewAllianceFort,planAllianceFort,verifyAllianceFort,allianceFortReward,allianceFortDependencyVersions } from '../src/alliance-fort.mjs';
import { loadProtocol } from '../src/proto.mjs';
import { loadConfig } from '../src/config.mjs';
import { readGameTime, trustedGameClock } from '../src/state-facts.mjs';
import { ResourceLedger } from '../src/resource-ledger.mjs';
import { executeBusinessOperation } from '../src/business-functions.mjs';
const protocol=loadProtocol(path.resolve(import.meta.dirname,'../work/extracted/_src_chunks_/src/chunks/game.js'));
const config=loadConfig({file:path.resolve(import.meta.dirname,'../work/cdn/config_cn_pack.json')});
const clone=v=>structuredClone(v),wire=(n,v)=>protocol[n].decode(protocol[n].encode(v).finish());
const cloneConfig=()=>({tables:clone(config.tables)});
const enabled={enabled:true,fort:true},parameters={cityId:7,itemId:'耐火砖',num:2};
const player=()=>({playerId:'9007199254740993',worldId:'3000017',guildId:'9007199254740995'});
function fake({codec=true,stock={耐火砖:20,高温合金:20,功勋:10,技能书:9},used=499,type='挖沙船',overrides={},context={},clock=true}={}){
 const st={fort:{cityId:7,type,state:0,process:[],durability:0,effectTime:0},stock:new Map(Object.entries(stock)),resources:[{res:3,amount:700},{res:6,amount:12}],used,guildId:player().guildId,cities:[7,8],reads:[],writes:[],overrides,onRead:null,onClock:null,clock};
 const client={connected:true,factContext:{accountId:'offline-A',generation:3,connectionId:'synthetic-connection',...context},pending:[],watchers:[],uncertainWrites:new Map(),lateResponses:new Map(),
 gameClock:{read(){const now=Date.now();return st.onClock?.()??(st.clock?{status:'TRUSTED',reliable:true,accountId:client.factContext.accountId,generation:client.factContext.generation,nowMs:now,earliestMs:now-1,latestMs:now+1,source:'PingResponse.serverTimestamp'}:{status:'UNKNOWN',reliable:false});}},
 async request(n,b,r,_timeout,o){assert.equal(o?.mutate,undefined);wire(n,b);st.reads.push({name:n,body:clone(b)});await st.onRead?.(n);let value=n==='GuildInfoRequest'?{guild:{guildId:st.guildId,level:1},myTitle:4}:n==='GuildCityInfoRequest'?{cities:st.cities.map(cityId=>({cityId,recommended:false,defenceNum:1,...(cityId===7?{fort:st.fort}:{})}))}:n==='CityFortInfoRequest'?{fort:st.fort,fortStats:[],fortFund:123,fundSpeed:2,dailyDonateNum:st.used}:n==='AllItemRequest'?{items:[...st.stock].map(([itemId,num])=>({itemId,num}))}:n==='AllResourceRequest'?{list:st.resources}:null;
 if(Object.hasOwn(st.overrides,n))value=st.overrides[n];if(value instanceof Error)throw value;if(value===null)throw Error('synthetic read unavailable');return codec?wire(r,value):value;},
 markUnverifiedWrite(n,b){this.uncertainWrites.set(JSON.stringify([n,b]),true);},confirmWatchedWrite(){}};
 return {client,st};
}
const opts=(extra={})=>({config,player:player(),parameters,moduleConfig:enabled,...extra});
async function ready(input={},extra={}){const f=fake(input),options=opts(extra),facts=await surveyAllianceFort(f.client,protocol,options);return {...f,options,facts,operation:planAllianceFort(facts,options).actions[0]};}
function apply(f){const p=f.options.parameters,cost=config.tables.FortDonateMaterialCfg.data.find(r=>r.id===p.itemId),reward=allianceFortReward(cost.res[1],p.num,f.st.used,500,2500);let progress=f.st.fort.process.find(r=>r.itemId===p.itemId);if(!progress){progress={itemId:p.itemId,num:0};f.st.fort.process.push(progress);}progress.num+=p.num;f.st.used+=p.num;f.st.stock.set(p.itemId,f.st.stock.get(p.itemId)-p.num);f.st.stock.set('功勋',(f.st.stock.get('功勋')??0)+reward);return wire('DonateFortResponse',{process:f.st.fort.process,reward:{asset:[{type:0,id:'功勋',num:reward}]}});}
async function after(f,mutate){const response=apply(f);mutate?.(f.st,response);return {after:await surveyAllianceFort(f.client,protocol,f.options),response};}
function observations(facts){return Object.fromEntries(Object.keys(facts.inputs).map(key=>[key,{value:clone(facts.inputs[key]),sourceAt:facts.sourceFacts[key].provenance.sourceAt,gameTime:clone(facts.sourceClocks[key])}]));}
function rebuild(f,obs,extra={}){return parseAllianceFortObservations(obs,{context:f.facts.identityContext,parameters:f.options.parameters,config,available:Object.keys(protocol),currentGameTime:()=>readGameTime(f.client).gameTime,currentContext:()=>allianceFortContext(f.client,f.options.player),...extra});}

test('strict explicit one city/material/positive num; no getters, pack, build or automatic exchange inputs',()=>{
 assert.deepEqual(ALLIANCE_FORT_DEFAULT_CONFIG,{enabled:false,fort:false});assert.equal(ALLIANCE_FORT_EVIDENCE.responseProcess,'SHAPE_ONLY_SEMANTICS_UNPROVEN');
 assert.deepEqual(validateAllianceFortParameters({}),{});assert.deepEqual(validateAllianceFortParameters({cityId:7}),{cityId:7});assert.deepEqual(validateAllianceFortParameters(parameters),parameters);
 for(const v of [null,[],{cityId:0},{cityId:'7'},{cityId:NaN},{cityId:1.2},{itemId:'耐火砖',num:1},{cityId:7,itemId:'耐火砖'},{cityId:7,num:1},{...parameters,itemId:'RUBY'},{...parameters,num:0},{...parameters,num:-1},{...parameters,num:Infinity},{...parameters,num:'2'},{...parameters,num:2147483648},{...parameters,selectPackNum:0},{...parameters,automaticExchange:false},{...parameters,request:'FinishFortRequest'},Object.create(parameters)])assert.throws(()=>validateAllianceFortParameters(v),{code:'INVALID_PARAMETERS'});
 const getter={};Object.defineProperty(getter,'cityId',{enumerable:true,get(){throw Error('must not call');}});assert.throws(()=>validateAllianceFortParameters(getter),{code:'INVALID_PARAMETERS'});
});
test('actual codec requires cityId/itemId/num and reward type; exact int64 identifiers and no mutations',async()=>{
 assert.throws(()=>protocol.CityFortInfoRequest.decode(new Uint8Array()),/cityId/);assert.throws(()=>protocol.ItemNum.decode(new Uint8Array()),/itemId/);assert.throws(()=>protocol.DisplayAsset.decode(new Uint8Array()),/type/);assert.equal(protocol.DisplayAssetType.ITEM,0);
 const f=await ready();assert.ok(f.operation);assert.equal(f.facts.catalog.reliable,true);assert.equal(f.facts.identityContext.playerId,'9007199254740993');assert.equal(f.facts.guildId,'9007199254740995');assert.equal(f.facts.season,3);assert.equal(f.facts.dailyDonateNum,499);assert.equal(f.facts.fort.state,0);assert.deepEqual(f.facts.fort.process.map(r=>r.num),[0,0]);
 assert.deepEqual(f.operation.action,{request:'DonateFortRequest',response:'DonateFortResponse',body:{cityId:7,item:{itemId:'耐火砖',num:2},selectPackNum:0}});assert.deepEqual(f.operation.costs,[{id:'耐火砖',num:2}]);assert.deepEqual(f.operation.reward,{type:0,id:'功勋',num:5000});assert.equal(f.st.writes.length,0);
 assert.deepEqual(f.st.reads.map(r=>r.name).sort(),['AllItemRequest','AllResourceRequest','CityFortInfoRequest','GuildCityInfoRequest','GuildInfoRequest']);assert.deepEqual(f.st.reads.find(r=>r.name==='CityFortInfoRequest').body,{cityId:7});
});
test('all six configured ordinary material branches are modeled; merit is item and league points stay unchanged',async()=>{
 const cases=[['兵营','压电陶瓷'],['炮台','炮弹'],['挖沙船','耐火砖'],['挖沙船','高温合金'],['干扰器','液态金属'],['加油站','碳纤维']];
 for(const [type,itemId]of cases){const f=await ready({type,stock:{[itemId]:20,功勋:1}},{parameters:{cityId:7,itemId,num:2}});assert.ok(f.operation,itemId);const a=await after(f);assert.equal(verifyAllianceFort(f.operation,f.facts,a.after,a.response).confirmed,true,itemId);assert.equal(a.after.stock.get('LEAGUE_POINT'),12);assert.equal(a.after.stock.get('功勋'),5001);}
});
test('reward uses one exact floor over reduced subtotal and no artificial daily quota',async()=>{
 assert.equal(allianceFortReward(4000,1,499,500,2500),4000);assert.equal(allianceFortReward(4000,2,499,500,2500),5000);assert.equal(allianceFortReward(4000,2,500,500,2500),2000);assert.equal(allianceFortReward(3,2,500,500,2500),1);assert.equal(allianceFortReward(3,3,499,500,2500),4);assert.equal(allianceFortReward(Number.MAX_SAFE_INTEGER,2,0,500,2500),null);
 for(const v of[-1,NaN,Infinity,'1'])assert.equal(allianceFortReward(4000,2,v,500,2500),null);const f=await ready({used:500000});assert.ok(f.operation);assert.equal(f.operation.reward.num,2000);
});
test('default off, explicit city-only view, selections, and shared Ledger reservations',async()=>{
 const f=await ready();for(const moduleConfig of[undefined,{enabled:true,fort:false},{enabled:false,fort:true}])assert.equal(planAllianceFort(f.facts,{...f.options,moduleConfig}).actions.length,0);
 for(const moduleConfig of[{enabled:1,fort:true},{enabled:true,fort:1}])assert.throws(()=>planAllianceFort(f.facts,{...f.options,moduleConfig}),{code:'INVALID_PARAMETERS'});
 const cityOnly=await ready({},{parameters:{cityId:7}});assert.equal(cityOnly.operation,undefined);assert.equal(viewAllianceFort(cityOnly.facts,cityOnly.options).fort.cityId,7);
 for(const selections of[[],['forged']])assert.equal(planAllianceFort(f.facts,{...f.options,selections}).actions.length,0);for(const selections of[['x','x'],[1],Array(1),'bad'])assert.throws(()=>planAllianceFort(f.facts,{...f.options,selections}),{code:'INVALID_PARAMETERS'});
 const ledger=new ResourceLedger(new Map([['耐火砖',3]]));assert.equal(planAllianceFort(f.facts,{...f.options,ledger,selections:[f.operation.actionId]}).actions.length,1);assert.equal(planAllianceFort(f.facts,{...f.options,ledger}).actions.length,0);assert.equal(ledger.reserved.get('耐火砖'),2);
});
test('insufficient material, over-demand, active Fort, wrong material and old season safely block',async()=>{
 for(const [input,extra,reason]of [[{stock:{耐火砖:1}}, {},'FORT_OWNED_MATERIAL_INSUFFICIENT'],[{}, {parameters:{cityId:7,itemId:'耐火砖',num:101}},'FORT_REMAINING_DEMAND_EXCEEDED'],[{}, {parameters:{cityId:7,itemId:'炮弹',num:1}},'FORT_REMAINING_DEMAND_EXCEEDED'],[{}, {player:{...player(),worldId:'2000017'}},'FORT_SEASON_LOCKED']]){const f=await ready(input,extra);assert.equal(f.operation,undefined);assert.equal(viewAllianceFort(f.facts,f.options).candidates[0].blockedReason,reason);}
 const f=fake();f.st.fort.state=1;const facts=await surveyAllianceFort(f.client,protocol,opts());assert.equal(viewAllianceFort(facts,opts()).candidates[0].blockedReason,'FORT_NOT_BUILDING');
});
test('missing/unknown/inherited state and daily count are not protobuf defaults',async()=>{
 const good={cityId:7,type:'挖沙船',state:0,process:[]};
 for(const value of[{fort:{cityId:7,type:'挖沙船',process:[]},dailyDonateNum:0},{fort:good},{fort:{...good,state:2},dailyDonateNum:0},{fort:{...good,state:-1},dailyDonateNum:0},{fort:{...good,process:undefined},dailyDonateNum:0},{fort:good,dailyDonateNum:-1},{fort:good,dailyDonateNum:'9007199254740993'},Object.assign(Object.create({dailyDonateNum:0}),{fort:good})]){const f=await ready({codec:false,overrides:{CityFortInfoRequest:value}});assert.equal(f.operation,undefined);assert.equal(viewAllianceFort(f.facts,f.options).reliability.authority,false);}
 const f=fake();delete f.st.fort.state;const facts=await surveyAllianceFort(f.client,protocol,opts());assert.equal(Object.hasOwn(facts.inputs.fort.fort,'state'),false);assert.equal(planAllianceFort(facts,opts()).actions.length,0);
});
test('own guild and exact city/Fort identity must agree across both fresh sources',async()=>{
 const cases=[['GuildInfoRequest',{guild:{guildId:'2'}}],['GuildInfoRequest',{guild:{}}],['GuildCityInfoRequest',{cities:[]}],['GuildCityInfoRequest',{cities:[{cityId:7}]}],['GuildCityInfoRequest',{cities:[{cityId:7,fort:{cityId:8,type:'挖沙船',state:0,process:[]}}]}],['GuildCityInfoRequest',{cities:[{cityId:7,fort:{cityId:7,type:'炮台',state:0,process:[]}}]}],['GuildCityInfoRequest',{cities:[{cityId:7,fort:{cityId:7,type:'挖沙船',state:0,process:[{itemId:'耐火砖',num:1}]}}]}],['GuildCityInfoRequest',{cities:[{cityId:7},{cityId:7}]}]];
 for(const [name,value]of cases){const f=await ready({codec:false,overrides:{[name]:value}});assert.equal(f.operation,undefined,name);}
 for(const p of[{}, {playerId:1,worldId:3000017},{...player(),guildId:0},{...player(),playerId:Number.MAX_SAFE_INTEGER+1},{...player(),id:'2'},Object.create(player())])assert.equal((await ready({},{player:p})).operation,undefined);
 const f=await ready({context:{guildId:'2'}});assert.equal(f.operation,undefined);assert.equal(allianceFortContext(f.client,player()).guildId,null);
});
test('sparse current progress normalizes zeros; duplicate/unknown/negative/over-limit values block',async()=>{
 for(const process of[[{itemId:'耐火砖',num:1},{itemId:'耐火砖',num:1}],[{itemId:'RUBY',num:1}],[{itemId:'耐火砖',num:-1}],[{itemId:'耐火砖',num:101}],Array(1),[Object.assign(Object.create({num:1}),{itemId:'耐火砖'})]]){const f=fake({codec:false});f.st.fort.process=process;const facts=await surveyAllianceFort(f.client,protocol,opts());assert.equal(planAllianceFort(facts,opts()).actions.length,0);}
 const f=fake();f.st.fort.process=[{itemId:'耐火砖',num:98}];const facts=await surveyAllianceFort(f.client,protocol,opts());assert.equal(planAllianceFort(facts,opts()).actions.length,1);
});
test('full inventory parser rejects missing, duplicated, colliding, unsafe or negative stock',async()=>{
 for(const [name,value]of [['AllItemRequest',{}],['AllItemRequest',{items:[{itemId:'耐火砖',num:20},{itemId:'耐火砖',num:1}]}],['AllItemRequest',{items:[{itemId:'耐火砖',num:-1}]}],['AllItemRequest',{items:[{itemId:'耐火砖',num:Number.MAX_SAFE_INTEGER+1}]}],['AllItemRequest',{items:[{itemId:'LEAGUE_POINT',num:1}]}],['AllResourceRequest',{}],['AllResourceRequest',{list:[{res:3,amount:1},{res:3,amount:1}]}]]){const f=await ready({codec:false,overrides:{[name]:value}});assert.equal(f.operation,undefined,name);}
});
test('malformed or changed configuration and acquisition-like additions fail closed',async()=>{
 const cases=[c=>c.tables.FortDonateMaterialCfg.data[0].purchaseRuby=1,c=>c.tables.FortDonateMaterialCfg.data[0].res=['RUBY',4000],c=>c.tables.FortDonateMaterialCfg.data.push(clone(c.tables.FortDonateMaterialCfg.data[0])),c=>c.tables.ItemCfg.data.find(r=>r.id==='功勋').type='资源',c=>c.tables.ItemCfg.data.find(r=>r.id==='耐火砖').type='付费',c=>c.tables.WorldFortCfg.data[0].donateCost=[['耐火砖',-1]],c=>c.tables.WorldFortCfg.data[0].donateCost.push(['耐火砖',1]),c=>c.tables.FortParamCfg.data.find(r=>r.param==='捐献功勋衰减比例').value=10001,c=>delete c.tables.FortParamCfg];
 for(const mutate of cases){const cfg=cloneConfig();mutate(cfg);const f=await ready({},{config:cfg});assert.equal(f.facts.catalog.reliable,false);assert.equal(f.operation,undefined);}
 const f=await ready(),cfg=cloneConfig();cfg.tables.FortDonateMaterialCfg.data[0].res[1]++;assert.equal(planAllianceFort(f.facts,{...f.options,config:cfg}).actions.length,0);
});
test('raw reusable observations retain original timestamp and trusted clock; stale earlier sibling is not renewed',async t=>{
 let now=1800000000000,release;t.mock.method(Date,'now',()=>now);const f=fake(),options=opts();f.st.onRead=n=>n==='AllResourceRequest'?new Promise(r=>release=r):undefined;const pending=surveyAllianceFort(f.client,protocol,options);await new Promise(setImmediate);now+=31000;release();const facts=await pending;assert.equal(facts.sourceFacts.fort.provenance.sourceAt,1800000000000);assert.equal(facts.sourceFacts.resources.provenance.sourceAt,1800000031000);assert.equal(planAllianceFort(facts,options).actions.length,0);
 const g=await ready(),obs=observations(g.facts);obs.fort.sourceAt-=40000;const reused=rebuild(g,obs);assert.equal(reused.sourceFacts.fort.provenance.sourceAt,obs.fort.sourceAt);assert.equal(planAllianceFort(reused,g.options).actions.length,0);
});
test('unknown clock, wrong account/generation, midnight uncertainty and prior-day count block',async t=>{
 assert.equal((await ready({clock:false})).operation,undefined);const f=await ready();
 for(const mutate of [c=>c.accountId='other',c=>c.generation++,c=>c.source='untrusted',c=>c.reliable=false,c=>c.nowMs=c.latestMs+1]){const obs=observations(f.facts);mutate(obs.fort.gameTime);assert.equal(planAllianceFort(rebuild(f,obs),f.options).actions.length,0);}
 const midnight=Date.parse('2026-11-11T16:00:00Z');let now=midnight-5000;t.mock.method(Date,'now',()=>now);const g=await ready();assert.ok(g.operation);now+=6000;assert.equal(planAllianceFort(g.facts,g.options).actions.length,0);
 const h=await ready(),obs=observations(h.facts);obs.fort.gameTime.earliestMs=midnight-1;obs.fort.gameTime.latestMs=midnight+1;obs.fort.gameTime.nowMs=midnight;assert.equal(planAllianceFort(rebuild(h,obs),h.options).actions.length,0);
});
test('source provenance, input/derived stock or context tampering cannot produce action',async()=>{
 const f=await ready();for(const mutate of[x=>x.sourceFacts.fort.provenance.sourceAt=Date.now()-30001,x=>x.sourceFacts.fort.provenance.sourceAt=Date.now()+1000,x=>x.sourceFacts.fort.provenance.accountId='B',x=>x.sourceFacts.fort.provenance.generation++,x=>x.sourceFacts.fort.provenance.scope={kind:'CURRENT_RESPONSE_ONLY',key:'CITY:7'},x=>x.sourceFacts.fort.provenance.source='Fake',x=>x.sourceFacts.fort.provenance.reliability='UNKNOWN',x=>x.sourceFacts.fort.value.dailyDonateNum++,x=>x.inputs.fort.dailyDonateNum++,x=>x.dailyDonateNum++,x=>x.stock.set('耐火砖',999),x=>x.stock.set('forged-zero',0),x=>x.state.inventory[0].num++,x=>x.identityContext.guildId='2',x=>x.sourceClocks.fort.nowMs++]){const altered=rebuild(f,observations(f.facts));mutate(altered);assert.equal(planAllianceFort(altered,f.options).actions.length,0);}
 const obs=observations(f.facts);obs.fort.source='NotCityFort';assert.equal(planAllianceFort(rebuild(f,obs),f.options).actions.length,0);
});
test('survey identity changes, abort, stop, disconnect and late reads produce no writes',async()=>{
 for(const mutate of [(c)=>c.factContext.generation++,(c)=>c.factContext.accountId='B',(c)=>c.factContext.connectionId='new',(_c,p)=>p.playerId='2',(_c,p)=>p.worldId='4000017',(_c,p)=>p.guildId='2']){const f=fake(),options=opts();f.st.onRead=n=>{if(n==='AllItemRequest')mutate(f.client,options.player);};await assert.rejects(surveyAllianceFort(f.client,protocol,options),{code:'CANCELLED'});assert.equal(f.st.writes.length,0);}
 for(const mode of ['signal','stop','disconnect']){const f=fake(),controller=new AbortController(),stop={aborted:false};f.st.onRead=n=>{if(n!=='CityFortInfoRequest')return;queueMicrotask(()=>{if(mode==='signal')controller.abort();if(mode==='stop')stop.aborted=true;if(mode==='disconnect')f.client.connected=false;});return new Promise(()=>{});};await assert.rejects(surveyAllianceFort(f.client,protocol,{...opts(),signal:controller.signal,stop}),{code:'CANCELLED'});assert.equal(f.st.writes.length,0);}
});
test('unavailable protocol/read errors retain sanitized UNKNOWN evidence',async()=>{
 for(const n of ['GuildInfoRequest','GuildCityInfoRequest','CityFortInfoRequest','AllItemRequest','AllResourceRequest']){const f=await ready({overrides:{[n]:Error('token=do-not-keep')}});assert.equal(f.operation,undefined);assert.doesNotMatch(JSON.stringify(f.facts.notes),/do-not-keep/);}
 const f=fake(),p={...protocol};delete p.CityFortInfoResponse;const facts=await surveyAllianceFort(f.client,p,opts());assert.equal(planAllianceFort(facts,opts()).actions.length,0);assert.ok(facts.notes.some(n=>n.includes('PROTOCOL_UNAVAILABLE')));
});
test('typed reward plus full authority confirms, response alone or authority alone never confirms',async()=>{
 const f=await ready(),a=await after(f),result=verifyAllianceFort(f.operation,f.facts,a.after,a.response);assert.equal(result.confirmed,true);assert.equal(result.responseEvidence.responseProcess,'SHAPE_ONLY_SEMANTICS_UNPROVEN');assert.equal(verifyAllianceFort(f.operation,f.facts,f.facts,a.response).confirmed,false);for(const response of [null,{}, {success:true}])assert.equal(verifyAllianceFort(f.operation,f.facts,a.after,response).confirmed,false);
 // response.process is only shape-checked: neither an empty list nor a valid
 // sparse/delta list is promoted to full progress. Complete authority decides.
 for(const process of [[],[{itemId:'耐火砖',num:1}],[{itemId:'高温合金',num:0}]]){const r=wire('DonateFortResponse',{process,reward:{asset:[{type:0,id:'功勋',num:5000}]}});assert.equal(verifyAllianceFort(f.operation,f.facts,a.after,r).confirmed,true);}
});
for(const [label,mutate]of [['missing debit',s=>s.stock.set('耐火砖',20)],['double debit',s=>s.stock.set('耐火砖',16)],['missing merit',s=>s.stock.set('功勋',10)],['extra merit',s=>s.stock.set('功勋',5011)],['unrelated stock',s=>s.stock.set('技能书',8)],['resource changed',s=>s.resources[0].amount++],['league points changed',s=>s.resources[1].amount++],['count mismatch',s=>s.used++],['other material progress',s=>s.fort.process.push({itemId:'高温合金',num:1})],['target state changed',s=>s.fort.state=1],['optional field changed',s=>s.fort.effectTime++],['optional field disappeared',s=>delete s.fort.durability],['fort type changed',s=>s.fort.type='炮台'],['own city lost',s=>s.cities=[8]],['guild changed',s=>s.guildId='2']])test('unconfirmed authority: '+label,async()=>{const f=await ready(),a=await after(f,mutate);assert.equal(verifyAllianceFort(f.operation,f.facts,a.after,a.response).confirmed,false);});
test('typed response progress legality and exact item reward type/identity/count are mandatory',async()=>{
 const f=await ready(),a=await after(f);for(const response of [{reward:{asset:[{type:0,id:'功勋',num:5000}]}},{process:[]},{process:[],reward:{asset:[]}},{process:[{itemId:'RUBY',num:1}],reward:{asset:[{type:0,id:'功勋',num:5000}]}},{process:[{itemId:'耐火砖',num:1},{itemId:'耐火砖',num:1}],reward:{asset:[{type:0,id:'功勋',num:5000}]}},{process:[],reward:{asset:[{type:1,id:'功勋',num:5000}]}},{process:[],reward:{asset:[{type:0,id:'LEAGUE_POINT',num:5000}]}},{process:[],reward:{asset:[{type:0,id:'功勋',num:5001}]}},{process:[],reward:{asset:[Object.assign(Object.create({type:0}),{id:'功勋',num:5000})]}},{process:[],reward:{asset:[{type:0,id:'功勋',num:5000},{type:0,id:'技能书',num:1}]}}])assert.equal(verifyAllianceFort(f.operation,f.facts,a.after,response).confirmed,false);
});
test('forged requests/costs/identity/expectations and old or wrong-session rereads cannot confirm',async()=>{
 const f=await ready(),a=await after(f);for(const mutate of[o=>o.action.body.selectPackNum=1,o=>o.action.body.item.num++,o=>o.action.body.buy=false,o=>o.action.request='FinishFortRequest',o=>o.target.cityId=8,o=>o.costs=[],o=>o.costSource='free',o=>o.identity='forged',o=>o.beforeState.dailyDonateNum++,o=>o.expectedState.dailyDonateNum++,o=>o.reward.type=1,o=>o.parameters.num++]){const op=clone(f.operation);mutate(op);assert.equal(verifyAllianceFort(op,f.facts,a.after,a.response).confirmed,false);}
 const earlier=clone(a.after);earlier.sourceFacts.fort.provenance.sourceAt=f.facts.sourceFacts.fort.provenance.sourceAt-1;assert.equal(verifyAllianceFort(f.operation,f.facts,earlier,a.response).confirmed,false);
 const changed=clone(a.after);changed.identityContext.connectionId='other';changed.state.context.connectionId='other';assert.equal(verifyAllianceFort(f.operation,f.facts,changed,a.response).confirmed,false);
});
test('independent fort fund accrual is retained as evidence and is not fabricated as donation cost',async()=>{
 const f=await ready(),response=apply(f);f.st.overrides.CityFortInfoRequest={fort:f.st.fort,fortFund:999999,fundSpeed:8,dailyDonateNum:f.st.used};const a=await surveyAllianceFort(f.client,protocol,f.options);assert.equal(a.inputs.fort.fortFund,999999);assert.equal(verifyAllianceFort(f.operation,f.facts,a,response).confirmed,true);
});
test('dependency fingerprints cover all relevant config revisions and current enabled policy',()=>{
 const before=allianceFortDependencyVersions({config,moduleConfig:enabled});for(const name of ['WorldFortCfg','FortDonateMaterialCfg','FortParamCfg','FortSeasonUnlockCfg','ItemCfg']){const changed=cloneConfig();changed.tables[name].revision=2;assert.notDeepEqual(allianceFortDependencyVersions({config:changed,moduleConfig:enabled}),before);}
 const changed=cloneConfig();changed.tables.FarmCfg={revision:99,data:[]};assert.deepEqual(allianceFortDependencyVersions({config:changed,moduleConfig:enabled}),before);assert.notDeepEqual(allianceFortDependencyVersions({config,moduleConfig:{enabled:false,fort:true}}),before);
});

test('current trusted clock loss after wall/monotonic drift blocks old-day facts',async t=>{
 const midnight=Date.parse('2026-11-11T16:00:00Z');let wall=midnight-4000,mono=100;t.mock.method(Date,'now',()=>wall);
 const f=fake(),clock=trustedGameClock({accountId:'offline-A',generation:3,wallNow:()=>wall,monotonicNow:()=>mono});clock.markPing(wall);assert.equal(clock.observePong({clientTimestamp:wall,serverTimestamp:wall}).status,'TRUSTED');f.client.gameClock=clock;
 const facts=await surveyAllianceFort(f.client,protocol,opts()),first=planAllianceFort(facts,opts());assert.equal(first.actions.length,1);assert.equal(first.actions[0].reward.num,5000);
 wall+=3000;mono+=5000;assert.equal(clock.read().reason,'WALL_CLOCK_CHANGED');assert.equal(planAllianceFort(facts,opts()).actions.length,0);assert.equal(viewAllianceFort(facts,opts()).reliability.authority,false);assert.equal(f.st.writes.length,0);
});
test('every replan checks current session/clock; serialized facts need a fresh live binding',async()=>{
 for(const mutate of [f=>f.st.clock=false,f=>f.client.factContext.generation++,f=>f.client.factContext.accountId='B',f=>f.client.factContext.connectionId='new',f=>f.options.player.guildId='2',f=>f.options.player.worldId='4000017',f=>f.options.player.playerId='2',f=>f.client.connected=false]){const f=await ready();assert.ok(f.operation);mutate(f);assert.equal(planAllianceFort(f.facts,f.options).actions.length,0);assert.equal(f.st.writes.length,0);}
 const f=await ready(),unbound=parseAllianceFortObservations(observations(f.facts),{context:f.facts.identityContext,parameters,config,available:Object.keys(protocol)});assert.equal(unbound.fort.cityId,7);assert.equal(planAllianceFort(unbound,f.options).actions.length,0);assert.equal(planAllianceFort(clone(f.facts),f.options).actions.length,0);assert.equal(planAllianceFort(rebuild(f,observations(f.facts)),f.options).actions.length,1);
});
test('post-write verification cannot confirm after current clock invalidation',async()=>{const f=await ready(),a=await after(f);assert.equal(verifyAllianceFort(f.operation,f.facts,a.after,a.response).confirmed,true);f.st.clock=false;assert.equal(verifyAllianceFort(f.operation,f.facts,a.after,a.response).confirmed,false);});
