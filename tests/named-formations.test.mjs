import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createNamedFormationStore, NAMED_FORMATION_SCOPE } from '../src/named-formations.mjs';
import { createStateFact } from '../src/state-facts.mjs';
import { catalogFrom, planFormation } from '../src/formation.mjs';
const NOW=1800000000000,enabled={enabled:true},pos=(heroId,x,y)=>({heroId,pos:{x,y}});
const formation=()=>({presetId:1,heroPositions:[pos('ranged',4,4),pos('tank',1,3),pos('mage',1,5)],petUid:'9007199254740993'});
const layout2=()=>({presetId:2,heroPositions:[pos('ranged',2,4),pos('tank',5,5),pos('mage',5,1)],petUid:'9007199254740993'});
function facts(current=formation()) {
 const cfg={tables:{HeroCfg:{data:[{id:'ranged',career:'射手'},{id:'tank',career:'坦克'},{id:'mage',career:'法师'}]},FormationHeroNumCfg:{data:[{heroNum:3,mainlineStage:0}]},FormationTypePositionCfg:{data:[...[[4,4],[1,3],[1,5]].map(position=>({id:1,position})),...[[2,4],[5,5],[5,1]].map(position=>({id:2,position}))]}}};
 return {module:'formation',formation:structuredClone(current),ownedHeroIds:['ranged','tank','mage'],unlockedPresetIds:[1,2],catalog:catalogFrom(cfg,{mainlineStage:1}),reliability:{formation:true,heroes:true,presets:true,config:true},writeProtocolAvailable:true,stock:new Map(),stockReliable:true};
}
const fact=(value=formation(),extra={})=>createStateFact(value,{accountId:'a',generation:7,source:'GetFormationResponse',sourceAt:NOW,scope:NAMED_FORMATION_SCOPE,reliable:true,...extra});
function fixture(t,extra={}) {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cw-named-')),file=path.join(dir,'named.json');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const opts={file,wallNow:()=>NOW,...extra};return {file,dir,store:createNamedFormationStore(opts),restart:()=>createNamedFormationStore(opts)};}
const save=(store,name='Team One',value=formation(),extra={})=>store.save('a',{name,formationFact:fact(value,extra)},{generation:7});
const apply=(store,entry,extra={})=>store.prepareApply('a',entry.id,{expectedRevision:entry.revision,currentFormationFact:fact(),facts:facts(),generation:7,moduleConfig:enabled,...extra});
const code=value=>error=>error.code===value,unavailable=code('NAMED_FORMATION_UNAVAILABLE'),conflict=code('NAMED_FORMATION_VERSION_CONFLICT');
const reseal=entry=>{const {integrityDigest,...data}=entry;entry.integrityDigest=createHash('sha256').update(JSON.stringify(data)).digest('hex');};
// All files, account IDs and source facts below are synthetic. No game transport exists.
test('complete team and provenance persist exactly and restart only restores read-only data',t=>{
 const {store,restart,file}=fixture(t),source=fact(),before=structuredClone(source),entry=store.save('a',{name:'Team One',formationFact:source},{generation:7});
 assert.deepEqual(source,before);assert.deepEqual(entry.formation,formation());assert.deepEqual(entry.source,source.provenance);assert.equal(entry.mode,'MAINLINE');assert.equal(entry.revision,1);assert.equal(entry.accountId,'a');assert.equal(entry.resumable,false);assert.equal(entry.requiresFreshPlan,true);assert.equal(entry.requiresAuthorization,true);assert.deepEqual(restart().list('a'),[entry]);assert.deepEqual(store.list('other'),[]);assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file,'utf8'))).sort(),['accounts','version']);
});
test('returned data cannot mutate persistent team and names remain account-isolated',t=>{
 const {store}=fixture(t),entry=save(store);entry.formation.petUid=0;store.list('a')[0].name='tampered';assert.deepEqual(store.list('a')[0].formation,formation());assert.equal(store.list('a')[0].name,'Team One');assert.throws(()=>save(store),code('NAMED_FORMATION_NAME_CONFLICT'));
 const other=store.save('b',{name:'Team One',formationFact:fact(formation(),{accountId:'b'})},{generation:7});assert.equal(store.list('b')[0].id,other.id);
});
test('rename overwrite and delete require exact latest revision and restart correctly',t=>{
 const {store,restart}=fixture(t),first=save(store),renamed=store.rename('a',first.id,{name:'Renamed',expectedRevision:1});assert.equal(renamed.revision,2);
 for(const fn of [()=>store.rename('a',first.id,{name:'Again',expectedRevision:1}),()=>store.overwrite('a',first.id,{expectedRevision:1,formationFact:fact(layout2())},{generation:7}),()=>store.delete('a',first.id,{expectedRevision:1})])assert.throws(fn,conflict);
 const replaced=store.overwrite('a',first.id,{expectedRevision:2,formationFact:fact(layout2())},{generation:7});assert.equal(replaced.revision,3);assert.equal(replaced.name,'Renamed');assert.deepEqual(restart().list('a'),[replaced]);assert.equal(store.delete('a',first.id,{expectedRevision:3}).deleted,true);assert.deepEqual(restart().list('a'),[]);
});
test('name conflicts missing versions and unknown mutation fields preserve original bytes',t=>{
 const {store,file}=fixture(t),entry=save(store);save(store,'Second');const before=fs.readFileSync(file,'utf8');
 for(const fn of [()=>store.rename('a',entry.id,{name:'Second',expectedRevision:1}),()=>store.rename('a',entry.id,{name:'A'}),()=>store.rename('a',entry.id,{name:'A',expectedRevision:1,mode:'ARENA'}),()=>store.overwrite('a',entry.id,{expectedRevision:1,formation:layout2()},{generation:7}),()=>store.delete('a',entry.id,{expectedRevision:1,force:true})])assert.throws(fn);assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('cross-account IDs cannot mutate or apply archives',t=>{
 const {store}=fixture(t),entry=save(store);for(const fn of [()=>store.rename('b',entry.id,{name:'B',expectedRevision:1}),()=>store.delete('b',entry.id,{expectedRevision:1}),()=>store.overwrite('b',entry.id,{expectedRevision:1,formationFact:fact(formation(),{accountId:'b'})},{generation:7}),()=>store.prepareApply('b',entry.id,{expectedRevision:1})])assert.throws(fn,code('NAMED_FORMATION_NOT_FOUND'));
});
test('prototype-looking account IDs remain own JSON data',t=>{
 const {store,restart}=fixture(t),entry=store.save('__proto__',{name:'constructor',formationFact:fact(formation(),{accountId:'__proto__'})},{generation:7});assert.deepEqual(restart().list('__proto__'),[entry]);assert.deepEqual(store.list('a'),[]);assert.equal({}.polluted,undefined);
});
test('incomplete unknown duplicate and empty team fields never persist',t=>{
 const {store}=fixture(t),absent=formation();delete absent.petUid;
 for(const value of [absent,{...formation(),petUid:null},{...formation(),heroPositions:[]},{...formation(),request:'fake'},{...formation(),heroPositions:[pos('tank',1,3),pos('tank',1,5)]},{...formation(),heroPositions:[pos('tank',1,3),pos('mage',1,3)]},{...formation(),heroPositions:[{...pos('tank',1,3),extra:true}]},{...formation(),heroPositions:[{heroId:'tank',pos:{x:1,y:3,z:0}}]}])assert.throws(()=>save(store,'Bad',value));assert.deepEqual(store.list('a'),[]);
});
test('int64 pet precision survives restart and apply without accepting pet parameters',t=>{
 const {store,restart}=fixture(t);for(const [i,petUid] of [0,-1,'-9223372036854775808','9223372036854775807','9007199254740993'].entries()){const current={...formation(),petUid},entry=save(store,'UID '+i,current),preview=apply(restart(),entry,{currentFormationFact:fact(current),facts:facts(current)});assert.equal(String(entry.formation.petUid),String(petUid));assert.equal(String(preview.preservedPetUid),String(petUid));assert.equal(Object.hasOwn(preview.parameters,'petUid'),false);}
 for(const petUid of [9007199254740992,'9223372036854775808','-9223372036854775809',1.5,'01'])assert.throws(()=>save(store,'Bad UID',{...formation(),petUid}));
});
test('source account generation scope reliability and freshness must be explicit',t=>{
 const {store}=fixture(t);for(const extra of [{accountId:'b'},{generation:6},{source:''},{source:'SaveFormationResponse'},{sourceAt:NOW-30001},{sourceAt:NOW+1},{scope:{kind:'ACCOUNT'}},{scope:{kind:'ENTITY',key:'ARENA:1'}},{reliable:false}])assert.throws(()=>save(store,'Bad Source',formation(),extra));
 assert.throws(()=>store.save('a',{name:'Bad',formationFact:fact()}));const absent=fact();delete absent.provenance.serverTime;assert.throws(()=>store.save('a',{name:'Bad',formationFact:absent},{generation:7}));assert.throws(()=>store.save('a',{name:'Bad',formationFact:formation()},{generation:7}));assert.deepEqual(store.list('a'),[]);
});
test('HTTP style mode request permit and raw formation fields cannot become trusted facts',t=>{
 const {store}=fixture(t);for(const extra of [{mode:'ARENA'},{permit:'fake'},{request:'SaveFormationRequest'},{formation:formation()}])assert.throws(()=>store.save('a',{name:'Bad',formationFact:fact(),...extra},{generation:7}));
});
test('credential-bearing names and hero identifiers never persist',t=>{
 const {store}=fixture(t,{secrets:()=>['synthetic-known-secret']});for(const name of ['',' padded','x'.repeat(81),'line\nname','token=synthetic','synthetic-known-secret'])assert.throws(()=>save(store,name));assert.throws(()=>save(store,'Bad ID',{...formation(),heroPositions:[pos('synthetic-known-secret',1,3)]}));assert.deepEqual(store.list('a'),[]);
});
test('prepareApply delegates eligibility to real planner and returns parameters without action or permit',t=>{
 const {store,restart}=fixture(t),entry=save(store,'Other layout',layout2()),current=facts(),before=structuredClone(current),preview=apply(restart(),entry,{facts:current});assert.deepEqual(current,before);assert.deepEqual(preview.parameters,{presetId:2,heroPositions:layout2().heroPositions});assert.deepEqual(Object.keys(preview).sort(),['accountId','id','mode','parameters','preservedPetUid','requiresAuthorization','requiresFreshPlan','requiresFreshSurvey','resumable','revision'].sort());assert.equal(preview.requiresFreshSurvey,true);assert.equal(preview.requiresAuthorization,true);assert.equal(preview.resumable,false);
 const plan=planFormation(facts(),{parameters:preview.parameters,moduleConfig:enabled});assert.equal(plan.actions.length,1);assert.equal(plan.actions[0].action.body.formation.petUid,formation().petUid);assert.deepEqual(restart().list('a'),[entry]);
});
test('explicit reapply works but stored team confers no executable authority',t=>{
 const {store}=fixture(t),preview=apply(store,save(store));assert.deepEqual(preview.parameters,{presetId:1,heroPositions:formation().heroPositions});assert.equal(Object.hasOwn(preview,'action'),false);assert.equal(preview.requiresAuthorization,true);
});
test('pet mismatch unknown pet and unrelated current survey block application',t=>{
 const {store}=fixture(t),entry=save(store),different={...formation(),petUid:0};assert.throws(()=>apply(store,entry,{currentFormationFact:fact(different),facts:facts(different)}),code('NAMED_FORMATION_PET_MISMATCH'));const absent=formation();delete absent.petUid;assert.throws(()=>apply(store,entry,{currentFormationFact:fact(absent),facts:facts(absent)}));assert.throws(()=>apply(store,entry,{facts:facts(layout2())}),code('NAMED_FORMATION_SOURCE_BLOCKED'));assert.throws(()=>apply(store,entry,{facts:{...facts(),module:'arena'}}),code('NAMED_FORMATION_SOURCE_BLOCKED'));
});
test('stale archive revision and stale or wrong-generation current facts block independently',t=>{
 const {store}=fixture(t),entry=save(store);store.rename('a',entry.id,{name:'Renamed',expectedRevision:1});assert.throws(()=>apply(store,entry),conflict);for(const extra of [{sourceAt:NOW-30001},{generation:6},{accountId:'b'},{reliable:false}])assert.throws(()=>apply(store,store.list('a')[0],{currentFormationFact:fact(formation(),extra)}),code('NAMED_FORMATION_SOURCE_BLOCKED'));
});
test('missing heroes do not silently shrink archived team',t=>{
 const {store}=fixture(t),entry=save(store),current=facts();current.ownedHeroIds=['tank','mage'];assert.throws(()=>apply(store,entry,{facts:current}),code('NAMED_FORMATION_APPLY_BLOCKED'));assert.deepEqual(store.list('a')[0].formation,formation());
});
test('locked unreliable and off-template layouts are rejected by existing planner',t=>{
 const {store}=fixture(t),entry=save(store,'Layout2',layout2()),locked=facts();locked.unlockedPresetIds=[1];assert.throws(()=>apply(store,entry,{facts:locked}),code('NAMED_FORMATION_APPLY_BLOCKED'));const unreliable=facts();unreliable.catalog.layouts[1].reliable=false;assert.throws(()=>apply(store,entry,{facts:unreliable}),code('NAMED_FORMATION_APPLY_BLOCKED'));const off=save(store,'Off template',{...layout2(),heroPositions:[pos('tank',9,9)]});assert.throws(()=>apply(store,off),code('NAMED_FORMATION_APPLY_BLOCKED'));
});
test('module ownership population protocol and current-state gates remain authoritative',t=>{
 const {store}=fixture(t),entry=save(store);assert.throws(()=>apply(store,entry,{moduleConfig:undefined}),code('NAMED_FORMATION_APPLY_BLOCKED'));assert.throws(()=>apply(store,entry,{moduleConfig:{enabled:false}}),code('NAMED_FORMATION_APPLY_BLOCKED'));
 for(const mutate of [f=>{f.reliability.heroes=false;},f=>{f.catalog.maxHeroes=2;},f=>{f.writeProtocolAvailable=false;},f=>{f.reliability.formation=false;},f=>{f.catalog.heroes[0].reliable=false;}]){const current=facts();mutate(current);assert.throws(()=>apply(store,entry,{facts:current}),code('NAMED_FORMATION_APPLY_BLOCKED'));}
});
test('bad JSON and unsupported versions fail closed without changing bytes',t=>{
 for(const contents of ['{bad',JSON.stringify({version:2,accounts:{}}),JSON.stringify({version:1,accounts:{},permit:'fake'}),JSON.stringify({accounts:{}})]){const {store,file}=fixture(t);fs.writeFileSync(file,contents);assert.throws(()=>store.list('a'),unavailable);assert.throws(()=>save(store),unavailable);assert.equal(fs.readFileSync(file,'utf8'),contents);}
});
test('entry corruption mode duplicate identity and account-source contamination fail closed',t=>{
 for(const mutate of [raw=>{raw.accounts.a[0].formation.petUid=0;},raw=>{raw.accounts.a[0].mode='ARENA';reseal(raw.accounts.a[0]);},raw=>{raw.accounts.a[0].source.accountId='b';reseal(raw.accounts.a[0]);},raw=>{raw.accounts.a.push(structuredClone(raw.accounts.a[0]));},raw=>{raw.accounts.a[0].revision=0;reseal(raw.accounts.a[0]);},raw=>{raw.accounts.a[0].source.source='MyFormationPresetResponse';reseal(raw.accounts.a[0]);}]){const {store,file}=fixture(t);save(store);const raw=JSON.parse(fs.readFileSync(file,'utf8'));mutate(raw);fs.writeFileSync(file,JSON.stringify(raw));const before=fs.readFileSync(file,'utf8');assert.throws(()=>store.list('a'),unavailable);assert.throws(()=>save(store,'Second'),unavailable);assert.equal(fs.readFileSync(file,'utf8'),before);}
});
test('known file disappearance cannot recreate empty store',t=>{
 const {store,file}=fixture(t);save(store);fs.unlinkSync(file);assert.throws(()=>store.list('a'),unavailable);assert.throws(()=>save(store,'Second'),unavailable);assert.equal(fs.existsSync(file),false);
});
test('directory and oversize paths fail closed',t=>{
 for(const kind of ['directory','oversize']){const {store,file}=fixture(t);if(kind==='directory')fs.mkdirSync(file);else fs.writeFileSync(file,' '.repeat(2*1024*1024+1));assert.throws(()=>store.list('a'),unavailable);assert.throws(()=>save(store),unavailable);}
});
test('atomic mutation fsyncs before rename and removes temporary files',t=>{
 const calls=[],io=new Proxy(fs,{get(target,key){if(['writeFileSync','fsyncSync','renameSync'].includes(key))return(...args)=>{calls.push(key);return target[key](...args);};return target[key];}}),{store,dir}=fixture(t,{fileSystem:io});save(store);assert.deepEqual(calls,['writeFileSync','fsyncSync','renameSync']);assert.deepEqual(fs.readdirSync(dir),['named.json']);
});
test('write fsync and rename failures preserve old archive and clean temp',t=>{
 for(const method of ['writeFileSync','fsyncSync','renameSync']){let armed=false;const io=new Proxy(fs,{get(target,key){if(key===method)return(...args)=>{if(armed)throw Object.assign(new Error('synthetic IO'),{code:'EIO'});return target[key](...args);};return target[key];}}),{store,file,dir}=fixture(t,{fileSystem:io}),entry=save(store),before=fs.readFileSync(file,'utf8');armed=true;assert.throws(()=>store.rename('a',entry.id,{name:'Renamed',expectedRevision:1}),unavailable);assert.equal(fs.readFileSync(file,'utf8'),before);assert.deepEqual(fs.readdirSync(dir),['named.json']);}
});
test('writer fence loss before rename preserves original archive',t=>{
 let checks=0,failAt=Infinity;const {store,file,dir}=fixture(t,{assertWriter:()=>{if(++checks===failAt)throw Object.assign(new Error('lost'),{code:'WRITER_LOST'});}}),entry=save(store),before=fs.readFileSync(file,'utf8');failAt=checks+4;assert.throws(()=>store.rename('a',entry.id,{name:'Renamed',expectedRevision:1}),code('WRITER_LOST'));assert.equal(fs.readFileSync(file,'utf8'),before);assert.deepEqual(fs.readdirSync(dir),['named.json']);
});
test('initial writer loss stops every mutation while reads remain available',t=>{
 let lost=false;const {store,file}=fixture(t,{assertWriter:()=>{if(lost)throw Object.assign(new Error('lost'),{code:'WRITER_LOST'});}}),entry=save(store),before=fs.readFileSync(file,'utf8');lost=true;
 for(const fn of [()=>save(store,'Second'),()=>store.rename('a',entry.id,{name:'New',expectedRevision:1}),()=>store.overwrite('a',entry.id,{expectedRevision:1,formationFact:fact()},{generation:7}),()=>store.delete('a',entry.id,{expectedRevision:1})])assert.throws(fn,code('WRITER_LOST'));assert.equal(store.list('a').length,1);assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('cancellation blocks all operations and fsync-window abort preserves original bytes',t=>{
 const {store,file}=fixture(t),entry=save(store),ctrl=new AbortController();ctrl.abort();const signal=ctrl.signal,before=fs.readFileSync(file,'utf8');
 for(const fn of [()=>store.list('a',{signal}),()=>store.save('a',{name:'Second',formationFact:fact()},{generation:7,signal}),()=>store.rename('a',entry.id,{name:'New',expectedRevision:1},{signal}),()=>store.overwrite('a',entry.id,{expectedRevision:1,formationFact:fact()},{generation:7,signal}),()=>store.delete('a',entry.id,{expectedRevision:1},{signal}),()=>apply(store,entry,{signal})])assert.throws(fn,code('CANCELLED'));
 const middle=new AbortController(),io=new Proxy(fs,{get(target,key){if(key==='fsyncSync')return(...args)=>{const result=target[key](...args);middle.abort();return result;};return target[key];}}),interrupted=createNamedFormationStore({file,wallNow:()=>NOW,fileSystem:io});assert.throws(()=>interrupted.rename('a',entry.id,{name:'New',expectedRevision:1},{signal:middle.signal}),code('CANCELLED'));assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('interleaved archive replacement is detected before atomic rename',t=>{
 let writer,armed=false;const io=new Proxy(fs,{get(target,key){if(key==='fsyncSync')return(...args)=>{const result=target[key](...args);if(armed){armed=false;writer();}return result;};return target[key];}}),{store,file}=fixture(t,{fileSystem:io}),entry=save(store),other=createNamedFormationStore({file,wallNow:()=>NOW});writer=()=>other.rename('a',entry.id,{name:'Other',expectedRevision:1});armed=true;assert.throws(()=>store.rename('a',entry.id,{name:'Stale',expectedRevision:1}),conflict);assert.equal(store.list('a')[0].name,'Other');assert.equal(store.list('a')[0].revision,2);
});
test('clock rollback or invalid time cannot overwrite a valid archive',t=>{
 let now=NOW;const {store,file}=fixture(t,{wallNow:()=>now}),entry=save(store),before=fs.readFileSync(file,'utf8');now=NOW-1;assert.throws(()=>store.rename('a',entry.id,{name:'Backward',expectedRevision:1}));now=Infinity;assert.throws(()=>store.rename('a',entry.id,{name:'Invalid',expectedRevision:1}));assert.equal(fs.readFileSync(file,'utf8'),before);
});